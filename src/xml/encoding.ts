import { XmlException } from './XmlChars.js';
import { NotSupportedException } from '../system/exceptions.js';
import { XmlCharType } from '../system/XmlCharType.js';

// Encodings the way .NET (Core, without the code pages provider) resolves them for XML I/O.

export interface XmlEncoding {
  /** Encoding.WebName, written into the XML declaration. */
  webName: string;
  preamble: Uint8Array;
  encode(text: string): Uint8Array;
  canEncode(cp: number): boolean;
}

const utf8: XmlEncoding = {
  webName: 'utf-8',
  preamble: new Uint8Array([0xef, 0xbb, 0xbf]),
  encode: (t) => new TextEncoder().encode(t),
  canEncode: () => true,
};

function utf16(bigEndian: boolean): XmlEncoding {
  return {
    webName: bigEndian ? 'utf-16BE' : 'utf-16',
    preamble: new Uint8Array(bigEndian ? [0xfe, 0xff] : [0xff, 0xfe]),
    encode(t) {
      const out = new Uint8Array(t.length * 2);
      for (let i = 0; i < t.length; i++) {
        const c = t.charCodeAt(i);
        out[2 * i + (bigEndian ? 1 : 0)] = c & 0xff;
        out[2 * i + (bigEndian ? 0 : 1)] = c >> 8;
      }
      return out;
    },
    canEncode: () => true,
  };
}

function utf32(bigEndian: boolean): XmlEncoding {
  return {
    webName: bigEndian ? 'utf-32BE' : 'utf-32',
    preamble: new Uint8Array(bigEndian ? [0, 0, 0xfe, 0xff] : [0xff, 0xfe, 0, 0]),
    encode(t) {
      const cps = Array.from(t, (ch) => ch.codePointAt(0)!);
      const out = new Uint8Array(cps.length * 4);
      const view = new DataView(out.buffer);
      cps.forEach((cp, i) => view.setUint32(i * 4, cp, !bigEndian));
      return out;
    },
    canEncode: () => true,
  };
}

function singleByte(webName: string, max: number): XmlEncoding {
  return {
    webName,
    preamble: new Uint8Array(0),
    encode(t) {
      const out = new Uint8Array(t.length);
      for (let i = 0; i < t.length; i++) {
        const c = t.charCodeAt(i);
        out[i] = c <= max ? c : 0x3f;
      }
      return out;
    },
    canEncode: (cp) => cp <= max,
  };
}

const ascii = (): XmlEncoding => singleByte('us-ascii', 0x7f);
const latin1 = (): XmlEncoding => singleByte('iso-8859-1', 0xff);

/** The encoding names of .NET 8 without a code pages provider (EncodingTable), lower case. */
const BY_NAME: Record<string, () => XmlEncoding> = {
  'utf-8': () => utf8,
  'unicode-1-1-utf-8': () => utf8,
  'unicode-2-0-utf-8': () => utf8,
  'x-unicode-1-1-utf-8': () => utf8,
  'x-unicode-2-0-utf-8': () => utf8,
  'utf-16': () => utf16(false),
  'utf-16le': () => utf16(false),
  unicode: () => utf16(false),
  'ucs-2': () => utf16(false),
  'iso-10646-ucs-2': () => utf16(false),
  unicodefffe: () => utf16(true),
  'utf-16be': () => utf16(true),
  'utf-32': () => utf32(false),
  'utf-32le': () => utf32(false),
  'utf-32be': () => utf32(true),
  'us-ascii': ascii,
  ascii,
  us: ascii,
  'ansi_x3.4-1968': ascii,
  'ansi_x3.4-1986': ascii,
  cp367: ascii,
  csascii: ascii,
  ibm367: ascii,
  'iso-ir-6': ascii,
  'iso646-us': ascii,
  'iso_646.irv:1991': ascii,
  'iso-8859-1': latin1,
  latin1,
  l1: latin1,
  'iso_8859-1': latin1,
  'iso_8859-1:1987': latin1,
  'iso8859-1': latin1,
  'iso-ir-100': latin1,
  cp819: latin1,
  ibm819: latin1,
  csisolatin1: latin1,
};

/** UTF-7 is known to .NET 8 but disabled: Encoding.GetEncoding throws NotSupportedException. */
const UTF7_NAMES = new Set(['utf-7', 'unicode-1-1-utf-7', 'unicode-2-0-utf-7', 'x-unicode-1-1-utf-7', 'x-unicode-2-0-utf-7', 'csunicode11utf7']);

/**
 * Encoding.GetEncoding(name): the name is matched case-insensitively and not trimmed. Returns null
 * where .NET throws ArgumentException; throws NotSupportedException for UTF-7.
 */
export function getEncoding(name: string): XmlEncoding | null {
  const key = name.toLowerCase();
  if (UTF7_NAMES.has(key)) throw new NotSupportedException('Support for UTF-7 is disabled.');
  return Object.prototype.hasOwnProperty.call(BY_NAME, key) ? BY_NAME[key]() : null;
}

