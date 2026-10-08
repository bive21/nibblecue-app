'use strict';
/**
 * THE iOS PRIVACY MANIFESTS (PrivacyInfo.xcprivacy): the reasons this app's code uses the APIs
 * Apple lists as "required reason" (docs/STORE_RELEASE.md §A2; the launch review, 2026-09-27).
 * Apple refuses an upload whose binaries reference one of those APIs without a declared reason
 * (ITMS-91053), and it checks every bundle it finds: the app AND the widget extension.
 *
 * WHAT IS DECLARED HERE, AND WHAT IS NOT. A pod that ships its own manifest declares its own use:
 * React Native's core, expo-constants, expo-file-system, expo-localization, expo-notifications,
 * AsyncStorage and RevenueCat each do, and `pod install` folds them, with React Native's own three
 * (C617.1, CA92.1, 35F9.1), into the APP's manifest (react-native/scripts/cocoapods/
 * privacy_manifest_utils.rb, "privacy manifest aggregation", on by default). What is left is what
 * this app brings that no pod declares, found by reading every native module the build links for
 * the listed symbols on 2026-09-27:
 *
 *   · THE APP GROUP'S DEFAULTS. The widgets read what the app writes through the App Group the
 *     two share: expo-widgets keeps each widget's timeline and layout in
 *     `UserDefaults(suiteName: <App Group>)` (its WidgetsStorage.swift), and ships no manifest.
 *     expo-sharing touches the same kind of store for its "share into" slot. Reason 1C8F.1.
 *   · THE APP'S OWN DEFAULTS. expo-updates keeps its configuration override in
 *     `UserDefaults.standard` (UpdatesConfigOverride.swift), and ships no manifest. Reason CA92.1,
 *     which React Native's aggregation adds as well; declared here so it does not hang on that.
 *
 * Nothing else: no disk-space, boot-time or keyboard API is used by the app's own code, and the
 * pods that use them declare them. The collected-data half of the manifest stays empty: the
 * App Privacy answers are made in App Store Connect (§A5), and "tracking" is false because the
 * app tracks nobody (no IDFA, no ATT prompt, no advertising SDK).
 *
 * THE WIDGET EXTENSION GETS ITS OWN, and needs to: it is a separate bundle whose binary links
 * expo-widgets (the App Group's defaults), ExpoModulesCore (a log file's attributes) and React
 * Native's core (its own three reasons), and neither expo-widgets 57 nor React Native's
 * aggregation (application targets only) writes one for it. `withWidgetPrivacyManifest` below
 * writes it into the extension's folder and its Copy Bundle Resources phase at prebuild.
 *
 * PLAIN COMMONJS, and imported by `app.config.ts` alone: Expo's config loader cannot load a `.ts`
 * import, and `widgets.config.cjs` could not carry this, because the app bundles that file and
 * Metro would try to bundle `expo/config-plugins` with it.
 */
const fs = require('node:fs');
const path = require('node:path');

/** The required-reason APIs, by Apple's own category names. */
const USER_DEFAULTS = 'NSPrivacyAccessedAPICategoryUserDefaults';
const FILE_TIMESTAMP = 'NSPrivacyAccessedAPICategoryFileTimestamp';
const SYSTEM_BOOT_TIME = 'NSPrivacyAccessedAPICategorySystemBootTime';

/**
 * The app's own manifest, for `ios.privacyManifests` (Expo writes it into the app target and
 * merges it with anything already there; `pod install` then adds the pods' reasons).
 */
const APP_PRIVACY_MANIFEST = Object.freeze({
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyAccessedAPITypes: [
    {
      NSPrivacyAccessedAPIType: USER_DEFAULTS,
      NSPrivacyAccessedAPITypeReasons: [
        // 1C8F.1: read and write defaults shared only with the app's own App Group, here the
        // widget extension (expo-widgets' WidgetsStorage, expo-sharing's share-into slot)
        '1C8F.1',
        // CA92.1: read and write the app's own defaults, readable by this app alone
        // (expo-updates' configuration override; React Native's core as well)
        'CA92.1',
      ],
    },
  ],
});

/**
 * The widget extension's manifest. Every line is a use in the extension's own binary, found on
 * 2026-09-27 in what expo-widgets links into its target (`use_expo_modules_widgets!` and
 * `use_react_native!` in its scripts/autolinking.rb): expo, expo-widgets, @expo/ui, React Native.
 */
const WIDGET_PRIVACY_MANIFEST = Object.freeze({
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [],
  NSPrivacyAccessedAPITypes: [
    {
      NSPrivacyAccessedAPIType: USER_DEFAULTS,
      NSPrivacyAccessedAPITypeReasons: [
        // 1C8F.1: the App Group's defaults, where the app leaves each widget's timeline and layout
        '1C8F.1',
        // CA92.1: the extension's own defaults (React Native's core reads its own)
        'CA92.1',
      ],
    },
    {
      NSPrivacyAccessedAPIType: FILE_TIMESTAMP,
      // C617.1: timestamps of files inside the extension's own container (React Native's core,
      // ExpoModulesCore's log file)
      NSPrivacyAccessedAPITypeReasons: ['C617.1'],
    },
    {
      NSPrivacyAccessedAPIType: SYSTEM_BOOT_TIME,
      // 35F9.1: time elapsed between events inside the extension (React Native's core timers)
      NSPrivacyAccessedAPITypeReasons: ['35F9.1'],
    },
  ],
});

