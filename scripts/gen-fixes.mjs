// Writes the inputs of the "fixes" oracle (test/fixes): documents and a container written by the
// port with the corrections of src/engine/fixes.ts switched on, and expected.json with what they
// are meant to contain. oracle/FixesOracle.cs reads them with the original Aml.Engine and
// test/engine/fixes.oracle.test.ts checks that the original sees exactly the intended content.
//   node scripts/gen-fixes.mjs [outDir=test/fixes]
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';

const { build } = createRequire(import.meta.url)('esbuild');
const outDir = process.argv[2] ?? 'test/fixes';
const bundle = join(tmpdir(), `amlengine-gen-fixes-${process.pid}.mjs`);
await build({
  stdin: { contents: ENTRY(), resolveDir: process.cwd(), loader: 'ts' },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: bundle,
  logLevel: 'error',
});
const { generate } = await import(pathToFileURL(bundle).href);
rmSync(bundle);
mkdirSync(outDir, { recursive: true });
const { files, expected } = generate();
for (const [name, bytes] of Object.entries(files)) writeFileSync(join(outDir, name), bytes);
writeFileSync(join(outDir, 'expected.json'), JSON.stringify(expected, null, 1) + '\n');
console.log(`${Object.keys(files).length} files -> ${outDir}`);

