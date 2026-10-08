/**
 * The two shared lists' writes, end to end through `commitWrite` against the real local
 * schema — the test that was missing when WP6b and WP6c shipped. Both tables were absent from
 * `LOCAL_PRIMARY_KEY`, so `upsertRow` threw inside every list write's transaction and nothing
 * here would have passed; a chain that reaches the outbox is the assertion, not the chain.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { householdTasks, shoppingItems } from '../db/queries/lists';
import { HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import {
  addShoppingItem,
  finishTrip,
  patchShoppingItem,
  putBackTrip,
  putOnList,
  saveTask,
  setTaskDeleted,
  tickShoppingItem,
  tickTask,
} from './lists';
import { saveSupply } from './supplies';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };

const ops = (db: Db) =>
  db.all<{ entity: string; op: string }>('select entity, op from outbox order by seq', []);

describe('the shopping list writes (WP6b)', () => {
  it('adds a line the list shows at once, and queues exactly one op for it', async () => {
    const { db, clock } = await fixture();
    const r = await addShoppingItem(db, clock, { ...ctx, title: 'Diapers, size 2', qty: 2 });
    expect(r.committed).toBe(true);

    const rows = await shoppingItems(db, HOUSEHOLD);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: r.itemId,
      title: 'Diapers, size 2',
      qty: 2,
      checked_at: null,
      created_by: USER,
    });
    expect(await ops(db)).toEqual([{ entity: 'shopping_item', op: 'CREATE' }]);
  });

  /**
   * A ONE-OFF'S QUANTITY IS A REAL FIELD (the owner, 2026-10-03). Adding defaults to one; the
   * stepper on the row patches the same column a supply uses, so a partner phone and Share both
   * see how many without a second write path.
   */
  it('patches a one-off’s quantity the same way as a supply line', async () => {
    const { db, clock } = await fixture();
    const r = await addShoppingItem(db, clock, { ...ctx, title: 'Bananas' });
    expect((await shoppingItems(db, HOUSEHOLD))[0]?.qty).toBe(1);

    const patched = await patchShoppingItem(db, clock, { ...ctx, itemId: r.itemId, qty: 4 });
    expect(patched.committed).toBe(true);
    const row = (await shoppingItems(db, HOUSEHOLD)).find(x => x.id === r.itemId);
    expect(row).toMatchObject({ title: 'Bananas', qty: 4, supply_id: null });
    expect(await ops(db)).toEqual([
      { entity: 'shopping_item', op: 'CREATE' },
      { entity: 'shopping_item', op: 'UPDATE' },
    ]);
  });

  it('ticks a line into the basket, back out, and Clear retires only what is in it', async () => {
    const { db, clock } = await fixture();
    const a = await addShoppingItem(db, clock, { ...ctx, title: 'Wipes' });
    const b = await addShoppingItem(db, clock, { ...ctx, title: 'Formula' });

    await tickShoppingItem(db, clock, { ...ctx, itemId: a.itemId, checked: true });
    let rows = await shoppingItems(db, HOUSEHOLD);
    expect(rows.find(x => x.id === a.itemId)?.checked_at).toBe(clock.iso());
    expect(rows.find(x => x.id === b.itemId)?.checked_at).toBeNull();

    await tickShoppingItem(db, clock, { ...ctx, itemId: a.itemId, checked: false });
    rows = await shoppingItems(db, HOUSEHOLD);
    expect(rows.find(x => x.id === a.itemId)?.checked_at).toBeNull();

    await tickShoppingItem(db, clock, { ...ctx, itemId: b.itemId, checked: true });
    // Clear is `finishTrip` (the basket-only `clearBasket` it replaced went on 2026-09-26)
    const cleared = await finishTrip(db, clock, {
      ...ctx,
      today: '2026-09-16',
      dayOf: (ms: number) => new Date(ms).toISOString().slice(0, 10),
    });
    expect(cleared.committed).toBe(true);
    expect(cleared.trip.lineIds).toEqual([b.itemId]);
    // the cleared line is retired, never deleted: it is gone from the list and still a row
    expect((await shoppingItems(db, HOUSEHOLD)).map(x => x.id)).toEqual([a.itemId]);
    expect(await db.get('select deleted_at from shopping_items where id = ?', [b.itemId])).toEqual({
      deleted_at: clock.iso(),
    });
  });
});

/**
 * FINISHING A TRIP IS ONE WRITE (`finishTrip`; the owner's report of 2026-09-26 is the scenario in
 * `scenarios/shopping.scenario.test.ts`). The lines and the dates go in one intent, every op with
 * an id of its own, and one write puts them back.
 */
