/**
 * The fake server's `household_settings` branch, held to what Postgres does in 0095
 * (packages/db/src/integration/sync-day-window.test.ts): one row per household, an upsert, the
 * owner-or-parent boundary, a payload naming one half leaving the other alone, and a `full`
 * page that is empty for a household which never opened the control.
 */
import type { PushOp } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { MockSyncApi, MockSyncServer } from './mock';

const HH = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER = 'aaaaaaaa-0000-4000-8000-000000000002';
const OWNER = 'bbbbbbbb-0000-4000-8000-000000000001';
const CARER = 'bbbbbbbb-0000-4000-8000-000000000002';
let n = 0;
const uuid = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function server() {
  const s = new MockSyncServer({ now: () => Date.parse('2026-09-18T12:00:00.000Z') });
  s.addMember({ household_id: HH, user_id: OWNER, role: 'OWNER' });
  s.addMember({ household_id: HH, user_id: CARER, role: 'CAREGIVER' });
  s.addMember({ household_id: OTHER, user_id: OWNER, role: 'OWNER' });
  return s;
}

const windowOp = (payload: Record<string, unknown>, household = HH): PushOp => ({
  client_op_id: uuid(),
  entity: 'settings',
  op: 'UPDATE',
  entity_id: uuid(),
  household_id: household,
  payload: {
    table: 'household_settings',
    client_edited_at: '2026-09-18T10:00:00.000Z',
    ...payload,
  },
});

const pullWindow = async (api: MockSyncApi, household: string) => {
  const res = await api.pull({
    household_id: household,
    tables: [
      { name: 'household_settings', strategy: 'full', since: null, since_id: null, limit: 500 },
    ],
  });
  return res.tables['household_settings'];
};

describe('the fake server: the household waking window (0095)', () => {
  it('upserts one row, and a second write replaces it rather than adding another', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    const first = windowOp({ wake_time: '08:00', bed_time: '21:00' });
    expect((await owner.push([first])).results[0]).toMatchObject({ status: 'applied' });
    const again = windowOp({ wake_time: '06:30', bed_time: '19:00' });
    expect((await owner.push([again])).results[0]).toMatchObject({ status: 'applied' });

    expect(s.household_settings).toHaveLength(1);
    expect(s.household_settings[0]).toMatchObject({
      household_id: HH,
      wake_time: '06:30',
      bed_time: '19:00',
      updated_by: OWNER,
    });
  });

  it('a payload naming one half leaves the other half alone', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([windowOp({ wake_time: '08:00', bed_time: '21:00' })]);
    await owner.push([windowOp({ bed_time: '20:15' })]);
    expect(s.household_settings[0]).toMatchObject({ wake_time: '08:00', bed_time: '20:15' });
  });

  it('a caregiver is refused, and the row is unchanged', async () => {
    const s = server();
    await new MockSyncApi(s, OWNER).push([windowOp({ wake_time: '08:00', bed_time: '21:00' })]);
    const carer = new MockSyncApi(s, CARER);
    const res = await carer.push([windowOp({ wake_time: '03:00', bed_time: '23:00' })]);
    expect(res.results[0]).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } });
    expect(s.household_settings[0]).toMatchObject({ wake_time: '08:00', bed_time: '21:00' });
  });

  it('pulls `full`, scoped to the household, and empty when nothing was ever set', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([windowOp({ wake_time: '08:00', bed_time: '21:00' })]);

    const mine = await pullWindow(owner, HH);
    expect(mine?.full).toBe(true);
    expect(mine?.rows).toHaveLength(1);
    expect(mine?.rows[0]).toMatchObject({ wake_time: '08:00', bed_time: '21:00' });

    // the same owner's other household never opened the control: an empty page, which the
    // device reads as the default pair rather than as an error
    const theirs = await pullWindow(owner, OTHER);
    expect(theirs?.full).toBe(true);
    expect(theirs?.rows).toHaveLength(0);
  });
});

/**
 * THE HOUSEHOLD'S MILK UNIT (0128) on the same row, held to what Postgres does
 * (packages/db/src/integration/sync-volume-unit.test.ts): written only when the payload names it,
 * the same owner-or-parent boundary, a value other than oz or ml refused, and pulled with the row.
 */
describe('the fake server: the household milk unit (0128)', () => {
  it('writes the unit on its own, and a window op leaves it alone', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    expect((await owner.push([windowOp({ volume_unit: 'ml' })])).results[0]).toMatchObject({
      status: 'applied',
    });
    // a household's first settings write is the unit: the window is the default pair
    expect(s.household_settings[0]).toMatchObject({
      volume_unit: 'ml',
      wake_time: '07:00',
      bed_time: '19:30',
    });
    await owner.push([windowOp({ wake_time: '06:30', bed_time: '20:00' })]);
    expect(s.household_settings[0]).toMatchObject({ volume_unit: 'ml', wake_time: '06:30' });
    await owner.push([windowOp({ volume_unit: 'oz' })]);
    expect(s.household_settings[0]).toMatchObject({ volume_unit: 'oz', wake_time: '06:30' });
    expect(s.household_settings).toHaveLength(1);
  });

  it('refuses a caregiver, and refuses a unit that is not oz or ml', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([windowOp({ volume_unit: 'ml' })]);
    const carer = new MockSyncApi(s, CARER);
    expect((await carer.push([windowOp({ volume_unit: 'oz' })])).results[0]).toMatchObject({
      status: 'rejected',
      error: { code: 'FORBIDDEN' },
    });
    expect((await owner.push([windowOp({ volume_unit: 'cups' })])).results[0]).toMatchObject({
      status: 'rejected',
      error: { code: 'VALIDATION' },
    });
    expect(s.household_settings[0]).toMatchObject({ volume_unit: 'ml' });
  });

  it('pulls the unit with the row', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([windowOp({ volume_unit: 'ml' })]);
    const page = await pullWindow(owner, HH);
    expect(page?.rows[0]).toMatchObject({ volume_unit: 'ml' });
  });
});
