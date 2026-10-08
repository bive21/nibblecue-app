/**
 * Which transport the build runs on — the same shape, and the same rule, as
 * `auth/providers/index.ts`: `supabase` when the URL and the publishable key both exist, the
 * in-memory fake otherwise, and no screen, no worker and no test ever learns which one it got.
 *
 * The two arms are picked by `env.authProvider`, not by a second switch of their own: a build
 * whose accounts live in Supabase and whose logs go to an in-memory fake would be a build whose
 * data could not be explained, and one that signed in against the mock and pushed to a project
 * would be a build that cannot authenticate a single op.
 */
import type { Database } from '@nibblecue/db';
import type { AppEnv } from '../../env';
import { getSupabaseClient } from '../../supabase/client';
import type { KeyValueStore } from '../../prefs';
import { MOCK_SYNC_STATE_KEY, MockSyncApi, MockSyncServer } from './mock';
import { ensureMockChildren, ensureMockMembership, type MockChildSeed } from './mockSeed';
import { SupabaseSyncApi } from './supabase';
import type { SyncRpcClient } from './supabase';
import type { MockMemberRole, SyncProviders } from './types';

type PushArgs = Database['public']['Functions']['sync_push']['Args'];
type PullArgs = Database['public']['Functions']['sync_pull']['Args'];

export { MockSyncApi, MockSyncServer } from './mock';
export { ensureMockChildren, ensureMockMembership, type MockChildSeed } from './mockSeed';
// `mockProbe` (./mock-probe) is not re-exported: it is the §9 matrix's view of the fake server,
// read only by the scenario suites and `../harness.ts`, which import it by path. From here it
// shipped in every build (src/testing/no-bundle.test.ts keeps it out).
export { SupabaseSyncApi } from './supabase';
export * from './types';

export interface SyncProviderDeps {
  /** Whose device this is: the mock needs an identity to resolve `auth.uid()` against, and the
   *  Supabase arm needs none because the JWT carries it. */
  userId: string;
  /** The household whose log this device syncs, used only to seed the fake's membership. */
  householdId: string;
  /** Injected so a dev build can drive the fake off the same clock as the rest of the app. */
  now?: () => number;
  /**
   * Where the mock arm keeps its "server" between launches (`prefs/async-storage`'s
   * `mockStateStore` on a device). Absent, the fake is memory alone — every test.
   */
  store?: KeyValueStore;
  /**
   * The household's children as the account knows them — the mock arm only. A real project has
   * the rows already (setup and "Add a child" write them through the API); the fake's children
   * live in the AUTH mock, so without this its sync half has none, and every op that checks one
   * is refused (`ensureMockChildren`).
   */
  children?: readonly MockChildSeed[];
  /** The account's role in the household — the mock arm only (`ensureMockMembership`). */
  role?: MockMemberRole;
  /**
   * The account backend's own answer to "is this person in this household" — the mock arm only,
   * so a removal or a lapsed seat made on the test backend's accounts refuses the pull as a real
   * project's would (`MockSyncServerOptions.isMember`).
   */
  isMember?: (householdId: string, userId: string) => boolean;
}

export async function createSyncProviders(
  env: AppEnv,
  deps: SyncProviderDeps,
): Promise<SyncProviders> {
  if (env.authProvider === 'supabase' && env.supabaseUrl && env.supabaseAnonKey) {
    // The same client the auth pair holds: one GoTrue, one refresh timer, one session.
    const client = getSupabaseClient(env.supabaseUrl, env.supabaseAnonKey);
    // The one place a batch of ops is claimed to be JSON. It is: every field of a `PushOp` is a
    // string, a number, a boolean, null, or an object of those — `payload` is typed
    // `Record<string, unknown>` because a payload's shape belongs to its entity, not to the
    // envelope, and `unknown` is what keeps a caller from putting a Date or a Map in one.
    const rpc: SyncRpcClient = {
      rpc: (fn, args) =>
        fn === 'sync_push'
          ? client.rpc('sync_push', { ops: args['ops'] } as PushArgs)
          : client.rpc('sync_pull', { req: args['req'] } as PullArgs),
    };
    // ...and the same client's Realtime, as it is, for the household's nudges (migration 0149):
    // the socket rides the session the client already keeps, and `setAuth` reads its token
    return { api: new SupabaseSyncApi(rpc, client), mock: null };
  }
  const server = new MockSyncServer({
    ...(deps.now !== undefined ? { now: deps.now } : {}),
    // one snapshot per household: two dev accounts on one phone never read each other's server
    ...(deps.store !== undefined
      ? { store: deps.store, storeKey: `${MOCK_SYNC_STATE_KEY}:${deps.householdId}` }
      : {}),
    // one predicate for both halves, as `app.is_member` is on a real project
    ...(deps.isMember !== undefined ? { isMember: deps.isMember } : {}),
  });
  // A killed app resumes with its "server" intact. Before this, every launch built a fresh,
  // empty fake, and the next `full` pull swept the storage locations this device had already
  // synced — the owner's first device pass of the stash found Save disabled for that reason.
  await server.load();
  // The fake resolves authorisation out of `household_members` exactly as 0002's policies do, so
  // a dev build has to tell it that this device's owner is a member — otherwise every op it
  // pushes comes back FORBIDDEN, which is correct behavior for a server nobody has joined.
  ensureMockMembership(server, deps.householdId, deps.userId, deps.role ?? 'OWNER');
  // ...and that the household has the four default locations bootstrap_household writes.
  server.seedDefaultLocations(deps.householdId);
  // ...and the published immunisation schedule the pull would bring down from a real project
  server.seedVaccineProfile();
  // ...and the household's children, which a real project already has
  ensureMockChildren(server, deps.householdId, deps.children ?? []);
  await server.save();
  return { api: new MockSyncApi(server, deps.userId), mock: server };
}
