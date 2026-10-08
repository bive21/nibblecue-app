/**
 * Reads over the milk stash mirror.
 *
 * `milk_containers` has no `deleted_at`: a container leaves the stash by STATUS — `USED` when
 * it is empty, `DISCARDED` when it is thrown away — because "where did this milk go?" has to
 * stay answerable, and a deleted row answers nothing (`docs/MILK_STASH.md` §2). So every read
 * here filters on status, which is the same rule in the shape this table takes.
 *
 * `amount_ml` is the balance trigger's column on the server and the repository's optimistic
 * mirror of it here. Nothing in this file recomputes a total from the ledger: two answers to
 * "how much milk is there" is exactly the drift §4.62 is about. The ledger sum is available as
 * `ledgerBalanceMl` for a test that wants to prove the two agree.
 *
 * No date is computed here. A container's best-use and guidance-limit dates come from
 * `guidanceDates` in packages/core with the household's profile (data/guidance.ts), at read
 * time, from `kind` and the container's own timestamps — never stored, so a condition change
 * on a location moves every date in one repaint (SCHEDULE_AND_LOCATIONS.md §3.4).
 */
import type { MilkStorageKind, MilkTxnKind } from '@nibblecue/core';
import type { Db, Tx } from '../driver';
import { NOT_WATER_BOTTLE_SQL } from './schedule';

export interface StashSummary {
  /** Millilitres in containers that are still in the stash. */
  totalMl: number;
  /** How many containers those are. */
  containers: number;
  /** Of those, how many are out of the freezer and being thawed. */
  thawing: number;
}

const IN_STASH = `status in ('STORED', 'THAWING')`;

export async function stashSummary(db: Db, householdId: string): Promise<StashSummary> {
  const row = await db.get<{ totalMl: number | null; containers: number; thawing: number }>(
    `select sum(amount_ml) as totalMl,
            count(*) as containers,
            sum(case when status = 'THAWING' then 1 else 0 end) as thawing
       from milk_containers where household_id = ? and ${IN_STASH}`,
    [householdId],
  );
  return {
    totalMl: row?.totalMl ?? 0,
    containers: row?.containers ?? 0,
    thawing: row?.thawing ?? 0,
  };
}

export interface StashByLocation {
  location_id: string;
  name: string | null;
  /**
   * The location's kind — ROOM, FRIDGE, FREEZER, DEEP_FREEZER or THAWED — so Today can add the
   * ounces up by KIND and draw a glyph for each rather than naming every shelf the household
   * has (the owner, 2026-09-19). Null when the location row is gone.
   */
  kind: string | null;
  totalMl: number;
  containers: number;
}

/** The stash broken down by where it is kept — the stash screen's sections. */
export async function stashByLocation(db: Db, householdId: string): Promise<StashByLocation[]> {
  return db.all<StashByLocation>(
    `select c.location_id as location_id, l.name as name, l.kind as kind,
            sum(c.amount_ml) as totalMl, count(*) as containers
       from milk_containers c
       left join storage_locations l on l.id = c.location_id and l.deleted_at is null
      where c.household_id = ? and c.${IN_STASH}
      group by c.location_id, l.name, l.kind
      order by l.sort_order, l.name`,
    [householdId],
  );
}

/** A container with its location, as every stash surface reads it. */
export interface StashContainerRow {
  id: string;
  household_id: string;
  owner_id: string;
  source_activity_id: string | null;
  location_id: string;
  container_type: string;
  amount_ml: number;
  initial_ml: number;
  pumped_at: string;
  first_frozen_at: string | null;
  thawed_at: string | null;
  used_at: string | null;
  discarded_at: string | null;
  discard_reason: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  location_name: string | null;
  location_short: string | null;
  /** The condition, from the location; null when the location row is gone from the mirror. */
  location_kind: MilkStorageKind | null;
}

const CONTAINER_SELECT = `select c.id, c.household_id, c.owner_id, c.source_activity_id, c.location_id,
            c.container_type, c.amount_ml, c.initial_ml, c.pumped_at, c.first_frozen_at,
            c.thawed_at, c.used_at, c.discarded_at, c.discard_reason, c.status, c.notes,
            c.created_at,
            l.name as location_name, l.short_name as location_short, l.kind as location_kind
       from milk_containers c
       left join storage_locations l on l.id = c.location_id`;

/** Every container still in the stash, oldest pumped first. */
export async function stashContainers(
  db: Db | Tx,
  householdId: string,
): Promise<StashContainerRow[]> {
  return db.all<StashContainerRow>(
    `${CONTAINER_SELECT}
      where c.household_id = ? and c.${IN_STASH}
      order by c.pumped_at asc, c.id asc`,
    [householdId],
  );
}

export async function containerById(
  db: Db | Tx,
  containerId: string,
): Promise<StashContainerRow | undefined> {
  return db.get<StashContainerRow>(`${CONTAINER_SELECT} where c.id = ?`, [containerId]);
}

/**
 * What the ledger says a container holds. The append-only sum, for reconciliation only — the
 * number a screen shows is `milk_containers.amount_ml`.
 */
export async function ledgerBalanceMl(t: Tx, containerId: string): Promise<number> {
  const row = await t.get<{ balance: number | null }>(
    'select sum(delta_ml) as balance from milk_inventory_transactions where container_id = ?',
    [containerId],
  );
  return row?.balance ?? 0;
}

export interface LedgerLineRow {
  id: string;
  client_op_id: string;
  kind: MilkTxnKind;
  delta_ml: number;
  occurred_at: string;
  /** The bottle a draw poured, or the session a bag was stored from (core `entriesOf`). */
  activity_id: string | null;
}

