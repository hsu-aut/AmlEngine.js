// Generates the cases of the misc services verification (UniqueNameService, CAEXFileStatisticService,
// RepairTypeEnumConverter, ValidationKey, Dictionary of src/system/linq.ts, AsyncLock) for
// oracle/ServicesMiscOracle.cs and test/services/misc.oracle.test.ts. Keep all three in sync.
//   node scripts/gen-services-misc.mjs [outDir=test/services/misc] [seed=3682]
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'test/services/misc', seedArg = '3682'] = process.argv.slice(2);
let seed = Number(seedArg);
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (n = 1000) => Math.floor(rnd() * n);
const chance = (p) => rnd() < p;
function weighted(table) {
  const total = table.reduce((s, [w]) => s + w, 0);
  let r = rnd() * total;
  for (const [w, f] of table) if ((r -= w) < 0) return f();
  return table[0][1]();
}

// ------------------------------------------------------------------------------------------ pools

// Names with numeric suffixes, leading zeros, int boundaries, digits that are not ASCII, spaces,
// brackets and the default names of the CAEX elements.
const NAMES = [
  'InternalElement', 'InternalElement1', 'InternalElement01', 'InternalElement007', 'InternalElement9', 'InternalElement10',
  'InternalElement2147483646', 'Attribute', 'Attribute1', 'Attribute 1', 'Attribute1 ', 'Attribute3', 'ExternalInterface',
  'ExternalInterface3', 'IE', 'IE9', 'IE10', 'ie11', 'IE007', 'Tank', 'Tank1', 'Tank1Tank2', '0', '7', '123', '', 'x١',
  'x²', '[x]1', 'a.b2', 'Ä3', 'Name with space 5', 'dup', 'dup', 'dup1', 'RoleClass2', 'SystemUnitClass5',
  'InterfaceClass', 'AttributeType12', 'InstanceHierarchy3', 'InternalLink4', 'SystemUnitClass', 'RoleClass', 'AttributeType',
];
// Numbers that do not fit an int (OverflowException inside the PLINQ query) or sit at its limit.
const BIG = ['InternalElement2147483647', 'InternalElement2147483648', 'InternalElement99999999999', 'IE99999999999', 'Attribute2147483647', 'dup4294967296'];
const DEFAULTS = [null, '', 'InternalElement', 'IE', 'IE007', 'Tank', 'Tank1', '123', 'x', 'a1b2', 'Attribute', 'dup', 'Name with space 5', 'x١', '0'];
// Tag names of the CAEX elements (the default names of the service).
const CAEX_TAGS = [
  'InternalElement', 'ExternalInterface', 'Attribute', 'InternalLink', 'InstanceHierarchy', 'SystemUnitClass', 'RoleClass',
  'InterfaceClass', 'AttributeType', 'SystemUnitClassLib', 'RoleClassLib', 'InterfaceClassLib', 'AttributeTypeLib',
  'RoleRequirements', 'SupportedRoleClass', 'MappingObject', 'Constraint', 'RefSemantic', 'ExternalReference', 'Revision',
  'SourceDocumentInformation', 'SourceObjectInformation', 'AttributeNameMapping', 'InterfaceNameMapping', 'InterfaceIDMapping',
  'CAEXFile', 'Description', 'Version', 'Copyright', 'AdditionalInformation', 'Value', 'NominalScaledType', 'OrdinalScaledType',
  'UnknownType', 'AttributeValueRequirement',
];
// Tag names that are no CAEX element or no valid XML name.
const ODD_TAGS = [null, '', 'Foo', 'a b', '{urn:x}Bar', 'x:y', '1abc', 'Ä'];
const ADD_TAGS = ['InternalElement', 'Attribute', 'ExternalInterface', 'RoleClass', 'SystemUnitClass', 'InterfaceClass', 'AttributeType', 'InstanceHierarchy', 'InternalLink', 'RoleRequirements'];

// ------------------------------------------------------------------------------------- documents

