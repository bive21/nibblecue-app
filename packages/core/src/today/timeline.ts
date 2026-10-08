/**
 * Timeline grouping (PRODUCT_SPEC.md §4; docs/plans/WP5.md D14).
 *
 * Reverse-chronological, grouped by LOCAL day, with `Today` / `Yesterday` / `Tue Sep 9`
 * headers. The grouping key is the household's day, not the device's, for the same reason
 * the totals are: a parent reading the timeline on a trip should see the entries under the
 * days they actually happened at home.
 *
 * Pagination is by `start_at` cursor rather than offset. An offset page silently shifts when
 * another caregiver logs something while you are scrolling — you would see one row twice and
 * miss another entirely, and neither would look like a bug from the outside.
 */
import { localDayBounds, localDayKey } from './day';
import { newestFirst, type TodayActivity } from './rows';

export interface TimelineGroup {
  /** `yyyy-mm-dd` in the household's zone. */
  dayKey: string;
  /** `Today`, `Yesterday`, or `Tue Sep 9`. */
  heading: string;
  rows: TodayActivity[];
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * The heading for a day, relative to `nowMs`.
 *
 * The weekday is derived from the day's own local noon rather than its midnight: noon is
 * never inside a DST gap in any zone, so it cannot land on the previous date.
 */
export function dayHeading(dayKey: string, nowMs: number, timeZone: string): string {
  if (dayKey === localDayKey(timeZone, nowMs)) return 'Today';

  const today = localDayBounds(timeZone, nowMs);
  // step back a day by walking from today's start, not by subtracting 24h
  const yesterdayKey = localDayKey(timeZone, today.startMs - 12 * 3_600_000);
  if (dayKey === yesterdayKey) return 'Yesterday';

  const [y, m, d] = dayKey.split('-').map(Number);
  if (!y || !m || !d) return dayKey;
  const noonUtc = Date.UTC(y, m - 1, d, 12);
  const weekday = WEEKDAYS[new Date(noonUtc).getUTCDay()];
  return `${weekday} ${MONTHS[m - 1]} ${d}`;
}

/**
 * Group rows into days, newest day first, newest row first within a day.
 *
 * Rows are expected to be already visibility-filtered and already free of soft-deleted
 * entries — a deleted row is gone from the timeline, and `deleted_at` is not this function's
 * business.
 */
export function timelineGroups(
  rows: readonly TodayActivity[],
  nowMs: number,
  timeZone: string,
): TimelineGroup[] {
  const byDay = new Map<string, TodayActivity[]>();
  for (const r of newestFirst(rows)) {
    const key = localDayKey(timeZone, r.startMs);
    const bucket = byDay.get(key);
    if (bucket) bucket.push(r);
    else byDay.set(key, [r]);
  }

  return [...byDay.keys()]
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .map(dayKey => ({
      dayKey,
      heading: dayHeading(dayKey, nowMs, timeZone),
      rows: byDay.get(dayKey) ?? [],
    }));
}

/** How many rows a timeline page holds (D14). */
export const TIMELINE_PAGE = 60;

/**
 * The cursor for the next page: the oldest `start_at` on this page.
 *
 * Returns null when the page came back short, which is how the caller knows it has reached
 * the end without a second round trip.
 */
export function nextCursor(page: readonly TodayActivity[]): number | null {
  if (page.length < TIMELINE_PAGE) return null;
  const last = page[page.length - 1];
  return last ? last.startMs : null;
}
