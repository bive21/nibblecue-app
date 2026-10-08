// Expo's default Metro config handles the pnpm workspace (watch folders and node_modules
// resolution across packages/*). It is spelled out here so the next Metro change has an
// obvious home rather than a surprise.
const { createHash } = require('node:crypto');
const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');
const { backendOf } = require('./backend.cjs');

const config = getDefaultConfig(__dirname);

/**
 * REVENUECAT'S BROWSER SDK IS NOT SHIPPED TO PHONES (2026-09-26: 1.06 MB of a 5.96 MB bundle).
 *
 * `react-native-purchases` requires its browser implementation at the top of `dist/purchases.js`,
 * and that implementation requires `@revenuecat/purchases-js-hybrid-mappings`: a pre-bundled copy
 * of RevenueCat's web SDK, the largest single file the app shipped. It only ever runs in the SDK's
 * "browser mode" (`dist/utils/environment.js` `shouldUseBrowserMode`): on the web, in the Rork
 * sandbox, or in Expo Go without the native module. This app is none of those. It has no web
 * build, and it asks for the SDK only in its own binary (`ownBinary()` in
 * `src/billing/revenuecatSdk.ts`), where the native module is present and browser mode never
 * starts. So on a phone the web SDK is weight and nothing else.
 *
 * AN EMPTY MODULE IS SAFE because every use of the mapping, in the four browser files that
 * require it, sits inside a function only browser mode calls. Loading those files only binds the
 * (now empty) module object; nothing reads from it until then. `src/metro-config.test.ts` holds
 * both halves: this resolution, and that shape of the installed SDK.
 *
 * RE-CHECK ON EVERY `react-native-purchases` UPGRADE (the test re-reads the new version and fails
 * if it touches the mapping outside a function). And never switch on RevenueCat's Expo Go preview
 * mode (a Test Store key, run inside Expo Go): that IS browser mode, and it would find this empty.
 */
const BROWSER_ONLY = '@revenuecat/purchases-js-hybrid-mappings';

/**
 * AND NEITHER IS THE BROWSER MODE THAT WRAPS IT (2026-09-28: about 28 KB more).
 *
 * The mapping above was the largest file, not the whole of it. `dist/purchases.js` also requires
 * `./browser/nativeModule` at the top — the browser implementation of the native module, and
 * through it the browser folder's helpers and its simulated store — and reads it in exactly one
 * place: `usingBrowserMode ? nativeModule_1.browserNativeModuleRNPurchases : NativeModules
 * .RNPurchases`. Browser mode is the same mode as above, which the app's own binary never starts.
 *
 * AN EMPTY MODULE IS SAFE for the same reason: loading `purchases.js` only binds the module
 * object, and the one read of it is the browser-mode branch. Only that one request, from that one
 * file, is emptied; `src/metro-config.test.ts` holds the resolution and re-reads the installed SDK
 * for the shape that makes it safe. RE-CHECK ON EVERY `react-native-purchases` UPGRADE.
 */
const BROWSER_MODE = './browser/nativeModule';
const BROWSER_MODE_FROM = /[\\/]react-native-purchases[\\/]dist[\\/]purchases\.js$/;

/**
 * EXPO'S DEV TOOLS CLIENT IS NOT SHIPPED IN A RELEASE BUNDLE (2026-09-27: about 15 KB).
 *
 * `expo-sqlite` offers every database to Expo's dev tools plugin, and asks for the client —
 * `require('expo/devtools')`, which is `@expo/devtools`: a WebSocket client for the dev server —
 * inside a function that returns first when `__DEV__` is false (`build/SQLiteDevToolsClient.js`).
 * Metro collects a `require` before the minifier drops the branch it sits in, so every release
 * bundle carried the client and nothing in it ever ran.
 *
 * AN EMPTY MODULE IS SAFE in a release bundle because that one `require` is reached only in dev;
 * a development bundle resolves it as before, so the SQLite inspector keeps working while the
 * app is being built. Only `context.dev === false` counts as a release — a context that does not
 * say goes to the resolver underneath. `src/metro-config.test.ts` holds both halves, and re-reads
 * the installed `expo-sqlite` for the shape that makes it safe.
 */
