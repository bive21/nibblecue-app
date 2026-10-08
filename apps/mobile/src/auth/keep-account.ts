/**
 * SIGNING IN AGAIN KEEPS THE ACCOUNT (Privacy §7, Terms §12, the Delete account page's
 * `ACCOUNT_DELETION.what`, and the website's deletion page: "Signing in again before then cancels
 * it"). Found broken on 2026-09-27: the server has had the undo since 0008, and no build called it,
 * so on a real project the purge would have taken accounts whose owners had come back. The in-app
 * test backend cancelled inside its own sign-in, which is how the gap hid; it no longer does.
 *
 * THE RULE, IN ONE PLACE EACH:
 *   - the phone asks after EVERY sign-in — email and password, the emailed links (confirmation,
 *     reset), Google through the browser — and asks again while an account read still shows a
 *     deletion pending, on a backoff timer while signed in, and on every launch and reconnect
 *     (each of which reads the account). `AuthContext` owns the triggers; this file owns the ask.
 *   - the SERVER decides what the ask may undo (migration 0131): only a deletion requested before
 *     the asking session began. So asking is always safe — the phone that asked for the deletion,
 *     a phone still signed in from before, or a retry landing a moment after a fresh request, all
 *     get `cancelled: false` and change nothing.
 *   - and the purge re-checks at run time: an account holding a session that began after its
 *     request is kept and its request canceled, even if every ask here failed (0131).
 *
 * Pure but for the API handed in, so the node suite runs it against the test backend.
 */
import type { AccountsApi } from './providers/types';

/** What one ask came to. */
export type KeepOutcome =
  /** a deletion was pending and this sign-in undid it: the parent is told, once */
  | 'kept'
  /** nothing pending, or not this session's to undo (0131): nothing to say, nothing to retry */
  | 'nothing'
  /** the ask did not land — no signal, a server fault, a refused session: asked again later */
  | 'retry';

/** Ask the server to undo a pending deletion for this session. Never throws. */
export async function askToKeepAccount(
  api: Pick<AccountsApi, 'cancelAccountDeletion'>,
): Promise<KeepOutcome> {
  try {
    const r = await api.cancelAccountDeletion();
    if (!r.ok) return 'retry';
    return r.cancelled ? 'kept' : 'nothing';
  } catch {
    // offline (`AuthFailure('offline')`) or a transport fault: the same answer as a refusal
    return 'retry';
  }
}

/**
 * WHICH PENDING DELETION THE SERVER HAS ALREADY ANSWERED FOR, per person: an account read that
 * shows the same one again is not asked about again until the next sign-in. Without it, a phone
 * still signed in from before a request — whose asks the server refuses by design — would ask on
 * every account read for fourteen days.
 */
export const keepAnswerKey = (userId: string, purgeAt: string): string => `${userId}|${purgeAt}`;

/** Whether an account read showing `pending` should start an ask. */
export function keepAskDue(
  userId: string,
  pending: { purge_at: string } | null,
  answered: string | null,
): boolean {
  return pending !== null && answered !== keepAnswerKey(userId, pending.purge_at);
}
