/**
 * `ServerProbe` over `MockSyncServer` — the node half of the seam `packages/db`'s
 * `integration/probe.ts` is the Postgres half of.
 *
 * `SYNC_SCENARIOS` is written against two interfaces and nothing else, `SyncApi` and
 * `ServerProbe`, so the same fifteen assertions run in node against the fake and in CI against
 * Postgres (D23). Everything here is therefore a read, never a write: a probe that could change
 * the server would let a scenario pass by fixing the state it was meant to be checking.
 *
 * `start_at` is compared as a PARSED instant, not as a string, because Postgres hands back
 * `2026-09-14T08:00:00+00:00` where the device sent `2026-09-14T08:00:00.000Z`. The two probes
 * have to answer the same question the same way or the shared table is not shared.
 */
import type { DetailTable } from '@nibblecue/core';
import type { ActivityWhere, ServerProbe } from '@nibblecue/core/sync/scenarios';
import type { MockSyncServer, Row } from './mock';

export function mockProbe(server: MockSyncServer): ServerProbe {
  const at = (v: unknown): number => Date.parse(String(v));

  return {
    countActivities(householdId: string, where: ActivityWhere): Promise<number> {
      const n = server.activities.filter(row => {
        if (row['household_id'] !== householdId) return false;
        if (where.type !== undefined && row['type'] !== where.type) return false;
        if (where.start_at !== undefined && at(row['start_at']) !== at(where.start_at))
          return false;
        if (where.child_id !== undefined && (row['child_id'] ?? null) !== where.child_id) {
          return false;
        }
        if (where.include_deleted !== true && row['deleted_at'] !== null) return false;
        return true;
      }).length;
      return Promise.resolve(n);
    },

    activityRow(id: string): Promise<Row | null> {
      return Promise.resolve(server.activities.find(r => r['id'] === id) ?? null);
    },

    detailRow(activityId: string, table: DetailTable): Promise<Row | null> {
      return Promise.resolve(server.detailRow(activityId, table));
    },

    ledgerRows(containerId: string): Promise<Row[]> {
      const rows = server.milk_inventory_transactions
        .filter(r => r['container_id'] === containerId)
        .sort((a, b) => {
          const d = at(a['created_at']) - at(b['created_at']);
          return d !== 0 ? d : Number(b['delta_ml']) - Number(a['delta_ml']);
        });
      return Promise.resolve(rows);
    },

    containerAmount(containerId: string): Promise<number | null> {
      const row = server.milk_containers.find(r => r['id'] === containerId);
      return Promise.resolve(row === undefined ? null : Number(row['amount_ml']));
    },

    timerRows(householdId: string): Promise<Row[]> {
      const rows = server.running_timers
        .filter(r => r['household_id'] === householdId)
        .sort((a, b) => {
          const d = at(a['started_at']) - at(b['started_at']);
          return d !== 0 ? d : String(a['id']).localeCompare(String(b['id']));
        });
      return Promise.resolve(rows);
    },
  };
}
