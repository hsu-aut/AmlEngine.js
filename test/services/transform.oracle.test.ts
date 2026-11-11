// Schema and edition transformation parity with Aml.Engine.Services 4.3.1: CAEXSchemaTransformer,
// the engine side of schema transformations (CAEXDocument.transformToSchema,
// finalizeSchemaTransformation, the transformation events, the import of objects of the other
// schema) and AMLEditionTransformer with a fixed IAMLLibraryService test double. The JS twin of
// oracle/ServicesTransformOracle.cs (cases: scripts/gen-services-transform.mjs). Keep both in sync.
//
// Each case is a list of "key=value" strings, documents as the hash of their canonical saved text
// (the oracle writes the text to texts/<hash>.aml, shown as a diff when the hashes differ).
//
// Documented deviation: AMLEditionTransformer.transformToEdition (synchronous) throws
// NotSupportedException where the original waits for the library catalog or the class repository
// (`.Result`); transformToEditionAsync is compared with the original everywhere, except that a
// faulted load is thrown as the error itself, where `.Result` wraps it in an AggregateException.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { registerInterfaces } from '../../src/engine/interfaces.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { CAEXObject } from '../../src/engine/caex/CAEXObject.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { AMLLibraryServerDataProfile } from '../../src/engine/services/model/AMLLibraryServerDataProfile.js';
import { AMLLibraryServerProfile } from '../../src/engine/services/model/AMLLibraryServerProfile.js';
import { ClassRepositoryEnum } from '../../src/engine/resources/catalogue/ClassRepositoryEnum.js';
import { ClassRepositoryItem } from '../../src/engine/resources/catalogue/ClassRepositoryItem.js';
import { PublicLibraryCatalog } from '../../src/engine/resources/catalogue/PublicLibraryCatalog.js';
import { AMLLibraries } from '../../src/engine/resources/libraries/AMLLibraries.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { XElement } from '../../src/xml/index.js';
import { InvalidOperationException, NotImplementedException, dotNetExceptionName } from '../../src/system/exceptions.js';
import { DateTime, XmlConvert, XmlDateTimeSerializationMode } from '../../src/system/index.js';
import { CAEXSchemaTransformer } from '../../src/services/CAEXSchemaTransformer.js';
import { LookupService } from '../../src/services/LookupService.js';
import { UndoRedoService } from '../../src/services/UndoRedoService.js';
import { AMLEditionTransformer } from '../../src/services/amltransformer/AMLEditionTransformer.js';
import { oracleOut } from '../setup/oracle-out.js';
import { hash, readAllText, save } from '../engine/ops-apply.js';

const root = join(__dirname, '..');
const casesDir = join(__dirname, 'transform');
const outDir = join(oracleOut, 'services', 'transform');
const Schema = CAEXDocument.CAEXSchema;

// ---- recording ----------------------------------------------------------------------------------

/** EngineOpsOracle.Canonicalizer with GUIDs kept on request (counting ID service). */
class Canon {
  private readonly map = new Map<string, string>();
  constructor(private readonly keepGuids: boolean) {}
  apply(text: string): string {
    const recent = (y: number, mo: number, d: number) => Math.abs(new Date(y, mo - 1, d).getTime() - new Date(new Date().toDateString()).getTime()) <= 86_400_000 * 1.05;
    text = text.replace(/(\d{2})\/(\d{2})\/(\d{4}) \d{2}:\d{2}:\d{2}/g, (m, mo, d, y) => (recent(+y, +mo, +d) ? 'NOW' : m));
    text = text.replace(/(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?/g, (m, y, mo, d) => (recent(+y, +mo, +d) ? 'NOW' : m));
    if (this.keepGuids) return text;
    return text.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, (m) => {
      const k = m.toLowerCase();
      let id = this.map.get(k);
      if (!id) {
        id = 'G' + (this.map.size + 1);
        this.map.set(k, id);
      }
      return id;
    });
  }
}

