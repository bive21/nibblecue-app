/**
 * The local database: the same table and column names as supabase/migrations, minus the
 * server-only surfaces, plus the local-only tables. Everything is text, integer or real —
 * SQLite has no uuid, timestamptz or jsonb — under the encoding WP4 D31 fixes: `uuid`,
 * `timestamptz`, `date`, `time`, an enum, `jsonb`, `uuid[]` and `int[]` become `text`;
 * `boolean` becomes `integer` 0/1; `int` and `bigint` become `integer`; `numeric` becomes
 * `real`. `remind_user_ids` and `repeat_days` are JSON array text; `at_local_time`,
 * `night_from`, `night_to` and `night_at` are `'HH:MM:SS'` text, the lexical form Postgres
 * returns for `time`.
 *
 * v1 (WP2) mirrored what the accounts flow reads. v2 (WP4) adds the activity, timer, stash
 * and schedule tables, the outbox's `sending_at` column (D11), the household-scoped
 * `sync_state` (D15) and the widget intent queue (D24), under the same `user_version` runner.
 *
 * Two rules this file exists to hold:
 *
 *   * **Exact server column names.** `mirror-parity.test.ts` parses the migrations and pins
 *     every table below against them, so a mirrored column can never be invented, renamed or
 *     typo'd. `docs/MOBILE.md` §7's blanket "every mirrored table keeps `updated_at` and
 *     `deleted_at`" is false against the schema it mirrors — `running_timers` is hard-deleted,
 *     the ledger is append-only, and the eight detail tables have neither — so the rule that
 *     survives is per-table and lives in `PULL_STRATEGY`.
 *   * **No foreign keys**, though `pragma foreign_keys = on` is set in `apps/mobile/src/db/index.ts`. A delta
 *     pull applies pages per table in whatever order they arrive and a detail row can reach
 *     the device before its parent; a declared FK would reject the page and lose the row,
 *     which rule 7 (never lose a log) does not allow. Referential integrity is the server's,
 *     enforced there by the real constraints.
 *
 * Nothing here is deleted per row on sign-out: the whole file goes (docs/ACCOUNTS.md §4
 * step 8).
 *
 * WHY IT LIVES IN CORE (2026-09-23). It moved here from `apps/mobile/src/db/schema.ts`, with the
 * apply engine and the cursor beside it, so that `packages/db`'s round-trip test can build a
 * device's mirror from THIS schema and run the app's own sync code against the real server,
 * instead of a copy that could drift. It is plain SQL text and one runner, with no React
 * Native in it, which is what core allows. The app's `db/schema.ts` re-exports it.
 */
import { DETAIL_TABLES, type PullStrategy } from '../types';

export const LOCAL_DB_NAME = 'nibblecue.db';
export const LOCAL_SCHEMA_VERSION = 22;

const mirrored = (columns: string) => `${columns},
  updated_at text not null,
  deleted_at text`;

/** The v1 outbox, named because the v2 rebuild below has to be able to recreate it. */
const OUTBOX_V1 = `create table if not exists outbox (
  client_op_id text primary key,
  entity text not null,
  op text not null,
  entity_id text not null,
  household_id text not null,
  payload text not null,
  depends_on text,
  seq integer not null,
  created_at text not null,
  state text not null default 'PENDING',
  attempts integer not null default 0,
  next_attempt_at text,
  last_error text
)`;

export const LOCAL_SCHEMA_V1: readonly string[] = [
  `create table if not exists profiles (
  id text primary key,
  display_name text not null,
  email text,
  locale text,
  time_zone text,
  volume_unit text,
  ${mirrored('created_at text')}
)`,
  `create table if not exists households (
  id text primary key,
  name text not null,
  owner_id text not null,
  home_time_zone text,
  welcome_granted_at text,
  welcome_expires_at text,
  ${mirrored('created_at text')}
)`,
  `create table if not exists household_members (
  household_id text not null,
  user_id text not null,
  role text not null,
  joined_at text,
  removed_at text,
  ${mirrored('is_mom integer not null default 0')},
  primary key (household_id, user_id)
)`,
  `create table if not exists children (
  id text primary key,
  household_id text not null,
  name text not null,
  birth_date text not null,
  due_date text,
  sex text,
  preterm_weeks real,
  sort_order integer not null default 0,
  ${mirrored('created_at text')}
)`,
  `create table if not exists module_settings (
  household_id text not null,
  module_id text not null,
  enabled integer not null default 1,
  sort_order integer,
  quick_enabled integer not null default 0,
  quick_position integer,
  updated_by text,
  ${mirrored('created_at text')},
  primary key (household_id, module_id)
)`,
  `create table if not exists subscription_entitlements (
  id text primary key,
  user_id text not null,
  household_id text,
  source text not null,
  status text not null,
  current_period_end text,
  ${mirrored('created_at text')}
)`,
  // docs/OFFLINE_SYNC.md §2 — the shape is the contract; the worker arrives with WP4
  OUTBOX_V1,
  `create index if not exists outbox_ready on outbox (state, next_attempt_at, seq)`,
  `create index if not exists outbox_entity on outbox (entity, entity_id)`,
  `create table if not exists sync_state (
  table_name text primary key,
  cursor_updated_at text,
  last_full_sync_at text,
  page_token text
)`,
  `create table if not exists ui_prefs (
  key text primary key,
  value text not null
)`,
  `create table if not exists dedupe_keys (
  key text primary key,
  at_ms integer not null
)`,
  `create table if not exists snapshot_meta (
  revision integer not null,
  written_at text not null
)`,
];

/**
 * The outbox rebuild. `sending_at` belongs between `next_attempt_at` and `last_error`, and
 * `alter table … add column` can only append, so v2 rebuilds the table and copies every row
 * across. The copy is not ceremony: an outbox row is a log a parent has already written, and
 * rule 7 does not distinguish "queued" from "kept".
 */
const OUTBOX_REBUILD: readonly string[] = [
  // Every step is re-runnable, because `exec` is per statement and the process can be killed
  // between two of them: recreating an empty v1 outbox covers a kill after the drop and before
  // the rename, and `or ignore` covers a kill after the copy. `user_version` is only stamped
  // once all of them have run, so the next launch simply runs them again.
  OUTBOX_V1,
  `create table if not exists outbox_v2 (
  client_op_id text primary key,
  entity text not null,
  op text not null,
  entity_id text not null,
  household_id text not null,
  payload text not null,
  depends_on text,
  seq integer not null,
  created_at text not null,
  state text not null default 'PENDING',
  attempts integer not null default 0,
  next_attempt_at text,
  sending_at text,
  last_error text
)`,
  `insert or ignore into outbox_v2 (client_op_id, entity, op, entity_id, household_id, payload, depends_on, seq, created_at, state, attempts, next_attempt_at, last_error) select client_op_id, entity, op, entity_id, household_id, payload, depends_on, seq, created_at, state, attempts, next_attempt_at, last_error from outbox`,
  `drop table if exists outbox`,
  `alter table outbox_v2 rename to outbox`,
  // dropping the table dropped its indexes with it
  `create index if not exists outbox_ready on outbox (state, next_attempt_at, seq)`,
  `create index if not exists outbox_entity on outbox (entity, entity_id)`,
];

/**
 * The hot paths, mirroring `0001_init.sql`'s indexes on the columns a local read actually
 * filters and orders by. The two unique ones are the local half of idempotency: a replayed
 * chain that has already been written locally fails its insert instead of doubling a feed.
 */
