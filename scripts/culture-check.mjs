// Shows where Aml.Engine depends on the current culture. The port behaves as Aml.Engine under the
// invariant culture, which the oracle normally runs with. Here the oracle packages run with another
// current culture (ORACLE_CULTURE, oracle/Program.cs) into test/oracle-out-culture/<culture>, then
// the matching JS tests run against these outputs (ORACLE_OUT). Every comparison that fails is a
// result of the original under that culture that the port does not give; docs/deviations.md
// ("Current culture") lists them. Some failures come from the oracle's own formatting of numbers,
// not from Aml.Engine; the summary shows the first line of each failure to tell them apart.
//   node scripts/culture-check.mjs [culture=de-DE] [--tests-only]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const testsOnly = args.includes('--tests-only');
const culture = args.find((a) => !a.startsWith('--')) ?? 'de-DE';
const ORACLE = 'oracle/bin/Release/net8.0/Oracle.dll';
const corpus = readdirSync('test/corpus').filter((f) => f.endsWith('.aml')).sort().map((f) => join('test/corpus', f));

// oracle mode and arguments ('@' stands for the culture directory), then the JS test file
const PACKAGES = [
  ['sys', 'test/system/cases.json', '@/sys.json', 'test/system/sys.oracle.test.ts'],
  ['gapsinfra', 'test/gapsinfra/cases.json', '@/gapsinfra.json', 'test/engine/gapsinfra.oracle.test.ts'],
  ['values', 'test/values/cases.json', 'test/corpus', '@/values.json', 'test/engine/values.oracle.test.ts'],
  ['engineops', 'test/engine-ops/ops.json', 'test/corpus', '@/engineops.json', 'test/engine/ops.oracle.test.ts'],
  ['mutations', 'test/mutations/scripts.json', 'test/corpus', '@/mutations.json', 'test/engine/mutations.oracle.test.ts'],
  ['gapscaex', 'test/gapscaex', '@/gapscaex.json', 'test/engine/gapscaex.oracle.test.ts'],
  ['amlobjects', 'test/amlobjects', 'test/corpus', '@/amlobjects-work', '@/amlobjects', 'test/engine/amlobjects.oracle.test.ts'],
  ['dump', '@/dump', ...corpus, 'test/engine/dump.oracle.test.ts'],
];

if (!testsOnly) {
  execFileSync('dotnet', ['build', 'oracle', '-c', 'Release', '-nologo', '-v', 'q'], { stdio: 'ignore' });
  if (!existsSync(ORACLE)) throw new Error('oracle not built');
}
const dir = `test/oracle-out-culture/${culture}`;
mkdirSync(dir, { recursive: true });
if (!testsOnly) {
  for (const p of PACKAGES) {
    console.log(`${culture}: oracle ${p[0]}`);
    execFileSync('dotnet', [ORACLE, ...p.slice(0, -1).map((a) => a.replace('@', dir))], { stdio: 'ignore', env: { ...process.env, ORACLE_CULTURE: culture }, maxBuffer: 1 << 30 });
  }
}
console.log(`${culture}: tests`);
const results = join(dir, 'results.json');
spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...PACKAGES.map((p) => p.at(-1)), '--reporter=json', `--outputFile=${results}`], {
  stdio: 'ignore',
  env: { ...process.env, ORACLE_OUT: dir },
});
const report = JSON.parse(readFileSync(results, 'utf8'));
let differ = 0;
for (const file of report.testResults) {
  const failed = file.assertionResults.filter((a) => a.status === 'failed');
  if (failed.length === 0 && file.status !== 'failed') continue;
  console.log(`\n${file.name.replace(/\\/g, '/').replace(/^.*\/test\//, 'test/')}: ${failed.length} of ${file.assertionResults.length} differ`);
  if (failed.length === 0) console.log(`  ${(file.message ?? '').split('\n')[0]}`);
  for (const a of failed) {
    differ++;
    const message = (a.failureMessages[0] ?? '').split('\n').find((l) => l.trim() !== '') ?? '';
    console.log(`  ${a.fullName}\n    ${message.slice(0, 300)}`);
  }
}
console.log(`\n${culture}: ${differ} of ${report.numTotalTests} comparisons differ from the port`);
