/**
 * WHICH LAUNCH THIS IS, ON THIS PHONE: counted once per launch, durably, in `ui_prefs`.
 *
 * Two rules keep out of the first session: a team tip (docs/IN_APP_MESSAGES.md §2) and the Log
 * together card (docs/SHARED_CARE.md §6). "First" has to survive the app being killed, because a
 * counter in memory would make every cold start a first session and neither would ever appear; so
 * the count is a row in the local database, bumped the first time a launch asks.
 *
 * ONE COUNT FOR EVERY READER. Until 2026-09-28 the messages hook kept this counter to itself, as a
 * number cached once its own read came back; a second reader bumping the row as well would have
 * made each launch count twice, and two first reads racing each other could do the same. So the
 * first ask of a launch makes the promise and every later ask is handed the same one. A count that
 * failed is not kept, so the next ask tries again rather than living with a failure.
 *
 * The row lives in the local database, which a sign-out deletes (docs/ACCOUNTS.md §4 step 8), so
 * the count starts again with the next sign-in: the first session after it is a first session.
 */
import type { Db } from '../db/driver';

/** The row's key. It keeps the messages' name, so the count a phone already has carries on. */
export const LAUNCH_SESSION_KEY = 'messages.sessions';

async function countLaunch(db: Db): Promise<number> {
  const row = await db.get<{ value: string }>('select value from ui_prefs where key = ?', [
    LAUNCH_SESSION_KEY,
  ]);
  const next = Number.parseInt(row?.value ?? '0', 10) + 1;
  const count = Number.isFinite(next) ? next : 1;
  await db.run(
    `insert into ui_prefs (key, value) values (?, ?)
     on conflict (key) do update set value = excluded.value`,
    [LAUNCH_SESSION_KEY, String(count)],
  );
  return count;
}

let thisLaunch: Promise<number> | null = null;

/** This launch's number: 1 on the very first. Bumped once per launch, however many ask. */
export function launchSession(db: Db): Promise<number> {
  if (thisLaunch === null) {
    const counting = countLaunch(db);
    thisLaunch = counting;
    counting.catch(() => {
      if (thisLaunch === counting) thisLaunch = null;
    });
  }
  return thisLaunch;
}

/** For tests only: a new launch. */
export function resetLaunchSessionForTests(): void {
  thisLaunch = null;
}
