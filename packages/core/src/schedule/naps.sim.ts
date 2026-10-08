/**
 * SIMULATED HOUSEHOLDS — the bench the nap outlook is measured on. Test support; never shipped.
 *
 * WHY IT EXISTS. The owner asked (2026-09-23) for the nap prediction to be "as good and accurate
 * as possible". That is a measurement, not an adjective, and a measurement needs logs whose true
 * answer is known. There is no real household's sleep log in this repository and there must not
 * be one, so this generates babies whose sleep follows what the research says drives infant
 * sleep, logs them the way a tired parent actually logs, and hands the backtest both the log and
 * the truth.
 *
 * ── WHAT IT ENCODES, AND WHERE EACH PIECE COMES FROM ────────────────────────────────────────
 *
 *   * SLEEP PRESSURE SETS THE WAKE WINDOW. Pressure builds while awake and clears while asleep,
 *     and in infants both happen faster than in adults (the two-process model; Jenni &
 *     LeBourgeois 2006; PLOS Comp Biol 2024, "Mapping the physiological changes in sleep
 *     regulation across infancy"). The wake window therefore LENGTHENS with age — about 45 min
 *     in the first weeks to 3 h by nine months — which is `WW_ANCHORS`, fitted to the consensus
 *     ranges (a real-world check: Huckleberry's published windows) rather than to any one chart.
 *   * THE FIRST WINDOW OF THE DAY IS THE SHORTEST AND THE LAST THE LONGEST. Residual pressure
 *     and melatonin after the night shorten the first; the evening "wake maintenance zone"
 *     lengthens the last. `positionFactor`.
 *   * A SHORT NAP CLEARS LESS PRESSURE, so the next window runs shorter. How strongly is not
 *     settled — and parents are often advised NOT to shorten it — so the effect is a parameter
 *     (`shortNapK`) and the backtest runs it at zero, moderate and strong.
 *   * THE CLOCK TAKES OVER WITH AGE. A circadian rhythm emerges at 6–12 weeks (melatonin
 *     detectable from ~6 weeks, day/night organized by ~3 months); by six months naps drift
 *     towards habitual clock times ("about 9 and about 1"). `circadianPull` rises with age and
 *     is scaled by `circadianScale` so the bench can ask what happens if it is weaker or
 *     stronger than assumed.
 *   * BEDTIME IS A PARENT'S CLOCK, not a window. Morning wake time is near-invariant from five
 *     months (Mindell 2016, 156,989 app-logged sleeps); bedtime varies by household, and an
 *     objectively measured bedtime spread of ≤ 30 min is common (Nanit Lab, 837 infants).
 *   * NAP TRANSITIONS ARE NOT SCRIPTED. Each day is played forward window by window, and the
 *     next sleep is a nap only if a nap and a reasonable last window still fit before the
 *     evening. As windows lengthen, the day stops fitting the old count — so 4→3→2→1 happens
 *     at the ages it happens in life (3–4, 6–9, 13–18 months), with the "some days three, some
 *     days two" wobble in between, because that is the mechanism.
 *   * NAP LENGTH IS CYCLES. Infant sleep cycles run about 60 minutes at three months, ten
 *     longer by twelve (Surrey actigraphy, 35,000 hours, SLEEP 2026). Single-cycle naps peak at
 *     three to five months, where app-logged nap length bottoms out (Mindell 2016).
 *   * PARENTS LOG IMPERFECTLY. A couple of minutes' jitter on every button; a timer left running
 *     now and then; a nap not logged at all; a whole day missed; and — the one that matters —
 *     some households log each night waking as its own sleep.
 *
 * ── WHAT IT CANNOT PROVE ────────────────────────────────────────────────────────────────────
 *
 * It is a model of babies. A predictor that assumes exactly this model's shape will look better
 * here than it deserves, which is why every candidate is run under several settings of the
 * parameters that are least certain, and only one that wins across them is shipped. And it is
 * not a substitute for real logs: the first time a real household's data can be looked at (with
 * consent, aggregate, on the server the owner has not stood up yet), this bench is the thing to
 * recalibrate, not the thing to trust.
 *
 * SCENARIOS. Optional levers on `SimParams` turn the default household into a named situation —
 * an early riser, weekend lie-ins, daycare with or without its naps logged, a clock change, a
 * trip, a sick week, a regression, a catnapper, patchier logging. Absent, the household is exactly
 * the default one, draw for draw, so adding a scenario never moves the backtest's numbers.
 * `naps.scenarios.ts` is the catalog.
 *
 * Every function is pure and seeded; the same seed is the same household on every machine.
 */
