// Generates the cases of the ValidatorService check (oracle/ServicesValidatorOracle.cs and
// test/services/validator.oracle.test.ts): broken CAEX documents for every ValidationTypeEnum and
// RepairTypeEnum value, files referenced by them, seeded random documents and cases.json.
//   node scripts/gen-services-validator.mjs [outDir] [seed]
//
// Tokens in attribute values, replaced by both runners after loading a generated document:
//   %CASES%     the absolute path of the cases directory
//   %CASESURL%  its file URL (file:///...)
//   %%XXXX      the UTF-16 code unit U+XXXX (names with characters that XML cannot carry)
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [outDir = 'test/services/validator', seedArg = '3682'] = process.argv.slice(2);
let seed = Number(seedArg);
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const chance = (p) => rnd() < p;

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, 'lib'), { recursive: true });
mkdirSync(join(outDir, 'data'), { recursive: true });

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const attrs = (o) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => ` ${k}="${esc(String(v))}"`)
    .join('');
const el = (name, a, ...children) => {
  const kids = children.flat().filter((c) => c !== null && c !== undefined && c !== '');
  if (kids.length === 0) return `<${name}${attrs(a)} />`;
  return `<${name}${attrs(a)}>\n${kids.map((k) => indent(k)).join('\n')}\n</${name}>`;
};
const text = (name, value) => `<${name}>${esc(value)}</${name}>`;
const indent = (s) => s.split('\n').map((l) => '  ' + l).join('\n');
const g = (n) => {
  const h = n.toString(16).padStart(12, '0');
  return `00000000-0000-4000-8000-${h}`;
};

function doc30(file, { version = 'AutomationML 2.10', additional = true, source = true, schemaVersion = '3.0' } = {}, ...children) {
  const head = [];
  if (additional) head.push(el('AdditionalInformation', { AutomationMLVersion: '2.0' }));
  if (version !== null) head.push(text('SuperiorStandardVersion', version));
  if (source)
    head.push(
      el('SourceDocumentInformation', {
        OriginName: 'gen-services-validator',
        OriginID: 'GEN',
        OriginVersion: '1.0',
        LastWritingDateTime: '2024-01-01T00:00:00',
        OriginRelease: '1.0',
      }),
    );
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    `<CAEXFile xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.dke.de/CAEX"${schemaVersion === null ? '' : ` SchemaVersion="${schemaVersion}"`} FileName="${file}" xsi:schemaLocation="http://www.dke.de/CAEX CAEX_ClassModel_V.3.0.xsd">\n` +
    [...head, ...children.flat()].map(indent).join('\n') +
    '\n</CAEXFile>\n'
  );
}

function doc215(file, { amlVersion = '2.0', writer = true, schemaVersion = '2.15' } = {}, ...children) {
  const head = [];
  if (amlVersion !== null) head.push(el('AdditionalInformation', { AutomationMLVersion: amlVersion }));
  if (writer)
    head.push(
      el(
        'AdditionalInformation',
        {},
        el(
          'WriterHeader',
          {},
          text('WriterName', 'gen'),
          text('WriterID', 'GEN'),
          text('WriterVendor', 'gen'),
          text('WriterVendorURL', 'none'),
          text('WriterVersion', '1.0'),
          text('WriterRelease', '1.0'),
          text('LastWritingDateTime', '2024-01-01T00:00:00'),
        ),
      ),
    );
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    `<CAEXFile FileName="${file}"${schemaVersion === null ? '' : ` SchemaVersion="${schemaVersion}"`} xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="CAEX_ClassModel_V2.15.xsd">\n` +
    [...head, ...children.flat()].map(indent).join('\n') +
    '\n</CAEXFile>\n'
  );
}

// ---------------------------------------------------------------- shared libraries
const ICL = 'AutomationMLInterfaceClassLib';
const BASEIF = `${ICL}/AutomationMLBaseInterface`;
const EDC = `${BASEIF}/ExternalDataConnector`;
const COLLADA = `${EDC}/COLLADAInterface`;
const PORTCON = `${BASEIF}/PortConnector`;
const RCL = 'AutomationMLBaseRoleClassLib';
const BASEROLE = `${RCL}/AutomationMLBaseRole`;
const ATL = 'AutomationMLBaseAttributeTypeLib';

const baseLibs30 = () => [
  el(
    'InterfaceClassLib',
    { Name: ICL },
    el(
      'InterfaceClass',
      { Name: 'AutomationMLBaseInterface' },
      el(
        'InterfaceClass',
        { Name: 'ExternalDataConnector', RefBaseClassPath: BASEIF },
        el('Attribute', { Name: 'refURI', AttributeDataType: 'xs:anyURI', RefAttributeType: `${ATL}/refURI` }),
        el('InterfaceClass', { Name: 'COLLADAInterface', RefBaseClassPath: EDC }),
      ),
      el('InterfaceClass', { Name: 'PortConnector', RefBaseClassPath: BASEIF }),
    ),
  ),
  el(
    'RoleClassLib',
    { Name: RCL },
    el(
      'RoleClass',
      { Name: 'AutomationMLBaseRole' },
      el('RoleClass', { Name: 'Resource', RefBaseClassPath: BASEROLE }),
      el('RoleClass', { Name: 'Port', RefBaseClassPath: BASEROLE }, el('ExternalInterface', { Name: 'ConnectionPoint', ID: g(0xf001), RefBaseClassPath: PORTCON })),
    ),
  ),
  el(
    'AttributeTypeLib',
    { Name: ATL },
    el('AttributeType', { Name: 'Cardinality' }, el('Attribute', { Name: 'MinOccur', AttributeDataType: 'xs:unsignedInt' }), el('Attribute', { Name: 'MaxOccur', AttributeDataType: 'xs:unsignedInt' })),
    el('AttributeType', { Name: 'Direction', AttributeDataType: 'xs:string' }),
    el('AttributeType', { Name: 'Category', AttributeDataType: 'xs:string' }),
    el('AttributeType', { Name: 'refURI', AttributeDataType: 'xs:anyURI' }),
  ),
];

const baseLibs215 = () => [
  el('InterfaceClassLib', { Name: ICL }, el('InterfaceClass', { Name: 'AutomationMLBaseInterface' }, el('InterfaceClass', { Name: 'ExternalDataConnector', RefBaseClassPath: BASEIF }, el('Attribute', { Name: 'refURI', AttributeDataType: 'xs:anyURI' })), el('InterfaceClass', { Name: 'PortConnector', RefBaseClassPath: BASEIF }))),
  el('RoleClassLib', { Name: RCL }, el('RoleClass', { Name: 'AutomationMLBaseRole' }, el('RoleClass', { Name: 'Resource', RefBaseClassPath: BASEROLE }), el('RoleClass', { Name: 'Port', RefBaseClassPath: BASEROLE }, el('ExternalInterface', { Name: 'ConnectionPoint', ID: `{${g(0xf001)}}`, RefBaseClassPath: PORTCON })))),
];

const resource30 = () => el('RoleRequirements', { RefBaseRoleClassPath: `${BASEROLE}/Resource` });
const ie = (a, ...c) => el('InternalElement', a, ...c);
const ei = (a, ...c) => el('ExternalInterface', a, ...c);
const il = (a) => el('InternalLink', a);
const attr = (a, ...c) => el('Attribute', a, ...c);

const docs = [];
function add(file, content, extra = {}) {
  writeFileSync(join(outDir, file), content);
  docs.push({ file, subst: true, ...extra });
}

// ---------------------------------------------------------------- referenced files
const smallLib = (name) => doc30(name, {}, el('SystemUnitClassLib', { Name: 'ExtLib' }, el('SystemUnitClass', { Name: 'ExtClass' })));
writeFileSync(join(outDir, 'lib', 'Existing Lib.aml'), smallLib('Existing Lib.aml'));
writeFileSync(join(outDir, 'lib', 'Bibliothek_ä.aml'), smallLib('Bibliothek_ä.aml'));
writeFileSync(join(outDir, 'lib', 'plain.aml'), smallLib('plain.aml'));
writeFileSync(join(outDir, 'model.dae'), '<COLLADA/>\n');
writeFileSync(join(outDir, 'data', 'geo file.dae'), '<COLLADA/>\n');
writeFileSync(join(outDir, 'data', 'part.dae'), '<COLLADA/>\n');

