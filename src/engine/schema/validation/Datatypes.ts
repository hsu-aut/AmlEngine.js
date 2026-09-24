// The simple types the CAEX schemas use (and the built-in types an xsi:type can name), with the
// lexical rules and the exception messages of System.Xml.Schema.DatatypeImplementation:
// whitespace facets (XmlComplianceUtil), XsdDateTime.Parser, XmlConvert.TryToBoolean,
// XmlQualifiedName.Parse, StringFacetsChecker (built-in facets and enumeration).

import { isNameChar, isNameStartChar } from '../../../xml/XmlChars.js';

export const NS_XS = 'http://www.w3.org/2001/XMLSchema';
export const NS_XML = 'http://www.w3.org/XML/1998/namespace';

/** XmlQualifiedName as a plain value; `key` is the Dictionary key. */
export class QName {
  private static readonly table = new Map<string, QName>();
  private constructor(
    readonly name: string,
    readonly ns: string,
  ) {}
  static get(name: string, ns: string): QName {
    const key = `${ns}\u0000${name}`;
    let q = QName.table.get(key);
    if (!q) {
      q = new QName(name, ns);
      QName.table.set(key, q);
    }
    return q;
  }
  static readonly Empty = QName.get('', '');
  get isEmpty(): boolean {
    return this.name === '' && this.ns === '';
  }
  /** XmlQualifiedName.ToString(): "ns:name" or "name". */
  toString(): string {
    return this.ns.length === 0 ? this.name : `${this.ns}:${this.name}`;
  }
}

/** A schema type: XmlSchemaSimpleType or XmlSchemaComplexType (see XsdCompiler). */
export interface SchemaTypeBase {
  readonly qualifiedName: QName;
  readonly baseType: SchemaTypeBase | null;
  /** XmlSchemaDerivationMethod of this type from its base (Extension 2, Restriction 4, Empty 0). */
  readonly derivedBy: number;
  readonly isSimple: boolean;
}

export type Primitive =
  | 'anySimpleType'
  | 'string'
  | 'normalizedString'
  | 'token'
  | 'language'
  | 'Name'
  | 'NCName'
  | 'NMTOKEN'
  | 'anyURI'
  | 'dateTime'
  | 'boolean'
  | 'QName';

type Whitespace = 'preserve' | 'replace' | 'collapse';

const BUILTIN_WS: Record<Primitive, Whitespace> = {
  anySimpleType: 'collapse',
  string: 'preserve',
  normalizedString: 'replace',
  token: 'collapse',
  language: 'collapse',
  Name: 'collapse',
  NCName: 'collapse',
  NMTOKEN: 'collapse',
  anyURI: 'collapse',
  dateTime: 'collapse',
  boolean: 'collapse',
  QName: 'collapse',
};

/** Result of XmlSchemaDatatype.TryParseValue: the exception message, or the typed value. */
export type ParseResult = { ok: true; value: unknown } | { ok: false; message: string };

/** Resolves a namespace prefix like the validating reader (IXmlNamespaceResolver.LookupNamespace). */
export type NamespaceResolver = (prefix: string) => string | null;

/** XmlSchemaSimpleType with its datatype. */
export class SimpleType implements SchemaTypeBase {
  readonly isSimple = true;
  constructor(
    readonly qualifiedName: QName,
    readonly primitive: Primitive,
    readonly baseType: SchemaTypeBase | null,
    readonly derivedBy: number,
    /** Enumeration facet values (restriction), or null. */
    readonly enumeration: string[] | null = null,
  ) {}

  /** XmlSchemaDatatype.TypeCodeString. */
  get typeCodeString(): string {
    return this.primitive;
  }

  /** Datatype.IsDerivedFrom: this datatype restricts `other` (through the base chain). */
  isDerivedFromDatatype(other: SimpleType): boolean {
    if (other.primitive === 'anySimpleType' && other.enumeration === null) return true;
    for (let t: SchemaTypeBase | null = this; t; t = t.baseType) {
      if (t === other) return true;
      if (!t.isSimple) break;
    }
    // Built-in derivation of the primitive (string > normalizedString > token > language/Name/NMTOKEN > NCName).
    if (other.enumeration === null && other.qualifiedName.ns === NS_XS) {
      return builtinDerives(this.primitive, other.primitive);
    }
    return false;
  }

