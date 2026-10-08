/**
 * The expo half of `driver.ts`, against a fake `SQLiteDatabase` that behaves like the real one
 * in the way that matters: `withExclusiveTransactionAsync` hands the task a second connection
 * and CLOSES it the moment the task returns, and a statement on a closed connection is an
 * error here where on the phone it is a native crash (the connection's statements are
 * finalized from another thread while one may still be stepping).
 *
 * The contract proved here is the one the node driver cannot: everything routed onto the
 * transaction's connection while it was open — a screen's read — has finished before the
 * transaction commits and the connection goes away; and a transaction another caller starts
 * meanwhile waits for its own turn rather than joining (2026-09-24, `driver.ts`).
 */
import type { SQLiteDatabase } from 'expo-sqlite';
import { describe, expect, it } from 'vitest';
import { createExpoDb } from './driver';

/** A statement's completion can be held back by the test, to keep it "still running". */
type Gate = (sql: string) => Promise<void> | undefined;

function connection(name: string, log: string[], gate: Gate) {
  const conn = {
    closed: false,
    async execAsync(sql: string) {
      conn.check(sql);
      log.push(`${name}: ${sql}`);
    },
    async runAsync(sql: string) {
      conn.check(sql);
      log.push(`${name}: ${sql}`);
      await gate(sql);
      conn.check(sql);
      log.push(`${name}: ${sql} · done`);
      return { changes: 1, lastInsertRowId: 0 };
    },
    async getAllAsync(sql: string) {
      conn.check(sql);
      log.push(`${name}: ${sql}`);
      await gate(sql);
      conn.check(sql);
      log.push(`${name}: ${sql} · done`);
      return [] as never[];
    },
    async getFirstAsync(sql: string) {
      conn.check(sql);
      log.push(`${name}: ${sql}`);
      await gate(sql);
      conn.check(sql);
      log.push(`${name}: ${sql} · done`);
      return null;
    },
    check(sql: string) {
      if (conn.closed) throw new Error(`${name} is closed: ${sql}`);
    },
  };
  return conn;
}

function fakeDatabase(log: string[], gate: Gate = () => undefined) {
  const main = connection('main', log, gate);
  const raw = {
    ...main,
    async withExclusiveTransactionAsync(task: (txn: unknown) => Promise<void>) {
      const txn = connection('txn', log, gate);
      log.push('txn: BEGIN');
      try {
        await task(txn);
        log.push('txn: COMMIT');
      } catch (err) {
        log.push('txn: ROLLBACK');
        throw err;
      } finally {
        txn.closed = true;
        log.push('txn: closed');
      }
    },
  };
  return raw as unknown as SQLiteDatabase;
}

const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => (resolve = r));
  return { promise, resolve };
}

const before = (log: string[], a: string, b: string) => {
  expect(log, a).toContain(a);
  expect(log, b).toContain(b);
  expect(log.indexOf(a), `${a} before ${b}`).toBeLessThan(log.indexOf(b));
};

describe('createExpoDb: the transaction ends only when its connection is idle', () => {
  it("a screen's read issued during a transaction finishes on its connection before the commit", async () => {
    const log: string[] = [];
    const held = deferred();
    const db = createExpoDb(
      fakeDatabase(log, sql => (sql === 'select · screen' ? held.promise : undefined)),
    );
    const body = deferred();

    const tx = db.tx(async t => {
      await t.run('insert · inside');
      await body.promise;
      return 'committed';
    });
    await tick();
    // the read arrives while the transaction is open, so it is routed onto its connection
    const read = db.all('select · screen');
    await tick();
    expect(log).toContain('txn: select · screen');

    // the body is done; the transaction must now wait for the read it is carrying
    body.resolve();
    await tick();
    await tick();
    expect(log).not.toContain('txn: COMMIT');

    held.resolve();
    await expect(read).resolves.toEqual([]);
    await expect(tx).resolves.toBe('committed');
    before(log, 'txn: select · screen · done', 'txn: COMMIT');
    before(log, 'txn: COMMIT', 'txn: closed');
  });

  it('a transaction another caller starts meanwhile waits for the first to close, on a connection of its own', async () => {
    const log: string[] = [];
    const db = createExpoDb(fakeDatabase(log));
    const body = deferred();

    const tx = db.tx(async t => {
      await t.run('insert · inside');
      await body.promise;
    });
    await tick();
    const other = db.tx(async t => {
      await t.run('insert · other');
      return 'other';
    });
    await tick();
    // it did not join the open transaction (it used to, as a savepoint — the sweep of 2026-09-24)
    expect(log.join('\n')).not.toMatch(/savepoint/);
    expect(log).not.toContain('txn: insert · other');

    body.resolve();
    await tx;
    await expect(other).resolves.toBe('other');
    before(log, 'txn: COMMIT', 'txn: insert · other');
    expect(log.filter(l => l === 'txn: BEGIN')).toHaveLength(2);
    // and afterwards statements go to the database itself again
    await db.all('select · after');
    expect(log).toContain('main: select · after');
  });

  it('a transaction that fails never takes with it one that arrived while it was open', async () => {
    const log: string[] = [];
    const db = createExpoDb(fakeDatabase(log));
    const body = deferred();
    const boom = new Error('the apply threw');
    const pull = db.tx(async t => {
      await t.run('insert · pulled');
      await body.promise;
      throw boom;
    });
    await tick();
    const save = db.tx(async t => {
      await t.run('insert · saved');
      return 'saved';
    });
    await tick();
    body.resolve();
    await expect(pull).rejects.toBe(boom);
    await expect(save).resolves.toBe('saved');
    // the rollback came first, and the save committed in a transaction of its own after it
    before(log, 'txn: ROLLBACK', 'txn: insert · saved');
    expect(log.filter(l => l === 'txn: COMMIT')).toHaveLength(1);
  });

  it('a failed transaction still waits for what it carries, then rolls back and rethrows', async () => {
    const log: string[] = [];
    const held = deferred();
    const db = createExpoDb(
      fakeDatabase(log, sql => (sql === 'select · screen' ? held.promise : undefined)),
    );
    const body = deferred();
    const boom = new Error('the apply threw');

    const tx = db.tx(async t => {
      await t.run('insert · inside');
      await body.promise;
      throw boom;
    });
    await tick();
    const read = db.all('select · screen');
    await tick();
    body.resolve();
    await tick();
    await tick();
    expect(log).not.toContain('txn: ROLLBACK');

    held.resolve();
    await expect(read).resolves.toEqual([]);
    await expect(tx).rejects.toBe(boom);
    before(log, 'txn: select · screen · done', 'txn: ROLLBACK');
  });

  it('the queue serializes transactions: the second begins only after the first has closed', async () => {
    const log: string[] = [];
    const db = createExpoDb(fakeDatabase(log));
    const first = db.tx(async t => {
      await t.run('insert · a');
      return 1;
    });
    const second = db.tx(async t => {
      await t.run('insert · b');
      return 2;
    });
    expect(await Promise.all([first, second])).toEqual([1, 2]);
    const closes = log.map((l, i) => [l, i] as const).filter(([l]) => l === 'txn: closed');
    const begins = log.map((l, i) => [l, i] as const).filter(([l]) => l === 'txn: BEGIN');
    expect(closes).toHaveLength(2);
    expect(begins).toHaveLength(2);
    expect(closes[0]?.[1]).toBeLessThan(begins[1]?.[1] ?? -1);
  });
});
