// Port of Aml.Engine.Streaming.DocumentStreaming (Aml.Engine 4.5.2).
//
// The C# class streams a document with an XmlReader. There is no streaming reader here: the
// document is parsed completely (whitespace preserved, DTD prohibited, like XmlReader.Create
// with default settings) and a cursor over its node sequence reproduces the reader calls used
// (MoveToContent, Read, ReadSubtree, XNode.ReadFrom, ReadToFollowing), including their effect on
// which nodes are visited (XNode.ReadFrom leaves the reader on the node after the element, so the
// next Read skips that node, as in .NET).
//
// Loading: the synchronous methods read local files in Node (process.getBuiltinModule). A URL
// that needs network access (http, https, GitHub) or a runtime without file access raises
// NotSupportedException, since synchronous network access is impossible in JavaScript. The
// asynchronous variants (…Async) use fetch for http(s) URLs and the GitHub service, and
// node:fs for local files.

import { Fixes } from '../fixes.js';
import { T } from '../registry.js';
import { ArgumentException, ArgumentNullException, NotSupportedException } from '../../system/exceptions.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../system/strings.js';
import { from } from '../../system/linq.js';
import { trimWhiteSpace } from '../../system/Char.js';
import { Uri, UriKind } from '../../system/index.js';
import { loadXDocument, XCData, XElement, XText, type XDocument, type XNode } from '../../xml/index.js';
import { CAEXPathBuilder } from '../caex/extensions/CAEXPathBuilder.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { NetworkCredential } from '../services/model/AMLLibraryServerProfile.js';
import type { CAEXWrapper } from '../caex/CAEXWrapper.js';
import type { ExternalReferenceType } from '../caex/ExternalReferenceType.js';
import type { ICAEXWrapper } from '../caex/ICAEXWrapper.js';
import type { RevisionType } from '../caex/RevisionType.js';

/** System.Xml.XmlUrlResolver: only the credentials are modelled (null = CredentialCache.DefaultCredentials). */
export class XmlUrlResolver {
  credentials: NetworkCredential | null = null;
}

/** The part of System.Xml.XmlReaderSettings that PrepareSettingsWithCredential sets. */
export interface XmlReaderSettings {
  xmlResolver?: XmlUrlResolver | null;
  /** Other XmlReaderSettings members callers may set; not used by DocumentStreaming. */
  [setting: string]: unknown;
}

/** Thrown where a synchronous method would need network access (not caught by the C# catch-all blocks). */
class SyncAccessNotSupportedException extends NotSupportedException {}

// ---- reader simulation ----------------------------------------------------------------------

const enum Kind {
  Start,
  End,
  Other,
}

interface Token {
  kind: Kind;
  el: XElement | null;
  /** For a start token: index of its end token, or of itself for an empty element. */
  end: number;
  /** Whether the node is content for MoveToContent (element, end element, text, CDATA). */
  content: boolean;
}

function tokenize(doc: XDocument): Token[] {
  const tokens: Token[] = [];
  const visit = (node: XNode): void => {
    if (node instanceof XElement) {
      const index = tokens.length;
      const t: Token = { kind: Kind.Start, el: node, end: index, content: true };
      tokens.push(t);
      for (const child of node.nodes()) visit(child);
      if (!node.isEmpty) {
        t.end = tokens.length;
        tokens.push({ kind: Kind.End, el: node, end: -1, content: true });
      }
      return;
    }
    if (node instanceof XCData) {
      tokens.push({ kind: Kind.Other, el: null, end: -1, content: true });
    } else if (node instanceof XText) {
      // Whitespace-only text is a Whitespace node, which MoveToContent skips.
      tokens.push({ kind: Kind.Other, el: null, end: -1, content: /[^\t\n\r ]/.test(node.value) });
    } else {
      // Comment, processing instruction, document type.
      tokens.push({ kind: Kind.Other, el: null, end: -1, content: false });
    }
  };
  for (const n of doc.nodes()) visit(n);
  return tokens;
}

/** XmlReader.Name of an element: the qualified name as written (prefix:local or local). */
function qualifiedName(el: XElement): string {
  const ns = el.name.namespace;
  if (ns === el.getDefaultNamespace()) return el.name.localName;
  const prefix = el.getPrefixOfNamespace(ns);
  return isNullOrEmpty(prefix) ? el.name.localName : `${prefix}:${el.name.localName}`;
}

/** A cursor over the token list with the XmlReader operations used by DocumentStreaming. */
class Reader {
  pos = -1;

