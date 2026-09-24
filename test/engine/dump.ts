// JS counterpart of oracle/Dump.cs: walks a document through the typed API and records what the
// engine computes on read. Keep both files in sync.

/* eslint-disable @typescript-eslint/no-explicit-any */
import { T } from '../../src/engine/registry.js';
import { CAEXDocumentExtensions } from '../../src/engine/caex/extensions/CAEXDocumentExtensions.js';
import { dotNetExceptionName } from '../../src/system/exceptions.js';

type Json = null | boolean | string | Json[] | { [k: string]: Json };

export function dumpDocument(doc: any): Json {
  const file = doc.caexFile;
  const root: Record<string, Json> = {
    schema: doc.schemaVersionString,
    fileName: tryJson(() => file.fileName),
    schemaVersion: tryJson(() => file.schemaVersion),
  };
  root.externalReferences = [...file.externalReference].map((er: any) => ({
    alias: tryJson(() => er.alias),
    path: tryJson(() => er.path),
  }));
  root.sourceDocumentInformation = [...file.sourceDocumentInformation].map((s: any) => ({
    originName: tryJson(() => s.originName),
    originID: tryJson(() => s.originID),
    originVersion: tryJson(() => s.originVersion),
    lastWritingDateTime: tryJson(() => s.node.attribute('LastWritingDateTime')?.value ?? null),
  }));
  const objs: Json[] = [];
  for (const ih of file.instanceHierarchy) walk(doc, ih, objs);
  for (const lib of file.interfaceClassLib) walk(doc, lib, objs);
  for (const lib of file.roleClassLib) walk(doc, lib, objs);
  for (const lib of file.systemUnitClassLib) walk(doc, lib, objs);
  for (const lib of file.attributeTypeLib) walk(doc, lib, objs);
  root.objects = objs;
  return root;
}

function walk(doc: any, w: any, objs: Json[]): void {
  const o: Record<string, Json> = { tag: w.node.name.localName };
  if (w instanceof T.CAEXObject) {
    o.name = tryJson(() => w.name);
    o.id = tryJson(() => w.id);
    o.path = tryJson(() => w.caexPath());
    o.findByPath = tryJson(() => id(CAEXDocumentExtensions.findByPath(doc, w.caexPath())));
    if (w.id) o.findByID = tryJson(() => tag(CAEXDocumentExtensions.findByID(doc, w.id)));
  }
  if (w instanceof T.CAEXBasicObject) {
    o.description = tryJson(() => w.description);
    o.version = tryJson(() => w.version);
  }
  objs.push(o);

  if (w instanceof T.InstanceHierarchyType) {
    for (const ie of w.internalElement) walk(doc, ie, objs);
  } else if (w instanceof T.InternalElementType) {
    o.refBaseSystemUnitPath = tryJson(() => w.refBaseSystemUnitPath);
    o.systemUnitClass = tryJson(() => path(w.systemUnitClass));
    o.isMirror = tryJson(() => w.isMirror);
    o.masterID = tryJson(() => w.masterID);
    o.master = tryJson(() => id(w.master));
    systemUnit(doc, w, objs);
    for (const rr of w.roleRequirements) walk(doc, rr, objs);
  } else if (w instanceof T.SystemUnitFamilyType) {
    classRef(o, () => w.refBaseClassPath, () => w.baseClass, () => w.referencedClassName, () => w.getReferenceHierarchy());
    o.attributeAndInherited = tryJson(() => names(w.attributeAndInherited));
    o.externalInterfaceAndInherited = tryJson(() => names(w.externalInterfaceAndInherited));
    o.internalElementAndInherited = tryJson(() => names(w.internalElementAndInherited));
    systemUnit(doc, w, objs);
    for (const sub of w.systemUnitClass) walk(doc, sub, objs);
  } else if (w instanceof T.RoleFamilyType) {
    classRef(o, () => w.refBaseClassPath, () => w.baseClass, () => w.referencedClassName, () => w.getReferenceHierarchy());
    o.attributeAndInherited = tryJson(() => names(w.attributeAndInherited));
    o.externalInterfaceAndInherited = tryJson(() => names(w.externalInterfaceAndInherited));
    for (const a of w.attribute) walk(doc, a, objs);
    for (const ei of w.externalInterface) walk(doc, ei, objs);
    for (const sub of w.roleClass) walk(doc, sub, objs);
  } else if (w instanceof T.InterfaceFamilyType) {
    classRef(o, () => w.refBaseClassPath, () => w.baseClass, () => w.referencedClassName, () => w.getReferenceHierarchy());
    o.attributeAndInherited = tryJson(() => names(w.attributeAndInherited));
    for (const a of w.attribute) walk(doc, a, objs);
    for (const ei of w.externalInterface) walk(doc, ei, objs);
    for (const sub of w.interfaceClass) walk(doc, sub, objs);
  } else if (w instanceof T.AttributeFamilyType) {
    classRef(o, () => w.refBaseClassPath, () => w.baseClass, () => w.referencedClassName, () => w.getReferenceHierarchy());
    attr(w, o);
    for (const a of w.attribute) walk(doc, a, objs);
    for (const sub of w.attributeType) walk(doc, sub, objs);
  } else if (w instanceof T.InterfaceClassLibType) {
    for (const c of w.interfaceClass) walk(doc, c, objs);
  } else if (w instanceof T.RoleClassLibType) {
    for (const c of w.roleClass) walk(doc, c, objs);
  } else if (w instanceof T.SystemUnitClassLibType) {
    for (const c of w.systemUnitClass) walk(doc, c, objs);
  } else if (w instanceof T.AttributeTypeLibType) {
    for (const c of w.attributeType) walk(doc, c, objs);
  } else if (w instanceof T.ExternalInterfaceType) {
    o.refBaseClassPath = tryJson(() => w.refBaseClassPath);
    o.interfaceClass = tryJson(() => path(w.interfaceClass));
    o.isMirror = tryJson(() => w.isMirror);
    o.masterID = tryJson(() => w.masterID);
    o.associatedObject = tryJson(() => id(w.associatedObject instanceof T.CAEXObject ? w.associatedObject : null));
    for (const a of w.attribute) walk(doc, a, objs);
    for (const sub of w.externalInterface) walk(doc, sub, objs);
  } else if (w instanceof T.RoleRequirementsType) {
    o.refBaseRoleClassPath = tryJson(() => w.refBaseRoleClassPath);
    o.roleClass = tryJson(() => path(w.roleClass));
    for (const a of w.attribute) walk(doc, a, objs);
    for (const ei of w.externalInterface) walk(doc, ei, objs);
  } else if (w instanceof T.SupportedRoleClassType) {
    o.refRoleClassPath = tryJson(() => w.refRoleClassPath);
    o.roleClass = tryJson(() => path(w.roleClass));
  } else if (w instanceof T.InternalLinkType) {
    o.refPartnerSideA = tryJson(() => w.refPartnerSideA);
    o.refPartnerSideB = tryJson(() => w.refPartnerSideB);
    o.aInterface = tryJson(() => path(w.aInterface));
    o.bInterface = tryJson(() => path(w.bInterface));
    o.aSystemUnitClass = tryJson(() => id(w.aSystemUnitClass));
    o.bSystemUnitClass = tryJson(() => id(w.bSystemUnitClass));
  } else if (w instanceof T.AttributeType) {
    attr(w, o);
    o.attributePath = tryJson(() => w.attributePath);
    o.isMirror = tryJson(() => w.isMirror);
    o.masterID = tryJson(() => w.masterID);
    o.attributeTypeReference = tryJson(() => path(w.attributeTypeReference));
    for (const sub of w.attribute) walk(doc, sub, objs);
  }
}

