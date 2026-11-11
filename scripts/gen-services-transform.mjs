// Generates the inputs of the services area "transform" (oracle/ServicesTransformOracle.cs,
// test/services/transform.oracle.test.ts): CAEXSchemaTransformer, the engine side of schema
// transformations and AMLEditionTransformer.
//   docs/*.aml           CAEX 2.15 and 3.0 documents for the branches of the upgrader, the
//                        downgrader and the edition transformer (IDs from a seeded PRNG)
//   catalogs/*.json      library catalogs (System.Text.Json form of PublicLibraryCatalog)
//   repositories/*.json  class repository items of the IClassRepository test double
//   cases.json           what the oracle and the test run (schema, engine, import, edition cases)
//   node scripts/gen-services-transform.mjs [corpusDir] [outDir] [seed]
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [corpus = 'test/corpus', out = 'test/services/transform', seedArg = '3682'] = process.argv.slice(2);
let seed = Number(seedArg);
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const hex = (n) => Array.from({ length: n }, () => Math.floor(rnd() * 16).toString(16)).join('');
const guid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;

for (const d of ['docs', 'catalogs', 'repositories']) mkdirSync(join(out, d), { recursive: true });

// ---- documents ----------------------------------------------------------------------------------

const head215 = (name, extra = '') =>
  `<?xml version="1.0" encoding="utf-8"?>
<CAEXFile FileName="${name}" SchemaVersion="2.15" xsi:noNamespaceSchemaLocation="CAEX_ClassModel_V2.15.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <AdditionalInformation AutomationMLVersion="2.0" />
${extra}`;
const head30 = (name, sdi) =>
  `<?xml version="1.0" encoding="utf-8"?>
<CAEXFile SchemaVersion="3.0" FileName="${name}" xmlns="http://www.dke.de/CAEX" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.dke.de/CAEX CAEX_ClassModel_V.3.0.xsd">
  <SuperiorStandardVersion>AutomationML 2.10</SuperiorStandardVersion>
${sdi}`;
const writer = (fields) =>
  `  <AdditionalInformation>
    <WriterHeader>
${Object.entries(fields)
  .map(([k, v]) => `      <${k}>${v}</${k}>`)
  .join('\n')}
    </WriterHeader>
  </AdditionalInformation>
`;
const fullWriter = (n, date) => ({
  WriterName: 'Writer ' + n,
  WriterID: 'W' + n,
  WriterVendor: 'Vendor ' + n,
  WriterVendorURL: 'www.vendor' + n + '.example',
  WriterVersion: n + '.0',
  WriterRelease: n + '.0.1',
  LastWritingDateTime: date,
  WriterProjectTitle: 'Project ' + n,
  WriterProjectID: 'P' + n,
});
const sdi = (attrs) =>
  `  <SourceDocumentInformation ${Object.entries(attrs)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ')} />
`;
const fullSdi = (n, date) => ({
  OriginName: 'Origin ' + n,
  OriginID: 'O' + n,
  OriginVendor: 'Vendor ' + n,
  OriginVendorURL: 'www.vendor' + n + '.example',
  OriginVersion: n + '.0',
  OriginRelease: n + '.0.1',
  LastWritingDateTime: date,
  OriginProjectTitle: 'Project ' + n,
  OriginProjectID: 'P' + n,
});
const docs = {};

// Upgrade: WriterHeaders with all kinds of LastWritingDateTime texts (DateTime.TryParse, local time).
docs['up-meta.aml'] =
  head215('up-meta.aml') +
  writer(fullWriter(1, '2017-02-20T15:02:20.05+01:00')) +
  writer(fullWriter(2, '2020-01-01T00:00:00Z')) +
  writer(fullWriter(3, '2019-06-15T12:30:00')) +
  writer(fullWriter(4, '2012-02-20\n\t\t\t')) +
  writer(fullWriter(5, '03/13/2019 14:37:59')) +
  writer(fullWriter(6, '08.06.2018 11:36:16')) +
  writer(fullWriter(7, 'not a date')) +
  writer(fullWriter(8, '')) +
  writer({ WriterName: 'Sparse', WriterID: 'S' }) +
  writer(fullWriter(9, '2021-07-04T23:59:59.9999999-07:00')) +
  `  <AdditionalInformation DocumentVersions="Recommendations">
    <Document DocumentIdentifier="AutomationML Edition 2.1 Part 1" Version="2.1" />
  </AdditionalInformation>
  <AdditionalInformation Name="Generic">text</AdditionalInformation>
  <InstanceHierarchy Name="IH">
    <Version>1.0</Version>
    <InternalElement Name="E" ID="${guid()}" />
  </InstanceHierarchy>
</CAEXFile>
`;

// Upgrade: no WriterHeader (the finalization adds the required SourceDocumentInformation).
docs['up-nometa.aml'] =
  head215('up-nometa.aml') +
  `  <SystemUnitClassLib Name="SUCs">
    <SystemUnitClass Name="S">
      <Attribute Name="a" AttributeDataType="xs:double"><Value>1.5</Value></Attribute>
    </SystemUnitClass>
  </SystemUnitClassLib>
</CAEXFile>
`;