const NS30 = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.dke.de/CAEX" SchemaVersion="3.0"';
const NS215 = 'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" SchemaVersion="2.15" xsi:noNamespaceSchemaLocation="CAEX_ClassModel_V2.15.xsd"';
const doc = (header, body) => `<?xml version="1.0" encoding="utf-8"?>\n<CAEXFile ${header}>\n${body}\n</CAEXFile>\n`;
const id = (n) => `{00000000-0000-0000-0000-${String(n).padStart(12, '0')}}`;

const docs = {};
// One element of every kind that owns a sequence (CAEX 3.0), with names that collide with the
// default names and with each other (class children and attributes of the same name).
docs.full30 = doc(
  `${NS30} FileName="full30.aml"`,
  `  <AdditionalInformation AutomationMLVersion="2.0" />
  <SuperiorStandardVersion>AutomationML 2.10</SuperiorStandardVersion>
  <SourceDocumentInformation OriginName="gen" OriginID="gen" OriginVersion="1.0" LastWritingDateTime="2020-01-01T00:00:00" OriginRelease="1.0" />
  <ExternalReference Path="lib.aml" Alias="Lib" />
  <InstanceHierarchy Name="InstanceHierarchy" ChangeMode="state">
    <Description>d</Description>
    <Version>1</Version>
    <Revision RevisionDate="2020-01-01T00:00:00" OldVersion="0" NewVersion="1" AuthorName="a" />
    <Copyright>c</Copyright>
    <InternalElement Name="InternalElement" ID="${id(1)}" RefBaseSystemUnitPath="SUCL/SystemUnitClass">
      <Attribute Name="Attribute" AttributeDataType="xs:string">
        <Value>v</Value>
        <Attribute Name="Attribute1" />
        <RefSemantic CorrespondingAttributePath="x" />
        <Constraint Name="Constraint"><NominalScaledType><RequiredValue>a</RequiredValue></NominalScaledType></Constraint>
      </Attribute>
      <Attribute Name="Attribute7" />
      <ExternalInterface Name="ExternalInterface" ID="${id(2)}" RefBaseClassPath="ICL/InterfaceClass">
        <Attribute Name="a" />
        <ExternalInterface Name="ExternalInterface" ID="${id(3)}" />
      </ExternalInterface>
      <ExternalInterface Name="ExternalInterface1" ID="${id(4)}" />
      <InternalElement Name="InternalElement1" ID="${id(5)}" />
      <InternalElement Name="InternalElement5" ID="${id(6)}" />
      <InternalLink Name="InternalLink" RefPartnerSideA="${id(2)}" RefPartnerSideB="${id(4)}" />
      <RoleRequirements RefBaseRoleClassPath="RCL/RoleClass">
        <Attribute Name="Attribute" />
        <ExternalInterface Name="ExternalInterface" ID="${id(7)}" />
      </RoleRequirements>
      <MappingObject Name="MappingObject">
        <AttributeNameMapping SystemUnitAttributeName="Attribute" RoleAttributeName="Attribute" />
        <InterfaceNameMapping SystemUnitInterfaceName="ExternalInterface" RoleInterfaceName="ExternalInterface" />
        <InterfaceIDMapping SystemUnitInterfaceID="${id(2)}" RoleInterfaceID="${id(7)}" />
      </MappingObject>
      <SourceObjectInformation OriginID="o" SourceObjID="s" />
    </InternalElement>
    <InternalElement Name="InternalElement3" ID="${id(8)}" />
  </InstanceHierarchy>
  <InterfaceClassLib Name="ICL">
    <InterfaceClass Name="InterfaceClass">
      <Attribute Name="InterfaceClass1" />
      <ExternalInterface Name="ExternalInterface" ID="${id(9)}" />
      <InterfaceClass Name="InterfaceClass1" />
    </InterfaceClass>
  </InterfaceClassLib>
  <RoleClassLib Name="RCL">
    <RoleClass Name="RoleClass">
      <Attribute Name="RoleClass2" />
      <ExternalInterface Name="ExternalInterface" ID="${id(10)}" />
      <RoleClass Name="RoleClass1" />
    </RoleClass>
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCL">
    <SystemUnitClass Name="SystemUnitClass">
      <Attribute Name="SystemUnitClass3" />
      <ExternalInterface Name="ExternalInterface" ID="${id(11)}" />
      <InternalElement Name="InternalElement" ID="${id(12)}" />
      <SupportedRoleClass RefRoleClassPath="RCL/RoleClass" />
      <InternalLink Name="InternalLink" RefPartnerSideA="a" RefPartnerSideB="b" />
      <SystemUnitClass Name="SystemUnitClass1" />
    </SystemUnitClass>
  </SystemUnitClassLib>
  <AttributeTypeLib Name="ATL">
    <AttributeType Name="AttributeType" AttributeDataType="xs:string">
      <Attribute Name="AttributeType4" />
      <Constraint Name="Constraint"><OrdinalScaledType><RequiredMaxValue>1</RequiredMaxValue></OrdinalScaledType></Constraint>
      <RefSemantic CorrespondingAttributePath="y" />
      <AttributeType Name="AttributeType1" />
    </AttributeType>
  </AttributeTypeLib>`,
);
// The same for CAEX 2.15 (no namespace, mapping objects under SupportedRoleClass).
docs.full215 = doc(
  `${NS215} FileName="full215.aml"`,
  `  <AdditionalInformation AutomationMLVersion="2.0" />
  <ExternalReference Path="lib.aml" Alias="Lib" />
  <InstanceHierarchy Name="InstanceHierarchy">
    <Version>1</Version>
    <Revision RevisionDate="2020-01-01T00:00:00" OldVersion="0" NewVersion="1" AuthorName="a" />
    <InternalElement Name="InternalElement" ID="${id(1)}" RefBaseSystemUnitPath="SUCL/SystemUnitClass">
      <Attribute Name="Attribute" AttributeDataType="xs:string">
        <Attribute Name="Attribute1" />
        <RefSemantic CorrespondingAttributePath="x" />
        <Constraint Name="Constraint"><UnknownType><Requirements>r</Requirements></UnknownType></Constraint>
      </Attribute>
      <ExternalInterface Name="ExternalInterface" ID="${id(2)}" RefBaseClassPath="ICL/InterfaceClass">
        <Attribute Name="a" />
      </ExternalInterface>
      <InternalElement Name="InternalElement1" ID="${id(5)}" />
      <SupportedRoleClass RefRoleClassPath="RCL/RoleClass">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="Attribute" RoleAttributeName="Attribute" />
          <InterfaceNameMapping SystemUnitInterfaceName="ExternalInterface" RoleInterfaceName="ExternalInterface" />
        </MappingObject>
      </SupportedRoleClass>
      <InternalLink Name="InternalLink" RefPartnerSideA="${id(2)}" RefPartnerSideB="${id(2)}" />
      <RoleRequirements RefBaseRoleClassPath="RCL/RoleClass">
        <Attribute Name="Attribute" />
        <ExternalInterface Name="ExternalInterface" ID="${id(7)}" />
      </RoleRequirements>
    </InternalElement>
  </InstanceHierarchy>
  <InterfaceClassLib Name="ICL">
    <InterfaceClass Name="InterfaceClass">
      <Attribute Name="InterfaceClass1" />
      <InterfaceClass Name="InterfaceClass1" />
    </InterfaceClass>
  </InterfaceClassLib>
  <RoleClassLib Name="RCL">
    <RoleClass Name="RoleClass">
      <Attribute Name="RoleClass2" />
      <ExternalInterface Name="ExternalInterface" ID="${id(10)}" />
      <RoleClass Name="RoleClass1" />
    </RoleClass>
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCL">
    <SystemUnitClass Name="SystemUnitClass">
      <Attribute Name="SystemUnitClass3" />
      <ExternalInterface Name="ExternalInterface" ID="${id(11)}" />
      <InternalElement Name="InternalElement" ID="${id(12)}" />
      <SupportedRoleClass RefRoleClassPath="RCL/RoleClass" />
      <InternalLink Name="InternalLink" RefPartnerSideA="a" RefPartnerSideB="b" />
      <SystemUnitClass Name="SystemUnitClass1" />
    </SystemUnitClass>
  </SystemUnitClassLib>`,
);
// Elements that the statistic counts by element name although CAEX has them as XML attributes
// (RefAttributeType, RefBaseSystemUnitPath), with and without text, in the CAEX namespace and in
// another one.
const statBody = (other) => `  <InstanceHierarchy Name="IH">
    <InternalElement Name="A1" ID="${id(1)}" RefBaseSystemUnitPath="SUCL/S">
      <RefBaseSystemUnitPath>SUCL/S</RefBaseSystemUnitPath>
      <RefBaseSystemUnitPath />
      <RefBaseSystemUnitPath>  </RefBaseSystemUnitPath>
      <Attribute Name="Aa" RefAttributeType="ATL/T">
        <RefAttributeType>ATL/T</RefAttributeType>
        <RefAttributeType></RefAttributeType>
        <Attribute Name="b"><RefAttributeType><x>nested</x></RefAttributeType></Attribute>
      </Attribute>
      <o:RefAttributeType ${other}>ATL/T</o:RefAttributeType>
      <o:Attribute ${other} Name="foreign" />
      <o:InternalElement ${other} Name="foreign" />
      <RoleRequirements RefBaseRoleClassPath="RCL/R" />
      <SupportedRoleClass RefRoleClassPath="RCL/R" />
      <InternalElement Name="B" ID="${id(2)}"><InternalElement Name="A2" ID="${id(3)}" /></InternalElement>
    </InternalElement>
  </InstanceHierarchy>
  <RoleClassLib Name="RCL"><RoleClass Name="R"><RoleClass Name="AR"><RoleClass Name="R3" /></RoleClass></RoleClass><RoleClass Name="Q" /></RoleClassLib>
  <SystemUnitClassLib Name="SUCL"><SystemUnitClass Name="S"><SystemUnitClass Name="AS" /></SystemUnitClass></SystemUnitClassLib>
  <InterfaceClassLib Name="ICL"><InterfaceClass Name="I"><InterfaceClass Name="AI" /></InterfaceClass></InterfaceClassLib>
  <AttributeTypeLib Name="ATL"><AttributeType Name="T"><AttributeType Name="AT" /></AttributeType><AttributeType Name="U" /></AttributeTypeLib>`;
