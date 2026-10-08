/**
 * THE PICTURE ON AN ENTRY, ON THE DEVICE. `packages/core/src/media/entryPhoto.ts` is the shared
 * grammar; this is the pipeline.
 *
 *   pick or shoot → long edge 1024 → JPEG q0.85 → bytes → a file in the queue directory
 *                → `photo_queue` row → the drain uploads it → `activities.photo_path` is stamped
 *   read: the stamp → a cached file → or a signed URL, fetched once and cached
 *
 * IT IS THE CHILD-PHOTO PIPELINE WITH TWO DELIBERATE DIFFERENCES, and both come from what the
 * picture is for:
 *
 *   1. **No square crop.** A profile photo is drawn in a circle, so a square costs nothing. An
 *      entry photo is a rash on a thigh or what came back up, held however the phone was held,
 *      and a centre crop throws away the half the parent was pointing at. The long edge is
 *      bounded; the aspect is theirs.
 *
 *   2. **It does not upload here.** `prepareEntryPhoto` returns bytes and `stageEntryPhoto`
 *      writes them to disk; the network is `data/entryPhotos.ts`'s problem, on its own schedule.
 *      An entry must save with no network (CLAUDE.md rule 7) and a picture cannot, so the two
 *      are not allowed to share a code path that could make the first wait for the second.
 *
 * THE RE-ENCODE IS STILL THE PRIVACY STEP, not the resize. A photo off a phone carries EXIF —
 * GPS, device, the second it was taken — and re-encoding is what drops it. "It is already small,
 * skip the manipulator" uploads a baby's home address. Everything that leaves this file has been
 * through it.
 *
 * WHY THE CACHE AND THE QUEUE BOTH LIVE UNDER `Paths.cache/cuddlecue`. The OS may reclaim it,
 * which is survivable for both — a cached photo is re-fetchable, and a queued one that vanishes
 * drops its row and LEAVES THE ENTRY ALONE. And `clearTmp` (teardown step 11) already deletes
 * that directory, so signing out takes the pictures with it.
 */
import { ENTRY_PHOTO_LONG_EDGE, ENTRY_PHOTO_QUALITY, entryPhotoCacheName } from '@nibblecue/core';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { crumb } from '../app/boot';
import { bytesOfBase64 } from '../lib/base64';
import { photoAccess, type PhotoSource, type PickOutcome } from './childPhoto';

export type { PhotoSource, PickOutcome } from './childPhoto';

const CACHE_DIR = ['cuddlecue', 'entry-photos'] as const;
/** Staged bytes waiting for a network. Separate from the cache so a sweep cannot eat a pending upload. */
const QUEUE_DIR = ['cuddlecue', 'entry-photos-outgoing'] as const;

function dirAt(parts: readonly string[]): Directory {
  const dir = new Directory(Paths.cache, ...parts);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * Ask, then open. The permission is requested at the moment of the tap and never at launch: a
 * prompt a parent cannot connect to anything they did is a prompt they decline. What is asked for
 * is the child photo's rule (`photoAccess`), so the two pickers cannot disagree about it.
 *
 * `allowsEditing` is FALSE here, unlike the child photo. The OS editor on both platforms crops
 * to the aspect you give it, and there is no aspect that is right for "what this looked like".
 */
export async function pickEntryPhoto(source: PhotoSource): Promise<PickOutcome> {
  if (!(await photoAccess(source))) return { kind: 'denied', source };

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    allowsEditing: false,
    // full quality OUT of the picker: the one compression happens once, below, and compressing
    // twice is visible on exactly the kind of detail this feature exists to keep
    quality: 1,
    exif: false,
  };
  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return { kind: 'canceled' };
  const uri = result.assets[0]?.uri;
  return uri === undefined ? { kind: 'canceled' } : { kind: 'picked', uri };
}

/**
 * Long edge to 1024, JPEG q0.85, aspect kept — and the bytes, because that is what the bucket
 * takes.
 *
 * An image already inside the bound is NOT resized, only re-encoded. Upscaling a small photo to
 * 1024 would spend bytes inventing pixels; the re-encode still has to happen, because that is
 * the step that drops the EXIF.
 */
