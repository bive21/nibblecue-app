/**
 * THE NEXT SLEEP AS A WINDOW, SIZED BY HOW FAR OFF THIS HOUSEHOLD'S OWN ESTIMATES HAVE BEEN (the
 * owner, 2026-10-08: "make the nap outlook give a real start and end window … it cannot be right all
 * the time, but if you give ourself a window then we will be more accurate more than not, as long as
 * the system always learns to be better … based on user's data").
 *
 * HOW IT LEARNS. The outlook's estimate (`napOutlook` `nextAtMs`) is replayed at every waking in the
 * household's own recent log, exactly as the phone would have computed it then (only what was logged
 * by that moment), and set beside when the next sleep REALLY began. Those misses are the household's
 * own record of how the estimate does for this baby: the window is the middle of them, laid around
 * today's estimate. Recent misses count more, the way recent days count more in the estimate itself,
 * so as the routine settles the misses shrink and the window narrows; and an estimate that keeps
 * landing early or late gets a window that leans the same way, because that is where the sleeps have
 * been starting.
 *
 * BEFORE THERE IS A RECORD (fewer than `NAP_WINDOW_MIN_SAMPLES` misses of either kind), the window is
 * the estimate with `NAP_WINDOW_DEFAULT_MS` either side — the owner's own "5 or 10 minutes before and
 * after" — and says so (`learned: false`).
 *
 * WHAT IT IS NOT. A spread of the household's own timestamps around the household's own estimate:
 * arithmetic over their log, with the count it came from (CLAUDE.md §2 rule 6). It is never a
 * readiness, a "sleep window" in the physiological sense, or a time the baby should be asleep by, and
 * it says nothing a parent could read as one (`naps.copy.ts`).
 *
 * Pure, and generic over the predictor, so the phone passes the very function its card uses
 * (`napOutlookOnLocalClocks`) and the backtest passes the bench's.
 */
import { recencyWeight, type NapOutlook, type SleepKindNext, type SleepLog } from './naps';
import { MIN } from './types';

const DAY = 24 * 60 * MIN;

/** Either side of the estimate until the household's own record can size it. */
export const NAP_WINDOW_DEFAULT_MS = 10 * MIN;
/** Misses needed before they size the window: two days or so of wakings. */
export const NAP_WINDOW_MIN_SAMPLES = 6;
/**
 * WHICH OF THE MISSES THE WINDOW HOLDS: from the fifth that came earliest to the fifth that came
 * latest, so it is built to catch about three sleeps in five — "more often than not" — and not so
 * wide that it says nothing. The backtest holds what it really catches (`napWindow.backtest.test.ts`).
 */
export const NAP_WINDOW_LOW = 0.2;
export const NAP_WINDOW_HIGH = 0.8;
/** Never narrower than this in all: a window of two minutes is a point with a dash in it. */
export const NAP_WINDOW_MIN_SPAN_MS = 10 * MIN;
/** Never further than this from the estimate on either side, however irregular the record. */
export const NAP_WINDOW_MAX_REACH_MS = 45 * MIN;
/** Its ends land on the five minutes, as a parent would say a time: 2:15–2:35, not 2:13–2:37. */
export const NAP_WINDOW_STEP_MS = 5 * MIN;
/** How far back the record goes: the outlook's own fortnight. */
export const NAP_WINDOW_LOOKBACK_MS = 14 * DAY;

/** Shortest and longest stretch awake a replay counts, the engine's own bounds (`naps.ts`). */
const MIN_AWAKE_MS = 20 * MIN;
const MAX_AWAKE_MS = 8 * 60 * MIN;

/** One past estimate set beside what happened. */
export interface NapMiss {
  /** The waking the estimate was made at. */
  atMs: number;
  /** What the outlook said would come next. */
  kind: SleepKindNext;
  /** When the next sleep really began. */
  sleptAtMs: number;
  /** That, less the estimate: late is positive. */
  errMs: number;
}

export type NapPredict = (logs: readonly SleepLog[], nowMs: number) => NapOutlook;

/**
 * EVERY WAKING IN THE RECORD, REPLAYED. A waking is the end of a logged sleep followed, between
 * twenty minutes and eight hours later, by the next one — the same stretches the engine counts. The
 * estimate is what `predict` said at that waking from the log as it stood then (nothing begun after
 * it); a waking where it said nothing (too little log, a gap, the middle of the night) is not a miss.
 */
