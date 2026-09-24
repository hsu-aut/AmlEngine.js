// Port of System.IO.Packaging (10.0.3) as far as AutomationMLContainer uses it: Package and
// ZipPackage (merged into Package), PackagePart and ZipPackagePart (merged into PackagePart),
// PackageRelationship, PackageRelationshipCollection, the internal InternalRelationshipCollection
// and ContentTypeHelper, on the in-memory ZipArchive of ./ZipArchive.ts. Helper for
// AutomationMLContainer, no C# counterpart in Aml.Engine.
//
// Not ported: interleaved part pieces ("[n].piece" entries are ignored), PackageProperties (core
// properties), the markup compatibility processing of relationship parts (XmlCompatibilityReader),
// FileShare (ignored), FileAccess.Write packages behave like ReadWrite ones except that parts
// cannot be read. Part streams are always seekable (in .NET the streams of a package opened for
// reading are not). File system access uses node:fs synchronously (see ../internal/NetPath.ts).

import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
  FileNotFoundException,
  InvalidOperationException,
  NotSupportedException,
  ObjectDisposedException,
  SystemException,
} from '../../../system/exceptions.js';
import { Guid, Uri, UriKind } from '../../../system/index.js';
import {
  XAttribute,
  XCData,
  XComment,
  XDocument,
  XElement,
  XNamespace,
  XProcessingInstruction,
  XText,
  XmlException,
  isNCName,
  loadXDocument,
  writeXDocument,
} from '../../../xml/index.js';
import { UTF8, encodeWithPreamble } from '../../../xml/encoding.js';
import * as NetPath from '../internal/NetPath.js';
import { ContentType } from './ContentType.js';
import { MemoryStream } from './MemoryStream.js';
import { PackUriHelper, ValidatedPartUri, containerRelationshipPartName, packageRootUri } from './PackUriHelper.js';
import { CompressionLevel, InvalidDataException, ZipArchive, ZipArchiveMode, type ZipArchiveEntry } from './ZipArchive.js';

/** System.IO.IOException. */
export class IOException extends SystemException {
  override name = 'IOException';
}

/** System.IO.FileFormatException. */
export class FileFormatException extends SystemException {
  override name = 'FileFormatException';
}

/** System.IO.FileMode. */
export enum FileMode {
  CreateNew = 1,
  Create = 2,
  Open = 3,
  OpenOrCreate = 4,
  Truncate = 5,
  Append = 6,
}

/** System.IO.FileAccess. */
export enum FileAccess {
  Read = 1,
  Write = 2,
  ReadWrite = 3,
}

/** System.IO.FileShare (accepted, not enforced). */
export enum FileShare {
  None = 0,
  Read = 1,
  Write = 2,
  ReadWrite = 3,
  Delete = 4,
  Inheritable = 16,
}

/** System.IO.Packaging.CompressionOption. */
export enum CompressionOption {
  NotCompressed = -1,
  Normal = 0,
  Maximum = 1,
  Fast = 2,
  SuperFast = 3,
}

/** System.IO.Packaging.TargetMode. */
export enum TargetMode {
  Internal = 0,
  External = 1,
}

const RELATIONSHIPS_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const TYPES_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';
const CONTENT_TYPES_FILE = '[Content_Types].xml';
const relationshipPartContentType = new ContentType('application/vnd.openxmlformats-package.relationships+xml');

/** C# `Uri ==`: both null, or equal. */
function uriEquals(a: Uri | null, b: Uri | null): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a === b || a.equals(b);
}

function throwIfFileModeInvalid(mode: FileMode): void {
  if (mode < FileMode.CreateNew || mode > FileMode.Append) throw new ArgumentOutOfRangeException('mode');
}

function throwIfFileAccessInvalid(access: FileAccess): void {
  if (access < FileAccess.Read || access > FileAccess.ReadWrite) throw new ArgumentOutOfRangeException('access');
}

function throwIfCompressionOptionInvalid(compressionOption: CompressionOption): void {
  if (compressionOption < CompressionOption.NotCompressed || compressionOption > CompressionOption.SuperFast) {
    throw new ArgumentOutOfRangeException('compressionOption');
  }
}

function compressionLevelOf(compressionOption: CompressionOption): CompressionLevel {
  switch (compressionOption) {
    case CompressionOption.Normal:
      return CompressionLevel.Optimal;
    case CompressionOption.Maximum:
      return CompressionLevel.SmallestSize;
    case CompressionOption.Fast:
    case CompressionOption.SuperFast:
      return CompressionLevel.Fastest;
    default:
      return CompressionLevel.NoCompression;
  }
}

/** Dictionary<TKey, TValue> enumeration order: removed slots are reused, the last freed first. */
class SlotDictionary<V> {
  private readonly _slots: ({ key: string; value: V } | null)[] = [];
  private readonly _index = new Map<string, number>();
  private readonly _free: number[] = [];

  has(key: string): boolean {
    return this._index.has(key);
  }

  get(key: string): V | undefined {
    const i = this._index.get(key);
    return i === undefined ? undefined : this._slots[i]!.value;
  }

  add(key: string, value: V): void {
    if (this._index.has(key)) throw new ArgumentException(`An item with the same key has already been added. Key: ${key}`);
    const i = this._free.length > 0 ? this._free.pop()! : this._slots.length;
    this._slots[i] = { key, value };
    this._index.set(key, i);
  }

  remove(key: string): boolean {
    const i = this._index.get(key);
    if (i === undefined) return false;
    this._slots[i] = null;
    this._index.delete(key);
    this._free.push(i);
    return true;
  }

  *entries(): Generator<[string, V]> {
    for (const s of this._slots) if (s !== null) yield [s.key, s.value];
  }
}

/** ZipPackage.IgnoredItemHelper for entries without content type (pieces are not supported). */
class IgnoredItemHelper {
  private readonly _ignoredItemDictionary = new Map<string, string[]>();
  private readonly _extensionDictionary = new Map<string, string[]>();

  constructor(private readonly _zipArchive: ZipArchive) {}

  addItemForAtomicPart(partUri: ValidatedPartUri, zipFileName: string): void {
    const normalized = partUri.normalizedPartUriString;
    if (!this._ignoredItemDictionary.has(normalized)) this._ignoredItemDictionary.set(normalized, []);
    this._ignoredItemDictionary.get(normalized)!.push(zipFileName);
    const ext = partUri.partUriExtension.toUpperCase();
    if (!this._extensionDictionary.has(ext)) this._extensionDictionary.set(ext, []);
    this._extensionDictionary.get(ext)!.push(normalized);
  }

  delete(partUri: ValidatedPartUri): void {
    this.deleteCore(partUri.normalizedPartUriString);
  }

  deleteItemsWithSimilarExtension(extension: string): void {
    const list = this._extensionDictionary.get(extension.toUpperCase());
    if (list === undefined) return;
    for (const item of list) this.deleteCore(item);
    this._extensionDictionary.delete(extension.toUpperCase());
  }

  private deleteCore(normalizedPartName: string): void {
    const list = this._ignoredItemDictionary.get(normalizedPartName);
    if (list === undefined) return;
    for (const item of list) this._zipArchive.getEntry(item)?.delete();
    this._ignoredItemDictionary.delete(normalizedPartName);
  }
}

