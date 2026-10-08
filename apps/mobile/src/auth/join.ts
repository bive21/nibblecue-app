/**
 * JOINING SOMEBODY ELSE'S HOUSEHOLD: what a redemption came to, and the note the joiner is owed
 * (the owner's report of 2026-09-29: *"there was no text saying if i joined or not … after joining
 * the household, add confirmation text"*).
 *
 * THE FLOW THIS SERVES (docs/AUTH_AND_TRIAL.md §2.1):
 *
 *   signed out   the code sheet CHECKS the code (`check_invite`, 0139) and holds what it said —
 *                whose household, which seat — and AUTH asks for an account to join it
 *   an account   the moment one exists with no household, the held invite is REDEEMED on its own
 *                (`AuthContext`, through `redeemInvite` below): no second button to find
 *   joined       a note is written (`JoinNote`), and the first page in the household is the
 *                confirmation that reads it — "You joined Dana's family" — with the joiner's name,
 *                then Today. Never a toast over a page that is already changing
 *   not joined   every answer has its words and its next step (`screens/auth/copy.ts`)
 *
 * Pure but for the two calls it is handed, so every branch is a node test (`join.test.ts`), and the
 * code sheet, the auto-join and "Try again" all read one answer the same way.
 */
import { isRole, type Role } from '@nibblecue/core';
import { z } from 'zod';
import type { KeyValueStore } from '../prefs';
import type { HeldInvite } from './held-invite';
import {
  AuthFailure,
  type AcceptInviteResult,
  type AccountState,
  type CheckInviteResult,
  type InvitePreview,
} from './providers/types';

/**
 * A join that did not land and left the invite as it was: nothing about the invite was decided.
 *
 *   offline       no answer at all: it is sent again the moment the phone is back online
 *   rate_limited  five tries in ten minutes (`invite_redeem`)
 *   codes_paused  a thousand wrong codes in ten minutes from everybody: codes wait, links do not
 *                 (`invite_codes_paused`, 0140)
 *   needs_plus    a caregiver's or a viewer's seat, and the household has no Plus now (0139)
 *   unverified    the address is not confirmed yet (a join is only tried for a confirmed one)
 *   failed        anything else the server said
 */
export type JoinProblem =
  | 'offline'
  | 'rate_limited'
  | 'codes_paused'
  | 'needs_plus'
  | 'unverified'
  /** 0153: five families already; or a PARENT invite while a parent in another family. */
  | 'household_limit'
  | 'admin_elsewhere'
  | 'failed';

export type RedeemOutcome =
  | {
      kind: 'joined';
      household_id: string;
      household_name: string;
      role: Role;
      /** When a temporary seat ends; null for one that does not, or when the server did not say. */
      seat_expires_at: string | null;
    }
  /**
   * The server will never take this invite from this person: it is let go, and the page says why.
   * `attempts_left` is the limiter's count for a wrong code, which the sheet shows from the third.
   */
  | { kind: 'refused'; reason: 'refused' | 'own'; attempts_left?: number }
  /** The account is in a household already, and one account holds one household (0139). */
  | { kind: 'in_household'; current: string }
  | { kind: 'kept'; problem: JoinProblem };

export interface RedeemDeps {
  accept(input: {
    code?: string;
    token?: string;
    display_name?: string;
  }): Promise<AcceptInviteResult>;
  /** The account, read again; null when it could not be read. */
  read(): Promise<AccountState | null>;
  /**
   * The families the account was in BEFORE this try (household ids), when the caller already knows
   * them. Absent, they are read once first (`read`), so a refusal can never be taken for a join into
   * a family the person was in all along (below).
   */
  held?: readonly string[];
}

const secretOf = (invite: HeldInvite): { code?: string; token?: string } =>
  invite.token ? { token: invite.token } : invite.code ? { code: invite.code } : {};

