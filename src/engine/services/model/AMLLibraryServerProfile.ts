// Port of Aml.Engine.Services.Model.AMLLibraryServerProfile (Aml.Engine 4.5.2).
//
// JSON (de)serialization follows System.Text.Json with the options of the original
// (WriteIndented = true, everything else default): C# property names, properties of the
// derived class before those of PasswordProtected, enums as numbers, nulls written, the
// default JavaScriptEncoder escaping (non-ASCII and HTML-sensitive characters as \uXXXX),
// two-space indentation and CRLF line ends (Environment.NewLine on Windows). The emulation of
// System.Text.Json is src/system/Json.ts; this module adds the converters of the profile types.

import { T } from '../../registry.js';
import { registerInterfaces } from '../../interfaces.js';
import { ArgumentNullException, FileNotFoundException, FormatException, NotSupportedException } from '../../../system/exceptions.js';
import * as NetPath from '../../amlobjects/internal/NetPath.js';
import { isNullOrEmpty, isNullOrWhiteSpace, toUpperOrdinal } from '../../../system/strings.js';
import { from } from '../../../system/linq.js';
import { Uri, UriKind } from '../../../system/index.js';
import { JsonDeserializer, JsonException, deserialize, writeJson } from '../../../system/Json.js';
import { AmlObjectsExtensions } from '../../amlobjects/extensions/AmlObjectsExtensions.js';
import { PasswordProtected } from './PasswordProtected.js';
import { AccessRightsEnum } from './AccessRightsEnum.js';
import { NetworkProtocolEnum } from './NetworkProtocolEnum.js';
import { AMLEditionEnumExtension } from './AMLEditionEnumExtension.js';
import type { AMLEditionEnum } from './AMLEditionEnum.js';
import type { AMLLibraryServerDataProfile } from './AMLLibraryServerDataProfile.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { ICredentials } from '../interfaces/ICredentials.js';

/** System.Net.NetworkCredential (user name and password). */
export class NetworkCredential {
  constructor(
    public userName: string | null = '',
    public password: string | null = '',
  ) {}
}

// ---- System.Text.Json converters of the profile types (src/system/Json.ts) -------------------

/** The converters of the profile types, driven by the reader like JsonSerializer. */
class ProfileDeserializer extends JsonDeserializer {
  readDataProfile(): AMLLibraryServerDataProfile | null {
    const r = this.reader;
    const typeName = 'Aml.Engine.Services.Model.AMLLibraryServerDataProfile';
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'StartObject') this.fail(typeName);
    const d = new T.AMLLibraryServerDataProfile() as AMLLibraryServerDataProfile;
    this.readProperties((name) => {
      switch (name) {
        case 'AutomationMLEdition':
          d.automationMLEdition = this.readInt('Aml.Engine.Services.Model.AMLEditionEnum') as AMLEditionEnum;
          return true;
        case 'ContentType':
          d.contentType = this.readInt('Aml.Engine.Resources.Files.AMLFileContentType');
          return true;
        case 'Folder':
          d.folder = this.readString();
          return true;
        case 'UserName':
          d.userName = this.readString();
          return true;
        case 'BranchOrTag':
          d.branchOrTag = this.readString();
          return true;
        case 'PasswordHash':
          d.passwordHash = this.readString();
          return true;
        default:
          return false;
      }
    }, typeName);
    return d;
  }

  private readDataProfileList(): AMLLibraryServerDataProfile[] | null {
    return this.readList(
      'System.Collections.Generic.List`1[Aml.Engine.Services.Model.AMLLibraryServerDataProfile]',
      () => this.readDataProfile() as AMLLibraryServerDataProfile,
    );
  }

  readProfile(): AMLLibraryServerProfile | null {
    const r = this.reader;
    r.read();
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'StartObject') this.fail('Aml.Engine.Services.Model.AMLLibraryServerProfile');
    const p = new T.AMLLibraryServerProfile() as AMLLibraryServerProfile;
    this.readProperties((name) => {
      switch (name) {
        case 'UserName':
          p.userName = this.readString();
          return true;
        case 'AccessRights':
          p.accessRights = this.readInt('Aml.Engine.Services.Model.AccessRightsEnum') as AccessRightsEnum;
          return true;
        case 'NetworkProtocol':
          p.networkProtocol = this.readInt('Aml.Engine.Services.Model.NetworkProtocolEnum') as NetworkProtocolEnum;
          return true;
        case 'ServerName':
          p.serverName = this.readString();
          return true;
        case 'ServiceName':
          p.serviceName = this.readString();
          return true;
        case 'PortNumber':
          p.portNumber = this.readInt('System.Int32');
          return true;
        case 'BaseAddress':
          p.baseAddress = this.readString();
          return true;
        case 'LibraryData':
          p.libraryData = this.readDataProfileList();
          return true;
        case 'BackupData':
          p.backupData = this.readDataProfile();
          return true;
        case 'LibraryCollectionData':
          p.libraryCollectionData = this.readDataProfileList();
          return true;
        case 'ExampleData':
          p.exampleData = this.readDataProfileList();
          return true;
        case 'AdministrationData':
          p.administrationData = this.readDataProfileList();
          return true;
        case 'BranchName':
          p.branchName = this.readString();
          return true;
        case 'IsPublicRepository':
          p.isPublicRepository = this.readBool();
          return true;
        case 'PasswordHash':
          p.passwordHash = this.readString();
          return true;
        default:
          return false;
      }
    }, 'Aml.Engine.Services.Model.AMLLibraryServerProfile');
    p.onDeserialized();
    return p;
  }
}

