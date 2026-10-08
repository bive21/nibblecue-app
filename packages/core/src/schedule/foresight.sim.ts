/**
 * SIMULATED FEEDS AND PUMPS — the bench the feed and pump heads-up is measured on. Test support,
 * like `naps.sim.ts`; never shipped.
 *
 * WHY IT EXISTS. The owner asked for the reminders to be accurate, and the nap outlook showed that
 * "accurate" is a number, not an adjective: it needs logs whose true answer is known. There is no
 * real household's log in this repository and there must not be one, so this generates feeds and
 * pumps that follow the published guidance, logs them the way tired parents log, and hands the
 * backtest both.
 *
 * ── WHAT IT ENCODES, AND WHERE EACH PIECE COMES FROM ────────────────────────────────────────
 *
 *   * THE GAP BETWEEN FEEDS LENGTHENS WITH AGE. Every 2–3 hours in the first weeks (8–12 feeds a
 *     day breastfed), about every 3 by two months, 3–4 by four months, around 4 once solids start
 *     (AAP/HealthyChildren "How often and how much should your baby eat?", CDC infant feeding, NHS
 *     "Breastfeeding: how often and how long"). `DAY_GAP`.
 *   * BREASTFED BABIES FEED A LITTLE MORE OFTEN than formula-fed ones — breast milk empties from
 *     the stomach faster. A factor either way on the same curve.
 *   * THE NIGHT IS DIFFERENT FROM THE DAY. The first stretch after the bedtime feed is the longest
 *     and grows fastest — 3 h in the first weeks, 5–6 h by three months — and later night feeds sit
 *     closer together. From four to six months a growing share sleep through without a feed
 *     (AAP; Mindell's app-logged cohorts show the same shift). `NIGHT_FIRST`, `NIGHT_GAP`,
 *     `SLEEPS_THROUGH`.
 *   * CLUSTER FEEDING. In the first two to three months many babies feed every hour or so in the
 *     late afternoon and evening (La Leche League; NHS). A household either does it or does not.
 *   * GROWTH SPURTS. A few days of more frequent feeding around 2–3 weeks, 6 weeks, 3 months and
 *     6 months (commonly described; the timing varies, so each household draws its own).
 *   * MIXED FEEDING IS ONE FEED LOGGED TWICE. A breastfeed topped up with a bottle 15–30 minutes
 *     later is one feed to the baby and two entries in the log; a breastfeed logged a side at a
 *     time is the same. A prediction that treats the second entry as "a feed" learns a 20-minute
 *     rhythm.
 *   * PUMPING FOLLOWS THE PARENT'S CLOCK. An exclusive pumper runs 8 sessions a day in the first
 *     weeks and 5–6 later, at roughly fixed times; a parent back at work pumps at 10, 1 and 4 on
 *     weekdays and not at all at weekends; others pump once after the first morning feed.
 *   * PARENTS LOG IMPERFECTLY: a few minutes' jitter, entries logged afterwards and rounded to the
 *     quarter hour, night feeds missed more often than day ones, and now and then both parents
 *     logging the same bottle.
 *
 * ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────────────────────────
 *
 * It is a model of babies and parents. It makes a fair comparison between prediction methods and
 * a firm floor under the one shipped; it is not a promise about any real baby. The first real
 * (consented, aggregate) logs are what this gets recalibrated against.
 *
 * Every function is pure and seeded; the same seed is the same household on every machine.
 */
import type { Beat } from './foresight';
import { mulberry32, SIM_DAY0 } from './naps.sim';
import { MIN } from './types';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

type Rand = () => number;

function gauss(r: Rand): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
const logNormal = (r: Rand, median: number, sigma: number): number =>
  median * Math.exp(sigma * gauss(r));
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Piecewise-linear over `[age in days, value]` anchors, flat beyond the ends. */
function interp(anchors: readonly (readonly [number, number])[], x: number): number {
  const first = anchors[0];
  const last = anchors[anchors.length - 1];
  if (first === undefined || last === undefined) return 0;
  if (x <= first[0]) return first[1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const a = anchors[i - 1] as readonly [number, number];
    const b = anchors[i] as readonly [number, number];
    if (x <= b[0]) return a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  }
  return last[1];
}

/* ------------------------------------------------------------------ the curves */

/** The middle daytime gap between feed STARTS, in minutes, by age in days. */
export const DAY_GAP: readonly (readonly [number, number])[] = [
  [0, 150],
  [14, 160],
  [30, 170],
  [60, 180],
  [90, 195],
  [120, 210],
  [180, 225],
  [270, 240],
  [365, 255],
];
/** The first night stretch — bedtime feed to the first night feed — in minutes. */
export const NIGHT_FIRST: readonly (readonly [number, number])[] = [
  [0, 180],
  [30, 220],
  [60, 280],
  [90, 330],
  [120, 360],
  [180, 400],
];
/** The later night gaps, in minutes. */
export const NIGHT_GAP: readonly (readonly [number, number])[] = [
  [0, 170],
  [30, 195],
  [60, 225],
  [90, 250],
  [120, 270],
];
/** The share of babies that sleep through without a feed, by age. */
export const SLEEPS_THROUGH: readonly (readonly [number, number])[] = [
  [0, 0],
  [90, 0.05],
  [120, 0.25],
  [180, 0.45],
  [270, 0.65],
  [365, 0.8],
];
const SPURT_AGES = [18, 42, 90, 180] as const;

