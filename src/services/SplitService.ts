// Port of Aml.Engine.Services.SplitService (Aml.Engine.Services 4.3.1).

import '../engine/index.js';
import { XDocument, type XElement } from '../xml/index.js';
import { ArgumentException, ArgumentNullException, ArgumentOutOfRangeException } from '../system/exceptions.js';
import { cultureStartsWith } from '../system/CompareInfo.js';
import { DefaultComparer, from } from '../system/linq.js';
import { isNullOrEmpty } from '../system/strings.js';
import { Uri, UriKind } from '../system/Uri.js';
import { registerInterfaces } from '../engine/interfaces.js';
import * as Path from '../engine/amlobjects/internal/NetPath.js';
import { AttributeTypeLibType } from '../engine/caex/AttributeTypeLibType.js';
import { CAEXDocument } from '../engine/caex/CAEXDocument.js';
import { CAEXWrapper } from '../engine/caex/CAEXWrapper.js';
import { InterfaceClassLibType } from '../engine/caex/InterfaceClassLibType.js';
import { InternalElementType } from '../engine/caex/InternalElementType.js';
import { RoleClassLibType } from '../engine/caex/RoleClassLibType.js';
import { CaexCommand } from '../engine/caex/commands/CaexCommand.js';
import { CAEXElementChangeMode } from '../engine/caex/commands/CAEXElementChangeMode.js';
import { CAEXBasicObjectExtensions } from '../engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from '../engine/caex/extensions/CAEXDocumentExtensions.js';
import { QueryResult } from '../engine/services/QueryResult.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { XmlCAEXSchema } from '../engine/xmlext/XmlCAEXSchema.js';
import { XmlClassOperation } from '../engine/xmlext/XmlClassOperation.js';
import { DocumentReferenceDictionary } from './generique/DocumentReferenceDictionary.js';
import { UniqueNameService } from './UniqueNameService.js';
import type { CAEXObject } from '../engine/caex/CAEXObject.js';
import type { CAEXElementChangeEventArgs } from '../engine/caex/commands/CAEXElementChangeEventArgs.js';
import type { IAMLService } from '../engine/services/interfaces/IAMLService.js';
import type { IAutoUpdate } from '../engine/services/interfaces/IAutoUpdate.js';
import type { ICAEXReference } from '../engine/services/interfaces/ICAEXReference.js';
import type { ISplit } from '../engine/services/interfaces/ISplit.js';
import type { ISplitPoint } from '../engine/services/interfaces/ISplitPoint.js';
import type { IXMLDocumentRegistry } from '../engine/services/interfaces/IXMLDocumentRegistry.js';
import type { XDocumentWrapper } from '../engine/xml/XDocumentWrapper.js';

/** List<T>.Contains: EqualityComparer<T>.Default (CAEXWrapper.Equals compares the wrapped nodes). */
function listContains<T>(list: T[], item: T): boolean {
  for (const x of list) {
    if (item === null ? x === null : DefaultComparer.equals(x, item)) {
      return true;
    }
  }
  return false;
}

/** List<T>.Remove: removes the first item equal to `item` (default equality). */
function listRemove<T>(list: T[], item: T): boolean {
  for (let i = 0; i < list.length; i++) {
    const x = list[i];
    if (item === null ? x === null : DefaultComparer.equals(x, item)) {
      list.splice(i, 1);
      return true;
    }
  }
  return false;
}

/** List<T>.RemoveAll: the predicate is called once per item in order; returns the number removed. */
function listRemoveAll<T>(list: T[], match: (x: T) => boolean): number {
  let j = 0;
  for (let i = 0; i < list.length; i++) {
    const x = list[i]!;
    if (!match(x)) {
      list[j++] = x;
    }
  }
  const removed = list.length - j;
  list.length = j;
  return removed;
}

/** string.Substring(startIndex, length). */
function csSubstring(s: string, startIndex: number, length: number): string {
  if (startIndex < 0) throw new ArgumentOutOfRangeException('startIndex', 'StartIndex cannot be less than zero.');
  if (startIndex > s.length) throw new ArgumentOutOfRangeException('startIndex', 'startIndex cannot be larger than length of string.');
  if (length < 0) throw new ArgumentOutOfRangeException('length', 'Length cannot be less than zero.');
  if (startIndex > s.length - length) throw new ArgumentOutOfRangeException('length', 'Index and length must refer to a location within the string.');
  return s.substring(startIndex, startIndex + length);
}

