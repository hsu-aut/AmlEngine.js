// Generates random, well-formed XML documents that stress the parser and writer (seeded, reproducible).
//   node scripts/gen-xml-fuzz.mjs <outDir> [count] [seed]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const outDir = process.argv[2] ?? 'test/xml-fuzz';
const count = Number(process.argv[3] ?? 300);
let seed = Number(process.argv[4] ?? 20260924);

function rnd() {
  // mulberry32
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;

const NAMES = ['a', 'b', 'Item', 'InternalElement', 'Attribute', 'x-y', 'n.m', '_u', 'Ä', 'data'];
const URIS = ['urn:a', 'urn:b', 'http://www.dke.de/CAEX', 'http://example.org/x'];
const PREFIXES = ['p', 'q', 'xsi', 'ns1'];
const TEXTS = ['text', ' ', '  ', '\n', '\r\n', '\t', 'a & b', '<tag>', '"quoted"', "it's", ']]>', 'ÄÖÜ ß', '€', '😀', 'x\ny', '  lead', 'trail  ', '-', '--'];
const ATTRS = ['v', 'Name', 'ID', 'x', 'y-z'];
const AVALUES = ['1', '', ' ', 'a b', 'tab\there', 'nl\nx', 'cr\r\nx', '&amp;', '&lt;&gt;', '&quot;', "'", '&#9;', '&#10;', '&#13;', '&#x20;', 'Ä€😀', '{guid}'];
const TREFS = ['&amp;', '&lt;', '&gt;', '&#32;', '&#x9;', '&#10;', '&#xD;', '&#x20AC;', '&apos;', '&quot;'];

function escAttr(v) {
  // values may contain entity text already; raw quotes/lt must not appear
  return v.replace(/"/g, '&quot;').replace(/<(?![^&]*;)/g, '&lt;');
}

function escText(t) {
  return t.replace(/&(?!(amp|lt|gt|apos|quot|#\d+|#x[0-9A-Fa-f]+);)/g, '&amp;').replace(/</g, '&lt;').replace(/]]>/g, ']]&gt;');
}

function element(depth, scope) {
  const ns = [];
  let declared = [...scope];
  if (chance(0.25)) {
    const uri = pick(URIS);
    ns.push(`xmlns="${uri}"`);
    declared = declared.filter((d) => d.p !== '').concat({ p: '', u: uri });
  }
  if (chance(0.2)) {
    const p = pick(PREFIXES);
    const uri = pick(URIS);
    ns.push(`xmlns:${p}="${uri}"`);
    declared = declared.filter((d) => d.p !== p).concat({ p, u: uri });
  }
  const prefixed = declared.filter((d) => d.p !== '');
  const prefix = prefixed.length && chance(0.25) ? pick(prefixed).p + ':' : '';
  const name = prefix + pick(NAMES);
  const attrs = [];
  const used = new Set();
  const nAttr = Math.floor(rnd() * 4);
  for (let i = 0; i < nAttr; i++) {
    const ap = prefixed.length && chance(0.2) ? pick(prefixed).p + ':' : '';
    const an = ap + pick(ATTRS);
    const key = an.includes(':') ? declared.find((d) => d.p === an.split(':')[0]).u + an.split(':')[1] : an;
    if (used.has(key)) continue;
    used.add(key);
    attrs.push(`${an}=${chance(0.2) ? `'${pick(AVALUES).replace(/'/g, '&apos;')}'` : `"${escAttr(pick(AVALUES))}"`}`);
  }
  if (chance(0.08)) attrs.push(`xml:space="${pick(['preserve', 'default'])}"`);
  const all = [...(chance(0.5) ? ns.concat(attrs) : attrs.concat(ns))];
  const sep = () => (chance(0.1) ? '\n    ' : ' ');
  const open = `<${name}${all.map((a) => sep() + a).join('')}`;
  if (depth > 4 || chance(0.25)) return open + (chance(0.3) ? ' />' : '/>');
  if (chance(0.1)) return open + `></${name}>`;
  let body = '';
  const n = Math.floor(rnd() * 5);
  const indent = chance(0.5);
  for (let i = 0; i < n; i++) {
    if (indent) body += '\n' + '  '.repeat(depth + 1);
    const r = rnd();
    if (r < 0.5) body += element(depth + 1, declared);
    else if (r < 0.7) body += escText(pick(TEXTS)) + (chance(0.3) ? pick(TREFS) : '');
    else if (r < 0.78) body += `<![CDATA[${pick(TEXTS).replace(/]]>/g, ']]')}]]>`;
    else if (r < 0.86) body += `<!--${pick(['c', ' c ', 'multi\nline', '- x'])}-->`;
    else if (r < 0.92) body += `<?pi${pick(['', ' data', ' a ? b', '  x'])}?>`;
    else body += pick(TREFS);
  }
  if (indent && n) body += '\n' + '  '.repeat(depth);
  return `${open}>${body}</${name}>`;
}

mkdirSync(outDir, { recursive: true });
for (let i = 0; i < count; i++) {
  let doc = '';
  if (chance(0.7)) doc += `<?xml version="1.0"${chance(0.7) ? ` encoding="${pick(['utf-8', 'UTF-8'])}"` : ''}${chance(0.1) ? ' standalone="yes"' : ''}?>`;
  if (chance(0.6)) doc += pick(['\n', '\r\n', '\n\n', '']);
  if (chance(0.15)) doc += '<!-- head -->\n';
  doc += element(0, []);
  if (chance(0.5)) doc += pick(['\n', '\r\n', '\n<!-- tail -->\n']);
  writeFileSync(join(outDir, `fuzz${String(i).padStart(4, '0')}.xml`), doc);
}
console.log(`${count} documents in ${outDir}`);
