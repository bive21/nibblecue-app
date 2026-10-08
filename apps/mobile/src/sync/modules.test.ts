/**
 * D7: **every core module logs with no network**, not just the ones the §9 matrix happens to
 * name.
 *
 * §9 proves the queue with bottles, diapers and one sleep timer. That is a proof about the
 * queue, not about the app: a module whose detail table has a NOT NULL column nobody fills, or
 * whose `type` the server's allow-list does not carry, fails on the one night a parent is
 * offline and using it — and fails silently, because the write succeeds locally and only the
 * push is rejected. So this file walks the whole registry: all fourteen `activity_type` values
 * and all four `timer_type` values, each logged in airplane mode and then flushed.
 *
 * THE ASSERTION THAT MATTERS IS THE DETAIL ROW, in both directions. Where
 * `DETAIL_TABLE_BY_ACTIVITY` names a table there must be exactly one row in it, on both the
 * device and the server; where it names `null` there must be NO detail row anywhere — a water
 * entry that quietly grew a `measurement_details` row would be a mirror drifting from the
 * schema, which is the failure `mirror-parity.test.ts` catches statically and this one catches
 * in motion.
 *
 * Each module runs on a restored device, so no module can pass because of a row another module
 * left behind, and no module can be suppressed by another module's duplicate-guard key.
 */
import { DETAIL_TABLES, DETAIL_TABLE_BY_ACTIVITY, type ActivityType } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { logActivity, type ActivityFields } from '../data/activities';
import { startTimer, stopTimer } from '../data/timers';
import type { Db } from '../db/driver';
import { CHILD_A, HOUSEHOLD, USER } from '../testing/fixtures';
import { createSyncHarness, type SyncHarness } from './harness';

let shared: SyncHarness | null = null;
afterEach(() => {
  shared?.dispose();
  shared = null;
});

async function device(scenario: string): Promise<SyncHarness> {
  const h = await createSyncHarness({ scenario });
  shared = h;
  return h;
}

/** The fifteen modules, each with the smallest detail its table will accept. */
const MODULES: ReadonlyArray<{ type: ActivityType; fields: Partial<ActivityFields> }> = [
  // The keys of `detail` are the detail table's own COLUMN names, not camel-cased fields: the
  // repository writes the record straight into the mirror and the same record is the op's
  // payload, so a renamed key here is a column that does not exist on either side.
  { type: 'bottle', fields: { quantity: 120, canonicalUnit: 'ml', detail: { consumed_ml: 120 } } },
  {
    type: 'breastfeed',
    fields: { detail: { first_side: 'LEFT', left_seconds: 300, right_seconds: 240 } },
  },
  { type: 'pump', fields: { detail: { sides: 'BOTH', total_ml: 90 } } },
  { type: 'diaper', fields: { detail: { kind: 'WET' } } },
  { type: 'sleep', fields: { detail: { kind: 'NAP' } } },
  { type: 'solids', fields: { detail: { meal: 'LUNCH', food: 'pear' } } },
  // The care item carries the amount the PARENT typed, as text, and nothing computes it
  // (CLAUDE.md rule 4). `amount_text` is free text here for exactly that reason.
  { type: 'med', fields: { detail: { name: 'Vitamin D', amount_text: '1 drop' } } },
  { type: 'growth', fields: { detail: { weight_g: 4200, length_mm: 540 } } },
  { type: 'temp', fields: { detail: { temp_c_hundredths: 3720, temp_method: 'AXILLARY' } } },
  { type: 'water', fields: { quantity: 30, canonicalUnit: 'ml' } },
  { type: 'tummy', fields: { quantity: 5, canonicalUnit: 'min' } },
  { type: 'bath', fields: {} },
  { type: 'milestone', fields: { notes: 'rolled over' } },
  { type: 'note', fields: { notes: 'a good day' } },
  // the Health note (0160): a start in the past, its words and its chips, still going
  { type: 'wellbeing', fields: { notes: 'red patches on her cheeks', detail: { seen: ['RASH'] } } },
];

const TIMERS = ['sleep', 'breastfeed', 'pump', 'tummy'] as const;

const countRows = async (db: Db, table: string): Promise<number> => {
  const row = await db.get<{ n: number }>(`select count(*) as n from ${table}`, []);
  return row?.n ?? 0;
};

