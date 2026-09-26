// Oracle parity of Aml.Engine.AmlObjects (+ Extensions, MimeType), the standard libraries and
// AutomationMLContainer (AMLX). The JS counterpart of oracle/AmlObjectsOracle.cs: every section
// makes the same calls in the same order and records the same lines. Keep both files in sync.
// AMLX packages are compared part by part (names, content types, relationships, part bytes) and
// by their zip directory structure; deflate output bytes may differ (fflate vs. zlib).

/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import '../../src/engine/index.js';
import { T } from '../../src/engine/registry.js';
import { implementsInterface } from '../../src/engine/interfaces.js';
import { CAEXDocument } from '../../src/engine/caex/CAEXDocument.js';
import { CAEXElementFactory } from '../../src/engine/caex/extensions/CAEXElementFactory.js';
import { XmlOperation } from '../../src/engine/xmlext/XmlOperation.js';
import { AmlObjectsExtensions as X } from '../../src/engine/amlobjects/extensions/AmlObjectsExtensions.js';
import { AMLFile } from '../../src/engine/amlobjects/AMLFile.js';
import { AMLFacet } from '../../src/engine/amlobjects/AMLFacet.js';
import { AMLGroup } from '../../src/engine/amlobjects/AMLGroup.js';
import { AMLPort } from '../../src/engine/amlobjects/AMLPort.js';
import { AMLSystemUnitClass } from '../../src/engine/amlobjects/AMLSystemUnitClass.js';
import { AutomationMLBaseAttributeTypeLib } from '../../src/engine/amlobjects/AutomationMLBaseAttributeTypeLib.js';
import { AutomationMLBaseAttributeTypeLibType } from '../../src/engine/amlobjects/AutomationMLBaseAttributeTypeLibType.js';
import { AutomationMLBaseRoleClassLib } from '../../src/engine/amlobjects/AutomationMLBaseRoleClassLib.js';
import { AutomationMLBaseRoleClassLibType } from '../../src/engine/amlobjects/AutomationMLBaseRoleClassLibType.js';
import { AutomationMLContainer, AutomationMLContainer_RelationshipType as RT } from '../../src/engine/amlobjects/AutomationMLContainer.js';
import { AutomationMLInterfaceClassLib } from '../../src/engine/amlobjects/AutomationMLInterfaceClassLib.js';
import { AutomationMLInterfaceClassLibType } from '../../src/engine/amlobjects/AutomationMLInterfaceClassLibType.js';
import { AutomationMLLogicInterfaceClassLib } from '../../src/engine/amlobjects/AutomationMLLogicInterfaceClassLib.js';
import { AutomationMLLogicInterfaceClassLibType } from '../../src/engine/amlobjects/AutomationMLLogicInterfaceClassLibType.js';
import { AutomationMLLogicRoleClassLib } from '../../src/engine/amlobjects/AutomationMLLogicRoleClassLib.js';
import { AutomationMLLogicRoleClassLibType } from '../../src/engine/amlobjects/AutomationMLLogicRoleClassLibType.js';
import { AutomationMLPLCopenXMLInterfaceClassLib } from '../../src/engine/amlobjects/AutomationMLPLCopenXMLInterfaceClassLib.js';
import { AutomationMLPLCopenXMLInterfaceClassLibType } from '../../src/engine/amlobjects/AutomationMLPLCopenXMLInterfaceClassLibType.js';
import { CAEXSignatureHeader as Sig } from '../../src/engine/amlobjects/CAEXSignatureHeader.js';
import { ClassReferenceWithAlias } from '../../src/engine/amlobjects/ClassReferenceWithAlias.js';
import { DocumentVersionInformation } from '../../src/engine/amlobjects/DocumentVersionInformation.js';
import { DocumentVersions as DV } from '../../src/engine/amlobjects/DocumentVersions.js';
import { ExternalDataReference as EDR } from '../../src/engine/amlobjects/ExternalDataReference.js';
import { FrameAttributeType } from '../../src/engine/amlobjects/FrameAttributeType.js';
import { FrameValues } from '../../src/engine/amlobjects/FrameValues.js';
import { ListAttribute as LA } from '../../src/engine/amlobjects/ListAttribute.js';
import { MetaInformation } from '../../src/engine/amlobjects/MetaInformation.js';
import { RefTypeAttributeType } from '../../src/engine/amlobjects/RefTypeAttributeType.js';
import { RefURIAttributeType } from '../../src/engine/amlobjects/RefURIAttributeType.js';
import { Version } from '../../src/engine/amlobjects/internal/Version.js';
import { MimeTypeMap } from '../../src/engine/amlobjects/mimetype/MimeTypeMap.js';
import { CompressionOption, FileAccess, FileMode, FileShare, PackagePart, PackageRelationship, TargetMode } from '../../src/engine/amlobjects/packaging/Package.js';
import { MemoryStream } from '../../src/engine/amlobjects/packaging/MemoryStream.js';
import { AMLLibraries } from '../../src/engine/resources/libraries/AMLLibraries.js';
import { XMLSignature } from '../../src/engine/services/model/XMLSignature.js';
import { SourceDocumentInformationType_Properties } from '../../src/engine/caex/SourceDocumentInformationType.js';
import { XAttribute, XElement, XName, parseXDocument } from '../../src/xml/index.js';
import { DateTime, DateTimeKind, Uri, UriKind } from '../../src/system/index.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';
import { formatDouble } from '../../src/system/Number.js';
import { from } from '../../src/system/linq.js';
import { oracleOut } from '../setup/oracle-out.js';

const testDir = join(__dirname, '..');
const inputDir = join(testDir, 'amlobjects');
const corpusDir = join(testDir, 'corpus');
const outDir = join(oracleOut, 'amlobjects');
const workDir = resolve(oracleOut, 'amlobjects-work-js');
const has = existsSync(join(outDir, 'amlx.json'));

// ---------------------------------------------------------------- recording

class Canon {
  private readonly guids = new Map<string, string>();
  private readonly rels = new Map<string, string>();
  apply(text: string): string {
    text = replaceAllCi(text, workDir, '<DIR>');
    text = replaceAllCi(text, workDir.replace(/\\/g, '/'), '<DIR>');
    text = text.replace(/\bR[0-9a-f]{16}\b/g, (m) => {
      let id = this.rels.get(m);
      if (!id) {
        id = 'RID' + (this.rels.size + 1);
        this.rels.set(m, id);
      }
      return id;
    });
    // Timestamps of "now" (DateTime.Now defaults) within a day of the run become NOW.
    const recent = (y: number, mo: number, d: number) => Math.abs(new Date(y, mo - 1, d).getTime() - new Date(new Date().toDateString()).getTime()) <= 86_400_000 * 1.05;
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
    this.lines.push(this.c.apply(label + '=' + s));
  }
  doc(label: string, doc: any): void {
    let s: string;
    try {
      s = saveString(doc);
    } catch (e) {
      s = ex(e);
    }
    this.lines.push(this.c.apply(label + '=' + s));
  }
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

function F(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return B(v);
  if (typeof v === 'number') return formatDouble(v);
  if (v instanceof Version) return 'V(' + v.toString() + ')';
  if (v instanceof Uri) return fUri(v);
  if (v instanceof XElement) return v.toString();
  if (v instanceof T.CAEXWrapper) return D(v);
  if (v instanceof MetaInformation) return metaText(v);
  if (v instanceof DocumentVersionInformation) return `DV(${N(v.documentIdentifier)}|${N(v.version)})`;
  if (v instanceof FrameValues) return `Frame(${F(v.x)},${F(v.y)},${F(v.z)},${F(v.rx)},${F(v.ry)},${F(v.rz)})`;
  if (v instanceof XMLSignature) return 'XMLSignature';
  if (v instanceof PackagePart) return 'Part(' + v.uri.toString() + ')';
  if (v instanceof PackageRelationship) return `Rel(${v.id}|${v.relationshipType}|${v.targetUri.toString()}|${TargetMode[v.targetMode]}|${v.sourceUri.toString()})`;
  if (typeof (v as any)[Symbol.iterator] === 'function') return '[' + [...(v as Iterable<unknown>)].map(F).join(',') + ']';
  return (v as object).constructor.name;
}

function metaText(m: any): string {
  return `Meta(${N(m.writerName)}|${N(m.writerID)}|${N(m.writerVendor)}|${N(m.writerVendorURL)}|${N(m.writerVersion)}|${N(m.writerRelease)}|${N(m.lastWritingDateTime)}|${N(m.writerProjectTitle)}|${N(m.writerProjectID)})`;
}

function fUri(u: Uri): string {
  let s = `Uri(${u.originalString}|${B(u.isAbsoluteUri)}|${Tr(() => u.toString())}`;
  if (u.isAbsoluteUri) s += `|${Tr(() => u.scheme)}|${Tr(() => u.absoluteUri)}|${Tr(() => u.localPath)}|${Tr(() => u.fragment)}`;
  return s + ')';
}

function D(w: any): string {
  if (w === null || w === undefined) return 'null';
  if (w.node == null) return w.constructor.name + '(nonode)';
  if (w instanceof T.CAEXObject) return `${w.constructor.name}:${w.node.name.localName}|${N(w.name)}|${N(w.id)}|${Tr(() => w.caexPath())}`;
  if (implementsInterface(w, 'IObjectWithRoleReference')) return `${w.constructor.name}:${w.node.name.localName}|${Tr(() => w.roleReference)}`;
  return `${w.constructor.name}:${w.node.name.localName}`;
}

function saveString(doc: any): string {
  const bytes: Uint8Array = doc.saveToStream(true);
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  return new TextDecoder().decode(bytes.subarray(start));
}

function readAllText(path: string): string {
  const bytes = readFileSync(path);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder().decode(bytes.subarray(3));
  return new TextDecoder().decode(bytes);
}

const hash = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex').substring(0, 16).toUpperCase();
const hashBytes = (b: Uint8Array) => createHash('sha256').update(b).digest('hex').substring(0, 16).toUpperCase();

// ---------------------------------------------------------------- targets

function wrappers(doc: any): any[] {
  return [...doc.xDocument.root.descendantsAndSelf()].map((e: any) => XmlOperation.createCAEXWrapper(e)).filter((w: any) => w != null);
}

function pick(doc: any, op: any, key: string, filter: (x: any) => boolean): any {
  const all = wrappers(doc).filter(filter);
  if (all.length === 0) return null;
  return all[op[key] % all.length];
}

const isIE = (x: any) => x instanceof T.InternalElementType;
const isSUC = (x: any) => x instanceof T.SystemUnitClassType;
const isAttr = (x: any) => x instanceof T.AttributeType;
const isOWA = (x: any) => implementsInterface(x, 'IObjectWithAttributes');
const isEI = (x: any) => x instanceof T.ExternalInterfaceType;
const isRole = (x: any) => implementsInterface(x, 'IObjectWithRoleReference');
const isIC = (x: any) => x instanceof T.InterfaceClassType;
const isObj = (x: any) => x instanceof T.CAEXObject;
const any_ = () => true;

function start(s: string): any {
  if (s === 'new30') return CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
  if (s === 'new215') return CAEXDocument.new_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15);
  if (s.startsWith('docs:')) return CAEXDocument.loadFromString(readAllText(join(inputDir, 'docs', s.substring(5))));
  return CAEXDocument.loadFromString(readAllText(join(corpusDir, s.substring(7))));
}

// ---------------------------------------------------------------- read sweep

const AttrIs = ['IsAssociatedExternalValue', 'IsAssociatedFacet', 'IsCardinality', 'IsCategory', 'IsDirection', 'IsDocLang', 'IsFrame', 'IsListType', 'IsLocalizedAttribute', 'IsMIMEType', 'IsOrderedListType', 'IsRefUri'];
const RoleIs = ['IsAutomationMLBaseRole', 'IsFacet', 'IsFrame', 'IsGroup', 'IsInterlockingSourceGroup', 'IsInterlockingTargetGroup', 'IsLogicObject', 'IsPort', 'IsProcess', 'IsProcessStructure', 'IsProduct', 'IsProductStructure', 'IsPropertySet', 'IsResource', 'IsResourceStructure', 'IsStructure'];
const LogicRoleIs = ['IsInterlockingSourceGroup', 'IsInterlockingTargetGroup', 'IsLogicModelObject'];
const IfIs = ['IsAutomationMLBaseInterface', 'IsBehaviourLogicInterface', 'IsCOLLADAInterface', 'IsCommunicationInterface', 'IsExternalDataConnector', 'IsExternalDataReference', 'IsInterlockingConnector', 'IsInterlockingLogicInterface', 'IsInterlockingVariableInterface', 'IsLogicElementInterface', 'IsLogicInterface', 'IsOrderInterface', 'IsPLCopenXMLInterface', 'IsPortConnector', 'IsPPRConnector', 'IsSequencingBehaviourLogicInterface', 'IsSequencingLogicInterface', 'IsSignalInterface', 'IsVariableInterface'];
const LogicIfIs = ['IsBehaviourLogicModelInterface', 'IsInterlockingLogicModelInterface', 'IsInterlockingVariableInterface', 'IsLogicModelElementInterface', 'IsLogicModelInterface', 'IsSequencingLogicModelInterface', 'IsVariableInterface'];

const lc = (n: string) => n[0]!.toLowerCase() + n.substring(1);

function bits(cls: any, names: string[], arg: unknown): string {
  let s = '';
  for (const n of names) {
    try {
      s += cls[lc(n)](arg) ? '1' : '0';
    } catch {
      s += '!';
    }
  }
  return s;
}

function refProps(r: any): string {
  return `uri=${Tr(() => r.theUri)};file=${Tr(() => r.filePath)};node=${Tr(() => r.referencedNode)};abs=${Tr(() => r.isAbsoluteUri())};isFile=${Tr(() => r.isFile())};isRef=${Tr(() => r.isRefURIAttribute)};eq=${Tr(() => r.uriReferencesAreEqual('geo/robot.dae#node1'))}`;
}

function facetInfo(f: any): string {
  let s = 'isFacet=' + Tr(() => f.isFacet);
  s += ';assignedA=' + Tr(() => f.assignedParentAttributes());
  s += ';notAssignedA=' + Tr(() => f.notAssignedParentAttributes());
  s += ';assignedI=' + Tr(() => f.assignedParentInterfaces());
  s += ';notAssignedI=' + Tr(() => f.notAssignedParentInterfaces());
  s += ';src=' + Tr(() => [...f.facetAttribute].map((a: any) => Tr(() => f.sourceAttribute(a))));
  s += ';srcI=' + Tr(() => [...f.facetExternalInterface].map((a: any) => Tr(() => f.sourceInterface(a))));
  s += ';seq=' + Tr(() => [...f.facetAttribute].map((a: any) => f.caexSequence(a)?.constructor.name ?? null));
  return s;
}

