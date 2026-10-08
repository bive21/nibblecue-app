/**
 * Reads over the schedule mirror (docs/SCHEDULE_LOGIC.md §7 "Device, on render"): the current
 * phases' rules, the phase list, the sessions the engine walks, the skips the server recorded
 * and a viewer's notification preferences. Every function is a plain select; the engine
 * (packages/core/src/schedule) decides what the rows mean.
 *
 * `schedule_rules` and `schedule_phases` carry `deleted_at` and are filtered on it for the
 * editable routine. `schedule_instances` are the SERVER's projections (the materialiser's) and
 * are read here only for skips, which a caregiver chose and the log cannot derive.
 */
import { isGoalMinutes, isModuleVariant, type GoalSettings } from '@nibblecue/core';
import type { Db } from '../driver';

export interface RuleRow {
  id: string;
  household_id: string;
  phase_id: string;
  child_id: string | null;
  activity: string;
  care_item_id: string | null;
  effective_from: string;
  rule_type: string;
  at_local_time: string | null;
  every_minutes: number | null;
  relative_to: string | null;
  offset_minutes: number | null;
  every_days: number | null;
  target_quantity: number | null;
  repeat: string;
  /** JSON text of an int[] or null. */
  repeat_days: string | null;
  reminder_enabled: number;
  /** JSON text of a uuid[]. */
  remind_user_ids: string;
  match_window_minutes: number;
  match_scope: string;
  miss_after_minutes: number;
  late_window_minutes: number;
  night_mode: string;
  night_from: string | null;
  night_to: string | null;
  night_every_minutes: number | null;
  night_at: string | null;
  target_per_day: number | null;
  name: string | null;
  is_active: number;
  updated_at: string;
  deleted_at: string | null;
}

const RULE_COLUMNS = `r.id, r.household_id, r.phase_id, r.child_id, r.activity, r.care_item_id,
  r.effective_from, r.rule_type, r.at_local_time, r.every_minutes, r.relative_to, r.offset_minutes,
  r.every_days, r.target_quantity, r.repeat, r.repeat_days, r.reminder_enabled, r.remind_user_ids,
  r.match_window_minutes, r.match_scope, r.miss_after_minutes, r.late_window_minutes, r.night_mode,
  r.night_from, r.night_to, r.night_every_minutes, r.night_at, r.target_per_day, r.name, r.is_active,
  r.updated_at, r.deleted_at`;

/** The live rules of the household's CURRENT phases — paused ones included, the screen says so. */
export async function liveRules(db: Db, householdId: string): Promise<RuleRow[]> {
  return db.all<RuleRow>(
    `select ${RULE_COLUMNS}
       from schedule_rules r
       join schedule_phases p on p.id = r.phase_id and p.deleted_at is null and p.is_current = 1
      where r.household_id = ? and r.deleted_at is null
      order by r.at_local_time asc, r.created_at asc, r.id asc`,
    [householdId],
  );
}

export async function rulesOfPhase(db: Db, phaseId: string): Promise<RuleRow[]> {
  return db.all<RuleRow>(
    `select ${RULE_COLUMNS} from schedule_rules r
      where r.phase_id = ? and r.deleted_at is null order by r.at_local_time asc, r.id asc`,
    [phaseId],
  );
}

export async function ruleById(db: Db, id: string): Promise<RuleRow | undefined> {
  return db.get<RuleRow>(`select ${RULE_COLUMNS} from schedule_rules r where r.id = ?`, [id]);
}

export interface PhaseRow {
  id: string;
  household_id: string;
  child_id: string | null;
  name: string;
  effective_from: string;
  effective_to: string | null;
  is_current: number;
  updated_at: string;
  deleted_at: string | null;
  rule_count: number;
}

const PHASE_COLUMNS = `p.id, p.household_id, p.child_id, p.name, p.effective_from, p.effective_to,
  p.is_current, p.updated_at, p.deleted_at,
  (select count(*) from schedule_rules r where r.phase_id = p.id and r.deleted_at is null) as rule_count`;

/** Every live phase, newest first, with how many items it holds. */
export async function phaseList(db: Db, householdId: string): Promise<PhaseRow[]> {
  return db.all<PhaseRow>(
    `select ${PHASE_COLUMNS} from schedule_phases p
      where p.household_id = ? and p.deleted_at is null
      order by p.is_current desc, p.effective_from desc, p.id asc`,
    [householdId],
  );
}

export async function phaseById(db: Db, id: string): Promise<PhaseRow | undefined> {
  return db.get<PhaseRow>(`select ${PHASE_COLUMNS} from schedule_phases p where p.id = ?`, [id]);
}

