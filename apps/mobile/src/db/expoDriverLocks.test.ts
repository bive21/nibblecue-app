/**
 * THE DEVICE DRIVER AGAINST TWO CONNECTIONS (`createExpoDb`; the owner's Expo Go log, 2026-09-30:
 * *"NativeStatement.finalizeAsync … database is locked"* right after a pull committed).
 *
 * expo-sqlite runs a transaction on a second connection, and SQLite has one writer across them.
 * These tests stand a fake of that pair up in node, with the moment between a transaction's task
 * returning and its COMMIT held open, and check the two rules `driver.ts` keeps:
 *
 *   * every connection waits for a lock rather than failing (`BUSY_PRAGMA`), the transaction's
 *     own connection before any statement reaches it, and then takes the write lock before it
 *     reads anything (`CLAIM_WRITE_LOCK`; 2026-10-08, `writeLockFirst.test.ts` has the SQLite);
 *   * a write outside any transaction runs when no transaction's connection can hold the lock,
 *     so it never meets one: not in that moment before COMMIT, and not before a transaction's
 *     first write.
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';
import { BUSY_PRAGMA, CLAIM_WRITE_LOCK, createExpoDb, TX_PROLOGUE } from './driver';
import { isClosedHandle } from './latch';

/** A gate the test opens by hand. */
function gate(): { wait: Promise<void>; open: () => void } {
  let open!: () => void;
  const wait = new Promise<void>(resolve => (open = resolve));
  return { wait, open };
}

/**
 * The root connection and the transaction's, writing what each is asked to the one log. The
 * transaction's COMMIT waits for `commit` to open; `taskDone` opens as the task returns.
 */
function fakeExpo() {
  const log: string[] = [];
  const commit = gate();
  const taskDone = gate();
  const conn = (name: string) => ({
    runAsync: async (sql: string) => {
      log.push(`${name} run ${sql}`);
      return { changes: 1, lastInsertRowId: 0 };
    },
    getAllAsync: async (sql: string) => {
      log.push(`${name} all ${sql}`);
      return [];
    },
    getFirstAsync: async (sql: string) => {
      log.push(`${name} get ${sql}`);
      return null;
    },
    execAsync: async (sql: string) => {
      log.push(`${name} exec ${sql}`);
    },
  });
  const root = {
    ...conn('root'),
    withExclusiveTransactionAsync: async (
      task: (txn: ReturnType<typeof conn>) => Promise<void>,
    ) => {
      const txn = conn('txn');
      log.push('txn BEGIN');
      await task(txn);
      taskDone.open();
      await commit.wait;
      log.push('txn COMMIT');
    },
  };
  return { db: createExpoDb(root as unknown as SQLiteDatabase), log, commit, taskDone };
}

