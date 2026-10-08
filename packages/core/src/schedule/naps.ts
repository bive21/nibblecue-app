/**
 * THE NAP OUTLOOK — when the next sleep would fall, from the household's own sleep log.
 *
 * The owner, 2026-09-20: *"Prepare a predictive napping module based on sleeping logs and time."*
 * And 2026-09-23: *"14 days is definitely too long. Baby changes fast. Learn more about baby
 * sleeping and fix the model to make it better… Make sure it is as good and accurate as
 * possible."*
 *
 * Everything below was chosen by MEASUREMENT, not by argument: `naps.sim.ts` generates households
 * whose sleep follows the published research and logs it the way parents really log it, and
 * `naps.backtest.test.ts` replays every day of them and scores each prediction against what
 * actually happened. The numbers that settled each choice are in `docs/NAP_OUTLOOK.md`; the short
 * version is that this engine's median miss is under ten minutes where the one it replaced was
 * nearly fifteen, and it is inside half an hour 86% of the time where that one was 75%.
 *
 * ── WHAT THE RESEARCH SAYS, AND WHAT EACH PIECE HERE DOES WITH IT ─────────────────────────
 *
 *   * SLEEP PRESSURE SETS THE WAKE WINDOW. It builds while a baby is awake and clears while they
 *     sleep, and in infants both run faster than in adults (the two-process model; Jenni &
 *     LeBourgeois 2006). So a NAP follows the WAKING, not the last lying-down: the unit here is
 *     the wake window — one sleep's end to the next one's start — never the gap between starts,
 *     which moves with the length of the last nap and is exactly backwards for sleep.
 *   * THE WINDOWS DIFFER THROUGH THE DAY — the first is the shortest and the run-up to the night
 *     the longest — so they are taken per POSITION: the first window after the night, the one
 *     after the first nap, and so on.
 *   * THE CLOCK TAKES OVER WITH AGE. The circadian rhythm emerges at six to twelve weeks, and by
 *     six months naps settle towards habitual clock times. So each nap's prediction is BLENDED:
 *     the household's usual window added to the waking, and the household's usual clock time for
 *     that nap. How much each counts is not assumed — it is whichever mix would have been closest
 *     on the household's own last two weeks (`blendWeight`). A newborn's log picks the window; a
 *     ten-month-old whose morning nap is "about nine" every day picks the clock. The backtest
 *     found the mix worth more than either alone at every age.
 *   * BEDTIME IS A PARENT'S CLOCK. Morning waking is near-invariant from five months (Mindell
 *     2016, 156,989 app-logged sleeps) and bedtime is a time a household holds. Predicting the
 *     night as "one more window" was the old engine's worst number — 45 minutes out on average —
 *     so the night gets the same blend, of the usual last window and the usual time the night
 *     starts, and lands at 30.
 *   * THE BIGGEST QUESTION IS WHICH SLEEP COMES NEXT. Knowing whether it is a nap or the night
 *     turned out to be worth more than every other refinement together. The answer is read off
 *     the household's own evenings: the time of waking that best separates "a nap came next"
 *     from "the night came next" over the last two weeks (`nightCut`) — "after about 3:40 the
 *     next sleep has been the night". It is right about 95% of the time in the backtest, and it
 *     follows a nap transition by itself, because the cut moves when the evenings do.
 *   * THE NIGHT IS NOT PART OF THE DAY. Since the sleep sheet stopped asking nap-or-night, a
 *     household that logs each night waking as its own sleep wrote "wake windows" at 2 a.m. —
 *     and the old engine counted the first of them as THE FIRST WINDOW OF THE DAY, which
 *     scrambled every position after it. Here a waking between two night sleeps is a night
 *     waking and nothing else, the day's positions start at the morning waking, and a nap logged
 *     in two pieces is one nap. And AWAKE in the night — the 2 a.m. feed a parent opens the app to
 *     log — the card names no nap: every night waking used to get a "next nap" and a heads-up.
 *   * A GAP IN THE LOG IS NOT A WAKE WINDOW. Eight hours with nothing logged — naps at daycare
 *     nobody copied in — is not eleven hours awake; nothing is counted from that waking, and in the
 *     evening the usual bedtime is named on its own (`gap`).
 *   * NOR IS A NAP NOBODY LOGGED (2026-09-26, the owner's "consider the human aspect of like forget
 *     to logging"). A window before a nap more than 1.8 times the household's own usual window there
 *     is two windows and a forgotten nap: it is not counted, the day counts on past the nap it hid,
 *     and a stretch running that long right now is read as a gap in the log (`MISSED_NAP_SHARE`).
 *     The bar is the LOWER of that point's usual and the whole day's (2026-10-06, the owner's
 *     hectic mornings): a nap forgotten most mornings made the morning's own usual two windows and
 *     a nap long, so nothing was ever caught — "usually awake about 5h 10m after the night". The
 *     day's other windows are the steadier yardstick. Hectic mornings: average miss 75.5 → 44.0
 *     minutes; patchy logging 30.7 → 28.2; every other scenario level.
 *   * THE MORNING ANCHORS THE DAY. When the last two mornings both moved the same way by 45 minutes
 *     or more — a clock change, a trip, a new daycare start — every usual clock time moves with
 *     them until the weighted middles catch up (`DAY_SHIFT_MIN`).
 *   * A NAP IS ONE SLEEP CYCLE OR SEVERAL. Cycles run about an hour at three months and ten
 *     minutes longer by twelve (Surrey actigraphy, 2025), so a household's naps fall into two
 *     crowds, and the middle of both is a poor answer once a nap has outlasted the short crowd.
 *     While a nap runs, its end is read off the naps that got as far as this one (`lastingAt`).
 *   * BABIES CHANGE FAST — AND A NOISY WEEK IS NOT A CHANGE. Two weeks counted equally lags a
 *     real change by days; the last few days alone are too few to have a steady middle. The
 *     backtest settled it: every entry counts by how recent it is, halving every
 *     `RECENCY_HALF_LIFE_DAYS` (five), so about three-quarters of the weight is the last week
 *     and the week before only steadies it. That beat both "two weeks, equally" and "the last
 *     five days" overall, and it caught up after a routine changed nearly as fast as the
 *     five-day window did.
 *
 * What was tried and REJECTED, so nobody re-adds it on instinct: shortening the next window after
 * a short nap (the physiology is real, but parents are told to hold the window, and the log says
 * they do — no gain); a separate half-life per age (no gain); detecting a change and dropping the
 * old days (worse — it mistook bad days for new routines); predicting from the last five days
 * alone (worst of the new variants); calling a long-running afternoon sleep the night once it
 * outlasts the afternoon naps (worse — it misfiled long naps); joining an evening sleep to the
 * night across a longer waking than forty-five minutes (no gain); counting weekend days towards
 * weekends (a daycare family's weekends improved, every other household got worse). Each is a
 * line in the backtest's history, not a guess.
 *
 * `naps.scenarios.test.ts` holds it to a floor in each of nineteen named situations — a newborn,
 * the regression, the nap transitions, daycare, clock changes, a trip, a sick week, patchy
 * logging — so a change that the average hides still fails the build.
 *
 * ── WHAT IT MAY AND MAY NOT SAY ─────────────────────────────────────────────────────────────
 *
 * It is arithmetic over rows the household wrote, with the sample size attached to every number
 * — the license CLAUDE.md §2 rule 6 gives, as the owner narrowed it on 2026-09-18. It says when
 * the next sleep WOULD fall if the pattern held. No population norm is inside it: the research
 * decided the SHAPE of the arithmetic, and every number that comes out of it is this household's.
 *
 * It says nothing about the baby. Not that a window is long or short, not that a nap was missed,
 * not that anyone is tired, and nothing anybody should do — those are claims about a condition the
 * app cannot see, which is the line rule 6 still holds and `foresight.banned.ts` spells out.
 * `naps.copy.ts` holds the sentences and its test holds them to that list.
 *
 * Every function here is pure and takes its clock and its day boundary as arguments, like the
 * rest of `packages/core`.
 */
