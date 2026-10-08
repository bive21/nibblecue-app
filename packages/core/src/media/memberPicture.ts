/**
 * A PERSON'S OWN PICTURE (the owner, 2026-09-30: *"we want to add the option to upload photo for
 * parent account to, this is for visual purposes as it look better than the letter initial it
 * shows, keep the avatara pregenerated options minimum but universal to all, keep women and men
 * avatar for each race"*), and every rule about it that does not need a device.
 *
 * THREE ANSWERS, ONE AT A TIME. A person's picture is a photo, one of the app's twelve drawings, or
 * the initial it always was — and the server holds which in three columns on `profiles` (migration
 * 0148): `avatar_path` (the photo's object in the private `member-photos` bucket), `avatar_preset`
 * (a drawing's id) and `avatar_updated_at` (when either last changed, the server's clock). A check
 * keeps the first two from both being set, so there is never a question of which one wins.
 *
 * THE PATH IS THE AUTHORISATION INPUT, as the child photo's is. `member_photo_read` reads the first
 * segment of the object name as the PERSON whose picture it is and lets in whoever shares a live
 * household with them; the three writes accept exactly `<the caller's id>/picture.jpg`, so nobody
 * writes anybody else's picture and nobody keeps a second file. `memberPhotoPath` builds it in one
 * place and `memberPhotoBelongsTo` re-checks a path off a row before anything is fetched: a stale or
 * mangled value is an initial, never a request for somebody else's face. The column is held to the
 * same shape by a check on the row itself (`profiles_avatar_path_own`).
 *
 * A DRAWING IS ONLY AN ID. Unlike the babies, whose drawings leave the phone as the same JPEG a
 * photo does (`apps/mobile/src/media/avatars/render.ts` says why), a person's drawing is the id and
 * nothing else: every phone draws it from the same shapes, offline, and nothing is uploaded. An id
 * this build does not know (a newer build's drawing) is the initial. The ids name the picture, never
 * the person: nothing stored says anything about who someone is, only which drawing they chose.
 *
 * WHAT IS NOT HERE. No face detection and nothing derived (docs/MEDIA.md §1): the picture is shown
 * and stored, and that is the whole feature. It is free on every plan: it is the person's own
 * chrome, as the baby's picture is the baby's, and no `GATES` entry sells it.
 */
import { z } from 'zod';
import { childPhotoCacheName } from './childPhoto';

/** The private bucket. Never public and never a public URL: it is a picture of a person. */
export const MEMBER_PHOTO_BUCKET = 'member-photos';

/** The one object a person may keep there, under their own id. */
export const MEMBER_PHOTO_FILE = 'picture.jpg';

/** The bucket's own limit (`file_size_limit`, 5 MB), as the child photo's. */
export const MEMBER_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

/**
 * What the pipeline always produces: the child photo's own 512 px square, JPEG q0.8
 * (`prepareChildPhoto`), whose re-encode is what strips the EXIF a phone photo carries.
 */
export const MEMBER_PHOTO_CONTENT_TYPE = 'image/jpeg';

/** How long a signed URL lives (docs/MEDIA.md §2): long enough to render, short enough to leak nothing. */
export const MEMBER_PHOTO_URL_TTL_SECONDS = 600;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The object path inside the bucket: `<user_id>/picture.jpg`. The id is checked because the read
 * policy casts the first segment to `uuid`, and a value that will not cast makes Postgres raise
 * rather than refuse: a 500 where a clean "no" belonged.
 */
export function memberPhotoPath(userId: string): string {
  if (!UUID.test(userId)) throw new TypeError(`not a person's id: ${userId}`);
  return `${userId.toLowerCase()}/${MEMBER_PHOTO_FILE}`;
}

/** The person back out of a stored path, or null when it is not one this app wrote. */
export function parseMemberPhotoPath(path: string | null | undefined): { userId: string } | null {
  if (typeof path !== 'string') return null;
  const m = /^([^/]+)\/picture\.jpg$/i.exec(path.trim());
  if (m === null) return null;
  const userId = m[1] ?? '';
  return UUID.test(userId) ? { userId: userId.toLowerCase() } : null;
}

/** Whether a path off a row is the one this person's photo may live at. Checked before every fetch. */
export function memberPhotoBelongsTo(path: string | null | undefined, userId: string): boolean {
  const parsed = parseMemberPhotoPath(path);
  return parsed !== null && parsed.userId === userId.toLowerCase();
}

/**
 * The local cache's filename for one version of one person's photo: the child photo's rule, keyed
 * on the STAMP read as an instant (`childPhotoCacheName` says why), in a directory of its own.
 */
export const memberPhotoCacheName = (userId: string, updatedAt: string | null): string =>
  childPhotoCacheName(userId, updatedAt);

/**
 * A DRAWING'S ID: lower-case words joined by single hyphens, at most 40 characters — the shape the
 * server's check holds (`profiles_avatar_preset_shape`). The server keeps no list of drawings, so a
 * set the owner replaces later is a file change on the phone and no migration.
 */
export const MEMBER_AVATAR_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MEMBER_AVATAR_ID_MAX = 40;

export const MemberAvatarIdSchema = z.string().max(MEMBER_AVATAR_ID_MAX).regex(MEMBER_AVATAR_ID);

export const isMemberAvatarId = (value: unknown): value is string =>
  MemberAvatarIdSchema.safeParse(value).success;

/** The three columns, as a row carries them. Absent reads as null: a row from before 0148. */
export interface MemberPictureColumns {
  avatar_path?: string | null;
  avatar_preset?: string | null;
  avatar_updated_at?: string | null;
}

/** What a row says a person's picture is. */
export type MemberPicture =
  | { kind: 'photo'; path: string; updatedAt: string | null }
  | { kind: 'drawing'; id: string }
  | { kind: 'initial' };

/**
 * WHICH OF THE THREE a row names. A drawing is taken before a photo only because the server never
 * lets a row hold both; a photo whose path is not this person's is not a photo at all (it is never
 * fetched), and a drawing id of the wrong shape is not a drawing. Both fall back to the initial.
 */
export function memberPictureOf(userId: string, row: MemberPictureColumns): MemberPicture {
  const preset = row.avatar_preset ?? null;
  if (preset !== null && isMemberAvatarId(preset)) return { kind: 'drawing', id: preset };
  const path = row.avatar_path ?? null;
  if (path !== null && memberPhotoBelongsTo(path, userId))
    return { kind: 'photo', path, updatedAt: row.avatar_updated_at ?? null };
  return { kind: 'initial' };
}

/** A stamp as an instant, where no stamp (never set, or a row from before 0148) is the oldest. */
const stampMs = (at: string | null | undefined): number => {
  const ms = at === null || at === undefined ? Number.NaN : Date.parse(at);
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY;
};

/**
 * TWO READINGS OF ONE PERSON'S PICTURE, AND THE ONE TO BELIEVE: the later stamp. The phone reads a
 * person from more than one place — the account read for the viewer, the household's mirror for
 * everyone, the Family page's live roster — and they arrive at different moments. The stamp moves
 * on every change, a removal included (0148's trigger), so the later one is the later truth; on a
 * tie, or with no stamp on either, the first one given is kept, which is the caller's fresher source.
 */
export function laterPicture<T extends MemberPictureColumns>(a: T, b: T): T {
  return stampMs(b.avatar_updated_at) > stampMs(a.avatar_updated_at) ? b : a;
}
