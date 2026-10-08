/**
 * "Your week" (the owner's handoff of 2026-10-08): the handoff's own fixtures, each built as the
 * records a household would have saved, and read back through `weekReport`.
 */
import { describe, expect, it } from 'vitest';
import { weekReport, type WeekCategory } from './weekReport';
import { zonedToUtc } from '../today/day';
import type { TodayActivity } from '../today/rows';
import type { ReportRange } from '../reports/range';

const TZ = 'America/New_York';
const OZ = 29.5735;
const at = (day: number, hh: number, mm = 0): number => zonedToUtc(TZ, 2026, 9, 28 + day, hh, mm);
// Mon Sep 28 to Sun Oct 4, local
const WEEK: ReportRange = { key: 'week', fromMs: at(0, 0), toMs: at(7, 0), days: 7 };
let n = 0;
const row = (
  over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>,
): TodayActivity => ({
  id: `r${++n}`,
  childId: over.type === 'pump' ? null : 'ada',
  endMs: null,
  isPrivate: false,
  createdBy: 'dana',
  ...over,
});
const sleep = (day: number, hh: number, mm: number, minutes: number, night = false) =>
  row({
    type: 'sleep',
    startMs: at(day, hh, mm),
    endMs: at(day, hh, mm) + minutes * 60_000,
    sleepKind: night ? 'NIGHT' : 'NAP',
  });
const bottle = (day: number, oz: number | null) =>
  row({
    type: 'bottle',
    startMs: at(day, 10),
    consumedMl: oz === null ? null : oz * OZ,
    bottleKind: 'EBM',
  });
const nurse = (day: number, minutes: number) =>
  row({
    type: 'breastfeed',
    startMs: at(day, 8),
    endMs: at(day, 8) + minutes * 60_000,
    leftSeconds: minutes * 30,
    rightSeconds: minutes * 30,
  });
const diaper = (day: number) => row({ type: 'diaper', startMs: at(day, 11), diaperKind: 'WET' });
const meal = (day: number) => row({ type: 'solids', startMs: at(day, 12), meal: 'LUNCH' });
const pump = (day: number, oz: number | null) =>
  row({
    type: 'pump',
    startMs: at(day, 7),
    endMs: at(day, 7, 20),
    totalMl: oz === null ? null : oz * OZ,
  });

const report = (rows: TodayActivity[]) =>
  weekReport({ rows, range: WEEK, timeZone: TZ, unit: 'oz' });
const cats = (r: ReturnType<typeof report>): WeekCategory[] => r.metrics.map(m => m.category);
const of = (r: ReturnType<typeof report>, c: WeekCategory) =>
  r.metrics.find(m => m.category === c)!;
const ozOf = (ml: number) => Math.round((ml / OZ) * 100) / 100;

describe('the selected full week', () => {
  const daily = [
    [800, 24, 40, 6, 12, '21:10'],
    [840, 23, 45, 5, 15, '21:25'],
    [820, 26, 40, 7, 13.5, '22:05'],
    [790, 24, 39, 6, 16, '21:05'],
    [845, 25, 48, 6, 14.25, '21:18'],
    [825, 22, 42, 5, 13.5, '21:27'],
    [820, 24, 40, 7, 15.5, '20:45'],
  ] as const;
  const rows: TodayActivity[] = [];
  daily.forEach(([sl, ml, nu, dp, pu], d) => {
    // the day's sleep, inside the day: a night stretch from 01:00 and a nap
    rows.push(sleep(d, 1, 0, sl - 120), sleep(d, 13, 0, 120));
    rows.push(bottle(d, ml), nurse(d, nu));
    for (let i = 0; i < dp; i++) rows.push(diaper(d));
    rows.push(pump(d, pu - 6), pump(d, 6));
  });
  // the night starts, each the evening before the next morning's record, short so they add little
  const nights = daily.map(([, , , , , start], d) => {
    const [hh, mm] = start.split(':').map(Number) as [number, number];
    return sleep(d, hh, mm, 0, true);
  });
  // zero-minute nights: counted as starts, adding no sleep minutes
  const r = report([...rows, ...nights.map(x => ({ ...x, endMs: x.startMs + 60_000 * 0 + 1 }))]);

  it('leads with weekly totals, each averaged over its own recorded days', () => {
    expect(cats(r)).toEqual(['sleep', 'bottle', 'nursing', 'diapers']);
    expect(of(r, 'sleep')).toMatchObject({ total: 5740, days: 7, average: 820 });
    expect(Math.round(ozOf(of(r, 'bottle').total))).toBe(168);
    expect(ozOf(of(r, 'bottle').average!)).toBeCloseTo(24, 1);
    expect(of(r, 'nursing')).toMatchObject({ total: 294, days: 7, average: 42 });
    expect(of(r, 'diapers')).toMatchObject({ total: 42, days: 7, average: 6 });
    expect(r.pumping?.sessions).toBe(14);
    expect(ozOf(r.pumping!.ml)).toBeCloseTo(99.75, 1);
    expect(ozOf(r.pumping!.average!)).toBeCloseTo(14.25, 1);
    expect(r.babyDays).toBe(7);
  });

  it('finds the 9:00–9:30 PM window on 5 of 7 nights, from the records', () => {
    expect(r.pattern).toEqual({ fromMinute: 21 * 60, toMinute: 21 * 60 + 30, count: 5, nights: 7 });
  });
});

