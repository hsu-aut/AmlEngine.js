// Port of Aml.Engine.Services.LookupService (Aml.Engine.Services 4.3.1).
//
// Registered with LookupService.register(), the service replaces the default QueryService of the
// engine (ServiceLocator 'IQuery') and is the auto update service ('IAutoUpdate'): it builds lookup
// tables per document on first use and keeps them up to date through the static change events of
// CaexCommand (CAEXElementChangedEvent and CAEXElementChangingEvent).

import '../engine/index.js';
import { implementsInterface, registerInterfaces } from '../engine/interfaces.js';
import { RecursionGuard } from '../engine/cycles.js';
import { AttributeFamilyType } from '../engine/caex/AttributeFamilyType.js';
import { AttributeType } from '../engine/caex/AttributeType.js';
import { CAEXObject } from '../engine/caex/CAEXObject.js';
import { CAEXWrapper } from '../engine/caex/CAEXWrapper.js';
import { ExternalInterfaceType } from '../engine/caex/ExternalInterfaceType.js';
import { InterfaceFamilyType } from '../engine/caex/InterfaceFamilyType.js';
import { InternalElementType } from '../engine/caex/InternalElementType.js';
import { RoleFamilyType } from '../engine/caex/RoleFamilyType.js';
import { SystemUnitFamilyType } from '../engine/caex/SystemUnitFamilyType.js';
import { CAEXElementChangeMode } from '../engine/caex/commands/CAEXElementChangeMode.js';
import { CaexCommand } from '../engine/caex/commands/CaexCommand.js';
import { WeakEventSource } from '../engine/caex/commands/WeakEventSource.js';
import { CAEXBasicObjectExtensions } from '../engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from '../engine/caex/extensions/CAEXDocumentExtensions.js';
import { CAEXPathBuilder } from '../engine/caex/extensions/CAEXPathBuilder.js';
import { EmptyLookup, toLookup, type ILookup } from '../engine/services/EmptyLookup.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { UpdateEventArgs } from '../engine/services/interfaces/UpdateEventArgs.js';
import { XmlCAEXSchema } from '../engine/xmlext/XmlCAEXSchema.js';
import { XmlOperation } from '../engine/xmlext/XmlOperation.js';
import { ArgumentNullException, InvalidOperationException } from '../system/exceptions.js';
import { EventSource, type EventHandler } from '../system/events.js';
import { Enumerable, from } from '../system/linq.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../system/strings.js';
import type { XElement } from '../xml/index.js';
import type { CAEXBasicObject } from '../engine/caex/CAEXBasicObject.js';
import type { CAEXDocument } from '../engine/caex/CAEXDocument.js';
import type { InternalLinkType } from '../engine/caex/InternalLinkType.js';
import type { IClassWithBaseClassReference } from '../engine/caex/IClassWithBaseClassReference.js';
import type { SystemUnitClassType } from '../engine/caex/SystemUnitClassType.js';
import type { CAEXElementChangeEventArgs } from '../engine/caex/commands/CAEXElementChangeEventArgs.js';
import type { CAEXReference } from '../engine/services/CAEXReference.js';
import type { IAMLService } from '../engine/services/interfaces/IAMLService.js';
import type { IAutoUpdate } from '../engine/services/interfaces/IAutoUpdate.js';
import type { ICAEXReference } from '../engine/services/interfaces/ICAEXReference.js';
import type { ClassType, IQuery } from '../engine/services/interfaces/IQuery.js';
import type { IXMLDocumentRegistry } from '../engine/services/interfaces/IXMLDocumentRegistry.js';
import type { XDocumentWrapper } from '../engine/xml/XDocumentWrapper.js';
import { CAEXNode_Identifier } from './lookup/CAEXNode.js';
import { CAEXNodeReference } from './lookup/CAEXNodeReference.js';
import { LookupTables } from './lookup/LookupTables.js';
import { DocumentReferenceDictionary } from './generique/DocumentReferenceDictionary.js';

/**
 * The C# event ReferenceUpdated has the accessors add and remove, which subscribe to and
 * unsubscribe from the WeakEventSource of the service. This EventSource passes them on.
 */
class ReferenceUpdatedEvent extends EventSource<UpdateEventArgs> {
  constructor(private readonly source: WeakEventSource<UpdateEventArgs>) {
    super();
  }

  override subscribe(handler: EventHandler<UpdateEventArgs> | null | undefined): void {
    this.source.subscribe(handler!);
  }

  override unsubscribe(handler: EventHandler<UpdateEventArgs> | null | undefined): void {
    this.source.unsubscribe(handler!);
  }

  override raise(sender: unknown, args: UpdateEventArgs): void {
    this.source.raise(sender, args);
  }
}

/** Cyclic class references: AllClassReferencesDeep(CAEXObject) calls itself for the same class. */
const classReferencesGuard = new RecursionGuard('The base class references');

