// Coverage gap package "gapscaex": replays the scenarios of oracle/GapsCaexOracle.cs with the JS engine
// and compares every recorded result ([label, encoded value]) and every saved document text.
// See docs/coverage-notes/gapscaex.md.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { ObjectWithBaseClass } from '../../src/engine/caex/extensions/ObjectWithBaseClass.js';
import { XAttribute, XElement, XName, parseXDocument } from '../../src/xml/index.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { DateTime, DateTimeKind } from '../../src/system/DateTime.js';
import { CAEXDocumentExtensions } from '../../src/engine/caex/extensions/CAEXDocumentExtensions.js';
import { CAEXBasicObjectExtensions } from '../../src/engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXObjectExtensions } from '../../src/engine/caex/extensions/CAEXObjectExtensions.js';
import { implementsInterface } from '../../src/engine/interfaces.js';
import { InheritanceExtensions } from '../../src/engine/caex/extensions/InheritanceExtensions.js';
import { ChangeMode } from '../../src/engine/caex/ChangeMode.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { registerInterfaces } from '../../src/engine/interfaces.js';
import { XDocumentWrapper } from '../../src/engine/xml/XDocumentWrapper.js';
import { CAEXPathBuilder } from '../../src/engine/caex/extensions/CAEXPathBuilder.js';
import { ExternalInterfaceTypeExtensions } from '../../src/engine/caex/extensions/ExternalInterfaceTypeExtensions.js';
import { CAEXSequenceExtension } from '../../src/engine/caex/linq/CAEXSequenceExtension.js';
import { ObjectWithAttributes } from '../../src/engine/caex/extensions/ObjectWithAttributes.js';
import { SystemUnitClassTypeExtensions } from '../../src/engine/caex/extensions/SystemUnitClassTypeExtensions.js';
import { SemanticVersion } from '../../src/engine/resources/files/SemanticVersion.js';
import { Version } from '../../src/engine/amlobjects/internal/Version.js';
import { ClrValue } from '../../src/engine/caex/extensions/ClrValue.js';
import { AdditionalInformationExtension } from '../../src/engine/caex/extensions/AdditionalInformationExtension.js';
import { formatDouble } from '../../src/system/Number.js';
import { oracleOut } from '../setup/oracle-out.js';

const repo = resolve(__dirname, '..', '..');
const inDir = join(repo, 'test', 'gapscaex');
const outFile = join(oracleOut, 'gapscaex.json');

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// ---------------------------------------------------------------- canonicalization (EngineOpsOracle.Canonicalizer)

class Canonicalizer {
  private map = new Map<string, string>();
  apply(text: string): string {
    const recent = (y: number, mo: number, d: number) =>
      Math.abs(new Date(y, mo - 1, d).getTime() - new Date(new Date().toDateString()).getTime()) <= 86_400_000 * 1.05;
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

function decode(bytes: Uint8Array): string {
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder().decode(bytes.subarray(start));
}

// ---------------------------------------------------------------- encoding (GapsCaexOracle.Enc)

function typeName(ctor: any): string {
  let n: string = ctor?.name ?? '?';
  if (n.endsWith('_1')) n = n.substring(0, n.length - 2);
  return n;
}

function pos(e: XElement): string {
  const parts: number[] = [];
  let x: XElement = e;
  while (x.parent !== null) {
    let k = 0;
    for (const s of x.parent.elements()) {
      if (s === x) break;
      k++;
    }
    parts.push(k);
    x = x.parent;
  }
  parts.reverse();
  const prefix = x.document !== null ? '/' : '~' + x.name.localName + '/';
  return prefix + parts.join('/') + '|' + (e.attribute('Name')?.value ?? e.name.localName);
}

/** Enum value as the oracle writes it: `e:Type.Member`. */
export class En {
  constructor(
    readonly type: string,
    readonly enumObj: any,
    readonly value: number,
  ) {}
}

/** Enums whose numeric values are written by name (C# Enum.ToString). */
const enums: Record<string, Record<number, string>> = {
  ChangeMode: ChangeMode as unknown as Record<number, string>,
  CAEXSchema: CAEXDocument.CAEXSchema as unknown as Record<number, string>,
};

function enc(v: any, hint: Json = null): Json {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'number') {
    if (typeof hint === 'string' && hint.startsWith('d:')) return 'd:' + formatDouble(v);
    if (typeof hint === 'string' && hint.startsWith('e:')) {
      const type = hint.substring(2, hint.lastIndexOf('.'));
      const names = enums[type];
      if (names !== undefined) return 'e:' + type + '.' + (names[v] ?? String(v));
    }
    return v;
  }
  if (v instanceof En) return 'e:' + v.type + '.' + v.enumObj[v.value];
  if (typeof v === 'function') return 't:' + typeName(v);
  const ctorName: string = v.constructor?.name ?? '';
  if (ctorName === 'DateTime') return 'dt:' + v.toString('o') + ':' + DateTimeKind[v.kind];
  if (v instanceof XName) return 'n:' + v.toString();
  if (v instanceof XElement) return 'x:' + pos(v);
  if (v instanceof T.CAEXWrapper) return 'w:' + typeName(v.constructor) + ':' + (v.node === null ? '-' : pos(v.node));
  if (Array.isArray(v) || typeof v[Symbol.iterator] === 'function') {
    const a: Json[] = [];
    let k = 0;
    for (const x of v) a.push(enc(x, Array.isArray(hint) ? (hint[k++] ?? null) : null));
    return a;
  }
  if (Object.getPrototypeOf(v) === Object.prototype) {
    const vals = Object.values(v);
    return vals.map((x, k) => enc(x, Array.isArray(hint) ? (hint[k] ?? null) : null));
  }
  return '?' + typeName(v.constructor) + ':' + String(v);
}

// ---------------------------------------------------------------- harness (GapsCaexOracle.Ctx)

class Ctx {
  readonly items: [string, Json][] = [];
  readonly canon = new Canonicalizer();
  doc: any = null;
  private lastText: string | null = null;
  private k = 0;

  constructor(readonly expected: [string, Json][]) {}

  load(file: string): any {
    this.doc = CAEXDocument.loadFromString(decode(readFileSync(join(inDir, file))));
    return this.doc;
  }

  private canonical(n: Json): Json {
    if (n === null) return null;
    if (Array.isArray(n)) return n.map((x) => this.canonical(x));
    if (typeof n === 'string') return this.canon.apply(n);
    return n;
  }

  add(label: string, value: Json): void {
    this.items.push([label, this.canonical(value)]);
    this.k++;
  }

  private hint(): Json {
    return this.expected[this.k]?.[1] ?? null;
  }

  R(label: string, f: () => unknown): void {
    let value: Json;
    try {
      value = enc(f(), this.hint());
    } catch (e) {
      value = '!' + dotNetExceptionName(e);
    }
    this.add(label, value);
  }

  async RA(label: string, f: () => Promise<unknown>): Promise<void> {
    let value: Json;
    try {
      value = enc(await f(), this.hint());
    } catch (e) {
      value = '!' + dotNetExceptionName(e);
    }
    this.add(label, value);
  }

  V(label: string, a: () => void): void {
    this.R(label, () => {
      a();
      return 'ok';
    });
  }

