/**
 * The two interfaces the whole accounts flow is written against (docs/ACCOUNTS.md §2,
 * brief rule 12): `AuthProvider` is identity and sessions, `AccountsApi` is the household —
 * creation, invites, members, roles, modules, deletion. `MockAuthProvider`/`MockAccountsApi`
 * run the entire flow with no keys; the Supabase pair is a drop-in behind the same types.
 * No screen imports supabase-js.
 */
import type { BootstrapPayload, ModuleId, PlanRowInput, Role } from '@nibblecue/core';
import type { AuthLinkProblem } from '../linkError';
import type { RefreshOutcome, Session } from '../session';

export type AuthMethod = 'apple' | 'google' | 'email' | 'magic_link';

/** The sign-ins another company completes for us, each behind its own button on AUTH. */
export type SocialMethod = 'apple' | 'google';

export type AuthFailureCode =
  | 'invalid_credentials'
  | 'email_taken'
  | 'weak_password'
  | 'email_not_verified'
  | 'provider_not_configured'
  /** The parent closed the sign-in page, or said no on it. Nothing is said: it was their choice. */
  | 'cancelled'
  /**
   * The provider's address already belongs to an account here that Auth would not join to it
   * (Supabase links a verified address to the account that holds it, and refuses the rest).
   */
  | 'account_exists'
  | 'rate_limited'
  /** Auth will not email this address yet (the project's own sender mails its members only). */
  | 'email_not_authorized'
  /** Auth has sent all the email it may this hour. */
  | 'email_rate_limited'
  | 'offline'
  | 'unknown';

/** Every provider failure the screens handle, with the sentence for the parent decided by the screen. */
export class AuthFailure extends Error {
  constructor(
    public readonly code: AuthFailureCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'AuthFailure';
  }
}

export type AuthEvent = 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED';

/**
 * What opening an auth link came to. `link_error` is an auth link that did NOT work — expired,
 * already used, or not exchangeable on this phone (`auth/linkError.ts`) — and the screens say so;
 * `ignored` is a link that was never an auth link at all.
 */
export type AuthLinkResult =
  | { kind: 'signed_in'; session: Session }
  | { kind: 'recovery'; session: Session }
  | { kind: 'link_error'; problem: AuthLinkProblem }
  | { kind: 'ignored' };

export interface SignUpResult {
  session: Session | null;
  /** True when the address must be confirmed before a session exists (email + password). */
  needsVerification: boolean;
}

export interface AuthProvider {
  readonly name: 'mock' | 'supabase';
  /**
   * THE SOCIAL SIGN-INS THIS BUILD CAN REALLY FINISH, and the only ones AUTH draws a button for
   * (`auth/socialSignIn.ts`; the launch review, 2026-09-27). A button whose method answers
   * `provider_not_configured` is a control that does not work, which App Review rejects (2.1), so
   * the provider that knows what it can do is the one that says so: the in-app test backend can do
   * both, and the Supabase provider only what it was built and switched on for (Apple on iPhone
   * once the owner enables it; Apple on Android only with the Services ID path). The throw stays
   * in each method as the backstop.
   */
  readonly socialSignIn: ReadonlySet<SocialMethod>;
  /** The cached session, from the keystore, with no network. */
  restoreSession(): Promise<Session | null>;
  refreshSession(): Promise<RefreshOutcome>;
  signInWithPassword(email: string, password: string): Promise<Session>;
  signUpWithPassword(email: string, password: string): Promise<SignUpResult>;
  sendPasswordReset(email: string): Promise<void>;
  /**
   * Keeps this session and signs out every other one (docs/ACCOUNTS.md §3.6).
   * A logged-in change passes the current password and the provider checks it. A recovery
   * link omits it: the emailed token is the check.
   */
  updatePassword(newPassword: string, currentPassword?: string): Promise<void>;
  /** True when this account has a password. False for an account that only signs in with Apple or Google. */
  hasPassword(): Promise<boolean>;
  resendVerification(email: string): Promise<void>;
  signInWithApple(): Promise<Session>;
  signInWithGoogle(): Promise<Session>;
  signOut(scope: 'local' | 'global'): Promise<void>;
  /** A link the OS handed us: verification, magic link, recovery. Anything else is ignored. */
  handleAuthLink(url: string): Promise<AuthLinkResult>;
  /**
   * `SIGNED_OUT` arrives here for a sign-out the app asked for AND for one it did not: supabase-js
   * removes a session whose refresh the server refused (revoked, or replayed outside its 10 s
   * window) and says so only through this event. `AuthContext` turns the second kind into the
   * forced sign-out (`session.ts` `effectOfClientSignOut`).
   */
  onAuthStateChange(listener: (event: AuthEvent, session: Session | null) => void): () => void;
}

