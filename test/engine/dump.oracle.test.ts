// Read model parity: every corpus document is walked by the JS engine exactly as oracle/Dump.cs
// walks it with Aml.Engine, and the results must be identical.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { oracleOut } from '../setup/oracle-out.js';
import { dumpDocument } from './dump.js';

const root = join(__dirname, '..');
const out = join(oracleOut, 'dump');
const files = readdirSync(join(root, 'corpus')).filter((f) => f.endsWith('.aml'));
const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** File.ReadAllText(path, Encoding.UTF8). */
function readAllText(path: string): string {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3));
  return new TextDecoder().decode(bytes);
}

/** An empty OriginID is filled with a random GUID by the engine on enumeration: mask it on both sides. */
function maskRandomOriginIds(dump: any, source: string): any {
  if (!source.includes('OriginID=""')) return dump;
  for (const s of dump.sourceDocumentInformation ?? []) if (typeof s.originID === 'string' && GUID.test(s.originID)) s.originID = '<random>';
  return dump;
}

describe.skipIf(!existsSync(out))('read model parity with Aml.Engine', () => {
  for (const f of files) {
    it(basename(f), () => {
      const text = readAllText(join(root, 'corpus', f));
      const expected = JSON.parse(readFileSync(join(out, f.replace(/\.aml$/, '.json')), 'utf8'));
      const doc = CAEXDocument.loadFromString(text);
      const actual = dumpDocument(doc);
      expect(maskRandomOriginIds(actual, text)).toEqual(maskRandomOriginIds(expected, text));
    });
  }
});
