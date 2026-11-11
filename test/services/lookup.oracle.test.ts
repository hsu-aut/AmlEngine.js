// The lookup service of the port against the original LookupService (Aml.Engine.Services 4.3.1):
// the scripts of test/services/lookup/scripts.json (scripts/gen-services-lookup.mjs) run with the
// port and are compared line by line with the output of oracle/ServicesLookupOracle.cs (command
// svc-lookup). This file is the JS twin of that class; keep both in sync.
//
// Where the original does not return (it overflows the stack, the oracle records "!stackoverflow"
// or "!hang"), the port must throw CyclicReferenceException (docs/deviations.md, "Calls that do not
// return"); a change that does not return ends its script on both sides.
//
// Debugging: LOOKUP_ONLY=<i> runs one script, LOOKUP_FULL=1 compares long results in full (the
// oracle must have been run with the same variable), LOOKUP_DUMP=1 writes the lines of the port to
// <oracle-out>/services/lookup-js/<i>.json.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { implementsInterface } from '../../src/engine/interfaces.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { Lookup } from '../../src/engine/services/EmptyLookup.js';
import { CAEXReference } from '../../src/engine/services/CAEXReference.js';
import { CAEXFileTypeExtensions } from '../../src/engine/caex/extensions/CAEXFileTypeExtensions.js';
import { MappingTypeExtensions } from '../../src/engine/caex/extensions/MappingTypeExtensions.js';
import { InheritanceExtensions } from '../../src/engine/caex/extensions/InheritanceExtensions.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { XAttribute, XElement } from '../../src/xml/index.js';
import { LookupService } from '../../src/services/LookupService.js';
import { ReferenceElement } from '../../src/services/lookup/ReferenceElement.js';
import { apply as engineApply, Canonicalizer, hash, objects, pick, readAllText, save, tryStr } from '../engine/ops-apply.js';
import { oracleOut } from '../setup/oracle-out.js';

const repo = resolve(__dirname, '..', '..');
const casesDir = join(repo, 'test', 'services', 'lookup');
const corpusDir = join(repo, 'test', 'corpus');
const expectedFile = join(oracleOut, 'services', 'lookup.json');

/** Longer results are recorded as hash and length. */
const LIMIT = 1000;
const FULL = process.env.LOOKUP_FULL !== undefined;

// --------------------------------------------------------------------------------- recording

const N = (s: string | null | undefined) => s ?? 'null';
const B = (b: boolean) => (b ? 'true' : 'false');
const isNullOrEmpty = (s: string | null | undefined) => s === null || s === undefined || s === '';
const ex = (e: unknown) => '!' + dotNetExceptionName(e);

function F(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return B(v);
  if (typeof v === 'number') return String(v);
  if (v instanceof Lookup) return LK(v);
  if (v instanceof CAEXReference || v instanceof ReferenceElement) return R(v);
  if (v instanceof T.CAEXWrapper) return D(v);
  if (typeof (v as any)[Symbol.iterator] === 'function') return '[' + [...(v as Iterable<unknown>)].map(F).join(',') + ']';
  return (v as object).constructor.name;
}

/** A wrapper: run time class, tag, Name, ID, CAEX path. */
function D(w: any): string {
  if (w === null || w === undefined) return 'null';
  if (w.node == null) return w.constructor.name + '(nonode)';
  if (w instanceof T.CAEXObject) return `${w.constructor.name}:${w.node.name.localName}|${N(w.name)}|${N(w.id)}|${tryStr(() => (w as any).caexPath())}`;
  return `${w.constructor.name}:${w.node.name.localName}`;
}

/** A reference (the value of a ReferenceElement is left out, as in the oracle). */
function R(r: any): string {
  if (r === null || r === undefined) return 'null';
  return `${r.constructor.name}(${D(r.caexObject)}.${N(r.referenceAttributeName)}=${r instanceof ReferenceElement ? '~' : N(r.referenceAttributeValue)})`;
}

function LK(lk: any): string {
  if (lk === null || lk === undefined) return 'null';
  return `${lk.count}{${[...lk].map((g: any) => N(g.key) + ':[' + [...g].map(R).join(',') + ']').join(';')}}`;
}

function XE(e: XElement | null): string {
  return e === null || e === undefined ? 'null' : `${e.name.localName}/${N(e.attribute('Name')?.value)}/${N(e.attribute('ID')?.value)}`;
}

function XA(x: unknown): string {
  if (x === null || x === undefined) return 'null';
  if (x instanceof XAttribute) return x.name.localName + '=' + x.value;
  if (x instanceof XElement) return '<' + x.name.localName + '>';
  return '?';
}

class Ctx {
  readonly lines: string[] = [];
  readonly c = new Canonicalizer();
  readonly events: string[] = [];
  stopped = false;

  constructor(private readonly expected: readonly string[]) {}