// Upgrade: supported role classes, role requirements, qualified attributes and interfaces, mappings.
{
  const g = () => guid();
  const roles = `  <InterfaceClassLib Name="Ifs">
    <Version>1.0</Version>
    <InterfaceClass Name="I" />
  </InterfaceClassLib>
  <RoleClassLib Name="Roles">
    <Version>1.0</Version>
    <RoleClass Name="R1">
      <Attribute Name="a1" AttributeDataType="xs:string" />
      <Attribute Name="a2"><Attribute Name="a2x" /></Attribute>
      <ExternalInterface Name="i1" ID="${g()}" RefBaseClassPath="Ifs/I" />
    </RoleClass>
    <RoleClass Name="R2">
      <Attribute Name="b1" />
      <ExternalInterface Name="i2" ID="${g()}" RefBaseClassPath="Ifs/I" />
    </RoleClass>
    <RoleClass Name="R3" RefBaseClassPath="Roles/R2">
      <Attribute Name="c1" />
    </RoleClass>
  </RoleClassLib>
`;
  docs['up-roles.aml'] =
    head215('up-roles.aml') +
    writer(fullWriter(1, '2018-03-04T05:06:07')) +
    `  <InstanceHierarchy Name="Plant">
    <InternalElement Name="OnlyRR" ID="${g()}">
      <RoleRequirements RefBaseRoleClassPath="Roles/R1" />
    </InternalElement>
    <InternalElement Name="Multi" ID="${g()}">
      <Attribute Name="s1" />
      <Attribute Name="s2" />
      <Attribute Name="outer"><Attribute Name="inner" /></Attribute>
      <ExternalInterface Name="e1" ID="${g()}" RefBaseClassPath="Ifs/I" />
      <ExternalInterface Name="e2" ID="${g()}" RefBaseClassPath="Ifs/I" />
      <SupportedRoleClass RefRoleClassPath="Roles/R1" />
      <SupportedRoleClass RefRoleClassPath="Roles/R2" />
      <SupportedRoleClass RefRoleClassPath="Roles/R3" />
      <RoleRequirements RefBaseRoleClassPath="Roles/R1">
        <Attribute Name="R2.b1" />
        <Attribute Name="R3.c1" />
        <Attribute Name="plain" />
        <Attribute Name="RX.y" />
        <ExternalInterface Name="R2.i2" ID="${g()}" RefBaseClassPath="Ifs/I" />
        <ExternalInterface Name="own" ID="${g()}" RefBaseClassPath="Ifs/I" />
      </RoleRequirements>
      <MappingObject>
        <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="R2.b1" />
        <AttributeNameMapping SystemUnitAttributeName="s2" RoleAttributeName="a1" />
        <AttributeNameMapping SystemUnitAttributeName="outer.inner" RoleAttributeName="R3.c1" />
        <AttributeNameMapping SystemUnitAttributeName="s3" RoleAttributeName="RX.y" />
        <AttributeNameMapping SystemUnitAttributeName="s4" RoleAttributeName="a2.a2x" />
        <AttributeNameMapping SystemUnitAttributeName="s5" RoleAttributeName="" />
        <InterfaceNameMapping SystemUnitInterfaceName="e1" RoleInterfaceName="R2.i2" />
        <InterfaceNameMapping SystemUnitInterfaceName="e2" RoleInterfaceName="i1" />
        <InterfaceNameMapping SystemUnitInterfaceName="e9" RoleInterfaceName="R2.zz" />
        <InterfaceNameMapping SystemUnitInterfaceName="e2" RoleInterfaceName="own" />
      </MappingObject>
    </InternalElement>
    <InternalElement Name="SrcMapping" ID="${g()}">
      <Attribute Name="s1" />
      <ExternalInterface Name="e1" ID="${g()}" RefBaseClassPath="Ifs/I" />
      <SupportedRoleClass RefRoleClassPath="Roles/R2">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="b1" />
          <InterfaceNameMapping SystemUnitInterfaceName="e1" RoleInterfaceName="i2" />
        </MappingObject>
      </SupportedRoleClass>
      <RoleRequirements RefBaseRoleClassPath="Roles/R1" />
    </InternalElement>
    <InternalElement Name="SrcMappingAndIE" ID="${g()}">
      <Attribute Name="s1" />
      <SupportedRoleClass RefRoleClassPath="Roles/R2">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="b1" />
        </MappingObject>
      </SupportedRoleClass>
      <RoleRequirements RefBaseRoleClassPath="Roles/R1">
        <Attribute Name="R2.b1" />
      </RoleRequirements>
      <MappingObject>
        <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="R2.b1" />
      </MappingObject>
    </InternalElement>
    <InternalElement Name="SrcOnly" ID="${g()}">
      <SupportedRoleClass RefRoleClassPath="Roles/R1" />
      <SupportedRoleClass RefRoleClassPath="Roles/R2" />
    </InternalElement>
    <InternalElement Name="SrcUnknown" ID="${g()}">
      <SupportedRoleClass RefRoleClassPath="Roles/Nope" />
      <SupportedRoleClass RefRoleClassPath="Roles/R1" />
      <RoleRequirements RefBaseRoleClassPath="Roles/R1" />
    </InternalElement>
    <InternalElement Name="RRUnknown" ID="${g()}">
      <Attribute Name="s1" />
      <SupportedRoleClass RefRoleClassPath="Roles/R2" />
      <RoleRequirements RefBaseRoleClassPath="Roles/Nope">
        <Attribute Name="R2.b1" />
      </RoleRequirements>
      <MappingObject>
        <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="R2.b1" />
      </MappingObject>
    </InternalElement>
    <InternalElement Name="SrcAndMapNoRR" ID="${g()}">
      <Attribute Name="s1" />
      <ExternalInterface Name="e1" ID="${g()}" RefBaseClassPath="Ifs/I" />
      <SupportedRoleClass RefRoleClassPath="Roles/R2" />
      <MappingObject>
        <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="b1" />
        <InterfaceNameMapping SystemUnitInterfaceName="e1" RoleInterfaceName="i2" />
      </MappingObject>
    </InternalElement>
    <InternalElement Name="InterfacesOnly" ID="${g()}">
      <ExternalInterface Name="e1" ID="${g()}" RefBaseClassPath="Ifs/I" />
      <ExternalInterface Name="e2" ID="${g()}" RefBaseClassPath="Ifs/I" />
      <SupportedRoleClass RefRoleClassPath="Roles/R1" />
      <SupportedRoleClass RefRoleClassPath="Roles/R2" />
      <RoleRequirements RefBaseRoleClassPath="Roles/R1">
        <ExternalInterface Name="R2.i2" ID="${g()}" RefBaseClassPath="Ifs/I" />
      </RoleRequirements>
      <MappingObject>
        <InterfaceNameMapping SystemUnitInterfaceName="e1" RoleInterfaceName="R2.i2" />
        <InterfaceNameMapping SystemUnitInterfaceName="e2" RoleInterfaceName="i1" />
      </MappingObject>
    </InternalElement>
    <InternalElement Name="MapOnly" ID="${g()}">
      <Attribute Name="s1" />
      <MappingObject>
        <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="a1" />
      </MappingObject>
    </InternalElement>
    <InternalElement Name="Nested" ID="${g()}">
      <InternalElement Name="Inner" ID="${g()}">
        <SupportedRoleClass RefRoleClassPath="Roles/R3" />
        <RoleRequirements RefBaseRoleClassPath="Roles/R1" />
      </InternalElement>
      <RoleRequirements RefBaseRoleClassPath="Roles/R2" />
    </InternalElement>
  </InstanceHierarchy>
${roles}  <SystemUnitClassLib Name="SUCs">
    <Version>1.0</Version>
    <SystemUnitClass Name="S">
      <Attribute Name="s1" />
      <SupportedRoleClass RefRoleClassPath="Roles/R2">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="b1" />
        </MappingObject>
      </SupportedRoleClass>
      <InternalElement Name="Part" ID="${g()}">
        <SupportedRoleClass RefRoleClassPath="Roles/R2" />
        <RoleRequirements RefBaseRoleClassPath="Roles/R1" />
      </InternalElement>
    </SystemUnitClass>
  </SystemUnitClassLib>
</CAEXFile>
`;
  // A mapping without RoleAttributeName: PathPartObjectNames(null).
  docs['up-roles-null.aml'] =
    head215('up-roles-null.aml') +
    `  <InstanceHierarchy Name="Plant">
    <InternalElement Name="NullName" ID="${g()}">
      <Attribute Name="s1" />
      <RoleRequirements RefBaseRoleClassPath="Roles/R1" />
      <MappingObject>
        <AttributeNameMapping SystemUnitAttributeName="s1" />
      </MappingObject>
    </InternalElement>
  </InstanceHierarchy>
${roles}</CAEXFile>
`;
}

