import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'ui',
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