export function napMisses(
  logs: readonly SleepLog[],
  nowMs: number,
  predict: NapPredict,
  cache?: NapMissCache,
): NapMiss[] {
  const sorted = logs
    .filter(s => s.startMs <= nowMs && (s.endMs === null || s.startMs < s.endMs))
    .sort((a, b) => a.startMs - b.startMs || (a.endMs ?? 0) - (b.endMs ?? 0));
  // a fingerprint of the log up to each entry, so a waking's replay is reused for as long as
  // nothing before it changed: after a save, only the new waking is replayed
  const prints: number[] = [];
  let h = 2166136261;
  for (const s of sorted) {
    h = mix(
      mix(mix(h, s.startMs), s.endMs ?? -1),
      s.kind === 'NIGHT' ? 1 : s.kind === 'NAP' ? 2 : 0,
    );
    prints.push(h);
  }
  const since = nowMs - NAP_WINDOW_LOOKBACK_MS;
  const out: NapMiss[] = [];
  const used = new Set<string>();
  let furthestEnd = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i] as SleepLog;
    if (a.endMs === null) continue;
    furthestEnd = Math.max(furthestEnd, a.endMs);
    // a piece that ends inside a sleep that is still going on is not a waking
    if (a.endMs < furthestEnd) continue;
    const woke = a.endMs;
    const next = sorted[i + 1] as SleepLog;
    const gap = next.startMs - woke;
    if (woke < since || gap < MIN_AWAKE_MS || gap > MAX_AWAKE_MS) continue;
    // the log as it stood at that waking: every entry begun by then (they are sorted by start)
    let k = i;
    while (k + 1 < sorted.length && (sorted[k + 1] as SleepLog).startMs <= woke) k += 1;
    const key = `${woke}:${k}:${prints[k]}:${next.startMs}`;
    used.add(key);
    let miss = cache?.get(key);
    if (miss === undefined) {
      const o = predict(sorted.slice(0, k + 1), woke);
      miss =
        o.state !== 'awake' || o.gap || o.nextAtMs === null || o.nextKind === null
          ? null
          : {
              atMs: woke,
              kind: o.nextKind,
              sleptAtMs: next.startMs,
              errMs: next.startMs - o.nextAtMs,
            };
      cache?.set(key, miss);
    }
    if (miss !== null) out.push(miss);
  }
  // what no longer matches the log (an entry edited, a waking past the fortnight) is let go
  if (cache !== undefined)
    for (const key of [...cache.keys()]) if (!used.has(key)) cache.delete(key);
  return out;
}

/** Replays kept between calls, by a fingerprint of the log before each waking (`napMisses`). */
export type NapMissCache = Map<string, NapMiss | null>;

/** One step of FNV-1a over a number's two 32-bit halves: a fingerprint, not a secret. */
function mix(h: number, n: number): number {
  const lo = n >>> 0;
  const hi = Math.floor(n / 4294967296) >>> 0;
  return Math.imul(Math.imul(h ^ lo, 16777619) ^ hi, 16777619) >>> 0;
}

/** The value below which `q` of the weight lies. */
function weightedQuantile(
  values: readonly number[],
  weights: readonly number[],
  q: number,
): number {
  const order = values.map((v, i) => ({ v, w: weights[i] ?? 0 })).sort((a, b) => a.v - b.v);
  const total = order.reduce((n, x) => n + x.w, 0);
  if (total <= 0) return order[Math.floor(q * (order.length - 1))]?.v ?? 0;
  let seen = 0;
  for (const x of order) {
    seen += x.w;
    if (seen >= q * total) return x.v;
  }
  return order[order.length - 1]?.v ?? 0;
}

export interface NapWindow {
  startMs: number;
  endMs: number;
  /** How many past estimates sized it; 0 while it is the default either side of the estimate. */
  samples: number;
  /** Sized by the household's own record, or still the default. */
  learned: boolean;
}

/** The misses the window is sized from: the same kind's where there are enough, else every one. */
function poolFor(kind: SleepKindNext, misses: readonly NapMiss[]): readonly NapMiss[] {
  const same = misses.filter(m => m.kind === kind);
  return same.length >= NAP_WINDOW_MIN_SAMPLES ? same : misses;
}

/**
 * THE WINDOW AROUND TODAY'S ESTIMATE, from the record of misses: the misses of the same kind (a
 * nap's are not a bedtime's) where there are enough of them, every miss where there are not, and the
 * default either side where there are not enough of either.
 */
