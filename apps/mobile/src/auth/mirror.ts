/**
 * WHAT THE PHONE DOES WHEN IT MAY NO LONGER BE IN THE HOUSEHOLD ITS MIRROR HOLDS
 * (docs/ACCOUNTS.md §4 and §7.3, docs/OFFLINE_SYNC.md §4). Pure: the account read and the teardown
 * belong to `AuthContext.tsx`, the order they happen in to `refusedPull.ts`; this is only the
 * decision, so every row of it is a test.
 *
 * TWO SIGNALS SAY IT, built at different times and never reconciled until 2026-09-25:
 *
 *   - a PULL REFUSED. `sync_pull` answers `CC403` when the caller is not a member (migration 0010,
 *     WP4 D37), and `42501` reaches the same place from the other side — pull.ts's `onForbidden`.
 *     It used to sign the person out on the spot: no sentence on the sign-in screen, and the
 *     sign-out swept `last_household:<uid>`, so signing back in asked for a baby's date of birth.
 *   - an ACCOUNT READ that no longer lists the household (`bootstrapState`, at launch and after an
 *     action). It led to `phase: 'ended'` and deleted nothing: the old household's rows stayed in
 *     the one local database, while the screen said they were no longer on this phone.
 *
 * THE RULE: the account read is the witness, and it is asked first. A refused pull alone never
 * deletes anything — a grant dropped by a migration, or a server bug, answers a member exactly the
 * way a removal does, and must not cost a parent their mirror or their queue.
 *
 *   trigger       session    the read                                   verdict
 *   ------------  ---------  -----------------------------------------  --------------
 *   account read             no mirror on this phone                    adopt
 *                            could not be made, or names nobody         hold
 *                            still lists the mirror's household         adopt
 *                            no longer lists it                         end_household
 *   pull refused             the app has moved on from that household   hold
 *                 unchecked  could not be made, or names nobody         check_session
 *                 good       could not be made                          hold
 *                 good       answered, and names nobody                 sign_out
 *                            still lists the household                  adopt
 *                            no longer lists it                         end_household
 *
 *   adopt          write the read as the account, exactly as before; nothing is deleted
 *   hold           keep the account the app has, write nothing, delete nothing
 *   end_household  the household-only teardown (`teardown.ts`, scope `household`): the session
 *                  stays, and the fresh read is written only after it — the phase is `ended`
 *   check_session  ask the session before believing the read (`afterSessionCheck`)
 *   sign_out       the forced sign-out a refused pull always got, now with its own sentence on
 *                  AUTH and with `last_household:<uid>` kept, so signing in again opens on Ended
 *
 * "NAMES NOBODY" is a read without this account's profile in it. Supabase answers an
 * unauthenticated read with empty tables rather than an error (`providers/supabase.ts`
 * `bootstrapState`), and an empty read looks exactly like a removal. Everyone who was ever in a
 * household has a profile row they can read themselves (`bootstrap_household` and `accept_invite`
 * both write it; `profiles_self_read`), so a read with no profile is a read that could not see
 * this person at all — evidence of nothing about the household.
 *
 * WHY THE SESSION IS ASKED BEFORE ANYBODY IS SIGNED OUT (the adversarial review, 2026-09-25). The
 * likeliest refusal of all is not a removal: an hour in the background expires the access token,
 * a flaky network fails the refresh, auth-js keeps that failure for a minute, and meanwhile
 * supabase-js sends the project's key in place of the person's token. `sync_pull` is revoked from
 * that key (`42501`), and the account read that follows fails the same way — so a parent who had
 * done nothing but put the phone down was signed out. Now an unreadable or nameless read asks the
 * session first, in the refresh reducer's own terms (`session.ts` `reduceRefresh`): refused, and
 * it is the session that ended; unreachable, and nothing is decided now; good, and the account is
 * read again. Only a session that is good and a read that still ANSWERS without this person signs
 * out on the household's account — a read that fails outright is no answer at all.
 */
import type { AccountState } from './providers/types';
import type { SessionEffect } from './session';

export type MirrorTrigger = 'account_read' | 'pull_refused';

export type MirrorVerdict = 'adopt' | 'hold' | 'end_household' | 'check_session' | 'sign_out';

export interface MirrorCheck {
  trigger: MirrorTrigger;
  /** The signed-in account. */
  userId: string;
  /**
   * The household this phone's mirror holds: `memberships[0]` of the account the app is showing,
   * which is what `SyncProvider` keys the one sync engine and the one database on. Null for none.
   */
  mirror: string | null;
  /** For a refused pull: the household the pull asked for. */
  refused?: string;
  /**
   * For a refused pull: whether the session has been asked yet. `good` is a refresh the server
   * accepted just now; until then a read that cannot see this person is not believed.
   */
  session?: 'unchecked' | 'good';
  /** The fresh account read, or null when it could not be made. */
  read: Pick<AccountState, 'profile' | 'memberships'> | null;
}

