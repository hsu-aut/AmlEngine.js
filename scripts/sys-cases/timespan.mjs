// TimeSpan: constructors, components, totals, arithmetic, formatting, TimeSpan.TryParse.
import { dblHex } from './datetime.mjs';

const LONG_MAX = (1n << 63n) - 1n;
const LONG_MIN = -(1n << 63n);

export default function (rng) {
  const cases = [];
  const add = (fn, ...args) => cases.push({ fn, args });

  const edge = [0n, 1n, -1n, 9999999n, 10000000n, -10000000n, 864000000000n, -864000000000n, 36000000000n, 5000000n, 1234567n, 10000n,
    LONG_MAX, LONG_MIN, LONG_MIN + 1n, LONG_MAX - 1n, 922337203685477n * 10000n, -922337203685477n * 10000n, 922337203685478n * 10000n, 9223372036854775000n];
  const rand = () => {
    switch (rng.int(4)) {
      case 0:
        return rng.bigint(LONG_MIN, LONG_MAX);
      case 1:
        return rng.bigint(-864000000000n * 400n, 864000000000n * 400n);
      case 2:
        return BigInt(rng.range(-100000, 100000)) * 10000000n;
      default:
        return rng.bigint(-864000000000n, 864000000000n);
    }
  };
  const vals = [...edge];
  for (let i = 0; i < 400; i++) vals.push(rand());

  for (const t of vals) {
    add('ts.props', t.toString());
    for (const f of [null, '', 'c', 'g', 'G', 't', 'T']) add('ts.fmt', t.toString(), f);
  }
  const custom = ['hh:mm:ss', 'h\\:mm', "d'.'hh':'mm':'ss", 'dd\\.hh\\:mm\\:ss\\.fffffff', 'FFFFFFF', 'fffffff', 'ff', 'F', 'f', '%d', '%h', 'dddddddd', 'ddddddddd', 'hhh', 'mmm', 'sss', 'ffffffff',
    'x', 'H', 'hh:mm', '%', '\\', "'lit", '"q"', '%%', 'd\\ \\d\\a\\y\\s', 'm\\m', 's', 'hh\\:mm\\:ss\\.FFF', 'mm\\:ss'];
  for (const t of edge) for (const f of custom) add('ts.fmt', t.toString(), f);
  for (let i = 0; i < 300; i++) add('ts.fmt', rand().toString(), rng.pick(custom));

  // constructors
  for (const a of [[0, 0, 0], [1, 2, 3], [-1, 0, 0], [25, 61, 61], [2562047, 47, 16], [2562047, 47, 17], [-2562047, -47, -16], [-2562047, -47, -17], [2147483647, 2147483647, 2147483647]]) add('ts.new', ...a);
  for (const a of [[1, 2, 3, 4], [10675199, 2, 48, 5], [10675199, 2, 48, 6], [-10675199, -2, -48, -5], [-10675199, -2, -48, -6], [0, 0, 0, -1]]) add('ts.new', ...a);
  for (const a of [[1, 2, 3, 4, 5], [10675199, 2, 48, 5, 477], [10675199, 2, 48, 5, 478], [-10675199, -2, -48, -5, -477], [-10675199, -2, -48, -5, -478], [0, 0, 0, 0, 2147483647], [0, 0, 0, 0, -1]]) add('ts.new', ...a);
  for (let i = 0; i < 100; i++) add('ts.new', rng.range(-20000, 20000), rng.range(-100, 100), rng.range(-100, 100), rng.range(-100, 100), rng.range(-2000, 2000));

  // FromX(double)
  const dvals = [0, 1, -1, 0.5, 1.5, 1e-7, 1e-8, 0.00015, 1 / 3, 2 / 3, 10675199, 10675199.1, 10675200, 1e20, -1e20, Infinity, -Infinity, NaN, 922337203685477, 922337203685477.5, 922337203685478, 9.223372036854775e14, 0.1, 0.7, 12.345];
  for (const u of ['Days', 'Hours', 'Minutes', 'Seconds', 'Milliseconds']) {
    for (const v of dvals) add('ts.from', u, dblHex(v));
    for (let i = 0; i < 40; i++) add('ts.from', u, dblHex((rng.next() - 0.5) * 10 ** rng.range(-3, 12)));
  }

  // arithmetic
  for (const t of [...edge, rand(), rand()]) {
    add('ts.negate', t.toString());
    add('ts.duration', t.toString());
  }
  for (let i = 0; i < 150; i++) {
    const a = rng.next() < 0.3 ? rng.pick(edge) : rand();
    const b = rng.next() < 0.3 ? rng.pick(edge) : rand();
    add('ts.add', a.toString(), b.toString());
    add('ts.sub', a.toString(), b.toString());
    add('ts.cmp', a.toString(), b.toString());
  }

  // TimeSpan.TryParse
  const inputs = [
    '', ' ', '0', '1', '-1', '+1', '- 1', '1 ', ' 1', '\t1\n', ' 1 ', '​1', '1\0', '00', '0000000001', '10675199', '10675200', '-10675199', '-10675200',
    '1:2', '01:02', '23:59', '24:00', '1:60', '-1:2', '1:2:3', '01:02:03', '23:59:59', '23:59:60', '1.2:3', '1.02:03', '1.2:3:4', '1.02:03:04', '1:2:3:4', '1:02:03:04', '1:2:3:4.5',
    '1.2:3:4.5', '1:2:3.5', '0:0:0.1', '0:0:0.1234567', '0:0:0.12345678', '0:0:0.0000001', '0:0:0.00000001', '0:0:0.00000005', '0:0:0.00000015', '0:0:0.000000049', '0:0:0.9999999',
    '0:0:0.99999999', '0:0:0.0099999999', '0:0:0.', '0:0:.5', '0:0:0,5', '1:2:3.', '1:2.5', '1:2:.5', '10675199.02:48:05.4775807', '10675199.02:48:05.4775808', '-10675199.02:48:05.4775808',
    '-10675199.02:48:05.4775809', '10675199:02:48:05.4775807', '1.23:59:59.9999999', '1.24:00:00', '1d', '1:2:3:4:5', '1.2.3', '1:2:3.4.5', '1::2', ':1', '1:', '-', '--1', '-:1', 'a', '1a',
    '268435455', '268435456', '99999999999', '0268435455', '00000000000000000001:2', '1:00000000000002', '1.1:1:1.1', '-0', '-0:0', '-00:00:00.0000000', '1 :2', '1: 2', '1:2 ', '1 ',
    '1:2:3:4.5:6', '12:34:56.789', '-12:34:56.789', '1.12:34:56.789', '-1.12:34:56.789', '0:0:0:0.0000001', '1.2:3:4.5:', 'P1D', '1e3', '٣', '１',
  ];
  for (const s of inputs) add('ts.parse', s);
  for (let i = 0; i < 500; i++) {
    const t = rand();
    const f = rng.pick([null, 'g', 'G', 'c']);
    // parse the formatted outputs (the oracle checks both sides independently)
    add('ts.parse', `#fmt:${t}:${f}`);
  }
  const alphabet = ['0', '1', '2', '5', '9', '12', '59', '60', '23', '24', ':', '.', '-', ' ', ',', '00', '0000001', '9999999'];
  for (let i = 0; i < 500; i++) {
    let s = '';
    const n = rng.range(1, 9);
    for (let j = 0; j < n; j++) s += rng.pick(alphabet);
    add('ts.parse', s);
  }
  return cases.map((c) => {
    // "#fmt:ticks:format" inputs are expanded here with a small .NET-compatible formatter so that
    // the oracle input is a plain string (the formatter itself is verified by the ts.fmt cases).
    if (c.fn === 'ts.parse' && typeof c.args[0] === 'string' && c.args[0].startsWith('#fmt:')) {
      const [, t, f] = c.args[0].split(':');
      return { fn: c.fn, args: [fmt(BigInt(t), f === 'null' ? 'c' : f)] };
    }
    return c;
  });
}

function fmt(t, f) {
  const neg = t < 0n;
  let v = neg ? -t : t;
  if (t === LONG_MIN) v = LONG_MAX; // close enough for a parse input
  const frac = Number(v % 10000000n);
  const total = v / 10000000n;
  const s = total % 60n;
  const m = (total / 60n) % 60n;
  const h = (total / 3600n) % 24n;
  const d = total / 86400n;
  const p2 = (x) => x.toString().padStart(2, '0');
  let out = neg ? '-' : '';
  if (f === 'c') {
    if (d > 0n) out += d + '.';
    out += `${p2(h)}:${p2(m)}:${p2(s)}`;
    if (frac) out += '.' + frac.toString().padStart(7, '0');
  } else if (f === 'G') {
    out += `${d}:${p2(h)}:${p2(m)}:${p2(s)}.${frac.toString().padStart(7, '0')}`;
  } else {
    if (d > 0n) out += d + ':';
    out += `${h}:${p2(m)}:${p2(s)}`;
    if (frac) out += '.' + frac.toString().padStart(7, '0').replace(/0+$/, '');
  }
  return out;
}
