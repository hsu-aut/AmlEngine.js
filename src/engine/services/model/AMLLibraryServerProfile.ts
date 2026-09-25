// Port of Aml.Engine.Services.Model.AMLLibraryServerProfile (Aml.Engine 4.5.2).
//
// JSON (de)serialization follows System.Text.Json with the options of the original
// (WriteIndented = true, everything else default): C# property names, properties of the
// derived class before those of PasswordProtected, enums as numbers, nulls written, the
// default JavaScriptEncoder escaping (non-ASCII and HTML-sensitive characters as \uXXXX),
// two-space indentation and CRLF line ends (Environment.NewLine on Windows).

import { T } from '../../registry.js';
import { registerInterfaces } from '../../interfaces.js';
import { ArgumentNullException, FileNotFoundException, FormatException, NotSupportedException } from '../../../system/exceptions.js';
import * as NetPath from '../../amlobjects/internal/NetPath.js';
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

// ---- System.Text.Json emulation: reading ---------------------------------------------------
//
// JsonSerializer.Deserialize<AMLLibraryServerProfile>(string, options) streams the tokens of a
// Utf8JsonReader through the converters: the first syntax or conversion error in document order
// is thrown as JsonException with the JSON path of the converter frames and the reader position
// (line number counted by '\n', byte position in the line in UTF-8 bytes). Syntax errors report
// the position of the offending character (or of the end of the data), conversion errors the
// position after the current token.

class JsonException extends Error {}

type JsonTokenType = 'None' | 'StartObject' | 'EndObject' | 'StartArray' | 'EndArray' | 'PropertyName' | 'String' | 'Number' | 'True' | 'False' | 'Null';

/** JsonReaderHelper/ThrowHelper.GetPrintableString: printable ASCII as is, other bytes as 0xNN (the first UTF-8 byte). */
function printable(ch: string): string {
  const c = ch.charCodeAt(0);
  if (c >= 0x20 && c < 0x7f) return ch;
  const b = c < 0x80 ? c : c < 0x800 ? 0xc0 | (c >> 6) : c >= 0xd800 && c <= 0xdbff ? 0xf0 | ((0x10000 + ((c - 0xd800) << 10)) >> 18) : 0xe0 | (c >> 12);
  return '0x' + b.toString(16).toUpperCase().padStart(2, '0');
}

function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && s.charCodeAt(i + 1) >= 0xdc00 && s.charCodeAt(i + 1) <= 0xdfff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

const isJsonWhiteSpace = (ch: string) => ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n';
const isDigit = (ch: string | undefined) => ch !== undefined && ch >= '0' && ch <= '9';
const isHex = (ch: string) => /^[0-9a-fA-F]$/.test(ch);

/** The parts of Utf8JsonReader the deserializer uses (single final block, default options). */
class JsonReader {
  private i = 0;
  private line = 0;
  private lineStart = 0;
  private readonly stack: string[] = [];
  tokenType: JsonTokenType = 'None';
  /** Raw text of a string (without quotes, still escaped) or number token. */
  raw = '';
  /** Line and byte position after the current token. */
  private tokenLine = 0;
  private tokenPos = 0;
  /** The JSON path of the deserializer, used in the messages of reader errors. */
  path: () => string;

  constructor(
    private readonly s: string,
    path: () => string,
  ) {
    this.path = path;
  }

  private position(index: number): string {
    return `LineNumber: ${this.line} | BytePositionInLine: ${utf8Length(this.s.substring(this.lineStart, index))}`;
  }

  /** A reader error (JsonReaderException, rethrown by the serializer with the path). */
  fail(message: string, index: number): never {
    throw new JsonException(`${message} Path: ${this.path()} | ${this.position(index)}.`);
  }

  /** A converter error at the position after the current token. */
  failConvert(typeName: string, path: string): never {
    throw new JsonException(`The JSON value could not be converted to ${typeName}. Path: ${path} | LineNumber: ${this.tokenLine} | BytePositionInLine: ${this.tokenPos}.`);
  }