/** C# `Enum.HasFlag`. */
function hasFlag(value: CAEXElementChangeMode, flag: CAEXElementChangeMode): boolean {
  return (value & flag) === flag;
}

/** Query and auto update service using lookup tables per document. */
export class LookupService implements IQuery, IAMLService, IAutoUpdate, IXMLDocumentRegistry {
  private readonly _caexElementDictionary: DocumentReferenceDictionary<LookupTables | null>;

  private readonly _changeModeValues: readonly number[];

  private _paused = false;

  private readonly _myEventSource = new WeakEventSource<UpdateEventArgs>();

  /** The service created last (internal static in C#). */
  static lookUpService: LookupService | null = null;

  private readonly _documentsLoading: CAEXDocument[] = [];

  isAutoUpdateEnabled = false;

  private readonly _referenceUpdated = new ReferenceUpdatedEvent(this._myEventSource);

  /** Occurs when any reference has been updated. */
  get referenceUpdated(): EventSource<UpdateEventArgs> {
    return this._referenceUpdated;
  }

  private constructor() {
    this._caexElementDictionary = new DocumentReferenceDictionary<LookupTables | null>();
    CaexCommand.caexElementChangedEvent.subscribe(this.caexElementChangedHandler);
    CaexCommand.caexElementChangingEvent.subscribe(this.caexElementChangingHandler);
    // Enum.GetValues: the values in the order of their unsigned magnitude.
    this._changeModeValues = Object.values(CAEXElementChangeMode)
      .filter((v): v is number => typeof v === 'number')
      .sort((a, b) => a - b);
    this._caexElementDictionary.createNew = (document) => this.createTablesForDocument(document);
    LookupService.lookUpService = this;
  }

  /** Subscribes to the change events again (after Suspend). */
  resume(): void {
    this.suspend();
    CaexCommand.caexElementChangedEvent.subscribe(this.caexElementChangedHandler);
    CaexCommand.caexElementChangingEvent.subscribe(this.caexElementChangingHandler);
  }

  /** Unsubscribes from the change events. */
  suspend(): void {
    CaexCommand.caexElementChangedEvent.unsubscribe(this.caexElementChangedHandler);
    CaexCommand.caexElementChangingEvent.unsubscribe(this.caexElementChangingHandler);
  }

  private createTablesForDocument(document: CAEXDocument): LookupTables {
    let lookupTables: LookupTables | null = null;
    try {
      this.suspend();
      ServiceLocator.unRegister('IQuery');
      ServiceLocator.unRegister('IAutoUpdate');
      if (this._documentsLoading.includes(document)) {
        throw new InvalidOperationException('LookupService Document Registration');
      }
      this._documentsLoading.push(document);
      lookupTables = new LookupTables(this, document);
      lookupTables?.addElementAndDescandants(document.caexFile!);
      const i = this._documentsLoading.indexOf(document);
      if (i >= 0) this._documentsLoading.splice(i, 1);
      return lookupTables;
    } finally {
      ServiceLocator.register(this, 'IQuery');
      ServiceLocator.register(this, 'IAutoUpdate');
      this.resume();
    }
  }

  /** Registers a new instance of a LookupService with the ServiceLocator of the engine. */
  static register(): LookupService {
    const lookupService = new LookupService();
    ServiceLocator.register(lookupService, 'IQuery');
    ServiceLocator.register(lookupService, 'IAutoUpdate');
    return lookupService;
  }

  /** Unregisters this service. */
  static unRegister(): void {
    LookupService.lookUpService?.dispose();
    const service = ServiceLocator.getService('IAutoUpdate');
    if (service instanceof LookupService) {
      const lookupService = service;
      ServiceLocator.unRegister('IQuery');
      ServiceLocator.unRegister('IAutoUpdate');
      lookupService.dispose();
    }
  }

  /** Adds the document to the query service. All tables for the document will be created. */
  addDocument(doc: CAEXDocument | null): void {
    if (doc === null || doc === undefined) {
      throw new ArgumentNullException('doc');
    }
    this._caexElementDictionary.getOrLoadValue(doc.xDocument, true);
  }

