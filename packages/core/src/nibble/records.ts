/**
 * ── NIBBLECUE'S OWN RECORDS: WRITING ONE, READING THEM BACK ───────────────────────────────────
 *
 * A record is one row of `nibble_records` (docs/SERVER.md): the baby's food profile, a custom
 * food, something a parent noticed, a pin on the plan. Written the way CuddleCue writes everything
 * (`sync/chains.ts`): one intent becomes the local row and one outbox op, keyed by the intent, so a
 * retry or a double tap collapses to one row and the write succeeds with no network.
 *
 * THE BODY IS CHECKED BEFORE IT IS WRITTEN (`RECORD_BODY`), so a shape the other phone could not
 * read never leaves this one. READING IS FORGIVING: a body a later build wrote, with a field this
 * build does not know, still reads with the fields it does; a body that cannot be read at all is
 * skipped rather than taking the screen down.
 */
import type { Chain, ChainOp, LocalRow } from '../sync/types';
import type { ChainBase } from '../sync/chains';
import { RECORD_BODY, type RecordKind } from './types';
import type { z } from 'zod';

export type RecordBody<K extends RecordKind> = z.infer<(typeof RECORD_BODY)[K]>;

export interface RecordWriteInput<K extends RecordKind> extends ChainBase {
  recordId: string;
  childId: string | null;
  kind: K;
  body: z.input<(typeof RECORD_BODY)[K]>;
}

/** A new record, or a whole new body for an existing one (the later edit wins the whole row). */
export function recordSaveChain<K extends RecordKind>(
  input: RecordWriteInput<K> & { op: 'CREATE' | 'UPDATE' },
): Chain {
  const body = RECORD_BODY[input.kind].parse(input.body) as Record<string, unknown>;
  const row: LocalRow = {
    table: 'nibble_records',
    row: {
      id: input.recordId,
      household_id: input.householdId,
      child_id: input.childId,
      kind: input.kind,
      body,
      client_edited_at: input.clientEditedAt,
      updated_by: input.createdBy,
      updated_at: input.clientEditedAt,
      deleted_at: null,
      ...(input.op === 'CREATE'
        ? { created_by: input.createdBy, created_at: input.clientEditedAt }
        : {}),
    },
  };
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'nibble_record',
    op: input.op,
    entity_id: input.recordId,
    household_id: input.householdId,
    payload: {
      kind: input.kind,
      child_id: input.childId,
      body,
      client_edited_at: input.clientEditedAt,
    },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

/** A soft delete: a tombstone that reaches every phone, undone by `restore`. */
export function recordDeleteChain(
  input: ChainBase & {
    recordId: string;
    kind: RecordKind;
    childId: string | null;
    restore?: boolean;
  },
): Chain {
  const deletedAt = input.restore ? null : input.clientEditedAt;
  const row: LocalRow = {
    table: 'nibble_records',
    row: {
      id: input.recordId,
      deleted_at: deletedAt,
      updated_at: input.clientEditedAt,
      updated_by: input.createdBy,
    },
  };
  const op: ChainOp = {
    client_op_id: input.intentId,
    entity: 'nibble_record',
    op: input.restore ? 'UPDATE' : 'DELETE',
    entity_id: input.recordId,
    household_id: input.householdId,
    payload: {
      kind: input.kind,
      child_id: input.childId,
      client_edited_at: input.clientEditedAt,
      ...(input.restore ? { restore: true } : {}),
    },
    depends_on: null,
  };
  return { rows: [row], ops: [op] };
}

/** A record as the mirror holds it. */
export interface RecordRow {
  id: string;
  household_id: string;
  child_id: string | null;
  kind: string;
  body: string | Record<string, unknown>;
  updated_at: string;
  deleted_at: string | null;
  created_by?: string | null;
}

export interface ReadRecord<K extends RecordKind> {
  id: string;
  childId: string | null;
  updatedAt: string;
  createdBy: string | null;
  body: RecordBody<K>;
}

/** The live records of one kind, parsed; unreadable or deleted ones are skipped. */
export function readRecords<K extends RecordKind>(
  rows: readonly RecordRow[],
  kind: K,
): ReadRecord<K>[] {
  const out: ReadRecord<K>[] = [];
  for (const r of rows) {
    if (r.kind !== kind || r.deleted_at) continue;
    let raw: unknown = r.body;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch {
        continue;
      }
    }
    const parsed = RECORD_BODY[kind].safeParse(raw);
    if (!parsed.success) continue;
    out.push({
      id: r.id,
      childId: r.child_id,
      updatedAt: r.updated_at,
      createdBy: r.created_by ?? null,
      body: parsed.data as RecordBody<K>,
    });
  }
  return out;
}

/**
 * The one profile for a child: the most recently edited, if two phones made one each before
 * either had synced (each wrote its own id; the later edit is the household's answer).
 */
export function profileFor(
  rows: readonly RecordRow[],
  childId: string,
): ReadRecord<'profile'> | null {
  const mine = readRecords(rows, 'profile').filter(r => r.childId === childId);
  mine.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return mine[0] ?? null;
}
