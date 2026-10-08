/**
 * Logging, editing and deleting an entry — the capture path every module shares.
 *
 * Each function builds a chain in `packages/core` and hands it to `commitWrite`; none of them
 * touches SQLite or the network directly, so the one-transaction rule and the duplicate guard
 * are impossible to skip. The fan-out is one call with several children, not a loop over one
 * call each: `docs/MULTIPLES.md` §2 requires one toast and one Undo covering the pair, and a
 * loop would give two of each and could half-fail.
 *
 * WHAT THE DEDUPE KEY CARRIES. `<module>:<child or 'household'>:<salient>` — the salient being
 * whatever makes two taps the same event (the diaper kind, the bottle's volume), never free
 * text a parent typed. `activitySalient` derives it from the same values the chain writes, so
 * a screen cannot pass a key that disagrees with what was logged.
 *
 * AN EDIT IS A NEW OPERATION, NOT A REWRITE OF ONE. `docs/OFFLINE_SYNC.md` §1: an edit writes
 * the full post-edit row locally and enqueues an `UPDATE` op with a NEW `client_op_id` while
 * `id` is unchanged. A delete sets `deleted_at` and enqueues a `DELETE`; nothing is ever
 * removed by app code.
 */
import {
  DEDUPE_WINDOW_MS,
  DETAIL_TABLE_BY_ACTIVITY,
  dedupeKey,
  fanOutChain,
  simpleActivityChain,
  type ActivityInput,
  type ActivityType,
  type ChainBase,
  type ChainOp,
  type Clock,
  type DetailInput,
  type LocalRow,
} from '@nibblecue/core';
import type { Db } from '../db/driver';
import { newEntityId, newIntentId } from './ids';
import { privateByDefault } from './privacy';
import {
  commitWrite,
  type RepositoryDeps,
  type WriteOutcome,
  type WriteSource,
} from './repository';
import { activityKeys } from './store';

/** Who is writing and from where. Every entry point takes the same four values. */
export interface WriteContext {
  householdId: string;
  createdBy: string;
  deviceId: string | null;
  source: WriteSource;
}

/** The entry itself, in canonical units. Shared by the single write and the fan-out. */
export interface ActivityFields {
  type: ActivityType;
  /** The moment the thing happened — the tap time, or a backdated time the parent chose. */
  startAt: string;
  endAt?: string | null;
  /** CANONICAL already: ml, minutes, grams, mm, hundredths of a degree (CLAUDE.md §6). */
  quantity?: number | null;
  canonicalUnit?: ActivityInput['canonicalUnit'];
  notes?: string | null;
  isPrivate?: boolean;
  metadata?: Record<string, unknown>;
  /** The detail row's own fields; the table is fixed by `type` and is never passed in. */
  detail?: Record<string, unknown>;
}

export interface LogActivityInput extends WriteContext, ActivityFields {
  childId: string | null;
  /** Override the ids — the widget drain replays the intent's own (OFFLINE_SYNC §7 rule 3). */
  intentId?: string;
  activityId?: string;
  /** Override the guard's salient value; otherwise `activitySalient`. */
  salient?: string;
  dedupeWindowMs?: number;
}

/**
 * What makes two taps "the same event" for this module. Deliberately coarse and deliberately
 * never a note: a parent tapping WET twice in 200 ms meant one diaper, and a parent tapping
 * WET then DIRTY meant two.
 */
export function activitySalient(fields: {
  quantity?: number | null | undefined;
  detail?: Record<string, unknown> | undefined;
}): string {
  const kind = fields.detail?.['kind'];
  if (typeof kind === 'string') return kind;
  if (typeof fields.quantity === 'number') return String(fields.quantity);
  return 'any';
}

function detailFor(
  type: ActivityType,
  fields: Record<string, unknown> | undefined,
): DetailInput | null {
  const table = DETAIL_TABLE_BY_ACTIVITY[type];
  if (table === null) return null;
  return { table, fields: fields ?? {} };
}

/** The chain builder's activity, assembled from the caller's fields and a minted id. */
export function toActivityInput(
  fields: ActivityFields,
  childId: string | null,
  id: string,
  source?: WriteSource,
): ActivityInput {
  return {
    id,
    childId,
    type: fields.type,
    startAt: fields.startAt,
    endAt: fields.endAt ?? null,
    quantity: fields.quantity ?? null,
    canonicalUnit: fields.canonicalUnit ?? null,
    notes: fields.notes ?? null,
    isPrivate: fields.isPrivate ?? false,
    /*
      WHERE THE ENTRY CAME FROM, ON THE ENTRY (docs/NFC_TAGS.md §3.5).

      `WriteSource` has been a parameter of every write since WP4 and, until now, went nowhere:
      `commitWrite` accepted it and the outbox has no column for it, so `sheet`, `widget`,
      `timer` and the rest were all discarded alike. Adding `nfc` to the union changed nothing
      observable, which was found when the owner asked whether a CueCoin really logs like the
      app does (2026-09-22).

      `metadata` is where it belongs and where the timer stop already put its own
      (`chains.test.ts`: `metadata.source = 'timer_card'`): it is a column both halves already
      have, it rides the op to the server, it is in the export, and it needs no migration. A
      caller's own `metadata.source` still wins — the timer stop names its card.
    */
    metadata:
      source === undefined ? (fields.metadata ?? {}) : { source, ...(fields.metadata ?? {}) },
    detail: detailFor(fields.type, fields.detail),
  };
}

