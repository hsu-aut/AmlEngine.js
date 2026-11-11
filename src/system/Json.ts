// System.Text.Json for the port: the parts of JsonSerializer that the engine and its resources
// use, with the default options (property names as declared, case-sensitive matching, nulls
// written, enums as numbers, no comments, no trailing commas) and optionally WriteIndented.
//
// Writing: the default JavaScriptEncoder escaping (non-ASCII and HTML-sensitive characters as
// \uXXXX); indented output uses two spaces and Environment.NewLine of Windows (CRLF). The value
// to write is a plain object graph (strings, numbers, booleans, null, arrays, objects whose
// property order is the order System.Text.Json takes from the type).
//
// Reading: JsonSerializer.Deserialize<T>(string or UTF-8 stream) streams the tokens of a
// Utf8JsonReader through the converters: the first syntax or conversion error in document order
// is thrown as JsonException with the JSON path of the converter frames and the reader position
// (line number counted by '\n', byte position in the line in UTF-8 bytes). Syntax errors report
// the position of the offending character (or of the end of the data), conversion errors the
// position after the current token. A type reads itself with a subclass of JsonDeserializer
// (one method per converter), driven by `deserialize`.
//
// JsonSerializerOptions.MaxDepth (default 64) applies in both directions: the reader fails on a
// container that opens beyond depth 64, the writer on a value it writes at depth 64 or more
// (JsonConverter.TryWrite; nulls of properties and primitive list items are written without the
// check). A UTF-8 input is decoded with its invalid bytes kept as the lone surrogates
// U+DC80..U+DCFF: they count as one byte, print as 0xNN and make a string value fail like the
// transcoding of System.Text.Json, while property names and skipped values are not transcoded.

import { ArgumentException } from './exceptions.js';

const NEWLINE = '\r\n';

/** JsonSerializerOptions.MaxDepth of the default options. */
const MAX_DEPTH = 64;

/**
 * A symbol property of an object to write that maps JSON property names to member names (the
 * WriteStack path of the depth error uses member names, e.g. LibraryTypes for
 * [JsonPropertyName("Libraries")]).
 */
export const JSON_MEMBER_NAMES = Symbol('JsonMemberNames');

/**
 * A JSON string literal with the escaping of the default JavaScriptEncoder (a lone surrogate is
 * written as the replacement character U+FFFD).
 */
export function escapeJsonString(s: string): string {
  let r = '"';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdfff) {
      const d = s.charCodeAt(i + 1);
      if (c <= 0xdbff && d >= 0xdc00 && d <= 0xdfff) {
        r += '\\u' + c.toString(16).toUpperCase() + '\\u' + d.toString(16).toUpperCase();
        i++;
        continue;
      }
      c = 0xfffd;
    }
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

/** Writes a value with WriteIndented = true; `indent` is the indentation of the current level. */
export function writeJson(value: unknown, indent: string): string {
  return writeValue(value, indent, indent.length / 2, []);
}

/** ThrowHelper.ThrowJsonException_SerializerCycleDetected with the WriteStack path (member names, no indices). */
function cycleDetected(path: string[]): never {
  throw new JsonException(
    `A possible object cycle was detected. This can either be due to a cycle or if the object depth is larger than the maximum allowed depth of ${MAX_DEPTH}. ` +
      `Consider using ReferenceHandler.Preserve on JsonSerializerOptions to support cycles. Path: $${path.map(appendPropertyName).join('')}.`,
  );
}

/**
 * Writes a value; `indent` is the indentation of the current level (null: WriteIndented = false,
 * no white space between tokens). `depth` is Utf8JsonWriter.CurrentDepth (the number of open
 * containers), `path` the member names.
 */
