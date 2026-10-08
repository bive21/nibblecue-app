/**
 * The `location` entity against the in-memory server (0013; docs/SCHEDULE_AND_LOCATIONS.md
 * §3–§4). The same assertions run against Postgres in
 * packages/db/src/integration/sync-locations.test.ts; a divergence between the two is the
 * fake lying, and the fake loses.
 */
import type { PushOp } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { MockSyncApi, MockSyncServer } from './mock';

const HH = 'aaaaaaaa-0000-4000-8000-000000000001';
const OWNER = 'bbbbbbbb-0000-4000-8000-000000000001';
const CAREGIVER = 'bbbbbbbb-0000-4000-8000-000000000002';
const FRIDGE = 'dddddddd-0000-4000-8000-000000000001';
const THAWING = 'dddddddd-0000-4000-8000-000000000002';
const AT = '2026-03-02T10:00:00.000Z';
const id = (n: number): string => `eeeeeeee-0000-4000-8000-${String(n).padStart(12, '0')}`;

function fixture() {
  const server = new MockSyncServer({ now: () => Date.parse('2026-03-02T10:00:05.000Z') });
  server.addMember({ household_id: HH, user_id: OWNER, role: 'OWNER' });
  server.addMember({ household_id: HH, user_id: CAREGIVER, role: 'CAREGIVER' });
  server.addLocation({
    id: FRIDGE,
    household_id: HH,
    name: 'Kitchen refrigerator',
    kind: 'FRIDGE',
    is_default: true,
    deleted_at: null,
  });
  server.addLocation({
    id: THAWING,
    household_id: HH,
    name: 'Thawing (fridge)',
    kind: 'THAWED',
    is_default: false,
    deleted_at: null,
  });
  return {
    server,
    owner: new MockSyncApi(server, OWNER),
    caregiver: new MockSyncApi(server, CAREGIVER),
  };
}

const op = (
  kind: 'CREATE' | 'UPDATE' | 'DELETE',
  n: number,
  entityId: string,
  payload: Record<string, unknown>,
): PushOp => ({
  client_op_id: id(n),
  entity: 'location',
  op: kind,
  entity_id: entityId,
  household_id: HH,
  payload: { client_edited_at: AT, ...payload },
});

const create = (n: number, entityId: string, fields: Record<string, unknown>) =>
  op('CREATE', n, entityId, {
    name: 'Garage chest freezer',
    kind: 'DEEP_FREEZER',
    sort_order: 2,
    ...fields,
  });

describe('location CREATE', () => {
  it('a parent creates one; the same op again is a duplicate, not a second row', async () => {
    const f = fixture();
    const c = create(1, id(100), { short_name: 'Garage' });
    expect((await f.owner.push([c])).results[0]).toMatchObject({
      status: 'applied',
      entity_id: id(100),
    });
    expect((await f.owner.push([c])).results[0]).toMatchObject({ status: 'duplicate' });
    expect(f.server.storage_locations.filter(l => l['id'] === id(100))).toHaveLength(1);
    expect(f.server.storage_locations.find(l => l['id'] === id(100))).toMatchObject({
      name: 'Garage chest freezer',
      short_name: 'Garage',
      kind: 'DEEP_FREEZER',
      is_default: false,
    });
  });
  it('a caregiver is refused FORBIDDEN (locations_write is app.can_admin)', async () => {
    const f = fixture();
    const r = (await f.caregiver.push([create(2, id(101), {})])).results[0];
    expect(r).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } });
    expect(f.server.storage_locations.some(l => l['id'] === id(101))).toBe(false);
  });
  it('a second THAWED location is VALIDATION with the sentence the sheet shows, never a retry', async () => {
    const f = fixture();
    const r = (
      await f.owner.push([create(3, id(102), { name: 'Another thaw shelf', kind: 'THAWED' })])
    ).results[0];
    expect(r).toMatchObject({
      status: 'rejected',
      error: { code: 'VALIDATION', message: 'You already have a thawing location.' },
    });
  });
  it('a nameless location is refused', async () => {
    const f = fixture();
    const r = (await f.owner.push([create(4, id(103), { name: '   ' })])).results[0];
    expect(r).toMatchObject({ status: 'rejected', error: { code: 'VALIDATION' } });
  });
});