  private skipWhiteSpace(): void {
    while (this.i < this.s.length && isJsonWhiteSpace(this.s[this.i])) {
      if (this.s[this.i] === '\n') {
        this.line++;
        this.lineStart = this.i + 1;
      }
      this.i++;
    }
  }

  private setToken(type: JsonTokenType, end: number): void {
    this.tokenType = type;
    this.i = end;
    this.tokenLine = this.line;
    this.tokenPos = utf8Length(this.s.substring(this.lineStart, end));
  }

  read(): boolean {
    this.skipWhiteSpace();
    const s = this.s;
    if (this.i >= s.length) {
      if (this.stack.length === 0 && this.tokenType !== 'None') return false;
      this.fail('Expected depth to be zero at the end of the JSON payload. There is an open JSON object or array that should be closed.', this.i);
    }
    const c = s[this.i];
    if (this.tokenType === 'None') {
      this.consumeValue(c);
      return true;
    }
    if (this.stack.length === 0) {
      this.fail(`'${printable(c)}' is invalid after a single JSON value. Expected end of data.`, this.i);
    }
    const top = this.stack[this.stack.length - 1];
    switch (this.tokenType) {
      case 'PropertyName':
        this.consumeValue(c);
        return true;
      case 'StartObject':
        if (c === '}') return this.endContainer('{', c);
        if (c === '"') return this.consumePropertyName();
        if (c === '/') this.fail("'/' is invalid after a value. Expected either ',', '}', or ']'.", this.i);
        this.fail(`'${printable(c)}' is an invalid start of a property name. Expected a '"'.`, this.i);
        break;
      case 'StartArray':
        if (c === ']') return this.endContainer('[', c);
        this.consumeValue(c);
        return true;
    }
    if (c === ',') {
      const comma = this.i;
      this.i++;
      this.skipWhiteSpace();
      if (this.i >= s.length) {
        // Reported at the position of the comma.
        this.fail('Expected start of a property name or value, but instead reached end of data.', comma);
      }
      const c2 = s[this.i];
      if (top === '{') {
        if (c2 === '"') return this.consumePropertyName();
        if (c2 === '}') this.fail('The JSON object contains a trailing comma at the end which is not supported in this mode. Change the reader options.', this.i);
        this.fail(`'${printable(c2)}' is an invalid start of a property name. Expected a '"'.`, this.i);
      }
      if (c2 === ']') this.fail('The JSON array contains a trailing comma at the end which is not supported in this mode. Change the reader options.', this.i);
      this.consumeValue(c2);
      return true;
    }
    if (c === '}' || c === ']') {
      if ((c === '}' && top === '{') || (c === ']' && top === '[')) return this.endContainer(top, c);
      this.fail(`'${c}' is invalid without a matching open.`, this.i);
    }
    this.fail(`'${printable(c)}' is invalid after a value. Expected either ',', '}', or ']'.`, this.i);
  }

  private endContainer(_open: string, close: string): boolean {
    this.stack.pop();
    this.setToken(close === '}' ? 'EndObject' : 'EndArray', this.i + 1);
    return true;
  }

  /** Scans a string starting at the opening quote; returns the index after the closing quote. */
  private scanString(start: number): number {
    const s = this.s;
    let j = start + 1;
    for (;;) {
      if (j >= s.length) this.fail('Expected end of string, but instead reached end of data.', s.length);
      const ch = s[j];
      if (ch === '"') break;
      if (ch === '\\') {
        j++;
        if (j >= s.length) this.fail('Expected end of string, but instead reached end of data.', s.length);
        const e = s[j];
        if (e === 'u') {
          for (let k = 1; k <= 4; k++) {
            if (j + k >= s.length) this.fail('Expected end of string, but instead reached end of data.', s.length);
            if (!isHex(s[j + k])) this.fail(`'${printable(s[j + k])}' is not a hex digit following '\\u' within a JSON string. The string should be correctly escaped.`, j + k);
          }
          j += 5;
          continue;
        }
        if (!'"\\/bfnrt'.includes(e)) this.fail(`'${printable(e)}' is an invalid escapable character within a JSON string. The string should be correctly escaped.`, j);
        j++;
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) this.fail(`'${printable(ch)}' is invalid within a JSON string. The string should be correctly escaped.`, j);
      j++;
    }
    this.raw = s.substring(start + 1, j);
    return j + 1;
  }