export const UTF8 = utf8;

export function encodeWithPreamble(text: string, enc: XmlEncoding, withPreamble: boolean): Uint8Array {
  const body = enc.encode(text);
  if (!withPreamble || enc.preamble.length === 0) return body;
  const out = new Uint8Array(enc.preamble.length + body.length);
  out.set(enc.preamble, 0);
  out.set(body, enc.preamble.length);
  return out;
}

// ---- decoding: XmlTextReaderImpl (DetectEncoding, EatPreamble, CheckEncoding, SwitchEncoding) --

interface Decoding {
  /** Encoding.WebName (SwitchEncoding compares it). */
  webName: string;
  preamble: number[];
  decode(bytes: Uint8Array): string;
  /** Bytes the given decoded text took (UnDecodeChars). */
  byteCount(text: string): number;
}

const invalidInEncoding = (): XmlException => new XmlException('Invalid character in the given encoding.');

/** new UTF8Encoding(true, true): invalid bytes throw. */
const UTF8_THROWING: Decoding = {
  webName: 'utf-8',
  preamble: [0xef, 0xbb, 0xbf],
  decode(bytes) {
    try {
      return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    } catch {
      throw invalidInEncoding();
    }
  },
  byteCount: (t) => new TextEncoder().encode(t).length,
};

/** Encoding.UTF8 (GetEncoding of a UTF-8 alias, the default before the declaration): invalid bytes become U+FFFD. */
const UTF8_REPLACING: Decoding = {
  ...UTF8_THROWING,
  decode: (bytes) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes),
};

/**
 * Encoding.Unicode / BigEndianUnicode as the reader uses them: code units pass unchanged (lone
 * surrogates too, the parser rejects them), a trailing odd byte is left over.
 */
function utf16Decoding(bigEndian: boolean): Decoding {
  return {
    webName: bigEndian ? 'utf-16BE' : 'utf-16',
    preamble: bigEndian ? [0xfe, 0xff] : [0xff, 0xfe],
    decode(bytes) {
      let s = '';
      for (let i = 0; i + 1 < bytes.length; i += 2) s += String.fromCharCode(bigEndian ? (bytes[i] << 8) | bytes[i + 1] : bytes[i] | (bytes[i + 1] << 8));
      return s;
    },
    byteCount: (t) => t.length * 2,
  };
}

/**
 * Four byte encodings. `order[j]` is the significance of byte j of a unit (3: most significant):
 * the reader's Ucs4Encoding in the orders 1234 (little endian), 4321 (big endian), 2143 and 3412,
 * or, with `utf32Name`, the UTF32Encoding that GetEncoding("utf-32...") returns.
 */
function ucs4Decoding(order: number[], utf32Name: string | null): Decoding {
  const preamble = order.map((sig) => (0xfeff >>> (8 * sig)) & 0xff);
  return {
    webName: utf32Name ?? 'ucs-4',
    preamble,
    decode(bytes) {
      let s = '';
      for (let i = 0; i + 3 < bytes.length; i += 4) {
        let cp = 0;
        for (let j = 0; j < 4; j++) cp += bytes[i + j] * 2 ** (8 * order[j]);
        if (utf32Name !== null) {
          // UTF32Encoding with the replacement fallback.
          s += cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff) ? '�' : String.fromCodePoint(cp);
        } else {
          // Ucs4Decoder: code points above U+10FFFF are an error, surrogates pass unchanged.
          if (cp > 0x10ffff) throw invalidInEncoding();
          s += cp <= 0xffff ? String.fromCharCode(cp) : String.fromCodePoint(cp);
        }
      }
      return s;
    },
    byteCount: (t) => [...t].length * 4,
  };
}

const LE = [0, 1, 2, 3];
const BE = [3, 2, 1, 0];

/** ASCII and Latin-1: bytes above the range become '?' (replacement fallback). */
function singleByteDecoding(webName: string, max: number): Decoding {
  return {
    webName,
    preamble: [],
    decode(bytes) {
      let s = '';
      for (let i = 0; i < bytes.length; i++) s += bytes[i] <= max ? String.fromCharCode(bytes[i]) : '?';
      return s;
    },
    byteCount: (t) => t.length,
  };
}

/** The decoding of an encoding returned by getEncoding. */
function decodingOf(enc: XmlEncoding): Decoding {
  switch (enc.webName) {
    case 'utf-8':
      return UTF8_REPLACING;
    case 'utf-16':
      return utf16Decoding(false);
    case 'utf-16BE':
      return utf16Decoding(true);
    case 'utf-32':
      return ucs4Decoding(LE, 'utf-32');
    case 'utf-32BE':
      return ucs4Decoding(BE, 'utf-32BE');
    case 'us-ascii':
      return singleByteDecoding(enc.webName, 0x7f);
    default:
      return singleByteDecoding(enc.webName, 0xff);
  }
}

