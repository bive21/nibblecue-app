import { describe, expect, it } from 'vitest';
import { MockAccountsApi, MockAuthProvider, MockBackend, type MockState } from './providers/mock';
import type { AccountState, SessionStore } from './providers/types';
import { settleRefusedPull, type RefusedPullDeps } from './refusedPull';
import { reduceRefresh, stateAtLaunch, type ForcedSignOut, type Session } from './session';

/**
 * A REFUSED PULL, SETTLED, AGAINST THE TEST BACKEND (`refusedPull.ts`; WP4 D37 reconciled with
 * `phase: 'ended'`, and the adversarial review of 2026-09-25). The account reads and the session
 * refreshes here are `MockAccountsApi` and `MockAuthProvider` answering as they do in Expo Go;
 * what the state machine would DO is recorded, in order, so the order is what is asserted.
 *
 * The case the review found: an hour in the background expires the token, a flaky network fails
 * the refresh, and supabase-js sends the project's key in place of the person's — so the pull is
 * refused and the account read cannot see anybody. That parent had done nothing but put the phone
 * down, and was signed out. Now the session is asked first, and only a good session whose account
 * still cannot see this person signs anyone out on the household's account.
 */

const T0 = Date.parse('2026-09-25T20:00:00Z');
const SAM = 'u-sam';
const DANA = 'u-dana';
const IVERSENS = 'h-iversen';

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

const user = (id: string, email: string): MockState['users'][number] => ({
  id,
  email,
  password_digest: null,
  verified: true,
  provider: 'email',
  session_version: 1,
  display_name: email.split('@')[0] ?? '',
  deleted_at: null,
});

/** A phone signed in to the test backend as this account. */
async function signedInAs(backend: MockBackend, id: string) {
  const account = backend.user(id);
  if (account === undefined) throw new Error(`no account ${id}`);
  const store = sessionStore();
  await store.save(backend.mintSession(account));
  const auth = new MockAuthProvider(backend, store);
  await auth.restoreSession();
  return { auth, api: new MockAccountsApi(backend, auth) };
}

/** Sam's phone, signed in to the test backend, mirroring the Iversens as a caregiver. */
async function world() {
  let now = T0;
  const backend = new MockBackend({ now: () => now });
  backend.state.users.push(user(DANA, 'dana@example.test'), user(SAM, 'sam@example.test'));
  backend.state.households.push({
    id: IVERSENS,
    name: 'The Iversen family',
    owner_id: DANA,
    welcome_expires_at: null,
    created_at: new Date(T0).toISOString(),
  });
  backend.state.members.push(
    {
      household_id: IVERSENS,
      user_id: DANA,
      role: 'OWNER',
      joined_at: new Date(T0).toISOString(),
      removed_at: null,
      expires_at: null,
    },
    {
      household_id: IVERSENS,
      user_id: SAM,
      role: 'CAREGIVER',
      joined_at: new Date(T0).toISOString(),
      removed_at: null,
      expires_at: new Date(T0 + 6 * 3_600_000).toISOString(),
    },
  );
  const { auth, api } = await signedInAs(backend, SAM);
  return { backend, auth, api, advance: (ms: number) => (now += ms) };
}

type World = Awaited<ReturnType<typeof world>>;

/**
 * The state machine's side of it, recorded. `read` and `checkSession` are the backend's unless a
 * test hands in answers of its own (a read the network ate, a read with nobody in it).
 */
function machine(
  w: World,
  over: {
    reads?: (AccountState | null | 'backend')[];
    overtakeAfter?: 'read' | 'session';
  } = {},
) {
  const did: string[] = [];
  let mirror: string | null = IVERSENS;
  let overtaken = false;
  const reads = [...(over.reads ?? [])];
  // the app's session state as the refused pull finds it: signed in, as Sam
  const signedIn = stateAtLaunch(w.auth.current());
  const label = (answer: AccountState | null): string =>
    answer === null
      ? 'failed'
      : answer.profile === null
        ? 'nobody'
        : answer.memberships.map(m => m.household_id).join(',') || 'none';
  const deps: RefusedPullDeps = {
    userId: SAM,
    householdId: IVERSENS,
    mirror: () => mirror,
    overtaken: () => overtaken,
    read: async () => {
      // an injected `null` is a read the network ate, not "none injected"
      const next = reads.length > 0 ? reads.shift() : 'backend';
      if (next === undefined) throw new Error('unreachable');
      const answer = next === 'backend' ? await w.api.bootstrapState().catch(() => null) : next;
      did.push(`read:${label(answer)}`);
      if (over.overtakeAfter === 'read') overtaken = true;
      return answer;
    },
    // what `AuthContext` does: ask the provider, and read the answer as the refresh loop does
    checkSession: async () => {
      const outcome = await w.auth.refreshSession();
      did.push(`session:${outcome.kind}`);
      if (over.overtakeAfter === 'session') overtaken = true;
      return reduceRefresh(signedIn, outcome).effect;
    },
    adopt: async read => {
      did.push(`adopt:${read.memberships.map(m => m.household_id).join(',') || 'none'}`);
      mirror = read.memberships[0]?.household_id ?? null;
      return true;
    },
    endHousehold: async () => {
      did.push('endHousehold');
      return true;
    },
    signOut: async (why: ForcedSignOut) => {
      did.push(`signOut:${why}`);
    },
    log: () => undefined,
  };
  return { deps, did };
}