/**
 * The household a join added, from the account read after it, as a join's answer — or null for
 * none.
 *
 * SEVERAL FAMILIES (0153) MADE "THE ACCOUNT SHOWS A HOUSEHOLD" MEAN NOTHING ABOUT THIS JOIN. The
 * Join sheet now opens for somebody in a family already, and a mistyped, used or expired code came
 * back `invalid_invite`, the read after it showed the family on screen, and that family was taken
 * for the one joined: the sheet closed and "You joined Dana's family" opened over Dana's own family
 * (the scenario test `families.scenario.test.ts` B, 2026-10-08). So the household counted is one
 * the account did NOT hold before the try. When what it held could not be read, only an account in
 * exactly one family is read the old way (the auto-join's case, an account that had none); with
 * more, nothing can be told, and the server's answer stands.
 */
function joinedFrom(
  read: AccountState | null,
  before: readonly string[] | null,
): RedeemOutcome | null {
  const memberships = read?.memberships ?? [];
  const here =
    before === null
      ? memberships.length === 1
        ? memberships[0]
        : undefined
      : memberships.find(m => !before.includes(m.household_id));
  if (here === undefined) return null;
  return {
    kind: 'joined',
    household_id: here.household_id,
    household_name: here.household_name,
    role: here.role,
    seat_expires_at: null,
  };
}

/**
 * ONE JOIN, AND WHAT IT CAME TO.
 *
 * Called for an account the phone has READ: with no household in it (the auto-join, the code sheet
 * on setup and on Ended), or since 0153 with families below the limit (Family's Join sheet). "The
 * account now shows a household it did not hold before" means "this join landed" in the two answers
 * that read it again (`joinedFrom`):
 *
 *   · a used code is refused like any dead code, and it is the one a join meets when it went
 *     through and the read after it did not (the connection dropped between the two, 2026-09-27);
 *   · `already_member` is somebody the server already counts in that household.
 *
 * `in_another_household` names the household the account is in, read again, so the words can.
 */
export async function redeemInvite(
  deps: RedeemDeps,
  invite: HeldInvite,
  displayName: string | null,
): Promise<RedeemOutcome> {
  // what the account held before, so an answer read afterwards can tell a new family from an old one
  const before =
    deps.held ??
    (await deps.read().then(
      a => (a === null ? null : a.memberships.map(m => m.household_id)),
      () => null,
    ));
  let r: AcceptInviteResult;
  try {
    r = await deps.accept({
      ...secretOf(invite),
      ...(displayName !== null && displayName.trim() !== ''
        ? { display_name: displayName.trim() }
        : {}),
    });
  } catch (err) {
    return {
      kind: 'kept',
      problem: err instanceof AuthFailure && err.code === 'offline' ? 'offline' : 'failed',
    };
  }
  if (r.ok)
    return {
      kind: 'joined',
      household_id: r.household_id,
      household_name: r.household_name,
      role: r.role,
      seat_expires_at: r.seat_expires_at ?? null,
    };
  switch (r.error) {
    case 'invalid_invite': {
      const left =
        'attempts_left' in r && typeof r.attempts_left === 'number' ? r.attempts_left : null;
      return (
        joinedFrom(await deps.read().catch(() => null), before) ?? {
          kind: 'refused',
          reason: 'refused',
          ...(left !== null ? { attempts_left: left } : {}),
        }
      );
    }
    case 'own_invite':
      return { kind: 'refused', reason: 'own' };
    // in that family already: a join that landed before (the read shows a family it did not hold),
    // or, in several, one of the families on the phone, which the server does not name
    case 'already_member':
      return (
        joinedFrom(await deps.read().catch(() => null), before) ?? {
          kind: 'kept',
          problem: 'failed',
        }
      );
    case 'in_another_household': {
      const read = await deps.read().catch(() => null);
      return { kind: 'in_household', current: read?.memberships[0]?.household_name ?? '' };
    }
    case 'needs_plus':
      return { kind: 'kept', problem: 'needs_plus' };
    // several families (0153): nothing about the invite is decided, so it is kept for another try
    case 'household_limit':
      return { kind: 'kept', problem: 'household_limit' };
    case 'admin_elsewhere':
      return { kind: 'kept', problem: 'admin_elsewhere' };
    case 'rate_limited':
      return {
        kind: 'kept',
        problem:
          'detail' in r && r.detail === 'invite_codes_paused' ? 'codes_paused' : 'rate_limited',
      };
  }
  // only an unconfirmed address is sent to the inbox; any other 401 is a token that lapsed, and the
  // next try goes with a fresh one
  if (r.status === 401 && r.error === 'unverified_email')
    return { kind: 'kept', problem: 'unverified' };
  return { kind: 'kept', problem: 'failed' };
}

