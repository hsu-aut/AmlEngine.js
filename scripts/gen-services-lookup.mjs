// Generates the cases of the lookup service check (oracle/ServicesLookupOracle.cs,
// test/services/lookup.oracle.test.ts): documents with the structures the lookup tables index
// (duplicate IDs and names, ID-less elements, mirrors, links, aliases, overridden elements,
// mappings, deep and cyclic class hierarchies) and the scripts that query and change them.
//   node scripts/gen-services-lookup.mjs [outDir=test/services/lookup] [seed=3682]
// Every script opens one document (a corpus file, a document of test/reads or of this folder),
// registers a new LookupService and runs its ops; "sweep" calls every query of the service.
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'test/services/lookup', seedArg = '3682'] = process.argv.slice(2);
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

// ------------------------------------------------------------------------------------ documents

const DIR = outDir.replace(/\\/g, '/');
const H30 = (name, ext = '') => `<?xml version="1.0" encoding="utf-8"?>
<CAEXFile SchemaVersion="3.0" FileName="${name}" xmlns="http://www.dke.de/CAEX" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://www.dke.de/CAEX CAEX_ClassModel_V.3.0.xsd">
  <SuperiorStandardVersion>AutomationML 2.10</SuperiorStandardVersion>
  <SourceDocumentInformation OriginName="gen-services-lookup" OriginID="gen-services-lookup" OriginVersion="1.0.0" LastWritingDateTime="2024-05-06T07:08:09" />
${ext}`;
const H215 = (name, ext = '') => `<?xml version="1.0" encoding="utf-8"?>
<CAEXFile FileName="${name}" SchemaVersion="2.15" xsi:noNamespaceSchemaLocation="CAEX_ClassModel_V2.15.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <AdditionalInformation AutomationMLVersion="2.0" />
${ext}`;
const EXT = (file, ...aliases) => aliases.map((a) => `  <ExternalReference Path="${DIR}/${file}" Alias="${a}" />\n`).join('');