/* ---------------------------------------------------------------- the household */

export interface Membership {
  household_id: string;
  household_name: string;
  role: Role;
  welcome_expires_at: string | null;
  /**
   * Where the household's creator said they heard about the app, or null for "did not say".
   * A key from core's `HEARD_FROM_OPTIONS`, typed as a string because a newer build's key may
   * reach an older one; nothing on the phone acts on it beyond printing it in the free download.
   */
  heard_from: string | null;
  /**
   * `households.home_time_zone` — what the server's clock-bound work runs in and what a phone
   * measures "away" from (`time/useZone.ts`). Null only from a build or a mock state that predates
   * it; the phone then falls back to its local mirror's copy.
   */
  home_time_zone: string | null;
  /**
   * `households.created_at` — when the household began: its first day is laid out from midnight
   * and the part before this is skipped, not missed (core's `schedule/start.ts`; the owner,
   * 2026-09-25). Carried here because the phone must know it from the first frame after setup:
   * the mirror's copy arrives with the first pull on a real project, and never on the in-app test
   * backend, whose sync fake has no `households` row (the owner's 11:30 PM sign-up, 2026-09-26,
   * saw only an 11:46 PM slot). Null only from a build or a cached account that predates it; the
   * schedule then falls back to the mirror's copy (`householdBeganMs`).
   */
  household_created_at: string | null;
  /**
   * When this person joined the household (`household_members.joined_at`). The *preview ended*
   * card is news only to someone who joined while the preview was on (core's `joinedDuringPreview`).
   * Null only from a build or a cached account that predates it, which reads as "was there".
   */
  joined_at: string | null;
  /**
   * `households.welcome_waits_for_birth` (migration 0150): the household was set up before the birth
   * and its 14 days of Plus start the day the baby arrives. False on a server before 0150, and once
   * the days have started.
   */
  welcome_waits_for_birth: boolean;
}

export interface ChildRow {
  id: string;
  household_id: string;
  name: string;
  /**
   * Null while the baby is on the way (migration 0150): `due_date` is then the expected date, and
   * "The baby is here" (`recordBirth`) fills this in. Everything counted from a birth reads the
   * born children only (core `bornChildren`; `ChildContext` hands the app those).
   */
  birth_date: string | null;
  due_date: string | null;
  /**
   * The baby's picture, if the household set one (docs/MEDIA.md; the owner, 2026-09-20). The
   * object path inside the private `child-photos` bucket — never a URL, and never the image:
   * a URL is signed for ten minutes at the moment it is needed, and the file itself is cached
   * on the device under `photo_updated_at`.
   */
  photo_path: string | null;
  /** The version stamp. It is what the local cache is keyed on, so a replacement is seen. */
  photo_updated_at: string | null;
}

/** What `setChildPhoto` wrote: the two columns, so the caller can update its row without a pull. */
export interface ChildPhotoSaved {
  photo_path: string;
  photo_updated_at: string;
}

