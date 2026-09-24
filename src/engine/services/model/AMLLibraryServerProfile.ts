// Port of Aml.Engine.Services.Model.AMLLibraryServerProfile (Aml.Engine 4.5.2).
//
// JSON (de)serialization follows System.Text.Json with the options of the original
// (WriteIndented = true, everything else default): C# property names, properties of the
// derived class before those of PasswordProtected, enums as numbers, nulls written, the
// default JavaScriptEncoder escaping (non-ASCII and HTML-sensitive characters as \uXXXX),
// two-space indentation and CRLF line ends (Environment.NewLine on Windows).

import { T } from '../../registry.js';
import { registerInterfaces } from '../../interfaces.js';
import { ArgumentNullException, FormatException, NotSupportedException } from '../../../system/exceptions.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../../system/strings.js';
import { from } from '../../../system/linq.js';
import { Uri, UriKind } from '../../../system/index.js';
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

// ---- System.Text.Json emulation ------------------------------------------------------------

const NEWLINE = '\r\n';

function escapeJsonString(s: string): string {
  let r = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    const c = s.charCodeAt(i);
    switch (ch) {
      case '\\':
        r += '\\\\';
        continue;
      case '\n':
        r += '\\n';
        continue;
      case '\r':
        r += '\\r';
        continue;
      case '\t':
        r += '\\t';
        continue;
      case '\b':
        r += '\\b';
        continue;
      case '\f':
        r += '\\f';
        continue;
    }
    const escape = c < 0x20 || c > 0x7e || ch === '"' || ch === '&' || ch === "'" || ch === '+' || ch === '<' || ch === '>' || ch === '`';
    r += escape ? '\\u' + c.toString(16).toUpperCase().padStart(4, '0') : ch;
  }
  return r + '"';
}

function writeJson(value: unknown, indent: string): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return escapeJsonString(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return '[' + NEWLINE + value.map((v) => inner + writeJson(v, inner)).join(',' + NEWLINE) + NEWLINE + indent + ']';
  }
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  return '{' + NEWLINE + entries.map(([k, v]) => inner + escapeJsonString(k) + ': ' + writeJson(v, inner)).join(',' + NEWLINE) + NEWLINE + indent + '}';
}

class JsonException extends Error {}

function jsonType(v: unknown): string {
  if (v === null) return 'Null';
  if (Array.isArray(v)) return 'StartArray';
  switch (typeof v) {
    case 'string':
      return 'String';
    case 'number':
      return 'Number';
    case 'boolean':
      return v ? 'True' : 'False';
    default:
      return 'StartObject';
  }
}

function readString(v: unknown, path: string): string | null {
  if (v === null) return null;
  if (typeof v !== 'string') throw new JsonException(`The JSON value could not be converted to System.String. Path: ${path}`);
  return v;
}

function readInt(v: unknown, path: string, type: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < -2147483648 || v > 2147483647) {
    throw new JsonException(`The JSON value could not be converted to ${type}. Path: ${path}`);
  }
  return v;
}

function readBool(v: unknown, path: string): boolean {
  if (typeof v !== 'boolean') throw new JsonException(`The JSON value could not be converted to System.Boolean. Path: ${path}`);
  return v;
}

function readObject(v: unknown, path: string, type: string): Record<string, unknown> | null {
  if (v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) {
    throw new JsonException(`The JSON value could not be converted to ${type}. Path: ${path} (${jsonType(v)})`);
  }
  return v as Record<string, unknown>;
}

function readDataProfile(v: unknown, path: string): AMLLibraryServerDataProfile | null {
  const o = readObject(v, path, 'Aml.Engine.Services.Model.AMLLibraryServerDataProfile');
  if (o === null) return null;
  const d = new T.AMLLibraryServerDataProfile();
  for (const [k, value] of Object.entries(o)) {
    const p = `${path}.${k}`;
    switch (k) {
      case 'AutomationMLEdition':
        d.automationMLEdition = readInt(value, p, 'Aml.Engine.Services.Model.AMLEditionEnum') as AMLEditionEnum;
        break;
      case 'ContentType':
        d.contentType = readInt(value, p, 'Aml.Engine.Resources.Files.AMLFileContentType');
        break;
      case 'Folder':
        d.folder = readString(value, p);
        break;
      case 'UserName':
        d.userName = readString(value, p);
        break;
      case 'BranchOrTag':
        d.branchOrTag = readString(value, p);
        break;
      case 'PasswordHash':
        d.passwordHash = readString(value, p);
        break;
    }
  }
  return d;
}

function readDataProfileList(v: unknown, path: string): AMLLibraryServerDataProfile[] | null {
  if (v === null) return null;
  if (!Array.isArray(v)) {
    throw new JsonException(`The JSON value could not be converted to System.Collections.Generic.List. Path: ${path}`);
  }
  return v.map((x, i) => readDataProfile(x, `${path}[${i}]`) as AMLLibraryServerDataProfile);
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
    if (serverURL !== null && serverURL.toLowerCase().indexOf('github.com') >= 0) {
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
      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonString);
      } catch (e) {
        throw new JsonException(e instanceof Error ? e.message : String(e));
      }
      const o = readObject(parsed, '$', 'Aml.Engine.Services.Model.AMLLibraryServerProfile');
      if (o === null) {
        throw new FormatException('Deserialization returned null.');
      }
      const p = new T.AMLLibraryServerProfile();
      for (const [k, value] of Object.entries(o)) {
        const path = `$.${k}`;
        switch (k) {
          case 'UserName':
            p.userName = readString(value, path);
            break;
          case 'AccessRights':
            p.accessRights = readInt(value, path, 'Aml.Engine.Services.Model.AccessRightsEnum') as AccessRightsEnum;
            break;
          case 'NetworkProtocol':
            p.networkProtocol = readInt(value, path, 'Aml.Engine.Services.Model.NetworkProtocolEnum') as NetworkProtocolEnum;
            break;
          case 'ServerName':
            p.serverName = readString(value, path);
            break;
          case 'ServiceName':
            p.serviceName = readString(value, path);
            break;
          case 'PortNumber':
            p.portNumber = readInt(value, path, 'System.Int32');
            break;
          case 'BaseAddress':
            p.baseAddress = readString(value, path);
            break;
          case 'LibraryData':
            p.libraryData = readDataProfileList(value, path);
            break;
          case 'BackupData':
            p.backupData = readDataProfile(value, path);
            break;
          case 'LibraryCollectionData':
            p.libraryCollectionData = readDataProfileList(value, path);
            break;
          case 'ExampleData':
            p.exampleData = readDataProfileList(value, path);
            break;
          case 'AdministrationData':
            p.administrationData = readDataProfileList(value, path);
            break;
          case 'BranchName':
            p.branchName = readString(value, path);
            break;
          case 'IsPublicRepository':
            p.isPublicRepository = readBool(value, path);
            break;
          case 'PasswordHash':
            p.passwordHash = readString(value, path);
            break;
        }
      }
      p.onDeserialized();
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
