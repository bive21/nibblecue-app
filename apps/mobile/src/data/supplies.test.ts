/**
 * The supply catalog's writes, end to end through `commitWrite` against the real local schema
 * (0017), and the one thing that makes the catalog worth keeping: a finished trip writes the
 * last-bought date against the ITEM, not against the line that left the list.
 */
import { supplyLabel } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { shoppingItems } from '../db/queries/lists';
import { supplyItems } from '../db/queries/supplies';
import { HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { addShoppingItem, removeShoppingItem } from './lists';
import { saveSupply, setSupplyDeleted } from './supplies';

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

const diapers = {
  ...ctx,
  category: 'DIAPERS',
  brand: 'Pampers',
  product: 'Swaddlers',
  variant: 'Size 3 (16–28 lb)',
  pack: '84-count box',
  store: 'Target',
  notes: 'The green pack, not the blue one.',
  url: 'https://example.test/p/1',
};

const ops = (db: Db) =>
  db.all<{ entity: string; op: string }>('select entity, op from outbox order by seq', []);

describe('the catalog', () => {
  it('saves an item with everything that identifies the box, and edits it in place', async () => {
    const { db, clock } = await fixture();
    const r = await saveSupply(db, clock, diapers);
    expect(r.committed).toBe(true);

    let rows = await supplyItems(db, HOUSEHOLD);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: r.supplyId,
      category: 'DIAPERS',
      brand: 'Pampers',
      product: 'Swaddlers',
      variant: 'Size 3 (16–28 lb)',
      pack: '84-count box',
      store: 'Target',
      url: 'https://example.test/p/1',
      last_bought_on: null,
      created_by: USER,
    });

    // the size moves as the baby grows: an edit, not a second item
    await saveSupply(db, clock, { ...diapers, supplyId: r.supplyId, variant: 'Size 4 (22–37 lb)' });
    rows = await supplyItems(db, HOUSEHOLD);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.variant).toBe('Size 4 (22–37 lb)');
    expect(await ops(db)).toEqual([
      { entity: 'supply_item', op: 'CREATE' },
      { entity: 'supply_item', op: 'UPDATE' },
    ]);
  });

  it('needs a brand or a product name, and says so rather than saving a nameless row', async () => {
    const { db, clock } = await fixture();
    await expect(saveSupply(db, clock, { ...diapers, brand: null, product: null })).rejects.toThrow(
      /brand or a product name/,
    );
    expect(await supplyItems(db, HOUSEHOLD)).toHaveLength(0);
  });

  it('retires an item with an undo, and the line already on the list stays readable', async () => {
    const { db, clock } = await fixture();
    const item = await saveSupply(db, clock, diapers);
    await addShoppingItem(db, clock, {
      ...ctx,
      title: supplyLabel({ brand: 'Pampers', product: 'Swaddlers' }),
      supplyId: item.supplyId,
    });

    await setSupplyDeleted(db, clock, { ...ctx, supplyId: item.supplyId, deleted: true });
    expect(await supplyItems(db, HOUSEHOLD)).toHaveLength(0);

    // the line keeps its own title, so a shop still reads correctly; the joined detail is gone
    const lines = await shoppingItems(db, HOUSEHOLD);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ title: 'Pampers Swaddlers', supply_variant: null });

    await setSupplyDeleted(db, clock, { ...ctx, supplyId: item.supplyId, deleted: false });
    expect(await supplyItems(db, HOUSEHOLD)).toHaveLength(1);
    // and the detail comes back with it
    expect((await shoppingItems(db, HOUSEHOLD))[0]?.supply_variant).toBe('Size 3 (16–28 lb)');
  });
});

describe('a line that points at an item', () => {
  it('reads the size, the pack, the shop and the link live from the catalog', async () => {
    const { db, clock } = await fixture();
    const item = await saveSupply(db, clock, diapers);
    await addShoppingItem(db, clock, {
      ...ctx,
      title: 'Pampers Swaddlers',
      supplyId: item.supplyId,
    });

    let line = (await shoppingItems(db, HOUSEHOLD))[0];
    expect(line).toMatchObject({
      supply_id: item.supplyId,
      supply_variant: 'Size 3 (16–28 lb)',
      supply_pack: '84-count box',
      supply_store: 'Target',
      supply_url: 'https://example.test/p/1',
    });

    // correcting the item fixes every line at once — the whole reason they are two things
    await saveSupply(db, clock, { ...diapers, supplyId: item.supplyId, store: 'Costco' });
    line = (await shoppingItems(db, HOUSEHOLD))[0];
    expect(line?.supply_store).toBe('Costco');
  });
});

describe('taking a line off the list', () => {
  it('leaves the catalog item alone — the list is one trip, the catalog is standing', async () => {
    const { db, clock } = await fixture();
    const item = await saveSupply(db, clock, diapers);
    const line = await addShoppingItem(db, clock, {
      ...ctx,
      title: 'Pampers Swaddlers',
      supplyId: item.supplyId,
    });
    await removeShoppingItem(db, clock, { ...ctx, itemId: line.itemId });

    expect(await shoppingItems(db, HOUSEHOLD)).toHaveLength(0);
    expect(await supplyItems(db, HOUSEHOLD)).toHaveLength(1);
  });
});
