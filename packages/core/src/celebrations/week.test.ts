/**
 * THE WEEK SET BESIDE THE WEEK BEFORE (docs/CELEBRATIONS.md §4; the owner, 2026-09-28: *"the numbers
 * free, with 'compared with last week' as Plus"*). Two numbers side by side and nothing else: the
 * windows tile, both weeks are the card's own instrument, a figure is set beside another only when
 * both weeks hold it, and a week before with nothing in it is no comparison at all.
 */
import { describe, expect, it } from 'vitest';
import type { TodayActivity } from '../today/rows';
import {
  celebrationFigures,
  celebrationPerDay,
  WEEK_FIGURES,
  weekBeforeWindow,
  weekComparison,
  weekWindow,
  type CelebrationFigures,
} from './index';

const TZ = 'America/New_York';
const at = (iso: string, h = 12): number =>
  Date.parse(`${iso}T${String(h).padStart(2, '0')}:00:00-04:00`);
const row = (
  over: Partial<TodayActivity> & Pick<TodayActivity, 'id' | 'type' | 'startMs'>,
): TodayActivity => ({ childId: 'kid', endMs: null, isPrivate: false, createdBy: 'u1', ...over });

const ON = '2026-06-14';

/** A week of the same household, on the days asked, each with a bottle, a diaper and a nap. */
const weekOf = (days: string[], ml: number): TodayActivity[] =>
  days.flatMap((d, i) => [
    row({ id: `b${d}${i}`, type: 'bottle', startMs: at(d, 8), consumedMl: ml }),
    row({ id: `d${d}${i}`, type: 'diaper', startMs: at(d, 9) }),
    row({ id: `s${d}${i}`, type: 'sleep', startMs: at(d, 13), endMs: at(d, 13) + 60 * 60_000 }),
  ]);

describe('the week before', () => {
  it('is the seven local days before the week, and the two tile: none in both, none missed', () => {
    const now = weekWindow(ON, TZ);
    const before = weekBeforeWindow(ON, TZ);
    expect(before.days).toBe(7);
    expect(before.toMs).toBe(now.fromMs);
    expect(before.fromMs).toBe(Date.parse('2026-06-01T00:00:00-04:00'));
    // a bottle at midnight between them is in exactly one of the two
    const edge = [row({ id: 'e', type: 'bottle', startMs: now.fromMs, consumedMl: 90 })];
    expect(
      celebrationFigures(edge, now, TZ).bottles + celebrationFigures(edge, before, TZ).bottles,
    ).toBe(1);
  });

  it('keeps seven local days across the clocks changing', () => {
    const before = weekBeforeWindow('2026-11-08', TZ); // DST ended on Nov 1, inside it
    expect(before.days).toBe(7);
    expect(before.fromMs).toBe(Date.parse('2026-10-26T00:00:00-04:00'));
    expect(before.toMs).toBe(Date.parse('2026-11-02T00:00:00-05:00'));
  });
});

describe('the comparison', () => {
  const rows = [
    ...weekOf(['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'], 120),
    ...weekOf(['2026-06-02', '2026-06-04', '2026-06-06'], 90),
  ];
  const now = celebrationFigures(rows, weekWindow(ON, TZ), TZ);
  const before = celebrationFigures(rows, weekBeforeWindow(ON, TZ), TZ);

  it('sets each figure beside the same figure a week earlier, from the same instrument', () => {
    const c = weekComparison(now, before);
    expect(c).not.toBeNull();
    expect(c?.loggedDays).toEqual({ thisWeek: 5, weekBefore: 3 });
    const byFigure = Object.fromEntries((c?.rows ?? []).map(r => [r.figure, r]));
    expect(byFigure['milk']).toEqual({
      figure: 'milk',
      unit: 'ml',
      thisWeek: 600,
      weekBefore: 270,
    });
    // per day over each week's OWN days with entries: 600 over 5, 270 over 3
    expect(byFigure['milkPerDay']?.thisWeek).toBe(120);
    expect(byFigure['milkPerDay']?.weekBefore).toBe(90);
    expect(byFigure['diapersPerDay']).toEqual({
      figure: 'diapersPerDay',
      unit: 'count',
      thisWeek: celebrationPerDay(now).diapers,
      weekBefore: celebrationPerDay(before).diapers,
    });
    expect(byFigure['sleepPerDay']?.unit).toBe('minutes');
    expect(byFigure['longestSleep']).toMatchObject({ thisWeek: 60, weekBefore: 60 });
  });

  it('draws the card’s own order, and never a figure the card does not draw', () => {
    const c = weekComparison(now, before);
    const order = (c?.rows ?? []).map(r => WEEK_FIGURES.indexOf(r.figure));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every(i => i >= 0)).toBe(true);
    // the weight is not a figure it sets beside another (the doc comment says why)
    expect(WEEK_FIGURES as readonly string[]).not.toContain('weightChange');
  });

  it('works out no difference and names no direction: two numbers, nothing between them', () => {
    const c = weekComparison(now, before);
    for (const r of c?.rows ?? []) {
      expect(Object.keys(r).sort()).toEqual(['figure', 'thisWeek', 'unit', 'weekBefore']);
    }
  });

  it('is nothing at all when the week before had nothing logged, or is unknown', () => {
    const empty = celebrationFigures([], weekBeforeWindow(ON, TZ), TZ);
    expect(weekComparison(now, empty)).toBeNull();
    expect(weekComparison(now, null)).toBeNull();
  });

  it('sets a figure beside another only when both weeks hold that kind of entry', () => {
    const pump = row({ id: 'p', type: 'pump', startMs: at('2026-06-10', 7), totalMl: 100 });
    const withPump = celebrationFigures([...rows, pump], weekWindow(ON, TZ), TZ);
    const c = weekComparison(withPump, before);
    // pumping began this week: "the week before nothing" is a sentence about the log
    expect((c?.rows ?? []).map(r => r.figure)).not.toContain('pumped');
    expect((c?.rows ?? []).map(r => r.figure)).not.toContain('pumpSessions');
    expect((c?.rows ?? []).map(r => r.figure)).toContain('milk');
  });

  it('is nothing when no figure is in both weeks, so there is nothing to lock either', () => {
    const onlyGrowth: CelebrationFigures = celebrationFigures(
      [row({ id: 'g', type: 'growth', startMs: at('2026-06-03', 10), weightG: 5000 })],
      weekBeforeWindow(ON, TZ),
      TZ,
    );
    expect(onlyGrowth.loggedDays).toBe(1);
    expect(weekComparison(now, onlyGrowth)).toBeNull();
  });
});
