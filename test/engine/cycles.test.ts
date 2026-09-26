// CyclicReferenceException as seen by a user of the package: where Aml.Engine would never return
// on cyclic references, the port throws at once (docs/deviations.md, "Calls that do not return").
// Which calls throw is checked against the oracle in reads.oracle.test.ts; this test covers the
// exception itself.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { CAEXDocument, CyclicReferenceException } from '../../src/index.js';
import { InvalidOperationException } from '../../src/system/exceptions.js';

const repo = join(__dirname, '..', '..');
const load = (name: string): any => CAEXDocument.loadFromString(readFileSync(join(repo, 'test', 'reads', name), 'utf8'));

function thrown(f: () => unknown): unknown {
  try {
    f();
  } catch (e) {
    return e;
  }
  return null;
}

it('throws CyclicReferenceException for base classes in a cycle', () => {
  const doc = load('cyclic-30.aml');
  const cycA = doc.findByPath('SUCL/CycA');
  const e = thrown(() => [...cycA.getReferenceHierarchy()]);
  expect(e).toBeInstanceOf(CyclicReferenceException);
  expect(e).toBeInstanceOf(InvalidOperationException);
  const x = e as CyclicReferenceException;
  expect(x.name).toBe('CyclicReferenceException');
  expect(x.element?.attribute('Name')?.value).toBe('CycA');
  expect(x.message).toBe("The base class references form a cycle at SystemUnitClass 'CycA'; Aml.Engine overflows the stack here.");
  // a class outside the cycle is not affected
  expect([...doc.findByPath('SUCL/Machine/Press').getReferenceHierarchy()].map((c: any) => c.name)).toEqual(['Press', 'Machine']);
});

it('throws for a cycle that is entered over a tail, and for a class derived from its child', () => {
  const doc = load('cyclic-shapes-30.aml');
  const tail = doc.findByPath('SUCL3/Tail');
  const e = thrown(() => [...tail.getReferenceHierarchy()]) as CyclicReferenceException;
  expect(e).toBeInstanceOf(CyclicReferenceException);
  // the chain Tail -> A -> B -> C -> A repeats at A
  expect(e.element?.attribute('Name')?.value).toBe('A');
  expect(thrown(() => [...doc.findByPath('ICL3/Outer').getReferenceHierarchy()])).toBeInstanceOf(CyclicReferenceException);
});

it('throws for a loop over base classes (ClassIsDerivedFrom)', () => {
  const doc = load('cyclic-30.aml');
  const e = thrown(() => doc.findByPath('ICL/CycA').classIsDerivedFrom('ICL/Base'));
  expect(e).toBeInstanceOf(CyclicReferenceException);
  expect((e as Error).message).toContain('Aml.Engine does not return here');
});

it('throws for attributes mirroring each other', () => {
  const doc = load('cyclic-shapes-30.aml');
  const attribute = doc.findByPath('IH/AttA').attribute.item('S');
  expect(attribute.isMirror).toBe(true);
  expect(thrown(() => attribute.attributeTypeReference)).toBeInstanceOf(CyclicReferenceException);
});
