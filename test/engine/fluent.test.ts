// The instance form of an extension method calls the same code as the static form.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CAEXDocument, CAEXDocumentExtensions, CAEXFileTypeExtensions, InternalElementType } from '../../src/index.js';

const plant = readFileSync(join(__dirname, '..', 'corpus', 'plant.aml'), 'utf8');

describe('extension methods as instance methods', () => {
  it('delegate to the static extension methods', () => {
    const doc: any = CAEXDocument.loadFromString(plant);
    const ie = [...doc.caexFile.instanceHierarchy][0].internalElement.item(0) as InternalElementType;
    expect(doc.findByPath(ie.caexPath())?.node).toBe(CAEXDocumentExtensions.findByPath(doc, ie.caexPath())?.node);
    expect(doc.findByID(ie.id)?.node).toBe(ie.node);
    const file: any = doc.caexFile;
    expect([...file.instanceHierarchy].length).toBeGreaterThan(0);
    expect(typeof file.allInstances).toBe(typeof (CAEXFileTypeExtensions as any).allInstances);
  });
  it('do not replace members of the classes', () => {
    const doc = CAEXDocument.new_CAEXDocument() as any;
    const ih = doc.caexFile.instanceHierarchy.append('IH');
    const e = ih.internalElement.append('E');
    expect(e.name).toBe('E');
    expect(typeof e.copy).toBe('function');
  });
});
