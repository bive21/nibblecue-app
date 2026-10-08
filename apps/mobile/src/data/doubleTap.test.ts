/**
 * `@AT-17` — the double tap, end to end through the real write path (WP4 D4, D25).
 *
 * `packages/core`'s `dedupe.test.ts` proves the window arithmetic. This proves the thing the
 * arithmetic is for: that a second tap inside the window produces NO row, NO outbox op and —
 * the part only suppress-before-mint can give — **no `client_op_id` at all**, while a tap
 * outside it produces a second entry, and two babies 3 s apart produce two.
 *
 * The plan's row: taps at 100/200/399/3499 ms each give 1 outbox row and the second mints no
 * `client_op_id`; 3501 ms and 6 s give 2 rows; two children 3 s apart give 2 rows.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { CHILD_A, CHILD_B, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { logActivity } from './activities';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

const countOps = async (db: Db): Promise<number> =>
  (await db.get<{ n: number }>('select count(*) as n from outbox', []))?.n ?? 0;

const countRows = async (db: Db): Promise<number> =>
  (await db.get<{ n: number }>('select count(*) as n from activities', []))?.n ?? 0;

const wetDiaper = (childId: string) =>
  ({
    householdId: HOUSEHOLD,
    createdBy: USER,
    deviceId: null,
    source: 'today',
    childId,
    type: 'diaper',
    detail: { kind: 'WET' },
  }) as const;

describe('@AT-17 the duplicate guard, through the repository', () => {
  for (const gap of [100, 200, 399, 3499]) {
    it(`two taps ${gap} ms apart give one entry and one op, and mint one id`, async () => {
      const { db, clock } = await fixture();
      const first = await logActivity(db, clock, { ...wetDiaper(CHILD_A), startAt: clock.iso() });
      clock.advance(gap);
      const second = await logActivity(db, clock, { ...wetDiaper(CHILD_A), startAt: clock.iso() });

      expect(first.committed).toBe(true);
      expect(second.suppressed).toBe(true);
      // the whole point of D25: the second tap never minted an operation id
      expect(second.opIds).toEqual([]);
      expect(second.entityIds).toEqual([]);
      expect(await countRows(db)).toBe(1);
      expect(await countOps(db)).toBe(1);
    });
  }

  for (const gap of [3501, 6000]) {
    it(`two taps ${gap} ms apart are two deliberate entries`, async () => {
      const { db, clock } = await fixture();
      await logActivity(db, clock, { ...wetDiaper(CHILD_A), startAt: clock.iso() });
      clock.advance(gap);
      const second = await logActivity(db, clock, { ...wetDiaper(CHILD_A), startAt: clock.iso() });

      expect(second.committed).toBe(true);
      expect(await countRows(db)).toBe(2);
      expect(await countOps(db)).toBe(2);
    });
  }

  it('two children three seconds apart are two entries, not a double tap', async () => {
    const { db, clock } = await fixture();
    await logActivity(db, clock, { ...wetDiaper(CHILD_A), startAt: clock.iso() });
    clock.advance(3000);
    const liam = await logActivity(db, clock, { ...wetDiaper(CHILD_B), startAt: clock.iso() });

    expect(liam.committed).toBe(true);
    expect(await countRows(db)).toBe(2);
    const children = await db.all<{ child_id: string }>(
      'select child_id from activities order by child_id',
      [],
    );
    expect(children.map(c => c.child_id)).toEqual([CHILD_A, CHILD_B]);
  });

  it('a different salient value inside the window is a different event', async () => {
    const { db, clock } = await fixture();
    await logActivity(db, clock, { ...wetDiaper(CHILD_A), startAt: clock.iso() });
    clock.advance(200);
    const dirty = await logActivity(db, clock, {
      ...wetDiaper(CHILD_A),
      startAt: clock.iso(),
      detail: { kind: 'DIRTY' },
    });
    expect(dirty.committed).toBe(true);
    expect(await countRows(db)).toBe(2);
  });

  it('a suppressed tap does not extend the window', async () => {
    const { db, clock } = await fixture();
    await logActivity(db, clock, { ...wetDiaper(CHILD_A), startAt: clock.iso() });
    // a parent holding the button down: three suppressed taps, none of which move the clock
    for (const step of [500, 1000, 1500]) {
      clock.advance(step - (clock.now() % 1));
      await logActivity(db, clock, { ...wetDiaper(CHILD_A), startAt: clock.iso() });
    }
    // 3500 ms after the ACCEPTED tap, not after the last suppressed one
    const advanced = 500 + 1000 + 1500;
    clock.advance(3500 - advanced);
    const next = await logActivity(db, clock, { ...wetDiaper(CHILD_A), startAt: clock.iso() });
    expect(next.committed).toBe(true);
    expect(await countRows(db)).toBe(2);
  });
});
