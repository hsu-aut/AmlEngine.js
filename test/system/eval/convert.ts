// Evaluators for the "convert" cases (scripts/sys-cases/convert.mjs); see test/system/sys.oracle.test.ts.
import { Encoding, fromBase64String, toBase64String } from '../../../src/system/Convert.js';
import type { Args } from '../repr.js';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (s: string) => Uint8Array.from(s.match(/../g) ?? [], (x) => parseInt(x, 16));

export const evaluators: Record<string, (args: Args) => string> = {
  'b64.enc': (a) => toBase64String(Encoding.UTF8.getBytes(a[0] as string)),
  'b64.encHex': (a) => toBase64String(unhex(a[0] as string)),
  'b64.dec': (a) => {
    const bytes = fromBase64String(a[0] as string);
    return hex(bytes) + '|' + Encoding.UTF8.getString(bytes);
  },
  'utf8.enc': (a) => hex(Encoding.UTF8.getBytes(a[0] as string)),
  'utf8.encU16': (a) => hex(Encoding.UTF8.getBytes(String.fromCharCode(...((a[0] as string).match(/..../g) ?? []).map((x) => parseInt(x, 16))))),
  'utf8.dec': (a) => Encoding.UTF8.getString(unhex(a[0] as string)),
};

export const deviations: Record<string, string> = {};
