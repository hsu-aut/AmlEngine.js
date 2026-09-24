// Number layer: integer/float/decimal parsing (TryParse and Parse with NumberStyles), double/float
// formatting, System.Decimal conversions and comparison. Evaluated by test/system/eval/number.ts.

const buf = new DataView(new ArrayBuffer(8));

function dblHex(v) {
  buf.setFloat64(0, v);
  return buf.getBigUint64(0).toString(16).padStart(16, '0');
}

function sglHex(v) {
  buf.setFloat32(0, v);
  return buf.getUint32(0).toString(16).padStart(8, '0');
}

function dblFromBits(b) {
  buf.setBigUint64(0, b);
  return buf.getFloat64(0);
}

/** [mantissa, exp2] of a positive finite double (value = m * 2^e) */
function dblParts(v) {
  buf.setFloat64(0, v);
  const bits = buf.getBigUint64(0);
  let m = bits & 0xfffffffffffffn;
  const be = Number((bits >> 52n) & 0x7ffn);
  if (be === 0) return [m, -1074];
  m |= 1n << 52n;
  return [m, be - 1075];
}

function sglParts(v) {
  buf.setFloat32(0, v);
  const bits = buf.getUint32(0);
  let m = BigInt(bits & 0x7fffff);
  const be = (bits >>> 23) & 0xff;
  if (be === 0) return [m, -149];
  m |= 1n << 23n;
  return [m, be - 150];
}

/** exact decimal string of m * 2^e */
function exactDec(m, e) {
  if (e >= 0) return (m << BigInt(e)).toString();
  const k = -e;
  const s = (m * 5n ** BigInt(k)).toString().padStart(k + 1, '0');
  return (s.slice(0, s.length - k) + '.' + s.slice(s.length - k)).replace(/0+$/, '').replace(/\.$/, '');
}

/** exact decimal string of the midpoint between a positive value and the next one up */
function midpoint(parts) {
  const [m, e] = parts;
  return exactDec(2n * m + 1n, e - 1);
}

/** a decimal string just below/above s (appends digits) */
const above = (s) => (s.includes('.') ? s + '000000000000000000001' : s + '.000000000000000000001');
function below(s) {
  // s is a positive decimal with a fractional part ending in 5: replace the final 5 by 4999...9
  if (!s.endsWith('5')) return null;
  return s.slice(0, -1) + '4999999999999999999999';
}

const WS = ['\t', '\n', '\v', '\f', '\r', ' ', '\u00a0', '\u2000', '\u3000', '\u0085', '\u200b', '\ufeff'];

const INT_BOUNDS = {
  SByte: [-128n, 127n],
  Byte: [0n, 255n],
  Int16: [-32768n, 32767n],
  UInt16: [0n, 65535n],
  Int32: [-2147483648n, 2147483647n],
  UInt32: [0n, 4294967295n],
  Int64: [-9223372036854775808n, 9223372036854775807n],
  UInt64: [0n, 18446744073709551615n],
};
const INT_TYPES = Object.keys(INT_BOUNDS);

const INT_STRINGS = [
  '0', '-0', '+0', '00', '000', '-000', '1', '-1', '+1', '01', '-01', '+01', '0001', '12', '123', '-123',
  ' 1', '1 ', ' 1 ', '\t1\n', '\v1\f', '\r1\r', ' \u00a01', '1\u00a0', '\u20001', '1\u2000', '\u30001',
  '- 1', '-  1', '+ 1', '+-1', '-+1', '--1', '++1', '1-', '1+', '(1)', '(-1)', '-(1)', '1,000', '1,0', ',1', '1,',
  '1.0', '1.', '.0', '1.5', '-1.5', '1.00', '0.0', '-0.0', '1e3', '1E3', '1e', '0x10', '0X10', '10h', 'ff', 'FF',
  '10\0', '1\0\0', '1\0a', '1\0 ', '1 \0', '\0', '\x001', '', ' ', '   ', '-', '+', '1 2', '1\t\t', '\t\t1',
  '\uff11', '\u0663', '1_000', '\u00a41', '1\u00a4', '9', '99', '255', '256', '-129', '-128', '127', '128',
  '32767', '32768', '-32768', '-32769', '65535', '65536', '0000000000000000000000000001',
  '99999999999999999999999999', '-99999999999999999999999999', '00000000000000000000000000000000000000000',
  '-00000000000000000000000000000000000000000', '18446744073709551616', '18446744073709551615',
  '9223372036854775807', '9223372036854775808', '-9223372036854775808', '-9223372036854775809',
  '2147483647', '2147483648', '-2147483648', '-2147483649', '4294967295', '4294967296', '4294967296 ',
  '42949672950', '-0 ', '-00 ', '-0\0', '-01 ', ' -0', '+00', '1\n\0', '12345678901234567890123',
  '1234567890123456789 x', '12345678901234567890 x', '99999999999 ', '99999999999x',
];

