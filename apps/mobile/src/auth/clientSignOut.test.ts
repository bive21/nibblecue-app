import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { outboxTeardown, setSyncRuntime, type SyncRuntime } from '../sync/status';
import { runTeardown, type TeardownDeps, type TeardownUser } from './teardown';

/**
 * THE APP IGNORED THE AUTH CLIENT SIGNING ITSELF OUT (the first-day trace, 2026-09-25).
 *
 * Three things are held here. The PREMISE, with the supabase-js the app ships: a refresh the
 * server refuses makes the client drop the session and emit SIGNED_OUT on its own. The ORDER that
 * decides whether the unsynced queue survives the forced sign-out it now triggers — the teardown
 * reads the queue through the running sync engine, so nothing may unmount that engine before
 * step 3. And the WIRING in `AuthContext.tsx`, which is a `.tsx` over React Native that node
 * cannot import, so it is read as source the way `bindings.test.ts` reads it.
 */

/* ------------------------------------------------------------------ the premise, as shipped */

const URL_ = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_test';
const STORAGE_KEY = 'sb-abcdefghijklmnopqrst-auth-token';

function storedSession(expiresInSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'at',
    refresh_token: 'rt-already-rotated',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + expiresInSeconds,
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'dana@example.com',
      email_confirmed_at: '2026-09-24T12:00:00Z',
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-09-24T11:59:00Z',
    },
  };
}

/** A client over a stored session, whose Auth server refuses every refresh as a replayed token. */
async function refusedRefresh(expiresInSeconds: number) {
  const map = new Map<string, string>([
    [STORAGE_KEY, JSON.stringify(storedSession(expiresInSeconds))],
  ]);
  const storage = {
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
  const fetchFn = async (input: string | URL | Request) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    );
    if (url.pathname === '/auth/v1/token')
      // what GoTrue answers a refresh token used a second time outside the reuse interval
      return new Response(
        JSON.stringify({
          code: 400,
          error_code: 'refresh_token_already_used',
          msg: 'Invalid Refresh Token: Already Used',
        }),
        { status: 400, headers: { 'content-type': 'application/json' } },
      );
    return new Response('{}', { status: 404 });
  };
  const client = createClient(URL_, KEY, {
    auth: { storage, autoRefreshToken: false, persistSession: true, detectSessionInUrl: false },
    global: { fetch: fetchFn },
  });
  const events: string[] = [];
  const { data } = client.auth.onAuthStateChange(e => void events.push(e));
  // the call `SupabaseAuthProvider.refreshSession` makes, with the stored refresh token
  const { error } = await client.auth.refreshSession({ refresh_token: 'rt-already-rotated' });
  data.subscription.unsubscribe();
  return { events, error, stored: map.has(STORAGE_KEY) };
}

describe('supabase-js signs itself out when the server refuses a refresh', () => {
  it('drops the session and says SIGNED_OUT — and says nothing else about it', async () => {
    const r = await refusedRefresh(-60);
    expect(r.error?.code).toBe('refresh_token_already_used');
    expect(r.events).toContain('SIGNED_OUT');
    expect(r.stored).toBe(false);
  });

  it('keeps a session whose access token still works: then only the refresh reducer can tell', async () => {
    // the other half of why `refresh` keeps its own forced sign-out (session.ts `reduceRefresh`)
    const r = await refusedRefresh(600);
    expect(r.error?.code).toBe('refresh_token_already_used');
    expect(r.events).not.toContain('SIGNED_OUT');
    expect(r.stored).toBe(true);
  });
});

/* ------------------------------------------------------ the order that keeps the queue (rule 7) */

const dana: TeardownUser = { id: 'u1', email: 'dana@example.com' };
const OPS = [{ client_op_id: 'op-1' }, { client_op_id: 'op-2' }, { client_op_id: 'op-3' }];

function runtime(): SyncRuntime {
  return {
    flush: async () => undefined,
    pullNow: async () => undefined,
    mock: null,
    pending: async () => OPS as never,
    refresh: async () => undefined,
    dueNow: async () => undefined,
    retry: async () => undefined,
    stopForTeardown: () => undefined,
  };
}

