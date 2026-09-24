// The plain X.TryParse(string) helpers of .NET under the invariant culture, with each type's default
// NumberStyles. Each returns the parsed value, or null where TryParse returns false.
import { Decimal } from './Decimal.js';
import * as N from './Number.js';
import { NumberStyles, isWhiteSpaceChar } from './Number.js';

/** short.TryParse(s) */
export function tryParseInt16(s: string | null): number | null {
  return N.tryParseInt16(s, NumberStyles.Integer);
}
/** int.TryParse(s) */
export function tryParseInt32(s: string | null): number | null {
  return N.tryParseInt32(s, NumberStyles.Integer);
}
/** long.TryParse(s) */
export function tryParseInt64(s: string | null): bigint | null {
  return N.tryParseInt64(s, NumberStyles.Integer);
}
/** ushort.TryParse(s) */
export function tryParseUInt16(s: string | null): number | null {
  return N.tryParseUInt16(s, NumberStyles.Integer);
}
/** uint.TryParse(s) */
export function tryParseUInt32(s: string | null): number | null {
  return N.tryParseUInt32(s, NumberStyles.Integer);
}
/** ulong.TryParse(s) */
export function tryParseUInt64(s: string | null): bigint | null {
  return N.tryParseUInt64(s, NumberStyles.Integer);
}
/** byte.TryParse(s) */
export function tryParseByte(s: string | null): number | null {
  return N.tryParseByte(s, NumberStyles.Integer);
}
/** sbyte.TryParse(s) */
export function tryParseSByte(s: string | null): number | null {
  return N.tryParseSByte(s, NumberStyles.Integer);
}
/** double.TryParse(s) */
export function tryParseDouble(s: string | null): number | null {
  return N.tryParseDouble(s, NumberStyles.Float | NumberStyles.AllowThousands);
}
/** float.TryParse(s): a float32 value held in a number */
export function tryParseSingle(s: string | null): number | null {
  return N.tryParseSingle(s, NumberStyles.Float | NumberStyles.AllowThousands);
}
/** decimal.TryParse(s) */
export function tryParseDecimal(s: string | null): Decimal | null {
  return Decimal.tryParse(s, NumberStyles.Number);
}

/** bool.TryParse(s): "True"/"False" in any case, white space and '\0' trimmed on both ends. */
export function tryParseBoolean(s: string | null): boolean | null {
  if (s === null || s === undefined) return null;
  if (isTrue(s)) return true;
  if (isFalse(s)) return false;
  const originalLength = s.length;
  if (originalLength >= 5) {
    const v = trimWhiteSpaceAndNull(s);
    if (v.length !== originalLength) {
      if (isTrue(v)) return true;
      return isFalse(v) ? false : null;
    }
  }
  return null;
}

function isTrue(s: string): boolean {
  return s.length === 4 && /^true$/i.test(s);
}

function isFalse(s: string): boolean {
  return s.length === 5 && /^false$/i.test(s);
}

function trimWhiteSpaceAndNull(s: string): string {
  let start = 0;
  while (start < s.length) {
    const c = s.charCodeAt(start);
    if (!isWhiteSpaceChar(c) && c !== 0) break;
    start++;
  }
  let end = s.length - 1;
  while (end >= start) {
    const c = s.charCodeAt(end);
    if (!isWhiteSpaceChar(c) && c !== 0) break;
    end--;
  }
  return s.substring(start, end + 1);
}