  /** TryParseValue(string): whitespace facet, built-in lexical checks, facets. */
  tryParseValue(s: string, resolver: NamespaceResolver | null): ParseResult {
    switch (this.primitive) {
      case 'QName':
        return parseQName(s, resolver);
      case 'dateTime': {
        const n = applyWhitespace(s, 'collapse');
        if (!XsdDateTime.tryParse(n)) {
          return { ok: false, message: `The string '${n}' is not a valid DateTime value.` };
        }
        return this.checkEnumeration(n);
      }
      case 'boolean': {
        const n = applyWhitespace(s, 'collapse');
        const t = trimXml(n);
        if (t === '0' || t === 'false' || t === '1' || t === 'true') return { ok: true, value: t === '1' || t === 'true' };
        return { ok: false, message: `The string '${n}' is not a valid Boolean value.` };
      }
      default: {
        const n = applyWhitespace(s, BUILTIN_WS[this.primitive]);
        const err = checkBuiltInFacets(n, this.primitive);
        if (err !== null) return { ok: false, message: err };
        return this.checkEnumeration(n);
      }
    }
  }

  private checkEnumeration(value: string): ParseResult {
    const enumeration = this.allEnumerations();
    if (enumeration !== null && !enumeration.includes(value)) {
      return { ok: false, message: 'The Enumeration constraint failed.' };
    }
    return { ok: true, value };
  }

  /** The effective enumeration facet (the nearest restriction that declares one). */
  private allEnumerations(): string[] | null {
    for (let t: SchemaTypeBase | null = this; t && t.isSimple; t = t.baseType) {
      const e = (t as SimpleType).enumeration;
      if (e !== null) return e;
    }
    return null;
  }

  /** Datatype.IsEqual for fixed values (string compare of the typed values). */
  isEqual(a: unknown, b: unknown): boolean {
    return a === b;
  }
}

function builtinDerives(derived: Primitive, base: Primitive): boolean {
  const parent: Partial<Record<Primitive, Primitive>> = {
    normalizedString: 'string',
    token: 'normalizedString',
    language: 'token',
    Name: 'token',
    NMTOKEN: 'token',
    NCName: 'Name',
  };
  for (let p: Primitive | undefined = derived; p; p = parent[p]) if (p === base) return true;
  return false;
}

const WS_CHARS = ' \t\n\r';

function isXmlWs(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

function trimXml(s: string): string {
  let a = 0;
  let b = s.length;
  while (a < b && WS_CHARS.includes(s[a]!)) a++;
  while (b > a && WS_CHARS.includes(s[b - 1]!)) b--;
  return s.slice(a, b);
}

/** XmlComplianceUtil.NonCDataNormalize (collapse). An all-whitespace value becomes a single space. */
export function nonCDataNormalize(value: string): string {
  const length = value.length;
  if (length <= 0) return '';
  let num = 0;
  while (isXmlWs(value[num]!)) {
    num++;
    if (num === length) return ' ';
  }
  let sb: string | null = null;
  let num2 = num;
  while (num2 < length) {
    if (!isXmlWs(value[num2]!)) {
      num2++;
      continue;
    }
    let i = num2 + 1;
    while (i < length && isXmlWs(value[i]!)) i++;
    if (i === length) {
      if (sb === null) return value.substring(num, num2);
      sb += value.substring(num, num2);
      return sb;
    }
    if (i > num2 + 1 || value[num2] !== ' ') {
      if (sb === null) sb = '';
      sb += value.substring(num, num2);
      sb += ' ';
      num = i;
      num2 = i;
    } else {
      num2++;
    }
  }
  if (sb !== null) {
    if (num < num2) sb += value.substring(num, num2);
    return sb;
  }
  if (num > 0) return value.substring(num, length);
  return value;
}

/** XmlComplianceUtil.CDataNormalize (replace): tab, CR, LF become spaces (CR LF one space). */
export function cDataNormalize(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const c = value[i]!;
    if (c === '\r' && value[i + 1] === '\n') {
      out += ' ';
      i++;
    } else if (c === '\t' || c === '\n' || c === '\r') out += ' ';
    else out += c;
  }
  return out;
}

