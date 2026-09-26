// The corrections of Aml.Engine data errors (src/engine/fixes.ts, docs/fixes.md) against the
// original: scripts/gen-fixes.mjs writes documents and a container with the corrections switched on
// (test/fixes), oracle/FixesOracle.cs reads them with Aml.Engine 4.5.2 (test/oracle-out/fixes.json),
// and this test checks that the original sees exactly what the files are meant to contain
// (test/fixes/expected.json). For streaming, where the correction is on the reading side, the
// original's result on the same document with whitespace between the elements is the reference.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Fixes } from '../../src/index.js';
import { DocumentStreaming } from '../../src/engine/streaming/DocumentStreaming.js';

const repo = join(__dirname, '..', '..');
const dir = join(repo, 'test', 'fixes');
const oracleFile = join(repo, 'test', 'oracle-out', 'fixes.json');
const read = (f: string) => JSON.parse(readFileSync(f, 'utf8'));

afterEach(() => {
  Fixes.default = 'none';
});

describe.skipIf(!existsSync(oracleFile))('corrected output read by Aml.Engine (oracle fixes)', () => {
  const expected = existsSync(oracleFile) ? read(join(dir, 'expected.json')) : {};
  const original = existsSync(oracleFile) ? read(oracleFile) : {};

  it('base64Binary and booleanFromNumber: the original reads the intended values', () => {
    expect(original.values).toEqual(expected.values);
  });

  it('referenceSetter: the original finds the intended base classes', () => {
    expect(original.references).toEqual(expected.references);
  });

  it('automationMLVersionSetter: the original reads the new version', () => {
    expect(original.automationMLVersion).toBe(expected.automationMLVersion);
  });

  it('internalLinkPartnerId: the original resolves both partners of the link', () => {
    expect(original.internalLink).toEqual(expected.internalLink);
  });

  it('conversionAutomationMLVersion: the converted document has only the CAEX 3.0 version information', () => {
    expect(original.conversion).toEqual({ ...expected.conversion, automationMLVersion: '2.1' });
  });

  it('streamingAdjacentElements: the port finds in the document without whitespace what the original finds with it', () => {
    const plain = new Uint8Array(readFileSync(join(dir, 'streaming-plain.aml')));
    const names = () => [...DocumentStreaming.streamElementWithName(plain, 'InternalElement', null)].map((w: any) => w.name);
    expect(original.streaming.pretty).toEqual(expected.streaming);
    // without the correction the port skips the same elements as the original
    expect(names()).toEqual(original.streaming.plain);
    expect(original.streaming.plain).not.toEqual(expected.streaming);
    Fixes.default = ['streamingAdjacentElements'];
    expect(names()).toEqual(original.streaming.pretty);
  });

  it('relinkPartRelationships: the original reads the moved relationships', () => {
    expect(original.relink).toEqual(expected.relink);
  });
});