/** JsonSerializer.Deserialize<AMLLibraryServerProfile>(json, options). */
function deserializeProfile(json: string): AMLLibraryServerProfile | null {
  return deserialize(json, (reader) => new ProfileDeserializer(reader), (d) => d.readProfile());
}

// ---- helpers for the .NET string functions used below ----------------------------------------

function trimChar(s: string, c: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && s[start] === c) start++;
  while (end > start && s[end - 1] === c) end--;
  return s.substring(start, end);
}

function trimEndChar(s: string, c: string): string {
  let end = s.length;
  while (end > 0 && s[end - 1] === c) end--;
  return s.substring(0, end);
}

/** A library server (address, protocol, credentials and the data folders of its content). */
export class AMLLibraryServerProfile extends PasswordProtected implements ICredentials {
  static readonly ANONYMOUS = 'anonymous';

  private static readonly MaxTries = 3;

  private _invalidTries = 0;

  static readonly LoginWarning = 'The maximum number of unauthorized logins has been reached.Check your login information.';

  /** True for the user name "anonymous". Not serialized. */
  get isAnonymous(): boolean {
    return this.userName === 'anonymous';
  }

  /** The user name. */
  userName: string | null = null;

  /** True while the number of failed logins does not exceed the maximum. Not serialized. */
  get canTryLogin(): boolean {
    return this._invalidTries <= 3;
  }

  accessRights: AccessRightsEnum = AccessRightsEnum.ReadAccess;

  networkProtocol: NetworkProtocolEnum = NetworkProtocolEnum.WebDAV;

  serverName: string | null = null;

  serviceName: string | null = null;

  /** The protocol prefix ("https://" etc.). Not serialized. */
  get protocolName(): string {
    switch (this.networkProtocol) {
      case NetworkProtocolEnum.WebDAVHttp:
        return 'http://';
      case NetworkProtocolEnum.WebDAV:
        return 'https://';
      case NetworkProtocolEnum.File:
        return 'file://';
      case NetworkProtocolEnum.FTP:
        return 'ftp://';
      case NetworkProtocolEnum.Github:
        return 'https://';
      default:
        return '';
    }
  }

  /** Protocol and server name. Not serialized. */
  get serverURL(): string {
    return this.protocolName + (this.serverName ?? '');
  }

  portNumber = 0;

  baseAddress: string | null = null;

  libraryData: AMLLibraryServerDataProfile[] | null = [];

  /** The library catalogue data of the administration data. Not serialized. */
  get libraryCatalogData(): AMLLibraryServerDataProfile | null {
    return this.administrationData !== null ? from(this.administrationData).firstOrDefault((l) => l.contentType === 3) : null;
  }

