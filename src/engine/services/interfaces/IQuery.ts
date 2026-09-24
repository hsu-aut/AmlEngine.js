// Port of Aml.Engine.Services.Interfaces.IQuery (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { AttributeType } from '../../caex/AttributeType.js';
import type { CAEXBasicObject } from '../../caex/CAEXBasicObject.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { CAEXObject } from '../../caex/CAEXObject.js';
import type { ExternalInterfaceType } from '../../caex/ExternalInterfaceType.js';
import type { InternalElementType } from '../../caex/InternalElementType.js';
import type { InternalLinkType } from '../../caex/InternalLinkType.js';
import type { SystemUnitClassType } from '../../caex/SystemUnitClassType.js';
import type { ILookup } from '../EmptyLookup.js';
import type { IAMLService } from './IAMLService.js';
import type { ICAEXReference } from './ICAEXReference.js';

/** A class constructor passed where C# passes a `Type` (FindByID/FindByPath). */
export type ClassType = abstract new (...args: never[]) => unknown;

/** Query service: finds objects and references in CAEX documents. */
export interface IQuery extends IAMLService {
  /**
   * All classes derived from the class with the given path (C# overloads (document, classPath,
   * elementName = "") and (caexObject)).
   */
  allClassReferences(documentOrClass: CAEXDocument | CAEXObject, classPath?: string | null, elementName?: string | null): Iterable<CAEXObject>;
  /** All classes derived directly or indirectly (C# overloads (caexObject) and (document, classPath, elementName = "")). */
  allClassReferencesDeep(documentOrClass: CAEXDocument | CAEXObject, classPath?: string | null, elementName?: string | null): Iterable<CAEXObject>;
  allElementsIdentifiedByCAEXPath(caexObject: CAEXBasicObject): ILookup<string, ICAEXReference>;
  allElementsWithAliasReference(caexObject: CAEXBasicObject, elementName?: string | null): ILookup<string, ICAEXReference>;
  allElementsWithCAEXPathReference(caexObject: CAEXBasicObject, elementName?: string | null, includeSelf?: boolean): ILookup<string, ICAEXReference>;
  allElementsWithIDReference(caexObject: CAEXBasicObject, elementName?: string | null): ILookup<string, ICAEXReference>;
  allElementsWithIDs(caexObject: CAEXBasicObject, ID?: string | null): ILookup<string, ICAEXReference>;
  allElementsWithInternalLinks(caexObject: CAEXBasicObject): Iterable<SystemUnitClassType>;
  allElementsWithNameReference(caexObject: CAEXBasicObject, elementName?: string | null): ILookup<string, ICAEXReference>;
  allExternalDataReferences(document: CAEXDocument, caexObject?: CAEXBasicObject | null): Iterable<ExternalInterfaceType>;
  allExternalInterfacesOfType(document: CAEXDocument, interfaceClassPath: string | null, caexObject?: CAEXBasicObject | null): Iterable<ExternalInterfaceType>;
  allInternalElementsWithInternalLinks(caexObject: CAEXBasicObject): Iterable<InternalElementType>;
  attributeMirrors(master: AttributeType | null): Iterable<AttributeType>;
  elementsWithAliasReference(caexObject: CAEXBasicObject, alias: string, elementName?: string | null): Iterable<ICAEXReference>;
  elementsWithCAEXPathReference(caexObject: CAEXBasicObject | null, caexPath: string | null, elementName?: string | null): Iterable<ICAEXReference>;
  elementsWithIDReference(caexObject: CAEXBasicObject | null, ID: string | null, elementName?: string | null): Iterable<ICAEXReference>;
  elementsWithInternalLinkRelations(caexObject: CAEXBasicObject): Iterable<SystemUnitClassType>;
  externalInterfaceMirrors(master: ExternalInterfaceType | null): Iterable<ExternalInterfaceType>;
  findByID(doc: CAEXDocument | null, id: string | null, resolveAlias?: boolean, elementType?: ClassType | null): CAEXObject | null;
  findByPath(caexDocument: CAEXDocument | null, path: string | null, resolveAlias?: boolean, classType?: ClassType | null): CAEXObject | null;
  interfacesWithInternalLinkRelations(caexObject: CAEXBasicObject): Iterable<ExternalInterfaceType>;
  internalElementMirrors(master: InternalElementType | null): Iterable<InternalElementType>;
  internalLinksToElement(systemUnitClass: SystemUnitClassType | null): Iterable<InternalLinkType>;
  internalLinksToInterface(externalInterface: ExternalInterfaceType | null): Iterable<InternalLinkType>;
  /** C# overloads for InternalElementType, ExternalInterfaceType and AttributeType. */
  isMaster(element: InternalElementType | ExternalInterfaceType | AttributeType): boolean;
  isReferenced(caexObject: CAEXObject): boolean;
}

registerInterfaceBases('IQuery', 'IAMLService');
