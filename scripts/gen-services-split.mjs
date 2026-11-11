// Generates the cases of the split and merge services (seeded): documents in <dir>/docs and the
// scripts in <dir>/cases.json, run by oracle/ServicesSplitOracle.cs and
// test/services/split.oracle.test.ts.
//   node scripts/gen-services-split.mjs [dir=test/services/split] [seed=3682]
//
// A case registers services, loads documents (from the corpus, from <dir>/docs or new ones; from a
// string or from a file copied into the work directory of the case) and runs operations on them.
// Paths in operations are relative to the work directory of the case (the current directory while
// the case runs); "<W>" stands for its absolute path with the separators of the platform, "<W/>"
// for the same with forward slashes. A selector { k, i } picks the i-th object (modulo the count)
// of kind k in document order.
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir = 'test/services/split', seedArg = '3682'] = process.argv.slice(2);
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
const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[int(16)]).join('');
const guid = () => `${hex(8)}-${hex(4)}-4${hex(3)}-a${hex(3)}-${hex(12)}`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');

const docsDir = join(dir, 'docs');
rmSync(dir, { recursive: true, force: true });
mkdirSync(docsDir, { recursive: true });

// ---------------------------------------------------------------- documents

const VERSIONS = [null, '1.0.0', '2.1', '1.0.0', 'x.y', '3'];

function header30(fileName, ers) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<CAEXFile SchemaVersion="3.0" FileName="${esc(fileName)}" xsi:schemaLocation="http://www.dke.de/CAEX CAEX_ClassModel_V.3.0.xsd" xmlns="http://www.dke.de/CAEX" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    '  <SuperiorStandardVersion>AutomationML 2.10</SuperiorStandardVersion>',
    '  <SourceDocumentInformation OriginName="gen-services-split" OriginID="gen" OriginVersion="1.0" LastWritingDateTime="2020-01-01T00:00:00" OriginRelease="1.0" />',
    ...ers.map((e) => `  <ExternalReference Path="${esc(e.path)}" Alias="${esc(e.alias)}"${e.ext ?? ''} />`),
  ];
}

function header215(fileName, ers) {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    `<CAEXFile FileName="${esc(fileName)}" SchemaVersion="2.15" xsi:noNamespaceSchemaLocation="CAEX_ClassModel_V2.15.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">`,
    '  <AdditionalInformation AutomationMLVersion="2.0" />',
    ...ers.map((e) => `  <ExternalReference Path="${esc(e.path)}" Alias="${esc(e.alias)}"${e.ext ?? ''} />`),
  ];
}

const version = (v, ind) => (v === null ? [] : [`${ind}<Version>${esc(v)}</Version>`]);

/**
 * A random document: libraries of all kinds (CAEX 3.0: AttributeTypeLib too) with references
 * between the libraries and to an existing ExternalReference, instance hierarchies with class and
 * role references, mirrors, groups and InternalLinks within and across the elements.
 */
