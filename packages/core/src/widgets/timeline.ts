/**
 * THE TIMELINE: the snapshot, and when it changes on its own.
 *
 * WidgetKit renders a list of dated entries with no app running, so everything that changes
 * at a KNOWN moment is written ahead as an entry rather than waited for: an Up next row passing
 * its time (the row turns "Due now" and the lock-screen line changes), and the snapshot going
 * stale two hours after it was written. Everything that changes CONTINUOUSLY — "asleep 1 h 12 m",
 * the running timer — is not here at all: the widget hands the OS a timestamp and the OS draws
 * the minutes (docs/WIDGETS.md §8). No entry is ever needed for a clock to be right.
 *
 * The app rewrites the whole timeline on every change (useWidgetSnapshot.ts), so these entries
 * are the widget's behavior BETWEEN app runs, never its freshness mechanism.
 */
import { blankSnapshot, type WidgetSnapshot } from './snapshot';

export interface WidgetTimelineEntry<P = WidgetSnapshot> {
  atMs: number;
  props: P;
}

/** At most this many entries: iOS keeps a timeline small, and after the stale mark nothing moves. */
export const WIDGET_TIMELINE_MAX = 8;

/**
 * `blankAtMs`: WHEN PLUS IS KNOWN TO END (the owner's widget handoff, 2026-10-07). A widget is a
 * Plus feature, and WidgetKit shows a written-ahead entry with no app running, so a plan with a
 * known last moment — the 14-day preview, a trial, a subscription cancelled at its period's end —
 * has an entry at that moment with nothing in it, and nothing after it. `now >= blankAtMs` is
 * already past it: the timeline is that one blank entry. A plan that renews has no such moment
 * (null), and the app republishes when the server says it ended.
 */
export function widgetTimeline(
  s: WidgetSnapshot,
  nowMs: number,
  blankAtMs: number | null = null,
): WidgetTimelineEntry[] {
  if (s.blank || (blankAtMs !== null && blankAtMs <= nowMs))
    return [{ atMs: nowMs, props: blankSnapshot(s) }];
  const staleAt = s.writtenAtMs + s.staleAfterMs;
  const end = blankAtMs ?? Number.POSITIVE_INFINITY;
  // the moments a row becomes due, in order, after now and before the snapshot is stale
  const flips = [...new Set(s.next.map(r => r.atMs))]
    .filter(t => t > nowMs && t < staleAt && t < end)
    .sort((a, b) => a - b);
  const at = (t: number): WidgetSnapshot => ({
    ...s,
    next: s.next.map(r => ({ ...r, due: r.atMs <= t })),
  });
  const entries: WidgetTimelineEntry[] = [{ atMs: nowMs, props: at(nowMs) }];
  for (const t of flips.slice(0, WIDGET_TIMELINE_MAX - 3)) entries.push({ atMs: t, props: at(t) });
  if (staleAt < end) entries.push({ atMs: staleAt, props: { ...at(staleAt), stale: true } });
  if (blankAtMs !== null) entries.push({ atMs: blankAtMs, props: blankSnapshot(s) });
  return entries;
}
