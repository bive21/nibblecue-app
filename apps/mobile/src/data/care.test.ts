/**
 * Care items (docs/CARE_ITEMS.md §7's criteria, the ones a device can prove):
 *   * adding an item makes it available at once; logging it a second time needs no typing
 *   * two items selected write two entries with distinct care_item_ids under one Undo
 *   * a "just this time" amount is on the entry and does NOT change the item
 *   * enabling reminders on an item that had none creates the times shown — never an empty set
 *   * archiving removes the item and its reminders while every logged entry stays
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { careActivityFor, careItem, careItems } from '../db/queries/care';
import {
  CHILD_A,
  CHILD_B,
  HOUSEHOLD,
  USER,
  liveActivities,
  seedHousehold,
} from '../testing/fixtures';
import {
  archiveCareItem,
  CareItemNameTakenError,
  logCareItems,
  saveCareItem,
  type CareLogEntry,
  type CareRoute,
} from './care';
import { undoWrite } from './undo';

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
const R1 = 'ffffffff-0000-4000-8000-0000000000a1';
const R2 = 'ffffffff-0000-4000-8000-0000000000a2';
const R3 = 'ffffffff-0000-4000-8000-0000000000a3';

const ops = (db: Db) =>
  db.all<{ entity: string; op: string; payload: string }>(
    'select entity, op, payload from outbox order by seq',
    [],
  );

describe('saveCareItem', () => {
  it('adds an item the list shows at once, and its reminders are the times given', async () => {
    const { db, clock } = await fixture();
    const r = await saveCareItem(db, clock, {
      ...ctx,
      name: '  Barrier  cream ',
      kind: 'CREAM',
      usualAmount: 'thin layer',
      route: 'SKIN',
      note: null,
      reminders: [
        { id: R1, atLocalTime: '08:00' },
        { id: R2, atLocalTime: '20:00' },
      ],
    });
    expect(r.committed).toBe(true);
    const list = await careItems(db, HOUSEHOLD);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({
      id: r.itemId,
      name: 'Barrier cream',
      kind: 'CREAM',
      usual_amount: 'thin layer',
      reminders: [
        { id: R1, at_local_time: '08:00' },
        { id: R2, at_local_time: '20:00' },
      ],
    });
    // the household had no phase: one was minted for the rules and rides in the same op
    const phase = await db.get<{ id: string; is_current: number }>(
      'select id, is_current from schedule_phases where household_id = ?',
      [HOUSEHOLD],
    );
    expect(phase?.is_current).toBe(1);
    const queued = await ops(db);
    expect(queued.map(o => `${o.entity} ${o.op}`)).toEqual(['care_item CREATE']);
    const payload = JSON.parse(queued[0]!.payload) as Record<string, unknown>;
    expect(payload).toMatchObject({
      name: 'Barrier cream',
      phase_id: phase?.id,
      reminders: [
        { id: R1, at_local_time: '08:00' },
        { id: R2, at_local_time: '20:00' },
      ],
    });
  });

  it('keeps the third way to give it, and refuses a way it does not know before anything is written', async () => {
    const { db, clock } = await fixture();
    const made = await saveCareItem(db, clock, {
      ...ctx,
      name: 'Drops in the bottle',
      kind: 'VITAMIN',
      usualAmount: null,
      route: 'WITH_FOOD',
      note: null,
      reminders: [],
    });
    expect((await careItem(db, made.itemId))?.route).toBe('WITH_FOOD');
    // the wire carries a Postgres enum: a token the server would refuse never becomes a local row
    await expect(
      saveCareItem(db, clock, {
        ...ctx,
        name: 'Spray',
        kind: 'MEDICINE',
        usualAmount: null,
        route: 'NOSE' as CareRoute,
        note: null,
        reminders: [],
      }),
    ).rejects.toThrow(RangeError);
    expect((await careItems(db, HOUSEHOLD)).map(i => i.name)).toEqual(['Drops in the bottle']);
    expect((await ops(db)).map(o => `${o.entity} ${o.op}`)).toEqual(['care_item CREATE']);
  });

  it('enabling reminders on an item that had none creates the times shown (§7, the prototype bug)', async () => {
    const { db, clock } = await fixture();
    const made = await saveCareItem(db, clock, {
      ...ctx,
      name: 'Drops',
      kind: 'VITAMIN',
      usualAmount: '1 drop',
      route: 'MOUTH',
      note: null,
      reminders: [],
    });
    expect((await careItem(db, made.itemId))?.reminders).toEqual([]);
    const edited = await saveCareItem(db, clock, {
      ...ctx,
      itemId: made.itemId,
      name: 'Drops',
      kind: 'VITAMIN',
      usualAmount: '1 drop',
      route: 'MOUTH',
      note: null,
      reminders: [{ id: R3, atLocalTime: '09:00' }],
    });
    expect(edited.ruleIds).toEqual([R3]);
    expect((await careItem(db, made.itemId))?.reminders).toEqual([
      { id: R3, at_local_time: '09:00' },
    ]);
    const queued = await ops(db);
    expect(queued.map(o => `${o.entity} ${o.op}`)).toEqual([
      'care_item CREATE',
      'care_item UPDATE',
    ]);
  });

  it('rebuilds the list on edit: a dropped time goes, a kept one stays, the item keeps its dates', async () => {
    const { db, clock } = await fixture();
    const made = await saveCareItem(db, clock, {
      ...ctx,
      name: 'Night cream',
      kind: 'CREAM',
      usualAmount: null,
      route: 'SKIN',
      note: null,
      reminders: [
        { id: R1, atLocalTime: '08:00' },
        { id: R2, atLocalTime: '14:00' },
      ],
    });
    await saveCareItem(db, clock, {
      ...ctx,
      itemId: made.itemId,
      name: 'Night cream',
      kind: 'CREAM',
      usualAmount: 'pea-sized',
      route: 'SKIN',
      note: null,
      reminders: [{ id: R1, atLocalTime: '08:30' }],
    });
    expect((await careItem(db, made.itemId))?.reminders).toEqual([
      { id: R1, at_local_time: '08:30' },
    ]);
    const gone = await db.get<{ deleted_at: string | null }>(
      'select deleted_at from schedule_rules where id = ?',
      [R2],
    );
    expect(gone?.deleted_at).not.toBeNull();
    const item = await db.get<{ created_by: string; usual_amount: string }>(
      'select created_by, usual_amount from care_items where id = ?',
      [made.itemId],
    );
    expect(item).toMatchObject({ created_by: USER, usual_amount: 'pea-sized' });
  });

  it('refuses a second live item with the same name, whatever the case and spacing', async () => {
    const { db, clock } = await fixture();
    await saveCareItem(db, clock, {
      ...ctx,
      name: 'Drops',
      kind: 'VITAMIN',
      usualAmount: null,
      route: 'MOUTH',
      note: null,
      reminders: [],
    });
    await expect(
      saveCareItem(db, clock, {
        ...ctx,
        name: '  DROPS ',
        kind: 'OTHER',
        usualAmount: null,
        route: 'OTHER',
        note: null,
        reminders: [],
      }),
    ).rejects.toBeInstanceOf(CareItemNameTakenError);
    expect(await careItems(db, HOUSEHOLD)).toHaveLength(1);
  });

  /**
   * ACCENTED LETTERS TOO (the sync sweep of 2026-09-24, P5). SQLite's `lower()` folds ASCII only,
   * so "ÁCIDO FÓLICO" passed the phone's check beside "ácido fólico" and was refused by the
   * server, which lower-cases every letter — "Not synced", with the duplicate already listed here.
   */
  it('refuses the same name in another case when the letters are accented', async () => {
    const { db, clock } = await fixture();
    const item = (name: string) => ({
      ...ctx,
      name,
      kind: 'VITAMIN' as const,
      usualAmount: null,
      route: 'MOUTH' as const,
      note: null,
      reminders: [],
    });
    await saveCareItem(db, clock, item('ácido fólico'));
    await expect(saveCareItem(db, clock, item('ÁCIDO FÓLICO'))).rejects.toBeInstanceOf(
      CareItemNameTakenError,
    );
    // a genuinely different name is still welcome
    await saveCareItem(db, clock, item('Ácido ascórbico'));
    expect(await careItems(db, HOUSEHOLD)).toHaveLength(2);
  });
});