function randomDoc(fileName, v30) {
  const ers = chance(0.7) ? [{ path: 'Base.aml', alias: 'Base' }] : [];
  if (chance(0.3)) ers.push({ path: 'Other/Lib.aml', alias: 'Other' });
  const lines = v30 ? header30(fileName, ers) : header215(fileName, ers);
  const nLib = () => 1 + int(2);
  const atls = v30 ? Array.from({ length: nLib() }, (_, i) => ({ name: `ATL_${i}`, items: Array.from({ length: 1 + int(3) }, (_, j) => `AT_${j}`) })) : [];
  const icls = Array.from({ length: nLib() }, (_, i) => ({ name: `ICL_${i}`, items: Array.from({ length: 1 + int(3) }, (_, j) => `IC_${j}`) }));
  const rcls = Array.from({ length: nLib() }, (_, i) => ({ name: `RCL_${i}`, items: Array.from({ length: 1 + int(3) }, (_, j) => `RC_${j}`) }));
  const sucls = Array.from({ length: nLib() }, (_, i) => ({ name: `SUCL_${i}`, items: Array.from({ length: 1 + int(3) }, (_, j) => `SUC_${j}`) }));
  const path = (libs) => {
    const l = pick(libs);
    return `${l.name}/${pick(l.items)}`;
  };
  const aliasOr = (libs, kind) => (ers.length > 0 && chance(0.2) ? `${pick(ers).alias}@${kind}Lib/${kind}` : path(libs));
  const attr = (ind) => {
    const name = pick(['a', 'b', 'Length', 'Speed']);
    const ref = v30 && atls.length > 0 && chance(0.6) ? ` RefAttributeType="${esc(aliasOr(atls, 'Attribute'))}"` : '';
    return `${ind}<Attribute Name="${name}" AttributeDataType="xs:string"${ref}>\n${ind}  <Value>${int(100)}</Value>\n${ind}</Attribute>`;
  };
  const ihs = [];

  // instance hierarchies first (CAEX order), their elements reference the libraries below
  const allIEs = [];
  const links = [];
  const ancestors = [];
  function ie(ind, depth, owner) {
    const id = guid();
    const name = `E${allIEs.length}`;
    const eis = Array.from({ length: int(3) }, (_, k) => `P${k}`);
    const rec = { id, name, eis };
    // a mirror of an element that is not an ancestor (no cycles)
    const masters = allIEs.filter((e) => !ancestors.includes(e));
    allIEs.push(rec);
    const out = [];
    const mirrorOf = masters.length > 1 && chance(0.15) ? pick(masters) : null;
    const suc = mirrorOf !== null ? mirrorOf.id : chance(0.7) ? aliasOr(sucls, 'SystemUnitClass') : null;
    out.push(`${ind}<InternalElement Name="${name}" ID="${id}"${suc !== null ? ` RefBaseSystemUnitPath="${esc(suc)}"` : ''}>`);
    if (chance(0.4)) out.push(attr(ind + '  '));
    for (const ei of eis) {
      out.push(`${ind}  <ExternalInterface Name="${ei}" ID="${guid()}" RefBaseClassPath="${esc(aliasOr(icls, 'InterfaceClass'))}" />`);
    }
    if (depth < 3) {
      ancestors.push(rec);
      for (let c = int(depth === 0 ? 4 : 3); c > 0; c--) out.push(...ie(ind + '  ', depth + 1, rec));
      ancestors.pop();
    }
    if (v30 && chance(0.4)) out.push(`${ind}  <SupportedRoleClass RefRoleClassPath="${esc(path(rcls))}" />`);
    // InternalLinks between any two interfaces seen so far (they may cross split borders)
    const withEIs = allIEs.filter((e) => e.eis.length > 0);
    if (withEIs.length >= 2 && chance(0.4)) {
      const a = pick(withEIs);
      const b = pick(withEIs);
      out.push(`${ind}  <InternalLink Name="L${links.length}" RefPartnerSideA="${a.id}:${pick(a.eis)}" RefPartnerSideB="${b.id}:${pick(b.eis)}" />`);
      links.push(1);
    }
    if (chance(0.5)) out.push(`${ind}  <RoleRequirements RefBaseRoleClassPath="${esc(chance(0.15) ? 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group' : aliasOr(rcls, 'RoleClass'))}" />`);
    out.push(`${ind}</InternalElement>`);
    void owner;
    return out;
  }
  for (let h = 0, n = 1 + int(3); h < n; h++) {
    const out = [`  <InstanceHierarchy Name="IH_${h}">`, ...version(pick(VERSIONS), '    ')];
    for (let c = 1 + int(3); c > 0; c--) out.push(...ie('    ', 0, null));
    out.push('  </InstanceHierarchy>');
    ihs.push(out);
  }
  for (const ih of ihs) lines.push(...ih);
  // base classes only among the classes defined before (no cyclic inheritance)
  const before = (defined, kind) => (ers.length > 0 && chance(0.2) ? `${pick(ers).alias}@${kind}Lib/${kind}` : defined.length > 0 ? pick(defined) : null);
  const definedIC = [];
  for (const l of icls) {
    lines.push(`  <InterfaceClassLib Name="${l.name}">`, ...version(pick(VERSIONS), '    '));
    l.items.forEach((c) => {
      const b = chance(0.5) ? before(definedIC, 'InterfaceClass') : null;
      lines.push(`    <InterfaceClass Name="${c}"${b !== null ? ` RefBaseClassPath="${esc(b)}"` : ''} />`);
      definedIC.push(`${l.name}/${c}`);
    });
    lines.push('  </InterfaceClassLib>');
  }
  const definedRC = [];
  for (const l of rcls) {
    lines.push(`  <RoleClassLib Name="${l.name}">`, ...version(pick(VERSIONS), '    '));
    l.items.forEach((c) => {
      const b = chance(0.5) ? before(definedRC, 'RoleClass') : null;
      const base = b !== null ? ` RefBaseClassPath="${esc(b)}"` : '';
      definedRC.push(`${l.name}/${c}`);
      lines.push(`    <RoleClass Name="${c}"${base}>`);
      if (chance(0.3)) lines.push(attr('      '));
      lines.push('    </RoleClass>');
    });
    lines.push('  </RoleClassLib>');
  }
  const definedSUC = [];
  for (const l of sucls) {
    lines.push(`  <SystemUnitClassLib Name="${l.name}">`, ...version(pick(VERSIONS), '    '));
    l.items.forEach((c, j) => {
      const base = j > 0 && chance(0.4) ? ` RefBaseClassPath="${esc(`${l.name}/${l.items[0]}`)}"` : '';
      lines.push(`    <SystemUnitClass Name="${c}"${base}>`);
      if (chance(0.5)) lines.push(attr('      '));
      if (chance(0.6)) lines.push(`      <ExternalInterface Name="C" ID="${guid()}" RefBaseClassPath="${esc(aliasOr(icls, 'InterfaceClass'))}" />`);
      if (chance(0.4)) {
        const b = definedSUC.length > 0 && chance(0.5) ? pick(definedSUC) : null;
        lines.push(`      <InternalElement Name="Inner" ID="${guid()}"${b !== null ? ` RefBaseSystemUnitPath="${esc(b)}"` : ''} />`);
      }
      if (chance(0.7)) lines.push(`      <SupportedRoleClass RefRoleClassPath="${esc(aliasOr(rcls, 'RoleClass'))}" />`);
      lines.push('    </SystemUnitClass>');
      definedSUC.push(`${l.name}/${c}`);
    });
    lines.push('  </SystemUnitClassLib>');
  }
  for (const l of atls) {
    lines.push(`  <AttributeTypeLib Name="${l.name}">`, ...version(pick(VERSIONS), '    '));
    l.items.forEach((c, j) => {
      const base = j > 0 && chance(0.4) ? ` RefAttributeType="${esc(`${l.name}/${l.items[0]}`)}"` : '';
      lines.push(`    <AttributeType Name="${c}" AttributeDataType="xs:string"${base} />`);
    });
    lines.push('  </AttributeTypeLib>');
  }
  lines.push('</CAEXFile>', '');
  return lines.join('\n');
}

const generated = [];
function addDoc(name, text) {
  writeFileSync(join(docsDir, name), text);
  generated.push(name);
}
for (let n = 0; n < 6; n++) addDoc(`g30-${n}.aml`, randomDoc(`g30-${n}.aml`, true));
for (let n = 0; n < 4; n++) addDoc(`g215-${n}.aml`, randomDoc(`g215-${n}.aml`, false));

/**
 * Documents for the merge: a target referencing an external document by the alias "ext", the
 * external document with libraries of the same names (with and without versions), master mirrors
 * of the alias (single, double, inside a group), instance hierarchies with one or more elements and
 * external references (path of the target, alias collisions, version references, unused).
 */
