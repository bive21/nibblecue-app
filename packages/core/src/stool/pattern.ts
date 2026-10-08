/**
 * DAYS SINCE THE LAST DIRTY DIAPER, AND WHETHER THAT NUMBER MEANS ANYTHING.
 *
 * The owner asked for a way to know whether a baby has had a bowel movement today, how long it
 * has been, and a flag when it has been too long. Two of those three are arithmetic on the
 * household's own log and are built here exactly as asked. The third is not, and the reason is
 * worth writing down because it is the whole design:
 *
 * THERE IS NO PUBLISHED NUMBER OF DAYS. The AAP states, in as many words, that infrequent stools
 * are not in themselves a problem for a breastfed baby, and that some breastfed babies at three
 * to six weeks have one bowel movement a week. A fixed "flag at three days" would therefore fire
 * on a healthy breastfed newborn roughly every week of their life, and an app that cries wolf
 * weekly is an app a parent turns off before the week it matters. The published sources key on
 * what the stool is LIKE and how the baby is doing — things this app has never seen, because it
 * has only ever seen a tap on a button. So the flag is the household's OWN history: the app says
 * when the current gap is longer than any gap this baby has had, which is a fact about this baby
 * and needs no threshold from anywhere.
 *
 * AND THE NUMBER IS ONLY ABOUT THE BABY WHILE DIAPERS ARE STILL BEING LOGGED. "Six days since a
 * dirty diaper" is a statement about the baby if wet diapers were logged yesterday, and a
 * statement about the PARENT if nothing at all was logged for six days. The two are
 * indistinguishable from the row count alone, so `confident` separates them and every surface
 * that shows a gap checks it first. A household that never logs diapers gets `engaged: false`
 * and never sees any of this — which is the owner's own rule, and the same rule one step further
 * for a household that logged for a week and stopped.
 *
 * Every field is a count, a difference or a quotient of entries the household typed. Nothing
 * here is compared to a guideline, to another household, or to this household last month.
 */
import type { DayBounds } from '../today/day';
import type { DiaperKind, TodayActivity } from '../today/rows';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** DIRTY and BOTH are the two kinds that contain a bowel movement. Nothing else counts. */
export const isDirty = (kind: DiaperKind | null | undefined): boolean =>
  kind === 'DIRTY' || kind === 'BOTH';

export const isWet = (kind: DiaperKind | null | undefined): boolean =>
  kind === 'WET' || kind === 'BOTH';

/**
 * What it takes before the app says anything at all about diapers.
 *
 * Three entries across two distinct days. One tap on the day of install is somebody looking at
 * the button, not a household that tracks diapers, and a "days since" figure built on it would
 * be the app inventing a history out of a single row.
 */
export const ENGAGED_MIN_ENTRIES = 3;
export const ENGAGED_MIN_DAYS = 2;

/**
 * How long after the last diaper of ANY kind a gap stops being about the baby.
 *
 * 36 hours rather than 24: a household that logs every change still misses a night, and going
 * quiet on somebody who simply slept would be the app losing its nerve. Past a day and a half of
 * nothing at all, the honest reading is that the log stopped, not that the baby did.
 */
export const CONFIDENT_WITHIN_HOURS = 36;

export interface StoolPattern {
  /** This household logs diapers. Everything below is meaningless — and hidden — when false. */
  engaged: boolean;
  /** Diaper entries of every kind in the window, DRY included. */
  diapersLogged: number;
  /** Distinct local days in the window that carried at least one diaper entry. */
  loggedDays: number;
  /** The most recent diaper of any kind, which is what makes a gap readable. */
  lastDiaperMs: number | null;
  /** The most recent DIRTY or BOTH, or null when the window holds none. */
  lastDirtyMs: number | null;
  /** Whole hours since `lastDirtyMs`, or null. */
  hoursSinceDirty: number | null;
  /**
   * Whole days since `lastDirtyMs`, floored — "2" means at least 48 hours, never "some time
   * yesterday". A parent reading "2 days" and finding it meant 26 hours would be right to stop
   * believing the other numbers too.
   */
  daysSinceDirty: number | null;
  /** Diapers are still being logged, so a gap is about the baby rather than about the log. */
  confident: boolean;
  /** Whether a dirty diaper has been logged since the current local day began. */
  todayHasDirty: boolean;
  /** Gaps between consecutive dirty entries, in hours, oldest first. */
  gapsHours: number[];
  /** The middle gap this household has logged — their own usual, not anybody's rule. */
  medianGapHours: number | null;
  /** The longest gap this household has logged BEFORE the current one. */
  longestGapHours: number | null;
  /** Dirty entries per local day, oldest first — the chart's columns. */
  dirtyByDay: number[];
  /** Wet entries per local day, oldest first. BOTH counts in each. */
  wetByDay: number[];
  /** Local days in the window with a diaper logged but no dirty one. */
  daysWithoutDirty: number;
  dirty: number;
  wet: number;
  dirtyPerDay: number;
  /** Enough dirty entries to have gaps worth a median: three entries make two gaps. */
  hasOwnPattern: boolean;
  /**
   * The current gap is longer than every gap this household has logged. THE FLAG — and it is a
   * comparison of this baby to this baby, which is the only comparison this app makes.
   */
  beyondOwnLongest: boolean;
}

