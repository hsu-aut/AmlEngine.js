// Very deep documents: parsing and writing do not use recursion (as in .NET), so the nesting depth
// is not limited by the call stack, and namespace lookups do not walk every open element, so the
// time grows linearly with the depth. The 3000 level case of test/xml-corpus is compared with
// .NET by the XML oracle; this test goes further than a comparison is practical (an indented save
// of such a document grows with the square of the depth, in .NET as well).
import { expect, it } from 'vitest';
import { CAEXDocument } from '../../src/index.js';
import { parseXDocument } from '../../src/xml/index.js';

const DEPTH = 20000;

it('parses and writes XML nested 20000 levels deep', () => {
  const xml = `<r xmlns="urn:x" xmlns:p="urn:p">${'<p:a k="v">'.repeat(DEPTH)}text${'</p:a>'.repeat(DEPTH)}</r>`;
  const doc = parseXDocument(xml);
  const text = doc.root!.toString(true);
  expect(text).toBe(xml);
  expect(parseXDocument(text).root!.toString(true)).toBe(xml);
});

it('loads, saves and reloads a CAEX document nested 20000 levels deep', () => {
  const ie = (i: number) => `<InternalElement Name="E${i}" ID="00000000-0000-4000-a000-${String(i).padStart(12, '0')}">`;
  let open = '';
  for (let i = 0; i < DEPTH; i++) open += ie(i);
  const xml = `<CAEXFile SchemaVersion="3.0" FileName="deep.aml" xmlns="http://www.dke.de/CAEX"><InstanceHierarchy Name="IH">${open}${'</InternalElement>'.repeat(DEPTH)}</InstanceHierarchy></CAEXFile>`;
  const doc: any = CAEXDocument.loadFromString(xml);
  expect(doc).not.toBeNull();
  const bytes: Uint8Array = doc.saveToStream(false);
  const again: any = CAEXDocument.loadFromBinary(bytes);
  expect(again).not.toBeNull();
  expect(new TextDecoder().decode(again.saveToStream(false))).toBe(new TextDecoder().decode(bytes));
  const deepest = [...again.xDocument.root.descendants()].pop();
  expect(deepest.attribute('Name').value).toBe(`E${DEPTH - 1}`);
});