/**
 * One entry for one child (or for the household, where the module is not child-scoped).
 *
 * MOM PRIVACY IS RESOLVED HERE and not on a sheet (docs/SECURITY.md §4, WP11). Every capture
 * path in the app funnels through this function — the sheets, a favorite, a widget, a CueCoin,
 * a timer stopping — so this is the one place where "she asked for her pumping to be private"
 * cannot be forgotten by a surface that was written later. A caller that states `isPrivate`
 * explicitly still wins; `privateByDefault` answers false without touching the database for
 * every module the registry does not mark `privacyCapable`, which is all of them but three.
 */
export async function logActivity(
  db: Db,
  clock: Clock,
  input: LogActivityInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = input.intentId ?? newIntentId();
  const activityId = input.activityId ?? newEntityId();
  const base: ChainBase = {
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: clock.iso(),
  };
  const isPrivate =
    input.isPrivate ?? (await privateByDefault(db, input.householdId, input.createdBy, input.type));
  const chain = simpleActivityChain(
    base,
    toActivityInput({ ...input, isPrivate }, input.childId, activityId, input.source),
  );
  return commitWrite(
    db,
    clock,
    {
      intentId,
      chain,
      source: input.source,
      dedupe: {
        key: dedupeKey(input.type, input.childId, input.salient ?? activitySalient(input)),
        windowMs: input.dedupeWindowMs ?? DEDUPE_WINDOW_MS,
      },
      invalidates: activityKeys(input.householdId, input.childId, input.type),
    },
    deps,
  );
}

export interface FanOutEntryInput {
  childId: string;
  /** Twins rarely take the same volume (MULTIPLES §2); everything else is shared. */
  quantity?: number | null;
  detail?: Record<string, unknown>;
}

export interface LogForChildrenInput extends WriteContext, ActivityFields {
  /** One entry per child. Two twins are two entries, never one merged row (MULTIPLES §1). */
  entries: readonly FanOutEntryInput[];
  /** The Save's own id. Every child's intent is `deriveOpId(submissionId, childId)`. */
  submissionId?: string;
  salient?: string;
  dedupeWindowMs?: number;
}

/**
 * Both babies, one Save. One `WriteOutcome` with one entity id per child, per-child dedupe
 * keys, and — because the outcome is one — one toast and one Undo covering both.
 */
export async function logActivityForChildren(
  db: Db,
  clock: Clock,
  input: LogForChildrenInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const submissionId = input.submissionId ?? newIntentId();
  const windowMs = input.dedupeWindowMs ?? DEDUPE_WINDOW_MS;
  const fieldsFor = (entry: FanOutEntryInput): ActivityFields => ({
    ...input,
    ...(entry.quantity !== undefined ? { quantity: entry.quantity } : {}),
    ...(entry.detail !== undefined ? { detail: entry.detail } : {}),
  });
  const chain = fanOutChain({
    submissionId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: clock.iso(),
    entries: input.entries.map(entry => ({
      childId: entry.childId,
      activity: toActivityInput(fieldsFor(entry), entry.childId, newEntityId(), input.source),
    })),
  });
  return commitWrite(
    db,
    clock,
    {
      intentId: submissionId,
      chain,
      source: input.source,
      dedupe: input.entries.map(entry => ({
        key: dedupeKey(
          input.type,
          entry.childId,
          input.salient ?? activitySalient(fieldsFor(entry)),
        ),
        windowMs,
      })),
      invalidates: input.entries.flatMap(entry =>
        activityKeys(input.householdId, entry.childId, input.type),
      ),
    },
    deps,
  );
}

export interface EditActivityInput extends WriteContext {
  activityId: string;
  childId: string | null;
  type: ActivityType;
  /** Only the columns the edit changes; the mirror keeps the rest. */
  patch: Record<string, unknown>;
  /** The detail row's changed fields, where the type has one. */
  detailPatch?: Record<string, unknown>;
}

/**
 * An edit. A fresh `client_op_id`, the same `id`, and `client_edited_at` in the payload so the
 * server resolves it per field against `metadata.field_clocks` (D1) rather than by apply time,
 * which would let the earlier edit that synced later win.
 */
export async function editActivity(
  db: Db,
  clock: Clock,
  input: EditActivityInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const opId = newIntentId();
  const at = clock.iso();
  const detailTable = DETAIL_TABLE_BY_ACTIVITY[input.type];
  const rows: LocalRow[] = [
    {
      table: 'activities',
      row: { id: input.activityId, ...input.patch, updated_at: at, updated_by: input.createdBy },
    },
  ];
  const payload: Record<string, unknown> = { ...input.patch, client_edited_at: at };
  if (detailTable !== null && input.detailPatch !== undefined) {
    rows.push({ table: detailTable, row: { activity_id: input.activityId, ...input.detailPatch } });
    payload['detail'] = { table: detailTable, ...input.detailPatch };
  }
  const op: ChainOp = {
    client_op_id: opId,
    entity: 'activity',
    op: 'UPDATE',
    entity_id: input.activityId,
    household_id: input.householdId,
    payload,
    depends_on: null,
  };
  return commitWrite(
    db,
    clock,
    {
      intentId: opId,
      chain: { rows, ops: [op] },
      source: input.source,
      invalidates: activityKeys(input.householdId, input.childId, input.type),
    },
    deps,
  );
}

export interface DeleteActivityInput extends WriteContext {
  activityId: string;
  childId: string | null;
  type: ActivityType;
  /** Reuse a derived id — undo does, so a retry of the same undo is one operation. */
  opId?: string;
}

// The delete itself is `data/entries.ts` `deleteEntry`: a soft delete plus a `DELETE` op, and the
// milk a bottle drew put back beside it. (The bare `deleteActivity` it grew out of went on
// 2026-09-26; nothing called it.)
