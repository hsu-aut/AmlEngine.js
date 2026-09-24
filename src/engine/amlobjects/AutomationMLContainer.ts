// Port of Aml.Engine.AmlObjects.AutomationMLContainer (Aml.Engine 4.5.2).
//
// System.IO.Packaging is replaced by the port in ./packaging (OPC on fflate, see Package.ts). A
// .NET Stream is a MemoryStream of ./packaging/MemoryStream.ts; methods taking a stream also take
// a Uint8Array (wrapped into a MemoryStream). A DirectoryInfo is a directory path or an object
// with `fullName`. File system access (paths, Extract) needs Node (node:fs); in a browser only
// the stream based members work.

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { from, invariantCompare, type Enumerable } from '../../system/linq.js';
import { FileNotFoundException } from '../../system/exceptions.js';
import { Uri, UriKind } from '../../system/index.js';
import { MimeTypeMap } from './mimetype/MimeTypeMap.js';
import * as NetPath from './internal/NetPath.js';
import { MemoryStream, SeekOrigin } from './packaging/MemoryStream.js';
import { PackUriHelper } from './packaging/PackUriHelper.js';
import {
  CompressionOption,
  FileAccess,
  FileMode,
  FileShare,
  Package,
  PackagePart,
  TargetMode,
  uriEquals,
  type PackagePartCollection,
  type PackageRelationshipCollection,
} from './packaging/Package.js';

/** A stream argument: a MemoryStream, or the bytes of the stream. */
export type StreamLike = MemoryStream | Uint8Array;

/** System.IO.DirectoryInfo: a directory path, or an object with the full name of the directory. */
export type DirectoryInfoLike = string | { readonly fullName: string };

function toStream(s: StreamLike): MemoryStream {
  return s instanceof MemoryStream ? s : new MemoryStream(s);
}

/**
 * The distinguished package part relationship types of an AutomationML container. This class
 * cannot be inherited.
 */
export class AutomationMLContainer_RelationshipType {
  /** Relationship type for package to part or root part to part relations to any content. */
  static readonly AnyContent = new AutomationMLContainer_RelationshipType(
    'http://schemas.automationml.org/container/relationship/AnyContent',
    'application/x-any',
  );

  /** Relationship type for package to part relation to the CAEX schema part. */
  static readonly CAEXSchema = new AutomationMLContainer_RelationshipType('http://schemas.automationml.org/container/relationship/CAEXSchema', 'text/xml');

  /** Relationship type for package to part or root part to part relations to a COLLADA part. */
  static readonly Collada = new AutomationMLContainer_RelationshipType(
    'http://schemas.automationml.org/container/relationship/Collada',
    'model/vnd.collada+xml',
  );

  /** Relationship type for package to part relation to the COLLADA schema part. */
  static readonly ColladaSchema = new AutomationMLContainer_RelationshipType(
    'http://schemas.automationml.org/container/relationship/ColladaSchema',
    'text/xml',
  );

  /** Relationship type for package to part or root part to part relations to a library part. */
  static readonly Library = new AutomationMLContainer_RelationshipType(
    'http://schemas.automationml.org/container/relationship/Library',
    'model/vnd.automationml+xml',
  );

  /** Relationship type for package to part or root part to part relations to a PLCopen XML part. */
  static readonly PLCopenXml = new AutomationMLContainer_RelationshipType(
    'http://schemas.automationml.org/container/relationship/PLCopenXml',
    'model/vnd.plcopen+xml',
  );

  /** Relationship type for package to part relation to the PLCopen XML schema part. */
  static readonly PLCopenXmlSchema = new AutomationMLContainer_RelationshipType(
    'http://schemas.automationml.org/container/relationship/PLCopenXmlSchema',
    'text/xml',
  );

  /** Relationship type for package to part relation to the root document. */
  static readonly Root = new AutomationMLContainer_RelationshipType(
    'http://schemas.automationml.org/container/relationship/RootDocument',
    'model/vnd.automationml+xml',
  );

  private readonly _mimeType: string | null;
  private readonly _name: string | null;

  /** The MIME type (content type) of the parts of this relationship type. */
  get mimeType(): string | null {
    return this._mimeType;
  }

