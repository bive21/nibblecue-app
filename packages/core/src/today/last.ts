/**
 * LAST and the QUICK tiles' elapsed line (PRODUCT_SPEC.md §3.3, §3.4; docs/plans/WP5.md D4).
 *
 * The 2×2 grid answers the question a caregiver taking over actually asks — when was the
 * last bottle, the last diaper, how long did she sleep — so every cell is the newest entry
 * of its type regardless of which day it lands on. A household that logs nothing overnight
 * still sees last night's bottle at 6 a.m., not an empty box.
 *
 * The one trap: a DRY diaper IS the last diaper even though it is excluded from the day's
 * diaper COUNT. The two rules live in different files and neither should reach into the
 * other; `totals.ts` drops DRY, this file keeps it, and both are tested for the same row.
 */
import type { ActivityType } from '../domain/domain-types';
import type { ActiveTimer, TodayActivity } from './rows';
import { countsAsMilk } from './totals';

/** The newest entry of each type present, keyed by type. */
export type LastByModule = Partial<Record<ActivityType, TodayActivity>>;

/**
 * WHEN AN ENTRY LAST HAPPENED: its end, when it has one after its start; its start otherwise — a
 * bottle, a diaper, a sleep with no end yet.
 *
 * THIS, NOT THE START, IS WHAT MAKES AN ENTRY THE LAST ONE (the owner, 2026-09-26: "i added 2 min
 * left 2 min right, but it keeps showing as 'Now · 0m' … only when it is added with the timer
 * starting (start now), it works"). An entry typed in afterwards is written from its END back —
 * "Already finished" at 10:00:40 with 2 + 2 minutes STARTS at 9:56:40 — so ranked by start it sat
 * behind anything begun after 9:56:40, even something that was over before it: a feed started and
 * finished at 10:00 by mistake (the tile's "Now · 0m") hid the four minutes the parent had just
 * saved, however many times they saved them. The row was right and in the Log all along; the
 * READER picked the other one. Ranked by when each one ended, the feed just typed in is the last
 * feed, and nothing written is touched to make it so — the old rows read right as they stand.
 *
 * Entries of one kind that do not overlap rank the same either way, so every ordinary day reads
 * exactly as it did; only an overlap — a mistap, a feed typed in over a timed one — changes hands.
 * The elapsed a tile shows is still counted from the START of the entry chosen (`lastAtFor`).
 */
export function recencyMs(r: Pick<TodayActivity, 'startMs' | 'endMs'>): number {
  return r.endMs !== null && r.endMs > r.startMs ? r.endMs : r.startMs;
}

/**
 * Latest first by `recencyMs`, then by start, then by id — the same stable tie-break as
 * `newestFirst`, so two entries that end at one instant never swap between renders.
 */
export function latestFirst<T extends Pick<TodayActivity, 'startMs' | 'endMs' | 'id'>>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(
    (a, b) =>
      recencyMs(b) - recencyMs(a) ||
      b.startMs - a.startMs ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
}

/**
 * Rows should already be visibility-filtered and scoped to the selected child (plus the
 * household-scoped rows, which is how pump shows up on a child's Today).
 *
 * THE LAST BOTTLE IS THE LAST BOTTLE OF MILK (the feeding audit's M7). Everything that reads
 * `bottle` here asks when the baby was last FED — the feeding tiles, their "due", the widget's
 * Last feed — and water is not a feed (`countsAsFeed`). The water bottle stays in the log.
 *
 * THE LAST ONE IS THE ONE THAT HAPPENED LAST (`recencyMs`): a feed typed in afterwards is the
 * last feed even though a mistapped timer started a moment after its start.
 */
export function lastByModule(rows: readonly TodayActivity[]): LastByModule {
  const out: LastByModule = {};
  for (const r of latestFirst(rows)) {
    if (r.type === 'bottle' && !countsAsMilk(r)) continue;
    // latestFirst means the first one seen for a type is the one that happened last
    if (out[r.type] === undefined) out[r.type] = r;
  }
  return out;
}

/**
 * What a QUICK tile shows under its label: the elapsed since that module's last entry, or
 * that a timer is running for it.
 *
 * Returns `null` for "running", which the caller renders as the RUNNING constant — this
 * function stays free of copy so the same arithmetic can serve a widget with less room.
 */
export function lastAtFor(
  type: ActivityType,
  last: LastByModule,
  running: readonly ActiveTimer[],
): { runningSince: number } | { lastAtMs: number } | null {
  const timer = running.find(t => t.type === type);
  if (timer) return { runningSince: timer.startedAtMs };
  const row = last[type];
  if (!row) return null;
  // THE START, for every activity (the owner, 2026-09-16: "use the start time for the
  // calculation"). A pump from 8:50 to 9:25 logged the moment it ended read "Now" — true of the
  // tap and useless about the pump — where "35m" is the fact a parent is actually looking for.
  // The same instant anchors the schedule (`intervalAnchor`), so the tile and the next slot
  // cannot disagree; the END is still what a timeline row says a baby WOKE at. WHICH entry is the
  // last one is `recencyMs`'s question (above) and differs from the start's answer only where two
  // entries of the kind overlap; the elapsed is this entry's start either way.
  return { lastAtMs: row.startMs };
}
