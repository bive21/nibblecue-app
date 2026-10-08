/**
 * The one place a crash can be READ (the owner's device, 2026-09-15: "I can only see for one
 * second before crashing", with nothing in the terminal). React's error boundary catches what
 * throws during render; everything else — a rejected promise in an effect, a throw inside a
 * native callback — goes to React Native's global handler and takes the app with it, silently.
 *
 * So the global handler is chained here: our listener shows the message, and the previous
 * handler is NOT called for a fatal, because calling it is what closes the app before anybody
 * can read what it said. A non-fatal is passed on untouched.
 *
 * AND EVERY ONE IS RECORDED (2026-10-08, docs/CRASH_REPORTS.md): fatal or not, the error becomes a
 * report on the phone's queue before anything else happens to it (`crash/onDevice.ts`). In a
 * release build a promise nobody caught is recorded too, through Hermes' own rejection tracker; a
 * development build leaves that tracker to React Native, whose warnings use it.
 */
import type { CrashReport } from '@nibblecue/core';
import { recordCrash } from '../crash/onDevice';
import { crumb } from './boot';

type Listener = (error: Error, report: CrashReport | null) => void;

interface GlobalErrorUtils {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

interface RejectionTracker {
  enablePromiseRejectionTracker?: (options: {
    allRejections: boolean;
    onUnhandled: (id: number, error: unknown) => void;
    onHandled: (id: number) => void;
  }) => void;
}

let listener: Listener | null = null;
let installed = false;

/** The error screen subscribes; `null` unsubscribes. */
export function onFatalError(next: Listener | null): void {
  listener = next;
}

export const asError = (value: unknown): Error =>
  value instanceof Error ? value : new Error(typeof value === 'string' ? value : String(value));

export function installGlobalErrorTrap(): void {
  const utils = (globalThis as { ErrorUtils?: GlobalErrorUtils }).ErrorUtils;
  if (utils === undefined || installed) return;
  installed = true;
  const previous = utils.getGlobalHandler();
  utils.setGlobalHandler((error, isFatal) => {
    crumb(`error: ${isFatal === true ? 'fatal' : 'non-fatal'} — ${asError(error).message}`);
    const report = recordCrash(error, { source: 'global', fatal: isFatal === true });
    if (listener !== null) {
      listener(asError(error), report);
      // a fatal handed back to the default handler closes the app, and the point of this file
      // is that somebody gets to read the sentence first
      if (isFatal === true) return;
    }
    previous(error, isFatal);
  });
  installRejectionTracker();
}

/**
 * A REJECTED PROMISE NOBODY HANDLED, recorded and nothing more: it does not bring the error page up,
 * because the app is still running and most such rejections are a background call that failed. Only
 * in a release build: in development React Native installs this same tracker for its own warnings,
 * and replacing it would silence them.
 */
function installRejectionTracker(): void {
  if (__DEV__) return;
  const hermes = (globalThis as { HermesInternal?: RejectionTracker }).HermesInternal;
  if (typeof hermes?.enablePromiseRejectionTracker !== 'function') return;
  try {
    hermes.enablePromiseRejectionTracker({
      allRejections: true,
      onUnhandled: (_id, error) => {
        recordCrash(error, { source: 'promise', fatal: false });
      },
      onHandled: () => undefined,
    });
  } catch {
    // an engine without it: rejections go unrecorded, as before
  }
}
