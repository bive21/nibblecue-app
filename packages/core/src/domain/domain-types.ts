/**
 * Shared domain types + Zod schemas. Lives in `packages/domain`, imported by mobile,
 * admin and edge functions. Canonical storage units: volume = milliliters (integer),
 * weight = grams, length = millimeters, temperature = hundredths of °C.
 * Display conversion happens at the edge of the UI only — changing display units must
 * never rewrite a stored value.
 */
import { z } from 'zod';
import type { ModuleId } from '../modules';

export type UUID = string;
export type ISODateTime = string; // always UTC, e.g. 2026-09-12T14:03:00.000Z

export const Role = z.enum(['OWNER', 'PARENT', 'CAREGIVER', 'VIEW_ONLY']);
export type Role = z.infer<typeof Role>;

export const ActivityType = z.enum([
  'bottle','breastfeed','pump','diaper','sleep','solids','med','water',
  'growth','temp','tummy','bath','milestone','note',
  // 2026-10-08 (migration 0159): the Health note — something a parent noticed, in their own
  // words. A NEW value rather than the retired `note`, because DATABASE.md §3 forbids reusing a
  // value with a new meaning and old Note rows (and imported notes) would otherwise land on the
  // pediatrician sheet as health notes. `wellbeing` survives the label's fallback name.
  'wellbeing'
]);
export type ActivityType = z.infer<typeof ActivityType>;

