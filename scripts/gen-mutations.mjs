// Generates the operation scripts of the "mutations" coverage package (seeded) for
// oracle/MutationsOracle.cs and test/engine/mutations.oracle.test.ts.
//   node scripts/gen-mutations.mjs <out.json> [randomScripts] [opsPerScript] [seed]
// The first scripts are fixed scenarios (every operation on small documents of both CAEX
// versions, with and without the recording undo/redo service); the rest are random.
import { writeFileSync } from 'node:fs';

const [out = 'test/mutations/scripts.json', nScripts = '400', nOps = '40', seedArg = '3682'] = process.argv.slice(2);
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
const small = () => pick([-1, 0, 0, 1, 1, 2, 3, 7]);

const STARTS = ['new30', 'new30', 'new215', 'new215', 'newDefault', '12_MirrorObject.aml', '5_SUC.aml', '6_RCL.aml', '7_ICL.aml', '9_ExtInt_IntLink.aml', '13_Facet.aml', 'plant.aml', 'legacy-caex215.aml', '11_Constraints.aml', '3_IE_Attribute.aml', '10_RefSemantic.aml', '8_AMLAttributeLibrary.aml', 'Topology.aml', 'DemoLib.aml', '1_AMLBaseLibraries.aml', 'Deviations.aml', 'EFL_DomainLibrary_v0.1.0.aml', 'VDI_FPD_DomainLibrary_v0.7.aml', 'CommunicationRoleClassLib_V1.0.1.aml', '2016_OPCF_UA-Nodeset-AML_Topology.aml'];
const OTHERS = [null, '5_SUC.aml', '6_RCL.aml', '7_ICL.aml', '9_ExtInt_IntLink.aml', 'legacy-caex215.aml', '12_MirrorObject.aml', '8_AMLAttributeLibrary.aml', 'plant.aml', 'DemoLib.aml', 'Topology.aml', 'EFL_DomainLibrary_v0.1.0.aml', 'AutomationML_ARAPC_Libraries_AMLEd1_1.4.0.aml', 'CommunicationInterfaceClassLib_V1.0.0.aml'];
const NAMES = [null, '', 'A', 'B', 'Pump', 'Tank', 'x', 'Name with space', 'a/b', 'a.b', 'a:b', 'Ä', '[x]', 'dup', 'dup', 'InternalElement', 'Attribute'];
const SEQS = [
  'InternalElement', 'InternalElement', 'Attribute', 'Attribute', 'ExternalInterface', 'ExternalInterface', 'InternalLink', 'SupportedRoleClass', 'RoleRequirements',
  'SystemUnitClass', 'RoleClass', 'InterfaceClass', 'AttributeType', 'InstanceHierarchy', 'SystemUnitClassLib', 'RoleClassLib', 'InterfaceClassLib',
  'AttributeTypeLib', 'ExternalReference', 'SourceDocumentInformation', 'Revision', 'SourceObjectInformation', 'Constraint', 'RefSemantic',
  'AttributeNameMapping', 'InterfaceNameMapping', 'InterfaceIDMapping',
];
const TAGS = ['*', '*', '*', '*', '*', 'InternalElement', 'Attribute', 'ExternalInterface', 'InternalLink', 'SupportedRoleClass', 'RoleRequirements', 'SystemUnitClass', 'RoleClass', 'InterfaceClass', 'AttributeType', 'InstanceHierarchy', 'SystemUnitClassLib', 'RoleClassLib', 'InterfaceClassLib', 'AttributeTypeLib', 'ExternalReference', 'Revision', 'MappingObject', 'Constraint', 'RefSemantic', 'SourceDocumentInformation', 'SourceObjectInformation'];
const ATTR_NAMES = ['Name', 'ID', 'RefBaseSystemUnitPath', 'RefBaseClassPath', 'RefBaseRoleClassPath', 'RefRoleClassPath', 'RefAttributeType', 'RefPartnerSideA', 'RefPartnerSideB', 'AttributeDataType', 'Alias', 'Path', 'Unit', 'ChangeMode', 'FileName', 'SchemaVersion', 'Foo', 'RoleAttributeName', 'SystemUnitInterfaceID'];
const PATHS = [null, '', 'NoLib/NoClass', 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole', 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface', 'alias@Lib/Class', 'Lib/[a/b]', 'x'];

