// Port of Aml.Engine.Services.QueryService (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { implementsInterface, registerInterfaces } from '../interfaces.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { Enumerable, from } from '../../system/linq.js';
import type { XElement } from '../../xml/index.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from '../caex/extensions/CAEXDocumentExtensions.js';
import { CAEXPathBuilder } from '../caex/extensions/CAEXPathBuilder.js';
import { InheritanceExtensions } from '../caex/extensions/InheritanceExtensions.js';
import { AutomationMLInterfaceClassLib } from '../amlobjects/AutomationMLInterfaceClassLib.js';
import { XmlCAEXAttributes } from '../xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { XmlClassOperation } from '../xmlext/XmlClassOperation.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import { EmptyLookup, toLookup, type ILookup } from './EmptyLookup.js';
import type { AttributeType } from '../caex/AttributeType.js';
import type { CAEXBasicObject } from '../caex/CAEXBasicObject.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { CAEXObject } from '../caex/CAEXObject.js';
import type { ExternalInterfaceType } from '../caex/ExternalInterfaceType.js';
import type { IObjectWithAttributes } from '../caex/IObjectWithAttributes.js';
import type { InternalElementType } from '../caex/InternalElementType.js';
import type { InternalLinkType } from '../caex/InternalLinkType.js';
import type { SystemUnitClassType } from '../caex/SystemUnitClassType.js';
import type { ICAEXReference } from './interfaces/ICAEXReference.js';
import type { ClassType, IQuery } from './interfaces/IQuery.js';
import type { ILookUpTable } from './interfaces/ILookUpTable.js';

/** A sequence over a live XLinq axis that can be enumerated more than once, like IEnumerable. */
function seq<X>(factory: () => Iterator<X>): Enumerable<X> {
  return new Enumerable(factory);
}

/** Dictionary.TryGetValue / ContainsKey: a null key throws ArgumentNullException. */
function tryGet<V>(map: Map<CAEXDocument, V>, key: CAEXDocument | null | undefined): V | undefined {
  if (key === null || key === undefined) throw new ArgumentNullException('key');
  return map.get(key);
}

function containsKey<V>(map: Map<CAEXDocument, V>, key: CAEXDocument | null | undefined): boolean {
  if (key === null || key === undefined) throw new ArgumentNullException('key');
  return map.has(key);
}

/** string.StartsWith(value): a null value throws ArgumentNullException (compared ordinally here). */
function startsWith(s: string, value: string | null): boolean {
  if (value === null || value === undefined) throw new ArgumentNullException('value');
  return s.startsWith(value);
}

/** CAEXWrapper operator == (null aware). */
function wrapperEquals(a: unknown, b: unknown): boolean {
  return T.CAEXWrapper.equals(a as never, b as never);
}

/** The default query service, with optional ID and path lookup tables per document. */
export class QueryService implements IQuery, ILookUpTable {
  private _IDLookup: Map<CAEXDocument, ILookup<string, ICAEXReference>> | null = null;

  private _PathLookup: Map<CAEXDocument, ILookup<string, ICAEXReference>> | null = null;

  /**
   * All classes derived from the class with the given path (C# overloads (document, classPath,
   * elementName = "") and (caexObject)).
   */
  allClassReferences(documentOrClass: CAEXDocument | CAEXObject, classPath?: string | null, elementName: string | null = ''): Enumerable<CAEXObject> {
    if (classPath === undefined && documentOrClass instanceof T.CAEXObject) {
      const caexObject = documentOrClass as CAEXObject;
      const refs = this.elementsWithCAEXPathReference(
        CAEXBasicObjectExtensions.caexDocument(caexObject)!.caexFile,
        caexObject.caexPath(),
        caexObject.node!.name.localName,
      );
      return from(refs)
        .where((c) => XmlCAEXSchema.isCAEXClass(c.caexObject!.node!))
        .select((c) => c.caexObject as unknown as CAEXObject);
    }
    const document = documentOrClass as CAEXDocument;
    const refs = this.elementsWithCAEXPathReference(document.caexFile, classPath ?? null, elementName);
    return from(refs)
      .where((c) => XmlCAEXSchema.isCAEXClass(c.caexObject!.node!))
      .select((c) => c.caexObject as unknown as CAEXObject);
  }

  /**
   * All classes derived directly or indirectly (C# overloads (caexObject) and (document,
   * classPath, elementName = "")). Lazy like the C# iterators.
   */
  allClassReferencesDeep(documentOrClass: CAEXDocument | CAEXObject, classPath?: string | null, elementName: string | null = ''): Enumerable<CAEXObject> {
    if (classPath === undefined && documentOrClass instanceof T.CAEXObject) {
      const caexObject = documentOrClass as CAEXObject;
      return seq(() => this.allClassReferencesDeepOfClass(caexObject));
    }
    const document = documentOrClass as CAEXDocument;
    return seq(() => this.allClassReferencesDeepOfPath(document, classPath ?? null, elementName));
  }

