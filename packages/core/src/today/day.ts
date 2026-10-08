/**
 * The local day (docs/plans/WP5.md D1; PRODUCT_SPEC.md §3.5, §13).
 *
 * "Today" is the local day in the zone the caller hands in — never UTC. On a phone that is the
 * zone the phone reads in: its own, abroad too, unless it was told to keep home time for the trip
 * (`travel.ts`; the owner, 2026-09-23 — it used to be the household's home zone everywhere). A
 * parent who flies from Auckland to Los Angeles does live one Tuesday twice on the phone's clock,
 * and the functions here get that right because they never assume a day is 24 hours long.
 *
 * There is no date library in this package and there is not going to be one: the whole
 * problem is two functions, and `Intl.DateTimeFormat` with a `timeZone` is the only thing
 * that actually knows the IANA rules. It ships with node and with Hermes.
 *
 * The one subtlety is going BACKWARDS — from a wall-clock time in a zone to the instant it
 * names. There is no primitive for that, so `zonedToUtc` guesses and corrects: the offset
 * at the guess is within an hour of the offset at the answer for every real zone, and one
 * correction lands exactly. It is applied twice only at a DST boundary, where the first
 * guess can sit on the wrong side of the jump.
 *
 * AND `Intl` IS ASKED ONCE PER QUARTER HOUR, NOT ONCE PER QUESTION (2026-09-28). Every function
 * here used to format the instant it was handed, and the schedule asks a lot of them: one
 * `localDayBounds` is six to ten readings, and one recompute of an onboarding-sized routine made
 * about two thousand for a household with one entry and seven and a half thousand for one with a
 * fortnight of them — on Android each is a call across JNI into ICU, which is where the seconds
 * after every save went. The zone's OFFSET is what ICU knows and arithmetic does not, and it
 * changes a few times a year, so it is read per quarter hour of UTC and remembered
 * (`zoneOffsetMs`), and the wall clock is that offset added to the instant (`wallClock`).
 */

/** Fields pulled out of a formatted instant. */
interface Wall {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  const hit = cache.get(timeZone);
  if (hit) return hit;
  // hourCycle h23 rather than hour12:false — the latter yields "24" for midnight in some
  // ICU versions, which parses to the wrong day.
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  cache.set(timeZone, dtf);
  return dtf;
}

/**
 * The zone's offset at one instant as ICU reads it: format the instant as wall clock, re-read that
 * wall clock as if it were UTC, subtract. The only place this file asks `Intl` anything, and what
 * every remembered offset is checked against (`day.test.ts`).
 */
function readOffsetMs(timeZone: string, atMs: number): number {
  const parts = formatter(timeZone).formatToParts(new Date(atMs));
  const get = (type: string): number => {
    const p = parts.find(x => x.type === type);
    return p ? Number(p.value) : 0;
  };
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour'),
    get('minute'),
    get('second'),
  );
  // formatToParts drops sub-second precision, so compare against a floored instant.
  return asUtc - Math.floor(atMs / 1000) * 1000;
}

const QUARTER_HOUR_MS = 15 * 60_000;
/**
 * Quarter hours remembered per zone: six weeks of them, where a day's schedule touches a few
 * hundred. Past it the oldest goes first — the working set is today's and it is read again.
 */
const QUARTERS_PER_ZONE = 4096;
/** The last instant a `Date` can hold. */
const MAX_DATE_MS = 8.64e15;
/**
 * Per zone, per quarter hour of UTC since the epoch: the offset throughout it, or NaN for a quarter
 * hour a transition falls inside.
 */
const offsets = new Map<string, Map<number, number>>();

/**
 * The zone's offset from UTC at `atMs`, in ms, east-positive.
 *
 * WHY A QUARTER HOUR, AND WHY IT IS CHECKED RATHER THAN TRUSTED. Every offset in use today is a
 * whole number of quarter hours and nearly every transition happens on one, so nearly every quarter
 * hour of UTC has one offset from its first second to its last. Nearly: the zone database has
 * transitions a minute past midnight local (St. John's, Goose Bay and Moncton until 2011,
 * Antarctica/Casey as late as 2022) and offsets in seconds (every zone before its standard time).
 * So a quarter hour is read at its first second and its last, and remembered only when the two
 * agree; one that holds a transition is remembered as such, and each instant in it is read on its
 * own. The answer is then exactly the one `Intl` gives, for any instant in any zone, unless a
 * quarter hour held two transitions that cancel out: a clock changed and changed back within
 * fifteen minutes, which no zone has ever done.
 */
