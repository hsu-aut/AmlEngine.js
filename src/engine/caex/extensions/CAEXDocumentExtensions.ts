// Port of Aml.Engine.CAEX.Extensions.CAEXDocumentExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { from } from '../../../system/linq.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import type { CAEXDocument } from '../CAEXDocument.js';
import type { CAEXObject } from '../CAEXObject.js';
import type { ExternalReferenceType } from '../ExternalReferenceType.js';
import type { RevisionType } from '../RevisionType.js';

type Ctor = abstract new (...args: never[]) => unknown;

/** Extension methods for the CAEXDocument. */
export class CAEXDocumentExtensions {
  private constructor() {}

  /** Gets the external reference with the provided alias. */
  static externalReferenceFromAlias(document: CAEXDocument | null, alias: string | null): ExternalReferenceType | null {
    if (document == null) {
      return null;
    }
    return from<ExternalReferenceType>(document.caexFile!.externalReference).firstOrDefault((external) => external.alias === alias);
  }

  /** Determines whether the document is an extension document (a revision of an object is an extension). */
  static isExtensionDocument(document: CAEXDocument): boolean {
    return from<CAEXObject>(document.caexFile!).any((c) => from<RevisionType>(c.revision).any((r) => r.isExtension));
  }

  /** Determines whether the document contains class libraries. */
  static hasLibraries(document: CAEXDocument | null): boolean {
    if (document == null) {
      return false;
    }
    return from<CAEXObject>(document.caexFile!).any((x) =>
      x instanceof T.RoleClassLibType || x instanceof T.SystemUnitClassLibType || x instanceof T.InterfaceClassLibType || x instanceof T.AttributeTypeLibType
        ? true
        : false,
    );
  }

  /** Finds the CAEX object with the provided ID (delegates to the registered query service). */
  static findByID(document: CAEXDocument | null, id: string | null, resolveAlias = true, elementType: Ctor | null = null): CAEXObject | null {
    return ServiceLocator.queryService!.findByID(document, id, resolveAlias, elementType);
  }

  /** Finds the CAEX object with the provided CAEX path (delegates to the registered query service). */
  static findByPath(document: CAEXDocument | null, caexPath: string | null, resolveAlias = true, classType: Ctor | null = null): CAEXObject | null {
    return ServiceLocator.queryService!.findByPath(document, caexPath, resolveAlias, classType);
  }
}
