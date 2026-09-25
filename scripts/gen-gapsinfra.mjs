// Generates the "gapsinfra" cases: the .NET substitutes of src/xml and src/system that the other
// oracles do not reach (XLinq navigation and mutation API, encodings of the XML reader and
// writer, System.Linq operators, a few System value type members). oracle/GapsInfraOracle.cs
// evaluates them with .NET, test/engine/gapsinfra.oracle.test.ts with the port.
//   node scripts/gen-gapsinfra.mjs [out.json] [randomScripts] [seed]
// Case: { area, fn, args }. See the header of oracle/GapsInfraOracle.cs for the functions.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [out = 'test/gapsinfra/cases.json', nRandom = '250', seedArg = '3682'] = process.argv.slice(2);
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

const cases = [];
const add = (area, fn, ...args) => cases.push({ area, fn, args });

// ================================================================================ XLinq scripts
// A script parses `xml` (null: new XDocument()) and runs steps { op, t, ... } on targets:
// "d" document, "r" root, "e<i>" i-th element of doc.Descendants(), "n<i>" i-th node of
// doc.DescendantNodes(), "a<i>.<j>" j-th attribute of element i (indices modulo the count),
// "$<k>" a node saved with { op: "save", k }. Content items (c, v): string, null, array,
// { e, c } element, { a, v } attribute, { tx } XText, { cd } XCData, { cm } comment,
// { pi: [target, data] }, { dtd: [name, publicId, systemId, subset] }, { ref: target },
// { num: "1.5" } double, { int: 5 }, { bool: true }, { dec: "1.50" } decimal, { doc: true }.

const DOCS = [
  '<r/>',
  '<r a="1" b="2" c="3"/>',
  '<r>text</r>',
  '<r>\n  <a x="1"/>\n  <b>t</b>\n</r>',
  '<r xmlns="urn:x"><n/><m>v</m></r>',
  '<r><a><b><c/></b></a><a/>tail</r>',
  '<?xml version="1.0" encoding="utf-8" standalone="yes"?><!--c1--><?pi data?><r xmlns:p="urn:p" p:q="1"><p:s>1<![CDATA[x<y]]>2<!--c2--></p:s><?t d?><e/></r><!--c3-->',
  '<!DOCTYPE r [<!ENTITY e "v">]><r>&e;</r>',
  '<!DOCTYPE r PUBLIC "-//X//DTD r//EN" "r.dtd"><r/>',
  '<!DOCTYPE r SYSTEM "r.dtd"><r a="x"/>',
  '<r xmlns="urn:d" xmlns:a="urn:a" xmlns:b="urn:a"><a:c xmlns="" x="1" a:y="2"><d xmlns:a="urn:other" a:z="3"/></a:c></r>',
  '<r xml:lang="en" xml:space="preserve"> <a> </a> </r>',
  '<p:r xmlns:p="urn:p"><p:a xmlns:p="urn:q"><p:b/></p:a><c xmlns="urn:p"/></p:r>',
  '<r><a>1</a><b>2</b><a>3</a><c><a>4</a></c></r>',
];
const NAMES = ['a', 'b', 'c', 'x', 'q', '{urn:x}n', '{urn:p}s', '{urn:a}c', '{urn:d}r', '{http://www.w3.org/XML/1998/namespace}lang', 'xmlns', '{http://www.w3.org/2000/xmlns/}p'];
const PREFIXES = ['p', 'a', 'b', 'xml', 'xmlns', 'none', ''];
const NSS = ['urn:x', 'urn:p', 'urn:a', 'urn:d', 'urn:q', 'urn:other', '', 'http://www.w3.org/XML/1998/namespace', 'http://www.w3.org/2000/xmlns/'];
const TEXTS = ['', 'x', ' ', '\n  ', 'a&b', '<t>', 'ÄÖ', 'line1\r\nline2', ']]>', '--', 'q"\'', '\t'];

const target = () => pick(['d', 'r', `e${int(9)}`, `e${int(9)}`, `n${int(14)}`, `n${int(14)}`, `a${int(6)}.${int(3)}`, '$0', '$1']);
function contentItem(depth = 0) {
  switch (int(depth > 1 ? 12 : 15)) {
    case 0: case 1: case 2: return pick(TEXTS);
    case 3: return null;
    case 4: return { a: pick(NAMES), v: pick(['v', '1', '', 'a<b"c']) };
    case 5: return { tx: pick(TEXTS) };
    case 6: return { cd: pick(['x', ']]>', 'a]]b']) };
    case 7: return { cm: pick(['c', 'a--b', 'end-']) };
    case 8: return { pi: [pick(['t', 'x-y']), pick(['', 'd', 'a?>b'])] };
    case 9: return { ref: target() };
    case 10: return pick([{ num: pick(['1.5', '0.1', '1e21', 'NaN', 'Infinity', '-0', '123456789012']) }, { int: pick([0, -5, 42]) }, { bool: rnd() < 0.5 }, { dec: pick(['1.50', '-0.0', '79228162514264337593543950335']) }]);
    case 11: return { dtd: ['r', null, null, null] };
    case 12: return { e: pick(NAMES), c: [contentItem(depth + 1)] };
    case 13: return [contentItem(depth + 1), contentItem(depth + 1)];
    default: return { e: pick(NAMES), c: [contentItem(depth + 1), contentItem(depth + 1)] };
  }
}
const contents = () => Array.from({ length: 1 + int(3) }, () => contentItem());
const maybeName = () => (rnd() < 0.5 ? pick(NAMES) : null);