export function napWindow(
  nextAtMs: number,
  kind: SleepKindNext,
  misses: readonly NapMiss[],
  nowMs: number,
): NapWindow {
  const pool = poolFor(kind, misses);
  const learned = pool.length >= NAP_WINDOW_MIN_SAMPLES;
  const { lo, hi } = learned
    ? spread(pool, nowMs)
    : { lo: -NAP_WINDOW_DEFAULT_MS, hi: NAP_WINDOW_DEFAULT_MS };
  return {
    startMs: Math.floor((nextAtMs + lo) / NAP_WINDOW_STEP_MS) * NAP_WINDOW_STEP_MS,
    endMs: Math.ceil((nextAtMs + hi) / NAP_WINDOW_STEP_MS) * NAP_WINDOW_STEP_MS,
    samples: learned ? pool.length : 0,
    learned,
  };
}

/**
 * HOW THE WINDOW HAS DONE, HONESTLY: each past estimate scored against the window this rule would
 * have given AT THAT TIME, from only the misses before it — never against a window sized with its
 * own answer in hand. "Caught 9 of the last 14" is a count of the household's own sleeps; it is how
 * a parent can see the window learning, and it is never a score of the baby.
 */
export function napWindowRecord(misses: readonly NapMiss[]): { caught: number; judged: number } {
  const ordered = [...misses].sort((a, b) => a.atMs - b.atMs);
  let caught = 0;
  let judged = 0;
  for (let j = 0; j < ordered.length; j++) {
    const m = ordered[j] as NapMiss;
    // what was known at that waking: the misses whose sleep had already begun by then
    const prior = ordered
      .slice(0, j)
      .filter(p => p.atMs >= m.atMs - NAP_WINDOW_LOOKBACK_MS && p.sleptAtMs <= m.atMs);
    const pool = poolFor(m.kind, prior);
    if (pool.length < NAP_WINDOW_MIN_SAMPLES) continue;
    const { lo, hi } = spread(pool, m.atMs);
    judged += 1;
    if (m.errMs >= lo && m.errMs <= hi) caught += 1;
  }
  return { caught, judged };
}

/** The middle of the misses, held to a sensible span and reach. */
function spread(pool: readonly NapMiss[], nowMs: number): { lo: number; hi: number } {
  const errs = pool.map(m => m.errMs);
  const weights = pool.map(m => recencyWeight(nowMs - m.atMs));
  let lo = weightedQuantile(errs, weights, NAP_WINDOW_LOW);
  let hi = weightedQuantile(errs, weights, NAP_WINDOW_HIGH);
  if (hi - lo < NAP_WINDOW_MIN_SPAN_MS) {
    const mid = (lo + hi) / 2;
    lo = mid - NAP_WINDOW_MIN_SPAN_MS / 2;
    hi = mid + NAP_WINDOW_MIN_SPAN_MS / 2;
  }
  lo = Math.max(lo, -NAP_WINDOW_MAX_REACH_MS);
  hi = Math.min(hi, NAP_WINDOW_MAX_REACH_MS);
  // a record so lopsided that both ends hit one side still keeps the least span
  if (hi - lo < NAP_WINDOW_MIN_SPAN_MS) {
    if (hi >= NAP_WINDOW_MAX_REACH_MS) lo = hi - NAP_WINDOW_MIN_SPAN_MS;
    else hi = lo + NAP_WINDOW_MIN_SPAN_MS;
  }
  return { lo, hi };
}

/**
 * THE OUTLOOK WITH ITS WINDOW: what every surface reads (Today's card, the heads-up, the lock
 * screen). Only while awake with a next sleep counted from a waking: asleep there is no next sleep,
 * and after a gap in the log the time is the usual clock alone, with no waking to measure from. The
 * window never opens before the waking itself.
 */
export function withNapWindow(
  o: NapOutlook,
  misses: readonly NapMiss[],
  nowMs: number,
): NapOutlook {
  if (
    o.state !== 'awake' ||
    o.gap ||
    o.nextAtMs === null ||
    o.nextKind === null ||
    o.awakeSinceMs === null
  )
    return o;
  const w = napWindow(o.nextAtMs, o.nextKind, misses, nowMs);
  const record = napWindowRecord(misses);
  const startMs = Math.max(w.startMs, o.awakeSinceMs + NAP_WINDOW_STEP_MS);
  return {
    ...o,
    windowStartMs: startMs,
    windowEndMs: Math.max(w.endMs, startMs + NAP_WINDOW_STEP_MS),
    windowSamples: w.samples,
    windowCaught: record.caught,
    windowJudged: record.judged,
  };
}
