// Port of Aml.Engine.Resources.Files.AMLFileMetaModel (Aml.Engine.Resources 4.2.1).
//
// The meta data are derived from the file name (Producer_Domain_LibType[_Extension]_Edition_Version
// for library files). Path functions follow System.IO.Path (src/engine/amlobjects/internal/NetPath.ts);
// string.EndsWith(string) compares with the current (invariant) culture, IndexOf with
// StringComparison.InvariantCultureIgnoreCase is emulated for the ASCII search text "AMLEd".

import { T } from '../../registry.js';
import { ArgumentOutOfRangeException } from '../../../system/exceptions.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../../system/strings.js';
import { cultureEndsWith } from '../../../system/CompareInfo.js';
import { Uri } from '../../../system/Uri.js';
import { getFileName, getFileNameWithoutExtension } from '../../amlobjects/internal/NetPath.js';
import { SemanticVersion } from './SemanticVersion.js';
import { AMLFileContentType } from './AMLFileContentType.js';
import { AMLFileType } from './AMLFileType.js';

/** Characters that ICU collation ignores completely (controls and default ignorable code points). */
const IGNORABLE = /^[\p{Cc}\p{Default_Ignorable_Code_Point}]$/u;

/**
 * `s.IndexOf(value, StringComparison.InvariantCultureIgnoreCase)` for an ASCII `value`: the index
 * of the first match, where completely ignorable characters in `s` are skipped and letters match
 * regardless of case (also their compatibility forms, except the full and half width forms). A
 * match must end on a character boundary: a combining mark after it belongs to its last letter.
 */
function indexOfInvariantIgnoreCase(s: string, value: string): number {
  const target = value.toLowerCase();
  const fold = (ch: string) => (/[\uff00-\uffef]/.test(ch) ? ch : ch.normalize('NFKD').toLowerCase());
  for (let start = 0; start < s.length; start++) {
    if (IGNORABLE.test(s[start])) continue;
    let i = start;
    let k = 0;
    while (k < target.length && i < s.length) {
      const ch = s[i];
      if (IGNORABLE.test(ch)) {
        i++;
        continue;
      }
      const f = fold(ch);
      if (target.startsWith(f, k) && f.length > 0) {
        k += f.length;
        i++;
        continue;
      }
      break;
    }
    if (k === target.length && !(i < s.length && /\p{M}/u.test(s[i]))) return start;
  }
  return -1;
}

/**
 * This class represents an AutomationML file and its intended modeling purpose, together with
 * some other meta data including its download link. The provided meta data properties are
 * derived from the filename of the AutomationML file. It is requested, that the filename is
 * defined according to the published naming conventions.
 */
export class AMLFileMetaModel {
  /** Char to divide a name in a main and a sub part. */
  static readonly SubNameChar = '.';

  /** The producer, categorising all AutomationML provided libraries. */
  static readonly AML_PRODUCER = 'AutomationML';

  /** Filename part specifying AutomationML edition 1 files. */
  static readonly AMLEdition1 = 'AMLEd1';

  /** Filename part specifying AutomationML edition 2 files. */
  static readonly AMLEdition2 = 'AMLEd2';

  /** The domain, categorising standard base libraries. */
  static readonly BASE_DOMAIN = 'Base';

  /** The domain, categorising component libraries. */
  static readonly AUTOMATIONCOMPONENT_DOMAIN = 'AutomationComponent';

  /** The domain, categorising component libraries. */
  static readonly LOGIC_DOMAIN = 'Logic';

  private _isConsistentLibtype = false;

  private _url: string | null = null;

  /**
   * Gets an AutomationML file alias name, which is constructed from the specified properties
   * Producer, Domain, LibType, Extension, Edition and Version ('.' in the version replaced by '_').
   */
  get aliasNameFromParts(): string {
    let stringBuilder = '';
    if (!isNullOrEmpty(this.producer)) {
      stringBuilder += this.producer;
    }
    if (!isNullOrEmpty(this.domain)) {
      stringBuilder += this.domain;
    }
    if (!isNullOrEmpty(this.libType)) {
      stringBuilder += this.libType;
    }
    if (!isNullOrEmpty(this.extension)) {
      stringBuilder += this.extension;
    }
    if (!isNullOrEmpty(this.edition)) {
      stringBuilder += this.edition;
    }
    if (!isNullOrEmpty(this.version)) {
      stringBuilder += this.version.replaceAll('.', '_');
    }
    return stringBuilder;
  }

