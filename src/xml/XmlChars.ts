import { XmlCharType } from '../system/XmlCharType.js';

// XML character classes, as used by System.Xml in .NET 8.

export class XmlException extends Error {
  constructor(
    message: string,
    readonly lineNumber = 0,
    readonly linePosition = 0,
  ) {
    super(lineNumber > 0 ? `${message} Line ${lineNumber}, position ${linePosition}.` : message);
    this.name = 'XmlException';
  }
}

// Name characters follow the table .NET 8 uses (XML 1.0 4th edition, see
// src/system/XmlCharType.ts, generated from .NET). Characters outside the BMP are never name
// characters in .NET (verified: test/xml-corpus/edge35 to edge38).
const isSupplementary = (_cp: number): boolean => false;

export function isNameStartChar(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  if (cp > 0xffff) return isSupplementary(cp);
  return XmlCharType.isStartNCNameSingleChar(cp) || cp === 0x3a;
}

export function isNameChar(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  if (cp > 0xffff) return isSupplementary(cp);
  return XmlCharType.isNameSingleChar(cp);
}

function isNCNameStart(cp: number): boolean {
  return cp > 0xffff ? isSupplementary(cp) : XmlCharType.isStartNCNameSingleChar(cp);
}

function isNCNameRest(cp: number): boolean {
  return cp > 0xffff ? isSupplementary(cp) : XmlCharType.isNCNameSingleChar(cp);
}

export function isNCName(s: string): boolean {
  return firstInvalid(s, false) < 0;
}

export function isName(s: string): boolean {
  return firstInvalid(s, true) < 0;
}

/** Index of the first character that makes s an invalid (NC)Name, or -1. */
function firstInvalid(s: string, colon: boolean): number {
  if (s.length === 0) return 0;
  let i = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    const ok = (colon && cp === 0x3a) || (i === 0 ? isNCNameStart(cp) : isNCNameRest(cp));
    if (!ok) return i;
    i += ch.length;
  }
  return -1;
}

export function verifyNCName(s: string): string {
  if (s.length === 0) throw new XmlException("The empty string '' is not a valid local name.");
  const i = firstInvalid(s, false);
  if (i >= 0) {
    const cp = s.codePointAt(i)!;
    throw new XmlException(`The '${String.fromCodePoint(cp)}' character, hexadecimal value 0x${cp.toString(16).toUpperCase()}, cannot be included in a name.`);
  }
  return s;
}

/** XML 1.0 Char production. */
export function isXmlChar(cp: number): boolean {
  return (
    cp === 0x9 || cp === 0xa || cp === 0xd ||
    (cp >= 0x20 && cp <= 0xd7ff) ||
    (cp >= 0xe000 && cp <= 0xfffd) ||
    (cp >= 0x10000 && cp <= 0x10ffff)
  );
}

export function isXmlWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

export function isWhitespaceOnly(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c !== 0x20 && c !== 0x9 && c !== 0xa && c !== 0xd) return false;
  }
  return true;
}