function mergeDocs(v30, extFile, targetFile) {
  const hdr = v30 ? header30 : header215;
  const x1 = guid();
  const x2 = guid();
  const x3 = guid();
  const ext = [
    ...hdr(extFile, [
      { path: 'Base.aml', alias: 'Base' },
      { path: 'Second.aml', alias: 'Base' },
      { path: targetFile, alias: 'Self' },
      { path: 'Versioned.aml', alias: 'Ver', ext: '' },
      { path: 'Unused.aml', alias: 'Unused' },
      { path: 'Desc.aml', alias: 'Desc' },
      { path: 'Other.aml', alias: 'missing' },
      { path: 'V2.aml', alias: 'Ver2', ext: '' },
    ]),
    '  <InstanceHierarchy Name="HX">',
    '    <Version>1.0.0</Version>',
    `    <InternalElement Name="X" ID="${x1}" RefBaseSystemUnitPath="Base@SUCL/S" />`,
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy Name="HM">',
    `    <InternalElement Name="Holder" ID="${guid()}">`,
    `      <InternalElement Name="M" ID="${guid()}" RefBaseSystemUnitPath="ext@${x1}" />`,
    `      <InternalElement Name="M2a" ID="${guid()}" RefBaseSystemUnitPath="ext@${x2}" />`,
    `      <InternalElement Name="M2b" ID="${guid()}" RefBaseSystemUnitPath="ext@${x2}" />`,
    `      <InternalElement Name="Grp" ID="${guid()}">`,
    `        <InternalElement Name="MG" ID="${guid()}" RefBaseSystemUnitPath="ext@${x3}" />`,
    '        <InternalElement Name="MG5" ID="MG5id" RefBaseSystemUnitPath="ext@X5id" />',
    '        <RoleRequirements RefBaseRoleClassPath="AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group" />',
    '      </InternalElement>',
    // IDs that are no GUIDs: the alias reference is a path reference the query finds
    '      <InternalElement Name="M4" ID="M4id" RefBaseSystemUnitPath="ext@X4id" />',
    `      <InternalElement Name="U" ID="${guid()}" RefBaseSystemUnitPath="Desc@SUCL/S" />`,
    `      <InternalElement Name="V" ID="${guid()}" RefBaseSystemUnitPath="Ver@SUCL/S" />`,
    '    </InternalElement>',
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy Name="HX2">',
    `    <InternalElement Name="X2" ID="${x2}" />`,
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy Name="HX3">',
    `    <InternalElement Name="X3" ID="${x3}" />`,
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy Name="HX4">',
    '    <InternalElement Name="X4" ID="X4id" />',
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy Name="HX5">',
    '    <InternalElement Name="X5" ID="X5id" />',
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy Name="HM6">',
    '    <InternalElement Name="M6" ID="M6id" RefBaseSystemUnitPath="ext@X6id" />',
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy Name="HX6">',
    '    <InternalElement Name="X6" ID="X6id" />',
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy>',
    '    <Version>1.0</Version>',
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy Name="HTwo">',
    `    <InternalElement Name="T1" ID="${guid()}" />`,
    `    <InternalElement Name="T2" ID="${guid()}" RefBaseSystemUnitPath="Self@SUCL_T/S" />`,
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy Name="Shared">',
    '    <Version>2.0.0</Version>',
    '  </InstanceHierarchy>',
    '  <InterfaceClassLib Name="ICL_Shared">',
    '    <Version>1.0.0</Version>',
    '    <InterfaceClass Name="IC" />',
    '  </InterfaceClassLib>',
    '  <InterfaceClassLib Name="ICL_New">',
    '    <InterfaceClass Name="IC" RefBaseClassPath="Base@ICL/IC" />',
    '  </InterfaceClassLib>',
    '  <InterfaceClassLib>',
    '    <InterfaceClass Name="Nameless" />',
    '  </InterfaceClassLib>',
    '  <RoleClassLib Name="RCL_Shared">',
    '    <Version>x.1</Version>',
    '    <RoleClass Name="RC" />',
    '  </RoleClassLib>',
    '  <RoleClassLib Name="RCL_New">',
    '    <RoleClass Name="RC" RefBaseClassPath="RCL_Shared/RC" />',
    '  </RoleClassLib>',
    '  <SystemUnitClassLib Name="SUCL_Shared">',
    '    <SystemUnitClass Name="S" />',
    '  </SystemUnitClassLib>',
    '  <SystemUnitClassLib Name="SUCL_New">',
    '    <Version>0.9</Version>',
    '    <SystemUnitClass Name="S">',
    '      <ExternalInterface Name="C" ID="' + guid() + '" RefBaseClassPath="ICL_New/IC" />',
    '      <SupportedRoleClass RefRoleClassPath="RCL_New/RC" />',
    '    </SystemUnitClass>',
    '  </SystemUnitClassLib>',
    ...(v30
      ? [
          '  <AttributeTypeLib Name="ATL_Shared">',
          '    <Version>1.0.0</Version>',
          '    <AttributeType Name="AT" AttributeDataType="xs:string" />',
          '  </AttributeTypeLib>',
          '  <AttributeTypeLib Name="ATL_New">',
          '    <AttributeType Name="AT" AttributeDataType="xs:string" RefAttributeType="ATL_Shared/AT" />',
          '  </AttributeTypeLib>',
        ]
      : []),
    '</CAEXFile>',
    '',
  ].join('\n');
  // Ver is a version reference by its version, Desc by its description
  const extText = ext
    .replace('Alias="Ver" />', 'Alias="Ver">\n    <Version>NewVersion</Version>\n  </ExternalReference>')
    .replace('Alias="Desc" />', 'Alias="Desc">\n    <Description>VersionRef</Description>\n  </ExternalReference>')
    .replace('Alias="Ver2" />', 'Alias="Ver2">\n    <Version>NewVersion</Version>\n  </ExternalReference>');
  const target = [
    ...hdr(targetFile, [
      { path: extFile, alias: 'ext' },
      { path: 'Base.aml', alias: 'Base' },
      { path: 'Missing.aml', alias: 'missing' },
      { path: '', alias: 'nopath' },
      { path: 'nodir\\x.aml', alias: '' },
    ]),
    '  <InstanceHierarchy Name="Plant">',
    `    <InternalElement Name="Mirror" ID="${guid()}" RefBaseSystemUnitPath="ext@${x1}" />`,
    `    <InternalElement Name="UsesExt" ID="${guid()}" RefBaseSystemUnitPath="ext@SUCL_New/S">`,
    '      <ExternalInterface Name="C" ID="' + guid() + '" RefBaseClassPath="ext@ICL_New/IC" />',
    '      <RoleRequirements RefBaseRoleClassPath="ext@RCL_New/RC" />',
    '    </InternalElement>',
    `    <InternalElement Name="UsesMissing" ID="${guid()}" RefBaseSystemUnitPath="missing@SUCL/S" />`,
    '    <InternalElement Name="UsesUnused" ID="UU1id" RefBaseSystemUnitPath="Unused@SUCL/S" />',
    '    <InternalElement Name="UsesVer2" ID="UV2id" RefBaseSystemUnitPath="Ver2@SUCL/S" />',
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy Name="Shared">',
    '    <Version>2.0.0</Version>',
    '  </InstanceHierarchy>',
    '  <InstanceHierarchy />',
    '  <InterfaceClassLib Name="ICL_Shared">',
    '    <Version>0.5</Version>',
    '    <InterfaceClass Name="IC" />',
    '  </InterfaceClassLib>',
    '  <InterfaceClassLib />',
    '  <RoleClassLib Name="RCL_Shared">',
    '    <RoleClass Name="RC" />',
    '  </RoleClassLib>',
    '  <SystemUnitClassLib Name="SUCL_Shared">',
    '    <Version>1.0</Version>',
    '    <SystemUnitClass Name="S" />',
    '  </SystemUnitClassLib>',
    '  <SystemUnitClassLib Name="SUCL_T">',
    '    <SystemUnitClass Name="S" />',
    '  </SystemUnitClassLib>',
    ...(v30
      ? ['  <AttributeTypeLib Name="ATL_Shared">', '    <Version>3.0.0</Version>', '    <AttributeType Name="AT" AttributeDataType="xs:string" />', '  </AttributeTypeLib>']
      : []),
    '</CAEXFile>',
    '',
  ].join('\n');
  return { ext: extText, target };
}
{
  const m30 = mergeDocs(true, 'ext30.aml', 'mt30.aml');
  addDoc('ext30.aml', m30.ext);
  addDoc('mt30.aml', m30.target);
  const m215 = mergeDocs(false, 'ext215.aml', 'mt215.aml');
  addDoc('ext215.aml', m215.ext);
  addDoc('mt215.aml', m215.target);
  // targets of one version referencing the external document of the other version
  addDoc('mt30x.aml', m30.target.replace('Path="ext30.aml"', 'Path="ext215.aml"').replace('FileName="mt30.aml"', 'FileName="mt30x.aml"'));
  addDoc('mt215x.aml', m215.target.replace('Path="ext215.aml"', 'Path="ext30.aml"').replace('FileName="mt215.aml"', 'FileName="mt215x.aml"'));
  // a schema version that Version.TryParse rejects, in the external document and in the target
  addDoc('extbadver.aml', m30.ext.replace('SchemaVersion="3.0"', 'SchemaVersion="3.0-beta"'));
  addDoc('mtbadver.aml', m30.target.replace('Path="ext30.aml"', 'Path="extbadver.aml"').replace('SchemaVersion="3.0"', 'SchemaVersion="v3"'));
}