const LOCAL_INDEXES: readonly string[] = [
  `create index if not exists activities_child_time on activities (child_id, start_at desc)`,
  `create index if not exists activities_hh_updated on activities (household_id, updated_at)`,
  `create index if not exists activities_hh_type_time on activities (household_id, type, start_at desc)`,
  `create unique index if not exists activities_client_op on activities (household_id, client_op_id)`,
  `create unique index if not exists milk_txn_client_op on milk_inventory_transactions (household_id, client_op_id)`,
  `create index if not exists milk_txn_container on milk_inventory_transactions (container_id, occurred_at)`,
  `create index if not exists milk_containers_hh_status on milk_containers (household_id, status)`,
  `create index if not exists schedule_instances_hh_date on schedule_instances (household_id, local_date)`,
  `create index if not exists outbox_seq on outbox (seq)`,
];

export const LOCAL_SCHEMA_V2: readonly string[] = [
  ...OUTBOX_REBUILD,
  // D15: keyed by (household_id, table_name), because a user can belong to two households and
  // every pull is household-scoped. Dropped rather than migrated: nothing has ever written a
  // row to the v1 table — it shipped in WP2 as the shape the worker would later need, and the
  // worker arrives in this package.
  `drop table if exists sync_state`,
  `create table if not exists sync_state (
  household_id text not null,
  table_name text not null,
  cursor_updated_at text,
  cursor_id text,
  last_full_sync_at text,
  phase text,
  page_token text,
  primary key (household_id, table_name)
)`,
  // D24: what a widget tap leaves behind for the app to drain. `dedupe_key` and
  // `dedupe_window_ms` travel with the intent so the drain applies the same window the widget
  // showed, and `consumed_at` is set in the same transaction as the write it produced.
  `create table if not exists widget_intents (
  client_op_id text primary key,
  entity_id text not null,
  module text not null,
  op text not null,
  payload text not null,
  child_id text,
  household_id text not null,
  at text not null,
  dedupe_key text not null,
  dedupe_window_ms integer not null,
  widget text not null,
  consumed_at text
)`,
  // ---------------------------------------------------------------- activities
  // `local_synced` is the one local-only column on a mirrored table: 0 while the row is still
  // in the outbox, 1 once the server has it. It feeds TimelineItem's `queued` prop in WP5.
  `create table if not exists activities (
  id text primary key,
  client_op_id text not null,
  household_id text not null,
  child_id text,
  type text not null,
  start_at text not null,
  end_at text,
  quantity real,
  canonical_unit text,
  notes text,
  is_private integer not null default 0,
  metadata text not null default '{}',
  created_by text not null,
  updated_by text,
  device_id text,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  local_synced integer not null default 0
)`,
  `create table if not exists bottle_details (
  activity_id text primary key,
  kind text not null default 'EBM',
  offered_ml integer,
  consumed_ml integer not null,
  from_stash integer not null default 0,
  container_id text
)`,
  `create table if not exists breastfeed_details (
  activity_id text primary key,
  first_side text,
  left_seconds integer not null default 0,
  right_seconds integer not null default 0
)`,
  `create table if not exists pump_details (
  activity_id text primary key,
  sides text not null default 'BOTH',
  left_ml integer,
  right_ml integer,
  total_ml integer not null,
  stored_to_stash integer not null default 0
)`,
  `create table if not exists sleep_details (
  activity_id text primary key,
  kind text not null default 'NAP',
  wake_count integer,
  location text
)`,
  `create table if not exists diaper_details (
  activity_id text primary key,
  kind text not null,
  color text,
  consistency text,
  rash integer not null default 0
)`,
  `create table if not exists solids_details (
  activity_id text primary key,
  meal text,
  food text,
  taken text,
  observation text
)`,
  `create table if not exists med_details (
  activity_id text primary key,
  name text not null,
  amount_text text,
  route text
)`,
  `create table if not exists measurement_details (
  activity_id text primary key,
  weight_g integer,
  length_mm integer,
  head_mm integer,
  temp_c_hundredths integer,
  temp_method text,
  standard text
)`,
  // A running timer is hard-deleted on the server (`timers_write` is `for all`), so it has
  // neither `deleted_at` nor `client_op_id` and can never arrive as a tombstone. That is why
  // its pull strategy is `full`: absence is the removal.
  `create table if not exists running_timers (
  id text primary key,
  household_id text not null,
  child_id text,
  type text not null,
  started_at text not null,
  paused_ms integer not null default 0,
  active_side text,
  side_started_at text,
  left_seconds integer not null default 0,
  right_seconds integer not null default 0,
  started_by text not null,
  meta text not null default '{}',
  created_at text not null,
  updated_at text not null
)`,
  `create table if not exists favorites (
  id text primary key,
  household_id text not null,
  user_id text,
  module_id text not null,
  label text not null,
  payload text not null default '{}',
  use_count integer not null default 0,
  sort_order integer not null default 0,
  created_at text not null
)`,
  // ---------------------------------------------------------------- milk stash
  `create table if not exists storage_locations (
  id text primary key,
  household_id text not null,
  name text not null,
  short_name text,
  kind text not null,
  sort_order integer not null default 0,
  is_default integer not null default 0,
  deleted_at text
)`,
  `create table if not exists milk_containers (
  id text primary key,
  household_id text not null,
  owner_id text not null,
  source_activity_id text,
  location_id text not null,
  container_type text not null default 'BAG',
  amount_ml integer not null,
  initial_ml integer not null,
  pumped_at text not null,
  first_frozen_at text,
  thawed_at text,
  opened_at text,
  used_at text,
  discarded_at text,
  discard_reason text,
  status text not null default 'STORED',
  label_code text,
  notes text,
  created_by text not null,
  created_at text not null,
  updated_at text not null
)`,
  // Append-only: `revoke update, delete on milk_inventory_transactions` (0002_rls.sql:181) is
  // the server's half, and the table has neither `updated_at` nor `deleted_at` to sync on.
  // A correction is a compensating ADJUST row, never an edit.
  `create table if not exists milk_inventory_transactions (
  id text primary key,
  client_op_id text not null,
  household_id text not null,
  container_id text not null,
  kind text not null,
  delta_ml integer not null,
  from_location_id text,
  to_location_id text,
  activity_id text,
  occurred_at text not null,
  created_by text not null,
  created_at text not null
)`,
  `create table if not exists milk_guidance_profiles (
  profile text not null,
  version text not null,
  effective_date text not null,
  source text not null,
  source_url text,
  disclaimer text not null,
  conditions text not null,
  anchors text not null,
  created_at text not null,
  primary key (profile, version)
)`,
  // ---------------------------------------------------------------- schedule
  `create table if not exists schedule_phases (
  id text primary key,
  household_id text not null,
  child_id text,
  name text not null,
  effective_from text not null,
  effective_to text,
  is_current integer not null default 0,
  created_at text not null,
  updated_at text not null,
  deleted_at text
)`,
  `create table if not exists schedule_rules (
  id text primary key,
  household_id text not null,
  phase_id text not null,
  child_id text,
  activity text not null,
  care_item_id text,
  effective_from text not null,
  rule_type text not null,
  at_local_time text,
  every_minutes integer,
  relative_to text,
  offset_minutes integer,
  every_days integer,
  target_quantity real,
  repeat text not null default 'DAILY',
  repeat_days text,
  reminder_enabled integer not null default 1,
  remind_user_ids text not null default '[]',
  match_window_minutes integer not null default 25,
  match_scope text not null default 'MINUTES',
  miss_after_minutes integer not null default 60,
  late_window_minutes integer not null default 90,
  night_mode text not null default 'NONE',
  night_from text,
  night_to text,
  night_every_minutes integer,
  night_at text,
  target_per_day integer,
  name text,
  is_active integer not null default 1,
  created_at text not null,
  updated_at text not null,
  deleted_at text
)`,
  `create table if not exists schedule_instances (
  id text primary key,
  household_id text not null,
  rule_id text not null,
  child_id text,
  scheduled_for text not null,
  local_date text not null,
  status text not null default 'UPCOMING',
  matched_activity_id text,
  anchor_activity_id text,
  completed_at text,
  expected_count integer not null default 1,
  minutes_late integer,
  skipped_reason text,
  created_at text not null,
  updated_at text not null
)`,
  `create table if not exists reminders (
  id text primary key,
  household_id text not null,
  instance_id text,
  kind text not null,
  user_id text not null,
  fire_at text not null,
  payload text not null default '{}',
  group_key text,
  sent_at text,
  cancelled_at text,
  cancel_reason text,
  snoozed_until text,
  created_at text not null
)`,
  `create table if not exists notification_preferences (
  household_id text not null,
  user_id text not null,
  channel text not null,
  enabled integer not null default 1,
  sound integer not null default 1,
  vibrate integer not null default 1,
  quiet_from text,
  quiet_to text,
  schedule_dow integer,
  schedule_hour integer,
  updated_at text not null,
  primary key (household_id, user_id, channel)
)`,
  ...LOCAL_INDEXES,
];