describe('location UPDATE', () => {
  it('renames, changes the condition and moves the default, touching only the named columns', async () => {
    const f = fixture();
    const r = (
      await f.owner.push([
        op('UPDATE', 5, FRIDGE, { name: 'Big fridge', kind: 'DEEP_FREEZER', is_default: false }),
      ])
    ).results[0];
    expect(r).toMatchObject({ status: 'applied', entity_id: FRIDGE });
    expect(f.server.storage_locations.find(l => l['id'] === FRIDGE)).toMatchObject({
      name: 'Big fridge',
      kind: 'DEEP_FREEZER',
      is_default: false,
      deleted_at: null,
    });
  });
  it('a DELETE op is refused: a location is retired with deleted_at, its ledger rows point at it', async () => {
    const f = fixture();
    const r = (await f.owner.push([op('DELETE', 6, FRIDGE, {})])).results[0];
    expect(r).toMatchObject({ status: 'rejected', error: { code: 'VALIDATION' } });
    expect(f.server.storage_locations.find(l => l['id'] === FRIDGE)?.['deleted_at']).toBe(null);
  });
  it('retiring a location that still holds milk is refused with the exact sentence', async () => {
    const f = fixture();
    f.server.addContainer({
      id: id(200),
      householdId: HH,
      ownerId: OWNER,
      locationId: FRIDGE,
      ml: 118,
    });
    const one = (await f.owner.push([op('UPDATE', 7, FRIDGE, { deleted_at: AT })])).results[0];
    expect(one).toMatchObject({
      status: 'rejected',
      error: {
        code: 'VALIDATION',
        message: 'This location still holds 1 container. Move it somewhere else first.',
      },
    });
    f.server.addContainer({
      id: id(201),
      householdId: HH,
      ownerId: OWNER,
      locationId: FRIDGE,
      ml: 118,
    });
    const two = (await f.owner.push([op('UPDATE', 8, FRIDGE, { deleted_at: AT })])).results[0];
    expect(two).toMatchObject({
      error: { message: 'This location still holds 2 containers. Move them somewhere else first.' },
    });
    expect(f.server.storage_locations.find(l => l['id'] === FRIDGE)?.['deleted_at']).toBe(null);
  });
  it('the last plain location cannot be retired, an empty extra one can, and it comes back', async () => {
    const f = fixture();
    const last = (await f.owner.push([op('UPDATE', 9, FRIDGE, { deleted_at: AT })])).results[0];
    expect(last).toMatchObject({ status: 'rejected', error: { code: 'VALIDATION' } });
    expect((await f.owner.push([create(10, id(104), {})])).results[0]).toMatchObject({
      status: 'applied',
    });
    const gone = (await f.owner.push([op('UPDATE', 11, id(104), { deleted_at: AT })])).results[0];
    expect(gone).toMatchObject({ status: 'applied' });
    expect(f.server.storage_locations.find(l => l['id'] === id(104))?.['deleted_at']).toBe(AT);
    // the pull still lists it: the row is retired, not gone, so a MOVE row can name it
    expect(f.server.storage_locations.some(l => l['id'] === id(104))).toBe(true);
    const back = (await f.owner.push([op('UPDATE', 12, id(104), { deleted_at: null })])).results[0];
    expect(back).toMatchObject({ status: 'applied' });
    expect(f.server.storage_locations.find(l => l['id'] === id(104))?.['deleted_at']).toBe(null);
  });
  it('a THAWED location with milk in it keeps its condition; empty, it may change', async () => {
    const f = fixture();
    f.server.addContainer({
      id: id(202),
      householdId: HH,
      ownerId: OWNER,
      locationId: THAWING,
      ml: 118,
    });
    const held = (await f.owner.push([op('UPDATE', 13, THAWING, { kind: 'FRIDGE' })])).results[0];
    expect(held).toMatchObject({ status: 'rejected', error: { code: 'VALIDATION' } });
    expect(f.server.storage_locations.find(l => l['id'] === THAWING)?.['kind']).toBe('THAWED');
  });
  it('changing another location to THAWED while one exists is VALIDATION', async () => {
    const f = fixture();
    const r = (await f.owner.push([op('UPDATE', 14, FRIDGE, { kind: 'THAWED' })])).results[0];
    expect(r).toMatchObject({
      status: 'rejected',
      error: { code: 'VALIDATION', message: 'You already have a thawing location.' },
    });
  });
  it('an unknown location is CONFLICT', async () => {
    const f = fixture();
    const r = (await f.owner.push([op('UPDATE', 15, id(999), { name: 'x' })])).results[0];
    expect(r).toMatchObject({ status: 'rejected', error: { code: 'CONFLICT' } });
  });
});
