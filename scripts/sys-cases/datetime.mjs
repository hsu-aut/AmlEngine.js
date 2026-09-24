// DateTime core: constructors, properties, arithmetic, local time conversion, formatting.
const MAX = 3155378975999999999n;
const TPD = 864000000000n;
const TPH = 36000000000n;
const TPM = 600000000n;

function daysToYear(year) {
  const y = year - 1;
  const cent = Math.floor(y / 100);
  return Math.floor((y * 1461) / 4) - cent + Math.floor(cent / 4);
}

const DAYS_TO_MONTH = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
const leap = (y) => y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);

/** ticks of a calendar date and time (proleptic Gregorian) */
export function ticksOf(y, mo, d, h = 0, mi = 0, s = 0) {
  const days = daysToYear(y) + DAYS_TO_MONTH[mo - 1] + (mo > 2 && leap(y) ? 1 : 0) + d - 1;
  return BigInt(days) * TPD + BigInt(h) * TPH + BigInt(mi) * TPM + BigInt(s) * 10000000n;
}

export function dblHex(v) {
  const b = Buffer.alloc(8);
  b.writeDoubleBE(v);
  return b.toString('hex');
}

export default function (rng) {
  const cases = [];
  const add = (fn, ...args) => cases.push({ fn, args });

  // ---- constructors
  const years = [0, 1, 2, 4, 100, 1600, 1900, 2000, 2004, 2020, 2021, 2100, 2400, 9998, 9999, 10000, -1];
  const mds = [[1, 1], [2, 28], [2, 29], [2, 30], [12, 31], [0, 1], [13, 1], [1, 0], [1, 32], [4, 31], [6, 30]];
  for (const y of years) for (const [m, d] of mds) add('dt.new', y, m, d);
  for (const [h, mi, s] of [[0, 0, 0], [23, 59, 59], [24, 0, 0], [0, 60, 0], [0, 0, 60], [-1, 0, 0], [12, 30, 15]]) {
    add('dt.new', 2020, 6, 15, h, mi, s);
    for (const k of [0, 1, 2, 3, -1]) add('dt.new', 2020, 6, 15, h, mi, s, k);
    for (const ms of [0, 1, 999, 1000, -1]) add('dt.new', 2020, 6, 15, h, mi, s, ms, rng.pick([0, 1, 2]));
  }
  add('dt.new', 9999, 12, 31, 23, 59, 59, 999, 0);
  add('dt.new', 1, 1, 1, 0, 0, 0, 0, 4);
  add('dt.new', 2020, 2, 30, 25, 0, 0, 0, 0);
  add('dt.new', 2020, 1, 1, 0, 0, 0, 1000, 7);
  for (let i = 0; i < 100; i++) {
    add('dt.new', rng.range(1, 9999), rng.range(1, 12), rng.range(1, 31), rng.range(0, 23), rng.range(0, 59), rng.range(0, 59), rng.range(0, 999), rng.range(0, 2));
  }
  for (const t of ['0', '1', '-1', MAX.toString(), (MAX + 1n).toString(), '630822816000000000']) for (const k of [0, 1, 2, 3]) add('dt.ticks', t, k);

  // ---- properties
  const edgeTicks = [0n, 1n, TPD - 1n, TPD, MAX, MAX - TPD, ticksOf(2000, 2, 29), ticksOf(1900, 3, 1), ticksOf(2100, 12, 31, 23, 59, 59), ticksOf(2004, 12, 31), ticksOf(2001, 1, 1)];
  const randTicks = () => rng.bigint(0n, MAX);
  for (const t of edgeTicks) add('dt.props', t.toString(), 0);
  for (let i = 0; i < 400; i++) add('dt.props', randTicks().toString(), rng.range(0, 2));

  // ---- formatting
  const std = [null, '', 'd', 'D', 'f', 'F', 'g', 'G', 'm', 'M', 'o', 'O', 'r', 'R', 's', 't', 'T', 'u', 'U', 'y', 'Y', 'x', 'K', 'z', 'H', 'e'];
  const custom = [
    'yyyy-MM-dd', 'HH:mm:ss', 'yyyy-MM-ddTHH:mm:ss', "yyyy-MM-dd'T'HH:mm:ss.fffffffK", '---dd', '--MM--', '--MM-dd', 'yyyy-MM', 'yyyy', 'yy', 'y', 'yyy', 'yyyyy',
    'M', 'MM', 'MMM', 'MMMM', 'MMMMM', 'd', 'dd', 'ddd', 'dddd', 'ddddd', 'h', 'hh', 'hhh', 'H', 'HH', 'm', 'mm', 's', 'ss', 't', 'tt', 'ttt',
    'f', 'ff', 'fff', 'ffff', 'fffff', 'ffffff', 'fffffff', 'ffffffff', 'F', 'FF', 'FFF', 'FFFF', 'FFFFF', 'FFFFFF', 'FFFFFFF', 'FFFFFFFF',
    's.F', 'ss.FFF', 'ss.fff', 'HH:mm:ss.FFFFFFF', 'HH:mm:ss.FFFFFFFzzz', 'K', 'z', 'zz', 'zzz', 'zzzz', 'g', 'gg',
    "'quoted'", '"dq"', "'unterminated", '\\d\\M', '\\', '%d', '%M', '%', '%%', 'a%', '/', ':', 'dd/MM/yyyy', 'hh:mm tt',
    "dddd, dd MMMM yyyy HH':'mm':'ss 'GMT'", "yyyy'-'MM", "'it''s'", "x\\'y", 'MM/dd/yyyy HH:mm:ss', 'T', 'ä', 'hh:mm:ss.fff tt', "'a\\'b'", "'a\\",
  ];
  const fmtTicks = [...edgeTicks, ticksOf(2021, 3, 28, 2, 30), ticksOf(2021, 10, 31, 2, 30), ticksOf(2026, 1, 15, 8, 5, 3) + 1234567n, ticksOf(2026, 7, 4, 23, 0, 0) + 5000000n, 12345678n];
  for (const t of fmtTicks) for (const k of [0, 1, 2]) for (const f of [...std, ...custom]) add('dt.fmt', t.toString(), k, f);
  for (let i = 0; i < 600; i++) {
    const t = rng.next() < 0.5 ? randTicks() : ticksOf(rng.range(1990, 2040), rng.range(1, 12), rng.range(1, 28), rng.range(0, 23), rng.range(0, 59), rng.range(0, 59)) + BigInt(rng.int(10000000));
    add('dt.fmt', t.toString(), rng.range(0, 2), rng.pick([...std, ...custom]));
  }

  // ---- local time conversion (Europe/Berlin on the reference machine)
  const conv = [];
  for (const [y, mo, d] of [[2021, 3, 28], [2021, 10, 31], [2026, 3, 29], [2026, 10, 25], [1996, 10, 27], [2037, 10, 25], [2038, 3, 28]]) {
    for (let min = -60; min <= 240; min += 15) conv.push(ticksOf(y, mo, d) + BigInt(min) * TPM);
  }
  conv.push(0n, 1n, TPH, MAX, MAX - TPH, MAX - 1n, ticksOf(1, 1, 1, 0, 30));
  for (let i = 0; i < 300; i++) conv.push(ticksOf(rng.range(1996, 2037), rng.range(1, 12), rng.range(1, 28), rng.range(0, 23), rng.range(0, 59)) + BigInt(rng.int(600000000)));
  // historic dates (IANA history vs Windows rules)
  for (const [y, mo, d] of [[1970, 7, 1], [1970, 1, 1], [1985, 9, 30], [1990, 10, 15], [1945, 5, 30], [1893, 3, 31], [1850, 6, 1], [1600, 1, 1], [2100, 7, 1], [9999, 7, 1]]) conv.push(ticksOf(y, mo, d, 12));
  for (const t of conv) {
    for (const k of [0, 1, 2]) {
      add('dt.toLocal', t.toString(), k);
      add('dt.toUtc', t.toString(), k);
    }
  }

  // ---- arithmetic
  const units = ['Milliseconds', 'Seconds', 'Minutes', 'Hours', 'Days'];
  const addVals = [0, 1, -1, 0.5, -0.5, 1.5, 0.0001, 0.00001, 1e-7, 123.456789, -2.9999999, 1e10, 1e15, 3.2e14, 315537897600000, 315537897600001, 3652059, 3652060, 87649416, Infinity, -Infinity, NaN, 1 / 3, 2 / 3, 0.1, 0.7, 4.35];
  for (const t of [0n, MAX, ticksOf(2020, 6, 15, 12), ticksOf(1, 1, 1, 0, 0, 1)]) {
    for (const u of units) for (const v of addVals) add('dt.add', t.toString(), 0, u, dblHex(v));
  }
  for (let i = 0; i < 300; i++) add('dt.add', randTicks().toString(), rng.range(0, 2), rng.pick(units), dblHex((rng.next() - 0.5) * 10 ** rng.range(0, 8)));
  for (const t of [ticksOf(2020, 1, 31), ticksOf(2020, 2, 29), ticksOf(2019, 3, 31, 5), ticksOf(1, 1, 1), ticksOf(9999, 12, 31), ticksOf(2020, 12, 31, 23, 59, 59)]) {
    for (const m of [0, 1, -1, 11, 12, 13, -12, -13, 25, 119999, 120000, 120001, -120001, 1200, -24000]) add('dt.add', t.toString(), 2, 'Months', m);
    for (const y of [0, 1, -1, 4, 100, 7999, 9998, 10000, 10001, -10001]) add('dt.add', t.toString(), 1, 'Years', y);
    for (const k of ['1', '-1', MAX.toString(), (-MAX).toString(), '864000000000']) add('dt.add', t.toString(), 0, 'Ticks', k);
  }
  for (let i = 0; i < 200; i++) add('dt.add', randTicks().toString(), rng.range(0, 2), rng.pick(['Months', 'Years']), rng.pick([rng.range(-50, 50), rng.range(-3000, 3000)]));

  // ---- comparison / difference
  for (let i = 0; i < 150; i++) {
    const a = randTicks();
    const b = rng.next() < 0.2 ? a : randTicks();
    add('dt.cmp', a.toString(), rng.range(0, 2), b.toString(), rng.range(0, 2));
  }
  return cases;
}