/**
 * v6 (WP8): immunisations (docs/VACCINES.md §8). The published profile is reference data with
 * no household_id (like milk_guidance_profiles), the tracking settings are a household's opt-ins,
 * and the records are the parent's own rows — column for column as 0001 has them.
 */
const VACCINE_TABLES: readonly string[] = [
  `create table if not exists vaccine_guidance_profiles (
  profile text not null,
  version text not null,
  effective_date text not null,
  source text not null,
  source_url text,
  disclaimer text not null,
  coverage text,
  vaccines text not null,
  visits text not null,
  doses text not null,
  created_at text not null,
  primary key (profile, version)
)`,
  `create table if not exists vaccine_tracking_settings (
  household_id text not null,
  child_id text not null,
  dose_id text not null,
  enabled integer not null default 0,
  updated_by text,
  updated_at text not null,
  primary key (household_id, child_id, dose_id)
)`,
  `create table if not exists vaccine_records (
  id text primary key,
  client_op_id text not null,
  household_id text not null,
  child_id text not null,
  guidance_profile text,
  guidance_version text,
  dose_id text,
  custom_name text,
  status text not null default 'PLANNED',
  occurred_on text,
  provider text,
  site text,
  lot text,
  decline_reason text,
  notes text,
  created_by text not null,
  updated_by text,
  created_at text not null,
  updated_at text not null,
  deleted_at text
)`,
  `create index if not exists vaccine_records_child on vaccine_records (child_id, occurred_on)`,
];
export const LOCAL_SCHEMA_V6: readonly string[] = VACCINE_TABLES;

/**
 * v7 (WP6b, WP6c): the two lists a household shares — what it is buying, and the chores that
 * keep the day working. Household-scoped, never per child, and deliberately outside every
 * query that builds the baby's record: no `activities` row, nothing in Reports, nothing in an
 * export of a child's history.
 *
 * `checked_at` rather than a boolean: two phones ticking the same line agree on WHEN without
 * a second column, and whole-row last-writer-wins resolves an untick against a tick the way
 * it resolves every other edit. `last_done_on` is a chore's whole completion model — the
 * local day it was last ticked, because "is it done today" is the only question the product
 * ever asks of it (chains.ts says why a completions table would be the wrong shape here).
 */
export const LOCAL_SCHEMA_V7: readonly string[] = [
  `create table if not exists shopping_items (
  id text primary key,
  household_id text not null,
  title text not null,
  qty integer not null default 1,
  note text,
  store text,
  checked_at text,
  checked_by text,
  created_by text not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  client_op_id text
)`,
  `create index if not exists shopping_items_household on shopping_items (household_id, deleted_at)`,
  `create table if not exists household_tasks (
  id text primary key,
  household_id text not null,
  title text not null,
  at_local_time text,
  repeat text not null default 'DAILY',
  assigned_to text,
  last_done_on text,
  last_done_by text,
  last_done_at text,
  created_by text not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  client_op_id text
)`,
  `create index if not exists household_tasks_household on household_tasks (household_id, deleted_at)`,
];

/**
 * v8 (the supply catalog): what this household actually buys — brand, size, pack, shop, the
 * sentence that stops the wrong box coming home, and a link. `last_bought_on` is the whole
 * purchase model: the local day a trip recorded buying it, which is what makes "bought 9 days
 * ago" true without a purchase-history table.
 *
 * A shopping line gains `supply_id`, the link back to the item. It keeps its own `title` even
 * so, and deliberately: the list has to read correctly on a phone whose catalog page has not
 * arrived yet, and a line whose item was later removed is still a thing somebody wanted.
 */
export const LOCAL_SCHEMA_V8: readonly string[] = [
  `create table if not exists supply_items (
  id text primary key,
  household_id text not null,
  category text not null default 'OTHER',
  brand text,
  product text,
  variant text,
  pack text,
  store text,
  notes text,
  url text,
  last_bought_on text,
  created_by text not null,
  created_at text not null,
  updated_at text not null,
  deleted_at text,
  client_op_id text
)`,
  `create index if not exists supply_items_household on supply_items (household_id, deleted_at)`,
  `alter table shopping_items add column supply_id text`,
];

