// System.Decimal, ported from .NET 8 (Decimal.cs, Decimal.DecCalc.cs, Number.Parsing.cs
// TryNumberToDecimal, Number.Formatting.cs DecimalToNumber). The 96 bit mantissa is a bigint.
import { ArgumentNullException, ArgumentOutOfRangeException, FormatException, OverflowException } from './exceptions.js';
import {
  DecimalNumberBufferLength,
  NumberBuffer,
  NumberBufferKind,
  NumberStyles,
  ParsingStatus,
  formatDecimal,
  tryStringToNumber,
  validateParseStyleFloatingPoint,
} from './Number.js';

const DecimalPrecision = 29;
const DEC_SCALE_MAX = 28;
const U32 = 0xffffffffn;
const U64 = 0xffffffffffffffffn;
const MAX_MANTISSA = (1n << 96n) - 1n;

const DoublePowers10: number[] = Array.from({ length: 81 }, (_, i) => Number(`1e${i}`));

const overflowDecimal = (): OverflowException => new OverflowException('Value was either too large or too small for a Decimal.');

export class Decimal {
  /** 96 bit unsigned mantissa */
  readonly mantissa: bigint;
  /** 0..28 */
  readonly scale: number;
  /** sign bit (negative zero exists) */
  readonly isNegative: boolean;

  private constructor(mantissa: bigint, scale: number, isNegative: boolean) {
    this.mantissa = mantissa;
    this.scale = scale;
    this.isNegative = isNegative;
  }

  static readonly Zero = new Decimal(0n, 0, false);
  static readonly One = new Decimal(1n, 0, false);
  static readonly MinusOne = new Decimal(1n, 0, true);
  static readonly MaxValue = new Decimal(MAX_MANTISSA, 0, false);
  static readonly MinValue = new Decimal(MAX_MANTISSA, 0, true);

  /** @internal */
  static _create(mantissa: bigint, scale: number, isNegative: boolean): Decimal {
    return new Decimal(mantissa, scale, isNegative);
  }

  /** new decimal(lo, mid, hi, isNegative, scale) */
  static fromParts(lo: number, mid: number, hi: number, isNegative: boolean, scale: number): Decimal {
    if (scale > 28) throw new ArgumentOutOfRangeException('scale');
    const m = BigInt(lo >>> 0) | (BigInt(mid >>> 0) << 32n) | (BigInt(hi >>> 0) << 64n);
    return new Decimal(m, scale, isNegative);
  }

  /** (decimal)long */
  static fromBigInt(v: bigint): Decimal {
    v = BigInt.asIntN(64, v);
    return v >= 0n ? new Decimal(v, 0, false) : new Decimal(-v, 0, true);
  }

  /** (decimal)double: DecCalc.VarDecFromR8 (rounds to 15 significant digits); OverflowException */
  static fromNumber(input: number): Decimal {
    const DBLBIAS = 1022;
    const buf = new DataView(new ArrayBuffer(8));
    buf.setFloat64(0, input);
    const biased = Number((buf.getBigUint64(0) >> 52n) & 0x7ffn);
    const exp = biased - DBLBIAS;
    if (exp < -94) return Decimal.Zero;
    if (exp > 96) throw overflowDecimal();

    let negative = false;
    if (input < 0) {
      input = -input;
      negative = true;
    }

    let dbl = input;
    let power = 14 - ((exp * 19728) >> 16);
    if (power >= 0) {
      if (power > DEC_SCALE_MAX) power = DEC_SCALE_MAX;
      dbl *= DoublePowers10[power];
    } else {
      if (power !== -1 || dbl >= 1e15) dbl /= DoublePowers10[-power];
      else power = 0;
    }

    if (dbl < 1e14 && power < DEC_SCALE_MAX) {
      dbl *= 10;
      power++;
    }

    // Math.Round (to even); dbl < 1e15, so the conversion to an integer is exact.
    let mant = BigInt(roundHalfEven(dbl));
    if (mant === 0n) return Decimal.Zero;

    if (power < 0) {
      power = -power;
      return new Decimal(mant * 10n ** BigInt(power), 0, negative);
    }

    let lmax = power;
    if (lmax > 14) lmax = 14;
    if ((mant & 0xffn) === 0n && lmax >= 8) {
      const div = mant / 100000000n;
      if ((mant & U32) === ((div * 100000000n) & U32)) {
        mant = div;
        power -= 8;
        lmax -= 8;
      }
    }
    if ((mant & 0xfn) === 0n && lmax >= 4) {
      const div = mant / 10000n;
      if ((mant & U32) === ((div * 10000n) & U32)) {
        mant = div;
        power -= 4;
        lmax -= 4;
      }
    }
    if ((mant & 3n) === 0n && lmax >= 2) {
      const div = mant / 100n;
      if ((mant & U32) === ((div * 100n) & U32)) {
        mant = div;
        power -= 2;
        lmax -= 2;
      }
    }
    if ((mant & 1n) === 0n && lmax >= 1) {
      const div = mant / 10n;
      if ((mant & U32) === ((div * 10n) & U32)) {
        mant = div;
        power--;
      }
    }
    return new Decimal(mant, power, negative);
  }

