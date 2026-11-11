// Port of Aml.Engine.Services.ExternalReferenceResolver (Aml.Engine.Services 4.3.1).
//
// Asynchronous and synchronous methods: the …Async methods are asynchronous as in C# and use
// fetch for http(s) addresses (through the GitHub service for GitHub addresses) and node:fs for
// local files. Each synchronous method of the C# class calls `XxxAsync(...).Result`; here it runs
// the same steps without awaiting (local files complete synchronously in C# as well). Where the
// C# code awaits an http(s) request (GetResponseFromWebServerAsync), the synchronous twin takes the
// path of the catch block around that await, with the message of a NotSupportedException saying
// that synchronous network access is not possible. Such a failure comes from the platform, not from
// the address, so the address is not recorded as unresolved: a later asynchronous call loads it.
// FTP (FtpWebRequest) is not supported: both twins take the failure path of the C# FTP branches.
//
// The lock: SemaphoreSlim(1, 1) is an AsyncLock. RemoveDocument defers removals while the lock is
// held (unless MakePendingRemove is running), as in C#. A synchronous twin cannot wait for the lock:
// it takes the lock when it is free; while an asynchronous call holds it (that call is suspended at
// an await), the synchronous call runs at once without it, where C# would block until the lock is
// released.
//
// HttpClient becomes fetch (one request per call with the headers the C# code sets on its static
// client), HttpResponseMessage becomes the fetch Response; a response that is not read is
// disposed by cancelling its body.

import '../engine/index.js';
import { registerInterfaces } from '../engine/interfaces.js';
import { fileExists, getFileName, isPathRooted } from '../engine/amlobjects/internal/NetPath.js';
import { CAEXDocument } from '../engine/caex/CAEXDocument.js';
import { CAEXWrapper } from '../engine/caex/CAEXWrapper.js';
import { CAEXBasicObjectExtensions } from '../engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXPathBuilder } from '../engine/caex/extensions/CAEXPathBuilder.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { XmlCAEXSchema } from '../engine/xmlext/XmlCAEXSchema.js';
import { AsyncLock } from '../system/AsyncLock.js';
import { toBase64String } from '../system/Convert.js';
import { InvalidOperationException, NotSupportedException } from '../system/exceptions.js';
import { from } from '../system/linq.js';
import { foldInvariantIgnoreCase, isNullOrEmpty } from '../system/strings.js';
import { Uri, UriComponents, UriFormat, UriKind } from '../system/Uri.js';
import { DocumentReferenceDictionary } from './generique/DocumentReferenceDictionary.js';
import { ExternalDocument } from './generique/ExternalDocument.js';
import { ExternalDocumentRegistry } from './generique/ExternalDocumentRegistry.js';
import { ValidatorService } from './ValidatorService.js';
import type { XDocument, XElement } from '../xml/index.js';
import type { CAEXFileType } from '../engine/caex/CAEXFileType.js';
import type { CAEXSequence } from '../engine/caex/CAEXSequence.js';
import type { ExternalReferenceType } from '../engine/caex/ExternalReferenceType.js';
import type { XDocumentWrapper } from '../engine/xml/XDocumentWrapper.js';
import type { IAMLService } from '../engine/services/interfaces/IAMLService.js';
import type { IExternalReferenceResolver } from '../engine/services/interfaces/IExternalReferenceResolver.js';
import type { IExternalReferenceResolverAsync } from '../engine/services/interfaces/IExternalReferenceResolverAsync.js';
import type { IXMLDocumentRegistry } from '../engine/services/interfaces/IXMLDocumentRegistry.js';
import type { IXMLExternalUnload } from '../engine/services/interfaces/IXMLExternalUnload.js';

/** A loaded document or a message (the C# tuple `(CAEXDocument Document, string Message)`). */
type DocumentResult = { document: CAEXDocument | null; message: string | null };

const UriSchemeFile = 'file';
const UriSchemeFtp = 'ftp';
const UriSchemeHttp = 'http';
const UriSchemeHttps = 'https';

/** Exception.Message of a caught error. */
function exceptionMessage(ex: unknown): string {
  return ex instanceof Error ? ex.message : String(ex);
}

/** The exception a synchronous method takes the place of an http(s) request with. */
function syncNetworkException(uri: Uri): NotSupportedException {
  return new NotSupportedException(`Synchronous access to '${uri}' needs the network; use the asynchronous methods.`);
}