  private *allClassReferencesDeepOfClass(caexObject: CAEXObject): Generator<CAEXObject> {
    const enumerable = this.allClassReferences(caexObject);
    for (const caexClass of enumerable) {
      yield caexClass;
      for (const item of this.allClassReferencesDeepOfClass(caexClass)) {
        yield item;
      }
    }
  }

  private *allClassReferencesDeepOfPath(document: CAEXDocument, classPath: string | null, elementName: string | null): Generator<CAEXObject> {
    const enumerable = this.allClassReferences(document, classPath, elementName);
    for (const caexClass of enumerable) {
      yield caexClass;
      for (const item of this.allClassReferencesDeepOfPath(document, caexClass.caexPath(), elementName)) {
        yield item;
      }
    }
  }

  /** All CAEX classes of the document of the object, by CAEX path (from the path table if loaded). */
  allElementsIdentifiedByCAEXPath(caexObject: CAEXBasicObject): ILookup<string, ICAEXReference> {
    const value = this._PathLookup !== null ? tryGet(this._PathLookup, caexObject.caexDocument) : undefined;
    if (value === undefined) {
      return QueryService.allElementsIdentifiedByCAEXPathFromDocument(caexObject);
    }
    return value;
  }

  /** All elements below the object with a path reference using an alias, by alias. */
  allElementsWithAliasReference(caexObject: CAEXBasicObject, elementName: string | null = ''): ILookup<string, ICAEXReference> {
    const list: [string, ICAEXReference][] = [];
    const list2 = [...QueryService.getReferences(caexObject, (d) => XmlCAEXSchema.isElementWithPathReference(d), elementName)];
    if (list2.length === 0) {
      return EmptyLookup.instance;
    }
    for (let num = 0; num < list2.length; num++) {
      const xElement = list2[num];
      const array = XmlCAEXSchema.pathReferenceAttributes(xElement);
      for (const text of array) {
        let text2: string;
        if (text === 'Value') {
          text2 = xElement.value;
        } else {
          if (xElement.attribute(text) === null && !CAEXBasicObjectExtensions.amlSchemaManager(caexObject).isRequiredAttribute(null, xElement.name, text)) {
            continue;
          }
          text2 = xElement.attribute(text)?.value ?? '';
        }
        if (!isNullOrEmpty(text2) && CAEXPathBuilder.isReferenceWithAlias(text2, CAEXBasicObjectExtensions.caexSchema(caexObject))) {
          list.push([CAEXPathBuilder.aliasFromReference(text2, CAEXBasicObjectExtensions.caexSchema(caexObject)), new T.CAEXReference(xElement, text)]);
        }
      }
    }
    return QueryService.toLookup(list);
  }

  /** All elements below (or including, with `includeSelf`) the object with a path reference, by path. */
  allElementsWithCAEXPathReference(caexObject: CAEXBasicObject, elementName: string | null = '', includeSelf = false): ILookup<string, ICAEXReference> {
    const list: [string, ICAEXReference][] = [];
    const list2 = [...QueryService.getReferences(caexObject, (d) => XmlCAEXSchema.isElementWithPathReference(d), elementName, includeSelf)];
    if (list2.length === 0) {
      return EmptyLookup.instance;
    }
    for (let num = 0; num < list2.length; num++) {
      const xElement = list2[num];
      const array = XmlCAEXSchema.pathReferenceAttributes(xElement);
      for (const text of array) {
        let item: string;
        if (text === 'Value') {
          item = xElement.value;
        } else {
          if (xElement.attribute(text) === null && !CAEXBasicObjectExtensions.amlSchemaManager(caexObject).isRequiredAttribute(null, xElement.name, text)) {
            continue;
          }
          item = xElement.attribute(text)?.value ?? '';
        }
        list.push([item, new T.CAEXReference(xElement, text)]);
      }
    }
    return QueryService.toLookup(list);
  }

  /** All elements below the object with an ID reference, by referenced ID. */
  allElementsWithIDReference(caexObject: CAEXBasicObject, elementName: string | null = ''): ILookup<string, ICAEXReference> {
    const list = [...QueryService.getReferences(caexObject, (d) => XmlCAEXSchema.isElementWithIDReference(d), elementName)];
    if (list.length === 0) {
      return EmptyLookup.instance;
    }
    const list2: [string, ICAEXReference][] = [];
    for (let num = 0; num < list.length; num++) {
      const xElement = list[num];
      const array = XmlCAEXSchema.idReferenceAttributes(xElement);
      for (const text of array) {
        if (xElement.attribute(text) !== null || CAEXBasicObjectExtensions.amlSchemaManager(caexObject).isRequiredAttribute(null, xElement.name, text)) {
          list2.push([XmlCAEXSchema.idFromReference(xElement, text), new T.CAEXReference(xElement, text)]);
        }
      }
    }
    return QueryService.toLookup(list2);
  }

