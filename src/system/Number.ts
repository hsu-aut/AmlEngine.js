// System.Number parsing and formatting for the invariant culture (NumberFormatInfo.InvariantInfo),
// ported from .NET 8 (Number.Parsing.cs, Number.Formatting.cs, Number.Dragon4.cs,
// Number.NumberToFloatingPointBits.cs). The C# sources are the specification; oracle/SysOracle.cs
// checks the port against the real runtime.
//
// Deliberate simplifications (same results):
// - Grisu3 is not ported: when it succeeds it yields the same digits as Dragon4, which is always used.
// - The exact (BigInteger) float conversion replaces Lemire's fast path and the slow path of
//   NumberToFloatingPointBits: both are correctly rounded, like the exact computation here.
//   Clinger's fast path is kept literally (for float it rounds twice, double then float, which
//   cannot change the result for mantissas <= 2^24 and powers of ten <= 10^10).
import { ArgumentException, ArgumentNullException, FormatException, NotSupportedException, OverflowException } from './exceptions.js';

/** System.Globalization.NumberStyles */
export enum NumberStyles {
  None = 0,
  AllowLeadingWhite = 1,
  AllowTrailingWhite = 2,
  AllowLeadingSign = 4,
  AllowTrailingSign = 8,
  AllowParentheses = 16,
  AllowDecimalPoint = 32,
  AllowThousands = 64,
  AllowExponent = 128,
  AllowCurrencySymbol = 256,
  AllowHexSpecifier = 512,
  /** .NET 8 */
  AllowBinarySpecifier = 1024,
  Integer = 7,
  HexNumber = 515,
  /** .NET 8 */
  BinaryNumber = 1027,
  Number = 111,
  Float = 167,
  Currency = 383,
  Any = 511,
}

// ---------------------------------------------------------------------------------------------
// NumberFormatInfo.InvariantInfo
// ---------------------------------------------------------------------------------------------

const PositiveSign = '+';
const NegativeSign = '-';
const NumberDecimalSeparator = '.';
const NumberGroupSeparator = ',';
const CurrencySymbol = String.fromCharCode(0xa4);
const CurrencyDecimalSeparator = '.';
const CurrencyGroupSeparator = ',';
const PercentDecimalSeparator = '.';
const PercentGroupSeparator = ',';
const PercentSymbol = '%';
const PositiveInfinitySymbol = 'Infinity';
const NegativeInfinitySymbol = '-Infinity';
const NaNSymbol = 'NaN';
const NumberNegativePattern = 1;
const CurrencyPositivePattern = 0;
const CurrencyNegativePattern = 0;
const PercentPositivePattern = 0;
const PercentNegativePattern = 0;
const NumberDecimalDigits = 2;
const CurrencyDecimalDigits = 2;
const PercentDecimalDigits = 2;
const GroupSizes = [3];

const InvalidNumberStyles = ~(
  NumberStyles.AllowLeadingWhite |
  NumberStyles.AllowTrailingWhite |
  NumberStyles.AllowLeadingSign |
  NumberStyles.AllowTrailingSign |
  NumberStyles.AllowParentheses |
  NumberStyles.AllowDecimalPoint |
  NumberStyles.AllowThousands |
  NumberStyles.AllowExponent |
  NumberStyles.AllowCurrencySymbol |
  NumberStyles.AllowHexSpecifier |
  NumberStyles.AllowBinarySpecifier
);

/** NumberFormatInfo.ValidateParseStyleInteger */
export function validateParseStyleInteger(style: NumberStyles): void {
  if (
    (style & (InvalidNumberStyles | NumberStyles.AllowHexSpecifier | NumberStyles.AllowBinarySpecifier)) !== 0 &&
    (style & ~NumberStyles.HexNumber) !== 0 &&
    (style & ~NumberStyles.BinaryNumber) !== 0
  ) {
    throw new ArgumentException(
      (style & InvalidNumberStyles) !== 0
        ? 'An undefined NumberStyles value is being used.'
        : 'With the AllowHexSpecifier or AllowBinarySpecifier bit set in the enum bit field, the only other valid bits that can be combined into the enum value must be a subset of those in HexNumber or BinaryNumber.',
      'style',
    );
  }
}

/** NumberFormatInfo.ValidateParseStyleFloatingPoint */
export function validateParseStyleFloatingPoint(style: NumberStyles): void {
  if ((style & (InvalidNumberStyles | NumberStyles.AllowHexSpecifier | NumberStyles.AllowBinarySpecifier)) !== 0) {
    throw new ArgumentException(
      (style & InvalidNumberStyles) !== 0
        ? 'An undefined NumberStyles value is being used.'
        : 'The number styles AllowHexSpecifier and AllowBinarySpecifier are not supported on floating point data types.',
      'style',
    );
  }
}

// ---------------------------------------------------------------------------------------------
// Character classes
// ---------------------------------------------------------------------------------------------

/** Number.IsWhite: ' ' and \t \n \v \f \r only. */
function isWhite(ch: number): boolean {
  return ch === 0x20 || (ch >= 0x09 && ch <= 0x0d);
}

function isDigit(ch: number): boolean {
  return ch >= 0x30 && ch <= 0x39;
}

/** char.IsWhiteSpace */
export function isWhiteSpaceChar(ch: number): boolean {
  if (ch < 0x100) return ch === 0x20 || (ch >= 0x09 && ch <= 0x0d) || ch === 0x85 || ch === 0xa0;
  return (
    ch === 0x1680 ||
    (ch >= 0x2000 && ch <= 0x200a) ||
    ch === 0x2028 ||
    ch === 0x2029 ||
    ch === 0x202f ||
    ch === 0x205f ||
    ch === 0x3000
  );
}

/** MemoryExtensions.Trim(ReadOnlySpan<char>) (char.IsWhiteSpace) */
function spanTrim(s: string): string {
  let start = 0;
  while (start < s.length && isWhiteSpaceChar(s.charCodeAt(start))) start++;
  let end = s.length - 1;
  while (end >= start && isWhiteSpaceChar(s.charCodeAt(end))) end--;
  return s.substring(start, end + 1);
}

/** Upper case mapping of the ordinal ignore-case comparison with the (ASCII) invariant symbols. */
function ordinalUpper(ch: number): number {
  // Non-ASCII characters never match the ASCII symbols ('ı' does not match 'I' in .NET).
  return ch >= 0x61 && ch <= 0x7a ? ch - 0x20 : ch;
}

function equalsOrdinalIgnoreCase(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x !== y && ordinalUpper(x) !== ordinalUpper(y)) return false;
  }
  return true;
}

function startsWithOrdinalIgnoreCase(s: string, v: string): boolean {
  return s.length >= v.length && equalsOrdinalIgnoreCase(s.substring(0, v.length), v);
}

// ---------------------------------------------------------------------------------------------
// NumberBuffer
// ---------------------------------------------------------------------------------------------

export enum NumberBufferKind {
  Unknown = 0,
  Integer = 1,
  Decimal = 2,
  FloatingPoint = 3,
}

export const DecimalNumberBufferLength = 29 + 1 + 1;
export const DoubleNumberBufferLength = 767 + 1 + 1;
export const SingleNumberBufferLength = 112 + 1 + 1;

/** Number.NumberBuffer: `digits` holds the DigitsCount digits (the '\0' terminator is implicit). */
export class NumberBuffer {
  digits = '';
  scale = 0;
  isNegative = false;
  hasNonZeroTail = false;

  constructor(
    readonly kind: NumberBufferKind,
    /** Digits.Length of the C# buffer (including the terminator) */
    readonly length: number,
  ) {}

