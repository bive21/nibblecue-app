/**
 * Writing a pulled page into the mirror. The engine — one idempotent apply per strategy, the
 * conflict count, the scoped replace, the append-only ledger — lives in `@nibblecue/core` since
 * 2026-09-23 (`packages/core/src/sync/local/apply.ts`, which carries the reasoning), so the
 * round-trip test in `packages/db` runs it against the real `sync_pull`.
 *
 * What stays here is the app's own business: which of its screen caches a pulled row touches.
 * Every apply below hands `invalidationKeys` to the engine, so a caller gets the same
 * `ApplyOutcome.keys` it always did.
 */
import {
  applyAppend as applyAppendRows,
  applyDelta as applyDeltaRows,
  applyFull as applyFullRows,
  type ActivityType,
  type ApplyContext as EngineContext,
  type ApplyOutcome,
  type PullScope,
  type PullStrategy,
  type ServerRow,
  type SqlTx,
} from '@nibblecue/core';
import { keys } from '../data/store';

export { APPLY_ORDER, inApplyOrder, resetColumnCache } from '@nibblecue/core';
export type { ApplyOutcome, ServerRow } from '@nibblecue/core';

/** The engine's context without the cache hook, which this module fills in itself. */
export type ApplyContext = Omit<EngineContext, 'keysFor'>;

const withKeys = (ctx: ApplyContext): EngineContext => ({
  ...ctx,
  keysFor: (table, row) => invalidationKeys(table, row, ctx),
});

export const applyDelta = (
  t: SqlTx,
  table: string,
  rows: readonly ServerRow[],
  ctx: ApplyContext,
  strategy?: PullStrategy,
): Promise<ApplyOutcome> => applyDeltaRows(t, table, rows, withKeys(ctx), strategy);

export const applyFull = (
  t: SqlTx,
  table: string,
  rows: readonly ServerRow[],
  ctx: ApplyContext,
  scope: PullScope,
  strategy?: PullStrategy,
): Promise<ApplyOutcome> => applyFullRows(t, table, rows, withKeys(ctx), scope, strategy);

export const applyAppend = (
  t: SqlTx,
  table: string,
  rows: readonly ServerRow[],
  ctx: ApplyContext,
): Promise<ApplyOutcome> => applyAppendRows(t, table, rows, withKeys(ctx));

/* ------------------------------------------------------------------ invalidation */

/**
 * `docs/ARCHITECTURE.md` §4's cache keys for one pulled row. Deliberately not
 * `../data/store.ts`'s `activityKeys`, which also bumps `keys.outbox()`: a pull changes what
 * the server holds, never what this device still owes, and waking the sync chip on every
 * applied row would make it re-read the queue five hundred times for one page.
 */
export function invalidationKeys(table: string, row: ServerRow, ctx: ApplyContext): string[] {
  const h = ctx.householdId;
  const child = typeof row['child_id'] === 'string' ? row['child_id'] : null;
  switch (table) {
    case 'activities': {
      // The type is whatever the server sent; `keys` only ever puts it in a string, and a type
      // this build does not know still needs its timeline bumped.
      const type = String(row['type'] ?? '') as ActivityType;
      return [
        keys.timeline(child, 'all'),
        keys.timeline(child, type),
        keys.todayTotals(child),
        keys.lastOf(child, type),
        keys.nextEvent(child),
        keys.reports(child, 7),
        /*
          AND THE VIEWS THAT HOLD EVERY BABY'S ROWS (2026-09-24, found while chasing "solid
          entries does not show up in logs"). A row pulled from the other parent's phone bumped
          its own child's keys and nothing else, so a screen showing "Both" — Today, the log, the
          meal history the solids sheet and the Foods card read — never re-read for it, and a
          screen showing one baby never re-read for a household entry (a pump) it also shows.
          A LOCAL write already bumps the household key (`activityKeys`); a pulled one now does
          too, which is the half of a handoff that happens on the phone that did not log it.

          The keys are collected across the page and fired once after the commit (`pull.ts`), so
          this is one more re-read per page, not per row.
        */
        keys.timeline(null, 'all'),
        keys.household(ctx.householdId),
      ];
    }
    case 'running_timers':
      return [keys.timers(h)];
    case 'milk_containers':
      return [keys.stash(h), keys.container(String(row['id'] ?? ''))];
    case 'milk_inventory_transactions':
      return [keys.stash(h), keys.container(String(row['container_id'] ?? ''))];
    case 'children':
      return [keys.children(h)];
    // NibbleCue's records: the one key every NibbleCue read listens on (`nibble/writes.ts`)
    case 'nibble_records':
      return [`nibble/${h}`];
    case 'module_settings':
      return [keys.modules(h)];
    // the wake/bed pair: every label that says "Nap" or "Night sleep" is computed from it, so
    // the sheets and the intervals page both re-read when the other parent moves bedtime — and
    // the milk unit on the same row (0128), which every amount on every screen is read in
    case 'household_settings':
      return [keys.dayWindow(h), keys.volumeUnit(h)];
    // who's on: the notification planner and every "who's on" line re-read when the other parent
    // takes the night or hands it back
    case 'household_duty':
      return [keys.duty(h)];
    // a person's own levels: the planner watches `prefs(h, user)`, so a pulled row has to bump
    // that key — `household(h)`, which it used to fall through to, is not one the planner reads
    case 'notification_preferences':
      return [keys.prefs(h, String(row['user_id'] ?? ctx.userId)), keys.household(h)];
    case 'subscription_entitlements':
      return [keys.entitlement(String(row['user_id'] ?? ctx.userId))];
    case 'schedule_instances':
      return [keys.scheduleDay(h, String(row['local_date'] ?? '')), keys.nextEvent(child)];
    // `rules`/`phases` too: the schedule and the notification planner watch those, and a rule
    // the other parent changed must move this phone's reminders without waiting for a remount
    case 'schedule_phases':
      return [keys.phases(h), keys.nextEvent(child), keys.household(h)];
    case 'schedule_rules':
      return [keys.rules(h), keys.nextEvent(child), keys.household(h)];
    case 'shopping_items':
      return [keys.shopping(ctx.householdId)];
    case 'household_tasks':
      return [keys.tasks(ctx.householdId)];
    // a catalog edit changes what every line pointing at it reads, so the list re-reads too
    case 'supply_items':
      return [keys.supplies(ctx.householdId), keys.shopping(ctx.householdId)];
    case 'care_items':
      return [keys.careItems(h)];
    default:
      return [keys.household(h)];
  }
}
