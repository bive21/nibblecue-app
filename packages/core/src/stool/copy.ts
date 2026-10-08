/**
 * THE APP'S OWN SENTENCES ABOUT WHAT IT COUNTED — as distinct from the publications' sentences,
 * which live in the guidance file and are quoted, never written.
 *
 * Every string this file produces is arithmetic read aloud. "3 days since the last dirty diaper"
 * is a fact; "it has been a long time since the last dirty diaper" is a verdict, and the
 * difference between those two sentences is the difference between this app and one that gives
 * medical advice. `reportBannedHits` runs over every string here in the test, at every sample
 * size, so an edit cannot slip an adjective in.
 *
 * ON "LONGER THAN ANY GAP SO FAR": it reads like a judgment and is not one. It compares this
 * baby's current gap to this baby's own logged gaps and states the result. There is no
 * guideline in it, no other baby in it, and no instruction attached to it — the sentence that
 * follows it on screen is a publication's, in quotation marks, with its name underneath.
 */
import type { StoolPattern } from './pattern';

/**
 * A whole number of hours as a LENGTH — "3 days", "3 days, 4h", "6 hours". Separate from
 * `sinceLabel` because "it has been 3 days ago" is not a sentence, and a single label that has
 * to serve both readings ends up ungrammatical in one of them.
 */
export function spanLabel(hours: number): string {
  if (hours < 1) return 'under an hour';
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  const d = `${days} ${days === 1 ? 'day' : 'days'}`;
  return rest === 0 ? d : `${d}, ${rest}h`;
}

/**
 * The same length, read as a time in the past. Named `agoLabel` rather than `sinceLabel`
 * because `today/since.ts` already owns `agoLabel` for the terse tile form ("3d"), and two
 * exports with one name in a package that re-exports everything is an ambiguity, not a choice.
 */
export function agoSpanLabel(hours: number): string {
  return `${spanLabel(hours)} ago`;
}

/** Hours as a gap length rather than a time ago — "about 1 day 4h". */
export function gapLabel(hours: number): string {
  const h = Math.round(hours);
  if (h < 24) return `${h}h`;
  const days = Math.floor(h / 24);
  const rest = h % 24;
  return rest === 0 ? `${days}d` : `${days}d ${rest}h`;
}

const STOOL_HEADER = 'Dirty diapers';

/**
 * The headline. Null when the app has nothing it can honestly say — no diaper logging at all,
 * or diaper logging that stopped, in which case a gap is about the log rather than the baby.
 */
export function sinceLine(p: StoolPattern): string | null {
  if (!p.engaged) return null;
  if (p.lastDirtyMs === null || p.hoursSinceDirty === null) {
    return p.confident ? 'No dirty diaper logged yet in this range.' : null;
  }
  if (!p.confident) return null;
  return p.todayHasDirty
    ? `Last dirty diaper ${agoSpanLabel(p.hoursSinceDirty)}, today.`
    : `Last dirty diaper ${agoSpanLabel(p.hoursSinceDirty)}.`;
}

/** What this household's own log says its spacing has been. Null until there are two gaps. */
export function ownPatternLine(p: StoolPattern): string | null {
  if (!p.engaged || !p.hasOwnPattern || p.medianGapHours === null) return null;
  return `Dirty diapers have been about ${gapLabel(p.medianGapHours)} apart, over ${p.gapsHours.length} ${p.gapsHours.length === 1 ? 'gap' : 'gaps'}.`;
}

/** The longest they have logged, for the same reason the observations carry their N. */
export function longestGapLine(p: StoolPattern): string | null {
  if (!p.engaged || p.longestGapHours === null) return null;
  return `The longest gap logged so far was ${gapLabel(p.longestGapHours)}.`;
}

/**
 * THE FLAG, and the whole of it. It fires on this baby's own history and says only what it
 * measured. The published sentences are shown beneath it by the screen, quoted.
 */
export function beyondOwnLine(p: StoolPattern): string | null {
  if (!p.beyondOwnLongest || p.hoursSinceDirty === null) return null;
  return `It has been ${spanLabel(p.hoursSinceDirty)}, longer than any gap in this log so far.`;
}

/** The per-day count, with the days it is divided by, as every average in this app carries. */
export function perDayLine(p: StoolPattern, days: number): string | null {
  if (!p.engaged || p.dirty === 0) return null;
  const n = Math.max(1, days);
  return `${p.dirty} dirty ${p.dirty === 1 ? 'diaper' : 'diapers'} over ${n} ${n === 1 ? 'day' : 'days'}, ${(p.dirty / n).toFixed(1)} a day.`;
}

/** Days that carried diapers but no dirty one — a real zero, and named as one. */
export function blankDaysLine(p: StoolPattern): string | null {
  if (!p.engaged || p.daysWithoutDirty === 0) return null;
  const n = p.daysWithoutDirty;
  return `${n} ${n === 1 ? 'day' : 'days'} with diapers logged and no dirty one.`;
}

/** Why a figure is missing, said plainly rather than left as a blank card. */
export const STOOL_STALE =
  'No diapers logged for a while, so there is no gap to count. Log a change and it comes back.';
export const STOOL_NOT_ENGAGED = 'This appears once a few diaper changes have been logged.';

/* ------------------------------------------------- the line on the diaper sheet */

/**
 * WHAT THE PARENT SEES AT THE MOMENT IT MATTERS (the owner: "how to notify parents if you
 * notice poo has not been logged when diaper change").
 *
 * The diaper sheet is the one place a parent is already thinking about this, so the fact goes
 * there rather than into a push: a notification about a bowel movement that has not happened is
 * an alarm, and a line on a sheet they opened themselves is information. It is the same
 * sentence whatever the number says — nothing turns red, nothing appears only when the figure
 * is large — because a line that only shows up when something is wrong IS a verdict, however
 * neutrally it is worded.
 */
export const STOOL_SHEET_NONE = 'No dirty diaper logged yet.';
const STOOL_SHEET_DOOR = 'See this in Reports';

export function sheetSinceLine(hours: number): string {
  return `Last dirty diaper ${agoSpanLabel(hours)}.`;
}

/** Every sentence this file can produce, for the lint test. */
export function allStoolLines(p: StoolPattern, days: number): string[] {
  return [
    sinceLine(p),
    ownPatternLine(p),
    longestGapLine(p),
    beyondOwnLine(p),
    perDayLine(p, days),
    blankDaysLine(p),
    STOOL_STALE,
    STOOL_NOT_ENGAGED,
    STOOL_HEADER,
    STOOL_SHEET_NONE,
    STOOL_SHEET_DOOR,
    sheetSinceLine(p.hoursSinceDirty ?? 0),
  ].filter((s): s is string => s !== null);
}