/** ZipPackage.ContentTypeHelper: the [Content_Types].xml part. */
class ContentTypeHelper {
  private _overrideDictionary: SlotDictionary<{ uri: ValidatedPartUri; contentType: ContentType }> | null = null;
  private readonly _defaultDictionary = new Map<string, { extension: string; contentType: ContentType }>();
  private _contentTypeZipArchiveEntry: ZipArchiveEntry | null = null;
  private _contentTypeStreamExists = false;
  private _dirty = false;
  private _cachedCompressionLevel: CompressionLevel = CompressionLevel.Optimal;

  constructor(
    private readonly _zipArchive: ZipArchive,
    private readonly _ignoredItemHelper: IgnoredItemHelper,
  ) {
    if (_zipArchive.mode === ZipArchiveMode.Read || _zipArchive.mode === ZipArchiveMode.Update) {
      this.parseContentTypesFile();
    }
    this._dirty = false;
  }

  addContentType(partUri: ValidatedPartUri, contentType: ContentType, compressionLevel: CompressionLevel): void {
    if (!this._contentTypeStreamExists) {
      this._cachedCompressionLevel = compressionLevel;
    }
    let flag = false;
    const partUriExtension = partUri.partUriExtension;
    const value = this._defaultDictionary.get(partUriExtension.toUpperCase());
    if (partUriExtension.length === 0 || (value !== undefined && !(flag = value.contentType.areTypeAndSubTypeEqual(contentType)))) {
      this.addOverrideElement(partUri, contentType);
    } else if (!flag) {
      this.addDefaultElement(partUriExtension, contentType);
      this._ignoredItemHelper.deleteItemsWithSimilarExtension(partUriExtension);
    }
  }

  getContentType(partUri: ValidatedPartUri): ContentType | null {
    const o = this._overrideDictionary?.get(partUri.normalizedPartUriString);
    if (o !== undefined) return o.contentType;
    return this._defaultDictionary.get(partUri.partUriExtension.toUpperCase())?.contentType ?? null;
  }

  deleteContentType(partUri: ValidatedPartUri): void {
    if (this._overrideDictionary != null && this._overrideDictionary.remove(partUri.normalizedPartUriString)) {
      this._dirty = true;
    }
  }

  saveToFile(): void {
    if (!this._dirty) return;
    if (!this._contentTypeStreamExists) {
      this._contentTypeZipArchiveEntry = this._zipArchive.createEntry(CONTENT_TYPES_FILE, this._cachedCompressionLevel);
      this._contentTypeStreamExists = true;
    } else {
      this._contentTypeZipArchiveEntry!.delete();
      this._contentTypeZipArchiveEntry = this._zipArchive.createEntry(CONTENT_TYPES_FILE);
    }
    const ns = XNamespace.get(TYPES_NS);
    const root = new XElement(ns.getName('Types'));
    for (const { extension, contentType } of this._defaultDictionary.values()) {
      root.add(new XElement(ns.getName('Default'), new XAttribute('Extension', extension), new XAttribute('ContentType', contentType.toString())));
    }
    if (this._overrideDictionary != null) {
      for (const [, { uri, contentType }] of this._overrideDictionary.entries()) {
        root.add(new XElement(ns.getName('Override'), new XAttribute('PartName', uri.partUriString), new XAttribute('ContentType', contentType.toString())));
      }
    }
    const buffer = this._contentTypeZipArchiveEntry.open();
    const bytes = xmlBytes(root);
    buffer.length = 0;
    buffer.ensureCapacity(bytes.length);
    buffer.bytes.set(bytes);
    buffer.length = bytes.length;
    buffer.changed();
    this._dirty = false;
  }

  private parseContentTypesFile(): void {
    for (const e of this._zipArchive.entries) {
      if (e.fullName.toUpperCase().startsWith('[CONTENT_TYPES].XML') && e.fullName.length === CONTENT_TYPES_FILE.length) {
        this._contentTypeZipArchiveEntry = e;
      }
    }
    if (this._contentTypeZipArchiveEntry == null) return;
    this._contentTypeStreamExists = true;
    const doc = loadXml(this._contentTypeZipArchiveEntry.open().toArray());
    const root = doc.root;
    if (root == null || root.name.namespaceName !== TYPES_NS || root.name.localName !== 'Types' || prefixed(root)) {
      throw new XmlException('Required Types tag not found.');
    }
    if (nonXmlnsAttributeCount(root) > 0) {
      throw new XmlException('Types tag has attributes not valid per the schema.');
    }
    for (const node of root.nodes()) {
      if (!(node instanceof XElement)) {
        if (isIgnorable(node)) continue;
        throw new XmlException('Content Types XML does not match schema.');
      }
      if (node.name.namespaceName === TYPES_NS && node.name.localName === 'Default' && !prefixed(node)) {
        this.processDefaultTagAttributes(node);
      } else if (node.name.namespaceName === TYPES_NS && node.name.localName === 'Override' && !prefixed(node)) {
        this.processOverrideTagAttributes(node);
      } else {
        throw new XmlException('Content Types XML does not match schema.');
      }
    }
  }

  private processDefaultTagAttributes(element: XElement): void {
    if (nonXmlnsAttributeCount(element) !== 2) {
      throw new XmlException('Default tag is not valid per the schema. Verify that attributes are correct.');
    }
    const extension = element.attribute('Extension')?.value ?? null;
    validateXmlAttribute('Extension', extension, 'Default');
    const contentType = element.attribute('ContentType')?.value ?? null;
    throwIfXmlAttributeMissing('ContentType', contentType, 'Default');
    const validated = PackUriHelper.validatePartUri(new Uri('/tempfiles/sample.' + extension, UriKind.Relative));
    const key = validated.partUriExtension.toUpperCase();
    if (this._defaultDictionary.has(key)) {
      throw new ArgumentException(`An item with the same key has already been added. Key: ${validated.partUriExtension}`);
    }
    this._defaultDictionary.set(key, { extension: validated.partUriExtension, contentType: new ContentType(contentType) });
    processEndElement(element, 'Default');
  }

  private processOverrideTagAttributes(element: XElement): void {
    if (nonXmlnsAttributeCount(element) !== 2) {
      throw new XmlException('Override tag is not valid per the schema. Verify that attributes are correct.');
    }
    const partName = element.attribute('PartName')?.value ?? null;
    validateXmlAttribute('PartName', partName, 'Override');
    const contentType = element.attribute('ContentType')?.value ?? null;
    throwIfXmlAttributeMissing('ContentType', contentType, 'Override');
    const key = PackUriHelper.validatePartUri(new Uri(partName, UriKind.Relative));
    this._overrideDictionary ??= new SlotDictionary();
    this._overrideDictionary.add(key.normalizedPartUriString, { uri: key, contentType: new ContentType(contentType) });
    processEndElement(element, 'Override');
  }

  private addOverrideElement(partUri: ValidatedPartUri, contentType: ContentType): void {
    this.deleteContentType(partUri);
    this._overrideDictionary ??= new SlotDictionary();
    this._overrideDictionary.add(partUri.normalizedPartUriString, { uri: partUri, contentType });
    this._dirty = true;
  }

