/**
 * WHEN THE HOUSEHOLD'S DAY BEGINS AND ENDS, and therefore whether a sleep is a NAP or NIGHT
 * SLEEP (the owner, 2026-09-18: "instead of only selecting time for bedtime, have the user to
 * select Wake time (daytime) and bed time (for example wake time 8am, and bed time 9pm), so any
 * sleep recorded in this hour range is only nap, and have it written so. But if the sleep is
 * recorded around the bed time, then it should be night sleep. this is different, and will matter
 * in the report. parents take baby sleeping routine seriously").
 *
 * WHY THIS IS NOT A MEDICAL JUDGEMENT, stated up front because it is the question to ask of
 * anything in this file. The app is not deciding when a baby should sleep, how much, or whether a
 * nap was long enough. The household says "we are up at 8 and down at 9"; this classifies their
 * own entries against their own two numbers and prints the word. A parent who moves bedtime moves
 * every label with it. There is no threshold in here that came from anywhere but the two times on
 * their screen (CLAUDE.md §2 rules 1 and 3).
 *
 * WHY IT WAS WORTH BUILDING. A day's sleep is currently one number, and one number answers none
 * of the questions a parent actually has — "did she nap at all today", "is the night getting
 * longer". Adding them together makes a 45-minute nap and a 45-minute night look identical, and
 * the export, which is what gets taken to a pediatrician, carried the same flat total.
 *
 * THE RULE, in one sentence: a sleep that STARTS inside the waking window and is over by
 * bedtime is a nap; one that starts outside it, or runs on past bedtime, is night sleep.
 *
 * THE SECOND HALF IS THE OWNER'S, 2026-10-07 ("logging sleep counts as nap, it is obvious that
 * it's a sleep with those long hours"): a sleep begun at 8:23 PM in a household whose day ends at
 * 10 and ended at 9:03 the next morning was saved as "Nap 12h 40m". The start said nap; the span
 * said night, and only the span was right. Crossing the household's OWN bedtime is the test, not a
 * length: no number of hours in here came from anywhere but the two times on their screen.
 *
 * Without an end (a sleep still running, and the callers that have only a start) it is the START
 * that decides, for the same reason every other elapsed measure in this app
 * anchors on the start (`intervalAnchor` in the schedule engine): a night sleep begun at 9:05 p.m.
 * and ended at 6 a.m. is a night sleep, and reading its END would file it as a nap because six in
 * the morning is inside nobody's window. A 20-minute doze at 8:50 p.m. is filed as night sleep,
 * which is the honest answer — the household said the day ends at 9, and it is not this file's
 * business to second-guess a parent about their own evening.
 */
import { wallMinutes } from '../schedule/time';

/** `HH:MM` local wall times. Bed may be earlier than wake in the string sense; see `isAwakeAt`. */
export interface DayWindow {
  /** When the household's day starts — everything after this is daytime. */
  wake: string;
  /** When it ends. A sleep starting at or after this is night sleep. */
  bed: string;
}

/**
 * The window before a household has said otherwise, and it is the SCHEDULE ENGINE'S existing
 * pair rather than two new numbers: `RULE_DEFAULTS.wakeDefault` and `bedtimeDefault` already
 * stand in for an unlogged wake and bedtime when a relative rule needs one. Two different
 * defaults for "when does the day start" would be two answers to one question.
 */
export const DEFAULT_DAY_WINDOW: DayWindow = { wake: '07:00', bed: '19:30' };

const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (m === null) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

/**
 * Whether a wall-clock minute-of-day is inside the household's waking hours.
 *
 * IT WRAPS, because a household can legitimately say wake 20:00 and bed 08:00 — a night-shift
 * parent, or simply a typo they have not noticed yet. `wake === bed` reads as ALWAYS AWAKE rather
 * than never: the failure that leaves every sleep labelled a nap is a wrong word, and the one
 * that labels every sleep as night is a wrong word AND a day with no naps in the report.
 */