export async function prepareEntryPhoto(uri: string): Promise<Uint8Array> {
  const loaded = await ImageManipulator.manipulate(uri).renderAsync();
  const longest = Math.max(loaded.width, loaded.height);
  const scale = longest > ENTRY_PHOTO_LONG_EDGE ? ENTRY_PHOTO_LONG_EDGE / longest : 1;
  const pipeline = ImageManipulator.manipulate(loaded);
  if (scale < 1) {
    pipeline.resize({
      width: Math.max(1, Math.round(loaded.width * scale)),
      height: Math.max(1, Math.round(loaded.height * scale)),
    });
  }
  const out = await pipeline.renderAsync();
  const saved = await out.saveAsync({
    compress: ENTRY_PHOTO_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (saved.base64 === undefined) throw new Error('image manipulator returned no bytes');
  return bytesOfBase64(saved.base64);
}

/* ------------------------------------------------------------------- the outgoing staging */

/**
 * Park prepared bytes for one entry and hand back the uri the queue row points at.
 *
 * One file per entry, replaced in place: re-picking before the drain runs overwrites rather than
 * accumulating, which is what a parent who took three tries expects.
 */
export function stageEntryPhoto(activityId: string, bytes: Uint8Array): string | null {
  try {
    const file = new File(dirAt(QUEUE_DIR), `${activityId.toLowerCase()}.jpg`);
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
    return file.uri;
  } catch (err: unknown) {
    crumb(`entry photo: stage failed — ${err instanceof Error ? err.message : ''}`);
    return null;
  }
}

/** The staged bytes, or null when the OS reclaimed the cache — a picture to re-pick, not an error. */
export async function readStagedEntryPhoto(uri: string): Promise<Uint8Array | null> {
  try {
    const file = new File(uri);
    return file.exists ? await file.bytes() : null;
  } catch {
    return null;
  }
}

/** Drop the staged file once it is really in the bucket, or when its row is abandoned. */
export function forgetStagedEntryPhoto(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // it goes with the directory at sign-out
  }
}

/* --------------------------------------------------------------------------- the cache */

/** The cached file for one version of one entry's photo, or null when it is not there. */
export function cachedEntryPhoto(activityId: string, updatedAt: string | null): string | null {
  try {
    const file = new File(dirAt(CACHE_DIR), entryPhotoCacheName(activityId, updatedAt));
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Write a version into the cache and sweep every OTHER version of the same entry.
 *
 * The sweep is why this is one function: one photo per entry means one file per entry, and
 * without it a household that replaces pictures accumulates dead files in a directory nobody
 * ever looks at.
 */
function cacheEntryPhoto(
  activityId: string,
  updatedAt: string | null,
  bytes: Uint8Array,
): string | null {
  try {
    const dir = dirAt(CACHE_DIR);
    const name = entryPhotoCacheName(activityId, updatedAt);
    const file = new File(dir, name);
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
    sweepOtherVersions(dir, activityId, name);
    return file.uri;
  } catch (err: unknown) {
    // a cache that cannot be written is a photo fetched again next time, not a broken screen
    crumb(`entry photo: cache write failed — ${err instanceof Error ? err.message : ''}`);
    return null;
  }
}

function sweepOtherVersions(dir: Directory, activityId: string, keep: string): void {
  const prefix = `${activityId.toLowerCase()}-`;
  for (const entry of dir.list()) {
    const name = entry.name;
    if (name !== keep && name.startsWith(prefix)) {
      try {
        entry.delete();
      } catch {
        // a file the OS is holding: it goes with the directory at sign-out
      }
    }
  }
}

/** Every cached version of one entry's photo, gone — what "Remove photo" leaves behind. */
export function forgetEntryPhoto(activityId: string): void {
  try {
    sweepOtherVersions(dirAt(CACHE_DIR), activityId, '');
  } catch {
    // nothing cached yet
  }
}

/**
 * Fetch a signed URL's bytes and cache them. Returns the local uri, or null — a photo that
 * cannot be fetched is a placeholder on the entry, never an error a parent can act on.
 */
export async function fetchEntryPhoto(
  activityId: string,
  updatedAt: string | null,
  signedUrl: string,
): Promise<string | null> {
  try {
    // a `data:` url is what the mock provider hands back: decode it rather than fetching, so the
    // fake exercises the same cache the real signed URL does
    if (signedUrl.startsWith('data:')) {
      return cacheEntryPhoto(activityId, updatedAt, bytesOfBase64(signedUrl));
    }
    const response = await fetch(signedUrl);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return cacheEntryPhoto(activityId, updatedAt, new Uint8Array(buffer));
  } catch (err: unknown) {
    crumb(`entry photo: fetch failed — ${err instanceof Error ? err.message : ''}`);
    return null;
  }
}