  /**
   * C# overloads AllClassReferences(CAEXDocument document, string classPath, string elementName
   * = ""), the classes with a reference to the class path, and AllClassReferences(CAEXObject),
   * all classes which use the provided CAEX object as a base class.
   */
  allClassReferences(documentOrClass: CAEXDocument | CAEXObject | null, classPath?: string | null, elementName: string | null = ''): Enumerable<CAEXObject> {
    if (classPath === undefined && documentOrClass instanceof CAEXObject) {
      const caexObject = documentOrClass;
      if (!implementsInterface(caexObject, 'IClassWithBaseClassReference')) {
        return Enumerable.empty<CAEXObject>();
      }
      // C#: the null-conditional call covers the Select, OfType and Cast of the query; without
      // tables (an object of no document) the result is the empty array of `??`.
      const references = this._caexElementDictionary.getOrLoadValue(caexObject.document, true)?.classTable.allPathReferencesToObject(caexObject) ?? null;
      if (references === null) {
        return Enumerable.empty<CAEXObject>();
      }
      return from(references)
        .select((r) => r.caexObject)
        .ofType((x): x is CAEXBasicObject => implementsInterface(x, 'IClassWithBaseClassReference'))
        .cast<CAEXObject>();
    }
    const document = documentOrClass as CAEXDocument | null;
    if ((document !== null && document !== undefined ? document.xDocument : null) === null) {
      return Enumerable.empty<CAEXObject>();
    }
    return (
      this._caexElementDictionary
        .getOrLoadValue(document!.xDocument, true)
        ?.classTable.pathReferencesToPathByFilter(classPath ?? null, elementName, true)
        .select((r) => {
          const caexObject = r.caexObject;
          return (caexObject instanceof CAEXObject ? caexObject : null) as CAEXObject;
        }) ?? Enumerable.empty<CAEXObject>()
    );
  }

  /**
   * C# overloads AllClassReferencesDeep(CAEXObject), the classes derived directly or indirectly
   * from the class, and AllClassReferencesDeep(CAEXDocument document, string classPath, string
   * elementName = "").
   */
  allClassReferencesDeep(documentOrClass: CAEXDocument | CAEXObject | null, classPath?: string | null, elementName: string | null = ''): Enumerable<CAEXObject> {
    if (classPath === undefined && documentOrClass instanceof CAEXObject) {
      const caexObject = documentOrClass;
      if (!implementsInterface(caexObject, 'IClassWithBaseClassReference')) {
        return Enumerable.empty<CAEXObject>();
      }
      // Aml.Engine: cyclic class references recurse until the stack overflows; the port throws
      // CyclicReferenceException when a call for the same class is still running.
      return classReferencesGuard.run([this, caexObject.node], caexObject.node, () => {
        let enumerable = this.allClassReferences(caexObject);
        for (const item of enumerable) {
          enumerable = enumerable.concat(this.allClassReferencesDeep(item));
        }
        return enumerable;
      });
    }
    const document = documentOrClass as CAEXDocument | null;
    if ((document !== null && document !== undefined ? document.xDocument : null) === null || isNullOrWhiteSpace(classPath)) {
      return Enumerable.empty<CAEXObject>();
    }
    const orLoadValue = this._caexElementDictionary.getOrLoadValue(document!.xDocument, true);
    if (orLoadValue === null) {
      return Enumerable.empty<CAEXObject>();
    }
    return orLoadValue.allClassReferencesDeep(classPath!, elementName, true, null).ofType(CAEXObject);
  }

  /** All CAEX classes below the object, by CAEX path. */
  allElementsIdentifiedByCAEXPath(caexObject: CAEXBasicObject | null): ILookup<string, ICAEXReference> {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    // Aml.Engine: null (not an empty lookup) when the document has no tables.
    return (this._caexElementDictionary.getOrLoadValue(caexObject!.document, true)?.classTable.allClasses(caexObject!) ?? null) as ILookup<string, ICAEXReference>;
  }

  /** All references with an alias below (and including) the object, by alias. */
  allElementsWithAliasReference(caexObject: CAEXBasicObject | null, elementName: string | null = ''): ILookup<string, ICAEXReference> {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    const tables = this._caexElementDictionary.getOrLoadValue(caexObject!.document, true);
    if (tables === null) {
      return EmptyLookup.instance;
    }
    return toLookup(
      tables.aliasTable.aliasReferencesByFilter(caexObject!, elementName, true),
      (p) => p.key,
      (p) => p.reference as ICAEXReference,
    );
  }

  /** All path references below (or including) the object, by referenced path. */
  allElementsWithCAEXPathReference(caexObject: CAEXBasicObject | null, elementName: string | null = '', includeSelf = false): ILookup<string, ICAEXReference> {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    const tables = this._caexElementDictionary.getOrLoadValue(caexObject!.document, true);
    if (tables === null) {
      return EmptyLookup.instance;
    }
    return toLookup(
      tables.pathReferencesByFilter(caexObject!, elementName, includeSelf),
      (p) => p.referenceAttributeValue as string,
      (p) => p as ICAEXReference,
    );
  }

  /** All ID references below (and including) the object, by referenced ID. */
  allElementsWithIDReference(caexObject: CAEXBasicObject | null, elementName: string | null = ''): ILookup<string, ICAEXReference> {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    const tables = this._caexElementDictionary.getOrLoadValue(caexObject!.document, true);
    if (tables === null) {
      return EmptyLookup.instance;
    }
    return toLookup(
      tables.idReferencesByFilter(caexObject!, elementName, true),
      (p) => p.referenceID as string,
      (p) => p as ICAEXReference,
    );
  }