const READS = [
  'desc', 'str', 'strd', 'nodeType', 'parent', 'document', 'next', 'prev', 'firstNode', 'lastNode',
  'nodesAfter', 'nodesBefore', 'elementsAfter', 'elementsBefore', 'ancestors', 'ancestorsAndSelf',
  'descNodes', 'descNodesAndSelf', 'descendants', 'descendantsAndSelf', 'elements', 'element', 'nodes',
  'attributes', 'attribute', 'firstAttr', 'lastAttr', 'nextAttr', 'prevAttr', 'hasAttrs', 'hasElems',
  'isEmpty', 'value', 'defNs', 'nsOf', 'prefixOf', 'isNsDecl', 'decl', 'doctype', 'root', 'clone', 'nameStr',
];
const WRITES = [
  'setValue', 'setValueProp', 'setAttr', 'setElem', 'add', 'addFirst', 'addBefore', 'addAfter', 'replaceWith',
  'replaceNodes', 'replaceAttributes', 'replaceAll', 'remove', 'removeAll', 'removeNodes', 'removeAttributes',
  'rename', 'setDecl', 'save',
];
function step(op) {
  const s = { op, t: target() };
  switch (op) {
    case 'elementsAfter': case 'elementsBefore': case 'ancestors': case 'ancestorsAndSelf': case 'descendants':
    case 'descendantsAndSelf': case 'elements': case 'attributes':
      s.name = maybeName();
      break;
    case 'element': case 'attribute': case 'rename':
      s.name = pick(NAMES);
      break;
    case 'nsOf': s.v = pick(PREFIXES); break;
    case 'prefixOf': s.v = pick(NSS); break;
    case 'setValue': s.v = contentItem(2); break;
    case 'setValueProp': s.v = rnd() < 0.15 ? null : pick(TEXTS); break;
    case 'setAttr': case 'setElem': s.name = pick(NAMES); s.v = rnd() < 0.3 ? null : pick(TEXTS); break;
    case 'add': case 'addFirst': case 'addBefore': case 'addAfter': case 'replaceWith': case 'replaceNodes':
    case 'replaceAttributes': case 'replaceAll':
      s.c = contents();
      break;
    case 'setDecl': s.v = [pick(['1.0', null]), pick(['utf-8', 'utf-16', null]), pick(['yes', null])]; break;
    case 'save': s.k = int(2); break;
  }
  return s;
}

