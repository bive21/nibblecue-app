/**
 * The mock provider pair (brief rule 12, CODEX_TASKS WP2 "build the whole flow against
 * AUTH_PROVIDER=mock"). `MockBackend` is an in-memory server that follows the same rules as
 * migration 0008 — verification before a household, one welcome grant per address, a code
 * that works once and costs its guesser (never the code) a wrong guess, the last-owner guard, the caregiver
 * boundary — so every screen and every E2E flow behaves the way the real stack will. It is
 * never bundled into a build that has a Supabase URL (env.ts picks the provider).
 *
 * The backend can persist itself to a key-value store so a killed app resumes with its
 * "server" intact; that store is never the preferences store sign-out clears.
 */
import {
  CHILD_PHOTO_CONTENT_TYPE,
  CHILD_PHOTO_MAX_BYTES,
  CLOSED_HOUSEHOLD_DAYS,
  ENTRY_PHOTO_CONTENT_TYPE,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  INVITE_CODE_LIFETIME_MS,
  inviteCodeHasBlockedWord,
  INVITE_LINK_LIFETIME_MS,
  isCompleteInviteCode,
  normalizeInviteCode,
  ENTRY_PHOTO_MAX_BYTES,
  checkChildCorrection,
  checkNewChild,
  childPhotoPath,
  entryPhotoPath,
  isKnownZone,
  isMemberAvatarId,
  isSeatLength,
  localDayKey,
  MEMBER_PHOTO_CONTENT_TYPE,
  MEMBER_PHOTO_MAX_BYTES,
  memberPhotoPath,
  MODULES,
  parseChildPhotoPath,
  parseEntryPhotoPath,
  parseMemberPhotoPath,
  rowGrantsPlus,
  birthOnRecordable,
  ChildNameSchema,
  DisplayNameSchema,
  HouseholdNameSchema,
  type BootstrapPayload,
  type ModuleId,
  type PlanRowInput,
  type Role,
  validateBootstrapPayload,
  MAX_HOUSEHOLDS,
} from '@nibblecue/core';
import { randomUuid } from '../../data/ids';
import { base64Of } from '../../lib/base64';
import { queryOf } from '../../lib/url';
import type { KeyValueStore } from '../../prefs';
import { authLinkProblem } from '../linkError';
import type { RefreshOutcome, Session } from '../session';
import {
  AuthFailure,
  type AcceptInviteResult,
  type PlanIdeasResult,
  type AccountsApi,
  type AccountState,
  type AddChildInput,
  type AddChildResult,
  type ApiFailure,
  type AuthEvent,
  type ChildPhotoSaved,
  type EntryPhotoStored,
  type ChildRow,
  type AuthLinkResult,
  type AuthMethod,
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
  type SessionStore,
  type SignUpResult,
  type SocialMethod,
} from './types';

const DAY = 86_400_000;
const MOCK_WELCOME_DAYS = 14;
/**
 * The server's own lifetimes (core's `invite-code.ts`, read there against the migration that last
 * set them).
 */
export const MOCK_CODE_TTL_MS = INVITE_CODE_LIFETIME_MS;
const MOCK_LINK_TTL_MS = INVITE_LINK_LIFETIME_MS;

/**
 * A CODE AS `app.new_invite_code` MAKES ONE (0144): six letters of the alphabet from `rng`, drawn
 * again whole while it holds a word of core's `INVITE_CODE_BLOCKED_WORDS` (the list the migration
 * holds too), or while it is `taken` by another live code. Exported so a test can hand it the
 * draws.
 */
export function drawInviteCode(rng: () => number, taken: (code: string) => boolean): string {
  const draw = (): string => {
    let code = '';
    while (code.length < INVITE_CODE_LENGTH)
      code += INVITE_CODE_ALPHABET[Math.floor(rng() * INVITE_CODE_ALPHABET.length)] ?? 'A';
    return code;
  };
  let code = draw();
  while (inviteCodeHasBlockedWord(code) || taken(code)) code = draw();
  return code;
}

/**
 * A WRONG CODE IS COUNTED AGAINST ITS GUESSER, never against anybody's code (0140): ten an hour
 * from a signed-out connection — the mock runs on one phone, so its connection is the phone —
 * and a thousand in ten minutes from everybody, which pauses codes and never links.
 */
const GUESS_CONN = { subject: 'conn:this-phone', limit: 10, window: 60 * 60_000 };
const GUESS_ALL = { subject: '*', limit: 1000, window: 10 * 60_000 };
const MOCK_DELETION_WINDOW_DAYS = 14;
/** `app.rate_limit(uid, 'invite_redeem', 5, '10 minutes')`, shared by the join and the check. */
const REDEEM = { limit: 5, window: 10 * 60_000 };

/**
 * Where the mock's emailed links come back to: the two routes Auth uses (`AUTH_CALLBACK`,
 * `RECOVERY_CALLBACK` in `supabase.ts`), on a scheme of the mock's own, so a reset link is told
 * from a sign-in link by its route here exactly as it is there (`auth/linkError.ts` `linkFlow`).
 */
const MOCK_AUTH_PREFIX = 'cuddlecue-mock://auth/';
type MockLinkType = 'signup' | 'magiclink' | 'recovery';

interface MockUser {
  id: string;
  email: string;
  /** Never the password: an irreversible digest, and only for the mock's own sign-in check. */
  password_digest: string | null;
  verified: boolean;
  provider: AuthMethod;
  /** Bumped by "sign out everywhere"; a session minted under an older version is invalid. */
  session_version: number;
  display_name: string | null;
  deleted_at: string | null;
  /** 0100; absent in a state persisted by an older build, which reads as null (nothing accepted). */
  terms_version?: number | null;
  /**
   * When this account last SIGNED IN — a new session, never a refresh — and the `session_version`
   * it signed in under: the mock's stand-in for GoTrue's newest `auth.sessions` row, which the
   * purge reads (0131; `MockBackend.purgeDue`). Absent in a state persisted before it existed.
   */
  signed_in_at?: string | null;
  signed_in_version?: number;
  /**
   * THE PERSON'S OWN PICTURE (migration 0148): the three columns of their profile. Absent in a state
   * persisted before it, which reads as the initial.
   */
  avatar_path?: string | null;
  avatar_preset?: string | null;
  avatar_updated_at?: string | null;
  /**
   * WHAT STANDS IN FOR THE `member-photos` BUCKET, as `photo_data` does for a child's: the photo's
   * bytes as a `data:` URI, handed back by `memberPhotoUrl` to whoever the read policy would let in.
   * Never part of a row the app sees.
   */
  avatar_data?: string;
}
interface MockHousehold {
  id: string;
  name: string;
  owner_id: string;
  welcome_expires_at: string | null;
  created_at: string;
  /** 0093; absent in a state persisted by an older build, which reads as null. */
  heard_from?: string | null;
  /** The household's home zone, from onboarding; absent in a state persisted before 0107. */
  home_time_zone?: string | null;
  /** Set up before the birth and owed its 14 days (0150); absent in a state persisted before it. */
  welcome_waits_for_birth?: boolean;
  /**
   * THE CLOSE (migration 0143): when the last person in it left, who that was, and when it is
   * deleted for good. All three null, or absent in a state persisted before 0143, for an open
   * household. A closed one is gone for everyone (`membership`), as `app.is_member` makes it.
   */
  closed_at?: string | null;
  closed_by?: string | null;
  purge_at?: string | null;
}
interface MockMember {
  household_id: string;
  user_id: string;
  role: Role;
  joined_at: string;
  removed_at: string | null;
  /** A temporary seat's end (migration 0101). Absent on rows written before it existed. */
  expires_at?: string | null;
}
interface MockChild {
  id: string;
  household_id: string;
  name: string;
  /** Null while the baby is on the way (0150). */
  birth_date: string | null;
  due_date: string | null;
  /** The two mirrored columns. The IMAGE is `photo_data` below, which the server never has. */
  photo_path: string | null;
  photo_updated_at: string | null;
  /**
   * WHAT STANDS IN FOR THE BUCKET. There is no Supabase Storage here, so the fake keeps the
   * bytes beside the row as a `data:` URI and `childPhotoUrl` hands that back — which is
   * exactly what a signed URL is for the caller: a string an <Image> can render, valid for a
   * while, that nobody outside the household can guess. It is NOT part of `ChildRow` and never
   * reaches the app as one, so no screen can come to depend on the image travelling with the
   * row (docs/MEDIA.md §2: the path is the column; the picture is fetched).
   */
  photo_data?: string;
}
/** A `MockChild` as the app is allowed to see it: the columns, never the stand-in bucket. */
const childRowOf = (child: MockChild): ChildRow => ({
  id: child.id,
  household_id: child.household_id,
  name: child.name,
  birth_date: child.birth_date,
  due_date: child.due_date,
  photo_path: child.photo_path,
  photo_updated_at: child.photo_updated_at,
});

interface MockInvite {
  id: string;
  household_id: string;
  role: Role;
  kind: 'CODE' | 'LINK';
  secret: string;
  created_by: string;
  expires_at: number;
  accepted_by: string | null;
  revoked: boolean;
  failed_attempts: number;
  /** How long the SEAT lasts once redeemed, in hours — a different clock from `expires_at`. */
  seat_hours?: number | null;
}
export interface MockEntitlement {
  user_id: string;
  /**
   * The household the row is filed under. Null once that household was purged (0143): the server's
   * `on delete set null`, which leaves a store subscription's row standing, unfiled.
   */
  household_id: string | null;
  /**
   * `welcome` is the 14-day preview this backend grants on sign-up; `store` is what the mock
   * BILLING provider writes when a purchase goes through (`billing/mock.ts`). Both are here for
   * the same reason: the device never decides its own tier (CLAUDE.md rule 14), so a purchase
   * has to change the thing the accounts API reads the plan out of, and then be read back.
   */
  source: 'welcome' | 'store';
  /**
   * `CANCELLED_AT_PERIOD_END` is a store row that will not renew — what a redeemed code gives when
   * its offer is set not to (`billing/mock.ts` `redeem`; docs/PROMO_CODES.md). The plan reads it as
   * Plus until the date, never as "renews" (`planStatusFrom`).
   */
  status: 'ACTIVE' | 'CANCELLED_AT_PERIOD_END';
  current_period_end: string;
}

