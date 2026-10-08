/**
 * The harness's own test.
 *
 * A fixture nothing checks is a fixture that quietly stops doing its job, and this one has a
 * specific way of failing: `restore()` empties the mirror, forgets `dedupe_keys`, and every
 * later scenario that logs the same thing twice is silently suppressed instead of written. That
 * failure does not look like a broken harness — it looks like a broken duplicate guard, three
 * files away, and it is exactly the leak `docs/UX_AUDIT.md` §4.62 records from the prototype.
 *
 * So the clearing is asserted the only way that means anything: the write that WAS suppressed
 * before the restore is ACCEPTED after it, with the suppression proved first (`docs/PREFLIGHT.md`
 * :60-66 — a negative assertion is worth nothing without the count that shows the thing could
 * have happened).
 */
import { describe, expect, it, afterEach } from 'vitest';
import { logActivity } from '../data/activities';
import type { Db } from '../db/driver';
import { LOCAL_ONLY_TABLES, MIRRORED_TABLES } from '../db/schema';
import { CHILD_A, HOUSEHOLD, USER } from '../testing/fixtures';
import { createSyncHarness, clearLocalDb, type SyncHarness } from './harness';

let open: SyncHarness | null = null;
afterEach(() => {
  open?.dispose();
  open = null;
});

async function setup(): Promise<SyncHarness> {
  const h = await createSyncHarness({ scenario: 'harness-test' });
  open = h;
  return h;
}

const rows = async (db: Db, table: string): Promise<number> => {
  const row = await db.get<{ n: number }>(`select count(*) as n from ${table}`, []);
  return row?.n ?? 0;
};

const diaper = (h: SyncHarness) =>
  logActivity(h.db, h.clock, {
    householdId: HOUSEHOLD,
    createdBy: USER,
    deviceId: 'device-1',
    source: 'quicklog',
    childId: CHILD_A,
    type: 'diaper',
    startAt: h.clock.iso(),
    detail: { kind: 'WET' },
  });

describe('the §9 harness', () => {
  it('restore() clears dedupe_keys, and the proof is that the suppressed write lands', async () => {
    const h = await setup();

    const first = await diaper(h);
    expect(first.committed).toBe(true);
    expect(await rows(h.db, 'dedupe_keys')).toBe(1);

    // The thing could have happened: without a restore the identical second tap IS suppressed.
    const second = await diaper(h);
    expect(second.suppressed).toBe(true);
    expect(await rows(h.db, 'activities')).toBe(1);

    await h.restore();
    expect(await rows(h.db, 'dedupe_keys')).toBe(0);

    const third = await diaper(h);
    expect(third.committed).toBe(true);
    expect(third.suppressed).toBe(false);
    expect(await rows(h.db, 'activities')).toBe(1);
  });

  it('restore() empties the outbox and the mirror and puts the household back', async () => {
    const h = await setup();
    await diaper(h);
    expect(await rows(h.db, 'outbox')).toBeGreaterThan(0);

    await h.restore();

    expect(await rows(h.db, 'outbox')).toBe(0);
    expect(await rows(h.db, 'activities')).toBe(0);
    expect(await rows(h.db, 'diaper_details')).toBe(0);
    // A device with no household is not a restored device, it is a broken one: every scenario
    // that follows would fail on a foreign key rather than on what it was testing.
    expect(await rows(h.db, 'children')).toBe(2);
    expect(await rows(h.db, 'households')).toBe(1);
    expect(await rows(h.db, 'milk_containers')).toBe(1);
    expect(await rows(h.db, 'milk_inventory_transactions')).toBe(1);
  });

  it('clearLocalDb touches every table the schema has — nothing is left behind', async () => {
    const h = await setup();
    const present = await h.db.all<{ name: string }>(
      `select name from sqlite_master where type = 'table' and name not like 'sqlite_%' order by name`,
      [],
    );
    const cleared = [...MIRRORED_TABLES, ...LOCAL_ONLY_TABLES].sort();
    // Exact equality, not a subset: a table added in WP5 that nobody adds to the schema's own
    // lists would be a table `restore()` never empties, and this is the assertion that says so.
    expect(present.map(r => r.name).sort()).toEqual(cleared);

    await clearLocalDb(h.db);
    for (const table of cleared) expect(await rows(h.db, table)).toBe(0);
  });

  it('the server clock runs ahead of the device, so no op is rejected for a stale edit clock', async () => {
    const h = await setup();
    const before = h.server.iso();
    const after = h.server.iso();
    expect(Date.parse(after)).toBeGreaterThan(Date.parse(before));
    expect(Date.parse(before)).toBeGreaterThan(h.clock.now() - 1);
  });

  it('rng is seeded: the same seed gives the same sequence, and it is not Math.random', async () => {
    const a = await createSyncHarness({ scenario: 'rng-a', rngSeed: 7 });
    const b = await createSyncHarness({ scenario: 'rng-b', rngSeed: 7 });
    try {
      const seqA = [a.rng(), a.rng(), a.rng()];
      const seqB = [b.rng(), b.rng(), b.rng()];
      expect(seqA).toEqual(seqB);
      expect(new Set(seqA).size).toBe(3);
      for (const v of seqA) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of seqA) expect(v).toBeLessThan(1);
    } finally {
      a.dispose();
      b.dispose();
    }
  });

  it('uuid() is derived, stable and scoped to the scenario', async () => {
    const a = await createSyncHarness({ scenario: 'one' });
    const b = await createSyncHarness({ scenario: 'two' });
    try {
      expect(a.uuid('activity')).toBe(a.uuid('activity'));
      expect(a.uuid('activity')).not.toBe(b.uuid('activity'));
      expect(a.uuid('activity')).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      );
    } finally {
      a.dispose();
      b.dispose();
    }
  });
});