/** One row of `pragma table_info(<table>)`: what a rebuild needs to copy a column as it is. */
export interface TableColumn {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

/** The smallest driver surface the runner needs; expo-sqlite and node:sqlite both fit it. */
export interface SqlRunner {
  exec(sql: string): void | Promise<void>;
  userVersion(): number | Promise<number>;
  setUserVersion(v: number): void | Promise<void>;
  /** `pragma table_info(<table>)`, for the one rebuild that reads a table's shape first. */
  tableInfo(table: string): readonly TableColumn[] | Promise<readonly TableColumn[]>;
}

/**
 * The file on disk was written by a newer build than this one — a downgrade, a TestFlight
 * rollback, or a shared device. There is no backward migration and guessing at one would
 * rewrite rows a newer schema understands, so `openLocalDb` deletes the file and pulls the
 * household down again. The outbox is the only thing that could be lost, and only for ops a
 * newer build had not yet flushed; that is why the message says which versions met.
 */
export class LocalSchemaTooNewError extends Error {
  readonly found: number;
  readonly supported: number;
  constructor(found: number, supported: number = LOCAL_SCHEMA_VERSION) {
    super(`local database is at schema v${found}, this build understands v${supported}`);
    this.name = 'LocalSchemaTooNewError';
    this.found = found;
    this.supported = supported;
  }
}

/**
 * v3 (WP5.5): the household's care items (docs/CARE_ITEMS.md) and the column that ties a
 * medicine entry to one (`0011`, D12). `care_items` has no `deleted_at` on the server —
 * archiving is `archived_at` and every logged entry stays — so it is mirrored without one, and
 * its pull is `delta` with no tombstones. The column on med_details is added in place: SQLite
 * adds a nullable column without a rebuild.
 */
export const LOCAL_SCHEMA_V3: readonly string[] = [
  `create table if not exists care_items (
  id text primary key,
  household_id text not null,
  name text not null,
  kind text not null default 'OTHER',
  usual_amount text,
  route text not null default 'OTHER',
  note text,
  archived_at text,
  created_by text,
  created_at text not null,
  updated_at text not null,
  updated_by text
)`,
  `create index if not exists care_items_household on care_items (household_id, archived_at)`,
  `alter table med_details add column care_item_id text`,
];

/**
 * v4 (WP6): the household's guidance pin. `households.guidance_profile` and `guidance_version`
 * have been on the server since 0001 (defaulted `CDC_US` / `2026_01`) and were left off the
 * mirror in WP2; the stash reads them to pick the profile every best-use date comes from
 * (data/guidance.ts), so they arrive with the next pull. Added in place: SQLite adds a nullable
 * column without a rebuild, and a null pin reads as the server's default.
 */
export const LOCAL_SCHEMA_V4: readonly string[] = [
  `alter table households add column guidance_profile text`,
  `alter table households add column guidance_version text`,
];

/**
 * v5 (WP7): the household's nudge threshold per module (0014 `module_settings.nudge_after_minutes`,
 * SCHEDULE_LOGIC §1b) — null is off, which is the default for every module on a new account.
 * Added in place for the same reason as v4.
 */
export const LOCAL_SCHEMA_V5: readonly string[] = [
  `alter table module_settings add column nudge_after_minutes integer`,
];

/**
 * v9 (migration 0095): the household's waking window — the wake and bed times that decide
 * whether a logged sleep is written down as a nap or as night sleep. It was an AsyncStorage
 * preference for one release and that was a defect: two parents with two windows wrote two
 * different words for the same 8 p.m. sleep. One row per household, mirrored so the label is
 * right on a cold start with no network.
 *
 * NO ROW IS THE DEFAULT PAIR, not a gap — a household that never opened the control has
 * nothing here and every device reads `DEFAULT_DAY_WINDOW`. Nothing is seeded on either side.
 */
export const LOCAL_SCHEMA_V9: readonly string[] = [
  `create table if not exists household_settings (
  household_id text primary key,
  wake_time text not null default '07:00',
  bed_time text not null default '19:30',
  updated_by text,
  updated_at text not null
)`,
];

/**
 * v10 (migration 0097): the household's daily goal per module, in minutes —
 * `module_settings.goal_minutes`. Tummy time is the module that carries one (`today/goal.ts`);
 * null is none, which is every module on a new account. Added in place for the same reason as
 * v5: SQLite adds a nullable column without a rebuild, and a row pulled before the column
 * existed reads as "no goal", which is what it was.
 */
export const LOCAL_SCHEMA_V10: readonly string[] = [
  `alter table module_settings add column goal_minutes integer`,
];

/**
 * v11 (migration 0098): a module's second life — `module_settings.variant`, `playtime` on tummy
 * time once the baby has outgrown it (`packages/core/src/modules/variants.ts`). Null is the
 * module's own word, which is every module on every account until a parent flips the switch
 * under What you track. Added in place, nullable, for the same reason as v10.
 */
export const LOCAL_SCHEMA_V11: readonly string[] = [
  `alter table module_settings add column variant text`,
];

/**
 * v12 (migration 0001, mirrored at last): the baby's picture — `children.photo_path` and
 * `children.photo_updated_at` (the owner, 2026-09-20: *"add the feature to add baby's picture
 * saved to everyone in household"*).
 *
 * Both columns have been on the SERVER since the first migration and were simply never
 * mirrored, because nothing on the phone read them. They arrive on the next delta pull with
 * every other `children` column, so nothing is backfilled and a household that never set one
 * has two nulls, which is what it had.
 *
 * THE PATH IS MIRRORED, THE IMAGE IS NOT. What the device caches is a file under
 * `documentDirectory`, keyed by `photo_updated_at` (`childPhotoCacheName`); the row carries
 * only where it lives. Added in place, nullable, for the same reason as v10 and v11.
 */
export const LOCAL_SCHEMA_V12: readonly string[] = [
  `alter table children add column photo_path text`,
  `alter table children add column photo_updated_at text`,
];

/**
 * v13 (migration 0102): a photo on an entry — `activities.photo_path` and
 * `activities.photo_updated_at`, mirrored exactly as v12 mirrored the child's two, plus the
 * UPLOAD QUEUE those columns are stamped from.
 *
 * WHY A QUEUE AND NOT THE OUTBOX. The outbox carries JSON operations and drains in order inside
 * one transaction per batch; a photo is 300 KB of bytes on the filesystem that may take a minute
 * on a bad connection and must not hold an entry, a timer stop or a stash deduction behind it.
 * So the entry goes through the outbox and lands at once (CLAUDE.md rule 7), and the picture
 * waits here until there is a network to carry it.
 *
 * `state` and `attempts` mirror the outbox's own vocabulary on purpose — the same backoff, the
 * same "a refusal the server will repeat is final" rule (`photoWorthRetrying`) — so there is one
 * idea of a stuck write on this device rather than two.
 *
 * `local_uri` is a file under the cache directory sign-out sweeps. If the OS reclaims it before
 * the row drains, the row is dropped and the ENTRY IS UNTOUCHED: a picture that no longer exists
 * on the phone is not an error a parent can act on, and never a reason to lose a log.
 */
export const LOCAL_SCHEMA_V13: readonly string[] = [
  `alter table activities add column photo_path text`,
  `alter table activities add column photo_updated_at text`,
  `create table if not exists photo_queue (
  activity_id text primary key,
  household_id text not null,
  local_uri text not null,
  -- PENDING · SENDING · FAILED, the outbox's own three
  state text not null default 'PENDING',
  attempts integer not null default 0,
  next_attempt_at text,
  last_error text,
  created_at text not null
)`,
  `create index if not exists photo_queue_ready on photo_queue (state, next_attempt_at)`,
];

/**
 * v14 (WP11): MOM PRIVACY — `privacy_preferences`, the mirror of migration 0103.
 *
 * One row per (household, caregiver, privacy-capable module) holding `shared`. The hiding this
 * serves has existed since the first migration (`activities.is_private` and the reads that
 * filter on it); what was missing was the switch that decides it, and this is where the switch's
 * answer lives on the device.
 *
 * NO ROW MEANS SHARED, so there is nothing to backfill and a phone upgrading into v14 behaves
 * exactly as it did the minute before — which is also why the pull is `full`: absence on the
 * server has to be able to become absence here.
 */
export const LOCAL_SCHEMA_V14: readonly string[] = [
  `create table if not exists privacy_preferences (
  household_id text not null,
  user_id text not null,
  module_id text not null,
  shared integer not null default 1,
  updated_at text not null,
  primary key (household_id, user_id, module_id)
)`,
];

/**
 * v15 (WP12b): IN-APP MESSAGES — the mirror of `app_messages`, this user's dismissals, and the
 * impressions only this device has.
 *
 * THE CARD IS DRAWN FROM HERE, not from a request. A "sync is degraded, your log is safe on this
 * phone" notice that needed a network to be read would be missing on precisely the day it is
 * true, and the daily cap it is exempt from is counted from rows that have to be here too.
 *
 * `app_message_impressions` IS LOCAL-ONLY and has no server table. §3's caps are "per user", and
 * a cap that only held while online would not be a cap; the honest reading of per-user without a
 * server counter is per install, and a parent reading the same card on a tablet after seeing it
 * on a phone is a far smaller failure than a card that reappears on a plane. The admin's own
 * metrics read dismissals, which DO travel.
 *
 * `app_message_dismissals` carries `app_version`, which the server column does not: §3 lets an
 * update notice come back "after 7 days or on the next version", and the version a parent was
 * running when they said Later is a fact about this device.
 */
export const LOCAL_SCHEMA_V15: readonly string[] = [
  `create table if not exists app_messages (
  id text primary key,
  kind text not null,
  title text not null,
  body text not null,
  cta_label text,
  cta_route text,
  audience text not null default '{}',
  starts_at text not null,
  ends_at text,
  published_at text,
  -- this reader's own answer, carried on the row by the pull (migration 0104) so a dismissal
  -- survives a reinstall without a second table that could arrive out of step
  my_action text,
  my_at text,
  -- no local updated_at: the pull replaces the whole set and the server has no such column,
  -- so a NOT NULL one here would fail the first insert of a pulled row
  created_at text not null
)`,
  `create table if not exists app_message_dismissals (
  message_id text not null,
  user_id text not null,
  action text not null,
  at text not null,
  -- local only: the build that was installed when a LATER was recorded
  app_version text,
  primary key (message_id, user_id)
)`,
  `create table if not exists app_message_impressions (
  message_id text not null,
  kind text not null,
  at text not null,
  primary key (message_id, at)
)`,
  `create index if not exists app_message_impressions_at on app_message_impressions (at)`,
];

/**
 * v16 (migration 0113): WHO'S ON — the household's shifts, `household_duty` (the owner,
 * 2026-09-23: *"how to easily 'manage' where these notifications are being sent to"*).
 *
 * One row per household, like the day window, and for the same reason: it is one fact the whole
 * household shares, and every phone must read the same one — the notification planner decides
 * from it which phone rings (`packages/core/src/schedule/duty.ts`). `shifts` is the wire's JSON
 * array as text. NO ROW, OR AN EMPTY ARRAY, IS NOBODY ON: every phone is reminded as it chose.
 */
export const LOCAL_SCHEMA_V16: readonly string[] = [
  `create table if not exists household_duty (
  household_id text primary key,
  shifts text not null default '[]',
  updated_by text,
  updated_at text not null
)`,
];

/**
 * v17 (migration 0114): A MEAL'S FOODS, one per line — `solids_details.items`, the server's jsonb
 * list as text (the owner, 2026-09-24: "user should be able to put entry for the qty, for
 * example strabery 5, banana 1, and the reaction"; `packages/core/src/solids/items.ts`). Null on
 * every meal logged before, which `itemsOf` reads from its `food` text instead — nothing is
 * rewritten to make room for it.
 */
export const LOCAL_SCHEMA_V17: readonly string[] = [
  `alter table solids_details add column items text`,
];

/**
 * v18 (2026-09-24, from the module audits): three columns the server has had since 0001 and 0101
 * that a phone turned out to need.
 *
 *   * `profiles.weight_unit`, `length_unit`, `temp_unit` — the parent's own units. Only the
 *     volume unit was mirrored, so every household saw pounds, inches and °F whatever it had
 *     chosen, and the kg and cm steppers could never be reached.
 *   * `household_members.expires_at` — the end of a temporary caregiver's seat. Not mirrored
 *     before, on the reading that the phone must never decide whether a seat is live, and that
 *     stays true: the server decides access. But a phone has to decide which phone RINGS, often
 *     asleep and offline, and a sitter put on until the morning whose seat ended at eleven kept
 *     every parent's phone quiet all night (the handoff audit, H4). The mirror is for routing.
 *
 * Profiles are pulled by delta, so rows this device already holds would keep empty units until
 * each profile next changed; the cursor is reset once so the next pull brings them whole. The
 * members table is pulled whole every pass and needs nothing.
 *
 * FOUR `add column`s, and SQLite takes one per statement — so a launch killed between two of them
 * leaves a version half applied. `migrateLocalDb` treats a column that is already there as the
 * resume it is (`execOnce`), rather than refusing to open the file.
 */
export const LOCAL_SCHEMA_V18: readonly string[] = [
  `alter table profiles add column weight_unit text`,
  `alter table profiles add column length_unit text`,
  `alter table profiles add column temp_unit text`,
  `alter table household_members add column expires_at text`,
  `update sync_state set cursor_updated_at = null, cursor_id = null, last_full_sync_at = null
    where table_name = 'profiles'`,
];

/**
 * v19 (migration 0116): `milk_containers.client_edited_at` and `vaccine_records.client_edited_at`,
 * the phone clock of the last edit each row took. The server now settles two writers by it rather
 * than by its own `updated_at`, which every ledger row re-stamped (the sync sweep of 2026-09-24:
 * a bag moved just after a feed, and a vaccine record corrected before it was sent, lost the
 * edit). Mirrored so the phone's tables stay the server's column for column; the phone reads
 * nothing from them. Both are pulled by delta, and a row brings its value the next time it
 * changes — nothing on the phone needs it sooner, so no cursor is reset.
 */
export const LOCAL_SCHEMA_V19: readonly string[] = [
  `alter table milk_containers add column client_edited_at text`,
  `alter table vaccine_records add column client_edited_at text`,
];

/**
 * v20 (migration 0127): `module_settings.base_goal_minutes`, the goal a module had under its own
 * word, kept while its second word is on — tummy time's goal while the household calls it
 * Playtime, whose own goal is three hours (the owner, 2026-09-26; `graduationSettings` in
 * `today/goal.ts`). The switch back reads it from here to put the goal back, so it has to be on
 * the phone, offline included. The server keeps it by a trigger and the next pull corrects any
 * prediction a phone made; a row pulled before the column existed reads as no kept goal, which
 * is what it had. Added in place, nullable, for the reason v10 gives.
 */
export const LOCAL_SCHEMA_V20: readonly string[] = [
  `alter table module_settings add column base_goal_minutes integer`,
];

/**
 * v21 (migration 0128): `household_settings.volume_unit`, the household's milk unit — ounces or
 * milliliters for every bottle, pump and stash amount on every phone in the household (the owner,
 * 2026-09-26: *"make the oz/mL setting household-wide, not per person"*). Read on the phone,
 * offline included, by every screen that shows an amount (`useUnits`), so it is mirrored.
 *
 * Added in place with the server's own default, so every row already on the phone — a household
 * that set its waking window — keeps its times and reads ounces, which is what the server backfills
 * it with too; the next `full` pull replaces it with the server's row either way. NO ROW is still
 * the default: a household that never touched either setting has nothing here and reads ounces.
 */
export const LOCAL_SCHEMA_V21: readonly string[] = [
  `alter table household_settings add column volume_unit text not null default 'oz'`,
];

/**
 * NIBBLECUE'S OWN RECORDS (2026-10-08; docs/SERVER.md): the baby's food profile, custom foods,
 * what a parent noticed and the plan's pins, one row each, mirroring the shared server's
 * `nibble_records`. `body` is the record's JSON, checked on the phone against `RECORD_BODY` before
 * it is written and read back forgivingly. Pulled by `nibble_sync_pull`, pushed by
 * `nibble_sync_push` (the providers route the entity), never through CuddleCue's own functions.
 */
export const LOCAL_SCHEMA_V22: readonly string[] = [
  `create table if not exists nibble_records (
  id text primary key,
  household_id text not null,
  child_id text,
  kind text not null,
  body text not null,
  client_edited_at text,
  created_by text,
  updated_by text,
  created_at text,
  updated_at text not null,
  deleted_at text,
  client_op_id text
)`,
  `create index if not exists nibble_records_household on nibble_records (household_id, kind, deleted_at)`,
];

/**
 * THE READ INDEXES (2026-09-27, no server migration — the owner: *"the way the app runs is
 * optimized"*): two indexes, so the reads a parent waits on read the rows they show and not the
 * household's whole history. Nothing is rewritten; an index is built from the rows already there,
 * once, on the first launch of the build that brings it.
 *
 * THE PHONE HAS NO STATISTICS, and that is the whole of the first one. Nothing on the device runs
 * `ANALYZE`, so SQLite plans from its defaults, and for `household_id = ?` alone the default
 * favors the unique `(household_id, client_op_id)` index — which it then walks end to end: every
 * row the household ever logged, read, joined to eight detail tables and sorted, for Today's two
 * days, the Log's first sixty rows, the catch-up card and the reminders' look back (the plan
 * census in `apps/mobile/src/db/queries/plans.test.ts`). The server has had `activities_hh_time`
 * since 0001; the mirror never got it. With it the same reads are a range on the start, or — for
 * the Log — a walk down the newest starts that stops at the page. Partial like the server's:
 * every one of those reads says `deleted_at is null`, and a tombstone has no business in it.
 *
 * THE SECOND IS FOR "WHICH ENTRY OF EACH KIND HAPPENED LAST" (`lastActivities`). That is the
 * newest start of each type, or an entry of that type that ENDED after it — a feed typed in
 * afterwards (`recencyMs` in core). The newest start is a probe of `activities_hh_type_time`; the
 * ones that ended after it need the end, so the end is indexed, and only where there is one — a
 * diaper or a bottle has none and costs this index nothing.
 *
 * NOT A SCHEMA VERSION, ON PURPOSE. They are created — `if not exists`, a catalog lookup once they
 * are there — every time the file is opened, after the ladder, and `user_version` does not move.
 * A version is what a build checks to decide whether it can read a file at all: a rollback to the
 * previous bundle (docs/DEPLOYMENT.md: "republish the previous bundle") that met a version above
 * its own would call the file too new, delete it and pull the household down again, and an entry
 * still in the queue would go with it (CLAUDE.md rule 7). An index changes no row and no column,
 * so a build that does not know it reads the file exactly as before; it has no business in the
 * version.
 *
 * THREE MORE, FOR THE READS BEHIND EVERY SAVE THAT WERE STILL WALKING A TABLE (2026-09-28; the
 * owner: *"app needs to run as smooth as fast and as light as possible"*), found by the same census
 * (`apps/mobile/src/db/queries/plans.more.test.ts`):
 *
 *   · THE DAY'S SKIPS (`skippedSince`), read by the routine on every save and every pull: the
 *     household's instances are one row per rule per day, for as long as the phone has held them —
 *     a year of ten rules is 3,650 — and the read walked every one on `(household_id, local_date)`
 *     to keep the handful skipped since yesterday. `(household_id, status, scheduled_for)` is that
 *     handful, as a range.
 *   · ONE SLOT'S INSTANCE (`instanceFor`), read on every Skip and every slot logged: its time is
 *     compared through `strftime` (the reason is on `SAME_SLOT`), which no index can serve, so the
 *     rule is what narrows it — to that rule's own days instead of the household's.
 *   · THE STASH'S LEDGER SINCE A DAY (`ledgerSince`, the week's balance) and its newest line
 *     (`stashLastChangeAt`): the ledger was walked whole on its idempotency key and sorted; on
 *     `(household_id, occurred_at)` it is a range already in order, and the newest a single probe.
 */
export const LOCAL_READ_INDEXES: readonly string[] = [
  `create index if not exists activities_hh_time on activities (household_id, start_at desc)
    where deleted_at is null`,
  `create index if not exists activities_hh_type_end on activities (household_id, type, end_at)
    where end_at is not null and deleted_at is null`,
  `create index if not exists schedule_instances_status_time
    on schedule_instances (household_id, status, scheduled_for)`,
  `create index if not exists schedule_instances_rule on schedule_instances (rule_id)`,
  `create index if not exists milk_txn_hh_time
    on milk_inventory_transactions (household_id, occurred_at)`,
];

/**
 * WHAT REFUSED A PARKED OP, ON ITS OWN ROW (2026-09-28; the owner on staging: the chip said "Not
 * synced" and, once the app had restarted, nothing offered Try again). `last_error_code` is the
 * `PushErrorCode` the server gave the op's last refusal — null for a transport failure, which has
 * none, and for a row parked by a build before this one. The banner reads it from the outbox at
 * launch and whenever the queue is read (`sync/worker.ts` `bannerCodeOf`), so it no longer depends
 * on having watched the failure happen.
 *
 * NOT A SCHEMA VERSION, for the reason `LOCAL_READ_INDEXES` gives: a version above an older
 * bundle's own makes that bundle delete the file on a rollback, and the queue's unsent ops with it
 * (CLAUDE.md rule 7). A nullable column is as safe to leave to an older bundle as an index: every
 * outbox insert names its columns (`OUTBOX_INSERT_COLUMNS`, the v2 rebuild, `sync/replay.ts`) and
 * every read parses what it knows, so that bundle reads and writes the file exactly as before and
 * never writes the column. Run on every open through `execOnce`, whose "duplicate column" is the
 * answer every open after the first gets.
 */
export const LOCAL_OUTBOX_ADDITIONS: readonly string[] = [
  `alter table outbox add column last_error_code text`,
];

/**
 * A PERSON'S PICTURE, ON EVERY PHONE THAT DRAWS THEM (migration 0148; the owner, 2026-09-30).
 * `profiles.avatar_path`, `avatar_preset` and `avatar_updated_at`: a photo's path, a drawing's id,
 * and when either last changed. Mirrored for the reason `children.photo_path` is (v12): the people
 * in the household are drawn on the phone, offline too — the top bar, who's on, the log's bylines —
 * and a picture another member set has to be there on a cold start with no network. The IMAGE is
 * not mirrored: a photo is a cached file keyed on the stamp, and a drawing is drawn from its id.
 *
 * NOT A SCHEMA VERSION, for the reason `LOCAL_OUTBOX_ADDITIONS` gives: three nullable columns are as
 * safe to leave to an older bundle as an index, and a version above that bundle's own would make it
 * delete the file on a rollback, the queue with it (CLAUDE.md rule 7). An older bundle simply writes
 * the columns a pull brings, since the apply reads a table's columns off the table itself.
 *
 * Profiles are pulled by delta, so the rows this phone already holds would keep no picture until
 * each profile next changed: the open that ADDS the columns resets the profiles cursor once, as
 * v18 did for the units (`PROFILE_PICTURE_REPULL`), and no open after it does.
 */
export const LOCAL_PROFILE_PICTURE: readonly string[] = [
  `alter table profiles add column avatar_path text`,
  `alter table profiles add column avatar_preset text`,
  `alter table profiles add column avatar_updated_at text`,
];

/**
 * THE HEALTH NOTE'S CHIPS (migration 0160; the owner, 2026-10-08): `wellbeing_details`, one row per
 * Health note, keyed by its activity like the other detail tables. `seen` is the server's `text[]`
 * as JSON array text (WP4 D31), '[]' for a note written in words alone. The parent's words are the
 * activity's own `notes`, its start and end the activity's own, so the chips are all this holds.
 *
 * NOT A SCHEMA VERSION, for the reason `LOCAL_OUTBOX_ADDITIONS` gives: a version above an older
 * bundle's own makes that bundle delete the file on a rollback, and the unsent queue with it
 * (CLAUDE.md rule 7). A new table is as safe to leave to an older bundle as a nullable column: that
 * bundle never reads it, and its pull drops a detail table it does not know (`applyActivities`). Run on
 * every open as `if not exists`, which is a catalog lookup once it is there.
 */
export const LOCAL_WELLBEING_DETAILS: readonly string[] = [
  `create table if not exists wellbeing_details (
  activity_id text primary key,
  seen text not null default '[]'
)`,
];

/**
 * A BABY ON THE WAY HAS NO BIRTH DATE (migration 0150; the owner, 2026-10-01). `children.birth_date`
 * was NOT NULL here from v1, so the first pull of a child set up before the birth would stop on it
 * and hold every table behind it. SQLite cannot drop a NOT NULL in place: the table is rebuilt the
 * way SQLite's own documentation does it, a new table, the rows copied, the old one dropped and the
 * new one renamed, inside one savepoint, so a launch killed half way leaves the old table whole.
 *
 * THE COPY IS READ FROM THE TABLE ITSELF (`pragma table_info`), every column with its type, its
 * default and its key exactly as it is, and only this one constraint gone. A later build that adds a
 * column to `children` before a phone first opens with this step keeps it; a column list written
 * here would drop it.
 *
 * NOT A SCHEMA VERSION, for the reason `LOCAL_OUTBOX_ADDITIONS` gives: a version above an older
 * bundle's own makes that bundle delete the file on a rollback, and the unsent queue with it
 * (CLAUDE.md rule 7). An older bundle reads and writes the rebuilt table exactly as before, since a
 * column that may be null takes every row it ever wrote. It runs on every open and does its work on
 * the first: after that the column is no longer NOT NULL, and the check is one pragma.
 */
export function relaxNotNull(
  table: string,
  column: string,
  columns: readonly TableColumn[],
): string[] {
  const temp = `${table}_relaxed`;
  const keys = columns
    .filter(c => c.pk > 0)
    .sort((a, b) => a.pk - b.pk)
    .map(c => c.name);
  const defs = columns.map(c =>
    [
      c.name,
      c.type,
      c.notnull && c.name !== column ? 'not null' : '',
      c.dflt_value === null ? '' : `default (${c.dflt_value})`,
    ]
      .filter(part => part !== '')
      .join(' '),
  );
  const names = columns.map(c => c.name).join(', ');
  return [
    `drop table if exists ${temp}`,
    `create table ${temp} (${[...defs, ...(keys.length > 0 ? [`primary key (${keys.join(', ')})`] : [])].join(', ')})`,
    `insert into ${temp} (${names}) select ${names} from ${table}`,
    `drop table ${table}`,
    `alter table ${temp} rename to ${table}`,
  ];
}

/** `children.birth_date`, NOT NULL since v1, may be null from 0150: rebuilt once, on the first open. */
async function relaxChildBirthDate(db: SqlRunner): Promise<boolean> {
  const columns = await db.tableInfo('children');
  if (!columns.some(c => c.name === 'birth_date' && c.notnull)) return false;
  await db.exec('savepoint relax_children');
  try {
    for (const stmt of relaxNotNull('children', 'birth_date', columns)) await db.exec(stmt);
    await db.exec('release relax_children');
  } catch (err) {
    await db.exec('rollback to relax_children');
    await db.exec('release relax_children');
    throw err;
  }
  return true;
}

/** The one re-pull of the household's profiles, on the open that added the three columns. */
export const PROFILE_PICTURE_REPULL = `update sync_state set cursor_updated_at = null, cursor_id = null,
  last_full_sync_at = null where table_name = 'profiles'`;

/**
 * One migration statement, where an `add column` whose column is already there is the resume of
 * a version a killed launch left half applied — not a fault that should leave the file unopenable.
 */
async function execOnce(db: SqlRunner, stmt: string): Promise<void> {
  await addedOnce(db, stmt);
}

/** `execOnce`, saying whether the statement ran (true) or found its column already there (false). */
async function addedOnce(db: SqlRunner, stmt: string): Promise<boolean> {
  try {
    await db.exec(stmt);
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/^\s*alter table \w+ add column/i.test(stmt) && /duplicate column/i.test(message))
      return false;
    throw err;
  }
}

