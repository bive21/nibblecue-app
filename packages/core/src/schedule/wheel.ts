/**
 * THE DAY AS A RING — the geometry behind the schedule wheel, and the two feeders that fill it.
 *
 * One picture, drawn twice (the owner, 2026-09-21, with a mockup): once at the end of setup as a
 * PREVIEW of the rhythm they have just described, and once on Routine as the LIVE day the app has
 * actually planned. The drawing is one component; what differs is only where the stops come from
 * and what the card says about them.
 *
 * ── THE RING IS A CLOCK ─────────────────────────────────────────────────────────────────────
 *
 * Every minute of the twenty-four hours gets the same arc (the owner, 2026-09-21: *"wouldn't it
 * make more sense if it shows the full 24h (at night too)?"*). Until that day the night was
 * compressed into a share of the ring computed from what was planned in it, so the waking day
 * could have most of the circle — `nightArcDeg` records why that went. The night keeps its own
 * tint on the ring, which now means only "this is the night".
 *
 * NOTHING IS ROUNDED AWAY. Every stop carries its own `HH:MM`, the card writes it beside the dot,
 * and the spoken label says it too — so the ring is the day and the text is the day.
 *
 * ── DIRECTION ───────────────────────────────────────────────────────────────────────────────
 *
 * The ring runs CLOCKWISE, like a clock (the owner, 2026-09-21: *"make it clockwise, sun should
 * still be top left"*). The sun stays in the top-left corner where the mockup put it, and the day
 * runs from there over the top, down the right side and across the foot to the moon, with the
 * night closing the loop up the left. It is one constant — `WHEEL_DIRECTION` — so the direction is
 * one edit here and no change at all to the component or to either feeder.
 *
 * ── HOW MANY DOTS ───────────────────────────────────────────────────────────────────────────
 *
 * A day's plan is not a list of evenly spaced events: a parent's eight o'clock is a pump, a
 * bottle and a change, and their ten o'clock is one thing. So the ring groups what happens
 * together into ONE stop — a house, with every module's icon in it side by side — twice over:
 * first by the hour a parent reads as one round (`WHEEL_GROUP_MINUTES`), then by what the ring
 * can physically draw (`WHEEL_MERGE_DEG`). `layoutWheel` walks through the reasoning.
 *
 * ── WHAT IT MAY NEVER DO ────────────────────────────────────────────────────────────────────
 *
 * It is arithmetic over times the household entered. It draws no example times of its own
 * (`previewEntries` has no fallback clock anywhere in it — a rhythm with no time contributes no
 * stop), and it says nothing whatever about a baby: no band is a judgment, no gap is a problem,
 * and there is no sentence here about sleep, intake or a state the app cannot see (CLAUDE.md §2).
 */
import { MEAL_LABEL, type Meal } from '../entry/remembered';
import type { ModuleId } from '../modules/module-registry';
import { DEFAULT_DAY_WINDOW, type DayWindow } from '../today/dayWindow';
import { gridFills, intervalOccurrences } from './interval';
import { dowOf, hm } from './time';
import { DAY, ruleFrom, shownAtMs, type EngineContext, type Occurrence, type Rule } from './types';

const DAY_MINUTES = 1440;

/* ------------------------------------------------------------------ the dial */

/**
 * Where the household's waking day begins, in degrees clockwise from twelve o'clock. 320° is the
 * top-left corner, where the mockup's sun sits — and where the owner asked it to stay.
 */
export const WHEEL_WAKE_DEG = 320;

/** +1 runs the day like a clock (the owner, 2026-09-21: *"make it clockwise"*). */
export const WHEEL_DIRECTION: 1 | -1 = 1;

/**
 * THE RING IS A CLOCK: TWENTY-FOUR HOURS AT ONE SCALE (the owner, 2026-09-21: *"wouldn't it make
 * more sense if it shows the full 24h (at night too)?"*).
 *
 * It was not, until today. The night used to be compressed into a share of the ring computed
 * from how much was planned in it — 70° for an empty night, up to 160° — so the waking day
 * could have most of the circle. That made the ring the SHAPE of the day rather than the day:
 * an hour at 2 a.m. was a third of an hour at 2 p.m., and a parent reading it as a clock read
 * it wrong. Now a minute is a minute everywhere: the night's arc is exactly its share of 1440,
 * the sun still sits at the top left, and the moon lands wherever bedtime really is. The night
 * keeps its own tint on the ring, which now means only "this is the night", not "the scale
 * changes here".
 */
