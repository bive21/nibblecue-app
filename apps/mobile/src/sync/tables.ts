/**
 * WHAT IS PULLED, in what order, and with what page size — one data table the pull engine and
 * its tests both iterate (`docs/OFFLINE_SYNC.md` §4, WP4 D17).
 *
 * It is data rather than a switch for two reasons. A switch cannot be iterated, so no test can
 * ask "is every mirrored table pulled by something", and a switch hides the phase ordering that
 * the initial sync is entirely about. Everything below is checked against `PULL_STRATEGY` in
 * `../db/schema.ts` by `tables.test.ts`, which is the same map `app.sync_pull_strategy`
 * (`supabase/migrations/0010_add_sync_pull.sql`) is compared against by
 * `packages/db/src/integration/sync-pull.test.ts`. Three copies, two tests, no drift.
 *
 * ── THE PHASE IS A TABLE PRIORITY, NOT A ROW WINDOW ──────────────────────────────────────────
 *
 * `docs/OFFLINE_SYNC.md` §4 and `docs/plans/WP4.md` describe the three initial-sync phases with
 * row windows inside them: *recent* is "activities + details for the last 14 days" and
 * "`milk_containers` with `status='STORED'`", *bootstrap* is "today's `schedule_instances`", and
 * *backfill* is "the REMAINING history". Shipped `public.sync_pull` cannot express any of that,
 * and the code is the fact:
 *
 *   * its only per-table inputs are `since`, `since_id` and `limit` — there is no date window,
 *     no status filter and no direction flag (`0010:377-407`);
 *   * a keyset cursor walks OLDEST to NEWEST, so a first sync's first page is the oldest 500
 *     activities, not the newest — "pages from newest to oldest" is not reachable from here;
 *   * a response is keyed by table NAME (`PullResponse.tables` is a record), so one table cannot
 *     appear twice in one request with two windows, which is what "recent activities" plus "the
 *     rest of activities" would need.
 *
 * So `phase` here means what a client can actually honor: **which tables are asked for first**.
 * Bootstrap tables are pulled and awaited before Today paints; recent tables follow in the
 * background; backfill tables come last and are the ones whose completion drives the Reports
 * note. The row windows are recorded as a gap in `docs/reports/WP4.md` rather than faked by a
 * client-side filter that would leave the cursor claiming rows it never stored.
 *
 * ── SCOPE ────────────────────────────────────────────────────────────────────────────────────
 *
 * `scope` exists for one reason: a `full` page replaces a local set, and the replace has to
 * delete exactly the rows the page could have contained (D18). The plan's union is
 * `'household' | 'user'`; a third value is needed because `milk_guidance_profiles` is published
 * reference data with **no `household_id` column at all** — not in the mirror (`../db/schema.ts`)
 * and not in `0010`'s branch for it, which is a bare `select … from milk_guidance_profiles`.
 * Labelling it `'household'` would emit `delete … where household_id = ?` against a table with
 * no such column: a widened union is tighter than a predicate that cannot run.
 */
import { PAGE_SIZES, type PullPhase, type PullScope, type PullStrategy } from '@nibblecue/core';
import { PULL_STRATEGY } from '../db/schema';

/** The pass names and the replace scope live beside the cursor and the apply, in core. */
export { PULL_PHASES } from '@nibblecue/core';
export type { PullPhase, PullScope } from '@nibblecue/core';

export interface PullTable {
  name: PullTableName;
  strategy: PullStrategy;
  /** Rows per page. Ignored by `full` and `user_window`, which are one unpaged snapshot. */
  page: number;
  phase: PullPhase;
  scope: PullScope;
}

/** Every table `PULL_STRATEGY` names — the eight detail tables travel inside their activity. */
export type PullTableName = keyof typeof PULL_STRATEGY;

/** `PAGE_SIZES` where the table has one, 500 otherwise — the same default `app.sync_pull_limit`
 *  falls through to, so a client and a server never disagree about the cap. */
const page = (name: PullTableName): number =>
  name in PAGE_SIZES ? PAGE_SIZES[name as keyof typeof PAGE_SIZES] : 500;

const entry = (
  name: PullTableName,
  phase: PullPhase,
  scope: PullScope = 'household',
): PullTable => ({ name, strategy: PULL_STRATEGY[name], page: page(name), phase, scope });

/**
 * The table, in the order a pass walks it. Within a phase the order is the apply order's
 * order — parents before the rows that point at them — so a single pass never has to hold a
 * page back: children before activities, containers before the ledger, rules before instances.
 */
export const PULL_TABLES: readonly PullTable[] = [
  /*
    NIBBLECUE PULLS WHAT IT READS, AND NOTHING ELSE (2026-10-08). CuddleCue's engine pulls every
    table its screens show; NibbleCue shows the family, the meals, the milk and diaper entries it
    reads, the shared shopping list and its own records, so a phone holding NibbleCue keeps a
    fraction of the household's rows (bpnc-studio: "light and fast on older phones"). The engine
    is CuddleCue's; only this list is NibbleCue's.
  */
  // ── bootstrap: everything Today needs to paint ─────────────────────────────────────────────
  entry('profiles', 'bootstrap'),
  entry('households', 'bootstrap'),
  entry('household_members', 'bootstrap'),
  entry('children', 'bootstrap'),
  entry('module_settings', 'bootstrap'),
  // the household's milk unit (0128), which the milk view reads its amounts in
  entry('household_settings', 'bootstrap'),
  // who's on: a family switch asks about it before it leaves (`household/switchDuty.ts`)
  entry('household_duty', 'bootstrap'),
  // the baby's food profile, custom foods, what was noticed and the plan's pins (docs/SERVER.md)
  entry('nibble_records', 'bootstrap'),
  // the shopping list both apps share, and the catalog behind it
  entry('shopping_items', 'bootstrap'),
  entry('supply_items', 'bootstrap'),
  // ── recent: the log itself (meals, milk, diapers, health notes) ────────────────────────────
  entry('activities', 'recent'),
];

/** The tables of one phase, in table order. */
export function tablesOfPhase(phase: PullPhase): readonly PullTable[] {
  return PULL_TABLES.filter(t => t.phase === phase);
}

/** One table by name, or `undefined` for a name this build does not pull. */
export function pullTable(name: string): PullTable | undefined {
  return PULL_TABLES.find(t => t.name === name);
}

/**
 * How long the blocking phase may hold the first paint (`docs/OFFLINE_SYNC.md` §4: "Bootstrap
 * (blocking, < 2 s)"). It is a budget, not a timeout: a request already in flight is awaited —
 * cancelling it would waste the page and leave the cursor where it was — but once the budget is
 * spent no further table is asked for, and the rest resume on the next pass.
 */
export const BOOTSTRAP_BUDGET_MS = 2_000;
