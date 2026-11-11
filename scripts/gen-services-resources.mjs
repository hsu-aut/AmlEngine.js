// Generates the inputs of the Aml.Engine.Resources verification (oracle/ServicesResourcesOracle.cs,
// test/services/resources.oracle.test.ts): one file cases.json with
//   catalogs     catalog JSON texts (valid, edited, invalid) or programmatic catalogs, each with a
//                script of query and edit operations
//   fileNames    file names and paths for AMLFileMetaModel (real names and generated ones)
//   fileGroups   groups of library file names for IsNewVersion and GetLatestVersions
//   enumStrings  strings for EnumDescriptionTypeConverter.ConvertFrom
//   semverStrings strings for SemanticVersionTypeConverter.ConvertFrom
//   items        argument tuples for ClassRepositoryItem
//   profiles     JSON texts for AMLLibraryServerProfile.LoadFromString (the System.Text.Json
//                emulation shared with the catalog)
// Strings that are no valid UTF-16 are written as "@hex:" followed by the UTF-16 code units in hex.
//   node scripts/gen-services-resources.mjs [outDir] [seed]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [out = 'test/services/resources', seedArg = '4210'] = process.argv.slice(2);
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
const int = (n) => Math.floor(rnd() * n);
const hex = (s) => '@hex:' + [...Array(s.length).keys()].map((i) => s.charCodeAt(i).toString(16).padStart(4, '0')).join('');

// ================================================================ catalogs

const TAGS = ['RoleClassLib', 'InterfaceClassLib', 'SystemUnitClassLib', 'AttributeTypeLib'];
const LIBNAMES = [
  'AutomationMLBaseRoleClassLib',
  'AutomationMLInterfaceClassLib',
  'AutomationMLBaseAttributeTypeLib',
  'AutomationMLBPRRoleClassLib',
  'AutomationMLLogicInterfaceClassLib',
  'MaterialHandlingProcessClassLib',
  'Lib ä€',
  'x',
];
const VERSIONS = ['1.0.0', '2.10.0', '2.11.0', '1.0', '1', '2', '1.2.3.4', '1.0.0-beta', '1.0.0-rc.1', '01.0.0', 'abc', '', '3.0.0', '1.1.1-beta', '1-2', '1.-1.0', '10.0.0', '9.99.999'];
const CAEX = ['2.15', '3.0', null, '', 'CAEX3_0', 'CAEX2_15', '3_0', '2_15', '4.0', 'x3.0'];
const EDITIONS = [null, '', 'AMLEd1', 'AMLEd2', 'Edition2'];
const TEXTS = [null, '', 'Base library', 'Umlaut äöü ß €', 'html <a href="x">&amp;</a> \'q\' +1 `t`', 'tab\tnewline\nreturn\r end', 'emoji \ud83d\ude00', 'ctl \u0001\u001f\u007f', '日本語'];
const LINKS = ['https://example.org/lib.aml', 'https://example.org/lib_2.amlx', 'http://x/y.zip', 'file:///C:/libs/a.aml', 'rel/path.aml', '', 'https://example.org/lib.aml'];

function genRevision(depth) {
  const r = {};
  if (chance(0.4)) r.DownloadLink = pick(LINKS.filter((l) => l !== ''));
  if (chance(0.5)) r.DownloadLinks = chance(0.2) ? null : Array.from({ length: int(3) }, () => pick(LINKS));
  if (chance(0.8)) r.Signature = pick(['sig-' + int(100), '', null]);
  if (depth > 0 && chance(0.5)) r.Revision = genRevision(depth - 1);
  return r;
}

function genVersion() {
  const v = {};
  const fields = [
    ['Version', () => pick(VERSIONS)],
    ['CAEXVersion', () => pick(CAEX)],
    ['AMLEdition', () => pick(EDITIONS)],
    ['IsArchived', () => chance(0.3)],
    ['Description', () => pick(TEXTS)],
    ['DownloadLink', () => pick([...LINKS, null])],
    ['DownloadLinks', () => (chance(0.15) ? null : Array.from({ length: int(4) }, () => (chance(0.05) ? null : pick(LINKS))))],
    ['Sources', () => pick([null, '', 'a.aml', 'a.aml;b.aml', ';x;'])],
    ['Signature', () => pick(['<Signature/>', '', null, 'sig'])],
    ['PublicKey', () => pick([null, '', 'key-' + int(10)])],
    ['Revision', () => (chance(0.4) ? genRevision(3) : null)],
  ];
  for (const [name, f] of fields) if (name === 'Version' || chance(0.6)) v[name] = f();
  return v;
}

function genCatalog() {
  const c = { Libraries: [] };
  const nTypes = 1 + int(4);
  const tags = [...TAGS].sort(() => rnd() - 0.5).slice(0, nTypes);
  if (chance(0.15)) tags.push(tags[0]); // duplicate type: the indexers take the first one
  for (const tag of tags) {
    const t = { CAEXType: tag, Libraries: [] };
    const nLibs = 1 + int(4);
    for (let i = 0; i < nLibs; i++) {
      const lib = { Name: pick(LIBNAMES), Versions: [] };
      const nVer = int(6);
      for (let k = 0; k < nVer; k++) lib.Versions.push(genVersion());
      t.Libraries.push(lib);
    }
    c.Libraries.push(t);
  }
  if (chance(0.7)) c.PublicKey = pick(['<RSAKeyValue/>', '', null, 'pk']);
  return c;
}

/** Text of a catalog object in one of several layouts. */
function layout(obj) {
  switch (int(4)) {
    case 0:
      return JSON.stringify(obj);
    case 1:
      return JSON.stringify(obj, null, 2);
    case 2:
      return JSON.stringify(obj, null, '\t').replace(/\n/g, '\r\n');
    default:
      return JSON.stringify(obj, null, 1).replace(/\n/g, '\n ');
  }
}