  backupData: AMLLibraryServerDataProfile | null = null;

  /** The class catalogue data of the administration data. Not serialized. */
  get classCatalogData(): AMLLibraryServerDataProfile | null {
    return this.administrationData !== null ? from(this.administrationData).firstOrDefault((l) => l.contentType === 4) : null;
  }

  /** The signature data of the administration data. Not serialized. */
  get signatureData(): AMLLibraryServerDataProfile | null {
    return this.administrationData !== null ? from(this.administrationData).firstOrDefault((l) => l.contentType === 5) : null;
  }

  libraryCollectionData: AMLLibraryServerDataProfile[] | null = [];

  exampleData: AMLLibraryServerDataProfile[] | null = [];

  administrationData: AMLLibraryServerDataProfile[] | null = [];

  branchName: string | null = 'Main';

  isPublicRepository = false;

  /** The credentials for the data (user name and password of the data, else of the server). */
  credentials(data: AMLLibraryServerDataProfile): NetworkCredential {
    return new NetworkCredential(
      isNullOrWhiteSpace(data.userName) ? this.userName : data.userName,
      isNullOrWhiteSpace(data.password) ? this.password : data.password,
    );
  }

  loginFailed(): void {
    this._invalidTries++;
  }

  resetFailedLogins(): void {
    this._invalidTries = 0;
  }

  /** IJsonOnDeserialized.OnDeserialized: the service name defaults to the server name. */
  onDeserialized(): void {
    if (isNullOrEmpty(this.serviceName)) {
      this.serviceName = this.serverName;
    }
  }

  /** The base address with "%UserName" replaced by the user name of the data (or of the server). */
  getResolvedBaseAddress(data: AMLLibraryServerDataProfile | null): string | null {
    // C# dereferences BaseAddress without a null check.
    if (!this.baseAddress!.includes('%UserName')) {
      return this.baseAddress;
    }
    const replacement = data === null || isNullOrEmpty(data.userName) ? this.userName : data.userName;
    return this.baseAddress!.split('%UserName').join(replacement ?? '');
  }

  /** The URI of the data folder or of a file in it (GitHub web URLs for github.com servers). */
  getUri(dataProfile: AMLLibraryServerDataProfile, fileName: string | null = null, isDownloadUri = false): Uri | null {
    const serverURL = this.serverURL;
    if (serverURL !== null && toUpperOrdinal(serverURL).indexOf('GITHUB.COM') >= 0) {
      const userName = this.userName;
      const baseAddress = this.baseAddress;
      const value = isNullOrWhiteSpace(dataProfile.branchOrTag) ? 'main' : dataProfile.branchOrTag;
      let text = dataProfile.folder ?? '';
      text = trimChar(text.split('\\').join('/'), '/');
      fileName = fileName !== null ? trimChar(fileName.split('\\').join('/'), '/') : null;
      const list: string[] = [];
      if (!isNullOrEmpty(text)) {
        list.push(...text.split('/').filter((p) => p.length > 0));
      }
      if (!isNullOrEmpty(fileName)) {
        list.push(...fileName.split('/').filter((p) => p.length > 0));
      }
      const value2 = list.map((p) => Uri.escapeDataString(p)).join('/');
      const flag = !isNullOrEmpty(fileName);
      const uriString =
        list.length <= 0
          ? `https://github.com/${userName ?? ''}/${baseAddress ?? ''}/tree/${value}`
          : !(flag || isDownloadUri)
            ? `https://github.com/${userName ?? ''}/${baseAddress ?? ''}/tree/${value}/${value2}`
            : `https://github.com/${userName ?? ''}/${baseAddress ?? ''}/blob/${value}/${value2}`;
      return Uri.tryCreate(uriString, UriKind.Absolute);
    }
    let text2: string | null = trimEndChar(this.serverURL, '/');
    if (this.portNumber > 0) {
      text2 = text2 + ':' + this.portNumber;
    }
    if (!isNullOrEmpty(this.baseAddress)) {
      text2 = text2 + '/' + trimChar(this.getResolvedBaseAddress(dataProfile)!, '/');
    }
    if (!isNullOrEmpty(dataProfile.folder)) {
      text2 = text2 + '/' + trimChar(dataProfile.folder, '/');
    }
    if (!isNullOrEmpty(fileName)) {
      text2 = text2 + '/' + trimChar(fileName, '/');
    }
    if (!this.protocolName.startsWith('http')) {
      return Uri.tryCreate(text2, UriKind.Absolute);
    }
    const text3 = isNullOrWhiteSpace(dataProfile.password) ? this.password : dataProfile.password;
    const text4 = isNullOrWhiteSpace(dataProfile.userName) ? this.userName : dataProfile.userName;
    if (!isNullOrEmpty(text4)) {
      const value3 = isNullOrEmpty(text3) ? text4 + '@' : text4 + ':' + text3 + '@';
      const at = this.protocolName.length;
      text2 = text2.substring(0, at) + value3 + text2.substring(at);
    }
    return Uri.tryCreate(text2, UriKind.Absolute);
  }