import type { Rhythm } from './foresight';
import { MIN } from './types';

const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A logged sleep, which is all the shape this needs. */
export interface SleepLog {
  startMs: number;
  /** null while the timer is still running. */
  endMs: number | null;
  /** From the sleep sheet (filled from the household's wake/bed times), or null on old rows. */
  kind: 'NAP' | 'NIGHT' | null;
}

/**
 * HOW FAR BACK ANYTHING IS READ. The ceiling, not the weighting: at five days' half-life the
 * oldest day here counts about a seventh of today, and past it nothing does.
 */
export const NAP_LOOKBACK_DAYS = 14;

/**
 * EVERY ENTRY COUNTS BY HOW RECENT IT IS, halving every five days — so the last week carries
 * about three-quarters of the weight. Measured against two weeks equally (slow after a change),
 * the last five days alone (noisy every day), and half-lives from one to fourteen days; five and
 * seven tied on everything, and five catches up faster after a routine moves.
 */
export const RECENCY_HALF_LIFE_DAYS = 5;

/**
 * A GAP SHORTER THAN THIS IS NOT BEING AWAKE. Twenty minutes: a transfer to the crib, a false
 * start, or one sleep logged as two — which are MERGED into one sleep rather than counted twice.
 */
const MIN_AWAKE_MS = 20 * MIN;
/**
 * …AND A GAP LONGER THAN THIS IS NOT A WAKE WINDOW EITHER. Eight hours between a sleep ending and
 * the next one starting is an afternoon nobody logged rather than an afternoon nobody slept.
 */
const MAX_AWAKE_MS = 8 * HOUR;
/**
 * HOW LONG A QUIET LOG STILL HAS A USUAL DAY TO NAME (the owner, 2026-10-06: "2 days is too soon. I
 * get if it's one week"). Past a week since the last logged waking, the card waits for a new sleep
 * rather than naming clock times from a routine nobody has written down since.
 */
export const FORGET_AFTER_MS = 7 * DAY;

/**
 * A NAP NOBODY LOGGED (the owner, 2026-09-26: *"we have to also consider the human aspect of like
 * forget to logging, so some data might be spiked /not, because of this. this needs to be
 * accounted in the sleep report prediction"*).
 *
 * A window before a nap that ran more than this many times the household's OWN usual window at that
 * point of the day is two windows with a nap between them that never reached the log: the awake
 * time, the forgotten nap and the awake time after it, read as one. Counted as a window it stretched
 * the middle at its position — and, worse, every window after it that day was counted one place
 * early, so the next nap was predicted from the wrong point in the day. So it is not counted as a
 * window (`windowsOf`), and the day counts on past the nap it hid. Its waking is still a real
 * waking: a morning whose window hid the first nap still counts towards the usual morning.
 *
 * AND WHILE IT IS HAPPENING — awake, by the log, for longer than that since the last logged sleep,
 * with a nap still to come — the log is taken to be missing that nap, the same reading as eight
 * hours with nothing logged (`gap`): the card says when the last logged sleep ended rather than
 * naming a nap time already gone, and in the evening names the usual bedtime.
 *
 * 1.8, by measurement (`docs/NAP_OUTLOOK.md` §6.4): the backtest's typical and average miss both
 * improve a little, every one of the named scenarios is level or better, and a household that logs
 * two naps in three improves most (average miss 32.5 → 30.7 minutes); at a glance in the afternoon
 * the card names a nap time already gone in about a fifth as many of those households' days.
 * Anything from 1.4 to 2.0 scores the same at a waking — a forgotten nap makes a stretch of two
 * windows and a nap, far past any of them — so the line sits where a REAL window almost never
 * reaches: lower, the card would stop naming a nap on days a baby really is awake long (1.4 is
 * passed by about 1 real window in 170 in the simulated households, 1.8 by none in 8,372).
 * ONLY WINDOWS BEFORE A NAP: a long run-up to the night is as often a nap really dropped — the
 * evenings of a nap transition — and counting those out moved the nap-or-night line the wrong way
 * (tried: a minute worse at the night on average).
 *
 * The line is this household's own usual window, never a number of hours a baby should be awake
 * (CLAUDE.md §2 rule 6).
 */
export const MISSED_NAP_SHARE = 1.8;

/** A nap shorter than this is a catnap in the car seat; a sleep this long is the night. */
const MIN_NAP_MS = 10 * MIN;
const MAX_NAP_MS = 5 * HOUR;

/**
 * AN EVENING SLEEP THAT RUNS INTO THE NIGHT IS THE NIGHT. The sleep sheet files a sleep by where
 * it STARTS against the household's bedtime, so a baby put down at 7:10 in a "7:30" household is
 * written as a nap — and if the night is then logged in pieces, that first piece is under five
 * hours and would pass for one. Anything that starts after three in the afternoon and is followed
 * within this long by night sleep is the start of the night. Forty-five minutes: longer than a
 * night waking usually is, shorter than the gap between a late catnap and bedtime usually is.
 */
const NIGHT_SETTLE_MS = 45 * MIN;
const EVENING_FROM_MIN = 15 * 60;

/**
 * HOW MANY WINDOWS AT A POSITION BEFORE IT SPEAKS FOR ITSELF. Three — below it the prediction
 * uses every nap-followed window pooled, and says so (`basis`).
 */
export const MIN_POSITION_SAMPLES = 3;
/** …and how many windows in total before there is anything to say at all. */
export const MIN_TOTAL_SAMPLES = 4;
/**
 * …AND HOW MANY LOCAL DAYS THEY HAVE TO COME FROM. Two full days (the owner, 2026-09-21: "you can
 * review data with only 2 full days, and it will change anyways because babies tend to change so
 * fast").
 */
export const MIN_DAYS = 2;

/* ------------------------------------------------------------------ arithmetic */

/**
 * THE WEIGHTED MIDDLE. When the running weight lands exactly on half — two equal halves, as an
 * even count with equal weights does — it takes the midpoint of the two, the same answer an
 * ordinary median gives, so a log with no recency difference reads exactly as it used to.
 */
function weightedMedian(values: readonly number[], weights: readonly number[]): number | null {
  if (values.length === 0) return null;
  const order = values.map((_, i) => i).sort((a, b) => (values[a] ?? 0) - (values[b] ?? 0));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return null;
  let acc = 0;
  for (let k = 0; k < order.length; k++) {
    const i = order[k] as number;
    acc += weights[i] ?? 0;
    if (Math.abs(acc - total / 2) < total * 1e-9) {
      const next = order[k + 1];
      return next === undefined ? (values[i] ?? 0) : ((values[i] ?? 0) + (values[next] ?? 0)) / 2;
    }
    if (acc > total / 2) return values[i] ?? 0;
  }
  return values[order[order.length - 1] as number] ?? null;
}

/** The weight of an entry `ageMs` old: one today, a half at five days, a quarter at ten. */
export const recencyWeight = (ageMs: number): number =>
  Math.pow(0.5, Math.max(0, ageMs) / (RECENCY_HALF_LIFE_DAYS * DAY));

/**
 * HOW MUCH OF A PREDICTION IS THE WINDOW, AND HOW MUCH THE CLOCK — whichever mix would have been
 * closest on the household's own recent days, from none of the clock to all of it in tenths.
 * Weighted by recency like everything else, so a household whose naps just started falling at a
 * fixed time moves towards the clock within days.
 */
