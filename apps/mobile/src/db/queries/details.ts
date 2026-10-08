/**
 * The detail-table reads the capture sheets pre-fill from (PRODUCT_SPEC.md §5.3).
 *
 * Today's projection deliberately carries no detail columns (core/entry/remembered.ts says
 * why), so each sheet reads its own last row here: one narrow query per sheet open, never a
 * wider hot query for every row on Today.
 */
import { ENGAGED_MIN_DAYS, localDayBounds, volumeSum, type VolumeUnit } from '@nibblecue/core';
import type { Db } from '../driver';
import type { ChildScope } from './activities';

export interface LastBottle {
  consumed_ml: number;
  offered_ml: number | null;
  kind: string;
}

/** The last bottle's amounts and kind — what the bottle sheet opens on. */
export async function lastBottle(db: Db, scope: ChildScope): Promise<LastBottle | undefined> {
  return db.get<LastBottle>(
    `select d.consumed_ml, d.offered_ml, d.kind
       from activities a join bottle_details d on d.activity_id = a.id
      where a.household_id = ? and a.type = 'bottle' and a.deleted_at is null
        and ((? is null and a.child_id is null) or a.child_id = ?)
      order by a.start_at desc limit 1`,
    [scope.householdId, scope.childId, scope.childId],
  );
}

export interface LastBreastfeed {
  first_side: string | null;
  start_at: string;
  /** Each side's length, so a new feed typed in opens on the last one's (the owner, 2026-10-06). */
  left_seconds: number | null;
  right_seconds: number | null;
}

/**
 * The last feed's side and start — the pre-sheet hint `Last session started on the left · 3h 10m
 * ago`.
 *
 * THE LAST FEED IS THE ONE THAT HAPPENED LAST, as it is on the tile (`recencyMs` in core,
 * `lastActivities`; the owner, 2026-09-26): a feed typed in afterwards starts one length before it
 * ended, and ranked by start it lost to a feed begun and finished by mistake just after — so the
 * hint named the mistap's side, not the feed just saved. The candidates are the newest start and
 * whatever overlaps it, which is one row on an ordinary day.
 */
export async function lastBreastfeed(
  db: Db,
  scope: ChildScope,
): Promise<LastBreastfeed | undefined> {
  return db.get<LastBreastfeed>(
    `with newest(start_at) as (
       select max(x.start_at)
         from activities x join breastfeed_details xd on xd.activity_id = x.id
        where x.household_id = ? and x.type = 'breastfeed' and x.deleted_at is null
          and ((? is null and x.child_id is null) or x.child_id = ?)
     )
     select d.first_side, a.start_at, d.left_seconds, d.right_seconds
       from activities a join breastfeed_details d on d.activity_id = a.id
       join newest n
      where a.household_id = ? and a.type = 'breastfeed' and a.deleted_at is null
        and ((? is null and a.child_id is null) or a.child_id = ?)
        and (a.start_at = n.start_at or a.end_at >= n.start_at)
      order by coalesce(a.end_at, a.start_at) desc, a.start_at desc, a.id desc
      limit 1`,
    [
      scope.householdId,
      scope.childId,
      scope.childId,
      scope.householdId,
      scope.childId,
      scope.childId,
    ],
  );
}

/**
 * HOW LONG THE LAST SLEEP OF A KIND LASTED, in whole minutes — what a sleep typed in opens on (the
 * owner, 2026-10-06: "should follow last entrance for the oz or duration"). Per kind, because a
 * night's ten hours is no starting point for a nap. Only a finished sleep counts.
 */
