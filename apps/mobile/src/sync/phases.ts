/**
 * The three initial-sync phases, and the marker that says when the last of them has finished
 * (`docs/OFFLINE_SYNC.md` §4's "Initial sync strategy").
 *
 *   1. **bootstrap** - blocking, budgeted at two seconds: profiles, households,
 *      household_members, children, module_settings, storage_locations, the entitlement,
 *      running timers and the schedule. Today is usable the moment it returns.
 *   2. **recent** - background: the log itself, the stash's containers, the caller's reminders.
 *   3. **backfill** - background, lowest priority: history, the ledger, the settings nothing on
 *      Today reads. Reports shows "Still loading older entries" until it drains.
 *
 * WHAT A PHASE IS, GIVEN THE SERVER WE HAVE. It is the ORDER TABLES ARE ASKED FOR, not a row
 * window inside a table - `./tables.ts` explains why at length, and the short version is that
 * shipped `public.sync_pull` takes `since`, `since_id` and `limit` and nothing else, keys its
 * response by table name, and walks a keyset oldest-first. "Activities for the last 14 days,
 * then the rest, newest first" is three things that RPC cannot express, and a client-side
 * filter pretending otherwise would advance a cursor over rows it never stored.
 *
 * WHY BOOTSTRAP IS AWAITED AND THE OTHER TWO ARE NOT. `runInitialSync` returns when bootstrap
 * has returned; `runBackground` is what a caller lets run behind the first paint. A caller that
 * simply wants "everything, in order" calls `runAllPhases`. The engine is re-entrant-safe by
 * construction - each pass reads the cursors it needs at the start - so a background phase
 * overlapping the next tick costs one repeated page, not a lost row.
 */
import type { Db } from '../db/driver';
import { isDrained, readCursor } from './cursors';
import { emptyOutcome, mergeOutcomes, type PullEngine, type PullOutcome } from './pull';
import { BOOTSTRAP_BUDGET_MS, PULL_PHASES, tablesOfPhase, type PullPhase } from './tables';

export interface PhaseOptions {
  /** Defaults to `BOOTSTRAP_BUDGET_MS`. Bounds only the blocking phase. */
  bootstrapBudgetMs?: number | undefined;
}

/** One phase, with the bootstrap budget applied to the blocking one. */
export function runPhase(
  engine: PullEngine,
  phase: PullPhase,
  options: PhaseOptions = {},
): Promise<PullOutcome> {
  const budget =
    phase === 'bootstrap' ? (options.bootstrapBudgetMs ?? BOOTSTRAP_BUDGET_MS) : undefined;
  return engine.run(tablesOfPhase(phase), phase, budget);
}

/**
 * The blocking phase alone: what a first launch awaits before it paints Today.
 *
 * It is not a full sync and is not meant to be. A household with six months of history is still
 * loading when this resolves, and the note that says so is `pullProgress`.
 */
export function runInitialSync(
  engine: PullEngine,
  options: PhaseOptions = {},
): Promise<PullOutcome> {
  return runPhase(engine, 'bootstrap', options);
}

/** The two background phases, in order. Nothing waits on this. */
export async function runBackground(engine: PullEngine): Promise<PullOutcome> {
  let total = emptyOutcome();
  for (const phase of PULL_PHASES) {
    if (phase === 'bootstrap') continue;
    const outcome = await runPhase(engine, phase);
    total = mergeOutcomes(total, outcome);
    if (stopsThePass(outcome)) break;
  }
  return total;
}

/**
 * Every phase, in order - an ordinary refresh, where nothing is painting behind it and the
 * whole pass is one answer.
 *
 * A phase that could not reach the server, or one whose household refused the call, ends the
 * pass: the phases behind it would ask the same unreachable server the same question, and a
 * `CC403` has already handed the household to the account read (`auth/mirror.ts`) — twelve more
 * requests the server will refuse the same way would only race whatever that read decides.
 */
export async function runAllPhases(
  engine: PullEngine,
  options: PhaseOptions = {},
): Promise<PullOutcome> {
  let total = emptyOutcome();
  for (const phase of PULL_PHASES) {
    const outcome = await runPhase(engine, phase, options);
    total = mergeOutcomes(total, outcome);
    if (stopsThePass(outcome)) break;
  }
  return total;
}

const stopsThePass = (outcome: PullOutcome): boolean =>
  outcome.stoppedBecause === 'offline' || outcome.stoppedBecause === 'forbidden';

/**
 * The Reports note, exported here because the thing that decides whether to show it is the
 * `backfill_complete` marker below and nothing else should be parsing that column. WP10 renders
 * it. It is a statement of fact about this device, not a warning: a household that has been
 * installed an hour still has every entry a parent has logged today.
 */
export const BACKFILL_NOTE = 'Still loading older entries';

/**
 * What the Reports note reads, without anything outside this module parsing `sync_state.phase`.
 * `pending` is every backfill table that has not drained, so a developer looking at a stuck
 * "Still loading older entries" can see which one it is waiting on.
 */
export async function pullProgress(
  db: Db,
  householdId: string,
): Promise<{ backfillComplete: boolean; pending: string[] }> {
  const pending: string[] = [];
  for (const table of tablesOfPhase('backfill')) {
    const state = await readCursor(db, householdId, table.name);
    if (!isDrained(state.phase)) pending.push(table.name);
  }
  return { backfillComplete: pending.length === 0, pending };
}

/** Whether a phase has drained on this device - every one of its tables marked complete. */
export async function phaseComplete(
  db: Db,
  householdId: string,
  phase: PullPhase,
): Promise<boolean> {
  for (const table of tablesOfPhase(phase)) {
    const state = await readCursor(db, householdId, table.name);
    if (!isDrained(state.phase)) return false;
  }
  return true;
}
