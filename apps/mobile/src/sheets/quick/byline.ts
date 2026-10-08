/**
 * The Quick Entry byline (PRODUCT_SPEC.md §5.2 part 5).
 *
 * One line under the save button that answers two questions a caregiver actually has: whose
 * name goes on this entry, and did it go anywhere. Pure so the wording is testable — the copy
 * is the feature here, not the layout.
 *
 * The offline wording is the one that matters. `saved on this phone, queued for sync` is a
 * statement that the log is SAFE, not a warning that something failed: the write already
 * succeeded locally, which is the whole promise of a local-first app (CLAUDE.md rule 7). A
 * parent at 3 a.m. with no signal must not be left wondering whether to write it on paper.
 * Nothing here says "error", "failed", "retry" or "offline mode".
 */

/** Whose name the entry carries, and where it went. */
export function bylineText(displayName: string, online: boolean): string {
  const name = displayName.trim();
  const who = name.length > 0 ? `Logged as ${name}` : 'Logged';
  return online
    ? `${who} · saves immediately, syncs to the household`
    : `${who} · saved on this phone, queued for sync`;
}

/**
 * Words the byline must never contain.
 *
 * Exported so the test cannot drift from the rule it enforces, and so a future sheet that
 * writes its own status line can reuse the list rather than inventing a second opinion about
 * what a queued write should be called.
 */
export const BYLINE_BANNED = [
  'error',
  'failed',
  'failure',
  'retry',
  'lost',
  'unable',
  'problem',
  'warning',
] as const;
