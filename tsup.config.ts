import { defineConfig } from 'tsup';

// Two entries, amlengine-js and amlengine-js/services. Splitting (also for CommonJS) puts the
// engine into shared chunks, so both entries use the same modules and the same static state
// (ServiceLocator, document table); scripts/check-package.mjs checks this on the packed package.
export default defineConfig({
  entry: { index: 'src/index.ts', services: 'src/services/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  clean: true,
});
