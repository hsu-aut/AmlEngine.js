// Generates the cases of the "values" coverage package (typed attribute values) for
// oracle/ValuesOracle.cs and test/engine/values.oracle.test.ts.
//   node scripts/gen-values.mjs <out.json> [seed]
// Case kinds (both runners walk them in order and record a list of strings per case):
//   raw     AttributeDataType + raw Value/DefaultValue strings, read back through every getter
//   set     typed CLR values written through AttributeValue, the indexer and CaexValue.Value
//   cmp     CaexValue.CompareTo / Equals / GetHashCode of two attributes
//   static  ClrToXmlType, XmlTypeToClrType, XmlTypeCodeExtensions, XsdDataTypes, CaexValue.TypeCode
//   enc     the name encoders (internal classes, reached by reflection in C#)
//   setdbl, setdt, sadt, props, cons, sem, cmpr   see the runners
//   corpus  every attribute of a corpus file
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const [out = 'test/values/cases.json', seedArg = '3682'] = process.argv.slice(2);
let seed = Number(seedArg);
function rnd() {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const pick = (a) => a[Math.floor(rnd() * a.length)];
const schema = () => (rnd() < 0.5 ? '30' : '215');
const host = (s) => pick(s === '30' ? ['attr', 'at', 'nested'] : ['attr', 'nested']);

// Every data type string of the engine's resource, plus absent, empty and unknown ones.
const XSD = ['xs:long', 'xs:boolean', 'xs:gDay', 'xs:ENTITY', 'xs:string', 'xs:byte', 'xs:gMonth', 'xs:ID', 'xs:time', 'xs:integer',
  'xs:gYearMonth', 'xs:date', 'xs:positiveInteger', 'xs:IDREF', 'xs:normalizedString', 'xs:negativeInteger', 'xs:base64Binary',
  'xs:unsignedLong', 'xs:QName', 'xs:gMonthDay', 'xs:NCName', 'xs:unsignedInt', 'xs:unsignedShort', 'xs:anyURI', 'xs:duration',
  'xs:token', 'xs:nonPositiveInteger', 'xs:IDREFS', 'xs:float', 'xs:unsignedByte', 'xs:gYear', 'xs:Name', 'xs:decimal', 'xs:NMTOKENS',
  'xs:hexBinary', 'xs:ENTITIES', 'xs:int', 'xs:double', 'xs:NMTOKEN', 'xs:short', 'xs:dateTime', 'xs:language', 'xs:nonNegativeInteger'];
const DATA_TYPES = [...XSD, null, '', ' ', 'xs:unknown', 'string', 'xs:String', 'xs:double ', 'xsd:double', 'xs:anySimpleType', 'xs:dayTimeDuration'];

// Raw value strings of all shapes: valid and invalid for every type, white space, overflow.
const RAW = [null, '', ' ', ' \t\n', 'abc', '0', '1', '-1', '+1', '01', '1.5', '1,5', '-0', '1e3', '1E+308', '1e400', '-1e400', 'NaN', 'INF', '-INF',
  'Infinity', '-Infinity', '∞', 'true', 'false', 'True', 'FALSE', ' 1', '1 ', ' 1.5 ', '65535', '65536', '-129', '127', '128', '255', '256', '32767',
  '32768', '-32769', '2147483647', '2147483648', '-2147483649', '4294967295', '4294967296', '9223372036854775807', '9223372036854775808',
  '-9223372036854775809', '18446744073709551615', '18446744073709551616', '79228162514264337593543950335', '79228162514264337593543950336',
  '0.0000000000000000000000000001', '1.23456789012345678901234567890', '1.0', '12.50', '2024-02-29', '2023-02-29', '2024-02-29T13:45:30',
  '2024-02-29T13:45:30Z', '2024-02-29T13:45:30.1234567+05:30', '2024-02-29T13:45:30.5-03:00', '2024-02-29T24:00:00', '2024-02-29T13:45',
  '1999-12-31T23:59:59.9999999', '2001-06-15', '2001-06-15Z', '13:45:30', '13:45:30Z', '13:45', '25:00:00', '--02-29', '--13-01', '--12-24',
  '2024-02', '2024-13', '---15', '---32', '--12--', '--12', '12', '31', '32', '2024', '9999', '10000', 'P1D', 'PT1H30M', '-P1Y2M3DT4H5M6.7S',
  'P', 'PT', '1.02:03:04', '00:00:05', '-1.00:00:00', 'http://example.com/a b', 'http://example.com/a%20b?q=1#f', 'urn:x', '../rel/path?x#y',
  '\\\\server\\share', 'c:\\temp\\x.txt', 'a:b', 'a:b:c', ':a', 'a:', '1abc', '_x', 'a b  c', ' lead', 'trail ', 'x\ty\nz', 'a_x0020_b',
  '_x0041_', 'a_x003A_b', 'SGVsbG8=', 'SGVsbG8', 'Zm9v YmFy', 'w6TDtg==', '48656C6C6F', '4865F', 'GG', '00ff', 'ß', '日本語', '😀',
  '31.12.2024', '1.2.24', '31.12.2024 13:45', '31.12.2024 13:45:30', '12/31/2024', '2024-12-31 13:45:30', 'Dec 31 2024', '31. Dezember 2024',
  'Dienstag, 31. Dezember 2024', '31.12.24', 'Mo, 1. Jan 2024', '1. März 2024', '1. Mär 2024', 'März 2024', '13:45 Uhr', '31.12.2024 1:2:3',
  '1.1.2024 12:00 PM', '29.02.2023', '1.5.', '31.12.2024 n. Chr.', '2024.12.31', '1.234,56', '1,234.56', '1.234.567', '(5)', '5-', '€5', '¤5', '1_000', '0x1F', '1e', '.5', '5.', '-.5e-3'];

// Type specific extras, so every type gets enough valid and invalid values.
const EXTRA = {
  'xs:dateTime': ['2024-02-29T13:45:30+14:00', '2024-02-29T13:45:30-14:00', '9999-12-31T23:59:59.9999999', '2010-10-31T02:30:00', '2011-03-27T02:30:00', ' 2024-02-29T13:45:30 '],
  'xs:time': ['00:00:00', '23:59:59.9999999', '12:00:00+01:00', '12:00:00.5Z'],
  'xs:date': ['2000-01-01+01:00', '9999-12-31', '1996-02-29'],
  'xs:duration': ['P10675199DT2H48M5.4775807S', 'P10675199DT2H48M5.4775808S', 'PT0.0000001S', 'P1Y', 'P1M', '-PT1S'],
  'xs:boolean': ['1', '0', ' true ', 'yes'],
  'xs:anyURI': ['http://[::1]/', 'http://ä.example/ü', 'mailto:a@b.c', 'file:///c:/x', '#frag', '%zz'],
  'xs:hexBinary': ['0', 'abc', ' 0f', '0f '],
  'xs:QName': ['xs:string', 'a:1b', 'a b:c'],
  'xs:gYear': ['0', '0001', '-0001', '2024Z'],
  'xs:gMonth': ['0', '13', '--05--', '5'],
  'xs:gDay': ['0', '---01', '1'],
};

const cases = [];

// raw: every data type with every raw value (random schema/host), value and default value.
for (const dt of DATA_TYPES) {
  const raws = [...RAW, ...(EXTRA[dt] ?? [])];
  for (const v of raws) {
    const s = schema();
    cases.push({ k: 'raw', s, h: host(s), dt, v, dv: rnd() < 0.3 ? pick(raws) : null });
  }
}

// CLR values of every type the engine distinguishes (literals exactly representable in both runtimes).
const TICKS = (y, mo, d, h = 0, mi = 0, s = 0, frac = 0) => String(BigInt(Date.UTC(y, mo - 1, d, h, mi, s)) * 10000n + 621355968000000000n + BigInt(frac));
const CLR = [
  { t: 'Null' },
  ...['', ' ', 'abc', 'a b  c', ' x ', '1', '1.5', '-7', 'true', 'False', '2024-02-29', '2024-02-29T13:45:30', '13:45:30', '31.12.2024', 'P1D',
    '1.02:03:04', '12', '65536', '1abc', 'a:b', 'http://x.org/a b', 'Hello', 'x\ty', '日本', 'SGk=', 'NaN', '1e3'].map((v) => ({ t: 'String', v })),
  { t: 'Boolean', v: 'true' }, { t: 'Boolean', v: 'false' },
  { t: 'SByte', v: '-128' }, { t: 'SByte', v: '5' }, { t: 'Byte', v: '0' }, { t: 'Byte', v: '255' },
  { t: 'Int16', v: '-32768' }, { t: 'Int16', v: '12' }, { t: 'UInt16', v: '0' }, { t: 'UInt16', v: '12' }, { t: 'UInt16', v: '65535' }, { t: 'UInt16', v: '2024' },
  { t: 'Int32', v: '0' }, { t: 'Int32', v: '-1' }, { t: 'Int32', v: '12' }, { t: 'Int32', v: '2147483647' }, { t: 'Int32', v: '-2147483648' },
  { t: 'UInt32', v: '4294967295' }, { t: 'UInt32', v: '7' },
  { t: 'Int64', v: '-9223372036854775808' }, { t: 'Int64', v: '12' }, { t: 'UInt64', v: '18446744073709551615' }, { t: 'UInt64', v: '3' },
  ...['1.5', String(Math.fround(0.1)), '-0', 'NaN', 'Infinity', String(Math.fround(3.4028234663852886e38)), String(Math.fround(1e-45)), '12', String(Math.fround(123456.789))].map((v) => ({ t: 'Single', v })),
  ...['0.1', '-0', '1e+308', '5e-324', 'NaN', '-Infinity', '12', '2024', '1.5', '123456789.123', '1e+21', '0.30000000000000004'].map((v) => ({ t: 'Double', v })),
  ...['0', '1.50', '-79228162514264337593543950335', '0.0000000000000000000000000001', '12', '-3.25'].map((v) => ({ t: 'Decimal', v })),
  { t: 'DateTime', v: TICKS(2024, 2, 29, 13, 45, 30, 1234567), k: 0 },
  { t: 'DateTime', v: TICKS(2024, 2, 29, 13, 45, 30, 1234567), k: 1 },
  { t: 'DateTime', v: TICKS(2024, 2, 29, 13, 45, 30, 1234567), k: 2 },
  { t: 'DateTime', v: TICKS(1996, 1, 1), k: 2 },
  { t: 'DateTime', v: TICKS(2000, 12, 31, 23, 59, 59), k: 1 },
  { t: 'DateTime', v: TICKS(2010, 7, 4, 8, 5, 9, 5000000), k: 0 },
  { t: 'DateTime', v: '3155378975999999999', k: 0 },
  { t: 'TimeSpan', v: '0' }, { t: 'TimeSpan', v: '937845000000' }, { t: 'TimeSpan', v: '-36000000000' }, { t: 'TimeSpan', v: '1' },
  { t: 'TimeSpan', v: '9223372036854775807' }, { t: 'TimeSpan', v: '864000000000' },
  { t: 'Uri', v: 'http://example.com/a b', k: 1 }, { t: 'Uri', v: 'rel/x', k: 2 }, { t: 'Uri', v: 'urn:x', k: 0 },
  { t: 'ByteArray', v: '4869' }, { t: 'ByteArray', v: '' },
  { t: 'StringArray', a: ['a', 'b'] },
  { t: 'Guid', v: '6f9619ff-8b86-d011-b42d-00c04fc964ff' },
];
const TARGETS = ['av', 'dav', 'iv', 'idv', 'cv', 'cdv', 'iother'];

// set: every data type with every CLR value, cycling through the targets.
let ti = 0;
for (const dt of DATA_TYPES) {
  for (const val of CLR) {
    const s = schema();
    cases.push({ k: 'set', s, h: host(s), dt, ops: [{ tgt: TARGETS[ti++ % TARGETS.length], val }] });
  }
}
// set without a data type: every value through every target (the data type is derived from the value).
for (const val of CLR) {
  for (const tgt of TARGETS) {
    const s = schema();
    cases.push({ k: 'set', s, h: host(s), dt: null, ops: [{ tgt, val }] });
  }
}
// set sequences: the first value fixes the data type, later values are encoded with it.
for (let i = 0; i < 400; i++) {
  const s = schema();
  const n = 2 + Math.floor(rnd() * 3);
  const ops = [];
  for (let j = 0; j < n; j++) ops.push({ tgt: pick(TARGETS), val: pick(CLR) });
  cases.push({ k: 'set', s, h: host(s), dt: rnd() < 0.3 ? pick(DATA_TYPES) : null, ops });
}

// cmp: pairs of attributes, mostly with the same data type.
const CMP_TYPES = ['xs:int', 'xs:double', 'xs:float', 'xs:decimal', 'xs:integer', 'xs:string', 'xs:boolean', 'xs:dateTime', 'xs:date', 'xs:time',
  'xs:duration', 'xs:anyURI', 'xs:gDay', 'xs:gYear', 'xs:long', 'xs:unsignedLong', 'xs:byte', 'xs:unsignedByte', 'xs:short', 'xs:unsignedShort',
  'xs:unsignedInt', 'xs:hexBinary', 'xs:base64Binary', 'xs:Name', 'xs:QName', 'xs:token', 'xs:gMonthDay', null, 'xs:unknown', ''];
const CMP_VALUES = [null, '', 'a', 'b', 'B', 'ä', '0', '1', '-1', '1.0', '1.5', '10', '2', 'NaN', 'INF', 'true', 'false', '2024-02-29T13:45:30',
  '2024-02-29T13:45:30Z', '2024-02-29', '13:45:30', 'P1D', 'PT24H', 'http://a/', 'http://A/', 'rel', 'SGk=', '4869', 'a_x0020_b', 'a b', '---05', '5', '--02-29', 'x'];
for (let i = 0; i < 2500; i++) {
  const dt = pick(CMP_TYPES);
  cases.push({ k: 'cmp', s: schema(), a: { dt, v: pick(CMP_VALUES) }, b: { dt: rnd() < 0.9 ? dt : pick(CMP_TYPES), v: pick(CMP_VALUES) } });
}

// static tables.
cases.push({
  k: 'static',
  types: ['String', 'Boolean', 'SByte', 'Byte', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64', 'Single', 'Double', 'Decimal', 'DateTime',
    'TimeSpan', 'Uri', 'ByteArray', 'StringArray', 'ObjectArray', 'Guid', 'Object', 'XmlQualifiedName', 'Null'],
  dts: DATA_TYPES,
});

// enc: the six encoders with names, tokens and invalid characters.
const ENC_STRINGS = [null, '', ' ', 'abc', 'a b', 'a  b', '  a   b  ', 'a\tb', 'a\nb', 'a\r\nb', '\t', '1abc', '-a', '.a', 'a-b.c', 'a:b', 'a:b:c', ':a', 'a:',
  ':', 'x:1', '1:x', '_', '_x0020_', 'a_x0020_b', 'a_x20_', 'ä', 'ß-1', '日本', '😀', 'a😀b', 'a<b', 'a&b', 'a/b', '#', '·a', 'a·', 'x\u0000y', ' lead', 'trail '];
for (const enc of ['TokenEncoder', 'NameEncoder', 'NCNameEncoder', 'NMTokenEncoder', 'NormalizedStringEncoder', 'LocalNameEncoder']) {
  cases.push({ k: 'enc', enc, strs: ENC_STRINGS });
}

// setdbl / setdt.
for (const v of ['0', '-0', '1.5', '0.1', '1e+308', '5e-324', 'NaN', 'Infinity', '-Infinity', '123456789012345680000', '1e-7', '-2.5']) {
  cases.push({ k: 'setdbl', s: schema(), v });
}
for (const val of CLR.filter((c) => c.t === 'DateTime')) {
  for (const mode of [0, 1, 2, 3]) cases.push({ k: 'setdt', s: schema(), val, mode });
}

// sadt: SetAttributeDataType(Type) and SetAttributeDataType(object).
for (const type of ['String', 'Boolean', 'SByte', 'Byte', 'Int16', 'UInt16', 'Int32', 'UInt32', 'Int64', 'UInt64', 'Single', 'Double', 'Decimal',
  'DateTime', 'TimeSpan', 'Uri', 'ByteArray', 'StringArray', 'Guid', 'Object', 'XmlQualifiedName']) {
  cases.push({ k: 'sadt', s: schema(), type, dt: pick([null, 'xs:int', '']) });
}
for (const val of CLR) cases.push({ k: 'sadt', s: schema(), val, dt: pick([null, 'xs:int', '']) });

// props: sequences of raw sets of Unit, RefAttributeType, AttributeDataType, Value and DefaultValue.
const PROP_VALUES = [null, '', ' ', 'mm', 'mm', '°C', 'a b', 'AutomationMLBaseAttributeTypeLib/Frame', 'xs:double'];
for (let i = 0; i < 200; i++) {
  const s = schema();
  const ops = [];
  for (let j = 0; j < 6; j++) ops.push({ p: pick(['Unit', 'RefAttributeType', 'AttributeDataType', 'Value', 'DefaultValue']), v: pick(PROP_VALUES) });
  cases.push({ k: 'props', s, h: host(s), ops });
}

// cons: constraints with nominal, ordinal and unknown requirements.
const CONS_TYPES = ['xs:int', 'xs:double', 'xs:string', 'xs:boolean', 'xs:dateTime', 'xs:decimal', 'xs:token', 'xs:Name', 'xs:duration', 'xs:gYear', null, 'xs:unknown'];
const CONS_RAW = ['1', '2', '1.5', 'a', 'a b', ' a  b ', 'true', '0', '2024-02-29T13:45:30', 'P1D', '2024', 'x_x0020_y', ''];
for (let i = 0; i < 150; i++) {
  const s = schema();
  const nominal = [];
  for (let j = 0; j < 1 + Math.floor(rnd() * 4); j++) nominal.push(pick(CONS_RAW));
  const nomSet = [];
  for (let j = 0; j < 2; j++) nomSet.push({ key: pick(CONS_RAW), val: pick(CLR) });
  const ordSet = [];
  for (let j = 0; j < 3; j++) ordSet.push({ name: pick(['RequiredValue', 'RequiredMinValue', 'RequiredMaxValue', 'Other']), val: pick(CLR) });
  cases.push({
    k: 'cons', s, h: host(s), dt: pick(CONS_TYPES), nominal, nomSet,
    ord: { min: pick([null, ...CONS_RAW]), max: pick([null, ...CONS_RAW]), req: pick([null, ...CONS_RAW]) }, ordSet,
    unknown: pick([null, '', 'must be positive']), second: pick(['nominal', 'ordinal', 'unknown']),
  });
}

// sem: RefSemantic and the AMLID helpers.
for (let i = 0; i < 60; i++) {
  const s = schema();
  const ops = [];
  for (let j = 0; j < 5; j++) ops.push({ op: pick(['sem', 'amlid', 'has', 'path']), v: pick([null, '', 'a', '123', 'AMLID:123', 'x/y']) });
  cases.push({ k: 'sem', s, h: host(s), ops });
}

// cmpr: AttributeValueComparer on elements with and without the attribute.
cases.push({ k: 'cmpr', vals: [null, '', 'a', 'A', 'a ', 'b'], nulls: true });

// corpus: every attribute of every corpus file.
const corpusDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'test', 'corpus');
for (const f of readdirSync(corpusDir).filter((f) => f.endsWith('.aml')).sort()) cases.push({ k: 'corpus', file: f });

writeFileSync(out, JSON.stringify(cases));
console.log(`${cases.length} cases -> ${out}`);
