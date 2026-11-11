// Coverage package "mutations": write operations (CAEXSequence, Insert/Import, Copy, references,
// instances, mirrors, role and interface references, links, removal, external references,
// mappings), their change events and the undo/redo hooks. Runs the scripts of
// scripts/gen-mutations.mjs with the JS engine and compares every step (result, events, undo/redo
// service calls, document hash) with oracle/MutationsOracle.cs. Keep both in sync.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { implementsInterface } from '../../src/engine/interfaces.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { CaexCommand } from '../../src/engine/caex/commands/CaexCommand.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { CAEXElementFactory } from '../../src/engine/caex/extensions/CAEXElementFactory.js';
import { CAEXObjectExtensions } from '../../src/engine/caex/extensions/CAEXObjectExtensions.js';
import { CAEXBasicObjectExtensions } from '../../src/engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXFileTypeExtensions } from '../../src/engine/caex/extensions/CAEXFileTypeExtensions.js';
import { InheritanceExtensions } from '../../src/engine/caex/extensions/InheritanceExtensions.js';
import { InternalLinkTypeExtensions } from '../../src/engine/caex/extensions/InternalLinkTypeExtensions.js';
import { MappingTypeExtensions } from '../../src/engine/caex/extensions/MappingTypeExtensions.js';
import { ObjectWithExternalInterface } from '../../src/engine/caex/extensions/ObjectWithExternalInterface.js';
import { InterfaceFamilyTypeExtensions } from '../../src/engine/caex/extensions/InterfaceFamilyTypeExtensions.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { XDocument } from '../../src/xml/index.js';
import { DateTime, XmlConvert, XmlDateTimeSerializationMode } from '../../src/system/index.js';
import { oracleOut } from '../setup/oracle-out.js';

const root = join(__dirname, '..');
const scriptFile = join(root, 'mutations', 'scripts.json');
const expectedFile = join(oracleOut, 'mutations.json');

class Canonicalizer {
  private readonly map = new Map<string, string>();
  apply(text: string): string {
    const recent = (y: number, mo: number, d: number) => Math.abs(new Date(y, mo - 1, d).getTime() - new Date(new Date().toDateString()).getTime()) <= 86_400_000 * 1.05;
    text = text.replace(/(\d{2})\/(\d{2})\/(\d{4}) \d{2}:\d{2}:\d{2}/g, (m, mo, d, y) => (recent(+y, +mo, +d) ? 'NOW' : m));
    text = text.replace(/(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?/g, (m, y, mo, d) => (recent(+y, +mo, +d) ? 'NOW' : m));
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

function readAllText(path: string): string {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3));
  return new TextDecoder().decode(bytes);
}

function save(doc: any): string {
  const bytes: Uint8Array = doc.saveToStream(true);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder().decode(bytes.subarray(start));
}

function hash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').substring(0, 16).toUpperCase();
}

// ---- per script state ----------------------------------------------------------------------

let A: any = null;
let B: any = null;
const pool: any[] = [];
const events: string[] = [];
let undoService: Recorder | null = null;
let resolver: TestResolver | null = null;
/** Calls of the test services (undo/redo recorder, external reference resolver). */
const log: string[] = [];

function open(start: string): any {
  switch (start) {
    case 'new30':
      return CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
    case 'new215':
      return CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15);
    case 'newDefault':
      return CAEXDocument.new_CAEXDocument();
    default:
      return CAEXDocument.loadFromString(readAllText(join(root, 'corpus', start)));
  }
}

// ---- events --------------------------------------------------------------------------------

function docTag(d: any): string {
  return d == null ? '-' : d === A.xDocument ? 'A' : B != null && d === B.xDocument ? 'B' : 'X';
}

function cdocTag(d: any): string {
  return d == null ? 'null' : docTag(d.xDocument);
}

function senderTag(s: any): string {
  if (s == null) return 'null';
  if (s instanceof T.CAEXDocument) return 'c' + cdocTag(s);
  if (s instanceof XDocument) return 'x' + docTag(s);
  return '?';
}

function X(e: any): string {
  return e == null ? 'null' : `${e.name.localName}[${e.attribute('Name')?.value ?? ''}|${e.attribute('ID')?.value ?? ''}]${docTag(e.document)}`;
}

function V(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return '"' + v + '"';
  return 'obj';
}

function record(src: string, sender: unknown, e: any): void {
  events.push(
    `${src}${e.changeMode}|${X(e.caexElement)}|${X(e.caexParent)}|${e.caexAttributeName ?? 'null'}|${V(e.oldValue)}|${V(e.newValue)}|${e.caexAttribute?.value ?? 'null'}|${cdocTag(e.caexDocument)}|${senderTag(sender)}`,
  );
}
const staticChanging = (s: unknown, e: any) => record('S-', s, e);
const staticChanged = (s: unknown, e: any) => record('S+', s, e);

// With services of the port registered (AMLENGINE_SERVICES, test/setup/services.ts) the oracle runs
// every script in a new process (MutationsOracle.RunIsolated), so each script starts with new
// services and with the static state of a new process: state an earlier script leaves behind (the
// lookup tables, a change handler of the LookupService left paused by an exception, CaexCommand
// IsSilent and the reference update counter of XmlOperation left set by an exception in
// CreateClassInstance) must not reach the next one. As in the oracle, the services subscribe to
// the static change events before the recorder of this test.
const serviceNames = (process.env.AMLENGINE_SERVICES ?? '').split(',').map((n) => n.trim()).filter((n) => n !== '');

/**
 * Steps where the port cannot give the original's result with a service registered, from the
 * documented limitation "Reference inequality of boxed strings" (docs/deviations.md): setting an
 * attribute to the string instance it already holds is a no-op in the original (reference
 * comparison) but a change in the port, and with the LookupService registered that change modifies
 * a reference list the operation is enumerating, which throws. The test expects the port's result
 * at exactly these steps, checks that the original's result differs, and compares no further step.
 */
const SERVICE_DEVIATIONS: Array<{ service: string; script: number; step: number; port: string }> = [
  { service: 'lookup', script: 105, step: 3, port: '!InvalidOperationException' },
  { service: 'lookup', script: 428, step: 37, port: '!InvalidOperationException' },
];
let services: any = null;