export function zoneOffsetMs(timeZone: string, atMs: number): number {
  // `new Date` truncates toward zero, so an instant is the ms `Intl` would have been handed
  const t = Math.trunc(atMs);
  const quarter = Math.floor(t / QUARTER_HOUR_MS);
  let known = offsets.get(timeZone);
  let offset = known?.get(quarter);
  if (offset === undefined) {
    const startMs = quarter * QUARTER_HOUR_MS;
    const first = readOffsetMs(timeZone, startMs);
    const last = readOffsetMs(timeZone, Math.min(startMs + QUARTER_HOUR_MS - 1000, MAX_DATE_MS));
    offset = first === last ? first : Number.NaN;
    if (known === undefined) {
      known = new Map();
      offsets.set(timeZone, known);
    } else if (known.size >= QUARTERS_PER_ZONE) {
      const oldest = known.keys().next();
      if (oldest.done !== true) known.delete(oldest.value);
    }
    known.set(quarter, offset);
  }
  return Number.isNaN(offset) ? readOffsetMs(timeZone, t) : offset;
}

/**
 * The wall-clock reading in `timeZone` at the instant `atMs`: the instant moved by the zone's
 * offset, read as UTC — which is what formatting it in the zone does, minus the trip into ICU.
 */
export function wallClock(timeZone: string, atMs: number): Wall {
  const t = Math.trunc(atMs);
  const d = new Date(t + zoneOffsetMs(timeZone, t));
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

/**
 * The instant at which `timeZone` reads the given wall-clock time.
 *
 * In a spring-forward gap the named time does not exist; we return the instant the clock
 * jumps to, which is what a person means by "2:30 that morning" when 2:30 was skipped. In a
 * fall-back overlap the earlier of the two instants is returned. Neither case can arise for
 * midnight in any zone currently in the IANA database, and midnight is what this file is
 * for, but the behavior is defined rather than accidental.
 */
export function zonedToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  const target = Date.UTC(year, month - 1, day, hour, minute, second);

  // A candidate is correct when the zone's offset AT the candidate is the offset we used to
  // build it. Simply iterating does not converge inside a gap — it oscillates between the
  // two offsets — so each candidate is checked rather than assumed.
  const o1 = zoneOffsetMs(timeZone, target);
  const t1 = target - o1;
  if (zoneOffsetMs(timeZone, t1) === o1) return t1;

  const o2 = zoneOffsetMs(timeZone, t1);
  const t2 = target - o2;
  if (zoneOffsetMs(timeZone, t2) === o2) return t2;

  // Neither is self-consistent, so the wall-clock time does not exist: it sits in the hour a
  // spring-forward skips. Return the later candidate, which is the instant the clock jumps
  // TO. This is not academic — Santiago and Havana move their clocks at midnight, so the
  // start of a local day really can be a time that never happens, and a day that started an
  // hour before the jump would double-count that hour against the day before.
  return Math.max(t1, t2);
}

export interface DayBounds {
  /** First instant of the local day, inclusive. */
  startMs: number;
  /** First instant of the NEXT local day, exclusive. */
  endMs: number;
}

/**
 * The local day containing `nowMs`, half-open [startMs, endMs).
 *
 * Half-open on purpose: an entry at exactly midnight belongs to the day starting, not the
 * day ending, and a closed range would count it twice across two calls.
 */
export function localDayBounds(timeZone: string, nowMs: number): DayBounds {
  const w = wallClock(timeZone, nowMs);
  const startMs = zonedToUtc(timeZone, w.year, w.month, w.day);
  // Add 26 hours and re-floor rather than adding 24: a day can be 23, 24 or 25 hours long,
  // and landing anywhere inside the next day is enough to find its start.
  const nextish = startMs + 26 * 3_600_000;
  const n = wallClock(timeZone, nextish);
  const endMs = zonedToUtc(timeZone, n.year, n.month, n.day);
  return { startMs, endMs };
}

/** The local day `offset` days from the one containing `nowMs` (negative for the past). */
export function shiftDay(timeZone: string, nowMs: number, offset: number): DayBounds {
  const w = wallClock(timeZone, nowMs);
  const anchor = zonedToUtc(timeZone, w.year, w.month, w.day + offset, 12);
  return localDayBounds(timeZone, anchor);
}

/** `yyyy-mm-dd` for the local day containing `atMs` — the key days are grouped by. */
export function localDayKey(timeZone: string, atMs: number): string {
  const w = wallClock(timeZone, atMs);
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return `${w.year}-${p2(w.month)}-${p2(w.day)}`;
}

/**
 * How much of [fromMs, toMs) falls inside the day (docs/plans/WP5.md D2).
 *
 * This is the whole reason sleep totals are correct: a nap from 23:30 to 07:00 gives 30
 * minutes to one day and 420 to the next, and summing the two days gives the sleep back
 * exactly once. Counting by start time instead would put 7.5 hours on the wrong day.
 */
export function overlapMs(fromMs: number, toMs: number, bounds: DayBounds): number {
  const lo = Math.max(fromMs, bounds.startMs);
  const hi = Math.min(toMs, bounds.endMs);
  return hi > lo ? hi - lo : 0;
}