import type { SleepLog } from './naps';
import { MIN } from './types';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** The first simulated day's midnight. Any fixed instant would do; UTC midnight keeps it legible. */
export const SIM_DAY0 = Date.UTC(2026, 0, 5);
/** Local days are UTC days in the bench — a day is a day, which is all the engine needs. */
export const simDayStartOf = (ms: number): number =>
  Math.floor((ms - SIM_DAY0) / DAY) * DAY + SIM_DAY0;

/* ------------------------------------------------------------------ randomness, seeded */

/** mulberry32: small, fast, and the same sequence everywhere. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rand = () => number;

function gauss(r: Rand): number {
  let u = 0;
  while (u === 0) u = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}
const logNormal = (r: Rand, median: number, sigma: number): number =>
  median * Math.exp(sigma * gauss(r));
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** Piecewise-linear interpolation over `[x, y]` anchors, flat beyond the ends. */
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

/* ------------------------------------------------------------------ the population curves */

/**
 * The MIDDLE wake window at a corrected age, in minutes. Anchored to the consensus ranges —
 * 35–60 min in the first month, 60–90 by two months, 75–120 at three to four, 2–3 h at five to
 * seven, 2.5–3.5 h at eight to ten, 3–4 h around a year — at the middle of each range, and
 * interpolated in between. The single-nap toddler's windows (~5 h) come out of the day structure
 * rather than this curve: with one nap in a twelve-hour day, the windows are what is left.
 */
export const WW_ANCHORS: readonly (readonly [number, number])[] = [
  [7, 45],
  [21, 52],
  [42, 62],
  [70, 75],
  [91, 86],
  [122, 102],
  [152, 118],
  [183, 134],
  [213, 148],
  [244, 160],
  [274, 171],
  [304, 178],
  [335, 186],
  [365, 193],
  [426, 210],
  [487, 232],
  [548, 250],
  [730, 290],
];
export const wakeWindowMinutes = (ageDays: number): number => interp(WW_ANCHORS, ageDays);

/** First window shortest, later ones longer; the run-up to the night is handled separately. */
const positionFactor = (position: number): number => Math.min(1.08, 0.86 + 0.1 * (position - 1));
/** The run-up to the night, relative to the middle window (the evening wake maintenance zone). */
const LAST_FACTOR = 1.18;
/**
 * How much of the usual last window has to be left for a nap to still be taken. Below this the
 * day goes straight to the night (or to a catnap if the evening would otherwise run far too long):
 * the rule that makes nap transitions emerge rather than be scheduled.
 */
const FIT_LAST = 0.7;

/** Sleep cycle length in minutes (Surrey actigraphy: ~60 at 3 months, ~70 at 12). */
const cycleMinutes = (ageDays: number): number =>
  interp(
    [
      [30, 48],
      [91, 58],
      [365, 68],
      [730, 72],
    ],
    ageDays,
  );

/** How often a nap stops after one cycle. Peaks at 3–5 months, where logged nap length bottoms out. */
const pSingleCycle = (ageDays: number): number =>
  interp(
    [
      [0, 0.22],
      [60, 0.32],
      [110, 0.48],
      [160, 0.48],
      [220, 0.32],
      [300, 0.2],
      [450, 0.1],
      [730, 0.08],
    ],
    ageDays,
  );

/** The circadian pull on a nap's start towards the baby's habitual clock time, by age. */
const circadianPull = (ageDays: number): number =>
  interp(
    [
      [0, 0],
      [42, 0],
      [91, 0.2],
      [150, 0.38],
      [210, 0.5],
      [365, 0.58],
      [730, 0.62],
    ],
    ageDays,
  );