export function nightArcDeg(window: DayWindow = DEFAULT_DAY_WINDOW): number {
  return (360 * (DAY_MINUTES - awakeSpan(window))) / DAY_MINUTES;
}

/**
 * THE HOUR A PARENT READS AS ONE ROUND (the owner, 2026-09-21: *"if pumping is at 8.13am, bottle
 * is at 8.45am, diaper is at 9am, then tummy time is at 10am. the first 3 should be shown
 * together (within 60minutes)"*).
 *
 * Sixty minutes, and the span is measured from the FIRST thing in the group rather than from its
 * neighbor — so a chain of things forty minutes apart does not fuse into a four-hour block. It
 * is the unit people actually use about a baby's day: the eight o'clock round is a pump, a
 * bottle, a change and a cuddle, and nobody thinks of it as four events.
 *
 * The boundary is exclusive: a thing exactly an hour after the head of a group belongs to the
 * NEXT hour, because 9:00 and 10:00 are two rounds of the day to everyone who has had one.
 */
export const WHEEL_GROUP_MINUTES = 60;

/**
 * AND THE RING'S OWN LIMIT, WHICH IS AN ANGLE RATHER THAN A CLOCK.
 *
 * An hour of the waking day is about twenty degrees of arc; an hour of a compressed night is about
 * seven. So a rule written in minutes crowds the night no matter what number it picks, which is
 * exactly what the screenshot showed. After the hour groups are formed, anything still closer
 * together than this is merged again — so the night collapses as far as its own scale needs and
 * the day collapses only where it has to.
 *
 * THE NUMBER COMES FROM THE PICTURE, and this is the one place in this file that knows about
 * points. A stop is drawn as a HOUSE — a capsule holding up to three module discs side by side,
 * about sixty-six points wide (`ScheduleWheel.tsx` has the arithmetic). Two houses may not
 * overlap, so their centers need about that much chord between them, which at phone width is a
 * little over thirty degrees. Anything closer belongs in one house instead of two.
 */
export const WHEEL_MERGE_DEG = 34;

/**
 * A HOUSE NEVER STANDS FOR MORE TIME THAN THIS, and the night's allowance is larger on purpose.
 *
 * The angular pass would happily fuse a whole night into one dot, and a stop labeled 10:30 PM that
 * silently also means 4:00 AM is a lie about the plan. An hour and a half is a round of the waking
 * day — a parent reads "the morning" and "after the nap" — and four hours is a stretch of the
 * night, which nobody plans to the minute. Past the cap the ring keeps the stops apart and the
 * caption pass drops a label instead: a crowded dot is honest, a wrong time is not.
 *
 * WHERE A HOUSE COVERS A STRETCH, THE CARD SAYS SO. The stop carries `endHhmm` and `spanMinutes`,
 * and `DayWheelCard` writes "to 9:40" under the time rather than leaving the head time to stand
 * for the whole of it.
 */
export const WHEEL_SPAN_MAX_MINUTES = 90;
export const WHEEL_NIGHT_SPAN_MAX_MINUTES = 240;