const DEV_ONLY = 'expo/devtools';

/**
 * THE TEST BACKEND IS NOT SHIPPED IN A RELEASE BUNDLE THAT CAN NEVER RUN ON IT (2026-09-28: about
 * 73 KB of a store build's JavaScript).
 *
 * The in-memory accounts server, the sync server and the store that is not a store (the three
 * `mock` providers, the fake's seeding, the dev reset) are how Expo Go, a development build and
 * the Maestro flows run with no keys (CLAUDE.md rule 11). A build is on them only when its
 * settings pick them, and `backend.cjs` is the one rule that says so: `readEnv` reads it on the
 * phone from the values Metro inlines, and this reads it from the same environment while Metro
 * bundles. So in a RELEASE bundle whose settings pick the server — every production build and
 * update, which `productionEnvProblem` refuses to make otherwise, and a staging one made with its
 * server's settings — the phone can never choose the mock, and these files are empty modules.
 *
 * AN EMPTY MODULE IS SAFE because every use of them is on the mock's own path, behind the same
 * choice: `createProviders` and `createSyncProviders` return the server arm before they reach one,
 * the billing mock and the fake's seeding run only when the account backend handed over a mock
 * (`mock !== null`), and the dev reset sits on a More row drawn only on the mock. Loading an
 * importer only binds the (now empty) module object. `src/metro-config.test.ts` holds the
 * resolution, and holds the importers to the ones read here, so a new one fails until it is
 * checked.
 *
 * Everything else keeps them: a development bundle (Expo Go, a dev client, the Maestro flows),
 * and a release bundle made with no server settings, which can only run on the mock — and which
 * `releaseEnvProblem` stops at the first screen if it is ever installed on a store channel.
 */
const TEST_BACKEND = new Set(
  [
    'src/auth/providers/mock.ts',
    'src/sync/providers/mock.ts',
    'src/sync/providers/mockSeed.ts',
    'src/billing/mock.ts',
    'src/dev/reset.ts',
  ].map(file => path.join(__dirname, file)),
);

const upstream = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === BROWSER_ONLY && platform !== 'web') return { type: 'empty' };
  if (
    moduleName === BROWSER_MODE &&
    platform !== 'web' &&
    BROWSER_MODE_FROM.test(context.originModulePath ?? '')
  )
    return { type: 'empty' };
  if (moduleName === DEV_ONLY && context.dev === false) return { type: 'empty' };
  const resolved = upstream
    ? upstream(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
  if (
    context.dev === false &&
    resolved.type === 'sourceFile' &&
    TEST_BACKEND.has(resolved.filePath) &&
    backendOf(process.env) === 'supabase'
  )
    return { type: 'empty' };
  return resolved;
};

/**
 * THE TRANSFORM CACHE IS KEYED ON THE SETTINGS IT INLINES (2026-09-28).
 *
 * A release transform writes each `process.env.EXPO_PUBLIC_*` value into the file's output, and
 * Metro caches that output under a key that did not include those values: an `expo export` made
 * after another one with different settings reused the first one's files, settings and all
 * (measured: an export with no server settings, then one with them, made byte-identical
 * bundles, the second with no server URL in it). `eas update` exports this way, so an update
 * could have carried another environment's server — and the rule above would have disagreed with
 * the phone. The values are public by design (`src/env.ts`); only a digest of them joins the key.
 * A development bundle reads them at run time instead, and pays one fresh transform when one
 * changes.
 */
config.cacheVersion = [
  config.cacheVersion,
  createHash('sha256')
    .update(
      Object.keys(process.env)
        .filter(name => name.startsWith('EXPO_PUBLIC_'))
        .sort()
        .map(name => `${name}=${process.env[name]}`)
        .join('\n'),
    )
    .digest('hex')
    .slice(0, 16),
].join(':');

module.exports = config;
