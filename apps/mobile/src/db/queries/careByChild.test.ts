/**
 * THE MEDICINE COUNT, BABY BY BABY (the audits of 2026-09-24: solids H4, H5, H6; handoff M8).
 *
 * With twins on "Both" the one count added the babies together against one baby's plan — "2 of 1
 * today" — and the medicine sheet's rows followed the top bar's chip rather than the child the
 * save was for. The query now keeps each baby's count; the rows and Today read it.
 */
import { careCountForAll, careDay, careDayLine } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { logCareItems, saveCareItem } from '../../data/care';
import { CHILD_A, CHILD_B, HOUSEHOLD, USER, seedHousehold } from '../../testing/fixtures';
import { careActivityFor } from './care';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const ctx = { householdId: HOUSEHOLD, createdBy: USER, deviceId: null, source: 'sheet' as const };
const DAY_START = '2026-09-14T07:00:00.000Z';
const DAY_END = '2026-09-15T07:00:00.000Z';

async function vitaminFor(childIds: string[], startAt: string) {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  const item = await saveCareItem(f.db, f.clock, {
    ...ctx,
    name: 'Drops',
    kind: 'VITAMIN',
    usualAmount: 'as told',
    route: 'MOUTH',
    note: null,
    reminders: [{ id: 'ffffffff-0000-4000-8000-0000000000a1', atLocalTime: '09:00' }],
  });
  await logCareItems(f.db, f.clock, {
    ...ctx,
    childIds,
    startAt,
    entries: [{ itemId: item.itemId, name: 'Drops', route: 'MOUTH', amountText: 'as told' }],
  });
  return { ...f, itemId: item.itemId };
}

describe('careActivityFor — each baby’s own day', () => {
  it('counts each twin separately, and never adds them against one baby’s plan', async () => {
    const f = await vitaminFor([CHILD_A, CHILD_B], '2026-09-14T16:00:00.000Z');
    const both = await careActivityFor(f.db, HOUSEHOLD, [CHILD_A, CHILD_B], DAY_START, DAY_END);
    const day = both.get(f.itemId);
    expect(day?.todayByChild.get(CHILD_A)).toBe(1);
    expect(day?.todayByChild.get(CHILD_B)).toBe(1);
    // the one number the old read gave: the pair added together — "2 of 1"
    const summed = await careActivityFor(f.db, HOUSEHOLD, null, DAY_START, DAY_END);
    expect(summed.get(f.itemId)?.today).toBe(2);
    // read per baby, each against the plan: 2 of 2, or 1 of 1 for the pair
    const perChild = [CHILD_A, CHILD_B].map(id => day?.todayByChild.get(id) ?? 0);
    expect(careDayLine(careDay([{ reminders: 1, today: 2, perChild }]))).toBe('2 of 2');
    expect(careCountForAll(perChild)).toBe(1);
  });

  it('says a baby who has had nothing has had nothing, whoever else has', async () => {
    const f = await vitaminFor([CHILD_A], '2026-09-14T16:00:00.000Z');
    const both = await careActivityFor(f.db, HOUSEHOLD, [CHILD_A, CHILD_B], DAY_START, DAY_END);
    const day = both.get(f.itemId);
    expect(day?.todayByChild.get(CHILD_A)).toBe(1);
    expect(day?.todayByChild.get(CHILD_B)).toBe(0);
    expect(day?.lastChildId).toBe(CHILD_A);
    // the Logging-for child's own read: Liam's row knows nothing of Ada's dose
    const liam = await careActivityFor(f.db, HOUSEHOLD, [CHILD_B], DAY_START, DAY_END);
    expect(liam.get(f.itemId)).toBeUndefined();
    const ada = await careActivityFor(f.db, HOUSEHOLD, [CHILD_A], DAY_START, DAY_END);
    expect(ada.get(f.itemId)?.today).toBe(1);
  });

  it('keeps yesterday out of today, by the bounds it is given', async () => {
    const f = await vitaminFor([CHILD_A], '2026-09-13T16:00:00.000Z');
    const day = (await careActivityFor(f.db, HOUSEHOLD, [CHILD_A], DAY_START, DAY_END)).get(
      f.itemId,
    );
    expect(day?.today).toBe(0);
    expect(day?.lastAt).toBe('2026-09-13T16:00:00.000Z');
  });
});

// (CuddleCue's `sheets/care/useCareItems.ts` source checks are not here: NibbleCue has no care list.)
