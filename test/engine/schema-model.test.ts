import { describe, expect, it } from 'vitest';
import caex30 from '../../src/engine/schema/data/caex30.js';
import caex215 from '../../src/engine/schema/data/caex215.js';
import { UNBOUNDED, XmlSchemaComplexType, XmlSchemaUse, unpackSchema } from '../../src/engine/schema/SchemaModel.js';

describe('schema model', () => {
  it('unpacks CAEX 3.0 like the engine compiled it', () => {
    const s = unpackSchema(caex30);
    expect(s.namespace).toBe('http://www.dke.de/CAEX');
    const ie = s.infos[s.keys.get('InstanceHierarchyInternalElement')!];
    expect(ie.element.name).toBe('InternalElement');
    expect(ie.element.maxOccurs).toBe(UNBOUNDED);
    expect(ie.optional).toContain('RoleRequirements');
    const name = ie.attributes.find((a) => a.name === 'Name')!;
    expect(name.use).toBe(XmlSchemaUse.Required);
    expect((ie.element.elementSchemaType as XmlSchemaComplexType).attributeUses.length).toBe(ie.attributes.length);
    expect(s.keys.size).toBe(245);
  });
  it('unpacks CAEX 2.15', () => {
    const s = unpackSchema(caex215);
    expect(s.namespace).toBe('');
    expect(s.keys.size).toBe(195);
  });
});