export interface MockState {
  users: MockUser[];
  households: MockHousehold[];
  members: MockMember[];
  children: MockChild[];
  module_settings: { household_id: string; module_id: ModuleId; enabled: boolean }[];
  invites: MockInvite[];
  welcome_ledger: string[];
  entitlements: MockEntitlement[];
  /**
   * NIBBLECUE PLUS, its own rows (CuddleCue migration 0162's `nibble_entitlements`): what the mock
   * billing provider writes when a NibbleCue Plus package is bought. Never the welcome preview,
   * which is CuddleCue's, and never read as CuddleCue Plus (the owner, 2026-10-08: "this is a
   * different subscription called nibblecue plus").
   */
  nibble_entitlements: MockEntitlement[];
  rate_limits: Record<string, { window_start: number; count: number }>;
  deletions: Record<string, { requested_at: string; purge_at: string }>;
  household_ops: Record<string, string>;
  /**
   * THE ENTRY-PHOTO BUCKET, as a map from object path to a data URL.
   *
   * It is a bucket and not a column, which is the shape the real thing has: `activities` lives
   * in the LOCAL database and its two photo columns are written there by the outbox, so the
   * server half of an entry photo really is nothing but an object store. Keying by PATH rather
   * than by activity id is what lets `entryPhotoUrl` re-check the household off the path's first
   * segment, exactly as `entry_photo_read` does — so a path pointing at somebody else's
   * household comes back null here too.
   */
  entry_photos: Record<string, string>;
}

const emptyState = (): MockState => ({
  users: [],
  households: [],
  members: [],
  children: [],
  module_settings: [],
  invites: [],
  welcome_ledger: [],
  entitlements: [],
  nibble_entitlements: [],
  rate_limits: {},
  deletions: {},
  household_ops: {},
  entry_photos: {},
});

const MOCK_STATE_KEY = 'mock_backend_state';