  private addDefaultElement(extension: string, contentType: ContentType): void {
    const key = extension.toUpperCase();
    if (this._defaultDictionary.has(key)) throw new ArgumentException(`An item with the same key has already been added. Key: ${extension}`);
    this._defaultDictionary.set(key, { extension, contentType });
    this._dirty = true;
  }
}

function validateXmlAttribute(attributeName: string, attributeValue: string | null, tagName: string): void {
  throwIfXmlAttributeMissing(attributeName, attributeValue, tagName);
  if (attributeValue!.length === 0) {
    throw new XmlException(`'${tagName}' tag requires a nonempty '${attributeName}' attribute.`);
  }
}

function throwIfXmlAttributeMissing(attributeName: string, attributeValue: string | null, tagName: string): void {
  if (attributeValue == null) {
    throw new XmlException(`'${tagName}' tag requires attribute '${attributeName}'.`);
  }
}

/** The element must be empty (whitespace allowed). */
function processEndElement(element: XElement, elementName: string): void {
  for (const n of element.nodes()) {
    if (!isIgnorable(n) || n instanceof XElement) {
      throw new XmlException(`'${elementName}' element must be empty.`);
    }
  }
}

/** Nodes an XmlReader skips with MoveToContent and IgnoreWhitespace: comments, PIs, white space. */
function isIgnorable(node: unknown): boolean {
  if (node instanceof XComment || node instanceof XProcessingInstruction) return true;
  if (node instanceof XText && !(node instanceof XCData)) return /^[ \t\r\n]*$/.test(node.value);
  return false;
}

function prefixed(element: XElement): boolean {
  const ns = element.name.namespace;
  return ns.namespaceName !== '' && element.getPrefixOfNamespace(ns) != null && element.getPrefixOfNamespace(ns) !== '';
}

function nonXmlnsAttributeCount(element: XElement): number {
  let n = 0;
  for (const a of element.attributes()) if (!a.isNamespaceDeclaration) n++;
  return n;
}

/** XmlReader over the bytes: the encoding must be UTF-8 or UTF-16. */
function loadXml(bytes: Uint8Array): XDocument {
  const doc = loadXDocument(bytes);
  const enc = doc.declaration?.encoding ?? null;
  if (enc != null && enc.length > 0 && enc.toLowerCase() !== 'utf-8' && enc.toLowerCase() !== 'utf-16') {
    throw new FileFormatException('Encoding format is not supported. Only UTF-8 and UTF-16 are supported.');
  }
  return doc;
}

/** XmlWriter.Create(stream, { Encoding = UTF8 }): declaration, no indentation, UTF-8 with BOM. */
function xmlBytes(root: XElement): Uint8Array {
  const text = writeXDocument(new XDocument(root), { indent: false, encodingName: 'utf-8' });
  return encodeWithPreamble(text, UTF8, true);
}

/** A relationship between a source (package or part) and a target (part or external resource). */
export class PackageRelationship {
  private readonly _package: Package;
  private readonly _source: PackagePart | null;
  private readonly _targetUri: Uri;
  private readonly _relationshipType: string;
  private readonly _targetMode: TargetMode;
  private readonly _id: string;

  /** @internal */
  constructor(pkg: Package, sourcePart: PackagePart | null, targetUri: Uri, targetMode: TargetMode, relationshipType: string, id: string) {
    if (pkg == null) throw new ArgumentNullException('package');
    if (targetUri == null) throw new ArgumentNullException('targetUri');
    if (relationshipType == null) throw new ArgumentNullException('relationshipType');
    if (id == null) throw new ArgumentNullException('id');
    this._package = pkg;
    this._source = sourcePart;
    this._targetUri = targetUri;
    this._relationshipType = relationshipType;
    this._targetMode = targetMode;
    this._id = id;
  }

  /** The URI of the source ("/" for the package). */
  get sourceUri(): Uri {
    if (this._source == null) return packageRootUri;
    return this._source.uri;
  }

  /** The URI of the target as given (relative or absolute). */
  get targetUri(): Uri {
    return this._targetUri;
  }

  /** The relationship type. */
  get relationshipType(): string {
    return this._relationshipType;
  }

  /** The target mode. */
  get targetMode(): TargetMode {
    return this._targetMode;
  }

  /** The relationship ID. */
  get id(): string {
    return this._id;
  }

  /** The package. */
  get package(): Package {
    return this._package;
  }
}

/** The relationships of a package or a part, optionally filtered by type. */
export class PackageRelationshipCollection implements Iterable<PackageRelationship> {
  /** @internal */
  constructor(
    private readonly _relationships: InternalRelationshipCollection,
    private readonly _filter: string | null,
  ) {}

  *[Symbol.iterator](): Iterator<PackageRelationship> {
    for (const r of this._relationships) {
      if (this._filter == null || this._filter === r.relationshipType) yield r;
    }
  }
}

/** The relationships of one source with their relationship part. */
class InternalRelationshipCollection implements Iterable<PackageRelationship> {
  private readonly _relationships = new Map<string, PackageRelationship>();
  private _dirty = false;
  private readonly _package: Package;
  private readonly _sourcePart: PackagePart | null;
  private _relationshipPart: PackagePart | null = null;
  private readonly _uri: ValidatedPartUri;

  constructor(pkg: Package, part: PackagePart | null) {
    this._package = pkg;
    this._sourcePart = part;
    this._uri = PackUriHelper.getRelationshipPartUri(part != null ? part.uri : packageRootUri);
    if ((pkg.fileOpenAccess === FileAccess.Read || pkg.fileOpenAccess === FileAccess.ReadWrite) && pkg.partExists(this._uri)) {
      this._relationshipPart = pkg.getPart(this._uri);
      InternalRelationshipCollection.throwIfIncorrectContentType(this._relationshipPart.validatedContentType);
      this.parseRelationshipPart(this._relationshipPart);
    }
    this._dirty = false;
  }

  [Symbol.iterator](): Iterator<PackageRelationship> {
    return this._relationships.values();
  }

  add(targetUri: Uri | null, targetMode: TargetMode, relationshipType: string | null, id: string | null, parsing = false): PackageRelationship {
    if (targetUri == null) throw new ArgumentNullException('targetUri');
    if (relationshipType == null) throw new ArgumentNullException('relationshipType');
    InternalRelationshipCollection.throwIfInvalidRelationshipType(relationshipType);
    switch (targetMode) {
      case TargetMode.Internal:
        if (targetUri.isAbsoluteUri) {
          throw new ArgumentException('PackageRelationship target must be relative URI if TargetMode is Internal.', 'targetUri');
        }
        break;
      case TargetMode.External:
        break;
      default:
        throw new ArgumentOutOfRangeException('targetMode');
    }
    if ((!targetUri.isAbsoluteUri && targetMode !== TargetMode.External) || (targetUri.isAbsoluteUri && targetUri.scheme === 'pack')) {
      const resolvedTargetUri = PackUriHelper.resolvePartUri(this._sourcePart == null ? packageRootUri : this._sourcePart.uri, targetUri);
      if (resolvedTargetUri != null && PackUriHelper.isRelationshipPartUri(resolvedTargetUri)) {
        throw new ArgumentException('PackageRelationship cannot target another PackageRelationship.', 'targetUri');
      }
    }
    if (id == null) {
      id = this.generateUniqueRelationshipId();
    } else {
      this.validateUniqueRelationshipId(id);
    }
    const packageRelationship = new PackageRelationship(this._package, this._sourcePart, targetUri, targetMode, relationshipType, id);
    this._relationships.set(id, packageRelationship);
    this._dirty = !parsing;
    return packageRelationship;
  }

