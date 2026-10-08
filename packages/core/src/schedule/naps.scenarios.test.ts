/**
 * THE NAP OUTLOOK, SCENARIO BY SCENARIO. The owner, 2026-09-23: *"run test with multiple scenarios
 * about baby's sleeping pattern and check it's accuracy."*
 *
 * `naps.scenarios.ts` names the situations — a newborn, the four-month regression, the nap
 * transitions, a catnapper, an early riser, a late family, weekends, daycare, clock changes, a trip,
 * a bedtime moved, a developmental leap, a sick week, patchy logging, every night waking logged, and
 * (2026-09-26) the entries that reach the log wrong: a nap timer found the next morning, and naps
 * written down afterwards at the time they were written — and this replays a population of each
 * through the engine and holds each to its own floor. The
 * backtest's average can hide one situation getting worse; this cannot.
 *
 * The floors sit a little outside today's numbers, like the backtest's. Where a scenario is weaker
 * than the rest, the floor says so rather than hiding it, and `docs/NAP_OUTLOOK.md` §6.2 says why.
 * `NAP_BACKTEST_REPORT=1 pnpm vitest run packages/core/src/schedule/naps.scenarios --silent=false`
 * prints the table the doc quotes.
 */
import { describe, expect, it } from 'vitest';
import {
  asleepScores,
  engine,
  glanceScores,
  isWeekend,
  kindRight,
  nightWakingScores,
  of,
  onThePhone,
  replay,
  runningNapScores,
  stats,
  type Predict,
} from './naps.bench';
import { SCENARIOS, type Scenario } from './naps.scenarios';
import { simulatePopulation } from './naps.sim';

const REPORT = process.env.NAP_BACKTEST_REPORT === '1';
const HOUSEHOLDS = 30;

interface Floor {
  /** The typical miss for the next sleep, in minutes, at most. */
  median: number;
  /** The average miss, at most. */
  mae: number;
  /** The share inside half an hour, at least. */
  within30: number;
  /** Nap or night named rightly, at least. */
  kind: number;
  /** The typical miss for when the night ends, at most. */
  nightEnd: number;
  /** The average miss in the five days after the situation began, at most — where it has a day. */
  after?: number;
  /** The same for the five days after it ended, where the ending is a change of its own. */
  afterEnd?: number;
}

/*
  One floor per scenario. Read down the `mae` column for where the engine is strong and where it is
  not: a steady baby, a newborn, the regression and a catnapper sit under 20 minutes; a trip three
  time zones east is the weakest, because every usual time is a clock time and the clock moved.

  The trip is there twice, on the same households: on the phone that stayed home, which reads every
  sleep on the home clock, and on the phone that went, which reads each sleep on the clock where it
  happened (`naps.local.ts`). The second is the better week — the days after landing most — and
  the weaker two days after the flight home, which `docs/NAP_OUTLOOK.md` §6.3 explains.
*/
const FLOORS: Readonly<Record<string, Floor>> = {
  steady: { median: 10.5, mae: 19.5, within30: 0.85, kind: 0.93, nightEnd: 19 },
  newborn: { median: 8.5, mae: 11.5, within30: 0.91, kind: 0.93, nightEnd: 19 },
  regression: { median: 12.5, mae: 19.5, within30: 0.83, kind: 0.92, nightEnd: 16.5, after: 20 },
  'three-to-two': { median: 11, mae: 22, within30: 0.83, kind: 0.92, nightEnd: 19 },
  'two-to-one': { median: 12.5, mae: 29, within30: 0.78, kind: 0.92, nightEnd: 20.5 },
  catnapper: { median: 11, mae: 19.5, within30: 0.83, kind: 0.92, nightEnd: 19.5 },
  'early-riser': { median: 11.5, mae: 24.5, within30: 0.81, kind: 0.93, nightEnd: 18.5 },
  'late-family': { median: 12, mae: 27.5, within30: 0.79, kind: 0.91, nightEnd: 19 },
  weekends: { median: 16.5, mae: 29.5, within30: 0.74, kind: 0.92, nightEnd: 28.5 },
  'daycare-logged': { median: 11, mae: 28.5, within30: 0.76, kind: 0.93, nightEnd: 17.5 },
  'daycare-unlogged': { median: 19.5, mae: 31.5, within30: 0.7, kind: 0.94, nightEnd: 18 },
  'spring-forward': { median: 12.5, mae: 23, within30: 0.8, kind: 0.93, nightEnd: 19.5, after: 24 },
  'fall-back': { median: 13.5, mae: 26, within30: 0.8, kind: 0.92, nightEnd: 20.5, after: 26 },
  trip: { median: 17.5, mae: 34, within30: 0.7, kind: 0.88, nightEnd: 37, after: 52, afterEnd: 37 },
  'trip-along': {
    median: 16.5,
    mae: 32.5,
    within30: 0.71,
    kind: 0.88,
    nightEnd: 33,
    after: 45,
    afterEnd: 41,
  },
  'bedtime-earlier': { median: 12.5, mae: 29, within30: 0.79, kind: 0.91, nightEnd: 20, after: 29 },
  leap: { median: 14, mae: 26.5, within30: 0.78, kind: 0.92, nightEnd: 17.5, after: 34 },
  sick: { median: 13, mae: 32, within30: 0.77, kind: 0.9, nightEnd: 18, after: 41 },
  // tightened 2026-09-26 with the missed-nap rule (`MISSED_NAP_SHARE`): 32.5 → 30.7 on average
  patchy: { median: 13.5, mae: 32.5, within30: 0.77, kind: 0.9, nightEnd: 21 },
  'night-pieces': { median: 10.5, mae: 19, within30: 0.85, kind: 0.93, nightEnd: 17.5 },
  // the entries that reach the log wrong (2026-09-26): a timer found the next morning, a nap
  // written down afterwards at the time it was written
  'timer-left-on': { median: 11.5, mae: 25, within30: 0.81, kind: 0.92, nightEnd: 18 },
  'logged-late': { median: 13, mae: 28, within30: 0.78, kind: 0.91, nightEnd: 19 },
  // 2026-10-06, the owner's hectic mornings: the first nap unlogged two mornings in three. Before the
  // day-wide bar (`MISSED_NAP_SHARE`) the morning's usual became two windows and a nap and nothing
  // caught it: median 23.2, MAE 75.5, inside half an hour 56%
  'hectic-mornings': { median: 15, mae: 47, within30: 0.71, kind: 0.92, nightEnd: 19 },
};

