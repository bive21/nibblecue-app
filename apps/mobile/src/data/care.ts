/**
 * The household's medicines, vitamins and creams — the writes (docs/CARE_ITEMS.md; docs/plans/
 * WP5.md D8–D12; migration 0011).
 *
 * THREE WRITES, ONE RULE EACH.
 *
 *   * `saveCareItem` — create or edit. One `care_item` op carries the whole item AND the whole
 *     list of reminder times, and both the mirror here and the server (0011) REBUILD the item's
 *     rules from that list: every rule not in it is soft-deleted, every time in it is a FIXED
 *     daily `med` rule with the client-minted id. §3: "rules for an item are rebuilt from the
 *     item whenever it is saved, so the two can never disagree" — and CARE_ITEMS §7's fourth
 *     criterion, the one the prototype failed: enabling reminders on an item that had none
 *     creates the times shown, never an empty set. The rules hang from the household's current
 *     phase; a household with no phase yet gets one minted here and created by the server.
 *   * `archiveCareItem` — an UPDATE with `archived_at`. The item leaves the list, its rules go,
 *     and every logged entry stays (§1): nothing here touches `activities`.
 *   * `logCareItems` — the medicine sheet's Save: ONE entry PER ITEM PER CHILD (D10), each a
 *     `med` activity whose `med_details` names the item, the amount as given and the route.
 *     Two items for twins are four entries under one submission id and one Undo. The amount is
 *     the item's `usual_amount` unless this save overrides it, and an override writes the entry
 *     only — the item's default is never rewritten silently (D9, §2).
 *
 * Nothing here reads, parses or compares an amount. `usual_amount` and `amount_text` are text
 * the household typed, stored and repeated back (CLAUDE.md rule 4).
 */
import {
  CareRouteSchema,
  DEDUPE_WINDOW_MS,
  dedupeKey,
  deriveOpId,
  simpleActivityChain,
  type ActivityInput,
  type CareRoute,
  type Chain,
  type ChainOp,
  type Clock,
  type LocalRow,
} from '@nibblecue/core';
import type { Db, Tx } from '../db/driver';
import { newEntityId, newIntentId } from './ids';
import { commitWrite, type RepositoryDeps, type WriteOutcome } from './repository';
import { activityKeys, keys } from './store';
import type { WriteContext } from './activities';

export type CareKind = 'MEDICINE' | 'VITAMIN' | 'CREAM' | 'OTHER';
/** How it is given. The values, the three that are offered and their words: core's `careRoute.ts`. */
export type { CareRoute };

/** One reminder time as the sheet holds it: the rule's id (minted once, kept across edits). */
export interface CareReminder {
  id: string;
  /** `HH:MM`, the household's local clock. */
  atLocalTime: string;
}

export interface SaveCareItemInput extends WriteContext {
  /** Absent for a new item; the item's id for an edit. */
  itemId?: string;
  name: string;
  kind: CareKind;
  usualAmount: string | null;
  route: CareRoute;
  note: string | null;
  reminders: readonly CareReminder[];
}

export interface SaveCareItemResult extends WriteOutcome {
  itemId: string;
  /** The rule ids now live for the item, in the order given. */
  ruleIds: string[];
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** The household's current phase, or null when the schedule feature has not made one yet. */
export async function currentPhaseId(t: Tx, householdId: string): Promise<string | null> {
  const row = await t.get<{ id: string }>(
    `select id from schedule_phases
      where household_id = ? and deleted_at is null and is_current = 1
      order by effective_from desc, id asc limit 1`,
    [householdId],
  );
  return row?.id ?? null;
}

/**
 * How two names are compared: trimmed, spaces collapsed, lower-cased the way the server does it.
 *
 * In JavaScript and not in SQL (the sync sweep of 2026-09-24, P5): SQLite's `lower()` folds ASCII
 * only, while the server's unique index and the in-app server lower-case every letter — so
 * "Ácido fólico" beside "ácido fólico" passed this check, was saved on the phone, and was then
 * refused by the server as a duplicate ("Not synced") with the item already on the list here.
 */
export const foldCareName = (name: string): string =>
  name.trim().replace(/\s+/g, ' ').toLowerCase();

/** A live item's name, case-insensitively, is unique in its household (care_items_name_once). */
export async function nameTaken(
  t: Tx,
  householdId: string,
  name: string,
  exceptId: string | null,
): Promise<boolean> {
  const live = await t.all<{ name: string }>(
    `select name from care_items
      where household_id = ? and archived_at is null and (? is null or id <> ?)`,
    [householdId, exceptId, exceptId],
  );
  const wanted = foldCareName(name);
  return live.some(row => foldCareName(row.name) === wanted);
}

export class CareItemNameTakenError extends Error {
  constructor(name: string) {
    super(`"${name.trim()}" is already on the list`);
    this.name = 'CareItemNameTakenError';
  }
}

export async function saveCareItem(
  db: Db,
  clock: Clock,
  input: SaveCareItemInput,
  deps: RepositoryDeps = {},
): Promise<SaveCareItemResult> {
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length === 0 || name.length > 80) {
    throw new RangeError('a care item needs a name of 1 to 80 characters');
  }
  for (const r of input.reminders) {
    if (!HHMM.test(r.atLocalTime)) throw new RangeError(`not a time of day: ${r.atLocalTime}`);
  }
  // the route goes to the wire as a Postgres enum: a token the server would refuse must not be
  // written here first, or the phone and the household would hold two different items
  if (!CareRouteSchema.safeParse(input.route).success) {
    throw new RangeError(`not a way to give it: ${String(input.route)}`);
  }
  const at = clock.iso();
  const intentId = newIntentId();
  const itemId = input.itemId ?? newEntityId();
  const isNew = input.itemId === undefined;