  /** The name (URI) of the relationship type. */
  get name(): string | null {
    return this._name;
  }

  /** @internal */
  constructor(name: string | null, mimeType: string | null) {
    this._name = name;
    this._mimeType = mimeType;
  }

  /**
   * Gets an AnyContent relationship type for parts with the MIME type (default 'application/x-any').
   * @param mimeType The MIME type.
   */
  static getAnyContent(mimeType: string | null = null): AutomationMLContainer_RelationshipType {
    if (mimeType == null) {
      mimeType = AutomationMLContainer_RelationshipType.AnyContent.mimeType;
    }
    return new AutomationMLContainer_RelationshipType(AutomationMLContainer_RelationshipType.AnyContent.name, mimeType);
  }

  /** Compares the names (culture-invariant). */
  compareTo(other: AutomationMLContainer_RelationshipType): number {
    return invariantCompare(this._name as string, other.name as string);
  }

  /** The name. */
  toString(): string {
    return this._name as string;
  }
}

/**
 * An AutomationML container (AMLX): an OPC package containing an AutomationML document and the
 * documents it relates to. Parts are added with a relationship type (root document, libraries,
 * COLLADA, PLCopen XML, schemas, any content) and can be retrieved and extracted.
 */
export class AutomationMLContainer {
  /** Nested class AutomationMLContainer.RelationshipType. */
  static readonly RelationshipType = AutomationMLContainer_RelationshipType;

  /** The MIME type of an AutomationML main document. */
  static readonly AutomationMLMimeType = 'model/vnd.automationml.main+XML';

  private _disposed = false;

  /** The compression option for new parts. */
  compressionMode: CompressionOption = CompressionOption.Normal;

  /** The container file name ('{file stream}' for a stream container). */
  containerFilename: string | null = null;

  /** The file path of the container (IAMLFile). */
  get filePath(): string | null {
    return this.containerFilename;
  }

  private _extractionDirectory: string | null = null;

  /** The directory of the last extraction. */
  get extractionDirectory(): string | null {
    return this._extractionDirectory;
  }

  private _package: Package | null = null;

  /** The OPC package. */
  get package(): Package | null {
    return this._package;
  }

  /** The part of the root document, or `null`. */
  get rootPackage(): PackagePart | null {
    return from(this.getPartsByRelationShipType(AutomationMLContainer_RelationshipType.Root)).firstOrDefault();
  }

  /**
   * Opens or creates the container: on a file (`(containerFilePath[, packageMode[,
   * packageAccess[, packageShare]]])`; default OpenOrCreate/ReadWrite) or on a stream
   * (`(packageStream[, packageMode[, packageAccess]])`; `(packageStream)` opens read-only).
   */
  constructor(containerFilePath: string, packageMode?: FileMode, packageAccess?: FileAccess, packageShare?: FileShare);
  constructor(packageStream: StreamLike, packageMode?: FileMode, packageAccess?: FileAccess);
  constructor(arg0: string | StreamLike, packageMode?: FileMode, packageAccess?: FileAccess, packageShare?: FileShare) {
    if (typeof arg0 === 'string') {
      this.containerFilename = arg0;
      this._package = Package.open(arg0, packageMode, packageAccess, packageShare);
    } else {
      this.containerFilename = '{file stream}';
      this._package = Package.open(toStream(arg0), packageMode, packageAccess);
    }
  }

  /**
   * Adds a part with any content, related to the root document (`AddAnyContent(rootDocument,
   * fileName, partUri, mimeType, addPackageRelation)`: the MIME type is taken from the file
   * extension if not given; `AddAnyContent(rootDocument, inStream, partUri, mimeType,
   * addPackageRelation)`).
   */
  addAnyContent(
    rootDocument: PackagePart | null,
    fileNameOrStream: string | StreamLike,
    partUri: Uri,
    mimeType: string | null = null,
    addPackageRelation = true,
  ): PackagePart {
    if (typeof fileNameOrStream === 'string') {
      const fileName = fileNameOrStream;
      if (mimeType == null || mimeType.length === 0) {
        mimeType = from(MimeTypeMap.getMimeType(NetPath.getExtension(fileName))).firstOrDefault();
      }
      return this.addPackagePart(fileName, partUri, AutomationMLContainer_RelationshipType.getAnyContent(mimeType), addPackageRelation, rootDocument);
    }
    return this.addPackagePart(fileNameOrStream, partUri, AutomationMLContainer_RelationshipType.getAnyContent(mimeType), addPackageRelation, rootDocument);
  }

