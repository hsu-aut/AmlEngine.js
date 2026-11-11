// Runs the engine oracle packages with services of Aml.Engine.Services registered and compares the
// port with the same services registered. The engine asks the ServiceLocator for these services in
// many places (undo commands, queries, unique names, external references); without a registered
// service none of these paths runs. The oracle registers them through ORACLE_SERVICES
// (oracle/OracleServices.cs) and writes into test/oracle-out-services/<list>; the JS tests register
// them through AMLENGINE_SERVICES (test/setup/services.ts) and read these outputs (ORACLE_OUT).
//   node scripts/services-check.mjs [list=lookup,uniquename,undo] [--tests-only | --oracle-only]
// ORACLE_DLL=<path> runs an oracle built elsewhere instead of building oracle/.
// Exit code 1 when a comparison fails.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const testsOnly = args.includes('--tests-only');
const oracleOnly = args.includes('--oracle-only');
const list = args.find((a) => !a.startsWith('--')) ?? 'lookup,uniquename,undo';
const ORACLE = process.env.ORACLE_DLL ?? 'oracle/bin/Release/net8.0/Oracle.dll';
const corpus = readdirSync('test/corpus').filter((f) => f.endsWith('.aml')).sort().map((f) => join('test/corpus', f));

// oracle mode and arguments ('@' stands for the output directory), then the JS test file
const PACKAGES = [
  ['values', 'test/values/cases.json', 'test/corpus', '@/values.json', 'test/engine/values.oracle.test.ts'],
  ['engineops', 'test/engine-ops/ops.json', 'test/corpus', '@/engineops.json', 'test/engine/ops.oracle.test.ts'],
  ['mutations', 'test/mutations/scripts.json', 'test/corpus', '@/mutations.json', 'test/engine/mutations.oracle.test.ts'],
  ['gapscaex', 'test/gapscaex', '@/gapscaex.json', 'test/engine/gapscaex.oracle.test.ts'],
  ['amlobjects', 'test/amlobjects', 'test/corpus', '@/amlobjects-work', '@/amlobjects', 'test/engine/amlobjects.oracle.test.ts'],
  ['dump', '@/dump', ...corpus, 'test/engine/dump.oracle.test.ts'],
];

if (!testsOnly && !process.env.ORACLE_DLL) {
  execFileSync('dotnet', ['build', 'oracle', '-c', 'Release', '-nologo', '-v', 'q'], { stdio: 'ignore' });
  if (!existsSync(ORACLE)) throw new Error('oracle not built');
}
const dir = `test/oracle-out-services/${list.replace(/,/g, '+')}`;
mkdirSync(dir, { recursive: true });
if (!testsOnly) {
  for (const p of PACKAGES) {
    console.log(`${list}: oracle ${p[0]}`);
    execFileSync('dotnet', [ORACLE, ...p.slice(0, -1).map((a) => a.replace('@', dir))], {
      stdio: 'ignore',
      env: { ...process.env, ORACLE_SERVICES: list },
      maxBuffer: 1 << 30,
    });
  }
}
if (oracleOnly) process.exit(0);
console.log(`${list}: tests`);
const results = join(dir, 'results.json');
spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...PACKAGES.map((p) => p.at(-1)), '--reporter=json', `--outputFile=${results}`], {
  stdio: 'ignore',
  env: { ...process.env, ORACLE_OUT: dir, AMLENGINE_SERVICES: list },
});
const report = JSON.parse(readFileSync(results, 'utf8'));
let differ = 0;
// A file that fails as a whole (import error, failing hook) or a test that is skipped (a missing
// oracle output) compares nothing: both count as failures, so the check cannot pass silently.
let broken = 0;
const short = (name) => name.replace(/\\/g, '/').replace(/^.*\/test\//, 'test/');
const ran = new Set(report.testResults.map((f) => short(f.name)));
for (const p of PACKAGES) {
  if (!ran.has(p.at(-1))) {
    broken++;
    console.log(`\n${p.at(-1)}: did not run`);
  }
}
for (const file of report.testResults) {
  const failed = file.assertionResults.filter((a) => a.status === 'failed');
  const skipped = file.assertionResults.filter((a) => a.status !== 'passed' && a.status !== 'failed');
  if (skipped.length > 0) {
    broken++;
    console.log(`\n${short(file.name)}: ${skipped.length} of ${file.assertionResults.length} not run (${skipped[0].status})`);
  }
  if (failed.length === 0 && file.status !== 'failed') continue;
  console.log(`\n${short(file.name)}: ${failed.length} of ${file.assertionResults.length} differ`);
  if (failed.length === 0) {
    broken++;
    console.log(`  ${(file.message ?? '').split('\n')[0]}`);
  }
  for (const a of failed) {
    differ++;
    const message = (a.failureMessages[0] ?? '').split('\n').find((l) => l.trim() !== '') ?? '';
    console.log(`  ${a.fullName}\n    ${message.slice(0, 300)}`);
  }
}
console.log(`\n${list}: ${differ} of ${report.numTotalTests} comparisons differ from the original${broken > 0 ? `; ${broken} files or groups compared nothing` : ''}`);
process.exitCode = differ > 0 || broken > 0 || report.numTotalTests === 0 ? 1 : 0;
