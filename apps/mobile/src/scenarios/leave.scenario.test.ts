/**
 * THE WAY OUT OF A HOUSEHOLD SET UP BY MISTAKE, AS A PERSON LIVES IT (migration 0143; the owner,
 * 2026-09-29: *"Should a household with nobody else in it get a 'Leave' option?"* *"Yes."*).
 *
 * Sam was meant to join Dana's household. He went through setup instead, logged a diaper, and then
 * could not join: one account holds one household (0139), and the only way round was a second
 * account. Each step here is a call the app makes, in the order it makes it, against the in-app test
 * backend (`auth/providers/mock.ts`, which follows 0143), with the phone's own pieces deciding what
 * happens: a real local database, a real outbox worker and pull engine over the sync fake wired the
 * way `SyncProvider` wires it (`isMember`), the leave (`auth/leave.ts`), the account read's verdict
 * (`auth/mirror.ts`), the household teardown (`auth/teardown.ts`), and the words each screen shows
 * (`screens/more/leaveCopy.ts`, `screens/auth/joinCopy.ts`). Where `AuthContext` decides inline —
 * the leave's two sync calls, the record kept before the read — the helper says which lines it
 * repeats.
 *
 *   A. Sam sets up by mistake, logs an entry, meets the dead end, leaves, and joins Dana's
 *      household with her invite; his old household is gone from the phone
 *   B. Bring back, inside the 30 days: the household and the entry come back as they were
 *   C. Somebody else in it: the control is not offered, and the server says no anyway
 *   D. A caregiver alone in a household: a state that cannot exist, and why
 *   E. The unused invite's page, when nobody else is in the household the account has
 */
import { aloneIn, CLOSED_HOUSEHOLD_DAYS, standingWithNoHousehold, type Net } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createAnalytics } from '../analytics';
import { logActivity } from '../data/activities';
import { counts as outboxCounts } from '../data/outbox';
import {
  forgetLeftHousehold,
  keptUntilLabel,
  leaveAlone,
  loadLeftHousehold,
  restorable,
  restoreLeft,
  saveLeftHousehold,
  clearLeftHousehold,
  type LeftHousehold,
} from '../auth/leave';
import { redeemInvite } from '../auth/join';
import { mirrorVerdict } from '../auth/mirror';
import { MockAccountsApi, MockAuthProvider, MockBackend } from '../auth/providers/mock';
import type { AccountsApi, SessionStore } from '../auth/providers/types';
import type { Session } from '../auth/session';
import { runTeardown, type TeardownDeps } from '../auth/teardown';
import { clearForHouseholdEnd, memoryStore, type KeyValueStore } from '../prefs';
import { JOIN } from '../screens/auth/joinCopy';
import { LEAVE } from '../screens/more/leaveCopy';
import { ensureMockChildren, ensureMockMembership } from '../sync/providers/mockSeed';
import { MockSyncApi, MockSyncServer } from '../sync/providers/mock';
import { PullEngine } from '../sync/pull';
import { outboxTeardown, setSyncRuntime } from '../sync/status';
import { pullTable } from '../sync/tables';
import { OutboxWorker } from '../sync/worker';
import {
  CHILD_A,
  HOUSEHOLD,
  USER,
  seedHousehold,
  seededIds,
  type Fixture,
} from '../testing/fixtures';

const DAY = 86_400_000;
const PASSWORD = 'correct horse battery';

let fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures) f.restoreIds();
  fixtures = [];
  setSyncRuntime(null);
});

const online: Net = { isConnected: async () => true, onReconnect: () => () => undefined };

function sessionStore(): SessionStore {
  let s: Session | null = null;
  return {
    load: async () => s,
    save: async v => {
      s = v;
    },
    clear: async () => {
      s = null;
    },
  };
}

const PAYLOAD = (name: string) => ({
  client_op_id: crypto.randomUUID(),
  profile: { display_name: name, locale: 'en-US', time_zone: 'UTC' },
  household: { name: `${name}’s family`, home_time_zone: 'UTC' },
  child: { name: 'Ada', birth_date: '2026-08-20' },
  modules: ['bottle', 'diaper', 'sleep'] as ('bottle' | 'diaper' | 'sleep')[],
});

/**
 * Sam's phone and Dana's, on one test backend. Sam is the first account made, so his account, the
 * household his setup makes and its baby take the ids the local fixture's rows carry: the phone's
 * mirror IS that household.
 */