/**
 * Applies every version above the file's `user_version`, in order, inside one batch — and then
 * the read indexes, which are not a version (`LOCAL_READ_INDEXES`).
 */
export async function migrateLocalDb(db: SqlRunner): Promise<{ from: number; to: number }> {
  const from = await db.userVersion();
  if (from > LOCAL_SCHEMA_VERSION) throw new LocalSchemaTooNewError(from);
  if (from < 1) {
    for (const stmt of LOCAL_SCHEMA_V1) await db.exec(stmt);
    await db.setUserVersion(1);
  }
  if (from < 2) {
    for (const stmt of LOCAL_SCHEMA_V2) await db.exec(stmt);
    await db.setUserVersion(2);
  }
  if (from < 3) {
    for (const stmt of LOCAL_SCHEMA_V3) await db.exec(stmt);
    await db.setUserVersion(3);
  }
  if (from < 4) {
    for (const stmt of LOCAL_SCHEMA_V4) await db.exec(stmt);
    await db.setUserVersion(4);
  }
  if (from < 5) {
    for (const stmt of LOCAL_SCHEMA_V5) await db.exec(stmt);
    await db.setUserVersion(5);
  }
  if (from < 6) {
    for (const stmt of LOCAL_SCHEMA_V6) await db.exec(stmt);
    await db.setUserVersion(6);
  }
  if (from < 7) {
    for (const stmt of LOCAL_SCHEMA_V7) await db.exec(stmt);
    await db.setUserVersion(7);
  }
  if (from < 8) {
    for (const stmt of LOCAL_SCHEMA_V8) await db.exec(stmt);
    await db.setUserVersion(8);
  }
  if (from < 9) {
    for (const stmt of LOCAL_SCHEMA_V9) await db.exec(stmt);
    await db.setUserVersion(9);
  }
  if (from < 10) {
    for (const stmt of LOCAL_SCHEMA_V10) await db.exec(stmt);
    await db.setUserVersion(10);
  }
  if (from < 11) {
    for (const stmt of LOCAL_SCHEMA_V11) await db.exec(stmt);
    await db.setUserVersion(11);
  }
  if (from < 12) {
    for (const stmt of LOCAL_SCHEMA_V12) await db.exec(stmt);
    await db.setUserVersion(12);
  }
  if (from < 13) {
    for (const stmt of LOCAL_SCHEMA_V13) await db.exec(stmt);
    await db.setUserVersion(13);
  }
  if (from < 14) {
    for (const stmt of LOCAL_SCHEMA_V14) await db.exec(stmt);
    await db.setUserVersion(14);
  }
  if (from < 15) {
    for (const stmt of LOCAL_SCHEMA_V15) await db.exec(stmt);
    await db.setUserVersion(15);
  }
  if (from < 16) {
    for (const stmt of LOCAL_SCHEMA_V16) await db.exec(stmt);
    await db.setUserVersion(16);
  }
  if (from < 17) {
    for (const stmt of LOCAL_SCHEMA_V17) await db.exec(stmt);
    await db.setUserVersion(17);
  }
  if (from < 18) {
    for (const stmt of LOCAL_SCHEMA_V18) await execOnce(db, stmt);
    await db.setUserVersion(18);
  }
  if (from < 19) {
    for (const stmt of LOCAL_SCHEMA_V19) await execOnce(db, stmt);
    await db.setUserVersion(19);
  }
  if (from < 20) {
    for (const stmt of LOCAL_SCHEMA_V20) await execOnce(db, stmt);
    await db.setUserVersion(20);
  }
  if (from < 21) {
    for (const stmt of LOCAL_SCHEMA_V21) await execOnce(db, stmt);
    await db.setUserVersion(21);
  }
  if (from < 22) {
    for (const stmt of LOCAL_SCHEMA_V22) await execOnce(db, stmt);
    await db.setUserVersion(22);
  }
  // every open, whatever the version: `LOCAL_OUTBOX_ADDITIONS` and `LOCAL_READ_INDEXES` say why
  // neither is one
  for (const stmt of LOCAL_OUTBOX_ADDITIONS) await execOnce(db, stmt);
  // the people's pictures (0148), likewise, and the profiles pulled whole once, when they arrive
  let pictures = false;
  for (const stmt of LOCAL_PROFILE_PICTURE) pictures = (await addedOnce(db, stmt)) || pictures;
  if (pictures) await db.exec(PROFILE_PICTURE_REPULL);
  // a baby on the way (0150): the one rebuild that is not a version (`relaxNotNull` says why)
  await relaxChildBirthDate(db);
  // the Health note's chips (0160): a table, not a version (`LOCAL_WELLBEING_DETAILS` says why)
  for (const stmt of LOCAL_WELLBEING_DETAILS) await db.exec(stmt);
  for (const stmt of LOCAL_READ_INDEXES) await db.exec(stmt);
  return { from, to: LOCAL_SCHEMA_VERSION };
}

