// Port of Aml.Engine.CAEX.CAEXDocument (with the nested CAEXSchema enum and Commanding class).

import {
  XDocument,
  XElement,
  XName,
  XNamespace,
  XNode,
  loadXDocument,
  parseXDocument,
  saveXDocument,
  writeXDocument,
} from '../../xml/index.js';
import {
  ArgumentNullException,
  ArgumentOutOfRangeException,
  FileNotFoundException,
  NotSupportedException,
} from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { EventSource } from '../../system/index.js';
import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { XDocumentWrapper } from '../xml/XDocumentWrapper.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { DocumentStreaming } from '../streaming/DocumentStreaming.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { CAEXFileType } from './CAEXFileType.js';
import type { CAEXSequenceOfCAEXObjects } from './CAEXSequenceOfCAEXObjects.js';
import type { SystemUnitClassLibType } from './SystemUnitClassLibType.js';
import type { InstanceHierarchyType } from './InstanceHierarchyType.js';
import type { RoleClassLibType } from './RoleClassLibType.js';
import type { InterfaceClassLibType } from './InterfaceClassLibType.js';
import type { AttributeTypeLibType } from './AttributeTypeLibType.js';
import type { AMLSchemaManager } from '../schema/AMLSchemaManager.js';
import type { CAEXElementChangeEventArgs } from './commands/CAEXElementChangeEventArgs.js';
import type { IEvent, WeakEventSource } from './commands/WeakEventSource.js';
import type { IAMLFile } from '../amlobjects/IAMLFile.js';

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Enumeration type defining existing and supported CAEX versions. */
export enum CAEXDocument_CAEXSchema {
  /** CAEX Schema Version 2.15 ([Description("2.15")]). */
  CAEX2_15 = 1,
  /** CAEX Schema Version 3.0 ([Description("3.0")]). */
  CAEX3_0 = 2,
  /** The CAEX document couldn't be associated to a specific schema version. */
  Unknown = 0,
}

/** The [Description] attributes of the CAEXSchema members. */
const schemaDescriptions = new Map<number, string>([
  [CAEXDocument_CAEXSchema.CAEX2_15, '2.15'],
  [CAEXDocument_CAEXSchema.CAEX3_0, '3.0'],
]);

/** The Commanding class, which provides events for changes of CAEX objects. */
export class CAEXDocument_Commanding {
  /** @internal */
  commandDocument: CAEXDocument | null = null;

  private readonly _changedSource: WeakEventSource<CAEXElementChangeEventArgs> = new T.WeakEventSource<CAEXElementChangeEventArgs>();

  private readonly _changingSource: WeakEventSource<CAEXElementChangeEventArgs> = new T.WeakEventSource<CAEXElementChangeEventArgs>();

  /** This event is raised after a CAEXElement has been changed. */
  get caexElementChangedEvent(): IEvent<CAEXElementChangeEventArgs> {
    return {
      subscribe: (h) => this._changedSource.subscribe(h),
      unsubscribe: (h) => this._changedSource.unsubscribe(h),
    };
  }

  /** This event is raised before a CAEXElement will be changed. */
  get caexElementChangingEvent(): IEvent<CAEXElementChangeEventArgs> {
    return {
      subscribe: (h) => this._changingSource.subscribe(h),
      unsubscribe: (h) => this._changingSource.unsubscribe(h),
    };
  }

  /** @internal */
  raiseChange(args: CAEXElementChangeEventArgs): void {
    this._changedSource.raise(this.commandDocument, args);
  }

  /** @internal */
  raiseChanging(args: CAEXElementChangeEventArgs): void {
    this._changingSource.raise(this.commandDocument, args);
  }
}

// ---- file system helpers (Node only) ---------------------------------------------------------

function syncModule<M>(name: string): M | null {
  return ((globalThis as any).process?.getBuiltinModule?.(name) as M | undefined) ?? null;
}

type NodePath = typeof import('node:path');
type NodeFs = typeof import('node:fs');

/** File.Exists: false for null/empty paths, and where no file system is available. */
function fileExists(path: string | null): boolean {
  if (isNullOrEmpty(path)) return false;
  const fs = syncModule<NodeFs>('node:fs');
  if (fs === null) return false;
  try {
    return fs.statSync(path).isFile();
  } catch {
    return false;
  }
}

