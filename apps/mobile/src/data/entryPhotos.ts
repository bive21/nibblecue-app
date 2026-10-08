/**
 * THE UPLOAD QUEUE FOR ENTRY PHOTOS — the half that touches the network, kept away from the
 * half that must not.
 *
 * THE ONE RULE THIS FILE EXISTS TO KEEP: **a photo may never cost a parent a log.**
 *
 * An entry is written local-first, in one transaction, with no network (CLAUDE.md rule 7). A
 * photo is an upload of a few hundred kilobytes that can take a minute on a hospital wifi and
 * can fail for reasons the phone cannot fix. Put the two in one code path and the rule is gone:
 * either the entry waits on the radio, or a failed upload rolls back a diaper change.
 *
 * So the entry saves first and alone, the prepared bytes go on disk, a row goes in `photo_queue`,
 * and `drainPhotoQueue` carries them over later. Every failure mode below ends with the entry
 * intact:
 *
 *   · no network            → the row waits, backoff, retried on the next drain
 *   · the server refuses    → the row is dropped and the staged file deleted (see below)
 *   · the OS reclaimed the file → the row is dropped, the entry is untouched
 *   · the app is killed mid-upload → the row is still PENDING, retried
 *   · the entry is deleted first   → the row is dropped before the upload is attempted
 *
 * WHY A REFUSAL IS FINAL AND A FAULT IS NOT. `photoWorthRetrying` is the outbox's own rule,
 * reused rather than re-argued: status 0 (no network) and 5xx (the server's problem) are worth
 * another go; a 403 from a caregiver whose seat expired, or a 413 for bytes the bucket will not
 * take, will say the same thing for ever. Retrying those is a battery drain with a bad ending.
 *
 * THE STAMP GOES THROUGH `editActivity`, NOT A SECOND WRITE PATH. Once the object is really in
 * the bucket, the two columns are set by an ordinary activity UPDATE op — same outbox, same
 * idempotency, same conflict resolution, and migration 0102 added exactly those two names to the
 * server's LWW field list. Nothing here writes to `activities` directly.
 */
import { photoWorthRetrying } from '../onboarding/pending-photo';
import type { Clock } from '@nibblecue/core';
import type { Db } from '../db/driver';
import { crumb } from '../app/boot';
import { editActivity } from './activities';
import type { ActivityType } from '@nibblecue/core';
import type { WriteSource } from './repository';

/**
 * THE TWO FILE OPERATIONS THE DRAIN NEEDS, injected rather than imported.
 *
 * `media/entryPhoto.ts` has the real ones, and it imports `expo-file-system`,
 * `expo-image-manipulator` and `expo-image-picker` at module scope — so a single import of it
 * here would put this whole file beyond the node test runner (`apps/mobile/vitest.config.ts`),
 * and the drain is exactly the kind of thing that must be tested properly: five failure modes,
 * a backoff, and one rule it exists to keep (a photo may never cost a parent a log).
 *
 * So they come in the same way `Db`, `Clock` and `Net` already do everywhere in this codebase.
 * `sync/index.ts` passes the real pair; a test passes a map.
 */
export interface PhotoFiles {
  /** The staged bytes, or null when the OS reclaimed the cache. Never throws for a missing file. */
  read(localUri: string): Promise<Uint8Array | null>;
  /** Delete a staged file. Best effort: a file that is already gone is not an error. */
  forget(localUri: string): void;
}

/** What the drain needs from the API, narrowed so a test can hand it two functions. */
export interface EntryPhotoApi {
  setEntryPhoto(
    householdId: string,
    activityId: string,
    jpeg: Uint8Array,
  ): Promise<
    | { ok: true; photo: { photo_path: string; photo_updated_at: string } }
    | { ok: false; status: number; message?: string }
  >;
}

export interface PhotoQueueRow {
  activity_id: string;
  household_id: string;
  local_uri: string;
  state: string;
  attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
}

/** The outbox's backoff, in the same shape: 2s, 8s, 32s, … capped. A photo is never urgent. */
const BACKOFF_MS = [2_000, 8_000, 32_000, 128_000, 512_000] as const;
const backoffFor = (attempts: number): number =>
  BACKOFF_MS[Math.min(attempts, BACKOFF_MS.length - 1)] ?? 512_000;

/** How many a single drain will carry. A parent on a train should still get their entries synced. */
export const PHOTO_DRAIN_BATCH = 3;

/**
 * Queue one prepared photo against an entry that is ALREADY SAVED.
 *
 * Deliberately takes an activity id rather than creating anything: the caller saved the entry
 * first and got its id back, which is the ordering that keeps rule 7 true.
 */