  D(label = '#', doc: any = this.doc): void {
    let text: string;
    try {
      text = decode(doc.saveToStream(true));
    } catch (e) {
      text = '!' + dotNetExceptionName(e);
    }
    text = this.canon.apply(text);
    this.add(label, text === this.lastText ? '=' : text);
    this.lastText = text;
  }
}

function tupleItems(t: any): any[] {
  return Object.values(t);
}

// ---------------------------------------------------------------- scenarios

const scenarios: [string, (c: Ctx) => void | Promise<void>][] = [];
for (const file of ['mapping215.aml', 'mapping30.aml']) {
  scenarios.push(['mappingRead:' + file, (c) => mappingRead(c, file)]);
  scenarios.push(['mappingWrite:' + file, (c) => mappingWrite(c, file)]);
  scenarios.push(['roleRequirements:' + file, (c) => roleRequirements(c, file)]);
  scenarios.push(['mappingType:' + file, (c) => mappingTypeOps(c, file)]);
}
for (const file of ['revision215.aml', 'revision30.aml']) scenarios.push(['revisions:' + file, (c) => revisions(c, file)]);
scenarios.push(['culture', culture]);

function descendantsNamed(doc: any, ...names: string[]): any[] {
  const r: any[] = [];
  for (const e of doc.xDocument.root.descendants()) if (names.includes(e.name.localName)) r.push(XmlOperation.createCAEXWrapper(e));
  return r;
}

function mappings(doc: any): any[] {
  return descendantsNamed(doc, 'AttributeNameMapping', 'InterfaceNameMapping', 'InterfaceIDMapping');
}

function mappingRead(c: Ctx, file: string): void {
  const doc = c.load(file);
  let k = 0;
  for (const m of mappings(doc)) {
    const p = 'm' + k++ + '.';
    c.R(p + 'type', () => m.constructor);
    c.R(p + 'MappingObject', () => m.mappingObject);
    c.R(p + 'MappingObject.MappingRoleReference', () => m.mappingObject.mappingRoleReference);
    c.R(p + 'MappingRoleClass', () => m.mappingRoleClass);
    c.R(p + 'MappingRoleReference', () => m.mappingRoleReference);
    c.R(p + 'MappingSystemUnitClass', () => m.mappingSystemUnitClass);
    c.R(p + 'RoleClassElementIdentifier', () => m.roleClassElementIdentifier);
    c.R(p + 'SystemUnitClassElementIdentifier', () => m.systemUnitClassElementIdentifier);
    c.R(p + 'RoleClassElement', () => m.roleClassElement);
    c.R(p + 'SystemUnitClassElement', () => m.systemUnitClassElement);
    if (m instanceof T.AttributeNameMappingType) {
      c.R(p + 'RoleAttribute', () => m.roleAttribute);
      c.R(p + 'SystemUnitAttribute', () => m.systemUnitAttribute);
    } else {
      c.R(p + 'RoleInterface', () => m.roleInterface);
      c.R(p + 'SystemUnitInterface', () => m.systemUnitInterface);
    }
    c.R(p + 'SystemUnitClassMappingElements', () => m.systemUnitClassMappingElements);
    c.R(p + 'RoleClassMappingElements()', () => m.roleClassMappingElements());
    c.R(p + 'RoleClassMappingElements(true)', () => m.roleClassMappingElements(true));
    c.R(p + 'RoleClassMappingElements(false)', () => m.roleClassMappingElements(false));
  }
  c.D();
}

function mappingWrite(c: Ctx, file: string): void {
  const count = mappings(c.load(file)).length;
  for (let k = 0; k < count; k++) {
    const p = 'm' + k + '.';
    const doc = c.load(file);
    const m = mappings(doc)[k];
    const isAttr = m instanceof T.AttributeNameMappingType;

    const roleCandidates: any[] = [];
    try {
      for (const t of m.roleClassMappingElements(true)) roleCandidates.push(tupleItems(t)[0] ?? null);
    } catch (e) {
      c.add(p + 'roleCandidates', '!' + dotNetExceptionName(e));
    }
    let i = 0;
    for (const cand of roleCandidates) {
      const q = p + 'role' + i++ + '.';
      if (cand === null) {
        c.add(q + 'null', null);
        continue;
      }
      c.V(q + 'set', () => {
        m.roleClassElement = cand;
      });
      c.R(q + 'id', () => m.roleClassElementIdentifier);
      c.R(q + 'get', () => m.roleClassElement);
    }
    const suCandidates: any[] = [];
    try {
      for (const t of m.systemUnitClassMappingElements) suCandidates.push(tupleItems(t)[0] ?? null);
    } catch (e) {
      c.add(p + 'suCandidates', '!' + dotNetExceptionName(e));
    }
    i = 0;
    for (const cand of suCandidates) {
      const q = p + 'su' + i++ + '.';
      if (cand === null) {
        c.add(q + 'null', null);
        continue;
      }
      c.V(q + 'set', () => {
        m.systemUnitClassElement = cand;
      });
      c.R(q + 'id', () => m.systemUnitClassElementIdentifier);
      c.R(q + 'get', () => m.systemUnitClassElement);
    }
    if (suCandidates.length > 0 && suCandidates[0] !== null) {
      c.V(p + 'roleSetForeign', () => {
        m.roleClassElement = suCandidates[0];
      });
      c.R(p + 'roleSetForeign.id', () => m.roleClassElementIdentifier);
    }
    if (roleCandidates.length > 0 && roleCandidates[0] !== null) {
      c.V(p + 'suSetForeign', () => {
        m.systemUnitClassElement = roleCandidates[0];
      });
      c.R(p + 'suSetForeign.id', () => m.systemUnitClassElementIdentifier);
    }
    if (isAttr) {
      if (roleCandidates.length > 0)
        c.V(p + 'RoleAttribute=', () => {
          m.roleAttribute = roleCandidates[roleCandidates.length - 1];
        });
      if (suCandidates.length > 0)
        c.V(p + 'SystemUnitAttribute=', () => {
          m.systemUnitAttribute = suCandidates[suCandidates.length - 1];
        });
      c.R(p + 'RoleAttribute', () => m.roleAttribute);
      c.R(p + 'SystemUnitAttribute', () => m.systemUnitAttribute);
    } else {
      if (roleCandidates.length > 0)
        c.V(p + 'RoleInterface=', () => {
          m.roleInterface = roleCandidates[roleCandidates.length - 1];
        });
      if (suCandidates.length > 0)
        c.V(p + 'SystemUnitInterface=', () => {
          m.systemUnitInterface = suCandidates[suCandidates.length - 1];
        });
      c.R(p + 'RoleInterface', () => m.roleInterface);
      c.R(p + 'SystemUnitInterface', () => m.systemUnitInterface);
    }
    c.D(p + '#set');
    c.V(p + 'RoleClassElementIdentifier=', () => {
      m.roleClassElementIdentifier = 'r-' + k;
    });
    c.V(p + 'SystemUnitClassElementIdentifier=', () => {
      m.systemUnitClassElementIdentifier = 's-' + k;
    });
    c.R(p + 'ids', () => [m.roleClassElementIdentifier, m.systemUnitClassElementIdentifier, m.roleClassElement, m.systemUnitClassElement]);
    c.V(p + 'RoleClassElement=null', () => {
      m.roleClassElement = null;
    });
    c.V(p + 'SystemUnitClassElement=null', () => {
      m.systemUnitClassElement = null;
    });
    c.R(p + 'ids.null', () => [m.roleClassElementIdentifier, m.systemUnitClassElementIdentifier]);
    c.D(p + '#null');

    const roleObjects: any[] = [];
    for (const lib of doc.caexFile.roleClassLib)
      for (const rc of lib.roleClass) {
        if (isAttr) roleObjects.push(...ObjectWithBaseClass.getInheritedAttributesAndDescendants(rc));
        else roleObjects.push(...ObjectWithBaseClass.getInheritedInterfacesAndDescendants(rc));
      }
    i = 0;
    for (const ro of roleObjects) {
      const q = p + 'add' + i++ + '.';
      c.V(q + 'AddRoleClassElement', () => m.addRoleClassElement(ro));
      c.R(q + 'id', () => m.roleClassElementIdentifier);
      c.R(q + 'get', () => m.roleClassElement);
    }
    c.V(p + 'AddRoleClassElement(null)', () => m.addRoleClassElement(null));
    c.R(p + 'AddRoleClassElement(null).id', () => m.roleClassElementIdentifier);
    c.D(p + '#add');
  }
}

function roleRequirements(c: Ctx, file: string): void {
  const count = descendantsNamed(c.load(file), 'RoleRequirements').length;
  for (let k = 0; k < count; k++) {
    const p = 'rr' + k + '.';
    const doc = c.load(file);
    const rr = descendantsNamed(doc, 'RoleRequirements')[k];
    c.R(p + 'Class', () => rr.class);
    c.R(p + 'RoleClass', () => rr.roleClass);
    c.R(p + 'ExternalInterfaceAndDescendants', () => rr.externalInterfaceAndDescendants);
    c.R(p + 'AttributeAndDescendants', () => rr.attributeAndDescendants);
    c.R(p + 'QualifiedAttributes', () => rr.qualifiedAttributes);
    c.R(p + 'QualifiedExternalInterfaces', () => rr.qualifiedExternalInterfaces);
    c.R(p + 'QualifiedRoleClassAttributes', () => rr.qualifiedRoleClassAttributes);
    c.R(p + 'QualifiedRoleClassInterfaces', () => rr.qualifiedRoleClassInterfaces);
    c.R(p + 'UnAssignedQualifiedRoleClassAttributesOfMultipleRoles', () => rr.unAssignedQualifiedRoleClassAttributesOfMultipleRoles);
    c.R(p + 'UnAssignedQualifiedRoleClassInterfacesOfMultipleRoles', () => rr.unAssignedQualifiedRoleClassInterfacesOfMultipleRoles);
    c.R(p + 'MappingObject', () => rr.mappingObject);
    c.D(p + '#read');
    const roleClasses: any[] = [];
    for (const lib of doc.caexFile.roleClassLib) for (const rc of lib.roleClass) roleClasses.push(rc);
    const attributes = [...roleClasses.flatMap((r) => ObjectWithBaseClass.getInheritedAttributesAndDescendants(r)), ...rr.attribute];
    const interfaces = [...roleClasses.flatMap((r) => ObjectWithBaseClass.getInheritedInterfacesAndDescendants(r)), ...rr.externalInterface];
    let i = 0;
    for (const a of attributes) {
      const q = p + 'a' + i++ + '.';
      c.R(q + 'IsAssignable', () => rr.isAssignableRoleClassAttribute(a));
      c.R(q + 'Assign', () => rr.assignQualifiedRoleClassAttribute(a));
    }
    c.R(p + 'AssignAttribute(null)', () => rr.assignQualifiedRoleClassAttribute(null));
    c.R(p + 'IsAssignableAttribute(null)', () => rr.isAssignableRoleClassAttribute(null));
    i = 0;
    for (const e of interfaces) {
      const q = p + 'i' + i++ + '.';
      c.R(q + 'IsAssignable', () => rr.isAssignableRoleClassInterface(e));
      c.R(q + 'Assign', () => rr.assignQualifiedRoleClassInterface(e));
    }
    c.R(p + 'AssignInterface(null)', () => rr.assignQualifiedRoleClassInterface(null));
    c.R(p + 'IsAssignableInterface(null)', () => rr.isAssignableRoleClassInterface(null));
    c.D(p + '#assign');
    c.R(p + 'QualifiedRoleClassAttributes.after', () => rr.qualifiedRoleClassAttributes);
    c.R(p + 'QualifiedRoleClassInterfaces.after', () => rr.qualifiedRoleClassInterfaces);
    c.R(p + 'UnAssignedAttributes.after', () => rr.unAssignedQualifiedRoleClassAttributesOfMultipleRoles);
    c.R(p + 'UnAssignedInterfaces.after', () => rr.unAssignedQualifiedRoleClassInterfacesOfMultipleRoles);
    for (const m of rr.mappingObject.attributeNameMapping) c.R(p + 'attrMapping.' + m.roleAttributeName, () => m.roleClassMappingElements());
    for (const m of rr.mappingObject.interfaceNameMapping) c.R(p + 'ifMapping.' + m.roleInterfaceName, () => m.roleClassMappingElements());
    c.V(p + 'Class=R2', () => {
      rr.class = roleClasses.find((r) => r.name === 'R2');
    });
    c.R(p + 'RefBaseRoleClassPath', () => rr.refBaseRoleClassPath);
    c.V(p + 'Class=null', () => {
      rr.class = null;
    });
    c.R(p + 'RefBaseRoleClassPath.null', () => rr.refBaseRoleClassPath);
    c.R(p + 'New_MappingObject', () => rr.new_MappingObject());
    c.D(p + '#end');
  }
  const d2 = c.load(file);
  const ie = d2.caexFile.instanceHierarchy.item(0).internalElement.item(0);
  const rq = ie.roleRequirements.item(0);
  if (rq != null) {
    c.V('ie.New_MappingObject', () => ie.new_MappingObject());
    c.R('ie.MappingObject', () => ie.mappingObject);
  }
}

function mappingTypeOps(c: Ctx, file: string): void {
  const doc = c.load(file);
  const mappingsList = descendantsNamed(doc, 'MappingObject');
  let k = 0;
  for (const mo of mappingsList) {
    const p = 'mo' + k++ + '.';
    c.R(p + 'AttributeNameMapping', () => mo.attributeNameMapping);
    c.R(p + 'InterfaceNameMapping', () => mo.interfaceNameMapping);
    c.R(p + 'InterfaceIDMapping', () => mo.interfaceIDMapping);
    c.R(p + 'MappingRoleReference', () => mo.mappingRoleReference);
    for (const child of [...mo.node.elements()].map((e: XElement) => XmlOperation.createCAEXWrapper(e) as any))
      c.R(p + 'CAEXSequence.' + child.node.name.localName, () => mo.caexSequence(child));
    c.R(p + 'CAEXSequence(foreign)', () => mo.caexSequence(doc.caexFile));
  }
  const target = mappingsList[0];
  const sources = mappingsList.slice(1).flatMap((m: any) => [...m.node.elements()].map((e: XElement) => XmlOperation.createCAEXWrapper(e) as any));
  let i = 0;
  for (const s of sources) {
    const q = 'ins' + i++ + '.';
    const copy = s.copy();
    c.R(q + 'Insert(pos)', () => target.insert(i % 3, copy));
    const copy2 = s.copy();
    c.R(q + 'Insert(asFirst)', () => target.insert(copy2, i % 2 === 0));
    const copy3 = s.copy();
    c.R(q + 'Insert(asIs)', () => target.insert(copy3, false, true));
    c.R(q + 'Import', () => target.import(s, 'imp' + i));
  }
  const attr = () => doc.caexFile.instanceHierarchy.item(0).internalElement.item(0).attribute.item(0);
  c.R('ins.Insert(pos,attribute)', () => target.insert(0, attr().copy()));
  c.R('ins.Insert(attribute)', () => target.insert(attr().copy()));
  c.R('ins.Import(attribute)', () => target.import(attr(), 'a'));
  c.D();
}

function revisions(c: Ctx, file: string): void {
  const doc = c.load(file);
  const objs: any[] = [];
  for (const e of doc.xDocument.root.descendants()) {
    const w = XmlOperation.createCAEXWrapper(e);
    if (w instanceof T.CAEXObject) objs.push(w);
  }
  c.R('IsExtensionDocument', () => CAEXDocumentExtensions.isExtensionDocument(doc));
  for (const o of objs) {
    const p = o.caexPath() + '.';
    let k = 0;
    for (const r of o.revision) {
      const q = p + 'r' + k++ + '.';
      c.R(q + 'AuthorName', () => r.authorName);
      c.R(q + 'Comment', () => r.comment);
      c.R(q + 'NewVersion', () => r.newVersion);
      c.R(q + 'OldVersion', () => r.oldVersion);
      c.R(q + 'NewVersionObject', () => r.newVersionObject);
      c.R(q + 'OldVersionObject', () => r.oldVersionObject);
      c.R(q + 'IsNewVersion', () => r.isNewVersion);
      c.R(q + 'IsOldVersion', () => r.isOldVersion);
      c.R(q + 'IsExtension', () => r.isExtension);
      c.R(q + 'RevisionDate', () => r.revisionDate);
    }
    c.R(p + 'HasOldVersion', () => CAEXBasicObjectExtensions.hasOldVersion(o));
    c.R(p + 'HasNewVersion', () => CAEXBasicObjectExtensions.hasNewVersion(o));
    if (implementsInterface(o, 'ICAEXLibrary')) c.R(p + 'IsExtendedVersion(lib)', () => CAEXBasicObjectExtensions.isExtendedVersion(o));
    c.R(p + 'OldVersions', () => CAEXObjectExtensions.oldVersions(o));
    c.R(p + 'NewVersions', () => CAEXObjectExtensions.newVersions(o));
    c.R(p + 'OldRevisions', () => CAEXObjectExtensions.oldRevisions(o));
    c.R(p + 'Extensions', () => CAEXObjectExtensions.extensions(o));
    for (const n of ['RCL2', 'R1', 'RCL', '', 'x']) c.R(p + 'HasNewVersion(' + n + ')', () => CAEXObjectExtensions.hasNewVersion(o, n));
    c.R(p + 'HasNewVersion(null)', () => CAEXObjectExtensions.hasNewVersion(o, null));
    for (const o2 of objs) {
      c.R(p + 'IsNewVersion(' + o2.caexPath() + ')', () => CAEXObjectExtensions.isNewVersion(o, o2));
      c.R(p + 'IsExtendedVersion(' + o2.caexPath() + ')', () => CAEXObjectExtensions.isExtendedVersion(o, o2));
    }
  }
  const libZ = objs.find((o) => o.name === 'RCLZ');
  const rcl = objs.find((o) => o.name === 'RCL');
  const r1 = objs.find((o) => o.name === 'R1');
  let rv: any = null;
  c.R('append', () => (rv = libZ.revision.append()));
  c.R('new.AuthorName', () => rv.authorName);
  c.R('new.RevisionDate', () => rv.revisionDate);
  c.R('new.IsExtension', () => rv.isExtension);
  c.V('AuthorName=', () => (rv.authorName = 'X'));
  c.V('Comment=', () => (rv.comment = 'c'));
  c.V('NewVersion=', () => (rv.newVersion = 'RCL'));
  c.V('OldVersion=', () => (rv.oldVersion = 'RCL2'));
  c.V('RevisionDate=', () => (rv.revisionDate = new DateTime(2023, 1, 2, 3, 4, 5, 0, DateTimeKind.Utc)));
  c.D();
  c.R('get', () => [rv.authorName, rv.comment, rv.newVersion, rv.oldVersion, rv.newVersionObject, rv.oldVersionObject, rv.isNewVersion, rv.isOldVersion, rv.isExtension, rv.revisionDate]);
  c.V('NewVersionObject=R1', () => (rv.newVersionObject = r1));
  c.V('OldVersionObject=RCL', () => (rv.oldVersionObject = rcl));
  c.R('get2', () => [rv.newVersion, rv.oldVersion, rv.newVersionObject, rv.oldVersionObject]);
  c.D();
  c.R('libZ.HasOldVersion', () => CAEXBasicObjectExtensions.hasOldVersion(libZ));
  c.R('libZ.IsExtendedVersion', () => CAEXBasicObjectExtensions.isExtendedVersion(libZ));
  c.R('rcl.IsNewVersion(libZ)', () => CAEXObjectExtensions.isNewVersion(rcl, libZ));
  c.V('MakeExtension', () => rv.makeExtension('ext'));
  c.R('IsExtension.after', () => rv.isExtension);
  c.R('libZ.IsExtendedVersion.after', () => CAEXBasicObjectExtensions.isExtendedVersion(libZ));
  c.R('rcl.IsExtendedVersion(libZ)', () => CAEXObjectExtensions.isExtendedVersion(rcl, libZ));
  c.R('IsExtensionDocument.after', () => CAEXDocumentExtensions.isExtensionDocument(doc));
  c.V('NewVersionObject=null', () => (rv.newVersionObject = null));
  c.V('OldVersionObject=null', () => (rv.oldVersionObject = null));
  c.V('AuthorName=null', () => (rv.authorName = null));
  c.V('Comment=null', () => (rv.comment = null));
  c.R('get3', () => [rv.authorName, rv.comment, rv.newVersion, rv.oldVersion, rv.isNewVersion, rv.isOldVersion, rv.isExtension]);
  c.D();
  let k2 = 0;
  for (const soi of doc.caexFile.sourceObjectInformation) {
    const q = 'soi' + k2++ + '.';
    c.R(q + 'OriginID', () => soi.originID);
    c.R(q + 'SourceObjID', () => soi.sourceObjID);
    c.V(q + 'OriginID=', () => (soi.originID = 'n' + k2));
    c.V(q + 'OriginID=same', () => (soi.originID = 'n' + k2));
    c.V(q + 'SourceObjID=', () => (soi.sourceObjID = 's' + k2));
    c.V(q + 'SourceObjID=null', () => (soi.sourceObjID = null));
    c.R(q + 'after', () => [soi.originID, soi.sourceObjID]);
  }
  c.D();
}

/** Replaces {XXXX} by the UTF-16 code unit XXXX. */
function unesc(s: string): string {
  return s.replace(/\{([0-9A-F]{4})\}/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
}

function culture(c: Ctx): void {
  const doc = CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
  c.doc = doc;
  const lib = doc.caexFile!.roleClassLib.append('L') as any;
  const r = lib.revision.append();
  const rc = lib.roleClass.append('RC');
  const pairs: [string, string][] = JSON.parse(readFileSync(join(inDir, 'culture-pairs.json'), 'utf8'));
  for (const pair of pairs) {
    const s = unesc(pair[0]);
    const v = unesc(pair[1]);
    const label = pair[0] + '|' + pair[1];
    r.newVersion = s;
    c.R('ends:' + label, () => CAEXObjectExtensions.hasNewVersion(lib, v));
    rc.refBaseClassPath = s;
    c.R('starts:' + label, () => InheritanceExtensions.classIsDerivedFrom(rc, v));
  }
}

// ---------------------------------------------------------------- single members (GapsCaexOracle.Misc.cs)

for (const file of ['misc30.aml', 'mapping215.aml', 'mapping30.aml']) {
  scenarios.push(['members:' + file, (c) => members(c, file)]);
  scenarios.push(['memberWrites:' + file, (c) => memberWrites(c, file)]);
}
scenarios.push(['typeDictionary', typeDictionary]);
scenarios.push(['enumerators', enumerators]);
scenarios.push(['valueSequences', valueSequences]);
scenarios.push(['records', records]);

function allWrappers(doc: any): any[] {
  const r: any[] = [];
  const root = doc.xDocument.root;
  for (const e of [root, ...root.descendants()]) {
    const w = XmlOperation.createCAEXWrapper(e);
    if (w != null) r.push(w);
  }
  return r;
}

function members(c: Ctx, file: string): void {
  const doc = c.load(file);
  const sep = doc.schema === CAEXDocument.CAEXSchema.CAEX2_15 ? '.' : '/';
  for (const w of allWrappers(doc)) {
    const p = pos(w.node) + '.';
    if (w instanceof T.CAEXBasicObject) {
      for (const name of ['ID', 'Name', 'Version', 'Description', 'ChangeMode', 'Copyright', 'x']) c.R(p + 'Property(' + name + ')', () => (w as any).property(name));
      c.R(p + 'DescriptionElement.ChangeMode', () => (w as any).descriptionElement.changeMode);
      c.R(p + 'VersionElement.ChangeMode', () => (w as any).versionElement.changeMode);
      c.R(p + 'CopyrightElement.ChangeMode', () => (w as any).copyrightElement.changeMode);
    }
    if (w instanceof T.AttributeFamilyType) {
      c.R(p + 'enum', () => [...w]);
      c.R(p + 'GetReferenceHierarchy<I>', () => w.getReferenceHierarchy(true, 'IClassWithBaseClassReference'));
      c.R(p + 'GetReferenceHierarchy<I>(false)', () => w.getReferenceHierarchy(false, 'IClassWithBaseClassReference'));
      c.R(p + 'GetReferenceHierarchy<Role>', () => w.getReferenceHierarchy(true, T.RoleFamilyType));
      c.R(p + 'GetReferenceHierarchy<Attr>', () => w.getReferenceHierarchy(true, T.AttributeFamilyType));
    }
    if (w instanceof T.InterfaceFamilyType) {
      c.R(p + 'enum', () => [...w]);
      c.R(p + 'GetReferenceHierarchy<I>', () => w.getReferenceHierarchy(true, 'IClassWithBaseClassReference'));
      c.R(p + 'GetReferenceHierarchy<Role>', () => w.getReferenceHierarchy(true, T.RoleFamilyType));
      c.R(p + 'GetReferenceHierarchy<Interface>(false)', () => w.getReferenceHierarchy(false, T.InterfaceFamilyType));
    }
    if (w instanceof T.RoleFamilyType) {
      c.R(p + 'enum', () => [...w]);
      c.R(p + 'GetReferenceHierarchy<I>', () => w.getReferenceHierarchy(true, 'IClassWithBaseClassReference'));
      c.R(p + 'GetReferenceHierarchy<Interface>', () => w.getReferenceHierarchy(true, T.InterfaceFamilyType));
      c.R(p + 'GetReferenceHierarchy<Role>(false)', () => w.getReferenceHierarchy(false, T.RoleFamilyType));
    }
    if (w instanceof T.SystemUnitFamilyType) {
      c.R(p + 'enumSUC', () => [...(w as any)]);
      c.R(p + 'GetReferenceHierarchy<I>', () => w.getReferenceHierarchy(true, 'IClassWithBaseClassReference'));
      c.R(p + 'GetReferenceHierarchy<Role>', () => w.getReferenceHierarchy(true, T.RoleFamilyType));
      c.R(p + 'GetReferenceHierarchy<SU>(false)', () => w.getReferenceHierarchy(false, T.SystemUnitFamilyType));
    }
    if (w instanceof T.SystemUnitClassType) {
      // IEnumerable<InternalElementType> of SystemUnitClassType (hidden by `new` in SystemUnitFamilyType)
      c.R(p + 'enumIE', () => [...{ [Symbol.iterator]: () => T.SystemUnitClassType.prototype[Symbol.iterator].call(w) }]);
    }
    if (w instanceof T.InternalElementType) c.R(p + 'IMirror.IsMaster', () => w.isMaster);
    if (w instanceof T.ExternalInterfaceType) {
      c.R(p + 'IMirror.IsMaster', () => w.isMaster);
      c.R(p + 'ExternalInterfaceDescandantsAndSelf', () => w.externalInterface.externalInterfaceDescandantsAndSelf());
    }
    if (w instanceof T.InterfaceClassType) c.R(p + 'ExternalInterfaceAndDescendants', () => (w as any).externalInterfaceAndDescendants);
    if (implementsInterface(w, 'IObjectWithExternalInterface'))
      c.R(p + 'ExternalInterface.ExternalInterfaceDescandantsAndSelf', () => (w as any).externalInterface.externalInterfaceDescandantsAndSelf());
    if (w instanceof T.AttributeType) {
      c.R(p + 'AttributeNames', () => (w as any).attributeNames);
      for (const cons of (w as any).constraint) {
        const q = p + 'constraint.' + cons.name + '.';
        c.R(q + 'OrdinalScaledType', () => cons.ordinalScaledType);
        c.R(q + 'NominalScaledType', () => cons.nominalScaledType);
        c.R(q + 'UnknownType', () => cons.unknownType);
        if (cons.ordinalScaledType != null)
          for (const n of ['RequiredMaxValue', 'RequiredValue', 'RequiredMinValue', 'x']) c.R(q + 'Ordinal[' + n + ']', () => cons.ordinalScaledType.item(n));
        if (cons.nominalScaledType != null) c.R(q + 'Nominal.RequiredValue', () => [...cons.nominalScaledType.requiredValue]);
        if (cons.unknownType != null) c.R(q + 'Unknown.Requirements', () => cons.unknownType.requirements);
      }
    }
    if (w instanceof T.AttributeTypeType) c.R(p + 'DefaultAttributeValue', () => (w as any).defaultAttributeValue);
    if (implementsInterface(w, 'IObjectWithAttributes'))
      for (const path of ['a', 'a' + sep + 'b', 'zz', 'a' + sep + 'zz', 'x', 'x' + sep + 'xs', 's1' + sep + 's1s'])
        c.R(p + 'GetCAEXAttribute(' + path + ')', () => (w as any).attribute.getCAEXAttribute(path));
    if (implementsInterface(w, 'ICAEXLibrary')) {
      c.R(p + 'enumLib', () => [...(w as any)]);
      c.R(p + 'VerifySignature()', () => (w as any).verifySignature());
      c.R(p + 'VerifySignature(s,k)', () => (w as any).verifySignature('s', 'k'));
    }
    if (w instanceof T.CaexObjectWithReference) {
      c.R(p + 'Reference', () => (w as any).reference);
      c.R(p + 'ReferenceAttributeName', () => (w as any).referenceAttributeName);
    }
  }
  c.D();
}

function canAddSafe(d: any, t: any): boolean {
  try {
    return d.canAddReference(t);
  } catch {
    return false;
  }
}

function memberWrites(c: Ctx, file: string): void {
  const doc = c.load(file);
  const all = allWrappers(doc);
  const named = (name: string): any => all.find((o) => o instanceof T.CAEXObject && o.name === name) ?? null;

  const ih = doc.caexFile.instanceHierarchy.item(0);
  for (const mode of [ChangeMode.Create, ChangeMode.Change, ChangeMode.Change, ChangeMode.Delete, ChangeMode.State, ChangeMode.Undefined]) {
    c.V('Description.ChangeMode=' + ChangeMode[mode], () => (ih.descriptionElement.changeMode = mode));
    c.R('Description.ChangeMode', () => ih.descriptionElement.changeMode);
    c.V('Version.ChangeMode=' + ChangeMode[mode], () => (ih.versionElement.changeMode = mode));
    c.V('Copyright.ChangeMode=' + ChangeMode[mode], () => (ih.copyrightElement.changeMode = mode));
  }
  c.D();
  c.V('SchemaLocation=', () => (doc.caexFile.schemaLocation = 'loc.xsd'));
  c.V('SchemaLocation=same', () => (doc.caexFile.schemaLocation = 'loc.xsd'));
  c.V('SchemaVersion=', () => (doc.caexFile.schemaVersion = '9.9'));
  c.R('SchemaVersion', () => doc.caexFile.schemaVersion);
  c.V('SchemaVersion=null', () => (doc.caexFile.schemaVersion = null));
  c.V('SchemaLocation=null', () => (doc.caexFile.schemaLocation = null));
  c.D();
  for (const w of [...all]) {
    const p = pos(w.node) + '.';
    if (w instanceof T.AttributeType) {
      c.V(p + 'Class=AT2', () => ((w as any).class = named('AT2')));
      c.R(p + 'Class', () => (w as any).class);
      c.V(p + 'Class=null', () => ((w as any).class = null));
    } else if (w instanceof T.ExternalInterfaceType) {
      c.V(p + 'Class=I2', () => ((w as any).class = named('I2')));
      c.R(p + 'Class', () => (w as any).class);
    } else if (w instanceof T.InternalElementType) {
      c.V(p + 'Class=S2', () => ((w as any).class = named('S2')));
      c.R(p + 'Class', () => (w as any).class);
    } else if (w instanceof T.SupportedRoleClassType) {
      c.V(p + 'Class=R2', () => ((w as any).class = named('R2')));
      c.R(p + 'Class', () => (w as any).class);
      c.V(p + 'Class=null', () => ((w as any).class = null));
    } else if (w instanceof T.AttributeValueRequirementType) {
      c.V(p + 'Name=cc', () => ((w as any).name = 'cc'));
      c.V(p + 'Name=cc again', () => ((w as any).name = 'cc'));
      c.R(p + 'Name', () => (w as any).name);
    }
  }
  c.D();
  const targets = ['I1', 'I2', 'I1n', 'R1', 'R2', 'R1n', 'S1', 'S2', 'S1n', 'AT1', 'AT2', 'AT1n', 'IE1', 'IE1a', 'sie', 'ei1', 'a', 'b', 'atc']
    .map(named)
    .filter((o) => o != null);
  const withRef: any[] = all.filter((w) => w instanceof T.CaexObjectWithReference);
  for (const d of withRef) {
    const p = pos(d.node) + '.';
    for (const t of targets) c.R(p + 'CanAddReference(' + t.name + ')', () => d.canAddReference(t));
    c.R(p + 'CanAddReference(null)', () => d.canAddReference(null));
  }
  for (const d of withRef) {
    const p = pos(d.node) + '.';
    for (const t of targets) {
      c.R(p + 'AddReference(' + t.name + ')', () => d.addReference(t));
      c.R(p + 'Reference', () => d.reference);
    }
    c.R(p + 'AddReference(null)', () => d.addReference(null));
    const first = targets.find((t) => t instanceof d.referenceType && canAddSafe(d, t));
    if (first !== undefined) {
      c.V(p + 'Reference=' + first.name, () => (d.reference = first));
      c.R(p + 'Reference.after', () => d.reference);
    }
    c.R(p + 'AddChild', () => d.addChild('child'));
  }
  c.D();
  const icl = doc.caexFile.interfaceClassLib.item(0);
  c.R('CopyAndChangeReferences', () => icl.copyAndChangeReferences(doc.caexFile, 'ICLcopy'));
  c.R('copy.enum', () => {
    const lib = doc.caexFile.interfaceClassLib.item('ICLcopy');
    return lib == null ? null : [...lib];
  });
  const detached = icl.copy();
  detached.name = 'ICLdetached';
  c.V('InsertAfter', () => icl.insertAfter(detached));
  const detached2 = icl.copy();
  detached2.name = 'ICLdetached2';
  c.V('InsertBefore', () => icl.insertBefore(detached2));
  c.V('InsertAfter(null)', () => icl.insertAfter(null));
  c.V('InsertBefore(null)', () => icl.insertBefore(null));
  c.D();
  const rcl = doc.caexFile.roleClassLib.item(0) ?? null;
  const sucl = doc.caexFile.systemUnitClassLib.item(0) ?? null;
  const atl = doc.caexFile.attributeTypeLib.item(0) ?? null;
  const awr = (seq: any, t: any) => {
    const r = seq.appendWithReference('n' + t.name, t);
    return [r.result, r.isReferenced];
  };
  if (rcl != null) for (const t of targets) c.R('rcl.AppendWithReference(' + t.name + ')', () => awr(rcl.roleClass, t));
  for (const t of targets) c.R('icl.AppendWithReference(' + t.name + ')', () => awr(icl.interfaceClass, t));
  if (sucl != null) for (const t of targets) c.R('sucl.AppendWithReference(' + t.name + ')', () => awr(sucl.systemUnitClass, t));
  if (atl != null) for (const t of targets) c.R('atl.AppendWithReference(' + t.name + ')', () => awr(atl.attributeType, t));
  c.D();
  const ie1 = named('IE1');
  if (ie1 != null) {
    c.R('AddNewMirror', () => ih.internalElement.addNewMirror(ie1));
    c.R('AddNewMirror(null)', () => ih.internalElement.addNewMirror(null));
    c.R('IsMaster', () => ie1.isMaster);
    c.R('ei.IsMaster', () => ie1.externalInterface.item(0).isMaster);
  }
  c.D();
}

const tagNames = [
  'CAEXFile', 'InstanceHierarchy', 'InternalElement', 'RoleClass', 'SourceDocumentInformation', 'SourceObjectInformation',
  'RoleClassLib', 'SystemUnitClass', 'SystemUnitClassLib', 'InterfaceClassLib', 'AttributeTypeLib', 'AttributeFamilyType',
  'AttributeType', 'InterfaceClass', 'ExternalReference', 'InternalLink', 'ExternalInterface', 'RoleRequirements',
  'SupportedRoleClass', 'MappingObject', 'Attribute', 'Revision', 'InterfaceNameMapping', 'InterfaceIDMapping',
  'AttributeNameMapping', 'OrdinalScaledType', 'NominalScaledType', 'UnknownType', 'AttributeValueRequirement',
  'RefSemantic', 'InterfaceFamilyType', 'RoleFamilyType', 'SystemUnitFamilyType', 'Constraint', 'Description',
  'Version', 'Copyright', 'CAEXBasicObject', 'CAEXObject', 'Foo', 'Mapping', 'ExternalInterfaceSequence',
];

function typeDictionary(c: Ctx): void {
  const dict = T.CAEXTypeDictionary.instance as any;
  for (const tag of tagNames) {
    c.R('item(' + tag + ')', () => dict.item(tag));
    c.R('ContainsKey(' + tag + ')', () => dict.containsKey(tag));
    c.R('TryGetValue(' + tag + ')', () => {
      const r = dict.tryGetValue(tag);
      return [r.result, r.t];
    });
    c.R('TryGetCreator(' + tag + ')', () => {
      const r = dict.tryGetCreator(tag);
      return [r.result, r.creatorFunc?.(new XElement(XName.get(tag)))?.constructor ?? null];
    });
  }
}

function enumerators(c: Ctx): void {
  const doc = c.load('misc30.aml');
  const ih = doc.caexFile.instanceHierarchy.item(0);
  const elements: XElement[] = [...ih.node.elements()];
  const withNull = [elements[0], null, elements[1], null, null, elements[elements.length - 1]];
  const e1 = new T.CAEXEnumerable(elements)[Symbol.iterator]() as any;
  c.R('array.MoveNext', () => e1.moveNext());
  c.R('array.Current', () => e1.current);
  c.R('array.MoveNext2', () => e1.moveNext());
  c.R('array.Current2', () => e1.current);
  c.V('array.Reset', () => e1.reset());
  c.R('array.MoveNext3', () => e1.moveNext());
  c.R('array.Current3', () => e1.current);
  c.V('array.Dispose', () => e1.dispose());
  const e2 = new T.CAEXEnumerable(withNull)[Symbol.iterator]() as any;
  let k = 0;
  while (k++ < 8) c.R('nulls.MoveNext' + k, () => (e2.moveNext() ? e2.current : 'end'));
  const e3 = new T.CAEXEnumerable(elements, T.InternalElementType)[Symbol.iterator]() as any;
  k = 0;
  while (k++ < 20) c.R('typed.MoveNext' + k, () => (e3.moveNext() ? e3.current : 'end'));
  const e6 = new T.CAEXEnumerable(elements)[Symbol.iterator]() as any;
  c.R('rest.MoveNext', () => e6.moveNext());
  c.R('rest', () => [...e6]);
  const ie1 = ih.internalElement.item(0);
  const seq = ie1.internalElement;
  c.R('sequenceNullElements', () => [...new T.CAEXEnumerable(seq, null)]);
  c.R('sequenceElements', () => [...new T.CAEXEnumerable(seq, ie1.node.elements())]);
  c.R('nullElements', () => [...new T.CAEXEnumerable(null)]);
  const at1 = doc.caexFile.attributeTypeLib.item(0).attributeType.item(0);
  const e4 = at1.inheritedAttributes[Symbol.iterator]() as any;
  c.R('lazy.MoveNext', () => e4.moveNext());
  c.R('lazy.Current', () => e4.current);
  c.V('lazy.Reset', () => e4.reset());
  c.V('lazy.Dispose', () => e4.dispose());
  const e5 = (CAEXBasicObjectExtensions.ancestors(ie1) as any)[Symbol.iterator]();
  c.R('ancestors.MoveNext', () => e5.moveNext());
  c.V('ancestors.Reset', () => e5.reset());
  c.R('ancestors.all', () => [...CAEXBasicObjectExtensions.ancestors(ie1)]);
}

function valueSequences(c: Ctx): void {
  const doc = c.load('misc30.aml');
  const ih = doc.caexFile.instanceHierarchy.item(0);
  const flags = new T.ValueSequence(ih.node, 'Flag', null, 'boolean') as any;
  const dates = new T.ValueSequence(ih.node, 'Date', null, 'DateTime') as any;
  const texts = new T.ValueSequence(ih.node, 'Text', null, 'string') as any;
  const objs = new T.ValueSequence(ih.node, 'Text', null, 'object') as any;
  for (let i = 0; i < 4; i++) {
    const k = i;
    c.R('flags[' + k + ']', () => flags.item(k));
    c.R('dates[' + k + ']', () => dates.item(k));
    c.R('texts[' + k + ']', () => texts.item(k));
    c.R('objs[' + k + ']', () => objs.item(k));
  }
  c.R('flags.IndexOf', () => [...flags.elements].map((e: XElement) => flags.indexOf(e)));
  c.R('dates.IndexOf(foreign)', () => dates.indexOf(ih.node));
  c.R('texts.IndexOf(null)', () => texts.indexOf(null));
  c.V('flags[0]=false', () => flags.setItem(0, false));
  c.V('flags[2]=true', () => flags.setItem(2, true));
  c.V('flags[9]=true', () => flags.setItem(9, true));
  c.V('dates[3]=', () => dates.setItem(3, new DateTime(2021, 5, 6, 7, 8, 9, 0, DateTimeKind.Utc)));
  c.V('dates[0]=', () => dates.setItem(0, new DateTime(2021, 5, 6, 7, 8, 9, 0, DateTimeKind.Unspecified)));
  c.V('texts[1]=', () => texts.setItem(1, 'b'));
  c.V('texts[0]=null', () => texts.setItem(0, null));
  c.V('objs[1]=text', () => objs.setItem(1, 'c'));
  c.V('objs[0]=element', () => objs.setItem(0, new XElement(XName.get('Inner'), 'v')));
  c.D();
  c.R('flags.Values', () => flags.values.take(3).toList());
  c.R('dates.Values', () => dates.values.take(3).toList());
  c.R('texts.ElementAndValues', () => texts.elementAndValues.select((ev: any) => [ev.node, ev.value]).toList());
  c.R('flags.Append', () => flags.append(true));
  c.R('dates.Prepend', () => dates.prepend(new DateTime(2000, 1, 1)));
  c.D();
  const first = (name: string) => [...ih.node.elements()].find((e: XElement) => e.name.localName === name);
  const wb = new T.CAEXWrapper_1(first('Flag'), 'boolean') as any;
  const wd = new T.CAEXWrapper_1(first('Date'), 'DateTime') as any;
  const wo = new T.CAEXWrapper_1(first('Text'), 'object') as any;
  const ws = new T.CAEXWrapper_1(first('Text'), 'string') as any;
  c.R('wb.Value', () => wb.value);
  c.R('wd.Value', () => wd.value);
  c.R('wo.Value', () => wo.value);
  c.R('ws.Value', () => ws.value);
  c.V('wb.Value=true', () => (wb.value = true));
  c.R('wb.Value2', () => wb.value);
  c.V('wd.Value=', () => (wd.value = new DateTime(2022, 3, 4, 5, 6, 7, 0, DateTimeKind.Local)));
  c.R('wd.Value2', () => wd.value);
  c.V('wo.Value=5', () => (wo.value = 5));
  c.R('wo.Value2', () => wo.value);
  c.V('wo.Value=true', () => (wo.value = true));
  c.R('wo.Value3', () => wo.value);
  c.V('wo.Value=null', () => (wo.value = null));
  c.V('ws.Value=s', () => (ws.value = 's'));
  c.R('ws.Value2', () => ws.value);
  const nb = new T.CAEXWrapper_1(null, 'boolean') as any;
  const nd = new T.CAEXWrapper_1(null, 'DateTime') as any;
  const no = new T.CAEXWrapper_1(null, 'object') as any;
  c.R('nb.Value', () => nb.value);
  c.R('nd.Value', () => nd.value);
  c.R('no.Value', () => no.value);
  c.V('nb.Value=true', () => (nb.value = true));
  c.D();
}

function records(c: Ctx): void {
  const P = (name: string, dt: DateTime) => {
    const r = new T.SourceDocumentInformationType_Properties() as any;
    r.originName = name;
    r.originID = 'id';
    r.originVendor = 'v';
    r.originVendorURL = 'u';
    r.originVersion = '1';
    r.originRelease = 'r';
    r.lastWritingDateTime = dt;
    r.originProjectTitle = 't';
    r.originProjectID = 'p';
    return r;
  };
  const a = P('a', new DateTime(2020, 1, 2, 3, 4, 5, 0, DateTimeKind.Utc));
  const b = P('a', new DateTime(2020, 1, 2, 3, 4, 5, 0, DateTimeKind.Local));
  const d = P('b', new DateTime(2020, 1, 2, 3, 4, 5, 0, DateTimeKind.Utc));
  const e = P('a', new DateTime(2020, 1, 2, 3, 4, 6, 0, DateTimeKind.Utc));
  const f = P('a', new DateTime(2020, 1, 2, 3, 4, 5, 0, DateTimeKind.Utc));
  f.originProjectID = null;
  const empty = new T.SourceDocumentInformationType_Properties() as any;
  c.R('a.Equals(a)', () => a.equals(a));
  c.R('a.Equals(b)', () => a.equals(b));
  c.R('a.Equals(d)', () => a.equals(d));
  c.R('a.Equals(e)', () => a.equals(e));
  c.R('a.Equals(f)', () => a.equals(f));
  c.R('f.Equals(a)', () => f.equals(a));
  c.R('a.Equals(null)', () => a.equals(null));
  c.R('a.Equals(string)', () => a.equals('a'));
  c.R('empty.Equals(new)', () => empty.equals(new T.SourceDocumentInformationType_Properties()));
}

// ---------------------------------------------------------------- user services (GapsCaexOracle.Services.cs)

scenarios.push(['commands', commands]);
for (const file of ['misc30.aml', 'mapping215.aml', 'uniq215.aml']) scenarios.push(['uniqueNames:' + file, (c) => uniqueNames(c, file)]);

class RecordingUndo {
  readonly commands: any[] = [];
  beginTransaction(): boolean {
    return false;
  }
  canRedo(): boolean {
    return false;
  }
  canUndo(): boolean {
    return false;
  }
  clearStacks(): void {}
  endTransaction(): boolean {
    return false;
  }
  lastModificationDate(): DateTime {
    return DateTime.minValue;
  }
  pause(): void {}
  pushCommand(cmd: any): void {
    this.commands.push(cmd);
  }
  redo(): void {}
  redoActions(): Iterable<string> {
    return [];
  }
  resume(): void {}
  undo(): void {}
  undoActions(): Iterable<string> {
    return [];
  }
}
registerInterfaces(RecordingUndo, 'IUndoRedo');

/** Unique names: the default name, or the default name with the first free suffix _1, _2, ... */
class StubUniqueName {
  isUniqueCAEXName(element: XElement): boolean {
    const name = element.attribute('Name')?.value ?? null;
    return element.parent === null || [...element.parent.elements(element.name)].filter((x) => (x.attribute('Name')?.value ?? null) === name).length <= 1;
  }
  registerDefault(): void {}
  uniqueCAEXName(sequence: XElement | Iterable<XElement>, elementTagName: string, defaultName?: string): string {
    if (sequence instanceof XElement) {
      return this.uniqueCAEXName(
        [...sequence.elements()].filter((e) => e.name.localName === elementTagName),
        elementTagName,
        defaultName === undefined ? elementTagName : defaultName,
      );
    }
    const names = new Set([...sequence].map((e) => e.attribute('Name')?.value ?? null));
    const d = defaultName === undefined || defaultName === null || defaultName.length === 0 ? elementTagName : defaultName;
    if (!names.has(d)) return d;
    for (let i = 1; ; i++) if (!names.has(d + '_' + i)) return d + '_' + i;
  }
  suspend(): void {}
  resume(): void {}
}
registerInterfaces(StubUniqueName, 'IUniqueName', 'IAMLService', 'ISuspendable');

function dumpCommands(rec: RecordingUndo, doc: any): unknown[] {
  const r: unknown[] = [];
  for (const cmd of rec.commands) {
    const row: unknown[] = [cmd.constructor.name, cmd.displayName, cmd.xDocument, cmd.caexDocument === doc];
    if (cmd.constructor.name === 'SetAttributeValueCmd') row.push(cmd.name, cmd.newValue, cmd.oldValue, cmd.owner);
    if (cmd.constructor.name === 'SetElementValueCmd' || cmd.constructor.name === 'SetElementContentCmd') row.push(cmd.element, cmd.newValue, cmd.oldValue);
    r.push(row);
  }
  rec.commands.length = 0;
  return r;
}

function commands(c: Ctx): void {
  const rec = new RecordingUndo();
  ServiceLocator.register(rec as any, 'IUndoRedo');
  try {
    const doc = c.load('misc30.aml');
    const ih = doc.caexFile.instanceHierarchy.item(0);
    const ie = ih.internalElement.item(0);
    const attr = ie.attribute.item(0);
    c.R('load', () => dumpCommands(rec, doc));
    c.V('Name=', () => (ie.name = 'IEx'));
    c.R('Name=.cmds', () => dumpCommands(rec, doc));
    c.V('Description=', () => (ie.description = 'd'));
    c.R('Description=.cmds', () => dumpCommands(rec, doc));
    c.V('Description=2', () => (ie.description = 'd2'));
    c.R('Description=2.cmds', () => dumpCommands(rec, doc));
    c.V('Value=', () => (attr.value = '9'));
    c.R('Value=.cmds', () => dumpCommands(rec, doc));
    c.V('AdditionalInformation[0]=element', () =>
      doc.caexFile.additionalInformation.setItem(0, new XElement(XName.get('Inner'), new XAttribute(XName.get('k'), 'v'), 'text')),
    );
    c.R('AdditionalInformation[0]=element.cmds', () => dumpCommands(rec, doc));
    c.V('AdditionalInformation[1]=string', () => doc.caexFile.additionalInformation.setItem(1, 'plain'));
    c.R('AdditionalInformation[1]=string.cmds', () => dumpCommands(rec, doc));
    const i2 = doc.caexFile.interfaceClassLib.item(0).interfaceClass.item(1);
    const i1n = doc.caexFile.interfaceClassLib.item(0).interfaceClass.item(0).interfaceClass.item(0);
    c.V('Reference=', () => (i2.reference = i1n));
    c.R('Reference=.cmds', () => dumpCommands(rec, doc));
    c.V('Remove', () => ie.attribute.item(1).remove());
    c.R('Remove.cmds', () => dumpCommands(rec, doc));
    c.V('New_Attribute', () => ie.attribute.append('na'));
    c.R('New_Attribute.cmds', () => dumpCommands(rec, doc));
    c.D();
  } finally {
    ServiceLocator.unRegister('IUndoRedo');
  }
}

scenarios.splice(scenarios.findIndex((s) => s[0] === 'commands') + 1, 0, ['crossImport', crossImport]);

/** External references: every element is external, alias and path derived from its name. */
class StubResolver {
  setRedirection(): void {}
  clearRedirection(): void {}
  isExternal(_document: any, element: XElement): { result: boolean; alias: string | null; path: string | null } {
    const name = element.attribute('Name')?.value ?? element.name.localName;
    return { result: !name.startsWith('X'), alias: name + '_A', path: name + '.aml' };
  }
  loadOrGetReferencedDocument(): { document: any; message: string | null } {
    return { document: null, message: 'no' };
  }
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
    return { document: null, message: 'no' };
  }
  registerResolverFunction(): void {}
  canResolve(): boolean {
    return false;
  }
  unloadDocument(): void {}
}
registerInterfaces(StubResolver, 'IExternalReferenceResolver', 'IAMLService');

function crossImport(c: Ctx): void {
  ServiceLocator.register(new StubResolver() as any, 'IExternalReferenceResolver');
  try {
    for (const name of ['C1', 'C2', 'C3', 'xie', 'SI', 'SR', 'XIH', 'SL']) {
      const target = c.load('misc30.aml');
      const source = CAEXDocument.loadFromString(decode(readFileSync(join(inDir, 'xsource30.aml'))))!;
      const obj = [...source.xDocument!.root!.descendants()]
        .filter((e) => (e.attribute('Name')?.value ?? null) === name)
        .map((e) => XmlOperation.createCAEXWrapper(e) as any)[0];
      const owner =
        obj instanceof T.SystemUnitFamilyType
          ? target.caexFile.systemUnitClassLib.item(0)
          : obj instanceof T.InternalElementType
            ? target.caexFile.instanceHierarchy.item(0)
            : obj instanceof T.InterfaceFamilyType
              ? target.caexFile.interfaceClassLib.item(0)
              : obj instanceof T.RoleFamilyType
                ? target.caexFile.roleClassLib.item(0)
                : target.caexFile;
      c.R('Import(' + name + ')', () => owner.import(obj, 'imp_' + name));
      c.R('Import(' + name + ') again', () => owner.import(obj, null));
      c.D('#' + name);
      c.D('#source' + name, source);
    }
  } finally {
    ServiceLocator.unRegister('IExternalReferenceResolver');
  }
}

function uniqueNames(c: Ctx, file: string): void {
  ServiceLocator.register(new StubUniqueName() as any, 'IUniqueName');
  try {
    const doc = c.load(file);
    const all = allWrappers(doc).filter((w) => w instanceof T.CAEXObject);
    const named = (name: string): any => all.find((o) => o.name === name) ?? null;
    const sucl = doc.caexFile.systemUnitClassLib.item(0);
    const s1 = named('S1');
    c.R('Import S1', () => sucl.import(s1, 'S1'));
    c.R('Import S1 again', () => sucl.import(s1, null));
    c.R('Import S1 sub', () => sucl.import(s1, 'S1', true));
    c.R('Insert copy S1', () => sucl.systemUnitClass.insert(s1.copy(), false));
    c.D();
    const s2 = named('S2');
    for (const a of [...s1.attribute]) c.R('S2.Import ' + a.name, () => s2.import(a, a.name));
    for (const e of [...s1.externalInterface]) c.R('S2.Import ' + e.name, () => s2.import(e, e.name));
    for (const ie of [...s1.internalElement]) c.R('S2.Import ' + ie.name, () => s2.import(ie, ie.name));
    c.R('S2.Import S1 as IE', () => s2.import(s1, 'sie'));
    c.D();
    const ih = doc.caexFile.instanceHierarchy.item(0);
    const ie1 = ih.internalElement.item(0);
    c.R('AddNewMirror', () => ih.internalElement.addNewMirror(ie1));
    c.R('AddNewMirror2', () => ih.internalElement.addNewMirror(ie1));
    c.R('Append', () => ih.internalElement.append());
    c.R('Append2', () => ih.internalElement.append());
    c.R('Import IE1', () => ih.import(ie1, 'IE1'));
    c.R("Import IE1 ''", () => ih.import(ie1, ''));
    c.R('attr Append', () => ie1.attribute.append());
    c.R('attr Append2', () => ie1.attribute.append());
    c.D();
  } finally {
    ServiceLocator.unRegister('IUniqueName');
  }
}

// ---------------------------------------------------------------- extensions, internal helpers, resources (GapsCaexOracle.Extras.cs)

scenarios.push(['constructors', constructors]);
scenarios.push(['internalHelpers', internalHelpers]);
scenarios.push(['transform:misc30.aml', (c) => transform(c, 'misc30.aml')]);
scenarios.push(['transform:mapping215.aml', (c) => transform(c, 'mapping215.aml')]);
scenarios.push(['documentWrapper', documentWrapper]);
scenarios.push(['interfaceExtensions', interfaceExtensions]);
scenarios.push(['attributeExtensions', attributeExtensions]);
scenarios.push(['semanticVersion', semanticVersions]);
scenarios.push(['clrValues', clrValues]);
scenarios.push(['serializedAdditionalInformation', serializedAdditionalInformation]);
scenarios.push(['derivedClasses', derivedClasses]);

function constructors(c: Ctx): void {
  for (const name of ['AttributeType', 'CAEXFileType', 'InternalElementType', 'MappingType', 'NominalScaledTypeType', 'OrdinalScaledTypeType', 'UnknownTypeType']) {
    const tag = name.endsWith('TypeType') ? name.substring(0, name.length - 4) : name.endsWith('Type') ? name.substring(0, name.length - 4) : name;
    c.R('Constructor(' + name + ')', () => (T as any)[name].Constructor(new XElement(XName.get(tag))).constructor);
  }
  c.R('new XsdDataTypes()', () => new (T as any).XsdDataTypes().constructor);
}

function internalHelpers(c: Ctx): void {
  for (const schema of [CAEXDocument.CAEXSchema.CAEX2_15, CAEXDocument.CAEXSchema.CAEX3_0])
    for (const parts of [[], ['a'], ['a', 'b'], ['a', null, 'c']])
      c.R('MakeAttributePath(' + parts.map((p) => p ?? 'null').join(',') + ';' + CAEXDocument.CAEXSchema[schema] + ')', () =>
        CAEXPathBuilder.makeAttributePath(parts, schema),
      );
  const doc = c.load('misc30.aml');
  const root = doc.xDocument.root;
  for (const e of [root, ...root.descendants()].slice(0, 40)) c.R('GetAbsoluteXPath(' + pos(e) + ')', () => ObjectWithBaseClass.getAbsoluteXPath(e));
  c.R('GetAbsoluteXPath(detached)', () => {
    const a = new XElement(XName.get('a'), new XElement(XName.get('b')));
    return ObjectWithBaseClass.getAbsoluteXPath([...a.elements()][0]!);
  });
  c.R('GetAbsoluteXPath(null)', () => ObjectWithBaseClass.getAbsoluteXPath(null as any));
  const cmp = new T.InternalLinkComparer() as any;
  const links: (XElement | null)[] = [...root.descendants()].filter((e: XElement) => e.name.localName === 'InternalLink');
  links.push(new XElement(XName.get('InternalLink'), new XAttribute(XName.get('RefPartnerSideA'), 'x')));
  links.push(new XElement(XName.get('InternalLink'), new XAttribute(XName.get('RefPartnerSideA'), 'x'), new XAttribute(XName.get('RefPartnerSideB'), 'x')));
  links.push(null);
  for (let i = 0; i < links.length; i++)
    for (let j = 0; j < links.length; j++) c.R('InternalLinkComparer.Equals(' + i + ',' + j + ')', () => cmp.equals(links[i], links[j]));
  const attrs = descendantsNamed(doc, 'Attribute');
  for (const a of attrs) {
    const p = a.attributePath + '.';
    const cv = a.getCaexValue('Value');
    c.R(p + 'cv', () => (cv == null ? null : 'cv'));
    if (cv == null) continue;
    c.V(p + 'SetDefaultValue', () => cv.setDefaultValue());
    c.R(p + 'Value', () => a.value);
    for (const s of ['http://[bad(x)', 'a b', "x!*'()", '', '5', 'abc', 'http://ok/(x)']) c.R(p + 'IsValidStringValue(' + s + ')', () => cv.isValidStringValue(s));
  }
  c.D();
  const d2 = c.load('iface30.aml');
  const uri = descendantsNamed(d2, 'Attribute').find((a) => a.name === 'Uri');
  const ucv = uri.getCaexValue('Value');
  for (const s of ['http://[bad(x)', 'http://[bad!x]', "[(')*]", 'http://ok', 'a b', '%%', 'http://[x]/(y)', '\\\\server\\(share)'])
    c.R('anyURI.IsValidStringValue(' + s + ')', () => ucv.isValidStringValue(s));
  c.V('anyURI.SetDefaultValue', () => ucv.setDefaultValue());
  c.R('anyURI.Value', () => uri.value);
  c.D();
}

function transform(c: Ctx, file: string): void {
  const doc = c.load(file);
  for (const schema of [CAEXDocument.CAEXSchema.CAEX2_15, CAEXDocument.CAEXSchema.CAEX3_0]) {
    let t: any = null;
    const name = CAEXDocument.CAEXSchema[schema];
    c.R('TransformToSchema(' + name + ')', () => {
      t = doc.transformToSchema(schema);
      return t === doc;
    });
    if (t === null) continue;
    c.R('IsTransformationActive(' + name + ')', () => t.isTransformationActive);
    c.R('Schema(' + name + ')', () => t.schema);
    c.D('#' + name, t);
  }
  c.R('TransformToSchema(99)', () => doc.transformToSchema(99));
}

class TestWrapper extends XDocumentWrapper {
  constructor(d: any) {
    super(d);
  }
}

async function documentWrapper(c: Ctx): Promise<void> {
  const text = decode(readFileSync(join(inDir, 'misc30.aml')));
  const dir = join(tmpdir(), 'gapscaex-js-' + process.pid);
  mkdirSync(dir, { recursive: true });
  for (const src of [text, '<root xmlns="urn:x"><a b="1"> t </a></root>', '<root><a/></root>']) {
    const w = new TestWrapper(parseXDocument(src, { preserveWhitespace: true }));
    const p = src.length + '.';
    for (const pretty of [true, false]) {
      c.R(p + 'SaveToStream(' + (pretty ? 'True' : 'False') + ')', () => Buffer.from(w.saveToStream(pretty)).toString('base64'));
      const file = join(dir, 'wrapper.xml');
      c.R(p + 'SaveToFile(' + (pretty ? 'True' : 'False') + ')', () => {
        w.saveToFile(file, pretty);
        return readFileSync(file).toString('base64');
      });
    }
    c.R(p + 'SaveToFile(null)', () => {
      w.saveToFile(null as any, true);
      return 'ok';
    });
    c.R(p + "SaveToFile('')", () => {
      w.saveToFile('', true);
      return 'ok';
    });
    for (const tag of ['a', 'CAEXFile', '']) c.R(p + 'XName(' + tag + ')', () => w.xName(tag));
    c.R(p + 'XName(null)', () => w.xName(null as any));
  }
  for (const file of ['misc30.aml', 'mapping215.aml']) {
    const doc = c.load(file);
    for (const target of ['gapscaex-async.aml', 'gapscaex-async.tmp'])
      for (const pretty of [true, false]) {
        const path = join(dir, target);
        await c.RA(file + '.SaveToFileAsync(' + target + ',' + (pretty ? 'True' : 'False') + ')', async () => {
          await doc.saveToFileAsync(path, pretty);
          return new TextDecoder().decode(readFileSync(path));
        });
        c.R(file + '.FileName', () => doc.caexFile.fileName);
      }
    await c.RA(file + '.SaveToFileAsync(null)', async () => {
      await doc.saveToFileAsync(null, true);
      return 'ok';
    });
  }
}

function interfaceExtensions(c: Ctx): void {
  const doc = c.load('iface30.aml');
  const X = ExternalInterfaceTypeExtensions as any;
  for (const ei of descendantsNamed(doc, 'ExternalInterface')) {
    const p = pos(ei.node) + '.';
    c.R(p + 'HasVerifiableCardinality', () => X.hasVerifiableCardinality(ei));
    c.R(p + 'HasVerifiableCategory', () => X.hasVerifiableCategory(ei));
    c.R(p + 'HasVerifiableDirection', () => X.hasVerifiableDirection(ei));
    c.R(p + 'AllowedDirections', () => X.allowedDirections(ei));
    c.R(p + 'Categories', () => X.categories(ei));
    c.R(p + 'Direction', () => X.direction(ei));
    c.R(p + 'MaxCardinality', () => X.maxCardinality(ei));
    c.R(p + 'MinCardinality', () => X.minCardinality(ei));
    c.R(p + 'MaxCardinalityViolation', () => X.maxCardinalityViolation(ei));
    c.R(p + 'MinCardinalityViolation', () => X.minCardinalityViolation(ei));
    c.R(p + 'DirectionViolation', () => {
      const r = X.directionViolation(ei);
      return [r.result, r.requiredDirections];
    });
    c.R(p + 'CategoryViolation', () => X.categoryViolation(ei));
    c.R(p + 'IsRelated', () => X.isRelated(ei));
    c.R(p + 'RelatedExternalInterfaces', () => X.relatedExternalInterfaces(ei));
    c.R(p + 'IsMaster', () => X.isMaster(ei));
  }
  const icl = doc.caexFile.interfaceClassLib.item(0);
  const port = icl.interfaceClass.item(0);
  const rcl = doc.caexFile.roleClassLib.item(0);
  for (const ie of descendantsNamed(doc, 'InternalElement', 'SystemUnitClass')) {
    const p = pos(ie.node) + '.';
    c.R(p + 'OfInterfaceClass(Port)', () => CAEXSequenceExtension.ofInterfaceClass(ie.externalInterface, port));
    c.R(p + 'OfInterfaceClass(SubPort)', () => CAEXSequenceExtension.ofInterfaceClass(ie.externalInterface, port.interfaceClass.item(0)));
    c.R(p + 'OfInterfaceClass(Other)', () => CAEXSequenceExtension.ofInterfaceClass(ie.externalInterface, icl.interfaceClass.item(1)));
    for (const rc of rcl.roleClass) {
      if (ie instanceof T.InternalElementType) c.R(p + 'RoleRequirements.OfRoleClass(' + rc.name + ')', () => CAEXSequenceExtension.ofRoleClass(ie.roleRequirements, rc));
      c.R(p + 'SupportedRoleClass.OfRoleClass(' + rc.name + ')', () => CAEXSequenceExtension.ofRoleClass(ie.supportedRoleClass, rc));
    }
  }
  c.D();
}

function attributeExtensions(c: Ctx): void {
  const doc = c.load('misc30.aml');
  const all = allWrappers(doc).filter((w) => w instanceof T.CAEXObject);
  const named = (name: string): any => all.find((o) => o.name === name);
  const at1 = named('AT1');
  const at2 = named('AT2');
  const A = ObjectWithAttributes as any;
  for (const owner of ['IE1', 'IE2', 'IE3', 'S1', 'R1', 'I1']) {
    const o = named(owner);
    const p = owner + '.';
    c.R(p + 'Add(AT1)', () => A.addAttributeTypeReference(o, at1));
    c.R(p + 'Add(AT1) again', () => A.addAttributeTypeReference(o, at1));
    c.R(p + 'Add(AT2,false,true,n)', () => A.addAttributeTypeReference(o, at2, false, true, 'n'));
    c.R(p + 'Add(AT2,true,false,null)', () => A.addAttributeTypeReference(o, at2, true, false, null));
    c.R(p + 'Add(null)', () => A.addAttributeTypeReference(o, null));
    c.R(p + 'Add(path)', () => A.addAttributeTypeReference(o, 'ATL/AT1'));
    c.R(p + 'Add(path) again', () => A.addAttributeTypeReference(o, 'ATL/AT1'));
    c.R(p + 'Add(path,false,true)', () => A.addAttributeTypeReference(o, 'ATL/AT2', false, true));
    c.R(p + 'Add(missing,false,true,null)', () => A.addAttributeTypeReference(o, 'ATL/Missing', false, true, null));
    c.R(p + 'Add(C:x,false)', () => A.addAttributeTypeReference(o, 'C:x', false));
    c.R(p + 'Add(a\\b,false)', () => A.addAttributeTypeReference(o, 'a\\b', false));
    c.R(p + "Add('')", () => A.addAttributeTypeReference(o, ''));
  }
  c.D();
  const s1 = named('S1');
  const ie1 = named('IE1');
  const ie3 = named('IE3');
  const S = SystemUnitClassTypeExtensions as any;
  c.R('AddInstance(ei)', () => S.addInstance(s1, ie1.externalInterface.item(0).copy()));
  c.R('AddInstance(ei) again', () => S.addInstance(s1, ie1.externalInterface.item(0).copy()));
  c.R('AddInstance(ie)', () => S.addInstance(s1, ie3.copy()));
  c.R('AddInstance(ie) again', () => S.addInstance(s1, ie3.copy()));
  c.R('AddInstance(attribute)', () => S.addInstance(s1, ie1.attribute.item(1).copy()));
  c.R('AddInstance(ih)', () => S.addInstance(s1, doc.caexFile.instanceHierarchy.item(0)));
  c.D();
  c.R('UpdateInstance(IE1)', () => ie1.updateInstance());
  c.D();
  c.R('UpdateInstance(IE1) again', () => ie1.updateInstance());
  c.R('UpdateInstance(IE3)', () => ie3.updateInstance());
  c.D();
}

const versions = ['1.0', '1.0.0', '1.0.0.0', '1.0.0.1', '1.0.0-beta', '1.0.0-Beta', '1.0.0-alpha', '1.0-beta', '01.2.3', '1.2.3.4-rc.1',
  '2.0.0', '1', ' 1.0 ', '1.0.0-', 'x', '', '1.0.0+meta', '1.2.3-ALPHA.2', '10.0', '1.10', '1.9'];

function semanticVersions(c: Ctx): void {
  const SV = SemanticVersion as any;
  const parsed: any[] = [];
  for (const v of versions) {
    let sv: any = null;
    c.R('Parse(' + v + ')', () => (sv = SV.parse(v))?.toString() ?? null);
    parsed.push(sv);
    c.R('TryParse(' + v + ')', () => {
      const r = SV.tryParse(v);
      return [r.result, r.value?.toString() ?? null];
    });
    c.R('TryParseStrict(' + v + ')', () => {
      const r = SV.tryParseStrict(v);
      return [r.result, r.value?.toString() ?? null];
    });
    c.R('ParseOptionalVersion(' + v + ')', () => SV.parseOptionalVersion(v)?.toString() ?? null);
    if (sv === null) continue;
    c.R(v + '.Version', () => sv.version.toString());
    c.R(v + '.SpecialVersion', () => sv.specialVersion);
    c.R(v + '.GetOriginalVersionComponents', () => sv.getOriginalVersionComponents());
    c.R(v + '.ToNormalizedString', () => sv.toNormalizedString());
    c.R(v + '.ToString', () => sv.toString());
    c.R(v + '.CompareTo(null)', () => sv.compareTo(null));
    c.R(v + '.CompareTo(string)', () => sv.compareTo('1.0'));
    c.R(v + '.Equals(null)', () => sv.equals(null));
    c.R(v + '.Equals(string)', () => sv.equals('1.0'));
  }
  const ok = parsed.filter((p) => p !== null);
  for (const a of ok)
    for (const b of ok)
      c.R('cmp(' + a + ',' + b + ')', () => [
        Math.sign(a.compareTo(b)),
        Math.sign(a.compareTo(b)),
        a.equals(b),
        a.equals(b),
        SV.equals(a, b),
        SV.notEquals(a, b),
        SV.lessThan(a, b),
        SV.lessThanOrEqual(a, b),
        SV.greaterThan(a, b),
        SV.greaterThanOrEqual(a, b),
        a.equalityKey() === b.equalityKey(),
      ]);
  for (const args of [[1, 2, 3], [1, 2, 3, 4], [1, 2, 3, 'pre'], [1, 2, 3, 0]])
    c.R('new(' + args.join(',') + ')', () => {
      const sv = new SV(...args);
      return [sv.toString(), sv.toNormalizedString(), sv.specialVersion, sv.getOriginalVersionComponents()];
    });
  c.R('new(Version)', () => {
    const sv = new SV(new Version(1, 2));
    return [sv.toString(), sv.toNormalizedString(), sv.getOriginalVersionComponents()];
  });
  c.R('new(Version,sp)', () => {
    const sv = new SV(new Version(1, 2, 3, 4), 'x');
    return [sv.toString(), sv.toNormalizedString(), sv.getOriginalVersionComponents()];
  });
  c.R('null ops', () => [SV.equals(null, null), SV.equals(ok[0], null), SV.equals(null, ok[0]), SV.greaterThan(ok[0], null), SV.lessThan(ok[0], null)]);
}

function clrValues(c: Ctx): void {
  const values: any[] = [
    ClrValue.sbyte(-1), ClrValue.byte(255), ClrValue.short(-300), ClrValue.ushort(5), ClrValue.int(7), ClrValue.uint(7), ClrValue.long(-5n),
    ClrValue.ulong(2n ** 64n - 1n), ClrValue.float(1.5), ClrValue.float(0.1), ClrValue.float(1e10), ClrValue.double(5), ClrValue.double(1e21),
    ClrValue.double(0.1), ClrValue.double(-0), ClrValue.double(NaN), ClrValue.float(Infinity),
  ];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    c.R('ToString' + i, () => v.toString());
    c.R('Type' + i, () => v.type.toString());
    if (typeof v.value !== 'bigint') c.R('ToDouble' + i, () => +v);
  }
}