/** Query and edit operations on a catalog object (names taken from it and from the pools). */
function genOps(obj, n) {
  const tags = [...TAGS, 'Nonexistent', null, ''];
  const libsOf = (tag) => obj?.Libraries?.find?.((t) => t && t.CAEXType === tag)?.Libraries ?? [];
  const anyTag = () => (obj?.Libraries?.length && chance(0.8) ? (obj.Libraries[int(obj.Libraries.length)] ?? {}).CAEXType ?? null : pick(tags));
  const anyLib = (tag) => {
    const libs = libsOf(tag);
    return libs.length && chance(0.85) ? (libs[int(libs.length)] ?? {}).Name ?? null : pick([...LIBNAMES, null, 'Missing']);
  };
  const anyVersion = () => pick([...VERSIONS, null, '1.0.0.0', '2.10']);
  const anyCaex = () => pick(CAEX);
  const ops = [];
  for (let i = 0; i < n; i++) {
    const tag = anyTag();
    const lib = anyLib(tag);
    const idx = int(4);
    const rev = int(3);
    switch (int(26)) {
      case 0:
        ops.push(['item', tag]);
        break;
      case 1:
        ops.push(['item2', tag, lib]);
        break;
      case 2:
      case 3:
        ops.push(['getPub', lib, chance(0.1) ? null : anyVersion(), tag, anyCaex()]);
        break;
      case 4:
        ops.push(['isArchived', lib, anyVersion(), pick(EDITIONS)]);
        break;
      case 5:
        ops.push(['listed', tag, lib, anyVersion(), anyCaex()]);
        break;
      case 6:
        ops.push(['libVersion', tag, lib, anyVersion(), anyCaex()]);
        break;
      case 7:
        ops.push(['libVersions', tag, lib, anyCaex()]);
        break;
      case 8:
        ops.push(['libraries', tag]);
        break;
      case 9:
        ops.push(['getOrCreate', chance(0.7) ? tag : pick(['NewType', null])]);
        break;
      case 10:
        ops.push(['getOrCreateLib', tag, chance(0.6) ? lib : pick(['NewLib', null])]);
        break;
      case 11:
      case 12:
        ops.push(['highest', tag, lib, anyCaex()]);
        break;
      case 13:
        ops.push(['isCaex', tag, lib, idx, anyCaex()]);
        break;
      case 14:
        ops.push(['semver', tag, lib, idx]);
        break;
      case 15:
        ops.push(['addSource', tag, lib, idx, pick(['a.aml', 'b.aml', '', null, 'x;y'])]);
        break;
      case 16:
        ops.push(['links', tag, lib, idx]);
        break;
      case 17:
        ops.push(['addLink', tag, lib, idx, rev, pick([...LINKS, null])]);
        break;
      case 18:
        ops.push(['addRev', tag, lib, idx, rev, pick(['s1', '', null])]);
        break;
      case 19:
        ops.push(['addRevObj', tag, lib, idx, rev, pick(['r1', null]), pick(['nested', null])]);
        break;
      case 20:
        ops.push(['ext', tag, lib, idx, rev]);
        break;
      case 21:
        ops.push(['setDesc', tag, lib, idx, rev, pick(TEXTS)]);
        break;
      case 22:
        ops.push(['getLinks', tag, lib, idx, rev]);
        break;
      case 23:
        ops.push(['transform', tag, lib, idx, rev, pick([...LINKS, null])]);
        break;
      case 24:
        ops.push(['set', tag, lib, idx, pick(['Version', 'CAEXVersion', 'AMLEdition', 'Description', 'Sources', 'PublicKey', 'IsArchived', 'DownloadLinks']), pick([...VERSIONS, '2.15', '3.0', 'true', 'false', 'a|b', null])]);
        break;
      default:
        ops.push(['format', anyCaex() ?? pick(['', 'v3.0', '12.15', '3.0 ', '3,0'])]);
    }
  }
  ops.push(['dump'], ['serialize']);
  return ops;
}

const catalogs = [];
const add = (name, text, ops, extra = {}) => catalogs.push({ name, text, ops, ...extra });

// The embedded catalog of Aml.Engine.Resources: queries for every listed library.
{
  const ops = [['dump'], ['serialize']];
  for (const caex of ['2.15', '3.0', 'CAEX3_0', 'CAEX2_15', null, '']) {
    for (const tag of [...TAGS, 'Nonexistent']) {
      ops.push(['libraries', tag], ['libVersions', tag, 'AutomationMLBaseRoleClassLib', caex]);
      for (const lib of ['AutomationMLBaseRoleClassLib', 'AutomationMLInterfaceClassLib', 'AutomationMLBaseAttributeTypeLib', 'AutomationMLBPRRoleClassLib', 'AutomationMLB2MMLRoleClassLib', 'Missing']) {
        ops.push(['getPub', lib, '2.10.0', tag, caex], ['getPub', lib, '1.0', tag, caex], ['getPub', lib, '2', tag, caex], ['highest', tag, lib, caex]);
        ops.push(['listed', tag, lib, '1.0', caex], ['libVersion', tag, lib, '2.10.0', caex], ['isArchived', lib, '1.0', caex === '3.0' ? 'AMLEd2' : 'AMLEd1']);
      }
    }
  }
  ops.push(['semver', 'RoleClassLib', 'AutomationMLB2MMLRoleClassLib', 0], ['highest', 'RoleClassLib', 'AutomationMLB2MMLRoleClassLib', null]);
  ops.push(['dump'], ['serialize'], ['save', 'embedded-saved.json']);
  catalogs.push({ name: 'embedded', resource: 'Aml.Engine.Resources.Resources.AutomationMLLibs.json', ops });
}

// Generated valid catalogs.
for (let i = 0; i < 70; i++) {
  const obj = genCatalog();
  add('valid' + i, layout(obj), genOps(obj, 30 + int(40)));
}

