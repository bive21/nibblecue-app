/**
 * A PHOTO ON A LOG ENTRY — the grammar, the sizes and the gate (migration 0102).
 *
 * The rash a parent wants the pediatrician to see. The bottle brand that agreed with the baby.
 * What the solid actually looked like coming back out. `entryPhotos` in the plan matrix: "Photos
 * on entries, and the growth gallery", and the matrix calls it "the only feature with a per-user
 * storage bill attached, so it is the one place a cap is about cost rather than persuasion".
 *
 * THIS FILE IS THE SHARED HALF: paths, sizes, the cache key and how many a plan may keep. The
 * device pipeline (pick, crop, re-encode, queue, upload) is `apps/mobile/src/media/entryPhoto.ts`
 * and the queue is `apps/mobile/src/media/photoQueue.ts`. Nothing here touches a file or a
 * network, so the rules can be tested in node and reused by the admin console.
 *
 * HOW IT DIFFERS FROM THE CHILD PHOTO, in the two ways that matter:
 *
 *   1. **It is written by an UPDATE, never on the entry's creation.** An entry is local-first
 *      and must land with no network (CLAUDE.md rule 7); an upload cannot. So the entry saves
 *      first, the prepared bytes wait in a queue on the device, and the two columns are stamped
 *      by an ordinary `activity` UPDATE op once the object is really there. A phone that never
 *      finds signal keeps both. A phone reinstalled before it drains loses the picture and keeps
 *      the entry, which is the right way round — rule 7 is about the log, not the illustration.
 *
 *   2. **`can_write`, not `can_admin`.** The child's profile photo is admin-guarded because it
 *      is the household's picture of the baby. An entry photo belongs to the entry, so whoever
 *      may write the entry may illustrate it.
 */

/** The private bucket. Never public and never a public URL — a photo of a baby's skin. */
export const ENTRY_PHOTO_BUCKET = 'entry-photos';

/**
 * 1024 px on the long edge, JPEG q0.85 — FOUR TIMES the child photo's pixels, and the reason is
 * what the picture is for. A profile photo is drawn at 44 pt and never zoomed; an entry photo is
 * opened full-screen and pinched into, because the whole point is a detail somebody wants to
 * look at closely, sometimes a detail they will show a doctor. 512 px is a thumbnail of a rash.
 *
 * It is NOT square. A child photo is cropped to a circle so a square is free; a rash on a thigh
 * is whatever shape the phone was held in, and cropping it to a square throws away the half the
 * parent was pointing at.
 *
 * THE RE-ENCODE IS STILL THE PRIVACY STEP, not the resize — EXIF on a photo of a baby carries
 * where the baby lives. Every path out of the device pipeline goes through it.
 */
export const ENTRY_PHOTO_LONG_EDGE = 1024;
export const ENTRY_PHOTO_QUALITY = 0.85;

/** The bucket's own limit (`file_size_limit`, 5 MB) and what the pipeline always produces. */
export const ENTRY_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const ENTRY_PHOTO_CONTENT_TYPE = 'image/jpeg';

/** How long a signed URL lives. Long enough to render, short enough to leak nothing. */
export const ENTRY_PHOTO_URL_TTL_SECONDS = 600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The object path inside the bucket: `<household_id>/<activity_id>.jpg`.
 *
 * Both ids are checked for the same reason `childPhotoPath` checks its own: the first segment is
 * cast to `uuid` by the policy, so a value that is not one makes Postgres RAISE rather than
 * refuse — a 500 where a clean "no" belonged. Better to fail in the one function that builds it.
 */
export function entryPhotoPath(householdId: string, activityId: string): string {
  if (!UUID.test(householdId)) throw new TypeError(`not a household id: ${householdId}`);
  if (!UUID.test(activityId)) throw new TypeError(`not an activity id: ${activityId}`);
  return `${householdId.toLowerCase()}/${activityId.toLowerCase()}.jpg`;
}

/** The two ids back out of a stored path, or null when it is not one this app wrote. */
export function parseEntryPhotoPath(
  path: string | null | undefined,
): { householdId: string; activityId: string } | null {
  if (typeof path !== 'string') return null;
  const m = /^([^/]+)\/([^/]+)\.jpg$/i.exec(path.trim());
  if (m === null) return null;
  const [, householdId = '', activityId = ''] = m;
  if (!UUID.test(householdId) || !UUID.test(activityId)) return null;
  return { householdId: householdId.toLowerCase(), activityId: activityId.toLowerCase() };
}

/**
 * Whether a path off a row is the one this entry's photo may live at.
 *
 * Checked before every fetch. A row can carry a path from another household — a restored backup,
 * a botched merge, a fixture that outlived its household — and the difference between "we do not
 * fetch it" and "the server refuses it" is whether the parent sees a placeholder or an error
 * they cannot act on.
 */
export function entryPhotoBelongsTo(
  path: string | null | undefined,
  householdId: string,
  activityId: string,
): boolean {
  const parsed = parseEntryPhotoPath(path);
  return (
    parsed !== null &&
    parsed.householdId === householdId.toLowerCase() &&
    parsed.activityId === activityId.toLowerCase()
  );
}

/**
 * The local cache's filename for one version of one entry's photo.
 *
 * KEYED ON `photo_updated_at`, which is what that column is for. The object path never changes —
 * one photo per entry, replaced in place — so a cache keyed on the path would show the OLD
 * picture forever after the other parent replaced it. A new stamp is a miss, and the old file is
 * swept.
 */
export function entryPhotoCacheName(activityId: string, updatedAt: string | null): string {
  // lower-cased and stripped to letters and digits: the stamp is an ISO string on one device and
  // whatever a server column printed on another, and a filename is not the place to discover
  // that a colon or a slash came through
  const stamp = (updatedAt ?? 'none').toLowerCase().replace(/[^0-9a-z]/g, '');
  return `${activityId.toLowerCase()}-${stamp}.jpg`;
}