// Upgrade: mirror objects with children (moved to the master unless it has one with that name).
{
  const master = guid();
  const missing = guid();
  docs['up-mirror.aml'] =
    head215('up-mirror.aml') +
    `  <InstanceHierarchy Name="Plant">
    <InternalElement Name="Master" ID="${master}">
      <Attribute Name="A1" />
      <ExternalInterface Name="P1" ID="${guid()}" />
      <InternalElement Name="C1" ID="${guid()}" />
      <InternalElement Name="C2" ID="${guid()}" />
    </InternalElement>
    <InternalElement Name="Group" ID="${guid()}">
      <InternalElement Name="Mirror1" ID="${guid()}" RefBaseSystemUnitPath="${master}">
        <Attribute Name="A1"><Value>mirror</Value></Attribute>
        <Attribute Name="A2" />
        <ExternalInterface Name="P1" ID="${guid()}" />
        <ExternalInterface Name="P2" ID="${guid()}" />
        <InternalElement Name="C1" ID="${guid()}" />
        <InternalElement Name="C3" ID="${guid()}" />
      </InternalElement>
      <InternalElement Name="Mirror2" ID="${guid()}" RefBaseSystemUnitPath="{${master}}" />
      <InternalElement Name="Mirror3" ID="${guid()}" RefBaseSystemUnitPath="${missing}">
        <Attribute Name="Orphan" />
      </InternalElement>
      <InternalElement Name="Mirror4" ID="${guid()}" RefBaseSystemUnitPath="{${master}}">
        <Attribute Name="A3" />
      </InternalElement>
    </InternalElement>
  </InstanceHierarchy>
</CAEXFile>
`;
}

// Upgrade: internal links with "ID:Name" partner references.
{
  const a = guid();
  const b = guid();
  const c = guid();
  const p = guid();
  docs['up-links.aml'] =
    head215('up-links.aml') +
    `  <InstanceHierarchy Name="Plant">
    <InternalElement Name="Parent" ID="${p}">
      <ExternalInterface Name="pp" ID="${guid()}" />
      <InternalElement Name="A" ID="${a}">
        <ExternalInterface Name="p" ID="${guid()}" />
      </InternalElement>
      <InternalElement Name="B" ID="${b}">
        <ExternalInterface Name="q" ID="${guid()}" />
        <InternalElement Name="C" ID="${c}">
          <ExternalInterface Name="r" ID="${guid()}" />
        </InternalElement>
      </InternalElement>
      <InternalLink Name="L1" RefPartnerSideA="${a}:p" RefPartnerSideB="${b}:q" />
      <InternalLink Name="L2" RefPartnerSideA="${a}:p" RefPartnerSideB="${c}:r" />
      <InternalLink Name="L3" RefPartnerSideA="${a}:nope" RefPartnerSideB="${guid()}:q" />
      <InternalLink Name="L4" RefPartnerSideA="" RefPartnerSideB="${b}:q" />
      <InternalLink Name="L5" RefPartnerSideA="${p}:pp" />
      <InternalLink Name="L6" RefPartnerSideA="{${a}}:p" RefPartnerSideB="${b}:q:x" />
    </InternalElement>
  </InstanceHierarchy>
  <SystemUnitClassLib Name="SUCs">
    <SystemUnitClass Name="S">
      <ExternalInterface Name="own" ID="${guid()}" />
      <InternalElement Name="In" ID="${guid()}">
        <ExternalInterface Name="x" ID="${guid()}" />
      </InternalElement>
      <InternalLink Name="SL" RefPartnerSideA="SUCs/S:own" RefPartnerSideB="SUCs/S/In:x" />
    </SystemUnitClass>
  </SystemUnitClassLib>
</CAEXFile>
`;
}