function serializedAdditionalInformation(c: Ctx): void {
  const doc = CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0) as any;
  c.doc = doc;
  const ai = doc.caexFile.additionalInformation;
  for (const text of ['<CAEXDocument A="1" />', '<Other />', '<CAEXDocument><x /></CAEXDocument>', '<ns:CAEXDocument xmlns:ns="urn:x" />'])
    c.R('Append(' + text + ')', () => ai.append(text));
  c.D();
  const seq = AdditionalInformationExtension.serializedAdditionalInformation(doc.caexFile, T.CAEXDocument) as any;
  c.R('Elements', () => [...seq.elements]);
  c.R('Count', () => seq.count);
  const other = AdditionalInformationExtension.serializedAdditionalInformation(doc.caexFile, T.CAEXFileType) as any;
  c.R('other.Count', () => other.count);
  c.R('Append(text)', () => ai.append('plain text'));
  c.R('Elements.after', () => [...seq.elements]);
  c.R('Count.after', () => seq.count);
}

function derivedClasses(c: Ctx): void {
  const dict = InheritanceExtensions.derivedClasses as any;
  dict.clear();
  try {
    const doc = c.load('misc30.aml');
    const classes = allWrappers(doc).filter((o) => o instanceof T.CAEXObject && implementsInterface(o, 'IClassWithBaseClassReference'));
    for (const cl of classes) {
      const path = cl.caexPath();
      c.V('Add(' + path + ')', () => dict.addClassDerivations(doc, path, cl.name));
      c.R('entry(' + path + ')', () => [...dict.get(path)]);
    }
    c.V('Add(null)', () => dict.addClassDerivations(doc, null, null));
    c.R('Count', () => dict.size);
    for (const a of classes) for (const b of classes) c.R('derived(' + a.caexPath() + ',' + b.caexPath() + ')', () => InheritanceExtensions.classIsDerivedFrom(a, b.caexPath()));
  } finally {
    dict.clear();
  }
}