function systemUnit(doc: any, s: any, objs: Json[]): void {
  for (const a of s.attribute) walk(doc, a, objs);
  for (const ei of s.externalInterface) walk(doc, ei, objs);
  for (const src of s.supportedRoleClass) walk(doc, src, objs);
  for (const il of s.internalLink) walk(doc, il, objs);
  for (const ie of s.internalElement) walk(doc, ie, objs);
}

function attr(a: any, o: Record<string, Json>): void {
  o.value = tryJson(() => a.value);
  o.defaultValue = tryJson(() => a.defaultValue);
  o.unit = tryJson(() => a.unit);
  o.attributeDataType = tryJson(() => a.attributeDataType);
  o.refAttributeType = tryJson(() => a.refAttributeType);
}

function classRef(o: Record<string, Json>, refPath: () => unknown, baseClass: () => unknown, refName: () => unknown, hierarchy: () => Iterable<any>): void {
  o.refBaseClassPath = tryJson(refPath);
  o.baseClass = tryJson(() => path(baseClass()));
  o.referencedClassName = tryJson(refName);
  o.referenceHierarchy = tryJson(() => [...hierarchy()].map((c) => c.caexPath()));
}

function names(seq: Iterable<any>): Json {
  return [...seq].map((c) => c.name);
}

function path(w: any): string | null {
  return w instanceof T.CAEXObject ? w.caexPath() : null;
}

function id(w: any): string | null {
  if (!(w instanceof T.CAEXObject)) return null;
  const i = (w as any).id;
  return i === null || i === undefined || i === '' ? '@' + (w as any).caexPath() : i;
}

function tag(w: any): string | null {
  return w?.node?.name?.localName ?? null;
}

/** Mirrors Dump.Try in C#: the value (booleans as JSON booleans, other values via String) or "!Exception". */
function tryJson(f: () => unknown): Json {
  try {
    const v = f();
    if (v === null || v === undefined) return null;
    if (typeof v === 'boolean' || typeof v === 'string') return v;
    if (Array.isArray(v)) return v as Json;
    return String(v);
  } catch (e) {
    return '!' + dotNetExceptionName(e);
  }
}