async function world() {
  const fixture = await seedHousehold({ idPrefix: 'abcdabcd' });
  fixtures.push(fixture);
  const { db, clock } = fixture;
  const fixed = [USER, HOUSEHOLD, CHILD_A];
  const rest = seededIds('fafafafa');
  const backend = new MockBackend({ now: () => clock.now(), newId: () => fixed.shift() ?? rest() });

  const account = async (email: string) => {
    const auth = new MockAuthProvider(backend, sessionStore());
    await auth.signUpWithPassword(email, PASSWORD);
    await auth.handleAuthLink(backend.lastLink ?? '');
    return { auth, api: new MockAccountsApi(backend, auth) as AccountsApi };
  };

  // SAM, BY MISTAKE: setup's six steps, and its last button makes a household of his own
  const sam = await account('sam@example.test');
  const made = await sam.api.createHousehold(PAYLOAD('Sam'));
  expect(made).toMatchObject({ ok: true, household_id: HOUSEHOLD, child_id: CHILD_A });

  // Dana's household, the one he meant to join
  const dana = await account('dana@example.test');
  const danas = await dana.api.createHousehold(PAYLOAD('Dana'));
  if (!danas.ok) throw new Error('no household for Dana');

  // Sam's phone syncs his household, as `SyncProvider` builds it on the test backend
  const server = new MockSyncServer({
    now: () => clock.now(),
    isMember: (h, u) => backend.membership(h, u) !== undefined,
  });
  ensureMockMembership(server, HOUSEHOLD, USER, 'OWNER');
  ensureMockChildren(server, HOUSEHOLD, [
    { id: CHILD_A, household_id: HOUSEHOLD, name: 'Ada', birth_date: '2026-08-20', due_date: null },
  ]);
  const syncApi = new MockSyncApi(server, USER);
  const worker = new OutboxWorker(db, syncApi, online, clock, {
    analytics: createAnalytics(() => undefined).emit,
    onState: () => undefined,
  });
  worker.start();
  setSyncRuntime({
    flush: reason => worker.flush(reason),
    pullNow: async () => undefined,
    mock: server,
    pending: () => worker.pending(),
    refresh: async () => undefined,
    dueNow: async () => undefined,
    retry: async () => undefined,
    stopForTeardown: () => undefined,
  });

  const prefs = memoryStore({
    theme: 'dark',
    account_state: '{"state":"as last read"}',
    [`last_household:${USER}`]: JSON.stringify({ id: HOUSEHOLD, name: 'Sam’s family' }),
    [`last_child_id:${USER}`]: CHILD_A,
    quick_row: '["diaper"]',
  });

  return {
    db,
    clock,
    backend,
    sam,
    dana,
    danaHousehold: danas.household_id,
    server,
    syncApi,
    worker,
    prefs,
  };
}
type World = Awaited<ReturnType<typeof world>>;

/** A pull of the log for `householdId` over `db`, as the engine runs it: `done` or `forbidden`. */
async function pullLog(w: World, db: Fixture['db'], householdId: string) {
  const activities = pullTable('activities');
  if (activities === undefined) throw new Error('activities is not pulled');
  const engine = new PullEngine({
    db,
    api: w.syncApi,
    clock: w.clock,
    householdId,
    userId: USER,
    onForbidden: () => undefined,
  });
  return (await engine.run([activities], null)).stoppedBecause;
}

/** The household teardown's dependencies over the phone's own prefs, recording what went. */
function teardownOf(prefs: KeyValueStore) {
  let deleted = false;
  const kept: unknown[][] = [];
  const taken: string[] = [];
  const noop = async () => undefined;
  const person = (what: string) => async () => {
    taken.push(what);
  };
  const deps: TeardownDeps = {
    flags: { get: async () => null, set: async mark => void taken.push(`flag=${mark !== null}`) },
    session: { current: async () => ({ id: USER, email: 'sam@example.test' }) },
    ui: { freeze: () => undefined, closeSheets: () => undefined },
    network: { online: async () => true },
    outbox: outboxTeardown(),
    quarantine: {
      write: async (_u, ops) => {
        kept.push([...ops]);
        return ops.length > 0;
      },
    },
    notifications: { cancelAllScheduled: noop, dismissAllDelivered: noop },
    widgets: { clearSnapshot: noop, reloadAll: noop },
    push: {
      markInvalidOnServer: person('push.markInvalidOnServer'),
      unregisterLocally: person('push.unregisterLocally'),
    },
    auth: { signOut: person('auth.signOut') },
    db: {
      closeAndDelete: async () => {
        deleted = true;
      },
    },
    keychain: { clearSession: person('keychain.clearSession') },
    prefs: {
      clearForSignOut: person('prefs.clearForSignOut'),
      clearForHouseholdEnd: async u => {
        await clearForHouseholdEnd(prefs, u.id);
      },
    },
    caches: { clearMemory: person('caches.clearMemory'), clearTmp: noop },
    nav: { resetToAuth: () => void taken.push('nav.resetToAuth') },
    analytics: { emit: () => void taken.push('analytics') },
  };
  return { deps, kept, taken, deleted: () => deleted };
}