// ---------------------------------------------------------------- test

describe.skipIf(!existsSync(outFile))('gapscaex oracle', () => {
  const expected: Record<string, [string, Json][]> = existsSync(outFile) ? JSON.parse(readFileSync(outFile, 'utf8')) : {};
  for (const [name, body] of scenarios) {
    it(name, async () => {
      const exp = expected[name];
      expect(exp, 'scenario missing in oracle output').toBeDefined();
      const c = new Ctx(exp!);
      try {
        await body(c);
      } catch (e) {
        c.add('!scenario', '!' + dotNetExceptionName(e) + ': ' + (e as Error).message + ' ' + (e as Error).stack);
      }
      const mismatches: string[] = [];
      const failure = c.items.find((x) => x[0] === '!scenario');
      if (failure !== undefined) mismatches.push(String(failure[1]));
      const n = Math.max(c.items.length, exp!.length);
      for (let k = 0; k < n && mismatches.length < 15; k++) {
        const a = JSON.stringify(c.items[k] ?? null);
        const e = JSON.stringify(exp![k] ?? null);
        if (a !== e) {
          const cut = (s: string) => (s.length > 1500 ? s.substring(0, 1500) + '…' : s);
          mismatches.push(`#${k}\n  expected ${cut(e)}\n  actual   ${cut(a)}`);
        }
      }
      expect(mismatches.join('\n')).toBe('');
    });
  }
});
