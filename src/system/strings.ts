// String helpers with C# semantics.
import { isWhiteSpace } from './Char.js';
import { LOWER, ORDINAL_UPPER, SUPP_LOWER, SUPP_ORDINAL_UPPER, SUPP_UPPER, UPPER } from './casing-data.js';

/** string.IsNullOrEmpty. */
export function isNullOrEmpty(s: string | null | undefined): s is null | undefined | '' {
  return s === null || s === undefined || s.length === 0;
}

/** string.IsNullOrWhiteSpace: char.IsWhiteSpace (U+FEFF is no white space in .NET, unlike in JS). */
export function isNullOrWhiteSpace(s: string | null | undefined): boolean {
  if (s === null || s === undefined) return true;
  for (let i = 0; i < s.length; i++) if (!isWhiteSpace(s[i])) return false;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Case mapping. .NET maps one code point to one code point (simple case mapping) with its own
// tables; JS toUpperCase/toLowerCase apply the full mapping ('ß' to 'SS') of the Unicode version
// of the engine, which differs between Node and browser versions. The port therefore uses fixed
// tables taken from .NET (src/system/casing-data.ts, scripts/gen-casing.mjs).

/** A BMP table as a Uint16Array (built on first use) and a supplementary table as a Map. */
function bmpTable(runs: readonly number[]): () => Uint16Array {
  let t: Uint16Array | null = null;
  return () => {
    if (t === null) {
      t = new Uint16Array(0x10000);
      for (let c = 0; c < 0x10000; c++) t[c] = c;
      for (let i = 0; i < runs.length; i += 4) {
        for (let k = 0; k < runs[i + 1]; k++) {
          const c = runs[i] + k * runs[i + 3];
          t[c] = c + runs[i + 2];
        }
      }
    }
    return t;
  };
}

function suppTable(runs: readonly number[]): () => Map<number, number> {
  let t: Map<number, number> | null = null;
  return () => {
    if (t === null) {
      t = new Map();
      for (let i = 0; i < runs.length; i += 4) {
        for (let k = 0; k < runs[i + 1]; k++) {
          const c = runs[i] + k * runs[i + 3];
          t.set(c, c + runs[i + 2]);
        }
      }
    }
    return t;
  };
}

const upperTable = bmpTable(UPPER);
const lowerTable = bmpTable(LOWER);
const ordinalUpperTable = bmpTable(ORDINAL_UPPER);
const suppUpper = suppTable(SUPP_UPPER);
const suppLower = suppTable(SUPP_LOWER);
const suppOrdinalUpper = suppTable(SUPP_ORDINAL_UPPER);

/** char.ToUpperInvariant for a UTF-16 code unit. */
export function toUpperInvariantCode(c: number): number {
  if (c < 0x80) return c >= 0x61 && c <= 0x7a ? c - 0x20 : c;
  return upperTable()[c];
}

/** char.ToLowerInvariant for a UTF-16 code unit. */
export function toLowerInvariantCode(c: number): number {
  if (c < 0x80) return c >= 0x41 && c <= 0x5a ? c + 0x20 : c;
  return lowerTable()[c];
}

/** OrdinalCasing.ToUpper(char): the upper casing of OrdinalIgnoreCase (as ToUpperInvariant, but U+017F stays). */
export function ordinalUpperCode(c: number): number {
  if (c < 0x80) return c >= 0x61 && c <= 0x7a ? c - 0x20 : c;
  return ordinalUpperTable()[c];
}

function isHigh(c: number): boolean {
  return c >= 0xd800 && c <= 0xdbff;
}

function isLow(c: number): boolean {
  return c >= 0xdc00 && c <= 0xdfff;
}

/** Maps every code point of s: BMP code units with `bmp`, surrogate pairs with `supp`, lone surrogates stay. */
function mapString(s: string, bmp: (c: number) => number, supp: () => Map<number, number>): string {
  let r = '';
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    let m: string | null = null;
    let width = 1;
    if (isHigh(c) && i + 1 < s.length && isLow(s.charCodeAt(i + 1))) {
      const cp = ((c - 0xd800) << 10) + (s.charCodeAt(i + 1) - 0xdc00) + 0x10000;
      const u = supp().get(cp);
      if (u !== undefined) m = String.fromCodePoint(u);
      width = 2;
    } else {
      const u = bmp(c);
      if (u !== c) m = String.fromCharCode(u);
    }
    if (m !== null) {
      r += s.substring(from, i) + m;
      from = i + width;
    }
    i += width - 1;
  }
  return from === 0 ? s : r + s.substring(from);
}

/** string.ToUpperInvariant (also string.ToUpper() under the invariant culture). */
export function toUpperInvariant(s: string): string {
  return mapString(s, toUpperInvariantCode, suppUpper);
}

/** string.ToLowerInvariant (also string.ToLower() under the invariant culture). */
export function toLowerInvariant(s: string): string {
  return mapString(s, toLowerInvariantCode, suppLower);
}

/** Upper case form of s as OrdinalIgnoreCase compares it (a key for case-insensitive maps). */
export function toUpperOrdinal(s: string): string {
  return mapString(s, ordinalUpperCode, suppOrdinalUpper);
}

/** char.ToUpperInvariant(s[0]) + rest. */
export function upperFirst(s: string): string {
  if (s.length === 0) return s;
  const c = s.charCodeAt(0);
  const u = toUpperInvariantCode(c);
  return u === c ? s : String.fromCharCode(u) + s.substring(1);
}

/**
 * string.Compare(a, b, StringComparison.OrdinalIgnoreCase), with the result values of .NET 8
 * (oracle cases str.cmpOic): the difference of the first unequal upper cased code units; for two
 * surrogate pairs the difference of the upper cased code points; a pair against a BMP character
 * is 1 or -1 (code point order); otherwise the difference of the lengths.
 */
export function compareOrdinalIgnoreCase(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  let i = 0;
  while (i < n) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    const pairA = isHigh(x) && i + 1 < a.length && isLow(a.charCodeAt(i + 1));
    const pairB = isHigh(y) && i + 1 < b.length && isLow(b.charCodeAt(i + 1));
    if (pairA && pairB) {
      const cpA = ((x - 0xd800) << 10) + (a.charCodeAt(i + 1) - 0xdc00) + 0x10000;
      const cpB = ((y - 0xd800) << 10) + (b.charCodeAt(i + 1) - 0xdc00) + 0x10000;
      if (cpA !== cpB) {
        const ua = suppOrdinalUpper().get(cpA) ?? cpA;
        const ub = suppOrdinalUpper().get(cpB) ?? cpB;
        if (ua !== ub) return ua - ub;
      }
      i += 2;
      continue;
    }
    if (pairA !== pairB) return pairA ? 1 : -1;
    if (x !== y) {
      const ua = ordinalUpperCode(x);
      const ub = ordinalUpperCode(y);
      if (ua !== ub) return ua - ub;
    }
    i++;
  }
  return a.length - b.length;
}

/** string.Equals(a, b, StringComparison.OrdinalIgnoreCase). */
export function equalsOrdinalIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return a.length === b.length && compareOrdinalIgnoreCase(a, b) === 0;
}
