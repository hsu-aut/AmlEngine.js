// Generates the inputs of the coverage gap package "gapsservices" (oracle/GapsServicesOracle*.cs,
// test/engine/gapsservices.oracle.test.ts):
//   profiles.json   JSON texts for AMLLibraryServerProfile.LoadFromString
//   hashes.json     password hashes (AES-256-CBC as PasswordProtected, IVs from a seeded PRNG)
//                   plus damaged hashes, decrypted by both engines
//   streaming/*.aml library documents with version references for DocumentStreaming
//   packages/*.zip  OPC packages for the System.IO.Packaging port
//   node scripts/gen-gapsservices.mjs <outDir> [seed]
import { createCipheriv, createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { zipSync, strToU8 } from 'fflate';

const [out = 'test/gapsservices', seedArg = '3682'] = process.argv.slice(2);
let seed = Number(seedArg);
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const bytes = (n) => Uint8Array.from({ length: n }, () => Math.floor(rnd() * 256));

mkdirSync(out, { recursive: true });

// ---- password hashes ----------------------------------------------------------------------------

const key = createHash('sha256').update('uisfrzxxxj1112*34fgJ', 'utf8').digest();
function protect(plain) {
  const iv = bytes(16);
  const c = createCipheriv('aes-256-cbc', key, iv);
  const body = Buffer.concat([c.update(Buffer.from(plain, 'utf8')), c.final()]);
  return Buffer.concat([Buffer.from(iv), body]).toString('base64');
}
const plains = ['secret', 'p', 'pässwörd €', 'a'.repeat(15), 'b'.repeat(16), 'c'.repeat(33), ' spaces ', '日本語', 'line\nbreak', '\u0000nul'];
const hashes = plains.map((plain) => ({ plain, hash: protect(plain) }));
const damaged = [
  '', 'not base64!', 'AAAA', Buffer.from(bytes(15)).toString('base64'), Buffer.from(bytes(16)).toString('base64'),
  Buffer.from(bytes(17)).toString('base64'), Buffer.from(bytes(32)).toString('base64'), Buffer.from(bytes(48)).toString('base64'),
  hashes[0].hash.slice(0, -4), hashes[0].hash + '====', ' ' + hashes[1].hash, hashes[2].hash.replace(/[A-Z]/, 'a'),
];
for (const hash of damaged) hashes.push({ plain: null, hash });
writeFileSync(join(out, 'hashes.json'), JSON.stringify(hashes, null, 2));

// ---- profiles -----------------------------------------------------------------------------------

const data = (ct, ed, extra = {}) => ({ AutomationMLEdition: ed, ContentType: ct, Folder: 'F' + ct, UserName: null, BranchOrTag: null, PasswordHash: null, ...extra });
const full = {
  UserName: 'user<&>\'"+`é\u0001',
  AccessRights: 1,
  NetworkProtocol: 4,
  ServerName: 'github.com',
  ServiceName: 'svc',
  PortNumber: 8080,
  BaseAddress: 'repo/%UserName/x',
  LibraryData: [data(0, 0), data(0, 2, { UserName: 'libuser', PasswordHash: hashes[1].hash })],
  BackupData: data(6, 2, { Folder: 'Backups' }),
  LibraryCollectionData: [data(1, 1)],
  ExampleData: [data(2, 2, { BranchOrTag: 'v1' })],
  AdministrationData: [data(3, 2), data(4, 2), data(5, 2)],
  BranchName: 'dev',
  IsPublicRepository: true,
  PasswordHash: hashes[0].hash,
};
const profiles = [
  JSON.stringify(full),
  JSON.stringify(full, null, 2),
  '{}',
  '{"UserName":"anonymous","ServerName":"srv","ServiceName":null}',
  '{"UserName":"a","ServerName":"srv","ServiceName":""}',
  '{"Foo":1,"UserName":"x","Bar":{"a":[1,2]}}',
  '{"UserName":5}',
  '{"PortNumber":"80"}',
  '{"PortNumber":1.5}',
  '{"PortNumber":3000000000}',
  '{"PortNumber":-0}',
  '{"PortNumber":1e2}',
  '{"PortNumber":1.0}',
  '{"AccessRights":"ReadAccess"}',
  '{"AccessRights":7}',
  '{"NetworkProtocol":-1}',
  '{"IsPublicRepository":"true"}',
  '{"IsPublicRepository":null}',
  '{"LibraryData":{}}',
  '{"LibraryData":[1]}',
  '{"LibraryData":[null]}',
  '{"LibraryData":null,"ExampleData":null}',
  '{"BackupData":[]}',
  '{"BackupData":{"ContentType":"x"}}',
  '{"BackupData":{"AutomationMLEdition":2,"ContentType":6,"Folder":"B","UserName":"u","BranchOrTag":"t","PasswordHash":null,"Other":true}}',
  '{"username":"lower"}',
  '{"UserName":"a","UserName":"b"}',
  '﻿{"UserName":"bom"}',
  '﻿﻿{"UserName":"bom2"}',
  '{"UserName":"nul"}\u0000\u0000',
  '\u0000{"UserName":"nul"}',
  '',
  '   ',
  '\u0000\u0000',
  '{\u0000"',
  '{"UserName":"a\u0000"}',
  '{"UserName":"esc\\u0000"}',
  '{',
  '[]',
  'null',
  'true',
  '"str"',
  '{"UserName":"x",}',
  '{/*c*/}',
  "{'UserName':'x'}",
  '{"UserName":"\\ud800"}',
  '{"UserName":"\\u00e9\\n\\t"}',
  ' \r\n {"ServerName":"s"} \r\n ',
  '{"ServerName":"s"} x',
  // Syntax errors (messages and positions of Utf8JsonReader).
  '{"UserName" "x"}',
  '{"UserName":}',
  '{"UserName":tru}',
  '{"UserName":nul}',
  '{"UserName":fals}',
  '{"UserName":"x"',
  '{"UserName":"x',
  '{"UserName":',
  '{"UserName"',
  '{"UserName',
  '{"UserName":"x\\q"}',
  '{"UserName":"x\\u12G4"}',
  '{"UserName":"a\tb"}',
  '{"UserName":"aé\u0001b"}',
  '{"PortNumber":01}',
  '{"PortNumber":-}',
  '{"PortNumber":1.}',
  '{"PortNumber":1e}',
  '{"PortNumber":1e+}',
  '{"PortNumber":+1}',
  '{"PortNumber":1x}',
  '{"PortNumber":-a}',
  '{"PortNumber":1',
  '{"PortNumber":1.5e3}',
  '{"LibraryData":[{},]}',
  '{"LibraryData":[{}',
  '{"LibraryData":[}',
  '{"LibraryData":[{"Folder":"a",}]}',
  '{"LibraryData":[{"Folder":5}]}',
  '{"LibraryData":[{},{"ContentType":1e1}]}',
  '}',
  ']',
  '/',
  '/x',
  'x',
  '{"a":1]',
  '[1}',
  '{"UserName":"x"}}',
  '{"Foo":[1,2,{"x":tru}]}',
  '{"Foo":{"a":1,}}',
  '{"Foo.Bar":5,"UserName":6}',
  '{"Foo":1,"a b":[}',
  '{\n  "UserName": 5\n}',
  '{\r\n\t"ServerName": "s",\n  "PortNumber": "x"\n}',
  '{"UserName":"éé€","PortNumber":"x"}',
  '{"UserName":"😀","PortNumber":"x"}',
  '{"UserName":"\\ud800\\udc00"}',
  '{"UserName":"\\udc00"}',
  '{"Password":"x","IsAnonymous":true,"CanTryLogin":1}',
  '{"PortNumber":2147483647}',
  '{"PortNumber":-2147483648}',
  '{"PortNumber":-2147483649}',
  '{"PortNumber":1E2}',
  '{"AccessRights":1.0}',
  '{"AccessRights":null}',
  '{"PortNumber":null}',
  '{"BranchName":null,"BaseAddress":"x","ServiceName":"y","ServerName":"z"}',
  '{"UserName":"x"}\n\n',
  '{"UserName":"x"} ',
  ' {"UserName":"x"}',
  '\t{"UserName":"x"}',
  'null x',
  '{"LibraryData":[null,{"AutomationMLEdition":1}],"LibraryData":[]}',
  '{"BackupData":{"Folder":"a"},"BackupData":null}',
  '{"UserName":"\\/\\b\\f\\n\\r\\t\\"\\\\"}',
  '{"UserName":"x","UserName":5}',
  '{"UserName":"x",,"a":1}',
  '{,}',
  '[,]',
  '{"LibraryData":[1,,]}',
  '{"Foo":"\\x"}',
  '{"Foo":"a\u0001"}',
  '{"Foo":[}',
  '{"Foo":01}',
  '{"Foo":}',
  '{"Foo":tru}',
  '{"a":1 "b":2}',
  // End of data inside tokens.
  '{"PortNumber":-',
  '{"PortNumber":1.',
  '{"PortNumber":1e',
  '{"PortNumber":1e-',
  '-',
  '1.',
  '12',
  '0 ',
  '{"UserName":"x",',
  '{"LibraryData":[{},',
  'tr',
  '{"UserName":nu',
  '"abc',
  '{"a":"\\u12',
  '{"a":"\\',
  '{"a" :',
  '{"a":[1 2]}',
  '{"a":[1,2]]}',
];
writeFileSync(join(out, 'profiles.json'), JSON.stringify(profiles, null, 2));

// ---- XML signatures ------------------------------------------------------------------------------

const dsig = 'http://www.w3.org/2000/09/xmldsig#';
const signatures = [
  `<Signature Id='s1' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='alg' /></SignedInfo><SignatureValue> AB CD\n EF\t</SignatureValue><KeyInfo><KeyValue><RSAKeyValue>m1</RSAKeyValue></KeyValue></KeyInfo></Signature>`,
  `<Signature Id='s2' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='alg' /></SignedInfo><SignatureValue>V</SignatureValue></Signature>`,
  `<Signature Id='s3' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='alg' /></SignedInfo><SignatureValue>V</SignatureValue><KeyInfo><KeyValue><RSAKeyValue>a</RSAKeyValue></KeyValue></KeyInfo><KeyInfo><KeyValue><RSAKeyValue>b</RSAKeyValue></KeyValue></KeyInfo></Signature>`,
  `<Signature Id='s4' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='alg' /></SignedInfo><SignatureValue>V</SignatureValue><KeyInfo></KeyInfo></Signature>`,
  `<Signature Id='s5' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='alg' /></SignedInfo><SignatureValue>V</SignatureValue><KeyInfo><KeyValue /><KeyValue /></KeyInfo></Signature>`,
  `<Signature Id='s6' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='alg' /></SignedInfo><SignatureValue>V</SignatureValue><KeyInfo><KeyValue><Other>x</Other><RSAKeyValue>r</RSAKeyValue><RSAKeyValue>r2</RSAKeyValue></KeyValue></KeyInfo></Signature>`,
  `<Signature xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='alg' /></SignedInfo><SignatureValue>V</SignatureValue></Signature>`,
  `<ds:Signature ds:Id='s8' xmlns:ds='${dsig}'><ds:SignedInfo><ds:SignatureMethod ds:Algorithm='a8' /></ds:SignedInfo><ds:SignatureValue>V8</ds:SignatureValue></ds:Signature>`,
  `<Sig Id='s9' xmlns='${dsig}' />`,
  `<Signature Id='s10' xmlns='urn:other'><SignedInfo><SignatureMethod Algorithm='alg' /></SignedInfo><SignatureValue>V</SignatureValue></Signature>`,
  `<Signature Id='s11' xmlns='${dsig}'><SignatureValue>V</SignatureValue></Signature>`,
  `<Signature Id='s12' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='a' /></SignedInfo><SignedInfo><SignatureMethod Algorithm='b' /></SignedInfo><SignatureValue>V</SignatureValue></Signature>`,
  `<Signature Id='s13' xmlns='${dsig}'><SignedInfo /><SignatureValue>V</SignatureValue></Signature>`,
  `<Signature Id='s14' xmlns='${dsig}'><SignedInfo><SignatureMethod /></SignedInfo><SignatureValue>V</SignatureValue></Signature>`,
  `<Signature Id='s15' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='a' /><SignatureMethod Algorithm='b' /></SignedInfo><SignatureValue>V</SignatureValue></Signature>`,
  `<Signature Id='s16' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='a' /></SignedInfo></Signature>`,
  `<Signature Id='s17' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='a' /></SignedInfo><SignatureValue>A</SignatureValue><SignatureValue>B</SignatureValue></Signature>`,
  `<Signature Id='s18'><SignedInfo><SignatureMethod Algorithm='a' /></SignedInfo><SignatureValue>V</SignatureValue></Signature>`,
  `<Signature Id='' xmlns='${dsig}'><SignedInfo><SignatureMethod Algorithm='' /></SignedInfo><SignatureValue></SignatureValue></Signature>`,
  `<Signature Id='s20' xmlns='${dsig}'><!-- c --><SignedInfo><SignatureMethod Algorithm='a' /></SignedInfo><SignatureValue>A<!-- x -->B<![CDATA[ C ]]></SignatureValue></Signature>`,
  `<Signature Id='s21'`,
  ``,
];
writeFileSync(join(out, 'signatures.json'), JSON.stringify(signatures, null, 2));

// ---- streaming documents ------------------------------------------------------------------------

mkdirSync(join(out, 'streaming'), { recursive: true });
const ref = (alias, path, version, description) =>
  `  <ExternalReference Path="${path}"${alias === null ? '' : ` Alias="${alias}"`}>${description ? `<Description>${description}</Description>` : ''}${version ? `<Version>${version}</Version>` : ''}</ExternalReference>\n`;
const rev = (tag, value) => `<Revision><RevisionDate>2020-01-01T00:00:00</RevisionDate><${tag}>${value}</${tag}><AuthorName>a</AuthorName></Revision>`;
function doc30(fileName, refs, libs) {
  return `<?xml version="1.0" encoding="utf-8"?>
<CAEXFile SchemaVersion="3.0" FileName="${fileName}" xmlns="http://www.dke.de/CAEX">
  <SuperiorStandardVersion>AutomationML 2.10</SuperiorStandardVersion>
  <SourceDocumentInformation OriginName="gen" OriginID="gen" OriginVersion="1" LastWritingDateTime="2020-01-01T00:00:00" />
${refs}${libs}</CAEXFile>
`;
}
const base = 'AML_Test_RoleClassLib_AMLEd2';
const refs = [
  ref('Old', `${base}_1.1.0.aml`, 'OldVersion'),
  ref('New', `${base}_2.0.0.aml`, 'NewVersion'),
  ref('Beta', `${base}_1.2.0-beta.aml`, null, 'VersionRef'),
  ref('Rc', `${base}_1.2.0-rc.aml`, null, 'Version Reference'),
  ref('Plain', 'Lib.aml', null),
  ref('Ext', 'Other.aml', 'Extension'),
  ref('Bad', `${base}_x.y.aml`, 'NewVersion'),
  ref('Ext6', 'AML_Test_RoleClassLib_Ext_AMLEd2_1.3.0.aml', 'NewVersion'),
  ref('Same', `${base}_1.2.0.aml`, 'OldVersion'),
  ref('Esc', `${base}_1.5.0%20x.aml`, 'NewVersion'),
].join('');
const libs = `  <InstanceHierarchy Name="IH"><InternalElement Name="IE" ID="ie1" /></InstanceHierarchy>
  <RoleClassLib Name="RCL"><Version>1.2.0</Version>${rev('NewVersion', 'New@RCL')}${rev('OldVersion', 'Old@RCL')}${rev('OldVersion', 'Beta@RCL')}${rev('Comment', 'none')}<RoleClass Name="R1" /><RoleClass Name="R2" /></RoleClassLib>
  <SystemUnitClassLib Name="SUCL">${rev('NewVersion', 'Rc@SUCL')}${rev('NewVersion', 'Unknown@SUCL')}<SystemUnitClass Name="S" /></SystemUnitClassLib>
  <InterfaceClassLib Name="ICL">${rev('OldVersion', 'Ext6@ICL')}<InterfaceClass Name="I" /></InterfaceClassLib>
  <AttributeTypeLib Name="ATL">${rev('NewVersion', 'Same@ATL')}${rev('NewVersion', 'Esc@ATL')}${rev('NewVersion', 'Bad@ATL')}<AttributeType Name="A" /></AttributeTypeLib>
`;
writeFileSync(join(out, 'streaming', `${base}_1.2.0.aml`), doc30(`${base}_1.2.0.aml`, refs, libs));
writeFileSync(join(out, 'streaming', 'AML_Test_RoleClassLib_Ext_AMLEd2_1.2.5.aml'), doc30('ext.aml', refs, libs));
writeFileSync(join(out, 'streaming', 'noversion.aml'), doc30('noversion.aml', refs, libs));
writeFileSync(join(out, 'streaming', `${base}_1.2.0-alpha.aml`), doc30('alpha.aml', refs, libs));
// Revisions only (all references resolved by revisions before the libraries end), and no alias.
writeFileSync(join(out, 'streaming', `${base}_0.9.0.aml`), doc30('rev.aml', ref('New', `${base}_2.0.0.aml`, 'NewVersion') + ref('Old', `${base}_0.1.0.aml`, 'OldVersion'), `  <RoleClassLib Name="RCL">${rev('NewVersion', 'New@RCL')}${rev('OldVersion', 'Old@RCL')}${rev('NewVersion', 'Late@RCL')}</RoleClassLib>\n  <RoleClassLib Name="RCL2">${rev('NewVersion', 'Other@RCL')}</RoleClassLib>\n`));
writeFileSync(join(out, 'streaming', `${base}_1.0.0.aml`), doc30('noalias.aml', ref(null, `${base}_2.0.0.aml`, 'NewVersion'), ''));
writeFileSync(
  join(out, 'streaming', 'AML_Test_Lib_AMLEd1_1.0.0.aml'),
  `<?xml version="1.0" encoding="utf-8"?>
<CAEXFile FileName="x.aml" SchemaVersion="2.15">
  <AdditionalInformation AutomationMLVersion="2.0" />
  <ExternalReference Path="AML_Test_Lib_AMLEd1_2.0.0.aml" Alias="New"><Version>NewVersion</Version></ExternalReference>
  <ExternalReference Path="AML_Test_Lib_AMLEd1_0.5.0.aml" Alias="Old"><Version>OldVersion</Version></ExternalReference>
  <InstanceHierarchy Name="IH"><InternalElement Name="IE" ID="ie1"><ExternalInterface Name="E" ID="e1" /></InternalElement></InstanceHierarchy>
  <RoleClassLib Name="RCL"><Version>1.0.0</Version><Revision RevisionDate="2020-01-01T00:00:00" NewVersion="New@RCL" AuthorName="a" /><RoleClass Name="R" /></RoleClassLib>
</CAEXFile>
`,
);
writeFileSync(join(out, 'streaming', 'broken.aml'), '<?xml version="1.0"?><CAEXFile><ExternalReference Alias="A" Path="p"><Version>NewVersion</Version></ExternalReference><RoleClassLib');

// ---- OPC packages -------------------------------------------------------------------------------

mkdirSync(join(out, 'packages'), { recursive: true });
const ct = (body) =>
  strToU8(`<?xml version="1.0" encoding="utf-8"?><!-- comment --><?pi data?>\r\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\r\n  ${body}\r\n</Types>`);
const rels = (body) => strToU8(`<?xml version="1.0" encoding="utf-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${body}</Relationships>`);
const rel = (id, target, type = 'http://example.com/rel', mode = '') => `<Relationship Type="${type}" Target="${target}" Id="${id}"${mode ? ` TargetMode="${mode}"` : ''} />`;
const defaults =
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml" /><Default Extension="xml" ContentType="text/xml" /><Default Extension="txt" ContentType="text/plain" />';
const zip = (name, files) => writeFileSync(join(out, 'packages', name), zipSync(files, { level: 0, mtime: new Date(2020, 0, 1) }));
zip('valid.zip', {
  '[Content_Types].xml': ct(defaults + '<!-- inner --><Override PartName="/a.xml" ContentType="application/x-a+xml" /><Override PartName="/c/d.xml" ContentType="application/x-d+xml" />'),
  '_rels/.rels': rels(rel('rId1', '/a.xml') + rel('rId2', 'http://example.com/x', 'http://example.com/ext', 'External') + rel('rId3', 'b.txt', 'http://example.com/other')),
  'a.xml': strToU8('<a>1</a>'),
  '_rels/a.xml.rels': rels(rel('r2', 'b.txt') + rel('r3', 'c/d.xml', 'http://example.com/d')),
  'b.txt': strToU8('bee'),
  'c/d.xml': strToU8('<d/>'),
  'orphan.bin': strToU8('orphan'),
  'other/orphan2.bin': strToU8('orphan2'),
  'noext': strToU8('noext'),
});
zip('override-attr.zip', {
  '[Content_Types].xml': ct(defaults + '<Override PartName="/a.xml" ContentType="text/xml" Extra="1" />'),
  'a.xml': strToU8('<a/>'),
});
zip('override-missing.zip', {
  '[Content_Types].xml': ct(defaults + '<Override ContentType="text/xml" Other="/a.xml" />'),
  'a.xml': strToU8('<a/>'),
});
zip('default-attr.zip', {
  '[Content_Types].xml': ct('<Default Extension="xml" />'),
  'a.xml': strToU8('<a/>'),
});
zip('bad-root.zip', { '[Content_Types].xml': strToU8('<Other xmlns="urn:x" />'), 'a.xml': strToU8('<a/>') });
zip('text-in-types.zip', { '[Content_Types].xml': ct(defaults + 'text'), 'a.xml': strToU8('<a/>') });
zip('dup-override.zip', {
  '[Content_Types].xml': ct(defaults + '<Override PartName="/a.xml" ContentType="text/xml" /><Override PartName="/A.XML" ContentType="application/x-second+xml" /><Override PartName="/a.xml" ContentType="application/x-third+xml" />'),
  'a.xml': strToU8('<a/>'),
});
zip('no-types.zip', { 'a.xml': strToU8('<a/>') });
zip('case-mismatch.zip', {
  '[Content_Types].xml': ct(defaults + '<Override PartName="/a.xml" ContentType="application/x-lower+xml" /><Override PartName="/B.XML" ContentType="application/x-upper+xml" />'),
  'A.xml': strToU8('<a/>'),
  'b.xml': strToU8('<b/>'),
  'c.txt': strToU8('c'),
});
console.log(`${hashes.length} hashes, ${profiles.length} profiles written to ${out}`);