/** The columns OFFLINE_SYNC.md §2 names plus `sending_at` (D11), in order — pinned by the
 *  schema test and by `OutboxRow` in packages/core — and `last_error_code`, the refusal's code
 *  (`LOCAL_OUTBOX_ADDITIONS`), which `OutboxRow` leaves to the one reader that needs it. */
export const OUTBOX_COLUMNS = [
  'client_op_id',
  'entity',
  'op',
  'entity_id',
  'household_id',
  'payload',
  'depends_on',
  'seq',
  'created_at',
  'state',
  'attempts',
  'next_attempt_at',
  'sending_at',
  'last_error',
  'last_error_code',
] as const;

/** The local tables that exist only on the device. */
export const LOCAL_ONLY_TABLES = [
  /* IN-APP MESSAGES, the two halves the server does not hold (WP12b). A dismissal has a server
     table, and this one is the device's own copy of it — written first so an answer given with no
     network is already true, and carrying the build a `Later` was recorded on, which is a fact
     about this phone. Impressions have no server table at all: §3's caps are "per user", and
     without a server counter the honest reading is per install. */
  'app_message_dismissals',
  'app_message_impressions',
  'dedupe_keys',
  'outbox',
  // the entry photos still waiting for a network. Local by nature: what it holds is a path to a
  // file on THIS phone, and the server never needs to know a device had an upload pending.
  'photo_queue',
  'snapshot_meta',
  'sync_state',
  'ui_prefs',
  'widget_intents',
] as const;

