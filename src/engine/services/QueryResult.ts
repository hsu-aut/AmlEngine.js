// Port of Aml.Engine.Services.QueryResult (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from, type Enumerable } from '../../system/linq.js';
import { ServiceLocator } from './ServiceLocator.js';
import type { CAEXBasicObject } from '../caex/CAEXBasicObject.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { ExternalInterfaceType } from '../caex/ExternalInterfaceType.js';
import type { InternalElementType } from '../caex/InternalElementType.js';
import type { InternalLinkType } from '../caex/InternalLinkType.js';
import type { SystemUnitClassType } from '../caex/SystemUnitClassType.js';
import type { ILookup } from './EmptyLookup.js';
import type { ICAEXReference } from './interfaces/ICAEXReference.js';

type Ctor<X> = abstract new (...args: never[]) => X;

function allReferences(queryResult: ILookup<string, ICAEXReference>): Enumerable<ICAEXReference> {
  return from(queryResult).selectMany((x) => x);
}

/** Extension methods for query results (lookups of CAEX references) and query shortcuts on documents. */
export class QueryResult {
  private constructor() {}

  /** All CAEX objects of the query result. */
  static allCaexObjects(queryResult: ILookup<string, ICAEXReference>): Enumerable<CAEXBasicObject | null> {
    return allReferences(queryResult).select((r) => r.caexObject);
  }

  static allElementsIdentifiedByCAEXPath(doc: CAEXDocument): ILookup<string, ICAEXReference> {
    return ServiceLocator.queryService.allElementsIdentifiedByCAEXPath(doc.caexFile!);
  }

  static allElementsWithAliasReference(doc: CAEXDocument): ILookup<string, ICAEXReference> {
    return ServiceLocator.queryService.allElementsWithAliasReference(doc.caexFile!);
  }

  static allElementsWithCAEXPathReference(doc: CAEXDocument): ILookup<string, ICAEXReference> {
    return ServiceLocator.queryService.allElementsWithCAEXPathReference(doc.caexFile!);
  }

  static allElementsWithIDReference(doc: CAEXDocument): ILookup<string, ICAEXReference> {
    return ServiceLocator.queryService.allElementsWithIDReference(doc.caexFile!);
  }

  static allElementsWithIDs(doc: CAEXDocument): ILookup<string, ICAEXReference> {
    return ServiceLocator.queryService.allElementsWithIDs(doc.caexFile!);
  }

  static allElementsWithNameReference(doc: CAEXDocument): ILookup<string, ICAEXReference> {
    return ServiceLocator.queryService.allElementsWithNameReference(doc.caexFile!);
  }

  /** All InternalElements of the document which are masters of mirrors. */
  static allInternalElementMasters(doc: CAEXDocument): Enumerable<InternalElementType> {
    const lookup = QueryResult.allElementsWithIDs(doc);
    // The method group ServiceLocator.QueryService.IsMaster is bound when the query is built.
    const queryService = ServiceLocator.queryService;
    return QueryResult.internalElements(lookup).where((e) => queryService.isMaster(e));
  }

  /** All InternalElement mirrors of the document. */
  static allInternalElementMirrors(doc: CAEXDocument): Enumerable<InternalElementType> {
    return QueryResult.internalElements(QueryResult.allElementsWithIDReference(doc)).concat(
      QueryResult.caexObjectsOfType(QueryResult.allElementsWithAliasReference(doc), T.InternalElementType as unknown as Ctor<InternalElementType>),
    );
  }

  /** The CAEX objects of the query result with the given type (C# CaexObjectsOfType<T>). */
  static caexObjectsOfType<X extends CAEXBasicObject>(queryResult: ILookup<string, ICAEXReference>, type: Ctor<X>): Enumerable<X> {
    return allReferences(queryResult)
      .select((r) => r.caexObject)
      .ofType(type);
  }

  static elementsWithAliasReference(doc: CAEXDocument, alias: string): Iterable<ICAEXReference> {
    return ServiceLocator.queryService.elementsWithAliasReference(doc.caexFile!, alias);
  }

  static elementsWithCAEXPathReference(doc: CAEXDocument, path: string | null): Iterable<ICAEXReference> {
    return ServiceLocator.queryService.elementsWithCAEXPathReference(doc.caexFile!, path);
  }

  static elementsWithIDReference(doc: CAEXDocument, ID: string | null): Iterable<ICAEXReference> {
    return ServiceLocator.queryService.elementsWithIDReference(doc.caexFile!, ID);
  }

  static elementsWithInternalLinkRelations(doc: CAEXDocument): Iterable<SystemUnitClassType> {
    return ServiceLocator.queryService.elementsWithInternalLinkRelations(doc.caexFile!);
  }

  /** The ExternalInterfaces of the query result. */
  static externalInterfaces(queryResult: ILookup<string, ICAEXReference>): Enumerable<ExternalInterfaceType> {
    return allReferences(queryResult)
      .select((r) => r.caexObject)
      .ofType(T.ExternalInterfaceType as unknown as Ctor<ExternalInterfaceType>);
  }

  static internalElementMirrors(master: InternalElementType): Iterable<InternalElementType> {
    return ServiceLocator.queryService.internalElementMirrors(master);
  }

  /** The InternalElements of the query result. */
  static internalElements(queryResult: ILookup<string, ICAEXReference>): Enumerable<InternalElementType> {
    return allReferences(queryResult)
      .select((r) => r.caexObject)
      .ofType(T.InternalElementType as unknown as Ctor<InternalElementType>);
  }

  /** The InternalLinks of the query result. */
  static internalLinks(queryResult: ILookup<string, ICAEXReference>): Enumerable<InternalLinkType> {
    return allReferences(queryResult)
      .select((r) => r.caexObject)
      .ofType(T.InternalLinkType as unknown as Ctor<InternalLinkType>);
  }

  static internalLinksToElement(systemUnitClass: SystemUnitClassType): Iterable<InternalLinkType> {
    return ServiceLocator.queryService.internalLinksToElement(systemUnitClass);
  }

  static internalLinksToInterface(externalInterface: ExternalInterfaceType): Iterable<InternalLinkType> {
    return ServiceLocator.queryService.internalLinksToInterface(externalInterface);
  }

  /** The CAEX objects of the references whose reference attribute has the given name. */
  static referencesWithName(queryResult: ILookup<string, ICAEXReference>, name: string | null): Enumerable<CAEXBasicObject | null> {
    return allReferences(queryResult)
      .where((e) => e.referenceAttributeName === name)
      .select((e) => e.caexObject);
  }
}
