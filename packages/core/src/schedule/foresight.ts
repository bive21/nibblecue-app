/**
 * WHAT A HOUSEHOLD'S OWN LOG SAYS IS COMING, and the reminders that follow from it.
 *
 * The owner, 2026-09-18: *"based on the entry how often baby sleep, you need to send
 * 'prediction' notifications, for example baby usually sleep every 3 hours, then in 2 hours 45
 * minutes, notification need to be sent to phone… same with pumping/bottle/bath/or any module
 * notificaitons… if there are 2 activities schedule around the same time, then the notifications
 * should be 2 in one."*
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ────────────────────────────────────────────────────────
 *
 * It is arithmetic over rows the household wrote. Take the starts of one activity over the last
 * two weeks, take the gaps that followed the same time of day, take the middle one (recent days
 * counting for more), and say when the next would fall if the pattern held. Nothing is fetched,
 * nothing is modelled, and no other household's data is involved at any point — a median of a
 * parent's own timestamps is a fact about their fortnight. How each rule was chosen, and what it
 * measured, is `docs/NOTIFICATIONS.md` (Addendum — the heads-up).
 *
 * It is NOT a judgement about the baby. Nothing here says a gap is too long or too short, that a
 * pattern is good or bad, or that anything should be done about it (CLAUDE.md §2 rule 3, which
 * is about DIAGNOSING a problem and which this does not do). `foresight.copy.ts` holds the
 * sentences and the words they may not contain.
 *
 * ── WHY IT LIVES ON THE PHONE ───────────────────────────────────────────────────────────────
 *
 * The owner asked whether it should run locally or on a server "if taking too much resources".
 * The answer is local, comfortably: the whole computation is a sort and a median over at most a
 * few hundred numbers, which is microseconds, and it runs when the day's plan is rebuilt rather
 * than on a tick. A server round trip would cost more than the work does, would not function
 * offline, and would mean sending a household's timestamps somewhere to be told what they
 * already say.
 *
 * AND IT NEEDS NO APPLE OR GOOGLE SETUP. These are LOCAL notifications — the phone schedules
 * them against its own clock, the same way the schedule's reminders already work. APNs and FCM
 * are for pushes from a server, which this is not.
 */
import { zoneOffsetMs } from '../today/day';
import { MIN } from './types';

const DAY_MS = 24 * 60 * MIN;

/** A logged start, which is all the shape this needs. */
export interface Beat {
  activity: string;
  startMs: number;
}

export interface Rhythm {
  /** The activity it is about; for a feed, whichever kind was given last. */
  activity: string;
  /**
   * The household's usual gap after an occurrence at this time of day — the weighted middle of
   * the gaps it came from. Shown in the sentence, so it is the number the answer was made of.
   */
  medianGapMs: number;
  /** How many gaps that answer was taken from — shown, never hidden. */
  samples: number;
  /** The most recent start the rhythm was measured against. */
  lastAtMs: number;
  /** When the next would fall if the pattern held. */
  nextAtMs: number;
  /**
   * HOW FAR AHEAD ITS HEADS-UP RINGS, where the rhythm fixes it: the nap outlook's fifteen minutes
   * (`napAsRhythm`, 2026-09-28). Absent, a twelfth of the gap (`leadFor`).
   */
  leadMs?: number;
  /**
   * THE NAP OUTLOOK'S OWN READING, on the rhythm it hands the heads-up (`napAsRhythm`): which sleep
   * comes next, and the household's usual stretch awake before it, or null where the outlook went by
   * the usual bedtime alone. The sleep heads-up says these (`naps.copy.ts` `napHeadsUpTitle`), never
   * `medianGapMs`, which for a sleep is a stretch from the waking and not a gap between starts.
   *
   * `childId` IS WHOSE LOG IT READ (2026-10-01), where the caller knows: the planner stands the
   * heads-up down for that child's own set nap times or bedtime and nobody else's, so one twin's
   * routine never silences the other twin's heads-up. Absent, any sleep rule counts.
   */
  nap?: {
    kind: 'nap' | 'night';
    windowMs: number | null;
    /** The end of the outlook's window, where it has one: `nextAtMs` is then its start. */
    untilMs?: number | null;
    childId?: string | null;
  };
}

