/**
 * The Supabase provider pair — a drop-in for the mock behind the same interfaces
 * (docs/ACCOUNTS.md §2, §6). Identity is Supabase Auth; the household goes through the two
 * Edge Functions and PostgREST under RLS. The app never holds a service-role key, never
 * reads `invites`, never sends a household_id as an authorisation input, and never sees a
 * password beyond handing it to Auth.
 *
 * GOOGLE is Supabase's own OAuth in the phone's browser sheet (`auth/browserSignIn.ts`; the owner,
 * 2026-09-27: "add google"), offered only once the owner has switched the project's Google
 * provider on and said so to the build (`EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED`). APPLE on an iPhone
 * is native (`auth/appleSignIn.ts` → `signInWithIdToken`), restored 2026-10-02 so Google can stand
 * beside it under guideline 4.8 (`EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED`). Apple on Android is the
 * quiet browser path and needs a Services ID (`EXPO_PUBLIC_APPLE_ANDROID_SIGN_IN_ENABLED`).
 * `socialSignIn` is what AUTH reads to draw a button; each method still answers
 * `provider_not_configured` when it cannot do the work, as the backstop. Nothing here invents a
 * credential: Google's client id/secret and Apple's Services secret live in the Supabase project,
 * never in the app (CLAUDE.md rule 11).
 */
import { BRAND } from '@nibblecue/brand';
import {
  CHILD_PHOTO_BUCKET,
  ENTRY_PHOTO_BUCKET,
  ENTRY_PHOTO_CONTENT_TYPE,
  ENTRY_PHOTO_URL_TTL_SECONDS,
  entryPhotoPath,
  CHILD_PHOTO_CONTENT_TYPE,
  CHILD_PHOTO_URL_TTL_SECONDS,
  ChildNameSchema,
  HouseholdNameSchema,
  childPhotoPath,
  dueDateWithinWindow,
  IsoDateSchema,
  isMemberAvatarId,
  pretermWeeks,
  isRole,
  MEMBER_PHOTO_BUCKET,
  MEMBER_PHOTO_CONTENT_TYPE,
  MEMBER_PHOTO_URL_TTL_SECONDS,
  memberPhotoPath,
  normalizeInviteCode,
  rowGrantsPlus,
  type BootstrapPayload,
  type ModuleId,
  type PlanRowInput,
  type Role,
} from '@nibblecue/core';
import type { Database } from '@nibblecue/db';
import {
  FunctionsFetchError,
  FunctionsHttpError,
  FunctionsRelayError,
  type Session as SbSession,
  type SupabaseClient,
} from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { fragmentOf } from '../../lib/url';
import { signInWithAppleNative } from '../appleSignIn';
import { signInThroughBrowser, type AuthBrowser } from '../browserSignIn';
import { checkAnswerOf } from '../checkAnswer';
import { authFailureCodeOf, type AuthErrorShape } from '../failureCode';
import { functionAnswer } from '../functionAnswer';
import { authLinkProblem, exchangeProblem } from '../linkError';
import { linkExchange } from '../linkExchange';
import { socialMethodsOf } from '../socialSignIn';
import { getSupabaseClient } from '../../supabase/client';
import { supabaseSessionStorage } from '../keychain';
import { classifyAuthError, type RefreshOutcome, type Session } from '../session';
import { systemAuthBrowser } from '../systemBrowser';
import {
  AuthFailure,
  type AcceptInviteResult,
  type PlanIdeasResult,
  type AccountsApi,
  type AccountState,
  type AddChildInput,
  type AddChildResult,
  type UpdateChildInput,
  type UpdateChildResult,
  type ChildPhotoSaved,
  type EntryPhotoStored,
  type ApiFailure,
  type AuthEvent,
  type AuthLinkResult,
  type AuthProvider,
  type CheckInviteResult,
  type CreateHouseholdResult,
  type DeviceRegistration,
  type InviteCreated,
  type LeaveHouseholdResult,
  type MemberPictureSaved,
  type MemberRow,
  type Outcome,
  type RecordBirthResult,
  type ReminderSlotClaim,
  type RestoreHouseholdResult,
  type SignUpResult,
  type SocialMethod,
} from './types';

/** Where Auth sends the parent back to: the app's own scheme, decided in brand.json. */
const AUTH_CALLBACK = `${BRAND.urlScheme}://auth/callback`;
const RECOVERY_CALLBACK = `${BRAND.urlScheme}://auth/recovery`;

type Client = SupabaseClient<Database>;

function toSession(s: SbSession): Session {
  return {
    user: {
      id: s.user.id,
      email: s.user.email ?? null,
      emailVerified: !!s.user.email_confirmed_at,
    },
    accessToken: s.access_token,
    refreshToken: s.refresh_token,
    expiresAt: s.expires_at ? s.expires_at * 1000 : null,
  };
}

/** An auth-js error as the screens' failure, classified by the pure `failureCode.ts`. */
function toFailure(err: AuthErrorShape | null | undefined): AuthFailure {
  const code = authFailureCodeOf(err);
  return new AuthFailure(code, code === 'unknown' ? err?.message : undefined);
}

/** What this build may offer beyond email, decided by the build's environment (`env.ts`). */
export interface SupabaseSocialOptions {
  /** The project's Google provider is on (`EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED`). */
  google: boolean;
  /** Sign in with Apple on an iPhone (`EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED`). */
  apple: boolean;
  /**
   * The quiet Android Apple path (`EXPO_PUBLIC_APPLE_ANDROID_SIGN_IN_ENABLED`). Needs the
   * Services ID and secret (LAUNCH_GUIDE Step 5.10); off until then so no broken button.
   */
  appleAndroid: boolean;
  /** The browser sheet; the phone's own unless a caller hands in another. */
  browser?: AuthBrowser;
}

/**
 * One row of `nibble_my_plan()` (docs/SERVER.md; the CuddleCue repository's migrations 0162 and
 * 0163). `source` is `'welcome'` for the 14-day trial (0163) and `'store'` otherwise; a server the
 * migration has not reached yet sends no `source`, which reads as a store row.
 */
interface NibblePlanRow {
  household_id: string;
  status: string | null;
  period_ends_at: string | null;
  store: string | null;
  source?: string | null;
  trial_available?: boolean | null;
}

/** A NibbleCue Plus row in the shape the plan code reads: the trial reads as CuddleCue's preview
 *  does (WELCOME with its days, then FREE), every other row as a store row. */
function nibbleRowInput(row: NibblePlanRow): PlanRowInput | null {
  if (row.status === null) return null;
  return {
    status: row.status as PlanRowInput['status'],
    source: row.source === 'welcome' ? 'welcome' : row.store === 'promo' ? 'promo' : 'store',
    current_period_end: row.period_ends_at,
  };
}

