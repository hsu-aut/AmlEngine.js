// Port of Aml.Engine.AmlObjects.AMLLibraryType<T> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from } from '../../system/linq.js';
import { SystemException } from '../../system/exceptions.js';
import { CAEXLibrary } from '../caex/CAEXLibrary.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { CAEXObject } from '../caex/CAEXObject.js';
import type { ISchemaTransform } from '../services/interfaces/ISchemaTransform.js';
import type { XElement } from '../../xml/index.js';

/** `new Exception(message)` of .NET (System.Exception). */
function exception(message: string): Error {
  const e = new SystemException(message);
  e.name = 'Exception';
  return e;
}

/**
 * A generic type definition for CAEX libraries which are defined by AutomationML and contain
 * standardized classes. The C# type argument `T` (the type of the library items) is passed at run
 * time as the class constructor `itemType` (last constructor argument).
 */
export class AMLLibraryType<TItem extends CAEXObject> extends CAEXLibrary<TItem> {
  /** The run time type argument: the class of the library items. */
  protected readonly itemType: abstract new (...args: never[]) => TItem;

  /**
   * Initializes a new instance.
   * @param libraryNode A CAEX library XML node.
   * @param itemType The class of the library items (C# type argument).
   */
  constructor(libraryNode: XElement | null, itemType: abstract new (...args: never[]) => TItem) {
    super(libraryNode);
    this.itemType = itemType;
  }

  /**
   * Gets the AutomationML class from this library which is identified by the provided CAEX path.
   * @param caexPath The CAEX path.
   * @returns The class, or `null`.
   */
  automationMLClass(caexPath: string): TItem | null {
    return from(CAEXBasicObjectExtensions.descendants(this, this.itemType)).firstOrDefault((c) => c.caexPath() === caexPath);
  }

  /**
   * @internal Loads an AutomationML library from an external source (the library document bytes)
   * and imports it with `importLibrary`. A library with another CAEX version is transformed with
   * the registered ISchemaTransform service.
   * @returns The imported library, or `null` if there is no resource.
   * @throws Exception the versions differ and no ISchemaTransform service is registered.
   */
  static loadExternalLibrary<TItem extends CAEXObject>(
    document: CAEXDocument,
    resource: Uint8Array | null,
    importLibrary: (doc: CAEXDocument) => CAEXLibrary<TItem> | null,
  ): CAEXLibrary<TItem> | null {
    if (resource == null) {
      return null;
    }
    let cAEXDocument = T.CAEXDocument.loadFromStream(resource);
    if (document.schema !== cAEXDocument.schema) {
      const service = ServiceLocator.getService<ISchemaTransform>('ISchemaTransform');
      if (service == null) {
        throw exception(
          'The current document and the imported library use different CAEX Versions; To do a schema transformation the service needs to be registered',
        );
      }
      T.CaexCommand.isSilent = true;
      cAEXDocument = service.transformTo(cAEXDocument, document.schema)!;
      T.CaexCommand.isSilent = false;
    }
    return importLibrary(cAEXDocument);
  }
}

T.AMLLibraryType = AMLLibraryType;