/**
 * HOW MANY GAPS BEFORE A RHYTHM IS WORTH SAYING OUT LOUD.
 *
 * Four, which is five entries. Two gaps can be a coincidence and three can be one unusual
 * afternoon; four is the fewest that can survive a single outlier once the MEDIAN is what is
 * being taken. It is deliberately a low bar — a household on day two has a rhythm worth
 * describing — and the sample count travels with every answer so a thin one can be shown as
 * thin rather than presented as settled.
 */
export const MIN_SAMPLES = 4;

/** How far back to look. Recent days count for more inside it (`HALF_LIFE_DAYS`). */
const LOOKBACK_DAYS = 14;

/**
 * A gap longer than this is not part of an ordinary rhythm — it is a night, a day out, or a gap
 * in the logging. It is the fallback's limit, and the sentence's: a gap past it is said as
 * "11h after the last one", not "every 11h".
 */
export const MAX_GAP_MS = 8 * 60 * 60_000;
/** A gap shorter than this is a correction or a double entry, not a fresh occurrence. */
export const MIN_GAP_MS = 10 * MIN;

/* ------------------------------------------------------------------ what was measured */

/*
  HOW THIS WAS CHOSEN (2026-09-23, docs/NOTIFICATIONS.md, Addendum — the heads-up). The owner asked for the reminders to be
  accurate, so the engine was measured the way the nap outlook was: a seeded population of
  simulated households (`foresight.sim.ts` — feeds and pumps as the published guidance describes
  them, logged the way tired parents log), every logged feed and pump replayed, and the heads-up
  the phone would have planned scored against the next one that really happened
  (`foresight.backtest.test.ts`). The first engine — one median of every gap under eight hours,
  per activity, over two weeks — missed the next feed by 47 minutes at the median and planned a
  heads-up into the night after every bedtime feed of a baby who sleeps through. Each rule below
  earned its place on that bench, and each is kept only because it won in every variant of the
  households tried (messier and tidier logging, regular and irregular babies, newborns who
  cluster-feed, older babies who sleep through, mixed feeding).
*/

/**
 * ONE FEED, HOWEVER IT WAS GIVEN. A bottle and a breastfeed are both a feed to the baby, and a
 * family that does both has one rhythm of feeds, not two half-rhythms of each kind: measured
 * apart, the bottles of a mostly-breastfed baby come six hours apart and the heads-up says so.
 */
export const FEED_ACTIVITIES: ReadonlySet<string> = new Set(['bottle', 'breastfeed']);

/**
 * TWO ENTRIES WITHIN HALF AN HOUR ARE ONE OCCURRENCE: a breastfeed topped up with a bottle, a
 * breastfeed logged a side at a time, both parents logging the same bottle. Counted as two, each
 * teaches the engine a twenty-minute rhythm that is not there.
 */
export const SAME_OCCURRENCE_MS = 30 * MIN;

/**
 * THE GAP THAT FOLLOWS THIS TIME OF DAY. The gap after a 3 p.m. feed and the gap after the
 * bedtime feed are different numbers — the evening cluster, the long first stretch of the night,
 * the parent's working day for a pump — and one median of both is wrong for each. So the answer
 * is taken from the gaps that began within an hour of the last one's clock time, when there are
 * at least `SIMILAR_MIN` of them, up to `SIMILAR_MAX_GAP_MS` long (the whole night after the
 * bedtime feed, or the evening after the last pump at work to the first one the next morning).
 * Otherwise it falls back to the plain median of the ordinary gaps, as before.
 */
const SIMILAR_WINDOW_MIN = 60;
const SIMILAR_MIN = 3;
const SIMILAR_MAX_GAP_MS = 20 * 60 * 60_000;

/**
 * RECENT DAYS COUNT FOR MORE. A baby's gaps lengthen by the week and change in days during a
 * growth spurt, so a gap from three days ago counts half as much as today's. Two weeks are still
 * read, so a quiet stretch does not leave the engine with nothing to say.
 */
const HALF_LIFE_DAYS = 3;