function writeValue(value: unknown, indent: string | null, depth: number, path: string[]): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return escapeJsonString(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const inner = indent === null ? '' : indent + '  ';
  const open = indent === null ? '' : NEWLINE + inner;
  const separator = indent === null ? ',' : ',' + NEWLINE + inner;
  const close = indent === null ? '' : NEWLINE + indent;
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const items = value.map((v) => {
      // Objects and arrays are written by converters with the depth check, primitives directly.
      if (depth + 1 >= MAX_DEPTH && v !== null && typeof v === 'object') cycleDetected(path);
      return writeValue(v, indent === null ? null : inner, depth + 1, path);
    });
    return '[' + open + items.join(separator) + close + ']';
  }
  const members = (value as { [JSON_MEMBER_NAMES]?: Record<string, string> })[JSON_MEMBER_NAMES];
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return '{}';
  const props = entries.map(([k, v]) => {
    const p = [...path, members?.[k] ?? k];
    if (depth + 1 >= MAX_DEPTH && v !== null && v !== undefined) cycleDetected(p);
    return escapeJsonString(k) + (indent === null ? ':' : ': ') + writeValue(v, indent === null ? null : inner, depth + 1, p);
  });
  return '{' + open + props.join(separator) + close + '}';
}

/** Writes a value with WriteIndented = false (no white space between tokens). */
export function writeJsonCompact(value: unknown): string {
  return writeValue(value, null, 0, []);
}

/** JsonSerializer.Serialize(value, options) for a plain object graph. */
export function serializeJson(value: unknown, writeIndented = false): string {
  return writeIndented ? writeJson(value, '') : writeJsonCompact(value);
}

// ---- reading -----------------------------------------------------------------------------------

/** System.Text.Json.JsonException. */
export class JsonException extends Error {
  override name = 'JsonException';
}

export type JsonTokenType = 'None' | 'StartObject' | 'EndObject' | 'StartArray' | 'EndArray' | 'PropertyName' | 'String' | 'Number' | 'True' | 'False' | 'Null';

/** JsonReaderHelper/ThrowHelper.GetPrintableString: printable ASCII as is, other bytes as 0xNN (the first UTF-8 byte). */
function printable(ch: string): string {
  const c = ch.charCodeAt(0);
  if (c >= 0x20 && c < 0x7f) return ch;
  if (isByteMarker(c)) return '0x' + (c - 0xdc00).toString(16).toUpperCase().padStart(2, '0');
  const b = c < 0x80 ? c : c < 0x800 ? 0xc0 | (c >> 6) : c >= 0xd800 && c <= 0xdbff ? 0xf0 | ((0x10000 + ((c - 0xd800) << 10)) >> 18) : 0xe0 | (c >> 12);
  return '0x' + b.toString(16).toUpperCase().padStart(2, '0');
}

/** U+DC80..U+DCFF: an invalid byte of a UTF-8 input (see utf8JsonText). */
const isByteMarker = (c: number) => c >= 0xdc80 && c <= 0xdcff;