/** `HH:MM` → minutes since local midnight, wrapped into the day. */
const minutesOf = (hhmm: string): number => ((hm(hhmm) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

/** Minutes since midnight → `HH:MM`, so every stop can print its own time. */
export function wheelClock(minutes: number): string {
  const w = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${String(Math.floor(w / 60)).padStart(2, '0')}:${String(w % 60).padStart(2, '0')}`;
}

const wrapDeg = (deg: number): number => ((deg % 360) + 360) % 360;

/** Shortest angular distance between two bearings, 0–180. */
function degreesApart(a: number, b: number): number {
  const d = Math.abs(wrapDeg(a) - wrapDeg(b));
  return Math.min(d, 360 - d);
}

/** How long the household is awake, wrap and all; equal times read as awake all day. */
function awakeSpan(window: DayWindow): number {
  const wake = minutesOf(window.wake);
  const bed = minutesOf(window.bed);
  return wake === bed ? DAY_MINUTES : (bed - wake + DAY_MINUTES) % DAY_MINUTES;
}

/**
 * Where a wall-clock minute sits on the ring.
 *
 * The waking window maps onto `dayArcDeg` from the wake mark, clockwise; the night maps onto what
 * is left, carrying on in the same direction from the bed mark back round to the wake mark. With
 * `dayArcDeg` at its default the two scales are ONE — a minute of night is a minute of day
 * (`nightArcDeg`) — and the parameter remains only so a test can pin the arithmetic.
 */
export function wheelDegrees(
  minutes: number,
  window: DayWindow = DEFAULT_DAY_WINDOW,
  dayArcDeg: number = 360 - nightArcDeg(window),
): number {
  const wake = minutesOf(window.wake);
  const at = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const awake = awakeSpan(window);
  const sinceWake = (at - wake + DAY_MINUTES) % DAY_MINUTES;
  if (awake >= DAY_MINUTES || sinceWake <= awake) {
    const share = awake === 0 ? 0 : sinceWake / awake;
    return wrapDeg(WHEEL_WAKE_DEG + WHEEL_DIRECTION * share * dayArcDeg);
  }
  const night = DAY_MINUTES - awake;
  const share = night === 0 ? 0 : (sinceWake - awake) / night;
  return wrapDeg(WHEEL_WAKE_DEG + WHEEL_DIRECTION * (dayArcDeg + share * (360 - dayArcDeg)));
}

/** Whether a wall-clock minute falls in the household's night. */
export function inNight(minutes: number, window: DayWindow = DEFAULT_DAY_WINDOW): boolean {
  const wake = minutesOf(window.wake);
  const awake = awakeSpan(window);
  if (awake >= DAY_MINUTES) return false;
  const at = ((Math.round(minutes) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return (at - wake + DAY_MINUTES) % DAY_MINUTES > awake;
}

/* ------------------------------------------------------------------ the model */

/** One thing the day plans, before the ring has decided where it goes. */
export interface WheelEntry {
  /** Stable across renders, so a stop that merely moved animates rather than replacing itself. */
  key: string;
  /** Minutes since local midnight. */
  minutes: number;
  activity: ModuleId;
  /**
   * What this stop is, in the parent's own words, where the module's name is not enough — a
   * medicine's own name, or the word a card wants under the time. Never a description of a baby.
   */
  note?: string;
  /** What the live wheel opens when the stop is tapped: the rule behind it. */
  ruleId?: string;
  /**
   * The care item behind a medicine's stop, on the live wheel, where the rule has one. Two
   * medicines at eight are one disc in their house and two editors behind it, so a tap has to know
   * which item each entry is to offer both (the owner, 2026-09-28: a tap on a house "only opened
   * always for the first one"; the app's `wheelTap.ts`).
   */
  careItemId?: string;
  /** A stop the household may or may not do today — drawn dashed, never scolded. */
  optional?: boolean;
  /** This one already happened (`DONE`/`LATE`) — only ever set in `actual` mode. */
  done?: boolean;
}

/** One place on the ring, with everything planned for it. */
export interface WheelStop {
  key: string;
  /** Minutes since local midnight: the FIRST thing in the group, which is what it is called. */
  minutes: number;
  /** `HH:MM`; the app formats it to the phone's own clock. */
  hhmm: string;
  /** The last thing in the group. Equal to `minutes` where the group is one moment. */
  endMinutes: number;
  endHhmm: string;
  /** How long the group covers. 0 for a single moment. */
  spanMinutes: number;
  /** Degrees clockwise from twelve o'clock. */
  deg: number;
  /** Every module at this stop, in the order the entries arrived, deduped. */
  activities: ModuleId[];
  entries: WheelEntry[];
  /** True where the ring had no room for this stop's caption: the dot keeps its place. */
  labelHidden: boolean;
  /** True where every entry at this stop is optional. */
  optional: boolean;
  /** True where every entry at this stop already happened. Always false in `planned` mode. */
  done: boolean;
  /** True where the stop falls in the household's night. */
  night: boolean;
}

export interface WheelLayout {
  window: DayWindow;
  wakeDeg: number;
  bedDeg: number;
  /** How much of the ring the waking window takes: its share of the 24 hours (`nightArcDeg`). */
  dayArcDeg: number;
  /** Minutes between wake and bed, wrap and all (`awakeSpan`). */
  awakeMinutes: number;
  stops: WheelStop[];
}

const uniq = <T>(xs: readonly T[]): T[] => [...new Set(xs)];

/** One group of entries, before it knows where on the ring it goes. */
type Group = WheelEntry[];

/** The clock span a group covers, from its first entry to its last. */
const spanOf = (g: Group): number => (g[g.length - 1]?.minutes ?? 0) - (g[0]?.minutes ?? 0);

/**
 * PASS ONE — THE HOUR. Everything inside `WHEEL_GROUP_MINUTES` of the group's FIRST entry is one
 * moment in the day. Measured from the first rather than from the neighbour, so a chain of things
 * forty minutes apart stays several groups instead of fusing into one long one.
 */
function groupByHour(entries: readonly WheelEntry[]): Group[] {
  const sorted = [...entries].sort((a, b) => a.minutes - b.minutes || a.key.localeCompare(b.key));
  const out: Group[] = [];
  for (const e of sorted) {
    const last = out[out.length - 1];
    const head = last?.[0];
    if (last !== undefined && head !== undefined && e.minutes - head.minutes < WHEEL_GROUP_MINUTES)
      last.push(e);
    else out.push([e]);
  }
  return out;
}

/**
 * PASS THREE — THE RING'S OWN LIMIT. Whatever the hour left behind, anything still closer than
 * `WHEEL_MERGE_DEG` of arc is one dot, because two dots a few degrees apart are a smudge and two
 * captions that close cannot both be read.
 *
 * This is where the night collapses. An hour of a compressed night is about seven degrees, so
 * three night feeds that the hour pass kept apart are merged here into the one place the ring can
 * actually draw them — while the waking day, where an hour is twenty-two degrees, is untouched.
 *
 * `WHEEL_SPAN_MAX_MINUTES` is the brake: a stop may not end up standing for more time than that,
 * whatever the geometry wants, because a dot labelled 10:30 PM that also means 2 AM is a lie. Past
 * the brake the dots stay separate and the caption pass drops a label instead.
 */
function mergeByAngle(
  groups: Group[],
  degOf: (minutes: number) => number,
  window: DayWindow,
): Group[] {
  const out: Group[] = [];
  for (const g of groups) {
    const last = out[out.length - 1];
    const head = last?.[0];
    const mine = g[0];
    if (last !== undefined && head !== undefined && mine !== undefined) {
      const close = degreesApart(degOf(head.minutes), degOf(mine.minutes)) < WHEEL_MERGE_DEG;
      const widest = (g[g.length - 1]?.minutes ?? 0) - head.minutes;
      const cap = inNight(head.minutes, window)
        ? WHEEL_NIGHT_SPAN_MAX_MINUTES
        : WHEEL_SPAN_MAX_MINUTES;
      if (close && widest <= cap) {
        last.push(...g);
        continue;
      }
    }
    out.push([...g]);
  }
  return out;
}

const stopOf = (group: Group, window: DayWindow, dayArcDeg: number): WheelStop => {
  const head = group[0] as WheelEntry;
  const tail = group[group.length - 1] as WheelEntry;
  return {
    key: group.map(e => e.key).join('+'),
    minutes: head.minutes,
    hhmm: wheelClock(head.minutes),
    endMinutes: tail.minutes,
    endHhmm: wheelClock(tail.minutes),
    spanMinutes: spanOf(group),
    deg: wheelDegrees(head.minutes, window, dayArcDeg),
    activities: uniq(group.map(e => e.activity)),
    entries: group,
    labelHidden: false,
    optional: group.every(e => e.optional === true),
    // a stop is done only when EVERY entry under it is: a house holding a done feed and an
    // upcoming change is still something to do, and marking it done would be a lie
    done: group.every(e => e.done === true),
    night: inNight(head.minutes, window),
  };
};

/**
 * THE RING, LAID OUT — in four passes, and the order of them is the whole design.
 *
 *  1. **The hour.** What a parent reads as one round of the day becomes one stop (`groupByHour`).
 *     This is the owner's own rule, in their own example: a pump at 8:13, a bottle at 8:45 and a
 *     change at 9:00 are one place on the ring; tummy time at 10:00 is another.
 *  2. **The clock.** Every minute gets the same arc (`nightArcDeg`): the ring is the household's
 *     twenty-four hours, wake at the top left, and a stop sits where its time falls.
 *  3. **The ring's own limit.** Anything still too close in ANGLE to be drawn as two houses is
 *     merged again — what puts a household whose set times run hour by hour into rounds rather
 *     than a row of touching beads (`mergeByAngle`). The clock caps what one house may stand for,
 *     so nothing is fused into a dot whose time would be wrong.
 *  4. **The captions.** Which stops can print their time, given that the component draws them at
 *     one radius. The dot always stays; only the words go (`pickCaptions`).
 *
 * Every pass is arithmetic on the household's own times, deterministic and order-stable, which is
 * why all of it is here rather than in the component.
 */
export function layoutWheel(
  entries: readonly WheelEntry[],
  window: DayWindow = DEFAULT_DAY_WINDOW,
): WheelLayout {
  const hours = groupByHour(entries);
  const dayArcDeg = 360 - nightArcDeg(window);
  const degOf = (minutes: number) => wheelDegrees(minutes, window, dayArcDeg);
  const merged = mergeByAngle(hours, degOf, window);

  const stops = merged.map(g => stopOf(g, window, dayArcDeg));
  pickCaptions(stops, [
    wheelDegrees(minutesOf(window.wake), window, dayArcDeg),
    wheelDegrees(minutesOf(window.bed), window, dayArcDeg),
  ]);

  return {
    window,
    wakeDeg: wheelDegrees(minutesOf(window.wake), window, dayArcDeg),
    bedDeg: wheelDegrees(minutesOf(window.bed), window, dayArcDeg),
    dayArcDeg,
    awakeMinutes: awakeSpan(window),
    stops,
  };
}

/**
 * WHICH STOPS MAY PRINT THEIR TIME, and the two things it has to avoid.
 *
 * The first is each other: two captions closer than `WHEEL_CAPTION_GAP_DEG` overlap at the radius
 * the component draws them. The second is the SUN AND THE MOON, and forgetting them is what put
 * "7:00 AM Wake" through "4:30 AM Bottle" on the owner's phone — the end marks carry captions of
 * their own and the layout had never heard of them.
 *
 * A stop that cannot have one keeps its dot and loses only its words. The dot is the fact.
 */
export const WHEEL_CAPTION_GAP_DEG = 26;

function pickCaptions(stops: WheelStop[], reserved: readonly number[]): void {
  const taken: number[] = [...reserved];
  for (const s of stops) {
    if (taken.every(d => degreesApart(s.deg, d) >= WHEEL_CAPTION_GAP_DEG)) {
      taken.push(s.deg);
      continue;
    }
    s.labelHidden = true;
  }
}

/* ------------------------------------------------------- the live day's stops */

/**
 * THE LIVE WHEEL READS THE PLAN, NOT THE SETTINGS. Every stop is a slot the schedule engine
 * actually produced for the day in view (`ScheduleDay.occurrences`), so a rhythm changed, a time
 * moved, an activity turned off or a slot pushed later by a logged entry is on the ring the
 * moment the engine recomputes — there is no second reconstruction to fall out of step.
 *
 * GAP rows and look-ahead rows are not today's business and are dropped, which is the same rule
 * `listedToday` applies to the list under it.
 */
/**
 * TWO WAYS TO LOOK AT ONE DAY (the owner, 2026-09-22: *"make a toggle to see today's planned and
 * actual (showing what's also done, hide what's missed or skipped, and what's planned)"*).
 *
 * `planned` is the whole day the rhythms lay out — every checkpoint, whatever became of it.
 * `actual` is the day as it went: what happened, plus what is still ahead, with the misses and
 * the skips taken off the ring.
 *
 * DROPPING A MISS IS NOT HIDING IT. The miss is still in the rows under the wheel, still in the
 * day's counts, and still in the export; what `actual` removes is a checkpoint that never
 * happened from a picture of what did. A ring of ghosts is the shape that makes a parent feel
 * behind, and this app records rather than judges (CLAUDE.md §2).
 *
 * AND THE TWO VIEWS PUT A DONE STOP IN DIFFERENT PLACES, which is the whole point of having two
 * (the owner, 2026-09-22). `planned` draws every stop on the GRID, where the rhythm says it
 * belongs. `actual` draws a done stop at `matchedAtMs` — the minute the entry was really logged.
 *
 * It did not, at first, and the gap was visible: a feed planned for 3:00 and logged at 4:15 is
 * `LATE` with `atMs` still 3:00, so "how it went" drew it seventy-five minutes from where it
 * happened — while an EARLY feed, which the engine makes `offGrid` at the session's own time,
 * sat exactly where it was. One ring following two rules. `matchedAtMs` (schedule/types.ts) is
 * the fact that lets it follow one, and `atMs` stays the grid time because that is what the
 * next slot is computed from.
 */
export type WheelDayMode = 'planned' | 'actual';

/** What `actual` leaves off the ring: a checkpoint that did not happen. */
const OFF_ACTUAL: ReadonlySet<string> = new Set(['MISSED', 'SKIPPED']);

export function liveEntries(
  occurrences: readonly Occurrence[],
  opts: {
    /** Minutes since local midnight for a slot's instant — the caller owns the time zone. */
    minutesAt: (atMs: number) => number;
    /** A care item's own name, where the slot is a medicine, cream or vitamin. */
    nameOf?: (occurrence: Occurrence) => string | undefined;
    /** Which of the two views this is. Absent is `planned`, which is what every caller had. */
    mode?: WheelDayMode;
  },
): WheelEntry[] {
  const out: WheelEntry[] = [];
  /*
    THE KEY IS THE RULE AND THE ORDINAL, NOT THE INSTANT — which is what lets a moved stop MOVE.
    Keyed by `ruleId@atMs`, a slot pushed from 5:30 to 6:13 by a late feed would be a different
    key, so the component would unmount one dot and mount another and the owner's "animate the
    checkpoint gently into its updated position" would be a blink. The third pump slot of the day
    is still the third pump slot of the day after it moves; that is the identity worth keeping.
  */
  const actual = opts.mode === 'actual';
  const seen = new Map<string, number>();
  for (const o of occurrences) {
    if (o.status === 'GAP' || o.future) continue;
    // THE ORDINAL IS COUNTED BEFORE THE VIEW FILTERS, not after, so a stop keeps its key across
    // the toggle: the fifth feed of the day is the fifth feed of the day whether or not the two
    // missed ones before it are drawn, and the ring animates between the views rather than
    // unmounting the whole day and mounting another one.
    const nth = seen.get(o.ruleId) ?? 0;
    seen.set(o.ruleId, nth + 1);
    if (actual && OFF_ACTUAL.has(o.status)) continue;
    const note = opts.nameOf?.(o);
    const done = o.status === 'DONE' || o.status === 'LATE';
    // `actual` asks when it happened (`shownAtMs`, the Schedule list's own rule), `planned` asks
    // when it was due
    const whenMs = actual ? shownAtMs(o) : o.atMs;
    out.push({
      key: `${o.ruleId}#${nth}`,
      minutes: opts.minutesAt(whenMs),
      activity: o.rule.activity as ModuleId,
      ruleId: o.ruleId,
      ...(o.rule.careItemId === null ? {} : { careItemId: o.rule.careItemId }),
      ...(note === undefined ? {} : { note }),
      ...(actual && done ? { done: true } : {}),
    });
  }
  return out;
}