class SupabaseAuthProvider implements AuthProvider {
  readonly name = 'supabase' as const;
  /** Google and Apple when the owner has switched each on for this phone (see the header). */
  readonly socialSignIn: ReadonlySet<SocialMethod>;
  private readonly browser: AuthBrowser;
  /**
   * A GOOGLE SIGN-IN IS WAITING IN THE BROWSER SHEET. On Android the sheet's return address reaches
   * the app as an ordinary link too, so `AuthContext` hands it to `handleAuthLink` at the same
   * moment the sheet hands it to `signInWithGoogle` — and a one-time code exchanged twice fails the
   * second time, which would put a "that link did not work" notice over a sign-in that worked.
   * While this is set, the return address belongs to the sheet. If Android was killed while the
   * sheet was open, the flag went with the process and the link is exchanged the ordinary way,
   * with the verifier the keychain kept.
   */
  private browserSheetOpen = false;

  constructor(
    private readonly client: Client,
    social: SupabaseSocialOptions = { google: false, apple: false, appleAndroid: false },
  ) {
    this.socialSignIn = socialMethodsOf(social, Platform.OS);
    this.browser = social.browser ?? systemAuthBrowser;
  }

  async restoreSession(): Promise<Session | null> {
    // straight from the keystore-backed storage: no network, no refresh, no spinner
    const raw = await supabaseSessionStorage.getItem();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Partial<SbSession>;
      if (!parsed.access_token || !parsed.refresh_token || !parsed.user) return null;
      return toSession(parsed as SbSession);
    } catch {
      return null;
    }
  }

  async refreshSession(): Promise<RefreshOutcome> {
    const cached = await this.restoreSession();
    if (!cached) return { kind: 'none' };
    try {
      const { data, error } = await this.client.auth.refreshSession({
        refresh_token: cached.refreshToken,
      });
      if (error) return { kind: classifyAuthError(error) };
      return data.session ? { kind: 'ok', session: toSession(data.session) } : { kind: 'invalid' };
    } catch (err) {
      return { kind: classifyAuthError(err) };
    }
  }

  async signInWithPassword(email: string, password: string): Promise<Session> {
    const { data, error } = await this.client.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw toFailure(error);
    return toSession(data.session);
  }

  async signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await this.client.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: AUTH_CALLBACK },
    });
    if (error) throw toFailure(error);
    // with confirmations on, an address that already exists comes back as a user with no identities
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0)
      throw new AuthFailure('email_taken');
    return {
      session: data.session ? toSession(data.session) : null,
      needsVerification: !data.session,
    };
  }

  async sendPasswordReset(email: string): Promise<void> {
    const { error } = await this.client.auth.resetPasswordForEmail(email, {
      redirectTo: RECOVERY_CALLBACK,
    });
    // the reply to the parent is the same whether or not the address exists; only a limit or no network surfaces
    if (error && (error.status === 429 || (error.status ?? 0) === 0)) throw toFailure(error);
  }

  async hasPassword(): Promise<boolean> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) return true;
    const identities = data.user.identities ?? [];
    // unknown shape: require the current password rather than skip it
    if (identities.length === 0) return true;
    return identities.some(identity => identity.provider === 'email');
  }

  async updatePassword(newPassword: string, currentPassword?: string): Promise<void> {
    // logged-in changes re-authenticate first. A recovery session omits the current password.
    if (currentPassword !== undefined) {
      const email = (await this.restoreSession())?.user.email;
      if (!email) throw new AuthFailure('invalid_credentials');
      await this.signInWithPassword(email, currentPassword);
    }
    const { error } = await this.client.auth.updateUser({ password: newPassword });
    if (error) throw toFailure(error);
    // every other session ends; this one stays (docs/ACCOUNTS.md §3.6)
    await this.client.auth.signOut({ scope: 'others' });
  }

  async resendVerification(email: string): Promise<void> {
    const { error } = await this.client.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: AUTH_CALLBACK },
    });
    if (error && error.status === 429) throw toFailure(error);
  }

  async signInWithApple(): Promise<Session> {
    // the backstop: AUTH draws no Apple button unless it is in `socialSignIn`
    if (!this.socialSignIn.has('apple'))
      throw new AuthFailure('provider_not_configured', 'Sign in with Apple is not set up yet');
    if (Platform.OS === 'ios') {
      const session = await signInWithAppleNative({ auth: this.client.auth });
      return toSession(session);
    }
    // Android: Apple's web page through the same browser sheet as Google (Services ID path)
    const session = await signInThroughBrowser({
      auth: this.client.auth,
      browser: this.browser,
      provider: 'apple',
      returnUrl: AUTH_CALLBACK,
      onWaiting: waiting => {
        this.browserSheetOpen = waiting;
      },
    });
    return toSession(session);
  }

  async signInWithGoogle(): Promise<Session> {
    // the backstop: AUTH draws no Google button unless it is in `socialSignIn`
    if (!this.socialSignIn.has('google'))
      throw new AuthFailure('provider_not_configured', 'Google sign-in is not set up yet');
    const session = await signInThroughBrowser({
      auth: this.client.auth,
      browser: this.browser,
      provider: 'google',
      returnUrl: AUTH_CALLBACK,
      onWaiting: waiting => {
        this.browserSheetOpen = waiting;
      },
    });
    return toSession(session);
  }

  async signOut(scope: 'local' | 'global'): Promise<void> {
    const { error } = await this.client.auth.signOut({ scope });
    if (error && (error.status ?? 0) === 0) {
      // offline: the local session still goes (teardown deletes the keystore entry anyway)
      await supabaseSessionStorage.removeItem();
    }
  }

  async handleAuthLink(url: string): Promise<AuthLinkResult> {
    if (!url.startsWith(`${BRAND.urlScheme}://auth/`)) return { kind: 'ignored' };
    // the Google sheet's own return address, which `signInWithGoogle` is exchanging (see the field)
    if (this.browserSheetOpen && url.startsWith(AUTH_CALLBACK)) return { kind: 'ignored' };
    // Auth came back with a reason instead of a code — expired, already used, replaced by a newer
    // email. It used to fall through to `ignored` and the app sat there saying nothing.
    const problem = authLinkProblem(url);
    if (problem) {
      // THE CONFIRMATION ALREADY LANDED (the owner, 2026-10-02): the email client often opens the
      // link once (prefetch or a first tap), Auth confirms the address, and the return the parent
      // sees carries `otp_expired` / already-used. Checking the session recovers a live sign-in
      // instead of trapping them on Verify with "expired" when signing in with the password works.
      if (problem.flow === 'sign_in') {
        const recovered = await this.sessionIfEmailConfirmed();
        if (recovered) return recovered;
      }
      return { kind: 'link_error', problem };
    }
    const recovery = url.startsWith(RECOVERY_CALLBACK);
    const exchange = linkExchange(url);
    const hash = fragmentOf(url);
    let session: SbSession | null = null;
    try {
      if (exchange) {
        // with the link's own flow, so an older email is exchanged with its own verifier
        const { data, error } = await this.client.auth.exchangeCodeForSession(
          exchange.code,
          exchange.flowId ? { flowId: exchange.flowId } : undefined,
        );
        if (error) {
          // same race: this phone (or a prefetch) already exchanged the code; a confirmed session
          // is success, not "expired"
          if (!recovery) {
            const recovered = await this.sessionIfEmailConfirmed();
            if (recovered) return recovered;
          }
          return { kind: 'link_error', problem: exchangeProblem(url, error) };
        }
        session = data.session;
      } else if (hash.access_token && hash.refresh_token) {
        /*
          A LINK THAT CARRIES ITS OWN TOKENS NEVER REPLACES A SIGNED-IN ACCOUNT (the WP15 security
          review, 2026-10-08). Anyone can make a `cuddlecue://auth/…#access_token=…` link from their
          own account and send it; tapped on a phone already signed in, `setSession` would sign
          that phone into the sender's account, and the parent's next entries would go to the
          sender's family. The code form above cannot be forged this way (its verifier lives on
          this phone), and every email this app sends uses it; this older form is honored only on
          a phone with nobody signed in, where it is a sign-in the person asked for.
        */
        if ((await this.restoreSession()) !== null) return { kind: 'ignored' };
        const { data, error } = await this.client.auth.setSession({
          access_token: hash.access_token,
          refresh_token: hash.refresh_token,
        });
        if (error) {
          if (!recovery) {
            const recovered = await this.sessionIfEmailConfirmed();
            if (recovered) return recovered;
          }
          return { kind: 'link_error', problem: exchangeProblem(url, error) };
        }
        session = data.session;
      }
    } catch (err) {
      // supabase-js returns its own errors; what it throws is the transport or a bug, and either
      // way the parent is owed a sentence rather than an app that opened and did nothing
      if (!recovery) {
        const recovered = await this.sessionIfEmailConfirmed();
        if (recovered) return recovered;
      }
      return { kind: 'link_error', problem: exchangeProblem(url, err) };
    }
    if (!session) return { kind: 'ignored' };
    const type = hash.type;
    return {
      kind: recovery || type === 'recovery' ? 'recovery' : 'signed_in',
      session: toSession(session),
    };
  }

  /**
   * A LIVE SESSION WHOSE EMAIL IS ALREADY CONFIRMED, or null. Used when Auth says the link expired
   * or was already used but this phone (or a prefetch) already finished the confirmation.
   */
  private async sessionIfEmailConfirmed(): Promise<Extract<
    AuthLinkResult,
    { kind: 'signed_in' }
  > | null> {
    const { data } = await this.client.auth.getSession();
    if (data.session?.user.email_confirmed_at)
      return { kind: 'signed_in', session: toSession(data.session) };
    // ask the server: getSession can be empty while the user row is already confirmed after a
    // link that returned an error instead of tokens
    const { data: userData } = await this.client.auth.getUser();
    if (!userData.user?.email_confirmed_at) return null;
    const again = await this.client.auth.getSession();
    if (again.data.session) return { kind: 'signed_in', session: toSession(again.data.session) };
    return null;
  }

  onAuthStateChange(listener: (event: AuthEvent, session: Session | null) => void): () => void {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        listener(event, session ? toSession(session) : null);
      }
    });
    return () => data.subscription.unsubscribe();
  }
}