function applyWhitespace(s: string, ws: Whitespace): string {
  if (ws === 'collapse') return nonCDataNormalize(s);
  if (ws === 'replace') return cDataNormalize(s);
  return s;
}

const LANGUAGE = /^([a-zA-Z]{1,8})(-[a-zA-Z0-9]{1,8})*\n?$/;

/** StringFacetsChecker.CheckBuiltInFacets. */
function checkBuiltInFacets(s: string, p: Primitive): string | null {
  switch (p) {
    case 'anyURI': {
      if (s.length > 0) {
        const t = trimXml(s);
        if (t.length === 0 || t.includes('##')) return `The string '${t}' is not a valid Uri value.`;
      }
      return null;
    }
    case 'language':
      if (s.length === 0) return 'The attribute value cannot be empty.';
      if (!LANGUAGE.test(s)) return "'' is an invalid language identifier.";
      return null;
    case 'NCName':
      return verifyName(s, false);
    case 'Name':
      return verifyName(s, true);
    default:
      return null;
  }
}

function isStartNCNameChar(c: string): boolean {
  const code = c.charCodeAt(0);
  if (code >= 0xd800 && code <= 0xdfff) return false;
  return c !== ':' && isNameStartChar(c);
}

function isNCNameChar(c: string): boolean {
  const code = c.charCodeAt(0);
  if (code >= 0xd800 && code <= 0xdfff) return false;
  return c !== ':' && isNameChar(c);
}

function hex2(code: number): string {
  const h = code.toString(16).toUpperCase();
  return '0x' + (h.length < 2 ? '0' + h : h);
}

/** XmlException.BuildCharExceptionArgs. */
function charArgs(s: string, i: number): [string, string] {
  const c = s.charCodeAt(i);
  if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
    const cp = s.codePointAt(i)!;
    return [s.slice(i, i + 2), hex2(cp)];
  }
  return [c === 0 ? '.' : s[i]!, hex2(c)];
}

/** ValidateNames.ThrowInvalidName / GetInvalidNameException message. */
function invalidNameMessage(s: string, offsetStart: number, offsetBad: number): string {
  if (offsetStart >= s.length) return "The empty string '' is not a valid name.";
  const c = s[offsetBad]!;
  const [ch, hex] = charArgs(s, offsetBad);
  if (isNCNameChar(c) && !isStartNCNameChar(c)) return `Name cannot begin with the '${ch}' character, hexadecimal value ${hex}.`;
  return `The '${ch}' character, hexadecimal value ${hex}, cannot be included in a name.`;
}

function parseNCName(s: string, offset: number): number {
  let i = offset;
  if (i < s.length) {
    if (!isStartNCNameChar(s[i]!)) return 0;
    for (i++; i < s.length && isNCNameChar(s[i]!); i++);
  }
  return i - offset;
}

/** XmlConvert.TryVerifyNCName / TryVerifyName message, or null. */
function verifyName(s: string, allowColon: boolean): string | null {
  if (s.length === 0) return "The empty string '' is not a valid name.";
  if (!allowColon) {
    const n = parseNCName(s, 0);
    if (n === s.length) return null;
    return invalidNameMessage(s, 0, n);
  }
  let i = 0;
  const start = (c: string) => c === ':' || isStartNCNameChar(c);
  const rest = (c: string) => c === ':' || isNCNameChar(c);
  if (start(s[0]!)) for (i = 1; i < s.length && rest(s[i]!); i++);
  if (i === s.length) return null;
  return invalidNameMessage(s, 0, i);
}

/** Datatype_QName.TryParseValue. */
function parseQName(s: string, resolver: NamespaceResolver | null): ParseResult {
  if (s.length === 0) return { ok: false, message: 'The attribute value cannot be empty.' };
  const n = nonCDataNormalize(s);
  let colon = 0;
  let len = parseNCName(n, 0);
  if (len !== 0 && len < n.length && n[len] === ':') {
    const l2 = parseNCName(n, len + 1);
    if (l2 !== 0) {
      colon = len;
      len += l2 + 1;
    }
  }
  if (len === 0 || len !== n.length) return { ok: false, message: invalidNameMessage(n, 0, len) };
  const prefix = colon !== 0 ? n.slice(0, colon) : '';
  const localName = colon !== 0 ? n.slice(colon + 1) : n;
  let ns = resolver ? resolver(prefix) : null;
  if (ns === null) {
    if (prefix.length !== 0) return { ok: false, message: `'${prefix}' is an undeclared prefix.` };
    ns = '';
  }
  return { ok: true, value: QName.get(localName, ns) };
}

