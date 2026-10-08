/**
 * SEARCH YOUR LOG, ON THE PHONE'S OWN DATABASE (the owner, 2026-09-24).
 *
 * The matching is core's and has its own suite; this holds the read it runs on: every live entry
 * in scope with the fields a word can find, a deleted entry never, another caregiver's private
 * pump never to the wrong reader, and the matches fetched back whole for the Log to draw.
 */
import { parseQuery, searchEntries, summarize, visibleTo } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../driver';
import { CHILD_A, CHILD_B, HOUSEHOLD, USER, seedHousehold } from '../../testing/fixtures';
import { searchableRows } from './search';
import { timelineRowsByIds } from './today';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const OTHER = 'bbbbbbbb-0000-4000-8000-000000000009';
const T0 = Date.parse('2026-09-20T12:00:00.000Z');
let seq = 0;

async function activity(
  db: Db,
  fields: {
    type: string;
    childId?: string | null;
    hoursAgo?: number;
    notes?: string | null;
    by?: string;
    isPrivate?: boolean;
    deleted?: boolean;
  },
): Promise<string> {
  seq += 1;
  const id = `44444444-0000-4000-8000-${String(seq).padStart(12, '0')}`;
  const at = new Date(T0 - (fields.hoursAgo ?? seq) * 3_600_000).toISOString();
  await db.run(
    `insert into activities
       (id, client_op_id, household_id, child_id, type, start_at, end_at, is_private, notes,
        created_by, created_at, updated_at, deleted_at)
     values (?, ?, ?, ?, ?, ?, null, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      id,
      HOUSEHOLD,
      fields.childId === undefined ? CHILD_A : fields.childId,
      fields.type,
      at,
      fields.isPrivate ? 1 : 0,
      fields.notes ?? null,
      fields.by ?? USER,
      at,
      at,
      fields.deleted ? at : null,
    ],
  );
  return id;
}

async function fixture(): Promise<Db> {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  await f.db.run(
    'insert into profiles (id, display_name, created_at, updated_at) values (?, ?, ?, ?)',
    [OTHER, 'Sam', new Date(T0).toISOString(), new Date(T0).toISOString()],
  );
  return f.db;
}

describe('the read a search runs on', () => {
  it('finds a food in a meal, a medicine by name, a poop, and a word from a note', async () => {
    const db = await fixture();
    const meal = await activity(db, { type: 'solids' });
    await db.run(
      `insert into solids_details (activity_id, meal, food, items) values (?, 'LUNCH', 'Banana, Oat cereal', ?)`,
      [
        meal,
        JSON.stringify([
          { name: 'Banana', amount: 2, unit: 'TBSP', response: 'LIKED' },
          { name: 'Oat cereal', amount: null, unit: null, response: null },
        ]),
      ],
    );
    const med = await activity(db, { type: 'med', by: OTHER });
    await db.run(
      `insert into med_details (activity_id, name, amount_text, route) values (?, 'Tylenol', '2.5 ml', 'ORAL')`,
      [med],
    );
    const dirty = await activity(db, { type: 'diaper' });
    await db.run(`insert into diaper_details (activity_id, kind, rash) values (?, 'DIRTY', 0)`, [
      dirty,
    ]);
    const wet = await activity(db, { type: 'diaper' });
    await db.run(`insert into diaper_details (activity_id, kind, rash) values (?, 'WET', 0)`, [
      wet,
    ]);
    const bath = await activity(db, { type: 'bath', notes: 'Fussy after the bath' });

    const rows = await searchableRows(db, { householdId: HOUSEHOLD, childId: null });
    const found = (q: string) => searchEntries(parseQuery(q)!, rows).map(h => h.entry.id);
    expect(found('banana')).toEqual([meal]);
    expect(found('tylenol')).toEqual([med]);
    expect(found('poop')).toEqual([dirty]);
    expect(found('fussy')).toEqual([bath]);

    // the medicine line names who gave it and the amount they typed, from the joined rows
    const s = summarize(searchEntries(parseQuery('tylenol')!, rows));
    expect(s).toMatchObject({
      kind: 'medicine',
      name: 'Tylenol',
      latestBy: 'Sam',
      latestAmount: '2.5 ml',
    });
  });

  it('leaves out a deleted entry, and scopes to the baby in view plus the household', async () => {
    const db = await fixture();
    const mine = await activity(db, { type: 'bath', notes: 'hair wash' });
    await activity(db, { type: 'bath', notes: 'hair wash', deleted: true });
    const twin = await activity(db, { type: 'bath', notes: 'hair wash', childId: CHILD_B });
    const pump = await activity(db, { type: 'pump', childId: null, notes: 'hair tie in the bag' });

    const ids = async (childId: string | null) =>
      searchEntries(
        parseQuery('hair')!,
        await searchableRows(db, { householdId: HOUSEHOLD, childId }),
      ).map(h => h.entry.id);
    expect((await ids(null)).sort()).toEqual([mine, twin, pump].sort());
    expect((await ids(CHILD_A)).sort()).toEqual([mine, pump].sort());
  });

  it('never finds another caregiver’s private pump for the wrong reader', async () => {
    const db = await fixture();
    const theirs = await activity(db, {
      type: 'pump',
      childId: null,
      isPrivate: true,
      by: OTHER,
      notes: 'left side sore',
    });
    const rows = await searchableRows(db, { householdId: HOUSEHOLD, childId: null });
    const q = parseQuery('sore')!;
    expect(searchEntries(q, visibleTo(rows, USER))).toEqual([]);
    expect(searchEntries(q, visibleTo(rows, OTHER)).map(h => h.entry.id)).toEqual([theirs]);
  });

  it('a narrowed read finds the same entries as reading the whole log', async () => {
    const db = await fixture();
    const meal = await activity(db, { type: 'solids', notes: 'egg on the tray' });
    await db.run(
      `insert into solids_details (activity_id, meal, food, items, observation) values (?, 'LUNCH', 'Strawberries', ?, 'liked it')`,
      [
        meal,
        JSON.stringify([{ name: 'Strawberries', amount: null, unit: null, response: 'LIKED' }]),
      ],
    );
    const med = await activity(db, { type: 'med', notes: 'Ácido fólico' });
    await db.run(
      `insert into med_details (activity_id, name, amount_text, route) values (?, 'Tylenol', '2.5 ml', 'ORAL')`,
      [med],
    );
    const dirty = await activity(db, { type: 'diaper' });
    await db.run(`insert into diaper_details (activity_id, kind, rash) values (?, 'DIRTY', 1)`, [
      dirty,
    ]);
    const wet = await activity(db, { type: 'diaper' });
    await db.run(`insert into diaper_details (activity_id, kind, rash) values (?, 'WET', 0)`, [
      wet,
    ]);
    const nap = await activity(db, { type: 'sleep', notes: 'banana on the sheet' });
    await db.run(`insert into sleep_details (activity_id, kind) values (?, 'NAP')`, [nap]);
    const night = await activity(db, { type: 'sleep' });
    await db.run(`insert into sleep_details (activity_id, kind) values (?, 'NIGHT')`, [night]);
    const formula = await activity(db, { type: 'bottle' });
    await db.run(
      `insert into bottle_details (activity_id, kind, consumed_ml) values (?, 'FORMULA', 90)`,
      [formula],
    );
    const water = await activity(db, { type: 'bottle' });
    await db.run(
      `insert into bottle_details (activity_id, kind, consumed_ml) values (?, 'WATER', 30)`,
      [water],
    );
    const breast = await activity(db, { type: 'breastfeed' });
    const bath = await activity(db, { type: 'bath', notes: 'napping soon' });
    const weight = await activity(db, { type: 'growth' });
    await db.run(`insert into measurement_details (activity_id, weight_g) values (?, 4000)`, [
      weight,
    ]);
    const eggs = await activity(db, { type: 'note', notes: 'egg' });

    const all = await searchableRows(db, { householdId: HOUSEHOLD, childId: null });
    const check = async (q: string) => {
      const parsed = parseQuery(q);
      expect(parsed, q).not.toBeNull();
      const narrowed = await searchableRows(db, {
        householdId: HOUSEHOLD,
        childId: null,
        query: parsed!,
      });
      const fullHits = searchEntries(parsed!, all).map(h => h.entry.id);
      const narrowHits = searchEntries(parsed!, narrowed).map(h => h.entry.id);
      expect(narrowHits, q).toEqual(fullHits);
      expect(narrowed.length, q).toBeLessThanOrEqual(all.length);
      return fullHits;
    };

    expect(await check('nap')).toEqual([nap, bath]);
    expect(await check('poop')).toEqual([dirty]);
    expect(await check('breast milk')).toEqual([]);
    expect(await check('eggs')).toEqual([meal, eggs]);
    expect(await check('berry')).toEqual([meal]);
    expect(await check('acido')).toEqual([med]);
    expect(await check('when did she last poop')).toEqual([dirty]);
    const feeds = await check('feed');
    expect(feeds).toContain(formula);
    expect(feeds).toContain(breast);
    expect(feeds).not.toContain(water);
    expect(await check('banana nap')).toEqual([nap]);
    expect(await check('weight')).toEqual([weight]);
    expect(await check('tylenol')).toEqual([med]);
    // a selective word must not drag the whole log back into memory
    const naps = await searchableRows(db, {
      householdId: HOUSEHOLD,
      childId: null,
      query: parseQuery('poop')!,
    });
    expect(naps.length).toBeLessThan(all.length);
  });

  it('fetches the matches back whole, in the order asked, for the Log to draw', async () => {
    const db = await fixture();
    const a = await activity(db, { type: 'bath', notes: 'one', hoursAgo: 1 });
    const b = await activity(db, { type: 'bath', notes: 'two', hoursAgo: 2 });
    const whole = await timelineRowsByIds(db, HOUSEHOLD, [b, a, 'missing-id']);
    expect(whole.map(r => r.id)).toEqual([b, a]);
    expect(whole[0]).toMatchObject({ type: 'bath', notes: 'two' });
  });
});