/**
 * What `setEntryPhoto` PUT IN THE BUCKET — the path and the stamp the caller should now write.
 *
 * THE SHAPE IS THE SAME AS `ChildPhotoSaved` AND THE MEANING IS NOT, which is the whole reason
 * it is a second name. `setChildPhoto` uploads AND updates `children` in one call, because a
 * child's photo has no offline story: there is a screen open and a parent waiting on it.
 *
 * An entry's photo does. The entry was saved local-first, with no network, minutes or hours
 * before this upload is attempted (CLAUDE.md rule 7), so the two columns cannot be written by
 * this method — they have to go through the outbox like every other correction to an entry, or
 * a phone that is offline when the drain finally runs would have an object in the bucket and no
 * row pointing at it. `data/entryPhotos.ts` takes this and stamps the row with `editActivity`.
 */
export interface EntryPhotoStored {
  photo_path: string;
  photo_updated_at: string;
}

export interface MemberRow {
  user_id: string;
  display_name: string;
  email: string | null;
  role: Role;
  joined_at: string;
  is_self: boolean;
  /**
   * When a TEMPORARY seat ends, or null for a member of the household (docs/ACCOUNTS.md §7.1).
   * The server is what enforces it — `app.is_member` carries the clause, so every table goes at
   * once — and this is only the date the Family page shows beside the person's name. A lapsed
   * seat never arrives here at all: `household_roster` lists who is here NOW.
   */
  expires_at: string | null;
  /**
   * THE PERSON'S PICTURE (migration 0148): the three columns of their profile, from the roster the
   * page already reads. Absent from a server before 0148, which reads as the initial.
   */
  avatar_path?: string | null;
  avatar_preset?: string | null;
  avatar_updated_at?: string | null;
}

/**
 * What a change of the caller's own picture left on their profile (migration 0148): the three
 * columns, the stamp the server's own clock (`profiles_picture_stamp`), so the caller can cache the
 * photo under it and draw the new picture without waiting for a read.
 */
export interface MemberPictureSaved {
  avatar_path: string | null;
  avatar_preset: string | null;
  avatar_updated_at: string | null;
}

export interface AccountState {
  /**
   * `terms_version`: the Terms of Use / Privacy Policy version this person accepted, or null for
   * none. An ABSENT key is not the same as null: an account state cached by a build from before
   * the field existed has none, which means "not known yet", never "not accepted". The terms step
   * reads it with that third state kept (`auth/terms-step.ts`): below the current version, AUTH
   * shows the sign-up page's checkbox; absent, it shows nothing until a fresh read says.
   */
  profile: {
    id: string;
    display_name: string;
    email: string | null;
    terms_version: number | null;
    /**
     * THE PERSON'S OWN PICTURE (migration 0148): a photo's path, a drawing's id, and when either
     * last changed. Absent in an account state cached by a build from before it, which reads as
     * the initial until the next read says otherwise.
     */
    avatar_path?: string | null;
    avatar_preset?: string | null;
    avatar_updated_at?: string | null;
  } | null;
  memberships: Membership[];
  children: ChildRow[];
  modules: { household_id: string; module_id: ModuleId; enabled: boolean }[];
  /**
   * THE HOUSEHOLD'S PLAN, not this person's purchase (migration 0101, owner decision
   * 2026-09-22). Plus is bought by one parent and belongs to the household: the other parent
   * on their own phone meets no paywall, which is the point of a product with two free seats.
   * It is `my_household_plans()` for the household this app is showing — `memberships[0]`,
   * the same one every other surface here reads. Null is "no live entitlement".
   *
   * Nobody's BILLING row travels with it: `entitlement_read` is still `user_id = auth.uid()`,
   * so the store, the product id and the RevenueCat identity stay with the person who bought.
   */
  entitlement: PlanRowInput | null;
  /**
   * EVERY FAMILY'S PLAN, keyed by household (0153, the switcher): the same one call answers them
   * all, so a switch needs no round trip. `entitlement` is the family on screen's
   * (`focusAccount`, core). Absent in an account cached by a build from before it.
   */
  plans?: Record<string, PlanRowInput | null> | undefined;
  /**
   * NIBBLECUE PLUS, per family (`nibble_my_plan()`, docs/SERVER.md): a subscription of its own,
   * beside the household's CuddleCue Plus above (the owner, 2026-10-08). Absent on a server the
   * NibbleCue migrations have not reached yet, which reads as the free plan.
   */
  nibblePlans?: Record<string, PlanRowInput | null> | undefined;
  /** Server time when this was read: the anchor for every plan display (welcome.ts). */
  serverNow: number;
  deletionPending: { purge_at: string } | null;
}