/* ================================================================ AccountsApi */

const failure = (status: number, error: string, detail?: string): ApiFailure => ({
  ok: false,
  status,
  error,
  ...(detail ? { detail } : {}),
});

/**
 * A Storage error → the same shape. Supabase Storage answers with its own `statusCode` string
 * rather than a Postgres code, and the one that matters is 403: the bucket's policy refused a
 * caregiver's upload. Anything else is reported as a transport failure, which is what the
 * sheet's copy already distinguishes between.
 */
function storageFailure(error: { message: string; statusCode?: string | undefined }): ApiFailure {
  const status = Number(error.statusCode ?? 0);
  return failure(
    Number.isFinite(status) && status > 0 ? status : 0,
    'storage_error',
    error.message,
  );
}

/** A PostgREST error → the same shape the Edge Functions answer with. */
function postgrestFailure(error: {
  code: string;
  message: string;
  details: string | null;
}): ApiFailure {
  const map: Record<string, number> = {
    CC401: 401,
    CC403: 403,
    CC404: 404,
    CC409: 409,
    CC422: 422,
    CC429: 429,
  };
  const status = map[error.code];
  if (status) return failure(status, error.message, error.details ?? undefined);
  if (error.code === '42501') return failure(403, 'forbidden');
  if (error.code === 'PGRST301') return failure(401, 'unauthenticated');
  return failure(500, 'server_error');
}

async function functionFailure(error: unknown): Promise<ApiFailure> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    // our function's `{ error, detail }` or the platform's own `{ code, message }` when no
    // function ran (`functionAnswer.ts` says why both)
    return functionAnswer(res.status, await res.json().catch(() => ({})));
  }
  if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError)
    throw new AuthFailure('offline', 'No connection');
  return failure(500, 'server_error');
}

class SupabaseAccountsApi implements AccountsApi {
  constructor(
    private readonly client: Client,
    private readonly url: string,
    private readonly anonKey: string,
  ) {}

  private async uid(): Promise<string | null> {
    const raw = await supabaseSessionStorage.getItem();
    if (!raw) return null;
    try {
      return (JSON.parse(raw) as { user?: { id?: string } }).user?.id ?? null;
    } catch {
      return null;
    }
  }

