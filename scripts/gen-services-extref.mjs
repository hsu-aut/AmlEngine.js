// Generates the cases of the external reference resolver verification (svc-extref oracle,
// test/services/extref.oracle.test.ts): the AML files the cases load, the scripted cases
// (cases.json), the URIs for Uri.GetComponents (uris.json) and the live GitHub cases (live.json).
//
//   node scripts/gen-services-extref.mjs [outDir=test/services/extref] [seed=3682]
//
// A case is a list of steps [op, ...args] (all arguments strings or null), run in order by the
// oracle and by the port, each recording one line. A step can be {s: [...], port: "<line>"}: the
// port's documented result where it deviates from the original (docs/coverage-notes/services-extref.md).
// Placeholders in arguments: <IN> the case folder (native separators), <INU> the same with '/',
// <FILE> its file URI, <BASE> the base URL of test/services/extref-server.mjs, <CORPUS> test/corpus.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(process.argv[2] ?? join(root, 'test', 'services', 'extref'));
const seed = Number(process.argv[3] ?? 3682);

function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(seed);
const pick = (a) => a[Math.floor(rnd() * a.length)];

// ---------------------------------------------------------------- AML files

function caex(fileName, body) {
  const name = fileName === null ? '' : ` FileName="${fileName}"`;
  return `<?xml version="1.0" encoding="utf-8"?>
<CAEXFile${name} SchemaVersion="3.0" xsi:schemaLocation="http://www.dke.de/CAEX CAEX_ClassModel_V.3.0.xsd" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns="http://www.dke.de/CAEX">
  <SuperiorStandardVersion>AutomationML 2.10</SuperiorStandardVersion>
  <SourceDocumentInformation OriginName="gen-services-extref" OriginID="extref" OriginVersion="1.0" LastWritingDateTime="2024-01-01T00:00:00" OriginRelease="1.0" />
${body}</CAEXFile>
`;
}

const files = {
  'Main.aml': caex(
    'Main.aml',
    `  <ExternalReference Path="libs/Lib1.aml" Alias="L1" />
  <ExternalReference Path="libs/Lib2.aml" Alias="L2" />
  <ExternalReference Path="libs/Missing.aml" Alias="MISS" />
  <InstanceHierarchy Name="IH">
    <InternalElement Name="E1" ID="id-main-e1" RefBaseSystemUnitPath="L1@SUCLib1/Base">
      <ExternalInterface Name="X1" ID="id-main-x1" RefBaseClassPath="L2@IfLib2/If2" />
      <SupportedRoleClass RefRoleClassPath="L1@RoleLib1/Role1" />
    </InternalElement>
    <InternalElement Name="E2" ID="id-main-e2" RefBaseSystemUnitPath="MISS@Nope/Nope" />
    <InternalElement Name="E3" ID="id-main-e3" RefBaseSystemUnitPath="NOALIAS@X/Y" />
    <InternalElement Name="E4" ID="id-main-e4" />
  </InstanceHierarchy>
  <InterfaceClassLib Name="IfMain">
    <InterfaceClass Name="IfM" ID="id-main-ifm" RefBaseClassPath="L2@IfLib2/If2" />
  </InterfaceClassLib>
  <RoleClassLib Name="RoleMain">
    <RoleClass Name="RoleM" ID="id-main-rolem" RefBaseClassPath="L1@RoleLib1/Role1" />
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCMain">
    <SystemUnitClass Name="Derived" ID="id-main-derived" RefBaseClassPath="L1@SUCLib1/Base" />
    <SystemUnitClass Name="Derived2" ID="id-main-derived2" RefBaseClassPath="L1@SUCLib1/Sub" />
    <SystemUnitClass Name="Local" ID="id-main-local" />
  </SystemUnitClassLib>
`,
  ),
  'libs/Lib1.aml': caex(
    'Lib1.aml',
    `  <ExternalReference Path="Lib2.aml" Alias="L2" />
  <InterfaceClassLib Name="IfLib1">
    <InterfaceClass Name="If1" ID="id-lib1-if1" RefBaseClassPath="L2@IfLib2/If2" />
  </InterfaceClassLib>
  <RoleClassLib Name="RoleLib1">
    <RoleClass Name="Role1" ID="id-lib1-role1" />
    <RoleClass Name="Role1b" ID="id-lib1-role1b" RefBaseClassPath="RoleLib1/Role1" />
  </RoleClassLib>
  <SystemUnitClassLib Name="SUCLib1">
    <SystemUnitClass Name="Base" ID="id-lib1-base">
      <InternalElement Name="Part" ID="id-lib1-part" RefBaseSystemUnitPath="SUCLib1/Other">
        <ExternalInterface Name="P1" ID="id-lib1-p1" RefBaseClassPath="L2@IfLib2/If2" />
      </InternalElement>
    </SystemUnitClass>
    <SystemUnitClass Name="Sub" ID="id-lib1-sub" RefBaseClassPath="SUCLib1/Base" />
    <SystemUnitClass Name="Other" ID="id-lib1-other" />
  </SystemUnitClassLib>
`,
  ),
  'libs/Lib2.aml': caex(
    'Lib2.aml',
    `  <InterfaceClassLib Name="IfLib2">
    <InterfaceClass Name="If2" ID="id-lib2-if2" />
  </InterfaceClassLib>
  <RoleClassLib Name="RoleLib2">
    <RoleClass Name="Role2" ID="id-lib2-role2" />
  </RoleClassLib>
`,
  ),
  'libs/Lib3.aml': caex(
    'Lib3.aml',
    `  <SystemUnitClassLib Name="SUCLib3">
    <SystemUnitClass Name="S3" ID="id-lib3-s3" />
  </SystemUnitClassLib>
`,
  ),
  'libs/Dup.aml': caex(
    'Lib1.aml',
    `  <SystemUnitClassLib Name="SUCDup">
    <SystemUnitClass Name="D" ID="id-dup-d" />
  </SystemUnitClassLib>
`,
  ),
  'libs/NoName.aml': caex(
    null,
    `  <RoleClassLib Name="RoleLibNN">
    <RoleClass Name="NN" ID="id-nn" />
  </RoleClassLib>
`,
  ),
  'libs/Alt.aml': caex(
    'Alt.aml',
    `  <SystemUnitClassLib Name="SUCLib1">
    <SystemUnitClass Name="Base" ID="id-alt-base" />
  </SystemUnitClassLib>
`,
  ),
  'ext/_AMLExternalLibraries/Inner.aml': caex(
    'Inner.aml',
    `  <ExternalReference Path="Ext.aml" Alias="E" />
  <ExternalReference Path="virtual.aml" Alias="V" />
`,
  ),
  'ext/_AMLExternalLibraries/Ext.aml': caex(
    'Ext.aml',
    `  <RoleClassLib Name="RoleExt">
    <RoleClass Name="RE" ID="id-ext-re" />
  </RoleClassLib>
`,
  ),
  'bad/NotAml.aml': 'this is not xml\n',
  'bad/Empty.aml': '',
};

// ---------------------------------------------------------------- cases

const cases = {};
const kase = (name, steps) => {
  if (cases[name]) throw new Error('duplicate case ' + name);
  cases[name] = steps;
};
/** A step where the port deviates from the original (documented), with the port's line. */
const dev = (s, port) => ({ s, port });

kase('register', [
  ['svc'],
  ['unreg'],
  ['svc'],
  ['reg'],
  ['svc'],
  ['locunreg'],
  ['svc'],
  ['unreg'],
  ['svc'],
  ['reg'],
  ['load', 'm', 'Main.aml'],
  ['lord', 'm', 'L1', 'l1'],
  ['unreg'],
  ['alive', 'l1'],
  ['resdocs', 'm'],
  ['lord', 'm', 'L1'],
  ['svc'],
]);

