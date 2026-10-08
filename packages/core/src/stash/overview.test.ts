/**
 * The overview's arithmetic, at its boundaries — because that is where all of it lives. Every
 * case below is a line a parent would read as wrong: a bag eleven hours away called "In 11 h"
 * when they cannot use it tonight, a freezer day whose bags each repeat the same best-use date,
 * a "show 26 more" that hides 27, or "1 days".
 */
import { describe, expect, it } from 'vitest';
import {
  AUTO_EXPAND_MAX_ITEMS,
  byLocationOrder,
  countdownLabel,
  DAY_GROUPS_OPEN,
  DAY_GROUPS_PER_PAGE,
  formatWindow,
  groupByStoredDay,
  isDueWithin24h,
  isPastWindow,
  locationRank,
  nearestBestUse,
  page,
  sevenDayNet,
  storedAtMs,
  type DayGroup,
} from './overview';

const TZ = 'America/New_York';
/** Friday 2026-09-18, 09:40 local. */
const NOW = Date.parse('2026-09-18T13:40:00.000Z');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe('locations read warm to cool', () => {
  it('is the order a stash has to be used in', () => {
    expect(locationRank('ROOM')).toBeLessThan(locationRank('FRIDGE'));
    expect(locationRank('FRIDGE')).toBeLessThan(locationRank('FREEZER'));
    expect(locationRank('FREEZER')).toBeLessThan(locationRank('DEEP_FREEZER'));
    // thawing is on its way OUT of the stash, so it sits after the places milk is kept
    expect(locationRank('DEEP_FREEZER')).toBeLessThan(locationRank('THAWED'));
    // and a kind this list never anticipated lands after all of them rather than first
    expect(locationRank(null)).toBeGreaterThan(locationRank('THAWED'));
  });

  it('keeps the household’s own arrangement inside a kind', () => {
    const l = (kind: 'FREEZER' | 'FRIDGE', sort_order: number) => ({ kind, sort_order });
    expect([l('FREEZER', 1), l('FRIDGE', 9), l('FREEZER', 0)].sort(byLocationOrder)).toEqual([
      l('FRIDGE', 9),
      l('FREEZER', 0),
      l('FREEZER', 1),
    ]);
  });
});

describe('the countdown chip', () => {
  const at = (ms: number) => countdownLabel(ms, NOW, TZ);

  it('says past window, and only for milk that is actually past it', () => {
    expect(at(NOW - 1)).toEqual({ tone: 'past', label: 'Past window', due: true });
    expect(at(NOW + 1)?.tone).not.toBe('past');
    expect(isPastWindow(NOW - 1, NOW)).toBe(true);
    expect(isPastWindow(NOW + 1, NOW)).toBe(false);
    expect(isPastWindow(null, NOW)).toBe(false);
  });

  it('counts the hours under twelve, because that is something you act on now', () => {
    expect(at(NOW + 3 * HOUR)).toEqual({ tone: 'soon', label: 'In 3 h', due: true });
    // rounded UP: half an hour left is "In 1 h", never "In 0 h"
    expect(at(NOW + 30 * 60_000)?.label).toBe('In 1 h');
    expect(at(NOW + 11.5 * HOUR)?.label).toBe('In 12 h');
  });

  /**
   * THE 24-HOUR BOUNDARY IS A CALENDAR, NOT A SUBTRACTION. 09:40 on Friday plus thirteen hours
   * is 22:40 the same evening — `Today`. Plus twenty hours is 05:40 on Saturday, which is
   * `Tomorrow` although it is inside the day, and that is the point: a parent reads it off a
   * calendar, and "In 20 h" describes a bag they cannot use tonight.
   */
  it('splits today from tomorrow on the local day, not on the clock', () => {
    expect(at(NOW + 13 * HOUR)).toEqual({ tone: 'soon', label: 'Today', due: true });
    expect(at(NOW + 20 * HOUR)).toEqual({ tone: 'soon', label: 'Tomorrow', due: true });
    // still tomorrow past the 24-hour mark, but no longer "due" for §3's amber tile
    expect(at(NOW + 30 * HOUR)).toEqual({ tone: 'soon', label: 'Tomorrow', due: false });
    expect(isDueWithin24h(NOW + 20 * HOUR, NOW)).toBe(true);
    expect(isDueWithin24h(NOW + 30 * HOUR, NOW)).toBe(false);
  });

  it('counts days from two to thirteen, then gives the date instead', () => {
    expect(at(NOW + 2 * DAY)).toEqual({ tone: 'plain', label: 'In 2 days', due: false });
    expect(at(NOW + 6 * DAY)?.label).toBe('In 6 days');
    expect(at(NOW + 13 * DAY)?.label).toBe('In 13 days');
    // fourteen days out the count stops meaning anything: "In 183 days" is not a fact anybody uses
    expect(at(NOW + 14 * DAY)?.label).toBe('Best use Oct 2');
    expect(at(NOW + 181 * DAY)?.label).toBe('Best use Mar 18');
  });

  it('says nothing at all when there is no date, rather than guessing one', () => {
    expect(countdownLabel(null, NOW, TZ)).toBeNull();
  });
});

