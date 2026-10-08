/**
 * Time formatting for the Today cards (docs/MOBILE.md §11: relative time comes from ONE
 * formatter so the copy stays identical across the app, the widgets and notifications;
 * §9: a screen reader hears units, never glyphs; §6: timers are timestamps and elapsed time
 * is arithmetic on them). Pure TypeScript — no React, no react-native — so it runs in node
 * and can be reused by the widget snapshot writer.
 *
 * Clock times go through Intl rather than hand-rolled am/pm so the per-person time zone
 * (`profiles.time_zone`) is honored and a flight does not reshuffle the day. Formatters are
 * cached: a ticking timer asks for one every second, and constructing Intl.DateTimeFormat
 * is the expensive part.
 */
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * `short`  "1h 26m" · "2h" · "26m" · "0m" · "2d 3h" — the since-label and the summary cells.
 * `live`   "1h 26m" · "26m 05s" · "5s" — what a RUNNING card shows (the prototype's fmtDur):
 *          seconds while a session is short enough for them to mean something.
 * `clock`  "1:26:05" · "26:05" · "0:05" — the stopwatch form.
 */
export type ElapsedStyle = 'short' | 'live' | 'clock';

interface Parts {
  d: number;
  h: number;
  m: number;
  s: number;
  totalSeconds: number;
}

function parts(ms: number): Parts {
  // a backwards wall-clock jump clamps at zero, never negative (MOBILE.md §6 rule 7)
  const totalSeconds = Math.max(0, Math.floor((Number.isFinite(ms) ? ms : 0) / SEC));
  const d = Math.floor(totalSeconds / (DAY / SEC));
  const h = Math.floor((totalSeconds % (DAY / SEC)) / 3600);
  return { d, h, m: Math.floor((totalSeconds % 3600) / 60), s: totalSeconds % 60, totalSeconds };
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * A duration a person reads at a glance. Past two days the hours stop meaning anything —
 * "59h 47m" is noise, "2d 12h" is a fact — so days take over at 48 hours.
 */
function durationShort(ms: number): string {
  const { d, h, m } = parts(ms);
  if (d >= 2) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  const hours = d * 24 + h;
  if (hours > 0) return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  return `${m}m`;
}

export function formatElapsed(ms: number, style: ElapsedStyle = 'short'): string {
  const p = parts(ms);
  const hours = p.d * 24 + p.h;
  switch (style) {
    case 'clock':
      return hours > 0 ? `${hours}:${pad2(p.m)}:${pad2(p.s)}` : `${p.m}:${pad2(p.s)}`;
    case 'live':
      if (hours > 0) return `${hours}h ${pad2(p.m)}m`;
      return p.m > 0 ? `${p.m}m ${pad2(p.s)}s` : `${p.s}s`;
    default:
      return durationShort(ms);
  }
}

/** "in 2h 10m" · "2h ago" · "now" — `deltaMs` is the target minus now (negative = past). */
export function relativeShort(deltaMs: number): string {
  if (!Number.isFinite(deltaMs) || Math.abs(deltaMs) < MIN) return 'now';
  return deltaMs > 0 ? `in ${durationShort(deltaMs)}` : `${durationShort(-deltaMs)} ago`;
}

const plural = (n: number, unit: string): string => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** "1 hour 26 minutes" · "2 days 3 hours" · "less than a minute" — for screen readers. */
export function announceElapsed(ms: number): string {
  const { d, h, m, totalSeconds } = parts(ms);
  if (totalSeconds < 60) return 'less than a minute';
  const out: string[] = [];
  if (d > 0) out.push(plural(d, 'day'));
  if (h > 0) out.push(plural(h, 'hour'));
  if (m > 0 && d === 0) out.push(plural(m, 'minute'));
  return out.join(' ');
}

const clockFormatters = new Map<string, Intl.DateTimeFormat>();
/** The device-zone formatters standing in for a zone ICU does not know: their text is not kept. */
const standIns = new WeakSet<Intl.DateTimeFormat>();

function clockFormatter(clock24: boolean, timeZone: string | undefined): Intl.DateTimeFormat {
  const key = `${clock24 ? '24' : '12'}|${timeZone ?? ''}`;
  const cached = clockFormatters.get(key);
  if (cached) return cached;
  const options: Intl.DateTimeFormatOptions = {
    hour: clock24 ? '2-digit' : 'numeric',
    minute: '2-digit',
    // hourCycle rather than hour12: `hour12:false` yields "24:05" at midnight on some ICU builds
    hourCycle: clock24 ? 'h23' : 'h12',
    ...(timeZone ? { timeZone } : {}),
  };
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('en-US', options);
  } catch {
    // an unknown zone id from a stale profile row must not take the clock down with it
    f = new Intl.DateTimeFormat('en-US', { ...options, timeZone: undefined });
    standIns.add(f);
  }
  clockFormatters.set(key, f);
  return f;
}

/*
  EVERY TIME ON EVERY SCREEN, READ ONCE (2026-09-28; the owner: "app needs to run as smooth as fast
  and as light as possible"). The same instants are drawn again at every render — each tile's last
  time, each row of Up next and of the Log, the day's list — and on a phone each `format` is a trip
  across JNI into ICU (`packages/core/src/today/day.ts` has the trace that measured it). The answer
  for an instant, a clock and a NAMED zone never changes, so it is kept: bounded, and forgotten
  whole when it is full rather than ranked, because what repeats is what is on the screen and it is
  read again within the minute. A time in the device's zone (no zone named, or a zone ICU does not
  know, which falls back to the device's) is not kept: the device can move under it.
*/
const clockTexts = new Map<string, string>();
const CLOCK_TEXTS_MAX = 2048;

/** "1:40 PM" · "13:40" in the person's own zone (`profiles.time_zone`), device zone when omitted. */
export function formatClock(ms: number, clock24: boolean, timeZone?: string): string {
  const key = timeZone ? `${clock24 ? '24' : '12'}|${timeZone}|${ms}` : null;
  if (key !== null) {
    const kept = clockTexts.get(key);
    if (kept !== undefined) return kept;
  }
  const f = clockFormatter(clock24, timeZone);
  // ICU 72+ sets a narrow no-break space before the day period; a plain space renders the same
  // in every font and is what the design's mono digits expect.
  const text = f.format(new Date(ms)).replace(/[\u202F\u00A0]/g, ' ');
  if (key !== null && !standIns.has(f)) {
    if (clockTexts.size >= CLOCK_TEXTS_MAX) clockTexts.clear();
    clockTexts.set(key, text);
  }
  return text;
}

const weekdayFormatters = new Map<string, Intl.DateTimeFormat>();

/**
 * "Thursday", in `timeZone` — the word `dayAheadLabel` and `dayBehindLabel` put before a time on
 * another day. One formatter per zone for the app's life (2026-09-28): the callers built a new one
 * for every row and card on every render, and on a phone building one is ICU across JNI too.
 */
export function weekdayName(ms: number, timeZone: string): string {
  let f = weekdayFormatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone });
    weekdayFormatters.set(timeZone, f);
  }
  return f.format(ms);
}

