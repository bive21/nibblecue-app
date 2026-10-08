/**
 * THE UPLOAD QUEUE'S FIVE ENDINGS, and the one rule they all serve: a photo may never cost a
 * parent a log.
 *
 * `entryPhotos.ts` works through why the entry and its picture are on different code paths at
 * all; this is what proves it. Every case below ends with the ENTRY intact — that is the
 * assertion repeated in all of them, and the reason each one is worth a test rather than a
 * comment. A queue that dropped a diaper change because a bucket returned 413 would pass a
 * typecheck, a lint and a review.
 *
 * IT RUNS AGAINST REAL LOCAL SQLITE, like every other data-layer test here, because the drain's
 * behavior IS its effect on two tables: what is left in `photo_queue` and what is in `outbox`.
 * The file operations and the bucket are the two injected seams (`PhotoFiles`, `EntryPhotoApi`),
 * which is what keeps this file in a node runner at all — `media/entryPhoto.ts` imports three
 * expo modules and nothing that touches it can be tested here.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { Db } from '../db/driver';
import { CHILD_A, HOUSEHOLD, USER, seedHousehold } from '../testing/fixtures';
import { logActivity } from './activities';
import {
  dequeueEntryPhoto,
  drainPhotoQueue,
  pendingPhotoCount,
  queueEntryPhoto,
  type EntryPhotoApi,
  type PhotoFiles,
} from './entryPhotos';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

const CTX = { createdBy: USER, deviceId: null, source: 'sheet' as const };
const URI = 'file:///cache/cuddlecue/photos/one.jpg';
const BYTES = new Uint8Array([1, 2, 3, 4]);

async function fixture() {
  const f = await seedHousehold();
  restores.push(f.restoreIds);
  return f;
}

/** A staged-file map: present unless a case deliberately takes it away. */
function files(present = true): PhotoFiles & { forgotten: string[] } {
  const forgotten: string[] = [];
  return {
    forgotten,
    read: async uri => (present && uri === URI ? BYTES : null),
    forget: uri => {
      forgotten.push(uri);
    },
  };
}

/** A bucket that records what it was asked to store, and can be told to refuse. */
function bucket(
  outcome: { ok: true } | { ok: false; status: number } = { ok: true },
): EntryPhotoApi & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    setEntryPhoto: async (householdId, activityId) => {
      calls.push(activityId);
      return outcome.ok
        ? {
            ok: true,
            photo: {
              photo_path: `entry-photos/${householdId}/${activityId}.jpg`,
              photo_updated_at: '2026-09-14T09:00:00.000Z',
            },
          }
        : { ok: false, status: outcome.status };
    },
  };
}

/** Log one diaper change and return its id — the entry every case below has a picture for. */
async function anEntry(db: Db, clock: Parameters<typeof logActivity>[1]): Promise<string> {
  const out = await logActivity(db, clock, {
    householdId: HOUSEHOLD,
    createdBy: USER,
    deviceId: null,
    source: 'sheet',
    childId: CHILD_A,
    // a diaper, because it is the entry a picture is most often attached to and the one whose
    // detail shape is a single field
    type: 'diaper',
    startAt: clock.iso(),
    detail: { kind: 'DIRTY' },
  });
  return out.entityIds[0] ?? '';
}

const liveEntry = (db: Db, id: string) =>
  db.get<{ id: string }>('select id from activities where id = ? and deleted_at is null', [id]);