/** How firmly parents hold a bedtime clock, by age: loose in the newborn weeks, firm by four months. */
const bedtimeAnchor = (ageDays: number): number =>
  interp(
    [
      [0, 0.15],
      [42, 0.3],
      [91, 0.55],
      [122, 0.7],
      [270, 0.78],
      [730, 0.8],
    ],
    ageDays,
  );

/** Night wakings a piece-logging household writes down, per night, by age. */
const nightWakings = (ageDays: number): number =>
  interp(
    [
      [0, 3],
      [42, 2.4],
      [91, 1.7],
      [183, 1.1],
      [274, 0.7],
      [365, 0.4],
      [730, 0.2],
    ],
    ageDays,
  );

/* ------------------------------------------------------------------ the household */

export interface SimParams {
  /** How much a short nap shortens the next window: 0 none, 0.3 moderate, 0.6 strong. */
  shortNapK: number;
  /** Scales `circadianPull`: 0 = pure sleep pressure, 1 = as assumed, 1.5 = clock-driven. */
  circadianScale: number;
  /** Scales day-to-day noise on windows and clocks. */
  noiseScale: number;
  /** Share of households that log each night waking as its own sleep. */
  pieceNightShare: number;
  /** Share of households that set their own wake/bed times rather than keep the default. */
  setWindowShare: number;
  /**
   * Share of households whose routine SHIFTS once during the run — the step changes a smooth
   * growth curve does not have: daycare starting, the clocks changing, a bedtime moved on
   * purpose, a stretch of short naps, windows stretched by a few weeks of development at once.
   */
  shiftShare: number;
  /*
    SCENARIOS. Everything below is optional, and absent it the household is exactly the default one
    above — the same random draws in the same order — so the permanent backtest's numbers never move
    when a scenario is added. `naps.scenarios.test.ts` is where they are used.
  */
  /** Moves the family's usual morning and bedtime, in minutes: an early riser is negative. */
  clockShift?: { wake: number; bed: number };
  /** Restricts the one routine change to these kinds, and may fix its direction, size and day. */
  shift?: { kinds: readonly number[]; sign?: 1 | -1; size?: number; day?: number };
  /** Added to the chance a nap stops after one cycle: a catnapper. */
  shortNapAdd?: number;
  /** Weekends run later: minutes added to the morning, the naps and bedtime on days 5 and 6. */
  weekendLater?: number;
  /**
   * Daycare on weekdays, from `from` to `to` (minutes of the day): the naps there start at the
   * daycare's own times, held firmly, and `logged` says whether they reach the app at all.
   */
  daycare?: { napsAt: readonly number[]; from: number; to: number; logged: boolean };
  /**
   * The clock and the body part company. On `day` the body's timing jumps by `jump` minutes of the
   * clock (a clock change: the clock moved and the baby did not); `hold` sets where the family's
   * clock routine sits for a while (a trip, in the home clock the app keeps); every day the body
   * eases towards the routine by at most `ease` minutes.
   */
  clock?: { day: number; jump: number; ease: number; hold?: { offset: number; until: number } };
  /**
   * A spell of days that run differently — a sickness, a regression: wake windows and naps scaled,
   * noisier days, more one-cycle naps, more night wakings logged, bedtime moved.
   */
  spell?: {
    day: number;
    days: number;
    windows: number;
    naps: number;
    noise: number;
    shortNaps: number;
    nightWakings: number;
    bedtime: number;
  };
  /** Logging habits: naps never logged, timers left running, whole days skipped, night wakings. */
  logging?: {
    napMiss: number;
    timerLeft: number;
    daySkip: number;
    nightWakings?: number;
    /**
     * The share of naps whose timer is found only the NEXT MORNING (2026-09-26, the owner's
     * "consider the human aspect of like forget to logging"): the nap reads as one sleep from its
     * start to the next morning's waking, fifteen hours and more, and nothing between is logged.
     */
    runaway?: number;
    /**
     * The share of naps written down afterwards and left at the time they were written: the nap's
     * length is right, but it is logged as ending when the parent logged it, 30 minutes to 2½ hours
     * after the baby woke.
     */
    late?: number;
    /**
     * The share of days whose FIRST nap never reaches the log (2026-10-06, the owner: "users error
     * especially in the morning where things are hectic"): on top of `napMiss`, and only the
     * morning's first nap, so the morning's window reads as two windows and a nap on most days.
     */
    firstNapMiss?: number;
  };
}

