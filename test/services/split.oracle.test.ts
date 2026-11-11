// Oracle parity for SplitService and MergeService of Aml.Engine.Services: the JS twin of
// oracle/ServicesSplitOracle.cs. Every case of test/services/split/cases.json
// (scripts/gen-services-split.mjs) runs in its own work directory (also the current directory, so
// that relative paths resolve there) and is compared with the original: per operation the result
// and a hash of all documents, at the end the documents (file path, canonical text), every file in
// the work directory and the registered services. Keep both files in sync.
// The expected outputs were written by .NET on Windows; the cases use Windows paths, so the test
// runs on Windows only (.NET on Linux is no reference, see scripts/tz-check.mjs).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { ArgumentException, dotNetExceptionName } from '../../src/system/exceptions.js';
import { SplitService } from '../../src/services/SplitService.js';
import { MergeService } from '../../src/services/MergeService.js';
import { UndoRedoService } from '../../src/services/UndoRedoService.js';
import { UniqueNameService } from '../../src/services/UniqueNameService.js';
import { LookupService } from '../../src/services/LookupService.js';
import { ExternalReferenceResolver } from '../../src/services/ExternalReferenceResolver.js';
import { CAEXSchemaTransformer } from '../../src/services/CAEXSchemaTransformer.js';
import { ValidatorService } from '../../src/services/ValidatorService.js';
import { describeObj, hash, objects, readAllText, save } from '../engine/ops-apply.js';
import { oracleOut } from '../setup/oracle-out.js';

const testDir = join(__dirname, '..');
const casesDir = resolve(testDir, 'services', 'split');
const corpusDir = resolve(testDir, 'corpus');
const oracleDir = resolve(oracleOut, 'services', 'split');
const workRoot = resolve(oracleOut, 'services', 'split-work-js');
const cases: any[] = JSON.parse(readFileSync(join(casesDir, 'cases.json'), 'utf8'));
const has = existsSync(join(oracleDir, cases[0].name + '.json'));

/** An operation names a document the case does not have (e.g. a split that failed). */
class NoDocumentException extends Error {
  override name = 'NoDocumentException';
}

class Ctx {
  readonly docs: [string, any][] = [];
  split: any = null;
  readonly merge = new MergeService();
  constructor(readonly w: string) {}

  doc(name: string | null | undefined): any {
    if (name === null || name === undefined || name === 'null') return null;
    for (const [n, d] of this.docs) if (n === name) return d;
    throw new NoDocumentException();
  }

  set(name: string, doc: any): void {
    for (let i = 0; i < this.docs.length; i++) {
      if (this.docs[i]![0] === name) {
        this.docs[i] = [name, doc];
        return;
      }
    }
    this.docs.push([name, doc]);
  }
}

function replaceAllCi(text: string, search: string, by: string): string {
  if (search === '') return text;
  const lower = text.toLowerCase();
  const s = search.toLowerCase();
  let out = '';
  let i = 0;
  for (let j = lower.indexOf(s); j >= 0; j = lower.indexOf(s, i)) {
    out += text.substring(i, j) + by;
    i = j + s.length;
  }
  return out + text.substring(i);
}

/** The canonicalizer of the oracle: work directory, timestamps of "now", GUIDs in order of appearance. */
class Canon {
  private readonly map = new Map<string, string>();
  constructor(private readonly w: string) {}
  apply(text: string): string {
    text = replaceAllCi(text, this.w, '<DIR>');
    text = replaceAllCi(text, this.w.replace(/\\/g, '/'), '<DIR>');
    const recent = (y: number, mo: number, d: number) => {
      const t = new Date(y, mo - 1, d).getTime();
      const today = new Date(new Date().toDateString()).getTime();
      return !Number.isNaN(t) && Math.abs(t - today) <= 86_400_000 * 1.05;
    };
    text = text.replace(/(\d{2})\/(\d{2})\/(\d{4}) \d{2}:\d{2}:\d{2}/g, (m, mo, d, y) => (recent(+y, +mo, +d) ? 'NOW' : m));
    text = text.replace(/(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?/g, (m, y, mo, d) => (recent(+y, +mo, +d) ? 'NOW' : m));
    return text.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, (m) => {
      const k = m.toLowerCase();
      let id = this.map.get(k);
      if (id === undefined) {
        id = 'G' + (this.map.size + 1);
        this.map.set(k, id);
      }
      return id;
    });
  }
}

function ex(e: unknown): string {
  return '!' + dotNetExceptionName(e) + (e instanceof ArgumentException && e.paramName !== null ? '(' + e.paramName + ')' : '');
}

