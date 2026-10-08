/**
 * The reads that fill the Today models (docs/plans/WP5.md WP5.1, D3).
 *
 * Lives beside the other mirror reads rather than in `src/data/`, which is the WRITE
 * repository. The two Today-specific reads here are the ones `activities.ts` cannot give:
 * they LEFT JOIN the detail tables, because the Today tiles need `bottle_details.consumed_ml`
 * and `diaper_details.kind`, not `activities.quantity`. The Log's keyset pages are here too
 * (`timelineRows`); the first read layer's `timelinePage` in ./activities.ts, which nothing read
 * after that, went on 2026-09-26.
 *
 * This file owns the SQL and the one conversion the mirror forces: the local database
 * stores every timestamp as ISO text, because SQLite has no `timestamptz` and WP4 D31 fixed
 * text as the encoding. The read models work in unix ms, because arithmetic on ms is exact
 * and a `Date` in `packages/core` would invite a `new Date()` and with it the device clock
 * that package is careful never to read. So the boundary is here, in one direction, in one
 * function: `ms()`.
 *
 * Every query filters `deleted_at is null`. A soft-deleted row is gone from Today, from the
 * totals and from the timeline the instant it is deleted — the row survives for undo and for
 * the server, not for the screen.
 *
 * Scope: a child's Today shows that child's rows PLUS the household-scoped ones, which is
 * how a pump session (`child_id is null`) appears while a child is selected
 * (PRODUCT_SPEC.md §4). Passing a null childId means "everything in the household", which is
 * what the Both view of multiples needs.
 */
import {
  DETAIL_TABLE_BY_ACTIVITY,
  latestFirst,
  newestFirst,
  parseItems,
  seenOf,
  type ActiveTimer,
  type ActivityType,
  type Amount,
  type BottleKind,
  type DiaperKind,
  type Meal,
  type SleepKind,
  type TodayActivity,
} from '@nibblecue/core';
import type { Db, SqlValue } from '../driver';
import { runningTimers } from './timers';

/** ISO text from the mirror to unix ms. Null and unparseable both become null. */
function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? null : t;
}

/** The same, for a column the schema declares `not null`. */
function msRequired(iso: string): number {
  return ms(iso) ?? 0;
}

/**
 * A mirror boolean to a real one. SQLite has no boolean, so the column is 0/1 — but a delta pull
 * can hand the driver a JSON `true` from Postgres, and `Boolean(0)` would be right while
 * `value !== 0` would call `false` true. Both encodings are named explicitly for that reason.
 *
 * Null stays null: "no detail row arrived yet" is not "the parent said no".
 */
function bool(value: number | boolean | null | undefined): boolean | null {
  if (value === null || value === undefined) return null;
  return value === true || value === 1;
}

/** Shape the joined select returns, before conversion. */
interface ActivityRowRaw {
  id: string;
  child_id: string | null;
  type: string;
  start_at: string;
  end_at: string | null;
  is_private: number;
  created_by: string;
  consumed_ml: number | null;
  bottle_kind: string | null;
  total_ml: number | null;
  diaper_kind: string | null;
  /** `diaper_details.rash`, stored 0/1 by the mirror. */
  diaper_rash: number | boolean | null;
  /** `diaper_details.color`, the chip's word as the sheet wrote it. */
  diaper_color: string | null;
  sleep_kind: string | null;
  med_name: string | null;
  care_item_id: string | null;
  weight_g: number | null;
  length_mm: number | null;
  head_mm: number | null;
  temp_c_hundredths: number | null;
  temp_method: string | null;
  amount_text: string | null;
  route: string | null;
  meal: string | null;
  food: string | null;
  taken: string | null;
  observation: string | null;
  solids_items: string | null;
  first_side: string | null;
  left_seconds: number | null;
  right_seconds: number | null;
  /** `wellbeing_details.seen`, the Health note's chips as JSON array text. */
  wellbeing_seen: string | null;
  notes: string | null;
}

/**
 * One left join per detail table the Today models read.
 *
 * Left joins rather than a union: an activity whose detail row has not arrived yet — which a
 * delta pull can genuinely produce, since the mirror declares no foreign keys — still
 * appears, with its detail fields null. Losing the row instead would break rule 7.
 */
