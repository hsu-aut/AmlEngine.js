// Generates random XLinq operation scripts (seeded). Targets are indices into the list of
// elements in document order, resolved modulo the list length at execution time, so .NET and
// JS pick the same nodes as long as their trees are equal.
//   node scripts/gen-xops.mjs <out.json> [scripts] [opsPerScript] [seed]
import { writeFileSync } from 'node:fs';

const [out = 'test/xml-ops/xops.json', nScripts = '200', nOps = '40', seedArg = '4242'] = process.argv.slice(2);
let seed = Number(seedArg);
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (n) => Math.floor(rnd() * n);

const NAMES = ['a', 'b', 'c', 'Item', '{urn:x}n', '{urn:x}m', '{http://www.dke.de/CAEX}InternalElement'];
const TEXTS = ['', 'x', ' ', '\n  ', 'a&b', '<t>', 'ÄÖ', 'line1\nline2', ']]>'];
const ATTRS = ['v', 'Name', 'ID', '{urn:x}q', '{http://www.w3.org/2001/XMLSchema-instance}type'];
const SEEDS = [
  '<r/>',
  '<r></r>',
  '<r>text</r>',
  '<r>\n  <a x="1"/>\n  <b>t</b>\n</r>',
  '<r xmlns="urn:x"><n/><m>v</m></r>',
  '<r><a><b><c/></b></a><a/>tail</r>',
];

const OPS = [
  () => ({ op: 'add', k: int(99), name: pick(NAMES), text: rnd() < 0.3 ? pick(TEXTS) : null }),
  () => ({ op: 'addFirst', k: int(99), name: pick(NAMES) }),
  () => ({ op: 'addAfterSelf', k: int(99), name: pick(NAMES) }),
  () => ({ op: 'addBeforeSelf', k: int(99), name: pick(NAMES) }),
  () => ({ op: 'addText', k: int(99), text: pick(TEXTS) }),
  () => ({ op: 'addFirstText', k: int(99), text: pick(TEXTS) }),
  () => ({ op: 'addAfterSelfText', k: int(99), text: pick(TEXTS) }),
  () => ({ op: 'setValue', k: int(99), text: pick(TEXTS) }),
  () => ({ op: 'setAttr', k: int(99), name: pick(ATTRS), value: rnd() < 0.25 ? null : pick(TEXTS) }),
  () => ({ op: 'setElementValue', k: int(99), name: pick(NAMES), value: rnd() < 0.25 ? null : pick(TEXTS) }),
  () => ({ op: 'remove', k: int(99) }),
  () => ({ op: 'removeNodes', k: int(99) }),
  () => ({ op: 'removeAttributes', k: int(99) }),
  () => ({ op: 'replaceWith', k: int(99), name: pick(NAMES) }),
  () => ({ op: 'addExisting', k: int(99), j: int(99) }),
  () => ({ op: 'addCData', k: int(99), text: pick(TEXTS) }),
  () => ({ op: 'addComment', k: int(99), text: pick(['c', ' c ', 'x-y']) }),
  () => ({ op: 'rename', k: int(99), name: pick(NAMES) }),
  () => ({ op: 'removeEverySecondChild', k: int(99) }),
  () => ({ op: 'appendWhileIterating', k: int(99) }),
  () => ({ op: 'replaceAll', k: int(99), name: pick(NAMES), text: pick(TEXTS) }),
  () => ({ op: 'moveFirstChildToEnd', k: int(99) }),
  () => ({ op: 'removeLastNode', k: int(99) }),
];

const scripts = [];
for (let i = 0; i < Number(nScripts); i++) {
  const ops = [];
  for (let j = 0; j < Number(nOps); j++) ops.push(pick(OPS)());
  scripts.push({ xml: pick(SEEDS), preserve: rnd() < 0.5, ops });
}
writeFileSync(out, JSON.stringify(scripts, null, 0));
console.log(`${scripts.length} scripts -> ${out}`);