// ---------------------------------------------------------------- IDs
add(
  'v-ids30.aml',
  doc30(
    'v-ids30.aml',
    {},
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'Dup1', ID: '11111111-1111-1111-1111-111111111111' }, resource30(), ei({ Name: 'IfDup', ID: '22222222-2222-2222-2222-222222222222', RefBaseClassPath: PORTCON })),
      ie({ Name: 'Dup2', ID: '11111111-1111-1111-1111-111111111111' }, resource30(), ei({ Name: 'IfDup', ID: '22222222-2222-2222-2222-222222222222', RefBaseClassPath: PORTCON })),
      ie({ Name: 'NoIdAttr' }),
      ie({ Name: 'EmptyId', ID: '' }, ei({ Name: 'IfEmpty', ID: '', RefBaseClassPath: PORTCON })),
      ie({ Name: 'WsId', ID: '   ' }),
      ie({ Name: 'Braced', ID: '{33333333-3333-3333-3333-333333333333}' }, resource30()),
      ie({ Name: 'Paren', ID: '(44444444-4444-4444-4444-444444444444)' }, resource30()),
      ie({ Name: 'NForm', ID: '55555555555555555555555555555555' }, resource30()),
      ie({ Name: 'XForm', ID: '{0x66666666,0x6666,0x6666,{0x66,0x66,0x66,0x66,0x66,0x66,0x66,0x66}}' }, resource30()),
      ie({ Name: 'Upper', ID: 'ABCDEFAB-CDEF-ABCD-EFAB-CDEFABCDEFAB' }, resource30()),
      ie({ Name: 'BadAml', ID: 'not-a-guid' }, resource30()),
      ie({ Name: 'BadAmlEI', ID: g(1) }, ei({ Name: 'BadIf', ID: 'if-not-a-guid', RefBaseClassPath: PORTCON })),
      ie({ Name: 'BadPlain', ID: 'plain-id' }),
      ie({ Name: 'Slash', ID: 'a/b' }),
      ie({ Name: 'Dot', ID: 'a.b' }),
      ie({ Name: 'LibName', ID: 'MySUCLib' }),
      ie({ Name: 'BadSlashAml', ID: 'x/y' }, resource30()),
      ie({ Name: 'DupPlain1', ID: 'plain-dup' }),
      ie({ Name: 'DupPlain2', ID: 'plain-dup' }),
      ie({ Name: 'Triple1', ID: g(2) }),
      ie({ Name: 'Triple2', ID: g(2) }, ie({ Name: 'Triple3', ID: g(2) })),
      ie({ Name: 'CaseA', ID: 'ABCDEF01-0000-4000-8000-000000000001' }),
      ie({ Name: 'CaseB', ID: 'abcdef01-0000-4000-8000-000000000001' }),
    ),
    ...baseLibs30(),
    el(
      'SystemUnitClassLib',
      { Name: 'MySUCLib' },
      el(
        'SystemUnitClass',
        { Name: 'Suc1' },
        ie({ Name: 'InnerNoId', ID: '' }),
        ie({ Name: 'InnerWs', ID: ' ' }),
        ei({ Name: 'InnerEI', ID: '', RefBaseClassPath: PORTCON }),
        ie({ Name: 'InnerDeep', ID: g(3) }, ei({ Name: 'DeepEI', ID: '', RefBaseClassPath: PORTCON })),
      ),
      el('SystemUnitClass', { Name: 'SucId', ID: '' }),
      el('SystemUnitClass', { Name: 'SucId2', ID: g(4) }, el('SystemUnitClass', { Name: 'Nested', ID: g(4) })),
    ),
    el('RoleClassLib', { Name: 'MyRoles' }, el('RoleClass', { Name: 'R1' }, ei({ Name: 'RoleEI', ID: '', RefBaseClassPath: PORTCON }))),
    el('InterfaceClassLib', { Name: 'MyIfs' }, el('InterfaceClass', { Name: 'I1', RefBaseClassPath: BASEIF }, ei({ Name: 'NestedEI', ID: '', RefBaseClassPath: PORTCON }))),
  ),
);

add(
  'v-ids215.aml',
  doc215(
    'v-ids215.aml',
    {},
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'Dup1', ID: '{11111111-1111-1111-1111-111111111111}' }, el('RoleRequirements', { RefBaseRoleClassPath: `${BASEROLE}/Resource` })),
      ie({ Name: 'Dup2', ID: '{11111111-1111-1111-1111-111111111111}' }),
      ie({ Name: 'Plain', ID: '22222222-2222-2222-2222-222222222222' }),
      ie({ Name: 'Empty', ID: '' }, ei({ Name: 'If', ID: '', RefBaseClassPath: PORTCON })),
      ie({ Name: 'Bad', ID: 'bad id' }, el('RoleRequirements', { RefBaseRoleClassPath: `${BASEROLE}/Resource` })),
      ie({ Name: 'Slash', ID: 'p/q' }),
      ie({ Name: 'LibName', ID: 'Plant' }),
    ),
    ...baseLibs215(),
    el('SystemUnitClassLib', { Name: 'Sucs' }, el('SystemUnitClass', { Name: 'S', ID: '' }, ie({ Name: 'Inner', ID: '' }), ei({ Name: 'InnerIf', ID: '', RefBaseClassPath: PORTCON }))),
  ),
);