  /** Gets the identifying file name, which is constructed from Producer, Domain, LibType and Edition. */
  get identifyingName(): string {
    let stringBuilder = '';
    if (!isNullOrEmpty(this.producer)) {
      stringBuilder += this.producer;
    }
    if (!isNullOrEmpty(this.domain)) {
      stringBuilder += this.domain;
    }
    if (!isNullOrEmpty(this.libType)) {
      stringBuilder += this.libType;
    }
    if (!isNullOrEmpty(this.edition)) {
      stringBuilder += this.edition;
    }
    return stringBuilder;
  }

  private readonly _contentType: AMLFileContentType;

  /** The content type of the AutomationML file. */
  get contentType(): AMLFileContentType {
    return this._contentType;
  }

  /**
   * Gets and sets the name, specifying the application domain of the content of the file. If this
   * instance is constructed with a well-formed file name, the domain is set by analyzing the given
   * file name.
   */
  domain: string | null = null;

  /**
   * A SubDomain is a part of the domain, separated by a '.' character. If a SubDomain is not
   * defined, the domain is returned.
   */
  get subDomain(): string | null {
    if (isNullOrEmpty(this.domain)) {
      return null;
    }
    const array = this.domain.split('.');
    if (array.length === 2) {
      return array[1];
    }
    return this.domain;
  }

  /** If the domain contains parts, separated by a '.' character, the main domain is defined as the first part. */
  get mainDomain(): string | null {
    if (isNullOrEmpty(this.domain)) {
      return null;
    }
    return this.domain.split('.')[0];
  }

  /**
   * Gets and sets the name, specifying the AutomationML edition of the provided file. If this
   * instance is constructed with a well-formed file name, the AutomationML edition is set by
   * analyzing the given file name.
   */
  edition: string | null = null;

  /**
   * Gets and sets the name, specifying a document as an extension of other existing library. If
   * this instance is constructed with a well-formed file name, the library extension definition
   * is set by analyzing the given file name.
   */
  extension: string | null = null;

  /**
   * Gets an AutomationML file name which is constructed from the specified properties Producer,
   * Domain, LibType, Extension, Edition and Version (joined by '_'); the file name of FilePath when
   * none is defined.
   */
  get fileNameFromParts(): string | null {
    let stringBuilder = '';
    let flag = false;
    if (!isNullOrEmpty(this.producer)) {
      stringBuilder += this.producer;
      flag = true;
    }
    if (!isNullOrEmpty(this.domain)) {
      if (flag) {
        stringBuilder += '_';
      }
      stringBuilder += this.domain;
      flag = true;
    }
    if (!isNullOrEmpty(this.libType)) {
      if (flag) {
        stringBuilder += '_';
      }
      stringBuilder += this.libType;
      flag = true;
    }
    if (!isNullOrEmpty(this.extension)) {
      if (flag) {
        stringBuilder += '_';
      }
      stringBuilder += this.extension;
      flag = true;
    }
    if (!isNullOrEmpty(this.edition)) {
      if (flag) {
        stringBuilder += '_';
      }
      stringBuilder += this.edition;
      flag = true;
    }
    if (!isNullOrEmpty(this.version)) {
      if (flag) {
        stringBuilder += '_';
      }
      stringBuilder += this.version;
    }
    if (stringBuilder.length !== 0) {
      // TrimEnd('_')
      let end = stringBuilder.length;
      while (end > 0 && stringBuilder[end - 1] === '_') end--;
      return stringBuilder.substring(0, end);
    }
    return getFileName(this.filePath);
  }

