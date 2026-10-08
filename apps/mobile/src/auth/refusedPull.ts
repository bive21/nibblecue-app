/**
 * A REFUSED PULL, SETTLED — the order things happen in when the household's pull is refused (WP4
 * D37; `mirror.ts` decides every step). Pure of React: `AuthContext.tsx` hands in the account read,
 * the session check and its own effects, so a test drives the whole of it against the test backend
 * (`refusedPull.test.ts`).
 *
 * THE ORDER IS THE POINT, and each step waits on the one before it:
 *
 *   1. the account is read — nothing has been deleted, and nobody signed out;
 *   2. a read that cannot see this person asks the SESSION before it is believed, because the
 *      likeliest refusal of all is a token that lapsed while the phone was down, not a removal
 *      (`mirror.ts` says how that happens);
 *   3. only then does anything leave the phone — and only what the answers say should.
 *
 * AFTER EVERY WAIT IT LOOKS AGAIN (`overtaken`): a teardown started meanwhile — a sign-out the
 * person tapped, the auth client dropping its session — or a session that changed owns whatever
 * happens next, and this does nothing more.
 */
import { afterSessionCheck, mirrorVerdict, type MirrorVerdict } from './mirror';
import type { AccountState } from './providers/types';
import type { ForcedSignOut, SessionEffect } from './session';

export interface RefusedPullDeps {
  /** The signed-in account. */
  userId: string;
  /** The household whose pull was refused. */
  householdId: string;
  /** The household the app shows right now — asked again after every wait. */
  mirror(): string | null;
  /** Something else owns what happens next: a teardown under way, or this session gone or replaced. */
  overtaken(): boolean;
  /** The account read (`bootstrapState`); null when it could not be made at all. */
  read(): Promise<AccountState | null>;
  /** Ask the session (`refreshSession`), answered as the refresh loop reads it (`reduceRefresh`). */
  checkSession(): Promise<SessionEffect>;
  /** Write a read as the account; false when it was not written (a teardown started meanwhile). */
  adopt(read: AccountState): Promise<boolean>;
  /** Take the household off the phone, session kept; false when a sign-out followed it instead. */
  endHousehold(): Promise<boolean>;
  /** The forced sign-out, with the reason AUTH gives for it. */
  signOut(why: ForcedSignOut): Promise<void>;
  /** The boot log. */
  log(line: string): void;
}

/**
 *   kept        the account still lists the household: nothing deleted, the read written
 *   held        nothing could be confirmed, or the app had moved on: nothing deleted or written
 *   ended       the household left the phone, the session stayed, the read was written
 *   signed_out  the session had ended, or the household's account could not be seen by a good one
 *   overtaken   something else took over part-way
 */
export type RefusedPullOutcome = 'kept' | 'held' | 'ended' | 'signed_out' | 'overtaken';

export async function settleRefusedPull(d: RefusedPullDeps): Promise<RefusedPullOutcome> {
  const decide = (read: AccountState | null, session: 'unchecked' | 'good'): MirrorVerdict =>
    mirrorVerdict({
      trigger: 'pull_refused',
      userId: d.userId,
      mirror: d.mirror(),
      refused: d.householdId,
      session,
      read,
    });

  d.log('sync: the household’s pull was refused — reading the account before anything goes');
  let read = await d.read();
  if (d.overtaken()) return 'overtaken';
  let verdict = decide(read, 'unchecked');

  if (verdict === 'check_session') {
    d.log('sync: the account read could not see this person — asking the session first');
    const next = afterSessionCheck(await d.checkSession());
    if (d.overtaken()) return 'overtaken';
    d.log(`sync: the session answered — ${next}`);
    if (next === 'hold') return 'held';
    if (next === 'sign_out_session') {
      await d.signOut('session');
      return 'signed_out';
    }
    read = await d.read();
    if (d.overtaken()) return 'overtaken';
    verdict = decide(read, 'good');
  }

  d.log(`sync: the refused pull settled — ${verdict}`);
  if (verdict === 'sign_out') {
    await d.signOut('household');
    return 'signed_out';
  }
  // `hold`, and `check_session` cannot come twice: the session has been asked by now
  if (verdict !== 'adopt' && verdict !== 'end_household') return 'held';
  if (read === null) return 'held';
  if (verdict === 'end_household') {
    if (!(await d.endHousehold())) return 'signed_out';
    return (await d.adopt(read)) ? 'ended' : 'overtaken';
  }
  return (await d.adopt(read)) ? 'kept' : 'overtaken';
}