// Curated scripts: every member at least once on every node kind.
const allTargets = ['d', 'r', 'e0', 'e1', 'e2', 'e3', 'e4', 'n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8', 'a0.0', 'a0.1', 'a1.0', 'a2.0'];
for (const xml of DOCS) {
  for (const preserve of [false, true]) {
    const steps = [];
    for (const t of allTargets) for (const op of READS) steps.push({ ...step(op), t });
    add('xlinq', 'x.script', xml, preserve, steps);
  }
  // Names and namespaces explicitly on each element.
  const steps = [];
  for (let i = 0; i < 6; i++) {
    for (const p of PREFIXES) steps.push({ op: 'nsOf', t: `e${i}`, v: p });
    for (const ns of NSS) steps.push({ op: 'prefixOf', t: `e${i}`, v: ns });
    for (const n of NAMES) steps.push({ op: 'elementsAfter', t: `n${i}`, name: n }, { op: 'elementsBefore', t: `n${i}`, name: n }, { op: 'ancestors', t: `n${i}`, name: n });
  }
  add('xlinq', 'x.script', xml, false, steps);
}
// Mutations on detached nodes, replace variants, validation of document content.
add('xlinq', 'x.script', '<r><a/><b/><c/></r>', false, [
  { op: 'save', t: 'e1', k: 0 }, { op: 'remove', t: '$0' }, { op: 'parent', t: '$0' }, { op: 'document', t: '$0' },
  { op: 'next', t: '$0' }, { op: 'prev', t: '$0' }, { op: 'nodesAfter', t: '$0' }, { op: 'nodesBefore', t: '$0' },
  { op: 'elementsBefore', t: '$0', name: null }, { op: 'remove', t: '$0' }, { op: 'replaceWith', t: '$0', c: ['x'] },
  { op: 'addAfter', t: '$0', c: ['x'] }, { op: 'addBefore', t: '$0', c: ['x'] }, { op: 'add', t: '$0', c: [{ ref: 'e2' }] }, { op: 'strd', t: '$0' },
  { op: 'replaceWith', t: 'e1', c: [{ ref: 'e1' }, 'mid', { ref: 'r' }] }, { op: 'strd', t: 'd' },
  { op: 'replaceWith', t: 'e0', c: [] }, { op: 'replaceWith', t: 'e0', c: [null] }, { op: 'replaceWith', t: 'e0', c: [{ a: 'x', v: '1' }] },
  { op: 'replaceWith', t: 'r', c: [{ e: 'n', c: [] }] }, { op: 'replaceWith', t: 'r', c: ['text'] }, { op: 'replaceWith', t: 'r', c: [{ e: 'a' }, { e: 'b' }] },
]);
add('xlinq', 'x.script', null, false, [
  { op: 'add', t: 'd', c: [' '] }, { op: 'add', t: 'd', c: ['x'] }, { op: 'add', t: 'd', c: [{ cm: 'c' }] }, { op: 'add', t: 'd', c: [{ dtd: ['r', null, 'r.dtd', null] }] },
  { op: 'add', t: 'd', c: [{ e: 'r' }] }, { op: 'add', t: 'd', c: [{ e: 'r2' }] }, { op: 'add', t: 'd', c: [{ dtd: ['r', null, null, null] }] },
  { op: 'addFirst', t: 'd', c: [{ dtd: ['r', null, null, null] }] }, { op: 'add', t: 'd', c: [{ cd: 'x' }] }, { op: 'add', t: 'd', c: [{ tx: '  ' }] },
  { op: 'add', t: 'd', c: [{ tx: 'y' }] }, { op: 'add', t: 'd', c: [{ a: 'x', v: '1' }] }, { op: 'add', t: 'd', c: [{ doc: true }] }, { op: 'add', t: 'r', c: [{ doc: true }] },
  { op: 'add', t: 'r', c: [{ dtd: ['r', null, null, null] }] }, { op: 'add', t: 'r', c: [{ ref: 'd' }] }, { op: 'add', t: 'r', c: [{ ref: 'r' }] }, { op: 'add', t: 'd', c: [{ pi: ['p', 'd'] }] },
  { op: 'doctype', t: 'd' }, { op: 'decl', t: 'd' }, { op: 'setDecl', t: 'd', v: ['1.0', null, 'no'] }, { op: 'decl', t: 'd' }, { op: 'clone', t: 'd' },
  { op: 'addBefore', t: 'r', c: [{ e: 'r0' }] }, { op: 'addAfter', t: 'r', c: [{ dtd: ['r', null, null, null] }] }, { op: 'addBefore', t: 'r', c: ['  ', { cm: 'x' }] },
  { op: 'replaceNodes', t: 'd', c: [{ e: 'z' }, ' ', { e: 'z' }] }, { op: 'replaceNodes', t: 'd', c: [{ e: 'z' }, ' '] }, { op: 'strd', t: 'd' }, { op: 'str', t: 'd' },
]);
add('xlinq', 'x.script', '<r a="1" b="2" c="3"><x/></r>', false, [
  { op: 'firstAttr', t: 'r' }, { op: 'lastAttr', t: 'r' }, { op: 'nextAttr', t: 'a0.0' }, { op: 'nextAttr', t: 'a0.2' }, { op: 'prevAttr', t: 'a0.0' }, { op: 'prevAttr', t: 'a0.2' },
  { op: 'save', t: 'a0.1', k: 0 }, { op: 'remove', t: '$0' }, { op: 'nextAttr', t: '$0' }, { op: 'prevAttr', t: '$0' }, { op: 'parent', t: '$0' }, { op: 'str', t: '$0' }, { op: 'remove', t: '$0' },
  { op: 'setValue', t: '$0', v: { num: '2.5' } }, { op: 'setValue', t: '$0', v: null }, { op: 'setValueProp', t: '$0', v: null }, { op: 'desc', t: '$0' },
  { op: 'replaceAttributes', t: 'r', c: [{ a: 'z', v: '1' }, { ref: 'a0.0' }, 'text', { e: 'y' }] }, { op: 'strd', t: 'd' },
  { op: 'replaceAttributes', t: 'r', c: [{ a: 'z', v: '1' }, { a: 'z', v: '2' }] }, { op: 'strd', t: 'd' },
  { op: 'add', t: 'r', c: [{ ref: '$0' }, { ref: '$0' }] }, { op: 'strd', t: 'd' }, { op: 'hasAttrs', t: 'e1' }, { op: 'firstAttr', t: 'e1' }, { op: 'lastAttr', t: 'e1' },
  { op: 'setValue', t: 'r', v: { bool: false } }, { op: 'setValue', t: 'r', v: { dec: '-1.10' } }, { op: 'setValue', t: 'r', v: { int: 7 } },
  { op: 'setValue', t: 'r', v: { ref: 'r' } }, { op: 'strd', t: 'd' },
]);
add('xlinq', 'x.script', '<!DOCTYPE r SYSTEM "s"><r><?p d?></r>', false, [
  { op: 'setTarget', t: 'n2', v: 'q' }, { op: 'setTarget', t: 'n2', v: 'XmL' }, { op: 'setTarget', t: 'n2', v: '' }, { op: 'setTarget', t: 'n2', v: null }, { op: 'setTarget', t: 'n2', v: 'a:b' },
  { op: 'setTarget', t: 'n2', v: 'xml-x' }, { op: 'setDtdName', t: 'n0', v: 'a:b' }, { op: 'setDtdName', t: 'n0', v: '1a' }, { op: 'setDtdName', t: 'n0', v: '' }, { op: 'setDtdName', t: 'n0', v: null },
  { op: 'setDtdName', t: 'n0', v: 'x' }, { op: 'setTarget', t: 'n0', v: 'q' }, { op: 'setDtdName', t: 'n2', v: 'q' }, { op: 'strd', t: 'd' },
]);
add('xlinq', 'x.script', '<r><!--c--><?p d?><![CDATA[x]]>t</r>', true, [
  { op: 'setValueProp', t: 'n1', v: 'new' }, { op: 'setValueProp', t: 'n2', v: 'nd' }, { op: 'setValueProp', t: 'n3', v: 'cd' }, { op: 'setValueProp', t: 'n4', v: 'tx' },
  { op: 'setValueProp', t: 'n1', v: null }, { op: 'setValueProp', t: 'n2', v: null }, { op: 'setValueProp', t: 'n3', v: null }, { op: 'strd', t: 'd' },
  { op: 'setValueProp', t: 'n1', v: 'a--b-' }, { op: 'setValueProp', t: 'n2', v: 'x?>y' }, { op: 'strd', t: 'd' }, { op: 'str', t: 'd' },
  { op: 'setValueProp', t: 'n4', v: 'bad\u0001' }, { op: 'strd', t: 'd' }, { op: 'str', t: 'n4' },
  { op: 'add', t: 'r', c: [{ cm: null }] }, { op: 'add', t: 'r', c: [{ pi: ['xml', 'd'] }] }, { op: 'add', t: 'r', c: [{ pi: ['1a', 'd'] }] }, { op: 'add', t: 'r', c: [{ pi: [null, 'd'] }] },
  { op: 'add', t: 'r', c: [{ tx: null }] }, { op: 'add', t: 'r', c: [{ cd: null }] }, { op: 'add', t: 'r', c: [{ a: 'x', v: null }] }, { op: 'strd', t: 'd' },
]);
for (let i = 0; i < Number(nRandom); i++) {
  const steps = [];
  for (let j = 0; j < 25; j++) steps.push(step(rnd() < 0.55 ? pick(READS) : pick(WRITES)));
  add('xlinq', 'x.script', pick(DOCS), rnd() < 0.5, steps);
}