  /** decimal.Parse(s, styles, invariant) */
  static parse(s: string | null, styles: NumberStyles = NumberStyles.Number): Decimal {
    if (s === null || s === undefined) throw new ArgumentNullException('s');
    validateParseStyleFloatingPoint(styles);
    const [status, result] = tryParseDecimal(s, styles);
    if (status !== ParsingStatus.OK) {
      if (status === ParsingStatus.Failed) throw new FormatException(`The input string '${s}' was not in a correct format.`);
      throw overflowDecimal();
    }
    return result!;
  }

  /** decimal.TryParse(s, styles, invariant); null on failure */
  static tryParse(s: string | null, styles: NumberStyles = NumberStyles.Number): Decimal | null {
    validateParseStyleFloatingPoint(styles);
    if (s === null || s === undefined) return null;
    const [status, result] = tryParseDecimal(s, styles);
    return status === ParsingStatus.OK ? result : null;
  }

  /** (double)decimal: DecCalc.VarR8FromDec */
  toNumber(): number {
    const ds2to64 = 1.8446744073709552e19;
    const low64 = this.mantissa & U64;
    const high = this.mantissa >> 64n;
    let dbl = (Number(low64) + Number(high) * ds2to64) / DoublePowers10[this.scale];
    if (this.isNegative) dbl = -dbl;
    return dbl;
  }

  /** decimal.ToInt64 (truncates; OverflowException) */
  toBigInt(): bigint {
    const t = this.mantissa / 10n ** BigInt(this.scale);
    const v = this.isNegative ? -t : t;
    if (v < -(1n << 63n) || v > (1n << 63n) - 1n) {
      throw new OverflowException('Value was either too large or too small for an Int64.');
    }
    return v;
  }

  negate(): Decimal {
    return new Decimal(this.mantissa, this.scale, !this.isNegative);
  }

  /** DecCalc.VarDecCmp: -1, 0 or 1 */
  static compare(a: Decimal, b: Decimal): number {
    if (b.mantissa === 0n) {
      if (a.mantissa === 0n) return 0;
      return a.isNegative ? -1 : 1;
    }
    if (a.mantissa === 0n) return b.isNegative ? 1 : -1;
    if (a.isNegative !== b.isNegative) return a.isNegative ? -1 : 1;
    let x = a.mantissa;
    let y = b.mantissa;
    if (a.scale < b.scale) x *= 10n ** BigInt(b.scale - a.scale);
    else if (b.scale < a.scale) y *= 10n ** BigInt(a.scale - b.scale);
    const c = x === y ? 0 : x > y ? 1 : -1;
    return a.isNegative ? -c : c;
  }

  compareTo(other: Decimal): number {
    return Decimal.compare(this, other);
  }

  equals(other: unknown): boolean {
    return other instanceof Decimal && Decimal.compare(this, other) === 0;
  }

  /** Value with trailing zeros removed (DecCalc.Unscale), as [mantissa, scale]. */
  private unscaled(): [bigint, number] {
    let m = this.mantissa;
    let s = this.scale;
    while (s > 0 && m % 10n === 0n) {
      m /= 10n;
      s--;
    }
    return [m, s];
  }

