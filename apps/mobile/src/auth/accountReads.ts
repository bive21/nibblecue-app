/**
 * WHEN THE APP READS THE ACCOUNT AGAIN WITHOUT BEING ASKED (docs/AUTH_AND_TRIAL.md §4,
 * "Reconciliation": *"The client refreshes on cold start, on foreground after >5 minutes, and after
 * a purchase or restore completes"*).
 *
 * The foreground read was never built (found 2026-09-27, the launch sweep). The account — and with
 * it the household's plan — was read at launch, on a reconnect after a failed refresh, and after an
 * action on this phone, so a phone that stayed in memory kept whatever it last heard:
 *
 *   - Dana buys Plus; Sam opens the app from the background and still meets every lock. The plan
 *     is the household's (migration 0101), and his phone never asked again.
 *   - a phone used every few hours through the night is rarely cold-started: the preview's fourteen
 *     days passed, the plan stayed "Plus preview", and the day-14 card never came.
 *
 * The rule is the document's: back in the foreground, signed in, with a connection (a phone without
 * one is the refresh loop's to retry — `AuthContext`'s `kick`), and more than five minutes since the
 * last read. Pure, so the node suite plays it.
 */

/** How old an account read may be before a return to the foreground reads it again. */
const ACCOUNT_READ_STALE_MS = 5 * 60_000;

export function foregroundReadDue(input: {
  signedIn: boolean;
  /** The refresh loop's word on the connection: offline is the loop's own retry to make. */
  online: boolean;
  /** Device time of the last account read the app wrote, or 0 for none yet. */
  lastReadAt: number;
  now: number;
}): boolean {
  if (!input.signedIn || !input.online) return false;
  return input.now - input.lastReadAt > ACCOUNT_READ_STALE_MS;
}
