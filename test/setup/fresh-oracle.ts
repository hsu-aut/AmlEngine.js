// Global test setup: some oracle outputs depend on the date of the oracle run (results relative
// to "today", DateTime.Now defaults). They are compared with the JS results of the same day only,
// so outputs from an earlier day are regenerated before the tests run. Needs the .NET 8 SDK;
// without it the outputs are left as they are.

import { execFileSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

const ORACLE = ['oracle/bin/Release/net8.0/Oracle.dll'];

const DATE_SENSITIVE: Array<{ output: string; args: string[] }> = [
  { output: 'test/oracle-out/sys.json', args: ['sys', 'test/system/cases.json', 'test/oracle-out/sys.json'] },
  { output: 'test/oracle-out/values.json', args: ['values', 'test/values/cases.json', 'test/corpus', 'test/oracle-out/values.json'] },
  { output: 'test/oracle-out/gapsinfra.json', args: ['gapsinfra', 'test/gapsinfra/cases.json', 'test/oracle-out/gapsinfra.json'] },
  { output: 'test/oracle-out/engineops.json', args: ['engineops', 'test/engine-ops/ops.json', 'test/corpus', 'test/oracle-out/engineops.json'] },
];

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export default function setup(): void {
  const today = new Date();
  const stale = DATE_SENSITIVE.filter((d) => existsSync(d.output) && !sameDay(statSync(d.output).mtime, today));
  if (stale.length === 0) return;
  try {
    execFileSync('dotnet', ['build', 'oracle', '-c', 'Release', '-nologo', '-v', 'q'], { stdio: 'ignore' });
    for (const d of stale) {
      execFileSync('dotnet', [...ORACLE, ...d.args], { stdio: 'ignore', maxBuffer: 1 << 30 });
    }
    console.log(`regenerated date dependent oracle outputs: ${stale.map((d) => d.output).join(', ')}`);
  } catch (e) {
    console.warn(`could not regenerate date dependent oracle outputs (${(e as Error).message}); their tests may fail`);
  }
}