/**
 * `AuthContext.leaveHousehold`, as it writes it: `leaveAlone` over the sync runtime (a flush, then
 * what is still on its way, FAILED left out), the record kept BEFORE the account read, and then the
 * read's own verdict and — when it says so — the household teardown.
 */
async function leaveFromFamily(w: World) {
  const outcome = await leaveAlone({
    flush: async () => {
      await w.worker.flush('manual');
    },
    owed: async () => (await w.worker.pending()).filter(r => r.state !== 'FAILED').length,
    leave: () => w.sam.api.leaveHousehold(HOUSEHOLD),
    now: () => w.clock.now(),
  });
  if (outcome.kind !== 'left') return { outcome, teardown: null };
  await saveLeftHousehold(w.prefs, USER, outcome.left);
  const read = await w.sam.api.bootstrapState();
  const verdict = mirrorVerdict({ trigger: 'account_read', userId: USER, mirror: HOUSEHOLD, read });
  expect(verdict).toBe('end_household');
  const t = teardownOf(w.prefs);
  await runTeardown('household', t.deps);
  return { outcome, teardown: t, read };
}

/* ================================================================== A */

describe('A. set up by mistake, left, and joined where he meant to be', () => {
  it('meets the dead end, leaves his own household, joins Dana’s, and his old household is gone from the phone', async () => {
    const w = await world();

    // an evening of use: one diaper, logged on the phone
    await logActivity(w.db, w.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'quicklog',
      childId: CHILD_A,
      type: 'diaper',
      startAt: w.clock.iso(),
      detail: { kind: 'WET' },
    });
    expect((await outboxCounts(w.db)).unsent).toBe(1);

    // THE DEAD END: Dana's code is a PARENT's, and Sam is a parent in a family already (0153)
    const code = await w.dana.api.createInvite(w.danaHousehold, 'PARENT', 'CODE');
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');
    const refused = await redeemInvite(
      { accept: i => w.sam.api.acceptInvite(i), read: () => w.sam.api.bootstrapState() },
      { code: code.code },
      'Sam',
    );
    expect(refused).toEqual({ kind: 'kept', problem: 'admin_elsewhere' });

    // …and Family's "Join another household" says so, and now says the way out: nobody else is in it
    const roster = await w.sam.api.listMembers(HOUSEHOLD);
    expect(aloneIn(roster)).toBe(true);
    expect(JOIN.refusal.parentElsewhere).toMatch(/already a parent in your own family/);
    expect(JOIN.inHousehold.alone('Sam’s family')).toBe(
      'Nobody else is in Sam’s family, so you can leave it and then join with a code.',
    );
    expect(JOIN.inHousehold.leaveFirst('Sam’s family')).toBe('Leave Sam’s family first');

    // FAMILY'S CONFIRMATION: names it, says it closes, and what is kept
    expect(LEAVE.title('Sam’s family')).toBe('Leave Sam’s family?');
    expect(LEAVE.body).toBe('Nobody else is in it, so it closes when you leave.');
    expect(LEAVE.kept).toContain(`${CLOSED_HOUSEHOLD_DAYS} days`);
    // no store subscription: the confirmation has nothing to say about one
    expect(await w.sam.api.storeSubscription()).toEqual({ ok: true, active: false });

    // LEAVE HOUSEHOLD: the diaper reaches the household first, then it closes
    const { outcome, teardown, read } = await leaveFromFamily(w);
    expect(outcome).toMatchObject({ kind: 'left', left: { id: HOUSEHOLD, name: 'Sam’s family' } });
    expect(w.server.activities).toHaveLength(1);
    expect(read?.memberships).toEqual([]);
    // the household left the phone: its database, its preferences; the session and the account stay
    expect(teardown?.deleted()).toBe(true);
    // nothing was left to keep: the diaper had reached the household before it closed
    expect(teardown?.kept.flat()).toEqual([]);
    expect(teardown?.taken).toEqual([]);
    expect((await w.prefs.keys()).sort()).toEqual([
      'account_state',
      `last_household:${USER}`,
      `left_household:${USER}`,
      'theme',
    ]);

    // ENDED: "You left Sam's family", and a way back until the purge date
    const last = { id: HOUSEHOLD, name: 'Sam’s family' };
    expect(standingWithNoHousehold(last)).toBe('ended');
    const left = await loadLeftHousehold(w.prefs, USER);
    expect(restorable(left, w.clock.now())).toBe(true);
    expect(LEAVE.ended.title(left?.name ?? '')).toBe('You left Sam’s family');
    expect(LEAVE.ended.restore(left?.name ?? '')).toBe('Bring back Sam’s family');
    expect(LEAVE.ended.kept(keptUntilLabel(left?.purge_at ?? '', 'en-US', 'UTC'))).toBe(
      'Everything in it is kept until October 13, and you can bring it back until then.',
    );

    // "I HAVE A NEW INVITE CODE": the same code, which was never spent, joins now
    const joined = await redeemInvite(
      { accept: i => w.sam.api.acceptInvite(i), read: () => w.sam.api.bootstrapState() },
      { code: code.code },
      'Sam',
    );
    expect(joined).toMatchObject({
      kind: 'joined',
      household_id: w.danaHousehold,
      household_name: 'Dana’s family',
      role: 'PARENT',
    });
    const now = await w.sam.api.bootstrapState();
    expect(now.memberships.map(m => m.household_name)).toEqual(['Dana’s family']);

    // HIS OLD HOUSEHOLD IS GONE FROM THE PHONE, AND FROM EVERY READ: a fresh mirror asking for it is
    // refused, and the account never lists it
    const other = await seedHousehold({ idPrefix: 'cdefcdef' });
    fixtures.push(other);
    expect(await pullLog(w, other.db, HOUSEHOLD)).toBe('forbidden');
    expect(await w.sam.api.listMembers(HOUSEHOLD)).toEqual([]);
    // …and Dana's household has him, by the name he joined with
    expect((await w.dana.api.listMembers(w.danaHousehold)).map(m => m.display_name)).toEqual([
      'Dana',
      'Sam',
    ]);
  });
});