  /** One call; where the original did not return, CyclicReferenceException counts as the same result. */
  v(label: string, f: () => unknown, change = false): void {
    if (this.stopped) return;
    const cl = this.c.apply(label);
    const exp = this.expected[this.lines.length];
    const noReturn = exp === cl + '=!stackoverflow' || exp === cl + '=!hang';
    let s: string;
    try {
      s = F(f());
    } catch (e) {
      s = ex(e);
    }
    if (noReturn) {
      // the original ended here: no events; a change (or the oracle's limit of such calls per
      // script, line "end=stopped") ends the script
      this.events.length = 0;
      this.lines.push(s === '!CyclicReferenceException' ? exp : cl + '=' + s);
      if (change || this.expected[this.lines.length] === 'end=stopped') {
        this.lines.push('end=stopped');
        this.stopped = true;
      }
      return;
    }
    this.addCanon(cl, s);
    if (this.events.length > 0) {
      this.add(label + '~ev', '[' + this.events.join(',') + ']');
      this.events.length = 0;
    }
  }

  add(label: string, value: string): void {
    this.addCanon(this.c.apply(label), value);
  }

  private addCanon(label: string, value: string): void {
    value = this.c.apply(value);
    if (value.length > LIMIT && !FULL) value = '#' + hash(value) + '/' + value.length;
    this.lines.push(label + '=' + value);
  }
}

let ctx = new Ctx([]);
let svc: any = null;
let doc: any = null;
let auto = false;
let res: Resolver;
/** The instances of the script: kept until its end and disposed then, as in the oracle. */
const instances: any[] = [];

const onUpdated = (_sender: unknown, e: any): void => {
  ctx.events.push(`${XE(e.referencedElement)}|${R(e.caexReference)}|${XA(e.reference)}|${N(e.oldValue)}|${N(e.updateValue)}`);
};

// ----------------------------------------------------------------------------------- scripts

/** The external documents of alias references: the file at the path of the reference (relative to the repository). */
class Resolver {
  readonly docs = new Map<string, any>();

  private get(path: string | null | undefined): any {
    if (isNullOrEmpty(path)) return null;
    if (!this.docs.has(path!)) {
      const file = resolve(repo, path!);
      const d = existsSync(file) && statSync(file).isFile() ? CAEXDocument.loadFromString(readAllText(file)) : null;
      this.docs.set(path!, d);
    }
    return this.docs.get(path!);
  }

  loadOrGetReferencedDocument(a: any, path?: string): { document: any; message: string | null } {
    const d = a instanceof T.ExternalReferenceType ? this.get(a.path) : this.get(path);
    return { document: d, message: d === null ? 'not found' : '' };
  }

  isExternal(): { result: boolean; alias: string | null; path: string | null } {
    return { result: false, alias: null, path: null };
  }

  setRedirection(): void {}
  clearRedirection(): void {}
  isExternalReferenceRegistered(): boolean {
    return false;
  }
  registerExternalDocument(_e: any, document: any): any {
    return document;
  }
  resolvedDocuments(): Iterable<any> {
    return [];
  }
  resolveExternalDocument(): { document: any; message: string | null } {
    return { document: null, message: 'not found' };
  }
  registerResolverFunction(): void {}
  canResolve(): boolean {
    return false;
  }
  unloadDocument(): void {}
}

function open(start: string): any {
  if (start === 'new30') return CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
  if (start === 'new215') return CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15);
  if (start.startsWith('corpus:')) return CAEXDocument.loadFromString(readAllText(join(corpusDir, start.substring(7))));
  return CAEXDocument.loadFromString(readAllText(join(repo, start)));
}

function register(): void {
  svc = LookupService.register();
  instances.push(svc);
  svc.isAutoUpdateEnabled = auto;
  svc.referenceUpdated.subscribe(onUpdated);
}

interface Script {
  name: string;
  start: string;
  auto: boolean;
  ops: any[];
}

function runScript(script: Script, expected: readonly string[]): string[] {
  ctx = new Ctx(expected);
  auto = script.auto;
  res = new Resolver();
  ServiceLocator.register(res as any, 'IExternalReferenceResolver');
  register();
  doc = open(script.start);
  if (auto) doc.supportsAutoUpdate = true;
  try {
    let k = 0;
    for (const op of script.ops) {
      if (ctx.stopped) break;
      const label = `${k}:${op.op}`;
      switch (op.op) {
        case 'sweep':
          sweep(`${k}:`, op);
          break;
        case 'unregister':
          ctx.v(label, () => (LookupService.unRegister(), 'ok'), true);
          break;
        case 'register':
          ctx.v(label, () => (svc.referenceUpdated.unsubscribe(onUpdated), register(), 'ok'), true);
          break;
        case 'addDocument':
          ctx.v(label, () => (svc.addDocument(doc), 'ok'), true);
          break;
        case 'removeDocument':
          ctx.v(label, () => (svc.removeDocument(doc), 'ok'), true);
          break;
        case 'autoUpdate':
          ctx.v(
            label,
            () => {
              auto = op.value === null || op.value === undefined ? !auto : op.value;
              svc.isAutoUpdateEnabled = auto;
              return auto;
            },
            true,
          );
          break;
        case 'unload':
          unload(`${k}:`);
          break;
        default:
          ctx.v(label, () => applyOp(op), true);
          if (!ctx.stopped) ctx.add(label + '#', tryStr(() => hash(ctx.c.apply(save(doc)))));
          break;
      }
      k++;
    }
  } finally {
    svc.referenceUpdated.unsubscribe(onUpdated);
    try {
      doc.unload();
    } catch {
      // as the oracle
    }
    for (const d of res.docs.values()) d?.unload();
    for (const instance of instances) instance.dispose();
    instances.length = 0;
    LookupService.unRegister();
    ServiceLocator.unRegister('IExternalReferenceResolver');
  }
  return ctx.lines;
}

