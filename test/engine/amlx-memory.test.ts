// AMLX containers through the public API (src/index.ts) without a file system, as in the browser:
// create one in a MemoryStream, add the root document, a library and a relationship, close it,
// and open its bytes again. The behaviour of the containers is checked against Aml.Engine by
// amlobjects.oracle.test.ts; this test is about what a user of the package can reach.
import { expect, it } from 'vitest';
import { AutomationMLContainer, CAEXDocument, FileMode, MemoryStream, TargetMode, Uri, UriKind, type PackagePart } from '../../src/index.js';

const uri = (s: string) => new Uri(s, UriKind.Relative);
const text = (part: PackagePart) => new TextDecoder().decode(part.getStream().toArray());

it('creates a container in memory and reads it back from its bytes', () => {
  const plant = CAEXDocument.new_CAEXDocument();
  plant.caexFile!.instanceHierarchy.append('Plant');
  const components = CAEXDocument.new_CAEXDocument();
  components.caexFile!.systemUnitClassLib.append('Components');

  const stream = new MemoryStream();
  const created = new AutomationMLContainer(stream, FileMode.Create);
  const root = created.addRoot(plant.saveToStream(true), uri('/plant.aml'));
  const lib = created.addLibrary(root, components.saveToStream(true), uri('/lib/components.aml'));
  lib.createRelationship(uri('/plant.aml'), TargetMode.Internal, 'http://example.org/uses');
  created.close();
  const bytes = stream.toArray();
  expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]); // a ZIP file

  const opened = new AutomationMLContainer(bytes);
  const rootText = new TextDecoder().decode(opened.rootDocumentStream()!.toArray());
  expect(CAEXDocument.loadFromString(rootText)!.caexFile!.instanceHierarchy.item(0)!.name).toBe('Plant');
  const libPart = opened.getPart(uri('/lib/components.aml'))!;
  expect(CAEXDocument.loadFromString(text(libPart))!.caexFile!.systemUnitClassLib.item(0)!.name).toBe('Components');
  expect([...libPart.getRelationships()].map((r) => r.targetUri.originalString)).toEqual(['/plant.aml']);
  opened.dispose(); // close() would flush, which a read-only container refuses, as in Aml.Engine
});
