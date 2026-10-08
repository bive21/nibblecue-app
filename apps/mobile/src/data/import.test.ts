/**
 * RUNNING AN IMPORT AGAINST A REAL LOCAL DATABASE.
 *
 * The first test is the one this file exists for. `logActivity`'s double-tap guard is keyed on
 * (type, child, salient) and measured against the WRITE clock — it swallows a parent tapping WET
 * twice in 200 ms. An import writes hundreds of rows inside one second, so two 4 oz bottles from
 * different DAYS look exactly like one bottle tapped twice, and without `dedupeWindowMs: 0` the
 * second would be suppressed SILENTLY. That is a lost log (CLAUDE.md §7), and it is the kind of bug
 * that shows up as "the import only brought half my history" months later.
 */
import { describe, expect, it, afterEach } from 'vitest';
import {
  DEFAULT_DAY_WINDOW,
  newDrafts,
  parseDelimited,
  readHuckleberry,
  type ImportDraft,
} from '@nibblecue/core';
import { CHILD_A, CHILD_B, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import type { Db } from '../db/driver';
import { timelineRows } from '../db/queries/today';
import { logActivity } from './activities';
import { existingEntries, importChildId, runImport, withSleepKind } from './import';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture(): Promise<Db> {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f.db;
}

/**
 * ONE INSTANT FOR THE WHOLE IMPORT, which is what a real device gives it: hundreds of rows written
 * inside the same millisecond. That is exactly the condition the double-tap guard was built for and
 * exactly why it has to be off here, so the fake clock must NOT tick.
 */
const FROZEN = Date.parse('2026-09-23T12:00:00Z');
const clock = { now: () => FROZEN, iso: (at = FROZEN) => new Date(at).toISOString() };

const ctx = {
  householdId: HOUSEHOLD,
  createdBy: USER,
  deviceId: 'dev-1',
  source: 'import' as const,
  childId: CHILD_A,
  day: { timeZone: 'UTC', window: DEFAULT_DAY_WINDOW },
};

const draft = (over: Partial<ImportDraft>): ImportDraft => ({
  type: 'bottle',
  startMs: Date.parse('2026-09-20T08:00:00Z'),
  endMs: null,
  quantity: 118,
  canonicalUnit: 'ml',
  detail: { consumed_ml: 118 },
  notes: null,
  childName: null,
  line: 2,
  ...over,
});

describe('an import writes every row it was given', () => {
  /** THE ONE. Two identical feeds on different days are two feeds, not one tapped twice. */
  it('does not let the double-tap guard swallow two same-sized feeds from different days', async () => {
    const db = await fixture();
    const outcome = await runImport(db, clock, {
      ...ctx,
      drafts: [
        draft({ startMs: Date.parse('2026-09-18T08:00:00Z'), line: 2 }),
        draft({ startMs: Date.parse('2026-09-19T08:00:00Z'), line: 3 }),
        draft({ startMs: Date.parse('2026-09-20T08:00:00Z'), line: 4 }),
      ],
    });
    expect(outcome.written).toBe(3);
    expect(outcome.failed).toEqual([]);
    const rows = await timelineRows(db, {
      householdId: HOUSEHOLD,
      childId: CHILD_A,
      filter: 'bottle',
      limit: 50,
    });
    expect(rows).toHaveLength(3);
  });

  it('writes an imported row as an ordinary entry: canonical units, times, notes', async () => {
    const db = await fixture();
    await runImport(db, clock, {
      ...ctx,
      drafts: [
        draft({
          type: 'sleep',
          startMs: Date.parse('2026-09-20T13:00:00Z'),
          endMs: Date.parse('2026-09-20T14:30:00Z'),
          quantity: null,
          canonicalUnit: null,
          // sleep_details' columns are all nullable, so the plan gives it an empty detail
          detail: {},
          notes: 'in the carrier',
        }),
      ],
    });
    const [row] = await timelineRows(db, {
      householdId: HOUSEHOLD,
      childId: CHILD_A,
      filter: 'sleep',
      limit: 5,
    });
    expect(row).toMatchObject({
      type: 'sleep',
      startMs: Date.parse('2026-09-20T13:00:00Z'),
      endMs: Date.parse('2026-09-20T14:30:00Z'),
      notes: 'in the carrier',
    });
  });

  it('reports progress as it goes, so a long import is not a frozen screen', async () => {
    const db = await fixture();
    const seen: number[] = [];
    await runImport(db, clock, {
      ...ctx,
      drafts: [1, 2, 3, 4].map(i =>
        draft({ startMs: Date.parse('2026-09-20T08:00:00Z') + i * 3_600_000, line: i + 1 }),
      ),
      onProgress: done => seen.push(done),
    });
    expect(seen).toEqual([1, 2, 3, 4]);
  });

  it('keeps going past a row that will not write, and names the line that failed', async () => {
    const db = await fixture();
    const outcome = await runImport(db, clock, {
      ...ctx,
      drafts: [
        draft({ startMs: Date.parse('2026-09-19T08:00:00Z'), line: 2 }),
        // a type the local schema has no table for cannot be written; the rest still must be
        draft({ type: 'nonsense' as ImportDraft['type'], line: 3 }),
        draft({ startMs: Date.parse('2026-09-21T08:00:00Z'), line: 4 }),
      ],
    });
    expect(outcome.written).toBe(2);
    expect(outcome.failed.map(f => f.line)).toEqual([3]);
  });

  it('nothing is written for an empty plan, and nothing throws', async () => {
    const db = await fixture();
    expect(await runImport(db, clock, { ...ctx, drafts: [] })).toEqual({
      written: 0,
      failed: [],
    });
  });
});

describe('existingEntries — so the same file can be run twice', () => {
  it('finds what the household already holds: each entry’s kind and start', async () => {
    const db = await fixture();
    const mine = draft({ startMs: Date.parse('2026-09-20T08:00:00Z') });
    await runImport(db, clock, { ...ctx, drafts: [mine] });
    const held = await existingEntries(db, {
      householdId: HOUSEHOLD,
      childId: CHILD_A,
      fromMs: Date.parse('2026-09-19T00:00:00Z'),
      toMs: Date.parse('2026-09-21T00:00:00Z'),
    });
    expect(held).toEqual([{ type: 'bottle', startMs: mine.startMs }]);
    expect(newDrafts([mine], held)).toEqual([]);
  });

  it('reads only the span the file covers, because a household has years of rows', async () => {
    const db = await fixture();
    await runImport(db, clock, {
      ...ctx,
      drafts: [draft({ startMs: Date.parse('2026-01-05T08:00:00Z') })],
    });
    const held = await existingEntries(db, {
      householdId: HOUSEHOLD,
      childId: CHILD_A,
      fromMs: Date.parse('2026-09-01T00:00:00Z'),
      toMs: Date.parse('2026-09-30T00:00:00Z'),
    });
    expect(held).toEqual([]);
  });

  it('reads a little past the span, so an entry a minute before the first row is seen', async () => {
    const db = await fixture();
    const first = Date.parse('2026-09-20T08:00:00Z');
    await runImport(db, clock, { ...ctx, drafts: [draft({ startMs: first - 70_000 })] });
    const held = await existingEntries(db, {
      householdId: HOUSEHOLD,
      childId: CHILD_A,
      fromMs: first,
      toMs: first,
    });
    expect(held).toHaveLength(1);
  });

  /**
   * A DELETED ROW STILL COUNTS. A parent who imported, looked, decided the rows were wrong and
   * deleted them has said no — re-running the same file must not bring them back through the side
   * door. Undo is for a mistake seconds old, not for a decision.
   */
  it('counts a row the parent deleted, so a re-run does not resurrect it', async () => {
    const db = await fixture();
    const mine = draft({ startMs: Date.parse('2026-09-20T08:00:00Z') });
    await runImport(db, clock, { ...ctx, drafts: [mine] });
    await db.run(`update activities set deleted_at = ? where type = 'bottle'`, [
      '2026-09-23T12:00:00.000Z',
    ]);
    const held = await existingEntries(db, {
      householdId: HOUSEHOLD,
      childId: CHILD_A,
      fromMs: Date.parse('2026-09-19T00:00:00Z'),
      toMs: Date.parse('2026-09-21T00:00:00Z'),
    });
    expect(newDrafts([mine], held)).toEqual([]);
  });

  it('does not see another baby’s rows when a child was chosen', async () => {
    const db = await fixture();
    await runImport(db, clock, {
      ...ctx,
      childId: CHILD_B,
      drafts: [draft({ startMs: Date.parse('2026-09-20T08:00:00Z') })],
    });
    const held = await existingEntries(db, {
      householdId: HOUSEHOLD,
      childId: CHILD_A,
      fromMs: Date.parse('2026-09-19T00:00:00Z'),
      toMs: Date.parse('2026-09-21T00:00:00Z'),
    });
    expect(held).toEqual([]);
  });
});

/**
 * A PUMP IS THE PARENT'S, NOT A BABY'S (`householdScoped`), as the pump sheet saves it: an imported
 * session is written with no baby, so both twins' views have it and a second twin's file bringing
 * the same session does not write it again.
 */
describe('an imported pump belongs to the household', () => {
  const pump = (startMs: number): ImportDraft =>
    draft({ type: 'pump', startMs, quantity: 120, detail: { total_ml: 120 } });

  it('is written with no baby, while a feed is written for the baby it was imported for', async () => {
    expect(importChildId('pump', CHILD_A)).toBeNull();
    expect(importChildId('bottle', CHILD_A)).toBe(CHILD_A);
    const db = await fixture();
    await runImport(db, clock, {
      ...ctx,
      drafts: [pump(Date.parse('2026-09-20T07:00:00Z')), draft({})],
    });
    const rows = await db.all<{ type: string; child_id: string | null }>(
      'select type, child_id from activities order by type',
    );
    expect(rows).toEqual([
      { type: 'bottle', child_id: CHILD_A },
      { type: 'pump', child_id: null },
    ]);
  });

  it('is found again from the other twin’s file, and not written twice', async () => {
    const db = await fixture();
    const session = pump(Date.parse('2026-09-20T07:00:00Z'));
    await runImport(db, clock, { ...ctx, drafts: [session] });
    const held = await existingEntries(db, {
      householdId: HOUSEHOLD,
      childId: CHILD_B,
      fromMs: session.startMs,
      toMs: session.startMs,
    });
    expect(newDrafts([session], held)).toEqual([]);
  });
});

/**
 * A HUCKLEBERRY EXPORT, WRITTEN AND READ BACK (core's `import/huckleberry.ts`). The file is
 * synthetic, in the export's own header, quoting and value shapes; the owner's real one stays out
 * of the repository. What is proved here, against a real local database, is the part core cannot:
 * that what the first import wrote is found by the second, and that feeds the parent also logged
 * here, with the seconds a tap gives them, are not written a second time.
 */
describe('a Huckleberry export, imported over a household that logged in both apps', () => {
  const file = [
    '"Type","Start","End","Duration","Start Condition","Start Location","End Condition","Notes","Logged By"',
    '"Feed","2026-09-18 06:40",,,"Breast Milk","Bottle","6oz",,',
    '"Feed","2026-09-18 09:15",,,"Formula","Bottle","95ml","took it slowly",',
    '"Feed","2026-09-18 14:20","2026-09-18 14:48","00:28","00:16R","Breast","00:12L",,',
    '"Feed","2026-09-18 19:55",,,,"Breast",,,',
    '"Pump","2026-09-18 07:10",,,"5oz",,,,',
    '"Pump","2026-09-18 13:00","2026-09-18 13:25","00:25","85ml",,,,',
    '"Sleep","2026-09-18 10:30","2026-09-18 11:45","01:15",,,,,',
    '"Sleep","2026-09-18 20:10","2026-09-19 05:50","09:39",,,,,',
    '"Diaper","2026-09-18 08:00",,,,,,,',
  ].join('\n');
  const wall = (s: string): number => Date.parse(`${s.replace(' ', 'T')}:00`);
  const planOf = () =>
    readHuckleberry(parseDelimited(file), { nowMs: FROZEN, assumeVolumeUnit: 'oz' });
  /** What the import screen does between reading the plan and writing it. */
  const toAdd = async (db: Db) => {
    const plan = planOf();
    if (plan.firstMs === null || plan.lastMs === null) throw new Error('an empty plan');
    const held = await existingEntries(db, {
      householdId: HOUSEHOLD,
      childId: CHILD_A,
      fromMs: plan.firstMs,
      toMs: plan.lastMs,
    });
    return newDrafts(plan.drafts, held);
  };

  it('writes every kind it reads, and the same file a second time adds nothing', async () => {
    const db = await fixture();
    const plan = planOf();
    expect(plan.byType).toEqual({ bottle: 2, breastfeed: 2, pump: 2, sleep: 2 });
    expect(plan.bySkip).toEqual({ notReadYet: 1 });
    const first = await runImport(db, clock, { ...ctx, drafts: await toAdd(db) });
    expect(first).toEqual({ written: 8, failed: [] });

    // what was written reads back as it was in the file
    const feed = await db.get<{ first_side: string | null; left: number; right: number }>(
      `select first_side, left_seconds as left, right_seconds as right from breastfeed_details d
         join activities a on a.id = d.activity_id where a.start_at = ?`,
      [new Date(wall('2026-09-18 14:20')).toISOString()],
    );
    expect(feed).toEqual({ first_side: null, left: 12 * 60, right: 16 * 60 });
    // a breastfeed with only its start is 30 minutes long, with no side (the owner, 2026-09-28)
    const startOnly = await db.get<{ end_at: string; first_side: string | null; sides: number }>(
      `select a.end_at as end_at, d.first_side as first_side, d.left_seconds + d.right_seconds as sides
         from activities a join breastfeed_details d on d.activity_id = a.id where a.start_at = ?`,
      [new Date(wall('2026-09-18 19:55')).toISOString()],
    );
    expect(startOnly).toEqual({
      end_at: new Date(wall('2026-09-18 20:25')).toISOString(),
      first_side: null,
      sides: 0,
    });
    const night = await db.get<{ end_at: string; kind: string }>(
      `select a.end_at as end_at, s.kind as kind from activities a
         join sleep_details s on s.activity_id = a.id where a.start_at = ?`,
      [new Date(wall('2026-09-18 20:10')).toISOString()],
    );
    expect(night).toEqual({
      end_at: new Date(wall('2026-09-19 05:50')).toISOString(),
      kind: expect.stringMatching(/^(NAP|NIGHT)$/),
    });

    // THE SAME FILE AGAIN
    expect(await toAdd(db)).toEqual([]);
    const second = await runImport(db, clock, { ...ctx, drafts: await toAdd(db) });
    expect(second).toEqual({ written: 0, failed: [] });
    const count = await db.get<{ n: number }>('select count(*) as n from activities');
    expect(count?.n).toBe(8);
  });

  it('does not double a feed, a pump or a sleep the parent also logged here', async () => {
    const db = await fixture();
    const logged = async (type: 'bottle' | 'pump' | 'sleep', atMs: number, endMs?: number) => {
      await logActivity(db, clock, {
        householdId: HOUSEHOLD,
        createdBy: USER,
        deviceId: 'dev-1',
        source: 'sheet',
        childId: type === 'pump' ? null : CHILD_A,
        type,
        startAt: new Date(atMs).toISOString(),
        endAt: endMs === undefined ? null : new Date(endMs).toISOString(),
        ...(type === 'sleep'
          ? { detail: { kind: 'NAP' } }
          : {
              quantity: 90,
              canonicalUnit: 'ml' as const,
              detail: type === 'pump' ? { total_ml: 90 } : { kind: 'EBM', consumed_ml: 90 },
            }),
        dedupeWindowMs: 0,
      });
    };
    // the same bottle, tapped here 32 seconds into the minute the other app wrote down
    await logged('bottle', wall('2026-09-18 06:40') + 32_000);
    // the same pump, saved here a moment later, just past the turn of the minute
    await logged('pump', wall('2026-09-18 07:11') + 4_000);
    // the same nap, timed here
    await logged('sleep', wall('2026-09-18 10:30') + 12_000, wall('2026-09-18 11:44') + 50_000);
    // and one bottle only this app has, which stays whatever the file holds
    await logged('bottle', wall('2026-09-18 16:00'));

    const adding = await toAdd(db);
    expect(adding).toHaveLength(8 - 3);
    const outcome = await runImport(db, clock, { ...ctx, drafts: adding });
    expect(outcome).toEqual({ written: 5, failed: [] });
    const byType = await db.all<{ type: string; n: number }>(
      'select type, count(*) as n from activities group by type order by type',
    );
    expect(byType).toEqual([
      { type: 'bottle', n: 3 },
      { type: 'breastfeed', n: 2 },
      { type: 'pump', n: 2 },
      { type: 'sleep', n: 2 },
    ]);
    // and the file a second time still adds nothing
    expect(await toAdd(db)).toEqual([]);
  });
});

describe('an imported sleep is a nap or a night by when it started', () => {
  const day = { timeZone: 'America/Los_Angeles', window: { wake: '06:30', bed: '19:00' } };
  const sleep = (startIso: string, detail: Record<string, unknown> | null = {}) =>
    draft({
      type: 'sleep',
      startMs: Date.parse(startIso),
      quantity: null,
      canonicalUnit: null,
      detail,
    });

  it('files it by the household’s window when the file does not say', () => {
    // 8:00 PM and 1:10 PM in Los Angeles
    expect(withSleepKind(sleep('2026-09-15T03:00:00Z'), day)).toEqual({ kind: 'NIGHT' });
    expect(withSleepKind(sleep('2026-09-15T20:10:00Z'), day)).toEqual({ kind: 'NAP' });
    // a detail with nothing in it is the importer's usual one
    expect(withSleepKind(sleep('2026-09-15T20:10:00Z', null), day)).toEqual({ kind: 'NAP' });
  });

  it('keeps the kind this app’s own download carries, and the rest of the detail with it', () => {
    expect(
      withSleepKind(sleep('2026-09-15T03:00:00Z', { kind: 'NAP', wake_count: 2 }), day),
    ).toEqual({ kind: 'NAP', wake_count: 2 });
  });

  it('leaves every other type as the plan made it', () => {
    const bottle = draft({});
    expect(withSleepKind(bottle, day)).toBe(bottle.detail);
  });
});