// ---------------------------------------------------------------- ID references
const GA = g(0xa0), GA1 = g(0xa1), GA2 = g(0xa2), GB = g(0xb0), GB1 = g(0xb1), GC = g(0xc0), GD = g(0xd0), GD1 = g(0xd1);
const GS1 = g(0x51), GS1I = g(0x52), GS1IE = g(0x53), GS2 = g(0x54), GIC1 = g(0x61), GPORT = g(0x71), GPORT2 = g(0x72);
add(
  'v-idrefs30.aml',
  doc30(
    'v-idrefs30.aml',
    {},
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'A', ID: GA }, ei({ Name: 'a1', ID: GA1, RefBaseClassPath: PORTCON }), ei({ Name: 'a2', ID: GA2, RefBaseClassPath: PORTCON })),
      ie({ Name: 'B', ID: GB }, ei({ Name: 'b1', ID: GB1, RefBaseClassPath: PORTCON })),
      il({ Name: 'L_ok', RefPartnerSideA: GA1, RefPartnerSideB: GB1 }),
      il({ Name: 'L_unres', RefPartnerSideA: '99999999-9999-4999-8999-999999999999', RefPartnerSideB: GB1 }),
      il({ Name: 'L_unresB', RefPartnerSideA: GA2, RefPartnerSideB: 'unknown-id' }),
      il({ Name: 'L_empty', RefPartnerSideA: '', RefPartnerSideB: GB1 }),
      il({ Name: 'L_bothEmpty', RefPartnerSideA: '', RefPartnerSideB: '' }),
      il({ Name: 'L_toIE', RefPartnerSideA: GA, RefPartnerSideB: GB1 }),
      il({ Name: 'L_toClassEI', RefPartnerSideA: GS1, RefPartnerSideB: GA1 }),
      il({ Name: 'L_toIcEI', RefPartnerSideA: GIC1, RefPartnerSideB: GA2 }),
      il({ Name: 'L_noB', RefPartnerSideA: GA1 }),
      ie({ Name: 'MirrorOk', ID: g(0xe1), RefBaseSystemUnitPath: GA }),
      ie({ Name: 'MirrorBad', ID: g(0xe2), RefBaseSystemUnitPath: '88888888-8888-4888-8888-888888888888' }),
      ie({ Name: 'MirrorToEI', ID: g(0xe3), RefBaseSystemUnitPath: GA1 }),
      ie({ Name: 'MirrorEmpty', ID: g(0xe4), RefBaseSystemUnitPath: '' }),
      ie({ Name: 'MirrorToClass', ID: g(0xe5), RefBaseSystemUnitPath: GS1I }),
      ie(
        { Name: 'C', ID: GC },
        ei({ Name: 'cMirror', ID: g(0xc1), RefBaseClassPath: GA1 }),
        ei({ Name: 'cMirrorBad', ID: g(0xc2), RefBaseClassPath: '77777777-7777-4777-8777-777777777777' }),
        ei({ Name: 'cMirrorToIE', ID: g(0xc3), RefBaseClassPath: GB }),
        ei({ Name: 'cMirrorToClass', ID: g(0xc4), RefBaseClassPath: GS1 }),
      ),
      ie(
        { Name: 'D', ID: GD },
        ei({ Name: 'd1', ID: GD1, RefBaseClassPath: PORTCON }),
        el(
          'RoleRequirements',
          { RefBaseRoleClassPath: 'MyRoles/PortRole' },
          el(
            'MappingObject',
            {},
            el('AttributeNameMapping', { SystemUnitAttributeName: 'missingSU', RoleAttributeName: 'missingRole' }),
            el('AttributeNameMapping', { SystemUnitAttributeName: 'dAttr', RoleAttributeName: 'roleAttr' }),
            el('InterfaceIDMapping', { SystemUnitInterfaceID: GD1, RoleInterfaceID: GPORT }),
            el('InterfaceIDMapping', { SystemUnitInterfaceID: GD1, RoleInterfaceID: 'unknown-role-if' }),
            el('InterfaceIDMapping', { SystemUnitInterfaceID: GA1, RoleInterfaceID: GPORT }),
            el('InterfaceIDMapping', { SystemUnitInterfaceID: GD1, RoleInterfaceID: GPORT2 }),
            el('InterfaceIDMapping', { SystemUnitInterfaceID: '', RoleInterfaceID: GPORT }),
            el('InterfaceIDMapping', { SystemUnitInterfaceID: GD, RoleInterfaceID: GPORT }),
          ),
        ),
        attr({ Name: 'dAttr', AttributeDataType: 'xs:string' }),
      ),
    ),
    ...baseLibs30(),
    el(
      'SystemUnitClassLib',
      { Name: 'Sucs' },
      el(
        'SystemUnitClass',
        { Name: 'S1', ID: g(0x50) },
        ei({ Name: 's1e', ID: GS1, RefBaseClassPath: PORTCON }),
        ie({ Name: 'S1i', ID: GS1I }, ei({ Name: 's1ie', ID: GS1IE, RefBaseClassPath: PORTCON })),
        il({ Name: 'S1_in', RefPartnerSideA: GS1, RefPartnerSideB: GS1IE }),
        il({ Name: 'S1_out', RefPartnerSideA: GS1, RefPartnerSideB: GA1 }),
        el(
          'SupportedRoleClass',
          { RefRoleClassPath: 'MyRoles/PortRole' },
          el(
            'MappingObject',
            {},
            el('InterfaceIDMapping', { SystemUnitInterfaceID: GS1, RoleInterfaceID: GPORT }),
            el('InterfaceIDMapping', { SystemUnitInterfaceID: GS1, RoleInterfaceID: GS1 }),
            el('InterfaceIDMapping', { SystemUnitInterfaceID: GPORT, RoleInterfaceID: GPORT }),
            el('AttributeNameMapping', { SystemUnitAttributeName: 'nope', RoleAttributeName: 'nope2' }),
            el('AttributeNameMapping', { SystemUnitAttributeName: '', RoleAttributeName: '' }),
          ),
        ),
      ),
      el('SystemUnitClass', { Name: 'S2', ID: g(0x55) }, ei({ Name: 's2e', ID: GS2, RefBaseClassPath: PORTCON }), il({ Name: 'S2_toS1', RefPartnerSideA: GS2, RefPartnerSideB: GS1 })),
    ),
    el(
      'RoleClassLib',
      { Name: 'MyRoles' },
      el('RoleClass', { Name: 'PortRole', RefBaseClassPath: `${BASEROLE}/Port` }, ei({ Name: 'PortEI', ID: GPORT, RefBaseClassPath: PORTCON }), ei({ Name: 'PortEI2', ID: GPORT2, RefBaseClassPath: PORTCON }), attr({ Name: 'roleAttr' })),
    ),
    el('InterfaceClassLib', { Name: 'MyIfs' }, el('InterfaceClass', { Name: 'MyIC', RefBaseClassPath: BASEIF }, ei({ Name: 'icEI', ID: GIC1, RefBaseClassPath: PORTCON }))),
  ),
);

const b = (id) => `{${id}}`;
add(
  'v-idrefs215.aml',
  doc215(
    'v-idrefs215.aml',
    {},
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'A', ID: b(GA) }, ei({ Name: 'a1', ID: b(GA1), RefBaseClassPath: PORTCON })),
      ie({ Name: 'B', ID: b(GB) }, ei({ Name: 'b1', ID: b(GB1), RefBaseClassPath: PORTCON })),
      il({ Name: 'L_ok', RefPartnerSideA: `${b(GA)}:a1`, RefPartnerSideB: `${b(GB)}:b1` }),
      il({ Name: 'L_path', RefPartnerSideA: 'Plant/A:a1', RefPartnerSideB: 'Plant/B:b1' }),
      il({ Name: 'L_unres', RefPartnerSideA: '{99999999-9999-4999-8999-999999999999}:x', RefPartnerSideB: `${b(GB)}:b1` }),
      il({ Name: 'L_noIf', RefPartnerSideA: `${b(GA)}:none`, RefPartnerSideB: `${b(GB)}:b1` }),
      il({ Name: 'L_empty', RefPartnerSideA: '', RefPartnerSideB: `${b(GB)}:b1` }),
      il({ Name: 'L_toEI', RefPartnerSideA: `${b(GA1)}:a1`, RefPartnerSideB: `${b(GB)}:b1` }),
      il({ Name: 'L_toClass', RefPartnerSideA: `${b(GS1I)}:s1ie`, RefPartnerSideB: `${b(GB)}:b1` }),
      ie({ Name: 'Inst', ID: b(g(0xe1)), RefBaseSystemUnitPath: 'Sucs/S1' }),
      ie({ Name: 'InstBad', ID: b(g(0xe2)), RefBaseSystemUnitPath: 'Sucs/Missing' }),
    ),
    ...baseLibs215(),
    el(
      'SystemUnitClassLib',
      { Name: 'Sucs' },
      el(
        'SystemUnitClass',
        { Name: 'S1' },
        ei({ Name: 's1e', ID: b(GS1), RefBaseClassPath: PORTCON }),
        ie({ Name: 'S1i', ID: b(GS1I) }, ei({ Name: 's1ie', ID: b(GS1IE), RefBaseClassPath: PORTCON })),
        il({ Name: 'S1_in', RefPartnerSideA: 'S1:s1e', RefPartnerSideB: `${b(GS1I)}:s1ie` }),
        el(
          'SupportedRoleClass',
          { RefRoleClassPath: `${BASEROLE}/Port` },
          el(
            'MappingObject',
            {},
            el('AttributeNameMapping', { SystemUnitAttributeName: 'missingSU', RoleAttributeName: 'missingRole' }),
            el('InterfaceNameMapping', { SystemUnitInterfaceName: 's1e', RoleInterfaceName: 'ConnectionPoint' }),
            el('InterfaceNameMapping', { SystemUnitInterfaceName: 'nope', RoleInterfaceName: 'nope2' }),
            el('InterfaceNameMapping', { SystemUnitInterfaceName: '', RoleInterfaceName: '' }),
          ),
        ),
      ),
    ),
  ),
);

