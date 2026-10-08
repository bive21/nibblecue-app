/**
 * WHAT THE APP ASKS THE PHONE FOR: the permission prompts a store reviewer reads.
 *
 * `expo-image-picker` fills in whatever it is not told. Left alone it writes a generic "Allow … to
 * access your microphone" into Info.plist and adds RECORD_AUDIO to the Android manifest, both for
 * recording video, which the app never does. No screen shows either, so nothing but a test
 * notices one coming back, and `docs/STORE_RELEASE.md` §A2 and §B2 tell both stores there is no
 * microphone. Until 2026-09-23 there was one.
 *
 * Read statically, for the reason `app-config.test.ts` gives: loading `app.config.ts` needs
 * Expo's own loader.
 */
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const config = readFileSync(join(resolve(__dirname, '..'), 'app.config.ts'), 'utf8');

/** The `expo-image-picker` entry of `plugins`, from its name to the end of its tuple. */
function pickerEntry(source: string): string {
  const start = source.indexOf("'expo-image-picker'");
  if (start < 0) return '';
  return source.slice(start, source.indexOf('],', start));
}

describe('the photo permissions', () => {
  const entry = pickerEntry(config);

  it('finds the picker in the config, so a passing run means something', () => {
    expect(entry.length).toBeGreaterThan(0);
  });

  it('never lets the picker add a microphone', () => {
    expect(entry).toMatch(/microphonePermission:\s*false/);
  });

  it('writes its own camera and photo prompts, so the generic ones never ship', () => {
    expect(entry).toMatch(/photosPermission:/);
    expect(entry).toMatch(/cameraPermission:/);
  });

  it('says in each prompt who sees the photo', () => {
    // a prompt that only asks is the kind review rejects; both end on the household rule
    expect(entry.match(/shared only with your household/g)).toHaveLength(2);
  });

  it('says in each prompt what the photo is for: the baby’s profile photo, or your own', () => {
    // specific, because Apple rejects a vague purpose string; the photo sheet's own words
    expect(entry).toMatch(/photosPermission:[\s\S]*?choose a profile photo[\s\S]*?for your baby/);
    expect(entry).toMatch(
      /cameraPermission:[\s\S]*?take a profile photo[\s\S]*?of[\s\S]*?your baby/,
    );
    // and, since 2026-09-30, a member's own picture (docs/MEDIA.md §2c): a purpose the prompt
    // does not name is one review asks about
    expect(entry).toMatch(/photosPermission:[\s\S]*?for yourself\./);
    expect(entry).toMatch(/cameraPermission:[\s\S]*?of yourself\./);
  });
});

/**
 * THE PHOTO LIBRARY ON ANDROID ASKS FOR NOTHING (2026-09-25; `media/childPhoto.ts` `photoAccess`).
 * expo-image-picker opens the system photo picker there, which needs no permission on any version.
 * The app used to ask for the media library first, which on Android 12 and older is a storage
 * prompt (READ_EXTERNAL_STORAGE) — and a parent who said no could not choose a photo at all.
 */
describe('the photo library on Android', () => {
  const read = (rel: string) => readFileSync(join(resolve(__dirname), rel), 'utf8');
  const child = read('media/childPhoto.ts');
  const entryPhoto = read('media/entryPhoto.ts');
  const DENIED = /if \(!\(await photoAccess\(source\)\)\) return \{ kind: 'denied', source \}/;

  it('opens the system photo picker without asking for storage first', () => {
    const access = child.slice(child.indexOf('export async function photoAccess'));
    const androidSkip = access.indexOf("if (Platform.OS === 'android') return true;");
    const ask = access.indexOf('requestMediaLibraryPermissionsAsync');
    expect(androidSkip).toBeGreaterThan(0);
    // iOS still asks, after the Android line
    expect(ask).toBeGreaterThan(androidSkip);
  });

  it('is asked for by one rule in both pickers, and the camera still asks', () => {
    expect(child.match(/requestMediaLibraryPermissionsAsync/g)).toHaveLength(1);
    expect(entryPhoto).not.toMatch(/requestMediaLibraryPermissionsAsync/);
    expect(entryPhoto).not.toMatch(/requestCameraPermissionsAsync/);
    expect(child).toMatch(DENIED);
    expect(entryPhoto).toMatch(DENIED);
    expect(child).toMatch(
      /if \(source === 'camera'\) return \(await ImagePicker\.requestCameraPermissionsAsync\(\)\)\.granted;/,
    );
  });
});

/**
 * NO ANDROID BACKUP (docs/SECURITY.md §6, STORE_RELEASE.md §B2). Both documents said
 * `allowBackup="false"` from the start; the config never set it, so every build carried Expo's
 * default `true` until 2026-09-25 — and with it a copy of the local database, whose outbox holds
 * entries the server has not seen yet, in the parent's cloud backup.
 */
describe('the Android backup', () => {
  it('is off in the config', () => {
    expect(config).toMatch(/\n {4}allowBackup: false,\n/);
  });
});
