// Oracle parity for the coverage gap package "gapsservices": Aml.Engine.Schema (XmlSchemaManager
// public API), Aml.Engine.Xml.Extensions, Aml.Engine.Services (+ Model), Aml.Engine.Adapter,
// Aml.Engine.Streaming and the remaining functions of Aml.Engine.AmlObjects. The JS counterpart of
// oracle/GapsServicesOracle.cs: every section makes the same calls in the same order and records
// the same lines. Keep both files in sync.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { AMLSchemaManager2_15 } from '../../src/engine/schema/AMLSchemaManager2_15.js';
import { AMLSchemaManager3_0 } from '../../src/engine/schema/AMLSchemaManager3_0.js';
import { XmlSchemaManager } from '../../src/engine/schema/XmlSchemaManager.js';
import { XmlSchemaAttribute, XmlSchemaElement, XmlSchemaSimpleType, XmlSchemaUse } from '../../src/engine/schema/SchemaModel.js';
import { XmlTypeCode } from '../../src/system/XmlTypeCode.js';
import { XAttribute, XComment, XElement, XName, XNamespace, parseXDocument } from '../../src/xml/index.js';
import { XmlCAEXSchema } from '../../src/engine/xmlext/XmlCAEXSchema.js';
import { XmlCAEXAttributes } from '../../src/engine/xmlext/XmlCAEXAttributes.js';
import { XmlCAEXMapping } from '../../src/engine/xmlext/XmlCAEXMapping.js';
import { XmlClassOperation } from '../../src/engine/xmlext/XmlClassOperation.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { ServiceLocator } from '../../src/engine/services/ServiceLocator.js';
import { QueryResult } from '../../src/engine/services/QueryResult.js';
import { EmptyLookup } from '../../src/engine/services/EmptyLookup.js';
import { SignatureServiceBase } from '../../src/engine/services/SignatureServiceBase.js';
import { CAEXReference } from '../../src/engine/services/CAEXReference.js';
import { UpdateEventArgs } from '../../src/engine/services/interfaces/UpdateEventArgs.js';
import { SchemaTransformationEventArgs } from '../../src/engine/services/interfaces/SchemaTransformationEventArgs.js';
import { CAEXSignatureHeader } from '../../src/engine/amlobjects/CAEXSignatureHeader.js';
import { CAEXDocument_CAEXSchema } from '../../src/engine/caex/CAEXDocument.js';
import { implementsInterface, registerInterfaces } from '../../src/engine/interfaces.js';
import { AMLEngineAdapter } from '../../src/engine/adapter/AMLEngineAdapter.js';
import { DocumentStreaming } from '../../src/engine/streaming/DocumentStreaming.js';
import { AMLFile } from '../../src/engine/amlobjects/AMLFile.js';
import { ExternalDataReference } from '../../src/engine/amlobjects/ExternalDataReference.js';
import { AmlObjectsExtensions } from '../../src/engine/amlobjects/extensions/AmlObjectsExtensions.js';
import { Version } from '../../src/engine/amlobjects/internal/Version.js';
import * as NetPath from '../../src/engine/amlobjects/internal/NetPath.js';
import { InvariantIgnoreCaseDictionary } from '../../src/engine/amlobjects/mimetype/InvariantIgnoreCaseDictionary.js';
import { FileAccess, FileMode, Package, TargetMode } from '../../src/engine/amlobjects/packaging/Package.js';
import { MemoryStream } from '../../src/engine/amlobjects/packaging/MemoryStream.js';
import { from } from '../../src/system/linq.js';
import { unzipSync } from 'fflate';
import { EventSource } from '../../src/system/events.js';
import { AMLLibraryServerProfile } from '../../src/engine/services/model/AMLLibraryServerProfile.js';
import { AMLLibraryServerDataProfile } from '../../src/engine/services/model/AMLLibraryServerDataProfile.js';
import { AMLEditionEnum } from '../../src/engine/services/model/AMLEditionEnum.js';
import { AMLEditionEnumExtension } from '../../src/engine/services/model/AMLEditionEnumExtension.js';
import { XMLSignature } from '../../src/engine/services/model/XMLSignature.js';
import { SignedInfo } from '../../src/engine/services/model/SignedInfo.js';
import { KeyInfo } from '../../src/engine/services/model/KeyInfo.js';
import { KeyValue } from '../../src/engine/services/model/KeyValue.js';
import { ByteArrayConverter } from '../../src/engine/services/utilities/ByteArrayConverter.js';
import { Uri, UriKind } from '../../src/system/index.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { formatDouble } from '../../src/system/Number.js';

const testDir = join(__dirname, '..');
const inputDir = resolve(testDir, 'gapsservices');
const corpusDir = resolve(testDir, 'corpus');
const oracleDir = resolve(testDir, 'oracle-out', 'gapsservices');
const outDir = resolve(testDir, 'oracle-out', 'gapsservices-js');
const workDir = join(outDir, 'work');
const has = existsSync(join(oracleDir, 'schema.json'));

// ---------------------------------------------------------------- recording

class Canon {
  private readonly guids = new Map<string, string>();
  apply(text: string): string {
    const recent = (y: number, mo: number, d: number) => {
      const t = new Date(y, mo - 1, d).getTime();
      const today = new Date(new Date().toDateString()).getTime();
      return !Number.isNaN(t) && Math.abs(t - today) <= 86_400_000;
    };
    text = text.replace(/(\d{2})\/(\d{2})\/(\d{4}) \d{2}:\d{2}:\d{2}/g, (m, mo, d, y) => (recent(+y, +mo, +d) ? 'NOW' : m));
    text = text.replace(/(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?/g, (m, y, mo, d) => (recent(+y, +mo, +d) ? 'NOW' : m));
    return text.replace(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g, (m) => {
      const k = m.toLowerCase();
      let id = this.guids.get(k);
      if (!id) {
        id = 'G' + (this.guids.size + 1);
        this.guids.set(k, id);
      }
      return id;
    });
  }
}

function replaceAllCi(text: string, find: string, repl: string): string {
  if (!find) return text;
  const lower = text.toLowerCase();
  const f = find.toLowerCase();
  let out = '';
  let i = 0;
  for (;;) {
    const j = lower.indexOf(f, i);
    if (j < 0) break;
    out += text.substring(i, j) + repl;
    i = j + f.length;
  }
  return out + text.substring(i);
}

class Rec {
  readonly lines: string[] = [];
  readonly c = new Canon();
  v(label: string, f: () => unknown): void {
    let s: string;
    try {
      s = F(f());
    } catch (e) {
      s = ex(e);
    }
    this.add(label + '=' + s);
  }
  do(label: string, a: () => unknown): void {
    let s = 'ok';
    try {
      a();
    } catch (e) {
      s = ex(e);
    }
    this.add(label + '=' + s);
  }
  add(line: string): void {
    line = replaceAllCi(line, workDir, '<WORK>');
    line = replaceAllCi(line, workDir.replace(/\\/g, '/'), '<WORK>');
    line = replaceAllCi(line, inputDir, '<IN>');
    line = replaceAllCi(line, inputDir.replace(/\\/g, '/'), '<IN>');
    this.lines.push(this.c.apply(line));
  }
}

type Section = Record<string, string[]>;

function kase(o: Section, name: string, action: (r: Rec) => void): void {
  const r = new Rec();
  try {
    action(r);
  } catch (e) {
    r.add('abort:' + ex(e));
  }
  o[name] = r.lines;
}

function ex(e: unknown): string {
  const name = dotNetExceptionName(e);
  return name === 'NullReferenceException' || name === 'XmlException' ? '!' + name : '!' + name + ': ' + (e as Error).message;
}

function Tr(f: () => unknown): string {
  try {
    return F(f());
  } catch (e) {
    return ex(e);
  }
}

const B = (b: boolean) => (b ? 'true' : 'false');
const N = (s: string | null | undefined) => s ?? 'null';
/** An enum value by name (C# Enum.ToString()). */
const E = (en: any, v: number) => (en[v] as string | undefined) ?? String(v);

function F(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return B(v);
  if (typeof v === 'number') return v === Number.POSITIVE_INFINITY ? 'MAX' : formatDouble(v);
  if (typeof v === 'bigint') return v.toString();
  if (v instanceof XName) return v.toString();
  if (v instanceof XElement) return v.toString();
  if (v instanceof XAttribute) return v.toString();
  if (v instanceof T.CAEXWrapper) return D(v);
  if (v instanceof XmlSchemaElement) return SE(v);
  if (v instanceof XmlSchemaAttribute) return 'SA(' + v.name + ')';
  if (v instanceof Uri) return v.isAbsoluteUri ? 'Uri(' + v.originalString + '|' + v.absoluteUri + ')' : 'Uri(' + v.originalString + ')';
  if (v instanceof Uint8Array) return 'bytes(' + v.length + ':' + hashBytes(v) + ')';
  if (typeof (v as any).kind === 'string' && typeof (v as any).value === 'string' && Object.keys(v as object).length === 2) return (v as any).kind + ':' + (v as any).value;
  if (typeof (v as any)[Symbol.iterator] === 'function') return '[' + [...(v as Iterable<unknown>)].map(F).join(',') + ']';
  return (v as object).constructor.name;
}

function SE(e: XmlSchemaElement): string {
  return 'SE(' + e.name + '|' + F(e.minOccurs) + '|' + F(e.maxOccurs) + ')';
}

function D(w: any): string {
  if (w === null || w === undefined) return 'null';
  if (w.node == null) return w.constructor.name + '(nonode)';
  if (w instanceof T.CAEXObject) return `${w.constructor.name}:${w.node.name.localName}|${N(w.name)}|${N(w.id)}|${Tr(() => w.caexPath())}`;
  return `${w.constructor.name}:${w.node.name.localName}`;
}

function saveString(doc: any): string {
  const bytes: Uint8Array = doc.saveToStream(true);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder().decode(bytes.subarray(start));
}

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex').toUpperCase().substring(0, 16);
const hashBytes = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').toUpperCase().substring(0, 16);

function readAllText(path: string): string {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3));
  return new TextDecoder().decode(bytes);
}
const load = (file: string): any => CAEXDocument.loadFromString(readAllText(file));
const corpus = (name: string): any => load(join(corpusDir, name));
void saveString;
void hash;
void corpus;

// ================================================================ 1. schema

const NoPairs = ['|Nonexistent', 'CAEXFile|Nonexistent', 'Nonexistent|InternalElement', '|'];

function schemaSection(o: Section): void {
  for (const [tag, m] of [
    ['caex30', AMLSchemaManager3_0.instance],
    ['caex215', AMLSchemaManager2_15.instance],
  ] as [string, any][]) {
    const pairs: string[] = [];
    for (const [key, info] of (m as XmlSchemaManager).elements) {
      const c = info.schemaElement.name;
      pairs.push(key === c ? '|' + c : key.endsWith(c) ? key.substring(0, key.length - c.length) + '|' + c : '?' + key + '|' + c);
    }
    kase(o, tag + ':pairs', (r) => pairs.forEach((p) => r.add(p)));
    for (const pair of [...pairs, ...NoPairs]) kase(o, tag + ':' + pair, (r) => schemaPair(r, m, pair));
    kase(o, tag + ':misc', (r) => schemaMisc(r, m, tag));
  }
}

const nm = (m: any, s: string | null): XName | null => (s === null ? null : (m.namespace as XNamespace).getName(s));

function schemaPair(r: Rec, m: any, pair: string): void {
  const bar = pair.indexOf('|');
  const p = bar === 0 ? null : pair.substring(0, bar);
  const c = pair.substring(bar + 1);
  const pn = nm(m, p);
  const cn = (m.namespace as XNamespace).getName(c);
  r.v('attributeNames', () => m.attributeNames(pn, cn));
  r.v('attributeNamesReq', () => m.attributeNames(pn, cn, true));
  const attrs: XmlSchemaAttribute[] = [...m.attributes(pn, cn)];
  for (const a of [...attrs.map((x) => x.name), 'NoSuchAttribute']) {
    const sa = attrs.find((x) => x.name === a);
    if (sa !== undefined) {
      r.v('attr:' + a, () => `${E(XmlSchemaUse, sa.use)}|${N(sa.defaultValue)}|${N(sa.fixedValue)}|${E(XmlTypeCode, XmlSchemaManager.attributeValueType(sa))}`);
      r.v('attr:' + a + ':annotation', () => m.getAnnotation(sa));
      r.v('attr:' + a + ':enumeration', () => {
        const t = sa.attributeSchemaType;
        return t === null || t.union !== null || t.list !== null ? null : t.enumeration;
      });
      r.v('attr:' + a + ':datatype', () => (sa.attributeSchemaType === null ? null : E(XmlTypeCode, sa.attributeSchemaType.datatype.typeCode)));
    }
    r.v('attr:' + a + ':restrictions', () => m.attributeValueRestrictions(pn, cn, a));
    r.v('attr:' + a + ':valueType', () => E(XmlTypeCode, m.attributeValueType(pn, cn, a)));
    r.v('attr:' + a + ':defined', () => m.isDefinedAttribute(pn, cn, a));
    r.v('attr:' + a + ':required', () => m.isRequiredAttribute(pn, cn, a));
  }
  r.v('childElementNames', () => m.childElementNames(pn, cn, false));
  r.v('childElementNamesChoice', () => m.childElementNames(pn, cn, true));
  r.v('childElements', () => m.childElements(pn, cn));
  r.v('childElementsChoice', () => m.childElements(pn, cn, true));
  r.v('choices', () => m.choices(pn, cn));
  r.v('isChoice', () => m.isChoice(p, c));
  r.v('maxOccurence', () => m.maxOccurence(p, c));
  r.v('minOccurence', () => m.minOccurence(pn, cn));
  const se = m.schemaElement(pn, cn);
  r.v('schemaElement', () => se);
  r.v('annotation', () => m.getAnnotation(se));
  if (se !== null) {
    r.v('acceptsAny', () => XmlSchemaManager.acceptsAny(se));
    r.v('isChoiceForOneElement', () => XmlSchemaManager.isChoiceForOneElement(se));
    r.v('datatype', () => {
      const t = se.elementSchemaType?.datatype ?? null;
      return t === null ? null : E(XmlTypeCode, t.typeCode);
    });
    if (se.elementSchemaType instanceof XmlSchemaSimpleType) {
      r.v('enumeration', () => (se.elementSchemaType.union === null && se.elementSchemaType.list === null ? se.elementSchemaType.enumeration : null));
    }
    r.v('infoMaxOccurrence', () => m.elements.get((p ?? '') + c)?.maxOccurrence ?? -1);
  }
  r.v('hasChoiceOfElements', () => {
    const x = m.hasChoiceOfElements(pn, cn);
    return B(x.result) + '|' + B(x.onlyOne);
  });
  r.v('hasSequenceOfSimpleElements', () => {
    const x = m.hasSequenceOfSimpleElements(pn, cn);
    return B(x.result) + '|' + B(x.onlyOne);
  });
  r.v('valueType', () => E(XmlTypeCode, m.valueType(pn, cn)));
  r.v('createElement', () => m.createElement(pn, cn));
  r.v('createElementAll', () => m.createElement(pn, cn, true));
  if (p === null || c.length === 0) return;
  const parent = new XElement(pn!);
  r.v('canAddNew0', () => m.canAddNew(parent, cn));
  r.v('isParent', () => m.isParent(parent, cn));
  r.v('siblingBefore0', () => m.siblingBefore(parent, cn));
  r.v('insertNew1', () => m.insertNew(parent, cn));
  r.v('canAddNew1', () => m.canAddNew(parent, cn));
  r.v('siblingBefore1', () => m.siblingBefore(parent, cn));
  r.v('insertNew2', () => m.insertNew(parent, cn, true));
  r.v('canAddNew2', () => m.canAddNew(parent, cn));
  r.v('insert', () => m.insert(parent, new XElement(cn, 'x')));
  r.v('addNew', () => m.addNew(parent, cn, 'content'));
  r.v('parent', () => parent);
  for (const a of [...attrs.map((x) => x.name), 'NoSuchAttribute']) {
    const ch = new XElement(cn);
    new XElement(pn!, ch);
    r.v('createAttribute:' + a, () => m.createAttribute(ch, a));
    r.v('createAttribute:' + a + ':el', () => ch);
  }
  r.v('createAttributeDetached', () => m.createAttribute(new XElement(cn), attrs[0]?.name ?? 'Name'));
}