/** XmlTextReaderImpl.DetectEncoding; null: ASCII until the XML declaration (SafeAsciiDecoder). */
function detectEncoding(b: Uint8Array): Decoding | null {
  if (b.length < 2) return null;
  const first2 = (b[0] << 8) | b[1];
  const next2 = b.length >= 4 ? (b[2] << 8) | b[3] : 0;
  switch (first2) {
    case 0x0000:
      if (next2 === 0xfeff || next2 === 0x003c) return ucs4Decoding(BE, null);
      if (next2 === 0xfffe || next2 === 0x3c00) return ucs4Decoding([2, 3, 0, 1], null);
      break;
    case 0xfeff:
      return next2 === 0 ? ucs4Decoding([1, 0, 3, 2], null) : utf16Decoding(true);
    case 0xfffe:
      return next2 === 0 ? ucs4Decoding(LE, null) : utf16Decoding(false);
    case 0x3c00:
      return next2 === 0 ? ucs4Decoding(LE, null) : utf16Decoding(false);
    case 0x003c:
      return next2 === 0 ? ucs4Decoding([1, 0, 3, 2], null) : utf16Decoding(true);
    case 0x4c6f:
      if (next2 === 0xa794) throw new XmlException("System does not support 'ebcdic' encoding.", 1, 1);
      break;
    case 0xefbb:
      if ((next2 & 0xff00) === 0xbf00) return UTF8_THROWING;
      break;
  }
  return null;
}

/** SafeAsciiDecoder: one character per byte (the WebName is the one of the UTF-8 default). */
const SAFE_ASCII: Decoding = {
  webName: 'utf-8',
  preamble: [],
  decode(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return s;
  },
  byteCount: (t) => t.length,
};

/** XmlTextReaderImpl.CheckEncoding: the encoding named in the XML declaration of a stream. */
function checkEncoding(name: string, current: Decoding): Decoding {
  const n = name.toLowerCase();
  if (n === 'ucs-2' || n === 'utf-16' || n === 'iso-10646-ucs-2' || n === 'ucs-4') {
    if (current.webName !== 'utf-16BE' && current.webName !== 'utf-16' && n !== 'ucs-4') {
      throw new XmlException('There is no Unicode byte order mark. Cannot switch to Unicode.');
    }
    // Before the declaration _ps.encoding is Encoding.UTF8 (read through the SafeAsciiDecoder).
    return current === SAFE_ASCII ? UTF8_REPLACING : current;
  }
  if (n === 'utf-8') return UTF8_THROWING;
  let enc: XmlEncoding | null;
  try {
    enc = getEncoding(name);
  } catch {
    enc = null;
  }
  if (enc === null) throw new XmlException(`System does not support '${name}' encoding.`);
  return decodingOf(enc);
}

/**
 * Decodes an XML byte stream as XmlReader does: the byte order mark or the byte pattern of the
 * first characters select the encoding (ASCII compatible input is read as ASCII until the XML
 * declaration and as UTF-8 without one), then the encoding named in the XML declaration takes
 * over after the declaration (SwitchEncoding), even when it contradicts the byte order mark.
 */
export function decodeXml(bytes: Uint8Array): string {
  const detected = detectEncoding(bytes);
  const current = detected ?? SAFE_ASCII;
  let start = 0;
  const pre = current.preamble;
  if (pre.length > 0 && bytes.length >= pre.length && pre.every((x, i) => bytes[i] === x)) start = pre.length;
  // The reader decodes as it goes: bytes after the declaration are only decoded with the encoding
  // the declaration selects, so the declaration is located in a lenient decoding first.
  const text = current === UTF8_THROWING ? UTF8_REPLACING.decode(bytes.subarray(start)) : current.decode(bytes.subarray(start));
  const strict = (): string => (current === UTF8_THROWING ? current.decode(bytes.subarray(start)) : text);
  const switchAt = (declEnd: number, next: Decoding): string =>
    text.substring(0, declEnd) + next.decode(bytes.subarray(start + current.byteCount(text.substring(0, declEnd))));
  // ParseXmlDeclaration: "<?xml" followed by a character that cannot continue a name.
  if (text.length >= 6 && text.startsWith('<?xml') && !XmlCharType.isNameSingleChar(text.charCodeAt(5))) {
    const end = text.indexOf('?>');
    if (end < 0) return strict();
    const m = /\sencoding\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(text.substring(0, end));
    if (m === null) return detected === null ? switchAt(end + 2, UTF8_THROWING) : strict();
    const next = checkEncoding(m[1] ?? m[2], current);
    if (next.webName !== current.webName || detected === null) return switchAt(end + 2, next);
    return strict();
  }
  return detected === null ? UTF8_THROWING.decode(bytes) : strict();
}