// ---------------------------------------------------------------- paths
add(
  'v-paths30.aml',
  doc30(
    'v-paths30.aml',
    {},
    el('ExternalReference', { Path: 'lib/Existing Lib.aml', Alias: 'ext' }),
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'OkInst', ID: g(0x101), RefBaseSystemUnitPath: 'Sucs/Dup' }, resource30()),
      ie({ Name: 'Unres', ID: g(0x102), RefBaseSystemUnitPath: 'Sucs/Missing' }),
      ie({ Name: 'Empty', ID: g(0x103), RefBaseSystemUnitPath: '' }),
      ie({ Name: 'ToRole', ID: g(0x104), RefBaseSystemUnitPath: 'Roles/R' }),
      ie({ Name: 'Aliased', ID: g(0x105), RefBaseSystemUnitPath: 'ext@ExtLib/ExtClass' }),
      ie({ Name: 'AliasedMissing', ID: g(0x106), RefBaseSystemUnitPath: 'nope@Sucs/Missing' }),
      ie({ Name: 'Useless', ID: g(0x107), RefBaseSystemUnitPath: 'nope@Sucs/Single' }),
      ie({ Name: 'UselessId', ID: g(0x108), RefBaseSystemUnitPath: `nope@${g(0x101)}` }),
      ie({ Name: 'RoleOk', ID: g(0x109) }, el('RoleRequirements', { RefBaseRoleClassPath: 'Roles/R' })),
      ie({ Name: 'RoleToIC', ID: g(0x10a) }, el('RoleRequirements', { RefBaseRoleClassPath: 'Ifs/I' })),
      ie({ Name: 'RoleUnres', ID: g(0x10b) }, el('RoleRequirements', { RefBaseRoleClassPath: 'Roles/Missing' })),
      ie({ Name: 'RoleEmpty', ID: g(0x10c) }, el('RoleRequirements', { RefBaseRoleClassPath: '' })),
      ie({ Name: 'Roles/Missing2', ID: g(0x10d) }, el('RoleRequirements', { RefBaseRoleClassPath: 'Roles/Missing2' })),
      ie({ Name: 'Self', ID: g(0x10e) }, el('RoleRequirements', { RefBaseRoleClassPath: 'Self' })),
      ie(
        { Name: 'Attrs', ID: g(0x10f) },
        attr({ Name: 'a1', RefAttributeType: 'Types/T' }),
        attr({ Name: 'a2', RefAttributeType: 'Sucs/Single' }),
        attr({ Name: 'a3', RefAttributeType: 'Types/Missing' }),
        attr({ Name: 'a4', RefAttributeType: '' }),
        attr({ Name: 'a5', RefAttributeType: `${ATL}/Direction` }),
      ),
      ie(
        { Name: 'Ifs', ID: g(0x110) },
        ei({ Name: 'e1', ID: g(0x111), RefBaseClassPath: 'Ifs/I' }),
        ei({ Name: 'e2', ID: g(0x112), RefBaseClassPath: 'Roles/R' }),
        ei({ Name: 'e3', ID: g(0x113), RefBaseClassPath: 'Ifs/Missing' }),
        ei({ Name: 'e4', ID: g(0x114), RefBaseClassPath: '' }),
        ei({ Name: 'e5', ID: g(0x115), RefBaseClassPath: 'ext@Lib/If' }),
      ),
    ),
    ...baseLibs30(),
    el(
      'SystemUnitClassLib',
      { Name: 'Sucs' },
      el('SystemUnitClass', { Name: 'Dup' }),
      el('SystemUnitClass', { Name: 'Dup' }),
      el('SystemUnitClass', { Name: 'Unreferenced' }),
      el('SystemUnitClass', { Name: 'Unreferenced' }),
      el('SystemUnitClass', { Name: 'Single', RefBaseClassPath: 'Sucs/Dup' }),
      el('SystemUnitClass', { Name: 'ToRole', RefBaseClassPath: 'Roles/R' }),
      el('SystemUnitClass', { Name: 'ToMissing', RefBaseClassPath: 'Sucs/Nothing' }),
      el('SystemUnitClass', { Name: 'EmptyBase', RefBaseClassPath: '' }),
      el('SystemUnitClass', { Name: '' }),
      el('SystemUnitClass', { Name: 'WithSupported' }, el('SupportedRoleClass', { RefRoleClassPath: 'Roles/R' }), el('SupportedRoleClass', { RefRoleClassPath: 'Sucs/Single' }), el('SupportedRoleClass', { RefRoleClassPath: 'Roles/Gone' }), el('SupportedRoleClass', { RefRoleClassPath: '' })),
      el('SystemUnitClass', { Name: 'Mixed' }, attr({ Name: 'Mixed' }), attr({ Name: 'x' }), attr({ Name: 'x' })),
    ),
    el('SystemUnitClassLib', { Name: 'Sucs' }),
    el(
      'RoleClassLib',
      { Name: 'Roles' },
      el('RoleClass', { Name: 'R', RefBaseClassPath: BASEROLE }),
      el('RoleClass', { Name: 'R' }),
      el('RoleClass', { Name: 'RToIc', RefBaseClassPath: 'Ifs/I' }),
      el('RoleClass', { Name: 'RMissing', RefBaseClassPath: 'Roles/Gone' }),
    ),
    el(
      'InterfaceClassLib',
      { Name: 'Ifs' },
      el('InterfaceClass', { Name: 'I', RefBaseClassPath: BASEIF }),
      el('InterfaceClass', { Name: 'IToRole', RefBaseClassPath: 'Roles/R' }),
      el('InterfaceClass', { Name: 'IMissing', RefBaseClassPath: 'Ifs/Gone' }),
      el('InterfaceClass', { Name: 'IDup' }),
      el('InterfaceClass', { Name: 'IDup' }),
    ),
    el(
      'AttributeTypeLib',
      { Name: 'Types' },
      el('AttributeType', { Name: 'T' }),
      el('AttributeType', { Name: 'TToSuc', RefAttributeType: 'Sucs/Single' }),
      el('AttributeType', { Name: 'TBase', RefBaseClassPath: 'Types/T' }),
      el('AttributeType', { Name: 'TBadBase', RefBaseClassPath: 'Roles/R' }),
      el('AttributeType', { Name: 'TMissing', RefBaseClassPath: 'Types/Gone' }),
      el('AttributeType', { Name: 'TDup' }),
      el('AttributeType', { Name: 'TDup' }),
    ),
  ),
);

add(
  'v-paths215.aml',
  doc215(
    'v-paths215.aml',
    {},
    el('ExternalReference', { Path: 'lib/plain.aml', Alias: 'ext' }),
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'OkInst', ID: b(g(0x201)), RefBaseSystemUnitPath: 'Sucs/S' }),
      ie({ Name: 'Unres', ID: b(g(0x202)), RefBaseSystemUnitPath: 'Sucs/Missing' }),
      ie({ Name: 'Empty', ID: b(g(0x203)), RefBaseSystemUnitPath: '' }),
      ie({ Name: 'Aliased', ID: b(g(0x204)), RefBaseSystemUnitPath: 'ext@ExtLib/ExtClass' }),
      ie({ Name: 'AliasedMissing', ID: b(g(0x205)), RefBaseSystemUnitPath: 'nope@Sucs/S' }),
      ie({ Name: 'Roles', ID: b(g(0x206)) }, el('RoleRequirements', { RefBaseRoleClassPath: 'Roles/R' }), el('RoleRequirements', { RefBaseRoleClassPath: 'Sucs/S' }), el('RoleRequirements', { RefBaseRoleClassPath: '' })),
      ie({ Name: 'Ifs', ID: b(g(0x207)) }, ei({ Name: 'e1', ID: b(g(0x208)), RefBaseClassPath: 'Ifs/I' }), ei({ Name: 'e2', ID: b(g(0x209)), RefBaseClassPath: 'Roles/R' }), ei({ Name: 'e3', ID: b(g(0x20a)), RefBaseClassPath: 'Ifs/Gone' })),
    ),
    ...baseLibs215(),
    el(
      'SystemUnitClassLib',
      { Name: 'Sucs' },
      el('SystemUnitClass', { Name: 'S' }, el('SupportedRoleClass', { RefRoleClassPath: 'Roles/R' }), el('SupportedRoleClass', { RefRoleClassPath: 'Ifs/I' })),
      el('SystemUnitClass', { Name: 'S' }),
      el('SystemUnitClass', { Name: 'Derived', RefBaseClassPath: 'Sucs/S' }),
      el('SystemUnitClass', { Name: 'BadBase', RefBaseClassPath: 'Roles/R' }),
    ),
    el('RoleClassLib', { Name: 'Roles' }, el('RoleClass', { Name: 'R', RefBaseClassPath: BASEROLE }), el('RoleClass', { Name: 'RBad', RefBaseClassPath: 'Ifs/I' })),
    el('InterfaceClassLib', { Name: 'Ifs' }, el('InterfaceClass', { Name: 'I', RefBaseClassPath: BASEIF }), el('InterfaceClass', { Name: 'IBad', RefBaseClassPath: 'Sucs/S' })),
  ),
);

