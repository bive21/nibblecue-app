/**
 * The client-side duplicate guard: the only layer that can tell a double tap from two logs.
 *
 * Two taps 220 ms apart are two intents with two `client_op_id`s — the server cannot relate them,
 * because from its side they are two different operations. Equally, a single tap whose response
 * was lost is replayed hours later with the same key, long after any window: only the server's
 * unique index can swallow that. Neither layer covers the other's case (`OFFLINE_SYNC.md` §3).
 *
 * The guard suppresses BEFORE minting (D25): a suppressed tap produces no `client_op_id`, no
 * outbox row and no domain row — one toast and one `duplicate_suppressed` event. Reusing the
 * first tap's `client_op_id` instead, as `docs/ARCHITECTURE.md:103` suggests, cannot satisfy
 * §9 row 17's two assertions at once, because the second tap would still have to mint a row.
 *
 * The key carries the child (`docs/MULTIPLES.md` §2): without it, the second twin's bottle looks
 * like a double tap on the first. That was a real bug in the prototype, and it is why
 * `docs/WIDGETS.md` §5's key shape has to be corrected before WP9 writes it in Swift and Kotlin.
 */
import { DEDUPE_TTL_MS } from './constants';

/**
 * `<module>:<child or 'household'>:<salient>`, e.g.
 * `diaper:cccccccc-0000-0000-0000-0000000000e1:WET`.
 *
 * `salient` is whatever makes two taps the same event: the diaper kind, the bottle amount, the
 * timer type. It is never free text a parent typed.
 */
export function dedupeKey(module: string, childId: string | null, salient: string): string {
  return `${module}:${childId ?? 'household'}:${salient}`;
}

/**
 * True when this tap falls inside the window opened by the last accepted tap on the same key.
 *
 * The window is half-open, `[lastAtMs, lastAtMs + windowMs)`: a tap exactly `windowMs` later is a
 * deliberate repeat. Suppressed taps do not extend it — the clock belongs to the accepted write —
 * so a parent holding a button down still gets one entry, and the next deliberate tap is never
 * pushed further away by their own mistakes.
 */
export function shouldSuppress(
  lastAtMs: number | null | undefined,
  nowMs: number,
  windowMs: number,
): boolean {
  if (lastAtMs === null || lastAtMs === undefined) return false;
  const since = nowMs - lastAtMs;
  return since >= 0 && since < windowMs;
}

/** `dedupe_keys` rows older than this are noise; the prune is safe because the key is not data. */
export function dedupeKeyExpiryCutoffMs(nowMs: number): number {
  return nowMs - DEDUPE_TTL_MS;
}
