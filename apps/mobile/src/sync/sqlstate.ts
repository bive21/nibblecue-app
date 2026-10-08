/**
 * SQLSTATE to `PushErrorCode`, the client's half of `app.sync_error_code`
 * (`supabase/migrations/0009_add_sync_push.sql`).
 *
 * WHY IT MATTERS THAT THE TWO AGREE. `isTerminal` in `packages/core/src/sync/types.ts` says
 * VALIDATION and FORBIDDEN park an op as FAILED and CONFLICT and SERVER retry with backoff. A
 * misclassification is therefore either a parent's log parked for ever with an error the queue
 * will never clear, or a queue spinning for the rest of the install on a row the server will
 * never accept. Both are worse than the failure they came from.
 *
 * WHO USES IT. Two arms, one table, which is the point:
 *   * `providers/supabase.ts` maps a `PostgrestError` from `rpc('sync_push')` — a failure of the
 *     WHOLE call, before any op was applied, because the per-op failures come back inside
 *     `results[]` already classified by the server.
 *   * `providers/mock.ts` raises the same SQLSTATEs its in-memory constraints would raise and
 *     maps them through here, so the fake cannot classify an error differently from Postgres.
 *
 * The table below is `app.sync_error_code` line for line. `docs/plans/WP4.md:452` lists a subset
 * of it (no `22003`, no `40001`); the shipped migration is the fact and is what is mirrored, and
 * `sqlstate.test.ts` asserts every row of it.
 */
import type { PushErrorCode } from '@nibblecue/core';

/**
 * Every SQLSTATE these migrations, their constraints and their tests actually raise. Named so a
 * call site reads as the failure it means rather than as five digits.
 */
export const SQLSTATE = {
  /** insufficient_privilege: RLS refused, or a revoked grant. */
  INSUFFICIENT_PRIVILEGE: '42501',
  /** check_violation: `activity_time_sane`, `milk_txn_delta_sign`, a domain check. */
  CHECK_VIOLATION: '23514',
  /** not_null_violation: a payload missing a required column. */
  NOT_NULL_VIOLATION: '23502',
  /** invalid_text_representation: a malformed uuid, an unknown enum label. */
  INVALID_TEXT_REPRESENTATION: '22P02',
  /** invalid_datetime_format. */
  INVALID_DATETIME_FORMAT: '22007',
  /** numeric_value_out_of_range. */
  NUMERIC_VALUE_OUT_OF_RANGE: '22003',
  /** foreign_key_violation: the parent row has not landed yet, so the op is retryable. */
  FOREIGN_KEY_VIOLATION: '23503',
  /** unique_violation on an index no branch of `sync_apply_op` owns. */
  UNIQUE_VIOLATION: '23505',
  /** deadlock_detected. */
  DEADLOCK_DETECTED: '40P01',
  /** serialization_failure. */
  SERIALIZATION_FAILURE: '40001',
  /** raise_exception: a plpgsql `raise` with no errcode — the ledger balance and the
   *  write-once triggers both land here, and only the message tells them apart. */
  RAISE_EXCEPTION: 'P0001',
  /** `app.fail` codes (0008's convention). */
  CC401: 'CC401',
  CC403: 'CC403',
  CC404: 'CC404',
  CC409: 'CC409',
  CC422: 'CC422',
  CC429: 'CC429',
} as const;

const VALIDATION_STATES: readonly string[] = [
  SQLSTATE.CHECK_VIOLATION,
  SQLSTATE.NOT_NULL_VIOLATION,
  SQLSTATE.INVALID_TEXT_REPRESENTATION,
  SQLSTATE.INVALID_DATETIME_FORMAT,
  SQLSTATE.NUMERIC_VALUE_OUT_OF_RANGE,
];

/**
 * The classification, given a SQLSTATE and the message that came with it.
 *
 * The message is not decoration: `P0001` is every bare `raise exception` in the schema, so the
 * ledger's "would go negative" (a real race another caregiver won — retryable, and the op gets
 * rewritten) and the stash's "immutable" write-once guards (a bug in the payload — terminal)
 * are one SQLSTATE with two answers.
 */
export function pushErrorCode(state: string, message = ''): PushErrorCode {
  if (state === SQLSTATE.INSUFFICIENT_PRIVILEGE) return 'FORBIDDEN';
  if (VALIDATION_STATES.includes(state)) return 'VALIDATION';
  if (state === SQLSTATE.FOREIGN_KEY_VIOLATION) return 'CONFLICT';
  if (state === SQLSTATE.UNIQUE_VIOLATION) return 'CONFLICT';
  if (state === SQLSTATE.DEADLOCK_DETECTED) return 'SERVER';
  if (state === SQLSTATE.SERIALIZATION_FAILURE) return 'SERVER';
  if (state === SQLSTATE.RAISE_EXCEPTION) {
    if (message.includes('would go negative')) return 'CONFLICT';
    if (message.includes('immutable')) return 'VALIDATION';
    return 'SERVER';
  }
  if (state === SQLSTATE.CC401 || state === SQLSTATE.CC403) return 'FORBIDDEN';
  if (state === SQLSTATE.CC404 || state === SQLSTATE.CC409) return 'CONFLICT';
  if (state === SQLSTATE.CC422) return 'VALIDATION';
  return 'SERVER';
}

/** The error shape PostgREST returns, and the shape the mock raises. Structural on purpose: a
 *  `PostgrestError` from supabase-js satisfies it without this file importing the client. */
export interface PostgrestLikeError {
  code?: string | null | undefined;
  message?: string | null | undefined;
  details?: string | null | undefined;
  hint?: string | null | undefined;
}

export interface ClassifiedPushError {
  code: PushErrorCode;
  message: string;
  /** The SQLSTATE as it arrived, kept for the Sync inspector's developer row. */
  state: string;
}

/**
 * A whole-call failure from `rpc('sync_push')` or `rpc('sync_pull')`, classified.
 *
 * `CC429` is not in `app.sync_error_code`'s table and therefore falls to `SERVER`, which is the
 * right answer for a rate limit: retryable, with the backoff the outbox already has.
 */
export function classifyPushError(error: PostgrestLikeError): ClassifiedPushError {
  const state = error.code ?? '';
  const message = error.message ?? 'server_error';
  return { code: pushErrorCode(state, message), message, state };
}