/** Every detail table, so "no detail row anywhere" can be asserted rather than assumed. */
async function detailRowsLocally(db: Db): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const table of DETAIL_TABLES) out[table] = await countRows(db, table);
  return out;
}

describe('D7 — every module logs offline and syncs', () => {
  it('the registry this file walks is the whole registry', () => {
    expect(MODULES.map(m => m.type).sort()).toEqual(
      (Object.keys(DETAIL_TABLE_BY_ACTIVITY) as ActivityType[]).sort(),
    );
    expect(MODULES).toHaveLength(15);
    expect(TIMERS).toHaveLength(4);
  });

  for (const module of MODULES) {
    it(`${module.type}: logged in airplane mode, one server row, the right detail row`, async () => {
      const h = await device(`module-${module.type}`);
      await h.restore();

      h.net.connected = false;
      const at = h.clock.iso();
      const written = await logActivity(h.db, h.clock, {
        householdId: HOUSEHOLD,
        createdBy: USER,
        deviceId: 'device-1',
        source: 'quicklog',
        childId: CHILD_A,
        type: module.type,
        startAt: at,
        ...module.fields,
      });
      // Rule 7: the write succeeds with no network, or nothing else here matters.
      expect(written.committed).toBe(true);
      expect(await countRows(h.db, 'activities')).toBe(1);

      const expected = DETAIL_TABLE_BY_ACTIVITY[module.type];
      const local = await detailRowsLocally(h.db);
      for (const table of DETAIL_TABLES) {
        expect(local[table], `${module.type} → ${table} locally`).toBe(table === expected ? 1 : 0);
      }

      h.net.connected = true;
      const worker = h.worker();
      worker.start();
      const outcome = await worker.flush('reconnect');
      expect(outcome.failed).toBe(0);
      expect(outcome.synced).toBe(written.opIds.length);

      expect(h.server.rowCount('activities', { type: module.type })).toBe(1);
      const serverActivity = h.server.activities[0];
      expect(serverActivity?.['start_at']).toBe(at);
      for (const table of DETAIL_TABLES) {
        const row = h.server.detailRow(String(serverActivity?.['id']), table);
        expect(row === null, `${module.type} → ${table} on the server`).toBe(table !== expected);
      }
    });
  }

  for (const type of TIMERS) {
    it(`${type} timer: started and stopped offline, one activity when the network returns`, async () => {
      const h = await device(`timer-${type}`);
      await h.restore();

      h.net.connected = false;
      const startedAt = h.clock.iso();
      const timerId = h.uuid(`${type}-timer`);
      const started = await startTimer(h.db, h.clock, {
        householdId: HOUSEHOLD,
        createdBy: USER,
        deviceId: 'device-1',
        source: 'today',
        childId: CHILD_A,
        type,
        startedAt,
        timerId,
      });
      expect(started.committed).toBe(true);
      // A timer is a timestamp, not a ticking number (CLAUDE.md rule 12): the row holds when it
      // started, so a kill, a lock or a handover cannot lose the elapsed time.
      const row = await h.db.get<{ started_at: string }>(
        'select started_at from running_timers where id = ?',
        [timerId],
      );
      expect(row?.started_at).toBe(startedAt);

      h.clock.advance(20 * 60_000);
      const stopped = await stopTimer(h.db, h.clock, {
        householdId: HOUSEHOLD,
        createdBy: USER,
        deviceId: 'device-1',
        source: 'today',
        childId: CHILD_A,
        timerId,
        type,
        startAt: startedAt,
        endAt: h.clock.iso(),
        ...(type === 'sleep' ? { detail: { kind: 'NAP' } } : {}),
        ...(type === 'pump' ? { detail: { sides: 'BOTH', total_ml: 60 } } : {}),
      });
      expect(stopped.committed).toBe(true);
      // The running row is gone and the entry is in its place — no timer left running, no
      // second copy of the nap.
      expect(await countRows(h.db, 'running_timers')).toBe(0);
      expect(await countRows(h.db, 'activities')).toBe(1);

      h.net.connected = true;
      const worker = h.worker();
      worker.start();
      const outcome = await worker.flush('reconnect');
      expect(outcome.failed).toBe(0);
      expect(h.server.rowCount('activities', { type })).toBe(1);
      expect(h.server.rowCount('running_timers')).toBe(0);
    });
  }
});