  /** All elements with an ID below (and including) the object (with the ID, if not empty), by ID. */
  allElementsWithIDs(caexObject: CAEXBasicObject | null, ID: string | null = ''): ILookup<string, ICAEXReference> {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    const tables = this._caexElementDictionary.getOrLoadValue(caexObject!.document, true);
    if (tables === null) {
      return EmptyLookup.instance;
    }
    return toLookup(
      tables.idTable.allElementsWithID(caexObject!, ID),
      (p) => p.id,
      (p) => p.reference as ICAEXReference,
    );
  }

  /** All elements below the object which contain InternalLinks (from the default query service). */
  allElementsWithInternalLinks(caexObject: CAEXBasicObject | null): Iterable<SystemUnitClassType> {
    if ((caexObject !== null && caexObject !== undefined ? caexObject.document : null) === null) {
      throw new ArgumentNullException('caexObject');
    }
    return ServiceLocator.defaultQueryService.allElementsWithInternalLinks(caexObject!);
  }

  /** All name references below (and including) the object, by referenced name. */
  allElementsWithNameReference(caexObject: CAEXBasicObject | null, elementName: string | null = ''): ILookup<string, ICAEXReference> {
    if ((caexObject !== null && caexObject !== undefined ? caexObject.document : null) === null) {
      throw new ArgumentNullException('caexObject');
    }
    const orLoadValue = this._caexElementDictionary.getOrLoadValue(caexObject!.document, true);
    if (orLoadValue === null) {
      return EmptyLookup.instance;
    }
    return toLookup(
      orLoadValue.nameRefTable.getAllElementsWithNameReference(caexObject!, elementName),
      (p) => p.referenceName as string,
      (p) => p as ICAEXReference,
    );
  }