/**
 * A split service, able to split one CAEXDocument into multiple files using split points.
 */
export class SplitService implements ISplit, IAMLService, IXMLDocumentRegistry {
  private readonly SplitPointTable: DocumentReferenceDictionary<ISplitPoint[]>;

  /**
   * The handler subscribed to CaexCommand.caexElementChangingEvent: the C# method group
   * CAEXElementChangingHandler, as one function so that unRegister can unsubscribe it.
   */
  private readonly _caexElementChangingHandler = (sender: unknown, e: CAEXElementChangeEventArgs): void => {
    this.caexElementChangingHandler(sender, e);
  };

  /**
   * Initializes a new instance of the SplitService class (private in C#; services are created by
   * register()).
   */
  constructor() {
    this.SplitPointTable = new DocumentReferenceDictionary<ISplitPoint[]>();
    CaexCommand.caexElementChangingEvent.subscribe(this._caexElementChangingHandler);
    this.SplitPointTable.createNew = (_d: CAEXDocument) => [];
  }

  /** Registers a new instance of a SplitService with the ServiceLocator; returns the service instance. */
  static register(): SplitService {
    const splitService = new SplitService();
    ServiceLocator.register(splitService, 'ISplit');
    return splitService;
  }

  /** Unregisters this service. */
  static unRegister(): void {
    const splitService = ServiceLocator.unRegister('ISplit');
    if (splitService instanceof SplitService) {
      splitService.SplitPointTable.clear();
      CaexCommand.caexElementChangingEvent.unsubscribe(splitService._caexElementChangingHandler);
    }
  }

  /** Removes the split point for the provided CAEX object. */
  removeSplitPoint(caexObject: ISplitPoint): void {
    const orLoadValue = this.SplitPointTable.getOrLoadValue(caexObject.document)!;
    if (listContains(orLoadValue, caexObject)) {
      listRemove(orLoadValue, caexObject);
    }
  }

  /** Removes the document from the internal registry of the service. */
  removeDocument(document: XDocumentWrapper): void {
    this.SplitPointTable.removeFromTable(document.xDocument, (list: ISplitPoint[]) => this.clearList(list));
  }

  private clearList(list: ISplitPoint[]): void {
    list.length = 0;
  }

  /**
   * Sets the split point for the provided CAEX object. If the actual list of split points for the
   * same document already contains a split point which is a child of the provided CAEX object, this
   * existing split point is removed from the list.
   */
  setSplitPoint(caexObject: ISplitPoint): void {
    const splitPointList = this.SplitPointTable.getOrLoadValue(caexObject.document)!;
    if (listContains(splitPointList, caexObject)) {
      return;
    }
    const internalElementSplitPoints = from(splitPointList).ofType(InternalElementType).toList();
    if (internalElementSplitPoints.length === 0 && !(caexObject instanceof InternalElementType)) {
      splitPointList.push(caexObject);
      return;
    }
    if (caexObject instanceof InterfaceClassLibType || caexObject instanceof RoleClassLibType || caexObject instanceof AttributeTypeLibType) {
      splitPointList.push(caexObject);
      return;
    }
    const existingSplitPoints: XElement[] = from(caexObject.node!.descendants())
      .where((d) => from(internalElementSplitPoints).any((s) => s.node === d))
      .toList();
    listRemoveAll(splitPointList, (s) => existingSplitPoints.includes(s.node!));
    if (!(caexObject instanceof InternalElementType) || !from(caexObject.node!.ancestors()).any((d) => from(splitPointList).any((s) => s.node === d))) {
      splitPointList.push(caexObject);
    }
  }

  /**
   * C# overloads:
   * - `Split(sourceDocument, alias, filePath)`: splits the document on all currently defined split
   *   points. The created libraries are saved in an AutomationML document and an ExternalReference
   *   is created, using the specified alias. All remaining references to the external source are
   *   renamed using the provided alias. After splitting, the document doesn't contain any split
   *   points any more. Returns `null` if there is no split point.
   * - `Split(sourceDocument, splitPoint, alias, filePath)`: splits the document on the provided
   *   split point.
   *
   * Returns the created document containing the split parts. Throws ArgumentNullException for a
   * missing document, alias or file path, and ArgumentException if the file path is equal to the
   * source document.
   */
  split(
    sourceDocument: CAEXDocument | null,
    aliasOrSplitPoint: string | ISplitPoint | null,
    aliasOrFilePath: string | null,
    filePath?: string | null,
  ): CAEXDocument | null {
    if (filePath === undefined) {
      return this.splitOnSplitPoints(sourceDocument, aliasOrSplitPoint as string | null, aliasOrFilePath);
    }
    return this.splitOnSplitPoint(sourceDocument, aliasOrSplitPoint as ISplitPoint, aliasOrFilePath, filePath);
  }

