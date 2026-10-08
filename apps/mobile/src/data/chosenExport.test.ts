/**
 * The chosen export, end to end through the local mirror (PRODUCT_SPEC.md §8; CLAUDE.md §4).
 *
 * `download.test.ts` beside this one proves the FREE download is complete. This one proves the
 * paid half is a NARROWING of exactly that file and nothing else: same reader, same tables, same
 * columns, fewer rows. The two assertions that matter most are the ones a refactor could break
 * without anybody noticing — that a detail row never outlives the entry it belongs to, and that
 * a period holding nothing comes out as a readable file with no entries rather than as an error.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ExportScope } from '@nibblecue/core';
import type { FakeClock } from '../testing/clock';
import { CHILD_A, CHILD_B, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { logActivity } from './activities';
import { buildDownload, buildFiles, readMirror } from './download';

const TZ = 'America/Los_Angeles';
const GENERATED = '2026-09-16T04:00:00.000Z';
/** Sep 14 and Sep 2, both local mornings in the fixture's zone. */
const IN_WINDOW = '2026-09-14T16:00:00.000Z';
const LONG_AGO = '2026-09-02T16:00:00.000Z';

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

/**
 * One bottle. The clock is ADVANCED between entries on purpose: the duplicate guard's window is
 * measured on the wall clock rather than on the entry's own time, so two writes at one instant
 * are one write — which is correct behavior and would silently halve this fixture.
 */
const bottle = (
  db: Parameters<typeof buildDownload>[0],
  clock: FakeClock,
  childId: string,
  startAt: string,
) => {
  clock.advance(60 * 60_000);
  return logActivity(db, clock, {
    householdId: HOUSEHOLD,
    createdBy: USER,
    deviceId: null,
    source: 'sheet' as const,
    childId,
    type: 'bottle',
    startAt,
    endAt: null,
    quantity: 118,
    canonicalUnit: 'ml',
    notes: null,
    detail: { kind: 'FORMULA', consumed_ml: 118 },
  });
};

/** Sep 10 – Sep 16 local, the week the fixture's entries sit in. */
const week = (childId: string | null): ExportScope => ({
  window: {
    fromMs: Date.parse('2026-09-10T07:00:00.000Z'),
    toMs: Date.parse('2026-09-17T07:00:00.000Z'),
  },
  childId,
  timeZone: TZ,
});

const build = async (
  db: Parameters<typeof buildDownload>[0],
  scope: ExportScope,
  parts: string[],
) =>
  buildFiles(await readMirror(db, HOUSEHOLD), {
    householdId: HOUSEHOLD,
    timeZone: TZ,
    unit: 'oz',
    generatedAt: GENERATED,
    scope,
    nameParts: parts,
  });

const tablesOf = (json: string) =>
  (JSON.parse(json) as { tables: Record<string, Record<string, unknown>[]> }).tables;

describe('a chosen range', () => {
  it('keeps the entries inside it and leaves the older ones in the free download', async () => {
    const { db, clock } = await fixture();
    await bottle(db, clock, CHILD_A, IN_WINDOW);
    await bottle(db, clock, CHILD_A, LONG_AGO);

    const whole = await buildDownload(db, {
      householdId: HOUSEHOLD,
      timeZone: TZ,
      unit: 'oz',
      generatedAt: GENERATED,
    });
    expect(whole.activities).toBe(2);

    const chosen = await build(db, week(null), ['7 days']);
    expect(chosen.activities).toBe(1);
    expect(tablesOf(chosen.json)['activities']).toHaveLength(1);
    // one header line and one entry
    expect(chosen.csv.trim().split('\r\n')).toHaveLength(2);
  });

  it('takes the detail row with its entry and never on its own', async () => {
    const { db, clock } = await fixture();
    await bottle(db, clock, CHILD_A, IN_WINDOW);
    await bottle(db, clock, CHILD_A, LONG_AGO);
    const tables = tablesOf((await build(db, week(null), ['7 days'])).json);
    expect(tables['bottle_details']).toHaveLength(1);
    expect(tables['bottle_details']?.[0]?.['activity_id']).toBe(tables['activities']?.[0]?.['id']);
  });

  it('still carries every mirrored table, so the file reads the same way the free one does', async () => {
    const { db } = await fixture();
    const chosen = await build(db, week(null), ['7 days']);
    const whole = await buildDownload(db, {
      householdId: HOUSEHOLD,
      timeZone: TZ,
      unit: 'oz',
      generatedAt: GENERATED,
    });
    expect(Object.keys(tablesOf(chosen.json)).sort()).toEqual(
      Object.keys(tablesOf(whole.json)).sort(),
    );
  });

  it('names the file for what was chosen', async () => {
    const { db } = await fixture();
    const chosen = await build(db, week(CHILD_A), ['7 days', 'Emma']);
    expect(chosen.jsonName).toBe('cuddlecue-export-2026-09-16-7-days-emma.json');
    expect(chosen.csvName).toBe('cuddlecue-export-2026-09-16-7-days-emma.csv');
  });
});