  get digitsCount(): number {
    return this.digits.length;
  }

  /** Digits[i] ('\0' = 0 at and after the end) */
  digit(i: number): number {
    return i < this.digits.length ? this.digits.charCodeAt(i) : 0;
  }
}

// ---------------------------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------------------------

export enum ParsingStatus {
  OK,
  Failed,
  Overflow,
}

const StateSign = 0x0001;
const StateParens = 0x0002;
const StateDigits = 0x0004;
const StateNonZero = 0x0008;
const StateDecimal = 0x0010;
const StateCurrency = 0x0020;

/** MatchChars: index after `value` when it starts at p, else -1. */
function matchChars(s: string, p: number, value: string): number {
  return value.length > 0 && s.startsWith(value, p) ? p + value.length : -1;
}

/** Number.TryParseNumber: returns the position where parsing stopped, or -1 on failure. */
function tryParseNumber(s: string, styles: NumberStyles, number: NumberBuffer): number {
  const strEnd = s.length;
  const at = (i: number): number => (i < strEnd ? s.charCodeAt(i) : 0);

  let decSep: string;
  let groupSep: string;
  let currSymbol = '';
  let parsingCurrency = false;
  if ((styles & NumberStyles.AllowCurrencySymbol) !== 0) {
    currSymbol = CurrencySymbol;
    decSep = CurrencyDecimalSeparator;
    groupSep = CurrencyGroupSeparator;
    parsingCurrency = true;
  } else {
    decSep = NumberDecimalSeparator;
    groupSep = NumberGroupSeparator;
  }

  let state = 0;
  let p = 0;
  let ch = at(p);
  let next: number;

  while (true) {
    // Eat whitespace unless we've found a sign which isn't followed by a currency symbol.
    if (
      !isWhite(ch) ||
      (styles & NumberStyles.AllowLeadingWhite) === 0 ||
      ((state & StateSign) !== 0 && (state & StateCurrency) === 0 && (NumberNegativePattern as number) !== 2)
    ) {
      if (
        (styles & NumberStyles.AllowLeadingSign) !== 0 &&
        (state & StateSign) === 0 &&
        ((next = matchChars(s, p, PositiveSign)) >= 0 ||
          ((next = matchChars(s, p, NegativeSign)) >= 0 && (number.isNegative = true)))
      ) {
        state |= StateSign;
        p = next - 1;
      } else if (ch === 0x28 /* ( */ && (styles & NumberStyles.AllowParentheses) !== 0 && (state & StateSign) === 0) {
        state |= StateSign | StateParens;
        number.isNegative = true;
      } else if (currSymbol !== '' && (next = matchChars(s, p, currSymbol)) >= 0) {
        state |= StateCurrency;
        currSymbol = '';
        p = next - 1;
      } else {
        break;
      }
    }
    ch = at(++p);
  }

  let digCount = 0;
  let digEnd = 0;
  const maxDigCount = number.length - 1;
  let numberOfTrailingZeros = 0;
  const digits: string[] = [];

  while (true) {
    if (isDigit(ch)) {
      state |= StateDigits;

      if (ch !== 0x30 || (state & StateNonZero) !== 0) {
        if (digCount < maxDigCount) {
          digits[digCount] = String.fromCharCode(ch);
          if (ch !== 0x30 || number.kind !== NumberBufferKind.Integer) {
            digEnd = digCount + 1;
          }
        } else if (ch !== 0x30) {
          number.hasNonZeroTail = true;
        }

        if ((state & StateDecimal) === 0) {
          number.scale++;
        }

        if (digCount < maxDigCount) {
          if (ch === 0x30) numberOfTrailingZeros++;
          else numberOfTrailingZeros = 0;
        }
        digCount++;
        state |= StateNonZero;
      } else if ((state & StateDecimal) !== 0) {
        number.scale--;
      }
    } else if (
      (styles & NumberStyles.AllowDecimalPoint) !== 0 &&
      (state & StateDecimal) === 0 &&
      ((next = matchChars(s, p, decSep)) >= 0 ||
        (parsingCurrency && (state & StateCurrency) === 0 && (next = matchChars(s, p, NumberDecimalSeparator)) >= 0))
    ) {
      state |= StateDecimal;
      p = next - 1;
    } else if (
      (styles & NumberStyles.AllowThousands) !== 0 &&
      (state & StateDigits) !== 0 &&
      (state & StateDecimal) === 0 &&
      ((next = matchChars(s, p, groupSep)) >= 0 ||
        (parsingCurrency && (state & StateCurrency) === 0 && (next = matchChars(s, p, NumberGroupSeparator)) >= 0))
    ) {
      p = next - 1;
    } else {
      break;
    }
    ch = at(++p);
  }

  let negExp = false;
  let digitsCount = digEnd;
  if ((state & StateDigits) !== 0) {
    if ((ch === 0x45 || ch === 0x65) && (styles & NumberStyles.AllowExponent) !== 0) {
      const temp = p;
      ch = at(++p);
      if ((next = matchChars(s, p, PositiveSign)) >= 0) {
        ch = at((p = next));
      } else if ((next = matchChars(s, p, NegativeSign)) >= 0) {
        ch = at((p = next));
        negExp = true;
      }
      if (isDigit(ch)) {
        let exp = 0;
        do {
          exp = exp * 10 + (ch - 0x30);
          ch = at(++p);
          if (exp > 1000) {
            exp = 9999;
            while (isDigit(ch)) {
              ch = at(++p);
            }
          }
        } while (isDigit(ch));
        if (negExp) {
          exp = -exp;
        }
        number.scale += exp;
      } else {
        p = temp;
        ch = at(p);
      }
    }

    if (number.kind === NumberBufferKind.FloatingPoint && !number.hasNonZeroTail) {
      // Adjust the number buffer for trailing zeros
      const numberOfFractionalDigits = digEnd - number.scale;
      if (numberOfFractionalDigits > 0) {
        numberOfTrailingZeros = Math.min(numberOfTrailingZeros, numberOfFractionalDigits);
        digitsCount = digEnd - numberOfTrailingZeros;
      }
    }
    number.digits = digits.slice(0, digitsCount).join('');

    while (true) {
      if (!isWhite(ch) || (styles & NumberStyles.AllowTrailingWhite) === 0) {
        if (
          (styles & NumberStyles.AllowTrailingSign) !== 0 &&
          (state & StateSign) === 0 &&
          ((next = matchChars(s, p, PositiveSign)) >= 0 ||
            ((next = matchChars(s, p, NegativeSign)) >= 0 && (number.isNegative = true)))
        ) {
          state |= StateSign;
          p = next - 1;
        } else if (ch === 0x29 /* ) */ && (state & StateParens) !== 0) {
          state &= ~StateParens;
        } else if (currSymbol !== '' && (next = matchChars(s, p, currSymbol)) >= 0) {
          currSymbol = '';
          p = next - 1;
        } else {
          break;
        }
      }
      ch = at(++p);
    }
    if ((state & StateParens) === 0) {
      if ((state & StateNonZero) === 0) {
        if (number.kind !== NumberBufferKind.Decimal) {
          number.scale = 0;
        }
        if (number.kind === NumberBufferKind.Integer && (state & StateDecimal) === 0) {
          number.isNegative = false;
        }
      }
      return p;
    }
  }
  number.digits = digits.slice(0, digitsCount).join('');
  return -1;
}

/** Number.TrailingZeros: only '\0' remains from index on. */
function trailingZeros(s: string, index: number): boolean {
  for (let i = index; i < s.length; i++) {
    if (s.charCodeAt(i) !== 0) return false;
  }
  return true;
}