  const { phaseId, phaseRow, existing } = await db.tx(async t => {
    if (await nameTaken(t, input.householdId, name, itemId)) {
      throw new CareItemNameTakenError(name);
    }
    const existingRow = await t.get<{ created_at: string; created_by: string | null }>(
      'select created_at, created_by from care_items where id = ? and household_id = ?',
      [itemId, input.householdId],
    );
    if (!isNew && existingRow === undefined) {
      throw new Error('the care item to edit is not on this device');
    }
    let phase = await currentPhaseId(t, input.householdId);
    let row: LocalRow | null = null;
    // no phase yet: mint one here, the server creates it from the op (0011). A reminder set
    // on the household's first day is not blocked on the schedule feature the phase belongs to.
    if (phase === null && input.reminders.length > 0) {
      phase = newEntityId();
      row = {
        table: 'schedule_phases',
        row: {
          id: phase,
          household_id: input.householdId,
          child_id: null,
          name: 'Routine',
          effective_from: at.slice(0, 10),
          effective_to: null,
          is_current: true,
          created_at: at,
          updated_at: at,
          deleted_at: null,
        },
      };
    }
    const liveRules = await t.all<{ id: string }>(
      'select id from schedule_rules where care_item_id = ? and deleted_at is null',
      [itemId],
    );
    return { phaseId: phase, phaseRow: row, existing: { row: existingRow, liveRules } };
  });

  const rows: LocalRow[] = [];
  if (phaseRow) rows.push(phaseRow);
  rows.push({
    table: 'care_items',
    row: {
      id: itemId,
      household_id: input.householdId,
      name,
      kind: input.kind,
      usual_amount: input.usualAmount?.trim() || null,
      route: input.route,
      note: input.note?.trim() || null,
      archived_at: null,
      created_by: existing.row?.created_by ?? input.createdBy,
      created_at: existing.row?.created_at ?? at,
      updated_at: at,
      updated_by: input.createdBy,
    },
  });
  // the rules, rebuilt: the mirror does exactly what 0011 does with the same list
  const keep = new Set(input.reminders.map(r => r.id));
  for (const rule of existing.liveRules) {
    if (!keep.has(rule.id)) {
      rows.push({
        table: 'schedule_rules',
        row: { id: rule.id, deleted_at: at, is_active: false, updated_at: at },
      });
    }
  }
  if (phaseId !== null) {
    for (const r of input.reminders) {
      rows.push({
        table: 'schedule_rules',
        row: {
          id: r.id,
          household_id: input.householdId,
          phase_id: phaseId,
          child_id: null,
          activity: 'med',
          care_item_id: itemId,
          effective_from: at,
          rule_type: 'FIXED',
          at_local_time: r.atLocalTime,
          reminder_enabled: true,
          remind_user_ids: [input.createdBy],
          name,
          is_active: true,
          created_at: at,
          updated_at: at,
          deleted_at: null,
        },
      });
    }
  }
  const op: ChainOp = {
    client_op_id: intentId,
    entity: 'care_item',
    op: isNew ? 'CREATE' : 'UPDATE',
    entity_id: itemId,
    household_id: input.householdId,
    payload: {
      name,
      kind: input.kind,
      usual_amount: input.usualAmount?.trim() || null,
      route: input.route,
      note: input.note?.trim() || null,
      ...(phaseId !== null ? { phase_id: phaseId } : {}),
      reminders: input.reminders.map(r => ({ id: r.id, at_local_time: r.atLocalTime })),
      client_edited_at: at,
    },
    depends_on: null,
  };
  const outcome = await commitWrite(
    db,
    clock,
    {
      intentId,
      chain: { rows, ops: [op] },
      source: input.source,
      invalidates: [
        keys.careItems(input.householdId),
        // THE ITEM'S REMINDER TIMES ARE `schedule_rules` ROWS, and the schedule's day — Up next,
        // the day list, this phone's reminders — re-reads its rules on this key and no other
        // (`useScheduleDay`). Without it a new or moved time reached none of them until something
        // else was logged or a pull came back, which with no signal was not soon (the pre-release
        // sweep, 2026-09-24).
        keys.rules(input.householdId),
        keys.nextEvent(null),
        keys.household(input.householdId),
      ],
    },
    deps,
  );
  return { ...outcome, itemId, ruleIds: phaseId === null ? [] : input.reminders.map(r => r.id) };
}

