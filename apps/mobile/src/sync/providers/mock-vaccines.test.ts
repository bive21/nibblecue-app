/**
 * The fake server's immunisation branches, held to what Postgres does in 0015
 * (packages/db/src/integration/sync-vaccines.test.ts): the parent-or-owner boundary, the
 * (child, dose) merge with the later write winning, the replay, the soft delete, the
 * tracking upsert, and the profile the pull serves.
 */
import type { PushOp } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { MockSyncApi, MockSyncServer } from './mock';

const HH = 'aaaaaaaa-0000-4000-8000-000000000001';
const OWNER = 'bbbbbbbb-0000-4000-8000-000000000001';
const CARER = 'bbbbbbbb-0000-4000-8000-000000000002';
const EMMA = 'cccccccc-0000-4000-8000-0000000000e1';
const T0 = '2026-09-14T10:00:00.000Z';
// D2: whole-row last-writer-wins by the phone clock of the row's last EDIT (`client_edited_at`,
// 0116 — it was the server's own `updated_at` until then), so "later" is later than T0; a device
// clock up to five minutes ahead of the fake server's is clamped to it, never refused
const T1 = '2026-09-14T12:00:30.000Z';
let n = 0;
const uuid = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;
// the fake server validates entity ids as uuids, as the wire does
const R1 = 'dddddddd-0000-4000-8000-000000000001';
const R2 = 'dddddddd-0000-4000-8000-000000000002';
const R3 = 'dddddddd-0000-4000-8000-000000000003';
const R4 = 'dddddddd-0000-4000-8000-000000000004';

function server() {
  const s = new MockSyncServer({ now: () => Date.parse('2026-09-14T12:00:00.000Z') });
  s.addMember({ household_id: HH, user_id: OWNER, role: 'OWNER' });
  s.addMember({ household_id: HH, user_id: CARER, role: 'CAREGIVER' });
  s.addChild({ id: EMMA, household_id: HH, name: 'Emma', birth_date: '2026-03-04' });
  s.seedVaccineProfile();
  return s;
}
const record = (id: string, fields: Record<string, unknown> = {}, at = T0): PushOp => ({
  client_op_id: uuid(),
  entity: 'vaccine_record',
  op: 'CREATE',
  entity_id: id,
  household_id: HH,
  payload: {
    child_id: EMMA,
    guidance_profile: 'CDC_CHILD_US',
    guidance_version: '2026_01',
    dose_id: 'hepb_1',
    custom_name: null,
    status: 'GIVEN',
    occurred_on: '2026-05-02',
    provider: 'Riverside',
    site: null,
    lot: null,
    decline_reason: null,
    notes: null,
    client_edited_at: at,
    ...fields,
  },
});

