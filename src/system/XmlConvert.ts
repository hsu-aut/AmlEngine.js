// System.Xml.XmlConvert (.NET 8): conversions between CLR values and XML schema lexical forms,
// and the name helpers (Verify*, Encode*/DecodeName with the _xHHHH_ escaping).
// Parsing of numbers goes through Number.ts / Decimal.ts with exactly the NumberStyles that
// XmlConvert passes; dates through XsdDateTime.ts, durations through XsdDuration.ts.

import { XmlException } from '../xml/XmlChars.js';
import { DateTime, DateTimeKind, formatXsdDateTime } from './DateTime.js';
import { Decimal } from './Decimal.js';
import { ArgumentException, ArgumentNullException, FormatException } from './exceptions.js';
import { Guid } from './Guid.js';
import { NumberStyles, formatDouble, formatSingle, parseByte, parseDouble, parseInt16, parseInt32, parseInt64, parseSByte, parseSingle, parseUInt16, parseUInt32, parseUInt64 } from './Number.js';
import { TimeSpan, durationToString } from './TimeSpan.js';
import { XmlCharType } from './XmlCharType.js';
import { XsdDateTimeFlags, xsdDateTimeToDateTime } from './XsdDateTime.js';
import { xsdDurationToTimeSpan } from './XsdDuration.js';

/** System.Xml.XmlDateTimeSerializationMode */
export enum XmlDateTimeSerializationMode {
  Local = 0,
  Utc = 1,
  Unspecified = 2,
  RoundtripKind = 3,
}

const INTEGER_STYLES = NumberStyles.AllowLeadingSign | NumberStyles.AllowLeadingWhite | NumberStyles.AllowTrailingWhite;
const UNSIGNED_STYLES = NumberStyles.AllowLeadingWhite | NumberStyles.AllowTrailingWhite;

/** Trim(WhitespaceChars): ' ', '\t', '\n', '\r' */
function trimXml(s: string): string {
  let a = 0;
  let b = s.length;
  const ws = (c: string) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
  while (a < b && ws(s[a])) a++;
  while (b > a && ws(s[b - 1])) b--;
  return s.slice(a, b);
}

function hex(v: number, digits: number): string {
  return v.toString(16).toUpperCase().padStart(digits, '0');
}

function fromHex(c: string): number {
  const v = parseInt(c, 16);
  return Number.isNaN(v) ? 0xff : v;
}

function switchToLocalTime(value: DateTime): DateTime {
  switch (value.kind) {
    case DateTimeKind.Unspecified:
      return new DateTime(value.ticks, DateTimeKind.Local);
    case DateTimeKind.Utc:
      return value.toLocalTime();
    default:
      return value;
  }
}

function switchToUtcTime(value: DateTime): DateTime {
  switch (value.kind) {
    case DateTimeKind.Unspecified:
      return new DateTime(value.ticks, DateTimeKind.Utc);
    case DateTimeKind.Local:
      return value.toUniversalTime();
    default:
      return value;
  }
}

function applyMode(value: DateTime, mode: XmlDateTimeSerializationMode): DateTime {
  switch (mode) {
    case XmlDateTimeSerializationMode.Local:
      return switchToLocalTime(value);
    case XmlDateTimeSerializationMode.Utc:
      return switchToUtcTime(value);
    case XmlDateTimeSerializationMode.Unspecified:
      return new DateTime(value.ticks, DateTimeKind.Unspecified);
    case XmlDateTimeSerializationMode.RoundtripKind:
      return value;
    default:
      throw new ArgumentException(`The '${mode}' value for the 'dateTimeOption' parameter is not an allowed value for the 'XmlDateTimeSerializationMode' parameter.`);
  }
}

function invalidNameChar(name: string, index: number): Error {
  const ch = name[index] ?? '';
  const msg =
    index === 0
      ? `Name cannot begin with the '${ch}' character, hexadecimal value 0x${hex(ch.charCodeAt(0), 2)}.`
      : `The '${ch}' character, hexadecimal value 0x${hex(ch.charCodeAt(0), 2)}, cannot be included in a name.`;
  return new XmlException(msg);
}

