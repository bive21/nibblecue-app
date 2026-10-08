/**
 * A MEAL'S FOODS, WRITTEN AND READ BACK THROUGH THE REAL LOCAL SCHEMA (docs/SOLIDS.md §3): the
 * list is stored as JSON text on the meal's own detail row, travels to the server as an array
 * inside the ordinary activity op, and every reader — the log's projection, the editor's record,
 * the meal history — hands back the same foods. An edit replaces the list whole.
 */
import { itemsOf, type SolidsItem } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { mealHistory } from '../db/queries/solids';
import { entryById, todayActivities } from '../db/queries/today';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { editActivity, logActivity } from './activities';

const TAP = '2026-09-14T12:10:00.000Z';
const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

const item = (name: string, over: Partial<SolidsItem> = {}): SolidsItem => ({
  name,
  amount: null,
  unit: null,
  response: null,
  ...over,
});
const LUNCH = [
  item('Strawberry', { amount: 5, unit: 'PIECE', response: 'LOVED' }),
  item('Banana', { amount: 0.5, unit: 'PIECE', response: 'DISLIKED' }),
];

const payloads = (db: Db) =>
  db.all<{ op: string; payload: string }>('select op, payload from outbox order by seq', []);

describe('a meal with its foods', () => {
  it('is stored on the detail row, sent as a list, and read back by every reader', async () => {
    const { db, clock } = await fixture();
    const out = await logActivity(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'solids',
      startAt: TAP,
      detail: {
        meal: 'LUNCH',
        food: 'Strawberry, Banana',
        items: LUNCH,
        observation: 'red patch by the mouth',
      },
    });
    expect(out.committed).toBe(true);
    const id = out.entityIds[0] ?? '';

    // the mirror holds JSON text, the wire carries a real array
    const stored = await db.get<{ items: string; food: string }>(
      'select items, food from solids_details where activity_id = ?',
      [id],
    );
    expect(typeof stored?.items).toBe('string');
    expect(JSON.parse(stored?.items ?? 'null')).toEqual(LUNCH);
    const [create] = await payloads(db);
    const detail = (JSON.parse(create?.payload ?? '{}') as { detail?: { items?: unknown } }).detail;
    expect(Array.isArray(detail?.items)).toBe(true);
    expect(detail?.items).toEqual(LUNCH);

    // the log's projection
    const rows = await todayActivities(db, HOUSEHOLD, CHILD_A, Date.parse(TAP) - 60_000);
    expect(rows.find(r => r.id === id)?.solidsItems).toEqual(LUNCH);
    // the editor's record
    const record = await entryById(db, id);
    expect(itemsOf({ items: record?.detail?.['items'], food: null })).toEqual(LUNCH);
    // the history the sheet suggests from
    const meals = await mealHistory(db, HOUSEHOLD);
    expect(meals).toHaveLength(1);
    expect(meals[0]?.items).toEqual(LUNCH);
    expect(meals[0]?.observation).toBe('red patch by the mouth');
  });

  it('an edit replaces the list whole, and the text beside it', async () => {
    const { db, clock } = await fixture();
    const out = await logActivity(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'solids',
      startAt: TAP,
      detail: { meal: 'LUNCH', food: 'Strawberry, Banana', items: LUNCH },
    });
    const id = out.entityIds[0] ?? '';
    const next = [item('Strawberry', { amount: 3, unit: 'PIECE', response: 'LIKED' })];
    const edit = await editActivity(db, clock, {
      ...ctx,
      activityId: id,
      childId: CHILD_A,
      type: 'solids',
      patch: {},
      detailPatch: { items: next, food: 'Strawberry' },
    });
    expect(edit.committed).toBe(true);
    const meals = await mealHistory(db, HOUSEHOLD);
    expect(meals[0]?.items).toEqual(next);
    const stored = await db.get<{ meal: string; food: string }>(
      'select meal, food from solids_details where activity_id = ?',
      [id],
    );
    // the fields the edit did not name are untouched
    expect(stored).toEqual({ meal: 'LUNCH', food: 'Strawberry' });
  });

  it('reads a meal logged before the list from its text, without rewriting it', async () => {
    const { db, clock } = await fixture();
    const out = await logActivity(db, clock, {
      ...ctx,
      childId: CHILD_A,
      type: 'solids',
      startAt: TAP,
      detail: { meal: 'DINNER', food: 'Sweet potato, pear', taken: 'MOST' },
    });
    const id = out.entityIds[0] ?? '';
    const meals = await mealHistory(db, HOUSEHOLD);
    expect(meals[0]?.items.map(i => i.name)).toEqual(['Sweet potato', 'pear']);
    const stored = await db.get<{ items: string | null; taken: string }>(
      'select items, taken from solids_details where activity_id = ?',
      [id],
    );
    expect(stored).toEqual({ items: null, taken: 'MOST' });
  });
});