// Downgrade: SourceDocumentInformation none, several, sparse, without and with an unparsable date.
const ih30 = `  <InstanceHierarchy Name="IH">
    <Version>1.0</Version>
    <InternalElement Name="E" ID="${guid()}" />
  </InstanceHierarchy>
</CAEXFile>
`;
docs['down-sdi-none.aml'] = head30('down-sdi-none.aml', '') + ih30;
docs['down-sdi-many.aml'] =
  head30('down-sdi-many.aml', sdi(fullSdi(1, '2017-02-20T15:02:20.05+01:00')) + sdi(fullSdi(2, '2020-01-01T00:00:00Z')) + sdi(fullSdi(3, '2019-06-15T12:30:00'))) +
  ih30;
docs['down-sdi-sparse.aml'] = head30('down-sdi-sparse.aml', sdi({ LastWritingDateTime: '2020-01-01T00:00:00Z' })) + ih30;
docs['down-sdi-nodate.aml'] = head30('down-sdi-nodate.aml', sdi({ OriginName: 'N', OriginID: 'I', OriginVersion: '1' })) + ih30;
docs['down-sdi-baddate.aml'] = head30('down-sdi-baddate.aml', sdi({ OriginName: 'N', OriginID: 'I', OriginVersion: '1', LastWritingDateTime: 'yesterday' })) + ih30;

// Downgrade: several role requirements with mapping objects.
{
  const r1 = guid();
  const r2 = guid();
  const e1 = guid();
  const e2 = guid();
  const roles = `  <RoleClassLib Name="Roles">
    <Version>1.0</Version>
    <RoleClass Name="R1">
      <Attribute Name="a1" AttributeDataType="xs:string" />
      <ExternalInterface Name="i1" ID="${r1}" />
    </RoleClass>
    <RoleClass Name="R2">
      <Attribute Name="b1"><Attribute Name="b1x" /></Attribute>
      <ExternalInterface Name="i2" ID="${r2}" />
    </RoleClass>
    <RoleClass Name="R3">
      <Attribute Name="c1" />
    </RoleClass>
  </RoleClassLib>
`;
  const sdi1 = sdi(fullSdi(1, '2016-05-06T07:08:09+02:00'));
  docs['down-roles.aml'] =
    head30('down-roles.aml', sdi1) +
    `  <InstanceHierarchy Name="Plant">
    <InternalElement Name="Multi" ID="${guid()}">
      <Attribute Name="s1" />
      <Attribute Name="s2"><Attribute Name="x" /></Attribute>
      <ExternalInterface Name="e1" ID="${e1}" />
      <ExternalInterface Name="e2" ID="${e2}" />
      <RoleRequirements RefBaseRoleClassPath="Roles/R1">
        <Attribute Name="a1" />
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="a1" />
          <AttributeNameMapping SystemUnitAttributeName="s2/x" RoleAttributeName="a2" />
          <InterfaceIDMapping SystemUnitInterfaceID="${e1}" RoleInterfaceID="${r1}" />
        </MappingObject>
      </RoleRequirements>
      <RoleRequirements RefBaseRoleClassPath="Roles/R2">
        <Attribute Name="b1"><Attribute Name="b1x" /></Attribute>
        <ExternalInterface Name="i2" ID="${guid()}" />
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="s2" RoleAttributeName="b1" />
          <AttributeNameMapping SystemUnitAttributeName="s2/x" RoleAttributeName="b1/b1x" />
          <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="zz" />
          <InterfaceIDMapping SystemUnitInterfaceID="${e2}" RoleInterfaceID="${r2}" />
          <InterfaceIDMapping SystemUnitInterfaceID="${e1}" RoleInterfaceID="nope" />
        </MappingObject>
      </RoleRequirements>
      <RoleRequirements RefBaseRoleClassPath="Roles/R3">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="s1" RoleAttributeName="c1" />
        </MappingObject>
      </RoleRequirements>
      <RoleRequirements RefBaseRoleClassPath="Roles/R1" />
      <RoleRequirements RefBaseRoleClassPath="Roles/R2">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="s2" RoleAttributeName="b1" />
        </MappingObject>
      </RoleRequirements>
    </InternalElement>
    <InternalElement Name="Single" ID="${guid()}">
      <Attribute Name="s" />
      <ExternalInterface Name="e" ID="${guid()}" />
      <RoleRequirements RefBaseRoleClassPath="Roles/R2">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="s" RoleAttributeName="b1" />
          <InterfaceIDMapping SystemUnitInterfaceID="${e1}" RoleInterfaceID="${r2}" />
        </MappingObject>
      </RoleRequirements>
    </InternalElement>
    <InternalElement Name="NoMap" ID="${guid()}">
      <RoleRequirements RefBaseRoleClassPath="Roles/R1" />
    </InternalElement>
    <InternalElement Name="FirstWithoutMapping" ID="${guid()}">
      <Attribute Name="s" />
      <RoleRequirements RefBaseRoleClassPath="Roles/R1" />
      <RoleRequirements RefBaseRoleClassPath="Lib@Roles/R2">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="s" RoleAttributeName="b1" />
        </MappingObject>
      </RoleRequirements>
    </InternalElement>
  </InstanceHierarchy>
${roles}</CAEXFile>
`;
  docs['down-roles-nullpath.aml'] =
    head30('down-roles-nullpath.aml', sdi1) +
    `  <InstanceHierarchy Name="Plant">
    <InternalElement Name="NullPath" ID="${guid()}">
      <Attribute Name="s" />
      <RoleRequirements RefBaseRoleClassPath="Roles/R1" />
      <RoleRequirements>
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="s" RoleAttributeName="b1" />
        </MappingObject>
      </RoleRequirements>
    </InternalElement>
  </InstanceHierarchy>
${roles}</CAEXFile>
`;
  docs['down-roles-nosu.aml'] =
    head30('down-roles-nosu.aml', sdi1) +
    `  <InstanceHierarchy Name="Plant">
    <InternalElement Name="NoSystemUnitInterface" ID="${guid()}">
      <RoleRequirements RefBaseRoleClassPath="Roles/R1">
        <MappingObject>
          <InterfaceIDMapping SystemUnitInterfaceID="missing" RoleInterfaceID="${r1}" />
        </MappingObject>
      </RoleRequirements>
    </InternalElement>
  </InstanceHierarchy>
${roles}</CAEXFile>
`;
}