/**
 * The phone's clock, for the two questions the rules above ask of a time: what time of day it
 * was, and whether that day was a weekend. Injected so the arithmetic stays pure; `utcClock` is
 * the default, `zoneClock` the phone's.
 */
export interface LocalClock {
  minuteOfDay(ms: number): number;
  weekend(ms: number): boolean;
}

const minuteOfUtcDay = (ms: number): number =>
  Math.floor((((ms % DAY_MS) + DAY_MS) % DAY_MS) / MIN);
// 1970-01-01 was a Thursday, so day 0 is 4 in Sunday-first counting
const weekdayOfUtc = (ms: number): number => (((Math.floor(ms / DAY_MS) + 4) % 7) + 7) % 7;

const utcClock: LocalClock = {
  minuteOfDay: minuteOfUtcDay,
  weekend: ms => {
    const d = weekdayOfUtc(ms);
    return d === 0 || d === 6;
  },
};

/** The clock of a zone — the phone's, as every other time on it is read. */
export function zoneClock(zone: string): LocalClock {
  const local = (ms: number): number => {
    try {
      return ms + zoneOffsetMs(zone, ms);
    } catch {
      return ms; // a zone this runtime cannot read: UTC, rather than no answer
    }
  };
  return {
    minuteOfDay: ms => utcClock.minuteOfDay(local(ms)),
    weekend: ms => utcClock.weekend(local(ms)),
  };
}

const clockDistance = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 1440;
  return Math.min(d, 1440 - d);
};

/** The middle of weighted values: where half the weight lies on each side. */
function weightedMedian(xs: readonly { v: number; w: number }[]): number {
  const sorted = [...xs].sort((a, b) => a.v - b.v);
  const total = sorted.reduce((sum, x) => sum + x.w, 0);
  let acc = 0;
  for (const x of sorted) {
    acc += x.w;
    if (acc >= total / 2) return x.v;
  }
  return sorted[sorted.length - 1]?.v ?? 0;
}

/**
 * The household's own rhythm for each activity it has logged enough of.
 *
 * THE MEDIAN AND NOT THE MEAN, because one forgotten entry doubles a gap and a mean takes that
 * straight into the answer. A parent who logged six feeds three hours apart and then went to a
 * christening has a three-hour rhythm; the mean says three and three-quarters and would put
 * every reminder three-quarters of an hour late for a fortnight.
 */
export function rhythms(
  beats: readonly Beat[],
  nowMs: number,
  clock: LocalClock = utcClock,
): Rhythm[] {
  const since = nowMs - LOOKBACK_DAYS * DAY_MS;
  const streams = new Map<string, { starts: number[]; last: string }>();
  for (const b of [...beats].sort((x, y) => x.startMs - y.startMs)) {
    if (b.startMs < since || b.startMs > nowMs) continue;
    const key = FEED_ACTIVITIES.has(b.activity) ? 'feed' : b.activity;
    const stream = streams.get(key) ?? { starts: [], last: b.activity };
    const prev = stream.starts[stream.starts.length - 1];
    if (prev === undefined || b.startMs - prev >= SAME_OCCURRENCE_MS) stream.starts.push(b.startMs);
    stream.last = b.activity;
    streams.set(key, stream);
  }

  const out: Rhythm[] = [];
  const weight = (at: number): number => Math.pow(0.5, (nowMs - at) / (HALF_LIFE_DAYS * DAY_MS));
  for (const { starts, last: activity } of streams.values()) {
    const gaps: { v: number; at: number }[] = [];
    for (let i = 1; i < starts.length; i += 1) {
      const from = starts[i - 1] ?? 0;
      const gap = (starts[i] ?? 0) - from;
      if (gap >= MIN_GAP_MS) gaps.push({ v: gap, at: from });
    }
    const ordinary = gaps.filter(g => g.v <= MAX_GAP_MS);
    if (ordinary.length < MIN_SAMPLES) continue;

    const lastAtMs = starts[starts.length - 1] ?? 0;
    const at = clock.minuteOfDay(lastAtMs);
    const similar = gaps.filter(
      g =>
        g.v <= SIMILAR_MAX_GAP_MS &&
        clockDistance(clock.minuteOfDay(g.at), at) <= SIMILAR_WINDOW_MIN,
    );
    const pick = similar.length >= SIMILAR_MIN ? similar : ordinary;
    const gapMs = weightedMedian(pick.map(g => ({ v: g.v, w: weight(g.at) })));

    /*
      A KIND OF DAY IT NEVER HAPPENS ON. A parent who pumps at work and never at the weekend
      should not hear about a pump on Saturday morning. Once the stream covers a week, a next
      occurrence that falls on a weekend (or a weekday) when the activity has never been logged
      on one moves on a day at a time, at the same clock time, to the first day of the kind it
      does happen on.
    */
    let nextAtMs = lastAtMs + gapMs;
    if (lastAtMs - (starts[0] ?? lastAtMs) >= 7 * DAY_MS) {
      const happensOn = (weekend: boolean) => starts.some(t => clock.weekend(t) === weekend);
      for (let i = 0; i < 3 && !happensOn(clock.weekend(nextAtMs)); i += 1) nextAtMs += DAY_MS;
    }

    out.push({ activity, medianGapMs: gapMs, samples: pick.length, lastAtMs, nextAtMs });
  }
  return out.sort((a, b) => a.nextAtMs - b.nextAtMs);
}