function schemaMisc(r: Rec, m: any, tag: string): void {
  r.v('namespace', () => m.namespace.namespaceName);
  r.v('schemaLocation', () => m.schemaLocation);
  r.v('schemaSet', () => m.schemaSet !== null);
  r.v('annotationNull', () => m.getAnnotation(null));
  r.v('annotationNullAttr', () => m.getAnnotation(null));
  r.v('attributeValueTypeNull', () => E(XmlTypeCode, XmlSchemaManager.attributeValueType(null)));
  for (const name of ['CAEXFile', 'InternalElement', 'Other']) {
    const e1 = new XElement(m.namespace.getName(name), new XAttribute('A', '1'));
    r.do('setSchemaVersion:' + name, () => m.setSchemaVersion(e1));
    r.v('setSchemaVersion:' + name + ':el', () => e1);
  }
  for (const ns of [XNamespace.None, XNamespace.get('http://www.dke.de/CAEX'), XNamespace.get('urn:other')]) {
    const e2 = new XElement(
      ns.getName('CAEXFile'),
      new XAttribute(XNamespace.Xmlns.getName('x'), 'urn:x'),
      new XAttribute(XNamespace.get('urn:x').getName('Foo'), '1'),
      new XAttribute('FileName', 'a.aml'),
      new XElement(ns.getName('AdditionalInformation'), new XAttribute('AutomationMLVersion', '2.0')),
      new XElement('AdditionalInformation', new XAttribute('AutomationMLVersion', '2.0')),
    );
    r.do('adjust:' + ns.namespaceName, () => m.adjustCAEXFileToSchema(e2));
    r.v('adjust:' + ns.namespaceName + ':el', () => e2);
  }
  {
    const e3 = new XElement(XNamespace.get('urn:y').getName('InternalElement'), new XAttribute(XNamespace.get('urn:y').getName('Name'), 'n'), new XAttribute('ID', 'i'));
    r.do('adjustName', () => m.constructor.adjustNameToSchema(e3));
    r.v('adjustName:el', () => e3);
  }
  const dir = join(workDir, 'schema-' + tag);
  mkdirSync(dir, { recursive: true });
  for (const folder of [dir, dir + sep, join(workDir, 'missing-' + tag, 'x')]) {
    const root = new XElement(m.namespace.getName('CAEXFile'));
    r.do('setSchemaLocation:' + folder, () => m.setSchemaLocation(root, folder));
    r.v('setSchemaLocation:' + folder + ':el', () => root);
    r.do('setSchemaLocationAgain', () => m.setSchemaLocation(root, folder));
    r.v('setSchemaLocationAgain:el', () => root);
  }
  for (const f of readdirSync(dir).sort()) r.add('file:' + f + '=' + hashBytes(readFileSync(join(dir, f))));
}

// ================================================================ 2. xmlext

const SweepDocs = [
  'docs:map215.aml', 'docs:map30.aml', '12_MirrorObject.aml', '13_Facet.aml', '9_ExtInt_IntLink.aml', '10_RefSemantic.aml',
  '6_RCL.aml', '5_SUC.aml', '7_ICL.aml', '11_Constraints.aml', 'legacy-caex215.aml', 'Topology.aml', 'plant.aml',
  'AutomationML_Base_Libraries_AMLEd2_2.11.0.aml', '2016_OPCF_UA-Nodeset-AML_Topology.aml',
];

const doc = (key: string): any => (key.startsWith('docs:') ? load(join(inputDir, 'docs', key.substring(5))) : corpus(key));

const SchemaPreds = [
  'IsAdditionalInformation', 'IsAttributeOrType', 'IsAttribute', 'IsAttributeMirror', 'IsAttributeNameMapping', 'IsAttributeType',
  'IsAttributeTypeLib', 'IsBasicAttribute', 'IsCAEXClass', 'IsCAEXFile', 'IsElementWithMandatoryID', 'IsElementWithIDReference',
  'IsElementWithNameAndIDReference', 'IsElementWithNameOnlyReference', 'IsElementWithPathReference', 'IsElementWithPossibleIDReference',
  'IsExternalInterface', 'IsExternalReference', 'IsFacet', 'IsICMirror', 'IsIEMirror', 'IsInstanceHierarchy',
  'IsInterfaceAttributeReferenceWithID', 'IsInterfaceClass', 'IsInterfaceClassLib', 'IsInterfaceIDMapping', 'IsInterfaceNameMapping',
  'IsInternalElement', 'IsInternalLink', 'IsLibrary', 'IsMappingElement', 'IsMirrorElement', 'IsNewVersion', 'IsOldVersion',
  'IsVersionReference', 'IsRevision', 'IsRoleClass', 'IsRoleClassLib', 'IsRoleRequirement', 'IsSupportedRoleClass',
  'IsSystemUnitClass', 'IsSystemUnitClassLib',
];

const XS: any = XmlCAEXSchema;
const XA: any = XmlCAEXAttributes;
const XM: any = XmlCAEXMapping;
const XC: any = XmlClassOperation;
const XO: any = XmlOperation;

function bits(e: XElement): string {
  let s = '';
  for (const n of SchemaPreds) {
    try {
      s += XS[n[0].toLowerCase() + n.substring(1)](e) ? '1' : '0';
    } catch {
      s += '!';
    }
  }
  return s;
}

const short = (s: string | null) => (s === null || s === undefined ? 'null' : s.length > 80 ? '#' + hash(s) : s);

function desc(x: XElement | null | undefined, all: XElement[]): string {
  if (x === null || x === undefined) return 'null';
  const i = all.indexOf(x);
  return i >= 0 ? '#' + i : 'ext:' + x.name.localName + '/' + (x.attribute('Name')?.value ?? '');
}

const descs = (xs: Iterable<XElement> | null, all: XElement[]) => (xs === null ? 'null' : '[' + [...xs].map((x) => desc(x, all)).join(',') + ']');

const tuples = (o: Iterable<{ name: string; value: string | null }>) => '[' + [...o].map((t) => t.name + '=' + N(t.value)).join(',') + ']';

function xmlExtSection(o: Section): void {
  for (const key of SweepDocs) kase(o, key, (r) => xmlSweep(r, doc(key)));
  kase(o, 'edges', xmlEdges);
}

function xmlSweep(r: Rec, d: any): void {
  const root: XElement = d.xDocument.root;
  const all: XElement[] = [...root.descendantsAndSelf()];
  for (let i = 0; i < all.length; i++) {
    const e = all[i];
    const ns = e.name.namespace;
    const p = '#' + i + ':' + e.name.localName;
    r.add(p + '|bits=' + bits(e));
    r.v(p + '|iaref', () => XS.isInterfaceAttributeReferenceWithID(e, 'id-ei1'));
    r.v(p + '|classNoLib', () => XS.isCAEXClass(e, false));
    r.v(p + '|idRef', () => XS.isElementWithIDReference(e, 'id-ei1'));
    r.v(p + '|pathRef', () => XS.isElementWithPathReference(e, 'ICLib/IC1'));
    r.v(p + '|refs', () => F(XS.nameReferenceAttributes(e)) + F(XS.pathReferenceAttributes(e)) + F(XS.idReferenceAttributes(e)) + '|' + F(XS.pathReferenceAttributeName(e)) + '|' + F(XS.pathReferenceValue(e)));
    r.v(p + '|name', () => XS.name(e));
    r.v(p + '|value', () => short(XS.value(e)));
    r.v(p + '|refEl', () => desc(XS.referencedElement(e, null), all));
    r.v(p + '|refElNew', () => desc(XS.referencedElement(e, 'ICLib/IC1'), all));
    r.v(p + '|manager', () => XS.schemaManager(e).constructor.name);
    r.v(p + '|xname', () => XS.xName(e, 'Attribute'));
    r.v(p + '|baseClass', () => desc(XC.baseClass(e), all));
    r.v(p + '|hierarchy', () => descs(XC.getReferenceHierarchy(e), all));
    if (e.parent !== null) {
      r.v(p + '|derivedAttr', () => XC.isDerived(e, e.parent, ns.getName('Attribute'), 'Name'));
      r.v(p + '|derivedIH', () => XC.isDerived(e, root, XName.get('InstanceHierarchy'), 'Name'));
    }
    r.v(p + '|descendant', () => B(XC.isDescendant(e, root, true)) + B(XC.isDescendant(e, root, false)) + B(XC.isDescendant(e, e, false)) + B(XC.isDescendant(root, e, true)));
    r.v(p + '|facetElement', () => XC.isFacetElement(e));
    r.v(p + '|overridden', () => XC.isOverridden(e));
    r.v(p + '|library', () => desc(XC.library(e, ns.getName('InstanceHierarchy')), all) + '|' + N(XC.libraryName(e, ns.getName('SystemUnitClassLib'))));
    r.v(p + '|overriddenElements', () => descs(XC.overriddenElements(e, e.attribute('Name')?.value ?? null), all));
    r.v(p + '|first', () => desc(XO.firstElement(e), all) + desc(XO.firstElement(e, 'Attribute'), all) + desc(XO.lastElement(e), all) + desc(XO.lastElement(e, ns.getName('Attribute')), all));
    r.v(p + '|mapping', () => Tr(() => XM.mappingPathToRoleReference(e)) + '|' + Tr(() => XM.mappingPathToSystemUnitClassReference(e)) + '|' + Tr(() => desc(XM.roleReferenceToMapping(e), all)) + '|' + Tr(() => desc(XM.systemUnitClassReferenceToMapping(e), all)));
    r.v(
      p + '|attrs',
      () =>
        Tr(() => XA.caexPath(e)) + '|' + Tr(() => XA.roleReference(e)) + '|' + Tr(() => XA.systemUnitClassReference(e)) + '|' + Tr(() => XA.attributeMasterID(e)) + '|' + Tr(() => XA.icMasterID(e)) + '|' + Tr(() => XA.ieMasterID(e)) + '|' + Tr(() => tuples(XA.idReferencesInInternalLink(e))) + '|' + Tr(() => tuples(XA.idReferenceInMapping(e))),
    );
    const isMapping = XS.isMappingElement(e);
    for (const a of e.attributes()) {
      const q = p + '@' + a.name.localName;
      r.v(q, () => B(XS.isAttributeReference(a)) + B(XS.isInternalLinkAttribute(a)) + B(XA.isInheritanceAttribute(a)) + '|' + N(XS.name(a)) + '|' + short(XS.value(a)));
      r.v(q + '|refEl', () => desc(XS.referencedElement(a, null), all));
      r.v(q + '|refElName', () => desc(XS.referencedElement(a, 'id-ei1'), all));
      if (isMapping) {
        r.v(q + '|fromMapping', () => desc(XM.referencedElementFromMapping(a, null), all));
        r.v(q + '|fromMappingName', () => desc(XM.referencedElementFromMapping(a, 'x'), all));
        r.v(q + '|roleFromMapping', () => desc(XM.roleFromMapping(a), all));
        r.v(q + '|sucFromMapping', () => desc(XM.systemUnitClassFromMapping(a), all));
      }
      if (a.name.localName === 'RefPartnerSideA' || a.name.localName === 'RefPartnerSideB') r.v(q + '|interface', () => desc(XO.interfaceFromInternalLinkAttribute(a, 'id-child:EI2'), all));
      if (a.name.localName === 'RefAttributeType') r.v(q + '|master', () => desc(XO.masterAttribute(a, 'ATLib/AT2'), all));
    }
  }
}

