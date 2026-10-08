/**
 * A HOUSEHOLD LEAVING THE PHONE, END TO END ON THE TEST BACKEND (docs/ACCOUNTS.md §7.3; the
 * reconciliation of WP4 D37 with `phase: 'ended'`, 2026-09-25).
 *
 * Everything here is shipped code except the screen: the account backend Expo Go runs on
 * (`MockBackend`), the sync fake wired to it the way `SyncProvider` wires it (`isMember`), a real
 * pull engine and a real outbox worker over a real local database with a real queued entry in it,
 * the order a refused pull is settled in (`refusedPull.ts`) and every decision in it (`mirror.ts`),
 * and the household teardown (`teardown.ts`), with the app's own late-bound outbox binding.
 * `AuthContext.tsx` hands them its effects; it is a `.tsx` over React Native, so its wiring is
 * read as source at the end.
 *
 * The stories, one per row of the table that matters: an evening that ran out and a parent
 * removing someone (the household goes, the session stays, the entry is kept), a refusal the
 * account contradicts (nothing goes), a refusal nobody can confirm (nothing is decided), and a
 * session the server itself refused (the session sign-out).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Net } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { createAnalytics } from '../analytics';
import { logActivity } from '../data/activities';
import { counts as outboxCounts } from '../data/outbox';
import { clearForHouseholdEnd, memoryStore, type KeyValueStore } from '../prefs';
import { ensureMockMembership } from '../sync/providers/mockSeed';
import { MockSyncApi, MockSyncServer } from '../sync/providers/mock';
import { PullEngine } from '../sync/pull';
import { outboxTeardown, setSyncRuntime } from '../sync/status';
import { pullTable } from '../sync/tables';
import { OutboxWorker } from '../sync/worker';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold, type Fixture } from '../testing/fixtures';
import { mirrorVerdict } from './mirror';
import { MockAccountsApi, MockAuthProvider, MockBackend, type MockState } from './providers/mock';
import type { AccountState, SessionStore } from './providers/types';
import { settleRefusedPull } from './refusedPull';
import { reduceRefresh, stateAtLaunch, type Session } from './session';
import { runTeardown, type TeardownDeps } from './teardown';

const OWNER = 'bbbbbbbb-0000-4000-8000-0000000000aa';
const HOUR = 3_600_000;

let fixture: Fixture | null = null;
afterEach(() => {
  fixture?.restoreIds();
  fixture = null;
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

const accountUser = (id: string, email: string): MockState['users'][number] => ({
  id,
  email,
  password_digest: null,
  verified: true,
  provider: 'email',
  session_version: 1,
  display_name: email.split('@')[0] ?? '',
  deleted_at: null,
});

/** One phone signed in to the test backend, as `AuthContext` holds it. */
async function signedIn(backend: MockBackend, id: string) {
  const store = sessionStore();
  const u = backend.user(id);
  if (u === undefined) throw new Error(`no account ${id}`);
  await store.save(backend.mintSession(u));
  const auth = new MockAuthProvider(backend, store);
  await auth.restoreSession();
  return { auth, api: new MockAccountsApi(backend, auth) };
}

/**
 * Sam's phone, mirroring the household with a seat of six hours, one entry logged and not yet
 * sent — and Dana's, which owns the household.
 */
