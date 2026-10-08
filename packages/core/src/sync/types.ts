/**
 * Every wire type of the sync layer, as a Zod schema with an inferred type.
 *
 * This file is the contract the rest of WP4 is written against: the outbox row as it is stored,
 * the push and pull envelopes, and the two interfaces (`SyncApi`, `Net`) that keep the transport
 * out of `packages/core`. Nothing here imports React, React Native, Expo, Supabase or a
 * workspace package — `src/boundaries.test.ts` fails the build if it ever does.
 *
 * The three outbox enums are read off `OutboxOp` in `domain/domain-types.ts` rather than retyped,
 * so the stored shape and the domain shape cannot drift apart in a rename.
 */
import { z } from 'zod';
import { ActivityBase, ActivityType, OutboxOp, RunningTimer } from '../domain/domain-types';

/* ---------- the outbox ---------- */

export const OutboxState = OutboxOp.shape.state;
export type OutboxState = z.infer<typeof OutboxState>;

const OutboxOpKind = OutboxOp.shape.op;
export type OutboxOpKind = z.infer<typeof OutboxOpKind>;

export const OutboxEntity = OutboxOp.shape.entity;
export type OutboxEntity = z.infer<typeof OutboxEntity>;

/**
 * One row of the local `outbox` table, exactly as SQLite holds it: `payload` is JSON text and
 * every timestamp is an ISO string. `sending_at` is written in the same statement that sets
 * `state='SENDING'`, before the request leaves, so a killed process can tell "in flight for two
 * seconds" from "in flight for ten minutes" (D11).
 */
export const OutboxRow = z.object({
  client_op_id: z.string().uuid(),
  entity: OutboxEntity,
  op: OutboxOpKind,
  entity_id: z.string().uuid(),
  household_id: z.string().uuid(),
  payload: z.string(),
  depends_on: z.string().uuid().nullable(),
  seq: z.number().int().nonnegative(),
  created_at: z.string(),
  state: OutboxState,
  attempts: z.number().int().nonnegative(),
  next_attempt_at: z.string().nullable(),
  sending_at: z.string().nullable(),
  last_error: z.string().nullable(),
});
export type OutboxRow = z.infer<typeof OutboxRow>;

/* ---------- push ---------- */

/**
 * One operation on the wire. `payload` always carries `client_edited_at` (the client's own edit
 * clock, D1) and, for an activity, its detail row embedded as `payload.detail` (D5) — the detail
 * tables have no `household_id` of their own, so their RLS resolves through the parent and a
 * separate detail op could only ever be applied after it.
 */
export const PushOp = z.object({
  client_op_id: z.string().uuid(),
  entity: OutboxEntity,
  op: OutboxOpKind,
  entity_id: z.string().uuid(),
  household_id: z.string().uuid(),
  payload: z.record(z.unknown()),
});
export type PushOp = z.infer<typeof PushOp>;

/**
 * A `PushOp` plus the local dependency edge. `depends_on` never leaves the device: the server
 * applies a batch in array order inside one transaction, so ordering is the client's job and
 * `selectBatch` is where it is enforced.
 */
export const ChainOp = PushOp.extend({ depends_on: z.string().uuid().nullable() });
export type ChainOp = z.infer<typeof ChainOp>;

/** Drop the local-only dependency edge. The one place a `ChainOp` becomes a `PushOp`. */
export function toPushOp(op: ChainOp): PushOp {
  const { client_op_id, entity, op: kind, entity_id, household_id, payload } = op;
  return { client_op_id, entity, op: kind, entity_id, household_id, payload };
}

export const PushErrorCode = z.enum(['VALIDATION', 'FORBIDDEN', 'CONFLICT', 'SERVER']);
export type PushErrorCode = z.infer<typeof PushErrorCode>;

/** VALIDATION and FORBIDDEN are terminal; CONFLICT and SERVER are retried with backoff. */
export function isTerminal(code: PushErrorCode): boolean {
  return code === 'VALIDATION' || code === 'FORBIDDEN';
}

export const PushConflict = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('ledger_overdraw'),
    container_id: z.string().uuid(),
    available_ml: z.number().int().nonnegative(),
  }),
  // a rule edit that lost the §2.5 race: the current row rides along so the sheet can show it
  z.object({
    kind: z.literal('rule_stale'),
    current: z.record(z.string(), z.unknown()),
  }),
  z.object({
    kind: z.literal('timer_merged'),
    timer_id: z.string().uuid(),
    started_at: z.string(),
    started_by: z.string().uuid(),
  }),
]);
export type PushConflict = z.infer<typeof PushConflict>;

/**
 * `duplicate` is a SUCCESS, not a failure: the server already holds exactly one record for this
 * operation. `entity_id` names the surviving server row when it is not the one the client sent
 * (a merged timer, a second stop of the same timer).
 */
export const PushResult = z.object({
  client_op_id: z.string().uuid(),
  status: z.enum(['applied', 'duplicate', 'rejected']),
  entity_id: z.string().uuid().optional(),
  server_updated_at: z.string().optional(),
  error: z.object({ code: PushErrorCode, message: z.string() }).optional(),
  conflict: PushConflict.optional(),
});
export type PushResult = z.infer<typeof PushResult>;