addDoc(
  'dupid30.aml',
  [
    ...header30('dupid30.aml', []),
    '  <InstanceHierarchy Name="IH">',
    '    <InternalElement Name="Out" ID="dup1">',
    '      <ExternalInterface Name="P0" ID="ei-out" />',
    '    </InternalElement>',
    '    <InternalElement Name="Part" ID="part1">',
    '      <InternalElement Name="In" ID="dup1">',
    '        <ExternalInterface Name="P0" ID="ei-in" />',
    '      </InternalElement>',
    '      <InternalElement Name="In2" ID="in2">',
    '        <ExternalInterface Name="P0" ID="ei-in2" />',
    '      </InternalElement>',
    '    </InternalElement>',
    '    <InternalElement Name="NoId">',
    '      <ExternalInterface Name="P0" />',
    '    </InternalElement>',
    '    <InternalElement Name="User" ID="user1" RefBaseSystemUnitPath="dup1">',
    '      <ExternalInterface Name="P0" ID="ei-user" />',
    '      <InternalLink Name="L1" RefPartnerSideA="dup1:P0" RefPartnerSideB="user1:P0" />',
    '      <InternalLink Name="L2" RefPartnerSideA="in2:P0" RefPartnerSideB="user1:P0" />',
    '    </InternalElement>',
    '  </InstanceHierarchy>',
    '</CAEXFile>',
    '',
  ].join('\n'),
);

// ---------------------------------------------------------------- scripts

const corpus = readdirSync('test/corpus').filter((f) => f.endsWith('.aml')).sort();
const kindsOf = (text) => {
  const has = (tag) => new RegExp(`<${tag}\\b`).test(text);
  return [
    ['ATL', has('AttributeTypeLib')],
    ['ICL', has('InterfaceClassLib')],
    ['RCL', has('RoleClassLib')],
    ['SUCL', has('SystemUnitClassLib')],
    ['IH', has('InstanceHierarchy')],
    ['IE', has('InternalElement')],
  ]
    .filter(([, h]) => h)
    .map(([k]) => k);
};
const fileNameOf = (text) => (text.match(/FileName="([^"]*)"/) ?? [])[1] ?? null;

const SERVICE_SETS = [[], [], ['undo'], ['uniquename'], ['undo', 'uniquename'], ['lookup'], ['extref'], ['undo', 'uniquename', 'lookup'], ['transform']];
const LOADS = ['string', 'file', 'file', 'fileRel', 'fileFwd'];
// split paths; the source document is in a/ when loaded from a file
const PATHS = [
  'a\\part.aml',
  '<W>\\a\\part.aml',
  '<W>\\a\\part.aml',
  '<W>\\b\\part.aml',
  '<W>\\a2\\part.aml',
  '<W/>/a/part.aml',
  'part.aml',
  'a/part.aml',
  'a\\..\\b\\part.aml',
  '<W>\\nodir\\part.aml',
  'http://example.org/lib/part.aml',
  'file:///<W/>/a/part.aml',
  '<W>\\a\\src.aml',
];
const srcPath = { file: '<W>\\a\\src.aml', fileRel: 'a\\src.aml', fileFwd: '<W/>/a/src.aml' };