  /** Server time from the REST gateway's Date header — the anchor for every plan display. */
  private async serverNow(accessToken: string | null): Promise<number> {
    try {
      const res = await fetch(`${this.url}/rest/v1/profiles?select=id&limit=0`, {
        headers: {
          apikey: this.anonKey,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
      });
      const date = res.headers.get('date');
      const t = date ? Date.parse(date) : NaN;
      return Number.isNaN(t) ? Date.now() : t;
    } catch {
      return Date.now();
    }
  }

  async createHousehold(payload: BootstrapPayload): Promise<CreateHouseholdResult> {
    const { data, error } = await this.client.functions.invoke<
      Omit<Extract<CreateHouseholdResult, { ok: true }>, 'ok'>
    >('create-household', { body: payload });
    if (error) return functionFailure(error);
    if (!data) return failure(500, 'server_error');
    return { ok: true, ...data };
  }

  async startNibbleTrial(
    householdId: string,
  ): Promise<{ ok: true; granted: boolean } | ApiFailure> {
    // cuddlecue-app's `nibble_start_trial` (branch `nibblecue`); typed loosely until the generated
    // database types carry it, as `nibble_my_plan` was
    const rpc = this.client.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;
    const { data, error } = await rpc('nibble_start_trial', { p_household: householdId });
    if (error)
      return failure(error.code === '42883' ? 404 : 500, 'trial_unavailable', error.message);
    const granted = (data as { granted?: unknown } | null)?.granted === true;
    return { ok: true, granted };
  }

  async planIdeas(body: Record<string, unknown>): Promise<PlanIdeasResult> {
    const { data, error } = await this.client.functions.invoke<Record<string, unknown>>(
      'nibble-plan-ideas',
      { body },
    );
    if (error) return functionFailure(error);
    if (!data) return failure(500, 'server_error');
    return { ok: true, draft: data, cached: data['cached'] === true };
  }

  async acceptInvite(input: {
    code?: string;
    token?: string;
    display_name?: string;
  }): Promise<AcceptInviteResult> {
    const { data, error } = await this.client.functions.invoke<
      Omit<Extract<AcceptInviteResult, { ok: true }>, 'ok'>
    >('accept-invite', { body: input });
    if (error) {
      const f = await functionFailure(error);
      if (f.status === 404)
        return {
          ok: false,
          status: 404,
          error: 'invalid_invite',
          attempts_left: (f as { attempts_left?: number }).attempts_left ?? 0,
        };
      return f;
    }
    if (!data) return failure(500, 'server_error');
    return { ok: true, ...data };
  }

  /**
   * `check_invite` (0139) straight through PostgREST, and the one call this app makes signed out
   * besides Auth: with no session supabase-js sends the project's publishable key and the database
   * runs it as `anon`, which may run this function and nothing else in `public`. Signed in, it runs
   * as the person and spends their redemption limiter. What came back is read by `checkAnswer.ts`,
   * where a project without the function reads as `unavailable` and never as a dead code.
   */
  async checkInvite(input: { code?: string; token?: string }): Promise<CheckInviteResult> {
    const r = await this.client.rpc('check_invite', {
      ...(input.code !== undefined ? { p_code: normalizeInviteCode(input.code) } : {}),
      ...(input.token !== undefined ? { p_token: input.token } : {}),
    });
    return checkAnswerOf({ data: r.data, error: r.error, status: r.status });
  }

  /**
   * The caller's own profile row, by the id in their own session (`profiles_self_write`: the
   * policy holds `id = auth.uid()` whatever the phone sends). A count of none is a session that
   * could not see its row, which is refused rather than called done.
   */
  async setDisplayName(name: string): Promise<Outcome> {
    const uid = await this.uid();
    if (!uid) return failure(401, 'unauthenticated');
    const { error, count } = await this.client
      .from('profiles')
      .update({ display_name: name.trim() }, { count: 'exact' })
      .eq('id', uid);
    if (error) {
      // no answer at all is the network, as every other account call reads it
      if (!error.code) throw new AuthFailure('offline', error.message);
      return postgrestFailure(error);
    }
    return count === 0 ? failure(403, 'forbidden') : { ok: true };
  }

  async bootstrapState(): Promise<AccountState> {
    const uid = await this.uid();
    const raw = await supabaseSessionStorage.getItem();
    const token = raw
      ? ((JSON.parse(raw) as { access_token?: string }).access_token ?? null)
      : null;
    const serverNow = await this.serverNow(token);
    const empty: AccountState = {
      profile: null,
      memberships: [],
      children: [],
      modules: [],
      entitlement: null,
      serverNow,
      deletionPending: null,
    };
    if (!uid) return empty;
    // NibbleCue Plus, read on its own and FORGIVINGLY: a project the NibbleCue migrations have not
    // reached answers "function does not exist", which must read as the free plan and never as
    // offline (the rest of this read is CuddleCue's, and decides whether the app can start)
    const nibblePlan = Promise.resolve(this.client.rpc('nibble_my_plan')).then(
      r => (r.error ? [] : ((r.data ?? []) as NibblePlanRow[])),
      () => [] as NibblePlanRow[],
    );
    const [profile, members, children, modules, entitlement, deletion] = await Promise.all([
      // THE PERSON'S OWN ROW, WHOLE, and the one read here that names no columns. The picture's
      // (0148) are read below as `?? null`; named in the select, a project the migration has not
      // reached yet would answer "column does not exist", and this bootstrap would read that as
      // offline on every start until the deploy. Whole, the row simply has no picture yet.
      this.client.from('profiles').select('*').eq('id', uid).maybeSingle(),
      this.client
        .from('household_members')
        .select(
          // THE HOUSEHOLD'S ROW, WHOLE, for the profile's reason above: `welcome_waits_for_birth`
          // (0150) named in the select would make a project the migration has not reached yet
          // answer "column does not exist", read here as offline on every start
          'household_id, role, joined_at, households ( * )',
        )
        .eq('user_id', uid)
        .is('removed_at', null),
      this.client
        .from('children')
        .select('id, household_id, name, birth_date, due_date, photo_path, photo_updated_at')
        .is('deleted_at', null)
        .order('sort_order'),
      this.client.from('module_settings').select('household_id, module_id, enabled'),
      // THE HOUSEHOLD'S PLAN, not this person's purchase. This used to be
      // `subscription_entitlements` filtered to `user_id = uid`, which meant one parent could
      // buy Plus and the other would still meet a paywall on their own phone — in a product
      // whose two free seats are the whole point (migration 0101, owner decision 2026-09-22).
      // The function answers per household and reveals no billing row: `entitlement_read` is
      // untouched, so nobody sees another member's store, product id or period.
      this.client.rpc('my_household_plans'),
      this.client
        .from('deletion_queue')
        .select('purge_after')
        .eq('user_id', uid)
        .is('purged_at', null)
        .maybeSingle(),
    ]);
    const firstError = [profile, members, children, modules, entitlement, deletion].find(
      r => r.error,
    )?.error;
    if (firstError) {
      if (postgrestFailure(firstError).status === 401) return empty;
      throw new AuthFailure('offline', firstError.message);
    }
    const memberships = (members.data ?? []).map(m => {
      const h = Array.isArray(m.households) ? m.households[0] : m.households;
      return {
        household_id: m.household_id,
        role: m.role,
        household_name: h?.name ?? '',
        welcome_expires_at: h?.welcome_expires_at ?? null,
        heard_from: h?.heard_from ?? null,
        home_time_zone: h?.home_time_zone ?? null,
        // when the household began, for the schedule's first day (`Membership` says why here)
        household_created_at: h?.created_at ?? null,
        joined_at: m.joined_at ?? null,
        // absent on a project before 0150, where no household waits for a birth
        welcome_waits_for_birth: h?.welcome_waits_for_birth ?? false,
      };
    });
    // the plan for the household this app is SHOWING, which is `memberships[0]` — the same one
    // every other surface reads. A caregiver in two households gets each household's own answer
    // out of the one call, so switching household later needs no extra round trip.
    const shown = memberships[0]?.household_id ?? null;
    const plan = (entitlement.data ?? []).find(r => r.household_id === shown) ?? null;
    const ent: PlanRowInput | null = plan
      ? {
          status: plan.status,
          source: plan.source,
          current_period_end: plan.current_period_end,
        }
      : null;
    // every family's plan, for the switcher: the same rows, keyed by household
    const plans: Record<string, PlanRowInput | null> = {};
    for (const m of memberships) {
      const row = (entitlement.data ?? []).find(r => r.household_id === m.household_id);
      plans[m.household_id] = row
        ? { status: row.status, source: row.source, current_period_end: row.current_period_end }
        : null;
    }
    const nibbleRows = await nibblePlan;
    const nibblePlans: Record<string, PlanRowInput | null> = {};
    for (const m of memberships) {
      const row = nibbleRows.find(r => r.household_id === m.household_id);
      nibblePlans[m.household_id] = row ? nibbleRowInput(row) : null;
    }
    return {
      plans,
      nibblePlans,
      profile: profile.data
        ? {
            id: profile.data.id,
            display_name: profile.data.display_name,
            email: profile.data.email,
            terms_version: profile.data.terms_version,
            // the person's own picture (0148): absent on a project before it, read as none
            avatar_path: profile.data.avatar_path ?? null,
            avatar_preset: profile.data.avatar_preset ?? null,
            avatar_updated_at: profile.data.avatar_updated_at ?? null,
          }
        : null,
      memberships,
      children: (children.data ?? []).map(c => ({
        id: c.id,
        household_id: c.household_id,
        name: c.name,
        birth_date: c.birth_date,
        due_date: c.due_date,
        photo_path: c.photo_path,
        photo_updated_at: c.photo_updated_at,
      })),
      modules: (modules.data ?? []).map(m => ({
        household_id: m.household_id,
        module_id: m.module_id as ModuleId,
        enabled: m.enabled,
      })),
      entitlement: ent,
      serverNow,
      deletionPending: deletion.data ? { purge_at: deletion.data.purge_after } : null,
    };
  }

  async createInvite(
    householdId: string,
    role: Exclude<Role, 'OWNER'>,
    kind: 'CODE' | 'LINK',
    seatHours?: number,
  ): Promise<InviteCreated> {
    // `create_timed_invite` wraps `create_invite` and adds the one guard the permanent path
    // does not need: an invite OUTLIVES the member who made it, so a temporary member may not
    // make one at all. The permanent call is left on its own function, untouched and still
    // granted by its own signature.
    const { data, error } =
      seatHours === undefined
        ? await this.client.rpc('create_invite', {
            p_household: householdId,
            p_role: role,
            p_kind: kind,
          })
        : await this.client.rpc('create_timed_invite', {
            p_household: householdId,
            p_role: role,
            p_kind: kind,
            p_seat_hours: seatHours,
          });
    if (error) return postgrestFailure(error);
    const r = data as {
      kind: 'CODE' | 'LINK';
      secret: string;
      expires_at: string;
      seat_hours?: number;
    };
    const seat = r.seat_hours === undefined ? {} : { seat_hours: r.seat_hours };
    return r.kind === 'CODE'
      ? { ok: true, kind: 'CODE', code: r.secret, expires_at: r.expires_at, ...seat }
      : {
          ok: true,
          kind: 'LINK',
          url: `${BRAND.urlScheme}://invite/${r.secret}`,
          token: r.secret,
          expires_at: r.expires_at,
          ...seat,
        };
  }

  /**
   * WHO IS HERE NOW. Through `household_roster` rather than the table, because "here now" has a
   * clause in it — `removed_at is null` AND the seat has not lapsed — and a definition spread
   * across clients is a definition one of them will forget. The function is the single place it
   * is written, and it is the same one `app.is_member` enforces.
   */
  async listMembers(householdId: string): Promise<MemberRow[]> {
    const uid = await this.uid();
    const { data, error } = await this.client.rpc('household_roster', {
      p_household: householdId,
    });
    if (error || !data) return [];
    return data.map(m => ({
      user_id: m.user_id,
      role: m.role,
      joined_at: m.joined_at,
      display_name: m.display_name ?? '',
      email: m.email ?? null,
      is_self: m.user_id === uid,
      expires_at: m.expires_at ?? null,
      // each member's picture (0148), from the roster this page already reads
      avatar_path: m.avatar_path ?? null,
      avatar_preset: m.avatar_preset ?? null,
      avatar_updated_at: m.avatar_updated_at ?? null,
    }));
  }

  async setRole(householdId: string, userId: string, role: Role): Promise<Outcome> {
    if (role === 'OWNER') return failure(422, 'validation_error', 'role');
    const { error, count } = await this.client
      .from('household_members')
      .update({ role }, { count: 'exact' })
      .eq('household_id', householdId)
      .eq('user_id', userId)
      .is('removed_at', null);
    if (error) return postgrestFailure(error);
    return count === 0 ? failure(403, 'forbidden') : { ok: true };
  }

  async removeMember(householdId: string, userId: string): Promise<Outcome> {
    const { error, count } = await this.client
      .from('household_members')
      .update({ removed_at: new Date().toISOString() }, { count: 'exact' })
      .eq('household_id', householdId)
      .eq('user_id', userId)
      .is('removed_at', null);
    if (error) return postgrestFailure(error);
    return count === 0 ? failure(403, 'forbidden') : { ok: true };
  }

  async transferOwnership(householdId: string, newOwnerId: string): Promise<Outcome> {
    const { error } = await this.client.rpc('transfer_ownership', {
      p_household: householdId,
      p_new_owner: newOwnerId,
    });
    return error ? postgrestFailure(error) : { ok: true };
  }

  /**
   * `leave_household_alone` (0143) straight through PostgREST, as the person: the server counts who
   * is left under a lock and answers `CC409 not_alone` while anybody else is live in it. The
   * household id is only what the server checks the caller's membership of (CLAUDE.md rule 9).
   */
  async leaveHousehold(householdId: string): Promise<LeaveHouseholdResult> {
    const { data, error } = await this.client.rpc('leave_household_alone', {
      p_household: householdId,
    });
    if (error) {
      // no answer at all is the network, as every other account call reads it
      if (!error.code) throw new AuthFailure('offline', error.message);
      return postgrestFailure(error);
    }
    const r = (data ?? {}) as {
      household_id?: string;
      household_name?: string;
      closed_at?: string;
      purge_after?: string;
    };
    if (!r.household_id || !r.purge_after) return failure(500, 'server_error');
    return {
      ok: true,
      household_id: r.household_id,
      household_name: r.household_name ?? '',
      closed_at: r.closed_at ?? new Date().toISOString(),
      purge_after: r.purge_after,
      restorable: true,
    };
  }

  /** `restore_household` (0143): only the person who closed it, only before its purge date. */
  async restoreHousehold(householdId: string): Promise<RestoreHouseholdResult> {
    const { data, error } = await this.client.rpc('restore_household', {
      p_household: householdId,
    });
    if (error) {
      if (!error.code) throw new AuthFailure('offline', error.message);
      return postgrestFailure(error);
    }
    const r = (data ?? {}) as { household_id?: string; household_name?: string; role?: string };
    if (!r.household_id || !r.role || !isRole(r.role)) return failure(500, 'server_error');
    return {
      ok: true,
      household_id: r.household_id,
      household_name: r.household_name ?? '',
      role: r.role,
    };
  }

  /**
   * The caller's own rows (`entitlement_read`: `user_id = auth.uid()`), whatever the phone sends —
   * so nobody's billing but their own is read. A store row that gives Plus now, by core's rule.
   */
  async storeSubscription(): Promise<{ ok: true; active: boolean } | ApiFailure> {
    const uid = await this.uid();
    if (!uid) return failure(401, 'unauthenticated');
    const { data, error } = await this.client
      .from('subscription_entitlements')
      .select('source, status, current_period_end')
      .eq('user_id', uid)
      .eq('source', 'store')
      .is('revoked_at', null);
    if (error) {
      if (!error.code) throw new AuthFailure('offline', error.message);
      return postgrestFailure(error);
    }
    const now = Date.now();
    return { ok: true, active: (data ?? []).some(row => rowGrantsPlus(row, now)) };
  }

  async setHomeTimeZone(householdId: string, zone: string): Promise<Outcome> {
    const { error } = await this.client.rpc('set_home_time_zone', {
      p_household: householdId,
      p_zone: zone,
    });
    return error ? postgrestFailure(error) : { ok: true };
  }

  async renameHousehold(householdId: string, name: string): Promise<Outcome> {
    // the phone refuses a name setup would refuse, before the round trip; the function checks again
    const named = HouseholdNameSchema.safeParse(name);
    if (!named.success) return failure(422, 'validation_error', 'name');
    const { error } = await this.client.rpc('rename_household', {
      p_household: householdId,
      p_name: named.data,
    });
    return error ? postgrestFailure(error) : { ok: true };
  }

  async addChild(householdId: string, input: AddChildInput): Promise<AddChildResult> {
    // a plain insert under RLS, the same shape as the module toggle below: `children_write`
    // checks app.can_admin(household_id) on the server, so a caregiver's call is a 42501 here
    // whatever the client believed about its role
    const { data: siblings } = await this.client
      .from('children')
      .select('sort_order')
      .eq('household_id', householdId)
      .is('deleted_at', null);
    const sort_order = (siblings ?? []).reduce((n, r) => Math.max(n, r.sort_order + 1), 0);
    const { data, error } = await this.client
      .from('children')
      .insert({
        household_id: householdId,
        name: input.name,
        birth_date: input.birth_date,
        due_date: input.due_date,
        sort_order,
      })
      .select('id, household_id, name, birth_date, due_date, photo_path, photo_updated_at')
      .single();
    if (error) return postgrestFailure(error);
    return { ok: true, child: data };
  }

  async updateChild(
    householdId: string,
    childId: string,
    input: UpdateChildInput,
  ): Promise<UpdateChildResult> {
    // THE HOUSEHOLD'S TODAY IS THE PHONE'S. Checking the date against UTC here would refuse a
    // baby born this morning in a zone ahead of UTC, the bug migration 0133 closed for setup.
    // The sheet runs `checkChildCorrection` on that clock before it calls; this only refuses a
    // shape the row cannot hold, and a birth date on a baby who is still on the way.
    const named = ChildNameSchema.safeParse(input.name);
    if (!named.success) return failure(422, 'validation_error', 'child.name');
    const { data: existing, error: readError } = await this.client
      .from('children')
      .select('birth_date, due_date')
      .eq('id', childId)
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .maybeSingle();
    if (readError) return postgrestFailure(readError);
    if (!existing) return failure(404, 'not_found');
    const onTheWay = existing.birth_date === null;
    if (onTheWay && input.birth_date !== null) {
      return failure(422, 'validation_error', 'child.birth_date');
    }
    if (!onTheWay) {
      if (input.birth_date === null || !IsoDateSchema.safeParse(input.birth_date).success) {
        return failure(422, 'validation_error', 'child.birth_date');
      }
      if (existing.due_date !== null && !dueDateWithinWindow(input.birth_date, existing.due_date)) {
        return failure(422, 'validation_error', 'child.birth_date');
      }
    }
    const patch = onTheWay
      ? { name: named.data }
      : {
          name: named.data,
          birth_date: input.birth_date,
          preterm_weeks: pretermWeeks(input.birth_date as string, existing.due_date),
        };
    const { data, error } = await this.client
      .from('children')
      .update(patch)
      .eq('id', childId)
      .eq('household_id', householdId)
      .is('deleted_at', null)
      .select('id, household_id, name, birth_date, due_date, photo_path, photo_updated_at')
      .maybeSingle();
    if (error) return postgrestFailure(error);
    // RLS answers with no row rather than an error when the policy refuses the write
    if (!data) return failure(403, 'forbidden');
    return { ok: true, child: data };
  }

  async recordBirth(
    childId: string,
    birthDate: string,
    name: string | null,
  ): Promise<RecordBirthResult> {
    // the server decides who may say it and whether the 14 days start (0150): the household is
    // read from the child's own row, never sent
    const { data, error } = await this.client.rpc('record_birth', {
      p_child: childId,
      p_birth_date: birthDate,
      ...(name === null ? {} : { p_name: name }),
    });
    if (error) {
      if (!error.code) throw new AuthFailure('offline', error.message);
      return postgrestFailure(error);
    }
    const r = data as Omit<Extract<RecordBirthResult, { ok: true }>, 'ok'>;
    return { ok: true, ...r };
  }

  /* --------------------------------------------------------------- the baby's picture */

  /**
   * THE UPLOAD COMES FIRST AND THE ROW SECOND, which is the safe order of the two.
   *
   * Both writes sit behind the SAME predicate — `child_photo_write` and `children_write` are
   * each `app.can_admin(household)` — so an upload that lands is an update that will land too,
   * and the only interesting failure is the other way round. If the row update did fail, the
   * bucket holds an object nothing points at: invisible, overwritten by the next `upsert`, and
   * removed with the household. The reverse order would stamp a row with a path that has no
   * object behind it, and every device in the household would then ask for a picture that is
   * not there — a phantom photo is worse than an orphan file.
   */
  async setChildPhoto(
    householdId: string,
    childId: string,
    jpeg: Uint8Array,
  ): Promise<{ ok: true; photo: ChildPhotoSaved } | ApiFailure> {
    const path = childPhotoPath(householdId, childId);
    const { error: upload } = await this.client.storage
      .from(CHILD_PHOTO_BUCKET)
      // `upsert` because there is one photo per child and it is REPLACED, never accumulated
      .upload(path, jpeg as unknown as ArrayBuffer, {
        upsert: true,
        contentType: CHILD_PHOTO_CONTENT_TYPE,
      });
    if (upload) return storageFailure(upload);
    const photo_updated_at = new Date().toISOString();
    const { error, count } = await this.client
      .from('children')
      .update({ photo_path: path, photo_updated_at }, { count: 'exact' })
      .eq('id', childId)
      .eq('household_id', householdId)
      .is('deleted_at', null);
    if (error) return postgrestFailure(error);
    // RLS returns a zero count rather than an error when the policy refuses the row
    if (count === 0) return failure(403, 'forbidden');
    return { ok: true, photo: { photo_path: path, photo_updated_at } };
  }

  /**
   * The row is nulled FIRST here, and that is the same rule read the other way: after this
   * call no device asks for the object, so deleting it cannot leave anyone looking at a
   * picture that is gone. A delete that fails leaves an orphan, which the next upload
   * overwrites and household deletion sweeps.
   */
  async clearChildPhoto(householdId: string, childId: string): Promise<Outcome> {
    const { error, count } = await this.client
      .from('children')
      .update({ photo_path: null, photo_updated_at: null }, { count: 'exact' })
      .eq('id', childId)
      .eq('household_id', householdId)
      .is('deleted_at', null);
    if (error) return postgrestFailure(error);
    if (count === 0) return failure(403, 'forbidden');
    await this.client.storage
      .from(CHILD_PHOTO_BUCKET)
      .remove([childPhotoPath(householdId, childId)]);
    return { ok: true };
  }

  /** Ten minutes, signed. `createSignedUrl` is the only way in — the bucket is not public. */
  async childPhotoUrl(path: string): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(CHILD_PHOTO_BUCKET)
      .createSignedUrl(path, CHILD_PHOTO_URL_TTL_SECONDS);
    return error || !data ? null : data.signedUrl;
  }

