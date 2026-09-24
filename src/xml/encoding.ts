import { XmlException } from './XmlChars.js';

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

const BY_NAME: Record<string, () => XmlEncoding> = {
  'utf-8': () => utf8,
  utf8: () => utf8,
  'unicode-1-1-utf-8': () => utf8,
  'unicode-2-0-utf-8': () => utf8,
  'x-unicode20utf8': () => utf8,
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
  'us-ascii': () => singleByte('us-ascii', 0x7f),
  ascii: () => singleByte('us-ascii', 0x7f),
  'ansi_x3.4-1968': () => singleByte('us-ascii', 0x7f),
  'iso-8859-1': () => singleByte('iso-8859-1', 0xff),
  latin1: () => singleByte('iso-8859-1', 0xff),
  'iso_8859-1': () => singleByte('iso-8859-1', 0xff),
  l1: () => singleByte('iso-8859-1', 0xff),
};

/** Encoding.GetEncoding(name), or null where .NET throws ArgumentException. */
export function getEncoding(name: string): XmlEncoding | null {
  const f = BY_NAME[name.trim().toLowerCase()];
  return f ? f() : null;
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

/**
 * Decodes an XML byte stream as XmlReader does: byte order mark, then the byte pattern of "<?xml",
 * then the encoding named in the XML declaration.
 */
export function decodeXml(bytes: Uint8Array): string {
  const b = bytes;
  if (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 0xfe && b[3] === 0xff) return decodeUtf32(b.subarray(4), true);
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xfe && b[2] === 0 && b[3] === 0) return decodeUtf32(b.subarray(4), false);
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return decodeStrict('utf-8', b.subarray(3));
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return decodeStrict('utf-16be', b.subarray(2));
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return decodeStrict('utf-16le', b.subarray(2));
  if (b.length >= 4 && b[0] === 0 && b[1] === 0x3c && b[2] === 0 && b[3] === 0x3f) return decodeStrict('utf-16be', b);
  if (b.length >= 4 && b[0] === 0x3c && b[1] === 0 && b[2] === 0x3f && b[3] === 0) return decodeStrict('utf-16le', b);
  // ASCII compatible: honour the declared encoding.
  const head = String.fromCharCode(...b.subarray(0, Math.min(b.length, 200)));
  const m = /^<\?xml[^>]*?encoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(head);
  const declared = m ? m[1].toLowerCase() : 'utf-8';
  if (/^(utf-16|utf-32|unicode|ucs-2)/.test(declared)) throw new XmlException('There is no Unicode byte order mark. Cannot switch to Unicode.');
  if (declared === 'iso-8859-1' || declared === 'latin1' || declared === 'us-ascii' || declared === 'ascii') {
    let s = '';
    for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }
  return decodeStrict('utf-8', b);
}

function decodeStrict(label: string, bytes: Uint8Array): string {
  return new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(bytes);
}

function decodeUtf32(bytes: Uint8Array, bigEndian: boolean): string {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let s = '';
  for (let i = 0; i + 3 < bytes.length; i += 4) s += String.fromCodePoint(view.getUint32(i, !bigEndian));
  return s;
}