const cases = [];
const sel = (k) => ({ k, i: int() });
function splitKinds(kinds) {
  // libraries and instance hierarchies more often than elements
  const w = kinds.flatMap((k) => (k === 'IE' ? [k] : [k, k]));
  return w.length ? w : ['IE'];
}

// the file a split path saves to, relative to the work directory (none: not saved)
const SAVED = {
  'a\\part.aml': 'a\\part.aml',
  '<W>\\a\\part.aml': 'a\\part.aml',
  '<W>\\b\\part.aml': 'b\\part.aml',
  '<W>\\a2\\part.aml': 'a2\\part.aml',
  '<W/>/a/part.aml': 'a\\part.aml',
  'part.aml': 'part.aml',
  'a/part.aml': 'a\\part.aml',
  'a\\..\\b\\part.aml': 'b\\part.aml',
  '<W>\\a\\src.aml': 'a\\src.aml',
};

function mergeBack(ops, path, partName) {
  const auto = pick([undefined, false, true]);
  if (path.startsWith('http') || chance(0.3)) {
    // from a stream: the saved file or the returned document
    const from = SAVED[path] === undefined || chance(0.5) ? `doc:${partName}` : `file:${SAVED[path]}`;
    ops.push({ op: 'mergeStream', d: 'src', er: 'last', from, ...(auto === undefined ? {} : { auto }) });
  } else {
    ops.push({ op: 'merge', d: 'src', er: 'last', ...(auto === undefined ? {} : { auto }) });
  }
}

/** A random split and merge script on one document. */
function randomScript(name, src, text, opts = {}) {
  const services = opts.services ?? pick(SERVICE_SETS);
  const load = opts.load ?? pick(LOADS);
  const kinds = splitKinds(kindsOf(text));
  const ops = [];
  for (let n = 1 + int(4); n > 0; n--) ops.push({ op: 'set', d: 'src', s: sel(pick(kinds)) });
  if (chance(0.3)) ops.push({ op: 'unset', d: 'src', s: sel(pick(kinds)) });
  if (chance(0.15)) ops.push({ op: 'del', d: 'src', s: sel(pick(kinds)) });
  ops.push({ op: 'points', d: 'src' });
  let path = pick(PATHS);
  if (path === '<W>\\a\\src.aml' && load !== 'file') path = '<W>\\a\\part.aml';
  const alias = chance(0.15) && /Alias="Base"/.test(text) ? 'Base' : pick(['lib', 'part', 'A']);
  const overload = chance(0.3) ? 'split1' : 'split';
  if (overload === 'split1') ops.push({ op: 'split1', d: 'src', s: sel(pick(kinds)), alias, path, as: 'part' });
  else ops.push({ op: 'split', d: 'src', alias, path, as: 'part' });
  ops.push({ op: 'points', d: 'src' }, { op: 'files' });
  if (chance(0.25)) {
    // a second split into another file
    ops.push({ op: 'set', d: 'src', s: sel(pick(kinds)) });
    ops.push({ op: 'split', d: 'src', alias: alias + '2', path: '<W>\\b\\part2.aml', as: 'part2' });
  }
  if (services.includes('undo') && chance(0.5)) ops.push({ op: 'undoActions', d: 'src' }, { op: 'undo', d: 'src', n: 1 + int(3) });
  mergeBack(ops, path, 'part');
  ops.push({ op: 'svc' });
  if (services.includes('undo') && chance(0.5)) ops.push({ op: 'undoActions', d: 'src' }, { op: 'undo', d: 'src', n: 1 + int(3) });
  cases.push({ name, services, docs: [{ name: 'src', src, load }], ops });
}

for (const f of corpus) {
  const text = readFileSync(join('test/corpus', f), 'utf8');
  const runs = text.length > 150_000 ? 1 : 2;
  for (let r = 0; r < runs; r++) randomScript(`corpus-${f.replace(/\.aml$/, '')}-${r}`, `corpus/${f}`, text);
}
for (const f of generated.filter((g) => g.startsWith('g'))) {
  const text = readFileSync(join(docsDir, f), 'utf8');
  for (let r = 0; r < 4; r++) randomScript(`gen-${f.replace(/\.aml$/, '')}-${r}`, `docs/${f}`, text);
}
// every service set and load mode on one generated document
SERVICE_SETS.forEach((services, n) => {
  const text = readFileSync(join(docsDir, 'g30-0.aml'), 'utf8');
  randomScript(`services-${n}-${services.join('+') || 'none'}`, 'docs/g30-0.aml', text, { services, load: LOADS[n % LOADS.length] });
});
// every path on one generated document, both overloads
PATHS.forEach((path, n) => {
  for (const overload of ['split', 'split1']) {
    const ops = [
      { op: 'set', d: 'src', s: { k: 'SUCL', i: 0 } },
      { op: 'set', d: 'src', s: { k: 'IE', i: 1 } },
      overload === 'split'
        ? { op: 'split', d: 'src', alias: 'lib', path, as: 'part' }
        : { op: 'split1', d: 'src', s: { k: 'IE', i: 1 }, alias: 'lib', path, as: 'part' },
      { op: 'points', d: 'src' },
      { op: 'files' },
      { op: 'filePath', d: 'part' },
      { op: 'svc' },
    ];
    mergeBack(ops, path, 'part');
    ops.push({ op: 'svc' });
    cases.push({ name: `path-${n}-${overload}`, services: n % 2 ? ['undo'] : [], docs: [{ name: 'src', src: 'docs/g30-1.aml', load: 'file' }], ops });
  }
});

// ---------------------------------------------------------------- API cases

const api = (name, services, docs, ops) => cases.push({ name, services, docs, ops });
const G = (f, load = 'string', name = 'src') => ({ name, src: `docs/${f}`, load });

