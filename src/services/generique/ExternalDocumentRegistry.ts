// Port of Aml.Engine.Services.Generique.ExternalDocumentRegistry (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { XDocumentWrapper } from '../../engine/xml/XDocumentWrapper.js';
import { Dictionary, from } from '../../system/linq.js';
import { foldInvariantIgnoreCase, isNullOrEmpty } from '../../system/strings.js';
import { ExternalDocument } from './ExternalDocument.js';
import type { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import type { ExternalReferenceType } from '../../engine/caex/ExternalReferenceType.js';

/**
 * The part of System.Collections.Specialized.NameValueCollection the registry uses: the indexer
 * (`get`, and `set`, which replaces all values of the key by one value), `remove` and `clear`.
 * Keys are compared case-insensitively (InvariantCultureIgnoreCase); a null key is allowed.
 */
class NameValueCollection {
  private readonly _entries = new Map<string | null, string | null>();

  private static fold(name: string | null): string | null {
    return name === null ? null : foldInvariantIgnoreCase(name);
  }

  /** `this[name]`: the value, or null if the key does not exist. */
  get(name: string | null): string | null {
    return this._entries.get(NameValueCollection.fold(name)) ?? null;
  }

  /** `this[name] = value`. */
  set(name: string | null, value: string | null): void {
    this._entries.set(NameValueCollection.fold(name), value);
  }

  /** `Remove(name)`: removes all values of the key. */
  remove(name: string | null): void {
    this._entries.delete(NameValueCollection.fold(name));
  }

  clear(): void {
    this._entries.clear();
  }
}

/** The external documents loaded for external references, by URL and by document name. */
export class ExternalDocumentRegistry {
  private readonly _externalDocumentNamesByURL = new NameValueCollection();

  private readonly _externalDocumentsByName = new Dictionary<string, ExternalDocument>();

  constructor() {
    // C# passes Unload as a method group (Action<ExternalDocument>), which keeps its target.
    this.unload = this.unload.bind(this);
  }

  /** @internal The external document loaded from the URL, or null. */
  getFromURL(url: string | null): ExternalDocument | null {
    if (isNullOrEmpty(url)) {
      return null;
    }
    const text = this._externalDocumentNamesByURL.get(url);
    if (text === null) {
      return null;
    }
    return this.getFromName(text);
  }

  /** @internal The external document with the name, or null. */
  getFromName(name: string | null): ExternalDocument | null {
    if (isNullOrEmpty(name)) {
      return null;
    }
    return this._externalDocumentsByName.tryGetValue(name).value;
  }

  /**
   * @internal The loaded document of the external reference (null with a message if the reference
   * has no path or is not part of a document). Records that the document of the reference uses it.
   */
  getFromExternalReference(externalReference: ExternalReferenceType | null): { document: CAEXDocument | null; message: string | null } {
    const obj = externalReference;
    const text = obj != null ? obj.path : null;
    if (isNullOrEmpty(text)) {
      return { document: null, message: 'No Path in ExternalReference defined' };
    }
    if (externalReference!.document === null) {
      return { document: null, message: 'External Reference is not part of a Document' };
    }
    const fromURL = this.getFromURL(text);
    if (fromURL !== null) {
      const fromName = this.getFromName(externalReference!.caexDocument!.caexFile!.fileName);
      if (
        fromName !== null &&
        from(fromURL.referencedBy).firstOrDefault((r) => r.caexDocument!.xDocument === externalReference!.document) === null
      ) {
        fromURL.referencedBy.add(fromName);
        fromName.referenced.add(fromURL);
      }
    }
    return { document: fromURL?.caexDocument ?? null, message: null };
  }

  /**
   * @internal Registers the document loaded from the URL. If a document with the same file name is
   * registered already, the new document is unloaded and the registered one is used.
   */
  load(usingDocument: ExternalDocument | null, url: string | null, document: CAEXDocument): ExternalDocument {
    const r = this._externalDocumentsByName.tryGetValue(document.caexFile!.fileName as string);
    let value: ExternalDocument;
    if (!r.result) {
      value = new ExternalDocument(document, true);
      this._externalDocumentsByName.setItem(value.documentName, value);
    } else {
      value = r.value!;
      document.unload();
    }
    value.urLs.add(url);
    this._externalDocumentNamesByURL.set(url, value.documentName);
    if (usingDocument != null) {
      usingDocument.referenced.add(value);
      value.referencedBy.add(usingDocument);
    }
    return value;
  }

  /**
   * @internal Unloads an external document. C# overloads Unload(ExternalDocument),
   * Unload(string documentName) and Unload(XDocumentWrapper); null takes the first one.
   */
  unload(externalDocument: ExternalDocument | string | XDocumentWrapper | null): void {
    if (typeof externalDocument === 'string') {
      this.unloadByName(externalDocument);
      return;
    }
    if (externalDocument instanceof XDocumentWrapper) {
      this.unloadWrapper(externalDocument);
      return;
    }
    this.unloadExternalDocument(externalDocument as ExternalDocument);
  }

  /** Unload(ExternalDocument): unloading an external document. */
  private unloadExternalDocument(externalDocument: ExternalDocument): void {
    for (const uRL of externalDocument.urLs) {
      this._externalDocumentNamesByURL.remove(uRL);
    }
    this._externalDocumentsByName.remove(externalDocument.documentName);
    if (externalDocument.loaded) {
      externalDocument.loaded = false;
      externalDocument.caexDocument!.unload();
    }
  }

  /** Unload(string documentName). */
  private unloadByName(documentName: string): void {
    this.getFromName(documentName)?.remove(null, (d) => this.unload(d));
  }

  /** @internal Removes the reference of `usingDocument` to the external document. */
  remove(usingDocument: ExternalDocument | null, externalDocument: ExternalDocument): void {
    externalDocument.remove(usingDocument, (d) => this.unload(d));
  }

  /** @internal */
  clear(): void {
    this._externalDocumentNamesByURL.clear();
    this._externalDocumentsByName.clear();
  }

  /** Unload(XDocumentWrapper). */
  private unloadWrapper(document: XDocumentWrapper): void {
    const externalDocument = from(this._externalDocumentsByName.values()).firstOrDefault(
      (d) => d.caexDocument!.xDocument === document.xDocument,
    );
    if (externalDocument !== null) {
      externalDocument.loaded = false;
      externalDocument.remove(null, (d) => this.unload(d));
    }
  }
}
