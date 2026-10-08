/**
 * SCHEDULE FROM YOUR LOG, REPLAYED. Each simulated household's first week is read into a
 * schedule exactly as the phone would read it, and the schedule is then scored against the
 * household's SECOND week — what really happened after the parent would have tapped it through.
 *
 * WHY THIS IS A TEST. The owner was promised the feature would be measured against simulated
 * families before it shipped (2026-09-23). The floors below sit a little under what the engine
 * scores today — a guard against a change that reads well and schedules worse, not a target — and
 * `docs/SCHEDULE_LOGIC.md` ("Schedule from your log") has the tables.
 *
 * WHAT IT SCORES, and on what:
 *   * THE REMINDERS AGAINST THE NEXT WEEK. Every real feed or pump in the day, after the day's
 *     first, measured from where the proposed schedule put it: the nearest set time, or the
 *     previous one plus the interval. Held against the app's own starting point, an every-3-hours
 *     rule, because that is what a household that never opens this page keeps.
 *   * THE SHAPE IT CHOSE, per kind of household: a parent pumping at work at ten, one and four on
 *     weekdays is a clock routine and should get set times, Monday to Friday; a baby fed three
 *     hours after the last feed should not.
 *   * THE NIGHT, AS A TRIPWIRE. No proposed time lands outside the day the engine read. That holds
 *     by construction — the night's entries are set aside before any time is fitted, and a time is
 *     the middle of the entries it keeps — so the check guards that filter against a later change;
 *     it is not a finding about the simulated families.
 *   * THE DAY, from the sleep simulator's nights: the proposed waking and bedtime against the real
 *     ones the following week, held against the wake and bed times the household typed in.
 *
 * Households come from `foresight.sim.ts` and `naps.sim.ts` — the published guidance, logged the
 * way tired parents log. A fair comparison and a floor; not a promise about any real baby.
 *
 * To print the tables: `FROM_LOG_REPORT=/tmp/fromlog.txt pnpm vitest run src/schedule/fromLog.backtest`
 * in packages/core.
 */
import { writeFileSync } from 'node:fs';
import { afterAll, describe, expect, it } from 'vitest';
import {
  FROM_LOG_EARLY_MIN,
  FROM_LOG_LATE_MIN,
  scheduleFromLog,
  type FromLogPlan,
  type FromLogShape,
} from './fromLog';
import { simulateFeedPopulation, type FeedHousehold, type Truth } from './foresight.sim';
import { SIM_DAY0, simDayStartOf, simulatePopulation } from './naps.sim';
import { hhmmOf, hm } from './time';
import { MIN } from './types';

const DAY = 24 * 60 * MIN;
const REPORT = process.env['FROM_LOG_REPORT'];
const lines: string[] = [];
const report = (line: string) => lines.push(line);
afterAll(() => {
  if (REPORT) writeFileSync(REPORT, `${lines.join('\n')}\n`);
});

/** The simulators' days are UTC days from `SIM_DAY0`, a Monday. */
const wallMinutes = (ms: number): number =>
  Math.floor(((((ms - SIM_DAY0) % DAY) + DAY) % DAY) / MIN);
const weekday = (ms: number): number => new Date(simDayStartOf(ms)).getUTCDay();
/** Noon on day 7: the week read is days 0–6, and days 7–13 are what it is scored against. */
const NOW = SIM_DAY0 + 7 * DAY + 12 * 60 * MIN;
const TEST_DAYS = [7, 8, 9, 10, 11, 12, 13];
const clockOf = (minutes: number): string => hhmmOf(((Math.round(minutes) % 1440) + 1440) % 1440);

function planFor(h: FeedHousehold): FromLogPlan {
  return scheduleFromLog({
    nowMs: NOW,
    beats: h.logs,
    sleeps: [],
    firstEntryMs: SIM_DAY0,
    window: { wake: clockOf(h.params.wakeMin), bed: clockOf(h.params.bedMin) },
    enabled: new Set<string>(),
    dayStartOf: simDayStartOf,
    wallMinutes,
    weekday,
  });
}

/** The real events of the test week that fall in the day, per day, as minutes of the day. */
function testDays(events: readonly Truth[], wake: number, bed: number, weekdaysOnly: boolean) {
  return TEST_DAYS.filter(d => !weekdaysOnly || d % 7 < 5).map(d =>
    events
      .filter(e => simDayStartOf(e.startMs) === SIM_DAY0 + d * DAY)
      .map(e => wallMinutes(e.startMs))
      .filter(m => m >= wake - FROM_LOG_EARLY_MIN && m < bed + FROM_LOG_LATE_MIN)
      .sort((a, b) => a - b),
  );
}