/** How a day divides for the line under the toggle: what happened, what is still ahead. */
export function dayTally(occurrences: readonly Occurrence[]): {
  done: number;
  ahead: number;
  missed: number;
} {
  let done = 0;
  let ahead = 0;
  let missed = 0;
  for (const o of occurrences) {
    if (o.status === 'GAP' || o.future) continue;
    // a slot from before the household existed is none of the three — nothing happened, nothing
    // is ahead, and "not marked" would be a verdict on a morning without the app (`start.ts`)
    if (o.beforeStart === true) continue;
    if (o.status === 'DONE' || o.status === 'LATE') done += 1;
    else if (o.status === 'MISSED' || o.status === 'SKIPPED') missed += 1;
    else ahead += 1;
  }
  return { done, ahead, missed };
}

/* ------------------------------------------------------ the preview's stops */

/** What setup has answered by the time the preview is drawn — a subset of `SetupSeed`. */
export interface WheelPreviewInput {
  intervals: readonly {
    activity: ModuleId;
    everyMinutes: number;
    night?:
      | { mode: Rule['nightMode']; everyMinutes: number | null; at?: string | null | undefined }
      | undefined;
  }[];
  /**
   * `days`, when present, are the weekdays the times keep (0 = Sunday); absent is every day.
   * `meals`, for solids, name the meal each time is (2026-09-28), and the stop says it.
   */
  setTimes: readonly {
    activity: ModuleId;
    times: readonly string[];
    days?: readonly number[] | undefined;
    meals?: readonly { meal: Meal; at: string }[] | undefined;
  }[];
  /** A count per day, which setup spreads across the waking window exactly as the seeder does. */
  timesADay?: readonly { activity: ModuleId; times: number }[];
  /** `HH:MM` when the household moved the bed end of their day and tracks sleep. */
  bedtime?: string | null;
  medicines?: readonly { id: string; name: string; times: readonly string[] }[];
}

