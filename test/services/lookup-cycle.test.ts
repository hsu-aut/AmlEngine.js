// The LookupService after a CyclicReferenceException from its change handler. Aml.Engine overflows
// the stack there and its process ends; the port throws and must keep following later changes
// (docs/deviations.md, "Calls that do not return"). The oracle cannot check this: in the original
// nothing comes after the overflow.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { CyclicReferenceException } from '../../src/engine/cycles.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { LookupService } from '../../src/services/LookupService.js';
import { readAllText } from '../engine/ops-apply.js';

const file = join(resolve(__dirname, '..', '..'), 'test', 'services', 'lookup', 'ids-30.aml');

function suc(doc: any, name: string): any {
  return [...doc.xDocument.root.descendants()]
    .map((e: any) => XmlOperation.createCAEXWrapper(e))
    .find((w: any) => w instanceof T.SystemUnitFamilyType && w.name === name);
}

afterEach(() => LookupService.unRegister());

describe('LookupService after a cycle in its change handler', () => {
  it('follows later changes', () => {
    const svc = LookupService.register();
    svc.isAutoUpdateEnabled = true;
    const doc = CAEXDocument.loadFromString(readAllText(file)) as any;
    doc.supportsAutoUpdate = true;
    svc.addDocument(doc);
    const tank = suc(doc, 'Tank');
    const dup = suc(doc, 'DupId');
    // DupId is indexed already; inserting it again links it to itself in the ID chain, and the
    // change handler of the next insert walks that chain.
    tank.insertBefore(dup);
    expect(() => tank.insertAfter(dup)).toThrow(CyclicReferenceException);
    // A later change reaches the tables: the service is not left paused.
    tank.id = 'changed-id';
    expect(svc.findByID(doc, 'changed-id')?.name).toBe('Tank');
  });
});