describe('vaccine records on the fake server', () => {
  it('a caregiver is FORBIDDEN; the owner is applied; a replay is a duplicate', async () => {
    const s = server();
    const op = record(R1);
    const carer = new MockSyncApi(s, CARER);
    expect((await carer.push([op])).results[0]).toMatchObject({
      status: 'rejected',
      error: { code: 'FORBIDDEN' },
    });
    const owner = new MockSyncApi(s, OWNER);
    expect((await owner.push([op])).results[0]).toMatchObject({ status: 'applied', entity_id: R1 });
    expect((await owner.push([op])).results[0]).toMatchObject({
      status: 'duplicate',
      entity_id: R1,
    });
    expect(s.rowCount('vaccine_records', { household_id: HH })).toBe(1);
  });

  it('a second device’s record for the same dose merges into the first, the later write winning', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([record(R1)]);
    const later = record(R2, { provider: 'Lakeside', occurred_on: '2026-05-07' }, T1);
    expect((await owner.push([later])).results[0]).toMatchObject({
      status: 'duplicate',
      entity_id: R1,
    });
    const live = s.vaccine_records.filter(r => r['deleted_at'] === null);
    expect(live).toHaveLength(1);
    expect(live[0]).toMatchObject({ id: R1, provider: 'Lakeside', occurred_on: '2026-05-07' });
    // an older write does not overwrite
    const stale = record(R3, { provider: 'Old' }, '2026-01-01T00:00:00.000Z');
    expect((await owner.push([stale])).results[0]?.status).toBe('duplicate');
    expect(s.vaccine_records[0]?.['provider']).toBe('Lakeside');
  });

  it('a delete is deleted_at, twice is a duplicate, and the slot is free again', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([record(R1)]);
    const del: PushOp = {
      client_op_id: uuid(),
      entity: 'vaccine_record',
      op: 'DELETE',
      entity_id: R1,
      household_id: HH,
      payload: { client_edited_at: T1 },
    };
    expect((await owner.push([del])).results[0]?.status).toBe('applied');
    expect((await owner.push([del])).results[0]?.status).toBe('duplicate');
    expect(s.vaccine_records[0]?.['deleted_at']).not.toBeNull();
    expect((await owner.push([record(R4, {}, T1)])).results[0]).toMatchObject({
      status: 'applied',
      entity_id: R4,
    });
  });

  it('a record corrected before it was sent keeps the correction, and an older Undo does not restore a delete (0116)', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    // every clock below is hours before the fake server's own stamp (12:00)
    const at = (m: number) => new Date(Date.parse(T0) + m * 60_000).toISOString();
    await owner.push([record(R1, {}, at(0))]);
    const patch = (fields: Record<string, unknown>, clock: string, op: PushOp['op'] = 'UPDATE') =>
      ({
        client_op_id: uuid(),
        entity: 'vaccine_record',
        op,
        entity_id: R1,
        household_id: HH,
        payload: { ...fields, client_edited_at: clock },
      }) satisfies PushOp;
    expect(
      (await owner.push([patch({ occurred_on: '2026-05-03' }, at(1))])).results[0]?.status,
    ).toBe('applied');
    expect((await owner.push([patch({ provider: 'Old' }, at(0.5))])).results[0]?.status).toBe(
      'applied',
    );
    expect(s.vaccine_records[0]).toMatchObject({
      occurred_on: '2026-05-03',
      provider: 'Riverside',
    });

    expect((await owner.push([patch({}, at(3), 'DELETE')])).results[0]?.status).toBe('applied');
    // an Undo tapped before the delete, arriving after it
    expect((await owner.push([patch({ deleted_at: null }, at(2))])).results[0]?.status).toBe(
      'applied',
    );
    expect(s.vaccine_records[0]?.['deleted_at']).not.toBeNull();
  });

  it('a tracking toggle is an upsert under the admin boundary, and the profile is served whole', async () => {
    const s = server();
    const toggle = (enabled: boolean): PushOp => ({
      client_op_id: uuid(),
      entity: 'settings',
      op: 'UPDATE',
      entity_id: uuid(),
      household_id: HH,
      payload: {
        table: 'vaccine_tracking_settings',
        child_id: EMMA,
        dose_id: 'flu_annual',
        enabled,
        client_edited_at: T0,
      },
    });
    expect((await new MockSyncApi(s, CARER).push([toggle(true)])).results[0]?.status).toBe(
      'rejected',
    );
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([toggle(true), toggle(false), toggle(true)]);
    expect(s.vaccine_tracking_settings).toHaveLength(1);
    expect(s.vaccine_tracking_settings[0]).toMatchObject({
      child_id: EMMA,
      dose_id: 'flu_annual',
      enabled: true,
    });
    const page = await owner.pull({
      household_id: HH,
      tables: [
        {
          name: 'vaccine_guidance_profiles',
          strategy: 'full',
          since: null,
          since_id: null,
          limit: 500,
        },
        {
          name: 'vaccine_tracking_settings',
          strategy: 'full',
          since: null,
          since_id: null,
          limit: 500,
        },
        { name: 'vaccine_records', strategy: 'delta', since: null, since_id: null, limit: 500 },
      ],
    });
    expect(page.tables['vaccine_guidance_profiles']?.rows[0]).toMatchObject({
      profile: 'CDC_CHILD_US',
      version: '2026_01',
    });
    expect(page.tables['vaccine_tracking_settings']?.rows).toHaveLength(1);
    expect(page.tables['vaccine_records']?.rows).toEqual([]);
  });
});
