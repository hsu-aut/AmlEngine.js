// Generates the test cases for the System layer (src/system) that oracle/SysOracle.cs evaluates
// with .NET and test/system/sys.oracle.test.ts evaluates with the TS port.
// Every module in scripts/sys-cases/ exports default (rng) => [{ fn, args }, ...]; each module
// gets its own seeded generator, so adding cases to one area leaves the others unchanged.
//   node scripts/gen-sys-cases.mjs [out.json] [module-name-filter]
import { readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const [out = 'test/system/cases.json', only] = process.argv.slice(2);

export function makeRng(seedText) {
  let seed = 0;
  for (const ch of seedText) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0;
  const next = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    range: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: (a) => a[Math.floor(next() * a.length)],
    /** uniformly random 64 bit pattern as 16 hex digits */
    hex64: () => Array.from({ length: 16 }, () => Math.floor(next() * 16).toString(16)).join(''),
    hex32: () => Array.from({ length: 8 }, () => Math.floor(next() * 16).toString(16)).join(''),
    /** random bigint in [lo, hi] */
    bigint: (lo, hi) => {
      const span = hi - lo + 1n;
      let r = 0n;
      for (let i = 0; i < 4; i++) r = (r << 32n) | BigInt(Math.floor(next() * 4294967296));
      return lo + (r % span);
    },
  };
}

const dir = new URL('./sys-cases/', import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith('.mjs')).sort();
const all = [];
for (const f of files) {
  const area = f.replace(/\.mjs$/, '');
  if (only && area !== only) continue;
  const mod = await import(new URL(f, dir).href);
  const cases = mod.default(makeRng(area));
  for (const c of cases) all.push({ area, fn: c.fn, args: c.args });
  console.log(`${area}: ${cases.length}`);
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(all));
console.log(`total: ${all.length} -> ${out}`);
