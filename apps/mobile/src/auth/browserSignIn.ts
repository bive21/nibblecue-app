/**
 * SIGNING IN THROUGH THE PHONE'S OWN BROWSER SHEET (the owner, 2026-09-27: "add google"; Apple
 * on Android uses the same path once the Services ID is on, 2026-10-02).
 *
 * HOW. Supabase's own OAuth, with PKCE:
 *
 *   1. `signInWithOAuth` makes the provider's authorize address through the project, and keeps the
 *      code verifier in the same keychain slots an emailed link's verifier lives in (`keychain.ts`).
 *      It makes no network call; `skipBrowserRedirect` because there is no window to redirect.
 *   2. The browser sheet opens it: ASWebAuthenticationSession on iOS, a Custom Tab on Android
 *      (`systemBrowser.ts`). The provider's own page asks; the app never sees a password or a
 *      provider token.
 *   3. Supabase sends the parent back to the app's return address with a one-time code, and the
 *      code is exchanged for a session exactly as an emailed link's code is, with THIS flow's
 *      verifier (`flowId`) even when a reset email's flow is still open.
 *
 * WHY NOT GOOGLE'S NATIVE SDK. That needs a client id per platform, the SHA-1 of every Android
 * signing key registered with Google, a config plugin and a native module Expo Go does not carry.
 * This needs one "Web application" client, in the Supabase project, and a browser sheet Expo Go
 * already has. Google allows it (a system browser, never a web view inside the app). Apple on an
 * iPhone is native instead (`appleSignIn.ts`); Apple on Android is this sheet (Services ID).
 *
 * WHAT A PARENT IS TOLD, and nothing of the provider's, Supabase's or the browser's own words ever
 * reaches the screen:
 *   - nothing, when they close the sheet or say no on the provider's page: it was their choice, like
 *     backing out of the store's purchase sheet (`cancelled`);
 *   - that the address already has an account, when Auth would not join the provider address to the
 *     account that holds it (`account_exists`; Supabase joins a verified address to its account
 *     and refuses the rest, per the project's settings);
 *   - "No connection" when the code could not be exchanged for want of signal (`offline`);
 *   - the ordinary "Something went wrong" for anything else (`unknown`).
 *
 * Pure but for the two things handed in, the auth client and the browser, so the node suite runs
 * the whole flow against the supabase-js the app ships (`browserSignIn.test.ts`).
 */
import type { Session as SbSession, SupabaseClient } from '@supabase/supabase-js';
import { fragmentOf, queryOf } from '../lib/url';
import { authFailureCodeOf } from './failureCode';
import { exchangeProblem } from './linkError';
import { linkExchange } from './linkExchange';
import { AuthFailure, type AuthFailureCode } from './providers/types';

/** What the browser sheet came back with: expo-web-browser's result, as much of it as is read. */
export interface BrowserSheetResult {
  /** `success` with the return address, or why not: `cancel`, `dismiss`, `locked`, … */
  type: string;
  url?: string;
}

/** The phone's browser sheet for signing in, opened on `url` until it returns to `returnUrl`. */
export interface AuthBrowser {
  openAuthSession(url: string, returnUrl: string): Promise<BrowserSheetResult>;
}

/** The two supabase-js auth calls the flow makes, and nothing else of the client. */
export type OAuthClient = Pick<
  SupabaseClient['auth'],
  'signInWithOAuth' | 'exchangeCodeForSession'
>;

/** What a return address says: a code to exchange, a refusal, or nothing this flow can use. */
export type OAuthReturn =
  | { kind: 'code'; code: string; flowId: string | null }
  | {
      kind: 'refused';
      failure: Extract<AuthFailureCode, 'cancelled' | 'account_exists' | 'unknown'>;
    }
  | { kind: 'empty' };

/**
 * The codes Auth answers with when the provider's address belongs to an account it will not join
 * to this sign-in, and the words an older server says it in when it leaves the code out.
 */