function sweep(w: any): string {
  let sb = D(w);
  const add = (k: string, f: () => unknown) => {
    sb += ';' + k + '=' + Tr(f);
  };
  if (w instanceof T.InternalElementType) {
    const ie = w as any;
    add('facet', () => X.isAMLFacet(ie));
    add('group', () => X.isAMLGroup(ie));
    add('port', () => X.isAMLPort(ie));
    add('docEl', () => EDR.isDocumentElement(ie));
    add('langs', () => EDR.getLanguages(ie));
    if (Tr(() => X.isAMLFacet(ie)) === 'true') sb += ';' + facetInfo(X.amlFacet(ie));
    if (Tr(() => X.isAMLGroup(ie)) === 'true') {
      add('assoc', () => X.amlGroup(ie).associatedFacet);
      add('associable', () => X.amlGroup(ie).associableFacets());
      add('mirrorFacets', () => X.amlGroup(ie).associableFacetsOfMirrorElements());
    }
  }
  if (w instanceof T.SystemUnitClassType) {
    add('facets', () => X.amlSystemUnitClass(w)?.amlFacets);
    add('groups', () => X.amlSystemUnitClass(w)?.amlGroups);
    add('ports', () => X.amlSystemUnitClass(w)?.amlPorts);
    add('amlObj', () => X.isAMLObject(w));
    add('docEls', () => EDR.documentElements(w));
  }
  if (w instanceof T.ExternalInterfaceType) {
    add('amlObj', () => X.isAMLObject(w));
    add('facetIf', () => X.isFacetInterface(w));
  }
  if (implementsInterface(w, 'IObjectWithAttributes')) {
    add('frameAttr', () => X.frameAttribute(w));
    add('refUriAttr', () => X.refURIAttribute(w));
    add('refTypeAttr', () => X.refTypeAttribute(w));
    add('attrDesc', () => [...X.amlAttributes(w).attributeAndDescendants].length);
  }
  if (w instanceof T.AttributeType) {
    const a = w as any;
    add('list', () => `${B(LA.isListAttribute(a))}${B(LA.isOrderedListAttribute(a))}${B(LA.isUnOrderedListAttribute(a))}`);
    add('items', () => LA.listItems(a));
    add('itemValues', () => LA.listItemValues(a));
    add('facetAttr', () => X.isFacetAttribute(a));
    add('isRefUri', () => X.isRefURIAttribute(a));
    add('isRefType', () => X.isRefTypeAttribute(a));
    add('isFrame', () => FrameAttributeType.isFrame(a.node));
    add('isFrameAttr', () => FrameAttributeType.isFrameAttribute(a));
    if (Tr(() => FrameAttributeType.isFrame(a.node)) === 'true') add('frame', () => new FrameAttributeType(a.node).frame);
    if (Tr(() => X.isRefURIAttribute(a)) === 'true') sb += ';' + refProps(X.toRefURIAttribute(a));
    if (Tr(() => X.isRefTypeAttribute(a)) === 'true') add('refType', () => `${B(X.toRefTypeAttribute(a).isExplicit())}${B(X.toRefTypeAttribute(a).isImplicit())}`);
  }
  if (w instanceof T.AttributeTypeType) add('attrIs', () => bits(AutomationMLBaseAttributeTypeLib, AttrIs, w));
  if (implementsInterface(w, 'IObjectWithRoleReference')) {
    add('roleIs', () => bits(AutomationMLBaseRoleClassLib, RoleIs, w));
    add('logicRoleIs', () => bits(AutomationMLLogicRoleClassLib, LogicRoleIs, w));
  }
  if (w instanceof T.InterfaceClassType) {
    add('ifIs', () => bits(AutomationMLInterfaceClassLib, IfIs, w));
    add('logicIfIs', () => bits(AutomationMLLogicInterfaceClassLib, LogicIfIs, w));
    add('plcIs', () => bits(AutomationMLPLCopenXMLInterfaceClassLib, ['IsVariableInterface'], w));
  }
  if (w instanceof T.CAEXObject) {
    add('sig', () => Sig.getSignatureHeader(w as any));
    add('xmlSig', () => Sig.getXMLSignature(w as any));
  }
  return sb;
}

const ValidVersions = ['2.0', '2.1', '2.2', '1.0', 'AutomationML 2.1', 'AutomationML 3.0', 'AutomationML', 'abc', '', ' ', '2.0.0.0', 'AutomationML 2.0 2.1'];

function isLoadedAll(doc: any): string {
  return `${B(AutomationMLBaseRoleClassLibType.isLoaded(doc))}${B(AutomationMLInterfaceClassLibType.isLoaded(doc))}${B(AutomationMLBaseAttributeTypeLibType.isLoaded(doc))}${B(AutomationMLLogicInterfaceClassLibType.isLoaded(doc))}${B(AutomationMLPLCopenXMLInterfaceClassLibType.isLoaded(doc))}`;
}

function fileSweep(r: Rec, doc: any): void {
  const file = doc.caexFile;
  r.v('schema', () => doc.schemaVersionString);
  r.v('amlVersion', () => X.amlFile(file).automationMLVersion);
  r.v('amlVersionDoc', () => X.automationMLVersion(doc));
  r.v('amlVersionFile', () => X.automationMLVersion(file));
  r.v('amlCreate', () => AMLFile.create(doc).automationMLVersion);
  r.v('maxVersion', () => X.amlFile(file).maximalAMLVersion);
  for (const v of ValidVersions) r.v('valid:' + v, () => X.amlFile(file).isValidAutomationMLVersion(v));
  r.v('writerHeader', () => X.amlFile(file).writerHeader);
  r.v('meta', () => X.amlFile(file).getMetaInformation());
  r.v('metaExt', () => X.getMetaInformation(file));
  const ids: (string | null)[] = ['nope', '', null, 'ToolA', 'ToolB'];
  try {
    ids.push(...[...(X.amlFile(file).getMetaInformation() as Iterable<any>)].map((m: any) => m.writerID));
  } catch {
    /* as in C# */
  }
  for (const id of ids) r.v('metaById:' + N(id), () => X.amlFile(file).getMetaInformation(id));
  r.v('genericAI', () => X.amlFile(file).genericAdditionalInformation);
  for (const ai of [...file.additionalInformation.elementAndValues].map((e: any) => e.node)) {
    r.v('ai', () => `${B(AMLFile.isAutomationMLVersion(ai))}${B(AMLFile.isDocumentVersion(ai))}${B(X.amlFile(file).isWriterHeader(ai))}${B(X.amlFile(file).isGenericAdditionalInformation(ai))}`);
  }
  r.v('loaded', () => isLoadedAll(doc));
  r.v('bpr', () => `${D(EDR.automationMLBPRInterfaceClassLib(file))}|${D(EDR.automationMLBPRRoleClassLib(file))}`);
}

function fileSweepMutating(r: Rec, doc: any): void {
  const file = doc.caexFile;
  r.v('docVersion', () => [...X.amlFile(file).documentVersion]);
  r.v('allDocVersions', () => [...DV.getAllDocumentVersionInformation(file)]);
  r.v('docVersionGet', () => DV.getDocumentVersionInformation(file, 'AR_001E'));
  r.v('docVersionGet2', () => DV.getDocumentVersionInformation(file, 'BPR_005E'));
  r.v('docVersionsHeader', () => DV.documentVersionsHeader(file));
}

function corpusSweep(r: Rec, doc: any): void {
  fileSweep(r, doc);
  for (const w of wrappers(doc)) r.lines.push(r.c.apply(sweep(w)));
  fileSweepMutating(r, doc);
  r.v('hash', () => hash(r.c.apply(saveString(doc))));
}

// ---------------------------------------------------------------- random operations

const LibLoaders: Record<string, (d: any) => unknown> = {
  baseRole: (d) => {
    const l: any = AutomationMLBaseRoleClassLibType.roleClassLib(d);
    return [
      l, l.automationMLBaseRole, l.facet, l.frame, l.group, l.port, l.process, l.processStructure, l.product, l.productStructure, l.propertySet, l.resource, l.resourceStructure, l.structure,
      l.interlockingSourceGroup, l.interlockingTargetGroup, l.logicObject,
      l.roleClass.count, D(AutomationMLBaseRoleClassLib.addAutomationMLBaseRoleClassLib(d)),
    ];
  },
  interface: (d) => {
    const l: any = AutomationMLInterfaceClassLibType.interfaceClassLib(d);
    return [l, l?.interfaceClass.count ?? null, D(AutomationMLInterfaceClassLib.addAutomationMLInterfaceClassLib(d)), l?.automationMLClass('AutomationMLInterfaceClassLib/AutomationMLBaseInterface/PortConnector') ?? null];
  },
  attribute: (d) => {
    const l: any = AutomationMLBaseAttributeTypeLibType.attributeTypeLib(d);
    return l == null
      ? [null, D(AutomationMLBaseAttributeTypeLib.addAutomationMLBaseAttributeTypeLib(d))]
      : [l, l.associatedExternalValue, l.associatedFacet, l.cardinality, l.category, l.direction, l.listType, l.localizedAttribute, l.mimeType ?? l.MIMEType, l.orderedListType, l.refURI, l.attributeType.count, D(AutomationMLBaseAttributeTypeLib.addAutomationMLBaseAttributeTypeLib(d))];
  },
  logicInterface: (d) => {
    const l: any = AutomationMLLogicInterfaceClassLibType.interfaceClassLib(d);
    return [l, l?.interfaceClass.count ?? null];
  },
  logicRole: (d) => {
    const l: any = AutomationMLLogicRoleClassLibType.roleClassLib(d);
    return [l, l?.interlockingSourceGroup ?? null, l?.interlockingTargetGroup ?? null, l?.logicModelObject ?? null, l?.roleClass.count ?? null];
  },
  plcopen: (d) => {
    const l: any = AutomationMLPLCopenXMLInterfaceClassLibType.interfaceClassLib(d);
    return [l, l?.interfaceClass.count ?? null];
  },
  bprRole: (d) => {
    EDR.addAutomationMLBPRRoleClassLib(d.caexFile);
    return [EDR.automationMLBPRRoleClassLib(d.caexFile), Tr(() => EDR.externalDataRoleClass(d.caexFile)), Tr(() => EDR.externalDataRoleClass(EDR.automationMLBPRRoleClassLib(d.caexFile)))];
  },
  bprInterface: (d) => {
    EDR.addAutomationMLBPRInterfaceClassLib(d.caexFile);
    return [EDR.automationMLBPRInterfaceClassLib(d.caexFile), Tr(() => EDR.externalDataReferenceInterfaceClass(d.caexFile)), Tr(() => EDR.externalDataReferenceInterfaceClass(EDR.automationMLBPRInterfaceClassLib(d.caexFile)))];
  },
  extData: (d) => {
    EDR.addExternalDataReferenceLibraries(d.caexFile);
    return 'ok';
  },
  isLoaded: (d) => isLoadedAll(d),
};

function meta(w: (string | null)[]): MetaInformation {
  const m = new MetaInformation();
  m.writerName = w[0] as any;
  m.writerID = w[1] as any;
  m.writerVendor = w[2] as any;
  m.writerVendorURL = w[3] as any;
  m.writerVersion = w[4] as any;
  m.writerRelease = w[5] as any;
  m.lastWritingDateTime = w[6] as any;
  m.writerProjectTitle = w[7] as any;
  m.writerProjectID = w[8] as any;
  return m;
}

function metaOf(fields: Record<string, string | null>): MetaInformation {
  const m: any = new MetaInformation();
  for (const [k, v] of Object.entries(fields)) m[k] = v;
  return m;
}

function dt(o: any): DateTime {
  return new DateTime(o.y, o.mo, o.d, o.h, o.mi, o.s, 0, (DateTimeKind as any)[o.kind]);
}

function dvi(id: string | null, version: string | null): DocumentVersionInformation {
  const d = new DocumentVersionInformation();
  d.documentIdentifier = id as any;
  d.version = version as any;
  return d;
}