const DOCS = {
  'ext-lookup.aml': `${H30('ext-lookup.aml')}  <InstanceHierarchy Name="ExtIH">
    <InternalElement Name="ExtIE" ID="ext-ie">
      <ExternalInterface Name="ExtEI" ID="ext-ei" RefBaseClassPath="ExtICL/ExtInterface" />
    </InternalElement>
  </InstanceHierarchy>
  <InterfaceClassLib Name="ExtICL">
    <InterfaceClass Name="ExtInterface" />
    <InterfaceClass Name="ExtData" RefBaseClassPath="ExtICL/ExtInterface" />
  </InterfaceClassLib>
  <RoleClassLib Name="ExtRCL">
    <RoleClass Name="ExtRole" />
  </RoleClassLib>
  <SystemUnitClassLib Name="ExtSUCL">
    <SystemUnitClass Name="ExtClass" ID="ext-suc">
      <ExternalInterface Name="P" ID="ext-suc-p" />
    </SystemUnitClass>
  </SystemUnitClassLib>
  <AttributeTypeLib Name="ExtATL">
    <AttributeType Name="ExtType" AttributeDataType="xs:string" />
  </AttributeTypeLib>
</CAEXFile>
`,
  'ext-lookup-215.aml': `${H215('ext-lookup-215.aml')}  <InstanceHierarchy Name="ExtIH">
    <InternalElement Name="ExtIE" ID="ext-ie">
      <ExternalInterface Name="ExtEI" ID="ext-ei" RefBaseClassPath="ExtICL/ExtInterface" />
    </InternalElement>
  </InstanceHierarchy>
  <InterfaceClassLib Name="ExtICL">
    <InterfaceClass Name="ExtInterface" />
  </InterfaceClassLib>
  <RoleClassLib Name="ExtRCL">
    <RoleClass Name="ExtRole" />
  </RoleClassLib>
  <SystemUnitClassLib Name="ExtSUCL">
    <SystemUnitClass Name="ExtClass" ID="ext-suc" />
  </SystemUnitClassLib>
</CAEXFile>
`,
  // Overridden elements and mappings (name references), duplicate library and class names,
  // nested classes with the same name on several levels, the AutomationML data connector classes.
  'names-30.aml': `${H30('names-30.aml', EXT('ext-lookup.aml', 'Ext'))}  <InstanceHierarchy Name="IH">
    <InternalElement Name="M1" ID="ie-m1" RefBaseSystemUnitPath="SUCL/Machine">
      <Attribute Name="Power" AttributeDataType="xs:double">
        <Value>5</Value>
      </Attribute>
      <ExternalInterface Name="Plug" ID="ei-m1-plug" RefBaseClassPath="ICL/Port" />
      <ExternalInterface Name="Data" ID="ei-m1-data" RefBaseClassPath="ICL/Data" />
      <InternalElement Name="Motor" ID="ie-m1-motor" RefBaseSystemUnitPath="SUCL/Motor" />
      <RoleRequirements RefBaseRoleClassPath="RCL/Resource">
        <Attribute Name="Speed" AttributeDataType="xs:double" />
        <ExternalInterface Name="In" ID="ei-m1-in" RefBaseClassPath="ICL/Port" />
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="Power" RoleAttributeName="Speed" />
          <InterfaceNameMapping SystemUnitInterfaceName="Plug" RoleInterfaceName="In" />
          <InterfaceIDMapping SystemUnitInterfaceID="ei-m1-plug" RoleInterfaceID="ei-m1-in" />
        </MappingObject>
      </RoleRequirements>
    </InternalElement>
    <InternalElement Name="M2" ID="ie-m2" RefBaseSystemUnitPath="SUCL/Machine/Press">
      <Attribute Name="Power" AttributeDataType="xs:double" />
      <ExternalInterface Name="Plug" ID="ei-m2-plug" RefBaseClassPath="ICL/Port/Port" />
      <ExternalInterface Name="Col" ID="ei-m2-col" RefBaseClassPath="AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/COLLADAInterface" />
    </InternalElement>
    <InternalElement Name="M3" ID="ie-m3" RefBaseSystemUnitPath="SUCL/Machine/Press/Press">
      <Attribute Name="Power" AttributeDataType="xs:double" />
      <ExternalInterface Name="X" ID="ei-m3-x" RefBaseClassPath="Ext@ExtICL/ExtData" />
    </InternalElement>
    <InternalElement Name="Dup" ID="ie-dup1" />
    <InternalElement Name="Dup" ID="ie-dup2" RefBaseSystemUnitPath="SUCL/Motor" />
    <InternalLink Name="L1" RefPartnerSideA="ei-m1-plug" RefPartnerSideB="ei-m2-plug" />
    <InternalLink Name="L2" RefPartnerSideA="ei-m1-data" RefPartnerSideB="ei-m2-col" />
  </InstanceHierarchy>
  <InstanceHierarchy Name="IH">
    <InternalElement Name="Other" ID="ie-other" RefBaseSystemUnitPath="SUCL/Second" />
  </InstanceHierarchy>
  <InterfaceClassLib Name="ICL">
    <InterfaceClass Name="Port">
      <InterfaceClass Name="Port" RefBaseClassPath="ICL/Port">
        <InterfaceClass Name="Port" RefBaseClassPath="ICL/Port/Port" />
      </InterfaceClass>
    </InterfaceClass>
    <InterfaceClass Name="Data" RefBaseClassPath="AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector" />
    <InterfaceClass Name="ExtData" RefBaseClassPath="Ext@ExtICL/ExtData" />
  </InterfaceClassLib>
  <InterfaceClassLib Name="AutomationMLInterfaceClassLib">
    <InterfaceClass Name="AutomationMLBaseInterface">
      <InterfaceClass Name="ExternalDataConnector" RefBaseClassPath="AutomationMLInterfaceClassLib/AutomationMLBaseInterface">
        <InterfaceClass Name="COLLADAInterface" RefBaseClassPath="AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector" />
        <InterfaceClass Name="PLCopenXMLInterface" RefBaseClassPath="AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector" />
      </InterfaceClass>
    </InterfaceClass>
  </InterfaceClassLib>
  <InterfaceClassLib Name="ICL">
    <InterfaceClass Name="Other" RefBaseClassPath="ICL/Port" />
  </InterfaceClassLib>
  <RoleClassLib Name="RCL">
    <RoleClass Name="Resource">
      <Attribute Name="Speed" AttributeDataType="xs:double" />
      <ExternalInterface Name="In" RefBaseClassPath="ICL/Port" />
      <RoleClass Name="Robot" RefBaseClassPath="RCL/Resource">
        <Attribute Name="Speed" AttributeDataType="xs:double" />
      </RoleClass>
    </RoleClass>
    <RoleClass Name="MyFacet" RefBaseClassPath="AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Facet" />
  </RoleClassLib>
  <RoleClassLib Name="AutomationMLBaseRoleClassLib">
    <RoleClass Name="AutomationMLBaseRole">
      <RoleClass Name="Facet" RefBaseClassPath="AutomationMLBaseRoleClassLib/AutomationMLBaseRole" />
    </RoleClass>
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCL">
    <SystemUnitClass Name="Machine" ID="suc-machine">
      <Attribute Name="Power" AttributeDataType="xs:double" />
      <ExternalInterface Name="Plug" ID="suc-machine-plug" RefBaseClassPath="ICL/Port" />
      <InternalElement Name="Motor" ID="suc-machine-motor" RefBaseSystemUnitPath="SUCL/Motor" />
      <SupportedRoleClass RefRoleClassPath="RCL/Resource">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="Power" RoleAttributeName="Speed" />
          <InterfaceNameMapping SystemUnitInterfaceName="Plug" RoleInterfaceName="In" />
        </MappingObject>
      </SupportedRoleClass>
      <SystemUnitClass Name="Press" ID="suc-press" RefBaseClassPath="SUCL/Machine">
        <Attribute Name="Power" AttributeDataType="xs:double" />
        <ExternalInterface Name="Plug" ID="suc-press-plug" RefBaseClassPath="ICL/Port" />
        <SystemUnitClass Name="Press" ID="suc-press2" RefBaseClassPath="SUCL/Machine/Press">
          <Attribute Name="Power" AttributeDataType="xs:double" />
        </SystemUnitClass>
      </SystemUnitClass>
    </SystemUnitClass>
    <SystemUnitClass Name="Motor" ID="suc-motor" />
    <SystemUnitClass Name="Motor" ID="suc-motor-dup" />
    <SystemUnitClass Name="Ext" ID="suc-ext" RefBaseClassPath="Ext@ExtSUCL/ExtClass">
      <ExternalInterface Name="P" ID="suc-ext-p" />
      <SupportedRoleClass RefRoleClassPath="Ext@ExtRCL/ExtRole" />
    </SystemUnitClass>
  </SystemUnitClassLib>
  <SystemUnitClassLib Name="SUCL">
    <SystemUnitClass Name="Second" ID="suc-second" RefBaseClassPath="SUCL/Machine" />
  </SystemUnitClassLib>
  <AttributeTypeLib Name="ATL">
    <AttributeType Name="Length" AttributeDataType="xs:double">
      <Attribute Name="Unit" AttributeDataType="xs:string" />
    </AttributeType>
    <AttributeType Name="Width" AttributeDataType="xs:double" RefAttributeType="ATL/Length">
      <Attribute Name="Unit" AttributeDataType="xs:string" />
    </AttributeType>
    <AttributeType Name="Ext" AttributeDataType="xs:string" RefAttributeType="Ext@ExtATL/ExtType" />
  </AttributeTypeLib>
</CAEXFile>
`,
  'names-215.aml': `${H215('names-215.aml', EXT('ext-lookup-215.aml', 'Ext'))}  <InstanceHierarchy Name="IH">
    <InternalElement Name="M1" ID="ie-m1" RefBaseSystemUnitPath="SUCL/Machine">
      <Attribute Name="Power" AttributeDataType="xs:double">
        <Value>5</Value>
      </Attribute>
      <ExternalInterface Name="Plug" ID="ei-m1-plug" RefBaseClassPath="ICL/Port" />
      <InternalElement Name="Motor" ID="ie-m1-motor" RefBaseSystemUnitPath="SUCL/Motor" />
      <RoleRequirements RefBaseRoleClassPath="RCL/Resource">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="Power" RoleAttributeName="Speed" />
          <InterfaceNameMapping SystemUnitInterfaceName="Plug" RoleInterfaceName="In" />
        </MappingObject>
      </RoleRequirements>
    </InternalElement>
    <InternalElement Name="M2" ID="ie-m2" RefBaseSystemUnitPath="SUCL/Machine/Press">
      <Attribute Name="Power" AttributeDataType="xs:double" />
      <ExternalInterface Name="Plug" ID="ei-m2-plug" RefBaseClassPath="ICL/Port/Port" />
      <ExternalInterface Name="Col" ID="ei-m2-col" RefBaseClassPath="AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/COLLADAInterface" />
    </InternalElement>
    <InternalElement Name="Dup" ID="ie-dup1" />
    <InternalElement Name="Dup" ID="ie-dup2" RefBaseSystemUnitPath="SUCL/Motor" />
    <InternalLink Name="L1" RefPartnerSideA="ie-m1:Plug" RefPartnerSideB="ie-m2:Plug" />
    <InternalLink Name="L2" RefPartnerSideA="ie-m2:Col" RefPartnerSideB="ie-m1:Missing" />
    <InternalLink Name="L3" RefPartnerSideA="Ext@ext-ie:ExtEI" RefPartnerSideB="ie-m2:Plug" />
  </InstanceHierarchy>
  <InterfaceClassLib Name="ICL">
    <InterfaceClass Name="Port">
      <InterfaceClass Name="Port" RefBaseClassPath="ICL/Port" />
    </InterfaceClass>
    <InterfaceClass Name="Ext" RefBaseClassPath="Ext@ExtICL/ExtInterface" />
  </InterfaceClassLib>
  <InterfaceClassLib Name="AutomationMLInterfaceClassLib">
    <InterfaceClass Name="AutomationMLBaseInterface">
      <InterfaceClass Name="ExternalDataConnector" RefBaseClassPath="AutomationMLInterfaceClassLib/AutomationMLBaseInterface">
        <InterfaceClass Name="COLLADAInterface" RefBaseClassPath="AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector" />
      </InterfaceClass>
    </InterfaceClass>
  </InterfaceClassLib>
  <RoleClassLib Name="RCL">
    <RoleClass Name="Resource">
      <Attribute Name="Speed" AttributeDataType="xs:double" />
      <ExternalInterface Name="In" RefBaseClassPath="ICL/Port" />
    </RoleClass>
  </RoleClassLib>
  <RoleClassLib Name="RCL">
    <RoleClass Name="Resource" RefBaseClassPath="RCL/Resource" />
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCL">
    <SystemUnitClass Name="Machine" ID="suc-machine">
      <Attribute Name="Power" AttributeDataType="xs:double" />
      <ExternalInterface Name="Plug" ID="suc-machine-plug" RefBaseClassPath="ICL/Port" />
      <InternalElement Name="Motor" ID="suc-machine-motor" RefBaseSystemUnitPath="SUCL/Motor" />
      <SupportedRoleClass RefRoleClassPath="RCL/Resource">
        <MappingObject>
          <AttributeNameMapping SystemUnitAttributeName="Power" RoleAttributeName="Speed" />
        </MappingObject>
      </SupportedRoleClass>
      <SystemUnitClass Name="Press" ID="suc-press" RefBaseClassPath="SUCL/Machine">
        <Attribute Name="Power" AttributeDataType="xs:double" />
        <ExternalInterface Name="Plug" ID="suc-press-plug" RefBaseClassPath="ICL/Port" />
      </SystemUnitClass>
    </SystemUnitClass>
    <SystemUnitClass Name="Motor" ID="suc-motor" />
    <SystemUnitClass Name="Motor" ID="suc-motor-dup" />
    <SystemUnitClass Name="Ext" ID="suc-ext" RefBaseClassPath="Ext@ExtSUCL/ExtClass" />
  </SystemUnitClassLib>
</CAEXFile>
`,
  // IDs: duplicates across kinds, missing and empty IDs (two or more ID-less elements), mirrors of
  // InternalElements, ExternalInterfaces and attributes, links to missing and aliased IDs.
  'ids-30.aml': `${H30('ids-30.aml', EXT('ext-lookup.aml', 'Ext'))}  <InstanceHierarchy Name="IH">
    <InternalElement Name="Master" ID="ie-master" RefBaseSystemUnitPath="SUCL/Tank">
      <Attribute Name="Level" AttributeDataType="xs:double">
        <Value>1</Value>
        <Attribute Name="Max" AttributeDataType="xs:double" />
      </Attribute>
      <ExternalInterface Name="Plug" ID="ei-master-plug" />
      <ExternalInterface Name="NoId1" />
      <ExternalInterface Name="NoId2" ID="" />
      <InternalElement Name="Child" ID="ie-child" />
    </InternalElement>
    <InternalElement Name="Mirror" ID="ie-mirror" RefBaseSystemUnitPath="ie-master" />
    <InternalElement Name="Mirror2" ID="ie-mirror2" RefBaseSystemUnitPath="ie-master" />
    <InternalElement Name="MirrorOfMirror" ID="ie-mm" RefBaseSystemUnitPath="ie-mirror" />
    <InternalElement Name="Holder" ID="ie-holder">
      <ExternalInterface Name="PlugMirror" ID="ei-mirror" RefBaseClassPath="ei-master-plug" />
      <ExternalInterface Name="Same" ID="dup" />
      <InternalElement Name="Same" ID="dup" />
      <InternalElement Name="NoId" />
      <InternalElement Name="NoId" />
      <InternalElement Name="Blank" ID=" " />
    </InternalElement>
    <InternalElement Name="Space Id" ID="id with space" />
    <InternalElement Name="Guid" ID="{0f8c4d2e-1111-4a2b-9c3d-2e4f5a6b7c8d}" RefBaseSystemUnitPath="{0f8c4d2e-1111-4a2b-9c3d-2e4f5a6b7c8d}" />
    <InternalElement Name="ExtMirror" ID="ie-extmirror" RefBaseSystemUnitPath="Ext@ext-ie" />
    <InternalLink Name="L1" RefPartnerSideA="ei-master-plug" RefPartnerSideB="ei-mirror" />
    <InternalLink Name="L2" RefPartnerSideA="dup" RefPartnerSideB="missing-id" />
    <InternalLink Name="L3" RefPartnerSideA="Ext@ext-ei" RefPartnerSideB="ei-master-plug" />
    <InternalLink Name="L4" RefPartnerSideA="" RefPartnerSideB="ie-master" />
  </InstanceHierarchy>
  <InterfaceClassLib Name="ICL">
    <InterfaceClass Name="Port" ID="ic-port" />
  </InterfaceClassLib>
  <SystemUnitClassLib Name="SUCL">
    <SystemUnitClass Name="Tank" ID="suc-tank">
      <Attribute Name="Level" AttributeDataType="xs:double" />
      <ExternalInterface Name="Plug" ID="suc-tank-plug" RefBaseClassPath="ICL/Port" />
      <ExternalInterface Name="NoId" />
      <InternalElement Name="In" ID="suc-tank-in">
        <ExternalInterface Name="P" ID="suc-in-p" />
      </InternalElement>
      <InternalElement Name="Out" ID="suc-tank-out">
        <ExternalInterface Name="P" ID="suc-out-p" />
      </InternalElement>
      <InternalLink Name="TL" RefPartnerSideA="suc-in-p" RefPartnerSideB="suc-out-p" />
    </SystemUnitClass>
    <SystemUnitClass Name="DupId" ID="ie-master" />
    <SystemUnitClass Name="NoId" />
    <SystemUnitClass Name="NoId2" ID="" />
  </SystemUnitClassLib>
</CAEXFile>
`,
  'ids-215.aml': `${H215('ids-215.aml', EXT('ext-lookup-215.aml', 'Ext'))}  <InstanceHierarchy Name="IH">
    <InternalElement Name="Master" ID="ie-master" RefBaseSystemUnitPath="SUCL/Tank">
      <Attribute Name="Level" AttributeDataType="xs:double" />
      <ExternalInterface Name="Plug" ID="ei-master-plug" />
      <ExternalInterface Name="NoId1" />
      <InternalElement Name="Child" ID="ie-child" />
    </InternalElement>
    <InternalElement Name="Mirror" ID="ie-mirror" RefBaseSystemUnitPath="ie-master" />
    <InternalElement Name="MirrorOfMirror" ID="ie-mm" RefBaseSystemUnitPath="ie-mirror" />
    <InternalElement Name="Holder" ID="ie-holder">
      <ExternalInterface Name="PlugMirror" ID="ei-mirror" RefBaseClassPath="ei-master-plug" />
      <InternalElement Name="Same" ID="dup" />
      <InternalElement Name="Same" ID="dup" />
      <InternalElement Name="NoId" />
      <InternalElement Name="NoId" />
    </InternalElement>
    <InternalLink Name="L1" RefPartnerSideA="ie-master:Plug" RefPartnerSideB="ie-holder:PlugMirror" />
    <InternalLink Name="L2" RefPartnerSideA="dup:Same" RefPartnerSideB="missing-id:X" />
    <InternalLink Name="L3" RefPartnerSideA="Ext@ext-ie:ExtEI" RefPartnerSideB="ie-master:Plug" />
    <InternalLink Name="L4" RefPartnerSideA="ie-master:NoId1" RefPartnerSideB="ie-master" />
  </InstanceHierarchy>
  <SystemUnitClassLib Name="SUCL">
    <SystemUnitClass Name="Tank" ID="suc-tank">
      <Attribute Name="Level" AttributeDataType="xs:double" />
      <ExternalInterface Name="Plug" />
      <InternalElement Name="In" ID="suc-tank-in">
        <ExternalInterface Name="P" />
      </InternalElement>
      <InternalElement Name="Out" ID="suc-tank-out">
        <ExternalInterface Name="P" />
      </InternalElement>
      <InternalLink Name="TL" RefPartnerSideA="suc-tank-in:P" RefPartnerSideB="suc-tank-out:P" />
    </SystemUnitClass>
    <SystemUnitClass Name="DupId" ID="ie-master" />
  </SystemUnitClassLib>
</CAEXFile>
`,
  // Class hierarchies several levels deep, within and across libraries, and EIs of derived
  // interface classes (AllClassReferencesDeep, AllExternalInterfacesOfType).
  'deep-30.aml': `${H30('deep-30.aml', EXT('ext-lookup.aml', 'Ext'))}  <InstanceHierarchy Name="IH">
    <InternalElement Name="I1" ID="ie-i1" RefBaseSystemUnitPath="SUCL/L1/L2/L3">
      <ExternalInterface Name="A" ID="ei-i1-a" RefBaseClassPath="ICL/I1" />
      <ExternalInterface Name="B" ID="ei-i1-b" RefBaseClassPath="ICL/I1/I2/I3" />
      <ExternalInterface Name="C" ID="ei-i1-c" RefBaseClassPath="ICL2/J1" />
      <ExternalInterface Name="D" ID="ei-i1-d" RefBaseClassPath="ICL2/J1/J2" />
      <ExternalInterface Name="E" ID="ei-i1-e" RefBaseClassPath="Ext@ExtICL/ExtData" />
      <InternalElement Name="I2" ID="ie-i2" RefBaseSystemUnitPath="SUCL2/K3">
        <ExternalInterface Name="A" ID="ei-i2-a" RefBaseClassPath="ICL/I1/I2" />
      </InternalElement>
    </InternalElement>
  </InstanceHierarchy>
  <InterfaceClassLib Name="ICL">
    <InterfaceClass Name="I0" />
    <InterfaceClass Name="I1" RefBaseClassPath="ICL/I0">
      <InterfaceClass Name="I2" RefBaseClassPath="ICL/I1">
        <InterfaceClass Name="I3" RefBaseClassPath="ICL/I1/I2">
          <InterfaceClass Name="I4" RefBaseClassPath="ICL/I1/I2/I3" />
        </InterfaceClass>
      </InterfaceClass>
    </InterfaceClass>
  </InterfaceClassLib>
  <InterfaceClassLib Name="ICL2">
    <InterfaceClass Name="J1" RefBaseClassPath="ICL/I1/I2/I3/I4">
      <InterfaceClass Name="J2" RefBaseClassPath="ICL2/J1" />
    </InterfaceClass>
    <InterfaceClass Name="J3" RefBaseClassPath="Ext@ExtICL/ExtInterface" />
  </InterfaceClassLib>
  <RoleClassLib Name="RCL">
    <RoleClass Name="R0" />
    <RoleClass Name="R1" RefBaseClassPath="RCL/R0" />
    <RoleClass Name="R2" RefBaseClassPath="RCL/R1" />
    <RoleClass Name="R3" RefBaseClassPath="RCL/R2" />
    <RoleClass Name="R4" RefBaseClassPath="RCL/R3" />
    <RoleClass Name="R5" RefBaseClassPath="RCL/R4" />
    <RoleClass Name="RB" RefBaseClassPath="RCL/R0" />
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCL">
    <SystemUnitClass Name="L1" ID="suc-l1">
      <SupportedRoleClass RefRoleClassPath="RCL/R5" />
      <SystemUnitClass Name="L2" ID="suc-l2" RefBaseClassPath="SUCL/L1">
        <SystemUnitClass Name="L3" ID="suc-l3" RefBaseClassPath="SUCL/L1/L2">
          <SystemUnitClass Name="L4" ID="suc-l4" RefBaseClassPath="SUCL/L1/L2/L3" />
        </SystemUnitClass>
      </SystemUnitClass>
    </SystemUnitClass>
  </SystemUnitClassLib>
  <SystemUnitClassLib Name="SUCL2">
    <SystemUnitClass Name="K1" ID="suc-k1" RefBaseClassPath="SUCL/L1/L2/L3/L4" />
    <SystemUnitClass Name="K2" ID="suc-k2" RefBaseClassPath="SUCL2/K1" />
    <SystemUnitClass Name="K3" ID="suc-k3" RefBaseClassPath="SUCL2/K2" />
    <SystemUnitClass Name="K4" ID="suc-k4" RefBaseClassPath="SUCL2/K1" />
    <SystemUnitClass Name="KX" ID="suc-kx" RefBaseClassPath="Ext@ExtSUCL/ExtClass" />
    <SystemUnitClass Name="KY" ID="suc-ky" RefBaseClassPath="SUCL2/KX" />
  </SystemUnitClassLib>
  <AttributeTypeLib Name="ATL">
    <AttributeType Name="T0" AttributeDataType="xs:string" />
    <AttributeType Name="T1" AttributeDataType="xs:string" RefAttributeType="ATL/T0" />
    <AttributeType Name="T2" AttributeDataType="xs:string" RefAttributeType="ATL/T1" />
    <AttributeType Name="T3" AttributeDataType="xs:string" RefAttributeType="ATL/T2" />
  </AttributeTypeLib>
</CAEXFile>
`,
  // Cyclic class hierarchies whose classes override each other's attributes and interfaces (the
  // name references of NameReferenceTable follow the cycle), self derivation, a cycle of three.
  'cyclic-30.aml': `${H30('cyclic-30.aml')}  <InstanceHierarchy Name="IH">
    <InternalElement Name="Cyc" ID="ie-cyc" RefBaseSystemUnitPath="SUCL/CycA">
      <Attribute Name="X" AttributeDataType="xs:string" />
      <ExternalInterface Name="P" ID="ei-cyc-p" RefBaseClassPath="ICL/CycA" />
    </InternalElement>
  </InstanceHierarchy>
  <InterfaceClassLib Name="ICL">
    <InterfaceClass Name="CycA" ID="ic-cyca" RefBaseClassPath="ICL/CycB" />
    <InterfaceClass Name="CycB" ID="ic-cycb" RefBaseClassPath="ICL/CycA" />
    <InterfaceClass Name="Ok" ID="ic-ok" />
  </InterfaceClassLib>
  <RoleClassLib Name="RCL">
    <RoleClass Name="Self" RefBaseClassPath="RCL/Self">
      <Attribute Name="S" AttributeDataType="xs:string" />
    </RoleClass>
    <RoleClass Name="Ok" />
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCL">
    <SystemUnitClass Name="CycA" ID="suc-cyca" RefBaseClassPath="SUCL/CycB">
      <Attribute Name="X" AttributeDataType="xs:string" />
      <ExternalInterface Name="P" ID="suc-cyca-p" />
    </SystemUnitClass>
    <SystemUnitClass Name="CycB" ID="suc-cycb" RefBaseClassPath="SUCL/CycA">
      <Attribute Name="X" AttributeDataType="xs:string" />
      <ExternalInterface Name="P" ID="suc-cycb-p" />
    </SystemUnitClass>
    <SystemUnitClass Name="T1" ID="suc-t1" RefBaseClassPath="SUCL/T3" />
    <SystemUnitClass Name="T2" ID="suc-t2" RefBaseClassPath="SUCL/T1" />
    <SystemUnitClass Name="T3" ID="suc-t3" RefBaseClassPath="SUCL/T2" />
    <SystemUnitClass Name="Ok" ID="suc-ok" />
  </SystemUnitClassLib>
</CAEXFile>
`,
  // Alias references of every kind, aliases used twice, an alias without document.
  'aliases-30.aml': `${H30('aliases-30.aml', EXT('ext-lookup.aml', 'Ext', 'Dup', 'Dup') + '  <ExternalReference Path="no-such-file.aml" Alias="Missing" />\n')}  <InstanceHierarchy Name="IH">
    <InternalElement Name="UsesExt" ID="ie-uses" RefBaseSystemUnitPath="Ext@ExtSUCL/ExtClass">
      <ExternalInterface Name="E" ID="ei-uses" RefBaseClassPath="Ext@ExtICL/ExtData" />
      <Attribute Name="T" AttributeDataType="xs:string" RefAttributeType="Ext@ExtATL/ExtType" />
      <RoleRequirements RefBaseRoleClassPath="Ext@ExtRCL/ExtRole" />
    </InternalElement>
    <InternalElement Name="UsesDup" ID="ie-dup" RefBaseSystemUnitPath="Dup@ExtSUCL/ExtClass" />
    <InternalElement Name="UsesMissing" ID="ie-missing" RefBaseSystemUnitPath="Missing@Lib/Class">
      <ExternalInterface Name="E" ID="ei-missing" RefBaseClassPath="Missing@ICL/X" />
    </InternalElement>
    <InternalElement Name="MirrorExt" ID="ie-mext" RefBaseSystemUnitPath="Ext@ext-ie" />
    <InternalLink Name="L1" RefPartnerSideA="Ext@ext-ei" RefPartnerSideB="ei-uses" />
    <InternalLink Name="L2" RefPartnerSideA="Missing@x" RefPartnerSideB="Dup@ext-ei" />
  </InstanceHierarchy>
  <InterfaceClassLib Name="ICL">
    <InterfaceClass Name="Local" RefBaseClassPath="Ext@ExtICL/ExtInterface">
      <InterfaceClass Name="Sub" RefBaseClassPath="ICL/Local" />
    </InterfaceClass>
  </InterfaceClassLib>
  <RoleClassLib Name="RCL">
    <RoleClass Name="R" RefBaseClassPath="Ext@ExtRCL/ExtRole" />
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCL">
    <SystemUnitClass Name="S" ID="suc-s" RefBaseClassPath="Ext@ExtSUCL/ExtClass">
      <SupportedRoleClass RefRoleClassPath="Dup@ExtRCL/ExtRole" />
      <SystemUnitClass Name="S2" ID="suc-s2" RefBaseClassPath="SUCL/S" />
    </SystemUnitClass>
  </SystemUnitClassLib>
  <AttributeTypeLib Name="ATL">
    <AttributeType Name="A" AttributeDataType="xs:string" RefAttributeType="Ext@ExtATL/ExtType" />
  </AttributeTypeLib>
</CAEXFile>
`,
};