const NOBODY: AccountState = {
  profile: null,
  memberships: [],
  children: [],
  modules: [],
  entitlement: null,
  serverNow: T0,
  deletionPending: null,
};

describe('a refused pull the account explains', () => {
  it('a seat that ran out: the household leaves the phone, and nobody is signed out', async () => {
    const w = await world();
    w.advance(7 * 3_600_000);
    const m = machine(w);
    expect(await settleRefusedPull(m.deps)).toBe('ended');
    expect(m.did).toEqual(['read:none', 'endHousehold', 'adopt:none']);
  });

  it('a parent removing somebody: the same', async () => {
    const w = await world();
    const dana = await signedInAs(w.backend, DANA);
    expect(await dana.api.removeMember(IVERSENS, SAM)).toEqual({ ok: true });
    const m = machine(w);
    expect(await settleRefusedPull(m.deps)).toBe('ended');
    expect(m.did).toEqual(['read:none', 'endHousehold', 'adopt:none']);
  });

  it('a refusal the account contradicts: nothing deleted, nobody asked, the read written', async () => {
    const w = await world();
    const m = machine(w);
    expect(await settleRefusedPull(m.deps)).toBe('kept');
    expect(m.did).toEqual([`read:${IVERSENS}`, `adopt:${IVERSENS}`]);
  });
});

describe('a refused pull the account cannot explain asks the session first', () => {
  it('a token that lapsed on a flaky network: the session comes back good, nothing leaves', async () => {
    // the first read went out without the person's token and saw nobody; the refresh succeeds
    const w = await world();
    const m = machine(w, { reads: [NOBODY] });
    expect(await settleRefusedPull(m.deps)).toBe('kept');
    expect(m.did).toEqual(['read:nobody', 'session:ok', `read:${IVERSENS}`, `adopt:${IVERSENS}`]);
  });

  it('no connection at all: the session cannot be asked, so nothing is decided or deleted', async () => {
    const w = await world();
    w.backend.online = false;
    const m = machine(w);
    expect(await settleRefusedPull(m.deps)).toBe('held');
    expect(m.did).toEqual(['read:failed', 'session:offline']);
  });

  it('a session the server has revoked: it is the SESSION that ended, and says so', async () => {
    // "Sign out everywhere" on the other phone: the read sees nobody, the refresh is refused
    const w = await world();
    w.backend.revokeSessions(SAM);
    const m = machine(w);
    expect(await settleRefusedPull(m.deps)).toBe('signed_out');
    expect(m.did).toEqual(['read:nobody', 'session:invalid', 'signOut:session']);
  });

  it('a good session whose account still cannot see this person: the household sign-out', async () => {
    const w = await world();
    const m = machine(w, { reads: [NOBODY, NOBODY] });
    expect(await settleRefusedPull(m.deps)).toBe('signed_out');
    expect(m.did).toEqual(['read:nobody', 'session:ok', 'read:nobody', 'signOut:household']);
  });

  it('a good session whose second read fails outright: no answer, nothing decided', async () => {
    const w = await world();
    const m = machine(w, { reads: [null, null] });
    expect(await settleRefusedPull(m.deps)).toBe('held');
    expect(m.did).toEqual(['read:failed', 'session:ok', 'read:failed']);
  });

  it('a good session whose second read shows the household gone: it leaves, session kept', async () => {
    const w = await world();
    w.advance(7 * 3_600_000);
    const m = machine(w, { reads: [null] });
    expect(await settleRefusedPull(m.deps)).toBe('ended');
    expect(m.did).toEqual(['read:failed', 'session:ok', 'read:none', 'endHousehold', 'adopt:none']);
  });
});

describe('nothing happens once something else owns the exit', () => {
  it('a teardown started while the account was being read', async () => {
    const w = await world();
    w.advance(7 * 3_600_000);
    const m = machine(w, { overtakeAfter: 'read' });
    expect(await settleRefusedPull(m.deps)).toBe('overtaken');
    expect(m.did).toEqual(['read:none']);
  });

  it('a teardown started while the session was being asked — the auth client said SIGNED_OUT', async () => {
    const w = await world();
    w.backend.revokeSessions(SAM);
    const m = machine(w, { overtakeAfter: 'session' });
    expect(await settleRefusedPull(m.deps)).toBe('overtaken');
    expect(m.did).toEqual(['read:nobody', 'session:invalid']);
  });

  it('a household the app has already moved on from', async () => {
    const w = await world();
    const m = machine(w);
    const moved = { ...m.deps, mirror: () => 'h-another' };
    expect(await settleRefusedPull(moved)).toBe('held');
    expect(m.did).toEqual([`read:${IVERSENS}`]);
  });
});