  getRelationship(id: string): PackageRelationship | null {
    return this._relationships.get(id) ?? null;
  }

  delete(id: string): void {
    this._dirty = this._relationships.delete(id) || this._dirty;
  }

  clear(): void {
    this._relationships.clear();
    this._dirty = true;
  }

  flush(): void {
    if (!this._dirty) return;
    if (this._relationships.size === 0) {
      if (this._package.partExists(this._uri)) {
        this._package.deletePart(this._uri);
      }
      this._relationshipPart = null;
    } else {
      this.ensureRelationshipPart();
      this.writeRelationshipPart(this._relationshipPart!);
    }
    this._dirty = false;
  }

  static throwIfInvalidRelationshipType(relationshipType: string): void {
    if (relationshipType.trim().length === 0) {
      throw new ArgumentException('Relationship Type cannot contain only spaces or be empty.');
    }
  }

  static throwIfInvalidXsdId(id: string): void {
    if (!isNCName(id)) {
      throw new XmlException(`'${id}' ID is not a valid XSD ID.`);
    }
  }

  private parseRelationshipPart(part: PackagePart): void {
    const stream = part.getStream(FileMode.Open, FileAccess.Read);
    const doc = loadXml(stream.toArray());
    stream.dispose();
    const root = doc.root;
    if (root == null || root.name.localName !== 'Relationships' || root.name.namespaceName !== RELATIONSHIPS_NS) {
      throw new XmlException('Relationships tag expected at root level.');
    }
    InternalRelationshipCollection.throwIfXmlBaseAttributeIsPresent(root);
    if (nonXmlnsAttributeCount(root) > 0) {
      throw new XmlException('Relationships tag has extra attributes.');
    }
    for (const node of root.nodes()) {
      if (!(node instanceof XElement)) {
        if (isIgnorable(node)) continue;
        throw new XmlException('Unrecognized tag found in Relationships XML.');
      }
      if (node.name.localName === 'Relationship' && node.name.namespaceName === RELATIONSHIPS_NS) {
        InternalRelationshipCollection.throwIfXmlBaseAttributeIsPresent(node);
        let num = 3;
        if (node.attribute('TargetMode') != null) num++;
        if (nonXmlnsAttributeCount(node) !== num) {
          throw new XmlException('Relationship tag contains incorrect attribute.');
        }
        this.processRelationshipAttributes(node);
        processEndElement(node, 'Relationship');
      } else {
        throw new XmlException('Unrecognized tag found in Relationships XML.');
      }
    }
  }

  private processRelationshipAttributes(element: XElement): void {
    const attribute = element.attribute('TargetMode')?.value ?? null;
    let targetMode = TargetMode.Internal;
    if (attribute != null) {
      const t = attribute.trim();
      if (t === 'Internal') targetMode = TargetMode.Internal;
      else if (t === 'External') targetMode = TargetMode.External;
      else if (/^[+-]?[0-9]+$/.test(t)) targetMode = Number(t) as TargetMode;
      else throw new XmlException("'TargetMode' attribute value is not valid.");
    }
    const attribute2 = element.attribute('Target')?.value ?? null;
    if (attribute2 == null || attribute2.length === 0) {
      throw new XmlException("Relationship tag requires attribute 'Target'.");
    }
    const targetUri = new Uri(attribute2, UriKind.RelativeOrAbsolute);
    const attribute3 = element.attribute('Type')?.value ?? null;
    if (attribute3 == null || attribute3.length === 0) {
      throw new XmlException("Relationship tag requires attribute 'Type'.");
    }
    const attribute4 = element.attribute('Id')?.value ?? null;
    if (attribute4 == null || attribute4.length === 0) {
      throw new XmlException("Relationship tag requires attribute 'Id'.");
    }
    this.add(targetUri, targetMode, attribute3, attribute4, true);
  }

  private writeRelationshipPart(part: PackagePart): void {
    const stream = part.getStream();
    if (this._package.fileOpenAccess !== FileAccess.Write) {
      stream.setLength(0);
    }
    const root = new XElement(XNamespace.get(RELATIONSHIPS_NS).getName('Relationships'));
    for (const relationship of this._relationships.values()) {
      const e = new XElement(XNamespace.get(RELATIONSHIPS_NS).getName('Relationship'));
      e.add(new XAttribute('Type', relationship.relationshipType));
      e.add(new XAttribute('Target', relationship.targetUri.originalString));
      if (relationship.targetMode === TargetMode.External) {
        e.add(new XAttribute('TargetMode', TargetMode[relationship.targetMode] ?? String(relationship.targetMode)));
      }
      e.add(new XAttribute('Id', relationship.id));
      root.add(e);
    }
    const bytes = xmlBytes(root);
    stream.write(bytes, 0, bytes.length);
    stream.dispose();
  }

  private ensureRelationshipPart(): void {
    if (this._relationshipPart == null || this._relationshipPart.isDeleted) {
      if (this._package.partExists(this._uri)) {
        this._relationshipPart = this._package.getPart(this._uri);
        InternalRelationshipCollection.throwIfIncorrectContentType(this._relationshipPart.validatedContentType);
      } else {
        const compressionOption = this._sourcePart == null ? CompressionOption.NotCompressed : this._sourcePart.compressionOption;
        this._relationshipPart = this._package.createPart(this._uri, relationshipPartContentType.toString(), compressionOption);
      }
    }
  }

  private static throwIfIncorrectContentType(contentType: ContentType): void {
    if (!contentType.areTypeAndSubTypeEqual(relationshipPartContentType)) {
      throw new FileFormatException('Incorrect content type for PackageRelationship part.');
    }
  }

  private static throwIfXmlBaseAttributeIsPresent(element: XElement): void {
    if (element.attribute(XNamespace.Xml.getName('base')) != null) {
      throw new XmlException("Relationships XML elements cannot specify attribute 'xml:base'.");
    }
  }

  private generateUniqueRelationshipId(): string {
    let text: string;
    do {
      text = 'R' + Guid.newGuid().toString('N').substring(0, 16);
    } while (this._relationships.has(text));
    return text;
  }

  private validateUniqueRelationshipId(id: string): void {
    InternalRelationshipCollection.throwIfInvalidXsdId(id);
    if (this._relationships.has(id)) {
      throw new XmlException(`'${id}' ID conflicts with the ID of an existing relationship for the specified source.`);
    }
  }
}

/** A part of a package (PackagePart / ZipPackagePart). */
export class PackagePart {
  private readonly _uri: ValidatedPartUri;
  private _container: Package | null;
  private readonly _contentType: ContentType;
  private _requestedStreams: MemoryStream[] | null = null;
  private _relationships: InternalRelationshipCollection | null = null;
  private readonly _compressionOption: CompressionOption;
  private _disposed = false;
  private _deleted = false;
  private readonly _isRelationshipPart: boolean;
  private readonly _zipArchiveEntry: ZipArchiveEntry;