  /** Adds the CAEX schema (file or stream) with a package relationship. */
  addCAEXSchema(fileNameOrStream: string | StreamLike, partUri: Uri): PackagePart {
    return this.addPackagePart(fileNameOrStream, partUri, AutomationMLContainer_RelationshipType.CAEXSchema, true);
  }

  /** Adds a COLLADA document (file or stream), related to the root document. */
  addCollada(rootDocument: PackagePart | null, fileNameOrStream: string | StreamLike, partUri: Uri, addPackageRelation = true): PackagePart {
    return this.addPackagePart(fileNameOrStream, partUri, AutomationMLContainer_RelationshipType.Collada, addPackageRelation, rootDocument);
  }

  /** Adds the COLLADA schema (file or stream) with a package relationship. */
  addColladaSchema(fileNameOrStream: string | StreamLike, partUri: Uri): PackagePart {
    return this.addPackagePart(fileNameOrStream, partUri, AutomationMLContainer_RelationshipType.ColladaSchema, true);
  }

  /**
   * Adds a library document (file or stream): related to the root document
   * (`AddLibrary(rootDocument, fileName|inStream, partUri, addPackageRelation)`) or with a package
   * relationship (`AddLibrary(fileName|inStream, partUri)`).
   */
  addLibrary(rootDocument: PackagePart | null, fileNameOrStream: string | StreamLike, partUri: Uri, addPackageRelation?: boolean): PackagePart;
  addLibrary(fileNameOrStream: string | StreamLike, partUri: Uri): PackagePart;
  addLibrary(...args: unknown[]): PackagePart {
    if (args.length >= 3 || args[0] instanceof PackagePart || args[0] === null) {
      const rootDocument = args[0] as PackagePart | null;
      const fileNameOrStream = args[1] as string | StreamLike;
      const partUri = args[2] as Uri;
      const addPackageRelation = (args[3] as boolean | undefined) ?? true;
      return this.addPackagePart(fileNameOrStream, partUri, AutomationMLContainer_RelationshipType.Library, addPackageRelation, rootDocument);
    }
    return this.addPackagePart(args[0] as string | StreamLike, args[1] as Uri, AutomationMLContainer_RelationshipType.Library, true);
  }

  /** Adds a PLCopen XML document (file or stream), related to the root document. */
  addPLCopenXml(rootDocument: PackagePart | null, fileNameOrStream: string | StreamLike, partUri: Uri, addPackageRelation = true): PackagePart {
    return this.addPackagePart(fileNameOrStream, partUri, AutomationMLContainer_RelationshipType.PLCopenXml, addPackageRelation, rootDocument);
  }

  /** Adds the PLCopen XML schema (file or stream) with a package relationship. */
  addPLCopenXmlSchema(fileNameOrStream: string | StreamLike, partUri: Uri): PackagePart {
    return this.addPackagePart(fileNameOrStream, partUri, AutomationMLContainer_RelationshipType.PLCopenXmlSchema, true);
  }

  /** Adds the root document (file or stream) with a package relationship. */
  addRoot(fileNameOrStream: string | StreamLike, partUri: Uri): PackagePart {
    return this.addPackagePart(fileNameOrStream, partUri, AutomationMLContainer_RelationshipType.Root, true);
  }

  /**
   * Checks the relationships of the part with the type: yields the part URI, the resolved URI of
   * the related part and whether that part exists (lazy, like the C# iterator).
   */
  *checkRelatedParts(
    part: PackagePart,
    relationShipType: AutomationMLContainer_RelationshipType,
  ): Generator<{ partUri: Uri; relatedPartUri: Uri; exists: boolean }> {
    const relationshipsByType = part.getRelationshipsByType(relationShipType.toString());
    for (const item of relationshipsByType) {
      const uri = PackUriHelper.resolvePartUri(new Uri('/', UriKind.Relative), item.targetUri);
      yield this._package!.partExists(uri) ? { partUri: part.uri, relatedPartUri: uri, exists: true } : { partUri: part.uri, relatedPartUri: uri, exists: false };
    }
  }

