/**
 * The teardown latch (docs/ACCOUNTS.md §4 step 8, WP4.9).
 *
 * `openLocalDb` memoizes a module-global handle, so anything that opens the database *after*
 * teardown has deleted the file silently recreates it — a flush or a pull racing a sign-out is
 * exactly that code — and §4's acceptance rule ("the app container contains no file matching
 * the DB name") quietly becomes false. Once `stopLocalDb()` is called nothing reopens until
 * `allowReopen()` on the next sign-in.
 *
 * WHY THIS IS ITS OWN FILE. `./index.ts` imports `expo-sqlite` and `expo-file-system`, neither
 * of which node can resolve, so a test that asserted the latch through it could not run in the
 * suite that covers the rest of sync (`apps/mobile/vitest.config.ts`: node, `src/**\/*.test.ts`).
 * The latch is the half of step 8 with the interesting behavior and no native dependency at all,
 * so it lives here and `sync/teardown-race.test.ts` exercises the shipped code rather than a
 * copy of it. `./index.ts` re-exports every name, so callers are unchanged.
 */

/** Thrown to the caller that tried to open the database during or after a teardown. */
export class LocalDbStoppedError extends Error {
  constructor() {
    super('the local database is stopped for teardown');
    this.name = 'LocalDbStoppedError';
  }
}

let stopped = false;

/**
 * Refuse every further open until `allowReopen()`. Called before teardown step 1 freezes the
 * UI, so nothing in flight can recreate the file step 8 deletes.
 *
 * It does NOT stop the outbox worker: step 2 is the last-chance flush, and it runs against the
 * handle that is already open. Closing that handle is step 8's job, in its own order.
 */
export function stopLocalDb(): void {
  stopped = true;
}

/** Sign-in again: the next `openLocalDb` may create a fresh file. */
export function allowReopen(): void {
  stopped = false;
}

/** Whether the latch is closed — asserted by the teardown race test. */
export function localDbStopped(): boolean {
  return stopped;
}

/** The guard `openLocalDb` runs before it touches the file system. */
export function assertCanOpen(): void {
  if (stopped) throw new LocalDbStoppedError();
}

/**
 * WHETHER A FAILURE IS THE LATCH REFUSING AN OPEN — a teardown is under way or has just run: a
 * sign-out, or a household leaving this phone (docs/ACCOUNTS.md §4). It is not a fault. The
 * account whose rows the caller wanted is going away, the file it would have read is being
 * deleted, and there is nothing left for the caller to do.
 *
 * THE OWNER'S EXPO GO LOG OF 2026-09-29 is why this exists. The handled reads said
 * `query failed — …: the local database is stopped for teardown`, which is right; a caller that
 * started an open and never handled it said the same thing as a red
 * `Uncaught (in promise, id: 0): "LocalDbStoppedError: …"`, so an ordinary teardown looked like a
 * crash. Every place that starts a database open nobody awaits asks this, and only this, rather
 * than comparing error names of its own.
 */
export function isTeardownRefusal(err: unknown): err is LocalDbStoppedError {
  return err instanceof LocalDbStoppedError;
}

/** expo-sqlite's word, on Android and iOS alike, for a call on a database that has been closed. */
const CLOSED_HANDLE = /access to closed resource/i;

/**
 * WHETHER A FAILURE IS A CALL THAT REACHED THE DATABASE AFTER A TEARDOWN CLOSED IT (the owner's
 * Expo Go log, 2026-10-01, signing up a new account on a phone still signed in to an old one:
 * `Uncaught (in promise, id: 0): "Error: Call to function 'NativeDatabase.prepareAsync' has been
 * rejected. → Caused by: Access to closed resource"`).
 *
 * The latch refuses a new OPEN; it cannot stop work that already holds the open handle. A sync
 * flush or pull that started before the teardown, the launch's own pass among them, carries on
 * through steps 1 to 7 and meets the handle step 8 closed (`closeAndDeleteLocalDb`). That is the
 * same event as the latch's refusal, met one step later, and nothing is lost by it: the queue was
 * flushed and what was left quarantined before the file went (docs/ACCOUNTS.md §4).
 *
 * Read off the message, and the message of what caused it, because that is all the native module
 * gives: the error is a plain `Error` whose text names its cause. It is not gated on the latch
 * being closed. Only a teardown or a switch to another family closes the app's handle (the one
 * other close in `db/index.ts` is of a file no caller has been handed yet), and a `Db` retired by
 * either refuses new work in the same words (`driver.ts` `ExpoDb.close`), so a call on a closed
 * handle is a straggler of the family that went, even when it lands after the next sign-in has
 * opened the latch again.
 */
export function isClosedHandle(err: unknown): boolean {
  let e: unknown = err;
  for (let depth = 0; depth < 3 && e !== null && e !== undefined; depth++) {
    const message = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
    if (CLOSED_HANDLE.test(message)) return true;
    e = e instanceof Error ? (e as Error & { cause?: unknown }).cause : undefined;
  }
  return false;
}

/**
 * EVERYTHING A TEARDOWN DOES TO WORK IN FLIGHT: the latch's refusal of an open
 * (`isTeardownRefusal`), and a call on the handle the teardown closed (`isClosedHandle`).
 */
export function isTeardownFallout(err: unknown): boolean {
  return isTeardownRefusal(err) || isClosedHandle(err);
}

/**
 * THE `.catch` FOR A PROMISE NOBODY AWAITS (`void work().catch(rethrowUnlessTeardown)`): what a
 * teardown does to it ends it quietly (`isTeardownFallout`), and anything else is thrown straight
 * on, so a real fault in that work is exactly as loud as it was before the catch was added, never
 * swallowed with the teardown's refusal.
 */
export function rethrowUnlessTeardown(err: unknown): void {
  if (!isTeardownFallout(err)) throw err;
}
