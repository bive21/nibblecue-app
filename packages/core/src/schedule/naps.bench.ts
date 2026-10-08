/**
 * THE SCORING BENCH — how every nap outlook test measures a prediction against what really
 * happened. Test support, like `naps.sim.ts`; never shipped. The backtest and the scenario suite
 * both score through here, so the two cannot drift into measuring different things.
 *
 * Every function replays a household's log the way the phone would have seen it at that moment —
 * nothing after `nowMs` — and compares the engine's answer with the simulator's truth.
 */
import { zoneAt } from '../today/travel';
import { napOutlook, type NapOutlook, type SleepLog } from './naps';
import { napOutlookOnLocalClocks, type LocalClocks } from './naps.local';
import { SIM_DAY0, simDayStartOf, type SimEvent, type SimHousehold } from './naps.sim';
import { MIN } from './types';

const DAY = 24 * 60 * MIN;

export type Predict = (logs: readonly SleepLog[], nowMs: number) => NapOutlook;
export const engine: Predict = (logs, nowMs) => napOutlook(logs, nowMs, simDayStartOf);

/**
 * A PHONE THAT WENT SOMEWHERE: from `hour` o'clock on `day` (by the home clock), it read times
 * `offset` minutes east of home. The bench's home is UTC, so a zone's name can simply be its
 * offset and the clocks read it back; before the first change the phone was at home.
 */
export interface SimZone {
  day: number;
  hour: number;
  offset: number;
}

export function simClocks(zones: readonly SimZone[]): LocalClocks {
  const record = zones.map(z => ({
    fromMs: SIM_DAY0 + z.day * DAY + z.hour * 60 * MIN,
    zone: String(z.offset),
  }));
  return { zoneAt: ms => zoneAt(record, ms, '0'), offsetMs: zone => Number(zone) * MIN };
}

/** The outlook as the app computes it (`useNapOutlook`), on a phone with this record of zones. */
export const onThePhone = (zones: readonly SimZone[]): Predict => {
  const clocks = simClocks(zones);
  return (logs, nowMs) => napOutlookOnLocalClocks(logs, nowMs, clocks);
};

const sorted = (h: SimHousehold): SleepLog[] => [...h.logs].sort((a, b) => a.startMs - b.startMs);
const dayOf = (ms: number): number => Math.floor((ms - SIM_DAY0) / DAY);

export interface Scored {
  /** Predicted minus actual, in minutes: late is positive. */
  err: number;
  ev: SimEvent;
  h: SimHousehold;
  o: NapOutlook;
}

/**
 * EVERY WAKING FROM THE THIRD DAY ON — the moment the card is read and the heads-up is planned.
 * The first two days are left out because the engine rightly says nothing on them.
 */
export function replay(pop: readonly SimHousehold[], predict: Predict = engine) {
  const scored: Scored[] = [];
  let asked = 0;
  for (const h of pop) {
    const logs = sorted(h);
    for (const ev of h.events) {
      if (ev.day < 2) continue;
      asked += 1;
      const o = predict(
        logs.filter(l => l.startMs <= ev.atMs),
        ev.atMs,
      );
      if (o.nextAtMs === null) continue;
      scored.push({ err: (o.nextAtMs - ev.nextStartMs) / MIN, ev, h, o });
    }
  }
  return { scored, asked };
}

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

/** Of the wakings that got a nap-or-night answer, how many named the sleep that really came next. */
export function kindRight(scored: readonly Scored[]): number {
  const named = scored.filter(s => s.o.nextKind !== null);
  const right = named.filter(s => (s.o.nextKind === 'night') === s.ev.nextIsNight).length;
  return named.length === 0 ? NaN : right / named.length;
}

/**
 * ASLEEP: five minutes into every real sleep from the fourth day, with the log as the parent would
 * have it then — everything before, and this one still running. A night logged in pieces is asked
 * about at its first piece only, the one that began the night.
 */
export function asleepScores(pop: readonly SimHousehold[], predict: Predict = engine) {
  const naps: number[] = [];
  const nights: number[] = [];
  let filed = 0;
  let filedRight = 0;
  for (const h of pop) {
    const logs = sorted(h);
    const first = logs[0]?.startMs ?? 0;
    for (const l of logs) {
      if (l.endMs === null || Math.floor((l.startMs - first) / DAY) < 3) continue;
      const truth = h.truth.find(t => Math.abs(t.startMs - l.startMs) < 10 * MIN);
      if (truth === undefined) continue;
      const upto = [...logs.filter(x => x.startMs < l.startMs), { ...l, endMs: null }];
      const o = predict(upto, l.startMs + 5 * MIN);
      if (o.nextKind !== null) {
        filed += 1;
        if ((o.nextKind === 'night') === truth.night) filedRight += 1;
      }
      if (o.wakeAtMs === null) continue;
      (truth.night ? nights : naps).push((o.wakeAtMs - truth.endMs) / MIN);
    }
  }
  return { naps, nights, filed, filedRight };
}

