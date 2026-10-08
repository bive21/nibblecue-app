/**
 * `seq` — the durable counter (WP4 D32). Three claims, each of which a plausible
 * implementation would fail:
 *
 *   * it is monotonic across a RELAUNCH, so an in-memory counter is not enough;
 *   * it is monotonic across a PRUNE, so `max(seq) + 1` is not enough;
 *   * it is allocated inside the caller's transaction, so a rolled-back write leaves the
 *     counter where it started and nothing else has consumed the number.
 */
import { describe, expect, it } from 'vitest';
import { migrateLocalDb } from '../db/schema';
import { createNodeDb, nodeRunner } from '../testing/local-db';
import { currentSeq, nextSeq, OUTBOX_SEQ_KEY } from './seq';
import { DatabaseSync } from 'node:sqlite';

/** One FILE on disk would be closer, but a shared handle re-wrapped is the same test: the
 *  counter lives in the database, not in the module. */
async function reopen(raw: DatabaseSync) {
  await migrateLocalDb(nodeRunner(raw));
  return createNodeDb(raw);
}

describe('the outbox sequence (D32)', () => {
  it('starts at 1 with no row seeded, and counts up', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = await reopen(raw);
    expect(await db.tx(t => currentSeq(t))).toBe(0);
    expect(await db.tx(t => nextSeq(t))).toBe(1);
    expect(await db.tx(t => nextSeq(t))).toBe(2);
    expect(await db.tx(t => nextSeq(t))).toBe(3);
    expect(await db.tx(t => currentSeq(t))).toBe(3);
  });

  it('survives a relaunch: a fresh driver over the same file carries on', async () => {
    const raw = new DatabaseSync(':memory:');
    const first = await reopen(raw);
    await first.tx(t => nextSeq(t));
    await first.tx(t => nextSeq(t));

    const second = await reopen(raw); // a new process, the same database
    expect(await second.tx(t => nextSeq(t))).toBe(3);
  });

  it('survives a prune: emptying the outbox does not move the counter back', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = await reopen(raw);
    for (let i = 0; i < 5; i += 1) await db.tx(t => nextSeq(t));
    // D30 prunes SYNCED rows after seven days; `max(seq) + 1` would restart at 1 here and the
    // next op would sort ahead of everything still queued.
    await db.run('delete from outbox');
    expect(await db.tx(t => nextSeq(t))).toBe(6);
  });

  it('is allocated in the caller transaction: a rollback gives the number back', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = await reopen(raw);
    await db.tx(t => nextSeq(t));
    await expect(
      db.tx(async t => {
        await nextSeq(t);
        throw new Error('the write after the allocation threw');
      }),
    ).rejects.toThrow('the write after the allocation threw');
    expect(await db.tx(t => nextSeq(t))).toBe(2);
  });

  it('treats a corrupted pref as absent rather than writing NaN into seq', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = await reopen(raw);
    await db.run('insert into ui_prefs (key, value) values (?, ?)', [
      OUTBOX_SEQ_KEY,
      'not a number',
    ]);
    expect(await db.tx(t => nextSeq(t))).toBe(1);
  });

  it('two transactions launched together never take the same number', async () => {
    const raw = new DatabaseSync(':memory:');
    const db = await reopen(raw);
    const got = await Promise.all(Array.from({ length: 10 }, () => db.tx(t => nextSeq(t))));
    expect([...got].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
