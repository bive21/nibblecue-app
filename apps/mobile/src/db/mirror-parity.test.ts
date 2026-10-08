/**
 * The mirror is pinned to the server, not to a document.
 *
 * `docs/MOBILE.md` §7 states the rule as prose — "the same names and columns as schema.sql" —
 * and prose does not fail a build. This test parses `supabase/migrations/*.sql`, rebuilds each
 * server table's column list from the `create table` blocks and the later `add column`
 * clauses, and compares it against what `schema.ts` actually creates. A renamed, invented or
 * misspelled mirrored column fails here, in node, in a second, instead of failing as an empty
 * Today screen against a real project.
 *
 * Two lists carry the exceptions, and both are deliberately literal so that widening one is a
 * visible edit rather than a silent drift.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_SERVER_MIGRATIONS, SERVER_MIGRATIONS } from '../testing/serverMigrations';
import { migrateLocalDb, MIRRORED_TABLES, type SqlRunner, type TableColumn } from './schema';

/*
  THE SERVER'S MIGRATIONS ARE CUDDLECUE'S REPOSITORY'S (NibbleCue shares its Supabase project, and
  its own 0161/0162 live there too), so this reads that checkout (`testing/serverMigrations.ts`:
  `../cuddlecue-app/supabase/migrations` by default, or `CUDDLECUE_MIGRATIONS_DIR`). Without it the
  suite is skipped, not failed: this repository alone cannot see the server's schema.
*/
const MIGRATIONS = SERVER_MIGRATIONS;

/** Comments and string literals, masked so a `--` or a paren inside one cannot confuse the
 *  paren scanner below. Masking keeps the offsets, so every index stays valid. */