// Downgrade: internal links with interface IDs (replaced by "ID of the owner:Name").
{
  const p = guid();
  const q = guid();
  const o = guid();
  const x = guid();
  const r = guid();
  const n = guid();
  docs['down-links.aml'] =
    head30('down-links.aml', sdi(fullSdi(1, '2015-01-02T03:04:05Z'))) +
    `  <InstanceHierarchy Name="Plant">
    <InternalElement Name="Parent" ID="${guid()}">
      <InternalElement Name="A" ID="${guid()}">
        <ExternalInterface Name="p" ID="${p}">
          <ExternalInterface Name="nested" ID="${n}" />
        </ExternalInterface>
      </InternalElement>
      <InternalElement Name="B" ID="${guid()}">
        <ExternalInterface Name="q" ID="${q}" />
      </InternalElement>
      <InternalLink Name="L1" RefPartnerSideA="${p}" RefPartnerSideB="${q}" />
      <InternalLink Name="L2" RefPartnerSideA="${p}" RefPartnerSideB="${o}" />
      <InternalLink Name="L3" RefPartnerSideA="${x}" RefPartnerSideB="${r}" />
      <InternalLink Name="L4" RefPartnerSideA="missing" RefPartnerSideB="" />
      <InternalLink Name="L5" RefPartnerSideA="{${n}}" RefPartnerSideB="${q}" />
      <InternalLink Name="L6" RefPartnerSideB="${q}" />
    </InternalElement>
  </InstanceHierarchy>
  <RoleClassLib Name="Roles">
    <RoleClass Name="R">
      <ExternalInterface Name="ri" ID="${r}" />
    </RoleClass>
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCs">
    <SystemUnitClass Name="S">
      <ExternalInterface Name="own" ID="${o}" />
      <InternalElement Name="In" ID="${guid()}">
        <ExternalInterface Name="x" ID="${x}" />
      </InternalElement>
    </SystemUnitClass>
  </SystemUnitClassLib>
</CAEXFile>
`;
}

// Edition: external references (catalog lookup) and objects without ID or Version.
docs['ed-extrefs.aml'] =
  head215('ed-extrefs.aml') +
  writer(fullWriter(1, '2014-04-04T04:04:04')) +
  `  <ExternalReference Path="Libs/RoleClass Libraries/AutomationMLBaseRoleClassLib.aml" Alias="BaseRoleClassLib" />
  <ExternalReference Path="Libs/InterfaceClass Libraries/AutomationMLInterfaceClassLib.aml" Alias="BaseInterfaceClassLib" />
  <ExternalReference Path="https://example.org/ed1/unknown.aml" Alias="Unknown" />
  <ExternalReference Path="Libs/RoleClass Libraries/AutomationMLBaseRoleClassLib.aml" Alias="VersionRef">
    <Description>VersionRef</Description>
  </ExternalReference>
  <ExternalReference Path="Libs/RoleClass Libraries/AutomationMLBaseRoleClassLib.aml" Alias="OldVersion">
    <Version>OldVersion</Version>
  </ExternalReference>
  <ExternalReference Path="rev2.aml" Alias="Rev2" />
  <ExternalReference Path="https://example.org/ed1/ATL.aml" Alias="ATL1" />
  <ExternalReference Path="https://example.org/ed1/OtherOnly.aml" Alias="Other" />
  <ExternalReference Path="https://example.org/ed1/all.aml" Alias="All" />
  <ExternalReference Path="" Alias="Empty" />
  <ExternalReference Alias="NoPath" />
  <InstanceHierarchy Name="IH">
    <InternalElement Name="WithID" ID="${guid()}">
      <Attribute Name="InIH" />
    </InternalElement>
    <InternalElement Name="EmptyID" ID="" />
    <InternalElement Name="BlankID" ID="  " />
    <InternalElement Name="NoID" />
  </InstanceHierarchy>
  <InterfaceClassLib Name="Ifs">
    <InterfaceClass Name="I" />
    <InterfaceClass Name="J">
      <Version>2.0</Version>
    </InterfaceClass>
  </InterfaceClassLib>
  <RoleClassLib Name="Roles">
    <Version>1.0</Version>
    <RoleClass Name="R" />
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCs">
    <SystemUnitClass Name="S">
      <Version>  </Version>
      <InternalElement Name="Part" />
    </SystemUnitClass>
  </SystemUnitClassLib>
</CAEXFile>
`;

