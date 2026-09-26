// Compares the Aml.Engine version the oracle runs (oracle/Oracle.csproj) with the newest version on
// NuGet. A newer version may change behaviour the port reproduces, including fixes of the bugs
// listed in docs/port-notes; docs/upgrading-aml-engine.md describes what to do then.
//   node scripts/check-upstream.mjs          prints the result, exit code 1 if a newer version exists
// Also run by the test setup (test/setup/fresh-oracle.ts), which only warns.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The Aml.Engine version of the oracle project. */
export function oracleVersion() {
  const csproj = readFileSync(join(repo, 'oracle', 'Oracle.csproj'), 'utf8');
  const m = /<PackageReference\s+Include="Aml\.Engine"\s+Version="([^"]+)"/.exec(csproj);
  if (!m) throw new Error('no Aml.Engine PackageReference in oracle/Oracle.csproj');
  return m[1];
}

function compare(a, b) {
  const pa = a.split(/[.-]/);
  const pb = b.split(/[.-]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? '0';
    const y = pb[i] ?? '0';
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isNaN(nx) && !Number.isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

/**
 * The released versions on NuGet newer than the oracle's (pre-releases left out), or null when
 * NuGet cannot be reached within `timeoutMs`.
 */
export async function newerVersions(timeoutMs = 5000) {
  const current = oracleVersion();
  try {
    const res = await fetch('https://api.nuget.org/v3-flatcontainer/aml.engine/index.json', { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const { versions } = await res.json();
    return { current, newer: versions.filter((v) => !v.includes('-') && compare(v, current) > 0) };
  } catch {
    return null;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = await newerVersions();
  if (r === null) {
    console.log(`Aml.Engine ${oracleVersion()} in the oracle; NuGet not reachable, no comparison.`);
  } else if (r.newer.length === 0) {
    console.log(`Aml.Engine ${r.current} in the oracle is the newest release.`);
  } else {
    console.log(`Aml.Engine ${r.current} in the oracle; newer on NuGet: ${r.newer.join(', ')}. See docs/upgrading-aml-engine.md.`);
    process.exitCode = 1;
  }
}
