// Oracle parity of ExternalReferenceResolver, GitHubAccessService and GitHubReferenceResolver
// (Aml.Engine.Services 4.3.1) and of Uri.GetComponents. The scripted cases of
// test/services/extref/cases.json (scripts/gen-services-extref.mjs) run step by step with the port
// (extref-run.ts) and are compared with the lines of oracle/ServicesExtRefOracle.cs. A step with a
// "port" line is a documented deviation (synchronous calls that would need the network, fetch
// instead of HttpClient): the port must give exactly that line. The web server
// test/services/extref-server.mjs runs in this process.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Uri, UriKind } from '../../src/system/Uri.js';
import { oracleOut } from '../setup/oracle-out.js';
import { startExtRefServer } from './extref-server.mjs';
import { casesDir, ex, expectedLines, runCase, type Step } from './extref-run.js';

const expectedFile = join(oracleOut, 'services', 'extref.json');
const expectedUri = join(oracleOut, 'services', 'extref-uri.json');

// ---------------------------------------------------------------- tests

const cases: Record<string, Step[]> = JSON.parse(readFileSync(join(casesDir, 'cases.json'), 'utf8'));

describe.skipIf(!existsSync(expectedFile))('ExternalReferenceResolver and GitHub services against the oracle', () => {
  const oracle: Record<string, string[]> = existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, 'utf8')) : {};
  let server: { close: () => Promise<void> } | null = null;

  beforeAll(async () => {
    server = await startExtRefServer(casesDir);
  });
  afterAll(async () => {
    await server?.close();
  });

  for (const [name, steps] of Object.entries(cases)) {
    it(name, async () => {
      const { lines, stale } = expectedLines(steps, oracle[name]!);
      expect({ lines: await runCase(steps), stale }).toEqual({ lines, stale: [] });
    });
  }
});

// NormalizedHost (IdnMapping) is not ported (src/system/Uri.ts): the port throws for every mask
// with that bit and a valid format (documented in docs/coverage-notes/services-extref.md).
const normalizedHostNotPorted = '!NotSupportedException: UriComponents.NormalizedHost is not ported.';

describe.skipIf(!existsSync(expectedUri))('Uri.getComponents against .NET', () => {
  const oracle: Record<string, string[]> = existsSync(expectedUri) ? JSON.parse(readFileSync(expectedUri, 'utf8')) : {};
  const spec = JSON.parse(readFileSync(join(casesDir, 'uris.json'), 'utf8')) as { uris: string[]; masks: number[]; formats: number[] };
  it('every URI, component mask and format', () => {
    const differences: string[] = [];
    spec.uris.forEach((s, i) => {
      const key = i + ':' + s;
      const expected = oracle[key]!;
      const lines: string[] = [];
      let uri: Uri | null = null;
      try {
        uri = new Uri(s, UriKind.RelativeOrAbsolute);
        lines.push('ctor=' + (uri.isAbsoluteUri ? 'abs' : 'rel'));
      } catch (e) {
        lines.push('ctor=' + ex(e));
      }
      if (uri !== null) {
        for (const mask of spec.masks) {
          for (const format of spec.formats) {
            let r: string;
            try {
              r = uri.getComponents(mask, format);
            } catch (e) {
              r = ex(e);
            }
            const line = `${mask.toString(16)}|${format}=${r}`;
            const k = lines.length;
            const documented = uri.isAbsoluteUri && (mask & 0x100) !== 0 && format >= 1 && format <= 3;
            if (documented) {
              lines.push(expected[k]!);
              if (line !== `${mask.toString(16)}|${format}=${normalizedHostNotPorted}`) differences.push(key + ' ' + line + ' (expected the NormalizedHost exception)');
              continue;
            }
            lines.push(line);
          }
        }
      }
      lines.forEach((l, k) => {
        if (l !== expected[k]) differences.push(key + ' ' + l + ' <> ' + expected[k]);
      });
      if (lines.length !== expected.length) differences.push(key + ` ${lines.length} lines <> ${expected.length}`);
    });
    expect({ count: differences.length, first: differences.slice(0, 40) }).toEqual({ count: 0, first: [] });
  });
});
