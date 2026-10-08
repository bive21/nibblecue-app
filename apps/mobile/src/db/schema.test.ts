import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  LOCAL_ONLY_TABLES,
  LOCAL_OUTBOX_ADDITIONS,
  LOCAL_PROFILE_PICTURE,
  LOCAL_READ_INDEXES,
  LOCAL_SCHEMA_V1,
  LOCAL_SCHEMA_V2,
  LOCAL_SCHEMA_VERSION,
  LocalSchemaTooNewError,
  migrateLocalDb,
  MIRRORED_TABLES,
  OUTBOX_COLUMNS,
  PULL_STRATEGY,
  type SqlRunner,
  type TableColumn,
} from './schema';

/** node:sqlite stands in for expo-sqlite: the same SQL, the same pragmas. */
function open(): { db: DatabaseSync; runner: SqlRunner } {
  const db = new DatabaseSync(':memory:');
  const runner: SqlRunner = {
    exec: sql => db.exec(sql),
    userVersion: () =>
      (db.prepare('pragma user_version').get() as { user_version: number }).user_version,
    setUserVersion: v => db.exec(`pragma user_version = ${v}`),
    tableInfo: t => db.prepare(`pragma table_info(${t})`).all() as unknown as TableColumn[],
  };
  return { db, runner };
}
const columns = (db: DatabaseSync, table: string) =>
  (db.prepare(`pragma table_info(${table})`).all() as { name: string }[]).map(c => c.name);
const tables = (db: DatabaseSync) =>
  (
    db.prepare("select name from sqlite_master where type = 'table' order by name").all() as {
      name: string;
    }[]
  ).map(t => t.name);

/** Every table the file holds at v2, sorted. Written out rather than derived: this list is
 *  the assertion, and deriving it from the same constants the schema is built from would
 *  assert nothing. */
const ALL_TABLES = [
  'activities',
  'app_message_dismissals',
  'app_message_impressions',
  'app_messages',
  'bottle_details',
  'breastfeed_details',
  'care_items',
  'children',
  'dedupe_keys',
  'diaper_details',
  'favorites',
  'household_duty',
  'household_members',
  'household_settings',
  'household_tasks',
  'households',
  'measurement_details',
  'med_details',
  'milk_containers',
  'milk_guidance_profiles',
  'milk_inventory_transactions',
  'module_settings',
  // NibbleCue's own records (v22, the server's 0161)
  'nibble_records',
  'notification_preferences',
  'outbox',
  'photo_queue',
  'privacy_preferences',
  'profiles',
  'pump_details',
  'reminders',
  'running_timers',
  'schedule_instances',
  'schedule_phases',
  'schedule_rules',
  'shopping_items',
  'sleep_details',
  'snapshot_meta',
  'solids_details',
  'storage_locations',
  'subscription_entitlements',
  'supply_items',
  'sync_state',
  'ui_prefs',
  'vaccine_guidance_profiles',
  'vaccine_records',
  'vaccine_tracking_settings',
  // the Health note's chips (0160), made on every open and never a version (`LOCAL_WELLBEING_DETAILS`)
  'wellbeing_details',
  'widget_intents',
];

/** The read indexes (`LOCAL_READ_INDEXES`), made on every open and never a version. */
const READ_INDEXES = [
  'activities_hh_time',
  'activities_hh_type_end',
  'schedule_instances_status_time',
  'schedule_instances_rule',
  'milk_txn_hh_time',
];

