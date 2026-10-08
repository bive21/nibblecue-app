/**
 * The `Db` of `../db/driver.ts`, over `node:sqlite`. **Test-only**: nothing under
 * `apps/mobile/src` outside a `*.test.ts` may import this directory, and `no-bundle.test.ts`
 * fails the build if it does — Metro would otherwise try to resolve `node:sqlite` into a
 * release bundle.
 *
 * It exists so the whole local-first layer — the repository, the outbox worker, the delta
 * pull, the §9 acceptance matrix — runs in CI against the same code the device runs, with no
 * simulator and no hosted project. `node:sqlite` and expo-sqlite are the same SQLite: the same
 * SQL, the same pragmas, the same `user_version` runner.
 *
 * `node:sqlite` is synchronous, so the async surface is satisfied by returning resolved
 * promises. The transaction queue is not decoration: two overlapping `BEGIN IMMEDIATE`s throw
 * SQLITE_BUSY rather than wait, and `createTxQueue` is shared with the device driver so both
 * serialize identically.
 */
import { DatabaseSync } from 'node:sqlite';
import { createTxQueue, type Db, type SqlValue, type Tx } from '../db/driver';
import {
  LOCAL_SCHEMA_VERSION,
  migrateLocalDb,
  type SqlRunner,
  type TableColumn,
} from '../db/schema';

/** node:sqlite returns its own row objects; the cast is the same one expo-sqlite makes. */
const rows = <T>(v: unknown[]): T[] => v as T[];

export function createNodeDb(raw: DatabaseSync): Db {
  const queue = createTxQueue();

  const surface: Tx = {
    run: (sql: string, params: SqlValue[] = []) => {
      const r = raw.prepare(sql).run(...params);
      return Promise.resolve({ changes: Number(r.changes) });
    },
    all: <T>(sql: string, params: SqlValue[] = []) =>
      Promise.resolve(rows<T>(raw.prepare(sql).all(...params))),
    get: <T>(sql: string, params: SqlValue[] = []) =>
      Promise.resolve((raw.prepare(sql).get(...params) as T | undefined) ?? undefined),
  };

  return {
    ...surface,
    // every transaction waits its turn, as on the device (`driver.ts` says why none nests)
    tx: <T>(fn: (t: Tx) => Promise<T>): Promise<T> =>
      queue(async () => {
        raw.exec('begin immediate');
        try {
          const out = await fn(surface);
          raw.exec('commit');
          return out;
        } catch (err) {
          raw.exec('rollback');
          throw err;
        }
      }),
  };
}

/** An in-memory database migrated to the current schema, plus the raw handle for assertions. */
export async function openTestDb(): Promise<{ db: Db; raw: DatabaseSync }> {
  const raw = new DatabaseSync(':memory:');
  raw.exec('pragma foreign_keys = on;');
  await migrateLocalDb(nodeRunner(raw));
  return { db: createNodeDb(raw), raw };
}

/** The migration runner over `node:sqlite` — the same three calls expo-sqlite answers. */
export function nodeRunner(raw: DatabaseSync): SqlRunner {
  return {
    exec: sql => raw.exec(sql),
    userVersion: () =>
      (raw.prepare('pragma user_version').get() as { user_version: number }).user_version,
    setUserVersion: v => raw.exec(`pragma user_version = ${v}`),
    tableInfo: t => raw.prepare(`pragma table_info(${t})`).all() as unknown as TableColumn[],
  };
}

/** The version `openTestDb` migrates to, re-exported so a test need not import two modules. */
export { LOCAL_SCHEMA_VERSION };