// Hand-made catalogs for particular paths.
const ver = (o) => ({ Version: '1.0.0', CAEXVersion: '3.0', ...o });
const cat = (versions, extra = {}) => ({ Libraries: [{ CAEXType: 'RoleClassLib', Libraries: [{ Name: 'L', Versions: versions }] }], ...extra });
const special = {
  'empty-object': '{}',
  'null-root': 'null',
  'null-root-ws': ' \r\n null \t',
  'libraries-empty': '{"Libraries":[]}',
  'publickey-only': '{"PublicKey":"pk"}',
  'publickey-propagates': JSON.stringify(cat([ver({}), ver({ PublicKey: '' }), ver({ PublicKey: 'own' })], { PublicKey: 'global' })),
  'edition-from-caex': JSON.stringify(cat([ver({ CAEXVersion: '2.15' }), ver({ CAEXVersion: '3.0' }), ver({ CAEXVersion: 'CAEX3_0' }), ver({ CAEXVersion: null }), ver({ CAEXVersion: '3.0', AMLEdition: '' }), ver({ CAEXVersion: '2.15', AMLEdition: 'keep' })])),
  'downloadlink-moved': JSON.stringify(cat([ver({ DownloadLink: 'a', DownloadLinks: ['a', 'b'] }), ver({ DownloadLink: 'c', DownloadLinks: null }), ver({ DownloadLink: '', DownloadLinks: null }), ver({ DownloadLink: null })])),
  'revision-chain': JSON.stringify(cat([ver({ DownloadLinks: ['v'], Revision: { DownloadLink: 'r1', Signature: 's1', Revision: { DownloadLinks: ['r2a', 'r2b'], Revision: { Signature: 's3' } } } })])),
  'versions-null': JSON.stringify(cat(null)),
  'libraries-null': '{"Libraries":null}',
  'inner-libraries-null': '{"Libraries":[{"CAEXType":"RoleClassLib","Libraries":null}]}',
  'type-null-item': '{"Libraries":[null]}',
  'library-null-item': '{"Libraries":[{"CAEXType":"RoleClassLib","Libraries":[null]}]}',
  'version-null-item': JSON.stringify(cat([null])),
  'links-null-item': JSON.stringify(cat([ver({ DownloadLinks: [null, 'x', null] })])),
  'unknown-properties': JSON.stringify({ Extra: { a: [1, 2, { b: null }], c: 'x' }, Libraries: [{ CAEXType: 'RoleClassLib', Foo: [[], {}], Libraries: [{ Name: 'L', Bar: true, Versions: [ver({ Unknown: 1.5e3, AllDownloadLinks: [{ Item1: 'x' }], NetVersion: '1.0', SemanticVersion: { a: 1 }, Library: { Name: 'other' }, Revision: { RelatedLibraryVersion: { Version: '9' }, Signature: 's' } })] }] }], Tail: [] }),
  'case-variants': '{"libraries":[{"CAEXType":"X"}],"LIBRARIES":1,"publicKey":"lower","PublicKey":"upper"}',
  'duplicate-properties': '{"PublicKey":"a","PublicKey":"b","Libraries":[{"CAEXType":"A"}],"Libraries":[{"CAEXType":"B"},{"CAEXType":"C"}]}',
  'escapes': '{"PublicKey":"\\u00e4\\/\\b\\f\\n\\r\\t\\"\\\\\\ud83d\\ude00 \\u003C","Libraries":[{"CAEXType":"\\u0052oleClassLib","Libraries":[{"Name":"L\\u00E4","Versions":[{"Version":"1.0.0","Description":"caf\\u00e9"}]}]}]}',
  'escaped-property-name': '{"Publi\\u0063Key":"escaped name","\\u004Cibraries":[]}',
  'non-ascii-raw': '{"PublicKey":"日本語 äöü 😀","Libraries":[{"CAEXType":"ä","Libraries":[{"Name":"€","Versions":[{"Version":"1.0.0","Description":"ß"}]}]}]}',
  'archived': JSON.stringify(cat([ver({ IsArchived: true, AMLEdition: 'AMLEd2' }), ver({ Version: '2.0.0', IsArchived: false })])),
  'numbers-skipped': '{"X":[0,-0,1.5,-1e10,1E+2,2e-3,123456789012345678901234567890],"Libraries":[]}',
  'deep-unknown-60': '{"Deep":' + '['.repeat(60) + ']'.repeat(60) + ',"Libraries":[]}',
  'deep-unknown-63': '{"Deep":' + '['.repeat(63) + ']'.repeat(63) + '}',
  'deep-unknown-64': '{"Deep":' + '['.repeat(64) + ']'.repeat(64) + '}',
  'deep-unknown-65': '{"Deep":' + '['.repeat(65) + ']'.repeat(65) + '}',
  'deep-unknown-objects-70': '{"Deep":' + '{"a":'.repeat(70) + '1' + '}'.repeat(70) + '}',
  'deep-root-array-70': '['.repeat(70) + ']'.repeat(70),
  'semver-mutation': JSON.stringify(cat([ver({ Version: '1' }), ver({ Version: '2' }), ver({ Version: '1.5' }), ver({ Version: 'x' })])),
  'highest-ties': JSON.stringify(cat([ver({ Version: '1.0.0', Signature: 'a' }), ver({ Version: '1.0.0', Signature: 'b' }), ver({ Version: '0.9.0' }), ver({ Version: 'bad' }), ver({ Version: '1.0.0-beta' })])),
  'whitespace-only-version': JSON.stringify(cat([ver({ Version: ' ' })])),
};
// A revision chain deeper than the maximum depth of System.Text.Json (64).
{
  const chainText = (n) => {
    let r = '{"Signature":"end"}';
    for (let i = 0; i < n; i++) r = `{"Signature":"s${i}","Revision":${r}}`;
    return JSON.stringify(cat([ver({ Revision: '#R#' })])).replace('"#R#"', r);
  };
  special['revision-depth-55'] = chainText(55);
  special['revision-depth-56'] = chainText(56);
  special['revision-depth-57'] = chainText(57);
  special['revision-depth-58'] = chainText(58);
}
for (const [name, text] of Object.entries(special)) {
  let obj = null;
  try {
    obj = JSON.parse(text);
  } catch {
    // not standard JSON
  }
  add(name, text, genOps(obj, 25));
}