  private consumePropertyName(): boolean {
    const end = this.scanString(this.i);
    this.i = end;
    this.skipWhiteSpace();
    if (this.i >= this.s.length) this.fail('Expected a value, but instead reached end of data.', this.i);
    if (this.s[this.i] !== ':') this.fail(`'${printable(this.s[this.i])}' is invalid after a property name. Expected a ':'.`, this.i);
    this.setToken('PropertyName', this.i + 1);
    return true;
  }

  private consumeValue(c: string): void {
    const s = this.s;
    const start = this.i;
    switch (c) {
      case '"':
        this.setToken('String', this.scanString(start));
        return;
      case '{':
      case '[':
        this.stack.push(c);
        this.setToken(c === '{' ? 'StartObject' : 'StartArray', start + 1);
        return;
      case 't':
      case 'f':
      case 'n': {
        const literal = c === 't' ? 'true' : c === 'f' ? 'false' : 'null';
        for (let k = 0; k < literal.length; k++) {
          if (s[start + k] !== literal[k]) {
            this.fail(`'${s.substring(start)}' is an invalid JSON literal. Expected the literal '${literal}'.`, Math.min(start + k, s.length));
          }
        }
        this.setToken(c === 't' ? 'True' : c === 'f' ? 'False' : 'Null', start + literal.length);
        return;
      }
    }
    if (c !== '-' && !isDigit(c)) this.fail(`'${printable(c)}' is an invalid start of a value.`, start);
    const endOfData = () => this.fail("Expected a digit ('0'-'9'), but instead reached end of data.", s.length);
    const afterSign = (j: number) =>
      this.fail(`'${printable(s[j])}' is invalid within a number, immediately after a sign character ('+' or '-'). Expected a digit ('0'-'9').`, j);
    let j = start;
    if (s[j] === '-') {
      j++;
      if (j >= s.length) endOfData();
      if (!isDigit(s[j])) afterSign(j);
    }
    if (s[j] === '0') {
      j++;
      if (isDigit(s[j])) this.fail(`Invalid leading zero before '${s[j]}'.`, j);
    } else {
      while (isDigit(s[j])) j++;
    }
    if (s[j] === '.') {
      j++;
      if (j >= s.length) endOfData();
      if (!isDigit(s[j])) this.fail(`'${printable(s[j])}' is invalid within a number, immediately after a decimal point ('.'). Expected a digit ('0'-'9').`, j);
      while (isDigit(s[j])) j++;
    }
    if (s[j] === 'e' || s[j] === 'E') {
      j++;
      if (s[j] === '+' || s[j] === '-') j++;
      if (j >= s.length) endOfData();
      if (!isDigit(s[j])) afterSign(j);
      while (isDigit(s[j])) j++;
    }
    if (j >= s.length) {
      if (this.stack.length > 0) this.fail(`'${printable(s[j - 1])}' is an invalid end of a number. Expected a delimiter.`, j);
    } else if (!isJsonWhiteSpace(s[j]) && s[j] !== ',' && s[j] !== '}' && s[j] !== ']') {
      this.fail(`'${printable(s[j])}' is an invalid end of a number. Expected a delimiter.`, j);
    }
    this.raw = s.substring(start, j);
    this.setToken('Number', j);
  }

  /** Utf8JsonReader.Skip: reads to the end of the current object or array. */
  skip(): void {
    if (this.tokenType === 'PropertyName') this.read();
    if (this.tokenType === 'StartObject' || this.tokenType === 'StartArray') {
      const depth = this.stack.length;
      while (this.read() && this.stack.length >= depth) {
        // nested tokens
      }
    }
  }
}

