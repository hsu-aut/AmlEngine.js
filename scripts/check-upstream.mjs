// Compares the versions of Aml.Engine, Aml.Engine.Services and Aml.Engine.Resources the oracle runs
// (oracle/Oracle.csproj) with the newest versions on NuGet. A newer version may change behaviour
// the port reproduces, including fixes of the bugs listed in docs/port-notes;
// docs/upgrading-aml-engine.md describes what to do then.
//   node scripts/check-upstream.mjs          prints the result, exit code 1 if a newer version exists
// Also run by the test setup (test/setup/fresh-oracle.ts), which only warns.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The packages the port reproduces. */
export const PACKAGES = ['Aml.Engine', 'Aml.Engine.Services', 'Aml.Engine.Resources'];

/** The version of a package in the oracle project. */
export function oracleVersion(id = 'Aml.Engine') {
  const csproj = readFileSync(join(repo, 'oracle', 'Oracle.csproj'), 'utf8');
  const name = id.replace(/\./g, '\\.');
  const m = new RegExp(`<PackageReference\\s+Include="${name}"\\s+Version="([^"]+)"`).exec(csproj);
  if (!m) throw new Error(`no ${id} PackageReference in oracle/Oracle.csproj`);
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
 * Per package the released versions on NuGet newer than the oracle's (pre-releases left out), or
 * null when NuGet cannot be reached within `timeoutMs`.
 */
export async function newerVersions(timeoutMs = 5000) {
  try {
    return await Promise.all(
      PACKAGES.map(async (id) => {
        const current = oracleVersion(id);
        const res = await fetch(`https://api.nuget.org/v3-flatcontainer/${id.toLowerCase()}/index.json`, { signal: AbortSignal.timeout(timeoutMs) });
        if (!res.ok) throw new Error(`NuGet ${res.status}`);
        const { versions } = await res.json();
        return { id, current, newer: versions.filter((v) => !v.includes('-') && compare(v, current) > 0) };
      }),
    );
  } catch {
    return null;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = await newerVersions();
  if (r === null) {
    console.log(`${PACKAGES.map((id) => `${id} ${oracleVersion(id)}`).join(', ')} in the oracle; NuGet not reachable, no comparison.`);
  } else {
    for (const p of r) {
      if (p.newer.length === 0) console.log(`${p.id} ${p.current} in the oracle is the newest release.`);
      else console.log(`${p.id} ${p.current} in the oracle; newer on NuGet: ${p.newer.join(', ')}. See docs/upgrading-aml-engine.md.`);
    }
    if (r.some((p) => p.newer.length > 0)) process.exitCode = 1;
  }
}
