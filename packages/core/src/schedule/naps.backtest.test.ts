/**
 * THE NAP OUTLOOK, BACKTESTED. Every prediction the engine would have made for a population of
 * simulated households, replayed day by day and scored against when the next sleep REALLY began.
 *
 * WHY THIS IS A TEST AND NOT A SCRIPT. The owner asked (2026-09-23) for the prediction to be "as
 * good and accurate as possible". The accuracy was measured to choose the engine; this keeps it
 * measured, so a change that reads well and predicts worse fails the build instead of shipping.
 * The thresholds sit a little above what the engine scores today — a guard against a regression,
 * not a target — and `docs/NAP_OUTLOOK.md` has the full tables and what each number means.
 *
 * WHAT IT CAN AND CANNOT SAY. The households come from `naps.sim.ts`: sleep that follows the
 * published research, logged the way tired parents log. That makes this a fair comparison between
 * engines and a firm floor under this one. It is not a promise about real babies — the first real
 * (consented, aggregate) logs are what this bench gets recalibrated against.
 *
 * Every household is seeded, so every number below is the same on every machine. To print the
 * tables the doc quotes: `NAP_BACKTEST_REPORT=1 pnpm vitest run packages/core/src/schedule/naps.backtest
 * --silent=false`.
 */
import { describe, expect, it } from 'vitest';
import { napOutlook, wakeWindows } from './naps';
import {
  asleepScores,
  kindRight,
  nightWakingScores,
  of,
  quantile,
  replay,
  row,
  runningNapScores,
  stats,
  type Predict,
  type Scored,
} from './naps.bench';
import { DEFAULT_SIM, simDayStartOf, simulatePopulation, type SimParams } from './naps.sim';

const REPORT = process.env.NAP_BACKTEST_REPORT === '1';

/**
 * THE SIMPLEST RULE ANYONE WOULD WRITE — every wake window of the last two weeks, one plain middle,
 * added to the waking — read through the engine's own window reader, so the gap between the two is
 * what the positions, the clock, the night and the recency add, and nothing else.
 */
const simplest: Predict = (logs, nowMs) => {
  const o = napOutlook(logs, nowMs, simDayStartOf);
  const windows = wakeWindows(logs, nowMs, simDayStartOf).map(w => w.awakeMs);
  if (o.state !== 'awake' || o.awakeSinceMs === null || windows.length < 4) {
    return { ...o, nextAtMs: null };
  }
  return { ...o, nextAtMs: o.awakeSinceMs + quantile(windows, 0.5) };
};

/* ------------------------------------------------------------------ the population */

/*
  150 households from one to eighteen months, four weeks each, with the default mix: 40% log the
  night in pieces, a third have their routine shift once partway through. About 12,700 wakings
  are scored, and about 12,300 sleeps.
*/
const POPULATION = simulatePopulation(3000, 150, 30, 540, 28, DEFAULT_SIM);
const RUN = replay(POPULATION);
const ALL = of(RUN.scored);

describe('the nap outlook, replayed against what really happened', () => {
  it('is usually within a quarter of an hour, and inside half an hour six times in seven', () => {
    if (REPORT) console.log(row('engine', ALL));
    expect(ALL.n).toBeGreaterThan(8_000);
    expect(ALL.median).toBeLessThanOrEqual(11);
    expect(ALL.mae).toBeLessThanOrEqual(21);
    expect(ALL.within15).toBeGreaterThanOrEqual(0.62);
    expect(ALL.within30).toBeGreaterThanOrEqual(0.85);
    expect(ALL.p90).toBeLessThanOrEqual(40);
  });

  it('is neither early nor late on the whole', () => {
    // a lean either way would put every heads-up in the wrong place, the same way, every day
    expect(Math.abs(ALL.bias)).toBeLessThanOrEqual(4);
  });

  it('answers at nearly every waking once there are two days of log', () => {
    expect(RUN.scored.length / RUN.asked).toBeGreaterThanOrEqual(0.97);
  });

  it('beats one plain middle of every window by a wide margin', () => {
    const plain = of(replay(POPULATION, simplest).scored);
    if (REPORT) console.log(row('one plain middle', plain));
    expect(ALL.mae).toBeLessThan(plain.mae * 0.7);
    expect(ALL.within30).toBeGreaterThan(plain.within30 + 0.12);
  }, 60_000);
});

describe('where the error lives', () => {
  const SEGMENTS: readonly [string, (s: Scored) => boolean, number][] = [
    // [segment, filter, MAE ceiling in minutes]
    ['first window of the day', s => s.ev.position === 1, 11],
    ['next sleep is a nap', s => !s.ev.nextIsNight, 17],
    ['next sleep is the night', s => s.ev.nextIsNight, 33],
    ['1–3 months', s => s.ev.ageDays < 91, 15],
    ['3–6 months', s => s.ev.ageDays >= 91 && s.ev.ageDays < 183, 18.5],
    ['6–9 months', s => s.ev.ageDays >= 183 && s.ev.ageDays < 274, 21],
    ['9–12 months', s => s.ev.ageDays >= 274 && s.ev.ageDays < 365, 22],
    ['12–18 months', s => s.ev.ageDays >= 365, 29.5],
    [
      'a day the nap count changed',
      s => s.ev.napsDayBefore !== null && s.ev.napsDayBefore !== s.ev.napsThatDay,
      27,
    ],
    [
      '1–5 days after a routine moved',
      s => s.h.shiftDay !== null && s.ev.day > s.h.shiftDay && s.ev.day <= s.h.shiftDay + 5,
      23,
    ],
    ['the first days (2–4)', s => s.ev.day <= 4, 26.5],
  ];

  it.each(SEGMENTS)('%s', (name, keep, ceiling) => {
    const s = of(RUN.scored, keep);
    if (REPORT) console.log(row(name, s));
    expect(s.n).toBeGreaterThan(150);
    expect(s.mae).toBeLessThanOrEqual(ceiling);
  });

  it('is not thrown by a night logged in pieces', () => {
    // the night logged waking by waking used to scramble every position of the next day
    const pieces = of(RUN.scored, s => s.h.pieceNight);
    const whole = of(RUN.scored, s => !s.h.pieceNight);
    if (REPORT)
      console.log(`${row('night logged in pieces', pieces)}\n${row('night logged whole', whole)}`);
    expect(Math.abs(pieces.mae - whole.mae)).toBeLessThanOrEqual(3);
  });
});

