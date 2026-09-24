// Generates random engine operation scripts (seeded) for oracle/EngineOpsOracle.cs and
// test/engine/ops.oracle.test.ts.
//   node scripts/gen-engine-ops.mjs <out.json> [scripts] [opsPerScript] [seed]
import { writeFileSync } from 'node:fs';

const [out = 'test/engine-ops/ops.json', nScripts = '150', nOps = '60', seedArg = '777'] = process.argv.slice(2);
let seed = Number(seedArg);
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = () => Math.floor(rnd() * 1000);
const chance = (p) => rnd() < p;

// Small corpus files keep per-step serialization cheap; plus fresh documents of both versions.
const STARTS = ['new30', 'new30', 'new30', 'new215', 'new215', '12_MirrorObject.aml', '5_SUC.aml', '6_RCL.aml', '7_ICL.aml', '9_ExtInt_IntLink.aml', '13_Facet.aml', 'plant.aml', 'legacy-caex215.aml', '11_Constraints.aml', '3_IE_Attribute.aml'];
const NAMES = ['A', 'B', 'Pump', 'Tank', 'Motor', 'x', 'Name with space', 'a/b', 'a.b', 'a:b', 'Ä', '[x]', 'dup', 'dup'];
const DATA_TYPES = [null, 'xs:string', 'xs:double', 'xs:int', 'xs:boolean', 'xs:dateTime', 'xs:decimal', 'xs:float', 'xs:unsignedShort', 'xs:anyURI', 'xs:unknown'];
const VALUES = [null, '', '1', '1.5', '-0', '1e3', 'true', 'False', 'abc', '2026-09-24T12:00:00', '65536', ' 7 ', 'NaN'];

const OPS = [
  [4, () => ({ op: 'newIH', name: pick(NAMES) })],
  [3, () => ({ op: 'newLib', kind: pick(['suc', 'rc', 'ic', 'at']), name: pick(NAMES) })],
  [6, () => ({ op: 'newClass', kind: pick(['suc', 'rc', 'ic', 'at']), a: int(), name: pick(NAMES) })],
  [8, () => ({ op: 'newIE', a: int(), name: pick(NAMES) })],
  [6, () => ({ op: 'newAttr', a: int(), name: pick(NAMES) })],
  [5, () => ({ op: 'setAttr', a: int(), dataType: pick(DATA_TYPES), value: pick(VALUES) })],
  [3, () => {
    const type = pick(['double', 'int', 'bool', 'decimal', 'string']);
    const value = type === 'double' ? pick([0, 1.5, -2.25, 1e21, 3.14159]) : type === 'int' ? pick([0, 7, -3, 65535]) : type === 'bool' ? chance(0.5) : type === 'decimal' ? pick(['1.50', '-0.1', '12345678901234567890.5']) : pick(NAMES);
    return { op: 'setAttrTyped', a: int(), type, value };
  }],
  [2, () => ({ op: 'setUnit', a: int(), value: pick([null, 'm', 'kg', '°C']) })],
  [5, () => ({ op: 'newEI', a: int(), b: int(), name: pick(NAMES), withClass: chance(0.7) })],
  [3, () => ({ op: 'setBase', kind: pick(['suc', 'rc', 'ic']), a: int(), b: int() })],
  [4, () => ({ op: 'addRole', a: int(), b: int() })],
  [4, () => ({ op: 'instantiate', a: int(), b: int() })],
  [4, () => ({ op: 'link', a: int(), b: int(), name: pick(NAMES) })],
  [3, () => ({ op: 'remove', a: int(), relations: chance(0.5) })],
  [3, () => ({ op: 'copyIE', a: int(), b: int() })],
  [3, () => ({ op: 'rename', a: int(), name: pick(NAMES) })],
  [2, () => ({ op: 'describe', a: int(), value: pick([null, 'text', '']), version: pick([null, '1.0.0']) })],
  [2, () => ({ op: 'newGuid', a: int(), updateRefs: chance(0.5) })],
  [2, () => ({ op: 'mirror', a: int(), b: int() })],
  [2, () => ({ op: 'setRefBase', a: int(), b: int() })],
  [2, () => ({ op: 'move', a: int(), b: int() })],
  [6, () => ({ op: 'query', a: int() })],
];
const total = OPS.reduce((s, [w]) => s + w, 0);
function nextOp() {
  let r = rnd() * total;
  for (const [w, f] of OPS) {
    if ((r -= w) < 0) return f();
  }
  return OPS[0][1]();
}

const scripts = [];
for (let i = 0; i < Number(nScripts); i++) {
  const ops = [];
  for (let j = 0; j < Number(nOps); j++) ops.push(nextOp());
  scripts.push({ start: pick(STARTS), ops });
}
writeFileSync(out, JSON.stringify(scripts));
console.log(`${scripts.length} scripts -> ${out}`);