/** Number.TryStringToNumber */
export function tryStringToNumber(s: string, styles: NumberStyles, number: NumberBuffer): boolean {
  const p = tryParseNumber(s, styles, number);
  if (p < 0 || (p < s.length && !trailingZeros(s, p))) {
    return false;
  }
  return true;
}

// ----- integers ------------------------------------------------------------------------------

interface IntegerInfo {
  name: string;
  bits: number;
  isSigned: boolean;
  maxDigitCount: number;
  maxHexDigitCount: number;
  maxValue: bigint;
  overflowMessage: string;
}

function intInfo(name: string, bits: number, isSigned: boolean, maxDigitCount: number): IntegerInfo {
  const maxValue = isSigned ? (1n << BigInt(bits - 1)) - 1n : (1n << BigInt(bits)) - 1n;
  return {
    name,
    bits,
    isSigned,
    maxDigitCount,
    maxHexDigitCount: bits / 4,
    maxValue,
    overflowMessage: `Value was either too large or too small for ${isSigned ? 'an' : 'a'} ${name}.`,
  };
}

const SByteInfo = intInfo('SByte', 8, true, 3);
const ByteInfo = intInfo('Byte', 8, false, 3);
const Int16Info = intInfo('Int16', 16, true, 5);
const UInt16Info = intInfo('UInt16', 16, false, 5);
const Int32Info = intInfo('Int32', 32, true, 10);
const UInt32Info = intInfo('UInt32', 32, false, 10);
const Int64Info = intInfo('Int64', 64, true, 19);
const UInt64Info = intInfo('UInt64', 64, false, 20);

/** TInteger.CreateTruncating / wrapping arithmetic */
function wrap(t: IntegerInfo, v: bigint): bigint {
  return t.isSigned ? BigInt.asIntN(t.bits, v) : BigInt.asUintN(t.bits, v);
}

function isGreaterThanAsUnsigned(t: IntegerInfo, a: bigint, b: bigint): boolean {
  return BigInt.asUintN(t.bits, a) > BigInt.asUintN(t.bits, b);
}

/** Number.TryNumberBufferToBinaryInteger */
function tryNumberBufferToBinaryInteger(t: IntegerInfo, number: NumberBuffer): bigint | null {
  let i = number.scale;
  if (i > t.maxDigitCount || i < number.digitsCount || (!t.isSigned && number.isNegative) || number.hasNonZeroTail) {
    return null;
  }
  const maxValueDiv10 = t.maxValue / 10n;
  let p = 0;
  let n = 0n;
  while (--i >= 0) {
    if (isGreaterThanAsUnsigned(t, n, maxValueDiv10)) {
      return null;
    }
    n = wrap(t, n * 10n);
    if (number.digit(p) !== 0) {
      const newN = wrap(t, n + BigInt(number.digit(p++) - 0x30));
      if (!t.isSigned && newN < n) {
        return null;
      }
      n = newN;
    }
  }
  if (t.isSigned) {
    if (number.isNegative) {
      n = wrap(t, -n);
      if (n > 0n) return null;
    } else if (n < 0n) {
      return null;
    }
  }
  return n;
}

/** Number.TryParseBinaryIntegerStyle (styles within NumberStyles.Integer) */
function tryParseBinaryIntegerStyle(t: IntegerInfo, value: string, styles: NumberStyles): [ParsingStatus, bigint] {
  const FalseExit: [ParsingStatus, bigint] = [ParsingStatus.Failed, 0n];
  const OverflowExit: [ParsingStatus, bigint] = [ParsingStatus.Overflow, 0n];
  if (value.length === 0) return FalseExit;

  let index = 0;
  let num = value.charCodeAt(0);

  if ((styles & NumberStyles.AllowLeadingWhite) !== 0 && isWhite(num)) {
    do {
      index++;
      if (index >= value.length) return FalseExit;
      num = value.charCodeAt(index);
    } while (isWhite(num));
  }

  let isNegative = false;
  if ((styles & NumberStyles.AllowLeadingSign) !== 0) {
    // info.HasInvariantNumberSigns
    if (num === 0x2d) {
      isNegative = true;
      index++;
      if (index >= value.length) return FalseExit;
      num = value.charCodeAt(index);
    } else if (num === 0x2b) {
      index++;
      if (index >= value.length) return FalseExit;
      num = value.charCodeAt(index);
    }
  }

  let overflow = !t.isSigned && isNegative;
  let answer = 0n;
  const maxValueDiv10 = t.maxValue / 10n;

  const doneAtEnd = (): [ParsingStatus, bigint] => [ParsingStatus.OK, t.isSigned ? wrap(t, isNegative ? -answer : answer) : answer];
  const doneAtEndButPotentialOverflow = (): [ParsingStatus, bigint] => (overflow ? OverflowExit : doneAtEnd());
  const hasTrailingChars = (): [ParsingStatus, bigint] => {
    // Skip past trailing whitespace, then past trailing zeros, and if anything else remains, fail.
    if (isWhite(num)) {
      if ((styles & NumberStyles.AllowTrailingWhite) === 0) return FalseExit;
      for (index++; index < value.length; index++) {
        if (!isWhite(value.charCodeAt(index))) break;
      }
      if (index >= value.length) return doneAtEndButPotentialOverflow();
    }
    if (!trailingZeros(value, index)) return FalseExit;
    return doneAtEndButPotentialOverflow();
  };

  if (!isDigit(num)) return FalseExit;

  // Skip past leading zeros.
  if (num === 0x30) {
    do {
      index++;
      if (index >= value.length) return doneAtEnd();
      num = value.charCodeAt(index);
    } while (num === 0x30);

    if (!isDigit(num)) {
      if (!t.isSigned) overflow = false;
      return hasTrailingChars();
    }
  }

  answer = BigInt(num - 0x30);
  index++;

  for (let i = 0; i < t.maxDigitCount - 2; i++) {
    if (index >= value.length) {
      return t.isSigned ? doneAtEnd() : doneAtEndButPotentialOverflow();
    }
    num = value.charCodeAt(index);
    if (!isDigit(num)) return hasTrailingChars();
    index++;
    answer = wrap(t, answer * 10n + BigInt(num - 0x30));
  }

  if (index >= value.length) {
    return t.isSigned ? doneAtEnd() : doneAtEndButPotentialOverflow();
  }
  num = value.charCodeAt(index);
  if (!isDigit(num)) return hasTrailingChars();
  index++;

  // Potential overflow now processing the MaxDigitCount digit.
  if (!t.isSigned) {
    overflow ||= answer > maxValueDiv10 || (answer === maxValueDiv10 && num > 0x35);
  } else {
    overflow = answer > maxValueDiv10;
  }
  answer = wrap(t, answer * 10n + BigInt(num - 0x30));
  if (t.isSigned) {
    overflow ||= isGreaterThanAsUnsigned(t, answer, wrap(t, t.maxValue + (isNegative ? 1n : 0n)));
  }

  if (index >= value.length) return doneAtEndButPotentialOverflow();

  // At this point, we're either overflowing or hitting a formatting error.
  num = value.charCodeAt(index);
  while (isDigit(num)) {
    overflow = true;
    index++;
    if (index >= value.length) return OverflowExit;
    num = value.charCodeAt(index);
  }
  return hasTrailingChars();
}

function hexFromChar(ch: number): number {
  if (ch >= 0x30 && ch <= 0x39) return ch - 0x30;
  if (ch >= 0x41 && ch <= 0x46) return ch - 0x41 + 10;
  if (ch >= 0x61 && ch <= 0x66) return ch - 0x61 + 10;
  return 0xff;
}