// ================================================================================ parser/names
const PARSE = [
  '<r/>', '<!DOCTYPE r PUBLIC "p" \'s\'><r/>', "<!DOCTYPE r PUBLIC 'p' \"s\"><r/>", '<!DOCTYPE r PUBLIC "p><r/>', '<!DOCTYPE r SYSTEM s><r/>',
  '<!DOCTYPE r PUBLIC "p"><r/>', '<!DOCTYPE r SYSTEM "a\'b"><r/>', '<!DOCTYPE r [<!ELEMENT r ANY>]><r/>', '<r>\u0001</r>', '<r a="\u0002"/>',
  '<r><!--\u0003--></r>','<r>\uffff</r>', '<r>\ud83d\ude00</r>', '<r><?p \u0004?></r>', '<r><![CDATA[\u0005]]></r>', '<r>&#1;</r>', '<r>&#xD800;</r>',
  '<r\u0007/>', '<?xml version="1.0" encoding="latin1"?><r/>', '<?xml version="1.0"?><r/>', '<?xml version="1.0" standalone="no"?><r/>',
];
const DECLS = [
  '<?xml encoding="utf-8" version="1.0"?>', '<?xml version="1.0" standalone="yes" encoding="utf-8"?>', '<?xml version="1.0" foo="x"?>', '<?xml version="1.0"encoding="utf-8"?>',
  '<?xml version="1.0" version="1.0"?>', `<?xml  version = "1.0"  encoding = 'x'  standalone = "no" ?>`, '<?xml version="1.0" encoding=""?>', '<?xml version="1.1"?>', '<?xml version="1.0" standalone="YES"?>',
  '<?xml version="1.0" encoding="utf-8" standalone="yes" ?>', "<?xml version='1.0'?>", '<?xml?>', '<?xml ?>', '<?xml version="1.0" encoding="a" encoding="b"?>', '<?xml version="1.0" standalone="no" standalone="no"?>',
  '<?xml version=1.0?>', `<?xml version="1.0'?>`, '<?xml Version="1.0"?>', '<?xml version="1.0" ?  >', '<?xml\tversion="1.0"\nencoding="utf-8"?>','<?xml-stylesheet href="a"?>', '<?xmlx?>',
  ' <?xml version="1.0"?>', '<?XML version="1.0"?>', '<?xml version="1.0" encoding="utf-8" standalone="yes" x="1"?>',
];
for (const d of DECLS) PARSE.push(d + '<r/>');
for (const x of PARSE) for (const p of [false, true]) add('xlinq', 'x.parse', x, p);
for (const n of ['a', 'a:b', ':a', 'a:', '1a', '-a', 'a-1', '_', 'a.b', '', 'é', 'a b', '\u00b7a', 'a\u00b7', '\ud800\udc00', 'a\ud800\udc00', 'xml:x', 'a::b', '\u0300', 'a\u0300']) {
  add('xlinq', 'x.isName', n);
}
for (let c = 0; c < 0x80; c++) add('xlinq', 'x.isWs', String.fromCharCode(c));
for (const c of ['\u0085', '\u00a0', '\u2028', '\u3000', '\ufeff']) add('xlinq', 'x.isWs', c);
for (const n of ['a', '{urn:x}a', '{}a', '{urn:x}', '{a', 'a}', '{urn:x}a:b', '{u}v}w', ' a', '{http://www.w3.org/2000/xmlns/}xmlns']) add('xlinq', 'x.name', n);
for (const m of ['IsWhiteSpace', 'IsLetter', 'IsNCNameSingleChar', 'IsStartNCNameSingleChar', 'IsNameSingleChar', 'IsNCNameCharXml4e', 'IsStartNCNameCharXml4e', 'IsNameCharXml4e', 'IsHighSurrogate', 'IsLowSurrogate']) {
  add('xlinq', 'x.charType', m);
}

