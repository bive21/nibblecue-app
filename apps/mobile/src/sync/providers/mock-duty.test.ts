/**
 * The fake server's `household_duty` branch, held to what Postgres does in 0113
 * (packages/db/src/integration/sync-duty.test.ts): one row per household, replaced whole; anyone
 * who logs may write it and a view-only member may not; a list the rules refuse is refused; and a
 * `full` page that is empty for a household that never used it.
 */
import type { PushOp } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { MockSyncApi, MockSyncServer } from './mock';

const HH = 'aaaaaaaa-0000-4000-8000-000000000001';
const OTHER = 'aaaaaaaa-0000-4000-8000-000000000002';
const OWNER = 'bbbbbbbb-0000-4000-8000-000000000001';
const CARER = 'bbbbbbbb-0000-4000-8000-000000000002';
const VIEWER = 'bbbbbbbb-0000-4000-8000-000000000003';
const NOW = Date.parse('2026-09-23T22:00:00.000Z');
const HOUR = 3_600_000;
let n = 0;
const uuid = () => `eeeeeeee-0000-4000-8000-${String(++n).padStart(12, '0')}`;

function server() {
  const s = new MockSyncServer({ now: () => NOW });
  s.addMember({ household_id: HH, user_id: OWNER, role: 'OWNER' });
  s.addMember({ household_id: HH, user_id: CARER, role: 'CAREGIVER' });
  s.addMember({ household_id: HH, user_id: VIEWER, role: 'VIEW_ONLY' });
  s.addMember({ household_id: OTHER, user_id: OWNER, role: 'OWNER' });
  return s;
}

const shift = (user: string, fromMs: number, untilMs: number) => ({
  user_id: user,
  from: new Date(fromMs).toISOString(),
  until: new Date(untilMs).toISOString(),
});

const dutyOp = (shifts: unknown[], household = HH): PushOp => ({
  client_op_id: uuid(),
  entity: 'settings',
  op: 'UPDATE',
  entity_id: uuid(),
  household_id: household,
  payload: { table: 'household_duty', shifts, client_edited_at: '2026-09-23T21:59:00.000Z' },
});

describe('the fake server: who’s on (0113)', () => {
  it('stores one row per household, replaced whole — and ending is an empty list', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    const night = dutyOp([shift(CARER, NOW, NOW + 9 * HOUR)]);
    expect((await owner.push([night])).results[0]).toMatchObject({ status: 'applied' });
    const mine = dutyOp([shift(OWNER, NOW, NOW + 9 * HOUR)]);
    expect((await owner.push([mine])).results[0]).toMatchObject({ status: 'applied' });
    expect(s.household_duty).toHaveLength(1);
    expect(s.household_duty[0]).toMatchObject({ household_id: HH, updated_by: OWNER });
    expect((s.household_duty[0]?.['shifts'] as { user_id: string }[])[0]?.user_id).toBe(OWNER);

    expect((await owner.push([dutyOp([])])).results[0]).toMatchObject({ status: 'applied' });
    expect(s.household_duty[0]?.['shifts']).toEqual([]);
  });

  it('lets a caregiver put themselves on, and refuses a view-only member', async () => {
    const s = server();
    const carer = new MockSyncApi(s, CARER);
    expect(
      (await carer.push([dutyOp([shift(CARER, NOW, NOW + 8 * HOUR)])])).results[0],
    ).toMatchObject({ status: 'applied' });
    const viewer = new MockSyncApi(s, VIEWER);
    expect(
      (await viewer.push([dutyOp([shift(VIEWER, NOW, NOW + HOUR)])])).results[0],
    ).toMatchObject({ status: 'rejected', error: { code: 'FORBIDDEN' } });
  });

  it('refuses a list the rules refuse: someone who cannot be on, a gap, a forgotten shift', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    for (const shifts of [
      [shift(VIEWER, NOW, NOW + HOUR)],
      [shift(OWNER, NOW, NOW + HOUR), shift(CARER, NOW + 2 * HOUR, NOW + 3 * HOUR)],
      [shift(OWNER, NOW, NOW + 25 * HOUR)],
      [{ user_id: OWNER, from: 'not a time', until: 'never' }],
    ]) {
      const res = await owner.push([dutyOp(shifts)]);
      expect(res.results[0]?.status).toBe('rejected');
    }
    expect(s.household_duty).toHaveLength(0);
  });

  it('is pulled `full`, and a household that never used it pulls an empty page', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([dutyOp([shift(OWNER, NOW, NOW + 9 * HOUR)])]);
    const pull = async (household: string) =>
      (
        await owner.pull({
          household_id: household,
          tables: [
            { name: 'household_duty', strategy: 'full', since: null, since_id: null, limit: 500 },
          ],
        })
      ).tables['household_duty'];
    expect((await pull(HH))?.rows).toHaveLength(1);
    expect((await pull(OTHER))?.rows).toEqual([]);
  });
});