// Invalid catalogs: syntax errors, wrong types and malformed text.
const invalid = {
  'empty': '',
  'whitespace': ' \r\n\t ',
  'root-array': '[]',
  'root-number': '1',
  'root-string': '"x"',
  'root-true': 'true',
  'root-false': ' false',
  'unterminated-object': '{',
  'unterminated-object-ws': '{  \n ',
  'unterminated-array': '{"Libraries":[',
  'unterminated-string': '{"PublicKey":"abc',
  'unterminated-name': '{"Publ',
  'missing-colon': '{"PublicKey" "x"}',
  'missing-value': '{"PublicKey":}',
  'missing-value-end': '{"PublicKey":',
  'missing-comma': '{"PublicKey":"x" "Libraries":[]}',
  'missing-comma-array': '{"Libraries":[{} {}]}',
  'trailing-comma-object': '{"PublicKey":"x",}',
  'trailing-comma-array': '{"Libraries":[{},]}',
  'trailing-comma-end': '{"PublicKey":"x",',
  'comma-first': '{,"PublicKey":"x"}',
  'single-quotes': "{'PublicKey':'x'}",
  'unquoted-name': '{PublicKey:"x"}',
  'comment-line': '{// c\n"PublicKey":"x"}',
  'comment-block': '{"PublicKey":/* c */"x"}',
  'comment-after-value': '{"PublicKey":"x"/* c */}',
  'comment-root': '/* c */{}',
  'comment-root-slash': '/',
  'comment-array': '{"X":[/]}',
  'comment-array-after-comma': '{"X":[1,/]}',
  'comment-object-after-comma': '{"PublicKey":"x",/}',
  'comment-after-root': '{}//',
  'invalid-literal-tru': '{"Libraries":[{"CAEXType":"A","Libraries":[{"Name":"L","Versions":[{"IsArchived":tru}]}]}]}',
  'invalid-literal-nul': '{"PublicKey":nul}',
  'invalid-literal-case': '{"PublicKey":Null}',
  'invalid-literal-end': '{"PublicKey":fals',
  'invalid-escape': '{"PublicKey":"a\\x"}',
  'invalid-unicode-escape': '{"PublicKey":"\\u12G4"}',
  'short-unicode-escape': '{"PublicKey":"\\u12"}',
  'control-char-in-string': '{"PublicKey":"a\u0001b"}',
  'newline-in-string': '{"PublicKey":"a\nb"}',
  'tab-in-string': '{"PublicKey":"a\tb"}',
  'leading-zero': '{"X":01}',
  'minus-only': '{"X":-}',
  'minus-letter': '{"X":-a}',
  'dot-end': '{"X":1.}',
  'dot-letter': '{"X":1.e5}',
  'exp-end': '{"X":1e}',
  'exp-sign-end': '{"X":1e+}',
  'leading-dot': '{"X":.5}',
  'plus-number': '{"X":+1}',
  'number-letter': '{"X":12a}',
  'number-end-root': '12',
  'number-end-data': '{"X":12',
  'nan': '{"X":NaN}',
  'infinity': '{"X":Infinity}',
  'extra-data': '{} {}',
  'extra-char': '{}x',
  'extra-ws-char': '{}  \n  x',
  'extra-null': 'null null',
  'mismatch-brace': '{"Libraries":[}',
  'mismatch-bracket': '{"Libraries":{]',
  'mismatch-after-value': '{"X":[1}',
  'mismatch-after-value-object': '{"X":1]',
  'close-only': '}',
  'array-close-only': ']',
  'value-start-invalid': '{"PublicKey":@}',
  'name-start-invalid': '{@:1}',
  'utf8-before-error': '{"PublicKey":"äöü€😀", x}',
  'multi-line-error': '{\n  "PublicKey": "x",\n  "Libraries": [\n    {"CAEXType": "A",}\n  ]\n}',
  'crlf-error': '{\r\n"PublicKey":\r\n  x}',
  'cr-only-lines': '{\r"PublicKey":\r  x}',
  // conversion errors
  'libraries-object': '{"Libraries":{}}',
  'libraries-string': '{"Libraries":"x"}',
  'libraries-number': '{"Libraries":1}',
  'libraries-true': '{"Libraries":true}',
  'type-array': '{"Libraries":[[]]}',
  'type-string': '{"Libraries":["x"]}',
  'caextype-number': '{"Libraries":[{"CAEXType":1}]}',
  'caextype-object': '{"Libraries":[{"CAEXType":{}}]}',
  'caextype-array': '{"Libraries":[{"CAEXType":[]}]}',
  'caextype-true': '{"Libraries":[{"CAEXType":true}]}',
  'publickey-number': '{"PublicKey":12.5}',
  'publickey-false': '{"PublicKey":false}',
  'inner-libraries-object': '{"Libraries":[{"CAEXType":"A","Libraries":{}}]}',
  'library-number': '{"Libraries":[{"CAEXType":"A","Libraries":[1]}]}',
  'name-number': '{"Libraries":[{"CAEXType":"A","Libraries":[{"Name":5}]}]}',
  'versions-object': '{"Libraries":[{"CAEXType":"A","Libraries":[{"Name":"L","Versions":{}}]}]}',
  'version-number-item': '{"Libraries":[{"CAEXType":"A","Libraries":[{"Name":"L","Versions":[7]}]}]}',
  'version-number': JSON.stringify(cat([{ Version: 1 }])),
  'caexversion-number': JSON.stringify(cat([{ CAEXVersion: 3.0 }])),
  'isarchived-string': JSON.stringify(cat([{ IsArchived: 'true' }])),
  'isarchived-null': JSON.stringify(cat([{ IsArchived: null }])),
  'isarchived-number': JSON.stringify(cat([{ IsArchived: 1 }])),
  'downloadlinks-string': JSON.stringify(cat([{ DownloadLinks: 'x' }])),
  'downloadlinks-number-item': JSON.stringify(cat([{ DownloadLinks: ['a', 2] }])),
  'downloadlinks-object-item': JSON.stringify(cat([{ DownloadLinks: [{}] }])),
  'revision-array': JSON.stringify(cat([{ Revision: [] }])),
  'revision-string': JSON.stringify(cat([{ Revision: 'r' }])),
  'revision-signature-number': JSON.stringify(cat([{ Revision: { Signature: 1 } }])),
  'revision-links-object': JSON.stringify(cat([{ Revision: { Revision: { DownloadLinks: {} } } }])),
  'second-version-bad': JSON.stringify(cat([{ Version: '1.0.0' }, { Version: '2.0.0' }, { Description: [] }])),
  'bad-after-unknown': '{"Unknown":{"a":[1,2,{"b":"c"}]},"PublicKey":1}',
  'special-path-name': '{"Libraries":[{"CAEXType":"A","Libraries":[{"Name":"L","Versions":[{"Version":"1","IsArchived":"no"}]}]}],"a.b":1}',
  'error-after-valid-catalog': '{"Libraries":[],"PublicKey":"x"}]',
  'deep-unknown-65-after': '{"PublicKey":"x","Deep":' + '['.repeat(65) + ']'.repeat(65) + '}',
  'deep-revision-unterminated': JSON.stringify(cat([ver({ Revision: '#R#' })])).replace('"#R#"', '{"Revision":'.repeat(70)),
  'lone-surrogate-escape': '{"PublicKey":"\\ud800"}',
  'lone-low-surrogate-escape': '{"PublicKey":"a\\udc00b"}',
  'reversed-surrogate-escapes': '{"PublicKey":"\\ude00\\ud83d"}',
  'lone-surrogate-escape-unknown': '{"X":"\\ud800","PublicKey":"ok"}',
  'lone-surrogate-escape-name': '{"\\ud800":1,"PublicKey":"ok"}',
};
for (const [name, text] of Object.entries(invalid)) add('invalid-' + name, text, [['dump']]);