function apply(doc: any, op: any): string {
  const file = doc.caexFile;
  const name: string | null = op.name ?? null;
  switch (op.op) {
    case 'addFacet':
    case 'addGroup':
    case 'addPort': {
      const suc = pick(doc, op, 'a', isSUC);
      if (!suc) return 'none';
      const asc: any = X.amlSystemUnitClass(suc);
      if (asc == null) return 'null';
      if (op.op === 'addFacet') return D(asc.addFacet(name)) + '|' + Tr(() => asc.amlFacets);
      if (op.op === 'addGroup') return D(asc.addGroup(name)) + '|' + Tr(() => asc.amlGroups);
      return D(asc.addPort(name)) + '|' + Tr(() => asc.amlPorts);
    }
    case 'createObj': {
      const alias = op.alias ?? null;
      const created: any = op.kind === 'facet' ? AMLFacet.create(doc, name as any, alias) : op.kind === 'group' ? AMLGroup.create(doc, name as any, alias) : AMLPort.create(doc, name as any, alias);
      const text = created.node.toString();
      const suc = pick(doc, op, 'a', isSUC);
      return D(created) + '|' + text + '|' + (suc == null ? 'none' : Tr(() => suc.internalElement.insert(created)));
    }
    case 'facetAttr': {
      const ie = pick(doc, op, 'a', isIE);
      if (!ie) return 'none';
      const f: any = X.amlFacet(ie);
      let res: string;
      switch (op.mode) {
        case 'append':
          res = Tr(() => f.facetAttribute.append());
          break;
        case 'appendName':
          res = Tr(() => f.facetAttribute.append(name));
          break;
        case 'appendParent':
          res = Tr(() => {
            const p = f.caexParent;
            const parentAttrs: any[] = implementsInterface(p, 'IObjectWithAttributes') ? [...p.attribute] : [];
            const pn = parentAttrs.length === 0 ? name : parentAttrs[op.b % parentAttrs.length].name;
            return f.facetAttribute.append(pn);
          });
          break;
        case 'insert':
          res = Tr(() => {
            const at = pick(doc, op, 'b', isAttr);
            return at == null ? 'none' : f.facetAttribute.insert(at);
          });
          break;
        case 'insertFacet':
          res = Tr(() => {
            const at = pick(doc, op, 'b', isAttr);
            return at == null ? 'none' : f.insert(at);
          });
          break;
        case 'import':
          res = Tr(() => {
            const at = pick(doc, op, 'b', isAttr);
            return at == null ? 'none' : f.import(at, name, false);
          });
          break;
        case 'prepend':
          res = Tr(() => f.facetAttribute.prepend());
          break;
        default:
          res = Tr(() => f.facetAttribute.prepend(name));
      }
      return res + '|' + Tr(() => f.isFacet) + '|' + Tr(() => f.attribute.count);
    }
    case 'facetIf': {
      const ie = pick(doc, op, 'a', isIE);
      if (!ie) return 'none';
      const f: any = X.amlFacet(ie);
      let res: string;
      switch (op.mode) {
        case 'append':
          res = Tr(() => f.facetExternalInterface.append());
          break;
        case 'appendName':
          res = Tr(() => f.facetExternalInterface.append(name));
          break;
        case 'appendParent':
          res = Tr(() => {
            const p = f.caexParent;
            const parentIfs: any[] = implementsInterface(p, 'IObjectWithExternalInterface') ? [...p.externalInterface] : [];
            const pn = parentIfs.length === 0 ? name : parentIfs[op.b % parentIfs.length].name;
            return f.facetExternalInterface.append(pn);
          });
          break;
        case 'insert':
          res = Tr(() => {
            const x = pick(doc, op, 'b', isEI);
            return x == null ? 'none' : f.facetExternalInterface.insert(x);
          });
          break;
        case 'insertFacet':
          res = Tr(() => {
            const x = pick(doc, op, 'b', isEI);
            return x == null ? 'none' : f.insert(x);
          });
          break;
        case 'import':
          res = Tr(() => {
            const x = pick(doc, op, 'b', isEI);
            return x == null ? 'none' : f.import(x, name, false);
          });
          break;
        case 'prepend':
          res = Tr(() => f.facetExternalInterface.prepend());
          break;
        default:
          res = Tr(() => f.facetExternalInterface.prepend(name));
      }
      return res + '|' + Tr(() => f.isFacet) + '|' + Tr(() => f.externalInterface.count);
    }
    case 'facetQuery': {
      const ie = pick(doc, op, 'a', isIE);
      return ie == null ? 'none' : D(ie) + '|' + facetInfo(X.amlFacet(ie));
    }
    case 'groupInsert': {
      const ie = pick(doc, op, 'a', isIE);
      const x = pick(doc, op, 'b', isIE);
      if (!ie || !x) return 'none';
      const g: any = X.amlGroup(ie);
      const res =
        op.mode === 'insert'
          ? Tr(() => g.insert(x))
          : op.mode === 'asFirst'
            ? Tr(() => g.insert(x, false))
            : op.mode === 'seqInsert'
              ? Tr(() => g.amlGroupInternalElement.insert(x))
              : Tr(() => g.import(x, name, false));
      return res + '|' + Tr(() => g.isGroup) + '|' + Tr(() => g.associableFacets()) + '|' + Tr(() => g.associableFacetsOfMirrorElements()) + '|' + Tr(() => g.internalElement.count);
    }
    case 'groupAssoc': {
      const ie = pick(doc, op, 'a', isIE);
      if (!ie) return 'none';
      const g: any = X.amlGroup(ie);
      const events: string[] = [];
      g.propertyChanged.subscribe((_s: unknown, e: any) => events.push(e.propertyName));
      const res = Tr(() => {
        g.associatedFacet = name;
        return g.associatedFacet;
      });
      return res + '|' + events.join(',');
    }
    case 'portInsert': {
      const ie = pick(doc, op, 'a', isIE);
      if (!ie) return 'none';
      const p: any = X.amlPort(ie);
      let res: string;
      if (op.mode === 'insert') {
        res = Tr(() => {
          const x = pick(doc, op, 'b', isIE);
          return x == null ? 'none' : p.insert(x);
        });
      } else if (op.mode === 'import') {
        res = Tr(() => {
          const x = pick(doc, op, 'b', isIE);
          return x == null ? 'none' : p.import(x, name, false);
        });
      } else {
        res = Tr(() => {
          const x = pick(doc, op, 'b', isAttr);
          return x == null ? 'none' : p.insert(x);
        });
      }
      return res + '|' + Tr(() => p.isPort);
    }
    case 'newFrame': {
      const o = pick(doc, op, 'a', isOWA);
      if (!o) return 'none';
      const v = Array.isArray(op.v) ? new FrameValues(op.v[0], op.v[1], op.v[2], op.v[3], op.v[4], op.v[5]) : null;
      const fa: any = op.ext ? X.new_FrameAttribute(o, v) : X.amlAttributes(o).new_FrameAttribute(v as any);
      return D(fa) + '|' + Tr(() => fa.frame);
    }
    case 'setFrame': {
      const at = pick(doc, op, 'a', (x) => isAttr(x) && x.name === 'Frame');
      if (!at) return 'none';
      const fa: any = new FrameAttributeType(at.node);
      const value: number = op.value;
      const fv: any = fa.frame;
      switch (op.prop) {
        case 'X':
          fv.x = value;
          break;
        case 'Y':
          fv.y = value;
          break;
        case 'Z':
          fv.z = value;
          break;
        case 'Rx':
          fv.rx = value;
          break;
        case 'Ry':
          fv.ry = value;
          break;
        case 'Rz':
          fv.rz = value;
          break;
        default:
          fa.frame = new FrameValues(value, value, value, value, value, value);
      }
      return F(fv) + '|' + Tr(() => fa.frame);
    }
    case 'createFrame': {
      const fa: any = FrameAttributeType.create(doc, op.alias ?? null);
      const o = pick(doc, op, 'a', isOWA);
      return D(fa) + '|' + Tr(() => fa.frame) + '|' + (o == null ? 'none' : Tr(() => o.attribute.insert(fa)));
    }
    case 'repairFrame': {
      const at = pick(doc, op, 'a', isAttr);
      if (!at) return 'none';
      return Tr(() => FrameAttributeType.validateAndRepairFrameDatatypes(at.node)) + '|' + Tr(() => FrameAttributeType.isFrame(at.node)) + '|' + Tr(() => FrameAttributeType.isFrameAttribute(at));
    }
    case 'refUri': {
      const o = pick(doc, op, 'a', isOWA);
      if (!o) return 'none';
      const r: any = X.amlAttributes(o).new_RefUriAttribute(op.value ?? null);
      return D(r) + '|' + refProps(r) + '|' + Tr(() => r.uriReferencesAreEqual(op.cmp)) + '|' + Tr(() => X.refURIAttribute(o));
    }
    case 'createRef': {
      const o = pick(doc, op, 'a', isOWA);
      if (op.kind === 'uri') {
        const r: any = RefURIAttributeType.create(doc);
        r.value = op.value ?? null;
        return D(r) + '|' + refProps(r) + '|' + (o == null ? 'none' : Tr(() => o.attribute.insert(r)) + '|' + Tr(() => X.refURIAttribute(o)));
      }
      const t: any = RefTypeAttributeType.create(doc);
      t.value = op.value ?? null;
      return D(t) + `|${Tr(() => t.isExplicit())}|${Tr(() => t.isImplicit())}|${Tr(() => t.isRefTypeAttribute)}|` + (o == null ? 'none' : Tr(() => o.attribute.insert(t)) + '|' + Tr(() => X.refTypeAttribute(o)));
    }
    case 'makeList': {
      const at = pick(doc, op, 'a', isAttr);
      if (!at) return 'none';
      return Tr(() => LA.makeListAttribute(at, op.ordered)) + '|' + Tr(() => LA.listItems(at));
    }
    case 'addListItem': {
      const at = pick(doc, op, 'a', (x) => isAttr(x) && (!op.listOnly || LA.isListAttribute(x)));
      if (!at) return 'none';
      return Tr(() => {
        const item: any = LA.addListItem(at, op.itemType ?? null, op.itemName ?? null);
        return item == null ? 'null' : D(item) + '|' + (item.attributeDataType ?? '');
      });
    }
    case 'convertList': {
      const at = pick(doc, op, 'a', isAttr);
      if (!at) return 'none';
      return Tr(() => LA.convertToListAttribute(at, op.itemName ?? null)) + '|' + Tr(() => LA.listItemValues(at));
    }
    case 'createList': {
      const o = pick(doc, op, 'a', isOWA);
      if (!o) return 'none';
      return Tr(() => {
        const l: any = LA.createListAttribute(o, name as any, op.count, op.itemType ?? null, op.itemName ?? null, op.ordered, op.alias ?? null);
        return D(l) + '|' + F(LA.listItems(l)) + '|' + B(LA.isOrderedListAttribute(l));
      });
    }
    case 'setMeta': {
      const w = op.w;
      if (op.ext) (X as any).setMetaInformation(file, ...w);
      else (X.amlFile(file) as any).setMetaInformation(...w);
      return 'ok|' + Tr(() => X.getMetaInformation(file));
    }
    case 'setMetaObj': {
      const m = meta(op.w);
      if (op.ext) X.setMetaInformation(file, m);
      else X.amlFile(file).setMetaInformation(m);
      return 'ok|' + Tr(() => X.getMetaInformation(file));
    }
    case 'deleteMeta':
      return F(op.ext ? X.deleteMetaInformation(file, op.id ?? null) : X.amlFile(file).deleteMetaInformation(op.id ?? null)) + '|' + Tr(() => X.getMetaInformation(file));
    case 'replaceMeta': {
      const m = meta(op.w);
      return F(op.ext ? X.replaceMetaInformation(file, op.id ?? null, m) : X.amlFile(file).replaceMetaInformation(op.id ?? null, m)) + '|' + Tr(() => X.getMetaInformation(file));
    }
    case 'getMeta':
      return F(op.ext ? X.getMetaInformation(file, op.id ?? null) : X.amlFile(file).getMetaInformation(op.id ?? null));
    case 'clearMeta':
      if (op.ext) X.clearMetaInformation(file);
      else X.amlFile(file).clearMetaInformation();
      return 'ok|' + Tr(() => X.getMetaInformation(file));
    case 'stdLibMeta':
      if (op.ext) X.setMetaInformationStandardAutomationMLLibrary(file);
      else X.amlFile(file).setMetaInformationStandardAutomationMLLibrary();
      return 'ok|' + Tr(() => X.getMetaInformation(file));
    case 'setSDI': {
      const w = op.w;
      const d = dt(op.dt);
      if (op.props) {
        const p: any = new SourceDocumentInformationType_Properties();
        p.originName = w[0];
        p.originID = w[1];
        p.originVendor = w[2];
        p.originVendorURL = w[3];
        p.originVersion = w[4];
        p.originRelease = w[5];
        p.lastWritingDateTime = d;
        p.originProjectTitle = w[7];
        p.originProjectID = w[8];
        X.amlFile(file).setSourceDocumentInformation(p);
      } else if (op.ext) X.setSourceDocumentInformation(file, w[0], w[1], w[2], w[3], w[4], w[5], d, w[7], w[8]);
      else X.amlFile(file).setSourceDocumentInformation(w[0], w[1], w[2], w[3], w[4], w[5], d, w[7], w[8]);
      return 'ok|' + Tr(() => X.getMetaInformation(file));
    }
    case 'sdiMeta': {
      const sdi = from<any>(file.sourceDocumentInformation).firstOrDefault();
      if (sdi == null) return 'none';
      X.setMetaInformation(sdi, meta(op.w));
      return 'ok|' + Tr(() => new MetaInformation(sdi));
    }
    case 'amlVersion': {
      const aml: any = X.amlFile(file);
      const v = op.value ?? null;
      aml.automationMLVersion = v;
      return `${Tr(() => X.amlFile(file).automationMLVersion)}|${Tr(() => X.automationMLVersion(doc))}|${Tr(() => X.amlFile(file).isValidAutomationMLVersion(v))}`;
    }
    case 'docVersion': {
      const id = op.id ?? null;
      const version = op.version ?? null;
      switch (op.mode) {
        case 'append': {
          const r = DV.appendDocumentVersionInformation(file, id, version);
          return B(r.result) + '|' + r.error;
        }
        case 'appendObj': {
          const r = DV.appendDocumentVersionInformation(file, dvi(id, version));
          return B(r.result) + '|' + r.error;
        }
        case 'delete':
          return F(DV.deleteDocumentVersionInformation(file, id));
        case 'get':
          return F(DV.getDocumentVersionInformation(file, id));
        case 'replace': {
          const d = dvi(op.newId ?? null, version);
          const r = DV.replaceDocumentVersionInformation(file, id, d);
          return B(r.result) + '|' + N(r.error) + '|' + F(d);
        }
        case 'all':
          return F([...DV.getAllDocumentVersionInformation(file)]);
        case 'seqAppend':
          return F(X.amlFile(file).documentVersion.append(dvi(id, version)));
        case 'header':
          return F(DV.documentVersionsHeader(file));
        default:
          return F([...X.amlFile(file).documentVersion]);
      }
    }
    case 'signature': {
      const o = pick(doc, op, 'a', isObj);
      if (!o) return 'none';
      if (op.mode === 'append') return F(Sig.appendSignatureHeader(o));
      if (op.mode === 'delete') return F(Sig.deleteSignature(o));
      if (op.mode === 'get') return F(Sig.getSignatureHeader(o));
      return F(Sig.getXMLSignature(o));
    }
    case 'addLanguage': {
      const ie = pick(doc, op, 'a', isIE);
      if (!ie) return 'none';
      EDR.addLanguage(ie, op.value ?? null);
      return Tr(() => EDR.getLanguages(ie)) + '|' + Tr(() => EDR.isDocumentElement(ie));
    }
    case 'docElement': {
      const suc = pick(doc, op, 'a', isSUC);
      if (!suc) return 'none';
      const path = op.path ?? null;
      const el = path == null ? EDR.addDocumentElement(suc, name as any) : EDR.addDocumentElement(suc, name as any, path);
      return D(el) + '|' + Tr(() => EDR.documentElements(suc));
    }
    case 'docRef': {
      const ie = pick(doc, op, 'a', (x) => isIE(x) && (!op.docOnly || EDR.isDocumentElement(x)));
      if (!ie) return 'none';
      const path = op.path ?? null;
      return F(path == null ? EDR.addDocumentReference(ie, name as any) : EDR.addDocumentReference(ie, name as any, path));
    }
    case 'docRole': {
      const ie = pick(doc, op, 'a', isIE);
      if (!ie) return 'none';
      return F(EDR.addDocumentElementRole(ie, op.path)) + '|' + Tr(() => EDR.isDocumentElement(ie));
    }
    case 'makeRole': {
      const r = pick(doc, op, 'a', isRole);
      if (!r) return 'none';
      (AutomationMLBaseRoleClassLib as any)[lc(op.kind)](r, op.alias ?? null);
      return D(r) + '|' + Tr(() => r.node.toString());
    }
    case 'makeIf': {
      const ic = pick(doc, op, 'a', isIC);
      if (!ic) return 'none';
      (AutomationMLInterfaceClassLib as any)[lc(op.kind)](ic, op.alias ?? null);
      return D(ic) + '|' + N(ic.refBaseClassPath);
    }
    case 'lib':
      return F(LibLoaders[op.kind]!(doc));
    case 'query': {
      const w = pick(doc, op, 'a', any_);
      return w == null ? 'none' : sweep(w);
    }
    default:
      throw new Error('unknown op ' + op.op);
  }
}

// ---------------------------------------------------------------- fixed cases

function newDoc(schema: string): any {
  return CAEXDocument.new_CAEXDocument(schema === '30' ? CAEXDocument.CAEXSchema.CAEX3_0 : CAEXDocument.CAEXSchema.CAEX2_15);
}

function first(seq: any): any {
  return from<any>(seq).first();
}

function newAttribute(doc: any, name: string): any {
  return new T.AttributeType(new XElement(doc.caexFile.node.name.namespace.getName('Attribute'), new XAttribute('Name', name)));
}