  /** All elements with an ID in the document of the object (or below it with an ID filter), by ID. */
  allElementsWithIDs(caexObject: CAEXBasicObject, ID: string | null = ''): ILookup<string, ICAEXReference> {
    const iDLookup = this._IDLookup;
    const value = iDLookup !== null && iDLookup.size > 0 ? tryGet(iDLookup, caexObject.caexDocument) : undefined;
    if (value !== undefined) {
      if (!isNullOrEmpty(ID)) {
        return toLookup(
          value.item(ID),
          () => ID,
          (d) => d,
        );
      }
      return value;
    }
    if (!isNullOrEmpty(ID)) {
      return toLookup(
        from(caexObject.node!.descendants())
          .where((e) => XmlCAEXSchema.isElementWithMandatoryID(e) && XmlCAEXAttributes.caexidOfElement(e) === ID)
          .select((e) => ({ e, id: ID })),
        (pair) => pair.id,
        (pair) => new T.CAEXReference(pair.e, 'ID') as ICAEXReference,
      );
    }
    return QueryService.allElementsWithIDsFromDocument(caexObject);
  }

  /** All elements below the object which contain InternalLinks. */
  allElementsWithInternalLinks(caexObject: CAEXBasicObject): Enumerable<SystemUnitClassType> {
    const node = caexObject.node!;
    const name = caexObject.xName('InternalLink');
    return from<SystemUnitClassType>(
      new T.CAEXEnumerable(
        seq(() => node.descendants(name))
          .select((n) => n.parent!)
          .distinct(),
        T.SystemUnitClassType,
      ),
    );
  }

  /** All elements below the object with a name reference, by referenced name. */
  allElementsWithNameReference(caexObject: CAEXBasicObject, elementName: string | null = ''): ILookup<string, ICAEXReference> {
    const list: [string, ICAEXReference][] = [];
    const list2 = [...QueryService.getReferences(caexObject, (d) => XmlCAEXSchema.isElementWithNameAndIDReference(d), elementName)];
    if (list2.length === 0) {
      return EmptyLookup.instance;
    }
    for (let num = 0; num < list2.length; num++) {
      const xElement = list2[num];
      const array = XmlCAEXSchema.nameReferenceAttributes(xElement);
      for (const text of array) {
        if (xElement.attribute(text) === null && !CAEXBasicObjectExtensions.amlSchemaManager(caexObject).isRequiredAttribute(null, xElement.name, text)) {
          continue;
        }
        const text2 = xElement.attribute(text)?.value ?? '';
        if (XmlCAEXSchema.isInternalLink(xElement)) {
          const item = CAEXPathBuilder.externalInterfaceNameInInternalLinkReference(text2).result;
          list.push([item, new T.CAEXReference(xElement, text)]);
        } else if (XmlCAEXSchema.isAttributeOrType(xElement)) {
          if (CAEXPathBuilder.attributePathInAttributeReference(text2, CAEXBasicObjectExtensions.caexDocument(caexObject)).result.length === 0) {
            list.push([text2, new T.CAEXReference(xElement, text)]);
          }
        } else {
          list.push([text2, new T.CAEXReference(xElement, text)]);
        }
      }
    }
    return QueryService.toLookup(list);
  }

  /** All ExternalInterfaces of the document which are external data connectors. */
  allExternalDataReferences(document: CAEXDocument, caexObject: CAEXBasicObject | null = null): Enumerable<ExternalInterfaceType> {
    const cAEXBasicObject: CAEXBasicObject = (caexObject ?? document.caexFile)!;
    const node = document.caexFile!.node as XElement;
    const name = cAEXBasicObject.xName('ExternalInterface');
    return from<ExternalInterfaceType>(new T.CAEXEnumerable(seq(() => node.descendants(name)))).where((n) =>
      AutomationMLInterfaceClassLib.isExternalDataConnector(n),
    );
  }

  /** All ExternalInterfaces below the object derived from the given interface class. */
  allExternalInterfacesOfType(document: CAEXDocument, interfaceClassPath: string | null, caexObject: CAEXBasicObject | null = null): Enumerable<ExternalInterfaceType> {
    const cAEXBasicObject: CAEXBasicObject = (caexObject ?? document.caexFile)!;
    const node = cAEXBasicObject.node as XElement;
    const name = cAEXBasicObject.xName('ExternalInterface');
    return from<ExternalInterfaceType>(new T.CAEXEnumerable(seq(() => node.descendants(name)))).where((n) =>
      InheritanceExtensions.isDerivedFromInterfaceClass(n, interfaceClassPath),
    );
  }