/**
 * "10:56 PM" WITH ITS AM/PM GLUED ON (the owner, 2026-09-24, of a slot time drawn on two rows:
 * "Even at 4 digits, you need to show it on one row"). `formatClock` hands out a plain space —
 * every string, test and store field reads that — so the glue goes on where text is DRAWN
 * (`AppText` runs every string it shows through this): a no-break space between the digit and
 * the day period. A line that runs out of room then breaks before "10:56 PM", never inside it,
 * and a screen reader hears the no-break space as the space it replaced. U+00A0, not the narrow
 * U+202F ICU uses: the plain-width one is in every face the app ships and draws the same width.
 */
const CLOCK_SPLIT = /(\d) ([AP]M)\b/g;
export function keepClockWhole(text: string): string {
  return text.replace(CLOCK_SPLIT, '$1\u00A0$2');
}

/* ------------------------------------------------------------------------- *
 * Timer arithmetic (docs/MOBILE.md §6): truth is the row, the display is a subtraction.
 * ------------------------------------------------------------------------- */

/** Elapsed for a plain timer: `now − started_at − paused_ms`, clamped at zero. */
export function timerElapsed(startedAt: number, pausedMs = 0, now = Date.now()): number {
  return Math.max(0, now - startedAt - pausedMs);
}

