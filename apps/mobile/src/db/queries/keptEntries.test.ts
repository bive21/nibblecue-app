/**
 * WHAT A MODULE TURNED OFF STILL HOLDS (2026-09-26). What you track's "Turned off, still stored"
 * said "Nothing logged yet" beside every module that was off, because the screen asked for no
 * counts at all — over a log that was still there, on the one card whose job is to prove that
 * turning a module off deletes nothing.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../driver';
import { CHILD_A, HOUSEHOLD, LOCATION, USER, seedHousehold } from '../../testing/fixtures';
import { keptEntryCounts } from './schedule';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const T0 = '2026-09-01T08:00:00.000Z';

let seq = 0;
const next = (prefix: string) => {
  seq += 1;
  return `${prefix}-0000-4000-8000-${String(seq).padStart(12, '0')}`;
};

async function entry(db: Db, type: string, deletedAt: string | null = null): Promise<void> {
  const id = next('44444444');
  await db.run(
    `insert into activities
       (id, client_op_id, household_id, child_id, type, start_at, end_at, is_private,
        created_by, created_at, updated_at, deleted_at)
     values (?, ?, ?, ?, ?, ?, null, 0, ?, ?, ?, ?)`,
    [id, id, HOUSEHOLD, CHILD_A, type, T0, USER, T0, T0, deletedAt],
  );
}

async function container(db: Db, status: string): Promise<void> {
  const id = next('55555555');
  await db.run(
    `insert into milk_containers (id, household_id, owner_id, location_id, amount_ml,
      initial_ml, pumped_at, status, created_by, created_at, updated_at)
      values (?, ?, ?, ?, 120, 150, ?, ?, ?, ?, ?)`,
    [id, HOUSEHOLD, USER, LOCATION, T0, status, USER, T0, T0],
  );
}

describe('every entry still stored, by module', () => {
  it('counts each module’s entries from the first one, and not the deleted', async () => {
    const f = await seedHousehold();
    restores.push(f.restoreIds);
    await entry(f.db, 'sleep');
    await entry(f.db, 'sleep');
    await entry(f.db, 'tummy');
    await entry(f.db, 'tummy', T0);

    const counts = await keptEntryCounts(f.db, HOUSEHOLD);
    expect(counts.sleep).toBe(2);
    expect(counts.tummy).toBe(1);
    expect(counts.bath ?? 0).toBe(0);
  });

  it('counts every container the stash ever held, used ones too', async () => {
    const f = await seedHousehold();
    restores.push(f.restoreIds);
    const before = (await keptEntryCounts(f.db, HOUSEHOLD)).stash ?? 0;
    await container(f.db, 'STORED');
    await container(f.db, 'USED');

    expect((await keptEntryCounts(f.db, HOUSEHOLD)).stash).toBe(before + 2);
  });
});