docs.stat30 = doc(`${NS30} FileName="stat30.aml" xmlns:o="urn:other"`, statBody(''));
docs.stat215 = doc(`${NS215} FileName="stat215.aml" xmlns:o="urn:other"`, statBody(''));

// Random documents: nested CAEX elements with names from the pools.
function randomDoc(name, v30) {
  let n = 100;
  const nameAttr = () => (chance(0.05) ? '' : ` Name="${escape(chance(0.03) ? pick(BIG) : pick(NAMES))}"`);
  const children = {
    InstanceHierarchy: ['InternalElement'],
    InternalElement: ['InternalElement', 'Attribute', 'ExternalInterface', 'InternalLink', 'RoleRequirements'],
    SystemUnitClassLib: ['SystemUnitClass'],
    SystemUnitClass: ['SystemUnitClass', 'InternalElement', 'Attribute', 'ExternalInterface'],
    RoleClassLib: ['RoleClass'],
    RoleClass: ['RoleClass', 'Attribute', 'ExternalInterface'],
    InterfaceClassLib: ['InterfaceClass'],
    InterfaceClass: ['InterfaceClass', 'Attribute'],
    AttributeTypeLib: ['AttributeType'],
    AttributeType: ['AttributeType', 'Attribute'],
    Attribute: ['Attribute'],
    ExternalInterface: ['Attribute'],
    RoleRequirements: ['Attribute'],
  };
  function el(tag, depth, indent) {
    const kids = children[tag] ?? [];
    const idAttr = tag === 'InternalElement' || tag === 'ExternalInterface' ? ` ID="${id(++n)}"` : '';
    const attrs = tag === 'RoleRequirements' ? ' RefBaseRoleClassPath="RCL/R"' : tag === 'InternalLink' ? `${nameAttr()} RefPartnerSideA="a" RefPartnerSideB="b"` : nameAttr();
    const count = depth > 3 || kids.length === 0 ? 0 : int(depth === 0 ? 7 : 5);
    if (count === 0) return `${indent}<${tag}${attrs}${idAttr} />`;
    const body = [];
    for (let i = 0; i < count; i++) body.push(el(pick(kids), depth + 1, indent + '  '));
    return `${indent}<${tag}${attrs}${idAttr}>\n${body.join('\n')}\n${indent}</${tag}>`;
  }
  const libs = ['InstanceHierarchy', 'SystemUnitClassLib', 'RoleClassLib', 'InterfaceClassLib', ...(v30 ? ['AttributeTypeLib'] : [])];
  const body = libs.map((l) => el(l, 0, '  ')).join('\n');
  return doc(`${v30 ? NS30 : NS215} FileName="${name}.aml"`, body);
}
function escape(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}
for (let i = 0; i < 4; i++) docs[`rand${i}`] = randomDoc(`rand${i}`, i % 2 === 0);