/**
 * `n` times spread across the waking window, middle of each part, on the quarter hour — the same
 * arithmetic `spreadTimes` in the app uses when it writes those rules, so the preview shows the
 * times the seeder is about to create rather than a second opinion about them.
 */
export function spreadAcrossDay(n: number, window: DayWindow = DEFAULT_DAY_WINDOW): string[] {
  if (n <= 0) return [];
  const from = minutesOf(window.wake);
  const bed = minutesOf(window.bed);
  const span = from === bed ? DAY_MINUTES : (bed - from + DAY_MINUTES) % DAY_MINUTES;
  return Array.from({ length: n }, (_, i) =>
    wheelClock(Math.round((from + ((i + 0.5) * span) / n) / 15) * 15),
  );
}

/**
 * THE PREVIEW IS THE ENGINE, NOT AN IMPRESSION OF IT.
 *
 * An interval rhythm's stops come from `intervalOccurrences` — the same walk the live day runs —
 * over a rule built from the parent's own answer, with no sessions and the chain anchored at their
 * wake time. So "every 3h with the night paused" previews with the night genuinely paused, "one
 * night feed" previews with exactly one, and a later change to the walk moves both wheels
 * together. What the preview asserts is only the sentence under it: this is the rhythm, and the
 * real day will be laid out from the times and intervals you entered.
 *
 * AND THE NIGHT'S MIDDLE IS FILLED THE SAME WAY THE LIVE DAY FILLS IT (`gridFills`). The walk
 * above is a rule written at today's wake, so it has no yesterday: its chain reaches the evening
 * (23:15 on a 3 h / 4 h rhythm) and stops, and the ring's early morning — midnight to wake, the
 * "during" of bedtime — stayed empty on the setup wheel even when nights were every four hours
 * (2026-10-03). The live day already puts those stops in via the wrap between yesterday's last
 * slot and today's first; the preview mirrors that wrap by shifting today's last slot back one
 * day. PAUSE and ONE still contribute nothing there (`fillsWraps`).
 *
 * THERE IS NO FALLBACK CLOCK IN HERE. A rhythm with no time and no interval contributes nothing;
 * the ring is simply emptier, which is the truth about a household that skipped the question.
 */