/**
 * MIGRATION 0115, as the fake holds it — the same cases `packages/db/src/integration/
 * sync-duty.test.ts` holds Postgres to.
 */
describe('the fake server: the list’s record and the phones that confirm it (0115)', () => {
  const record = (m: {
    rev: string;
    by: string;
    base?: string | null;
    seen?: Record<string, string>;
  }) => ({
    meta: {
      rev: m.rev,
      base: m.base ?? null,
      by: m.by,
      at: new Date(NOW).toISOString(),
      was: [],
      seen: m.seen ?? { [m.by]: new Date(NOW).toISOString() },
    },
  });
  const metaOf = (s: MockSyncServer) =>
    ((s.household_duty[0]?.['shifts'] as unknown[]) ?? []).find(
      (e): e is { meta: { rev: string; seen: Record<string, string> } } =>
        typeof e === 'object' && e !== null && 'meta' in e,
    )?.meta;

  it('merges a confirmation — the caller’s own phone only — and changes nothing else', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    const night = shift(CARER, NOW, NOW + 8 * HOUR);
    await owner.push([dutyOp([night, record({ rev: 'r1', by: OWNER })])]);
    const carer = new MockSyncApi(s, CARER);
    const res = await carer.push([
      dutyOp([
        { ...night, until: new Date(NOW + 20 * HOUR).toISOString() },
        record({
          rev: 'r1',
          base: 'r1',
          by: OWNER,
          seen: { [CARER]: new Date(NOW).toISOString(), [VIEWER]: new Date(NOW).toISOString() },
        }),
      ]),
    ]);
    expect(res.results[0]).toMatchObject({ status: 'applied' });
    expect(Object.keys(metaOf(s)?.seen ?? {}).sort()).toEqual([CARER, OWNER].sort());
    expect((s.household_duty[0]?.['shifts'] as { until: string }[])[0]?.until).toBe(night.until);
    expect(s.household_duty[0]?.['updated_by']).toBe(OWNER);
  });

  it('answers — and does not store — a change made without seeing the one stored (M1)', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    await owner.push([
      dutyOp([shift(OWNER, NOW, NOW + 8 * HOUR), record({ rev: 'r1', by: OWNER })]),
    ]);
    const carer = new MockSyncApi(s, CARER);
    const late = await carer.push([
      dutyOp([shift(CARER, NOW, NOW + 8 * HOUR), record({ rev: 'r2', base: null, by: CARER })]),
    ]);
    expect(late.results[0]).toMatchObject({ status: 'applied' });
    expect(metaOf(s)?.rev).toBe('r1');
    const seen = await carer.push([
      dutyOp([shift(CARER, NOW, NOW + 8 * HOUR), record({ rev: 'r3', base: 'r1', by: CARER })]),
    ]);
    expect(seen.results[0]).toMatchObject({ status: 'applied' });
    expect(metaOf(s)?.rev).toBe('r3');
  });

  it('stores what is left of a list that ended while it was queued, and answers applied (D1)', async () => {
    const s = server();
    const owner = new MockSyncApi(s, OWNER);
    const res = await owner.push([
      dutyOp([shift(OWNER, NOW - 9 * HOUR, NOW - HOUR), record({ rev: 'r1', by: OWNER })]),
    ]);
    expect(res.results[0]).toMatchObject({ status: 'applied' });
    const kept = (s.household_duty[0]?.['shifts'] as object[]).filter(e => !('meta' in e));
    expect(kept).toEqual([]);
  });

  it('refuses a shift past the end of a seat (H4)', async () => {
    const s = new MockSyncServer({ now: () => NOW });
    s.addMember({ household_id: HH, user_id: OWNER, role: 'OWNER' });
    s.addMember({
      household_id: HH,
      user_id: CARER,
      role: 'CAREGIVER',
      expires_at: new Date(NOW + 2 * HOUR).toISOString(),
    });
    const owner = new MockSyncApi(s, OWNER);
    const res = await owner.push([dutyOp([shift(CARER, NOW, NOW + 8 * HOUR)])]);
    expect(res.results[0]).toMatchObject({ status: 'rejected' });
    expect(res.results[0]?.error?.message).toContain('pastAccess');
    const ok = await owner.push([dutyOp([shift(CARER, NOW, NOW + 2 * HOUR)])]);
    expect(ok.results[0]).toMatchObject({ status: 'applied' });
  });
});
