/**
 * THE SCORING BENCH for the feed and pump heads-up — test support, like `foresight.sim.ts`; never
 * shipped. The backtest and the scenario suite both score through here, so the two cannot drift
 * into measuring different things.
 *
 * WHEN A PREDICTION IS SCORED. The phone re-plans its reminders whenever the log changes, so the
 * moment that matters is right after an entry is logged: the heads-up it plans then is the one the
 * parent gets. Every logged feed (or pump) from the fourth day on is such a moment. The engine is
 * shown the log as the phone had it then — nothing after — and its next feed is compared with the
 * next feed that really happened. Anything within 30 minutes of the moment is the feed being
 * logged, not the next one: a top-up bottle or a second side is part of the same feed.
 */
import { rhythms, type Beat, type Rhythm } from './foresight';
import type { FeedHousehold, Truth } from './foresight.sim';
import { SIM_DAY0 } from './naps.sim';
import { MIN } from './types';

const DAY = 24 * 60 * MIN;
const SAME_FEED_MS = 30 * MIN;

export type Predictor = (beats: readonly Beat[], nowMs: number) => readonly Rhythm[];

/** The engine as it ships. The bench's clock is UTC, as `foresight.sim.ts`'s days are. */
export const shipped: Predictor = (beats, nowMs) => rhythms(beats, nowMs);

/**
 * THE FIRST ENGINE, kept here as the bar the shipped one is held above: per activity, one plain
 * median of every gap between ten minutes and eight hours over the last two weeks. It is the
 * simplest rule anyone would write, and it is what shipped until 2026-09-23.
 */
export const firstEngine: Predictor = (beats, nowMs) => {
  const since = nowMs - 14 * DAY;
  const byActivity = new Map<string, number[]>();
  for (const b of beats) {
    if (b.startMs < since || b.startMs > nowMs) continue;
    const list = byActivity.get(b.activity) ?? [];
    list.push(b.startMs);
    byActivity.set(b.activity, list);
  }
  const out: Rhythm[] = [];
  for (const [activity, starts] of byActivity) {
    starts.sort((a, b) => a - b);
    const gaps: number[] = [];
    for (let i = 1; i < starts.length; i++) {
      const gap = (starts[i] ?? 0) - (starts[i - 1] ?? 0);
      if (gap >= 10 * MIN && gap <= 8 * 60 * MIN) gaps.push(gap);
    }
    if (gaps.length < 4) continue;
    const gapMs = quantile(gaps, 0.5);
    const lastAtMs = starts[starts.length - 1] ?? 0;
    out.push({
      activity,
      medianGapMs: gapMs,
      samples: gaps.length,
      lastAtMs,
      nextAtMs: lastAtMs + gapMs,
    });
  }
  return out;
};

export const FEEDS: ReadonlySet<string> = new Set(['bottle', 'breastfeed']);
export const PUMPS: ReadonlySet<string> = new Set(['pump']);

/** The heads-up the parent would get: the earliest of the group's rhythms still ahead. */
export function nextOf(
  rs: readonly Rhythm[],
  group: ReadonlySet<string>,
  nowMs: number,
): Rhythm | null {
  let best: Rhythm | null = null;
  for (const r of rs) {
    if (!group.has(r.activity) || r.nextAtMs <= nowMs) continue;
    if (best === null || r.nextAtMs < best.nextAtMs) best = r;
  }
  return best;
}

export interface Scored {
  /** Predicted minus actual, in minutes: late is positive. */
  err: number;
  /** The moment was a night feed (or the heads-up would land in the night). */
  night: boolean;
  h: FeedHousehold;
  nowMs: number;
  predictedMs: number;
  actualMs: number;
}