/** Unloads the document, queries it and its objects, and loads its text again. */
function unload(p: string): void {
  const text = save(doc);
  const old = doc;
  const file = old.caexFile;
  const objs = objects(old);
  const keep = sample(objs, 8, 0);
  const id = objs.map((o) => o.id).find((i) => !isNullOrEmpty(i)) ?? null;
  // C# FirstOrDefault over a Select: only the path of the first class is computed
  const firstClass = objs.find((o) => implementsInterface(o, 'IClassWithBaseClassReference'));
  const path = firstClass !== undefined ? firstClass.caexPath() : null;
  ctx.v(p + 'unload', () => (old.unload(), 'ok'), true);
  ctx.v(p + 'u:ids', () => svc.allElementsWithIDs(file));
  ctx.v(p + 'u:ident', () => svc.allElementsIdentifiedByCAEXPath(file));
  ctx.v(p + 'u:pathRefs', () => svc.allElementsWithCAEXPathReference(file));
  ctx.v(p + 'u:nameRefs', () => svc.allElementsWithNameReference(file));
  ctx.v(p + 'u:fbi', () => D(svc.findByID(old, id)));
  ctx.v(p + 'u:fbp', () => D(svc.findByPath(old, path)));
  ctx.v(p + 'u:acr', () => svc.allClassReferences(old, path));
  ctx.v(p + 'u:acrd', () => svc.allClassReferencesDeep(old, path));
  ctx.v(p + 'u:data', () => svc.allExternalDataReferences(old));
  for (const [o, i] of keep) objectQueries(`${p}u#${i}:`, o, true);
  doc = CAEXDocument.loadFromString(text);
  if (auto) doc.supportsAutoUpdate = true;
  ctx.v(p + 'reload', () => 'ok', true);
}

// ------------------------------------------------------------------------------------- sweep

/** Every count-th element (count = ceil(n / max)), starting at off modulo that step. */
function sample<X>(list: readonly X[], max: number, off: number): Array<[X, number]> {
  const r: Array<[X, number]> = [];
  if (list.length === 0 || max <= 0) return r;
  const step = Math.floor((list.length + max - 1) / max);
  for (let i = off % step; i < list.length; i += step) r.push([list[i], i]);
  return r;
}

const distinct = <X>(xs: X[]): X[] => [...new Set(xs)];

const SPECIAL_IDS: Array<string | null> = [null, '', ' ', 'no-such-id', 'dup', 'Ext@ext-ie', 'Ext@ext-ei', 'Dup@ext-ie', 'Missing@x', 'Nope@x', '@x', 'x@'];
const SPECIAL_PATHS: Array<string | null> = [
  null, '', ' ', 'No/Such/Path', 'Ext@ExtSUCL/ExtClass', 'Ext@ExtICL/ExtData', 'Ext@ExtSUCL', 'Missing@Lib/Class', 'Nope@A/B', 'SUCL/', '/SUCL',
  '[SUCL]/[Machine]', 'SUCL/Machine/Press/Press', 'SUCL/Machine/Motor', 'IH/M1', 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector',
  // classes of the external document (only alias references lead to them)
  'ExtICL/ExtInterface', 'ExtSUCL/ExtClass', 'ExtRCL/ExtRole',
];
const ELEMENT_NAMES = ['InternalElement', 'InternalLink', 'ExternalInterface', 'Attribute', 'SystemUnitClass', 'AttributeNameMapping', 'Nope'];

