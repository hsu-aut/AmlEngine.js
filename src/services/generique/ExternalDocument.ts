// Port of Aml.Engine.Services.Generique.ExternalDocument (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { Guid } from '../../system/index.js';
import { HashSet, from } from '../../system/linq.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { CAEXDocument } from '../../engine/caex/CAEXDocument.js';

/**
 * A document referenced by external references, with the documents it references and the
 * documents referencing it.
 */
export class ExternalDocument {
  /** @internal The documents this document references. */
  readonly referenced = new HashSet<ExternalDocument>();

  /** @internal The documents referencing this document. */
  readonly referencedBy = new HashSet<ExternalDocument>();

  /** @internal The URLs under which the document was loaded (C# `URLs`). */
  readonly urLs = new HashSet<string | null>();

  /** @internal True if the document was loaded by the registry and is unloaded with it. */
  loaded: boolean;

  /** @internal */
  readonly caexDocument: CAEXDocument | null;

  /** @internal The file name of the document, or a new GUID if it has none. */
  readonly documentName: string;

  /**
   * @internal Creates an external document for the provided document. If load is true, the
   * document is registered as loaded and can be unloaded.
   */
  constructor(document: CAEXDocument, load: boolean) {
    this.loaded = load;
    this.caexDocument = document;
    this.documentName = !isNullOrEmpty(document.caexFile!.fileName) ? document.caexFile!.fileName! : Guid.newGuid().toString();
  }

  /**
   * @internal Removes the reference of `usingDocument` (of all documents, if null); when no document
   * references this one any more, removes its own references and calls `unload` for it.
   */
  remove(usingDocument: ExternalDocument | null, unload: (document: ExternalDocument) => void): void {
    if (usingDocument != null) {
      usingDocument.referenced.remove(this);
      this.referencedBy.remove(usingDocument);
    } else {
      for (const item of this.referencedBy) {
        item.referenced.remove(this);
      }
      this.referencedBy.clear();
    }
    if (this.referencedBy.count !== 0) {
      return;
    }
    for (const item2 of from(this.referenced).toList()) {
      item2.remove(this, unload);
    }
    this.referenced.clear();
    unload(this);
  }
}
