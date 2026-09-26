// The usage example of README.md, run as it is written there.
import { expect, it } from 'vitest';
import { CAEXDocument, ClrValue } from '../../src/index.js';

const xml = `<?xml version="1.0" encoding="utf-8"?>
<CAEXFile SchemaVersion="3.0" FileName="plant.aml" xmlns="http://www.dke.de/CAEX">
  <InstanceHierarchy Name="Plant">
    <InternalElement Name="Pump" ID="0b0c7b8f-3f0a-4e1c-9b5e-6a4c7d2e1f00">
      <Attribute Name="Speed" AttributeDataType="xs:double" Unit="1/min"><Value>1450</Value></Attribute>
    </InternalElement>
  </InstanceHierarchy>
</CAEXFile>`;

it('runs the README example', () => {
  const doc: any = CAEXDocument.loadFromString(xml);
  const ie = doc.findByPath('Plant/Pump');
  const attributes = [...ie.attribute].map((a: any) => [a.name, a.value, a.unit]);
  expect(attributes).toEqual([['Speed', '1450', '1/min']]);

  const lib = doc.caexFile.systemUnitClassLib.append('Components');
  const pump = lib.systemUnitClass.append('Pump');
  pump.attribute.append('Speed').attributeValue = ClrValue.double(1500);
  const instance = doc.caexFile.instanceHierarchy.item(0).internalElement.insert(pump.createClassInstance());
  expect(instance.refBaseSystemUnitPath).toBe('Components/Pump');

  const bytes: Uint8Array = doc.saveToStream(true);
  expect(new TextDecoder().decode(bytes)).toContain('<Value>1500</Value>');
});