describe('logCareItems (D10: one entry per item per child)', () => {
  const entries: CareLogEntry[] = [
    {
      itemId: 'dddddddd-0000-4000-8000-0000000000c2',
      name: 'Cream A',
      route: 'SKIN',
      amountText: 'thin layer',
    },
    {
      itemId: 'dddddddd-0000-4000-8000-0000000000c3',
      name: 'Cream B',
      route: 'SKIN',
      amountText: 'thin layer',
    },
  ];
  const AT = '2026-09-14T09:00:00.000Z';

  it('two items for one child are two entries with distinct care_item_ids under one Undo', async () => {
    const { db, clock } = await fixture();
    const out = await logCareItems(db, clock, {
      ...ctx,
      childIds: [CHILD_A],
      startAt: AT,
      entries,
    });
    expect(out.committed).toBe(true);
    expect(out.entityIds).toHaveLength(2);
    const details = await db.all<{ care_item_id: string; name: string; amount_text: string }>(
      `select d.care_item_id, d.name, d.amount_text from med_details d
         join activities a on a.id = d.activity_id where a.child_id = ? order by d.name`,
      [CHILD_A],
    );
    expect(details).toEqual([
      { care_item_id: entries[0]!.itemId, name: 'Cream A', amount_text: 'thin layer' },
      { care_item_id: entries[1]!.itemId, name: 'Cream B', amount_text: 'thin layer' },
    ]);
    // one Undo removes the lot
    expect(await undoWrite(db, clock, out)).toBe('cancelled');
    expect(await liveActivities(db)).toBe(0);
  });

  it('two items for twins are four entries, and a replay of the Save lands on the same rows', async () => {
    const { db, clock } = await fixture();
    const submissionId = 'ffffffff-0000-4000-8000-0000000000e0';
    const first = await logCareItems(db, clock, {
      ...ctx,
      childIds: [CHILD_A, CHILD_B],
      startAt: AT,
      entries,
      submissionId,
    });
    expect(first.entityIds).toHaveLength(4);
    const again = await logCareItems(db, clock, {
      ...ctx,
      childIds: [CHILD_A, CHILD_B],
      startAt: AT,
      entries,
      submissionId,
    });
    expect(again.suppressed).toBe(true);
    expect(await liveActivities(db)).toBe(4);
  });

  it('a "just this time" amount is on the entry and the item is untouched (D9)', async () => {
    const { db, clock } = await fixture();
    const made = await saveCareItem(db, clock, {
      ...ctx,
      name: 'Drops',
      kind: 'VITAMIN',
      usualAmount: '1 drop',
      route: 'MOUTH',
      note: null,
      reminders: [],
    });
    await logCareItems(db, clock, {
      ...ctx,
      childIds: [CHILD_A],
      startAt: AT,
      entries: [
        {
          itemId: made.itemId,
          name: 'Drops',
          route: 'MOUTH',
          amountText: '2 drops, as the pharmacist said',
        },
      ],
    });
    const d = await db.get<{ amount_text: string }>(
      'select amount_text from med_details limit 1',
      [],
    );
    expect(d?.amount_text).toBe('2 drops, as the pharmacist said');
    expect((await careItem(db, made.itemId))?.usual_amount).toBe('1 drop');
    const act = await careActivityFor(
      db,
      HOUSEHOLD,
      [CHILD_A],
      '2026-09-14T07:00:00.000Z',
      '2026-09-15T07:00:00.000Z',
    );
    // and who logged it, with the name the log shows — "did anyone give it yet?" (2026-09-23)
    expect(act.get(made.itemId)).toEqual({
      today: 1,
      lastAt: AT,
      lastBy: USER,
      lastByName: 'Dana',
      todayByChild: new Map([[CHILD_A, 1]]),
      lastChildId: CHILD_A,
    });
  });
});

