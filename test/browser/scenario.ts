// One scenario, bundled twice: for Node and for a real browser (headless Edge). Both runs must
// produce the same report. Node behaviour is verified against the oracle by the other tests, so an
// identical report shows the engine behaves the same in the browser.

/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  CAEXDocument,
  CAEXDocumentExtensions,
  ClrValue,
  InternalLinkType,
  AutomationMLContainer,
  Uri,
  UriKind,
  InternalElementType,
} from '../../src/index.js';
import { MemoryStream } from '../../src/engine/amlobjects/packaging/MemoryStream.js';
import { FileMode } from '../../src/engine/amlobjects/packaging/Package.js';

/** FNV-1a over UTF-16 code units: a small synchronous fingerprint for long texts. */
function fp(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0') + ':' + text.length;
}

function saved(doc: any): string {
  const bytes: Uint8Array = doc.saveToStream(true);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder().decode(bytes.subarray(start));
}

/** GUIDs and creation timestamps differ per run: replace them (GUIDs in order of appearance). */
function canon(text: string): string {
  const map = new Map<string, string>();
  text = text.replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?/g, 'NOW');
  return text.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, (m) => {
    const k = m.toLowerCase();
    if (!map.has(k)) map.set(k, 'G' + (map.size + 1));
    return map.get(k)!;
  });
}

export function runScenario(inputs: { big: string; plant: string; lib: string }): string[] {
  const r: string[] = [];
  const log = (k: string, f: () => unknown) => {
    try {
      const v = f();
      r.push(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`);
    } catch (e) {
      r.push(`${k}: !${(e as Error).name} ${(e as Error).message}`);
    }
  };

  // 1. A large corpus document: load, walk, look up, save.
  const big: any = CAEXDocument.loadFromString(inputs.big);
  log('big.schema', () => big.schemaVersionString);
  const objects = [...big.xDocument.root.descendants()].filter((e: any) => e.attribute('Name') !== null);
  log('big.objects', () => objects.length);
  const ies = [...big.xDocument.root.descendants()].filter((e: any) => e.name.localName === 'InternalElement');
  log('big.internalElements', () => ies.length);
  for (const e of ies.slice(0, 40)) {
    const w: any = new InternalElementType(e);
    log('ie', () => `${w.name}|${w.caexPath()}|${w.systemUnitClass?.caexPath() ?? ''}|${[...w.roleReferences].length}`);
    log('ie.find', () => CAEXDocumentExtensions.findByID(big, w.id)?.name ?? null);
  }
  log('big.saved', () => fp(saved(big)));
  log('big.validate', () => {
    const v = big.validate();
    return `${v.result}|${v.violationLog.length}|${fp(v.violationLog.join('\n'))}`;
  });

  // 2. A new document built through the API.
  const doc: any = CAEXDocument.new_CAEXDocument();
  const file = doc.caexFile;
  const icLib = file.interfaceClassLib.append('ICL');
  const port = icLib.interfaceClass.append('Port');
  const sucLib = file.systemUnitClassLib.append('SUCL');
  const pump = sucLib.systemUnitClass.append('Pump');
  const a = pump.attribute.append('Speed');
  a.attributeValue = ClrValue.double(1500);
  a.unit = '1/min';
  const b = pump.attribute.append('Count');
  b.attributeValue = 3;
  const ei = pump.externalInterface.append('In');
  ei.refBaseClassPath = port.caexPath();
  const ih = file.instanceHierarchy.append('Plant');
  const p1 = ih.internalElement.insert(pump.createClassInstance());
  const p2 = ih.internalElement.insert(pump.createClassInstance());
  p2.name = 'Pump2';
  log('link', () => {
    const il: any = InternalLinkType.new_InternalLink([...p1.externalInterface][0], [...p2.externalInterface][0], 'Pipe');
    return `${il.refPartnerSideA === null ? 'null' : 'id'}|${il.caexParent?.name}`;
  });
  log('p1.attr', () => `${[...p1.attribute].map((x: any) => `${x.name}=${x.value}:${x.attributeDataType}`).join(',')}`);
  log('new.validate', () => JSON.stringify(doc.validate()));
  log('new.saved', () => canon(saved(doc)));

  // 3. AMLX: write a container in memory, read it back, load the root document.
  log('amlx', () => {
    const m = new MemoryStream();
    const c: any = new AutomationMLContainer(m, FileMode.Create);
    const enc = new TextEncoder();
    const root = c.addRoot(new MemoryStream(enc.encode(inputs.plant)), new Uri('/plant.aml', UriKind.Relative));
    c.addLibrary(root, new MemoryStream(enc.encode(inputs.lib)), new Uri('/lib/lib.aml', UriKind.Relative));
    c.close();
    const c2: any = new AutomationMLContainer(new MemoryStream(m.toArray()));
    const parts = [...c2.getParts()].map((p: any) => `${p.uri.originalString}|${p.contentType}`).sort();
    const rootDoc: any = CAEXDocument.loadFromBinary(c2.rootDocumentStream().toArray());
    return `${parts.join(';')}|root=${fp(saved(rootDoc))}`;
  });
  return r;
}