// ---------------------------------------------------------------- names
add(
  'v-names30.aml',
  doc30(
    'v-names30.aml',
    {},
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'Same', ID: g(0x301) }),
      ie({ Name: 'Same', ID: g(0x302) }),
      ie({ Name: '', ID: g(0x303) }),
      ie({ Name: 'Ctrl%%0001x', ID: g(0x304) }),
      ie({ Name: 'Nul%%0000', ID: g(0x305) }),
      ie({ Name: 'Lone%%D800', ID: g(0x306) }),
      ie({ Name: '%%DC00Low', ID: g(0x307) }),
      ie({ Name: 'Pair%%D83D%%DE00ok', ID: g(0x308) }),
      ie({ Name: 'Rev%%DE00%%D83D', ID: g(0x309) }),
      ie({ Name: 'FFFE%%FFFE', ID: g(0x30a) }),
      ie({ Name: 'Tab%%0009ok', ID: g(0x30b) }),
      ie({ Name: 'Hi%%D800%%0041', ID: g(0x30c) }),
      ie(
        { Name: 'WithAttrs', ID: g(0x30d) },
        attr({ Name: 'a' }),
        attr({ Name: 'a' }),
        attr({ Name: '' }),
        attr({ Name: 'b' }, attr({ Name: 'c' }), attr({ Name: 'c' })),
        ei({ Name: 'i', ID: g(0x30e), RefBaseClassPath: PORTCON }),
        ei({ Name: 'i', ID: g(0x30f), RefBaseClassPath: PORTCON }),
        ei({ Name: '', ID: g(0x310), RefBaseClassPath: PORTCON }),
        ei({ Name: 'Bad%%0002', ID: g(0x311), RefBaseClassPath: PORTCON }),
      ),
      ie(
        { Name: 'Facets', ID: g(0x312) },
        el('InternalElement', { Name: 'F', ID: g(0x313) }, el('RoleRequirements', { RefBaseRoleClassPath: `${BASEROLE}/Facet` })),
        el('InternalElement', { Name: 'F', ID: g(0x314) }, el('RoleRequirements', { RefBaseRoleClassPath: `${BASEROLE}/Facet` })),
      ),
    ),
    el('InstanceHierarchy', { Name: 'Plant' }),
    ...baseLibs30(),
    el(
      'SystemUnitClassLib',
      { Name: 'Sucs' },
      el('SystemUnitClass', { Name: 'C', ID: g(0x320) }, attr({ Name: 'Inner' }), el('SystemUnitClass', { Name: 'Inner' }), el('SystemUnitClass', { Name: 'Inner2' }), attr({ Name: 'Inner2' })),
      el('SystemUnitClass', { Name: 'C' }),
      el('SystemUnitClass', { Name: 'Bad%%0003Class' }),
      el('SystemUnitClass', { Name: 'D' }, ie({ Name: 'x', ID: g(0x321) }), ie({ Name: 'x', ID: g(0x322) })),
    ),
    el('SystemUnitClassLib', { Name: 'Plant' }),
    el('RoleClassLib', { Name: 'Sucs' }),
    el('AttributeTypeLib', { Name: 'Types' }, el('AttributeType', { Name: 'T' }, attr({ Name: 'T' }), attr({ Name: 'n' }), attr({ Name: 'n' })), el('AttributeType', { Name: 'T' })),
  ),
);

add(
  'v-names215.aml',
  doc215(
    'v-names215.aml',
    {},
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'Same', ID: b(g(0x401)) }, ei({ Name: 'i', ID: b(g(0x403)), RefBaseClassPath: PORTCON }), ei({ Name: 'i', ID: b(g(0x404)), RefBaseClassPath: PORTCON })),
      ie({ Name: 'Same', ID: b(g(0x402)) }),
      ie({ Name: '', ID: b(g(0x405)) }),
      ie({ Name: 'Ctrl%%001Fx', ID: b(g(0x406)) }),
      il({ Name: 'Link', RefPartnerSideA: '', RefPartnerSideB: '' }),
      il({ Name: 'Link', RefPartnerSideA: '', RefPartnerSideB: '' }),
    ),
    ...baseLibs215(),
    el('SystemUnitClassLib', { Name: 'Sucs' }, el('SystemUnitClass', { Name: 'C' }, attr({ Name: 'C' })), el('SystemUnitClass', { Name: 'C' })),
    el('SystemUnitClassLib', { Name: 'Sucs' }),
  ),
);

// ---------------------------------------------------------------- meta data
add('v-meta-none30.aml', doc30('v-meta-none30.aml', { version: null, additional: false, source: false, schemaVersion: null }, el('InstanceHierarchy', { Name: 'Plant' })));
add('v-meta-empty30.aml', doc30('v-meta-empty30.aml', { version: '', additional: false, source: false, schemaVersion: '' }, el('InstanceHierarchy', { Name: 'Plant' })));
add('v-meta-wrong30.aml', doc30('v-meta-wrong30.aml', { version: 'AutomationML 2.1', additional: true, source: true, schemaVersion: '2.15' }, el('InstanceHierarchy', { Name: 'Plant' })));
add('v-meta-other30.aml', doc30('v-meta-other30.aml', { version: 'AutomationML 2.0', additional: false, source: true, schemaVersion: '3.1' }, el('ExternalReference', { Path: 'AutomationML_Base_Libraries_AMLEd2_2.11.0.aml', Alias: 'base' })));
add('v-meta-none215.aml', doc215('v-meta-none215.aml', { amlVersion: null, writer: false, schemaVersion: null }, el('InstanceHierarchy', { Name: 'Plant' })));
add('v-meta-wrong215.aml', doc215('v-meta-wrong215.aml', { amlVersion: '', writer: false, schemaVersion: '3.0' }, el('InstanceHierarchy', { Name: 'Plant' })));
add('v-meta-ed215.aml', doc215('v-meta-ed215.aml', { amlVersion: '2.1', writer: true, schemaVersion: '2.15' }, el('ExternalReference', { Path: 'Lib_AMLEd1_x.aml', Alias: 'ed1' }), el('ExternalReference', { Path: 'AutomationML_Base_Libraries_AMLEd2_2.11.0.aml', Alias: 'ed2' })));