  /** `Split(CAEXDocument sourceDocument, string alias, string filePath)`. */
  private splitOnSplitPoints(sourceDocument: CAEXDocument | null, alias: string | null, filePath: string | null): CAEXDocument | null {
    if (sourceDocument == null) {
      throw new ArgumentNullException('sourceDocument');
    }
    if (isNullOrEmpty(alias)) {
      throw new ArgumentNullException('alias');
    }
    if (isNullOrEmpty(filePath)) {
      throw new ArgumentNullException('filePath');
    }
    if (filePath === sourceDocument.caexFile!.fileName) {
      throw new ArgumentException('File path is equal to source document');
    }
    const orLoadValue = this.SplitPointTable.getOrLoadValue(sourceDocument.xDocument)!;
    listRemoveAll(orLoadValue, (sp) => sp.document === null);
    if (orLoadValue.length === 0) {
      return null;
    }
    const val = ServiceLocator.beginService(() => UniqueNameService.register(), 'IUniqueName').service;
    const val2 = CAEXDocument.new_CAEXDocument(sourceDocument.schema);
    ServiceLocator.undoRedoService?.pause(val2);
    for (const item of from(orLoadValue).where((e) => XmlCAEXSchema.isAttributeTypeLib(e.node!))) {
      SplitService.splitLibrary(sourceDocument, val2, item as unknown as CAEXObject, alias);
    }
    for (const item2 of from(orLoadValue).where((e) => XmlCAEXSchema.isInterfaceClassLib(e.node!))) {
      SplitService.splitLibrary(sourceDocument, val2, item2 as unknown as CAEXObject, alias);
    }
    for (const item3 of from(orLoadValue).where((e) => XmlCAEXSchema.isRoleClassLib(e.node!))) {
      SplitService.splitLibrary(sourceDocument, val2, item3 as unknown as CAEXObject, alias);
    }
    for (const item4 of from(orLoadValue).where((e) => XmlCAEXSchema.isSystemUnitClassLib(e.node!))) {
      SplitService.splitLibrary(sourceDocument, val2, item4 as unknown as CAEXObject, alias);
    }
    for (const item5 of from(orLoadValue).where((e) => XmlCAEXSchema.isInstanceHierarchy(e.node!))) {
      SplitService.splitLibrary(sourceDocument, val2, item5 as unknown as CAEXObject, alias);
    }
    for (const item6 of from(orLoadValue).where((e) => XmlCAEXSchema.isInternalElement(e.node!))) {
      SplitService.splitInternalElement(sourceDocument, val2, item6 as unknown as InternalElementType, alias);
    }
    SplitService.updateExternals(sourceDocument, val2, alias);
    if (!saveSplitDocument(val2, filePath, false)) {
      saveSplitDocument(val2, filePath, true);
    }
    ServiceLocator.endService(() => UniqueNameService.unRegister(), val);
    orLoadValue.length = 0;
    this.SplitPointTable.remove(sourceDocument.xDocument!);
    SplitService.addExternalReferenceIfNeeded(sourceDocument, alias, filePath);
    ServiceLocator.undoRedoService?.resume(val2);
    return val2;

    /**
     * The static local function SaveSplitDocument: saves the split document if the path is an
     * absolute file URI (made absolute with Path.GetFullPath if `getFullPath` is set).
     */
    function saveSplitDocument(splitDocument: CAEXDocument, path: string, getFullPath: boolean): boolean {
      if (getFullPath) {
        path = Path.getFullPath(path);
      }
      try {
        const result = Uri.tryCreate(path, UriKind.Absolute);
        if (result !== null) {
          if (result.isAbsoluteUri && result.isFile) {
            splitDocument.saveToFile(path, true);
            return true;
          }
          if (!result.isFile) {
            return true;
          }
          return getFullPath;
        }
        return getFullPath;
      } catch {
        return getFullPath;
      }
    }
  }