// SetSplitPoint: elements below and above, libraries beside elements, twice, remove
api('set-child-then-parent', [], [G('g30-2.aml')], [
  { op: 'set', d: 'src', s: { k: 'IE', i: 1 } },
  { op: 'set', d: 'src', s: { k: 'IE', i: 2 } },
  { op: 'points', d: 'src' },
  { op: 'set', d: 'src', s: { k: 'IE', i: 0 } },
  { op: 'points', d: 'src' },
  { op: 'set', d: 'src', s: { k: 'IE', i: 1 } },
  { op: 'points', d: 'src' },
  { op: 'set', d: 'src', s: { k: 'IE', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'ICL', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'RCL', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'ATL', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'SUCL', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'IH', i: 0 } },
  { op: 'points', d: 'src' },
  { op: 'unset', d: 'src', s: { k: 'ICL', i: 0 } },
  { op: 'unset', d: 'src', s: { k: 'ICL', i: 0 } },
  { op: 'unset', d: 'src', s: { k: 'IE', i: 3 } },
  { op: 'points', d: 'src' },
  { op: 'pointsNull' },
]);
api('set-libs-first', [], [G('g30-3.aml')], [
  { op: 'set', d: 'src', s: { k: 'SUCL', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'SUCL', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'IH', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'IE', i: 2 } },
  { op: 'set', d: 'src', s: { k: 'IE', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'SUCL', i: 1 } },
  { op: 'set', d: 'src', s: { k: 'IH', i: 1 } },
  { op: 'points', d: 'src' },
  { op: 'split', d: 'src', alias: 'lib', path: '<W>\\b\\part.aml', as: 'part' },
  { op: 'points', d: 'src' },
  { op: 'merge', d: 'src', er: 'last' },
  { op: 'svc' },
]);
// split points of deleted elements, of a disposed document, of two documents
api('points-deleted-disposed', ['undo'], [G('g30-4.aml'), G('g215-0.aml', 'string', 'other')], [
  { op: 'set', d: 'src', s: { k: 'IE', i: 1 } },
  { op: 'set', d: 'src', s: { k: 'ICL', i: 0 } },
  { op: 'set', d: 'other', s: { k: 'RCL', i: 0 } },
  { op: 'del', d: 'src', s: { k: 'IE', i: 1 } },
  { op: 'points', d: 'src' },
  { op: 'points', d: 'other' },
  { op: 'del', d: 'src', s: { k: 'ICL', i: 0 } },
  { op: 'split', d: 'src', alias: 'lib', path: 'x.aml', as: 'part' },
  { op: 'files' },
  { op: 'dispose', d: 'other' },
  { op: 'points', d: 'other' },
  { op: 'split', d: 'other', alias: 'lib', path: 'y.aml', as: 'part2' },
  { op: 'svc' },
]);
api('points-unregistered', [], [G('g30-5.aml')], [
  { op: 'set', d: 'src', s: { k: 'IE', i: 0 } },
  { op: 'unregister', svc: 'split' },
  { op: 'points', d: 'src' },
  { op: 'set', d: 'src', s: { k: 'SUCL', i: 0 } },
  { op: 'register', svc: 'split' },
  { op: 'points', d: 'src' },
  { op: 'svc' },
]);
// argument checks of both overloads
api('split-arguments', [], [G('g30-1.aml', 'file')], [
  { op: 'set', d: 'src', s: { k: 'IE', i: 0 } },
  { op: 'split', d: 'null', alias: 'a', path: 'x.aml', as: 'p' },
  { op: 'split', d: 'src', alias: null, path: 'x.aml', as: 'p' },
  { op: 'split', d: 'src', alias: '', path: 'x.aml', as: 'p' },
  { op: 'split', d: 'src', alias: 'a', path: null, as: 'p' },
  { op: 'split', d: 'src', alias: 'a', path: '', as: 'p' },
  { op: 'split', d: 'src', alias: 'a', path: 'g30-1.aml', as: 'p' },
  { op: 'split1', d: 'null', s: { k: 'IE', i: 0, d: 'src' }, alias: 'a', path: 'x.aml', as: 'p' },
  { op: 'split1', d: 'src', s: { k: 'IE', i: 0 }, alias: null, path: 'x.aml', as: 'p' },
  { op: 'split1', d: 'src', s: { k: 'IE', i: 0 }, alias: '', path: 'x.aml', as: 'p' },
  { op: 'split1', d: 'src', s: { k: 'IE', i: 0 }, alias: 'a', path: null, as: 'p' },
  { op: 'split1', d: 'src', s: { k: 'IE', i: 0 }, alias: 'a', path: '', as: 'p' },
  { op: 'split1', d: 'src', s: { k: 'IE', i: 0 }, alias: 'a', path: 'g30-1.aml', as: 'p' },
  { op: 'points', d: 'src' },
  { op: 'svc' },
]);
api('split-nothing', ['uniquename'], [G('g30-1.aml')], [
  { op: 'split', d: 'src', alias: 'a', path: 'x.aml', as: 'p' },
  { op: 'set', d: 'src', s: { k: 'IE', i: 0 } },
  { op: 'del', d: 'src', s: { k: 'IE', i: 0 } },
  { op: 'split', d: 'src', alias: 'a', path: 'x.aml', as: 'p' },
  { op: 'files' },
  { op: 'svc' },
]);
// the second overload with a split point that is not a split point, of another document, null,
// an instance hierarchy; failures after the document has been changed
api('split1-points', ['undo', 'uniquename'], [G('g30-2.aml', 'file'), G('g30-3.aml', 'string', 'other')], [
  { op: 'set', d: 'src', s: { k: 'IE', i: 3 } },
  { op: 'split1', d: 'src', s: { k: 'IH', i: 1 }, alias: 'h', path: 'b\\h.aml', as: 'p1' },
  { op: 'points', d: 'src' },
  { op: 'split1', d: 'src', s: { k: 'ATL', i: 0 }, alias: 'at', path: 'b\\at.aml', as: 'p2' },
  { op: 'split1', d: 'src', s: { k: 'SUCL', i: 0 }, alias: 'missingdir', path: 'nodir\\s.aml', as: 'p3' },
  { op: 'svc' },
  { op: 'split1', d: 'src', s: null, alias: 'n', path: 'b\\n.aml', as: 'p4' },
  { op: 'svc' },
  { op: 'split1', d: 'src', s: { k: 'RCL', i: 0, d: 'other' }, alias: 'o', path: 'b\\o.aml', as: 'p5' },
  { op: 'split1', d: 'src', s: { k: 'ICL', i: 0 }, alias: 'dir', path: 'b', as: 'p6' },
  { op: 'split1', d: 'src', s: { k: 'RCL', i: 0 }, alias: 'star', path: 'b\\a*b.aml', as: 'p7' },
  { op: 'svc' },
  { op: 'files' },
  { op: 'undoActions', d: 'src' },
  { op: 'svc' },
]);
// existing files, the source's own file, the same alias twice, alias of an existing reference
api('split-existing-files', [], [G('g30-0.aml', 'file')], [
  { op: 'write', path: 'a\\part.aml', text: 'old' },
  { op: 'set', d: 'src', s: { k: 'ICL', i: 0 } },
  { op: 'split', d: 'src', alias: 'Base', path: '<W>\\a\\part.aml', as: 'p1' },
  { op: 'set', d: 'src', s: { k: 'RCL', i: 0 } },
  { op: 'split', d: 'src', alias: 'Base', path: '<W>\\a\\part.aml', as: 'p2' },
  { op: 'files' },
  { op: 'merge', d: 'src', er: 'last' },
  { op: 'merge', d: 'src', er: 'last' },
  { op: 'svc' },
  { op: 'set', d: 'src', s: { k: 'IH', i: 0 } },
  { op: 'split', d: 'src', alias: 'own', path: '<W>\\a\\src.aml', as: 'p3' },
  { op: 'files' },
  { op: 'filePath', d: 'src' },
  { op: 'merge', d: 'src', er: 'last' },
]);
// the source document saved to another place before the split
api('split-after-save', ['undo'], [G('g215-1.aml')], [
  { op: 'save', d: 'src', path: '<W>\\b\\saved.aml' },
  { op: 'filePath', d: 'src' },
  { op: 'set', d: 'src', s: { k: 'SUCL', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'IE', i: 2 } },
  { op: 'split', d: 'src', alias: 'lib', path: '<W>\\b\\sub.aml', as: 'p' },
  { op: 'save', d: 'src', path: 'b\\saved.aml' },
  { op: 'files' },
  { op: 'load', as: 'reloaded', path: '<W>\\b\\saved.aml' },
  { op: 'merge', d: 'reloaded', er: 'last' },
  { op: 'merge', d: 'src', er: 'last', auto: true },
  { op: 'svc' },
]);

