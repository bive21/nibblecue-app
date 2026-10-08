import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import type { TodayActivity } from '../today/rows';
import type { MealEntry } from '../solids/history';
import {
  DEFAULT_LOOK_BACK_HOURS,
  LOOK_BACK_HOURS,
  lookBackFor,
  type LookBackItem,
} from './lookBack';

const TZ = 'America/Los_Angeles';
/** Oct 7 and 8, 2026, in the household's zone. */
const at = (day: number, h: number, m = 0): number => zonedToUtc(TZ, 2026, 10, day, h, m);
const HOUR = 3_600_000;

let seq = 0;
const row = (over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>) => {
  seq += 1;
  return {
    id: `r${String(seq).padStart(3, '0')}`,
    childId: 'ada',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  } as TodayActivity;
};
const meal = (startMs: number, ...foods: string[]) =>
  row({
    type: 'solids',
    startMs,
    solidsItems: foods.map(name => ({ name, amount: null, unit: null, response: null })),
  });

/** The parent's own example: sweet potato at 7 PM, the note the next morning at 10. */
const NOTE = row({ type: 'wellbeing', startMs: at(8, 10), wellbeingSeen: ['RASH'] });
const SWEET_POTATO = meal(at(7, 19), 'Sweet potato', 'Banana');
const EARLIER_BANANA = meal(at(1, 12), 'Banana');
const BOTTLE = row({ type: 'bottle', startMs: at(8, 6), consumedMl: 120 });
const VITAMIN = row({ type: 'med', startMs: at(7, 9), medName: 'Vitamin D', medAmount: '1 ml' });
const NIGHT = row({ type: 'sleep', startMs: at(6, 20), endMs: at(7, 6), sleepKind: 'NIGHT' });
const DIAPER = row({ type: 'diaper', startMs: at(8, 7), diaperKind: 'DIRTY' });
const TEMP = row({ type: 'temp', startMs: at(8, 9, 30), tempCHundredths: 3720 });
const PUMP = row({ type: 'pump', startMs: at(8, 5), childId: null, totalMl: 150 });
const TWIN = row({ type: 'bottle', startMs: at(8, 6), childId: 'mia', consumedMl: 90 });
const AFTER = row({ type: 'bottle', startMs: at(8, 11), consumedMl: 100 });
const OLD = row({ type: 'bottle', startMs: at(5, 11), consumedMl: 100 });

const ROWS: TodayActivity[] = [
  NOTE,
  SWEET_POTATO,
  EARLIER_BANANA,
  BOTTLE,
  VITAMIN,
  NIGHT,
  DIAPER,
  TEMP,
  PUMP,
  TWIN,
  AFTER,
  OLD,
];
const mealsOf = (rows: readonly TodayActivity[]): MealEntry[] =>
  rows
    .filter(r => r.type === 'solids')
    .map(r => ({ id: r.id, childId: r.childId, atMs: r.startMs, items: r.solidsItems ?? [] }));

const ids = (items: readonly LookBackItem[]) => items.map(i => i.entry.id);
const back = (hours: (typeof LOOK_BACK_HOURS)[number], floorMs: number | null = null) =>
  lookBackFor({
    note: { id: NOTE.id, childId: NOTE.childId, startMs: NOTE.startMs },
    rows: ROWS,
    meals: mealsOf(ROWS),
    hours,
    floorMs,
  });