async function world() {
  fixture = await seedHousehold({ idPrefix: 'aaaacccc' });
  const { db, clock } = fixture;
  const backend = new MockBackend({ now: () => clock.now() });
  backend.state.users.push(
    accountUser(OWNER, 'dana@example.test'),
    accountUser(USER, 'sam@example.test'),
  );
  backend.state.households.push({
    id: HOUSEHOLD,
    name: 'The Rivera house',
    owner_id: OWNER,
    welcome_expires_at: null,
    created_at: clock.iso(),
  });
  backend.state.members.push(
    {
      household_id: HOUSEHOLD,
      user_id: OWNER,
      role: 'OWNER',
      joined_at: clock.iso(),
      removed_at: null,
      expires_at: null,
    },
    {
      household_id: HOUSEHOLD,
      user_id: USER,
      role: 'CAREGIVER',
      joined_at: clock.iso(),
      removed_at: null,
      expires_at: clock.iso(clock.now() + 6 * HOUR),
    },
  );
  const sam = await signedIn(backend, USER);
  const dana = await signedIn(backend, OWNER);

  // the sync fake exactly as `SyncProvider` builds it on the test backend: seeded with the
  // account's membership, and asking the account backend who is a member from then on
  const server = new MockSyncServer({
    now: () => clock.now(),
    isMember: (h, u) => backend.membership(h, u) !== undefined,
  });
  ensureMockMembership(server, HOUSEHOLD, USER, 'CAREGIVER');
  const syncApi = new MockSyncApi(server, USER);

  const refused: string[] = [];
  const activities = pullTable('activities');
  if (activities === undefined) throw new Error('activities is not pulled');
  const engine = new PullEngine({
    db,
    api: syncApi,
    clock,
    householdId: HOUSEHOLD,
    userId: USER,
    onForbidden: h => void refused.push(h),
  });
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

  // the entry logged at a quarter to midnight, still on the phone
  await logActivity(db, clock, {
    householdId: HOUSEHOLD,
    createdBy: USER,
    deviceId: null,
    source: 'quicklog',
    childId: CHILD_A,
    type: 'diaper',
    startAt: clock.iso(),
    detail: { kind: 'WET' },
  });

  const prefs = memoryStore({
    theme: 'dark',
    account_state: '{"state":"as last read"}',
    [`last_household:${USER}`]: JSON.stringify({ id: HOUSEHOLD, name: 'The Rivera house' }),
    [`last_child_id:${USER}`]: CHILD_A,
    care_row_hidden: '["care-1"]',
  });

  return {
    db,
    clock,
    backend,
    sam,
    dana,
    server,
    worker,
    refused,
    prefs,
    pull: () => engine.run([activities], null),
  };
}

/** The household teardown's dependencies, recording what is the PERSON's so nothing takes it. */
function teardownOf(prefs: KeyValueStore) {
  const taken: string[] = [];
  const kept: unknown[][] = [];
  let deleted = false;
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
  return { deps, taken, kept, deleted: () => deleted };
}

/**
 * What `AuthContext.pullRefused` does after the refusal: the shipped `settleRefusedPull`, over Sam's
 * account read and session on the test backend, with the household teardown run for real when it
 * says so. What it does is recorded in order.
 */
async function settleOn(w: World, household?: ReturnType<typeof teardownOf>) {
  const did: string[] = [];
  const signedIn = stateAtLaunch(w.sam.auth.current());
  const outcome = await settleRefusedPull({
    userId: USER,
    householdId: HOUSEHOLD,
    mirror: () => HOUSEHOLD,
    overtaken: () => false,
    read: () => w.sam.api.bootstrapState().catch(() => null),
    checkSession: async () => reduceRefresh(signedIn, await w.sam.auth.refreshSession()).effect,
    adopt: async (read: AccountState) => {
      did.push(`adopt:${read.memberships.map(m => m.household_id).join(',') || 'none'}`);
      return true;
    },
    endHousehold: async () => {
      did.push('endHousehold');
      if (household !== undefined) await runTeardown('household', household.deps);
      return true;
    },
    signOut: async why => {
      did.push(`signOut:${why}`);
    },
    log: () => undefined,
  });
  return { outcome, did };
}

type World = Awaited<ReturnType<typeof world>>;

describe('the evening runs out while the app is open', () => {
  it('the pull is refused, the account confirms it, and the household leaves with the session kept', async () => {
    const w = await world();
    // an hour in, everything is as it was: the pull is answered
    w.clock.advance(HOUR);
    expect((await w.pull()).stoppedBecause).toBe('done');

    // seven hours in, the seat has run out on the server, with no job having run
    w.clock.advance(6 * HOUR);
    expect((await w.pull()).stoppedBecause).toBe('forbidden');
    expect(w.refused).toEqual([HOUSEHOLD]);
    // …and the entry is refused too, terminally — it is still owed, and it must still be kept
    await w.worker.flush('write');
    expect((await outboxCounts(w.db)).failed).toBe(1);

    // the account, read as Sam, confirms it: the household leaves, THEN the read is written
    const t = teardownOf(w.prefs);
    const { outcome, did } = await settleOn(w, t);
    expect(outcome).toBe('ended');
    expect(did).toEqual(['endHousehold', 'adopt:none']);
    // the entry is kept, under Sam, before the file goes (CLAUDE.md rule 7)
    expect(t.kept[0]).toHaveLength(1);
    expect(t.deleted()).toBe(true);
    // nothing of the person's was touched: still signed in, still the same session
    expect(t.taken).toEqual([]);
    const session = w.sam.auth.current();
    expect(session).not.toBeNull();
    expect(w.backend.sessionValid(session as Session)).toBe(true);
    // the household's preferences went, and the memory Ended is decided from did not
    expect((await w.prefs.keys()).sort()).toEqual([
      'account_state',
      `last_household:${USER}`,
      'theme',
    ]);
  });
});