export function previewEntries(
  input: WheelPreviewInput,
  ctx: { timeZone: string; dayStartMs: number; window?: DayWindow },
): WheelEntry[] {
  const window = ctx.window ?? DEFAULT_DAY_WINDOW;
  const wakeMin = minutesOf(window.wake);
  const wakeMs = ctx.dayStartMs + wakeMin * 60_000;
  const dayEndMs = ctx.dayStartMs + DAY;
  const minutesAt = (atMs: number): number =>
    ((Math.round((atMs - ctx.dayStartMs) / 60_000) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

  const out: WheelEntry[] = [];

  for (const i of input.intervals) {
    if (!(i.everyMinutes > 0)) continue;
    const rule = ruleFrom({
      id: `preview:${i.activity}`,
      activity: i.activity as Rule['activity'],
      ruleType: 'INTERVAL',
      everyMinutes: i.everyMinutes,
      effectiveFromMs: wakeMs,
      ...(i.night === undefined
        ? {}
        : {
            nightMode: i.night.mode,
            nightFrom: window.bed,
            nightTo: window.wake,
            nightEveryMinutes: i.night.everyMinutes,
            // "once a night" at the time the parent picked; the engine's own default otherwise
            ...(i.night.mode === 'ONE' && i.night.at ? { nightAt: i.night.at } : {}),
          }),
    });
    /*
      `nowMs` IS THE WAKE INSTANT, deliberately. The preview is a picture of a day that has not
      happened, so nothing in it may be late, due or missed — with the clock standing at the
      moment the day begins, every slot the walk produces is UPCOMING and the ring carries the
      plan rather than a verdict on it.

      AND THE RHYTHM IS A RULE WRITTEN AT THE WAKE TIME (`effectiveFromMs` above), with no
      household start in the context. It carried `trackingFromMs: wakeMs` until 2026-09-25; since
      then that would make the rule one the household "started with", which lays its day out
      from midnight and skips what came before the start (`start.ts`) — a real first day's
      shape, and not the drawing this preview has always been. Without it the walk is the one a
      rule written into a day already going gets: first stop a quarter hour in, then the interval.
    */
    const engine: EngineContext = {
      nowMs: wakeMs,
      timeZone: ctx.timeZone,
      dayStartMs: ctx.dayStartMs,
    };
    const walked: number[] = [];
    for (const o of intervalOccurrences(rule, [], engine).occurrences) {
      if (o.status === 'GAP') continue;
      walked.push(o.atMs);
      out.push({
        key: `${rule.id}@${o.atMs}`,
        minutes: minutesAt(o.atMs),
        activity: i.activity,
      });
    }
    /*
      THE OVERNIGHT WRAP. Today's walk has the evening; yesterday's last slot is the same time
      one day earlier. `gridFills` puts the mid-night stops on this calendar day (PAUSE / ONE:
      none).
    */
    const first = walked[0];
    const last = walked[walked.length - 1];
    if (first !== undefined && last !== undefined) {
      for (const atMs of gridFills(rule, ctx.timeZone, last - DAY, first)) {
        if (atMs < ctx.dayStartMs || atMs >= dayEndMs) continue;
        if (walked.includes(atMs)) continue;
        out.push({
          key: `${rule.id}@${atMs}`,
          minutes: minutesAt(atMs),
          activity: i.activity,
        });
      }
    }
  }

  // the preview is one day — the one it is drawn for — so times kept on other weekdays sit out
  const today = dowOf(ctx.timeZone, ctx.dayStartMs + 12 * 3_600_000);
  for (const t of input.setTimes) {
    if (t.days !== undefined && t.days.length > 0 && !t.days.includes(today)) continue;
    /* A MEAL'S STOP SAYS ITS MEAL, as the live wheel's does once the rule is named "Lunch" (the
       app's `dayWheel.ts`): the word under the time is the thing no icon can spell. Each meal is its
       own entry, so a lunch and a snack set to one time are two things in one house; a time no
       meal accounts for is drawn as it always was. */
    const meals = t.meals ?? [];
    for (const m of meals) {
      out.push({
        key: `preview:${t.activity}:${m.meal}:${m.at}`,
        minutes: minutesOf(m.at),
        activity: t.activity,
        note: MEAL_LABEL[m.meal],
      });
    }
    for (const at of t.times) {
      if (meals.some(m => m.at === at)) continue;
      out.push({
        key: `preview:${t.activity}:${at}`,
        minutes: minutesOf(at),
        activity: t.activity,
      });
    }
  }

  for (const t of input.timesADay ?? []) {
    for (const at of spreadAcrossDay(t.times, window)) {
      out.push({
        key: `preview:${t.activity}:n:${at}`,
        minutes: minutesOf(at),
        activity: t.activity,
        optional: true,
      });
    }
  }

  for (const m of input.medicines ?? []) {
    for (const at of m.times) {
      out.push({
        key: `preview:med:${m.id}:${at}`,
        minutes: minutesOf(at),
        activity: 'med',
        note: m.name,
      });
    }
  }

  if (typeof input.bedtime === 'string' && input.bedtime.length > 0) {
    out.push({
      key: 'preview:bedtime',
      minutes: minutesOf(input.bedtime),
      activity: 'sleep',
    });
  }

  return out;
}