/** Each scenario's households, simulated once and shared by every test that reads them. */
const populations = new Map<string, ReturnType<typeof simulatePopulation>>();
const population = (sc: Scenario) => {
  const cached = populations.get(sc.key);
  if (cached !== undefined) return cached;
  const seedOf = SCENARIOS.findIndex(s => s.key === (sc.households ?? sc.key));
  const pop = simulatePopulation(7000 + seedOf, HOUSEHOLDS, sc.ages[0], sc.ages[1], 28, sc.params);
  populations.set(sc.key, pop);
  return pop;
};
/** Read on the phone the scenario names: one that went somewhere, or one that never left home. */
const predictOf = (sc: Scenario): Predict =>
  sc.zones === undefined ? engine : onThePhone(sc.zones);
const runs = new Map<string, ReturnType<typeof replay>>();
const runOf = (sc: Scenario) => {
  const cached = runs.get(sc.key);
  if (cached !== undefined) return cached;
  const run = replay(population(sc), predictOf(sc));
  runs.set(sc.key, run);
  return run;
};

describe('every scenario has a floor', () => {
  it('and every floor a scenario', () => {
    expect(Object.keys(FLOORS).sort()).toEqual(SCENARIOS.map(s => s.key).sort());
  });
});

describe.each(SCENARIOS.map(sc => [sc.name, sc] as const))('%s', (_name, sc) => {
  const floor = FLOORS[sc.key] as Floor;
  const pop = population(sc);
  const predict = predictOf(sc);
  const run = runOf(sc);
  const all = of(run.scored);

  it('says when the next sleep would fall, near enough', () => {
    if (REPORT) {
      console.log(
        `${sc.name.padEnd(46)} median ${all.median.toFixed(1).padStart(5)}  MAE ${all.mae
          .toFixed(1)
          .padStart(
            5,
          )}  ±30 ${Math.round(100 * all.within30)}%  nap/night ${(100 * kindRight(run.scored)).toFixed(0)}%  answered ${Math.round((100 * run.scored.length) / run.asked)}%`,
      );
    }
    expect(all.n).toBeGreaterThan(900);
    expect(all.median).toBeLessThanOrEqual(floor.median);
    expect(all.mae).toBeLessThanOrEqual(floor.mae);
    expect(all.within30).toBeGreaterThanOrEqual(floor.within30);
  }, 60_000);

  it('names the nap or the night rightly', () => {
    expect(kindRight(run.scored)).toBeGreaterThanOrEqual(floor.kind);
  });

  if (floor.after !== undefined) {
    const from = sc.from as number;
    const after = floor.after;
    it('recovers within days of the change', () => {
      const s = of(run.scored, x => x.ev.day > from && x.ev.day <= from + 5);
      if (REPORT) console.log(`${''.padEnd(46)} days 1–5 after: MAE ${s.mae.toFixed(1)}`);
      expect(s.mae).toBeLessThanOrEqual(after);
    });
  }

  if (floor.afterEnd !== undefined) {
    const until = sc.until as number;
    const afterEnd = floor.afterEnd;
    it('recovers within days of it ending', () => {
      const s = of(run.scored, x => x.ev.day >= until && x.ev.day < until + 5);
      if (REPORT) console.log(`${''.padEnd(46)} days 1–5 after it ended: MAE ${s.mae.toFixed(1)}`);
      expect(s.mae).toBeLessThanOrEqual(afterEnd);
    });
  }

  it('says when the night ends, and never gives a nap an end already gone', () => {
    const asleep = asleepScores(pop, predict);
    const running = runningNapScores(pop, [60], predict);
    if (REPORT) {
      console.log(
        `${''.padEnd(46)} night ends: median ${stats(asleep.nights).median.toFixed(1)}  ` +
          `running nap: MAE ${stats(running.errs).mae.toFixed(1)}`,
      );
    }
    expect(stats(asleep.nights).median).toBeLessThanOrEqual(floor.nightEnd);
    expect(running.gone).toBe(0);
  }, 60_000);

  it('names no nap at a night waking', () => {
    // only a household that logs the night in pieces has night wakings in its log to ask about
    if (!pop.some(h => h.pieceNight)) return;
    const nw = nightWakingScores(pop, predict);
    if (nw.wakings < 50) return;
    expect(nw.napNamed / nw.wakings).toBeLessThanOrEqual(0.05);
  }, 60_000);
});