/** FNV-1a: not a password hash, just "the mock does not keep the password" (CLAUDE.md rule 8). */
function digest(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export interface MockBackendOptions {
  now?: () => number;
  /** Device/test ids: deterministic when injected, random otherwise. */
  newId?: () => string;
  store?: KeyValueStore;
}

export class MockBackend {
  state: MockState = emptyState();
  online = true;
  readonly now: () => number;
  readonly newId: () => string;
  private readonly store: KeyValueStore | undefined;
  private saving: Promise<void> = Promise.resolve();
  /** The last verification / magic / recovery link "sent" — what the dev-only button opens. */
  lastLink: string | null = null;
  readonly sent: { to: string; kind: 'verify' | 'magic' | 'recovery' }[] = [];
  /**
   * THE LINK OF EACH KIND THAT STILL WORKS, per account — as Auth keeps one token per kind: a link
   * works once, and sending another replaces the last. A link that is not the live one comes back
   * as expired-or-used, the answer a real project gives (`auth/linkError.ts`). In memory only, like
   * `lastLink`: after a restart there is no dev button to open an old one with.
   */
  private readonly liveLinks = new Map<string, string>();
  private linkSeq = 0;
  /**
   * THE PHONES THAT REGISTERED FOR PUSH, and what each claims (migration 0121). In memory only: the
   * test backend sends no push, so this is here for the tests and the inspector, and a relaunch
   * registering again is exactly what a real phone does.
   */
  readonly devices = new Map<string, DeviceRegistration & { userId: string }>();
  readonly claims = new Map<string, readonly ReminderSlotClaim[]>();

  constructor(opts: MockBackendOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.newId = opts.newId ?? defaultId;
    this.store = opts.store;
  }

  async load(): Promise<void> {
    if (!this.store) return;
    const raw = await this.store.get(MOCK_STATE_KEY);
    if (!raw) return;
    try {
      this.state = { ...emptyState(), ...(JSON.parse(raw) as Partial<MockState>) };
    } catch {
      this.state = emptyState();
    }
  }

  save(): Promise<void> {
    if (!this.store) return Promise.resolve();
    const snapshot = JSON.stringify(this.state);
    this.saving = this.saving.then(() => this.store?.set(MOCK_STATE_KEY, snapshot));
    return this.saving;
  }

  /**
   * Forget every account, household and row this fake server ever held — the dev-only "start
   * fresh" (`dev/reset.ts`).
   *
   * IN MEMORY FIRST, THEN ON DISK, and the pending `saving` chain is awaited between the two.
   * The backend keeps its state in memory and writes a snapshot of it on every change, so
   * wiping only the stored key would be undone by the next save; and removing the key before
   * an in-flight save had landed would let that save put the old world back.
   */
  async reset(): Promise<void> {
    this.state = emptyState();
    this.lastLink = null;
    this.liveLinks.clear();
    this.sent.length = 0;
    await this.saving;
    await this.store?.remove(MOCK_STATE_KEY);
  }

  /* ---- emailed links: one live link per kind and account, each good once ---- */
  issueLink(type: MockLinkType, userId: string): string {
    this.linkSeq += 1;
    const route = type === 'recovery' ? 'recovery' : 'callback';
    const link = `${MOCK_AUTH_PREFIX}${route}?type=${type}&user=${userId}&n=${this.linkSeq}`;
    this.liveLinks.set(`${type}:${userId}`, link);
    this.lastLink = link;
    return link;
  }
  /** True once for the live link, and never again — for it or for any link it replaced. */
  redeemLink(link: string, type: MockLinkType, userId: string): boolean {
    const key = `${type}:${userId}`;
    if (this.liveLinks.get(key) !== link) return false;
    this.liveLinks.delete(key);
    return true;
  }

  /* ---- users ---- */
  userByEmail(email: string): MockUser | undefined {
    const e = normalizeEmail(email);
    return this.state.users.find(u => u.email === e && !u.deleted_at);
  }
  user(id: string): MockUser | undefined {
    return this.state.users.find(u => u.id === id);
  }
  createUser(
    email: string,
    password: string | null,
    provider: AuthMethod,
    verified: boolean,
  ): MockUser {
    const u: MockUser = {
      id: this.newId(),
      email: normalizeEmail(email),
      password_digest: password === null ? null : digest(password),
      verified,
      provider,
      session_version: 1,
      display_name: null,
      deleted_at: null,
    };
    this.state.users.push(u);
    return u;
  }
  /** What "sign out everywhere" does server-side: every existing session stops refreshing. */
  revokeSessions(userId: string): void {
    const u = this.user(userId);
    if (u) u.session_version += 1;
  }
  mintSession(u: MockUser): Session {
    return {
      user: { id: u.id, email: u.email, emailVerified: u.verified },
      accessToken: `mock.${u.id}.${u.session_version}.${this.now()}`,
      refreshToken: `mockr.${u.id}.${u.session_version}`,
      expiresAt: this.now() + 60 * 60_000,
    };
  }
  sessionValid(s: Session): boolean {
    const u = this.user(s.user.id);
    if (!u || u.deleted_at) return false;
    return s.refreshToken === `mockr.${u.id}.${u.session_version}`;
  }

  /* ---- rate limits: fixed windows, like app.rate_limit ---- */
  rateLimit(subject: string, action: string, limit: number, windowMs: number): boolean {
    const key = `${subject}:${action}`;
    const start = Math.floor(this.now() / windowMs) * windowMs;
    const cur = this.state.rate_limits[key];
    if (!cur || cur.window_start !== start) {
      this.state.rate_limits[key] = { window_start: start, count: 1 };
      return true;
    }
    cur.count += 1;
    return cur.count <= limit;
  }
  attemptsLeft(subject: string, action: string, limit: number, windowMs: number): number {
    const cur = this.state.rate_limits[`${subject}:${action}`];
    const start = Math.floor(this.now() / windowMs) * windowMs;
    return cur && cur.window_start === start ? Math.max(0, limit - cur.count) : limit;
  }

  /**
   * The mock's `app.is_member`, and the expiry clause lives here for the same reason it lives
   * in the server's one predicate: `canAdmin` and every caller follow from it, so a lapsed
   * seat loses the household in one place rather than in a list of places to forget.
   */
  membership(householdId: string, userId: string): MockMember | undefined {
    const now = this.now();
    // and a closed household is nobody's (0143): the clause `app.is_member` carries since then
    if (this.closed(householdId)) return undefined;
    return this.state.members.find(
      m =>
        m.household_id === householdId &&
        m.user_id === userId &&
        !m.removed_at &&
        (m.expires_at == null || Date.parse(m.expires_at) > now),
    );
  }

  /**
   * `app.sees_member_photo` (0148): whether `reader` may read `person`'s picture — the person
   * themselves, or somebody whose own seat is live in a household where the person's seat is live.
   */
  seesMemberPhoto(reader: string, person: string): boolean {
    if (reader === person) return true;
    const now = this.now();
    return this.state.members.some(
      m =>
        m.user_id === person &&
        !m.removed_at &&
        (m.expires_at == null || Date.parse(m.expires_at) > now) &&
        this.membership(m.household_id, reader) !== undefined,
    );
  }

  /** Whether the household was closed by the last person in it and is waiting for its purge (0143). */
  closed(householdId: string): boolean {
    return this.state.households.find(h => h.id === householdId)?.closed_at != null;
  }

  /** Somebody other than `userId` is live in the household now: the count `not_alone` is made on. */
  othersLive(householdId: string, userId: string): boolean {
    const now = this.now();
    return this.state.members.some(
      m =>
        m.household_id === householdId &&
        m.user_id !== userId &&
        !m.removed_at &&
        (m.expires_at == null || Date.parse(m.expires_at) > now),
    );
  }
  canAdmin(householdId: string, userId: string): boolean {
    const m = this.membership(householdId, userId);
    return m?.role === 'OWNER' || m?.role === 'PARENT';
  }
  /**
   * `app.can_write` — the predicate a LOG is written under, which is a wider set than the one a
   * SETTING is. A caregiver may record a feed and attach a photo to it; they may not change the
   * household's modules or a child's profile picture. One helper rather than a role test at
   * each call site, for the reason `membership` gives: a lapsed seat has to lose everything at
   * once, and it can only do that if there is one place to lose it from.
   */
  canWrite(householdId: string, userId: string): boolean {
    const m = this.membership(householdId, userId);
    return m?.role === 'OWNER' || m?.role === 'PARENT' || m?.role === 'CAREGIVER';
  }

  /**
   * `app.household_has_plus` (migration 0139): any of the household's rows that gives Plus now, by
   * core's own row rule — the one the plan is read by. A caregiver's or a viewer's seat needs it.
   */
  householdHasPlus(householdId: string): boolean {
    const now = this.now();
    return this.state.entitlements.some(
      e => e.household_id === householdId && rowGrantsPlus(e, now),
    );
  }

  /** The household this account is a live member of, other than `except`, if any (0139). */
  /** Every live seat the person holds outside `except`, as 0153 counts them. */
  liveSeatsElsewhere(userId: string, except: string): MockMember[] {
    const now = this.now();
    return this.state.members.filter(
      m =>
        m.user_id === userId &&
        m.household_id !== except &&
        !m.removed_at &&
        (m.expires_at == null || Date.parse(m.expires_at) > now) &&
        !this.closed(m.household_id),
    );
  }

  /** A live parent's seat (OWNER or PARENT) outside `except`: 0153's and 0155's `admin_elsewhere`. */
  adminElsewhere(userId: string, except: string): boolean {
    return this.liveSeatsElsewhere(userId, except).some(
      m => m.role === 'OWNER' || m.role === 'PARENT',
    );
  }

  otherHousehold(userId: string, except: string): MockMember | undefined {
    const now = this.now();
    return this.state.members.find(
      m =>
        m.user_id === userId &&
        m.household_id !== except &&
        !m.removed_at &&
        (m.expires_at == null || Date.parse(m.expires_at) > now) &&
        !this.closed(m.household_id),
    );
  }

  /**
   * A LIVE INVITE FOR A CODE OR A TOKEN — `accept_invite`'s and `check_invite`'s shared lookup
   * (0008, 0139, 0140, 0144). A code is six letters, found as it is; a wrong one costs nobody's code
   * anything since 0140 (`guessOpen` and `guessSpent` count it against its guesser). A token is
   * never guessed, so a wrong one costs nothing.
   */
  findInvite(input: { code?: string; token?: string }): MockInvite | undefined {
    const now = this.now();
    const live = (i: MockInvite) => !i.accepted_by && !i.revoked && i.expires_at > now;
    if (input.token) {
      return this.state.invites.find(i => i.kind === 'LINK' && live(i) && i.secret === input.token);
    }
    if (!input.code) return undefined;
    const code = normalizeInviteCode(input.code);
    return this.state.invites.find(i => i.kind === 'CODE' && live(i) && i.secret === code);
  }

  /** How many wrong codes this subject has spent in the window now, as `app.invite_guess_open` reads it. */
  private guesses(subject: string, windowMs: number): number {
    const cur = this.state.rate_limits[`${subject}:invite_guess`];
    const start = Math.floor(this.now() / windowMs) * windowMs;
    return cur && cur.window_start === start ? cur.count : 0;
  }

  /**
   * `app.invite_guess_open` (0140): before a code is compared, the detail of the limit it meets, or
   * null. `signedOut` counts this phone as a connection; signed in, the account's own limiter is
   * the caller's to check.
   */
  guessOpen(signedOut: boolean): 'invite_guess_conn' | 'invite_codes_paused' | null {
    if (signedOut && this.guesses(GUESS_CONN.subject, GUESS_CONN.window) >= GUESS_CONN.limit)
      return 'invite_guess_conn';
    if (this.guesses(GUESS_ALL.subject, GUESS_ALL.window) >= GUESS_ALL.limit)
      return 'invite_codes_paused';
    return null;
  }

  /** `app.invite_guess_spent`: a code that matched nothing, counted for everybody and the connection. */
  guessSpent(signedOut: boolean): void {
    const all = [{ ...GUESS_ALL }, ...(signedOut ? [{ ...GUESS_CONN }] : [])];
    for (const g of all) {
      const key = `${g.subject}:invite_guess`;
      const start = Math.floor(this.now() / g.window) * g.window;
      const cur = this.state.rate_limits[key];
      if (!cur || cur.window_start !== start)
        this.state.rate_limits[key] = { window_start: start, count: 1 };
      else cur.count += 1;
    }
  }

  /**
   * The nightly purge: after the window, the account is gone and its sole household with it —
   * unless it SIGNED IN AGAIN SINCE ASKING and that session is still live (0131), when the request
   * is canceled instead, even though the app's own call never came. "Live" is the mock's one
   * notion of it, the session version: a sign-out everywhere ends it, as a server sign-out deletes
   * the row; a sign-out on one phone does not, because the mock has never kept a row per session.
   */
  purgeDue(): number {
    // the same run purges the households their last member closed, once their days are up (0143;
    // `purge-accounts` runs `purge_closed_households()` right after the accounts)
    this.purgeClosedHouseholds();
    let purged = 0;
    for (const [userId, d] of Object.entries(this.state.deletions)) {
      if (Date.parse(d.purge_at) > this.now()) continue;
      const u = this.user(userId);
      if (
        u?.signed_in_at != null &&
        Date.parse(u.signed_in_at) > Date.parse(d.requested_at) &&
        u.signed_in_version === u.session_version
      ) {
        delete this.state.deletions[userId];
        continue;
      }
      if (u) {
        u.email = `deleted-${u.id}@invalid.invalid`;
        // the picture goes with the account (0148): the columns, and the stand-in bucket's bytes
        u.avatar_path = null;
        u.avatar_preset = null;
        u.avatar_updated_at = new Date(this.now()).toISOString();
        delete u.avatar_data;
      }
      this.state.members = this.state.members.filter(m => m.user_id !== userId);
      this.state.entitlements = this.state.entitlements.filter(e => e.user_id !== userId);
      this.state.nibble_entitlements = this.state.nibble_entitlements.filter(
        e => e.user_id !== userId,
      );
      delete this.state.deletions[userId];
      purged += 1;
    }
    return purged;
  }

  /**
   * `purge_closed_households()` (0143): every household closed by the last person in it whose
   * `purge_at` has passed goes, with everything the test backend keeps of it — its members, its
   * children and their pictures, its modules, its invites, its entry photos — and a store row filed
   * under it stays, unfiled, as `on delete set null` leaves it. The rows the sync fake holds are its
   * own (`sync/providers/mock.ts`); nobody can pull them, since nobody is a member.
   */
  purgeClosedHouseholds(): number {
    const now = this.now();
    const gone = new Set(
      this.state.households
        .filter(h => h.closed_at != null && h.purge_at != null && Date.parse(h.purge_at) <= now)
        .map(h => h.id),
    );
    if (gone.size === 0) return 0;
    this.state.households = this.state.households.filter(h => !gone.has(h.id));
    this.state.members = this.state.members.filter(m => !gone.has(m.household_id));
    this.state.children = this.state.children.filter(ch => !gone.has(ch.household_id));
    this.state.module_settings = this.state.module_settings.filter(
      ms => !gone.has(ms.household_id),
    );
    this.state.invites = this.state.invites.filter(i => !gone.has(i.household_id));
    for (const e of [...this.state.entitlements, ...this.state.nibble_entitlements])
      if (e.household_id !== null && gone.has(e.household_id)) e.household_id = null;
    for (const path of Object.keys(this.state.entry_photos)) {
      const parsed = parseEntryPhotoPath(path);
      if (parsed !== null && gone.has(parsed.householdId)) delete this.state.entry_photos[path];
    }
    for (const id of gone) delete this.state.household_ops[id];
    return gone.size;
  }
}

const normalizeEmail = (e: string): string => e.trim().toLowerCase();

/*
  RANDOM, NOT A COUNTER (the investigation of 2026-09-24 into the owner's "Not synced" in Expo
  Go). The counter restarted at …0001 on every launch while the accounts it had numbered were
  kept on disk, so a sign-up after a relaunch could be handed an id an earlier account, household
  or child already held — and load that household, and the test server's saved rows for it,
  as its own. A test that wants fixed ids still injects `newId`.
*/
const defaultId = randomUuid;

/* ================================================================ AuthProvider */

export class MockAuthProvider implements AuthProvider {
  readonly name = 'mock' as const;
  /**
   * Both social sign-ins, which the test backend finishes, so Expo Go and the E2E flows walk every
   * button AUTH draws (Apple restored 2026-10-02 with the real provider).
   */
  readonly socialSignIn: ReadonlySet<SocialMethod> = new Set<SocialMethod>(['apple', 'google']);
  private session: Session | null = null;
  /** Set by a recovery link, cleared by a password sign-in. Lets updatePassword skip the current password once. */
  private recoverySession = false;
  private readonly listeners = new Set<(event: AuthEvent, session: Session | null) => void>();

  constructor(
    private readonly backend: MockBackend,
    private readonly store: SessionStore,
  ) {}

  private requireOnline(): void {
    if (!this.backend.online) throw new AuthFailure('offline', 'No connection');
  }

  private async establish(u: MockUser, event: AuthEvent = 'SIGNED_IN'): Promise<Session> {
    const s = this.backend.mintSession(u);
    // a sign-in begins a session; a refresh (or a password change re-minting this one) does not
    if (event === 'SIGNED_IN') {
      u.signed_in_at = new Date(this.backend.now()).toISOString();
      u.signed_in_version = u.session_version;
    }
    this.session = s;
    await this.store.save(s);
    await this.backend.save();
    for (const l of this.listeners) l(event, s);
    return s;
  }

  current(): Session | null {
    return this.session;
  }

  async restoreSession(): Promise<Session | null> {
    this.session = await this.store.load();
    return this.session;
  }

  async refreshSession(): Promise<RefreshOutcome> {
    if (!this.session) return { kind: 'none' };
    if (!this.backend.online) return { kind: 'offline' };
    if (!this.backend.sessionValid(this.session)) {
      this.session = null;
      await this.store.clear();
      /*
        AND SAYS SO, as supabase-js does (the first-day trace, 2026-09-25). A refresh the server
        refuses makes the real client remove the session and emit SIGNED_OUT on its own
        (`_removeSession`), before the refresh call itself returns; `AuthContext` answers that event
        with the forced sign-out. The mock emits it at the same moment so Expo Go runs the same path.
      */
      for (const l of this.listeners) l('SIGNED_OUT', null);
      return { kind: 'invalid' };
    }
    const u = this.backend.user(this.session.user.id);
    if (!u) return { kind: 'invalid' };
    const s = await this.establish(u, 'TOKEN_REFRESHED');
    return { kind: 'ok', session: s };
  }

  async signInWithPassword(email: string, password: string): Promise<Session> {
    this.requireOnline();
    const u = this.backend.userByEmail(email);
    if (!u || u.password_digest === null || u.password_digest !== digest(password)) {
      throw new AuthFailure('invalid_credentials');
    }
    if (!u.verified) throw new AuthFailure('email_not_verified');
    this.recoverySession = false;
    /*
      NO UNDO IN HERE (2026-09-27). This used to cancel a pending deletion inside the sign-in
      itself, which Supabase Auth never does — Auth knows nothing of the deletion queue — so the
      test backend kept the promise while a real project broke it, and nothing noticed. The undo
      is the app's call after every sign-in (`auth/keep-account.ts` → `cancelAccountDeletion`),
      and the purge's own check (0131, `purgeDue`), here as there.
    */
    return this.establish(u);
  }

  async signUpWithPassword(email: string, password: string): Promise<SignUpResult> {
    this.requireOnline();
    if (password.length < 10) throw new AuthFailure('weak_password');
    if (this.backend.userByEmail(email)) throw new AuthFailure('email_taken');
    const u = this.backend.createUser(email, password, 'email', false);
    this.backend.issueLink('signup', u.id);
    this.backend.sent.push({ to: u.email, kind: 'verify' });
    await this.backend.save();
    return { session: null, needsVerification: true };
  }

  async sendPasswordReset(email: string): Promise<void> {
    this.requireOnline();
    if (!this.backend.rateLimit(normalizeEmail(email), 'password_reset', 5, 60 * 60_000)) {
      throw new AuthFailure('rate_limited');
    }
    const u = this.backend.userByEmail(email);
    if (u) {
      this.backend.issueLink('recovery', u.id);
      this.backend.sent.push({ to: u.email, kind: 'recovery' });
    }
    await this.backend.save();
  }

  async hasPassword(): Promise<boolean> {
    if (!this.session) return false;
    const u = this.backend.user(this.session.user.id);
    return u?.password_digest != null;
  }

  async updatePassword(newPassword: string, currentPassword?: string): Promise<void> {
    this.requireOnline();
    if (!this.session) throw new AuthFailure('unknown', 'no session');
    if (newPassword.length < 10) throw new AuthFailure('weak_password');
    const u = this.backend.user(this.session.user.id);
    if (!u) throw new AuthFailure('unknown');
    // a recovery link already proved the inbox. A signed-in change has to know the current password.
    if (!this.recoverySession) {
      if (
        currentPassword === undefined ||
        u.password_digest === null ||
        u.password_digest !== digest(currentPassword)
      ) {
        throw new AuthFailure('invalid_credentials');
      }
    }
    this.recoverySession = false;
    u.password_digest = digest(newPassword);
    // every OTHER session ends; this one is re-minted under the new version
    this.backend.revokeSessions(u.id);
    await this.establish(u, 'TOKEN_REFRESHED');
  }

  async resendVerification(email: string): Promise<void> {
    this.requireOnline();
    const u = this.backend.userByEmail(email);
    if (u && !u.verified) {
      this.backend.issueLink('signup', u.id);
      this.backend.sent.push({ to: u.email, kind: 'verify' });
    }
  }

  private async oauth(provider: 'apple' | 'google'): Promise<Session> {
    this.requireOnline();
    this.recoverySession = false;
    const email = provider === 'apple' ? 'parent@privaterelay.appleid.com' : 'parent@gmail.example';
    const u =
      this.backend.userByEmail(email) ?? this.backend.createUser(email, null, provider, true);
    // no undo here either: see `signInWithPassword`
    return this.establish(u);
  }
  signInWithApple(): Promise<Session> {
    return this.oauth('apple');
  }
  signInWithGoogle(): Promise<Session> {
    return this.oauth('google');
  }

  async signOut(scope: 'local' | 'global'): Promise<void> {
    const s = this.session;
    if (s && scope === 'global' && this.backend.online) this.backend.revokeSessions(s.user.id);
    this.session = null;
    await this.store.clear();
    await this.backend.save();
    for (const l of this.listeners) l('SIGNED_OUT', null);
  }

  /**
   * The same answers a real project gives (`supabase.ts`): a return address carrying Auth's reason
   * is that reason, and a link that is not the live one of its kind — opened twice, or replaced by
   * a newer email — is expired-or-used, which is what `/verify` says for both.
   *
   * WHEN THIS PHONE ALREADY CONFIRMED (the owner, 2026-10-02): a second open — cold start's
   * getInitialURL plus the Linking event, or Auth's own `otp_expired` after a prefetch — recovers
   * the live verified session instead of trapping Verify on "expired". Same as `sessionIfEmailConfirmed`
   * on the real provider.
   */
  async handleAuthLink(url: string): Promise<AuthLinkResult> {
    if (!url.startsWith(MOCK_AUTH_PREFIX)) return { kind: 'ignored' };
    const problem = authLinkProblem(url);
    if (problem) {
      if (problem.flow === 'sign_in') {
        const recovered = this.sessionIfVerified();
        if (recovered) return recovered;
      }
      return { kind: 'link_error', problem };
    }
    const q = queryOf(url);
    const type = q.type;
    if (type !== 'signup' && type !== 'magiclink' && type !== 'recovery')
      return { kind: 'ignored' };
    const flow = type === 'recovery' ? 'recovery' : 'sign_in';
    const u = this.backend.user(q.user ?? '');
    // a deleted account's link, or one this test server never sent: Auth refuses both
    if (!u || u.deleted_at) return { kind: 'link_error', problem: { flow, reason: 'failed' } };
    if (!this.backend.redeemLink(url, type, u.id)) {
      if (flow === 'sign_in') {
        const recovered = this.sessionIfVerified();
        if (recovered) return recovered;
      }
      return { kind: 'link_error', problem: { flow, reason: 'expired' } };
    }
    u.verified = true;
    const session = await this.establish(u);
    this.recoverySession = type === 'recovery';
    return type === 'recovery' ? { kind: 'recovery', session } : { kind: 'signed_in', session };
  }

  /** Live session whose address is already confirmed, or null. */
  private sessionIfVerified(): Extract<AuthLinkResult, { kind: 'signed_in' }> | null {
    const s = this.session;
    if (!s) return null;
    const u = this.backend.user(s.user.id);
    if (!u?.verified) return null;
    return { kind: 'signed_in', session: s };
  }

  onAuthStateChange(listener: (event: AuthEvent, session: Session | null) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

/* ================================================================ AccountsApi */

const fail = (status: number, error: string, detail?: string) => ({
  ok: false as const,
  status,
  error,
  ...(detail ? { detail } : {}),
});

/**
 * TODAY, WHERE THE HOUSEHOLD IS — the date `bootstrap_household` checks a birth date against since
 * 0133 (the launch sweep, 2026-09-27). Both used the server's UTC date, so a baby born this morning
 * in Sydney or Tokyo was born "tomorrow" until UTC's midnight, and setup's last step refused the
 * date its first step fills in by itself. The household's zone first, then the profile's, as the
 * function reads them; a zone the platform does not know gets the latest date anywhere on Earth
 * (UTC+14), so it never refuses a real today — the phone has already refused its own future.
 */
function householdToday(payload: BootstrapPayload, nowMs: number): string {
  const p = payload as Partial<BootstrapPayload>;
  const zone = p.household?.home_time_zone?.trim() || p.profile?.time_zone?.trim() || 'UTC';
  return isKnownZone(zone)
    ? localDayKey(zone, nowMs)
    : new Date(nowMs + 14 * 3_600_000).toISOString().slice(0, 10);
}

export class MockAccountsApi implements AccountsApi {
  constructor(
    private readonly backend: MockBackend,
    private readonly auth: MockAuthProvider,
  ) {}

  /** The caller, the way the RPCs see it: auth.uid() plus the verified address. */
  private caller(): { ok: true; user: MockUser } | { ok: false; status: number; error: string } {
    if (!this.backend.online) throw new AuthFailure('offline', 'No connection');
    const s = this.auth.current();
    const u = s ? this.backend.user(s.user.id) : undefined;
    if (!s || !u || !this.backend.sessionValid(s)) return fail(401, 'unauthenticated');
    if (!u.verified) return fail(401, 'unverified_email');
    return { ok: true, user: u };
  }

  /**
   * THE TEST BACKEND HAS NO MODEL, and says so the way a project with no key does (503
   * `not_configured`): the plan is the rule planner's alone, which is what NibbleCue promises then.
   */
  async planIdeas(): Promise<PlanIdeasResult> {
    const c = this.caller();
    if (!c.ok) return c;
    return fail(503, 'not_configured');
  }

  async createHousehold(payload: BootstrapPayload): Promise<CreateHouseholdResult> {
    const c = this.caller();
    if (!c.ok) return c;
    const uid = c.user.id;
    // THE SERVER'S CHECK (0133): a household this person owns NOW — a live OWNER membership of an
    // open household. A household they closed (0143) is not one, so they can set up again.
    const existing = this.backend.state.households.find(
      h => this.backend.membership(h.id, uid)?.role === 'OWNER',
    );
    if (existing) {
      // a retried Finish, a lost 200 or a double tap never makes a second household
      const sameOp = this.backend.state.household_ops[existing.id] === payload.client_op_id;
      if (!sameOp) return fail(409, 'already_owns_household');
      const child = this.backend.state.children.find(ch => ch.household_id === existing.id);
      return {
        ok: true,
        household_id: existing.id,
        child_id: child?.id ?? '',
        role: 'OWNER',
        created: false,
        welcome_granted: false,
        welcome_expires_at: existing.welcome_expires_at,
        welcome_waits_for_birth: existing.welcome_waits_for_birth ?? false,
      };
    }
    /*
      A FAMILY OF YOUR OWN BESIDE THE ONES YOU HELP IN (0154): the limits a join is held to (0153),
      in its order, after the retry above and before anything is checked or written. A caregiver's
      or a viewer's seats elsewhere are fine; a parent's seat anywhere is not, and neither is a
      sixth family.
    */
    const seats = this.backend.liveSeatsElsewhere(uid, '');
    if (seats.length >= MAX_HOUSEHOLDS) return fail(409, 'household_limit');
    if (seats.some(m => m.role === 'OWNER' || m.role === 'PARENT'))
      return fail(409, 'admin_elsewhere');
    const check = validateBootstrapPayload(payload, householdToday(payload, this.backend.now()));
    if (!check.ok) return fail(422, 'validation_error', check.field);
    const p = check.payload;
    const nowIso = new Date(this.backend.now()).toISOString();

    c.user.display_name = p.profile.display_name;
    // a baby on the way (0150): the 14 days are owed and start at the birth (`recordBirth`), and the
    // address is spent then, not now
    const expecting = p.child.birth_date === undefined;
    const fresh = !this.backend.state.welcome_ledger.includes(c.user.email);
    const granted = fresh && !expecting;
    const expires = granted
      ? new Date(this.backend.now() + MOCK_WELCOME_DAYS * DAY).toISOString()
      : null;
    const h: MockHousehold = {
      id: this.backend.newId(),
      name: p.household.name,
      owner_id: uid,
      welcome_expires_at: expires,
      created_at: nowIso,
      heard_from: p.household.heard_from ?? null,
      home_time_zone: p.household.home_time_zone ?? null,
      welcome_waits_for_birth: fresh && expecting,
    };
    this.backend.state.households.push(h);
    this.backend.state.household_ops[h.id] = p.client_op_id;
    this.backend.state.members.push({
      household_id: h.id,
      user_id: uid,
      role: 'OWNER',
      joined_at: nowIso,
      removed_at: null,
    });
    const child: MockChild = {
      id: this.backend.newId(),
      household_id: h.id,
      name: p.child.name,
      birth_date: p.child.birth_date ?? null,
      due_date: p.child.due_date ?? null,
      photo_path: null,
      photo_updated_at: null,
    };
    this.backend.state.children.push(child);
    // one row per registry entry, so a later toggle is a pure update (ACCOUNTS.md §5 step 8)
    for (const m of MODULES) {
      this.backend.state.module_settings.push({
        household_id: h.id,
        module_id: m.id,
        enabled: p.modules ? p.modules.includes(m.id) : m.defaultEnabled,
      });
    }
    if (granted && expires) {
      this.backend.state.welcome_ledger.push(c.user.email);
      /*
        ONE ROW PER PERSON, as the server's `(provider, app_user_id)` is (and as `acceptInvite` below
        reads it). Somebody who joined another family during its preview holds a welcome row filed
        under it: it MOVES to the family they made, with its window (0154). A store row stays put.
      */
      const mine = this.backend.state.entitlements.find(e => e.user_id === uid);
      if (mine === undefined) {
        this.backend.state.entitlements.push({
          user_id: uid,
          household_id: h.id,
          source: 'welcome',
          status: 'ACTIVE',
          current_period_end: expires,
        });
      } else if (mine.source === 'welcome') {
        mine.household_id = h.id;
        mine.status = 'ACTIVE';
        mine.current_period_end = expires;
      }
    }
    await this.backend.save();
    return {
      ok: true,
      household_id: h.id,
      child_id: child.id,
      role: 'OWNER',
      created: true,
      welcome_granted: granted,
      welcome_expires_at: expires,
      welcome_waits_for_birth: fresh && expecting,
    };
  }

  async acceptInvite(input: {
    code?: string;
    token?: string;
    display_name?: string;
  }): Promise<AcceptInviteResult> {
    const c = this.caller();
    if (!c.ok) return c;
    const uid = c.user.id;
    if (!this.backend.rateLimit(uid, 'invite_redeem', REDEEM.limit, REDEEM.window))
      return fail(429, 'rate_limited', 'invite_redeem');
    const now = this.backend.now();
    const code = input.code === undefined ? undefined : normalizeInviteCode(input.code);
    const asCode = input.token === undefined && code !== undefined && isCompleteInviteCode(code);
    if (asCode) {
      const shut = this.backend.guessOpen(false);
      if (shut !== null) return fail(429, 'rate_limited', shut);
    }
    const hit = asCode
      ? this.backend.findInvite({ code })
      : this.backend.findInvite(input.token === undefined ? {} : { token: input.token });
    if (!hit) {
      if (asCode) this.backend.guessSpent(false);
      await this.backend.save();
      return {
        ok: false,
        status: 404,
        error: 'invalid_invite',
        attempts_left: this.backend.attemptsLeft(uid, 'invite_redeem', REDEEM.limit, REDEEM.window),
      };
    }
    if (hit.created_by === uid) return fail(409, 'own_invite');
    if (this.backend.membership(hit.household_id, uid)) return fail(409, 'already_member');
    // SEVERAL FAMILIES, ONE OF THEM YOUR OWN (0153): five seats at most, a parent in one
    const elsewhere = this.backend.liveSeatsElsewhere(uid, hit.household_id);
    if (elsewhere.length >= MAX_HOUSEHOLDS) return fail(409, 'household_limit');
    if (hit.role === 'PARENT' && elsewhere.some(m => m.role === 'OWNER' || m.role === 'PARENT'))
      return fail(409, 'admin_elsewhere');
    // a caregiver's or a viewer's seat is Plus, decided here and never on the inviter's phone (0139)
    if (hit.role !== 'PARENT' && !this.backend.householdHasPlus(hit.household_id))
      return fail(403, 'needs_plus');
    const h = this.backend.state.households.find(x => x.id === hit.household_id);
    if (!h) return fail(404, 'not_found');
    const nowIso = new Date(now).toISOString();
    c.user.display_name =
      input.display_name?.trim() ||
      c.user.display_name ||
      c.user.email.split('@')[0] ||
      'Caregiver';
    // the seat's own clock starts at REDEMPTION, not at creation (migration 0101): a code made
    // on Monday and used on Wednesday gives an evening that runs out on Wednesday night
    const seatEnds =
      hit.seat_hours == null ? null : new Date(now + hit.seat_hours * 3_600_000).toISOString();
    const prior = this.backend.state.members.find(
      m => m.household_id === h.id && m.user_id === uid,
    );
    if (prior) {
      prior.role = hit.role;
      prior.removed_at = null;
      prior.joined_at = nowIso;
      // ALWAYS, so a permanent invite CLEARS a lapsed seat's old date rather than inheriting it
      prior.expires_at = seatEnds;
    } else {
      this.backend.state.members.push({
        household_id: h.id,
        user_id: uid,
        role: hit.role,
        joined_at: nowIso,
        removed_at: null,
        expires_at: seatEnds,
      });
    }
    hit.accepted_by = uid;
    // the joiner inherits the household's remaining days and is granted nothing of their own
    if (
      h.welcome_expires_at &&
      Date.parse(h.welcome_expires_at) > now &&
      !this.backend.state.entitlements.some(e => e.user_id === uid)
    ) {
      this.backend.state.entitlements.push({
        user_id: uid,
        household_id: h.id,
        source: 'welcome',
        status: 'ACTIVE',
        current_period_end: h.welcome_expires_at,
      });
    }
    await this.backend.save();
    return {
      ok: true,
      household_id: h.id,
      household_name: h.name,
      role: hit.role,
      welcome_expires_at: h.welcome_expires_at,
      seat_expires_at: seatEnds,
    };
  }

  /**
   * `check_invite` (0139): no caller needed — this is the one question a signed-out phone asks the
   * server. A right code becomes a CLAIM that lasts as long as a link, and the code stops working;
   * a live link answers with its own token; a caregiver's or a viewer's invite into a household with
   * no Plus now says so and spends nothing; anything else is `invalid_invite`, and a wrong code is
   * counted against this phone and the ceiling, never against a code (0140).
   */
  async checkInvite(input: { code?: string; token?: string }): Promise<CheckInviteResult> {
    if (!this.backend.online) throw new AuthFailure('offline', 'No connection');
    const code = input.code === undefined ? undefined : normalizeInviteCode(input.code);
    if ((code === undefined) === (input.token === undefined))
      return fail(422, 'validation_error', 'code_or_token');
    if (code !== undefined && !isCompleteInviteCode(code))
      return fail(422, 'validation_error', 'code');
    // signed in, the redemption's own limiter; signed out, this phone as the connection (0140)
    const s = this.auth.current();
    if (
      s !== null &&
      !this.backend.rateLimit(s.user.id, 'invite_redeem', REDEEM.limit, REDEEM.window)
    )
      return fail(429, 'rate_limited', 'invite_redeem');
    if (code !== undefined) {
      const shut = this.backend.guessOpen(s === null);
      if (shut !== null) return fail(429, 'rate_limited', shut);
    }
    const hit = this.backend.findInvite(
      code !== undefined ? { code } : input.token !== undefined ? { token: input.token } : {},
    );
    if (!hit) {
      if (code !== undefined) this.backend.guessSpent(s === null);
      await this.backend.save();
      return { ok: false, status: 404, error: 'invalid_invite' };
    }
    const h = this.backend.state.households.find(x => x.id === hit.household_id);
    const inviter = this.backend.user(hit.created_by)?.display_name?.trim() ?? '';
    const preview = {
      household_name: h?.name ?? '',
      inviter_name: inviter,
      role: hit.role,
      seat_hours: hit.seat_hours ?? null,
    };
    if (hit.role !== 'PARENT' && !this.backend.householdHasPlus(hit.household_id))
      return { ok: false, status: 403, error: 'needs_plus', preview };
    if (hit.kind === 'LINK')
      return {
        ok: true,
        token: hit.secret,
        expires_at: new Date(hit.expires_at).toISOString(),
        preview,
      };
    // THE CLAIM: the same household, role, maker and seat length, as a link that outlives the email
    const claim: MockInvite = {
      ...hit,
      id: this.backend.newId(),
      kind: 'LINK',
      secret: this.token(),
      expires_at: this.backend.now() + MOCK_LINK_TTL_MS,
      failed_attempts: 0,
    };
    hit.revoked = true;
    this.backend.state.invites.push(claim);
    await this.backend.save();
    return {
      ok: true,
      token: claim.secret,
      expires_at: new Date(claim.expires_at).toISOString(),
      preview,
    };
  }

  /** `profiles_self_write`: the caller's own name, and nothing else of anybody's. */
  async setDisplayName(name: string): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    const parsed = DisplayNameSchema.safeParse(name);
    if (!parsed.success) return fail(422, 'validation_error', 'display_name');
    c.user.display_name = parsed.data;
    await this.backend.save();
    return { ok: true };
  }

  async bootstrapState(): Promise<AccountState> {
    const c = this.caller();
    const serverNow = this.backend.now();
    if (!c.ok)
      return {
        profile: null,
        memberships: [],
        children: [],
        modules: [],
        entitlement: null,
        serverNow,
        deletionPending: null,
      };
    const uid = c.user.id;
    const memberships = this.backend.state.members
      // the expiry clause again, because this read does not go through `membership()`: a lapsed
      // seat must not find its household still listed at launch, or the app opens on a
      // household every later query will refuse
      .filter(
        m =>
          m.user_id === uid &&
          !m.removed_at &&
          (m.expires_at == null || Date.parse(m.expires_at) > serverNow) &&
          // a closed household is nobody's (0143), as `members_read` over `app.is_member` answers
          !this.backend.closed(m.household_id),
      )
      .map(m => {
        const h = this.backend.state.households.find(x => x.id === m.household_id);
        return {
          household_id: m.household_id,
          household_name: h?.name ?? '',
          role: m.role,
          welcome_expires_at: h?.welcome_expires_at ?? null,
          heard_from: h?.heard_from ?? null,
          home_time_zone: h?.home_time_zone ?? null,
          // the one copy a dev build has: its sync fake never serves a `households` row
          household_created_at: h?.created_at ?? null,
          joined_at: m.joined_at ?? null,
          welcome_waits_for_birth: h?.welcome_waits_for_birth ?? false,
        };
      });
    const ids = new Set(memberships.map(m => m.household_id));
    // THE HOUSEHOLD'S PLAN, not this person's purchase (migration 0101's `my_household_plans`):
    // Plus is bought by one parent and belongs to the household, so the other parent on their
    // own phone meets no paywall. The household shown is `memberships[0]`, as everywhere else.
    const shown = memberships[0]?.household_id ?? null;
    // THE BEST ROW WINS, NOT THE FIRST — `app.household_plan`'s ordering (migration 0134): the
    // row that gives Plus now, by core's own rule (`rowGrantsPlus`), then the one that ended last.
    // A household can hold the joiner's spent welcome grant beside the owner's live subscription,
    // and taking whichever came first would show Plus as expired to the very person it was bought
    // for; a paid year that ended must speak rather than a preview that ended before it.
    const endOf = (e: { current_period_end: string | null }): number =>
      e.current_period_end === null ? -Infinity : Date.parse(e.current_period_end);
    const planOf = (household: string | null): PlanRowInput | null => {
      const ent = this.backend.state.entitlements
        .filter(e => e.household_id === household)
        .sort(
          (a, b) =>
            Number(rowGrantsPlus(b, serverNow)) - Number(rowGrantsPlus(a, serverNow)) ||
            endOf(b) - endOf(a),
        )[0];
      return ent
        ? { status: ent.status, source: ent.source, current_period_end: ent.current_period_end }
        : null;
    };
    const entitlement = planOf(shown);
    // every family's plan, for the switcher (0153): the same rule per household
    const plans: Record<string, PlanRowInput | null> = {};
    for (const m of memberships) plans[m.household_id] = planOf(m.household_id);
    // NibbleCue Plus per household, from its own rows (`nibble_my_plan`, 0162), by the same rule
    const nibblePlans: Record<string, PlanRowInput | null> = {};
    for (const m of memberships) {
      const ent = this.backend.state.nibble_entitlements
        .filter(e => e.household_id === m.household_id)
        .sort(
          (a, b) =>
            Number(rowGrantsPlus(b, serverNow)) - Number(rowGrantsPlus(a, serverNow)) ||
            endOf(b) - endOf(a),
        )[0];
      nibblePlans[m.household_id] = ent
        ? { status: ent.status, source: ent.source, current_period_end: ent.current_period_end }
        : null;
    }
    const del = this.backend.state.deletions[uid];
    return {
      profile: {
        id: uid,
        display_name: c.user.display_name ?? '',
        email: c.user.email,
        terms_version: c.user.terms_version ?? null,
        avatar_path: c.user.avatar_path ?? null,
        avatar_preset: c.user.avatar_preset ?? null,
        avatar_updated_at: c.user.avatar_updated_at ?? null,
      },
      memberships,
      children: this.backend.state.children
        .filter(ch => ids.has(ch.household_id))
        // the picture itself never travels with the row: the column is the PATH, and a caller
        // fetches the image through `childPhotoUrl` the way it would a signed URL
        .map(ch => childRowOf(ch)),
      modules: this.backend.state.module_settings
        .filter(ms => ids.has(ms.household_id))
        .map(ms => ({ ...ms })),
      entitlement,
      plans,
      nibblePlans,
      serverNow,
      deletionPending: del ? { purge_at: del.purge_at } : null,
    };
  }

  async createInvite(
    householdId: string,
    role: Exclude<Role, 'OWNER'>,
    kind: 'CODE' | 'LINK',
    seatHours?: number,
  ): Promise<InviteCreated> {
    const c = this.caller();
    if (!c.ok) return c;
    if (!this.backend.canAdmin(householdId, c.user.id)) return fail(403, 'forbidden');
    if ((role as Role) === 'OWNER') return fail(422, 'validation_error', 'role');
    if (seatHours !== undefined) {
      // an invite OUTLIVES the member who made it, so a member with an end date may not make
      // one at all (`app.can_invite`); and a timed seat may only ever be a CAREGIVER
      if (this.backend.membership(householdId, c.user.id)?.expires_at != null)
        return fail(403, 'forbidden');
      if (role !== 'CAREGIVER') return fail(422, 'validation_error', 'role');
      if (!isSeatLength(seatHours)) return fail(422, 'validation_error', 'seat_hours');
    }
    if (
      !this.backend.rateLimit(householdId, 'invite_create_hour', 10, 60 * 60_000) ||
      !this.backend.rateLimit(householdId, 'invite_create_day', 30, 24 * 60 * 60_000)
    ) {
      return fail(429, 'rate_limited', 'invite_create');
    }
    const now = this.backend.now();
    if (kind === 'CODE') {
      // one live code per household at a time
      for (const i of this.backend.state.invites)
        if (i.household_id === householdId && i.kind === 'CODE' && !i.accepted_by && !i.revoked)
          i.revoked = true;
    }
    const secret = kind === 'CODE' ? this.inviteCode() : this.token();
    const expires_at = now + (kind === 'CODE' ? MOCK_CODE_TTL_MS : MOCK_LINK_TTL_MS);
    this.backend.state.invites.push({
      id: this.backend.newId(),
      household_id: householdId,
      role,
      kind,
      secret,
      created_by: c.user.id,
      expires_at,
      accepted_by: null,
      revoked: false,
      failed_attempts: 0,
      seat_hours: seatHours ?? null,
    });
    await this.backend.save();
    const iso = new Date(expires_at).toISOString();
    const seat = seatHours === undefined ? {} : { seat_hours: seatHours };
    return kind === 'CODE'
      ? { ok: true, kind, code: secret, expires_at: iso, ...seat }
      : {
          ok: true,
          kind,
          url: `cuddlecue-mock://invite/${secret}`,
          token: secret,
          expires_at: iso,
          ...seat,
        };
  }

  /** Deterministic enough for a mock, and never the same twice in a run. */
  private seed = 0.4242;
  private rng(): number {
    this.seed = (this.seed * 9301 + 49297 + this.backend.now() / 1e9) % 233280;
    return (this.seed % 233280) / 233280;
  }
  private token(): string {
    let t = '';
    while (t.length < 43) t += this.rng().toString(36).slice(2);
    return t.slice(0, 43);
  }
  /** Six letters as the server makes them (`drawInviteCode`), never one another live code is. */
  private inviteCode(): string {
    return drawInviteCode(
      () => this.rng(),
      code =>
        this.backend.state.invites.some(
          i => i.kind === 'CODE' && i.secret === code && !i.accepted_by && !i.revoked,
        ),
    );
  }

  async listMembers(householdId: string): Promise<MemberRow[]> {
    const c = this.caller();
    if (!c.ok || !this.backend.membership(householdId, c.user.id)) return [];
    const now = this.backend.now();
    return (
      this.backend.state.members
        // who is here NOW, which is what `household_roster` answers: a lapsed seat is out
        .filter(
          m =>
            m.household_id === householdId &&
            !m.removed_at &&
            (m.expires_at == null || Date.parse(m.expires_at) > now),
        )
        // permanent first, temporary after — the household reads before the guests
        .sort(
          (a, b) =>
            Number(a.expires_at != null) - Number(b.expires_at != null) ||
            a.joined_at.localeCompare(b.joined_at),
        )
        .map(m => {
          const u = this.backend.user(m.user_id);
          return {
            user_id: m.user_id,
            display_name: u?.display_name ?? '',
            email: u?.email ?? null,
            role: m.role,
            joined_at: m.joined_at,
            is_self: m.user_id === c.user.id,
            expires_at: m.expires_at ?? null,
            avatar_path: u?.avatar_path ?? null,
            avatar_preset: u?.avatar_preset ?? null,
            avatar_updated_at: u?.avatar_updated_at ?? null,
          };
        })
    );
  }

  async setRole(householdId: string, userId: string, role: Role): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    if (!this.backend.canAdmin(householdId, c.user.id)) return fail(403, 'forbidden');
    const m = this.backend.membership(householdId, userId);
    if (!m) return fail(404, 'not_a_member');
    if (role === 'OWNER') return fail(422, 'validation_error', 'role'); // ownership moves by transfer only
    if (m.role === 'OWNER') return fail(409, 'last_owner'); // every household needs an owner
    // a seat that ends is never an admin's (migration 0109)
    if (m.expires_at != null && role === 'PARENT') {
      return fail(422, 'validation_error', 'temporary_seat');
    }
    // ONE FAMILY OF YOUR OWN (0155): a caregiver or viewer who is a parent in another family is not
    // made a parent here either — the join refuses the same seat (`admin_elsewhere`, 0153)
    if (
      role === 'PARENT' &&
      m.role !== 'PARENT' &&
      this.backend.adminElsewhere(userId, householdId)
    )
      return fail(409, 'admin_elsewhere');
    m.role = role;
    await this.backend.save();
    return { ok: true };
  }

  /**
   * A REMOVAL, OR A LEAVE (`userId` the caller's own), as the server takes it: an admin ends anybody's
   * seat but the owner's; ANY member ends their own (`members_leave`, 0008), a parent too (Family's
   * "Leave <family>" for a parent, 2026-10-08); the owner's seat never ends this way while the
   * family is open (0008's last-owner guard; the last person closes it instead, `leaveHousehold`).
   * Only `removed_at` is written (0158: an ending changes nothing else about the seat), and a seat
   * that has ended is not found (`membership` reads live seats), so it is never written again.
   */
  async removeMember(householdId: string, userId: string): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    const self = userId === c.user.id;
    if (!self && !this.backend.canAdmin(householdId, c.user.id)) return fail(403, 'forbidden');
    const m = this.backend.membership(householdId, userId);
    if (!m) return fail(404, 'not_a_member');
    if (m.role === 'OWNER') return fail(409, 'last_owner');
    m.removed_at = new Date(this.backend.now()).toISOString(); // never a row delete: history keeps its author
    await this.backend.save();
    return { ok: true };
  }

  async transferOwnership(householdId: string, newOwnerId: string): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    const h = this.backend.state.households.find(x => x.id === householdId);
    if (!h || h.owner_id !== c.user.id) return fail(403, 'forbidden');
    const target = this.backend.membership(householdId, newOwnerId);
    if (!target) return fail(404, 'not_a_member');
    if (target.expires_at != null) return fail(422, 'validation_error', 'temporary_seat'); // 0109
    // 0155: a caregiver who is a parent elsewhere is not handed a second family to own
    if (target.role !== 'PARENT' && this.backend.adminElsewhere(newOwnerId, householdId))
      return fail(409, 'admin_elsewhere');
    const me = this.backend.membership(householdId, c.user.id);
    h.owner_id = newOwnerId;
    target.role = 'OWNER';
    if (me) me.role = 'PARENT';
    await this.backend.save();
    return { ok: true };
  }

  /**
   * `leave_household_alone` (0143), in the order the server takes it: a live member of an open
   * household (anyone else hears `forbidden`), nobody else live in it (`not_alone`, and nothing
   * changes: a lapsed seat or somebody removed is nobody), then the close — every invite still out
   * revoked, the household closed for `CLOSED_HOUSEHOLD_DAYS`, and the caller's membership ended
   * with its row, role and date kept for the restore.
   */
  async leaveHousehold(householdId: string): Promise<LeaveHouseholdResult> {
    const c = this.caller();
    if (!c.ok) return c;
    const uid = c.user.id;
    const h = this.backend.state.households.find(x => x.id === householdId);
    const me = this.backend.membership(householdId, uid);
    if (h === undefined || me === undefined) return fail(403, 'forbidden');
    if (this.backend.othersLive(householdId, uid)) return fail(409, 'not_alone');
    const now = this.backend.now();
    const closedAt = new Date(now).toISOString();
    const purgeAt = new Date(now + CLOSED_HOUSEHOLD_DAYS * DAY).toISOString();
    for (const i of this.backend.state.invites)
      if (i.household_id === householdId && !i.accepted_by && !i.revoked) i.revoked = true;
    h.closed_at = closedAt;
    h.closed_by = uid;
    h.purge_at = purgeAt;
    me.removed_at = closedAt;
    await this.backend.save();
    return {
      ok: true,
      household_id: h.id,
      household_name: h.name,
      closed_at: closedAt,
      purge_after: purgeAt,
      restorable: true,
    };
  }

  /**
   * `restore_household` (0143): only the person who closed it (anybody else, an open household and
   * an unknown id all hear `not_found`), only before `purge_at` (`window_passed`, whether or not the
   * purge has run), and only while they are live in no other household (`in_another_household`).
   * The membership comes back as it was: the same row, its role, its date.
   */
  async restoreHousehold(householdId: string): Promise<RestoreHouseholdResult> {
    const c = this.caller();
    if (!c.ok) return c;
    const uid = c.user.id;
    const h = this.backend.state.households.find(x => x.id === householdId);
    const row = this.backend.state.members.find(
      m => m.household_id === householdId && m.user_id === uid,
    );
    if (h === undefined || h.closed_at == null || h.closed_by !== uid || row === undefined)
      return fail(404, 'not_found');
    if (h.purge_at == null || Date.parse(h.purge_at) <= this.backend.now())
      return fail(409, 'window_passed');
    if (this.backend.otherHousehold(uid, householdId)) return fail(409, 'in_another_household');
    h.closed_at = null;
    h.closed_by = null;
    h.purge_at = null;
    row.removed_at = null;
    await this.backend.save();
    return { ok: true, household_id: h.id, household_name: h.name, role: row.role };
  }

  /** The caller's own store row gives Plus now, by core's row rule (`entitlement_read`'s view). */
  async storeSubscription(): Promise<{ ok: true; active: boolean } | ApiFailureLike> {
    const c = this.caller();
    if (!c.ok) return c;
    const now = this.backend.now();
    return {
      ok: true,
      active: this.backend.state.entitlements.some(
        e => e.user_id === c.user.id && e.source === 'store' && rowGrantsPlus(e, now),
      ),
    };
  }

  async setHomeTimeZone(householdId: string, zone: string): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    const h = this.backend.state.households.find(x => x.id === householdId);
    // OWNER only, like `set_home_time_zone`; a stranger and a parent alike are a 403
    if (!h || this.backend.membership(householdId, c.user.id)?.role !== 'OWNER') {
      return fail(403, 'forbidden');
    }
    // the server checks the name against Postgres's own list; here the platform's is the stand-in
    if (!isKnownZone(zone)) return fail(422, 'validation_error', 'zone');
    h.home_time_zone = zone;
    await this.backend.save();
    return { ok: true };
  }

  async renameHousehold(householdId: string, name: string): Promise<Outcome> {
    if (!this.backend.online) throw new AuthFailure('offline', 'No connection');
    const c = this.caller();
    if (!c.ok) return c;
    const h = this.backend.state.households.find(x => x.id === householdId);
    // OWNER only, like `rename_household`; a stranger and a parent alike are a 403
    if (
      !h ||
      h.closed_at != null ||
      this.backend.membership(householdId, c.user.id)?.role !== 'OWNER'
    ) {
      return fail(403, 'forbidden');
    }
    const named = HouseholdNameSchema.safeParse(name);
    if (!named.success) return fail(422, 'validation_error', 'name');
    h.name = named.data;
    await this.backend.save();
    return { ok: true };
  }

  async addChild(householdId: string, input: AddChildInput): Promise<AddChildResult> {
    const c = this.caller();
    if (!c.ok) return c;
    if (!this.backend.canAdmin(householdId, c.user.id)) return fail(403, 'forbidden'); // children_write
    const check = checkNewChild(
      {
        name: input.name,
        birth_date: input.birth_date,
        due_date: input.due_date,
        // a baby on the way (0150) comes with its due date and no birth date
        expecting: input.birth_date === null,
      },
      new Date(this.backend.now()).toISOString().slice(0, 10),
    );
    if (!check.ok) return fail(422, 'validation_error', `child.${check.field}`);
    const child: MockChild = {
      id: this.backend.newId(),
      household_id: householdId,
      name: check.value.name,
      birth_date: check.value.birth_date,
      due_date: check.value.due_date,
      photo_path: null,
      photo_updated_at: null,
    };
    this.backend.state.children.push(child);
    await this.backend.save();
    return { ok: true, child: childRowOf(child) };
  }

  async updateChild(
    householdId: string,
    childId: string,
    input: { name: string; birth_date: string | null },
  ): Promise<AddChildResult> {
    const c = this.caller();
    if (!c.ok) return c;
    if (!this.backend.canAdmin(householdId, c.user.id)) return fail(403, 'forbidden');
    const child = this.backend.state.children.find(
      x => x.id === childId && x.household_id === householdId,
    );
    if (!child) return fail(404, 'not_found');
    // a baby on the way: the name only. The birth is record_birth, which starts the 14 days.
    if (child.birth_date === null) {
      if (input.birth_date !== null) return fail(422, 'validation_error', 'child.birth_date');
      const named = ChildNameSchema.safeParse(input.name);
      if (!named.success) return fail(422, 'validation_error', 'child.name');
      child.name = named.data;
      await this.backend.save();
      return { ok: true, child: childRowOf(child) };
    }
    if (input.birth_date === null) return fail(422, 'validation_error', 'child.birth_date');
    const check = checkChildCorrection(
      { name: input.name, birth_date: input.birth_date, due_date: child.due_date },
      new Date(this.backend.now()).toISOString().slice(0, 10),
    );
    if (!check.ok) return fail(422, 'validation_error', `child.${check.field}`);
    child.name = check.value.name;
    child.birth_date = check.value.birth_date;
    await this.backend.save();
    return { ok: true, child: childRowOf(child) };
  }

  /**
   * `record_birth` (0150), check for check: a member who may admin the household, the same date twice
   * is the same answer and another one a 409, a date after the household's today or a year from the
   * due date a 422, and the 14 days started for every member when the household is owed them and the
   * owner's address has never had them.
   */
  async recordBirth(
    childId: string,
    birthDate: string,
    name: string | null,
  ): Promise<RecordBirthResult> {
    const c = this.caller();
    if (!c.ok) return c;
    const child = this.backend.state.children.find(x => x.id === childId);
    const h = child && this.backend.state.households.find(x => x.id === child.household_id);
    if (!child || !h || !this.backend.membership(h.id, c.user.id)) return fail(404, 'not_found');
    if (!this.backend.canAdmin(h.id, c.user.id)) return fail(403, 'forbidden');
    if (child.birth_date !== null) {
      if (child.birth_date !== birthDate) return fail(409, 'already_born');
      return {
        ok: true,
        child_id: child.id,
        birth_date: child.birth_date,
        name: child.name,
        welcome_granted: false,
        welcome_expires_at: h.welcome_expires_at,
      };
    }
    const zone = h.home_time_zone ?? 'UTC';
    const today = isKnownZone(zone)
      ? localDayKey(zone, this.backend.now())
      : new Date(this.backend.now() + 14 * 3_600_000).toISOString().slice(0, 10);
    if (!birthOnRecordable(birthDate, child.due_date, today))
      return fail(422, 'validation_error', 'birth_date');
    let named = child.name;
    if (name !== null) {
      const n = ChildNameSchema.safeParse(name);
      if (!n.success) return fail(422, 'validation_error', 'name');
      named = n.data;
    }
    child.birth_date = birthDate;
    child.name = named;
    let granted = false;
    if (h.welcome_waits_for_birth === true) {
      const owner = this.backend.state.members.find(
        m => m.household_id === h.id && m.role === 'OWNER' && m.removed_at === null,
      );
      const email = owner ? this.backend.user(owner.user_id)?.email : undefined;
      if (email === undefined || !this.backend.state.welcome_ledger.includes(email)) {
        granted = true;
        const expires = new Date(this.backend.now() + MOCK_WELCOME_DAYS * DAY).toISOString();
        h.welcome_expires_at = expires;
        if (email !== undefined) this.backend.state.welcome_ledger.push(email);
        /*
          THE OWNER'S WELCOME ROW MOVES HERE (0154's `record_birth`), as `createHousehold` moves it
          at setup: one row per person, and an owner who joined another family during its preview
          holds one filed under it. A store row stays put; so does every other member's, which may
          be filed under a family they are a parent in.
        */
        const ownRow = owner
          ? this.backend.state.entitlements.find(e => e.user_id === owner.user_id)
          : undefined;
        if (ownRow?.source === 'welcome') {
          ownRow.household_id = h.id;
          ownRow.status = 'ACTIVE';
          ownRow.current_period_end = expires;
        }
        // every member, as a joiner gets the household's remaining days (`acceptInvite`)
        for (const m of this.backend.state.members) {
          if (m.household_id !== h.id || m.removed_at !== null) continue;
          if (this.backend.state.entitlements.some(e => e.user_id === m.user_id)) continue;
          this.backend.state.entitlements.push({
            user_id: m.user_id,
            household_id: h.id,
            source: 'welcome',
            status: 'ACTIVE',
            current_period_end: expires,
          });
        }
      }
      h.welcome_waits_for_birth = false;
    }
    await this.backend.save();
    return {
      ok: true,
      child_id: child.id,
      birth_date: birthDate,
      name: named,
      welcome_granted: granted,
      welcome_expires_at: h.welcome_expires_at,
    };
  }

  /* --------------------------------------------------------------- the baby's picture */

  /**
   * The same two checks the bucket's policies make, in the same order: a session, then
   * `app.can_admin` on the household that owns the path. A caregiver gets the 403 here that
   * `child_photo_write` would give them on the real thing, so the sheet's copy is exercised
   * against the fake and not only against a server nobody has yet.
   */
  async setChildPhoto(
    householdId: string,
    childId: string,
    jpeg: Uint8Array,
  ): Promise<{ ok: true; photo: ChildPhotoSaved } | ApiFailure> {
    const c = this.caller();
    if (!c.ok) return c;
    if (!this.backend.canAdmin(householdId, c.user.id)) return fail(403, 'forbidden');
    const child = this.backend.state.children.find(
      x => x.id === childId && x.household_id === householdId,
    );
    if (!child) return fail(404, 'not_found');
    if (jpeg.byteLength === 0) return fail(422, 'validation_error', 'photo.empty');
    if (jpeg.byteLength > CHILD_PHOTO_MAX_BYTES) return fail(413, 'too_large', 'photo.bytes');
    const photo_updated_at = new Date(this.backend.now()).toISOString();
    child.photo_path = childPhotoPath(householdId, childId);
    child.photo_updated_at = photo_updated_at;
    child.photo_data = `data:${CHILD_PHOTO_CONTENT_TYPE};base64,${base64Of(jpeg)}`;
    await this.backend.save();
    return { ok: true, photo: { photo_path: child.photo_path, photo_updated_at } };
  }

  async clearChildPhoto(householdId: string, childId: string): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    if (!this.backend.canAdmin(householdId, c.user.id)) return fail(403, 'forbidden');
    const child = this.backend.state.children.find(
      x => x.id === childId && x.household_id === householdId,
    );
    if (!child) return fail(404, 'not_found');
    child.photo_path = null;
    child.photo_updated_at = null;
    delete child.photo_data;
    await this.backend.save();
    return { ok: true };
  }

  /**
   * The fake's "signed URL". It re-checks MEMBERSHIP off the path's first segment, which is
   * what `child_photo_read` does — so a path pointing at another household comes back null
   * here too, and the guard in `childPhotoBelongsTo` has something to be the second line of.
   */
  async childPhotoUrl(path: string): Promise<string | null> {
    const c = this.caller();
    if (!c.ok) return null;
    const parsed = parseChildPhotoPath(path);
    if (parsed === null) return null;
    if (!this.backend.membership(parsed.householdId, c.user.id)) return null;
    const child = this.backend.state.children.find(
      x => x.id === parsed.childId && x.household_id === parsed.householdId,
    );
    return child?.photo_data ?? null;
  }

  /* ------------------------------------------------------- the member's own picture (0148) */

  /**
   * The caller's own picture, as the server keeps it: the session is the subject (no argument names
   * a person), the photo's bytes stand in the fake bucket beside the row, and the stamp is the
   * backend's clock whatever the phone believes, as `profiles_picture_stamp` makes it.
   */
  async setMemberPhoto(
    jpeg: Uint8Array,
  ): Promise<{ ok: true; picture: MemberPictureSaved } | ApiFailure> {
    const c = this.caller();
    if (!c.ok) return c;
    if (jpeg.byteLength === 0) return fail(422, 'validation_error', 'photo.empty');
    if (jpeg.byteLength > MEMBER_PHOTO_MAX_BYTES) return fail(413, 'too_large', 'photo.bytes');
    c.user.avatar_data = `data:${MEMBER_PHOTO_CONTENT_TYPE};base64,${base64Of(jpeg)}`;
    return this.pictureRow(c.user, memberPhotoPath(c.user.id), null);
  }

  async setMemberDrawing(
    id: string,
  ): Promise<{ ok: true; picture: MemberPictureSaved } | ApiFailure> {
    const c = this.caller();
    if (!c.ok) return c;
    // `profiles_avatar_preset_shape`: the server keeps no list of drawings, only their shape
    if (!isMemberAvatarId(id)) return fail(422, 'validation_error', 'avatar_preset');
    return this.pictureRow(c.user, null, id);
  }

  async clearMemberPicture(): Promise<{ ok: true; picture: MemberPictureSaved } | ApiFailure> {
    const c = this.caller();
    if (!c.ok) return c;
    return this.pictureRow(c.user, null, null);
  }

  /** The fake's signed URL, re-checking the read policy (`member_photo_read`) off the path. */
  async memberPhotoUrl(path: string): Promise<string | null> {
    const c = this.caller();
    if (!c.ok) return null;
    const parsed = parseMemberPhotoPath(path);
    if (parsed === null) return null;
    if (!this.backend.seesMemberPhoto(c.user.id, parsed.userId)) return null;
    const owner = this.backend.user(parsed.userId);
    return owner?.avatar_path === path ? (owner.avatar_data ?? null) : null;
  }

  private async pictureRow(
    u: MockUser,
    path: string | null,
    preset: string | null,
  ): Promise<{ ok: true; picture: MemberPictureSaved }> {
    u.avatar_path = path;
    u.avatar_preset = preset;
    u.avatar_updated_at = new Date(this.backend.now()).toISOString();
    // a photo nobody's row names any more is deleted, as the Supabase provider deletes its object
    if (path === null) delete u.avatar_data;
    await this.backend.save();
    return {
      ok: true,
      picture: { avatar_path: path, avatar_preset: preset, avatar_updated_at: u.avatar_updated_at },
    };
  }

  /**
   * The same checks the bucket's policies make, in the same order: a session, then
   * `app.can_write` on the household that owns the path — a WIDER predicate than the child
   * photo's `can_admin`, because attaching a picture to a feed is part of logging the feed.
   * A caregiver who can log gets a real `ok` here; one whose seat has lapsed gets the 403 the
   * server would give them, so the drain's "a refusal is final" branch is exercised against
   * the fake and not only against a server nobody has yet.
   */
  async setEntryPhoto(
    householdId: string,
    activityId: string,
    jpeg: Uint8Array,
  ): Promise<{ ok: true; photo: EntryPhotoStored } | ApiFailure> {
    const c = this.caller();
    if (!c.ok) return c;
    if (!this.backend.canWrite(householdId, c.user.id)) return fail(403, 'forbidden');
    if (jpeg.byteLength === 0) return fail(422, 'validation_error', 'photo.empty');
    if (jpeg.byteLength > ENTRY_PHOTO_MAX_BYTES) return fail(413, 'too_large', 'photo.bytes');
    const path = entryPhotoPath(householdId, activityId);
    this.backend.state.entry_photos[path] =
      `data:${ENTRY_PHOTO_CONTENT_TYPE};base64,${base64Of(jpeg)}`;
    await this.backend.save();
    // NOT the activity row: that is the outbox's, and the mock has no activities to stamp
    return {
      ok: true,
      photo: { photo_path: path, photo_updated_at: new Date(this.backend.now()).toISOString() },
    };
  }

  async clearEntryPhoto(householdId: string, activityId: string): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    if (!this.backend.canWrite(householdId, c.user.id)) return fail(403, 'forbidden');
    delete this.backend.state.entry_photos[entryPhotoPath(householdId, activityId)];
    await this.backend.save();
    return { ok: true };
  }

  /** The fake's signed URL, re-checking MEMBERSHIP off the path — `entry_photo_read`'s rule. */
  async entryPhotoUrl(path: string): Promise<string | null> {
    const c = this.caller();
    if (!c.ok) return null;
    const parsed = parseEntryPhotoPath(path);
    if (parsed === null) return null;
    if (!this.backend.membership(parsed.householdId, c.user.id)) return null;
    return this.backend.state.entry_photos[path] ?? null;
  }

  async setModuleEnabled(
    householdId: string,
    moduleId: ModuleId,
    enabled: boolean,
  ): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    if (!this.backend.canAdmin(householdId, c.user.id)) return fail(403, 'forbidden'); // settings_write is OWNER/PARENT
    const row = this.backend.state.module_settings.find(
      ms => ms.household_id === householdId && ms.module_id === moduleId,
    );
    if (!row) return fail(404, 'not_found');
    row.enabled = enabled; // the only write; nothing else changes
    await this.backend.save();
    return { ok: true };
  }

  async acceptTerms(version: number): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    if (!Number.isInteger(version) || version < 1) return fail(422, 'validation_error');
    // the record is the highest version accepted, as the server's upsert keeps it
    c.user.terms_version = Math.max(c.user.terms_version ?? 0, version);
    await this.backend.save();
    return { ok: true };
  }

  /** `register_device`: the caller's own install, never another account's (0121). */
  async registerDevice(d: DeviceRegistration): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    if (d.pushToken !== null && (d.pushToken.length > 4096 || d.pushProvider === null)) {
      return fail(422, 'validation_error', 'push_token');
    }
    const held = this.backend.devices.get(d.deviceId);
    if (held !== undefined && held.userId !== c.user.id) return fail(403, 'forbidden');
    if (d.pushToken !== null) {
      // the token moved with the phone: whichever other install held it lets it go
      for (const [id, other] of this.backend.devices) {
        if (id !== d.deviceId && other.pushToken === d.pushToken) {
          this.backend.devices.set(id, { ...other, pushToken: null, pushProvider: null });
        }
      }
    }
    this.backend.devices.set(d.deviceId, { ...d, userId: c.user.id });
    return { ok: true };
  }

  async forgetDevice(deviceId: string): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    const held = this.backend.devices.get(deviceId);
    if (held?.userId === c.user.id) {
      this.backend.devices.set(deviceId, { ...held, pushToken: null, pushProvider: null });
      this.backend.claims.delete(deviceId);
    }
    return { ok: true };
  }

  async claimLocalReminders(
    deviceId: string,
    slots: readonly ReminderSlotClaim[],
  ): Promise<Outcome> {
    const c = this.caller();
    if (!c.ok) return c;
    if (slots.length > 200) return fail(422, 'validation_error', 'slots');
    if (this.backend.devices.get(deviceId)?.userId !== c.user.id) return fail(403, 'forbidden');
    this.backend.claims.set(deviceId, [...slots]);
    return { ok: true };
  }

  /**
   * Nothing to look at: the mock store writes its entitlement into this same backend as it sells
   * (`billing/mock.ts`), so by the time anybody asks, the row is already where the account reads it.
   */
  async syncSubscription(): Promise<Outcome> {
    const c = this.caller();
    return c.ok ? { ok: true } : c;
  }

  async requestAccountDeletion(): Promise<{ ok: true; purge_at: string } | ApiFailureLike> {
    const c = this.caller();
    if (!c.ok) return c;
    const uid = c.user.id;
    // a household they closed is not one they are in (0143): nothing there to transfer
    for (const h of this.backend.state.households.filter(
      x => x.owner_id === uid && x.closed_at == null,
    )) {
      // somebody live: a sitter's seat that has ended is nobody here either (0145)
      if (this.backend.othersLive(h.id, uid))
        return fail(409, 'transfer_or_delete_household_first', h.id);
    }
    // a sole-member household goes with the account; the 14 days are undo, not retention
    const purge_at = new Date(this.backend.now() + MOCK_DELETION_WINDOW_DAYS * DAY).toISOString();
    this.backend.state.deletions[uid] = {
      requested_at: new Date(this.backend.now()).toISOString(),
      purge_at,
    };
    this.backend.revokeSessions(uid);
    await this.backend.save();
    return { ok: true, purge_at };
  }

  /**
   * 0131's undo. The server cancels only for a session that began after the request; here the
   * request revoked every session there was (`requestAccountDeletion`), so a caller whose session
   * is still valid signed in after it — `caller()` is the same rule in the mock's own terms.
   */
  async cancelAccountDeletion(): Promise<{ ok: true; cancelled: boolean } | ApiFailureLike> {
    const c = this.caller();
    if (!c.ok) return c;
    const pending = this.backend.state.deletions[c.user.id] !== undefined;
    if (!pending) return { ok: true, cancelled: false };
    delete this.backend.state.deletions[c.user.id];
    await this.backend.save();
    return { ok: true, cancelled: true };
  }
}

type ApiFailureLike = { ok: false; status: number; error: string; detail?: string };