/**
 * The household's ledger rows at or after `sinceIso` — the weekly balance, the week a day at a
 * time and the 7-day pair.
 *
 * WITH THEIR IDS (2026-09-27): an Undo's row is found by the id it derives from the row it takes
 * back, and core takes the two out together before it sums anything (`withoutUndone`). Every drawn
 * flow's Undo falls after the flow itself — an Undo is written when it is tapped, never dated back
 * — so a window that holds the write holds its Undo too.
 */
export async function ledgerSince(
  db: Db | Tx,
  householdId: string,
  sinceIso: string,
): Promise<LedgerLineRow[]> {
  return db.all<LedgerLineRow>(
    `select id, client_op_id, kind, delta_ml, occurred_at, activity_id
       from milk_inventory_transactions
      where household_id = ? and occurred_at >= ?
      order by occurred_at asc`,
    [householdId, sinceIso],
  );
}

/** One bottle or breastfeed from the log — what the stash's daily need is counted from. */
export interface FeedRow {
  type: string;
  child_id: string | null;
  start_at: string;
  /** A bottle's volume in canonical ml, or null (a breastfeed, or a bottle logged without one). */
  quantity: number | null;
  is_private: number;
  created_by: string;
}

/**
 * THE FEEDS SINCE `sinceIso`, every baby's — bottles and breastfeeds alike, and never a bottle of
 * water, which is logged and kept and is not a feed (`NOT_WATER_BOTTLE_SQL`, the feeding audit's
 * M7). The stash's "Enough for / ~N days" is how long it covers if every one of these came from it
 * (`packages/core/src/stash/outlook.ts`, docs/MILK_STASH.md §10b).
 */
export async function feedsSince(
  db: Db,
  householdId: string,
  sinceIso: string,
): Promise<FeedRow[]> {
  return db.all<FeedRow>(
    `select a.type, a.child_id, a.start_at, a.quantity, a.is_private, a.created_by
       from activities a
      where a.household_id = ? and a.deleted_at is null and a.start_at >= ?
        and a.type in ('bottle', 'breastfeed')
        and ${NOT_WATER_BOTTLE_SQL}
      order by a.start_at asc`,
    [householdId, sinceIso],
  );
}

/**
 * When this household last touched the stash, for the overview's "Updated <relative time>".
 *
 * THE LEDGER AND THE CONTAINERS, BOTH. A container's `updated_at` moves when it is added, moved
 * or renamed; a ledger row is written when milk is used or discarded and the container it came
 * from may then be USED and out of the reads above. Either is a change a parent made, and asking
 * only one of them would show a caption that stood still through an afternoon of feeds.
 */
export async function stashLastChangeAt(db: Db, householdId: string): Promise<string | null> {
  const row = await db.get<{ at: string | null }>(
    `select max(at) as at from (
        select max(updated_at) as at from milk_containers where household_id = ?
        union all
        select max(occurred_at) as at from milk_inventory_transactions where household_id = ?
      )`,
    [householdId, householdId],
  );
  return row?.at ?? null;
}

/* ----------------------------------------------------------------- locations */

export interface LocationRow {
  id: string;
  household_id: string;
  name: string;
  short_name: string | null;
  kind: MilkStorageKind;
  sort_order: number;
  is_default: boolean;
  deleted_at: string | null;
}

const LOCATION_SELECT = `select id, household_id, name, short_name, kind, sort_order,
            is_default, deleted_at from storage_locations`;

/** SQLite hands booleans back as 0/1; the row type says boolean. */
type RawLocation = Omit<LocationRow, 'is_default'> & { is_default: number | boolean };

const asLocation = (r: RawLocation): LocationRow => ({
  ...r,
  is_default: r.is_default === true || r.is_default === 1,
});

/** The live locations, in the order the pickers show them. */
export async function locations(db: Db | Tx, householdId: string): Promise<LocationRow[]> {
  const rows = await db.all<RawLocation>(
    `${LOCATION_SELECT} where household_id = ? and deleted_at is null
      order by sort_order asc, name asc, id asc`,
    [householdId],
  );
  return rows.map(asLocation);
}

export async function locationById(
  db: Db | Tx,
  locationId: string,
): Promise<LocationRow | undefined> {
  const row = await db.get<RawLocation>(`${LOCATION_SELECT} where id = ?`, [locationId]);
  return row === undefined ? undefined : asLocation(row);
}

/** How many containers still sit in a location — what blocks its deletion (§3.5). */
export async function heldAt(t: Db | Tx, locationId: string): Promise<number> {
  const row = await t.get<{ n: number }>(
    `select count(*) as n from milk_containers where location_id = ? and ${IN_STASH}`,
    [locationId],
  );
  return row?.n ?? 0;
}

export interface LocationWithCount extends LocationRow {
  containers: number;
  totalMl: number;
}

/** The locations list: each with what it holds. */
export async function locationsWithCounts(
  db: Db,
  householdId: string,
): Promise<LocationWithCount[]> {
  const rows = await db.all<RawLocation & { containers: number; totalMl: number | null }>(
    `select l.id, l.household_id, l.name, l.short_name, l.kind, l.sort_order, l.is_default,
            l.deleted_at,
            count(c.id) as containers, coalesce(sum(c.amount_ml), 0) as totalMl
       from storage_locations l
       left join milk_containers c on c.location_id = l.id and c.${IN_STASH}
      where l.household_id = ? and l.deleted_at is null
      group by l.id
      order by l.sort_order asc, l.name asc, l.id asc`,
    [householdId],
  );
  return rows.map(r => ({ ...asLocation(r), containers: r.containers, totalMl: r.totalMl ?? 0 }));
}
