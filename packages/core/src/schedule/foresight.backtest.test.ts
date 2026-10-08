/**
 * THE FEED AND PUMP HEADS-UP, BACKTESTED. Every heads-up the engine would have planned for a
 * population of simulated households — right after each logged feed or pump, which is when the
 * phone re-plans — scored against when the next feed or pump REALLY began.
 *
 * WHY THIS IS A TEST AND NOT A SCRIPT. The owner asked for the reminders to be accurate. The
 * accuracy was measured to choose the engine (2026-09-23); this keeps it measured, so a change that
 * reads well and predicts worse fails the build instead of shipping. The floors sit a little above
 * what the engine scores today — a guard against a regression, not a target — and
 * `docs/NOTIFICATIONS.md` (Addendum — the heads-up) has the tables and what each number means.
 *
 * WHAT IT CAN AND CANNOT SAY. The households come from `foresight.sim.ts`: feeds and pumps as the
 * published guidance describes them, logged the way tired parents log. That makes this a fair
 * comparison between engines and a firm floor under this one. It is not a promise about any real
 * baby.
 *
 * Every household is seeded, so every number is the same on every machine. To print the tables:
 * `FORESIGHT_REPORT=/tmp/foresight.txt pnpm vitest run src/schedule/foresight.backtest` in
 * packages/core.
 */
import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  FEEDS,
  firstEngine,
  of,
  PUMPS,
  replay,
  row,
  shipped,
  type Predictor,
  type Replay,
} from './foresight.bench';
import { simulateFeedPopulation, type FeedSimParams } from './foresight.sim';

const REPORT = process.env['FORESIGHT_REPORT'];
const lines: string[] = [];
const report = (line: string) => lines.push(line);

/*
  160 households from birth to a year, three weeks each, with the default mix: breastfed, bottle-fed
  and mixed; some cluster-feed, some come to sleep through partway, some pump — exclusively, at
  work on weekdays, or once in the morning. About 18,000 feeds and 3,100 pumps are scored.
*/
const POPULATION = simulateFeedPopulation(5000, 160, 0, 365, 21);

const run = (group: ReadonlySet<string>, predict: Predictor): Replay =>
  replay(POPULATION, group, predict);

describe('the feed heads-up', () => {
  const now = run(FEEDS, shipped);
  const before = run(FEEDS, firstEngine);
  const all = of(now.scored);
  const was = of(before.scored);

  it('lands within half an hour of the next feed about half the time, and is not early on average', () => {
    report(row('feeds, shipped', all));
    report(row('feeds, first engine', was));
    report(
      row(
        '  day, shipped',
        of(now.scored, s => !s.night),
      ),
    );
    report(
      row(
        '  night, shipped',
        of(now.scored, s => s.night),
      ),
    );
    expect(all.median).toBeLessThan(32);
    expect(all.mae).toBeLessThan(48);
    expect(all.within30).toBeGreaterThan(0.48);
    expect(Math.abs(all.bias)).toBeLessThan(10);
  });

  it('is much better than the engine it replaced', () => {
    expect(all.mae).toBeLessThan(0.6 * was.mae);
    expect(all.median).toBeLessThan(0.75 * was.median);
  });

  it('answers after every logged feed, even when a family gives both breast and bottle', () => {
    expect(now.silent).toBe(0);
    for (const feeding of ['breast', 'bottle', 'mixed'] as const) {
      const s = of(now.scored, x => x.h.params.feeding === feeding);
      report(row(`  ${feeding}`, s));
      expect(s.median, feeding).toBeLessThan(33);
    }
  });

  /*
    THE ERROR A PARENT WOULD SWITCH THE FEATURE OFF OVER: a heads-up at 1 a.m. for a baby who now
    sleeps through. The first engine planned one after every such bedtime feed; the one that ships
    reads what the bedtime feed is usually followed by, and gets it wrong only in the few days
    after the night feed was dropped, while the log still remembers it.
  */
  it('rarely plans a heads-up into a night the baby now sleeps through', () => {
    report(
      `night alarms after a sleep-through bedtime feed: shipped ${now.nightFalse}/${now.nightThrough}, first engine ${before.nightFalse}/${before.nightThrough}`,
    );
    expect(before.nightFalse / before.nightThrough).toBeGreaterThan(0.95);
    expect(now.nightFalse / now.nightThrough).toBeLessThan(0.2);
  });
});

