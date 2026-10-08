/**
 * expo-sqlite for the boot smoke test, over `node:sqlite` (the same SQLite the node suites use,
 * `../../local-db.ts`). Only the calls `src/db/index.ts` and `src/db/driver.ts` make. Each name is
 * one in-memory database for the life of the test file; `deleteDatabaseAsync` forgets it.
 */
import type { DatabaseSync as Sync } from 'node:sqlite';

// fetched at run time: the smoke test runs in a browser-like environment, which refuses to bundle a
// Node built-in by import
const { DatabaseSync } = process.getBuiltinModule('node:sqlite');
type DatabaseSync = Sync;

type Param = string | number | null;
const files = new Map<string, DatabaseSync>();

function surface(raw: DatabaseSync) {
  return {
    execAsync: (sql: string): Promise<void> => {
      raw.exec(sql);
      return Promise.resolve();
    },
    runAsync: (sql: string, params: Param[] = []) => {
      const r = raw.prepare(sql).run(...params);
      return Promise.resolve({
        changes: Number(r.changes),
        lastInsertRowId: Number(r.lastInsertRowid),
      });
    },
    getAllAsync: <T>(sql: string, params: Param[] = []): Promise<T[]> =>
      Promise.resolve(raw.prepare(sql).all(...params) as T[]),
    getFirstAsync: <T>(sql: string, params: Param[] = []): Promise<T | null> =>
      Promise.resolve((raw.prepare(sql).get(...params) as T | undefined) ?? null),
  };
}

export type SQLiteDatabase = ReturnType<typeof open>;

function open(name: string) {
  let raw = files.get(name);
  if (raw === undefined) {
    raw = new DatabaseSync(':memory:');
    files.set(name, raw);
  }
  const db = raw;
  return {
    ...surface(db),
    withExclusiveTransactionAsync: async (
      fn: (txn: ReturnType<typeof surface>) => Promise<void>,
    ): Promise<void> => {
      db.exec('begin immediate');
      try {
        await fn(surface(db));
        db.exec('commit');
      } catch (err) {
        db.exec('rollback');
        throw err;
      }
    },
    closeAsync: (): Promise<void> => Promise.resolve(),
  };
}

export const openDatabaseAsync = (name: string): Promise<SQLiteDatabase> =>
  Promise.resolve(open(name));

export const deleteDatabaseAsync = (name: string): Promise<void> => {
  files.get(name)?.close();
  files.delete(name);
  return Promise.resolve();
};