export async function queueEntryPhoto(
  db: Db,
  clock: Clock,
  input: { householdId: string; activityId: string; localUri: string },
): Promise<void> {
  await db.run(
    `insert into photo_queue (activity_id, household_id, local_uri, state, attempts, created_at)
     values (?, ?, ?, 'PENDING', 0, ?)
     on conflict(activity_id) do update set
       local_uri = excluded.local_uri,
       state = 'PENDING',
       attempts = 0,
       next_attempt_at = null,
       last_error = null`,
    [input.activityId, input.householdId, input.localUri, clock.iso()],
  );
}

/** Forget a queued photo — the entry was deleted, or the parent removed the picture. */
export async function dequeueEntryPhoto(
  db: Db,
  files: PhotoFiles,
  activityId: string,
): Promise<void> {
  const row = await db.get<{ local_uri: string }>(
    'select local_uri from photo_queue where activity_id = ?',
    [activityId],
  );
  if (row !== undefined) files.forget(row.local_uri);
  await db.run('delete from photo_queue where activity_id = ?', [activityId]);
}

/** Everything still waiting, for the sync chip and for a test. */
export const pendingPhotoCount = async (db: Db): Promise<number> =>
  (await db.get<{ n: number }>("select count(*) as n from photo_queue where state != 'FAILED'", []))
    ?.n ?? 0;

export interface DrainResult {
  sent: number;
  failed: number;
  dropped: number;
  remaining: number;
}

/**
 * Carry what is ready over the wire, oldest first.
 *
 * Returns counts rather than throwing: a drain is background work and there is no screen to show
 * an error on. Anything a parent needs to know is on the entry itself, which still shows its
 * picture from the staged file while the row is pending.
 */
export async function drainPhotoQueue(
  db: Db,
  clock: Clock,
  api: EntryPhotoApi,
  files: PhotoFiles,
  ctx: { createdBy: string; deviceId: string | null; source: WriteSource },
): Promise<DrainResult> {
  const now = clock.iso();
  const rows = await db.all<PhotoQueueRow>(
    `select * from photo_queue
      where state = 'PENDING' and (next_attempt_at is null or next_attempt_at <= ?)
      order by created_at limit ?`,
    [now, PHOTO_DRAIN_BATCH],
  );

  let sent = 0;
  let failed = 0;
  let dropped = 0;

  for (const row of rows) {
    /*
      THE ENTRY IS CHECKED FIRST, AND IT IS NOT AN OPTIMISATION. An entry deleted (or undone)
      between the pick and the drain would otherwise have its photo uploaded to a path nothing
      references — a byte bill for an object no screen can ever show, and a picture of a baby
      kept after the row it belonged to was removed.
    */
    const entry = await db.get<{ id: string; type: string; child_id: string | null }>(
      'select id, type, child_id from activities where id = ? and deleted_at is null',
      [row.activity_id],
    );
    if (entry === undefined) {
      await dequeueEntryPhoto(db, files, row.activity_id);
      dropped += 1;
      continue;
    }

    const bytes = await files.read(row.local_uri);
    if (bytes === null) {
      // the OS reclaimed the cache. The picture is gone; the ENTRY IS NOT TOUCHED.
      crumb(`entry photo: staged bytes gone for ${row.activity_id}`);
      await dequeueEntryPhoto(db, files, row.activity_id);
      dropped += 1;
      continue;
    }

    await db.run("update photo_queue set state = 'SENDING' where activity_id = ?", [
      row.activity_id,
    ]);
    const result = await api.setEntryPhoto(row.household_id, row.activity_id, bytes);

    if (result.ok) {
      // the object is really there, so the row may now point at it — through the ordinary
      // outbox, exactly as any other correction to an entry would
      await editActivity(db, clock, {
        householdId: row.household_id,
        createdBy: ctx.createdBy,
        deviceId: ctx.deviceId,
        source: ctx.source,
        activityId: row.activity_id,
        childId: entry.child_id,
        type: entry.type as ActivityType,
        patch: {
          photo_path: result.photo.photo_path,
          photo_updated_at: result.photo.photo_updated_at,
        },
      });
      await dequeueEntryPhoto(db, files, row.activity_id);
      sent += 1;
      continue;
    }

    if (!photoWorthRetrying(result.status)) {
      // a refusal the server will repeat: 403 for a lapsed seat, 413 for bytes it will not take
      crumb(`entry photo: refused (${result.status}) for ${row.activity_id}`);
      await dequeueEntryPhoto(db, files, row.activity_id);
      dropped += 1;
      continue;
    }

    const attempts = row.attempts + 1;
    await db.run(
      `update photo_queue
          set state = 'PENDING', attempts = ?, next_attempt_at = ?, last_error = ?
        where activity_id = ?`,
      [
        attempts,
        new Date(clock.now() + backoffFor(attempts)).toISOString(),
        result.message ?? String(result.status),
        row.activity_id,
      ],
    );
    failed += 1;
  }

  return { sent, failed, dropped, remaining: await pendingPhotoCount(db) };
}