describe('one child, in a household with twins', () => {
  it('exports that child and not the sibling', async () => {
    const { db, clock } = await fixture();
    await bottle(db, clock, CHILD_A, IN_WINDOW);
    await bottle(db, clock, CHILD_B, IN_WINDOW);

    const chosen = await build(db, week(CHILD_A), ['7 days', 'Emma']);
    expect(chosen.activities).toBe(1);
    const tables = tablesOf(chosen.json);
    expect(tables['activities']?.[0]?.['child_id']).toBe(CHILD_A);
    expect(tables['children']?.map(c => c['id'])).toEqual([CHILD_A]);
    expect(chosen.csv).toContain('Emma');
    expect(chosen.csv).not.toContain('Liam');
  });

  it('leaves both babies in when neither was picked', async () => {
    const { db, clock } = await fixture();
    await bottle(db, clock, CHILD_A, IN_WINDOW);
    await bottle(db, clock, CHILD_B, IN_WINDOW);
    const chosen = await build(db, week(null), ['7 days']);
    expect(chosen.activities).toBe(2);
    expect(tablesOf(chosen.json)['children']).toHaveLength(2);
  });
});

describe('a period that holds nothing', () => {
  it('is a readable file with no entries, never an error and never a husk', async () => {
    const { db, clock } = await fixture();
    await bottle(db, clock, CHILD_A, IN_WINDOW);

    const empty: ExportScope = {
      window: {
        fromMs: Date.parse('2026-08-01T07:00:00.000Z'),
        toMs: Date.parse('2026-08-08T07:00:00.000Z'),
      },
      childId: CHILD_A,
      timeZone: TZ,
    };
    const chosen = await build(db, empty, ['7 days', 'Emma']);

    expect(chosen.activities).toBe(0);
    // the CSV is its header, which is what a spreadsheet needs to open at all
    expect(chosen.csv.trim().split('\r\n')).toHaveLength(1);
    const tables = tablesOf(chosen.json);
    expect(tables['activities']).toEqual([]);
    expect(tables['bottle_details']).toEqual([]);
    // and the household and the child are still named, so the file says whose empty period it is
    expect(tables['children']?.map(c => c['name'])).toEqual(['Emma']);
    expect(tables['households']).toHaveLength(1);
    expect(chosen.rows).toBeGreaterThan(0);
  });
});

describe('the free download is untouched by any of this', () => {
  it('has no scope, no narrowing and the same file names it always had', async () => {
    const { db, clock } = await fixture();
    await bottle(db, clock, CHILD_A, LONG_AGO);
    const files = await buildDownload(db, {
      householdId: HOUSEHOLD,
      timeZone: TZ,
      unit: 'oz',
      generatedAt: GENERATED,
    });
    // an entry outside every chosen window is still in the free copy, which is the whole point
    expect(files.activities).toBe(1);
    expect(files.jsonName).toBe('cuddlecue-export-2026-09-16.json');
    expect(files.csvName).toBe('cuddlecue-export-2026-09-16.csv');
  });
});