describe('the entry photo queue', () => {
  it('carries a staged picture over and stamps the entry through the outbox', async () => {
    const { db, clock } = await fixture();
    const id = await anEntry(db, clock);
    await queueEntryPhoto(db, clock, { householdId: HOUSEHOLD, activityId: id, localUri: URI });
    expect(await pendingPhotoCount(db)).toBe(1);

    const api = bucket();
    const fs = files();
    const result = await drainPhotoQueue(db, clock, api, fs, CTX);

    expect(result).toMatchObject({ sent: 1, failed: 0, dropped: 0, remaining: 0 });
    expect(api.calls).toEqual([id]);
    // the row now points at the object…
    const row = await db.get<{ photo_path: string | null }>(
      'select photo_path from activities where id = ?',
      [id],
    );
    expect(row?.photo_path).toBe(`entry-photos/${HOUSEHOLD}/${id}.jpg`);
    // …and it got there as an ORDINARY activity op, not a second write path
    const ops = await db.all<{ entity: string; op: string }>(
      "select entity, op from outbox where entity = 'activity'",
      [],
    );
    expect(ops.some(o => o.op === 'UPDATE')).toBe(true);
    // the staged file is cleaned up behind it
    expect(fs.forgotten).toEqual([URI]);
  });

  /**
   * THE CASE THE CHECK-FIRST EXISTS FOR. An entry undone between the pick and the drain would
   * otherwise have its picture uploaded to a path nothing references — a byte bill for an
   * object no screen can show, and a photo of a baby kept after its row was removed.
   */
  it('uploads nothing for an entry that was deleted first', async () => {
    const { db, clock } = await fixture();
    const id = await anEntry(db, clock);
    await queueEntryPhoto(db, clock, { householdId: HOUSEHOLD, activityId: id, localUri: URI });
    await db.run('update activities set deleted_at = ? where id = ?', [clock.iso(), id]);

    const api = bucket();
    const result = await drainPhotoQueue(db, clock, api, files(), CTX);

    expect(api.calls).toEqual([]);
    expect(result).toMatchObject({ sent: 0, dropped: 1, remaining: 0 });
  });

  it('drops a picture the OS reclaimed, and leaves the entry alone', async () => {
    const { db, clock } = await fixture();
    const id = await anEntry(db, clock);
    await queueEntryPhoto(db, clock, { householdId: HOUSEHOLD, activityId: id, localUri: URI });

    const api = bucket();
    const result = await drainPhotoQueue(db, clock, api, files(false), CTX);

    expect(api.calls).toEqual([]);
    expect(result).toMatchObject({ sent: 0, dropped: 1, remaining: 0 });
    // THE ASSERTION THIS WHOLE FILE IS FOR
    expect(await liveEntry(db, id)).toBeDefined();
  });

  it('keeps a picture the server could not take this time, with a backoff', async () => {
    const { db, clock } = await fixture();
    const id = await anEntry(db, clock);
    await queueEntryPhoto(db, clock, { householdId: HOUSEHOLD, activityId: id, localUri: URI });

    // 0 is "no network" in the outbox's own classification, which this reuses rather than
    // re-argues (`photoWorthRetrying`)
    const result = await drainPhotoQueue(db, clock, bucket({ ok: false, status: 0 }), files(), CTX);

    expect(result).toMatchObject({ sent: 0, failed: 1, dropped: 0, remaining: 1 });
    const row = await db.get<{ state: string; attempts: number; next_attempt_at: string | null }>(
      'select state, attempts, next_attempt_at from photo_queue where activity_id = ?',
      [id],
    );
    expect(row?.state).toBe('PENDING');
    expect(row?.attempts).toBe(1);
    expect(row?.next_attempt_at).not.toBeNull();
    expect(await liveEntry(db, id)).toBeDefined();
  });

  /**
   * A REFUSAL IS FINAL. 403 is a caregiver whose seat expired and 413 is bytes the bucket will
   * not take; both will say the same thing for ever, and retrying them is a battery drain with
   * a bad ending.
   */
  it.each([403, 413, 422])('gives up on a %i and keeps the entry', async status => {
    const { db, clock } = await fixture();
    const id = await anEntry(db, clock);
    await queueEntryPhoto(db, clock, { householdId: HOUSEHOLD, activityId: id, localUri: URI });

    const result = await drainPhotoQueue(db, clock, bucket({ ok: false, status }), files(), CTX);

    expect(result).toMatchObject({ sent: 0, failed: 0, dropped: 1, remaining: 0 });
    expect(await liveEntry(db, id)).toBeDefined();
  });

  it('replaces a queued picture rather than accumulating one per retake', async () => {
    const { db, clock } = await fixture();
    const id = await anEntry(db, clock);
    await queueEntryPhoto(db, clock, { householdId: HOUSEHOLD, activityId: id, localUri: URI });
    await db.run("update photo_queue set attempts = 4, state = 'PENDING' where activity_id = ?", [
      id,
    ]);
    await queueEntryPhoto(db, clock, {
      householdId: HOUSEHOLD,
      activityId: id,
      localUri: `${URI}2`,
    });

    expect(await pendingPhotoCount(db)).toBe(1);
    const row = await db.get<{ local_uri: string; attempts: number }>(
      'select local_uri, attempts from photo_queue where activity_id = ?',
      [id],
    );
    // the new picture, and the old one's backoff is NOT inherited — a retake is a fresh start
    expect(row?.local_uri).toBe(`${URI}2`);
    expect(row?.attempts).toBe(0);
  });

  it('forgets the staged file when a queued picture is removed by hand', async () => {
    const { db, clock } = await fixture();
    const id = await anEntry(db, clock);
    await queueEntryPhoto(db, clock, { householdId: HOUSEHOLD, activityId: id, localUri: URI });

    const fs = files();
    await dequeueEntryPhoto(db, fs, id);

    expect(fs.forgotten).toEqual([URI]);
    expect(await pendingPhotoCount(db)).toBe(0);
    expect(await liveEntry(db, id)).toBeDefined();
  });

  it('waits out a backoff rather than hammering the bucket every tick', async () => {
    const { db, clock } = await fixture();
    const id = await anEntry(db, clock);
    await queueEntryPhoto(db, clock, { householdId: HOUSEHOLD, activityId: id, localUri: URI });
    await db.run('update photo_queue set next_attempt_at = ? where activity_id = ?', [
      new Date(clock.now() + 60_000).toISOString(),
      id,
    ]);

    const api = bucket();
    const result = await drainPhotoQueue(db, clock, api, files(), CTX);

    expect(api.calls).toEqual([]);
    expect(result).toMatchObject({ sent: 0, failed: 0, dropped: 0, remaining: 1 });
  });
});