/** The names of System.Net.HttpStatusCode (.NET 8) as HttpStatusCode.ToString() gives them. */
const httpStatusCodeNames = new Map<number, string>([
  [100, 'Continue'], [101, 'SwitchingProtocols'], [102, 'Processing'], [103, 'EarlyHints'],
  [200, 'OK'], [201, 'Created'], [202, 'Accepted'], [203, 'NonAuthoritativeInformation'], [204, 'NoContent'],
  [205, 'ResetContent'], [206, 'PartialContent'], [207, 'MultiStatus'], [208, 'AlreadyReported'], [226, 'IMUsed'],
  [300, 'MultipleChoices'], [301, 'MovedPermanently'], [302, 'Found'], [303, 'SeeOther'], [304, 'NotModified'],
  [305, 'UseProxy'], [306, 'Unused'], [307, 'RedirectKeepVerb'], [308, 'PermanentRedirect'],
  [400, 'BadRequest'], [401, 'Unauthorized'], [402, 'PaymentRequired'], [403, 'Forbidden'], [404, 'NotFound'],
  [405, 'MethodNotAllowed'], [406, 'NotAcceptable'], [407, 'ProxyAuthenticationRequired'], [408, 'RequestTimeout'],
  [409, 'Conflict'], [410, 'Gone'], [411, 'LengthRequired'], [412, 'PreconditionFailed'], [413, 'RequestEntityTooLarge'],
  [414, 'RequestUriTooLong'], [415, 'UnsupportedMediaType'], [416, 'RequestedRangeNotSatisfiable'],
  [417, 'ExpectationFailed'], [421, 'MisdirectedRequest'], [422, 'UnprocessableEntity'], [423, 'Locked'],
  [424, 'FailedDependency'], [426, 'UpgradeRequired'], [428, 'PreconditionRequired'], [429, 'TooManyRequests'],
  [431, 'RequestHeaderFieldsTooLarge'], [451, 'UnavailableForLegalReasons'],
  [500, 'InternalServerError'], [501, 'NotImplemented'], [502, 'BadGateway'], [503, 'ServiceUnavailable'],
  [504, 'GatewayTimeout'], [505, 'HttpVersionNotSupported'], [506, 'VariantAlsoNegotiates'],
  [507, 'InsufficientStorage'], [508, 'LoopDetected'], [510, 'NotExtended'], [511, 'NetworkAuthenticationRequired'],
]);

/** `{response?.StatusCode}` in an interpolated string: the enum name, the number for an unnamed code, "" for null. */
function statusCodeText(response: Response | null): string {
  if (response === null) {
    return '';
  }
  return httpStatusCodeNames.get(response.status) ?? String(response.status);
}

/** Disposing an HttpResponseMessage: the body of an unread response is cancelled. */
function disposeResponse(response: Response | null): void {
  if (response !== null && !response.bodyUsed) {
    void response.body?.cancel().catch(() => undefined);
  }
}

/** Encoding.ASCII.GetBytes: characters above U+007F become '?'. */
function asciiBytes(s: string): Uint8Array {
  const bytes: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    bytes.push(c < 0x80 ? c : 0x3f);
  }
  return new Uint8Array(bytes);
}

/**
 * The part of System.Collections.Specialized.NameValueCollection used for the redirections: the
 * indexer (`item`: the value or null for a missing key; `setItem`: replaces all values of the key
 * by one value), `remove` and `clear`. Keys compare case-insensitively (InvariantCultureIgnoreCase);
 * a null key is allowed.
 */
class NameValueCollection {
  private readonly _entries = new Map<string | null, string | null>();

  private static fold(name: string | null): string | null {
    return name === null || name === undefined ? null : foldInvariantIgnoreCase(name);
  }

  item(name: string | null): string | null {
    return this._entries.get(NameValueCollection.fold(name)) ?? null;
  }

  setItem(name: string | null, value: string | null): void {
    this._entries.set(NameValueCollection.fold(name), value);
  }

  remove(name: string | null): void {
    this._entries.delete(NameValueCollection.fold(name));
  }

  clear(): void {
    this._entries.clear();
  }
}

/**
 * A disposable that restores the synchronization context (C# struct). JavaScript has no
 * synchronization context, so dispose does nothing.
 */
export class ExternalReferenceResolver_NoSynchronizationContextScope_DisposableSynchronizationContext {
  private readonly _synchronizationContext: unknown;

  /** Creates the disposable for the context to restore (always null here). */
  constructor(synchronizationContext: unknown = null) {
    this._synchronizationContext = synchronizationContext;
  }

  /** Dispose: SynchronizationContext.SetSynchronizationContext(context), nothing to do here. */
  dispose(): void {}
}

/** Used to run async methods without synchronization context (no effect in JavaScript). */
export class ExternalReferenceResolver_NoSynchronizationContextScope {
  private constructor() {}

  static readonly DisposableSynchronizationContext = ExternalReferenceResolver_NoSynchronizationContextScope_DisposableSynchronizationContext;

  /** Enters the scope; dispose the result to leave it. */
  static enter(): ExternalReferenceResolver_NoSynchronizationContextScope_DisposableSynchronizationContext {
    return new ExternalReferenceResolver_NoSynchronizationContextScope_DisposableSynchronizationContext(null);
  }
}

/**
 * This class implements the IExternalReferenceResolverAsync service interface. With this service
 * it is possible to access CAEX objects which are outsourced into external documents and
 * referenced using alias names. Normally the service is located by other services like query
 * services. They can call this service to resolve an external reference if an alias is part of a
 * CAEX path in any query.
 */