  /** Flushes and closes the package (writes the file or stream). */
  close(): void {
    this._package!.flush();
    this._package!.close();
  }

  /**
   * Releases the package: `Dispose()` (IDisposable) calls `Dispose(true)`; `Dispose(bool
   * disposing)` (protected virtual in C#) closes the package when disposing.
   */
  dispose(disposing?: boolean): void {
    if (disposing === undefined) {
      this.dispose(true);
      return;
    }
    if (!this._disposed && disposing && this._package != null) {
      this._package.close();
      this._package = null;
    }
    this._disposed = true;
  }

  /**
   * Extracts all parts (`Extract(dirInfo)`) or one part (`Extract(dirInfo, part)`) into the
   * directory. Errors are written to the console, as in C#.
   */
  extract(dirInfo: DirectoryInfoLike, part?: PackagePart): void {
    if (part === undefined) {
      try {
        for (const p of this._package!.getParts()) {
          this.extract(dirInfo, p);
        }
      } catch (ex) {
        console.log((ex as Error).message);
      }
      return;
    }
    try {
      const fs = NetPath.getFs();
      const fullName = directoryFullName(dirInfo);
      if (!NetPath.directoryExists(fullName)) {
        fs.mkdirSync(fullName, { recursive: true });
      }
      this._extractionDirectory = fullName;
      const path = !part.uri.isAbsoluteUri ? NetPath.combine(fullName, AutomationMLContainer.relativePath(part.uri)) : part.uri.localPath;
      const directoryName = NetPath.getDirectoryName(path);
      if (!(directoryName == null || directoryName.length === 0) && !NetPath.directoryExists(directoryName)) {
        fs.mkdirSync(directoryName, { recursive: true });
      }
      const stream = part.getStream(FileMode.Open, FileAccess.Read);
      try {
        fs.writeFileSync(path, stream.toArray());
      } finally {
        stream.dispose();
      }
    } catch (ex) {
      console.log((ex as Error).message);
    }
  }

  /** Extracts all parts into the directory. */
  extractAllFiles(path: string): void {
    this._extractionDirectory = path;
    this.extract(path);
  }

  /** Flushes the package (relationships and content types; the file or stream is written on Close). */
  flush(): void {
    this._package!.flush();
  }

  /** Gets the part with the URI (Uri.Equals), or `null`. */
  getPart(partUri: Uri | null): PackagePart | null {
    return from(this.getParts()).firstOrDefault((p) => p.uri.equals(partUri));
  }

  /** Gets all parts (sorted by the normalized part name, including relationship parts). */
  getParts(): PackagePartCollection {
    return this._package!.getParts();
  }

  /** Gets the parts which are targets of package relationships of the type (lazy). */
  getPartsByRelationShipType(relationShipType: AutomationMLContainer_RelationshipType): Enumerable<PackagePart> {
    return from(this._package!.getRelationshipsByType(relationShipType.toString())).select((f) =>
      this._package!.getPart(PackUriHelper.resolvePartUri(new Uri('/', UriKind.Relative), f.targetUri)),
    );
  }

  /** Gets the target part of the package relationship of the type with the target URI, or `null`. */
  getRelatedPartByUri(refUri: Uri | null, relationShipType: AutomationMLContainer_RelationshipType): PackagePart | null {
    return from(this.getRelationShipsByType(relationShipType))
      .where((relationship) => uriEquals(relationship.targetUri, refUri))
      .select((relationship) => this._package!.getPart(PackUriHelper.resolvePartUri(new Uri('/', UriKind.Relative), relationship.targetUri)))
      .firstOrDefault();
  }

  /**
   * Gets the parts related to the part: all relationship targets (`GetRelatedParts(part)`, lazy;
   * a missing target throws on enumeration) or the existing targets of the relationships of the
   * type (`GetRelatedParts(part, relationShipType)`, lazy).
   */
  getRelatedParts(part: PackagePart, relationShipType?: AutomationMLContainer_RelationshipType): Iterable<PackagePart> {
    if (relationShipType === undefined) {
      return from(part.getRelationships()).select((f) =>
        this._package!.getPart(PackUriHelper.resolvePartUri(new Uri('/', UriKind.Relative), f.targetUri)),
      );
    }
    return this.getRelatedPartsOfType(part, relationShipType);
  }