// Texts that are no valid UTF-16 (string overload) and byte inputs that are no valid UTF-8 (stream overload).
add('raw-lone-surrogate-value', hex('{"PublicKey":"a\ud800b"}'), [['dump']]);
add('raw-lone-surrogate-unknown', hex('{"X":"\udc00","PublicKey":"ok"}'), [['dump']]);
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const utf8 = (s) => [...Buffer.from(s, 'utf8')];
const bytesCases = {
  'bom-catalog': [0xef, 0xbb, 0xbf, ...utf8('{"PublicKey":"bom"}')],
  'bom-only': [0xef, 0xbb, 0xbf],
  'double-bom': [0xef, 0xbb, 0xbf, 0xef, 0xbb, 0xbf, ...utf8('{}')],
  'invalid-utf8-value': [...utf8('{"PublicKey":"a'), 0xff, ...utf8('b"}')],
  'invalid-utf8-unknown': [...utf8('{"X":"'), 0xc3, 0x28, ...utf8('","PublicKey":"ok"}')],
  'invalid-utf8-name': [...utf8('{"P'), 0xfe, ...utf8('":1,"PublicKey":"ok"}')],
  'invalid-utf8-outside': [...utf8('{"PublicKey":"ok"}'), 0xff],
  'truncated-utf8-value': [...utf8('{"PublicKey":"'), 0xe2, 0x82, ...utf8('"}')],
  'overlong-utf8-value': [...utf8('{"PublicKey":"'), 0xc0, 0xaf, ...utf8('"}')],
  'surrogate-utf8-value': [...utf8('{"PublicKey":"'), 0xed, 0xa0, 0x80, ...utf8('"}')],
  'utf16-bom': [0xff, 0xfe, ...utf8('{}')],
};
for (const [name, bytes] of Object.entries(bytesCases)) catalogs.push({ name: 'bytes-' + name, bytes: b64(bytes), ops: [['dump']] });

// Programmatic catalogs: built with the API (new PublicLibraryCatalog()).
{
  const ops = [
    ['dump'],
    ['serialize'],
    ['getOrCreate', 'RoleClassLib'],
    ['getOrCreate', 'RoleClassLib'],
    ['getOrCreate', null],
    ['getOrCreateLib', 'RoleClassLib', 'L1'],
    ['getOrCreateLib', 'RoleClassLib', 'L1'],
    ['getOrCreateLib', 'InterfaceClassLib', null],
    ['addVersion', 'RoleClassLib', 'L1', '1.0.0', '3.0', null],
    ['addVersion', 'RoleClassLib', 'L1', '1.2', '2.15', 'AMLEd1'],
    ['addVersion', 'RoleClassLib', 'L1', '2', null, null],
    ['set', 'RoleClassLib', 'L1', 0, 'Description', hex('lone \ud800 surrogate')],
    ['set', 'RoleClassLib', 'L1', 1, 'Description', hex('lone low \udfff')],
    ['set', 'RoleClassLib', 'L1', 2, 'DownloadLinks', null],
    ['ext', 'RoleClassLib', 'L1', 0, 0],
    ['links', 'RoleClassLib', 'L1', 0],
    ['addLink', 'RoleClassLib', 'L1', 0, 0, 'https://a/x.aml'],
    ['addLink', 'RoleClassLib', 'L1', 0, 0, 'https://a/x.aml'],
    ['addLink', 'RoleClassLib', 'L1', 2, 0, 'https://a/y.aml'],
    ['addRev', 'RoleClassLib', 'L1', 0, 0, 's1'],
    ['addLink', 'RoleClassLib', 'L1', 0, 1, 'https://a/r1.aml'],
    ['addRev', 'RoleClassLib', 'L1', 0, 1, 's2'],
    ['addRevObj', 'RoleClassLib', 'L1', 0, 0, 'r3', 'dropped'],
    ['links', 'RoleClassLib', 'L1', 0],
    ['ext', 'RoleClassLib', 'L1', 0, 2],
    ['setDesc', 'RoleClassLib', 'L1', 0, 3, 'from revision'],
    ['ext', 'RoleClassLib', 'L1', 0, 0],
    ['highest', 'RoleClassLib', 'L1', '3.0'],
    ['highest', 'RoleClassLib', 'L1', '2.15'],
    ['getPub', 'L1', '1', 'RoleClassLib', '3.0'],
    ['getPub', 'L1', '1.2', 'RoleClassLib', 'CAEX2_15'],
    ['libVersions', 'RoleClassLib', 'L1', null],
    ['libVersions', 'RoleClassLib', 'L1', ''],
    ['libVersions', 'RoleClassLib', 'L1', '3.0'],
    ['addSource', 'RoleClassLib', 'L1', 0, 'a.aml'],
    ['addSource', 'RoleClassLib', 'L1', 0, 'b.aml'],
    ['addSource', 'RoleClassLib', 'L1', 0, 'a.aml'],
    ['addSource', 'RoleClassLib', 'L1', 1, null],
    ['addSource', 'RoleClassLib', 'L1', 1, ''],
    ['addSource', 'RoleClassLib', 'L1', 2, ''],
    ['addSource', 'RoleClassLib', 'L1', 2, null],
    ['semver', 'RoleClassLib', 'L1', 2],
    ['semver', 'RoleClassLib', 'L1', 2],
    ['dump'],
    ['serialize'],
    ['onDeserialized'],
    ['dump'],
    ['serialize'],
    ['save', 'programmatic.json'],
    ['save', null],
    ['save', ''],
    ['save', 'missing-dir/x.json'],
    ['custom'],
  ];
  catalogs.push({ name: 'programmatic', ops });
  // A revision chain that grows past the maximum depth of the serializer.
  const deep = [['getOrCreateLib', 'RoleClassLib', 'L'], ['addVersion', 'RoleClassLib', 'L', '1.0.0', '3.0', null]];
  for (let i = 0; i < 62; i++) {
    deep.push(['addRev', 'RoleClassLib', 'L', 0, 0, 's' + i]);
    if (i >= 54) deep.push(['serialize']);
  }
  deep.push(['links', 'RoleClassLib', 'L', 0], ['ext', 'RoleClassLib', 'L', 0, 2]);
  catalogs.push({ name: 'programmatic-deep', ops: deep });
}

