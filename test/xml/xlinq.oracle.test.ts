// Byte-exact comparison of the XLinq port with System.Xml.Linq (outputs from `npm run oracle`).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XDocument, XElement, loadXDocument, nodeToString, parseXDocument, saveXDocument } from '../../src/xml/index.js';

const root = join(__dirname, '..');
const out = join(root, 'oracle-out', 'xml');
const files = [
  ...readdirSync(join(root, 'xml-corpus')).map((f) => join(root, 'xml-corpus', f)),
  ...readdirSync(join(root, 'xml-fuzz')).map((f) => join(root, 'xml-fuzz', f)),
  ...readdirSync(join(root, 'corpus')).filter((f) => f.endsWith('.aml')).map((f) => join(root, 'corpus', f)),
];

/** File.ReadAllText(path, Encoding.UTF8): BOM detection, otherwise lenient UTF-8. */
function readAllText(bytes: Uint8Array): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  return new TextDecoder('utf-8').decode(bytes);
}

const enc = new TextEncoder();

function variants(bytes: Uint8Array): Record<string, () => Uint8Array> {
  const text = () => readAllText(bytes);
  return {
    p: () => saveXDocument(parseXDocument(text(), { preserveWhitespace: true }), { omitDuplicateNamespaces: true }),
    pd: () => saveXDocument(parseXDocument(text(), { preserveWhitespace: true }), { disableFormatting: true, omitDuplicateNamespaces: true }),
    pn: () => saveXDocument(parseXDocument(text(), { preserveWhitespace: true })),
    r: () => saveXDocument(loadXDocument(bytes), { omitDuplicateNamespaces: true }),
    s: () => {
      const doc: XDocument = parseXDocument(text(), { preserveWhitespace: true });
      let e: XElement = doc.root!;
      let s = e.toString();
      for (;;) {
        const first = e.elements().next();
        if (first.done) break;
        e = first.value;
      }
      s += '\n----\n' + e.toString();
      s += '\n----\n' + (e.parent ? nodeToString(e.parent, true) : '');
      return enc.encode(s);
    },
  };
}

describe.skipIf(!existsSync(out))('System.Xml.Linq parity', () => {
  for (const file of files) {
    const name = basename(file);
    describe(name, () => {
      const bytes = new Uint8Array(readFileSync(file));
      for (const [variant, run] of Object.entries(variants(bytes))) {
        it(variant, () => {
          const expected = new Uint8Array(readFileSync(join(out, `${name}.${variant}`)));
          const expectedText = new TextDecoder().decode(expected);
          if (expectedText.startsWith('!ERROR')) {
            expect(run).toThrow();
            return;
          }
          let actual: Uint8Array;
          try {
            actual = run();
          } catch (e) {
            throw new Error(`JS threw, .NET did not: ${(e as Error).message}`);
          }
          if (!Buffer.from(actual).equals(Buffer.from(expected))) {
            expect(new TextDecoder().decode(actual)).toBe(expectedText);
            expect(Array.from(actual)).toEqual(Array.from(expected));
          }
        });
      }
    });
  }
});