describe('the local schema (MOBILE.md §7, OFFLINE_SYNC.md §2, WP4 D11/D15/D24/D31)', () => {
  it('applies from an empty file, stamps user_version, and is a no-op the second time', async () => {
    const { db, runner } = open();
    expect(await migrateLocalDb(runner)).toEqual({ from: 0, to: LOCAL_SCHEMA_VERSION });
    expect(await runner.userVersion()).toBe(LOCAL_SCHEMA_VERSION);
    expect(await migrateLocalDb(runner)).toEqual({
      from: LOCAL_SCHEMA_VERSION,
      to: LOCAL_SCHEMA_VERSION,
    });
    expect(tables(db)).toEqual(ALL_TABLES);
    expect([...LOCAL_ONLY_TABLES, ...MIRRORED_TABLES].sort()).toEqual(ALL_TABLES);
  });

  it('makes the read indexes on a file already at this version, and never moves the version for them', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    // a phone that has run this version since before the indexes existed — the activities' two
    // (2026-09-27) and the skips', the slots' and the ledger's three (2026-09-28)
    for (const name of READ_INDEXES) {
      db.exec(`drop index ${name}`);
    }
    db.exec(
      "insert into activities (id, client_op_id, household_id, type, start_at, end_at, metadata, created_by, created_at, updated_at) values ('a1', 'op-1', 'h1', 'sleep', '2026-09-14T09:00:00Z', '2026-09-14T10:00:00Z', '{}', 'u1', '2026-09-14T09:00:00Z', '2026-09-14T09:00:00Z')",
    );
    expect(await migrateLocalDb(runner)).toEqual({
      from: LOCAL_SCHEMA_VERSION,
      to: LOCAL_SCHEMA_VERSION,
    });
    const made = (
      db
        .prepare(
          `select name from sqlite_master where type = 'index' and name in (${READ_INDEXES.map(
            () => '?',
          ).join(', ')}) order by name`,
        )
        .all(...READ_INDEXES) as { name: string }[]
    ).map(i => i.name);
    expect(made).toEqual([...READ_INDEXES].sort());
    // every one of them is in `LOCAL_READ_INDEXES`, and nothing else is
    expect(LOCAL_READ_INDEXES.map(s => /create index if not exists (\w+)/.exec(s)?.[1])).toEqual(
      READ_INDEXES,
    );
    // the version a rollback to the previous bundle would check is the one it knows
    expect(await runner.userVersion()).toBe(LOCAL_SCHEMA_VERSION);
    expect(LOCAL_READ_INDEXES.every(s => /^create index if not exists /.test(s))).toBe(true);
    expect(db.prepare('select count(*) as n from activities').get()).toEqual({ n: 1 });
  });

  /**
   * WHAT REFUSED A FAILED OP IS KEPT ON ITS ROW (2026-09-28), so the banner that offers Try again
   * comes back after a restart. A column, added on every open like the read indexes and for their
   * reason: a version above an older bundle's own makes that bundle delete the file on a rollback,
   * and the unsent ops with it. Every outbox insert names its columns, so an older bundle reads and
   * writes this file exactly as before.
   */
  it('gives the outbox its refusal code on every open, and never moves the version for it', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    // a phone that has run this version since before the column existed, with a parked op
    db.exec('alter table outbox drop column last_error_code');
    db.exec(
      "insert into outbox (client_op_id, entity, op, entity_id, household_id, payload, seq, created_at, state, last_error) values ('op1','activity','CREATE','a1','h1','{}',1,'2026-09-14T12:00:00Z','FAILED','refused')",
    );
    expect(await migrateLocalDb(runner)).toEqual({
      from: LOCAL_SCHEMA_VERSION,
      to: LOCAL_SCHEMA_VERSION,
    });
    expect(columns(db, 'outbox')).toEqual([...OUTBOX_COLUMNS]);
    expect(db.prepare('select state, last_error, last_error_code from outbox').get()).toEqual({
      state: 'FAILED',
      last_error: 'refused',
      last_error_code: null,
    });
    // and every launch after it: the column is there, nothing throws, nothing moves
    expect(await migrateLocalDb(runner)).toEqual({
      from: LOCAL_SCHEMA_VERSION,
      to: LOCAL_SCHEMA_VERSION,
    });
    expect(await runner.userVersion()).toBe(LOCAL_SCHEMA_VERSION);
    expect(LOCAL_OUTBOX_ADDITIONS.every(s => /^alter table outbox add column /.test(s))).toBe(true);
    // the insert an older bundle makes, naming its fourteen columns, still lands
    db.exec(
      "insert into outbox (client_op_id, entity, op, entity_id, household_id, payload, depends_on, seq, created_at, state, attempts, next_attempt_at, sending_at, last_error) values ('op2','activity','CREATE','a2','h1','{}',null,2,'2026-09-14T12:00:01Z','PENDING',0,null,null,null)",
    );
    expect(db.prepare('select count(*) as n from outbox').get()).toEqual({ n: 2 });
  });

  /**
   * A PERSON'S PICTURE ON EVERY PHONE (migration 0148; `LOCAL_PROFILE_PICTURE`): three nullable
   * columns on `profiles`, added on the open that first finds them missing and never a version, for
   * the reason the outbox's refusal code gives. That one open resets the profiles cursor, so the
   * household's people are pulled whole once and arrive with their pictures; no open after it does.
   */
  it('gives the profiles their picture on every open, pulls them whole once, and never moves the version', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    expect(columns(db, 'profiles').slice(-3)).toEqual([
      'avatar_path',
      'avatar_preset',
      'avatar_updated_at',
    ]);
    expect(LOCAL_PROFILE_PICTURE.every(s => /^alter table profiles add column /.test(s))).toBe(
      true,
    );
    // a phone from before 0148: the columns missing, the profiles pulled to a cursor, a person there
    for (const c of ['avatar_path', 'avatar_preset', 'avatar_updated_at'])
      db.exec(`alter table profiles drop column ${c}`);
    db.exec(
      "insert into sync_state (household_id, table_name, cursor_updated_at, cursor_id, last_full_sync_at) values ('h1','profiles','2026-09-29T10:00:00Z','u1','2026-09-29T10:00:00Z'), ('h1','children','2026-09-29T10:00:00Z','c1','2026-09-29T10:00:00Z')",
    );
    db.exec(
      "insert into profiles (id, display_name, created_at, updated_at) values ('u1','Brad','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z')",
    );
    expect(await migrateLocalDb(runner)).toEqual({
      from: LOCAL_SCHEMA_VERSION,
      to: LOCAL_SCHEMA_VERSION,
    });
    const cursor = (table: string) =>
      db
        .prepare('select cursor_updated_at, cursor_id from sync_state where table_name = ?')
        .get(table);
    expect(cursor('profiles')).toEqual({ cursor_updated_at: null, cursor_id: null });
    // nothing else is pulled again, and the person is still there, on the initial
    expect(cursor('children')).toEqual({
      cursor_updated_at: '2026-09-29T10:00:00Z',
      cursor_id: 'c1',
    });
    expect(db.prepare('select display_name, avatar_preset from profiles').get()).toEqual({
      display_name: 'Brad',
      avatar_preset: null,
    });
    // the next open finds the columns there: nothing is reset again
    db.exec(
      "update sync_state set cursor_updated_at = '2026-09-30T10:00:00Z', cursor_id = 'u2' where table_name = 'profiles'",
    );
    await migrateLocalDb(runner);
    expect(cursor('profiles')).toEqual({
      cursor_updated_at: '2026-09-30T10:00:00Z',
      cursor_id: 'u2',
    });
    expect(await runner.userVersion()).toBe(LOCAL_SCHEMA_VERSION);
  });

  it('upgrades a v1 file to v2, keeping the rows already in it', async () => {
    const { db, runner } = open();
    for (const stmt of LOCAL_SCHEMA_V1) db.exec(stmt);
    db.exec('pragma user_version = 1');
    db.exec(
      "insert into profiles (id, display_name, created_at, updated_at) values ('u1','Brad','2026-09-01T00:00:00Z','2026-09-01T00:00:00Z')",
    );
    db.exec(
      "insert into outbox (client_op_id, entity, op, entity_id, household_id, payload, seq, created_at, attempts, next_attempt_at) values ('op1','activity','CREATE','a1','h1','{\"ml\":120}',7,'2026-09-01T00:00:00Z',3,'2026-09-01T00:01:00Z')",
    );

    expect(await migrateLocalDb(runner)).toEqual({ from: 1, to: LOCAL_SCHEMA_VERSION });

    expect(tables(db)).toEqual(ALL_TABLES);
    expect(db.prepare('select display_name from profiles').get()).toEqual({
      display_name: 'Brad',
    });
    // the outbox is rebuilt for `sending_at`; a queued op is a log, and rule 7 keeps it
    expect(db.prepare('select * from outbox').get()).toEqual({
      client_op_id: 'op1',
      entity: 'activity',
      op: 'CREATE',
      entity_id: 'a1',
      household_id: 'h1',
      payload: '{"ml":120}',
      depends_on: null,
      seq: 7,
      created_at: '2026-09-01T00:00:00Z',
      state: 'PENDING',
      attempts: 3,
      next_attempt_at: '2026-09-01T00:01:00Z',
      sending_at: null,
      last_error: null,
      // added on the same open, after the ladder (`LOCAL_OUTBOX_ADDITIONS`)
      last_error_code: null,
    });
  });

  it('the outbox has exactly the documented columns, in order, and three indexes', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    expect(columns(db, 'outbox')).toEqual([...OUTBOX_COLUMNS]);
    expect(OUTBOX_COLUMNS).toHaveLength(15);
    // D11: `sending_at` sits between the backoff clock and the error, because it answers a
    // different question — "how long has this been in flight", not "when may it go again".
    expect(OUTBOX_COLUMNS.indexOf('sending_at')).toBe(
      OUTBOX_COLUMNS.indexOf('next_attempt_at') + 1,
    );
    expect(OUTBOX_COLUMNS.indexOf('last_error')).toBe(OUTBOX_COLUMNS.indexOf('sending_at') + 1);
    // the refusal's code beside its words, added on every open rather than by a version
    expect(OUTBOX_COLUMNS.indexOf('last_error_code')).toBe(
      OUTBOX_COLUMNS.indexOf('last_error') + 1,
    );
    const indexes = (
      db
        .prepare(
          "select name from sqlite_master where type = 'index' and tbl_name = 'outbox' and name not like 'sqlite_%'",
        )
        .all() as { name: string }[]
    )
      .map(i => i.name)
      .sort();
    expect(indexes).toEqual(['outbox_entity', 'outbox_ready', 'outbox_seq']);
    db.exec(
      "insert into outbox (client_op_id, entity, op, entity_id, household_id, payload, seq, created_at) values ('op1','activity','CREATE','a1','h1','{}',1,'2026-09-14T12:00:00Z')",
    );
    expect(db.prepare('select state, attempts, sending_at from outbox').get()).toEqual({
      state: 'PENDING',
      attempts: 0,
      sending_at: null,
    });
  });

  it('carries updated_at and deleted_at on every delta table, and only where the server has them', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    // D31: docs/MOBILE.md §7's blanket rule is false against the schema it mirrors. The rule
    // that survives is per strategy, and this is the one that the tombstone logic needs.
    for (const [table, strategy] of Object.entries(PULL_STRATEGY)) {
      if (strategy !== 'delta') continue;
      // care_items (0011) is the one delta table with no tombstone: an item is archived, never
      // removed, so its removal column is archived_at and every logged entry stays
      const removal = table === 'care_items' ? 'archived_at' : 'deleted_at';
      expect(columns(db, table), table).toEqual(expect.arrayContaining(['updated_at', removal]));
    }
    expect(columns(db, 'activities')).toEqual(expect.arrayContaining(['created_at', 'updated_at']));
    // a running timer is hard-deleted server-side, so there is no tombstone to carry and no
    // idempotency key to carry it with; `full` is the only honest strategy for it
    expect(columns(db, 'running_timers')).not.toContain('deleted_at');
    expect(columns(db, 'running_timers')).not.toContain('client_op_id');
    expect(PULL_STRATEGY.running_timers).toBe('full');
    // the ledger is append-only: `revoke update, delete` server-side, nothing to delta on
    expect(columns(db, 'milk_inventory_transactions')).not.toContain('updated_at');
    expect(columns(db, 'milk_inventory_transactions')).not.toContain('deleted_at');
    expect(PULL_STRATEGY.milk_inventory_transactions).toBe('append');
  });

  it('every statement is guarded so a re-run cannot destroy a row', () => {
    expect(LOCAL_SCHEMA_V1.every(s => /if not exists/.test(s))).toBe(true);
    // v2 rebuilds the outbox, which cannot be expressed with `if not exists` alone. Those two
    // statements are named here so the guard rule stays exact instead of being widened.
    const unguarded = LOCAL_SCHEMA_V2.filter(s =>
      s.startsWith('create') ? !/if not exists/.test(s) : !/^drop .* if exists/.test(s),
    );
    expect(unguarded).toEqual([
      LOCAL_SCHEMA_V2.find(s => s.startsWith('insert or ignore into outbox_v2')),
      'alter table outbox_v2 rename to outbox',
    ]);
  });

  it('resumes a v2 upgrade that was killed between two of its statements', async () => {
    const { db, runner } = open();
    for (const stmt of LOCAL_SCHEMA_V1) db.exec(stmt);
    db.exec('pragma user_version = 1');
    // the one window where the rebuild is not a no-op to re-enter: the old table is gone and
    // the new one has not been renamed into its place yet
    db.exec('drop table outbox');
    expect(await migrateLocalDb(runner)).toEqual({ from: 1, to: LOCAL_SCHEMA_VERSION });
    expect(columns(db, 'outbox')).toEqual([...OUTBOX_COLUMNS]);
    expect(tables(db)).toEqual(ALL_TABLES);
  });

  it('a file written by a newer build is refused, not half-migrated', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    db.exec('pragma user_version = 99');
    await expect(migrateLocalDb(runner)).rejects.toThrow(LocalSchemaTooNewError);
    await expect(migrateLocalDb(runner)).rejects.toThrow(/v99/);
    // and it left the file alone
    expect(await runner.userVersion()).toBe(99);
  });

  it('local-only columns are exactly the two the parity test excuses', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    expect(columns(db, 'activities')).toContain('local_synced');
    expect(db.prepare('pragma table_info(activities)').all()).toContainEqual(
      expect.objectContaining({ name: 'local_synced', dflt_value: '0', notnull: 1 }),
    );
  });

  it('the widget intent queue carries the dedupe window the widget showed', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    expect(columns(db, 'widget_intents')).toEqual([
      'client_op_id',
      'entity_id',
      'module',
      'op',
      'payload',
      'child_id',
      'household_id',
      'at',
      'dedupe_key',
      'dedupe_window_ms',
      'widget',
      'consumed_at',
    ]);
  });

  it('sync_state is keyed by household and table, and carries the cursor id', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    // D15: the shipped v1 table was keyed by `table_name` alone while every pull is
    // household-scoped and a parent can belong to two households.
    expect(columns(db, 'sync_state')).toEqual([
      'household_id',
      'table_name',
      'cursor_updated_at',
      'cursor_id',
      'last_full_sync_at',
      'phase',
      'page_token',
    ]);
    const pk = (db.prepare('pragma table_info(sync_state)').all() as { name: string; pk: number }[])
      .filter(c => c.pk > 0)
      .sort((a, b) => a.pk - b.pk)
      .map(c => c.name);
    expect(pk).toEqual(['household_id', 'table_name']);
  });

  it('declares no foreign keys, so a page that arrives before its parent still lands', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    for (const t of ALL_TABLES) {
      expect(db.prepare(`pragma foreign_key_list(${t})`).all(), t).toEqual([]);
    }
    db.exec('pragma foreign_keys = on');
    db.exec(
      "insert into bottle_details (activity_id, consumed_ml) values ('no-such-activity', 120)",
    );
    expect(db.prepare('select count(*) as n from bottle_details').get()).toEqual({ n: 1 });
  });

  it('indexes the hot paths and the two local idempotency keys', async () => {
    const { db, runner } = open();
    await migrateLocalDb(runner);
    const named = (
      db
        .prepare(
          "select name, tbl_name from sqlite_master where type = 'index' and name not like 'sqlite_%' order by name",
        )
        .all() as { name: string; tbl_name: string }[]
    ).map(i => i.name);
    expect(named).toEqual([
      'activities_child_time',
      'activities_client_op',
      // the read indexes, on every open and never a version (`LOCAL_READ_INDEXES`)
      'activities_hh_time',
      'activities_hh_type_end',
      'activities_hh_type_time',
      'activities_hh_updated',
      'app_message_impressions_at',
      'care_items_household',
      'household_tasks_household',
      'milk_containers_hh_status',
      'milk_txn_client_op',
      'milk_txn_container',
      'milk_txn_hh_time',
      // NibbleCue's records by household and kind (v22)
      'nibble_records_household',
      'outbox_entity',
      'outbox_ready',
      'outbox_seq',
      'photo_queue_ready',
      'schedule_instances_hh_date',
      'schedule_instances_rule',
      'schedule_instances_status_time',
      'shopping_items_household',
      'supply_items_household',
      'vaccine_records_child',
    ]);
    const ins =
      "insert into activities (id, client_op_id, household_id, type, start_at, metadata, created_by, created_at, updated_at) values (?, 'op-1', 'h1', 'bottle', '2026-09-14T09:00:00Z', '{}', 'u1', '2026-09-14T09:00:00Z', '2026-09-14T09:00:00Z')";
    db.prepare(ins).run('a1');
    expect(() => db.prepare(ins).run('a2')).toThrow(/UNIQUE/i);
  });

  it('PULL_STRATEGY covers every mirrored table except the details, which travel embedded', () => {
    const detailTables = MIRRORED_TABLES.filter(t => t.endsWith('_details'));
    // the eight of 0001 and the Health note's (0160)
    expect(detailTables).toHaveLength(9);
    expect(Object.keys(PULL_STRATEGY).sort()).toEqual(
      MIRRORED_TABLES.filter(t => !detailTables.includes(t))
        .slice()
        .sort(),
    );
  });
});
