/**
 * THE BOOT SMOKE TEST'S CONFIG (docs/PREFLIGHT.md §8, "the boot smoke test"; docs/TESTING.md).
 *
 * The node suite (`vitest.config.ts`) never renders: React Native's own source is Flow and its
 * native modules are not there. This config renders the REAL app (`App.tsx`, every provider,
 * `RootNavigator`, the screens) in node by running it on react-native-web inside happy-dom, which
 * is what Expo's own web target does, with the mock backend behind it. Three crashes reached the
 * owner's phone through a green suite because nothing mounted the shell; this mounts it.
 *
 * WHAT IS SUBSTITUTED, and nothing else:
 *   · `react-native` → react-native-web, and every package's `.web.*` file first, the way Metro
 *     resolves for the web
 *   · `expo` → a shim of expo-modules-core (its real entry installs the dev runtime)
 *   · `expo-sqlite` → `node:sqlite` (the same SQLite the node suites use)
 *   · `expo-secure-store` → a map (its web build has no store)
 *   · `@react-native-community/datetimepicker` → nothing (Flow source, a native wheel)
 *   · a Metro asset `require('./x.png')` → a picture of the right shape (`setup.ts`)
 *   · `fetch` → refused: the phone is offline for the whole test
 *
 * WHAT IT CANNOT SEE is written in docs/PREFLIGHT.md §8: the native side of anything (a module
 * Expo Go does not carry, a native view that crashes on a device), and the iOS and Android
 * branches of the code (this is `Platform.OS === 'web'`).
 *
 * `pnpm test` runs it after the node suite (`package.json`). The transformed modules are cached on
 * disk (`fsModuleCache`), so a second run is several times faster than the first.
 */
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const here = (p: string): string => fileURLToPath(new URL(p, import.meta.url));
const shim = (name: string): string => here(`./src/testing/smoke/shims/${name}`);
// expo's own dependency, not the app's: reached from expo's folder, as pnpm lays it out
const fromExpo = createRequire(realpathSync(here('./node_modules/expo/package.json')));
const expoModulesCore = dirname(fromExpo.resolve('expo-modules-core/package.json'));

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^react-native$/,
        replacement: realpathSync(here('./node_modules/react-native-web')),
      },
      { find: /^expo$/, replacement: shim('expo.js') },
      { find: /^expo-modules-core$/, replacement: expoModulesCore },
      { find: /^expo-sqlite$/, replacement: shim('expo-sqlite.ts') },
      { find: /^expo-secure-store$/, replacement: shim('expo-secure-store.ts') },
      { find: /^@react-native-community\/datetimepicker$/, replacement: shim('datetimepicker.ts') },
    ],
    mainFields: ['browser', 'module', 'jsnext:main', 'jsnext', 'main'],
    conditions: ['browser', 'import', 'module', 'default'],
    extensions: [
      '.web.tsx',
      '.web.ts',
      '.web.mjs',
      '.web.js',
      '.tsx',
      '.ts',
      '.mjs',
      '.js',
      '.jsx',
      '.json',
    ],
  },
  // a release build's switches: no dev runtime, no dev-only branches
  define: { __DEV__: 'false', 'process.env.EXPO_OS': '"web"' },
  test: {
    name: 'mobile-smoke',
    environment: 'happy-dom',
    include: ['src/testing/smoke/**/*.smoke.test.tsx'],
    setupFiles: ['src/testing/smoke/setup.ts'],
    // the household's zone (`account.ts`), so Today opens without the "time on this phone" card
    env: { TZ: 'America/Chicago' },
    // everything that imports React Native, or resolves a `.web` file, is transformed here rather
    // than loaded by node, which would read React Native's Flow source
    server: {
      deps: { inline: [/react-native/, /expo/, /@react-navigation/, /@expo/, /@react-native/] },
    },
    experimental: { fsModuleCache: true },
    // the first run transforms the whole app (about 15 s on its own); a hang still fails
    testTimeout: 60_000,
  },
});