describe('finishing the trip', () => {
  const days = {
    today: '2026-09-16',
    dayOf: (ms: number) => new Date(ms).toISOString().slice(0, 10),
  };

  it('retires every bought line — the one-off too — and dates each bought supply, in one intent', async () => {
    const { db, clock } = await fixture();
    const item = await saveSupply(db, clock, {
      ...ctx,
      category: 'DIAPERS',
      brand: 'Pampers',
      product: null,
      variant: null,
      pack: null,
      store: null,
      notes: null,
      url: null,
    });
    const diapers = await addShoppingItem(db, clock, {
      ...ctx,
      title: 'Pampers',
      supplyId: item.supplyId,
    });
    const bananas = await addShoppingItem(db, clock, { ...ctx, title: 'Bananas' });
    const card = await addShoppingItem(db, clock, { ...ctx, title: 'Birthday card' });
    for (const id of [diapers.itemId, bananas.itemId]) {
      await tickShoppingItem(db, clock, { ...ctx, itemId: id, checked: true });
    }

    const r = await finishTrip(db, clock, { ...ctx, ...days });
    expect(r.committed).toBe(true);
    expect(r.trip).toEqual({
      lineIds: expect.arrayContaining([diapers.itemId, bananas.itemId]),
      was: [[item.supplyId, null]],
      left: 1,
    });
    // two lines and one date, and three op ids: none of them can be deduped away
    expect(new Set(r.opIds).size).toBe(3);
    expect((await shoppingItems(db, HOUSEHOLD)).map(x => x.id)).toEqual([card.itemId]);
    expect(
      await db.get('select last_bought_on from supply_items where id = ?', [item.supplyId]),
    ).toEqual({ last_bought_on: clock.iso().slice(0, 10) });

    // with a line still to buy, a new line finishes nothing
    const wipes = await putOnList(db, clock, { ...ctx, ...days, title: 'Wipes' });
    expect(wipes.finished).toBeNull();

    // and the Undo is one write: both lines back in the basket, the date back to none
    const undo = await putBackTrip(db, clock, { ...ctx, trip: r.trip });
    expect(undo.committed).toBe(true);
    const back = await shoppingItems(db, HOUSEHOLD);
    expect(
      back
        .filter(x => x.checked_at !== null)
        .map(x => x.id)
        .sort(),
    ).toEqual([diapers.itemId, bananas.itemId].sort());
    expect(
      await db.get('select last_bought_on from supply_items where id = ?', [item.supplyId]),
    ).toEqual({ last_bought_on: null });
  });

  it('finishes nothing when there is nothing in the basket', async () => {
    const { db, clock } = await fixture();
    await addShoppingItem(db, clock, { ...ctx, title: 'Wipes' });
    const r = await finishTrip(db, clock, { ...ctx, ...days });
    expect(r.committed).toBe(false);
    expect(r.trip).toEqual({ lineIds: [], was: [], left: 1 });
  });
});

describe('the checklist writes (WP6c)', () => {
  it('adds a chore, ticks it for the household day, and retires it', async () => {
    const { db, clock } = await fixture();
    const r = await saveTask(db, clock, {
      ...ctx,
      title: 'Wash bottles',
      atLocalTime: '21:00',
      repeat: 'DAILY',
      assignedTo: null,
    });
    expect(r.committed).toBe(true);

    let rows = await householdTasks(db, HOUSEHOLD);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: r.taskId,
      title: 'Wash bottles',
      repeat: 'DAILY',
      last_done_on: null,
    });
    expect(rows[0]?.at_local_time?.slice(0, 5)).toBe('21:00');

    await tickTask(db, clock, { ...ctx, taskId: r.taskId, today: '2026-09-14' });
    rows = await householdTasks(db, HOUSEHOLD);
    expect(rows[0]).toMatchObject({ last_done_on: '2026-09-14', last_done_by: USER });

    await tickTask(db, clock, { ...ctx, taskId: r.taskId, today: null });
    rows = await householdTasks(db, HOUSEHOLD);
    expect(rows[0]?.last_done_on).toBeNull();

    await setTaskDeleted(db, clock, { ...ctx, taskId: r.taskId, deleted: true });
    expect(await householdTasks(db, HOUSEHOLD)).toHaveLength(0);
    expect(await ops(db)).toEqual([
      { entity: 'task', op: 'CREATE' },
      { entity: 'task', op: 'UPDATE' },
      { entity: 'task', op: 'UPDATE' },
      { entity: 'task', op: 'UPDATE' },
    ]);
  });
});