describe('use first', () => {
  const item = (id: string, bestUseAt: number | null) => ({ id, bestUseAt });

  it('is the nearest the end of its window, with past-window milk first', () => {
    const items = [
      item('later', NOW + 5 * DAY),
      item('past', NOW - 2 * HOUR),
      item('soon', NOW + 6 * HOUR),
    ];
    expect(nearestBestUse(items, 3).map(i => i.id)).toEqual(['past', 'soon', 'later']);
  });

  /**
   * A DATE THE APP DOES NOT HAVE IS NOT AN URGENT ONE. A frozen bag with no freeze date has no
   * best-use date either (`guidance.ts` reports `MISSING_FREEZE_DATE`), and sorting it to the
   * head of a list called "use first" would be the app inventing the very number it is telling
   * the parent it is missing.
   */
  it('sorts a container with no date last, never first', () => {
    const items = [item('unknown', null), item('past', NOW - HOUR)];
    expect(nearestBestUse(items, 2).map(i => i.id)).toEqual(['past', 'unknown']);
  });

  it('takes n, and copes with nonsense', () => {
    const items = [item('a', 1), item('b', 2)];
    expect(nearestBestUse(items, 1).map(i => i.id)).toEqual(['a']);
    expect(nearestBestUse(items, 0)).toEqual([]);
    expect(nearestBestUse(items, -1)).toEqual([]);
    expect(nearestBestUse([], 3)).toEqual([]);
    // and never reorders the caller's array
    expect(items.map(i => i.id)).toEqual(['a', 'b']);
  });
});

describe('which day a container was stored on', () => {
  it('dates frozen milk from the freeze and everything else from the pump', () => {
    expect(storedAtMs('FREEZER', 100, 900)).toBe(900);
    expect(storedAtMs('DEEP_FREEZER', 100, 900)).toBe(900);
    expect(storedAtMs('FRIDGE', 100, 900)).toBe(100);
    expect(storedAtMs('ROOM', 100, null)).toBe(100);
    // a frozen bag with no freeze date still lands in a day rather than in a group of its own
    expect(storedAtMs('FREEZER', 100, null)).toBe(100);
    expect(storedAtMs(null, 100, 900)).toBe(100);
  });
});

describe('grouping by stored day', () => {
  const bag = (storedAtMs: number, amountMl: number, bestUseAt: number | null = null) => ({
    storedAtMs,
    amountMl,
    bestUseAt,
  });
  /** 2026-09-18 in New York: 04:00Z is midnight local, 03:59Z is the day before. */
  const localMidnight = Date.parse('2026-09-18T04:00:00.000Z');

  it('splits on the household’s own midnight, not on a 24-hour bucket', () => {
    const groups = groupByStoredDay(
      [bag(localMidnight - 60_000, 120), bag(localMidnight + 60_000, 120)],
      TZ,
    );
    expect(groups).toHaveLength(2);
    expect(groups.map(g => g.key)).toEqual(['2026-09-18', '2026-09-17']);
  });

  it('adds a day up and keeps its items in the order the sort asks for', () => {
    const groups = groupByStoredDay(
      [bag(localMidnight + 5 * HOUR, 120), bag(localMidnight + HOUR, 90), bag(localMidnight, 30)],
      TZ,
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.totalMl).toBe(240);
    expect(groups[0]?.items.map(i => i.amountMl)).toEqual([120, 90, 30]);
    const oldest = groupByStoredDay(
      [bag(localMidnight + 5 * HOUR, 120), bag(localMidnight, 30)],
      TZ,
      'oldest',
    );
    expect(oldest[0]?.items.map(i => i.amountMl)).toEqual([30, 120]);
  });

  it('orders the groups newest or oldest first, as asked', () => {
    const items = [
      bag(localMidnight, 30),
      bag(localMidnight - DAY, 30),
      bag(localMidnight + DAY, 30),
    ];
    expect(groupByStoredDay(items, TZ, 'newest').map(g => g.key)).toEqual([
      '2026-09-19',
      '2026-09-18',
      '2026-09-17',
    ]);
    expect(groupByStoredDay(items, TZ, 'oldest').map(g => g.key)).toEqual([
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
    ]);
  });

  /**
   * THE GROUP CARRIES THE BEST-USE DATE AND THE ROWS DO NOT (§5b). Every bag frozen on one day
   * shares one date, so printing it on each row is the same sentence three times; taking the
   * EARLIEST rather than the first means a group of mixed anchors still reports the date a
   * parent has to act on soonest.
   */
  it('takes the group’s earliest best-use, and null when nothing in it has one', () => {
    const groups = groupByStoredDay(
      [
        bag(localMidnight + HOUR, 120, NOW + 10 * DAY),
        bag(localMidnight + 2 * HOUR, 120, NOW + 4 * DAY),
      ],
      TZ,
    );
    expect(groups[0]?.bestUseAt).toBe(NOW + 4 * DAY);
    expect(groupByStoredDay([bag(localMidnight, 120, null)], TZ)[0]?.bestUseAt).toBeNull();
  });

  it('is empty for an empty stash', () => {
    expect(groupByStoredDay([], TZ)).toEqual([]);
  });
});