/** Path.GetFileName. */
function getFileName(path: string | null): string | null {
  if (path === null) return null;
  const nodePath = syncModule<NodePath>('node:path');
  const windows = nodePath === null ? true : nodePath.sep === '\\';
  let i = path.length;
  while (--i >= 0) {
    const c = path[i];
    if (c === '/' || (windows && (c === '\\' || c === ':'))) break;
  }
  return path.substring(i + 1);
}

/** Path.GetDirectoryName. */
function getDirectoryName(path: string | null): string | null {
  if (path === null) return null;
  const nodePath = syncModule<NodePath>('node:path');
  if (nodePath === null) {
    const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return i < 0 ? '' : path.substring(0, i);
  }
  const root = nodePath.parse(path).root;
  if (root !== '' && nodePath.resolve(path) === nodePath.resolve(root) && path.length <= root.length) return null;
  const dir = nodePath.dirname(path);
  const hasSeparator = /[\\/]/.test(path) || (nodePath.sep === '\\' && path.includes(':'));
  return !hasSeparator && dir === '.' ? '' : dir;
}

function isHttp(uri: string): boolean {
  return /^https?:\/\//i.test(uri);
}

/** XmlReader.Create(inputUri) for local files: the bytes of the file. */
function readFileSync(path: string): Uint8Array {
  const fs = syncModule<NodeFs>('node:fs');
  const nodePath = syncModule<NodePath>('node:path');
  if (fs === null || nodePath === null || isHttp(path)) {
    throw new NotSupportedException('Loading a CAEX document from a file or URI synchronously requires Node.js and a local file.');
  }
  try {
    return fs.readFileSync(path);
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') {
      throw new FileNotFoundException(`Could not find file '${nodePath.resolve(path)}'.`);
    }
    throw e;
  }
}