  /** @internal */
  constructor(pkg: Package, zipArchiveEntry: ZipArchiveEntry, partUri: ValidatedPartUri, contentType: string, compressionOption: CompressionOption) {
    throwIfCompressionOptionInvalid(compressionOption);
    this._uri = PackUriHelper.validatePartUri(partUri);
    this._container = pkg;
    this._contentType = new ContentType(contentType);
    this._compressionOption = compressionOption;
    this._isRelationshipPart = PackUriHelper.isRelationshipPartUri(partUri);
    this._zipArchiveEntry = zipArchiveEntry;
  }

  /** The part URI. */
  get uri(): ValidatedPartUri {
    this.checkInvalidState();
    return this._uri;
  }

  /** The content type (canonical form). */
  get contentType(): string {
    this.checkInvalidState();
    return this._contentType.toString();
  }

  /** The package. */
  get package(): Package {
    this.checkInvalidState();
    return this._container!;
  }

  /** The compression option (Normal for parts read from an archive). */
  get compressionOption(): CompressionOption {
    this.checkInvalidState();
    return this._compressionOption;
  }

  /** @internal */
  get isRelationshipPart(): boolean {
    return this._isRelationshipPart;
  }

  /** @internal */
  get isDeleted(): boolean {
    return this._deleted;
  }

  set isDeleted(value: boolean) {
    this._deleted = value;
  }

  /** @internal */
  get isClosed(): boolean {
    return this._disposed;
  }

  /** @internal */
  get validatedContentType(): ContentType {
    return this._contentType;
  }

  /** @internal */
  get zipArchiveEntry(): ZipArchiveEntry {
    return this._zipArchiveEntry;
  }

  /**
   * Gets a stream on the content (`GetStream()`: OpenOrCreate with the access of the package,
   * `GetStream(FileMode)`, `GetStream(FileMode, FileAccess)`).
   */
  getStream(mode: FileMode = FileMode.OpenOrCreate, access?: FileAccess): MemoryStream {
    this.checkInvalidState();
    const a = access ?? this._container!.fileOpenAccess;
    this.throwIfOpenAccessModesAreIncompatible(mode, a);
    switch (mode) {
      case FileMode.CreateNew:
        throw new ArgumentException('CreateNew not supported');
      case FileMode.Truncate:
        throw new ArgumentException('Truncate not supported');
    }
    const streamCore = this.getStreamCore(mode, a);
    this._requestedStreams ??= [];
    this._requestedStreams = this._requestedStreams.filter((s) => s.canRead || s.canSeek || s.canWrite);
    this._requestedStreams.push(streamCore);
    return streamCore;
  }

  private getStreamCore(streamFileMode: FileMode, streamFileAccess: FileAccess): MemoryStream {
    if (streamFileMode === FileMode.Create && this._zipArchiveEntry.archive?.mode !== ZipArchiveMode.Create) {
      const s = this.openEntry(streamFileAccess);
      s.setLength(0);
      s.dispose();
    }
    return this.openEntry(streamFileAccess);
  }

  /** ZipStreamManager.Open: read/write permissions from the package and stream access. */
  private openEntry(streamFileAccess: FileAccess): MemoryStream {
    let canRead = true;
    let canWrite = true;
    switch (this._container!.fileOpenAccess) {
      case FileAccess.Read:
        canRead = streamFileAccess !== FileAccess.Write;
        canWrite = false;
        break;
      case FileAccess.Write:
        canRead = false;
        canWrite = streamFileAccess !== FileAccess.Read;
        break;
      case FileAccess.ReadWrite:
        canRead = streamFileAccess !== FileAccess.Write;
        canWrite = streamFileAccess !== FileAccess.Read;
        break;
    }
    return new MemoryStream(this._zipArchiveEntry.open(), canRead, canWrite);
  }

  /** Creates a relationship from this part to the target. */
  createRelationship(targetUri: Uri | null, targetMode: TargetMode, relationshipType: string | null, id: string | null = null): PackageRelationship {
    this.checkInvalidState();
    this._container!.throwIfReadOnly();
    this.ensureRelationships();
    return this._relationships!.add(targetUri, targetMode, relationshipType, id);
  }

  /** Deletes the relationship with the ID. */
  deleteRelationship(id: string | null): void {
    this.checkInvalidState();
    this._container!.throwIfReadOnly();
    if (id == null) throw new ArgumentNullException('id');
    InternalRelationshipCollection.throwIfInvalidXsdId(id);
    this.ensureRelationships();
    this._relationships!.delete(id);
  }

  /** The relationships of this part. */
  getRelationships(): PackageRelationshipCollection {
    return this.getRelationshipsHelper(null);
  }

  /** The relationships of this part with the type. */
  getRelationshipsByType(relationshipType: string | null): PackageRelationshipCollection {
    this.checkInvalidState();
    this._container!.throwIfWriteOnly();
    if (relationshipType == null) throw new ArgumentNullException('relationshipType');
    InternalRelationshipCollection.throwIfInvalidRelationshipType(relationshipType);
    return this.getRelationshipsHelper(relationshipType);
  }

  /** The relationship with the ID; InvalidOperationException if there is none. */
  getRelationship(id: string | null): PackageRelationship {
    const r = this.getRelationshipHelper(id);
    if (r == null) throw new InvalidOperationException('PackageRelationship with specified ID does not exist for the source part.');
    return r;
  }

  /** Whether a relationship with the ID exists. */
  relationshipExists(id: string | null): boolean {
    return this.getRelationshipHelper(id) != null;
  }

  /** @internal */
  clearRelationships(): void {
    this._relationships?.clear();
  }

  /** @internal */
  close(): void {
    if (this._disposed) return;
    try {
      if (this._requestedStreams == null) return;
      if (!this._deleted) {
        for (const s of this._requestedStreams) s.dispose();
      }
    } finally {
      this._requestedStreams = null;
      this._relationships = null;
      this._container = null;
      this._disposed = true;
    }
  }

  /** @internal */
  flushRelationships(): void {
    if (this._relationships != null && this._container!.fileOpenAccess !== FileAccess.Read) {
      this._relationships.flush();
    }
  }

  /** @internal */
  closeRelationships(): void {
    if (!this._deleted) this.flushRelationships();
  }

  private ensureRelationships(): void {
    if (this._relationships == null) {
      if (this.isRelationshipPart) throw new InvalidOperationException('PackageRelationship parts cannot have relationships to other parts.');
      this._relationships = new InternalRelationshipCollection(this._container!, this);
    }
  }

  private throwIfOpenAccessModesAreIncompatible(mode: FileMode, access: FileAccess): void {
    throwIfFileModeInvalid(mode);
    throwIfFileAccessInvalid(access);
    if (access === FileAccess.Read && (mode === FileMode.Create || mode === FileMode.CreateNew || mode === FileMode.Truncate || mode === FileMode.Append)) {
      throw new IOException(
        'Cannot get stream with FileMode.Create, FileMode.CreateNew, FileMode.Truncate, FileMode.Append when access is FileAccess.Read.',
      );
    }
    const packageAccess = this._container!.fileOpenAccess;
    if ((packageAccess === FileAccess.Read && access !== FileAccess.Read) || (packageAccess === FileAccess.Write && access !== FileAccess.Write)) {
      throw new IOException('FileMode/FileAccess for Part.GetStream is not compatible with FileMode/FileAccess used to open the Package.');
    }
  }