/**
 * HOW FAR AHEAD THE NOTIFICATION LANDS. The owner's own example — "baby usually sleep every 3
 * hours, then in 2 hours 45 minutes, notification need to be sent" — is fifteen minutes of
 * warning, and fifteen minutes is the right shape of answer: long enough to put the kettle on
 * or get the bottle out, short enough that it is still true when it arrives.
 *
 * It is a SHARE of the rhythm rather than a fixed number, floored and capped, because fifteen
 * minutes before a three-hour feed and fifteen minutes before a forty-minute one are different
 * amounts of warning. A TWELFTH of the gap — which is exactly the owner's example, 15 minutes
 * out of three hours — between five minutes and twenty.
 */
const LEAD_SHARE = 1 / 12;
export const LEAD_MIN_MS = 5 * MIN;
export const LEAD_MAX_MS = 20 * MIN;

export const leadFor = (gapMs: number): number =>
  Math.min(LEAD_MAX_MS, Math.max(LEAD_MIN_MS, Math.round(gapMs * LEAD_SHARE)));

/** When a rhythm's own heads-up rings: its lead ahead of the next one, fixed or a share of the gap. */
export const headsUpAt = (r: Rhythm): number => r.nextAtMs - (r.leadMs ?? leadFor(r.medianGapMs));

export interface Foresight {
  /** When the phone should raise it. */
  atMs: number;
  /** The activities it is about — more than one when they fall together. */
  activities: string[];
  /** Each activity's rhythm, in the same order, so the copy can name the gap and the sample. */
  of: Rhythm[];
}

/**
 * TWO THINGS DUE TOGETHER ARE ONE NOTIFICATION (the owner: *"if there are 2 activities schedule
 * around the same time, then the notifications should be 2 in one"*).
 *
 * They are right, and the reason is worth stating: two buzzes a minute apart at 5:40 in the
 * morning is not twice the information, it is the app being twice as annoying for the same
 * information. Anything falling inside `MERGE_MS` of the earliest is folded in, and the merged
 * notification lands at the EARLIEST of them — a warning that arrives after the first thing it
 * was warning about is not a warning.
 */
export const MERGE_MS = 20 * MIN;

export function foresee(all: readonly Rhythm[], nowMs: number): Foresight[] {
  const ahead = all
    .map(r => ({ r, atMs: headsUpAt(r) }))
    .filter(x => x.atMs > nowMs)
    .sort((a, b) => a.atMs - b.atMs);
  const out: Foresight[] = [];
  for (const { r, atMs } of ahead) {
    const last = out[out.length - 1];
    if (last !== undefined && atMs - last.atMs <= MERGE_MS) {
      last.activities.push(r.activity);
      last.of.push(r);
      continue;
    }
    out.push({ atMs, activities: [r.activity], of: [r] });
  }
  return out;
}