describe('a parent removes somebody', () => {
  it('goes the same way: refused, confirmed, and the household leaves the phone', async () => {
    const w = await world();
    expect(await w.dana.api.removeMember(HOUSEHOLD, USER)).toEqual({ ok: true });
    expect((await w.pull()).stoppedBecause).toBe('forbidden');
    const { outcome, did } = await settleOn(w);
    expect(outcome).toBe('ended');
    expect(did).toEqual(['endHousehold', 'adopt:none']);
    // and the account read at launch, with no pull at all, says the same
    const read = await w.sam.api.bootstrapState();
    expect(mirrorVerdict({ trigger: 'account_read', userId: USER, mirror: HOUSEHOLD, read })).toBe(
      'end_household',
    );
  });
});

describe('a refusal the account contradicts', () => {
  it('deletes nothing: the refusal is the server’s fault, not the person’s standing', async () => {
    const w = await world();
    // the sync side stops answering (a grant, a bug) while the account still holds the seat
    w.server.members.length = 0;
    expect((await w.pull()).stoppedBecause).toBe('forbidden');
    const { outcome, did } = await settleOn(w);
    expect(outcome).toBe('kept');
    expect(did).toEqual([`adopt:${HOUSEHOLD}`]);
    // no teardown runs, so the entry is still on the phone and still owed
    expect((await outboxCounts(w.db)).unsent).toBe(1);
  });
});

describe('a refusal nobody can confirm', () => {
  it('decides nothing and deletes nothing when neither the account nor the session answers', async () => {
    const w = await world();
    w.clock.advance(7 * HOUR);
    expect((await w.pull()).stoppedBecause).toBe('forbidden');
    // the connection went between the refusal and the read — the adversarial review's flaky
    // network: this used to sign the person out; the session is asked now, and cannot answer
    w.backend.online = false;
    const { outcome, did } = await settleOn(w);
    expect(outcome).toBe('held');
    expect(did).toEqual([]);
    expect((await outboxCounts(w.db)).unsent).toBe(1);
  });

  it('signs out as a SESSION that ended when the session is what the server refused', async () => {
    const w = await world();
    // "Sign out everywhere" on the other phone: the pull, the read and the refresh are refused
    w.backend.revokeSessions(USER);
    const { outcome, did } = await settleOn(w);
    expect(outcome).toBe('signed_out');
    expect(did).toEqual(['signOut:session']);
  });
});

/* ---------------------------------------------------------------------- the wiring, as source */

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flatOf = (rel: string): string =>
  strip(readFileSync(join(__dirname, rel), 'utf8')).replace(/\s+/g, ' ');
const context = flatOf('AuthContext.tsx');
const sync = flatOf('../sync/SyncProvider.tsx');

const between = (src: string, from: string, to: string): string => {
  const a = src.indexOf(from);
  expect(a, from).toBeGreaterThan(-1);
  const b = src.indexOf(to, a + from.length);
  expect(b, to).toBeGreaterThan(a);
  return src.slice(a, b);
};

/**
 * The ORDER a refused pull is settled in — read, session, then only what they say — is
 * `refusedPull.ts`'s, driven above and in `refusedPull.test.ts`. What `AuthContext` owes it is the
 * right things to call.
 */
