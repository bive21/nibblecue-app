'use strict';
/**
 * WHAT THE ANDROID APP MAY NOT ASK THE PHONE FOR (docs/STORE_RELEASE.md §B2). Checked on
 * 2026-09-25 against a prebuild of the production config and the manifests of every native module
 * the build links (docs/reports/ANDROID_RELEASE_READINESS.md).
 *
 * THE RELEASE MANIFEST IS NOT THIS REPOSITORY'S ALONE. Gradle merges in the manifest of every
 * native library the build links, including AARs fetched from Maven that nothing here can read,
 * and Expo's template and config plugins add entries of their own. Whatever any of them declares
 * ships, unless the app's own manifest removes it. That is what `android.blockedPermissions` does:
 * `app.config.ts` writes each name below as `<uses-permission … tools:node="remove">`, and the
 * manifest merger drops it whichever library declared it.
 *
 * Two kinds of entry, for one reason — Play reads the merged manifest, not our intentions:
 *
 *   · IN THE BUILD TODAY, AND UNUSED. Removing one of these changes nothing the app does.
 *   · NEVER WANTED, EACH ONE A PLAY DECLARATION OR A POLICY REVIEW. Nothing the app links declared
 *     any of these on 2026-09-25. They are listed so that a new dependency, or a new version of an
 *     old one, cannot bring one in unnoticed. The advertising id above all: the owner answers "No"
 *     to Play's Advertising ID question, and an AD_ID in the manifest beside a "No" stops the
 *     release.
 *
 * TAKING A NAME OFF THIS LIST IS A PRODUCT DECISION, NOT A FIX. It means a feature needs it, a Play
 * Console declaration to fill in, and a new line in STORE_RELEASE.md §B2 and in the Data safety
 * form. `src/android-permissions.test.ts` pins this list and the permissions the release keeps.
 *
 * PLAIN COMMONJS for the reason `widgets.config.cjs` gives: Expo's config loader cannot load a
 * `.ts` import from `app.config.ts`, and the test must read the same list the config does.
 */

/** In the release manifest today, used by nothing the app does. */
const UNUSED_TODAY = Object.freeze([
  {
    name: 'android.permission.SYSTEM_ALERT_WINDOW',
    from: "Expo's prebuild template (the main AndroidManifest.xml)",
    why:
      "Drawing over other apps. React Native's development overlay wants it in a debug build; a " +
      'release draws nothing over anything.',
  },
  {
    name: 'android.permission.READ_EXTERNAL_STORAGE',
    from: "expo-file-system's config plugin and manifest, expo-image-picker's manifest (Android 12 and older)",
    why:
      'Choosing a photo opens the system photo picker, which needs no permission on any version ' +
      '(media/childPhoto.ts `photoAccess`). The app used to ask for this first on Android 12 and ' +
      'older, and a parent who said no could not choose a photo at all.',
  },
  {
    name: 'android.permission.FOREGROUND_SERVICE',
    from: "WorkManager's AAR, via react-native-android-widget and expo-widgets (Glance)",
    why:
      'No part of the app runs a foreground service: reminders are alarms, the ongoing next-up ' +
      'notification is an ordinary one kept in the shade, and the widget library enqueues ' +
      'expedited work only on Android 12 and later, where it is a job rather than a service.',
  },
  {
    name: 'android.permission.RECORD_AUDIO',
    from: "expo-image-picker's config plugin (for recording video)",
    why:
      'Both pickers ask for images only. `microphonePermission: false` already removes it; the ' +
      'block keeps it out if the plugin option ever goes.',
  },
]);

/** Declared by nothing the app links on 2026-09-25. Each would put the app in front of Play review. */
const NEVER_WANTED = Object.freeze([
  {
    name: 'com.google.android.gms.permission.AD_ID',
    from: 'play-services-ads-identifier 18 and later (RevenueCat links 17.0.1, which does not declare it)',
    why:
      'No ads and no advertising id (CLAUDE.md rule 15). Play asks every app targeting Android 13+ ' +
      'whether it uses the advertising id; the answer is No, and the manifest has to agree.',
  },
  {
    name: 'android.permission.READ_MEDIA_IMAGES',
    from: 'a media-library module',
    why: "Play's Photo and Video Permissions policy: an app that can use the system photo picker may not hold it.",
  },
  {
    name: 'android.permission.READ_MEDIA_VIDEO',
    from: 'a media-library module',
    why: "Play's Photo and Video Permissions policy, as above; the app takes no video at all.",
  },
  {
    name: 'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
    from: 'a media-library module (Android 14 partial access)',
    why: "Android 14's partial photo access, which only comes with READ_MEDIA_IMAGES.",
  },
  {
    name: 'android.permission.MANAGE_EXTERNAL_STORAGE',
    from: 'a file-manager module',
    why: "Play's All files access policy. The app reads and writes its own folders only.",
  },
  {
    name: 'android.permission.SCHEDULE_EXACT_ALARM',
    from: 'a notification or alarm module',
    why:
      'Reminders are inexact on purpose (docs/NOTIFICATIONS.md); expo-notifications falls back to ' +
      'an inexact alarm without it. Holding it means an exact-alarm declaration.',
  },
  {
    name: 'android.permission.USE_EXACT_ALARM',
    from: 'a notification or alarm module',
    why: 'Reserved by Play for alarm-clock and calendar apps.',
  },
  {
    name: 'android.permission.USE_FULL_SCREEN_INTENT',
    from: 'a calling or alarm notification module',
    why: 'Reserved by Play for calls and alarms; a reminder is neither.',
  },
  {
    name: 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS',
    from: 'a background-task module',
    why: 'Restricted by Play to apps whose core function breaks without it. Nothing here does.',
  },
  {
    name: 'android.permission.ACCESS_FINE_LOCATION',
    from: 'a location or Bluetooth module',
    why:
      'Location is "No" on both privacy forms (STORE_RELEASE.md §A5, §B5), and a photo is ' +
      're-encoded before upload so it carries none.',
  },
  {
    name: 'android.permission.ACCESS_COARSE_LOCATION',
    from: 'a location or Bluetooth module',
    why: 'Location is "No" on both privacy forms; the app never asks where the phone is.',
  },
  {
    name: 'android.permission.ACCESS_BACKGROUND_LOCATION',
    from: 'a location module',
    why: 'Location in the background: "No" on both privacy forms, and a Play declaration of its own.',
  },
  {
    name: 'android.permission.QUERY_ALL_PACKAGES',
    from: 'a module that lists installed apps',
    why:
      "Play's package-visibility policy. The app declares the few intents it opens (<queries>) " +
      'instead.',
  },
  {
    name: 'android.permission.REQUEST_INSTALL_PACKAGES',
    from: 'an updater or file-opener module',
    why: 'Play forbids it outside app stores and file managers. Updates come from Play and EAS.',
  },
]);

const BLOCKED_ANDROID_PERMISSIONS = Object.freeze([...UNUSED_TODAY, ...NEVER_WANTED]);

/** The names, in order, for `android.blockedPermissions`. */
function androidBlockedPermissions() {
  return BLOCKED_ANDROID_PERMISSIONS.map(p => p.name);
}

module.exports = {
  UNUSED_TODAY,
  NEVER_WANTED,
  BLOCKED_ANDROID_PERMISSIONS,
  androidBlockedPermissions,
};