// ================================================================================ encodings
const hex = (bytes) => Buffer.from(bytes).toString('hex');
const utf16 = (s, be) => {
  const b = Buffer.from(s, 'utf16le');
  if (be) for (let i = 0; i < b.length; i += 2) [b[i], b[i + 1]] = [b[i + 1], b[i]];
  return [...b];
};
const utf32 = (s, be) => {
  const cps = Array.from(s, (c) => c.codePointAt(0));
  const b = Buffer.alloc(cps.length * 4);
  cps.forEach((cp, i) => (be ? b.writeUInt32BE(cp, i * 4) : b.writeUInt32LE(cp, i * 4)));
  return [...b];
};
const latin1 = (s) => [...Buffer.from(s, 'latin1')];
const utf8 = (s) => [...Buffer.from(s, 'utf8')];
const BOM8 = [0xef, 0xbb, 0xbf];
const body = (enc) => `${enc === undefined ? '' : `<?xml version="1.0"${enc ? ` encoding="${enc}"` : ''}?>`}<r a="é€">x ÄÖü € 😀</r>`;
const bodyLatin = (enc) => `<?xml version="1.0" encoding="${enc}"?><r a="é">x ÄÖü ÿ</r>`;
const loads = [
  // UTF-8
  utf8(body()), [...BOM8, ...utf8(body())], utf8(body('utf-8')), [...BOM8, ...utf8(body('utf-8'))], utf8(body('UTF-8')), utf8(body('utf8')),
  utf8(body(undefined)), [...BOM8, ...utf8(body(undefined))], utf8(body('')),
  // UTF-16 with and without BOM, declared and mismatched
  [0xff, 0xfe, ...utf16(body('utf-16'), false)], [0xfe, 0xff, ...utf16(body('utf-16'), true)], utf16(body('utf-16'), false), utf16(body('utf-16'), true),
  [0xff, 0xfe, ...utf16(body(), false)], [0xfe, 0xff, ...utf16(body(), true)], [0xff, 0xfe, ...utf16(body('utf-8'), false)], [0xfe, 0xff, ...utf16(body('utf-8'), true)],
  utf16(body('utf-8'), false), [0xff, 0xfe, ...utf16(body('iso-8859-1'), false)], [0xff, 0xfe, ...utf16(body('UTF-16LE'), false)], [0xfe, 0xff, ...utf16(body('utf-16BE'), true)],
  [0xff, 0xfe, ...utf16(body('unicode'), false)], [0xff, 0xfe, ...utf16(body('ucs-2'), false)], [0xff, 0xfe, ...utf16(body('utf-32'), false)],
  utf16(body(undefined), false), utf16(body(undefined), true),
  // UTF-32
  [0xff, 0xfe, 0, 0, ...utf32(body('utf-32'), false)], [0, 0, 0xfe, 0xff, ...utf32(body('utf-32'), true)], utf32(body('utf-32'), false), utf32(body('utf-32'), true),
  [0xff, 0xfe, 0, 0, ...utf32(body(), false)], [0, 0, 0xfe, 0xff, ...utf32(body('utf-32BE'), true)], [0xff, 0xfe, 0, 0, ...utf32(body('utf-8'), false)],
  // single byte
  latin1(bodyLatin('iso-8859-1')), latin1(bodyLatin('ISO-8859-1')), latin1(bodyLatin('latin1')), latin1(bodyLatin('l1')), latin1(bodyLatin('us-ascii')), latin1(bodyLatin('ascii')),
  latin1(bodyLatin('windows-1252')), latin1(bodyLatin('iso-8859-15')), latin1(bodyLatin('bogus')), utf8(bodyLatin('iso-8859-1')), [...BOM8, ...latin1(bodyLatin('iso-8859-1'))],
  [...BOM8, ...utf8(bodyLatin('iso-8859-1'))], utf8('<?xml version="1.0" encoding="us-ascii"?><r>abc</r>'), utf8('<?xml version="1.0" encoding="utf-16"?><r/>'),
  utf8('<?xml version="1.0" encoding="utf-32"?><r/>'), utf8('<?xml version="1.0" encoding="UTF-16"?><r/>'), utf8("<?xml version='1.0' encoding='iso-8859-1'?><r>\u00e9</r>"),
  utf8('<?xml version="1.0"   encoding = "iso-8859-1" ?><r/>'), utf8('<?xml version="1.0" standalone="yes" encoding="iso-8859-1"?><r/>'),
  // invalid bytes
  [...utf8('<r>'), 0xff, 0xfe, 0x41, ...utf8('</r>')], [...utf8('<r>'), 0xc3, ...utf8('</r>')], [...utf8('<r>'), 0xed, 0xa0, 0x80, ...utf8('</r>')], [...BOM8, ...utf8('<r>'), 0x80, ...utf8('</r>')],
  [0xff, 0xfe, ...utf16('<r>', false), 0x00, 0xd8, ...utf16('</r>', false)], [0xff, 0xfe, ...utf16('<r/>', false), 0x41], [0xff, 0xfe, 0, 0, ...utf32('<r>', false), 0, 0, 0x11, 0, ...utf32('</r>', false)],
  [0xff, 0xfe, 0, 0, ...utf32('<r/>', false), 0x41, 0], [], [0xef, 0xbb], BOM8, [0xff, 0xfe], [0x3c], utf8('  <r/>'), [...BOM8, ...utf8('\n<?xml version="1.0"?><r/>')],
  [0x4c, 0x6f, 0xa7, 0x94], utf8('<?xml version="1.0" encoding="utf-8"?>'), [0, 0, 0, 0x3c, 0, 0, 0, 0x72, 0, 0, 0, 0x2f, 0, 0, 0, 0x3e],
  [0x3c, 0, 0, 0, 0x72, 0, 0, 0, 0x2f, 0, 0, 0, 0x3e, 0, 0, 0], [0, 0x3c, 0, 0x72, 0, 0x2f, 0, 0x3e], [0x3c, 0, 0x72, 0, 0x2f, 0, 0x3e, 0],
];
for (const d of DECLS) loads.push(utf8(d + '<r>é</r>'), latin1(d + '<r>é</r>'));
for (const name of ['us', 'ansi_x3.4-1986', 'cp367', 'csascii', 'ibm367', 'iso-ir-6', 'iso646-us', 'iso_646.irv:1991', 'iso_8859-1:1987', 'iso8859-1', 'iso-ir-100', 'cp819', 'ibm819', 'csisolatin1',
  'x-unicode-1-1-utf-8', 'x-unicode-2-0-utf-8', 'unicode-2-0-utf-8', 'ucs-4', 'UCS-2', 'Unicode', 'utf-7', 'unicode-1-1-utf-7', 'x-unicode-2-0-utf-7', 'csunicode11utf7', 'csUnicode', 'ISO-10646-UCS-2']) {
  loads.push(latin1(bodyLatin(name)));
}
for (const b of loads) add('encoding', 'enc.load', hex(b));

