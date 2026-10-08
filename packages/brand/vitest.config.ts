import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'brand',
    environment: 'node',
    include: ['**/*.test.ts'],
  },
});