  /** Serializes the profile to indented JSON (System.Text.Json). */
  serialize(): string {
    return writeJson(this.toJsonObject(), '');
  }

  /** @internal JSON properties in System.Text.Json order (derived class first, then PasswordProtected). */
  toJsonObject(): Record<string, unknown> {
    const list = (l: AMLLibraryServerDataProfile[] | null): unknown => (l === null ? null : l.map((d) => (d === null ? null : d.toJsonObject())));
    return {
      UserName: this.userName,
      AccessRights: this.accessRights,
      NetworkProtocol: this.networkProtocol,
      ServerName: this.serverName,
      ServiceName: this.serviceName,
      PortNumber: this.portNumber,
      BaseAddress: this.baseAddress,
      LibraryData: list(this.libraryData),
      BackupData: this.backupData === null ? null : this.backupData.toJsonObject(),
      LibraryCollectionData: list(this.libraryCollectionData),
      ExampleData: list(this.exampleData),
      AdministrationData: list(this.administrationData),
      BranchName: this.branchName,
      IsPublicRepository: this.isPublicRepository,
      PasswordHash: this.passwordHash,
    };
  }

  /** Loads a profile from its JSON text. */
  static loadFromString(jsonString: string | null): AMLLibraryServerProfile {
    if (jsonString === null || jsonString === undefined) {
      throw new ArgumentNullException('jsonString');
    }
    jsonString = trimChar(jsonString.replace(/^\ufeff+/, ''), '\0');
    if (isNullOrWhiteSpace(jsonString)) {
      throw new FormatException('Profile file is empty.');
    }
    if (jsonString.length > 1 && jsonString[0] === '{' && jsonString[1] === '\0') {
      throw new FormatException('Profile appears to be UTF-16 encoded; expected UTF-8.');
    }
    if (jsonString.indexOf('\0') >= 0) {
      throw new FormatException('Profile contains NUL bytes \u2013 file is corrupted or wrong encoding.');
    }
    try {
      const p = deserializeProfile(jsonString);
      if (p === null) {
        throw new FormatException('Deserialization returned null.');
      }
      return p;
    } catch (ex) {
      if (ex instanceof JsonException) {
        const fe = new FormatException('Invalid profile JSON: ' + ex.message);
        (fe as Error & { innerException?: unknown }).innerException = ex;
        throw fe;
      }
      throw ex;
    }
  }

  /** Loads a profile from a JSON file (Node only: File.ReadAllText needs synchronous file access). */
  static loadFromFile(filePath: string): AMLLibraryServerProfile {
    const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
    const fs = proc?.getBuiltinModule?.('node:fs') as { readFileSync(path: string): Uint8Array } | undefined;
    if (!fs) {
      throw new NotSupportedException('File access is not available in this environment.');
    }
    // File.ReadAllText: FileNotFoundException with the full path for a missing file.
    if (!NetPath.fileExists(filePath)) {
      throw new FileNotFoundException(`Could not find file '${NetPath.getFullPath(filePath)}'.`);
    }
    return AMLLibraryServerProfile.loadFromString(readAllText(fs.readFileSync(filePath)));
  }