const SAVE_BODY = '<r a="é€😀\u00ff" b="&#x9;&#xA;">x ÄÖü € 😀 \u0080 \u00ff<c/><!--cé--><?p é?><![CDATA[é]]></r>';
const ENCS = ['us', 'ansi_x3.4-1986', 'cp367', 'csascii', 'ibm367', 'iso-ir-6', 'iso646-us', 'iso_646.irv:1991', 'iso_8859-1:1987', 'iso8859-1', 'iso-ir-100', 'cp819', 'ibm819', 'csisolatin1', 'x-unicode-1-1-utf-8', 'x-unicode-2-0-utf-8', 'unicode-2-0-utf-8', 'ucs-4', 'unicode-1-1-utf-7', 'x-unicode-2-0-utf-7', 'csunicode11utf7', 'csUnicode', 'utf-8', 'UTF-8', 'utf8', 'utf-16', 'UTF-16', 'utf-16le', 'utf-16BE', 'unicode', 'unicodeFFFE', 'ucs-2', 'utf-32', 'utf-32LE', 'utf-32BE', 'us-ascii', 'ascii', 'ANSI_X3.4-1968',
  'iso-8859-1', 'latin1', 'l1', 'iso_8859-1', 'windows-1252', 'iso-8859-15', 'utf-7', 'bogus', '', ' utf-8', 'utf-16 ', 'x-unicode20utf8', 'unicode-1-1-utf-8', 'iso-10646-ucs-2', 'cp1252', 'utf-32be'];
for (const enc of ENCS) {
  for (const df of [false, true]) {
    add('encoding', 'enc.saveDecl', '<r a="é€😀" b="&#x9;">x ÄÖü € 😀 \u0080<c/></r>', '1.0', enc, null, df);
  }
  add('encoding', 'enc.saveDecl', SAVE_BODY, '1.0', enc, 'yes', false);
  add('encoding', 'enc.saveDecl', '<r>ascii only<!--c--><?p d?><![CDATA[x]]></r>', null, enc, null, false);
  add('encoding', 'enc.saveDecl', '<r><!--€--></r>', '1.0', enc, null, false);
  add('encoding', 'enc.saveDecl', '<r><![CDATA[€]]></r>', '1.0', enc, null, false);
  add('encoding', 'enc.saveDecl', '<r><?p €?></r>', '1.0', enc, null, false);
  add('encoding', 'enc.saveDecl', '<é>ü</é>', '1.0', enc, null, false);
  add('encoding', 'enc.get', enc);
}
for (const x of [
  '<?xml version="1.0" encoding="utf-16"?><r>é</r>', '<?xml version="1.0" encoding="iso-8859-1"?><r>é€</r>', '<?xml version="1.0"?><r>é</r>', '<r>é</r>',
  '<?xml version="1.0" encoding="us-ascii"?><r a="€">é\ud83d\ude00</r>', '<?xml version="1.0" encoding="bogus"?><r/>', '<?xml version="1.0" encoding="utf-32"?><r>\ud83d\ude00</r>',
]) {
  for (const df of [false, true]) add('encoding', 'enc.save', x, df);
}

