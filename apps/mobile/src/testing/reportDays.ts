/**
 * DAYS TO READ REPORTS' LEAD CARDS OVER — a plain day, the heaviest a household plausibly logs, a
 * quiet one, and twins. **Test-only** (`no-bundle.test.ts`): the lead cards' words
 * (`screens/reports/summary.test.ts`) and their fit (`summaryFit.test.ts`) are walked over these.
 *
 * None of these is a claim about any baby. The heavy day is the widest set of strings the cards
 * can be asked to hold — a newborn's seventeen changes and near-eighteen hours of sleep, a day of
 * cluster feeding, a dozen pump sessions — so a line that fits it fits a real day.
 */
import {
  DEFAULT_DAY_WINDOW,
  rangeOf,
  reportGlance,
  zonedToUtc,
  type ActiveTimer,
  type GlanceInput,
  type RangeKey,
  type ReportGlance,
  type TodayActivity,
} from '@nibblecue/core';

export const TZ = 'America/Los_Angeles';
/** A Saturday in September 2026, in Los Angeles: no DST edge. */
export const at = (day: number, h: number, m = 0): number => zonedToUtc(TZ, 2026, 9, day, h, m);
/** Ten to midnight on the 26th: a day nearly over, so its strips are full. */
export const EVENING = at(26, 23, 50);

let seq = 0;
const id = (): string => `r${String((seq += 1))}`;
const base = (childId: string | null) => ({ childId, isPrivate: false, createdBy: 'dana' });

export interface DayShape {
  bottles: number;
  bottleMl: number;
  breastfeeds: number;
  /** [wet, dirty, both] */
  diapers: readonly [number, number, number];
  /** Sleep stretches, as [start hour, minutes]. */
  sleeps: readonly (readonly [number, number])[];
  pumps: number;
  pumpMl: number;
  rash?: number;
}

export const PLAIN: DayShape = {
  bottles: 5,
  bottleMl: 120,
  breastfeeds: 2,
  diapers: [3, 1, 1],
  sleeps: [
    [0, 330],
    [9, 70],
    [13, 90],
    [16, 40],
    [19, 250],
  ],
  pumps: 3,
  pumpMl: 110,
};

/** The heaviest plausible day: cluster feeding, seventeen changes, near-eighteen hours asleep. */
export const HEAVY: DayShape = {
  bottles: 8,
  bottleMl: 150,
  breastfeeds: 8,
  diapers: [11, 3, 3],
  // 17h 45m in nine stretches
  sleeps: [
    [0, 165],
    [3, 120],
    [6, 90],
    [8, 100],
    [10, 110],
    [13, 120],
    [16, 100],
    [18, 110],
    [20, 150],
  ],
  pumps: 12,
  pumpMl: 105,
  rash: 2,
};

/** One child's day on the 26th minus `back`, spread across the waking hours as it would be. */
export function dayRows(
  shape: DayShape,
  day: number,
  childId: string | null = 'ada',
): TodayActivity[] {
  const rows: TodayActivity[] = [];
  const feeds = shape.bottles + shape.breastfeeds;
  for (let i = 0; i < feeds; i += 1) {
    const startMs = at(day, Math.floor((i * 23.5) / feeds), (i * 37) % 60);
    rows.push(
      i < shape.bottles
        ? {
            ...base(childId),
            id: id(),
            type: 'bottle',
            startMs,
            endMs: null,
            consumedMl: shape.bottleMl,
          }
        : {
            ...base(childId),
            id: id(),
            type: 'breastfeed',
            startMs,
            endMs: startMs + 18 * 60_000,
            leftSeconds: 540,
            rightSeconds: 480,
          },
    );
  }
  const [wet, dirty, both] = shape.diapers;
  const kinds = [
    ...Array<'WET'>(wet).fill('WET'),
    ...Array<'DIRTY'>(dirty).fill('DIRTY'),
    ...Array<'BOTH'>(both).fill('BOTH'),
  ];
  kinds.forEach((kind, i) =>
    rows.push({
      ...base(childId),
      id: id(),
      type: 'diaper',
      startMs: at(day, Math.floor((i * 23) / kinds.length), 20 + ((i * 13) % 40)),
      endMs: null,
      diaperKind: kind,
      diaperRash: i < (shape.rash ?? 0),
    }),
  );
  for (const [h, minutes] of shape.sleeps) {
    const startMs = at(day, h, 5);
    rows.push({
      ...base(childId),
      id: id(),
      type: 'sleep',
      startMs,
      endMs: startMs + minutes * 60_000,
      sleepKind: h >= 19 || h < 6 ? 'NIGHT' : 'NAP',
    });
  }
  for (let i = 0; i < shape.pumps; i += 1)
    rows.push({
      ...base(null),
      id: id(),
      type: 'pump',
      startMs: at(day, Math.floor((i * 22) / Math.max(1, shape.pumps)) + 1),
      endMs: null,
      totalMl: shape.pumpMl,
    });
  return rows;
}

/** `days` days of a shape, ending on the 26th, for one child. */
export function daysOf(
  shape: DayShape,
  days: number,
  childId: string | null = 'ada',
): TodayActivity[] {
  const out: TodayActivity[] = [];
  for (let d = 26 - days + 1; d <= 26; d += 1) out.push(...dayRows(shape, d, childId));
  return out;
}

/** The glance over rows, as Reports takes it at `nowMs`, for a chip's range. */
export function glanceOf(
  rows: readonly TodayActivity[],
  key: RangeKey = 'week',
  nowMs = EVENING,
  running: readonly ActiveTimer[] = [],
): ReportGlance {
  const input: GlanceInput = {
    rows: rows.filter(r => r.startMs <= nowMs),
    running,
    range: rangeOf(key, TZ, nowMs),
    timeZone: TZ,
    nowMs,
    window: DEFAULT_DAY_WINDOW,
  };
  return reportGlance(input);
}
