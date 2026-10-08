/**
 * The duplicate guard's storage half — a TABLE, never a module-level `Map` (WP4 D25).
 *
 * WHY A TABLE. The prototype's guard was a plain object living outside its state snapshot
 * (`docs/UX_AUDIT.md` §4.62, :1054-1080). Two things followed. Restoring the snapshot between
 * checks did not clear the guard, so one check silently suppressed another check's write forty
 * checks later — a state leak that took a *flapping* assertion to find. And because the guard
 * was consulted between the stash draw and the entry write rather than in front of both, a
 * parent who tapped Save twice got one feed and TWO deductions, with the second draw's
 * leftover stamped onto the previous feed's record. The stash then read lower than the milk
 * actually in the fridge: the failure direction that matters, because nothing looks broken.
 *
 * The rule that comes out of it, and that this file exists to hold:
 *
 *   > The duplicate guard is read and written INSIDE the same transaction as the write it
 *   > guards, and it sits in front of every step of that write, never between two of them.
 *
 * So a suppressed tap writes nothing at all — no domain row, no outbox row, no `client_op_id`
 * (D25 suppresses *before* minting) — and a write that throws takes its dedupe key down with
 * it, because the key was recorded in the transaction that rolled back. Both halves are
 * asserted in `repository.test.ts`.
 *
 * The rows are not data: `dedupe_keys` holds `<module>:<child or 'household'>:<salient>` and a
 * millisecond, never free text a parent typed, and a row older than `DEDUPE_TTL_MS` is pruned.
 */
import { dedupeKeyExpiryCutoffMs, shouldSuppress } from '@nibblecue/core';
import type { Tx } from '../db/driver';

/** One key and the window it opens. A write may carry several (one per child in a fan-out). */
export interface DedupeGuard {
  key: string;
  windowMs: number;
}

/** When this key was last accepted, or null if it has never been seen (or has been pruned). */
export async function lastAcceptedAt(t: Tx, key: string): Promise<number | null> {
  const row = await t.get<{ at_ms: number }>('select at_ms from dedupe_keys where key = ?', [key]);
  return row?.at_ms ?? null;
}

/** True when this key's window is still open — the caller must then write nothing. */
export async function isSuppressed(t: Tx, guard: DedupeGuard, nowMs: number): Promise<boolean> {
  return shouldSuppress(await lastAcceptedAt(t, guard.key), nowMs, guard.windowMs);
}

/**
 * Record an accepted write's key. Only an ACCEPTED write moves the clock: a suppressed tap
 * never reaches here, so holding a button down still produces one entry and the next
 * deliberate tap is not pushed further away by the parent's own mistakes.
 */
export async function recordAccepted(t: Tx, key: string, nowMs: number): Promise<void> {
  await t.run(
    'insert into dedupe_keys (key, at_ms) values (?, ?) on conflict(key) do update set at_ms = excluded.at_ms',
    [key, nowMs],
  );
}

/** Drop keys past their TTL. Safe at any time: the key is a guard, not a record. */
export async function pruneDedupeKeys(t: Tx, nowMs: number): Promise<number> {
  const { changes } = await t.run('delete from dedupe_keys where at_ms < ?', [
    dedupeKeyExpiryCutoffMs(nowMs),
  ]);
  return changes;
}