/** A read that sees this account: its own profile row came back. */
export const readNames = (read: Pick<AccountState, 'profile'>, userId: string): boolean =>
  read.profile?.id === userId;

const lists = (read: Pick<AccountState, 'memberships'>, householdId: string): boolean =>
  read.memberships.some(m => m.household_id === householdId);

export function mirrorVerdict(c: MirrorCheck): MirrorVerdict {
  if (c.trigger === 'pull_refused') {
    // a late answer about a household the app is no longer showing decides nothing: whatever moved
    // the app on (a sign-out, a household teardown, a join) already settled that mirror
    if (c.mirror === null || c.refused !== c.mirror) return 'hold';
    if (c.read === null || !readNames(c.read, c.userId)) {
      if ((c.session ?? 'unchecked') === 'unchecked') return 'check_session';
      // the session is good: a read that failed outright is no answer, one that answered
      // without this person is the only thing left to go on
      return c.read === null ? 'hold' : 'sign_out';
    }
    return lists(c.read, c.mirror) ? 'adopt' : 'end_household';
  }
  // nothing on this phone to tear down: the read is written as it always was, and the phase
  // follows from it (`ended` when this device remembers a household, setup when it does not)
  if (c.mirror === null) return 'adopt';
  if (c.read === null || !readNames(c.read, c.userId)) return 'hold';
  return lists(c.read, c.mirror) ? 'adopt' : 'end_household';
}

/** What a refused pull does with the session's answer. */
export type SessionCheckVerdict = 'reread' | 'sign_out_session' | 'hold';

/**
 * THE SESSION'S ANSWER, read the way the refresh loop reads it (`session.ts` `reduceRefresh`'s
 * effect), so the two can never disagree about the same answer:
 *
 *   none             the refresh was accepted: the session is good — read the account again
 *   forced_sign_out  refused, revoked, gone: it is the SESSION that ended, and the sign-out says
 *                    so in its own words (`ForcedSignOut` 'session'), not the household's
 *   schedule_retry   no answer (no network, a server fault): nothing is decided, nothing deleted;
 *                    the next refused pull after `REFUSAL_RECHECK_MS` asks again
 */
export function afterSessionCheck(effect: SessionEffect): SessionCheckVerdict {
  if (effect === 'none') return 'reread';
  if (effect === 'forced_sign_out') return 'sign_out_session';
  return 'hold';
}

/**
 * HOW LONG A REFUSED PULL, SETTLED WITH NOTHING DELETED, IS TAKEN AT ITS WORD when the same
 * household's pull is refused again: the account still listed it (a server-side fault — a grant, a
 * bug), or nothing could be confirmed (the session unreachable). The pull tick is 30 seconds
 * (`PULL_TICK_MS`): without this, every tick would spend an account read — seven requests — and
 * perhaps a refresh to learn the same thing again. A removal that lands inside the window is
 * noticed when it closes; nothing is deleted meanwhile either way.
 */
export const REFUSAL_RECHECK_MS = 5 * 60_000;

/** Whether a refused pull is worth asking about again, given the last one settled quietly. */
export function recheckDue(
  settled: { householdId: string; atMs: number } | null,
  householdId: string,
  nowMs: number,
): boolean {
  if (settled === null || settled.householdId !== householdId) return true;
  return nowMs - settled.atMs >= REFUSAL_RECHECK_MS;
}

/**
 * WHETHER WRITING AN ACCOUNT READ LIFTS THE DATABASE LATCH FIRST (the adversarial review,
 * 2026-09-25). A household teardown closes the latch and leaves it closed (`teardown.ts`), and
 * `SyncProvider` used to be the only thing that lifted it — in its effect, which runs AFTER the
 * effects of everything mounted beneath it. So the commit that shows the next household (a code
 * entered on Ended, or setup finished from it) mounted screens whose first reads were refused
 * (`LocalDbStoppedError`), and each had to wait for a retry or a pull to paint.
 *
 * It lifts only for a household about to be SHOWN that the phone is not showing now, and never
 * while any teardown runs or once nobody is signed in: a sign-out's latch is closed precisely so
 * that nothing recreates the file it deletes, and nothing here may open it again.
 */
export function latchLifts(c: {
  /** The household the read will show: its `memberships[0]`, or null. */
  showing: string | null;
  /** The household the phone shows now, or null. */
  mirror: string | null;
  tearingDown: boolean;
  signedIn: boolean;
}): boolean {
  if (c.tearingDown || !c.signedIn) return false;
  return c.showing !== null && c.showing !== c.mirror;
}
