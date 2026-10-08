/**
 * THE HOUSEHOLD'S FIRST DAY RUNS FROM MIDNIGHT, AND WHAT CAME BEFORE THE HOUSEHOLD IS SKIPPED
 * (the owner, 2026-09-25, asked whether the first day should count from midnight like every other
 * day or keep starting fifteen minutes after setup: *"It should still show from midnight in case
 * if user wants to 'fix' the schedule or update it with their actual time. … I think it should be
 * skipped, since user can 'fix' it with actual time"*).
 *
 * So a rule the household STARTED WITH lays its first day out exactly as it lays out any day with
 * nothing logged — the grid from midnight, the same slots the parent sees the next morning — and
 * every slot on it whose time is before the household existed is SKIPPED, not MISSED: the app was
 * not in the parent's hands then, so nothing was missed. That skip is DERIVED (`beforeStart` on the
 * occurrence): the engine works it out every time it runs, it is never stored, never pushed, never
 * an outbox op and never a reminder. And it stays answerable — an entry logged with its real time
 * inside such a slot's window closes it exactly as it closes any slot, and an interval re-anchors
 * from that entry as it always does. That is the "fix it" the owner asked for.
 *
 * This replaces, for the rules a household starts with, the fifteen-minutes-after-signup first
 * slot (`FIRST_SLOT_MS`, 2026-09-21), which a later rule still gets (`interval.ts`).
 */
import { dayStartOf } from './time';
import { MIN, type EngineContext, type Rule } from './types';

/**
 * HOW LONG AFTER THE HOUSEHOLD BEGAN A RULE CAN BE WRITTEN AND STILL BE ONE IT STARTED WITH.
 *
 * Setup's rhythms are not part of the household's creation: they are ordinary local-first writes,
 * drained by `SetupSeeder` once the navigator mounts behind the welcome window, so their
 * `effective_from` is the phone's clock a few seconds — or, with the welcome window left open, a
 * few minutes — after `households.created_at`, which is the server's. Half an hour covers that
 * wait and ordinary clock skew between the two, and it is still one sitting: the parent finishing
 * setup, or changing a rhythm in the first minutes, is setting up. A rule written later than this
 * — a new rhythm that afternoon, or on any later day — was written into a household that already
 * had a day going, and keeps the rule it always had: nothing before it was written is a slot, and
 * an interval's first slot is fifteen minutes in (`FIRST_SLOT_MS`).
 *
 * THIS IS THE LINE TO WIDEN if the owner wants a household's whole first day treated as setup.
 * Widening it is safe in one direction: a rule inside it is judged from the household's start, so
 * a later slot of a rule written inside the margin can go DUE or MISSED like any other — it is a
 * slot of a day the household was already keeping.
 */
export const STARTED_WITH_MS = 30 * MIN;

/**
 * WHEN THE HOUSEHOLD BEGAN — `ctx.trackingFromMs`, `households.created_at` — when `rule` is one it
 * started with; null for a rule written later, and for every rule when the caller does not know
 * when the household began (an older caller, a snapshot without it), which keeps the behavior
 * such a caller always had.
 */
export function householdStartFor(
  rule: Pick<Rule, 'effectiveFromMs'>,
  ctx: Pick<EngineContext, 'trackingFromMs'>,
): number | null {
  const began = ctx.trackingFromMs;
  if (began === undefined || !Number.isFinite(began)) return null;
  return rule.effectiveFromMs <= began + STARTED_WITH_MS ? began : null;
}

/**
 * THE FIRST INSTANT A SLOT OF THIS RULE CAN EXIST AT ALL.
 *
 * A rule written later: its own `effective_from` — a rule created at 4 p.m. did not miss the
 * morning (2026-09-17), and `scheduleDay` drops anything before it. A rule the household started
 * with: midnight of the household's first day, so that day is laid out whole and the part before
 * the household is there to be skipped — and fixed.
 */
export function slotsBeginAt(
  rule: Pick<Rule, 'effectiveFromMs'>,
  ctx: Pick<EngineContext, 'trackingFromMs' | 'timeZone'>,
): number {
  const began = householdStartFor(rule, ctx);
  return began === null ? rule.effectiveFromMs : dayStartOf(ctx.timeZone, began);
}

/**
 * Whether a slot at `atMs` fell before the household existed — and so, left unanswered, is a
 * derived skip (`Occurrence.beforeStart`) rather than a miss, a due slot or a reminder.
 */
export function isBeforeStart(
  rule: Pick<Rule, 'effectiveFromMs'>,
  atMs: number,
  ctx: Pick<EngineContext, 'trackingFromMs'>,
): boolean {
  const began = householdStartFor(rule, ctx);
  return began !== null && atMs < began;
}
