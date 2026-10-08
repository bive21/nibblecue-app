/**
 * Backdating presets for every Quick Entry sheet (docs/MOBILE.md §8; docs/DESIGN_SYSTEM.md §5
 * "TimeRow"): `Now · −15m · −30m · Custom`, resolved against a clock the caller passes in —
 * never `Date.now()` here — so a sheet that sat open for ten minutes still means "now" when Save
 * is tapped, and the tests are deterministic.
 *
 * ONE ROW, ONE SET OF WORDS, ON EVERY SHEET (the owner, 2026-09-26, on the bottle: *"the options
 * should show in 1 row, 'Now', '~15 min', '~30 min' 'Custom' then the actual hour"*; and on the
 * pump's finished form: *"simplify the words … just finished to now, '~15 min' '~30 min'
 * 'custom'"*). Until then there were two rows — `Now · −15 min · −30 min · −1 hour · Custom` for a
 * moment, `Now · 15 min ago · 30 min ago · Custom` for something already over — and neither fitted
 * one line on a 360-wide phone. The eyebrow over the row now says what its time IS ("Feeding start
 * time", "End time"), so the chips only have to say how long ago, and the same four say it on
 * every sheet. `−1 hour` went: an hour back is Custom's, and a fifth chip is what broke the line.
 *
 * `applyCustom` is the one rule with a trap in it: a custom time LATER than now rolls back one
 * day (a parent logging "the 11:40 PM feed" at 12:10 AM means last night). The day is rolled
 * back on the wall clock of the person's own zone, not by subtracting 24 hours, so a DST edge
 * does not land the entry an hour off. Stored values are always UTC milliseconds.
 */
export type Preset = 'now' | 'm15' | 'm30' | 'custom';

export const PRESETS: readonly Preset[] = ['now', 'm15', 'm30', 'custom'];

/**
 * THE WORDS OF EVERY "WHEN" CHIP IN THE APP, from one place (the owner, 2026-10-06: *"i still see
 * some call it '~15 min' '~30 min', some others 15 min ago … most importantly we need to make it
 * uniform in the whole app"*). Before this there were four spellings: `~15 min` on the quick sheets,
 * `15 min ago` on the completed forms, `15 min` beside a heading, and `Just now · Earlier…` on the
 * timers. Now every row says `Now`, then `−15m`-shaped offsets, then `Custom`.
 *
 * WHY "−15m", measured rather than liked (Hanken Grotesk at 13, the row's own chip padding). The
 * pump's Finished row puts its heading and the four chips on ONE line; at a 360 phone that line is
 * 324 points. `15m ago` makes it 352, and `< 15 min`, the owner's offer, 344 — both break onto two
 * lines, on the owner's own 384-wide phone too. `−15m` makes it 318. It is also the one short form
 * that cannot be misread: `<` says "less than fifteen minutes" while the chip places the entry at
 * exactly fifteen back (the clock it comes to is on the row), and a bare `15m` beside the sleep
 * form's length stepper reads as a length. The minus says "back from now". A screen reader hears
 * the whole words (`PRESET_SPOKEN`, `agoSpoken`).
 */
export const NOW_LABEL = 'Now';
export const CUSTOM_LABEL = 'Custom';
/** `−5m`, `−15m` (a true minus, U+2212): an offset chip, wherever one is drawn. */
export const agoLabel = (minutes: number): string => `\u2212${minutes}m`;
/**
 * `−5 min`, `−15 min`: the same offset spelled out, drawn instead of `agoLabel`'s wherever the
 * chip's measured slot holds it with room to spare (the owner, 2026-10-08: "when there is clear space
 * for the text, show -5 min, -15 min, -30 min, and custom instead. Keep it short if it does not fit.
 * This applies to all modules"; `SlotRow`'s `longLabel`). The same true minus.
 */
export const agoLongLabel = (minutes: number): string => `\u2212${minutes} min`;
/** What a screen reader hears for the same chip. */
export const agoSpoken = (minutes: number): string => `${minutes} minutes ago`;

/**
 * THE FOUR WORDS OF THE TIME ROW: `Now · −15m · −30m · Custom` (the owner, 2026-10-06, after the
 * handoff's "−30" and "custom" reached a phone: "−30 instead of −30m … custom is all lowercase,
 * but this is wrong, it should be Custom"). A screen reader hears whole words (`PRESET_SPOKEN`).
 */
export const PRESET_LABELS: Readonly<Record<Preset, string>> = {
  now: NOW_LABEL,
  m15: agoLabel(15),
  m30: agoLabel(30),
  custom: CUSTOM_LABEL,
};

/** The short words, by their own name. */
export const PRESET_SHORT_LABELS = PRESET_LABELS;
/**
 * THE SAME FOUR SPELLED OUT, `Now · −15 min · −30 min · Custom`, drawn only where every slot holds
 * them with room to spare (`SlotRow`'s `longLabel`, 2026-10-08); the short words otherwise.
 */
