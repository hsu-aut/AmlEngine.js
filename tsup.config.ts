import { readFileSync } from 'node:fs';
import { defineConfig } from 'tsup';

const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

// Two entries, amlengine-js and amlengine-js/services. Splitting (also for CommonJS) puts the
// engine into shared chunks, so both entries use the same modules and the same static state
// (ServiceLocator, document table); scripts/check-package.mjs checks this on the packed package.
// The type declarations come from tsc, one file per module (scripts/build-types.mjs), so that
// both entries refer to the same declaration of every class.
// __AMLENGINE_BUILD__ names the copy (version and module format) for the warning of
// src/engine/services/ServiceLocator.ts when a process loads two copies of the engine.
export default defineConfig({
  entry: { index: 'src/index.ts', services: 'src/services/index.ts' },
  format: ['esm', 'cjs'],
  esbuildOptions(esbuild, context) {
    esbuild.define = { ...esbuild.define, __AMLENGINE_BUILD__: JSON.stringify(`${version} ${context.format}`) };
  },
  dts: false,
  splitting: true,
  clean: true,
});