class Rec {
  readonly items: string[] = [];
  /** Canonical texts by hash, for the diff when a hash differs. */
  readonly texts = new Map<string, string>();
  private readonly c: Canon;
  constructor(keepGuids: boolean) {
    this.c = new Canon(keepGuids);
  }
  v(key: string, f: () => unknown): void {
    let v: string;
    try {
      v = F(f());
    } catch (e) {
      v = '!' + dotNetExceptionName(e);
    }
    this.items.push(key + '=' + this.c.apply(v));
  }
  async va(key: string, f: () => Promise<unknown>): Promise<void> {
    let v: string;
    try {
      v = F(await f());
    } catch (e) {
      v = '!' + dotNetExceptionName(e);
    }
    this.items.push(key + '=' + this.c.apply(v));
  }
  ev(text: string): void {
    this.items.push('ev=' + this.c.apply(text));
  }
  doc(key: string, d: any): void {
    if (d === null || d === undefined) {
      this.items.push(key + '=null');
      return;
    }
    let text: string;
    try {
      text = this.c.apply(save(d));
    } catch (e) {
      this.items.push(key + '=!' + dotNetExceptionName(e));
      return;
    }
    const h = hash(text);
    this.texts.set(h, text);
    this.items.push(key + '=#' + h);
  }
}

function F(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return B(v);
  return String(v);
}
const B = (b: boolean) => (b ? 'true' : 'false');

function schemaName(s: number): string {
  return s === Schema.CAEX2_15 ? '2.15' : s === Schema.CAEX3_0 ? '3.0' : String(s);
}
function kind(result: any, source: any): string {
  return result === null || result === undefined ? 'null' : result === source ? 'same' : 'new:' + schemaName(result.schema);
}
function load(docRef: string): any {
  const path = docRef.startsWith('corpus:') ? join(root, 'corpus', docRef.substring(7)) : join(casesDir, 'docs', docRef.substring(4));
  return CAEXDocument.loadFromString(readAllText(path));
}
const other = (s: number) => (s === Schema.CAEX2_15 ? Schema.CAEX3_0 : Schema.CAEX2_15);

/** Counting ID service: the IDs show the order and the overload of every request. */
class CountingIds {
  private n = 0;
  generateNewID(arg?: unknown): string {
    if (arg instanceof CAEXObject) return 'obj-' + ++this.n;
    if (arg instanceof XElement) return 'el-' + ++this.n;
    return 'id-' + ++this.n;
  }
}
registerInterfaces(CountingIds, 'ICaexIDService', 'IAMLService');

function autoUpdate(): string {
  const a = ServiceLocator.autoUpdateService;
  return a === null ? 'none' : B(a.isAutoUpdateEnabled);
}
function enableAutoUpdate(): void {
  const a = ServiceLocator.autoUpdateService;
  if (a !== null) a.isAutoUpdateEnabled = true;
}

/**
 * Documented deviation "Local time of old dates" (docs/deviations.md): the upgrader writes an
 * unparsable LastWritingDateTime as DateTime.MinValue in local time. Its offset comes from the
 * time zone rules: .NET on Windows applies the oldest registry rule (+01:00 in Europe/Berlin), the
 * port the IANA history through JS Date (local mean time, +00:53 in V8). The pair [original, port]
 * of that text; in a document whose hash differs, the original text is replaced by the port's
 * before the comparison (nothing else is adjusted).
 */
const minValueDeviation: Array<[string, string]> = [];

function adjust(text: string): string {
  for (const [o, p] of minValueDeviation) text = text.split(o).join(p);
  return text;
}