const ACTIVITY_SELECT = `
  select
    a.id                as id,
    a.child_id          as child_id,
    a.type              as type,
    a.start_at          as start_at,
    a.end_at            as end_at,
    a.is_private        as is_private,
    a.created_by        as created_by,
    b.consumed_ml       as consumed_ml,
    b.kind              as bottle_kind,
    p.total_ml          as total_ml,
    d.kind              as diaper_kind,
    d.rash              as diaper_rash,
    d.color             as diaper_color,
    s.kind              as sleep_kind,
    m.name              as med_name,
    m.care_item_id      as care_item_id,
    g.weight_g          as weight_g,
    g.length_mm         as length_mm,
    g.head_mm           as head_mm,
    g.temp_c_hundredths as temp_c_hundredths,
    g.temp_method       as temp_method,
    m.amount_text       as amount_text,
    m.route             as route,
    so.meal             as meal,
    so.food             as food,
    so.taken            as taken,
    so.observation      as observation,
    so.items            as solids_items,
    bf.first_side       as first_side,
    bf.left_seconds     as left_seconds,
    bf.right_seconds    as right_seconds,
    wb.seen             as wellbeing_seen,
    a.notes             as notes
  from activities a
  left join bottle_details b on b.activity_id = a.id
  left join pump_details   p on p.activity_id = a.id
  left join diaper_details d on d.activity_id = a.id
  left join sleep_details  s on s.activity_id = a.id
  left join med_details    m on m.activity_id = a.id
  left join measurement_details g on g.activity_id = a.id
  left join solids_details so on so.activity_id = a.id
  left join breastfeed_details bf on bf.activity_id = a.id
  left join wellbeing_details wb on wb.activity_id = a.id
`;

function toActivity(r: ActivityRowRaw): TodayActivity {
  return {
    id: r.id,
    childId: r.child_id,
    type: r.type as TodayActivity['type'],
    startMs: msRequired(r.start_at),
    endMs: ms(r.end_at),
    isPrivate: r.is_private === 1,
    createdBy: r.created_by,
    consumedMl: r.consumed_ml,
    // which published sentence about stools this household is shown turns on this one column
    bottleKind: r.bottle_kind as BottleKind | null,
    totalMl: r.total_ml,
    // cast to the concrete unions, NOT to TodayActivity['diaperKind']: that includes
    // undefined, and exactOptionalPropertyTypes forbids assigning undefined explicitly to an
    // optional property
    diaperKind: r.diaper_kind as DiaperKind | null,
    // the rash tick, which until now was written by the sheet and read by nothing: it never
    // reached a projection, so the visit sheet, the log and the diapers card could not show it
    diaperRash: bool(r.diaper_rash),
    // the color chip, which the sheet wrote and nothing selected (the care audit, H6): the log's
    // diaper line says it in words, the way it says the rash tick
    diaperColor: r.diaper_color,
    sleepKind: r.sleep_kind as SleepKind | null,
    // "Medicine" alone told a parent nothing when the household keeps a vitamin AND a cream
    // (the owner, 2026-09-16: "logging medicine should show what medicine is being logged")
    medName: r.med_name,
    careItemId: r.care_item_id,
    // growth: the three measurements are independent, so each stays nullable on its own
    weightG: r.weight_g,
    lengthMm: r.length_mm,
    headMm: r.head_mm,
    // temperature shares the measurement table with growth (DETAIL_TABLE_BY_ACTIVITY)
    tempCHundredths: r.temp_c_hundredths,
    tempMethod: r.temp_method,
    medAmount: r.amount_text,
    medRoute: r.route,
    // solids: what the parent chose and typed. All four were written from the first release and
    // read by nothing — no join, so the log and the reports could not have shown them if they
    // had tried (the owner, 2026-09-19: "none of this is showing anywhere").
    meal: r.meal as Meal | null,
    food: r.food,
    taken: r.taken as Amount | null,
    observation: r.observation,
    // the meal's foods, one per line (migration 0114); null on a meal logged before, which the
    // readers take from `food` instead (`itemsOf`)
    solidsItems: r.solids_items === null ? null : parseItems(r.solids_items),
    // breastfeed: which side it started on, and the seconds each — same omission, same fix
    firstSide: r.first_side as 'LEFT' | 'RIGHT' | null,
    leftSeconds: r.left_seconds,
    rightSeconds: r.right_seconds,
    notes: r.notes,
    // the Health note's chips (0160), read back in the sheet's order, unknown tokens dropped
    wellbeingSeen: r.wellbeing_seen === null ? null : seenOf(r.wellbeing_seen),
  };
}

/** `child_id = ? or child_id is null`, or no clause at all when every child is wanted. */
function childScope(childId: string | null): { sql: string; params: SqlValue[] } {
  return childId === null
    ? { sql: '', params: [] }
    : { sql: ' and (a.child_id = ? or a.child_id is null)', params: [childId] };
}

/**
 * Rows for the Today screen.
 *
 * `sinceMs` is a floor, not the day boundary: LAST has to reach back past midnight — a
 * caregiver taking over at 6 a.m. must see last night's bottle, not an empty grid — while
 * the totals clip to the day themselves. Callers pass a window wide enough for the oldest
 * thing Today can show (a few days), never the whole history, which is what keeps the
 * screen inside its load budget.
 */
