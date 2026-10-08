import { defineConfig } from 'vitest/config';

// Static checks only (no database). The integration suite is vitest.integration.config.ts.
export default defineConfig({
  test: {
    name: 'db',
    environment: 'node',
    include: ['src/*.test.ts'],
  },
});