function sweep(p: string, op: any): void {
  const { m, n, off } = op;
  const d = doc;
  const file = d.caexFile;
  const objs = objects(d);

  ctx.v(p + 'ids', () => svc.allElementsWithIDs(file));
  ctx.v(p + 'idsVal', () => [...svc.allElementsWithIDs(file)].flatMap((g: any) => [...g]).slice(0, 4).map((r: any) => N(r.referenceAttributeValue)).join(','));
  ctx.v(p + 'reEq', () => {
    // ReferenceElement (a Tuple): Equals, GetHashCode and ToString of two lookups
    const a = [...svc.allElementsWithIDs(file)].flatMap((g: any) => [...g]).slice(0, 2);
    const b = [...svc.allElementsWithIDs(file)].flatMap((g: any) => [...g]).slice(0, 2);
    if (a.length < 2) return 'none';
    return `${B(a[0].equals(b[0]))},${B(a[0].equals(a[1]))},${B(a[0].equals(null))},${B(a[0].equals('x'))},${B(a[0].equalityKey() === b[0].equalityKey())},${a[1].item2},${hash(ctx.c.apply(a[0].toString()))}`;
  });
  ctx.v(p + 'ident', () => svc.allElementsIdentifiedByCAEXPath(file));
  ctx.v(p + 'identVal', () => {
    const lk = svc.allElementsIdentifiedByCAEXPath(file);
    return lk === null ? '' : [...lk].flatMap((g: any) => [...g]).slice(0, 4).map((r: any) => N(r.referenceAttributeValue)).join(',');
  });
  ctx.v(p + 'pathRefs', () => svc.allElementsWithCAEXPathReference(file));
  ctx.v(p + 'pathRefsSelf', () => svc.allElementsWithCAEXPathReference(file, '', true));
  ctx.v(p + 'idRefs', () => svc.allElementsWithIDReference(file));
  ctx.v(p + 'nameRefs', () => svc.allElementsWithNameReference(file));
  ctx.v(p + 'aliasRefs', () => svc.allElementsWithAliasReference(file));
  ctx.v(p + 'aliasAny', () => svc.elementsWithAliasReference(file, ''));
  ctx.v(p + 'aliasNull', () => svc.elementsWithAliasReference(file, null));
  for (const en of ELEMENT_NAMES) {
    ctx.v(p + 'pathRefs/' + en, () => svc.allElementsWithCAEXPathReference(file, en, true));
    ctx.v(p + 'idRefs/' + en, () => svc.allElementsWithIDReference(file, en));
    ctx.v(p + 'nameRefs/' + en, () => svc.allElementsWithNameReference(file, en));
    ctx.v(p + 'aliasRefs/' + en, () => svc.allElementsWithAliasReference(file, en));
    ctx.v(p + 'aliasAny/' + en, () => svc.elementsWithAliasReference(file, '', en));
  }
  ctx.v(p + 'withLinks', () => svc.allElementsWithInternalLinks(file));
  ctx.v(p + 'ieWithLinks', () => svc.allInternalElementsWithInternalLinks(file));
  ctx.v(p + 'linkRel', () => svc.elementsWithInternalLinkRelations(file));
  ctx.v(p + 'ifRel', () => svc.interfacesWithInternalLinkRelations(file));
  ctx.v(p + 'data', () => svc.allExternalDataReferences(d));
  ctx.v(p + 'dataFile', () => svc.allExternalDataReferences(d, file));
  const aliases = distinct([...[...file.externalReference].map((e: any) => e.alias ?? null), 'Nope']);
  for (const alias of aliases) {
    ctx.v(p + 'alias:' + N(alias), () => svc.elementsWithAliasReference(file, alias));
    ctx.v(p + 'alias:' + N(alias) + '/IE', () => svc.elementsWithAliasReference(file, alias, 'InternalElement'));
  }

  const points = sample(objs, n, off);
  const ids = distinct([...points.map(([o]) => o.id ?? null).filter((i) => !isNullOrEmpty(i)), ...SPECIAL_IDS]);
  for (const id of ids) {
    const l = p + 'id:' + N(id);
    ctx.v(l + '|fbi', () => D(svc.findByID(d, id)) + ';' + D(svc.findByID(d, id, false)) + ';' + D(svc.findByID(d, id, true, T.InternalElementType)));
    ctx.v(l + '|ids', () => svc.allElementsWithIDs(file, id));
    ctx.v(l + '|idRef', () => svc.elementsWithIDReference(file, id));
    ctx.v(l + '|idRefIL', () => svc.elementsWithIDReference(file, id, 'InternalLink'));
  }
  const paths = distinct([...points.map(([o]) => tryStr(() => o.caexPath())), ...SPECIAL_PATHS]);
  for (const path of paths) {
    const l = p + 'path:' + N(path);
    ctx.v(l + '|fbp', () => D(svc.findByPath(d, path)) + ';' + D(svc.findByPath(d, path, false)) + ';' + D(svc.findByPath(d, path, true, T.SystemUnitFamilyType)));
    ctx.v(l + '|pathRef', () => svc.elementsWithCAEXPathReference(file, path));
  }
  const classes = objs.filter((o) => implementsInterface(o, 'IClassWithBaseClassReference'));
  const classPaths = distinct([...sample(classes, Math.trunc(n / 3), off).map(([o]) => tryStr(() => o.caexPath())), ...SPECIAL_PATHS]);
  for (const path of classPaths) {
    const l = p + 'class:' + N(path);
    ctx.v(l + '|acr', () => svc.allClassReferences(d, path));
    ctx.v(l + '|acrTag', () => F(svc.allClassReferences(d, path, 'SystemUnitClass')) + ';' + F(svc.allClassReferences(d, path, 'InterfaceClass')) + ';' + F(svc.allClassReferences(d, path, 'Nope')));
    ctx.v(l + '|acrd', () => svc.allClassReferencesDeep(d, path));
    ctx.v(l + '|acrdTag', () => F(svc.allClassReferencesDeep(d, path, 'RoleClass')) + ';' + F(svc.allClassReferencesDeep(d, path, 'AttributeType')));
    ctx.v(l + '|pathRefIE', () => svc.elementsWithCAEXPathReference(file, path, 'InternalElement'));
  }
  const ih = [...file.instanceHierarchy][0] ?? null;
  const interfaceClasses = distinct([
    ...sample(
      objs.filter((o) => o instanceof T.InterfaceFamilyType),
      30,
      off,
    ).map(([o]) => tryStr(() => o.caexPath())),
    ...SPECIAL_PATHS.slice(1),
  ]);
  for (const path of interfaceClasses) {
    ctx.v(p + 'ofType:' + N(path), () => svc.allExternalInterfacesOfType(d, path));
    ctx.v(p + 'ofType:' + N(path) + '|IH', () => svc.allExternalInterfacesOfType(d, path, ih));
  }

  for (const [o, i] of points) objectQueries(`${p}#${i}:${o.node.name.localName}:`, o, false);
  for (const [o, i] of sample(objs, m, off + 1)) subtreeQueries(`${p}#${i}:${o.node.name.localName}:`, o);
  if (op.edges === true) edges(p + 'e:', objs);
}