  /** All ExternalInterfaces which are external data connectors. */
  allExternalDataReferences(document: CAEXDocument | null, caexObject: CAEXBasicObject | null = null): Enumerable<ExternalInterfaceType> {
    return this.allExternalInterfacesOfType(document, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector', caexObject);
  }

  /** All ExternalInterfaces (below the object, if not null) derived from the interface class. */
  allExternalInterfacesOfType(document: CAEXDocument | null, interfaceClassPath: string | null, caexObject: CAEXBasicObject | null = null): Enumerable<ExternalInterfaceType> {
    if (document === null || document === undefined) {
      return Enumerable.empty<ExternalInterfaceType>();
    }
    if (isNullOrEmpty(interfaceClassPath)) {
      throw new ArgumentNullException('caexObject');
    }
    const orLoadValue = this._caexElementDictionary.getOrLoadValue(document.xDocument, true);
    if (orLoadValue === null) {
      return Enumerable.empty<ExternalInterfaceType>();
    }
    return orLoadValue.allClassReferencesDeep(interfaceClassPath, 'InterfaceClass', false, caexObject).ofType(ExternalInterfaceType);
  }

  /** All InternalElements below the object which contain InternalLinks (from the default query service). */
  allInternalElementsWithInternalLinks(caexObject: CAEXBasicObject | null): Iterable<InternalElementType> {
    if ((caexObject !== null && caexObject !== undefined ? caexObject.document : null) === null) {
      throw new ArgumentNullException('caexObject');
    }
    return ServiceLocator.defaultQueryService.allInternalElementsWithInternalLinks(caexObject!);
  }

  /** All mirrors of the master attribute. */
  attributeMirrors(master: AttributeType | null): Iterable<AttributeType> {
    if ((master !== null && master !== undefined ? master.document : null) === null) {
      throw new ArgumentNullException('master');
    }
    return this._caexElementDictionary.getOrLoadValue(master!.document, true)?.idTable.attributeMirrors(master!) ?? Enumerable.empty<AttributeType>();
  }

  /** The references below the object with the alias. */
  elementsWithAliasReference(caexObject: CAEXBasicObject | null, alias: string | null, elementName: string | null = ''): Iterable<ICAEXReference> {
    if ((caexObject !== null && caexObject !== undefined ? caexObject.document : null) === null) {
      throw new ArgumentNullException('caexObject');
    }
    return (
      this._caexElementDictionary
        .getOrLoadValue(caexObject!.document, true)
        ?.aliasTable.elementsWithAliasReference(caexObject!, alias, CAEXNode_Identifier.ANY, elementName) ?? Enumerable.empty<CAEXNodeReference>()
    );
  }

  /** The references below (and including) the object to the CAEX path. */
  elementsWithCAEXPathReference(caexObject: CAEXBasicObject | null, caexPath: string | null, elementName: string | null = ''): Iterable<ICAEXReference> {
    if ((caexObject !== null && caexObject !== undefined ? caexObject.document : null) === null) {
      throw new ArgumentNullException('caexObject');
    }
    if (isNullOrWhiteSpace(caexPath)) {
      // Aml.Engine: null, not an empty sequence.
      return null as unknown as Iterable<ICAEXReference>;
    }
    const orLoadValue = this._caexElementDictionary.getOrLoadValue(caexObject!.document, true);
    const text = CAEXPathBuilder.aliasFromReference(caexPath, CAEXBasicObjectExtensions.caexSchema(caexObject!));
    if (!isNullOrEmpty(text)) {
      return (
        orLoadValue?.aliasTable.elementsWithAliasReference(caexObject!, text, CAEXNode_Identifier.NAME, elementName).where((a) => a.referenceAttributeValue === caexPath) ??
        Enumerable.empty<CAEXNodeReference>()
      );
    }
    return orLoadValue?.classTable.descendantPathReferencesToPath(caexObject!, caexPath, elementName, false) ?? Enumerable.empty<CAEXReference>();
  }

  /** The references below the object to the ID. */
  elementsWithIDReference(caexObject: CAEXBasicObject | null, ID: string | null, elementName: string | null = ''): Iterable<ICAEXReference> {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    const orLoadValue = this._caexElementDictionary.getOrLoadValue(caexObject!.document, true);
    const text = CAEXPathBuilder.aliasFromReference(ID, CAEXBasicObjectExtensions.caexSchema(caexObject!));
    if (!isNullOrEmpty(text)) {
      return (
        orLoadValue?.aliasTable.elementsWithAliasReference(caexObject!, text, CAEXNode_Identifier.ID, elementName).where((a) => a.referenceAttributeValue === ID) ??
        Enumerable.empty<CAEXNodeReference>()
      );
    }
    return orLoadValue?.idTable.elementsWithIDReference(caexObject!, ID, elementName) ?? Enumerable.empty<ICAEXReference>();
  }

  /** The SystemUnitClasses below the object with InternalLink relations. */
  elementsWithInternalLinkRelations(caexObject: CAEXBasicObject | null): Iterable<SystemUnitClassType> {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    return this._caexElementDictionary.getOrLoadValue(caexObject!.document, true)?.idTable.elementsWithInternalLinkRelations(caexObject!) ?? Enumerable.empty<SystemUnitClassType>();
  }

  /** All mirrors of the master ExternalInterface. */
  externalInterfaceMirrors(master: ExternalInterfaceType | null): Iterable<ExternalInterfaceType> {
    if (CAEXWrapper.equals(master, null)) {
      throw new ArgumentNullException('master');
    }
    const cAEXNode = this._caexElementDictionary.getOrLoadValue(master!.document, true)?.idTable.findByID(master!.id) ?? null;
    if (cAEXNode === null) {
      return Enumerable.empty<ExternalInterfaceType>();
    }
    return cAEXNode.interfaceMirrors.select((r) => {
      const caexObject = r.caexObject;
      return (caexObject instanceof ExternalInterfaceType ? caexObject : null) as ExternalInterfaceType;
    });
  }

  /** Finds the object with the ID, also in documents referenced by an alias. */
  findByID(doc: CAEXDocument | null, id: string | null, resolveAlias = true, elementType: ClassType | null = null): CAEXObject | null {
    if (isNullOrWhiteSpace(id) || doc === null || doc === undefined) {
      return null;
    }
    const text = CAEXPathBuilder.aliasFromReference(id, doc.schema);
    if (!isNullOrEmpty(text)) {
      if (resolveAlias) {
        const obj = CAEXDocumentExtensions.externalReferenceFromAlias(doc, text);
        if (obj === null) {
          return null;
        }
        const externalDocument = obj.externalDocument;
        if (externalDocument === null || externalDocument === undefined) {
          return null;
        }
        return CAEXDocumentExtensions.findByID(externalDocument, CAEXPathBuilder.removeAlias(id, null), false, elementType);
      }
      return null;
    }
    const obj2 = this._caexElementDictionary.getOrLoadValue(doc.xDocument, true)?.idTable.findByID(id) ?? null;
    let obj3: unknown;
    if (obj2 === null) {
      obj3 = null;
    } else {
      const element = obj2.element;
      obj3 = element !== null ? XmlOperation.createCAEXWrapper(element) : null;
    }
    return obj3 instanceof CAEXObject ? obj3 : null;
  }

  /** Finds the class (or other object) with the CAEX path, also in documents referenced by an alias. */
  findByPath(doc: CAEXDocument | null, path: string | null, resolveAlias = true, classType: ClassType | null = null): CAEXObject | null {
    if (isNullOrWhiteSpace(path) || doc === null || doc === undefined) {
      return null;
    }
    const text = CAEXPathBuilder.aliasFromReference(path, doc.schema);
    if (!isNullOrEmpty(text)) {
      if (!resolveAlias) {
        return null;
      }
      const val = CAEXDocumentExtensions.externalReferenceFromAlias(doc, text);
      if (CAEXWrapper.equals(val, null)) {
        return null;
      }
      return this.findByPath(val!.externalDocument ?? null, CAEXPathBuilder.removeAlias(path, null), true, classType);
    }
    const obj = this._caexElementDictionary.getOrLoadValue(doc.xDocument, true)?.classTable.findByPath(path) ?? null;
    let obj2: unknown;
    if (obj === null) {
      obj2 = null;
    } else {
      const element = obj.element;
      obj2 = element !== null ? XmlOperation.createCAEXWrapper(element) : null;
    }
    return obj2 instanceof CAEXObject ? obj2 : null;
  }

  /** The ExternalInterfaces below the object with InternalLink relations. */
  interfacesWithInternalLinkRelations(caexObject: CAEXBasicObject | null): Iterable<ExternalInterfaceType> {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    return this._caexElementDictionary.getOrLoadValue(caexObject!.document, true)?.idTable.interfacesWithInternalLinkRelations(caexObject!) ?? Enumerable.empty<ExternalInterfaceType>();
  }

  /** All mirrors of the master InternalElement. */
  internalElementMirrors(master: InternalElementType | null): Iterable<InternalElementType> {
    if (CAEXWrapper.equals(master, null)) {
      throw new ArgumentNullException('master');
    }
    const cAEXNode = this._caexElementDictionary.getOrLoadValue(master!.document, true)?.idTable.findByID(master!.id) ?? null;
    if (cAEXNode === null) {
      return Enumerable.empty<InternalElementType>();
    }
    return cAEXNode.elementMirrors.select((r) => {
      const caexObject = r.caexObject;
      return (caexObject instanceof InternalElementType ? caexObject : null) as InternalElementType;
    });
  }

  /** All InternalLinks connected to the SystemUnitClass. */
  internalLinksToElement(systemUnitClass: SystemUnitClassType | null): Iterable<InternalLinkType> {
    if (CAEXWrapper.equals(systemUnitClass, null)) {
      throw new ArgumentNullException('systemUnitClass');
    }
    return (this._caexElementDictionary.getOrLoadValue(systemUnitClass!.document, true)?.idTable.internalLinksToElement(systemUnitClass!) ??
      Enumerable.empty<InternalLinkType>()) as Iterable<InternalLinkType>;
  }

  /** All InternalLinks connected to the ExternalInterface. */
  internalLinksToInterface(externalInterface: ExternalInterfaceType | null): Iterable<InternalLinkType> {
    if (CAEXWrapper.equals(externalInterface, null)) {
      throw new ArgumentNullException('externalInterface');
    }
    return (this._caexElementDictionary.getOrLoadValue(externalInterface!.document, true)?.idTable.internalLinksToInterface(externalInterface!) ??
      Enumerable.empty<InternalLinkType>()) as Iterable<InternalLinkType>;
  }

  /**
   * C# overloads IsMaster(InternalElementType), IsMaster(ExternalInterfaceType) and
   * IsMaster(AttributeType): the object is the master of a mirror.
   */
  isMaster(element: InternalElementType | ExternalInterfaceType | AttributeType | null): boolean {
    if (element instanceof AttributeType) {
      const attribute = element;
      return this._caexElementDictionary.getOrLoadValue(attribute.document, true)?.idTable.isAttributeMaster(attribute) ?? false;
    }
    if (element instanceof ExternalInterfaceType) {
      return (this._caexElementDictionary.getOrLoadValue(element.document, true)?.idTable.findByID(element.id) ?? null)?.interfaceMirrors.any() ?? false;
    }
    if (CAEXWrapper.equals(element, null)) {
      // C# picks the overload by the static type; for null the InternalElementType overload is
      // the one taken by a call with an InternalElementType variable.
      throw new ArgumentNullException('element');
    }
    const ie = element as InternalElementType;
    return (this._caexElementDictionary.getOrLoadValue(ie.document, true)?.idTable.findByID(ie.id) ?? null)?.elementMirrors.any() ?? false;
  }

  /** The class is referenced by a derived class or an instance. */
  isReferenced(caexObject: CAEXObject): boolean {
    const node = caexObject.node!;
    if (from(node.elements(node.name)).any((e) => (e.attribute(XmlCAEXSchema.pathReferenceAttributeName(e))?.value ?? null) === caexObject.caexPath())) {
      return true;
    }
    const orLoadValue = this._caexElementDictionary.getOrLoadValue(caexObject.document);
    if (orLoadValue === null) {
      return false;
    }
    const count = orLoadValue.classTable.findByPath(caexObject.caexPath())?.elementReferences?.count ?? null;
    return count !== null && count > 0;
  }

  /** Removes the document from the internal registry of the service. */
  removeDocument(document: XDocumentWrapper | null): void {
    const document2 = (document !== null && document !== undefined ? document.xDocument : null) ?? null;
    if (document2 === null) {
      throw new ArgumentNullException('document');
    }
    this._caexElementDictionary.removeFromTable(document2, (t) => this.clearTables(t));
  }

  /** Auto update: propagates changes of CAEX objects to the tables. */
  private readonly caexElementChangedHandler = (sender: unknown, e: CAEXElementChangeEventArgs): void => {
    void sender;
    if (!this._paused && (e !== null && e !== undefined ? e.caexDocument : null) !== null) {
      this._paused = true;
      if (hasFlag(e.changeMode, CAEXElementChangeMode.Added)) {
        this.handleAdded(e);
      }
      if (hasFlag(e.changeMode, CAEXElementChangeMode.NameChanged)) {
        this.handleNameChanged(e);
      }
      if (hasFlag(e.changeMode, CAEXElementChangeMode.IDChanged)) {
        this.handleIDChanged(e);
      }
      if (hasFlag(e.changeMode, CAEXElementChangeMode.PathRefChanged)) {
        this.handlePathRefChanged(e);
      }
      if (hasFlag(e.changeMode, CAEXElementChangeMode.IDRefChanged)) {
        this.handleIDRefChanged(e);
      }
      if (hasFlag(e.changeMode, CAEXElementChangeMode.ValueChanged)) {
        this.handleValueChanged(e);
      }
      if (hasFlag(e.changeMode, CAEXElementChangeMode.NameRefChanged)) {
        this.handleNameRefChanged(e);
      }
      this._paused = false;
    }
  };

  /** Auto update: propagates changes which are about to happen (deletions) to the tables. */
  private readonly caexElementChangingHandler = (sender: unknown, e: CAEXElementChangeEventArgs): void => {
    void sender;
    if (!this._paused) {
      this._paused = true;
      if (hasFlag(e.changeMode, CAEXElementChangeMode.Deleting)) {
        this.handleDeleting(e);
      }
      this._paused = false;
    }
  };

  private clearTables(tables: LookupTables | null): void {
    tables?.clear();
  }

  private dispose(): void {
    CaexCommand.caexElementChangedEvent.unsubscribe(this.caexElementChangedHandler);
    CaexCommand.caexElementChangingEvent.unsubscribe(this.caexElementChangingHandler);
    this._caexElementDictionary.clear();
    LookupService.lookUpService = null;
  }

  private handleAdded(e: CAEXElementChangeEventArgs): void {
    if (e.caexElement === null) {
      return;
    }
    const cAEXDocument = e.caexDocument;
    if ((cAEXDocument !== null ? cAEXDocument.xDocument : null) !== null) {
      const num = this._caexElementDictionary.isLoaded(e.caexDocument!.xDocument!);
      const orLoadValue = this._caexElementDictionary.getOrLoadValue(e.caexDocument!.xDocument);
      if (num) {
        orLoadValue?.addElementAndDescandants(e.caexElement);
      }
    }
  }

  private handleDeleting(e: CAEXElementChangeEventArgs): void {
    if (e.caexElement !== null) {
      const cAEXDocument = e.caexDocument;
      if (
        (cAEXDocument !== null ? cAEXDocument.xDocument : null) !== null &&
        (this.isAutoUpdateEnabled || this._caexElementDictionary.isLoaded(e.caexDocument!.xDocument!))
      ) {
        this._caexElementDictionary.getOrLoadValue(e.caexDocument!.xDocument)?.deleteElementAndDescandants(e.caexElement);
      }
    }
  }

  private handleIDChanged(e: CAEXElementChangeEventArgs): void {
    if (e.caexElement !== null) {
      const oldID = typeof e.oldValue === 'string' ? e.oldValue : null;
      const newID = typeof e.newValue === 'string' ? e.newValue : null;
      this._caexElementDictionary.getOrLoadValue(e.caexDocument!.xDocument)?.idTable.updateIDReferences(e.caexElement, oldID, newID);
    }
  }

  private handleIDRefChanged(e: CAEXElementChangeEventArgs): void {
    if (e.caexElement !== null) {
      const oldIDRef = typeof e.oldValue === 'string' ? e.oldValue : null;
      const newIDRef = typeof e.newValue === 'string' ? e.newValue : null;
      this._caexElementDictionary.getOrLoadValue(e.caexDocument!.xDocument)?.changeIDRef(e.caexElement, e.caexAttributeName, oldIDRef, newIDRef);
    }
  }

  private handleNameRefChanged(e: CAEXElementChangeEventArgs): void {
    if (e.caexElement !== null) {
      const oldNameRef = typeof e.oldValue === 'string' ? e.oldValue : null;
      const newNameRef = typeof e.newValue === 'string' ? e.newValue : null;
      const orLoadValue = this._caexElementDictionary.getOrLoadValue(e.caexDocument!.xDocument);
      if (XmlCAEXSchema.isElementWithNameOnlyReference(e.caexElement)) {
        orLoadValue?.nameRefTable.changeNameReference(e.caexElement, e.caexAttributeName, oldNameRef, newNameRef);
      }
    }
  }

  private handleNameChanged(e: CAEXElementChangeEventArgs): void {
    if (e.caexElement !== null && e.caexDocument !== null) {
      const oldName = typeof e.oldValue === 'string' ? e.oldValue : null;
      const newName = typeof e.newValue === 'string' ? e.newValue : null;
      this._caexElementDictionary.getOrLoadValue(e.caexDocument.xDocument)?.changeName(e.caexElement, oldName, newName);
    }
  }

  private handlePathRefChanged(e: CAEXElementChangeEventArgs): void {
    if (e.caexElement !== null) {
      const oldPathRef = typeof e.oldValue === 'string' ? e.oldValue : null;
      const newPathRef = typeof e.newValue === 'string' ? e.newValue : null;
      this._caexElementDictionary.getOrLoadValue(e.caexDocument!.xDocument)?.changePathRef(e.caexElement, e.caexAttributeName, oldPathRef, newPathRef);
    }
  }

  private handleValueChanged(e: CAEXElementChangeEventArgs): void {
    if (e.caexElement !== null) {
      const oldAlias = typeof e.oldValue === 'string' ? e.oldValue : null;
      const newAlias = typeof e.newValue === 'string' ? e.newValue : null;
      const orLoadValue = this._caexElementDictionary.getOrLoadValue(e.caexDocument!.xDocument);
      if (e.caexAttributeName === 'Alias') {
        orLoadValue?.aliasTable.updateAliasReferences(oldAlias, newAlias);
      }
    }
  }

  /** Not called in the original (private and unused); the references to the class path by alias. */
  private externalReferences(document: CAEXDocument, classPath: string | null, elementName: string | null = ''): Enumerable<ICAEXReference> {
    let enumerable: Enumerable<ICAEXReference> = Enumerable.empty<ICAEXReference>();
    for (const item of this.allElementsWithAliasReference(document.caexFile)) {
      for (const item2 of from(item).groupBy((a) => a.referenceAttributeValue)) {
        const obj = CAEXDocumentExtensions.findByPath(document, item2.key, true, null);
        let val = implementsInterface(obj, 'IClassWithBaseClassReference') ? (obj as unknown as IClassWithBaseClassReference) : null;
        if (val !== null && !isNullOrEmpty(elementName) && (val as unknown as CAEXWrapper).tagName !== elementName) {
          val = null;
        }
        if ((val !== null ? (val as unknown as CAEXObject).caexPath() : null) === classPath) {
          enumerable = enumerable.concat(item2);
        } else {
          if (val === null) {
            continue;
          }
          let source: Iterable<IClassWithBaseClassReference> = [];
          if (!(val instanceof InterfaceFamilyType)) {
            if (!(val instanceof SystemUnitFamilyType)) {
              if (!(val instanceof RoleFamilyType)) {
                if (val instanceof AttributeFamilyType) {
                  source = val.getReferenceHierarchy(true, AttributeFamilyType) as unknown as Iterable<IClassWithBaseClassReference>;
                }
              } else {
                source = val.getReferenceHierarchy(true, RoleFamilyType) as unknown as Iterable<IClassWithBaseClassReference>;
              }
            } else {
              source = val.getReferenceHierarchy(true, SystemUnitFamilyType) as unknown as Iterable<IClassWithBaseClassReference>;
            }
          } else {
            source = val.getReferenceHierarchy(true, InterfaceFamilyType) as unknown as Iterable<IClassWithBaseClassReference>;
          }
          if (from(source).any((c) => (c as unknown as CAEXObject).caexPath() === classPath)) {
            enumerable = enumerable.concat(item2);
          }
        }
      }
    }
    return enumerable;
  }

  /** The reference is in a document with auto update and auto update is enabled. */
  supportsUpdate(reference: CAEXReference | null): boolean {
    if (reference !== null && this.isAutoUpdateEnabled) {
      const caexObject = reference.caexObject;
      let obj: boolean | null;
      if (caexObject === null) {
        obj = null;
      } else {
        const cAEXDocument = caexObject.caexDocument;
        obj = cAEXDocument !== null ? cAEXDocument.supportsAutoUpdate : null;
      }
      return obj === true;
    }
    return false;
  }

  /** Raises ReferenceUpdated for the reference, if it supports updates. */
  onReferenceUpdate(referencedElement: XElement | null, reference: CAEXReference, oldValue: string | null, newValue: string | null): void {
    if (this.supportsUpdate(reference)) {
      this._myEventSource.raise(this, new UpdateEventArgs(referencedElement, reference, oldValue, newValue));
    }
  }
}

registerInterfaces(LookupService as unknown as abstract new () => unknown, 'IQuery', 'IAMLService', 'IAutoUpdate', 'IXMLDocumentRegistry');
CAEXNodeReference.lookupServiceType = LookupService;
