/**
 * The immunisation chains (docs/VACCINES.md §6, §8): a record's local row and its op, the
 * shapes the sheets may not write, the patch and the soft delete, and the tracking toggle
 * as a settings upsert keyed by child and dose.
 */
import { describe, expect, it } from 'vitest';
import {
  settingsEntityId,
  vaccineRecordCreateChain,
  vaccineRecordDeleteChain,
  vaccineRecordUpdateChain,
  vaccineTrackingChain,
  type VaccineRecordFields,
} from './chains';

const base = {
  intentId: '11111111-1111-4111-8111-111111111111',
  householdId: 'aaaaaaaa-0000-4000-8000-000000000001',
  createdBy: 'bbbbbbbb-0000-4000-8000-000000000001',
  deviceId: null,
  clientEditedAt: '2026-09-14T08:00:00.000Z',
};
const given: VaccineRecordFields = {
  child_id: 'cccccccc-0000-4000-8000-0000000000e1',
  guidance_profile: 'CDC_CHILD_US',
  guidance_version: '2026_01',
  dose_id: 'hepb_1',
  custom_name: null,
  status: 'GIVEN',
  occurred_on: '2026-05-02',
  provider: 'Riverside Pediatrics',
  site: null,
  lot: null,
  decline_reason: null,
  notes: null,
};

describe('vaccineRecordCreateChain', () => {
  it('writes the whole row locally, stamped, and one CREATE op with the fields', () => {
    const c = vaccineRecordCreateChain({ ...base, recordId: 'r1', record: given });
    expect(c.rows).toHaveLength(1);
    expect(c.rows[0]?.table).toBe('vaccine_records');
    expect(c.rows[0]?.row).toMatchObject({
      id: 'r1',
      client_op_id: base.intentId,
      household_id: base.householdId,
      dose_id: 'hepb_1',
      status: 'GIVEN',
      created_by: base.createdBy,
      created_at: base.clientEditedAt,
      updated_at: base.clientEditedAt,
      deleted_at: null,
    });
    expect(c.ops).toHaveLength(1);
    expect(c.ops[0]).toMatchObject({
      entity: 'vaccine_record',
      op: 'CREATE',
      entity_id: 'r1',
      payload: {
        dose_id: 'hepb_1',
        provider: 'Riverside Pediatrics',
        client_edited_at: base.clientEditedAt,
      },
    });
  });

  it('refuses a record that names neither a dose nor a vaccine, and a given dose without a date', () => {
    expect(() =>
      vaccineRecordCreateChain({
        ...base,
        recordId: 'r',
        record: { ...given, dose_id: null, custom_name: '  ' },
      }),
    ).toThrow(RangeError);
    expect(() =>
      vaccineRecordCreateChain({ ...base, recordId: 'r', record: { ...given, occurred_on: null } }),
    ).toThrow('a given dose has a date');
    // a parent-added vaccine has no dose and no stamp
    const custom = vaccineRecordCreateChain({
      ...base,
      recordId: 'r2',
      record: {
        ...given,
        dose_id: null,
        custom_name: 'Travel vaccine',
        guidance_profile: null,
        guidance_version: null,
      },
    });
    expect(custom.rows[0]?.row).toMatchObject({
      dose_id: null,
      custom_name: 'Travel vaccine',
      guidance_profile: null,
    });
  });
});

describe('the patch and the delete', () => {
  it('a patch carries only what it names, and the delete is deleted_at', () => {
    const u = vaccineRecordUpdateChain({
      ...base,
      recordId: 'r1',
      patch: { status: 'SKIPPED', occurred_on: null },
    });
    expect(u.rows[0]?.row).toEqual({
      id: 'r1',
      status: 'SKIPPED',
      occurred_on: null,
      updated_by: base.createdBy,
      updated_at: base.clientEditedAt,
    });
    expect(u.ops[0]).toMatchObject({
      op: 'UPDATE',
      payload: { status: 'SKIPPED', occurred_on: null },
    });
    expect(() => vaccineRecordUpdateChain({ ...base, recordId: 'r1', patch: {} })).toThrow(
      RangeError,
    );
    const d = vaccineRecordDeleteChain({ ...base, recordId: 'r1' });
    expect(d.rows[0]?.row).toEqual({
      id: 'r1',
      deleted_at: base.clientEditedAt,
      updated_at: base.clientEditedAt,
    });
    expect(d.ops[0]).toMatchObject({
      op: 'DELETE',
      entity: 'vaccine_record',
      payload: { client_edited_at: base.clientEditedAt },
    });
  });
});

describe('vaccineTrackingChain', () => {
  it('is a settings upsert keyed by child and dose', () => {
    const c = vaccineTrackingChain({
      ...base,
      childId: given.child_id,
      doseId: 'flu_annual',
      enabled: true,
    });
    expect(c.rows[0]).toEqual({
      table: 'vaccine_tracking_settings',
      row: {
        household_id: base.householdId,
        child_id: given.child_id,
        dose_id: 'flu_annual',
        enabled: true,
        updated_by: base.createdBy,
        updated_at: base.clientEditedAt,
      },
    });
    expect(c.ops[0]).toMatchObject({
      entity: 'settings',
      op: 'UPDATE',
      entity_id: settingsEntityId(
        base.householdId,
        'vaccine_tracking_settings',
        `${given.child_id}:flu_annual`,
      ),
      payload: {
        table: 'vaccine_tracking_settings',
        child_id: given.child_id,
        dose_id: 'flu_annual',
        enabled: true,
      },
    });
    // the same key from another device is the same entity
    expect(
      vaccineTrackingChain({
        ...base,
        intentId: '22222222-2222-4222-8222-222222222222',
        childId: given.child_id,
        doseId: 'flu_annual',
        enabled: false,
      }).ops[0]?.entity_id,
    ).toBe(c.ops[0]?.entity_id);
  });
});