function objectQueries(q: string, o: any, subtree: boolean): void {
  ctx.v(q + 'isRef', () => svc.isReferenced(o));
  ctx.v(q + 'acr', () => svc.allClassReferences(o));
  ctx.v(q + 'acrd', () => svc.allClassReferencesDeep(o));
  if (o instanceof T.InternalElementType) {
    ctx.v(q + 'ieMir', () => F(svc.internalElementMirrors(o)) + ';' + B(svc.isMaster(o)));
  } else if (o instanceof T.ExternalInterfaceType) {
    ctx.v(q + 'eiMir', () => F(svc.externalInterfaceMirrors(o)) + ';' + B(svc.isMaster(o)));
    ctx.v(q + 'linksIf', () => svc.internalLinksToInterface(o));
  } else if (o instanceof T.AttributeType) {
    ctx.v(q + 'atMir', () => F(svc.attributeMirrors(o)) + ';' + B(svc.isMaster(o)));
  }
  if (o instanceof T.SystemUnitClassType) ctx.v(q + 'linksEl', () => svc.internalLinksToElement(o));
  if (!isNullOrEmpty(o.id)) ctx.v(q + 'idRefSub', () => svc.elementsWithIDReference(o, o.id));
  if (subtree) subtreeQueries(q, o);
}

function subtreeQueries(q: string, o: any): void {
  ctx.v(q + 'ident', () => svc.allElementsIdentifiedByCAEXPath(o));
  ctx.v(q + 'ids', () => svc.allElementsWithIDs(o));
  ctx.v(q + 'idRefs', () => svc.allElementsWithIDReference(o));
  ctx.v(q + 'pathRefs', () => svc.allElementsWithCAEXPathReference(o));
  ctx.v(q + 'pathRefsSelf', () => svc.allElementsWithCAEXPathReference(o, '', true));
  ctx.v(q + 'nameRefs', () => svc.allElementsWithNameReference(o));
  ctx.v(q + 'aliasRefs', () => svc.allElementsWithAliasReference(o));
  ctx.v(q + 'aliasAny', () => svc.elementsWithAliasReference(o, ''));
  ctx.v(q + 'pathRefsIE', () => svc.allElementsWithCAEXPathReference(o, 'InternalElement', true));
  ctx.v(q + 'idRefsIL', () => svc.allElementsWithIDReference(o, 'InternalLink'));
  ctx.v(q + 'nameRefsAttr', () => svc.allElementsWithNameReference(o, 'Attribute'));
  ctx.v(q + 'aliasRefsIE', () => svc.allElementsWithAliasReference(o, 'InternalElement'));
  ctx.v(q + 'aliasAnyIE', () => svc.elementsWithAliasReference(o, '', 'InternalElement'));
  ctx.v(q + 'pathRefTo', () => svc.elementsWithCAEXPathReference(o, tryStr(() => o.caexPath())));
  ctx.v(q + 'withLinks', () => svc.allElementsWithInternalLinks(o));
  ctx.v(q + 'ieWithLinks', () => svc.allInternalElementsWithInternalLinks(o));
  ctx.v(q + 'linkRel', () => svc.elementsWithInternalLinkRelations(o));
  ctx.v(q + 'ifRel', () => svc.interfacesWithInternalLinkRelations(o));
  ctx.v(q + 'data', () => svc.allExternalDataReferences(doc, o));
}