const EMPTY: StoolPattern = {
  engaged: false,
  diapersLogged: 0,
  loggedDays: 0,
  lastDiaperMs: null,
  lastDirtyMs: null,
  hoursSinceDirty: null,
  daysSinceDirty: null,
  confident: false,
  todayHasDirty: false,
  gapsHours: [],
  medianGapHours: null,
  longestGapHours: null,
  dirtyByDay: [],
  wetByDay: [],
  daysWithoutDirty: 0,
  dirty: 0,
  wet: 0,
  dirtyPerDay: 0,
  hasOwnPattern: false,
  beyondOwnLongest: false,
};

const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const lo = s[mid - 1];
  const hi = s[mid];
  if (hi === undefined) return null;
  return s.length % 2 === 1 ? hi : ((lo ?? hi) + hi) / 2;
};

/**
 * @param rows  every activity the caller loaded for the window, already privacy-filtered.
 * @param buckets one `DayBounds` per local day of the window, oldest first.
 * @param nowMs the clock, passed in — this package never reads the device's.
 */
export function stoolPattern(
  rows: readonly TodayActivity[],
  buckets: readonly DayBounds[],
  nowMs: number,
): StoolPattern {
  const diapers = rows
    .filter(r => r.type === 'diaper')
    .slice()
    .sort((a, b) => a.startMs - b.startMs);
  if (diapers.length === 0) return EMPTY;

  const dirties = diapers.filter(d => isDirty(d.diaperKind));

  const dirtyByDay: number[] = [];
  const wetByDay: number[] = [];
  let loggedDays = 0;
  let daysWithoutDirty = 0;
  for (const day of buckets) {
    let d = 0;
    let w = 0;
    let any = 0;
    for (const r of diapers) {
      if (r.startMs < day.startMs || r.startMs >= day.endMs) continue;
      any += 1;
      if (isDirty(r.diaperKind)) d += 1;
      if (isWet(r.diaperKind)) w += 1;
    }
    dirtyByDay.push(d);
    wetByDay.push(w);
    if (any > 0) {
      loggedDays += 1;
      // a day with diapers logged and no dirty one is a real zero; a day with nothing logged is
      // not a zero at all, and counting it as one would invent an absence out of a quiet day
      if (d === 0) daysWithoutDirty += 1;
    }
  }

  const engaged = diapers.length >= ENGAGED_MIN_ENTRIES && loggedDays >= ENGAGED_MIN_DAYS;
  const lastDiaper = diapers[diapers.length - 1];
  const lastDiaperMs = lastDiaper === undefined ? null : lastDiaper.startMs;
  const lastDirty = dirties[dirties.length - 1];
  const lastDirtyMs = lastDirty === undefined ? null : lastDirty.startMs;

  const gapsHours: number[] = [];
  for (let i = 1; i < dirties.length; i += 1) {
    const prev = dirties[i - 1];
    const cur = dirties[i];
    if (prev === undefined || cur === undefined) continue;
    gapsHours.push((cur.startMs - prev.startMs) / HOUR);
  }
  const longestGapHours = gapsHours.length > 0 ? Math.max(...gapsHours) : null;

  const sinceMs = lastDirtyMs === null ? null : Math.max(0, nowMs - lastDirtyMs);
  const hoursSinceDirty = sinceMs === null ? null : Math.floor(sinceMs / HOUR);
  const daysSinceDirty = sinceMs === null ? null : Math.floor(sinceMs / DAY);

  const confident = lastDiaperMs !== null && nowMs - lastDiaperMs <= CONFIDENT_WITHIN_HOURS * HOUR;

  const today = buckets[buckets.length - 1];
  const todayHasDirty =
    today !== undefined && dirties.some(d => d.startMs >= today.startMs && d.startMs < today.endMs);

  const days = Math.max(1, buckets.length);
  const currentGapHours = sinceMs === null ? null : sinceMs / HOUR;

  return {
    engaged,
    diapersLogged: diapers.length,
    loggedDays,
    lastDiaperMs,
    lastDirtyMs,
    hoursSinceDirty,
    daysSinceDirty,
    confident,
    todayHasDirty,
    gapsHours,
    medianGapHours: median(gapsHours),
    longestGapHours,
    dirtyByDay,
    wetByDay,
    daysWithoutDirty,
    dirty: dirties.length,
    wet: diapers.filter(d => isWet(d.diaperKind)).length,
    dirtyPerDay: dirties.length / days,
    hasOwnPattern: gapsHours.length >= 2,
    beyondOwnLongest:
      confident &&
      gapsHours.length >= 2 &&
      longestGapHours !== null &&
      currentGapHours !== null &&
      currentGapHours > longestGapHours,
  };
}
