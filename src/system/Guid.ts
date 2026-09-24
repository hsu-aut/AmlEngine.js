// System.Guid: parsing (Guid.Parse / TryParse, all formats including the legacy quirks of the
// "D" format and the whitespace-tolerant "X" format) and ToString("D" | "N" | "B" | "P" | "X").

import { trimWhiteSpace, isWhiteSpace } from './Char.js';
import { ArgumentNullException, FormatException } from './exceptions.js';

/** Hex digit value, or -1 (HexConverter.FromChar). */
function hexValue(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 65 && c <= 70) return c - 55;
  if (c >= 97 && c <= 102) return c - 87;
  return -1;
}

function hex(v: number, digits: number): string {
  return v.toString(16).padStart(digits, '0');
}

type Failure = 'format' | 'overflow';

class Parsed {
  a = 0;
  b = 0;
  c = 0;
  /** d, e, f, g, h, i, j, k */
  rest = [0, 0, 0, 0, 0, 0, 0, 0];
  failure: Failure = 'format';
}

export class Guid {
  static readonly empty = new Guid(0, 0, 0, [0, 0, 0, 0, 0, 0, 0, 0]);

  private readonly _a: number;
  private readonly _b: number;
  private readonly _c: number;
  private readonly _rest: readonly number[];

  private constructor(a: number, b: number, c: number, rest: readonly number[]) {
    this._a = a >>> 0;
    this._b = b & 0xffff;
    this._c = c & 0xffff;
    this._rest = rest.map((x) => x & 0xff);
  }

  /** Guid.NewGuid(): a random (version 4) GUID. */
  static newGuid(): Guid {
    const c = (globalThis as { crypto?: { randomUUID?: () => string; getRandomValues?: (a: Uint8Array) => Uint8Array } }).crypto;
    if (c?.randomUUID) return Guid.parse(c.randomUUID());
    const bytes = new Uint8Array(16);
    if (c?.getRandomValues) c.getRandomValues(bytes);
    else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = Array.from(bytes, (x) => hex(x, 2)).join('');
    return Guid.parse(h);
  }

  /** Guid.Parse(string): FormatException (OverflowException for too long "X" numbers) on failure. */
  static parse(input: string | null): Guid {
    if (input === null) throw new ArgumentNullException('input');
    const r = new Parsed();
    if (tryParseGuid(input, r)) return new Guid(r.a, r.b, r.c, r.rest);
    // GuidParseThrowStyle.AllButOverflow: FormatException also for too long "X" numbers
    throw new FormatException('Unrecognized Guid format.');
  }

  /** Guid.TryParse(string); null on failure. */
  static tryParse(input: string | null): Guid | null {
    if (input === null) return null;
    const r = new Parsed();
    return tryParseGuid(input, r) ? new Guid(r.a, r.b, r.c, r.rest) : null;
  }

  equals(other: unknown): boolean {
    return other instanceof Guid && other.toString() === this.toString();
  }

  /** ToString(format): "D" (default), "N", "B", "P", "X" (case-insensitive), lower-case hex. */
  toString(format?: string | null): string {
    let f = 'd';
    if (format !== undefined && format !== null && format !== '') {
      if (format.length !== 1) throw badFormat();
      f = format.toLowerCase();
    }
    const r = this._rest;
    const d = `${hex(this._a, 8)}-${hex(this._b, 4)}-${hex(this._c, 4)}-${hex(r[0], 2)}${hex(r[1], 2)}-${r.slice(2).map((x) => hex(x, 2)).join('')}`;
    switch (f) {
      case 'd':
        return d;
      case 'n':
        return d.replace(/-/g, '');
      case 'b':
        return '{' + d + '}';
      case 'p':
        return '(' + d + ')';
      case 'x':
        return `{0x${hex(this._a, 8)},0x${hex(this._b, 4)},0x${hex(this._c, 4)},{${r.map((x) => '0x' + hex(x, 2)).join(',')}}}`;
      default:
        throw badFormat();
    }
  }

  /** XmlConvert.ToString(Guid) = ToString() */
  toXmlString(): string {
    return this.toString();
  }
}

function badFormat(): Error {
  return new FormatException('Format string can be only "D", "d", "N", "n", "P", "p", "B", "b", "X" or "x".');
}

function tryParseGuid(input: string, r: Parsed): boolean {
  const s = trimWhiteSpace(input);
  if (s.length < 32) return false;
  switch (s[0]) {
    case '(':
      return tryParseExactP(s, r);
    case '{':
      return s[9] === '-' ? tryParseExactB(s, r) : tryParseExactX(s, r);
    default:
      return s[8] === '-' ? tryParseExactD(s, r) : tryParseExactN(s, r);
  }
}

function tryParseExactB(s: string, r: Parsed): boolean {
  if (s.length !== 38 || s[0] !== '{' || s[37] !== '}') return false;
  return tryParseExactD(s.slice(1, 37), r);
}

function tryParseExactP(s: string, r: Parsed): boolean {
  if (s.length !== 38 || s[0] !== '(' || s[37] !== ')') return false;
  return tryParseExactD(s.slice(1, 37), r);
}

/** Strict hex decode of the characters at the given positions (DecodeByte); null if invalid. */
function decodeHex(s: string, from: number, to: number): number | null {
  let v = 0;
  for (let i = from; i < to; i++) {
    const h = hexValue(s.charCodeAt(i));
    if (h < 0) return null;
    v = v * 16 + h;
  }
  return v;
}

function decodeRest(s: string, positions: number[], r: Parsed): boolean {
  for (let i = 0; i < 8; i++) {
    const v = decodeHex(s, positions[i], positions[i] + 2);
    if (v === null) return false;
    r.rest[i] = v;
  }
  return true;
}

