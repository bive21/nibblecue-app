/**
 * A seeded local database for the WP4 write-path tests. **Test-only** (see ./local-db.ts and
 * `no-bundle.test.ts`).
 *
 * One household, one caregiver, two children — twins, because the fan-out and the per-child
 * duplicate guard are two of the things most worth proving and both need a second baby. The
 * ids are fixed uuids so a failure message names the same row every time, and the id source is
 * seeded so a test can assert on an id it did not have to capture.
 *
 * Every helper takes the `Db`, never the raw handle: the point of the seam is that the tests
 * run the same code the device runs.
 */
import { deriveOpId } from '@nibblecue/core';
import { setIdSource } from '../data/ids';
import type { Db } from '../db/driver';
import { FakeClock } from './clock';
import { openTestDb } from './local-db';

export const HOUSEHOLD = 'aaaaaaaa-0000-4000-8000-000000000001';
export const USER = 'bbbbbbbb-0000-4000-8000-000000000001';
export const CHILD_A = 'cccccccc-0000-4000-8000-0000000000e1';
export const CHILD_B = 'cccccccc-0000-4000-8000-0000000000e2';
export const LOCATION = 'dddddddd-0000-4000-8000-000000000001';

/** A deterministic uuid source: valid v4 shape, so `deriveOpId` accepts it. */
export function seededIds(prefix = 'eeeeeeee'): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
  };
}

export interface Fixture {
  db: Db;
  clock: FakeClock;
  /** Put the platform id source back. Every test that seeds ids must call it. */
  restoreIds(): void;
}

const AT = '2026-09-14T08:00:00.000Z';

/** A migrated database with the household, the caregiver and the twins already in it. */
export async function seedHousehold(options: { idPrefix?: string } = {}): Promise<Fixture> {
  const { db } = await openTestDb();
  const clock = new FakeClock(AT);
  setIdSource(seededIds(options.idPrefix));

  await db.run(
    'insert into profiles (id, display_name, email, created_at, updated_at) values (?, ?, ?, ?, ?)',
    [USER, 'Dana', null, AT, AT],
  );
  await db.run(
    'insert into households (id, name, owner_id, home_time_zone, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
    [HOUSEHOLD, 'The Rivera house', USER, 'America/Los_Angeles', AT, AT],
  );
  for (const [id, name] of [
    [CHILD_A, 'Emma'],
    [CHILD_B, 'Liam'],
  ] as const) {
    await db.run(
      'insert into children (id, household_id, name, birth_date, created_at, updated_at) values (?, ?, ?, ?, ?, ?)',
      [id, HOUSEHOLD, name, '2026-06-01', AT, AT],
    );
  }
  await db.run(
    'insert into storage_locations (id, household_id, name, kind, sort_order, is_default) values (?, ?, ?, ?, ?, ?)',
    [LOCATION, HOUSEHOLD, 'Fridge', 'FRIDGE', 0, 1],
  );

  return { db, clock, restoreIds: () => setIdSource(null) };
}

export interface SeedContainer {
  id: string;
  amountMl: number;
  pumpedAt?: string;
  status?: 'STORED' | 'THAWING';
}

/** The seed ADD row's id, derived from the container so two seeds never collide. */
const seedLedgerId = (containerId: string): string => deriveOpId(containerId, 'seed');

/** Put milk in the stash, with the ledger row that explains it (the balance identity). */
export async function seedContainer(db: Db, c: SeedContainer): Promise<void> {
  const pumpedAt = c.pumpedAt ?? AT;
  await db.run(
    `insert into milk_containers
       (id, household_id, owner_id, location_id, container_type, amount_ml, initial_ml,
        pumped_at, status, created_by, created_at, updated_at)
     values (?, ?, ?, ?, 'BAG', ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.id,
      HOUSEHOLD,
      USER,
      LOCATION,
      c.amountMl,
      c.amountMl,
      pumpedAt,
      c.status ?? 'STORED',
      USER,
      pumpedAt,
      pumpedAt,
    ],
  );
  await db.run(
    `insert into milk_inventory_transactions
       (id, client_op_id, household_id, container_id, kind, delta_ml, to_location_id,
        occurred_at, created_by, created_at)
     values (?, ?, ?, ?, 'ADD', ?, ?, ?, ?, ?)`,
    [
      seedLedgerId(c.id),
      seedLedgerId(c.id),
      HOUSEHOLD,
      c.id,
      c.amountMl,
      LOCATION,
      pumpedAt,
      USER,
      pumpedAt,
    ],
  );
}

/** Count rows, with the soft-delete filter every read in the app uses. */
export async function liveCount(db: Db, table: string): Promise<number> {
  const row = await db.get<{ n: number }>(`select count(*) as n from ${table}`, []);
  return row?.n ?? 0;
}

export async function liveActivities(db: Db): Promise<number> {
  const row = await db.get<{ n: number }>(
    'select count(*) as n from activities where deleted_at is null',
    [],
  );
  return row?.n ?? 0;
}

/* ---------------------------------------------------------------- WP7: routines */

export const PHASE = 'ffffffff-0000-4000-8000-0000000000f1';

export interface SeedPhase {
  id?: string;
  name?: string;
  childId?: string | null;
  isCurrent?: boolean;
  /** `yyyy-mm-dd` */
  effectiveFrom?: string;
}

/** A routine phase; current and household-wide unless said otherwise. */
export async function seedPhase(db: Db, p: SeedPhase = {}): Promise<string> {
  const id = p.id ?? PHASE;
  await db.run(
    `insert into schedule_phases
       (id, household_id, child_id, name, effective_from, effective_to, is_current, created_at, updated_at)
     values (?, ?, ?, ?, ?, null, ?, ?, ?)`,
    [
      id,
      HOUSEHOLD,
      p.childId ?? null,
      p.name ?? 'Newborn',
      p.effectiveFrom ?? '2026-09-01',
      p.isCurrent === false ? 0 : 1,
      AT,
      AT,
    ],
  );
  return id;
}

export interface SeedRule {
  id: string;
  phaseId?: string;
  childId?: string | null;
  activity?: string;
  ruleType?: 'FIXED' | 'INTERVAL' | 'RELATIVE' | 'CADENCE';
  /** `HH:MM:SS`, as the mirror carries a Postgres `time`. */
  atLocalTime?: string | null;
  everyMinutes?: number | null;
  remindUserIds?: readonly string[];
  name?: string | null;
  deletedAt?: string | null;
}

/** A schedule rule in a phase: a 3-hour pump interval unless said otherwise. */
export async function seedRule(db: Db, r: SeedRule): Promise<void> {
  const ruleType = r.ruleType ?? 'INTERVAL';
  await db.run(
    `insert into schedule_rules
       (id, household_id, phase_id, child_id, activity, effective_from, rule_type, at_local_time,
        every_minutes, remind_user_ids, name, created_at, updated_at, deleted_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.id,
      HOUSEHOLD,
      r.phaseId ?? PHASE,
      r.childId ?? null,
      r.activity ?? 'pump',
      AT,
      ruleType,
      r.atLocalTime ?? (ruleType === 'INTERVAL' ? null : '08:30:00'),
      r.everyMinutes ?? (ruleType === 'INTERVAL' ? 180 : null),
      JSON.stringify(r.remindUserIds ?? [USER]),
      r.name ?? null,
      AT,
      AT,
      r.deletedAt ?? null,
    ],
  );
}