// Edition: attributes of classes (attribute types referenced from the repository or created).
const attrClasses = `  <InstanceHierarchy Name="IH">
    <InternalElement Name="E" ID="${guid()}">
      <Attribute Name="Length" />
    </InternalElement>
  </InstanceHierarchy>
  <InterfaceClassLib Name="Ifs">
    <InterfaceClass Name="I">
      <Attribute Name="Weight" AttributeDataType="xs:double" Unit="kg" />
      <Attribute Name="Pressure" />
    </InterfaceClass>
  </InterfaceClassLib>
  <RoleClassLib Name="Roles">
    <RoleClass Name="R">
      <Attribute Name="Length" AttributeDataType="xs:double" />
      <Attribute Name="Colour"><Value>red</Value></Attribute>
    </RoleClass>
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCs">
    <SystemUnitClass Name="Motor">
      <Attribute Name="Length" AttributeDataType="xs:double" Unit="mm"><Value>12</Value></Attribute>
      <Attribute Name="length" />
      <Attribute Name="Weight">
        <Attribute Name="Inner" />
      </Attribute>
      <Attribute Name="Speed" />
      <Attribute Name="Mass" />
      <Attribute Name="Unknown" />
      <Attribute Name="Ver" />
      <Attribute Name="Ed1Only" />
      <Attribute Name="Tie" />
      <Attribute Name="Pre" />
      <Attribute Name="NullPath" />
      <Attribute Name="Plain" AttributeDataType="xs:int"><Description>plain one</Description><DefaultValue>3</DefaultValue></Attribute>
      <Attribute Name="&#214;lstand" />
      <Attribute Name="ID" />
      <Attribute Name="X" />
      <ExternalInterface Name="P" ID="${guid()}">
        <Attribute Name="Pressure" />
      </ExternalInterface>
      <InternalElement Name="Part" ID="${guid()}">
        <Attribute Name="Speed" />
      </InternalElement>
    </SystemUnitClass>
  </SystemUnitClassLib>
</CAEXFile>
`;
docs['ed-attrs.aml'] =
  head215('ed-attrs.aml') +
  writer(fullWriter(1, '2013-03-03T03:03:03')) +
  `  <ExternalReference Path="Libs/RoleClass Libraries/AutomationMLBaseRoleClassLib.aml" Alias="BaseRoleClassLib" />
` +
  attrClasses;
docs['ed-attrs-noref.aml'] = head215('ed-attrs-noref.aml') + attrClasses;
docs['ed-emptyname.aml'] =
  head215('ed-emptyname.aml') +
  `  <SystemUnitClassLib Name="SUCs">
    <SystemUnitClass Name="S">
      <Attribute Name="Weight" />
      <Attribute Name="" />
    </SystemUnitClass>
  </SystemUnitClassLib>
</CAEXFile>
`;

for (const [name, text] of Object.entries(docs)) writeFileSync(join(out, 'docs', name), text);

// ---- catalogs and repositories ------------------------------------------------------------------

const v = (Version, CAEXVersion, links, extra = {}) => ({ Version, CAEXVersion, DownloadLinks: links, Signature: '', ...extra });
const catalogA = {
  Libraries: [
    {
      CAEXType: 'RoleClassLib',
      Libraries: [
        {
          Name: 'AutomationMLBaseRoleClassLib',
          Versions: [
            v('2.2.2', '2.15', ['Libs/RoleClass Libraries/AutomationMLBaseRoleClassLib.aml', 'https://example.org/ed1/BaseRCL.aml']),
            v('2.2.3', '2.15', ['Libs/RoleClass Libraries/AutomationMLBaseRoleClassLib.aml']),
            v('2.10.0', '3.0', ['https://example.org/ed2/AutomationMLBaseRoleClassLib_2.10.0.aml']),
            v('2.11.0', '3.0', ['https://example.org/ed2/AutomationMLBaseRoleClassLib_2.11.0.zip', 'https://example.org/ed2/AutomationMLBaseRoleClassLib_2.11.0.aml']),
            { Version: '2.9', CAEXVersion: '3.0', AMLEdition: 'AMLEd2', DownloadLink: 'https://example.org/ed2/AutomationMLBaseRoleClassLib_2.9.aml' },
          ],
        },
        {
          Name: 'OtherRCL',
          Versions: [
            v('1.0.0', '2.15', ['Libs/RoleClass Libraries/AutomationMLBaseRoleClassLib.aml', 'https://example.org/ed1/OtherOnly.aml']),
            v('1.1.0', '3.0', ['https://example.org/ed2/OtherRCL_1.1.0.amlx']),
          ],
        },
      ],
    },
    {
      CAEXType: 'InterfaceClassLib',
      Libraries: [
        {
          Name: 'AutomationMLInterfaceClassLib',
          Versions: [
            v('2.2.2', '2.15', [], {
              Revision: { DownloadLinks: ['Libs/InterfaceClass Libraries/AutomationMLInterfaceClassLib.aml'], Signature: 'r1', Revision: { DownloadLink: 'rev2.aml', Signature: 'r2' } },
            }),
            v('2.10.0', '3.0', ['https://example.org/ed2/ICL.AML']),
            v('2.10.0-beta', '3.0', ['https://example.org/ed2/ICL-beta.aml']),
          ],
        },
        {
          Name: 'AllLib',
          Versions: [
            { Version: '1', DownloadLinks: ['https://example.org/ed1/all.aml', 'https://example.org/any/all_1.0.aml'] },
            v('2.0.0', '3.0', ['https://example.org/ed2/all_2.0.0.aml']),
            v('0.5.0', '2.15', ['https://example.org/ed1/all_0.5.0.aml']),
          ],
        },
      ],
    },
    {
      CAEXType: 'AttributeTypeLib',
      Libraries: [
        {
          Name: 'AutomationMLBaseAttributeTypeLib',
          Versions: [
            v('1.0.0', '3.0', ['https://example.org/ed2/AutomationMLBaseAttributeTypeLib_1.0.0.aml']),
            v('1.1.0', '3.0', ['https://example.org/ed2/AutomationMLBaseAttributeTypeLib_1.1.0.zip']),
            v('1.0.0', '2.15', ['https://example.org/ed1/ATL.aml']),
          ],
        },
        { Name: 'VendorAttributeTypeLib', Versions: [v('2.0.0', '3.0', ['https://example.org/ed2/Vendor ATL_2.0.0.aml']), v('1.0.0', '3.0', ['vendor-1.0.0.aml'])] },
      ],
    },
  ],
  PublicKey: 'key',
};
writeFileSync(join(out, 'catalogs', 'a.json'), JSON.stringify(catalogA, null, 2));
// Without attribute type libraries: the attribute types found in the repository have no document.
const catalogB = { Libraries: [catalogA.Libraries[0]] };
writeFileSync(join(out, 'catalogs', 'b.json'), JSON.stringify(catalogB, null, 2));

