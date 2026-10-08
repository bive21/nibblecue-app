/**
 * WHAT THE ANDROID RELEASE ASKS THE PHONE FOR, AND WHAT IT MAY NEVER (docs/STORE_RELEASE.md §B2;
 * `permissions.config.cjs` gives every reason; docs/reports/ANDROID_RELEASE_READINESS.md is the
 * check of 2026-09-25 this pins).
 *
 * The release manifest is merged by Gradle from Expo's template, the config plugins, and the
 * manifest of every native module the build links — so a new dependency, or a new version of an
 * old one, can add a permission without a line of this repository changing. Play reads the merged
 * manifest: a permission nothing here uses is still one the listing shows, and some (the
 * advertising id, the media and exact-alarm permissions, a foreground service) stop a release
 * until a declaration is filled in.
 *
 * Gradle cannot run in a unit test, so this checks what can be read without it, which is most of
 * it: what `app.config.ts` itself produces, and the AndroidManifest.xml of every native module
 * reachable from the app's dependencies in node_modules. What only Gradle sees — the AARs those
 * modules fetch from Maven — is covered by the block list, which removes a name whichever
 * manifest declares it, and by the App bundle explorer after each upload (STORE_RELEASE.md §B9).
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { describe, expect, it } from 'vitest';
import makeConfig from '../app.config';
import { androidBlockedPermissions, NEVER_WANTED, UNUSED_TODAY } from '../permissions.config.cjs';

const APP = resolve(__dirname, '..');

/** The config exactly as Expo reads it for a build (development env: no production guard). */
function android(): NonNullable<ExpoConfig['android']> {
  const config = makeConfig({ config: {} } as ConfigContext);
  if (config.android === undefined) throw new Error('app.config.ts has no android section');
  return config.android;
}

const p = (name: string) => `android.permission.${name}`;

/**
 * THE LIST, PINNED. Changing it is a product decision (the header of `permissions.config.cjs`),
 * so it is spelled out here too: a change to one without the other is a failing test and a
 * question somebody has to answer.
 */
const BLOCKED = [
  p('SYSTEM_ALERT_WINDOW'),
  p('READ_EXTERNAL_STORAGE'),
  p('FOREGROUND_SERVICE'),
  p('RECORD_AUDIO'),
  'com.google.android.gms.permission.AD_ID',
  p('READ_MEDIA_IMAGES'),
  p('READ_MEDIA_VIDEO'),
  p('READ_MEDIA_VISUAL_USER_SELECTED'),
  p('MANAGE_EXTERNAL_STORAGE'),
  p('SCHEDULE_EXACT_ALARM'),
  p('USE_EXACT_ALARM'),
  p('USE_FULL_SCREEN_INTENT'),
  p('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'),
  p('ACCESS_FINE_LOCATION'),
  p('ACCESS_COARSE_LOCATION'),
  p('ACCESS_BACKGROUND_LOCATION'),
  p('QUERY_ALL_PACKAGES'),
  p('REQUEST_INSTALL_PACKAGES'),
];

/**
 * What the linked modules' own manifests leave in the release once the list has removed its
 * names: the part of STORE_RELEASE.md §B2's table that node_modules can prove. The rest of that
 * table comes from AARs only Gradle fetches (Play Billing's BILLING, Firebase's c2dm RECEIVE,
 * WAKE_LOCK, ShortcutBadger's launcher-badge names, AndroidX's signature permission).
 */
const KEPT_FROM_LINKED_MODULES = [
  p('INTERNET'),
  p('ACCESS_NETWORK_STATE'),
  p('ACCESS_WIFI_STATE'),
  p('VIBRATE'),
  p('CAMERA'),
  p('WRITE_EXTERNAL_STORAGE'),
  p('RECEIVE_BOOT_COMPLETED'),
  p('POST_NOTIFICATIONS'),
  // NibbleCue has no `modules/live-timer` (CuddleCue's running timer in the shade), so its
  // POST_PROMOTED_NOTIFICATIONS is not in this build.
];

/* ------------------------------------------------------------ the modules the build links */

interface Pkg {
  name: string;
  dir: string;
  deps: string[];
}

/** Node's own lookup, by hand: the nearest `node_modules/<name>` above `from`, followed through pnpm's links. */
function locate(name: string, from: string): string | null {
  for (let dir = from; ; dir = dirname(dir)) {
    const candidate = join(dir, 'node_modules', name);
    if (existsSync(join(candidate, 'package.json'))) return realpathSync(candidate);
    if (dirname(dir) === dir) return null;
  }
}

function readPkg(dir: string): Pkg {
  const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    name: string;
    dependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
  };
  return {
    name: json.name,
    dir,
    deps: [
      ...Object.keys(json.dependencies ?? {}),
      ...Object.keys(json.optionalDependencies ?? {}),
    ],
  };
}

/**
 * THE APP'S OWN NATIVE MODULES (`apps/mobile/modules/*`, autolinking's `nativeModulesDir`): linked
 * into every build like a dependency, though no package.json names them, so they are read here
 * beside the closure below.
 */
function localModules(): Pkg[] {
  const dir = join(APP, 'modules');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter(name => existsSync(join(dir, name, 'expo-module.config.json')))
    .map(name => ({ name: `modules/${name}`, dir: join(dir, name), deps: [] }));
}

