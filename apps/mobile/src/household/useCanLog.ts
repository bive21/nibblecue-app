/**
 * WHETHER THE PERSON ON THIS PHONE MAY LOG FOR THE FAMILY ON SCREEN (`canLog` in core: the
 * server's `app.can_write`, read here). The role is per family, and the family on screen is
 * `account.memberships[0]` everywhere in the app (`useHouseholdId`, `useCanAdmin`).
 *
 * Two layers ask it (the 2026-10-08 scenario finding, a view only member logging from the app):
 *
 *   * THE WRITE FUNNEL, `useWriteContext().context()`, which refuses for a view only member with
 *     one toast and writes nothing. Every new entry, timer, slot answer, stash move and list line
 *     goes through it, and so do the doors from outside the app (`LinkRouter`, the reminder's
 *     "Log it"), which also check it before they act, so they land on Today instead.
 *   * THE CONTROLS: the + button, the tiles' tap, a timer's stop, pause and switch, the shell's
 *     capture sheets, and the add and tick controls of the shared lists are hidden for them
 *     (PRODUCT_SPEC: view only "hides the + button, all save buttons and timer controls").
 */
import { canLog } from '@nibblecue/core';
import { useAuth } from '../auth/AuthContext';

export function useCanLog(): boolean {
  const { account } = useAuth();
  return canLog(account?.memberships[0]?.role);
}
