/**
 * THE LEARNED WINDOW (the owner, 2026-10-08): sized from the household's own record of how far off
 * the estimate has been, the default either side until there is one, and scored honestly.
 */
import { describe, expect, it } from 'vitest';
import { BANNED } from './foresight.banned';
import { napArrangement, napFace } from './napFace';
import { napAsRhythm, napOutlook, type NapOutlook, type SleepLog } from './naps';
import {
  clockRange,
  napHeadsUpTitle,
  sleepInWindow,
  sleepWindowFrom,
  SLEEP_AROUND,
  SLEEP_BETWEEN,
  SLEEP_IN_WINDOW,
  SLEEP_WINDOW,
} from './naps.copy';
import { replay } from './naps.bench';
import { DEFAULT_SIM, simulatePopulation } from './naps.sim';
import {
  NAP_WINDOW_DEFAULT_MS,
  NAP_WINDOW_MAX_REACH_MS,
  NAP_WINDOW_MIN_SAMPLES,
  napMisses,
  napWindow,
  napWindowRecord,
  withNapWindow,
  type NapMiss,
  type NapMissCache,
} from './napWindow';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const T0 = Date.UTC(2026, 9, 1);
const NOW = T0 + 14 * DAY;
const AT = NOW + 2 * HOUR; // today's estimate

/** Misses at a waking a day apart, ending yesterday, with these errors in minutes. */
const misses = (errs: readonly number[], kind: 'nap' | 'night' = 'nap'): NapMiss[] =>
  errs.map((e, i) => {
    const atMs = NOW - (errs.length - i) * 6 * HOUR;
    return { atMs, kind, sleptAtMs: atMs + 2 * HOUR, errMs: e * MIN };
  });
const mins = (w: { startMs: number; endMs: number }) => [
  (w.startMs - AT) / MIN,
  (w.endMs - AT) / MIN,
];