  /** All InternalElements below the object which contain InternalLinks. */
  allInternalElementsWithInternalLinks(caexObject: CAEXBasicObject): Enumerable<InternalElementType> {
    const node = caexObject.node!;
    const name = caexObject.xName('InternalLink');
    return from<InternalElementType>(
      new T.CAEXEnumerable(
        seq(() => node.descendants(name))
          .select((n) => n.parent)
          .where((p) => (p?.name.localName ?? null) === 'InternalElement')
          .select((p) => p!)
          .distinct(),
      ),
    );
  }

  /** All mirrors of the master attribute. */
  attributeMirrors(master: AttributeType | null): AttributeType[] {
    if (master === null || master === undefined) {
      throw new ArgumentNullException('master');
    }
    const iD = XmlCAEXAttributes.caexidOfElement(from(master.node!.ancestors()).firstOrDefault((a) => a.name.localName !== 'Attribute'));
    const path: string = master.caexPath()!;
    return from(this.elementsWithIDReference(CAEXBasicObjectExtensions.caexDocument(master)!.caexFile, iD))
      .where((mirror) => mirror.caexObject instanceof T.AttributeType)
      .select((mirror) => {
        const attributeReference = mirror.caexObject!.getXAttributeValue(mirror.referenceAttributeName!);
        const refPath = CAEXPathBuilder.attributePathInAttributeReference(attributeReference, CAEXBasicObjectExtensions.caexDocument(master)).result.join('/');
        return { mirror, refPath };
      })
      .where((x) => path.endsWith(x.refPath))
      .select((x) => (x.mirror.caexObject instanceof T.AttributeType ? (x.mirror.caexObject as AttributeType) : null) as AttributeType)
      .toList();
  }

  /** All references below the object using the given alias. */
  elementsWithAliasReference(caexObject: CAEXBasicObject, alias: string, elementName: string | null = ''): ICAEXReference[] {
    const list: ICAEXReference[] = [];
    const list2 = [...QueryService.getReferences(caexObject, (d) => XmlCAEXSchema.isElementWithPathReference(d), elementName)];
    if (list2.length === 0) {
      return [];
    }
    for (let num = 0; num < list2.length; num++) {
      const xElement = list2[num];
      const array = XmlCAEXSchema.pathReferenceAttributes(xElement);
      for (const text of array) {
        let text2: string | null;
        if (text === 'Value') {
          text2 = xElement.value;
        } else {
          if (xElement.attribute(text) === null && !CAEXBasicObjectExtensions.amlSchemaManager(caexObject).isRequiredAttribute(null, xElement.name, text)) {
            continue;
          }
          text2 = xElement.attribute(text)?.value ?? null;
        }
        if (!isNullOrEmpty(text2) && CAEXPathBuilder.isReferenceWithAlias(text2, CAEXBasicObjectExtensions.caexSchema(caexObject)) && startsWith(text2, alias)) {
          list.push(new T.CAEXReference(xElement, text));
        }
      }
    }
    return list;
  }

  /** All references below (and including) the object to the given CAEX path (or to the name of the class, from its children). */
  elementsWithCAEXPathReference(caexObject: CAEXBasicObject | null, caexPath: string | null, elementName: string | null = ''): ICAEXReference[] {
    if (caexObject === null || caexObject === undefined || isNullOrEmpty(caexPath)) {
      return [];
    }
    const baseClass: CAEXObject | null = caexObject.caexDocument == null ? null : this.findByPath(caexObject.caexDocument, caexPath);
    const list: ICAEXReference[] = [];
    const node = caexObject.node!;
    const list2 = QueryService.getReferences(
      caexObject,
      (d) => XmlCAEXSchema.isDirectReferenceToBaseClass(d, baseClass) || XmlCAEXSchema.isElementWithPathReference(d, caexPath),
      elementName,
    )
      .where((r) => XmlClassOperation.isDescendant(r, node))
      .toList();
    if (list2.length === 0) {
      return [];
    }
    for (let num = 0; num < list2.length; num++) {
      const xElement = list2[num];
      const array = XmlCAEXSchema.pathReferenceAttributes(xElement);
      for (const text of array) {
        let text2: string | null;
        if (text === 'Value') {
          text2 = xElement.value;
        } else {
          if (xElement.attribute(text) === null && !CAEXBasicObjectExtensions.amlSchemaManager(caexObject).isRequiredAttribute(null, xElement.name, text)) {
            continue;
          }
          text2 = xElement.attribute(text)?.value ?? null;
        }
        if (text2 === caexPath || text2 === (baseClass?.name ?? null)) {
          list.push(new T.CAEXReference(xElement, text));
        }
      }
    }
    return list;
  }