const item = (match, className, caexPath, libraryName, libraryVersion, amlEdition, id = null) => ({
  match,
  item: [className, caexPath, '', libraryName, libraryVersion, amlEdition, id],
});
const atl = 'AutomationMLBaseAttributeTypeLib';
const repositories = {
  r1: [
    item('Length', 'Length', atl + '/Length', atl, '1.0.0', 'AMLEd2'),
    item('Length', 'Length', atl + '/Length', atl, '1.1.0', 'AMLEd2', 'id-length'),
    item('Length', 'Length', 'Other/Length', 'Other', '9.0.0', 'AMLEd1'),
    item('Weight', 'Weight', atl + '/Weight', atl, '1.0.0', 'AMLEd2'),
    item('Speed', 'Speed', 'VendorAttributeTypeLib/Speed', 'VendorAttributeTypeLib', '2.0.0', 'AMLEd2'),
    item('Mass', 'Mass', atl + '/Mass', atl, '1.0.0', 'AMLEd2'),
    item('Unknown', 'Unknown', 'NoLib/Unknown', 'NoLib', '1.0.0', 'AMLEd2'),
    item('Ver', 'Ver', atl + '/Ver', atl, '3.0.0', 'AMLEd2'),
    item('Ed1Only', 'Ed1Only', atl + '/Ed1Only', atl, '1.0.0', 'AMLEd1'),
    item('Tie', 'Tie', atl + '/TieA', atl, '1.0.0', 'AMLEd2'),
    item('Tie', 'Tie', 'VendorAttributeTypeLib/TieB', 'VendorAttributeTypeLib', '1.0.0', 'AMLEd2'),
    item('Pre', 'Pre', 'VendorAttributeTypeLib/PreBeta', 'VendorAttributeTypeLib', '1.0.0-beta', 'AMLEd2'),
    item('Pre', 'Pre', 'VendorAttributeTypeLib/Pre', 'VendorAttributeTypeLib', '1.0.0', 'AMLEd2'),
    item('NullPath', null, null, atl, '1.0.0', 'AMLEd2'),
    item('Pressure', 'Pressure', atl + '/Pressure', atl, '1.0.0', 'AMLEd2'),
  ],
  empty: [],
  // SemanticVersion.Parse of an invalid version, alone and after a valid one
  bad1: [item('Weight', 'Weight', atl + '/Weight', atl, 'x.y', 'AMLEd2')],
  bad2: [item('Weight', 'Weight', atl + '/Weight', atl, '1.0.0', 'AMLEd2'), item('Weight', 'Weight', atl + '/W2', atl, 'x.y', 'AMLEd2')],
  bad3: [item('*', 'Any', atl + '/Any', atl, null, 'AMLEd2')],
  all: [item('*', 'Any', atl + '/Any', atl, '1.0.0', 'AMLEd2')],
};
for (const [name, items] of Object.entries(repositories)) writeFileSync(join(out, 'repositories', name + '.json'), JSON.stringify(items, null, 2));

// ---- cases --------------------------------------------------------------------------------------

const corpusDocs = readdirSync(corpus)
  .filter((f) => f.endsWith('.aml'))
  .sort();
const schemaOf = (text) => (/SchemaVersion="2\.15"/.test(text.slice(0, 3000)) ? '2.15' : '3.0');
const corpusInfo = corpusDocs.map((f) => {
  const text = readFileSync(join(corpus, f), 'utf8');
  return { ref: 'corpus:' + f, size: statSync(join(corpus, f)).size, schema: schemaOf(text) };
});
const genInfo = Object.entries(docs).map(([f, text]) => ({ ref: 'gen:' + f, size: text.length, schema: schemaOf(text) }));
const small = (d) => d.size <= 30000;

