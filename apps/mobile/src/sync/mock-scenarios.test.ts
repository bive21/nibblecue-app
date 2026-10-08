/**
 * Every row of `docs/OFFLINE_SYNC.md` §9, run against the in-memory server.
 *
 * §9 says of its matrix: "Each row is an automated test, not a manual check." `SYNC_SCENARIOS` in
 * `packages/core` is the literal form of that, written against `SyncApi` and `ServerProbe` and
 * nothing else — so this file is one of its two backends, and
 * `packages/db/src/integration/sync-scenarios.test.ts` is the other. The same eighteen assertions
 * run here in node in milliseconds and there against Postgres with real RLS, which is what turns
 * "the fake agrees with the server" from a hope into a failing test (D23).
 *
 * TWO CLOCKS, BOTH COPIED FROM THE POSTGRES HARNESS, because a divergence in the harness is the
 * most expensive kind to debug:
 *
 *   * **The server's clock ticks.** `app.touch()` and `now()` advance between statements on a real
 *     server, so a field edited a millisecond after its row was created wins the per-field
 *     comparison. Frozen, `mergeFields` would drop that edit and `@SYNC-DELETE-EDIT` would fail
 *     here while passing against Postgres.
 *   * **The scenario's clock is in the past.** `sync-scenarios.test.ts:148` anchors it at
 *     2026-03-02 for the same reason this file does: `@SYNC-1000` walks a thousand one-second
 *     steps, and a matrix written at the wall clock would end up sixteen minutes in the future,
 *     where `app.sync_edit_clock` rejects every op CC422 — correctly, and uselessly.
 */
import { deriveOpId } from '@nibblecue/core';
import { SYNC_SCENARIOS, type ScenarioCtx } from '@nibblecue/core/sync/scenarios';
import { describe, expect, it } from 'vitest';
import { FakeClock } from '../testing/clock';
import { MockSyncApi, MockSyncServer } from './providers/mock';
import { mockProbe } from './providers/mock-probe';

const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-000000000001';
const OWNER = 'bbbbbbbb-0000-4000-8000-000000000001';
const PARTNER = 'bbbbbbbb-0000-4000-8000-000000000002';
const CHILD_A = 'cccccccc-0000-4000-8000-0000000000e1';
const CHILD_B = 'cccccccc-0000-4000-8000-0000000000e2';
const LOCATION = 'dddddddd-0000-4000-8000-000000000001';
const CONTAINER = 'dddddddd-0000-4000-8000-0000000000c1';
/** The namespace every scenario's ids derive from, so a failure names the same row every run. */
const SEED = '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f';
const CONTAINER_ML = 150;

function harness(scenarioId: string) {
  const clock = new FakeClock('2026-03-02T10:00:00.000Z');
  let serverTicks = Date.parse('2026-09-14T08:00:00.000Z');
  const server = new MockSyncServer({
    now: () => {
      serverTicks += 1;
      return serverTicks;
    },
  });
  // Both caregivers can admin: `@SYNC-DELETE-EDIT` has the partner correcting and deleting an
  // entry the owner created, which `activities_update` allows only for OWNER and PARENT.
  server.addMember({ household_id: HOUSEHOLD, user_id: OWNER, role: 'OWNER' });
  server.addMember({ household_id: HOUSEHOLD, user_id: PARTNER, role: 'PARENT' });
  server.addChild({ id: CHILD_A, household_id: HOUSEHOLD, name: 'Emma' });
  server.addChild({ id: CHILD_B, household_id: HOUSEHOLD, name: 'Liam' });
  server.addLocation({ id: LOCATION, household_id: HOUSEHOLD, name: 'Fridge', kind: 'FRIDGE' });
  server.addContainer({
    id: CONTAINER,
    householdId: HOUSEHOLD,
    ownerId: OWNER,
    locationId: LOCATION,
    ml: CONTAINER_ML,
  });

  const api = new MockSyncApi(server, OWNER);
  const ctx: ScenarioCtx = {
    householdId: HOUSEHOLD,
    childId: CHILD_A,
    otherChildId: CHILD_B,
    userId: OWNER,
    otherUserId: PARTNER,
    containerId: CONTAINER,
    containerMl: CONTAINER_ML,
    locationId: LOCATION,
    otherDevice: new MockSyncApi(server, PARTNER),
    uuid: (tag: string) => deriveOpId(SEED, `${scenarioId}:${tag}`),
    now: () => clock.now(),
    iso: (at?: number) => clock.iso(at),
  };
  return { server, api, ctx, probe: mockProbe(server) };
}

describe('the OFFLINE_SYNC §9 matrix against MockSyncApi', () => {
  it('runs every scenario the table claims', () => {
    expect(SYNC_SCENARIOS.length).toBe(18);
  });

  for (const scenario of SYNC_SCENARIOS) {
    it(`${scenario.tag} — ${scenario.title}`, async () => {
      const h = harness(scenario.id);
      await scenario.run(h.api, h.probe, h.ctx);
    });
  }
});
