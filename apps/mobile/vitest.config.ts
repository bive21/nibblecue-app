import { defineConfig } from 'vitest/config';

// Pure app logic only (auth/session, teardown, quarantine, analytics, prefs, the local schema,
// the mock provider). Nothing here imports React Native. The app shell is RENDERED by the boot
// smoke test (`vitest.smoke.config.mts`, `*.smoke.test.tsx`, which this `include` never matches),
// and screens on a device by the Maestro flows in e2e/.
export default defineConfig({
  test: {
    name: 'mobile',
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /**
     * THIRTY SECONDS, NOT FIVE. The pixel and geometry sweeps (the card art read back from the
     * shipped PNGs, the frost and place pictures at every height) run for seconds on their own, and
     * `pnpm test` runs every package's suite at once, so under that load they crossed vitest's
     * 5 s default and failed with no fault in them (2026-09-26). A hang still fails, just later.
     */
    testTimeout: 30_000,
  },
});
