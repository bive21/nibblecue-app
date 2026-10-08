/**
 * The free full download, end to end through the local mirror (PRODUCT_SPEC.md §8; CLAUDE.md §4).
 *
 * Two things matter and both are easy to lose quietly: the file is COMPLETE, and the file is
 * THIS HOUSEHOLD'S. The first is asserted against the schema's own table list rather than a
 * copy of it, so a table added next year fails this test until it is in the export. The second
 * matters because a device can hold more than one household's rows.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { MIRRORED_TABLES } from '../db/schema';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { logActivity } from './activities';
import { buildDownload } from './download';

const AT = '2026-09-14T20:00:00.000Z';
const GENERATED = '2026-09-16T04:00:00.000Z';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

const fixture = async () => {
  const f = await seedHousehold();
  restore = f.restoreIds;
  return f;
};

const build = (db: Parameters<typeof buildDownload>[0]) =>
  buildDownload(db, {
    householdId: HOUSEHOLD,
    timeZone: 'America/Los_Angeles',
    unit: 'oz',
    generatedAt: GENERATED,
  });

describe('the download is complete by construction', () => {
  it('carries every mirrored table, named exactly as the schema names it', async () => {
    const { db } = await fixture();
    const files = await build(db);
    const doc = JSON.parse(files.json) as { tables: Record<string, unknown[]> };
    expect(Object.keys(doc.tables).sort()).toEqual([...MIRRORED_TABLES].sort());
    expect(files.tables).toBe(MIRRORED_TABLES.length);
  });

  it('names itself, its version and the zone its instants are in', async () => {
    const { db } = await fixture();
    const doc = JSON.parse((await build(db)).json) as Record<string, unknown>;
    expect(doc['format']).toBe('cuddlecue-export');
    expect(doc['version']).toBe(1);
    expect(doc['householdId']).toBe(HOUSEHOLD);
    expect(doc['timeZone']).toBe('America/Los_Angeles');
    expect(doc['generatedAt']).toBe(GENERATED);
  });

  it('leaves out the sync machinery: it is the app’s bookkeeping, not the household’s record', async () => {
    const { db } = await fixture();
    const doc = JSON.parse((await build(db)).json) as { tables: Record<string, unknown[]> };
    for (const local of ['outbox', 'sync_state', 'dedupe_keys', 'snapshot_meta', 'ui_prefs']) {
      expect(Object.keys(doc.tables)).not.toContain(local);
    }
  });

  /**
   * A PERSON'S PICTURE IS IN THEIR DOWNLOAD, as the baby's is (migration 0148): the path of their
   * photo, or the id of the drawing they chose, and when it changed — never the image itself, which
   * the JSON has never carried for a child either (docs/MEDIA.md §4).
   */
  it('carries each person’s picture on their profile, as the children carry theirs', async () => {
    const { db } = await fixture();
    await db.run('update profiles set avatar_preset = ?, avatar_updated_at = ? where id = ?', [
      'long-waves',
      '2026-09-30T10:00:00.000Z',
      USER,
    ]);
    const doc = JSON.parse((await build(db)).json) as {
      tables: { profiles: Record<string, unknown>[]; children: Record<string, unknown>[] };
    };
    expect(doc.tables.profiles.find(p => p['id'] === USER)).toMatchObject({
      avatar_path: null,
      avatar_preset: 'long-waves',
      avatar_updated_at: '2026-09-30T10:00:00.000Z',
    });
    expect(Object.keys(doc.tables.children[0] ?? {})).toContain('photo_path');
  });

  it('names the file for the day a person will look for', async () => {
    const { db } = await fixture();
    const files = await build(db);
    expect(files.jsonName).toBe('cuddlecue-export-2026-09-16.json');
    expect(files.csvName).toBe('cuddlecue-export-2026-09-16.csv');
  });
});

