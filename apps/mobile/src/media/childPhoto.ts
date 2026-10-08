/**
 * THE BABY'S PICTURE, ON THE DEVICE (the owner, 2026-09-20: *"Also add the feature to add baby's
 * picture saved to everyone in household"*). docs/MEDIA.md §3 is the pipeline; this is it.
 *
 *   pick or shoot → square centre crop → 512 px → JPEG q0.8 → bytes → the private bucket
 *                                                                  → `children.photo_path`
 *   read: the stamp → a cached file → or a signed URL, fetched once and cached
 *
 * THE RE-ENCODE IS NOT AN OPTIMISATION. A photo off a phone carries EXIF: where it was taken,
 * on what, at what time. Re-encoding is what drops it, so the "it is already small, skip the
 * manipulator" shortcut uploads a baby's home address. Everything that leaves this file has been
 * through `prepareChildPhoto`, and the API method takes finished bytes so nothing else can.
 *
 * WHY THE CACHE IS KEYED ON `photo_updated_at`. There is ONE object per child and it is replaced
 * in place, so the path never changes and a cache keyed on it would show the old picture forever
 * after the other parent changed it — which is the exact failure "saved to everyone in the
 * household" exists to prevent. The stamp changes on every write; a new stamp is a miss.
 *
 * WHY THE CACHE LIVES UNDER `Paths.cache/cuddlecue`. Two reasons, and both matter: the OS may
 * reclaim it, which is harmless because the file is re-fetchable from a signed URL; and
 * `clearTmp` (teardown step 11) already deletes that directory, so signing out takes the pictures
 * with it without a second thing to remember (docs/MEDIA.md §4, ACCOUNTS.md teardown).
 */
import { CHILD_PHOTO_QUALITY, CHILD_PHOTO_SIDE, childPhotoCacheName } from '@nibblecue/core';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { crumb } from '../app/boot';
import { bytesOfBase64 } from '../lib/base64';
import { setupPhotoFileName } from '../onboarding/pending-photo';

/** Where a picked photo comes from. Both are offered: a shot in a shop is not the only case. */
export type PhotoSource = 'library' | 'camera';

/** Why a pick produced nothing — the three the sheet says something different about. */
export type PickOutcome =
  { kind: 'picked'; uri: string } | { kind: 'canceled' } | { kind: 'denied'; source: PhotoSource };

const CACHE_DIR = ['cuddlecue', 'child-photos'] as const;