export const PRESET_LONG_LABELS: Readonly<Record<Preset, string>> = {
  now: NOW_LABEL,
  m15: agoLongLabel(15),
  m30: agoLongLabel(30),
  custom: CUSTOM_LABEL,
};

/**
 * What a screen reader says for each chip. `−15m` read aloud is "minus fifteen m", which is not
 * a sentence; these are, and they say which way the time moves.
 */
export const PRESET_SPOKEN: Readonly<Record<Preset, string>> = {
  now: 'Now',
  m15: agoSpoken(15),
  m30: agoSpoken(30),
  custom: 'Choose a date and time',
};

/** The contract's name for the same map (MOBILE.md §8 calls it `labels`). */
export const labels = PRESET_LABELS;

const MIN = 60_000;

export const PRESET_OFFSET_MS: Readonly<Record<Exclude<Preset, 'custom'>, number>> = {
  now: 0,
  m15: 15 * MIN,
  m30: 30 * MIN,
};

export const isPreset = (v: unknown): v is Preset =>
  typeof v === 'string' && (PRESETS as readonly string[]).includes(v);

/**
 * The timestamp a preset means at `nowMs`. `custom` keeps whatever the person picked
 * (`customMs`) and falls back to now until they have picked anything.
 */
export function resolvePreset(preset: Preset, nowMs: number, customMs?: number): number {
  if (preset === 'custom') return customMs ?? nowMs;
  return nowMs - PRESET_OFFSET_MS[preset];
}

export interface WallClock {
  hours: number;
  minutes: number;
}

interface DateParts {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = partFormatters.get(timeZone);
  if (cached) return cached;
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });
  partFormatters.set(timeZone, f);
  return f;
}

/** The wall-clock parts of an instant, in the device zone or a named one. */
export function wallClockParts(ms: number, timeZone?: string): DateParts {
  if (!timeZone) {
    const d = new Date(ms);
    return {
      year: d.getFullYear(),
      month: d.getMonth() + 1,
      day: d.getDate(),
      hours: d.getHours(),
      minutes: d.getMinutes(),
    };
  }
  const out: DateParts = { year: 0, month: 0, day: 0, hours: 0, minutes: 0 };
  for (const p of partsFormatter(timeZone).formatToParts(new Date(ms))) {
    const n = Number(p.value);
    if (p.type === 'year') out.year = n;
    else if (p.type === 'month') out.month = n;
    else if (p.type === 'day') out.day = n;
    // ICU may print "24" for midnight on some builds even with h23; fold it
    else if (p.type === 'hour') out.hours = n === 24 ? 0 : n;
    else if (p.type === 'minute') out.minutes = n;
  }
  return out;
}

/**
 * THE DAY A TIME ROW'S ANSWER FALLS ON, in words: `Today`, `Yesterday`, or `Mon 5` further back
 * (the row reads "Today · 10:13 AM", the owner's solids target, 2026-10-06).
 */
export function dayWord(ms: number, nowMs: number, timeZone?: string): string {
  const a = wallClockParts(ms, timeZone);
  const n = wallClockParts(nowMs, timeZone);
  const days = Math.round(
    (Date.UTC(n.year, n.month - 1, n.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(ms));
}

/** The instant a wall-clock date-time names in a zone (device zone when omitted). */
function instantOf(p: DateParts, timeZone?: string): number {
  if (!timeZone) return new Date(p.year, p.month - 1, p.day, p.hours, p.minutes, 0, 0).getTime();
  // Read the wall time as if it were UTC, then correct by the zone's offset at that instant.
  // Two passes settle the offset across a DST change; a wall time that does not exist (the
  // spring-forward hour) lands on the nearest instant after it, which is what a picker does.
  const wanted = Date.UTC(p.year, p.month - 1, p.day, p.hours, p.minutes);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const at = wallClockParts(guess, timeZone);
    const asUtc = Date.UTC(at.year, at.month - 1, at.day, at.hours, at.minutes);
    guess += wanted - asUtc;
  }
  return guess;
}

/**
 * The instant a custom `HH:MM` means: today at that time in the person's zone, or yesterday
 * when that would be later than now. Seconds are dropped — a picker has none.
 */
export function applyCustom(custom: WallClock, nowMs: number, timeZone?: string): number {
  const today = wallClockParts(nowMs, timeZone);
  const hours = Math.min(23, Math.max(0, Math.trunc(custom.hours)));
  const minutes = Math.min(59, Math.max(0, Math.trunc(custom.minutes)));
  const candidate = instantOf({ ...today, hours, minutes }, timeZone);
  if (candidate <= nowMs) return candidate;
  // roll back one CALENDAR day: Date.UTC / the Date constructor both normalize day 0 to the
  // last day of the previous month, so no month arithmetic is needed here
  return instantOf({ ...today, day: today.day - 1, hours, minutes }, timeZone);
}

/** The hours and minutes a picker should open on for a stored value. */
export function wallClockOf(ms: number, timeZone?: string): WallClock {
  const p = wallClockParts(ms, timeZone);
  return { hours: p.hours, minutes: p.minutes };
}
