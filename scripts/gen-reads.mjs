#!/usr/bin/env node
// Generates the synthetic documents of the "reads" coverage package (test/reads, see
// docs/coverage-notes/reads.md): edge cases of the read API that the corpus lacks (broken
// references, aliases and external references, cyclic inheritance, names with path separators,
// mirrors of mirrors, duplicate names and IDs), each for CAEX 3.0 and 2.15, plus seeded random
// documents that mix all of these.
//
// usage: node scripts/gen-reads.mjs [outDir=test/reads] [randomDocs=6] [seed=4711]

import fs from 'node:fs';
import path from 'node:path';

const outDir = process.argv[2] ?? 'test/reads';
const randomDocs = Number(process.argv[3] ?? 6);
const seed = Number(process.argv[4] ?? 4711);

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
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[int(16)]).join('');
const guid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/>/g, '&gt;');

/** Element: [tag, attrs, children] or text for a text-only element. */
function el(tag, attrs = {}, ...children) {
  return { tag, attrs, children: children.flat(Infinity).filter((c) => c !== null && c !== undefined && c !== false) };
}

function write(node, indent = '') {
  const attrs = Object.entries(node.attrs)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(v)}"`)
    .join('');
  if (node.children.length === 0) return `${indent}<${node.tag}${attrs} />`;
  if (node.children.length === 1 && typeof node.children[0] === 'string') return `${indent}<${node.tag}${attrs}>${esc(node.children[0])}</${node.tag}>`;
  const inner = node.children.map((c) => (typeof c === 'string' ? indent + '  ' + esc(c) : write(c, indent + '  '))).join('\r\n');
  return `${indent}<${node.tag}${attrs}>\r\n${inner}\r\n${indent}</${node.tag}>`;
}

function doc(version, fileName, children) {
  const attrs =
    version === '3.0'
      ? { SchemaVersion: '3.0', FileName: fileName, xmlns: 'http://www.dke.de/CAEX', 'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance', 'xsi:schemaLocation': 'http://www.dke.de/CAEX CAEX_ClassModel_V.3.0.xsd' }
      : { FileName: fileName, SchemaVersion: '2.15', 'xsi:noNamespaceSchemaLocation': 'CAEX_ClassModel_V2.15.xsd', 'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance' };
  const head =
    version === '3.0'
      ? [
          el('SuperiorStandardVersion', {}, 'AutomationML 2.10'),
          el('SourceDocumentInformation', { OriginName: 'gen-reads', OriginID: 'gen-reads', OriginVersion: '1.0.0', LastWritingDateTime: '2024-05-06T07:08:09' }),
        ]
      : [el('AdditionalInformation', { AutomationMLVersion: '2.0' })];
  return '<?xml version="1.0" encoding="utf-8"?>\r\n' + write(el('CAEXFile', attrs, head, children)) + '\r\n';
}

const files = {};

