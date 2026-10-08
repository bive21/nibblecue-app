/**
 * The duplicate guard's storage half: a table, inside the caller's transaction (D25), with the
 * state leak `docs/UX_AUDIT.md` §4.62 found named as a test.
 */
import { DEDUPE_TTL_MS, dedupeKey } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { FakeClock } from '../testing/clock';
import { openTestDb } from '../testing/local-db';
import { CHILD_A, CHILD_B } from '../testing/fixtures';
import { isSuppressed, lastAcceptedAt, pruneDedupeKeys, recordAccepted } from './dedupe';

const WET = dedupeKey('diaper', CHILD_A, 'WET');

describe('the duplicate guard table (D25, UX_AUDIT §4.62)', () => {
  afterEach(() => undefined);

  it('an unseen key is never suppressed', async () => {
    const { db } = await openTestDb();
    const clock = new FakeClock();
    expect(await db.tx(t => isSuppressed(t, { key: WET, windowMs: 3500 }, clock.now()))).toBe(
      false,
    );
  });

  it('suppresses inside the window and accepts on the boundary', async () => {
    const { db } = await openTestDb();
    const clock = new FakeClock();
    await db.tx(t => recordAccepted(t, WET, clock.now()));
    const at = (ms: number) =>
      db.tx(t => isSuppressed(t, { key: WET, windowMs: 3500 }, clock.now() + ms));
    expect(await at(100)).toBe(true);
    expect(await at(3499)).toBe(true);
    // half-open: a tap exactly `windowMs` later is a deliberate repeat, not a bounce
    expect(await at(3500)).toBe(false);
    expect(await at(6000)).toBe(false);
  });

  it('the key carries the child, so the second twin is not the first ones double tap', async () => {
    const { db } = await openTestDb();
    const clock = new FakeClock();
    await db.tx(t => recordAccepted(t, WET, clock.now()));
    const liam = dedupeKey('diaper', CHILD_B, 'WET');
    expect(liam).not.toBe(WET);
    expect(
      await db.tx(t => isSuppressed(t, { key: liam, windowMs: 3500 }, clock.now() + 200)),
    ).toBe(false);
  });

  it('lives in the database, so nothing leaks between two databases', async () => {
    // The prototype's guard was a plain object outside the state snapshot, and one check
    // suppressed another check's write forty checks later. Two databases, one key: the second
    // must not have heard of it.
    const first = await openTestDb();
    const second = await openTestDb();
    const clock = new FakeClock();
    await first.db.tx(t => recordAccepted(t, WET, clock.now()));
    expect(await second.db.tx(t => lastAcceptedAt(t, WET))).toBeNull();
  });

  it('a rolled-back write takes its dedupe key with it', async () => {
    const { db } = await openTestDb();
    const clock = new FakeClock();
    await expect(
      db.tx(async t => {
        await recordAccepted(t, WET, clock.now());
        throw new Error('the row after the key threw');
      }),
    ).rejects.toThrow();
    expect(await db.tx(t => lastAcceptedAt(t, WET))).toBeNull();
  });

  it('prunes only what is past the TTL', async () => {
    const { db } = await openTestDb();
    const clock = new FakeClock();
    await db.tx(t => recordAccepted(t, WET, clock.now()));
    await db.tx(t => recordAccepted(t, 'diaper:household:DIRTY', clock.now() + DEDUPE_TTL_MS));
    const removed = await db.tx(t => pruneDedupeKeys(t, clock.now() + DEDUPE_TTL_MS + 1));
    expect(removed).toBe(1);
    expect(await db.tx(t => lastAcceptedAt(t, WET))).toBeNull();
    expect(await db.tx(t => lastAcceptedAt(t, 'diaper:household:DIRTY'))).not.toBeNull();
  });
});