// ---------------------------------------------------------------------------------------------
// XsdDateTime.Parser for XsdDateTimeFlags.DateTime.

/** char.IsWhiteSpace. */
function isWhiteSpace(code: number): boolean {
  return (
    code === 0x20 || (code >= 0x9 && code <= 0xd) || code === 0xa0 || code === 0x85 || code === 0x1680 ||
    (code >= 0x2000 && code <= 0x200a) || code === 0x2028 || code === 0x2029 || code === 0x202f ||
    code === 0x205f || code === 0x3000
  );
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
}

export class XsdDateTime {
  private text = '';
  private length = 0;

  /** XsdDateTime.TryParse(text, XsdDateTimeFlags.DateTime, out _). */
  static tryParse(text: string): boolean {
    const p = new XsdDateTime();
    return p.parse(text);
  }

  private parse(text: string): boolean {
    this.text = text;
    this.length = text.length;
    let i = 0;
    while (i < this.length && isWhiteSpace(text.charCodeAt(i))) i++;
    return this.parseDate(i) && this.parseChar(i + 10, 'T') && this.parseTime(i + 11);
  }

  private parseDate(start: number): boolean {
    const year = this.parse4Dig(start);
    if (year === null || year < 1 || !this.parseChar(start + 4, '-')) return false;
    const month = this.parse2Dig(start + 5);
    if (month === null || month < 1 || month > 12 || !this.parseChar(start + 7, '-')) return false;
    const day = this.parse2Dig(start + 8);
    if (day === null || day < 1) return false;
    return day <= daysInMonth(year, month);
  }

  /** ParseTimeAndZoneAndWhitespace. */
  private parseTime(start: number): boolean {
    const hour = this.parse2Dig(start);
    if (hour === null || hour >= 24 || !this.parseChar(start + 2, ':')) return false;
    const minute = this.parse2Dig(start + 3);
    if (minute === null || minute >= 60 || !this.parseChar(start + 5, ':')) return false;
    const second = this.parse2Dig(start + 6);
    if (second === null || second >= 60) return false;
    start += 8;
    if (this.parseChar(start, '.')) {
      let num = 0;
      while (++start < this.length) {
        const d = this.text.charCodeAt(start) - 48;
        if (d < 0 || d > 9) break;
        num++;
      }
      if (num === 0) return false;
    }
    return this.parseZoneAndWhitespace(start);
  }

  private parseZoneAndWhitespace(start: number): boolean {
    if (start < this.length) {
      const c = this.text[start];
      if (c === 'Z' || c === 'z') {
        start++;
      } else if (start + 5 < this.length) {
        const zh = this.parse2Dig(start + 1);
        const zm = this.parse2Dig(start + 4);
        if (zh !== null && this.parseChar(start + 3, ':') && zm !== null) {
          if (c === '-' || c === '+') start += 6;
        }
      }
    }
    while (start < this.length && isWhiteSpace(this.text.charCodeAt(start))) start++;
    return start === this.length;
  }

  private parse4Dig(start: number): number | null {
    if (start + 3 < this.length) {
      let n = 0;
      for (let k = 0; k < 4; k++) {
        const d = this.text.charCodeAt(start + k) - 48;
        if (d < 0 || d > 9) return null;
        n = n * 10 + d;
      }
      return n;
    }
    return null;
  }

  private parse2Dig(start: number): number | null {
    if (start + 1 < this.length) {
      const a = this.text.charCodeAt(start) - 48;
      const b = this.text.charCodeAt(start + 1) - 48;
      if (a >= 0 && a < 10 && b >= 0 && b < 10) return a * 10 + b;
    }
    return null;
  }

  private parseChar(start: number, ch: string): boolean {
    return start < this.length && this.text[start] === ch;
  }
}