// ------------------------------------------------------------------ hand-written edge cases
/** Class libraries shared by the edge documents; `v` is the CAEX version. */
function libs(v, { cyclic = false, names = false } = {}) {
  const at = (name, ref, ...c) => el(v === '3.0' ? 'AttributeType' : 'Attribute', { Name: name, AttributeDataType: 'xs:string', RefAttributeType: v === '3.0' ? ref : null }, c);
  const icl = el(
    'InterfaceClassLib',
    { Name: 'ICL' },
    el('Version', {}, '1.0.0'),
    el(
      'InterfaceClass',
      { Name: 'Base' },
      el('Attribute', { Name: 'Direction', AttributeDataType: 'xs:string' }, el('Value', {}, 'InOut')),
      el('InterfaceClass', { Name: 'Port', RefBaseClassPath: 'ICL/Base' }),
      el('InterfaceClass', { Name: 'Signal', RefBaseClassPath: 'ICL/Base/Port' }),
    ),
    el('InterfaceClass', { Name: 'Broken', RefBaseClassPath: 'ICL/Missing' }),
    el('InterfaceClass', { Name: 'External', RefBaseClassPath: 'ExtLib@ExtICL/ExtInterface' }),
    cyclic && el('InterfaceClass', { Name: 'Self', RefBaseClassPath: 'ICL/Self' }),
    cyclic && el('InterfaceClass', { Name: 'CycA', RefBaseClassPath: 'ICL/CycB' }),
    cyclic && el('InterfaceClass', { Name: 'CycB', RefBaseClassPath: 'ICL/CycA' }),
    names && el('InterfaceClass', { Name: 'a/b', RefBaseClassPath: 'ICL/Base' }),
    names && el('InterfaceClass', { Name: 'x.y:z', RefBaseClassPath: 'ICL/[a/b]' }),
  );
  const rcl = el(
    'RoleClassLib',
    { Name: 'RCL' },
    el(
      'RoleClass',
      { Name: 'Resource' },
      el('Attribute', { Name: 'Speed', AttributeDataType: 'xs:double', Unit: 'm/s' }, el('DefaultValue', {}, '1.5')),
      el('ExternalInterface', { Name: 'In', RefBaseClassPath: 'ICL/Base/Port', ID: v === '2.15' ? 'rc-ei-in' : null }),
      el('RoleClass', { Name: 'Robot', RefBaseClassPath: 'RCL/Resource' }, el('RoleClass', { Name: 'Arm', RefBaseClassPath: 'RCL/Resource/Robot' })),
    ),
    el('RoleClass', { Name: 'Product' }),
    el('RoleClass', { Name: 'Orphan', RefBaseClassPath: 'RCL/Nope' }),
    el('RoleClass', { Name: 'Ext', RefBaseClassPath: 'ExtLib@ExtRCL/ExtRole' }),
    cyclic && el('RoleClass', { Name: 'CycA', RefBaseClassPath: 'RCL/CycB' }),
    cyclic && el('RoleClass', { Name: 'CycB', RefBaseClassPath: 'RCL/CycA' }),
    names && el('RoleClass', { Name: '[odd]', RefBaseClassPath: 'RCL/Resource' }),
    names && el('RoleClass', { Name: 'dot.ted', RefBaseClassPath: 'RCL/[[odd]]' }),
  );
  const sucl = el(
    'SystemUnitClassLib',
    { Name: 'SUCL' },
    el(
      'SystemUnitClass',
      { Name: 'Machine' },
      el('Attribute', { Name: 'Power', AttributeDataType: 'xs:double', Unit: 'kW' }, el('Value', {}, '11'), el('Attribute', { Name: 'Max', AttributeDataType: 'xs:double' }, el('Value', {}, '15'))),
      el('ExternalInterface', { Name: 'Plug', RefBaseClassPath: 'ICL/Base/Port', ID: 'suc-machine-plug' }),
      el('InternalElement', { Name: 'Motor', ID: 'suc-machine-motor', RefBaseSystemUnitPath: 'SUCL/Motor' }, el('ExternalInterface', { Name: 'Shaft', RefBaseClassPath: 'ICL/Base/Port', ID: 'suc-motor-shaft' })),
      el('InternalElement', { Name: 'Drive', ID: 'suc-machine-drive' }, el('ExternalInterface', { Name: 'Out', RefBaseClassPath: 'ICL/Base/Signal', ID: 'suc-drive-out' })),
      el('SupportedRoleClass', { RefRoleClassPath: 'RCL/Resource' }),
      el('InternalLink', {
        Name: 'L1',
        RefPartnerSideA: v === '3.0' ? 'suc-motor-shaft' : 'suc-machine-motor:Shaft',
        RefPartnerSideB: v === '3.0' ? 'suc-drive-out' : 'suc-machine-drive:Out',
      }),
      el('SystemUnitClass', { Name: 'Press', RefBaseClassPath: 'SUCL/Machine' }, el('Attribute', { Name: 'Power', AttributeDataType: 'xs:double' }, el('Value', {}, '22')), el('SupportedRoleClass', { RefRoleClassPath: 'RCL/Resource/Robot' })),
    ),
    el('SystemUnitClass', { Name: 'Motor' }, el('Attribute', { Name: 'Rpm', AttributeDataType: 'xs:int' }, el('Value', {}, '1500'))),
    el('SystemUnitClass', { Name: 'Derived', RefBaseClassPath: 'SUCL/Machine/Press' }, el('SupportedRoleClass', { RefRoleClassPath: 'RCL/Missing' })),
    el('SystemUnitClass', { Name: 'Broken', RefBaseClassPath: 'SUCL/Nope' }),
    el('SystemUnitClass', { Name: 'External', RefBaseClassPath: 'ExtLib@ExtSUCL/ExtClass' }, el('SupportedRoleClass', { RefRoleClassPath: 'ExtLib@ExtRCL/ExtRole' })),
    cyclic && el('SystemUnitClass', { Name: 'CycA', RefBaseClassPath: 'SUCL/CycB' }, el('Attribute', { Name: 'A', AttributeDataType: 'xs:string' })),
    cyclic && el('SystemUnitClass', { Name: 'CycB', RefBaseClassPath: 'SUCL/CycA' }, el('Attribute', { Name: 'B', AttributeDataType: 'xs:string' })),
    cyclic && el('SystemUnitClass', { Name: 'Self', RefBaseClassPath: 'SUCL/Self' }),
    names && el('SystemUnitClass', { Name: 'a/b' }, el('SystemUnitClass', { Name: 'c.d', RefBaseClassPath: 'SUCL/[a/b]' })),
    names && el('SystemUnitClass', { Name: 'e:f', RefBaseClassPath: 'SUCL/[a/b]/[c.d]' }),
    names && el('SystemUnitClass', { Name: '[br]' }),
  );
  const atl =
    v === '3.0' &&
    el(
      'AttributeTypeLib',
      { Name: 'ATL' },
      at('Length', null, el('Attribute', { Name: 'Unit', AttributeDataType: 'xs:string' })),
      at('Width', 'ATL/Length'),
      at('Broken', 'ATL/Nope'),
      at('Ext', 'ExtLib@ExtATL/ExtType'),
      cyclic && at('CycA', 'ATL/CycB'),
      cyclic && at('CycB', 'ATL/CycA'),
      names && at('a/b', 'ATL/Length'),
    );
  return [icl, rcl, sucl, atl];
}

