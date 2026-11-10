// Writes the type declarations of the package with tsc, one file per module: dist/types for ESM
// and a copy in dist/types-cjs, whose package.json makes TypeScript read the same files as
// CommonJS declarations for `require` (package.json "exports"). Both entries import the same
// declaration files, so a class of amlengine-js is the same type in amlengine-js/services.
//   node scripts/build-types.mjs   (part of npm run build)
import { execFileSync } from 'node:child_process';
import { cpSync, rmSync, writeFileSync } from 'node:fs';

rmSync('dist/types', { recursive: true, force: true });
rmSync('dist/types-cjs', { recursive: true, force: true });
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.types.json'], { stdio: 'inherit' });
cpSync('dist/types', 'dist/types-cjs', { recursive: true });
writeFileSync('dist/types-cjs/package.json', JSON.stringify({ type: 'commonjs' }) + '\n');