function utf8Length(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80 || isByteMarker(c)) n += 1;
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
export class JsonReader {
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
      if (this.tokenType === 'None') {
        this.fail('The input does not contain any JSON tokens. Expected the input to start with a valid JSON token, when isFinalBlock is true.', this.i);
      }
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
    // A comment start right after a property name, '{' or '[' gets the message of a comment
    // after a value (Utf8JsonReader.ConsumeNextTokenOrRollback); at the root and after a comma
    // the message of an invalid start.
    const commentAfterToken = () => this.fail("'/' is invalid after a value. Expected either ',', '}', or ']'.", this.i);
    switch (this.tokenType) {
      case 'PropertyName':
        if (c === '/') commentAfterToken();
        this.consumeValue(c);
        return true;
      case 'StartObject':
        if (c === '}') return this.endContainer('{', c);
        if (c === '"') return this.consumePropertyName();
        if (c === '/') commentAfterToken();
        this.fail(`'${printable(c)}' is an invalid start of a property name. Expected a '"'.`, this.i);
        break;
      case 'StartArray':
        if (c === ']') return this.endContainer('[', c);
        if (c === '/') commentAfterToken();
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
        if (this.stack.length >= MAX_DEPTH) {
          this.fail(`The maximum configured depth of ${MAX_DEPTH} has been exceeded. Cannot read next JSON ${c === '{' ? 'object' : 'array'}.`, start);
        }
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

/**
 * Unescapes the raw text of a JSON string. `escapesValid` is false for \u escapes that are no
 * valid UTF-16 (JsonReaderHelper.Unescape: a high surrogate must be followed by the \u escape of
 * a low surrogate, a low surrogate must follow one), `textValid` is false for invalid bytes of a
 * UTF-8 input (lone surrogates outside escapes, see utf8JsonText).
 */
function unescapeJsonParts(raw: string): { value: string; escapesValid: boolean; textValid: boolean } {
  const out: string[] = [];
  let escapesValid = true;
  let textValid = true;
  /** The code unit of a \uXXXX escape at index i, -1 if there is none. */
  const escapeAt = (i: number) => (raw[i] === '\\' && raw[i + 1] === 'u' ? parseInt(raw.substring(i + 2, i + 6), 16) : -1);
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch !== '\\') {
      const c = ch.charCodeAt(0);
      const d = raw.charCodeAt(i + 1);
      if (c >= 0xd800 && c <= 0xdbff && d >= 0xdc00 && d <= 0xdfff) {
        out.push(ch, raw[++i]);
        continue;
      }
      if (c >= 0xd800 && c <= 0xdfff) textValid = false;
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
      case 'u': {
        const c = escapeAt(i - 1);
        i += 4;
        if (c >= 0xd800 && c <= 0xdbff) {
          const low = escapeAt(i + 1);
          if (low >= 0xdc00 && low <= 0xdfff) {
            out.push(String.fromCharCode(c), String.fromCharCode(low));
            i += 6;
            break;
          }
          escapesValid = false;
        } else if (c >= 0xdc00 && c <= 0xdfff) {
          escapesValid = false;
        }
        out.push(String.fromCharCode(c));
        break;
      }
      default:
        out.push(e);
    }
  }
  return { value: out.join(''), escapesValid, textValid };
}

/**
 * Unescapes a JSON string value; null for text that System.Text.Json cannot transcode (invalid
 * surrogate escapes, invalid bytes of a UTF-8 input).
 */
export function unescapeJson(raw: string): string | null {
  const r = unescapeJsonParts(raw);
  return r.escapesValid && r.textValid ? r.value : null;
}

/** ReadStack.JsonPath: property names with special characters are written as ['name']. */
function appendPropertyName(name: string): string {
  return /[. '\/"[\]()\t\n\r\f\b\\\u0085\u2028\u2029]/.test(name) ? "['" + name + "']" : '.' + name;
}

/** A frame of the JSON path: the current property of an object or the current index of an array. */
interface JsonFrame {
  prop: string | null;
  index: number | null;
}

/**
 * The converters of System.Text.Json for strings, Int32 (and enums as numbers), booleans,
 * objects and List<T>, driven by a JsonReader. Subclasses add one method per object type.
 */
export class JsonDeserializer {
  private readonly frames: JsonFrame[] = [];

  constructor(protected readonly reader: JsonReader) {}

  /** The JSON path of the current position ($.a.b[2]). */
  path(): string {
    let p = '$';
    for (const f of this.frames) {
      if (f.index !== null) p += `[${f.index}]`;
      else if (f.prop !== null) p += appendPropertyName(f.prop);
    }
    return p;
  }

  /** "The JSON value could not be converted to <typeName>." at the current token. */
  protected fail(typeName: string): never {
    this.reader.failConvert(typeName, this.path());
  }

  /** The string converter: a string or null. */
  protected readString(): string | null {
    const r = this.reader;
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'String') this.fail('System.String');
    const v = unescapeJson(r.raw);
    if (v === null) this.fail('System.String');
    return v;
  }

  /** The Int32 converter (also used for enums, which are written as numbers). */
  protected readInt(typeName: string): number {
    const r = this.reader;
    if (r.tokenType !== 'Number' || !/^-?(0|[1-9][0-9]*)$/.test(r.raw)) this.fail(typeName);
    const v = Number(r.raw);
    if (v < -2147483648 || v > 2147483647) this.fail(typeName);
    return v === 0 ? 0 : v;
  }

  /** The Boolean converter. */
  protected readBool(): boolean {
    const r = this.reader;
    if (r.tokenType === 'True') return true;
    if (r.tokenType === 'False') return false;
    this.fail('System.Boolean');
  }

  /**
   * Reads the properties of an object of the .NET type `typeName` (the reader is on
   * StartObject). `onProperty` reads the value of a known property and returns true; unknown
   * properties are skipped. A property name with invalid surrogate escapes fails as a value of
   * the object type; invalid bytes of a UTF-8 input in a name are not transcoded (no error).
   */
  protected readProperties(onProperty: (name: string) => boolean, typeName: string): void {
    const r = this.reader;
    const frame: JsonFrame = { prop: null, index: null };
    this.frames.push(frame);
    for (;;) {
      r.read();
      if (r.tokenType === 'EndObject') break;
      const parsed = unescapeJsonParts(r.raw);
      if (!parsed.escapesValid) this.fail(typeName);
      const name = parsed.value;
      frame.prop = name;
      r.read();
      if (!onProperty(name)) r.skip();
      frame.prop = null;
    }
    this.frames.pop();
  }

  /** The List<T> converter: null, or the items read by `readItem` (the reader is on the item). */
  protected readList<T>(typeName: string, readItem: () => T): T[] | null {
    const r = this.reader;
    if (r.tokenType === 'Null') return null;
    if (r.tokenType !== 'StartArray') this.fail(typeName);
    const list: T[] = [];
    const frame: JsonFrame = { prop: null, index: 0 };
    this.frames.push(frame);
    for (;;) {
      frame.index = list.length;
      r.read();
      if ((r.tokenType as JsonTokenType) === 'EndArray') break;
      list.push(readItem());
    }
    this.frames.pop();
    return list;
  }
}