// the lookup service with auto update enabled: Split and Merge switch it off while they remove
for (const [n, services] of [
  [0, ['lookup']],
  [1, ['lookup', 'undo', 'uniquename']],
]) {
  api(`autoupdate-${n}`, services, [G('g30-3.aml', 'file')], [
    { op: 'autoUpdate', value: true },
    { op: 'set', d: 'src', s: { k: 'SUCL', i: 0 } },
    { op: 'set', d: 'src', s: { k: 'ICL', i: 1 } },
    { op: 'set', d: 'src', s: { k: 'IE', i: 2 } },
    { op: 'split', d: 'src', alias: 'lib', path: '<W>\\a\\part.aml', as: 'part' },
    { op: 'split1', d: 'src', s: { k: 'IE', i: 5 }, alias: 'ie', path: '<W>\\b\\ie.aml', as: 'part2' },
    { op: 'merge', d: 'src', er: { alias: 'lib' } },
    { op: 'merge', d: 'src', er: { alias: 'ie' } },
    { op: 'autoUpdate', value: false },
    { op: 'svc' },
  ]);
}
api('autoupdate-none', [], [G('g30-3.aml')], [{ op: 'autoUpdate', value: true }]);
// an ID inside and outside of the split element, an element without ID
for (const services of [[], ['lookup']]) {
  api(`split-duplicate-ids-${services.join('+') || 'none'}`, services, [G('dupid30.aml', 'file')], [
    { op: 'split1', d: 'src', s: { k: 'IE', i: 1 }, alias: 'p', path: '<W>\\a\\p.aml', as: 'p' },
    { op: 'set', d: 'src', s: { k: 'IE', i: 2 } },
    { op: 'points', d: 'src' },
    { op: 'split', d: 'src', alias: 'n', path: '<W>\\a\\n.aml', as: 'n' },
    { op: 'merge', d: 'src', er: { alias: 'p' } },
    { op: 'merge', d: 'src', er: { alias: 'n' } },
    { op: 'svc' },
  ]);
}

