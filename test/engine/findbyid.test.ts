// FindByID without ID table (QueryService): the original searches the document from the start for
// every call; the port keeps what its searches have seen while no element or attribute changes
// (src/xml/XNode.ts treeVersion). The result must stay that of the plain search after every kind of
// change, so each test below warms the table up first: one search after a change is the plain
// search, the second one keeps what it sees, and searching a missing ID walks to the end.
// The whole suite can also compare every FindByID with the plain search (test/setup/check-id-table.ts).
import { describe, expect, it, vi } from 'vitest';
import { CAEXDocument } from '../../src/index.js';
import { XAttribute, XElement, XName } from '../../src/xml/index.js';

const NS = 'http://www.dke.de/CAEX';
const CAEX30 = (body: string) =>
  `<?xml version="1.0" encoding="utf-8"?><CAEXFile SchemaVersion="3.0" FileName="f.aml" xmlns="${NS}"><SuperiorStandardVersion>AutomationML 2.10</SuperiorStandardVersion><InstanceHierarchy Name="IH">${body}</InstanceHierarchy></CAEXFile>`;
const BODY =
  '<InternalElement Name="A" ID="a"><InternalElement Name="A1" ID="a1" /></InternalElement>' +
  '<InternalElement Name="B" ID="b" /><InternalElement Name="C" ID="c" /><InternalElement Name="N" />';

function load(body = BODY): any {
  return CAEXDocument.loadFromString(CAEX30(body));
}

/** The table is complete afterwards: the second search of a missing ID walked the whole document. */
function warm(doc: any): void {
  expect(doc.findByID('missing')).toBe(null);
  expect(doc.findByID('missing')).toBe(null);
}

const ie = (name: string, id?: string): XElement =>
  new XElement(XName.get('InternalElement', NS), new XAttribute('Name', name), ...(id !== undefined ? [new XAttribute('ID', id)] : []));

const node = (doc: any, path: string): XElement => doc.findByPath(path).node;

/** The name of the object found, null if none is found (an object without name gives "(no name)"). */
function found(doc: any, id: string): string | null {
  const o = doc.findByID(id);
  return o === null ? null : (o.name ?? '(no name)');
}

describe('FindByID without ID table', () => {
  // The check of all FindByID calls searches the document itself.
  it.skipIf(!!process.env.AMLENGINE_CHECK_ID_TABLE)('answers repeated searches without a change in between without walking the document again', () => {
    const doc = load(Array.from({ length: 500 }, (_, i) => `<InternalElement Name="E${i}" ID="e${i}" />`).join(''));
    expect(found(doc, 'e0')).toBe('E0');
    expect(found(doc, 'e499')).toBe('E499');
    const spy = vi.spyOn(XElement.prototype, 'attribute');
    let results: any[];
    let calls: number;
    try {
      results = ['e0', 'e250', 'e498', 'e499', 'missing'].map((id) => doc.findByID(id));
      calls = spy.mock.calls.length;
    } finally {
      spy.mockRestore();
    }
    expect(calls).toBeLessThan(20);
    expect(results.map((r) => r?.name ?? null)).toEqual(['E0', 'E250', 'E498', 'E499', null]);
  });

  it('finds the first element with the ID in document order', () => {
    const doc = load(
      '<InternalElement Name="A" ID="x"><InternalElement Name="A1" ID="dup" /></InternalElement>' +
        '<InternalElement Name="B" ID="dup" /><InternalElement Name="C" ID="x" />',
    );
    for (let i = 0; i < 3; i++) {
      expect(found(doc, 'dup')).toBe('A1');
      expect(found(doc, 'x')).toBe('A');
    }
    node(doc, 'IH/A/A1').remove();
    warm(doc);
    expect(found(doc, 'dup')).toBe('B');
    node(doc, 'IH/C').add(ie('C1', 'dup'));
    warm(doc);
    expect(found(doc, 'dup')).toBe('B');
  });

  // New elements are built before warming up: building one already adds its attributes.
  describe('sees every change of elements and attributes', () => {
    it('an element inserted before the first one with the ID', () => {
      const doc = load();
      const b2 = ie('B2', 'b');
      warm(doc);
      node(doc, 'IH/A').addBeforeSelf(b2);
      expect(found(doc, 'b')).toBe('B2');
    });

    it('an element inserted after one, and at the start', () => {
      const doc = load();
      const d = ie('D', 'd');
      const c2 = ie('C2', 'c');
      warm(doc);
      node(doc, 'IH/A').addAfterSelf(d);
      expect(found(doc, 'd')).toBe('D');
      warm(doc);
      node(doc, 'IH').addFirst(c2);
      expect(found(doc, 'c')).toBe('C2');
    });

    it('an element appended at the end', () => {
      const doc = load();
      const d = ie('D', 'd');
      warm(doc);
      node(doc, 'IH').add(d);
      expect(found(doc, 'd')).toBe('D');
    });

    it('an element removed', () => {
      const doc = load();
      warm(doc);
      node(doc, 'IH/B').remove();
      expect(found(doc, 'b')).toBe(null);
    });

    it('all child nodes removed', () => {
      const doc = load();
      warm(doc);
      node(doc, 'IH/A').removeNodes();
      expect(found(doc, 'a1')).toBe(null);
    });

    it('an element replaced', () => {
      const doc = load();
      const c2 = ie('C2', 'c');
      warm(doc);
      node(doc, 'IH/C').replaceWith(c2);
      expect(found(doc, 'c')).toBe('C2');
    });

    it('an ID value set', () => {
      const doc = load();
      warm(doc);
      node(doc, 'IH/B').attribute('ID')!.value = 'b2';
      expect(found(doc, 'b')).toBe(null);
      expect(found(doc, 'b2')).toBe('B');
    });

    it('an ID attribute removed', () => {
      const doc = load();
      warm(doc);
      node(doc, 'IH/B').attribute('ID')!.remove();
      expect(found(doc, 'b')).toBe(null);
    });

    it('an ID attribute added', () => {
      const doc = load();
      warm(doc);
      node(doc, 'IH/N').setAttributeValue('ID', 'n');
      expect(found(doc, 'n')).toBe('N');
    });

    it('all attributes removed', () => {
      const doc = load();
      warm(doc);
      node(doc, 'IH/B').removeAttributes();
      expect(found(doc, 'b')).toBe(null);
    });

    it('a detached element changed and then added', () => {
      const doc = load();
      const e = ie('Z');
      warm(doc);
      e.setAttributeValue('ID', 'z');
      warm(doc);
      node(doc, 'IH').add(e);
      expect(found(doc, 'z')).toBe('Z');
    });

    it('an ID set through the CAEX object', () => {
      const doc = load();
      warm(doc);
      doc.findByPath('IH/C').id = 'c2';
      expect(found(doc, 'c')).toBe(null);
      expect(found(doc, 'c2')).toBe('C');
    });

    it('a change in another document', () => {
      const one = load();
      const two = load();
      warm(one);
      warm(two);
      node(two, 'IH/B').remove();
      expect(found(one, 'b')).toBe('B');
      expect(found(two, 'b')).toBe(null);
    });
  });
});
