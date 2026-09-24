// XmlConvert: number / boolean / duration / date parsing and formatting, name helpers.
import { dblHex, ticksOf } from './datetime.mjs';

const MAX = 3155378975999999999n;
const LONG_MAX = (1n << 63n) - 1n;
const LONG_MIN = -(1n << 63n);

function sglHex(v) {
  const b = Buffer.alloc(4);
  b.writeFloatBE(v);
  return b.toString('hex');
}

export default function (rng) {
  const cases = [];
  const add = (fn, ...args) => cases.push({ fn, args });

  // ---- numbers (the parsing itself is verified in "number"; here: XmlConvert's styles and trimming)
  const numInputs = [
    '0', '-0', '+0', '1', '-1', '+1', ' 1', '1 ', '\t1\n', '\r1\r', '\u000b1', ' 1', '1\u0000', '', ' ', '-', '+', '1.5', '-1.5', '.5', '5.', '1e3', '1E+3', '1e-3', '-1e3', '1,000',
    '(1)', '1-', '- 1', '0x10', 'INF', '-INF', '+INF', 'inf', 'Infinity', '-Infinity', 'NaN', '-NaN', 'nan', ' INF ', '\tINF', ' -INF', '1.7976931348623157E+308', '1.8E+308', '-1.8e308',
    '4.9E-324', '2.4703282292062328E-324', '3.4028235E+38', '3.4028236E+38', '1.4E-45', '0.1', '0.30000000000000004', '123456789012345678901234567890', '79228162514264337593543950335',
    '79228162514264337593543950336', '-79228162514264337593543950335', '0.0000000000000000000000000001', '0.00000000000000000000000000001', '1.50', '1.00000000000000000000000000005',
    '127', '128', '-128', '-129', '255', '256', '32767', '32768', '-32768', '-32769', '65535', '65536', '2147483647', '2147483648', '-2147483648', '-2147483649', '4294967295', '4294967296',
    '9223372036854775807', '9223372036854775808', '-9223372036854775808', '-9223372036854775809', '18446744073709551615', '18446744073709551616', '00000000000000000000000001', '1 ',
    '٣', '１', '1_000', '0.0e0', '-0.0', '-0e5', '-.0', '-0.', '1e', 'e1', '1e+', '--1', '+-1', '1.2.3', 'true', 'false', 'True', ' true ', '1 1',
  ];
  const numFns = ['xc.toDouble', 'xc.toSingle', 'xc.toDecimal', 'xc.toInt16', 'xc.toInt32', 'xc.toInt64', 'xc.toUInt16', 'xc.toUInt32', 'xc.toUInt64', 'xc.toByte', 'xc.toSByte', 'xc.toBoolean'];
  for (const f of numFns) for (const s of numInputs) add(f, s);
  for (const s of ['1', '0', 'true', 'false', ' true', 'true\n', '\ttrue\r', 'TRUE', 'True', 'yes', '01', '1.0', ' true', '']) add('xc.toBoolean', s);
  for (let i = 0; i < 200; i++) {
    const digits = Array.from({ length: rng.range(1, 25) }, () => rng.int(10)).join('');
    const s = rng.pick(['', '-', '+', ' ', ' -']) + digits + rng.pick(['', '.' + rng.int(1000), 'e' + rng.range(-30, 30), ' ', '\n']);
    add(rng.pick(numFns), s);
  }

  // ---- number output
  const doubles = [0, -0, 1, -1, 0.1, 1 / 3, 1e15, 1e16, 1e-5, 1e-4, 123456789.123, 1.7976931348623157e308, 5e-324, Infinity, -Infinity, NaN, 100, 1e21, 2 ** 53, 0.000001234];
  for (const v of doubles) add('xc.strDouble', dblHex(v));
  for (let i = 0; i < 200; i++) add('xc.strDouble', rng.hex64());
  const floats = [0, -0, 1, -1, 0.1, 1 / 3, 1e7, 1e8, 16777216, 3.4028234663852886e38, 1.401298464324817e-45, Infinity, -Infinity, NaN, 1e-5, 123.456];
  for (const v of floats) add('xc.strSingle', sglHex(v));
  for (let i = 0; i < 200; i++) add('xc.strSingle', rng.hex32());
  for (const s of ['0', '0.0', '-0', '-0.00', '1.50', '79228162514264337593543950335', '-1', '0.0000000000000000000000000001', '123.4560']) add('xc.strDecimal', s);
  for (const b of [true, false]) add('xc.strBoolean', b);
  for (const [t, v] of [['Int16', '-32768'], ['Int32', '2147483647'], ['Int64', '-9223372036854775808'], ['UInt16', '65535'], ['UInt32', '4294967295'], ['UInt64', '18446744073709551615'], ['Byte', '255'], ['SByte', '-128'], ['Int32', '0']]) add('xc.strInt', t, v);

  // ---- durations
  const durations = [
    'P1D', 'PT1H', 'PT1M', 'PT1S', 'P1Y', 'P1M', 'P1Y2M3DT4H5M6S', '-P1D', 'PT0S', 'P0D', 'PT0.5S', 'PT.5S', 'PT1.S', 'PT1.123456789S', 'PT1.1234567891S', 'PT0.00000005S', 'PT0.0000001S',
    'P', 'PT', '-P', '-', '', ' ', ' P1D ', ' P1D', 'p1d', 'P1d', 'P1DT', 'P1H', 'PT1D', 'P1DT1H1M1.5S', 'P13M', 'P12M', 'P1Y13M', 'P2147483647D', 'P2147483648D', 'PT2147483647H',
    'P10675199DT2H48M5.4775807S', 'P10675199DT2H48M5.4775808S', '-P10675199DT2H48M5.4775808S', '-P10675199DT2H48M5.4775809S', 'P29227Y', 'P29228Y', 'P25252734927766554Y', 'PT1.9999999999999S',
    'PT99999999999S', 'PT1.99999999999999999999S', 'P1Y1D', 'P1M1D', 'P1YT1S', 'PT1H1S', 'PT1M1.5S', 'P1.5D', 'PT1,5S', '+P1D', 'P-1D', 'P1DT1H1M1S1', 'P01D', 'PT001H', 'P1D ', 'P1D\n', 'P1D x',
  ];
  for (const s of durations) add('xc.toTimeSpan', s);
  for (let i = 0; i < 200; i++) {
    let s = rng.next() < 0.2 ? '-P' : 'P';
    if (rng.next() < 0.3) s += rng.range(0, 50) + 'Y';
    if (rng.next() < 0.3) s += rng.range(0, 30) + 'M';
    if (rng.next() < 0.5) s += rng.range(0, 400) + 'D';
    if (rng.next() < 0.7) {
      s += 'T';
      if (rng.next() < 0.5) s += rng.range(0, 30) + 'H';
      if (rng.next() < 0.5) s += rng.range(0, 90) + 'M';
      if (rng.next() < 0.6) s += rng.range(0, 90) + (rng.next() < 0.5 ? '.' + rng.range(0, 999999999) : '') + 'S';
    }
    add('xc.toTimeSpan', s);
  }
  const spans = [0n, 1n, -1n, 10000000n, 5000000n, 864000000000n, -864000000000n, 36000000000n + 600000000n * 30n, LONG_MAX, LONG_MIN, LONG_MIN + 1n, 1234567n, 100n];
  for (const t of spans) add('xc.strTimeSpan', t.toString());
  for (let i = 0; i < 150; i++) add('xc.strTimeSpan', rng.bigint(LONG_MIN, LONG_MAX).toString());

  // ---- dates: XmlConvert.ToDateTime(s, mode)
  const dates = [
    '2020-01-05T10:00:00', '2020-01-05T10:00:00Z', '2020-01-05T10:00:00z', '2020-01-05T10:00:00+01:00', '2020-01-05T10:00:00-08:00', '2020-01-05T10:00:00+14:00', '2020-01-05T10:00:00+99:99',
    '2020-01-05T10:00:00.1', '2020-01-05T10:00:00.1234567', '2020-01-05T10:00:00.12345678', '2020-01-05T10:00:00.12345675', '2020-01-05T10:00:00.12345665', '2020-01-05T10:00:00.123456650001',
    '2020-01-05T10:00:00.99999999', '9999-12-31T23:59:59.9999999', '9999-12-31T23:59:59.99999999', '9999-12-31T23:59:59.99999995', '0001-01-01T00:00:00', '0001-01-01T00:00:00+01:00',
    '0001-01-01T00:30:00+01:00', '0001-01-01T00:00:00-01:00', '9999-12-31T23:00:00-01:00', '9999-12-31T23:00:00+01:00', '0000-01-01T00:00:00', '2020-02-29T00:00:00', '2021-02-29T00:00:00',
    '2020-13-01T00:00:00', '2020-01-32', '2020-01-05', '2020-01-05Z', '2020-01-05+02:00', '2020-01-05-02:00', '2020-01', '2020-01Z', '2020-13', '2020', '2020Z', '2020+05:00', '0000', '99999',
    '--01-15', '--02-29', '--02-30', '--13-01', '--01', '--01--', '--12--Z', '---15', '---31', '---32', '---00', '10:30:00', '10:30:00Z', '10:30:00+02:00', '23:59:59.9999999', '24:00:00', '10:30',
    '10:30:00.', ' 2020-01-05T10:00:00 ', '\t2020-01-05\n', ' 2020-01-05　', '2020-01-05T10:00:00 Z', '2020-01-05T10:00:00+0100', '2020-01-05T10:00:00+01', '2020-01-05 10:00:00',
    '2020-1-5', '20-01-05', '2020-01-05T1:00:00', '2020-01-05T10:00:00+01:00x', '', ' ', 'x', '2021-03-28T02:30:00', '2021-03-28T01:30:00Z', '2021-10-31T00:30:00Z', '2021-10-31T01:30:00Z',
    '2021-10-31T02:30:00', '2021-10-31T02:30:00+02:00', '2021-10-31T02:30:00+01:00', '1970-07-01T12:00:00Z', '2020-06-15T12:00:00+00:00', '2020-06-15T12:00:00-00:00',
  ];
  for (const s of dates) for (const m of [0, 1, 2, 3]) add('xc.toDateTime', s, m);
  add('xc.toDateTime', '2020-01-05', 4);
  for (let i = 0; i < 300; i++) {
    const y = rng.range(1996, 2037);
    const p2 = (v) => String(v).padStart(2, '0');
    let s = `${y}-${p2(rng.range(1, 12))}-${p2(rng.range(1, 28))}`;
    if (rng.next() < 0.8) s += `T${p2(rng.range(0, 23))}:${p2(rng.range(0, 59))}:${p2(rng.range(0, 59))}`;
    if (rng.next() < 0.3) s += '.' + rng.range(0, 99999999);
    const z = rng.int(4);
    if (z === 1) s += 'Z';
    if (z === 2) s += `${rng.pick(['+', '-'])}${p2(rng.range(0, 14))}:${p2(rng.pick([0, 30, 45]))}`;
    add('xc.toDateTime', s, rng.range(0, 3));
  }

  // ---- dates: XmlConvert.ToString(DateTime, mode) and (DateTime, format)
  const dts = [0n, 1n, MAX, ticksOf(2020, 1, 5, 10), ticksOf(2020, 7, 5, 10) + 1234567n, ticksOf(2021, 3, 28, 2, 30), ticksOf(2021, 10, 31, 2, 30), ticksOf(2021, 10, 31, 0, 30), ticksOf(2021, 10, 31, 1, 30), ticksOf(2026, 9, 25, 12)];
  for (const t of dts) {
    for (const k of [0, 1, 2]) {
      for (const m of [0, 1, 2, 3]) add('xc.strDateTime', t.toString(), k, m);
      for (const f of ['HH:mm:ss', 'yyyy-MM-dd', '--MM-dd', 'yyyy-MM', '---dd', '--MM--', 'yyyy', 's', 'o', 'yyyy-MM-ddTHH:mm:ss.fffffffzzzzzz']) add('xc.strDateTimeFmt', t.toString(), k, f);
    }
  }
  for (let i = 0; i < 300; i++) {
    const t = rng.next() < 0.3 ? rng.bigint(0n, MAX) : ticksOf(rng.range(1996, 2037), rng.range(1, 12), rng.range(1, 28), rng.range(0, 23), rng.range(0, 59), rng.range(0, 59)) + BigInt(rng.int(10000000));
    add('xc.strDateTime', t.toString(), rng.range(0, 2), rng.range(0, 3));
  }
  for (const s of ['ca761232-ed42-11ce-bacd-00aa0057b223', '00000000-0000-0000-0000-000000000000']) add('xc.strGuid', s);

  // ---- names
  const names = [
    null, '', 'a', 'A1', '1a', '_a', ':a', 'a:b', 'a b', 'a-b', '-a', '.a', 'a.', 'ä', 'Ĳ', 'ĳ', 'ǅ', '·a', 'a·', '̀a', 'à', '中文', '、', 'ำ', 'ʻ', 'ˁ', '྄',
    '😀', 'a😀', '𠀀', 'x_x0041_', '_x0041_', '_x0041', '_X0041_', '_x004G_', '_x00410041_', '_x0010FFFF_', '_x00110000_', 'a_x0020_b', '__x0041_', '_x0041__x0042_', '_x0041_x0042_',
    'a_x', '_x_', 'AttributeName', 'Some Name', 'a\tb', 'a\nb', ' a', 'a ', 'a  b', 'a b c', '#text', 'xmlns', 'xml:lang', 'a%b', 'a/b', '123', '$', 'ab:', '::', '_', '·', '·',
    'K', 'ﬀ', 'Ａ', 'Ⅰ', '١', 'A١', '_x1234_abc_x5678_', '_xD83D__xDE00_', '_x0000D83D_', '_x0001F600_', '_x0041_rest', 'x_x0041_y_x0042_z',
  ];
  for (const f of ['xc.verifyNCName', 'xc.verifyName', 'xc.verifyNMTOKEN', 'xc.verifyTOKEN', 'xc.encodeName', 'xc.encodeLocalName', 'xc.encodeNmToken', 'xc.decodeName']) {
    for (const n of names) add(f, n);
  }
  const alpha = ['a', 'Z', '1', '_', ':', '-', '.', ' ', 'ä', 'Ĳ', '中', '·', '_x0041_', '_x00e4_', '_x', '😀', '̀', '#'];
  for (let i = 0; i < 400; i++) {
    let s = '';
    const n = rng.range(1, 6);
    for (let j = 0; j < n; j++) s += rng.pick(alpha);
    add(rng.pick(['xc.verifyNCName', 'xc.verifyName', 'xc.verifyNMTOKEN', 'xc.encodeName', 'xc.encodeLocalName', 'xc.encodeNmToken', 'xc.decodeName']), s);
  }
  return cases;
}
