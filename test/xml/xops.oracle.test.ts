// Random XLinq operation sequences, compared step by step with System.Xml.Linq.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { XCData, XComment, XDocument, XElement, XName, XAttribute, nodeToString, parseXDocument } from '../../src/xml/index.js';

const scriptFile = join(__dirname, '..', 'xml-ops', 'xops.json');
const expectedFile = join(__dirname, '..', 'oracle-out', 'xops.json');

type Op = Record<string, unknown> & { op: string; k: number };

function target(doc: XDocument, op: Op, key = 'k'): XElement {
  const all = [...doc.root!.descendantsAndSelf()];
  return all[(op[key] as number) % all.length];
}

function describeEl(e: XElement): string {
  const nodes = [...e.nodes()];
  const types = nodes.map((n) => ['None', 'Element', 'Attribute', 'Text', 'CDATA', '', '', 'ProcessingInstruction', 'Comment'][n.nodeType]);
  return `${e.isEmpty ? 'True' : 'False'}|${e.hasElements ? 'True' : 'False'}|${e.value}|${nodes.length}|${types.join(',')}`;
}

function apply(doc: XDocument, op: Op): string {
  const e = target(doc, op);
  const name = () => XName.get(op.name as string);
  const text = op.text as string | null;
  switch (op.op) {
    case 'add':
      e.add(text !== null && text !== undefined ? new XElement(name(), text) : new XElement(name()));
      return 'ok';
    case 'addFirst':
      e.addFirst(new XElement(name()));
      return 'ok';
    case 'addAfterSelf':
      e.addAfterSelf(new XElement(name()));
      return 'ok';
    case 'addBeforeSelf':
      e.addBeforeSelf(new XElement(name()));
      return 'ok';
    case 'addText':
      e.add(text);
      return describeEl(e);
    case 'addFirstText':
      e.addFirst(text);
      return describeEl(e);
    case 'addAfterSelfText':
      e.addAfterSelf(text);
      return 'ok';
    case 'setValue':
      e.value = text!;
      return describeEl(e);
    case 'setAttr':
      e.setAttributeValue(name(), op.value as string | null);
      return [...e.attributes()].map((a) => a.name.toString()).join(',');
    case 'setElementValue':
      e.setElementValue(name(), op.value as string | null);
      return describeEl(e);
    case 'remove':
      e.remove();
      return 'ok';
    case 'removeNodes':
      e.removeNodes();
      return describeEl(e);
    case 'removeAttributes':
      e.removeAttributes();
      return 'ok';
    case 'replaceWith':
      e.replaceWith(new XElement(name(), 'r'));
      return 'ok';
    case 'addExisting':
      e.add(target(doc, op, 'j'));
      return describeEl(e);
    case 'addCData':
      e.add(new XCData(text!));
      return describeEl(e);
    case 'addComment':
      e.add(new XComment(text!));
      return describeEl(e);
    case 'rename':
      e.name = name();
      return 'ok';
    case 'removeEverySecondChild': {
      let i = 0;
      let visited = 0;
      for (const c of e.elements()) {
        visited++;
        if (i++ % 2 === 1) c.remove();
      }
      return 'visited ' + visited;
    }
    case 'appendWhileIterating': {
      let visited = 0;
      for (const _ of e.elements()) {
        if (++visited > 50) break;
        if (visited <= 2) e.add(new XElement('added'));
      }
      return 'visited ' + visited;
    }
    case 'replaceAll':
      e.replaceAll(new XAttribute('q', '1'), new XElement(name()), text);
      return describeEl(e);
    case 'moveFirstChildToEnd': {
      const first = e.elements().next();
      if (first.done) return 'none';
      first.value.remove();
      e.add(first.value);
      return describeEl(e);
    }
    case 'removeLastNode': {
      const last = e.lastNode;
      if (last === null) return 'none';
      last.remove();
      return describeEl(e);
    }
    default:
      throw new Error('unknown op ' + op.op);
  }
}

describe.skipIf(!existsSync(expectedFile))('XLinq operations parity', () => {
  const scripts = JSON.parse(readFileSync(scriptFile, 'utf8')) as Array<{ xml: string; preserve: boolean; ops: Op[] }>;
  const expected = JSON.parse(readFileSync(expectedFile, 'utf8')) as Array<Array<[string, string]>>;
  scripts.forEach((script, i) => {
    it(`script ${i}`, () => {
      const doc = parseXDocument(script.xml, { preserveWhitespace: script.preserve });
      script.ops.forEach((op, j) => {
        let result: string;
        try {
          result = apply(doc, op);
        } catch (err) {
          result = '!' + dotNetExceptionName(err);
        }
        const [expResult, expXml] = expected[i][j];
        let actualXml: string;
        try {
          actualXml = nodeToString(doc, true);
        } catch (err) {
          actualXml = '!' + dotNetExceptionName(err);
        }
        expect({ step: j, op, result, xml: actualXml }).toEqual({ step: j, op, result: expResult, xml: expXml });
      });
    });
  });
});
