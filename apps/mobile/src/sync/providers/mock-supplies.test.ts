/**
 * The supply catalog against the in-memory server (0017): who may write, what an UPDATE
 * touches, and the two rules that make the catalog a catalog rather than a second list.
 *
 * THE BOUNDARY IS `can_write`, like the list it feeds and unlike every entity with a medical
 * edge. A caregiver standing in the aisle has to be able to correct the size on the diapers,
 * and a catalog only the owner may fix is one the other parent cannot use.
 */
import type { PushOp } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { MockSyncApi, MockSyncServer } from './mock';

const HH = 'aaaaaaaa-0000-4000-8000-000000000001';
const OWNER = 'bbbbbbbb-0000-4000-8000-000000000001';
const CAREGIVER = 'bbbbbbbb-0000-4000-8000-000000000002';
const OUTSIDER = 'bbbbbbbb-0000-4000-8000-000000000009';
const ITEM = 'dddddddd-0000-4000-8000-00000000000a';
const AT = '2026-09-15T10:00:00.000Z';

let n = 0;
const opId = (): string => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function server() {
  const s = new MockSyncServer({ now: () => Date.parse('2026-09-15T10:00:05.000Z') });
  s.addMember({ household_id: HH, user_id: OWNER, role: 'OWNER' });
  s.addMember({ household_id: HH, user_id: CAREGIVER, role: 'CAREGIVER' });
  return s;
}

const op = (kind: PushOp['op'], payload: Record<string, unknown>): PushOp => ({
  client_op_id: opId(),
  entity: 'supply_item',
  op: kind,
  entity_id: ITEM,
  household_id: HH,
  payload: { client_edited_at: AT, ...payload },
});

const DIAPERS = {
  category: 'DIAPERS',
  brand: 'Pampers',
  product: 'Swaddlers',
  variant: 'Size 3 (16–28 lb)',
  pack: '84-count box',
  store: 'Target',
  notes: 'The green pack, not the blue one.',
  url: 'https://example.test/p/1',
};

describe('the supply catalog on the fake server', () => {
  it('a CAREGIVER may add and correct an item; an outsider gets nowhere', async () => {
    const s = server();
    const carer = new MockSyncApi(s, CAREGIVER);
    expect((await carer.push([op('CREATE', DIAPERS)])).results[0]).toMatchObject({
      status: 'applied',
      entity_id: ITEM,
    });
    expect(s.supply_items[0]).toMatchObject({ brand: 'Pampers', variant: 'Size 3 (16–28 lb)' });

    const out = new MockSyncApi(s, OUTSIDER);
    expect((await out.push([op('UPDATE', { variant: 'Size 6' })])).results[0]).toMatchObject({
      status: 'rejected',
      error: { code: 'FORBIDDEN' },
    });
  });

  it('an UPDATE touches only the columns it names, and a replay is a duplicate', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    const create = op('CREATE', DIAPERS);
    await owner.push([create]);
    expect((await owner.push([create])).results[0]).toMatchObject({ status: 'duplicate' });

    await owner.push([op('UPDATE', { variant: 'Size 4 (22–37 lb)' })]);
    expect(s.supply_items[0]).toMatchObject({
      variant: 'Size 4 (22–37 lb)',
      // everything the op did not name is untouched
      brand: 'Pampers',
      pack: '84-count box',
      notes: 'The green pack, not the blue one.',
    });
  });

  it('refuses a nameless item, on create and on a rename', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    expect(
      (await owner.push([op('CREATE', { ...DIAPERS, brand: null, product: null })])).results[0],
    ).toMatchObject({ status: 'rejected' });
    expect(s.supply_items).toHaveLength(0);

    await owner.push([op('CREATE', DIAPERS)]);
    expect(
      (await owner.push([op('UPDATE', { brand: null, product: null })])).results[0],
    ).toMatchObject({ status: 'rejected' });
    // and the row it refused to blank is exactly as it was
    expect(s.supply_items[0]).toMatchObject({ brand: 'Pampers', product: 'Swaddlers' });
  });

  it('records the last-bought DAY from the client, because only the device knows the zone', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([op('CREATE', DIAPERS)]);
    await owner.push([op('UPDATE', { last_bought_on: '2026-09-15' })]);
    expect(s.supply_items[0]?.['last_bought_on']).toBe('2026-09-15');
    // and an undo puts the previous one back rather than clearing it
    await owner.push([op('UPDATE', { last_bought_on: '2026-09-01' })]);
    expect(s.supply_items[0]?.['last_bought_on']).toBe('2026-09-01');
  });

  it('is retired with deleted_at, never deleted: a line may still point at it', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([op('CREATE', DIAPERS)]);
    expect((await owner.push([op('DELETE', {})])).results[0]).toMatchObject({ status: 'rejected' });
    expect(s.supply_items).toHaveLength(1);

    await owner.push([op('UPDATE', { deleted_at: AT })]);
    expect(s.supply_items[0]?.['deleted_at']).toBe(AT);
  });

  it('carries a line’s supply_id through a create and an update', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    const line = 'dddddddd-0000-4000-8000-00000000000b';
    await owner.push([
      {
        client_op_id: opId(),
        entity: 'shopping_item',
        op: 'CREATE',
        entity_id: line,
        household_id: HH,
        payload: { client_edited_at: AT, title: 'Pampers Swaddlers', supply_id: ITEM },
      },
    ]);
    expect(s.shopping_items[0]).toMatchObject({ supply_id: ITEM });
    await owner.push([
      {
        client_op_id: opId(),
        entity: 'shopping_item',
        op: 'UPDATE',
        entity_id: line,
        household_id: HH,
        payload: { client_edited_at: AT, supply_id: null },
      },
    ]);
    expect(s.shopping_items[0]?.['supply_id']).toBeNull();
  });
});
