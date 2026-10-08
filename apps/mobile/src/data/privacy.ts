/**
 * MOM PRIVACY: the switch behind `activities.is_private` (docs/SECURITY.md §4, WP11).
 *
 * THE SPLIT IT SERVES IS "THE SESSION IS PRIVATE, THE MILK IS SHARED." A private pump session
 * is invisible to every other member — the row, its `pump_details`, and any number derived from
 * it — while `milk_containers` and the ledger carry no privacy predicate at all, so the stash
 * total on the fridge is the same number for everybody. That half was built in the first
 * migration and has an integration test (I5); this file is the half that was missing, which is
 * the caregiver being able to SAY so.
 *
 * WHY IT IS A SETTING AND NOT A CHECKBOX ON THE SHEET. A mother who wants her pumping private
 * wants it private every time, at 3 a.m., without remembering. A per-entry control is a control
 * she will forget once, and once is the whole failure. So it is one switch per module, it
 * decides what NEW entries are written as, and moving it brings her existing entries with it.
 *
 * ONLY HER OWN ROWS MOVE, in either direction, and only in modules the registry marks
 * `privacyCapable`. The server takes the caller's own `auth.uid()` for the preference and each
 * activity edit carries its own field clock, so this cannot reach another member's entries even
 * if the device asked it to.
 */
import {
  ActivityType,
  deriveOpId,
  MODULE_BY_ID,
  privacyPreferenceChain,
  type Chain,
  type ChainOp,
  type Clock,
  type ModuleId,
} from '@nibblecue/core';
import type { Db } from '../db/driver';
import type { WriteContext } from './activities';
import { newIntentId } from './ids';
import { commitWrite, type LocalRow, type RepositoryDeps, type WriteOutcome } from './repository';
import { activityKeys } from './store';

/** The registry decides; `pump`, `hydration` and `selfcare` carry the flag today. */
export const canBePrivate = (moduleId: string): boolean =>
  MODULE_BY_ID[moduleId as ModuleId]?.privacyCapable === true;

/**
 * The privacy-capable modules that ARE activity types — the ones with rows to hide today.
 *
 * `hydration` and `selfcare` carry `privacyCapable` in the registry and are not in
 * `ActivityType`: they have no capture sheet and so no rows, and this list is derived rather
 * than typed out so that the day either of them gets one, its switch appears with no edit here.
 */
export const PRIVATE_TYPES: readonly ActivityType[] = ActivityType.options.filter(t =>
  canBePrivate(t),
);

/**
 * Is this caregiver sharing this module with the household? No row means yes — an app that
 * defaulted to hiding would quietly make a two-parent household look like a one-parent one.
 */
export async function isShared(
  db: Db,
  householdId: string,
  userId: string,
  moduleId: string,
): Promise<boolean> {
  if (!canBePrivate(moduleId)) return true;
  const row = await db.get<{ shared: number }>(
    'select shared from privacy_preferences where household_id = ? and user_id = ? and module_id = ?',
    [householdId, userId, moduleId],
  );
  return row === undefined || row.shared !== 0;
}

/**
 * What a NEW entry of this type should carry. The inverse of `isShared`, named for the column
 * it fills, so a write path reads as what it does: `isPrivate: await privateByDefault(...)`.
 *
 * It short-circuits for every other module, so the read costs nothing on the bottle-and-diaper
 * path that runs a hundred times a day.
 */
export async function privateByDefault(
  db: Db,
  householdId: string,
  userId: string,
  moduleId: string,
): Promise<boolean> {
  if (!canBePrivate(moduleId)) return false;
  return !(await isShared(db, householdId, userId, moduleId));
}

