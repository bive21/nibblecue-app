/**
 * THE iOS PRIVACY MANIFESTS (`privacy.config.cjs`; docs/STORE_RELEASE.md §A2). Apple refuses an
 * upload whose binaries reference a "required reason" API without a declared reason (ITMS-91053),
 * bundle by bundle — the app and the widget extension.
 *
 * Three things are held here: what the app declares and why, that the config really applies both
 * manifests (read as text, for the reason `app-config.test.ts` gives), and — the one that matters
 * later — that no native module the app links uses one of those APIs without either shipping its
 * own manifest or being covered by the app's. A new dependency that reads the defaults, a file's
 * dates or the disk's free space with no manifest of its own fails this until somebody declares it.
 */
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const APP = resolve(__dirname, '..');
const privacy = require('../privacy.config.cjs') as typeof import('../privacy.config.cjs');
const { APP_PRIVACY_MANIFEST, WIDGET_PRIVACY_MANIFEST, WIDGET_TARGET } = privacy;

type Category =
  'UserDefaults' | 'FileTimestamp' | 'SystemBootTime' | 'DiskSpace' | 'ActiveKeyboards';
const CATEGORY = (name: string) => name.replace('NSPrivacyAccessedAPICategory', '') as Category;
const reasons = (m: {
  NSPrivacyAccessedAPITypes: readonly {
    NSPrivacyAccessedAPIType: string;
    NSPrivacyAccessedAPITypeReasons: string[];
  }[];
}) =>
  Object.fromEntries(
    m.NSPrivacyAccessedAPITypes.map(t => [
      CATEGORY(t.NSPrivacyAccessedAPIType),
      t.NSPrivacyAccessedAPITypeReasons,
    ]),
  );

describe('the app’s own manifest', () => {
  it('declares the App Group’s defaults and its own, and tracks nobody', () => {
    expect(reasons(APP_PRIVACY_MANIFEST)).toEqual({ UserDefaults: ['1C8F.1', 'CA92.1'] });
    expect(APP_PRIVACY_MANIFEST.NSPrivacyTracking).toBe(false);
    expect(APP_PRIVACY_MANIFEST.NSPrivacyTrackingDomains).toEqual([]);
  });

  it('is what the config hands Expo, and no extension’s is applied (NibbleCue has no widgets)', () => {
    const config = readFileSync(join(APP, 'app.config.ts'), 'utf8').replace(/\s+/g, ' ');
    expect(config).toContain("import { APP_PRIVACY_MANIFEST } from './privacy.config.cjs';");
    expect(config).toContain('privacyManifests: { ...APP_PRIVACY_MANIFEST,');
    // CuddleCue wraps its config in withWidgetPrivacyManifest for its widget extension; NibbleCue
    // ships no extension, so the wrapper (and expo-widgets) must stay out of the build
    expect(config).not.toContain('withWidgetPrivacyManifest');
  });
});

describe('the widget extension’s manifest', () => {
  it('declares what the extension’s own binary links: the App Group, React Native and Expo’s core', () => {
    expect(reasons(WIDGET_PRIVACY_MANIFEST)).toEqual({
      UserDefaults: ['1C8F.1', 'CA92.1'],
      FileTimestamp: ['C617.1'],
      SystemBootTime: ['35F9.1'],
    });
    expect(WIDGET_PRIVACY_MANIFEST.NSPrivacyTracking).toBe(false);
  });

  it('is written as a property list', () => {
    const xml = privacy.plistXml(WIDGET_PRIVACY_MANIFEST);
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<!DOCTYPE plist/);
    expect(xml).toContain('<key>NSPrivacyTracking</key>\n\t<false/>');
    expect(xml).toContain('<string>1C8F.1</string>');
    expect(xml.match(/<dict>/g)).toHaveLength(4);
    expect(xml.match(/<\/dict>/g)).toHaveLength(4);
  });

  /** One object of a project, the few fields these tests read. */
  interface Ref {
    value: string;
    comment?: string;
  }
  interface PbxObject {
    name?: string;
    path?: string;
    fileRef?: string;
    buildPhases?: Ref[];
    children?: Ref[];
    files?: Ref[];
  }

  /** A project the way the `xcode` library holds one, with the app's manifest already in it. */
  function project() {
    let n = 0;
    const objects: Record<string, Record<string, PbxObject>> = {
      PBXNativeTarget: {
        APPTARGET: { name: 'App', buildPhases: [{ value: 'APPRES', comment: 'Resources' }] },
        WIDGETTARGET: { name: WIDGET_TARGET, buildPhases: [{ value: 'SRC', comment: 'Sources' }] },
      },
      PBXGroup: { WIDGETGROUP: { name: WIDGET_TARGET, path: WIDGET_TARGET, children: [] } },
      PBXFileReference: { APPMANIFEST: { path: 'App/PrivacyInfo.xcprivacy' } },
      PBXBuildFile: { APPMANIFESTBF: { fileRef: 'APPMANIFEST' } },
      PBXResourcesBuildPhase: {
        APPRES: {
          files: [{ value: 'APPMANIFESTBF', comment: 'PrivacyInfo.xcprivacy in Resources' }],
        },
      },
      PBXSourcesBuildPhase: { SRC: { files: [] } },
    };
    return { hash: { project: { objects } }, generateUuid: () => `NEW${(n += 1)}`, objects };
  }

  it('goes into the extension’s own folder and its own resources, never the app’s file', () => {
    const p = project();
    expect(privacy.addManifestToWidgetTarget(p)).toBe(true);
    const target = p.objects.PBXNativeTarget!.WIDGETTARGET!;
    const phase = target.buildPhases!.find(b => b.comment === 'Resources');
    const files = p.objects.PBXResourcesBuildPhase![phase!.value]!.files!;
    expect(files).toHaveLength(1);
    const buildFile = p.objects.PBXBuildFile![files[0]!.value]!;
    expect(buildFile.fileRef).not.toBe('APPMANIFEST');
    expect(p.objects.PBXFileReference![buildFile.fileRef!]).toMatchObject({
      path: 'PrivacyInfo.xcprivacy',
    });
    expect(p.objects.PBXGroup!.WIDGETGROUP!.children).toEqual([
      { value: buildFile.fileRef, comment: 'PrivacyInfo.xcprivacy' },
    ]);
    // the app's own manifest is where it was, and only there
    expect(p.objects.PBXResourcesBuildPhase!.APPRES!.files).toHaveLength(1);
  });

  it('is added once, however many times the plugin runs, and not at all without a widget target', () => {
    const p = project();
    privacy.addManifestToWidgetTarget(p);
    privacy.addManifestToWidgetTarget(p);
    expect(p.objects.PBXGroup!.WIDGETGROUP!.children).toHaveLength(1);
    const bare = project();
    delete bare.objects.PBXNativeTarget!.WIDGETTARGET;
    expect(privacy.addManifestToWidgetTarget(bare)).toBe(false);
  });
});