  private checkInvalidState(): void {
    if (this._deleted) throw new InvalidOperationException('Part was deleted.');
    if (this._container == null) throw new InvalidOperationException('Cannot access part because parent package was closed.');
  }

  private getRelationshipHelper(id: string | null): PackageRelationship | null {
    this.checkInvalidState();
    this._container!.throwIfWriteOnly();
    if (id == null) throw new ArgumentNullException('id');
    InternalRelationshipCollection.throwIfInvalidXsdId(id);
    this.ensureRelationships();
    return this._relationships!.getRelationship(id);
  }

  private getRelationshipsHelper(filterString: string | null): PackageRelationshipCollection {
    this.checkInvalidState();
    this._container!.throwIfWriteOnly();
    this.ensureRelationships();
    return new PackageRelationshipCollection(this._relationships!, filterString);
  }
}

/** The sorted part list of a package (SortedList<ValidatedPartUri, PackagePart>). */
class PartList {
  keys: ValidatedPartUri[] = [];
  private readonly _values = new Map<string, PackagePart | null>();

  get count(): number {
    return this.keys.length;
  }

  indexOfKey(key: ValidatedPartUri): number {
    let lo = 0;
    let hi = this.keys.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const c = this.keys[mid]!.compareTo(key);
      if (c === 0) return mid;
      if (c < 0) lo = mid + 1;
      else hi = mid - 1;
    }
    return ~lo;
  }

  containsKey(key: ValidatedPartUri): boolean {
    return this._values.has(key.normalizedPartUriString);
  }

  tryGetValue(key: ValidatedPartUri): PackagePart | null | undefined {
    return this._values.get(key.normalizedPartUriString);
  }

  add(key: ValidatedPartUri, value: PackagePart | null): void {
    const i = this.indexOfKey(key);
    if (i >= 0) throw new ArgumentException('An entry with the same key already exists.');
    this.keys.splice(~i, 0, key);
    this._values.set(key.normalizedPartUriString, value);
  }

  set(key: ValidatedPartUri, value: PackagePart | null): void {
    if (this.containsKey(key)) this._values.set(key.normalizedPartUriString, value);
    else this.add(key, value);
  }

  remove(key: ValidatedPartUri): void {
    const i = this.indexOfKey(key);
    if (i >= 0) {
      this.keys.splice(i, 1);
      this._values.delete(key.normalizedPartUriString);
    }
  }

  values(): PackagePart[] {
    return this.keys.map((k) => this._values.get(k.normalizedPartUriString)!).filter((p) => p != null);
  }
}

/** The parts of a package, sorted by the normalized part name. */
export class PackagePartCollection implements Iterable<PackagePart> {
  /** @internal */
  constructor(private readonly _package: Package) {}

  [Symbol.iterator](): Iterator<PackagePart> {
    return this._package.partListValues()[Symbol.iterator]();
  }
}

/** Where the package bytes come from and go to. */
interface PackageStore {
  stream: MemoryStream | null;
  path: string | null;
}

/** A ZIP package (System.IO.Packaging.Package / ZipPackage). */
export class Package {
  private readonly _openFileAccess: FileAccess;
  private _disposed = false;
  private _partList = new PartList();
  private _partCollection: PackagePartCollection | null = null;
  private _relationships: InternalRelationshipCollection | null = null;
  private readonly _zipArchive: ZipArchive;
  private readonly _contentTypeHelper: ContentTypeHelper;
  private readonly _ignoredItemHelper: IgnoredItemHelper;
  private readonly _store: PackageStore;

  private constructor(bytes: Uint8Array, packageFileAccess: FileAccess, store: PackageStore) {
    throwIfFileAccessInvalid(packageFileAccess);
    this._openFileAccess = packageFileAccess;
    this._store = store;
    const mode =
      packageFileAccess === FileAccess.Read ? ZipArchiveMode.Read : packageFileAccess === FileAccess.Write ? ZipArchiveMode.Create : ZipArchiveMode.Update;
    this._zipArchive = new ZipArchive(bytes, mode);
    this._ignoredItemHelper = new IgnoredItemHelper(this._zipArchive);
    this._contentTypeHelper = new ContentTypeHelper(this._zipArchive, this._ignoredItemHelper);
  }

  /**
   * Package.Open on a file (`Open(path)`: OpenOrCreate/ReadWrite, `Open(path, mode)`: ReadWrite,
   * `Open(path, mode, access[, share])`) or on a stream (`Open(stream)`: Open/Read,
   * `Open(stream, mode)`: ReadWrite, `Open(stream, mode, access)`). A written package is stored
   * into the file or the stream when it is closed.
   */
  static open(pathOrStream: string | MemoryStream, packageMode?: FileMode, packageAccess?: FileAccess, _packageShare: FileShare = FileShare.None): Package {
    if (pathOrStream == null) throw new ArgumentNullException(typeof pathOrStream === 'string' ? 'path' : 'stream');
    if (typeof pathOrStream === 'string') {
      return Package.openFile(pathOrStream, packageMode ?? FileMode.OpenOrCreate, packageAccess ?? FileAccess.ReadWrite);
    }
    const mode = packageMode ?? FileMode.Open;
    const access = packageAccess ?? (packageMode === undefined ? FileAccess.Read : FileAccess.ReadWrite);
    return Package.openStream(pathOrStream, mode, access);
  }

  private static openFile(path: string, packageMode: FileMode, packageAccess: FileAccess): Package {
    throwIfFileModeInvalid(packageMode);
    throwIfFileAccessInvalid(packageAccess);
    const unsupported = 'Cannot get stream with FileMode.Create, FileMode.CreateNew, FileMode.Truncate, FileMode.Append when access is FileAccess.Read.';
    if (packageMode === FileMode.OpenOrCreate && packageAccess !== FileAccess.ReadWrite) throw new ArgumentException(unsupported);
    if (packageMode === FileMode.Open && packageAccess === FileAccess.Write) throw new ArgumentException(unsupported);
    if (packageMode === FileMode.Truncate && packageAccess === FileAccess.Read) throw new ArgumentException(unsupported);
    if (packageMode === FileMode.Truncate) throw new NotSupportedException(unsupported);
    const fs = NetPath.getFs();
    const fullPath = NetPath.getFullPath(path);
    const exists = NetPath.fileExists(fullPath);
    let bytes: Uint8Array;
    switch (packageMode) {
      case FileMode.CreateNew:
        if (exists) throw new IOException(`The file '${fullPath}' already exists.`);
        fs.writeFileSync(fullPath, new Uint8Array(0));
        bytes = new Uint8Array(0);
        break;
      case FileMode.Create:
        fs.writeFileSync(fullPath, new Uint8Array(0));
        bytes = new Uint8Array(0);
        break;
      case FileMode.Open:
        if (!exists) throw new FileNotFoundException(`Could not find file '${fullPath}'.`);
        bytes = fs.readFileSync(fullPath);
        break;
      case FileMode.Append:
        if (packageAccess === FileAccess.Read) throw new ArgumentException('Combining FileMode: Append with FileAccess: Read is invalid.', 'access');
        if (!exists) fs.writeFileSync(fullPath, new Uint8Array(0));
        bytes = fs.readFileSync(fullPath);
        break;
      default:
        if (!exists) fs.writeFileSync(fullPath, new Uint8Array(0));
        bytes = fs.readFileSync(fullPath);
        break;
    }
    const pkg = Package.create(bytes, packageAccess, { stream: null, path: fullPath }, false);
    return pkg;
  }

