// Timings of the port for docs/performance.md, the same steps as oracle/BenchOracle.cs: load,
// walk (every InternalElement: name, ID, system unit class, attribute values, number of external
// interfaces; walkSum must equal the one of Aml.Engine), find (findByID for up to 200 IDs spread
// over the document), save (saveToStream(true)), validate, loadIndexed and findIndexed (loading with
// createIndices, then findByID for every InternalElement). Bundled for Node and for browsers by
// test/perf/run.mjs; `now` and `heap` come from the environment.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { CAEXBasicObjectExtensions, CAEXDocument, CAEXDocumentExtensions, InternalElementType } from '../../src/index.js';

export function bench(file: string, text: string, now: () => number, heap: () => number | null): Record<string, unknown> {
  const ms = (t: number): number => Math.round((now() - t) * 10) / 10;
  const r: Record<string, unknown> = { file, chars: text.length };
  const before = heap();
  let t = now();
  const doc: any = CAEXDocument.loadFromString(text);
  r.load = ms(t);
  const after = heap();
  r.heapMB = before === null || after === null ? null : Math.round((after - before) / 104857.6) / 10;

  t = now();
  const ies: any[] = [...CAEXBasicObjectExtensions.descendants(doc.caexFile, InternalElementType)];
  let n = 0;
  let attrs = 0;
  let chars = 0;
  let suc = 0;
  let ifs = 0;
  for (const ie of ies) {
    n++;
    chars += (ie.name?.length ?? 0) + (ie.id?.length ?? 0);
    if (ie.systemUnitClass !== null) suc++;
    for (const a of ie.attribute) {
      attrs++;
      chars += a.value?.length ?? 0;
    }
    ifs += ie.externalInterface.count;
  }
  r.walk = ms(t);
  r.walkSum = `${n}|${attrs}|${chars}|${suc}|${ifs}`;

  t = now();
  const step = Math.max(1, Math.floor(ies.length / 200));
  let found = 0;
  for (let i = 0; i < ies.length; i += step) if (CAEXDocumentExtensions.findByID(doc, ies[i].id) !== null) found++;
  r.find = ms(t);
  r.found = found;

  t = now();
  r.savedBytes = doc.saveToStream(true).length;
  r.save = ms(t);

  t = now();
  const v = doc.validate();
  r.validate = ms(t);
  r.valid = `${v.result ? 'True' : 'False'}|${v.violationLog.length}`;

  t = now();
  const idoc: any = CAEXDocument.loadFromString(text, true);
  r.loadIndexed = ms(t);
  const ids: string[] = [...CAEXBasicObjectExtensions.descendants(idoc.caexFile, InternalElementType)].map((ie: any) => ie.id);
  t = now();
  let ifound = 0;
  for (const id of ids) if (CAEXDocumentExtensions.findByID(idoc, id) !== null) ifound++;
  r.findIndexed = ms(t);
  r.foundIndexed = ifound;
  return r;
}