function throwIfNullOrEmpty(name: string | null, paramName: string): asserts name is string {
  if (name === null || name === undefined) throw new ArgumentNullException(paramName);
  if (name === '') throw new ArgumentException('The value cannot be an empty string.', paramName);
}

// ValidateNames (no namespaces)
function parseNCName(s: string): number {
  let i = 0;
  if (i < s.length) {
    if (XmlCharType.isStartNCNameSingleChar(s[i])) i++;
    else return 0;
    while (i < s.length && XmlCharType.isNCNameSingleChar(s[i])) i++;
  }
  return i;
}

function parseNameNoNamespaces(s: string): number {
  let i = 0;
  if (i < s.length) {
    if (XmlCharType.isStartNCNameSingleChar(s[i]) || s[i] === ':') i++;
    else return 0;
    while (i < s.length && (XmlCharType.isNCNameSingleChar(s[i]) || s[i] === ':')) i++;
  }
  return i;
}

function parseNmtokenNoNamespaces(s: string): number {
  let i = 0;
  while (i < s.length && (XmlCharType.isNameSingleChar(s[i]) || s[i] === ':')) i++;
  return i;
}

const DECODE_CHAR = /_[Xx][0-9a-fA-F]{4}(?:_|[0-9a-fA-F]{4}_)/g;
const ENCODE_CHAR = /(?<=_)[Xx][0-9a-fA-F]{4}(?:_|[0-9a-fA-F]{4}_)/g;
const ENCODED_CHAR_LENGTH = 7;

function encodeNameCore(name: string | null, first: boolean, local: boolean): string | null {
  if (name === null || name === '') return name;
  let buf: string | null = null;
  const length = name.length;
  let copyPosition = 0;
  let position = 0;
  const underscorePos = name.indexOf('_');
  const matches: number[] = [];
  if (underscorePos >= 0) {
    ENCODE_CHAR.lastIndex = underscorePos;
    let m: RegExpExecArray | null;
    while ((m = ENCODE_CHAR.exec(name)) !== null) matches.push(m.index - 1);
  }
  let mi = 0;
  let matchPos = mi < matches.length ? matches[mi++] : -1;
  if (first) {
    if ((!XmlCharType.isStartNCNameCharXml4e(name[0]) && (local || name[0] !== ':')) || matchPos === 0) {
      buf ??= '';
      buf += '_x';
      if (length > 1 && XmlCharType.isHighSurrogate(name.charCodeAt(0)) && XmlCharType.isLowSurrogate(name.charCodeAt(1))) {
        buf += hex(name.codePointAt(0)!, 8);
        position++;
        copyPosition = 2;
      } else {
        buf += hex(name.charCodeAt(0), 4);
        copyPosition = 1;
      }
      buf += '_';
      position++;
      if (matchPos === 0 && mi < matches.length) matchPos = matches[mi++];
    }
  }
  for (; position < length; position++) {
    if (
      (local && !XmlCharType.isNCNameCharXml4e(name[position])) ||
      (!local && !XmlCharType.isNameCharXml4e(name[position])) ||
      matchPos === position
    ) {
      buf ??= '';
      if (matchPos === position && mi < matches.length) matchPos = matches[mi++];
      buf += name.slice(copyPosition, position);
      buf += '_x';
      if (length > position + 1 && XmlCharType.isHighSurrogate(name.charCodeAt(position)) && XmlCharType.isLowSurrogate(name.charCodeAt(position + 1))) {
        buf += hex(name.codePointAt(position)!, 8);
        copyPosition = position + 2;
        position++;
      } else {
        buf += hex(name.charCodeAt(position), 4);
        copyPosition = position + 1;
      }
      buf += '_';
    }
  }
  if (copyPosition === 0) return name;
  if (copyPosition < length) buf += name.slice(copyPosition);
  return buf;
}

export class XmlConvert {
  // ------------------------------------------------------------------ names

  static encodeName(name: string | null): string | null {
    return encodeNameCore(name, true, false);
  }

  static encodeNmToken(name: string | null): string | null {
    return encodeNameCore(name, false, false);
  }

