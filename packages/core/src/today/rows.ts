/**
 * The read projections the Today models work on (docs/plans/WP5.md D3).
 *
 * These are not the domain types and not the database rows: they are the flattened shape a
 * query returns after joining an activity to its one detail table. Keeping them separate is
 * what lets every model in this folder be a pure function tested in node with object
 * literals, while `apps/mobile/src/data/queries.ts` owns the SQL that fills them.
 *
 * Times are unix ms, not ISO strings or Date objects. The mirror stores ms, arithmetic on
 * ms is exact, and a Date here would invite a `new Date()` somewhere downstream and with it
 * the device clock this package is careful never to read.
 */
import type { ActivityType, WellbeingSeen } from '../domain/domain-types';
import type { Amount, Meal } from '../entry/remembered';
import type { SolidsItem } from '../solids/items';
import type { TimerType } from '../sync/types';

export type DiaperKind = 'WET' | 'DIRTY' | 'BOTH' | 'DRY';
/** What was in the bottle, as `BottleDetail.kind` stores it. */
export type BottleKind = 'EBM' | 'FORMULA' | 'WATER' | 'MIXED' | 'OTHER';
export type SleepKind = 'NAP' | 'NIGHT';

/** One logged activity, joined to whichever detail fields the Today models need. */
export interface TodayActivity {
  id: string;
  /** null for household-scoped rows — pump is the only one today. */
  childId: string | null;
  type: ActivityType;
  startMs: number;
  /** null while a timer is still running, or for instantaneous types. */
  endMs: number | null;
  /** A private pump session is visible only to its creator (PRODUCT_SPEC.md §6.3). */
  isPrivate: boolean;
  createdBy: string;
  /** bottle: ml actually taken. 0 is a real value — a refused bottle (D16). */
  consumedMl?: number | null;
  /**
   * bottle: expressed milk, formula or neither. Read by `feedingMode` to decide WHICH published
   * sentence about stools a household is shown, which is the one place the distinction changes
   * what the app says rather than only what it counts.
   */
  bottleKind?: BottleKind | null;
  /** pump: left + right. */
  totalMl?: number | null;
  diaperKind?: DiaperKind | null;
  /**
   * diaper: the "Rash noted" switch on the sheet, as the parent left it.
   *
   * It was written and stored from the first release and read by nothing, so a parent who ticked
   * it four days running had no way to look back at it (the owner, 2026-09-19: "this information
   * is not being shown or used anywhere"). It is carried here because the visit sheet, the
   * activity log and the diapers card all read this one projection. It is a RECORD of a tick, not
   * an observation the app made: nothing counts it as a problem, grades it or colors it.
   */
  diaperRash?: boolean | null;
  /**
   * diaper: the color chip the parent tapped on the sheet (`Yellow`, `Green`…), as that chip's word,
   * or null when none was tapped.
   *
   * Written from the first release and read by nothing — no join selected it, so the one place a
   * parent could have looked it up was the raw download (the care audit, H6). Like the rash tick it
   * is a RECORD of a tap: it is shown as the plain word, never colored, graded or explained.
   */
  diaperColor?: string | null;
  sleepKind?: SleepKind | null;
  /** med: which saved item this entry was logged against (D12). */
  careItemId?: string | null;
  /**
   * med: the item's name AS LOGGED, from the entry's own detail row rather than a join to the
   * care item — renaming a cream must not rewrite what last Tuesday's entry says it was.
   */
  medName?: string | null;
  /**
   * growth: the three measurements, canonical (grams and millimetres) and each independent —
   * a weigh-in at home is a weight alone and a check-up is all three (PRODUCT_SPEC §6.9).
   */
  weightG?: number | null;
  lengthMm?: number | null;
  headMm?: number | null;
  /**
   * solids: the four things the sheet asks for — which meal, what was offered, how much of it
   * was taken, and whatever the parent wrote down.
   *
   * They were stored from the first release and projected by nothing: `ACTIVITY_SELECT` joined
   * six detail tables and `solids_details` was not one of them, so a parent who typed "sweet
   * potato, gagged a bit" had no way to read it back anywhere (the owner, 2026-09-19: "none of
   * this is showing anywhere; not in activity log, not in report"). `observation` is the
   * parent's own words and is never summarised, counted or interpreted (§13) — it is shown
   * exactly as it was typed or not at all.
   */
  meal?: Meal | null;
  food?: string | null;
  taken?: Amount | null;
  observation?: string | null;
  /**
   * solids: the meal's foods, one per line with an amount and how it went (the owner,
   * 2026-09-24; `solids/items.ts`). Null for a meal logged before the list existed — read it
   * with `itemsOf`, which turns the old `food` text into the same shape.
   */
  solidsItems?: SolidsItem[] | null;
  /** breastfeed: which side it started on, and the seconds each — the same omission as solids. */
  firstSide?: 'LEFT' | 'RIGHT' | null;
  leftSeconds?: number | null;
  rightSeconds?: number | null;
  /** temp: hundredths of a degree Celsius, canonical, and where it was taken. */
  tempCHundredths?: number | null;
  tempMethod?: string | null;
  /**
   * med: the amount AS THE PARENT TYPED IT, never parsed or compared, and the route as the
   * token the entry was logged with — `careRoute.ts` has the words for it; the token is never
   * shown.
   */
  medAmount?: string | null;
  medRoute?: string | null;
  /** The household's own words on the entry — what a clinician means by "anything else". */
  notes?: string | null;
  /**
   * wellbeing (the Health note, 2026-10-08): the chips the parent tapped for what they SAW, as
   * tokens (`wellbeing/copy.ts` has the words), in the sheet's order. Never a condition, never
   * read as one: shown back as tapped, or not at all. Its words are `notes`, its start and end the
   * row's own.
   */
  wellbeingSeen?: readonly WellbeingSeen[] | null;
}

/**
 * A timer currently running, projected for the read models. Elapsed is derived from
 * `startedAtMs` and never stored, which is what lets it survive app kill, lock and reboot.
 *
 * Distinct from the `RunningTimer` domain type, which is the storage shape: snake_case
 * fields and ISO datetime strings. This is the flattened, ms-based projection a query
 * returns, and the two are deliberately not the same name.
 *
 * `TimerType` is imported rather than restated: only four activity types can have a timer,
 * and `sync/types.ts` already derives that set from the domain type. A second hand-written
 * union here would be one more place to forget if a fifth is ever added.
 */
export interface ActiveTimer {
  id: string;
  type: TimerType;
  childId: string | null;
  startedAtMs: number;
  /** Who started it — a caregiver must see whose timer they are about to stop. */
  startedBy: string;
}

/**
 * Rows a viewer is allowed to see.
 *
 * Private pump sessions are the only case, and the rule is narrow on purpose: the session
 * disappears for everyone but its creator, while the stash movement it caused stays shared,
 * because the household's milk supply is not private information and the pumping session is
 * (PRODUCT_SPEC.md §6.3, §4).
 */
export function visibleTo<T extends { isPrivate: boolean; createdBy: string }>(
  rows: readonly T[],
  viewerId: string,
): T[] {
  return rows.filter(r => !r.isPrivate || r.createdBy === viewerId);
}

/** Newest first by start time, with a stable tie-break so two entries at one instant do not swap. */
export function newestFirst<T extends { startMs: number; id: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) => b.startMs - a.startMs || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
}