function tryStr(f: () => unknown): string {
  try {
    const v = f();
    return v === null || v === undefined ? 'null' : String(v);
  } catch (e) {
    return ex(e);
  }
}

function docText(d: any, canon: Canon): string {
  return d === null || d === undefined ? 'null' : canon.apply(tryStr(() => save(d)));
}

function allTexts(c: Ctx, canon: Canon): string {
  let s = '';
  for (const [n, d] of c.docs) s += n + '\n' + docText(d, canon) + '\n';
  return s;
}

/** All files below the work directory: relative path with '/', UTF-8 text without BOM. */
function files(w: string): [string, string][] {
  const out: [string, string][] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push([relative(w, p).replace(/\\/g, '/'), readAllText(p)]);
    }
  };
  walk(w);
  return out.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
}

function servicesState(): string {
  return [...ServiceLocator.servicesDictionary.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => k + '=' + (v as object).constructor.name)
    .join(';');
}

function register(c: Ctx, svc: string): void {
  switch (svc) {
    case 'undo': UndoRedoService.register(); break;
    case 'uniquename': UniqueNameService.register(); break;
    case 'lookup': LookupService.register(); break;
    case 'extref': ExternalReferenceResolver.register(); break;
    case 'transform': CAEXSchemaTransformer.register(); break;
    case 'validator': ValidatorService.register(); break;
    case 'merge': MergeService.register(); break;
    case 'split': c.split = SplitService.register(); break;
    default: throw new Error('unknown service ' + svc);
  }
}

function unRegister(svc: string): void {
  switch (svc) {
    case 'undo': UndoRedoService.unRegister(); break;
    case 'uniquename': UniqueNameService.unRegister(); break;
    case 'lookup': LookupService.unRegister(); break;
    case 'extref': ExternalReferenceResolver.unRegister(); break;
    case 'transform': CAEXSchemaTransformer.unRegister(); break;
    case 'validator': ValidatorService.unRegister(); break;
    case 'merge': MergeService.unRegister(); break;
    case 'split': SplitService.unRegister(); break;
    default: throw new Error('unknown service ' + svc);
  }
}

/** Unregisters every service and removes what the unRegister methods leave behind. */
function cleanup(): void {
  for (const svc of ['split', 'merge', 'undo', 'uniquename', 'lookup', 'extref', 'transform', 'validator']) unRegister(svc);
  const dict = ServiceLocator.servicesDictionary;
  for (const key of [...dict.keys()].filter((k) => k !== 'IQuery' && k !== 'ICaexIDService')) dict.delete(key);
}

/** "<W>" is the work directory, "<W/>" the same with forward slashes. */
function path_(c: Ctx, p: string | null | undefined): string | null {
  if (p === null || p === undefined) return null;
  return p.replaceAll('<W/>', c.w.replace(/\\/g, '/')).replaceAll('<W>', c.w);
}

function loadDoc(c: Ctx, d: any): void {
  const src: string = d.src;
  const file = src.startsWith('corpus/') ? join(corpusDir, src.substring(7)) : join(casesDir, src);
  const rel: string = d.path ?? 'a\\src.aml';
  if (d.load === 'string') {
    c.set(d.name, CAEXDocument.loadFromString(readAllText(file)));
    return;
  }
  const target = join(c.w, rel);
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(file, target);
  switch (d.load) {
    case 'copy': break;
    case 'file': c.set(d.name, CAEXDocument.loadFromFile(target)); break;
    case 'fileRel': c.set(d.name, CAEXDocument.loadFromFile(rel)); break;
    case 'fileFwd': c.set(d.name, CAEXDocument.loadFromFile(target.replace(/\\/g, '/'))); break;
    default: throw new Error('unknown load ' + d.load);
  }
}

function sel(c: Ctx, op: any, key: string): any {
  const s = op[key];
  if (s === null || s === undefined) return null;
  const doc = c.doc(s.d ?? op.d);
  const kinds: Record<string, any> = {
    ATL: T.AttributeTypeLibType,
    ICL: T.InterfaceClassLibType,
    RCL: T.RoleClassLibType,
    SUCL: T.SystemUnitClassLibType,
    IH: T.InstanceHierarchyType,
    IE: T.InternalElementType,
  };
  const type = kinds[s.k];
  if (type === undefined) throw new Error('unknown kind ' + s.k);
  const all = objects(doc).filter((o) => o instanceof type);
  return all.length === 0 ? null : all[s.i % all.length];
}