function* cases(): Generator<[string, (r: Rec) => void]> {
  yield [
    'constants',
    (r) => {
      // Compared with the oracle's list of public string constants (reflection in C#).
      const expected: string[] = JSON.parse(readFileSync(join(outDir, 'cases.json'), 'utf8')).constants;
      for (const line of expected) {
        const eq = line.indexOf('=');
        const key = line.substring(0, eq);
        const [cls, field] = key.split('.') as [string, string];
        if (cls === 'RelationshipType') {
          const rt: any = (RT as any)[field];
          r.lines.push(rt ? `${key}=${rt.name}|${rt.mimeType}|${rt.toString()}` : `${key}=<missing>`);
        } else {
          const c: any = (T as any)[cls] ?? statics[cls];
          const v = c?.[field];
          r.lines.push(`${key}=${v === undefined ? '<missing>' : v}`);
        }
      }
    },
  ];

  yield [
    'relationshipType',
    (r) => {
      const anyC = RT.getAnyContent();
      r.v('anyDefault', () => `${anyC.name}|${anyC.mimeType}`);
      r.v('anyMime', () => {
        const a = RT.getAnyContent('image/png');
        return `${a.name}|${a.mimeType}`;
      });
      r.v('anyEmpty', () => {
        const a = RT.getAnyContent('');
        return `${a.name}|${a.mimeType}`;
      });
      r.v('sameInstance', () => anyC === RT.AnyContent);
      const all = [RT.AnyContent, RT.CAEXSchema, RT.Collada, RT.ColladaSchema, RT.Library, RT.PLCopenXml, RT.PLCopenXmlSchema, RT.Root];
      for (const a of all) {
        for (const b of all) {
          r.v(`cmp:${a.name!.substring(a.name!.lastIndexOf('/') + 1)}:${b.name!.substring(b.name!.lastIndexOf('/') + 1)}`, () => Math.sign(a.compareTo(b)));
        }
      }
      r.v('cmpNull', () => anyC.compareTo(null as any));
    },
  ];

  yield [
    'classReferenceWithAlias',
    (r) => {
      for (const c of ['Lib/Class', '', null]) {
        for (const a of [null, '', 'Alias', 'a@b']) r.v(`ref:${N(c)}:${N(a)}`, () => ClassReferenceWithAlias.classReference(c as any, a));
      }
    },
  ];

  yield [
    'frameValues',
    (r) => {
      const fv: any = new FrameValues();
      r.v('default', () => fv);
      const events: string[] = [];
      fv.propertyChanged.subscribe((s: unknown, e: any) => events.push(e.propertyName + (s === fv ? '' : '?')));
      fv.x = 1;
      fv.y = 2.5;
      fv.z = -3;
      fv.rx = 1e-10;
      fv.ry = 1e21;
      fv.rz = NaN;
      r.v('set', () => fv);
      r.v('events', () => events);
      r.v('ctor', () => new FrameValues(1, 2, 3, 4, 5, 6));
      r.v('special', () => new FrameValues(Infinity, -Infinity, -0.0, 5e-324, 1.7976931348623157e308, 0.1 + 0.2));
    },
  ];

  for (const schema of ['30', '215']) {
    yield [
      'frameAttribute' + schema,
      (r) => {
        const doc = newDoc(schema);
        const ih = doc.caexFile.instanceHierarchy.append('IH');
        const ie = ih.internalElement.append('IE');
        r.v('created', () => FrameAttributeType.create(doc));
        r.v('createdAlias', () => FrameAttributeType.create(doc, 'Base').refAttributeType);
        const fa: any = FrameAttributeType.create(doc);
        r.v('createdXml', () => fa.node);
        r.v('insert', () => ie.attribute.insert(fa));
        r.v('frame', () => fa.frame);
        const fv = fa.frame;
        fv.x = 1.25;
        fv.rz = -90;
        r.v('afterSet', () => fa.frame);
        r.v('xml', () => fa.node);
        r.v('props', () => [fa.xAttribute, fa.yAttribute, fa.zAttribute, fa.rxAttribute, fa.ryAttribute, fa.rzAttribute]);
        r.v('isFrame', () => FrameAttributeType.isFrame(fa.node));
        r.v('isFrameAttr', () => FrameAttributeType.isFrameAttribute(fa));
        fa.xAttribute.unit = null;
        fa.yAttribute.attributeDataType = 'xs:string';
        fa.rxAttribute.unit = '';
        r.v('repair', () => FrameAttributeType.validateAndRepairFrameDatatypes(fa.node));
        r.v('repair2', () => FrameAttributeType.validateAndRepairFrameDatatypes(fa.node));
        r.v('repairedXml', () => fa.node);
        r.v('repairOther', () => FrameAttributeType.validateAndRepairFrameDatatypes(ie.node));
        r.v('isFrameIE', () => FrameAttributeType.isFrame(ie.node));
        r.v('partial', () => {
          const p: any = new FrameAttributeType(ie.attribute.append('Frame').node);
          return [p.frame, p.xAttribute, FrameAttributeType.isFrame(p.node)];
        });
        r.v('framePropNull', () => {
          const p: any = new FrameAttributeType(ie.attribute.append('Frame2').node);
          const v = p.frame;
          v.x = 5;
          return [p.frame, p.node];
        });
        r.v('framePropBad', () => {
          fa.framePropertyChanged(fa.frame, 'nope');
          return 'ok';
        });
        r.v('ext', () => X.new_FrameAttribute(ie));
        r.v('ext2', () => X.new_FrameAttribute(ie, new FrameValues(9, 8, 7, 6, 5, 4)));
        r.v('frameAttrExt', () => X.frameAttribute(ie)?.frame ?? null);
        r.v('owa', () => X.amlAttributes(ie).frameAttribute?.frame ?? null);
        r.v('owaNew', () => X.amlAttributes(ie).new_FrameAttribute(new FrameValues(1, 1, 1, 1, 1, 1)).frame);
        r.doc('doc', doc);
      },
    ];

    yield [
      'objects' + schema,
      (r) => {
        const doc = newDoc(schema);
        const file = doc.caexFile;
        const ih = file.instanceHierarchy.append('IH');
        const suc = ih.internalElement.append('Parent');
        suc.attribute.append('A1');
        suc.attribute.append('A2').attribute.append('Sub');
        suc.externalInterface.append('E1');
        suc.externalInterface.append('E2');
        const facet: any = AMLFacet.create(doc, 'F', 'Alias');
        r.v('facetCreated', () => facet.node);
        r.v('facetIsFacet', () => facet.isFacet);
        r.v('facetInsert', () => suc.internalElement.insert(facet));
        r.v('facetIsFacet2', () => facet.isFacet);
        r.v('facetIE', () => AMLFacet.internalElement);
        r.v('facetAppendA1', () => facet.facetAttribute.append('A1'));
        r.v('facetAppendA1again', () => facet.facetAttribute.append('A1'));
        r.v('facetAppendNo', () => facet.facetAttribute.append('Nope'));
        r.v('facetAppend', () => facet.facetAttribute.append());
        r.v('facetPrepend', () => facet.facetAttribute.prepend());
        r.v('facetInsertA2', () => facet.facetAttribute.insert(suc.attribute.item('A2')));
        r.v('facetInsertA2again', () => facet.insert(suc.attribute.item('A2')));
        r.v('facetInsertForeign', () => facet.insert(ih.internalElement.append('Other').attribute.append('X')));
        r.v('facetE1', () => facet.facetExternalInterface.append('E1'));
        r.v('facetE2', () => facet.insert(suc.externalInterface.item('E2')));
        r.v('facetImportSuc', () => facet.import(suc, 'x', false));
        r.v('facetInsertSuc', () => facet.insert(ih.internalElement.append('Moved')));
        r.v('facetInsertNull', () => facet.insert(null));
        r.v('facetImportNull', () => facet.import(null, 'x', false));
        r.v('facetInfo', () => facetInfo(facet));
        r.v('isFacetAttr', () => [...facet.attribute].map((a: any) => X.isFacetAttribute(a)));
        r.v('isFacetIf', () => [...facet.externalInterface].map((a: any) => X.isFacetInterface(a)));
        r.v('isFacetAttrParent', () => [...suc.attribute].map((a: any) => X.isFacetAttribute(a)));
        r.v('implicit', () => (AMLFacet as any).op_Implicit(facet).attribute.count);
        r.v('implicitNull', () => (AMLFacet as any).op_Implicit(null));

        const group: any = AMLGroup.create(doc, 'G');
        r.v('groupCreated', () => group.node);
        r.v('groupInsert', () => ih.internalElement.insert(group));
        r.v('groupAssoc0', () => group.associatedFacet);
        group.associatedFacet = 'F';
        r.v('groupAssoc1', () => group.associatedFacet);
        r.v('groupInsertPlain', () => group.insert(ih.internalElement.append('Plain')));
        r.v('groupInsertMirror', () => group.insert(suc.createMirror()));
        r.v('groupInsertGroup', () => group.insert(AMLGroup.create(doc, 'G2')));
        r.v('groupInsertAttr', () => group.insert(newAttribute(doc, 'GA')));
        r.v('groupImport', () => group.import(suc, 'Imported', false));
        r.v('groupImportNull', () => group.import(null, 'x', false));
        r.v('groupInsertNull', () => group.insert(null));
        r.v('groupAssociable', () => group.associableFacets());
        r.v('groupMirrorFacets', () => group.associableFacetsOfMirrorElements());
        r.v('groupIE', () => group.internalElement.count);
        r.v('groupSeq', () => group.caexSequence(first(group.internalElement))?.constructor.name ?? null);

        const port: any = AMLPort.create(doc, 'P', 'PortAlias');
        r.v('portCreated', () => port.node);
        r.v('portIsPort', () => port.isPort);
        r.v('portIE', () => AMLPort.internalElement);
        r.v('portInsertIE', () => port.insert(ih.internalElement.append('X')));
        r.v('portImportIE', () => port.import(suc, 'Y', false));
        r.v('portInsertAttr', () => port.insert(newAttribute(doc, 'PA')));
        r.v('portInsertNull', () => port.insert(null));

        const asc: any = X.amlSystemUnitClass(suc);
        r.v('ascType', () => asc?.constructor.name ?? null);
        r.v('ascFacet', () => asc.addFacet('F2'));
        r.v('ascGroup', () => asc.addGroup('G3'));
        r.v('ascPort', () => asc.addPort('P2'));
        r.v('ascLists', () => [asc.amlFacets, asc.amlGroups, asc.amlPorts]);
        r.v('ascCtor', () => new AMLSystemUnitClass(suc).amlFacets);
        const lib = file.systemUnitClassLib.append('SUCL');
        const cls = lib.systemUnitClass.append('C');
        r.v('ascFamily', () => X.amlSystemUnitClass(cls)?.constructor.name ?? null);
        r.v('ascFamilyFacet', () => X.amlSystemUnitClass(cls)!.addFacet('CF'));
        r.v('ascNull', () => X.amlSystemUnitClass(null));

        r.v('isAMLObject', () => [X.isAMLObject(suc), X.isAMLObject(facet), X.isAMLObject(port), X.isAMLObject(first(first(port.roleRequirements).externalInterface)), X.isAMLObject(ih), X.isAMLObject(file)]);
        r.v('extWrappers', () => [X.amlFacet(suc), X.amlGroup(suc), X.amlPort(suc), X.amlFacet(null), X.amlFile(file)]);
        r.v('refType', () => {
          const t: any = RefTypeAttributeType.create(doc);
          t.value = 'explicit';
          return [t, t.isExplicit(), t.isImplicit(), t.isRefTypeAttribute, RefTypeAttributeType.REF_TYPE_ATTRIBUTE, t.node];
        });
        r.v('refUri', () => {
          const t: any = RefURIAttributeType.create(doc);
          t.theUri = new Uri('http://x/a b#c');
          return [t.value, refProps(t), t.node];
        });
        r.v('refUriNull', () => {
          const t: any = RefURIAttributeType.create(doc);
          t.theUri = null;
          return t.value;
        });
        r.v('owa', () => {
          const o: any = X.amlAttributes(suc);
          return [o.caexBase instanceof T.InternalElementType, o.attribute.count, [...o.attributeAndDescendants].length, o.new_RefUriAttribute('a.aml').value, o.new_RefUriAttribute('b.aml').value, o.refURIAttribute?.value ?? null, o.refTypeAttribute];
        });
        r.v('owaRR', () => {
          const o: any = X.amlAttributes(first(port.roleRequirements));
          return o.attribute?.count ?? null;
        });
        r.v('owaNull', () => X.amlAttributes(null));
        r.doc('doc', doc);
      },
    ];

    yield [
      'meta' + schema,
      (r) => {
        const doc = newDoc(schema);
        const file = doc.caexFile;
        const aml: any = X.amlFile(file);
        r.v('initial', () => aml.getMetaInformation());
        r.v('getEmpty', () => aml.getMetaInformation(''));
        r.v('getNull', () => aml.getMetaInformation(null));
        aml.setMetaInformation('N', 'ID1', 'V', 'U', '1', '2', '2020-01-02T03:04:05', 'T', 'P');
        r.v('afterSet', () => aml.getMetaInformation());
        aml.setMetaInformation('N2', 'ID1', 'V2', null, null, null, '2020-02-02T00:00:00', null, null);
        r.v('afterReplace', () => aml.getMetaInformation());
        if (schema === '215') {
          r.v('nullDate', () => {
            aml.setMetaInformation('N5', 'ID5', 'V5', null, null, null, null, null, null);
            return aml.getMetaInformation('ID5');
          });
        }
        r.v('setNoId', () => {
          aml.setMetaInformation('N3', '', 'V', 'U', '1', '2', '2020-01-02', 'T', 'P');
          return aml.getMetaInformation();
        });
        r.v('setBadDate', () => {
          aml.setMetaInformation('N4', 'ID4', 'V', 'U', '1', '2', 'not a date', 'T', 'P');
          return aml.getMetaInformation();
        });
        r.v('setObjNull', () => {
          aml.setMetaInformation(null);
          return 'ok';
        });
        r.v('replaceMissing', () => aml.replaceMetaInformation('missing', metaOf({ writerID: 'X', lastWritingDateTime: '2020-01-01T00:00:00Z' })));
        r.v('replaceEmpty', () => aml.replaceMetaInformation('', metaOf({ writerID: 'Y', lastWritingDateTime: '2020-01-01T00:00:00Z' })));
        r.v('replace', () => aml.replaceMetaInformation('ID1', metaOf({ writerID: 'ID1b', writerName: 'renamed', lastWritingDateTime: '2020-01-01T00:00:00+05:00' })));
        r.v('afterReplace2', () => aml.getMetaInformation());
        r.v('delete', () => aml.deleteMetaInformation('ID1b'));
        r.v('deleteMissing', () => aml.deleteMetaInformation('missing'));
        r.v('sdi', () => {
          aml.setSourceDocumentInformation('O', 'OID', 'V', 'U', '1', '2', new DateTime(2020, 5, 6, 7, 8, 9, 0, DateTimeKind.Utc), 'T', 'P');
          return aml.getMetaInformation();
        });
        r.v('sdiNoId', () => {
          aml.setSourceDocumentInformation('O', null, 'V', 'U', '1', '2', DateTime.minValue, 'T', 'P');
          return 'ok';
        });
        r.v('sdiProps', () => {
          const p: any = new SourceDocumentInformationType_Properties();
          p.originID = 'PID';
          p.originName = 'PN';
          p.lastWritingDateTime = new DateTime(2001, 2, 3);
          aml.setSourceDocumentInformation(p);
          return aml.getMetaInformation();
        });
        r.v('sdiPropsAgain', () => {
          const p: any = new SourceDocumentInformationType_Properties();
          p.originID = 'PID';
          p.originName = 'PN2';
          p.lastWritingDateTime = new DateTime(2001, 2, 4, 0, 0, 0, 0, DateTimeKind.Local);
          aml.setSourceDocumentInformation(p);
          return aml.getMetaInformation();
        });
        r.v('sdiPropsNoId', () => {
          const p: any = new SourceDocumentInformationType_Properties();
          p.originName = 'x';
          aml.setSourceDocumentInformation(p);
          return 'ok';
        });
        r.v('sdiPropsNull', () => {
          aml.setSourceDocumentInformation(null);
          return 'ok';
        });
        r.v('writerHeader', () => aml.writerHeader);
        r.v('stdLib', () => {
          aml.setMetaInformationStandardAutomationMLLibrary();
          return aml.getMetaInformation();
        });
        r.doc('docStd', doc);
        r.v('clear', () => {
          aml.clearMetaInformation();
          return aml.getMetaInformation();
        });
        r.v('newMeta', () => new MetaInformation());
        r.v('metaFromXml', () => new MetaInformation(parseXDocument('<WriterHeader><WriterName>n</WriterName><WriterID>i</WriterID><Other>o</Other><WriterRelease/><LastWritingDateTime>x</LastWritingDateTime></WriterHeader>').root!));
        r.v('metaFromXmlNs', () => new MetaInformation(parseXDocument("<WriterHeader xmlns='http://www.dke.de/CAEX'><WriterName>n</WriterName></WriterHeader>").root!));
        r.v('metaFromSdi', () => {
          const s = from<any>(file.sourceDocumentInformation).firstOrDefault();
          return s == null ? 'none' : new MetaInformation(s);
        });
        r.v('sdiSetMeta', () => {
          const s = file.sourceDocumentInformation.append();
          X.setMetaInformation(s, metaOf({ writerID: 'S', lastWritingDateTime: '2020-01-01T10:00:00+01:00' }));
          return s.node;
        });
        r.v('sdiSetMetaBad', () => {
          const s = file.sourceDocumentInformation.append();
          X.setMetaInformation(s, metaOf({ writerID: 'S', lastWritingDateTime: 'bad' }));
          return s.node;
        });
        r.v('sdiSetMetaNull2', () => {
          X.setMetaInformation(file.sourceDocumentInformation.append(), null);
          return 'ok';
        });
        r.doc('doc', doc);
      },
    ];

    yield [
      'amlVersion' + schema,
      (r) => {
        const doc = newDoc(schema);
        const aml: any = X.amlFile(doc.caexFile);
        r.v('initial', () => aml.automationMLVersion);
        r.v('max', () => aml.maximalAMLVersion);
        for (const v of ['2.0', '1.5', '3.0', 'x', '', null, '2.1', '2.0.1.2', '2.10']) {
          r.v('set:' + N(v), () => {
            aml.automationMLVersion = v;
            return aml.automationMLVersion;
          });
          r.v('setDoc:' + N(v), () => X.automationMLVersion(doc));
        }
        for (const v of [...ValidVersions, null]) r.v('valid:' + N(v), () => aml.isValidAutomationMLVersion(v));
        r.doc('doc', doc);
        if (schema === '30') {
          r.v('superior', () => {
            doc.caexFile.superiorStandardVersion.append('AutomationML');
            return aml.automationMLVersion;
          });
          r.v('superiorOther', () => {
            const d2 = newDoc(schema);
            d2.caexFile.superiorStandardVersion.remove();
            d2.caexFile.superiorStandardVersion.append('Other 1.0');
            return X.amlFile(d2.caexFile).automationMLVersion;
          });
        }
        r.v('nullFile', () => X.automationMLVersion(null));
        r.v('statics', () => {
          const ns = doc.caexFile.node.name.namespace;
          const els = [
            new XElement(ns.getName('AdditionalInformation'), new XAttribute('AutomationMLVersion', '2.0')),
            new XElement(ns.getName('AdditionalInformation'), new XAttribute('DocumentVersions', 'x')),
            new XElement(ns.getName('AdditionalInformation'), new XElement(ns.getName('WriterHeader'))),
            new XElement(ns.getName('AdditionalInformation'), new XElement('WriterHeader')),
            new XElement(ns.getName('AdditionalInformation')),
            new XElement(ns.getName('Other'), new XAttribute('AutomationMLVersion', '2.0')),
            new XElement('AdditionalInformation', new XAttribute('DocumentVersions', 'x')),
          ];
          return els.map((e) => `${B(AMLFile.isAutomationMLVersion(e))}${B(AMLFile.isDocumentVersion(e))}${B(aml.isWriterHeader(e))}${B(aml.isGenericAdditionalInformation(e))}`);
        });
      },
    ];

    yield [
      'docVersions' + schema,
      (r) => {
        const doc = newDoc(schema);
        const file = doc.caexFile;
        r.v('header0', () => DV.documentVersionsHeader(file));
        r.v('get0', () => DV.getDocumentVersionInformation(file, 'X'));
        r.v('all0', () => [...DV.getAllDocumentVersionInformation(file)]);
        r.v('seq0', () => [...X.amlFile(file).documentVersion]);
        for (const v of ['1.0', null, '', '1', '1.2.3.4.5', 'a.b', '-1.2', '1.99999999999', ' 2.0 ', '1.0.0']) {
          r.v('append:' + N(v), () => {
            const x = DV.appendDocumentVersionInformation(file, 'D', v);
            return B(x.result) + '|' + x.error;
          });
        }
        r.v('appendNoId', () => {
          const x = DV.appendDocumentVersionInformation(file, '', '1.0');
          return B(x.result) + '|' + x.error;
        });
        r.v('appendNullFile', () => {
          const x = DV.appendDocumentVersionInformation(null, 'D', '1.0');
          return B(x.result) + '|' + x.error;
        });
        r.v('appendObj', () => {
          const x = DV.appendDocumentVersionInformation(file, new DocumentVersionInformation());
          return B(x.result) + '|' + x.error;
        });
        r.v('appendE', () => {
          const x = DV.appendDocumentVersionInformation(file, 'E', '2.0');
          return B(x.result) + '|' + x.error;
        });
        r.v('all1', () => [...DV.getAllDocumentVersionInformation(file)]);
        r.v('seq1', () => [...X.amlFile(file).documentVersion]);
        r.v('get', () => DV.getDocumentVersionInformation(file, 'E'));
        r.v('getEmpty', () => DV.getDocumentVersionInformation(file, ''));
        r.v('delete', () => DV.deleteDocumentVersionInformation(file, 'D'));
        r.v('deleteMissing', () => DV.deleteDocumentVersionInformation(file, 'D'));
        r.v('deleteEmpty', () => DV.deleteDocumentVersionInformation(file, null));
        r.v('deleteNullFile', () => DV.deleteDocumentVersionInformation(null, 'D'));
        r.v('replace', () => {
          const x = DV.replaceDocumentVersionInformation(file, 'E', dvi('', '3.0'));
          return B(x.result) + '|' + x.error;
        });
        r.v('replaceMissing', () => {
          const x = DV.replaceDocumentVersionInformation(file, 'Q', dvi('Q2', '3.0'));
          return B(x.result) + '|' + x.error;
        });
        r.v('replaceBadVersion', () => {
          const x = DV.replaceDocumentVersionInformation(file, 'E', dvi('E', 'bad'));
          return B(x.result) + '|' + x.error;
        });
        r.v('replaceNoOld', () => {
          const x = DV.replaceDocumentVersionInformation(file, '', new DocumentVersionInformation());
          return B(x.result) + '|' + x.error;
        });
        r.v('replaceNull', () => {
          const x = DV.replaceDocumentVersionInformation(file, 'E', null as any);
          return B(x.result) + '|' + x.error;
        });
        r.v('seqAppend', () => X.amlFile(file).documentVersion.append(dvi(null, null)));
        r.v('all2', () => [...DV.getAllDocumentVersionInformation(file)]);
        r.v('header', () => DV.documentVersionsHeader(file));
        r.v('create', () => DV.createDocumentVersionsHeader(file));
        r.v('headerAfterCreate', () => DV.documentVersionsHeader(file));
        r.v('dviDefault', () => new DocumentVersionInformation());
        r.v('dviXml', () => [
          new DocumentVersionInformation(parseXDocument("<AdditionalInformation><Document DocumentIdentifier='a' Version='2'/></AdditionalInformation>").root!),
          new DocumentVersionInformation(parseXDocument('<AdditionalInformation/>').root!),
          new DocumentVersionInformation(parseXDocument('<Document/>').root!),
          new DocumentVersionInformation(parseXDocument("<Document DocumentIdentifier='x'/>").root!),
        ]);
        r.v('nullHeader', () => DV.documentVersionsHeader(null));
        r.v('nullAll', () => [...DV.getAllDocumentVersionInformation(null)]);
        r.v('nullGet', () => DV.getDocumentVersionInformation(null, 'x'));
        r.doc('doc', doc);
      },
    ];

    yield [
      'listAttributes' + schema,
      (r) => {
        const doc = newDoc(schema);
        const ie = doc.caexFile.instanceHierarchy.append('IH').internalElement.append('IE');
        const plain = ie.attribute.append('Plain');
        plain.attributeDataType = 'xs:int';
        plain.value = '5';
        r.v('isList0', () => LA.isListAttribute(plain));
        r.v('items0', () => LA.listItems(plain));
        r.v('values0', () => LA.listItemValues(plain));
        r.v('addItem0', () => LA.addListItem(plain));
        r.v('convert', () => LA.convertToListAttribute(plain));
        r.v('convertAgain', () => LA.convertToListAttribute(plain));
        r.v('xml1', () => plain.node);
        r.v('add1', () => LA.addListItem(plain, 'xs:string', 'other'));
        r.v('add2', () => LA.addListItem(plain, '', ''));
        r.v('add3', () => LA.addListItem(plain, null, null));
        r.v('values1', () => LA.listItemValues(plain));
        const ordered = ie.attribute.append('Ordered');
        r.v('makeOrdered', () => LA.makeListAttribute(ordered, true));
        r.v('makeOrderedAgain', () => LA.makeListAttribute(ordered));
        r.v('orderedAdd', () => LA.addListItem(ordered, 'xs:double', 'ignored'));
        r.v('orderedAdd2', () => LA.addListItem(ordered));
        r.v('orderedFlags', () => `${B(LA.isListAttribute(ordered))}${B(LA.isOrderedListAttribute(ordered))}${B(LA.isUnOrderedListAttribute(ordered))}`);
        const withChild = ie.attribute.append('WithChild');
        withChild.attribute.append('c');
        r.v('makeWithChild', () => LA.makeListAttribute(withChild));
        r.v('create', () => LA.createListAttribute(ie, 'L', 3, 'xs:int'));
        r.v('createOrdered', () => LA.createListAttribute(ie, 'O', 2, 'xs:string', 'ignored', true, 'Alias'));
        r.v('createZero', () => LA.createListAttribute(ie, 'Z', 0, null as any, null, false, ''));
        r.v('createXml', () => ie.attribute.item('O').node);
        r.v('nested', () => {
          const l = ie.attribute.item('L');
          LA.makeListAttribute(l.attribute.append('nestedList'));
          return LA.listItemValues(l);
        });
        r.v('langs', () => {
          EDR.addLanguage(ie, 'en');
          EDR.addLanguage(ie, 'de');
          EDR.addLanguage(ie, null);
          return ie.attribute.item('aml-DocLang').node;
        });
        r.v('langsGet', () => EDR.getLanguages(ie));
        r.v('langNull', () => {
          EDR.addLanguage(null, 'x');
          return 'ok';
        });
        r.v('getLangNull', () => EDR.getLanguages(null));
        r.doc('doc', doc);
      },
    ];

    yield [
      'signature' + schema,
      (r) => {
        const doc = newDoc(schema);
        const ie = doc.caexFile.instanceHierarchy.append('IH').internalElement.append('IE');
        r.v('get0', () => Sig.getSignatureHeader(ie));
        r.v('xml0', () => Sig.getXMLSignature(ie));
        r.v('append', () => Sig.appendSignatureHeader(ie));
        r.v('fill', () => {
          Sig.getSignatureHeader(ie)!.add(new XElement('Content', 'abc'));
          return Sig.getSignatureHeader(ie);
        });
        r.v('appendAgain', () => Sig.appendSignatureHeader(ie));
        r.v('xmlBad', () => {
          Sig.getSignatureHeader(ie)!.add('\t<not-xml\r\n');
          return Sig.getXMLSignature(ie);
        });
        r.v('delete', () => Sig.deleteSignature(ie));
        r.v('deleteAgain', () => Sig.deleteSignature(ie));
        r.v('deleteNull', () => Sig.deleteSignature(null));
        r.v('appendNull', () => Sig.appendSignatureHeader(null));
        r.v('ihSig', () => Sig.appendSignatureHeader(first(doc.caexFile.instanceHierarchy)));
        r.v('ihSig2', () => Sig.getSignatureHeader(first(doc.caexFile.instanceHierarchy)));
        r.doc('doc', doc);
      },
    ];

    yield [
      'externalData' + schema,
      (r) => {
        const doc = newDoc(schema);
        const file = doc.caexFile;
        const ie = file.instanceHierarchy.append('IH').internalElement.append('IE');
        r.v('isDocEl0', () => EDR.isDocumentElement(ie));
        r.v('docEls0', () => EDR.documentElements(ie));
        r.v('bprRole0', () => EDR.automationMLBPRRoleClassLib(file));
        r.v('bprIf0', () => EDR.automationMLBPRInterfaceClassLib(file));
        r.v('docEl', () => EDR.addDocumentElement(ie, 'Doc'));
        r.doc('afterDocEl', doc);
        r.v('docElOther', () => EDR.addDocumentElement(ie, 'Doc2', 'Nope/Nope'));
        r.v('docEls', () => EDR.documentElements(ie));
        const d = from<any>(ie.internalElement).firstOrDefault();
        if (d != null) {
          r.v('isDocEl', () => EDR.isDocumentElement(d));
          r.v('docRef', () => EDR.addDocumentReference(d, 'Ref'));
          r.v('docRefOther', () => EDR.addDocumentReference(d, 'Ref2', 'Nope/Nope'));
          r.v('docRefStd', () => EDR.addDocumentReference(d, 'Ref3', 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/ExternalDataReference'));
          r.v('lang', () => {
            EDR.addLanguage(d, 'en-US');
            EDR.addLanguage(d, 'de-DE');
            return EDR.getLanguages(d);
          });
        }
        r.v('docRefNotDoc', () => EDR.addDocumentReference(ie, 'R'));
        r.v('docRole', () => EDR.addDocumentElementRole(ie, 'AutomationMLBPRRoleClassLib/ExternalData'));
        r.v('docRoleOther', () => EDR.addDocumentElementRole(ie, 'Nope'));
        r.v('docRoleDetached', () => EDR.addDocumentElementRole(CAEXElementFactory.create(doc, T.InternalElementType)!, 'X'));
        r.v('edrIf', () => EDR.externalDataReferenceInterfaceClass(file));
        r.v('edRole', () => EDR.externalDataRoleClass(file));
        r.v('edIfLib', () => {
          const l = EDR.automationMLBPRInterfaceClassLib(file);
          return l == null ? null : EDR.externalDataReferenceInterfaceClass(l);
        });
        r.v('edRoleLib', () => {
          const l = EDR.automationMLBPRRoleClassLib(file);
          return l == null ? null : EDR.externalDataRoleClass(l);
        });
        r.v('edIfNull', () => EDR.externalDataReferenceInterfaceClass(null));
        r.v('edRoleNull', () => EDR.externalDataRoleClass(null));
        r.v('edRoleEmptyLib', () => EDR.externalDataRoleClass(file.roleClassLib.append('Empty')));
        r.v('edIfEmptyLib', () => EDR.externalDataReferenceInterfaceClass(file.interfaceClassLib.append('Empty')));
        r.v('addLibsNull', () => {
          EDR.addExternalDataReferenceLibraries(null);
          return 'ok';
        });
        r.v('addRoleNull', () => {
          EDR.addAutomationMLBPRRoleClassLib(null);
          return 'ok';
        });
        r.v('bprNull', () => EDR.automationMLBPRRoleClassLib(null));
        r.v('bprIfNull', () => EDR.automationMLBPRInterfaceClassLib(null));
        r.v('docElsNull', () => EDR.documentElements(null));
        r.v('libs', () => [...[...file.roleClassLib].map((l: any) => l.name), ...[...file.interfaceClassLib].map((l: any) => l.name)]);
        r.doc('doc', doc);
      },
    ];

    yield [
      'libraries' + schema,
      (r) => {
        for (const amlVersion of ['default', '2.0', '2.1', '1.0', '3.0']) {
          for (const kind of Object.keys(LibLoaders)) {
            const doc = newDoc(schema);
            if (amlVersion !== 'default') {
              if (schema === '30') {
                doc.caexFile.superiorStandardVersion.remove();
                doc.caexFile.superiorStandardVersion.append('AutomationML ' + amlVersion);
              } else (X.amlFile(doc.caexFile) as any).automationMLVersion = amlVersion;
            }
            r.v(`${amlVersion}:${kind}:version`, () => X.automationMLVersion(doc));
            r.v(`${amlVersion}:${kind}`, () => LibLoaders[kind]!(doc));
            r.v(`${amlVersion}:${kind}:again`, () => LibLoaders[kind]!(doc));
            r.v(`${amlVersion}:${kind}:hash`, () => hash(r.c.apply(saveString(doc))));
          }
        }
        const all = newDoc(schema);
        for (const kind of Object.keys(LibLoaders)) r.v('all:' + kind, () => LibLoaders[kind]!(all));
        r.doc('all', all);
        r.v('classes', () => AutomationMLBaseRoleClassLibType.roleClassLib(all).automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProductStructure'));
        r.v('classMissing', () => AutomationMLBaseRoleClassLibType.roleClassLib(all).automationMLClass('Nope'));
        r.v(
          'isLoadedNull',
          () =>
            `${B(AutomationMLBaseRoleClassLibType.isLoaded(null))}${B(AutomationMLInterfaceClassLibType.isLoaded(null))}${B(AutomationMLBaseAttributeTypeLibType.isLoaded(null))}${B(AutomationMLLogicInterfaceClassLibType.isLoaded(null))}${B(AutomationMLPLCopenXMLInterfaceClassLibType.isLoaded(null))}`,
        );
        r.v('loadNull', () => AutomationMLBaseRoleClassLibType.roleClassLib(null as any));
        const own = newDoc(schema);
        own.caexFile.roleClassLib.append('AutomationMLBaseRoleClassLib').roleClass.append('Mine');
        r.v('existing', () => {
          const l: any = AutomationMLBaseRoleClassLibType.roleClassLib(own);
          return [l, l.roleClass.count, l.facet, l.automationMLClass('AutomationMLBaseRoleClassLib/Mine')];
        });
        const ie = all.caexFile.instanceHierarchy.append('IH').internalElement.append('IE');
        for (const m of ['MakeFacet', 'MakeGroup', 'MakePort', 'MakeProductStructure', 'MakeStructure']) {
          const rr = ie.roleRequirements.append();
          (AutomationMLBaseRoleClassLib as any)[lc(m)](rr, null);
          r.v('derived:' + m, () => sweep(rr));
        }
        r.v('ieSweep', () => sweep(ie));
        for (const m of ['MakeSignalInterface', 'MakeCOLLADAInterface', 'MakePLCopenXMLInterface', 'MakeExternalDataConnector']) {
          const ei = ie.externalInterface.append(m);
          (AutomationMLInterfaceClassLib as any)[lc(m)](ei, '');
          r.v('derivedIf:' + m, () => sweep(ei));
        }
        if (schema === '30') {
          for (const p of ['Frame', 'ListType', 'OrderedListType', 'refURI', 'MIMEType', 'Cardinality', 'Direction', 'DocLang']) {
            const at = ie.attribute.append('at' + p);
            at.refAttributeType = 'AutomationMLBaseAttributeTypeLib/' + p;
            r.v('derivedAttr:' + p, () => sweep(at));
          }
        }
      },
    ];

    yield [
      'nullArgs' + schema,
      (r) => {
        r.v('amlAttributes', () => X.amlAttributes(null));
        r.v('frameAttribute', () => X.frameAttribute(null));
        r.v('newFrame', () => X.new_FrameAttribute(null));
        r.v('refTypeAttr', () => X.refTypeAttribute(null));
        r.v('refUriAttr', () => X.refURIAttribute(null));
        r.v('amlFile', () => X.amlFile(null));
        r.v('amlFacet', () => X.amlFacet(null));
        r.v('amlGroup', () => X.amlGroup(null));
        r.v('amlPort', () => X.amlPort(null));
        r.v('clearMeta', () => {
          X.clearMetaInformation(null);
          return 'ok';
        });
        r.v('deleteMeta', () => X.deleteMetaInformation(null, 'x'));
        r.v('getMeta', () => X.getMetaInformation(null));
        r.v('getMetaId', () => X.getMetaInformation(null, 'x'));
        r.v('replaceMeta', () => X.replaceMetaInformation(null, 'x', new MetaInformation()));
        r.v('setMeta', () => {
          X.setMetaInformation(null as any, new MetaInformation());
          return 'ok';
        });
        r.v('setMeta9', () => {
          (X as any).setMetaInformation(null, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i');
          return 'ok';
        });
        r.v('setStd', () => {
          X.setMetaInformationStandardAutomationMLLibrary(null);
          return 'ok';
        });
        r.v('setSdi', () => {
          X.setSourceDocumentInformation(null, 'a', 'b', 'c', 'd', 'e', 'f', DateTime.minValue, 'h', 'i');
          return 'ok';
        });
        r.v('isFacetAttr', () => X.isFacetAttribute(null));
        r.v('isFacetIf', () => X.isFacetInterface(null));
        r.v('isRefType', () => X.isRefTypeAttribute(null));
        r.v('isRefUri', () => X.isRefURIAttribute(null));
        r.v('toRefType', () => X.toRefTypeAttribute(null));
        r.v('toRefUri', () => X.toRefURIAttribute(null));
        r.v('isAMLObject', () => X.isAMLObject(null));
        r.v('isAMLFacet', () => X.isAMLFacet(null as any));
        r.v('isList', () => LA.isListAttribute(null as any));
        r.v('sigGet', () => Sig.getSignatureHeader(null as any));
        const doc = newDoc(schema);
        const detached = CAEXElementFactory.create(doc, T.AttributeType)!;
        r.v('detachedFacetAttr', () => X.isFacetAttribute(detached as any));
        const dIe: any = CAEXElementFactory.create(doc, T.InternalElementType)!;
        r.v('detachedFacet', () => facetInfo(X.amlFacet(dIe)));
        r.v('detachedFacetAppend', () => (X.amlFacet(dIe) as any).facetAttribute.append('x'));
        r.v('detachedDocRef', () => EDR.addDocumentReference(dIe, 'x'));
        r.v('detachedSweep', () => sweep(dIe));
        r.v('detachedGroupInsert', () => (X.amlGroup(dIe) as any).insert(CAEXElementFactory.create(doc, T.InternalElementType)));
      },
    ];
  }

  yield [
    'amlLibraries',
    (r) => {
      const names = ['AutomationMLBaseRoleClassLib', 'AutomationMLInterfaceClassLib', 'AutomationMLBaseAttributeTypeLib', 'AutomationMLLogicInterfaceClassLib', 'AutomationMLLogicRoleClassLib', 'AutomationMLPLCopenXMLInterfaceClassLib', 'AutomationMLBPRInterfaceClassLib', 'AutomationMLBPRRoleClassLib', 'AutomationMLCSRoleClassLib', 'Nope', '', null];
      const amls = ['2.0', '2.1', '2.2', '1.0', '3.0', '', null, 'AutomationML 2.1', '2', '2.0.0'];
      const caexs = ['2.15', '3.0', '', null, '4.0', '3'];
      const H = (f: () => Uint8Array | null) => {
        try {
          const s = f();
          return s == null ? 'null' : hashBytes(s);
        } catch (e) {
          return ex(e);
        }
      };
      for (const n of names) for (const a of amls) for (const c of caexs) r.lines.push(`${N(n)}|${N(a)}|${N(c)}=${H(() => AMLLibraries.getAutomationMLLibrary(n as any, a, c))}`);
      for (const a of amls) {
        for (const c of caexs) {
          r.lines.push(
            `obsolete|${N(a)}|${N(c)}=` +
              [
                H(() => AMLLibraries.automationMLBaseRoleClassLib(a, c)),
                H(() => AMLLibraries.automationMLInterfaceClassLib(a, c)),
                H(() => AMLLibraries.automationMLBaseAttributeTypeLib(a, c)),
                H(() => AMLLibraries.automationMLBPRInterfaceClassLib(a, c)),
                H(() => AMLLibraries.automationMLBPRRoleClassLib(a, c)),
              ].join(','),
          );
        }
      }
    },
  ];

  yield [
    'corpusFacets',
    (r) => {
      const doc: any = CAEXDocument.loadFromString(readAllText(join(corpusDir, '13_Facet.aml')));
      const ie = first(first(doc.caexFile.instanceHierarchy).internalElement);
      for (const f of [...ie.internalElement]) {
        const facet: any = X.amlFacet(f);
        r.v('info:' + f.name, () => facetInfo(facet));
        r.v('appendNoise:' + f.name, () => facet.facetAttribute.append('Noise'));
        r.v('appendPower:' + f.name, () => facet.facetAttribute.append('PowerSupply'));
        r.v('insertWeight:' + f.name, () => facet.facetAttribute.insert(ie.attribute.item('maxTransportationWeight')));
        r.v('info2:' + f.name, () => facetInfo(facet));
      }
      r.v('roles', () => AutomationMLBaseRoleClassLibType.roleClassLib(doc));
      for (const f of [...ie.internalElement]) r.v('sweep:' + f.name, () => sweep(f));
      r.doc('doc', doc);
    },
  ];
}

/** Static classes that are not in the registry (constants lookup). */
const statics: Record<string, unknown> = {
  ListAttribute: LA,
  ExternalDataReference: EDR,
  DocumentVersions: DV,
  CAEXSignatureHeader: Sig,
  AutomationMLBaseAttributeTypeLib,
  AutomationMLBaseRoleClassLib,
  AutomationMLInterfaceClassLib,
  AutomationMLLogicInterfaceClassLib,
  AutomationMLLogicRoleClassLib,
  AutomationMLPLCopenXMLInterfaceClassLib,
  AutomationMLContainer,
  AMLFile,
  AMLFacet,
  AMLGroup,
  AMLPort,
  FrameAttributeType,
  RefURIAttributeType,
  RefTypeAttributeType,
};

// ---------------------------------------------------------------- MIME types

function mimeCases(r: Rec): void {
  r.v('xml', () => MimeTypeMap.getMimeType('.xml'));
  const keys = [...(T as any).MappingList.mappings].map((e: any) => e.key as string);
  r.lines.push('count=' + keys.length);
  for (const k of keys) {
    r.lines.push(`${k}=${F(MimeTypeMap.getMimeType(k))}|${F(MimeTypeMap.getExtension(k))}|${Tr(() => MimeTypeMap.isXmlText(k))}|${Tr(() => [...MimeTypeMap.getKnownExtensions(k)])}`);
  }
  for (const e of [null, '', ' ', 'xml', 'XML', '.XmL', 'aml', '.aml', 'amlx', 'unknown', '.', '..xml', 'dae', 'svg', '.xsd', 'png', 'tar.gz', '\t']) {
    r.v('mime:' + N(e), () => MimeTypeMap.getMimeType(e));
    r.v('isXml:' + N(e), () => MimeTypeMap.isXmlText(e as any));
  }
  for (const m of [null, '', ' ', 'text/xml', 'TEXT/XML', 'Text/Xml', 'application/x-any', 'image/png', 'nope/nope', 'model/vnd.collada+xml']) {
    r.v('ext:' + N(m), () => MimeTypeMap.getExtension(m));
    r.v('known:' + N(m), () => [...MimeTypeMap.getKnownExtensions(m)]);
  }
  r.v('liveList', () => MimeTypeMap.getMimeType('.xml') === MimeTypeMap.getMimeType('XML'));
}

// ---------------------------------------------------------------- AMLX

const RelTypes: [string, RT][] = [
  ['AnyContent', RT.AnyContent],
  ['CAEXSchema', RT.CAEXSchema],
  ['Collada', RT.Collada],
  ['ColladaSchema', RT.ColladaSchema],
  ['Library', RT.Library],
  ['PLCopenXml', RT.PLCopenXml],
  ['PLCopenXmlSchema', RT.PLCopenXmlSchema],
  ['Root', RT.Root],
];

const U = (s: string) => new Uri(s, UriKind.Relative);

function partContent(p: any): string {
  const s = p.getStream(FileMode.Open, FileAccess.Read);
  const bytes: Uint8Array = s.toArray();
  s.dispose();
  if (p.uri.originalString.toLowerCase().endsWith('.rels')) return new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes); // BOM kept, as Encoding.UTF8.GetString
  return hashBytes(bytes) + ':' + bytes.length;
}

function describeC(r: Rec, p: string, c: any, loadRoot = true): void {
  r.v(p + 'filePath', () => c.filePath);
  r.v(p + 'compression', () => CompressionOption[c.compressionMode]);
  r.v(p + 'root', () => c.rootPackage?.uri ?? null);
  r.v(p + 'parts', () => [...c.getParts()].map((x: any) => `${x.uri.toString()}|${x.contentType}|${CompressionOption[x.compressionOption]}`));
  let partList: any[] = [];
  r.v(p + 'partCount', () => (partList = [...c.getParts()]).length);
  for (const part of partList) {
    const u = part.uri.toString();
    r.v(p + 'content:' + u, () => partContent(part));
    r.v(p + 'rels:' + u, () => [...part.getRelationships()]);
    r.v(p + 'partExists:' + u, () => c.partExists(part.uri));
    r.v(p + 'getPart:' + u, () => c.getPart(part.uri));
  }
  r.v(p + 'packageRels', () => [...c.getRelationShips()]);
  for (const [n, t] of RelTypes) {
    r.v(p + 'exists:' + n, () => c.relationShipExists(t));
    r.v(p + 'byType:' + n, () => [...c.getPartsByRelationShipType(t)]);
    r.v(p + 'relsByType:' + n, () => [...c.getRelationShipsByType(t)]);
  }
  let root: any = null;
  r.v(p + 'rootPackage', () => (root = c.rootPackage));
  if (root != null) {
    r.v(p + 'related', () => [...c.getRelatedParts(root)]);
    for (const [n, t] of RelTypes) {
      r.v(p + 'relatedByType:' + n, () => [...c.getRelatedParts(root, t)]);
      r.v(p + 'check:' + n, () => [...c.checkRelatedParts(root, t)].map((x: any) => `${x.partUri.toString()}|${x.relatedPartUri.toString()}|${B(x.exists)}`));
      r.v(p + 'relatedByUri:' + n, () => c.getRelatedPartByUri(root.uri, t));
    }
    if (loadRoot) {
      r.v(p + 'rootStream', () => {
        const s = c.rootDocumentStream();
        const doc: any = CAEXDocument.loadFromStream(s.toArray());
        s.dispose();
        return `${doc.schemaVersionString}|${N(X.automationMLVersion(doc))}|${hash(saveString(doc))}`;
      });
    }
  } else r.v(p + 'rootStream', () => c.rootDocumentStream());
  r.v(p + 'rootPath', () => c.rootDocumentPath({ fullName: join(workDir, 'rootpath') }));
  r.v(p + 'missing', () => `${B(c.partExists(U('/missing.xml')))}|${F(c.getPart(U('/missing.xml')))}|${F(c.getRelatedPartByUri(U('/missing.xml'), RT.Root))}`);
}

const ms = (path: string) => {
  const m = new MemoryStream();
  m.write(new Uint8Array(readFileSync(path)));
  return m;
};

const out: Record<string, Uint8Array> = {};

function listFiles(dir: string): string[] {
  const res: string[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else res.push(p);
    }
  };
  walk(dir);
  return res;
}

function* amlxCases(): Generator<[string, (r: Rec) => void]> {
  const data = join(inputDir, 'data');
  const xsd30 = join(inputDir, '..', '..', 'docs', 'CAEX_ClassModel_V.3.0.xsd');
  const corpus = (n: string) => join(corpusDir, n);

  yield [
    'createStream',
    (r) => {
      const m = new MemoryStream();
      const c: any = new AutomationMLContainer(m, FileMode.Create);
      let root: any = null;
      r.v('addRoot', () => (root = c.addRoot(ms(corpus('plant.aml')), U('/plant.aml'))));
      r.v('addLibRel', () => c.addLibrary(root, ms(corpus('1_AMLBaseLibraries.aml')), U('/lib/AMLBaseLibraries.aml')));
      r.v('addLibPkg', () => c.addLibrary(ms(corpus('6_RCL.aml')), U('/lib/RCL.aml')));
      r.v('addLibNoPkg', () => c.addLibrary(root, ms(corpus('7_ICL.aml')), U('/lib/ICL.aml'), false));
      r.v('addCollada', () => c.addCollada(root, ms(join(data, 'model.dae')), U('/geo/model.dae')));
      r.v('addColladaNoPkg', () => c.addCollada(root, ms(join(data, 'model.dae')), U('/geo/model2.dae'), false));
      r.v('addPlc', () => c.addPLCopenXml(root, ms(join(data, 'plc.xml')), U('/plc/logic.xml')));
      r.v('addPlcNoPkg', () => c.addPLCopenXml(root, ms(join(data, 'plc.xml')), U('/plc/logic2.xml'), false));
      r.v('addAnyMime', () => c.addAnyContent(root, ms(join(data, 'image.png')), U('/any/image.png'), 'image/png'));
      r.v('addAnyNoMime', () => c.addAnyContent(root, ms(join(data, 'notes.unknownext')), U('/any/notes.unknownext')));
      r.v('addAnyNoRel', () => c.addAnyContent(root, ms(join(data, 'readme.txt')), U('/any/readme.txt'), 'text/plain', false));
      r.v('addAnyNullRoot', () => c.addAnyContent(null, ms(join(data, 'big.txt')), U('/any/big.txt'), 'text/plain'));
      r.v('addEmpty', () => c.addAnyContent(root, ms(join(data, 'empty.bin')), U('/any/empty.bin'), 'application/octet-stream'));
      r.v('addCaexSchema', () => c.addCAEXSchema(ms(xsd30), U('/schema/CAEX_ClassModel_V.3.0.xsd')));
      r.v('addColladaSchema', () => c.addColladaSchema(ms(join(data, 'plc.xml')), U('/schema/collada.xsd')));
      r.v('addPlcSchema', () => c.addPLCopenXmlSchema(ms(join(data, 'plc.xml')), U('/schema/tc6.xsd')));
      r.v('addSpace', () => c.addAnyContent(root, ms(join(data, 'readme.txt')), U('/any/with space.txt'), 'text/plain'));
      r.v('addUnicode', () => c.addAnyContent(root, ms(join(data, 'readme.txt')), U('/any/%C3%A4.txt'), 'text/plain'));
      r.v('addUpper', () => c.addAnyContent(root, ms(join(data, 'readme.txt')), U('/ANY/UPPER.TXT'), 'text/plain'));
      r.v('addStreamPos', () => {
        const s = ms(join(data, 'readme.txt'));
        s.position = 3;
        return c.addAnyContent(root, s, U('/any/pos.txt'), 'text/plain');
      });
      describeC(r, '', c);
      r.v('close', () => {
        c.close();
        return 'ok';
      });
      r.v('afterCloseLength', () => m.length > 0);
      out.createStream = m.toArray();
      const c2: any = new AutomationMLContainer(new MemoryStream(m.toArray()));
      describeC(r, 'reopen:', c2);
      r.v('reopenAdd', () => c2.addRoot(ms(corpus('plant.aml')), U('/x.aml')));
      c2.dispose();
    },
  ];

  yield [
    'createFile',
    (r) => {
      const path = join(workDir, 'file.amlx');
      const c: any = new AutomationMLContainer(path, FileMode.Create);
      let root: any = null;
      r.v('addRoot', () => (root = c.addRoot(corpus('plant.aml'), U('/model/plant.aml'))));
      r.v('addLib', () => c.addLibrary(root, corpus('6_RCL.aml'), U('/lib/rcl.aml')));
      r.v('addLibPkg', () => c.addLibrary(corpus('7_ICL.aml'), U('/lib/icl.aml')));
      r.v('addCollada', () => c.addCollada(root, join(data, 'model.dae'), U('/geo/model.dae')));
      r.v('addPlc', () => c.addPLCopenXml(root, join(data, 'plc.xml'), U('/plc/logic.xml')));
      r.v('addAnyExt', () => c.addAnyContent(root, join(data, 'image.png'), U('/any/image.png')));
      r.v('addAnyUnknown', () => c.addAnyContent(root, join(data, 'notes.unknownext'), U('/any/notes.unknownext')));
      r.v('addAnyGiven', () => c.addAnyContent(root, join(data, 'readme.txt'), U('/any/readme.txt'), 'text/x-readme'));
      r.v('addCaexSchema', () => c.addCAEXSchema(xsd30, U('/schema/caex.xsd')));
      r.v('addColladaSchema', () => c.addColladaSchema(join(data, 'plc.xml'), U('/schema/collada.xsd')));
      r.v('addPlcSchema', () => c.addPLCopenXmlSchema(join(data, 'plc.xml'), U('/schema/tc6.xsd')));
      r.v('addMissingFile', () => c.addAnyContent(root, join(data, 'missing.bin'), U('/any/missing.bin')));
      describeC(r, '', c);
      r.v('save', () => {
        c.save();
        return 'ok';
      });
      r.v('flush', () => {
        c.flush();
        return 'ok';
      });
      r.v('extractAll', () => {
        c.extractAllFiles(join(workDir, 'extract'));
        return c.extractionDirectory;
      });
      r.v('extracted', () =>
        listFiles(join(workDir, 'extract'))
          .map((f) => relative(join(workDir, 'extract'), f).replace(/\\/g, '/') + ':' + (f.endsWith('.rels') ? new TextDecoder('utf-8', { ignoreBOM: true }).decode(readFileSync(f)) : hashBytes(readFileSync(f))))
          .sort(),
      );
      r.v('extractPart', () => {
        c.extract({ fullName: join(workDir, 'extract2') }, root);
        return c.extractionDirectory;
      });
      r.v('extracted2', () =>
        listFiles(join(workDir, 'extract2'))
          .map((f) => relative(join(workDir, 'extract2'), f).replace(/\\/g, '/'))
          .sort(),
      );
      r.v('rootPath', () => c.rootDocumentPath({ fullName: join(workDir, 'extract') }));
      r.v('dispose', () => {
        c.dispose();
        return 'ok';
      });
      r.v('disposeAgain', () => {
        c.dispose();
        return 'ok';
      });
      r.v('afterDispose', () => c.package == null);
      out.createFile = new Uint8Array(readFileSync(path));
      const c2: any = new AutomationMLContainer(path, FileMode.Open, FileAccess.Read);
      describeC(r, 'reopen:', c2);
      r.v('readOnlyAdd', () => c2.addRoot(corpus('plant.aml'), U('/x.aml')));
      r.v('readOnlyClose', () => {
        c2.close();
        return 'ok';
      });
      c2.dispose();
      const c3: any = new AutomationMLContainer(path);
      r.v('defaultOpenAdd', () => c3.addLibrary(corpus('5_SUC.aml'), U('/lib/suc.aml')));
      c3.close();
      out.createFileUpdated = new Uint8Array(readFileSync(path));
      r.v('openNew', () => {
        const p2 = join(workDir, 'new.amlx');
        const c4: any = new AutomationMLContainer(p2);
        c4.close();
        return readFileSync(p2).length;
      });
      r.v('openMissing', () => {
        const c5: any = new AutomationMLContainer(join(workDir, 'missing.amlx'), FileMode.Open);
        c5.close();
        return 'ok';
      });
      r.v('createNew', () => {
        const c6: any = new AutomationMLContainer(path, FileMode.CreateNew);
        c6.close();
        return 'ok';
      });
      r.v('share', () => {
        const c7: any = new AutomationMLContainer(path, FileMode.Open, FileAccess.Read, FileShare.Read);
        const n = [...c7.getParts()].length;
        c7.close();
        return n;
      });
    },
  ];

  yield [
    'relink',
    (r) => {
      const m = new MemoryStream();
      const c: any = new AutomationMLContainer(m, FileMode.Create, FileAccess.ReadWrite);
      const root = c.addRoot(ms(corpus('plant.aml')), U('/plant.aml'));
      const lib = c.addLibrary(root, ms(corpus('6_RCL.aml')), U('/lib/a.aml'));
      const lib2 = c.addLibrary(root, ms(corpus('7_ICL.aml')), U('/lib/b.aml'), false);
      lib.createRelationship(U('/lib/b.aml'), TargetMode.Internal, 'http://example/dep');
      r.v('relink', () => c.relinkPart(lib, root, U('/moved/a.aml')));
      describeC(r, 'r1:', c, false);
      r.v('relinkNoRelated', () => c.relinkPart(lib2, null, U('/moved/b.aml')));
      describeC(r, 'r2:', c, false);
      r.v('relinkObsolete', () => c.relinkPart(U('/moved/a.aml'), U('/again/a.aml')));
      describeC(r, 'r3:', c, false);
      r.v('relinkObsoleteRoot', () => c.relinkPart(U('/plant.aml'), U('/root/plant.aml')));
      r.v('relinkObsoleteMissing', () => c.relinkPart(U('/missing.aml'), U('/x.aml')));
      describeC(r, 'r4:', c, false);
      r.v('close', () => {
        c.close();
        return 'ok';
      });
      out.relink = m.toArray();
    },
  ];

  yield [
    'replaceRoot',
    (r) => {
      const m = new MemoryStream();
      const c: any = new AutomationMLContainer(m, FileMode.Create);
      const root = c.addRoot(ms(corpus('plant.aml')), U('/plant.aml'));
      c.addLibrary(root, ms(corpus('6_RCL.aml')), U('/lib/rcl.aml'));
      r.v('deleteRel', () => {
        const rel = first(c.getRelationShipsByType(RT.Root));
        c.package.deleteRelationship(rel.id);
        return c.relationShipExists(RT.Root);
      });
      r.v('deletePart', () => {
        c.package.deletePart(U('/plant.aml'));
        return c.partExists(U('/plant.aml'));
      });
      describeC(r, 'deleted:', c);
      r.v('newRoot', () => c.addRoot(ms(corpus('legacy-caex215.aml')), U('/new/root.aml')));
      r.v('replaceLib', () => {
        c.package.deletePart(U('/lib/rcl.aml'));
        return c.addLibrary(c.rootPackage, ms(corpus('7_ICL.aml')), U('/lib/rcl.aml'));
      });
      r.v('deleteMissing', () => {
        c.package.deletePart(U('/nope.aml'));
        return 'ok';
      });
      r.v('deleteRelMissing', () => {
        c.package.deleteRelationship('Rnope');
        return 'ok';
      });
      describeC(r, 'replaced:', c);
      c.close();
      out.replaceRoot = m.toArray();
    },
  ];

  for (const mode of [CompressionOption.NotCompressed, CompressionOption.Normal, CompressionOption.Maximum, CompressionOption.Fast, CompressionOption.SuperFast]) {
    const modeName = CompressionOption[mode];
    yield [
      'compression' + modeName,
      (r) => {
        const m = new MemoryStream();
        const c: any = new AutomationMLContainer(m, FileMode.Create);
        c.compressionMode = mode;
        const root = c.addRoot(ms(corpus('plant.aml')), U('/plant.aml'));
        c.addAnyContent(root, ms(join(data, 'big.txt')), U('/big.txt'), 'text/plain');
        c.addAnyContent(root, ms(join(data, 'image.png')), U('/image.png'), 'image/png');
        describeC(r, '', c, false);
        c.close();
        out['compression' + modeName] = m.toArray();
      },
    ];
  }

  yield [
    'empty',
    (r) => {
      const m = new MemoryStream();
      const c: any = new AutomationMLContainer(m, FileMode.Create);
      describeC(r, '', c);
      c.close();
      out.empty = m.toArray();
      r.v('length', () => m.toArray().length);
      const c2: any = new AutomationMLContainer(new MemoryStream(m.toArray()));
      describeC(r, 'reopen:', c2);
    },
  ];

  yield [
    'errors',
    (r) => {
      const m = new MemoryStream();
      const c: any = new AutomationMLContainer(m, FileMode.Create);
      const root = c.addRoot(ms(corpus('plant.aml')), U('/plant.aml'));
      r.v('duplicate', () => c.addRoot(ms(corpus('plant.aml')), U('/plant.aml')));
      r.v('duplicateCase', () => c.addRoot(ms(corpus('plant.aml')), U('/PLANT.aml')));
      r.v('absoluteUri', () => c.addAnyContent(root, ms(join(data, 'readme.txt')), new Uri('http://x/a.xml'), 'text/plain'));
      r.v('relToMissing', () => c.getPart(U('/plant.aml')).createRelationship(U('/missing.aml'), TargetMode.Internal, 'http://x/dep').id.length);
      r.v('relatedMissing', () => [...c.getRelatedParts(root)]);
      r.v('checkMissing', () => [...c.checkRelatedParts(root, RT.AnyContent)].map((x: any) => `${x.partUri.toString()}|${x.relatedPartUri.toString()}|${B(x.exists)}`));
      r.v('relExternal', () => TargetMode[c.getPart(U('/plant.aml')).createRelationship(new Uri('http://example.com/x'), TargetMode.External, RT.Library.name).targetMode]);
      r.v('relatedByType', () => [...c.getRelatedParts(root, RT.Library)]);
      r.v('relBadId', () => c.package.createRelationship(U('/plant.aml'), TargetMode.Internal, 'http://x/t', '1bad').id);
      r.v('relDupId', () => {
        c.package.createRelationship(U('/plant.aml'), TargetMode.Internal, 'http://x/t', 'Rdup');
        return c.package.createRelationship(U('/plant.aml'), TargetMode.Internal, 'http://x/t', 'Rdup').id;
      });
      r.v('relEmptyType', () => c.package.createRelationship(U('/plant.aml'), TargetMode.Internal, '').id);
      describeC(r, '', c, false);
      c.close();
      out.errors = m.toArray();
      const ro: any = new AutomationMLContainer(new MemoryStream(m.toArray()));
      r.v('roAdd', () => ro.addRoot(ms(corpus('plant.aml')), U('/y.aml')));
      r.v('roFlush', () => {
        ro.flush();
        return 'ok';
      });
      r.v('roDelete', () => {
        ro.package.deletePart(U('/plant.aml'));
        return 'ok';
      });
      r.v('roStream', () => {
        const s = ro.rootPackage.getStream();
        const w = s.canWrite;
        s.dispose();
        return w;
      });
      r.v('roClose', () => {
        ro.close();
        return 'ok';
      });
      ro.dispose();
      r.v('closedUse', () => [...ro.getParts()].length);
      r.v('notZip', () => [...new AutomationMLContainer(new MemoryStream(new TextEncoder().encode('not a zip'))).getParts()].length);
      r.v('emptyStream', () => [...new AutomationMLContainer(new MemoryStream()).getParts()].length);
      const uris: [string, string][] = [
        ['/a/', 'text/plain'], ['a.xml', 'text/plain'], ['/[Content_Types].xml', 'text/plain'], ['/_rels/.rels', 'text/plain'], ['/a%2Fb.xml', 'text/plain'],
        ['/a/../b.xml', 'text/plain'], ['/./c.xml', 'text/plain'], ['/ä.xml', 'text/plain'], ['/a%20b.xml', 'text/plain'], ['/a b2.xml', 'text/plain'], ['//x.xml', 'text/plain'],
        ['/x.xml#frag', 'text/plain'], ['/x.xml?q=1', 'text/plain'], ['/a/b.rels', 'text/plain'], ['/_rels/x.rels', 'text/plain'], ['/x.', 'text/plain'], ['/.x', 'text/plain'],
        ['/%41.xml', 'text/plain'], ['/a:b.xml', 'text/plain'], ['/plant.aml/sub.xml', 'text/plain'], ['/ok.txt', 'text/plain; charset=utf-8'], ['/ok2.txt', 'Text/Plain'],
        ['/ok3.txt', 'text/plain;a=b;c=d'], ['/ok4.txt', ' text/plain'], ['/ok5.txt', 'text/plain '], ['/ok6.txt', ''], ['/badmime.txt', 'not a mime'], ['/badmime2.txt', 'a/b/c'], ['/badmime3.txt', 'a/b;x'],
        ['/%C3%A4%20x.txt', 'text/plain'],
      ];
      for (const [u, mime] of uris) {
        r.v('uri:' + u + ':' + mime, () => {
          const ms2 = new MemoryStream();
          const c2: any = new AutomationMLContainer(ms2, FileMode.Create);
          const root2 = c2.addRoot(ms(corpus('plant.aml')), U('/plant.aml'));
          const res = Tr(() => c2.addAnyContent(root2, ms(join(data, 'readme.txt')), U(u), mime));
          const parts = Tr(() => [...c2.getParts()].map((x: any) => `${x.uri.toString()}|${x.contentType}`));
          const rels = Tr(() => [...root2.getRelationships()]);
          const close = Tr(() => {
            c2.close();
            return 'closed';
          });
          return `${res}|${parts}|${rels}|${close}`;
        });
      }
    },
  ];

  for (const fn of readdirSync(join(inputDir, 'amlx'))
    .filter((f) => f.endsWith('.amlx'))
    .sort()) {
    const f = join(inputDir, 'amlx', fn);
    const fname = fn.substring(0, fn.length - 5);
    yield [
      'existing:' + fname,
      (r) => {
        const big = statSync(f).size > 100_000;
        const fileBytes = new Uint8Array(readFileSync(f));
        const c: any = new AutomationMLContainer(f, FileMode.Open, FileAccess.Read);
        describeC(r, '', c, !big);
        r.v('rootPathStream', () => new AutomationMLContainer(new MemoryStream(fileBytes)).rootDocumentPath({ fullName: workDir }));
        r.v('close', () => {
          c.close();
          return 'ok';
        });
        c.dispose();
        const copy = join(workDir, fname + '.copy.amlx');
        copyFileSync(f, copy);
        const c2: any = new AutomationMLContainer(copy, FileMode.Open, FileAccess.ReadWrite);
        c2.close();
        out['existing-' + fname + '-unchanged'] = new Uint8Array(readFileSync(copy));
        const c3: any = new AutomationMLContainer(copy, FileMode.Open, FileAccess.ReadWrite);
        r.v('addLib', () => c3.addLibrary(c3.rootPackage, ms(corpus('6_RCL.aml')), U('/added/rcl.aml')));
        describeC(r, 'updated:', c3, false);
        c3.close();
        out['existing-' + fname + '-updated'] = new Uint8Array(readFileSync(copy));
        const m = new MemoryStream();
        m.write(new Uint8Array(readFileSync(f)));
        const c4: any = new AutomationMLContainer(m, FileMode.Open, FileAccess.ReadWrite);
        r.v('streamDeleteRoot', () => {
          c4.package.deletePart(c4.rootPackage.uri);
          return [...c4.getParts()].length;
        });
        c4.close();
        out['existing-' + fname + '-stream'] = m.toArray();
      },
    ];
  }
}

// ---------------------------------------------------------------- zip structure

interface ZipEntry {
  name: string;
  madeBy: number;
  needed: number;
  flags: number;
  method: number;
  time: number;
  date: number;
  crc: number;
  csize: number;
  usize: number;
  extraLen: number;
  commentLen: number;
  internalAttr: number;
  externalAttr: number;
  localNeeded: number;
  localFlags: number;
  localMethod: number;
  localExtraLen: number;
  content: Uint8Array;
}

/** Parses the central directory and the local headers of a zip archive (no ZIP64). */
function readZip(bytes: Uint8Array): { entries: ZipEntry[]; comment: number; cdOffset: number } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('no end of central directory');
  const count = dv.getUint16(eocd + 10, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  const comment = dv.getUint16(eocd + 20, true);
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const e: any = {
      madeBy: dv.getUint16(p + 4, true),
      needed: dv.getUint16(p + 6, true),
      flags: dv.getUint16(p + 8, true),
      method: dv.getUint16(p + 10, true),
      time: dv.getUint16(p + 12, true),
      date: dv.getUint16(p + 14, true),
      crc: dv.getUint32(p + 16, true),
      csize: dv.getUint32(p + 20, true),
      usize: dv.getUint32(p + 24, true),
      extraLen,
      commentLen,
      internalAttr: dv.getUint16(p + 36, true),
      externalAttr: dv.getUint32(p + 38, true),
      name: new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen)),
    };
    const lh = dv.getUint32(p + 42, true);
    e.localNeeded = dv.getUint16(lh + 4, true);
    e.localFlags = dv.getUint16(lh + 6, true);
    e.localMethod = dv.getUint16(lh + 8, true);
    const lNameLen = dv.getUint16(lh + 26, true);
    e.localExtraLen = dv.getUint16(lh + 28, true);
    const dataStart = lh + 30 + lNameLen + e.localExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + e.csize);
    e.content = e.method === 0 ? raw : new Uint8Array(inflateRawSync(raw));
    entries.push(e);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return { entries, comment, cdOffset };
}