  /** The type of the AutomationML file. */
  fileType: AMLFileType = AMLFileType.AutomationMLXMLDocument;

  /** Determines, if all naming parts are defined for the file. */
  get isConsistent(): boolean {
    if (this.contentType === AMLFileContentType.LibraryFile) {
      return (
        !isNullOrWhiteSpace(this.producer) &&
        !isNullOrWhiteSpace(this.domain) &&
        !isNullOrWhiteSpace(this.libType) &&
        !isNullOrWhiteSpace(this.edition) &&
        !isNullOrWhiteSpace(this.version)
      );
    }
    return !isNullOrWhiteSpace(this.producer) && !isNullOrWhiteSpace(this.domain) && !isNullOrWhiteSpace(this.edition);
  }

  /** If the modeled file is an extended version. */
  get isExtension(): boolean {
    return !isNullOrEmpty(this.extension);
  }

  /**
   * Gets and sets the name of the contained library type of the file. If this instance is
   * constructed with a well-formed file name, the library type name is set by analyzing the given
   * file name. As an example, a possible library type may be one of the CAEX library tagnames.
   */
  libType: string | null = null;

  /** The name of the AutomationML file. */
  filePath: string | null = null;

  /**
   * Gets and sets the name of the producer of the file. If this instance is constructed with a
   * well-formed file name, the producer name is set by analyzing the given file name.
   */
  producer: string | null = null;

  /** The download link of the file, if it is provided by a server. Setting it derives the FileType. */
  get url(): string | null {
    return this._url;
  }

  set url(value: string | null) {
    this._url = value;
    switch (this.contentType) {
      case AMLFileContentType.LibraryFile:
      case AMLFileContentType.LibraryCollectionFile:
      case AMLFileContentType.ExampleFile:
        // C# dereferences the URL without a null check.
        this.fileType = cultureEndsWith(this._url!, '.amlx')
          ? AMLFileType.AutomationMLContainer
          : !cultureEndsWith(this._url!, '.aml')
            ? cultureEndsWith(this._url!, '.zip')
              ? AMLFileType.ZipArchive
              : AMLFileType.Unknown
            : AMLFileType.AutomationMLXMLDocument;
        break;
      case AMLFileContentType.LibraryCatalog:
      case AMLFileContentType.ClassRepository:
        this.fileType = AMLFileType.Catalog;
        break;
    }
  }

  /** Gets and sets an individual alias name for the file. */
  alias: string | null = null;

  /**
   * Gets and sets the release version of the file. If this instance is constructed with a
   * well-formed file name, the version is set by analyzing the given file name.
   */
  version: string | null = null;

  /** Gets the version string as SemanticVersion object (null when it is not a strict semantic version). */
  get semanticVersion(): SemanticVersion | null {
    if (isNullOrEmpty(this.version)) {
      return null;
    }
    const r = SemanticVersion.tryParseStrict(this.version);
    if (!r.result) {
      return null;
    }
    return r.value;
  }

  private _fileName: string | null = null;

  /** Gets the name of the file. */
  get fileName(): string | null {
    return this._fileName;
  }

  /**
   * Creates an instance of the AutomationML file model.
   * @param filePath The path of the file.
   * @param fileType The type of the AutomationML file, defining the content.
   */
  constructor(filePath: string | null, fileType: AMLFileContentType) {
    this._contentType = fileType;
    this.filePath = Uri.unescapeDataString(filePath);
    this.url = filePath;
    if (!isNullOrEmpty(this.filePath)) {
      this.setFileName(getFileName(this.filePath));
    }
  }

  /**
   * Sets the name of the file and calculates the properties encoded in the file name.
   * @param fileName Name of the file.
   */
  setFileName(fileName: string | null): void {
    this._fileName = fileName;
    switch (this.contentType) {
      case AMLFileContentType.LibraryFile:
        this.analyzeFileNameAsLibraryFile();
        break;
      case AMLFileContentType.LibraryCollectionFile:
        this.analyzeFileNameAsLibraryCollectionsFile();
        break;
      case AMLFileContentType.ExampleFile:
        this.analyzeFileNameAsExampleFile();
        break;
    }
  }

