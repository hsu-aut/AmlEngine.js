// String helpers with C# semantics.

/** string.IsNullOrEmpty. */
export function isNullOrEmpty(s: string | null | undefined): s is null | undefined | '' {
  return s === null || s === undefined || s.length === 0;
}

/** string.IsNullOrWhiteSpace (char.IsWhiteSpace covers the Unicode white space set). */
export function isNullOrWhiteSpace(s: string | null | undefined): boolean {
  return s === null || s === undefined || /^[\s\u0085]*$/u.test(s);
}

/**
 * Code units whose Unicode simple upper-case mapping .NET 8 does not apply: U+0131 (the invariant
 * culture keeps the dotless i) and letters that got a mapping after the Unicode version of .NET 8.
 */
const NO_UPPER = new Set([0x131, 0x19b, 0x264, 0x1c8a, 0xa7cd, 0xa7db]);

/** char.ToUpperInvariant: the simple (one to one) mapping; JS toUpperCase applies the full one. */
function toUpperInvariantChar(ch: string): string {
  const c = ch.charCodeAt(0);
  if (NO_UPPER.has(c)) return ch;
  // Greek letters with ypogegrammeni: the simple mapping is the title case letter.
  if ((c >= 0x1f80 && c <= 0x1f87) || (c >= 0x1f90 && c <= 0x1f97) || (c >= 0x1fa0 && c <= 0x1fa7)) return String.fromCharCode(c + 8);
  if (c === 0x1fb3 || c === 0x1fc3 || c === 0x1ff3) return String.fromCharCode(c + 9);
  const u = ch.toUpperCase();
  return u.length === ch.length ? u : ch;
}

/** char.ToUpperInvariant(s[0]) + rest. */
export function upperFirst(s: string): string {
  return s.length === 0 ? s : toUpperInvariantChar(s[0]) + s.substring(1);
}

/**
 * string.Equals(a, b, StringComparison.OrdinalIgnoreCase): code unit by code unit (surrogate pairs
 * as one code point) after OrdinalCasing.ToUpper, which is ToUpperInvariant except that U+017F
 * (long s) stays unchanged.
 */
export function equalsOrdinalIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a.charCodeAt(i);
    const y = b.charCodeAt(i);
    if (x === y) {
      if (x < 0xd800 || x > 0xdbff) continue;
    }
    const pairA = x >= 0xd800 && x <= 0xdbff && i + 1 < a.length && a.charCodeAt(i + 1) >= 0xdc00 && a.charCodeAt(i + 1) <= 0xdfff;
    const pairB = y >= 0xd800 && y <= 0xdbff && i + 1 < b.length && b.charCodeAt(i + 1) >= 0xdc00 && b.charCodeAt(i + 1) <= 0xdfff;
    if (pairA || pairB) {
      if (!pairA || !pairB) return false;
      const ua = a.substring(i, i + 2).toUpperCase();
      const ub = b.substring(i, i + 2).toUpperCase();
      if (ua !== ub) return false;
      i++;
      continue;
    }
    if (x === y) continue;
    const ca = a[i];
    const cb = b[i];
    const ua = x === 0x17f ? ca : toUpperInvariantChar(ca);
    const ub = y === 0x17f ? cb : toUpperInvariantChar(cb);
    if (ua !== ub) return false;
  }
  return true;
}