function xmlEdges(r: Rec): void {
  const all: XElement[] = [];
  r.v('nameNull', () => XS.name(null));
  r.v('valueNull', () => XS.value(null));
  r.v('nameComment', () => XS.name(new XComment('c')));
  r.v('valueComment', () => XS.value(new XComment('c')));
  r.v('refElNull', () => XS.referencedElement(null, null));
  r.v('refElComment', () => XS.referencedElement(new XComment('c'), null));
  r.v('xnameNull', () => XS.xName(null, 'Attribute'));
  r.v('descendantNull', () => XC.isDescendant(null, new XElement('a'), true));
  r.v('descendantNull2', () => XC.isDescendant(null, null, false));
  r.v('mapRoleNull', () => XM.mappingPathToRoleReference(null));
  r.v('mapSucNull', () => XM.mappingPathToSystemUnitClassReference(null));
  r.v('interfaceNull', () => XO.interfaceFromInternalLinkAttribute(null, null));
  r.v('interfaceDetached', () => XO.interfaceFromInternalLinkAttribute(new XAttribute('RefPartnerSideA', 'x'), null));
  r.v('masterNull', () => XO.masterAttribute(null, null));
  r.v('masterDetached', () => XO.masterAttribute(new XAttribute('RefAttributeType', 'x'), null));
  r.v('wrapperNull', () => XO.createCAEXWrapper(null));
  r.v('wrapperOther', () => XO.createCAEXWrapper(new XElement('Other')));
  const detached = new XElement('InternalElement', new XAttribute('Name', 'x'), new XElement('Attribute', new XAttribute('Name', 'a')));
  r.v('overriddenDetachedRoot', () => descs(XC.overriddenElements(detached, 'x'), all));
  r.v('overriddenDetachedChild', () => descs(XC.overriddenElements([...detached.elements()][0], 'a'), all));
  r.v('overriddenElementsFacet', () => {
    const suc = new XElement(
      'SystemUnitClass',
      new XAttribute('Name', 'S'),
      new XElement('Attribute', new XAttribute('Name', 'a')),
      new XElement(
        'InternalElement',
        new XAttribute('Name', 'F'),
        new XAttribute('ID', 'f'),
        new XElement('Attribute', new XAttribute('Name', 'a')),
        new XElement('RoleRequirements', new XAttribute('RefBaseRoleClassPath', 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Facet')),
      ),
    );
    const fa = suc.element('InternalElement')!.element('Attribute')!;
    return descs(XC.overriddenElements(fa, 'a'), all) + B(XC.isFacetElement(fa)) + B(XC.isOverridden(fa));
  });
  r.v('firstEmpty', () => XO.firstElement(new XElement('a'), 'b'));
  r.v('firstText', () => desc(XO.firstElement(new XElement('a', 't', new XElement('c'), new XElement('b')), 'b'), all));
  r.v('firstTextNoName', () => desc(XO.firstElement(new XElement('a', 't', new XElement('c'))), all));
}

// ================================================================ 3. query

const QueryDocs = [
  'docs:map215.aml', 'docs:map30.aml', '12_MirrorObject.aml', '13_Facet.aml', '9_ExtInt_IntLink.aml', '10_RefSemantic.aml',
  '6_RCL.aml', '5_SUC.aml', 'legacy-caex215.aml', 'Topology.aml', 'plant.aml', 'bottling-line.links.aml',
  'AutomationML_Base_Libraries_AMLEd2_2.11.0.aml',
];

const long = (s: string) => (s.length > 300 ? '#' + hash(s) + '/' + s.length : s);
const R = (r: any) => (r === null || r === undefined ? 'null' : D(r.caexObject) + '.' + N(r.referenceAttributeName) + '=' + N(r.referenceAttributeValue));
const Rs = (rs: Iterable<any> | null) => (rs === null ? 'null' : long('[' + [...rs].map(R).join(',') + ']'));
const LK = (lk: any) =>
  lk === null || lk === undefined ? 'null' : long(lk.count + '{' + [...lk].map((g: any) => N(g.key) + ':[' + [...g].map(R).join(',') + ']').join(';') + '}');
const Ws = (ws: Iterable<any> | null) => (ws === null ? 'null' : long('[' + [...ws].map((w) => D(w)).join(',') + ']'));

function querySection(o: Section): void {
  for (const key of QueryDocs) {
    kase(o, key + ':plain', (r) => querySweep(r, doc(key), false));
    kase(o, key + ':tables', (r) => querySweep(r, doc(key), true));
  }
  kase(o, 'edges', queryEdges);
}

function querySweep(r: Rec, d: any, tables: boolean): void {
  const q: any = ServiceLocator.queryService;
  const QR: any = QueryResult;
  if (tables) {
    r.do('loadID', () => q.loadIDTable(d));
    r.do('loadPath', () => q.loadPathTable(d));
  }
  r.v('idLoaded', () => q.idTableIsLoaded(d));
  r.v('pathLoaded', () => q.pathTableIsLoaded(d));
  r.v('docIdentified', () => LK(QR.allElementsIdentifiedByCAEXPath(d)));
  r.v('docAlias', () => LK(QR.allElementsWithAliasReference(d)));
  r.v('docPathRef', () => LK(QR.allElementsWithCAEXPathReference(d)));
  r.v('docIdRef', () => LK(QR.allElementsWithIDReference(d)));
  r.v('docIds', () => LK(QR.allElementsWithIDs(d)));
  r.v('docNameRef', () => LK(QR.allElementsWithNameReference(d)));
  r.v('docMasters', () => Ws(QR.allInternalElementMasters(d)));
  r.v('docMirrors', () => Ws(QR.allInternalElementMirrors(d)));
  r.v('docILRelations', () => Ws(QR.elementsWithInternalLinkRelations(d)));
  const idRefs = QR.allElementsWithIDReference(d);
  r.v('lkObjects', () => Ws(QR.allCaexObjects(idRefs)));
  r.v('lkOfType', () => Ws(QR.caexObjectsOfType(idRefs, T.InternalElementType)));
  r.v('lkInterfaces', () => Ws(QR.externalInterfaces(idRefs)));
  r.v('lkIEs', () => Ws(QR.internalElements(idRefs)));
  r.v('lkLinks', () => Ws(QR.internalLinks(idRefs)));
  r.v('lkWithName', () => Ws(QR.referencesWithName(idRefs, 'RefPartnerSideA')));
  const pathRefs = QR.allElementsWithCAEXPathReference(d);
  r.v('lkPathWithName', () => Ws(QR.referencesWithName(pathRefs, 'RefBaseSystemUnitPath')));
  r.v('lkPathOfType', () => Ws(QR.caexObjectsOfType(pathRefs, T.SystemUnitClassType)));
  for (const er of d.caexFile.externalReference) {
    const alias = er.alias;
    r.v('docAliasRef:' + alias, () => Rs(QR.elementsWithAliasReference(d, alias)));
    r.v('aliasRef:' + alias, () => Rs(q.elementsWithAliasReference(d.caexFile, alias, 'InternalElement')));
  }
  r.v('dataRefs', () => Ws(q.allExternalDataReferences(d)));
  r.v('dataRefsFile', () => Ws(q.allExternalDataReferences(d, d.caexFile)));
  r.v('ofType', () => Ws(q.allExternalInterfacesOfType(d, 'ICLib/IC1')));
  r.v('ofTypeAml', () => Ws(q.allExternalInterfacesOfType(d, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector')));
  const all: XElement[] = [...d.xDocument.root.descendantsAndSelf()];
  for (let i = 0; i < all.length; i++) {
    const w: any = XmlOperation.createCAEXWrapper(all[i]);
    if (!(w instanceof T.CAEXBasicObject)) continue;
    const bo = w;
    const p = '#' + i + ':' + all[i].name.localName;
    if (bo instanceof T.CAEXObject) {
      const co = bo;
      const path = co.caexPath();
      r.v(p + '|classRefs', () => Ws(q.allClassReferences(co)));
      r.v(p + '|classRefsDeep', () => Ws(q.allClassReferencesDeep(co)));
      r.v(p + '|classRefsDoc', () => Ws(q.allClassReferences(d, path, 'InternalElement')));
      r.v(p + '|classRefsDeepDoc', () => Ws(q.allClassReferencesDeep(d, path)));
      r.v(p + '|referenced', () => q.isReferenced(co));
      r.v(p + '|pathRef', () => Rs(q.elementsWithCAEXPathReference(d.caexFile, path)));
      r.v(p + '|pathRefDoc', () => Rs(QR.elementsWithCAEXPathReference(d, path)));
      r.v(p + '|findByPath', () => D(q.findByPath(d, path)));
      if (co.id !== null) {
        r.v(p + '|idRef', () => Rs(q.elementsWithIDReference(d.caexFile, co.id)));
        r.v(p + '|idRefIE', () => Rs(q.elementsWithIDReference(co, co.id, 'InternalElement')));
        r.v(p + '|idRefDoc', () => Rs(QR.elementsWithIDReference(d, co.id)));
        r.v(p + '|ids', () => LK(q.allElementsWithIDs(co, co.id)));
        r.v(p + '|findByID', () => D(q.findByID(d, co.id)) + D(q.findByID(d, co.id, true, T.InternalElementType)) + D(q.findByID(d, co.id, false, T.ExternalInterfaceType)));
      }
    }
    r.v(p + '|idsAll', () => LK(q.allElementsWithIDs(bo)));
    r.v(p + '|withLinks', () => Ws(q.allElementsWithInternalLinks(bo)));
    r.v(p + '|ieWithLinks', () => Ws(q.allInternalElementsWithInternalLinks(bo)));
    r.v(p + '|linkRelations', () => Ws(q.elementsWithInternalLinkRelations(bo)));
    r.v(p + '|ifRelations', () => Ws(q.interfacesWithInternalLinkRelations(bo)));
    r.v(p + '|identified', () => LK(q.allElementsIdentifiedByCAEXPath(bo)));
    r.v(p + '|nameRef', () => LK(q.allElementsWithNameReference(bo, 'InternalLink')));
    r.v(p + '|pathRefAll', () => LK(q.allElementsWithCAEXPathReference(bo, '', true)));
    r.v(p + '|pathRefAllIE', () => LK(q.allElementsWithCAEXPathReference(bo, 'InternalElement', true)));
    r.v(p + '|aliasAll', () => LK(q.allElementsWithAliasReference(bo, 'SystemUnitClass')));
    r.v(p + '|idRefAll', () => LK(q.allElementsWithIDReference(bo, 'InternalLink')));
    if (bo instanceof T.InternalElementType) {
      r.v(p + '|ieMirrors', () => Ws(q.internalElementMirrors(bo)));
      r.v(p + '|ieMirrorsExt', () => Ws(QR.internalElementMirrors(bo)));
      r.v(p + '|ieMaster', () => q.isMaster(bo));
    } else if (bo instanceof T.ExternalInterfaceType) {
      r.v(p + '|eiMirrors', () => Ws(q.externalInterfaceMirrors(bo)));
      r.v(p + '|eiMaster', () => q.isMaster(bo));
      r.v(p + '|linksToIf', () => Ws(q.internalLinksToInterface(bo)));
      r.v(p + '|linksToIfExt', () => Ws(QR.internalLinksToInterface(bo)));
    } else if (bo instanceof T.AttributeType) {
      r.v(p + '|atMirrors', () => Ws(q.attributeMirrors(bo)));
      r.v(p + '|atMaster', () => q.isMaster(bo));
    }
    if (bo instanceof T.SystemUnitClassType) {
      r.v(p + '|linksToEl', () => Ws(q.internalLinksToElement(bo)));
      r.v(p + '|linksToElExt', () => Ws(QR.internalLinksToElement(bo)));
    }
  }
  if (tables) {
    r.do('unloadID', () => q.unloadIDTable(d));
    r.do('unloadPath', () => q.unloadPathTable(d));
    r.v('idLoaded2', () => q.idTableIsLoaded(d));
    r.v('pathLoaded2', () => q.pathTableIsLoaded(d));
  }
}

function queryEdges(r: Rec): void {
  const q: any = ServiceLocator.queryService;
  const d = doc('docs:map30.aml');
  r.v('atMirrorsNull', () => Ws(q.attributeMirrors(null)));
  r.v('eiMirrorsNull', () => Ws(q.externalInterfaceMirrors(null)));
  r.v('ieMirrorsNull', () => Ws(q.internalElementMirrors(null)));
  r.v('linksToElNull', () => Ws(q.internalLinksToElement(null)));
  r.v('linksToIfNull', () => Ws(q.internalLinksToInterface(null)));
  r.v('idRefNull', () => Rs(q.elementsWithIDReference(null, 'x')));
  r.v('pathRefNull', () => Rs(q.elementsWithCAEXPathReference(null, 'x')));
  r.v('idRefNullId', () => Rs(q.elementsWithIDReference(d.caexFile, null)));
  r.v('pathRefNullPath', () => Rs(q.elementsWithCAEXPathReference(d.caexFile, null)));
  r.v('findByIDNull', () => D(q.findByID(null, 'x')));
  r.v('findByPathNull', () => D(q.findByPath(null, 'x')));
  r.v('findByIDNullId', () => D(q.findByID(d, null)));
  r.v('findByPathNullPath', () => D(q.findByPath(d, null)));
  r.v('idLoadedNull', () => q.idTableIsLoaded(null));
  r.v('pathLoadedNull', () => q.pathTableIsLoaded(null));
  const ie = CAEXDocument.new_CAEXDocument().caexFile!.instanceHierarchy.append('IH').internalElement.append('Detached');
  ie.remove();
  for (const tables of [false, true]) {
    if (tables) {
      q.loadIDTable(d);
      q.loadPathTable(d);
    }
    const t = tables ? 'T' : 'P';
    r.v(t + 'detachedIds', () => LK(q.allElementsWithIDs(ie)));
    r.v(t + 'detachedIdsId', () => LK(q.allElementsWithIDs(ie, 'x')));
    r.v(t + 'detachedIdentified', () => LK(q.allElementsIdentifiedByCAEXPath(ie)));
    r.v(t + 'detachedReferenced', () => q.isReferenced(ie));
    r.v(t + 'detachedMaster', () => q.isMaster(ie));
    r.v(t + 'detachedMirrors', () => Ws(q.internalElementMirrors(ie)));
    r.v(t + 'detachedLinks', () => Ws(q.internalLinksToElement(ie)));
    r.v(t + 'detachedClassRefs', () => Ws(q.allClassReferences(ie)));
    r.v(t + 'detachedClassRefsDeep', () => Ws(q.allClassReferencesDeep(ie)));
    r.v(t + 'missingId', () => LK(q.allElementsWithIDs(d.caexFile, 'no-such-id')));
    r.v(t + 'findMissing', () => D(q.findByID(d, 'no-such-id')) + D(q.findByPath(d, 'No/Such/Path')));
  }
  q.unloadIDTable(d);
  q.unloadPathTable(d);
  const d3 = doc('docs:map30.aml');
  const ie1: any = [...[...d3.caexFile.instanceHierarchy][0].internalElement][0];
  ie1.remove();
  r.v('detachedContentIds', () => LK(q.allElementsWithIDs(ie1, 'id-child')) + LK(q.allElementsWithIDs(ie1, 'id-ei1')));
  r.v('detachedContentLinks', () => Ws(q.internalLinksToElement(ie1)));
  r.v('detachedChildLinks', () => Ws(q.internalLinksToElement([...ie1.internalElement][0])));
  r.v('emptyLookup', () => LK(EmptyLookup.instance));
  r.v('emptyLookupCount', () => EmptyLookup.instance.count);
  r.v('emptyLookupItem', () => Rs(EmptyLookup.instance.item('x')));
  r.v('emptyLookupContains', () => EmptyLookup.instance.contains('x'));
  r.v('emptyLookupKeySelector', () => EmptyLookup.keySelector(null));
  const lk = QueryResult.allElementsWithIDs(d);
  r.v('lookupCount', () => lk.count);
  r.v('lookupItem', () => Rs(lk.item('id-ei1')));
  r.v('lookupItemMissing', () => Rs(lk.item('nope')));
  r.v('lookupContains', () => B(lk.contains('id-ei1')) + B(lk.contains('nope')));
}

// ================================================================ 4. services

class TestSigning extends SignatureServiceBase {
  generateKeys(passPhrase: string | null) {
    return { publicKey: 'pub:' + passPhrase, privateKey: 'priv:' + passPhrase };
  }
  toEnvelopedSignature(): any {
    return null;
  }
  protected verifySignatureWithPublicKey(_o: any, publicKey: string | null): boolean | null {
    return publicKey === null ? null : publicKey === 'ok';
  }
}

class TestTransform {
  readonly transformationEnded = new EventSource<any>();
  readonly transformationStarted = new EventSource<any>();
  transformTo(): any {
    return null;
  }
  start(e: any): void {
    this.transformationStarted.raise(this, e);
  }
  end(e: any): void {
    this.transformationEnded.raise(this, e);
  }
}
registerInterfaces(TestTransform, 'ISchemaTransform', 'IAMLService');

class TestIDService {
  private n = 0;
  generateNewID(arg?: unknown): string {
    if (arg instanceof T.CAEXObject) return 'obj-' + ++this.n;
    if (arg instanceof XElement) return 'el-' + ++this.n;
    return 'id-' + ++this.n;
  }
}
registerInterfaces(TestIDService, 'ICaexIDService', 'IAMLService');

class TestUniqueName {
  readonly log: string[] = [];
  isUniqueCAEXName(): boolean {
    return true;
  }
  registerDefault(): void {}
  uniqueCAEXName(): string {
    return 'u';
  }
  suspend(): void {
    this.log.push('suspend');
  }
  resume(): void {
    this.log.push('resume');
  }
}
registerInterfaces(TestUniqueName, 'IUniqueName', 'IAMLService', 'ISuspendable');

class TestAutoUpdate {
  isAutoUpdateEnabled = false;
  readonly referenceUpdated = new EventSource<any>();
}
registerInterfaces(TestAutoUpdate, 'IAutoUpdate', 'IAMLService');

const svc = (s: any) => (s === null || s === undefined ? 'null' : s.constructor.name);
const SL: any = ServiceLocator;
const Schema: any = CAEXDocument_CAEXSchema;

function servicesSection(o: Section): void {
  kase(o, 'locator', serviceLocatorCases);
  kase(o, 'reference', caexReferenceCases);
  kase(o, 'eventArgs', eventArgsCases);
  for (const key of ['docs:map30.aml', 'docs:map215.aml', '13_Facet.aml']) kase(o, 'signing:' + key, (r) => signingCases(r, key));
}

function serviceLocatorCases(r: Rec): void {
  r.v('query', () => svc(SL.queryService));
  r.v('id', () => svc(SL.idService));
  r.v('autoUpdate', () => svc(SL.autoUpdateService));
  r.v('resolver', () => svc(SL.externalReferenceResolverService));
  r.v('undo', () => svc(SL.undoRedoService));
  r.v('unique', () => svc(SL.uniqueNameService));
  r.v('gitHub', () => svc(SL.gitHubAccessService));
  r.v('getQuery', () => svc(SL.getService('IQuery')));
  r.v('getService', () => svc(SL.getService('IAMLService')));
  r.v('getQueryClass', () => svc(SL.getService(T.QueryService)));
  r.v('unRegisterDefaultQuery', () => svc(SL.unRegister('IQuery')));
  r.v('unRegisterDefaultID', () => svc(SL.unRegister('ICaexIDService')));
  r.v('unRegisterMissing', () => svc(SL.unRegister('IUndoRedo')));
  const ids = new TestIDService();
  r.do('registerID', () => SL.register(ids, 'ICaexIDService'));
  r.v('idAfter', () => svc(SL.idService));
  r.v('newID', () => SL.idService.generateNewID());
  r.v('newIE', () => CAEXDocument.new_CAEXDocument().caexFile!.instanceHierarchy.append('IH').internalElement.append('IE').id);
  r.v('unRegisterID', () => svc(SL.unRegister('ICaexIDService')));
  r.v('idRestored', () => svc(SL.idService));
  const q2 = new T.QueryService();
  r.do('registerQuery', () => SL.register(q2, 'IQuery'));
  r.v('queryAfter', () => SL.queryService === q2);
  r.v('unRegisterQuery', () => SL.unRegister('IQuery') === q2);
  r.v('queryRestored', () => SL.queryService === q2);
  const au = new TestAutoUpdate();
  r.do('registerAutoUpdate', () => SL.register(au));
  r.v('autoUpdateFallback', () => svc(SL.autoUpdateService));
  r.v('unRegisterAutoUpdateByInterface', () => svc(SL.unRegister('IAutoUpdate')));
  r.v('unRegisterAutoUpdate', () => svc(SL.unRegister(TestAutoUpdate)));
  r.v('autoUpdateGone', () => svc(SL.autoUpdateService));
  const un = new TestUniqueName();
  let started: any = null;
  r.do('begin', () => {
    started = SL.beginService(() => {
      SL.register(un, 'IUniqueName');
      return un;
    }, 'IUniqueName').service;
  });
  r.v('begun', () => svc(started) + '|' + un.log.join(','));
  let again: any = null;
  r.do('beginAgain', () => {
    again = SL.beginService(() => new TestUniqueName(), 'IUniqueName').service;
  });
  r.v('begunAgain', () => B(again === un) + '|' + un.log.join(','));
  let calls = 0;
  r.do('end', () =>
    SL.endService(() => {
      calls++;
      SL.unRegister('IUniqueName');
    }, un),
  );
  r.do('endAgain', () => SL.endService(() => calls++, un));
  r.v('endCalls', () => calls);
  r.v('uniqueGone', () => svc(SL.uniqueNameService));
  const t = new TestTransform();
  r.do('registerTransform', () => SL.register(t, 'ISchemaTransform'));
  for (const [src, target] of [
    ['docs:map215.aml', Schema.CAEX3_0],
    ['docs:map30.aml', Schema.CAEX2_15],
  ] as [string, number][]) {
    const e: any = new SchemaTransformationEventArgs(doc(src), target);
    r.v('args:' + src, () => E(Schema, e.targetSchema) + '|' + B(e.sourceDocument !== null) + '|' + B(e.targetDocument === null));
    r.do('start:' + src, () => t.start(e));
    r.v('target:' + src, () => (e.targetDocument === null ? 'null' : hash(r.c.apply(saveString(e.targetDocument))) + '|' + E(Schema, e.targetDocument.schema)));
    r.do('end:' + src, () => t.end(e));
    r.v('final:' + src, () => (e.targetDocument === null ? 'null' : saveString(e.targetDocument)));
  }
  r.v('unRegisterTransform', () => svc(SL.unRegister('ISchemaTransform')));
  const e2: any = new SchemaTransformationEventArgs(doc('docs:map215.aml'), Schema.CAEX3_0);
  r.do('startAfter', () => t.start(e2));
  r.v('targetAfter', () => e2.targetDocument === null);
  const e3 = new SchemaTransformationEventArgs(null, Schema.CAEX3_0);
  r.do('registerTransform2', () => SL.register(t, 'ISchemaTransform'));
  r.do('startNull', () => t.start(e3));
  r.do('endNull', () => t.end(e3));
  r.v('unRegisterTransform2', () => svc(SL.unRegister('ISchemaTransform')));
  const cs: any = new T.CaexIDService();
  r.v('idObject', () => cs.generateNewID(null));
  r.v('idElement', () => cs.generateNewID(null));
  r.v('idPlain', () => cs.generateNewID());
  r.v('idDistinct', () => cs.generateNewID() !== cs.generateNewID());
}

function caexReferenceCases(r: Rec): void {
  const d = doc('docs:map30.aml');
  const root: XElement = d.xDocument.root;
  const ie = [...root.descendants()].find((e) => e.name.localName === 'InternalElement')!;
  const ver = [...root.descendants()].find((e) => e.name.localName === 'OldVersion')!;
  for (const [label, el, name] of [
    ['ieBase', ie, 'RefBaseSystemUnitPath'],
    ['ieMissing', ie, 'Missing'],
    ['ieValue', ie, 'Value'],
    ['ieEmpty', ie, ''],
    ['ieNull', ie, null],
    ['verValue', ver, 'Value'],
    ['verMissing', ver, 'Other'],
  ] as [string, XElement, string | null][]) {
    const c: any = new CAEXReference(el, name);
    r.v(label + ':object', () => D(c.caexObject));
    r.v(label + ':element', () => c.element.name.localName);
    r.v(label + ':name', () => c.referenceAttributeName);
    r.v(label + ':value', () => short(c.referenceAttributeValue));
    r.do(label + ':set', () => c.setValue('new-' + label));
    r.v(label + ':after', () => short(c.referenceAttributeValue));
    r.do(label + ':setNull', () => c.setValue(null));
    r.v(label + ':afterNull', () => short(c.referenceAttributeValue));
    r.v(label + ':el', () => short(el.toString()));
  }
  const lonely = new XElement('NewVersion');
  const c2 = new CAEXReference(lonely, 'Value');
  r.do('lonely:set', () => c2.setValue('v'));
  r.v('lonely:el', () => lonely);
  const parent = new XElement('Revision', new XElement('NewVersion'));
  const c3 = new CAEXReference(parent.element('NewVersion')!, 'Value');
  r.do('child:set', () => c3.setValue('v2'));
  r.v('child:el', () => parent);
  const c4: any = new CAEXReference(null as any, 'Value');
  r.do('nullElement:set', () => c4.setValue('v'));
  r.v('nullElement:value', () => c4.referenceAttributeValue);
  r.v('nullElement:object', () => D(c4.caexObject));
}

function eventArgsCases(r: Rec): void {
  const el = new XElement('InternalElement', new XAttribute('Name', 'x'), new XAttribute('RefBaseSystemUnitPath', 'A/B'));
  const a = el.attribute('Name')!;
  const U = (u: any) => `${F(u.referencedElement)}|${F(u.reference)}|${N(u.updateValue)}|${N(u.oldValue)}|${u.caexReference === null ? 'null' : R(u.caexReference)}`;
  r.v('two', () => U(new UpdateEventArgs(el, a)));
  r.v('three', () => U(new UpdateEventArgs(el, a, 'nv')));
  r.v('threeNull', () => U(new UpdateEventArgs(null, null, null)));
  r.v('four', () => U(new UpdateEventArgs(el, new CAEXReference(el, 'RefBaseSystemUnitPath'), 'old', 'new')));
  r.v('fourMissing', () => U(new UpdateEventArgs(el, new CAEXReference(el, 'Missing'), 'old', 'new')));
  r.v('fourNullElement', () => U(new UpdateEventArgs(el, new CAEXReference(null as any, 'Name'), null, null)));
  r.v('fourNull', () => U(new UpdateEventArgs(el, null, 'o', 'n')));
  const s: any = new SchemaTransformationEventArgs(null, Schema.CAEX2_15);
  r.v('schemaArgs', () => B(s.sourceDocument === null) + '|' + E(Schema, s.targetSchema) + '|' + B(s.targetDocument === null));
}

function signingCases(r: Rec, key: string): void {
  const d = doc(key);
  const s: any = new TestSigning();
  r.v('keys', () => {
    const k = s.generateKeys('pp');
    return k.publicKey + '|' + k.privateKey;
  });
  r.v('enveloped', () => s.toEnvelopedSignature('i', 'v', 'k'));
  const objs: any[] = [...d.xDocument.root.descendantsAndSelf()].map((e: XElement) => XmlOperation.createCAEXWrapper(e)).filter((w: any) => w instanceof T.CAEXObject);
  for (const obj of objs) r.v('text:' + D(obj), () => short(s.caexNodeToString(obj)));
  const ie = objs.find((x) => x instanceof T.InternalElementType);
  if (ie === undefined) return;
  r.v('compute', () => short(s.computeSignature(ie, 'k', 'p')));
  r.v('create', () => short(s.createSignature(ie, 'k', 'p')));
  r.v('createPub', () => short(s.createSignature(ie, 'k', 'p', 'pub')));
  for (const [k, p] of [
    ['', 'p'],
    [null, 'p'],
    ['k', ''],
    ['k', null],
  ] as [string | null, string | null][]) {
    r.v(`compute:${N(k)}:${N(p)}`, () => s.computeSignature(ie, k, p));
    r.v(`create:${N(k)}:${N(p)}`, () => s.createSignature(ie, k, p));
  }
  r.v('computeNull', () => s.computeSignature(null, 'k', 'p'));
  r.v('createNull', () => s.createSignature(null, 'k', 'p'));
  r.v('verify1', () => s.verifySignature(ie));
  r.v('verify1ok', () => s.verifySignature(ie, 'ok'));
  r.v('verify2', () => s.verifySignature(ie, 'sig', 'pub'));
  r.v('verify2NoSig', () => s.verifySignature(ie, '', 'pub'));
  r.v('verify2NullSig', () => s.verifySignature(ie, null, 'pub'));
  r.v('verify2NoPub', () => s.verifySignature(ie, 'sig', ''));
  r.v('verify2Null', () => s.verifySignature(null, 'sig', 'pub'));
  r.v('header', () => {
    const h = CAEXSignatureHeader.appendSignatureHeader(ie);
    h.value = 'signature-text';
    return h;
  });
  r.v('textWithHeader', () => short(s.caexNodeToString(ie)));
  r.v('header2', () => {
    const h = CAEXSignatureHeader.appendSignatureHeader(ie);
    h.add(new XAttribute('Extra', '1'));
    h.value = 't2';
    return h;
  });
  r.v('textWithHeader2', () => short(s.caexNodeToString(ie)));
  r.v('headerChild', () => {
    const h = CAEXSignatureHeader.appendSignatureHeader(ie);
    h.add(new XElement('Content', 'abc'));
    return h;
  });
  r.v('textWithChild', () => short(s.caexNodeToString(ie)));
  r.v('headerEmpty', () => CAEXSignatureHeader.appendSignatureHeader(ie));
  r.v('textWithEmpty', () => short(s.caexNodeToString(ie)));
  r.do('remove', () => ie.remove());
  r.v('textRemoved', () => short(s.caexNodeToString(ie)));
  r.v('computeRemoved', () => short(s.computeSignature(ie, 'k', 'p')));
}

// ================================================================ 5. model

const Dsig = 'http://www.w3.org/2000/09/xmldsig#';

class TestKeyValue extends KeyValue {
  private modulus: string | null = null;
  getPublicKey(): string | null {
    return this.modulus;
  }
  loadXml(element: XElement | null): void {
    this.modulus = element!.value;
  }
  override getXml(document: unknown = null): XElement {
    const kv = super.getXml(document);
    kv.add(new XElement(XName.get('RSAKeyValue', Dsig), this.modulus ?? ''));
    return kv;
  }
}

const P: any = AMLLibraryServerProfile;
const DPc: any = AMLLibraryServerDataProfile;
const ED: any = AMLEditionEnum;
const inputJson = (name: string): any => JSON.parse(readFileSync(join(inputDir, name), 'utf8'));

const DP = (d: any) =>
  d === null || d === undefined
    ? 'null'
    : `DP(${E(ED, d.automationMLEdition)}|${d.contentType}|${N(d.folder)}|${N(d.userName)}|${N(d.branchOrTag)}|${B(d.passwordHash === null)}|${B(d.isAnonymous)})`;

function profile(r: Rec, p: string, s: any): void {
  r.v(p + ':json', () => s.serialize());
  r.v(p + ':props', () => `${B(s.isAnonymous)}|${B(s.canTryLogin)}|${s.protocolName}|${s.serverURL}|${DP(s.libraryCatalogData)}|${DP(s.classCatalogData)}|${DP(s.signatureData)}`);
  r.v(p + ':password', () => s.password);
  r.v(p + ':dataPasswords', () => (s.libraryData ?? []).map((d: any) => (d === null ? 'null' : N(d.password))).join(','));
}

function modelSection(o: Section): void {
  kase(o, 'profiles', profileLoadCases);
  kase(o, 'profileFiles', profileFileCases);
  kase(o, 'profileApi', profileApiCases);
  kase(o, 'profileUri', profileUriCases);
  kase(o, 'dataProfile', dataProfileCases);
  kase(o, 'hashes', hashCases);
  kase(o, 'edition', editionCases);
  kase(o, 'byteArray', byteArrayCases);
  kase(o, 'signature', signatureCases);
}

function profileLoadCases(r: Rec): void {
  const profiles: string[] = inputJson('profiles.json');
  for (let i = 0; i < profiles.length; i++) {
    let s: any = null;
    r.v('#' + i, () => {
      s = P.loadFromString(profiles[i]);
      return 'ok';
    });
    if (s !== null) profile(r, '#' + i, s);
  }
  r.v('null', () => P.loadFromString(null));
}

function profileFileCases(r: Rec): void {
  const text: string = inputJson('profiles.json')[1];
  const dir = join(workDir, 'profiles');
  mkdirSync(dir, { recursive: true });
  const utf16le = (s: string) => Buffer.from(s, 'utf16le');
  const utf16be = (s: string) => {
    const b = Buffer.from(s, 'utf16le');
    for (let i = 0; i < b.length; i += 2) [b[i], b[i + 1]] = [b[i + 1], b[i]];
    return b;
  };
  const utf32le = (s: string) => {
    const cps = [...s].map((c) => c.codePointAt(0)!);
    const b = Buffer.alloc(cps.length * 4);
    cps.forEach((cp, i) => b.writeUInt32LE(cp, i * 4));
    return b;
  };
  const variants: [string, Uint8Array][] = [
    ['utf8', Buffer.from(text, 'utf8')],
    ['utf8bom', Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text, 'utf8')])],
    ['utf16le', Buffer.concat([Buffer.from([0xff, 0xfe]), utf16le(text)])],
    ['utf16be', Buffer.concat([Buffer.from([0xfe, 0xff]), utf16be(text)])],
    ['utf32le', Buffer.concat([Buffer.from([0xff, 0xfe, 0, 0]), utf32le(text)])],
    ['utf16leNoBom', utf16le('{"UserName":"x"}')],
    ['latin1', Buffer.from('{"UserName":"\u00e9"}', 'latin1')],
    ['empty', new Uint8Array(0)],
  ];
  for (const [name, bytes] of variants) {
    const path = join(dir, name + '.json');
    writeFileSync(path, bytes);
    let s: any = null;
    r.v(name, () => {
      s = P.loadFromFile(path);
      return 'ok';
    });
    if (s !== null) profile(r, name, s);
  }
  r.v('missing', () => P.loadFromFile(join(dir, 'missing.json')));
}

function profileApiCases(r: Rec): void {
  const s: any = new AMLLibraryServerProfile();
  profile(r, 'new', s);
  r.v('constants', () => P.ANONYMOUS + '|' + P.LoginWarning);
  for (let i = 0; i < 4; i++) {
    s.loginFailed();
    r.v('failed' + i, () => s.canTryLogin);
  }
  r.do('reset', () => s.resetFailedLogins());
  r.v('afterReset', () => s.canTryLogin);
  r.do('block', () => s.block());
  r.v('afterBlock', () => s.canTryLogin);
  for (const pw of ['pw', '', null, 'ä€\u0000x', 'z'.repeat(100)]) {
    r.do('setPassword:' + N(pw), () => (s.password = pw));
    r.v('password:' + N(pw), () => N(s.password) + '|' + B(s.passwordHash === null));
  }
  for (const user of ['anonymous', 'Anonymous', null, '']) {
    s.userName = user;
    r.v('anonymous:' + N(user), () => s.isAnonymous);
  }
  for (const p of [0, 1, 2, 3, 4, 5, -1]) {
    s.networkProtocol = p;
    s.serverName = p === 2 ? null : 'srv';
    r.v('protocol:' + p, () => s.protocolName + '|' + s.serverURL);
  }
  s.userName = 'su';
  s.password = 'spw';
  for (const [du, dp] of [
    [null, null],
    ['', ''],
    [' ', ' '],
    ['du', 'dpw'],
    ['du', null],
  ] as [string | null, string | null][]) {
    const d: any = new AMLLibraryServerDataProfile();
    d.userName = du;
    if (dp !== null) d.password = dp;
    r.v(`credentials:${N(du)}:${N(dp)}`, () => {
      const c = s.credentials(d);
      return N(c.userName) + '|' + N(c.password);
    });
  }
  r.v('credentialsNull', () => s.credentials(null));
  for (const ba of ['plain', 'a/%UserName/b', '%UserName%UserName', '', null]) {
    s.baseAddress = ba;
    r.v('base:' + N(ba) + ':null', () => s.getResolvedBaseAddress(null));
    r.v('base:' + N(ba) + ':data', () => s.getResolvedBaseAddress(Object.assign(new AMLLibraryServerDataProfile(), { userName: 'du' })));
    r.v('base:' + N(ba) + ':dataEmpty', () => s.getResolvedBaseAddress(Object.assign(new AMLLibraryServerDataProfile(), { userName: '' })));
  }
  const dp = (ct: number, props: object = {}) => Object.assign(new AMLLibraryServerDataProfile(ct), props);
  const t: any = Object.assign(new AMLLibraryServerProfile(), {
    libraryData: [dp(0, { automationMLEdition: ED.Edition1, folder: 'L1' }), dp(0, { folder: 'Lall' })],
    libraryCollectionData: [dp(1, { automationMLEdition: ED.Edition2 })],
    exampleData: [dp(2, { automationMLEdition: ED.Edition2 }), dp(2, { automationMLEdition: ED.Edition1 })],
    administrationData: [dp(3), dp(4), dp(5)],
    backupData: dp(6),
  });
  profile(r, 'lookup', t);
  for (let ct = 0; ct <= 8; ct++) {
    for (const ed of [ED.Edition1, ED.Edition2, ED.AllEditions]) {
      r.v(`getData:${ct}:${E(ED, ed)}`, () => DP(t.getData(Object.assign(new AMLLibraryServerDataProfile(), { contentType: ct, automationMLEdition: ed }))));
    }
  }
  for (const name of ['_0_Lib_AMLEd1', '_0_Lib_AMLEd2', '_1_Coll_AMLEd2', '_2_Ex_AMLEd1', '_2_Ex_x', '_3_Cat', '_4_Class', '_5_Sig', '_6_B', '_7_x', 'plain.aml', '_9_x', 'a', '', 'x_AMLEd1']) {
    r.v('restore:' + name, () => {
      const x = t.restorationData(name);
      return DP(x.result) + '|' + N(x.originalFileName);
    });
  }
  for (const key of ['docs:map30.aml', 'docs:map215.aml', '1_AMLBaseLibraries.aml', 'AutomationML_Base_Libraries_AMLEd2_2.11.0.aml', '0_EmptyFile_V2.0.aml']) {
    const d = doc(key);
    r.v('forDoc:' + key, () => DP(t.libraryDataForDocument(d)) + DP(t.libraryCollectionDataForDocument(d)) + DP(t.exampleDataForDocument(d)));
  }
  const nulls: any = Object.assign(new AMLLibraryServerProfile(), { libraryData: null, administrationData: null });
  r.v('nullLists', () => DP(nulls.libraryCatalogData) + DP(nulls.getData(new AMLLibraryServerDataProfile())));
  r.v('nullListsJson', () => nulls.serialize());
  r.v('nullListsForDoc', () => DP(nulls.libraryDataForDocument(doc('docs:map30.aml'))));
  const hashes = inputJson('hashes.json');
  t.passwordHash = hashes[0].hash;
  t.libraryData[0].passwordHash = hashes[2].hash;
  t.userName = 'a"b\\c/d<e>f&g\'h+i`j\u00e9\u2028\ud83d\ude00\t\r\n\u0001\u007f';
  t.serverName = 's';
  t.baseAddress = 'b';
  t.branchName = null;
  t.isPublicRepository = true;
  t.portNumber = -5;
  t.accessRights = 9;
  r.v('serialized', () => t.serialize());
  r.v('reloaded', () => P.loadFromString(t.serialize()).serialize());
  r.v('reloadedPasswords', () => {
    const x = P.loadFromString(t.serialize());
    return x.password + '|' + x.libraryData[0].password;
  });
}

function profileUriCases(r: Rec): void {
  const servers = ['example.com', 'example.com/', 'github.com', 'api.GitHub.com/x', null, 'host:81', 'a b', ''];
  const files = [null, 'f.aml', '/sub/f g.aml/', 'a\\b.aml'];
  for (let p = 0; p <= 5; p++) {
    for (const server of servers) {
      for (let v = 0; v < 3; v++) {
        const s: any = Object.assign(new AMLLibraryServerProfile(), {
          networkProtocol: p,
          serverName: server,
          userName: v === 0 ? null : 'u s',
          portNumber: v === 1 ? 8080 : 0,
          baseAddress: v === 2 ? '/repo/%UserName/' : v === 1 ? 'base' : null,
        });
        if (v === 1) s.password = 'p@ss:w';
        const d: any = Object.assign(new AMLLibraryServerDataProfile(), { folder: v === 0 ? null : v === 1 ? '/Libs/' : '\\a\\b c', branchOrTag: v === 2 ? 'v1.0' : null });
        if (v === 2) {
          d.userName = 'du';
          d.password = 'dp';
        }
        for (const f of files) {
          const label = `${p}:${N(server)}:${v}:${N(f)}`;
          r.v(label, () => s.getUri(d, f));
          r.v(label + ':dl', () => s.getUri(d, f, true));
        }
      }
    }
  }
  r.v('nullData', () => Object.assign(new AMLLibraryServerProfile(), { serverName: 'x' }).getUri(null as any));
  r.v('nullDataGitHub', () => Object.assign(new AMLLibraryServerProfile(), { serverName: 'github.com' }).getUri(null as any));
}

function dataProfileCases(r: Rec): void {
  r.v('constants', () => [DPc.BACKUPFOLDER, DPc.CATALOGUEFOLDER, DPc.COLLECTIONFOLDER, DPc.EXAMPLEFOLDER, DPc.LIBFOLDER, DPc.SIGNFOLDER].join('|'));
  r.v('default', () => DP(new AMLLibraryServerDataProfile()));
  for (let ct = -1; ct <= 8; ct++) r.v('ctor:' + ct, () => DP(new AMLLibraryServerDataProfile(ct)));
  for (const name of ['lib.aml', '_0_lib.aml', '_3_lib.aml', '']) {
    for (let ct = -1; ct <= 8; ct++) r.v(`backupName:${name}:${ct}`, () => DPc.backupFileName(name, ct));
  }
  r.v('backupNameNull', () => DPc.backupFileName(null, 0));
  for (const name of ['_0_lib.aml', '_6_x', '_7_x', '_8_x', '_9_x', 'lib.aml', 'ab', 'a', '', '_1', '_1_', 'x1y', '_٣_x', ' 1 x', '_+_x', '_-_x']) {
    r.v('backupType:' + name, () => {
      const x = DPc.backupFileType(name);
      return x.result + '|' + N(x.originalName);
    });
  }
  r.v('backupTypeNull', () => DPc.backupFileType(null));
  for (const ct of [6, 2]) {
    const d: any = new AMLLibraryServerDataProfile(ct);
    for (const path of ['C:\\dir\\_2_file.aml', '/x/_4_c.aml', '_1_f', 'dir/plain.aml', 'C:_5_x', 'C:\\dir\\', 'd:/x/_0_y']) {
      r.v(`fromFile:${ct}:${path}`, () => d.contentTypeFromFile(path));
    }
  }
  for (const own of [0, 1, 2, 7]) {
    for (const ed of [0, 1, 2, 7]) r.v(`supports:${own}:${ed}`, () => Object.assign(new AMLLibraryServerDataProfile(), { automationMLEdition: own }).supportsEdition(ed));
  }
  for (const user of ['anonymous', 'x', null]) r.v('anonymous:' + N(user), () => Object.assign(new AMLLibraryServerDataProfile(), { userName: user }).isAnonymous);
}

function hashCases(r: Rec): void {
  const hashes = inputJson('hashes.json');
  for (let i = 0; i < hashes.length; i++) {
    const d: any = new AMLLibraryServerDataProfile();
    d.passwordHash = hashes[i].hash;
    r.v('#' + i, () => d.password);
    const s: any = new AMLLibraryServerProfile();
    s.passwordHash = hashes[i].hash;
    r.v('#' + i + ':server', () => s.password);
  }
  for (const plain of ['secret', 'pässwörd €', '', 'x']) {
    const d: any = new AMLLibraryServerDataProfile();
    d.password = plain;
    r.v('roundTrip:' + plain, () => N(d.password) + '|' + (d.passwordHash === null ? 'null' : String(Buffer.from(d.passwordHash, 'base64').length)));
  }
}

function editionCases(r: Rec): void {
  const docs = ['docs:map30.aml', 'docs:map215.aml', 'AutomationML_Base_Libraries_AMLEd2_2.11.0.aml', '0_EmptyFile_V2.0.aml'].map(doc);
  const X: any = AMLEditionEnumExtension;
  for (const ed of [0, 1, 2, 9]) {
    r.v('string:' + ed, () => X.amlEditionString(ed));
    for (let i = 0; i < docs.length; i++) r.v(`isDoc:${ed}:${i}`, () => X.isDocumentEdition(ed, docs[i]));
  }
  for (const v of ['2.0', '2.1', '2.10', '2.2', '', 'x', null]) {
    r.v('fromVersion:' + N(v), () => X.amlEditionStringFromVersion(v) + '|' + E(ED, X.amlEditionFromVersion(v)));
    r.v('fromEdition:' + N(v), () => E(ED, X.amlEditionFromEditionString(v)));
  }
  for (const v of ['AMLEd1', 'AMLEd2', 'amled1', 'AMLEd3']) r.v('fromEdition:' + v, () => E(ED, X.amlEditionFromEditionString(v)));
}

function byteArrayCases(r: Rec): void {
  const conv: any = new ByteArrayConverter();
  for (const b of [new Uint8Array(0), Uint8Array.from([0, 1, 127, 128, 255])]) r.v('write:' + b.length, () => JSON.stringify(conv.write(b)));
  // JsonSerializer does not call the converter for a JSON null (the result is null).
  for (const json of ['[]', '[1,2,3]', '[255,-1,256,300]', 'null', '[-32768,32767]']) {
    r.v('read:' + json, () => {
      const parsed = JSON.parse(json);
      const b = parsed === null ? null : conv.read(parsed);
      return b === null ? 'null' : '[' + [...b].join(',') + ']';
    });
  }
}

function CX(n: any): string {
  if (n === null || n === undefined) return 'null';
  if (n instanceof XElement) {
    const attrs = [...n.attributes()].filter((a) => !a.isNamespaceDeclaration).map((a) => '{' + a.name.namespaceName + '}' + a.name.localName + '=' + a.value);
    return '{' + n.name.namespaceName + '}' + n.name.localName + (n.isEmpty ? '/' : '') + '[' + attrs.join(';') + '](' + [...n.nodes()].map(CX).join(',') + ')';
  }
  return "'" + n.value + "'";
}

const XE = (xml: string): XElement => parseXDocument(xml).root!;

const Sig = (s: any) =>
  `${N(s.id)}|${N(s.signatureValue)}|${s.signedInfo === null ? 'null' : N(s.signedInfo.signatureMethod)}|${s.keyInfo === null ? 'null' : s.keyInfo.keyValue === null ? 'nokv' : N(s.keyInfo.keyValue.getPublicKey())}`;

function signatureCases(r: Rec): void {
  KeyValue.Constructors.set('RSAKeyValue', () => new TestKeyValue());
  const signatures: string[] = inputJson('signatures.json');
  for (let i = 0; i < signatures.length; i++) {
    const text = signatures[i];
    const s: any = new XMLSignature();
    r.do('load#' + i, () => s.loadFromString(text));
    r.v('sig#' + i, () => Sig(s));
    r.v('xml#' + i, () => CX(s.getXml()));
    r.v('xmlDoc#' + i, () => CX(s.getXml({})));
    const s2: any = new XMLSignature();
    r.do('loadDoc#' + i, () => s2.loadFromDocument(parseXDocument(text)));
    r.v('sigDoc#' + i, () => Sig(s2));
  }
  r.v('loadNull', () => {
    new XMLSignature().loadXml(null);
    return 'ok';
  });
  r.v('signedInfoNull', () => {
    new SignedInfo().loadXml(null);
    return 'ok';
  });
  r.v('keyInfoNull', () => {
    new KeyInfo().loadXml(null);
    return 'ok';
  });
  r.v('signedInfoWrong', () => {
    new SignedInfo().loadXml(XE('<Other />'));
    return 'ok';
  });
  r.v('signedInfoOk', () => {
    const si = new SignedInfo();
    si.loadXml(XE(`<X:SignedInfo xmlns:X='${Dsig}'><X:SignatureMethod Algorithm='z' /></X:SignedInfo>`));
    return si.signatureMethod + '|' + CX(si.getXml({}));
  });
  r.v('keyInfoOk', () => {
    const ki = new KeyInfo();
    ki.loadXml(XE(`<Anything xmlns:d='${Dsig}'><d:KeyValue><d:RSAKeyValue>k</d:RSAKeyValue></d:KeyValue></Anything>`));
    return ki.keyValue!.getPublicKey() + '|' + CX(ki.getXml({}));
  });
  r.v('keyInfoNoValue', () => CX(new KeyInfo().getXml({})));
  r.v('signedInfoNullMethod', () => CX(new SignedInfo().getXml({})));
  r.v('emptySignature', () => CX(new XMLSignature().getXml()));
  r.v('noValue', () => CX(Object.assign(new XMLSignature(), { signedInfo: Object.assign(new SignedInfo(), { signatureMethod: 'm' }) }).getXml()));
  r.v('built', () => CX(Object.assign(new XMLSignature(), { id: 'id', signatureValue: 'v', signedInfo: Object.assign(new SignedInfo(), { signatureMethod: 'm' }) }).getXml()));
  r.v('builtEmptyId', () => CX(Object.assign(new XMLSignature(), { id: '', signatureValue: '', signedInfo: new SignedInfo() }).getXml()));
  r.v('builtKeyInfoEmpty', () =>
    CX(Object.assign(new XMLSignature(), { id: 'id', signatureValue: 'v', signedInfo: Object.assign(new SignedInfo(), { signatureMethod: 'm' }), keyInfo: new KeyInfo() }).getXml()),
  );
  for (const [s, off, cnt] of [
    ['a b\tc\u00a0d\u2028e\u0085f\u200bg', -1, -1],
    ['  ', -1, -1],
    ['', -1, -1],
    ['a b c d', 1, 3],
    ['a b c d', 5, 10],
    ['a b', -1, 2],
    ['abc', 1, 0],
    ['abc', 1, -1],
  ] as [string, number, number][]) {
    r.v(`discard:${s}:${off}:${cnt}`, () => (off < 0 && cnt < 0 ? XMLSignature.discardWhiteSpaces(s) : XMLSignature.discardWhiteSpaces(s, off, cnt)));
  }
  r.v('discardNull', () => XMLSignature.discardWhiteSpaces(null as any));
  const el = XE(`<e Id='plain' xmlns:d='${Dsig}' d:Id='ns' d:Only='o' xmlns:o='urn:o' o:Other='x' />`);
  for (const [name, ns] of [
    ['Id', Dsig],
    ['Only', Dsig],
    ['Other', Dsig],
    ['Other', 'urn:o'],
    ['Missing', Dsig],
    ['Id', ''],
  ]) {
    r.v(`getAttribute:${name}:${ns}`, () => XMLSignature.getAttribute(el, name, ns));
  }
  r.v('constant', () => XMLSignature.XmlDsigNamespaceUrl);
  r.v('constructors', () => KeyValue.Constructors.size);
}

// ================================================================ 6. adapter

const AdapterDocs = ['docs:map30.aml', 'docs:map215.aml', '9_ExtInt_IntLink.aml', '11_Constraints.aml', '13_Facet.aml', '5_SUC.aml'];
const AD: any = AMLEngineAdapter;

function adapterSection(o: Section): void {
  for (const key of AdapterDocs) {
    kase(o, 'read:' + key, (r) => adapterReads(r, doc(key)));
    kase(o, 'write:' + key, (r) => adapterWrites(r, key));
  }
}

const allWrappers = (d: any): any[] => [...d.xDocument.root.descendantsAndSelf()].map((e: XElement) => XmlOperation.createCAEXWrapper(e)).filter((w: any) => w !== null);

function adapterReads(r: Rec, d: any): void {
  const file = d.caexFile;
  r.v('allWithLinks', () => Ws(AD.allElementsWithInternalLinks(file)));
  r.v('allIEWithLinks', () => Ws(AD.allInternalElementsWithInternalLinks(file)));
  r.v('getAllWithLinks', () => Ws(AD.getAllElementsWithInternalLinks(file)));
  r.v('externalReferences', () => Ws(AD.externalReferences(file)));
  r.v('instanceHierarchies', () => Ws(AD.instanceHierarchies(file)));
  r.v('interfaceClassLibraries', () => Ws(AD.interfaceClassLibraries(file)));
  r.v('roleClassLibraries', () => Ws(AD.roleClassLibraries(file)));
  r.v('systemUnitClassLibraries', () => Ws(AD.systemUnitClassLibraries(file)));
  const all: XElement[] = [...d.xDocument.root.descendantsAndSelf()];
  for (const w of allWrappers(d)) {
    const p = '#' + all.indexOf(w.node) + ':' + w.node.name.localName;
    if (!(w instanceof T.CAEXBasicObject)) continue;
    const bo: any = w;
    r.v(p + '|name', () => AD.name(bo));
    r.v(p + '|parent', () => D(AD.getParent(file, bo)));
    r.v(p + '|check', () => B(AD.consistencyCheck_ClassReference(bo, 'ICLib/IC1')) + B(AD.consistencyCheck_ClassReference(bo, 'No/Path')) + B(AD.consistencyCheck_ClassReference(bo, null)));
    r.v(p + '|findIE', () => D(AD.findInternalElement(bo, 'id-ie1')) + D(AD.findInternalElement(bo, 'id-ei1')) + D(AD.findInternalElement(bo, null)));
    r.v(p + '|refClass', () => desc(AD.getReferencedClass(bo, 'ICLib/IC1'), all) + desc(AD.getReferencedClass(bo, 'x'), all));
    r.v(
      p + '|refGuid',
      () => N(AD.getReferencedGUID(bo, 'id-a:EI')) + '|' + N(AD.getReferencedGUID(bo, 'id-a')) + '|' + N(AD.getReferencedInterfaceName(bo, 'id-a:EI')) + '|' + N(AD.getReferencedInterfaceName(bo, '')),
    );
    r.v(p + '|refInterfaceClass', () => D(AD.getReferencedInterfaceClass(bo, 'ICLib/IC1')) + D(AD.getReferencedInterfaceClass(bo, 'ICLib/IC1/IC1Child')) + D(AD.getReferencedInterfaceClass(bo, 'x')));
    if (implementsInterface(bo, 'IObjectWithAttributes')) {
      const first = [...bo.attribute][0]?.name ?? null;
      r.v(p + '|attributes', () => Ws(AD.attributes(bo)) + Ws(AD.getAttributeField(bo)));
      r.v(p + '|attributeValue', () => N(AD.getAttributeValue(bo, first)) + '|' + N(AD.getAttributeValue(bo, 'missing')));
    }
    if (implementsInterface(bo, 'IObjectWithExternalInterface')) {
      const first = [...bo.externalInterface][0]?.name ?? null;
      r.v(p + '|interfaces', () => Ws(AD.externalInterfaces(bo)) + Ws(AD.getExternalInterfaces(bo, 'x')));
      r.v(p + '|findInterface', () => D(AD.findExternalInterface(bo, first)) + D(AD.findExternalInterface(bo, 'missing')));
    }
    if (implementsInterface(bo, 'IInternalElementContainer')) r.v(p + '|children', () => Ws(AD.internalElementChildren(bo)));
    if (bo instanceof T.SystemUnitClassType) {
      r.v(p + '|ancestors', () => Ws(AD.ancestors(bo)));
      const links = AD.getLinkedObjects(bo);
      for (let i = 0; i < links.length; i++) {
        const l = links[i];
        r.v(p + '|link' + i, () => D(l.internalLink) + '|' + D(l.refPartnerSideAElement) + '|' + D(l.refPartnerSideBElement) + '|' + D(l.refPartnerSideAExternalInterface) + '|' + D(l.refPartnerSideBExternalInterface));
        r.v(p + '|link' + i + ':string', () => l.toString());
      }
    }
    if (bo instanceof T.SystemUnitFamilyType) r.v(p + '|sucChildren', () => Ws(AD.systemUnitClassChildren(bo)));
    if (bo instanceof T.InternalElementType) {
      r.v(p + '|className', () => AD.getClassName(bo));
      r.v(p + '|refSuc', () => D(AD.getReferencedSystemUnitClass(bo)));
      r.v(p + '|facetGroupPort', () => B(AD.isFacet(bo)) + B(AD.isGroup(bo)) + B(AD.isPort(bo)));
    }
    if (bo instanceof T.InterfaceClassType) r.v(p + '|icClassName', () => AD.getClassName(bo));
  }
  r.v('classNameNullIE', () => AD.getClassName(null));
  r.v('classNameNullIC', () => AD.getClassName(null));
  r.v('nameNull', () => AD.name(null));
}

function adapterWrites(r: Rec, key: string): void {
  const step = (label: string, f: (d: any) => unknown) => {
    const d = doc(key);
    r.v(label, () => f(d));
    r.add(label + ':doc=' + hash(r.c.apply(saveString(d))));
  };
  const IE = (d: any, n = 0): any => allWrappers(d).filter((w) => w instanceof T.InternalElementType)[n] ?? null;
  const fresh = CAEXDocument.new_CAEXDocument(doc(key).schema);
  const newIE = (name: string) => {
    const x = fresh.caexFile!.instanceHierarchy.append('Tmp').internalElement.append(name);
    x.remove();
    return x;
  };
  const copyText = (c: any) => (c === null ? 'null' : D(c) + '|' + hash(r.c.apply(c.node.toString())));
  step('assignNewGUIDs', (d) => {
    const ie = IE(d);
    if (ie !== null) AD.assignNewGUIDs(ie);
    return D(IE(d));
  });
  step('assignRedirect', (d) => {
    AD.assignNewGUIDsAndRedirectExistingInternalLinks(allWrappers(d).find((w) => w instanceof T.SystemUnitClassType) ?? null, true);
    return 'ok';
  });
  step('assignRedirectMirror', (d) => {
    AD.assignNewGUIDsAndRedirectExistingInternalLinksAndMirrorObjects(allWrappers(d).find((w) => w instanceof T.SystemUnitClassType) ?? null, false);
    return 'ok';
  });
  step('clone', (d) => (IE(d) === null ? 'null' : copyText(AD.clone(IE(d)))));
  step('cloneNode', (d) => (IE(d) === null ? 'null' : copyText(AD.cloneNode(IE(d), true, true))));
  step('cloneNodeFlat', (d) => (IE(d) === null ? 'null' : copyText(AD.cloneNode(IE(d), false, false))));
  step('uniqueCopy', (d) => (IE(d) === null ? 'null' : copyText(AD.create_UniqueCopy(IE(d), true))));
  step('uniqueCopyFlat', (d) => (IE(d) === null ? 'null' : copyText(AD.create_UniqueCopy(IE(d), false))));
  const ihOf = (d: any) => [...d.caexFile.instanceHierarchy][0] ?? null;
  step('insertElement', (d) => (ihOf(d) === null ? 'noih' : B(AD.insert_Element(ihOf(d), newIE('A'))) + B(AD.insert_Element(ihOf(d), newIE('B'), false))));
  step('insertNewInstance', (d) => (ihOf(d) === null ? 'noih' : B(AD.insert_NewInstance(ihOf(d), newIE('A'))) + B(AD.insert_NewInstance(ihOf(d), newIE('B'), false))));
  step('insertTypeBase', (d) => (ihOf(d) === null ? 'noih' : B(AD.insert_TypeBaseElement(ihOf(d), newIE('A'))) + B(AD.insert_TypeBaseElement(ihOf(d), newIE('B'), false))));
  step('insertWrong', (d) => (ihOf(d) === null ? 'noih' : B(AD.insert_Element(ihOf(d), fresh.caexFile!.interfaceClassLib.append('X')))));
  step('insertMapping', (d) => {
    const ie = IE(d);
    const mo = allWrappers(d).find((w) => w instanceof T.MappingType) ?? null;
    if (ie === null || mo === null) return 'none';
    AD.insert_MappingObject(ie, mo.copy());
    const src = allWrappers(d).find((w) => w instanceof T.SupportedRoleClassType) ?? null;
    if (src !== null) AD.insert_MappingObject(src, mo.copy());
    return 'ok';
  });
  step('insertRoleRequirements', (d) => {
    const ie = IE(d);
    const rr = allWrappers(d).find((w) => w instanceof T.RoleRequirementsType) ?? null;
    if (ie === null || rr === null) return 'none';
    AD.insert_RoleRequirements(ie, rr.copy());
    return Ws(ie.roleRequirements);
  });
  step('insertSuc', (d) => {
    const sucs = allWrappers(d).filter((w) => w instanceof T.SystemUnitFamilyType);
    if (sucs.length === 0) return 'none';
    AD.insert_SystemUnitFamilyType(sucs[0], sucs[sucs.length - 1].copy());
    return Ws(sucs[0].systemUnitClass);
  });
  step('newRoleRequirements', (d) => {
    const ie = IE(d, 1) ?? IE(d);
    return ie === null ? 'none' : D(AD.new_RoleRequirements(ie)) + '|' + D(AD.new_RoleRequirements(ie, 'RCLib/R2')) + '|' + D(AD.new_RoleRequirements(ie, 'No/Such'));
  });
  step('constraints', (d) => {
    const parts: string[] = [];
    for (const n of allWrappers(d).filter((w) => w instanceof T.NominalScaledTypeType)) {
      AD.new_RequiredValue(n, 'nv1');
      AD.new_RequiredValue(n, null);
      parts.push([...n.requiredValue].map((v: any) => N(v)).join(','));
    }
    for (const n of allWrappers(d).filter((w) => w instanceof T.OrdinalScaledTypeType)) {
      AD.new_RequiredValue(n, 'ov');
      AD.new_RequiredMaxValue(n, 'max');
      AD.new_RequiredMinValue(n, null);
      parts.push(N(n.requiredValue) + '|' + N(n.requiredMaxValue) + '|' + N(n.requiredMinValue));
    }
    return parts.join(';');
  });
  step('revisions', (d) => {
    const parts: string[] = [];
    for (const rev of allWrappers(d).filter((w) => w instanceof T.RevisionType)) {
      AD.new_OldVersion(rev, 'old@x');
      AD.new_NewVersion(rev, null);
      AD.new_Comment(rev, 'comment');
      parts.push(N(rev.oldVersion) + '|' + N(rev.newVersion) + '|' + N(rev.comment));
    }
    return parts.join(';');
  });
  step('linkSetters', (d) => {
    const parts: string[] = [];
    for (const suc of allWrappers(d).filter((w) => w instanceof T.SystemUnitClassType)) {
      for (const l of AD.getLinkedObjects(suc)) {
        const eis = allWrappers(d).filter((w) => w instanceof T.ExternalInterfaceType);
        l.refPartnerSideAExternalInterface = eis[eis.length - 1] ?? null;
        l.refPartnerSideBExternalInterface = l.refPartnerSideAExternalInterface;
        parts.push(N(l.internalLink.refPartnerSideA) + '|' + N(l.internalLink.refPartnerSideB) + '|' + l);
      }
    }
    return parts.join(';');
  });
  step('linkNull', (d) => {
    const l = allWrappers(d)
      .filter((w) => w instanceof T.SystemUnitClassType)
      .flatMap((s) => AD.getLinkedObjects(s))[0];
    if (l === undefined) return 'none';
    l.refPartnerSideAExternalInterface = null;
    return N(l.internalLink.refPartnerSideA) + '|' + l;
  });
}

// ================================================================ 7. streaming

const DS: any = DocumentStreaming;

function Wr(ws: Iterable<any> | null): string {
  if (ws === null) return 'null';
  return '[' + [...ws].map((w) => (w === null ? 'null' : w instanceof T.ExternalReferenceType ? `ER(${N(w.alias)}|${N(w.path)})` : D(w))).join(',') + ']';
}

function streamingSection(o: Section): void {
  const dir = join(inputDir, 'streaming');
  const files = readdirSync(dir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  for (const name of files) kase(o, name, (r) => streamingFile(r, join(dir, name)));
  kase(o, 'variants', (r) => {
    const first = join(dir, files[0]);
    const url = new Uri(first).absoluteUri;
    r.v('fileUrl', () => url);
    r.v('fileUrl:new', () => DS.newDocumentVersions(url));
    r.v('fileUrl:old', () => DS.oldDocumentVersions(url));
    r.v('fileUrl:refs', () => Wr(DS.readExternalReferenceType(url)));
    const missing = join(dir, 'AML_Test_RoleClassLib_AMLEd2_9.9.9.aml');
    r.v('missing:new', () => DS.newDocumentVersions(missing));
    r.v('missing:refs', () => Wr(DS.readExternalReferenceType(missing)));
    r.v('relative:new', () => DS.newDocumentVersions('streaming/AML_Test_RoleClassLib_AMLEd2_1.2.0.aml'));
    r.v('relative:refs', () => Wr(DS.streamElementWithName('streaming/x.aml', 'RoleClass', null)));
    r.v('null:new', () => DS.newDocumentVersions(null));
    r.v('null:old', () => DS.oldDocumentVersions(null));
    r.v('empty:new', () => DS.newDocumentVersions(''));
    r.v('urlNull', () => Wr(DS.streamElementWithName(null, 'RoleClass', null)));
    r.v('urlBlank', () => Wr(DS.streamElementWithName(' ', 'RoleClass', null)));
    r.v('nameNull', () => Wr(DS.streamElementWithName(first, null, null)));
    r.v('nameBlank', () => Wr(DS.streamElementWithName(first, '\t', null)));
    // C# selects the Stream overload for (Stream)null; a JS null carries no type, so the port of that overload is called directly.
    r.v('streamNull', () => Wr(DS.streamElementWithNameFromStream(null, 'RoleClass', null)));
    r.v('streamNameNull', () => Wr(DS.streamElementWithName(new Uint8Array(readFileSync(first)), null, null)));
    r.v('streamBroken', () => Wr(DS.streamElementWithName(Uint8Array.from([60, 97]), 'a', null)));
    r.v('streamEmpty', () => Wr(DS.streamElementWithName(new Uint8Array(0), 'a', null)));
    for (const u of ['http://u:p@host/x.aml', 'https://host/x', 'http://user@host/', 'http://u:p:q@h/', 'https://u%20x:p%3Ay@h/', 'file:///C:/x/y.aml', 'C:\\x\\y.aml', 'relative/y.aml', 'ftp://h/x', '', null, '\\\\server\\share\\x.aml', 'urn:isbn:1', 'mailto:a@b.c']) {
      r.v('prepare:' + N(u), () => {
        const x = DS.prepareSettingsWithCredential(u, {});
        return F(x.result) + '|' + F(x.localPath);
      });
    }
  });
}

function streamingFile(r: Rec, path: string): void {
  r.v('new', () => DS.newDocumentVersions(path));
  r.v('old', () => DS.oldDocumentVersions(path));
  r.v('refs', () => Wr(DS.readExternalReferenceType(path)));
  r.v('refsStream', () => Wr(DS.readExternalReferenceType(new Uint8Array(readFileSync(path)))));
  for (const name of ['RoleClass', 'InternalElement', 'Revision', 'ExternalReference', 'Unknown', 'CAEXFile']) {
    r.v('elements:' + name, () => Wr(DS.streamElementWithName(path, name, null)));
    r.v('elementsClose:' + name, () => Wr(DS.streamElementWithName(path, name, (n: string) => n === 'SystemUnitClassLib')));
    r.v('stream:' + name, () => Wr(DS.streamElementWithName(new Uint8Array(readFileSync(path)), name, null)));
    r.v('streamClose:' + name, () => Wr(DS.streamElementWithName(new Uint8Array(readFileSync(path)), name, (n: string) => n === 'InterfaceClassLib')));
  }
}

// ================================================================ 8. amlobjects

function amlObjectsSection(o: Section): void {
  for (const start of ['new30', 'new215', 'docs:map30.aml', 'docs:map215.aml']) {
    kase(o, 'amlFile:' + start, (r) => amlFileCases(r, start));
    kase(o, 'libraries:' + start, (r) => libraryCases(r, start));
  }
  kase(o, 'loadExternal', loadExternalCases);
  for (const key of ['13_Facet.aml', 'docs:map30.aml']) kase(o, 'facet:' + key, (r) => facetCases(r, key));
  kase(o, 'version', versionCases);
  kase(o, 'path', pathCases);
  kase(o, 'dictionary', dictionaryCases);
  const dir = join(inputDir, 'packages');
  for (const f of readdirSync(dir).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))) kase(o, 'package:' + f, (r) => packageCases(r, new Uint8Array(readFileSync(join(dir, f)))));
}

const startDoc = (start: string): any =>
  start === 'new30' ? CAEXDocument.new_CAEXDocument(Schema.CAEX3_0) : start === 'new215' ? CAEXDocument.new_CAEXDocument(Schema.CAEX2_15) : doc(start);

const Meta = (m: any) =>
  m === null || m === undefined
    ? 'null'
    : `Meta(${N(m.writerName)}|${N(m.writerID)}|${N(m.writerVendor)}|${N(m.writerVendorURL)}|${N(m.writerVersion)}|${N(m.writerRelease)}|${N(m.lastWritingDateTime)}|${N(m.writerProjectTitle)}|${N(m.writerProjectID)})`;
const DVs = (d: any) => (d === null || d === undefined ? 'null' : `DV(${N(d.documentIdentifier)}|${N(d.version)})`);

function amlFileCases(r: Rec, start: string): void {
  const d = startDoc(start);
  const f: any = AMLFile.create(d);
  r.v('versions0', () => [...f.documentVersion].map(DVs).join(','));
  r.do('appendVersion', () => f.documentVersion.append(Object.assign(new T.DocumentVersionInformation(), { documentIdentifier: 'doc1', version: '1.2' })));
  r.do('appendVersionNull', () => f.documentVersion.append(new T.DocumentVersionInformation()));
  r.v('versions1', () => [...f.documentVersion].map(DVs).join(','));
  r.v('writer0', () => [...f.writerHeader].map(Meta).join(','));
  r.do('appendWriter', () =>
    f.writerHeader.append(
      Object.assign(new T.MetaInformation(), {
        writerName: 'w',
        writerID: 'id',
        writerVendor: 'v',
        writerVendorURL: 'u',
        writerVersion: '1',
        writerRelease: '2',
        lastWritingDateTime: '2020-01-01T00:00:00',
        writerProjectTitle: 't',
        writerProjectID: 'p',
      }),
    ),
  );
  r.do('appendWriterEmpty', () => f.writerHeader.append(new T.MetaInformation()));
  r.v('writer1', () => [...f.writerHeader].map(Meta).join(','));
  r.v('deprecated0', () => [...f.documentVersionDeprecated].map(DVs).join(','));
  r.do('appendDeprecated', () => f.documentVersionDeprecated.append(Object.assign(new T.DocumentVersionInformation(), { documentIdentifier: 'old', version: null })));
  r.v('deprecated1', () => [...f.documentVersionDeprecated].map(DVs).join(','));
  r.v('valid', () => B(f.isValidAutomationMLVersion('2.0')) + B(f.isValidAutomationMLVersion('2.1')) + B(f.isValidAutomationMLVersion('')) + B(f.isValidAutomationMLVersion('x')));
  r.v('doc', () => saveString(d));
}

function libraryCases(r: Rec, start: string): void {
  const d = startDoc(start);
  const names = (xs: Iterable<any> | null | undefined) => (xs === null || xs === undefined ? 'null' : '[' + [...xs].map((x) => x.name).join(',') + ']');
  r.v('baseAttributes', () => names(T.AutomationMLBaseAttributeTypeLibType.attributeTypeLib(d)?.attributeType));
  r.v('baseRoles', () => names(T.AutomationMLBaseRoleClassLibType.roleClassLib(d)?.roleClass));
  r.v('interfaces', () => names(T.AutomationMLInterfaceClassLibType.interfaceClassLib(d)?.interfaceClass));
  r.v('logicInterfaces', () => names(T.AutomationMLLogicInterfaceClassLibType.interfaceClassLib(d)?.interfaceClass));
  r.v('logicRoles', () => names(T.AutomationMLLogicRoleClassLibType.roleClassLib(d)?.roleClass));
  r.v('plcOpen', () => names(T.AutomationMLPLCopenXMLInterfaceClassLibType.interfaceClassLib(d)?.interfaceClass));
  r.v('plcOpenLoaded', () => T.AutomationMLPLCopenXMLInterfaceClassLibType.isLoaded(d));
  r.v('doc', () => hash(r.c.apply(saveString(d))));
  const d2 = startDoc(start);
  r.v('plcOpenExisting', () => {
    d2.caexFile.interfaceClassLib.append('AutomationMLPLCopenXMLInterfaceClassLib').interfaceClass.append('VariableInterface');
    const lib = T.AutomationMLPLCopenXMLInterfaceClassLibType.interfaceClassLib(d2);
    return names(lib?.interfaceClass) + '|' + D(lib?.interfaceClass.append('Added') ?? null);
  });
  const ns = d.schema === Schema.CAEX3_0 ? XNamespace.get('http://www.dke.de/CAEX') : XNamespace.None;
  for (const [type, tag, prop] of [
    ['AutomationMLBaseAttributeTypeLibType', 'AttributeTypeLib', 'attributeType'],
    ['AutomationMLBaseRoleClassLibType', 'RoleClassLib', 'roleClass'],
    ['AutomationMLInterfaceClassLibType', 'InterfaceClassLib', 'interfaceClass'],
    ['AutomationMLLogicInterfaceClassLibType', 'InterfaceClassLib', 'interfaceClass'],
    ['AutomationMLLogicRoleClassLibType', 'RoleClassLib', 'roleClass'],
    ['AutomationMLPLCopenXMLInterfaceClassLibType', 'InterfaceClassLib', 'interfaceClass'],
  ]) {
    r.v('detached:' + type, () => {
      const node = new XElement(ns.getName(tag), new XAttribute('Name', 'L'));
      const lib = new (T as any)[type](node);
      const added = lib[prop].append();
      return D(added) + '|' + node.toString();
    });
  }
}

function loadExternalCases(r: Rec): void {
  const lt: any = T.AMLLibraryType;
  for (const [docStart, resource] of [
    ['new30', '7_ICL.aml'],
    ['new215', '1_AMLBaseLibraries.aml'],
    ['new30', '1_AMLBaseLibraries.aml'],
  ]) {
    const bytes = new Uint8Array(readFileSync(join(corpusDir, resource)));
    const imp = (d: any) => (d === null ? null : ([...d.caexFile.interfaceClassLib][0] ?? null));
    const label = docStart + ':' + resource;
    r.v(label, () => D(lt.loadExternalLibrary(startDoc(docStart), bytes, imp)));
    const t = new TestTransform();
    SL.register(t, 'ISchemaTransform');
    try {
      r.v(label + ':transform', () => D(lt.loadExternalLibrary(startDoc(docStart), bytes, imp)));
    } finally {
      SL.unRegister('ISchemaTransform');
    }
  }
  r.v('nullResource', () => D(lt.loadExternalLibrary(startDoc('new30'), null, null)));
}

function facetCases(r: Rec, key: string): void {
  const d = doc(key);
  const all = allWrappers(d);
  const facets = all.filter((w) => w instanceof T.InternalElementType && AmlObjectsExtensions.isAMLFacet(w));
  const others = all.filter((w) => w instanceof T.ExternalInterfaceType);
  for (const ie of facets) {
    const facet: any = new T.AMLFacet(ie.node);
    const parent: any = ie.caexParent;
    const candidates = [...(implementsInterface(parent, 'IObjectWithExternalInterface') ? parent.externalInterface : []), ...others.slice(0, 3)];
    for (const ei of candidates) r.v(`insert:${ie.name}:${D(ei)}`, () => D(facet.facetExternalInterface.insert(ei)));
    r.v(`insertNull:${ie.name}`, () => D(facet.facetExternalInterface.insert(null)));
  }
  r.v('doc', () => hash(r.c.apply(saveString(d))));
  const fresh = CAEXDocument.new_CAEXDocument(d.schema);
  const de: any = fresh.caexFile!.instanceHierarchy.append('IH').internalElement.append('DocElement');
  de.roleRequirements.append().refBaseRoleClassPath = 'AutomationMLBPRRoleClassLib/ExternalData';
  de.remove();
  r.v('detachedDocumentElement', () => B(ExternalDataReference.isDocumentElement(de)) + '|' + D(ExternalDataReference.addDocumentReference(de, 'ref')));
}

function versionCases(r: Rec): void {
  const vs = ['1.2', '1.2.0', '1.2.0.0', '1.2.3', '01.2', '1.02', '2.0', '1.2.3.4'];
  for (const a of vs) for (const b of vs) r.v(`equals:${a}:${b}`, () => new Version(a).equals(new Version(b)));
  r.v('equalsNull', () => new Version('1.2').equals(null));
  r.v('equalsString', () => new Version('1.2').equals('1.2'));
  r.v('distinct', () => from(vs.map((v) => new Version(v))).distinct().toList().map(String).join(','));
}

const Paths = ['C:\\dir\\file.aml', 'C:/dir/file.tar.gz', 'file', 'dir/', 'dir\\', 'C:', 'C:file.aml', '\\\\server\\share\\f.x', '.hidden', 'name.', 'a.b.c', '', ' ', '/x/.aml', 'dir/sub/f g.aml', 'x:y.aml', '..', 'a..b'];

function pathCases(r: Rec): void {
  for (const p of Paths) r.v('path:' + p, () => N(NetPath.getFileName(p)) + '|' + N(NetPath.getFileNameWithoutExtension(p)));
  r.v('pathNull', () => N(NetPath.getFileName(null)) + '|' + N(NetPath.getFileNameWithoutExtension(null)));
}

const DictKeys = ['.aml', '.AML', '.Aml', '.amlx', '.xml', 'straße', 'STRASSE', 'i', 'I', 'ı', 'İ', 'é', 'É', 'e\u0301', 'ǅ', 'ǆ', 'Ǆ', '', 'ﬀ', 'FF', 'ab', 'a\u00ADb', 'a\u200Bb', 'a\u0001b', 'Ａb', 'ｱ', 'Ａ', 'a', '²', '2', 'ｶ', 'カ', 'か'];

function dictionaryCases(r: Rec): void {
  const d = new InvariantIgnoreCaseDictionary<number>();
  let i = 0;
  for (const k of DictKeys) {
    const n = i++;
    r.v('add:' + k, () => {
      d.add(k, n);
      return d.count;
    });
  }
  for (const k of [...DictKeys, 'missing', '.AMLX']) {
    r.v('contains:' + k, () => {
      const x = d.tryGetValue(k);
      return B(d.containsKey(k)) + '|' + (x.result ? String(x.value) : 'none');
    });
  }
  r.v('count', () => d.count);
  r.v('containsNull', () => d.containsKey(null as any));
}

function packageCases(r: Rec, bytes: Uint8Array): void {
  const ms = new MemoryStream(bytes);
  let pkg: any = null;
  r.do('open', () => (pkg = Package.open(ms, FileMode.Open, FileAccess.ReadWrite)));
  if (pkg === null) return;
  const parts = (p: any) => [...p.getParts()].map((x: any) => x.uri.toString() + '=' + x.contentType).join(',');
  const rel = (x: any) =>
    x === null || x === undefined ? 'null' : `Rel(${x.id}|${x.relationshipType}|${x.targetUri.toString()}|${TargetMode[x.targetMode]}|${x.sourceUri.toString()}|${B(x.package === pkg)})`;
  r.v('parts', () => parts(pkg));
  r.v('rels', () => [...pkg.getRelationships()].map(rel).join(','));
  for (const id of ['rId1', 'rId2', 'rId9', '', '1x', 'a b', null]) {
    r.v('rel:' + N(id), () => rel(pkg.getRelationship(id)));
    r.v('relExists:' + N(id), () => pkg.relationshipExists(id));
  }
  const a = new Uri('/a.xml', UriKind.Relative);
  if (pkg.partExists(a)) {
    const part = pkg.getPart(a);
    for (const id of ['r2', 'r3', 'rX', '', '1x', null]) {
      r.v('partRel:' + N(id), () => rel(part.getRelationship(id)));
      r.v('partRelExists:' + N(id), () => part.relationshipExists(id));
    }
    r.v('stream', () => {
      const s = part.getStream();
      const b1 = s.readByte();
      const b2 = s.readByte();
      s.flush();
      s.position = s.length;
      return b1 + ',' + b2 + ',' + s.readByte() + ',' + s.length;
    });
  }
  r.v('createBin', () => pkg.createPart(new Uri('/new.bin', UriKind.Relative), 'application/x-bin').uri);
  r.v('createNoExt', () => pkg.createPart(new Uri('/other/new2', UriKind.Relative), 'application/x-n').uri);
  r.do('deleteRelsOfB', () => pkg.deletePart(new Uri('/_rels/b.txt.rels', UriKind.Relative)));
  r.do('deleteA', () => pkg.deletePart(a));
  r.do('deleteRootRels', () => pkg.deletePart(new Uri('/_rels/.rels', UriKind.Relative)));
  r.v('relsAfter', () => [...pkg.getRelationships()].map(rel).join(','));
  r.do('deleteD', () => pkg.deletePart(new Uri('/c/d.xml', UriKind.Relative)));
  r.v('partsAfter', () => parts(pkg));
  r.do('flush', () => pkg.flush());
  r.do('dispose', () => pkg.dispose());
  r.v('afterDispose', () => pkg.relationshipExists('rId1'));
  r.v('entries', () =>
    Object.entries(unzipSync(ms.toArray()))
      .map(([name, data]) => name + ':' + data.length)
      .sort((x, y) => (x < y ? -1 : x > y ? 1 : 0))
      .join(','),
  );
  r.v('contentTypes', () => {
    const b = unzipSync(ms.toArray())['[Content_Types].xml'];
    const start = b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0;
    return new TextDecoder().decode(b.subarray(start));
  });
  r.v('reopen', () => {
    const p2: any = Package.open(new MemoryStream(ms.toArray()), FileMode.Open, FileAccess.Read);
    const s = parts(p2) + '|' + [...p2.getRelationships()].map((x: any) => x.id).join(',');
    p2.close();
    return s;
  });
}

// ================================================================ driver

const sections: [string, (o: Section) => void][] = [
  ['schema', schemaSection],
  ['xmlext', xmlExtSection],
  ['query', querySection],
  ['services', servicesSection],
  ['model', modelSection],
  ['adapter', adapterSection],
  ['streaming', streamingSection],
  ['amlobjects', amlObjectsSection],
];

describe.skipIf(!has)('gapsservices oracle parity', () => {
  if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
  mkdirSync(workDir, { recursive: true });
  for (const [name, fn] of sections) {
    it(name, () => {
      const expected: Section = JSON.parse(readFileSync(join(oracleDir, name + '.json'), 'utf8'));
      const actual: Section = {};
      fn(actual);
      writeFileSync(join(outDir, name + '.json'), JSON.stringify(actual, null, 2));
      const diffs: string[] = [];
      for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
        const e = expected[key];
        const a = actual[key];
        if (e === undefined || a === undefined) {
          diffs.push(`${key}: ${e === undefined ? 'missing in oracle' : 'missing in port'}`);
          continue;
        }
        const n = Math.max(e.length, a.length);
        for (let i = 0; i < n; i++) {
          if (e[i] !== a[i]) {
            diffs.push(`${key}[${i}]\n  oracle: ${e[i]}\n  port:   ${a[i]}`);
            break;
          }
        }
      }
      expect(diffs.slice(0, 20).join('\n')).toBe('');
      expect(diffs.length).toBe(0);
    });
  }

  // The asynchronous variants of DocumentStreaming (no C# counterpart; the C# methods are
  // synchronous) must give what the synchronous methods give, which the streaming section compares
  // with the oracle.
  it('streaming: asynchronous variants', async () => {
    const dir = join(inputDir, 'streaming');
    const paths = readdirSync(dir).map((f) => join(dir, f));
    paths.push(new Uri(paths[0]).absoluteUri, join(dir, 'missing.aml'), 'relative/x.aml');
    for (const p of paths) {
      expect(await DS.newDocumentVersionsAsync(p)).toEqual([...DS.newDocumentVersions(p)]);
      expect(await DS.oldDocumentVersionsAsync(p)).toEqual([...DS.oldDocumentVersions(p)]);
      expect(Wr(await DS.readExternalReferenceTypeAsync(p))).toBe(Wr(DS.readExternalReferenceType(p)));
      expect(Wr(await DS.streamElementWithNameAsync(p, 'RoleClass', (n: string) => n === 'SystemUnitClassLib'))).toBe(Wr(DS.streamElementWithName(p, 'RoleClass', (n: string) => n === 'SystemUnitClassLib')));
    }
    await expect(DS.streamElementWithNameAsync(' ', 'x', null)).rejects.toThrow("'inputUrl' cannot be null or whitespace.");
    await expect(DS.streamElementWithNameAsync(paths[0], '', null)).rejects.toThrow("'elementName' cannot be null or whitespace.");
    // Unsupported schemes and unreachable servers give empty lists like the synchronous C# methods.
    expect(await DS.newDocumentVersionsAsync('ftp://localhost/x.aml')).toEqual([]);
    expect(await DS.streamElementWithNameAsync('http://127.0.0.1:9/x.aml', 'RoleClass', null)).toEqual([]);
    expect(await DS.streamElementWithNameAsync('http://u:p@127.0.0.1:9/x.aml', 'RoleClass', null)).toEqual([]);
    // GitHub paths go through the registered IGitHubAccessService (here a fake serving the local files).
    class FakeGitHub {
      isGitHubPath(p: string): boolean {
        return p.startsWith('https://github.com/');
      }
      async getResponseFromGitServerAsync(url: string): Promise<Response | null> {
        const local = join(dir, url.substring(url.lastIndexOf('/') + 1));
        return existsSync(local) ? new Response(new Uint8Array(readFileSync(local))) : new Response('', { status: 404 });
      }
    }
    registerInterfaces(FakeGitHub, 'IGitHubAccessService', 'IAMLService');
    SL.register(new FakeGitHub(), 'IGitHubAccessService');
    try {
      for (const f of [...readdirSync(dir), 'missing.aml']) {
        const url = 'https://github.com/o/r/blob/main/' + f;
        const local = join(dir, f);
        expect(await DS.newDocumentVersionsAsync(url)).toEqual([...DS.newDocumentVersions(local)]);
        expect(await DS.oldDocumentVersionsAsync(url)).toEqual([...DS.oldDocumentVersions(local)]);
        expect(Wr(await DS.streamElementWithNameAsync(url, 'RoleClass', null))).toBe(Wr(DS.streamElementWithName(local, 'RoleClass', null)));
        // The synchronous methods cannot wait for the service (C# blocks on the task).
        expect(() => DS.newDocumentVersions(url)).toThrow();
        expect(() => DS.streamElementWithName(url, 'RoleClass', null)).toThrow();
      }
    } finally {
      SL.unRegister('IGitHubAccessService');
    }
  });

  // Password hashes use a random IV: the hashes System.Security.Cryptography made in the oracle run
  // (model-hashes.json) must decrypt in the port, synchronously and with WebCrypto, and hashes the
  // port makes must decrypt to the same text.
  it('model: oracle password hashes', async () => {
    const own: { plain: string; hash: string }[] = JSON.parse(readFileSync(join(oracleDir, 'model-hashes.json'), 'utf8'));
    expect(own.length).toBeGreaterThan(0);
    for (const { plain, hash: h } of own) {
      const d: any = new AMLLibraryServerDataProfile();
      d.passwordHash = h;
      expect(d.password).toBe(plain);
      expect(await d.getPasswordAsync()).toBe(plain);
      const e: any = new AMLLibraryServerDataProfile();
      await e.setPasswordAsync(plain);
      expect(e.password).toBe(plain);
      e.password = plain;
      expect(await e.getPasswordAsync()).toBe(plain);
    }
    const n: any = new AMLLibraryServerDataProfile();
    await n.setPasswordAsync('');
    expect(n.passwordHash).toBe(null);
    expect(await n.getPasswordAsync()).toBe('');
    n.passwordHash = Buffer.from(new Uint8Array(16)).toString('base64');
    expect(await n.getPasswordAsync()).toBe('');
    n.passwordHash = 'AAAA';
    expect(await n.getPasswordAsync()).toBe(null);
  });
});