  /* ------------------------------------------------------- the member's own picture (0148) */

  /**
   * The upload first and the row second, the child photo's order (`setChildPhoto` works through
   * why). The path is the caller's own from the session: the bucket's write policies accept
   * `<auth.uid()>/picture.jpg` and nothing else, so no argument could aim it anywhere.
   */
  async setMemberPhoto(
    jpeg: Uint8Array,
  ): Promise<{ ok: true; picture: MemberPictureSaved } | ApiFailure> {
    const uid = await this.uid();
    if (!uid) return failure(401, 'unauthenticated');
    const path = memberPhotoPath(uid);
    const { error: upload } = await this.client.storage
      .from(MEMBER_PHOTO_BUCKET)
      // one picture per person, REPLACED in place; the stamp the row takes is what says it changed
      .upload(path, jpeg as unknown as ArrayBuffer, {
        upsert: true,
        contentType: MEMBER_PHOTO_CONTENT_TYPE,
      });
    if (upload) return storageFailure(upload);
    return this.pictureRow(uid, { avatar_path: path, avatar_preset: null });
  }

  /** A drawing is the column alone; a photo it replaces goes after the row stops naming it. */
  async setMemberDrawing(
    id: string,
  ): Promise<{ ok: true; picture: MemberPictureSaved } | ApiFailure> {
    if (!isMemberAvatarId(id)) return failure(422, 'validation_error', 'avatar_preset');
    const uid = await this.uid();
    if (!uid) return failure(401, 'unauthenticated');
    const r = await this.pictureRow(uid, { avatar_path: null, avatar_preset: id });
    if (r.ok) await this.dropMemberPhoto(uid);
    return r;
  }