/** Null arguments, detached objects, a document the service does not know. */
function edges(p: string, objs: any[]): void {
  const d = doc;
  const file = d.caexFile;
  ctx.v(p + 'acrNull', () => svc.allClassReferences(null));
  ctx.v(p + 'acrdNull', () => svc.allClassReferencesDeep(null));
  ctx.v(p + 'acrDocNull', () => svc.allClassReferences(null, 'x'));
  ctx.v(p + 'acrdDocNull', () => svc.allClassReferencesDeep(null, 'x'));
  ctx.v(p + 'acrPathNull', () => svc.allClassReferences(d, null));
  ctx.v(p + 'acrdPathEmpty', () => svc.allClassReferencesDeep(d, ''));
  ctx.v(p + 'acrdPathNull', () => svc.allClassReferencesDeep(d, null));
  ctx.v(p + 'identNull', () => svc.allElementsIdentifiedByCAEXPath(null));
  ctx.v(p + 'aliasRefsNull', () => svc.allElementsWithAliasReference(null));
  ctx.v(p + 'pathRefsNull', () => svc.allElementsWithCAEXPathReference(null));
  ctx.v(p + 'idRefsNull', () => svc.allElementsWithIDReference(null));
  ctx.v(p + 'idsNull', () => svc.allElementsWithIDs(null));
  ctx.v(p + 'idsIdNull', () => svc.allElementsWithIDs(file, null));
  ctx.v(p + 'withLinksNull', () => svc.allElementsWithInternalLinks(null));
  ctx.v(p + 'nameRefsNull', () => svc.allElementsWithNameReference(null));
  ctx.v(p + 'dataNull', () => svc.allExternalDataReferences(null));
  ctx.v(p + 'ofTypeDocNull', () => svc.allExternalInterfacesOfType(null, 'x'));
  ctx.v(p + 'ofTypeEmpty', () => svc.allExternalInterfacesOfType(d, ''));
  ctx.v(p + 'ofTypeNull', () => svc.allExternalInterfacesOfType(d, null));
  ctx.v(p + 'ieWithLinksNull', () => svc.allInternalElementsWithInternalLinks(null));
  ctx.v(p + 'atMirNull', () => svc.attributeMirrors(null));
  ctx.v(p + 'aliasNull', () => svc.elementsWithAliasReference(null, 'x'));
  ctx.v(p + 'pathRefNull', () => svc.elementsWithCAEXPathReference(null, 'x'));
  ctx.v(p + 'pathRefPathNull', () => svc.elementsWithCAEXPathReference(file, null));
  ctx.v(p + 'idRefNull', () => svc.elementsWithIDReference(null, 'x'));
  ctx.v(p + 'idRefIdNull', () => svc.elementsWithIDReference(file, null));
  ctx.v(p + 'linkRelNull', () => svc.elementsWithInternalLinkRelations(null));
  ctx.v(p + 'eiMirNull', () => svc.externalInterfaceMirrors(null));
  ctx.v(p + 'fbiDocNull', () => D(svc.findByID(null, 'x')));
  ctx.v(p + 'fbpDocNull', () => D(svc.findByPath(null, 'x')));
  ctx.v(p + 'ifRelNull', () => svc.interfacesWithInternalLinkRelations(null));
  ctx.v(p + 'ieMirNull', () => svc.internalElementMirrors(null));
  ctx.v(p + 'linksElNull', () => svc.internalLinksToElement(null));
  ctx.v(p + 'linksIfNull', () => svc.internalLinksToInterface(null));
  ctx.v(p + 'masterIeNull', () => svc.isMaster(null));
  ctx.v(p + 'isRefNull', () => svc.isReferenced(null));
  ctx.v(p + 'addNull', () => (svc.addDocument(null), 'ok'));
  ctx.v(p + 'removeNull', () => (svc.removeDocument(null), 'ok'));
  ctx.v(p + 'removeOther', () => {
    // unloaded at once: a live document of no script changes which document an unloaded node resolves to
    const other: any = CAEXDocument.new_CAEXDocument(d.schema);
    svc.removeDocument(other);
    other.unload();
    return 'ok';
  });
  const ie = objs.find((o) => o instanceof T.InternalElementType);
  if (ie !== undefined) {
    const c = ie.copy();
    ctx.v(p + 'detIe', () => D(c));
    objectQueries(p + 'detIe:', c, true);
  }
  const cls = objs.find((o) => implementsInterface(o, 'IClassWithBaseClassReference'));
  if (cls !== undefined) {
    const c = cls.copy();
    ctx.v(p + 'detClass', () => D(c));
    objectQueries(p + 'detClass:', c, true);
  }
}

// -------------------------------------------------------------------------------- operations

function isKind(x: any, k: string): boolean {
  switch (k) {
    case 'class':
      return implementsInterface(x, 'IClassWithBaseClassReference');
    case 'lib':
      return x instanceof T.SystemUnitClassLibType || x instanceof T.RoleClassLibType || x instanceof T.InterfaceClassLibType || x instanceof T.AttributeTypeLibType;
    case 'attr':
      return x instanceof T.AttributeType;
    case 'ei':
      return x instanceof T.ExternalInterfaceType;
    case 'ie':
      return x instanceof T.InternalElementType;
    case 'il':
      return x instanceof T.InternalLinkType;
    case 'suc':
      return x instanceof T.SystemUnitFamilyType;
    case 'rc':
      return x instanceof T.RoleFamilyType;
    case 'ic':
      return x instanceof T.InterfaceFamilyType;
    case 'at':
      return x instanceof T.AttributeFamilyType;
    case 'rr':
      return x instanceof T.RoleRequirementsType;
    case 'src':
      return x instanceof T.SupportedRoleClassType;
    case 'map':
      return x instanceof T.AttributeNameMappingType || x instanceof T.InterfaceNameMappingType;
    default:
      return false;
  }
}

