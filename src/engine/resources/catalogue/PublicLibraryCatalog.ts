// Port of Aml.Engine.Resources.Catalogue.PublicLibraryCatalog (Aml.Engine.Resources 4.2.1).
// With the nested classes Library, LibraryRevision, LibraryType and LibraryVersion (exported as
// PublicLibraryCatalog_<Name> and attached as static properties).
//
// JSON: System.Text.Json (src/system/Json.ts) with the default options of the original, and
// WriteIndented = true for Save and SerializeToStream. Properties in declaration order, the
// [JsonPropertyName("Libraries")] of LibraryTypes, [JsonIgnore] properties left out (also when
// reading), the obsolete DownloadLink still read and written, nulls written, case-sensitive
// property names. IJsonOnDeserialized.OnDeserialized runs after the catalog object is read
// (`onDeserialized()`). `PublicLibraryCatalog.deserialize` is the counterpart of
// JsonSerializer.Deserialize<PublicLibraryCatalog>(json or stream) (port helper, no C# member).
// Indexers are `item(...)`; Stream results are byte arrays.

import { T } from '../../registry.js';
import { registerInterfaces } from '../../interfaces.js';
import { ArgumentException, ArgumentNullException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { cultureEndsWith } from '../../../system/CompareInfo.js';
import { Enumerable, from } from '../../../system/linq.js';
import { JsonDeserializer, deserialize, utf8JsonText, writeJson } from '../../../system/Json.js';
import { getFs } from '../../amlobjects/internal/NetPath.js';
import { SemanticVersion } from '../files/SemanticVersion.js';
import { SignedLibraryVersionExtensions } from './SignedLibraryVersionExtensions.js';
import type { SignedLibraryVersionLink } from './SignedLibraryVersionExtensions.js';
import type { ISignedLibraryVersion } from './ISignedLibraryVersion.js';
import type { Version } from '../../amlobjects/internal/Version.js';

/** The library data. */
export class PublicLibraryCatalog_Library {
  /** Gets the name of the library. */
  name: string | null = null;

  /** Gets all library versions published for the defined library with this Name. */
  versions: PublicLibraryCatalog_LibraryVersion[] | null = [];

  /**
   * Indexer `this[libVersion, caexVersion]`: gets the library version for the provided version string.
   * @returns The library version, according to the version string.
   */
  item(libVersion: string | null, caexVersion: string | null): PublicLibraryCatalog_LibraryVersion | null {
    return from(this.versions).firstOrDefault((l) => l.version === libVersion && l.caexVersion === caexVersion);
  }

  /** @internal */
  static formatCAEXVersionString(caexVersion: string | null): string | null {
    // C# string.EndsWith(string) compares with the current culture; null throws.
    if (!cultureEndsWith(caexVersion!, '3.0') && !cultureEndsWith(caexVersion!, '3_0')) {
      if (!cultureEndsWith(caexVersion!, '2.15') && !cultureEndsWith(caexVersion!, '2_15')) {
        return caexVersion;
      }
      return '2.15';
    }
    return '3.0';
  }

  /**
   * Gets the highest listed version from the list.
   * @param caexVersion Definition of the CAEX version as defined for the CAEX document.
   * @returns The highest listed library version for the provided CAEX version.
   */
  highestVersion(caexVersion: string | null): PublicLibraryCatalog_LibraryVersion | null {
    const list = from(this.versions)
      .where((v) => v.isCaexVersion(caexVersion))
      .toList();
    if (list.length !== 0) {
      if (list.length !== 1) {
        // Enumerable.Aggregate without seed.
        let result = list[0];
        for (let i = 1; i < list.length; i++) {
          const i1 = result;
          const i2 = list[i];
          result = !SemanticVersion.greaterThan(i1.semanticVersion, i2.semanticVersion) ? i2 : i1;
        }
        return result;
      }
      return list[0];
    }
    return null;
  }

  /** @internal The JSON properties in System.Text.Json order (the indexer is not serialized). */
  toJsonObject(): Record<string, unknown> {
    return {
      Name: this.name,
      Versions: this.versions === null ? null : this.versions.map((v) => (v === null ? null : v.toJsonObject())),
    };
  }
}

/**
 * The library revision. A revision is created when the library is updated with a revision object
 * which provides a link to a new version of the library. When a revision is added, the signature
 * needs to be updated for the library version. A library version is allowed to have more than
 * one revision indicating a new version. As an example a library version can link to a new
 * version of the same edition and additionally to a new version of another edition. The existing
 * revisions are chained in the catalog.
 */
export class PublicLibraryCatalog_LibraryRevision implements ISignedLibraryVersion {
  /**
   * Gets and sets the download link where to load the library. The link should be publicly available.
   * @deprecated Links are saved in the DownloadLinks Collection
   */
  downloadLink: string | null = null;

  /**
   * Gets and sets the download links where to load the library. The links should be publicly
   * available. This collection replaces the old DownloadLink property. The Collection is used to
   * support alternative download locations.
   */
  downloadLinks: string[] | null = null;

  /** Gets the signature (checksum) for this revision. */
  signature: string | null = null;

  /** An additional revision for the library version. */
  revision: PublicLibraryCatalog_LibraryRevision | null = null;

  /** The related library version for this revision ([XmlIgnore], [JsonIgnore]). */
  relatedLibraryVersion: PublicLibraryCatalog_LibraryVersion | null = null;

  /** @internal */
  onDeserialized(libVersion: PublicLibraryCatalog_LibraryVersion): void {
    SignedLibraryVersionExtensions.transformLink(this);
    this.relatedLibraryVersion = libVersion;
    this.revision?.onDeserialized(libVersion);
  }

  /** @internal The JSON properties in System.Text.Json order. */
  toJsonObject(): Record<string, unknown> {
    return {
      DownloadLink: this.downloadLink,
      DownloadLinks: this.downloadLinks,
      Signature: this.signature,
      Revision: this.revision === null ? null : this.revision.toJsonObject(),
    };
  }
}

/** The library data for all libraries of a specific type. */
export class PublicLibraryCatalog_LibraryType {
  /** Gets the CAEX typename of the library. */
  caexType: string | null = null;

  /** Gets all libraries for the defined CAEXType. */
  libraries: PublicLibraryCatalog_Library[] | null = [];

  /**
   * Indexer `this[name]`: gets the Library with the provided name.
   * @returns The library with the provided name.
   */
  item(name: string | null): PublicLibraryCatalog_Library | null {
    return from(this.libraries).firstOrDefault((l) => l.name === name);
  }

  /**
   * Gets or creates the Library with the provided name.
   * @param name Name of the library.
   * @returns The library with the provided name.
   */
  getOrCreate(name: string | null): PublicLibraryCatalog_Library {
    let library = this.item(name);
    if (library == null) {
      const libraries = this.libraries;
      const obj = new PublicLibraryCatalog_Library();
      obj.name = name;
      library = obj;
      libraries!.push(obj);
    }
    return library;
  }

  /** @internal The JSON properties in System.Text.Json order (the indexer is not serialized). */
  toJsonObject(): Record<string, unknown> {
    return {
      CAEXType: this.caexType,
      Libraries: this.libraries === null ? null : this.libraries.map((l) => (l === null ? null : l.toJsonObject())),
    };
  }
}

/** The library version data. */
export class PublicLibraryCatalog_LibraryVersion implements ISignedLibraryVersion {
  /** Gets and sets the version string of the library. */
  version: string | null = null;

  /**
   * Gets and sets the CAEX version of the library allowing different signatures for libraries,
   * supporting different CAEX versions but have identical content.
   */
  caexVersion: string | null = null;

  /** Gets and sets the AML edition version of the library. */
  amlEdition: string | null = null;

  /** Archived Libraries are not offered for downloads. */
  isArchived = false;

  /** Gets and sets a description text to explain the library version. */
  description: string | null = null;

  /**
   * Gets and sets the download link where to load the library. The link should be publicly available.
   * @deprecated Links are saved in the DownloadLinks Collection
   */
  downloadLink: string | null = null;

  /**
   * Gets and sets the download links where to load the library. The links should be publicly
   * available. This collection replaces the old DownloadLink property. The Collection is used to
   * support alternate download locations.
   */
  downloadLinks: string[] | null = [];

  /**
   * Gets the download links of the library version and all revisions. Each link is paired with its
   * defining instance ([XmlIgnore], [JsonIgnore]).
   */
  get allDownloadLinks(): Enumerable<SignedLibraryVersionLink> {
    let enumerable = SignedLibraryVersionExtensions.getLinks(this);
    for (let revision = this.revision; revision != null; revision = revision.revision) {
      enumerable = enumerable.concat(SignedLibraryVersionExtensions.getLinks(revision));
    }
    return enumerable;
  }

  /**
   * Gets and sets the sources which are defined in a CAEX Document. This property can define
   * multiple sources, if the library version is located in multiple CAEX documents. Sources are
   * separated by a ';'.
   */
  sources: string | null = null;

  /** Gets the signature (checksum) used to validate the library content. */
  signature: string | null = null;

  /**
   * Gets or sets the public key, used to verify the signature. If all versions in the catalogue
   * are verified with only one global key, this value can be null.
   */
  publicKey: string | null = null;

  /** A revision of this version exists, using the same version number. */
  revision: PublicLibraryCatalog_LibraryRevision | null = null;

  /** Gets the version converted to the .NET Version type ([XmlIgnore], [JsonIgnore]). */
  get netVersion(): Version {
    return this.semanticVersion.version;
  }

  /**
   * Gets the semantic version ([XmlIgnore], [JsonIgnore]). A version string with less than two
   * parts gets ".0" appended (stored in `version`); a version that is not strict SemVer gives 1.0.0.
   */
  get semanticVersion(): SemanticVersion {
    if (this.version!.split(/[.-]/).length < 2) {
      this.version += '.0';
    }
    const r = SemanticVersion.tryParseStrict(this.version);
    if (!r.result) {
      return new SemanticVersion('1.0.0');
    }
    return r.value!;
  }

  /** Gets the library element for this library version ([XmlIgnore], [JsonIgnore]). */
  library: PublicLibraryCatalog_Library | null = null;

  /**
   * Adds a source for this library.
   * @param fileName The name of the source file.
   */
  addSource(fileName: string | null): void {
    if (isNullOrEmpty(this.sources)) {
      this.sources = fileName;
    }
    const list = this.sources!.split(';');
    if (!list.some((s) => s === fileName)) {
      list.push(fileName as string);
      // string.Join writes null items as "".
      this.sources = list.map((s) => s ?? '').join(';');
    }
  }

  /** @internal */
  onDeserialized(): void {
    SignedLibraryVersionExtensions.transformLink(this);
    this.revision?.onDeserialized(this);
  }

  /**
   * Determines whether this version is equal to the specified caex version.
   * @returns `true` if the specified caex version equals this version; otherwise, `false`.
   */
  isCaexVersion(caexVersion: string | null): boolean {
    return this.caexVersion === PublicLibraryCatalog_Library.formatCAEXVersionString(caexVersion);
  }

  /** @internal The JSON properties in System.Text.Json order. */
  toJsonObject(): Record<string, unknown> {
    return {
      Version: this.version,
      CAEXVersion: this.caexVersion,
      AMLEdition: this.amlEdition,
      IsArchived: this.isArchived,
      Description: this.description,
      DownloadLink: this.downloadLink,
      DownloadLinks: this.downloadLinks,
      Sources: this.sources,
      Signature: this.signature,
      PublicKey: this.publicKey,
      Revision: this.revision === null ? null : this.revision.toJsonObject(),
    };
  }
}

/** The catalog of all published libraries of the AutomationML association. */
export class PublicLibraryCatalog {
  static readonly Library = PublicLibraryCatalog_Library;

  static readonly LibraryRevision = PublicLibraryCatalog_LibraryRevision;

  static readonly LibraryType = PublicLibraryCatalog_LibraryType;

  static readonly LibraryVersion = PublicLibraryCatalog_LibraryVersion;

  /** Default filename for the library catalog. */
  static get fileName(): string {
    return 'LibraryDatabase.json';
  }

  /** Gets the library data for all published libraries ([JsonPropertyName("Libraries")]). */
  libraryTypes: PublicLibraryCatalog_LibraryType[] | null = [];

  /**
   * Indexers `this[caexTagName]` (the LibraryType for the provided CAEX Type) and
   * `this[caexTagName, libraryName]` (the Library for the provided CAEX Type and library name).
   */
  item(caexTagName: string | null): PublicLibraryCatalog_LibraryType | null;
  item(caexTagName: string | null, libraryName: string | null): PublicLibraryCatalog_Library | null;
  item(caexTagName: string | null, libraryName?: string | null): PublicLibraryCatalog_LibraryType | PublicLibraryCatalog_Library | null {
    const libraryType = from(this.libraryTypes).firstOrDefault((l) => l.caexType === caexTagName);
    if (arguments.length < 2) {
      return libraryType;
    }
    return libraryType?.item(libraryName ?? null) ?? null;
  }

  /** The Public key, used for the verification of AutomationML Library signatures. */
  publicKey: string | null = null;

  /** IJsonOnDeserialized.OnDeserialized: performs transformations from catalog version 1 to catalog version 2. */
  onDeserialized(): void {
    for (const libraryType of this.libraryTypes!) {
      for (const library of libraryType.libraries!) {
        for (const version of library.versions!) {
          version.onDeserialized();
          version.library = library;
          if (isNullOrEmpty(version.publicKey)) {
            version.publicKey = this.publicKey;
          }
          if (!isNullOrEmpty(version.amlEdition)) {
            continue;
          }
          const cAEXVersion = version.caexVersion;
          if (!(cAEXVersion === '2.15')) {
            if (cAEXVersion === '3.0') {
              version.amlEdition = 'AMLEd2';
            }
          } else {
            version.amlEdition = 'AMLEd1';
          }
        }
      }
    }
  }

  /**
   * Get the library from the catalog with the provided libraryName, libraryVersion, libraryType
   * and CAEXVersion in case it is published. If the library with the provided version is not
   * listed a library version with the highest listed version is returned if one exists.
   * @returns The library version if it is published; otherwise `null`.
   */
  getPublishedLibraryVersion(
    libraryName: string | null,
    libraryVersion: string | null,
    libraryType: string | null,
    CAEXVersion: string | null,
  ): PublicLibraryCatalog_LibraryVersion | null {
    const libraryType2 = this.item(libraryType);
    if (libraryType2 == null) {
      return null;
    }
    const library = libraryType2.item(libraryName);
    if (library == null) {
      return null;
    }
    for (let i = libraryVersion!.split('.').length; i < 3; i++) {
      libraryVersion += '.0';
    }
    return library.item(libraryVersion, CAEXVersion) ?? library.highestVersion(CAEXVersion);
  }

  /** Determines, if the library with the provided name, version and edition is archived. */
  isArchived(libraryName: string | null, libraryVersion: string | null, edition: string | null): boolean {
    for (const libraryType of this.libraryTypes!) {
      for (const library of libraryType.libraries!) {
        if (library.name === libraryName) {
          const libraryVersion2 = from(library.versions).firstOrDefault((v) => v.version === libraryVersion && v.amlEdition === edition);
          if (libraryVersion2 != null && libraryVersion2.isArchived) {
            return true;
          }
        }
      }
    }
    return false;
  }

  /**
   * Gets or creates the LibraryType for the provided CAEX Type.
   * @param caexTagName Name of the caex tag.
   * @returns the specified library type
   */
  getOrCreate(caexTagName: string | null): PublicLibraryCatalog_LibraryType {
    let libraryType = this.item(caexTagName);
    if (libraryType == null) {
      const libraryTypes = this.libraryTypes;
      const obj = new PublicLibraryCatalog_LibraryType();
      obj.caexType = caexTagName;
      libraryType = obj;
      libraryTypes!.push(obj);
    }
    return libraryType;
  }

  /**
   * Determines, if a library with the provided CAEX tagName and library name and version is
   * listed in the catalog.
   * @returns `true`, if the catalog contains this library version
   */
  libraryVersionIsListed(tagName: string | null, libraryName: string | null, version: string | null, caexVersion: string | null): boolean {
    const libraryType = this.item(tagName);
    if (libraryType == null) {
      return false;
    }
    const library = libraryType.item(libraryName);
    if (library == null) {
      return false;
    }
    return library.item(version, caexVersion) != null;
  }

  /**
   * Gets the library version element.
   * @returns The library version element.
   */
  libVersion(tagName: string | null, libraryName: string | null, version: string | null, caexVersion: string | null): PublicLibraryCatalog_LibraryVersion | null {
    return this.item(tagName)?.item(libraryName)?.item(version, caexVersion) ?? null;
  }

  /**
   * Gets all registered library versions.
   * @param caexVersion The caex version, if no caex version is defined, all versions are returned.
   * @returns The library versions.
   */
  libVersions(tagName: string | null, libraryName: string | null, caexVersion: string | null): PublicLibraryCatalog_LibraryVersion[] | null {
    const libraryType = this.item(tagName);
    if (libraryType == null) {
      return null;
    }
    const library = libraryType.item(libraryName);
    if (library != null) {
      // Aml.Engine: the condition is inverted against the documentation: with a CAEX version all
      // versions are returned, without one the versions are filtered by it (null throws as soon
      // as there is a version, "" keeps the versions with an empty CAEX version).
      if (!isNullOrEmpty(caexVersion)) {
        return library.versions;
      }
      return from(library.versions)
        .where((v) => v.isCaexVersion(caexVersion))
        .toList();
    }
    return [];
  }

  /**
   * Gets all registered libraries of a type.
   * @param tagName The CAEX tagname of the library element.
   * @returns The libraries for this type.
   */
  libraries(tagName: string | null): PublicLibraryCatalog_Library[] | null {
    return this.item(tagName)?.libraries ?? null;
  }

  /**
   * Save this catalog to the provided file (File.WriteAllText: UTF-8 without preamble; Node only).
   * @param filePath The full path of the file.
   */
  save(filePath: string | null): void {
    const contents = this.serialize();
    if (filePath == null) throw new ArgumentNullException('path');
    if (filePath.length === 0) throw new ArgumentException('The value cannot be an empty string.', 'path');
    getFs().writeFileSync(filePath, new TextEncoder().encode(contents));
  }

  /**
   * Serialize the Library Catalog to a Stream using a json serializer (the bytes of the stream:
   * UTF-8 without preamble, as written by a StreamWriter).
   * @returns The serialized catalog.
   */
  serializeToStream(): Uint8Array {
    return new TextEncoder().encode(this.serialize());
  }

  /** @internal JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true }). */
  serialize(): string {
    return writeJson(this.toJsonObject(), '');
  }

  /** @internal The JSON properties in System.Text.Json order. */
  toJsonObject(): Record<string, unknown> {
    return {
      Libraries: this.libraryTypes === null ? null : this.libraryTypes.map((t) => (t === null ? null : t.toJsonObject())),
      PublicKey: this.publicKey,
    };
  }

  /**
   * JsonSerializer.Deserialize<PublicLibraryCatalog>(json) with the default options (port helper,
   * no C# member). A string is read like the string overload, bytes like the UTF-8 stream overload
   * (a UTF-8 preamble is skipped). Errors are JsonException as in System.Text.Json.
   * @returns The catalog, or `null` for the JSON value null.
   */
  static deserialize(json: string | Uint8Array | null): PublicLibraryCatalog | null {
    if (json == null) {
      throw new ArgumentNullException('json');
    }
    const text = typeof json === 'string' ? json : utf8JsonText(json);
    return deserialize(text, (reader) => new CatalogDeserializer(reader), (d) => d.readCatalog());
  }
}

// ---- System.Text.Json converters of the catalog types (src/system/Json.ts) -------------------

const CATALOGUE = 'Aml.Engine.Resources.Catalogue.PublicLibraryCatalog';
const LIST = 'System.Collections.Generic.List`1';

/** The converters of the catalog types, driven by the reader like JsonSerializer. */
class CatalogDeserializer extends JsonDeserializer {
  readCatalog(): PublicLibraryCatalog | null {
    const r = this.reader;
    r.read();
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'StartObject') this.fail(CATALOGUE);
    const c = new PublicLibraryCatalog();
    this.readProperties((name) => {
      switch (name) {
        case 'Libraries':
          c.libraryTypes = this.readList(`${LIST}[${CATALOGUE}+LibraryType]`, () => this.readLibraryType() as PublicLibraryCatalog_LibraryType);
          return true;
        case 'PublicKey':
          c.publicKey = this.readString();
          return true;
        default:
          return false;
      }
    });
    c.onDeserialized();
    return c;
  }

  private readStringList(): string[] | null {
    return this.readList(`${LIST}[System.String]`, () => this.readString() as string);
  }

  private readLibraryType(): PublicLibraryCatalog_LibraryType | null {
    const r = this.reader;
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'StartObject') this.fail(`${CATALOGUE}+LibraryType`);
    const t = new PublicLibraryCatalog_LibraryType();
    this.readProperties((name) => {
      switch (name) {
        case 'CAEXType':
          t.caexType = this.readString();
          return true;
        case 'Libraries':
          t.libraries = this.readList(`${LIST}[${CATALOGUE}+Library]`, () => this.readLibrary() as PublicLibraryCatalog_Library);
          return true;
        default:
          return false;
      }
    });
    return t;
  }

  private readLibrary(): PublicLibraryCatalog_Library | null {
    const r = this.reader;
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'StartObject') this.fail(`${CATALOGUE}+Library`);
    const l = new PublicLibraryCatalog_Library();
    this.readProperties((name) => {
      switch (name) {
        case 'Name':
          l.name = this.readString();
          return true;
        case 'Versions':
          l.versions = this.readList(`${LIST}[${CATALOGUE}+LibraryVersion]`, () => this.readLibraryVersion() as PublicLibraryCatalog_LibraryVersion);
          return true;
        default:
          return false;
      }
    });
    return l;
  }

  private readLibraryVersion(): PublicLibraryCatalog_LibraryVersion | null {
    const r = this.reader;
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'StartObject') this.fail(`${CATALOGUE}+LibraryVersion`);
    const v = new PublicLibraryCatalog_LibraryVersion();
    this.readProperties((name) => {
      switch (name) {
        case 'Version':
          v.version = this.readString();
          return true;
        case 'CAEXVersion':
          v.caexVersion = this.readString();
          return true;
        case 'AMLEdition':
          v.amlEdition = this.readString();
          return true;
        case 'IsArchived':
          v.isArchived = this.readBool();
          return true;
        case 'Description':
          v.description = this.readString();
          return true;
        case 'DownloadLink':
          v.downloadLink = this.readString();
          return true;
        case 'DownloadLinks':
          v.downloadLinks = this.readStringList();
          return true;
        case 'Sources':
          v.sources = this.readString();
          return true;
        case 'Signature':
          v.signature = this.readString();
          return true;
        case 'PublicKey':
          v.publicKey = this.readString();
          return true;
        case 'Revision':
          v.revision = this.readLibraryRevision();
          return true;
        default:
          return false;
      }
    });
    return v;
  }

  private readLibraryRevision(): PublicLibraryCatalog_LibraryRevision | null {
    const r = this.reader;
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'StartObject') this.fail(`${CATALOGUE}+LibraryRevision`);
    const v = new PublicLibraryCatalog_LibraryRevision();
    this.readProperties((name) => {
      switch (name) {
        case 'DownloadLink':
          v.downloadLink = this.readString();
          return true;
        case 'DownloadLinks':
          v.downloadLinks = this.readStringList();
          return true;
        case 'Signature':
          v.signature = this.readString();
          return true;
        case 'Revision':
          v.revision = this.readLibraryRevision();
          return true;
        default:
          return false;
      }
    });
    return v;
  }
}

T.PublicLibraryCatalog = PublicLibraryCatalog;
T.PublicLibraryCatalog_Library = PublicLibraryCatalog_Library;
T.PublicLibraryCatalog_LibraryRevision = PublicLibraryCatalog_LibraryRevision;
T.PublicLibraryCatalog_LibraryType = PublicLibraryCatalog_LibraryType;
T.PublicLibraryCatalog_LibraryVersion = PublicLibraryCatalog_LibraryVersion;
registerInterfaces(PublicLibraryCatalog, 'IJsonOnDeserialized');
registerInterfaces(PublicLibraryCatalog_LibraryRevision, 'ISignedLibraryVersion');
registerInterfaces(PublicLibraryCatalog_LibraryVersion, 'ISignedLibraryVersion');