function cacheDir(): Directory {
  const dir = new Directory(Paths.cache, ...CACHE_DIR);
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/**
 * MAY THIS SOURCE OPEN — asked at the moment of the tap and never at launch, for both pickers
 * (this one and `entryPhoto.ts`).
 *
 * THE LIBRARY IS NOT ASKED FOR ON ANDROID. expo-image-picker opens the system photo picker there
 * (AndroidX `PickVisualMedia`; Google Play services brings it to old versions, and the system's
 * document picker stands in where it cannot), and that picker hands the app only the one photo
 * the parent chose, with no permission on any version. Asking anyway meant a storage prompt on
 * Android 12 and older — READ_EXTERNAL_STORAGE, which the picker never needed — and a parent who
 * said no could not choose a photo at all. The permission is now out of the Android manifest
 * (`permissions.config.cjs`), so asking would come back "denied" without a prompt: skipping the
 * ask is what keeps the library working, not a shortcut.
 *
 * The camera is asked for on both platforms, and the library on iOS, as before: taking a picture
 * is a different decision from choosing one (STORE_RELEASE.md §A2, §B2).
 */
export async function photoAccess(source: PhotoSource): Promise<boolean> {
  if (source === 'camera') return (await ImagePicker.requestCameraPermissionsAsync()).granted;
  if (Platform.OS === 'android') return true;
  return (await ImagePicker.requestMediaLibraryPermissionsAsync()).granted;
}

/**
 * Ask, then open. The permission is requested at the moment of the tap and never at launch:
 * a prompt a parent cannot connect to anything they did is a prompt they decline.
 */
export async function pickChildPhoto(source: PhotoSource): Promise<PickOutcome> {
  if (!(await photoAccess(source))) return { kind: 'denied', source };

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // the OS's own square cropper, so the parent frames the face rather than discovering
    // afterwards that the centre of the photo was a shoulder
    allowsEditing: true,
    aspect: [1, 1],
    // full quality OUT of the picker: the one compression happens once, in `prepareChildPhoto`,
    // and compressing twice is visible on a face
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
 * Square centre crop, 512 px, JPEG q0.8 — and the bytes, because that is what the bucket takes.
 *
 * The crop is computed from the image's OWN dimensions rather than assumed: `allowsEditing`
 * gives a square on both platforms today, and a platform that ever hands back something else
 * would otherwise be a stretched baby. Cropping a square to a square costs nothing.
 */
export async function prepareChildPhoto(uri: string): Promise<Uint8Array> {
  const loaded = await ImageManipulator.manipulate(uri).renderAsync();
  const side = Math.min(loaded.width, loaded.height);
  const out = await ImageManipulator.manipulate(loaded)
    .crop({
      originX: Math.round((loaded.width - side) / 2),
      originY: Math.round((loaded.height - side) / 2),
      width: side,
      height: side,
    })
    .resize({ width: CHILD_PHOTO_SIDE, height: CHILD_PHOTO_SIDE })
    .renderAsync();
  // THE RE-ENCODE, which is the privacy step and not the resize (see the header)
  const saved = await out.saveAsync({
    compress: CHILD_PHOTO_QUALITY,
    format: SaveFormat.JPEG,
    base64: true,
  });
  if (saved.base64 === undefined) throw new Error('image manipulator returned no bytes');
  return bytesOfBase64(saved.base64);
}

/* ------------------------------------------------------------------------ the local cache */

/** The cached file for one version of one child's photo, or null when it is not there. */
export function cachedChildPhoto(childId: string, updatedAt: string | null): string | null {
  try {
    const file = new File(cacheDir(), childPhotoCacheName(childId, updatedAt));
    return file.exists ? file.uri : null;
  } catch {
    return null;
  }
}

/**
 * Write a version into the cache and sweep every OTHER version of the same child.
 *
 * The sweep is why this is one function. One photo per child means one file per child; without
 * it, a household that changes the picture weekly accumulates a year of 40 KB files in a
 * directory nobody ever looks at.
 */
export function cacheChildPhoto(
  childId: string,
  updatedAt: string | null,
  bytes: Uint8Array,
): string | null {
  try {
    const dir = cacheDir();
    const name = childPhotoCacheName(childId, updatedAt);
    const file = new File(dir, name);
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
    sweepOtherVersions(dir, childId, name);
    return file.uri;
  } catch (err: unknown) {
    // a cache that cannot be written is a photo fetched again next time, not a broken screen
    crumb(`child photo: cache write failed — ${err instanceof Error ? err.message : ''}`);
    return null;
  }
}

function sweepOtherVersions(dir: Directory, childId: string, keep: string): void {
  const prefix = `${childId.toLowerCase()}-`;
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

/**
 * A kept picture's bytes, or null when the file is gone: what `photoMend.ts` reads, once per
 * version, to see whether the picture shows anything in its circle.
 */
export async function cachedPhotoBytes(uri: string): Promise<Uint8Array | null> {
  try {
    const file = new File(uri);
    return file.exists ? await file.bytes() : null;
  } catch {
    return null;
  }
}

/** Every cached version of one child's photo, gone — what "Remove photo" leaves behind. */
export function forgetChildPhoto(childId: string): void {
  try {
    sweepOtherVersions(cacheDir(), childId, '');
  } catch {
    // nothing cached yet
  }
}

/**
 * Fetch a signed URL's bytes and cache them. Returns the local uri, or null — a photo that
 * cannot be fetched is an initial on the avatar and never an error a parent can act on.
 */
export async function fetchChildPhoto(
  childId: string,
  updatedAt: string | null,
  signedUrl: string,
): Promise<string | null> {
  try {
    // a `data:` url is what the mock provider hands back: decode it rather than fetching it,
    // so the fake exercises the same cache the real signed URL does
    if (signedUrl.startsWith('data:')) {
      return cacheChildPhoto(childId, updatedAt, bytesOfBase64(signedUrl));
    }
    const response = await fetch(signedUrl);
    if (!response.ok) return null;
    const buffer = await response.arrayBuffer();
    return cacheChildPhoto(childId, updatedAt, new Uint8Array(buffer));
  } catch (err: unknown) {
    crumb(`child photo: fetch failed — ${err instanceof Error ? err.message : ''}`);
    return null;
  }
}

/* ------------------------------------------------------------- the picture from step 1 */

/**
 * SETUP'S PHOTO, PARKED (the owner, 2026-09-21: "on onboarding first page, add the option to add
 * your favorite baby picture"). On step 1 there is no child yet to give the picture to, so the
 * prepared bytes — cropped, downscaled, re-encoded, EXIF gone — wait in a file of their own
 * under the same cache directory the child photos use, which is the directory sign-out sweeps.
 * The draft carries the uri; `SetupSeeder` sends the bytes once the child exists.
 */
const SETUP_DIR = ['cuddlecue', 'setup-photo'] as const;

export function stashSetupPhoto(userId: string, bytes: Uint8Array): string | null {
  try {
    const dir = new Directory(Paths.cache, ...SETUP_DIR);
    if (!dir.exists) dir.create({ intermediates: true });
    // a name of its own per pick, so a new picture is a new uri to whatever draws it
    // (`setupPhotoFileName` says what one name for every pick cost)
    const file = new File(dir, setupPhotoFileName(userId, Date.now()));
    if (file.exists) file.delete();
    file.create();
    file.write(bytes);
    return file.uri;
  } catch (err: unknown) {
    crumb(`setup photo: stash failed — ${err instanceof Error ? err.message : ''}`);
    return null;
  }
}

/** The parked bytes, or null when the OS reclaimed the cache in between — a picture to re-pick. */
export async function readSetupPhoto(uri: string): Promise<Uint8Array | null> {
  try {
    const file = new File(uri);
    return file.exists ? await file.bytes() : null;
  } catch {
    return null;
  }
}

export function forgetSetupPhoto(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // it goes with the directory at sign-out
  }
}
