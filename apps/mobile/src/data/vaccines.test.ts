/**
 * The immunisation writes on the local mirror (docs/VACCINES.md §6, §8): what each sheet's
 * Save leaves in `vaccine_records` and in the outbox, the (child, dose) upsert, the season
 * rows a repeating dose becomes, the toggles, and every Undo as an explicit inverse write.
 */
import { VACCINE_COPY, VACCINE_PROFILE } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import {
  liveRecordForDose,
  recentProviders,
  vaccineRecordById,
  vaccineRecords,
} from '../db/queries/vaccines';
import { CHILD_A, CHILD_B, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import {
  addCustomRecord,
  editRecord,
  fieldsFor,
  recordDose,
  removeRecord,
  setDoseTracking,
  undoVaccineWrite,
  VaccineRecordError,
} from './vaccines';

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
interface OutboxOp {
  client_op_id: string;
  entity: string;
  op: string;
  entity_id: string;
  payload: string;
}
const ops = (db: Db) =>
  db.all<OutboxOp>('select client_op_id, entity, op, entity_id, payload from outbox order by seq');
const payloadOf = (o: OutboxOp | undefined): Record<string, unknown> => {
  if (o === undefined) throw new Error('no such op');
  return JSON.parse(o.payload) as Record<string, unknown>;
};

describe('recordDose — one live row per scheduled dose', () => {
  it('mark given: a row stamped with the profile, one CREATE op carrying the fields, Undo removes it', async () => {
    const { db, clock } = await fixture();
    const r = await recordDose(db, clock, {
      ...ctx,
      childId: CHILD_A,
      doseId: 'hepb_1',
      status: 'GIVEN',
      occurredOn: '2026-06-02',
      provider: '  Riverside Pediatrics ',
      site: 'left thigh',
      lot: '',
      notes: null,
    });
    expect(r.committed).toBe(true);
    expect(r.merged).toBe(false);
    const row = await vaccineRecordById(db, r.recordId);
    expect(row).toMatchObject({
      child_id: CHILD_A,
      guidance_profile: 'CDC_CHILD_US',
      guidance_version: '2026_01',
      dose_id: 'hepb_1',
      custom_name: null,
      status: 'GIVEN',
      occurred_on: '2026-06-02',
      provider: 'Riverside Pediatrics',
      site: 'left thigh',
      lot: null,
      decline_reason: null,
      created_by: USER,
      deleted_at: null,
    });
    const all = await ops(db);
    expect(all.map(o => `${o.entity}:${o.op}`)).toEqual(['vaccine_record:CREATE']);
    expect(payloadOf(all[0])).toMatchObject({
      child_id: CHILD_A,
      dose_id: 'hepb_1',
      status: 'GIVEN',
      occurred_on: '2026-06-02',
      provider: 'Riverside Pediatrics',
      client_edited_at: clock.iso(),
    });
    expect(all[0]?.client_op_id).toBe(r.intentId);
    expect(r.undo).toEqual({ kind: 'remove', recordId: r.recordId });
    await undoVaccineWrite(db, clock, ctx, r.undo);
    expect((await vaccineRecordById(db, r.recordId))?.deleted_at).toBe(clock.iso());
    expect((await ops(db)).map(o => `${o.entity}:${o.op}`)).toEqual([
      'vaccine_record:CREATE',
      'vaccine_record:DELETE',
    ]);
    expect(await recentProviders(db, HOUSEHOLD)).toEqual([]);
  });

  it('a second write for the same dose patches the live row — never a second one — and Undo puts the previous fields back', async () => {
    const { db, clock } = await fixture();
    const first = await recordDose(db, clock, {
      ...ctx,
      childId: CHILD_A,
      doseId: 'dtap_1',
      status: 'PLANNED',
      occurredOn: '2026-08-05',
    });
    clock.advance(60_000);
    const second = await recordDose(db, clock, {
      ...ctx,
      childId: CHILD_A,
      doseId: 'dtap_1',
      status: 'GIVEN',
      occurredOn: '2026-08-06',
      provider: 'Lakeside Clinic',
    });
    expect(second.recordId).toBe(first.recordId);
    expect(second.merged).toBe(true);
    expect((await vaccineRecords(db, HOUSEHOLD)).map(r => r.id)).toEqual([first.recordId]);
    expect(await liveRecordForDose(db, CHILD_A, 'dtap_1')).toMatchObject({
      status: 'GIVEN',
      occurred_on: '2026-08-06',
      provider: 'Lakeside Clinic',
    });
    const all = await ops(db);
    expect(all.map(o => `${o.entity}:${o.op}`)).toEqual([
      'vaccine_record:CREATE',
      'vaccine_record:UPDATE',
    ]);
    expect(payloadOf(all[1])).toMatchObject({ status: 'GIVEN', occurred_on: '2026-08-06' });
    expect(second.undo).toEqual({
      kind: 'restore',
      recordId: first.recordId,
      patch: {
        status: 'PLANNED',
        occurred_on: '2026-08-05',
        provider: null,
        site: null,
        lot: null,
        decline_reason: null,
        notes: null,
      },
    });
    await undoVaccineWrite(db, clock, ctx, second.undo);
    expect(await liveRecordForDose(db, CHILD_A, 'dtap_1')).toMatchObject({
      status: 'PLANNED',
      occurred_on: '2026-08-05',
      provider: null,
    });
    expect(await recentProviders(db, HOUSEHOLD)).toEqual([]);
  });

  it('skip and decline carry no date; a decline keeps its reason verbatim; a given or planned dose without a date is refused', async () => {
    const { db, clock } = await fixture();
    const skipped = await recordDose(db, clock, {
      ...ctx,
      childId: CHILD_A,
      doseId: 'rv_1',
      status: 'SKIPPED',
      occurredOn: '2026-08-05',
    });
    expect(await vaccineRecordById(db, skipped.recordId)).toMatchObject({
      status: 'SKIPPED',
      occurred_on: null,
    });
    const declined = await recordDose(db, clock, {
      ...ctx,
      childId: CHILD_B,
      doseId: 'rv_1',
      status: 'DECLINED',
      occurredOn: null,
      declineReason: "  we're waiting until the next visit  ",
    });
    expect(await vaccineRecordById(db, declined.recordId)).toMatchObject({
      status: 'DECLINED',
      occurred_on: null,
      decline_reason: "we're waiting until the next visit",
    });
    await expect(
      recordDose(db, clock, {
        ...ctx,
        childId: CHILD_A,
        doseId: 'hib_1',
        status: 'GIVEN',
        occurredOn: null,
      }),
    ).rejects.toThrow(VaccineRecordError);
    await expect(
      recordDose(db, clock, {
        ...ctx,
        childId: CHILD_A,
        doseId: 'hib_1',
        status: 'PLANNED',
        occurredOn: 'soon',
      }),
    ).rejects.toThrow(/planned dose has a date/);
    await expect(
      recordDose(db, clock, {
        ...ctx,
        childId: CHILD_A,
        doseId: 'nope_9',
        status: 'GIVEN',
        occurredOn: '2026-08-05',
      }),
    ).rejects.toThrow(/No dose nope_9/);
    expect(fieldsFor('GIVEN', '2026-08-05', { declineReason: 'x' }).decline_reason).toBeNull();
  });

  it('a repeating dose becomes a parent-added row named by its season, one per season, never merged', async () => {
    const { db, clock } = await fixture();
    const flu = VACCINE_PROFILE.doses.find(d => d.id === 'flu_annual');
    const name = VACCINE_PROFILE.vaccines[flu?.vaccine ?? '']?.name ?? '';
    const a = await recordDose(db, clock, {
      ...ctx,
      childId: CHILD_A,
      doseId: 'flu_annual',
      status: 'GIVEN',
      occurredOn: '2026-10-03',
    });
    const b = await recordDose(db, clock, {
      ...ctx,
      childId: CHILD_A,
      doseId: 'flu_annual',
      status: 'GIVEN',
      occurredOn: '2027-10-01',
    });
    expect(a.recordId).not.toBe(b.recordId);
    expect(a.merged).toBe(false);
    const rows = await vaccineRecords(db, HOUSEHOLD);
    expect(rows.map(r => r.custom_name)).toEqual([
      VACCINE_COPY.seasonRecord(name, 2027),
      VACCINE_COPY.seasonRecord(name, 2026),
    ]);
    expect(rows.every(r => r.dose_id === null && r.guidance_profile === null)).toBe(true);
    expect((await ops(db)).map(o => o.op)).toEqual(['CREATE', 'CREATE']);
  });
});

describe('addCustomRecord / removeRecord', () => {
  it('a vaccine the schedule does not list: the parent’s name, no dose, no stamp; removing is deleted_at and Undo lifts it', async () => {
    const { db, clock } = await fixture();
    const added = await addCustomRecord(db, clock, {
      ...ctx,
      childId: CHILD_A,
      customName: '  Travel   vaccine ',
      status: 'GIVEN',
      occurredOn: '2026-08-01',
      provider: 'Travel clinic',
    });
    expect(await vaccineRecordById(db, added.recordId)).toMatchObject({
      dose_id: null,
      custom_name: 'Travel vaccine',
      guidance_profile: null,
      guidance_version: null,
      status: 'GIVEN',
    });
    await expect(
      addCustomRecord(db, clock, {
        ...ctx,
        childId: CHILD_A,
        customName: '   ',
        status: 'GIVEN',
        occurredOn: '2026-08-01',
      }),
    ).rejects.toThrow(/name/);
    clock.advance(1_000);
    const removed = await removeRecord(db, clock, { ...ctx, recordId: added.recordId });
    expect((await vaccineRecordById(db, added.recordId))?.deleted_at).toBe(clock.iso());
    expect(await vaccineRecords(db, HOUSEHOLD)).toEqual([]);
    await expect(removeRecord(db, clock, { ...ctx, recordId: added.recordId })).rejects.toThrow(
      /no longer here/,
    );
    expect(removed.undo).toEqual({ kind: 'undelete', recordId: added.recordId });
    clock.advance(1_000);
    await undoVaccineWrite(db, clock, ctx, removed.undo);
    expect((await vaccineRecordById(db, added.recordId))?.deleted_at).toBeNull();
    const all = await ops(db);
    expect(all.map(o => o.op)).toEqual(['CREATE', 'DELETE', 'UPDATE']);
    expect(payloadOf(all[2])).toEqual({ deleted_at: null, client_edited_at: clock.iso() });
    expect(await recentProviders(db, HOUSEHOLD)).toEqual(['Travel clinic']);
  });
});

describe('setDoseTracking', () => {
  it('an optional series on and off for one child is a settings upsert; a routine dose cannot be toggled; Undo restores the previous toggle', async () => {
    const { db, clock } = await fixture();
    const on = await setDoseTracking(db, clock, {
      ...ctx,
      childId: CHILD_A,
      doseId: 'flu_annual',
      enabled: true,
    });
    const rowsOf = () =>
      db.all<{ child_id: string; dose_id: string; enabled: number }>(
        'select child_id, dose_id, enabled from vaccine_tracking_settings where household_id = ? order by dose_id',
        [HOUSEHOLD],
      );
    expect(await rowsOf()).toEqual([{ child_id: CHILD_A, dose_id: 'flu_annual', enabled: 1 }]);
    expect(on.undo).toEqual({
      kind: 'tracking',
      childId: CHILD_A,
      doseId: 'flu_annual',
      enabled: false,
    });
    const off = await setDoseTracking(db, clock, {
      ...ctx,
      childId: CHILD_A,
      doseId: 'flu_annual',
      enabled: false,
    });
    expect(await rowsOf()).toEqual([{ child_id: CHILD_A, dose_id: 'flu_annual', enabled: 0 }]);
    expect(off.undo).toMatchObject({ enabled: true });
    await undoVaccineWrite(db, clock, ctx, off.undo);
    expect(await rowsOf()).toEqual([{ child_id: CHILD_A, dose_id: 'flu_annual', enabled: 1 }]);
    const all = await ops(db);
    expect(all.map(o => `${o.entity}:${o.op}`)).toEqual([
      'settings:UPDATE',
      'settings:UPDATE',
      'settings:UPDATE',
    ]);
    expect(payloadOf(all[0])).toMatchObject({
      table: 'vaccine_tracking_settings',
      child_id: CHILD_A,
      dose_id: 'flu_annual',
      enabled: true,
    });
    // the same (child, dose) is the same settings entity every time: an upsert on the server
    expect(new Set(all.map(o => o.entity_id)).size).toBe(1);
    await expect(
      setDoseTracking(db, clock, { ...ctx, childId: CHILD_A, doseId: 'hepb_1', enabled: true }),
    ).rejects.toThrow(/routine dose/);
  });
});

describe('editRecord', () => {
  it('renames and re-dates a parent-added vaccine; Undo puts the old name and fields back', async () => {
    const { db, clock } = await fixture();
    const added = await addCustomRecord(db, clock, {
      ...ctx,
      childId: CHILD_A,
      customName: 'Travel vaccine',
      status: 'PLANNED',
      occurredOn: '2026-10-01',
    });
    clock.advance(1_000);
    const edited = await editRecord(db, clock, {
      ...ctx,
      recordId: added.recordId,
      customName: 'Yellow fever',
      status: 'GIVEN',
      occurredOn: '2026-10-02',
      provider: 'Travel clinic',
    });
    expect(edited.recordId).toBe(added.recordId);
    expect(await vaccineRecordById(db, added.recordId)).toMatchObject({
      custom_name: 'Yellow fever',
      status: 'GIVEN',
      occurred_on: '2026-10-02',
      provider: 'Travel clinic',
    });
    expect(edited.undo).toEqual({
      kind: 'restore',
      recordId: added.recordId,
      patch: {
        status: 'PLANNED',
        occurred_on: '2026-10-01',
        provider: null,
        site: null,
        lot: null,
        decline_reason: null,
        notes: null,
        custom_name: 'Travel vaccine',
      },
    });
    await undoVaccineWrite(db, clock, ctx, edited.undo);
    expect(await vaccineRecordById(db, added.recordId)).toMatchObject({
      custom_name: 'Travel vaccine',
      status: 'PLANNED',
      occurred_on: '2026-10-01',
      provider: null,
    });
    await expect(
      editRecord(db, clock, {
        ...ctx,
        recordId: added.recordId,
        customName: ' ',
        status: 'GIVEN',
        occurredOn: '2026-10-02',
      }),
    ).rejects.toThrow(/name/);
    await expect(
      editRecord(db, clock, {
        ...ctx,
        recordId: 'nope',
        status: 'GIVEN',
        occurredOn: '2026-10-02',
      }),
    ).rejects.toThrow(/no longer here/);
  });
});