/** Number.TryParseBinaryIntegerHexOrBinaryNumberStyle */
function tryParseBinaryIntegerHexOrBinaryNumberStyle(
  t: IntegerInfo,
  value: string,
  styles: NumberStyles,
  hex: boolean,
): [ParsingStatus, bigint] {
  const FalseExit: [ParsingStatus, bigint] = [ParsingStatus.Failed, 0n];
  const OverflowExit: [ParsingStatus, bigint] = [ParsingStatus.Overflow, 0n];
  const isValidChar = hex ? (ch: number) => hexFromChar(ch) !== 0xff : (ch: number) => ch === 0x30 || ch === 0x31;
  const fromChar = hex ? hexFromChar : (ch: number) => (ch - 0x30) >>> 0;
  const maxDigitValue = hex ? 0xf : 1;
  const maxDigitCount = hex ? t.maxHexDigitCount : t.bits;
  const shift = hex ? 4n : 1n;

  if (value.length === 0) return FalseExit;
  let index = 0;
  let num = value.charCodeAt(0);

  if ((styles & NumberStyles.AllowLeadingWhite) !== 0 && isWhite(num)) {
    do {
      index++;
      if (index >= value.length) return FalseExit;
      num = value.charCodeAt(index);
    } while (isWhite(num));
  }

  let overflow = false;
  let answer = 0n;
  const doneAtEnd = (): [ParsingStatus, bigint] => [ParsingStatus.OK, answer];
  const doneAtEndButPotentialOverflow = (): [ParsingStatus, bigint] => (overflow ? OverflowExit : doneAtEnd());
  const hasTrailingChars = (): [ParsingStatus, bigint] => {
    if (isWhite(num)) {
      if ((styles & NumberStyles.AllowTrailingWhite) === 0) return FalseExit;
      for (index++; index < value.length; index++) {
        if (!isWhite(value.charCodeAt(index))) break;
      }
      if (index >= value.length) return doneAtEndButPotentialOverflow();
    }
    if (!trailingZeros(value, index)) return FalseExit;
    return doneAtEndButPotentialOverflow();
  };

  if (!isValidChar(num)) return FalseExit;

  if (num === 0x30) {
    do {
      index++;
      if (index >= value.length) return doneAtEnd();
      num = value.charCodeAt(index);
    } while (num === 0x30);
    if (!isValidChar(num)) return hasTrailingChars();
  }

  answer = wrap(t, BigInt(fromChar(num)));
  index++;

  for (let i = 0; i < maxDigitCount - 1; i++) {
    if (index >= value.length) return doneAtEnd();
    num = value.charCodeAt(index);
    const numValue = fromChar(num);
    if (numValue > maxDigitValue) return hasTrailingChars();
    index++;
    answer = wrap(t, (answer << shift) + BigInt(numValue));
  }

  if (index >= value.length) return doneAtEnd();
  num = value.charCodeAt(index);
  if (!isValidChar(num)) return hasTrailingChars();

  do {
    index++;
    if (index >= value.length) return OverflowExit;
    num = value.charCodeAt(index);
  } while (isValidChar(num));

  overflow = true;
  return hasTrailingChars();
}

/** Number.TryParseBinaryInteger */
function tryParseBinaryInteger(t: IntegerInfo, value: string, styles: NumberStyles): [ParsingStatus, bigint] {
  if ((styles & ~NumberStyles.Integer) === 0) {
    return tryParseBinaryIntegerStyle(t, value, styles);
  }
  if ((styles & NumberStyles.AllowHexSpecifier) !== 0) {
    return tryParseBinaryIntegerHexOrBinaryNumberStyle(t, value, styles, true);
  }
  if ((styles & NumberStyles.AllowBinarySpecifier) !== 0) {
    return tryParseBinaryIntegerHexOrBinaryNumberStyle(t, value, styles, false);
  }
  const number = new NumberBuffer(NumberBufferKind.Integer, t.maxDigitCount + 1);
  if (!tryStringToNumber(value, styles, number)) {
    return [ParsingStatus.Failed, 0n];
  }
  const r = tryNumberBufferToBinaryInteger(t, number);
  return r === null ? [ParsingStatus.Overflow, 0n] : [ParsingStatus.OK, r];
}

function throwFormat(value: string): never {
  throw new FormatException(`The input string '${value}' was not in a correct format.`);
}

/** X.Parse(s, styles, NumberFormatInfo.InvariantInfo) */
function parseInteger(t: IntegerInfo, s: string | null, styles: NumberStyles): bigint {
  if (s === null || s === undefined) throw new ArgumentNullException('s');
  validateParseStyleInteger(styles);
  const [status, result] = tryParseBinaryInteger(t, s, styles);
  if (status !== ParsingStatus.OK) {
    if (status === ParsingStatus.Failed) throwFormat(s);
    throw new OverflowException(t.overflowMessage);
  }
  return result;
}

/** X.TryParse(s, styles, NumberFormatInfo.InvariantInfo): null on failure */
function tryParseInteger(t: IntegerInfo, s: string | null, styles: NumberStyles): bigint | null {
  validateParseStyleInteger(styles);
  if (s === null || s === undefined) return null;
  const [status, result] = tryParseBinaryInteger(t, s, styles);
  return status === ParsingStatus.OK ? result : null;
}

/** int.Parse(s, styles, invariant) etc.: FormatException / OverflowException / ArgumentNullException like .NET. */
export function parseInt32(s: string | null, styles: NumberStyles = NumberStyles.Integer): number {
  return Number(parseInteger(Int32Info, s, styles));
}
export function parseInt16(s: string | null, styles: NumberStyles = NumberStyles.Integer): number {
  return Number(parseInteger(Int16Info, s, styles));
}
export function parseSByte(s: string | null, styles: NumberStyles = NumberStyles.Integer): number {
  return Number(parseInteger(SByteInfo, s, styles));
}
export function parseByte(s: string | null, styles: NumberStyles = NumberStyles.Integer): number {
  return Number(parseInteger(ByteInfo, s, styles));
}
export function parseUInt16(s: string | null, styles: NumberStyles = NumberStyles.Integer): number {
  return Number(parseInteger(UInt16Info, s, styles));
}
export function parseUInt32(s: string | null, styles: NumberStyles = NumberStyles.Integer): number {
  return Number(parseInteger(UInt32Info, s, styles));
}
export function parseInt64(s: string | null, styles: NumberStyles = NumberStyles.Integer): bigint {
  return parseInteger(Int64Info, s, styles);
}
export function parseUInt64(s: string | null, styles: NumberStyles = NumberStyles.Integer): bigint {
  return parseInteger(UInt64Info, s, styles);
}

/** int.TryParse(s, styles, invariant) etc.: the value or null */
export function tryParseInt32(s: string | null, styles: NumberStyles = NumberStyles.Integer): number | null {
  const r = tryParseInteger(Int32Info, s, styles);
  return r === null ? null : Number(r);
}
export function tryParseInt16(s: string | null, styles: NumberStyles = NumberStyles.Integer): number | null {
  const r = tryParseInteger(Int16Info, s, styles);
  return r === null ? null : Number(r);
}
export function tryParseSByte(s: string | null, styles: NumberStyles = NumberStyles.Integer): number | null {
  const r = tryParseInteger(SByteInfo, s, styles);
  return r === null ? null : Number(r);
}
export function tryParseByte(s: string | null, styles: NumberStyles = NumberStyles.Integer): number | null {
  const r = tryParseInteger(ByteInfo, s, styles);
  return r === null ? null : Number(r);
}
export function tryParseUInt16(s: string | null, styles: NumberStyles = NumberStyles.Integer): number | null {
  const r = tryParseInteger(UInt16Info, s, styles);
  return r === null ? null : Number(r);
}
export function tryParseUInt32(s: string | null, styles: NumberStyles = NumberStyles.Integer): number | null {
  const r = tryParseInteger(UInt32Info, s, styles);
  return r === null ? null : Number(r);
}
export function tryParseInt64(s: string | null, styles: NumberStyles = NumberStyles.Integer): bigint | null {
  return tryParseInteger(Int64Info, s, styles);
}
export function tryParseUInt64(s: string | null, styles: NumberStyles = NumberStyles.Integer): bigint | null {
  return tryParseInteger(UInt64Info, s, styles);
}

