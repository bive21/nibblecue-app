import { describe, expect, it } from 'vitest';
import {
  afterSessionCheck,
  latchLifts,
  mirrorVerdict,
  readNames,
  recheckDue,
  REFUSAL_RECHECK_MS,
  type MirrorCheck,
  type SessionCheckVerdict,
} from './mirror';
import type { AccountState, Membership } from './providers/types';
import { reduceRefresh, type RefreshOutcome, type SessionState } from './session';

/**
 * THE DECISION BEHIND A HOUSEHOLD LEAVING THE PHONE (`mirror.ts`; docs/ACCOUNTS.md §7.3). Every
 * row of its table, because each wrong row is a different way to hurt a parent: deleting a mirror
 * the account still has (a server fault would cost them their log), keeping one it no longer has
 * (the Ended screen says it is gone while every row is still here), or signing somebody out with
 * no sentence and no memory of where they were.
 */

const SAM = 'u-sam';
const IVERSENS = 'h-iversen';
const OTHER = 'h-other';

const membership = (household_id: string): Membership => ({
  household_id,
  household_name: household_id === IVERSENS ? 'The Iversen family' : 'Another family',
  role: 'CAREGIVER',
  welcome_expires_at: null,
  heard_from: null,
  home_time_zone: null,
  household_created_at: null,
  joined_at: null,
  welcome_waits_for_birth: false,
});

type Read = Pick<AccountState, 'profile' | 'memberships'>;
const profile = (id: string): Read['profile'] => ({
  id,
  display_name: 'Sam',
  email: 'sam@example.test',
  terms_version: 1,
});
/** A read as Sam, listing these households. */
const readAs = (...households: string[]): Read => ({
  profile: profile(SAM),
  memberships: households.map(membership),
});
/** What an unauthenticated read comes back as: empty, with nobody in it (`supabase.ts`). */
const NOBODY: Read = { profile: null, memberships: [] };

const check = (over: Partial<MirrorCheck>): MirrorCheck => ({
  trigger: 'account_read',
  userId: SAM,
  mirror: IVERSENS,
  read: readAs(IVERSENS),
  ...over,
});

describe('an account read', () => {
  it('is written as ever while it still lists the household the mirror holds', () => {
    expect(mirrorVerdict(check({}))).toBe('adopt');
    // not first in the list is still listed
    expect(mirrorVerdict(check({ read: readAs(OTHER, IVERSENS) }))).toBe('adopt');
  });

  it('takes the household off the phone first when it no longer lists it', () => {
    // the evening ran out, or a parent removed them
    expect(mirrorVerdict(check({ read: readAs() }))).toBe('end_household');
    // in another household, not this one: this mirror still goes
    expect(mirrorVerdict(check({ read: readAs(OTHER) }))).toBe('end_household');
  });

  it('is written as ever when there is no mirror to tear down — setup, Ended, a fresh sign-in', () => {
    expect(mirrorVerdict(check({ mirror: null, read: readAs() }))).toBe('adopt');
    expect(mirrorVerdict(check({ mirror: null, read: readAs(OTHER) }))).toBe('adopt');
    expect(mirrorVerdict(check({ mirror: null, read: NOBODY }))).toBe('adopt');
  });

  it('holds when the read cannot speak for this account — an empty read is not a removal', () => {
    expect(mirrorVerdict(check({ read: NOBODY }))).toBe('hold');
    expect(
      mirrorVerdict(check({ read: { ...readAs(), profile: profile('u-someone-else') } })),
    ).toBe('hold');
    expect(mirrorVerdict(check({ read: null }))).toBe('hold');
  });
});

describe('a refused pull, settled by the account read that follows it', () => {
  const refused = (over: Partial<MirrorCheck>) =>
    mirrorVerdict(check({ trigger: 'pull_refused', refused: IVERSENS, ...over }));

  it('deletes NOTHING while the account still lists the household: the refusal is the fault', () => {
    expect(refused({})).toBe('adopt');
    expect(refused({ read: readAs(OTHER, IVERSENS) })).toBe('adopt');
  });

  it('takes the household off the phone, session kept, when the account confirms it is gone', () => {
    expect(refused({ read: readAs() })).toBe('end_household');
    expect(refused({ read: readAs(OTHER) })).toBe('end_household');
  });

  it('asks the session first when the account cannot be read, or reads as nobody', () => {
    // the likeliest refusal is a lapsed token on a flaky network, not a removal (`mirror.ts`)
    for (const read of [
      null,
      NOBODY,
      { ...readAs(IVERSENS), profile: profile('u-someone-else') },
    ]) {
      expect(refused({ read }), JSON.stringify(read)).toBe('check_session');
      expect(refused({ read, session: 'unchecked' }), JSON.stringify(read)).toBe('check_session');
    }
  });

  it('with the session good, signs out only on a read that ANSWERS without this person', () => {
    expect(refused({ session: 'good', read: NOBODY })).toBe('sign_out');
    expect(
      refused({
        session: 'good',
        read: { ...readAs(IVERSENS), profile: profile('u-someone-else') },
      }),
    ).toBe('sign_out');
    // a read that failed outright is no answer at all: nothing is decided
    expect(refused({ session: 'good', read: null })).toBe('hold');
  });

  it('with the session good, a read that names this person decides as any read does', () => {
    expect(refused({ session: 'good', read: readAs(IVERSENS) })).toBe('adopt');
    expect(refused({ session: 'good', read: readAs() })).toBe('end_household');
  });

  it('decides nothing about a household the app has already moved on from', () => {
    // a teardown or a join settled it first; a late answer must not act on the new household
    expect(refused({ mirror: OTHER, read: null })).toBe('hold');
    expect(refused({ mirror: null, read: readAs() })).toBe('hold');
    expect(refused({ refused: OTHER, read: readAs() })).toBe('hold');
  });

  it('ends a household only on a read that names this person and leaves it out', () => {
    const reads: (Read | null)[] = [
      null,
      NOBODY,
      readAs(),
      readAs(IVERSENS),
      readAs(OTHER),
      readAs(OTHER, IVERSENS),
      { profile: profile('u-other'), memberships: [] },
    ];
    for (const trigger of ['account_read', 'pull_refused'] as const)
      for (const session of ['unchecked', 'good'] as const)
        for (const read of reads) {
          const verdict = mirrorVerdict(check({ trigger, refused: IVERSENS, session, read }));
          const confirmsGone =
            read !== null &&
            read.profile?.id === SAM &&
            !read.memberships.some(m => m.household_id === IVERSENS);
          const label = `${trigger} ${session} ${JSON.stringify(read)}`;
          expect(verdict === 'end_household', label).toBe(confirmsGone);
          // and only a refused pull, with a good session and a read that answered without this
          // person, ever signs anybody out on the household's account
          if (verdict === 'sign_out') {
            expect(trigger, label).toBe('pull_refused');
            expect(session, label).toBe('good');
            expect(read, label).not.toBeNull();
          }
        }
  });
});