const STYLES = [
  0, 1, 2, 3, 4, 7, 8, 12, 15, 16, 20, 23, 32, 39, 64, 71, 96, 103, 111, 128, 135, 167, 231, 256, 263, 383, 511,
  512, 513, 514, 515, 516, 519, 1024, 1027, 1028, 1536, 2048, 2055, -1,
];

const STYLE_STRINGS = [
  '1', '-1', ' 1 ', '1,000', '1,000,000', ',1', '1,,2', '1,', '(5)', '( 5 )', ' (5) ', '(-5)', '-(5)', '(5', '5)',
  '5-', '5+', '5 -', ' 5- ', '-5-', '(5)-', '1e3', '1E+3', '1e-3', '10e-1', '1.0e1', '1e', '1e+', '1e-', '1ee3',
  '1.0', '1.5', '1.00000', '-0.0', '0.0', '.5', '5.', '.', '1.2.3', '1,000.5', '1.000,5', '\u00a45', '5\u00a4',
  '\u00a4 5', '\u00a4-5', '-\u00a45', '\u00a4(5)', '(\u00a45)', ' \u00a4 -5', '\u00a4\u00a45', 'ff', 'FF', 'fF',
  '0x1F', '1F', ' 1F ', '7F', '80', '7FFF', '8000', 'FFFF', '10000', '7FFFFFFF', '80000000', 'FFFFFFFF',
  '100000000', '7FFFFFFFFFFFFFFF', '8000000000000000', 'FFFFFFFFFFFFFFFF', '10000000000000000',
  '0000000000000000000000FF', '101', '11111111', '111111111', '1111111111111111', '10000000000000000', '12',
  '', null, '1e5', '123456789012345678901234567890', '1\0', '1 \0', '\u00a01', '- 1', '+ 1', '1 +', '0', '-0',
  '1e1000', '1e-1000', '99999999999e-10', '1.5e1', '25.5e1', '2550e-1', '2560e-1', '1.99999999999999999999e1',
];

const FLOAT_STRINGS = [
  '0', '-0', '+0', '0.0', '-0.0', '00.00', '1', '-1', '1.5', '.5', '5.', '-.5', '+.5', '1e10', '1E10', '1e+10',
  '1e-10', '1e', '1e+', '1e-', '1.e5', '.e5', 'e5', '1e400', '-1e400', '1e-400', '-1e-400', '4.9e-324', '5e-324',
  '2.4703282292062327e-324', '2.4703282292062328e-324', '2.47032822920623272088e-324', '1.7976931348623157e308',
  '1.7976931348623158e308', '1.7976931348623159e308', '1.797693134862315807e308', '1.797693134862315808e308',
  '1.79769313486231580793728971405301e308', '1.79769313486231580793728971405302e308', '2.2250738585072011e-308',
  '2.2250738585072012e-308', '2.2250738585072014e-308', 'Infinity', 'infinity', 'INFINITY', 'iNfInItY', '-Infinity',
  '+Infinity', ' Infinity ', '\tInfinity\n', '\u00a0Infinity', '\u2000NaN\u3000', '\u0085NaN', '\u200bNaN', '\ufeffNaN',
  'NaN', 'nan', 'NAN', '-NaN', '+NaN', '-nan', '+nan', '- NaN', '+ Infinity', '-  Infinity', 'Infinity\0', 'NaN\0',
  '\u221e', '-\u221e', '+\u221e', 'Inf', '-Inf', 'Infinityy', '\u0131nfinity', 'Infin\u0131ty', '--Infinity',
  '-+Infinity', '+-Infinity', '++Infinity', '+ NaN', '1,000.5', '1,000,000', ',5', '1,,2', '1.2.3', '0x10', '1e1000',
  '1e-1000', '1e99999', '0e99999', '-0e99999', '0e-99999', '1e2147483648', '123456789012345678901234567890',
  '9007199254740993', '9007199254740992.5', '9007199254740993.0000000000000000000001', '9007199254740995',
  '9007199254740994.9999999999999999', '16777217', '16777217.000001', '16777219', '16777218.5', '3.4028235e38',
  '3.4028236e38', '3.40282346638528859811704183484516925440e38', '3.40282356779733661637539395458142568448e38',
  '3.40282356779733661637539395458142568447e38', '3.40282356779733661637539395458142568449e38', '1.4e-45', '1e-45',
  '7e-46', '7.006492321624085e-46', '7.00649232162408535461864791644958065640130970938257885878534141944895541342930300743319094181060791015625e-46',
  '7.00649232162408535461864791644958065640130970938257885878534141944895541342930300743319094181060791015626e-46',
  '1.17549435e-38', '1.1754942e-38', '0.1', '0.2', '0.3', '1e23', '8.589973e9', '1.00000017881393432617187499',
  '1.000000178813934326171875', '1.00000017881393432617187501', '0.000000000000000000000000000000000000000000001',
  '1 ', ' 1', '\t1\t', '\v1\f', ' \u00a01', '1\u00a0', '- 1', '1-', '(1)', '1\0', '1\0\0', '1\0x', '', ' ', '-', '+',
  '.', '1e5 ', '1e 5', '1 e5', '12,34.5', '123,4', '1,2,3', '9,', '1_0', '\uff11', '0.5e1', '5e-1',
  '179769313486231580793728971405303415079934132710037826936173778980444968292764750946649017977587207096330286416692887910946555547851940402630657488671505820681908902000708383676273854845817711531764475730270069855571366959622842914819860834936475292719074168444365510704342711559699508093042880177904174497791.9999',
  '179769313486231580793728971405303415079934132710037826936173778980444968292764750946649017977587207096330286416692887910946555547851940402630657488671505820681908902000708383676273854845817711531764475730270069855571366959622842914819860834936475292719074168444365510704342711559699508093042880177904174497792',
  '0.' + '0'.repeat(400) + '1e400', '1' + '0'.repeat(400) + 'e-400', '1.' + '0'.repeat(800) + '1',
  '0.' + '0'.repeat(320) + '4940656458412465441765687928682213723651', '4.' + '9'.repeat(900),
];