export async function todayActivities(
  db: Db,
  householdId: string,
  childId: string | null,
  sinceMs: number,
): Promise<TodayActivity[]> {
  const scope = childScope(childId);
  const rows = await db.all<ActivityRowRaw>(
    `${ACTIVITY_SELECT}
     where a.household_id = ?
       and a.deleted_at is null
       and a.start_at >= ?${scope.sql}
     order by a.start_at desc`,
    [householdId, new Date(sinceMs).toISOString(), ...scope.params],
  );
  return rows.map(toActivity);
}

/**
 * ONE BABY'S ENTRIES BEFORE A HEALTH NOTE (`lookBackFor` in core; the owner, 2026-10-08): every live
 * row of that child's that began before `toMs` and after `fromMs`, less a day so a stretch that ran
 * into the window (the night before) is read too — core decides what is in it. The child's own rows
 * only: the household's pumping is not the baby's care. Read from the mirror, offline included.
 */
export async function lookBackActivities(
  db: Db,
  req: { householdId: string; childId: string; fromMs: number; toMs: number },
): Promise<TodayActivity[]> {
  const rows = await db.all<ActivityRowRaw>(
    `${ACTIVITY_SELECT}
     where a.household_id = ?
       and a.deleted_at is null
       and a.child_id = ?
       and a.start_at >= ?
       and a.start_at < ?
     order by a.start_at`,
    [
      req.householdId,
      req.childId,
      new Date(req.fromMs - 24 * 3_600_000).toISOString(),
      new Date(req.toMs).toISOString(),
    ],
  );
  return rows.map(toActivity);
}

/** Exported for the tests that pin the ISO-to-ms boundary. */
export const __internal = { ms, msRequired, bool, toActivity };

/** A running timer with EVERY field the card and the sheets read — the row, in ms. */
export interface TimerNow {
  id: string;
  type: ActiveTimer['type'];
  childId: string | null;
  startedAtMs: number;
  pausedMs: number;
  activeSide: 'LEFT' | 'RIGHT' | null;
  sideStartedAtMs: number | null;
  leftSeconds: number;
  rightSeconds: number;
  startedBy: string;
  meta: Record<string, unknown>;
}

