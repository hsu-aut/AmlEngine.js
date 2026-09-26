import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60000,
    // Regenerates oracle outputs that depend on the date of the oracle run (see the file).
    globalSetup: ['test/setup/fresh-oracle.ts'],
  },
});