  private *getRelatedPartsOfType(part: PackagePart, relationShipType: AutomationMLContainer_RelationshipType): Generator<PackagePart> {
    const relationshipsByType = part.getRelationshipsByType(relationShipType.toString());
    for (const item of relationshipsByType) {
      const partUri = PackUriHelper.resolvePartUri(new Uri('/', UriKind.Relative), item.targetUri);
      if (this._package!.partExists(partUri)) {
        yield this._package!.getPart(partUri);
      }
    }
  }

  /** Gets the package relationships. */
  getRelationShips(): PackageRelationshipCollection {
    return this._package!.getRelationships();
  }

  /** Gets the package relationships of the type. */
  getRelationShipsByType(relationType: AutomationMLContainer_RelationshipType): PackageRelationshipCollection {
    return this._package!.getRelationshipsByType(relationType.toString());
  }

  /** Determines whether a part with the URI exists. */
  partExists(partUri: Uri | null): boolean {
    return this._package!.partExists(partUri);
  }

  /** Determines whether a package relationship of the type exists. */
  relationShipExists(relationShipType: AutomationMLContainer_RelationshipType): boolean {
    return from(this._package!.getRelationships()).any((r) => r.relationshipType === relationShipType.name);
  }

  /**
   * Moves a part to a new URI and relinks the relationships: `RelinkPart(part, relatedPart,
   * newPartUri)`, and the obsolete `RelinkPart(oldPartUri, newPartUri)`.
   * @returns `true` if relinked (`false` from the obsolete overload if the part does not exist).
   */
  relinkPart(part: PackagePart, relatedPart: PackagePart | null, newPartUri: Uri): boolean;
  /** @deprecated Use overload */
  relinkPart(oldPartUri: Uri, newPartUri: Uri): boolean;
  relinkPart(...args: unknown[]): boolean {
    if (args.length === 2) {
      return this.relinkPartObsolete(args[0] as Uri, args[1] as Uri);
    }
    const part = args[0] as PackagePart;
    const relatedPart = args[1] as PackagePart | null;
    const newPartUri = args[2] as Uri;
    const stream = part.getStream();
    const memoryStream = new MemoryStream();
    try {
      stream.copyTo(memoryStream);
      stream.close();
      const oldPartUri = part.uri;
      const list = from(part.getRelationships())
        .where((r) => uriEquals(r.sourceUri, oldPartUri))
        .toList();
      const packageRelationship = from(part.package.getRelationships()).firstOrDefault((r) => uriEquals(r.targetUri, oldPartUri));
      if (packageRelationship != null) {
        part.package.deleteRelationship(packageRelationship.id);
      }
      const relationShipType = new AutomationMLContainer_RelationshipType(
        packageRelationship?.relationshipType ?? AutomationMLContainer_RelationshipType.AnyContent.name,
        part.contentType,
      );
      part.package.deletePart(oldPartUri);
      const packagePart = this.addPackagePart(memoryStream, newPartUri, relationShipType, packageRelationship != null);
      for (const item of list) {
        packagePart.createRelationship(item.targetUri, item.targetMode, item.relationshipType);
      }
      if (relatedPart == null) {
        return true;
      }
      for (const item2 of from(from(relatedPart.getRelationships()).toList()).where((partRel) => uriEquals(partRel.targetUri, oldPartUri))) {
        relatedPart.deleteRelationship(item2.id);
        relatedPart.createRelationship(newPartUri, item2.targetMode, item2.relationshipType);
      }
      return true;
    } finally {
      memoryStream.dispose();
      stream.dispose();
    }
  }