function ENTRY() {
  return `
import { CAEXDocument, ClrValue, Fixes } from './src/index.ts';
import { CAEXDocument_CAEXSchema } from './src/engine/caex/CAEXDocument.ts';
import { InternalLinkType } from './src/engine/caex/InternalLinkType.ts';
import { ServiceLocator } from './src/engine/services/ServiceLocator.ts';
import { AMLFile } from './src/engine/amlobjects/AMLFile.ts';
import { AutomationMLContainer } from './src/engine/amlobjects/AutomationMLContainer.ts';
import { MemoryStream } from './src/engine/amlobjects/packaging/MemoryStream.ts';
import { FileMode, TargetMode } from './src/engine/amlobjects/packaging/Package.ts';
import { Uri, UriKind } from './src/system/index.ts';

const CAEX30 = (body) =>
  '<?xml version="1.0" encoding="utf-8"?><CAEXFile SchemaVersion="3.0" FileName="f.aml" xmlns="http://www.dke.de/CAEX"><SuperiorStandardVersion>AutomationML 2.10</SuperiorStandardVersion>' + body + '</CAEXFile>';
const CAEX215 = (body) =>
  '<?xml version="1.0" encoding="utf-8"?><CAEXFile SchemaVersion="2.15" FileName="f.aml"><AdditionalInformation AutomationMLVersion="2.0" />' + body + '</CAEXFile>';

export function generate() {
  // deterministic IDs
  let n = 0;
  ServiceLocator.register({ generateNewID: () => '00000000-0000-4000-b000-' + String(++n).padStart(12, '0') }, 'ICaexIDService');
  const files = {};
  const expected = {};
  const save = (name, doc) => (files[name] = doc.saveToStream(true));
  const load = (xml, fixes) => {
    const doc = CAEXDocument.loadFromString(xml);
    doc.fixes = fixes;
    return doc;
  };

  // base64Binary and booleanFromNumber: attribute values
  {
    const doc = load(CAEX30('<InstanceHierarchy Name="IH"><InternalElement Name="Values" ID="00000000-0000-4000-a000-000000000001" /></InstanceHierarchy>'), ['base64Binary', 'booleanFromNumber']);
    const ie = doc.findByPath('IH/Values');
    const cases = [
      ['b64text', 'xs:base64Binary', 'hällo', 'hällo'],
      ['b64ascii', 'xs:base64Binary', 'plain text', 'plain text'],
      ['b64bytes', 'xs:base64Binary', new Uint8Array([104, 105, 33]), 'hi!'],
      ['boolOne', 'xs:boolean', 1, true],
      ['boolZero', 'xs:boolean', 0, false],
      ['boolTextOne', 'xs:boolean', '1', true],
      ['boolTextZero', 'xs:boolean', '0', false],
      ['boolDouble', 'xs:boolean', 2.5, true],
      ['boolLong', 'xs:boolean', ClrValue.long(1n), true],
    ];
    expected.values = {};
    for (const [name, type, value, intended] of cases) {
      const a = ie.attribute.append(name);
      a.attributeDataType = type;
      a.attributeValue = value;
      expected.values[name] = intended;
    }
    save('values.aml', doc);
  }

  // referenceSetter: Reference = a class writes its path
  {
    const doc = load(
      CAEX30('<SystemUnitClassLib Name="Lib"><SystemUnitClass Name="A" /><SystemUnitClass Name="B"><SystemUnitClass Name="Inner" /></SystemUnitClass></SystemUnitClassLib><RoleClassLib Name="RCL"><RoleClass Name="R1" /><RoleClass Name="R2" /></RoleClassLib><InterfaceClassLib Name="ICL"><InterfaceClass Name="I1" /><InterfaceClass Name="I2" /></InterfaceClassLib>'),
      ['referenceSetter'],
    );
    const pairs = [['Lib/A', 'Lib/B'], ['Lib/B/Inner', 'Lib/A'], ['RCL/R1', 'RCL/R2'], ['ICL/I1', 'ICL/I2']];
    expected.references = {};
    for (const [from, to] of pairs) {
      doc.findByPath(from).reference = doc.findByPath(to);
      expected.references[from] = to;
    }
    save('references.aml', doc);
  }

  // automationMLVersionSetter
  {
    const doc = load(CAEX30('<InstanceHierarchy Name="IH" />'), ['automationMLVersionSetter']);
    AMLFile.create(doc).automationMLVersion = '2.1';
    expected.automationMLVersion = '2.1';
    save('amlversion.aml', doc);
  }

  // internalLinkPartnerId (CAEX 2.15): links between interfaces of elements without ID
  {
    const doc = load(
      CAEX215('<InstanceHierarchy Name="IH"><InternalElement Name="Plant" ID="plant"><InternalElement Name="A"><ExternalInterface Name="Out" /></InternalElement><InternalElement Name="B"><ExternalInterface Name="In" /></InternalElement></InternalElement></InstanceHierarchy>'),
      ['internalLinkPartnerId'],
    );
    const a = [...doc.findByPath('IH/Plant').internalElement].find((e) => e.name === 'A');
    const b = [...doc.findByPath('IH/Plant').internalElement].find((e) => e.name === 'B');
    InternalLinkType.new_InternalLink([...a.externalInterface][0], [...b.externalInterface][0], 'Pipe');
    expected.internalLink = { name: 'Pipe', a: 'A:Out', b: 'B:In' };
    save('internallink-215.aml', doc);
  }

  // conversionAutomationMLVersion: a CAEX 2.15 document converted to CAEX 3.0
  {
    const doc = load(CAEX215('<InstanceHierarchy Name="IH"><InternalElement Name="A" ID="a" /></InstanceHierarchy>'), ['conversionAutomationMLVersion']);
    const converted = doc.transformToSchema(CAEXDocument_CAEXSchema.CAEX3_0);
    converted.finalizeSchemaTransformation();
    // a fixed time instead of now, so that the file is the same in every run
    const sdi = [...converted.xDocument.root.elements()].find((e) => e.name.localName === 'SourceDocumentInformation');
    sdi.setAttributeValue('LastWritingDateTime', '2024-05-06T07:08:09');
    expected.conversion = { schema: '3.0', automationMLVersionAttributes: 0 };
    save('conversion.aml', converted);
  }

  // streamingAdjacentElements: the same document with and without whitespace between elements
  {
    const doc = load(
      CAEX30('<InstanceHierarchy Name="IH">' + ['A', 'B', 'C', 'D', 'E'].map((x, i) => '<InternalElement Name="' + x + '" ID="00000000-0000-4000-a000-00000000001' + i + '" />').join('') + '</InstanceHierarchy>'),
      null,
    );
    files['streaming-pretty.aml'] = doc.saveToStream(true);
    files['streaming-plain.aml'] = doc.saveToStream(false);
    expected.streaming = ['A', 'B', 'C', 'D', 'E'];
  }

  // relinkPartRelationships: a container whose library was relinked
  {
    const enc = new TextEncoder();
    const m = new MemoryStream();
    const c = new AutomationMLContainer(m, FileMode.Create);
    c.fixes = ['relinkPartRelationships'];
    const root = c.addRoot(new MemoryStream(enc.encode(CAEX30('<InstanceHierarchy Name="IH" />'))), new Uri('/plant.aml', UriKind.Relative));
    const lib = c.addLibrary(root, new MemoryStream(enc.encode(CAEX30('<SystemUnitClassLib Name="Lib" />'))), new Uri('/lib/a.aml', UriKind.Relative));
    lib.createRelationship(new Uri('/plant.aml', UriKind.Relative), TargetMode.Internal, 'http://example/uses');
    c.relinkPart(new Uri('/lib/a.aml', UriKind.Relative), new Uri('/lib/b.aml', UriKind.Relative));
    c.close();
    files['relinked.amlx'] = m.toArray();
    expected.relink = { '/plant.aml': ['/lib/b.aml'], '/lib/b.aml': ['/plant.aml'] };
  }
  return { files, expected };
}
`;
}
