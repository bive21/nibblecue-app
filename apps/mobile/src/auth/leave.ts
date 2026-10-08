/**
 * LEAVING A HOUSEHOLD NOBODY ELSE IS IN, AND BRINGING IT BACK (migration 0143; the owner,
 * 2026-09-29: *"Should a household with nobody else in it get a 'Leave' option?"* *"Yes."*).
 *
 * The dead end it opens: a partner set up a household of their own by mistake, and one account holds
 * one household (0139), so the join they meant to make was refused and the only way round was a
 * second account. Now the last person in a household can leave it:
 *
 *   Family      "Leave this household", only while the roster is them alone (core's `aloneIn`), and a
 *               confirmation that says what happens (`screens/more/LeaveHouseholdSection.tsx`)
 *   the leave   what the phone owes the household is sent first — an entry that has not synced would
 *               otherwise stay behind on this phone rather than in the household that is kept — then
 *               `leave_household_alone`, which counts again on the server (`not_alone`)
 *   the phone   the household leaves it by the one path a household ever leaves a phone:
 *               `AuthContext`'s account read, `mirror.ts`'s `end_household`, and the household
 *               teardown (database, sync, reminders, widgets, its preferences), and then Ended, where
 *               a signed-in person with no household lands: a code, their own household, sign out
 *   Ended       "Bring back <name>" until the purge date, from what the close answered, kept here
 *               per account (`LeftHousehold`) and swept by sign-out like the rest of the account's
 *
 * WHY THE PHONE KEEPS WHAT THE CLOSE SAID. The server will not say anything about a household to
 * somebody who is not in it — that is the whole of `app.is_member` — so the only record of the
 * household the person may bring back is the answer to their own leave. It is kept on this phone
 * for this account; another phone, or this one after a sign-out, shows Ended without the button,
 * and the household is still purged on its own date.
 *
 * Pure but for the calls it is handed, so every branch is a node test (`leave.test.ts`).
 */
import type { LastHousehold, Role } from '@nibblecue/core';
import { z } from 'zod';
import type { DutyStep, OnDuty } from '../household/switchDuty';
import type { KeyValueStore } from '../prefs';
import {
  AuthFailure,
  type LeaveHouseholdResult,
  type Outcome,
  type RestoreHouseholdResult,
} from './providers/types';

/** What the close answered, kept so Ended can offer it back until its purge date. */
export interface LeftHousehold {
  id: string;
  name: string;
  /** When it is deleted for good: the server's own date, never the phone's arithmetic. */
  purge_at: string;
  /** When this phone left it. */
  left_at: number;
}

/** Per account, in the preferences store; a household teardown keeps it (`prefs/index.ts`). */
export const leftHouseholdKey = (userId: string): string => `left_household:${userId}`;

const Stored = z.object({
  id: z.string().min(1).max(64),
  name: z.string().max(200),
  purge_at: z.string().max(64),
  left_at: z.number(),
});

export async function saveLeftHousehold(
  store: KeyValueStore,
  userId: string,
  left: LeftHousehold,
): Promise<void> {
  await store.set(leftHouseholdKey(userId), JSON.stringify(left));
}