mkdirSync(outDir, { recursive: true });
for (const [name, text] of Object.entries(DOCS)) writeFileSync(join(outDir, name), text);

// -------------------------------------------------------------------------------------- scripts

const NAMES = ['A', 'B', 'Pump', 'Motor', 'Plug', 'Power', 'Speed', 'In', 'Port', 'X', 'P', 'Press', 'Machine', 'dup', 'dup', 'a/b', '[x]', 'Name with space', ''];
const IDVALS = [null, '', ' ', 'id-new', 'dup', 'ie-master', 'ie-m1', 'ext-ie', 'Ext@ext-ie'];
const REFSTRS = [null, '', 'Missing/Path', 'Ext@ExtSUCL/ExtClass', 'Ext@ExtICL/ExtData', 'Ext@ExtRCL/ExtRole', 'Ext@ExtATL/ExtType', 'Dup@ExtSUCL/ExtClass', 'Missing@Lib/Class', 'SUCL', 'x', 'ext-ie', 'ie-master'];
const ALIASES = [null, '', 'Ext', 'Ext2', 'Dup', 'Missing', 'New'];

// Engine operations (EngineOpsOracle.Apply, test/engine/ops-apply.ts) and the operations of this
// check (ServicesLookupOracle.Apply, the test).
const OPS = [
  [2, () => ({ op: 'newIH', name: pick(NAMES) })],
  [1, () => ({ op: 'newLib', kind: pick(['suc', 'rc', 'ic', 'at']), name: pick(NAMES) })],
  [4, () => ({ op: 'newClass', kind: pick(['suc', 'rc', 'ic', 'at']), a: int(), name: pick(NAMES) })],
  [4, () => ({ op: 'newIE', a: int(), name: pick(NAMES) })],
  [3, () => ({ op: 'newAttr', a: int(), name: pick(NAMES) })],
  [4, () => ({ op: 'newEI', a: int(), b: int(), name: pick(NAMES), withClass: chance(0.7) })],
  [4, () => ({ op: 'setBase', kind: pick(['suc', 'rc', 'ic']), a: int(), b: int() })],
  [2, () => ({ op: 'addRole', a: int(), b: int() })],
  [3, () => ({ op: 'instantiate', a: int(), b: int() })],
  [4, () => ({ op: 'link', a: int(), b: int(), name: pick(NAMES) })],
  [4, () => ({ op: 'remove', a: int(), relations: chance(0.5) })],
  [2, () => ({ op: 'copyIE', a: int(), b: int() })],
  [5, () => ({ op: 'rename', a: int(), name: pick(NAMES) })],
  [3, () => ({ op: 'newGuid', a: int(), updateRefs: chance(0.5) })],
  [3, () => ({ op: 'mirror', a: int(), b: int() })],
  [3, () => ({ op: 'setRefBase', a: int(), b: int() })],
  [3, () => ({ op: 'move', a: int(), b: int() })],
  [2, () => ({ op: 'query', a: int() })],
  [5, () => ({ op: 'renameKind', k: pick(['class', 'class', 'lib', 'attr', 'ei', 'ie']), a: int(), name: pick(NAMES) })],
  [3, () => ({ op: 'removeKind', k: pick(['class', 'lib', 'attr', 'ei', 'ie', 'il', 'ext']), a: int(), rel: chance(0.5) })],
  [5, () => ({ op: 'setID', a: int(), mode: pick(['dup', 'dup', 'value']), b: int(), value: pick(IDVALS) })],
  [6, () => {
    const k = pick(['ie', 'ei', 'suc', 'rc', 'ic', 'attr', 'at', 'rr', 'src', 'il', 'il']);
    return { op: 'setRef', k, a: int(), side: pick(['A', 'B']), vk: pick(['path', 'path', 'id', 'ieif', 'str']), b: int(), value: pick(REFSTRS) };
  }],
  [3, () => ({ op: 'insertSibling', k: pick(['suc', 'rc', 'ic', 'ie', 'attr', 'il']), a: int(), b: int(), before: chance(0.5) })],
  [1, () => ({ op: 'extRefNew', path: pick([`${DIR}/ext-lookup.aml`, 'other.aml', null]), alias: pick(ALIASES) })],
  [2, () => ({ op: 'extRefSet', a: int(), value: pick(ALIASES) })],
  [3, () => ({ op: 'attrMirror', a: int(), b: int() })],
  [3, () => ({ op: 'eiMirror', a: int(), b: int() })],
  [2, () => ({ op: 'mapping', a: int(), kind: pick(['attrName', 'ifName', 'ifId']), x: pick(NAMES), y: pick(NAMES) })],
  [2, () => ({ op: 'setNameRef', a: int(), which: pick(['su', 'role']), value: pick(NAMES) })],
  [3, () => ({ op: 'refSet', src: pick(['path', 'path', 'id', 'name', 'alias', 'ident']), a: int(), value: pick([...REFSTRS, ...NAMES]) })],
  [2, () => ({ op: 'changeNameRefs', a: int(), name: pick(NAMES) })],
];
const total = OPS.reduce((s, [w]) => s + w, 0);
function nextOp() {
  let r = rnd() * total;
  for (const [w, f] of OPS) if ((r -= w) < 0) return f();
  return OPS[0][1]();
}