export const DEFAULT_SIM: SimParams = {
  shortNapK: 0.3,
  circadianScale: 1,
  noiseScale: 1,
  pieceNightShare: 0.4,
  setWindowShare: 0.7,
  shiftShare: 0.35,
};

/** A sleep as it really happened. */
export interface TrueSleep {
  startMs: number;
  endMs: number;
  night: boolean;
  /** Corrected age on the day the sleep began, for the logging model's night-waking count. */
  ageDays: number;
}

/** A moment the app would make a prediction: the baby has just woken during the day. */
export interface SimEvent {
  /** When the parent stopped the timer — what the app sees as the waking. */
  atMs: number;
  /** Index of the simulated day (0-based). */
  day: number;
  /** Corrected age that day. */
  ageDays: number;
  /** 1 after the night, 2 after the first nap… */
  position: number;
  /** When the next sleep really began. */
  nextStartMs: number;
  nextIsNight: boolean;
  /** The nap that just ended was a single cycle or a catnap. */
  afterShortNap: boolean;
  /** How many naps that day in truth, and the day before (transitions show as a change). */
  napsThatDay: number;
  napsDayBefore: number | null;
}

export interface SimHousehold {
  seed: number;
  startAgeDays: number;
  days: number;
  /** What the household told the app: its wake and bed times (or the default pair). */
  dayWindow: { wake: string; bed: string };
  truth: TrueSleep[];
  /** What the parent logged, kinds filled from `dayWindow` the way the sleep sheet fills them. */
  logs: SleepLog[];
  events: SimEvent[];
  pieceNight: boolean;
  /** The day the routine shifted and how (0 whole day, 1 bedtime, 2 windows, 3 short naps), or null. */
  shiftDay: number | null;
  shiftKind: number | null;
}