export async function lastSleepMinutes(
  db: Db,
  scope: ChildScope,
  kind: 'NAP' | 'NIGHT',
): Promise<number | null> {
  const row = await db.get<{ start_at: string; end_at: string }>(
    `select a.start_at, a.end_at
       from activities a join sleep_details d on d.activity_id = a.id
      where a.household_id = ? and a.type = 'sleep' and a.deleted_at is null
        and a.end_at is not null and d.kind = ?
        and ((? is null and a.child_id is null) or a.child_id = ?)
      order by a.end_at desc limit 1`,
    [scope.householdId, kind, scope.childId, scope.childId],
  );
  if (!row) return null;
  const minutes = Math.round((Date.parse(row.end_at) - Date.parse(row.start_at)) / 60_000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
}

/**
 * WHEN THE LAST ENTRY OF A KIND ENDED, for one baby — or the household, for a pump — in epoch ms,
 * or null. A timer started earlier than the tap is held there rather than begun inside it
 * (`sheets/quick/startWhen.ts`): a baby is not in two sleeps at once, and a parent does not pump two
 * sessions at once. Only an end at or after `sinceMs` is read, because a start can go no further
 * back than its kind's long-run limit; the partial index on `(household_id, type, end_at)` serves it.
 */
export async function lastEndAt(
  db: Db,
  scope: ChildScope,
  type: string,
  sinceMs: number,
): Promise<number | null> {
  const row = await db.get<{ end_at: string | null }>(
    `select max(a.end_at) as end_at
       from activities a
      where a.household_id = ? and a.type = ? and a.deleted_at is null
        and a.end_at is not null and a.end_at >= ?
        and ((? is null and a.child_id is null) or a.child_id = ?)`,
    [scope.householdId, type, new Date(sinceMs).toISOString(), scope.childId, scope.childId],
  );
  const at = row?.end_at ? Date.parse(row.end_at) : Number.NaN;
  return Number.isFinite(at) ? at : null;
}

export interface StashSuggestion {
  /** The container a draw would take first (data/stash.ts `rankContainers`). */
  containerId: string;
  amountMl: number;
  status: string;
  pumpedAt: string;
  firstFrozenAt: string | null;
  locationName: string | null;
  /** Everything usable in the stash, for the row's second line. */
  totalMl: number;
}

/** What the bottle sheet's `Use from stash` row describes; undefined when the stash is empty. */
export async function stashSuggestion(
  db: Db,
  householdId: string,
): Promise<StashSuggestion | undefined> {
  const first = await db.get<{
    id: string;
    amount_ml: number;
    status: string;
    pumped_at: string;
    first_frozen_at: string | null;
    location_name: string | null;
  }>(
    `select c.id, c.amount_ml, c.status, c.pumped_at, c.first_frozen_at, l.name as location_name
       from milk_containers c left join storage_locations l on l.id = c.location_id
      where c.household_id = ? and c.amount_ml > 0 and c.status in ('STORED', 'THAWING')
      order by case c.status when 'THAWING' then 0 else 1 end, c.pumped_at asc, c.id asc
      limit 1`,
    [householdId],
  );
  if (!first) return undefined;
  const total = await db.get<{ total: number | null }>(
    `select sum(amount_ml) as total from milk_containers
      where household_id = ? and status in ('STORED', 'THAWING')`,
    [householdId],
  );
  return {
    containerId: first.id,
    amountMl: first.amount_ml,
    status: first.status,
    pumpedAt: first.pumped_at,
    firstFrozenAt: first.first_frozen_at,
    locationName: first.location_name,
    totalMl: total?.total ?? 0,
  };
}

export interface LastDiaper {
  kind: string;
  color: string | null;
  rash: number;
}

/** The last diaper's kind — the sheet opens on it, a pre-selection and never a claim (§5.3). */
export async function lastDiaper(db: Db, scope: ChildScope): Promise<LastDiaper | undefined> {
  return db.get<LastDiaper>(
    `select d.kind, d.color, d.rash
       from activities a join diaper_details d on d.activity_id = a.id
      where a.household_id = ? and a.type = 'diaper' and a.deleted_at is null
        and ((? is null and a.child_id is null) or a.child_id = ?)
      order by a.start_at desc limit 1`,
    [scope.householdId, scope.childId, scope.childId],
  );
}

export interface StoolSince {
  /** Unix ms of the most recent DIRTY or BOTH, or null when there has never been one. */
  lastDirtyMs: number | null;
  /** Unix ms of the most recent diaper of ANY kind — what makes a gap readable. */
  lastAnyMs: number | null;
  /** Diaper entries of every kind, ever. */
  entries: number;
  /**
   * The household's own days that carried one, counted only as far as `ENGAGED_MIN_DAYS` — the
   * one threshold it is read against. Never a displayed figure.
   */
  days: number;
}

/**
 * WHAT THE DIAPER SHEET NEEDS TO SAY HOW LONG IT HAS BEEN — four numbers, counted in SQL.
 *
 * It deliberately does not load rows and call `stoolPattern`: the sheet needs the gap and the
 * two engagement thresholds and nothing else, "ever" is the whole history, and reading a year of
 * diapers into memory to open a sheet would be a load nobody asked for. The thresholds come from
 * core (`ENGAGED_MIN_ENTRIES`, `ENGAGED_MIN_DAYS`, `CONFIDENT_WITHIN_HOURS`) so the sheet and
 * the report agree about when to speak, rather than each carrying its own copy of the rule.
 *
 * THE DAYS ARE THE HOUSEHOLD'S OWN, in `timeZone` (the pre-release sweep of 2026-09-24). They
 * were distinct UTC dates, on the reasoning that the two "can only delay the line by a day, never
 * bring it forward". West of Greenwich they bring it forward: in Los Angeles every change after
 * 5 PM is already tomorrow in UTC, so three diapers on a household's first afternoon and evening
 * counted as two days, and the sheet spoke on the day of install — the one thing the rule exists
 * to stop (docs/STOOL_AND_DIAPERS.md §3), and a day before Reports' card, which counts local days.
 * Still no rows are loaded: the first diaper's local day is found, then the first diaper after
 * that day ends, and so on — one indexed one-row read per day, and never more than the threshold.
 */
export async function stoolSince(db: Db, scope: ChildScope, timeZone: string): Promise<StoolSince> {
  const row = await db.get<{
    last_dirty: string | null;
    last_any: string | null;
    first_any: string | null;
    n: number;
  }>(
    `select max(case when d.kind in ('DIRTY','BOTH') then a.start_at end) as last_dirty,
            max(a.start_at)                                              as last_any,
            min(a.start_at)                                              as first_any,
            count(*)                                                     as n
       from activities a join diaper_details d on d.activity_id = a.id
      where a.household_id = ? and a.type = 'diaper' and a.deleted_at is null
        and ((? is null and a.child_id is null) or a.child_id = ?)`,
    [scope.householdId, scope.childId, scope.childId],
  );
  const ms = (iso: string | null | undefined): number | null => {
    if (iso == null) return null;
    const n = Date.parse(iso);
    return Number.isFinite(n) ? n : null;
  };
  let days = 0;
  let from = ms(row?.first_any);
  while (from !== null && days < ENGAGED_MIN_DAYS) {
    days += 1;
    const next = await db.get<{ at: string | null }>(
      `select min(a.start_at) as at
         from activities a join diaper_details d on d.activity_id = a.id
        where a.household_id = ? and a.type = 'diaper' and a.deleted_at is null
          and ((? is null and a.child_id is null) or a.child_id = ?)
          and a.start_at >= ?`,
      [
        scope.householdId,
        scope.childId,
        scope.childId,
        new Date(localDayBounds(timeZone, from).endMs).toISOString(),
      ],
    );
    from = ms(next?.at);
  }
  return {
    lastDirtyMs: ms(row?.last_dirty),
    lastAnyMs: ms(row?.last_any),
    entries: row?.n ?? 0,
    days,
  };
}

export interface PumpSummary {
  /** The newest session the viewer may see, or null. */
  last: { startMs: number; totalMl: number } | null;
  /** Output and sessions inside [startIso, endIso) — the household's day. */
  todayMl: number;
  todaySessions: number;
}

/**
 * The pump sheet's header rows (§6.3): `Last session` and `Today`. Household-scoped like the
 * sessions themselves, and PRIVATE sessions count only for their creator — the viewer's id is
 * the filter, here, so a caregiver never sees the total move by a session they cannot see.
 *
 * TODAY'S OUTPUT IS ITS SESSIONS AS THEY READ in the household's `unit` (core `volumeAsRead`),
 * added up here rather than by SQL's `sum`: five sessions of 1 oz a side are 300 stored ml, which
 * read "10.25 oz" where Today's Pumped cell and every session's row say 10.
 */
export async function pumpSummary(
  db: Db,
  householdId: string,
  viewerId: string,
  startIso: string,
  endIso: string,
  unit: VolumeUnit = 'ml',
): Promise<PumpSummary> {
  const visible = `a.household_id = ? and a.type = 'pump' and a.deleted_at is null
        and (a.is_private = 0 or a.created_by = ?)`;
  const last = await db.get<{ start_at: string; total_ml: number | null }>(
    `select a.start_at, p.total_ml
       from activities a left join pump_details p on p.activity_id = a.id
      where ${visible}
      order by a.start_at desc limit 1`,
    [householdId, viewerId],
  );
  const today = await db.all<{ ml: number | null }>(
    `select p.total_ml as ml
       from activities a left join pump_details p on p.activity_id = a.id
      where ${visible} and a.start_at >= ? and a.start_at < ?`,
    [householdId, viewerId, startIso, endIso],
  );
  return {
    last: last ? { startMs: Date.parse(last.start_at), totalMl: last.total_ml ?? 0 } : null,
    todayMl: volumeSum(
      today.map(r => r.ml ?? 0),
      unit,
    ),
    todaySessions: today.length,
  };
}

export interface LastBath {
  start_at: string;
  /** `metadata.hair_washed`, when the entry carried it. */
  hairWashed: boolean | null;
}

/** The last bath: the sheet's first line, and the hair pre-selection. */
export async function lastBath(db: Db, scope: ChildScope): Promise<LastBath | undefined> {
  const row = await db.get<{ start_at: string; metadata: string | null }>(
    `select a.start_at, a.metadata from activities a
      where a.household_id = ? and a.type = 'bath' and a.deleted_at is null
        and ((? is null and a.child_id is null) or a.child_id = ?)
      order by a.start_at desc limit 1`,
    [scope.householdId, scope.childId, scope.childId],
  );
  if (!row) return undefined;
  let hairWashed: boolean | null = null;
  try {
    const meta: unknown = row.metadata ? JSON.parse(row.metadata) : null;
    if (
      meta &&
      typeof meta === 'object' &&
      typeof (meta as { hair_washed?: unknown }).hair_washed === 'boolean'
    ) {
      hairWashed = (meta as { hair_washed: boolean }).hair_washed;
    }
  } catch {
    hairWashed = null;
  }
  return { start_at: row.start_at, hairWashed };
}