export function isAwakeAt(minuteOfDay: number, w: DayWindow = DEFAULT_DAY_WINDOW): boolean {
  const wake = toMinutes(w.wake) ?? toMinutes(DEFAULT_DAY_WINDOW.wake) ?? 0;
  const bed = toMinutes(w.bed) ?? toMinutes(DEFAULT_DAY_WINDOW.bed) ?? 0;
  if (wake === bed) return true;
  return wake < bed
    ? minuteOfDay >= wake && minuteOfDay < bed
    : // wrapped: awake from `wake` to midnight, and from midnight to `bed`
      minuteOfDay >= wake || minuteOfDay < bed;
}

/**
 * The kind a sleep starting at `atMs` (and, when it is known, ending at `endMs`) is, by the
 * household's own window.
 *
 * `NAP` and `NIGHT` are the two values `sleep_details.kind` already holds, so nothing about the
 * database changes — this decides what goes in it rather than adding a third state.
 *
 * A sleep that starts in the day and is still asleep when the household's bedtime comes is the
 * night (the owner, 2026-10-07). Reaching bedtime exactly is still the nap that was put down
 * before it; going past it is not. A window read as always awake (`wake === bed`) has no bedtime
 * to cross, so its sleeps stay naps, as `isAwakeAt` says.
 */
export function sleepKindAt(
  timeZone: string,
  atMs: number,
  w: DayWindow = DEFAULT_DAY_WINDOW,
  endMs?: number | null,
): 'NAP' | 'NIGHT' {
  const startMin = wallMinutes(timeZone, atMs);
  if (!isAwakeAt(startMin, w)) return 'NIGHT';
  if (endMs === undefined || endMs === null || !Number.isFinite(endMs)) return 'NAP';
  const wake = toMinutes(w.wake) ?? toMinutes(DEFAULT_DAY_WINDOW.wake) ?? 0;
  const bed = toMinutes(w.bed) ?? toMinutes(DEFAULT_DAY_WINDOW.bed) ?? 0;
  if (wake === bed) return 'NAP';
  // minutes from the start to the next bedtime on the wall clock; the start is awake, so it is
  // never the bedtime itself
  const toBed = (bed - startMin + 1440) % 1440;
  return endMs - atMs > toBed * 60_000 ? 'NIGHT' : 'NAP';
}

/**
 * The word for it, which is the half of this the owner asked for explicitly ("and have it written
 * so"). Sentence case, and "night sleep" rather than "night": a chip reading "Night" beside a time
 * reads as a time of day.
 */
export const sleepKindLabel = (kind: 'NAP' | 'NIGHT'): string =>
  kind === 'NAP' ? 'Nap' : 'Night sleep';

/**
 * WHY A SLEEP MAY DISAGREE WITH THE WINDOW, and why the stored kind wins.
 *
 * The window decides the DEFAULT. A parent can still say otherwise on the sheet — a baby who
 * sleeps through from six in the evening is having a night, whatever the household's usual
 * bedtime — and once they have said so the entry keeps their answer. This is the function that
 * settles it, in one place, so the sheet, the reports and the export cannot each decide
 * differently: a stored kind is the truth, and the window fills a blank.
 */
export const sleepKindOf = (
  stored: 'NAP' | 'NIGHT' | null | undefined,
  timeZone: string,
  startMs: number,
  w: DayWindow = DEFAULT_DAY_WINDOW,
  endMs?: number | null,
): 'NAP' | 'NIGHT' => stored ?? sleepKindAt(timeZone, startMs, w, endMs);