describe('adaptive categories', () => {
  it('nursing only: one card, its own days', () => {
    const r = report([0, 1, 2, 3, 4, 5].map(d => nurse(d, 35)));
    expect(cats(r)).toEqual(['nursing']);
    expect(of(r, 'nursing')).toMatchObject({ total: 210, days: 6, average: 35 });
    expect(r.pumping).toBeNull();
    expect(r.pattern).toBeNull();
  });

  it('solids replaces nursing; five categories keep solids', () => {
    const four = report([sleep(0, 13, 0, 60), bottle(0, 4), diaper(0), meal(0)]);
    expect(cats(four)).toEqual(['sleep', 'bottle', 'diapers', 'solids']);
    const five = report([sleep(0, 13, 0, 60), bottle(0, 4), nurse(0, 10), diaper(0), meal(0)]);
    expect(cats(five)).toEqual(['sleep', 'bottle', 'nursing', 'diapers', 'solids']);
  });

  it('pump only: no baby-care days, the pumping row alone', () => {
    const r = report([pump(1, 8.25), pump(3, 8.25)]);
    expect(r.metrics).toEqual([]);
    expect(r.babyDays).toBe(0);
    expect(r.pumping).toMatchObject({ sessions: 2, days: 2 });
    expect(ozOf(r.pumping!.ml)).toBeCloseTo(16.5, 2);
  });

  it('an empty week is empty: no metrics, no pumping, no pattern', () => {
    expect(report([])).toEqual({ babyDays: 0, metrics: [], pumping: null, pattern: null });
  });
});

describe('denominators and measurements', () => {
  it('uneven coverage: each category over its own days, never the household’s four', () => {
    const r = report([
      bottle(0, 12),
      bottle(2, 12),
      nurse(0, 30),
      nurse(1, 30),
      nurse(2, 30),
      nurse(3, 30),
      diaper(0),
      diaper(0),
      diaper(0),
      diaper(0),
      diaper(1),
      diaper(1),
      diaper(1),
      diaper(1),
      diaper(3),
      diaper(3),
      diaper(3),
      diaper(3),
    ]);
    expect(r.babyDays).toBe(4);
    expect(of(r, 'bottle').days).toBe(2);
    expect(ozOf(of(r, 'bottle').average!)).toBeCloseTo(12, 2);
    expect(of(r, 'nursing')).toMatchObject({ days: 4, average: 30 });
    expect(of(r, 'diapers')).toMatchObject({ total: 12, days: 3, average: 4 });
  });

  it('unknown amounts are counted, never zero, and suppress the average', () => {
    const none = report([bottle(0, null), bottle(1, null)]);
    expect(of(none, 'bottle')).toMatchObject({
      measure: 'count',
      total: 2,
      unmeasured: 2,
      average: null,
    });
    const some = report([bottle(0, 5), bottle(1, null)]);
    expect(of(some, 'bottle')).toMatchObject({ measure: 'ml', unmeasured: 1, average: null });
    expect(ozOf(of(some, 'bottle').total)).toBeCloseTo(5, 2);
  });

  it('water is not milk; pumped volume is never baby intake', () => {
    const r = report([
      row({ type: 'bottle', startMs: at(0, 9), consumedMl: 60, bottleKind: 'WATER' }),
      pump(0, 4),
    ]);
    expect(r.metrics).toEqual([]);
    expect(r.pumping?.sessions).toBe(1);
  });

  it('a sleep across the week’s edge counts only its part inside the week', () => {
    // from 10 PM Sunday Sep 27 to 6 AM Monday: six of its eight hours are in the week
    const r = report([
      row({ type: 'sleep', startMs: at(-1, 22), endMs: at(0, 6), sleepKind: 'NIGHT' }),
    ]);
    expect(of(r, 'sleep')).toMatchObject({ total: 360, days: 1 });
  });

  it('a sleep still being timed is not a record yet', () => {
    expect(report([row({ type: 'sleep', startMs: at(2, 13), endMs: null })]).metrics).toEqual([]);
  });

  it('one meal of three foods is one meal', () => {
    const r = report([
      row({
        type: 'solids',
        startMs: at(0, 12),
        solidsItems: [{ food: 'a' }, { food: 'b' }, { food: 'c' }] as never,
      }),
    ]);
    expect(of(r, 'solids')).toMatchObject({ total: 1, days: 1 });
  });
});