describe('the window around the estimate', () => {
  it('is the estimate with ten minutes either side until there is a record', () => {
    const w = napWindow(AT, 'nap', misses([3, -4, 8]), NOW);
    expect(mins(w)).toEqual([-NAP_WINDOW_DEFAULT_MS / MIN, NAP_WINDOW_DEFAULT_MS / MIN]);
    expect(w).toMatchObject({ learned: false, samples: 0 });
  });

  it('lands its ends on the five minutes, only ever widening', () => {
    const odd = AT + 3 * MIN; // 2:03
    const w = napWindow(odd, 'nap', [], NOW);
    expect((w.startMs - AT) / MIN).toBe(-10); // 1:53 → 1:50
    expect((w.endMs - AT) / MIN).toBe(15); // 2:13 → 2:15
  });

  it('is the middle of the misses once there are enough of them', () => {
    const w = napWindow(AT, 'nap', misses([-20, -15, -10, -5, 0, 5, 10, 15, 20, 25]), NOW);
    expect(w).toMatchObject({ learned: true, samples: 10 });
    const [lo, hi] = mins(w);
    expect(lo).toBeLessThan(0);
    expect(hi).toBeGreaterThan(0);
    expect(lo).toBeGreaterThanOrEqual(-20);
    expect(hi).toBeLessThanOrEqual(25);
  });

  it('narrows as the estimates get closer, and never below ten minutes in all', () => {
    const wide = napWindow(AT, 'nap', misses([-30, -20, -10, 0, 10, 20, 30, 25]), NOW);
    const close = napWindow(AT, 'nap', misses([-2, -1, 0, 1, 2, 1, 0, -1]), NOW);
    expect(close.endMs - close.startMs).toBeLessThan(wide.endMs - wide.startMs);
    expect(close.endMs - close.startMs).toBeGreaterThanOrEqual(10 * MIN);
  });

  it('leans the way the sleeps have been landing: an estimate that runs early moves later', () => {
    const w = napWindow(AT, 'nap', misses([12, 15, 18, 14, 16, 20, 13, 17]), NOW);
    const [lo, hi] = mins(w);
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeGreaterThanOrEqual(15);
  });

  it('reaches no further than 45 minutes either side, however irregular the record', () => {
    const w = napWindow(AT, 'nap', misses([-120, -90, -80, 70, 90, 120, -100, 110]), NOW);
    const [lo, hi] = mins(w);
    expect(lo).toBeGreaterThanOrEqual(-NAP_WINDOW_MAX_REACH_MS / MIN);
    expect(hi).toBeLessThanOrEqual(NAP_WINDOW_MAX_REACH_MS / MIN);
  });

  it('sizes a bedtime from the bedtimes, and falls back to every miss while they are few', () => {
    const naps = misses([-2, -1, 0, 1, 2, 1, 0, -1]);
    const nights = misses([-40, -30, 30, 40, -35, 35, 38, -38], 'night');
    const bed = napWindow(AT, 'night', [...naps, ...nights], NOW);
    const nap = napWindow(AT, 'nap', [...naps, ...nights], NOW);
    expect(bed.endMs - bed.startMs).toBeGreaterThan(nap.endMs - nap.startMs);
    expect(bed.samples).toBe(8);
    const fewNights = napWindow(AT, 'night', [...naps, ...nights.slice(0, 2)], NOW);
    expect(fewNights.samples).toBe(10);
  });

  it('counts recent misses more than old ones', () => {
    // a few early estimates nine days back, more late ones lately: the window follows the late
    const old = misses(Array.from({ length: 4 }, () => -25)).map(m => ({
      ...m,
      atMs: m.atMs - 9 * DAY,
    }));
    const recent = misses(Array.from({ length: 6 }, () => 20));
    const [lo] = mins(napWindow(AT, 'nap', [...old, ...recent], NOW));
    expect(lo).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ replaying the log */

/** A day of the household's log: night to 6:30, naps at 9:00–10:00 and 1:00–2:30, bed at 7:00. */
function week(days: number, jitterMin: (d: number) => number = () => 0): SleepLog[] {
  const out: SleepLog[] = [];
  for (let d = 0; d < days; d++) {
    const day = T0 + d * DAY;
    const j = jitterMin(d) * MIN;
    out.push({ startMs: day - 5 * HOUR, endMs: day + 6.5 * HOUR, kind: 'NIGHT' });
    out.push({ startMs: day + 9 * HOUR + j, endMs: day + 10 * HOUR + j, kind: 'NAP' });
    out.push({ startMs: day + 13 * HOUR - j, endMs: day + 14.5 * HOUR - j, kind: 'NAP' });
  }
  return out;
}
const predict = (logs: readonly SleepLog[], nowMs: number): NapOutlook =>
  napOutlook(logs, nowMs, ms => Math.floor(ms / DAY) * DAY);

describe('the record of misses', () => {
  it('replays every waking from only what was logged by then', () => {
    const logs = week(10, d => (d % 3) * 10 - 10);
    const now = T0 + 9 * DAY + 20 * HOUR;
    const seen: number[] = [];
    const got = napMisses(logs, now, (l, at) => {
      for (const s of l) expect(s.startMs).toBeLessThanOrEqual(at);
      seen.push(at);
      return predict(l, at);
    });
    expect(seen.length).toBeGreaterThan(10);
    expect(got.length).toBeGreaterThan(NAP_WINDOW_MIN_SAMPLES);
    for (const m of got) expect(m.sleptAtMs).toBeGreaterThan(m.atMs);
  });

  it('keeps each replay until the log before it changes: a new entry replays one waking', () => {
    const logs = week(10);
    const now = T0 + 9 * DAY + 20 * HOUR;
    const cache: NapMissCache = new Map();
    let calls = 0;
    const counted = (l: readonly SleepLog[], at: number) => {
      calls += 1;
      return predict(l, at);
    };
    napMisses(logs, now, counted, cache);
    const first = calls;
    calls = 0;
    napMisses(logs, now, counted, cache);
    expect(calls).toBe(0);
    // tonight's bedtime, logged: the one new waking (after the second nap) is replayed
    const bed = { startMs: T0 + 9 * DAY + 19 * HOUR, endMs: null, kind: 'NIGHT' as const };
    napMisses([...logs, bed], now, counted, cache);
    expect(calls).toBe(1);
    // an older entry edited: everything after it is replayed again, nothing before it
    calls = 0;
    const edited = [...logs];
    edited[20] = { ...edited[20]!, endMs: edited[20]!.endMs! - 5 * MIN };
    napMisses(edited, now, counted, cache);
    expect(calls).toBeGreaterThan(0);
    expect(calls).toBeLessThan(first);
  });

  it('scores the window honestly: each against the window it would have had then', () => {
    const steady = misses(Array.from({ length: 20 }, (_, i) => (i % 5) * 3 - 6));
    const r = napWindowRecord(steady);
    expect(r.judged).toBe(20 - NAP_WINDOW_MIN_SAMPLES);
    expect(r.caught).toBeGreaterThan(r.judged / 2);
    // a record of wild misses catches few, and says so
    const wild = misses(Array.from({ length: 20 }, (_, i) => (i % 2 ? 1 : -1) * (30 + i * 3)));
    const w = napWindowRecord(wild);
    expect(w.caught).toBeLessThan(w.judged / 2);
  });
});

/*
  THE WINDOW ON THE SIMULATED HOUSEHOLDS (`naps.sim.ts`, the backtest's own population): at every
  waking, the window this rule gives from that household's misses so far, and whether the sleep
  really began inside it. A guard, set a little under what it scores today (about 64% caught with
  a median width of 25 minutes, where the plain ten minutes either side catches about 51%), so a
  change that reads well and does worse fails the build. `docs/NAP_OUTLOOK.md` has the table.
*/
describe('on the simulated households', () => {
  const pop = simulatePopulation(3000, 60, 30, 540, 28, DEFAULT_SIM);
  const run = replay(pop);
  const byHouse = new Map<number, typeof run.scored>();
  for (const s of run.scored) byHouse.set(s.h.seed, [...(byHouse.get(s.h.seed) ?? []), s]);
  let caught = 0;
  let fixed = 0;
  let n = 0;
  const widths: number[] = [];
  for (const list of byHouse.values()) {
    list.sort((a, b) => a.ev.atMs - b.ev.atMs);
    const record: NapMiss[] = [];
    for (const s of list) {
      const at = s.o.nextAtMs as number;
      const known = record.filter(m => m.sleptAtMs <= s.ev.atMs);
      const w = napWindow(at, s.o.nextKind ?? 'nap', known, s.ev.atMs);
      n += 1;
      if (s.ev.nextStartMs >= w.startMs && s.ev.nextStartMs <= w.endMs) caught += 1;
      if (Math.abs(s.ev.nextStartMs - at) <= 10 * MIN) fixed += 1;
      widths.push((w.endMs - w.startMs) / MIN);
      record.push({
        atMs: s.ev.atMs,
        kind: s.o.nextKind ?? 'nap',
        sleptAtMs: s.ev.nextStartMs,
        errMs: s.ev.nextStartMs - at,
      });
    }
  }
  widths.sort((a, b) => a - b);

  it('catches the next sleep more often than not', () => {
    expect(n).toBeGreaterThan(3000);
    expect(caught / n).toBeGreaterThanOrEqual(0.6);
  });

  it('beats a fixed ten minutes either side, at about the same width', () => {
    expect(caught / n).toBeGreaterThan(fixed / n + 0.08);
    expect(widths[Math.floor(widths.length / 2)]).toBeLessThanOrEqual(30);
  });
});

describe('the window on the outlook, and everywhere it is read', () => {
  const logs = week(10, d => (d % 3) * 10 - 10);
  const now = T0 + 9 * DAY + 10.5 * HOUR; // awake after the morning nap
  const o = predict(logs, now);
  const record = napMisses(logs, now, predict);
  const w = withNapWindow(o, record, now);

  it('is laid on while awake with a next sleep, opening after the waking, ends on the five', () => {
    expect(o.state).toBe('awake');
    expect(w.windowStartMs).not.toBeNull();
    expect(w.windowStartMs!).toBeGreaterThan(w.awakeSinceMs!);
    expect(w.windowEndMs!).toBeGreaterThan(w.windowStartMs!);
    expect(w.windowStartMs! % (5 * MIN)).toBe(0);
    expect(w.windowSamples).toBeGreaterThanOrEqual(NAP_WINDOW_MIN_SAMPLES);
    expect(w.windowJudged).toBeGreaterThan(0);
    // the engine's own estimate is untouched
    expect(w.nextAtMs).toBe(o.nextAtMs);
  });

  it('is not laid on while asleep or after a gap in the log', () => {
    const asleep = predict([...logs, { startMs: now, endMs: null, kind: 'NAP' }], now + MIN);
    expect(withNapWindow(asleep, record, now).windowStartMs).toBeNull();
    expect(withNapWindow({ ...o, gap: true }, record, now).windowStartMs).toBeNull();
  });

  it("is the card's figure: Between, the window's two clocks, and where it came from", () => {
    const face = napFace(w);
    if (face.kind !== 'pair' || face.right.kind !== 'time') throw new Error('expected a time');
    expect(face.right.qualifier).toBe(SLEEP_BETWEEN);
    expect(face.right.atMs).toBe(w.windowStartMs);
    expect(face.right.untilMs).toBe(w.windowEndMs);
    const labels = face.rows.map(r => r.label);
    expect(labels).toContain(SLEEP_WINDOW);
    expect(labels).toContain(SLEEP_IN_WINDOW);
    // without a window the card says Around, as before
    const plain = napFace(o);
    if (plain.kind !== 'pair' || plain.right.kind !== 'time') throw new Error('expected a time');
    expect(plain.right.qualifier).toBe(SLEEP_AROUND);
    expect(plain.right.untilMs).toBeUndefined();
  });

  it('is the heads-up: fifteen minutes before it opens, naming both ends', () => {
    const r = napAsRhythm(w)!;
    expect(r.nextAtMs).toBe(w.windowStartMs);
    expect(r.nap?.untilMs).toBe(w.windowEndMs);
    expect(napAsRhythm(o)!.nextAtMs).toBe(o.nextAtMs);
    expect(napHeadsUpTitle('nap', 'Ada', clockRange('10:30 AM', '10:50 AM'), true)).toBe(
      'Nap time for Ada 10:30–10:50 AM',
    );
    expect(napHeadsUpTitle('nap', 'Ada', '10:40 AM')).toBe('Nap time for Ada around 10:40 AM');
  });

  it('says its AM/PM once', () => {
    expect(clockRange('2:15 PM', '2:35 PM')).toBe('2:15–2:35 PM');
    expect(clockRange('11:50 AM', '12:10 PM')).toBe('11:50 AM–12:10 PM');
    expect(clockRange('14:15', '14:35')).toBe('14:15–14:35');
  });

  it('takes a whole row on a phone, and sits beside Now only where a column holds it', () => {
    expect(napArrangement(0, 1, true, true).stack).toBe(true);
    expect(napArrangement(390, 1, true, true).stack).toBe(true);
    expect(napArrangement(600, 1, true, true).stack).toBe(false);
    expect(napArrangement(390, 1, true, false).stack).toBe(false);
  });

  it('says nothing about the baby', () => {
    for (const line of [
      sleepWindowFrom(0),
      sleepWindowFrom(12),
      sleepInWindow(9, 14),
      SLEEP_WINDOW,
      SLEEP_IN_WINDOW,
      SLEEP_BETWEEN,
    ])
      for (const word of BANNED) expect(line.toLowerCase()).not.toContain(word);
  });
});