function val() {
  return pick([
    { t: 'n' },
    { t: 's', v: pick(['', 'x', 'Pump', 'a/b', 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole', '9d2c8e36-7d7c-4c5f-9c56-2f4f5b0a1c11', 'true']) },
    { t: 'i', v: pick([0, 3, -7, 65536]) },
    { t: 'd', v: pick([1.5, -0.25, 1e21, 3.14159, 0.1]) },
    { t: 'b', v: chance(0.5) },
    { t: 'dt', v: pick(['2020-01-02T03:04:05', '2021-12-31T23:59:59.1234567']) },
  ]);
}

function tuples() {
  const n = pick([0, 1, 2, 3]);
  const r = [];
  for (let i = 0; i < n; i++) r.push({ n: pick(['Name', 'ID', 'Alias', 'Path', 'Description', 'Version', 'Value', 'AttributeDataType', 'RefBaseRoleClassPath', 'Unknown', 'DefaultValue', 'OriginName', 'LastWritingDateTime', 'AuthorName', 'RevisionDate', 'Comment']), v: val() });
  return r;
}

function src() {
  return { k: pick(['same', 'same', 'other', 'copy', 'pool', 'pool', 'create', 'null']), i: int() };
}

const OPS = [
  [5, () => ({ op: 'seq', p: pick(SEQS), o: int(), act: 'append', mode: pick(['plain', 'name', 'tuples']), name: pick(NAMES), tuples: tuples() })],
  [3, () => ({ op: 'seq', p: pick(SEQS), o: int(), act: 'prepend', mode: pick(['plain', 'name', 'tuples']), name: pick(NAMES), tuples: tuples() })],
  [5, () => ({ op: 'seq', p: pick(SEQS), o: int(), act: 'insert', src: src(), asFirst: chance(0.5), asIs: chance(0.3) })],
  [3, () => ({ op: 'seq', p: pick(SEQS), o: int(), act: 'insertAt', src: src(), index: small() })],
  [3, () => ({ op: 'seq', p: pick(SEQS), o: int(), act: 'move', from: small(), to: small() })],
  [2, () => ({ op: 'seq', p: pick(SEQS), o: int(), act: 'removeElement', index: small() })],
  [2, () => ({ op: 'seq', p: pick(SEQS), o: int(), act: 'removeAt', index: small() })],
  [1, () => ({ op: 'seq', p: pick(SEQS), o: int(), act: 'removeAll' })],
  [3, () => ({ op: 'seq', p: pick(SEQS), o: int(), act: 'query', index: small(), name: pick(NAMES), name2: pick(NAMES) })],
  [4, () => ({ op: 'boInsert', a: int(), tag: pick(TAGS), src: src(), asFirst: chance(0.5), asIs: chance(0.3) })],
  [2, () => ({ op: 'boInsertAt', a: int(), tag: pick(TAGS), src: src(), pos: small() })],
  [4, () => ({ op: 'boImport', a: int(), tag: pick(TAGS), src: src(), name: pick(NAMES), withSub: chance(0.5) })],
  [1, () => ({ op: 'newRevision', a: int(), author: pick(NAMES), asFirst: chance(0.5) })],
  [4, () => ({ op: 'copy', k: pick(['obj', 'basic', 'ie', 'suc', 'rc', 'ic', 'at', 'attr']), a: int(), deep: chance(0.7), ids: chance(0.7), sub: chance(0.3) })],
  [1, () => ({ op: 'copyNamed', a: int(), name: pick(NAMES) })],
  [2, () => ({ op: 'newGuid', a: int(), upd: chance(0.6) })],
  [2, () => ({ op: 'rename', a: int(), name: pick(NAMES) })],
  [3, () => ({ op: 'changeNameRefs', a: int(), name: pick(NAMES) })],
  [2, () => ({ op: 'copyTree', a: int(), b: int(), name: pick(NAMES) })],
  [4, () => ({ op: 'instantiate', k: pick(['suc', 'suc', 'rc', 'ic', 'at']), a: int(), target: pick([null, 'A', 'B']) })],
  [1, () => ({ op: 'instantiateNamed', k: pick(['suc', 'ic', 'at']), a: int(), name: pick(NAMES) })],
  [2, () => ({ op: 'updateInstance', k: pick(['ie', 'ei', 'attr', 'rr', 'src']), a: int() })],
  [3, () => ({ op: 'mirror', k: pick(['ie', 'ei', 'attr']), a: int() })],
  [2, () => ({ op: 'setMaster', k: pick(['ie', 'ei', 'attr']), a: int(), b: chance(0.2) ? -1 : int() })],
  [2, () => ({ op: 'createSUC', a: int() })],
  [3, () => ({ op: 'addRoleIE', a: int(), b: int(), byPath: chance(0.4), path: chance(0.3) ? pick(PATHS) : null, addSRC: chance(0.3), addUnique: chance(0.7), addInstance: chance(0.4) })],
  [2, () => ({ op: 'addRoleSUC', a: int(), b: int(), byPath: chance(0.4), path: chance(0.3) ? pick(PATHS) : null, addUnique: chance(0.7) })],
  [2, () => ({ op: 'replaceRole', k: pick(['ie', 'suc']), a: int(), b: int(), addSRC: chance(0.3) })],
  [2, () => ({ op: 'hasRole', k: pick(['ie', 'suc', 'rr']), a: int(), b: int(), c: int(), path: chance(0.3) ? pick(PATHS) : null })],
  [3, () => ({ op: 'addInterface', a: int(), b: int(), byPath: chance(0.4), path: chance(0.3) ? pick(PATHS) : null, addUnique: chance(0.7), addInstance: chance(0.4), name: pick(NAMES) })],
  [3, () => ({ op: 'link', a: int(), b: int(), name: pick(NAMES) })],
  [2, () => ({ op: 'linkSet', a: int(), b: int(), c: int(), side: pick(['A', 'B']), mode: pick(['ref', 'iface', 'eiId', 'ieId']), value: chance(0.4) ? pick([null, '', 'x:y', 'abc', '9d2c8e36-7d7c-4c5f-9c56-2f4f5b0a1c11:EI']) : null })],
  [2, () => ({ op: 'insertSibling', k: pick(['il', 'extref', 'ie', 'suc', 'rc', 'ic', 'attr']), a: int(), src: src(), before: chance(0.5) })],
  [4, () => ({ op: 'remove', k: pick(['wrap', 'basic', 'obj', 'ie', 'suc', 'rc', 'ic', 'at', 'attr', 'ei', 'il', 'rr', 'src', 'extref', 'ih', 'lib', 'mapping', 'sdi', 'revision', 'file']), a: int(), rel: chance(0.5) })],
  [2, () => ({ op: 'extRefNew', path: pick(['lib.aml', 'Lib%20x.aml', 'lib.aml', '', null]), alias: pick(['lib', 'lib', 'a', '', null]) })],
  [2, () => ({ op: 'extRefSet', a: int(), what: pick(['alias', 'path', 'version', 'extension']), value: pick([null, '', 'lib', 'Lib%20x.aml', 'Lib x.aml', '1.0.0']) })],
  [1, () => ({ op: 'extRefInsert', src: src() })],
  [1, () => ({ op: 'sdiAdd', props: { OriginName: pick(NAMES), OriginID: pick([null, 'id']), OriginVendor: 'v', OriginVendorURL: pick([null, 'http://x']), OriginVersion: '1.0', OriginRelease: pick([null, '1.0.1']), OriginProjectTitle: null, OriginProjectID: pick([null, 'p']), LastWritingDateTime: { t: 'dt', v: pick(['2020-01-02T03:04:05', '2020-07-01T12:00:00Z', '1999-12-31T23:59:59']) } } })],
  [1, () => ({ op: 'sdiSet', a: int(), prop: pick(['OriginName', 'OriginID', 'OriginVendor', 'OriginVendorURL', 'OriginVersion', 'OriginRelease', 'OriginProjectTitle', 'OriginProjectID', 'LastWritingDateTime']), value: pick(NAMES), dt: { t: 'dt', v: '2019-05-06T07:08:09' } })],
  [2, () => ({ op: 'mappingNew', k: pick(['ie', 'rr', 'src']), a: int() })],
  [2, () => ({ op: 'mappingAdd', a: int(), kind: pick(['attrName', 'ifName', 'ifId', 'ifIdObj']), x: pick(NAMES), y: pick(NAMES), b: int(), c: int() })],
  [2, () => ({ op: 'fileImport', fn: pick(['Import_InstanceHierarchy', 'ImportInstanceHierarchy', 'Insert_InstanceHierarchy', 'Import_SystemUnitClassLibHierarchy', 'ImportSystemUnitClassLib', 'Insert_SystemUnitClassLibHierarchy', 'Import_RoleClassLibHierarchy', 'ImportRoleClassLib', 'Insert_RoleClassLibHierarchy', 'Import_InterfaceClassLibHierarchy', 'ImportInterfaceClassLib', 'Insert_InterfaceClassLibHierarchy', 'Import_AttributeTypeLib', 'ImportAttributeTypeLib']), src: src() })],
  [3, () => ({ op: 'setXAttr', k: pick(['basic', 'obj', 'ie', 'ei', 'il', 'rr', 'src', 'attr', 'suc']), a: int(), name: pick(ATTR_NAMES), value: val() })],
  [2, () => ({ op: 'setBasic', a: int(), prop: pick(['Description', 'Version', 'Copyright', 'ChangeMode']), value: pick([null, '', 'text', '1.0.0']), mode: pick([0, 1, 2, 3, 4]) })],
  [1, () => ({ op: 'newElem', a: int(), which: pick(['Description', 'Version', 'Copyright']) })],
  [3, () => ({ op: 'setRef', k: pick(['ie', 'suc', 'rc', 'ic', 'ei', 'rr', 'src', 'attr', 'at']), a: int(), b: int(), value: chance(0.4) ? pick(PATHS) : null })],
  [2, () => ({ op: 'recreate', a: int(), b: int() })],
  [1, () => ({ op: 'createAT', a: int() })],
  [1, () => ({ op: 'createSRC', a: int() })],
  [1, () => ({ op: 'createICFamily', a: int() })],
  [2, () => ({ op: 'wrapperValue', a: int(), which: pick(['Description', 'Version', 'Copyright']), value: pick([null, '', 'text', '1.0.0']) })],
  [2, () => ({ op: 'insertNew', k: pick(['basic', 'ie', 'rr', 'src', 'attr']), a: int(), which: pick(['DescriptionElement', 'VersionElement', 'CopyrightElement', 'MappingObject', 'MappingObject']) })],
];

// Objects addressed by "b" come from the other document in a quarter of the operations.
function withOther(op) {
  if ('b' in op && chance(0.25)) op.bd = true;
  return op;
}

const total = OPS.reduce((s, [w]) => s + w, 0);
function nextOp() {
  let r = rnd() * total;
  for (const [w, f] of OPS) {
    if ((r -= w) < 0) return withOther(f());
  }
  return withOther(OPS[0][1]());
}

const scripts = [];

// Fixed scenarios: each operation kind a few times on the same small documents, both versions.
const scenarioStarts = [
  ['new30', '5_SUC.aml'],
  ['new215', 'legacy-caex215.aml'],
  ['9_ExtInt_IntLink.aml', '6_RCL.aml'],
  ['12_MirrorObject.aml', '7_ICL.aml'],
  ['legacy-caex215.aml', '9_ExtInt_IntLink.aml'],
  ['plant.aml', '12_MirrorObject.aml'],
];
for (const [, gen] of OPS) {
  for (const [start, other] of scenarioStarts) {
    const ops = [];
    for (let j = 0; j < 12; j++) ops.push(withOther(gen()));
    scripts.push({ start, other, ops });
  }
}

// Hand-written flows on new documents of both versions: build a small model, then map, link,
// instantiate, mirror and remove, with the undo/redo service; everything undone at the end.
for (const start of ['new215', 'new30']) {
  for (const undo of [false, true]) {
    const ops = [
      { op: 'seq', p: 'InstanceHierarchy', o: 0, act: 'append', mode: 'name', name: 'IH' },
      { op: 'seq', p: 'RoleClassLib', o: 0, act: 'append', mode: 'name', name: 'RCL' },
      { op: 'seq', p: 'InterfaceClassLib', o: 0, act: 'append', mode: 'name', name: 'ICL' },
      { op: 'seq', p: 'SystemUnitClassLib', o: 0, act: 'append', mode: 'name', name: 'SUCL' },
      { op: 'seq', p: 'AttributeTypeLib', o: 0, act: 'append', mode: 'name', name: 'ATL' },
      { op: 'seq', p: 'RoleClass', o: 0, act: 'append', mode: 'name', name: 'Role' },
      { op: 'seq', p: 'RoleClass', o: 1, act: 'append', mode: 'name', name: 'SubRole' },
      { op: 'seq', p: 'InterfaceClass', o: 0, act: 'append', mode: 'name', name: 'Port' },
      { op: 'seq', p: 'AttributeType', o: 0, act: 'append', mode: 'name', name: 'Length' },
      { op: 'seq', p: 'Attribute', o: 0, act: 'append', mode: 'name', name: 'RoleAttr' },
      { op: 'seq', p: 'ExternalInterface', o: 0, act: 'append', mode: 'name', name: 'RolePort' },
      { op: 'seq', p: 'SystemUnitClass', o: 0, act: 'append', mode: 'name', name: 'Machine' },
      { op: 'seq', p: 'Attribute', o: 3, act: 'append', mode: 'name', name: 'Speed' },
      { op: 'addInterface', a: 3, b: 0, byPath: false, path: null, addUnique: true, addInstance: true, name: 'P1' },
      { op: 'addRoleSUC', a: 0, b: 0, byPath: false, path: null, addUnique: true },
      { op: 'seq', p: 'InternalElement', o: 0, act: 'append', mode: 'name', name: 'Plant' },
      { op: 'instantiate', k: 'suc', a: 0, target: null },
      { op: 'seq', p: 'InternalElement', o: 0, act: 'insert', src: { k: 'pool', i: 0 }, asFirst: false, asIs: false },
      { op: 'instantiate', k: 'suc', a: 0, target: 'A' },
      { op: 'boInsert', a: 0, tag: 'InternalElement', src: { k: 'pool', i: 1 }, asFirst: false, asIs: false },
      { op: 'addRoleIE', a: 0, b: 1, byPath: false, path: null, addSRC: false, addUnique: true, addInstance: true },
      { op: 'addRoleIE', a: 1, b: 0, byPath: true, path: null, addSRC: false, addUnique: false, addInstance: false },
      { op: 'addRoleIE', a: 1, b: 1, byPath: false, path: null, addSRC: true, addUnique: true, addInstance: false },
      { op: 'addInterface', a: 0, b: 0, byPath: true, path: null, addUnique: false, addInstance: false, name: 'Q' },
      { op: 'mappingNew', k: 'ie', a: 1 },
      { op: 'mappingNew', k: 'rr', a: 0 },
      { op: 'mappingNew', k: 'src', a: 0 },
      { op: 'mappingAdd', a: 0, kind: 'attrName', x: 'Speed', y: 'RoleAttr' },
      { op: 'mappingAdd', a: 0, kind: 'ifName', x: 'P1', y: 'RolePort' },
      { op: 'mappingAdd', a: 0, kind: 'ifId', x: 'a', y: 'b' },
      { op: 'mappingAdd', a: 1, kind: 'ifIdObj', x: null, y: null, b: 0, c: 1 },
      { op: 'mappingAdd', a: 2, kind: 'attrName', x: 'x', y: 'y' },
      { op: 'seq', p: 'AttributeNameMapping', o: 0, act: 'query', index: 0, name: 'Speed', name2: null },
      { op: 'link', a: 0, b: 1, name: 'L1' },
      { op: 'link', a: 1, b: 2, name: 'L2' },
      { op: 'linkSet', a: 0, b: 2, c: 1, side: 'A', mode: 'iface', value: null },
      { op: 'linkSet', a: 1, b: 0, c: 0, side: 'B', mode: 'ieId', value: null },
      { op: 'mirror', k: 'ie', a: 1 },
      { op: 'seq', p: 'InternalElement', o: 0, act: 'insert', src: { k: 'pool', i: 2 }, asFirst: true, asIs: false },
      { op: 'mirror', k: 'ei', a: 0 },
      { op: 'mirror', k: 'attr', a: 0 },
      { op: 'setMaster', k: 'ie', a: 0, b: 2 },
      { op: 'updateInstance', k: 'ie', a: 1 },
      { op: 'seq', p: 'Attribute', o: 3, act: 'append', mode: 'name', name: 'Added' },
      { op: 'updateInstance', k: 'ie', a: 1 },
      { op: 'updateInstance', k: 'rr', a: 0 },
      { op: 'updateInstance', k: 'ei', a: 1 },
      { op: 'updateInstance', k: 'attr', a: 2 },
      { op: 'updateInstance', k: 'src', a: 0 },
      { op: 'createSUC', a: 1 },
      { op: 'boInsert', a: 0, tag: 'SystemUnitClass', src: { k: 'pool', i: 0 }, asFirst: false, asIs: false },
      { op: 'replaceRole', k: 'ie', a: 1, b: 1, addSRC: false },
      { op: 'replaceRole', k: 'suc', a: 0, b: 1, addSRC: false },
      { op: 'hasRole', k: 'ie', a: 1, b: 0, c: 0, path: null },
      { op: 'hasRole', k: 'suc', a: 0, b: 0, c: 0, path: null },
      { op: 'changeNameRefs', a: 0, name: 'Role2' },
      { op: 'changeNameRefs', a: 2, name: 'Machine2' },
      { op: 'copyTree', a: 0, b: 1, name: 'RoleCopy' },
      { op: 'newGuid', a: 5, upd: true },
      { op: 'newGuid', a: 9, upd: true },
      { op: 'rename', a: 9, name: 'Renamed' },
      { op: 'seq', p: 'InternalElement', o: 0, act: 'move', from: 0, to: 2 },
      { op: 'seq', p: 'InternalElement', o: 0, act: 'move', from: 2, to: 0 },
      { op: 'extRefNew', path: 'lib.aml', alias: 'lib' },
      { op: 'extRefNew', path: 'other.aml', alias: 'lib' },
      { op: 'extRefNew', path: 'lib.aml', alias: 'x' },
      { op: 'extRefSet', a: 0, what: 'version', value: '1.0.0' },
      { op: 'extRefSet', a: 1, what: 'extension', value: null },
      { op: 'sdiAdd', props: { OriginName: 'Tool', OriginID: 'id', OriginVendor: 'v', OriginVendorURL: null, OriginVersion: '1.0', OriginRelease: null, OriginProjectTitle: 'P', OriginProjectID: null, LastWritingDateTime: { t: 'dt', v: '2020-07-01T12:00:00Z' } } },
      { op: 'newRevision', a: 3, author: 'me', asFirst: false },
      { op: 'remove', k: 'il', a: 0, rel: true },
      { op: 'remove', k: 'ei', a: 1, rel: true },
      { op: 'remove', k: 'rc', a: 1, rel: true },
      { op: 'remove', k: 'ic', a: 0, rel: true },
      { op: 'remove', k: 'suc', a: 0, rel: true },
      { op: 'remove', k: 'at', a: 0, rel: true },
      { op: 'remove', k: 'ie', a: 0, rel: true },
      { op: 'remove', k: 'mapping', a: 0, rel: true },
      { op: 'remove', k: 'extref', a: 0, rel: false },
      { op: 'poolText' },
    ];
    if (undo) for (let j = 0; j < 120; j++) ops.push({ op: 'undo' });
    if (undo) for (let j = 0; j < 30; j++) ops.push({ op: 'redo' });
    scripts.push({ start, other: '5_SUC.aml', undo, ops });
  }
}

// Undo/redo: random operations, each followed by undo (and sometimes redo).
for (let i = 0; i < 40; i++) {
  const ops = [];
  for (let j = 0; j < 20; j++) {
    ops.push(nextOp());
    if (chance(0.5)) ops.push({ op: 'undo' });
    if (chance(0.3)) ops.push({ op: 'redo' });
  }
  for (let j = 0; j < 25; j++) ops.push({ op: 'undo' });
  for (let j = 0; j < 5; j++) ops.push({ op: 'redo' });
  scripts.push({ start: pick(STARTS), other: pick(OTHERS), undo: true, ops });
}

// External reference resolver: objects of the other document are external (alias "ext").
const RESOLVER_OPS = OPS.filter(([, g]) => ['seq', 'boInsert', 'boImport', 'boInsertAt', 'setRef', 'setMaster', 'addRoleIE', 'addRoleSUC', 'addInterface', 'fileImport', 'extRefNew', 'instantiate', 'copyTree', 'hasRole', 'replaceRole'].includes(g().op));
for (let i = 0; i < 60; i++) {
  const ops = [];
  if (chance(0.5)) ops.push({ op: 'extRefNew', path: pick(['other.aml', 'lib.aml']), alias: pick(['ext', 'ext', 'lib']) });
  for (let j = 0; j < 30; j++) {
    const op = pick(RESOLVER_OPS)[1]();
    if ('b' in op && chance(0.7)) op.bd = true;
    if (op.src && chance(0.7)) op.src.k = 'other';
    ops.push(op);
  }
  scripts.push({ start: pick(STARTS), other: pick(OTHERS.filter((o) => o)), resolver: true, undo: chance(0.3), ops });
}

for (let i = 0; i < Number(nScripts); i++) {
  const ops = [];
  for (let j = 0; j < Number(nOps); j++) ops.push(nextOp());
  if (chance(0.3)) ops.push({ op: 'poolText' });
  scripts.push({ start: pick(STARTS), other: pick(OTHERS), undo: chance(0.25), resolver: chance(0.2), ops });
}
writeFileSync(out, JSON.stringify(scripts));
console.log(`${scripts.length} scripts -> ${out}`);