for (const mode of ['sync', 'async']) {
  const L = mode === 'sync' ? 'lord' : 'lorda';
  kase(`relative-${mode}`, [
    ['load', 'm', 'Main.aml'],
    [L, 'm', 'L1', 'l1'],
    [L, 'm', 'L1'],
    [L, 'm', 'L2', 'l2'],
    [L, 'm', 'MISS'],
    [L, 'm', 'MISS'],
    ['addref', 'm', 'CWD', 'test/services/extref/libs/Lib3.aml'],
    [L, 'm', 'CWD'],
    ['addref', 'm', 'CWDMISS', 'test/services/extref/libs/Nope.aml'],
    [L, 'm', 'CWDMISS'],
    ['addref', 'm', 'BACK', 'libs/../libs/Lib2.aml'],
    [L, 'm', 'BACK'],
    ['addref', 'm', 'BS', 'libs\\Lib2.aml'],
    [L, 'm', 'BS'],
    ['addref', 'm', 'SP', 'libs/Lib 2.aml'],
    [L, 'm', 'SP'],
    ['resdocs', 'm'],
    ['isreg', 'm', 'L1', 'libs/Lib1.aml'],
    ['isreg', 'm', 'L1', 'LIBS/LIB1.AML'],
    ['isreg', 'm', 'L1', 'libs/Lib2.aml'],
    ['isreg', 'm', 'MISS', 'libs/Missing.aml'],
  ]);
  kase(`absolute-${mode}`, [
    ['load', 'm', 'Main.aml'],
    ['addref', 'm', 'A1', '<IN>\\libs\\Lib2.aml'],
    [L, 'm', 'A1', 'a1'],
    ['addref', 'm', 'A2', '<INU>/libs/Lib2.aml'],
    [L, 'm', 'A2'],
    ['addref', 'm', 'A3', '<IN>\\libs\\Missing.aml'],
    [L, 'm', 'A3'],
    [L, 'm', 'A3'],
    ['addref', 'm', 'F1', '<FILE>/libs/Lib1.aml'],
    [L, 'm', 'F1'],
    ['addref', 'm', 'F2', '<FILE>/libs/Lib%33.aml'],
    [L, 'm', 'F2'],
    ['addref', 'm', 'F3', '<FILE>/libs/Missing.aml'],
    [L, 'm', 'F3'],
    ['addref', 'm', 'F4', 'file:///Z:/does/not/exist.aml'],
    [L, 'm', 'F4'],
    ['addref', 'm', 'U1', 'mailto:someone@example.com'],
    [L, 'm', 'U1'],
    ['addref', 'm', 'U2', 'urn:aml:lib'],
    [L, 'm', 'U2'],
    ['addref', 'm', 'FTP', 'ftp://127.0.0.1:1/lib.aml'],
    [L, 'm', 'FTP'],
    ['resdocs', 'm'],
    ['isreg', 'm', 'A1', '<IN>\\libs\\Lib2.aml'],
    ['isreg', 'm', 'A2', '<IN>\\libs\\Lib2.aml'],
  ]);
  kase(`bad-files-${mode}`, [
    ['load', 'm', 'Main.aml'],
    ['addref', 'm', 'NA', 'bad/NotAml.aml'],
    [L, 'm', 'NA'],
    [L, 'm', 'NA'],
    ['addref', 'm', 'EM', 'bad/Empty.aml'],
    [L, 'm', 'EM'],
    ['addref', 'm', 'NN', 'libs/NoName.aml'],
    [L, 'm', 'NN'],
    [L, 'm', 'NN'],
    [L, 'm', 'L1', 'l1'],
    ['addref', 'm', 'DUP', 'libs/Dup.aml'],
    [L, 'm', 'DUP', 'dup'],
    ['addref', 'm', 'EMPTY', ''],
    [L, 'm', 'EMPTY'],
    ['detach', 'm', 'L2', 'r2'],
    [mode === 'sync' ? 'lordr' : 'lordra', 'r2'],
    [mode === 'sync' ? 'lordnull' : 'lordanull'],
    ['resdocs', 'm'],
  ]);
  kase(`path-overload-${mode}`, [
    ['load', 'm', 'Main.aml'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', 'L1@SUCLib1/Base'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', 'L1@SUCLib1/Base'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', 'SUCLib1/Base'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', ''],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', null],
    [mode === 'sync' ? 'lordp' : 'lordpa', null, 'L1@SUCLib1/Base'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', 'ZZ@X/Y'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', 'L1@'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', '@X'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', 'L2@IfLib2/If2@x'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', 'MISS@Nope/Nope'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'm', 'l1@SUCLib1/Base'],
    ['load', 'old', '<CORPUS>/legacy-caex215.aml'],
    [mode === 'sync' ? 'lordp' : 'lordpa', 'old', 'X@Lib/Class'],
  ]);
}

// http(s): asynchronous calls load; a synchronous call needs the network (documented deviation).
const syncNet = (url) => `Error sending the request for ${url}\nSynchronous access to '${url}' needs the network; use the asynchronous methods.`;
kase('http-async', [
  ['load', 'm', 'Main.aml'],
  ['addref', 'm', 'H', '<BASE>/files/libs/Lib3.aml'],
  ['lorda', 'm', 'H', 'h'],
  ['lorda', 'm', 'H'],
  ['lord', 'm', 'H'],
  ['resolvea', '<BASE>/files/libs/Lib3.aml', 'true'],
  ['resolve', '<BASE>/files/libs/Lib3.aml', 'true'],
  ['isreg', 'm', 'H', '<BASE>/files/libs/Lib3.aml'],
  ['addref', 'm', 'H404', '<BASE>/files/libs/Nope.aml'],
  ['lorda', 'm', 'H404'],
  ['lorda', 'm', 'H404'],
  ['addref', 'm', 'H500', '<BASE>/status/500/x.aml'],
  ['lorda', 'm', 'H500'],
  ['addref', 'm', 'HW', '<BASE>/wrong/x.aml'],
  ['lorda', 'm', 'HW'],
  ['addref', 'm', 'HSLOW', '<BASE>/slow/150/files/libs/Lib2.aml'],
  ['lorda', 'm', 'HSLOW'],
  // The only lookup of an unknown host name (slow on some resolvers); the other failing requests
  // go to a closed port.
  ['addref', 'm', 'HINV', 'http://invalid.invalid/lib.aml'],
  ['lorda', 'm', 'HINV'],
  ['addref', 'm', 'HREF', 'http://127.0.0.1:1/lib.aml'],
  ['lorda', 'm', 'HREF'],
  ['addref', 'm', 'HREF6', 'http://[::1]:1/lib.aml'],
  ['lorda', 'm', 'HREF6'],
  ['addref', 'm', 'HTLS', '<BASE>/files/libs/Lib3.aml'.replace('<BASE>', 'https://127.0.0.1:48217')],
  ['lorda', 'm', 'HTLS'],
  ['addref', 'm', 'HQ', '<BASE>/files/libs/Lib2.aml?x=1#frag'],
  ['lorda', 'm', 'HQ'],
  ['addref', 'm', 'HCASE', 'HTTP://127.0.0.1:48217/files/libs/Lib1.aml'],
  ['lorda', 'm', 'HCASE'],
  ['resdocs', 'm'],
]);
// Each case stops where the states of the original and the port part (the original loaded what
// the port could not), so that only the marked steps differ.
kase('http-sync-load', [
  ['load', 'm', 'Main.aml'],
  ['addref', 'm', 'H', '<BASE>/files/libs/Lib3.aml'],
  dev(['lord', 'm', 'H'], `lord(m,H)=null|${syncNet('<BASE>/files/libs/Lib3.aml')}`),
  // the port did not record the address as unresolved: the asynchronous call loads it
  ['lorda', 'm', 'H', 'h'],
  ['lord', 'm', 'H'],
  ['resdocs', 'm'],
]);
kase('http-sync-404', [
  ['load', 'm', 'Main.aml'],
  ['addref', 'm', 'H404', '<BASE>/files/libs/Nope.aml'],
  dev(['lord', 'm', 'H404'], `lord(m,H404)=null|${syncNet('<BASE>/files/libs/Nope.aml')}`),
  dev(['lorda', 'm', 'H404'], 'lorda(m,H404)=null|NotFound: no response for <BASE>/files/libs/Nope.aml'),
  ['lorda', 'm', 'H404'],
]);
kase('http-sync-refused', [
  ['load', 'm', 'Main.aml'],
  ['addref', 'm', 'HINV', 'http://127.0.0.1:1/lib.aml'],
  dev(['lord', 'm', 'HINV'], `lord(m,HINV)=null|${syncNet('http://127.0.0.1:1/lib.aml')}`),
  dev(['lordp', 'm', 'HINV@X'], `lordp(m,HINV@X)=null|${syncNet('http://127.0.0.1:1/lib.aml')}`),
  dev(['lordpa', 'm', 'HINV@X'], 'lordpa(m,HINV@X)=null|: no response for http://127.0.0.1:1/lib.aml'),
]);
kase('http-sync-resolve', [
  dev(['resolve', '<BASE>/files/libs/Lib2.aml', 'true'], 'resolve(<BASE>/files/libs/Lib2.aml,true)=null|can not find file for <BASE>/files/libs/Lib2.aml'),
  // the original returns the cached document with the message field (""), the port loads it
  dev(['resolvea', '<BASE>/files/libs/Lib2.aml', 'true'], 'resolvea(<BASE>/files/libs/Lib2.aml,true)=doc(Lib2.aml|Lib2.aml|#1)|null'),
  dev(['resolve', '<BASE>/files/libs/Lib1.aml', 'false'], 'resolve(<BASE>/files/libs/Lib1.aml,false)=null|can not find file for <BASE>/files/libs/Lib1.aml'),
]);
kase('http-sync-can', [
  dev(['can', '<BASE>/files/libs/Lib1.aml'], 'can(<BASE>/files/libs/Lib1.aml)=false'),
  ['cana', '<BASE>/files/libs/Lib1.aml'],
  ['can', '<BASE>/files/libs/Nope.aml'],
  ['can', 'http://127.0.0.1:1/lib.aml'],
]);
kase('http-sync-engine', [
  ['load', 'm', 'Main.aml'],
  ['addref', 'm', 'H2', '<BASE>/files/libs/Lib1.aml'],
  dev(['extdoc', 'm', 'H2'], 'extdoc(m,H2)=null'),
  ['lorda', 'm', 'H2'],
  ['extdoc', 'm', 'H2'],
  ['find', 'm', 'H2@SUCLib1/Base'],
]);

// Status codes: the message names HttpStatusCode.
const codes = [];
for (const c of [200, 201, 203, 204, 209, 299]) codes.push(c);
for (let c = 300; c <= 308; c++) codes.push(c);
for (let c = 400; c <= 431; c++) codes.push(c);
for (const c of [451, 499]) codes.push(c);
for (let c = 500; c <= 511; c++) codes.push(c);
for (const c of [520, 599]) codes.push(c);
const statusSteps = [['load', 'm', 'Main.aml']];
for (const c of codes) {
  statusSteps.push(['addref', 'm', 'S' + c, `<BASE>/status/${c}/x.aml`]);
  // fetch turns a 407 answer into a network error (Fetch standard), HttpClient returns it.
  if (c === 407) statusSteps.push(dev(['lorda', 'm', 'S' + c], `lorda(m,S407)=null|: no response for <BASE>/status/407/x.aml`));
  else statusSteps.push(['lorda', 'm', 'S' + c]);
}
kase('http-status', statusSteps);

const getresp = [];
for (const c of [200, 204, 302, 404, 418, 500, 599]) getresp.push(['getresp', `<BASE>/status/${c}/x`]);
getresp.push(
  ['getresp', '<BASE>/files/libs/Lib3.aml'],
  ['getresp', '<BASE>/redirect/302/2/files/libs/Lib3.aml'],
  ['getresp', 'http://127.0.0.1:1/x'],
  ['getresp', 'http://[::1]:1/x'],
  ['getresp', 'ftp://127.0.0.1:1/x'],
  ['getresp', '<FILE>/libs/Lib3.aml'],
  ['getresp', 'libs/Lib3.aml'],
  ['getresp', 'mailto:a@b.c'],
);
kase('getresponse', getresp);

kase('http-redirect', [
  ['load', 'm', 'Main.aml'],
  ...[301, 302, 303, 307, 308].flatMap((c) => [
    ['addref', 'm', 'R' + c, `<BASE>/redirect/${c}/2/files/libs/Lib3.aml`],
    ['lorda', 'm', 'R' + c],
  ]),
  ['addref', 'm', 'R404', '<BASE>/redirect/302/1/files/libs/Nope.aml'],
  ['lorda', 'm', 'R404'],
  ['addref', 'm', 'RWRONG', '<BASE>/redirect/302/1/wrong/x'],
  ['lorda', 'm', 'RWRONG'],
  // 25 redirects: HttpClient follows up to 50, fetch up to 20 (documented deviation).
  ['addref', 'm', 'R25', '<BASE>/redirect/302/24/files/libs/Lib2.aml'],
  dev(['lorda', 'm', 'R25'], 'lorda(m,R25)=null|: no response for <BASE>/redirect/302/24/files/libs/Lib2.aml'),
  ['addref', 'm', 'R19', '<BASE>/redirect/302/18/files/libs/Lib2.aml'],
  ['lorda', 'm', 'R19'],
]);

const echoed = "auth=Basic Og==;url=/echo/it's?a=%27b%27&c=%22d%22";
kase('http-auth', [
  ['load', 'm', 'Main.aml'],
  ['addref', 'm', 'A1', 'http://user:pass@127.0.0.1:48217/auth/user/pass/files/libs/Lib3.aml'],
  ['lorda', 'm', 'A1'],
  ['addref', 'm', 'A2', '<BASE>/auth/user/pass/files/libs/Lib2.aml'],
  ['lorda', 'm', 'A2'],
  ['addref', 'm', 'A3', '<BASE>/auth/_/_/files/libs/Lib1.aml'],
  ['lorda', 'm', 'A3'],
  ['addref', 'm', 'A4', 'http://user:wrong@127.0.0.1:48217/auth/user/pass/files/libs/Lib1.aml'],
  ['lorda', 'm', 'A4'],
  ...[
    'http://u:p@127.0.0.1:48217/echo/1',
    'http://u@127.0.0.1:48217/echo/2',
    'http://u:p:x@127.0.0.1:48217/echo/3',
    'http://:p@127.0.0.1:48217/echo/4',
    'http://u:@127.0.0.1:48217/echo/5',
    'http://%41b:c%3Ad@127.0.0.1:48217/echo/6',
    'http://\u00fcser:p\u00e4ss@127.0.0.1:48217/echo/7',
    'http://u%20v:w@127.0.0.1:48217/echo/8',
    '<BASE>/echo/9',
    '<BASE>/echo/a%20b/c?q=1&r=%41#frag',
    '<BASE>/echo/x/../y/./z',
    '<BASE>/echo/%7e%2F',
    '<BASE>/echo/a b',
    '<BASE>/echo/\u00e4',
    "<BASE>/echo/it's?a='b'&c=\"d\"",
    '<BASE>/echo/q?x=<y>&z={w}|^`',
  ].flatMap((u, i) => [
    ['addref', 'm', 'E' + i, u],
    // fetch parses the URL again (WHATWG URL) and escapes "'" in the query, HttpClient sends it as is
    u.includes("?a='b'")
      ? dev(['lorda', 'm', 'E' + i, 'e' + i], `lorda(m,E${i},e${i})=doc(${echoed}|${echoed}|#18)|null`)
      : ['lorda', 'm', 'E' + i, 'e' + i],
  ]),
]);

for (const mode of ['sync', 'async']) {
  const R = mode === 'sync' ? 'resolve' : 'resolvea';
  const L = mode === 'sync' ? 'lord' : 'lorda';
  kase(`resolve-${mode}`, [
    ['load', 'm', 'Main.aml'],
    [R, '<IN>\\libs\\Lib2.aml', 'true'],
    [R, '<IN>\\libs\\Lib2.aml', 'true'],
    [R, '<IN>\\LIBS\\LIB2.AML', 'true'],
    [R, '<IN>\\libs\\Lib2.aml', 'false'],
    [R, '<IN>\\libs\\Lib2.aml', 'false'],
    [R, '<IN>\\libs\\Missing.aml', 'true'],
    [R, '<IN>\\libs\\Missing.aml', 'true'],
    [R, '<IN>\\libs\\Missing.aml', 'false'],
    [R, '<FILE>/libs/Lib1.aml', 'true'],
    [R, '<FILE>/libs/Lib1.aml', 'true'],
    [R, 'libs/Lib1.aml', 'true'],
    [R, 'test/services/extref/libs/Lib3.aml', 'true'],
    [R, 'test/services/extref/libs/Lib3.aml', 'true'],
    [R, 'test/services/extref/libs/Lib3.aml', 'false'],
    [R, null, 'true'],
    [R, null, 'true'],
    [R, null, 'false'],
    [R, '', 'true'],
    [R, '', 'false'],
    [R, 'mailto:x@y.z', 'true'],
    [R, 'ftp://127.0.0.1:1/x.aml', 'true'],
    [L, 'm', 'MISS'],
    [R, '<IN>\\libs\\Lib2.aml', 'true'],
    [R, '<IN>\\libs\\Dup.aml', 'true'],
    [R, '<IN>\\libs\\Lib1.aml', 'true'],
    [R, '<IN>\\libs\\NoName.aml', 'true'],
    [R, '<IN>\\libs\\NoName.aml', 'false'],
    [R, '<IN>\\bad\\NotAml.aml', 'true'],
    [L, 'm', 'L1'],
    ['resdocs', 'm'],
    // the URL keys of the registry compare with InvariantCultureIgnoreCase
    [R, '<IN>\\libs\\Li\u00adb2.aml', 'true'],
    [R, '<IN>\\libs\\Lib2\u200b.aml', 'true'],
  ]);
  const C = mode === 'sync' ? 'can' : 'cana';
  kase(`can-${mode}`, [
    [C, '<IN>\\libs\\Lib1.aml'],
    [C, '<IN>\\libs\\Missing.aml'],
    [C, '<INU>/libs/Lib1.aml'],
    [C, '<FILE>/libs/Lib1.aml'],
    [C, '<FILE>/libs/Missing.aml'],
    [C, 'test/services/extref/libs/Lib1.aml'],
    [C, 'libs/Lib1.aml'],
    [C, ''],
    [C, null],
    [C, 'mailto:x@y.z'],
    [C, 'ftp://127.0.0.1:1/x.aml'],
    mode === 'sync' ? dev([C, '<BASE>/files/libs/Lib1.aml'], 'can(<BASE>/files/libs/Lib1.aml)=false') : [C, '<BASE>/files/libs/Lib1.aml'],
    [C, '<BASE>/files/libs/Nope.aml'],
    [C, '<BASE>/status/500/x'],
    [C, 'http://127.0.0.1:1/x.aml'],
    [C, 'http://['],
    [C, '<IN>\\libs'],
    ['resolve', '<IN>\\libs\\Lib2.aml', 'true'],
    ['resolve', '<IN>\\libs\\Lib2.aml', 'true'],
    [C, '<IN>\\libs\\Missing.aml'],
    ['resolve', '<IN>\\libs\\Lib2.aml', 'true'],
  ]);
  kase(`redirect-${mode}`, [
    ['load', 'm', 'Main.aml'],
    ['setredir', 'libs/Lib1.aml', 'libs/Alt.aml'],
    ['addr', 'libs/Lib1.aml', 'm'],
    ['addr', 'libs/Lib1.aml', null],
    ['addr', 'LIBS/LIB1.AML', 'm'],
    [L, 'm', 'L1', 'alt'],
    ['find', 'm', 'L1@SUCLib1/Base'],
    ['clrredir', 'libs/Lib1.aml'],
    ['addr', 'libs/Lib1.aml', 'm'],
    ['setredir', 'libs/Lib2.aml', '<FILE>/libs/Alt.aml'],
    ['addr', 'libs/Lib2.aml', 'm'],
    ['setredir', 'libs/Missing.aml', '<IN>\\libs\\Lib3.aml'],
    ['addr', 'libs/Missing.aml', 'm'],
    [L, 'm', 'MISS'],
    ['setredir', 'a.aml', 'b.aml'],
    ['setredir', 'b.aml', 'c.aml'],
    ['setredir', 'x.aml', 'a.aml'],
    ['addr', 'a.aml', 'm'],
    ['addr', 'x.aml', 'm'],
    ['setredir', 'b.aml', 'libs/Nope.aml'],
    ['addr', 'b.aml', 'm'],
    ['setredir', '<BASE>/files/libs/Nope.aml', '<IN>\\libs\\Lib2.aml'],
    ['addr', '<BASE>/files/libs/Nope.aml', null],
    ['addref', 'm', 'HN', '<BASE>/files/libs/Nope.aml'],
    [L, 'm', 'HN'],
    ['setredir', '<BASE>/files/libs/Nope2.aml', '<BASE>/files/libs/Lib3.aml'],
    ['addr', '<BASE>/files/libs/Nope2.aml', 'm'],
    ['setredir', 'h.aml', 'http://127.0.0.1:48217/hop/one'],
    ['setredir', 'http://127.0.0.1:48217/hop/one', 'http://127.0.0.1:48217/hop/two'],
    ['setredir', 'http://127.0.0.1:48217/hop/two', '<IN>\\libs\\Lib1.aml'],
    ['addr', 'h.aml', 'm'],
    ['addr', 'http://127.0.0.1:48217/hop/one', null],
    ['setredir', 'g.aml', 'http://127.0.0.1:48217/hop/one'],
    ['addr', 'g.aml', null],
    ['setredir', 'k.aml', 'http://127.0.0.1:48217/hop/two'],
    ['addr', 'k.aml', null],
    ['setredir', 'rel.aml', 'libs/Lib2.aml'],
    ['addr', 'rel.aml', null],
    ['setredir', null, 'nullkey.aml'],
    ['addr', null, null],
    ['addr', null, 'm'],
    ['setredir', 'tonull.aml', null],
    ['addr', 'tonull.aml', 'm'],
    ['setredir', 'empty.aml', ''],
    ['addr', 'empty.aml', 'm'],
    ['setredir', 'mail.aml', 'mailto:a@b.c'],
    ['addr', 'mail.aml', 'm'],
    ['setredir', 'rooted.aml', '\\rooted\\x.aml'],
    ['addr', 'rooted.aml', 'm'],
    [R, 'libs/Lib2.aml', 'true'],
    [R, '<BASE>/files/libs/Nope.aml', 'true'],
    ['clrredir', null],
    ['addr', null, 'm'],
    ['clrall'],
    ['addr', 'a.aml', 'm'],
    ['addr', 'h.aml', 'm'],
    ['load', 'inner', 'ext/_AMLExternalLibraries/Inner.aml'],
    ['setredir', 'virtual.aml', '_AMLExternalLibraries\\Ext.aml'],
    ['addr', 'virtual.aml', 'inner'],
    [L, 'inner', 'V'],
    ['setredir', 'Ext.aml', '_AMLExternalLibraries/Missing.aml'],
    ['addr', 'Ext.aml', 'inner'],
    [L, 'inner', 'E'],
    ['addr', 'virtual.aml', 'nofile'],
    // the keys compare with InvariantCultureIgnoreCase
    ['setredir', 's\u00adoft.aml', 'libs/Lib2.aml'],
    ['addr', 'soft.aml', 'm'],
    ['setredir', 'Äb.aml', 'libs/Lib1.aml'],
    ['addr', 'äB.aml', 'm'],
    ['addr', 'Äb.aml', 'm'],
    ['setredir', 'I.aml', 'libs/Lib1.aml'],
    ['addr', 'ı.aml', 'm'],
    ['addr', 'i.aml', 'm'],
    ['setredir', 'tab	.aml', 'libs/Lib1.aml'],
    ['addr', 'tab.aml', 'm'],
    ['setredir', 'Ａ.aml', 'libs/Lib1.aml'],
    ['addr', 'a.aml', 'm'],
    ['addr', 'ａ.aml', 'm'],
    ['setredir', 'straße.aml', 'libs/Lib1.aml'],
    ['addr', 'STRASSE.aml', 'm'],
    ['setredir', 'cd.aml', 'libs/Lib1.aml'],
    ['addr', 'cd.aml', 'm'],
    ['setredir', 'ef.aml', 'libs/Lib1.aml'],
    ['addr', 'ef.aml', 'm'],
    ['setredir', 'gh.aml', 'libs/Lib1.aml'],
    ['addr', 'gh.aml', 'm'],
    ['setredir', 'jk.aml', 'libs/Lib1.aml'],
    ['addr', 'jk.aml', 'm'],
    ['setredir', 'あ.aml', 'libs/Lib1.aml'],
    ['addr', 'ア.aml', 'm'],
    ['setredir', 'ｶ.aml', 'libs/Lib1.aml'],
    ['addr', 'カ.aml', 'm'],
    ['setredir', '½.aml', 'libs/Lib1.aml'],
    ['addr', '1/2.aml', 'm'],
    ['addr', '1⁄2.aml', 'm'],
    ['nosync'],
  ]);
  kase(`resolver-function-${mode}`, [
    ['load', 'm', 'Main.aml'],
    ['fn', 'log', null],
    [L, 'm', 'MISS'],
    ['fnlog'],
    ['fn', 'load', '<IN>\\libs\\Lib2.aml'],
    ['addref', 'm', 'X1', 'x/one.aml'],
    [L, 'm', 'X1', 'x1'],
    ['fnlog'],
    [L, 'm', 'L2', 'l2'],
    ['fnlog'],
    [R, 'mailto:x@y.z', 'false'],
    [R, 'rel/two.aml', 'true'],
    [R, '<IN>\\libs\\Nope.aml', 'true'],
    ['fnlog'],
    ['fn', 'throw', null],
    ['addref', 'm', 'X2', 'x/two.aml'],
    [L, 'm', 'X2'],
    [R, 'rel/three.aml', 'true'],
    ['fn', 'null', null],
    ['addref', 'm', 'X3', 'x/three.aml'],
    [L, 'm', 'X3'],
    ['fn', 'load', '<IN>\\libs\\NoName.aml'],
    ['addref', 'm', 'X4', 'x/four.aml'],
    [L, 'm', 'X4'],
    ['fnlog'],
  ]);
  kase(`register-external-${mode}`, [
    ['new', 'n', 'N.aml'],
    ['addref', 'n', 'R1', 'some/path.aml'],
    ['load', 'x', 'libs/Lib2.aml'],
    ['isreg', 'n', 'R1', 'some/path.aml'],
    [mode === 'sync' ? 'regext' : 'regexta', 'n', 'R1', 'x', 'some/path.aml'],
    ['isreg', 'n', 'R1', 'some/path.aml'],
    ['isreg', 'n', 'R1', 'SOME/PATH.AML'],
    [R, 'some/path.aml', 'true'],
    [L, 'n', 'R1'],
    ['load', 'y', 'libs/Lib2.aml'],
    [mode === 'sync' ? 'regext' : 'regexta', 'n', 'R1', 'y', 'other/path.aml'],
    ['alive', 'y'],
    ['load', 'z', 'libs/Lib3.aml'],
    [mode === 'sync' ? 'regext' : 'regexta', null, null, 'z', 'z/path.aml'],
    [R, 'z/path.aml', 'true'],
    ['load', 'nn', 'libs/NoName.aml'],
    [mode === 'sync' ? 'regext' : 'regexta', 'n', 'R1', 'nn', 'nn/path.aml'],
    ['load', 'w', 'libs/Lib1.aml'],
    [mode === 'sync' ? 'regext' : 'regexta', 'n', 'R1', 'w', null],
    [R, null, 'true'],
    ['resdocs', 'n'],
    ['isext', 'n', 'x', 'IfLib2/If2'],
    ['isext', null, 'x', 'IfLib2/If2'],
    ['isext', null, 'z', 'SUCLib3/S3'],
    ['new', 'n2', 'N2.aml'],
    ['addref', 'n2', 'R1', 'some/path.aml'],
    [mode === 'sync' ? 'regext' : 'regexta', 'n2', 'R1', 'x', 'some/path.aml'],
    ['resdocs', 'n2'],
  ]);
}

for (const mode of ['sync', 'async']) {
  const L = mode === 'sync' ? 'lord' : 'lorda';
  const R = mode === 'sync' ? 'resolve' : 'resolvea';
  kase(`cache-relative-${mode}`, [
    ['new', 'n', 'N.aml'],
    ['addref', 'n', 'P', 'p.aml'],
    ['fn', 'load', '<IN>\\libs\\Lib2.aml'],
    [R, 'rel/x.aml', 'true', 'x'],
    ['fnlog'],
    ['setredir', 'p.aml', 'rel/x.aml'],
    ['addr', 'p.aml', 'n'],
    [L, 'n', 'P'],
    ['fnlog'],
    ['resdocs', 'n'],
    ['isreg', 'n', 'P', 'rel/x.aml'],
  ]);
}

kase('is-external', [
  ['load', 'm', 'Main.aml'],
  ['lord', 'm', 'L1', 'l1'],
  ['lord', 'm', 'L2', 'l2'],
  ['isext', 'm', 'l1', 'SUCLib1/Base'],
  ['isext', 'm', 'l1', 'SUCLib1/Base/Part'],
  ['isext', 'm', 'l2', 'IfLib2/If2'],
  ['isext', 'm', 'm', 'SUCMain/Local'],
  ['isext', null, 'l1', 'SUCLib1/Base'],
  ['isext', null, 'l2', 'IfLib2/If2'],
  ['isext', null, 'm', 'SUCMain/Local'],
  ['isext', 'l1', 'l2', 'IfLib2/If2'],
  ['isext', 'l2', 'l1', 'SUCLib1/Base'],
  ['load', 'o', 'libs/Lib3.aml'],
  ['isext', 'm', 'o', 'SUCLib3/S3'],
  ['isext', 'o', 'l1', 'SUCLib1/Base'],
  ['new', 'e', 'E.aml'],
  ['isext', 'e', 'l1', 'SUCLib1/Base'],
  ['lord', 'l1', 'L2'],
  ['isext', 'l1', 'l2', 'IfLib2/If2'],
  ['isext', null, 'l2', 'IfLib2/If2'],
  ['new', 'f', 'F.aml'],
  ['addref', 'f', 'Z', ''],
  ['addref', 'f', 'Y', 'dir/'],
  ['addref', 'f', 'X', 'other/Lib1.aml'],
  ['isext', 'f', 'l1', 'SUCLib1/Base'],
  ['load', 'nn', 'libs/NoName.aml'],
  ['isext', 'm', 'nn', 'RoleLibNN/NN'],
  ['isreg', null, null, 'libs/Lib1.aml'],
]);

kase('unload', [
  ['load', 'm', 'Main.aml'],
  ['lord', 'm', 'L1', 'l1'],
  ['lord', 'm', 'L2', 'l2'],
  ['unloadext', 'm', 'L1'],
  ['alive', 'l1'],
  ['resdocs', 'm'],
  ['lord', 'm', 'L1', 'l1b'],
  ['unloaddoc', 'libs/Lib2.aml'],
  ['alive', 'l2'],
  ['unloaddoc', 'libs/Lib2.aml'],
  ['unloaddoc', null],
  ['unloaddoc', 'never/loaded.aml'],
  ['resdocs', 'm'],
  ['load', 'm2', 'Main.aml'],
  ['unloadext', 'm2', 'L1'],
  ['alive', 'l1b'],
  ['resolve', '<IN>\\libs\\Lib3.aml', 'true', 'r3'],
  ['unloaddoc', '<IN>\\libs\\Lib3.aml'],
  ['alive', 'r3'],
  ['resolve', '<IN>\\libs\\Lib3.aml', 'true'],
  ['lord', 'm', 'L2', 'l2b'],
  ['unloadext', 'm', 'L2'],
  ['alive', 'l2b'],
]);

kase('remove-document', [
  ['load', 'm', 'Main.aml'],
  ['load', 'm2', 'Main.aml'],
  ['lord', 'm', 'L1', 'l1'],
  ['lord', 'm', 'L2', 'l2'],
  ['lord', 'm2', 'L1', 'l1x'],
  ['lord', 'l1', 'L2', 'l12'],
  ['unload', 'm'],
  ['alive', 'l1'],
  ['alive', 'l2'],
  ['alive', 'l12'],
  ['resdocs', 'm2'],
  ['lord', 'm2', 'L1', 'l1y'],
  ['unload', 'l1y'],
  ['resdocs', 'm2'],
  ['lord', 'm2', 'L2', 'l2y'],
  ['remove', 'm2'],
  ['alive', 'l2y'],
  ['remove', 'l2y'],
  ['alive', 'l2y'],
  ['resdocs', 'm2'],
  ['load', 'm3', 'Main.aml'],
  ['lord', 'm3', 'L2', 'l23'],
  ['remove', 'l23'],
  ['alive', 'l23'],
  ['lord', 'm3', 'L2', 'l23b'],
  ['unload', 'm3'],
  ['alive', 'l23b'],
]);

kase('nested', [
  ['load', 'm', 'Main.aml'],
  ['lord', 'm', 'L1', 'l1'],
  ['lord', 'l1', 'L2', 'l12'],
  ['lord', 'l1', 'L2'],
  ['lord', 'm', 'L2', 'l2'],
  ['lord', 'l1', 'L2'],
  ['resdocs', 'l1'],
  ['resdocs', 'm'],
  ['resolve', 'Lib2.aml', 'true'],
  ['resolve', 'libs/Lib2.aml', 'true'],
  ['isreg', 'l1', 'L2', 'Lib2.aml'],
  ['isext', 'l1', 'l2', 'IfLib2/If2'],
  ['isext', 'm', 'l2', 'IfLib2/If2'],
  ['isext', null, 'l2', 'IfLib2/If2'],
  ['unload', 'l1'],
  ['alive', 'l2'],
  ['resdocs', 'm'],
]);

kase('nested-cached', [
  ['load', 'm', 'Main.aml'],
  ['lord', 'm', 'L1', 'l1'],
  ['load', 'x', 'libs/Lib2.aml'],
  ['regext', null, null, 'x', 'Lib2.aml'],
  ['isext', null, 'x', 'IfLib2/If2'],
  ['lord', 'l1', 'L2'],
  ['lord', 'l1', 'L2'],
  ['isext', null, 'x', 'IfLib2/If2'],
  ['resdocs', 'l1'],
  ['unload', 'm'],
  ['alive', 'l1'],
  ['alive', 'x'],
]);

kase('engine-queries', [
  ['load', 'm', 'Main.aml'],
  ['find', 'm', 'L1@SUCLib1/Base', 'l1'],
  ['find', 'm', 'L1@SUCLib1/Base/Part'],
  ['find', 'm', 'L1@SUCLib1/Nope'],
  ['find', 'm', 'L2@IfLib2/If2', 'l2'],
  ['find', 'm', 'MISS@Nope/Nope'],
  ['find', 'm', 'NOALIAS@X/Y'],
  ['find', 'm', 'l1@SUCLib1/Base'],
  ['find', 'm', 'SUCMain/Derived'],
  ['findid', 'm', 'L1@id-lib1-base'],
  ['findid', 'm', 'L1@id-lib1-part'],
  ['findid', 'm', 'L2@id-lib2-role2'],
  ['findid', 'm', 'L1@id-nope'],
  ['findid', 'm', 'MISS@id-x'],
  ['findid', 'm', 'id-main-e1'],
  ['extdoc', 'm', 'L1'],
  ['extdoc', 'm', 'L1'],
  ['extdoc', 'm', 'MISS'],
  ['base', 'm', 'SUCMain/Derived'],
  ['base', 'm', 'SUCMain/Derived2'],
  ['chain', 'm', 'SUCMain/Derived2'],
  ['base', 'm', 'SUCMain/Local'],
  ['base', 'm', 'RoleMain/RoleM'],
  ['base', 'm', 'IfMain/IfM'],
  ['base', 'm', 'IH/E1'],
  ['base', 'm', 'IH/E1/X1'],
  ['base', 'm', 'IH/E2'],
  ['base', 'm', 'IH/E3'],
  ['srcrole', 'm', 'IH/E1'],
  ['base', 'l1', 'IfLib1/If1'],
  ['chain', 'l1', 'RoleLib1/Role1b'],
  ['base', 'l1', 'SUCLib1/Base/Part'],
  ['setbase', 'm', 'SUCMain/Local', 'l1', 'SUCLib1/Sub'],
  ['setbase', 'm', 'RoleMain/RoleM', 'l1', 'RoleLib1/Role1b'],
  ['setbase', 'm', 'IfMain/IfM', 'l2', 'IfLib2/If2'],
  ['setbase', 'm', 'IH/E4', 'l1', 'SUCLib1/Other'],
  ['setbase', 'm', 'IH/E1/X1', 'l2', 'IfLib2/If2'],
  ['load', 'o', 'libs/Lib3.aml'],
  ['setbase', 'm', 'SUCMain/Derived', 'o', 'SUCLib3/S3'],
  ['setbase', 'm', 'SUCMain/Derived2', 'm', 'SUCMain/Local'],
  ['insert', 'm', 'SUCMain', 'l1', 'SUCLib1/Base'],
  ['insert', 'm', 'SUCMain', 'o', 'SUCLib3/S3'],
  ['resdocs', 'm'],
]);

kase('engine-queries-unregistered', [
  ['locunreg'],
  ['load', 'm', 'Main.aml'],
  ['find', 'm', 'L1@SUCLib1/Base'],
  ['findid', 'm', 'L1@id-lib1-base'],
  ['extdoc', 'm', 'L1'],
  ['base', 'm', 'SUCMain/Derived'],
  ['reg'],
  ['find', 'm', 'L1@SUCLib1/Base'],
  ['extdoc', 'm', 'L1'],
]);

// The corpus: every document with external references, its file references resolved (the http
// ones are skipped: they need the internet) and the alias paths of its references queried.
const corpusDir = join(root, 'test', 'corpus');
for (const f of readdirSync(corpusDir).filter((n) => n.endsWith('.aml')).sort()) {
  const text = readFileSync(join(corpusDir, f), 'utf8');
  const refs = [...text.matchAll(/<ExternalReference\s+([^>]*?)\/?>/g)].map((m) => {
    const attr = (n) => new RegExp(`\\b${n}="([^"]*)"`).exec(m[1])?.[1] ?? null;
    return { alias: attr('Alias'), path: attr('Path') };
  });
  if (refs.length === 0) continue;
  const local = refs.filter((r) => r.alias && r.path && !/^\w+:\/\//.test(r.path));
  const steps = [['load', 'd', '<CORPUS>/' + f]];
  for (const r of local) steps.push(['lord', 'd', r.alias]);
  steps.push(['resdocs', 'd']);
  const aliases = new Set(local.map((r) => r.alias));
  const paths = new Set();
  for (const m of text.matchAll(/\b(?:RefBaseClassPath|RefBaseSystemUnitPath|RefRoleClassPath|RefAttributeType|RefBaseRoleClassPath)="([^"]+)"/g)) {
    const v = m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'");
    const at = v.indexOf('@');
    if (at > 0 && aliases.has(v.substring(0, at))) paths.add(v);
  }
  const list = [...paths].sort();
  const chosen = list.length <= 20 ? list : [...list].sort(() => rnd() - 0.5).slice(0, 20).sort();
  for (const p of chosen) steps.push(['find', 'd', p]);
  if (local.length > 0) steps.push(['unloadext', 'd', local[0].alias], ['resdocs', 'd']);
  kase('corpus:' + f, steps);
}

// GitHub: parsing and the paths that need no network.
const ghUrls = [
  'https://github.com/AutomationML/repo/blob/main/lib/File.aml',
  'https://github.com/AutomationML/repo/blob/main/File.aml',
  'https://github.com/AutomationML/repo/blob/main/',
  'https://github.com/AutomationML/repo/blob/main',
  'https://github.com/AutomationML/repo/blob',
  'https://github.com/AutomationML/repo',
  'https://github.com/AutomationML',
  'https://github.com/',
  'https://github.com',
  'https://github.com/blob/main/x.aml',
  'https://github.com/o/blob/main/x.aml',
  'https://github.com/o/r/blob/v1.0/a/b/c.aml',
  'https://github.com/o/r/tree/main/a.aml',
  'https://github.com/o/r/blob/main/a/blob/b.aml',
  'https://github.com/o/r/blob/main/a%20b.aml',
  'https://github.com/o/r/blob/main/a b.aml',
  'https://github.com/o/r/blob/main/x.aml?raw=true',
  'https://github.com/o/r/blob/main/x.aml#L10',
  'https://github.com//o/r/blob/main/x.aml',
  'https://github.com/o/r/blob/main/x.aml/',
  'https://GITHUB.COM/o/r/blob/main/x.aml',
  'HTTPS://github.com/o/r/blob/main/x.aml',
  'http://github.com/o/r/blob/main/x.aml',
  'https://www.github.com/o/r/blob/main/x.aml',
  'https://gist.github.com/o/r/blob/main/x.aml',
  'https://notgithub.com/o/r/blob/main/x.aml',
  'https://github.company.com/o/r/blob/main/x.aml',
  'https://github.com.evil.org/o/r/blob/main/x.aml',
  'https://github.com:8443/o/r/blob/main/x.aml',
  'https://user@github.com/o/r/blob/main/x.aml',
  'https://raw.githubusercontent.com/o/r/main/x.aml',
  'https://raw.githubusercontent.com/o/r/main/a/b/x.aml',
  'https://raw.githubusercontent.com/o/r/main/',
  'https://raw.githubusercontent.com/o/r/main',
  'https://raw.githubusercontent.com/o/r',
  'https://raw.githubusercontent.com/',
  'https://raw.githubusercontent.com',
  'https://RAW.GITHUBUSERCONTENT.COM/o/r/main/x.aml',
  'https://raw.githubusercontent.com/o/r/refs/heads/main/x.aml',
  'https://raw.githubusercontent.com/o/r/main/a%2Fb.aml',
  'https://raw.githubusercontent.com/o/r/main/x.aml?token=abc',
  'https://raw.githubusercontent.com/o/r/blob/main/x.aml',
  'https://raw.githubusercontent.com.evil.org/o/r/main/x.aml',
  'http://raw.githubusercontent.com/o/r/main/x.aml',
  'https://github.com/o/r/blob/main/\u00e4.aml',
  'https://github.com/o/r/blob/main/x/../y.aml',
  'https://github.com/o/r/blob/main/./y.aml',
  'https://github.com/o/r/blob/main/%2e%2e/y.aml',
  'github.com/o/r/blob/main/x.aml',
  '/o/r/blob/main/x.aml',
  'https://',
  'https://github.com/o/r/blob/main/x.aml\\y',
  '',
  null,
];
for (let i = 0; i < 40; i++) {
  const seg = () => pick(['o', 'r', 'main', 'blob', 'x.aml', 'a b', 'A', '..', '.', '', '%41', 'v1.2', 'refs', 'heads', '\u00fc']);
  const n = 1 + Math.floor(rnd() * 7);
  const path = Array.from({ length: n }, seg).join('/');
  const host = pick(['https://github.com/', 'https://raw.githubusercontent.com/', 'https://gist.github.com/', 'https://GitHub.com/', 'http://github.com/']);
  const tail = pick(['', '', '/', '?q=1', '#f']);
  ghUrls.push(host + path + tail);
}
const ghSteps = [];
for (const u of ghUrls) ghSteps.push(['ghis', u], ['ghparams', u], ['ghraw', u], ['ghblob', u]);
kase('github-parse', ghSteps);

kase('github-service', [
  ['ghreg', '', 'r', 't'],
  ['ghreg', null, 'r', 't'],
  ['ghreg', ' ', 'r', 't'],
  ['ghreg', 'u', '', 't'],
  ['ghreg', 'u', '\t', 't'],
  ['ghunreg', '', 'r'],
  ['ghunreg', 'u', null],
  ['ghreg', 'ExtRefUser', 'ExtRefRepo', null],
  ['ghtoken', 'extrefuser', 'extrefrepo'],
  ['ghreg', 'ExtRefUser', 'ExtRefRepo', 't1'],
  ['ghtoken', 'EXTREFUSER', 'EXTREFREPO'],
  ['ghreg', 'extrefuser', 'extrefrepo', 't2'],
  ['ghtoken', 'ExtRefUser', 'ExtRefRepo'],
  ['ghreg', 'ExtRefUser', 'Other', '  '],
  ['ghtoken', 'ExtRefUser', 'Other'],
  ['ghreg', 'ExtRefUser', 'Other', 't3'],
  ['ghtoken', 'ExtRefUser', 'Other'],
  ['ghunreg', 'ExtRefUser', 'Other'],
  ['ghtoken', 'ExtRefUser', 'Other'],
  ['ghunreg', 'ExtRefUser', 'Other'],
  ['ghload', 'http://example.com/x.aml', 'false'],
  ['ghload', null, 'false'],
  ['ghload', '', 'true'],
  ['ghload', 'https://github.com/NotRegistered/repo/blob/main/x.aml', 'false'],
  ['ghload', 'https://raw.githubusercontent.com/NotRegistered/repo/main/x.aml', 'true'],
  ['ghload', 'https://github.com/ExtRefUser', 'false'],
  ['ghload', 'https://github.com/ExtRefUser/ExtRefRepo/tree/main/x.aml', 'false'],
  ['ghresp', null],
  ['ghresp', ''],
  ['ghresp', 'https://github.com/ExtRefUser'],
  ['ghresp', 'http://example.com/x.aml'],
  ['ghresp', 'not a url'],
  ['ghres', 'u', 'r', 'tok'],
  ['ghres', 'u', 'r', ''],
  ['ghres', 'u', 'r', '  '],
  ['ghres', 'u', 'r', null],
  ['ghres', null, null, null],
  ['ghexists', 'u', 'r', null, 'https://github.com/o/r/tree/main/x.aml'],
  ['ghexists', 'u', 'r', 't', 'https://github.com/o'],
  ['ghexists', 'u', 'r', null, 'not a url'],
  ['ghexists', 'u', 'r', null, null],
  ['ghexists', 'u', 'r', null, 'relative/blob/main/x.aml'],
  ['ghloc', 'on'],
  ['getresp', '<BASE>/files/libs/Lib3.aml'],
  ['load', 'm', 'Main.aml'],
  ['addref', 'm', 'H', '<BASE>/files/libs/Lib3.aml'],
  ['lorda', 'm', 'H'],
  ['load', 'x', 'libs/Lib2.aml'],
  ['ghregext', 'm', 'L1', 'x', 'gh/path.aml'],
  ['ghregext', 'm', 'L2', 'x', 'gh/ExtRefRepo/path.aml'],
  ['isreg', 'm', 'L2', 'gh/ExtRefRepo/path.aml'],
  ['resolve', 'gh/ExtRefRepo/path.aml', 'true'],
  ['load', 'y', 'libs/Lib2.aml'],
  ['ghregext', 'm', 'L2', 'y', 'gh/ExtRefRepo/path.aml'],
  ['alive', 'y'],
  ['ghregext', 'm', 'L2', 'y', 'gh/ExtRefRepo/path2.aml'],
  ['alive', 'y'],
  ['ghunregext', 'x', 'gh/ExtRefRepo/path.aml'],
  ['ghunregext', 'x', ''],
  ['ghunregext', 'x', null],
  ['ghunregext', 'x', 'not/registered.aml'],
  ['ghregext', 'm', 'L2', 'y', 'gh/ExtRefRepo/path.aml'],
  ['ghunreg', 'ExtRefUser', 'ExtRefRepo'],
  ['ghtoken', 'ExtRefUser', 'ExtRefRepo'],
  ['ghreg', 'ExtRefUser', 'ExtRefRepo', null],
  ['ghregext', 'm', 'L2', 'y', null],
  ['ghunreg', 'ExtRefUser', 'ExtRefRepo'],
  ['ghtoken', 'ExtRefUser', 'ExtRefRepo'],
  ['ghloc', 'off'],
]);

// Live GitHub cases (ORACLE_LIVE=1 / AMLENGINE_LIVE=1): a public repository with AML files.
// Few requests (unauthenticated: 60 per hour): AutomationML/AML-UA-XSLT has small AML files.
const gh = 'https://github.com/AutomationML/AML-UA-XSLT/blob/main/UnitTests/AML/';
const raw = 'https://raw.githubusercontent.com/AutomationML/AML-UA-XSLT/main/UnitTests/AML/';
const live = {
  'github-live': [
    ['ghreg', 'AutomationML', 'AML-UA-XSLT', null],
    ['ghload', raw + '2_IE.aml', 'false'],
    ['ghload', raw + '2_IE.aml', 'false'],
    ['ghload', gh + '4_IH.aml', 'true'],
    ['ghload', gh + 'Missing.aml', 'false'],
    ['ghload', gh + 'Missing.aml', 'false'],
    ['ghload', 'https://github.com/AutomationML/NotRegistered/blob/main/x.aml', 'false'],
    ['ghexists', 'AutomationML', 'AML-UA-XSLT', null, gh + '2_IE.aml'],
    ['ghexists', 'AutomationML', 'AML-UA-XSLT', null, gh + 'Missing.aml'],
    ['ghresp', gh + '2_IE.aml'],
    ['ghresp', raw + 'Missing.aml'],
    ['ghloc', 'on'],
    ['load', 'm', 'Main.aml'],
    ['addref', 'm', 'G', gh + '4_IH.aml'],
    ['lorda', 'm', 'G', 'g'],
    ['lord', 'm', 'G'],
    ['ghloc', 'off'],
    // the cached documents of the service (no requests)
    ['ghunregext', 'g', 'not/cached.aml'],
    ['ghunregext', 'g', raw + '2_IE.aml'],
    ['ghload', raw + '2_IE.aml', 'true'],
    ['ghunreg', 'AutomationML', 'AML-UA-XSLT'],
    ['ghload', gh + 'Missing.aml', 'false'],
  ],
};

// ---------------------------------------------------------------- URIs for Uri.GetComponents

const uris = [
  'http://example.com/a/b?c=d#e',
  'http://user:pass@example.com:80/a/./b/../c?x=1 2#f g',
  'http://user@example.com:8080/path',
  'http://u:p:q@host/x',
  'http://%41b:c%3Ad@host/x',
  'http://\u00fcser:p\u00e4ss@host/x',
  'http://u%20v:w@host/x',
  'http://:p@host/x',
  'http://u:@host/x',
  'https://EXAMPLE.com:443/A%2fB/%7e?Q=%41#%42',
  'https://example.com/a b/c d?e f#g h',
  "http://example.com/it's?q='x'",
  'http://example.com/\u00e4\u00f6\u00fc?\u00e4=\u00f6#\u00fc',
  'http://[::1]:8080/x',
  'http://[fe80::1%25eth0]/x',
  'http://127.0.0.1:48217/files/libs/Lib3.aml',
  'http://xn--bcher-kva.example/x',
  'http://b\u00fccher.example/x',
  'http://example.com',
  'http://example.com:',
  'http://example.com?q',
  'http://example.com#f',
  'http://example.com/%',
  'http://example.com/%zz',
  'http://example.com/a%2e%2e/b',
  'http://example.com/a/%2e%2e/b',
  'http://example.com/a\\b',
  'http://example.com/<>"{}|^`',
  'ftp://user:pw@ftp.example.com/dir/file.txt',
  'file:///C:/dir/file.aml',
  'file:///C:/dir%20x/f%41.aml',
  'file://server/share/f.aml',
  'file:///home/user/f.aml',
  'C:\\dir\\file.aml',
  '\\\\server\\share\\file.aml',
  'mailto:user@example.com?subject=x',
  'news:comp.lang',
  'urn:isbn:0451450523',
  'net.tcp://host:808/svc',
  'ldap://host/dc=example',
  'custom://user:pw@host:99/p?q#f',
  'gopher://host/1',
  'https://github.com/o/r/blob/main/x.aml',
  'https://raw.githubusercontent.com/o/r/main/a%2Fb.aml',
  'relative/path.aml',
  '/rooted/path.aml',
  '',
];
const hostChars = ['a', 'b', 'x', '0', '-', '.', '\u00e9'];
const pathChars = ['a', '/', '.', '%20', ' ', '%2F', '~', "'", '\u00fc', '?', '#', '&', '=', '+', '@', ':'];
for (let i = 0; i < 30; i++) {
  const host = Array.from({ length: 2 + Math.floor(rnd() * 6) }, () => pick(hostChars)).join('') + '.example';
  const user = rnd() < 0.4 ? pick(['u', 'u:p', 'a%20b:c', ':', 'x:y:z', '\u00fc:p']) + '@' : '';
  const port = rnd() < 0.3 ? ':' + pick(['80', '443', '8080', '0', '65535']) : '';
  const path = Array.from({ length: Math.floor(rnd() * 8) }, () => pick(pathChars)).join('');
  uris.push(pick(['http', 'https', 'ftp', 'file']) + '://' + user + host + port + '/' + path);
}
const masks = [
  0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40, 0x80, 0x100,
  0x7f, 0x84, 0x86, 0xd, 0x3d, 0x30, 0x0,
  0x40000001, 0x40000002, 0x40000008, 0x40000010, 0x40000020, 0x40000040, 0x4000007f, 0x40000030,
  0x6, 0xc, 0x14, 0x60, 0x3, 0x105, 0x1ff, 0x101, 0x184,
];
for (let i = 0; i < 12; i++) masks.push(Math.floor(rnd() * 0x200) | (rnd() < 0.3 ? 0x40000000 : 0));

// ---------------------------------------------------------------- write

rmSync(outDir, { recursive: true, force: true });
for (const [name, content] of Object.entries(files)) {
  const p = join(outDir, name);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, content);
}
writeFileSync(join(outDir, 'cases.json'), JSON.stringify(cases, null, 1) + '\n');
writeFileSync(join(outDir, 'live.json'), JSON.stringify(live, null, 1) + '\n');
writeFileSync(join(outDir, 'uris.json'), JSON.stringify({ uris, masks, formats: [1, 2, 3, 0, 4] }, null, 1) + '\n');
const steps = Object.values(cases).reduce((n, s) => n + s.length, 0);
console.log(`${Object.keys(cases).length} cases, ${steps} steps, ${uris.length} URIs x ${masks.length} masks -> ${outDir}`);