export interface BreastfeedSides {
  /** Stored seconds-so-far for each side, as milliseconds. */
  leftMs: number;
  rightMs: number;
  active: 'left' | 'right' | null;
  /** When the open side started; absent means leftMs/rightMs already include the open run. */
  sideStartedAt?: number;
}

/** Per-side totals including the open side's run, and the feed total (left + right). */
export function breastfeedTotals(
  sides: BreastfeedSides,
  now = Date.now(),
): { leftMs: number; rightMs: number; totalMs: number } {
  const open =
    sides.active && sides.sideStartedAt !== undefined ? Math.max(0, now - sides.sideStartedAt) : 0;
  const leftMs = Math.max(0, sides.leftMs) + (sides.active === 'left' ? open : 0);
  const rightMs = Math.max(0, sides.rightMs) + (sides.active === 'right' ? open : 0);
  return { leftMs, rightMs, totalMs: leftMs + rightMs };
}

/**
 * THE TWO LINES A RUNNING CARD COMPOSES, as the card draws them: a feed's per-side totals and the
 * started line. Here rather than inline in `TimerCard` so that what the card's words measure over
 * the owner's pictures (`tools/brand/card-art-words.mjs`) is the card's own words, never a copy of
 * them that could drift shorter than what a parent sees.
 */
export function timerTotalsLine(
  totals: { leftMs: number; rightMs: number },
  active: BreastfeedSides['active'] | undefined,
): string {
  return `L ${formatElapsed(totals.leftMs)} · R ${formatElapsed(totals.rightMs)} · ${
    active ? `on ${active}` : 'paused'
  }`;
}

/** "Started 1:40 PM", or "Started 1:40 PM · Dana" when the card is told who started it. */
export const timerStartedLine = (startedClock: string, byName?: string): string =>
  `Started ${startedClock}${byName ? ` · ${byName}` : ''}`;

/** The screen-reader sentence for a running timer (docs/MOBILE.md §9). */
export function announceTimer(input: {
  typeLabel: string;
  elapsedMs: number;
  startedClock: string;
  byName?: string;
}): string {
  const by = input.byName ? ` by ${input.byName}` : '';
  return `${input.typeLabel} timer, ${announceElapsed(input.elapsedMs)}, started ${input.startedClock}${by}`;
}

/** The 30-second bucket a live-region label is allowed to change on (MOBILE.md §9). */
export const ANNOUNCE_EVERY_MS = 30 * SEC;
export const announceBucket = (now: number): number =>
  Math.floor(now / ANNOUNCE_EVERY_MS) * ANNOUNCE_EVERY_MS;

/**
 * WHAT A RUNNING CARD IS ABOUT, in the fewest words that are still true.
 *
 * THE CHILD'S NAME ONLY WHERE THERE IS SOMEBODY ELSE IT COULD BE. A one-baby household read
 * "Chiara F is sleeping" on a card about the only person it could be about; the name was three
 * of the five words and none of the information (the owner, 2026-09-16: "if there is only one
 * baby 'Chiara F is sleeping' can be changed to 'Sleeping'"). With two the name comes back,
 * because then it is the fact that matters most — the caller passes it or does not.
 *
 * Pumping never takes a name at all: it belongs to the person holding the phone, not to a baby
 * (`householdScoped` in the module registry).
 *
 * TUMMY TIME TAKES THE HOUSEHOLD'S WORD (`label`): "Playtime" once a baby has graduated from it
 * (`packages/core/src/modules/variants.ts`), the registry's word when the caller passes none.
 * The other three are verbs, not names, and ignore it.
 */