// ---------------------------------------------------------------------------- UniqueNameService

const corpus = readdirSync('test/corpus').filter((f) => f.endsWith('.aml')).sort();
const SMALL = ['5_SUC.aml', '6_RCL.aml', '7_ICL.aml', '9_ExtInt_IntLink.aml', '12_MirrorObject.aml', '13_Facet.aml', 'legacy-caex215.aml', '11_Constraints.aml', '3_IE_Attribute.aml', 'plant.aml', '1_AMLBaseLibraries.aml'];
const STARTS = ['new30', 'new215', 'doc:full30', 'doc:full215', 'doc:rand0', 'doc:rand1', 'doc:rand2', 'doc:rand3', ...SMALL];

const anyTag = () => (chance(0.15) ? pick(ODD_TAGS) : pick(CAEX_TAGS));
const elemIndex = () => (chance(0.03) ? -1 : int());
function uniqueOp(big) {
  const nm = () => (big && chance(0.15) ? pick(BIG) : chance(0.03) ? null : pick(NAMES));
  return weighted([
    [6, () => ({ op: 'add', a: int(), tag: pick(ADD_TAGS), name: nm() })],
    [2, () => ({ op: 'setName', a: int(), name: nm() })],
    [5, () => ({ op: 'u2', a: elemIndex(), tag: anyTag() })],
    [5, () => ({ op: 'u3', a: elemIndex(), tag: anyTag(), def: pick(DEFAULTS) })],
    [5, () => ({ op: 'ue', a: int(), src: pick(['children', 'named', 'desc', 'empty', 'withNull', 'siblings']), tag: chance(0.1) ? pick(ODD_TAGS) : pick(ADD_TAGS), def: pick(DEFAULTS) })],
    [4, () => ({ op: 'is', a: elemIndex() })],
    [1.5, () => ({ op: 'def', tag: chance(0.1) ? null : pick(CAEX_TAGS), name: pick(DEFAULTS) })],
    [1, () => ({ op: 'suspend' })],
    [1.5, () => ({ op: 'resume' })],
  ]);
}
const unique = [];
// Targeted: the default name of every CAEX element, in a sequence holding that name with numbers.
for (const tag of CAEX_TAGS) {
  const v30 = unique.length % 2 === 0;
  const ops = [];
  // a = 1: the first child of the root of a new document (or the root itself when it has none).
  for (const name of [tag, `${tag}1`, `${tag}5`, `${tag}05`, `x${tag}9`]) ops.push({ op: 'add', a: 0, tag, name });
  ops.push({ op: 'u2', a: 0, tag });
  ops.push({ op: 'u3', a: 0, tag, def: null });
  ops.push({ op: 'u3', a: 0, tag, def: `${tag}5` });
  ops.push({ op: 'u3', a: 0, tag, def: `${tag}6` });
  ops.push({ op: 'ue', a: 0, src: 'named', tag, def: tag });
  ops.push({ op: 'ue', a: 0, src: 'children', tag, def: '' });
  for (let k = 1; k <= 6; k++) ops.push({ op: 'is', a: 1000 + k });
  ops.push({ op: 'def', tag, name: 'Z' });
  ops.push({ op: 'u2', a: 0, tag });
  ops.push({ op: 'def', tag, name: '' });
  ops.push({ op: 'u2', a: 0, tag });
  ops.push({ op: 'suspend' });
  ops.push({ op: 'u2', a: 0, tag });
  ops.push({ op: 'u3', a: 0, tag, def: 'S1' });
  ops.push({ op: 'u3', a: 0, tag, def: null });
  ops.push({ op: 'ue', a: 0, src: 'children', tag, def: 'S2' });
  ops.push({ op: 'ue', a: 0, src: 'children', tag: null, def: null });
  ops.push({ op: 'resume' });
  ops.push({ op: 'u2', a: 0, tag });
  unique.push({ start: v30 ? 'new30' : 'new215', ops });
}
// Targeted: overflow (AggregateException) and the wrap around at int.MaxValue.
for (const names of [
  ['IE', 'IE99999999999'],
  ['IE', 'IE99999999999', 'IE88888888888'],
  ['IE', 'IE2147483647'],
  ['IE', 'IE2147483646'],
  ['IE', 'IE00000000000000000000001'],
  ['IE', 'IE-5', 'IE+5', 'IE 5'],
  ['IE5', 'IE6'],
  ['', '1', '22'],
]) {
  const ops = names.map((name) => ({ op: 'add', a: 0, tag: 'InternalElement', name }));
  for (const def of ['IE', 'IE1', '', null, '1', 'IE2147483647']) {
    ops.push({ op: 'u3', a: 0, tag: 'InternalElement', def });
    ops.push({ op: 'ue', a: 0, src: 'children', tag: 'InternalElement', def });
  }
  ops.push({ op: 'u2', a: 0, tag: 'InternalElement' });
  ops.push({ op: 'def', tag: 'InternalElement', name: 'IE' });
  ops.push({ op: 'u2', a: 0, tag: 'InternalElement' });
  unique.push({ start: 'new30', ops });
}
for (let s = 0; s < 60; s++) {
  const big = s % 4 === 3;
  const ops = [];
  for (let i = 0; i < 40; i++) ops.push(uniqueOp(big));
  unique.push({ start: STARTS[s % STARTS.length], ops });
}