// ----- floating point ------------------------------------------------------------------------

interface FloatInfo {
  bufferLength: number;
  minDecimalExponent: number;
  maxDecimalExponent: number;
  maxExponentFastPath: number;
  maxMantissaFastPath: bigint;
  /** significand bits including the hidden bit */
  precision: number;
  /** exponent of the lowest significand bit of the smallest subnormal */
  minExponent: number;
  /** largest exponent of the lowest significand bit */
  maxExponent: number;
  round: (v: number) => number;
}

const DoubleInfo: FloatInfo = {
  bufferLength: DoubleNumberBufferLength,
  minDecimalExponent: -324,
  maxDecimalExponent: 309,
  maxExponentFastPath: 22,
  maxMantissaFastPath: 2n << 52n,
  precision: 53,
  minExponent: -1074,
  maxExponent: 1023 - 52,
  round: (v) => v,
};

const SingleInfo: FloatInfo = {
  bufferLength: SingleNumberBufferLength,
  minDecimalExponent: -45,
  maxDecimalExponent: 39,
  maxExponentFastPath: 10,
  maxMantissaFastPath: 2n << 23n,
  precision: 24,
  minExponent: -149,
  maxExponent: 127 - 23,
  round: Math.fround,
};

const nanBits = new DataView(new ArrayBuffer(8));
nanBits.setBigUint64(0, 0xfff8000000000000n);
/**
 * double.NaN of .NET: the x86 default NaN with the sign bit set (bits fff8000000000000; as float
 * ffc00000). JS keeps the bit pattern of a NaN value it does not compute with.
 */
export const DotNetNaN = nanBits.getFloat64(0);

const Pow10DoubleTable = [
  1e0, 1e1, 1e2, 1e3, 1e4, 1e5, 1e6, 1e7, 1e8, 1e9, 1e10, 1e11, 1e12, 1e13, 1e14, 1e15, 1e16, 1e17, 1e18, 1e19, 1e20,
  1e21, 1e22,
];

function bitLength(v: bigint): number {
  return v === 0n ? 0 : v.toString(2).length;
}

/**
 * digits x 10^(e10) (+ a nonzero tail below the last digit when `sticky`) correctly rounded to
 * the binary format (round half to even). Equals NumberToFloatingPointBits for every input that
 * leaves Clinger's fast path.
 */
function exactToBinary(f: FloatInfo, digits: string, e10: number, sticky: boolean): number {
  let num = BigInt(digits);
  let den = 1n;
  if (e10 >= 0) num *= 10n ** BigInt(e10);
  else den = 10n ** BigInt(-e10);
  const p = f.precision;
  // value = num / den; find e with 2^(p-1) <= value / 2^e < 2^p
  let e = bitLength(num) - bitLength(den) - p;
  const ge = (k: number): boolean => {
    // value / 2^e >= 2^k ?
    const s = k + e;
    return s >= 0 ? num >= den << BigInt(s) : num << BigInt(-s) >= den;
  };
  while (ge(p)) e++;
  while (!ge(p - 1)) e--;
  if (e < f.minExponent) e = f.minExponent;
  // one extra bit for rounding
  const s = 1 - e;
  let n2 = num;
  let d2 = den;
  if (s >= 0) n2 <<= BigInt(s);
  else d2 <<= BigInt(-s);
  const q2 = n2 / d2;
  const rem = n2 % d2;
  const roundBit = (q2 & 1n) !== 0n;
  let q = q2 >> 1n;
  const hasTail = rem !== 0n || sticky;
  if (roundBit && (hasTail || (q & 1n) !== 0n)) q++;
  if (q === 1n << BigInt(p)) {
    q >>= 1n;
    e++;
  }
  if (e > f.maxExponent) return Infinity;
  return Number(q) * 2 ** e;
}

/** Number.NumberToFloat */
function numberToFloat(f: FloatInfo, number: NumberBuffer): number {
  let result: number;
  if (number.digitsCount === 0 || number.scale < f.minDecimalExponent) {
    result = 0;
  } else if (number.scale > f.maxDecimalExponent) {
    result = Infinity;
  } else {
    result = numberToFloatingPoint(f, number);
  }
  return number.isNegative ? -result : result;
}

/** Number.NumberToFloatingPointBits (positive value) */
function numberToFloatingPoint(f: FloatInfo, number: NumberBuffer): number {
  const totalDigits = number.digitsCount;
  const positiveExponent = Math.max(0, number.scale);
  const integerDigitsPresent = Math.min(positiveExponent, totalDigits);
  const fractionalDigitsPresent = totalDigits - integerDigitsPresent;
  const exponent = number.scale - integerDigitsPresent - fractionalDigitsPresent;

  if (totalDigits <= 19) {
    const mantissa = BigInt(number.digits);
    const fastExponent = Math.abs(exponent);
    if (mantissa <= f.maxMantissaFastPath && fastExponent <= f.maxExponentFastPath) {
      let mantissa_d = Number(mantissa);
      const scale = Pow10DoubleTable[fastExponent];
      if (fractionalDigitsPresent !== 0) mantissa_d /= scale;
      else mantissa_d *= scale;
      return f.round(mantissa_d);
    }
  }
  return exactToBinary(f, number.digits, exponent, number.hasNonZeroTail);
}

/** Number.TryParseFloat: the value, or null */
function tryParseFloat(f: FloatInfo, value: string, styles: NumberStyles): number | null {
  const number = new NumberBuffer(NumberBufferKind.FloatingPoint, f.bufferLength);
  if (!tryStringToNumber(value, styles, number)) {
    let valueTrim = spanTrim(value);

    if (equalsOrdinalIgnoreCase(valueTrim, PositiveInfinitySymbol)) return Infinity;
    if (equalsOrdinalIgnoreCase(valueTrim, NegativeInfinitySymbol)) return -Infinity;
    if (equalsOrdinalIgnoreCase(valueTrim, NaNSymbol)) return DotNetNaN;

    if (startsWithOrdinalIgnoreCase(valueTrim, PositiveSign)) {
      valueTrim = valueTrim.substring(PositiveSign.length);
      if (equalsOrdinalIgnoreCase(valueTrim, PositiveInfinitySymbol)) return Infinity;
      else if (equalsOrdinalIgnoreCase(valueTrim, NaNSymbol)) return DotNetNaN;
      return null;
    }

    if (startsWithOrdinalIgnoreCase(valueTrim, NegativeSign)) {
      if (equalsOrdinalIgnoreCase(valueTrim.substring(NegativeSign.length), NaNSymbol)) return DotNetNaN;
      // info.AllowHyphenDuringParsing is false for the invariant culture
    }
    return null;
  }
  return numberToFloat(f, number);
}

