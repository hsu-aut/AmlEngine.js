// The optional corrections of data errors of Aml.Engine (src/engine/fixes.ts, docs/fixes.md): for
// each, the behaviour of the original when it is off (the original's behaviour itself is checked
// by the oracle tests) and the corrected behaviour when it is on. That the original reads what the
// corrections write is checked by fixes.oracle.test.ts.
import { afterEach, describe, expect, it } from 'vitest';
import { ALL_FIXES, CAEXDocument, ClrValue, Fixes, type Fix } from '../../src/index.js';
import { CAEXDocument_CAEXSchema } from '../../src/engine/caex/CAEXDocument.js';
import { CAEXPathBuilder } from '../../src/engine/caex/extensions/CAEXPathBuilder.js';
import { InternalLinkType } from '../../src/engine/caex/InternalLinkType.js';
import { SetElementContentCmd } from '../../src/engine/caex/commands/SetElementContentCmd.js';
import { DocumentStreaming } from '../../src/engine/streaming/DocumentStreaming.js';
import { AMLFile } from '../../src/engine/amlobjects/AMLFile.js';
import { AutomationMLContainer } from '../../src/engine/amlobjects/AutomationMLContainer.js';
import { MemoryStream } from '../../src/engine/amlobjects/packaging/MemoryStream.js';
import { FileMode, TargetMode } from '../../src/engine/amlobjects/packaging/Package.js';
import { Uri, UriKind } from '../../src/system/index.js';
import { XElement } from '../../src/xml/index.js';

afterEach(() => {
  Fixes.default = 'none';
});

const CAEX30 = (body: string, head = '<SuperiorStandardVersion>AutomationML 2.10</SuperiorStandardVersion>') =>
  `<?xml version="1.0" encoding="utf-8"?><CAEXFile SchemaVersion="3.0" FileName="f.aml" xmlns="http://www.dke.de/CAEX">${head}${body}</CAEXFile>`;
const CAEX215 = (body: string) =>
  `<?xml version="1.0" encoding="utf-8"?><CAEXFile SchemaVersion="2.15" FileName="f.aml"><AdditionalInformation AutomationMLVersion="2.0" />${body}</CAEXFile>`;

/** Runs `f` with the fix off and on (per document), returning both results. */
function offOn<R>(fix: Fix, xml: string, f: (doc: any) => R): [R, R] {
  const off: any = CAEXDocument.loadFromString(xml);
  const on: any = CAEXDocument.loadFromString(xml);
  on.fixes = [fix];
  return [f(off), f(on)];
}

function attr(dataType: string) {
  return CAEX30(`<InstanceHierarchy Name="IH"><InternalElement Name="A" ID="00000000-0000-4000-a000-000000000001"><Attribute Name="V" AttributeDataType="${dataType}" /></InternalElement></InstanceHierarchy>`);
}

describe('selection', () => {
  it('is off by default and can be set per document, per container and as default', () => {
    const doc: any = CAEXDocument.loadFromString(attr('xs:string'));
    expect(doc.fixes).toBe(null);
    expect(Fixes.default.size).toBe(0);
    expect(Fixes.enabled('base64Binary', doc)).toBe(false);
    Fixes.default = 'all';
    expect(Fixes.enabled('base64Binary', doc)).toBe(true);
    expect(Fixes.enabled('base64Binary', doc.findByPath('IH/A').node)).toBe(true);
    doc.fixes = 'none';
    expect(Fixes.enabled('base64Binary', doc)).toBe(false);
    expect(Fixes.enabled('base64Binary', doc.findByPath('IH/A'))).toBe(false);
    doc.fixes = ['datePartValues'];
    expect([...doc.fixes]).toEqual(['datePartValues']);
    expect(Fixes.enabled('base64Binary', doc)).toBe(false);
    expect(Fixes.enabled('datePartValues', doc)).toBe(true);
    doc.fixes = null;
    expect(Fixes.enabled('base64Binary', doc)).toBe(true);
    expect([...Fixes.default]).toEqual([...ALL_FIXES]);
  });

  it('rejects unknown names', () => {
    const doc: any = CAEXDocument.loadFromString(attr('xs:string'));
    expect(() => (doc.fixes = ['nope'])).toThrow(/Unknown fix 'nope'/);
    expect(() => (Fixes.default = ['nope' as Fix])).toThrow(/Unknown fix 'nope'/);
  });
});