describe('awake in the night', () => {
  it('names no nap at a night waking, and still starts the day at the morning', () => {
    /*
      Every waking in a household that logs the night in pieces, ten minutes after it: the 2 a.m.
      feed is when a parent opens the app, and "next nap about 4:10 AM" there is nonsense with a
      notification attached. The morning waking must still get its first window.

      A time for the NIGHT is allowed, and is often right: a baby down at 5:50 p.m. who wakes at
      8:40 goes back down, and "Night sleep about 9:10 PM" says when.
    */
    const { wakings, napNamed, mornings, morningsAnswered } = nightWakingScores(POPULATION);
    if (REPORT) {
      console.log(
        `night wakings given a nap time: ${napNamed} of ${wakings}; ` +
          `mornings answered at once: ${morningsAnswered} of ${mornings}`,
      );
    }
    expect(wakings).toBeGreaterThan(500);
    expect(napNamed / wakings).toBeLessThanOrEqual(0.02);
    expect(morningsAnswered / mornings).toBeGreaterThanOrEqual(0.92);
  }, 60_000);
});

describe('which sleep comes next', () => {
  it('knows a nap from the night about nineteen times in twenty', () => {
    const right = kindRight(RUN.scored);
    if (REPORT) console.log(`nap or night: ${(100 * right).toFixed(1)}% right`);
    expect(right).toBeGreaterThanOrEqual(0.93);
  });
});

describe('asleep: when this sleep usually ends', () => {
  /*
    Five minutes into every real sleep from the fourth day, with the log as the parent would have it
    then: everything before, and this one still running. A night logged in pieces is asked about at
    its first piece only — the one that began the night.
  */
  const { naps, nights, filed, filedRight } = asleepScores(POPULATION);

  it('says when the night usually ends — within twenty minutes at the middle', () => {
    const s = stats(nights);
    if (REPORT) console.log(row('asleep, the night', s));
    expect(s.n).toBeGreaterThan(3_000);
    expect(s.median).toBeLessThanOrEqual(20);
    // a night taken for a nap is ten hours out, so this is mostly a count of those — see the next
    expect(s.mae).toBeLessThanOrEqual(33);
  });

  it('says how long a nap usually runs', () => {
    const s = stats(naps);
    if (REPORT) console.log(row('asleep, a nap', s));
    // one cycle or several: at the first minute nobody can know which, so this is the hard number
    expect(s.n).toBeGreaterThan(8_000);
    expect(s.median).toBeLessThanOrEqual(27);
  });

  it('keeps its answer as a nap runs: from fifty minutes in, never an end time already gone', () => {
    /*
      A nap is one sleep cycle or several, so once one has run past the first cycle the usual
      length is the wrong question. Asked again at 50, 80 and 110 minutes into every nap still
      running then, the end comes from the naps that got that far.
    */
    const { errs, gone } = runningNapScores(POPULATION);
    const s = stats(errs);
    if (REPORT) console.log(row('asleep, a nap, 50–110m in', s));
    expect(s.n).toBeGreaterThan(8_000);
    expect(gone).toBe(0);
    expect(s.mae).toBeLessThanOrEqual(21);
  }, 60_000);

  it('files a sleep that just began as a nap or the night, rightly, nearly every time', () => {
    if (REPORT)
      console.log(
        `asleep, nap or night: ${((100 * filedRight) / filed).toFixed(1)}% right of ${filed}`,
      );
    expect(filedRight / filed).toBeGreaterThanOrEqual(0.97);
  });
});

describe('not tuned to one idea of a baby', () => {
  /*
    The parts of the research that are least settled, each pushed to an edge: whether a short nap
    shortens the next window hard, whether the clock matters at all, a day-to-day wobble 40% wider,
    and a household in four whose routine moves. A smaller population each, to keep this quick.
  */
  const SCENARIOS: readonly [string, SimParams, number][] = [
    ['short naps shorten the next window hard', { ...DEFAULT_SIM, shortNapK: 0.6 }, 24.5],
    ['no clock at all, only sleep pressure', { ...DEFAULT_SIM, circadianScale: 0 }, 27.5],
    ['a much stronger clock', { ...DEFAULT_SIM, circadianScale: 1.5 }, 21],
    ['a noisier day', { ...DEFAULT_SIM, noiseScale: 1.4 }, 28],
    ['most routines move', { ...DEFAULT_SIM, shiftShare: 0.8 }, 23],
  ];

  it.each(SCENARIOS)(
    '%s',
    (name, params, ceiling) => {
      const s = of(replay(simulatePopulation(4000, 60, 30, 540, 28, params)).scored);
      if (REPORT) console.log(row(name, s));
      expect(s.mae).toBeLessThanOrEqual(ceiling);
    },
    60_000,
  );
});
