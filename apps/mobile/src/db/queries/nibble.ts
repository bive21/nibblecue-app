/**
 * NIBBLECUE'S READS (2026-10-08): what the plan, Today, Foods and the allergen page are built from,
 * every one a read of the phone's own mirror (the app reads local, always). The meals, the milk,
 * the diapers and the health notes are CuddleCue's own rows, the same ones CuddleCue shows; the
 * records are NibbleCue's (`nibble_records`, docs/SERVER.md).
 *
 * A private entry another member wrote (a pump) never reaches this phone at all: the server's
 * policy keeps it off the page, so nothing here has to filter it.
 */
import type { Db, Tx } from '../driver';

export interface NibbleRecordRow {
  id: string;
  household_id: string;
  child_id: string | null;
  kind: string;
  body: string;
  updated_at: string;
  deleted_at: string | null;
  created_by: string | null;
}

export async function nibbleRecords(t: Db | Tx, householdId: string): Promise<NibbleRecordRow[]> {
  return t.all<NibbleRecordRow>(
    `select id, household_id, child_id, kind, body, updated_at, deleted_at, created_by
       from nibble_records
      where household_id = ? and deleted_at is null
      order by updated_at, id`,
    [householdId],
  );
}

export interface SolidsMealRow {
  id: string;
  child_id: string | null;
  start_at: string;
  meal: string | null;
  items: string | null;
  food: string | null;
  observation: string | null;
  created_by: string | null;
}

/** Every solids meal of the household, oldest first: both apps' meals are the same rows. */
export async function solidsMeals(t: Db | Tx, householdId: string): Promise<SolidsMealRow[]> {
  return t.all<SolidsMealRow>(
    `select a.id, a.child_id, a.start_at, s.meal, s.items, s.food, s.observation, a.created_by
       from activities a
       left join solids_details s on s.activity_id = a.id
      where a.household_id = ? and a.type = 'solids' and a.deleted_at is null
      order by a.start_at, a.id`,
    [householdId],
  );
}

export interface HealthNoteRow {
  id: string;
  child_id: string | null;
  start_at: string;
  end_at: string | null;
  notes: string | null;
  seen: string | null;
}

/** CuddleCue's Health notes (`wellbeing`, its migrations 0159 and 0160), newest first. */
export async function healthNotes(t: Db | Tx, householdId: string): Promise<HealthNoteRow[]> {
  return t.all<HealthNoteRow>(
    `select a.id, a.child_id, a.start_at, a.end_at, a.notes, w.seen
       from activities a
       left join wellbeing_details w on w.activity_id = a.id
      where a.household_id = ? and a.type = 'wellbeing' and a.deleted_at is null
      order by a.start_at desc, a.id`,
    [householdId],
  );
}

export interface MilkFeedRow {
  type: 'bottle' | 'breastfeed';
  child_id: string | null;
  start_at: string;
  consumed_ml: number | null;
  kind: string | null;
  left_seconds: number | null;
  right_seconds: number | null;
}

/** Bottles and breastfeeds since a moment, for the milk view's arithmetic. */
export async function milkFeedsSince(
  t: Db | Tx,
  householdId: string,
  sinceIso: string,
): Promise<MilkFeedRow[]> {
  return t.all<MilkFeedRow>(
    `select a.type, a.child_id, a.start_at, b.consumed_ml, b.kind,
            f.left_seconds, f.right_seconds
       from activities a
       left join bottle_details b on b.activity_id = a.id
       left join breastfeed_details f on f.activity_id = a.id
      where a.household_id = ? and a.type in ('bottle', 'breastfeed')
        and a.deleted_at is null and a.start_at >= ?
      order by a.start_at`,
    [householdId, sinceIso],
  );
}

export interface DiaperRow {
  child_id: string | null;
  start_at: string;
  kind: string | null;
  consistency: string | null;
}

/** Diapers since a moment: the firm-stool card counts them (a count, never a cause). */
export async function diapersSince(
  t: Db | Tx,
  householdId: string,
  sinceIso: string,
): Promise<DiaperRow[]> {
  return t.all<DiaperRow>(
    `select a.child_id, a.start_at, d.kind, d.consistency
       from activities a
       left join diaper_details d on d.activity_id = a.id
      where a.household_id = ? and a.type = 'diaper' and a.deleted_at is null and a.start_at >= ?
      order by a.start_at`,
    [householdId, sinceIso],
  );
}
