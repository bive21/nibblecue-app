/**
 * WHY A TRANSACTION TAKES THE WRITE LOCK BEFORE IT READS (`driver.ts` `CLAIM_WRITE_LOCK`; the
 * owner's Expo Go log, 2026-10-08: "sync: pull failed — NativeStatement.finalizeAsync … database
 * is locked", five seconds of busy timeout notwithstanding).
 *
 * Real SQLite, two connections on one file in WAL mode, as on the phone: `node:sqlite` is the same
 * library expo-sqlite ships. The first block is the fault itself — expo-sqlite's `BEGIN` is
 * DEFERRED, and a transaction that has read before its first write is failed at once by another
 * connection's lock or commit, without the busy timeout being asked. The second is the cure on the
 * app's own migrated schema: the claim takes the lock while nothing has been read, waits for it
 * like any first statement does, and changes nothing.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { nodeRunner } from '../testing/local-db';
import { CLAIM_WRITE_LOCK } from './driver';
import { migrateLocalDb } from './schema';

/** Short, so a wait is measurable and the suite stays fast; the app's is `BUSY_TIMEOUT_MS`. */
const WAIT_MS = 200;

let dir: string;
let pull: DatabaseSync;
let other: DatabaseSync;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'cc-lock-'));
  const file = join(dir, 'cuddlecue.db');
  pull = new DatabaseSync(file);
  pull.exec('pragma journal_mode = wal; pragma foreign_keys = on;');
  await migrateLocalDb(nodeRunner(pull));
  other = new DatabaseSync(file);
  for (const c of [pull, other]) c.exec(`pragma busy_timeout = ${String(WAIT_MS)}`);
});

afterEach(() => {
  for (const c of [pull, other]) {
    try {
      if (c.isTransaction) c.exec('rollback');
    } catch {
      // already ended by the failure under test
    }
    c.close();
  }
  rmSync(dir, { recursive: true, force: true });
});

/** How long `fn` took, and what it threw. */
function timed(fn: () => void): { ms: number; error: string | null } {
  const at = Date.now();
  try {
    fn();
    return { ms: Date.now() - at, error: null };
  } catch (err) {
    return { ms: Date.now() - at, error: err instanceof Error ? err.message : String(err) };
  }
}

const count = (c: DatabaseSync) =>
  (c.prepare('select count(*) as n from sync_state').get() as { n: number }).n;
const write = (c: DatabaseSync, table: string) =>
  c
    .prepare(
      `insert into sync_state (household_id, table_name) values (?, ?)
         on conflict do nothing`,
    )
    .run('h1', table);

describe('the fault: a deferred transaction that reads first', () => {
  it('fails at once on another connection’s write lock, busy timeout or not', () => {
    other.exec('begin immediate');
    write(other, 'children');
    pull.exec('begin');
    count(pull);
    const r = timed(() => write(pull, 'activities'));
    expect(r.error).toMatch(/database is locked/);
    // not a wait that ran out: the timeout was never consulted
    expect(r.ms).toBeLessThan(WAIT_MS / 2);
  });

  it('fails at once when another connection committed after its first read', () => {
    pull.exec('begin');
    count(pull);
    write(other, 'children');
    const r = timed(() => write(pull, 'activities'));
    expect(r.error).toMatch(/database is locked/);
    expect(r.ms).toBeLessThan(WAIT_MS / 2);
  });
});

describe('the cure: the claim, before anything is read', () => {
  it('takes the write lock, so no other connection can write in the middle', () => {
    pull.exec('begin');
    pull.exec(CLAIM_WRITE_LOCK);
    other.exec('pragma busy_timeout = 0');
    expect(timed(() => other.exec('begin immediate')).error).toMatch(/database is locked/);
    // and the transaction reads and writes as it always did
    count(pull);
    write(pull, 'activities');
    pull.exec('commit');
    expect(count(other)).toBe(1);
  });

  it('waits for a lock another connection holds, the way a first statement does', () => {
    other.exec('begin immediate');
    write(other, 'children');
    pull.exec('begin');
    const r = timed(() => pull.exec(CLAIM_WRITE_LOCK));
    // it waited the whole timeout before giving up: on the phone, five seconds for a pass
    // well under one, so the lock is free long before then
    expect(r.error).toMatch(/database is locked/);
    expect(r.ms).toBeGreaterThanOrEqual(WAIT_MS - 20);
    pull.exec('rollback');
    other.exec('commit');
    // once free, the same transaction goes through and sees the other connection's row
    pull.exec('begin');
    pull.exec(CLAIM_WRITE_LOCK);
    expect(count(pull)).toBe(1);
    write(pull, 'activities');
    pull.exec('commit');
    expect(count(other)).toBe(2);
  });

  it('changes nothing', () => {
    pull.exec(
      `insert into outbox (client_op_id, entity, entity_id, op, payload, household_id, state, seq, created_at)
       values ('op1', 'activity', 'e1', 'INSERT', '{}', 'h1', 'PENDING', 1, '2026-10-08T00:00:00Z')`,
    );
    const before = Number(pull.prepare('select total_changes() as n').get()?.n);
    pull.exec(`begin; ${CLAIM_WRITE_LOCK}; commit`);
    expect(Number(pull.prepare('select total_changes() as n').get()?.n)).toBe(before);
    expect((other.prepare('select count(*) as n from outbox').get() as { n: number }).n).toBe(1);
  });
});