// ---------------------------------------------------------------- external references
const extRefs = [
  ['lib/Existing Lib.aml', 'ex1'],
  ['lib/Existing%20Lib.aml', 'ex1esc'],
  ['lib/missing.aml', 'miss'],
  ['', 'emptyPath'],
  ['lib/plain.aml', ''],
  ['lib/Existing Lib.aml', 'dup'],
  ['lib/missing2.aml', 'dup'],
  ['lib/Bibliothek_ä.aml', 'uml'],
  ['lib/Bibliothek_%C3%A4.aml', 'umlesc'],
  ['AutomationML_Base_Libraries_AMLEd1_2.1.0.aml', 'ed1'],
  ['Producer_Domain_Lib_AMLEd2_1.0.0.aml', 'ed2'],
  ['Producer_Domain_Lib_Ext_AMLEd3_1.0.0.aml', 'ed3'],
  ['x/AMLEd2-lib.aml', 'edsub'],
  ['http://127.0.0.1:1/lib.aml', 'http'],
  ['https://example.invalid/AutomationML_Base_Libraries_AMLEd2_2.11.0.aml', 'https'],
  ['lib\\Existing Lib.aml', 'backslash'],
  ['/lib/Existing Lib.aml', 'rooted'],
  ['lib/Existing Lib.aml#frag', 'frag'],
  ['%CASES%\\lib\\plain.aml', 'abs'],
  ['%CASES%/lib/missing.aml', 'absmiss'],
  ['%CASESURL%/lib/Existing%20Lib.aml', 'url'],
  ['%CASESURL%/lib/missing.aml', 'urlmiss'],
  ['file:///C:/no/such/dir/x.aml', 'urlC'],
  ['../validator/lib/plain.aml', 'up'],
  ['urn:example:lib', 'urn'],
  ['   ', 'blank'],
  ['%zz.aml', 'badescape'],
];
add(
  'v-extrefs30.aml',
  doc30(
    'v-extrefs30.aml',
    {},
    ...extRefs.map(([p, a]) => el('ExternalReference', { Path: p, Alias: a })),
    el('ExternalReference', { Path: 'Old_Domain_Lib_AMLEd1_1.0.0.aml', Alias: 'ver' }, text('Version', 'OldVersion')),
    el('ExternalReference', { Path: 'Old_Domain_Lib_AMLEd1_1.0.0.aml', Alias: 'verdesc' }, text('Description', 'VersionRef')),
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'UsesEx', ID: g(0x501), RefBaseSystemUnitPath: 'ex1@ExtLib/ExtClass' }),
      ie({ Name: 'UsesDup', ID: g(0x502), RefBaseSystemUnitPath: 'dup@ExtLib/ExtClass' }),
      ie({ Name: 'UsesMissingAlias', ID: g(0x503), RefBaseSystemUnitPath: 'gone@ExtLib/ExtClass' }),
    ),
  ),
  {
    parts: [
      ['library', '/lib/Existing Lib.aml', 'lib/Existing Lib.aml'],
      ['library', '/lib/Existing%20Lib.aml', 'lib/Existing Lib.aml'],
      ['library', '/lib/Bibliothek_ä.aml', 'lib/Bibliothek_ä.aml'],
      ['library', '/lib/Bibliothek_%C3%A4.aml', 'lib/Bibliothek_ä.aml'],
      ['library', '/lib/plain.aml', 'lib/plain.aml'],
      ['library', '/lib/plain.aml', 'lib/plain.aml'],
      ['any', '/AutomationML_Base_Libraries_AMLEd1_2.1.0.aml', 'lib/plain.aml'],
    ],
  },
);
add('v-extrefs-short.aml', doc30('v-extrefs-short.aml', {}, el('ExternalReference', { Path: 'lib/plain.aml', Alias: 'ok' }), el('ExternalReference', { Path: 'Lib_AMLEd', Alias: 'short' })));
add('v-extrefs-ftp.aml', doc30('v-extrefs-ftp.aml', {}, el('ExternalReference', { Path: 'ftp://127.0.0.1:9/lib.aml', Alias: 'ftp' })), { ftp: true });
add('v-extrefs215.aml', doc215('v-extrefs215.aml', {}, el('ExternalReference', { Path: 'lib/plain.aml', Alias: 'ok' }), el('ExternalReference', { Path: 'lib/missing.aml', Alias: 'miss' }), el('ExternalReference', { Path: 'Lib_AMLEd2_x.aml', Alias: 'ed' }), el('ExternalReference', { Path: 'lib/plain.aml', Alias: 'ok' })));

// ---------------------------------------------------------------- external data connectors
const refUris = [
  ['file:///model.dae', COLLADA],
  ['file:///data/geo%20file.dae', COLLADA],
  ['file:///data/part.dae', EDC],
  ['model.dae', COLLADA],
  ['missing.dae', COLLADA],
  ['missing.dae', COLLADA],
  ['file:///C:/definitely/missing.dae', COLLADA],
  ['%CASESURL%/model.dae', COLLADA],
  ['%CASESURL%/missing.dae', COLLADA],
  ['model.dae#node', COLLADA],
  ['missing.dae#node', COLLADA],
  ['http://127.0.0.1:1/x.dae', COLLADA],
  ['', COLLADA],
  ['data/geo file.dae', COLLADA],
  ['data/geo%20file.dae', COLLADA],
  ['/model.dae', COLLADA],
  ['/missing.dae', COLLADA],
  ['file:model.dae', COLLADA],
  ['file:///model.dae', PORTCON],
  ['%CASES%\\model.dae', COLLADA],
  ['urn:x', COLLADA],
];
add(
  'v-extdata30.aml',
  doc30(
    'v-extdata30.aml',
    {},
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie(
        { Name: 'Geo', ID: g(0x601) },
        ...refUris.map(([u, cls], i) => ei({ Name: `d${i}`, ID: g(0x610 + i), RefBaseClassPath: cls }, attr({ Name: 'refURI', AttributeDataType: 'xs:anyURI', RefAttributeType: `${ATL}/refURI` }, text('Value', u)))),
        ei({ Name: 'noValue', ID: g(0x6f0), RefBaseClassPath: COLLADA }, attr({ Name: 'refURI', AttributeDataType: 'xs:anyURI' })),
        ei({ Name: 'noAttr', ID: g(0x6f1), RefBaseClassPath: COLLADA }),
      ),
    ),
    ...baseLibs30(),
  ),
  {
    parts: [
      ['any', '/model.dae', 'model.dae'],
      ['any', '/data/geo%20file.dae', 'data/geo file.dae'],
      ['any', '/data/geo file.dae', 'data/geo file.dae'],
      ['any', '/MODEL.dae', 'model.dae'],
    ],
  },
);
add(
  'v-extdata215.aml',
  doc215(
    'v-extdata215.aml',
    {},
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie(
        { Name: 'Geo', ID: b(g(0x701)) },
        ei({ Name: 'd0', ID: b(g(0x702)), RefBaseClassPath: EDC }, attr({ Name: 'refURI', AttributeDataType: 'xs:anyURI' }, text('Value', 'file:///model.dae'))),
        ei({ Name: 'd1', ID: b(g(0x703)), RefBaseClassPath: EDC }, attr({ Name: 'refURI', AttributeDataType: 'xs:anyURI' }, text('Value', 'missing.dae'))),
      ),
    ),
    ...baseLibs215(),
  ),
);

// ---------------------------------------------------------------- cardinality, direction, category
const card = (min, max) => attr({ Name: 'Cardinality', RefAttributeType: `${ATL}/Cardinality` }, min === null ? null : attr({ Name: 'MinOccur', AttributeDataType: 'xs:unsignedInt' }, text('Value', min)), max === null ? null : attr({ Name: 'MaxOccur', AttributeDataType: 'xs:unsignedInt' }, text('Value', max)));
const dir = (v) => attr({ Name: 'Direction', AttributeDataType: 'xs:string', RefAttributeType: `${ATL}/Direction` }, v === null ? null : text('Value', v));
const cat = (v) => attr({ Name: 'Category', AttributeDataType: 'xs:string', RefAttributeType: `${ATL}/Category` }, v === null ? null : text('Value', v));
add(
  'v-links30.aml',
  doc30(
    'v-links30.aml',
    {},
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'P1', ID: g(0x801) }, ei({ Name: 'out1', ID: g(0x811), RefBaseClassPath: PORTCON }, dir('Out'), card('1', '1'), cat('Water'))),
      ie({ Name: 'P2', ID: g(0x802) }, ei({ Name: 'in1', ID: g(0x812), RefBaseClassPath: PORTCON }, dir('In'), cat('Water'), cat('Oil'))),
      ie({ Name: 'P3', ID: g(0x803) }, ei({ Name: 'in2', ID: g(0x813), RefBaseClassPath: PORTCON }, dir('Out'), cat('Oil'))),
      ie({ Name: 'P4', ID: g(0x804) }, ei({ Name: 'unlinked', ID: g(0x814), RefBaseClassPath: PORTCON }, card('2', 'n'))),
      ie({ Name: 'P5', ID: g(0x805) }, ei({ Name: 'io', ID: g(0x815), RefBaseClassPath: PORTCON }, dir('InOut'), card(null, '0'), cat(null))),
      ie({ Name: 'P6', ID: g(0x806) }, ei({ Name: 'side', ID: g(0x816), RefBaseClassPath: PORTCON }, dir('Sideways'), card('x', 'abc'))),
      ie({ Name: 'P7', ID: g(0x807) }, ei({ Name: 'nodir', ID: g(0x817), RefBaseClassPath: PORTCON }, dir(null), card('1', null))),
      ie({ Name: 'P8', ID: g(0x808) }, ei({ Name: 'in3', ID: g(0x818), RefBaseClassPath: PORTCON }, dir('In'), card('0', '1'))),
      il({ Name: 'L1', RefPartnerSideA: g(0x811), RefPartnerSideB: g(0x812) }),
      il({ Name: 'L2', RefPartnerSideA: g(0x811), RefPartnerSideB: g(0x813) }),
      il({ Name: 'L3', RefPartnerSideA: g(0x815), RefPartnerSideB: g(0x816) }),
      il({ Name: 'L4', RefPartnerSideA: g(0x816), RefPartnerSideB: g(0x817) }),
      il({ Name: 'L5', RefPartnerSideA: g(0x818), RefPartnerSideB: g(0x813) }),
      il({ Name: 'L6', RefPartnerSideA: g(0x818), RefPartnerSideB: g(0x812) }),
      il({ Name: 'L7', RefPartnerSideA: g(0x812), RefPartnerSideB: g(0x812) }),
    ),
    ...baseLibs30(),
    el(
      'SystemUnitClassLib',
      { Name: 'Sucs' },
      el('SystemUnitClass', { Name: 'S', ID: g(0x820) }, ei({ Name: 'classIf', ID: g(0x821), RefBaseClassPath: PORTCON }, card('1', '1'), dir('In'), cat('Water'))),
    ),
  ),
);