/** Unescapes a JSON string; null for text that is not valid UTF-16 (a lone surrogate from a \u escape). */
function unescapeJson(raw: string): string | null {
  const out: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      out.push(ch);
      continue;
    }
    const e = raw[++i];
    switch (e) {
      case 'b':
        out.push('\b');
        break;
      case 'f':
        out.push('\f');
        break;
      case 'n':
        out.push('\n');
        break;
      case 'r':
        out.push('\r');
        break;
      case 't':
        out.push('\t');
        break;
      case 'u':
        out.push(String.fromCharCode(parseInt(raw.substring(i + 1, i + 5), 16)));
        i += 4;
        break;
      default:
        out.push(e);
    }
  }
  const s = out.join('');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = s.charCodeAt(i + 1);
      if (!(d >= 0xdc00 && d <= 0xdfff)) return null;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return null;
    }
  }
  return s;
}

/** ReadStack.JsonPath: property names with special characters are written as ['name']. */
function appendPropertyName(name: string): string {
  return /[. '\/"[\]()\t\n\r\f\b\\\u0085\u2028\u2029]/.test(name) ? "['" + name + "']" : '.' + name;
}

interface Frame {
  prop: string | null;
  index: number | null;
}

/** The converters of the profile types, driven by the reader like JsonSerializer. */
class ProfileDeserializer {
  private readonly frames: Frame[] = [];

  constructor(private readonly reader: JsonReader) {}

  path(): string {
    let p = '$';
    for (const f of this.frames) {
      if (f.index !== null) p += `[${f.index}]`;
      else if (f.prop !== null) p += appendPropertyName(f.prop);
    }
    return p;
  }

  private fail(typeName: string): never {
    this.reader.failConvert(typeName, this.path());
  }

  private readString(): string | null {
    const r = this.reader;
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'String') this.fail('System.String');
    const v = unescapeJson(r.raw);
    if (v === null) this.fail('System.String');
    return v;
  }

  private readInt(typeName: string): number {
    const r = this.reader;
    if (r.tokenType !== 'Number' || !/^-?(0|[1-9][0-9]*)$/.test(r.raw)) this.fail(typeName);
    const v = Number(r.raw);
    if (v < -2147483648 || v > 2147483647) this.fail(typeName);
    return v === 0 ? 0 : v;
  }

  private readBool(): boolean {
    const r = this.reader;
    if (r.tokenType === 'True') return true;
    if (r.tokenType === 'False') return false;
    this.fail('System.Boolean');
  }

  /** Reads the properties of an object (the reader is on StartObject). */
  private readProperties(onProperty: (name: string) => boolean): void {
    const r = this.reader;
    const frame: Frame = { prop: null, index: null };
    this.frames.push(frame);
    for (;;) {
      r.read();
      if (r.tokenType === 'EndObject') break;
      const name = unescapeJson(r.raw) ?? r.raw;
      frame.prop = name;
      r.read();
      if (!onProperty(name)) r.skip();
      frame.prop = null;
    }
    this.frames.pop();
  }

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
    });
    return d;
  }

  private readDataProfileList(): AMLLibraryServerDataProfile[] | null {
    const r = this.reader;
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'StartArray') this.fail('System.Collections.Generic.List`1[Aml.Engine.Services.Model.AMLLibraryServerDataProfile]');
    const list: AMLLibraryServerDataProfile[] = [];
    const frame: Frame = { prop: null, index: 0 };
    this.frames.push(frame);
    for (;;) {
      frame.index = list.length;
      r.read();
      if ((r.tokenType as JsonTokenType) === 'EndArray') break;
      list.push(this.readDataProfile() as AMLLibraryServerDataProfile);
    }
    this.frames.pop();
    return list;
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
    });
    p.onDeserialized();
    return p;
  }
}

/** JsonSerializer.Deserialize<AMLLibraryServerProfile>(json, options). */
function deserializeProfile(json: string): AMLLibraryServerProfile | null {
  let deserializer: ProfileDeserializer | null = null;
  const reader = new JsonReader(json, () => deserializer!.path());
  deserializer = new ProfileDeserializer(reader);
  const p = deserializer.readProfile();
  // The reader must reach the end of the data after the root value.
  reader.path = () => '$';
  reader.read();
  return p;
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