  constructor(
    readonly tokens: Token[],
    /** Exclusive end of the readable range (a subtree reader stops at the end of its root). */
    readonly limit: number = tokens.length,
    readonly start: number = -1,
  ) {
    this.pos = start;
  }

  get current(): Token | null {
    return this.pos >= 0 && this.pos < this.limit ? this.tokens[this.pos] : null;
  }

  get isElement(): boolean {
    return this.current?.kind === Kind.Start;
  }

  get name(): string {
    const t = this.current;
    return t !== null && t.el !== null ? qualifiedName(t.el) : '';
  }

  read(): boolean {
    if (this.pos >= this.limit) return false;
    this.pos++;
    return this.pos < this.limit;
  }

  moveToContent(): void {
    if (this.pos < 0) this.pos = 0;
    while (this.pos < this.limit && !this.tokens[this.pos].content) this.pos++;
  }

  /** XElement.Load(ReadSubtree()): a detached copy; the reader stays on the end of the element. */
  loadSubtree(): XElement {
    const t = this.current!;
    const copy = new XElement(t.el!);
    this.pos = t.end;
    return copy;
  }

  /** XNode.ReadFrom(reader): a detached copy; the reader moves to the node after the element. */
  readFrom(): XElement {
    const t = this.current!;
    const copy = new XElement(t.el!);
    this.pos = t.end + 1;
    return copy;
  }

  /** ReadSubtree(): a reader over the current element (positioned before it). */
  subtree(): Reader {
    const t = this.current!;
    return new Reader(this.tokens, t.end + 1, this.pos - 1);
  }

  /** Disposing a subtree reader: the parent reader moves to the end of the subtree root. */
  endSubtree(sub: Reader): void {
    this.pos = sub.limit - 1;
  }

  readToFollowing(name: string): boolean {
    while (this.read()) {
      if (this.isElement && this.name === name) return true;
    }
    return false;
  }
}

function creator(elementName: string): ((e: XElement) => CAEXWrapper) | null {
  const r = T.CAEXTypeDictionary.instance.tryGetCreator(elementName);
  return (r.creatorFunc ?? null) as ((e: XElement) => CAEXWrapper) | null;
}

// ---- loading --------------------------------------------------------------------------------

function isHttp(uri: Uri): boolean {
  return uri.scheme === 'http' || uri.scheme === 'https';
}

function syncFs(): { readFileSync(path: string): Uint8Array } {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const fs = proc?.getBuiltinModule?.('node:fs') as { readFileSync(path: string): Uint8Array } | undefined;
  if (!fs) {
    throw new SyncAccessNotSupportedException('File access is not available in this environment; use the asynchronous methods.');
  }
  return fs;
}

/** XmlReader.Create(inputUrl, settings) followed by a complete parse, synchronously. */
function loadSync(inputUrl: string): XDocument {
  const uri = Uri.tryCreate(inputUrl, UriKind.Absolute);
  if (uri !== null && !uri.isFile) {
    throw new SyncAccessNotSupportedException(`Synchronous access to '${inputUrl}' needs the network; use the asynchronous methods.`);
  }
  const path = uri !== null ? uri.localPath : inputUrl;
  return loadXDocument(syncFs().readFileSync(path), { preserveWhitespace: true });
}

function basicAuthorization(credential: NetworkCredential): string {
  const text = `${credential.userName ?? ''}:${credential.password ?? ''}`;
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return 'Basic ' + btoa(bin);
}

/** XmlReader.Create(inputUrl, settings) followed by a complete parse, with fetch or node:fs. */
async function loadAsync(inputUrl: string, settings: XmlReaderSettings): Promise<XDocument> {
  const uri = Uri.tryCreate(inputUrl, UriKind.Absolute);
  if (uri !== null && isHttp(uri)) {
    const headers: Record<string, string> = {};
    const credential = settings.xmlResolver?.credentials ?? null;
    if (credential !== null) {
      headers['Authorization'] = basicAuthorization(credential);
    }
    // fetch refuses URLs with user info; the credentials go into the Authorization header.
    const url = new URL(uri.absoluteUri);
    url.username = '';
    url.password = '';
    const response = await fetch(url.toString(), { headers });
    if (!response.ok) {
      throw new Error(`The remote server returned an error: (${response.status}) ${response.statusText}.`);
    }
    return loadXDocument(new Uint8Array(await response.arrayBuffer()), { preserveWhitespace: true });
  }
  if (uri !== null && !uri.isFile) {
    throw new NotSupportedException(`The URI scheme '${uri.scheme}' is not supported.`);
  }
  const path = uri !== null ? uri.localPath : inputUrl;
  const fs = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process?.getBuiltinModule?.('node:fs') as
    | { readFileSync(path: string): Uint8Array }
    | undefined;
  if (fs === undefined) throw new NotSupportedException('Loading from a file requires Node.js.');
  return loadXDocument(new Uint8Array(fs.readFileSync(path)), { preserveWhitespace: true });
}