function restartServices(): void {
  if (services === null) return;
  CaexCommand.isSilent = false;
  const xmlOperation = XmlOperation as any;
  xmlOperation.UpdateReferences = true;
  xmlOperation.RefCount = 0;
  xmlOperation.idMap = null;
  CaexCommand.caexElementChangingEvent.unsubscribe(staticChanging);
  CaexCommand.caexElementChangedEvent.unsubscribe(staticChanged);
  const classes: Record<string, any> = {
    lookup: services.LookupService,
    uniquename: services.UniqueNameService,
    undo: services.UndoRedoService,
    extref: services.ExternalReferenceResolver,
  };
  for (const name of serviceNames) classes[name].unRegister();
  for (const name of serviceNames) classes[name].register();
  CaexCommand.caexElementChangingEvent.subscribe(staticChanging);
  CaexCommand.caexElementChangedEvent.subscribe(staticChanged);
}
const docChanging = (s: unknown, e: any) => record('D-', s, e);
const docChanged = (s: unknown, e: any) => record('D+', s, e);

/** An undo/redo service that records every call and can undo/redo whole transactions. */
class Recorder {
  readonly log = log;
  private readonly undoStack: any[][] = [];
  private readonly redoStack: any[][] = [];
  private open: any[] | null = null;

  beginTransaction(document: any, name = '', relatedDocument: any = null): boolean {
    const started = this.open === null;
    this.log.push(`begin ${cdocTag(document)} ${name ?? ''} ${relatedDocument == null ? 'null' : cdocTag(relatedDocument)} -> ${started ? 'True' : 'False'}`);
    if (started) this.open = [];
    return started;
  }

  endTransaction(document: any): boolean {
    this.log.push(`end ${cdocTag(document)} ${this.open === null ? 'none' : String(this.open.length)}`);
    if (this.open === null) return false;
    if (this.open.length > 0) this.undoStack.push(this.open);
    this.open = null;
    this.redoStack.length = 0;
    return true;
  }

  pushCommand(cmd: any): void {
    this.log.push(`push ${cmd.constructor.name} ${cdocTag(cmd.caexDocument)} ${cmd.displayName ?? 'null'}`);
    if (this.open !== null) this.open.push(cmd);
    else {
      this.undoStack.push([cmd]);
      this.redoStack.length = 0;
    }
  }

  pause(document: any = null): void {
    this.log.push(`pause ${document == null ? 'null' : cdocTag(document)}`);
  }

  resume(document: any = null): void {
    this.log.push(`resume ${document == null ? 'null' : cdocTag(document)}`);
  }

  undo(): void {
    if (this.undoStack.length === 0) {
      this.log.push('undo none');
      return;
    }
    const t = this.undoStack.pop()!;
    this.log.push(`undo ${t.length}`);
    for (let i = t.length - 1; i >= 0; i--) t[i].unExecute();
    this.redoStack.push(t);
  }