describe('the device driver never lets two writers meet', () => {
  it('tells each transaction’s connection to wait for a lock, then take it, before anything reaches it', async () => {
    const { db, log, commit } = fakeExpo();
    commit.open();
    await db.tx(async t => {
      await t.get('select A');
      await t.run('insert A');
    });
    expect(log).toEqual([
      'txn BEGIN',
      `txn exec ${TX_PROLOGUE}`,
      'txn get select A',
      'txn run insert A',
      'txn COMMIT',
    ]);
    // the wait is set before the claim, so it is the claim that waits
    expect(TX_PROLOGUE.indexOf(BUSY_PRAGMA)).toBe(0);
    expect(TX_PROLOGUE.indexOf(CLAIM_WRITE_LOCK)).toBeGreaterThan(BUSY_PRAGMA.length);
  });

  it('holds a write made between a transaction’s end and its COMMIT until the COMMIT', async () => {
    const { db, log, commit, taskDone } = fakeExpo();
    const tx = db.tx(async t => {
      await t.run('insert A');
    });
    await taskDone.wait;
    // the task has returned and the transaction's connection still holds the lock
    const write = db.run('update B');
    // a read in the same moment is not held: under WAL it never meets the writer's lock
    const read = db.all('select C');
    await read;
    expect(log).toContain('root all select C');
    expect(log).not.toContain('root run update B');
    commit.open();
    await Promise.all([tx, write]);
    expect(log.indexOf('root run update B')).toBeGreaterThan(log.indexOf('txn COMMIT'));
  });

  it('runs a write made before a transaction first, and the transaction after it', async () => {
    const { db, log, commit } = fakeExpo();
    commit.open();
    const write = db.run('update B');
    const tx = db.tx(async t => {
      await t.run('insert A');
    });
    await Promise.all([write, tx]);
    expect(log.indexOf('root run update B')).toBeLessThan(log.indexOf('txn BEGIN'));
  });

  it('still sends a statement made while a transaction is open to that transaction', async () => {
    const { db, log, commit } = fakeExpo();
    commit.open();
    let inside!: Promise<unknown>;
    await db.tx(async t => {
      await t.run('insert A');
      // what a screen does while a pull is applying: its write and its read ride along
      inside = Promise.all([db.run('update B'), db.get('select C')]);
      await inside;
    });
    await inside;
    expect(log).toContain('txn run update B');
    expect(log).toContain('txn get select C');
    expect(log.indexOf('txn run update B')).toBeLessThan(log.indexOf('txn COMMIT'));
  });

  it('keeps the queue moving when a queued write fails', async () => {
    const { db, commit } = fakeExpo();
    commit.open();
    const failing = createExpoDb({
      runAsync: async () => {
        throw new Error('database is locked');
      },
    } as unknown as SQLiteDatabase);
    await expect(failing.run('update B')).rejects.toThrow('database is locked');
    // and a separate driver's queue is its own: this one is untouched
    await expect(db.run('update B')).resolves.toEqual({ changes: 1 });
  });
});

describe('a closed driver (a switch to another family, or a teardown)', () => {
  it('lets the transaction in flight finish, and only then closes the connection', async () => {
    const log: string[] = [];
    const commit = gate();
    const started = gate();
    const conn = (name: string) => ({
      runAsync: async (sql: string) => {
        log.push(`${name} run ${sql}`);
        return { changes: 1, lastInsertRowId: 0 };
      },
      execAsync: async (sql: string) => {
        log.push(`${name} exec ${sql}`);
      },
    });
    const db = createExpoDb({
      ...conn('root'),
      withExclusiveTransactionAsync: async (
        task: (txn: ReturnType<typeof conn>) => Promise<void>,
      ) => {
        log.push('txn BEGIN');
        await task(conn('txn'));
        started.open();
        await commit.wait;
        log.push('txn COMMIT');
      },
      closeAsync: async () => {
        log.push('root closed');
      },
    } as unknown as SQLiteDatabase);
    // a pull applying when the family is switched away
    const pull = db.tx(async t => {
      await t.run('insert A');
    });
    await started.wait;
    const closing = db.close();
    // nothing new starts on a closed driver, and what refuses it reads as a closed handle, which
    // every pass nobody awaits ends quietly (`latch.ts` `isTeardownFallout`)
    const late = db.tx(async t => {
      await t.run('insert B');
    });
    await expect(late).rejects.toSatisfy(isClosedHandle);
    await expect(db.run('update C')).rejects.toSatisfy(isClosedHandle);
    expect(log).not.toContain('root closed');
    commit.open();
    await Promise.all([pull, closing]);
    expect(log.indexOf('root closed')).toBeGreaterThan(log.indexOf('txn COMMIT'));
    expect(log).not.toContain('txn run insert B');
    expect(log).not.toContain('root run update C');
  });

  it('lets a screen’s read already running on the root connection finish before closing it', async () => {
    const log: string[] = [];
    const answer = gate();
    const db = createExpoDb({
      getAllAsync: async (sql: string) => {
        log.push(`root all ${sql}`);
        await answer.wait;
        log.push(`root all ${sql} · done`);
        return [];
      },
      closeAsync: async () => {
        log.push('root closed');
      },
    } as unknown as SQLiteDatabase);
    const read = db.all('select A');
    const closing = db.close();
    await Promise.resolve();
    expect(log).not.toContain('root closed');
    answer.open();
    // the read lands, rather than rejecting in a screen that asked for nothing unusual
    await expect(read).resolves.toEqual([]);
    await closing;
    expect(log).toEqual(['root all select A', 'root all select A · done', 'root closed']);
  });
});