  /**
   * Gets the latest versions from the provided list (lazy: a document is returned when no other
   * document of the list is a newer version of it; the list is enumerated again for each document).
   * @param documents The document list.
   */
  static *getLatestVersions(documents: Iterable<AMLFileMetaModel>): Generator<AMLFileMetaModel> {
    const hasNewVersion = (document: AMLFileMetaModel): boolean => {
      for (const document2 of documents) {
        if (document2 !== document && document2.isNewVersion(document)) {
          return true;
        }
      }
      return false;
    };
    for (const document of documents) {
      if (!hasNewVersion(document)) {
        yield document;
      }
    }
  }

  /**
   * Determines whether a documents AutomationML version is equivalent to the files edition.
   * @param automationMLVersion The AutomationML version.
   * @returns `true` if the documents AutomationML version is equivalent; otherwise, `false`.
   */
  isDocumentEdition(automationMLVersion: string | null): boolean {
    switch (automationMLVersion) {
      case '2.0':
        return this.edition === 'AMLEd1';
      case '2.1':
        return this.edition === 'AMLEd2';
      case '2.10':
        return this.edition === 'AMLEd2';
      default:
        return false;
    }
  }

  /** Check, if this instance is a newer version than the provided `oldVersionModel`. */
  isNewVersion(oldVersionModel: AMLFileMetaModel | null): boolean {
    if (oldVersionModel == null || !this._isConsistentLibtype || !oldVersionModel._isConsistentLibtype) {
      return false;
    }
    const semanticVersion = oldVersionModel.semanticVersion;
    if (
      SemanticVersion.notEquals(this.semanticVersion, null) &&
      SemanticVersion.greaterThan(this.semanticVersion, semanticVersion) &&
      this.producer === oldVersionModel.producer &&
      this.domain === oldVersionModel.domain &&
      this.extension === oldVersionModel.extension &&
      this.libType === oldVersionModel.libType
    ) {
      return this.edition === oldVersionModel.edition;
    }
    return false;
  }

  private analyzeFileNameAsExampleFile(): void {
    const array = getFileNameWithoutExtension(this.fileName)?.split('_') ?? null;
    let num = 0;
    if (array != null && array.length >= 4) {
      this.producer = array[num++];
      this.domain = array[num++];
      this.libType = array[num++];
      this.edition = array[num++];
      if (num < array.length) {
        this.version = array[num++];
      }
    }
  }

  private analyzeFileNameAsLibraryCollectionsFile(): void {
    const array = getFileNameWithoutExtension(this.fileName)?.split('_') ?? null;
    let num = 0;
    if (array != null && array.length >= 3) {
      this.producer = array[num++];
      this.domain = array[num++];
      this.edition = array[num++];
      if (array.length >= 4) {
        this.version = array[num++];
      }
    }
  }

  private analyzeFileNameAsLibraryFile(): void {
    const array = getFileNameWithoutExtension(this.fileName)?.split('_') ?? null;
    let num = 0;
    if (array != null && array.length >= 5) {
      this.producer = array[num++];
      this.domain = array[num++];
      this.libType = array[num++];
      if (array.length === 6) {
        this.extension = array[num++];
      }
      this.edition = array[num++];
      this.version = array[num];
      this._isConsistentLibtype = true;
    } else {
      if (array != null && array.length > 0) {
        this.domain = array[0];
      }
      // C# dereferences FilePath without a null check.
      const filePath = this.filePath!;
      const num2 = indexOfInvariantIgnoreCase(filePath, 'AMLEd');
      if (num2 > 0) {
        // string.Substring(num2, 6): ArgumentOutOfRangeException when fewer than 6 characters follow.
        if (num2 > filePath.length - 6) {
          throw new ArgumentOutOfRangeException('length', 'Index and length must refer to a location within the string.');
        }
        this.edition = filePath.substring(num2, num2 + 6);
      }
    }
  }
}

T.AMLFileMetaModel = AMLFileMetaModel;