  private static openStream(s: MemoryStream, packageMode: FileMode, packageAccess: FileAccess): Package {
    if (s.canSeek) {
      switch (packageMode) {
        case FileMode.Open:
          if (s.length === 0) throw new FileFormatException('Archive file cannot be size 0.');
          break;
        case FileMode.CreateNew:
          if (s.length !== 0) throw new IOException('CreateNew is not a valid FileMode for a non-empty stream.');
          break;
        case FileMode.Create:
          if (s.length !== 0) s.setLength(0);
          break;
      }
    }
    return Package.create(s.toArray(), packageAccess, { stream: s, path: null }, true);
  }

  private static create(bytes: Uint8Array, access: FileAccess, store: PackageStore, fromStream: boolean): Package {
    let pkg: Package;
    try {
      pkg = new Package(bytes, access, store);
    } catch (e) {
      if (fromStream && e instanceof InvalidDataException) throw new FileFormatException('File contains corrupted data.');
      throw e;
    }
    try {
      if (pkg.fileOpenAccess === FileAccess.ReadWrite || pkg.fileOpenAccess === FileAccess.Read) {
        pkg.getParts();
      }
    } catch (e) {
      pkg.close();
      throw e;
    }
    return pkg;
  }

  /** The access the package was opened with. */
  get fileOpenAccess(): FileAccess {
    this.throwIfObjectDisposed();
    return this._openFileAccess;
  }

  /**
   * Creates a part (default compression NotCompressed).
   * @throws InvalidOperationException a part with the URI exists, or the name is a prefix of another.
   */
  createPart(partUri: Uri | null, contentType: string | null, compressionOption: CompressionOption = CompressionOption.NotCompressed): PackagePart {
    this.throwIfObjectDisposed();
    this.throwIfReadOnly();
    if (partUri == null) throw new ArgumentNullException('partUri');
    if (contentType == null) throw new ArgumentNullException('contentType');
    throwIfCompressionOptionInvalid(compressionOption);
    const validatedPartUri = PackUriHelper.validatePartUri(partUri);
    if (this._partList.containsKey(validatedPartUri)) {
      throw new InvalidOperationException('Cannot add part for the specified URI because it is already in the package.');
    }
    this.addIfNoPrefixCollisionDetected(validatedPartUri, null);
    const packagePart = this.createPartCore(validatedPartUri, contentType, compressionOption);
    this._partList.set(validatedPartUri, packagePart);
    return packagePart;
  }

  /** The part with the URI; InvalidOperationException if it does not exist. */
  getPart(partUri: Uri | null): PackagePart {
    const partHelper = this.getPartHelper(partUri);
    if (partHelper == null) throw new InvalidOperationException('Specified part does not exist in the package.');
    return partHelper;
  }

  /** Whether a part with the URI exists (compared case-insensitively). */
  partExists(partUri: Uri | null): boolean {
    this.throwIfObjectDisposed();
    if (partUri == null) throw new ArgumentNullException('partUri');
    return this._partList.containsKey(PackUriHelper.validatePartUri(partUri));
  }

  /** Deletes the part and its relationship part. */
  deletePart(partUri: Uri | null): void {
    this.throwIfObjectDisposed();
    this.throwIfReadOnly();
    if (partUri == null) throw new ArgumentNullException('partUri');
    let validatedPartUri = PackUriHelper.validatePartUri(partUri);
    const value = this._partList.tryGetValue(validatedPartUri);
    if (value !== undefined && value !== null) {
      validatedPartUri = value.uri;
      value.isDeleted = true;
      value.close();
      this.deletePartCore(validatedPartUri);
      this._partList.remove(validatedPartUri);
    } else {
      this.deletePartCore(validatedPartUri);
    }
    if (PackUriHelper.isRelationshipPartUri(validatedPartUri)) {
      const source = PackUriHelper.getSourcePartUriFromRelationshipPartUri(validatedPartUri);
      if (source.originalString === '/') {
        this._relationships?.clear();
      } else if (this.partExists(source)) {
        this.getPart(source).clearRelationships();
      }
    } else {
      this.deletePart(PackUriHelper.getRelationshipPartUri(validatedPartUri));
    }
  }

  /** The parts, sorted by the normalized part name (includes the relationship parts). */
  getParts(): PackagePartCollection {
    this.throwIfObjectDisposed();
    this.throwIfWriteOnly();
    if (this._partCollection == null) {
      const partsCore = this.getPartsCore();
      partsCore.sort((a, b) => a.uri.compareTo(b.uri));
      const dictionary = new Map<string, PackagePart>();
      const list: string[] = [];
      for (const part of partsCore) {
        const normalized = part.uri.normalizedPartUriString;
        if (dictionary.has(normalized)) throw new FileFormatException('Format error in package.');
        const text = list.length > 0 ? list[list.length - 1]! : null;
        dictionary.set(normalized, part);
        if (text != null && normalized.startsWith(text) && normalized.length > text.length && normalized[text.length] === '/') {
          dictionary.delete(normalized);
          throw new InvalidOperationException('Cannot add part to the package. Part names cannot be derived from another part name by appending segments to it.');
        }
        list.push(normalized);
      }
      this._partList = new PartList();
      for (const n of list) {
        const p = dictionary.get(n)!;
        this._partList.add(p.uri, p);
      }
      this._partCollection = new PackagePartCollection(this);
    }
    return this._partCollection;
  }

  /** @internal The current parts (the live collection enumerates a snapshot). */
  partListValues(): PackagePart[] {
    return this._partList.values();
  }

  /** Package.Close (IDisposable.Dispose): writes a changed package to its file or stream. */
  close(): void {
    if (this._disposed) return;
    try {
      this.flushRelationships();
      this.doOperationOnEachPart((p) => {
        if (!p.isRelationshipPart) p.closeRelationships();
        return true;
      });
      this.doOperationOnEachPart((p) => this.doClose(p));
      this.disposeCore();
    } finally {
      this._disposed = true;
    }
  }

  /** IDisposable.Dispose. */
  dispose(): void {
    this.close();
  }

  /** Writes the relationships and the content types into the archive (the file or stream is written on Close). */
  flush(): void {
    this.throwIfObjectDisposed();
    this.throwIfReadOnly();
    this.flushRelationships();
    this.doOperationOnEachPart((p) => {
      if (!p.isRelationshipPart) p.flushRelationships();
      return true;
    });
    this._contentTypeHelper.saveToFile();
  }

  /** Creates a package relationship. */
  createRelationship(targetUri: Uri | null, targetMode: TargetMode, relationshipType: string | null, id: string | null = null): PackageRelationship {
    this.throwIfObjectDisposed();
    this.throwIfReadOnly();
    this.ensureRelationships();
    return this._relationships!.add(targetUri, targetMode, relationshipType, id);
  }

