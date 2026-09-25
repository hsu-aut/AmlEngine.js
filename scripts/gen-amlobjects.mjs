// Generates random AML object operation scripts (seeded) for oracle/AmlObjectsOracle.cs and
// test/engine/amlobjects.oracle.test.ts (facets, groups, ports, frames, list and refURI attributes,
// meta information, document versions, signatures, BPR document elements, role/interface
// helpers, standard library loading).
//   node scripts/gen-amlobjects.mjs <out.json> [scripts] [opsPerScript] [seed]
import { writeFileSync } from 'node:fs';

const [out = 'test/amlobjects/ops.json', nScripts = '120', nOps = '40', seedArg = '3682'] = process.argv.slice(2);
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

// Start documents: fresh documents of both versions (stored under 'corpus:' are test/corpus files,
// 'docs:' are test/amlobjects/docs files).
const STARTS = [
  'new30', 'new30', 'new30', 'new215', 'new215', 'new215',
  'docs:objects30.aml', 'docs:objects30.aml', 'docs:objects215.aml', 'docs:objects215.aml',
  'corpus:13_Facet.aml', 'corpus:1_AMLBaseLibraries.aml', 'corpus:plant.aml', 'corpus:legacy-caex215.aml',
  'corpus:3_IE_Attribute.aml', 'corpus:12_MirrorObject.aml', 'corpus:10_RefSemantic.aml', 'corpus:8_AMLAttributeLibrary.aml',
  'corpus:0_EmptyFile_V2.0.aml', 'corpus:0_EmptyFile_V2.1.aml', 'corpus:2017-02-20_DataVariable.aml', 'corpus:6_RCL.aml', 'corpus:7_ICL.aml',
];
const NAMES = ['A', 'Pump', 'Weight', 'Noise', 'Power', 'OpData', 'x', 'Frame', 'refURI', 'item', '', null, 'Name with space', 'Ä', 'dup', 'dup'];
const IDS = ['W1', 'W2', 'ToolA', 'ToolB', 'AutomationML e.V.', '', null];
const STRINGS = [null, '', 'v1', 'Tool', 'http://x.example', 'ä ö'];
// No null date: for CAEX 3.0 it becomes DateTime.MinValue, whose local offset is a known system
// layer deviation (docs/deviations.md, local time before 1996).
const DATES = ['2020-01-02T03:04:05', '2020-01-02T03:04:05+02:00', '2020-01-02T03:04:05Z', '2021-12-31', 'bad', '2019-06-15T10:20:30.1234567-05:00'];
const VERSIONS = [null, '', '1.0', '1.2.3', '1.2.3.4', '2', 'a.b', '-1.0', '1.0.0.0.0', '99999999999.0', '2.0', '2.1', '2.2', '3.0', ' 1.0 '];
const AML_VERSIONS = ['2.0', '2.1', '2.2', '1.0', '3', 'x', '', null, '2.0.1', '2.10'];
const DATA_TYPES = [null, '', 'xs:string', 'xs:int', 'xs:double', 'xs:language'];
const URIS = ['geo/a.dae', 'geo/a.dae#n1', 'file:///C:/x/y.dae', 'http://example.com/a b.aml#f', '', null, '#frag', 'C:\\data\\x.dae', 'ä.dae', '../up.aml'];
const LANGS = ['en', 'de-DE', '', null, 'fr'];
const ROLE_MAKERS = ['MakeAutomationMLBaseRole', 'MakeFacet', 'MakeGroup', 'MakePort', 'MakeProcess', 'MakeProcessStructure', 'MakeProduct', 'MakeProductStructure', 'MakePropertySet', 'MakeResource', 'MakeResourceStructure', 'MakeStructure'];
const IF_MAKERS = ['MakeAutomationMLBaseInterface', 'MakeCOLLADAInterface', 'MakeCommunicationInterface', 'MakeExternalDataConnector', 'MakeInterlockingConnector', 'MakeOrderInterface', 'MakePLCopenXMLInterface', 'MakePortConnector', 'MakePPRConnector', 'MakeSignalInterface'];
const ALIASES = [null, null, '', 'Base', 'BaseRoleClassLib'];
const LIBS = ['baseRole', 'interface', 'attribute', 'logicInterface', 'logicRole', 'plcopen', 'bprRole', 'bprInterface', 'extData', 'isLoaded'];
const DOC_ROLE_PATHS = ['AutomationMLBPRRoleClassLib/ExternalData', 'MyRoles/MyDocument', 'MyRoles/MyFacet', 'Nope/Nope'];
const DOC_REF_PATHS = ['AutomationMLBPRInterfaceClassLib/ExternalDataReference', 'MyInterfaces/MyDocRef', 'MyInterfaces/MySignal', 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/ExternalDataReference'];
const num = () => pick([0, 1, -1.5, 0.1, 1e-7, 123456.789, 1e21, -0, 3.14159]);
const writer = () => Array.from({ length: 9 }, (_, i) => (i === 1 ? pick(IDS) : i === 6 ? pick(DATES) : pick(STRINGS)));
const dt = () => ({ y: pick([2020, 1999, 2038]), mo: 1 + (int() % 12), d: 1 + (int() % 28), h: int() % 24, mi: int() % 60, s: int() % 60, kind: pick(['Unspecified', 'Utc', 'Local']) });

const OPS = [
  [3, () => ({ op: 'addFacet', a: int(), name: pick(NAMES) })],
  [2, () => ({ op: 'addGroup', a: int(), name: pick(NAMES) })],
  [2, () => ({ op: 'addPort', a: int(), name: pick(NAMES) })],
  [2, () => ({ op: 'createObj', kind: pick(['facet', 'group', 'port']), a: int(), name: pick(NAMES), alias: pick(ALIASES) })],
  [6, () => ({ op: 'facetAttr', a: int(), b: int(), mode: pick(['append', 'appendName', 'appendParent', 'insert', 'insertFacet', 'import', 'prepend', 'prependName']), name: pick(NAMES) })],
  [4, () => ({ op: 'facetIf', a: int(), b: int(), mode: pick(['append', 'appendName', 'appendParent', 'insert', 'insertFacet', 'import', 'prepend', 'prependName']), name: pick(NAMES) })],
  [3, () => ({ op: 'facetQuery', a: int() })],
  [4, () => ({ op: 'groupInsert', a: int(), b: int(), mode: pick(['insert', 'seqInsert', 'import', 'asFirst']), name: pick(NAMES) })],
  [2, () => ({ op: 'groupAssoc', a: int(), value: pick(NAMES) })],
  [2, () => ({ op: 'portInsert', a: int(), b: int(), mode: pick(['insert', 'import', 'insertSuc']), name: pick(NAMES) })],
  [3, () => ({ op: 'newFrame', a: int(), v: chance(0.3) ? null : [num(), num(), num(), num(), num(), num()], ext: chance(0.5) })],
  [3, () => ({ op: 'setFrame', a: int(), prop: pick(['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz', 'all']), value: num() })],
  [1, () => ({ op: 'createFrame', a: int(), alias: pick(ALIASES) })],
  [2, () => ({ op: 'repairFrame', a: int() })],
  [3, () => ({ op: 'refUri', a: int(), value: pick(URIS), cmp: pick(URIS.filter((u) => u !== null)) })],
  [1, () => ({ op: 'createRef', kind: pick(['uri', 'type']), a: int(), value: pick(['explicit', 'implicit', 'x', null]) })],
  [3, () => ({ op: 'makeList', a: int(), ordered: chance(0.5) })],
  [4, () => ({ op: 'addListItem', a: int(), listOnly: chance(0.7), itemType: pick(DATA_TYPES), itemName: pick(NAMES) })],
  [2, () => ({ op: 'convertList', a: int(), itemName: pick(NAMES) })],
  [3, () => ({ op: 'createList', a: int(), name: pick(NAMES), count: int() % 4, itemType: pick(DATA_TYPES), itemName: pick(NAMES), ordered: chance(0.5), alias: pick(ALIASES) })],
  [3, () => ({ op: 'setMeta', w: writer(), ext: chance(0.5) })],
  [2, () => ({ op: 'setMetaObj', w: writer(), ext: chance(0.5) })],
  [2, () => ({ op: 'deleteMeta', id: pick(IDS), ext: chance(0.5) })],
  [2, () => ({ op: 'replaceMeta', id: pick(IDS), w: writer(), ext: chance(0.5) })],
  [2, () => ({ op: 'getMeta', id: pick(IDS), ext: chance(0.5) })],
  [1, () => ({ op: 'clearMeta', ext: chance(0.5) })],
  [1, () => ({ op: 'stdLibMeta', ext: chance(0.5) })],
  [2, () => ({ op: 'setSDI', w: writer(), dt: dt(), props: chance(0.4), ext: chance(0.5) })],
  [1, () => ({ op: 'sdiMeta', w: writer() })],
  [3, () => ({ op: 'amlVersion', value: pick(AML_VERSIONS) })],
  [5, () => ({ op: 'docVersion', mode: pick(['append', 'appendObj', 'delete', 'get', 'replace', 'all', 'seqAppend', 'header', 'seq']), id: pick(['AR_001E', 'BPR_005E', 'X', '', null]), version: pick(VERSIONS), newId: pick(['AR_001E', 'NEW', '', null]) })],
  [3, () => ({ op: 'signature', a: int(), mode: pick(['append', 'delete', 'get', 'xml']) })],
  [2, () => ({ op: 'addLanguage', a: int(), value: pick(LANGS) })],
  [2, () => ({ op: 'docElement', a: int(), name: pick(NAMES), path: pick([null, ...DOC_ROLE_PATHS]) })],
  [2, () => ({ op: 'docRef', a: int(), docOnly: chance(0.7), name: pick(NAMES), path: pick([null, ...DOC_REF_PATHS]) })],
  [1, () => ({ op: 'docRole', a: int(), path: pick(DOC_ROLE_PATHS) })],
  [3, () => ({ op: 'makeRole', a: int(), kind: pick(ROLE_MAKERS), alias: pick(ALIASES) })],
  [3, () => ({ op: 'makeIf', a: int(), kind: pick(IF_MAKERS), alias: pick(ALIASES) })],
  [3, () => ({ op: 'lib', kind: pick(LIBS) })],
  [8, () => ({ op: 'query', a: int() })],
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