  async clearMemberPicture(): Promise<{ ok: true; picture: MemberPictureSaved } | ApiFailure> {
    const uid = await this.uid();
    if (!uid) return failure(401, 'unauthenticated');
    const r = await this.pictureRow(uid, { avatar_path: null, avatar_preset: null });
    if (r.ok) await this.dropMemberPhoto(uid);
    return r;
  }

  /** Ten minutes, signed; `member_photo_read` decides whether there is anything to sign. */
  async memberPhotoUrl(path: string): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(MEMBER_PHOTO_BUCKET)
      .createSignedUrl(path, MEMBER_PHOTO_URL_TTL_SECONDS);
    return error || !data ? null : data.signedUrl;
  }

  /**
   * The caller's own row, under `profiles_self_write`, handed back with the stamp the server wrote
   * (`profiles_picture_stamp` stamps any update that names a picture column). No row back is a
   * session that could not see itself: refused, never called done.
   */
  private async pictureRow(
    uid: string,
    columns: { avatar_path: string | null; avatar_preset: string | null },
  ): Promise<{ ok: true; picture: MemberPictureSaved } | ApiFailure> {
    const { data, error } = await this.client
      .from('profiles')
      .update(columns)
      .eq('id', uid)
      .select('avatar_path, avatar_preset, avatar_updated_at')
      .maybeSingle();
    if (error) {
      // no answer at all is the network, as every other account call reads it
      if (!error.code) throw new AuthFailure('offline', error.message);
      return postgrestFailure(error);
    }
    if (!data) return failure(403, 'forbidden');
    return {
      ok: true,
      picture: {
        avatar_path: data.avatar_path,
        avatar_preset: data.avatar_preset,
        avatar_updated_at: data.avatar_updated_at,
      },
    };
  }

  /**
   * The photo's object, once no row names it. A delete that fails leaves an orphan nobody asks
   * for, which the next upload overwrites and the account purge empties (0148): never a failure
   * the person has to see, since the change they asked for has already landed.
   */
  private async dropMemberPhoto(uid: string): Promise<void> {
    try {
      await this.client.storage.from(MEMBER_PHOTO_BUCKET).remove([memberPhotoPath(uid)]);
    } catch {
      // an orphan, as above
    }
  }

  /**
   * THE OBJECT ONLY. `setChildPhoto` above uploads and then updates its row in one call, and the
   * comment there works through the ordering that makes an orphan preferable to a phantom. This
   * method deliberately does NOT do the second half: the entry it belongs to was written
   * local-first with no network, and its two columns go through the outbox like every other
   * correction (`data/entryPhotos.ts`, and `EntryPhotoStored` in types.ts).
   *
   * So the ordering argument is unchanged and the guarantee is stronger: the row is never
   * stamped until this upload has actually returned, which is the only way a device can be sure
   * the object is there before it starts telling other devices to fetch it.
   */
  async setEntryPhoto(
    householdId: string,
    activityId: string,
    jpeg: Uint8Array,
  ): Promise<{ ok: true; photo: EntryPhotoStored } | ApiFailure> {
    const path = entryPhotoPath(householdId, activityId);
    const { error } = await this.client.storage
      .from(ENTRY_PHOTO_BUCKET)
      // one photo per entry, REPLACED rather than accumulated — a parent who retakes it twice
      // leaves one object, not three
      .upload(path, jpeg as unknown as ArrayBuffer, {
        upsert: true,
        contentType: ENTRY_PHOTO_CONTENT_TYPE,
      });
    if (error) return storageFailure(error);
    return { ok: true, photo: { photo_path: path, photo_updated_at: new Date().toISOString() } };
  }

  /**
   * Remove the object. The caller nulls the columns through the outbox first, for the same
   * reason `clearChildPhoto` nulls them before deleting: after that, no device asks for this
   * object, so losing the delete leaves an orphan rather than a broken picture.
   */
  async clearEntryPhoto(householdId: string, activityId: string): Promise<Outcome> {
    const { error } = await this.client.storage
      .from(ENTRY_PHOTO_BUCKET)
      .remove([entryPhotoPath(householdId, activityId)]);
    return error ? storageFailure(error) : { ok: true };
  }

  async entryPhotoUrl(path: string): Promise<string | null> {
    const { data, error } = await this.client.storage
      .from(ENTRY_PHOTO_BUCKET)
      .createSignedUrl(path, ENTRY_PHOTO_URL_TTL_SECONDS);
    return error || !data ? null : data.signedUrl;
  }

  async setModuleEnabled(
    householdId: string,
    moduleId: ModuleId,
    enabled: boolean,
  ): Promise<Outcome> {
    const uid = await this.uid();
    const { error, count } = await this.client
      .from('module_settings')
      .update(
        { enabled, updated_by: uid, updated_at: new Date().toISOString() },
        { count: 'exact' },
      )
      .eq('household_id', householdId)
      .eq('module_id', moduleId);
    if (error) return postgrestFailure(error);
    return count === 0 ? failure(403, 'forbidden') : { ok: true };
  }

  async acceptTerms(version: number): Promise<Outcome> {
    const { error } = await this.client.rpc('accept_terms', { p_version: version });
    return error ? postgrestFailure(error) : { ok: true };
  }

  async requestAccountDeletion(): Promise<{ ok: true; purge_at: string } | ApiFailure> {
    const { data, error } = await this.client.rpc('request_account_deletion');
    if (error) return postgrestFailure(error);
    const r = data as { purge_at?: string; purge_after?: string };
    return { ok: true, purge_at: r.purge_at ?? r.purge_after ?? '' };
  }

  async cancelAccountDeletion(): Promise<{ ok: true; cancelled: boolean } | ApiFailure> {
    // the session the client holds is the one the server judges: 0131 cancels only a deletion
    // requested before that session began, which a sign-in's is and the asking phone's is not
    const { data, error } = await this.client.rpc('cancel_account_deletion');
    if (error) return postgrestFailure(error);
    // an answer without `cancelled` (a server before 0131) is read as nothing canceled: the call
    // did its work there, and the parent is simply not told
    const answer = data as { cancelled?: unknown } | null;
    return { ok: true, cancelled: answer?.cancelled === true };
  }

  async registerDevice(d: DeviceRegistration): Promise<Outcome> {
    const { error } = await this.client.rpc('register_device', {
      p_device_id: d.deviceId,
      p_platform: d.platform,
      // the generated types say `string` for every argument; the function takes a null token
      // (a phone that has none yet) and a null version, and stores them as null
      p_push_token: d.pushToken as string,
      p_push_provider: d.pushProvider as string,
      p_app_version: d.appVersion as string,
      p_os_version: d.osVersion as string,
      p_time_zone: d.timeZone as string,
      p_clock_24h: d.clock24h,
      p_volume_unit: d.volumeUnit,
    });
    return error ? postgrestFailure(error) : { ok: true };
  }

  async forgetDevice(deviceId: string): Promise<Outcome> {
    const { error } = await this.client.rpc('forget_device', { p_device_id: deviceId });
    return error ? postgrestFailure(error) : { ok: true };
  }

  async claimLocalReminders(
    deviceId: string,
    slots: readonly ReminderSlotClaim[],
  ): Promise<Outcome> {
    const { error } = await this.client.rpc('claim_local_reminders', {
      p_device_id: deviceId,
      p_slots: slots.map(s => ({
        rule_id: s.ruleId,
        scheduled_for: new Date(s.scheduledForMs).toISOString(),
      })),
    });
    return error ? postgrestFailure(error) : { ok: true };
  }

  async syncSubscription(): Promise<Outcome> {
    // the body names nobody: the function reads the caller from the token (`store_sync_subject`)
    const { error } = await this.client.functions.invoke('sync-subscription', { body: {} });
    return error ? functionFailure(error) : { ok: true };
  }
}

export function createSupabaseProviders(
  url: string,
  anonKey: string,
  social: SupabaseSocialOptions = { google: false, apple: false, appleAndroid: false },
): { auth: AuthProvider; api: AccountsApi } {
  // One client per project, shared with `SupabaseSyncApi` (../../supabase/client.ts). A second
  // `createClient` here would be a second GoTrue over the same keychain entry, with two refresh
  // timers racing one refresh token; the return shape is unchanged.
  const client = getSupabaseClient(url, anonKey);
  return {
    auth: new SupabaseAuthProvider(client, social),
    api: new SupabaseAccountsApi(client, url, anonKey),
  };
}