function mask(sql: string): string {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    if (sql.startsWith('--', i)) {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length && sql[j] !== "'") j += 1;
      out += ' '.repeat(Math.min(j, sql.length - 1) - i + 1);
      i = j + 1;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

const CONSTRAINT = /^(constraint|primary\s+key|unique|foreign\s+key|check|exclude|like)\b/i;

/** The column names of one `create table` body, in declaration order. */
function bodyColumns(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of body) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) {
      parts.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts
    .map(p => p.trim())
    .filter(p => p.length > 0 && !CONSTRAINT.test(p))
    .map(p => p.split(/\s/)[0] ?? '')
    .map(p => p.replace(/"/g, ''));
}

/** Every table the migrations define, with the columns they end up holding. */
function serverTables(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  const files = readdirSync(MIGRATIONS)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const raw = readFileSync(join(MIGRATIONS, file), 'utf8');
    const masked = mask(raw);
    const create = /create\s+table\s+(if\s+not\s+exists\s+)?([a-z_.]+)\s*\(/gi;
    let m: RegExpExecArray | null;
    while ((m = create.exec(masked)) !== null) {
      const name = (m[2] ?? '').replace(/^public\./, '');
      /*
        `create table if not exists` OVER A TABLE AN EARLIER FILE MADE DOES NOTHING — in Postgres,
        and so here. This parser used to let the later body replace the earlier one, which is how
        0016's `household_tasks` and 0017's `supply_items` read as the tables the mirror has while
        the real ones were still 0001's: every checklist and catalog op then failed on the server
        (42703/42804, answered SERVER) and the phone said "We can't reach the server" (2026-09-28;
        migration 0135 gave the tables the columns those files declared).
      */
      if (m[1] !== undefined && out.has(name)) continue;
      let depth = 1;
      let i = create.lastIndex;
      while (i < masked.length && depth > 0) {
        if (masked[i] === '(') depth += 1;
        if (masked[i] === ')') depth -= 1;
        i += 1;
      }
      // the body comes from the masked text, so a comment can never look like a column
      out.set(name, bodyColumns(masked.slice(create.lastIndex, i - 1)));
    }
    const alter = /alter\s+table\s+(?:only\s+)?([a-z_.]+)([\s\S]*?);/gi;
    while ((m = alter.exec(masked)) !== null) {
      const name = (m[1] ?? '').replace(/^public\./, '');
      const cols = out.get(name);
      if (!cols) continue;
      const add = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi;
      let a: RegExpExecArray | null;
      while ((a = add.exec(m[2] ?? '')) !== null) if (a[1]) cols.push(a[1]);
    }
  }
  return out;
}

async function localTables(): Promise<Map<string, string[]>> {
  const db = new DatabaseSync(':memory:');
  const runner: SqlRunner = {
    exec: sql => db.exec(sql),
    userVersion: () =>
      (db.prepare('pragma user_version').get() as { user_version: number }).user_version,
    setUserVersion: v => db.exec(`pragma user_version = ${v}`),
    tableInfo: t => db.prepare(`pragma table_info(${t})`).all() as unknown as TableColumn[],
  };
  await migrateLocalDb(runner);
  const out = new Map<string, string[]>();
  for (const t of MIRRORED_TABLES) {
    out.set(
      t,
      (db.prepare(`pragma table_info(${t})`).all() as { name: string }[]).map(c => c.name),
    );
  }
  return out;
}

/**
 * Local columns with no server column behind them. Every entry is a decision, not an oversight:
 *
 *   `activities.local_synced`  the queued/synced flag TimelineItem reads (WP5). It is device
 *                              state — whether *this* phone has flushed the row — and has no
 *                              meaning on the server, where the row's existence is the answer.
 *   `household_members.is_mom` shipped in WP2 and exists on no server table, in no migration
 *                              and in no document. It is read locally and never pushed; D18
 *                              scopes `applyFull` so a bootstrap cannot reset it. Deleting it
 *                              is a WP5 decision about who "mom" is, not a WP4 one.
 *   the four `created_at` / `deleted_at` stamps on `household_members`, `module_settings` and
 *                              `subscription_entitlements` come from WP2's `mirrored()` helper,
 *                              which appended them to every table on the strength of
 *                              docs/MOBILE.md §7's blanket rule. The server has none of them:
 *                              a membership is removed with `removed_at`, module settings are
 *                              replaced wholesale, and an entitlement is the store's to
 *                              revoke. All three are `full`-strategy tables (D17), so nothing
 *                              reads these columns and nothing writes them. They stay because
 *                              dropping a column is a table rebuild on live installs, and WP4
 *                              rebuilds only the outbox, where it buys something.
 */
const LOCAL_ONLY: Readonly<Record<string, readonly string[]>> = {
  activities: ['local_synced'],
  /* in-app messages (migration 0104): this reader's own answer, DERIVED by the pull page from
     their dismissal row rather than stored as columns of `app_messages`. */
  app_messages: ['my_action', 'my_at'],
  household_members: ['is_mom', 'updated_at', 'deleted_at'],
  module_settings: ['created_at', 'deleted_at'],
  subscription_entitlements: ['created_at', 'deleted_at'],
  /* NibbleCue's records (local v22): the server's 0161 keeps applied ops in its own
     `nibble_applied_ops`, so its `nibble_records` has no `client_op_id`. The phone's table carries
     a nullable one that no write or pull fills (`packages/core/src/nibble/records.ts`). */
  nibble_records: ['client_op_id'],
};

/**
 * The tables WP4.2 mirrors column for column, in the server's own order. Everything the sync
 * layer reads or writes is here; what is absent is the six WP2 tables below, which the
 * accounts flow mirrors only in part.
 */
const EXACT = [
  'activities',
  'care_items',
  'bottle_details',
  'breastfeed_details',
  'pump_details',
  'sleep_details',
  'diaper_details',
  'solids_details',
  'med_details',
  'measurement_details',
  // the Health note's chips (migration 0160): two columns, mirrored column for column
  'wellbeing_details',
  'running_timers',
  'favorites',
  'storage_locations',
  'milk_containers',
  'milk_inventory_transactions',
  'milk_guidance_profiles',
  'schedule_phases',
  'schedule_rules',
  'schedule_instances',
  'reminders',
  'notification_preferences',
  // the mom-privacy switch (migration 0103): five columns, mirrored column for column
  'privacy_preferences',
  'vaccine_guidance_profiles',
  'vaccine_tracking_settings',
  'vaccine_records',
  // the household's waking window (migration 0095): four columns, mirrored column for column
  'household_settings',
  // who's on (migration 0113): the household's shifts, four columns, mirrored column for column
  'household_duty',
  // the shopping list (WP6b): an ordinary household row, mirrored column for column. The
  // checklist and the catalog are below, in NOT_MIRRORED: 0001 made their tables first
  'shopping_items',
  // NibbleCue's own records (migration 0161), mirrored column for column but for `client_op_id`
  'nibble_records',
];

/**
 * The WP2 tables, which mirror what the accounts flow reads and no more — and the checklist and
 * the catalog, whose tables 0001 made before 0016/0017 declared them. The server columns each one
 * leaves behind are pinned so the partial mirror is a stated fact with a size, not an open-ended
 * licence: a new server column landing in one of these tables fails this test and gets a
 * decision, and a mirrored column the server does not have fails it too.
 */
const NOT_MIRRORED: Readonly<Record<string, readonly string[]>> = {
  /* Who composed a message is staff-side bookkeeping: the card does not say it, the archive does
     not say it, and a phone has no use for an admin's id. */
  app_messages: ['created_by'],
  profiles: [
    'initials',
    // `weight_unit`, `length_unit` and `temp_unit` LEFT this list on 2026-09-24 (local v18): the
    // parent's own units, which every measurement sheet and every reading on screen follows
    'clock_24h',
    'theme',
    'color_scheme',
    'age_gate_region',
    'age_gate_threshold',
    'age_gate_passed_at',
    // 0092_admin_account_controls.sql, the admin console's moderation fields. Deliberately not
    // mirrored, and not merely unneeded: `suspended_by` is an ADMIN's user id, and mirroring it
    // would put a staff member's identity in a household's local database on every phone. A
    // suspended account is told by the server on its next call; a device does not need to carry
    // who did it or why. This list is asserted to match the server EXACTLY, so this is a
    // declaration, not a mute.
    'suspended_at',
    'suspended_by',
    'suspension_reason',
    // 0100_terms_acceptance.sql: which version of the Terms of Use / Privacy Policy pair this
    // person accepted, and when. Read once per launch through the account state (AuthContext
    // phase `terms`), never queried locally; a device that mirrored it would only be caching a
    // fact the next account read settles anyway.
    'terms_version',
    'terms_accepted_at',
  ],
  households: [
    // guidance_profile / guidance_version joined the mirror in v4 (WP6): the stash reads the pin
    'client_op_id',
    // 0092_admin_account_controls.sql. The app already mirrors `welcome_expires_at`, which is the
    // only part of an extension a device has to act on; these three are the audit trail for who
    // granted it, and `welcome_extended_by` is an ADMIN's user id.
    'welcome_extended_at',
    'welcome_extended_by',
    'welcome_extended_days',
    // 0093_household_heard_from.sql. Where the parent heard about the app: marketing
    // bookkeeping the server keeps and nothing on a phone reads. The account state carries it
    // (`Membership.heard_from`) so the free download can put the parent's own answer in the
    // parent's own copy, which is the one place a device shows it.
    'heard_from',
    // 0143_leave_a_household_nobody_else_is_in.sql: who closed a household and when it is purged.
    // A closed household is gone for everyone (`app.is_member`), so no phone ever pulls a row with
    // either set; the one that closed it keeps what the close answered (`auth/leave.ts`).
    'closed_by',
    'purge_after',
    // 0150_expecting.sql: the household's 14 days of Plus wait for the birth. Read through the
    // account state (`Membership.welcome_waits_for_birth`, the Today card and the Plan page), and
    // cleared by `record_birth` in the same write that starts them, so a phone acts on the plan the
    // account read brings and has nothing to keep in its own copy.
    'welcome_waits_for_birth',
  ],
  /*
    `expires_at` (0101), the end of a temporary caregiver's seat, JOINED the mirror on 2026-09-24
    (local v18) — for ROUTING, not access. The phone still never decides whether a seat is live:
    the server enforces it in `app.is_member`, which every RLS policy is built over, and the
    Family page still reads the roster live through `household_roster`. But which phone rings is
    decided on the phone, often asleep and offline, and a sitter on until the morning whose seat
    ended at eleven kept every parent's phone quiet all night (the handoff audit, H4).
  */
  household_members: ['nickname'],
  // `photo_path` and `photo_updated_at` LEFT this list on 2026-09-20 (local v12), when the
  // baby's picture got a surface: the path is what every device reads to know whether there is
  // one and which version it is, and a photo the other parent set has to be visible on a cold
  // start with no network like every other shared fact. The IMAGE is still not mirrored — it is
  // a cached file under `documentDirectory`, keyed by the stamp.
  children: ['nickname', 'avatar_key', 'is_active'],
  /*
    THE CHECKLIST (WP6c) AND THE CATALOG (WP6d) mirror every column their sync branches write and
    the pull brings — 0016's and 0017's, which 0135 put on the server — and not the columns of
    0001's older design that the tables were first made with and no branch writes: a per-child,
    priced, photographed catalog item, and a checklist line's first assignee and archive.
  */
  household_tasks: ['assignee_id', 'archived_at'],
  supply_items: [
    'child_id',
    'owner_scope',
    'price_cents',
    'currency',
    'product_url',
    'photo_path',
    'photo_updated_at',
    'is_needed',
    'needed_at',
    'sort_order',
    'updated_by',
  ],
  module_settings: [],
  subscription_entitlements: [
    'provider',
    'app_user_id',
    'product_id',
    'store',
    'entitlements',
    'trial_started_at',
    'trial_ends_at',
    'grace_until',
    'will_renew',
    'cancelled_at',
    'revoked_at',
    // 0122_store_events.sql: when the store state the row holds was true, so a late webhook never
    // undoes a newer one. The server orders the store's events; a phone never does, and the plan
    // it shows comes from the account read (`my_household_plans`), not from this mirror
    'last_event_at',
  ],
};

const server = HAS_SERVER_MIGRATIONS ? serverTables() : new Map<string, string[]>();
const local = await localTables();

describe.skipIf(!HAS_SERVER_MIGRATIONS)('mirror parity with supabase/migrations (WP4 D31)', () => {
  it('parses the migrations rather than trusting a regex that matched nothing', () => {
    expect(server.size).toBeGreaterThan(50);
    expect(server.get('activities')?.[0]).toBe('id');
    expect(server.get('activities')).toContain('deleted_at');
    // 0008 adds three columns to profiles by `alter table`; a parser that reads only
    // `create table` would silently call them local-only
    expect(server.get('profiles')).toContain('age_gate_passed_at');
    expect(server.get('households')).toContain('welcome_expires_at');
    // a `check (... in (...))` inside a column definition is not a column
    expect(server.get('solids_details')).toEqual([
      'activity_id',
      'meal',
      'food',
      'taken',
      'observation',
      // 0114 adds the meal's food list by `alter table` (docs/SOLIDS.md)
      'items',
    ]);
    // and neither is a table constraint
    expect(server.get('activities')).not.toContain('constraint');
    expect(server.get('notification_preferences')).not.toContain('primary');
    // `create table if not exists` over a table an earlier file made is a no-op, as in Postgres:
    // 0017's `supply_items` and 0016's `household_tasks` never replaced 0001's
    expect(server.get('supply_items')).toContain('product_url');
    expect(server.get('household_tasks')).toContain('assignee_id');
  });

  it('every mirrored table names a table the server actually has', () => {
    for (const t of MIRRORED_TABLES) expect(server.has(t), t).toBe(true);
    // CuddleCue's 38, and NibbleCue's `nibble_records` (0161)
    expect(MIRRORED_TABLES).toHaveLength(39);
    expect([...EXACT, ...Object.keys(NOT_MIRRORED)].sort()).toEqual([...MIRRORED_TABLES].sort());
  });

  it('the sync tables carry exactly the server columns, in the server order', () => {
    for (const t of EXACT) {
      const excluded = LOCAL_ONLY[t] ?? [];
      const mine = (local.get(t) ?? []).filter(c => !excluded.includes(c));
      expect(mine, t).toEqual(server.get(t));
    }
  });

  it('the accounts tables mirror a stated subset, and invent nothing', () => {
    for (const [t, missing] of Object.entries(NOT_MIRRORED)) {
      const excluded = LOCAL_ONLY[t] ?? [];
      const mine = (local.get(t) ?? []).filter(c => !excluded.includes(c));
      const theirs = server.get(t) ?? [];
      expect(
        mine.filter(c => !theirs.includes(c)),
        `${t}: local column not on the server`,
      ).toEqual([]);
      expect(
        theirs.filter(c => !mine.includes(c)),
        `${t}: server column not mirrored`,
      ).toEqual([...missing]);
    }
  });

  it('no mirrored table carries a local-only column that is not declared here', () => {
    for (const t of MIRRORED_TABLES) {
      const theirs = server.get(t) ?? [];
      const undeclared = (local.get(t) ?? []).filter(
        c => !theirs.includes(c) && !(LOCAL_ONLY[t] ?? []).includes(c),
      );
      expect(undeclared, t).toEqual([]);
    }
    // and nothing is excused that is not actually local-only
    for (const [t, cols] of Object.entries(LOCAL_ONLY)) {
      for (const c of cols) {
        expect(server.get(t) ?? [], `${t}.${c}`).not.toContain(c);
        expect(local.get(t) ?? [], `${t}.${c}`).toContain(c);
      }
    }
  });
});