/**
 * Every local table that mirrors a server table, sorted. `mirror-parity.test.ts` pins each
 * one's columns against the migrations.
 */
export const MIRRORED_TABLES = [
  'activities',
  ...DETAIL_TABLES,
  'app_messages',
  'care_items',
  'children',
  'favorites',
  'household_duty',
  'household_members',
  'household_settings',
  'household_tasks',
  'households',
  'milk_containers',
  'milk_guidance_profiles',
  'milk_inventory_transactions',
  'module_settings',
  'nibble_records',
  'notification_preferences',
  'privacy_preferences',
  'profiles',
  'reminders',
  'running_timers',
  'schedule_instances',
  'schedule_phases',
  'schedule_rules',
  'shopping_items',
  'storage_locations',
  'subscription_entitlements',
  'supply_items',
  'vaccine_guidance_profiles',
  'vaccine_records',
  'vaccine_tracking_settings',
] as const;
export type MirroredTable = (typeof MIRRORED_TABLES)[number];

/**
 * How each mirrored table is pulled (D17). The detail tables are absent because they
 * never travel alone: they have no `household_id`, `updated_at` or `deleted_at`, so they are
 * embedded in their activity, coming and going with it.
 *
 *   `delta`         keyset on `(updated_at, id)`; a soft delete arrives as a tombstone row.
 *   `delta_status`  keyset, but removal is a status change, not a `deleted_at`.
 *   `full`          the whole current set, unpaged; absence means the row is gone. The only
 *                   honest strategy for a table with no `updated_at` (household_members,
 *                   storage_locations, favorites), one whose `updated_at` has no touch
 *                   trigger (module_settings, notification_preferences, privacy_preferences,
 *                   subscription_entitlements), or one that is hard-deleted (running_timers).
 *   `append`        by `(created_at, id)`; rows are never updated or deleted.
 *   `user_window`   the viewer's own open rows in a bounded time window.
 */