/** The CAEX basic objects of the kind in document order, the one at index op[key] modulo their number. */
function pickKind(op: any, k: string, key: string): any {
  const all = [...doc.xDocument.root.descendants()].map((e: any) => XmlOperation.createCAEXWrapper(e)).filter((w: any) => w instanceof T.CAEXBasicObject && isKind(w, k));
  return all.length === 0 ? null : all[op[key] % all.length];
}

function refValue(op: any, k: string): string | null {
  switch (op.vk) {
    case 'path': {
      const target = k === 'ie' ? 'suc' : k === 'ei' || k === 'ic' ? 'ic' : k === 'suc' ? 'suc' : k === 'rc' || k === 'rr' || k === 'src' ? 'rc' : k === 'attr' || k === 'at' ? 'at' : 'ei';
      const t = pickKind(op, target, 'b');
      return t instanceof T.CAEXObject ? (t as any).caexPath() : null;
    }
    case 'id':
      return pick(doc, op, 'b', (x) => !isNullOrEmpty(x.id))?.id ?? null;
    case 'ieif': {
      const ei = pickKind(op, 'ei', 'b');
      if (ei === null) return null;
      const parent = ei.caexParent;
      return (parent instanceof T.CAEXObject ? ((parent as any).id ?? '') : '') + ':' + (ei.name ?? '');
    }
    default:
      return op.value ?? null;
  }
}