/* ---------------------------------------------------------------- what the linked modules use */

/** Apple's required-reason API families, by the symbols Swift and Objective-C reach them through. */
const SYMBOLS: Record<Category, RegExp> = {
  UserDefaults: /\b(?:NSUserDefaults|UserDefaults)\b/,
  FileTimestamp:
    /\b(?:creationDate|modificationDate|NSFileCreationDate|NSFileModificationDate|contentModificationDate|getattrlist|fstat|lstat)\b|attributesOfItem/,
  SystemBootTime: /\b(?:systemUptime|mach_absolute_time)\b/,
  DiskSpace:
    /\b(?:volumeAvailableCapacity\w*|NSFileSystemFreeSize|NSFileSystemSize|systemFreeSize|statfs|statvfs)\b/,
  ActiveKeyboards: /\bactiveInputModes\b/,
};

/** React Native's own three, which its aggregation adds to the app's manifest at `pod install`. */
const REACT_NATIVE_CORE: readonly Category[] = ['FileTimestamp', 'UserDefaults', 'SystemBootTime'];

function sourcesUnder(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) sourcesUnder(p, out);
    else if (/\.(swift|m|mm|h|c|cpp)$/.test(e.name)) out.push(p);
  }
  return out;
}

function hasManifest(dir: string): boolean {
  return readdirSync(dir, { withFileTypes: true }).some(e =>
    e.isDirectory() && e.name !== 'node_modules'
      ? hasManifest(join(dir, e.name))
      : e.name === 'PrivacyInfo.xcprivacy',
  );
}

/** The app's native dependencies and Expo's own, where autolinking finds them. */
function linkedIosModules(): { name: string; dir: string }[] {
  const pkg = JSON.parse(readFileSync(join(APP, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  const expoDir = realpathSync(join(APP, 'node_modules', 'expo'));
  const expoPkg = JSON.parse(readFileSync(join(expoDir, 'package.json'), 'utf8')) as {
    dependencies: Record<string, string>;
  };
  const out = new Map<string, string>();
  for (const name of Object.keys(pkg.dependencies)) {
    const dir = join(APP, 'node_modules', name);
    if (existsSync(dir)) out.set(name, realpathSync(dir));
  }
  for (const name of Object.keys(expoPkg.dependencies)) {
    const dir = join(expoDir, '..', name);
    if (!out.has(name) && existsSync(dir)) out.set(name, realpathSync(dir));
  }
  return [...out].map(([name, dir]) => ({ name, dir })).filter(m => existsSync(join(m.dir, 'ios')));
}

describe('every required-reason API the linked native modules use is declared somewhere', () => {
  const declared = new Set<Category>([
    ...(Object.keys(reasons(APP_PRIVACY_MANIFEST)) as Category[]),
    ...REACT_NATIVE_CORE,
  ]);
  const modules = linkedIosModules();

  it('finds the native modules, so a passing run means something', () => {
    expect(modules.map(m => m.name)).toEqual(
      expect.arrayContaining(['expo-updates', 'expo-sqlite', 'expo-modules-core']),
    );
  });

  it('by a module’s own manifest, or by the app’s', () => {
    const uncovered: string[] = [];
    for (const { name, dir } of modules) {
      const ios = join(dir, 'ios');
      if (hasManifest(ios)) continue;
      const text = sourcesUnder(ios)
        .map(f => readFileSync(f, 'utf8'))
        .join('\n');
      for (const [category, re] of Object.entries(SYMBOLS) as [Category, RegExp][])
        if (re.test(text) && !declared.has(category)) uncovered.push(`${name}: ${category}`);
    }
    expect(
      uncovered,
      'A linked native module uses a required-reason API with no manifest of its own. Declare the ' +
        'reason in privacy.config.cjs (and in the widget manifest if the extension links it).',
    ).toEqual([]);
  });
});