// Merge: libraries of the same name (versions), master mirrors, external references, both overloads
for (const [v, tgt, ext] of [
  ['30', 'mt30.aml', 'ext30.aml'],
  ['215', 'mt215.aml', 'ext215.aml'],
]) {
  for (const services of [[], ['extref'], ['undo', 'uniquename'], ['lookup']]) {
    const tag = services.join('+') || 'none';
    api(`merge-${v}-${tag}`, services, [G(tgt, 'file', 'tgt'), { name: 'ext', src: `docs/${ext}`, load: 'copy', path: `a\\${ext}` }], [
      { op: 'merge', d: 'tgt', er: { alias: 'ext' } },
      { op: 'svc' },
      { op: 'merge', d: 'tgt', er: { alias: 'missing' } },
      { op: 'merge', d: 'tgt', er: { alias: 'nopath' } },
      { op: 'merge', d: 'tgt', er: { alias: '' } },
      { op: 'svc' },
      ...(services.includes('undo') ? [{ op: 'undoActions', d: 'tgt' }, { op: 'undo', d: 'tgt', n: 2 }] : []),
    ]);
    api(`merge-stream-${v}-${tag}`, services, [G(tgt, 'string', 'tgt'), { name: 'ext', src: `docs/${ext}`, load: 'copy', path: ext }], [
      { op: 'mergeStream', d: 'tgt', er: { alias: 'ext' }, from: `file:${ext}` },
      { op: 'mergeStream', d: 'tgt', er: { alias: 'Base' }, from: `file:${ext}`, auto: true },
      { op: 'svc' },
    ]);
  }
  // twice from the same file: the resolver keeps the document it disposed
  for (const services of [[], ['extref']]) {
    api(`merge-twice-${v}-${services.join('+') || 'none'}`, services, [
      G(tgt, 'file', 'tgt'),
      { name: 'tgt2', src: `docs/${tgt}`, load: 'file', path: `a\\${tgt.replace('.aml', '-2.aml')}` },
      { name: 'ext', src: `docs/${ext}`, load: 'copy', path: `a\\${ext}` },
    ], [
      { op: 'merge', d: 'tgt', er: { alias: 'ext' } },
      { op: 'svc' },
      { op: 'merge', d: 'tgt2', er: { alias: 'ext' } },
      { op: 'svc' },
    ]);
  }
}
// other CAEX version: both overloads, with and without autoTransform, with a registered transformer
for (const [tgt, ext, tag] of [
  ['mt30x.aml', 'ext215.aml', '30from215'],
  ['mt215x.aml', 'ext30.aml', '215from30'],
]) {
  for (const auto of [undefined, false, true]) {
    for (const services of [[], ['transform']]) {
      const name = `transform-${tag}-${auto}-${services.join('+') || 'none'}`;
      api(name, services, [G(tgt, 'file', 'tgt'), { name: 'ext', src: `docs/${ext}`, load: 'copy', path: `a\\${ext}` }], [
        { op: 'merge', d: 'tgt', er: { alias: 'ext' }, ...(auto === undefined ? {} : { auto }) },
        { op: 'svc' },
      ]);
      api(`${name}-stream`, services, [G(tgt, 'string', 'tgt'), { name: 'ext', src: `docs/${ext}`, load: 'copy', path: ext }], [
        { op: 'mergeStream', d: 'tgt', er: { alias: 'ext' }, from: `file:${ext}`, ...(auto === undefined ? {} : { auto }) },
        { op: 'svc' },
      ]);
    }
  }
}
// schema versions that do not parse; registered merge and validator services
api('merge-badversion', ['merge', 'validator'], [
  G('mt30.aml', 'file', 'tgt'),
  G('mtbadver.aml', 'file', 'bad'),
  { name: 'ext', src: 'docs/ext30.aml', load: 'copy', path: 'a\\ext30.aml' },
  { name: 'extbad', src: 'docs/extbadver.aml', load: 'copy', path: 'a\\extbadver.aml' },
], [
  { op: 'addER', d: 'tgt', alias: 'bad', path: 'extbadver.aml' },
  { op: 'merge', d: 'tgt', er: { alias: 'bad' } },
  { op: 'merge', d: 'bad', er: { alias: 'ext' } },
  { op: 'mergeStream', d: 'bad', er: { alias: 'ext' }, from: 'file:a\\extbadver.aml' },
  { op: 'svc' },
  { op: 'merge', d: 'tgt', er: { alias: 'ext' } },
  { op: 'svc' },
]);
// stream errors: null stream, not a CAEX document, null document
api('merge-stream-errors', [], [G('mt30.aml', 'string', 'tgt'), { name: 'ext', src: 'docs/ext30.aml', load: 'copy', path: 'ext30.aml' }], [
  { op: 'mergeStream', d: 'tgt', er: { alias: 'ext' }, from: 'null' },
  { op: 'mergeStream', d: 'tgt', er: { alias: 'ext' }, from: 'text:<a/>' },
  { op: 'mergeStream', d: 'tgt', er: { alias: 'ext' }, from: 'text:no xml' },
  { op: 'mergeStream', d: 'null', er: { alias: 'ext' }, from: 'file:ext30.aml' },
  { op: 'mergeStream', d: 'null', er: { alias: 'ext' }, from: 'file:ext30.aml', auto: true },
  { op: 'merge', d: 'tgt', er: 'none' },
  { op: 'svc' },
]);
// split and merge back with added references to an existing alias and a new external reference
api('split-merge-aliases', ['uniquename'], [G('g30-3.aml', 'file')], [
  { op: 'addER', d: 'src', alias: 'lib', path: 'Old.aml' },
  { op: 'set', d: 'src', s: { k: 'SUCL', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'RCL', i: 1 } },
  { op: 'set', d: 'src', s: { k: 'IE', i: 4 } },
  { op: 'split', d: 'src', alias: 'lib', path: '<W>\\a\\part.aml', as: 'part' },
  { op: 'merge', d: 'src', er: 'last' },
  { op: 'merge', d: 'src', er: { alias: 'lib' } },
  { op: 'svc' },
]);
// library versions decide whether a library is imported
api('merge-versions', [], [G('g30-4.aml', 'file')], [
  { op: 'set', d: 'src', s: { k: 'ICL', i: 0 } },
  { op: 'set', d: 'src', s: { k: 'RCL', i: 0 } },
  { op: 'split', d: 'src', alias: 'v', path: '<W>\\a\\v.aml', as: 'part' },
  { op: 'load', as: 'copy', path: '<W>\\a\\v.aml' },
  { op: 'setVersion', d: 'copy', s: { k: 'ICL', i: 0 }, value: '9.0' },
  { op: 'setVersion', d: 'copy', s: { k: 'RCL', i: 0 }, value: 'nine' },
  { op: 'save', d: 'copy', path: '<W>\\a\\v.aml' },
  { op: 'addLib', d: 'src', kind: 'ICL', s: { k: 'ICL', i: 0, d: 'copy' }, version: '1.0' },
  { op: 'merge', d: 'src', er: 'last' },
  { op: 'svc' },
]);

writeFileSync(join(dir, 'cases.json'), JSON.stringify(cases, null, 1) + '\n');
console.log(`${cases.length} cases, ${generated.length} documents`);
