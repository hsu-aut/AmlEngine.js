// XSD validation parity: CAEXDocument.Validate (XmlSchemaManager.Validate) of Aml.Engine, recorded
// by oracle/ValidateOracle.cs, against validateXDocument. Documents: the unmodified corpus
// (test/corpus/*.aml) and the mutated documents of scripts/gen-invalid-caex.mjs (test/validation/cases).
// Files are validated in the order the oracle validated them, because the compiled schema set is
// shared state (the xml namespace schema is added on first use, as in .NET).
//
// Remaining deviations (none occurs with the committed generator seed 3682; seen with other seeds):
//  D1  XDocument.Save of a document whose declaration names a legacy encoding (us-ascii,
//      iso-8859-1) and whose comment contains a character that encoding cannot represent: .NET
//      throws EncoderFallbackException (comments cannot use character references), so Validate
//      throws. saveXDocument from src/xml writes the document instead, and validation proceeds.
//      The difference is in the XML writer (src/xml), not in the validator; such files are
//      skipped here (the oracle then has no "saved" hash).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseXDocument, saveXDocument } from '../../src/xml/index.js';
import { validateXDocument } from '../../src/engine/schema/validation/index.js';

const root = join(__dirname, '..');
const out = join(root, 'oracle-out', 'validate');
const dirs = [join(root, 'corpus'), join(root, 'validation', 'cases')];
const ordinal = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const files = dirs.flatMap((d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.aml')).sort(ordinal).map((f) => join(d, f)) : []));

/** File.ReadAllText(path, Encoding.UTF8). */
function readAllText(path: string): string {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3));
  return new TextDecoder().decode(bytes);
}

describe.skipIf(!existsSync(out))('CAEXDocument.Validate parity with Aml.Engine', () => {
  // One sequential test per file, in oracle order.
  for (const file of files) {
    const name = file.slice(file.lastIndexOf(file.includes('\\') ? '\\' : '/') + 1);
    it(name, () => {
      const expected = JSON.parse(readFileSync(join(out, name + '.json'), 'utf8'));
      let doc;
      try {
        doc = parseXDocument(readAllText(file), { preserveWhitespace: true });
      } catch {
        doc = null;
      }
      if (expected.load === null) {
        expect(doc).toBeNull();
        return;
      }
      expect(doc).not.toBeNull();
      const version = doc!.root?.attribute('SchemaVersion')?.value === '2.15' ? '2.15' : '3.0';
      expect(version === '2.15' ? 'CAEX2_15' : 'CAEX3_0').toBe(expected.schema);
      const saved = createHash('sha256').update(saveXDocument(doc!)).digest('hex');
      expect(saved).toBe(expected.saved);
      if (expected.exception) {
        let thrown: unknown = null;
        try {
          validateXDocument(doc!, version);
        } catch (e) {
          thrown = e;
        }
        expect((thrown as Error | null)?.name).toBe(expected.exception);
        expect((thrown as Error).message).toBe(expected.exceptionMessage);
        return;
      }
      const actual = validateXDocument(doc!, version);
      expect(actual.messages).toEqual(expected.messages);
      expect(actual.result).toBe(expected.result);
    });
  }
});
