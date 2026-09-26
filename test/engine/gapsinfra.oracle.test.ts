// Coverage gap package "gapsinfra": the .NET substitutes in src/xml and src/system (XLinq API,
// XML encodings, System.Linq, System value type members) against .NET. Cases from
// scripts/gen-gapsinfra.mjs (test/gapsinfra/cases.json), expected results from
// oracle/GapsInfraOracle.cs (test/oracle-out/gapsinfra.json). Representations: see the header of
// the oracle. GAPS_ALL=1 lists every mismatch.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { knownDeviation, run, type Case, type Result } from './gapsinfra-eval.js';

const casesFile = join(__dirname, '..', 'gapsinfra', 'cases.json');
const oracleFile = join(__dirname, '..', 'oracle-out', 'gapsinfra.json');

describe.skipIf(!existsSync(casesFile) || !existsSync(oracleFile))('gapsinfra: src/xml and src/system against .NET', () => {
  const cases: Case[] = JSON.parse(readFileSync(casesFile, 'utf8'));
  const expected: Result[] = JSON.parse(readFileSync(oracleFile, 'utf8'));

  it('oracle output belongs to the cases', () => {
    expect(expected.length).toBe(cases.length);
  });

  for (const area of [...new Set(cases.map((c) => c.area))]) {
    it(area, () => {
      const mismatches: string[] = [];
      let n = 0;
      cases.forEach((c, i) => {
        if (c.area !== area) return;
        n++;
        const got = run(c);
        if (JSON.stringify(got) === JSON.stringify(expected[i])) return;
        if (knownDeviation(c, got, expected[i])) return;
        const exp = expected[i];
        if (c.fn === 'x.script' && 'ok' in got && 'ok' in exp) {
          const g = got.ok.split('\n');
          const e = exp.ok.split('\n');
          const k = e.findIndex((l, m) => l !== g[m]);
          const steps = c.args[2] as unknown[];
          mismatches.push(`#${i} x.script ${JSON.stringify(c.args[0])} preserve=${c.args[1]} step ${k} ${JSON.stringify(steps[k] ?? 'final')}\n    .NET: ${JSON.stringify(e[k])}\n    TS:   ${JSON.stringify(g[k])}`);
          return;
        }
        mismatches.push(`#${i} ${c.fn} ${JSON.stringify(c.args).slice(0, 300)}\n    .NET: ${JSON.stringify(expected[i])}\n    TS:   ${JSON.stringify(got)}`);
      });
      expect(n).toBeGreaterThan(0);
      expect(mismatches.slice(0, process.env.GAPS_ALL ? undefined : 30).join('\n'), `${mismatches.length} of ${n} cases differ`).toBe('');
    });
  }
});