/** The teardown with the app's real outbox binding, everything else recorded. */
function deps(onStep1: () => void) {
  const kept: unknown[][] = [];
  let deleted = false;
  const noop = async () => undefined;
  const d: TeardownDeps = {
    flags: { get: async () => null, set: async mark => (mark ? onStep1() : undefined) },
    session: { current: async () => dana },
    ui: { freeze: () => undefined, closeSheets: () => undefined },
    network: { online: async () => false },
    outbox: outboxTeardown(),
    quarantine: {
      write: async (_u, ops) => {
        kept.push([...ops]);
        return ops.length > 0;
      },
    },
    notifications: { cancelAllScheduled: noop, dismissAllDelivered: noop },
    widgets: { clearSnapshot: noop, reloadAll: noop },
    push: { markInvalidOnServer: noop, unregisterLocally: noop },
    auth: { signOut: noop },
    db: {
      closeAndDelete: async () => {
        deleted = true;
      },
    },
    keychain: { clearSession: noop },
    prefs: { clearForSignOut: noop, clearForHouseholdEnd: noop },
    caches: { clearMemory: noop, clearTmp: noop },
    nav: { resetToAuth: () => undefined },
    analytics: { emit: () => undefined },
  };
  return { d, kept, deleted: () => deleted };
}

afterEach(() => setSyncRuntime(null));

describe('a forced sign-out keeps what has not synced only while the sync engine is still up', () => {
  it('quarantines the whole queue when the engine is running through step 3', async () => {
    setSyncRuntime(runtime());
    const t = deps(() => undefined);
    const r = await runTeardown('forced', t.d);
    expect(r.quarantined).toBe(3);
    expect(t.kept).toEqual([OPS]);
    expect(t.deleted()).toBe(true);
  });

  it('keeps nothing if the engine is gone before step 3 — which `signed_out` set first would do', async () => {
    // `SyncProvider` keys the engine on the signed-in user; a render with the session already
    // `signed_out` unmounts it (`setSyncRuntime(null)`). Here that render lands during step 1.
    setSyncRuntime(runtime());
    const t = deps(() => setSyncRuntime(null));
    const r = await runTeardown('forced', t.d);
    expect(r.quarantined).toBe(0);
    expect(t.kept).toEqual([]);
    // …and step 8 still deletes the database the entries were in
    expect(t.deleted()).toBe(true);
  });
});

/* -------------------------------------------------------------------------------- the wiring */

const strip = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const context = strip(readFileSync(join(__dirname, 'AuthContext.tsx'), 'utf8'));
const flat = context.replace(/\s+/g, ' ');

/** The source of the one effect that subscribes to the auth client's events. */
function subscription(): string {
  const at = flat.indexOf('providers.auth.onAuthStateChange(');
  expect(at, 'AuthContext subscribes to the auth client').toBeGreaterThan(0);
  const end = flat.indexOf('}, [providers, tearDown]);', at);
  expect(end, 'the subscription effect closes where expected').toBeGreaterThan(at);
  return flat.slice(at, end);
}