/**
 * `HH:MM` out of whatever the household's stored row holds, falling back per field.
 *
 * It exists because the window makes a ROUND TRIP through two representations. Postgres holds
 * `wake_time` and `bed_time` as `time`, and `to_jsonb` prints one as `07:00:00`; a local write
 * puts back the short `07:00` the picker produced. Both shapes therefore come out of the same
 * mirrored column, sometimes within one session — a phone that set the window offline and then
 * pulled the server's answer has seen both. Normalising here rather than at each reader is what
 * stops `'07:00:00' !== '07:00'` turning into a label that flickers after a sync.
 *
 * Anything else — a null, a truncated string, a value an older build stored differently — is the
 * fallback rather than a thrown error: the worst case for a bad value is the default window, and
 * the worst case for a throw is a sleep sheet that will not open.
 */
export const windowTimeOr = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(value.trim());
  if (m === null) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return fallback;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
};

/**
 * WHAT THE WAKE/BED PAIR IS CALLED, and it is not the parent's day (the owner, 2026-09-18:
 * "baby start and bed time should not be called 'Your Day' because it's not really the user's
 * day, but call it [baby's name]'s Day").
 *
 * They are right: the two times decide whether a SLEEP is a nap or night sleep, and it is the
 * baby who is asleep. A parent on a night shift is awake through both of them.
 *
 * IT IS STILL A HOUSEHOLD SETTING (migration 0095), which is the one thing the owner's sentence
 * cannot be taken literally about: one row decides the word for every child, so in a twin
 * household naming it after whichever child the app happens to be showing would claim a setting
 * belongs to one of them. Hence three answers rather than one, and the plural is the honest
 * version of the same idea rather than a fallback.
 */
export function dayWindowTitle(names: readonly string[]): string {
  const kept = names.map(n => n.trim()).filter(n => n.length > 0);
  if (kept.length === 1) return `${kept[0]}’s day`;
  return kept.length > 1 ? 'Your babies’ day' : 'Your baby’s day';
}

/* ------------------------------------------------- the day, as something you can look at */

export interface DayBand {
  kind: 'awake' | 'night';
  /** Where it starts and ends along a midnight-to-midnight track, each 0..1. */
  from: number;
  to: number;
}

/**
 * THE DAY AS A MIDNIGHT-TO-MIDNIGHT TRACK — the pieces a band draws, in order, never
 * overlapping, always covering the whole 24 hours.
 *
 * It returns SEGMENTS rather than two numbers because the interesting case is the one a pair of
 * numbers cannot draw: a window that wraps past midnight (wake 20:00, bed 08:00) is awake at
 * both ENDS of the track with the night in the middle, and a component that tried to compute
 * that from `left` and `width` would get it wrong in exactly the household — a night-shift
 * parent's — least able to notice it was a drawing bug rather than their own typo.
 *
 * Pure, and tested in node, because it is the one piece of the picture that can be wrong without
 * looking wrong.
 */
export function dayBands(w: DayWindow = DEFAULT_DAY_WINDOW): DayBand[] {
  const wake = toMinutes(w.wake) ?? toMinutes(DEFAULT_DAY_WINDOW.wake) ?? 0;
  const bed = toMinutes(w.bed) ?? toMinutes(DEFAULT_DAY_WINDOW.bed) ?? 0;
  const at = (m: number) => m / 1440;
  if (wake === bed) return [{ kind: 'awake', from: 0, to: 1 }];
  const bands: DayBand[] =
    wake < bed
      ? [
          { kind: 'night', from: 0, to: at(wake) },
          { kind: 'awake', from: at(wake), to: at(bed) },
          { kind: 'night', from: at(bed), to: 1 },
        ]
      : [
          { kind: 'awake', from: 0, to: at(bed) },
          { kind: 'night', from: at(bed), to: at(wake) },
          { kind: 'awake', from: at(wake), to: 1 },
        ];
  // a wake or bed at midnight itself produces a zero-width piece; drawing it would put a seam
  // in the band with nothing on either side of it
  return bands.filter(b => b.to > b.from);
}

/** Where along the track a wall-clock `HH:MM` sits, 0..1. Out-of-range text reads as midnight. */
export const dayPosition = (hhmm: string): number => (toMinutes(hhmm) ?? 0) / 1440;
