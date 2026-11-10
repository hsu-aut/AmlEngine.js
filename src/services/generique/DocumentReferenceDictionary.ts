// Port of Aml.Engine.Services.Generique.DocumentReferenceDictionary<T> (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import { Dictionary, from } from '../../system/linq.js';
import type { XDocument } from '../../xml/index.js';

/**
 * Allows a service to register the loaded XDocuments with additional information. The entries can
 * be used to decide that a service method providing an XML element is executable for the element's
 * document. If the documents are unloaded by the engine, the registry is updated (by the service,
 * which implements IXMLDocumentRegistry and calls {@link removeFromTable}).
 *
 * The keys are strong references, as in C#. `default(T)` of C# is the `defaultValue` of the
 * constructor: null for reference types, the default of a value type (a tuple) otherwise.
 */
export class DocumentReferenceDictionary<T> extends Dictionary<XDocument, T> {
  /** @internal Creates the value for a document which is not registered yet (C# field CreateNew). */
  createNew: ((document: CAEXDocument) => T) | null = null;

  private _lastUsedTable: T;

  private readonly _defaultValue: T;

  /** @param defaultValue `default(T)` of C#. */
  constructor(defaultValue: T = null as T) {
    super();
    this._defaultValue = defaultValue;
    this._lastUsedTable = defaultValue;
  }

  /**
   * Gets the registered information for the provided document; creates and registers it with
   * {@link createNew} when the document is not registered yet.
   * @param document The document.
   * @param removeDisposed If true, entries of documents without a CAEX document are removed first.
   */
  getOrLoadValue(document: XDocument | null, removeDisposed = false): T {
    if (document == null) {
      return this._defaultValue;
    }
    if (removeDisposed) {
      this.clearDisposed(document);
    }
    const r = this.tryGetValue(document);
    this._lastUsedTable = r.result ? (r.value as T) : this._defaultValue;
    if (r.result) {
      return this._lastUsedTable;
    }
    if (this.createNew === null) {
      return this._defaultValue;
    }
    const val = CAEXDocument.document(document.root);
    if (val === null) {
      return this._defaultValue;
    }
    this.add(document, (this._lastUsedTable = this.createNew(val)));
    return this._lastUsedTable;
  }

  /** Determines whether the specified document is registered. */
  isLoaded(document: XDocument): boolean {
    return this.tryGetValue(document).result;
  }

  /**
   * Removes the specified document from the table.
   * @param document The document.
   * @param action Invoked with the registered value before the document is removed.
   */
  removeFromTable(document: XDocument | null, action: ((value: T) => void) | null = null): boolean {
    if (document == null) {
      return false;
    }
    const r = this.tryGetValue(document);
    if (!r.result) {
      return false;
    }
    action?.(r.value as T);
    return this.remove(document);
  }

  /** Removes the entries of documents which have no CAEX document (any more), except `document`. */
  private clearDisposed(document: XDocument): void {
    const disposed = from(this.keys())
      .where((doc) => doc === null || CAEXDocument.document(doc.root) === null)
      .toList();
    for (const item of from(disposed).where((key) => key !== document)) {
      this.remove(item);
    }
  }
}
