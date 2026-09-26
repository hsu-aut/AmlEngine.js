// Calls of Aml.Engine that may not return, outside the read API (docs/deviations.md, "Calls that
// do not return"): the CAEX path splitter on paths longer than 65535 characters, the partial
// node path with a root that is not an ancestor and CopyAttributesFrom with the target as source.
// Cases: test/noreturn/cases.json, expected results from oracle/NoReturnOracle.cs
// (test/oracle-out/noreturn.json). Where the original does not return ("!hang"), the port must
// throw an ArgumentException saying so; every other case must give the same result or exception.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { CAEXPathBuilder } from '../../src/engine/caex/extensions/CAEXPathBuilder.js';
import { CAEXDocument, CAEXDocument_CAEXSchema } from '../../src/engine/caex/CAEXDocument.js';
import { XmlCAEXAttributes } from '../../src/engine/xmlext/XmlCAEXAttributes.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { ObjectWithAttributes } from '../../src/engine/caex/extensions/ObjectWithAttributes.js';
import { ArgumentException, dotNetExceptionName } from '../../src/system/exceptions.js';
import { parseXDocument, type XElement } from '../../src/xml/index.js';

const repo = join(__dirname, '..', '..');
const casesFile = join(repo, 'test', 'noreturn', 'cases.json');
const expectedFile = join(repo, 'test', 'oracle-out', 'noreturn.json');

type Case =
  | { fn: 'split'; parts: [string, number][]; schema: '3.0' | '2.15'; alias: boolean }
  | { fn: 'partial'; xml: string; node: number[]; root: number[] }
  | { fn: 'copy'; xml: string; target: number[]; source: number[]; values: boolean };

function at(root: XElement, path: number[]): XElement {
  let e = root;
  for (const i of path) e = [...e.elements()][i]!;
  return e;
}

function evaluate(c: Case): unknown {
  switch (c.fn) {
    case 'split': {
      const path = c.parts.map(([t, n]) => t.repeat(n)).join('');
      const schema = c.schema === '2.15' ? CAEXDocument_CAEXSchema.CAEX2_15 : CAEXDocument_CAEXSchema.CAEX3_0;
      const list = CAEXPathBuilder.pathNameListWithSeparator(path, schema, c.alias);
      return { n: list.length, head: list.slice(0, 5), tail: list.slice(Math.max(0, list.length - 5)) };
    }
    case 'partial': {
      const root = parseXDocument(c.xml).root!;
      return XmlCAEXAttributes.getPartialNodeCAEXPath(at(root, c.node), at(root, c.root));
    }
    case 'copy': {
      const doc: any = CAEXDocument.loadFromString(c.xml);
      const target: any = XmlOperation.createCAEXWrapper(at(doc.xDocument.root, c.target));
      const source: any = XmlOperation.createCAEXWrapper(at(doc.xDocument.root, c.source));
      ObjectWithAttributes.copyAttributesFrom(target, source, c.values);
      return [...target.attribute].map((a: any) => `${a.name}=${a.value ?? ''}`);
    }
  }
}

function run(c: Case): unknown {
  try {
    return { ok: evaluate(c) };
  } catch (e) {
    if (e instanceof ArgumentException && e.message.includes('Aml.Engine does not return')) return '!hang';
    return { err: dotNetExceptionName(e) };
  }
}

describe.skipIf(!existsSync(expectedFile))('calls that may not return (oracle noreturn)', () => {
  const cases = JSON.parse(readFileSync(casesFile, 'utf8')) as Case[];
  const expected = JSON.parse(readFileSync(existsSync(expectedFile) ? expectedFile : casesFile, 'utf8')) as unknown[];
  it('has the oracle result of every case', () => {
    expect(expected.length).toBe(cases.length);
    // the cases include calls that do not return and calls that end with an exception
    expect(expected.filter((r) => r === '!hang').length).toBeGreaterThan(0);
  });
  cases.forEach((c, i) => {
    it(`case ${i} (${c.fn})`, () => {
      expect(run(c)).toEqual(expected[i]);
    });
  });
});