export type ApiFailure = { ok: false; status: number; error: string; detail?: string };

export type CreateHouseholdResult =
  | {
      ok: true;
      household_id: string;
      child_id: string;
      role: 'OWNER';
      created: boolean;
      welcome_granted: boolean;
      welcome_expires_at: string | null;
      /** Set up before the birth (0150): the 14 days start when the baby arrives. Absent before 0150. */
      welcome_waits_for_birth?: boolean;
    }
  | ApiFailure;

export type AcceptInviteResult =
  | {
      ok: true;
      household_id: string;
      household_name: string;
      role: Role;
      welcome_expires_at: string | null;
      /**
       * When a temporary seat ends (`household_members.expires_at`, counted from this join), or
       * null for one that does not. Absent from a server older than 0139, which read as null.
       */
      seat_expires_at?: string | null;
    }
  | { ok: false; status: 404; error: 'invalid_invite'; attempts_left: number }
  | ApiFailure;

/**
 * WHAT A RIGHT CODE OR A LIVE LINK SAYS ABOUT ITSELF BEFORE ANYBODY JOINS (`check_invite`,
 * migration 0139). Only a right code gets this far, and a right code would hand over the household
 * in full the moment it was redeemed, so naming it leaks nothing a wrong code could learn.
 */
export interface InvitePreview {
  /** The household's own name, as its members see it; '' when the server said none. */
  household_name: string;
  /** The display name of whoever made the invite; '' when they have none yet. */
  inviter_name: string;
  /** The seat the invite gives: chosen by whoever made it, never by the person joining. */
  role: Role;
  /** How long the seat lasts once joined, in hours; null for a seat that does not end. */
  seat_hours: number | null;
}

/**
 * THE CHECK'S ANSWER. `token` is what the phone holds from then on: for a code, a CLAIM the server
 * made in its place that lasts as long as a link (the code stops working); for a link, its own
 * token. `unavailable` is a server with no check to make — a project without 0139, or one that took
 * it back from signed-out callers — and the phone then holds the code unchecked, as it did before.
 */
export type CheckInviteResult =
  | { ok: true; token: string; expires_at: string; preview: InvitePreview }
  | { ok: false; status: 404; error: 'invalid_invite' }
  | { ok: false; status: 403; error: 'needs_plus'; preview: InvitePreview }
  | { ok: false; status: 0; error: 'unavailable' }
  | ApiFailure;

/**
 * `expires_at` is when the CODE stops working; `seat_hours` is how long the SEAT lasts once the
 * code has been used, counted from the moment it is redeemed. Two different clocks, and the
 * copy has to keep them apart: a code sent on Monday and used on Wednesday gives an evening
 * that runs out on Wednesday night, not one that ran out on Monday.
 */
export type InviteCreated =
  | { ok: true; kind: 'CODE'; code: string; expires_at: string; seat_hours?: number }
  /**
   * `token` is the link's secret, which Family turns into the link it shares
   * (`auth/inviteLink.ts` `inviteShareLink`); `url` is the app's own scheme form of it.
   */
  | { ok: true; kind: 'LINK'; url: string; token: string; expires_at: string; seat_hours?: number }
  | ApiFailure;

export type Outcome = { ok: true } | ApiFailure;

/**
 * WHAT LEAVING A HOUSEHOLD NOBODY ELSE IS IN CAME TO (`leave_household_alone`, migration 0143). The
 * household is closed, not deleted: it and everything in it are kept until `purge_after`, and the
 * person who closed it can bring it back until then (`restoreHousehold`). A failure is `not_alone`
 * (409: somebody else is in it now, so it stays open), `forbidden` (403: this account is not a live
 * member of it), or a fault.
 */
