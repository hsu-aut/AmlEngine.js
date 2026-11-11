// The usage examples of README.md, run as they are written there.
import { expect, it } from 'vitest';
import { AutomationMLContainer, CAEXDocument, ClrValue, FileMode, MemoryStream, Uri, UriKind } from '../../src/index.js';
import { CAEXSchemaTransformer, UndoRedoService, ValidationResults, ValidatorService } from '../../src/services/index.js';

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

it('runs the README example for AMLX', () => {
  const doc: any = CAEXDocument.loadFromString(xml);

  const stream = new MemoryStream();
  const container = new AutomationMLContainer(stream, FileMode.Create);
  container.addRoot(doc.saveToStream(true), new Uri('/plant.aml', UriKind.Relative));
  container.close();
  const amlx = stream.toArray();

  const opened = new AutomationMLContainer(amlx);
  const root: any = CAEXDocument.loadFromBinary(opened.rootDocumentStream()!.toArray());
  opened.dispose();

  expect(root.findByPath('Plant/Pump').name).toBe('Pump');
});

it('runs the README example for the services', () => {
  const doc: any = CAEXDocument.loadFromString(xml);

  const undo = UndoRedoService.register();
  undo.beginTransaction(doc, 'Add a line');
  const line = doc.caexFile.instanceHierarchy.item(0).internalElement.append('Line');
  line.internalElement.append('Conveyor');
  undo.endTransaction(doc);
  expect([...undo.undoActions(doc)]).toEqual(['Add a line']);
  undo.undo(doc);
  expect(doc.findByPath('Plant/Line')).toBeNull();
  undo.redo(doc);
  expect(doc.findByPath('Plant/Line/Conveyor').name).toBe('Conveyor');
  UndoRedoService.unRegister();

  const validator = ValidatorService.register();
  const issues = [...validator.validateAll(doc)];
  expect(issues.length).toBe(2);
  for (const issue of ValidationResults.repairable(issues)) validator.repair(issue);
  expect([...validator.validateAll(doc)].length).toBe(0);
  ValidatorService.unRegister();

  const caex215: any = CAEXSchemaTransformer.register().transformTo(doc, CAEXDocument.CAEXSchema.CAEX2_15);
  CAEXSchemaTransformer.unRegister();
  expect(caex215.schemaVersionString).toBe('2.15');
  expect(caex215.findByPath('Plant/Line/Conveyor').name).toBe('Conveyor');
});