// ================================================================================ System.Linq
const INTS = [[], [1], [3, 1, 2], [5, 5, 1, 5, 2, 1], [4, -3, 7, 0, -3, 9, 4], [2, 4, 6, 8, 10, 12], [1, 2, 3, 4, 5, 6, 7, 8, 9]];
const STRS = [[], ['b'], ['b', 'a', 'B', 'A', 'ä', 'ae', 'Æ', 'a-b', 'ab', '-', '_', '1', '10', '2', ' ', '', 'Z', 'z', 'ß', 'ss', 'ẞ', 'ı', 'I', 'i', 'İ', 'ſ', 's', 'µ', 'Μ'], ['x', null, 'y', null, 'x'],
  ['Apple', 'apple', 'APPLE', 'banana', 'Banana', 'cherry'], ['co-op', 'coop', 'co_op', 'Co-op', 'co op', 'cöop', 'côte', 'cote', 'coté', 'côté']];
const DBLS = [[], [1.5, 'NaN', 0.5], ['NaN'], ['NaN', 'NaN'], [2.5, -0.0, 0, 'Infinity', '-Infinity', 1e300], [0.1, 0.2, 0.3]];
const INT_PREDS = ['gt:3', 'even', 'throw:5', 'all', 'none', 'throw:1'];
const STR_PREDS = ['gt:1', 'all', 'none', 'throw:x', 'isnull'];
const INT_SELS = ['id', 'mod:3', 'neg', 'mod:2'];
const STR_SELS = ['id', 'lower', 'first', 'len'];

function linqCases(kind, src, other, preds, sels, values, cmps, ordCmps) {
  const L = (op, ...rest) => add('linq', 'linq', op, kind, src, ...rest);
  L('where', pick(preds));
  L('select', pick(sels));
  for (const op of ['first', 'firstOrDefault', 'last', 'lastOrDefault', 'single', 'singleOrDefault', 'any', 'count']) {
    L(op, null);
    for (const p of preds) L(op, p);
  }
  for (const p of preds) L('all', p);
  for (const i of [-1, 0, 1, 2, 7]) {
    L('elementAt', i);
    L('elementAtOrDefault', i);
  }
  L('defaultIfEmpty', null);
  L('defaultIfEmpty', values[0]);
  for (const v of values) for (const c of cmps) L('contains', v, c);
  L('sum', null);
  L('max', null);
  L('min', null);
  for (const s of sels) {
    L('max', s);
    L('min', s);
    L('sum', s);
  }
  L('aggregate', null);
  for (const c of cmps) {
    L('sequenceEqual', other, c);
    L('sequenceEqual', src, c);
    L('distinct', null, c);
    L('except', other, c);
    L('intersect', other, c);
    L('union', other, c);
    L('toHashSet', null, c);
    L('except', src, c);
    L('intersect', src, c);
    L('union', src, c);
  }
  L('concat', other);
  L('append', values[1]);
  L('prepend', values[1]);
  for (const n of [-1, 0, 1, 2, 10]) {
    L('skip', n);
    L('take', n);
  }
  for (const p of preds) {
    L('skipWhile', p);
    L('takeWhile', p);
  }
  L('reverse');
  for (const s of sels) {
    for (const c of ordCmps) {
      L('order', [['asc', s, c]]);
      L('order', [['desc', s, c]]);
      for (const s2 of sels) {
        L('order', [['asc', s, c], ['asc', s2, c]]);
        L('order', [['desc', s, c], ['desc', s2, c]]);
      }
    }
    for (const c of cmps) L('groupBy', s, c);
    L('toDictionary', s);
  }
  L('zip', other);
  L('deferred', pick(preds));
}
for (const s of INTS) linqCases('i', s, pick(INTS), INT_PREDS, INT_SELS, [5, 0, -3], [null, 'mod:3'], [null]);
for (const s of STRS) linqCases('s', s, pick(STRS), STR_PREDS, STR_SELS, ['a', null, 'A', 'x'], [null, 'ci'], [null, 'ord']);
for (const s of DBLS) {
  for (const op of ['sum', 'max', 'min', 'distinct', 'contains', 'order', 'orderd']) add('linq', 'linq', op, 'd', s, op === 'contains' ? 'NaN' : null, null);
}
for (const s of [[], [1, null, 3], [null], [null, null], [2, null, -1]]) {
  for (const op of ['sum', 'max', 'min', 'order', 'orderd']) add('linq', 'linq', op, 'ni', s, null, null);
}
add('linq', 'linq', 'sum', 'i', [2147483647, 1], null);
for (const [st, n] of [[0, 0], [0, 5], [-3, 4], [2147483647, 1], [2147483647, 2], [2147483640, 8], [0, -1], [-2147483648, 3], [5, 2147483647]]) add('linq', 'linq', 'range', 'i', [], st, n);
for (const [v, n] of [[7, 0], [7, 3], [7, -1]]) add('linq', 'linq', 'repeat', 'i', [], v, n);
add('linq', 'linq', 'empty', 'i', []);
for (const s of INTS) for (const t of ['none', '5']) add('linq', 'linq', 'forEach', 'i', s, t);
for (const s of STRS) add('linq', 'linq', 'forEach', 's', s, 'x');
add('linq', 'linq', 'sum', 'i', [-2147483648, -1], null);
// HashSet<int>: iteration order after removals and re-adds.
for (let i = 0; i < 30; i++) {
  const ops = [];
  for (let j = 0; j < 12; j++) ops.push([pick(['add', 'add', 'remove', 'contains']), int(8)]);
  ops.push(['count', 0], ['list', 0]);
  add('linq', 'hs', ops);
}
add('linq', 'hs', [['add', 1], ['add', 2], ['add', 3], ['remove', 2], ['add', 4], ['list', 0], ['clear', 0], ['add', 5], ['list', 0], ['count', 0]]);