const ACCOUNT_EXISTS_CODES: ReadonlySet<string> = new Set([
  'email_exists',
  'user_already_exists',
  'identity_already_exists',
  'email_conflict_identity_not_deletable',
]);
const ACCOUNT_EXISTS_WORDS =
  /already (?:exists|registered|in use|linked)|same email|multiple accounts/i;

/**
 * Read the address the sheet came back to. A refusal arrives in the query (PKCE) or the fragment
 * (an older flow) as `error`, `error_code` and `error_description`: `access_denied` is Google's
 * "the person said no", which is theirs to say and gets no sentence.
 */
export function oauthReturn(url: string): OAuthReturn {
  const query = queryOf(url);
  const fragment = fragmentOf(url);
  const error = query.error || fragment.error || '';
  const code = query.error_code || fragment.error_code || '';
  const description = query.error_description || fragment.error_description || '';
  if (error || code || description) {
    if (ACCOUNT_EXISTS_CODES.has(code) || ACCOUNT_EXISTS_WORDS.test(description))
      return { kind: 'refused', failure: 'account_exists' };
    if (
      error === 'access_denied' ||
      code === 'access_denied' ||
      /\b(?:cancel|denied)/i.test(description)
    )
      return { kind: 'refused', failure: 'cancelled' };
    return { kind: 'refused', failure: 'unknown' };
  }
  const exchange = linkExchange(url);
  return exchange === null ? { kind: 'empty' } : { kind: 'code', ...exchange };
}

/** Why an exchange failed, in the two answers a parent can act on. */
function exchangeFailure(returnUrl: string, err: unknown): AuthFailureCode {
  return exchangeProblem(returnUrl, err).reason === 'offline' ? 'offline' : 'unknown';
}

/**
 * The whole sign-in: the authorize address, the sheet, the code, the session. Throws an
 * `AuthFailure` whose code is the only thing the screen reads.
 *
 * @param onWaiting told `true` while the sheet is open and `false` when it closes, so the provider
 *   can tell the return address apart from an emailed link's (`SupabaseAuthProvider.handleAuthLink`)
 */
export async function signInThroughBrowser(input: {
  auth: OAuthClient;
  browser: AuthBrowser;
  provider: 'google' | 'apple';
  returnUrl: string;
  onWaiting?: (waiting: boolean) => void;
}): Promise<SbSession> {
  const { auth, browser, provider, returnUrl, onWaiting } = input;
  const { data, error } = await auth.signInWithOAuth({
    provider,
    options: { redirectTo: returnUrl, skipBrowserRedirect: true },
  });
  if (error !== null || !data.url)
    throw new AuthFailure(error ? authFailureCodeOf(error) : 'unknown');
  const flowId = data.flowId ?? null;

  let result: BrowserSheetResult;
  onWaiting?.(true);
  try {
    result = await browser.openAuthSession(data.url, returnUrl);
  } catch {
    // the sheet could not open at all (one already open, no browser): nothing was asked of Google
    throw new AuthFailure('unknown');
  } finally {
    onWaiting?.(false);
  }
  // closed, swiped away, or the phone locked the sheet: the parent's choice, said nothing about
  if (result.type !== 'success' || typeof result.url !== 'string')
    throw new AuthFailure('cancelled');

  const back = oauthReturn(result.url);
  if (back.kind === 'refused') throw new AuthFailure(back.failure);
  if (back.kind === 'empty') throw new AuthFailure('unknown');
  const flow = back.flowId ?? flowId;
  try {
    const { data: exchanged, error: exchangeError } = await auth.exchangeCodeForSession(
      back.code,
      flow !== null ? { flowId: flow } : undefined,
    );
    if (exchangeError !== null) throw new AuthFailure(exchangeFailure(result.url, exchangeError));
    if (!exchanged.session) throw new AuthFailure('unknown');
    return exchanged.session;
  } catch (err) {
    if (err instanceof AuthFailure) throw err;
    // supabase-js returns its own errors; what it throws is the transport, or a bug
    throw new AuthFailure(exchangeFailure(result.url, err));
  }
}
