/**
 * RECORDING A CRASH (docs/CRASH_REPORTS.md §1). Called by the error page's boundary for a render
 * error, and by the global trap for everything else (`app/errorTrap.ts`): a throw in a callback, a
 * fatal from the native side, and in a release build a promise nobody caught.
 *
 * The report is BUILT here, synchronously, from the error and the facts of the moment, and then
 * WRITTEN to the phone's queue without waiting: the page that says something went wrong must not
 * wait on storage, and a write that cannot finish costs one report, never the page. It is SENT on
 * a later launch (`useCrashReports`). Nothing here can throw: a recorder that crashes while
 * recording a crash takes the error page with it.
 */
import { crashReportFrom, type CrashReport, type CrashSource } from '@nibblecue/core';
import { crumb } from '../app/boot';
import { crashNames, crashRoute } from './context';
import type { CrashDevice } from './device';
import { queueCrash } from './store';
import type { KeyValueStore } from '../prefs';

export interface CrashCause {
  source: CrashSource;
  fatal: boolean;
  componentStack?: string | null;
}

export interface RecordDeps {
  device: () => CrashDevice;
  store: KeyValueStore;
  now: () => number;
}

/**
 * The report for this error, already queued (or on its way), or null if it could not be built.
 * The app calls `recordCrash` (`./onDevice.ts`), which hands this the phone; the tests hand it theirs.
 */
export function recordCrashWith(
  error: unknown,
  cause: CrashCause,
  deps: RecordDeps,
): CrashReport | null {
  let report: CrashReport;
  try {
    const at = deps.now();
    report = crashReportFrom({
      error,
      source: cause.source,
      fatal: cause.fatal,
      componentStack: cause.componentStack ?? null,
      at,
      ...deps.device(),
      route: crashRoute(),
      names: crashNames(),
    });
    void queueCrash(deps.store, report, at).catch(() => undefined);
  } catch {
    return null;
  }
  crumb(`crash: recorded a ${cause.source} error${cause.fatal ? ' (fatal)' : ''}`);
  return report;
}
