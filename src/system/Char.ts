// System.Char helpers.

/** char.IsWhiteSpace: Zs, Zl, Zp, U+0009..U+000D, U+0085. */
export function isWhiteSpace(ch: string): boolean {
  const c = ch.charCodeAt(0);
  if (c <= 0xff) return c === 0x20 || (c >= 0x09 && c <= 0x0d) || c === 0x85 || c === 0xa0;
  return c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
}

/** string.Trim() / span.Trim(): removes char.IsWhiteSpace characters at both ends. */
export function trimWhiteSpace(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isWhiteSpace(s[start])) start++;
  while (end > start && isWhiteSpace(s[end - 1])) end--;
  return s.slice(start, end);
}