  static encodeLocalName(name: string | null): string | null {
    return encodeNameCore(name, true, true);
  }

  static decodeName(name: string | null): string | null {
    if (name === null || name === '') return name;
    const underscorePos = name.indexOf('_');
    if (underscorePos < 0) return name;
    const matches: number[] = [];
    DECODE_CHAR.lastIndex = underscorePos;
    let m: RegExpExecArray | null;
    while ((m = DECODE_CHAR.exec(name)) !== null) matches.push(m.index);
    let mi = 0;
    let matchPos = mi < matches.length ? matches[mi++] : -1;
    let buf = '';
    const length = name.length;
    let copyPosition = 0;
    for (let position = 0; position < length - ENCODED_CHAR_LENGTH + 1; position++) {
      if (position === matchPos) {
        if (mi < matches.length) matchPos = matches[mi++];
        buf += name.slice(copyPosition, position);
        if (name[position + 6] !== '_') {
          // _x12345678_
          let u = 0;
          for (let k = 2; k <= 9; k++) u = u * 16 + fromHex(name[position + k]);
          if (u >= 0x10000) {
            if (u <= 0x10ffff) {
              copyPosition = position + ENCODED_CHAR_LENGTH + 4;
              buf += String.fromCodePoint(u);
            }
          } else {
            copyPosition = position + ENCODED_CHAR_LENGTH + 4;
            buf += String.fromCharCode(u);
          }
          position += ENCODED_CHAR_LENGTH - 1 + 4;
        } else {
          copyPosition = position + ENCODED_CHAR_LENGTH;
          let u = 0;
          for (let k = 2; k <= 5; k++) u = u * 16 + fromHex(name[position + k]);
          buf += String.fromCharCode(u);
          position += ENCODED_CHAR_LENGTH - 1;
        }
      }
    }
    if (copyPosition === 0) return name;
    if (copyPosition < length) buf += name.slice(copyPosition);
    return buf;
  }

  /** XmlConvert.VerifyName: ArgumentNullException / ArgumentException / XmlException. */
  static verifyName(name: string | null): string {
    throwIfNullOrEmpty(name, 'name');
    const endPos = parseNameNoNamespaces(name);
    if (endPos !== name.length) throw invalidNameChar(name, endPos);
    return name;
  }

  static verifyNCName(name: string | null): string {
    throwIfNullOrEmpty(name, 'name');
    const end = parseNCName(name);
    if (end !== name.length) throw invalidNameChar(name, end);
    return name;
  }

  static verifyNMTOKEN(name: string | null): string {
    if (name === null) throw new ArgumentNullException('name');
    if (name.length === 0) throw new XmlException('Invalid NmToken value \'\'.');
    const endPos = parseNmtokenNoNamespaces(name);
    if (endPos !== name.length) throw invalidNameChar(name, endPos === 0 ? 1 : endPos);
    return name;
  }

  static verifyTOKEN(token: string | null): string | null {
    if (token === null || token === '') return token;
    if (token.startsWith(' ') || token.endsWith(' ') || /[\t\n\r]/.test(token) || token.includes('  ')) {
      throw new XmlException(`line-feed (#xA) or tab (#x9) characters, leading or trailing spaces and sequences of one or more spaces (#x20) are not allowed in 'xs:token'.`);
    }
    return token;
  }

  // ------------------------------------------------------------------ to string