/** How far each event after a day's first was from where a shape would have put it. */
function errors(days: readonly (readonly number[])[], shape: FromLogShape): number[] {
  const out: number[] = [];
  for (const day of days) {
    for (let i = 1; i < day.length; i += 1) {
      const m = day[i] ?? 0;
      if (shape.kind === 'times') out.push(Math.min(...shape.times.map(t => Math.abs(m - hm(t)))));
      else if (shape.kind === 'every')
        out.push(Math.abs(m - ((day[i - 1] ?? 0) + shape.everyMinutes)));
    }
  }
  return out;
}

const mean = (xs: readonly number[]) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;
const median = (xs: readonly number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0
    ? 0
    : s.length % 2
      ? (s[(s.length - 1) / 2] ?? 0)
      : ((s[s.length / 2 - 1] ?? 0) + (s[s.length / 2] ?? 0)) / 2;
};
const within = (xs: readonly number[], m: number) =>
  xs.length === 0 ? 0 : xs.filter(x => x <= m).length / xs.length;
const row = (label: string, xs: readonly number[]) =>
  `${label.padEnd(34)} n=${String(xs.length).padStart(5)}  median ${median(xs).toFixed(1).padStart(5)}  mean ${mean(xs).toFixed(1).padStart(5)}  ≤30m ${(within(xs, 30) * 100).toFixed(0).padStart(3)}%`;

/*
  200 households from birth to a year, two weeks each, in the default mix: breastfed, bottle-fed
  and mixed; some cluster-feed, some come to sleep through, some pump — exclusively, at work on
  weekdays, or once in the morning.
*/
const POPULATION = simulateFeedPopulation(7100, 200, 0, 365, 14);

interface Scored {
  h: FeedHousehold;
  plan: FromLogPlan;
}
const SCORED: Scored[] = POPULATION.map(h => ({ h, plan: planFor(h) }));

/**
 * THE HOUSEHOLD'S OWN INTERVAL — the middle gap between logged feeds in the day, over the week the
 * schedule was read from. The alternative the engine turned down whenever it chose set times, so
 * the bench can say whether turning it down was right.
 */
function ownGap(h: FeedHousehold): number {
  const starts = h.logs
    .filter(
      l =>
        (l.activity === 'bottle' || l.activity === 'breastfeed') && l.startMs < SIM_DAY0 + 7 * DAY,
    )
    .map(l => l.startMs)
    .sort((a, b) => a - b);
  const merged: number[] = [];
  for (const t of starts) {
    const prev = merged[merged.length - 1];
    if (prev === undefined || t - prev >= 30 * MIN) merged.push(t);
  }
  const gaps: number[] = [];
  for (let i = 1; i < merged.length; i += 1) {
    const a = merged[i - 1] ?? 0;
    const b = merged[i] ?? 0;
    if (simDayStartOf(a) !== simDayStartOf(b)) continue;
    if (wallMinutes(a) < h.params.wakeMin - FROM_LOG_EARLY_MIN) continue;
    if (wallMinutes(b) >= h.params.bedMin + FROM_LOG_LATE_MIN) continue;
    const gap = (b - a) / MIN;
    if (gap >= 30 && gap <= 480) gaps.push(gap);
  }
  return Math.round(median(gaps));
}

function score(activity: 'feeding' | 'pump', events: (h: FeedHousehold) => readonly Truth[]) {
  const chosen: number[] = [];
  const baseline: number[] = [];
  /** Households given set times: the times, and their own interval, on the same feeds. */
  const timesChosen: number[] = [];
  const timesOwnGap: number[] = [];
  const byKind: Record<string, number> = { times: 0, every: 0, none: 0 };
  let outside = 0;
  for (const { h, plan } of SCORED) {
    const r = plan.rhythms.find(x => x.activity === activity);
    if (r === undefined) continue;
    byKind[r.shape.kind] = (byKind[r.shape.kind] ?? 0) + 1;
    const wake = h.params.wakeMin;
    const bed = h.params.bedMin;
    if (r.shape.kind === 'times') {
      for (const t of r.shape.times) {
        if (hm(t) < wake - FROM_LOG_EARLY_MIN || hm(t) >= bed + FROM_LOG_LATE_MIN) outside += 1;
      }
    }
    if (r.shape.kind === 'none') continue;
    const days = testDays(events(h), wake, bed, r.shape.kind === 'times' && r.shape.weekdays);
    chosen.push(...errors(days, r.shape));
    baseline.push(...errors(days, { kind: 'every', everyMinutes: 180 }));
    if (r.shape.kind === 'times' && activity === 'feeding') {
      timesChosen.push(...errors(days, r.shape));
      timesOwnGap.push(...errors(days, { kind: 'every', everyMinutes: ownGap(h) }));
    }
  }
  return { chosen, baseline, byKind, outside, timesChosen, timesOwnGap };
}