// ================================================================ file names

const realNames = [
  // embedded resources and corpus documents
  'Aml.Engine.Resources.Resources.CAEX2_15.AML2_0.AutomationMLBPRInterfaceClassLib.aml',
  'Aml.Engine.Resources.Resources.CAEX3_0.AML2_10.AutomationMLBaseRoleClassLib.aml',
  'Aml.Engine.Resources.Resources.AutomationMLLibs.json',
  'AutomationMLBaseRoleClassLib.aml',
  'AutomationML_ARAPC_Libraries_AMLEd1_1.4.0.aml',
  'AutomationML_Base_Libraries_AMLEd2_2.11.0.aml',
  'AutomationML_ObjectReferences_AttributeTypeLib_AMLEd2_1.1.1-beta.aml',
  'AML_Test_Lib_AMLEd1_1.0.0.aml',
  'AML_Test_RoleClassLib_AMLEd2_0.9.0.aml',
  'AML_Test_RoleClassLib_AMLEd2_1.0.0.aml',
  'AML_Test_RoleClassLib_AMLEd2_1.2.0-alpha.aml',
  'AML_Test_RoleClassLib_AMLEd2_1.2.0.aml',
  'AML_Test_RoleClassLib_Ext_AMLEd2_1.2.5.aml',
  '0_EmptyFile_V2.0.aml',
  '0_EmptyFile_V2.1.aml',
  '1_AMLBaseLibraries.aml',
  '8_AMLAttributeLibrary.aml',
  'AssetAdministrationShellLib.aml',
  'AssetAdministrationShellLib_Full.aml',
  'CommunicationInterfaceClassLib_V1.0.0.aml',
  'CommunicationRoleClassLib_V1.0.1.aml',
  'EFL_DomainLibrary_v0.1.0.aml',
  'ISO_PT_DomainLibrary_v0.3.aml',
  'OMG_DD_AttributeTypeLib_v0.1.aml',
  'ObjectReferences_AttributeTypeLib.aml',
  'VDI3682_Lib_v0.1.aml',
  'VDI_FPD_DomainLibrary_v0.7.aml',
  'MTPPy_example_minimal_manifest.aml',
  'legacy-caex215.aml',
  'bottling-line.elements.aml',
  'Showcase-A-WaermetauscherMitRegelung.aml',
  'UnifiedAASExampleVWSiD2.0.aml',
  // names of the published AutomationML libraries (naming convention of the catalog)
  'AutomationML_Base_RoleClassLib_AMLEd2_2.10.0.aml',
  'AutomationML_Base_InterfaceClassLib_AMLEd2_2.10.0.aml',
  'AutomationML_Base_AttributeTypeLib_AMLEd2_1.0.0.aml',
  'AutomationML_Base_RoleClassLib_AMLEd1_2.2.2.aml',
  'AutomationML_Base_InterfaceClassLib_AMLEd1_2.2.2.aml',
  'AutomationML_BPR_RoleClassLib_AMLEd1_2.2.2.aml',
  'AutomationML_BPR_InterfaceClassLib_AMLEd1_2.2.2.aml',
  'AutomationML_Logic_InterfaceClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_Logic_RoleClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_Geometry_InterfaceClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_AssetAdministrationShell_RoleClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_Communication_InterfaceClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_Communication_RoleClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_CC-Link_RoleClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_DriveConfigurations_RoleClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_MaterialHandling_SystemUnitClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_MESandERP_RoleClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_AutomationComponent_RoleClassLib_AMLEd2_1.0.0.aml',
  'AutomationML_Base_RoleClassLib_Extended_AMLEd2_2.10.0.aml',
  'AutomationML_BMI_RoleClassLib_AMLEd1_1.0.0.aml',
  'AutomationML_Base_Libraries_AMLEd2_2.10.0.amlx',
  'AutomationML_Base_Libraries_AMLEd2_2.10.0.zip',
  'AutomationML_Base_Examples_Showcase_AMLEd2_1.0.0.aml',
  'AutomationML_Base_Libraries_AMLEd2.aml',
  'https://raw.githubusercontent.com/AutomationML/AML.Library/main/AutomationML_Base_RoleClassLib_AMLEd2_2.10.0.aml',
  'https://github.com/AutomationML/AML.Library/raw/main/Libraries/AutomationML%20Base%20Libraries/AutomationML_Base_Libraries_AMLEd2_2.11.0.aml',
  'https://example.org/libs/AutomationML_Base_RoleClassLib_AMLEd2_2.10.0.amlx?raw=true',
  'C:\\Libraries\\AMLEd2\\BaseRoleClassLib.aml',
  'C:\\Libraries\\Edition\\AutomationML_Base_RoleClassLib_AMLEd2_2.10.0.aml',
  '/srv/libraries/AutomationML_Base_RoleClassLib_AMLEd2_2.10.0.aml',
  '\\\\server\\share\\AutomationML_Logic_RoleClassLib_AMLEd1_1.0.0.aml',
  'LibraryDatabase.json',
  'InterfaceClass.json',
];