// ------------------------------------------------------- appends on every sequence (reflection)

const appends = ['new30', 'new215', 'doc:full30', 'doc:full215', '13_Facet.aml', '11_Constraints.aml', '12_MirrorObject.aml', 'legacy-caex215.aml', '9_ExtInt_IntLink.aml'].map((start) => ({
  start,
  modes: ['on', 'suspended', 'off', 'unique'],
}));

// ------------------------------------------------------ engine operations with the service on

const OPS_STARTS = ['new30', 'new30', 'new215', 'doc:full30', 'doc:full215', '12_MirrorObject.aml', '5_SUC.aml', '6_RCL.aml', '7_ICL.aml', '9_ExtInt_IntLink.aml', '13_Facet.aml', 'plant.aml', 'legacy-caex215.aml', '11_Constraints.aml', '3_IE_Attribute.aml'];
const OP_NAMES = ['dup', 'dup', 'dup1', 'dup9', 'InternalElement', 'InternalElement1', 'Attribute', 'Attribute2', 'ExternalInterface', 'RoleClass', 'SystemUnitClass', 'InterfaceClass', 'AttributeType', 'Tank', 'Tank7', '', 'a b 3', '[x]', 'Ä'];
const DATA_TYPES = [null, 'xs:string', 'xs:double', 'xs:int', 'xs:boolean'];
const VALUES = [null, '', '1', '1.5', 'true', 'abc'];
function engineOp() {
  const n = () => pick(OP_NAMES);
  return weighted([
    [3, () => ({ op: 'newIH', name: n() })],
    [3, () => ({ op: 'newLib', kind: pick(['suc', 'rc', 'ic', 'at']), name: n() })],
    [6, () => ({ op: 'newClass', kind: pick(['suc', 'rc', 'ic', 'at']), a: int(), name: n() })],
    [7, () => ({ op: 'newIE', a: int(), name: n() })],
    [6, () => ({ op: 'newAttr', a: int(), name: n() })],
    [2, () => ({ op: 'setAttr', a: int(), dataType: pick(DATA_TYPES), value: pick(VALUES) })],
    [5, () => ({ op: 'newEI', a: int(), b: int(), name: n(), withClass: chance(0.7) })],
    [2, () => ({ op: 'setBase', kind: pick(['suc', 'rc', 'ic']), a: int(), b: int() })],
    [3, () => ({ op: 'addRole', a: int(), b: int() })],
    [5, () => ({ op: 'instantiate', a: int(), b: int() })],
    [3, () => ({ op: 'link', a: int(), b: int(), name: n() })],
    [2, () => ({ op: 'remove', a: int(), relations: chance(0.5) })],
    [4, () => ({ op: 'copyIE', a: int(), b: int() })],
    [3, () => ({ op: 'rename', a: int(), name: n() })],
    [2, () => ({ op: 'mirror', a: int(), b: int() })],
    [2, () => ({ op: 'move', a: int(), b: int() })],
    [2, () => ({ op: 'query', a: int() })],
    // operations of this package (oracle/ServicesMiscOracle.cs, test/services/misc.oracle.test.ts)
    [1, () => ({ op: 'svcSuspend' })],
    [1.5, () => ({ op: 'svcResume' })],
    [1, () => ({ op: 'svcDefault', tag: pick(['InternalElement', 'Attribute', 'ExternalInterface', 'SystemUnitClass', 'RoleClass']), name: pick(DEFAULTS) })],
    [0.7, () => ({ op: 'uniqueFlag', value: chance(0.5) })],
    [5, () => ({ op: 'appendNoName', a: int(), kind: pick(['ih', 'ie', 'attr', 'ei', 'suc', 'rc', 'ic', 'at', 'link']) })],
    [3, () => ({ op: 'prepend', a: int(), kind: pick(['ie', 'attr', 'ei', 'suc']), name: chance(0.2) ? null : n() })],
    [3, () => ({ op: 'addAttrRef', a: int(), b: int(), addUnique: chance(0.5), addInstance: chance(0.5), byPath: chance(0.3), name: pick([null, '', ...OP_NAMES]) })],
    [3, () => ({ op: 'addIfaceRef', a: int(), b: int(), addUnique: chance(0.5), addInstance: chance(0.5), byPath: chance(0.3), name: pick([null, '', ...OP_NAMES]) })],
    [2, () => ({ op: 'addMirror', a: int(), b: int() })],
    [2, () => ({ op: 'createAT', a: int(), b: int() })],
    [2, () => ({ op: 'createIFC', a: int(), b: int() })],
  ]);
}
const engineops = [];
for (let s = 0; s < 40; s++) {
  const ops = [];
  for (let i = 0; i < 40; i++) ops.push(engineOp());
  engineops.push({ start: OPS_STARTS[s % OPS_STARTS.length], ops });
}