describe('archiveCareItem', () => {
  it('takes the item off the list and its reminders with it; the entries stay', async () => {
    const { db, clock } = await fixture();
    const made = await saveCareItem(db, clock, {
      ...ctx,
      name: 'Drops',
      kind: 'VITAMIN',
      usualAmount: '1 drop',
      route: 'MOUTH',
      note: null,
      reminders: [{ id: R1, atLocalTime: '09:00' }],
    });
    await logCareItems(db, clock, {
      ...ctx,
      childIds: [CHILD_A],
      startAt: '2026-09-14T09:00:00.000Z',
      entries: [{ itemId: made.itemId, name: 'Drops', route: 'MOUTH', amountText: '1 drop' }],
    });
    const out = await archiveCareItem(db, clock, { ...ctx, itemId: made.itemId });
    expect(out.committed).toBe(true);
    expect(await careItems(db, HOUSEHOLD)).toEqual([]);
    const rule = await db.get<{ deleted_at: string | null }>(
      'select deleted_at from schedule_rules where id = ?',
      [R1],
    );
    expect(rule?.deleted_at).not.toBeNull();
    expect(await liveActivities(db)).toBe(1);
    const queued = await ops(db);
    expect(queued.map(o => `${o.entity} ${o.op}`)).toEqual([
      'care_item CREATE',
      'activity CREATE',
      'care_item UPDATE',
    ]);
    expect(JSON.parse(queued[2]!.payload)).toHaveProperty('archived_at');
  });
});
