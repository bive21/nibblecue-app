/**
 * THE BABY'S PICTURE (the owner, 2026-09-20: *"Also add the feature to add baby's picture saved
 * to everyone in household"*), and every rule about it that does not need a device.
 *
 * The server half has been in place since migration 0001: `children.photo_path`,
 * `children.photo_updated_at`, and a PRIVATE `child-photos` bucket whose four policies read the
 * first path segment as the household (`assets/rls-policies.sql`). So the path is not a naming
 * convention here — it is the authorisation input. `<household_id>/<child_id>.jpg`, and nothing
 * else in the app may compose it by hand.
 *
 * WHY THE GUARD EXISTS AND IS TESTED. `app.is_member(((storage.foldername(name))[1])::uuid)`
 * means a path whose first segment is another household's id is refused by Postgres — which is
 * the right last line, and a terrible first one: the failure a parent would see is an unexplained
 * 403 on their own baby's photo. `childPhotoPath` builds it in one place and
 * `childPhotoBelongsTo` re-checks a path that arrived from a row before the app fetches it, so a
 * stale or mangled value is a missing photo and never a request for someone else's.
 *
 * WHAT IS NOT HERE. No face detection, no growth inference, no derived anything (docs/MEDIA.md
 * §1 "Never sent to analytics, never used for anything derived"). The picture is shown and
 * stored, and that is the whole of the feature.
 *
 * WHY IT IS FREE. `assets/entitlements.ts` says it in the `entryPhotos` rationale — *"Every
 * child keeps one free profile photo on Free"* — and it is the right line: entry photos and the
 * growth gallery carry a per-user storage bill and are sold; ONE picture of the baby is the
 * app's own chrome (docs/BRANDING.md §2b: the chrome belongs to the baby), and charging for the
 * face at the top of every screen would be charging for the baby.
 */
import type { Role } from '../domain/domain-types';

/** The private bucket. Never public, never a public URL — it is a picture of a baby. */
export const CHILD_PHOTO_BUCKET = 'child-photos';

/**
 * 512 px square, JPEG q0.8. The number is from docs/MEDIA.md §3 and it is a size, not a
 * quality target: the largest the app ever draws one is the 44 pt avatar, so 512 covers a 3×
 * screen with room over, and anything larger is bytes a parent pays for in a bucket nobody
 * ever zooms into.
 *
 * THE RE-ENCODE IS THE PRIVACY STEP, not the resize. A photo off a phone carries EXIF — GPS,
 * device serial, the time it was taken — and re-encoding is what drops it. Skipping the
 * re-encode because an image is "already small enough" uploads a baby's home address.
 */
export const CHILD_PHOTO_SIDE = 512;
export const CHILD_PHOTO_QUALITY = 0.8;

/** The bucket's own limit (`file_size_limit`, 5 MB) and its `allowed_mime_types`. */
export const CHILD_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const CHILD_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** What the pipeline always produces, whatever was picked. */
export const CHILD_PHOTO_CONTENT_TYPE = 'image/jpeg';

/** How long a signed URL lives (docs/MEDIA.md §2). Long enough to render, short enough to leak nothing. */
export const CHILD_PHOTO_URL_TTL_SECONDS = 600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The object path inside the bucket: `<household_id>/<child_id>.jpg`.
 *
 * Both ids are checked, and that is not defensive typing. The first segment is cast to `uuid`
 * by the policy; a value that is not one makes Postgres raise rather than refuse, so a bad id
 * here is a 500 instead of a clean "no". Better to find out in the one function that builds it.
 */
export function childPhotoPath(householdId: string, childId: string): string {
  if (!UUID.test(householdId)) throw new TypeError(`not a household id: ${householdId}`);
  if (!UUID.test(childId)) throw new TypeError(`not a child id: ${childId}`);
  return `${householdId.toLowerCase()}/${childId.toLowerCase()}.jpg`;
}