// ================================================================================ System types
const GUIDS = ['ca761232-ed42-11ce-bacd-00aa0057b223', 'CA761232-ED42-11CE-BACD-00AA0057B223', '{ca761232-ed42-11ce-bacd-00aa0057b223}', '00000000-0000-0000-0000-000000000000', 'ca761232-ed42-11ce-bacd-00aa0057b224'];
for (const a of GUIDS) for (const b of [...GUIDS, null]) add('system', 'guid.eq', a, b);
add('system', 'guid.newShape');
const TS = ['0', '1', '-1', '864000000000', '9223372036854775807', '-9223372036854775808'];
for (const a of TS) for (const b of [...TS, null]) add('system', 'ts.cmp', a, b);
const DECS = ['1', '1.0', '1.00', '0', '-0', '0.000', '-0.0', '10', '1E1', '79228162514264337593543950335', '-79228162514264337593543950335', '0.1', '0.10', '100'];
for (const a of DECS) for (const b of DECS) add('system', 'dec.set', a, b);
const URIS = ['http://example.com', 'http://example.com/', 'HTTP://EXAMPLE.COM/', 'http://example.com:80/', 'http://example.com/a#x', 'http://example.com/a#y', 'http://example.com/a',
  'http://user@example.com/a', 'mailto:a@b.c', 'mailto:A@b.c', 'file:///C:/a/b', 'file:///c:/A/B', 'C:\\a\\b', '\\\\server\\share\\x', '\\\\SERVER\\share\\x', 'rel/path', 'rel/Path', 'http://example.com/%41', 'http://example.com/A',
  'urn:a:b', 'URN:a:b', 'http://example.com/a?q', 'http://example.com/a?Q'];
for (const a of URIS) for (const b of URIS) add('system', 'uri.set', a, b);
const REL_PROPS = ['absolutePath', 'absoluteUri', 'localPath', 'authority', 'host', 'port', 'query', 'fragment', 'scheme', 'pathAndQuery', 'isDefaultPort', 'isFile', 'isUnc', 'userInfo'];
for (const s of ['rel/path', '', '#f', '?q', '/abs', 'http://example.com/a']) for (const p of REL_PROPS) add('system', 'uri.prop', s, p);
const utcTicks = (iso) => String((BigInt(Date.parse(iso)) + 62135596800000n) * 10000n);
for (const iso of ['2024-10-27T00:00:00Z', '2024-10-27T00:30:00Z', '2024-10-27T01:00:00Z', '2024-10-27T01:30:00Z', '2024-10-27T02:00:00Z', '2024-03-31T00:30:00Z', '2024-03-31T01:30:00Z', '2025-10-26T00:59:59Z', '2025-10-26T01:59:59Z', '2024-06-01T12:00:00Z']) {
  add('system', 'dt.ambig', utcTicks(iso));
}
const XSD = ['2024-01-02', '2024-01-02T03:04:05', '2024-01-02T03:04:05Z', '2024-01-02T03:04:05.123+02:00', '03:04:05', '03:04:05Z', '03:04:05.5', '2024-01', '2024', '--01-02', '--01', '---02',
  '2024-01-02T03:04:05 ', '03:04:05 ', ' 2024-01-02', '2024-01-02T', '24:00:00', '2024-01-02T03:04', 'x'];
for (const s of XSD) for (const f of [0x01, 0x02, 0x04, 0x100, 0x200, 0x400, 0xff, 0x7ff]) add('system', 'xsd.dt', s, f);
for (const s of ['', 'a', 'abc', 'ß', 'ßa', 'ﬀ', 'ǆ', 'ı', 'i', 'é', '1a', 'ŉ', '\ud801\udc28x']) add('system', 'str.upperFirst', s);
const OIC = ['', 'a', 'A', 'ab', 'AB', 'aB', 'ß', 'SS', 'ẞ', 'ı', 'I', 'i', 'İ', 'ſ', 's', 'S', 'µ', 'Μ', 'μ', 'é', 'É', 'ǆ', 'ǅ', 'Ǆ', 'ﬀ', 'FF', '\ud801\udc28', '\ud801\udc00', null];
for (const a of OIC) for (const b of OIC) add('system', 'str.eqOic', a, b);
for (const t of ['1.2:3:.4', '2:3:.4', '1.2:3:.45', '-1.2:3:.4', '1.24:3:.4', '1.2:3.4', '1.2:3.45', '1.02:03.4567890', '-1.2:3.4', '1.2:3:4.5', '2:3.4', '1:2:3.4', '1.2:3.', '1.2:3.4.5', '10.23:59.9999999', '1.24:3.4', '1.2:60.4']) add('system', 'ts.parse', t);
add('system', 'str.upperTable');
add('system', 'str.oicTable');
for (const t of ['InvalidCastException', 'DivideByZeroException']) add('system', 'exc.msg', t);
add('system', 'ev', [['sub', 'a'], ['sub', 'b'], ['raise'], ['clear'], ['raise'], ['count'], ['sub', 'a'], ['raise'], ['count']]);
add('system', 'ev.pc', 'Name');
add('system', 'ev.pc', null);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(cases));
const byArea = {};
for (const c of cases) byArea[c.area] = (byArea[c.area] ?? 0) + 1;
console.log(`${cases.length} cases -> ${out}`, byArea);
