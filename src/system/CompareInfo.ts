// Culture sensitive string.StartsWith / string.EndsWith (CompareInfo.IsPrefix / IsSuffix with
// CompareOptions.None) of .NET on ICU, for the invariant culture.
//
// .NET compares the collation elements of both strings (pal_collation.c, SimpleAffix): completely
// ignorable elements are skipped on both sides, the remaining elements must be equal (tertiary
// strength), and a prefix match fails when the next element of the source is a combining mark that
// belongs to the preceding character. The emulation models collation elements as code points after
// canonical decomposition of every single character (no reordering across characters, as ICU does
// without normalization mode), treats format and control characters, variation selectors, U+034F,
// U+17B4/U+17B5 and the Hebrew accents as ignorable, and treats non-spacing and enclosing marks as
// secondary elements, except the marks that carry primary weights in the root collation (viramas,
// Thai, Lao and Tibetan vowel signs, and the ccc = 0 marks of the Brahmic scripts).

import { ArgumentNullException } from './exceptions.js';

const IGNORABLE = /^(?:\p{Cf}|[\u034F\u17B4\u17B5\u180B-\u180D\u180F\uFE00-\uFE0F\u0591-\u05AF\u{E0100}-\u{E01EF}]|(?![\t\n\v\f\r\u0085])\p{Cc})$/u;
const MARK = /^[\p{Mn}\p{Me}]$/u;
const ENCLOSING = /^\p{Me}$/u;

/** Brahmic and South-East Asian scripts (U+0900..U+0FFF with Thai, Lao and Tibetan, Myanmar, Khmer, Balinese, ...). */
function isBrahmic(cp: number): boolean {
  return (
    (cp >= 0x0900 && cp <= 0x0fff) ||
    (cp >= 0x1000 && cp <= 0x109f) ||
    (cp >= 0x1780 && cp <= 0x17ff) ||
    (cp >= 0x1b00 && cp <= 0x1b7f) ||
    (cp >= 0xa800 && cp <= 0xa82f) ||
    (cp >= 0x11000 && cp <= 0x111ff)
  );
}

/** Canonical combining class compared by the reordering of the canonical decomposition. */
function cccBelow(mark: string, reference: string): boolean {
  return (reference + mark).normalize('NFD') !== reference + mark;
}

/** ccc(mark) > 0 (and below 240). */
function hasCombiningClass(mark: string): boolean {
  return cccBelow(mark, '\u0345');
}

/** ccc(mark) in the classes of viramas (9) and of the Thai, Lao and Tibetan vowel signs (103, 118, 129, 130, 132). */
function isVowelOrViramaClass(mark: string): boolean {
  const inRange = (low: string, high: string) => !cccBelow(mark, low) && cccBelow(mark, high);
  return (
    inRange('\u094D', '\u05B0') || // 9
    inRange('\u0E38', '\u0E48') || // 103
    inRange('\u0EB8', '\u0EC8') || // 118
    inRange('\u0F71', '\u0F72') || // 129
    inRange('\u0F72', '\u0F74') || // 130
    inRange('\u0F74', '\u0327') // 132
  );
}

/** A collation element that only carries secondary (and tertiary) weight: a mark of the preceding character. */
function isSecondary(ch: string): boolean {
  if (!MARK.test(ch)) return false;
  if (ENCLOSING.test(ch)) return true;
  if (!hasCombiningClass(ch)) return !isBrahmic(ch.codePointAt(0)!);
  return !isVowelOrViramaClass(ch);
}

interface Unit {
  text: string;
  ignorable: boolean;
}

function units(s: string): Unit[] {
  const r: Unit[] = [];
  for (const ch of s) {
    if (IGNORABLE.test(ch)) {
      r.push({ text: ch, ignorable: true });
      continue;
    }
    const d = ch.length === 1 && ch.charCodeAt(0) >= 0xd800 && ch.charCodeAt(0) <= 0xdfff ? ch : ch.normalize('NFD');
    for (const u of d) r.push({ text: u, ignorable: false });
  }
  return r;
}

/** string.StartsWith(value) with the current (invariant) culture. */
export function cultureStartsWith(s: string, value: string | null | undefined): boolean {
  if (value === null || value === undefined) throw new ArgumentNullException('value');
  if (value.length === 0) return true;
  const source = units(s);
  const prefix = units(value);
  let i = 0;
  for (const p of prefix) {
    if (p.ignorable) continue;
    while (i < source.length && source[i]!.ignorable) i++;
    if (i >= source.length || source[i]!.text !== p.text) return false;
    i++;
  }
  if (i >= source.length || source[i]!.ignorable) return true;
  return !isSecondary(source[i]!.text);
}

/** string.EndsWith(value) with the current (invariant) culture. */
export function cultureEndsWith(s: string, value: string | null | undefined): boolean {
  if (value === null || value === undefined) throw new ArgumentNullException('value');
  if (value.length === 0) return true;
  const source = units(s);
  const suffix = units(value);
  let i = source.length - 1;
  for (let k = suffix.length - 1; k >= 0; k--) {
    const p = suffix[k]!;
    if (p.ignorable) continue;
    while (i >= 0 && source[i]!.ignorable) i--;
    if (i < 0 || source[i]!.text !== p.text) return false;
    i--;
  }
  return true;
}