const BOOL_STRINGS = [
  'True', 'true', 'TRUE', 'tRuE', 'False', 'false', 'FALSE', 'fAlSe', ' true', 'true ', ' true ', '\ttrue\n',
  '\0true', 'true\0', '\0\0true\0 ', '\u00a0true', '\u2000false\u3000', '\u0085true', '\u200btrue', '\ufefftrue',
  '1', '0', 'yes', 'no', '', 't', 'f', 'tru', 'truee', 'true false', 'tr ue', '  ', '\0', '\0\0\0\0\0', ' True',
  'True ', 'false\0\0', '\0false', ' tRUE\r\n', 'T', 'TRUE\u0000 ', '\u0131true', 'truE\u00a0', 'fals', 'falsee',
  '\ttrue', 'true\t', '    true', ' \0 true \0 ',
];

const DEC_STRINGS = [
  '0', '-0', '+0', '0.000', '-0.00', '00.0', '1', '-1', '1.50', '-1.50', '1.500000000000000000000000000000',
  '79228162514264337593543950335', '79228162514264337593543950336', '-79228162514264337593543950335',
  '-79228162514264337593543950336', '79228162514264337593543950335.4', '79228162514264337593543950335.5',
  '79228162514264337593543950334.5', '79228162514264337593543950334.50000000000001', '7922816251426433759354395033.5',
  '7922816251426433759354395033.55', '7922816251426433759354395033.45', '7922816251426433759354395033.4999999',
  '7922816251426433759354395034.5', '0.0000000000000000000000000001', '0.00000000000000000000000000001',
  '0.00000000000000000000000000005', '0.00000000000000000000000000006', '0.000000000000000000000000000050000000001',
  '0.00000000000000000000000000015', '0.00000000000000000000000000025', '0.000000000000000000000000000250',
  '0.0000000000000000000000000002500000000000000000000000001', '1.0000000000000000000000000005',
  '1.0000000000000000000000000015', '1.00000000000000000000000000050', '1.000000000000000000000000000500000001',
  '1.0000000000000000000000000004999', '1.23456789012345678901234567890123456789', '12345678901234567890123456789',
  '123456789012345678901234567890', '1234567890123456789012345678.9', '1234567890123456789012345678.95',
  '9999999999999999999999999999.9', '9999999999999999999999999999.5', '99999999999999999999999999999.5',
  '0.9999999999999999999999999999', '0.99999999999999999999999999995', '0.99999999999999999999999999994',
  '0.999999999999999999999999999950', '1e28', '1E-28', '1,000.50', '1,,000', ',1', '1,', '(1)', '1-', '1+', '- 1',
  ' 1 ', '\t1.5\n', '1\0', '1 \0', '\x001', '\u00a41', '1.2.3', '.5', '5.', '.', '-.5', '+.5', '', ' ', '-', '1.5e2',
  '3.0500000000000000000000000001e-27', '3.05000000000000000000000001', '3.0500000000000000000000000001',
  '3.05000000000000000000000000001', '3.050000000000000000000000000000000000001', '0.' + '0'.repeat(60) + '1',
  '1' + '0'.repeat(28), '1' + '0'.repeat(29), '4294967295', '4294967296', '18446744073709551615',
  '18446744073709551616', '18446744073709551615.5', '1844674407370955161.55', '-0.0000000000000000000000000000001',
  '\u00a01', '1\u00a0', '1,234,567.891', '1,2,3,4', '1 000', '(1.5)', '1.5-', '-1.5-', '(-1)',
];