export const PushResponse = z.object({
  results: z.array(PushResult),
  server_time: z.string(),
});
export type PushResponse = z.infer<typeof PushResponse>;

/* ---------- pull ---------- */

/**
 * How a table's current state is reconstructed locally (D17). The strategy is a property of the
 * server schema, not a preference: `household_members`, `storage_locations`, `favorites` and
 * `reminders` have no `updated_at` at all, `running_timers` are hard-deleted so a tombstone can
 * never arrive, and the ledger is append-only.
 */
export const PullStrategy = z.enum(['delta', 'delta_status', 'full', 'append', 'user_window']);
export type PullStrategy = z.infer<typeof PullStrategy>;

/** The keyset cursor. `(updated_at, id)` is a total order; `updated_at` alone loses rows on a tie. */
export const PullCursor = z.object({ updated_at: z.string(), id: z.string() });
export type PullCursor = z.infer<typeof PullCursor>;

export const PullTableRequest = z.object({
  name: z.string(),
  strategy: PullStrategy,
  since: z.string().nullable(),
  since_id: z.string().nullable(),
  limit: z.number().int().positive(),
});
export type PullTableRequest = z.infer<typeof PullTableRequest>;

export const PullRequest = z.object({
  household_id: z.string().uuid(),
  tables: z.array(PullTableRequest),
});
export type PullRequest = z.infer<typeof PullRequest>;

/** `full: true` marks a page that is the whole current set, so absence means removal (D18). */
export const PullTablePage = z.object({
  rows: z.array(z.record(z.unknown())),
  next_cursor: PullCursor.nullable(),
  has_more: z.boolean(),
  full: z.boolean().optional(),
});
export type PullTablePage = z.infer<typeof PullTablePage>;

export const PullResponse = z.object({
  tables: z.record(PullTablePage),
  server_time: z.string(),
});
export type PullResponse = z.infer<typeof PullResponse>;

/* ---------- the seams ---------- */

/**
 * The only way `packages/core` and the sync engine talk to a server. Implemented twice: over
 * supabase-js (`apps/mobile/src/sync/providers/supabase.ts`) and over an in-memory server
 * (`providers/mock.ts`), so the same scenarios run with and without a network.
 */
export interface SyncApi {
  push(ops: PushOp[]): Promise<PushResponse>;
  pull(req: PullRequest): Promise<PullResponse>;
  subscribe?(householdId: string, onChange: (table: string) => void): () => void;
}

/** Connectivity, injected so a test never reaches NetInfo. */
export interface Net {
  isConnected(): Promise<boolean>;
  onReconnect(cb: () => void): () => void;
}

/** Time, injected so no sync code calls `Date.now()` directly. */
export interface Clock {
  now(): number;
  iso(at?: number): string;
}

/**
 * Why a flush pass started. `'bgtask'` has no binding in WP4 — background registration needs a
 * native rebuild Expo Go cannot run, and "never lose a log" must not rest on a best-effort
 * 15-minute wake. The kill case is covered by the reclaim-on-start path instead (D20).
 */
export const FlushReason = z.enum([
  'reconnect',
  'foreground',
  'write',
  'tick',
  'bgtask',
  'manual',
  'teardown',
]);
export type FlushReason = z.infer<typeof FlushReason>;

/* ---------- activities and their detail rows ---------- */

/**
 * The detail tables, keyed `activity_id uuid primary key`: the eight of `0001_init.sql`, and
 * `wellbeing_details` (migration 0160, the Health note's chips).
 */
export const DETAIL_TABLES = [
  'bottle_details',
  'breastfeed_details',
  'pump_details',
  'sleep_details',
  'diaper_details',
  'solids_details',
  'med_details',
  'measurement_details',
  'wellbeing_details',
] as const;
export type DetailTable = (typeof DETAIL_TABLES)[number];

/**
 * Which detail table an activity type writes, or `null` where the activity is the whole record.
 * Five of the fifteen types have no detail row at all, and a write path that invents one for
 * them would fail the foreign key on an empty row (D7's airplane-mode sweep asserts both halves).
 */
export const DETAIL_TABLE_BY_ACTIVITY: Readonly<Record<ActivityType, DetailTable | null>> = {
  bottle: 'bottle_details',
  breastfeed: 'breastfeed_details',
  pump: 'pump_details',
  diaper: 'diaper_details',
  sleep: 'sleep_details',
  solids: 'solids_details',
  med: 'med_details',
  growth: 'measurement_details',
  temp: 'measurement_details',
  water: null,
  tummy: null,
  bath: null,
  milestone: null,
  note: null,
  wellbeing: 'wellbeing_details',
};

export type CanonicalUnit = NonNullable<ActivityBase['canonical_unit']>;
export type TimerType = RunningTimer['type'];

/** A domain row destined for the local mirror, in domain shape: booleans are booleans and jsonb
 *  is an object. Encoding to SQLite's integer/text columns is `apps/mobile/src/db`'s job. */
export interface LocalRow {
  table: string;
  row: Record<string, unknown>;
}

/** What every chain builder returns: the rows to write locally and the ops to enqueue, in order. */
export interface Chain {
  rows: LocalRow[];
  ops: ChainOp[];
}