describe('AuthContext answers SIGNED_OUT with the existing forced sign-out', () => {
  it('asks the pure rule, with the session and the teardown as they are right now', () => {
    expect(subscription()).toContain(
      'effectOfClientSignOut(event, { status: sessionRef.current.status, tearingDown: tearingDown.current, })',
    );
  });

  it('runs the forced teardown with the notice, and never flips the session first', () => {
    const effect = subscription();
    expect(effect).toContain("setForcedSignOut('session'); void tearDown('forced', providers);");
    // `signed_out` first would unmount the sync engine before step 3 (the test above)
    expect(effect).not.toContain('setSessionState(');
    // started, not awaited: supabase-js holds its auth lock while it calls this, and step 7 of
    // the teardown needs it
    expect(effect).not.toMatch(/await tearDown\(/);
  });

  it('adds no teardown of its own: every exit is still the one function with its two call sites', () => {
    expect(flat.split('teardownDeps(')).toHaveLength(3);
    expect(flat).not.toMatch(/closeAndDeleteLocalDb|deleteDatabaseAsync/);
  });

  it('lets a teardown already under way own the exit when the refused refresh returns', () => {
    const refresh = flat.slice(flat.indexOf('const refresh = useCallback('));
    const guard = refresh.indexOf('if (tearingDown.current) {');
    const flip = refresh.indexOf('setSessionState(state);');
    expect(guard, 'the guard').toBeGreaterThan(0);
    expect(guard, 'the guard comes before the session is set').toBeLessThan(flip);
    // …and returns before it, having only remembered a refusal a household teardown cannot answer
    const body = refresh.slice(guard, flip);
    expect(body).toContain(
      "if (keepsSession.current && reduceRefresh(cur, outcome).effect === 'forced_sign_out') signedOutMeanwhile.current = true; return; }",
    );
  });

  /**
   * THE REFRESH THE SERVER REFUSES, on its own (2026-09-25). It set `signed_out` and then started
   * the teardown — the order the test above shows loses the queue. Now the teardown runs first and
   * says `signed_out` at its last step; the refresh sets it only after a teardown that threw.
   */
  it('starts a refused refresh’s teardown before anything says signed out', () => {
    const refresh = flat.slice(
      flat.indexOf('const refresh = useCallback('),
      flat.indexOf('/* ---- an invite held for somebody who has not joined yet'),
    );
    const forced = refresh.indexOf("if (effect === 'forced_sign_out') {");
    const teardown = refresh.indexOf("await tearDown('forced', providers);");
    const firstFlip = refresh.indexOf('setSessionState(');
    expect(forced, 'the forced branch').toBeGreaterThan(0);
    expect(teardown, 'the teardown is awaited in it').toBeGreaterThan(forced);
    expect(firstFlip, 'nothing says signed out before the teardown starts').toBeGreaterThan(
      teardown,
    );
    // …and the fallback flip never lands in the middle of somebody else's teardown
    expect(refresh).toContain(
      "if (!tearingDown.current && sessionRef.current.status === 'signed_in') { setSessionState(state); }",
    );
  });

  it('writes no account mid-teardown: an empty read would unmount the engine too', () => {
    const read = flat.slice(
      flat.indexOf('const refreshAccount = useCallback('),
      flat.indexOf('const refresh = useCallback('),
    );
    expect(read.length).toBeGreaterThan(0);
    const before = read.indexOf('tearingDown.current) return null;');
    const call = read.indexOf('await providers.api.bootstrapState();');
    const after = read.indexOf('if (tearingDown.current) return null;', call);
    const write = read.indexOf('await adopt(state)');
    expect(before).toBeGreaterThan(0);
    expect(before).toBeLessThan(call);
    expect(after).toBeGreaterThan(call);
    expect(after).toBeLessThan(write);
    // and `adopt` is the one place a read becomes the account…
    expect(flat.match(/setAccount\(state\);/g) ?? []).toHaveLength(1);
    const adopt = flat.slice(flat.indexOf('const adopt = useCallback('));
    const body = adopt.slice(0, adopt.indexOf('}, []);'));
    expect(body).toContain('setAccount(state);');
    // …and it refuses, itself, to write one mid-teardown or once signed out: a caller's own check
    // can be an `await` old by the time it gets here (the adversarial review, 2026-09-25)
    const guard = body.indexOf(
      "if (tearingDown.current || cur.status !== 'signed_in') return false;",
    );
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(body.indexOf('setAccount(state);'));
  });

  /**
   * THE LATCH A HOUSEHOLD TEARDOWN LEFT CLOSED (`mirror.ts` `latchLifts`): lifted by the read that
   * shows the next household BEFORE its state is set — the commit it causes mounts screens that
   * read before `SyncProvider`'s effect can lift it — and never over a sign-out's latch.
   */
  it('lifts the database latch for a household about to be shown, before the state is set', () => {
    const adopt = flat.slice(flat.indexOf('const adopt = useCallback('));
    const body = adopt.slice(0, adopt.indexOf('}, []);'));
    const guard = body.indexOf(
      "if (tearingDown.current || cur.status !== 'signed_in') return false;",
    );
    const lift = body.indexOf('allowReopen();');
    const set = body.indexOf('setAccount(state);');
    expect(lift).toBeGreaterThan(guard);
    expect(lift).toBeLessThan(set);
    // decided by the pure rule, from the household about to be shown and the one shown now
    // (0153: the household shown is the FOCUSED account's, decided before the database file is
    // chosen, and the guard is asked again after that one wait)
    expect(body).toContain(
      'const showing = mirrorOf(state); const before = mirrorOf(accountRef.current);',
    );
    expect(body).toContain(
      "latchLifts({ showing, mirror: before, tearingDown: tearingDown.current, signedIn: cur.status === 'signed_in', })",
    );
    expect(body.indexOf('await selectLocalDbHousehold(showing);')).toBeLessThan(lift);
    // and nothing is awaited between the lift and the state, so no teardown can start between
    expect(body.slice(lift, set)).not.toContain('await');
  });
});