  /** Deletes the package relationship with the ID. */
  deleteRelationship(id: string | null): void {
    this.throwIfObjectDisposed();
    this.throwIfReadOnly();
    if (id == null) throw new ArgumentNullException('id');
    InternalRelationshipCollection.throwIfInvalidXsdId(id);
    this.ensureRelationships();
    this._relationships!.delete(id);
  }

  /** The package relationships. */
  getRelationships(): PackageRelationshipCollection {
    return this.getRelationshipsHelper(null);
  }

  /** The package relationships with the type. */
  getRelationshipsByType(relationshipType: string | null): PackageRelationshipCollection {
    this.throwIfObjectDisposed();
    this.throwIfWriteOnly();
    if (relationshipType == null) throw new ArgumentNullException('relationshipType');
    InternalRelationshipCollection.throwIfInvalidRelationshipType(relationshipType);
    return this.getRelationshipsHelper(relationshipType);
  }

  /** The package relationship with the ID; InvalidOperationException if there is none. */
  getRelationship(id: string | null): PackageRelationship {
    const r = this.getRelationshipHelper(id);
    if (r == null) throw new InvalidOperationException('PackageRelationship with specified ID does not exist at the Package level.');
    return r;
  }

  /** Whether a package relationship with the ID exists. */
  relationshipExists(id: string | null): boolean {
    return this.getRelationshipHelper(id) != null;
  }

  /** @internal */
  throwIfReadOnly(): void {
    if (this._openFileAccess === FileAccess.Read) throw new IOException('Cannot modify readonly container');
  }

  /** @internal */
  throwIfWriteOnly(): void {
    if (this._openFileAccess === FileAccess.Write) throw new IOException('Cannot retrieve parts of writeonly container');
  }

  private createPartCore(partUri: ValidatedPartUri, contentType: string, compressionOption: CompressionOption): PackagePart {
    const compressionLevel = compressionLevelOf(compressionOption);
    this._ignoredItemHelper.delete(partUri);
    const entryName = partUri.partUriString.substring(1);
    const zipArchiveEntry = this._zipArchive.createEntry(entryName, compressionLevel);
    this._contentTypeHelper.addContentType(partUri, new ContentType(contentType), compressionLevel);
    return new PackagePart(this, zipArchiveEntry, partUri, contentType, compressionOption);
  }

  private deletePartCore(partUri: ValidatedPartUri): void {
    const entry = this._zipArchive.getEntry(partUri.partUriString.substring(1));
    entry?.delete();
    this._ignoredItemHelper.delete(partUri);
    this._contentTypeHelper.deleteContentType(partUri);
  }

  private getPartsCore(): PackagePart[] {
    const list: PackagePart[] = [];
    for (const entry of [...this._zipArchive.entries]) {
      const name = entry.fullName;
      if (name.toUpperCase().startsWith(CONTENT_TYPES_FILE.toUpperCase()) || name.startsWith('/') || name.endsWith('/')) continue;
      if (/\/\[(0|[1-9][0-9]*)\](\.last)?\.piece$/i.test('/' + name)) continue;
      const uri = Uri.tryCreate('/' + name, UriKind.Relative);
      const validated = uri == null ? null : PackUriHelper.tryValidatePartUri(uri);
      if (validated == null) continue;
      const contentType = this._contentTypeHelper.getContentType(validated);
      if (contentType != null) {
        list.push(new PackagePart(this, entry, validated, contentType.toString(), CompressionOption.Normal));
      } else {
        this._ignoredItemHelper.addItemForAtomicPart(validated, name);
      }
    }
    return list;
  }

  private disposeCore(): void {
    this._contentTypeHelper.saveToFile();
    if (this._zipArchive.mode !== ZipArchiveMode.Read) {
      const bytes = this._zipArchive.toBytes();
      if (this._store.stream != null) {
        const s = this._store.stream;
        s.position = 0;
        s.setLength(0);
        s.write(bytes, 0, bytes.length);
      } else if (this._store.path != null) {
        NetPath.getFs().writeFileSync(this._store.path, bytes);
      }
    }
    this._partList = new PartList();
    this._partCollection = null;
    this._relationships = null;
  }

  private addIfNoPrefixCollisionDetected(partUri: ValidatedPartUri, part: PackagePart | null): void {
    this._partList.add(partUri, part);
    const num = this._partList.indexOfKey(partUri);
    const normalized = partUri.normalizedPartUriString;
    const text = num > 0 ? this._partList.keys[num - 1]!.normalizedPartUriString : null;
    const text2 = num < this._partList.count - 1 ? this._partList.keys[num + 1]!.normalizedPartUriString : null;
    if (
      (text != null && normalized.startsWith(text) && normalized.length > text.length && normalized[text.length] === '/') ||
      (text2 != null && text2.startsWith(normalized) && text2.length > normalized.length && text2[normalized.length] === '/')
    ) {
      this._partList.remove(partUri);
      throw new InvalidOperationException('Cannot add part to the package. Part names cannot be derived from another part name by appending segments to it.');
    }
  }

  private throwIfObjectDisposed(): void {
    if (this._disposed) {
      throw new ObjectDisposedException(
        'Package object was closed and disposed, so cannot carry out operations on this object or any stream opened on a part of this package.',
      );
    }
  }

  private ensureRelationships(): void {
    this._relationships ??= new InternalRelationshipCollection(this, null);
  }

  private flushRelationships(): void {
    if (this._relationships != null && this._openFileAccess !== FileAccess.Read) {
      this._relationships.flush();
    }
  }

  private doOperationOnEachPart(operation: (p: PackagePart) => boolean): void {
    if (this._partList.count <= 0) return;
    const keys = [...this._partList.keys];
    for (const key of keys) {
      const value = this._partList.tryGetValue(key);
      if (value === undefined || value === null) continue;
      if (!operation(value)) break;
    }
  }

  private doClose(p: PackagePart): boolean {
    if (!p.isClosed) {
      if (PackUriHelper.isRelationshipPartUri(p.uri) && PackUriHelper.comparePartUri(p.uri, containerRelationshipPartName) !== 0) {
        const key = PackUriHelper.validatePartUri(PackUriHelper.getSourcePartUriFromRelationshipPartUri(p.uri));
        const value = this._partList.tryGetValue(key);
        value?.close();
      }
      p.close();
    }
    return true;
  }

  private getPartHelper(partUri: Uri | null): PackagePart | null {
    this.throwIfObjectDisposed();
    this.throwIfWriteOnly();
    if (partUri == null) throw new ArgumentNullException('partUri');
    const validatedPartUri = PackUriHelper.validatePartUri(partUri);
    return this._partList.tryGetValue(validatedPartUri) ?? null;
  }

  private getRelationshipHelper(id: string | null): PackageRelationship | null {
    this.throwIfObjectDisposed();
    this.throwIfWriteOnly();
    if (id == null) throw new ArgumentNullException('id');
    InternalRelationshipCollection.throwIfInvalidXsdId(id);
    this.ensureRelationships();
    return this._relationships!.getRelationship(id);
  }

  private getRelationshipsHelper(filterString: string | null): PackageRelationshipCollection {
    this.throwIfObjectDisposed();
    this.throwIfWriteOnly();
    this.ensureRelationships();
    return new PackageRelationshipCollection(this._relationships!, filterString);
  }
}

export { uriEquals };