function er(doc: any, e: any): any {
  const refs = [...doc.caexFile.externalReference];
  if (typeof e === 'object' && e !== null) return refs.find((x: any) => x.alias === e.alias) ?? null;
  if (e === 'none') return null;
  if (e === 'last') return refs.length > 0 ? refs[refs.length - 1] : null;
  throw new Error('unknown er ' + e);
}

function protocol(r: { result: boolean; mergeProtocol: string[] | null }): string {
  return (r.result ? 'True' : 'False') + '|' + (r.mergeProtocol === null || r.mergeProtocol === undefined ? 'null' : r.mergeProtocol.join('\n'));
}

function describeDoc(d: any): string {
  return d === null || d === undefined ? 'null' : 'doc|' + tryStr(() => d.filePath) + '|' + tryStr(() => d.caexFile.fileName);
}

function apply(c: Ctx, canon: Canon, op: any): string {
  switch (op.op) {
    case 'set': {
      const sp = sel(c, op, 's');
      if (sp === null) return 'none';
      c.split.setSplitPoint(sp);
      return 'ok';
    }
    case 'unset': {
      const sp = sel(c, op, 's');
      if (sp === null) return 'none';
      c.split.removeSplitPoint(sp);
      return 'ok';
    }
    case 'points':
      return [...c.split.splitPoints(c.doc(op.d))].map((sp) => describeObj(sp)).join(';');
    case 'pointsNull':
      return String([...c.split.splitPoints(null)].length);
    case 'split': {
      const r = c.split.split(c.doc(op.d), op.alias, path_(c, op.path));
      if (r !== null) c.set(op.as, r);
      return describeDoc(r);
    }
    case 'split1': {
      const doc = c.doc(op.d);
      const sp = op.s === null ? null : sel(c, op, 's');
      if (op.s !== null && sp === null) return 'none';
      const r = c.split.split(doc, sp, op.alias, path_(c, op.path));
      if (r !== null) c.set(op.as, r);
      return describeDoc(r);
    }
    case 'merge': {
      const doc = c.doc(op.d);
      const e = er(doc, op.er);
      if (typeof op.er === 'string' && e === null && op.er !== 'none') return 'noer';
      // the resolver would load a web address (references of corpus documents): no network in the comparison
      if (e !== null && /^(https?|ftp):\/\//i.test(e.path ?? '')) return 'network';
      return protocol(op.auto === undefined ? c.merge.merge(doc, e) : c.merge.merge(doc, e, op.auto));
    }
    case 'mergeStream': {
      const doc = c.doc(op.d);
      const e = doc === null ? null : er(doc, op.er);
      const from: string = op.from;
      let stream: Uint8Array | null;
      if (from === 'null') stream = null;
      else if (from.startsWith('text:')) stream = new TextEncoder().encode(from.substring(5));
      else if (from.startsWith('doc:')) {
        const src = c.doc(from.substring(4));
        if (src === null) return 'nodoc';
        stream = src.saveToStream(true);
      } else {
        const p = join(c.w, from.substring(5));
        if (!existsSync(p)) return 'nofile';
        stream = new Uint8Array(readFileSync(p));
      }
      return protocol(op.auto === undefined ? c.merge.merge(doc, e, stream) : c.merge.merge(doc, e, stream, op.auto));
    }
    case 'del': {
      const o = sel(c, op, 's');
      if (o === null) return 'none';
      o.remove();
      return 'ok';
    }
    case 'dispose':
      c.doc(op.d).dispose();
      return 'ok';
    case 'save':
      c.doc(op.d).saveToFile(path_(c, op.path), true);
      return 'ok';
    case 'load': {
      const d = CAEXDocument.loadFromFile(path_(c, op.path)!);
      c.set(op.as, d);
      return describeDoc(d);
    }
    case 'write':
      writeFileSync(join(c.w, op.path), op.text);
      return 'ok';
    case 'addER': {
      const e = c.doc(op.d).caexFile.externalReference.append();
      e.alias = op.alias;
      e.path = op.path;
      return 'ok';
    }
    case 'setVersion': {
      const o = sel(c, op, 's');
      if (o === null) return 'none';
      o.version = op.value;
      return 'ok';
    }
    case 'addLib': {
      const o = sel(c, op, 's');
      if (o === null) return 'none';
      const file = c.doc(op.d).caexFile;
      const seq =
        op.kind === 'ICL' ? file.interfaceClassLib : op.kind === 'RCL' ? file.roleClassLib : op.kind === 'SUCL' ? file.systemUnitClassLib : op.kind === 'ATL' ? file.attributeTypeLib : file.instanceHierarchy;
      const lib = seq.append(o.name);
      lib.version = op.version;
      return describeObj(lib);
    }
    case 'register':
      register(c, op.svc);
      return 'ok';
    case 'unregister':
      unRegister(op.svc);
      return 'ok';
    case 'svc':
      return servicesState();
    case 'autoUpdate': {
      const a = ServiceLocator.autoUpdateService;
      if (a === null) return 'nosvc';
      a.isAutoUpdateEnabled = op.value;
      return 'ok';
    }
    case 'files':
      return files(c.w)
        .map(([rel, text]) => rel + ':' + hash(canon.apply(text)))
        .join(';');
    case 'filePath':
      return tryStr(() => c.doc(op.d)?.filePath);
    case 'undoActions': {
      const u = ServiceLocator.undoRedoService;
      return u === null ? 'nosvc' : [...u.undoActions(c.doc(op.d))].join(';');
    }
    case 'undo': {
      const u = ServiceLocator.undoRedoService;
      if (u === null) return 'nosvc';
      const doc = c.doc(op.d);
      let n = 0;
      for (let i = op.n; i > 0 && u.canUndo(doc); i--, n++) u.undo(doc);
      return String(n);
    }
    default:
      throw new Error('unknown op ' + op.op);
  }
}

function runCase(cs: any): any {
  const w = join(workRoot, cs.name);
  for (const sub of ['a', 'b', 'a2']) mkdirSync(join(w, sub), { recursive: true });
  const cwd = process.cwd();
  process.chdir(w);
  const c = new Ctx(w);
  const canon = new Canon(w);
  const result: any = {};
  try {
    for (const s of cs.services) register(c, s);
    c.split = SplitService.register();
    for (const d of cs.docs) loadDoc(c, d);
    const steps: [string, string][] = [];
    for (const op of cs.ops) {
      let r: string;
      try {
        r = apply(c, canon, op);
      } catch (e) {
        r = ex(e);
      }
      r = canon.apply(r);
      steps.push([r, hash(allTexts(c, canon))]);
    }
    result.steps = steps;
    result.docs = c.docs.map(([n, d]) => [n, canon.apply(tryStr(() => d?.filePath)), docText(d, canon)]);
    result.files = files(w).map(([rel, text]) => [rel, canon.apply(text)]);
    result.services = servicesState();
  } catch (e) {
    result.error = ex(e);
  } finally {
    cleanup();
    process.chdir(cwd);
  }
  return result;
}

/** The first differing line of two texts, for a readable failure. */
function firstDiff(oracle: string, ours: string): { line: number; oracle: string | undefined; ours: string | undefined } | null {
  if (oracle === ours) return null;
  const a = oracle.split('\n');
  const b = ours.split('\n');
  for (let i = 0; ; i++) {
    if (a[i] !== b[i]) return { line: i + 1, oracle: a[i], ours: b[i] };
  }
}

function compare(expected: any, actual: any): void {
  expect(actual.error).toEqual(expected.error);
  expect(actual.steps.map((s: string[]) => s[0])).toEqual(expected.steps.map((s: string[]) => s[0]));
  for (const [i, [n, filePath, text]] of expected.docs.entries()) {
    const [an, aFilePath, aText] = actual.docs[i] ?? [];
    expect({ doc: an, filePath: aFilePath, diff: firstDiff(text, aText ?? '') }).toEqual({ doc: n, filePath, diff: null });
  }
  expect(actual.docs.length).toBe(expected.docs.length);
  expect(actual.files.map((f: string[]) => f[0])).toEqual(expected.files.map((f: string[]) => f[0]));
  for (const [i, [rel, text]] of expected.files.entries()) {
    expect({ file: rel, diff: firstDiff(text, actual.files[i][1]) }).toEqual({ file: rel, diff: null });
  }
  expect(actual.services).toBe(expected.services);
  // the step hashes cover the documents after every operation
  expect(actual.steps).toEqual(expected.steps);
}

describe.skipIf(!has || process.platform !== 'win32')('SplitService and MergeService against Aml.Engine.Services', () => {
  rmSync(workRoot, { recursive: true, force: true });
  for (const cs of cases) {
    it(cs.name, () => {
      const expected = JSON.parse(readFileSync(join(oracleDir, cs.name + '.json'), 'utf8'));
      compare(expected, runCase(cs));
    });
  }
});