/* ------------------------------------------------------------------ the code sheet */

/**
 * WHAT THE CODE SHEET IS FOR, from the phase (`sheets/JoinCodeSheet.tsx`):
 *
 *   check         signed out: the code is checked, and an account comes next
 *   join          signed in with no household (setup, Ended): the code joins, now
 *   in_household  signed in with one: nothing to type — one account holds one household (0139)
 */
export type SheetMode = 'check' | 'join' | 'in_household';
export const sheetModeOf = (phase: string, canJoinAnother = false): SheetMode =>
  phase === 'signed_out'
    ? 'check'
    : phase === 'ready'
      ? // in a family already: a second one joins (0153), unless the account is at the limit
        canJoinAnother
        ? 'join'
        : 'in_household'
      : 'join';

/* ------------------------------------------------------------------ the check before an account */

/**
 * WHAT THE CODE SHEET DOES WITH A CHECK'S ANSWER, signed out (`check_invite`, 0139):
 *
 *   found      hold the token it answered with — for a code, the claim that outlives the email —
 *              and what it said; the sheet names the household and asks for an account
 *   unchecked  the server has no check to make: hold the code as typed, as before 0139, and
 *              say so honestly (no name to give)
 *   refused    nothing is held; the sheet says why where the code was typed
 */
export type CheckOutcome =
  | { kind: 'found'; token: string; preview: InvitePreview }
  | { kind: 'unchecked' }
  | {
      kind: 'refused';
      /**
       * `rate_limited` is the account's five tries in ten minutes (signed in); `connection_limited`
       * this connection's ten wrong codes an hour (signed out) and `codes_paused` everybody's
       * thousand in ten minutes (0140). The last two leave a link working, and say so.
       */
      reason:
        'wrong' | 'needs_plus' | 'rate_limited' | 'connection_limited' | 'codes_paused' | 'failed';
      preview: InvitePreview | null;
    };

export function checkOutcomeOf(r: CheckInviteResult): CheckOutcome {
  if (r.ok) return { kind: 'found', token: r.token, preview: r.preview };
  if (r.error === 'unavailable') return { kind: 'unchecked' };
  if (r.error === 'needs_plus' && 'preview' in r)
    return { kind: 'refused', reason: 'needs_plus', preview: r.preview };
  if (r.error === 'invalid_invite' || r.error === 'validation_error')
    return { kind: 'refused', reason: 'wrong', preview: null };
  if (r.error === 'rate_limited') {
    const detail = 'detail' in r ? r.detail : undefined;
    return {
      kind: 'refused',
      reason:
        detail === 'invite_guess_conn'
          ? 'connection_limited'
          : detail === 'invite_codes_paused'
            ? 'codes_paused'
            : 'rate_limited',
      preview: null,
    };
  }
  return { kind: 'refused', reason: 'failed', preview: null };
}

/* ------------------------------------------------------------------ the note the joiner is owed */