export interface SessionRow {
  id: string;
  type: string;
  child_id: string | null;
  start_at: string;
  end_at: string | null;
  /** Canonical ml (a bottle, a pump), or null. */
  quantity: number | null;
  care_item_id: string | null;
  sleep_kind: string | null;
  is_private: number;
  created_by: string;
}

/**
 * A BOTTLE OF WATER IS NOT A FEED (`countsAsFeed` in core; the feeding audit's M7), so it neither
 * answers a feeding slot nor restarts the feeding interval: water at 10:40 with the feed due at
 * 11:00 used to mark the feed done and move the next one to 1:40, and the phone stayed quiet
 * through the feed the baby actually needed. The server's matcher applies the same rule
 * (migration 0117). SQL, so every query that walks sessions says it once.
 */
export const NOT_WATER_BOTTLE_SQL = `not (a.type = 'bottle' and exists (
         select 1 from bottle_details wb where wb.activity_id = a.id and wb.kind = 'WATER'))`;

/** The logged sessions of the given types since `sinceIso` — what the engine walks. */
export async function scheduleSessions(
  db: Db,
  householdId: string,
  types: readonly string[],
  sinceIso: string,
): Promise<SessionRow[]> {
  if (types.length === 0) return [];
  const marks = types.map(() => '?').join(', ');
  return db.all<SessionRow>(
    `select a.id, a.type, a.child_id, a.start_at, a.end_at, a.quantity, m.care_item_id,
            s.kind as sleep_kind, a.is_private, a.created_by
       from activities a
       left join med_details m on m.activity_id = a.id
       left join sleep_details s on s.activity_id = a.id
      where a.household_id = ? and a.deleted_at is null and a.type in (${marks}) and a.start_at >= ?
        and ${NOT_WATER_BOTTLE_SQL}
      order by a.start_at asc, a.id asc`,
    [householdId, ...types, sinceIso],
  );
}

export interface BeatRow {
  type: string;
  child_id: string | null;
  start_at: string;
  is_private: number;
  created_by: string;
}

/**
 * EVERY LOGGED START IN THE LOOKBACK WINDOW — the raw material the foresight engine reads
 * (`packages/core/src/schedule/foresight.ts`).
 *
 * It is deliberately NOT `scheduleSessions`: that one is scoped to the activities the household
 * has written a RULE for, and the whole point of foresight is the rhythm a household never wrote
 * a rule about. A parent who has logged sixty feeds and no feeding rule has the clearest pattern
 * in the app and, until this query, the engine could not see a single one of them.
 *
 * Starts only, and nothing else: no quantity, no note, no end. A median of the gaps between
 * start times is all the engine does, and a row it does not need is a row this query has no
 * business carrying to the phone's memory fourteen days at a time.
 */
export async function foresightBeats(
  db: Db,
  householdId: string,
  sinceIso: string,
): Promise<BeatRow[]> {
  return db.all<BeatRow>(
    // water is not a feed, so it is not a beat of the feeding rhythm either (M7)
    `select a.type, a.child_id, a.start_at, a.is_private, a.created_by
       from activities a
      where a.household_id = ? and a.deleted_at is null and a.start_at >= ?
        and ${NOT_WATER_BOTTLE_SQL}
      order by a.start_at asc`,
    [householdId, sinceIso],
  );
}

/**
 * HOW MANY ENTRIES OF EACH TYPE SINCE AN INSTANT, for What you track's "no entries" note
 * (`unusedModules`). Every caregiver's private rows are counted and nothing else about them is
 * read: the note sits beside a switch that turns a module off for the whole household, and leaving
 * another parent's private pumps out would call the module they use every day unused.
 */
export async function entryCountsSince(
  db: Db,
  householdId: string,
  sinceIso: string,
): Promise<Record<string, number>> {
  const rows = await db.all<{ type: string; n: number }>(
    `select type, count(*) as n
       from activities
      where household_id = ? and deleted_at is null and start_at >= ?
      group by type`,
    [householdId, sinceIso],
  );
  return Object.fromEntries(rows.map(r => [r.type, Number(r.n)]));
}

/**
 * EVERY ENTRY STILL STORED, BY MODULE, for What you track's "Turned off, still stored" — the proof
 * that turning a module off deleted nothing (SETUP.md §3). An entry's type is its module's id; the
 * stash's entries are its containers, every one ever saved, since a container leaves the stash by
 * its status and is never deleted. Counted as `entryCountsSince` counts, private rows included: a
 * module off for the whole household said "Nothing logged yet" while it held entries (2026-09-26).
 */
export async function keptEntryCounts(
  db: Db,
  householdId: string,
): Promise<Record<string, number>> {
  const [entries, stash] = await Promise.all([
    entryCountsSince(db, householdId, new Date(0).toISOString()),
    db.get<{ n: number }>('select count(*) as n from milk_containers where household_id = ?', [
      householdId,
    ]),
  ]);
  return { ...entries, stash: Number(stash?.n ?? 0) };
}