const PRODUCERS = ['AutomationML', 'AML', 'automationml', 'AUTOMATIONML', 'Siemens', 'X', 'My Producer', 'Prödücer', 'A.B', 'p1'];
const DOMAINS = ['Base', 'Logic', 'Base.BPR', 'Base.BPR.X', 'AutomationComponent', 'Geometry', 'ARAPC', 'CC-Link', 'BMI', 'MaterialHandling', 'Ünï', '.', 'a.', '.b', 'x y'];
const LIBTYPES = ['RoleClassLib', 'InterfaceClassLib', 'SystemUnitClassLib', 'AttributeTypeLib', 'Libraries', 'Lib', 'roleclasslib', 'Examples'];
const EXTS = ['Ext', 'Extended', 'Extension1', 'x'];
const EDS = ['AMLEd1', 'AMLEd2', 'amled2', 'AMLED1', 'AMLEd', 'AMLEd10', 'AMLEd2x', 'Ed2', 'AMLEdition2', 'aMLeD1'];
const VERS = ['1.0.0', '2.10.0', '1.1.1-beta', '1.0', '1', '1.0.0.0', '01.0.0', '1.0.0-rc.1', '1.0.0-rc1', '1.2.3+build', 'v1.0.0', '1.0.0-', '١.٢.٣', '99999999999.0.0', '2147483647.0.0', '2147483648.0.0', '1.0.0-beta_2', '0.0.0', ' 1.0.0', '1.0.0 ', '1..0', 'latest'];
const FILEEXTS = ['.aml', '.aml', '.aml', '.amlx', '.zip', '.AML', '.Aml', '.xml', '', '.aml.bak', '.tar.gz', '.amlx ', '.', '.json'];
const PREFIXES = ['', '', '', 'C:\\libs\\', 'C:/libs/', '/home/user/', 'https://example.org/lib/', 'https://example.org/a%20b/', 'sub/dir/', '..\\', 'file:///C:/x/', '\\\\server\\share\\', 'C:\\AMLEd2\\', 'x:', 'C:', 'https://h/AMLEd1/'];
const ODD = ['%5F', '%20', '%2E', '%ZZ', '%', '%C3%A4', '%E2%82', '%41MLEd2', ' ', '-', '+', '__', '#', '?q=1', '\u00AD', '\u200B', '\u0301', 'ä', 'ß', '𝔸', 'ﬀ', 'Ⅿ', 'ℓ', 'Ａ', '\t', '\u0000', '/', '\\', ':'];
const AMLED_FORMS = ['AMLEd2', 'amled1', 'AMLED2', 'AMLEd', 'AMLE', 'A\u00ADMLEd2', 'A\u200BMLEd1', '\u00ADAMLEd2', 'AMLEd\u0301x', 'ＡＭＬＥｄ２', 'ÀMLEd2', 'A\u0301MLEd2', 'ⒶMLEd2', 'AⅯLEd2', 'AMℓEd2', 'AML\u0000Ed2', 'AMLe\u0064', 'aMlEd2_x', 'AMLEd2AMLEd1', 'ＡMLEd1'];

function caseVariant(s) {
  switch (int(5)) {
    case 0:
      return s.toLowerCase();
    case 1:
      return s.toUpperCase();
    default:
      return s;
  }
}

function genName() {
  const kind = int(10);
  if (kind < 5) {
    // naming convention: Producer_Domain_LibType[_Extension]_Edition_Version
    const parts = [pick(PRODUCERS), pick(DOMAINS), pick(LIBTYPES)];
    if (chance(0.3)) parts.push(pick(EXTS));
    parts.push(pick(EDS), pick(VERS));
    let n = parts.length;
    // drop, add or empty parts now and then
    if (chance(0.15)) parts.splice(int(n), 1);
    if (chance(0.1)) parts.splice(int(n), 0, pick(['', 'Extra', 'x_y']));
    if (chance(0.08)) parts[int(parts.length)] = '';
    n = parts.length;
    let name = parts.join('_');
    if (chance(0.1)) name = caseVariant(name);
    if (chance(0.1)) {
      const i = int(name.length + 1);
      name = name.substring(0, i) + pick(ODD) + name.substring(i);
    }
    return pick(PREFIXES) + name + pick(FILEEXTS);
  }
  if (kind < 8) {
    // free names with "AMLEd" somewhere, or short names
    const head = Array.from({ length: int(6) }, () => pick([...'abcXYZ019 .-', ...ODD])).join('');
    const parts = Array.from({ length: 1 + int(4) }, () => pick([head, pick(DOMAINS), pick(LIBTYPES), 'Lib', 'v1.0']));
    if (chance(0.7)) parts.splice(int(parts.length + 1), 0, pick(AMLED_FORMS) + (chance(0.5) ? '' : pick(['', 'x', '_1.0.0', '.aml'])));
    const name = parts.join(pick(['_', '', '-', '.']));
    return pick(PREFIXES) + name + pick(FILEEXTS);
  }
  // odd strings
  const len = int(14);
  const s = Array.from({ length: len }, () => pick(['_', '.', 'a', 'A', 'M', 'L', 'E', 'd', '1', '2', ...ODD])).join('');
  return pick(['', '', 'C:\\', 'https://x/']) + s;
}