describe('the situations that need their own look', () => {
  it('weekends: the lie-in days are the weaker ones, and still inside forty minutes on average', () => {
    const sc = SCENARIOS.find(s => s.key === 'weekends') as Scenario;
    const run = runOf(sc);
    const weekend = of(run.scored, s => isWeekend(s.ev.day));
    const weekday = of(run.scored, s => !isWeekend(s.ev.day));
    if (REPORT) {
      console.log(
        `weekends: weekday MAE ${weekday.mae.toFixed(1)}, weekend MAE ${weekend.mae.toFixed(1)}`,
      );
    }
    expect(weekday.mae).toBeLessThanOrEqual(27);
    expect(weekend.mae).toBeLessThanOrEqual(36);
  }, 60_000);

  /**
   * A NAP NOBODY LOGGED, READ AT A GLANCE (`MISSED_NAP_SHARE`; the owner, 2026-09-26: "consider the
   * human aspect of like forget to logging"). With a third of naps never logged, the card at two in
   * the afternoon used to name a nap time already gone on nearly a third of days — the nap it was
   * counting towards had happened, unlogged, hours before. Past 1.8 times the household's own
   * window it now says when the last logged sleep ended instead.
   */
  it('a nap nobody logged: in the afternoon, a nap time already gone is rare', () => {
    const sc = SCENARIOS.find(s => s.key === 'patchy') as Scenario;
    const g = glanceScores(population(sc), 14 * 60, () => true);
    if (REPORT) {
      console.log(
        `patchy at 2 pm: ${g.asked} glances, ${g.past} already past, ${g.silent} saying when the ` +
          `last logged sleep ended, MAE ${stats(g.errs).mae.toFixed(1)}`,
      );
    }
    // 127 of 405 glances before the rule, 27 after
    expect(g.past / g.asked).toBeLessThanOrEqual(0.1);
  }, 60_000);

  it('daycare nobody logs: at pickup, the usual bedtime — never a nap time already gone', () => {
    const sc = SCENARIOS.find(s => s.key === 'daycare-unlogged') as Scenario;
    // 5:30 pm on a weekday: the parent opens the app, and the log has nothing since the morning
    const g = glanceScores(population(sc), 17 * 60 + 30, d => d % 7 < 5);
    const s = stats(g.errs);
    if (REPORT) {
      console.log(
        `daycare pickup: ${g.asked} glances, ${g.errs.length} answered, ${g.past} already past, ` +
          `median ${s.median.toFixed(1)}, MAE ${s.mae.toFixed(1)}`,
      );
    }
    expect(g.past).toBe(0);
    expect(g.errs.length / g.asked).toBeGreaterThanOrEqual(0.7);
    expect(s.median).toBeLessThanOrEqual(28);
  }, 60_000);
});