/* ---------- core activity ---------- */
export const ActivityBase = z.object({
  id: z.string().uuid(),                    // client-generated, so offline writes keep identity
  client_op_id: z.string().uuid(),          // idempotency key for the outbox; unique per household
  household_id: z.string().uuid(),
  child_id: z.string().uuid().nullable(),   // null for household-scoped activities (pump, hydration)
  type: ActivityType,
  start_at: z.string().datetime(),
  end_at: z.string().datetime().nullable(),
  /** Canonical amount. ml for volumes, minutes for durations-as-quantity, null otherwise. */
  quantity: z.number().nullable(),
  canonical_unit: z.enum(['ml','min','g','mm','c_hundredths','count']).nullable(),
  notes: z.string().max(2000).nullable(),
  is_private: z.boolean().default(false),   // mom-private records (pump, hydration, selfcare)
  created_by: z.string().uuid(),
  updated_by: z.string().uuid().nullable(),
  device_id: z.string().nullable(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
  deleted_at: z.string().datetime().nullable()
});
export type ActivityBase = z.infer<typeof ActivityBase>;

export const BottleDetail = z.object({
  activity_id: z.string().uuid(),
  kind: z.enum(['EBM','FORMULA','WATER','MIXED','OTHER']),
  offered_ml: z.number().int().nonnegative().nullable(),
  consumed_ml: z.number().int().nonnegative(),
  from_stash: z.boolean().default(false),
  container_id: z.string().uuid().nullable()
});
export const BreastfeedDetail = z.object({
  activity_id: z.string().uuid(),
  first_side: z.enum(['LEFT','RIGHT']).nullable(),
  left_seconds: z.number().int().nonnegative(),
  right_seconds: z.number().int().nonnegative()
});
export const PumpDetail = z.object({
  activity_id: z.string().uuid(),
  sides: z.enum(['LEFT','RIGHT','BOTH']),
  left_ml: z.number().int().nonnegative().nullable(),
  right_ml: z.number().int().nonnegative().nullable(),
  total_ml: z.number().int().nonnegative(),
  stored_to_stash: z.boolean().default(false)
});
export const SleepDetail = z.object({
  activity_id: z.string().uuid(),
  kind: z.enum(['NAP','NIGHT']),
  wake_count: z.number().int().nonnegative().nullable(),
  location: z.string().nullable()
});
export const DiaperDetail = z.object({
  activity_id: z.string().uuid(),
  kind: z.enum(['WET','DIRTY','BOTH','DRY']),
  color: z.string().nullable(),
  consistency: z.string().nullable(),
  rash: z.boolean().default(false)
});
export const SolidsDetail = z.object({
  activity_id: z.string().uuid(),
  meal: z.string().nullable(),
  food: z.string().nullable(),                // since 0114: the foods' names, comma-separated
  taken: z.enum(['NONE','LITTLE','SOME','MOST','ALL']).nullable(), // older meals only
  observation: z.string().nullable(),         // recorded verbatim; never assessed
  // 0114 (2026-09-24): the foods one per line — name, amount as counted, unit, how it went.
  // Null on a meal logged before; packages/core/src/solids/items.ts reads both shapes.
  items: z.array(z.object({
    // characters as the server counts them (char_length), so an emoji is one, not two
    name: z.string().min(1).refine(n => Array.from(n).length <= 60, { message: 'name too long' }),
    amount: z.number().min(0).max(10000).nullable(),
    unit: z.enum(['PIECE','TSP','TBSP','OZ','G','ML']).nullable(),
    response: z.enum(['LOVED','LIKED','UNSURE','DISLIKED']).nullable()
  })).max(20).nullable().optional()
});
/** The amount the PARENT typed, verbatim. The app never computes a pediatric dose (rule 4). */
export const MedDetail = z.object({
  activity_id: z.string().uuid(),
  name: z.string().min(1),
  amount_text: z.string().nullable(),
  route: z.string().nullable()
});
/** growth and temp both write here: one table, two activity types. */
export const MeasurementDetail = z.object({
  activity_id: z.string().uuid(),
  weight_g: z.number().int().positive().nullable(),
  length_mm: z.number().int().positive().nullable(),
  head_mm: z.number().int().positive().nullable(),
  temp_c_hundredths: z.number().int().nullable(),
  temp_method: z.string().nullable(),
  standard: z.string().nullable()             // e.g. 'WHO_2006' if percentiles are shown
});
/**
 * wellbeing (the Health note): what was SEEN, as the chips the parent tapped — never a condition.
 * The parent's own words are `activities.notes`; the start and the end are the activity's own.
 * Tokens only; the words for them are `packages/core/src/wellbeing/copy.ts`.
 */
export const WellbeingSeen = z.enum(['RASH','SWELLING','SPIT_UP','LOOSE_DIAPER','COUGH','FUSSY','OTHER']);
export type WellbeingSeen = z.infer<typeof WellbeingSeen>;
export const WellbeingDetail = z.object({
  activity_id: z.string().uuid(),
  seen: z.array(WellbeingSeen).max(7)
});
export type BottleDetail = z.infer<typeof BottleDetail>;
export type BreastfeedDetail = z.infer<typeof BreastfeedDetail>;
export type PumpDetail = z.infer<typeof PumpDetail>;
export type SleepDetail = z.infer<typeof SleepDetail>;
export type DiaperDetail = z.infer<typeof DiaperDetail>;
export type SolidsDetail = z.infer<typeof SolidsDetail>;
export type MedDetail = z.infer<typeof MedDetail>;
export type MeasurementDetail = z.infer<typeof MeasurementDetail>;
export type WellbeingDetail = z.infer<typeof WellbeingDetail>;

/* ---------- timers ---------- */
/** A timer is a persisted row, never an in-memory interval. elapsed = now − started_at − paused_ms. */
export const RunningTimer = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  child_id: z.string().uuid().nullable(),
  type: z.enum(['sleep','breastfeed','pump','tummy']),
  started_at: z.string().datetime(),
  paused_ms: z.number().int().nonnegative().default(0),
  active_side: z.enum(['LEFT','RIGHT']).nullable(),
  side_started_at: z.string().datetime().nullable(),
  left_seconds: z.number().int().nonnegative().default(0),
  right_seconds: z.number().int().nonnegative().default(0),
  started_by: z.string().uuid(),
  meta: z.record(z.unknown()).default({})
});
export type RunningTimer = z.infer<typeof RunningTimer>;

/* ---------- milk stash ---------- */
export const StorageKind = z.enum(['ROOM','FRIDGE','FREEZER','DEEP_FREEZER','THAWED']);
export const ContainerStatus = z.enum(['STORED','THAWING','USED','DISCARDED']);
export const MilkContainer = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  owner_id: z.string().uuid(),
  source_activity_id: z.string().uuid().nullable(), // the pump session it came from
  location_id: z.string().uuid(),
  container_type: z.enum(['BAG','BOTTLE','CONTAINER','CUSTOM']),
  amount_ml: z.number().int().nonnegative(),        // remaining amount
  initial_ml: z.number().int().nonnegative(),
  pumped_at: z.string().datetime(),
  first_frozen_at: z.string().datetime().nullable(), // set once; NEVER reset on freezer→freezer moves
  thawed_at: z.string().datetime().nullable(),
  opened_at: z.string().datetime().nullable(),
  used_at: z.string().datetime().nullable(),
  discarded_at: z.string().datetime().nullable(),
  discard_reason: z.enum(['STORAGE_TIME','UNFINISHED','SPILLED','STORAGE_ISSUE','OTHER']).nullable(),
  status: ContainerStatus,
  label_code: z.string().nullable(),                // reserved for printed labels / QR
  notes: z.string().nullable()
});
export type MilkContainer = z.infer<typeof MilkContainer>;