/** The two ids back out of a stored path, or null when it is not one this app wrote. */
export function parseChildPhotoPath(
  path: string | null | undefined,
): { householdId: string; childId: string } | null {
  if (typeof path !== 'string') return null;
  const m = /^([^/]+)\/([^/]+)\.jpg$/i.exec(path.trim());
  if (m === null) return null;
  const [, householdId = '', childId = ''] = m;
  if (!UUID.test(householdId) || !UUID.test(childId)) return null;
  return { householdId: householdId.toLowerCase(), childId: childId.toLowerCase() };
}

/**
 * Whether a path off a row is the one this child's photo may live at.
 *
 * Checked before every fetch. A row can carry a path from another household — a restored
 * backup, a botched merge, a test fixture that outlived its household — and the difference
 * between "we do not fetch it" and "the server refuses it" is whether the parent sees an
 * initial or an error they cannot act on.
 */
export function childPhotoBelongsTo(
  path: string | null | undefined,
  householdId: string,
  childId: string,
): boolean {
  const parsed = parseChildPhotoPath(path);
  return (
    parsed !== null &&
    parsed.householdId === householdId.toLowerCase() &&
    parsed.childId === childId.toLowerCase()
  );
}

/**
 * The local cache's filename for one version of one photo.
 *
 * KEYED ON `photo_updated_at`, which is the whole point of that column. The object path never
 * changes — one photo per child, replaced in place with `upsert` — so a cache keyed on the path
 * would show the OLD picture forever after the other parent changed it. The stamp changes on
 * every write, so a new stamp is a cache miss and the old file is swept.
 */
export function childPhotoCacheName(childId: string, updatedAt: string | null): string {
  return `${childId.toLowerCase()}-${photoStamp(updatedAt)}.jpg`;
}

/**
 * THE STAMP AS AN INSTANT, NOT AS IT WAS PRINTED (2026-09-26, found tracing the owner's *"i
 * selected an avatar on onboarding, but it does not show up now"*). The phone that sets a picture
 * caches it under the stamp it wrote — `2026-09-26T10:58:43.123Z`, JavaScript's own print — and
 * every later read of the row hands back what Postgres prints for the same `timestamptz`:
 * `2026-09-26T10:58:43.123+00:00`. Read as text those are two names, so on a real project the phone
 * that had just uploaded the picture missed its own cache and fetched it straight back — and,
 * offline in that moment, drew the initial where the picture was. Read as the instant both name,
 * they are one file. (The in-app test backend prints the stamp one way only, which is why it never
 * showed there.)
 *
 * A stamp that does not parse keeps the old rule — lower-cased and stripped to letters and digits,
 * because a filename is not the place to find out that a colon or a slash came through.
 */
function photoStamp(updatedAt: string | null): string {
  const ms = updatedAt === null ? Number.NaN : Date.parse(updatedAt);
  if (Number.isFinite(ms)) return `t${ms}`;
  return (updatedAt ?? 'none').toLowerCase().replace(/[^0-9a-z]/g, '');
}

/**
 * WHO MAY SET OR REMOVE IT: OWNER and PARENT, the same pair `child_photo_write` checks
 * server-side (`app.can_admin`). Mirrored here so a caregiver sees the picture and no button —
 * a control that always fails is worse than one that is not there (the argument FamilyScreen
 * already makes about "Add a child").
 *
 * This is a DISPLAY rule and never an authorisation one. The server decides; nothing on the
 * phone is trusted about a role (CLAUDE.md §2 rule 9).
 */
export function canSetChildPhoto(role: Role | null | undefined): boolean {
  return role === 'OWNER' || role === 'PARENT';
}

/** Every member of the household sees it — that is the point of putting it on the server. */
export function canSeeChildPhoto(role: Role | null | undefined): boolean {
  return role === 'OWNER' || role === 'PARENT' || role === 'CAREGIVER' || role === 'VIEW_ONLY';
}