/* ------------------------------------------------------------------ one household */

export type Feeding = 'breast' | 'bottle' | 'mixed';
export type Pumping = 'none' | 'exclusive' | 'work' | 'morning';

export interface FeedSimParams {
  /** Age in days on day 0. */
  ageDays: number;
  days: number;
  feeding: Feeding;
  pumping: Pumping;
  /** Minutes after midnight of the first feed of the day, and of the bedtime feed. */
  wakeMin: number;
  bedMin: number;
  cluster: boolean;
  /** Sleeps through without a night feed from this day on (`Infinity`: never in the run). */
  throughFromDay: number;
  /** A breastfeed is topped up with a bottle, as a separate entry, this often. */
  topUp: number;
  /** A breastfeed is logged a side at a time, as two entries, this often. */
  splitSides: number;
  /** Day-to-day gap variability (log-normal sigma). */
  sigma: number;
  logging: {
    jitterMin: number;
    missDay: number;
    missNight: number;
    dupe: number;
    /** Logged afterwards and rounded to the quarter hour, this often. */
    rounded: number;
  };
}

/** A real feed or pump, as it happened. */
export interface Truth {
  startMs: number;
  night: boolean;
}

export interface FeedHousehold {
  params: FeedSimParams;
  /** Every feed SESSION the baby had (a topped-up breastfeed is one), in order. */
  feeds: Truth[];
  /** Every pump the parent did, in order. */
  pumps: Truth[];
  /** What the parents logged, as the engine reads it. */
  logs: Beat[];
}

const minuteOf = (ms: number): number => Math.floor((((ms % DAY) + DAY) % DAY) / MIN);

function spurtFactor(ageDays: number, spurts: readonly number[]): number {
  return spurts.some(s => ageDays >= s && ageDays < s + 3) ? 0.8 : 1;
}

/** The real feeds, played forward from the first morning. */
function simulateFeeds(p: FeedSimParams, r: Rand): Truth[] {
  const spurts = SPURT_AGES.map(a => a + Math.round((r() - 0.5) * 6));
  const kind = p.feeding === 'breast' ? 0.9 : p.feeding === 'bottle' ? 1.08 : 1;
  const out: Truth[] = [];
  for (let d = 0; d < p.days; d++) {
    const day0 = SIM_DAY0 + d * DAY;
    const age = p.ageDays + d;
    const spurt = spurtFactor(age, spurts);
    const wake = day0 + (p.wakeMin + gauss(r) * 15) * MIN;
    const bed = day0 + (p.bedMin + gauss(r) * 15) * MIN;
    // the day: from the morning feed, gap by gap, until the bedtime feed
    let t = wake;
    for (;;) {
      out.push({ startMs: t, night: false });
      const m = minuteOf(t);
      const clusterNow = p.cluster && age < 84 && m >= 16 * 60 + 30;
      const median = interp(DAY_GAP, age) * kind * spurt * (clusterNow ? 0.45 : 1);
      const next = t + clamp(logNormal(r, median, p.sigma), 40, 360) * MIN;
      // the bedtime feed: whatever falls within the last 45 minutes becomes it
      if (next >= bed - 45 * MIN) {
        if (bed - t > 45 * MIN) out.push({ startMs: bed, night: false });
        break;
      }
      t = next;
    }
    // the night: nothing if this baby sleeps through by now, else a first stretch and the rest
    if (d >= p.throughFromDay) continue;
    const morning = SIM_DAY0 + (d + 1) * DAY + p.wakeMin * MIN;
    let n = bed + clamp(logNormal(r, interp(NIGHT_FIRST, age) * spurt, p.sigma), 90, 600) * MIN;
    while (n < morning - 60 * MIN) {
      out.push({ startMs: n, night: true });
      n += clamp(logNormal(r, interp(NIGHT_GAP, age) * spurt, p.sigma), 90, 480) * MIN;
    }
  }
  return out;
}