export const PULL_STRATEGY: Readonly<
  Record<Exclude<MirroredTable, (typeof DETAIL_TABLES)[number]>, PullStrategy>
> = {
  profiles: 'delta',
  households: 'delta',
  children: 'delta',
  activities: 'delta',
  schedule_phases: 'delta',
  schedule_rules: 'delta',
  care_items: 'delta',
  // the two shared lists and the catalog behind them: each carries `updated_at` and a
  // tombstone, so each is an ordinary delta
  shopping_items: 'delta',
  household_tasks: 'delta',
  supply_items: 'delta',
  milk_containers: 'delta_status',
  schedule_instances: 'delta_status',
  running_timers: 'full',
  household_members: 'full',
  household_settings: 'full',
  // who's on (migration 0113): one row per household with no touch trigger, like the day window
  household_duty: 'full',
  module_settings: 'full',
  storage_locations: 'full',
  favorites: 'full',
  notification_preferences: 'full',
  // the cards the team has published to THIS reader (migration 0104): the audience is decided on
  // the server, so a `full` page is exactly what this person may see and nothing else
  app_messages: 'full',
  // the viewer's own rows only, by policy and by the page's own scoping (migration 0103): the
  // flag says there is something the household cannot see, so the flag is not the household's
  privacy_preferences: 'full',
  subscription_entitlements: 'full',
  milk_guidance_profiles: 'full',
  milk_inventory_transactions: 'append',
  reminders: 'user_window',
  vaccine_records: 'delta',
  vaccine_tracking_settings: 'full',
  vaccine_guidance_profiles: 'full',
  // NibbleCue's own records: `updated_at` and a tombstone, pulled by `nibble_sync_pull`
  nibble_records: 'delta',
};
