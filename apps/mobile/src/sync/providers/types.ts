/**
 * The transport seam, exactly as WP2's `auth/providers/types.ts` is the identity seam.
 *
 * `SyncApi` itself lives in `packages/core/src/sync/types.ts`, because the scenario table is
 * written against it and `packages/core` may not import an app. What lives here is everything
 * the app needs *around* it: the one error class a transport may throw, the controls a fake
 * server exposes to a test and to the dev inspector, and the pair `createSyncProviders` returns.
 *
 * Screens and the worker never learn which arm they got — the same rule the auth pair follows.
 */
import type { PushErrorCode, SyncApi } from '@nibblecue/core';

export type { SyncApi };

/**
 * The WHOLE call failed, before any operation was applied. Per-op failures never come this way:
 * they arrive inside `PushResponse.results` with their own `PushErrorCode`, because a batch of
 * fifty writes must not be lost to one bad row.
 *
 *   `offline`   there is no connection; nothing was sent.
 *   `transport` the request left and the answer did not come back. The ops may or may not have
 *               been applied, which is exactly what the idempotency keys are for.
 *   `server`    the server answered, and the answer was a failure of the call.
 *
 * `pushCode` carries the classification when the server gave one (a `PostgrestError` through
 * `../sqlstate.ts`). It is `null` for `offline` and `transport`, where there is no SQLSTATE to
 * classify. `status` is the HTTP status the answer came with, when there was one.
 *
 * WHAT THE WORKER DOES WITH EACH (the owner on staging, 2026-09-29: "keeps showing 1 queued").
 * `offline` and `transport` go back to `PENDING` with `attempts` unchanged (D12): nothing was
 * answered, and the next try may simply land. A `server` failure was ANSWERED, and it used to be
 * treated the same way on the belief that a whole-call refusal can only be transient. It is not:
 * one op whose text Postgres cannot hold (a NUL, half an emoji) fails the call before any op is
 * applied, every time, and so did every op sent beside it — "1 queued" for good, under a banner
 * whose Try again sent it to be refused again. So a refusal now costs the ops an attempt, one op
 * at a time (`OutboxWorker`'s `refused`). Only a `401` — the SESSION refused, not the ops, as
 * when an expired token has the client send the publishable key — and a `408` or `429`, a gateway
 * asking for patience, are still retried for free (`refusedByServer`).
 */
export class SyncFailure extends Error {
  readonly code: 'offline' | 'transport' | 'server';
  readonly pushCode: PushErrorCode | null;
  readonly status: number | null;

  constructor(
    code: 'offline' | 'transport' | 'server',
    message?: string,
    pushCode: PushErrorCode | null = null,
    status: number | null = null,
  ) {
    super(message ?? code);
    this.name = 'SyncFailure';
    this.code = code;
    this.pushCode = pushCode;
    this.status = status;
  }
}

export function isSyncFailure(err: unknown): err is SyncFailure {
  return err instanceof SyncFailure;
}

/**
 * What a fake server lets a test (and the dev-only Sync inspector) do to it. `docs/OFFLINE_SYNC.md`
 * §9 asks for "a fake `SyncApi` that can drop responses, delay, and count server rows"; this is
 * that list, as an interface, so the inspector can hold one without importing the implementation.
 */
export interface MockSyncControls {
  /** Reachability. `false` makes every call throw `SyncFailure('offline')` without touching state. */
  online: boolean;
  /** Milliseconds every call waits before answering. 0 in tests, useful on a device. */
  delayMs: number;
  /**
   * How many ops of the next batch are applied before the call throws `SyncFailure('transport')`.
   * `null` disables it. This is the mid-batch kill of §9 row 7b, and the reason it is a count
   * rather than a boolean: "three of five were applied" is the state a reclaim has to survive.
   */
  abortAfterOps: number | null;
  /** Apply the next batch in full, then throw instead of answering (§9 row 7a: the lost 2xx). */
  dropNextResponse(): void;
  /** Reject the next op with this code, whatever it is. One shot. */
  rejectNextWith(code: PushErrorCode, message?: string): void;
  /** Hold this row back from every pull until the cursor has passed it — the commit-lag case. */
  withholdUntilCursorPast(rowId: string): void;
  /** Ground truth: how many rows a table holds, with an optional equality filter. */
  rowCount(table: string, where?: Record<string, unknown>): number;
  /** Write a row as if another caregiver's device had synced it. */
  insertAsOtherDevice(table: string, row: Record<string, unknown>): void;
  /**
   * Correct a member's role to the one their account holds; true when it changed. The fake's
   * member list is what the phone reads a role from (the handoff audit's M6), so a dev build
   * whose account joined as a caregiver must not be seeded as an owner.
   */
  setMemberRole(householdId: string, userId: string, role: MockMemberRole): boolean;
}

/** The roles `household_members.role` holds (0001's `member_role`). */
export type MockMemberRole = 'OWNER' | 'PARENT' | 'CAREGIVER' | 'VIEW_ONLY';

/** What `createSyncProviders` returns. `mock` is non-null only on the mock arm, and only a
 *  dev build ever reads it — the same shape `auth/providers/index.ts` returns. */
export interface SyncProviders {
  api: SyncApi;
  mock: MockSyncControls | null;
}