/** Every inventory change is a row. Inventory is the sum of its ledger, never a mutable total. */
export const MilkTxn = z.object({
  id: z.string().uuid(),
  client_op_id: z.string().uuid(),
  household_id: z.string().uuid(),
  container_id: z.string().uuid(),
  kind: z.enum(['ADD','MOVE','SPLIT','THAW','USE','DISCARD','ADJUST']),
  delta_ml: z.number().int(),                       // negative for USE/DISCARD
  from_location_id: z.string().uuid().nullable(),
  to_location_id: z.string().uuid().nullable(),
  activity_id: z.string().uuid().nullable(),        // the bottle that consumed it
  occurred_at: z.string().datetime(),
  created_by: z.string().uuid()
});

/* ---------- immunisations ---------- */
/** A published routine schedule is DATA, never logic: see assets/vaccine-guidance.*.json. */
export const VaccineStatus = z.enum(['GIVEN','PLANNED','SKIPPED','DECLINED']);
export type VaccineStatus = z.infer<typeof VaccineStatus>;
/** Derived for display only — never stored. */
export const VaccineDisplayStatus = z.enum(['GIVEN','PLANNED','DUE','UPCOMING','PAST_WINDOW','SKIPPED','DECLINED','NOT_APPLICABLE']); // NOT_APPLICABLE: an optional or seasonal dose the household has not turned on (VACCINES.md §4; WP8)
export const VaccineRecord = z.object({
  id: z.string().uuid(),
  client_op_id: z.string().uuid(),
  household_id: z.string().uuid(),
  child_id: z.string().uuid(),
  guidance_profile: z.string().nullable(),   // null for a parent-added vaccine
  guidance_version: z.string().nullable(),
  dose_id: z.string().nullable(),            // id from the profile's doses[]
  custom_name: z.string().nullable(),        // set when the parent added it themselves
  status: VaccineStatus,
  occurred_on: z.string().nullable(),        // ISO date (no time): given or planned
  provider: z.string().nullable(),
  site: z.string().nullable(),
  lot: z.string().nullable(),
  decline_reason: z.string().nullable(),     // verbatim, never assessed
  notes: z.string().nullable(),
  created_by: z.string().uuid(),
  updated_by: z.string().uuid().nullable(),
  deleted_at: z.string().datetime().nullable()
});
export type VaccineRecord = z.infer<typeof VaccineRecord>;

/* ---------- child ---------- */
export const Child = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  name: z.string().min(1).max(60),
  nickname: z.string().max(60).nullable(),
  birth_date: z.string().nullable(),         // ISO date; null while the baby is on the way (0150)
  due_date: z.string().nullable(),           // corrected age for preterm babies; the expected date before a birth
  sex: z.enum(['F','M','X']).nullable(),
  avatar_key: z.string().nullable(),         // generated glyph + color, the fallback everywhere
  /** ONE profile photo per child. Storage path in the private 'child-photos' bucket.
   *  Household-only: never in the community, never on a widget or lock screen. */
  photo_path: z.string().nullable(),
  photo_updated_at: z.string().datetime().nullable(),
  is_active: z.boolean(),
  sort_order: z.number().int()
});
export type Child = z.infer<typeof Child>;

