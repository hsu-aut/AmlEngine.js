// System.Convert (Base64) and System.Text.Encoding.UTF8.
// FromBase64String is a literal port of .NET 8 (Convert.FromBase64CharPtr, TryFromBase64Chars,
// Convert.Base64.TryDecodeFromUtf16): white space is ' ', '\t', '\r', '\n' anywhere; the result
// length is computed beforehand (characters <= ' ' and '=' do not count), so some odd inputs
// yield trailing zero bytes exactly like .NET.

import { ArgumentNullException, FormatException } from './exceptions.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DECODING_MAP = new Int8Array(256).fill(-1);
for (let i = 0; i < ALPHABET.length; i++) DECODING_MAP[ALPHABET.charCodeAt(i)] = i;
const PAD = 61; // '='

function badBase64(): Error {
  return new FormatException(
    'The input is not a valid Base-64 string as it contains a non-base 64 character, more than two padding characters, or an illegal character among the padding characters.',
  );
}

const isSpace = (c: string) => c === ' ' || c === '\t' || c === '\r' || c === '\n';

/** Convert.ToBase64String(byte[]) (no line breaks). */
export function toBase64String(bytes: Uint8Array | readonly number[] | null): string {
  if (bytes === null) throw new ArgumentNullException('inArray');
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const v = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += ALPHABET[v >> 18] + ALPHABET[(v >> 12) & 63] + ALPHABET[(v >> 6) & 63] + ALPHABET[v & 63];
  }
  if (i < bytes.length) {
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const v = (bytes[i] << 16) | (b1 << 8);
    out += ALPHABET[v >> 18] + ALPHABET[(v >> 12) & 63] + (i + 1 < bytes.length ? ALPHABET[(v >> 6) & 63] : '=') + '=';
  }
  return out;
}

/** Convert.FromBase64String: FormatException for invalid input. */
export function fromBase64String(s: string | null): Uint8Array {
  if (s === null) throw new ArgumentNullException('s');
  let inputLength = s.length;
  while (inputLength > 0) {
    const last = s[inputLength - 1];
    if (last !== ' ' && last !== '\n' && last !== '\r' && last !== '\t') break;
    inputLength--;
  }
  const input = s.slice(0, inputLength);
  const decoded = new Uint8Array(computeResultLength(input));
  if (!tryFromBase64Chars(input, decoded)) throw badBase64();
  return decoded;
}

function computeResultLength(input: string): number {
  let useful = input.length;
  let padding = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c <= 32) useful--;
    else if (c === PAD) {
      useful--;
      padding++;
    }
  }
  if (padding !== 0) {
    if (padding === 1) padding = 2;
    else if (padding === 2) padding = 1;
    else throw badBase64();
  }
  return Math.trunc(useful / 4) * 3 + padding;
}

function tryFromBase64Chars(chars: string, bytes: Uint8Array): boolean {
  let bOff = 0;
  while (chars.length !== 0) {
    const r = tryDecodeFromUtf16(chars, bytes, bOff);
    if (r.complete) return true;
    chars = chars.slice(r.consumed);
    bOff += r.written;
    if (isSpace(chars[0])) {
      let i = 1;
      while (i < chars.length && isSpace(chars[i])) i++;
      chars = chars.slice(i);
      if (r.written % 3 !== 0 && chars.length !== 0) return false;
    } else {
      let temp = '';
      let consumed = chars.length;
      for (let i = 0; i < chars.length; i++) {
        if (!isSpace(chars[i])) {
          temp += chars[i];
          if (temp.length === 4) {
            consumed = i + 1;
            break;
          }
        }
      }
      if ((temp.length & 3) !== 0) return false;
      const r2 = tryDecodeFromUtf16(temp, bytes, bOff);
      if (!r2.complete) return false;
      bOff += r2.written;
      chars = chars.slice(consumed);
      if (r2.written % 3 !== 0) {
        for (let i = 0; i < chars.length; i++) if (!isSpace(chars[i])) return false;
        return true;
      }
    }
  }
  return true;
}