export class ExternalReferenceResolver
  implements IExternalReferenceResolverAsync, IExternalReferenceResolver, IAMLService, IXMLDocumentRegistry, IXMLExternalUnload
{
  static readonly NoSynchronizationContextScope = ExternalReferenceResolver_NoSynchronizationContextScope;

  /** Redirection table, allowing external reference paths redirected to other locations. */
  private readonly _redirections = new NameValueCollection();

  /**
   * The document registration containing the documents referencing externals. The name of a
   * document is used as the additional identifying key.
   */
  private readonly _referenceDictionary: DocumentReferenceDictionary<ExternalDocument | null>;

  /** The registry for all external documents. */
  private readonly _externalDocumentRegistry: ExternalDocumentRegistry;

  private readonly _unresolvedExternalDocumentByURL = new Set<string | null>();

  private readonly semaphore = new AsyncLock(1, 1);

  private _resolverFunction: ((url: string) => CAEXDocument | null) | null = null;

  private message = '';

  /** ConcurrentBag<XDocumentWrapper>: enumerated from the most recently added document. */
  private _removedDocuments: XDocumentWrapper[] = [];

  private _allowAccess = false;

  /**
   * Set by documentFromURL: the last synchronous load failed only because the address needs the
   * network (port only; such an address is not recorded in _unresolvedExternalDocumentByURL).
   */
  private _syncNetworkFailure = false;

  private constructor() {
    this._externalDocumentRegistry = new ExternalDocumentRegistry();
    this._referenceDictionary = new DocumentReferenceDictionary<ExternalDocument | null>();
    this._referenceDictionary.createNew = (d: CAEXDocument) => this.load(d);
  }

  /** Loads a new external document for a loaded CAEX document. */
  private load(d: CAEXDocument): ExternalDocument {
    const fromName = this._externalDocumentRegistry.getFromName(d.caexFile!.fileName);
    if (fromName !== null) {
      return fromName;
    }
    return new ExternalDocument(d, false);
  }

  /** Registers a service to resolve external references; returns the registered service. */
  static register(): ExternalReferenceResolver {
    const externalReferenceResolver = new ExternalReferenceResolver();
    ServiceLocator.register(externalReferenceResolver, ExternalReferenceResolver as unknown as abstract new () => unknown);
    return externalReferenceResolver;
  }

  /** Unregisters this service. */
  static unRegister(): void {
    const externalReferenceResolver = ServiceLocator.externalReferenceResolverService;
    if (externalReferenceResolver instanceof ExternalReferenceResolver) {
      externalReferenceResolver.unloadAllDocuments();
    }
    // Aml.Engine: Register stores the service under the key "ExternalReferenceResolver" and this
    // removes the key "IExternalReferenceResolver", so the service stays registered.
    ServiceLocator.unRegister('IExternalReferenceResolver');
  }

  /** Determines whether the external address can be resolved to a server or a physical file. */
  canResolve(externalAddress: string): boolean {
    return this.canAccess(externalAddress);
  }

  /** Asynchronously determines whether the external address can be resolved. */
  async canResolveAsync(externalAddress: string): Promise<boolean> {
    return await this.canAccessAsync(externalAddress);
  }

  /** Clears the redirection of the address (C# overloads ClearRedirection(address) and ClearRedirection()). */
  clearRedirection(address?: string | null): void {
    if (arguments.length === 0) {
      this._redirections.clear();
      return;
    }
    this._redirections.remove(address ?? null);
  }

  /** Determines whether the element is contained in a resolved external document. */
  isExternal(document: CAEXDocument | null, element: XElement): { result: boolean; alias: string | null; path: string | null } {
    let alias: string | null = null;
    let path: string | null = null;
    const val = XmlCAEXSchema.caexDocument(element);
    if (val === null || document === val) {
      return { result: false, alias, path };
    }
    const fromName = this._externalDocumentRegistry.getFromName(val.caexFile!.fileName);
    if (fromName === null) {
      return { result: false, alias, path };
    }
    if (document === null && fromName.referencedBy.count > 0) {
      document = from(fromName.referencedBy).firstOrDefault()?.caexDocument ?? null;
      path = from(fromName.urLs).firstOrDefault();
    }
    let obj: CAEXSequence<ExternalReferenceType> | null;
    if (document === null) {
      obj = null;
    } else {
      const cAEXFile = document.caexFile;
      obj = cAEXFile !== null ? cAEXFile.externalReference : null;
    }
    const val2 = obj;
    if (val2 === null) {
      return { result: true, alias, path };
    }
    for (const item of val2) {
      const fileName = getFileName(item.path);
      if (isNullOrEmpty(fileName)) {
        continue;
      }
      for (const uRL of fromName.urLs) {
        if ((uRL as string).includes(fileName)) {
          alias = item.alias;
          path = item.path;
          return { result: true, alias, path };
        }
      }
    }
    return { result: true, alias, path };
  }

  /**
   * Loads an outsourced CAEX document (C# overloads LoadOrGetReferencedDocument(externalReference)
   * and LoadOrGetReferencedDocument(document, caexObjectPath)). With an ExternalReference the
   * document is loaded from its path as a new stand-alone document: no libraries are merged into the
   * referencing document and no reference is changed (a merge is the job of an IMerge service). If
   * a document for the reference is loaded already, it is returned. With a document and a CAEX path
   * that contains an alias, the document is loaded from the ExternalReference with that alias.
   */
  loadOrGetReferencedDocument(externalReferenceOrDocument: ExternalReferenceType | CAEXDocument | null, caexObjectPath?: string | null): DocumentResult {
    if (arguments.length >= 2 || externalReferenceOrDocument instanceof CAEXDocument) {
      const result: DocumentResult = { document: null, message: null };
      if (!isNullOrEmpty(caexObjectPath)) {
        return this.loadOrGetReferencedDocumentForPath(externalReferenceOrDocument as CAEXDocument | null, caexObjectPath);
      }
      return result;
    }
    const externalReference = externalReferenceOrDocument as ExternalReferenceType;
    const { document: val, message: text } = this._externalDocumentRegistry.getFromExternalReference(externalReference);
    if (val !== null) {
      return { document: val, message: null };
    }
    if (text !== null) {
      return { document: null, message: text };
    }
    return this.loadOrGetReferencedDocumentForReference(externalReference);
  }

  private redirectionAddress(externalAddress: string | null): { result: string | null; isFile: boolean; isRedirected: boolean } {
    const isRedirected = true;
    let text: string | null;
    // Guard of the port: a redirection of an absolute (not file) address to itself loops forever
    // in C# (see docs/deviations.md, calls that do not return).
    const visited = new Set<string | null>();
    while (true) {
      text = this._redirections.item(externalAddress);
      if (isNullOrEmpty(text)) {
        // Aml.Engine: after following a redirection to an absolute address that is not a file,
        // isRedirected becomes false here, so GetAddressWithRedirection returns the original
        // address and the redirection is ignored.
        return { result: externalAddress, isFile: false, isRedirected: false };
      }
      const result = Uri.tryCreate(text, UriKind.Absolute);
      if (result === null) {
        break;
      }
      if (result.scheme === UriSchemeFile) {
        return { result: result.localPath, isFile: true, isRedirected };
      }
      visited.add(externalAddress);
      externalAddress = text;
      if (visited.has(externalAddress)) {
        throw new InvalidOperationException(`The redirection of '${externalAddress}' leads back to itself.`);
      }
    }
    return { result: text, isFile: true, isRedirected };
  }

  /** @internal The address of the URL after applying the registered redirections. */
  getAddressWithRedirection(url: string | null, currentFile: CAEXFileType | null): string | null {
    const { result, isFile, isRedirected } = this.redirectionAddress(url);
    let text = result;
    if (!isRedirected) {
      return url;
    }
    if (isFile && !isPathRooted(text)) {
      if (CAEXWrapper.equals(currentFile, null)) {
        return url;
      }
      let text2 = ValidatorService.normalizeFilePath(text, currentFile);
      if (fileExists(text2)) {
        text = text2;
      } else if (text2.includes('_AMLExternalLibraries\\_AMLExternalLibraries')) {
        text2 = text2.replaceAll('_AMLExternalLibraries\\_AMLExternalLibraries', '_AMLExternalLibraries');
        if (fileExists(text2)) {
          text = text2;
        }
      }
    }
    return text;
  }

  /**
   * Asynchronous variant of loadOrGetReferencedDocument (C# overloads
   * LoadOrGetReferencedDocumentAsync(externalReference) and (document, caexPath)): the loaded
   * document, if it was found; otherwise an error message.
   */
  async loadOrGetReferencedDocumentAsync(externalReferenceOrDocument: ExternalReferenceType | CAEXDocument | null, caexPath?: string | null): Promise<DocumentResult> {
    if (arguments.length >= 2 || externalReferenceOrDocument instanceof CAEXDocument) {
      return await this.loadOrGetReferencedDocumentForPathAsync(externalReferenceOrDocument as CAEXDocument | null, caexPath ?? null);
    }
    const externalReference = externalReferenceOrDocument as ExternalReferenceType;
    try {
      await this.semaphore.waitAsync();
      const fromExternalReference = this._externalDocumentRegistry.getFromExternalReference(externalReference);
      if (fromExternalReference.document !== null || fromExternalReference.message !== null) {
        return fromExternalReference;
      }
      const address = this.getAddressWithRedirection(externalReference.path, CAEXBasicObjectExtensions.caexFile(externalReference));
      this.message = "can't find file for " + (address ?? '');
      if (this._unresolvedExternalDocumentByURL.has(address)) {
        return { document: null, message: this.message };
      }
      let val = await this.documentFromURLAsync(
        address,
        (filePath: string | null) => ValidatorService.normalizeFilePath(filePath, CAEXBasicObjectExtensions.caexFile(externalReference)),
        true,
      );
      if (val === null) {
        this._unresolvedExternalDocumentByURL.add(address);
        return { document: null, message: this.message };
      }
      val = this.registerExternalDocument(externalReference, val, address as string);
      return { document: val, message: null };
    } catch (ex) {
      return { document: null, message: exceptionMessage(ex) };
    } finally {
      this.makePendingRemove();
      this.semaphore.release();
    }
  }

  /**
   * LoadOrGetReferencedDocumentAsync(externalReference).Result: the same steps without awaiting.
   * The lock is taken when it is free; otherwise the call runs without it (it cannot wait).
   */
  private loadOrGetReferencedDocumentForReference(externalReference: ExternalReferenceType): DocumentResult {
    const entered = this.semaphore.tryWait();
    try {
      const fromExternalReference = this._externalDocumentRegistry.getFromExternalReference(externalReference);
      if (fromExternalReference.document !== null || fromExternalReference.message !== null) {
        return fromExternalReference;
      }
      const address = this.getAddressWithRedirection(externalReference.path, CAEXBasicObjectExtensions.caexFile(externalReference));
      this.message = "can't find file for " + (address ?? '');
      if (this._unresolvedExternalDocumentByURL.has(address)) {
        return { document: null, message: this.message };
      }
      let val = this.documentFromURL(
        address,
        (filePath: string | null) => ValidatorService.normalizeFilePath(filePath, CAEXBasicObjectExtensions.caexFile(externalReference)),
        true,
      );
      if (val === null) {
        // Port: not recorded when only the synchronous network access failed (see the header).
        if (!this._syncNetworkFailure) {
          this._unresolvedExternalDocumentByURL.add(address);
        }
        return { document: null, message: this.message };
      }
      val = this.registerExternalDocument(externalReference, val, address as string);
      return { document: val, message: null };
    } catch (ex) {
      return { document: null, message: exceptionMessage(ex) };
    } finally {
      this.makePendingRemove();
      if (entered) {
        this.semaphore.release();
      }
    }
  }

  private makePendingRemove(): void {
    this._allowAccess = true;
    for (const removedDocument of [...this._removedDocuments].reverse()) {
      this.removeDocument(removedDocument);
    }
    this._removedDocuments = [];
    this._allowAccess = false;
  }

  /** LoadOrGetReferencedDocumentAsync(document, caexPath). */
  private async loadOrGetReferencedDocumentForPathAsync(document: CAEXDocument | null, caexPath: string | null): Promise<DocumentResult> {
    const r = this.externalReferenceForPath(document, caexPath);
    return r.externalReference !== null ? await this.loadOrGetReferencedDocumentAsync(r.externalReference) : r.failure!;
  }

  /** LoadOrGetReferencedDocumentAsync(document, caexPath).Result. */
  private loadOrGetReferencedDocumentForPath(document: CAEXDocument | null, caexPath: string | null): DocumentResult {
    const r = this.externalReferenceForPath(document, caexPath);
    return r.externalReference !== null ? this.loadOrGetReferencedDocumentForReference(r.externalReference) : r.failure!;
  }

  /**
   * The synchronous part of LoadOrGetReferencedDocumentAsync(document, caexPath): the
   * ExternalReference with the alias of the path, or the result for a path without it.
   */
  private externalReferenceForPath(
    document: CAEXDocument | null,
    caexPath: string | null,
  ): { externalReference: ExternalReferenceType | null; failure: DocumentResult | null } {
    if (document === null || isNullOrEmpty(caexPath)) {
      return { externalReference: null, failure: { document: null, message: 'No path defined' } };
    }
    if (!CAEXPathBuilder.isReferenceWithAlias(caexPath, document.schema)) {
      return { externalReference: null, failure: { document: null, message: 'CAEXPath shall contain an alias' } };
    }
    const alias = CAEXPathBuilder.aliasFromReference(caexPath, document.schema);
    const val = from(document.caexFile!.externalReference).firstOrDefault((e) => e.alias === alias);
    return !CAEXWrapper.equals(val, null)
      ? { externalReference: val, failure: null }
      : { externalReference: null, failure: { document: null, message: 'No reference found for ' + (alias ?? '') } };
  }

  /** Checks whether the external reference is registered already. */
  isExternalReferenceRegistered(externalReference: ExternalReferenceType | null, path: string | null): boolean {
    const val = externalReference != null ? externalReference.caexDocument : null;
    if (val === null) {
      return false;
    }
    const r = this._referenceDictionary.tryGetValue(val.xDocument as XDocument);
    if (r.result) {
      if (r.value !== null) {
        return this._externalDocumentRegistry.getFromURL(path) !== null;
      }
      return false;
    }
    return false;
  }

  /** Registers a CAEX document, referenced by the external reference, as an external document; returns the registered document. */
  registerExternalDocument(externalReference: ExternalReferenceType | null, document: CAEXDocument, path: string): CAEXDocument | null {
    const val = externalReference != null ? externalReference.caexDocument : null;
    let value: ExternalDocument | null = null;
    if (val !== null) {
      const r = this._referenceDictionary.tryGetValue(val.xDocument as XDocument);
      value = r.value;
      if (!r.result) {
        value = this._externalDocumentRegistry.getFromName(val.caexFile!.fileName);
        if (value === null) {
          value = this._referenceDictionary.getOrLoadValue(externalReference!.document);
        }
      }
    }
    return this._externalDocumentRegistry.load(value, path, document).caexDocument;
  }

  /** Asynchronous variant of registerExternalDocument (returns the provided document on failure). */
  async registerExternalDocumentAsync(externalReference: ExternalReferenceType | null, document: CAEXDocument, path: string): Promise<CAEXDocument | null> {
    try {
      await this.semaphore.waitAsync();
      const val = externalReference != null ? externalReference.caexDocument : null;
      let value: ExternalDocument | null = null;
      if (val !== null) {
        const r = this._referenceDictionary.tryGetValue(val.xDocument as XDocument);
        value = r.value;
        if (!r.result) {
          value = this._externalDocumentRegistry.getFromName(val.caexFile!.fileName);
          if (value === null) {
            value = this._referenceDictionary.getOrLoadValue(externalReference!.document);
          }
        }
      }
      return this._externalDocumentRegistry.load(value, path, document).caexDocument;
    } catch {
      return document;
    } finally {
      this.semaphore.release();
    }
  }

  /**
   * Registers a custom function to resolve any external reference path to a CAEXDocument. The
   * service calls it if no document can be found otherwise.
   */
  registerResolverFunction(resolverFunction: ((url: string) => CAEXDocument | null) | null): void {
    this._resolverFunction = resolverFunction;
  }

  /** Removes the document from the internal registry of the service. */
  removeDocument(document: XDocumentWrapper): void {
    if (this.semaphore.currentCount === 0 && !this._allowAccess) {
      this._removedDocuments.push(document);
    } else if (
      !this._referenceDictionary.removeFromTable(document.xDocument, (e: ExternalDocument | null) => {
        e!.remove(null, (d: ExternalDocument) => this._externalDocumentRegistry.unload(d));
      })
    ) {
      this._externalDocumentRegistry.unload(document);
    }
  }

  /** Gets all already resolved externals of the provided CAEX document containing ExternalReference objects. */
  *resolvedDocuments(documentWithExternals: CAEXDocument): Generator<CAEXDocument> {
    const list = from(documentWithExternals.caexFile!.externalReference)
      .select((e) => e.path)
      .toList();
    for (const item of list) {
      const fromURL = this._externalDocumentRegistry.getFromURL(item);
      if (fromURL !== null) {
        yield fromURL.caexDocument as CAEXDocument;
      }
    }
  }

  /**
   * Resolves a CAEX document referenced by the URL; if it cannot be resolved, a message is
   * returned. With useCache (the default) the resolver tries the cached documents first.
   * Registered redirection addresses are ignored by this method.
   */
  resolveExternalDocument(url: string | null, useCache = true): DocumentResult {
    let fromURL: ExternalDocument | null;
    if (useCache && (fromURL = this._externalDocumentRegistry.getFromURL(url)) !== null) {
      // Aml.Engine: a cached document comes with the message field (the message of an earlier
      // call, initially "") instead of null.
      return { document: fromURL.caexDocument, message: this.message };
    }
    // ResolveExternalDocumentAsync(url, useCache).Result: the same steps without awaiting.
    if (useCache) {
      let fromURL2: ExternalDocument | null;
      if ((fromURL2 = this._externalDocumentRegistry.getFromURL(url)) !== null) {
        return { document: fromURL2.caexDocument, message: this.message };
      }
      if (this._unresolvedExternalDocumentByURL.has(url)) {
        return { document: null, message: 'can not find file for ' + (url ?? '') };
      }
    }
    const addressWithRedirection = this.getAddressWithRedirection(url, null);
    const val = this.documentFromURL(addressWithRedirection, null, useCache);
    if (val === null) {
      // Port: not recorded when only the synchronous network access failed (see the header).
      if (useCache && !this._syncNetworkFailure) {
        this._unresolvedExternalDocumentByURL.add(url);
      }
      return { document: null, message: 'can not find file for ' + (url ?? '') };
    }
    if (useCache) {
      return { document: this._externalDocumentRegistry.load(null, url, val).caexDocument, message: null };
    }
    return { document: val, message: null };
  }

  /** Asynchronous variant of resolveExternalDocument. */
  async resolveExternalDocumentAsync(url: string | null, useCache = true): Promise<DocumentResult> {
    if (useCache) {
      let fromURL: ExternalDocument | null;
      if ((fromURL = this._externalDocumentRegistry.getFromURL(url)) !== null) {
        // Aml.Engine: the message field instead of null (see resolveExternalDocument).
        return { document: fromURL.caexDocument, message: this.message };
      }
      if (this._unresolvedExternalDocumentByURL.has(url)) {
        return { document: null, message: 'can not find file for ' + (url ?? '') };
      }
    }
    const addressWithRedirection = this.getAddressWithRedirection(url, null);
    const val = await this.documentFromURLAsync(addressWithRedirection, null, useCache);
    if (val === null) {
      if (useCache) {
        this._unresolvedExternalDocumentByURL.add(url);
      }
      return { document: null, message: 'can not find file for ' + (url ?? '') };
    }
    if (useCache) {
      return { document: this._externalDocumentRegistry.load(null, url, val).caexDocument, message: null };
    }
    return { document: val, message: null };
  }

  /** Sets a redirection for the address (ignored if the redirect address is redirected itself). */
  setRedirection(address: string | null, redirectAddress: string | null): void {
    if (this._redirections.item(redirectAddress) === null) {
      this._redirections.setItem(address, redirectAddress);
    }
  }

  /** Unloads the external document which was referenced by the provided external reference. */
  unloadExternalDocument(externalReference: ExternalReferenceType): void {
    const fromURL = this._externalDocumentRegistry.getFromURL(externalReference.path);
    if (fromURL !== null) {
      const r = this._referenceDictionary.tryGetValue(externalReference.document as XDocument);
      if (r.result && r.value !== null) {
        this._externalDocumentRegistry.remove(r.value, fromURL);
      }
    }
  }

  /**
   * Gets the http response from a web server for the URL; null if the request fails. If the
   * GitHub access service is registered and the URL is a GitHub path, the response comes from
   * the GitHub server.
   */
  static async getResponseFromWebServerAsync(uri: Uri): Promise<Response | null> {
    try {
      const gitHubAccessService = ServiceLocator.gitHubAccessService;
      if (gitHubAccessService !== null && gitHubAccessService.isGitHubPath(uri.toString())) {
        return await gitHubAccessService.getResponseFromGitServerAsync(uri.toString());
      }
      const headers: Record<string, string> = {};
      const components = uri.getComponents(UriComponents.HttpRequestUrl, UriFormat.UriEscaped);
      const components2: string | null = uri.getComponents(UriComponents.UserInfo, UriFormat.UriEscaped);
      // Aml.Engine: GetComponents(UserInfo) is "" (not null) for a URI without user info, so every
      // request carries "Authorization: Basic Og==" (empty user name and password).
      if (components2 !== null) {
        const array = components2.split(':');
        const text = array[0]!;
        const text2 = array.length === 2 ? array[1]! : '';
        const parameter = toBase64String(asciiBytes(text + ':' + text2));
        headers['Authorization'] = 'Basic ' + parameter;
      }
      return await fetch(components, { headers });
    } catch {
      return null;
    }
  }

  private async canAccessAsync(fileRef: string | null): Promise<boolean> {
    const uri = Uri.tryCreate(fileRef, UriKind.RelativeOrAbsolute);
    if (uri !== null && uri.isAbsoluteUri && (uri.scheme === UriSchemeHttp || uri.scheme === UriSchemeHttps)) {
      let httpResponseMessage: Response | null = null;
      try {
        httpResponseMessage = await ExternalReferenceResolver.getResponseFromWebServerAsync(uri);
        return httpResponseMessage?.ok ?? false;
      } catch {
        this.message = `Error sending the request for ${uri}`;
        return false;
      } finally {
        disposeResponse(httpResponseMessage);
      }
    }
    return this.canAccessWithoutHttp(fileRef, uri);
  }

  /** CanAccessAsync(fileRef).Result: an http(s) request fails (the catch block of the request). */
  private canAccess(fileRef: string | null): boolean {
    const uri = Uri.tryCreate(fileRef, UriKind.RelativeOrAbsolute);
    if (uri !== null && uri.isAbsoluteUri && (uri.scheme === UriSchemeHttp || uri.scheme === UriSchemeHttps)) {
      // C# awaits GetResponseFromWebServerAsync here. Synchronously the request fails
      // (syncNetworkException); the catch block of C#:
      this.message = `Error sending the request for ${uri}`;
      return false;
    }
    return this.canAccessWithoutHttp(fileRef, uri);
  }

  /** The part of CanAccessAsync after the http(s) branch (it completes synchronously in C#). */
  private canAccessWithoutHttp(fileRef: string | null, uri: Uri | null): boolean {
    if (uri !== null && uri.isAbsoluteUri) {
      if (uri.scheme === UriSchemeFtp) {
        // FtpWebRequest is not supported: the catch block of the FTP request.
        this.message = `Error sending the request for ${uri}`;
        return false;
      }
      if (uri.scheme === UriSchemeFile && uri.isAbsoluteUri) {
        if (fileExists(uri.localPath)) {
          return true;
        }
        this.message = 'file not found: ' + uri.localPath;
        return false;
      }
    }
    const result = Uri.tryCreate(fileRef, UriKind.RelativeOrAbsolute);
    if (result !== null) {
      let path = fileRef;
      if (result.isAbsoluteUri) {
        path = result.absoluteUri;
      }
      return fileExists(path);
    }
    return false;
  }

  private async documentFromURLAsync(
    fileRef: string | null,
    resolveRelativePath: ((filePath: string | null) => string | null) | null,
    useCache: boolean,
  ): Promise<CAEXDocument | null> {
    const uri = Uri.tryCreate(fileRef, UriKind.RelativeOrAbsolute);
    if (uri !== null && uri.isAbsoluteUri && (uri.scheme === UriSchemeHttp || uri.scheme === UriSchemeHttps)) {
      let response: Response | null = null;
      try {
        response = await ExternalReferenceResolver.getResponseFromWebServerAsync(uri);
        if (response !== null && response.ok) {
          const stream = new Uint8Array(await response.arrayBuffer());
          return await CAEXDocument.loadFromStreamAsync(stream, null, false);
        }
        this.message = `${statusCodeText(response)}: no response for ${uri}`;
        return null;
      } catch (ex) {
        this.message = `Error sending the request for ${uri}\n${exceptionMessage(ex)}`;
        return null;
      } finally {
        disposeResponse(response);
      }
    }
    return this.documentFromURLWithoutHttp(fileRef, uri, resolveRelativePath, useCache);
  }

  /** DocumentFromURLAsync(...).Result: an http(s) request fails (the catch block of the request). */
  private documentFromURL(
    fileRef: string | null,
    resolveRelativePath: ((filePath: string | null) => string | null) | null,
    useCache: boolean,
  ): CAEXDocument | null {
    this._syncNetworkFailure = false;
    const uri = Uri.tryCreate(fileRef, UriKind.RelativeOrAbsolute);
    if (uri !== null && uri.isAbsoluteUri && (uri.scheme === UriSchemeHttp || uri.scheme === UriSchemeHttps)) {
      // C# awaits GetResponseFromWebServerAsync here. Synchronously the request fails; the catch
      // block of C#:
      this._syncNetworkFailure = true;
      const ex = syncNetworkException(uri);
      this.message = `Error sending the request for ${uri}\n${ex.message}`;
      return null;
    }
    return this.documentFromURLWithoutHttp(fileRef, uri, resolveRelativePath, useCache);
  }

  /** The part of DocumentFromURLAsync after the http(s) branch (it completes synchronously in C#). */
  private documentFromURLWithoutHttp(
    fileRef: string | null,
    uri: Uri | null,
    resolveRelativePath: ((filePath: string | null) => string | null) | null,
    useCache: boolean,
  ): CAEXDocument | null {
    const loadDocumentFromRelativeLocation = (filePath: string | null): CAEXDocument | null => {
      filePath = resolveRelativePath?.(filePath) ?? null;
      if (!fileExists(filePath)) {
        return null;
      }
      return CAEXDocument.loadFromFile(filePath!, false);
    };
    if (uri !== null && uri.isAbsoluteUri) {
      if (uri.scheme === UriSchemeFtp) {
        // FtpWebRequest is not supported: the catch block of the FTP request.
        this.message = `Error sending the request for ${uri}`;
        return null;
      }
      if (uri.scheme === UriSchemeFile && uri.isAbsoluteUri) {
        if (fileExists(uri.localPath)) {
          return CAEXDocument.loadFromFile(uri.localPath, false);
        }
        this.message = 'file not found: ' + uri.localPath;
        return null;
      }
    }
    const result = Uri.tryCreate(fileRef, UriKind.RelativeOrAbsolute);
    if (result !== null) {
      let text = fileRef as string;
      if (result.isAbsoluteUri) {
        text = result.absoluteUri;
      }
      if (useCache) {
        const fromURL = this._externalDocumentRegistry.getFromURL(text);
        if (fromURL !== null) {
          return fromURL.caexDocument;
        }
      }
      return fileExists(text) ? CAEXDocument.loadFromFile(text, false) : (this._resolverFunction?.(text) ?? loadDocumentFromRelativeLocation(text));
    }
    return null;
  }

  private unloadAllDocuments(): void {
    this._referenceDictionary.clear();
    this._externalDocumentRegistry.clear();
    this._unresolvedExternalDocumentByURL.clear();
  }

  /**
   * Unloads an already resolved document for the URL. Use it when a document loaded from the URL
   * has been modified, so that the original document is loaded again.
   */
  unloadDocument(url: string | null): void {
    const fromURL = this._externalDocumentRegistry.getFromURL(url);
    if (fromURL !== null) {
      this._externalDocumentRegistry.unload(fromURL);
    }
  }
}

registerInterfaces(
  ExternalReferenceResolver as unknown as abstract new () => unknown,
  'IExternalReferenceResolverAsync',
  'IExternalReferenceResolver',
  'IAMLService',
  'IXMLDocumentRegistry',
  'IXMLExternalUnload',
);