describe('show more', () => {
  const group = (key: string, items: number, bestUseAt: number | null): DayGroup<unknown> => ({
    key,
    dayStartMs: 0,
    items: new Array(items).fill(null),
    totalMl: 0,
    bestUseAt,
  });

  /**
   * THE BUTTON COUNTS BAGS, which is the number a parent can check by opening it. Four groups
   * are shown and the three behind them hold 26 bags between them — "Show 26 more bags", never
   * "show 3 more groups", and never a count that includes what is already on screen.
   */
  it('counts what is hidden in bags, not in groups', () => {
    const groups = [
      group('a', 3, NOW + 180 * DAY),
      group('b', 2, NOW + 179 * DAY),
      group('c', 4, NOW + 170 * DAY),
      group('d', 3, NOW + 160 * DAY),
      group('e', 12, NOW + 150 * DAY),
      group('f', 10, NOW + 140 * DAY),
      group('g', 4, NOW + 130 * DAY),
    ];
    const first = page(groups, DAY_GROUPS_PER_PAGE, g => g.items.length);
    expect(first.shown).toHaveLength(4);
    expect(first.hiddenItems).toBe(26);
    // and the line under the button names the date everything hidden is good through
    expect(first.hiddenBestUseAt).toBe(NOW + 130 * DAY);
  });

  it('hides nothing when everything fits, and says so', () => {
    const groups = [group('a', 3, NOW), group('b', 2, NOW)];
    const p = page(groups, DAY_GROUPS_PER_PAGE, g => g.items.length);
    expect(p.hidden).toEqual([]);
    expect(p.hiddenItems).toBe(0);
    expect(p.hiddenBestUseAt).toBeNull();
  });

  it('pages a flat list of rows by their own best-use dates', () => {
    const rows = Array.from({ length: 23 }, (_, i) => ({ id: i, bestUseAt: NOW + i * DAY }));
    const p = page(rows, 10);
    expect(p.shown).toHaveLength(10);
    expect(p.hiddenItems).toBe(13);
    expect(p.hiddenBestUseAt).toBe(NOW + 10 * DAY);
  });

  it('never takes a negative page, and the two defaults are what §5 asks for', () => {
    expect(page([1, 2, 3], -1, () => 1).shown).toEqual([]);
    expect(DAY_GROUPS_OPEN).toBeLessThan(DAY_GROUPS_PER_PAGE);
    expect(AUTO_EXPAND_MAX_ITEMS).toBe(2);
  });
});

describe('a published window in words', () => {
  /** The CDC profile's own minutes (`milk-guidance.cdc_us.2026_01.json`). */
  it('writes the four the grid shows, the way they would be said aloud', () => {
    expect(formatWindow(240)).toBe('4 hours');
    expect(formatWindow(5760)).toBe('4 days');
    expect(formatWindow(1440)).toBe('1 day');
    expect(formatWindow(263_520)).toBe('6 months');
  });

  it('never says “1 days”, and never abbreviates', () => {
    expect(formatWindow(60)).toBe('1 hour');
    expect(formatWindow(1440)).toBe('1 day');
    expect(formatWindow(43_200)).toBe('1 month');
    expect(formatWindow(525_600)).toBe('1 year');
    for (const m of [60, 240, 1440, 5760, 43_200, 263_520, 525_600]) {
      expect(formatWindow(m), String(m)).not.toMatch(/\b\d+\s?[hdmy]\b/);
      expect(formatWindow(m), String(m)).not.toMatch(/\b1 \w+s\b/);
    }
  });

  it('says nothing rather than something wrong for a window that is not one', () => {
    expect(formatWindow(0)).toBe('—');
    expect(formatWindow(-5)).toBe('—');
    expect(formatWindow(Number.NaN)).toBe('—');
  });
});

describe('the two tiles', () => {
  it('nets seven days of the household’s own ledger', () => {
    expect(sevenDayNet({ pumpedMl: 460, usedMl: 160, discardedMl: 0 })).toEqual({
      pumpedMl: 460,
      usedMl: 160,
      discardedMl: 0,
      netMl: 300,
    });
    // a week where more went out than came in reads negative rather than clamping to zero
    expect(sevenDayNet({ pumpedMl: 100, usedMl: 250, discardedMl: 60 }).netMl).toBe(-210);
  });

  it('is the net of the three flows it is drawn with, and carries no correction (2026-09-27)', () => {
    // the legend is pumped, used and tossed, and the net beside it is exactly those three
    const week = sevenDayNet({ pumpedMl: 300, usedMl: 100, discardedMl: 20 });
    expect(week.netMl).toBe(week.pumpedMl - week.usedMl - week.discardedMl);
    expect(week).not.toHaveProperty('correctedMl');
    // a synced pump taken back with Undo is out before it gets here (`withoutUndone`), so the
    // tile reads nothing pumped and 0 net — not "148 pumped" beside a correction of −148
    expect(sevenDayNet({ pumpedMl: 0, usedMl: 0, discardedMl: 0 }).netMl).toBe(0);
  });
});