// ---------------------------------------------------------------- aliases
add(
  'v-aliases30.aml',
  doc30(
    'v-aliases30.aml',
    {},
    el('ExternalReference', { Path: 'lib/Existing Lib.aml', Alias: 'known' }),
    el('ExternalReference', { Path: 'lib/plain.aml', Alias: 'known@' }),
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'Known', ID: g(0x901), RefBaseSystemUnitPath: 'known@ExtLib/ExtClass' }),
      ie({ Name: 'Unknown', ID: g(0x902), RefBaseSystemUnitPath: 'unknown@ExtLib/ExtClass' }),
      ie({ Name: 'Unknown2', ID: g(0x903), RefBaseSystemUnitPath: 'unknown@ExtLib/Other' }),
      ie({ Name: 'Useless', ID: g(0x904), RefBaseSystemUnitPath: 'gone@Local/L' }),
      ie({ Name: 'UselessId', ID: g(0x905), RefBaseSystemUnitPath: `gone@${g(0x901)}` }),
      ie({ Name: 'Twice', ID: g(0x906), RefBaseSystemUnitPath: 'a@b@Local/L' }),
      ie({ Name: 'Roles', ID: g(0x907) }, el('RoleRequirements', { RefBaseRoleClassPath: 'r@Lib/Role' }), el('RoleRequirements', { RefBaseRoleClassPath: 'r@Local2/R' })),
      ie({ Name: 'Ifs', ID: g(0x908) }, ei({ Name: 'e', ID: g(0x909), RefBaseClassPath: 'i@Lib/If' }), attr({ Name: 'a', RefAttributeType: 't@Lib/T' })),
    ),
    el('SystemUnitClassLib', { Name: 'Local' }, el('SystemUnitClass', { Name: 'L' }), el('SystemUnitClass', { Name: 'Derived', RefBaseClassPath: 'x@Local/L' })),
    el('RoleClassLib', { Name: 'Local2' }, el('RoleClass', { Name: 'R' })),
  ),
);
add(
  'v-aliases215.aml',
  doc215(
    'v-aliases215.aml',
    {},
    el('ExternalReference', { Path: 'lib/plain.aml', Alias: 'known' }),
    el(
      'InstanceHierarchy',
      { Name: 'Plant' },
      ie({ Name: 'Known', ID: b(g(0x911)), RefBaseSystemUnitPath: 'known@ExtLib/ExtClass' }),
      ie({ Name: 'Unknown', ID: b(g(0x912)), RefBaseSystemUnitPath: 'unknown@ExtLib/ExtClass' }),
      ie({ Name: 'Useless', ID: b(g(0x913)), RefBaseSystemUnitPath: 'gone@Local/L' }),
    ),
    el('SystemUnitClassLib', { Name: 'Local' }, el('SystemUnitClass', { Name: 'L' })),
  ),
);

// ---------------------------------------------------------------- empty CAEX paths
// Libraries and hierarchies without a name have an empty CAEX path.
add(
  'v-paths-empty30.aml',
  doc30(
    'v-paths-empty30.aml',
    {},
    el('InstanceHierarchy', { Name: '' }, ie({ Name: 'A', ID: g(0xb01) })),
    el('InstanceHierarchy', {}, ie({ Name: 'B', ID: g(0xb02) })),
    el('SystemUnitClassLib', { Name: '' }, el('SystemUnitClass', { Name: 'S' })),
    el('SystemUnitClassLib', { Name: '' }),
    el('RoleClassLib', {}, el('RoleClass', { Name: 'R' })),
    el('InterfaceClassLib', { Name: '' }),
    el('AttributeTypeLib', { Name: '' }, el('AttributeType', { Name: 'T' })),
  ),
);
add(
  'v-paths-empty215.aml',
  doc215(
    'v-paths-empty215.aml',
    {},
    el('InstanceHierarchy', { Name: '' }, ie({ Name: 'A', ID: b(g(0xb11)) })),
    el('SystemUnitClassLib', { Name: '' }, el('SystemUnitClass', { Name: 'S' })),
    el('SystemUnitClassLib', {}),
    el('RoleClassLib', { Name: '' }),
  ),
);

// ---------------------------------------------------------------- empty documents
add('v-empty30.aml', doc30('v-empty30.aml', {}));
add('v-empty215.aml', doc215('v-empty215.aml', {}));

// ---------------------------------------------------------------- seeded random documents
const ID_POOL = [g(0xa01), g(0xa02), g(0xa03), `{${g(0xa04)}}`, '', ' ', 'x/y', 'Lib0', 'bad-id', g(0xa01), g(0xa02)];
const NAME_POOL = ['A', 'B', 'C', 'A', '', 'x/y', 'Lib0', 'Same', 'Same', 'Ä', 'n%%0001'];
const REF_POOL = [g(0xa01), g(0xa02), g(0xa03), `{${g(0xa04)}}`, '', 'missing', 'Lib0/A', g(0xbad)];
const PATH_POOL = ['Lib0/A', 'Lib0/B', 'Lib0/Missing', '', 'r@Lib0/A', 'gone@Lib0/A', 'Roles0/R', 'Ifs0/I', 'Types0/T', g(0xa01), 'Lib0/A/A'];
function randomDoc(i) {
  const v215 = i % 3 === 2;
  const id = () => (v215 && chance(0.5) ? `{${pick(ID_POOL).replace(/[{}]/g, '')}}` : pick(ID_POOL));
  const name = () => pick(NAME_POOL);
  let n = 0;
  const randomIE = (depth) => {
    const kids = [];
    const nk = depth > 2 ? 0 : Math.floor(rnd() * 3);
    for (let k = 0; k < nk; k++) kids.push(randomIE(depth + 1));
    if (chance(0.5)) kids.push(ei({ Name: name(), ID: id(), RefBaseClassPath: chance(0.6) ? pick(PATH_POOL) : chance(0.5) ? pick(REF_POOL) : PORTCON }));
    if (chance(0.4)) kids.push(attr({ Name: name(), RefAttributeType: v215 ? undefined : pick(PATH_POOL) }));
    if (chance(0.3)) kids.push(el('RoleRequirements', { RefBaseRoleClassPath: pick(PATH_POOL) }));
    if (chance(0.3)) kids.push(il({ Name: name(), RefPartnerSideA: pick(REF_POOL) + (v215 ? ':' + name() : ''), RefPartnerSideB: pick(REF_POOL) }));
    n++;
    const a = { Name: name(), ID: id() };
    if (chance(0.3)) a.RefBaseSystemUnitPath = pick([...PATH_POOL, ...REF_POOL]);
    return ie(a, ...kids);
  };
  const ihs = [];
  for (let k = 0; k < 2; k++) {
    const ies = [];
    for (let m = 0; m < 4; m++) ies.push(randomIE(0));
    ihs.push(el('InstanceHierarchy', { Name: pick(['IH', 'IH', 'Lib0']) }, ...ies));
  }
  const libs = [
    el('SystemUnitClassLib', { Name: 'Lib0' }, ...[0, 1, 2].map(() => el('SystemUnitClass', { Name: name(), RefBaseClassPath: chance(0.3) ? pick(PATH_POOL) : undefined }, chance(0.5) ? randomIE(2) : null))),
    el('RoleClassLib', { Name: 'Roles0' }, el('RoleClass', { Name: 'R', RefBaseClassPath: chance(0.5) ? pick(PATH_POOL) : undefined }), el('RoleClass', { Name: name() })),
    el('InterfaceClassLib', { Name: 'Ifs0' }, el('InterfaceClass', { Name: 'I', RefBaseClassPath: chance(0.5) ? pick(PATH_POOL) : undefined }), el('InterfaceClass', { Name: name() })),
  ];
  if (!v215) libs.push(el('AttributeTypeLib', { Name: 'Types0' }, el('AttributeType', { Name: 'T', RefAttributeType: chance(0.5) ? pick(PATH_POOL) : undefined }), el('AttributeType', { Name: name() })));
  const refs = [];
  if (chance(0.7)) refs.push(el('ExternalReference', { Path: pick(['lib/plain.aml', 'lib/missing.aml', '', 'Lib_AMLEd1_1.aml']), Alias: pick(['r', 'r', '', 'gone']) }));
  if (chance(0.5)) refs.push(el('ExternalReference', { Path: pick(['lib/plain.aml', 'lib/missing.aml']), Alias: pick(['r', 's']) }));
  const file = `v-fuzz-${i}.aml`;
  const content = v215
    ? doc215(file, { amlVersion: pick(['2.0', '2.1', null]), writer: chance(0.5) }, ...refs, ...ihs, ...libs.filter((_, k) => k < 3))
    : doc30(file, { version: pick(['AutomationML 2.10', 'AutomationML 2.1', null]), source: chance(0.5) }, ...refs, ...ihs, ...libs);
  return [file, content];
}
for (let i = 0; i < 9; i++) {
  const [file, content] = randomDoc(i);
  add(file, content);
}