function ie(v, name, id, ref, ...children) {
  return el('InternalElement', { Name: name, ID: id, RefBaseSystemUnitPath: ref }, children);
}
function ei(v, name, id, ref) {
  return el('ExternalInterface', { Name: name, ID: id, RefBaseClassPath: ref });
}
function rr(v, ref) {
  return el('RoleRequirements', { RefBaseRoleClassPath: ref });
}
function link(v, name, a, b) {
  return el('InternalLink', { Name: name, RefPartnerSideA: a, RefPartnerSideB: b });
}
const extRefs = [
  el('ExternalReference', { Path: 'test/reads/ext-lib.aml', Alias: 'ExtLib' }),
  el('ExternalReference', { Path: 'test/reads/does-not-exist.aml', Alias: 'Missing' }),
];

for (const v of ['3.0', '2.15']) {
  const s = v === '3.0' ? '30' : '215';
  const lp = (ieId, eiId, eiName) => (v === '3.0' ? eiId : `${ieId}:${eiName}`);
  // broken references
  files[`broken-refs-${s}.aml`] = doc(v, `broken-refs-${s}.aml`, [
    extRefs,
    el(
      'InstanceHierarchy',
      { Name: 'IH' },
      ie(v, 'Good', 'ie-good', 'SUCL/Machine', ei(v, 'P1', 'ei-good-p1', 'ICL/Base/Port'), rr(v, 'RCL/Resource/Robot'), el('SupportedRoleClass', { RefRoleClassPath: 'RCL/Product' })),
      ie(
        v,
        'NoClass',
        'ie-noclass',
        'SUCL/Missing',
        ei(v, 'P1', 'ei-noclass-p1', 'ICL/Missing'),
        ei(v, 'P2', 'ei-noclass-p2', ''),
        rr(v, 'RCL/Nope'),
        el('SupportedRoleClass', { RefRoleClassPath: 'Nope/Nope' }),
        el('Attribute', { Name: 'A', AttributeDataType: 'xs:string', RefAttributeType: v === '3.0' ? 'ATL/Missing' : null }, el('Value', {}, 'x')),
      ),
      ie(v, 'Linked', 'ie-linked', null, ei(v, 'Q', 'ei-linked-q', 'ICL/Base/Port'), link(v, 'ToGood', lp('ie-good', 'ei-good-p1', 'P1'), lp('ie-linked', 'ei-linked-q', 'Q')), link(v, 'Dangling', lp('ie-gone', 'ei-gone', 'X'), lp('ie-linked', 'ei-linked-q', 'Q')), link(v, 'Empty', '', null), link(v, 'Garbage', 'no colon here', ':::')),
      ie(v, 'NoID', null, 'SUCL/Motor'),
      ie(v, 'EmptyRef', 'ie-empty', ''),
      ie(v, 'Weird', 'ie-weird', 'SUCL//Machine'),
      ie(v, 'AliasOnly', 'ie-alias', 'ExtLib@'),
      ie(v, 'NoAlias', 'ie-noalias', 'Missing@SUCL/Machine'),
    ),
    libs(v),
  ]);
  // aliases and external references
  files[`aliases-${s}.aml`] = doc(v, `aliases-${s}.aml`, [
    extRefs,
    el('ExternalReference', { Path: 'test/reads/ext-lib.aml', Alias: 'Dup' }),
    el('ExternalReference', { Path: 'test/reads/ext-lib.aml', Alias: 'Dup' }),
    el(
      'InstanceHierarchy',
      { Name: 'IH' },
      ie(v, 'UsesExt', 'ie-ext', 'ExtLib@ExtSUCL/ExtClass', ei(v, 'E', 'ei-ext', 'ExtLib@ExtICL/ExtInterface'), rr(v, 'ExtLib@ExtRCL/ExtRole')),
      ie(v, 'UsesMissing', 'ie-missing', 'Missing@Lib/Class', ei(v, 'E', 'ei-missing', 'Missing@ICL/X'), rr(v, 'Missing@RCL/Y')),
      ie(v, 'UsesDup', 'ie-dup', 'Dup@ExtSUCL/ExtClass'),
      ie(v, 'Local', 'ie-local', 'SUCL/Machine', rr(v, 'RCL/Ext')),
    ),
    libs(v),
  ]);
  // cyclic inheritance
  files[`cyclic-${s}.aml`] = doc(v, `cyclic-${s}.aml`, [
    el('InstanceHierarchy', { Name: 'IH' }, ie(v, 'Cyc', 'ie-cyc', 'SUCL/CycA', ei(v, 'E', 'ei-cyc', 'ICL/CycA'), rr(v, 'RCL/CycA')), ie(v, 'Self', 'ie-self', 'SUCL/Self', ei(v, 'S', 'ei-self', 'ICL/Self'))),
    libs(v, { cyclic: true }),
  ]);
  // names with path separators and brackets
  files[`names-${s}.aml`] = doc(v, `names-${s}.aml`, [
    el(
      'InstanceHierarchy',
      { Name: 'I/H' },
      ie(v, 'a/b', 'ie-ab', 'SUCL/[a/b]', ei(v, 'x:y', 'ei-xy', 'ICL/[a/b]'), rr(v, 'RCL/[[odd]]'), ie(v, 'c.d', 'ie-cd', 'SUCL/[a/b]/[c.d]', ei(v, 'e[f]', 'ei-ef', 'ICL/[x.y:z]'))),
      ie(v, '[bracket]', 'ie-br', 'SUCL/[[br]]'),
      ie(v, 'plain', 'ie-plain', 'SUCL/e:f', el('Attribute', { Name: 'at/tr', AttributeDataType: 'xs:string' }, el('Attribute', { Name: 'sub.attr', AttributeDataType: 'xs:string' }))),
    ),
    el('InstanceHierarchy', { Name: 'I' }, el('InternalElement', { Name: 'H', ID: 'ie-h' })),
    libs(v, { names: true }),
  ]);
  // mirrors of mirrors
  const mirrorRef = (id) => (v === '3.0' ? id : id);
  files[`mirrors-${s}.aml`] = doc(v, `mirrors-${s}.aml`, [
    el(
      'InstanceHierarchy',
      { Name: 'IH' },
      ie(v, 'Master', 'ie-master', 'SUCL/Machine', ei(v, 'Plug', 'ei-master-plug', 'ICL/Base/Port'), el('Attribute', { Name: 'Speed', AttributeDataType: 'xs:double', ID: v === '3.0' ? 'at-master-speed' : null }, el('Value', {}, '3'))),
      ie(v, 'Mirror', 'ie-mirror', mirrorRef('ie-master')),
      ie(v, 'MirrorOfMirror', 'ie-mirror2', mirrorRef('ie-mirror')),
      ie(v, 'BrokenMirror', 'ie-mirror3', mirrorRef('ie-nothing')),
      ie(v, 'SelfMirror', 'ie-selfmirror', mirrorRef('ie-selfmirror')),
      ie(v, 'Holder', 'ie-holder', null, ei(v, 'PlugMirror', 'ei-mirror', 'ei-master-plug'), ei(v, 'PlugMirror2', 'ei-mirror2', 'ei-mirror'), ei(v, 'Nowhere', 'ei-nowhere', 'ei-nothing'), link(v, 'ML', lp('ie-holder', 'ei-mirror', 'PlugMirror'), lp('ie-master', 'ei-master-plug', 'Plug'))),
      v === '3.0' && ie(v, 'AttrHolder', 'ie-attrholder', null, el('Attribute', { Name: 'SpeedMirror', AttributeDataType: 'xs:double', RefAttributeType: 'at-master-speed' }), el('Attribute', { Name: 'SpeedMirror2', AttributeDataType: 'xs:double', RefAttributeType: 'at-nothing' })),
    ),
    libs(v),
  ]);
  // duplicate names and IDs
  files[`duplicates-${s}.aml`] = doc(v, `duplicates-${s}.aml`, [
    el(
      'InstanceHierarchy',
      { Name: 'IH' },
      ie(v, 'Twin', 'dup-id', 'SUCL/Machine', ei(v, 'P', 'dup-ei', 'ICL/Base/Port'), ei(v, 'P', 'dup-ei', 'ICL/Base/Signal')),
      ie(v, 'Twin', 'dup-id', 'SUCL/Motor', el('Attribute', { Name: 'X', AttributeDataType: 'xs:string' }), el('Attribute', { Name: 'X', AttributeDataType: 'xs:int' })),
      ie(v, 'Other', 'other-id', null, link(v, 'L', lp('dup-id', 'dup-ei', 'P'), lp('other-id', 'dup-ei', 'P'))),
    ),
    el('InstanceHierarchy', { Name: 'IH' }, ie(v, 'Twin', 'dup-id')),
    libs(v),
    el('SystemUnitClassLib', { Name: 'SUCL' }, el('SystemUnitClass', { Name: 'Machine' }), el('SystemUnitClass', { Name: 'Machine' })),
  ]);
  // more cycles: a tail leading into a cycle of three, a class derived from its own child, and
  // mirrors of each other (instances, interfaces, attributes)
  const g = (n) => `00000000-0000-4000-a000-${String(n).padStart(12, '0')}`;
  const shapes = (tag, lib, extra = () => []) => {
    const ref = tag === 'AttributeType' ? 'RefAttributeType' : 'RefBaseClassPath';
    return el(
      `${tag}Lib`,
      { Name: lib },
      el(tag, { Name: 'Tail', [ref]: `${lib}/A` }, extra('Tail')),
      el(tag, { Name: 'A', [ref]: `${lib}/B` }, extra('A')),
      el(tag, { Name: 'B', [ref]: `${lib}/C` }, extra('B')),
      el(tag, { Name: 'C', [ref]: `${lib}/A` }, extra('C')),
      el(tag, { Name: 'Outer', [ref]: `${lib}/Outer/Inner` }, extra('Outer'), el(tag, { Name: 'Inner', [ref]: 'Outer' }, extra('Inner'))),
    );
  };
  const attr = (n) => el('Attribute', { Name: 'At' + n, AttributeDataType: 'xs:string' });
  files[`cyclic-shapes-${s}.aml`] = doc(v, `cyclic-shapes-${s}.aml`, [
    el(
      'InstanceHierarchy',
      { Name: 'IH' },
      ie(v, 'Rho', 'ie-rho', 'SUCL3/Tail', ei(v, 'E', 'ei-rho', 'ICL3/Tail'), rr(v, 'RCL3/Tail'), v === '3.0' && el('Attribute', { Name: 'T', AttributeDataType: 'xs:string', RefAttributeType: 'ATL3/Tail' })),
      ie(v, 'Nested', 'ie-nested', 'SUCL3/Outer', ei(v, 'E', 'ei-nested', 'ICL3/Outer/Inner'), rr(v, 'RCL3/Outer')),
      ie(v, 'MirX', g(1), g(2)),
      ie(v, 'MirY', g(2), g(1)),
      ie(v, 'MirSelf', g(3), g(3)),
      v === '3.0' && ie(v, 'Plugs', g(4), null, ei(v, 'P', g(5), g(6)), ei(v, 'Q', g(6), g(5)), ei(v, 'S', g(7), g(7))),
      v === '3.0' && el('InternalElement', { Name: 'AttA', ID: g(8) }, el('Attribute', { Name: 'S', AttributeDataType: 'xs:string', RefAttributeType: `${g(9)}/S` })),
      v === '3.0' && el('InternalElement', { Name: 'AttB', ID: g(9) }, el('Attribute', { Name: 'S', AttributeDataType: 'xs:string', RefAttributeType: `${g(8)}/S` })),
      v === '3.0' && el('InternalElement', { Name: 'AttC', ID: g(10) }, el('Attribute', { Name: 'T', AttributeDataType: 'xs:string', RefAttributeType: `${g(10)}/T` })),
    ),
    shapes('InterfaceClass', 'ICL3', (n) => attr(n)),
    shapes('RoleClass', 'RCL3', (n) => attr(n)),
    shapes('SystemUnitClass', 'SUCL3', (n) => [attr(n), el('SupportedRoleClass', { RefRoleClassPath: 'RCL3/Tail' })]),
    v === '3.0' && shapes('AttributeType', 'ATL3', (n) => attr(n)),
  ]);
}