/** double.Parse(s, styles, invariant) */
export function parseDouble(s: string | null, styles: NumberStyles = NumberStyles.Float | NumberStyles.AllowThousands): number {
  if (s === null || s === undefined) throw new ArgumentNullException('s');
  validateParseStyleFloatingPoint(styles);
  const r = tryParseFloat(DoubleInfo, s, styles);
  if (r === null) throwFormat(s);
  return r;
}

/** float.Parse(s, styles, invariant): the result is a float32 value held in a number. */
export function parseSingle(s: string | null, styles: NumberStyles = NumberStyles.Float | NumberStyles.AllowThousands): number {
  if (s === null || s === undefined) throw new ArgumentNullException('s');
  validateParseStyleFloatingPoint(styles);
  const r = tryParseFloat(SingleInfo, s, styles);
  if (r === null) throwFormat(s);
  return r;
}

/** double.TryParse(s, styles, invariant): the value or null */
export function tryParseDouble(s: string | null, styles: NumberStyles = NumberStyles.Float | NumberStyles.AllowThousands): number | null {
  validateParseStyleFloatingPoint(styles);
  if (s === null || s === undefined) return null;
  return tryParseFloat(DoubleInfo, s, styles);
}

/** float.TryParse(s, styles, invariant): the value or null */
export function tryParseSingle(s: string | null, styles: NumberStyles = NumberStyles.Float | NumberStyles.AllowThousands): number | null {
  validateParseStyleFloatingPoint(styles);
  if (s === null || s === undefined) return null;
  return tryParseFloat(SingleInfo, s, styles);
}

// ---------------------------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------------------------

const SinglePrecision = 9;
const DoublePrecision = 17;
const SinglePrecisionCustomFormat = 7;
const DoublePrecisionCustomFormat = 15;
const DefaultPrecisionExponentialFormat = 6;

function badFormatSpecifier(): never {
  throw new FormatException('Format specifier was invalid.');
}

function isAsciiLetter(c: number): boolean {
  return (c >= 0x41 && c <= 0x5a) || (c >= 0x61 && c <= 0x7a);
}

/** Number.ParseFormatSpecifier: [fmt char ('\0' = custom), digits] */
function parseFormatSpecifier(format: string): [string, number] {
  let c = 0;
  if (format.length > 0) {
    c = format.charCodeAt(0);
    if (isAsciiLetter(c)) {
      if (format.length === 1) return [format[0], -1];
      if (format.length === 2) {
        const d = format.charCodeAt(1) - 0x30;
        if (d >= 0 && d < 10) return [format[0], d];
      } else if (format.length === 3) {
        const d1 = format.charCodeAt(1) - 0x30;
        const d2 = format.charCodeAt(2) - 0x30;
        if (d1 >= 0 && d1 < 10 && d2 >= 0 && d2 < 10) return [format[0], d1 * 10 + d2];
      }
      let n = 0;
      let i = 1;
      while (i < format.length && isDigit(format.charCodeAt(i))) {
        if (n >= 100_000_000) badFormatSpecifier();
        n = n * 10 + format.charCodeAt(i++) - 0x30;
      }
      if (i >= format.length || format.charCodeAt(i) === 0) return [format[0], n];
    }
  }
  return [format.length === 0 || c === 0 ? 'G' : '\0', -1];
}

/** Number.GetFloatingPointMaxDigitsAndPrecision: [maxDigits, precision, isSignificantDigits] */
function getFloatingPointMaxDigitsAndPrecision(fmt: string, precision: number): [number, number, boolean] {
  if (fmt === '\0') return [precision, precision, true];
  const maxDigits = precision;
  let isSignificantDigits: boolean;
  switch (fmt) {
    case 'C':
    case 'c':
      if (precision === -1) precision = CurrencyDecimalDigits;
      isSignificantDigits = false;
      break;
    case 'E':
    case 'e':
      if (precision === -1) precision = DefaultPrecisionExponentialFormat;
      precision++;
      isSignificantDigits = true;
      break;
    case 'F':
    case 'f':
    case 'N':
    case 'n':
      if (precision === -1) precision = NumberDecimalDigits;
      isSignificantDigits = false;
      break;
    case 'G':
    case 'g':
      if (precision === 0) precision = -1;
      isSignificantDigits = true;
      break;
    case 'P':
    case 'p':
      if (precision === -1) precision = PercentDecimalDigits;
      precision += 2;
      isSignificantDigits = false;
      break;
    case 'R':
    case 'r':
      precision = -1;
      isSignificantDigits = true;
      break;
    default:
      badFormatSpecifier();
  }
  return [maxDigits, precision, isSignificantDigits];
}

const Log10V2 = 0.30102999566398119521373889472449;

/** Number.Dragon4 (BigInteger arithmetic is exact, so HeuristicDivide is a plain division). */
function dragon4(
  mantissa: bigint,
  exponent: number,
  mantissaHighBitIdx: number,
  hasUnequalMargins: boolean,
  cutoffNumber: number,
  isSignificantDigits: boolean,
  bufferLength: number,
): { digits: string; decimalExponent: number } {
  const buffer: number[] = [];
  let curDigit = 0;
  let scale: bigint;
  let scaledValue: bigint;
  let scaledMarginLow: bigint;
  let scaledMarginHigh: bigint | null; // null: same as scaledMarginLow

  if (hasUnequalMargins) {
    if (exponent > 0) {
      scaledValue = (4n * mantissa) << BigInt(exponent);
      scale = 4n;
      scaledMarginLow = 1n << BigInt(exponent);
      scaledMarginHigh = 1n << BigInt(exponent + 1);
    } else {
      scaledValue = 4n * mantissa;
      scale = 1n << BigInt(-exponent + 2);
      scaledMarginLow = 1n;
      scaledMarginHigh = 2n;
    }
  } else {
    if (exponent > 0) {
      scaledValue = (2n * mantissa) << BigInt(exponent);
      scale = 2n;
      scaledMarginLow = 1n << BigInt(exponent);
    } else {
      scaledValue = 2n * mantissa;
      scale = 1n << BigInt(-exponent + 1);
      scaledMarginLow = 1n;
    }
    scaledMarginHigh = null;
  }
  const high = (): bigint => scaledMarginHigh ?? scaledMarginLow;

  let digitExponent = Math.ceil((mantissaHighBitIdx + exponent) * Log10V2 - 0.69);

  if (digitExponent > 0) {
    scale *= 10n ** BigInt(digitExponent);
  } else if (digitExponent < 0) {
    const pow10 = 10n ** BigInt(-digitExponent);
    scaledValue *= pow10;
    scaledMarginLow *= pow10;
    if (scaledMarginHigh !== null) scaledMarginHigh = scaledMarginLow * 2n;
  }

  const isEven = mantissa % 2n === 0n;
  let estimateTooLow: boolean;
  if (cutoffNumber === -1) {
    const scaledValueHigh = scaledValue + high();
    estimateTooLow = isEven ? scaledValueHigh >= scale : scaledValueHigh > scale;
  } else {
    estimateTooLow = scaledValue >= scale;
  }

  if (estimateTooLow) {
    digitExponent++;
  } else {
    scaledValue *= 10n;
    scaledMarginLow *= 10n;
    if (scaledMarginHigh !== null) scaledMarginHigh = scaledMarginLow * 2n;
  }

  let cutoffExponent = digitExponent - bufferLength;
  if (cutoffNumber !== -1) {
    const desiredCutoffExponent = isSignificantDigits ? digitExponent - cutoffNumber : -cutoffNumber;
    if (desiredCutoffExponent > cutoffExponent) cutoffExponent = desiredCutoffExponent;
  }

  let decimalExponent = --digitExponent;

  let low = false;
  let hi = false;
  let outputDigit = 0;

  if (cutoffNumber === -1) {
    while (true) {
      outputDigit = Number(scaledValue / scale);
      scaledValue %= scale;
      const scaledValueHigh = scaledValue + high();
      if (isEven) {
        low = scaledValue <= scaledMarginLow;
        hi = scaledValueHigh >= scale;
      } else {
        low = scaledValue < scaledMarginLow;
        hi = scaledValueHigh > scale;
      }
      if (low || hi || digitExponent === cutoffExponent) break;
      buffer[curDigit++] = 0x30 + outputDigit;
      scaledValue *= 10n;
      scaledMarginLow *= 10n;
      if (scaledMarginHigh !== null) scaledMarginHigh = scaledMarginLow * 2n;
      digitExponent--;
    }
  } else if (digitExponent >= cutoffExponent) {
    low = false;
    hi = false;
    while (true) {
      outputDigit = Number(scaledValue / scale);
      scaledValue %= scale;
      if (scaledValue === 0n || digitExponent <= cutoffExponent) break;
      buffer[curDigit++] = 0x30 + outputDigit;
      scaledValue *= 10n;
      digitExponent--;
    }
  } else {
    outputDigit = Number(scaledValue / scale);
    scaledValue %= scale;
    if (outputDigit > 5 || (outputDigit === 5 && scaledValue !== 0n)) {
      decimalExponent++;
      outputDigit = 1;
    }
    buffer[curDigit++] = 0x30 + outputDigit;
    return { digits: String.fromCharCode(...buffer.slice(0, curDigit)), decimalExponent };
  }

  let roundDown = low;
  if (low === hi) {
    const compare = scaledValue * 2n - scale;
    roundDown = compare < 0n;
    if (compare === 0n) roundDown = (outputDigit & 1) === 0;
  }

  if (roundDown) {
    buffer[curDigit++] = 0x30 + outputDigit;
  } else if (outputDigit === 9) {
    while (true) {
      if (curDigit === 0) {
        buffer[curDigit++] = 0x31;
        decimalExponent++;
        break;
      }
      curDigit--;
      if (buffer[curDigit] !== 0x39) {
        buffer[curDigit]++;
        curDigit++;
        break;
      }
    }
  } else {
    buffer[curDigit++] = 0x30 + outputDigit + 1;
  }
  return { digits: String.fromCharCode(...buffer.slice(0, curDigit)), decimalExponent };
}

