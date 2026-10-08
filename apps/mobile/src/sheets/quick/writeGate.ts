/**
 * THE ONE QUESTION THE WRITE FUNNEL ASKS BEFORE IT OPENS ANYTHING (`useWriteContext().context()`;
 * the 2026-10-08 scenario finding: a view only member logged from the app, the server refused
 * every op as FORBIDDEN, and the entry lived on that one phone behind a failed outbox row).
 *
 * Pure, so the scenario runs exactly what the hook runs: may this person write (`canLog` in core,
 * the server's `app.can_write`)? No: say so once, in one sentence, and hand back nothing to write
 * with, so nothing is written. Yes: open the context as before.
 */
import { VIEW_ONLY_NO_LOG } from '@nibblecue/core';

export async function writeGate<T>(
  canLog: boolean,
  refuse: (sentence: string) => void,
  open: () => Promise<T | null>,
): Promise<T | null> {
  if (!canLog) {
    refuse(VIEW_ONLY_NO_LOG);
    return null;
  }
  return open();
}