  /** All references below the object to the given ID (lazy, like the C# iterator). */
  elementsWithIDReference(caexObject: CAEXBasicObject | null, ID: string | null, elementName: string | null = ''): Enumerable<ICAEXReference> {
    return seq(() => QueryService.elementsWithIDReferenceIterator(caexObject, ID, elementName));
  }

  private static *elementsWithIDReferenceIterator(caexObject: CAEXBasicObject | null, ID: string | null, elementName: string | null): Generator<ICAEXReference> {
    if (caexObject === null || caexObject === undefined || isNullOrEmpty(ID)) {
      return;
    }
    const references = [...QueryService.getReferences(caexObject, (d) => XmlCAEXSchema.isElementWithIDReference(d, ID), elementName)];
    if (references.length === 0) {
      return;
    }
    for (let index = 0; index < references.length; index++) {
      const element = references[index];
      if (XmlCAEXSchema.isInternalLink(element)) {
        for (const item3 of from(XmlCAEXAttributes.idReferencesInInternalLink(element)).where((r) => r.value === ID)) {
          const item = item3.name;
          yield new T.CAEXReference(element, item);
        }
      } else if (XmlCAEXSchema.isInterfaceIDMapping(element)) {
        for (const item4 of from(XmlCAEXAttributes.idReferenceInMapping(element)).where((r) => r.value === ID)) {
          const item2 = item4.name;
          yield new T.CAEXReference(element, item2);
        }
      } else {
        yield new T.CAEXReference(element, XmlCAEXSchema.idReferenceAttributes(element)[0]);
      }
    }
  }

  /** The classes connected by the InternalLinks below the object. */
  elementsWithInternalLinkRelations(caexObject: CAEXBasicObject): Enumerable<SystemUnitClassType> {
    const node = caexObject.node as XElement;
    const name = XmlCAEXSchema.xName(node, 'InternalLink');
    return from<InternalLinkType>(new T.CAEXEnumerable(seq(() => node.descendants(name)))).selectMany((l) =>
      seq(() => QueryService.linkedClasses(l)).distinct(),
    );
  }

  /** All mirrors of the master ExternalInterface. */
  externalInterfaceMirrors(master: ExternalInterfaceType | null): Iterable<ExternalInterfaceType> {
    if (!wrapperEquals(master, null)) {
      if (!isNullOrEmpty(master!.id)) {
        const doc = master!.document!;
        const name = XmlCAEXSchema.xName(master!.node, 'ExternalInterface');
        const id = master!.id;
        return from<ExternalInterfaceType>(
          new T.CAEXEnumerable(seq(() => doc.descendants(name)).where((i) => (i.attribute('RefBaseClassPath')?.value ?? null) === id)),
        );
      }
      return [];
    }
    throw new ArgumentNullException('master');
  }

  /** Finds the object with the given ID, also in documents referenced by an alias. */
  findByID(caexDocument: CAEXDocument | null, id: string | null, resolveAlias = true, elementType: ClassType | null = null): CAEXObject | null {
    if (caexDocument === null || caexDocument === undefined) {
      throw new ArgumentNullException('caexDocument');
    }
    if (isNullOrEmpty(id)) {
      return null;
    }
    const text = CAEXPathBuilder.aliasFromReference(id, caexDocument.schema);
    if (isNullOrEmpty(text)) {
      const iDLookup = this._IDLookup;
      const value = iDLookup !== null && iDLookup.size > 0 ? tryGet(iDLookup, caexDocument) : undefined;
      if (value === undefined) {
        const found = from(caexDocument.xDocument!.descendants()).firstOrDefault((x) => id === (x.attribute('ID')?.value ?? null));
        const w = found !== null ? XmlOperation.createCAEXWrapper(found) : null;
        return w instanceof T.CAEXObject ? (w as CAEXObject) : null;
      }
      const o = value.item(id).firstOrDefault()?.caexObject ?? null;
      return o instanceof T.CAEXObject ? (o as unknown as CAEXObject) : null;
    }
    const externalReferenceType = CAEXDocumentExtensions.externalReferenceFromAlias(caexDocument, text);
    if (wrapperEquals(externalReferenceType, null) || externalReferenceType!.externalDocument == null) {
      return null;
    }
    const iDLookup2 = this._IDLookup;
    const value2 = iDLookup2 !== null && iDLookup2.size > 0 ? tryGet(iDLookup2, externalReferenceType!.externalDocument) : undefined;
    if (value2 === undefined) {
      return this.findByID(externalReferenceType!.externalDocument, CAEXPathBuilder.removeAlias(id), false, elementType);
    }
    const o2 = value2.item(CAEXPathBuilder.removeAlias(id) as string).firstOrDefault()?.caexObject ?? null;
    return o2 instanceof T.CAEXObject ? (o2 as unknown as CAEXObject) : null;
  }