/**
 * THE SESSION'S ANSWER (`mirror.ts` `afterSessionCheck`), read the way the refresh loop reads the
 * same answer — so a refused pull and the refresh loop can never disagree about whether a session
 * ended. The lead's mapping, 2026-09-25: good → read again; refused → the session sign-out; no
 * answer → nothing.
 */
describe('the session asked, after a refused pull could not see this person', () => {
  const signedIn: SessionState = {
    status: 'signed_in',
    session: {
      user: { id: SAM, email: 'sam@example.test', emailVerified: true },
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: null,
    },
    online: true,
    refreshAttempts: 0,
  };
  const answers: Record<RefreshOutcome['kind'], SessionCheckVerdict> = {
    ok: 'reread',
    invalid: 'sign_out_session',
    none: 'sign_out_session',
    offline: 'hold',
  };

  for (const [kind, expected] of Object.entries(answers) as [
    RefreshOutcome['kind'],
    SessionCheckVerdict,
  ][])
    it(`${kind} → ${expected}, exactly as the refresh reducer reads it`, () => {
      const outcome: RefreshOutcome =
        kind === 'ok' ? { kind: 'ok', session: signedIn.session } : { kind };
      expect(afterSessionCheck(reduceRefresh(signedIn, outcome).effect)).toBe(expected);
    });

  it('never reads a refresh that could not be made as a reason to sign out', () => {
    expect(afterSessionCheck('schedule_retry')).toBe('hold');
  });
});

/**
 * THE LATCH A HOUSEHOLD TEARDOWN LEAVES CLOSED (`mirror.ts` `latchLifts`): lifted by the account
 * read that shows the next household, before its screens mount — and never over a sign-out.
 */
describe('writing an account read lifts the database latch', () => {
  const lifts = (over: Partial<Parameters<typeof latchLifts>[0]>) =>
    latchLifts({ showing: OTHER, mirror: null, tearingDown: false, signedIn: true, ...over });

  it('for a household about to be shown that the phone is not showing now', () => {
    expect(lifts({})).toBe(true); // a code entered on Ended, or setup finished from it
    expect(lifts({ mirror: IVERSENS })).toBe(true); // out of one household, into another
  });

  it('not for the household already shown, nor for a read that shows none', () => {
    expect(lifts({ mirror: OTHER })).toBe(false);
    expect(lifts({ showing: null })).toBe(false);
    expect(lifts({ showing: null, mirror: IVERSENS })).toBe(false);
  });

  it('never while any teardown runs, and never with nobody signed in — a sign-out stays shut', () => {
    expect(lifts({ tearingDown: true })).toBe(false);
    expect(lifts({ signedIn: false })).toBe(false);
    expect(lifts({ tearingDown: true, signedIn: false })).toBe(false);
  });
});

describe('a read names the account', () => {
  it('only when its own profile came back', () => {
    expect(readNames(readAs(), SAM)).toBe(true);
    expect(readNames(NOBODY, SAM)).toBe(false);
    expect(readNames({ profile: profile('u-other') }, SAM)).toBe(false);
  });
});

describe('a refusal settled with nothing deleted is not asked about on every tick', () => {
  const t = Date.parse('2026-09-25T20:00:00Z');

  it('asks again the first time, for another household, and once the window has passed', () => {
    // settled quietly: the account still listed it, or the session could not be reached
    expect(recheckDue(null, IVERSENS, t)).toBe(true);
    const settled = { householdId: IVERSENS, atMs: t };
    expect(recheckDue(settled, IVERSENS, t + 30_000)).toBe(false);
    expect(recheckDue(settled, IVERSENS, t + REFUSAL_RECHECK_MS - 1)).toBe(false);
    expect(recheckDue(settled, IVERSENS, t + REFUSAL_RECHECK_MS)).toBe(true);
    expect(recheckDue(settled, OTHER, t + 1)).toBe(true);
  });

  it('is minutes, not the 30-second pull tick', () => {
    expect(REFUSAL_RECHECK_MS).toBeGreaterThanOrEqual(60_000);
    expect(REFUSAL_RECHECK_MS).toBeLessThanOrEqual(15 * 60_000);
  });
});