  /**
   * XmlConvert.ToString overloads, dispatched on the runtime type: boolean; number (as double);
   * bigint (long / ulong); Decimal; DateTime with an XmlDateTimeSerializationMode or a format
   * string; TimeSpan; Guid. For float use toStringSingle.
   */
  static toString(value: boolean | number | bigint | Decimal | DateTime | TimeSpan | Guid, arg?: XmlDateTimeSerializationMode | string): string {
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return XmlConvert.toStringDouble(value);
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof DateTime) {
      if (typeof arg === 'string') return value.toString(arg);
      if (arg === undefined) return value.toString('yyyy-MM-ddTHH:mm:ss.fffffffzzzzzz');
      return formatXsdDateTime(applyMode(value, arg));
    }
    if (value instanceof TimeSpan) return durationToString(value);
    if (value instanceof Decimal) return value.toString();
    if (value instanceof Guid) return value.toString();
    throw new ArgumentException('Unsupported value type for XmlConvert.ToString.');
  }

  /** XmlConvert.ToString(double) */
  static toStringDouble(value: number): string {
    if (value === -Infinity) return '-INF';
    if (value === Infinity) return 'INF';
    if (Object.is(value, -0)) return '-0';
    return formatDouble(value, 'R');
  }

  /** XmlConvert.ToString(float): `value` must hold a float32 value (Math.fround). */
  static toStringSingle(value: number): string {
    if (value === -Infinity) return '-INF';
    if (value === Infinity) return 'INF';
    if (Object.is(value, -0)) return '-0';
    return formatSingle(value, 'R');
  }

  // ------------------------------------------------------------------ parsing

  /** XmlConvert.ToBoolean: "1"/"true"/"0"/"false" after trimming XML white space. */
  static toBoolean(s: string | null): boolean {
    switch (trimXml(s ?? '')) {
      case '1':
      case 'true':
        return true;
      case '0':
      case 'false':
        return false;
      default:
        throw new FormatException(`The string '${s}' is not a valid Boolean value.`);
    }
  }

  static toDecimal(s: string | null): Decimal {
    return Decimal.parse(s, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint | NumberStyles.AllowLeadingWhite | NumberStyles.AllowTrailingWhite);
  }

  static toSByte(s: string | null): number {
    return parseSByte(s, INTEGER_STYLES);
  }

  static toInt16(s: string | null): number {
    return parseInt16(s, INTEGER_STYLES);
  }

  static toInt32(s: string | null): number {
    return parseInt32(s, INTEGER_STYLES);
  }

  static toInt64(s: string | null): bigint {
    return parseInt64(s, INTEGER_STYLES);
  }

  static toByte(s: string | null): number {
    return parseByte(s, UNSIGNED_STYLES);
  }

  static toUInt16(s: string | null): number {
    return parseUInt16(s, UNSIGNED_STYLES);
  }

  static toUInt32(s: string | null): number {
    return parseUInt32(s, UNSIGNED_STYLES);
  }

  static toUInt64(s: string | null): bigint {
    return parseUInt64(s, UNSIGNED_STYLES);
  }

  /** XmlConvert.ToSingle: the result is a float32 value. */
  static toSingle(s: string | null): number {
    if (s === null) throw new ArgumentNullException('s');
    const value = trimXml(s);
    if (value === '-INF') return -Infinity;
    if (value === 'INF') return Infinity;
    const f = parseSingle(value, NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint | NumberStyles.AllowExponent);
    if (f === 0 && value[0] === '-') return -0;
    return f;
  }

  static toDouble(s: string | null): number {
    if (s === null) throw new ArgumentNullException('s');
    const value = trimXml(s);
    if (value === '-INF') return -Infinity;
    if (value === 'INF') return Infinity;
    const d = parseDouble(
      value,
      NumberStyles.AllowLeadingSign | NumberStyles.AllowDecimalPoint | NumberStyles.AllowExponent | NumberStyles.AllowLeadingWhite | NumberStyles.AllowTrailingWhite,
    );
    if (d === 0 && value[0] === '-') return -0;
    return d;
  }

  /** XmlConvert.ToTimeSpan (xs:duration) */
  static toTimeSpan(s: string | null): TimeSpan {
    return xsdDurationToTimeSpan(s);
  }

  /**
   * XmlConvert.ToDateTime(s, XmlDateTimeSerializationMode): every xs:dateTime / time / date /
   * gYearMonth / gYear / gMonthDay / gDay / gMonth lexical form.
   */
  static toDateTime(s: string, dateTimeOption: XmlDateTimeSerializationMode): DateTime {
    if (s === null) throw new TypeError('s is null'); // NullReferenceException in XsdDateTime.Parser
    return applyMode(xsdDateTimeToDateTime(s, XsdDateTimeFlags.AllXsd), dateTimeOption);
  }

  static toGuid(s: string | null): Guid {
    if (s === null) throw new ArgumentNullException('g');
    return Guid.parse(s);
  }
}