/* ================================================================== B */

describe('B. bring it back, inside the 30 days', () => {
  it('opens again with his seat as it was, and the entry he logged comes back to the phone', async () => {
    const w = await world();
    await logActivity(w.db, w.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'quicklog',
      childId: CHILD_A,
      type: 'diaper',
      startAt: w.clock.iso(),
      detail: { kind: 'DIRTY' },
    });
    const { outcome } = await leaveFromFamily(w);
    expect(outcome.kind).toBe('left');

    w.clock.advance(10 * DAY);
    const left = (await loadLeftHousehold(w.prefs, USER)) as LeftHousehold;
    expect(restorable(left, w.clock.now())).toBe(true);
    // ENDED'S "BRING BACK", as `AuthContext.restoreHousehold` makes it: the record goes, the account
    // is read again, and the read is ADOPTED (the phone holds no household to end)
    const back = await restoreLeft(() => w.sam.api.restoreHousehold(left.id));
    expect(back).toEqual({
      kind: 'restored',
      household_id: HOUSEHOLD,
      household_name: 'Sam’s family',
    });
    await clearLeftHousehold(w.prefs, USER);
    const read = await w.sam.api.bootstrapState();
    expect(read.memberships).toMatchObject([
      { household_id: HOUSEHOLD, household_name: 'Sam’s family', role: 'OWNER' },
    ]);
    expect(mirrorVerdict({ trigger: 'account_read', userId: USER, mirror: null, read })).toBe(
      'adopt',
    );
    // a fresh mirror fills from the household, the diaper in it: nothing was lost
    const mirror = await seedHousehold({ idPrefix: 'efefefef' });
    fixtures.push(mirror);
    expect(await pullLog(w, mirror.db, HOUSEHOLD)).toBe('done');
    const rows = await mirror.db.all<{ id: string }>(
      `select id from activities where household_id = ? and deleted_at is null`,
      [HOUSEHOLD],
    );
    expect(rows).toHaveLength(1);
    expect(await loadLeftHousehold(w.prefs, USER)).toBeNull();
  });

  it('is gone once the 30 days are up, and the button goes with it', async () => {
    const w = await world();
    await leaveFromFamily(w);
    w.clock.advance(CLOSED_HOUSEHOLD_DAYS * DAY);
    const left = (await loadLeftHousehold(w.prefs, USER)) as LeftHousehold;
    expect(restorable(left, w.clock.now())).toBe(false);
    expect(await restoreLeft(() => w.sam.api.restoreHousehold(left.id))).toEqual({ kind: 'gone' });
    // THE PHONE LETS GO OF IT, as `AuthContext` does on this answer and on reading an expired
    // record: the record and the memory of it, so Ended never says "your time with Sam's family
    // has ended" or "every entry you made stays with the household" about a household that is
    // deleted. With no memory, the account lands on setup, whose first page has the code door.
    expect(await forgetLeftHousehold(w.prefs, USER, left.id, `last_household:${USER}`)).toBe(true);
    expect(await loadLeftHousehold(w.prefs, USER)).toBeNull();
    expect(await w.prefs.get(`last_household:${USER}`)).toBeNull();
    expect(standingWithNoHousehold(null)).toBe('setup');
    expect(LEAVE.ended.gone).toBe('That household can no longer be brought back.');
    // the nightly purge takes it, with everything the backend keeps of it
    w.backend.purgeDue();
    expect(w.backend.state.households.map(h => h.id)).not.toContain(HOUSEHOLD);
  });

  it('waits while he is in another household: one household per account', async () => {
    const w = await world();
    await leaveFromFamily(w);
    const code = await w.dana.api.createInvite(w.danaHousehold, 'PARENT', 'CODE');
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');
    expect((await w.sam.api.acceptInvite({ code: code.code })).ok).toBe(true);
    const left = (await loadLeftHousehold(w.prefs, USER)) as LeftHousehold;
    expect(await restoreLeft(() => w.sam.api.restoreHousehold(left.id))).toEqual({
      kind: 'in_household',
    });
    expect(LEAVE.ended.inHousehold).toBe(
      'You are in another household now. Leave it first to bring this one back.',
    );
  });
});