/**
 * THE HOUSEHOLD'S FIRST ENTRY OF ANY KIND — when its week of logging began, for "Schedule from
 * your log" (`scheduleFromLog`'s `firstEntryMs`). Imported history counts: a household that brought
 * a month of entries across has a month of log, whatever day it signed up.
 */
export async function firstEntryAt(db: Db, householdId: string): Promise<string | null> {
  const row = await db.get<{ first: string | null }>(
    'select min(start_at) as first from activities where household_id = ? and deleted_at is null',
    [householdId],
  );
  return row?.first ?? null;
}

export interface SleepRow {
  child_id: string | null;
  start_at: string;
  end_at: string | null;
  sleep_kind: string | null;
  is_private: number;
  created_by: string;
}

/**
 * THE SLEEP LOG THE NAP OUTLOOK READS (`packages/core/src/schedule/naps.ts`).
 *
 * It needs the END as well as the start, which is the one thing `foresightBeats` deliberately
 * does not carry: a wake window is measured from one sleep ending to the next beginning, so a
 * query of starts alone cannot answer the question at all. It also needs `sleep_kind`, to tell
 * the night from a nap — the night is what makes the first window of the day the first one.
 *
 * Sleeps only, so it is a fraction of the rows `foresightBeats` walks, and the two stay separate
 * rather than one query growing columns for both.
 */
export async function sleepLog(db: Db, householdId: string, sinceIso: string): Promise<SleepRow[]> {
  return db.all<SleepRow>(
    `select a.child_id, a.start_at, a.end_at, s.kind as sleep_kind, a.is_private, a.created_by
       from activities a
       left join sleep_details s on s.activity_id = a.id
      where a.household_id = ? and a.type = 'sleep' and a.deleted_at is null and a.start_at >= ?
      order by a.start_at asc`,
    [householdId, sinceIso],
  );
}

/*
  THE NUDGE MODULE IS GONE (the owner, 2026-09-18: "the settings for nudge me should follow the
  interval that users set, asking this again is very repetitive … so this whole module for nudge
  can be removed, because it is revamped"). A nudge was a second threshold per module — "tell me if
  nothing has been logged in 3h" — set on its own sheet, stored in its own column, and firing on its
  own notification channel. A household that has already said "feeding every 3 hours" has said when
  to be told, so notifications come from the SCHEDULE alone. The read that fed it went first (it
  returned nothing from 2026-09-18); the views, the planner's loop, the tile branch and the Android
  channel followed on 2026-09-26 (`notifications/expoDriver.ts` takes the channel off the phone).

  `module_settings.nudge_after_minutes` IS NOT DROPPED, and nothing on the phone reads it. A
  migration that deletes a column a household filled in is not reversible (CLAUDE.md §7), and the
  value is harmless where it is: unread, still synced, and still there if the owner ever wants a
  per-module threshold again — the same reasoning the removed shapes and skins get.
*/

export interface SkipRow {
  id: string;
  rule_id: string;
  scheduled_for: string;
}

/** Slots a caregiver skipped, from the day given on. */
export async function skippedSince(
  db: Db,
  householdId: string,
  sinceIso: string,
): Promise<SkipRow[]> {
  return db.all<SkipRow>(
    `select id, rule_id, scheduled_for from schedule_instances
      where household_id = ? and status = 'SKIPPED' and scheduled_for >= ?`,
    [householdId, sinceIso],
  );
}

/**
 * THE SAME SLOT, WHATEVER THE TEXT SAYS (the pre-release sweep, 2026-09-24).
 *
 * A pulled row carries `scheduled_for` as Postgres renders a timestamptz inside jsonb —
 * `2026-09-24T22:00:00+00:00` — and the phone asks with `toISOString()` — `…22:00:00.000Z`. Matched
 * as text they never met: a skip of a slot the server had made found no row, wrote a second one on
 * this phone alone and sent nothing, so the server kept the slot open and the other parent's phone
 * went on showing it and ringing for it. `strftime('%s')` reads both spellings, and a fraction, as
 * the same second; no rule has two slots inside one second.
 *
 * AND THE SERVER'S LIVE ROW FIRST. A phone that skipped before this may hold its own SKIPPED copy
 * beside the server's still-open row, so an open row is taken before a skipped one. And a pull
 * cannot carry a delete: when a rule edit discards the open instances (`app.discard_rule_future`)
 * and the materialiser makes the slot again under a new id, the old row stays here beside it — so
 * the newest is taken. A skip that still names a row the server no longer has is settled by the
 * worker rather than retried (`sync/worker.ts`).
 */
const SAME_SLOT = `rule_id = ? and strftime('%s', scheduled_for) = strftime('%s', ?)
      order by status = 'SKIPPED', updated_at desc, id limit 1`;