describe('feeding, built from the first week and scored on the second', () => {
  const s = score('feeding', h => h.feeds);

  it('lands closer to the real feeds than the every-3-hours rule a household starts with', () => {
    report(`feeding shapes: ${JSON.stringify(s.byKind)}`);
    report(row('feeds, from the log', s.chosen));
    report(row('feeds, every 3h', s.baseline));
    expect(s.chosen.length).toBeGreaterThan(1000);
    expect(mean(s.chosen)).toBeLessThan(0.85 * mean(s.baseline));
    expect(median(s.chosen)).toBeLessThan(0.8 * median(s.baseline));
    expect(within(s.chosen, 30)).toBeGreaterThan(within(s.baseline, 30) + 0.1);
  });

  it("chooses set times only where they beat the household's own interval the following week", () => {
    report(row('  given set times: the times', s.timesChosen));
    report(row('  given set times: their own gap', s.timesOwnGap));
    expect(s.timesChosen.length).toBeGreaterThan(500);
    expect(mean(s.timesChosen)).toBeLessThan(0.95 * mean(s.timesOwnGap));
  });

  it('keeps every proposed time inside the day it read (a tripwire for the night filter)', () => {
    expect(s.outside).toBe(0);
  });
});

describe('pumping, built from the first week and scored on the second', () => {
  const s = score('pump', h => h.pumps);

  it('lands closer to the real pumps than an every-3-hours rule', () => {
    report(`pump shapes: ${JSON.stringify(s.byKind)}`);
    report(row('pumps, from the log', s.chosen));
    report(row('pumps, every 3h', s.baseline));
    expect(s.chosen.length).toBeGreaterThan(300);
    expect(mean(s.chosen)).toBeLessThan(0.85 * mean(s.baseline));
    expect(within(s.chosen, 30)).toBeGreaterThan(within(s.baseline, 30) + 0.1);
  });

  it('gives a parent who pumps at work set times, Monday to Friday, near ten, one and four', () => {
    const work = SCORED.filter(x => x.h.params.pumping === 'work');
    const shapes = work.map(x => x.plan.rhythms.find(r => r.activity === 'pump')?.shape);
    const good = shapes.filter(
      sh =>
        sh?.kind === 'times' &&
        sh.weekdays &&
        sh.times.length === 3 &&
        sh.times.every((t, i) => Math.abs(hm(t) - [600, 780, 960][i]!) <= 30),
    ).length;
    report(`work pumpers: ${good} of ${work.length} got weekday set times near 10, 1 and 4`);
    expect(work.length).toBeGreaterThan(10);
    expect(good / work.length).toBeGreaterThan(0.8);
  });

  it('keeps every proposed time inside the day it read (a tripwire for the night filter)', () => {
    expect(s.outside).toBe(0);
  });
});

/*
  THE NIGHT A HOUSEHOLD ALREADY TIMES (2026-09-29). A rhythm set up with a night of its own runs it
  at the day's interval plus an hour (setup's default) until somebody changes it; the page now
  offers the middle of the first week's own night gaps instead. Scored on the second week's
  nights: every real night gap, measured from where each night interval would have rung.
*/
/** The test week's night gaps, as setup and the engine both read them: begun at or after bedtime. */
function nightGaps(events: readonly Truth[], wake: number, bed: number): number[] {
  const starts = events
    .map(e => e.startMs)
    .filter(t => t >= SIM_DAY0 + 7 * DAY && t < SIM_DAY0 + 15 * DAY)
    .sort((a, b) => a - b);
  const merged: number[] = [];
  for (const t of starts) {
    const prev = merged[merged.length - 1];
    if (prev === undefined || t - prev >= 30 * MIN) merged.push(t);
  }
  const out: number[] = [];
  for (let i = 1; i < merged.length; i += 1) {
    const a = merged[i - 1] ?? 0;
    const m = wallMinutes(a);
    // the test week's seven evenings, from bedtime to the hour before waking
    if (a >= SIM_DAY0 + 14 * DAY + 12 * 60 * MIN) continue;
    if (!(m >= bed || m < wake - FROM_LOG_EARLY_MIN)) continue;
    const gap = ((merged[i] ?? 0) - a) / MIN;
    if (gap >= 30 && gap <= 480) out.push(gap);
  }
  return out;
}