/** Every package reachable from the app through `dependencies` — the set autolinking searches. */
function closure(): Pkg[] {
  const seen = new Map<string, Pkg>();
  const queue = [readPkg(APP)];
  while (queue.length > 0) {
    const pkg = queue.shift()!;
    for (const dep of pkg.deps) {
      const dir = locate(dep, pkg.dir);
      if (dir === null || seen.has(dir)) continue;
      const next = readPkg(dir);
      seen.set(dir, next);
      queue.push(next);
    }
  }
  return [...seen.values()];
}

/**
 * The manifests Gradle merges from one package: `src/main`, under the name AGP 8 reads
 * (react-native-android-widget points its build at `AndroidManifestNew.xml`).
 */
function manifestsOf(pkg: Pkg): string[] {
  const main = join(pkg.dir, 'android', 'src', 'main');
  if (!existsSync(main)) return [];
  return readdirSync(main)
    .filter(f => /^AndroidManifest(New)?\.xml$/.test(f))
    .map(f => join(main, f));
}

/** `<uses-permission android:name="…">` names, without the ones a manifest itself removes. */
function permissionsIn(xml: string): string[] {
  const out: string[] = [];
  for (const m of xml.matchAll(/<uses-permission(?:-sdk-23)?\b([^>]*)>/g)) {
    const attrs = m[1] ?? '';
    if (/tools:node="remove"/.test(attrs)) continue;
    const name = /android:name="([^"]+)"/.exec(attrs)?.[1];
    if (name !== undefined) out.push(name);
  }
  return out;
}

/** Permission → the packages whose manifests declare it. */
function declaredByLinkedModules(): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const pkg of [...closure(), ...localModules()]) {
    for (const file of manifestsOf(pkg)) {
      for (const name of permissionsIn(readFileSync(file, 'utf8'))) {
        if (!out.has(name)) out.set(name, new Set());
        out.get(name)!.add(pkg.name);
      }
    }
  }
  return out;
}

/* --------------------------------------------------------------------------------- tests */

describe('the Android permissions', () => {
  it('are removed from the release by the config itself, from the one list', () => {
    const a = android();
    expect(a.blockedPermissions).toEqual(androidBlockedPermissions());
    // nothing is ADDED by the config: every permission the release keeps comes from a module
    expect(a.permissions).toBeUndefined();
    // and the backup the same output turns off (`app-permissions.test.ts` says why)
    expect(a.allowBackup).toBe(false);
  });

  it('block exactly the pinned list, each with its reason', () => {
    expect([...androidBlockedPermissions()].sort()).toEqual([...BLOCKED].sort());
    for (const entry of [...UNUSED_TODAY, ...NEVER_WANTED]) {
      expect(entry.why.length, entry.name).toBeGreaterThan(20);
      expect(entry.from.length, entry.name).toBeGreaterThan(5);
    }
    expect(new Set(BLOCKED).size).toBe(BLOCKED.length);
  });

  it('keep out every permission Play asks a declaration for', () => {
    // the advertising id first: the owner answers "No", and an AD_ID beside a "No" stops a release
    for (const name of [
      'com.google.android.gms.permission.AD_ID',
      p('READ_MEDIA_IMAGES'),
      p('READ_MEDIA_VIDEO'),
      p('SCHEDULE_EXACT_ALARM'),
      p('USE_EXACT_ALARM'),
      p('USE_FULL_SCREEN_INTENT'),
      p('FOREGROUND_SERVICE'),
      p('ACCESS_BACKGROUND_LOCATION'),
      p('QUERY_ALL_PACKAGES'),
      p('REQUEST_INSTALL_PACKAGES'),
      p('MANAGE_EXTERNAL_STORAGE'),
    ]) {
      expect(androidBlockedPermissions(), name).toContain(name);
    }
  });

  it('are exactly the pinned set once the linked modules’ own manifests are merged', () => {
    const declared = declaredByLinkedModules();
    // the scan found the modules it has to find, so a pass means something (the app's own among them)
    for (const known of [p('POST_NOTIFICATIONS'), p('CAMERA'), p('ACCESS_WIFI_STATE')]) {
      expect(declared.has(known), `${known} was not found in any linked module`).toBe(true);
    }
    const blocked = new Set(androidBlockedPermissions());
    const kept = [...declared.keys()].filter(name => !blocked.has(name)).sort();
    const added = kept.filter(name => !KEPT_FROM_LINKED_MODULES.includes(name));
    expect(
      added.map(name => `${name} (${[...(declared.get(name) ?? [])].join(', ')})`),
      'A linked native module now declares a permission the release did not have. Decide: add ' +
        'it to KEPT_FROM_LINKED_MODULES and STORE_RELEASE.md §B2 if a feature needs it (and the ' +
        'Data safety form if it collects anything), or to permissions.config.cjs if not.',
    ).toEqual([]);
    expect(kept).toEqual([...KEPT_FROM_LINKED_MODULES].sort());
  });

  it('keep the microphone out twice over: the picker option and the list', () => {
    const config = readFileSync(join(APP, 'app.config.ts'), 'utf8');
    expect(config).toMatch(/microphonePermission:\s*false/);
    expect(androidBlockedPermissions()).toContain(p('RECORD_AUDIO'));
  });

  it('can do without storage for the photo library, because the app no longer asks for it', () => {
    // READ_EXTERNAL_STORAGE is on the list: an ask would come back "denied" without a prompt,
    // so it must not be made (`app-permissions.test.ts`, the photo library on Android)
    expect(androidBlockedPermissions()).toContain(p('READ_EXTERNAL_STORAGE'));
    const child = readFileSync(join(APP, 'src', 'media', 'childPhoto.ts'), 'utf8');
    expect(child).toContain("if (Platform.OS === 'android') return true;");
  });
});