  redo(): void {
    if (this.redoStack.length === 0) {
      this.log.push('redo none');
      return;
    }
    const t = this.redoStack.pop()!;
    this.log.push(`redo ${t.length}`);
    for (const c of t) c.execute();
    this.undoStack.push(t);
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  clearStacks(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  lastModificationDate(): DateTime {
    return DateTime.minValue;
  }

  redoActions(): Iterable<string> {
    return [];
  }

  undoActions(): Iterable<string> {
    return [];
  }
}

/**
 * An external reference resolver for tests: every element of document B is external to other
 * documents (alias "ext", path "other.aml"); "other.aml" resolves to document B.
 */
class TestResolver {
  isExternal(document: any, element: any): { result: boolean; alias: string | null; path: string | null } {
    const r = B != null && (element?.document ?? null) === B.xDocument && (document?.xDocument ?? null) !== B.xDocument;
    log.push(`isExternal ${cdocTag(document)} ${X(element)} -> ${r ? 'True' : 'False'}`);
    return { result: r, alias: r ? 'ext' : null, path: r ? 'other.aml' : null };
  }

  loadOrGetReferencedDocument(a: any, path?: string): { document: any; message: string | null } {
    if (a instanceof T.ExternalReferenceType) {
      log.push(`load ${a.alias ?? ''}|${a.path ?? ''}`);
      return a.path === 'other.aml' && B != null ? { document: B, message: '' } : { document: null, message: 'not found' };
    }
    log.push(`loadPath ${cdocTag(a)} ${path ?? ''}`);
    return path === 'other.aml' && B != null ? { document: B, message: '' } : { document: null, message: 'not found' };
  }

  setRedirection(): void {
    log.push('setRedirection');
  }

  clearRedirection(): void {
    log.push('clearRedirection');
  }

  isExternalReferenceRegistered(_e: any, path: string): boolean {
    log.push('isRegistered ' + (path ?? ''));
    return false;
  }

  registerExternalDocument(_e: any, document: any, path: string): any {
    log.push('register ' + (path ?? ''));
    return document;
  }

  resolvedDocuments(): Iterable<any> {
    log.push('resolved');
    return [];
  }

  resolveExternalDocument(url: string): { document: any; message: string | null } {
    log.push('resolve ' + (url ?? ''));
    return { document: null, message: 'not found' };
  }

  registerResolverFunction(): void {
    log.push('registerFunction');
  }

  canResolve(externalAddress: string): boolean {
    log.push('canResolve ' + (externalAddress ?? ''));
    return false;
  }

  unloadDocument(url: string): void {
    log.push('unload ' + (url ?? ''));
  }
}

// ---- picking -------------------------------------------------------------------------------

function wrappers(doc: any): any[] {
  return [...doc.xDocument.root.descendantsAndSelf()].map((e: any) => XmlOperation.createCAEXWrapper(e)).filter((w: any) => w != null);
}

function isKind(w: any, kind: string): boolean {
  switch (kind) {
    case 'wrap':
      return true;
    case 'basic':
      return w instanceof T.CAEXBasicObject;
    case 'obj':
      return w instanceof T.CAEXObject;
    case 'file':
      return w instanceof T.CAEXFileType;
    case 'ie':
      return w instanceof T.InternalElementType;
    case 'suc':
      return w instanceof T.SystemUnitFamilyType;
    case 'sucType':
      return w instanceof T.SystemUnitClassType;
    case 'rc':
      return w instanceof T.RoleFamilyType;
    case 'ic':
      return w instanceof T.InterfaceFamilyType;
    case 'at':
      return w instanceof T.AttributeFamilyType;
    case 'attr':
      return w instanceof T.AttributeType;
    case 'ei':
      return w instanceof T.ExternalInterfaceType;
    case 'il':
      return w instanceof T.InternalLinkType;
    case 'ih':
      return w instanceof T.InstanceHierarchyType;
    case 'rr':
      return w instanceof T.RoleRequirementsType;
    case 'src':
      return w instanceof T.SupportedRoleClassType;
    case 'extref':
      return w instanceof T.ExternalReferenceType;
    case 'sdi':
      return w instanceof T.SourceDocumentInformationType;
    case 'mapping':
      return w instanceof T.MappingType;
    case 'revision':
      return w instanceof T.RevisionType;
    case 'cls':
      return implementsInterface(w, 'IClassWithBaseClassReference');
    case 'eiOwner':
      return implementsInterface(w, 'IObjectWithExternalInterface');
    case 'lib':
      return implementsInterface(w, 'ICAEXLibrary');
    default:
      throw new Error('kind ' + kind);
  }
}

function pickFrom(doc: any, kind: string, index: number | undefined | null, filter?: (w: any) => boolean): any {
  if (doc == null || index === undefined || index === null) return null;
  const all = wrappers(doc).filter((w) => isKind(w, kind) && (!filter || filter(w)));
  if (all.length === 0) return null;
  return all[index % all.length];
}

/** Picks from document A; the "b" object comes from document B when the op has bd: true. */
function pickA(op: any, kind: string, key = 'a', filter?: (w: any) => boolean): any {
  return pickFrom(key === 'b' && op.bd === true ? B : A, kind, op[key], filter);
}

function val(n: any): unknown {
  if (n === null || n === undefined) return null;
  switch (n.t) {
    case 's':
      return n.v;
    case 'i':
    case 'd':
      return n.v;
    case 'b':
      return n.v;
    case 'dt':
      return XmlConvert.toDateTime(n.v, XmlDateTimeSerializationMode.RoundtripKind);
    default:
      return null;
  }
}

function tuples(op: any): [string, unknown][] {
  return op.tuples.map((t: any) => [t.n, val(t.v)]);
}

function source(spec: any, tag: string): any {
  if (spec === null || spec === undefined) return null;
  const i = spec.i;
  const byTag = (w: any) => (tag === '*' ? w instanceof T.CAEXBasicObject : (w.node?.name.localName ?? null) === tag);
  switch (spec.k) {
    case 'same':
      return pickFrom(A, 'wrap', spec.i, byTag);
    case 'other':
      return pickFrom(B, 'wrap', spec.i, byTag);
    case 'copy': {
      const w = pickFrom(A, 'wrap', spec.i, byTag);
      return w == null ? null : w.copy();
    }
    case 'pool': {
      const all = pool.filter(byTag);
      return all.length === 0 ? null : all[i % all.length];
    }
    case 'create': {
      const w = CAEXElementFactory.create(A, tag === '*' ? 'InternalElement' : tag);
      if (w != null) pool.push(w);
      return w;
    }
    default:
      return null;
  }
}

// ---- description ---------------------------------------------------------------------------

function tryStr(f: () => unknown): string {
  try {
    const v = f();
    return v === null || v === undefined ? 'null' : String(v);
  } catch (e) {
    return '!' + dotNetExceptionName(e);
  }
}

function D(o: any): string {
  if (o === null || o === undefined) return 'null';
  if (!(o instanceof T.CAEXWrapper)) return '?' + (typeof o === 'string' ? 'String' : o.constructor.name);
  const n = o.node;
  if (n == null) return 'nonode';
  const path = o instanceof T.CAEXObject ? tryStr(() => o.caexPath()) : '';
  return `${n.name.localName}|${n.attribute('Name')?.value ?? ''}|${n.attribute('ID')?.value ?? ''}|${docTag(n.document)}|${path}`;
}

function text(w: any): string {
  return w?.node == null ? 'null' : w.node.toString();
}

const B2 = (b: boolean) => (b ? 'T' : 'F');

// ---- sequences -----------------------------------------------------------------------------

const NAMED = new Set([
  'InternalElement',
  'Attribute',
  'ExternalInterface',
  'InternalLink',
  'SystemUnitClass',
  'RoleClass',
  'InterfaceClass',
  'AttributeType',
  'InstanceHierarchy',
  'SystemUnitClassLib',
  'RoleClassLib',
  'InterfaceClassLib',
  'AttributeTypeLib',
]);

function seqOf(w: any, prop: string): any {
  switch (prop) {
    case 'InternalElement':
      return w instanceof T.InstanceHierarchyType || w instanceof T.SystemUnitClassType ? w.internalElement : null;
    case 'Attribute':
      return implementsInterface(w, 'IObjectWithAttributes') ? w.attribute : null;
    case 'ExternalInterface':
      return implementsInterface(w, 'IObjectWithExternalInterface') ? w.externalInterface : null;
    case 'InternalLink':
      return w instanceof T.SystemUnitClassType ? w.internalLink : null;
    case 'SupportedRoleClass':
      return w instanceof T.SystemUnitClassType ? w.supportedRoleClass : null;
    case 'RoleRequirements':
      return w instanceof T.InternalElementType ? w.roleRequirements : null;
    case 'SystemUnitClass':
      return w instanceof T.SystemUnitClassLibType || w instanceof T.SystemUnitFamilyType ? w.systemUnitClass : null;
    case 'RoleClass':
      return w instanceof T.RoleClassLibType || w instanceof T.RoleFamilyType ? w.roleClass : null;
    case 'InterfaceClass':
      return w instanceof T.InterfaceClassLibType || w instanceof T.InterfaceFamilyType ? w.interfaceClass : null;
    case 'AttributeType':
      return w instanceof T.AttributeTypeLibType || w instanceof T.AttributeFamilyType ? w.attributeType : null;
    case 'InstanceHierarchy':
      return w instanceof T.CAEXFileType ? w.instanceHierarchy : null;
    case 'SystemUnitClassLib':
      return w instanceof T.CAEXFileType ? w.systemUnitClassLib : null;
    case 'RoleClassLib':
      return w instanceof T.CAEXFileType ? w.roleClassLib : null;
    case 'InterfaceClassLib':
      return w instanceof T.CAEXFileType ? w.interfaceClassLib : null;
    case 'AttributeTypeLib':
      return w instanceof T.CAEXFileType ? w.attributeTypeLib : null;
    case 'ExternalReference':
      return w instanceof T.CAEXFileType ? w.externalReference : null;
    case 'SourceDocumentInformation':
      return w instanceof T.CAEXFileType ? w.sourceDocumentInformation : null;
    case 'Revision':
      return w instanceof T.CAEXBasicObject ? w.revision : null;
    case 'SourceObjectInformation':
      return w instanceof T.CAEXBasicObject ? w.sourceObjectInformation : null;
    case 'Constraint':
      return w instanceof T.AttributeTypeType ? w.constraint : null;
    case 'RefSemantic':
      return w instanceof T.AttributeTypeType ? w.refSemantic : null;
    case 'AttributeNameMapping':
      return w instanceof T.MappingType ? w.attributeNameMapping : null;
    case 'InterfaceNameMapping':
      return w instanceof T.MappingType ? w.interfaceNameMapping : null;
    case 'InterfaceIDMapping':
      return w instanceof T.MappingType ? w.interfaceIDMapping : null;
    default:
      throw new Error(prop);
  }
}

function seqState(seq: any): string {
  const names: string[] = [];
  for (const x of seq) names.push(x.node.attribute('Name')?.value ?? x.node.name.localName);
  return `${seq.count}:${names.join(',')}`;
}

function applySeq(op: any): string {
  const prop = op.p;
  const owner = pickA(op, 'wrap', 'o', (w) => seqOf(w, prop) != null);
  if (owner == null) return 'none';
  const seq = seqOf(owner, prop);
  const tag: string = seq.elementName.localName;
  let r: string;
  switch (op.act) {
    case 'append':
    case 'prepend': {
      const prepend = op.act === 'prepend';
      let res: any;
      if (op.mode === 'name') {
        if (!NAMED.has(prop)) return 'unnamed';
        const name = op.name ?? null;
        res = prepend ? seq.prepend(name) : seq.append(name);
      } else if (op.mode === 'tuples') {
        const t = tuples(op);
        res = prepend ? seq.prepend(...t) : seq.append(...t);
      } else res = prepend ? seq.prepend() : seq.append();
      r = D(res) + '|' + tryStr(() => cdocTag(res.caexDocument));
      break;
    }
    case 'insert': {
      const src = source(op.src, tag);
      const res = seq.insert(src, op.asFirst, op.asIs);
      r = D(res) + '|src:' + D(src);
      break;
    }
    case 'insertAt': {
      const src = source(op.src, tag);
      const res = seq.insertAt(op.index, src);
      r = D(res) + '|src:' + D(src);
      break;
    }
    case 'move':
      seq.move(op.from, op.to);
      r = 'ok';
      break;
    case 'removeElement': {
      const item = seq.item(op.index);
      seq.removeElement(item);
      r = D(item);
      break;
    }
    case 'removeAt':
      r = B2(seq.removeAt(op.index));
      break;
    case 'removeAll':
      seq.remove();
      r = 'ok';
      break;
    case 'query': {
      const i = op.index;
      const name = op.name ?? null;
      let sb = tryStr(() => seqState(seq));
      sb += '|' + tryStr(() => B2(seq.exists));
      sb += '|' + tryStr(() => D(seq.first));
      sb += '|' + tryStr(() => D(seq.last));
      sb += '|' + tryStr(() => D(seq.item(i)));
      sb += '|' + tryStr(() => D(seq.at(i)));
      sb += '|' + tryStr(() => String(seq.indexOf(seq.item(i))));
      sb += '|' + tryStr(() => D(seq.item({ name: 'Name', value: name })));
      sb += '|' + tryStr(() => D(seq.item({ name: 'ID', value: name })));
      if (NAMED.has(prop)) {
        sb += '|' + tryStr(() => D(seq.item(name)));
        sb += '|' + tryStr(() => D(seq.item(name, op.name2 ?? null)));
      }
      seq.setItem(i, seq.item(0));
      sb += '|' + tryStr(() => seqState(seq));
      r = sb;
      break;
    }
    default:
      throw new Error(op.act);
  }
  return r + '|' + tryStr(() => seqState(seqOf(owner, prop)));
}

// ---- operations ----------------------------------------------------------------------------

const FILE_TAGS: Record<string, string> = {
  Import_InstanceHierarchy: 'InstanceHierarchy',
  ImportInstanceHierarchy: 'InstanceHierarchy',
  Insert_InstanceHierarchy: 'InstanceHierarchy',
  Import_SystemUnitClassLibHierarchy: 'SystemUnitClassLib',
  ImportSystemUnitClassLib: 'SystemUnitClassLib',
  Insert_SystemUnitClassLibHierarchy: 'SystemUnitClassLib',
  Import_RoleClassLibHierarchy: 'RoleClassLib',
  ImportRoleClassLib: 'RoleClassLib',
  Insert_RoleClassLibHierarchy: 'RoleClassLib',
  Import_InterfaceClassLibHierarchy: 'InterfaceClassLib',
  ImportInterfaceClassLib: 'InterfaceClassLib',
  Insert_InterfaceClassLibHierarchy: 'InterfaceClassLib',
};

/** C# cast `(TClass)x`: null passes, a wrong type throws InvalidCastException. */
function cast(x: any, cls: any): any {
  if (x == null || x instanceof cls) return x;
  const e = new Error('cast');
  e.name = 'InvalidCastException';
  throw e;
}

function apply(op: any): string {
  switch (op.op) {
    case 'seq':
      return applySeq(op);

    case 'boInsert': {
      const t = pickA(op, 'basic');
      if (t == null) return 'none';
      const src = source(op.src, op.tag);
      if (src == null) return 'nosrc';
      return B2(t.insert(src, op.asFirst, op.asIs)) + '|' + D(src) + '|' + D(src.caexParent);
    }
    case 'boInsertAt': {
      const t = pickA(op, 'basic');
      if (t == null) return 'none';
      const src = source(op.src, op.tag);
      if (src == null) return 'nosrc';
      return B2(t.insert(op.pos, src)) + '|' + D(src);
    }
    case 'boImport': {
      const t = pickA(op, 'basic');
      if (t == null) return 'none';
      const src = source(op.src, op.tag);
      if (src == null) return 'nosrc';
      const res = t.import(src, op.name ?? null, op.withSub);
      return D(res) + '|' + D(src);
    }
    case 'newRevision': {
      const t = pickA(op, 'basic');
      if (t == null) return 'none';
      const rev = t.new_Revision(new DateTime(2021, 3, 4, 5, 6, 7), op.author ?? null, op.asFirst);
      return D(rev) + '|' + text(rev);
    }
    case 'copy': {
      const t = pickA(op, op.k);
      if (t == null) return 'none';
      const c = t.copy(op.deep, op.ids, op.sub);
      if (c != null) pool.push(c);
      return D(c) + '|' + text(c) + '|' + tryStr(() => cdocTag(c?.caexDocument));
    }
    case 'copyNamed': {
      const t = pickA(op, 'obj');
      if (t == null) return 'none';
      const c = CAEXObjectExtensions.copy(t, op.name ?? null);
      if (c != null) pool.push(c);
      return D(c) + '|' + text(c);
    }
    case 'newGuid': {
      const t = pickA(op, 'obj');
      if (t == null) return 'none';
      t.assignNewGuidAsID(op.upd);
      return D(t);
    }
    case 'rename': {
      const t = pickA(op, 'obj');
      if (t == null) return 'none';
      t.name = op.name ?? null;
      return D(t);
    }
    case 'changeNameRefs': {
      const t = pickA(op, 'cls');
      if (!(t instanceof T.SystemUnitFamilyType || t instanceof T.RoleFamilyType || t instanceof T.InterfaceFamilyType || t instanceof T.AttributeFamilyType)) return 'none';
      InheritanceExtensions.changeNameAndReferences(t as any, op.name ?? null);
      return D(t);
    }
    case 'copyTree': {
      const t = pickA(op, 'cls');
      const p = pickA(op, 'obj', 'b');
      if (t == null || p == null) return 'none';
      if (!(t instanceof T.SystemUnitFamilyType || t instanceof T.RoleFamilyType || t instanceof T.InterfaceFamilyType || t instanceof T.AttributeFamilyType)) return D('?');
      return D(InheritanceExtensions.copyTreeAndChangeReferences(t as any, p, op.name ?? null));
    }
    case 'instantiate': {
      const t = pickA(op, op.k);
      if (t == null) return 'none';
      const target = op.target === 'A' ? A : op.target === 'B' ? B : null;
      const inst = t.createClassInstance(target);
      if (inst != null) pool.push(inst);
      return D(inst) + '|' + text(inst) + '|' + tryStr(() => cdocTag(inst?.caexDocument));
    }
    case 'instantiateNamed': {
      const t = pickA(op, op.k);
      if (t == null) return 'none';
      const inst = InheritanceExtensions.createClassInstance(t, op.name ?? null);
      if (inst != null) pool.push(inst);
      return D(inst) + '|' + text(inst);
    }
    case 'updateInstance': {
      const t = pickA(op, op.k);
      return t == null ? 'none' : B2(t.updateInstance());
    }
    case 'mirror': {
      const t = pickA(op, op.k);
      if (t == null) return 'none';
      const m = t.createMirror();
      if (m != null) pool.push(m);
      return D(m) + '|' + text(m);
    }
    case 'setMaster': {
      const t = pickA(op, op.k);
      const m = op.b < 0 ? null : pickA(op, op.k, 'b');
      if (t == null) return 'none';
      // A mirror cycle overflows the stack of the original engine (not catchable in .NET).
      for (let c = m; c != null; c = c.master) if (c.node === t.node) return 'cycle';
      t.master = m;
      return D(t) + '|' + tryStr(() => t.masterID) + '|' + tryStr(() => B2(t.isMirror)) + '|' + tryStr(() => D(t.master));
    }
    case 'createSUC': {
      const t = pickA(op, 'ie');
      if (t == null) return 'none';
      const s = t.createSystemUnitClass();
      if (s != null) pool.push(s);
      return D(s) + '|' + text(s);
    }
    case 'addRoleIE': {
      const t = pickA(op, 'ie');
      const rc = pickA(op, 'rc', 'b');
      if (t == null) return 'none';
      let res: any;
      if (op.byPath) {
        const path = op.path ?? rc?.caexPath() ?? null;
        res = t.addRoleClassReference(path, op.addUnique, op.addInstance);
      } else res = t.addRoleClassReference(rc, op.addSRC, op.addUnique, op.addInstance);
      return D(res) + '|' + text(res);
    }
    case 'addRoleSUC': {
      const t = pickA(op, 'suc');
      const rc = pickA(op, 'rc', 'b');
      if (t == null) return 'none';
      const res = op.byPath ? t.addRoleClassReference(op.path ?? rc?.caexPath() ?? null, op.addUnique) : t.addRoleClassReference(rc, op.addUnique);
      return D(res) + '|' + text(res);
    }
    case 'replaceRole': {
      const rc = pickA(op, 'rc', 'b');
      const t = pickA(op, op.k);
      let res: any;
      if (t instanceof T.InternalElementType) res = (t as any).replaceRoleClassReference(rc, op.addSRC);
      else if (t instanceof T.SystemUnitFamilyType) res = (t as any).replaceRoleClassReference(rc);
      else return 'none';
      return D(res) + '|' + text(res);
    }
    case 'hasRole': {
      const rc = pickA(op, 'rc', 'b');
      const rr = pickA(op, 'rr', 'c');
      const path = op.path ?? rc?.caexPath() ?? null;
      const t = pickA(op, op.k);
      let sb = '';
      if (t instanceof T.InternalElementType) {
        const ie: any = t;
        const suc = pickA(op, 'suc', 'c');
        sb += tryStr(() => B2(ie.hasRoleClassReference(rc, false))) + tryStr(() => B2(ie.hasRoleClassReference(rc, true)));
        sb += tryStr(() => B2(ie.hasRoleClassReference(path, false))) + tryStr(() => B2(ie.hasRoleClassReference(path, true)));
        sb += tryStr(() => B2(ie.hasGenericRoleClassReference(rc))) + tryStr(() => B2(ie.hasGenericRoleClassReference(path)));
        sb += tryStr(() => B2(ie.hasSystemUnitClassReference(suc, false))) + tryStr(() => B2(ie.hasSystemUnitClassReference(suc, true)));
      } else if (t instanceof T.SystemUnitFamilyType) {
        const s: any = t;
        sb += tryStr(() => B2(s.hasRoleClassReference(rc, false))) + tryStr(() => B2(s.hasRoleClassReference(rc, true)));
        sb += tryStr(() => B2(s.hasRoleClassReference(path, false))) + tryStr(() => B2(s.hasRoleClassReference(path, true)));
        sb += tryStr(() => B2(s.hasGenericRoleClassReference(rc))) + tryStr(() => B2(s.hasGenericRoleClassReference(rr)));
      } else if (t instanceof T.RoleRequirementsType) {
        const r: any = t;
        sb += tryStr(() => B2(r.hasRoleClassReference(rc, false))) + tryStr(() => B2(r.hasRoleClassReference(rc, true)));
      } else return 'none';
      return sb;
    }
    case 'addInterface': {
      const t = pickA(op, 'eiOwner');
      const ic = pickA(op, 'ic', 'b');
      if (t == null) return 'none';
      const name = op.name ?? null;
      const path = op.path ?? ic?.caexPath() ?? null;
      const arg = op.byPath ? path : ic;
      const res =
        t instanceof T.SystemUnitClassType
          ? (t as any).addInterfaceClassReference(arg, op.addUnique, op.addInstance, name)
          : ObjectWithExternalInterface.addInterfaceClassReference(t, arg, op.addUnique, op.addInstance, name);
      return D(res) + '|' + text(res);
    }
    case 'link': {
      const a = pickA(op, 'ei');
      const b = pickA(op, 'ei', 'b');
      if (a == null || b == null) return 'none';
      const il = T.InternalLinkType.new_InternalLink(a, b, op.name ?? null);
      return `${D(il)}|${il.refPartnerSideA ?? ''}|${il.refPartnerSideB ?? ''}|${D(il.caexParent)}`;
    }
    case 'linkSet': {
      const il = pickA(op, 'il');
      const ei = pickA(op, 'ei', 'b');
      const ie = pickA(op, 'ie', 'c');
      if (il == null) return 'none';
      const side = op.side;
      const v = op.value ?? null;
      const X = InternalLinkTypeExtensions;
      switch (op.mode) {
        case 'ref':
          if (side === 'A') il.refPartnerSideA = v;
          else il.refPartnerSideB = v;
          break;
        case 'iface':
          if (side === 'A') il.aInterface = ei;
          else il.bInterface = ei;
          break;
        case 'eiId':
          if (side === 'A') X.setRefPartnerSideAExternalInterfaceId(il, v ?? ei?.id ?? null);
          else X.setRefPartnerSideBExternalInterfaceId(il, v ?? ei?.id ?? null);
          break;
        case 'ieId':
          if (side === 'A') X.setRefPartnerSideAInternalElementId(il, v ?? ie?.id ?? null);
          else X.setRefPartnerSideBInternalElementId(il, v ?? ie?.id ?? null);
          break;
      }
      return `${il.refPartnerSideA ?? ''}|${il.refPartnerSideB ?? ''}|${tryStr(() => D(il.aInterface))}|${tryStr(() => D(il.bInterface))}|${tryStr(() => X.getRefPartnerSideAExternalInterfaceId(il))}|${tryStr(() => X.getRefPartnerSideAInternalElementId(il))}|${tryStr(() => X.getRefPartnerSideBExternalInterfaceId(il))}|${tryStr(() => X.getRefPartnerSideBInternalElementId(il))}|${tryStr(() => B2(il.isDefined))}`;
    }
    case 'insertSibling': {
      const t = pickA(op, op.k);
      const src = source(op.src, t?.node?.name.localName ?? '');
      if (t == null || src == null) return 'none';
      const before = op.before;
      const classes = [T.InternalLinkType, T.ExternalReferenceType, T.InternalElementType, T.SystemUnitFamilyType, T.RoleFamilyType, T.InterfaceFamilyType, T.AttributeType];
      const cls = classes.find((c: any) => t instanceof c);
      if (!cls) return 'unsupported';
      const s = cast(src, cls);
      if (before) t.insertBefore(s);
      else t.insertAfter(s);
      return D(src) + '|' + D(t);
    }
    case 'remove': {
      const t = pickA(op, op.k);
      if (t == null) return 'none';
      const d = D(t);
      t.remove(op.rel);
      return d + '|' + docTag(t.node?.document ?? null);
    }
    case 'extRefNew': {
      const r = CAEXFileTypeExtensions.new_ExternalReference(A.caexFile, op.path ?? null, op.alias ?? null);
      return D(r) + '|' + text(r);
    }
    case 'extRefSet': {
      const r = pickA(op, 'extref');
      if (r == null) return 'none';
      const v = op.value ?? null;
      switch (op.what) {
        case 'alias':
          r.alias = v;
          break;
        case 'path':
          r.path = v;
          break;
        case 'version':
          r.makeVersionReference(v);
          break;
        case 'extension':
          r.makeExtensionReference();
          break;
      }
      return `${r.alias ?? ''}|${r.path ?? ''}|${B2(r.isExtensionReference)}|${tryStr(() => B2(r.isVersionReference))}|${tryStr(() => B2(r.isNewVersionReference))}|${tryStr(() => B2(r.isOldVersionReference))}|${B2(r.pathAreEqual(v))}`;
    }
    case 'extRefInsert': {
      const r = source(op.src, 'ExternalReference');
      if (r == null) return 'none';
      CAEXFileTypeExtensions.insert_ExternalReference(A.caexFile, r);
      return D(r);
    }
    case 'sdiAdd': {
      const p = op.props;
      const props = new T.SourceDocumentInformationType_Properties();
      props.originName = p.OriginName ?? null;
      props.originID = p.OriginID ?? null;
      props.originVendor = p.OriginVendor ?? null;
      props.originVendorURL = p.OriginVendorURL ?? null;
      props.originVersion = p.OriginVersion ?? null;
      props.originRelease = p.OriginRelease ?? null;
      props.originProjectTitle = p.OriginProjectTitle ?? null;
      props.originProjectID = p.OriginProjectID ?? null;
      props.lastWritingDateTime = val(p.LastWritingDateTime) as DateTime;
      const s = A.caexFile.addSourceDocumentInformation(props);
      return D(s) + '|' + text(s);
    }
    case 'sdiSet': {
      const s = pickA(op, 'sdi');
      if (s == null) return 'none';
      const v = op.value ?? null;
      const prop: string = op.prop;
      if (prop === 'LastWritingDateTime') s.lastWritingDateTime = val(op.dt);
      else s[prop.charAt(0).toLowerCase() + prop.substring(1)] = v;
      return text(s);
    }
    case 'mappingNew': {
      const t = pickA(op, op.k);
      if (t == null) return 'none';
      const m = t.new_MappingObject();
      return D(m) + '|' + text(m);
    }
    case 'mappingAdd': {
      const m = pickA(op, 'mapping');
      if (m == null) return 'none';
      const x = op.x ?? null;
      const y = op.y ?? null;
      const M = MappingTypeExtensions;
      let res: any;
      switch (op.kind) {
        case 'attrName':
          res = M.new_AttributeNameMapping(m, x, y);
          break;
        case 'ifName':
          res = M.new_InterfaceNameMapping(m, x, y);
          break;
        case 'ifId':
          res = M.new_InterfaceIDMapping(m, x, y);
          break;
        default:
          res = (M.new_InterfaceIDMapping as any)(m, pickA(op, 'ei', 'b') as any, pickA(op, 'ei', 'c') as any);
      }
      return D(res) + '|' + text(res);
    }
    case 'fileImport': {
      const f = A.caexFile;
      const fn: string = op.fn;
      const tag = FILE_TAGS[fn] ?? 'AttributeTypeLib';
      const src = source(op.src, tag);
      if (src == null) return 'nosrc';
      const clsByTag: Record<string, any> = {
        InstanceHierarchy: T.InstanceHierarchyType,
        SystemUnitClassLib: T.SystemUnitClassLibType,
        RoleClassLib: T.RoleClassLibType,
        InterfaceClassLib: T.InterfaceClassLibType,
        AttributeTypeLib: T.AttributeTypeLibType,
      };
      const s = cast(src, clsByTag[tag]);
      const fx: any = CAEXFileTypeExtensions;
      const method = fn.charAt(0).toLowerCase() + fn.substring(1);
      if (typeof fx[method] !== 'function') throw Object.assign(new Error(fn), { name: 'NotSupportedException' });
      const res = fx[method](f, s);
      return (fn.startsWith('Insert_') ? 'void' : D(res)) + '|' + D(src);
    }
    case 'setXAttr': {
      const t = pickA(op, op.k);
      if (t == null) return 'none';
      t.setXAttributeValue(op.name, val(op.value));
      return D(t) + '|' + tryStr(() => t.getXAttributeValue(op.name));
    }
    case 'setBasic': {
      const t = pickA(op, 'basic');
      if (t == null) return 'none';
      const v = op.value ?? null;
      switch (op.prop) {
        case 'Description':
          t.description = v;
          break;
        case 'Version':
          t.version = v;
          break;
        case 'Copyright':
          t.copyright = v;
          break;
        case 'ChangeMode':
          t.changeMode = op.mode;
          break;
      }
      return `${t.description ?? ''}|${t.version ?? ''}|${t.copyright ?? ''}|${t.changeMode}`;
    }
    case 'newElem': {
      const t = pickA(op, 'basic');
      if (t == null) return 'none';
      const X = CAEXBasicObjectExtensions;
      const res = op.which === 'Description' ? X.new_Description(t) : op.which === 'Version' ? X.new_Version(t) : X.new_Copyright(t);
      return D(res) + '|' + text(res) + '|' + text(t);
    }
    case 'setRef': {
      const t = pickA(op, op.k);
      if (t == null) return 'none';
      const v = op.value ?? null;
      if (t instanceof T.InternalElementType) {
        const x: any = t;
        if (v !== null) x.refBaseSystemUnitPath = v;
        else x.systemUnitClass = pickA(op, 'suc', 'b');
        return x.refBaseSystemUnitPath ?? 'null';
      }
      if (t instanceof T.SystemUnitFamilyType || t instanceof T.RoleFamilyType || t instanceof T.InterfaceFamilyType || t instanceof T.AttributeFamilyType) {
        const x: any = t;
        const kind = t instanceof T.SystemUnitFamilyType ? 'suc' : t instanceof T.RoleFamilyType ? 'rc' : t instanceof T.InterfaceFamilyType ? 'ic' : 'at';
        if (v !== null) x.refBaseClassPath = v;
        else x.baseClass = pickA(op, kind, 'b');
        return x.refBaseClassPath ?? 'null';
      }
      if (t instanceof T.ExternalInterfaceType) {
        const x: any = t;
        if (v !== null) x.refBaseClassPath = v;
        else x.interfaceClass = pickA(op, 'ic', 'b');
        return x.refBaseClassPath ?? 'null';
      }
      if (t instanceof T.RoleRequirementsType) {
        const x: any = t;
        if (v !== null) x.refBaseRoleClassPath = v;
        else x.roleClass = pickA(op, 'rc', 'b');
        return x.refBaseRoleClassPath ?? 'null';
      }
      if (t instanceof T.SupportedRoleClassType) {
        const x: any = t;
        if (v !== null) x.refRoleClassPath = v;
        else x.roleClass = pickA(op, 'rc', 'b');
        return x.refRoleClassPath ?? 'null';
      }
      if (t instanceof T.AttributeType) {
        const x: any = t;
        if (v !== null) x.refAttributeType = v;
        else x.attributeTypeReference = pickA(op, 'at', 'b');
        return x.refAttributeType ?? 'null';
      }
      return 'none';
    }
    case 'insertNew': {
      const t = pickA(op, op.k);
      if (t == null) return 'none';
      let w: any = null;
      switch (op.which) {
        case 'DescriptionElement':
          w = t instanceof T.CAEXBasicObject ? (t as any).descriptionElement : null;
          break;
        case 'VersionElement':
          w = t instanceof T.CAEXBasicObject ? (t as any).versionElement : null;
          break;
        case 'CopyrightElement':
          w = t instanceof T.CAEXBasicObject ? (t as any).copyrightElement : null;
          break;
        default:
          w = t instanceof T.InternalElementType || t instanceof T.RoleRequirementsType || t instanceof T.SupportedRoleClassType ? (t as any).mappingObject : null;
      }
      if (w == null) return 'nowrapper';
      return B2(w.insertNew()) + '|' + D(w) + '|' + text(t);
    }
    case 'recreate': {
      const t = pickA(op, 'attr');
      const at = pickA(op, 'at', 'b');
      if (t == null) return 'none';
      t.recreateAttributeInstance(at);
      return text(t);
    }
    case 'createAT': {
      const t = pickA(op, 'attr');
      if (t == null) return 'none';
      const at = t.createAttributeType();
      if (at != null) pool.push(at);
      return D(at) + '|' + text(at);
    }
    case 'createSRC': {
      const t = pickA(op, 'rc');
      if (t == null) return 'none';
      const src = t.createSupportedRoleClass();
      if (src != null) pool.push(src);
      return D(src) + '|' + text(src);
    }
    case 'createICFamily': {
      const t = pickA(op, 'wrap', 'a', (w) => w instanceof T.InterfaceClassType);
      if (t == null) return 'none';
      const ic = InterfaceFamilyTypeExtensions.createInterfaceFamilyClass(t);
      if (ic != null) pool.push(ic);
      return D(ic) + '|' + text(ic);
    }
    case 'wrapperValue': {
      const t = pickA(op, 'basic');
      if (t == null) return 'none';
      const w = op.which === 'Description' ? t.descriptionElement : op.which === 'Version' ? t.versionElement : t.copyrightElement;
      w.value = op.value ?? null;
      return tryStr(() => w.value) + '|' + text(t);
    }
    case 'undo':
      if (undoService === null) return 'noservice';
      undoService.undo();
      return 'ok';
    case 'redo':
      if (undoService === null) return 'noservice';
      undoService.redo();
      return 'ok';
    case 'poolText':
      return pool.map((p) => D(p) + '|' + text(p)).join('\n');
    default:
      throw new Error('unknown op ' + op.op);
  }
}

describe.skipIf(!existsSync(expectedFile))('mutations parity with Aml.Engine', () => {
  const scripts = JSON.parse(readFileSync(scriptFile, 'utf8')) as Array<{ start: string; other: string | null; undo?: boolean; resolver?: boolean; ops: any[] }>;
  // The suite body runs even when skipped (vitest collects the tests): read only what exists.
  // `crash`: the original ended with a stack overflow at the step after the recorded ones (only with
  // services of Aml.Engine.Services registered, scripts/services-check.mjs); the port must throw
  // CyclicReferenceException there (docs/deviations.md, "Calls that do not return").
  const expected = (existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, 'utf8')) : []) as Array<{
    steps: Array<[string, string, string, string]>;
    final: string | null;
    crash?: 'stackoverflow';
  }>;

  beforeAll(async () => {
    if (serviceNames.length > 0) services = await import('../../src/services/index.js');
    CaexCommand.caexElementChangingEvent.subscribe(staticChanging);
    CaexCommand.caexElementChangedEvent.subscribe(staticChanged);
  });
  afterAll(() => {
    CaexCommand.caexElementChangingEvent.unsubscribe(staticChanging);
    CaexCommand.caexElementChangedEvent.unsubscribe(staticChanged);
  });

  scripts.forEach((script, i) => {
    it(`script ${i} (${script.start}${script.other ? ' + ' + script.other : ''}${script.undo ? ', undo' : ''}${script.resolver ? ', resolver' : ''})`, () => {
      const canon = new Canonicalizer();
      restartServices();
      pool.length = 0;
      events.length = 0;
      A = open(script.start);
      B = script.other ? open(script.other) : null;
      A.commands.caexElementChangingEvent.subscribe(docChanging);
      A.commands.caexElementChangedEvent.subscribe(docChanged);
      if (B) {
        B.commands.caexElementChangingEvent.subscribe(docChanging);
        B.commands.caexElementChangedEvent.subscribe(docChanged);
      }
      undoService = script.undo ? new Recorder() : null;
      if (undoService) ServiceLocator.register(undoService as any, 'IUndoRedo');
      resolver = script.resolver ? new TestResolver() : null;
      if (resolver) ServiceLocator.register(resolver as any, 'IExternalReferenceResolver');
      let txt = '';
      const crashAt = expected[i].crash ? expected[i].steps.length : -1;
      const deviation = SERVICE_DEVIATIONS.find((d) => d.script === i && serviceNames.includes(d.service)) ?? null;
      try {
        for (let j = 0; j < script.ops.length; j++) {
          const op = script.ops[j];
          events.length = 0;
          log.length = 0;
          let result: string;
          try {
            result = apply(op);
          } catch (e) {
            result = '!' + dotNetExceptionName(e);
          }
          if (j === crashAt) {
            expect({ step: j, op, result }).toEqual({ step: j, op, result: '!CyclicReferenceException' });
            return;
          }
          if (deviation !== null && j === deviation.step) {
            expect({ step: j, op, result }).toEqual({ step: j, op, result: deviation.port });
            expect(expected[i].steps[j][0]).not.toBe(deviation.port);
            return;
          }
          try {
            txt = save(A);
          } catch (e) {
            txt = '!' + dotNetExceptionName(e);
          }
          txt = canon.apply(txt);
          const actual = [canon.apply(result), canon.apply(events.join('\n')), canon.apply(log.join('\n')), hash(txt)];
          const exp = expected[i].steps[j];
          // MUT_DUMP=<script>:<step>:<file> writes the canonical document after that step (debugging).
          const dump = process.env.MUT_DUMP?.split(':');
          if (dump && +dump[0] === i && +dump[1] === j) writeFileSync(dump.slice(2).join(':'), txt);
          if (actual.some((a, k) => a !== exp[k])) {
            expect({ step: j, op, result: actual[0], events: actual[1].split('\n'), undo: actual[2].split('\n'), hash: actual[3] }).toEqual({
              step: j,
              op,
              result: exp[0],
              events: exp[1].split('\n'),
              undo: exp[2].split('\n'),
              hash: exp[3],
            });
          }
        }
        expect(txt).toBe(expected[i].final);
      } finally {
        if (undoService) ServiceLocator.unRegister('IUndoRedo');
        if (resolver) ServiceLocator.unRegister('IExternalReferenceResolver');
        A.commands.caexElementChangingEvent.unsubscribe(docChanging);
        A.commands.caexElementChangedEvent.unsubscribe(docChanged);
        if (B) {
          B.commands.caexElementChangingEvent.unsubscribe(docChanging);
          B.commands.caexElementChangedEvent.unsubscribe(docChanged);
        }
        A.dispose();
        B?.dispose();
        pool.length = 0;
      }
    });
  });
});