  /** `Split(CAEXDocument sourceDocument, ISplitPoint splitPoint, string alias, string filePath)`. */
  private splitOnSplitPoint(
    sourceDocument: CAEXDocument | null,
    splitPoint: ISplitPoint,
    alias: string | null,
    filePath: string | null,
  ): CAEXDocument {
    if (sourceDocument == null) {
      throw new ArgumentNullException('sourceDocument');
    }
    if (isNullOrEmpty(alias)) {
      throw new ArgumentNullException('alias');
    }
    if (isNullOrEmpty(filePath)) {
      throw new ArgumentNullException('filePath');
    }
    if (filePath === sourceDocument.caexFile!.fileName) {
      throw new ArgumentException('File path is equal to source document');
    }
    const orLoadValue = this.SplitPointTable.getOrLoadValue(sourceDocument.xDocument)!;
    listRemoveAll(orLoadValue, (sp) => sp.document === null);
    if (listContains(orLoadValue, splitPoint)) {
      listRemove(orLoadValue, splitPoint);
    }
    const val = ServiceLocator.beginService(() => UniqueNameService.register(), 'IUniqueName').service;
    const val2 = CAEXDocument.new_CAEXDocument(sourceDocument.schema);
    ServiceLocator.undoRedoService?.pause(val2);
    if (XmlCAEXSchema.isLibrary(splitPoint.node!)) {
      SplitService.splitLibrary(sourceDocument, val2, splitPoint as unknown as CAEXObject, alias);
    } else if (XmlCAEXSchema.isInternalElement(splitPoint.node!)) {
      SplitService.splitInternalElement(sourceDocument, val2, splitPoint as unknown as InternalElementType, alias);
    }
    SplitService.updateExternals(sourceDocument, val2, alias);
    val2.saveToFile(filePath, true);
    ServiceLocator.endService(() => UniqueNameService.unRegister(), val);
    orLoadValue.length = 0;
    this.SplitPointTable.remove(sourceDocument.xDocument!);
    SplitService.addExternalReferenceIfNeeded(sourceDocument, alias, filePath);
    ServiceLocator.undoRedoService?.resume(val2);
    return val2;
  }

  /** Gets all split points for the provided document. */
  splitPoints(document: CAEXDocument | null): Iterable<ISplitPoint> {
    let obj: Iterable<ISplitPoint> | null;
    if (document != null) {
      const list = this.SplitPointTable.getOrLoadValue(document.xDocument);
      obj = list != null ? from(list).where((s) => s.document !== null) : null;
      if (obj === null) {
        return [];
      }
    } else {
      obj = [];
    }
    return obj;
  }

  /** All alias references are checked and the necessary externals are copied from the source document. */
  private static updateAliasReferences(sourceDocument: CAEXDocument, splitDocument: CAEXDocument, alias: string): void {
    for (const item of QueryResult.allElementsWithAliasReference(splitDocument)) {
      const text = item.key.replace(/@+$/, '');
      const list = item.toList();
      if (text === alias) {
        const text2 = alias + '@';
        for (const item2 of list) {
          const referenceAttributeValue = item2.referenceAttributeValue;
          if (cultureStartsWith(referenceAttributeValue!, text2)) {
            const text3 = referenceAttributeValue!;
            const length = text2.length;
            const value = csSubstring(text3, length, text3.length - length);
            item2.setValue(value);
          }
        }
      } else {
        const val = sourceDocument.caexFile!.externalReference.item({ name: 'Alias', value: text });
        if (!CAEXWrapper.equals(val, null)) {
          splitDocument.caexFile!.externalReference.insert(val, true, false);
        }
      }
    }
  }

  /** Adds the external reference for the provided alias to the source document (always, despite the name). */
  private static addExternalReferenceIfNeeded(sourceDocument: CAEXDocument, alias: string, filePath: string): void {
    const obj = sourceDocument.caexFile!.externalReference.append();
    obj.alias = alias;
    if (!isNullOrEmpty(sourceDocument.filePath)) {
      const directoryName = Path.getDirectoryName(sourceDocument.filePath);
      if (!isNullOrEmpty(directoryName) && !isNullOrEmpty(sourceDocument.filePath) && cultureStartsWith(filePath, directoryName)) {
        filePath = filePath.replaceAll(directoryName, '.');
      }
    }
    obj.path = filePath;
  }

  /** This handler reacts on deleting elements and updates the split point list if needed. */
  private caexElementChangingHandler(sender: unknown, e: CAEXElementChangeEventArgs): void {
    if (sender instanceof XDocument) {
      // Aml.Engine: the result of HasFlag(Deleting) is discarded, the handler has no effect.
      void ((e.changeMode & CAEXElementChangeMode.Deleting) === CAEXElementChangeMode.Deleting);
    }
  }