function tryDecodeFromUtf16(utf16: string, bytes: Uint8Array, bOff: number): { complete: boolean; consumed: number; written: number } {
  const srcLength = utf16.length & ~3;
  const destLength = bytes.length - bOff;
  let sourceIndex = 0;
  let destIndex = 0;
  const done = (complete: boolean) => ({ complete, consumed: sourceIndex, written: destIndex });
  if (utf16.length === 0) return done(true);
  const maxSrcLength = destLength >= (srcLength >> 2) * 3 ? srcLength - 4 : Math.trunc(destLength / 3) * 4;
  while (sourceIndex < maxSrcLength) {
    const result = decode(utf16, sourceIndex);
    if (result < 0) return done(false);
    bytes[bOff + destIndex] = result >> 16;
    bytes[bOff + destIndex + 1] = result >> 8;
    bytes[bOff + destIndex + 2] = result;
    destIndex += 3;
    sourceIndex += 4;
  }
  if (maxSrcLength !== srcLength - 4) return done(false);
  if (sourceIndex === srcLength) return done(false);
  let i0 = utf16.charCodeAt(srcLength - 4);
  let i1 = utf16.charCodeAt(srcLength - 3);
  let i2 = utf16.charCodeAt(srcLength - 2);
  let i3 = utf16.charCodeAt(srcLength - 1);
  if (((i0 | i1 | i2 | i3) & 0xffffff00) !== 0) return done(false);
  i0 = DECODING_MAP[i0];
  i1 = DECODING_MAP[i1];
  i0 <<= 18;
  i1 <<= 12;
  i0 |= i1;
  if (i3 !== PAD) {
    i2 = DECODING_MAP[i2];
    i3 = DECODING_MAP[i3];
    i2 <<= 6;
    i0 |= i3;
    i0 |= i2;
    if (i0 < 0) return done(false);
    if (destIndex > destLength - 3) return done(false);
    bytes[bOff + destIndex] = i0 >> 16;
    bytes[bOff + destIndex + 1] = i0 >> 8;
    bytes[bOff + destIndex + 2] = i0;
    destIndex += 3;
  } else if (i2 !== PAD) {
    i2 = DECODING_MAP[i2];
    i2 <<= 6;
    i0 |= i2;
    if (i0 < 0) return done(false);
    if (destIndex > destLength - 2) return done(false);
    bytes[bOff + destIndex] = i0 >> 16;
    bytes[bOff + destIndex + 1] = i0 >> 8;
    destIndex += 2;
  } else {
    if (i0 < 0) return done(false);
    if (destIndex > destLength - 1) return done(false);
    bytes[bOff + destIndex] = i0 >> 16;
    destIndex++;
  }
  sourceIndex += 4;
  if (srcLength !== utf16.length) return done(false);
  return done(true);
}

function decode(s: string, at: number): number {
  let i0 = s.charCodeAt(at);
  let i1 = s.charCodeAt(at + 1);
  let i2 = s.charCodeAt(at + 2);
  const i3 = s.charCodeAt(at + 3);
  if (((i0 | i1 | i2 | i3) & 0xffffff00) !== 0) return -1;
  i0 = DECODING_MAP[i0] << 18;
  i1 = DECODING_MAP[i1] << 12;
  i2 = DECODING_MAP[i2] << 6;
  return i0 | DECODING_MAP[i3] | i1 | i2;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { ignoreBOM: true });

/** System.Text.Encoding.UTF8 (lone surrogates encode as U+FFFD; invalid bytes decode to U+FFFD). */
export const Encoding = {
  UTF8: {
    getBytes(s: string | null): Uint8Array {
      if (s === null) throw new ArgumentNullException('s');
      return encoder.encode(s);
    },
    getString(bytes: Uint8Array | null): string {
      if (bytes === null) throw new ArgumentNullException('bytes');
      return decoder.decode(bytes);
    },
  },
};

/** The Convert static class, for literal ports (Convert.toBase64String(...)). */
export const Convert = { toBase64String, fromBase64String };