function parseMeta(text: string | null): Record<string, unknown> {
  if (!text) return {};
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === 'object' && !Array.isArray(v)
      ? (v as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

/**
 * Timers running right now: the full rows for the timer stack and the timer sheets, over the one
 * SQL in ./timers.ts. A child's view includes the household's pump; null is every child.
 *
 * Elapsed is never read from the database: it is `now - startedAtMs`, computed at render. That is
 * the whole reason a timer survives app kill, phone lock, reboot and a handover to the other
 * parent's phone — there is no counter to lose (CLAUDE.md rule 12). `running_timers` is
 * hard-deleted rather than soft-deleted, so there is no `deleted_at` to filter; the absence of that
 * clause is deliberate.
 *
 * THE ONLY TIMER READ. A thinner `activeTimers` sat beside it until 2026-09-26 with nothing left
 * reading it; before 2026-09-22 it had its own SQL, and a second implementation was a second
 * answer — during a reconnect the mirror can hold two rows for one scope (see `runningTimers`), so
 * the card folded them and that list did not.
 */
export async function timersNow(
  db: Db,
  householdId: string,
  childId: string | null,
): Promise<TimerNow[]> {
  const rows = await runningTimers(db, householdId);
  return rows
    .filter(r => childId === null || r.child_id === childId || r.child_id === null)
    .map(r => ({
      id: r.id,
      type: r.type,
      childId: r.child_id,
      startedAtMs: msRequired(r.started_at),
      pausedMs: r.paused_ms ?? 0,
      activeSide: r.active_side === 'LEFT' || r.active_side === 'RIGHT' ? r.active_side : null,
      sideStartedAtMs: ms(r.side_started_at),
      leftSeconds: r.left_seconds ?? 0,
      rightSeconds: r.right_seconds ?? 0,
      startedBy: r.started_by,
      meta: parseMeta(r.meta),
    }));
}

/**
 * The newest live row of EVERY type, whatever its age (WP5.7). The LAST grid and the Care
 * strip read "when was the last bath" and the answer may be nine days old — outside the
 * window `todayActivities` loads for the totals — so this is its own query rather than a
 * bigger window: one row per type, never a full-history scan (the Today load budget).
 *
 * THE LAST BOTTLE IS THE LAST BOTTLE OF MILK. Every reader of this row asks "when was the baby
 * last fed" — the feeding tiles' elapsed and detail, the widget's Last feed — and a bottle of
 * water is not a feed (`countsAsFeed` in core; the feeding audit's M7). A 2 oz water bottle at
 * 5:50 used to make a 3 a.m. feed read as "10m" beside the word "due". Water is still in the
 * log, the day's bottle count and the download; it is only never the newest FEED.
 *
 * THE NEWEST IS THE ONE THAT HAPPENED LAST — its end, where it has one (`recencyMs` in core; the
 * owner, 2026-09-26: a breastfeed typed in as 2 + 2 minutes "keeps showing as 'Now · 0m'"). An
 * entry typed in afterwards STARTS one length before it ended, so the newest START was a feed
 * begun and finished by mistake a moment later, and the four minutes just saved never reached the
 * tile. The rows were right; this read chose between them wrongly.
 *
 * STILL ONE INDEX PROBE'S WORTH OF WORK PER TYPE, not a sort of the history. The entry that ended
 * last either IS the newest start or overlaps it — an entry that ended after the newest start
 * began before it — so the candidates are the newest start and the few rows whose end reaches
 * past it, and `latestFirst` picks among those. On an ordinary day that is the same single row
 * as ever.
 *
 * TWO READS OF PROBES, NOT ONE STATEMENT — AND THAT IS NOT A STYLE (2026-09-27). It was one
 * statement: each type's newest start in a CTE, and the rows joined against it. A phone plans
 * without statistics (nothing on it runs `ANALYZE`), and for that shape SQLite read the whole
 * history twice over — the CTE down `activities_hh_type_time` end to end, and the join through
 * EVERY row of the household with its eight detail tables: 11 ms for one baby and 17 for Both on
 * the 5,000-row household on a laptop, 113 and 169 at 40,000, on every Today read (`plans.test.ts`
 * holds the plan; under a millisecond now, at either size). Now:
 *
 *   1. each type there is, by a loose index scan (the least type, then the next one after it),
 *      and its newest start, by one descending probe that stops at the first row that counts —
 *      live, in scope, not water;
 *   2. the candidates, by CONSTANT probes, two a type: the newest start itself, and what of that
 *      type ended at or after it (`activities_hh_type_end`, one of `LOCAL_READ_INDEXES`) — each
 *      in the child's scope — and only those rows are joined to their details, under the filters
 *      the one statement had.
 *
 * The constants are the point: a join against the first read's rows handed the plan back to the
 * same planner, which chose to scan. So is where the child's scope is asked: said of the joined
 * row, it was an indexable `or` the planner preferred to the probes, and it walked the child's
 * whole history again. A candidate travels from its probe to its row by `rowid`, within the one
 * statement.
 */
export async function lastActivities(
  db: Db,
  householdId: string,
  childId: string | null,
): Promise<TodayActivity[]> {
  const scope = childScope(childId);
  const inner = childId === null ? '' : ' and (x.child_id = ? or x.child_id is null)';
  const newest = await db.all<{ type: string; start_at: string | null }>(
    `with recursive t(type) as (
       select (select min(type) from activities where household_id = ?)
       union all
       select (select min(type) from activities where household_id = ? and type > t.type)
         from t where t.type is not null
     )
     select t.type as type,
       (select x.start_at from activities x
          left join bottle_details xb on xb.activity_id = x.id
         where x.household_id = ? and x.type = t.type
           and x.deleted_at is null${inner}
           and (x.type != 'bottle' or xb.kind is null or xb.kind != 'WATER')
         order by x.start_at desc
         limit 1) as start_at
       from t where t.type is not null`,
    [householdId, householdId, householdId, ...scope.params],
  );
  const probes: string[] = [];
  const params: SqlValue[] = [];
  for (const n of newest) {
    if (n.start_at === null) continue;
    probes.push(
      `select x.rowid as rid from activities x
        where x.household_id = ? and x.type = ? and x.start_at = ?${inner}`,
      `select x.rowid as rid from activities x
        where x.household_id = ? and x.type = ? and x.end_at >= ? and x.deleted_at is null${inner}`,
    );
    params.push(householdId, n.type, n.start_at, ...scope.params);
    params.push(householdId, n.type, n.start_at, ...scope.params);
  }
  if (probes.length === 0) return [];
  const rows = await db.all<ActivityRowRaw>(
    `${ACTIVITY_SELECT.replace(
      'from activities a',
      `from (${probes.join(' union ')}) c\n  join activities a on a.rowid = c.rid`,
    )}
     where a.deleted_at is null
       and (a.type != 'bottle' or b.kind is null or b.kind != 'WATER')`,
    params,
  );
  // one per type — the one that happened last — returned newest start first, as it always was
  const last = new Map<string, TodayActivity>();
  for (const r of latestFirst(rows.map(toActivity))) if (!last.has(r.type)) last.set(r.type, r);
  return newestFirst([...last.values()]);
}

/**
 * EACH BABY'S NEWEST START, PER TYPE — what a capture sheet's Logging-for row starts on when the
 * top bar is on Both (`sheets/quick/loggingForStart.ts`; the owner, 2026-09-25). Only the instant,
 * because the rule compares instants and nothing more.
 *
 * ONE PROBE PER (BABY, TYPE), NEWEST FIRST, STOPPING AT THE FIRST ROW THAT COUNTS — on the
 * `(household_id, type, start_at desc)` index, so its cost does not grow with the log. The sheet
 * host re-reads this on every write and every pulled page, and the obvious `max(start_at) … group
 * by child_id, type` scanned the whole household to do it: 38 ms for two years of twins on a
 * laptop, against 0.03 ms for these probes, with the same answer.
 *
 * The same rows the tiles count as "last": live ones only, a bottle of water never a feed (M7,
 * above), and a private entry only for the person who logged it (`visibleTo`). A baby or a type
 * with no such row is absent from the answer.
 */
export async function lastStartByChild(
  db: Db,
  householdId: string,
  viewerId: string,
  childIds: readonly string[],
  types: readonly ActivityType[],
): Promise<Record<string, Partial<Record<ActivityType, number>>>> {
  if (childIds.length === 0 || types.length === 0) return {};
  const rows = await db.all<{ child_id: string; type: string; last_at: string | null }>(
    `with c(id) as (values ${childIds.map(() => '(?)').join(', ')}),
          t(type) as (values ${types.map(() => '(?)').join(', ')})
     select c.id as child_id, t.type as type,
       (select a.start_at from activities a
          left join bottle_details b on b.activity_id = a.id
         where a.household_id = ? and a.type = t.type and a.child_id = c.id
           and a.deleted_at is null
           and (coalesce(a.is_private, 0) != 1 or a.created_by = ?)
           and (a.type != 'bottle' or b.kind is null or b.kind != 'WATER')
         order by a.start_at desc
         limit 1) as last_at
       from c cross join t`,
    [...childIds, ...types, householdId, viewerId],
  );
  const out: Record<string, Partial<Record<ActivityType, number>>> = {};
  for (const r of rows) {
    const at = ms(r.last_at);
    if (at === null) continue;
    (out[r.child_id] ??= {})[r.type as ActivityType] = at;
  }
  return out;
}

/* ------------------------------------------------------------ the timeline (WP5.8) */

export interface TimelineEntry extends TodayActivity {
  notes: string | null;
  /** The caregiver's display name; null if the profile has not arrived yet. */
  byName: string | null;
  /** Written locally, not yet acknowledged by the server. */
  queued: boolean;
  /**
   * When the row was WRITTEN, which is not when the thing happened: a bottle typed at 11 p.m. "at
   * 9 p.m." has a 9 p.m. start and an 11 p.m. write. The catch-up card needs the second
   * (`catchupRows`). Optional so a hand-built entry (a test, a fixture) still type-checks.
   */
  createdAtMs?: number;
}

interface TimelineRowRaw extends ActivityRowRaw {
  notes: string | null;
  by_name: string | null;
  local_synced: number;
  created_at: string | null;
}

/**
 * The timeline's select: the Today projection plus who wrote the row, when, and whether the
 * server has it. One constant so the log and the catch-up card read the same columns.
 */
const TIMELINE_SELECT = ACTIVITY_SELECT.replace(
  'a.created_by        as created_by,',
  `a.created_by        as created_by,
    a.notes             as notes,
    a.local_synced      as local_synced,
    a.created_at        as created_at,
    pr.display_name     as by_name,`,
).replace(
  'from activities a',
  'from activities a\n  left join profiles pr on pr.id = a.created_by',
);

const toTimelineEntry = (r: TimelineRowRaw): TimelineEntry => {
  const createdAtMs = ms(r.created_at);
  return {
    ...toActivity(r),
    notes: r.notes,
    byName: r.by_name,
    queued: r.local_synced === 0,
    ...(createdAtMs === null ? {} : { createdAtMs }),
  };
};

export interface TimelineRequest {
  householdId: string;
  childId: string | null;
  filter: ActivityType | 'all';
  /** Keyset (D14): rows strictly older than this start, by `start_at desc, id desc`. */
  beforeMs?: number | null;
  /**
   * THE PLAN'S HISTORY FLOOR (`historyFloorMs`), or absent for a plan that reaches everything.
   *
   * A FLOOR, NOT A CURSOR. `beforeMs` walks pages backwards and moves on every "load more";
   * this does not move at all, and nothing below it is ever returned. Two separate bounds
   * because they mean different things and collapsing them would make the last page of a free
   * household's timeline look like the end of their log rather than the edge of their plan.
   *
   * THE ROWS ARE STILL ON THE PHONE. This narrows a READ; it deletes nothing and it does not
   * touch the export, which carries everything on every plan (CLAUDE.md §4 — the free download
   * is a legal duty and the history window never limits it).
   */
  sinceMs?: number | null;
  limit: number;
}

/**
 * One page of the timeline (PRODUCT_SPEC.md §4; D14): the selected child's rows plus the
 * household's, newest first, with the detail the row shows, who wrote it and whether it has
 * reached the server. Keyset, never offset — an offset page shifts under a concurrent insert.
 */
export async function timelineRows(db: Db, req: TimelineRequest): Promise<TimelineEntry[]> {
  const scope = childScope(req.childId);
  const params: SqlValue[] = [req.householdId, ...scope.params];
  let where = `a.household_id = ? and a.deleted_at is null${scope.sql}`;
  if (req.filter !== 'all') {
    where += ' and a.type = ?';
    params.push(req.filter);
  }
  if (req.beforeMs !== undefined && req.beforeMs !== null) {
    where += ' and a.start_at < ?';
    params.push(new Date(req.beforeMs).toISOString());
  }
  if (req.sinceMs !== undefined && req.sinceMs !== null) {
    where += ' and a.start_at >= ?';
    params.push(new Date(req.sinceMs).toISOString());
  }
  params.push(req.limit);
  const rows = await db.all<TimelineRowRaw>(
    `${TIMELINE_SELECT}
     where ${where}
     order by a.start_at desc, a.id desc
     limit ?`,
    params,
  );
  return rows.map(toTimelineEntry);
}

/**
 * THE ROWS A SEARCH FOUND, whole — `searchableRows` narrows by the few fields a word can match,
 * and this reads the entries the Log draws, in the order asked for. Chunked, because SQLite takes
 * at most 999 bound values in one statement.
 */
export async function timelineRowsByIds(
  db: Db,
  householdId: string,
  ids: readonly string[],
): Promise<TimelineEntry[]> {
  const byId = new Map<string, TimelineEntry>();
  for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    if (chunk.length === 0) continue;
    const rows = await db.all<TimelineRowRaw>(
      `${TIMELINE_SELECT}
       where a.household_id = ? and a.deleted_at is null
         and a.id in (${chunk.map(() => '?').join(', ')})`,
      [householdId, ...chunk],
    );
    for (const r of rows) byId.set(r.id, toTimelineEntry(r));
  }
  return ids.map(id => byId.get(id)).filter((r): r is TimelineEntry => r !== undefined);
}

export interface CatchupRequest {
  householdId: string;
  childId: string | null;
  /** When this phone was last in the foreground — the start of the absence. */
  fromMs: number;
  /**
   * How far before `fromMs` a WRITE still counts as possibly unseen: an entry saved on the other
   * phone a minute before this one went quiet may have reached this one only after it had.
   */
  arrivalGraceMs: number;
  /**
   * How long before `fromMs` an entry WRITTEN in the absence may have been given and still be
   * read: a bottle typed late "at 9 p.m." is, an import of last month's history is not.
   */
  backdatedWithinMs: number;
  limit: number;
}

/**
 * HOW LONG BEFORE A WINDOW AN ENTRY THAT RAN INTO IT MAY HAVE BEGUN: two days. The night's sleep
 * put down before a parent left is hours long; nothing a parent logs runs for days, and a timer
 * forgotten that long is in the log, not in "while you were away" (`awayEntries` keeps the same
 * bound, so what is read and what is counted agree).
 */
export const RAN_INTO_WITHIN_MS = 48 * 3_600_000;

/**
 * WHAT MAY HAVE HAPPENED WHILE THIS PHONE WAS AWAY — every row that began in the absence, ran into
 * it, or was WRITTEN in it (or just before it), newest first (the handoff audit, L5). The
 * look-back from Up next reads the same rows from the start of a shift (`duty/lookBack.ts`).
 *
 * Reading by start alone left out three things a parent coming back needs: the night's sleep that
 * started before they left and ended while they were gone, a bottle typed during the absence with
 * the earlier time it was given, and an entry saved on the other phone just before this one went
 * quiet that arrived after it had. The card's own rules (`awayEntries`) decide which of these are
 * shown; this read only makes sure none of them is missing.
 *
 * A RANGE, NOT A WALK OF THE HISTORY (2026-09-29). With no floor on the start — "an entry that ran
 * into the window may have begun any time before it" — SQLite walked the household's every row
 * newest first to the oldest, on every write and every pulled page while the card was up: 1.9 ms
 * for the 5,000-row household on a laptop and 14 ms at 40,000, growing with the log. Nothing runs
 * into a window from more than two days before it (`RAN_INTO_WITHIN_MS`), so that is the floor,
 * and the read is a range over the index at any size (`plans.test.ts` holds the plan).
 */
export async function catchupRows(db: Db, req: CatchupRequest): Promise<TimelineEntry[]> {
  const scope = childScope(req.childId);
  const from = new Date(req.fromMs).toISOString();
  const written = new Date(req.fromMs - Math.max(0, req.arrivalGraceMs)).toISOString();
  const given = new Date(req.fromMs - Math.max(0, req.backdatedWithinMs)).toISOString();
  const floor = new Date(
    req.fromMs - Math.max(RAN_INTO_WITHIN_MS, req.backdatedWithinMs),
  ).toISOString();
  const rows = await db.all<TimelineRowRaw>(
    `${TIMELINE_SELECT}
     where a.household_id = ? and a.start_at >= ? and a.deleted_at is null${scope.sql}
       and (a.start_at >= ?
            or (a.created_at >= ? and a.start_at >= ?)
            or (a.end_at is not null and a.end_at > ?))
     order by a.start_at desc, a.id desc
     limit ?`,
    [req.householdId, floor, ...scope.params, from, written, given, from, req.limit],
  );
  return rows.map(toTimelineEntry);
}

/**
 * The types with at least one live row in scope — the filter chips are these ∩ enabled (§4).
 *
 * A LOOSE INDEX SCAN, NOT A WALK OF THE HISTORY (2026-09-28). `select distinct type` read every row
 * the household ever logged, down `activities_hh_type_time`, to find the dozen types among them —
 * on every first page of the Log, which is every write while it is open: 1.3 ms of the 5,000-row
 * household on a laptop, growing with the log. It is the shape `lastActivities` already takes: each
 * type the household has, by the least type and then the next one after it, and for each an
 * `exists` probe that stops at its first row that is live and in scope. The same set, in the same
 * order (`plans.more.test.ts` holds both the answer and the plan).
 */
export async function typesPresent(
  db: Db,
  householdId: string,
  childId: string | null,
): Promise<ActivityType[]> {
  const scope = childScope(childId);
  const rows = await db.all<{ type: string }>(
    `with recursive t(type) as (
       select (select min(type) from activities where household_id = ?)
       union all
       select (select min(type) from activities where household_id = ? and type > t.type)
         from t where t.type is not null
     )
     select t.type as type from t
      where t.type is not null
        and exists (select 1 from activities a
                     where a.household_id = ? and a.type = t.type
                       and a.deleted_at is null${scope.sql})
      order by t.type`,
    [householdId, householdId, householdId, ...scope.params],
  );
  return rows.map(r => r.type as ActivityType);
}

/**
 * HOW MANY ENTRIES SIT BELOW THE PLAN'S HISTORY FLOOR — the shape of what the gate is holding.
 *
 * CLAUDE.md §4: *"every gate shows what is behind it — a locked trends card shows the shape of
 * the chart with the numbers removed, never an empty box."* For a list of entries the shape IS
 * the count: "312 earlier entries" is a true, checkable statement about the household's own log,
 * and it is the only thing that makes the card worth reading rather than a wall with a price on
 * it. Every filter the list is under applies, so the number matches the list above it.
 *
 * Private rows are NOT excluded here, and that is on purpose: they are already excluded from the
 * caller's list by `visibleTo`, and a count is not a disclosure — nothing about them is shown, and
 * a number that changed when a colleague made her pumping private would leak more than it hid.
 */
export async function olderThanFloorCount(
  db: Db,
  req: Pick<TimelineRequest, 'householdId' | 'childId' | 'filter'> & { sinceMs: number },
): Promise<number> {
  const scope = childScope(req.childId);
  // built together so the placeholder order and the parameter order cannot drift apart
  let where = `a.household_id = ? and a.deleted_at is null${scope.sql} and a.start_at < ?`;
  const params: SqlValue[] = [
    req.householdId,
    ...scope.params,
    new Date(req.sinceMs).toISOString(),
  ];
  if (req.filter !== 'all') {
    where += ' and a.type = ?';
    params.push(req.filter);
  }
  const rows = await db.all<{ n: number }>(
    `select count(*) as n from activities a where ${where}`,
    params,
  );
  return Number(rows[0]?.n ?? 0);
}

export interface EntryRecord {
  activity: {
    id: string;
    household_id: string;
    child_id: string | null;
    type: ActivityType;
    start_at: string;
    end_at: string | null;
    quantity: number | null;
    canonical_unit: string | null;
    notes: string | null;
    is_private: number;
    created_by: string;
    /**
     * The entry's picture, once the upload queue has stamped it (migration 0102). Both null
     * until then — and a queued photo shows from its STAGED file rather than from these, which
     * is why the editor asks the queue as well as the row.
     */
    photo_path: string | null;
    photo_updated_at: string | null;
    /**
     * The row's `metadata` JSON as the mirror stores it (text). A bath's "hair washed" lives here —
     * bath has no detail table — so the editor reads it back, and writes the merged object when it
     * is corrected (`entryPatch`). Optional so a hand-built record still type-checks; `entryById`
     * always fills it.
     */
    metadata?: string | null;
  };
  /** The detail row, as stored, or null where the type has no detail table or none arrived. */
  detail: Record<string, unknown> | null;
  /** Who wrote it and who last changed it (WP11). */
  by: EntryAuthorship;
}

/**
 * WHO WROTE THIS ROW, AND WHO LAST CHANGED IT (WP11 "attribution on every entry").
 *
 * The timeline row has named the caregiver since WP5.8; the EDITOR did not, and the editor is
 * where the name earns its place — a correction overwrites somebody's record of what happened,
 * and in a household with two parents and a grandparent, the person about to change a number
 * wants to know whose number it is before they change it.
 *
 * Both names come from a LEFT JOIN on `profiles`, so a caregiver whose profile row has not
 * arrived yet reads as an unnamed write rather than holding up the sheet: the entry is the
 * fact, the name is a convenience the next pull brings.
 */
export interface EntryAuthorship {
  /** The caregiver who logged it, or null while their profile row is still on its way. */
  byName: string | null;
  createdAtMs: number;
  /**
   * When the row was last changed, or null when nothing has changed it since it was written.
   *
   * `updated_by` is null at insert and stamped by every write that touches the row
   * (`packages/core/src/sync/chains.ts`), so the row carries its own record of having been
   * corrected and no clock comparison is needed. It is deliberately ANY change and not only a
   * field edit: a moved time, a corrected amount, a photo added, a delete that was undone.
   * Each of those really did change what the household is looking at.
   */
  editedAtMs: number | null;
  /** Their name, on the same terms as `byName` — null does not mean no edit; `editedAtMs` does. */
  editedByName: string | null;
}

type EntryRowRaw = EntryRecord['activity'] & {
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  by_name: string | null;
  edited_by_name: string | null;
};

/** One entry with its detail row and its authorship, for the editor (§4). */
export async function entryById(db: Db, id: string): Promise<EntryRecord | null> {
  const row = await db.get<EntryRowRaw>(
    `select a.id, a.household_id, a.child_id, a.type, a.start_at, a.end_at, a.quantity,
            a.canonical_unit, a.notes, a.is_private, a.created_by, a.photo_path,
            a.photo_updated_at, a.metadata, a.created_at, a.updated_at, a.updated_by,
            wrote.display_name as by_name,
            changed.display_name as edited_by_name
       from activities a
       left join profiles wrote   on wrote.id   = a.created_by
       left join profiles changed on changed.id = a.updated_by
      where a.id = ? and a.deleted_at is null`,
    [id],
  );
  if (row === undefined) return null;
  const { created_at, updated_at, updated_by, by_name, edited_by_name, ...activity } = row;
  const by: EntryAuthorship = {
    byName: by_name,
    createdAtMs: Date.parse(created_at),
    editedAtMs: updated_by === null ? null : Date.parse(updated_at),
    editedByName: edited_by_name,
  };
  const table = DETAIL_TABLE_BY_ACTIVITY[activity.type];
  const detail =
    table === null
      ? null
      : ((await db.get<Record<string, unknown>>(`select * from ${table} where activity_id = ?`, [
          id,
        ])) ?? null);
  return { activity, detail, by };
}

/**
 * WHEN EACH KIND WAS LAST LOGGED, AND THE LAST NIGHT'S SLEEP BEGAN, for one child (and the
 * household's own pump sessions), for a reminder's body (2026-10-08: "Ada slept at 8:36 PM
 * yesterday" in place of "On your routine"; `reminderCopy`'s `lastOf`). Deleted entries never, a
 * water bottle never a feed. One grouped read, made when the plan is.
 */
export async function lastLoggedTimes(
  db: Db,
  householdId: string,
  childId: string | null,
): Promise<{ byType: Record<string, number>; nightMs: number | null }> {
  const scope = childScope(childId);
  const rows = await db.all<{ type: string; at: string | null }>(
    `select a.type as type, max(a.start_at) as at
       from activities a
       left join bottle_details b on b.activity_id = a.id
      where a.household_id = ? and a.deleted_at is null${scope.sql}
        and (a.type != 'bottle' or b.kind is null or b.kind != 'WATER')
      group by a.type`,
    [householdId, ...scope.params],
  );
  const night = await db.get<{ at: string | null }>(
    `select max(a.start_at) as at
       from activities a
       join sleep_details s on s.activity_id = a.id
      where a.household_id = ? and a.deleted_at is null${scope.sql}
        and a.type = 'sleep' and s.kind = 'NIGHT'`,
    [householdId, ...scope.params],
  );
  const byType: Record<string, number> = {};
  for (const r of rows) if (r.at !== null) byType[r.type] = Date.parse(r.at);
  return { byType, nightMs: night?.at == null ? null : Date.parse(night.at) };
}