const hhmm = (minutes: number): string => {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
const minutesOf = (s: string): number => {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const round30 = (m: number): number => Math.round(m / 30) * 30;

/** The sleep sheet's rule (core `sleepKindAt`): a sleep STARTING inside the waking window is a nap. */
function kindAt(startMs: number, w: { wake: string; bed: string }): 'NAP' | 'NIGHT' {
  const minute = Math.floor(((startMs - SIM_DAY0) % DAY) / MIN);
  const wake = minutesOf(w.wake);
  const bed = minutesOf(w.bed);
  if (wake === bed) return 'NAP';
  const awake = wake < bed ? minute >= wake && minute < bed : minute >= wake || minute < bed;
  return awake ? 'NAP' : 'NIGHT';
}

interface Traits {
  wwScale: number;
  napScale: number;
  wakeClockMin: number;
  wakeSd: number;
  bedClockMin: number;
  bedSd: number;
  noise: number;
}

/**
 * One household, `days` long, starting at `startAgeDays` corrected age.
 *
 * The day is played forward from the morning waking: at each waking the next sleep is either a
 * nap (after this position's window, pulled towards the habitual clock time) or the night (after
 * the long last window, pulled towards the parents' bedtime), whichever still fits the evening.
 */
export function simulateHousehold(
  seed: number,
  startAgeDays: number,
  days: number,
  p: SimParams = DEFAULT_SIM,
): SimHousehold {
  const r = mulberry32(seed);
  const cw = p.clockShift?.wake ?? 0;
  const cb = p.clockShift?.bed ?? 0;
  const t: Traits = {
    wwScale: logNormal(r, 1, 0.12),
    napScale: logNormal(r, 1, 0.15),
    wakeClockMin: clamp(405 + cw + 35 * gauss(r), 330 + cw, 510 + cw),
    wakeSd: clamp(logNormal(r, 22, 0.3), 10, 45) * p.noiseScale,
    bedClockMin: clamp(1165 + cb + 35 * gauss(r), 1080 + cb, 1260 + cb),
    bedSd: clamp(logNormal(r, 25, 0.4), 8, 70) * p.noiseScale,
    noise: 0.11 * p.noiseScale,
  };
  const pieceNight = r() < p.pieceNightShare;
  /**
   * ONE STEP CHANGE, for a share of households, on a day in the middle of the run. The kinds are
   * the ones parents describe: the whole day moves (daycare, a clock change), bedtime alone moves,
   * the windows stretch or shrink by a jump rather than a slope, or naps go short for a spell.
   */
  const shift =
    r() < p.shiftShare
      ? (() => {
          // four draws in this order whatever the scenario fixes, so the default is unchanged
          const dayDraw = r();
          const kindDraw = r();
          const signDraw = r();
          const sizeDraw = r();
          const kinds = p.shift?.kinds ?? [0, 1, 2, 3];
          return {
            day: p.shift?.day ?? Math.floor(6 + dayDraw * Math.max(1, days - 12)),
            kind: kinds[Math.floor(kindDraw * kinds.length)] ?? 0,
            sign: p.shift?.sign ?? (signDraw < 0.5 ? -1 : 1),
            size: p.shift?.size ?? sizeDraw,
          };
        })()
      : null;
  const dayWindow =
    r() < p.setWindowShare
      ? { wake: hhmm(round30(t.wakeClockMin)), bed: hhmm(round30(t.bedClockMin)) }
      : { wake: '07:00', bed: '19:30' };

  /** The habitual schedule at an age: the same day played with no noise, for the clock pull. */
  const habitual = (age: number): number[] => {
    const starts: number[] = [];
    const ww = wakeWindowMinutes(age) * t.wwScale;
    let wake = t.wakeClockMin;
    for (let pos = 1; pos <= 6; pos++) {
      const napAt = wake + ww * positionFactor(pos);
      const napLen = cycleMinutes(age) * (pos === 1 ? 1.5 : 1.8) * t.napScale;
      if (napAt + napLen + FIT_LAST * ww * LAST_FACTOR > t.bedClockMin + 30) break;
      starts.push(napAt);
      wake = napAt + napLen;
    }
    return starts;
  };

  const truth: TrueSleep[] = [];
  const events: SimEvent[] = [];
  const napsPerDay: number[] = [];

  /*
    WHERE EACH DAY'S CLOCK SITS, in minutes against the family's usual routine: later on a weekend,
    and wherever the body is after the clock jumped. Both are zero in the default household.
  */
  const offsets: number[] = [];
  {
    const c = p.clock;
    let body = 0;
    for (let d = 0; d <= days; d++) {
      if (c !== undefined && d >= c.day) {
        if (d === c.day) body += c.jump;
        const routine = c.hold !== undefined && d < c.hold.until ? c.hold.offset : 0;
        // the body starts easing the day after a jump, and the same day a trip begins
        if (!(d === c.day && c.jump !== 0)) {
          body += clamp(routine - body, -c.ease, c.ease);
        }
      }
      const weekendDay = d % 7 === 5 || d % 7 === 6; // SIM_DAY0 is a Monday
      offsets.push(body + (p.weekendLater !== undefined && weekendDay ? p.weekendLater : 0));
    }
  }
  const offsetOf = (d: number): number => offsets[Math.min(d, days)] ?? 0;
  const inSpell = (d: number): boolean =>
    p.spell !== undefined && d >= p.spell.day && d < p.spell.day + p.spell.days;
  const atDaycare = (d: number): boolean => p.daycare !== undefined && d % 7 < 5;

  /** A morning's waking on day `d`, by the household's clock and wherever the body sits that day. */
  const morningOf = (d: number): number => {
    const o = offsetOf(d);
    return clamp(t.wakeClockMin + o + t.wakeSd * gauss(r), 300 + cw + o, 560 + cw + o);
  };

  // the night before day 0, so day 0 opens on a real morning waking
  let wakeMs = SIM_DAY0 + morningOf(0) * MIN;
  truth.push({ startMs: wakeMs - 11 * HOUR, endMs: wakeMs, night: true, ageDays: startAgeDays });

  const base = { wake: t.wakeClockMin, bed: t.bedClockMin, ww: t.wwScale };
  let shortSpell = 0;
  for (let d = 0; d < days; d++) {
    const age = startAgeDays + d;
    const dayStart = SIM_DAY0 + d * DAY;
    if (shift !== null && d === shift.day) {
      const move = shift.sign * (30 + 30 * shift.size);
      if (shift.kind === 0) {
        t.wakeClockMin = base.wake + move;
        t.bedClockMin = base.bed + move;
      } else if (shift.kind === 1) {
        t.bedClockMin = base.bed + move;
      } else if (shift.kind === 2) {
        t.wwScale = base.ww * (1 + shift.sign * (0.1 + 0.1 * shift.size));
      } else {
        shortSpell = 7 + Math.floor(7 * shift.size);
      }
    }
    if (shortSpell > 0) shortSpell -= 1;
    const spell = inSpell(d) ? p.spell : undefined;
    const ww = wakeWindowMinutes(age) * t.wwScale * (spell?.windows ?? 1);
    const noise = t.noise * (spell?.noise ?? 1);
    const daycare = atDaycare(d) ? p.daycare : undefined;
    // daycare holds its own nap times firmly; at home the clock pull grows with age
    const pull =
      daycare !== undefined ? 0.85 : clamp(circadianPull(age) * p.circadianScale, 0, 0.9);
    const bedPull = bedtimeAnchor(age);
    const off = offsetOf(d);
    const habit =
      daycare !== undefined ? [...daycare.napsAt] : habitual(age).map(clock => clock + off);
    const bedOff = off + (spell?.bedtime ?? 0);
    const bedTarget =
      dayStart +
      clamp(t.bedClockMin + bedOff + t.bedSd * gauss(r), 1020 + cb + bedOff, 1320 + cb + bedOff) *
        MIN;
    const dayEvents: SimEvent[] = [];
    let position = 1;
    let lastNapShort = false;
    let deficit = 0;
    let naps = 0;

    for (;;) {
      const shrink = 1 - p.shortNapK * deficit;
      const napWindow = ww * positionFactor(position) * shrink * Math.exp(noise * gauss(r)) * MIN;
      const lastWindow = ww * LAST_FACTOR * shrink * Math.exp(noise * gauss(r)) * MIN;
      const clockTarget = habit[position - 1];
      let napAt = wakeMs + napWindow;
      if (clockTarget !== undefined) {
        const target = dayStart + clockTarget * MIN;
        // the pull moves the start towards the habitual time, never to less than half a window
        napAt =
          wakeMs + Math.max(0.5 * napWindow, (1 - pull) * napWindow + pull * (target - wakeMs));
      }
      const nightAt = Math.max(
        wakeMs + 0.6 * lastWindow,
        (1 - bedPull) * (wakeMs + lastWindow) + bedPull * bedTarget,
      );
      const typicalNap = cycleMinutes(age) * (position === 1 ? 1.5 : 1.8) * t.napScale * MIN;
      const fitsNap = napAt + typicalNap + FIT_LAST * lastWindow <= bedTarget + 30 * MIN;
      const overlong = nightAt - wakeMs > 1.7 * lastWindow;
      const catnap = !fitsNap && overlong && position <= 5;
      const isNap = (fitsNap || catnap) && position <= 6;

      const nextStart = isNap ? napAt : nightAt;
      dayEvents.push({
        atMs: wakeMs,
        day: d,
        ageDays: age,
        position,
        nextStartMs: nextStart,
        nextIsNight: !isNap,
        afterShortNap: lastNapShort,
        napsThatDay: 0,
        napsDayBefore: null,
      });

      if (!isNap) {
        // the night: to tomorrow's waking, which is the household's clock more than anything
        const nextWake = dayStart + DAY + morningOf(d + 1) * MIN;
        const floor = age < 91 ? 7 * HOUR : 8.5 * HOUR;
        const endMs = clamp(nextWake, nextStart + floor, nextStart + 13 * HOUR);
        truth.push({ startMs: nextStart, endMs, night: true, ageDays: age });
        wakeMs = endMs;
        break;
      }

      // a nap: one cycle, or two-ish, or a catnap
      const cycle = cycleMinutes(age);
      let len: number;
      let short: boolean;
      if (catnap) {
        len = clamp(logNormal(r, 30, 0.2), 15, 45);
        short = true;
      } else if (age < 42) {
        len = clamp(logNormal(r, 55, 0.45), 15, 200);
        short = len < 40;
      } else if (
        r() <
        Math.min(
          0.85,
          pSingleCycle(age) +
            (shortSpell > 0 ? 0.35 : 0) +
            (p.shortNapAdd ?? 0) +
            (spell?.shortNaps ?? 0),
        )
      ) {
        len = clamp(cycle * logNormal(r, 0.68, 0.15), 22, 55);
        short = true;
      } else {
        const cycles = age >= 430 ? 2.1 : position === 1 ? 1.5 : 1.8;
        len = clamp(cycle * cycles * logNormal(r, 1, 0.18) * t.napScale, 50, 200);
        short = false;
      }
      if (spell !== undefined) len = clamp(len * spell.naps, 15, 240);
      truth.push({ startMs: nextStart, endMs: nextStart + len * MIN, night: false, ageDays: age });
      deficit = clamp(1 - (len * MIN) / typicalNap, 0, 1);
      lastNapShort = short;
      wakeMs = nextStart + len * MIN;
      position += 1;
      naps += 1;
    }
    napsPerDay.push(naps);
    const before = d > 0 ? (napsPerDay[d - 1] ?? null) : null;
    for (const e of dayEvents) events.push({ ...e, napsThatDay: naps, napsDayBefore: before });
  }

  const logs = logFor(r, truth, dayWindow, pieceNight, days, {
    napMiss: p.logging?.napMiss ?? 0.03,
    timerLeft: p.logging?.timerLeft ?? 0.03,
    daySkip: p.logging?.daySkip ?? 0.02,
    runaway: p.logging?.runaway ?? 0,
    late: p.logging?.late ?? 0,
    firstNapMiss: p.logging?.firstNapMiss ?? 0,
    nightWakings: (day: number) =>
      (p.logging?.nightWakings ?? 1) * (inSpell(day) ? (p.spell?.nightWakings ?? 1) : 1),
    unlogged: (s: TrueSleep, day: number) => {
      const dc = p.daycare;
      if (dc === undefined || dc.logged || s.night || !atDaycare(day)) return false;
      const minute = (s.startMs - (SIM_DAY0 + day * DAY)) / MIN;
      return minute >= dc.from && minute < dc.to;
    },
  });
  // an event is only usable if the sleep it follows was logged — the app cannot predict from a
  // waking it never saw — and it is stamped at the LOGGED end, which is when the app learns of it
  const usable: SimEvent[] = [];
  for (const e of events) {
    const ended = logs.find(l => l.endMs !== null && Math.abs(l.endMs - e.atMs) <= 50 * MIN);
    if (ended === undefined || ended.endMs === null) continue;
    if (ended.endMs >= e.nextStartMs - 5 * MIN) continue;
    usable.push({ ...e, atMs: ended.endMs });
  }

  return {
    seed,
    startAgeDays,
    days,
    dayWindow,
    truth,
    logs,
    events: usable,
    pieceNight,
    shiftDay: shift?.day ?? null,
    shiftKind: shift?.kind ?? null,
  };
}

/**
 * The log a parent would have written for `truth`: jitter on every button, the odd timer left
 * running, the odd nap never logged, the odd day skipped entirely — and, for a piece-logging
 * household, the night written down as the stretches between wakings.
 */
interface LogHabits {
  napMiss: number;
  timerLeft: number;
  daySkip: number;
  /** A nap's timer found the next morning (`SimParams.logging.runaway`). */
  runaway: number;
  /** A nap logged afterwards at the time it was written (`SimParams.logging.late`). */
  late: number;
  /** The morning's first nap never logged (`SimParams.logging.firstNapMiss`). */
  firstNapMiss: number;
  /** Scales the night wakings a piece-logging household writes down, by day. */
  nightWakings: (day: number) => number;
  /** A sleep that never reaches the app — a nap at daycare nobody copies in. */
  unlogged: (s: TrueSleep, day: number) => boolean;
}

function logFor(
  r: Rand,
  truth: readonly TrueSleep[],
  w: { wake: string; bed: string },
  pieceNight: boolean,
  days: number,
  habits: LogHabits,
): SleepLog[] {
  const skipped = new Set<number>();
  for (let d = 1; d < days; d++) if (r() < habits.daySkip) skipped.add(d);
  const out: SleepLog[] = [];
  const jitter = (): number => Math.round(2 * gauss(r)) * MIN;
  /** The morning a runaway timer was found: the true sleeps before it never reached the log. */
  let swallowedUntil = -Infinity;
  for (let i = 0; i < truth.length; i++) {
    const s = truth[i] as TrueSleep;
    const next = truth[i + 1];
    const day = Math.floor((s.startMs - SIM_DAY0) / DAY);
    if (s.startMs < swallowedUntil) continue;
    if (skipped.has(day)) continue;
    if (habits.unlogged(s, day)) continue;
    if (!s.night && r() < habits.napMiss) continue; // a nap nobody logged
    // a hectic morning's first nap, never logged — drawn only where the scenario asks for it, so
    // every other household keeps its draws and the backtest its numbers
    if (
      habits.firstNapMiss > 0 &&
      !s.night &&
      truth[i - 1]?.night === true &&
      r() < habits.firstNapMiss
    )
      continue;
    let end = s.endMs + jitter();
    if (r() < habits.timerLeft) {
      // a timer left running a while after the baby woke
      const late = (10 + 30 * r()) * MIN;
      end = Math.min(end + late, (next?.startMs ?? end + late) - 10 * MIN);
    }
    const start = s.startMs + jitter();
    /*
      THE TWO HABITS BELOW DRAW ONLY WHEN SWITCHED ON, so a household without them makes exactly
      the draws it always made and every number the backtest and the other scenarios hold stays put.
    */
    if (!s.night && habits.runaway > 0 && r() < habits.runaway) {
      // a nap timer found the next morning: one "sleep" from this nap to the morning, and the
      // afternoon, the evening and the night in between never logged
      const night = truth.slice(i + 1).find(t => t.night);
      if (night !== undefined) {
        out.push({ startMs: start, endMs: night.endMs + jitter(), kind: kindAt(start, w) });
        swallowedUntil = night.endMs;
        continue;
      }
    }
    if (!s.night && habits.late > 0 && r() < habits.late) {
      // written down afterwards and left at the time it was written: the right length, logged as
      // ending when the parent logged it — never into the next sleep
      const delay = (30 + 120 * r()) * MIN;
      const shift = Math.min(delay, (next?.startMs ?? end + delay) - 10 * MIN - end);
      if (shift >= 20 * MIN) {
        out.push({ startMs: start + shift, endMs: end + shift, kind: kindAt(start + shift, w) });
        continue;
      }
    }
    if (s.night && pieceNight) {
      const count = poisson(r, nightWakings(s.ageDays) * habits.nightWakings(day));
      const span = end - start;
      const cuts: number[] = [];
      for (let k = 0; k < count; k++) cuts.push(start + (0.1 + 0.8 * r()) * span);
      cuts.sort((a, b) => a - b);
      let from = start;
      for (const cut of cuts) {
        const awake = clamp(logNormal(r, 20, 0.4), 8, 60) * MIN;
        if (cut - from < 40 * MIN || cut + awake > end - 30 * MIN) continue;
        out.push({ startMs: from, endMs: cut, kind: kindAt(from, w) });
        from = cut + awake;
      }
      out.push({ startMs: from, endMs: end, kind: kindAt(from, w) });
      continue;
    }
    out.push({ startMs: start, endMs: end, kind: kindAt(start, w) });
  }
  return out;
}

/** Knuth's Poisson draw — fine for the small means night wakings have. */
function poisson(r: Rand, mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let prod = r();
  while (prod > limit) {
    k += 1;
    prod *= r();
  }
  return k;
}

/** A population: `n` households at ages drawn uniformly from `[minAge, maxAge]`. */
export function simulatePopulation(
  seed: number,
  n: number,
  minAgeDays: number,
  maxAgeDays: number,
  days: number,
  p: SimParams = DEFAULT_SIM,
): SimHousehold[] {
  const r = mulberry32(seed);
  const out: SimHousehold[] = [];
  for (let i = 0; i < n; i++) {
    const age = Math.round(minAgeDays + r() * (maxAgeDays - minAgeDays));
    out.push(simulateHousehold(Math.floor(r() * 2 ** 31), age, days, p));
  }
  return out;
}