const sweepFull = () => ({ op: 'sweep', m: 50, n: 300, off: 0, edges: true });
const sweepSmall = () => ({ op: 'sweep', m: 12, n: 80, off: int() });

// The registry operations, one variant per script in turn. (Queries on an unregistered service are
// in the scripts "registry:..." below: the instance registers itself again and handles changes.)
const REGISTRY = [
  () => [{ op: 'removeDocument' }, sweepSmall(), { op: 'addDocument' }, { op: 'addDocument' }],
  () => [{ op: 'unregister' }, { op: 'register' }],
  () => [{ op: 'unload' }],
  () => [{ op: 'autoUpdate', value: null }],
  () => [{ op: 'unregister' }, { op: 'register' }, { op: 'removeDocument' }],
];

const starts = [
  ...readdirSync('test/corpus').filter((f) => f.endsWith('.aml')).sort().map((f) => 'corpus:' + f),
  ...readdirSync('test/reads').filter((f) => f.endsWith('.aml') && f !== 'ext-lib.aml').sort().map((f) => 'test/reads/' + f),
  ...Object.keys(DOCS).filter((f) => !f.startsWith('ext-')).sort().map((f) => `${DIR}/${f}`),
];

const scripts = [];
starts.forEach((start, i) => {
  const ops = [sweepFull()];
  for (let b = 0; b < 4; b++) {
    for (let j = 0; j < 10; j++) ops.push(nextOp());
    if (b === 1) ops.push(...REGISTRY[i % REGISTRY.length]());
    ops.push(b === 3 ? { op: 'sweep', m: 30, n: 200, off: int() } : sweepSmall());
  }
  scripts.push({ name: 'random:' + start.replace(/^.*[/:]/, ''), start, auto: i % 2 === 0, ops });
});