function applyOp(op: any): string {
  const d = doc;
  switch (op.op) {
    case 'renameKind': {
      const o = pickKind(op, op.k, 'a');
      if (!(o instanceof T.CAEXObject)) return 'none';
      (o as any).name = op.name ?? null;
      return D(o);
    }
    case 'removeKind': {
      if (op.k === 'ext') {
        const refs = [...d.caexFile.externalReference];
        if (refs.length === 0) return 'none';
        const r: any = refs[op.a % refs.length];
        const a = r.alias;
        r.remove();
        return N(a);
      }
      const o = pickKind(op, op.k, 'a');
      if (o === null) return 'none';
      const desc = D(o);
      (o as any).remove(op.rel);
      return desc;
    }
    case 'setID': {
      const o = pick(d, op, 'a');
      if (!o) return 'none';
      const v = op.mode === 'dup' ? (pick(d, op, 'b', (x) => !isNullOrEmpty(x.id))?.id ?? null) : (op.value ?? null);
      o.id = v;
      return D(o) + '|' + N(v);
    }
    case 'setRef': {
      const k = op.k;
      const t = pickKind(op, k, 'a');
      if (t === null) return 'none';
      const v = refValue(op, k);
      let now: string | null;
      if (t instanceof T.InternalElementType) {
        t.refBaseSystemUnitPath = v;
        now = t.refBaseSystemUnitPath;
      } else if (t instanceof T.ExternalInterfaceType || t instanceof T.SystemUnitFamilyType || t instanceof T.RoleFamilyType || t instanceof T.InterfaceFamilyType) {
        (t as any).refBaseClassPath = v;
        now = (t as any).refBaseClassPath;
      } else if (t instanceof T.AttributeTypeType) {
        (t as any).refAttributeType = v;
        now = (t as any).refAttributeType;
      } else if (t instanceof T.RoleRequirementsType) {
        (t as any).refBaseRoleClassPath = v;
        now = (t as any).refBaseRoleClassPath;
      } else if (t instanceof T.SupportedRoleClassType) {
        (t as any).refRoleClassPath = v;
        now = (t as any).refRoleClassPath;
      } else if (t instanceof T.InternalLinkType) {
        if (op.side === 'A') t.refPartnerSideA = v;
        else t.refPartnerSideB = v;
        now = (t.refPartnerSideA ?? '') + '|' + (t.refPartnerSideB ?? '');
      } else {
        return 'unsupported';
      }
      return D(t) + '|' + N(v) + '|' + N(now);
    }
    case 'insertSibling': {
      const t = pickKind(op, op.k, 'a');
      const src = pickKind(op, op.k, 'b');
      if (t === null || src === null) return 'none';
      if (op.before) t.insertBefore(src);
      else t.insertAfter(src);
      return D(src) + '|' + D(t);
    }
    case 'extRefNew': {
      const r = CAEXFileTypeExtensions.new_ExternalReference(d.caexFile, op.path ?? null, op.alias ?? null) as any;
      return D(r) + '|' + N(r?.alias) + '|' + N(r?.path);
    }
    case 'extRefSet': {
      const refs = [...d.caexFile.externalReference];
      if (refs.length === 0) return 'none';
      const r: any = refs[op.a % refs.length];
      r.alias = op.value ?? null;
      return N(r.alias) + '|' + N(r.path);
    }
    case 'attrMirror': {
      const a = pick(d, op, 'a', (x) => x instanceof T.AttributeType);
      const t = pick(d, op, 'b', (x) => implementsInterface(x, 'IObjectWithAttributes'));
      if (!a || !t) return 'none';
      const mirror = a.createMirror();
      const inserted = t.attribute.insert(mirror);
      return D(inserted) + '|' + N(mirror.refAttributeType);
    }
    case 'eiMirror': {
      const e = pick(d, op, 'a', (x) => x instanceof T.ExternalInterfaceType);
      const t = pick(d, op, 'b', (x) => implementsInterface(x, 'IObjectWithExternalInterface'));
      if (!e || !t) return 'none';
      const mirror = e.createMirror();
      const inserted = t.externalInterface.insert(mirror);
      return D(inserted) + '|' + N(mirror.refBaseClassPath);
    }
    case 'mapping': {
      const r = pickKind(op, 'rr', 'a');
      if (!(r instanceof T.RoleRequirementsType)) return 'none';
      const mo = (r as any).new_MappingObject();
      const x = op.x ?? null;
      const y = op.y ?? null;
      const M = MappingTypeExtensions as any;
      const created = op.kind === 'attrName' ? M.new_AttributeNameMapping(mo, x, y) : op.kind === 'ifName' ? M.new_InterfaceNameMapping(mo, x, y) : M.new_InterfaceIDMapping(mo, x, y);
      return D(mo) + '|' + D(created) + '|' + N(created?.node?.toString(true));
    }
    case 'refSet': {
      // ICAEXReference.SetValue on a reference of the tables (changes the document through the engine)
      const file = d.caexFile;
      const lk =
        op.src === 'path'
          ? svc.allElementsWithCAEXPathReference(file)
          : op.src === 'id'
            ? svc.allElementsWithIDReference(file)
            : op.src === 'name'
              ? svc.allElementsWithNameReference(file)
              : op.src === 'alias'
                ? svc.allElementsWithAliasReference(file)
                : svc.allElementsWithIDs(file);
      const list = [...lk].flatMap((g: any) => [...g]);
      if (list.length === 0) return 'none';
      const r: any = list[op.a % list.length];
      const before = R(r);
      r.setValue(op.value ?? null);
      return before + '|' + R(r);
    }
    case 'changeNameRefs': {
      const t = pickKind(op, 'class', 'a');
      if (!(t instanceof T.SystemUnitFamilyType || t instanceof T.RoleFamilyType || t instanceof T.InterfaceFamilyType || t instanceof T.AttributeFamilyType)) return 'none';
      InheritanceExtensions.changeNameAndReferences(t as any, op.name ?? null);
      return D(t);
    }
    case 'setNameRef': {
      const t = pickKind(op, 'map', 'a');
      const v = op.value ?? null;
      const su = op.which === 'su';
      if (t instanceof T.AttributeNameMappingType) {
        if (su) (t as any).systemUnitAttributeName = v;
        else (t as any).roleAttributeName = v;
      } else if (t instanceof T.InterfaceNameMappingType) {
        if (su) (t as any).systemUnitInterfaceName = v;
        else (t as any).roleInterfaceName = v;
      } else {
        return 'none';
      }
      return N(t.node!.toString(true));
    }
    default:
      return engineApply(d, op);
  }
}

// ------------------------------------------------------------------------------------- tests

describe.skipIf(!existsSync(expectedFile))('LookupService parity with Aml.Engine.Services', () => {
  const scripts = JSON.parse(readFileSync(join(casesDir, 'scripts.json'), 'utf8')) as Script[];
  // The suite body runs even when skipped (vitest collects the tests): read only what exists.
  const expected = (existsSync(expectedFile) ? JSON.parse(readFileSync(expectedFile, 'utf8')) : []) as string[][];
  const only = process.env.LOOKUP_ONLY;
  scripts.forEach((script, i) => {
    if (only !== undefined && Number(only) !== i) return;
    it(`script ${i} ${script.name}`, () => {
      const exp = expected[i] ?? [];
      const actual = runScript(script, exp);
      if (process.env.LOOKUP_DUMP) {
        const dir = join(oracleOut, 'services', 'lookup-js');
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${i}.json`), JSON.stringify(actual));
      }
      const diffs: Array<{ line: number; expected: string | undefined; actual: string | undefined }> = [];
      for (let j = 0; j < Math.max(actual.length, exp.length) && diffs.length < 6; j++) {
        if (actual[j] !== exp[j]) diffs.push({ line: j, expected: exp[j]?.substring(0, 700), actual: actual[j]?.substring(0, 700) });
      }
      expect({ lines: actual.length, diffs }).toEqual({ lines: exp.length, diffs: [] });
    });
  });
});