/** This account's record, or null for none — and for one that does not parse. */
export async function loadLeftHousehold(
  store: KeyValueStore,
  userId: string,
): Promise<LeftHousehold | null> {
  const raw = await store.get(leftHouseholdKey(userId)).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = Stored.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const clearLeftHousehold = (store: KeyValueStore, userId: string): Promise<void> =>
  store.remove(leftHouseholdKey(userId));

/**
 * LETTING GO OF A HOUSEHOLD THAT CAN NO LONGER COME BACK: its record, and this phone's memory of it
 * as the last household it showed (`lastKey`, AuthContext's `LAST_HOUSEHOLD`) when that memory is
 * of the same household. Its time is up, so it is deleted or about to be, and Ended's ordinary words
 * ("your time with … has ended", "every entry you made stays with the household") would be two
 * untrue sentences about it. With no memory the account gets setup, the honest fallback
 * `core/accounts/standing.ts` describes, whose first page has the code door as well. A memory of
 * another household (one joined since, and left or removed from) is that household's, and stays.
 * Returns whether the memory went too.
 */
export async function forgetLeftHousehold(
  store: KeyValueStore,
  userId: string,
  householdId: string,
  lastKey: string,
): Promise<boolean> {
  await clearLeftHousehold(store, userId).catch(() => undefined);
  const raw = await store.get(lastKey).catch(() => null);
  const same = raw !== null && idOf(raw) === householdId;
  if (same) await store.remove(lastKey).catch(() => undefined);
  return same;
}

/** The `id` a stored memory names, or undefined for one that does not parse. */
function idOf(raw: string): unknown {
  try {
    return (JSON.parse(raw) as { id?: unknown } | null)?.id;
  } catch {
    return undefined;
  }
}

/**
 * WHETHER "BRING BACK" IS STILL WORTH OFFERING: before the server's purge date. The server decides
 * in the end (`window_passed`); this only keeps a button off the page that cannot work, on a clock
 * that may be a little off either way. A plain yes or no, not a type guard: a record whose time is
 * up is still a record, and the caller that lets it go needs its id.
 */
export const restorable = (left: LeftHousehold | null, now: number): boolean => {
  if (left === null) return false;
  const until = Date.parse(left.purge_at);
  return !Number.isNaN(until) && until > now;
};

/**
 * THE DAY IT IS KEPT UNTIL, as a person says a date: "October 29" in the phone's own words for it.
 * The day before the purge, since the purge takes it at the time of day it was closed: "kept until
 * October 28" is never a promise the server breaks by an afternoon.
 */
export function keptUntilLabel(purgeAt: string, locale?: string, timeZone?: string): string {
  const at = Date.parse(purgeAt);
  if (Number.isNaN(at)) return '';
  return new Date(at - 86_400_000).toLocaleDateString(locale, {
    month: 'long',
    day: 'numeric',
    ...(timeZone === undefined ? {} : { timeZone }),
  });
}

/* ------------------------------------------------------------------ the leave */

/**
 * WHAT LEAVING CAME TO:
 *
 *   left       closed on the server; the record to keep, for Ended's "Bring back"
 *   not_alone  somebody else is in it now (the server's count), so it stays open
 *   unsynced   entries this phone logged have not reached the household yet: nothing was sent to the
 *              server, so an entry never stays behind on a phone whose household is leaving it
 *   offline    no answer
 *   failed     anything else
 */
export type LeaveOutcome =
  | { kind: 'left'; left: LeftHousehold }
  | { kind: 'not_alone' }
  | { kind: 'unsynced'; count: number }
  | { kind: 'offline' }
  | { kind: 'failed' };

export interface LeaveDeps {
  /** Send what the phone owes the household, within a budget: the teardown's own step 2, earlier. */
  flush(): Promise<void>;
  /**
   * How many entries are still on their way after the flush: `PENDING` and `SENDING`. A `FAILED` row
   * is not counted — the server has already refused it for good, and the teardown keeps it under the
   * person (docs/ACCOUNTS.md §6.3) exactly as a sign-out would.
   */
  owed(): Promise<number>;
  leave(): Promise<LeaveHouseholdResult>;
  now(): number;
}

export async function leaveAlone(deps: LeaveDeps): Promise<LeaveOutcome> {
  try {
    await deps.flush();
    const owed = await deps.owed();
    if (owed > 0) return { kind: 'unsynced', count: owed };
    const r = await deps.leave();
    if (r.ok)
      return {
        kind: 'left',
        left: {
          id: r.household_id,
          name: r.household_name,
          purge_at: r.purge_after,
          left_at: deps.now(),
        },
      };
    if (r.status === 409 && r.error === 'not_alone') return { kind: 'not_alone' };
    return { kind: 'failed' };
  } catch (err) {
    return err instanceof AuthFailure && err.code === 'offline'
      ? { kind: 'offline' }
      : { kind: 'failed' };
  }
}

/* ------------------------------------------------------------------ bringing it back */

/**
 * WHAT BRINGING IT BACK CAME TO:
 *
 *   restored        open again, and this person in it as they were: the account read shows it
 *   gone            it cannot come back: its time is up, or it is not this person's to bring back.
 *                   The phone lets go of it (`forgetLeftHousehold`), so the button goes with it
 *   in_household    this account is in another household now; one household per account (0139)
 *   offline         no answer
 *   failed          anything else
 */
export type RestoreOutcome =
  | { kind: 'restored'; household_id: string; household_name: string }
  | { kind: 'gone' }
  | { kind: 'in_household' }
  | { kind: 'offline' }
  | { kind: 'failed' };

export async function restoreLeft(
  restore: () => Promise<RestoreHouseholdResult>,
): Promise<RestoreOutcome> {
  let r: RestoreHouseholdResult;
  try {
    r = await restore();
  } catch (err) {
    return err instanceof AuthFailure && err.code === 'offline'
      ? { kind: 'offline' }
      : { kind: 'failed' };
  }
  if (r.ok)
    return { kind: 'restored', household_id: r.household_id, household_name: r.household_name };
  if (r.status === 404 || (r.status === 409 && r.error === 'window_passed'))
    return { kind: 'gone' };
  if (r.status === 409 && r.error === 'in_another_household') return { kind: 'in_household' };
  return { kind: 'failed' };
}

/* ------------------------------------------------------------------ leaving a seat */

/**
 * LEAVING A FAMILY OTHERS ARE STILL IN: a caregiver or a viewer (the verification sweep of
 * 2026-10-08), and a PARENT who is not the owner (the owner, 2026-10-08: "build everything"). The
 * limit's sentence and the five-families sheet said "leave one first, from Family in More", and
 * Family offered Leave only to somebody alone in the family (0143): a sitter in five families, every
 * one of them with its parents in it, had no door at all, and neither had a parent who wanted out.
 *
 * The server has always let a member end their own seat: `members_leave` (0008) is an UPDATE of the
 * caller's own row that sets `removed_at` (and, since 0158, nothing else), and the last-owner guard
 * stops an owner. So this is `removeMember(household, self)`, the very write a parent's Remove makes,
 * and the family then leaves the phone by the road a removal takes (`AuthContext` `leaveSeat`).
 *
 * THE RULE FOR PARENTS, THE CHEAPEST REVERSIBLE ONE (a decision the owner can change; flagged in the
 * report of 2026-10-08):
 *
 *   · A PARENT who is not the owner leaves exactly as a caregiver does. Their entries stay, the
 *     family goes on with its owner, and nothing about the family is decided for anybody else. The
 *     server already allowed it (an admin's own `removed_at`, under `members_leave` and
 *     `members_manage` alike), so it needs no new server rule, and undoing it is drawing the row
 *     for caregivers and viewers only again: `canLeaveSeat` alone.
 *   · THE OWNER does not leave a family others are in. Who runs it next is a choice about other
 *     people's family, and the app already has the one way to make it: Family's "Make owner"
 *     (`transfer_ownership`). So the owner's row says "Make someone else the owner first" and
 *     offers that very transfer (`mustHandOnFirst`); once handed on they are a parent, and the
 *     parent's Leave is there. The server says the same: 0008's last-owner guard refuses an
 *     owner's own `removed_at` while the family is open (`Every household needs an owner`), and
 *     0143 lets the last person close it instead. Nothing was built that hands the family on by
 *     itself (to the longest-serving parent, say): that would be a product decision made silently.
 *   · A parent's store subscription is not touched (CLAUDE.md rule 14): the family keeps its Plus
 *     until the store next speaks, and then it follows the person (`apply_store_event`, 0122). The
 *     confirmation says so in one line when they have one (`LEAVE.store`).
 */
export const canLeaveSeat = (role: Role | null | undefined): boolean =>
  role === 'CAREGIVER' || role === 'VIEW_ONLY' || role === 'PARENT';

/** The owner of a family others are in: hands it on before leaving (see `canLeaveSeat`). */
export const mustHandOnFirst = (role: Role | null | undefined): boolean => role === 'OWNER';

/**
 * WHAT LEAVING A SEAT CAME TO:
 *
 *   left        the seat is ended on the server; the family leaves the phone next
 *   on_duty     this person is on for the family (who's on), and has not said yes to handing the
 *               shift back: nothing was written, the page asks (`household/switchDuty.ts`)
 *   unsynced    entries this phone logged for the family have not reached it yet: nothing was sent,
 *               so an entry never stays behind on a phone whose family is leaving it (rule 7)
 *   offline     no connection: nothing was sent
 *   not_allowed this seat is not one the app lets go of here (the owner's)
 *   failed      anything else
 */
export type SeatLeaveOutcome =
  | { kind: 'left' }
  | { kind: 'on_duty'; duty: OnDuty }
  | { kind: 'unsynced'; count: number }
  | { kind: 'offline' }
  | { kind: 'not_allowed' }
  | { kind: 'failed' };

export interface SeatLeaveDeps {
  /** The role this person holds in the family on screen. */
  role: Role | null | undefined;
  /** Whether the phone has a connection right now. */
  online(): Promise<boolean>;
  /**
   * THE DUTY STEP, exactly as a switch takes it (`switchDuty.ts` `dutyBeforeSwitch`): with
   * `handBack` false it only reads; with true, and a connection, it writes the list without this
   * person's shifts, for the flush below to send before the seat ends.
   */
  duty(handBack: boolean): Promise<DutyStep>;
  /** The person said yes to "Leave anyway?" (the hand-back). */
  handBackDuty?: boolean;
  /** Send what the phone owes the family, within the leave's budget (`leaveAlone`'s own step). */
  flush(): Promise<void>;
  /** How many entries are still on their way after it, `FAILED` rows aside (`LeaveDeps.owed`). */
  owed(): Promise<number>;
  /** `removeMember(household, self)`. */
  leave(): Promise<Outcome>;
}

/*
  ON DUTY, ASKED FIRST (2026-10-08). The seat ending takes this person out of who can be on, so every
  other phone stops counting their shift once it has the change; but until then the list says this
  phone has the family's night, and this phone is about to stop ringing for it. So a leave is never
  silent about it, as a switch is not: it stops (`on_duty`), the page asks "Leave anyway?", and a
  yes writes the list without their shifts (the switch's own hand-back) before the flush sends it.
  With no connection nothing is written and nothing changes.
*/
export async function leaveSeat(deps: SeatLeaveDeps): Promise<SeatLeaveOutcome> {
  if (!canLeaveSeat(deps.role)) return { kind: 'not_allowed' };
  try {
    if (!(await deps.online())) return { kind: 'offline' };
    const duty = await deps.duty(deps.handBackDuty === true);
    if (duty.kind === 'on_duty') return { kind: 'on_duty', duty: duty.duty };
    if (duty.kind === 'offline') return { kind: 'offline' };
    if (duty.kind === 'failed') return { kind: 'failed' };
    await deps.flush();
    const owed = await deps.owed();
    if (owed > 0) return { kind: 'unsynced', count: owed };
    const r = await deps.leave();
    if (r.ok) return { kind: 'left' };
    // the owner guard's words, should a role have changed meanwhile
    if (r.status === 409) return { kind: 'not_allowed' };
    return { kind: 'failed' };
  } catch (err) {
    return err instanceof AuthFailure && err.code === 'offline'
      ? { kind: 'offline' }
      : { kind: 'failed' };
  }
}

/**
 * THE DEVICE WRITES DOWN THAT THIS ACCOUNT LEFT (2026-10-08; core `endedReading`). The memory of the
 * household last shown (`last_household:<uid>`, AuthContext's `LAST_HOUSEHOLD`) is what Ended is
 * decided from and what names the family on it; a seat this person ended themselves is marked on
 * that same memory, so Ended says "You left Lee's family" rather than that their time ran out.
 *
 * ONE RECORD, SO IT CANNOT GO STALE: the next family this phone shows writes its own memory without
 * the mark (the account read, `adopt`), so a later removal from another family, or from this one
 * after being invited back, reads as the ordinary words again. A household teardown keeps the key
 * (`prefs/index.ts`), and a sign-out sweeps it with the rest of the account's.
 */
export async function rememberLeaving(
  store: KeyValueStore,
  lastKey: string,
  household: { id: string; name: string },
): Promise<LastHousehold> {
  const last: LastHousehold = { id: household.id, name: household.name, left: true };
  await store.set(lastKey, JSON.stringify(last));
  return last;
}
