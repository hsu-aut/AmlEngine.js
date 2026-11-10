import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    testTimeout: 60000,
    // Regenerates oracle outputs that depend on the date of the oracle run (see the file).
    globalSetup: ['test/setup/fresh-oracle.ts'],
    // Compares every FindByID with the search of the original when AMLENGINE_CHECK_ID_TABLE is set.
    // Registers services of the port when AMLENGINE_SERVICES is set (see the file).
    setupFiles: ['test/setup/check-id-table.ts', 'test/setup/services.ts'],
  },
});