// ------------------------------------------------------------------- CAEXFileStatisticService

const stat = { docs: [...corpus, 'doc:stat30', 'doc:stat215', 'doc:full30', 'doc:full215', 'doc:rand0', 'doc:rand1', 'doc:rand2', 'doc:rand3', 'new30', 'new215'] };

// ------------------------------------------------------------------- Dictionary (system/linq)

const STRING_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'A', '', 'a ', 'é'];
const INT_KEYS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, -1, 2147483647, -2147483648];
const dict = [];
for (let s = 0; s < 40; s++) {
  const keyType = s % 2 === 0 ? 'string' : 'int';
  const key = () => (keyType === 'string' ? (chance(0.02) ? null : pick(STRING_KEYS)) : pick(INT_KEYS));
  const value = () => int(100) - 10;
  const ops = [];
  const length = 60 + int(120);
  // Phases with more removals or more additions, so that the free list grows and shrinks.
  let removeBias = rnd();
  for (let i = 0; i < length; i++) {
    if (i % 25 === 0) removeBias = rnd();
    ops.push(
      weighted([
        [4 * (1 - removeBias) + 0.5, () => ['add', key(), value()]],
        [3 * (1 - removeBias) + 0.5, () => ['set', key(), value()]],
        [5 * removeBias + 0.5, () => ['remove', key()]],
        [0.15, () => ['clear']],
        [1, () => ['tryGet', key()]],
        [1, () => ['get', key()]],
        [0.7, () => ['contains', key()]],
        [0.3, () => ['keys']],
        [0.3, () => ['values']],
      ]),
    );
  }
  dict.push({ keyType, ops });
}