/**
 * The structure of a package as text: every property of the central directory and local headers
 * except the compressed size of deflated entries (fflate) and the time of entries written now;
 * relationship IDs canonicalized, content compared through its SHA-256.
 */
function zipStructure(bytes: Uint8Array, original: Map<string, [number, number]> | null, canon: Canon): string[] {
  const z = readZip(bytes);
  const lines = [`entries=${z.entries.length} comment=${z.comment}`];
  for (const e of z.entries) {
    const text = e.name.toLowerCase().endsWith('.rels') || e.name === '[Content_Types].xml';
    const orig = original?.get(e.name);
    const time = orig && orig[0] === e.time && orig[1] === e.date ? 'orig' : 'new';
    lines.push(
      canon.apply(
        [
          e.name, `madeBy=${e.madeBy}`, `needed=${e.needed}/${e.localNeeded}`, `flags=${e.flags}/${e.localFlags}`, `method=${e.method}/${e.localMethod}`,
          `usize=${e.usize}`, e.method === 0 ? `csize=${e.csize}` : 'csize=deflated', `extra=${e.extraLen}/${e.localExtraLen}`, `comment=${e.commentLen}`,
          `attr=${e.internalAttr}/${e.externalAttr}`, `time=${time}`, text ? 'content=' + new TextDecoder('utf-8', { ignoreBOM: true }).decode(e.content) : `crc=${e.crc}|sha=${hashBytes(e.content)}`,
        ].join('|'),
      ),
    );
  }
  return lines;
}