/* ================================================================== C */

describe('C. somebody else is in it', () => {
  it('offers no Leave, and the server refuses one anyway', async () => {
    const w = await world();
    // Dana's household with Sam in it: neither of them is alone there
    const code = await w.dana.api.createInvite(w.danaHousehold, 'PARENT', 'CODE');
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');
    const lee = new MockAuthProvider(w.backend, sessionStore());
    await lee.signUpWithPassword('lee@example.test', PASSWORD);
    await lee.handleAuthLink(w.backend.lastLink ?? '');
    const leeApi = new MockAccountsApi(w.backend, lee);
    expect((await leeApi.acceptInvite({ code: code.code, display_name: 'Lee' })).ok).toBe(true);
    expect(aloneIn(await w.dana.api.listMembers(w.danaHousehold))).toBe(false);
    expect(aloneIn(await leeApi.listMembers(w.danaHousehold))).toBe(false);
    expect(await w.dana.api.leaveHousehold(w.danaHousehold)).toEqual({
      ok: false,
      status: 409,
      error: 'not_alone',
    });
    expect(await leeApi.leaveHousehold(w.danaHousehold)).toMatchObject({ error: 'not_alone' });
    expect(LEAVE.notAlone).toBe('Someone else is in this household now, so it stays open.');
    // nothing changed: both still in it
    expect((await w.dana.api.listMembers(w.danaHousehold)).map(m => m.display_name)).toEqual([
      'Dana',
      'Lee',
    ]);
  });

  it('does not leave while an entry is still on its way to the household', async () => {
    const w = await world();
    await logActivity(w.db, w.clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'quicklog',
      childId: CHILD_A,
      type: 'diaper',
      startAt: w.clock.iso(),
      detail: { kind: 'WET' },
    });
    // no signal: the flush sends nothing, the entry is still owed, and nothing is sent to leave
    const outcome = await leaveAlone({
      flush: async () => undefined,
      owed: async () => (await w.worker.pending()).filter(r => r.state !== 'FAILED').length,
      leave: () => w.sam.api.leaveHousehold(HOUSEHOLD),
      now: () => w.clock.now(),
    });
    expect(outcome).toEqual({ kind: 'unsynced', count: 1 });
    expect(LEAVE.unsynced(1)).toBe(
      'One entry has not synced yet. Connect to the internet, let it sync, then try again.',
    );
    expect((await w.sam.api.bootstrapState()).memberships).toHaveLength(1);
  });
});