// ----------------------------------------------------------------- AsyncLock (SemaphoreSlim)

const lock = [];
const COUNTS = [[1, 1], [1, 1], [1, 1], [1, 1], [0, 1], [2, 2], [1, 3], [0, 3]];
for (let s = 0; s < 40; s++) {
  const [initial, max] = COUNTS[s % COUNTS.length];
  const ops = [];
  for (let i = 0; i < 40; i++) ops.push(weighted([[4, () => 'wait'], [2, () => 'try'], [4, () => 'release'], [1, () => 'count']]));
  lock.push({ initial, max, ops });
}

// --------------------------------------------------------------------------------- ValidationKey

const vkey = {
  keys: [
    ['a', 0], ['a', 0], ['a', 4], ['A', 0], ['', 0], [null, 0], [null, 0], [null, 4], ['a ', 0], ['é', 1], ['é', 1],
    ['x, y', 2], ['(a, b)', 3], ['NoSchemaVersion', 15], ['#CAEXNoName#', 6], ['k', 17], ['k', 18], ['k', -1], ['k', 99], ['null', 0],
  ],
};

// ------------------------------------------------------------------------- RepairTypeEnumConverter

// All values 0 .. 2^22 - 1 are compared by both sides (chunk hashes); these values are listed one by one.
const repairValues = [0, -1, -2, -2147483648, 2147483647, 0x400000, 0x2, 0x4000, 0x2 | 0x4000, 0x1488, 0x2005, 0x10000, 0x7fffffff & ~0x3fffff];
for (let i = 0; i < 32; i++) repairValues.push((1 << i) | 0);
for (let i = 0; i < 22; i++) for (let j = i + 1; j < 22; j++) repairValues.push((1 << i) | (1 << j));
const repair = { values: repairValues, all: 22, chunkBits: 16 };

// ------------------------------------------------------------------------------------- write

mkdirSync(outDir, { recursive: true });
const write = (name, value) => writeFileSync(join(outDir, name), JSON.stringify(value, null, 0) + '\n');
write('docs.json', docs);
write('unique.json', unique);
write('appends.json', appends);
write('engineops.json', engineops);
write('stat.json', stat);
write('dict.json', dict);
write('lock.json', lock);
write('vkey.json', vkey);
write('repair.json', repair);
console.log(`unique ${unique.length}, appends ${appends.length}, engineops ${engineops.length}, stat ${stat.docs.length}, dict ${dict.length}, lock ${lock.length}, vkey ${vkey.keys.length}, repair ${repair.values.length}`);
