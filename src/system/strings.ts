// String helpers with C# semantics.

/** string.IsNullOrEmpty. */
export function isNullOrEmpty(s: string | null | undefined): s is null | undefined | '' {
  return s === null || s === undefined || s.length === 0;
}

/** string.IsNullOrWhiteSpace (char.IsWhiteSpace covers the Unicode white space set). */
export function isNullOrWhiteSpace(s: string | null | undefined): boolean {
  return s === null || s === undefined || /^[\s\u0085]*$/u.test(s);
}

/** char.ToUpper(s[0]) + rest, invariant. */
export function upperFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.substring(1);
}

/** string.Equals(a, b, StringComparison.OrdinalIgnoreCase). */
export function equalsOrdinalIgnoreCase(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === b) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;
  return a.length === b.length && a.toUpperCase() === b.toUpperCase();
}
