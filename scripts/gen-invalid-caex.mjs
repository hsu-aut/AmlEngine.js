#!/usr/bin/env node
// Generates schema-invalid CAEX documents for the validation oracle test (test/validation).
// Takes the valid files of test/corpus/*.aml and applies seeded random mutations: removed required
// attributes, undeclared attributes, renamed/moved/duplicated/reordered elements, wrong namespaces,
// text in element-only and empty content, broken enumeration and dateTime values, xsi attributes,
// xml:space, CDATA, comments, nested content in AdditionalInformation, ...
//
// usage: node scripts/gen-invalid-caex.mjs [outDir=test/validation/cases] [variantsPerFile=10] [seed=3682]

import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] ?? 'test/validation/cases';
const variants = Number(process.argv[3] ?? 10);
const seed = Number(process.argv[4] ?? 3682);
const corpusDir = 'test/corpus';

// ---------------------------------------------------------------- PRNG
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rnd = mulberry32(seed);
const int = (n) => Math.floor(rnd() * n);
const pick = (arr) => arr[int(arr.length)];
const chance = (p) => rnd() < p;

// ---------------------------------------------------------------- minimal XML tree (raw text kept)
function parse(text) {
  let i = 0;
  const root = { type: 'doc', children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  while (i < text.length) {
    if (text.startsWith('<?', i)) {
      const e = text.indexOf('?>', i) + 2;
      top().children.push({ type: 'raw', text: text.slice(i, e), kind: 'pi' });
      i = e;
    } else if (text.startsWith('<!--', i)) {
      const e = text.indexOf('-->', i) + 3;
      top().children.push({ type: 'raw', text: text.slice(i, e), kind: 'comment' });
      i = e;
    } else if (text.startsWith('<![CDATA[', i)) {
      const e = text.indexOf(']]>', i) + 3;
      top().children.push({ type: 'raw', text: text.slice(i, e), kind: 'cdata' });
      i = e;
    } else if (text.startsWith('<!', i)) {
      const e = text.indexOf('>', i) + 1;
      top().children.push({ type: 'raw', text: text.slice(i, e), kind: 'doctype' });
      i = e;
    } else if (text.startsWith('</', i)) {
      const e = text.indexOf('>', i) + 1;
      stack.pop();
      i = e;
    } else if (text[i] === '<') {
      let j = i + 1;
      while (!/[\s/>]/.test(text[j])) j++;
      const el = { type: 'el', name: text.slice(i + 1, j), attrs: [], children: [] };
      for (;;) {
        while (/\s/.test(text[j])) j++;
        if (text[j] === '/' || text[j] === '>') break;
        let k = j;
        while (!/[\s=]/.test(text[k])) k++;
        const an = text.slice(j, k);
        while (text[k] !== '"' && text[k] !== "'") k++;
        const q = text[k];
        const ve = text.indexOf(q, k + 1);
        el.attrs.push([an, text.slice(k + 1, ve)]);
        j = ve + 1;
      }
      top().children.push(el);
      if (text[j] === '/') {
        i = j + 2;
      } else {
        stack.push(el);
        i = j + 1;
      }
    } else {
      const e = text.indexOf('<', i);
      const end = e < 0 ? text.length : e;
      top().children.push({ type: 'text', text: text.slice(i, end) });
      i = end;
    }
  }
  return root;
}

function serialize(node) {
  if (node.type === 'doc') return node.children.map(serialize).join('');
  if (node.type === 'raw' || node.type === 'text') return node.text;
  const attrs = node.attrs.map(([n, v]) => ` ${n}="${v}"`).join('');
  if (node.children.length === 0 && !node.forceOpen) return `<${node.name}${attrs} />`;
  return `<${node.name}${attrs}>${node.children.map(serialize).join('')}</${node.name}>`;
}

const clone = (n) => JSON.parse(JSON.stringify(n));

function elements(node, out = [], parent = null) {
  for (const c of node.children ?? []) {
    if (c.type === 'el') {
      out.push({ el: c, parent: node });
      elements(c, out, c);
    }
  }
  return out;
}

const local = (qn) => qn.slice(qn.indexOf(':') + 1);
const prefixOf = (qn) => (qn.includes(':') ? qn.slice(0, qn.indexOf(':')) : '');

// ---------------------------------------------------------------- vocabulary
const CAEX_ELEMENTS = [
  'CAEXFile', 'SuperiorStandardVersion', 'SourceDocumentInformation', 'ExternalReference', 'InstanceHierarchy',
  'InterfaceClassLib', 'RoleClassLib', 'SystemUnitClassLib', 'AttributeTypeLib', 'Description', 'Version',
  'Revision', 'RevisionDate', 'OldVersion', 'NewVersion', 'AuthorName', 'Comment', 'Copyright',
  'AdditionalInformation', 'SourceObjectInformation', 'AttributeNameMapping', 'InterfaceIDMapping',
  'InterfaceNameMapping', 'AttributeType', 'RoleRequirements', 'Attribute', 'ExternalInterface', 'MappingObject',
  'SystemUnitClass', 'OrdinalScaledType', 'RequiredMaxValue', 'RequiredValue', 'RequiredMinValue',
  'NominalScaledType', 'UnknownType', 'Requirements', 'InternalElement', 'SupportedRoleClass', 'InternalLink',
  'RoleClass', 'InterfaceClass', 'DefaultValue', 'Value', 'RefSemantic', 'Constraint',
];
const REQUIRED_ATTRS = [
  'Name', 'FileName', 'SchemaVersion', 'RefPartnerSideA', 'RefPartnerSideB', 'Path', 'Alias', 'OriginName',
  'OriginID', 'OriginVersion', 'LastWritingDateTime', 'RefBaseRoleClassPath', 'CorrespondingAttributePath',
  'RefRoleClassPath', 'SystemUnitAttributeName', 'RoleAttributeName', 'SystemUnitInterfaceID', 'RoleInterfaceID',
];
const TEXT_SNIPPETS = ['oops', 'some text', '  padded  ', 'a &amp; b', '&lt;tag&gt;', 'line1\nline2', 'x\r\ny', 'äöü'];
const BAD_ENUM = ['foo', 'State', ' state', 'state ', '', 'created', 'CHANGE', 'delete\t'];
const BAD_DATES = ['garbage', '2020-13-01T00:00:00', '2020-02-30T10:00:00', '2021-01-01', '2021-01-01T25:00:00',
  '  2021-01-01T10:00:00  ', '2021-01-01T10:00:00.', '2021-01-01T10:00:00+25:00', '0000-01-01T00:00:00', '',
  '   ', '2021-01-01T10:00:00.123456789Z', '2021-1-01T10:00:00', '2021-01-01T10:00:00+01:00', '2021-01-01T10:00:00z',
  '2021-01-01T10:00', '21-01-01T10:00:00', '2021-01-01 T10:00:00', '2021-01-01T10:00:00-0100'];

// ---------------------------------------------------------------- mutations
function nsOf(root) {
  const caex = root.attrs.find(([n]) => n === 'xmlns');
  return caex ? caex[1] : '';
}

const mutations = {
  removeRequiredAttribute(doc, all) {
    const cands = all.filter(({ el }) => el.attrs.some(([n]) => REQUIRED_ATTRS.includes(n)));
    if (!cands.length) return false;
    const { el } = pick(cands);
    const names = el.attrs.filter(([n]) => REQUIRED_ATTRS.includes(n)).map(([n]) => n);
    const n = pick(names);
    el.attrs = el.attrs.filter(([a]) => a !== n);
    return true;
  },
  removeAnyAttribute(doc, all) {
    const cands = all.filter(({ el }) => el.attrs.some(([n]) => !n.startsWith('xmlns')));
    if (!cands.length) return false;
    const { el } = pick(cands);
    const names = el.attrs.filter(([n]) => !n.startsWith('xmlns')).map(([n]) => n);
    const n = pick(names);
    el.attrs = el.attrs.filter(([a]) => a !== n);
    return true;
  },
  addUndeclaredAttribute(doc, all) {
    const { el } = pick(all);
    const variant = int(9);
    if (variant === 0) el.attrs.push(['Foo', 'bar']);
    else if (variant === 1) {
      el.attrs.push(['xmlns:o', 'urn:other']);
      el.attrs.push(['o:Foo', 'bar']);
    } else if (variant === 2) {
      el.attrs.push(['xmlns:c', nsOf(all[0].el) || 'http://www.dke.de/CAEX']);
      el.attrs.push(['c:Name', 'x']);
    } else if (variant === 3) el.attrs.push(['xml:lang', pick(['en', 'de-DE', 'not a lang', '', 'x-private'])]);
    else if (variant === 4) el.attrs.push(['xml:space', pick(['preserve', 'default', 'keep'])]);
    else if (variant === 5) {
      el.attrs.push(['xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance']);
      el.attrs.push([pick(['xsi:foo', 'xsi:nil', 'xsi:schemaLocation', 'xsi:noNamespaceSchemaLocation']), pick(['true', 'x', 'a b'])]);
    } else if (variant === 6) el.attrs.push([pick(['name', 'id', 'Id', 'NAME', 'Unit', 'RefBaseClassPath', 'AttributeDataType', 'RefAttributeType', 'SchemaVersion', 'OriginVendor']), 'v']);
    else if (variant === 7) el.attrs.push(['xml:base', 'http://example.com/']);
    else el.attrs.push(['ChangeMode', pick(['state', 'create'])]);
    // Keep attribute names unique.
    const seen = new Set();
    el.attrs = el.attrs.filter(([n]) => (seen.has(n) ? false : (seen.add(n), true)));
    return true;
  },
  xsiType(doc, all) {
    const { el } = pick(all);
    el.attrs = el.attrs.filter(([n]) => !n.startsWith('xmlns:xsi') && !n.startsWith('xmlns:xs'));
    el.attrs.push(['xmlns:xsi', 'http://www.w3.org/2001/XMLSchema-instance']);
    el.attrs.push(['xmlns:xs', 'http://www.w3.org/2001/XMLSchema']);
    const t = pick(['InternalElementType', 'SystemUnitClassType', 'CAEXObject', 'CAEXBasicObject', 'AttributeType',
      'Nope', 'xs:string', 'xs:anyType', 'xs:dateTime', 'nope:Type', 'ChangeMode', 'InterfaceClassType',
      'RoleFamilyType', 'AttributeFamilyType', 'SystemUnitFamilyType', 'MappingType', 'xs:boolean', '1bad']);
    el.attrs.push(['xsi:type', t]);
    return true;
  },
  renameElement(doc, all) {
    const cands = all.slice(1);
    if (!cands.length) return false;
    const { el } = pick(cands);
    const p = prefixOf(el.name);
    const n = chance(0.8) ? pick(CAEX_ELEMENTS) : pick(['Foo', 'internalElement', 'Attributes', 'X']);
    el.name = p ? `${p}:${n}` : n;
    return true;
  },
  moveElement(doc, all) {
    const cands = all.slice(1);
    if (cands.length < 2) return false;
    const src = pick(cands);
    const dst = pick(all);
    if (isAncestor(src.el, dst.el)) return false;
    src.parent.children.splice(src.parent.children.indexOf(src.el), 1);
    const kids = dst.el.children;
    kids.splice(int(kids.length + 1), 0, src.el);
    return true;
  },
  duplicateElement(doc, all) {
    const cands = all.slice(1).filter(({ el }) => JSON.stringify(el).length < 20000);
    if (!cands.length) return false;
    const { el, parent } = pick(cands);
    parent.children.splice(parent.children.indexOf(el) + 1, 0, clone(el));
    return true;
  },
  swapSiblings(doc, all) {
    const cands = all.filter(({ el }) => el.children.filter((c) => c.type === 'el').length >= 2);
    if (!cands.length) return false;
    const { el } = pick(cands);
    const idx = el.children.map((c, i) => (c.type === 'el' ? i : -1)).filter((i) => i >= 0);
    const a = int(idx.length);
    let b = int(idx.length);
    if (a === b) b = (a + 1) % idx.length;
    const t = el.children[idx[a]];
    el.children[idx[a]] = el.children[idx[b]];
    el.children[idx[b]] = t;
    return true;
  },
  removeElement(doc, all) {
    const cands = all.slice(1);
    if (!cands.length) return false;
    const pref = cands.filter(({ el }) => ['SourceDocumentInformation', 'RevisionDate', 'AuthorName', 'OrdinalScaledType',
      'NominalScaledType', 'UnknownType', 'Requirements'].includes(local(el.name)));
    const { el, parent } = pref.length && chance(0.6) ? pick(pref) : pick(cands);
    parent.children.splice(parent.children.indexOf(el), 1);
    return true;
  },
  wrongNamespace(doc, all) {
    const { el } = pick(all);
    const ns = pick(['urn:other', '', 'http://www.dke.de/CAEX', 'http://www.dke.de/caex']);
    el.attrs = el.attrs.filter(([n]) => n !== 'xmlns');
    el.attrs.unshift(['xmlns', ns]);
    return true;
  },
  prefixedWrongNamespace(doc, all) {
    const cands = all.slice(1);
    if (!cands.length) return false;
    const { el } = pick(cands);
    el.attrs.push(['xmlns:w', pick(['urn:wrong', 'http://www.dke.de/CAEX'])]);
    el.name = 'w:' + local(el.name);
    return true;
  },
  insertText(doc, all) {
    const { el } = pick(all);
    const kids = el.children;
    kids.splice(int(kids.length + 1), 0, { type: 'text', text: pick(TEXT_SNIPPETS) });
    return true;
  },
  insertTextInEmpty(doc, all) {
    const cands = all.filter(({ el }) => ['SourceDocumentInformation', 'ExternalReference', 'RefSemantic', 'SupportedRoleClass', 'InternalLink', 'AttributeNameMapping'].includes(local(el.name)));
    if (!cands.length) return false;
    const { el } = pick(cands);
    el.children.push(chance(0.7) ? { type: 'text', text: pick(TEXT_SNIPPETS) } : { type: 'el', name: pick(['Description', 'Foo']), attrs: [], children: [] });
    return true;
  },
  childInTextOnly(doc, all) {
    const cands = all.filter(({ el }) => ['Description', 'Version', 'Value', 'DefaultValue', 'Copyright', 'RevisionDate', 'AuthorName', 'SuperiorStandardVersion', 'RequiredValue'].includes(local(el.name)));
    if (!cands.length) return false;
    const { el } = pick(cands);
    el.children.splice(int(el.children.length + 1), 0, { type: 'el', name: pick(['Foo', 'Value', 'b']), attrs: [], children: chance(0.5) ? [{ type: 'text', text: 'inner' }] : [] });
    return true;
  },
  breakEnumeration(doc, all) {
    const { el } = pick(all);
    el.attrs = el.attrs.filter(([n]) => n !== 'ChangeMode');
    el.attrs.push(['ChangeMode', pick(BAD_ENUM)]);
    return true;
  },
  breakDateTime(doc, all) {
    const sdi = all.filter(({ el }) => el.attrs.some(([n]) => n === 'LastWritingDateTime'));
    if (sdi.length && chance(0.6)) {
      const { el } = pick(sdi);
      el.attrs = el.attrs.map(([n, v]) => (n === 'LastWritingDateTime' ? [n, pick(BAD_DATES)] : [n, v]));
      return true;
    }
    // Revision with a (possibly) broken RevisionDate.
    const hosts = all.filter(({ el }) => ['InternalElement', 'SystemUnitClass', 'RoleClass', 'InterfaceClass', 'Attribute', 'InstanceHierarchy'].includes(local(el.name)));
    if (!hosts.length) return false;
    const { el } = pick(hosts);
    const p = prefixOf(el.name) ? prefixOf(el.name) + ':' : '';
    const rev = { type: 'el', name: p + 'Revision', attrs: [], children: [
      { type: 'el', name: p + 'RevisionDate', attrs: [], children: [{ type: 'text', text: pick(BAD_DATES) }] },
      { type: 'el', name: p + 'AuthorName', attrs: [], children: [{ type: 'text', text: 'me' }] },
    ] };
    if (chance(0.3)) rev.children.splice(int(3), 1);
    el.children.splice(0, 0, rev);
    return true;
  },
  changeSchemaVersion(doc, all) {
    const root = all[0].el;
    const v = root.attrs.find(([n]) => n === 'SchemaVersion');
    if (!v) return false;
    v[1] = pick(['3.1', '3.0 ', '2.15', '3.0', '2.1', '']);
    return true;
  },
  renameRoot(doc, all) {
    const root = all[0].el;
    root.name = pick(['CAEXfile', 'Foo', 'AutomationML', 'caex:CAEXFile']);
    return true;
  },
  additionalInformation(doc, all) {
    const hosts = all.filter(({ el }) => el.children.some((c) => c.type === 'el') || chance(0.1));
    const { el } = pick(hosts.length ? hosts : all);
    const p = prefixOf(el.name) ? prefixOf(el.name) + ':' : '';
    const variant = int(6);
    let content;
    if (variant === 0) content = [{ type: 'el', name: 'anything', attrs: [['a', '1']], children: [{ type: 'text', text: 'free text' }] }];
    else if (variant === 1) content = [{ type: 'text', text: 'mixed ' }, { type: 'el', name: 'b', attrs: [], children: [] }];
    else if (variant === 2) content = [{ type: 'el', name: p + 'CAEXFile', attrs: [['Foo', 'x']], children: [] }];
    else if (variant === 3) content = [{ type: 'el', name: p + 'InternalElement', attrs: [], children: [] }];
    else if (variant === 4) content = [{ type: 'el', name: 'x:y', attrs: [['xmlns:x', 'urn:x'], ['x:z', '1']], children: [] }];
    else content = [];
    const ai = { type: 'el', name: p + 'AdditionalInformation', attrs: chance(0.5) ? [['AutomationMLVersion', '2.0'], ['Other', 'x']] : [], children: content };
    el.children.splice(int(el.children.length + 1), 0, ai);
    return true;
  },
  cdataAndComments(doc, all) {
    const { el } = pick(all);
    const kids = el.children;
    const v = int(4);
    const node = v === 0 ? { type: 'raw', text: '<!-- a comment -->' }
      : v === 1 ? { type: 'raw', text: '<![CDATA[cdata text]]>' }
        : v === 2 ? { type: 'raw', text: '<![CDATA[   ]]>' }
          : { type: 'raw', text: '<?pi data?>' };
    kids.splice(int(kids.length + 1), 0, node);
    if (chance(0.5)) kids.splice(int(kids.length + 1), 0, { type: 'text', text: pick(TEXT_SNIPPETS) });
    return true;
  },
  spacePreserve(doc, all) {
    const { el } = pick(all);
    el.attrs = el.attrs.filter(([n]) => n !== 'xml:space');
    el.attrs.push(['xml:space', 'preserve']);
    el.children.splice(int(el.children.length + 1), 0, { type: 'text', text: pick(['   ', '\n\t', ' ']) });
    return true;
  },
  emptyContent(doc, all) {
    const cands = all.slice(1).filter(({ el }) => el.children.length > 0);
    if (!cands.length) return false;
    const { el } = pick(cands);
    el.children = chance(0.5) ? [] : [{ type: 'text', text: '   ' }];
    return true;
  },
  constraintContent(doc, all) {
    const hosts = all.filter(({ el }) => local(el.name) === 'Attribute');
    if (!hosts.length) return false;
    const { el } = pick(hosts);
    const p = prefixOf(el.name) ? prefixOf(el.name) + ':' : '';
    const kinds = [
      [],
      [{ type: 'el', name: p + 'OrdinalScaledType', attrs: [], children: [{ type: 'el', name: p + 'RequiredMinValue', attrs: [], children: [{ type: 'text', text: '1' }] }, { type: 'el', name: p + 'RequiredMaxValue', attrs: [], children: [] }] }],
      [{ type: 'el', name: p + 'NominalScaledType', attrs: [], children: [] }, { type: 'el', name: p + 'UnknownType', attrs: [], children: [] }],
      [{ type: 'el', name: p + 'UnknownType', attrs: [], children: [{ type: 'el', name: p + 'Requirements', attrs: [], children: [] }, { type: 'el', name: p + 'Requirements', attrs: [], children: [] }] }],
      [{ type: 'el', name: p + 'UnknownType', attrs: [], children: [] }],
    ];
    const c = { type: 'el', name: p + 'Constraint', attrs: chance(0.7) ? [['Name', 'c']] : [], children: pick(kinds) };
    el.children.splice(int(el.children.length + 1), 0, c);
    return true;
  },
  doctype(doc, all) {
    const at = doc.children.findIndex((c) => c.type === 'el');
    doc.children.splice(at, 0, { type: 'raw', text: pick(['<!DOCTYPE CAEXFile>', '<!DOCTYPE CAEXFile [ <!ENTITY e "x"> ]>']) });
    return true;
  },
  encodingDeclaration(doc, all) {
    const decl = doc.children[0]?.type === 'raw' && doc.children[0].text.startsWith('<?xml') ? doc.children[0] : null;
    const text = `<?xml version="1.0" encoding="${pick(['utf-16', 'UTF-16', 'iso-8859-1', 'us-ascii', 'utf-8'])}"?>`;
    if (decl) decl.text = text;
    else doc.children.unshift({ type: 'raw', text });
    return true;
  },
  charRefValues(doc, all) {
    const { el } = pick(all);
    const v = int(4);
    if (v === 0) el.attrs = [...el.attrs.filter(([n]) => n !== 'ChangeMode'), ['ChangeMode', pick(['&#x9;state', 'state&#xA;', '&#32;create'])]];
    else if (v === 1) el.attrs = el.attrs.map(([n, val]) => [n, n === 'Name' ? 'a&#xA;b&#xD;c&#x9;d' : val]);
    else if (v === 2) el.attrs = el.attrs.map(([n, val]) => [n, n === 'LastWritingDateTime' ? '&#xA;2021-01-01T10:00:00&#x9;' : val]);
    else el.children.splice(int(el.children.length + 1), 0, { type: 'text', text: pick(['&#xD;&#xA;', '&#x20;&#x20;', '\t\n  \n']) });
    return true;
  },
  nestedCaexFile(doc, all) {
    const hosts = all.filter(({ el }) => ['Value', 'DefaultValue', 'AdditionalInformation', 'RequiredValue'].includes(local(el.name)));
    const { el } = hosts.length ? pick(hosts) : pick(all);
    const root = all[0].el;
    const inner = clone(root);
    inner.children = inner.children.filter((c) => c.type !== 'el' || ['SourceDocumentInformation', 'SuperiorStandardVersion'].includes(local(c.name)) || chance(0.2));
    el.children.push(chance(0.5) ? inner : { type: 'el', name: root.name, attrs: [], children: [] });
    return true;
  },
  multilineText(doc, all) {
    const cands = all.filter(({ el }) => ['Description', 'Value', 'DefaultValue', 'RevisionDate', 'Version', 'SuperiorStandardVersion', 'Copyright'].includes(local(el.name)));
    const { el } = cands.length ? pick(cands) : pick(all);
    el.children = [{ type: 'text', text: pick(['\n  2021-01-01T10:00:00\n', 'first\nsecond\r\nthird', '\n\n\n', 'ab']) }]
      .concat(chance(0.3) ? [{ type: 'raw', text: '<!-- mid -->' }, { type: 'text', text: 'tail\nmore' }] : []);
    return true;
  },
};

function isAncestor(a, b) {
  if (a === b) return true;
  for (const c of a.children ?? []) if (c.type === 'el' && isAncestor(c, b)) return true;
  return false;
}

// ---------------------------------------------------------------- main
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const names = Object.keys(mutations);
const files = fs.readdirSync(corpusDir).filter((f) => f.endsWith('.aml')).sort();
let count = 0;
for (const f of files) {
  let text = fs.readFileSync(path.join(corpusDir, f), 'utf8');
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  for (let v = 0; v < variants; v++) {
    rnd = mulberry32(seed + count * 7919);
    const doc = parse(text);
    const applied = [];
    const n = 1 + int(3);
    let guard = 0;
    while (applied.length < n && guard++ < 30) {
      const all = elements(doc);
      if (!all.length) break;
      const m = pick(names);
      if (mutations[m](doc, all)) applied.push(m);
    }
    const base = f.replace(/\.aml$/, '');
    const out = path.join(outDir, `${base}__${String(v).padStart(2, '0')}.aml`);
    const at = doc.children[0]?.type === 'raw' && doc.children[0].text.startsWith('<?xml') ? 1 : 0;
    doc.children.splice(at, 0, { type: 'raw', text: `<!-- mutations: ${applied.join(', ')} -->` });
    fs.writeFileSync(out, serialize(doc), 'utf8');
    count++;
  }
}
console.log(`${count} files written to ${outDir}`);
