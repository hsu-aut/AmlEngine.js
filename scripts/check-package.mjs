// Checks the packed package as a user gets it: `amlengine-js` and `amlengine-js/services` must share
// one engine, so that a service registered through the services entry is the one the engine finds
// (ServiceLocator), in ESM and in CommonJS; and their type declarations must describe the same
// classes, so that a document of the main entry can be passed to a service (TypeScript compares
// classes with private members by declaration).
//   node scripts/check-package.mjs [--no-build]
// Prints "package ok" and exits with 0, or exits with 1.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const repo = resolve('.');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// npm is a .cmd file on Windows, which Node starts only through the shell.
const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'pipe', shell: cmd.endsWith('.cmd'), maxBuffer: 1 << 26 }).toString();

if (!process.argv.includes('--no-build')) run(npm, ['run', 'build'], repo);
const work = mkdtempSync(join(tmpdir(), 'amlengine-package-'));
try {
  run(npm, ['pack', '--pack-destination', work], repo);
  const tgz = readdirSync(work).find((f) => f.endsWith('.tgz'));
  writeFileSync(join(work, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
  run(npm, ['install', '--no-audit', '--no-fund', '--ignore-scripts', join(work, tgz)], work);

  const scenario = (load) => `${load}
const svc = UndoRedoService.register();
const doc = CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
doc.caexFile.instanceHierarchy.append('IH');
if (ServiceLocator.undoRedoService !== svc) throw new Error('two engines: the main entry does not see the service');
if (!svc.canUndo(doc)) throw new Error('the engine did not record the change with the registered service');
while (svc.canUndo(doc)) svc.undo(doc);
if (doc.caexFile.instanceHierarchy.count !== 0) throw new Error('undoing every change did not remove the instance hierarchy');
UndoRedoService.unRegister();
console.log('ok');
`;
  writeFileSync(
    join(work, 'esm.mjs'),
    scenario("import { CAEXDocument, ServiceLocator } from 'amlengine-js';\nimport { UndoRedoService } from 'amlengine-js/services';"),
  );
  writeFileSync(
    join(work, 'cjs.cjs'),
    scenario("const { CAEXDocument, ServiceLocator } = require('amlengine-js');\nconst { UndoRedoService } = require('amlengine-js/services');"),
  );
  for (const f of ['esm.mjs', 'cjs.cjs']) {
    const out = run(process.execPath, [f], work).trim();
    if (out !== 'ok') throw new Error(`${f}: ${out}`);
  }

  // Types: one CAEXDocument for both entries, in ESM and CommonJS resolution.
  const ts = `import { CAEXDocument } from 'amlengine-js';
import { ValidatorService } from 'amlengine-js/services';
const doc: CAEXDocument = CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
const results = ValidatorService.register().validateAll(doc);
export const n: number = [...results].length;
`;
  writeFileSync(join(work, 'types.mts'), ts);
  writeFileSync(join(work, 'types.cts'), ts);
  const tsc = join(repo, 'node_modules', 'typescript', 'bin', 'tsc');
  for (const f of ['types.mts', 'types.cts']) {
    run(process.execPath, [tsc, '--noEmit', '--strict', '--module', 'node16', '--moduleResolution', 'node16', '--target', 'es2022', '--types', 'node', '--typeRoots', join(repo, 'node_modules', '@types'), f], work);
  }
  console.log('package ok');
} catch (e) {
  console.error(e.stdout?.toString() ?? '', e.stderr?.toString() ?? '', e.message);
  process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