const fileNames = [...realNames, '', 'AMLEd', 'xAMLEd', 'xAMLEd1', 'xAMLEd12', 'x\\AMLEd', 'AMLEd2_x_y', '_AMLEd2', 'a_b_c_d', 'a_b_c_d_e', 'a_b_c_d_e_f', 'a_b_c_d_e_f_g', 'a_b_c_d_e_f_g_h', '____', '_____', '______.aml', '.aml', 'a.b.c.aml', 'C:\\', 'C:', '/', 'x/', 'AMLEd/AMLEd2', 'xamled1\\y.aml'];
const seen = new Set(fileNames);
while (fileNames.length < 2400) {
  const n = genName();
  if (!seen.has(n)) {
    seen.add(n);
    fileNames.push(n);
  }
}

// Groups of library files for IsNewVersion and GetLatestVersions.
const fileGroups = [
  ['AML_Test_RoleClassLib_AMLEd2_0.9.0.aml', 'AML_Test_RoleClassLib_AMLEd2_1.0.0.aml', 'AML_Test_RoleClassLib_AMLEd2_1.2.0-alpha.aml', 'AML_Test_RoleClassLib_AMLEd2_1.2.0.aml', 'AML_Test_RoleClassLib_Ext_AMLEd2_1.2.5.aml', 'AML_Test_Lib_AMLEd1_1.0.0.aml'],
  ['AutomationML_Base_RoleClassLib_AMLEd2_2.10.0.aml', 'AutomationML_Base_RoleClassLib_AMLEd2_2.10.0.aml', 'AutomationML_Base_RoleClassLib_AMLEd1_2.11.0.aml'],
];
for (let g = 0; g < 60; g++) {
  const base = [pick(PRODUCERS.slice(0, 3)), pick(DOMAINS.slice(0, 4)), pick(LIBTYPES.slice(0, 4))];
  const group = [];
  for (let k = 0, n = 2 + int(7); k < n; k++) {
    const parts = [...base];
    if (chance(0.2)) parts.push(pick(EXTS));
    if (chance(0.1)) parts[int(3)] = pick(DOMAINS);
    parts.push(pick(['AMLEd1', 'AMLEd2', 'AMLEd2']), pick(['1.0.0', '1.1.0', '2.0.0', '1.0.0-beta', '1.0', '2.10.0', '2.9.0', 'x', '1.0.0']));
    let name = parts.join('_') + pick(['.aml', '.amlx']);
    if (chance(0.1)) name = 'short_' + name.split('_').slice(-2).join('_');
    group.push(pick(['', '', 'https://e/']) + name);
  }
  fileGroups.push(group);
}

// ================================================================ converters and records

const enumStrings = [
  'LibraryFile', 'libraryfile', 'LIBRARYFILE', ' LibraryFile ', '\tExampleFile\n', 'None', 'none', 'Library File', 'Example File',
  'LibraryFile,ExampleFile', 'LibraryFile, ExampleFile', 'ExampleFile,', ',', 'LibraryFile,,ExampleFile', 'LibraryFile,0', 'LibraryCatalog,ClassRepository',
  '0', '1', '7', '8', '99', '-1', '+2', ' 3', '3 ', ' 3 ', '00', '-0', '+0', '1 2', '2147483647', '2147483648', '-2147483648', '-2147483649', '0x1', '1.0', '1e2',
  '', ' ', 'Empty', 'empty', 'unknown', 'Read Access', 'ReadAccess', 'WRITEACCESS', 'Edition1', 'edition2', 'AllEditions', 'All Editions', 'CAEX2_15', 'caex3_0', 'Unknown', '2.15', '3.0',
  'ReadAccess,WriteAccess', 'Edition1,Edition2', '\u00a0LibraryFile', 'LibraryFile\u00a0', '１', '٣', '-', '+', '- 1', '1\u0000', '1\t', 'Library\u0130File',
];
const semverStrings = ['1.0.0', '1.0', '1', '1.0.0.0', '1.0.0-beta', '1.0.0-beta.1', '1.0.0+meta', '01.0.0', 'v1.0.0', '', ' ', 'abc', '1.0.0-', '1.2.3.4.5', '2147483648.0', ' 1.0', '1.0 ', '١.٠', '1.0.0-rc_1', '1.0.0-Beta'];
const items = [
  ['A', 'Lib/A', 'Base/A', 'Lib', '1.0.0', 'AMLEd2', 'id1'],
  ['A', 'Lib/A', 'Base/A', 'Lib', '1.0.0', 'AMLEd2', null],
  ['A', 'Lib/A', 'Base/A', 'Lib', '1.0.0', 'AMLEd2', ''],
  [null, null, null, null, null, null, null],
  ['', '', '', '', '', '', ''],
  ['a', 'Lib/A', 'Base/A', 'Lib', '1.0.0', 'AMLEd2', 'id1'],
  ['A', 'Lib/A', 'Base/A', 'Lib', '1.0.1', 'AMLEd2', 'id1'],
  ['Ä { } = ,', 'x, y', '} {', '"q"', '\t', '\n', ' '],
];

const profiles = [
  '{"UserName":"u","PortNumber":8080}',
  '{"UserName":"u","\\ud800":1}',
  '{"UserName":"u","LibraryData":[{"Folder":"f","\\udc00x":1}]}',
  '{"UserName":"u","X":"\\ud800"}',
  '{"UserName":"\\ud800"}',
  hex('{"UserName":"a\ud800"}'),
  hex('{"X":"\udfff","UserName":"u"}'),
  '{"UserName":"u","Deep":' + '['.repeat(64) + ']'.repeat(64) + '}',
  '{"UserName":"u","Deep":' + '['.repeat(63) + ']'.repeat(63) + '}',
  '{"UserName":"u","ServerName":/}',
];

const cases = { catalogs, fileNames, fileGroups, enumStrings, semverStrings, items, profiles };
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'cases.json'), JSON.stringify(cases, null, 1) + '\n');
console.log(`catalogs ${catalogs.length}, file names ${fileNames.length}, groups ${fileGroups.length}`);