export interface ArchiveCareItemInput extends WriteContext {
  itemId: string;
}

/** Off the list, reminders gone, every entry kept (§1). */
export async function archiveCareItem(
  db: Db,
  clock: Clock,
  input: ArchiveCareItemInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const at = clock.iso();
  const intentId = newIntentId();
  const liveRules = await db.all<{ id: string }>(
    'select id from schedule_rules where care_item_id = ? and deleted_at is null',
    [input.itemId],
  );
  const rows: LocalRow[] = [
    {
      table: 'care_items',
      row: { id: input.itemId, archived_at: at, updated_at: at, updated_by: input.createdBy },
    },
    ...liveRules.map((r): LocalRow => ({
      table: 'schedule_rules',
      row: { id: r.id, deleted_at: at, is_active: false, updated_at: at },
    })),
  ];
  const op: ChainOp = {
    client_op_id: intentId,
    entity: 'care_item',
    op: 'UPDATE',
    entity_id: input.itemId,
    household_id: input.householdId,
    payload: { archived_at: at, client_edited_at: at },
    depends_on: null,
  };
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain: { rows, ops: [op] },
      source: input.source,
      invalidates: [
        keys.careItems(input.householdId),
        // its reminder rules went with it: a stopped medicine must leave Up next and this phone's
        // reminders at once, not at the next entry or pull (see `saveCareItem`)
        keys.rules(input.householdId),
        keys.nextEvent(null),
        keys.household(input.householdId),
      ],
    },
    deps,
  );
}

export interface CareLogEntry {
  itemId: string;
  /** What the sheet shows: the item's name, amount and route, read back — never re-derived. */
  name: string;
  route: CareRoute;
  /** The item's usual amount, or this save's override; null when the item has none. */
  amountText: string | null;
}

export interface LogCareItemsInput extends WriteContext {
  /** One child, or every child on Both (MULTIPLES §1); the household when the list is empty. */
  childIds: readonly (string | null)[];
  startAt: string;
  entries: readonly CareLogEntry[];
  notes?: string | null;
  submissionId?: string;
  dedupeWindowMs?: number;
}

/**
 * One entry per item per child, under one submission: the ids are derived from it, so a
 * replay of the same Save lands on the same rows, and Undo holds every one of them.
 */
export async function logCareItems(
  db: Db,
  clock: Clock,
  input: LogCareItemsInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  if (input.entries.length === 0) throw new RangeError('nothing selected to log');
  const submissionId = input.submissionId ?? newIntentId();
  const at = clock.iso();
  const children = input.childIds.length === 0 ? [null] : input.childIds;
  const chain: Chain = { rows: [], ops: [] };
  const dedupe = [];
  const invalidates = new Set<string>();
  for (const childId of children) {
    for (const entry of input.entries) {
      const intentId = deriveOpId(submissionId, `${childId ?? 'household'}:${entry.itemId}`);
      const activity: ActivityInput = {
        id: deriveOpId(submissionId, `activity:${childId ?? 'household'}:${entry.itemId}`),
        childId,
        type: 'med',
        startAt: input.startAt,
        endAt: null,
        quantity: null,
        canonicalUnit: null,
        notes: input.notes ?? null,
        isPrivate: false,
        metadata: {},
        detail: {
          table: 'med_details',
          fields: {
            name: entry.name,
            amount_text: entry.amountText,
            route: entry.route,
            care_item_id: entry.itemId,
          },
        },
      };
      const one = simpleActivityChain(
        {
          intentId,
          householdId: input.householdId,
          createdBy: input.createdBy,
          deviceId: input.deviceId,
          clientEditedAt: at,
        },
        activity,
      );
      chain.rows.push(...one.rows);
      chain.ops.push(...one.ops);
      dedupe.push({
        key: dedupeKey('med', childId, entry.itemId),
        windowMs: input.dedupeWindowMs ?? DEDUPE_WINDOW_MS,
      });
      for (const k of activityKeys(input.householdId, childId, 'med')) invalidates.add(k);
    }
  }
  return commitWrite(
    db,
    clock,
    { intentId: submissionId, chain, source: input.source, dedupe, invalidates: [...invalidates] },
    deps,
  );
}