describe('base64Binary', () => {
  it('writes the value base64 encoded, so that it reads back', () => {
    const [off, on] = offOn('base64Binary', attr('xs:base64Binary'), (doc) => {
      const a = doc.findByPath('IH/A').attribute.item('V');
      a.attributeValue = 'hällo';
      return [a.value, a.attributeValue];
    });
    expect(off).toEqual(['hällo', '']);
    expect(on).toEqual(['aMOkbGxv', 'hällo']);
  });

  it('encodes bytes directly', () => {
    const [, on] = offOn('base64Binary', attr('xs:base64Binary'), (doc) => {
      const a = doc.findByPath('IH/A').attribute.item('V');
      a.attributeValue = new Uint8Array([0x61, 0x62, 0x63]);
      return a.value;
    });
    expect(on).toBe('YWJj');
  });
});

describe('datePartValues', () => {
  it('reads xs:gDay and xs:gMonth back as the number written', () => {
    for (const [type, text] of [
      ['xs:gDay', '---05'],
      ['xs:gMonth', '--05--'],
    ]) {
      const [off, on] = offOn('datePartValues', attr(type), (doc) => {
        const a = doc.findByPath('IH/A').attribute.item('V');
        a.attributeValue = ClrValue.ushort(5);
        return [a.value, a.attributeValue];
      });
      expect(off).toEqual([text, text]);
      expect(on).toEqual([text, 5]);
    }
  });

  it('also reads "--MM" and time zones', () => {
    const [, on] = offOn('datePartValues', attr('xs:gMonth'), (doc) => {
      const a = doc.findByPath('IH/A').attribute.item('V');
      return ['--11', '--11Z', '--11--+02:00', '---11', '07', '--13', '--00'].map((v) => {
        a.value = v;
        return a.attributeValue;
      });
    });
    expect(on).toEqual([11, 11, 11, '---11', 7, '--13', '--00']);
  });
});

describe('booleanFromNumber', () => {
  it('writes 1 and "1" as true', () => {
    const [off, on] = offOn('booleanFromNumber', attr('xs:boolean'), (doc) => {
      const a = doc.findByPath('IH/A').attribute.item('V');
      return [1, 0, '1', '0', 2.5, ClrValue.long(1n), true, 'True'].map((v) => {
        a.attributeValue = v;
        return a.value;
      });
    });
    expect(off).toEqual(['false', 'false', 'false', 'false', 'false', 'false', 'true', 'true']);
    expect(on).toEqual(['true', 'false', 'true', 'false', 'true', 'true', 'true', 'true']);
  });
});

describe('referenceSetter', () => {
  it('writes the path of the referenced class', () => {
    const xml = CAEX30(
      '<SystemUnitClassLib Name="Lib"><SystemUnitClass Name="A" /><SystemUnitClass Name="B" /></SystemUnitClassLib>',
    );
    const [off, on] = offOn('referenceSetter', xml, (doc) => {
      const a = doc.findByPath('Lib/A');
      a.reference = doc.findByPath('Lib/B');
      return [a.refBaseClassPath, a.baseClass?.name ?? null];
    });
    expect(off).toEqual(['B', null]);
    expect(on).toEqual(['Lib/B', 'B']);
  });
});

describe('automationMLVersionSetter', () => {
  it('writes the version into an existing SuperiorStandardVersion', () => {
    const [off, on] = offOn('automationMLVersionSetter', attr('xs:string'), (doc) => {
      const file = AMLFile.create(doc);
      file.automationMLVersion = '2.1';
      return [file.automationMLVersion, [...doc.xDocument.root.elements()][0].value];
    });
    expect(off).toEqual(['2.10', 'AutomationML 2.10']);
    expect(on).toEqual(['2.1', 'AutomationML 2.1']);
  });
});

describe('internalLinkPartnerId', () => {
  it('uses the ID it creates for an element without one (CAEX 2.15)', () => {
    const xml = CAEX215('<InstanceHierarchy Name="IH"><InternalElement Name="A"><ExternalInterface Name="P" /></InternalElement></InstanceHierarchy>');
    const [off, on] = offOn('internalLinkPartnerId', xml, (doc) => {
      const ie = doc.findByPath('IH/A');
      const ref = CAEXPathBuilder.internalLinkReferencePath(ie.node, [...ie.externalInterface][0].node);
      return [ref, ie.id];
    });
    expect(off[0]).toBe(':P');
    expect(off[1]).toMatch(/^[0-9a-f-]{36}$/);
    expect(on[0]).toBe(`${on[1]}:P`);
  });
});