// Hand-written scripts.
const S = (name, start, auto, ops) => scripts.push({ name, start, auto, ops });
const small = () => ({ op: 'sweep', m: 20, n: 100, off: 0 });
// An element that is indexed already is added again by InsertBefore/InsertAfter: a class with an
// ID is linked to itself in the ID table; the next walk of that chain does not return.
for (const [k, a, b] of [['suc', 0, 1], ['suc', 1, 0], ['rc', 0, 1], ['ic', 0, 1], ['ie', 0, 1], ['attr', 0, 1], ['il', 0, 1]]) {
  for (const start of [`${DIR}/names-30.aml`, `${DIR}/ids-30.aml`, `${DIR}/names-215.aml`]) {
    S(`reinsert:${k}:${start.replace(/^.*\//, '')}`, start, true, [
      small(),
      { op: 'insertSibling', k, a, b, before: true },
      small(),
      { op: 'insertSibling', k, a, b, before: false },
      small(),
      { op: 'insertSibling', k, a, b: a + 2, before: true },
      small(),
    ]);
  }
}
// Renames in cyclic hierarchies (NameReferenceTable.ChangeName follows the overridden elements).
for (const auto of [true, false]) {
  for (const [k, a] of [['attr', 0], ['attr', 1], ['attr', 2], ['ei', 0], ['ei', 1], ['ei', 2], ['class', 0], ['class', 3], ['class', 7]]) {
    S(`cyclic-rename:${k}${a}:${auto}`, `${DIR}/cyclic-30.aml`, auto, [small(), { op: 'renameKind', k, a, name: 'Renamed' }, small(), { op: 'renameKind', k, a, name: 'X' }, small()]);
  }
}
for (const start of ['test/reads/cyclic-30.aml', 'test/reads/cyclic-215.aml', 'test/reads/cyclic-shapes-30.aml']) {
  S(`cyclic-ops:${start.replace(/^.*\//, '')}`, start, true, [
    small(),
    { op: 'renameKind', k: 'class', a: 5, name: 'Renamed' },
    small(),
    { op: 'setBase', kind: 'suc', a: 1, b: 2 },
    small(),
    { op: 'removeKind', k: 'class', a: 4, rel: true },
    small(),
  ]);
}
// Alias changes with auto update (AliasReference.Update) and without.
for (const auto of [true, false]) {
  for (const v of ['Ext2', '', null, 'Dup', 'Missing']) {
    S(`alias:${v}:${auto}`, `${DIR}/aliases-30.aml`, auto, [small(), { op: 'extRefSet', a: 0, value: v }, small(), { op: 'extRefSet', a: 1, value: 'Ext' }, small(), { op: 'removeKind', k: 'ext', a: 0, rel: false }, small()]);
  }
}
// Renames of referenced elements of every kind with auto update (reference rewriting, events).
for (const start of [`${DIR}/names-30.aml`, `${DIR}/names-215.aml`, `${DIR}/ids-30.aml`, `${DIR}/ids-215.aml`, `${DIR}/deep-30.aml`]) {
  for (const auto of [true, false]) {
    const ops = [small()];
    for (const k of ['class', 'lib', 'attr', 'ei', 'ie']) {
      for (const a of [0, 1, 2, 3, 5]) ops.push({ op: 'renameKind', k, a, name: 'R' + k + a });
      ops.push(small());
    }
    for (const a of [0, 1, 2, 3]) ops.push({ op: 'setID', a, mode: 'value', b: 0, value: 'nid' + a });
    ops.push(small());
    for (const k of ['ie', 'ei', 'class', 'attr']) ops.push({ op: 'removeKind', k, a: 1, rel: auto });
    ops.push(small());
    S(`renames:${start.replace(/^.*\//, '')}:${auto}`, start, auto, ops);
  }
}
// Class hierarchies that become cyclic after the tables are built (in a document that is cyclic
// from the start, building the name references of overridden elements does not return): the
// deep class reference queries recurse on the cycle, renames run NameReferenceTable.ChangeName.
// Indices (document order): the attributes Power of Machine and Press, the interface Plug of
// Machine, the class Machine, Machine among the objects with attributes.
for (const auto of [true, false]) {
  for (const [file, machinePower, pressPower, machinePlug, machineClass, machineObj] of [
    ['names-30.aml', 6, 7, 7, 15, 35],
    ['names-215.aml', 3, 4, 4, 8, 20],
  ]) {
    S(`cycle-after-build:${file}:${auto}`, `${DIR}/${file}`, auto, [
      { op: 'sweep', m: 4, n: 20, off: 0 },
      // Machine derives from its own child Press, which derives from Machine
      { op: 'setRef', k: 'suc', a: 0, side: 'A', vk: 'path', b: 1, value: null },
      { op: 'renameKind', k: 'attr', a: machinePower, name: 'Renamed' },
      { op: 'renameKind', k: 'attr', a: pressPower, name: 'Power2' },
      { op: 'renameKind', k: 'ei', a: machinePlug, name: 'Plug2' },
      { op: 'renameKind', k: 'class', a: machineClass, name: 'Machine2' },
      { op: 'sweep', m: 4, n: 20, off: 1 },
      { op: 'newAttr', a: machineObj, name: 'Speed' },
    ]);
  }
}
// Name references of mappings: unresolved by a new name, resolved again by renaming the element
// they name; references removed with the elements. Indices: the AttributeNameMapping of M1, the
// attribute Power of M1, the InterfaceNameMapping of M1, the interface In of its role requirement.
for (const auto of [true, false]) {
  for (const [file, power, mapIf, inIf] of [
    ['names-30.aml', 0, 1, 2],
    ['names-215.aml', 0, 1, 3],
  ]) {
    S(`nameref:${file}:${auto}`, `${DIR}/${file}`, auto, [
      small(),
      { op: 'setNameRef', a: 0, which: 'su', value: 'Foo' },
      { op: 'renameKind', k: 'attr', a: power, name: 'Foo' },
      small(),
      { op: 'setNameRef', a: mapIf, which: 'role', value: 'Nope' },
      { op: 'renameKind', k: 'ei', a: inIf, name: 'Nope' },
      { op: 'removeKind', k: 'attr', a: power, rel: auto },
      { op: 'removeKind', k: 'map', a: 0, rel: false },
      small(),
    ]);
  }
}
// IDs at the edges: elements with an empty ID removed, IDs emptied and set again.
for (const auto of [true, false]) {
  S(`ids-edge:${auto}`, `${DIR}/ids-30.aml`, auto, [
    small(),
    { op: 'removeKind', k: 'ei', a: 2, rel: auto },
    { op: 'setID', a: 1, mode: 'value', b: 0, value: '' },
    { op: 'setID', a: 1, mode: 'value', b: 0, value: 'ie-master' },
    { op: 'setID', a: 8, mode: 'value', b: 0, value: null },
    { op: 'setID', a: 8, mode: 'value', b: 0, value: ' ' },
    { op: 'removeKind', k: 'ie', a: 9, rel: auto },
    small(),
  ]);
}
// Queries on an unregistered (disposed) instance: it builds tables again and registers itself.
for (const start of ['corpus:4_IH.aml', 'corpus:5_SUC.aml', `${DIR}/names-30.aml`]) {
  S(`registry:${start.replace(/^.*[/:]/, '')}`, start, true, [
    small(),
    { op: 'unregister' },
    small(),
    { op: 'newIE', a: 0, name: 'A' },
    { op: 'register' },
    small(),
    { op: 'renameKind', k: 'ie', a: 0, name: 'B' },
    small(),
  ]);
}
// Registry operations and arguments at the edges, on new documents.
for (const start of ['new30', 'new215']) {
  S(`edges:${start}`, start, true, [
    sweepFull(),
    { op: 'newIH', name: 'IH' },
    { op: 'newIE', a: 0, name: 'A' },
    { op: 'newIE', a: 0, name: 'A' },
    { op: 'newEI', a: 1, b: 0, name: 'E', withClass: false },
    { op: 'setID', a: 1, mode: 'value', b: 0, value: '' },
    { op: 'setID', a: 2, mode: 'value', b: 0, value: null },
    sweepFull(),
    { op: 'unregister' },
    sweepSmall(),
    { op: 'unregister' },
    { op: 'register' },
    { op: 'unload' },
    { op: 'removeDocument' },
    sweepSmall(),
  ]);
}

writeFileSync(join(outDir, 'scripts.json'), JSON.stringify(scripts, null, 0).replace(/\},\{"name"/g, '},\n{"name"'));
console.log(`${Object.keys(DOCS).length} documents, ${scripts.length} scripts -> ${outDir}`);
