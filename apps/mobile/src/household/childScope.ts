/**
 * WHICH OF THE HOUSEHOLD'S ROWS ONE CHILD'S VIEW MAY SEE — as a pure function, in its own file.
 *
 * Its own file because the node suite cannot parse anything that reaches React Native, and the
 * hook that uses this (`sheets/quick/useRunningTimers`) reaches it through `ChildContext`. The
 * rule is small and it is the rule three bugs broke, so it is worth being able to test on its own.
 *
 * `null` means the both view: everything. A concrete child means that child's rows plus the
 * household's own (`child_id is null` — a pump belongs to the household, not to a baby), which is
 * the same rule `childScope` applies in SQL in `db/queries/today.ts`.
 */
import type { TimerNow } from '../db/queries/today';

export function childScopedTimers(rows: readonly TimerNow[], childId: string | null): TimerNow[] {
  if (childId === null) return rows as TimerNow[];
  return rows.filter(r => r.childId === childId || r.childId === null);
}

/** Just enough of the child selection to pin it (`ChildContext`'s value satisfies it). */
export interface ChildSelection<C extends { id: string }> {
  children: readonly C[];
  /** A child's id, `both`, or null with no children. */
  selectedId: string | null;
  child: C | null;
  isAll: boolean;
}

/**
 * THE SELECTION WITH ONE BABY IN VIEW — for a surface that always draws one baby, whatever the chip
 * says: the widgets (docs/MULTIPLES.md §6: "The widget picks one child"). The baby in view stays in
 * view; on Both it is the first, as the widget has always NAMED the first (`useWidgetBuild`).
 *
 * WHY IT IS PINNED RATHER THAN NAMED (the pre-launch sweep, 2026-09-27). Every read the widget makes
 * — Today's totals and last entries, the running timers, Up next — follows the selection. On Both
 * they were every baby's, under the first baby's name: "Emma · Last feed 1:45 PM · 3 oz" was Liam's
 * bottle, and Liam's nap was "Emma is asleep" on the lock screen. With the selection pinned to the
 * one child the widget names, everything under the name is that child's (and the household's own,
 * a pump), exactly as when the app is on that child.
 *
 * Nothing else changes: the same children, and a selection that is already one child — or no child
 * at all — is handed back as it is.
 */
export function oneChildInView<C extends { id: string }, V extends ChildSelection<C>>(v: V): V {
  if (!v.isAll) return v;
  const one = v.children[0];
  if (one === undefined) return v;
  return { ...v, selectedId: one.id, child: one, isAll: false };
}
