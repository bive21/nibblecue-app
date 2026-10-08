/**
 * The `Db` contract, proved against `node:sqlite` — the implementation every other WP4 test
 * runs on, so a bug here would be invisible everywhere else. The expo-sqlite half of
 * `driver.ts` is the same code shape over `withExclusiveTransactionAsync`; what cannot be
 * asserted in node is that expo's exclusive transaction is exclusive, which is its contract,
 * not ours.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createTxQueue, type SqlValue } from './driver';
import { openTestDb } from '../testing/local-db';

const here = dirname(fileURLToPath(import.meta.url));

const seed = async () => {
  const { db, raw } = await openTestDb();
  raw.exec('create table t (k text primary key, v text, n integer, r real)');
  return { db, raw };
};
const keys = (raw: { prepare: (s: string) => { all: () => unknown[] } }) =>
  (raw.prepare('select k from t order by k').all() as { k: string }[]).map(r => r.k);

describe('the Db driver (WP4 D9, D14)', () => {
  it('commits everything a transaction wrote', async () => {
    const { db, raw } = await seed();
    const out = await db.tx(async t => {
      await t.run('insert into t (k, v) values (?, ?)', ['a', '1']);
      await t.run('insert into t (k, v) values (?, ?)', ['b', '2']);
      return 'done';
    });
    expect(out).toBe('done');
    expect(keys(raw)).toEqual(['a', 'b']);
  });

  it('rolls the whole transaction back and rethrows — a half-written log is the failure', async () => {
    const { db, raw } = await seed();
    await db.run('insert into t (k, v) values (?, ?)', ['kept', 'before']);
    const boom = new Error('the write after the first one threw');
    await expect(
      db.tx(async t => {
        await t.run('insert into t (k, v) values (?, ?)', ['a', '1']);
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(keys(raw)).toEqual(['kept']);
    // and the connection is usable again, not stuck inside an open transaction
    await db.run('insert into t (k, v) values (?, ?)', ['after', 'x']);
    expect(keys(raw)).toEqual(['after', 'kept']);
  });

  /**
   * A TRANSACTION THAT ARRIVES WHILE ANOTHER IS OPEN WAITS FOR IT, AND OWES IT NOTHING (the sync
   * sweep of 2026-09-24). It used to join the open one as a savepoint — so a parent's Save that
   * landed while a pull was applying was rolled back with the pull when the pull threw.
   */
  it('a transaction started while another is open waits, and the first one’s failure never takes its rows', async () => {
    const { db, raw } = await seed();
    let release!: () => void;
    const gate = new Promise<void>(r => (release = r));
    const pull = db.tx(async t => {
      await t.run('insert into t (k, v) values (?, ?)', ['pulled', '1']);
      await gate;
      throw new Error('the apply threw');
    });
    await new Promise(r => setTimeout(r, 1));
    // the parent's Save, while the "pull" is mid-flight
    const save = db.tx(t => t.run('insert into t (k, v) values (?, ?)', ['saved', '2']));
    await new Promise(r => setTimeout(r, 1));
    // it has not joined the open transaction: nothing of it is there yet
    expect(keys(raw)).toEqual(['pulled']);
    release();
    await expect(pull).rejects.toThrow('the apply threw');
    await save;
    expect(keys(raw)).toEqual(['saved']);
  });

  /**
   * AND THEREFORE NOTHING MAY OPEN A TRANSACTION FROM INSIDE ONE through the root handle: it would
   * wait for itself. Code inside passes its `Tx` down, and the `Tx` type cannot open one. This
   * holds every call site to it: no `tx` callback in the app or in core reaches for `db`.
   */
  it('no transaction callback anywhere reaches for the root handle', () => {
    const roots = [join(here, '..'), join(here, '..', '..', '..', '..', 'packages', 'core', 'src')];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== 'testing' && name !== 'node_modules') walk(path);
          continue;
        }
        if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) continue;
        const text = readFileSync(path, 'utf8');
        for (const m of text.matchAll(/\.tx\(\s*(?:async\s*)?\(?\s*(\w+)\s*\)?\s*=>/g)) {
          // the callback's body: from the arrow to the brace or paren that closes it
          const start = (m.index ?? 0) + m[0].length;
          let depth = 0;
          let end = start;
          for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (ch === '{' || ch === '(') depth += 1;
            else if (ch === '}' || ch === ')') {
              if (depth === 0) {
                end = i;
                break;
              }
              depth -= 1;
            }
          }
          const body = text.slice(start, end);
          if (/(^|[^.\w])(this\.)?db\b/.test(body)) offenders.push(`${path}:${m[0]}`);
        }
      }
    };
    for (const root of roots) walk(root);
    expect(offenders).toEqual([]);
  });

  it('two concurrent transactions do not interleave', async () => {
    const { db, raw } = await seed();
    const order: string[] = [];
    const write = (tag: string) =>
      db.tx(async t => {
        order.push(`${tag}:begin`);
        await t.run('insert into t (k, v) values (?, ?)', [`${tag}1`, tag]);
        // yield the microtask queue in the middle of the transaction: without the queue the
        // other transaction would start here and SQLite would refuse its BEGIN IMMEDIATE
        await Promise.resolve();
        await new Promise(r => setTimeout(r, 1));
        await t.run('insert into t (k, v) values (?, ?)', [`${tag}2`, tag]);
        order.push(`${tag}:end`);
      });
    await Promise.all([write('a'), write('b')]);
    expect(order).toEqual(['a:begin', 'a:end', 'b:begin', 'b:end']);
    expect(keys(raw)).toEqual(['a1', 'a2', 'b1', 'b2']);
  });

  it('a failed transaction does not poison the queue behind it', async () => {
    const { db, raw } = await seed();
    const first = db.tx(async () => {
      throw new Error('first');
    });
    const second = db.tx(t => t.run('insert into t (k, v) values (?, ?)', ['ok', '1']));
    await expect(first).rejects.toThrow('first');
    await second;
    expect(keys(raw)).toEqual(['ok']);
  });

  it('binds every SqlValue positionally, and reads it back unchanged', async () => {
    const { db } = await seed();
    const params: SqlValue[] = ['k1', 'text', 42, 1.5];
    await db.run('insert into t (k, v, n, r) values (?, ?, ?, ?)', params);
    await db.run('insert into t (k, v, n, r) values (?, ?, ?, ?)', ['k2', null, null, null]);
    expect(await db.get('select * from t where k = ?', ['k1'])).toEqual({
      k: 'k1',
      v: 'text',
      n: 42,
      r: 1.5,
    });
    expect(await db.get('select * from t where k = ?', ['k2'])).toEqual({
      k: 'k2',
      v: null,
      n: null,
      r: null,
    });
    // the parameter is data, never SQL: a value that looks like a statement stays a value
    await db.run('insert into t (k, v) values (?, ?)', ["'; drop table t; --", 'still here']);
    expect(await db.all('select k from t')).toHaveLength(3);
  });

  it('get returns undefined, not null, when nothing matches, and run counts changes', async () => {
    const { db } = await seed();
    expect(await db.get('select * from t where k = ?', ['missing'])).toBeUndefined();
    expect(await db.all('select * from t')).toEqual([]);
    await db.run("insert into t (k, v) values ('a','1'), ('b','2')");
    expect(await db.run("update t set v = 'x'")).toEqual({ changes: 2 });
    expect(await db.run("delete from t where k = 'nope'")).toEqual({ changes: 0 });
  });

  it('the transaction queue runs tasks in order and survives a rejection', async () => {
    const queue = createTxQueue();
    const seen: number[] = [];
    const slow = queue(async () => {
      await new Promise(r => setTimeout(r, 5));
      seen.push(1);
    });
    const failing = queue(async () => {
      seen.push(2);
      throw new Error('nope');
    });
    const last = queue(async () => {
      seen.push(3);
    });
    await slow;
    await expect(failing).rejects.toThrow('nope');
    await last;
    expect(seen).toEqual([1, 2, 3]);
  });
});