  /** Key for Map/Set use: equal values (1.0 and 1.00, 0 and -0) give the same key. */
  equalityKey(): string {
    if (this.mantissa === 0n) return '0';
    const [m, s] = this.unscaled();
    return `${this.isNegative ? '-' : ''}${m}e-${s}`;
  }

  /** decimal.GetHashCode() (DecCalc.GetHashCode) */
  getHashCode(): number {
    if (this.mantissa === 0n) return 0;
    const [m, s] = this.unscaled();
    const flags = ((s << 16) | (this.isNegative ? 0x80000000 : 0)) >>> 0;
    const lo = Number(m & U32);
    const mid = Number((m >> 32n) & U32);
    const hi = Number(m >> 64n);
    return (flags ^ hi ^ mid ^ lo) | 0;
  }

  /** ToString() under the invariant culture (keeps the scale: 1.50m -> "1.50") */
  toString(format: string | null = null): string {
    return formatDecimal(this.mantissa, this.scale, this.isNegative, format);
  }

  /** XmlConvert.ToString(decimal) */
  toXmlString(): string {
    return formatDecimal(this.mantissa, this.scale, this.isNegative, null);
  }
}

/** Math.Round(double) (to even) for a non-negative value below 2^53 */
function roundHalfEven(v: number): number {
  const f = Math.floor(v);
  const d = v - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

/** Number.TryParseDecimal */
function tryParseDecimal(s: string, styles: NumberStyles): [ParsingStatus, Decimal | null] {
  const number = new NumberBuffer(NumberBufferKind.Decimal, DecimalNumberBufferLength);
  if (!tryStringToNumber(s, styles, number)) return [ParsingStatus.Failed, null];
  const d = tryNumberToDecimal(number);
  if (d === null) return [ParsingStatus.Overflow, null];
  return [ParsingStatus.OK, d];
}

/** Number.TryNumberToDecimal */
function tryNumberToDecimal(number: NumberBuffer): Decimal | null {
  let p = 0;
  let e = number.scale;
  const sign = number.isNegative;
  let c = number.digit(p);
  if (c === 0) {
    return Decimal._create(0n, Math.min(Math.max(-e, 0), 28), sign);
  }

  if (e > DecimalPrecision) return null;

  const U64Div10 = U64 / 10n;
  let low64 = 0n;
  while (e > -28) {
    e--;
    low64 *= 10n;
    low64 += BigInt(c - 0x30);
    c = number.digit(++p);
    if (low64 >= U64Div10) break;
    if (c === 0) {
      while (e > 0) {
        e--;
        low64 *= 10n;
        if (low64 >= U64Div10) break;
      }
      break;
    }
  }

  let high = 0n;
  while (
    (e > 0 || (c !== 0 && e > -28)) &&
    (high < U32 / 10n ||
      (high === U32 / 10n && (low64 < 0x9999999999999999n || (low64 === 0x9999999999999999n && c <= 0x35))))
  ) {
    // multiply by 10 (96 bit, cannot overflow here)
    let v = ((high << 64n) | low64) * 10n;
    if (c !== 0) {
      v += BigInt(c - 0x30);
      c = number.digit(++p);
    }
    low64 = v & U64;
    high = v >> 64n;
    e--;
  }

  roundUp: if (c >= 0x35) {
    if (c === 0x35 && (low64 & 1n) === 0n) {
      c = number.digit(++p);
      let hasZeroTail = !number.hasNonZeroTail;
      while (c !== 0 && hasZeroTail) {
        hasZeroTail &&= c === 0x30;
        c = number.digit(++p);
      }
      if (hasZeroTail) break roundUp;
    }
    low64 = (low64 + 1n) & U64;
    if (low64 === 0n) {
      high = (high + 1n) & U32;
      if (high === 0n) {
        low64 = 0x999999999999999an;
        high = U32 / 10n;
        e++;
      }
    }
  }

  if (e > 0) return null;

  if (e <= -DecimalPrecision) {
    return Decimal._create(0n, DecimalPrecision - 1, sign);
  }
  return Decimal._create((high << 64n) | low64, -e, sign);
}
