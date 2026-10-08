/**
 * THE CRASH REPORTS' TWO NEEDS FROM THE SIGNED-IN APP (docs/CRASH_REPORTS.md §2), in one hook that
 * `App.tsx` calls inside every provider:
 *
 *   · the names to take out of a report, kept current as the account changes (`context.ts`)
 *   · the queue sent, once per launch for each person signed in, when the build has a server
 *
 * It renders nothing and decides nothing on screen. A send that fails leaves the queue as it was.
 */
import { useEffect } from 'react';
import { crumb } from '../app/boot';
import { useAuth } from '../auth/AuthContext';
import { noteCrashNames } from './context';
import { crashStore } from './deviceStore';
import { namesToScrub } from './names';
import { flushCrashes } from './send';
import { crashSinkFor } from './sink';

export function useCrashReports(): void {
  const { env, account, session } = useAuth();
  useEffect(() => noteCrashNames(namesToScrub(account, session)), [account, session]);
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (userId === null) return;
    const sink = crashSinkFor(env);
    if (sink === null) return;
    flushCrashes(crashStore, sink, Date.now())
      .then(r => {
        if (r.sent + r.refused > 0)
          crumb(
            `crash: sent ${String(r.sent)}, refused ${String(r.refused)}, ${String(r.left)} left`,
          );
      })
      .catch(() => undefined);
  }, [userId, env]);
}
