/**
 * A PERSON'S OWN PHOTO, ON THE DEVICE (the owner, 2026-09-30; migration 0148). The child photo's
 * pipeline (`childPhoto.ts`), for a face that is the member's own:
 *
 *   pick or shoot → square centre crop → 512 px → JPEG q0.8 (`prepareChildPhoto`, THE re-encode
 *   that drops the EXIF) → kept on this phone → the private bucket when there is a network
 *   read: the stamp → a cached file → or a signed URL, fetched once and cached
 *
 * The picking and the preparing are the child photo's own functions, unchanged: one crop, one
 * size, one re-encode for every face the app stores. What is here is where the files live.
 *
 * TWO DIRECTORIES, BOTH UNDER `Paths.cache/cuddlecue`, which sign-out sweeps (`clearTmp`, teardown
 * step 11; docs/MEDIA.md §4):
 *
 *   `member-photos`         one file per person, keyed on `avatar_updated_at` as the child photos
 *                           are (`memberPhotoCacheName`): a new stamp is a new picture, and the old
 *                           version is swept as the new one is written
 *   `member-photo-waiting`  the viewer's own photo while it waits for the network, drawn from here
 *                           so the phone that chose it shows it at once. It is only a copy to draw:
 *                           the bytes that will be sent are kept in the account's preferences
 *                           (`picture/waiting.ts`), where the OS cannot reclaim them
 */
import { memberPhotoCacheName } from '@nibblecue/core';
import { Directory, File, Paths } from 'expo-file-system';
import { crumb } from '../app/boot';
import { bytesOfBase64 } from '../lib/base64';

const CACHE_DIR = ['cuddlecue', 'member-photos'] as const;
const WAITING_DIR = ['cuddlecue', 'member-photo-waiting'] as const;

function dirOf(parts: readonly string[]): Directory {
  const dir = new Directory(Paths.cache, ...parts);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** The cached file for one version of one person's photo, or null when it is not there. */
export function cachedMemberPhoto(userId: string, updatedAt: string | null): string | null {
  try {
    const file = new File(dirOf(CACHE_DIR), memberPhotoCacheName(userId, updatedAt));
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/** Every file of one person but `keep`, gone: one person is one file. */
function sweepPerson(dir: Directory, userId: string, keep: string): void {
  const prefix = `${userId.toLowerCase()}-`;
  for (const entry of dir.list()) {
    if (entry.name !== keep && entry.name.startsWith(prefix)) {
      try {
        entry.delete();
      } catch {
        // a file the OS is holding: it goes with the directory at sign-out
      }
    }
  }
}

/** Write a version into the cache and sweep every other version of the same person. */
export function cacheMemberPhoto(
  userId: string,
  updatedAt: string | null,
  bytes: Uint8Array,
): string | null {
  try {
    const dir = dirOf(CACHE_DIR);
    const name = memberPhotoCacheName(userId, updatedAt);
    const file = new File(dir, name);
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
    sweepPerson(dir, userId, name);
    return file.uri;
  } catch (err: unknown) {
    // a cache that cannot be written is a photo fetched again next time, not a broken screen
    crumb(`member photo: cache write failed — ${err instanceof Error ? err.message : ''}`);
    return null;
  }
}

/**
 * Fetch a signed URL's bytes and cache them; the local uri, or null. A photo that cannot be
 * fetched is the initial, never an error: nobody can act on it. A `data:` url is what the in-app
 * test backend hands back, decoded rather than fetched so the fake runs the same cache.
 */
export async function fetchMemberPhoto(
  userId: string,
  updatedAt: string | null,
  signedUrl: string,
): Promise<string | null> {
  try {
    if (signedUrl.startsWith('data:'))
      return cacheMemberPhoto(userId, updatedAt, bytesOfBase64(signedUrl));
    const response = await fetch(signedUrl);
    if (!response.ok) return null;
    return cacheMemberPhoto(userId, updatedAt, new Uint8Array(await response.arrayBuffer()));
  } catch (err: unknown) {
    crumb(`member photo: fetch failed — ${err instanceof Error ? err.message : ''}`);
    return null;
  }
}

/**
 * THE PEOPLE WHO ARE NOT HERE ANY MORE TAKE THEIR PICTURES WITH THEM. Every cached photo of a
 * person not in `live` (the household's live members and the viewer) is deleted: somebody who
 * left, or whose seat ended, is read by nobody on the server (`member_photo_read`, 0148), and a
 * copy on this phone must not outlive that.
 */
export function sweepMemberPhotos(live: ReadonlySet<string>): void {
  try {
    const dir = new Directory(Paths.cache, ...CACHE_DIR);
    if (!dir.exists) return;
    for (const entry of dir.list()) {
      const person = /^([0-9a-f-]{36})-/i.exec(entry.name)?.[1]?.toLowerCase();
      if (person !== undefined && live.has(person)) continue;
      try {
        entry.delete();
      } catch {
        // it goes with the directory at sign-out
      }
    }
  } catch {
    // nothing cached yet
  }
}

/**
 * The viewer's waiting photo as a file to draw, written once per choice (`token` names it, so a
 * new choice is a new uri to whatever draws it). Null when it cannot be written: the phone then
 * draws what the server has until the photo is sent.
 */
export function waitingPhotoFile(userId: string, token: string, bytes: Uint8Array): string | null {
  try {
    const dir = dirOf(WAITING_DIR);
    const name = `${userId.toLowerCase()}-${token}.jpg`;
    const file = new File(dir, name);
    if (!file.exists) {
      file.create();
      file.write(bytes);
    }
    sweepPerson(dir, userId, name);
    return file.uri;
  } catch (err: unknown) {
    crumb(`member photo: waiting copy failed — ${err instanceof Error ? err.message : ''}`);
    return null;
  }
}

/** The waiting copy, gone once the photo is sent or another choice replaces it. */
export function forgetWaitingPhoto(userId: string): void {
  try {
    sweepPerson(dirOf(WAITING_DIR), userId, '');
  } catch {
    // nothing waiting
  }
}