async function loadGitHubAsync(inputUrl: string): Promise<XDocument | null> {
  const response = await ServiceLocator.gitHubAccessService!.getResponseFromGitServerAsync(inputUrl);
  if (response !== null && response !== undefined && response.ok) {
    return loadXDocument(new Uint8Array(await response.arrayBuffer()), { preserveWhitespace: true });
  }
  return null;
}

// ---- semantic versions of library file names (Aml.Engine.Resources.Files) -------------------

interface SemanticVersion {
  version: [number, number, number, number];
  specialVersion: string;
}

const strictSemanticVersion = /^(\d+(?:\.\d+){2})(-[a-z][0-9a-z-]*)?$/i;

/** SemanticVersion.TryParseStrict. */
function tryParseStrict(version: string | null): SemanticVersion | null {
  if (isNullOrEmpty(version)) return null;
  const m = strictSemanticVersion.exec(trimWhiteSpace(version));
  if (m === null) return null;
  const parts = m[1].split('.').map((p) => Number(p));
  if (parts.some((p) => !Number.isSafeInteger(p) || p > 2147483647)) return null;
  return { version: [parts[0], parts[1], parts[2], 0], specialVersion: (m[2] ?? '').replace(/^-+/, '') };
}

/** SemanticVersion.CompareTo. */
function compareSemanticVersion(a: SemanticVersion, b: SemanticVersion | null): number {
  if (b === null) return 1;
  for (let i = 0; i < 4; i++) {
    if (a.version[i] !== b.version[i]) return a.version[i] < b.version[i] ? -1 : 1;
  }
  const flag = a.specialVersion.length === 0;
  const flag2 = b.specialVersion.length === 0;
  if (flag && flag2) return 0;
  if (flag) return 1;
  if (flag2) return -1;
  const x = a.specialVersion.toUpperCase();
  const y = b.specialVersion.toUpperCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

function getFileName(path: string): string {
  const root = path.length >= 2 && path[1] === ':' && /[A-Za-z]/.test(path[0]) ? 2 : 0;
  for (let i = path.length; --i >= 0; ) {
    if (i < root || path[i] === '\\' || path[i] === '/') return path.substring(i + 1);
  }
  return path;
}

/**
 * `new AMLFileMetaModel(url, AMLFileContentType.LibraryFile).SemanticVersion` (the version part
 * of a library file name Producer_Domain_LibType[_Extension]_Edition_Version.aml).
 */
function getVersion(url: string | null): SemanticVersion | null {
  if (url === null || url === undefined) {
    // AMLFileMetaModel: Uri.UnescapeDataString(null).
    throw new ArgumentNullException('stringToUnescape');
  }
  const filePath = Uri.unescapeDataString(url);
  let version: string | null = null;
  if (!isNullOrEmpty(filePath)) {
    const fileName = getFileName(filePath);
    const dot = fileName.lastIndexOf('.');
    const array = (dot === -1 ? fileName : fileName.substring(0, dot)).split('_');
    if (array.length >= 5) {
      version = array[array.length === 6 ? 5 : 4];
    }
  }
  if (isNullOrEmpty(version)) {
    return null;
  }
  return tryParseStrict(version);
}

/** Streaming access to elements of large AutomationML documents. */
export class DocumentStreaming {
  private constructor() {}

  /**
   * Reads the ExternalReference elements of a document (C# overloads for a URL and for a
   * stream, given here as bytes).
   */
  static readExternalReferenceType(input: string | Uint8Array | null): Iterable<ExternalReferenceType> {
    return from(DocumentStreaming.streamElementWithName(input, 'ExternalReference', DocumentStreaming.canCloseExternalReferenceStream)).cast<ExternalReferenceType>();
  }

  /** Asynchronous variant of readExternalReferenceType(inputUrl): http(s) URLs are loaded with fetch. */
  static async readExternalReferenceTypeAsync(inputUrl: string | null): Promise<ExternalReferenceType[]> {
    const list = await DocumentStreaming.streamElementWithNameAsync(inputUrl, 'ExternalReference', DocumentStreaming.canCloseExternalReferenceStream);
    return list as unknown as ExternalReferenceType[];
  }

  /**
   * Reads all elements with the given name, until an element accepted by `canClose` is found
   * (C# overloads for a URL, which returns a list and returns an empty list on any error, and for
   * a stream (bytes here), which is a lazy sequence).
   */
  static streamElementWithName(
    input: string | Uint8Array | null,
    elementName: string | null,
    canClose: ((name: string) => boolean) | null,
  ): Iterable<ICAEXWrapper | null> {
    if (typeof input === 'string' || input === null || input === undefined) {
      return DocumentStreaming.streamElementWithNameFromUrl(input ?? null, elementName, canClose);
    }
    return DocumentStreaming.streamElementWithNameFromStream(input, elementName, canClose);
  }

  private static streamElementWithNameFromUrl(
    inputUrl: string | null,
    elementName: string | null,
    canClose: ((name: string) => boolean) | null,
  ): (ICAEXWrapper | null)[] {
    if (isNullOrWhiteSpace(inputUrl)) {
      throw new ArgumentException("'inputUrl' cannot be null or whitespace.", 'inputUrl');
    }
    if (isNullOrWhiteSpace(elementName)) {
      throw new ArgumentException("'elementName' cannot be null or whitespace.", 'elementName');
    }
    const url: string = inputUrl!;
    const name: string = elementName!;
    const settings: XmlReaderSettings = {};
    try {
      const gitHub = ServiceLocator.gitHubAccessService;
      if (gitHub === null || !gitHub.isGitHubPath(url)) {
        if (!DocumentStreaming.prepareSettingsWithCredential(url, settings).result) {
          return [];
        }
        return DocumentStreaming.readXmlElements(loadSync(url), name, canClose);
      }
      throw new SyncAccessNotSupportedException('GitHub access is asynchronous; use streamElementWithNameAsync.');
    } catch (e) {
      if (e instanceof SyncAccessNotSupportedException) throw e;
      return [];
    }
  }

  /** Asynchronous variant of streamElementWithName(inputUrl, ...): http(s) with fetch, GitHub through the GitHub service. */
  static async streamElementWithNameAsync(
    inputUrl: string | null,
    elementName: string | null,
    canClose: ((name: string) => boolean) | null,
  ): Promise<(ICAEXWrapper | null)[]> {
    if (isNullOrWhiteSpace(inputUrl)) {
      throw new ArgumentException("'inputUrl' cannot be null or whitespace.", 'inputUrl');
    }
    if (isNullOrWhiteSpace(elementName)) {
      throw new ArgumentException("'elementName' cannot be null or whitespace.", 'elementName');
    }
    const url: string = inputUrl!;
    const name: string = elementName!;
    const settings: XmlReaderSettings = {};
    try {
      const gitHub = ServiceLocator.gitHubAccessService;
      if (gitHub === null || !gitHub.isGitHubPath(url)) {
        if (!DocumentStreaming.prepareSettingsWithCredential(url, settings).result) {
          return [];
        }
        return DocumentStreaming.readXmlElements(await loadAsync(url, settings), name, canClose);
      }
      const doc = await loadGitHubAsync(url);
      if (doc !== null) {
        return DocumentStreaming.readXmlElements(doc, name, canClose);
      }
    } catch {
      return [];
    }
    return [];
  }

  /** The local function ReadXML of StreamElementWithName(string, ...). */
  private static readXmlElements(doc: XDocument, elementName: string, canClose: ((name: string) => boolean) | null): (ICAEXWrapper | null)[] {
    const list: (ICAEXWrapper | null)[] = [];
    const creatorFunc = creator(elementName);
    const xmlReader = new Reader(tokenize(doc));
    xmlReader.moveToContent();
    let flag = false;
    while (xmlReader.read() && !flag) {
      if (xmlReader.isElement) {
        if (xmlReader.name === elementName) {
          const element = xmlReader.loadSubtree();
          const item = creatorFunc !== null ? creatorFunc(element) : null;
          list.push(item);
        } else if (canClose !== null && canClose(xmlReader.name)) {
          flag = true;
        }
      }
    }
    return list;
  }

  /** The paths of the newer versions referenced by the document. */
  static newDocumentVersions(inputUrl: string | null): Iterable<string> {
    return DocumentStreaming.documentVersions(inputUrl, true);
  }

  /** The paths of the older versions referenced by the document. */
  static oldDocumentVersions(inputUrl: string | null): Iterable<string> {
    return DocumentStreaming.documentVersions(inputUrl, false);
  }

  /** Asynchronous variant of newDocumentVersions. */
  static newDocumentVersionsAsync(inputUrl: string | null): Promise<string[]> {
    return DocumentStreaming.documentVersionsAsync(inputUrl, true);
  }

  /** Asynchronous variant of oldDocumentVersions. */
  static oldDocumentVersionsAsync(inputUrl: string | null): Promise<string[]> {
    return DocumentStreaming.documentVersionsAsync(inputUrl, false);
  }

  private static documentVersions(inputUrl: string | null, newVersions: boolean): Iterable<string> {
    const versionReferenceTable = new Map<string, boolean | null>();
    const downloadLinks = new Map<string, string | null>();
    const docVersion = getVersion(inputUrl);
    try {
      const gitHub = ServiceLocator.gitHubAccessService;
      if (gitHub !== null && gitHub.isGitHubPath(inputUrl!)) {
        throw new SyncAccessNotSupportedException('GitHub access is asynchronous; use the asynchronous methods.');
      }
      const settings: XmlReaderSettings = {};
      if (!DocumentStreaming.prepareSettingsWithCredential(inputUrl, settings).result) {
        return [];
      }
      DocumentStreaming.readVersions(loadSync(inputUrl!), newVersions, docVersion, versionReferenceTable, downloadLinks);
    } catch (e) {
      if (e instanceof SyncAccessNotSupportedException) throw e;
      return [];
    }
    return from(downloadLinks)
      .where(([key]) => versionReferenceTable.get(key) === newVersions)
      .select(([, value]) => value as string);
  }

  private static async documentVersionsAsync(inputUrl: string | null, newVersions: boolean): Promise<string[]> {
    const versionReferenceTable = new Map<string, boolean | null>();
    const downloadLinks = new Map<string, string | null>();
    const docVersion = getVersion(inputUrl);
    try {
      const gitHub = ServiceLocator.gitHubAccessService;
      if (gitHub !== null && gitHub.isGitHubPath(inputUrl!)) {
        const doc = await loadGitHubAsync(inputUrl!);
        if (doc !== null) {
          DocumentStreaming.readVersions(doc, newVersions, docVersion, versionReferenceTable, downloadLinks);
        }
      } else {
        const settings: XmlReaderSettings = {};
        if (!DocumentStreaming.prepareSettingsWithCredential(inputUrl, settings).result) {
          return [];
        }
        DocumentStreaming.readVersions(await loadAsync(inputUrl!, settings), newVersions, docVersion, versionReferenceTable, downloadLinks);
      }
    } catch {
      return [];
    }
    return from(downloadLinks)
      .where(([key]) => versionReferenceTable.get(key) === newVersions)
      .select(([, value]) => value as string)
      .toList();
  }

  /** The local function ReadXML of DocumentVersions. */
  private static readVersions(
    doc: XDocument,
    newVersions: boolean,
    docVersion: SemanticVersion | null,
    versionReferenceTable: Map<string, boolean | null>,
    downloadLinks: Map<string, string | null>,
  ): void {
    const create = (elementName: string, element: XElement): CAEXWrapper | null => {
      const creatorFunc = creator(elementName);
      return creatorFunc !== null ? creatorFunc(element) : null;
    };
    const isDone = (): boolean => from(versionReferenceTable.values()).all((v) => v !== null);
    const xmlReader = new Reader(tokenize(doc));
    xmlReader.moveToContent();
    while (xmlReader.read()) {
      if (!xmlReader.isElement) {
        continue;
      }
      switch (xmlReader.name) {
        case 'ExternalReference': {
          const element2 = xmlReader.loadSubtree();
          const externalReferenceType = create('ExternalReference', element2) as unknown as ExternalReferenceType;
          if (
            externalReferenceType.isVersionReference &&
            ((newVersions && externalReferenceType.isNewVersionReference) ||
              (!newVersions && externalReferenceType.isOldVersionReference) ||
              externalReferenceType.version == null)
          ) {
            DocumentStreaming.setKey(versionReferenceTable, externalReferenceType.alias, null);
            DocumentStreaming.setKey(downloadLinks, externalReferenceType.alias, externalReferenceType.path);
            if (docVersion !== null) {
              const val = getVersion(externalReferenceType.path);
              if (val !== null) {
                versionReferenceTable.set(externalReferenceType.alias!, compareSemanticVersion(val, docVersion) > 0);
              }
            }
          }
          break;
        }
        case 'SystemUnitClassLib':
        case 'RoleClassLib':
        case 'InterfaceClassLib':
        case 'AttributeTypeLib':
          if (!isDone()) {
            const xmlReader2 = xmlReader.subtree();
            while (xmlReader2.readToFollowing('Revision')) {
              // Fix streamingAdjacentElements: ReadFrom moves past the element and the next
              // ReadToFollowing skips one more node, so an adjacent Revision is not seen.
              const element = Fixes.enabled('streamingAdjacentElements') ? xmlReader2.loadSubtree() : xmlReader2.readFrom();
              const revisionType = create('Revision', element) as unknown as RevisionType;
              if (!isNullOrEmpty(revisionType.newVersion)) {
                const key = CAEXPathBuilder.aliasFromReference(revisionType.newVersion);
                DocumentStreaming.setKey(versionReferenceTable, key, true);
                if (isDone()) {
                  break;
                }
              } else if (!isNullOrEmpty(revisionType.oldVersion)) {
                const key2 = CAEXPathBuilder.aliasFromReference(revisionType.oldVersion);
                DocumentStreaming.setKey(versionReferenceTable, key2, false);
                if (isDone()) {
                  break;
                }
              }
            }
            xmlReader.endSubtree(xmlReader2);
          }
          break;
      }
    }
  }

  /** Dictionary indexer set: a null key throws ArgumentNullException. */
  private static setKey<V>(map: Map<string, V>, key: string | null, value: V): void {
    if (key === null || key === undefined) throw new ArgumentNullException('key');
    map.set(key, value);
  }

  private static *streamElementWithNameFromStream(
    inputStream: Uint8Array | null,
    elementName: string | null,
    canClose: ((name: string) => boolean) | null,
  ): Generator<ICAEXWrapper | null> {
    if (inputStream === null || inputStream === undefined) {
      throw new ArgumentNullException('inputStream');
    }
    if (isNullOrWhiteSpace(elementName)) {
      throw new ArgumentException("'elementName' cannot be null or whitespace.", 'elementName');
    }
    const reader = new Reader(tokenize(loadXDocument(inputStream, { preserveWhitespace: true })));
    const creatorFunc = creator(elementName!);
    reader.moveToContent();
    let close = false;
    while (reader.read() && !close) {
      if (reader.isElement) {
        if (reader.name === elementName) {
          // Fix streamingAdjacentElements: ReadFrom moves past the element and the next Read()
          // skips one more node, so an element directly after a matched one is not seen.
          const element = Fixes.enabled('streamingAdjacentElements') ? reader.loadSubtree() : reader.readFrom();
          yield creatorFunc !== null ? creatorFunc(element) : null;
        } else if (canClose !== null && canClose(reader.name)) {
          close = true;
        }
      }
    }
  }

  /**
   * Checks the URL: for http(s) URLs the credentials of the user info (or the default
   * credentials) are set on the settings; for other absolute URIs `localPath` is the local path.
   * Returns false for a relative path or an invalid URI.
   */
  static prepareSettingsWithCredential(inputUrl: string | null, settings: XmlReaderSettings): { result: boolean; localPath: string | null } {
    let localPath = inputUrl;
    const result = Uri.tryCreate(inputUrl, UriKind.Absolute);
    if (result !== null) {
      if (result.scheme === 'http' || result.scheme === 'https') {
        const components = result.userInfo;
        if (!isNullOrEmpty(components)) {
          const array = components.split(':');
          const userName = array[0];
          const password = array.length === 2 ? array[1] : '';
          const credentials = new NetworkCredential(userName, password);
          settings.xmlResolver = Object.assign(new XmlUrlResolver(), { credentials });
        } else {
          settings.xmlResolver = new XmlUrlResolver();
        }
        return { result: true, localPath };
      }
      localPath = result.localPath;
      return { result: true, localPath };
    }
    return { result: false, localPath };
  }

  private static canCloseExternalReferenceStream(name: string): boolean {
    switch (name) {
      case 'RoleClassLib':
      case 'SystemUnitClassLib':
      case 'AttributeTypeLib':
      case 'InstanceHierarchy':
      case 'InterfaceClassLib':
        return true;
      default:
        return false;
    }
  }
}