describe('the pump heads-up', () => {
  const now = run(PUMPS, shipped);
  const before = run(PUMPS, firstEngine);
  const all = of(now.scored);
  const was = of(before.scored);

  it('follows the parent’s own clock, and leaves the weekend alone for a pump taken at work', () => {
    report(row('pumps, shipped', all));
    report(row('pumps, first engine', was));
    for (const kind of ['exclusive', 'work'] as const) {
      report(
        row(
          `  ${kind}`,
          of(now.scored, x => x.h.params.pumping === kind),
        ),
      );
    }
    expect(all.median).toBeLessThan(25);
    expect(all.within30).toBeGreaterThan(0.6);
    expect(all.mae).toBeLessThan(0.4 * was.mae);
    // at work on weekdays: the median miss is minutes, not the weekend
    expect(of(now.scored, x => x.h.params.pumping === 'work').median).toBeLessThan(26);
  });
});

/*
  THE SAME ENGINE UNDER OTHER HOUSEHOLDS. A method that only wins on the default mix has learned
  the simulator, not the babies, so every variant below has to be won too: sloppier and tidier
  logging, steadier and less steady babies, newborns who cluster-feed, older babies who sleep
  through, families who top up nearly every breastfeed.
*/
const VARIANTS: Record<string, (p: FeedSimParams) => FeedSimParams> = {
  'messy logging': p => ({
    ...p,
    logging: { jitterMin: 8, missDay: 0.1, missNight: 0.25, dupe: 0.05, rounded: 0.5 },
  }),
  'tidy logging': p => ({
    ...p,
    logging: { jitterMin: 1, missDay: 0, missNight: 0, dupe: 0, rounded: 0 },
  }),
  'steady baby': p => ({ ...p, sigma: 0.06 }),
  'unsteady baby': p => ({ ...p, sigma: 0.3 }),
  'cluster-feeding newborns': p => ({ ...p, ageDays: Math.min(p.ageDays, 70), cluster: true }),
  'sleeps through': p => ({ ...p, ageDays: 180 + (p.ageDays % 180), throughFromDay: 0 }),
  'tops up most feeds': p => ({ ...p, feeding: 'mixed', topUp: 0.6 }),
};

/**
 * A POPULATION PER VARIANT IS SIMULATED AND REPLAYED FOUR TIMES, which is a couple of seconds of
 * arithmetic on an idle machine and more than vitest's default 5 s on a loaded one (a full verify
 * with other builds running timed one out on 2026-09-26 while it passed alone in 2.6 s). The test
 * holds accuracy, not speed, so it gets room: a slow machine is not a wrong engine.
 */
const VARIANT_MS = 30_000;

describe('in every kind of household tried', () => {
  for (const [name, tweak] of Object.entries(VARIANTS)) {
    it(`beats the first engine: ${name}`, { timeout: VARIANT_MS }, () => {
      const pop = simulateFeedPopulation(7000, 50, 0, 365, 21, tweak);
      const f = of(replay(pop, FEEDS, shipped).scored);
      const f0 = of(replay(pop, FEEDS, firstEngine).scored);
      const p = of(replay(pop, PUMPS, shipped).scored);
      const p0 = of(replay(pop, PUMPS, firstEngine).scored);
      report(row(`${name}: feeds`, f));
      report(row(`${name}: feeds, first engine`, f0));
      expect(f.mae).toBeLessThan(f0.mae);
      expect(f.median).toBeLessThan(f0.median);
      expect(p.mae).toBeLessThan(p0.mae);
    });
  }

  it('writes the report when asked', () => {
    if (REPORT !== undefined) writeFileSync(REPORT, lines.join('\n'));
    expect(lines.length).toBeGreaterThan(0);
  });
});