  private relinkPartObsolete(oldPartUri: Uri, newPartUri: Uri): boolean {
    const part = this.getPart(oldPartUri);
    if (part == null) {
      return false;
    }
    const stream = part.getStream();
    const memoryStream = new MemoryStream();
    try {
      stream.copyTo(memoryStream);
      stream.close();
      const list = from(part.getRelationships())
        .where((r) => uriEquals(r.targetUri, oldPartUri))
        .toList();
      const list2 = from(part.package.getRelationships())
        .where((r) => uriEquals(r.targetUri, oldPartUri))
        .toList();
      for (const item of list2) {
        part.package.deleteRelationship(item.id);
      }
      const list3: PackagePart[] = [];
      for (const item2 of list) {
        const part2 = this._package!.getPart(item2.sourceUri);
        part2.deleteRelationship(item2.id);
        list3.push(part2);
      }
      const relationShipType = new AutomationMLContainer_RelationshipType(list2.length > 0 ? list2[0]!.relationshipType : null, part.contentType);
      part.package.deletePart(oldPartUri);
      this.addPackagePart(memoryStream, newPartUri, relationShipType, list2.length > 0, list3.length > 0 ? list3[0]! : null);
      return true;
    } finally {
      memoryStream.dispose();
      stream.dispose();
    }
  }

  /**
   * Gets the file path of the root document in the directory ('' for a stream container or if
   * there is no root document).
   */
  rootDocumentPath(dirInfo: DirectoryInfoLike): string {
    const empty = '';
    if (this.containerFilename === '{file stream}') {
      return empty;
    }
    const source = from(this.getPartsByRelationShipType(AutomationMLContainer_RelationshipType.Root)).toList();
    if (source.length === 0 || source[0] == null) {
      return empty;
    }
    const uri = source[0].uri;
    return !uri.isAbsoluteUri
      ? NetPath.combine(directoryFullName(dirInfo), AutomationMLContainer.relativePath(uri))
      : uri.scheme.toUpperCase() === 'FILE'
        ? uri.localPath
        : uri.absolutePath;
  }

  /** Gets a stream on the root document, or `null`. */
  rootDocumentStream(): MemoryStream | null {
    return from(this.getPartsByRelationShipType(AutomationMLContainer_RelationshipType.Root)).firstOrDefault()?.getStream() ?? null;
  }

  /** Flushes the package. */
  save(): void {
    this._package!.flush();
  }

  private static relativePath(uri: Uri): string {
    const s = Uri.unescapeDataString(uri.originalString);
    let i = 0;
    while (i < s.length && s[i] === '/') i++;
    return s.substring(i);
  }

  private addPackagePart(
    source: string | StreamLike,
    partUri: Uri,
    relationShipType: AutomationMLContainer_RelationshipType,
    createPackageRelation: boolean,
    part: PackagePart | null = null,
  ): PackagePart {
    if (typeof source === 'string') {
      const fullPath = source;
      const fs = NetPath.getFs();
      if (!NetPath.fileExists(fullPath)) {
        throw new FileNotFoundException(`Could not find file '${NetPath.getFullPath(fullPath)}'.`);
      }
      const fileStream = new MemoryStream(fs.readFileSync(fullPath), true, false);
      const result = this.addPackagePart(fileStream, partUri, relationShipType, createPackageRelation, part);
      fileStream.close();
      return result;
    }
    const stream = toStream(source);
    const packagePart = this._package!.createPart(partUri, relationShipType.mimeType, this.compressionMode);
    if (stream.canSeek) {
      stream.seek(0, SeekOrigin.Begin);
    }
    const destination = packagePart.getStream();
    try {
      stream.copyTo(destination);
    } finally {
      destination.dispose();
    }
    part?.createRelationship(partUri, TargetMode.Internal, relationShipType.name);
    if (createPackageRelation) {
      this._package!.createRelationship(partUri, TargetMode.Internal, relationShipType.name);
    }
    this._package!.flush();
    return packagePart;
  }
}

/** DirectoryInfo.FullName. */
function directoryFullName(dirInfo: DirectoryInfoLike): string {
  return typeof dirInfo === 'string' ? NetPath.getFullPath(dirInfo) : dirInfo.fullName;
}

registerInterfaces(AutomationMLContainer, 'IAMLFile', 'IDisposable');

T.AutomationMLContainer = AutomationMLContainer;
T.AutomationMLContainer_RelationshipType = AutomationMLContainer_RelationshipType;
