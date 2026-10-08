/**
 * THE LATCH'S REFUSAL, TOLD APART FROM A FAULT (the owner's Expo Go log, 2026-09-29).
 *
 * A teardown — a sign-out, or a household leaving this phone — closes the database latch at its
 * first step, and every open after that is refused with `LocalDbStoppedError` until the next
 * sign-in (docs/ACCOUNTS.md §4; `latch.ts`). A read that handles it says `query failed — …` in the
 * boot log, which is right. An open that nobody awaited said the same thing as a red
 * "Uncaught (in promise)" in development, so an ordinary sign-out looked like a crash.
 *
 * `isTeardownRefusal` and `rethrowUnlessTeardown` are how every such caller tells the two apart.
 * These run the shipped latch, not a copy: the refusal is the one `assertCanOpen` throws, which
 * is the guard `openLocalDb` runs before it touches the file system (`sync/teardown-race.test.ts`
 * holds that it does).
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  allowReopen,
  assertCanOpen,
  isClosedHandle,
  isTeardownFallout,
  isTeardownRefusal,
  LocalDbStoppedError,
  rethrowUnlessTeardown,
  stopLocalDb,
} from './latch';

afterEach(() => {
  allowReopen();
});

/** An opener the way `openLocalDb` opens: the latch first, then the database. */
const open = async (): Promise<'db'> => {
  assertCanOpen();
  return 'db';
};

/** What the latch refuses a caller with, caught the way a `.catch` would receive it. */
function refusal(): unknown {
  stopLocalDb();
  try {
    assertCanOpen();
  } catch (err) {
    return err;
  }
  throw new Error('the latch was closed and did not refuse');
}

describe('isTeardownRefusal', () => {
  it('is the refusal of a closed latch', () => {
    const err = refusal();
    expect(err).toBeInstanceOf(LocalDbStoppedError);
    expect(isTeardownRefusal(err)).toBe(true);
  });

  it('is never a fault of the work itself, nor something that is not an error at all', () => {
    expect(isTeardownRefusal(new Error('database disk image is malformed'))).toBe(false);
    expect(
      isTeardownRefusal(new TypeError("Cannot read properties of undefined (reading 'id')")),
    ).toBe(false);
    expect(isTeardownRefusal('the local database is stopped for teardown')).toBe(false);
    expect(isTeardownRefusal(null)).toBe(false);
    expect(isTeardownRefusal(undefined)).toBe(false);
  });
});

describe('rethrowUnlessTeardown, on a promise nobody awaits', () => {
  it('ends an open the latch refused, quietly: nothing is left rejected for nobody to hear', async () => {
    stopLocalDb();
    // the shape of every fixed call site: `void open().then(read).catch(rethrowUnlessTeardown)`
    const left = open()
      .then(db => `read from ${db}`)
      .catch(rethrowUnlessTeardown);
    await expect(left).resolves.toBeUndefined();
  });

  it('throws any other failure straight on — the same error, as loud as it was without it', async () => {
    const fault = new Error('database disk image is malformed');
    const left = Promise.reject(fault).catch(rethrowUnlessTeardown);
    await expect(left).rejects.toBe(fault);
  });

  it('leaves an open the latch allows alone', async () => {
    allowReopen();
    await expect(open().catch(rethrowUnlessTeardown)).resolves.toBe('db');
  });

  it('works as a catch clause too, where a function opens the database itself', () => {
    const fault = new Error('SQLITE_BUSY');
    expect(() => rethrowUnlessTeardown(refusal())).not.toThrow();
    expect(() => rethrowUnlessTeardown(fault)).toThrow(fault);
  });
});

/**
 * A CALL ON THE HANDLE A TEARDOWN CLOSED (the owner's Expo Go log, 2026-10-01: a phone still signed
 * in to an old account, a forced sign-out at launch, and the first sync flush, which nobody awaits,
 * meeting the database the teardown had just closed). The latch refuses new opens; work already
 * holding the handle meets expo-sqlite's own word for a closed one instead, and it is the same
 * event, one step later.
 */
describe('isClosedHandle and isTeardownFallout', () => {
  /** expo-sqlite's rejection as the owner's phone printed it: a plain Error naming its cause. */
  const closed = new Error(
    "Call to function 'NativeDatabase.prepareAsync' has been rejected.\n→ Caused by: Access to closed resource",
  );

  it('is the native module refusing a call on a closed database, however it is wrapped', () => {
    expect(isClosedHandle(closed)).toBe(true);
    expect(isClosedHandle(new Error('Access to closed resource'))).toBe(true);
    // a wrapper that keeps the native error as its cause
    expect(isClosedHandle(new Error('pull failed', { cause: closed }))).toBe(true);
    expect(isTeardownFallout(closed)).toBe(true);
  });

  it('is the latch’s refusal too, so one test answers for both', () => {
    expect(isTeardownFallout(refusal())).toBe(true);
  });

  it('is never a fault of the work itself', () => {
    for (const err of [
      new Error('database disk image is malformed'),
      new Error('SQLITE_BUSY: database is locked'),
      new TypeError("Cannot read properties of undefined (reading 'id')"),
      null,
      undefined,
    ]) {
      expect(isClosedHandle(err)).toBe(false);
      expect(isTeardownFallout(err)).toBe(false);
    }
  });

  it('ends a promise nobody awaits quietly, whether or not the latch has opened again since', async () => {
    // a teardown's straggler, landing before the next sign-in…
    stopLocalDb();
    await expect(Promise.reject(closed).catch(rethrowUnlessTeardown)).resolves.toBeUndefined();
    // …and after it: nothing but a teardown ever closes the app's handle
    allowReopen();
    await expect(Promise.reject(closed).catch(rethrowUnlessTeardown)).resolves.toBeUndefined();
  });
});