/** The server's instance for a slot, if this device has pulled it. */
export async function instanceFor(
  db: Db,
  ruleId: string,
  scheduledForIso: string,
): Promise<{ id: string; status: string } | undefined> {
  return db.get<{ id: string; status: string }>(
    `select id, status from schedule_instances where ${SAME_SLOT}`,
    [ruleId, scheduledForIso],
  );
}

/** The same row as `instanceFor`, with everything a trial skip must be able to put back. */
export interface InstanceState {
  id: string;
  status: string;
  skipped_reason: string | null;
  updated_at: string | null;
}

export async function instanceStateFor(
  db: Db,
  ruleId: string,
  scheduledForIso: string,
): Promise<InstanceState | undefined> {
  return db.get<InstanceState>(
    `select id, status, skipped_reason, updated_at from schedule_instances where ${SAME_SLOT}`,
    [ruleId, scheduledForIso],
  );
}

export interface PreferenceRow {
  channel: string;
  enabled: number;
  sound: number;
  vibrate: number;
  quiet_from: string | null;
  quiet_to: string | null;
}

/** The viewer's own rows, per channel. */
export async function preferencesOf(
  db: Db,
  householdId: string,
  userId: string,
): Promise<PreferenceRow[]> {
  return db.all<PreferenceRow>(
    `select channel, enabled, sound, vibrate, quiet_from, quiet_to from notification_preferences
      where household_id = ? and user_id = ? order by channel`,
    [householdId, userId],
  );
}

/**
 * The household's waking window (migration 0095), or null when nothing has been set — which is
 * the common case and not an error: no row means the default pair, and every device agrees
 * about that without anything being seeded.
 *
 * The times come back as the server wrote them, so `07:00:00` as often as `07:00`; normalising
 * is the caller's job (`dayWindowPrefs.ts`) because the same value arrives from a local write
 * in the short form.
 */
export async function dayWindowRow(
  db: Db,
  householdId: string,
): Promise<{ wake_time: string; bed_time: string } | null> {
  const rows = await db.all<{ wake_time: string; bed_time: string }>(
    `select wake_time, bed_time from household_settings where household_id = ? limit 1`,
    [householdId],
  );
  return rows[0] ?? null;
}

/**
 * The household's daily goals, module id → minutes, for the modules that carry one
 * (`module_settings.goal_minutes`, migration 0097). A module with no goal is simply absent, so a
 * caller reads `goals.tummy === undefined` and draws no bar rather than a bar over nothing.
 */
export async function moduleGoals(db: Db, householdId: string): Promise<Record<string, number>> {
  const rows = await db.all<{ module_id: string; goal_minutes: number | null }>(
    `select module_id, goal_minutes from module_settings
      where household_id = ? and goal_minutes is not null and goal_minutes > 0`,
    [householdId],
  );
  const out: Record<string, number> = {};
  for (const r of rows) if (r.goal_minutes !== null) out[r.module_id] = r.goal_minutes;
  return out;
}

/**
 * WHAT THE PLAYTIME SWITCH READS BEFORE IT WRITES (the owner, 2026-09-26): the module's word, its
 * goal and — while the second word is on — the goal the first one had (`base_goal_minutes`,
 * migration 0127). Read whole, so the switch's Undo can write back exactly the row it replaced.
 * A module with no settings row yet reads as its own word with no goal, which is what it has.
 */
export async function moduleGoalSettings(
  db: Db,
  householdId: string,
  moduleId: string,
): Promise<GoalSettings> {
  const rows = await db.all<{
    variant: string | null;
    goal_minutes: number | null;
    base_goal_minutes: number | null;
  }>(
    `select variant, goal_minutes, base_goal_minutes from module_settings
      where household_id = ? and module_id = ? limit 1`,
    [householdId, moduleId],
  );
  const r = rows[0];
  const minutes = (n: number | null | undefined): number | null =>
    typeof n === 'number' && isGoalMinutes(n) ? n : null;
  const variant = r?.variant;
  return {
    variant: isModuleVariant(variant) ? variant : null,
    goalMinutes: minutes(r?.goal_minutes),
    baseGoalMinutes: minutes(r?.base_goal_minutes),
  };
}

/** The modules this household calls by another word (`variants.ts`): the rows that carry one. */
export async function moduleVariantRows(
  db: Db,
  householdId: string,
): Promise<{ module_id: string; variant: string | null }[]> {
  return db.all<{ module_id: string; variant: string | null }>(
    `select module_id, variant from module_settings
      where household_id = ? and variant is not null`,
    [householdId],
  );
}

// `instancesForDay` — WP4's read of a day's materialised instance rows — went on 2026-09-26: the
// app computes a day's slots itself (`useSchedule`), and reads the server's rows only for skips.