// ---------------------------------------------------------------- corpus documents
const corpusDir = join(outDir, '..', '..', 'corpus');
const corpusFiles = readdirSync(corpusDir)
  .filter((f) => f.endsWith('.aml'))
  .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
const corpus = corpusFiles.map((f) => {
  const content = readFileSync(join(corpusDir, f), 'utf8');
  const parts = [];
  for (const m of content.matchAll(/<ExternalReference [^>]*Path="([^"]*)"/g)) {
    if (corpusFiles.includes(m[1])) parts.push(['library', '/' + m[1], m[1]]);
  }
  return { file: '../../corpus/' + f, subst: false, corpus: true, parts };
});

// ---------------------------------------------------------------- sweeps
// File references for CanLocateFile, NormalizeFilePath and FilePathFromValue.
const fileRefs = [
  null, '', ' ', 'lib/plain.aml', 'lib/Existing Lib.aml', 'lib/Existing%20Lib.aml', 'lib/missing.aml', 'lib\\plain.aml', '/lib/plain.aml', '\\lib\\plain.aml',
  'lib/Bibliothek_ä.aml', 'lib/Bibliothek_%C3%A4.aml', 'model.dae', 'data/geo file.dae', 'data/geo%20file.dae', 'model.dae#frag', '#frag', '?q=1', '../validator/model.dae',
  '..\\validator\\model.dae', './model.dae', '%CASES%\\model.dae', '%CASES%/model.dae', '%CASES%\\missing.dae', '%CASESURL%/model.dae', '%CASESURL%/data/geo%20file.dae',
  '%CASESURL%/missing.dae', 'file:///model.dae', 'file:///C:/no/such.aml', 'file://server/share/x.aml', 'FILE:///C:/x.aml', 'http://127.0.0.1:1/x.aml', 'https://example.invalid/x.aml',
  'HTTP://127.0.0.1:1/x.aml', 'mailto:a@b.c', 'urn:x:y', 'news:comp', 'C:\\no\\such.aml', 'C:/no/such.aml', 'C:no.aml', '//server/share/x.aml', '\\\\server\\share\\x.aml',
  '%zz', '100%', 'a<b>.aml', 'a|b.aml', 'a"b.aml', 'a*b.aml', 'a?b.aml', 'ä.aml', '%C3%A4.aml', 'x:y', ':', 'a:b/c', '/', '//', '///', '.', '..', 'lib/', 'lib//plain.aml',
  'AutomationML_Base_Libraries_AMLEd1_2.1.0.aml', 'lib/plain.aml ', ' lib/plain.aml', 'lib/pla in.aml', 'x'.repeat(300), 'tab\there.aml', 'nl\nhere.aml', '{guid}.aml', 'a#b#c', 'nul\u0000.aml', '\u0000',
  // Path.GetFullPath on Windows (GetFullPathNameW): trailing dots and spaces, drives, UNC and device paths.
  'C:\\a\\b. ', 'C:\\a. \\b', 'C:\\a\\b .\\c', 'C:\\a\\...\\b', 'C:\\a\\...', 'x. ', '...', 'lib/plain.aml.', 'a/./b/../c', 'C:\\a\\b\\..\\..\\..',
  'c:lib', 'C:', 'q:', 'q:x/y', '\\x', '//server', '//server/share/', '//server/share/../x', '////', '\\\\?\\C:\\x\\..\\y', '//./C:/x/../y', '//?/C:/x',
  // Uri length limit (65519): the relative URI fits, the combined full path or "/" + reference does not.
  'x'.repeat(65500), 'y'.repeat(70000),
];
// Strings for XmlConvert.VerifyXmlChars, as UTF-16 code units.
const units = (s) => [...s].flatMap((c) => {
  const cp = c.codePointAt(0);
  if (cp > 0xffff) return [0xd800 + ((cp - 0x10000) >> 10), 0xdc00 + ((cp - 0x10000) & 0x3ff)];
  return [cp];
});
const xmlChars = [
  [], units('abc'), units('Ä ö ü ß'), units('a\tb\nc\rd'), units('😀'), units('x😀y'), units('\u{10FFFF}'),
  [0x0000], [0x0041, 0x0000], [0x0001], [0x0008], [0x000b], [0x000c], [0x000e], [0x001f], [0x0020], [0x007f], [0x0080], [0x009f], [0xd7ff], [0xe000], [0xfffd], [0xfffe], [0xffff],
  [0xd800], [0x0041, 0xd800], [0xd800, 0x0041], [0xdbff, 0xdbff], [0xdc00], [0x0041, 0xdc00, 0x0041], [0xdfff, 0xd800], [0xd800, 0xdc00], [0xdbff, 0xdfff], [0x0041, 0xd83d, 0xde00, 0x0001],
  [0x0041, 0x0042, 0x0043, 0xd800], [0xd800, 0xdc00, 0xd800], [0xdc00, 0xd800], [0x0001, 0xd800], [0xd800, 0x0001], [0x0061, 0x0062, 0xfffe, 0x0063], [0x0009, 0x000a, 0x000d],
];
for (let i = 0; i < 40; i++) {
  const len = 1 + Math.floor(rnd() * 6);
  const s = [];
  for (let k = 0; k < len; k++) s.push(pick([0x41, 0x7a, 0x09, 0x01, 0x1f, 0xd800, 0xdbff, 0xdc00, 0xdfff, 0xfffe, 0xfffd, 0xe000, 0x00, 0x20, 0xd7ff]));
  xmlChars.push(s);
}
// RepairTypeEnum values for RepairTypeDescription.
const repairValues = [0];
for (let bit = 0; bit < 23; bit++) repairValues.push(1 << bit);
for (const v of [0x2005, 0x1488, 0x20, 0x40, 0x10000, 0x3fffff, -1, 0x7fffffff, 0x1000 | 0x10000, 0x8000 | 0x80, 0x100 | 0x20000]) repairValues.push(v);
for (let a = 0; a < 22; a++) for (let c = a + 1; c < 22; c++) repairValues.push((1 << a) | (1 << c));
for (let i = 0; i < 30; i++) repairValues.push(Math.floor(rnd() * 0x400000));

const cases = { docs: [...docs, ...corpus], fileRefs, xmlChars, repairValues };
writeFileSync(join(outDir, 'cases.json'), JSON.stringify(cases, null, 1) + '\n');
console.log(`${docs.length} generated documents, ${corpus.length} corpus documents, ${fileRefs.length} file references, ${xmlChars.length} strings, ${repairValues.length} repair values`);