const f64 = new DataView(new ArrayBuffer(8));

/** Dragon4Double / Dragon4Single */
function dragon4Float(isDouble: boolean, value: number, cutoffNumber: number, isSignificantDigits: boolean, number: NumberBuffer): void {
  let mantissa: bigint;
  let exponent: number;
  let implicitBitIndex: number;
  if (isDouble) {
    f64.setFloat64(0, value);
    const bits = f64.getBigUint64(0);
    mantissa = bits & 0xfffffffffffffn;
    exponent = Number((bits >> 52n) & 0x7ffn);
    implicitBitIndex = 52;
    if (exponent !== 0) {
      mantissa |= 1n << 52n;
      exponent -= 1075;
    } else {
      exponent = -1074;
    }
  } else {
    f64.setFloat32(0, value);
    const bits = f64.getUint32(0);
    mantissa = BigInt(bits & 0x7fffff);
    exponent = (bits >>> 23) & 0xff;
    implicitBitIndex = 23;
    if (exponent !== 0) {
      mantissa |= 1n << 23n;
      exponent -= 150;
    } else {
      exponent = -149;
    }
  }
  let mantissaHighBitIdx: number;
  let hasUnequalMargins = false;
  if (mantissa >> BigInt(implicitBitIndex) !== 0n) {
    mantissaHighBitIdx = implicitBitIndex;
    hasUnequalMargins = mantissa === 1n << BigInt(implicitBitIndex);
  } else {
    mantissaHighBitIdx = bitLength(mantissa) - 1;
  }
  const r = dragon4(
    mantissa,
    exponent,
    mantissaHighBitIdx,
    hasUnequalMargins,
    cutoffNumber,
    isSignificantDigits,
    number.length,
  );
  number.scale = r.decimalExponent + 1;
  number.digits = r.digits;
}

function isNegativeNumber(v: number): boolean {
  return v < 0 || Object.is(v, -0);
}

/** FormatDouble / FormatSingle */
function formatFloat(isDouble: boolean, value: number, format: string | null): string {
  if (!Number.isFinite(value)) {
    if (Number.isNaN(value)) return NaNSymbol;
    return value < 0 ? NegativeInfinitySymbol : PositiveInfinitySymbol;
  }
  let [fmt, precision] = parseFormatSpecifier(format ?? '');
  if (fmt === '\0') {
    precision = isDouble ? DoublePrecisionCustomFormat : SinglePrecisionCustomFormat;
  }
  const number = new NumberBuffer(
    NumberBufferKind.FloatingPoint,
    isDouble ? DoubleNumberBufferLength : SingleNumberBufferLength,
  );
  number.isNegative = isNegativeNumber(value);

  const [maxDigits, prec, isSignificantDigits] = getFloatingPointMaxDigitsAndPrecision(fmt, precision);
  let nMaxDigits = maxDigits;
  precision = prec;

  if (value !== 0) {
    dragon4Float(isDouble, value, precision, isSignificantDigits, number);
  }

  if (fmt !== '\0') {
    if (precision === -1) {
      nMaxDigits = Math.max(number.digitsCount, isDouble ? DoublePrecision : SinglePrecision);
    }
    return numberToString(number, fmt, nMaxDigits);
  }
  throw new NotSupportedException('Custom numeric format strings are not supported.');
}

/** double.ToString(format, invariant): standard formats (G, R, E, F, N, P, C with precision). */
export function formatDouble(v: number, format: string | null = null): string {
  return formatFloat(true, v, format);
}

/** float.ToString(format, invariant) for a float32 value. */
export function formatSingle(v: number, format: string | null = null): string {
  return formatFloat(false, Math.fround(v), format);
}

/** decimal.ToString(format, invariant) from the decimal's parts (see Decimal.toString). */
export function formatDecimal(mantissa: bigint, scale: number, isNegative: boolean, format: string | null = null): string {
  const [fmt, digits] = parseFormatSpecifier(format ?? '');
  const number = new NumberBuffer(NumberBufferKind.Decimal, DecimalNumberBufferLength);
  // DecimalToNumber
  const s = mantissa === 0n ? '' : mantissa.toString();
  number.isNegative = isNegative;
  number.digits = s;
  number.scale = s.length - scale;
  if (fmt !== '\0') return numberToString(number, fmt, digits);
  throw new NotSupportedException('Custom numeric format strings are not supported.');
}

/** Number.RoundNumber */
function roundNumber(number: NumberBuffer, pos: number, isCorrectlyRounded: boolean): void {
  const dig = number.digits.split('').map((c) => c.charCodeAt(0));
  const at = (k: number): number => (k < dig.length ? dig[k] : 0);
  let i = 0;
  while (i < pos && at(i) !== 0) i++;

  const shouldRoundUp = (): boolean => {
    const digit = at(i);
    if (digit === 0 || isCorrectlyRounded) return false;
    return digit >= 0x35;
  };

  if (i === pos && shouldRoundUp()) {
    while (i > 0 && dig[i - 1] === 0x39) i--;
    if (i > 0) {
      dig[i - 1]++;
    } else {
      number.scale++;
      dig[0] = 0x31;
      i = 1;
    }
  } else {
    while (i > 0 && dig[i - 1] === 0x30) i--;
  }

  if (i === 0) {
    if (number.kind !== NumberBufferKind.FloatingPoint) {
      number.isNegative = false;
    }
    number.scale = 0;
  }
  number.digits = String.fromCharCode(...dig.slice(0, i));
}

