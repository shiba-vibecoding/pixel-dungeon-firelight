import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts'],
    // Level generation, the fingerprint and the soak smoke are CPU-heavy: on a busy machine or a slow CI runner 5 s is not enough.
    testTimeout: 60_000,
  },
});