function blendWeight(
  cases: readonly { byWindow: number; byClock: number; actual: number; weight: number }[],
): number {
  const errorAt = (a: number): number =>
    cases.reduce(
      (e, c) => e + c.weight * Math.abs(a * c.byWindow + (1 - a) * c.byClock - c.actual),
      0,
    );
  // an even split first, so a history that cannot tell the two apart keeps both halves
  let best = 0.5;
  let bestError = errorAt(0.5);
  for (let k = 0; k <= 10; k++) {
    const a = k / 10;
    const error = errorAt(a);
    if (error < bestError - 1e-6) {
      bestError = error;
      best = a;
    }
  }
  return best;
}

/* ------------------------------------------------------------------ reading the log */

/** One sleep as the engine sees it: pieces under twenty minutes apart are one sleep. */
interface Sleep {
  startMs: number;
  /** null while it is still going. */
  endMs: number | null;
  night: boolean;
}

/**
 * THE LOG, MERGED AND SORTED. A sleep is the night if the sheet said so (the household's own
 * wake and bed times decide that word) or if it ran past five hours, which catches old rows
 * saved before the window existed and any night a parent logged as a "nap".
 */
function sleepsOf(
  logs: readonly SleepLog[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
): Sleep[] {
  const ordered = logs
    .filter(s => s.startMs <= nowMs && (s.endMs === null || s.startMs < s.endMs))
    .sort((a, b) => a.startMs - b.startMs);
  const out: Sleep[] = [];
  for (const s of ordered) {
    const end = s.endMs !== null && s.endMs <= nowMs ? s.endMs : null;
    const ranMs = (end ?? nowMs) - s.startMs;
    const night = s.kind === 'NIGHT' || ranMs >= MAX_NAP_MS;
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.endMs !== null && s.startMs - prev.endMs < MIN_AWAKE_MS) {
      prev.endMs = end === null ? null : Math.max(prev.endMs, end);
      prev.night = prev.night || night;
      continue;
    }
    out.push({ startMs: s.startMs, endMs: end, night });
  }
  // the evening, walked backwards: a sleep that runs into the night within NIGHT_SETTLE_MS is
  // the night's first piece, however the sheet filed it
  for (let i = out.length - 2; i >= 0; i--) {
    const a = out[i] as Sleep;
    const b = out[i + 1] as Sleep;
    if (a.night || !b.night || a.endMs === null) continue;
    const evening = (a.startMs - dayStartOf(a.startMs)) / MIN >= EVENING_FROM_MIN;
    if (evening && b.startMs - a.endMs < NIGHT_SETTLE_MS) a.night = true;
  }
  return out;
}

/** One observed stretch of being awake during the day, and what ended it. */
export interface WakeWindow {
  /** Which wake of its day this is: 1 after the night, 2 after the first nap… */
  position: number;
  wokeAtMs: number;
  awakeMs: number;
  /** When the sleep that ended it began. */
  nextStartMs: number;
  /** Whether that sleep was the night — the run-up to bedtime is a window too. */
  nextIsNight: boolean;
  /** The length of the sleep that followed, when it was a nap rather than the night. */
  napMs: number | null;
  /** The nap this window followed; null after the night. */
  prevNapMs: number | null;
}

/**
 * THE POSITION OF THE WINDOW THAT FOLLOWS `sleeps[i]`.
 *
 * After the night it is 1. After a nap it is one more than the window before that nap — read from
 * the chain, so a nap logged in two pieces or a night logged in five does not move it. Where the
 * chain is broken (the night was never logged), it counts the naps since the day's last night,
 * which is what a parent would count.
 *
 * AND WHERE THERE IS NO SLEEP AT `i`, IT IS 1. The asleep branch of `napOutlook` places a running
 * nap by the sleep BEFORE it (`sleeps.length - 2`), and when the running nap is the only sleep in
 * the log — a household's first nap, or a baby's first sleep in the fortnight the card reads —
 * there is none, and `i` is -1. No sleep before it is no nap before it today, which is the day's
 * first window: 1, what the count below gives when it finds none. This read `sleeps[-1].night`
 * until 2026-09-26, behind an `as Sleep` that told the compiler the index was always good, and
 * Today threw "Cannot read property 'night' of undefined" on every draw while that nap's timer ran
 * (the owner's crash on tapping Start). The index is checked now, not asserted.
 */
function positionAfter(
  sleeps: readonly Sleep[],
  i: number,
  chain: ReadonlyMap<number, number>,
  dayStartOf: (ms: number) => number,
): number {
  const s = sleeps[i];
  if (s === undefined) return 1;
  if (s.night) return 1;
  const before = chain.get(s.startMs);
  if (before !== undefined) return before + 1;
  const day = dayStartOf(s.endMs ?? s.startMs);
  let naps = 0;
  for (let j = i; j >= 0; j--) {
    const x = sleeps[j];
    if (x === undefined || x.night || dayStartOf(x.endMs ?? x.startMs) !== day) break;
    naps += 1;
  }
  return naps + 1;
}

/** The windows the engine counts, and the ones that hid a nap nobody logged (`MISSED_NAP_SHARE`). */
interface WindowsRead {
  windows: WakeWindow[];
  /** The chain of positions the windows sit on, keyed by the next sleep's start. */
  chain: Map<number, number>;
  /** Windows before a nap that were two windows and a forgotten nap: never counted as a window. */
  missed: WakeWindow[];
}

/**
 * The windows, read twice: once as logged, for the household's own usual window before a nap at each
 * point of the day; then again with any window more than `MISSED_NAP_SHARE` times that usual set
 * aside as one that hid a nap, and the day counted on past it.
 */