/** Number.NumberToString (standard format specifiers) */
function numberToString(number: NumberBuffer, format: string, nMaxDigits: number): string {
  const isCorrectlyRounded = number.kind === NumberBufferKind.FloatingPoint;
  let sb = '';
  switch (format) {
    case 'C':
    case 'c': {
      if (nMaxDigits < 0) nMaxDigits = CurrencyDecimalDigits;
      roundNumber(number, number.scale + nMaxDigits, isCorrectlyRounded);
      const fmt = number.isNegative ? ['($#)', '-$#'][CurrencyNegativePattern] : ['$#', '#$'][CurrencyPositivePattern];
      for (const ch of fmt) {
        if (ch === '#') sb += formatFixed(number, nMaxDigits, GroupSizes, CurrencyDecimalSeparator, CurrencyGroupSeparator);
        else if (ch === '-') sb += NegativeSign;
        else if (ch === '$') sb += CurrencySymbol;
        else sb += ch;
      }
      return sb;
    }
    case 'F':
    case 'f':
      if (nMaxDigits < 0) nMaxDigits = NumberDecimalDigits;
      roundNumber(number, number.scale + nMaxDigits, isCorrectlyRounded);
      if (number.isNegative) sb += NegativeSign;
      return sb + formatFixed(number, nMaxDigits, null, NumberDecimalSeparator, null);
    case 'N':
    case 'n': {
      if (nMaxDigits < 0) nMaxDigits = NumberDecimalDigits;
      roundNumber(number, number.scale + nMaxDigits, isCorrectlyRounded);
      const fmt = number.isNegative ? ['(#)', '-#', '- #', '#-', '# -'][NumberNegativePattern] : '#';
      for (const ch of fmt) {
        if (ch === '#') sb += formatFixed(number, nMaxDigits, GroupSizes, NumberDecimalSeparator, NumberGroupSeparator);
        else if (ch === '-') sb += NegativeSign;
        else sb += ch;
      }
      return sb;
    }
    case 'E':
    case 'e':
      if (nMaxDigits < 0) nMaxDigits = DefaultPrecisionExponentialFormat;
      nMaxDigits++;
      roundNumber(number, nMaxDigits, isCorrectlyRounded);
      if (number.isNegative) sb += NegativeSign;
      return sb + formatScientific(number, nMaxDigits, format);
    case 'G':
    case 'g':
    case 'R':
    case 'r': {
      if (format === 'R') format = 'G';
      else if (format === 'r') format = 'g';
      let noRounding = false;
      let skipSign = false;
      let skipRounding = false;
      if (nMaxDigits < 1) {
        if (number.kind === NumberBufferKind.Decimal && nMaxDigits === -1) {
          noRounding = true;
          if (number.digit(0) === 0) skipSign = true;
          skipRounding = true;
        } else {
          nMaxDigits = number.digitsCount;
        }
      }
      if (!skipRounding) roundNumber(number, nMaxDigits, isCorrectlyRounded);
      if (!skipSign && number.isNegative) sb += NegativeSign;
      return sb + formatGeneral(number, nMaxDigits, format === 'G' ? 'E' : 'e', noRounding);
    }
    case 'P':
    case 'p': {
      if (nMaxDigits < 0) nMaxDigits = PercentDecimalDigits;
      number.scale += 2;
      roundNumber(number, number.scale + nMaxDigits, isCorrectlyRounded);
      const fmt = number.isNegative ? ['-# %', '-#%'][PercentNegativePattern] : ['# %', '#%'][PercentPositivePattern];
      for (const ch of fmt) {
        if (ch === '#') sb += formatFixed(number, nMaxDigits, GroupSizes, PercentDecimalSeparator, PercentGroupSeparator);
        else if (ch === '-') sb += NegativeSign;
        else if (ch === '%') sb += PercentSymbol;
        else sb += ch;
      }
      return sb;
    }
    default:
      badFormatSpecifier();
  }
}

/** Number.FormatFixed */
function formatFixed(
  number: NumberBuffer,
  nMaxDigits: number,
  groupDigits: number[] | null,
  sDecimal: string,
  sGroup: string | null,
): string {
  let digPos = number.scale;
  let dig = 0;
  let sb = '';
  if (digPos > 0) {
    if (groupDigits !== null) {
      const digStart = Math.min(digPos, number.digitsCount);
      let intPart = '';
      for (let i = 0; i < digPos; i++) intPart += i < digStart ? number.digits[i] : '0';
      // groups of groupDigits[0] (the invariant culture has [3])
      const groupSize = groupDigits[0];
      let out = '';
      let count = 0;
      for (let i = intPart.length - 1; i >= 0; i--) {
        out = intPart[i] + out;
        count++;
        if (groupSize > 0 && count === groupSize && i !== 0) {
          out = sGroup + out;
          count = 0;
        }
      }
      sb += out;
      dig = digStart;
    } else {
      do {
        sb += number.digit(dig) !== 0 ? number.digits[dig++] : '0';
      } while (--digPos > 0);
    }
  } else {
    sb += '0';
  }

  if (nMaxDigits > 0) {
    sb += sDecimal;
    if (digPos < 0 && nMaxDigits > 0) {
      const zeroes = Math.min(-digPos, nMaxDigits);
      sb += '0'.repeat(zeroes);
      digPos += zeroes;
      nMaxDigits -= zeroes;
    }
    while (nMaxDigits > 0) {
      sb += number.digit(dig) !== 0 ? number.digits[dig++] : '0';
      nMaxDigits--;
    }
  }
  return sb;
}

/** Number.FormatScientific */
function formatScientific(number: NumberBuffer, nMaxDigits: number, expChar: string): string {
  let dig = 0;
  let sb = number.digit(dig) !== 0 ? number.digits[dig++] : '0';
  if (nMaxDigits !== 1) sb += NumberDecimalSeparator;
  while (--nMaxDigits > 0) {
    sb += number.digit(dig) !== 0 ? number.digits[dig++] : '0';
  }
  const e = number.digit(0) === 0 ? 0 : number.scale - 1;
  return sb + formatExponent(e, expChar, 3, true);
}

/** Number.FormatExponent */
function formatExponent(value: number, expChar: string, minDigits: number, positiveSign: boolean): string {
  let sb = expChar;
  if (value < 0) {
    sb += NegativeSign;
    value = -value;
  } else if (positiveSign) {
    sb += PositiveSign;
  }
  return sb + String(value).padStart(minDigits, '0');
}

/** Number.FormatGeneral */
function formatGeneral(number: NumberBuffer, nMaxDigits: number, expChar: string, suppressScientific: boolean): string {
  let digPos = number.scale;
  let scientific = false;
  if (!suppressScientific) {
    if (digPos > nMaxDigits || digPos < -3) {
      digPos = 1;
      scientific = true;
    }
  }
  let dig = 0;
  let sb = '';
  if (digPos > 0) {
    do {
      sb += number.digit(dig) !== 0 ? number.digits[dig++] : '0';
    } while (--digPos > 0);
  } else {
    sb += '0';
  }
  if (number.digit(dig) !== 0 || digPos < 0) {
    sb += NumberDecimalSeparator;
    while (digPos < 0) {
      sb += '0';
      digPos++;
    }
    while (number.digit(dig) !== 0) {
      sb += number.digits[dig++];
    }
  }
  if (scientific) {
    sb += formatExponent(number.scale - 1, expChar, 2, true);
  }
  return sb;
}