describe('logged before this: the window', () => {
  it('offers 24, 48 and 72 hours, and opens on 48', () => {
    expect([...LOOK_BACK_HOURS]).toEqual([24, 48, 72]);
    expect(DEFAULT_LOOK_BACK_HOURS).toBe(48);
  });

  it('ends at the note’s START, the time the parent gave, not when it was typed', () => {
    const b = back(48);
    expect(b.toMs).toBe(NOTE.startMs);
    expect(b.fromMs).toBe(NOTE.startMs - 48 * HOUR);
    // the bottle at 11 came after the rash began: not "before this"
    expect(ids(b.items)).not.toContain(AFTER.id);
  });

  it('holds what began in the window, and what ran into it', () => {
    // 24 h: from 10 AM on the 7th. The night that began on the 6th and ended at 6 AM on the 7th
    // is outside it; the vitamin at 9 AM on the 7th is outside it too
    expect(ids(back(24).items)).toEqual([SWEET_POTATO.id, BOTTLE.id, DIAPER.id, TEMP.id]);
    // 48 h: from 10 AM on the 6th, so the night (8 PM on the 6th) and the vitamin are in
    expect(ids(back(48).items)).toEqual([
      NIGHT.id,
      VITAMIN.id,
      SWEET_POTATO.id,
      BOTTLE.id,
      DIAPER.id,
      TEMP.id,
    ]);
    // 72 h reaches the 5th's bottle; the banana on the 1st stays out
    expect(ids(back(72).items)).toContain(OLD.id);
    expect(ids(back(72).items)).not.toContain(EARLIER_BANANA.id);
    // a stretch that began before the window and ended inside it is in it
    const sleep = row({ type: 'sleep', startMs: at(7, 8), endMs: at(7, 11) });
    const b = lookBackFor({
      note: { id: NOTE.id, childId: 'ada', startMs: NOTE.startMs },
      rows: [sleep],
      meals: [],
      hours: 24,
    });
    expect(ids(b.items)).toEqual([sleep.id]);
  });

  it('is in the order things happened, oldest first, and ranks nothing', () => {
    const b = back(72);
    const starts = b.items.map(i => i.entry.startMs);
    expect(starts).toEqual([...starts].sort((x, y) => x - y));
    // no score, no weight, no flag: each item is the entry and the foods first logged in it
    for (const item of b.items)
      expect(Object.keys(item).sort()).toEqual(['entry', 'firstTimeFoods']);
  });

  it('is the note’s baby’s log: not the note, not a twin, not a parent’s pumping', () => {
    const b = back(72);
    expect(ids(b.items)).not.toContain(NOTE.id);
    expect(ids(b.items)).not.toContain(TWIN.id);
    expect(ids(b.items)).not.toContain(PUMP.id);
    const hidden = row({ type: 'bottle', startMs: at(8, 8), isPrivate: true });
    const withPrivate = lookBackFor({
      note: { id: NOTE.id, childId: 'ada', startMs: NOTE.startMs },
      rows: [hidden],
      meals: [],
      hours: 48,
    });
    expect(withPrivate.items).toEqual([]);
  });

  it('includes another health note in the window, as the entry it is', () => {
    const earlier = row({ type: 'wellbeing', startMs: at(7, 20), wellbeingSeen: ['FUSSY'] });
    const b = lookBackFor({
      note: { id: NOTE.id, childId: 'ada', startMs: NOTE.startMs },
      rows: [...ROWS, earlier],
      meals: [],
      hours: 48,
    });
    expect(ids(b.items)).toContain(earlier.id);
  });

  it('stops at the plan’s floor and says so, keeping nothing from before it', () => {
    const floor = at(7, 12);
    const b = back(48, floor);
    expect(b.clipped).toBe(true);
    expect(b.fromMs).toBe(floor);
    expect(ids(b.items)).toEqual([SWEET_POTATO.id, BOTTLE.id, DIAPER.id, TEMP.id]);
    // a floor older than the window changes nothing
    expect(back(48, at(1, 0)).clipped).toBe(false);
    expect(back(48, null).clipped).toBe(false);
  });
});

describe('logged before this: first time logged', () => {
  it('marks a food whose first logged meal for this baby is in the window — and only that', () => {
    const b = back(48);
    const sp = b.items.find(i => i.entry.id === SWEET_POTATO.id);
    // sweet potato was never logged before; banana was, on the 1st
    expect(sp?.firstTimeFoods).toEqual(['Sweet potato']);
    for (const i of b.items) if (i.entry.type !== 'solids') expect(i.firstTimeFoods).toEqual([]);
  });

  it('marks the first meal of a food, not the second one in the same window', () => {
    const again = meal(at(7, 21), 'sweet potato');
    const b = lookBackFor({
      note: { id: NOTE.id, childId: 'ada', startMs: NOTE.startMs },
      rows: [SWEET_POTATO, again],
      meals: mealsOf([EARLIER_BANANA, SWEET_POTATO, again]),
      hours: 48,
    });
    expect(b.items.map(i => i.firstTimeFoods)).toEqual([['Sweet potato'], []]);
  });

  it('counts first time per baby: a twin’s earlier meal does not take it away', () => {
    const twinMeal = { ...meal(at(2, 12), 'Sweet potato'), childId: 'mia' };
    const b = lookBackFor({
      note: { id: NOTE.id, childId: 'ada', startMs: NOTE.startMs },
      rows: ROWS,
      meals: mealsOf([...ROWS, twinMeal]),
      hours: 48,
    });
    expect(b.items.find(i => i.entry.id === SWEET_POTATO.id)?.firstTimeFoods).toEqual([
      'Sweet potato',
    ]);
  });

  it('reads the window’s own meals when the history handed in is missing them', () => {
    const b = lookBackFor({
      note: { id: NOTE.id, childId: 'ada', startMs: NOTE.startMs },
      rows: ROWS,
      meals: [],
      hours: 48,
    });
    // without the history the banana on the 1st is unknown, so both read as first in the window:
    // the history is what makes "first" mean first ever, which is why callers hand it in
    expect(b.items.find(i => i.entry.id === SWEET_POTATO.id)?.firstTimeFoods).toEqual([
      'Sweet potato',
      'Banana',
    ]);
  });
});