describe('internalLinkPartnerId through New_InternalLink', () => {
  it('links interfaces of elements without ID', () => {
    const xml = CAEX215(
      '<InstanceHierarchy Name="IH"><InternalElement Name="Plant" ID="plant"><InternalElement Name="A"><ExternalInterface Name="Out" /></InternalElement><InternalElement Name="B"><ExternalInterface Name="In" /></InternalElement></InternalElement></InstanceHierarchy>',
    );
    const [off, on] = offOn('internalLinkPartnerId', xml, (doc) => {
      const [a, b] = [...doc.findByPath('IH/Plant').internalElement];
      const link = InternalLinkType.new_InternalLink([...a.externalInterface][0], [...b.externalInterface][0], 'Pipe');
      return [link.refPartnerSideA, link.refPartnerSideB, `${a.id}:Out`, `${b.id}:In`];
    });
    expect(off.slice(0, 2)).toEqual([':Out', ':In']);
    expect(on.slice(0, 2)).toEqual(on.slice(2));
  });
});

describe('undoElementContent', () => {
  it('restores nested content once', () => {
    const xml = CAEX30(
      '<InstanceHierarchy Name="IH"><InternalElement Name="A" ID="00000000-0000-4000-a000-000000000001"><Attribute Name="V" AttributeDataType="xs:string"><Value>x</Value></Attribute></InternalElement></InstanceHierarchy>',
    );
    const [off, on] = offOn('undoElementContent', xml, (doc) => {
      const ie = doc.findByPath('IH/A').node as XElement;
      const before = ie.toString();
      const cmd = new SetElementContentCmd(ie, [new XElement('X')]);
      cmd.execute();
      cmd.unExecute();
      return [ie.toString() === before, [...ie.descendants()].length];
    });
    expect(off).toEqual([false, 3]);
    expect(on).toEqual([true, 2]);
  });
});

describe('streamingAdjacentElements', () => {
  it('finds adjacent elements in a document without whitespace', () => {
    const doc: any = CAEXDocument.loadFromString(
      CAEX30(
        '<InstanceHierarchy Name="IH"><InternalElement Name="A" ID="00000000-0000-4000-a000-000000000001" /><InternalElement Name="B" ID="00000000-0000-4000-a000-000000000002" /><InternalElement Name="C" ID="00000000-0000-4000-a000-000000000003" /></InstanceHierarchy>',
      ),
    );
    const bytes: Uint8Array = doc.saveToStream(false);
    const names = () => [...DocumentStreaming.streamElementWithName(bytes, 'InternalElement', null)].map((w: any) => w.name);
    expect(names()).toEqual(['A', 'C']);
    Fixes.default = ['streamingAdjacentElements'];
    expect(names()).toEqual(['A', 'B', 'C']);
  });
});

describe('relinkPartRelationships', () => {
  it('moves the relationships of other parts to the new URI and keeps those of the part', () => {
    const run = (fixed: boolean) => {
      const enc = new TextEncoder();
      const m = new MemoryStream();
      const c: any = new AutomationMLContainer(m, FileMode.Create);
      if (fixed) c.fixes = ['relinkPartRelationships'];
      const root = c.addRoot(new MemoryStream(enc.encode(attr('xs:string'))), new Uri('/plant.aml', UriKind.Relative));
      const lib = c.addLibrary(root, new MemoryStream(enc.encode(attr('xs:string'))), new Uri('/lib/a.aml', UriKind.Relative));
      lib.createRelationship(new Uri('/plant.aml', UriKind.Relative), TargetMode.Internal, 'http://example/uses');
      c.relinkPart(new Uri('/lib/a.aml', UriKind.Relative), new Uri('/lib/b.aml', UriKind.Relative));
      const rels = (u: string) => [...c.getPart(new Uri(u, UriKind.Relative)).getRelationships()].map((r: any) => r.targetUri.originalString).sort();
      return [rels('/plant.aml'), rels('/lib/b.aml')];
    };
    expect(run(false)).toEqual([['/lib/a.aml'], []]);
    expect(run(true)).toEqual([['/lib/b.aml'], ['/plant.aml']]);
  });
});

describe('conversionAutomationMLVersion', () => {
  it('drops the CAEX 2.15 AutomationMLVersion information when converting to CAEX 3.0', () => {
    const xml = CAEX215('<InstanceHierarchy Name="IH" />');
    const [off, on] = offOn('conversionAutomationMLVersion', xml, (doc) => {
      const t = doc.transformToSchema(CAEXDocument_CAEXSchema.CAEX3_0);
      return [...t.xDocument.root.elements()].map((e: any) => e.name.localName);
    });
    expect(off).toEqual(['AdditionalInformation', 'SuperiorStandardVersion', 'SourceDocumentInformation', 'InstanceHierarchy']);
    expect(on).toEqual(['SuperiorStandardVersion', 'SourceDocumentInformation', 'InstanceHierarchy']);
  });
});
