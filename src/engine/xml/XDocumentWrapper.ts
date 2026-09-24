// Port of Aml.Engine.XML.XDocumentWrapper.

import { XName, XNamespace, XNode, saveXDocument, type XDocument } from '../../xml/index.js';
import { ArgumentNullException, NotSupportedException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { T } from '../registry.js';
import { implementsInterface, registerInterfaces } from '../interfaces.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import type { IDocument } from './IDocument.js';
import type { IXMLWrapper } from './IXMLWrapper.js';
import type { IXMLDocumentRegistry } from '../services/interfaces/IXMLDocumentRegistry.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
function syncModule<M>(name: string): M | null {
  return ((globalThis as any).process?.getBuiltinModule?.(name) as M | undefined) ?? null;
}

/**
 * Base class for the wrapping of an XDocument, providing schema specific document processing
 * utilities. Used by the engine for the CAEXDocument.
 */
export class XDocumentWrapper implements IDocument {
  /**
   * XDocument to wrapper (the static DocumentTable of the engine). A WeakMap, so that neither a
   * discarded XDocument nor its wrapper is kept alive by the table (see port notes).
   */
  private static readonly DocumentTable = new WeakMap<XDocument, XDocumentWrapper>();

  /**
   * Weak references to the registered wrappers, pruned of dead ones on each access. Only used for
   * the quirk that a node outside any document resolves to the only live document.
   */
  private static readonly LiveDocuments = new Set<WeakRef<XDocumentWrapper>>();

  private _disposedValue = false;

  private _xDocument: XDocument | null = null;

  /** Gets the underlying XDocument. */
  get xDocument(): XDocument | null {
    return this._xDocument;
  }

  /**
   * Initializes a new instance; the document is put into the registration table, if addToTable
   * is true.
   */
  protected constructor(xDocument: XDocument | null, addToTable = true) {
    if (xDocument !== null) {
      if (addToTable) {
        this.addXDocument(xDocument);
      } else {
        this._xDocument = xDocument;
      }
    }
  }

  /**
   * Gets the document wrapper which contains the specified XML node (XNode overload) or wrapped
   * object (IXMLWrapper overload). A null argument takes the XNode overload.
   */
  static document(node: XNode | IXMLWrapper | null): IDocument | null {
    if (node === null || node === undefined || node instanceof XNode) {
      return XDocumentWrapper.documentOfNode((node ?? null) as XNode | null);
    }
    return XDocumentWrapper.documentOfWrapper(node);
  }

  /** @internal `Document(XNode)`. */
  static documentOfNode(node: XNode | null): IDocument | null {
    XDocumentWrapper.checkReferences();
    const document = node?.document ?? null;
    if (document !== null) {
      return XDocumentWrapper.DocumentTable.get(document) ?? null;
    }
    const list: XDocumentWrapper[] = [];
    for (const d of XDocumentWrapper.LiveDocuments) {
      const target = d.deref();
      if (target !== undefined) list.push(target);
    }
    if (list.length !== 1) {
      return null;
    }
    return list[0];
  }

  /** @internal `Document(IXMLWrapper)`. */
  static documentOfWrapper(xObject: IXMLWrapper | null): IDocument | null {
    if ((xObject?.document ?? null) === null) {
      return null;
    }
    return XDocumentWrapper.documentOfNode(xObject!.node);
  }

  /**
   * Dispose() without argument; the protected Dispose(bool) with a boolean argument.
   */
  dispose(disposing?: boolean): void {
    if (disposing === undefined) {
      this.dispose(true);
      return;
    }
    if (!this._disposedValue) {
      if (disposing) {
        this.unload();
      }
      this._xDocument = null;
      this._disposedValue = true;
    }
  }

  /** Saves the document to the specified file path (Node only). */
  saveToFile(filename: string, prettyPrint: boolean): void {
    if (isNullOrEmpty(filename)) {
      throw new ArgumentNullException('filename');
    }
    const path = syncModule<typeof import('node:path')>('node:path');
    const fs = syncModule<typeof import('node:fs')>('node:fs');
    if (path === null || fs === null) {
      throw new NotSupportedException('Saving to a file requires Node.js.');
    }
    const fullPath = path.resolve(filename);
    fs.writeFileSync(fullPath, saveXDocument(this.xDocument!, { disableFormatting: !prettyPrint }));
  }

  /** Saves the document to a stream; returns the bytes of the stream. */
  saveToStream(prettyPrint: boolean): Uint8Array {
    return saveXDocument(this.xDocument!, { disableFormatting: !prettyPrint });
  }

  /** Unloads this document instance and removes it from the tables of all registered services. */
  unload(): void {
    if (this instanceof T.CAEXDocument) {
      ServiceLocator.defaultQueryService.unloadIDTable(this);
      ServiceLocator.defaultQueryService.unloadPathTable(this);
    }
    if (this.xDocument !== null) {
      XDocumentWrapper.removeDocument(this.xDocument);
    }
    this._xDocument = null;
  }

  /**
   * Gets the XName for the provided tag name, using the default namespace of the root element.
   */
  xName(tagname: string): XName {
    if (isNullOrEmpty(tagname)) {
      throw new ArgumentNullException('tagname');
    }
    const xNamespace = this.xDocument!.root?.getDefaultNamespace() ?? null;
    if (!(xNamespace === null) && !(xNamespace === XNamespace.None)) {
      return xNamespace.getName(tagname);
    }
    return XName.get(tagname);
  }

  /** @internal */
  addXDocument(xDocument: XDocument): void {
    this._xDocument = xDocument;
    XDocumentWrapper.addDocument(this);
  }

  private static addDocument(document: XDocumentWrapper | null): void {
    if (document === null) {
      throw new ArgumentNullException('document');
    }
    const xDocument = document.xDocument!;
    const previous = XDocumentWrapper.DocumentTable.get(xDocument);
    if (previous !== undefined) {
      XDocumentWrapper.forgetWrapper(previous);
    }
    XDocumentWrapper.DocumentTable.set(xDocument, document);
    XDocumentWrapper.LiveDocuments.add(new WeakRef(document));
    XDocumentWrapper.checkReferences();
  }

  /** Drops the weak references of dead wrappers (their table entries are gone with them). */
  private static checkReferences(): void {
    for (const ref of [...XDocumentWrapper.LiveDocuments]) {
      if (ref.deref() === undefined) XDocumentWrapper.LiveDocuments.delete(ref);
    }
  }

  private static forgetWrapper(wrapper: XDocumentWrapper): void {
    for (const ref of [...XDocumentWrapper.LiveDocuments]) {
      const target = ref.deref();
      if (target === undefined || target === wrapper) XDocumentWrapper.LiveDocuments.delete(ref);
    }
  }

  private static removeDocument(xDocument: XDocument | null, checkReferences = true): void {
    if (xDocument === null) {
      throw new ArgumentNullException('xDocument');
    }
    const wrapper = XDocumentWrapper.DocumentTable.get(xDocument);
    if (wrapper === undefined) {
      return;
    }
    XDocumentWrapper.DocumentTable.delete(xDocument);
    XDocumentWrapper.forgetWrapper(wrapper);
    for (const item of ServiceLocator.servicesDictionary.values()) {
      if (implementsInterface(item, 'IXMLDocumentRegistry')) {
        (item as unknown as IXMLDocumentRegistry).removeDocument(new XDocumentWrapper(xDocument, false));
      }
    }
    if (checkReferences) {
      XDocumentWrapper.checkReferences();
    }
  }
}

registerInterfaces(XDocumentWrapper as unknown as abstract new () => unknown, 'IDocument', 'IDisposable');
T.XDocumentWrapper = XDocumentWrapper;