  /** Finds the object with the given CAEX path, also in documents referenced by an alias. */
  findByPath(caexDocument: CAEXDocument | null, path: string | null, _resolveAlias = true, classType: ClassType | null = null): CAEXObject | null {
    while (true) {
      if (isNullOrEmpty(path)) {
        return null;
      }
      if (caexDocument === null || caexDocument === undefined) {
        throw new ArgumentNullException('caexDocument');
      }
      const text = CAEXPathBuilder.aliasFromReference(path, caexDocument.schema);
      if (isNullOrEmpty(text)) {
        break;
      }
      const externalReferenceType = CAEXDocumentExtensions.externalReferenceFromAlias(caexDocument, text);
      if (wrapperEquals(externalReferenceType, null) || externalReferenceType!.externalDocument == null) {
        return null;
      }
      const value = this._PathLookup !== null ? tryGet(this._PathLookup, externalReferenceType!.externalDocument) : undefined;
      if (value !== undefined) {
        const o = value.item(CAEXPathBuilder.removeAlias(path) as string).firstOrDefault()?.caexObject ?? null;
        return o instanceof T.CAEXObject ? (o as unknown as CAEXObject) : null;
      }
      caexDocument = externalReferenceType!.externalDocument;
      path = CAEXPathBuilder.removeAlias(path);
    }
    const doc = caexDocument!;
    const p: string = path!;
    if (QueryService.isAssignableFromAttributeType(classType) && CAEXPathBuilder.isAttributeReference(doc, p)) {
      const owner = this.findByID(doc, CAEXPathBuilder.instanceIDInAttributeReference(p, doc).result);
      if (!(owner !== null && implementsInterface(owner, 'IObjectWithAttributes'))) {
        return null;
      }
      const objectWithAttributes = owner as unknown as IObjectWithAttributes;
      return objectWithAttributes.attribute.item(CAEXPathBuilder.attributePathInAttributeReference(p, doc).result);
    }
    const value2 = this._PathLookup !== null ? tryGet(this._PathLookup, doc) : undefined;
    if (value2 !== undefined) {
      const o = value2.item(p).firstOrDefault()?.caexObject ?? null;
      return o instanceof T.CAEXObject ? (o as unknown as CAEXObject) : null;
    }
    const array: string[] = CAEXPathBuilder.pathNameArrayWithSeparator(p, doc.schema, true);
    let xElement: XElement | null = doc.caexFile!.node;
    for (const parthPart of array) {
      xElement = from(xElement!.elements()).firstOrDefault((el) => (el.attribute('Name')?.value ?? null) === parthPart);
      if (xElement === null) {
        return null;
      }
    }
    const w = XmlOperation.createCAEXWrapper(xElement);
    return w instanceof T.CAEXObject ? (w as CAEXObject) : null;
  }

  /** `classType == null || classType.IsAssignableFrom(typeof(AttributeType))`. */
  private static isAssignableFromAttributeType(classType: ClassType | null): boolean {
    if (classType === null || classType === undefined) return true;
    const attributeType = T.AttributeType as unknown as ClassType;
    return classType === attributeType || attributeType.prototype instanceof classType;
  }

  /** Checks whether the ID table of the document is loaded. */
  idTableIsLoaded(document: CAEXDocument): boolean {
    const iDLookup = this._IDLookup;
    if (iDLookup !== null && iDLookup.size > 0) {
      return containsKey(iDLookup, document);
    }
    return false;
  }

  /** The ExternalInterfaces connected by the InternalLinks below the object. */
  interfacesWithInternalLinkRelations(caexObject: CAEXBasicObject): Enumerable<ExternalInterfaceType> {
    const node = caexObject.node as XElement;
    const name = XmlCAEXSchema.xName(node, 'InternalLink');
    return from<InternalLinkType>(new T.CAEXEnumerable(seq(() => node.descendants(name)))).selectMany((l) =>
      seq(() => QueryService.linkedInterfaces(l)).distinct(),
    );
  }

  /** All mirrors of the master InternalElement. */
  internalElementMirrors(master: InternalElementType | null): Iterable<InternalElementType> {
    if (!wrapperEquals(master, null)) {
      if (!isNullOrEmpty(master!.id)) {
        const doc = master!.document!;
        const name = XmlCAEXSchema.xName(master!.node, 'InternalElement');
        const id = master!.id;
        return from<InternalElementType>(
          new T.CAEXEnumerable(seq(() => doc.descendants(name)).where((i) => (i.attribute('RefBaseSystemUnitPath')?.value ?? null) === id)),
        );
      }
      return [];
    }
    throw new ArgumentNullException('master');
  }