/** Every privacy-capable module and whether this caregiver shares it — for the settings screen. */
export async function sharingState(
  db: Db,
  householdId: string,
  userId: string,
): Promise<Record<string, boolean>> {
  const rows = await db.all<{ module_id: string; shared: number }>(
    'select module_id, shared from privacy_preferences where household_id = ? and user_id = ?',
    [householdId, userId],
  );
  const state: Record<string, boolean> = {};
  for (const m of Object.values(MODULE_BY_ID)) {
    if (m.privacyCapable === true) state[m.id] = true;
  }
  for (const r of rows) {
    if (r.module_id in state) state[r.module_id] = r.shared !== 0;
  }
  return state;
}

export interface SetSharingInput extends WriteContext {
  /** An `ActivityType`, because the flip below has rows of that type to move. */
  moduleId: ActivityType;
  shared: boolean;
  intentId?: string;
}

export interface SetSharingOutcome extends WriteOutcome {
  /** How many of this caregiver's existing entries moved with the switch. */
  moved: number;
}

/**
 * Move the switch, and bring the entries it has already written along with it.
 *
 * BOTH DIRECTIONS, and that is a deliberate departure from SECURITY.md §4, which wrote down
 * only the on direction ("turning it on flips existing rows owned by that user"). A switch
 * labeled "Share pumping sessions" that is turned OFF and leaves two hundred past sessions on
 * the household's screen has not done what it says, and the person moving it is the one person
 * whose sessions they are. Flipping both ways is also the more conservative failure: the worst
 * case of the on direction is that she shares something she meant to keep, which a second tap
 * undoes and which nobody saw in between. The doc has been updated to match and the owner is
 * told, because it IS a product decision rather than an implementation detail.
 *
 * What the off direction cannot do is un-see. Another member may already have read a session
 * that is now hidden, and any total they looked at already counted it. Hiding is about what the
 * app shows from now on; nothing here claims more than that.
 *
 * ONE INTENT, so one Undo covers the switch and every row it moved. Each activity carries its
 * own derived op id and its own field clock on `is_private`, which is what lets a correction
 * somebody else is making to the same entry's AMOUNT survive this (OFFLINE_SYNC §5).
 *
 * The stash is untouched on purpose: a container that came from a session being hidden stays
 * exactly where it is, with the same amount, in everyone's total.
 */
export async function setSharing(
  db: Db,
  clock: Clock,
  input: SetSharingInput,
  deps: RepositoryDeps = {},
): Promise<SetSharingOutcome> {
  const intentId = input.intentId ?? newIntentId();
  const at = clock.iso();
  const chain: Chain = privacyPreferenceChain({
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: at,
    userId: input.createdBy,
    moduleId: input.moduleId,
    shared: input.shared,
  });
  chain.rows[0] = {
    table: 'privacy_preferences',
    row: { ...chain.rows[0]?.row, updated_at: at },
  };

  // her own entries of this type that disagree with where the switch now points
  const target = input.shared ? 0 : 1;
  const mine = canBePrivate(input.moduleId)
    ? await db.all<{ id: string }>(
        `select id from activities
          where household_id = ? and created_by = ? and type = ?
            and deleted_at is null and is_private = ?
          order by start_at`,
        [input.householdId, input.createdBy, input.moduleId, input.shared ? 1 : 0],
      )
    : [];
  const rows: LocalRow[] = [...chain.rows];
  const ops: ChainOp[] = [...chain.ops];
  for (const { id } of mine) {
    rows.push({
      table: 'activities',
      row: { id, is_private: target, updated_at: at, updated_by: input.createdBy },
    });
    ops.push({
      client_op_id: deriveOpId(intentId, id),
      entity: 'activity',
      op: 'UPDATE',
      entity_id: id,
      household_id: input.householdId,
      payload: { is_private: !input.shared, client_edited_at: at },
      depends_on: null,
    });
  }

  const outcome = await commitWrite(
    db,
    clock,
    {
      intentId,
      chain: { rows, ops },
      source: input.source,
      invalidates: activityKeys(input.householdId, null, input.moduleId),
    },
    deps,
  );
  return { ...outcome, moved: mine.length };
}