/** The comparison of one case: the first differing item, and the texts of differing documents. */
function compare(id: string, actual: Rec, expected: string[]): void {
  const n = Math.max(actual.items.length, expected.length);
  for (let i = 0; i < n; i++) {
    const a = actual.items[i];
    const e = expected[i];
    if (a === e) continue;
    const ah = a?.match(/=#([0-9A-F]{16})$/)?.[1];
    const eh = e?.match(/=#([0-9A-F]{16})$/)?.[1];
    const file = eh ? join(outDir, 'texts', eh + '.aml') : '';
    if (ah && eh && a.split('=#')[0] === e.split('=#')[0] && existsSync(file)) {
      const expectedText = adjust(readFileSync(file, 'utf8'));
      if (minValueDeviation.length > 0 && hash(expectedText) === ah) continue;
      expect({ id, item: i, key: a.split('=#')[0], text: actual.texts.get(ah) }).toEqual({ id, item: i, key: e.split('=#')[0], text: expectedText });
    }
    expect({ id, item: i, actual: a, context: actual.items.slice(Math.max(0, i - 3), i) }).toEqual({ id, item: i, actual: e, context: expected.slice(Math.max(0, i - 3), i) });
  }
}

// ---- CAEXSchemaTransformer ----------------------------------------------------------------------

function schemaCase(r: Rec, docRef: string, mode: string): void {
  const doc = load(docRef);
  const own = doc.schema;
  const oth = other(own);
  let undo: UndoRedoService | null = null;
  if (mode === 'ids') ServiceLocator.register(new CountingIds() as any, 'ICaexIDService');
  if (mode === 'undo') undo = UndoRedoService.register();
  if (mode === 'lookup') LookupService.register();
  const t = CAEXSchemaTransformer.register();
  if (mode === 'unregistered') CAEXSchemaTransformer.unRegister();
  let current: any = doc;
  if (mode === 'events') {
    t.transformationStarted.subscribe((s: unknown, e: any) =>
      r.ev(
        'started|' + B(s === t) + '|' + schemaName(e.targetSchema) + '|' + B(e.sourceDocument === current) + '|' +
          (e.targetDocument === null ? 'null' : schemaName(e.targetDocument.schema) + '|' + B(e.targetDocument.isTransformationActive)),
      ),
    );
    t.transformationEnded.subscribe((s: unknown, e: any) =>
      r.ev(
        'ended|' + B(s === t) + '|' + schemaName(e.targetSchema) + '|' + B(e.sourceDocument === current) + '|' +
          (e.targetDocument === null ? 'null' : B(e.targetDocument.isTransformationActive)),
      ),
    );
  }
  if (mode === 'nulltarget') {
    t.transformationStarted.subscribe((_s: unknown, e: any) => {
      r.ev('nulled|' + B(e.targetDocument !== null));
      e.targetDocument = null;
    });
  }
  try {
    if (mode === 'lookup') r.v('autoUpdateInitial', autoUpdate);
    r.doc('src', doc);
    let res: any = null;
    r.v('toOther', () => {
      res = t.transformTo(doc, oth);
      return kind(res, doc);
    });
    r.doc('result', res);
    r.doc('srcAfter', doc);
    if (mode === 'lookup') {
      r.v('autoUpdate', autoUpdate);
      enableAutoUpdate();
    }
    if (undo !== null) {
      const u = undo;
      r.v('undoState', () => B(u.canUndo(doc)) + '|' + B(u.canRedo(doc)) + (res === null ? '' : '|' + B(u.canUndo(res)) + '|' + B(u.canRedo(res))));
      if (res !== null) {
        r.v('undoProbe', () => {
          res.caexFile.instanceHierarchy.append('UndoProbe');
          return B(u.canUndo(res)) + '|' + [...u.undoActions(res)].join(',');
        });
        r.v('undoUndo', () => {
          u.undo(res);
          return B(u.canUndo(res)) + '|' + B(u.canRedo(res));
        });
        r.doc('afterUndo', res);
      }
    }
    if (res !== null && res !== doc) {
      current = res;
      let back: any = null;
      r.v('back', () => {
        back = t.transformTo(res, own);
        return kind(back, res);
      });
      r.doc('backDoc', back);
      r.doc('resultAfterBack', res);
      if (mode === 'lookup') {
        r.v('autoUpdateBack', autoUpdate);
        enableAutoUpdate();
      }
      current = doc;
    }
    r.v('own', () => kind(t.transformTo(doc, own), doc));
    r.v('unknown', () => kind(t.transformTo(doc, Schema.Unknown), doc));
    if (mode === 'lookup') {
      r.v('autoUpdateUnknown', autoUpdate);
      enableAutoUpdate();
    }
    r.v('null', () => kind(t.transformTo(null, oth), null));
  } finally {
    CAEXSchemaTransformer.unRegister();
    if (mode === 'lookup') LookupService.unRegister();
    if (mode === 'undo') UndoRedoService.unRegister();
    if (mode === 'ids') ServiceLocator.unRegister('ICaexIDService');
  }
}

// ---- engine: transformToSchema and finalizeSchemaTransformation ---------------------------------

function engineCase(r: Rec, docRef: string, mode: string): void {
  const doc = load(docRef);
  const own = doc.schema;
  const undo = mode === 'undo' ? UndoRedoService.register() : null;
  if (mode === 'transformer') CAEXSchemaTransformer.register();
  try {
    r.doc('src', doc);
    let t: any = null;
    r.v('toOther', () => {
      t = doc.transformToSchema(other(own));
      return kind(t, doc);
    });
    r.v('active', () => (t === null ? 'null' : B(t.isTransformationActive)));
    r.doc('prepared', t);
    r.doc('srcAfter', doc);
    if (undo !== null && t !== null) r.v('undoState', () => B(undo.canUndo(t)) + '|' + B(undo.canRedo(t)));
    if (t !== null) {
      r.v('finalize', () => {
        t.finalizeSchemaTransformation();
        return B(t.isTransformationActive);
      });
      r.doc('final', t);
    }
    r.v('own', () => kind(doc.transformToSchema(own), doc));
    r.v('unknown', () => kind(doc.transformToSchema(Schema.Unknown), doc));
    r.v('bad', () => kind(doc.transformToSchema(99), doc));
  } finally {
    if (mode === 'transformer') CAEXSchemaTransformer.unRegister();
    if (mode === 'undo') UndoRedoService.unRegister();
  }
}

// ---- engine: import of objects of the other schema ----------------------------------------------

function describeW(w: any): string {
  return w === null || w === undefined ? 'null' : w.node.name.toString() + '|' + (w instanceof CAEXObject ? (w.name ?? '') : '');
}

function importCase(r: Rec, fromRef: string, intoRef: string): void {
  const fromDoc = load(fromRef);
  const into = load(intoRef);
  r.doc('into', into);
  const file = into.caexFile;
  let k = 0;
  const tops = [...fromDoc.caexFile.node.elements()].map((e: any) => XmlOperation.createCAEXWrapper(e)).filter((w: any) => w instanceof CAEXObject);
  for (const lib of tops as any[]) {
    const key = 'top' + k++ + ':' + lib.node.name.localName;
    r.v(key, () => {
      const copy = lib.copy();
      return describeW(
        copy instanceof T.InstanceHierarchyType
          ? file.instanceHierarchy.insert(copy)
          : copy instanceof T.InterfaceClassLibType
            ? file.interfaceClassLib.insert(copy)
            : copy instanceof T.RoleClassLibType
              ? file.roleClassLib.insert(copy)
              : copy instanceof T.SystemUnitClassLibType
                ? file.systemUnitClassLib.insert(copy)
                : copy instanceof T.AttributeTypeLibType
                  ? file.attributeTypeLib.insert(copy)
                  : null,
      );
    });
    r.doc(key + ':doc', into);
  }
  let ie: any = null;
  for (const ih of fromDoc.caexFile.instanceHierarchy) {
    for (const x of ih.internalElement) {
      ie = x;
      break;
    }
    if (ie !== null) break;
  }
  const ihs = [...file.instanceHierarchy];
  const targetIH: any = ihs.length > 0 ? ihs[ihs.length - 1] : null;
  if (ie !== null && targetIH !== null) {
    r.v('ie', () => describeW(targetIH.internalElement.insert(ie.copy(), false)));
    r.doc('ie:doc', into);
    const ei = [...ie.externalInterface][0] ?? null;
    const targetIE = [...targetIH.internalElement][0] ?? null;
    if (ei !== null && targetIE !== null) {
      r.v('ei', () => describeW(targetIE.externalInterface.insert(ei.copy(), false)));
      r.doc('ei:doc', into);
    }
  }
  let suc: any = null;
  for (const l of fromDoc.caexFile.systemUnitClassLib) {
    for (const x of l.systemUnitClass) {
      suc = x;
      break;
    }
    if (suc !== null) break;
  }
  const libs = [...file.systemUnitClassLib];
  const targetLib: any = libs.length > 0 ? libs[libs.length - 1] : null;
  if (suc !== null && targetLib !== null) {
    r.v('suc', () => describeW(targetLib.systemUnitClass.insert(suc.copy(), false)));
    r.doc('suc:doc', into);
  }
}

// ---- AMLEditionTransformer ----------------------------------------------------------------------

/** The IAMLLibraryService test double; the oracle has the same one. */
class LibService {
  readonly serverProfile: AMLLibraryServerProfile | null = null;
  constructor(
    private readonly cfg: any,
    private readonly r: Rec,
  ) {
    if (cfg.profile === false) return;
    const p = new AMLLibraryServerProfile();
    let k = 0;
    for (const ct of cfg.admin) {
      const d = new AMLLibraryServerDataProfile(ct);
      d.folder = 'F' + k++;
      p.administrationData!.push(d);
    }
    this.serverProfile = p;
  }

  loadLibraryCatalogAsync(data: AMLLibraryServerDataProfile): Promise<PublicLibraryCatalog | null> {
    this.r.ev('loadCatalog|' + data.contentType + '|' + (data.folder ?? ''));
    switch (this.cfg.catalogMode) {
      case 'throw':
        throw new InvalidOperationException('catalog');
      case 'fault':
        return Promise.reject(new InvalidOperationException('catalog'));
    }
    const name: string | null = this.cfg.catalog ?? null;
    const catalog =
      name === null
        ? null
        : name === 'embedded'
          ? PublicLibraryCatalog.deserialize(AMLLibraries.getManifestResourceStream('Aml.Engine.Resources.Resources.AutomationMLLibs.json'))
          : PublicLibraryCatalog.deserialize(readFileSync(join(casesDir, 'catalogs', name + '.json'), 'utf8'));
    return Promise.resolve(catalog);
  }

  loadClassRepositoryAsync(data: AMLLibraryServerDataProfile, repositoryType: ClassRepositoryEnum): Promise<Repository | null> {
    this.r.ev('loadRepository|' + data.contentType + '|' + (data.folder ?? '') + '|' + repositoryType);
    if (this.cfg.repositoryMode === 'fault') return Promise.reject(new InvalidOperationException('repository'));
    const name: string | null = this.cfg.repository ?? null;
    if (name === null) return Promise.resolve(null);
    const items = (JSON.parse(readFileSync(join(casesDir, 'repositories', name + '.json'), 'utf8')) as Array<{ match: string; item: Array<string | null> }>).map(
      (i) => ({ match: i.match, item: new ClassRepositoryItem(i.item[0]!, i.item[1]!, i.item[2]!, i.item[3]!, i.item[4]!, i.item[5]!, i.item[6]!) }),
    );
    return Promise.resolve(new Repository(items, this.r));
  }

  get responseMessage(): string {
    throw new NotImplementedException();
  }
  registerServerProfileAsync(): never {
    throw new NotImplementedException();
  }
  loadAMLFileAsync(): never {
    throw new NotImplementedException();
  }
  getDocumentsAsync(): never {
    throw new NotImplementedException();
  }
  uploadAMLDocumentAsync(): never {
    throw new NotImplementedException();
  }
  getStreamAsync(): never {
    throw new NotImplementedException();
  }
  deleteAsync(): never {
    throw new NotImplementedException();
  }
  restoreAsync(): never {
    throw new NotImplementedException();
  }
  putStreamAsync(): never {
    throw new NotImplementedException();
  }
  checkDataConnection(): never {
    throw new NotImplementedException();
  }
  fileUri(): never {
    throw new NotImplementedException();
  }
  fileExistsAsync(): never {
    throw new NotImplementedException();
  }
}

/** Class repository double: searchSimilar returns the items whose match is "*" or the class name. */
class Repository {
  readonly repositoryType = ClassRepositoryEnum.AttributeTypeRepository;
  readonly fileName = 'repository';
  private algorithm = 0;
  constructor(
    private readonly items: Array<{ match: string; item: ClassRepositoryItem }>,
    private readonly r: Rec,
  ) {}
  get stringComparisonAlgorithm(): number {
    return this.algorithm;
  }
  set stringComparisonAlgorithm(value: number) {
    this.r.ev('algorithm|' + value);
    this.algorithm = value;
  }
  addClasses(): boolean {
    throw new NotImplementedException();
  }
  searchSimilar(className: string, maxCost: number): ClassRepositoryItem[] {
    this.r.ev('search|' + className + '|' + maxCost);
    return this.items.filter((i) => i.match === '*' || i.match === className).map((i) => i.item);
  }
}

interface Step {
  doc: string;
  service: string;
  edition: number;
  logger: boolean;
  ids: boolean;
  preRegistered?: boolean;
}

/** Runs the steps with transformToEditionAsync, or with transformToEdition (sync). */
async function editionScenario(r: Rec, steps: Step[], services: Record<string, any>, sync: boolean): Promise<void> {
  const tr = AMLEditionTransformer.register();
  r.v('registered', () => B(ServiceLocator.getService('IAMLEditionTransform') === tr));
  try {
    let i = 0;
    for (const st of steps) {
      const p = 's' + i++ + '.';
      const pre = st.preRegistered === true ? CAEXSchemaTransformer.register() : null;
      if (st.ids) ServiceLocator.register(new CountingIds() as any, 'ICaexIDService');
      try {
        const svc = new LibService(services[st.service], r);
        const doc = load(st.doc);
        r.doc(p + 'src', doc);
        const logger = st.logger ? (t: unknown, m: string) => r.ev('log|' + B(t === tr) + '|' + m + '|' + B(tr.isError(m))) : null;
        let res: any = null;
        if (sync) {
          r.v(p + 'transform', () => {
            res = tr.transformToEdition(svc as any, doc, st.edition, logger);
            return kind(res, doc);
          });
        } else {
          await r.va(p + 'transform', async () => {
            res = await tr.transformToEditionAsync(svc as any, doc, st.edition, logger);
            return kind(res, doc);
          });
        }
        r.doc(p + 'result', res);
        r.doc(p + 'srcAfter', doc);
        r.v(p + 'schemaTransform', () => {
          const s = ServiceLocator.getService('ISchemaTransform');
          return s === null ? 'none' : s === pre ? 'pre' : 'other';
        });
      } finally {
        CAEXSchemaTransformer.unRegister();
        if (st.ids) ServiceLocator.unRegister('ICaexIDService');
      }
    }
  } finally {
    AMLEditionTransformer.unRegister();
  }
  r.v('unregistered', () => B(ServiceLocator.getService('IAMLEditionTransform') === null));
}

function miscCase(r: Rec, isError: Array<string | null>): void {
  const tr = AMLEditionTransformer.register();
  AMLEditionTransformer.unRegister();
  let i = 0;
  for (const s of isError) r.v('isError' + i++, () => tr.isError(s as string));
  r.v('minValueLocal', () => XmlConvert.toString(DateTime.minValue, XmlDateTimeSerializationMode.Local));
  const t = CAEXSchemaTransformer.register();
  r.v('schemaRegistered', () => B(ServiceLocator.getService('ISchemaTransform') === t));
  CAEXSchemaTransformer.unRegister();
  r.v('schemaUnregistered', () => B(ServiceLocator.getService('ISchemaTransform') === null));
  r.v('unregisterTwice', () => {
    CAEXSchemaTransformer.unRegister();
    return 'ok';
  });
  // A document with the schema Unknown (no CAEXFile can be created for it).
  const u = CAEXDocument.new_CAEXDocument(Schema.Unknown);
  r.v('newUnknown', () => kind(u, null));
  r.doc('unknownDoc', u);
  const t2 = CAEXSchemaTransformer.register();
  try {
    r.v('unknownTo2.15', () => kind(t2.transformTo(u, Schema.CAEX2_15), u));
    r.v('unknownTo3.0', () => kind(t2.transformTo(u, Schema.CAEX3_0), u));
    r.v('unknownToUnknown', () => kind(t2.transformTo(u, Schema.Unknown), u));
    let p: any = null;
    r.v('unknownToSchema', () => {
      p = u.transformToSchema(Schema.CAEX2_15);
      return kind(p, u);
    });
    r.doc('unknownPrepared', p);
  } finally {
    CAEXSchemaTransformer.unRegister();
  }
}

// ---- tests --------------------------------------------------------------------------------------

type Expected = Array<{ id: string; items: string[] }>;
const read = (name: string): Expected => (existsSync(join(outDir, name)) ? JSON.parse(readFileSync(join(outDir, name), 'utf8')) : []);
const cases = JSON.parse(readFileSync(join(casesDir, 'cases.json'), 'utf8'));

function run(id: string, keepGuids: boolean, body: (r: Rec) => void): Rec {
  const r = new Rec(keepGuids);
  try {
    body(r);
  } catch (e) {
    r.items.push('!!harness=' + dotNetExceptionName(e) + ': ' + (e as Error).message);
  }
  return r;
}

describe.skipIf(!existsSync(join(outDir, 'misc.json')))('schema and edition transformation parity with Aml.Engine.Services', () => {
  const schema = read('schema.json');
  const engine = read('engine.json');
  const imports = read('imports.json');
  const edition = read('edition.json');
  const misc = read('misc.json');
  const oracleMin = misc[0]?.items.find((x) => x.startsWith('minValueLocal='))?.substring('minValueLocal='.length);
  const portMin = XmlConvert.toString(DateTime.minValue, XmlDateTimeSerializationMode.Local);
  if (oracleMin !== undefined && oracleMin !== portMin) {
    // Only the offset of year 1 may differ (local mean time against the oldest Windows rule).
    expect(oracleMin.substring(0, 19)).toBe(portMin.substring(0, 19));
    minValueDeviation.push([oracleMin, portMin]);
  }

  // One test per document: all modes of the document.
  let n = 0;
  for (const c of cases.schema as Array<{ doc: string; modes: string[] }>) {
    const start = n;
    n += c.modes.length;
    it(`CAEXSchemaTransformer ${c.doc}`, () => {
      c.modes.forEach((mode, j) => {
        const exp = schema[start + j];
        const r = run(c.doc + '|' + mode, mode === 'ids', (rec) => schemaCase(rec, c.doc, mode));
        compare(exp.id, r, exp.items);
      });
    });
  }

  let m = 0;
  for (const c of cases.engine as Array<{ doc: string; modes: string[] }>) {
    const start = m;
    m += c.modes.length;
    it(`CAEXDocument.transformToSchema ${c.doc}`, () => {
      c.modes.forEach((mode, j) => {
        const exp = engine[start + j];
        const r = run(c.doc + '|' + mode, false, (rec) => engineCase(rec, c.doc, mode));
        compare(exp.id, r, exp.items);
      });
    });
  }

  (cases.imports as Array<{ from: string; into: string }>).forEach((c, i) => {
    it(`import ${c.from} into ${c.into}`, () => {
      const r = run(c.from + '>' + c.into, false, (rec) => importCase(rec, c.from, c.into));
      compare(imports[i].id, r, imports[i].items);
    });
  });

  (cases.edition as Array<{ steps: Step[] }>).forEach((c, i) => {
    const label = c.steps.map((s) => `${s.doc} ${s.service}${s.edition !== 1 ? ' edition ' + s.edition : ''}${s.ids ? ' ids' : ''}${s.logger ? '' : ' no logger'}${s.preRegistered ? ' pre' : ''}`).join(', ');
    it(`AMLEditionTransformer ${i}: ${label}`, async () => {
      const exp = edition[i];
      const keep = c.steps[0].ids;
      // transformToEditionAsync against TransformToEdition of the original.
      const r = new Rec(keep);
      try {
        await editionScenario(r, c.steps, cases.services, false);
      } catch (e) {
        r.items.push('!!harness=' + dotNetExceptionName(e) + ': ' + (e as Error).message);
      }
      // Deviation: a faulted load (Task.FromException) is an AggregateException after `.Result`;
      // the promise of the port rejects with the error itself.
      const faulted = c.steps.some((s) => cases.services[s.service].catalogMode === 'fault' || cases.services[s.service].repositoryMode === 'fault');
      const expectedAsync = faulted ? exp.items.map((x) => x.replace(/^(s\d+\.transform)=!AggregateException$/, '$1=!InvalidOperationException')) : exp.items;
      compare(exp.id, r, expectedAsync);
      if (c.steps.length !== 1) return;
      // transformToEdition (sync): the same up to the first load, NotSupportedException there.
      const s = new Rec(keep);
      try {
        await editionScenario(s, c.steps, cases.services, true);
      } catch (e) {
        s.items.push('!!harness=' + dotNetExceptionName(e) + ': ' + (e as Error).message);
      }
      const k = exp.items.findIndex((x) => x.startsWith('ev=loadCatalog|') || x.startsWith('ev=loadRepository|'));
      if (k < 0) {
        compare(exp.id + ' (sync)', s, exp.items);
        return;
      }
      const src = exp.items.find((x) => x.startsWith('s0.src='))!;
      const expectedSync = [
        ...exp.items.slice(0, k),
        's0.transform=!NotSupportedException',
        's0.result=null',
        's0.srcAfter=' + src.substring('s0.src='.length),
        's0.schemaTransform=' + (c.steps[0].preRegistered ? 'pre' : 'none'),
        'unregistered=true',
      ];
      compare(exp.id + ' (sync)', s, expectedSync);
    });
  });

  it('isError and registration', () => {
    const r = run('misc', false, (rec) => miscCase(rec, cases.isError));
    compare(misc[0].id, r, misc[0].items.map((x) => (x.startsWith('minValueLocal=') ? adjust(x) : x)));
  });

  it('transformToEdition throws NotSupportedException with a pointer to transformToEditionAsync', () => {
    const tr = new AMLEditionTransformer();
    const r = new Rec(false);
    const doc = load('gen:ed-extrefs.aml');
    expect(() => tr.transformToEdition(new LibService(cases.services['cat-a'], r) as any, doc, 1, null)).toThrow(
      'Loading the library catalog synchronously is not possible in JavaScript; use AMLEditionTransformer.transformToEditionAsync.',
    );
    expect(() => tr.transformToEdition(new LibService(cases.services['repo-r1'], r) as any, load('gen:ed-attrs-noref.aml'), 1, null)).toThrow(
      'Loading the class repository synchronously is not possible in JavaScript; use AMLEditionTransformer.transformToEditionAsync.',
    );
    expect(ServiceLocator.getService('ISchemaTransform')).toBeNull();
  });
});