function tryParseExactD(s: string, r: Parsed): boolean {
  if (s.length !== 36 || s[8] !== '-' || s[13] !== '-' || s[18] !== '-' || s[23] !== '-') return false;
  const a = decodeHex(s, 0, 8);
  const b = decodeHex(s, 9, 13);
  const c = decodeHex(s, 14, 18);
  if (a !== null && b !== null && c !== null && decodeRest(s, [19, 21, 24, 26, 28, 30, 32, 34], r)) {
    r.a = a;
    r.b = b;
    r.c = c;
    return true;
  }
  if (/[Xx+]/.test(s) && tryCompatParsing(s, r)) return true;
  return false;
}

/** The legacy "D" forms: components may start with "+" and/or "0x" within their fixed width. */
function tryCompatParsing(s: string, r: Parsed): boolean {
  const a = tryParseHex(s.slice(0, 8));
  const b = tryParseHex(s.slice(9, 13));
  if (a === null || b === null) return false;
  const c = tryParseHex(s.slice(14, 18));
  if (c === null) return false;
  const de = tryParseHex(s.slice(19, 23));
  if (de === null) return false;
  const fg = tryParseHex(s.slice(24, 28));
  if (fg === null) return false;
  // Number.TryParseBinaryIntegerHexNumberStyle(slice(28, 8), AllowHexSpecifier): hex digits only
  const hijk = decodeHex(s, 28, 36);
  if (hijk === null) return false;
  r.a = a.value >>> 0;
  r.b = b.value & 0xffff;
  r.c = c.value & 0xffff;
  const deV = de.value & 0xffff;
  const fgV = fg.value & 0xffff;
  r.rest = [deV >> 8, deV & 0xff, fgV >> 8, fgV & 0xff, (hijk >>> 24) & 0xff, (hijk >>> 16) & 0xff, (hijk >>> 8) & 0xff, hijk & 0xff];
  return true;
}

/** Guid.TryParseHex: optional "+", optional "0x", hex digits (value mod 2^32, overflow if > 8 digits). */
function tryParseHex(s: string): { value: number; overflow: boolean } | null {
  if (s.length > 0) {
    if (s[0] === '+') s = s.slice(1);
    if (s.length > 1 && s[0] === '0' && (s.charCodeAt(1) | 0x20) === 0x78) s = s.slice(2);
  }
  let i = 0;
  while (i < s.length && s[i] === '0') i++;
  let processed = 0;
  let tmp = 0;
  for (; i < s.length; i++) {
    const v = hexValue(s.charCodeAt(i));
    if (v < 0) return null;
    tmp = ((tmp * 16) % 4294967296) + v;
    processed++;
  }
  return { value: tmp >>> 0, overflow: processed > 8 };
}

function tryParseExactN(s: string, r: Parsed): boolean {
  if (s.length !== 32) return false;
  const a = decodeHex(s, 0, 8);
  const b = decodeHex(s, 8, 12);
  const c = decodeHex(s, 12, 16);
  if (a === null || b === null || c === null || !decodeRest(s, [16, 18, 20, 22, 24, 26, 28, 30], r)) return false;
  r.a = a;
  r.b = b;
  r.c = c;
  return true;
}

function isHexPrefix(s: string, i: number): boolean {
  return i + 1 < s.length && s[i] === '0' && (s.charCodeAt(i + 1) | 0x20) === 0x78;
}

function tryParseExactX(input: string, r: Parsed): boolean {
  let s = '';
  for (const ch of input) if (!isWhiteSpace(ch)) s += ch;
  if (s.length === 0 || s[0] !== '{') return false;
  if (!isHexPrefix(s, 1)) return false;
  let numStart = 3;
  let numLen = s.indexOf(',', numStart) - numStart;
  if (numLen <= 0) return false;
  const fail = (h: { overflow: boolean } | null): boolean => {
    if (h?.overflow) r.failure = 'overflow';
    return false;
  };
  const a = tryParseHex(s.slice(numStart, numStart + numLen));
  if (a === null || a.overflow) return fail(a);
  if (!isHexPrefix(s, numStart + numLen + 1)) return false;
  numStart = numStart + numLen + 3;
  numLen = s.indexOf(',', numStart) - numStart;
  if (numLen <= 0) return false;
  const b = tryParseHex(s.slice(numStart, numStart + numLen));
  if (b === null || b.overflow) return fail(b);
  if (!isHexPrefix(s, numStart + numLen + 1)) return false;
  numStart = numStart + numLen + 3;
  numLen = s.indexOf(',', numStart) - numStart;
  if (numLen <= 0) return false;
  const c = tryParseHex(s.slice(numStart, numStart + numLen));
  if (c === null || c.overflow) return fail(c);
  if (s.length <= numStart + numLen + 1 || s[numStart + numLen + 1] !== '{') return false;
  numLen++;
  const rest: number[] = [];
  for (let i = 0; i < 8; i++) {
    if (!isHexPrefix(s, numStart + numLen + 1)) return false;
    numStart = numStart + numLen + 3;
    const end = s.indexOf(i < 7 ? ',' : '}', numStart);
    numLen = end - numStart;
    if (numLen <= 0) return false;
    const v = tryParseHex(s.slice(numStart, numStart + numLen));
    if (v === null || v.overflow) return fail(v);
    if (v.value > 0xff) {
      r.failure = 'overflow';
      return false;
    }
    rest.push(v.value);
  }
  if (numStart + numLen + 1 >= s.length || s[numStart + numLen + 1] !== '}') return false;
  if (numStart + numLen + 1 !== s.length - 1) return false;
  r.a = a.value;
  r.b = b.value & 0xffff;
  r.c = c.value & 0xffff;
  r.rest = rest;
  return true;
}