/* ================================================================== D */

describe('D. a caregiver alone in a household cannot happen', () => {
  /** Kim, a caregiver in Dana's household: for an evening (`seat`) or for good. */
  async function withKim(w: World, seat?: number) {
    // Dana's household has its 14-day preview, so a caregiver's seat is open to it
    const code = await w.dana.api.createInvite(w.danaHousehold, 'CAREGIVER', 'CODE', seat);
    if (!code.ok || code.kind !== 'CODE') throw new Error('no code');
    const kim = new MockAuthProvider(w.backend, sessionStore());
    await kim.signUpWithPassword('kim@example.test', PASSWORD);
    await kim.handleAuthLink(w.backend.lastLink ?? '');
    const kimApi = new MockAccountsApi(w.backend, kim);
    expect((await kimApi.acceptInvite({ code: code.code, display_name: 'Kim' })).ok).toBe(true);
    return { kimApi, kimId: kim.current()?.user.id ?? '' };
  }
  const danaId = (w: World): string =>
    w.dana.auth instanceof MockAuthProvider ? (w.dana.auth.current()?.user.id ?? '') : '';

  it('because the owner can neither leave, nor step out, nor delete the account while anyone is there', async () => {
    const w = await world();
    const { kimApi, kimId } = await withKim(w, 6);
    // the owner cannot leave it to her (0143), cannot step out of it (the last-owner guard, 0008),
    // and cannot delete her account out from under it (SECURITY.md §9)
    expect(await w.dana.api.leaveHousehold(w.danaHousehold)).toMatchObject({ error: 'not_alone' });
    expect(await w.dana.api.removeMember(w.danaHousehold, danaId(w))).toMatchObject({
      status: 409,
      error: 'last_owner',
    });
    expect(await w.dana.api.requestAccountDeletion()).toMatchObject({
      status: 409,
      error: 'transfer_or_delete_household_first',
    });
    // a seat that ends is never made the owner (0109), so she cannot hand it to Kim and go
    expect(await w.dana.api.transferOwnership(w.danaHousehold, kimId)).toMatchObject({
      status: 422,
    });
    // and the caregiver cannot leave it for the owner: Dana is somebody
    expect(await kimApi.leaveHousehold(w.danaHousehold)).toMatchObject({ error: 'not_alone' });
  });

  it('because a caregiver handed the household is its owner by then, and leaves it as one', async () => {
    const w = await world();
    const { kimApi, kimId } = await withKim(w);
    expect(await w.dana.api.transferOwnership(w.danaHousehold, kimId)).toEqual({ ok: true });
    expect(await w.dana.api.removeMember(w.danaHousehold, danaId(w))).toEqual({ ok: true });
    const roster = await kimApi.listMembers(w.danaHousehold);
    expect(roster.map(m => m.role)).toEqual(['OWNER']);
    expect(aloneIn(roster)).toBe(true);
    expect(await kimApi.leaveHousehold(w.danaHousehold)).toMatchObject({ ok: true });
  });
});

/* ================================================================== E */

describe('E. the invite that was not used, when nobody else is in the household', () => {
  it('says so and offers the way out, instead of a second account', async () => {
    const w = await world();
    // Sam typed Dana's code on the first screen, then signed in to the account that has a household:
    // the `ready` effect writes the note, and the page reads the roster
    const note = { kind: 'not_used' as const, current: 'Sam’s family', invited: 'Dana’s family' };
    // the reason is said only when it is the reason: a server holding one family each says no limit
    expect(JOIN.notUsed.body(note.current, note.invited, 'in_one')).toBe(
      'You’re already in Sam’s family. Your invite to Dana’s family was not used.',
    );
    expect(aloneIn(await w.sam.api.listMembers(HOUSEHOLD))).toBe(true);
    expect(JOIN.notUsed.alone(note.current)).toBe(
      'Nobody else is in Sam’s family, so you can leave it. Then join with a new code.',
    );
    expect(JOIN.inHousehold.leaveFirst(note.current)).toBe('Leave Sam’s family first');
    // with somebody else in it, the way through is leaving one family, never a second account (0153)
    expect(JOIN.inHousehold.workaround).toMatch(/leave one of your families first/);
  });
});
