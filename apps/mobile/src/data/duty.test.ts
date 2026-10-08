/**
 * Who's on, written on the phone: the row in the local mirror, the op on its way to the server,
 * and the list that is refused before it is written — a shift the server would reject must never
 * sit in this phone's mirror deciding its reminders while the op waits to fail.
 */
import { dutyListToWire, newDutyList, type DutyShift } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { dutyEntries, dutyList, dutyPeople, lastDutyWrite } from '../db/queries/duty';
import { HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { confirmDuty, DutyRefusedError, saveDuty } from './duty';

const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };
const HOUR = 3_600_000;
const SAM = 'abababab-0000-4000-8000-0000000000d1';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function seeded() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

describe('saving who’s on', () => {
  it('writes the row and queues one settings op for the server', async () => {
    const { db, clock } = await seeded();
    const now = clock.now();
    const night: DutyShift[] = [{ userId: USER, fromMs: now, untilMs: now + 9 * HOUR }];
    const out = await saveDuty(db, clock, { ...ctx, shifts: night, eligible: new Set([USER]) });
    expect(out.committed).toBe(true);
    expect((await dutyList(db, HOUSEHOLD)).shifts).toEqual(night);
    const ops = await db.all<{ entity: string; op: string; payload: string }>(
      'select entity, op, payload from outbox order by seq',
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ entity: 'settings', op: 'UPDATE' });
    const payload = JSON.parse(ops[0]?.payload ?? '{}') as { table: string; shifts: unknown[] };
    expect(payload.table).toBe('household_duty');
    expect(payload.shifts[0]).toMatchObject({ user_id: USER });
    // and the list's own record rides as the last element (0115): who set it, and whose phone has it
    expect(payload.shifts[1]).toMatchObject({ meta: { by: USER, base: null } });
  });

  it('ends every shift with an empty list', async () => {
    const { db, clock } = await seeded();
    const now = clock.now();
    await saveDuty(db, clock, {
      ...ctx,
      shifts: [{ userId: USER, fromMs: now, untilMs: now + 9 * HOUR }],
      eligible: new Set([USER]),
    });
    await saveDuty(db, clock, { ...ctx, shifts: [], eligible: new Set([USER]) });
    expect((await dutyList(db, HOUSEHOLD)).shifts).toEqual([]);
  });

  it('refuses a list the server would refuse, and writes nothing', async () => {
    const { db, clock } = await seeded();
    const now = clock.now();
    await expect(
      saveDuty(db, clock, {
        ...ctx,
        shifts: [{ userId: SAM, fromMs: now, untilMs: now + HOUR }],
        eligible: new Set([USER]),
      }),
    ).rejects.toBeInstanceOf(DutyRefusedError);
    await expect(
      saveDuty(db, clock, {
        ...ctx,
        shifts: [{ userId: USER, fromMs: now, untilMs: now + 30 * HOUR }],
        eligible: new Set([USER]),
      }),
    ).rejects.toThrow(/tooLong/);
    expect((await dutyList(db, HOUSEHOLD)).shifts).toEqual([]);
    expect(await db.all('select * from outbox')).toHaveLength(0);
  });

  it('names the list it replaces, so the server can refuse a change made without seeing it (M1)', async () => {
    const { db, clock } = await seeded();
    const now = clock.now();
    const eligible = new Set([USER]);
    await saveDuty(db, clock, {
      ...ctx,
      shifts: [{ userId: USER, fromMs: now, untilMs: now + 9 * HOUR }],
      eligible,
    });
    const first = await dutyList(db, HOUSEHOLD);
    expect(first.meta).toMatchObject({ by: USER, base: null, was: [] });
    await saveDuty(db, clock, { ...ctx, shifts: [], eligible, replacing: first });
    const second = await dutyList(db, HOUSEHOLD);
    expect(second.meta.base).toBe(first.meta.rev);
    expect(second.meta.rev).not.toBe(first.meta.rev);
    // the night it ended rides along, so this phone keeps covering until the others catch up
    expect(second.meta.was).toEqual(first.shifts);
    expect(await lastDutyWrite(db, HOUSEHOLD)).toMatchObject({
      rev: second.meta.rev,
      base: first.meta.rev,
      state: 'PENDING',
    });
  });

  it('refuses a shift past the end of a temporary seat (H4)', async () => {
    const { db, clock } = await seeded();
    const now = clock.now();
    await expect(
      saveDuty(db, clock, {
        ...ctx,
        shifts: [{ userId: SAM, fromMs: now, untilMs: now + 9 * HOUR }],
        eligible: new Set([SAM]),
        seatEnds: new Map([[SAM, now + 2 * HOUR]]),
      }),
    ).rejects.toThrow(/pastAccess/);
  });

  it('confirms the list it holds without changing it — the same arrangement, one more phone', async () => {
    const { db, clock } = await seeded();
    const now = clock.now();
    const night: DutyShift[] = [{ userId: USER, fromMs: now, untilMs: now + 9 * HOUR }];
    const theirs = newDutyList(night, { rev: 'rev-sam', by: SAM, atMs: now, replacing: null });
    await db.run(
      'insert into household_duty (household_id, shifts, updated_by, updated_at) values (?, ?, ?, ?)',
      [HOUSEHOLD, JSON.stringify(dutyListToWire(theirs)), SAM, clock.iso()],
    );
    const held = await dutyList(db, HOUSEHOLD);
    expect(held.meta.by).toBe(SAM);
    const out = await confirmDuty(db, clock, { ...ctx, list: held });
    expect(out?.committed).toBe(true);
    const after = await dutyList(db, HOUSEHOLD);
    expect(after.shifts).toEqual(night);
    expect(after.meta.rev).toBe('rev-sam');
    expect(Object.keys(after.meta.seen).sort()).toEqual([SAM, USER].sort());
    // who set it is still who set it
    const row = await db.get<{ updated_by: string }>(
      'select updated_by from household_duty where household_id = ?',
      [HOUSEHOLD],
    );
    expect(row?.updated_by).toBe(SAM);
    // and a list from before 0115 has nothing to confirm
    expect(
      await confirmDuty(db, clock, {
        ...ctx,
        list: { shifts: night, meta: { ...held.meta, rev: null } },
      }),
    ).toBeNull();
  });

  /**
   * L2: a pull that lands before a queued change is sent used to put the server's older list back
   * in charge of this phone's reminders. The reader now prefers the change this phone still owes.
   */
  it('keeps acting on a change it has not sent yet, whatever a pull wrote over the row', async () => {
    const { db, clock } = await seeded();
    const now = clock.now();
    const mine: DutyShift[] = [{ userId: USER, fromMs: now, untilMs: now + 9 * HOUR }];
    await saveDuty(db, clock, { ...ctx, shifts: mine, eligible: new Set([USER]) });
    // a pull lands first and writes the server's older answer — nobody on — over the row
    await db.run('update household_duty set shifts = ? where household_id = ?', ['[]', HOUSEHOLD]);
    expect((await dutyList(db, HOUSEHOLD)).shifts).toEqual(mine);
    // once the server has answered for it, the row is the truth again
    await db.run(`update outbox set state = 'SYNCED'`);
    expect((await dutyList(db, HOUSEHOLD)).shifts).toEqual([]);
    // and a change the server REFUSED never overrides the row
    await db.run(`update outbox set state = 'FAILED'`);
    expect((await dutyList(db, HOUSEHOLD)).shifts).toEqual([]);
  });

  it('reads the day’s entries with who logged them, when, and whether the server has them yet', async () => {
    const { db, clock } = await seeded();
    const at = clock.iso();
    await db.run(
      `insert into activities (id, client_op_id, household_id, type, start_at, created_by, created_at, updated_at, local_synced)
       values (?, ?, ?, 'bottle', ?, ?, ?, ?, 0)`,
      [
        'abababab-0000-4000-8000-0000000000f1',
        'abababab-0000-4000-8000-0000000000f2',
        HOUSEHOLD,
        at,
        USER,
        at,
        at,
      ],
    );
    const rows = await dutyEntries(db, HOUSEHOLD, new Date(clock.now() - HOUR).toISOString());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'bottle', created_by: USER, local_synced: 0 });
  });

  it('leaves a bottle of water out: it moves no feeding slot, so it anchors none (M7)', async () => {
    const { db, clock } = await seeded();
    const at = clock.iso();
    const bottle = async (id: string, kind: string) => {
      await db.run(
        `insert into activities (id, client_op_id, household_id, type, start_at, created_by, created_at, updated_at, local_synced)
         values (?, ?, ?, 'bottle', ?, ?, ?, ?, 0)`,
        [id, id, HOUSEHOLD, at, SAM, at, at],
      );
      await db.run(
        'insert into bottle_details (activity_id, kind, consumed_ml) values (?, ?, 60)',
        [id, kind],
      );
    };
    await bottle('abababab-0000-4000-8000-0000000000f3', 'FORMULA');
    await bottle('abababab-0000-4000-8000-0000000000f4', 'WATER');
    const rows = await dutyEntries(db, HOUSEHOLD, new Date(clock.now() - HOUR).toISOString());
    expect(rows.map(r => r.id)).toEqual(['abababab-0000-4000-8000-0000000000f3']);
  });

  it('reads the household’s people with their names and roles — leavers left out', async () => {
    const { db, clock } = await seeded();
    const at = clock.iso();
    const member = (userId: string, role: string, removedAt: string | null = null) =>
      db.run(
        `insert into household_members (household_id, user_id, role, joined_at, removed_at, updated_at)
         values (?, ?, ?, ?, ?, ?)`,
        [HOUSEHOLD, userId, role, at, removedAt, at],
      );
    await member(USER, 'OWNER');
    await member(SAM, 'PARENT');
    await member('abababab-0000-4000-8000-0000000000d2', 'CAREGIVER', at);
    await db.run(
      'insert into profiles (id, display_name, email, created_at, updated_at) values (?, ?, ?, ?, ?)',
      [SAM, 'Sam', 'sam@example.com', at, at],
    );
    const people = await dutyPeople(db, HOUSEHOLD);
    // in the order they joined — the same instant here, so by id; the hook puts the viewer first
    expect(Object.fromEntries(people.map(p => [p.id, p.role]))).toEqual({
      [USER]: 'OWNER',
      [SAM]: 'PARENT',
    });
    expect(people.find(p => p.id === SAM)?.name).toBe('Sam');
    // and when a temporary seat ends — null for a permanent member (H4)
    await db.run('update household_members set expires_at = ? where user_id = ?', [at, SAM]);
    const again = await dutyPeople(db, HOUSEHOLD);
    expect(again.find(p => p.id === SAM)?.expires_at).toBe(at);
    expect(again.find(p => p.id === USER)?.expires_at).toBeNull();
  });
});
