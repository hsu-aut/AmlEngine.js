// XML 1.0 (fifth edition) character classes, as used by System.Xml.

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

const NAME_START =
  'A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D' +
  '\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}';
const NAME_REST = NAME_START + '\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040';

const NCNAME = new RegExp(`^[${NAME_START}][${NAME_REST}]*$`, 'u');
const NAME = new RegExp(`^[:${NAME_START}][:${NAME_REST}]*$`, 'u');
const NAME_START_CHAR = new RegExp(`[:${NAME_START}]`, 'u');
const NAME_CHAR = new RegExp(`[:${NAME_REST}]`, 'u');

export function isNCName(s: string): boolean {
  return NCNAME.test(s);
}

export function isName(s: string): boolean {
  return NAME.test(s);
}

export function isNameStartChar(ch: string): boolean {
  return NAME_START_CHAR.test(ch);
}

export function isNameChar(ch: string): boolean {
  return NAME_CHAR.test(ch);
}

export function verifyNCName(s: string): string {
  if (s.length === 0) throw new XmlException('The empty string \'\' is not a valid local name.');
  if (!isNCName(s)) {
    const cp = s.codePointAt(firstInvalidIndex(s))!;
    const ch = String.fromCodePoint(cp);
    throw new XmlException(`The '${ch}' character, hexadecimal value 0x${cp.toString(16).toUpperCase()}, cannot be included in a name.`);
  }
  return s;
}

function firstInvalidIndex(s: string): number {
  let i = 0;
  for (const ch of s) {
    if (i === 0 ? !isNameStartChar(ch) || ch === ':' : !isNameChar(ch) || ch === ':') return i;
    i += ch.length;
  }
  return 0;
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