/** The real pumps: the parent's own clock, not the baby's. */
function simulatePumps(p: FeedSimParams, r: Rand): Truth[] {
  const out: Truth[] = [];
  const at = (d: number, minute: number, night = false) =>
    out.push({ startMs: SIM_DAY0 + d * DAY + (minute + gauss(r) * 20) * MIN, night });
  for (let d = 0; d < p.days; d++) {
    const age = p.ageDays + d;
    const weekday = d % 7 < 5; // SIM_DAY0 is a Monday
    if (p.pumping === 'morning') {
      if (r() > 0.15) at(d, p.wakeMin + 30);
    } else if (p.pumping === 'work') {
      if (weekday) for (const m of [10 * 60, 13 * 60, 16 * 60]) at(d, m);
    } else if (p.pumping === 'exclusive') {
      // sessions spread over the waking day, plus the night ones the early weeks need
      const perDay = age < 60 ? 6 : age < 120 ? 5 : 5;
      const span = p.bedMin + 60 - p.wakeMin;
      for (let i = 0; i < perDay; i++) at(d, p.wakeMin + (span * i) / (perDay - 1));
      if (age < 60) {
        at(d, 24 * 60 + 60, true);
        at(d, 24 * 60 + 240, true);
      } else if (age < 120) at(d, 24 * 60 + 120, true);
    }
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/** The entries a household makes for its feeds and pumps. */
function logAll(p: FeedSimParams, feeds: readonly Truth[], pumps: readonly Truth[], r: Rand) {
  const logs: Beat[] = [];
  const stamp = (ms: number): number => {
    let t = ms + gauss(r) * p.logging.jitterMin * MIN;
    if (r() < p.logging.rounded) t = Math.round(t / (15 * MIN)) * 15 * MIN;
    return t;
  };
  const missed = (t: Truth): boolean => r() < (t.night ? p.logging.missNight : p.logging.missDay);
  for (const f of feeds) {
    if (missed(f)) continue;
    const breast = p.feeding === 'breast' || (p.feeding === 'mixed' && r() < 0.7);
    const activity = breast ? 'breastfeed' : 'bottle';
    const at = stamp(f.startMs);
    logs.push({ activity, startMs: at });
    if (breast && p.feeding === 'mixed' && r() < p.topUp) {
      logs.push({ activity: 'bottle', startMs: at + (15 + r() * 15) * MIN });
    } else if (breast && r() < p.splitSides) {
      logs.push({ activity: 'breastfeed', startMs: at + (12 + r() * 8) * MIN });
    }
    if (!breast && r() < p.logging.dupe) {
      logs.push({ activity: 'bottle', startMs: at + (1 + r() * 4) * MIN });
    }
  }
  for (const pump of pumps) {
    if (r() < 0.05) continue;
    logs.push({ activity: 'pump', startMs: stamp(pump.startMs) });
  }
  return logs.sort((a, b) => a.startMs - b.startMs);
}

/** The default household drawn for a seed and an age: the population the backtest runs on. */
export function drawParams(seed: number, ageDays: number, days: number): FeedSimParams {
  const r = mulberry32(seed * 7919 + 17);
  const f = r();
  const feeding: Feeding = f < 0.4 ? 'breast' : f < 0.75 ? 'bottle' : 'mixed';
  const q = r();
  const pumping: Pumping =
    feeding === 'bottle'
      ? q < 0.2
        ? 'exclusive'
        : 'none'
      : q < 0.15
        ? 'exclusive'
        : q < 0.4
          ? 'work'
          : q < 0.6
            ? 'morning'
            : 'none';
  const through = r() < interp(SLEEPS_THROUGH, ageDays + days / 2);
  return {
    ageDays,
    days,
    feeding,
    pumping,
    wakeMin: Math.round(6.5 * 60 + gauss(r) * 30),
    bedMin: Math.round(19.5 * 60 + gauss(r) * 30),
    cluster: r() < 0.6,
    throughFromDay: through ? Math.floor(r() * (days / 2)) : Infinity,
    topUp: feeding === 'mixed' ? 0.3 : 0,
    splitSides: feeding !== 'bottle' && r() < 0.15 ? 0.4 : 0,
    sigma: 0.12 + r() * 0.08,
    logging: {
      jitterMin: 3,
      missDay: 0.03,
      missNight: 0.1,
      dupe: 0.02,
      rounded: 0.2,
    },
  };
}

export function simulateHousehold(seed: number, params: FeedSimParams): FeedHousehold {
  const r = mulberry32(seed);
  const feeds = simulateFeeds(params, r);
  const pumps = params.pumping === 'none' ? [] : simulatePumps(params, r);
  return { params, feeds, pumps, logs: logAll(params, feeds, pumps, r) };
}

/** `count` households from `fromAge` to `toAge` days old, `days` days each, all seeded. */
export function simulateFeedPopulation(
  seed: number,
  count: number,
  fromAge: number,
  toAge: number,
  days: number,
  tweak: (p: FeedSimParams) => FeedSimParams = p => p,
): FeedHousehold[] {
  const out: FeedHousehold[] = [];
  for (let i = 0; i < count; i++) {
    const age = Math.round(fromAge + ((toAge - fromAge) * i) / Math.max(1, count - 1));
    out.push(simulateHousehold(seed + i, tweak(drawParams(seed + i, age, days))));
  }
  return out;
}