  /** All InternalLinks connected to the system unit class. */
  internalLinksToElement(systemUnitClass: SystemUnitClassType | null): InternalLinkType[] {
    if (wrapperEquals(systemUnitClass, null)) {
      throw new ArgumentNullException('systemUnitClass');
    }
    const suc = systemUnitClass!;
    const isInternalLinkConnectedToSystemUnitClass = (link: InternalLinkType): boolean => {
      if (wrapperEquals(link.aSystemUnitClass, null) || !link.aSystemUnitClass!.equals(suc)) {
        if (!wrapperEquals(link.bSystemUnitClass, null)) {
          return link.bSystemUnitClass!.equals(suc);
        }
        return false;
      }
      return true;
    };
    const list: XElement[] = from(suc.node!.ancestorsAndSelf())
      .selectMany((e) => seq(() => e.elements(suc.xName('InternalLink'))))
      .toList();
    const parent = suc.node!.parent;
    if (parent === null) {
      return from(list)
        .where((il) => il !== null)
        .select((il) => new T.InternalLinkType(il) as InternalLinkType)
        .where(isInternalLinkConnectedToSystemUnitClass)
        .distinct()
        .toList();
    }
    for (const item of parent.elements(suc.xName('InternalElement'))) {
      if (item !== suc.node) {
        list.push(...from(item.ancestorsAndSelf()).selectMany((e) => seq(() => e.elements(suc.xName('InternalLink')))));
      }
    }
    return from(list)
      .where((il) => il !== null)
      .select((il) => new T.InternalLinkType(il) as InternalLinkType)
      .where(isInternalLinkConnectedToSystemUnitClass)
      .distinct()
      .toList();
  }

  /** All InternalLinks connected to the ExternalInterface. */
  internalLinksToInterface(externalInterface: ExternalInterfaceType | null): InternalLinkType[] {
    if (wrapperEquals(externalInterface, null)) {
      throw new ArgumentNullException('externalInterface');
    }
    const ei = externalInterface!;
    const isInternalLinkConnectedToExternalInterface = (link: InternalLinkType): boolean => {
      if (wrapperEquals(link.aInterface, null) || !link.aInterface!.equals(ei)) {
        if (!wrapperEquals(link.bInterface, null)) {
          return link.bInterface!.equals(ei);
        }
        return false;
      }
      return true;
    };
    let enumerable: Enumerable<InternalLinkType> = seq(() => ei.node!.ancestors())
      .selectMany((e) => seq(() => e.elements(ei.xName('InternalLink'))))
      .where((il) => il !== null)
      .select((il) => new T.InternalLinkType(il) as InternalLinkType)
      .where(isInternalLinkConnectedToExternalInterface);
    const associated = ei.associatedObject;
    if (!(associated instanceof T.SystemUnitClassType)) {
      return enumerable.distinct().toList();
    }
    const second = from(this.internalLinksToElement(associated as SystemUnitClassType)).where(isInternalLinkConnectedToExternalInterface);
    enumerable = enumerable.concat(second);
    return enumerable.distinct().toList();
  }

  /**
   * Checks whether the object is referenced by a mirror (C# overloads for InternalElementType,
   * ExternalInterfaceType and AttributeType).
   */
  isMaster(element: InternalElementType | ExternalInterfaceType | AttributeType): boolean {
    if (element instanceof T.AttributeType) {
      return this.isMasterAttribute(element as AttributeType);
    }
    if (element instanceof T.ExternalInterfaceType) {
      const ei = element as ExternalInterfaceType;
      return from(this.elementsWithIDReference(CAEXBasicObjectExtensions.caexDocument(ei)!.caexFile, ei.id)).any(
        (e) => e.caexObject instanceof T.ExternalInterfaceType,
      );
    }
    const ie = element as InternalElementType;
    return from(this.elementsWithIDReference(CAEXBasicObjectExtensions.caexDocument(ie)!.caexFile, ie.id)).any(
      (e) => e.caexObject instanceof T.InternalElementType,
    );
  }

  private isMasterAttribute(attribute: AttributeType): boolean {
    const iD = XmlCAEXAttributes.caexidOfElement(from(attribute.node!.ancestors()).firstOrDefault((a) => a.name.localName !== 'Attribute'));
    const text: string = attribute.caexPath()!;
    return from(this.elementsWithIDReference(CAEXBasicObjectExtensions.caexDocument(attribute)!.caexFile, iD))
      .where((mirror) => mirror.caexObject instanceof T.AttributeType)
      .select((mirror) => mirror.caexObject!.getXAttributeValue(mirror.referenceAttributeName!))
      .select((attributeReference) =>
        CAEXPathBuilder.attributePathInAttributeReference(attributeReference, CAEXBasicObjectExtensions.caexDocument(attribute)).result.join('/'),
      )
      .any((s) => text.endsWith(s));
  }