/**
 * A NAP AS IT RUNS: asked again at each of `minutes` into every nap still running then. `gone`
 * counts the end times already in the past — which the card must never show.
 */
export function runningNapScores(
  pop: readonly SimHousehold[],
  minutes: readonly number[] = [50, 80, 110],
  predict: Predict = engine,
) {
  const errs: number[] = [];
  let gone = 0;
  for (const h of pop) {
    const logs = sorted(h);
    const first = logs[0]?.startMs ?? 0;
    for (const l of logs) {
      if (l.endMs === null || Math.floor((l.startMs - first) / DAY) < 3) continue;
      const truth = h.truth.find(t => Math.abs(t.startMs - l.startMs) < 10 * MIN);
      if (truth === undefined || truth.night) continue;
      const before = logs.filter(x => x.startMs < l.startMs);
      for (const m of minutes) {
        const nowMs = l.startMs + m * MIN;
        if (nowMs >= truth.endMs || nowMs >= l.endMs) continue;
        const o = predict([...before, { ...l, endMs: null }], nowMs);
        if (o.nextKind !== 'nap' || o.wakeAtMs === null) continue;
        if (o.wakeAtMs <= nowMs) gone += 1;
        errs.push((o.wakeAtMs - truth.endMs) / MIN);
      }
    }
  }
  return { errs, gone };
}

/**
 * AWAKE IN THE NIGHT: every waking in a household that logs the night in pieces, ten minutes after
 * it. A night waking must name no nap; the morning waking must still get its first window.
 */
export function nightWakingScores(pop: readonly SimHousehold[], predict: Predict = engine) {
  let wakings = 0;
  let napNamed = 0;
  let mornings = 0;
  let morningsAnswered = 0;
  for (const h of pop) {
    if (!h.pieceNight) continue;
    const logs = sorted(h);
    const first = logs[0]?.startMs ?? 0;
    for (const l of logs) {
      if (l.endMs === null || Math.floor((l.startMs - first) / DAY) < 3) continue;
      const end = l.endMs;
      const night = h.truth.find(t => t.night && end > t.startMs && end <= t.endMs + 15 * MIN);
      if (night === undefined) continue;
      const o = predict(
        logs.filter(x => x.startMs <= end),
        end + 10 * MIN,
      );
      if (Math.abs(end - night.endMs) <= 15 * MIN) {
        mornings += 1;
        if (o.nextAtMs !== null) morningsAnswered += 1;
      } else {
        wakings += 1;
        if (o.nextKind === 'nap' && o.nextAtMs !== null) napNamed += 1;
      }
    }
  }
  return { wakings, napNamed, mornings, morningsAnswered };
}

/**
 * A GLANCE AT A FIXED TIME OF DAY — the parent opening the app at pickup, say — on the days `keep`
 * picks, whenever the baby is awake then. Scored against the next sleep that really began; `past`
 * counts answers already behind the clock, `silent` the glances with no answer at all.
 */
export function glanceScores(
  pop: readonly SimHousehold[],
  minuteOfDay: number,
  keep: (day: number) => boolean,
  predict: Predict = engine,
) {
  const errs: number[] = [];
  let past = 0;
  let silent = 0;
  let asked = 0;
  for (const h of pop) {
    const logs = sorted(h);
    for (let d = 2; d < h.days; d++) {
      if (!keep(d)) continue;
      const nowMs = SIM_DAY0 + d * DAY + minuteOfDay * MIN;
      if (h.truth.some(t => t.startMs <= nowMs && t.endMs > nowMs)) continue; // asleep then
      const next = h.truth.find(t => t.startMs > nowMs);
      if (next === undefined) continue;
      asked += 1;
      const o = predict(
        logs.filter(l => l.startMs <= nowMs),
        nowMs,
      );
      if (o.nextAtMs === null) {
        silent += 1;
        continue;
      }
      if (o.nextAtMs < nowMs - 5 * MIN) past += 1;
      errs.push((o.nextAtMs - next.startMs) / MIN);
    }
  }
  return { errs, past, silent, asked };
}

export const dayOfWeek = (day: number): number => day % 7; // SIM_DAY0 is a Monday
export const isWeekend = (day: number): boolean => dayOfWeek(day) >= 5;
export { dayOf };

/** One line of a report table. */
export const row = (name: string, s: Stats): string =>
  `${name.padEnd(28)} MAE ${s.mae.toFixed(1).padStart(5)}  median ${s.median.toFixed(1).padStart(5)}` +
  `  p90 ${s.p90.toFixed(1).padStart(5)}  ±15 ${Math.round(100 * s.within15)}%  ±30 ${Math.round(100 * s.within30)}%` +
  `  bias ${s.bias.toFixed(1).padStart(5)}  n ${s.n}`;
