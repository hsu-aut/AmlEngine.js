// Checks the port in other time zones. The oracle packages whose results depend on local time run
// with Aml.Engine on Windows in the given zone (ORACLE_TZ, oracle/LocalTimeZone.cs) into
// test/oracle-out-tz/<zone>; then the matching JS tests run with TZ set to the same zone and
// ORACLE_OUT pointing there. The machine's own time zone stays as it is.
// (.NET on Linux is no reference: it writes LF line ends and treats backslashes in file URIs
// differently, so nearly every saved output differs; see docs/deviations.md.)
//   node scripts/tz-check.mjs [zones=UTC,America/New_York,Asia/Kolkata] [--tests-only]
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const testsOnly = args.includes('--tests-only');
const zones = (args.find((a) => !a.startsWith('--')) ?? 'UTC,America/New_York,Asia/Kolkata').split(',');
const ORACLE = 'oracle/bin/Release/net8.0/Oracle.dll';

// oracle mode and arguments ('@' stands for the zone directory), then the JS test file
const PACKAGES = [
  ['sys', 'test/system/cases.json', '@/sys.json', 'test/system/sys.oracle.test.ts'],
  ['gapsinfra', 'test/gapsinfra/cases.json', '@/gapsinfra.json', 'test/engine/gapsinfra.oracle.test.ts'],
  ['values', 'test/values/cases.json', 'test/corpus', '@/values.json', 'test/engine/values.oracle.test.ts'],
  ['engineops', 'test/engine-ops/ops.json', 'test/corpus', '@/engineops.json', 'test/engine/ops.oracle.test.ts'],
  ['mutations', 'test/mutations/scripts.json', 'test/corpus', '@/mutations.json', 'test/engine/mutations.oracle.test.ts'],
  ['gapscaex', 'test/gapscaex', '@/gapscaex.json', 'test/engine/gapscaex.oracle.test.ts'],
  ['amlobjects', 'test/amlobjects', 'test/corpus', '@/amlobjects-work', '@/amlobjects', 'test/engine/amlobjects.oracle.test.ts'],
];

if (!testsOnly) {
  execFileSync('dotnet', ['build', 'oracle', '-c', 'Release', '-nologo', '-v', 'q'], { stdio: 'ignore' });
  if (!existsSync(ORACLE)) throw new Error('oracle not built');
}
const failed = [];
for (const zone of zones) {
  const dir = `test/oracle-out-tz/${zone.replace(/\//g, '_')}`;
  mkdirSync(dir, { recursive: true });
  if (!testsOnly) {
    console.log(`${zone}: oracle`);
    for (const p of PACKAGES) {
      execFileSync('dotnet', [ORACLE, ...p.slice(0, -1).map((a) => a.replace('@', dir))], { stdio: 'ignore', env: { ...process.env, ORACLE_TZ: zone }, maxBuffer: 1 << 30 });
    }
  }
  console.log(`${zone}: tests`);
  const r = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', ...PACKAGES.map((p) => p.at(-1))], {
    stdio: 'inherit',
    env: { ...process.env, TZ: zone, ORACLE_OUT: dir },
  });
  if (r.status !== 0) failed.push(zone);
}
if (failed.length) {
  console.log(`time zone check FAILED in ${failed.join(', ')}`);
  process.exit(1);
}
console.log(`time zone check passed: ${zones.join(', ')}`);