  /** The library data supporting the AutomationML edition of the document. */
  libraryDataForDocument(amlDocument: CAEXDocument): AMLLibraryServerDataProfile | null {
    const edition = AMLEditionEnumExtension.amlEditionFromVersion(AmlObjectsExtensions.automationMLVersion(amlDocument));
    return from(this.libraryData!).firstOrDefault((l) => l.supportsEdition(edition));
  }

  /** The library collection data supporting the AutomationML edition of the document. */
  libraryCollectionDataForDocument(amlDocument: CAEXDocument): AMLLibraryServerDataProfile | null {
    const edition = AMLEditionEnumExtension.amlEditionFromVersion(AmlObjectsExtensions.automationMLVersion(amlDocument));
    return from(this.libraryCollectionData!).firstOrDefault((l) => l.supportsEdition(edition));
  }

  /** The example data supporting the AutomationML edition of the document. */
  exampleDataForDocument(amlDocument: CAEXDocument): AMLLibraryServerDataProfile | null {
    const edition = AMLEditionEnumExtension.amlEditionFromVersion(AmlObjectsExtensions.automationMLVersion(amlDocument));
    return from(this.exampleData!).firstOrDefault((l) => l.supportsEdition(edition));
  }

  /** The data of the profile with the content type and edition of the given data. */
  getData(data: AMLLibraryServerDataProfile): AMLLibraryServerDataProfile | null {
    let list: AMLLibraryServerDataProfile[] | null = [];
    switch (data.contentType) {
      case 0:
        list = this.libraryData;
        break;
      case 1:
        list = this.libraryCollectionData;
        break;
      case 2:
        list = this.exampleData;
        break;
      case 3:
      case 4:
      case 5:
        list = this.administrationData;
        break;
    }
    if (list === null) {
      return null;
    }
    const first = from(list).firstOrDefault(
      (dataProfile) => dataProfile.contentType === data.contentType && dataProfile.automationMLEdition === data.automationMLEdition,
    );
    if (first !== null) {
      return first;
    }
    return from(list).firstOrDefault((dataProfile) => dataProfile.contentType === data.contentType && dataProfile.supportsEdition(data.automationMLEdition));
  }

  /** The data to restore a backup file to, and the original file name. */
  restorationData(fileName: string): { result: AMLLibraryServerDataProfile | null; originalFileName: string } {
    const r = T.AMLLibraryServerDataProfile.backupFileType(fileName);
    const originalFileName = r.originalName;
    const parts = fileName.split('_');
    const edition = AMLEditionEnumExtension.amlEditionFromEditionString(parts[parts.length - 1]);
    let result: AMLLibraryServerDataProfile | null;
    switch (r.result) {
      case 0:
        result = from(this.libraryData!).firstOrDefault((d) => d.supportsEdition(edition));
        break;
      case 2:
        result = from(this.exampleData!).firstOrDefault((d) => d.supportsEdition(edition));
        break;
      case 1:
        result = from(this.libraryCollectionData!).firstOrDefault((d) => d.supportsEdition(edition));
        break;
      case 3:
        result = this.libraryCatalogData;
        break;
      case 4:
        result = this.classCatalogData;
        break;
      default:
        result = null;
        break;
    }
    return { result, originalFileName };
  }

  /** Blocks further logins. */
  block(): void {
    this._invalidTries = 4;
  }
}

/** File.ReadAllText: BOM detection (UTF-8, UTF-16 LE/BE, UTF-32 LE), UTF-8 otherwise. */
function readAllText(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder('utf-8').decode(bytes.subarray(3));
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xfe && bytes[2] === 0 && bytes[3] === 0) {
    let s = '';
    for (let i = 4; i + 3 < bytes.length; i += 4) {
      s += String.fromCodePoint(bytes[i] | (bytes[i + 1] << 8) | (bytes[i + 2] << 16) | (bytes[i + 3] << 24));
    }
    return s;
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(bytes.subarray(2));
  }
  return new TextDecoder('utf-8').decode(bytes);
}

T.AMLLibraryServerProfile = AMLLibraryServerProfile;
registerInterfaces(AMLLibraryServerProfile, 'ICredentials', 'IJsonOnDeserialized');