export function timerTitle(
  type: 'sleep' | 'breastfeed' | 'pump' | 'tummy',
  childName?: string,
  label?: string,
): string {
  const who = childName === undefined || childName.trim() === '' ? null : childName.trim();
  switch (type) {
    case 'sleep':
      return who === null ? 'Sleeping' : `${who} is sleeping`;
    case 'breastfeed':
      return who === null ? 'Breastfeeding' : `Breastfeeding ${who}`;
    case 'pump':
      return 'Pumping';
    case 'tummy': {
      const word = label === undefined || label.trim() === '' ? 'Tummy time' : label.trim();
      return who === null ? word : `${word} · ${who}`;
    }
  }
}

/**
 * What the stop control says per timer — shared with the sticky timer bar, so both say the same.
 *
 * SHORT, ONE WORD WHERE ONE WILL DO (the owner, 2026-09-26: *"rewrite 'stop pumping' to 'stop,
 * like you have for playtime"*): the card's own title already says what is running, so the
 * button only has to say what it does. Sleep keeps "Woke up" and a feed "Finish" — the moment a
 * parent presses them for, in two words and one (§20).
 *
 * Here beside the card's other words rather than in `TimerCard`, because the caption sets the stop
 * pill's width and the pill is what bounds the words beside it: the measurement of those words over
 * the owner's pictures reads it from here (`tools/brand/card-art-words.mjs`).
 */
/**
 * A RUNNING TIMER OUTSIDE THE APP, ACTIVITY FIRST (the owner's live timer handoff, 2026-10-07):
 * "Sleeping · Ada", "Breastfeeding · Ada", "Pumping", "Playtime · Ada" on the lock screen, in the
 * Dynamic Island and in Android's shade, where the activity is what is read first. The name follows
 * `timerTitle`'s rule: only where there is somebody else it could be, and never on Pumping.
 */
export function liveTimerTitle(
  type: 'sleep' | 'breastfeed' | 'pump' | 'tummy',
  childName?: string,
  label?: string,
): string {
  const word = liveTimerWord(type, label);
  const who = childName === undefined || childName.trim() === '' ? null : childName.trim();
  return who === null || type === 'pump' ? word : `${word} · ${who}`;
}

/** The activity alone, as `liveTimerTitle` starts: "Sleeping", "Breastfeeding", "Playtime". */
export function liveTimerWord(
  type: 'sleep' | 'breastfeed' | 'pump' | 'tummy',
  label?: string,
): string {
  switch (type) {
    case 'sleep':
      return 'Sleeping';
    case 'breastfeed':
      return 'Breastfeeding';
    case 'pump':
      return 'Pumping';
    case 'tummy':
      return label === undefined || label.trim() === '' ? 'Tummy time' : label.trim();
  }
}

/** A feed's sides on pause, as the shade and the lock screen freeze them: "L 6m · R 4m". */
export const pausedSidesLine = (totals: { leftMs: number; rightMs: number }): string =>
  `L ${formatElapsed(totals.leftMs)} · R ${formatElapsed(totals.rightMs)}`;

export const TIMER_STOP_CAPTION: Record<'sleep' | 'breastfeed' | 'pump' | 'tummy', string> = {
  sleep: 'Woke up',
  pump: 'Stop',
  breastfeed: 'Finish',
  tummy: 'Stop',
};

/** The breastfeed card's side switch, named for the side it opens. */
export const timerSwitchLine = (active: BreastfeedSides['active'] | undefined): string =>
  active === 'left' ? 'Switch to right' : 'Switch to left';
