/**
 * The few date words the stash's reason lines need (docs/MILK_STASH.md §6b), in the
 * household's zone. Kept in core, without the UI package's `formatClock`, so the ranking
 * stays testable in node; the app's own formatter agrees with these on the same inputs.
 */
const cache = new Map<string, Intl.DateTimeFormat>();

/** Node 20+ puts U+202F before AM/PM; a plain space is what every font and test expects. */
const NARROW_NBSP = new RegExp(String.fromCharCode(0x202f), 'g');

function fmt(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const hit = cache.get(key);
  if (hit) return hit;
  const f = new Intl.DateTimeFormat('en-US', options);
  cache.set(key, f);
  return f;
}

/** `10:42 AM`, or `10:42` on a 24-hour clock. */
export function clockText(ms: number, timeZone: string, clock24: boolean): string {
  return fmt(`clock|${timeZone}|${clock24 ? 24 : 12}`, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: !clock24,
    timeZone,
  })
    .format(new Date(ms))
    .replace(NARROW_NBSP, ' ');
}

/** `Jun 12` */
export function dayText(ms: number, timeZone: string): string {
  return fmt(`day|${timeZone}`, { month: 'short', day: 'numeric', timeZone }).format(new Date(ms));
}

/** `Tue` */
function weekdayText(ms: number, timeZone: string): string {
  return fmt(`wd|${timeZone}`, { weekday: 'short', timeZone }).format(new Date(ms));
}

/** `pumped Tue` inside the last six days, `pumped Sep 9` beyond them. */
export function recentDayText(ms: number, nowMs: number, timeZone: string): string {
  const SIX_DAYS = 6 * 24 * 60 * 60_000;
  return nowMs - ms < SIX_DAYS && nowMs >= ms ? weekdayText(ms, timeZone) : dayText(ms, timeZone);
}

/** `2 days left`, `1 day left`, `use today`, `past best use`. */
export function daysLeftText(days: number): string {
  if (days < 0) return 'past best use';
  if (days === 0) return 'use today';
  return days === 1 ? '1 day left' : `${days} days left`;
}