export type LeaveHouseholdResult =
  | {
      ok: true;
      household_id: string;
      household_name: string;
      /** When it was closed: the server's clock. */
      closed_at: string;
      /** When it is deleted for good, with everything in it. */
      purge_after: string;
      /** Always true on a close: the person who closed it may bring it back until `purge_after`. */
      restorable: true;
    }
  | ApiFailure;

/**
 * BRINGING A CLOSED HOUSEHOLD BACK (`restore_household`, migration 0143), by the person who closed
 * it, before its `purge_after`. The membership comes back as it was, role included. A failure is
 * `not_found` (404: nothing this account closed has that id — somebody else's, open, or gone),
 * `window_passed` (409: its time is up, whether or not the purge has run), `in_another_household`
 * (409: one household per account, 0139), or a fault.
 */
export type RestoreHouseholdResult =
  { ok: true; household_id: string; household_name: string; role: Role } | ApiFailure;

/**
 * A second (or third) child, after setup. Validated by `checkNewChild` in core before the call. A
 * baby on the way has no birth date and its due date (migration 0150).
 */
export interface AddChildInput {
  name: string;
  birth_date: string | null;
  due_date: string | null;
}
export type AddChildResult = { ok: true; child: ChildRow } | ApiFailure;

/**
 * A correction to a child already in the household (the owner, 2026-10-03: a wrong date of birth
 * has to be fixable). `birth_date` null means the baby is still on the way and only the name
 * changes: the birth itself is `recordBirth`, which is what starts the 14 days.
 */
export interface UpdateChildInput {
  name: string;
  birth_date: string | null;
}
export type UpdateChildResult = { ok: true; child: ChildRow } | ApiFailure;

/**
 * "THE BABY IS HERE" (`record_birth`, migration 0150): the birth date, and the name when the parent
 * gave one, for a child set up before the birth. `welcome_granted` says the household's 14 days of
 * Plus started with it. The same date twice is the same answer; another date is 409
 * `already_born`; a date after today or a year from the due date is 422; a caregiver is 403.
 */
export type RecordBirthResult =
  | {
      ok: true;
      child_id: string;
      birth_date: string;
      name: string;
      welcome_granted: boolean;
      welcome_expires_at: string | null;
    }
  | ApiFailure;

/** `nibble-plan-ideas` (cuddlecue-app migration 0162): the model's draft, or why there is none. */
export type PlanIdeasResult = { ok: true; draft: unknown; cached: boolean } | ApiFailure;