export interface Replay {
  scored: Scored[];
  /** Moments asked about. */
  asked: number;
  /** Moments with no answer at all. */
  silent: number;
  /**
   * A heads-up planned into a night with no feed in it: after the bedtime feed of a baby who now
   * sleeps through, landing more than 90 minutes before the morning feed. That is a notification
   * at 1 a.m. for nothing — the one error a parent would switch the whole feature off over.
   */
  nightFalse: number;
  /** Bedtime feeds of a baby who sleeps through, asked about. */
  nightThrough: number;
}

const nextTruth = (truth: readonly Truth[], afterMs: number): Truth | undefined =>
  truth.find(t => t.startMs > afterMs);

export function replay(
  pop: readonly FeedHousehold[],
  group: ReadonlySet<string>,
  predict: Predictor = shipped,
): Replay {
  const scored: Scored[] = [];
  let asked = 0;
  let silent = 0;
  let nightFalse = 0;
  let nightThrough = 0;
  for (const h of pop) {
    const truth = group === FEEDS ? h.feeds : h.pumps;
    const logs = h.logs;
    for (let i = 0; i < logs.length; i++) {
      const b = logs[i] as Beat;
      if (!group.has(b.activity) || b.startMs < SIM_DAY0 + 3 * DAY) continue;
      const nowMs = b.startMs;
      const next = nextTruth(truth, nowMs + SAME_FEED_MS);
      if (next === undefined) continue;
      asked += 1;
      const seen = logs.slice(0, i + 1);
      const r = nextOf(predict(seen, nowMs), group, nowMs);
      // the bedtime feed of a baby who now sleeps through: is a heads-up planned into the night?
      const day = Math.floor((nowMs - SIM_DAY0) / DAY);
      const minute = ((nowMs - SIM_DAY0) % DAY) / MIN;
      const bedtime =
        group === FEEDS &&
        day >= h.params.throughFromDay &&
        Math.abs(minute - h.params.bedMin) < 60 &&
        next.startMs - nowMs > 8 * 60 * MIN;
      if (bedtime) {
        nightThrough += 1;
        if (r !== null && r.nextAtMs < next.startMs - 90 * MIN) nightFalse += 1;
      }
      if (r === null) {
        silent += 1;
        continue;
      }
      const current = [...truth].reverse().find(t => t.startMs <= nowMs + 10 * MIN);
      scored.push({
        err: (r.nextAtMs - next.startMs) / MIN,
        night: current?.night === true || next.night,
        h,
        nowMs,
        predictedMs: r.nextAtMs,
        actualMs: next.startMs,
      });
    }
  }
  return { scored, asked, silent, nightFalse, nightThrough };
}

/* ------------------------------------------------------------------ statistics */

export const quantile = (xs: readonly number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? NaN : (s[Math.min(s.length - 1, Math.floor(q * s.length))] as number);
};

export interface Stats {
  n: number;
  mae: number;
  median: number;
  p90: number;
  within15: number;
  within30: number;
  bias: number;
}

export function stats(errs: readonly number[]): Stats {
  const abs = errs.map(Math.abs);
  const n = Math.max(1, abs.length);
  return {
    n: abs.length,
    mae: abs.reduce((a, b) => a + b, 0) / n,
    median: quantile(abs, 0.5),
    p90: quantile(abs, 0.9),
    within15: abs.filter(x => x <= 15).length / n,
    within30: abs.filter(x => x <= 30).length / n,
    bias: errs.reduce((a, b) => a + b, 0) / n,
  };
}

export const of = (scored: readonly Scored[], keep: (s: Scored) => boolean = () => true): Stats =>
  stats(scored.filter(keep).map(s => s.err));

/** One line of a report table. */
export const row = (name: string, s: Stats): string =>
  `${name.padEnd(30)} MAE ${s.mae.toFixed(1).padStart(5)}  median ${s.median.toFixed(1).padStart(5)}` +
  `  p90 ${s.p90.toFixed(1).padStart(6)}  ±15 ${Math.round(100 * s.within15)}%  ±30 ${Math.round(100 * s.within30)}%` +
  `  bias ${s.bias.toFixed(1).padStart(6)}  n ${s.n}`;
