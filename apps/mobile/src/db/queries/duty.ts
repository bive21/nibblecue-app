/**
 * WHO'S ON, READ FROM THE LOCAL MIRROR (migrations 0113 and 0115) — the household's shifts with
 * their record, and the people who can take one. Local first, like every read in this app: the
 * notification planner decides from these which phone rings, and it has to be able to at 3 a.m.
 * with no signal.
 */
import { dutyListFromWire, settingsEntityId, type DutyList, type Role } from '@nibblecue/core';
import type { Db } from '../driver';
import { NOT_WATER_BOTTLE_SQL } from './schedule';

/** The outbox's key for the household's one duty row (`data/duty.ts` writes it). */
export const dutyEntityId = (householdId: string): string =>
  settingsEntityId(householdId, 'household_duty', 'duty');

const parseMs = (iso: string | null | undefined): number | null => {
  if (iso === null || iso === undefined) return null;
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : ms;
};

/**
 * THE LIST THIS PHONE ACTS ON: the row — or, while this phone still owes the server a change to
 * it, the change.
 *
 * A pull that lands before a queued change is sent brought the server's older list into the
 * mirror and put it back in charge of this phone's reminders (the handoff audit's L2): the
 * "You're on until 7:00" a parent had just tapped with the signal gone was undone by the next
 * pull on reconnect, and the phone planned the night as if nobody were on until the push caught
 * up. The pull's own guard compares the mirror's key (`household_id`) with the op's derived
 * settings key, so it can never match for this table; rather than widen a guard every table
 * shares, the READER takes the newest unsent op's list first. Only PENDING and SENDING count: a
 * FAILED op is one the server refused, and the refusal is the truth.
 */
export async function dutyList(db: Db, householdId: string): Promise<DutyList> {
  const owed = await db.get<{ payload: string }>(
    `select payload from outbox
      where entity = 'settings' and entity_id = ? and state in ('PENDING', 'SENDING')
      order by seq desc limit 1`,
    [dutyEntityId(householdId)],
  );
  const row = await db.get<{
    shifts: string | null;
    updated_by: string | null;
    updated_at: string | null;
  }>('select shifts, updated_by, updated_at from household_duty where household_id = ? limit 1', [
    householdId,
  ]);
  const legacy = { by: row?.updated_by ?? null, atMs: parseMs(row?.updated_at) };
  if (owed !== undefined) {
    try {
      const payload = JSON.parse(owed.payload) as { shifts?: unknown };
      if (Array.isArray(payload.shifts)) return dutyListFromWire(payload.shifts, legacy);
    } catch {
      // an unreadable payload is the row's business: fall through to what the mirror holds
    }
  }
  return row === undefined || row.shifts === null
    ? dutyListFromWire([], legacy)
    : dutyListFromWire(row.shifts, legacy);
}

export interface DutyPersonRow {
  id: string;
  /** Null until their profile has been pulled. */
  name: string | null;
  role: Role;
  /**
   * When a temporary caregiver's seat ends (`household_members.expires_at`, mirrored since the
   * local schema's v18), or null for a permanent member. After it, they are not someone who can
   * be on — their shift stops counting on every phone at once, without a sync (the audit's H4).
   */
  expires_at?: string | null;
}

/**
 * Everyone still in the household, with the name the log already shows, their role and when their
 * seat ends — the people a shift can name are the ones `canBeOn` lets through while their seat
 * runs. A left join, so a member whose profile has not arrived yet is still someone who can be put
 * on.
 */
export async function dutyPeople(db: Db, householdId: string): Promise<DutyPersonRow[]> {
  return db.all<DutyPersonRow>(
    `select m.user_id as id, p.display_name as name, m.role as role, m.expires_at as expires_at
       from household_members m
       left join profiles p on p.id = m.user_id
      where m.household_id = ? and m.removed_at is null and m.deleted_at is null
      order by m.joined_at, m.user_id`,
    [householdId],
  );
}

export interface DutyWriteRow {
  /** The arrangement that write carried (`DutyMeta.rev`), or null for one written before 0115. */
  rev: string | null;
  /** The arrangement it replaced, as this phone saw it. */
  base: string | null;
  state: string;
  createdAtMs: number | null;
}

