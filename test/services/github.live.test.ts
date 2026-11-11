// GitHub access of the port against the original, live (needs the internet; GitHub allows 60
// unauthenticated API requests per hour, a run makes about ten). Runs only with AMLENGINE_LIVE=1
// and the oracle output of `ORACLE_LIVE=1 ... svc-extref` (test/oracle-out/services/extref-live.json):
// public raw and blob URLs of github.com/AutomationML/AML-UA-XSLT, a missing file, a repository that
// is not registered, GitHubFileExists, LoadOrGetReferencedDocumentAsync of the GitHub service and
// of the resolver, GetResponseFromGitServerAsync. The cases: test/services/extref/live.json.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { oracleOut } from '../setup/oracle-out.js';
import { casesDir, expectedLines, runCase, type Step } from './extref-run.js';

const expectedFile = join(oracleOut, 'services', 'extref-live.json');
const live = process.env.AMLENGINE_LIVE === '1';

describe.skipIf(!live || !existsSync(expectedFile))('GitHub access, live, against the oracle', () => {
  const cases: Record<string, Step[]> = JSON.parse(readFileSync(join(casesDir, 'live.json'), 'utf8'));
  const oracle: Record<string, string[]> = existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, 'utf8')) : {};
  for (const [name, steps] of Object.entries(cases)) {
    it(name, async () => {
      const { lines, stale } = expectedLines(steps, oracle[name]!);
      expect({ lines: await runCase(steps), stale }).toEqual({ lines, stale: [] });
    });
  }
});