function windowsOf(
  sleeps: readonly Sleep[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
): WindowsRead {
  const asLogged = walkWindows(sleeps, nowMs, dayStartOf, null);
  const napFollowed = asLogged.windows.filter(w => !w.nextIsNight);
  const weight = (w: WakeWindow): number => recencyWeight(nowMs - w.wokeAtMs);
  // this position's own middle where it has three, every nap-followed window pooled where not —
  // the same fallback the prediction itself takes (`napOutlook`)
  const middle = (list: readonly WakeWindow[]): number | null =>
    list.length < MIN_POSITION_SAMPLES
      ? null
      : weightedMedian(
          list.map(w => w.awakeMs),
          list.map(weight),
        );
  /*
    THE BAR IS THE LOWER OF THIS POINT'S USUAL AND THE WHOLE DAY'S (2026-10-06, the owner, of a card
    reading "usually awake about 5h 10m after the night": "what happens is probably user forget to
    set entries for it … in the morning where things are hectic"). Measured against its own position
    alone, a nap forgotten on MOST mornings made the morning's usual window two windows and a nap
    long, and then no morning was ever long enough to be read as one that hid a nap — the log's own
    habit hid itself. The household's windows before a nap across the whole day are a steadier
    yardstick: one morning in five forgotten or four in five, the day's other windows still say how
    long this baby is usually awake before a nap, and a stretch past 1.8 times that is two windows
    and a nap nobody logged. Still only this household's own entries, never a number of hours a baby
    should be awake (CLAUDE.md §2 rule 6).
  */
  const dayUsual = middle(napFollowed);
  const usualBeforeNap = (position: number): number | null => {
    const here = napFollowed.filter(w => w.position === position);
    const own = here.length >= MIN_POSITION_SAMPLES ? middle(here) : dayUsual;
    if (own === null) return dayUsual;
    return dayUsual === null ? own : Math.min(own, dayUsual);
  };
  return walkWindows(sleeps, nowMs, dayStartOf, usualBeforeNap);
}

function walkWindows(
  sleeps: readonly Sleep[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
  usualBeforeNap: ((position: number) => number | null) | null,
): WindowsRead {
  const since = nowMs - NAP_LOOKBACK_DAYS * DAY;
  const windows: WakeWindow[] = [];
  const missed: WakeWindow[] = [];
  const chain = new Map<number, number>();
  for (let i = 0; i < sleeps.length - 1; i++) {
    const a = sleeps[i] as Sleep;
    const b = sleeps[i + 1] as Sleep;
    if (a.endMs === null) continue;
    // a waking between two night sleeps is a night waking, and not part of anybody's day
    if (a.night && b.night) continue;
    const gap = b.startMs - a.endMs;
    if (gap < MIN_AWAKE_MS || gap > MAX_AWAKE_MS) continue;
    const position = positionAfter(sleeps, i, chain, dayStartOf);
    // only a window before a NAP can have hidden one: the run-up to the night is left as it is
    const usual = b.night || usualBeforeNap === null ? null : usualBeforeNap(position);
    const hidNap = usual !== null && gap > MISSED_NAP_SHARE * usual;
    // …and the day counts on past the nap it hid, so the windows after it keep their places
    chain.set(b.startMs, hidNap ? position + 1 : position);
    if (a.endMs < since) continue;
    (hidNap ? missed : windows).push({
      position,
      wokeAtMs: a.endMs,
      awakeMs: gap,
      nextStartMs: b.startMs,
      nextIsNight: b.night,
      napMs:
        !b.night && b.endMs !== null && b.endMs - b.startMs >= MIN_NAP_MS
          ? b.endMs - b.startMs
          : null,
      prevNapMs: a.night ? null : a.endMs - a.startMs,
    });
  }
  return { windows, chain, missed };
}

/**
 * THE WINDOWS, READ OFF THE LOG — the day's wake windows over the lookback, night wakings left out,
 * and a window that hid a nap nobody logged left out too (`MISSED_NAP_SHARE`).
 *
 * `dayStartOf` is the household's own local midnight — supplied rather than computed, because this
 * package never reads a zone.
 */
export function wakeWindows(
  logs: readonly SleepLog[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
): WakeWindow[] {
  return windowsOf(sleepsOf(logs, nowMs, dayStartOf), nowMs, dayStartOf).windows;
}

/** One night as the log tells it: the first piece's start to the last piece's end. */
export interface NightStretch {
  startMs: number;
  /** null while the last piece is still running. */
  endMs: number | null;
}

/**
 * A WAKING LONGER THAN THIS ENDS THE NIGHT. Four hours: far longer than a night feed and a
 * resettle, far shorter than a day — and a day is what sits between two nights when a household
 * logs no naps, so without it two nights and the unlogged day between them would read as one.
 */
const NIGHT_BREAK_MS = 4 * HOUR;

/**
 * THE NIGHTS, EACH ONE WHOLE — for "Schedule from your log" (`fromLog.ts`), which needs when a
 * household's nights begin and end rather than the windows between sleeps.
 *
 * It reads the log exactly as the outlook does (`sleepsOf`: pieces under twenty minutes apart are
 * one sleep, a sleep past five hours is the night, and an evening sleep that runs into the night
 * is its first piece), then joins the night's pieces across its wakings — so a night logged in
 * five pieces is one night, from its bedtime to its morning.
 */
export function nightStretches(
  logs: readonly SleepLog[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
): NightStretch[] {
  const out: NightStretch[] = [];
  for (const s of sleepsOf(logs, nowMs, dayStartOf)) {
    if (!s.night) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && prev.endMs !== null && s.startMs - prev.endMs < NIGHT_BREAK_MS) {
      prev.endMs = s.endMs === null ? null : Math.max(prev.endMs, s.endMs);
      continue;
    }
    out.push({ startMs: s.startMs, endMs: s.endMs });
  }
  return out;
}

/** The medians, kept per position with the pooled one beside them. */
export interface NapRhythm {
  /** position → the recency-weighted middle window there, how many it came from, and the nap after. */
  byPosition: Map<number, { awakeMs: number; samples: number; napMs: number | null }>;
  /** Every window pooled — what "your windows generally" means. */
  awakeMs: number | null;
  samples: number;
  /** The middle number of naps a day, over the days that have any sleep logged at all. */
  napsPerDay: number | null;
  /** How many local days the windows were drawn from. */
  days: number;
}

/** The medians, per position and pooled, each window weighted by how recent it is. */
export function napRhythm(
  windows: readonly WakeWindow[],
  logs: readonly SleepLog[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
): NapRhythm {
  return rhythmOf(windows, sleepsOf(logs, nowMs, dayStartOf), nowMs, dayStartOf);
}

/** `napRhythm` over sleeps already read — the outlook has them, and reading the log twice is waste. */
function rhythmOf(
  windows: readonly WakeWindow[],
  sleeps: readonly Sleep[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
): NapRhythm {
  const w = (x: WakeWindow): number => recencyWeight(nowMs - x.wokeAtMs);
  const byPosition = new Map<number, { awakeMs: number; samples: number; napMs: number | null }>();
  for (const position of new Set(windows.map(x => x.position))) {
    const list = windows.filter(x => x.position === position);
    const naps = list.filter(x => x.napMs !== null);
    byPosition.set(position, {
      awakeMs:
        weightedMedian(
          list.map(x => x.awakeMs),
          list.map(w),
        ) ?? 0,
      samples: list.length,
      napMs: weightedMedian(
        naps.map(x => x.napMs as number),
        naps.map(w),
      ),
    });
  }
  const days = new Set(windows.map(x => dayStartOf(x.wokeAtMs))).size;
  const speaks = windows.length >= MIN_TOTAL_SAMPLES && days >= MIN_DAYS;
  return {
    byPosition,
    awakeMs: speaks
      ? weightedMedian(
          windows.map(x => x.awakeMs),
          windows.map(w),
        )
      : null,
    samples: windows.length,
    napsPerDay: napsPerDayOf(sleeps, nowMs, dayStartOf),
    days,
  };
}

/**
 * NAPS A DAY, over the days this household logged ANY sleep — never over the whole lookback, and
 * never today, which is half a day and would drag the middle down. A nap logged in two pieces is
 * one nap, because the sleeps are merged before they are counted.
 */
function napsPerDayOf(
  sleeps: readonly Sleep[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
): number | null {
  const since = nowMs - NAP_LOOKBACK_DAYS * DAY;
  const today = dayStartOf(nowMs);
  const perDay = new Map<number, number>();
  for (const s of sleeps) {
    if (s.startMs < since || s.endMs === null) continue;
    const day = dayStartOf(s.startMs);
    if (day === today) continue;
    perDay.set(day, (perDay.get(day) ?? 0) + (isNap(s) ? 1 : 0));
  }
  const days = [...perDay.keys()];
  return weightedMedian(
    days.map(d => perDay.get(d) ?? 0),
    days.map(d => recencyWeight(nowMs - d)),
  );
}

const isNap = (s: Sleep): boolean =>
  !s.night && s.endMs !== null && s.endMs - s.startMs >= MIN_NAP_MS;

/* ------------------------------------------------------------------ the outlook */

export type NapState = 'asleep' | 'awake' | 'unknown';
/**
 * Where the number came from: this position in the day, every window pooled, or — when the log has
 * a gap and there is no waking to count from — the household's usual clock time alone.
 */
export type NapBasis = 'position' | 'pooled' | 'clock';
/** Which sleep comes next — or, while asleep, which one this is. */
export type SleepKindNext = 'nap' | 'night';

export interface NapOutlook {
  state: NapState;
  /** Which wake of the day this is. 0 while asleep or unknown. */
  position: number;
  /** Awake: when the baby last woke, and for how long. */
  awakeSinceMs: number | null;
  awakeForMs: number | null;
  /** Asleep: when this sleep started, and for how long so far. */
  asleepSinceMs: number | null;
  asleepForMs: number | null;
  /**
   * The usual wake window to go on — this position's before a nap, the pooled run-up before the
   * night — or null while there is not enough log for one.
   */
  awakeMs: number | null;
  samples: number;
  /** Awake: where `awakeMs` came from. Asleep in a nap: where `usualNapMs` came from. */
  basis: NapBasis;
  /**
   * Awake: whether the next sleep is a nap or the night, by the household's own evenings — and
   * 'night', with no `nextAtMs`, while awake in the night. Asleep: which one this is. Null when
   * there is nothing to go on.
   */
  nextKind: SleepKindNext | null;
  /**
   * The household's usual clock time for that next sleep, as an instant today — the other half of
   * the blend — or null where there is no clock to go on yet (fewer than three at the position).
   */
  usualStartMs: number | null;
  /** When the next sleep would begin if the pattern held: the window and the clock, blended. */
  nextAtMs: number | null;
  /** The usual length of the sleep at this position (or of the night), and how many it came from. */
  usualNapMs: number | null;
  napSamples: number;
  /**
   * Asleep in a nap: the naps here that ran at least as long as this one has so far — their usual
   * length, and how many. At the start of a nap that is every one of them; once it has run past the
   * short ones (`outlastedSome`), only the ones that got this far. Null when fewer than three did.
   */
  lastingNapMs: number | null;
  lastingSamples: number;
  /** Whether those came from this point of the day or, with too few here, from every nap. */
  lastingBasis: NapBasis;
  outlastedSome: boolean;
  /**
   * Asleep: when this sleep would end — for a nap, at the usual length of the naps that got this
   * far; for the night, the household's usual morning. Null rather than a time already gone.
   */
  wakeAtMs: number | null;
  /**
   * In the night, asleep or awake: the household's usual morning — the first waking of the day,
   * as the middle of the recent ones — as the instant it falls on for this night, and how many
   * mornings it came from. Kept when a lie-in runs past it, because it is a usual, not a clock.
   */
  usualMorningMs: number | null;
  morningSamples: number;
  /**
   * Awake, and the last logged sleep ended more than eight hours ago (`MAX_AWAKE_MS`) — or, with a
   * nap to come, more than `MISSED_NAP_SHARE` times the household's own usual window here: the log
   * is missing sleep — naps at daycare nobody copied in, a nap nobody logged — so there is no waking
   * to count a window from. `awakeSinceMs` is then when the last LOGGED sleep ended, not how long
   * the baby has been awake, and in the evening the night is named by the usual bedtime alone.
   */
  gap: boolean;
  /** Naps already finished today, and the household's usual count for a whole day. */
  napsToday: number;
  napsPerDay: number | null;
  /** How many wake windows and how many days the whole picture rests on. */
  totalSamples: number;
  days: number;
  /**
   * THE NEXT SLEEP AS A WINDOW (the owner, 2026-10-08): `nextAtMs` with a start and an end around it,
   * sized by how far off this household's own past estimates have been (`napWindow.ts`), or the
   * default either side until there is a record. Null from the engine itself: the window is laid on
   * afterwards (`withNapWindow`), because it replays the log and the engine reads it once.
   */
  windowStartMs: number | null;
  windowEndMs: number | null;
  /** How many past estimates sized it; 0 while it is the default either side. */
  windowSamples: number;
  /** Of the past estimates, how many sleeps began inside the window given at the time, of how many. */
  windowCaught: number;
  windowJudged: number;
}

const EMPTY = (rhythm: NapRhythm): NapOutlook => ({
  state: 'unknown',
  position: 0,
  awakeSinceMs: null,
  awakeForMs: null,
  asleepSinceMs: null,
  asleepForMs: null,
  awakeMs: null,
  samples: 0,
  basis: 'pooled',
  nextKind: null,
  usualStartMs: null,
  nextAtMs: null,
  usualNapMs: null,
  napSamples: 0,
  lastingNapMs: null,
  lastingSamples: 0,
  lastingBasis: 'pooled',
  outlastedSome: false,
  wakeAtMs: null,
  usualMorningMs: null,
  morningSamples: 0,
  gap: false,
  napsToday: 0,
  napsPerDay: rhythm.napsPerDay,
  totalSamples: rhythm.samples,
  days: rhythm.days,
  windowStartMs: null,
  windowEndMs: null,
  windowSamples: 0,
  windowCaught: 0,
  windowJudged: 0,
});

/** Minutes since local midnight — for naps, which are all daytime. */
const clockOfDay = (ms: number, dayStartOf: (ms: number) => number): number =>
  (ms - dayStartOf(ms)) / MIN;
/**
 * Minutes since the NOON of the day it belongs to — for bedtimes and morning wakings, so a
 * bedtime at 12:30 a.m. is "12½ hours after noon" rather than a sleep that wrapped to the start
 * of a clock face and dragged the middle to lunchtime.
 */
const clockOfEvening = (ms: number, dayStartOf: (ms: number) => number): number =>
  (ms - (dayStartOf(ms - 12 * HOUR) + 12 * HOUR)) / MIN;

/**
 * THE CUT: THE TIME OF WAKING AFTER WHICH THE NEXT SLEEP HAS BEEN THE NIGHT.
 *
 * Over the household's own windows, the clock time of waking that misclassifies the least
 * (recency-weighted) — "after about 3:40 the next sleep has been the night". Null unless both
 * have happened: a household that never logs its nights has no evenings to learn from, and one
 * that logs nothing but nights has no naps.
 */
function nightCut(
  windows: readonly WakeWindow[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
): number | null {
  const points = windows
    .map(w => ({
      x: clockOfDay(w.wokeAtMs, dayStartOf),
      night: w.nextIsNight,
      w: recencyWeight(nowMs - w.wokeAtMs),
    }))
    .sort((a, b) => a.x - b.x);
  if (!points.some(p => p.night) || points.every(p => p.night)) return null;
  // cut below the first point: every nap-followed waking at or after it is misread as "night"
  let wrongIfBelow = 0;
  let wrongIfAbove = points.filter(p => !p.night).reduce((s, p) => s + p.w, 0);
  let best = wrongIfBelow + wrongIfAbove;
  let cut = (points[0] as { x: number }).x;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as { x: number; night: boolean; w: number };
    if (p.night) wrongIfBelow += p.w;
    else wrongIfAbove -= p.w;
    const next = points[i + 1];
    const here = next === undefined ? p.x + 1 : (p.x + next.x) / 2;
    if (wrongIfBelow + wrongIfAbove < best - 1e-9) {
      best = wrongIfBelow + wrongIfAbove;
      cut = here;
    }
  }
  return cut;
}

const NOON_MIN = 12 * 60;

/**
 * A HOUSEHOLD WITH NO AFTERNOON NAPS STILL HAS A BEDTIME. Once a toddler is down to one nap before
 * noon, every afternoon sleep in the log is a night, there is nothing to draw a line between, and
 * the sheet (which files by the household's bed time, often set later than the baby really goes
 * down) calls a 7:10 bedtime a nap. So the line is drawn an hour before the earliest recent
 * bedtime instead. The backtest put the width anywhere from half an hour to two hours with the
 * same result; an hour is the middle of that, and it took the nights misread as naps from one in
 * eighteen to one in a hundred.
 */
const BEDTIME_MARGIN_MIN = 60;

/**
 * A WAKING IN THE NIGHT IS NOT THE START OF THE DAY. After a night sleep, until an hour before the
 * household's usual morning, the baby is awake in the night — the 2 a.m. feed a parent opens the app
 * to log — and the card says when their mornings usually start rather than when "the next nap"
 * would be. Before this, every night waking got a nap time and, with it, a heads-up. An hour, by
 * the backtest: at half an hour one early morning in ten waited for its first prediction; at an
 * hour and a half one night waking in twenty was taken for the morning; at an hour, one night
 * waking in a hundred and one morning in thirty. An early riser loses nothing but the wait until
 * that hour, when the day starts anyway.
 */
const NIGHT_WAKING_MARGIN_MIN = 60;

/**
 * HOW FAR THE LAST TWO MORNINGS MUST BOTH SIT FROM THE USUAL ONE BEFORE THE WHOLE DAY IS TAKEN TO
 * HAVE MOVED. Forty-five minutes: past the ordinary spread of a household's mornings (a bedtime
 * spread of half an hour or less is common, Nanit Lab 2025, and mornings vary less than bedtimes),
 * and under the hour a clock change moves them.
 */
const DAY_SHIFT_MIN = 45;

/**
 * THE LINE BETWEEN THE HOUSEHOLD'S LATEST NAPS AND ITS BEDTIMES, by the clock time a sleep BEGAN.
 *
 * Only afternoon and evening sleeps are looked at — mornings are never the question — and the cut
 * is the start time that misfiles the fewest of them, recent ones counting most. A late catnap and
 * a bedtime are usually hours apart on the clock, which makes this a far cleaner line than the one
 * drawn by the time of waking, and it is what tells a sleep that just began which one it is.
 * Null only when there are no nights to learn from.
 */
function bedtimeCut(
  sleeps: readonly Sleep[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
): number | null {
  const since = nowMs - NAP_LOOKBACK_DAYS * DAY;
  const points = sleeps
    .filter(
      s => s.endMs !== null && s.startMs >= since && clockOfDay(s.startMs, dayStartOf) >= NOON_MIN,
    )
    .map(s => ({
      x: clockOfDay(s.startMs, dayStartOf),
      night: s.night,
      w: recencyWeight(nowMs - s.startMs),
    }))
    .sort((a, b) => a.x - b.x);
  if (!points.some(p => p.night)) return null;
  // no afternoon naps at all: an hour before the earliest bedtime, not "no line"
  if (points.every(p => p.night)) return (points[0] as { x: number }).x - BEDTIME_MARGIN_MIN;
  let wrongIfBelow = 0;
  let wrongIfAbove = points.filter(p => !p.night).reduce((sum, p) => sum + p.w, 0);
  let best = wrongIfBelow + wrongIfAbove;
  let cut = (points[0] as { x: number }).x;
  for (let i = 0; i < points.length; i++) {
    const p = points[i] as { x: number; night: boolean; w: number };
    if (p.night) wrongIfBelow += p.w;
    else wrongIfAbove -= p.w;
    const next = points[i + 1];
    const here = next === undefined ? p.x + 1 : (p.x + next.x) / 2;
    if (wrongIfBelow + wrongIfAbove < best - 1e-9) {
      best = wrongIfBelow + wrongIfAbove;
      cut = here;
    }
  }
  return cut;
}

/**
 * WHERE THE HOUSEHOLD IS RIGHT NOW, and what their own log says comes next.
 *
 * A RUNNING TIMER IS BEING ASLEEP — the same reading the schedule engine takes of a running session
 * (`sessions.ts`) — and the outlook then answers the other question: how long this one usually
 * runs, or, for the night, when the household's mornings usually start.
 */
export function napOutlook(
  logs: readonly SleepLog[],
  nowMs: number,
  dayStartOf: (ms: number) => number,
): NapOutlook {
  const sleeps = sleepsOf(logs, nowMs, dayStartOf);
  const { windows, chain, missed } = windowsOf(sleeps, nowMs, dayStartOf);
  const rhythm = rhythmOf(windows, sleeps, nowMs, dayStartOf);
  const latest = sleeps[sleeps.length - 1];
  if (latest === undefined) return EMPTY(rhythm);

  const weight = (w: WakeWindow): number => recencyWeight(nowMs - w.wokeAtMs);
  const middle = (list: readonly WakeWindow[], of: (w: WakeWindow) => number): number | null =>
    weightedMedian(list.map(of), list.map(weight));
  const speaks = rhythm.awakeMs !== null;

  const today = dayStartOf(nowMs);
  const napsToday = sleeps.filter(s => isNap(s) && dayStartOf(s.startMs) === today).length;
  const base: NapOutlook = { ...EMPTY(rhythm), napsToday };

  const napFollowed = windows.filter(w => !w.nextIsNight);
  const nightFollowed = windows.filter(w => w.nextIsNight);

  /** Every nap with a length, and the ones at a position — falling back to all of them. */
  const allNaps = napFollowed.filter(w => w.napMs !== null);
  const napsAt = (position: number): { list: WakeWindow[]; basis: NapBasis } => {
    const here = allNaps.filter(w => w.position === position);
    return here.length >= MIN_POSITION_SAMPLES
      ? { list: here, basis: 'position' }
      : { list: allNaps, basis: 'pooled' };
  };
  /** A nap's usual length at a position, falling back to every nap pooled. */
  const napLengthAt = (
    position: number,
  ): { ms: number | null; samples: number; basis: NapBasis } => {
    const { list, basis } = napsAt(position);
    return {
      ms: speaks ? middle(list, w => w.napMs as number) : null,
      samples: list.length,
      basis,
    };
  };
  /**
   * THE NAPS THAT GOT THIS FAR. A nap is one sleep cycle or several, so a household's naps are two
   * crowds — the ones that ended after a cycle and the ones that went on — and their middle is a
   * poor answer once this nap has outlasted the first crowd: by an hour in, the usual length was
   * often a time already gone. So the end is read off the naps here that ran at least as long as
   * this one has so far — at the start, all of them. Where fewer than three here got this far,
   * the naps at every point of the day that did; fewer than three of those, and there is no end
   * time rather than a guess. The backtest: from fifty minutes into a nap, a third less error, and
   * no end time already in the past.
   */
  const lastingAt = (position: number, ranMs: number) => {
    const { list, basis } = napsAt(position);
    const got = (w: WakeWindow): boolean => (w.napMs as number) > ranMs;
    let lasting = list.filter(got);
    let from: NapBasis = basis;
    if (lasting.length < MIN_POSITION_SAMPLES && basis === 'position') {
      lasting = allNaps.filter(got);
      from = 'pooled';
    }
    const enough = speaks && lasting.length >= MIN_POSITION_SAMPLES;
    return {
      ms: enough ? middle(lasting, w => w.napMs as number) : null,
      samples: enough ? lasting.length : 0,
      basis: from,
      // any nap here that ended sooner: the plain usual is no longer the answer
      outlastedSome: list.some(w => !got(w)),
    };
  };

  /**
   * The household's usual morning, as minutes after the noon before it, from the day's first windows
   * — a first window that hid a nap nobody logged included: its waking was still the morning.
   */
  const mornings = [...windows, ...missed]
    .filter(w => w.position === 1)
    .sort((a, b) => a.wokeAtMs - b.wokeAtMs);
  const usualMorning = speaks
    ? middle(mornings, w => clockOfEvening(w.wokeAtMs, dayStartOf))
    : null;
  /*
    THE DAY MOVED — a clock change, a trip, a new start time at daycare. Every usual clock time
    below is a weighted middle, and a middle catches up with a routine that moved as a whole only
    over days. The morning waking is the day's anchor (the time that varies least of any, Mindell
    2016), so when the last two mornings BOTH came at least `DAY_SHIFT_MIN` from the usual one, in
    the same direction and within the last three days, the whole day has moved, and every clock
    time here moves with it by the smaller of the two. One early morning is a bad night and moves
    nothing. As the middles catch up the difference shrinks below the line and this stops by itself.
  */
  let shift = 0;
  if (usualMorning !== null) {
    const [a, b] = mornings
      .filter(w => nowMs - w.wokeAtMs <= 3 * DAY)
      .slice(-2)
      .map(w => clockOfEvening(w.wokeAtMs, dayStartOf) - usualMorning);
    if (a !== undefined && b !== undefined && Math.sign(a) === Math.sign(b)) {
      const smaller = Math.min(Math.abs(a), Math.abs(b));
      if (smaller >= DAY_SHIFT_MIN) shift = Math.sign(a) * smaller;
    }
  }
  const morningClock = usualMorning === null ? null : usualMorning + shift;

  /*
    WHICH SLEEPS ARE THE NIGHT, read the same way asleep and awake. The sheet files a sleep by where
    it starts against the household's bed time, so a baby down at 7:10 in a "7:30" household is a
    "nap" until the next piece of the night is logged. An afternoon or evening sleep that began at
    or after the household's own line between its latest naps and its bedtimes (`bedtimeCut`) is
    the night — a 4:30 catnap stays a nap, a 7:10 bedtime is the night from its first minute, and
    the 10 p.m. waking after it is a waking in the night.
  */
  const bedCut = bedtimeCut(sleeps, nowMs, dayStartOf);
  const cut = bedCut === null ? null : bedCut + shift;
  const beganAsNight = (x: Sleep): boolean =>
    x.night ||
    (cut !== null &&
      clockOfDay(x.startMs, dayStartOf) >= NOON_MIN &&
      clockOfDay(x.startMs, dayStartOf) >= cut);

  /** The first usual morning after `ms`: noon of the day it belongs to, plus the usual offset. */
  const morningAfter = (ms: number, clock: number): number => {
    let at = dayStartOf(ms - 12 * HOUR) + 12 * HOUR + clock * MIN;
    while (at <= ms) at += DAY;
    return at;
  };

  if (latest.endMs === null) {
    /*
      ASLEEP. The night answers with the household's usual morning; a nap with its usual length.
      Which one this is cannot wait for five hours or for a night waking — the card is read in the
      first minutes — so it is `beganAsNight`, from the first minute.
    */
    const isNight = beganAsNight(latest);
    /*
      ASLEEP SINCE THE SESSION THAT IS RUNNING, NOT THE SLEEP IT WAS JOINED TO (2026-10-06, the
      owner's regression screenshot: the timer said "Sleeping 5h 28m, Started 2:29 PM" and this card
      "Asleep 22h 58m", "Started 9:00 PM, Yesterday"). `sleepsOf` joins a sleep begun within
      `MIN_AWAKE_MS` of the last one's end to it — one sleep logged as two — and that is right for
      what the log says about patterns: which nap this is, whether it is the night, how long such
      sleeps run. It is wrong for the two numbers Today shows beside a running timer: when this
      session began and how long it has run. Those are the running entry's own, so the card, the
      timer and the sticky bar say one thing. (A running entry: no end yet, or one past `nowMs`, as
      `sleepsOf` reads it; the latest-begun of those, never before the joined sleep's start.)
    */
    const sinceMs = logs.reduce(
      (since, s) =>
        s.startMs <= nowMs && (s.endMs === null || s.endMs > nowMs) && s.startMs > since
          ? s.startMs
          : since,
      latest.startMs,
    );
    const asleep = {
      ...base,
      state: 'asleep' as const,
      asleepSinceMs: sinceMs,
      asleepForMs: nowMs - sinceMs,
      nextKind: isNight ? ('night' as const) : ('nap' as const),
    };
    if (isNight) {
      if (morningClock === null) return asleep;
      const wakeAt = morningAfter(latest.startMs, morningClock);
      return {
        ...asleep,
        position: 0,
        usualNapMs: wakeAt - latest.startMs,
        napSamples: mornings.length,
        usualMorningMs: wakeAt,
        morningSamples: mornings.length,
        // a lie-in past the usual morning keeps the usual in the sentence and drops the clock
        wakeAtMs: wakeAt > nowMs ? wakeAt : null,
      };
    }
    // placed by the sleep before it — which a first sleep in the log does not have, and then this
    // nap is the day's first (`positionAfter` answers 1 for index -1)
    const position =
      chain.get(latest.startMs) ?? positionAfter(sleeps, sleeps.length - 2, chain, dayStartOf);
    const nap = napLengthAt(position);
    const lasting = lastingAt(position, nowMs - latest.startMs);
    return {
      ...asleep,
      position,
      basis: nap.basis,
      usualNapMs: nap.ms,
      napSamples: nap.samples,
      lastingNapMs: lasting.ms,
      lastingSamples: lasting.samples,
      lastingBasis: lasting.basis,
      outlastedSome: lasting.outlastedSome,
      wakeAtMs: lasting.ms === null ? null : latest.startMs + lasting.ms,
    };
  }

  // AWAKE.
  const wokeAtMs = latest.endMs;
  const position = positionAfter(sleeps, sleeps.length - 1, chain, dayStartOf);
  const awake: NapOutlook = {
    ...base,
    state: 'awake',
    position,
    awakeSinceMs: wokeAtMs,
    awakeForMs: nowMs - wokeAtMs,
  };
  if (!speaks) return awake;

  /*
    A GAP IN THE LOG. Eight hours since the last logged sleep ended is not a wake window (the same
    line `windowsOf` draws for the history): the naps in between happened somewhere nobody logged.
    Counting from that waking would name a nap that was due at nine in the morning at half past
    five in the evening. So nothing is counted from it, and the card says what it knows: when the
    last logged sleep ended — and, once the evening has come by the household's own evenings, the
    usual bedtime, which is a clock time and needs no waking to count from. (The same reading is
    taken sooner when a nap is due and the stretch has already run far past the household's own
    window here — a nap nobody logged, `MISSED_NAP_SHARE` — below.)
  */
  const inGap = (): NapOutlook => {
    const gap: NapOutlook = { ...awake, position: 0, gap: true };
    // a log left alone for a week has nothing current to say: it waits for the next sleep
    if (nowMs - wokeAtMs > FORGET_AFTER_MS) return gap;
    /*
      THE NEXT NAP BY THE CLOCK (the owner, 2026-10-06: "I stop logging actively for 2 days and now
      it's not showing anything for sleep outlook. It can't forget that easily, 2 days is too soon.
      I get if it's one week"). With no waking to count from, the household's own usual clock time
      for each nap of the day still stands: the first nap whose usual start is still ahead today,
      from that nap's own sleeps (`MIN_POSITION_SAMPLES` of them), is named, marked as by the
      clock. Before the morning's first nap and between naps alike; the evening falls through to
      the usual bedtime below.
    */
    const clockNow0 = clockOfDay(nowMs, dayStartOf);
    // only in the day: past the household's usual morning (minutes after noon, so less twelve hours)
    const daytime = morningClock !== null && clockNow0 >= morningClock - 12 * 60;
    const positions = daytime
      ? [...new Set(napFollowed.map(w => w.position))].sort((x, y) => x - y)
      : [];
    for (const p of positions) {
      const here = napFollowed.filter(w => w.position === p);
      if (here.length < MIN_POSITION_SAMPLES) continue;
      const usual = middle(here, w => clockOfDay(w.nextStartMs, dayStartOf));
      if (usual === null || usual + shift <= clockNow0) continue;
      const at = dayStartOf(nowMs) + (usual + shift) * MIN;
      return {
        ...gap,
        basis: 'clock',
        nextKind: 'nap',
        samples: here.length,
        usualStartMs: at,
        nextAtMs: at,
      };
    }
    const usualBed = middle(nightFollowed, w => clockOfEvening(w.nextStartMs, dayStartOf));
    const evening = nightCut(windows, nowMs, dayStartOf);
    const clockNow = clockOfDay(nowMs, dayStartOf);
    if (usualBed === null || evening === null) return gap;
    if (clockNow < evening + shift || clockNow < NOON_MIN) return gap;
    const bedAt = dayStartOf(nowMs) + 12 * HOUR + (usualBed + shift) * MIN;
    // the usual bedtime already well behind the clock is not a prediction any more
    if (bedAt < nowMs - 15 * MIN) return gap;
    return {
      ...gap,
      basis: 'clock',
      nextKind: 'night',
      samples: nightFollowed.length,
      usualStartMs: bedAt,
      nextAtMs: bedAt,
    };
  };
  if (nowMs - wokeAtMs > MAX_AWAKE_MS) return inGap();

  // awake in the night: the night is not over, so there is no "next nap" to name
  if (
    beganAsNight(latest) &&
    morningClock !== null &&
    // the WAKING was in the night, not only the glance at the card: a day nobody logged is not a
    // night waking just because the last sleep in the log was the night
    clockOfEvening(wokeAtMs, dayStartOf) < morningClock - NIGHT_WAKING_MARGIN_MIN &&
    clockOfEvening(nowMs, dayStartOf) < morningClock - NIGHT_WAKING_MARGIN_MIN
  ) {
    return {
      ...awake,
      position: 0,
      nextKind: 'night',
      usualMorningMs: morningAfter(nowMs, morningClock),
      morningSamples: mornings.length,
    };
  }

  // the nap candidate: this position's window, blended with this nap's usual clock time
  const here = napFollowed.filter(w => w.position === position);
  const own = here.length >= MIN_POSITION_SAMPLES;
  const napList = own ? here : napFollowed;
  const napWindow = middle(napList, w => w.awakeMs);
  let napAt = napWindow === null ? null : wokeAtMs + napWindow;
  let napClockAt: number | null = null;
  if (own && napWindow !== null && napAt !== null) {
    const usual = middle(here, w => clockOfDay(w.nextStartMs, dayStartOf));
    if (usual !== null) {
      napClockAt = dayStartOf(wokeAtMs) + (usual + shift) * MIN;
      const a = blendWeight(
        here.map(w => ({
          byWindow: w.wokeAtMs + napWindow,
          byClock: dayStartOf(w.wokeAtMs) + usual * MIN,
          actual: w.nextStartMs,
          weight: weight(w),
        })),
      );
      napAt = a * napAt + (1 - a) * napClockAt;
    }
  }

  // the night candidate: the run-up to the night, blended with the usual time the night starts
  const lastWindow = middle(nightFollowed, w => w.awakeMs);
  const usualBed = middle(nightFollowed, w => clockOfEvening(w.nextStartMs, dayStartOf));
  const noon = dayStartOf(wokeAtMs) + 12 * HOUR;
  let nightAt: number | null = null;
  if (lastWindow !== null && usualBed !== null) {
    const a = blendWeight(
      nightFollowed.map(w => ({
        byWindow: w.wokeAtMs + lastWindow,
        byClock: dayStartOf(w.wokeAtMs) + 12 * HOUR + usualBed * MIN,
        actual: w.nextStartMs,
        weight: weight(w),
      })),
    );
    nightAt = a * (wokeAtMs + lastWindow) + (1 - a) * (noon + (usualBed + shift) * MIN);
  }

  // which comes next: the household's own evenings say, where it has any
  let night: boolean;
  if (napAt === null) night = nightAt !== null;
  else if (nightAt === null) night = false;
  else {
    const evening = nightCut(windows, nowMs, dayStartOf);
    night =
      evening === null ? napAt >= nightAt : clockOfDay(wokeAtMs, dayStartOf) - shift >= evening;
  }

  if (night && nightAt !== null && lastWindow !== null && usualBed !== null) {
    return {
      ...awake,
      awakeMs: lastWindow,
      samples: nightFollowed.length,
      basis: 'pooled',
      nextKind: 'night',
      usualStartMs: noon + (usualBed + shift) * MIN,
      nextAtMs: nightAt,
      usualNapMs: null,
      napSamples: 0,
    };
  }
  /*
    A NAP NOBODY LOGGED, WHILE IT IS HAPPENING (`MISSED_NAP_SHARE`). A nap is next, and the stretch
    since the last logged sleep has already run more than 1.8 times this household's own window
    here: the nap it points at is long gone, and far likelier to have happened unlogged than to be
    still to come. So this is read as a gap in the log, exactly as eight hours with nothing logged
    is — when the last logged sleep ended, and in the evening the usual bedtime — rather than a
    "next nap" at a time already past. The window it measures against has three or more behind it.
  */
  if (
    napAt !== null &&
    napWindow !== null &&
    napList.length >= MIN_POSITION_SAMPLES &&
    nowMs - wokeAtMs >
      MISSED_NAP_SHARE * Math.min(napWindow, middle(napFollowed, w => w.awakeMs) ?? napWindow)
  ) {
    return inGap();
  }
  const nap = napLengthAt(position);
  return {
    ...awake,
    awakeMs: napWindow,
    samples: napList.length,
    basis: own ? 'position' : 'pooled',
    nextKind: napAt === null ? null : 'nap',
    usualStartMs: napClockAt,
    nextAtMs: napAt,
    usualNapMs: nap.ms,
    napSamples: nap.samples,
  };
}

/**
 * HOW FAR AHEAD OF THE NEXT SLEEP ITS HEADS-UP RINGS: fifteen minutes, whatever the stretch (the
 * product decision of 2026-09-28, on the owner's "sleep/nap predictor tells you… soon"). The feed's
 * share of the gap (`leadFor`) is a twelfth, which before a two-hour stretch awake is ten minutes;
 * fifteen is the owner's own first example of a heads-up (2026-09-18: two hours forty-five into a
 * three-hour rhythm), and it is one number a parent can learn.
 */
export const NAP_HEADS_UP_LEAD_MS = 15 * MIN;

/**
 * THE NAP OUTLOOK AS A FORESIGHT RHYTHM, so the heads-up notification for a sleep is planned off
 * the outlook rather than off the median gap between sleep starts (`foresight.ts` measures
 * start-to-start, which is the right question for a feed and the wrong one for a sleep). Null
 * while the outlook has nothing to say — and while the baby is asleep, because the next lying-down
 * is not a thing to warn about from inside the current one.
 *
 * IT CARRIES ITS OWN LEAD AND ITS OWN WORDS (2026-09-28): fifteen minutes ahead, and which sleep
 * it is with the usual stretch awake before it, so the heads-up can say "Nap time for Ada around
 * 10:40 AM" over the outlook's own arithmetic rather than a gap between starts. The window is left
 * out where the outlook went by the usual bedtime alone (a gap in the log): there is no waking to
 * count a stretch from.
 *
 * AND IT CAN SAY WHOSE LOG IT READ (2026-10-01): `childId`, where the caller passes one, rides on
 * the rhythm (`Rhythm.nap.childId`), so the planner can ask whether THAT child has set nap times or
 * a bedtime, which win over the heads-up (`apps/mobile/src/notifications/plan.ts`).
 */
export function napAsRhythm(o: NapOutlook, childId?: string | null): Rhythm | null {
  if (o.state !== 'awake' || o.awakeSinceMs === null || o.nextAtMs === null) return null;
  // a nap named by the clock while the log is quiet is for the card, never a push: a parent who
  // has not logged for days is not asked to by a phone that buzzes at nap time (2026-10-06)
  if (o.gap && o.nextKind === 'nap') return null;
  // WITH A WINDOW, the heads-up comes fifteen minutes before it opens and names both ends
  // (2026-10-08): "Nap time for Ada 10:30–10:50 AM"
  const windowed = o.windowStartMs != null && o.windowEndMs != null;
  return {
    activity: 'sleep',
    medianGapMs: o.nextAtMs - o.awakeSinceMs,
    samples: o.samples,
    lastAtMs: o.awakeSinceMs,
    nextAtMs: windowed ? (o.windowStartMs as number) : o.nextAtMs,
    leadMs: NAP_HEADS_UP_LEAD_MS,
    nap: {
      kind: o.nextKind === 'night' ? 'night' : 'nap',
      windowMs: o.basis === 'clock' ? null : o.awakeMs,
      ...(windowed ? { untilMs: o.windowEndMs } : {}),
      ...(childId === undefined ? {} : { childId }),
    },
  };
}
