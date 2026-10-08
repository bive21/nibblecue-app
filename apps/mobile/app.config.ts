import type { ConfigContext, ExpoConfig } from 'expo/config';
import brand from '@nibblecue/brand/brand.json';
import pkg from './package.json';
import { guardApplies, identifierProblem, productionEnvProblem } from './env.guard.cjs';
import { androidBlockedPermissions } from './permissions.config.cjs';
import { APP_PRIVACY_MANIFEST } from './privacy.config.cjs';

/*
  NIBBLECUE'S APP CONFIG, read by Expo with Node's own loader (so it imports JSON and CommonJS
  only, never a workspace package's TypeScript; CuddleCue's `app.config.ts` says why).

  WHAT IS NOT HERE, ON PURPOSE: CuddleCue's widgets, its live timer and its NFC coins. NibbleCue
  ships none of them, so neither their plugins nor their permissions are in this build.

  THE IDENTIFIERS ARE PROPOSALS until the owner confirms them (brand.json `proposed`, docs/
  DECISIONS.md). `expo start` and Expo Go run on them so the app can be tested; a build or an
  export for release stops below with the keys named (`identifierProblem`).
*/
const { decided, proposed, unconfirmed, assets } = brand;
const id = { ...proposed, ...decided };

const ART = '../../packages/brand/brand';
const art = (file: string): string => `${ART}/${file.replace(/^brand\//, '')}`;

const releasing = guardApplies(process.env, process.argv.slice(2));
const problem = releasing
  ? (productionEnvProblem({
      EXPO_PUBLIC_ENV: process.env.EXPO_PUBLIC_ENV,
      EXPO_PUBLIC_AUTH_PROVIDER: process.env.EXPO_PUBLIC_AUTH_PROVIDER,
      EXPO_PUBLIC_SUPABASE_URL: process.env.EXPO_PUBLIC_SUPABASE_URL,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    }) ?? (process.env.EXPO_PUBLIC_ENV === 'production' ? identifierProblem(brand) : null))
  : null;
if (problem !== null) throw new Error(`app.config.ts: ${problem}`);

/** The EAS project, once the owner has made it; none in the meantime, and no update channel. */
const easProjectId = /^\{\{.+\}\}$/.test(unconfirmed.easProjectId)
  ? null
  : unconfirmed.easProjectId;
const easProject: Partial<ExpoConfig> =
  easProjectId === null
    ? {}
    : {
        runtimeVersion: { policy: 'appVersion' },
        updates: {
          url: `https://u.expo.dev/${easProjectId}`,
          checkAutomatically: 'ON_LOAD',
          fallbackToCacheTimeout: 0,
        },
      };

const googleServices: { googleServicesFile?: string } =
  typeof process.env.GOOGLE_SERVICES_JSON === 'string' && process.env.GOOGLE_SERVICES_JSON !== ''
    ? { googleServicesFile: process.env.GOOGLE_SERVICES_JSON }
    : {};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: decided.appDisplayName,
  slug: decided.appDisplayName.toLowerCase(),
  version: pkg.version,
  ...easProject,
  extra: {
    ...config.extra,
    ...(easProjectId === null ? {} : { eas: { projectId: easProjectId } }),
  },
  orientation: 'portrait',
  // light and dark follow the system: a platform expectation, never sold
  userInterfaceStyle: 'automatic',
  scheme: id.urlScheme,
  icon: art(assets.appIcon),
  ios: {
    supportsTablet: false,
    bundleIdentifier: id.iosBundleId,
    usesAppleSignIn: true,
    associatedDomains: [`applinks:${id.universalLinkHost}`],
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
    privacyManifests: {
      ...APP_PRIVACY_MANIFEST,
      NSPrivacyTrackingDomains: [...APP_PRIVACY_MANIFEST.NSPrivacyTrackingDomains],
      NSPrivacyAccessedAPITypes: APP_PRIVACY_MANIFEST.NSPrivacyAccessedAPITypes.map(t => ({
        ...t,
        NSPrivacyAccessedAPITypeReasons: [...t.NSPrivacyAccessedAPITypeReasons],
      })),
    },
  },
  android: {
    package: id.androidApplicationId,
    ...googleServices,
    // no copy of the local database in a cloud backup: the server holds every synced entry
    allowBackup: false,
    blockedPermissions: androidBlockedPermissions(),
    adaptiveIcon: {
      foregroundImage: art(assets.adaptiveForeground),
      backgroundImage: art(assets.adaptiveBackground),
      monochromeImage: art(assets.adaptiveMonochrome),
    },
    /*
      APP LINKS UNDER NIBBLECUE'S OWN PATH on the studio's domain. CuddleCue claims `/app` and
      `/t/` on the same host; NibbleCue claims only `linkPath` (proposed `/nibblecue/app`), so a
      link meant for one app never opens the other. The website's assetlinks.json and
      apple-app-site-association need a NibbleCue entry before they work (an owner action).
    */
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        category: ['BROWSABLE', 'DEFAULT'],
        data: [{ scheme: 'https', host: id.universalLinkHost, pathPrefix: id.linkPath }],
      },
    ],
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        image: art(assets.mark1024),
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: assets.colors.splashLight,
        dark: { image: art(assets.mark1024), backgroundColor: assets.colors.ink },
      },
    ],
    ['expo-notifications', { icon: art(assets.notificationIcon), color: assets.colors.brand }],
    'expo-apple-authentication',
    [
      'expo-image-picker',
      {
        photosPermission:
          `${decided.appDisplayName} asks for your photos so you can choose a profile photo ` +
          'for your baby or for yourself. It is shared only with your household and is never ' +
          'used for anything else.',
        cameraPermission:
          `${decided.appDisplayName} asks for the camera so you can take a profile photo of ` +
          'your baby or of yourself. It is shared only with your household and is never used ' +
          'for anything else.',
        microphonePermission: false,
      },
    ],
  ],
});