export interface AccountsApi {
  createHousehold(payload: BootstrapPayload): Promise<CreateHouseholdResult>;
  /**
   * NIBBLECUE'S PLAN IDEAS: a summary of tokens and food ids (never a name or a note) in, a draft
   * of food ids and short reasons out, which the phone's validator checks again before a parent
   * sees any of it (`core/nibble/planner/ai.ts`).
   */
  planIdeas(body: Record<string, unknown>): Promise<PlanIdeasResult>;
  acceptInvite(input: {
    code?: string;
    token?: string;
    display_name?: string;
  }): Promise<AcceptInviteResult>;
  /**
   * CHECK AN INVITE BEFORE ANYBODY JOINS (`check_invite`, migration 0139): the one call a
   * signed-out phone makes besides Auth, so the first screen can say whose household a code is for
   * and that the person needs an account, before they make one. A wrong code costs what it costs at
   * redemption (SECURITY.md §3), so the phone checks a code once, when it is typed, and never
   * again. Throws offline like every account call.
   */
  checkInvite(input: { code?: string; token?: string }): Promise<CheckInviteResult>;
  /**
   * THE CALLER'S OWN NAME, as everyone in the household sees it beside their entries — written by
   * the joiner's confirmation page (`screens/auth/JoinedScreen.tsx`), since a join made the moment
   * the account exists is named from the address until the person says otherwise (0124). Under
   * `profiles_self_write`: the subject is the session, never a field. `name` is already checked
   * against core's `DisplayNameSchema`.
   */
  setDisplayName(name: string): Promise<Outcome>;
  bootstrapState(): Promise<AccountState>;
  /**
   * `seatHours` makes a TEMPORARY seat — the babysitter, the night nurse, the grandparent on a
   * rota — and the server only allows one for a CAREGIVER (`create_timed_invite`). Leaving it
   * out is the permanent seat this has always made.
   */
  createInvite(
    householdId: string,
    role: Exclude<Role, 'OWNER'>,
    kind: 'CODE' | 'LINK',
    seatHours?: number,
  ): Promise<InviteCreated>;
  /** Who is in the household NOW: permanent members and unlapsed seats, never a lapsed one. */
  listMembers(householdId: string): Promise<MemberRow[]>;
  setRole(householdId: string, userId: string, role: Role): Promise<Outcome>;
  removeMember(householdId: string, userId: string): Promise<Outcome>;
  transferOwnership(householdId: string, newOwnerId: string): Promise<Outcome>;
  /**
   * THE LAST PERSON IN A HOUSEHOLD LEAVES IT (migration 0143; the owner, 2026-09-29). The server
   * counts who is left, under a lock, and refuses while anybody else is live in it — the phone's
   * roster only decides whether the control is shown. The subject is the session; the household id
   * is an argument the server checks membership of, never trusts (CLAUDE.md rule 9). Throws offline
   * like every account call.
   */
  leaveHousehold(householdId: string): Promise<LeaveHouseholdResult>;
  /** BRING IT BACK, before its purge date, by the person who closed it (migration 0143). */
  restoreHousehold(householdId: string): Promise<RestoreHouseholdResult>;
  /**
   * WHETHER THIS PERSON PAYS FOR PLUS THROUGH A STORE: their own entitlement row
   * (`entitlement_read`, `user_id = auth.uid()`) is a store row that gives Plus now. The leave
   * confirmation says one line about it (leaving changes nothing in the store, and it goes with
   * them), and only when it is true of THIS person, never of whoever's row the household's plan
   * happens to be read from. Nobody else's billing is read. Throws offline.
   */
  storeSubscription(): Promise<{ ok: true; active: boolean } | ApiFailure>;
  /**
   * THE OWNER MOVES HOME (migration 0107; the owner, 2026-09-23). An account-level write like the
   * ownership transfer — the server checks the zone is one Postgres knows, moves `updated_at` so
   * the other phones pull it, and drops the schedule projections made on the old clock. OWNER
   * only; anyone else is a 403 whatever the phone believed (CLAUDE.md §2 rule 9).
   */
  setHomeTimeZone(householdId: string, zone: string): Promise<Outcome>;
  /**
   * THE OWNER RENAMES THE HOUSEHOLD (migration 0151). The same 2 to 60 characters setup
   * already requires, trimmed. The server moves `updated_at` so the other phones pull the
   * name. OWNER only; anyone else is a 403 whatever the phone believed (CLAUDE.md §2 rule 9).
   * Throws offline like the other account writes.
   */
  renameHousehold(householdId: string, name: string): Promise<Outcome>;
  /** One flag write to module_settings — never a delete (docs/SETUP.md §4). */
  setModuleEnabled(householdId: string, moduleId: ModuleId, enabled: boolean): Promise<Outcome>;
  /**
   * One row in `children`, OWNER/PARENT only (RLS `children_write`: the role is resolved on
   * the server, never trusted from here — CLAUDE.md §2 rule 9). An account-level write like
   * an invite or a module toggle, so it goes through the API rather than the outbox; the
   * rhythms copied for the new child afterwards are local-first like every other rule.
   */
  addChild(householdId: string, input: AddChildInput): Promise<AddChildResult>;
  /**
   * THE NAME AND THE DATE OF BIRTH, for a child already in the household. An account write like
   * `addChild`: `children_write` resolves the role on the server. A baby on the way takes a name
   * only (`birth_date` null); a birth date on that row is `recordBirth`. Throws offline.
   */
  updateChild(
    householdId: string,
    childId: string,
    input: UpdateChildInput,
  ): Promise<UpdateChildResult>;
  /** The baby on the way is here (migration 0150). Throws offline like every account call. */
  recordBirth(childId: string, birthDate: string, name: string | null): Promise<RecordBirthResult>;
  /**
   * THE BABY'S PICTURE, saved where the whole household can see it (the owner, 2026-09-20).
   *
   * An account write like `addChild`, and for the same reason: the object lives in a private
   * bucket whose policies resolve the role server-side (`child_photo_write` → `app.can_admin`),
   * and the row it stamps is under `children_write`. Nothing here is trusted about who the
   * caller is (CLAUDE.md §2 rule 9) — a caregiver's call is a 403 whatever the phone believed.
   *
   * `jpeg` is ALREADY the finished 512 px square (`prepareChildPhoto`): cropped, downscaled and
   * re-encoded, which is what strips the EXIF a phone photo carries. Nothing unprepared reaches
   * this method.
   */
  setChildPhoto(
    householdId: string,
    childId: string,
    jpeg: Uint8Array,
  ): Promise<{ ok: true; photo: ChildPhotoSaved } | ApiFailure>;
  /** Delete the object and null both columns. The same role boundary as setting one. */
  clearChildPhoto(householdId: string, childId: string): Promise<Outcome>;
  /**
   * A signed URL for a stored path, good for ten minutes (docs/MEDIA.md §2). Never a public
   * URL, and null rather than a throw when there is nothing there — a missing photo is an
   * initial on the avatar, not an error a parent can act on.
   */
  childPhotoUrl(path: string): Promise<string | null>;
  /**
   * PUT AN ENTRY'S PHOTO IN THE BUCKET, and nothing else (see `EntryPhotoStored` for why the
   * row is somebody else's job). `jpeg` is already the finished picture — long edge bounded,
   * re-encoded, EXIF gone — from `prepareEntryPhoto`; nothing unprepared reaches this method.
   *
   * THE ROLE BOUNDARY IS `can_write`, NOT `can_admin`. A child's photo is a household setting
   * and only an admin may change it; an entry's photo is part of the entry, so anyone who may
   * log may attach one. Migration 0102's four storage policies are what actually decide it —
   * the phone's belief about a caregiver's seat is never the thing enforcing this (rule 9).
   */
  setEntryPhoto(
    householdId: string,
    activityId: string,
    jpeg: Uint8Array,
  ): Promise<{ ok: true; photo: EntryPhotoStored } | ApiFailure>;
  /**
   * Remove the object. The two columns are nulled by the CALLER through the outbox, for the
   * same reason they are set there — so this is the object half alone, and an orphan left by a
   * failed delete is swept when the household is.
   */
  clearEntryPhoto(householdId: string, activityId: string): Promise<Outcome>;
  /** A signed URL for an entry photo, ten minutes, null when there is nothing there. */
  entryPhotoUrl(path: string): Promise<string | null>;
  /**
   * THE CALLER'S OWN PICTURE (the owner, 2026-09-30; migration 0148). The subject is the session,
   * never an argument: the photo goes to `<the caller's id>/picture.jpg` in the private
   * `member-photos` bucket, whose three write policies accept that one path and nothing else, and
   * the columns are written under `profiles_self_write`. Nothing here is trusted about who the
   * caller is (CLAUDE.md §2 rule 9).
   *
   * THE UPLOAD COMES FIRST AND THE ROW SECOND, the child photo's order and for its reason: an upload
   * whose row never lands is an orphan the next upload overwrites (and the purge empties), where a
   * row pointing at no file would have every phone in the household ask for a picture that is not
   * there. `jpeg` is ALREADY the finished 512 px square (`prepareChildPhoto`), EXIF gone.
   */
  setMemberPhoto(jpeg: Uint8Array): Promise<{ ok: true; picture: MemberPictureSaved } | ApiFailure>;
  /**
   * One of the app's drawings, by its id: the column alone, nothing uploaded. A photo it replaces is
   * deleted AFTER the row stops pointing at it, as `clearChildPhoto` orders the two.
   */
  setMemberDrawing(id: string): Promise<{ ok: true; picture: MemberPictureSaved } | ApiFailure>;
  /** Back to the initial: both columns null, then the photo's object deleted if there was one. */
  clearMemberPicture(): Promise<{ ok: true; picture: MemberPictureSaved } | ApiFailure>;
  /**
   * A signed URL for a member's photo, ten minutes, null when there is nothing there or the caller
   * may not read it (`member_photo_read`: the person and whoever shares a live household with them).
   */
  memberPhotoUrl(path: string): Promise<string | null>;
  /**
   * RECORDS THAT THE CALLER ACCEPTED THE TERMS AND THE PRIVACY POLICY at `version` (the owner,
   * 2026-09-21). An account write like the others: the subject is the session, never a body
   * field, and it works before a household exists — a fresh sign-up accepts before setup, so
   * the server creates the profile row if it has to (migration 0100).
   */
  acceptTerms(version: number): Promise<Outcome>;
  requestAccountDeletion(): Promise<{ ok: true; purge_at: string } | ApiFailure>;
  /**
   * SIGNING IN AGAIN IS THE UNDO (Privacy §7, Terms §12; migration 0131). The app calls this after
   * every sign-in (`auth/keep-account.ts`), and the server cancels a pending deletion only when the
   * session making the call began AFTER the deletion was requested — so the phone that asked, or a
   * phone still signed in from before, never undoes it. `cancelled` says whether there was one to
   * cancel, which is what decides whether the parent is told. Idempotent: a second call answers
   * `cancelled: false`.
   */
  cancelAccountDeletion(): Promise<{ ok: true; cancelled: boolean } | ApiFailure>;
  /**
   * THIS PHONE, FOR THE SERVER'S PUSH (migration 0121; docs/NOTIFICATIONS.md §7): the install's own
   * id, its push token when it has one, and how a reminder written on the server should read on it.
   * The subject is the session and the household is the caller's own membership — nothing here
   * names either (CLAUDE.md rule 9). An install id that is somebody else's is a 403.
   */
  registerDevice(device: DeviceRegistration): Promise<Outcome>;
  /** Sign-out's half (docs/ACCOUNTS.md §4 step 6): the token and the claims go, the row stays. */
  forgetDevice(deviceId: string): Promise<Outcome>;
  /**
   * THE REMINDERS THIS PHONE WILL RING ITSELF, every one of them, replacing the last claim
   * (`notifications/pushClaims.ts` says which count). The server's push leaves these alone.
   */
  claimLocalReminders(deviceId: string, slots: readonly ReminderSlotClaim[]): Promise<Outcome>;
  /**
   * ASK THE SERVER TO LOOK AT THE STORE, right after a purchase or a restore (migration 0122;
   * docs/SUBSCRIPTIONS.md §5). The server reads RevenueCat about the caller and nobody else, with
   * its own key, and writes what it finds. The answer says nothing about the plan: the account,
   * read again afterwards, does (CLAUDE.md rule 14). Throws offline like every account call.
   */
  syncSubscription(): Promise<Outcome>;
}

/** What `registerDevice` tells the server (`register_device`, 0121). */
export interface DeviceRegistration {
  deviceId: string;
  platform: 'IOS' | 'ANDROID';
  pushToken: string | null;
  pushProvider: 'FCM' | 'APNS' | null;
  appVersion: string | null;
  osVersion: string | null;
  timeZone: string | null;
  clock24h: boolean;
  volumeUnit: string;
}

/** One slot a phone claims: the rule and the slot's own time. */
export interface ReminderSlotClaim {
  ruleId: string;
  scheduledForMs: number;
}

/** Where a session is kept on the device: the keystore, cleared by teardown step 9. */
export interface SessionStore {
  load(): Promise<Session | null>;
  save(session: Session): Promise<void>;
  clear(): Promise<void>;
}