// the external library referenced by alias
files['ext-lib.aml'] = doc('3.0', 'ext-lib.aml', [
  el('InterfaceClassLib', { Name: 'ExtICL' }, el('InterfaceClass', { Name: 'ExtInterface' }, el('Attribute', { Name: 'ExtAttr', AttributeDataType: 'xs:string' }))),
  el('RoleClassLib', { Name: 'ExtRCL' }, el('RoleClass', { Name: 'ExtRole' }, el('Attribute', { Name: 'RoleAttr', AttributeDataType: 'xs:string' }))),
  el('SystemUnitClassLib', { Name: 'ExtSUCL' }, el('SystemUnitClass', { Name: 'ExtClass' }, el('Attribute', { Name: 'ClassAttr', AttributeDataType: 'xs:string' }), el('SupportedRoleClass', { RefRoleClassPath: 'ExtRCL/ExtRole' }))),
  el('AttributeTypeLib', { Name: 'ExtATL' }, el('AttributeType', { Name: 'ExtType', AttributeDataType: 'xs:string' })),
]);

// ------------------------------------------------------------------ seeded random documents
function randomDoc(v, k) {
  const nameChars = ['a', 'b', 'X', '1', '_', ' ', '/', '.', ':', '[', ']', '@', '-'];
  const names = () => (chance(0.8) ? pick(['Pump', 'Valve', 'Tank', 'Motor', 'Sensor', 'Port', 'Arm', 'Line']) + (chance(0.5) ? int(4) : '') : Array.from({ length: 1 + int(5) }, () => pick(nameChars)).join(''));
  const ids = [];
  const newId = () => {
    const id = chance(0.1) && ids.length > 0 ? pick(ids) : chance(0.7) ? guid() : chance(0.5) ? '{' + guid() + '}' : 'id-' + int(1000);
    ids.push(id);
    return id;
  };
  const classPaths = { suc: [], rc: [], ic: [], at: [] };
  const ref = (kind) => {
    const r = rnd();
    if (r < 0.6 && classPaths[kind].length > 0) return pick(classPaths[kind]);
    if (r < 0.7) return 'ExtLib@' + pick(['ExtSUCL/ExtClass', 'ExtRCL/ExtRole', 'ExtICL/ExtInterface', 'ExtATL/ExtType']);
    if (r < 0.8) return 'Lib/Missing' + int(9);
    if (r < 0.85) return '';
    return null;
  };
  const escName = (n) => (/[/.:[\]@]/.test(n) ? `[${n}]` : n);
  function classes(kind, tag, lib, depth, parentPath) {
    const out = [];
    const n = 1 + int(3);
    for (let i = 0; i < n; i++) {
      const name = names();
      const p = parentPath + '/' + escName(name);
      const children = [];
      if (kind !== 'at' && chance(0.5)) children.push(el('Attribute', { Name: names(), AttributeDataType: pick(['xs:string', 'xs:double', 'xs:boolean', 'xs:int']) }, chance(0.5) && el('Value', {}, String(int(100)))));
      if ((kind === 'suc' || kind === 'rc') && chance(0.5)) children.push(ei(v, names(), v === '2.15' || chance(0.5) ? newId() : null, ref('ic')));
      if (kind === 'suc' && chance(0.4)) children.push(el('SupportedRoleClass', { RefRoleClassPath: ref('rc') }));
      if (kind === 'suc' && chance(0.4)) children.push(ie(v, names(), newId(), ref('suc')));
      const attrs = { Name: name };
      if (chance(0.7)) attrs[kind === 'at' ? 'RefAttributeType' : 'RefBaseClassPath'] = ref(kind);
      if (kind === 'at') attrs.AttributeDataType = 'xs:string';
      classPaths[kind].push(p);
      if (depth < 2 && chance(0.4)) children.push(...classes(kind, tag, lib, depth + 1, p));
      out.push(el(tag, attrs, children));
    }
    return out;
  }
  const libsOut = [];
  for (const [kind, libTag, tag] of [
    ['ic', 'InterfaceClassLib', 'InterfaceClass'],
    ['rc', 'RoleClassLib', 'RoleClass'],
    ['suc', 'SystemUnitClassLib', 'SystemUnitClass'],
    ...(v === '3.0' ? [['at', 'AttributeTypeLib', 'AttributeType']] : []),
  ]) {
    const libName = names();
    libsOut.push(el(libTag, { Name: libName }, classes(kind, tag, libTag, 0, escName(libName))));
  }
  // instances: interfaces known for links and mirrors
  const interfaces = [];
  const elements = [];
  function instances(depth, parentId) {
    const out = [];
    const n = 1 + int(4);
    for (let i = 0; i < n; i++) {
      const id = newId();
      elements.push(id);
      const children = [];
      const eiCount = int(3);
      for (let j = 0; j < eiCount; j++) {
        const eiName = names();
        const eiId = newId();
        interfaces.push({ ie: id, ei: eiId, name: eiName });
        children.push(ei(v, eiName, eiId, chance(0.15) && interfaces.length > 1 ? pick(interfaces).ei : ref('ic')));
      }
      if (chance(0.5)) children.push(el('Attribute', { Name: names(), AttributeDataType: 'xs:string', RefAttributeType: v === '3.0' && chance(0.5) ? ref('at') : null }, el('Value', {}, 'v' + int(10))));
      if (chance(0.5)) children.push(rr(v, ref('rc')));
      if (chance(0.3)) children.push(el('SupportedRoleClass', { RefRoleClassPath: ref('rc') }));
      if (depth < 3 && chance(0.5)) children.push(...instances(depth + 1, id));
      if (interfaces.length > 2 && chance(0.4)) {
        const a = pick(interfaces);
        const b = pick(interfaces);
        const side = (x) => (chance(0.1) ? 'broken-' + int(9) : v === '3.0' ? x.ei : `${x.ie}:${x.name}`);
        children.push(link(v, names(), side(a), side(b)));
      }
      const refPath = chance(0.15) && elements.length > 1 ? pick(elements) : ref('suc');
      out.push(ie(v, names(), id, refPath, children));
    }
    return out;
  }
  const ihs = [];
  for (let i = 0; i < 1 + int(2); i++) ihs.push(el('InstanceHierarchy', { Name: names() }, instances(0, null)));
  return doc(v, `random-${k}.aml`, [chance(0.6) && extRefs, ihs, libsOut]);
}

for (let k = 0; k < randomDocs; k++) {
  const v = k % 2 === 0 ? '3.0' : '2.15';
  files[`random-${k}-${v === '3.0' ? '30' : '215'}.aml`] = randomDoc(v, k);
}

fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(outDir)) if (f.endsWith('.aml')) fs.unlinkSync(path.join(outDir, f));
for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(outDir, name), text);
console.log(`${Object.keys(files).length} files in ${outDir}`);