/**
 * JsonSerializer.Deserialize<T>(json): creates the deserializer on a reader over `json`, reads the
 * root value with `readRoot` (which starts with `reader.read()`), then checks that the data ends
 * after the root value. A string is read like the string overload (text that is no valid UTF-16
 * cannot be transcoded to UTF-8: ArgumentException before any token), bytes like the UTF-8
 * stream overload (utf8JsonText).
 */
export function deserialize<D extends JsonDeserializer, R>(json: string | Uint8Array, create: (reader: JsonReader) => D, readRoot: (deserializer: D) => R): R {
  let text: string;
  if (typeof json === 'string') {
    if (/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(json)) {
      throw new ArgumentException('Cannot transcode invalid UTF-16 string to UTF-8 JSON text.');
    }
    text = json;
  } else {
    text = utf8JsonText(json);
  }
  let deserializer: D | null = null;
  const reader = new JsonReader(text, () => deserializer!.path());
  deserializer = create(reader);
  const result = readRoot(deserializer);
  // The reader must reach the end of the data after the root value.
  reader.path = () => '$';
  reader.read();
  return result;
}

/**
 * The text of a UTF-8 JSON stream as JsonSerializer.Deserialize<T>(Stream) reads it: one leading
 * UTF-8 preamble is skipped; every byte that is not part of a valid UTF-8 sequence (overlong
 * forms, surrogates and values above U+10FFFF are invalid) becomes the lone surrogate
 * U+DC00 + byte, which the reader counts as one byte and prints as 0xNN.
 */
export function utf8JsonText(bytes: Uint8Array): string {
  let i = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const out: string[] = [];
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < 0x80) {
      out.push(String.fromCharCode(b));
      i++;
      continue;
    }
    // Lead byte: number of continuation bytes, payload bits and the smallest code point.
    const [n, bits, min] = b >= 0xc2 && b <= 0xdf ? [1, b & 0x1f, 0x80] : b >= 0xe0 && b <= 0xef ? [2, b & 0x0f, 0x800] : b >= 0xf0 && b <= 0xf4 ? [3, b & 0x07, 0x10000] : [0, 0, 0];
    let cp = bits;
    let ok = n > 0;
    for (let k = 1; ok && k <= n; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) ok = false;
      else cp = (cp << 6) | (c & 0x3f);
    }
    if (ok && cp >= min && cp <= 0x10ffff && !(cp >= 0xd800 && cp <= 0xdfff)) {
      out.push(String.fromCodePoint(cp));
      i += n + 1;
    } else {
      out.push(String.fromCharCode(0xdc00 + b));
      i++;
    }
  }
  return out.join('');
}