/** expo-widgets' own name for the extension's target and folder (its withIosWidgets.ts). */
const WIDGET_TARGET = 'ExpoWidgetsTarget';
const MANIFEST_FILE = 'PrivacyInfo.xcprivacy';

/** A property list, written out: the manifest is dictionaries, arrays, strings and booleans. */
function plistXml(value) {
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const node = (v, pad) => {
    if (typeof v === 'boolean') return `${pad}<${v}/>`;
    if (typeof v === 'string') return `${pad}<string>${esc(v)}</string>`;
    if (Array.isArray(v))
      return v.length === 0
        ? `${pad}<array/>`
        : `${pad}<array>\n${v.map(x => node(x, `${pad}\t`)).join('\n')}\n${pad}</array>`;
    const entries = Object.entries(v);
    if (entries.length === 0) return `${pad}<dict/>`;
    return `${pad}<dict>\n${entries
      .map(([k, x]) => `${pad}\t<key>${esc(k)}</key>\n${node(x, `${pad}\t`)}`)
      .join('\n')}\n${pad}</dict>`;
  };
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    `<plist version="1.0">\n${node(value, '')}\n</plist>\n`
  );
}

/**
 * Adds the manifest file to the extension's group and to a Copy Bundle Resources phase of the
 * extension's target, which expo-widgets does not give it. Written by hand rather than through
 * the `xcode` library's `addBuildPhase`: that matches files by their path across the WHOLE
 * project, and the app's own manifest has the same name, so it would hand the extension the
 * app's file instead of its own.
 *
 * @returns false when there is no widget target to add it to (a config without expo-widgets)
 */
function addManifestToWidgetTarget(project) {
  const objects = project.hash.project.objects;
  const targets = objects.PBXNativeTarget ?? {};
  const targetKey = Object.keys(targets).find(
    k => !k.endsWith('_comment') && String(targets[k].name).replace(/"/g, '') === WIDGET_TARGET,
  );
  const groups = objects.PBXGroup ?? {};
  const groupKey = Object.keys(groups).find(
    k =>
      !k.endsWith('_comment') &&
      (String(groups[k].name).replace(/"/g, '') === WIDGET_TARGET ||
        String(groups[k].path).replace(/"/g, '') === WIDGET_TARGET),
  );
  if (targetKey === undefined || groupKey === undefined) return false;
  const group = groups[groupKey];
  group.children = group.children ?? [];
  if (group.children.some(c => c.comment === MANIFEST_FILE)) return true; // already there

  const fileRef = project.generateUuid();
  objects.PBXFileReference[fileRef] = {
    isa: 'PBXFileReference',
    lastKnownFileType: 'text.xml',
    path: MANIFEST_FILE,
    sourceTree: '"<group>"',
  };
  objects.PBXFileReference[`${fileRef}_comment`] = MANIFEST_FILE;
  group.children.push({ value: fileRef, comment: MANIFEST_FILE });

  const buildFile = project.generateUuid();
  objects.PBXBuildFile[buildFile] = {
    isa: 'PBXBuildFile',
    fileRef,
    fileRef_comment: MANIFEST_FILE,
  };
  objects.PBXBuildFile[`${buildFile}_comment`] = `${MANIFEST_FILE} in Resources`;

  objects.PBXResourcesBuildPhase = objects.PBXResourcesBuildPhase ?? {};
  const target = targets[targetKey];
  target.buildPhases = target.buildPhases ?? [];
  const existing = target.buildPhases.find(p => objects.PBXResourcesBuildPhase[p.value]);
  const entry = { value: buildFile, comment: `${MANIFEST_FILE} in Resources` };
  if (existing) {
    objects.PBXResourcesBuildPhase[existing.value].files.push(entry);
  } else {
    const phase = project.generateUuid();
    objects.PBXResourcesBuildPhase[phase] = {
      isa: 'PBXResourcesBuildPhase',
      buildActionMask: 2147483647,
      files: [entry],
      runOnlyForDeploymentPostprocessing: 0,
    };
    objects.PBXResourcesBuildPhase[`${phase}_comment`] = 'Resources';
    target.buildPhases.push({ value: phase, comment: 'Resources' });
  }
  return true;
}

/**
 * The config plugin. It has to act AFTER expo-widgets' own, which deletes and rewrites the
 * extension's folder and creates its target: Expo runs the mods of the plugin registered LAST
 * first, so `app.config.ts` applies this to the config it returns, before the `plugins` list —
 * and so before expo-widgets — is registered.
 */
function withWidgetPrivacyManifest(config) {
  // required here, at prebuild, and never at the top: nothing else in the app loads this file,
  // but a config read (`expo config`) should not need the plugin machinery either
  const { withDangerousMod, withXcodeProject } = require('expo/config-plugins');
  const withFile = withDangerousMod(config, [
    'ios',
    async mod => {
      const folder = path.join(mod.modRequest.platformProjectRoot, WIDGET_TARGET);
      if (fs.existsSync(folder)) {
        fs.writeFileSync(path.join(folder, MANIFEST_FILE), plistXml(WIDGET_PRIVACY_MANIFEST));
      }
      return mod;
    },
  ]);
  return withXcodeProject(withFile, mod => {
    addManifestToWidgetTarget(mod.modResults);
    return mod;
  });
}

module.exports = {
  APP_PRIVACY_MANIFEST,
  WIDGET_PRIVACY_MANIFEST,
  WIDGET_TARGET,
  plistXml,
  addManifestToWidgetTarget,
  withWidgetPrivacyManifest,
};