  /** Checks whether the class is referenced by a derived class or an instance. */
  isReferenced(caexObject: CAEXObject): boolean {
    const node = caexObject.node as XElement;
    if (
      !from(node.elements(node.name)).any(
        (e) => (e.attribute(XmlCAEXSchema.pathReferenceAttributeName(e))?.value ?? null) === caexObject.caexPath(),
      )
    ) {
      return from(this.elementsWithCAEXPathReference(CAEXBasicObjectExtensions.caexDocument(caexObject)!.caexFile, caexObject.caexPath())).any();
    }
    return true;
  }

  /** Loads the ID table of the document (used by FindByID and AllElementsWithIDs). */
  loadIDTable(document: CAEXDocument): void {
    if (this._IDLookup === null) {
      this._IDLookup = new Map();
    }
    this._IDLookup.set(document, QueryService.allElementsWithIDsFromDocument(document.caexFile!));
  }

  /** Loads the path table of the document (used by FindByPath and AllElementsIdentifiedByCAEXPath). */
  loadPathTable(document: CAEXDocument): void {
    if (this._PathLookup === null) {
      this._PathLookup = new Map();
    }
    this._PathLookup.set(document, QueryService.allElementsIdentifiedByCAEXPathFromDocument(document.caexFile!));
  }

  /** Checks whether the path table of the document is loaded. */
  pathTableIsLoaded(document: CAEXDocument): boolean {
    if (this._PathLookup !== null) {
      return containsKey(this._PathLookup, document);
    }
    return false;
  }

  /** Unloads the ID table of the document. */
  unloadIDTable(document: CAEXDocument): void {
    if (this.idTableIsLoaded(document)) {
      this._IDLookup!.delete(document);
    }
  }

  /** Unloads the path table of the document. */
  unloadPathTable(document: CAEXDocument): void {
    if (this.pathTableIsLoaded(document)) {
      this._PathLookup!.delete(document);
    }
  }

  private static getReferences(
    caexObject: CAEXBasicObject | null,
    predicate: (e: XElement) => boolean,
    elementName: string | null,
    includeSelf = false,
  ): Enumerable<XElement> {
    const xElement: XElement | null = caexObject?.node ?? null;
    if (xElement !== null) {
      if (!includeSelf) {
        if (!isNullOrEmpty(elementName)) {
          const name = caexObject!.xName(elementName);
          return seq(() => xElement.descendants(name)).where((e) => predicate(e));
        }
        return seq(() => xElement.descendants()).where((e) => predicate(e));
      }
      if (!isNullOrEmpty(elementName)) {
        const name = caexObject!.xName(elementName);
        return seq(() => xElement.descendantsAndSelf(name)).where((e) => predicate(e));
      }
      return seq(() => xElement.descendantsAndSelf()).where((e) => predicate(e));
    }
    return Enumerable.empty<XElement>();
  }

  private static *linkedClasses(il: InternalLinkType): Generator<SystemUnitClassType> {
    if (!wrapperEquals(il.aSystemUnitClass, null)) {
      yield il.aSystemUnitClass!;
    }
    if (!wrapperEquals(il.bSystemUnitClass, null)) {
      yield il.bSystemUnitClass!;
    }
  }

  private static *linkedInterfaces(il: InternalLinkType): Generator<ExternalInterfaceType> {
    if (!wrapperEquals(il.aInterface, null)) {
      yield il.aInterface!;
    }
    if (!wrapperEquals(il.bInterface, null)) {
      yield il.bInterface!;
    }
  }

  private static toLookup(resultList: Iterable<[string, ICAEXReference]>): ILookup<string, ICAEXReference> {
    return toLookup(
      resultList,
      (pair) => pair[0],
      (pair) => pair[1],
    );
  }

  private static allElementsIdentifiedByCAEXPathFromDocument(caexObject: CAEXBasicObject): ILookup<string, ICAEXReference> {
    return toLookup(
      from(caexObject.node!.descendants())
        .where((e) => XmlCAEXSchema.isCAEXClass(e))
        .select((e) => ({ e, id: XmlCAEXAttributes.caexPath(e) })),
      (pair) => pair.id,
      (pair) => new T.CAEXReference(pair.e, 'Name') as ICAEXReference,
    );
  }

  private static allElementsWithIDsFromDocument(caexObject: CAEXBasicObject): ILookup<string, ICAEXReference> {
    return toLookup(
      from(caexObject.node!.descendants())
        .where((e) => XmlCAEXSchema.isElementWithMandatoryID(e))
        .select((e) => ({ e, id: XmlCAEXAttributes.caexidOfElement(e) })),
      (pair) => pair.id,
      (pair) => new T.CAEXReference(pair.e, 'ID') as ICAEXReference,
    );
  }
}

T.QueryService = QueryService;
registerInterfaces(QueryService, 'IQuery', 'IAMLService', 'ILookUpTable');