describe('the download holds what was logged, in both formats', () => {
  const bottle = (db: Parameters<typeof buildDownload>[0], clock: never) =>
    logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'sheet' as const,
      childId: CHILD_A,
      type: 'bottle',
      startAt: AT,
      endAt: null,
      quantity: 118,
      canonicalUnit: 'ml',
      notes: 'with the blue lid, "the good one"',
      detail: { kind: 'FORMULA', consumed_ml: 118 },
    });

  it('puts the entry in the JSON and one row in the CSV, with both units', async () => {
    const { db, clock } = await fixture();
    await bottle(db, clock as never);
    const files = await build(db);

    const doc = JSON.parse(files.json) as { tables: Record<string, Record<string, unknown>[]> };
    expect(doc.tables['activities']).toHaveLength(1);
    expect(doc.tables['bottle_details']).toHaveLength(1);

    const lines = files.csv.trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(files.activities).toBe(1);
    // the stored millilitres AND the ounces the household typed, side by side (§8)
    expect(lines[1]).toContain('118');
    expect(lines[1]).toContain('oz');
    // the child's name, so the file reads without a second lookup
    expect(lines[1]).toContain('Emma');
    // a note with a comma and a quote does not break the grid
    expect(lines[1]).toContain('"with the blue lid, ""the good one"""');
  });

  /**
   * THE RASH TICK IS IN BOTH FILES. It is complete by construction here — `select *` per mirrored
   * table, and the CSV carries the whole detail row — but "it should already work" is exactly the
   * claim a field that nothing read for months invites (the owner, 2026-09-19), and the full
   * download is a legal duty rather than a convenience (CLAUDE.md §4). So it is asserted.
   */
  it('carries a diaper’s rash tick in the JSON and in the CSV detail', async () => {
    const { db, clock } = await fixture();
    await logActivity(db, clock, {
      householdId: HOUSEHOLD,
      createdBy: USER,
      deviceId: null,
      source: 'sheet' as const,
      childId: CHILD_A,
      type: 'diaper',
      startAt: AT,
      endAt: null,
      quantity: null,
      canonicalUnit: null,
      notes: null,
      detail: { kind: 'WET', color: null, consistency: null, rash: true },
    });
    const files = await build(db);

    const doc = JSON.parse(files.json) as { tables: Record<string, Record<string, unknown>[]> };
    const detail = doc.tables['diaper_details']?.[0];
    expect(detail?.['kind']).toBe('WET');
    expect(detail?.['rash']).toBe(1);

    // the whole detail row rides one CSV cell, RFC 4180 quoted — so the quotes are doubled
    const lines = files.csv.trim().split('\r\n');
    expect(lines[1]).toContain('""rash"":1');
  });

  it('has a header and no rows for a household that has logged nothing', async () => {
    const { db } = await fixture();
    const files = await build(db);
    expect(files.csv.trim().split('\r\n')).toHaveLength(1);
    expect(files.activities).toBe(0);
    // and the JSON still lists every table, empty: "nothing logged" is an answer
    const doc = JSON.parse(files.json) as { tables: Record<string, unknown[]> };
    expect(doc.tables['activities']).toEqual([]);
  });

  it('counts what it is handing over, so the sheet can say so before it is shared', async () => {
    const { db, clock } = await fixture();
    await bottle(db, clock as never);
    const files = await build(db);
    // the seed alone has a profile, a household, two children and a location
    expect(files.rows).toBeGreaterThan(4);
    expect(files.rows).toBe(
      Object.values(
        (JSON.parse(files.json) as { tables: Record<string, unknown[]> }).tables,
      ).reduce((sum, t) => sum + t.length, 0),
    );
  });
});

describe('it is this household’s data and nobody else’s', () => {
  it('scopes every table that carries a household id', async () => {
    const { db } = await fixture();
    const other = 'aaaaaaaa-0000-4000-8000-00000000ffff';
    await db.run(
      'insert into households (id, name, owner_id, home_time_zone, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      [other, 'Someone else', USER, 'UTC', AT, AT],
    );
    await db.run(
      'insert into children (id, household_id, name, birth_date, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      ['cccccccc-0000-4000-8000-00000000ffff', other, 'Not ours', '2026-01-01', AT, AT],
    );
    const doc = JSON.parse((await build(db)).json) as {
      tables: Record<string, Record<string, unknown>[]>;
    };
    const names = (doc.tables['children'] ?? []).map(c => c['name']);
    expect(names).toEqual(expect.arrayContaining(['Emma', 'Liam']));
    expect(names).not.toContain('Not ours');
  });
});