const DEC_FORMATS = ['', 'G', 'g', 'G1', 'G5', 'G28', 'G29', 'G30', 'G0', 'F', 'F0', 'F1', 'F2', 'F5', 'F30', 'N', 'N0',
  'N3', 'E', 'e', 'E0', 'E3', 'E30', 'P', 'P0', 'P3', 'C', 'C0', 'C3', 'R', 'D', 'X', 'Z', 'F\0x', 'G05', 'G099'];

const DBL_FORMATS = ['', 'G', 'g', 'R', 'r', 'G1', 'G2', 'G3', 'G5', 'G6', 'G7', 'G9', 'G10', 'G15', 'G16', 'G17',
  'G20', 'G0', 'G30', 'E', 'e', 'E0', 'E1', 'E2', 'E5', 'E10', 'E16', 'E20', 'F', 'f', 'F0', 'F1', 'F2', 'F3', 'F5',
  'F10', 'F20', 'N', 'n', 'N0', 'N1', 'N5', 'P', 'P0', 'P4', 'C', 'C0', 'C4', 'X', 'D', 'Q', 'R5', 'G\0', 'F2\0zz'];

/** decimal string of mantissa and scale */
function decStr(m, scale, neg) {
  let s = m.toString();
  if (scale > 0) {
    s = s.padStart(scale + 1, '0');
    s = s.slice(0, s.length - scale) + '.' + s.slice(s.length - scale);
  }
  return (neg ? '-' : '') + s;
}

