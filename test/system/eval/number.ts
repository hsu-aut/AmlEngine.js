// Evaluators for the "number" cases (scripts/sys-cases/number.mjs); see test/system/sys.oracle.test.ts.
import { Decimal } from '../../../src/system/Decimal.js';
import * as N from '../../../src/system/Number.js';
import { NumberStyles, formatDouble, formatSingle } from '../../../src/system/Number.js';
import * as P from '../../../src/system/Parse.js';
import { type Args, bool, dbl, dblArg, dec, orFail, sgl, sglArg } from '../repr.js';

const str = (v: number | bigint): string => v.toString();
const S = (a: Args, i: number): string => a[i] as string;
const decArg = (a: Args, i: number): Decimal => Decimal.parse(S(a, i), NumberStyles.Number);

export const evaluators: Record<string, (args: Args) => string> = {
  'p.Int16': (a) => orFail(P.tryParseInt16(S(a, 0)), str),
  'p.Int32': (a) => orFail(P.tryParseInt32(S(a, 0)), str),
  'p.Int64': (a) => orFail(P.tryParseInt64(S(a, 0)), str),
  'p.UInt16': (a) => orFail(P.tryParseUInt16(S(a, 0)), str),
  'p.UInt32': (a) => orFail(P.tryParseUInt32(S(a, 0)), str),
  'p.UInt64': (a) => orFail(P.tryParseUInt64(S(a, 0)), str),
  'p.Byte': (a) => orFail(P.tryParseByte(S(a, 0)), str),
  'p.SByte': (a) => orFail(P.tryParseSByte(S(a, 0)), str),
  'p.Double': (a) => orFail(P.tryParseDouble(S(a, 0)), dbl),
  'p.Single': (a) => orFail(P.tryParseSingle(S(a, 0)), sgl),
  'p.Boolean': (a) => orFail(P.tryParseBoolean(S(a, 0)), bool),

  'p.parse': (a) => {
    const s = a[1] as string | null;
    const st = a[2] as NumberStyles;
    switch (S(a, 0)) {
      case 'Int16':
        return str(N.parseInt16(s, st));
      case 'Int32':
        return str(N.parseInt32(s, st));
      case 'Int64':
        return str(N.parseInt64(s, st));
      case 'UInt16':
        return str(N.parseUInt16(s, st));
      case 'UInt32':
        return str(N.parseUInt32(s, st));
      case 'UInt64':
        return str(N.parseUInt64(s, st));
      case 'Byte':
        return str(N.parseByte(s, st));
      case 'SByte':
        return str(N.parseSByte(s, st));
      case 'Double':
        return dbl(N.parseDouble(s, st));
      case 'Single':
        return sgl(N.parseSingle(s, st));
      case 'Decimal':
        return dec(Decimal.parse(s, st));
      default:
        throw new Error('unknown type');
    }
  },

  'fmt.double': (a) => formatDouble(dblArg(S(a, 0))),
  'fmt.single': (a) => formatSingle(sglArg(S(a, 0))),
  'fmt.singleR': (a) => sgl(sglArg(S(a, 0))),
  'fmt.doubleF': (a) => formatDouble(dblArg(S(a, 0)), S(a, 1)),
  'fmt.singleF': (a) => formatSingle(sglArg(S(a, 0)), S(a, 1)),
  'fmt.decimalF': (a) => decArg(a, 0).toString(S(a, 1)),

  'dec.parse': (a) => orFail(P.tryParseDecimal(S(a, 0)), dec),
  'dec.Parse': (a) => dec(Decimal.parse(S(a, 0))),
  'dec.fromDouble': (a) => dec(Decimal.fromNumber(dblArg(S(a, 0)))),
  'dec.toDouble': (a) => dbl(decArg(a, 0).toNumber()),
  'dec.fromParts': (a) =>
    dec(Decimal.fromParts(a[0] as number, a[1] as number, a[2] as number, a[3] as boolean, (a[4] as number) & 0xff)),
  'dec.cmp': (a) => {
    const x = decArg(a, 0);
    const y = decArg(a, 1);
    return `${x.compareTo(y)}|${bool(x.equals(y))}|${bool(x.getHashCode() === y.getHashCode())}`;
  },
  'dec.fromLong': (a) => dec(Decimal.fromBigInt(BigInt(S(a, 0)))),
  'dec.negate': (a) => dec(decArg(a, 0).negate()),
  'dec.toLong': (a) => decArg(a, 0).toBigInt().toString(),
};

const snan =
  'a float signaling NaN cannot be held in a JS number: converting it to a double sets the quiet bit (the value stays NaN, only the payload bit differs)';

export const deviations: Record<string, string> = {
  'fmt.singleR ["7f800001"]': snan,
  'fmt.singleR ["ffa8805d"]': snan,
  'fmt.singleR ["7fb066eb"]': snan,
};
