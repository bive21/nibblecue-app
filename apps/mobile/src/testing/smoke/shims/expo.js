/**
 * The `expo` package for the boot smoke test (aliased in `apps/mobile/vitest.smoke.config.mts`). Its real
 * entry installs the development runtime (fast refresh, HMR, the winter globals) through CommonJS
 * requires of `.ts` files node cannot follow, and nothing the app reaches through `expo` needs it:
 * the app asks it for two lookups, and the expo-* packages ask it for the module classes, all of
 * which live in expo-modules-core. JavaScript rather than TypeScript because expo-modules-core is
 * expo's own dependency, not the app's, and only the test config's alias can reach it.
 */
export * from 'expo-modules-core';
export const isRunningInExpoGo = () => false;
