import { defineConfig } from 'vitest/config';

// Root config exists so `pnpm test:entitlements`, `pnpm test:brand` and `pnpm test:safety` can
// filter by path from the repository root; each package still owns its own vitest.config.ts and
// `pnpm test` runs them through turbo.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/mobile'],
  },
});