/**
 * WHAT THE FIRST PAGE IN THE HOUSEHOLD SAYS, written the moment the join's answer comes back and
 * kept on the phone until the person has read it (`screens/auth/JoinedScreen.tsx`):
 *
 *   joined    "You joined Dana's family", the seat, and their name
 *   not_used  an invite held while signing in to an account that already had a household, or one
 *             opened while in one: said, never dropped without a word (it used to be)
 *
 * Per account (`join_note:<uid>`), in the preferences store: a killed app shows it again, and
 * sign-out sweeps it with the rest of the account's keys (`prefs/index.ts`) — as does a household
 * leaving the phone, since a note about joining a household that has gone says nothing true.
 */
export type JoinNote =
  | {
      kind: 'joined';
      household_id: string;
      household_name: string;
      role: Role;
      /** How long a temporary seat lasts, in hours; null for one that does not end. */
      seat_hours: number | null;
      at: number;
    }
  | { kind: 'not_used'; current: string; invited: string; why?: NotUsedWhy; at: number };

/**
 * WHY A HELD INVITE WAS NOT USED, so the page says the true reason (the owner, 2026-10-07, on a
 * parent's code refused to a parent: the page said "5 families are the most an account can be in"
 * to somebody in one). Absent on a note an older build wrote, which reads as `in_one`.
 *
 *   parent_elsewhere  a parent's invite to somebody who is a parent in another family (0153)
 *   limit             the account is in `MAX_HOUSEHOLDS` families already
 *   in_one            the server holds one family per account (before 0153), or the reason is not known
 *   dead              the invite no longer works (used, expired, revoked)
 */
export type NotUsedWhy = 'parent_elsewhere' | 'limit' | 'in_one' | 'dead';

/** The reason a join's answer gives, for the note (`NotUsedWhy`). */
export function notUsedWhyOf(out: RedeemOutcome, belowLimit: boolean): NotUsedWhy {
  if (out.kind === 'refused') return 'dead';
  if (out.kind === 'in_household') return belowLimit ? 'in_one' : 'limit';
  if (out.kind === 'kept' && out.problem === 'admin_elsewhere') return 'parent_elsewhere';
  if (out.kind === 'kept' && out.problem === 'household_limit') return 'limit';
  return 'in_one';
}

export const joinNoteKey = (userId: string): string => `join_note:${userId}`;

const Name = z.string().max(200);
const StoredNote = z.union([
  z.object({
    kind: z.literal('joined'),
    household_id: z.string().max(64),
    household_name: Name,
    role: z.string().refine(isRole),
    seat_hours: z.number().positive().nullable(),
    at: z.number(),
  }),
  z.object({
    kind: z.literal('not_used'),
    current: Name,
    invited: Name,
    why: z.enum(['parent_elsewhere', 'limit', 'in_one', 'dead']).optional(),
    at: z.number(),
  }),
]);

/**
 * A seat's length in hours, from what the check said or else from when the server says it ends —
 * rounded to the hour, since it was made a moment ago and a length is what a person is told.
 */
export function seatHoursOf(
  previewHours: number | null | undefined,
  seatExpiresAt: string | null,
  now: number,
): number | null {
  if (typeof previewHours === 'number' && previewHours > 0) return previewHours;
  if (seatExpiresAt === null) return null;
  const end = Date.parse(seatExpiresAt);
  if (Number.isNaN(end) || end <= now) return null;
  return Math.max(1, Math.round((end - now) / 3_600_000));
}

export async function saveJoinNote(
  store: KeyValueStore,
  userId: string,
  note: JoinNote,
): Promise<void> {
  await store.set(joinNoteKey(userId), JSON.stringify(note));
}

/** The note on disk for this account, or null for none — and for one that does not parse. */
export async function loadJoinNote(store: KeyValueStore, userId: string): Promise<JoinNote | null> {
  const raw = await store.get(joinNoteKey(userId)).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = StoredNote.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const n = parsed.data;
    if (n.kind === 'joined') return { ...n, role: n.role as Role };
    const { why, ...rest } = n;
    return why === undefined ? rest : { ...rest, why };
  } catch {
    return null;
  }
}

export const clearJoinNote = (store: KeyValueStore, userId: string): Promise<void> =>
  store.remove(joinNoteKey(userId));