function originalTimes(path: string | null): Map<string, [number, number]> | null {
  if (!path) return null;
  return new Map(readZip(new Uint8Array(readFileSync(path))).entries.map((e) => [e.name, [e.time, e.date]]));
}

// ---------------------------------------------------------------- tests

describe.skipIf(!has)('AmlObjects parity with Aml.Engine', () => {
  const dumpDir = process.env.AMLOBJECTS_DUMP ? outDir + '-js' : null;
  const dump = (name: string, value: unknown) => {
    if (!dumpDir) return;
    mkdirSync(dumpDir, { recursive: true });
    writeFileSync(join(dumpDir, name.replace(/[:/\\]/g, '_') + '.json'), JSON.stringify(value, null, 1));
  };
  const expectLines = (actual: string[], expected: string[], name = '') => {
    if (name) dump(name, { actual, expected });
    // Show the first differing line with its neighbours.
    for (let i = 0; i < Math.max(actual.length, expected.length); i++) {
      if (actual[i] !== expected[i]) {
        expect(actual.slice(i, i + 3)).toEqual(expected.slice(i, i + 3));
      }
    }
  };

  describe('read sweep of the corpus', () => {
    const expected = has ? (JSON.parse(readFileSync(join(outDir, 'corpus.json'), 'utf8')) as Record<string, string[]>) : {};
    for (const key of Object.keys(expected)) {
      it(key, () => {
        const r = new Rec();
        try {
          const path = key.startsWith('docs:') ? join(inputDir, 'docs', key.substring(5)) : join(corpusDir, key.substring(7));
          corpusSweep(r, CAEXDocument.loadFromString(readAllText(path)));
        } catch (e) {
          r.lines.push('load:' + ex(e));
        }
        expectLines(r.lines, expected[key]!, 'corpus-' + key);
      });
    }
  });

  describe('operation scripts', () => {
    const scripts = JSON.parse(readFileSync(join(inputDir, 'ops.json'), 'utf8')) as Array<{ start: string; ops: any[] }>;
    const expected = has ? (JSON.parse(readFileSync(join(outDir, 'ops.json'), 'utf8')) as Array<{ steps: Array<[string, string]>; final: string }>) : [];
    scripts.forEach((script, i) => {
      it(`script ${i} (${script.start})`, () => {
        const canon = new Canon();
        const doc = start(script.start);
        let text = '';
        for (let j = 0; j < script.ops.length; j++) {
          const op = script.ops[j];
          let result: string;
          try {
            result = apply(doc, op);
          } catch (e) {
            result = ex(e);
          }
          try {
            text = canon.apply(saveString(doc));
          } catch (e) {
            text = ex(e);
          }
          const [expResult, expHash] = expected[i]!.steps[j]!;
          const actual = { step: j, op, result: canon.apply(result), hash: hash(text) };
          if (dumpDir && (actual.result !== expResult || actual.hash !== expHash)) dump('ops-' + i, { step: j, op, actual: actual.result, expected: expResult, hashOk: actual.hash === expHash, text });
          if (actual.result !== expResult || actual.hash !== expHash) {
            expect(actual).toEqual({ step: j, op, result: expResult, hash: expHash });
          }
        }
        expect(text).toBe(expected[i]!.final);
      });
    });
  });

  describe('fixed cases', () => {
    const expected = has ? (JSON.parse(readFileSync(join(outDir, 'cases.json'), 'utf8')) as Record<string, string[]>) : {};
    for (const [name, action] of cases()) {
      it(name, () => {
        const r = new Rec();
        try {
          action(r);
        } catch (e) {
          r.lines.push('abort:' + ex(e));
        }
        expectLines(r.lines, expected[name]!, 'case-' + name);
      });
    }
  });

  it('MIME type map', () => {
    const expected = JSON.parse(readFileSync(join(outDir, 'mime.json'), 'utf8')) as string[];
    const r = new Rec();
    mimeCases(r);
    expectLines(r.lines, expected, 'mime');
  });

  describe('AMLX containers', () => {
    const expected = has ? (JSON.parse(readFileSync(join(outDir, 'amlx.json'), 'utf8')) as Record<string, string[]>) : {};
    rmSync(workDir, { recursive: true, force: true });
    mkdirSync(workDir, { recursive: true });
    for (const [name, action] of amlxCases()) {
      it(name, () => {
        const r = new Rec();
        try {
          action(r);
        } catch (e) {
          r.lines.push('abort:' + ex(e));
        }
        expectLines(r.lines, expected[name]!, 'amlx-' + name);
      });
    }

    const packages = has ? readdirSync(join(outDir, 'amlx')).filter((f) => f.endsWith('.amlx')) : [];
    for (const f of packages) {
      const key = f.substring(0, f.length - 5);
      it(`package structure ${key}`, () => {
        const oracleBytes = new Uint8Array(readFileSync(join(outDir, 'amlx', f)));
        expect(out[key], 'the JS run wrote no package ' + key).toBeDefined();
        const m = /^existing-(.*)-(unchanged|updated|stream)$/.exec(key);
        const source = m ? join(inputDir, 'amlx', m[1] + '.amlx') : null;
        const expectedZip = zipStructure(oracleBytes, originalTimes(source), new Canon());
        const actualZip = zipStructure(out[key]!, originalTimes(source), new Canon());
        expect(actualZip).toEqual(expectedZip);
      });
      it(`package read by the port ${key}`, () => {
        // The package written by System.IO.Packaging, read through the JS container, must give the
        // same description as the JS package read through the JS container.
        const oracleBytes = new Uint8Array(readFileSync(join(outDir, 'amlx', f)));
        const describeBytes = (bytes: Uint8Array) => {
          const r = new Rec();
          try {
            describeC(r, '', new AutomationMLContainer(new MemoryStream(bytes)), bytes.length < 100_000);
          } catch (e) {
            r.lines.push('abort:' + ex(e));
          }
          return r.lines;
        };
        expect(describeBytes(oracleBytes)).toEqual(describeBytes(out[key]!));
      });
    }
  });
});

void XName;