async function readUriAsync(uri: string): Promise<Uint8Array> {
  if (isHttp(uri)) {
    const response = await fetch(uri);
    if (!response.ok) {
      const err = new Error(`Response status code does not indicate success: ${response.status} (${response.statusText}).`);
      err.name = 'HttpRequestException';
      throw err;
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  // process.getBuiltinModule instead of import(): bundlers for the browser must not resolve node:fs.
  const fs = syncModule<typeof import('node:fs/promises')>('node:fs/promises');
  const nodePath = syncModule<NodePath>('node:path');
  if (fs === null || nodePath === null) {
    throw new NotSupportedException('Loading a CAEX document from a file requires Node.js.');
  }
  try {
    return await fs.readFile(uri);
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') {
      throw new FileNotFoundException(`Could not find file '${nodePath.resolve(uri)}'.`);
    }
    throw e;
  }
}

/**
 * Wrapper for the XDocument defining a CAEX document. Each CAEXDocument is associated to a
 * specific CAEX schema; new documents use the most recent one (3.0), loaded documents the
 * schema version defined in the document.
 */
export class CAEXDocument extends XDocumentWrapper implements IAMLFile {
  /** Enumeration type defining existing and supported CAEX versions. */
  static readonly CAEXSchema = CAEXDocument_CAEXSchema;

  /** The Commanding class, which provides events for changes of CAEX objects. */
  static readonly Commanding = CAEXDocument_Commanding;

  private _commanding: CAEXDocument_Commanding | null = null;

  private _filePath: string | null = null;

  private _schema: CAEXDocument_CAEXSchema = CAEXDocument_CAEXSchema.Unknown;

  private _isTransformationActive = false;

  private static readonly Utf8NoBom = new TextEncoder();

  private static get DefaultXmlReaderSettings(): Record<string, unknown> {
    return { ignoreComments: false, ignoreWhitespace: true };
  }

  private static get AsyncXmlReaderSettings(): Record<string, unknown> {
    return { ignoreComments: false, ignoreWhitespace: true, async: true };
  }

  /** The default schema for new CAEX documents. */
  static get defaultSchema(): CAEXDocument_CAEXSchema {
    return CAEXDocument_CAEXSchema.CAEX3_0;
  }

  /** Gets the CAEXFile which is the wrapper for the root element in the CAEX document. */
  get caexFile(): CAEXFileType | null {
    if (this.xDocument === null) {
      return null;
    }
    return new T.CAEXFileType(this.xDocument.element(this.xName('CAEXFile')));
  }

  /** Gets the collection of SystemUnitClassLib objects contained in the CAEXFile. */
  get systemUnitClassLib(): CAEXSequenceOfCAEXObjects<SystemUnitClassLibType> {
    return this.caexFile!.systemUnitClassLib;
  }

  /** Gets the collection of InstanceHierarchy objects contained in the CAEXFile. */
  get instanceHierarchy(): CAEXSequenceOfCAEXObjects<InstanceHierarchyType> {
    return this.caexFile!.instanceHierarchy;
  }

  /** Gets the collection of RoleClassLib objects contained in the CAEXFile. */
  get roleClassLib(): CAEXSequenceOfCAEXObjects<RoleClassLibType> {
    return this.caexFile!.roleClassLib;
  }

  /** Gets the collection of InterfaceClassLib objects contained in the CAEXFile. */
  get interfaceClassLib(): CAEXSequenceOfCAEXObjects<InterfaceClassLibType> {
    return this.caexFile!.interfaceClassLib;
  }

  /** Gets the collection of AttributeTypeLib objects contained in the CAEXFile. */
  get attributeTypeLib(): CAEXSequenceOfCAEXObjects<AttributeTypeLibType> {
    return this.caexFile!.attributeTypeLib;
  }

  /** Gets the command instance for this document, which enables registration of change events. */
  get commands(): CAEXDocument_Commanding {
    let commanding = this._commanding;
    if (commanding === null) {
      const obj = new T.CAEXDocument_Commanding();
      obj.commandDocument = this;
      this._commanding = obj;
      commanding = obj;
    }
    return commanding;
  }

  /** Gets the schema of the CAEXDocument (internal set). */
  get schema(): CAEXDocument_CAEXSchema {
    return this._schema;
  }

  set schema(value: CAEXDocument_CAEXSchema) {
    this._schema = value;
  }

  /** Gets the schema manager for this document. */
  get schemaManager(): AMLSchemaManager {
    if (this.schema !== CAEXDocument_CAEXSchema.CAEX3_0) {
      return T.AMLSchemaManager2_15.instance;
    }
    return T.AMLSchemaManager3_0.instance;
  }

  /** Gets the schema version string for the assigned schema. */
  get schemaVersionString(): string | null {
    return CAEXDocument.getDescription(this.schema);
  }

  /** @internal Determines whether this instance has an active schema transformation. */
  get isTransformationActive(): boolean {
    return this._isTransformationActive;
  }

  /**
   * Gets the last used full file path of the document as used in saveToFile and loadFromFile.
   * If no file path is defined but a CAEX FileName exists, the CAEX FileName is returned.
   */
  get filePath(): string | null {
    let text = this._filePath;
    if (text === null) {
      const cAEXFile = this.caexFile;
      if (cAEXFile === null) {
        return null;
      }
      text = cAEXFile.fileName;
    }
    return text;
  }

  /** @internal */
  set filePath(value: string | null) {
    this._filePath = value;
    if (!isNullOrEmpty(value) && fileExists(value)) {
      this.schemaManager?.setSchemaLocation(this.caexFile!.node!, getDirectoryName(this.filePath)!);
    }
  }

  /** @internal Used to restrict auto update to a special document. */
  supportsAutoUpdate = false;

  /**
   * Event raised when the document is saved. The event argument is the file path of the
   * document, before it was saved.
   */
  readonly documentSavedEvent: EventSource<string | null> = new EventSource<string | null>();

  /** @internal `CAEXDocument(CAEXSchema schema)` and `CAEXDocument()`. */
  constructor(schema?: CAEXDocument_CAEXSchema) {
    super(null);
    if (schema !== undefined) {
      this.schema = schema;
    }
  }

  /** Gets the schema version string for the provided schema. */
  static schemaToString(schema: CAEXDocument_CAEXSchema): string | null {
    return CAEXDocument.getDescription(schema);
  }

  /**
   * Gets the schema manager for the CAEX document which contains the provided XML node or CAEX
   * object. A null argument takes the XElement overload.
   */
  static amlSchemaManager(nodeOrObject: XElement | CAEXWrapper | null): AMLSchemaManager | null {
    if (nodeOrObject === null || nodeOrObject === undefined || nodeOrObject instanceof XNode) {
      const node = (nodeOrObject ?? null) as XElement | null;
      return CAEXDocument.documentOfNode(node)?.schemaManager ?? XmlCAEXSchema.schemaManager(node as XElement);
    }
    const caexObject = nodeOrObject;
    let obj: AMLSchemaManager | null = CAEXDocument.documentOfWrapper(caexObject)?.schemaManager ?? null;
    if (obj === null) {
      if (caexObject === null) {
        return null;
      }
      const node = caexObject.node;
      if (node === null) {
        return null;
      }
      obj = XmlCAEXSchema.schemaManager(node);
    }
    return obj;
  }

  /**
   * Gets the CAEX document which contains the specified CAEX object or XML node. A null argument
   * takes the XNode overload.
   */
  static override document(xNodeOrObject: XNode | CAEXWrapper | null): CAEXDocument | null {
    if (xNodeOrObject === null || xNodeOrObject === undefined || xNodeOrObject instanceof XNode) {
      return CAEXDocument.documentOfNode((xNodeOrObject ?? null) as XNode | null);
    }
    return CAEXDocument.documentOfWrapper(xNodeOrObject);
  }

  /** @internal `Document(XNode)`. */
  static override documentOfNode(xNode: XNode | null): CAEXDocument | null {
    const d = XDocumentWrapper.documentOfNode(xNode);
    return d instanceof CAEXDocument ? d : null;
  }

  /** @internal `Document(CAEXWrapper)`. */
  static override documentOfWrapper(caexObject: CAEXWrapper | null): CAEXDocument | null {
    const d = XDocumentWrapper.documentOfWrapper(caexObject);
    return d instanceof CAEXDocument ? d : null;
  }

  /** Loads a CAEX document from the specified bytes. */
  static loadFromBinary(binary: Uint8Array | null, createIndices = false): CAEXDocument {
    if (binary === null || binary === undefined) {
      throw new ArgumentNullException('buffer');
    }
    const cAEXDocument = CAEXDocument.loadFromStream(binary);
    cAEXDocument.loadIndices(createIndices);
    return cAEXDocument;
  }

  private loadIndices(createIndices: boolean): void {
    if (createIndices && (ServiceLocator.queryService as unknown) === ServiceLocator.defaultQueryService) {
      ServiceLocator.defaultQueryService.loadIDTable(this);
      ServiceLocator.defaultQueryService.loadPathTable(this);
    }
  }

  /**
   * Creates a CAEX document loaded from the specified URI (Node only; a synchronous load from an
   * http(s) URI is not supported).
   */
  static loadFromFile(inputUri: string, createIndices = false): CAEXDocument {
    const defaultXmlReaderSettings = CAEXDocument.DefaultXmlReaderSettings;
    const prepared = DocumentStreaming.prepareSettingsWithCredential(inputUri, defaultXmlReaderSettings as any);
    const localPath = prepared.localPath;
    if (!prepared.result && !fileExists(inputUri)) {
      throw new FileNotFoundException('inputUri: ' + inputUri);
    }
    const bytes = readFileSync(prepared.result ? (localPath ?? inputUri) : inputUri);
    const cAEXDocument = CAEXDocument.loadCaexDocument(bytes);
    cAEXDocument.filePath = localPath;
    cAEXDocument.loadIndices(createIndices);
    return cAEXDocument;
  }

  /** Creates a CAEX document loaded from a stream (the bytes of the stream). */
  static loadFromStream(inStream: Uint8Array | null, createIndices = false): CAEXDocument {
    if (inStream === null || inStream === undefined) {
      throw new ArgumentNullException('inStream');
    }
    const cAEXDocument = CAEXDocument.loadCaexDocument(inStream);
    cAEXDocument.loadIndices(createIndices);
    return cAEXDocument;
  }

  /** Creates a CAEX document from a string; returns null if the string cannot be loaded. */
  static loadFromString(utf8EncodedString: string | null, createIndices = false): CAEXDocument | null {
    if (isNullOrEmpty(utf8EncodedString)) {
      throw new ArgumentNullException('utf8EncodedString');
    }
    try {
      const cAEXDocument = CAEXDocument.createDocument(parseXDocument(utf8EncodedString, { preserveWhitespace: true }));
      cAEXDocument.loadIndices(createIndices);
      return cAEXDocument;
    } catch {
      return null;
    }
  }

  /** Asynchronously creates a CAEX document from a string; resolves to null if it cannot be loaded. */
  static async loadFromStringAsync(utf8EncodedString: string | null, createIndices = false): Promise<CAEXDocument | null> {
    if (isNullOrEmpty(utf8EncodedString)) {
      throw new ArgumentNullException('utf8EncodedString');
    }
    if (utf8EncodedString.includes('SchemaVersion="3.0"')) {
      const gt = utf8EncodedString.indexOf('>');
      if (gt < 0) {
        throw new ArgumentOutOfRangeException('length', 'Length cannot be less than zero.');
      }
      if (!utf8EncodedString.substring(0, gt).includes('xmlns')) {
        const text = utf8EncodedString;
        const num = utf8EncodedString.indexOf('CAEXFile') + 9;
        if (num > text.length) {
          throw new ArgumentOutOfRangeException('startIndex', 'startIndex cannot be larger than length of string.');
        }
        utf8EncodedString = '<CAEXFile xmlns="http://www.dke.de/CAEX" ' + text.substring(num, text.length);
      }
    }
    try {
      await Promise.resolve();
      const cAEXDocument = CAEXDocument.createDocument(parseXDocument(utf8EncodedString, { preserveWhitespace: true }));
      cAEXDocument.loadIndices(createIndices);
      return cAEXDocument;
    } catch {
      return null;
    }
  }

  /** Asynchronously loads a CAEX document from the specified bytes. */
  static async loadFromBinaryAsync(binary: Uint8Array | null, cancellationToken: unknown = null, createIndices = false): Promise<CAEXDocument> {
    if (binary === null || binary === undefined) {
      throw new ArgumentNullException('buffer');
    }
    return await CAEXDocument.loadFromStreamAsync(binary, cancellationToken, createIndices);
  }

  /** Asynchronously creates a CAEX document from a stream (the bytes of the stream). */
  static async loadFromStreamAsync(inStream: Uint8Array | null, cancellationToken: unknown = null, createIndices = false): Promise<CAEXDocument> {
    if (inStream === null || inStream === undefined) {
      throw new ArgumentNullException('inStream');
    }
    return await CAEXDocument.loadCaexDocumentAsync(inStream, null, cancellationToken, createIndices);
  }

  /** Asynchronously creates a CAEX document loaded from the specified URI (file or http(s)). */
  static async loadFromFileAsync(inputUri: string, cancellationToken: unknown = null, createIndices = false): Promise<CAEXDocument> {
    const asyncXmlReaderSettings = CAEXDocument.AsyncXmlReaderSettings;
    const prepared = DocumentStreaming.prepareSettingsWithCredential(inputUri, asyncXmlReaderSettings as any);
    const localPath = prepared.localPath;
    if (!prepared.result && !fileExists(inputUri)) {
      throw new FileNotFoundException('inputUri: ' + inputUri);
    }
    const target = prepared.result && !isHttp(inputUri) ? (localPath ?? inputUri) : inputUri;
    const bytes = await readUriAsync(target);
    return await CAEXDocument.loadCaexDocumentAsync(bytes, localPath, cancellationToken, createIndices);
  }

  /**
   * Creates a new empty CAEX document containing only the CAEXFile root element, with the
   * specified schema version (default: defaultSchema).
   */
  static new_CAEXDocument(schema: CAEXDocument_CAEXSchema = CAEXDocument.defaultSchema): CAEXDocument {
    const cAEXDocument = new T.CAEXDocument(schema);
    cAEXDocument.addXDocument(new XDocument(cAEXDocument.schemaManager.createElement(null, cAEXDocument.xName('CAEXFile'))));
    return cAEXDocument;
  }

  /** Saves the CAEX document to the specified file path (Node only). prettyPrint is ignored. */
  override saveToFile(filename: string, prettyPrint = true): void {
    void prettyPrint;
    if (isNullOrEmpty(filename)) {
      throw new ArgumentNullException('filename');
    }
    const filePath = this.filePath;
    if (!filename.endsWith('.tmp')) {
      this.filePath = filename;
      this.caexFile!.fileName = getFileName(this.filePath);
    }
    const fs = syncModule<NodeFs>('node:fs');
    if (fs === null) {
      throw new NotSupportedException('Saving to a file requires Node.js.');
    }
    const text = writeXDocument(this.xDocument!, {
      indent: true,
      omitDuplicateNamespaces: true,
      encodingName: 'utf-8',
      omitXmlDeclaration: false,
    });
    fs.writeFileSync(filename, CAEXDocument.Utf8NoBom.encode(text));
    if (!filename.endsWith('.tmp')) {
      this.documentSavedEvent.raise(this, filePath);
    }
  }

  /** Saves the CAEX document to the specified file path asynchronously (Node only). */
  async saveToFileAsync(filename: string, prettyPrint: boolean, cancellationToken: unknown = null): Promise<void> {
    void prettyPrint;
    void cancellationToken;
    if (isNullOrEmpty(filename)) {
      throw new ArgumentNullException('filename');
    }
    const filePathBefore = this.filePath;
    if (!filename.endsWith('.tmp')) {
      this.filePath = filename;
      this.caexFile!.fileName = getFileName(this.filePath);
    }
    const fs = syncModule<typeof import('node:fs/promises')>('node:fs/promises');
    if (fs === null) {
      throw new NotSupportedException('Saving to a file requires Node.js.');
    }
    const text = writeXDocument(this.xDocument!, {
      indent: true,
      omitDuplicateNamespaces: true,
      encodingName: 'utf-8',
      omitXmlDeclaration: true,
    });
    await fs.writeFile(filename, CAEXDocument.Utf8NoBom.encode(text));
    if (!filename.endsWith('.tmp')) {
      this.documentSavedEvent.raise(this, filePathBefore);
    }
  }

  /** Saves the CAEX document to a stream asynchronously; resolves to the bytes of the stream. */
  async saveToStreamAsync(prettyPrint: boolean, cancellationToken: unknown = null): Promise<Uint8Array> {
    void cancellationToken;
    await Promise.resolve();
    return saveXDocument(this.xDocument!, { disableFormatting: !prettyPrint, omitDuplicateNamespaces: true });
  }

  /** Saves the CAEX document to a stream; returns the bytes of the stream. */
  override saveToStream(prettyPrint: boolean): Uint8Array {
    return saveXDocument(this.xDocument!, { disableFormatting: !prettyPrint, omitDuplicateNamespaces: true });
  }

  /**
   * Checks if the document is schema compliant. Not available yet: XSD validation is not ported
   * (throws NotImplementedException).
   */
  validate(): { result: boolean; violationLog: string[] } {
    const r = this.schemaManager.validate(this.xDocument!);
    return { result: r.result, violationLog: r.messages };
  }

  /**
   * Gets the XName for the provided CAEX tag name, with the namespace of the assigned schema
   * (none for CAEX 2.15).
   */
  override xName(tagname: string): XName {
    if (isNullOrEmpty(tagname)) {
      throw new ArgumentNullException('tagname');
    }
    const xNamespace = this.schemaManager.namespace;
    if (!(xNamespace === XNamespace.None)) {
      return xNamespace.getName(tagname);
    }
    return XName.get(tagname);
  }

  /**
   * @internal FinalizeSchemaTransformation() (no argument), (XElement node) or
   * (IEnumerable&lt;XElement&gt; list).
   */
  finalizeSchemaTransformation(arg?: XElement | Iterable<XElement> | null): void {
    if (arguments.length === 0) {
      this.schemaManager.finalizeSchemaTransformation(this.xDocument?.root ?? (null as unknown as XElement));
      this.finalizeSchemaTransformationList(this.xDocument?.root ? [...this.xDocument.root.elements()] : null);
      this._isTransformationActive = false;
      return;
    }
    if (arg instanceof XElement) {
      const node = arg;
      this.schemaManager.finalizeSchemaTransformation(node);
      this.finalizeSchemaTransformationList([...node.elements()]);
      return;
    }
    this.finalizeSchemaTransformationList(arg ?? null);
  }

  /**
   * @internal TransformToSchema(CAEXSchema targetSchema) returns the prepared document;
   * TransformToSchema(XElement element) returns true, if the element has been adjusted.
   */
  transformToSchema(targetSchema: CAEXDocument_CAEXSchema): CAEXDocument;
  transformToSchema(element: XElement): boolean;
  transformToSchema(arg: CAEXDocument_CAEXSchema | XElement): CAEXDocument | boolean {
    if (typeof arg === 'number') {
      return this.transformDocumentToSchema(arg);
    }
    const element = arg;
    if (XmlCAEXSchema.caexSchema(element) === this.schema) {
      return false;
    }
    switch (this.schema) {
      case CAEXDocument_CAEXSchema.CAEX2_15:
        for (const item of element.descendantsAndSelf()) {
          T.AMLSchemaManager2_15.adjustNameToSchema(item);
        }
        break;
      case CAEXDocument_CAEXSchema.CAEX3_0:
        for (const item2 of element.descendantsAndSelf()) {
          T.AMLSchemaManager3_0.adjustNameToSchema(item2);
        }
        break;
    }
    return true;
  }

  private transformDocumentToSchema(targetSchema: CAEXDocument_CAEXSchema): CAEXDocument {
    if (this.schema === targetSchema) {
      return this;
    }
    const cAEXDocument = CAEXDocument.loadFromStream(this.saveToStream(true));
    ServiceLocator.undoRedoService?.pause(cAEXDocument);
    switch (targetSchema) {
      case CAEXDocument_CAEXSchema.CAEX2_15:
        cAEXDocument.schema = CAEXDocument_CAEXSchema.CAEX2_15;
        if (cAEXDocument.xDocument!.root !== null) {
          for (const item of cAEXDocument.xDocument!.root.descendants()) {
            T.AMLSchemaManager2_15.adjustNameToSchema(item);
          }
        }
        T.AMLSchemaManager2_15.instance.adjustCAEXFileToSchema(cAEXDocument.xDocument!.root!);
        break;
      case CAEXDocument_CAEXSchema.CAEX3_0:
        cAEXDocument.schema = CAEXDocument_CAEXSchema.CAEX3_0;
        if (cAEXDocument.xDocument!.root !== null) {
          for (const item2 of cAEXDocument.xDocument!.root.descendants()) {
            T.AMLSchemaManager3_0.adjustNameToSchema(item2);
          }
        }
        T.AMLSchemaManager3_0.instance.adjustCAEXFileToSchema(cAEXDocument.xDocument!.root!);
        break;
      default:
        throw new ArgumentOutOfRangeException('targetSchema');
    }
    ServiceLocator.undoRedoService?.resume(cAEXDocument);
    cAEXDocument._isTransformationActive = true;
    return cAEXDocument;
  }

  private static createDocument(xDocument: XDocument): CAEXDocument {
    const text = xDocument.root?.attribute('SchemaVersion')?.value ?? null;
    const cAEXDocument =
      text === '3.0'
        ? new T.CAEXDocument(CAEXDocument_CAEXSchema.CAEX3_0)
        : !(text === '2.15')
          ? new T.CAEXDocument(CAEXDocument_CAEXSchema.CAEX3_0)
          : new T.CAEXDocument(CAEXDocument_CAEXSchema.CAEX2_15);
    cAEXDocument.addXDocument(xDocument);
    return cAEXDocument;
  }

  private static getDescription(e: CAEXDocument_CAEXSchema): string | null {
    if (typeof e !== 'number') {
      return '';
    }
    return schemaDescriptions.get(e) ?? null;
  }

  /** LoadCaexDocument(XmlReader): XmlReader with IgnoreWhitespace over the bytes. */
  private static loadCaexDocument(bytes: Uint8Array): CAEXDocument {
    return CAEXDocument.createDocument(loadXDocument(bytes, { preserveWhitespace: false }));
  }

  private static async loadCaexDocumentAsync(
    bytes: Uint8Array,
    filePath: string | null,
    cancellationToken: unknown,
    createIndices = false,
  ): Promise<CAEXDocument> {
    void cancellationToken;
    await Promise.resolve();
    const cAEXDocument = CAEXDocument.createDocument(loadXDocument(bytes, { preserveWhitespace: false }));
    cAEXDocument.filePath = filePath;
    cAEXDocument.loadIndices(createIndices);
    return cAEXDocument;
  }

  /** @internal FinalizeSchemaTransformation(IEnumerable&lt;XElement&gt; list). */
  finalizeSchemaTransformationList(list: Iterable<XElement> | null): void {
    for (const item of list!) {
      if (!(item.name.localName === 'AdditionalInformation')) {
        this.schemaManager.finalizeSchemaTransformation(item);
        if (item.document !== null) {
          this.finalizeSchemaTransformationList([...item.elements()]);
        }
      }
    }
  }
}

registerInterfaces(CAEXDocument, 'IAMLFile');
T.CAEXDocument = CAEXDocument;
T.CAEXDocument_Commanding = CAEXDocument_Commanding;