function nightScore(activity: 'feeding' | 'pump', events: (h: FeedHousehold) => readonly Truth[]) {
  const fromLog: number[] = [];
  const setup: number[] = [];
  let withNights = 0;
  let read = 0;
  for (const { h, plan } of SCORED) {
    const r = plan.rhythms.find(x => x.activity === activity);
    if (r === undefined) continue;
    const gaps = nightGaps(events(h), h.params.wakeMin, h.params.bedMin);
    if (gaps.length === 0) continue;
    withNights += 1;
    if (r.night === null) continue;
    read += 1;
    // setup's night: the day's interval plus an hour, the day being what the page would set
    const day = r.shape.kind === 'every' ? r.shape.everyMinutes : 180;
    const night = r.night.everyMinutes;
    for (const g of gaps) {
      fromLog.push(Math.abs(g - night));
      setup.push(Math.abs(g - (day + 60)));
    }
  }
  return { fromLog, setup, withNights, read };
}

describe('the night a household already times, from the first week and scored on the second', () => {
  // few simulated parents pump at night (11 of 200), so the pump floor is lower
  for (const [activity, events, floor] of [
    ['feeding', (h: FeedHousehold) => h.feeds, 100],
    ['pump', (h: FeedHousehold) => h.pumps, 8],
  ] as const) {
    it(`${activity}: the week's own nights land closer than the day's interval plus an hour`, () => {
      const s = nightScore(activity, events);
      report(
        `${activity} nights: read for ${s.read} of ${s.withNights} households with night gaps`,
      );
      report(row(`${activity} nights, from the log`, s.fromLog));
      report(row(`${activity} nights, day plus an hour`, s.setup));
      expect(s.read).toBeGreaterThanOrEqual(floor);
      expect(mean(s.fromLog)).toBeLessThan(mean(s.setup));
      expect(within(s.fromLog, 30)).toBeGreaterThan(within(s.setup, 30));
    });
  }
});

describe('the day, from the nights in the sleep log', () => {
  const homes = simulatePopulation(7300, 160, 30, 365, 14);
  const bedErr: number[] = [];
  const bedTyped: number[] = [];
  const wakeErr: number[] = [];
  const wakeTyped: number[] = [];
  let proposedBed = 0;
  let proposedWake = 0;
  for (const h of homes) {
    const plan = scheduleFromLog({
      nowMs: NOW,
      beats: [],
      sleeps: h.logs,
      firstEntryMs: SIM_DAY0,
      window: h.dayWindow,
      enabled: new Set<string>(),
      dayStartOf: simDayStartOf,
      wallMinutes,
      weekday,
    });
    const nights = h.truth.filter(t => t.night);
    for (const d of TEST_DAYS) {
      const evening = nights
        .filter(n => simDayStartOf(n.startMs - 4 * 60 * MIN) === SIM_DAY0 + d * DAY)
        .sort((a, b) => a.startMs - b.startMs)[0];
      const morning = nights
        .filter(
          n => simDayStartOf(n.endMs) === SIM_DAY0 + d * DAY && wallMinutes(n.endMs) < 12 * 60,
        )
        .sort((a, b) => b.endMs - a.endMs)[0];
      if (evening && plan.bed.at !== null) {
        const m = wallMinutes(evening.startMs);
        const real = m < 180 ? m + 1440 : m;
        const bed = hm(plan.bed.at) < 180 ? hm(plan.bed.at) + 1440 : hm(plan.bed.at);
        bedErr.push(Math.abs(real - bed));
        bedTyped.push(Math.abs(real - hm(h.dayWindow.bed)));
      }
      if (morning && plan.wake.at !== null) {
        wakeErr.push(Math.abs(wallMinutes(morning.endMs) - hm(plan.wake.at)));
        wakeTyped.push(Math.abs(wallMinutes(morning.endMs) - hm(h.dayWindow.wake)));
      }
    }
    if (plan.bed.at !== null) proposedBed += 1;
    if (plan.wake.at !== null) proposedWake += 1;
  }

  it('is closer to the real bedtimes and mornings than the times the household typed in', () => {
    report(
      `day proposed: bedtime for ${proposedBed} of ${homes.length}, waking for ${proposedWake}`,
    );
    report(row('bedtime, from the log', bedErr));
    report(row('bedtime, as typed', bedTyped));
    report(row('waking, from the log', wakeErr));
    report(row('waking, as typed', wakeTyped));
    expect(proposedBed / homes.length).toBeGreaterThan(0.7);
    expect(proposedWake / homes.length).toBeGreaterThan(0.8);
    expect(mean(bedErr)).toBeLessThan(mean(bedTyped));
    expect(mean(wakeErr)).toBeLessThan(mean(wakeTyped));
  });
});