describe('AuthContext settles a refused pull through `settleRefusedPull`', () => {
  const settleSrc = between(
    context,
    'const pullRefused = useCallback(',
    'const putInviteHold = useCallback(',
  );

  it('hands it the account read, and the session as the refresh loop reads it', () => {
    expect(settleSrc).toContain('await settleRefusedPull({');
    expect(settleSrc).toContain('read: () => providers.api.bootstrapState().catch(() => null),');
    // a refresh that throws is no answer — `offline`, which decides nothing
    expect(settleSrc).toContain(
      "const answer = await providers.auth .refreshSession() .catch(() => ({ kind: 'offline' as const }));",
    );
    expect(settleSrc).toContain('const { state, effect } = reduceRefresh(now, answer);');
    // nothing is deleted or signed out here outside what it calls, in its order
    const hand = settleSrc.indexOf('await settleRefusedPull({');
    for (const act of ['tearDown(', 'setForcedSignOut('])
      expect(settleSrc.indexOf(act), act).toBeGreaterThan(hand);
  });

  it('signs out with the sentence for why, keeping the household memory only for the household', () => {
    expect(settleSrc).toContain(
      "setForcedSignOut(why); await tearDown( 'forced', providers, why === 'household' ? { keepPrefs: [LAST_HOUSEHOLD(userId)] } : {}, );",
    );
  });

  it('one refusal at a time, none about a household the app moved on from, none again too soon', () => {
    expect(settleSrc).toContain('settling.current) return;');
    expect(settleSrc).toContain('if (mirrorOf(accountRef.current) !== householdId) return;');
    expect(settleSrc).toContain(
      'if (!recheckDue(settledQuietly.current, householdId, Date.now())) {',
    );
    // settled with nothing deleted — kept, or held because nothing answered — starts the window
    expect(settleSrc).toContain(
      "if (outcome === 'kept' || outcome === 'held') settledQuietly.current = { householdId, atMs: Date.now() };",
    );
  });
});

describe('AuthContext settles an account read the same way', () => {
  const read = between(
    context,
    'const refreshAccount = useCallback(',
    'const refresh = useCallback(',
  );

  it('tears the household down before the read is written, never after', () => {
    const verdict = read.indexOf("trigger: 'account_read'");
    const end = read.indexOf('await endHousehold()');
    const write = read.indexOf('await adopt(state)');
    expect(verdict).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(verdict);
    expect(write).toBeGreaterThan(end);
    expect(read).toContain("if (verdict === 'hold') return null;");
  });

  it('runs the household teardown with the session kept, and answers a sign-out that lands in it', () => {
    const end = between(context, 'const endHousehold = useCallback(', 'const refreshAccount');
    expect(end).toContain("await tearDown('household', providers)");
    expect(end).toContain(
      "setForcedSignOut('session'); await signOutWhenFree('forced', exitDeps(providers));",
    );
    // the listener remembers a SIGNED_OUT that arrives while the household is leaving
    expect(context).toContain(
      "if (event === 'SIGNED_OUT' && keepsSession.current) signedOutMeanwhile.current = true;",
    );
    expect(context).toContain("keepsSession.current = scope === 'household';");
  });
});

describe('the household memory follows the account, not the app run', () => {
  it('a sign-in reads its own account’s memory before the session is published', () => {
    const signIn = between(
      context,
      'const signedIn = useCallback(',
      'const signOut = useCallback(',
    );
    const remember = signIn.indexOf('setLastHousehold(await rememberedHousehold(s.user.id));');
    expect(remember).toBeGreaterThan(0);
    expect(remember).toBeLessThan(signIn.indexOf('setSessionState('));
    // and so does a sign-in by an emailed link
    const link = between(context, 'const openLink = useCallback(', 'useEffect(');
    expect(link).toContain('setLastHousehold(await rememberedHousehold(result.session.user.id));');
  });

  it('a sign-out forgets it in memory, so the next account in this run never inherits it', () => {
    const reset = between(context, 'resetToAuth: () => {', 'clearMemory:');
    expect(reset).toContain('setLastHousehold(null);');
  });
});

describe('SyncProvider hands a refused pull up and deletes nothing itself', () => {
  const forbidden = between(sync, 'onForbidden:', 'engine = e;');

  it('starts the account’s settling, without waiting on it', () => {
    expect(forbidden).toContain('void pullRefused.current(refusedHousehold);');
    expect(forbidden).not.toMatch(/await /);
  });

  it('closes no latch and signs nobody out on the refusal alone', () => {
    expect(forbidden).not.toContain('stopLocalDb()');
    expect(forbidden).not.toContain("'forced'");
    expect(forbidden).not.toContain('signOut');
  });

  it('gives the test backend’s fake the account backend’s membership, as one predicate', () => {
    expect(sync).toContain(
      '{ isMember: (h: string, u: string) => backend.membership(h, u) !== undefined }',
    );
  });
});