/* ---------- schedule ---------- */
const HHMM = /^\d{2}:\d{2}$/;
export const ScheduleRule = z.object({
  id: z.string().uuid(),
  household_id: z.string().uuid(),
  phase_id: z.string().uuid(),
  child_id: z.string().uuid().nullable(),
  activity: ActivityType,
  /** med rules: WHICH saved item the slot is for (docs/CARE_ITEMS.md §4) */
  care_item_id: z.string().uuid().nullable().default(null),
  /** slots before this are not slots: a rule created at 4 p.m. did not miss the morning */
  effective_from: z.string().datetime(),
  rule_type: z.enum(['FIXED','INTERVAL','RELATIVE','CADENCE']),
  at_local_time: z.string().regex(HHMM).nullable(),             // FIXED, CADENCE
  every_minutes: z.number().int().positive().nullable(),        // INTERVAL (from last completed)
  relative_to: z.enum(['WAKE','LAST_FEED','BEDTIME']).nullable(),// RELATIVE
  offset_minutes: z.number().int().nullable(),
  every_days: z.number().int().min(1).max(30).nullable().default(null),  // CADENCE
  target_quantity: z.number().nullable(),
  repeat: z.enum(['DAILY','WEEKDAYS','WEEKENDS','CUSTOM']),
  repeat_days: z.array(z.number().int().min(0).max(6)).nullable(),
  reminder_enabled: z.boolean(),
  remind_user_ids: z.array(z.string().uuid()),
  match_window_minutes: z.number().int().positive().default(25),
  match_scope: z.enum(['MINUTES','DAY']).default('MINUTES'),
  miss_after_minutes: z.number().int().min(5).max(720).default(60),
  late_window_minutes: z.number().int().positive().default(90),
  night_mode: z.enum(['NONE','LONGER','ONE','PAUSE']).default('NONE'),
  night_from: z.string().regex(HHMM).nullable().default(null),
  night_to: z.string().regex(HHMM).nullable().default(null),
  night_every_minutes: z.number().int().positive().nullable().default(null),
  night_at: z.string().regex(HHMM).nullable().default(null),
  target_per_day: z.number().int().min(1).max(24).nullable().default(null),
  name: z.string().nullable(),
  is_active: z.boolean()
});
export type ScheduleRule = z.infer<typeof ScheduleRule>;

export const InstanceStatus = z.enum(['UPCOMING','DUE','DONE','LATE','MISSED','SKIPPED','GAP']);

/* ---------- entitlement ---------- */
export const EntitlementStatus = z.enum([
  'TRIAL','ACTIVE','GRACE_PERIOD','BILLING_ISSUE','CANCELLED_AT_PERIOD_END','EXPIRED','REVOKED'
]);
export type EntitlementStatus = z.infer<typeof EntitlementStatus>;
export const ENTITLEMENTS = [
  'tracking_basic','reports_advanced','caregiver_sync','schedules_advanced',
  'community','exports','milk_stash','widgets_advanced'
] as const;
export type Entitlement = typeof ENTITLEMENTS[number];

/* ---------- outbox ---------- */
export const OutboxOp = z.object({
  client_op_id: z.string().uuid(),
  entity: z.enum(['activity','timer','container','milk_txn','care_item','location','schedule_phase','schedule_rule','schedule_instance','vaccine_record','shopping_item','task','supply_item','favorite','community_post','settings','message_dismissal','nibble_record']),
  op: z.enum(['CREATE','UPDATE','DELETE']),
  entity_id: z.string().uuid(),             // the row's client-generated uuid
  household_id: z.string().uuid(),
  payload: z.record(z.unknown()),
  depends_on: z.string().uuid().nullable(), // client_op_id that must be SYNCED first
  seq: z.number().int().nonnegative(),      // durable counter, never created_at: two ops minted
                                            // in one millisecond still have a total order
  created_at: z.string().datetime(),
  attempts: z.number().int().nonnegative().default(0),
  next_attempt_at: z.string().datetime().nullable(),
  /** Written in the same statement that sets SENDING, before the request leaves, so a killed
   *  process can tell "in flight for two seconds" from "in flight for ten minutes". */
  sending_at: z.string().datetime().nullable(),
  last_error: z.string().nullable(),
  state: z.enum(['PENDING','SENDING','SYNCED','FAILED'])
});
export type OutboxOp = z.infer<typeof OutboxOp>;

/* ---------- unit conversion (the only place these constants exist) ---------- */
export const ML_PER_OZ = 29.5735295625;
export const mlToOz = (ml: number) => ml / ML_PER_OZ;
export const ozToMl = (oz: number) => Math.round(oz * ML_PER_OZ);
export const gToLbOz = (g: number) => {
  const totalOz = g / 28.349523125;
  return { lb: Math.floor(totalOz / 16), oz: Math.round((totalOz % 16) * 10) / 10 };
};
export type VolumeUnit = 'ml' | 'oz';
export type WeightUnit = 'kg' | 'lb_oz';
export type LengthUnit = 'cm' | 'in';
export type TempUnit = 'c' | 'f';
export type ModuleIdRef = ModuleId;
