/**
 * The outbox retry schedule.
 *
 * `delay = base/2 + rand()*(base/2)` with `base = min(1000 * 2^attempts, 300_000)`: 0.5x-1.0x of
 * a capped exponential base. That is deliberately not the auth schedule in
 * `apps/mobile/src/auth/session.ts`, which is 1.0x-1.5x of the same bases — a token refresh wants
 * to be late rather than early, a queued log wants the opposite. Two schedules, one comment each.
 */
import { BASE_MS, CAP_MS, MAX_ATTEMPTS } from './constants';

/**
 * Milliseconds to wait before attempt `attempts + 1`, given `attempts` rejections so far.
 * `rng` is injected so a test can pin both ends of the jitter window.
 */
export function backoffDelayMs(attempts: number, rng: () => number = Math.random): number {
  const base = backoffBaseMs(attempts);
  return base / 2 + rng() * (base / 2);
}

/** The un-jittered base for `attempts` rejections: 1 s, 2 s, 4 s … capped at 5 minutes. */
export function backoffBaseMs(attempts: number): number {
  if (!Number.isInteger(attempts) || attempts < 0) {
    throw new RangeError(`attempts must be a non-negative integer, got ${attempts}`);
  }
  return Math.min(BASE_MS * 2 ** attempts, CAP_MS);
}

/**
 * True when the next rejection parks the op as FAILED rather than scheduling another attempt.
 * `attempts` is the count *before* this attempt, matching the outbox column.
 *
 * Only the server's refusals increment `attempts` (D12): per-op CONFLICT and SERVER rejections,
 * and a whole call the server answered with a refusal (the app's `OutboxWorker.refused`, since
 * 2026-09-29 — it was retried for ever before). A request that got no answer is a transport
 * failure, counted in worker memory and reset on reconnect, foreground and start — ten flaky
 * minutes of tunnel must never mark a valid log FAILED while the UI promises it will sync.
 */
export function isFinalAttempt(attempts: number): boolean {
  return attempts + 1 >= MAX_ATTEMPTS;
}
