// Port of Aml.Engine.Services.Generique.DocumentReference (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import type { XDocument } from '../../xml/index.js';

/**
 * A weak reference to a CAEX document (C# `WeakReference`, here a `WeakRef`). The class is not used
 * by the services of the package.
 */
export class DocumentReference {
  /** C# `new WeakReference(null)` is allowed and never alive; `WeakRef` needs an object. */
  private readonly caexDocumentReference: WeakRef<CAEXDocument> | null;

  /** @internal True as long as the referenced document has not been collected. */
  get isAlive(): boolean {
    return this.caexDocumentReference?.deref() !== undefined;
  }

  /** @internal The referenced document, or null when it has been collected. */
  get caexDocument(): CAEXDocument | null {
    const target = this.caexDocumentReference?.deref() ?? null;
    return target instanceof CAEXDocument ? target : null;
  }

  /** @internal The XDocument of the referenced document. */
  get xDocument(): XDocument | null {
    const cAEXDocument = this.caexDocument;
    if (cAEXDocument === null) {
      return null;
    }
    return cAEXDocument.xDocument;
  }

  /** @internal */
  constructor(document: CAEXDocument | null) {
    this.caexDocumentReference = document == null ? null : new WeakRef(document);
  }
}