export default function (rng) {
  const cases = [];
  const add = (fn, ...args) => cases.push({ fn, args });
  const digits = (n, noLeadingZero = true) => {
    let s = '';
    for (let i = 0; i < n; i++) s += String(i === 0 && noLeadingZero ? 1 + rng.int(9) : rng.int(10));
    return s;
  };
  const randomDouble = () => {
    for (;;) {
      const v = dblFromBits(BigInt('0x' + rng.hex64()));
      if (Number.isFinite(v)) return v;
    }
  };
  const randomFloat = () => {
    for (;;) {
      buf.setUint32(0, Number(BigInt('0x' + rng.hex32())));
      const v = buf.getFloat32(0);
      if (Number.isFinite(v)) return v;
    }
  };

  // ------------------------------------------------------------------ plain integer TryParse
  const intStrings = [...INT_STRINGS];
  for (const [lo, hi] of Object.values(INT_BOUNDS)) {
    for (const v of [lo, hi, lo - 1n, hi + 1n, lo + 1n, hi - 1n, hi * 10n, hi + 10n]) {
      intStrings.push(v.toString(), '00' + v.toString(), ' ' + v.toString() + ' ');
      if (v >= 0n) intStrings.push('+' + v.toString(), '-' + v.toString());
    }
  }
  for (const w of WS) intStrings.push(w + '5', '5' + w, w + '-5' + w);
  for (const t of INT_TYPES) {
    for (const s of intStrings) add('p.' + t, s);
    const [lo, hi] = INT_BOUNDS[t];
    for (let i = 0; i < 40; i++) {
      const v = rng.bigint(lo - (hi - lo) / 8n, hi + (hi - lo) / 8n);
      add('p.' + t, v.toString());
    }
    for (let i = 0; i < 15; i++) add('p.' + t, (rng.int(2) ? '-' : '') + '0'.repeat(rng.int(5)) + digits(1 + rng.int(22)));
  }

  // ------------------------------------------------------------------ Parse with NumberStyles
  for (const s of STYLE_STRINGS) for (const st of STYLES) add('p.parse', 'Int32', s, st);
  for (const s of STYLE_STRINGS) for (const st of [7, 111, 167, 383, 511, 515, 1027]) add('p.parse', 'UInt32', s, st);
  for (const t of ['Int16', 'Int64', 'UInt16', 'UInt64', 'Byte', 'SByte']) {
    const [lo, hi] = INT_BOUNDS[t];
    const hexDigits = { Int16: 4, UInt16: 4, Int64: 16, UInt64: 16, Byte: 2, SByte: 2 }[t];
    for (const v of [lo, hi, lo - 1n, hi + 1n]) {
      for (const st of [7, 111, 511]) add('p.parse', t, v.toString(), st);
      add('p.parse', t, v.toString() + '.0', 111);
      add('p.parse', t, v.toString() + '.00001', 111);
      add('p.parse', t, v.toString().replace(/(\d)(?=(\d{3})+$)/g, '$1,'), 111);
      add('p.parse', t, v.toString() + 'e0', 167);
    }
    for (const st of [515, 1027]) {
      add('p.parse', t, 'F'.repeat(hexDigits), st);
      add('p.parse', t, '7' + 'F'.repeat(hexDigits - 1), st);
      add('p.parse', t, '8' + '0'.repeat(hexDigits - 1), st);
      add('p.parse', t, '1' + '0'.repeat(hexDigits), st);
      add('p.parse', t, '0'.repeat(10) + 'F'.repeat(hexDigits) + '  ', st);
      add('p.parse', t, '1'.repeat(hexDigits * 4), st);
      add('p.parse', t, '1'.repeat(hexDigits * 4 + 1), st);
      add('p.parse', t, '1'.repeat(hexDigits * 4 + 1) + 'x', st);
      add('p.parse', t, '1'.repeat(hexDigits * 4 + 1) + ' \0', st);
    }
    for (let i = 0; i < 120; i++) add('p.parse', t, rng.pick(STYLE_STRINGS), rng.pick(STYLES));
    for (let i = 0; i < 30; i++) {
      const v = rng.bigint(lo - (hi - lo) / 8n, hi + (hi - lo) / 8n);
      add('p.parse', t, (rng.int(2) ? '(' : '') + v.toString() + (rng.int(3) ? '' : '.000'), rng.pick([7, 111, 511]));
    }
  }
  for (const t of ['Double', 'Single', 'Decimal']) {
    for (const s of STYLE_STRINGS) for (const st of [0, 7, 111, 167, 231, 383, 511, 512, 515, 1024, 2048]) add('p.parse', t, s, st);
    for (const s of FLOAT_STRINGS.slice(0, 80)) add('p.parse', t, s, rng.pick([7, 111, 167, 231, 511]));
  }

  // ------------------------------------------------------------------ float TryParse
  for (const t of ['Double', 'Single']) {
    for (const s of FLOAT_STRINGS) add('p.' + t, s);
    for (const w of WS) add('p.' + t, w + '1.5' + w);
  }
  // random digit strings
  for (let i = 0; i < 700; i++) {
    const n = 1 + rng.int(rng.int(4) === 0 ? 40 : 20);
    const d = digits(n, rng.int(4) !== 0);
    const pt = rng.int(n + 1);
    let s = rng.int(3) === 0 ? d.slice(0, pt) + '.' + d.slice(pt) : d;
    if (rng.int(2)) s += 'e' + (rng.int(2) ? '-' : rng.int(2) ? '+' : '') + rng.int(rng.int(2) ? 330 : 50);
    if (rng.int(4) === 0) s = '-' + s;
    add(rng.int(3) === 0 ? 'p.Single' : 'p.Double', s);
  }
  // round trip strings of random values, ties and near ties
  for (let i = 0; i < 300; i++) {
    const v = Math.abs(randomDouble());
    if (v === 0) continue;
    add('p.Double', String(v));
    add('p.Double', v.toExponential(rng.int(20)));
    const mid = midpoint(dblParts(v));
    add('p.Double', mid);
    add('p.Double', above(mid));
    const b = below(mid);
    if (b) add('p.Double', b);
  }
  for (let i = 0; i < 300; i++) {
    const v = Math.abs(randomFloat());
    if (v === 0) continue;
    add('p.Single', String(v));
    add('p.Single', v.toPrecision(1 + rng.int(12)));
    const mid = midpoint(sglParts(v));
    add('p.Single', mid);
    add('p.Single', above(mid));
    const b = below(mid);
    if (b) add('p.Single', b);
    // the double closest to the float midpoint (double rounding hazards)
    add('p.Single', String(Number(mid)));
  }
  // Clinger fast path for float: m / 10^k with m <= 2^24, k <= 10 (double rounding)
  for (let i = 0; i < 400; i++) {
    const m = 1 + rng.int(1 << 24);
    const k = 1 + rng.int(10);
    const s = String(m);
    add('p.Single', s.length > k ? s.slice(0, s.length - k) + '.' + s.slice(s.length - k) : '0.' + s.padStart(k, '0'));
  }
  for (let i = 0; i < 100; i++) {
    const m = 1 + rng.int(1 << 24);
    add('p.Single', m + 'e' + rng.int(11));
    add('p.Double', String(rng.int(2 ** 30) * 2 ** 23 + rng.int(2 ** 23)) + 'e' + (rng.int(2) ? '-' : '') + rng.int(23));
  }

  // ------------------------------------------------------------------ bool
  for (const s of BOOL_STRINGS) add('p.Boolean', s);

  // ------------------------------------------------------------------ double / float formatting
  const specialDoubles = [
    0, -0, 1, -1, 0.1, 0.5, 1.5, 2.5, 1 / 3, 2 / 3, 100, 1e14, 1e15, 1e16, 1e17, 1e18, 123456789012345680,
    12345678901234567, 1234567890123456.7, 0.001, 0.0001, 0.00001, 0.000123, 1e-5, 1.5e-5, 5e-324, 1e-323,
    2.2250738585072014e-308, 2.225073858507201e-308, 1.7976931348623157e308, 9007199254740992, 9007199254740993,
    4.35, 0.125, 0.375, 1e21, 1e22, 1e23, 5e-7, 1.0000000000000002, 0.30000000000000004, 123.456, -123.456,
    Math.PI, Math.E, 2 ** 63, 2 ** 64, 2 ** -1022, 2 ** -1074, 2 ** 1023, 999999999999999.9, 99999999999999999,
    0.9999999999999999, 1e100, 1e-100, 1e300, 5e-5, 0.05, 0.005, 0.0005, 0.015, 0.025, 1.005, 2.675, 1.45, 1.55,
  ];
  const doubleBits = specialDoubles.map(dblHex);
  doubleBits.push('7ff8000000000000', 'fff8000000000000', '7ff0000000000001', '7ff4000000000000', '7ff0000000000000',
    'fff0000000000000', '0000000000000001', '8000000000000001', '000fffffffffffff', '0010000000000000',
    '7fefffffffffffff', 'ffefffffffffffff', '3ff0000000000001', '3fefffffffffffff');
  for (let e = -30; e <= 30; e++) doubleBits.push(dblHex(Number('1e' + e)), dblHex(Number('9.5e' + e)));
  for (let e = -1074; e <= 1023; e += 37) doubleBits.push(dblHex(2 ** e));
  for (const h of doubleBits) add('fmt.double', h);
  for (let i = 0; i < 1500; i++) add('fmt.double', rng.hex64());
  for (let i = 0; i < 300; i++) add('fmt.double', dblHex(Number(digits(1 + rng.int(17)) + 'e' + (rng.int(40) - 20))));

  const specialFloats = [0, -0, 1, -1, 0.1, 0.5, 1 / 3, 1e7, 1e8, 1e9, 1e10, 16777216, 16777217, 123456789,
    3.4028234663852886e38, 1.401298464324817e-45, 1.1754943508222875e-38, 0.0001, 0.00001, 1e-5, 2.5, 0.3, 3.14159,
    1e38, 1e-38, 1e-45, 9999999, 99999999, 999999999];
  const floatBits = specialFloats.map((v) => sglHex(Math.fround(v)));
  floatBits.push('7fc00000', 'ffc00000', '7f800001', '7f800000', 'ff800000', '00000001', '80000001', '007fffff',
    '00800000', '7f7fffff', 'ff7fffff');
  for (let e = -12; e <= 12; e++) floatBits.push(sglHex(Math.fround(Number('1e' + e))));
  for (const h of floatBits) {
    add('fmt.single', h);
    add('fmt.singleR', h);
  }
  for (let i = 0; i < 800; i++) add('fmt.single', rng.hex32());
  for (let i = 0; i < 800; i++) add('fmt.singleR', rng.hex32());

  for (const h of doubleBits.slice(0, 90)) for (const f of DBL_FORMATS) add('fmt.doubleF', h, f);
  for (let i = 0; i < 1500; i++) {
    const h = rng.int(3) === 0 ? rng.hex64() : dblHex(Number(digits(1 + rng.int(17)) + 'e' + (rng.int(30) - 18)));
    add('fmt.doubleF', h, rng.pick(DBL_FORMATS));
  }
  for (const h of floatBits.slice(0, 40)) for (const f of DBL_FORMATS) add('fmt.singleF', h, f);
  for (let i = 0; i < 600; i++) add('fmt.singleF', rng.hex32(), rng.pick(DBL_FORMATS));

  // ------------------------------------------------------------------ decimal
  const decStrings = [...DEC_STRINGS];
  for (let i = 0; i < 600; i++) {
    const n = 1 + rng.int(rng.int(3) === 0 ? 45 : 30);
    let d = digits(n, rng.int(5) !== 0);
    if (rng.int(4) === 0) d = d.slice(0, -1) + '5' + (rng.int(2) ? '0'.repeat(rng.int(5)) : '');
    const pt = rng.int(d.length + 1);
    let s = rng.int(4) === 0 ? d : d.slice(0, pt) + '.' + d.slice(pt);
    if (s === '.') s = '0.';
    if (rng.int(4) === 0) s = '-' + s;
    decStrings.push(s);
  }
  for (const s of decStrings) add('dec.parse', s);
  for (const s of DEC_STRINGS) add('dec.Parse', s);
  for (const s of DEC_STRINGS) add('dec.Parse', s + 'x');
  add('dec.Parse', '79228162514264337593543950336');
  for (let i = 0; i < 200; i++) {
    const n = 1 + rng.int(35);
    const s = digits(n) + (rng.int(2) ? '.' + digits(rng.int(10), false) : '');
    add('p.parse', 'Decimal', s + 'e' + (rng.int(2) ? '-' : '') + rng.int(40), 167);
  }
  for (const s of ['1e28', '1e29', '7.9228162514264337593543950335e28', '7.9228162514264337593543950336e28',
    '0.79228162514264337593543950335e29', '1e-28', '1e-29', '5e-29', '6e-29', '1.5e-28', '2.5e-28', '1e-9999',
    '6e-9999', '0e-9999', '0e9999', '-0e-5', '1.00e2', '1.00e-2', '100e-2', '1e0', '1E+0', '12345678901234567890123456789e-28',
    '12345678901234567890123456789e-29', '12345678901234567890123456789e1', '1234567890123456789012345678.9e1']) {
    add('p.parse', 'Decimal', s, 167);
    add('p.parse', 'Decimal', s, 511);
  }

  const fromDoubles = [0, -0, 1, -1, 0.1, 0.2, 0.3, 1 / 3, 2 / 3, 1e28, 7.9228162514264e28, 7.922816251426434e28,
    7.92281625142643e28, 7.923e28, 7.9228162514264337e28, 1e29, -1e28, 1e-28, 1e-29, 5e-29, 4.9e-29, 1.5e-28, 1e-27,
    5e-324, -5e-324, 2.2250738585072014e-308, 1.7976931348623157e308, 123456789.123456789, 0.000123456789012345678,
    1e15, 1e14, 999999999999999, 9999999999999999, 99999999999999.99, 0.5, 1.5, 2.5, 1e-10, 12345678901234567890,
    2 ** 63, 2 ** 64, 2 ** 95, 2 ** 96, 2 ** -94, 2 ** -95, 2 ** -93, 3.5e-29, 2.5e-29, 1.25, 100, 1000000, 1234.5678,
    0.1 + 0.2, 1.0000000000000002, 0.9999999999999999, 4.35, 1.005, 123456789012345.6, 12345678901234.56,
    1234567890123456.7, 5.0000000000000005e-15];
  const fromDoubleBits = fromDoubles.map(dblHex);
  fromDoubleBits.push('7ff8000000000000', '7ff0000000000000', 'fff0000000000000', '0000000000000001', '000fffffffffffff');
  for (let e = -30; e <= 30; e++) fromDoubleBits.push(dblHex(Number('1e' + e)), dblHex(Number('3e' + e)), dblHex(-Number('7.1e' + e)));
  for (const h of fromDoubleBits) add('dec.fromDouble', h);
  for (let i = 0; i < 700; i++) {
    const r = rng.int(3);
    let v;
    if (r === 0) v = Number(digits(1 + rng.int(17)) + 'e' + (rng.int(60) - 32));
    else if (r === 1) v = (rng.next() - 0.5) * 2 ** (rng.int(200) - 100);
    else v = randomDouble();
    add('dec.fromDouble', dblHex(v));
  }

  const randomDec = () => {
    const bits = 1 + rng.int(96);
    const m = rng.bigint(0n, (1n << BigInt(bits)) - 1n);
    return decStr(m, rng.int(29), rng.int(2) === 0);
  };
  const decSamples = ['0', '-0', '0.00', '1', '-1', '1.50', '79228162514264337593543950335', '-79228162514264337593543950335',
    '0.0000000000000000000000000001', '7.9228162514264337593543950335', '1.2345678901234567890123456789',
    '18446744073709551615', '18446744073709551616', '9007199254740993', '9007199254740993.5', '0.1', '0.3333333333333333333333333333',
    '12345678901234567890.123456789', '4294967296.5', '-0.00000000000000000000000001'];
  for (let i = 0; i < 400; i++) decSamples.push(randomDec());
  for (const s of decSamples) add('dec.toDouble', s);

  for (const s of decSamples.slice(0, 60)) for (const f of DEC_FORMATS) add('fmt.decimalF', s, f);
  for (let i = 0; i < 500; i++) add('fmt.decimalF', rng.pick(decSamples), rng.pick(DEC_FORMATS));

  const partsInts = [0, 1, -1, 2147483647, -2147483648, 100, 123456789, -559038737];
  for (const lo of partsInts) for (const mid of [0, 1, -1]) for (const hi of [0, -1]) add('dec.fromParts', lo, mid, hi, false, 2);
  for (const sc of [0, 1, 27, 28, 29, 30, 100, 255]) {
    add('dec.fromParts', 1, 0, 0, false, sc);
    add('dec.fromParts', 0, 0, 0, true, sc);
    add('dec.fromParts', -1, -1, -1, true, sc);
  }
  const rnd32 = () => Number(BigInt.asIntN(32, BigInt('0x' + rng.hex32())));
  for (let i = 0; i < 200; i++) add('dec.fromParts', rnd32(), rng.int(3) ? rnd32() : 0, rng.int(2) ? rnd32() : 0, rng.int(2) === 0, rng.int(29));

  const cmpPairs = [['0', '-0'], ['0', '0.000'], ['-0.00', '0'], ['1', '1.0'], ['1.50', '1.5'], ['-1.50', '-1.5'], ['1', '-1'],
    ['-1', '1'], ['0', '1'], ['0', '-1'], ['-0', '-1'], ['2', '10'], ['0.1', '0.10000000000000000000000000'],
    ['79228162514264337593543950335', '7922816251426433759354395033.5'], ['1.0000000000000000000000000001', '1'],
    ['100', '1e2'.replace('1e2', '100.00')], ['1', '1'], ['0.0000000000000000000000000001', '0'],
    ['79228162514264337593543950335', '-79228162514264337593543950335'], ['4294967296', '4294967296.0000000000']];
  for (const [a, b] of cmpPairs) {
    add('dec.cmp', a, b);
    add('dec.cmp', b, a);
  }
  for (let i = 0; i < 250; i++) {
    const a = randomDec();
    let b = rng.int(3) === 0 ? a : randomDec();
    if (rng.int(4) === 0 && !b.includes('.')) b = b + '.' + '0'.repeat(1 + rng.int(8));
    add('dec.cmp', a, b);
  }

  for (const v of [0n, 1n, -1n, 9223372036854775807n, -9223372036854775808n, 4294967296n, -4294967296n, 1234567890123n]) {
    add('dec.fromLong', v.toString());
  }
  for (let i = 0; i < 50; i++) add('dec.fromLong', rng.bigint(-9223372036854775808n, 9223372036854775807n).toString());

  for (const s of ['0', '-0', '1.50', '-1.50', '79228162514264337593543950335', '0.000', '-0.000']) add('dec.negate', s);
  for (let i = 0; i < 40; i++) add('dec.negate', randomDec());

  for (const s of ['0', '-0', '1.9', '-1.9', '0.5', '-0.5', '9223372036854775807', '9223372036854775808',
    '9223372036854775807.99', '-9223372036854775808', '-9223372036854775808.99', '-9223372036854775809',
    '79228162514264337593543950335', '0.0000000000000000000000000001', '922337203685477580.79']) add('dec.toLong', s);
  for (let i = 0; i < 100; i++) add('dec.toLong', randomDec());

  return cases;
}