  private static crossLibraryIDReferences(sourceDocument: CAEXDocument, library: CAEXObject): ICAEXReference[] {
    const list: ICAEXReference[] = [];
    for (const item of QueryResult.allElementsWithIDReference(sourceDocument)) {
      const val = CAEXDocumentExtensions.findByID(sourceDocument, item.key, true, null);
      if (!CAEXWrapper.equals(val, null) && CAEXWrapper.equals(CAEXBasicObjectExtensions.library(val!), library)) {
        for (const reference of from(item.toList()).where(
          (reference) => !CAEXWrapper.equals(CAEXBasicObjectExtensions.library(reference.caexObject!), library),
        )) {
          list.push(reference);
        }
      }
    }
    return list;
  }

  /**
   * Splits the internal element. ID references which stay in the source document but point to the
   * split document are changed to alias references.
   */
  private static splitInternalElement(
    sourceDocument: CAEXDocument,
    splitDocument: CAEXDocument,
    internalElement: InternalElementType,
    alias: string,
  ): void {
    const val = internalElement.createMirror();
    val.refBaseSystemUnitPath = alias + '@' + (internalElement.id ?? '');
    internalElement.insertAfter(val);
    for (const item of from(ServiceLocator.queryService.allElementsWithIDReference(sourceDocument.caexFile!, '')).toList()) {
      const val2 = CAEXDocumentExtensions.findByID(sourceDocument, item.key, true, null);
      if (CAEXWrapper.equals(val2, null) || !XmlClassOperation.isDescendant(val2!.node, internalElement.node, true)) {
        continue;
      }
      for (const item2 of item) {
        if (!XmlClassOperation.isDescendant(item2.caexObject!.node, internalElement.node, false)) {
          item2.setValue(alias + '@' + (item2.referenceAttributeValue ?? ''));
        }
      }
    }
    const service = ServiceLocator.getService<IAutoUpdate>('IAutoUpdate');
    if (service !== null && service.isAutoUpdateEnabled) {
      service.isAutoUpdateEnabled = false;
      internalElement.remove(false);
      service.isAutoUpdateEnabled = true;
    } else {
      internalElement.remove(false);
    }
    splitDocument.caexFile!.instanceHierarchy.append(internalElement.name).insert(internalElement, false, false);
    for (const item3 of from(QueryResult.allElementsWithIDReference(sourceDocument))
      .where((x) => !CAEXWrapper.equals(CAEXDocumentExtensions.findByID(splitDocument, x.key, true, null), null))
      .selectMany((x) => x)) {
      const referenceAttributeValue = item3.referenceAttributeValue;
      const value = alias + '@' + (referenceAttributeValue ?? '');
      item3.setValue(value);
    }
  }

  /**
   * Splits the library. Path references and ID references which cross the library border are
   * changed to alias references.
   */
  private static splitLibrary(sourceDocument: CAEXDocument, splitDocument: CAEXDocument, library: CAEXObject, alias: string): void {
    for (const item of from(QueryResult.allElementsWithCAEXPathReference(sourceDocument))
      .selectMany((x) => x)
      .where(
        (el) =>
          !CAEXWrapper.equals(el.caexObject, null) &&
          el.referenceAttributeValue !== null &&
          cultureStartsWith(el.referenceAttributeValue, library.name) &&
          !CAEXWrapper.equals(CAEXBasicObjectExtensions.library(el.caexObject!), library),
      )
      .concat(SplitService.crossLibraryIDReferences(sourceDocument, library))
      .toList()) {
      const referenceAttributeValue = item.referenceAttributeValue;
      const value = alias + '@' + (referenceAttributeValue ?? '');
      item.setValue(value);
    }
    const service = ServiceLocator.getService<IAutoUpdate>('IAutoUpdate');
    if (service !== null && service.isAutoUpdateEnabled) {
      service.isAutoUpdateEnabled = false;
      library.remove(false);
      service.isAutoUpdateEnabled = true;
    } else {
      library.remove(false);
    }
    splitDocument.caexFile!.insert(library, false, false);
  }

  /**
   * Checks the created external references in the source document, if they are still needed after
   * every split point is processed; the outgoing references of the created split document are
   * checked and the needed externals are created.
   */
  private static updateExternals(sourceDocument: CAEXDocument, splitDocument: CAEXDocument, alias: string): void {
    SplitService.updateAliasReferences(sourceDocument, splitDocument, alias);
  }
}

registerInterfaces(SplitService, 'ISplit', 'IAMLService', 'IXMLDocumentRegistry');
