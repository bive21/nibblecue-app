/**
 * The two shared lists against the in-memory server (0016): who may write, what an UPDATE
 * touches, and the two columns the server owns rather than the client.
 *
 * THE BOUNDARY IS THE POINT OF THE FEATURE. Every other household entity with a medical edge
 * is `can_admin`; these are `can_write`, so a CAREGIVER can add to the list and tick it off.
 * A list only one adult can use at the shop is not a shared list, and the first assertion here
 * is the one that would fail if somebody "tightened" it later.
 */
import type { PushOp } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { MockSyncApi, MockSyncServer } from './mock';

const HH = 'aaaaaaaa-0000-4000-8000-000000000001';
const OWNER = 'bbbbbbbb-0000-4000-8000-000000000001';
const CAREGIVER = 'bbbbbbbb-0000-4000-8000-000000000002';
const OUTSIDER = 'bbbbbbbb-0000-4000-8000-000000000009';
const ITEM = 'dddddddd-0000-4000-8000-000000000001';
const TASK = 'dddddddd-0000-4000-8000-000000000002';
const AT = '2026-09-15T10:00:00.000Z';

let n = 0;
const opId = (): string => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function server() {
  const s = new MockSyncServer({ now: () => Date.parse('2026-09-15T10:00:05.000Z') });
  s.addMember({ household_id: HH, user_id: OWNER, role: 'OWNER' });
  s.addMember({ household_id: HH, user_id: CAREGIVER, role: 'CAREGIVER' });
  return s;
}

const create = (
  entity: 'shopping_item' | 'task',
  entityId: string,
  payload: Record<string, unknown>,
): PushOp => ({
  client_op_id: opId(),
  entity,
  op: 'CREATE',
  entity_id: entityId,
  household_id: HH,
  payload: { client_edited_at: AT, ...payload },
});

const update = (
  entity: 'shopping_item' | 'task',
  entityId: string,
  payload: Record<string, unknown>,
): PushOp => ({
  client_op_id: opId(),
  entity,
  op: 'UPDATE',
  entity_id: entityId,
  household_id: HH,
  payload: { client_edited_at: AT, ...payload },
});

describe('the shopping list on the fake server', () => {
  it('a CAREGIVER may add and tick — that is the whole point of a shared list', async () => {
    const s = server();
    const carer = new MockSyncApi(s, CAREGIVER);
    expect(
      (await carer.push([create('shopping_item', ITEM, { title: 'Diapers', qty: 2 })])).results[0],
    ).toMatchObject({ status: 'applied', entity_id: ITEM });
    expect(s.shopping_items[0]).toMatchObject({ title: 'Diapers', qty: 2, checked_at: null });
    // someone who is not a member at all still gets nowhere
    const out = new MockSyncApi(s, OUTSIDER);
    expect((await out.push([update('shopping_item', ITEM, { qty: 9 })])).results[0]).toMatchObject({
      status: 'rejected',
      error: { code: 'FORBIDDEN' },
    });
  });

  it('who ticked is the caller, and it travels with when', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([create('shopping_item', ITEM, { title: 'Wipes' })]);
    await new MockSyncApi(s, CAREGIVER).push([update('shopping_item', ITEM, { checked_at: AT })]);
    expect(s.shopping_items[0]).toMatchObject({ checked_by: CAREGIVER });
    expect(s.shopping_items[0]?.['checked_at']).toBe(AT);
    // out of the basket clears both, whoever does it
    await owner.push([update('shopping_item', ITEM, { checked_at: null })]);
    expect(s.shopping_items[0]).toMatchObject({ checked_at: null, checked_by: null });
  });

  it('an UPDATE touches only the columns it names, and a replay is a duplicate', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    const op = create('shopping_item', ITEM, {
      title: 'Formula',
      qty: 1,
      note: 'the blue tub',
      store: 'Pharmacy',
    });
    await owner.push([op]);
    expect((await owner.push([op])).results[0]?.status).toBe('duplicate');
    await owner.push([update('shopping_item', ITEM, { qty: 3 })]);
    expect(s.shopping_items[0]).toMatchObject({
      title: 'Formula',
      qty: 3,
      note: 'the blue tub',
      store: 'Pharmacy',
    });
    // the quantity is clamped rather than refused: a stuck "+" is not a failed write
    await owner.push([update('shopping_item', ITEM, { qty: 500 })]);
    expect(s.shopping_items[0]?.['qty']).toBe(99);
  });

  it('removing is deleted_at, an undo puts it back, and a DELETE on the wire is refused', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([create('shopping_item', ITEM, { title: 'Bananas' })]);
    await owner.push([update('shopping_item', ITEM, { deleted_at: AT })]);
    expect(s.shopping_items[0]?.['deleted_at']).toBe(AT);
    await owner.push([update('shopping_item', ITEM, { deleted_at: null })]);
    expect(s.shopping_items[0]?.['deleted_at']).toBeNull();
    const del: PushOp = {
      client_op_id: opId(),
      entity: 'shopping_item',
      op: 'DELETE',
      entity_id: ITEM,
      household_id: HH,
      payload: { client_edited_at: AT },
    };
    expect((await owner.push([del])).results[0]?.status).toBe('rejected');
  });

  it('a line needs a name', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    const r = await owner.push([create('shopping_item', ITEM, { title: '   ' })]);
    expect(r.results[0]).toMatchObject({ status: 'rejected' });
    expect(s.shopping_items).toHaveLength(0);
  });
});

describe('the checklist on the fake server', () => {
  it('a chore carries its time, its rhythm and whose it is', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([
      create('task', TASK, {
        title: 'Wash the bottles',
        at_local_time: '21:00',
        repeat: 'DAILY',
        assigned_to: CAREGIVER,
      }),
    ]);
    expect(s.household_tasks[0]).toMatchObject({
      title: 'Wash the bottles',
      at_local_time: '21:00',
      repeat: 'DAILY',
      assigned_to: CAREGIVER,
      last_done_on: null,
    });
  });

  it('ticking stamps the day, who and when; unticking clears all three', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([create('task', TASK, { title: 'Pack the bag', repeat: 'WEEKDAYS' })]);
    await new MockSyncApi(s, CAREGIVER).push([
      update('task', TASK, { last_done_on: '2026-09-15' }),
    ]);
    expect(s.household_tasks[0]).toMatchObject({
      last_done_on: '2026-09-15',
      last_done_by: CAREGIVER,
    });
    expect(s.household_tasks[0]?.['last_done_at']).not.toBeNull();
    await owner.push([update('task', TASK, { last_done_on: null })]);
    expect(s.household_tasks[0]).toMatchObject({
      last_done_on: null,
      last_done_by: null,
      last_done_at: null,
    });
  });

  it('an any-time chore keeps its null, and the pull serves both lists', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([create('task', TASK, { title: 'Start the laundry', at_local_time: null })]);
    await owner.push([create('shopping_item', ITEM, { title: 'Wipes' })]);
    expect(s.household_tasks[0]?.['at_local_time']).toBeNull();
    const page = await owner.pull({
      household_id: HH,
      tables: [
        { name: 'shopping_items', strategy: 'delta', since: null, since_id: null, limit: 500 },
        { name: 'household_tasks', strategy: 'delta', since: null, since_id: null, limit: 500 },
      ],
    });
    expect(page.tables['shopping_items']?.rows).toHaveLength(1);
    expect(page.tables['household_tasks']?.rows).toHaveLength(1);
  });
});