/**
 * THE LAST CHANGE THIS PHONE SENT, whatever became of it — so a phone whose change lost the race
 * to another (the server keeps the one written knowing the list it replaced; the audit's M1) can
 * say who changed it instead of silently showing something the parent did not choose.
 */
export async function lastDutyWrite(db: Db, householdId: string): Promise<DutyWriteRow | null> {
  const row = await db.get<{ payload: string; state: string; created_at: string | null }>(
    `select payload, state, created_at from outbox
      where entity = 'settings' and entity_id = ?
      order by seq desc limit 1`,
    [dutyEntityId(householdId)],
  );
  if (row === undefined) return null;
  let rev: string | null = null;
  let base: string | null = null;
  try {
    const payload = JSON.parse(row.payload) as { shifts?: unknown };
    const meta = dutyListFromWire(payload.shifts ?? []).meta;
    rev = meta.rev;
    base = meta.base;
  } catch {
    // unreadable: no record to compare
  }
  return { rev, base, state: row.state, createdAtMs: parseMs(row.created_at) };
}

/**
 * THE PEOPLE WHO LEFT THE HOUSEHOLD OR WERE REMOVED, by id: the member rows that say so. The pull
 * keeps a removed member's row, with `removed_at` (so their entries keep their name), which makes
 * this positive evidence — a phone that has not pulled the member list yet has no row at all, and
 * is never read as "everybody left".
 */
export async function dutyLeft(db: Db, householdId: string): Promise<string[]> {
  const rows = await db.all<{ id: string }>(
    `select m.user_id as id from household_members m
      where m.household_id = ? and (m.removed_at is not null or m.deleted_at is not null)`,
    [householdId],
  );
  return rows.map(r => r.id);
}

/** Everything a phone reads to know who's on: the list, the people, and its own last change. */
export interface DutyRead {
  list: DutyList;
  people: DutyPersonRow[];
  /** Who left or was removed (`dutyLeft`). */
  left: string[];
  lastWrite: DutyWriteRow | null;
}

/**
 * THE ONE READ BEHIND EVERY "WHO'S ON" — the planner's, the upkeep's, Today's row and the
 * Reminders page share it (`useDuty.ts`), and the scenario tests make it for each phone.
 */
export async function dutyRead(db: Db, householdId: string): Promise<DutyRead> {
  const [list, people, left, lastWrite] = await Promise.all([
    dutyList(db, householdId),
    dutyPeople(db, householdId),
    dutyLeft(db, householdId),
    lastDutyWrite(db, householdId),
  ]);
  return { list, people, left, lastWrite };
}

/** One logged entry, as the planner needs it to know who could know about it. */
export interface DutyEntryRow {
  id: string;
  type: string;
  child_id: string | null;
  start_at: string;
  created_by: string;
  created_at: string;
  /** 0 while this phone still owes the server the entry: nobody else can have it yet. */
  local_synced: number;
  care_item_id: string | null;
}

/**
 * THE ENTRIES OF THE LAST DAY AND A HALF, WITH WHO LOGGED THEM AND WHEN — what the planner reads
 * to keep a reminder whose time only this phone may know (the handoff audit's C1: an interval's
 * next slot moves with the entry that anchors it, and the phone of the person on for that slot
 * learns the entry only when it next syncs), and to find who pumps (M10).
 *
 * A bottle of water is left out, as the schedule leaves it out (`NOT_WATER_BOTTLE_SQL`): it moves
 * no feeding slot, so it cannot be the entry that moved one — read as the anchor, it kept a slot
 * on the phone that logged the water rather than the one that logged the feed.
 */
export async function dutyEntries(
  db: Db,
  householdId: string,
  sinceIso: string,
): Promise<DutyEntryRow[]> {
  return db.all<DutyEntryRow>(
    `select a.id, a.type, a.child_id, a.start_at, a.created_by, a.created_at, a.local_synced,
            m.care_item_id
       from activities a
       left join med_details m on m.activity_id = a.id
      where a.household_id = ? and a.deleted_at is null and a.start_at >= ?
        and ${NOT_WATER_BOTTLE_SQL}
      order by a.start_at asc, a.id asc`,
    [householdId, sinceIso],
  );
}