// Library service configurations of the IAMLLibraryService test double: `admin` lists the content
// types of the AdministrationData (3 library catalog, 4 class repository) of the server profile.
const services = {
  none: { admin: [] },
  nullProfile: { profile: false },
  'cat-embedded': { admin: [3], catalog: 'embedded' },
  'cat-a': { admin: [3], catalog: 'a' },
  'cat-null': { admin: [3], catalog: null },
  'cat-throw': { admin: [3], catalog: 'a', catalogMode: 'throw' },
  'cat-fault': { admin: [3], catalog: 'a', catalogMode: 'fault' },
  'repo-r1': { admin: [4], repository: 'r1' },
  'repo-null': { admin: [4], repository: null },
  'repo-fault': { admin: [4], repository: 'r1', repositoryMode: 'fault' },
  'full-a': { admin: [3, 4], catalog: 'a', repository: 'r1' },
  'full-b': { admin: [3, 4], catalog: 'b', repository: 'r1' },
  'full-embedded': { admin: [3, 4], catalog: 'embedded', repository: 'r1' },
  'full-empty': { admin: [3, 4], catalog: 'a', repository: 'empty' },
  'full-all': { admin: [3, 4], catalog: 'a', repository: 'all' },
  'full-bad1': { admin: [3, 4], catalog: 'a', repository: 'bad1' },
  'full-bad2': { admin: [3, 4], catalog: 'a', repository: 'bad2' },
  'full-bad3': { admin: [3, 4], catalog: 'a', repository: 'bad3' },
  'admin-order': { admin: [4, 0, 3, 3, 4], catalog: 'a', repository: 'r1' },
};

const schema = [];
for (const d of [...genInfo, ...corpusInfo]) {
  const modes = ['plain'];
  if (d.ref.startsWith('gen:') || small(d)) modes.push('ids', 'undo', 'lookup');
  if (d.ref.startsWith('gen:')) modes.push('events', 'nulltarget', 'unregistered');
  schema.push({ doc: d.ref, modes });
}
const engine = [];
for (const d of [...genInfo, ...corpusInfo.filter(small)]) engine.push({ doc: d.ref, modes: ['none', 'undo', 'transformer'] });

// Import of objects of a document with the other schema (CAEXSequence.Insert of a copy without parent).
const imports = [
  { from: 'gen:up-roles.aml', into: 'gen:down-roles.aml' },
  { from: 'gen:down-roles.aml', into: 'gen:up-roles.aml' },
  { from: 'gen:up-links.aml', into: 'gen:down-links.aml' },
  { from: 'gen:down-links.aml', into: 'gen:up-links.aml' },
  { from: 'corpus:9_ExtInt_IntLink.aml', into: 'corpus:12_MirrorObject.aml' },
  { from: 'corpus:12_MirrorObject.aml', into: 'corpus:9_ExtInt_IntLink.aml' },
  { from: 'corpus:8_AMLAttributeLibrary.aml', into: 'corpus:7_ICL.aml' },
  { from: 'corpus:13_Facet.aml', into: 'corpus:6_RCL.aml' },
];

// Edition cases: a scenario is a list of steps on one AMLEditionTransformer instance.
const edition = [];
const step = (doc, service, extra = {}) => ({ doc, service, edition: 1, logger: true, ids: false, ...extra });
for (const d of corpusInfo) {
  if (d.schema === '2.15') {
    edition.push({ steps: [step(d.ref, 'none')] });
    edition.push({ steps: [step(d.ref, 'full-a')] });
  } else edition.push({ steps: [step(d.ref, 'full-a')] });
}
for (const d of genInfo) {
  if (d.schema !== '2.15') {
    edition.push({ steps: [step(d.ref, 'full-a')] });
    continue;
  }
  for (const s of Object.keys(services)) edition.push({ steps: [step(d.ref, s)] });
}
for (const ed of [0, 2]) {
  edition.push({ steps: [step('gen:ed-extrefs.aml', 'full-a', { edition: ed })] });
  edition.push({ steps: [step('gen:ed-attrs.aml', 'full-a', { edition: ed })] });
}
for (const d of ['gen:ed-extrefs.aml', 'gen:ed-attrs.aml', 'gen:ed-attrs-noref.aml', 'gen:up-roles.aml']) {
  edition.push({ steps: [step(d, 'full-a', { ids: true })] });
}
edition.push({ steps: [step('gen:ed-attrs.aml', 'full-a', { logger: false })] });
edition.push({ steps: [step('gen:ed-attrs.aml', 'full-a', { preRegistered: true })] });
edition.push({ steps: [step('gen:ed-extrefs.aml', 'none', { preRegistered: true })] });
// The library catalog of an earlier call stays in the instance (used for attribute types).
edition.push({ steps: [step('gen:ed-extrefs.aml', 'cat-a'), step('gen:ed-attrs-noref.aml', 'repo-r1'), step('gen:ed-attrs-noref.aml', 'repo-r1', { logger: false })] });
edition.push({ steps: [step('gen:ed-attrs-noref.aml', 'repo-r1'), step('corpus:12_MirrorObject.aml', 'full-a'), step('gen:ed-attrs.aml', 'full-embedded')] });

const isError = ['ERROR', 'ERROR: x', 'Error', 'error: x', '', ' ERROR', 'ERRORS', '­ERROR', 'ÉRROR', 'ERR​OR', 'ＥRROR', 'ERROŔ', null];

writeFileSync(join(out, 'cases.json'), JSON.stringify({ services, schema, engine, imports, edition, isError }, null, 1));
console.log(
  `${Object.keys(docs).length} documents, ${schema.reduce((n, s) => n + s.modes.length, 0)} schema runs, ` +
    `${engine.reduce((n, s) => n + s.modes.length, 0)} engine runs, ${imports.length} imports, ${edition.length} edition scenarios`,
);
