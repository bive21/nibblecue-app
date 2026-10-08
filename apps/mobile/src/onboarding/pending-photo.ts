/**
 * The baby's picture from step 1, held on disk until there is a child to give it to.
 *
 * It is not part of the bootstrap payload: the photo goes through `setChildPhoto`, which needs
 * the child's id, and the child does not exist until `bootstrap_household` returns. It is not in
 * the setup seed either, and deliberately so: the seed's writes are local-first and idempotent
 * and its record clears once they land, while a photo is an UPLOAD that needs the network —
 * kept apart, a phone that finished setup in airplane mode seeds its rhythms at once and sends
 * the picture when it can, rather than re-running the seed every time the upload fails.
 *
 * Keyed by USER like the draft it comes from, so signing out clears it (`prefs/index.ts`); the
 * file it points at is under the cache directory teardown sweeps (`media/childPhoto.ts`).
 */
import { z } from 'zod';
import type { KeyValueStore } from '../prefs';

const Pending = z.object({ uri: z.string().min(1) });
export type PendingChildPhoto = z.infer<typeof Pending>;

export const pendingChildPhotoKey = (userId: string): string => `pending_child_photo:${userId}`;

/**
 * THE PARKED FILE'S NAME, NEW FOR EVERY PICK (2026-09-26, found tracing the owner's *"i selected an
 * avatar on onboarding, but it does not show up now"*). It was `<user>.jpg` every time, so a second
 * pick — a drawn baby after a photo, or a different baby — was written into the file the first one
 * was in, under the same uri. The bytes changed and nothing that draws the plate could tell: the
 * image a phone has already decoded is kept by its uri, so step 1 went on showing the FIRST picture
 * (and `PicturePop`, which pops a picture it has not seen, saw the same one and did not pop), while
 * Finish sent the last. A name of its own per pick is a new uri per picture; the one it replaces is
 * deleted by the step as it always was (`forgetSetupPhoto`), and the directory goes at sign-out.
 */
export const setupPhotoFileName = (userId: string, atMs: number): string =>
  `${userId}-${Math.max(0, Math.floor(atMs)).toString(36)}.jpg`;

export async function savePendingChildPhoto(
  store: KeyValueStore,
  userId: string,
  uri: string,
): Promise<void> {
  await store.set(pendingChildPhotoKey(userId), JSON.stringify({ uri }));
}

export async function loadPendingChildPhoto(
  store: KeyValueStore,
  userId: string,
): Promise<PendingChildPhoto | null> {
  const raw = await store.get(pendingChildPhotoKey(userId));
  if (!raw) return null;
  try {
    const parsed = Pending.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const clearPendingChildPhoto = (store: KeyValueStore, userId: string): Promise<void> =>
  store.remove(pendingChildPhotoKey(userId));

/** A refusal the server will repeat is final; no network, or a server fault, is worth a retry. */
export const photoWorthRetrying = (status: number): boolean => status === 0 || status >= 500;
