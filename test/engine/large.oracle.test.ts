// Large documents (scripts/gen-large.mjs, plant-like CAEX 3.0 of 10 and 50 MB and a 10 MB one with
// 421 schema errors, in test/large): the same checks as for the corpus, at scale. For every
// document with oracle output (test/oracle-out/large, test/oracle-out/large-validate):
//   saved   LoadFromString + SaveToStream(true), byte for byte
//   dump    the read model walk of dump.ts (every object, path, reference, inherited member) and
//           SaveToStream(true) afterwards (the walk must not change the document); 10 MB only, as
//           in the original it grows with the square of the size (FindByID without ID table
//           searches the whole document; 12 minutes at 10 MB, hours at 50 MB)
//   validate  CAEXDocument.Validate result and messages
// The documents and outputs are not in the repository; scripts/oracle.sh creates them.
// Timings: docs/performance.md.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { parseXDocument, saveXDocument } from '../../src/xml/index.js';
import { validateXDocument } from '../../src/engine/schema/validation/index.js';
import { dumpDocument } from './dump.js';

const root = join(__dirname, '..');
const dir = join(root, 'large');
const out = join(root, 'oracle-out', 'large');
const outValidate = join(root, 'oracle-out', 'large-validate');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.aml')).sort() : [];
const TIMEOUT = 60 * 60 * 1000;

function readAllText(path: string): string {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3));
  return new TextDecoder().decode(bytes);
}

const sha = (data: Uint8Array | string): string => createHash('sha256').update(data).digest('hex');

/** The first path at which two JSON values differ, or null (without the huge diff of toEqual). */
function firstDifference(a: unknown, b: unknown): string | null {
  const stack: [unknown, unknown, string][] = [[a, b, '$']];
  while (stack.length > 0) {
    const [x, y, path] = stack.pop()!;
    if (x === y) continue;
    if (typeof x !== 'object' || typeof y !== 'object' || x === null || y === null || Array.isArray(x) !== Array.isArray(y)) {
      return `${path}: ${JSON.stringify(x)?.slice(0, 200)} vs ${JSON.stringify(y)?.slice(0, 200)}`;
    }
    if (Array.isArray(x)) {
      const ya = y as unknown[];
      if (x.length !== ya.length) return `${path}: length ${x.length} vs ${ya.length}`;
      for (let i = x.length - 1; i >= 0; i--) stack.push([x[i], ya[i], `${path}[${i}]`]);
    } else {
      const xo = x as Record<string, unknown>;
      const yo = y as Record<string, unknown>;
      const keys = new Set([...Object.keys(xo), ...Object.keys(yo)]);
      for (const k of keys) stack.push([xo[k], yo[k], `${path}.${k}`]);
    }
  }
  return null;
}

describe.skipIf(files.length === 0 || !existsSync(out))('large documents against Aml.Engine', () => {
  for (const f of files) {
    const name = f.replace(/\.aml$/, '');
    const text = (): string => readAllText(join(dir, f));

    it.skipIf(!existsSync(join(out, name + '.saved.aml')))(`${f}: load and save`, () => {
      const doc = CAEXDocument.loadFromString(text())!;
      expect(sha(doc.saveToStream(true))).toBe(sha(readFileSync(join(out, name + '.saved.aml'))));
    }, TIMEOUT);

    it.skipIf(!existsSync(join(out, name + '.json')))(`${f}: read model walk and save afterwards`, () => {
      const doc = CAEXDocument.loadFromString(text())!;
      const actual = JSON.parse(JSON.stringify(dumpDocument(doc)));
      const expected = JSON.parse(readFileSync(join(out, name + '.json'), 'utf8'));
      expect(firstDifference(actual, expected)).toBeNull();
      expect(sha(doc.saveToStream(true))).toBe(sha(readFileSync(join(out, name + '.dumped.aml'))));
    }, TIMEOUT);

    it.skipIf(!existsSync(join(outValidate, f + '.json')))(`${f}: validate`, () => {
      const expected = JSON.parse(readFileSync(join(outValidate, f + '.json'), 'utf8'));
      const doc = parseXDocument(text(), { preserveWhitespace: true });
      expect(sha(saveXDocument(doc))).toBe(expected.saved);
      const actual = validateXDocument(doc, '3.0');
      expect(actual.result).toBe(expected.result);
      expect(actual.messages).toEqual(expected.messages);
    }, TIMEOUT);
  }
});
