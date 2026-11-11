// System.Uri (.NET 8, Windows) as far as Aml.Engine uses it: a line by line port of the parsing
// and formatting code of dotnet/runtime release/8.0 (Uri.cs, UriExt.cs, UriHelper.cs,
// UriSyntax.cs, IriHelper.cs, PercentEncodingHelper.cs, DomainNameHelper.cs, UncNameHelper.cs,
// IPv4AddressHelper(.Common).cs, IPv6AddressHelper(.Common).cs), verified against the real
// runtime by oracle/SysOracle.cs (area "uri", scripts/sys-cases/uri.mjs).
//
// Ported: Uri.TryCreate(string, UriKind), the (string, UriKind) constructor, the parsing of all
// built-in schemes (http, https, ws, wss, ftp, file, gopher, nntp, news, uuid, mailto, telnet,
// ldap, net.tcp, net.pipe, vsmacros) and of unknown schemes (V1 generic syntax), implicit Windows
// file paths (C:\x, C:/x, \\server\share), IRI normalization (Unicode, bidi stripping, NFC of the
// host), IPv4/IPv6/DNS/UNC/basic hosts, ports, user info, path compression and slash conversion,
// and the getters ToString, OriginalString, IsAbsoluteUri, Scheme, LocalPath, Fragment,
// AbsoluteUri, AbsolutePath, Query, PathAndQuery, Host, Port, IsDefaultPort, IsUnc, IsFile,
// UserInfo, Authority, GetComponents (absolute URIs), plus Equals and EscapeDataString /
// UnescapeDataString.
//
// Not ported: combining constructors and TryCreate(Uri, string/Uri) (ResolveHelper,
// CombineUri), MakeRelativeUri, IsBaseOf, IsWellFormedOriginalString, GetComponents with
// NormalizedHost or SerializationInfoString, IdnHost / DnsSafeHost (need IdnMapping / punycode),
// custom UriParser registration, UriCreationOptions, Unix-only code paths (the port behaves like
// .NET on Windows), GetHashCode (equalityKey is the Equals key string instead).
// Unicode data comes from the JS engine (String.prototype.normalize for NFC, \p{L} for
// char.IsLetter); the Unicode version may differ from the one .NET 8 uses for characters added
// recently. Case mapping uses the fixed .NET tables of strings.ts.

import {
  ArgumentException,
  ArgumentNullException,
  ArgumentOutOfRangeException,
  InvalidOperationException,
  NotSupportedException,
  UriFormatException,
} from './exceptions.js';
import { equalsOrdinalIgnoreCase, toLowerInvariant, toUpperOrdinal } from './strings.js';

export enum UriKind {
  RelativeOrAbsolute = 0,
  Absolute = 1,
  Relative = 2,
}

/** System.UriComponents (for Uri.getComponents; SerializationInfoString is not ported). */
export enum UriComponents {
  Scheme = 0x1,
  UserInfo = 0x2,
  Host = 0x4,
  Port = 0x8,
  Path = 0x10,
  Query = 0x20,
  Fragment = 0x40,
  StrongPort = 0x80,
  NormalizedHost = 0x100,
  KeepDelimiter = 0x40000000,
  AbsoluteUri = 0x7f,
  HostAndPort = 0x84,
  StrongAuthority = 0x86,
  SchemeAndServer = 0xd,
  HttpRequestUrl = 0x3d,
  PathAndQuery = 0x30,
}

/** System.UriFormat. */
export enum UriFormat {
  UriEscaped = 1,
  Unescaped = 2,
  SafeUnescaped = 3,
}

// ---------------------------------------------------------------------------------------------
// Enumerations (UriEnumTypes.cs)

/** UriComponents */
const C = {
  Scheme: 0x1,
  UserInfo: 0x2,
  Host: 0x4,
  Port: 0x8,
  Path: 0x10,
  Query: 0x20,
  Fragment: 0x40,
  StrongPort: 0x80,
  NormalizedHost: 0x100,
  KeepDelimiter: 0x40000000,
  AbsoluteUri: 0x7f,
  HostAndPort: 0x4 | 0x80,
  StrongAuthority: 0x2 | 0x4 | 0x80,
  SchemeAndServer: 0x1 | 0x4 | 0x8,
  HttpRequestUrl: 0x1 | 0x4 | 0x8 | 0x10 | 0x20,
  PathAndQuery: 0x10 | 0x20,
} as const;

/** UriFormat (+ the private V1ToStringUnescape) */
const UriEscaped = 1;
const Unescaped = 2;
const SafeUnescaped = 3;
const V1ToStringUnescape = 0x7fff;

/** ParsingError */
const enum PE {
  None = 0,
  BadFormat = 1,
  BadScheme = 2,
  BadAuthority = 3,
  EmptyUriString = 4,
  LastRelativeUriOkErrIndex = 4,
  SchemeLimit = 5,
  SizeLimit = 6,
  MustRootedPath = 7,
  BadHostName = 8,
  NonEmptyHost = 9,
  BadPort = 10,
  BadAuthorityTerminator = 11,
  CannotCreateRelative = 12,
}

/** UnescapeMode */
const UM = {
  CopyOnly: 0x0,
  Escape: 0x1,
  Unescape: 0x2,
  EscapeUnescape: 0x3,
  V1ToStringFlag: 0x4,
  UnescapeAll: 0x8,
  UnescapeAllOrThrow: 0x18,
} as const;

/** UriSyntaxFlags */
const S = {
  MustHaveAuthority: 0x1,
  OptionalAuthority: 0x2,
  MayHaveUserInfo: 0x4,
  MayHavePort: 0x8,
  MayHavePath: 0x10,
  MayHaveQuery: 0x20,
  MayHaveFragment: 0x40,
  AllowEmptyHost: 0x80,
  AllowUncHost: 0x100,
  AllowDnsHost: 0x200,
  AllowIPv4Host: 0x400,
  AllowIPv6Host: 0x800,
  AllowAnInternetHost: 0x200 | 0x400 | 0x800,
  AllowAnyOtherHost: 0x1000,
  FileLikeUri: 0x2000,
  MailToLikeUri: 0x4000,
  V1_UnknownUri: 0x10000,
  SimpleUserSyntax: 0x20000,
  BuiltInSyntax: 0x40000,
  ParserSchemeOnly: 0x80000,
  AllowDOSPath: 0x100000,
  PathIsRooted: 0x200000,
  ConvertPathSlashes: 0x400000,
  CompressPath: 0x800000,
  CanonicalizeAsFilePath: 0x1000000,
  UnEscapeDotsAndSlashes: 0x2000000,
  AllowIdn: 0x4000000,
  AllowIriParsing: 0x10000000,
} as const;

/** Uri.Flags (64 bit, hence bigint) */
const F = {
  Zero: 0n,
  SchemeNotCanonical: 0x1n,
  UserNotCanonical: 0x2n,
  HostNotCanonical: 0x4n,
  PortNotCanonical: 0x8n,
  PathNotCanonical: 0x10n,
  QueryNotCanonical: 0x20n,
  FragmentNotCanonical: 0x40n,
  CannotDisplayCanonical: 0x7fn,
  E_UserNotCanonical: 0x80n,
  E_HostNotCanonical: 0x100n,
  E_PortNotCanonical: 0x200n,
  E_PathNotCanonical: 0x400n,
  E_QueryNotCanonical: 0x800n,
  E_FragmentNotCanonical: 0x1000n,
  E_CannotDisplayCanonical: 0x1f80n,
  ShouldBeCompressed: 0x2000n,
  FirstSlashAbsent: 0x4000n,
  BackslashInPath: 0x8000n,
  IndexMask: 0xffffn,
  HostTypeMask: 0x70000n,
  HostNotParsed: 0x0n,
  IPv6HostType: 0x10000n,
  IPv4HostType: 0x20000n,
  DnsHostType: 0x30000n,
  UncHostType: 0x40000n,
  BasicHostType: 0x50000n,
  UnusedHostType: 0x60000n,
  UnknownHostType: 0x70000n,
  UserEscaped: 0x80000n,
  AuthorityFound: 0x100000n,
  HasUserInfo: 0x200000n,
  LoopbackHost: 0x400000n,
  NotDefaultPort: 0x800000n,
  UserDrivenParsing: 0x1000000n,
  CanonicalDnsHost: 0x2000000n,
  ErrorOrParsingRecursion: 0x4000000n,
  DosPath: 0x8000000n,
  UncPath: 0x10000000n,
  ImplicitFile: 0x20000000n,
  MinimalUriInfoSet: 0x40000000n,
  AllUriInfoSet: 0x80000000n,
  IdnHost: 0x100000000n,
  HasUnicode: 0x200000000n,
  HostUnicodeNormalized: 0x400000000n,
  RestUnicodeNormalized: 0x800000000n,
  UnicodeHost: 0x1000000000n,
  IntranetUri: 0x2000000000n,
  UserIriCanonical: 0x8000000000n,
  PathIriCanonical: 0x10000000000n,
  QueryIriCanonical: 0x20000000000n,
  FragmentIriCanonical: 0x40000000000n,
  IriCanonical: 0x78000000000n,
  UnixPath: 0x100000000000n,
  DisablePathAndQueryCanonicalization: 0x200000000000n,
} as const;

/** Uri.Check */
const K = {
  None: 0x0,
  EscapedCanonical: 0x1,
  DisplayCanonical: 0x2,
  DotSlashAttn: 0x4,
  DotSlashEscaped: 0x80,
  BackslashInPath: 0x10,
  ReservedFound: 0x20,
  NotIriCanonical: 0x40,
  FoundNonAscii: 0x8,
} as const;

const c_DummyChar = '\uffff';
const c_EOL = '\ufffe';
const c_MaxUriBufferSize = 0xfff0;
const c_MaxUriSchemeName = 1024;
const NoDefaultPort = -1;

// ---------------------------------------------------------------------------------------------
// Character helpers

/** Reads s[i] like a pinned `char*` does: past the end there is the terminating '\0'. */
function at(s: string, i: number): string {
  return i < s.length ? s[i] : '\0';
}

function code(c: string): number {
  return c.charCodeAt(0);
}

function isAsciiLetter(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

function isAsciiDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

function isAsciiLetterOrDigit(c: string): boolean {
  return isAsciiLetter(c) || isAsciiDigit(c);
}

function isAsciiHexDigit(c: string): boolean {
  return isAsciiDigit(c) || (c >= 'a' && c <= 'f') || (c >= 'A' && c <= 'F');
}

function isHighSurrogate(c: string): boolean {
  const x = code(c);
  return x >= 0xd800 && x <= 0xdbff;
}

function isLowSurrogate(c: string): boolean {
  const x = code(c);
  return x >= 0xdc00 && x <= 0xdfff;
}

const letterRe = /^\p{L}$/u;
/** char.IsLetter (a lone surrogate is not a letter) */
function isLetter(c: string): boolean {
  return letterRe.test(c);
}

function isLWS(c: string): boolean {
  return c === ' ' || c === '\n' || c === '\r' || c === '\t';
}

/** HexConverter.FromChar */
function fromHexChar(c: string): number {
  if (c >= '0' && c <= '9') return code(c) - 48;
  if (c >= 'a' && c <= 'f') return code(c) - 87;
  if (c >= 'A' && c <= 'F') return code(c) - 55;
  return 0xff;
}

/** UriHelper.DecodeHexChars */
function decodeHexChars(first: string, second: string): string {
  const a = fromHexChar(first);
  const b = fromHexChar(second);
  if ((a | b) === 0xff) return c_DummyChar;
  return String.fromCharCode((a << 4) | b);
}

function asciiLower(s: string): string {
  return s.replace(/[A-Z]+/g, (m) => m.toLowerCase());
}

function startsWithOrdinalIgnoreCaseAscii(s: string, prefix: string): boolean {
  return s.length >= prefix.length && equalsOrdinalIgnoreCase(s.substring(0, prefix.length), prefix);
}

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (isHighSurrogate(c)) {
      if (i + 1 < s.length && isLowSurrogate(s[i + 1])) i++;
      else return true;
    } else if (isLowSurrogate(c)) {
      return true;
    }
  }
  return false;
}

/** string.Normalize(NormalizationForm.FormC); throws ArgumentException for invalid UTF-16. */
function normalizeFormC(s: string): string {
  if (hasLoneSurrogate(s)) throw new ArgumentException('Invalid Unicode code point found.');
  return s.normalize('NFC');
}

/** A growable char buffer standing in for ValueStringBuilder. */
class SB {
  a: string[] = [];

  get length(): number {
    return this.a.length;
  }

  set length(n: number) {
    this.a.length = n;
  }

  append(s: string, start = 0, end = s.length): void {
    for (let i = start; i < end; i++) this.a.push(s[i]);
  }

  toString(start = 0): string {
    return (start === 0 ? this.a : this.a.slice(start)).join('');
  }
}

// ---------------------------------------------------------------------------------------------
// UTF-8 (Rune.DecodeFromUtf8 / EncodeToUtf8)

function encodeUtf8(cp: number): number[] {
  if (cp < 0x80) return [cp];
  if (cp < 0x800) return [0xc0 | (cp >> 6), 0x80 | (cp & 0x3f)];
  if (cp < 0x10000) return [0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
  return [0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f)];
}

/**
 * Rune.DecodeFromUtf8: `ok` with the code point, or not ok; `consumed` is the rune length or the
 * length of the maximal invalid (or incomplete) subsequence.
 */
function decodeUtf8(b: number[]): { ok: boolean; value: number; consumed: number } {
  const b0 = b[0];
  if (b0 < 0x80) return { ok: true, value: b0, consumed: 1 };
  let need: number;
  let lo = 0x80;
  let hi = 0xbf;
  let value: number;
  if (b0 >= 0xc2 && b0 <= 0xdf) {
    need = 1;
    value = b0 & 0x1f;
  } else if (b0 >= 0xe0 && b0 <= 0xef) {
    need = 2;
    value = b0 & 0x0f;
    if (b0 === 0xe0) lo = 0xa0;
    else if (b0 === 0xed) hi = 0x9f;
  } else if (b0 >= 0xf0 && b0 <= 0xf4) {
    need = 3;
    value = b0 & 0x07;
    if (b0 === 0xf0) lo = 0x90;
    else if (b0 === 0xf4) hi = 0x8f;
  } else {
    return { ok: false, value: 0, consumed: 1 };
  }
  for (let k = 1; k <= need; k++) {
    if (k >= b.length) return { ok: false, value: 0, consumed: k };
    const x = b[k];
    if (x < lo || x > hi) return { ok: false, value: 0, consumed: k };
    lo = 0x80;
    hi = 0xbf;
    value = (value << 6) | (x & 0x3f);
  }
  return { ok: true, value, consumed: need + 1 };
}

// ---------------------------------------------------------------------------------------------
// UriParser (UriSyntax.cs), built-in syntaxes only

class UriParser {
  constructor(
    readonly schemeName: string,
    readonly defaultPort: number,
    readonly flags: number,
  ) {}

  inFact(f: number): boolean {
    return (this.flags & f) !== 0;
  }

  notAny(f: number): boolean {
    return (this.flags & f) === 0;
  }

  isAllSet(f: number): boolean {
    return (this.flags & f) === f;
  }

  get isSimple(): boolean {
    return this.inFact(S.SimpleUserSyntax);
  }
}

const UnknownV1SyntaxFlags =
  S.V1_UnknownUri |
  S.OptionalAuthority |
  S.MayHaveUserInfo |
  S.MayHavePort |
  S.MayHavePath |
  S.MayHaveQuery |
  S.MayHaveFragment |
  S.AllowEmptyHost |
  S.AllowUncHost |
  S.AllowAnInternetHost |
  S.PathIsRooted |
  S.AllowDOSPath |
  S.ConvertPathSlashes |
  S.CompressPath |
  S.AllowIdn |
  S.AllowIriParsing;

const HttpSyntaxFlags =
  S.MustHaveAuthority |
  S.MayHaveUserInfo |
  S.MayHavePort |
  S.MayHavePath |
  S.MayHaveQuery |
  S.MayHaveFragment |
  S.AllowUncHost |
  S.AllowAnInternetHost |
  S.PathIsRooted |
  S.ConvertPathSlashes |
  S.CompressPath |
  S.CanonicalizeAsFilePath |
  S.AllowIdn |
  S.AllowIriParsing;

const FtpSyntaxFlags =
  S.MustHaveAuthority |
  S.MayHaveUserInfo |
  S.MayHavePort |
  S.MayHavePath |
  S.MayHaveFragment |
  S.AllowUncHost |
  S.AllowAnInternetHost |
  S.PathIsRooted |
  S.ConvertPathSlashes |
  S.CompressPath |
  S.CanonicalizeAsFilePath |
  S.AllowIdn |
  S.AllowIriParsing;

const FileSyntaxFlags =
  S.MustHaveAuthority |
  S.AllowEmptyHost |
  S.AllowUncHost |
  S.AllowAnInternetHost |
  S.MayHavePath |
  S.MayHaveFragment |
  S.MayHaveQuery |
  S.FileLikeUri |
  S.PathIsRooted |
  S.AllowDOSPath |
  S.ConvertPathSlashes |
  S.CompressPath |
  S.CanonicalizeAsFilePath |
  S.UnEscapeDotsAndSlashes |
  S.AllowIdn |
  S.AllowIriParsing;

const VsmacrosSyntaxFlags =
  S.MustHaveAuthority |
  S.AllowEmptyHost |
  S.AllowUncHost |
  S.AllowAnInternetHost |
  S.MayHavePath |
  S.MayHaveFragment |
  S.FileLikeUri |
  S.AllowDOSPath |
  S.ConvertPathSlashes |
  S.CompressPath |
  S.CanonicalizeAsFilePath |
  S.UnEscapeDotsAndSlashes |
  S.AllowIdn |
  S.AllowIriParsing;

const GopherSyntaxFlags =
  S.MustHaveAuthority |
  S.MayHaveUserInfo |
  S.MayHavePort |
  S.MayHavePath |
  S.MayHaveFragment |
  S.AllowUncHost |
  S.AllowAnInternetHost |
  S.PathIsRooted |
  S.AllowIdn |
  S.AllowIriParsing;

const NewsSyntaxFlags = S.MayHavePath | S.MayHaveFragment | S.AllowIriParsing;

const NntpSyntaxFlags = GopherSyntaxFlags;
const TelnetSyntaxFlags = GopherSyntaxFlags;

const LdapSyntaxFlags =
  S.MustHaveAuthority |
  S.AllowEmptyHost |
  S.AllowUncHost |
  S.AllowAnInternetHost |
  S.MayHaveUserInfo |
  S.MayHavePort |
  S.MayHavePath |
  S.MayHaveQuery |
  S.MayHaveFragment |
  S.PathIsRooted |
  S.AllowIdn |
  S.AllowIriParsing;

const MailtoSyntaxFlags =
  S.AllowEmptyHost |
  S.AllowUncHost |
  S.AllowAnInternetHost |
  S.MayHaveUserInfo |
  S.MayHavePort |
  S.MayHavePath |
  S.MayHaveFragment |
  S.MayHaveQuery |
  S.MailToLikeUri |
  S.AllowIdn |
  S.AllowIriParsing;

const NetPipeSyntaxFlags =
  S.MustHaveAuthority |
  S.MayHavePath |
  S.MayHaveQuery |
  S.MayHaveFragment |
  S.AllowAnInternetHost |
  S.PathIsRooted |
  S.ConvertPathSlashes |
  S.CompressPath |
  S.CanonicalizeAsFilePath |
  S.UnEscapeDotsAndSlashes |
  S.AllowIdn |
  S.AllowIriParsing;

const NetTcpSyntaxFlags = NetPipeSyntaxFlags | S.MayHavePort;

function builtIn(scheme: string, port: number, flags: number): UriParser {
  return new UriParser(scheme, port, flags | S.SimpleUserSyntax | S.BuiltInSyntax);
}

const HttpUri = builtIn('http', 80, HttpSyntaxFlags);
const HttpsUri = builtIn('https', 443, HttpSyntaxFlags);
const WsUri = builtIn('ws', 80, HttpSyntaxFlags);
const WssUri = builtIn('wss', 443, HttpSyntaxFlags);
const FtpUri = builtIn('ftp', 21, FtpSyntaxFlags);
const FileUri = builtIn('file', NoDefaultPort, FileSyntaxFlags);
const GopherUri = builtIn('gopher', 70, GopherSyntaxFlags);
const NntpUri = builtIn('nntp', 119, NntpSyntaxFlags);
const NewsUri = builtIn('news', NoDefaultPort, NewsSyntaxFlags);
const MailToUri = builtIn('mailto', 25, MailtoSyntaxFlags);
const UuidUri = builtIn('uuid', NoDefaultPort, NewsSyntaxFlags);
const TelnetUri = builtIn('telnet', 23, TelnetSyntaxFlags);
const LdapUri = builtIn('ldap', 389, LdapSyntaxFlags);
const NetTcpUri = builtIn('net.tcp', 808, NetTcpSyntaxFlags);
const NetPipeUri = builtIn('net.pipe', NoDefaultPort, NetPipeSyntaxFlags);
const VsMacrosUri = builtIn('vsmacros', NoDefaultPort, VsmacrosSyntaxFlags);

const s_table = new Map<string, UriParser>(
  [HttpUri, HttpsUri, WsUri, WssUri, FtpUri, FileUri, GopherUri, NntpUri, NewsUri, MailToUri, UuidUri, TelnetUri, LdapUri, NetTcpUri, NetPipeUri, VsMacrosUri].map(
    (p) => [p.schemeName, p],
  ),
);
let s_tempTable = new Map<string, UriParser>();

function findOrFetchAsUnknownV1Syntax(lwrCaseScheme: string): UriParser {
  let syntax = s_table.get(lwrCaseScheme) ?? s_tempTable.get(lwrCaseScheme);
  if (syntax) return syntax;
  if (s_tempTable.size >= 512) s_tempTable = new Map();
  syntax = builtIn(lwrCaseScheme, NoDefaultPort, UnknownV1SyntaxFlags);
  s_tempTable.set(lwrCaseScheme, syntax);
  return syntax;
}

function iriParsingStatic(syntax: UriParser | null): boolean {
  return syntax === null || syntax.inFact(S.AllowIriParsing);
}

// ---------------------------------------------------------------------------------------------
// UriHelper

const RFC3986ReservedMarks = ";/?:@&=+$,#[]!'()*";
const NotSafeForUnescape = RFC3986ReservedMarks + '%\\#';

function isNotSafeForUnescape(ch: string): boolean {
  const x = code(ch);
  if (x <= 0x1f || (x >= 0x7f && x <= 0x9f)) return true;
  return NotSafeForUnescape.includes(ch);
}

function charSet(chars: string): Set<string> {
  return new Set(chars.split(''));
}

const Unreserved = charSet('-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz~');
const UnreservedReserved = charSet("!#$&'()*+,-./0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz~");
const UnreservedReservedExceptHash = charSet("!$&'()*+,-./0123456789:;=?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz~");
const UnreservedReservedExceptQuestionMarkHash = charSet("!$&'()*+,-./0123456789:;=@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]_abcdefghijklmnopqrstuvwxyz~");

function isGenDelim(ch: string): boolean {
  return ch === ':' || ch === '/' || ch === '?' || ch === '#' || ch === '[' || ch === ']' || ch === '@';
}

const HEX = '0123456789ABCDEF';

function percentEncodeByte(b: number, to: SB): void {
  to.a.push('%', HEX[(b >> 4) & 0xf], HEX[b & 0xf]);
}

/** UriHelper.EscapeString(ReadOnlySpan, ref ValueStringBuilder, ...) */
function escapeStringTo(s: string, start: number, end: number, dest: SB, checkExistingEscaped: boolean, noEscape: Set<string>): void {
  let i = start;
  while (i < end) {
    const c = s[i];
    const x = code(c);
    if (x >= 0x80) {
      let cp: number;
      let consumed = 1;
      if (isHighSurrogate(c) && i + 1 < end && isLowSurrogate(s[i + 1])) {
        cp = ((x - 0xd800) << 10) + (code(s[i + 1]) - 0xdc00) + 0x10000;
        consumed = 2;
      } else if (isHighSurrogate(c) || isLowSurrogate(c)) {
        cp = 0xfffd;
      } else {
        cp = x;
      }
      i += consumed;
      for (const b of encodeUtf8(cp)) percentEncodeByte(b, dest);
      continue;
    }
    if (!noEscape.has(c)) {
      if (c === '%' && checkExistingEscaped) {
        if (end - i > 2 && isAsciiHexDigit(s[i + 1]) && isAsciiHexDigit(s[i + 2])) {
          dest.a.push('%', s[i + 1], s[i + 2]);
          i += 3;
          continue;
        }
      }
      percentEncodeByte(x, dest);
      i++;
      continue;
    }
    dest.a.push(c);
    i++;
  }
}

/** UriHelper.EscapeString(string, ...) */
function escapeString(s: string, checkExistingEscaped: boolean, noEscape: Set<string>): string {
  let i = 0;
  while (i < s.length && noEscape.has(s[i])) i++;
  if (i === s.length) return s;
  const sb = new SB();
  sb.append(s, 0, i);
  escapeStringTo(s, i, s.length, sb, checkExistingEscaped, noEscape);
  return sb.toString();
}

/** UriHelper.UnescapeString(char*, start, end, ref ValueStringBuilder, ...) */
function unescapeString(
  pStr: string,
  start: number,
  end: number,
  dest: SB,
  rsvd1: string,
  rsvd2: string,
  rsvd3: string,
  unescapeMode: number,
  syntax: UriParser | null,
  isQuery: boolean,
): void {
  if ((unescapeMode & UM.EscapeUnescape) === UM.CopyOnly) {
    dest.append(pStr, start, end);
    return;
  }
  let escapeReserved = false;
  const iriParsing = iriParsingStatic(syntax) && (unescapeMode & UM.EscapeUnescape) === UM.EscapeUnescape;

  for (let next = start; next < end; ) {
    let ch = '\0';
    for (; next < end; ++next) {
      if ((ch = pStr[next]) === '%') {
        if ((unescapeMode & UM.Unescape) === 0) {
          escapeReserved = true;
        } else if (next + 2 < end) {
          ch = decodeHexChars(pStr[next + 1], pStr[next + 2]);
          if (unescapeMode >= UM.UnescapeAll) {
            if (ch === c_DummyChar) {
              if (unescapeMode >= UM.UnescapeAllOrThrow) throw new UriFormatException('Invalid URI: There is an invalid sequence in the string.');
              continue;
            }
          } else if (ch === c_DummyChar) {
            if ((unescapeMode & UM.Escape) !== 0) escapeReserved = true;
            else continue;
          } else if (ch === '%') {
            next += 2;
            continue;
          } else if (ch === rsvd1 || ch === rsvd2 || ch === rsvd3) {
            next += 2;
            continue;
          } else if ((unescapeMode & UM.V1ToStringFlag) === 0 && isNotSafeForUnescape(ch)) {
            next += 2;
            continue;
          } else if (
            iriParsing &&
            ((code(ch) <= 0x9f && isNotSafeForUnescape(ch)) || (code(ch) > 0x9f && !checkIriUnicodeRangeChar(ch, isQuery)))
          ) {
            next += 2;
            continue;
          }
          break;
        } else if (unescapeMode >= UM.UnescapeAll) {
          if (unescapeMode >= UM.UnescapeAllOrThrow) throw new UriFormatException('Invalid URI: There is an invalid sequence in the string.');
          continue;
        } else {
          escapeReserved = true;
        }
        break;
      } else if ((unescapeMode & (UM.Unescape | UM.UnescapeAll)) === (UM.Unescape | UM.UnescapeAll)) {
        continue;
      } else if ((unescapeMode & UM.Escape) !== 0) {
        if (ch === rsvd1 || ch === rsvd2 || ch === rsvd3) {
          escapeReserved = true;
          break;
        } else if ((unescapeMode & UM.V1ToStringFlag) === 0 && (code(ch) <= 0x1f || (code(ch) >= 0x7f && code(ch) <= 0x9f))) {
          escapeReserved = true;
          break;
        }
      }
    }

    while (start < next) dest.a.push(pStr[start++]);

    if (next !== end) {
      if (escapeReserved) {
        percentEncodeByte(code(pStr[next]) & 0xff, dest);
        escapeReserved = false;
        next++;
      } else if (code(ch) <= 127) {
        dest.a.push(ch);
        next += 3;
      } else {
        const charactersRead = unescapePercentEncodedUTF8Sequence(pStr, next, end - next, dest, isQuery, iriParsing);
        next += charactersRead;
      }
      start = next;
    }
  }
}

// ---------------------------------------------------------------------------------------------
// PercentEncodingHelper

function unescapePercentEncodedUTF8Sequence(input: string, off: number, length: number, dest: SB, isQuery: boolean, iriParsing: boolean): number {
  // The .NET code keeps up to four bytes in a rotating uint; a byte queue behaves identically.
  const buf: number[] = [];
  let totalCharsConsumed = 0;
  let charsToCopy = 0;

  for (;;) {
    // RefillBuffer / ReadByteFromInput
    let i = totalCharsConsumed + buf.length * 3;
    while (buf.length < 4) {
      if (length - i <= 2 || input[off + i] !== '%') break;
      const v1 = fromHexChar(input[off + i + 1]);
      if (v1 === 0xff || v1 < 8) break;
      const v2 = fromHexChar(input[off + i + 2]);
      if (v2 === 0xff) break;
      buf.push((v1 << 4) | v2);
      i += 3;
    }
    if (buf.length < 2) break; // NoMoreOrInvalidInput with 0 or 1 byte left

    // DecodeRune
    const r = decodeUtf8(buf);
    if (r.ok && (!iriParsing || checkIriUnicodeRangeValue(r.value, isQuery))) {
      if (charsToCopy !== 0) {
        dest.append(input, off + totalCharsConsumed - charsToCopy, off + totalCharsConsumed);
        charsToCopy = 0;
      }
      dest.append(String.fromCodePoint(r.value));
    } else {
      charsToCopy += r.consumed * 3;
    }
    buf.splice(0, r.consumed);
    totalCharsConsumed += r.consumed * 3;
  }

  const bytesLeft = buf.length;
  if ((bytesLeft | charsToCopy) === 0) return totalCharsConsumed;
  const extra = bytesLeft * 3;
  dest.append(input, off + totalCharsConsumed - charsToCopy, off + totalCharsConsumed + extra);
  return totalCharsConsumed + extra;
}

// ---------------------------------------------------------------------------------------------
// IriHelper

function inRange(v: number, min: number, max: number): boolean {
  return v >= min && v <= max;
}

function checkIriUnicodeRangeChar(unicode: string, isQuery: boolean): boolean {
  const v = code(unicode);
  return inRange(v, 0xa0, 0xd7ff) || inRange(v, 0xf900, 0xfdcf) || inRange(v, 0xfdf0, 0xffef) || (isQuery && inRange(v, 0xe000, 0xf8ff));
}

/** CheckIriUnicodeRange(highSurr, lowSurr, out isSurrogatePair, isQuery) */
function checkIriUnicodeRangePair(hi: string, lo: string, isQuery: boolean): { ok: boolean; pair: boolean } {
  if (isLowSurrogate(lo)) {
    const v = ((code(hi) - 0xd800) << 10) + (code(lo) - 0xdc00) + 0x10000;
    return { ok: (v & 0xffff) < 0xfffe && !inRange(v, 0xe0000, 0xe0fff) && (isQuery || v < 0xf0000), pair: true };
  }
  return { ok: false, pair: false };
}

function checkIriUnicodeRangeValue(value: number, isQuery: boolean): boolean {
  if (value <= 0xffff) {
    return inRange(value, 0xa0, 0xd7ff) || inRange(value, 0xf900, 0xfdcf) || inRange(value, 0xfdf0, 0xffef) || (isQuery && inRange(value, 0xe000, 0xf8ff));
  }
  return (value & 0xffff) < 0xfffe && !inRange(value, 0xe0000, 0xe0fff) && (isQuery || value < 0xf0000);
}

function checkIsReserved(ch: string, component: number): boolean {
  if ((C.AbsoluteUri & component) === 0) return component === 0 && isGenDelim(ch);
  return RFC3986ReservedMarks.includes(ch);
}

/** IriHelper.EscapeUnescapeIri */
function escapeUnescapeIri(pInput: string, start: number, end: number, component: number): string {
  const dest = new SB();
  for (let i = start; i < end; ++i) {
    let ch = pInput[i];
    if (ch === '%') {
      if (end - i > 2) {
        ch = decodeHexChars(pInput[i + 1], pInput[i + 2]);
        if (ch === c_DummyChar || ch === '%' || checkIsReserved(ch, component) || isNotSafeForUnescape(ch)) {
          dest.a.push(pInput[i++]);
          dest.a.push(pInput[i++]);
          dest.a.push(pInput[i]);
          continue;
        } else if (code(ch) <= 0x7f) {
          dest.a.push(ch);
          i += 2;
          continue;
        } else {
          const charactersRead = unescapePercentEncodedUTF8Sequence(pInput, i, end - i, dest, component === C.Query, true);
          i += charactersRead - 1;
        }
      } else {
        dest.a.push(pInput[i]);
      }
    } else if (code(ch) > 0x7f) {
      let isInIriUnicodeRange: boolean;
      let surrogatePair = false;
      let ch2 = '\0';
      if (isHighSurrogate(ch) && i + 1 < end) {
        ch2 = pInput[i + 1];
        const r = checkIriUnicodeRangePair(ch, ch2, component === C.Query);
        isInIriUnicodeRange = r.ok;
        surrogatePair = r.pair;
      } else {
        isInIriUnicodeRange = checkIriUnicodeRangeChar(ch, component === C.Query);
      }
      if (isInIriUnicodeRange) {
        dest.a.push(ch);
        if (surrogatePair) dest.a.push(ch2);
      } else {
        let cp: number;
        if (surrogatePair) cp = ((code(ch) - 0xd800) << 10) + (code(ch2) - 0xdc00) + 0x10000;
        else if (isHighSurrogate(ch) || isLowSurrogate(ch)) cp = 0xfffd;
        else cp = code(ch);
        for (const b of encodeUtf8(cp)) percentEncodeByte(b, dest);
      }
      if (surrogatePair) i++;
    } else {
      dest.a.push(pInput[i]);
    }
  }
  return dest.toString();
}

/** UriHelper.IsBidiControlCharacter / StripBidiControlCharacters */
function stripBidiControlCharacters(s: string): string {
  let r = '';
  for (let i = 0; i < s.length; i++) {
    const x = code(s[i]);
    if (inRange(x, 0x200e, 0x202e) && !inRange(x, 0x2010, 0x2029)) continue;
    r += s[i];
  }
  return r;
}

// ---------------------------------------------------------------------------------------------
// DomainNameHelper

const IriDotCharacters = '.\u3002\uff0e\uff61';
const s_validChars = charSet('-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz.');

function isIriInvalidChar(c: string): boolean {
  const x = code(c);
  if (x <= 0x20 || (x >= 0x7f && x <= 0x9f)) return true;
  return '!"#$%&\'()*+,/:;<=>?@[\\]^`{|}~'.includes(c);
}

function isAsciiOnly(s: string): boolean {
  for (let i = 0; i < s.length; i++) if (code(s[i]) >= 0x80) return false;
  return true;
}

/** DomainNameHelper.IsValid over s[start..end) */
function domainNameIsValid(s: string, start: number, end: number, iri: boolean, notImplicitFile: boolean): { ok: boolean; length: number } {
  let hostname = s.substring(start, end);
  let invalid = -1;
  for (let i = 0; i < hostname.length; i++) {
    if (iri ? isIriInvalidChar(hostname[i]) : !s_validChars.has(hostname[i])) {
      invalid = i;
      break;
    }
  }
  if (invalid >= 0) {
    const c = hostname[invalid];
    if (c === '/' || c === '\\' || (notImplicitFile && (c === ':' || c === '?' || c === '#'))) {
      hostname = hostname.substring(0, invalid);
    } else {
      return { ok: false, length: 0 };
    }
  }
  const length = hostname.length;
  if (length === 0) return { ok: false, length };

  for (;;) {
    const firstChar = hostname[0];
    if ((!iri || code(firstChar) < 0xa0) && !isAsciiLetterOrDigit(firstChar)) return { ok: false, length };
    let dotIndex = -1;
    for (let i = 0; i < hostname.length; i++) {
      if (iri ? IriDotCharacters.includes(hostname[i]) : hostname[i] === '.') {
        dotIndex = i;
        break;
      }
    }
    let labelLength = dotIndex < 0 ? hostname.length : dotIndex;
    if (iri) {
      const label = hostname.substring(0, labelLength);
      if (!isAsciiOnly(label)) {
        labelLength += 4;
        for (let i = 0; i < label.length; i++) if (code(label[i]) > 0xff) labelLength++;
      }
    }
    if (!inRange(labelLength, 1, 63)) return { ok: false, length };
    if (dotIndex < 0) return { ok: true, length };
    hostname = hostname.substring(dotIndex + 1);
    if (hostname.length === 0) return { ok: true, length };
  }
}

/** DomainNameHelper.ParseCanonicalName (also UncNameHelper.ParseCanonicalName) */
function domainParseCanonicalName(str: string, start: number, end: number, lb: { loopback: boolean }): string {
  let index = -1;
  for (let i = end - 1; i >= start; i--) {
    const c = str[i];
    if ((c >= 'A' && c <= 'Z') || c === ':') {
      index = i - start;
      break;
    }
  }
  if (index >= 0) {
    if (str[start + index] === ':') {
      end = start + index;
      const idx2 = index;
      index = -1;
      for (let i = 0; i < idx2; i++) {
        const c = str[start + i];
        if (c >= 'A' && c <= 'Z') {
          index = i;
          break;
        }
      }
    }
  }
  if (index >= 0) return toLowerInvariant(str.substring(start, end));
  const h = str.substring(start, end);
  if (h === 'localhost' || h === 'loopback') {
    lb.loopback = true;
    return 'localhost';
  }
  return h;
}

// ---------------------------------------------------------------------------------------------
// UncNameHelper

const MaximumInternetNameLength = 256;

function uncIsValid(name: string, start: number, returnedEnd: number, notImplicitFile: boolean): { ok: boolean; end: number } {
  let end = returnedEnd;
  if (start === end) return { ok: false, end: returnedEnd };
  let validShortName = false;
  let i = start;
  for (; i < end; ++i) {
    const c = at(name, i);
    if (c === '/' || c === '\\' || (notImplicitFile && (c === ':' || c === '?' || c === '#'))) {
      end = i;
      break;
    } else if (c === '.') {
      ++i;
      break;
    }
    if (isLetter(c) || c === '-' || c === '_') validShortName = true;
    else if (!isAsciiDigit(c)) return { ok: false, end: returnedEnd };
  }
  if (!validShortName) return { ok: false, end: returnedEnd };
  for (; i < end; ++i) {
    const c = at(name, i);
    if (c === '/' || c === '\\' || (notImplicitFile && (c === ':' || c === '?' || c === '#'))) {
      end = i;
      break;
    } else if (c === '.') {
      if (!validShortName || (i - 1 >= start && at(name, i - 1) === '.')) return { ok: false, end: returnedEnd };
      validShortName = false;
    } else if (c === '-' || c === '_') {
      if (!validShortName) return { ok: false, end: returnedEnd };
    } else if (isLetter(c) || isAsciiDigit(c)) {
      if (!validShortName) validShortName = true;
    } else {
      return { ok: false, end: returnedEnd };
    }
  }
  if (i - 1 >= start && at(name, i - 1) === '.') validShortName = true;
  if (!validShortName) return { ok: false, end: returnedEnd };
  return { ok: true, end };
}

// ---------------------------------------------------------------------------------------------
// IPv4AddressHelper

const IPv4Invalid = -1;
const MaxIPv4Value = 0xffffffff;

function ipv4IsValid(name: string, start: number, end: number, allowIPv6: boolean, notImplicitFile: boolean, unknownScheme: boolean): { ok: boolean; end: number } {
  if (allowIPv6 || unknownScheme) return ipv4IsValidCanonical(name, start, end, allowIPv6, notImplicitFile);
  const r = ipv4ParseNonCanonical(name, start, end, notImplicitFile);
  return { ok: r.value !== IPv4Invalid, end: r.end };
}

function ipv4IsValidCanonical(name: string, start: number, end: number, allowIPv6: boolean, notImplicitFile: boolean): { ok: boolean; end: number } {
  let dots = 0;
  let number = 0;
  let haveNumber = false;
  let firstCharIsZero = false;
  while (start < end) {
    const ch = at(name, start);
    if (allowIPv6) {
      if (ch === ']' || ch === '/' || ch === '%') break;
    } else if (ch === '/' || ch === '\\' || (notImplicitFile && (ch === ':' || ch === '?' || ch === '#'))) {
      break;
    }
    if (isAsciiDigit(ch)) {
      if (!haveNumber && ch === '0') {
        if (start + 1 < end && at(name, start + 1) === '0') return { ok: false, end };
        firstCharIsZero = true;
      }
      haveNumber = true;
      number = number * 10 + (code(ch) - 48);
      if (number > 255) return { ok: false, end };
    } else if (ch === '.') {
      if (!haveNumber || (number > 0 && firstCharIsZero)) return { ok: false, end };
      ++dots;
      haveNumber = false;
      number = 0;
      firstCharIsZero = false;
    } else {
      return { ok: false, end };
    }
    ++start;
  }
  const res = dots === 3 && haveNumber;
  return { ok: res, end: res ? start : end };
}

function ipv4ParseNonCanonical(name: string, start: number, end: number, notImplicitFile: boolean): { value: number; end: number } {
  let numberBase = 10;
  let ch: string;
  const parts = [0, 0, 0, 0];
  let currentValue = 0;
  let atLeastOneChar = false;
  let dotCount = 0;
  let current = start;
  for (; current < end; current++) {
    ch = at(name, current);
    currentValue = 0;
    numberBase = 10;
    if (ch === '0') {
      numberBase = 8;
      current++;
      atLeastOneChar = true;
      if (current < end) {
        ch = at(name, current);
        if (ch === 'x' || ch === 'X') {
          numberBase = 16;
          current++;
          atLeastOneChar = false;
        }
      }
    }
    for (; current < end; current++) {
      ch = at(name, current);
      let digitValue: number;
      if ((numberBase === 10 || numberBase === 16) && isAsciiDigit(ch)) digitValue = code(ch) - 48;
      else if (numberBase === 8 && ch >= '0' && ch <= '7') digitValue = code(ch) - 48;
      else if (numberBase === 16 && ch >= 'a' && ch <= 'f') digitValue = code(ch) + 10 - 97;
      else if (numberBase === 16 && ch >= 'A' && ch <= 'F') digitValue = code(ch) + 10 - 65;
      else break;
      currentValue = currentValue * numberBase + digitValue;
      if (currentValue > MaxIPv4Value) return { value: IPv4Invalid, end };
      atLeastOneChar = true;
    }
    if (current < end && at(name, current) === '.') {
      if (dotCount >= 3 || !atLeastOneChar || currentValue > 0xff) return { value: IPv4Invalid, end };
      parts[dotCount] = currentValue;
      dotCount++;
      atLeastOneChar = false;
      continue;
    }
    break;
  }
  if (!atLeastOneChar) return { value: IPv4Invalid, end };
  else if (current >= end) {
    // end of string
  } else if ((ch = at(name, current)) === '/' || ch === '\\' || (notImplicitFile && (ch === ':' || ch === '?' || ch === '#'))) {
    end = current;
  } else {
    return { value: IPv4Invalid, end };
  }
  parts[dotCount] = currentValue;
  switch (dotCount) {
    case 0:
      if (parts[0] > MaxIPv4Value) return { value: IPv4Invalid, end };
      return { value: parts[0], end };
    case 1:
      if (parts[1] > 0xffffff) return { value: IPv4Invalid, end };
      return { value: parts[0] * 0x1000000 + parts[1], end };
    case 2:
      if (parts[2] > 0xffff) return { value: IPv4Invalid, end };
      return { value: parts[0] * 0x1000000 + parts[1] * 0x10000 + parts[2], end };
    case 3:
      if (parts[3] > 0xff) return { value: IPv4Invalid, end };
      return { value: parts[0] * 0x1000000 + parts[1] * 0x10000 + parts[2] * 0x100 + parts[3], end };
    default:
      return { value: IPv4Invalid, end };
  }
}

function ipv4ParseCanonicalName(str: string, start: number, end: number, lb: { loopback: boolean }): string {
  const result = ipv4ParseNonCanonical(str, start, end, true).value;
  const n = [Math.floor(result / 0x1000000) & 0xff, (result >>> 16) & 0xff, (result >>> 8) & 0xff, result & 0xff];
  lb.loopback = n[0] === 127;
  return n.join('.');
}

function ipv4ParseHostNumber(str: string, start: number, end: number): number {
  const numbers = [0, 0, 0, 0];
  for (let i = 0; i < 4; ++i) {
    let b = 0;
    let ch: string;
    for (; start < end && (ch = str[start]) !== '.' && ch !== ':'; ++start) b = b * 10 + code(ch) - 48;
    numbers[i] = b & 0xff;
    ++start;
  }
  return ((numbers[0] << 24) | (numbers[1] << 16) | (numbers[2] << 8) | numbers[3]) >>> 0;
}

// ---------------------------------------------------------------------------------------------
// IPv6AddressHelper

function ipv6IsValid(name: string, start: number, end: number): { ok: boolean; end: number } {
  let sequenceCount = 0;
  let sequenceLength = 0;
  let haveCompressor = false;
  let haveIPv4Address = false;
  let havePrefix = false;
  let expectingNumber = true;
  let lastSequence = 1;
  const fail = { ok: false, end };

  if (at(name, start) === ':' && (start + 1 >= end || at(name, start + 1) !== ':')) return fail;

  let i: number;
  for (i = start; i < end; ++i) {
    const c = at(name, i);
    if (havePrefix ? isAsciiDigit(c) : isAsciiHexDigit(c)) {
      ++sequenceLength;
      expectingNumber = false;
    } else {
      if (sequenceLength > 4) return fail;
      if (sequenceLength !== 0) {
        ++sequenceCount;
        lastSequence = i - sequenceLength;
      }
      let sw = c;
      if (sw === '%') {
        for (;;) {
          if (++i === end) return fail;
          if (at(name, i) === ']') {
            sw = ']';
            break;
          } else if (at(name, i) === '/') {
            sw = '/';
            break;
          }
        }
      }
      if (sw === ']') {
        start = i;
        i = end;
        continue;
      } else if (sw === ':') {
        if (i > 0 && at(name, i - 1) === ':') {
          if (haveCompressor) return fail;
          haveCompressor = true;
          expectingNumber = false;
        } else {
          expectingNumber = true;
        }
      } else if (sw === '/') {
        if (sequenceCount === 0 || havePrefix) return fail;
        havePrefix = true;
        expectingNumber = true;
      } else if (sw === '.') {
        if (haveIPv4Address) return fail;
        const r = ipv4IsValid(name, lastSequence, end, true, false, false);
        if (!r.ok) return fail;
        i = r.end;
        ++sequenceCount;
        haveIPv4Address = true;
        --i;
      } else {
        return fail;
      }
      sequenceLength = 0;
    }
  }

  if (havePrefix && (sequenceLength < 1 || sequenceLength > 2)) return fail;
  const expectedSequenceCount = 8 + (havePrefix ? 1 : 0);
  if (!expectingNumber && sequenceLength <= 4 && (haveCompressor ? sequenceCount < expectedSequenceCount : sequenceCount === expectedSequenceCount)) {
    if (i === end + 1) return { ok: true, end: start + 1 };
    return fail;
  }
  return fail;
}

function ipv6Parse(address: string, numbers: number[], start: number): string | null {
  let number = 0;
  let index = 0;
  let compressorIndex = -1;
  let numberIsValid = true;
  let scopeId: string | null = null;
  if (address[start] === '[') ++start;

  for (let i = start; i < address.length && address[i] !== ']'; ) {
    switch (address[i]) {
      case '%':
        if (numberIsValid) {
          numbers[index++] = number & 0xffff;
          numberIsValid = false;
        }
        start = i;
        for (++i; i < address.length && address[i] !== ']' && address[i] !== '/'; ++i) {
          // scope id
        }
        scopeId = address.substring(start, i);
        for (; i < address.length && address[i] !== ']'; ++i) {
          // prefix
        }
        break;
      case ':': {
        numbers[index++] = number & 0xffff;
        number = 0;
        ++i;
        if (address[i] === ':') {
          compressorIndex = index;
          ++i;
        } else if (compressorIndex < 0 && index < 6) {
          break;
        }
        for (let j = i; j < address.length && address[j] !== ']' && address[j] !== ':' && address[j] !== '%' && address[j] !== '/' && j < i + 4; ++j) {
          if (address[j] === '.') {
            while (j < address.length && address[j] !== ']' && address[j] !== '/' && address[j] !== '%') ++j;
            number = ipv4ParseHostNumber(address, i, j);
            numbers[index++] = (number >>> 16) & 0xffff;
            numbers[index++] = number & 0xffff;
            i = j;
            number = 0;
            numberIsValid = false;
            break;
          }
        }
        break;
      }
      case '/':
        if (numberIsValid) {
          numbers[index++] = number & 0xffff;
          numberIsValid = false;
        }
        for (++i; address[i] !== ']'; ++i) {
          // prefix length
        }
        break;
      default:
        number = number * 16 + fromHexChar(address[i++]);
        break;
    }
  }
  if (numberIsValid) numbers[index++] = number & 0xffff;
  if (compressorIndex > 0) {
    let toIndex = 7;
    let fromIndex = index - 1;
    if (fromIndex !== toIndex) {
      for (let i = index - compressorIndex; i > 0; --i) {
        numbers[toIndex--] = numbers[fromIndex];
        numbers[fromIndex--] = 0;
      }
    }
  }
  return scopeId;
}

function ipv6ParseCanonicalName(str: string, start: number, lb: { loopback: boolean }, sc: { scopeId: string | null }): string {
  const numbers = [0, 0, 0, 0, 0, 0, 0, 0];
  const scopeId = ipv6Parse(str, numbers, start);
  if (scopeId !== null) sc.scopeId = scopeId;
  lb.loopback =
    numbers[0] === 0 &&
    numbers[1] === 0 &&
    numbers[2] === 0 &&
    numbers[3] === 0 &&
    numbers[4] === 0 &&
    ((numbers[5] === 0 && numbers[6] === 0 && numbers[7] === 1) || (numbers[6] === 0x7f00 && numbers[7] === 0x0001 && (numbers[5] === 0 || numbers[5] === 0xffff)));

  // FindCompressionRange
  let longestSequenceLength = 0;
  let longestSequenceStart = -1;
  let currentSequenceLength = 0;
  for (let i = 0; i < 8; i++) {
    if (numbers[i] === 0) {
      currentSequenceLength++;
      if (currentSequenceLength > longestSequenceLength) {
        longestSequenceLength = currentSequenceLength;
        longestSequenceStart = i - currentSequenceLength + 1;
      }
    } else {
      currentSequenceLength = 0;
    }
  }
  const rangeStart = longestSequenceLength > 1 ? longestSequenceStart : -1;
  const rangeEnd = longestSequenceLength > 1 ? longestSequenceStart + longestSequenceLength : 0;

  // ShouldHaveIpv4Embedded
  let ipv4Embedded = false;
  if (numbers[0] === 0 && numbers[1] === 0 && numbers[2] === 0 && numbers[3] === 0 && numbers[6] !== 0) {
    if (numbers[4] === 0 && (numbers[5] === 0 || numbers[5] === 0xffff)) ipv4Embedded = true;
    else if (numbers[4] === 0xffff && numbers[5] === 0) ipv4Embedded = true;
  }
  if (!ipv4Embedded) ipv4Embedded = numbers[4] === 0 && numbers[5] === 0x5efe;

  let s = '[';
  for (let i = 0; i < 8; i++) {
    if (ipv4Embedded && i === 6) {
      s += ':' + (numbers[i] >> 8) + '.' + (numbers[i] & 0xff) + '.' + (numbers[i + 1] >> 8) + '.' + (numbers[i + 1] & 0xff);
      break;
    }
    if (rangeStart === i) s += ':';
    if (rangeStart <= i && rangeEnd === 8) {
      s += ':';
      break;
    }
    if (rangeStart <= i && i < rangeEnd) continue;
    if (i !== 0) s += ':';
    s += numbers[i].toString(16);
  }
  return s + ']';
}

// ---------------------------------------------------------------------------------------------
// Uri

class Offset {
  scheme = 0;
  user = 0;
  host = 0;
  portValue = 0;
  path = 0;
  query = 0;
  fragment = 0;
  end = 0;
}

class MoreInfo {
  path: string | null = null;
  query: string | null = null;
  fragment: string | null = null;
  absoluteUri: string | null = null;
  remoteUrl: string | null = null;
}

class UriInfo {
  offset = new Offset();
  string: string | null = null;
  host: string | null = null;
  pathAndQuery: string | null = null;
  scopeId: string | null = null;
  private _moreInfo: MoreInfo | null = null;

  get moreInfo(): MoreInfo {
    return (this._moreInfo ??= new MoreInfo());
  }
}

function getException(err: PE): UriFormatException | null {
  switch (err) {
    case PE.None:
      return null;
    case PE.BadFormat:
      return new UriFormatException('Invalid URI: The format of the URI could not be determined.');
    case PE.BadScheme:
      return new UriFormatException('Invalid URI: The URI scheme is not valid.');
    case PE.BadAuthority:
      return new UriFormatException('Invalid URI: The Authority/Host could not be parsed.');
    case PE.EmptyUriString:
      return new UriFormatException('Invalid URI: The URI is empty.');
    case PE.SchemeLimit:
      return new UriFormatException('Invalid URI: The Uri scheme is too long.');
    case PE.SizeLimit:
      return new UriFormatException('Invalid URI: The Uri string is too long.');
    case PE.MustRootedPath:
      return new UriFormatException('Invalid URI: A Dos path must be rooted, for example, \'c:\\\'.');
    case PE.BadHostName:
      return new UriFormatException('Invalid URI: The hostname could not be parsed.');
    case PE.NonEmptyHost:
      return new UriFormatException('Invalid URI: The format of the URI could not be determined.');
    case PE.BadPort:
      return new UriFormatException('Invalid URI: Invalid port specified.');
    case PE.BadAuthorityTerminator:
      return new UriFormatException('Invalid URI: The Authority/Host cannot end with a backslash character (\'\\\\\').');
    case PE.CannotCreateRelative:
      return new UriFormatException('Invalid URI: The format of the URI could not be determined.');
    default:
      return new UriFormatException('Invalid URI: The format of the URI could not be determined.');
  }
}

function notAbsolute(): InvalidOperationException {
  return new InvalidOperationException('This operation is not supported for a relative URI.');
}

const s_schemeChars = charSet('+-.0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');

/** CheckSchemeSyntax */
function checkSchemeSyntax(scheme: string, e: { err: PE }): UriParser | null {
  const lower = asciiLower(scheme);
  const eq = (x: string): boolean => equalsOrdinalIgnoreCase(scheme, x);
  switch (scheme.length) {
    case 2:
      if (eq('ws')) return WsUri;
      break;
    case 3:
      if (eq('wss')) return WssUri;
      if (eq('ftp')) return FtpUri;
      break;
    case 4:
      if (eq('http')) return HttpUri;
      if (eq('file')) return FileUri;
      if (eq('uuid')) return UuidUri;
      if (eq('nntp')) return NntpUri;
      if (eq('ldap')) return LdapUri;
      if (eq('news')) return NewsUri;
      break;
    case 5:
      if (eq('https')) return HttpsUri;
      break;
    case 6:
      if (eq('mailto')) return MailToUri;
      if (eq('gopher')) return GopherUri;
      if (eq('telnet')) return TelnetUri;
      break;
    case 7:
      if (eq('net.tcp')) return NetTcpUri;
      break;
    case 8:
      if (eq('net.pipe')) return NetPipeUri;
      break;
  }
  if (scheme.length === 0 || !isAsciiLetter(scheme[0]) || scheme.split('').some((c) => !s_schemeChars.has(c))) {
    e.err = PE.BadScheme;
    return null;
  }
  if (scheme.length > c_MaxUriSchemeName) {
    e.err = PE.SchemeLimit;
    return null;
  }
  return findOrFetchAsUnknownV1Syntax(lower);
}

interface SchemeResult {
  err: PE;
  flags: bigint;
  syntax: UriParser | null;
}

/** ParseSchemeCheckImplicitFile */
function parseSchemeCheckImplicitFile(uriString: string, r: SchemeResult): number {
  let i = 0;
  while (i < uriString.length && isLWS(uriString[i])) i++;

  const colonOffset = uriString.indexOf(':', i) < 0 ? -1 : uriString.indexOf(':', i) - i;
  if (i + 2 >= uriString.length || colonOffset === 0) {
    r.err = PE.BadFormat;
    return 0;
  }
  const c1 = uriString[i + 1];
  if (c1 === ':' || c1 === '|') {
    if (isAsciiLetter(uriString[i])) {
      const c2 = uriString[i + 2];
      if (c2 === '\\' || c2 === '/') {
        r.flags |= F.DosPath | F.ImplicitFile | F.AuthorityFound;
        r.syntax = FileUri;
        return i;
      }
      r.err = PE.MustRootedPath;
      return 0;
    }
    r.err = c1 === ':' ? PE.BadScheme : PE.BadFormat;
    return 0;
  } else if (uriString[i] === '/' || uriString[i] === '\\') {
    if (c1 === '\\' || c1 === '/') {
      r.flags |= F.UncPath | F.ImplicitFile | F.AuthorityFound;
      r.syntax = FileUri;
      i += 2;
      while (i < uriString.length && (uriString[i] === '/' || uriString[i] === '\\')) i++;
      return i;
    }
    r.err = PE.BadFormat;
    return 0;
  }
  if (colonOffset < 0) {
    r.err = PE.BadFormat;
    return 0;
  }
  const e = { err: PE.None };
  r.syntax = checkSchemeSyntax(uriString.substring(i, i + colonOffset), e);
  r.err = e.err;
  if (r.syntax === null) return 0;
  return i + colonOffset + 1;
}

/** ParseScheme */
function parseScheme(uriString: string, r: SchemeResult): PE {
  const length = uriString.length;
  if (length === 0) return PE.EmptyUriString;
  if (length >= c_MaxUriBufferSize) return PE.SizeLimit;
  if (startsWithOrdinalIgnoreCaseAscii(uriString, 'https:')) {
    r.syntax = HttpsUri;
    r.flags |= 6n;
  } else if (startsWithOrdinalIgnoreCaseAscii(uriString, 'http:')) {
    r.syntax = HttpUri;
    r.flags |= 5n;
  } else {
    const idx = parseSchemeCheckImplicitFile(uriString, r);
    if (r.err !== PE.None) return r.err;
    r.flags |= BigInt(idx);
  }
  return PE.None;
}

/** CheckForUnicodeOrEscapedUnreserved */
function checkForUnicodeOrEscapedUnreserved(data: string): boolean {
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === '%') {
      if (i + 2 < data.length) {
        const value = decodeHexChars(data[i + 1], data[i + 2]);
        if (code(value) >= 0x80 || Unreserved.has(value)) return true;
        i += 2;
      }
    } else if (code(c) > 0x7f) {
      return true;
    }
  }
  return false;
}

/** Compress(Span<char>, syntax) over arr[start .. start+len); returns the new length. */
function compress(arr: string[], start: number, len: number, syntax: UriParser): number {
  const span = arr.slice(start, start + len);
  let n = span.length;
  let slashCount = 0;
  let lastSlash = 0;
  let dotCount = 0;
  let removeSegments = 0;
  const copyDown = (from: number, to: number): void => {
    for (let k = from; k < n; k++) span[to + (k - from)] = span[k];
  };

  for (let i = n - 1; i >= 0; i--) {
    let ch = span[i];
    if (ch === '\\' && syntax.inFact(S.ConvertPathSlashes)) span[i] = ch = '/';
    if (ch === '/') {
      ++slashCount;
    } else {
      if (slashCount > 1) lastSlash = i + 1;
      slashCount = 0;
    }
    if (ch === '.') {
      ++dotCount;
      continue;
    } else if (dotCount !== 0) {
      const skipSegment = syntax.notAny(S.CanonicalizeAsFilePath) && (dotCount > 2 || ch !== '/');
      if (!skipSegment && ch === '/') {
        if ((lastSlash === i + dotCount + 1 || (lastSlash === 0 && i + dotCount + 1 === n)) && dotCount <= 2) {
          lastSlash = i + 1 + dotCount + (lastSlash === 0 ? 0 : 1);
          copyDown(lastSlash, i + 1);
          n = n - (lastSlash - i - 1);
          lastSlash = i;
          if (dotCount === 2) ++removeSegments;
          dotCount = 0;
          continue;
        }
      }
      dotCount = 0;
    }
    if (ch === '/') {
      if (removeSegments !== 0) {
        --removeSegments;
        copyDown(lastSlash + 1, i + 1);
        n = n - (lastSlash - i);
      }
      lastSlash = i;
    }
  }

  let result = n;
  if (n !== 0 && syntax.inFact(S.CanonicalizeAsFilePath)) {
    if (slashCount <= 1) {
      if (removeSegments !== 0 && span[0] !== '/') {
        lastSlash++;
        copyDown(lastSlash, 0);
        result = n - lastSlash;
      } else if (dotCount !== 0) {
        if (lastSlash === dotCount || (lastSlash === 0 && dotCount === n)) {
          dotCount += lastSlash === 0 ? 0 : 1;
          copyDown(dotCount, 0);
          result = n - dotCount;
        }
      }
    }
  }
  for (let k = 0; k < result; k++) arr[start + k] = span[k];
  return result;
}

/** UnescapeOnly over arr[start..end); returns the new end. */
function unescapeOnly(a: string[], start: number, end: number, ch1: string, ch2: string, ch3: string): number {
  if (end - start < 3) return end;
  let pend = end - 2;
  let pch = start;
  let pnew = -1;
  let ch: string;
  done: for (;;) {
    // over:
    if (pch >= pend) break done;
    if (a[pch++] !== '%') continue;
    ch = decodeHexChars(a[pch++], a[pch++]);
    if (!(ch === ch1 || ch === ch2 || ch === ch3)) continue;
    pnew = pch - 2;
    a[pnew - 1] = ch;
    for (;;) {
      // over_new:
      if (pch >= pend) break done;
      if ((a[pnew++] = a[pch++]) !== '%') continue;
      ch = decodeHexChars((a[pnew++] = a[pch++]), (a[pnew++] = a[pch++]));
      if (!(ch === ch1 || ch === ch2 || ch === ch3)) continue;
      pnew -= 2;
      a[pnew - 1] = ch;
    }
  }
  pend += 2;
  if (pnew === -1) return end;
  if (pch === pend) return end - (pch - pnew);
  a[pnew++] = a[pch++];
  if (pch === pend) return end - (pch - pnew);
  a[pnew++] = a[pch++];
  return end - (pch - pnew);
}

export class Uri {
  private _string!: string;
  private _originalUnicodeString: string | null = null;
  private _syntax: UriParser | null = null;
  private _flags: bigint = F.Zero;
  private _info: UriInfo | null = null;

  /** new Uri(uriString, uriKind) (the one-argument form is UriKind.Absolute). */
  constructor(uriString: string | null, uriKind: UriKind = UriKind.Absolute) {
    if (uriString === null || uriString === undefined) throw new ArgumentNullException('uriString');
    this.createThis(uriString, false, uriKind);
  }

  // ---- construction ------------------------------------------------------------------------

  private createThis(uri: string, dontEscape: boolean, uriKind: UriKind): void {
    if (uriKind < UriKind.RelativeOrAbsolute || uriKind > UriKind.Relative) {
      throw new ArgumentException(`The value '${uriKind}' passed for the UriKind parameter is invalid.`);
    }
    this._string = uri ?? '';
    if (dontEscape) this._flags |= F.UserEscaped;
    const r: SchemeResult = { err: PE.None, flags: this._flags, syntax: null };
    const err = parseScheme(this._string, r);
    this._flags = r.flags;
    this._syntax = r.syntax;
    const e = this.initializeUri(err, uriKind);
    if (e !== null) throw e;
  }

  private initializeUri(err: PE, uriKind: UriKind): UriFormatException | null {
    if (err === PE.None) {
      if (this.isImplicitFile) {
        if (
          this.notAny(F.DosPath) &&
          uriKind !== UriKind.Absolute &&
          (uriKind === UriKind.Relative || (this._string.length >= 2 && (this._string[0] !== '\\' || this._string[1] !== '\\')))
        ) {
          this._syntax = null;
          this._flags &= F.UserEscaped;
          return null;
        } else if (uriKind === UriKind.Relative && this.inFact(F.DosPath)) {
          this._syntax = null;
          this._flags &= F.UserEscaped;
          return null;
        }
      }
    } else if (err > PE.LastRelativeUriOkErrIndex) {
      this._string = null!;
      return getException(err);
    }

    let hasUnicode = false;
    if (this.iriParsing && checkForUnicodeOrEscapedUnreserved(this._string)) {
      this._flags |= F.HasUnicode;
      hasUnicode = true;
      this._originalUnicodeString = this._string;
    }

    if (this._syntax !== null) {
      let e: UriFormatException | null;
      if ((err = this.privateParseMinimal()) !== PE.None) {
        if (uriKind !== UriKind.Absolute && err <= PE.LastRelativeUriOkErrIndex) {
          this._syntax = null;
          this._flags &= F.UserEscaped;
          return null;
        } else {
          e = getException(err);
        }
      } else if (uriKind === UriKind.Relative) {
        e = getException(PE.CannotCreateRelative);
      } else {
        e = null;
      }
      if (hasUnicode) {
        try {
          this.ensureParseRemaining();
        } catch (ex) {
          if (ex instanceof UriFormatException) return ex;
          throw ex;
        }
      }
      return e;
    } else if (err !== PE.None && uriKind !== UriKind.Absolute && err <= PE.LastRelativeUriOkErrIndex) {
      this._flags &= F.UserEscaped | F.HasUnicode;
      if (hasUnicode) {
        this._string = escapeUnescapeIri(this._originalUnicodeString!, 0, this._originalUnicodeString!.length, 0);
      }
      return null;
    } else {
      this._string = null!;
      return getException(err);
    }
  }

  /** Uri.TryCreate(string, UriKind, out Uri): the Uri or null. */
  static tryCreate(uriString: string | null, uriKind: UriKind): Uri | null {
    if (uriString === null || uriString === undefined) return null;
    const e: { e: UriFormatException | null } = { e: null };
    const result = Uri.createHelper(uriString, false, uriKind, e);
    return e.e === null && result !== null ? result : null;
  }

  private static raw(flags: bigint, syntax: UriParser | null, s: string): Uri {
    const u = Object.create(Uri.prototype) as Uri;
    u._string = s;
    u._originalUnicodeString = null;
    u._syntax = syntax;
    u._flags = flags;
    u._info = null;
    return u;
  }

  private static createHelper(uriString: string, dontEscape: boolean, uriKind: UriKind, out: { e: UriFormatException | null }): Uri | null {
    if (uriKind < UriKind.RelativeOrAbsolute || uriKind > UriKind.Relative) {
      throw new ArgumentException(`The value '${uriKind}' passed for the UriKind parameter is invalid.`);
    }
    const r: SchemeResult = { err: PE.None, flags: F.Zero, syntax: null };
    const err = parseScheme(uriString, r);
    let flags = r.flags;
    if (dontEscape) flags |= F.UserEscaped;
    if (err !== PE.None) {
      if (uriKind !== UriKind.Absolute && err <= PE.LastRelativeUriOkErrIndex) return Uri.raw(flags & F.UserEscaped, null, uriString);
      return null;
    }
    const result = Uri.raw(flags, r.syntax, uriString);
    out.e = result.initializeUri(err, uriKind);
    return out.e === null ? result : null;
  }

  // ---- flag helpers -------------------------------------------------------------------------

  private inFact(f: bigint): boolean {
    return (this._flags & f) !== 0n;
  }

  private notAny(f: bigint): boolean {
    return (this._flags & f) === 0n;
  }

  private get isImplicitFile(): boolean {
    return (this._flags & F.ImplicitFile) !== 0n;
  }

  private get isUncOrDosPath(): boolean {
    return (this._flags & (F.UncPath | F.DosPath)) !== 0n;
  }

  private get isDosPath(): boolean {
    return (this._flags & F.DosPath) !== 0n;
  }

  private get isUncPath(): boolean {
    return (this._flags & F.UncPath) !== 0n;
  }

  private get hostType(): bigint {
    return this._flags & F.HostTypeMask;
  }

  private get iriParsing(): boolean {
    return iriParsingStatic(this._syntax);
  }

  private get securedPathIndex(): number {
    if (this.isDosPath) {
      const ch = this._string[this._info!.offset.path];
      return ch === '/' || ch === '\\' ? 3 : 2;
    }
    return 0;
  }

  private ensureUriInfo(): UriInfo {
    if ((this._flags & F.MinimalUriInfoSet) === 0n) this.createUriInfo(this._flags);
    return this._info!;
  }

  private ensureParseRemaining(): void {
    if ((this._flags & F.AllUriInfoSet) === 0n) this.parseRemaining();
  }

  private ensureHostString(allowDnsOptimization: boolean): void {
    const info = this.ensureUriInfo();
    if (info.host === null) {
      if (allowDnsOptimization && this.inFact(F.CanonicalDnsHost)) return;
      this.createHostString();
    }
  }

  // ---- PrivateParseMinimal ------------------------------------------------------------------

  private privateParseMinimal(): PE {
    const syntax = this._syntax!;
    let idx = Number(this._flags & F.IndexMask);
    let length = this._string.length;
    const nh: { newHost: string | null } = { newHost: null };

    this._flags &= ~(F.IndexMask | F.UserDrivenParsing);

    const p = (this._flags & F.HostUnicodeNormalized) === 0n ? this.originalString : this._string;

    if (length > idx && isLWS(at(p, length - 1))) {
      --length;
      while (length !== idx && isLWS(at(p, --length)));
      ++length;
    }

    if (syntax.isAllSet(S.AllowEmptyHost | S.AllowDOSPath) && this.notAny(F.ImplicitFile) && idx + 1 < length) {
      let c: string;
      let i = idx;
      for (; i < length; ++i) {
        if (!((c = at(p, i)) === '\\' || c === '/')) break;
      }
      if (syntax.inFact(S.FileLikeUri) || i - idx <= 3) {
        if (i - idx >= 2) this._flags |= F.AuthorityFound;
        if (i + 1 < length && ((c = at(p, i + 1)) === ':' || c === '|') && isAsciiLetter(at(p, i))) {
          if (i + 2 >= length || ((c = at(p, i + 2)) !== '\\' && c !== '/')) {
            if (syntax.inFact(S.FileLikeUri)) return PE.MustRootedPath;
          } else {
            this._flags |= F.DosPath;
            if (syntax.inFact(S.MustHaveAuthority)) this._flags |= F.AuthorityFound;
            if (i !== idx && i - idx !== 2) idx = i - 1;
            else idx = i;
          }
        } else if (syntax.inFact(S.FileLikeUri) && i - idx >= 2 && i - idx !== 3 && i < length && at(p, i) !== '?' && at(p, i) !== '#') {
          this._flags |= F.UncPath;
          idx = i;
        }
      }
    }

    if ((this._flags & (F.UncPath | F.DosPath | F.UnixPath)) !== 0n) {
      // nothing
    } else if (idx + 2 <= length) {
      const first = at(p, idx);
      const second = at(p, idx + 1);
      if (syntax.inFact(S.MustHaveAuthority)) {
        if ((first === '/' || first === '\\') && (second === '/' || second === '\\')) {
          this._flags |= F.AuthorityFound;
          idx += 2;
        } else {
          return PE.BadAuthority;
        }
      } else if (syntax.inFact(S.OptionalAuthority) && (this.inFact(F.AuthorityFound) || (first === '/' && second === '/'))) {
        this._flags |= F.AuthorityFound;
        idx += 2;
      } else if (syntax.notAny(S.MailToLikeUri)) {
        if ((this._flags & (F.HasUnicode | F.HostUnicodeNormalized)) === F.HasUnicode) this._string = this._string.substring(0, idx);
        this._flags |= BigInt(idx) | F.UnknownHostType;
        return PE.None;
      }
    } else if (syntax.inFact(S.MustHaveAuthority)) {
      return PE.BadAuthority;
    } else if (syntax.notAny(S.MailToLikeUri)) {
      if ((this._flags & (F.HasUnicode | F.HostUnicodeNormalized)) === F.HasUnicode) this._string = this._string.substring(0, idx);
      this._flags |= BigInt(idx) | F.UnknownHostType;
      return PE.None;
    }

    if (this.inFact(F.DosPath)) {
      this._flags |= (this._flags & F.AuthorityFound) !== 0n ? F.BasicHostType : F.UnknownHostType;
      this._flags |= BigInt(idx);
      return PE.None;
    }

    {
      const st = { err: PE.None, flags: this._flags };
      idx = this.checkAuthorityHelper(p, idx, length, st, syntax, nh);
      this._flags = st.flags;
      if (st.err !== PE.None) return st.err;
      if (idx < length) {
        const hostTerminator = at(p, idx);
        if (hostTerminator === '\\' && this.notAny(F.ImplicitFile) && syntax.notAny(S.AllowDOSPath)) return PE.BadAuthorityTerminator;
      }
    }

    this._flags |= BigInt(idx);

    if (this.iriParsing && nh.newHost !== null) this._string = nh.newHost;
    return PE.None;
  }

  // ---- CheckAuthorityHelper -----------------------------------------------------------------

  private checkAuthorityHelper(
    pString: string,
    idx: number,
    length: number,
    st: { err: PE; flags: bigint },
    syntax: UriParser,
    nh: { newHost: string | null },
  ): number {
    let end = length;
    let ch = '\0';
    const startInput = idx;
    let start = idx;
    nh.newHost = null;
    let justNormalized = false;
    const iriParsing = iriParsingStatic(syntax);
    const hasUnicode = (st.flags & F.HasUnicode) !== 0n;
    const hostNotUnicodeNormalized = hasUnicode && (st.flags & F.HostUnicodeNormalized) === 0n;
    const syntaxFlags = syntax.flags;

    if (hostNotUnicodeNormalized) nh.newHost = this._originalUnicodeString!.substring(0, startInput);

    if (idx === length || (ch = at(pString, idx)) === '/' || (ch === '\\' && syntax.inFact(S.FileLikeUri)) || ch === '#' || ch === '?') {
      if (syntax.inFact(S.AllowEmptyHost)) {
        st.flags &= ~F.UncPath;
        if ((st.flags & F.ImplicitFile) !== 0n) st.err = PE.BadHostName;
        else st.flags |= F.BasicHostType;
      } else {
        st.err = PE.BadHostName;
      }
      if (hostNotUnicodeNormalized) st.flags |= F.HostUnicodeNormalized;
      return idx;
    }

    if ((syntaxFlags & S.MayHaveUserInfo) !== 0) {
      for (; start < end; ++start) {
        const c = at(pString, start);
        if (start === end - 1 || c === '?' || c === '#' || c === '\\' || c === '/') {
          start = idx;
          break;
        } else if (c === '@') {
          st.flags |= F.HasUserInfo;
          if (iriParsing && hostNotUnicodeNormalized) {
            nh.newHost += escapeUnescapeIri(pString, startInput, start + 1, C.UserInfo);
            if (nh.newHost!.length > 0xffff) {
              st.err = PE.SizeLimit;
              return idx;
            }
          }
          ++start;
          ch = at(pString, start);
          break;
        }
      }
    }

    const notImplicitFile = (st.flags & F.ImplicitFile) === 0n;
    let r6: { ok: boolean; end: number } | null = null;
    let r4: { ok: boolean; end: number } | null = null;
    let dnsLen = 0;
    if (ch === '[' && syntax.inFact(S.AllowIPv6Host) && (r6 = ipv6IsValid(pString, start + 1, end)).ok) {
      end = r6.end;
      st.flags |= F.IPv6HostType;
      if (hostNotUnicodeNormalized) {
        nh.newHost = (nh.newHost ?? '') + pString.substring(start, end);
        st.flags |= F.HostUnicodeNormalized;
        justNormalized = true;
      }
    } else if (
      isAsciiDigit(ch) &&
      syntax.inFact(S.AllowIPv4Host) &&
      (r4 = ipv4IsValid(pString, start, end, false, notImplicitFile, syntax.inFact(S.V1_UnknownUri))).ok
    ) {
      end = r4.end;
      st.flags |= F.IPv4HostType;
      if (hostNotUnicodeNormalized) {
        nh.newHost = (nh.newHost ?? '') + pString.substring(start, end);
        st.flags |= F.HostUnicodeNormalized;
        justNormalized = true;
      }
    } else if (
      (syntaxFlags & S.AllowDnsHost) !== 0 &&
      !iriParsing &&
      (() => {
        const d = domainNameIsValid(pString, start, end, false, notImplicitFile);
        dnsLen = d.length;
        return d.ok;
      })()
    ) {
      end = start + dnsLen;
      st.flags |= F.DnsHostType;
      if (!/[A-Z]/.test(pString.substring(start, start + dnsLen))) st.flags |= F.CanonicalDnsHost;
    } else if (
      (syntaxFlags & S.AllowDnsHost) !== 0 &&
      (hostNotUnicodeNormalized || syntax.inFact(S.AllowIdn)) &&
      (() => {
        const d = domainNameIsValid(pString, start, end, true, notImplicitFile);
        dnsLen = d.length;
        return d.ok;
      })()
    ) {
      end = start + dnsLen;
      // CheckAuthorityHelperHandleDnsIri
      st.flags |= F.DnsHostType;
      if (hasUnicode) {
        const temp = stripBidiControlCharacters(pString.substring(start, end));
        try {
          nh.newHost = (nh.newHost ?? '') + normalizeFormC(temp);
        } catch (ex) {
          if (!(ex instanceof ArgumentException)) throw ex;
          st.err = PE.BadHostName;
        }
        justNormalized = true;
      }
      st.flags |= F.HostUnicodeNormalized;
    } else if ((syntaxFlags & S.AllowUncHost) !== 0) {
      const ru = uncIsValid(pString, start, end, notImplicitFile);
      if (ru.ok) {
        end = ru.end;
        if (end - start <= MaximumInternetNameLength) {
          st.flags |= F.UncHostType;
          if (hostNotUnicodeNormalized) {
            nh.newHost = (nh.newHost ?? '') + pString.substring(start, end);
            st.flags |= F.HostUnicodeNormalized;
            justNormalized = true;
          }
        }
      }
    }

    if (end < length && at(pString, end) === '\\' && (st.flags & F.HostTypeMask) !== F.HostNotParsed && !syntax.inFact(S.FileLikeUri)) {
      if (syntax.inFact(S.V1_UnknownUri)) {
        st.err = PE.BadHostName;
        st.flags |= F.UnknownHostType;
        return end;
      }
      st.flags &= ~F.HostTypeMask;
    } else if (end < length && at(pString, end) === ':') {
      if (syntax.inFact(S.MayHavePort)) {
        let port = 0;
        const startPort = end;
        for (idx = end + 1; idx < length; ++idx) {
          const c = at(pString, idx);
          const val = code(c) - 48;
          if (val >= 0 && val <= 9) {
            if ((port = port * 10 + val) > 0xffff) break;
          } else if (c === '/' || c === '?' || c === '#') {
            break;
          } else {
            if (syntax.inFact(S.AllowAnyOtherHost) && syntax.notAny(S.V1_UnknownUri)) {
              st.flags &= ~F.HostTypeMask;
              break;
            } else {
              st.err = PE.BadPort;
              return idx;
            }
          }
        }
        if (port > 0xffff) {
          if (syntax.inFact(S.AllowAnyOtherHost)) {
            st.flags &= ~F.HostTypeMask;
          } else {
            st.err = PE.BadPort;
            return idx;
          }
        }
        if (hasUnicode && justNormalized) nh.newHost = (nh.newHost ?? '') + pString.substring(startPort, idx);
      } else {
        st.flags &= ~F.HostTypeMask;
      }
    }

    if ((st.flags & F.HostTypeMask) === F.HostNotParsed) {
      st.flags &= ~F.HasUserInfo;
      if (syntax.inFact(S.AllowAnyOtherHost)) {
        st.flags |= F.BasicHostType;
        for (end = idx; end < length; ++end) {
          const c = at(pString, end);
          if (c === '/' || c === '?' || c === '#') break;
        }
        if (hostNotUnicodeNormalized) {
          const user = pString.substring(startInput, end);
          try {
            nh.newHost = (nh.newHost ?? '') + normalizeFormC(user);
          } catch (ex) {
            if (!(ex instanceof ArgumentException)) throw ex;
            st.err = PE.BadHostName;
          }
          st.flags |= F.HostUnicodeNormalized;
        }
      } else {
        if (syntax.inFact(S.V1_UnknownUri)) {
          let dotFound = false;
          const startOtherHost = idx;
          for (end = idx; end < length; ++end) {
            const c = at(pString, end);
            if (dotFound && (c === '/' || c === '?' || c === '#')) break;
            else if (end < idx + 2 && c === '.') dotFound = true;
            else {
              st.err = PE.BadHostName;
              st.flags |= F.UnknownHostType;
              return idx;
            }
          }
          st.flags |= F.BasicHostType;
          if (hostNotUnicodeNormalized) {
            const user = pString.substring(startOtherHost, end);
            try {
              nh.newHost = (nh.newHost ?? '') + normalizeFormC(user);
            } catch (ex) {
              if (!(ex instanceof ArgumentException)) throw ex;
              st.err = PE.BadFormat;
              return idx;
            }
            st.flags |= F.HostUnicodeNormalized;
          }
        } else if (syntax.inFact(S.MustHaveAuthority) || syntax.inFact(S.MailToLikeUri)) {
          st.err = PE.BadHostName;
          st.flags |= F.UnknownHostType;
          return idx;
        }
      }
    }
    return end;
  }

  // ---- CreateUriInfo ------------------------------------------------------------------------

  private createUriInfo(cF: bigint): void {
    const info = new UriInfo();
    const syntax = this._syntax!;
    info.offset.end = this._string.length & 0xffff;

    let idx: number;
    let notCanonicalScheme = false;

    done: {
      if ((cF & F.ImplicitFile) !== 0n) {
        idx = 0;
        while (isLWS(this._string[idx])) {
          ++idx;
          ++info.offset.scheme;
        }
        if ((cF & F.UncPath) !== 0n) {
          idx += 2;
          const end = Number(cF & F.IndexMask);
          while (idx < end && (this._string[idx] === '/' || this._string[idx] === '\\')) ++idx;
        }
      } else {
        idx = syntax.schemeName.length;
        while (this._string[idx++] !== ':') ++info.offset.scheme;
        if ((cF & F.AuthorityFound) !== 0n) {
          if (at(this._string, idx) === '\\' || at(this._string, idx + 1) === '\\') notCanonicalScheme = true;
          idx += 2;
          if ((cF & (F.UncPath | F.DosPath)) !== 0n) {
            const end = Number(cF & F.IndexMask);
            while (idx < end && (this._string[idx] === '/' || this._string[idx] === '\\')) {
              notCanonicalScheme = true;
              ++idx;
            }
          }
        }
      }

      if (syntax.defaultPort !== NoDefaultPort) info.offset.portValue = syntax.defaultPort & 0xffff;

      if ((cF & F.HostTypeMask) === F.UnknownHostType || (cF & F.DosPath) !== 0n) {
        info.offset.user = Number(cF & F.IndexMask);
        info.offset.host = info.offset.user;
        info.offset.path = info.offset.user;
        cF &= ~F.IndexMask;
        if (notCanonicalScheme) cF |= F.SchemeNotCanonical;
        break done;
      }

      info.offset.user = idx & 0xffff;

      if (this.hostType === F.BasicHostType) {
        info.offset.host = idx & 0xffff;
        info.offset.path = Number(cF & F.IndexMask);
        cF &= ~F.IndexMask;
        break done;
      }

      if ((cF & F.HasUserInfo) !== 0n) {
        while (this._string[idx] !== '@') ++idx;
        ++idx;
        info.offset.host = idx & 0xffff;
      } else {
        info.offset.host = idx & 0xffff;
      }

      idx = Number(cF & F.IndexMask);
      cF &= ~F.IndexMask;
      if (notCanonicalScheme) cF |= F.SchemeNotCanonical;
      info.offset.path = idx & 0xffff;

      let notEmpty = false;
      if ((cF & F.HasUnicode) !== 0n) info.offset.end = this._originalUnicodeString!.length & 0xffff;

      if (idx < info.offset.end) {
        const userString = this.originalString;
        if (userString[idx] === ':') {
          let port = 0;
          if (++idx < info.offset.end) {
            port = code(userString[idx]) - 48;
            if (port >= 0 && port <= 9) {
              notEmpty = true;
              if (port === 0) cF |= F.PortNotCanonical | F.E_PortNotCanonical;
              for (++idx; idx < info.offset.end; ++idx) {
                const val = code(userString[idx]) - 48;
                if (val < 0 || val > 9) break;
                port = port * 10 + val;
              }
            }
          }
          if (notEmpty && syntax.defaultPort !== port) {
            info.offset.portValue = port & 0xffff;
            cF |= F.NotDefaultPort;
          } else {
            cF |= F.PortNotCanonical | F.E_PortNotCanonical;
          }
          info.offset.path = idx & 0xffff;
        }
      }
    }

    cF |= F.MinimalUriInfoSet;
    if (this._info === null) this._info = info;
    if ((this._flags & F.MinimalUriInfoSet) === 0n) this._flags = (this._flags & ~F.IndexMask) | cF;
  }

  // ---- host string --------------------------------------------------------------------------

  private createHostString(): void {
    const info = this._info!;
    const fl = { flags: this._flags };
    const sc = { scopeId: info.scopeId };
    let host = Uri.createHostStringHelper(this._string, info.offset.host, info.offset.path, fl, sc);
    info.scopeId = sc.scopeId;
    let flags = fl.flags;

    if (host.length !== 0) {
      if (this.hostType === F.BasicHostType) {
        let result = this.checkCanonical(host, 0, host.length, c_DummyChar).res;
        if ((result & K.DisplayCanonical) === 0) {
          if (this.notAny(F.ImplicitFile) || (result & K.ReservedFound) !== 0) flags |= F.HostNotCanonical;
        }
        if (this.inFact(F.ImplicitFile) && (result & (K.ReservedFound | K.EscapedCanonical)) !== 0) result &= ~K.EscapedCanonical;
        if ((result & (K.EscapedCanonical | K.BackslashInPath)) !== K.EscapedCanonical) {
          flags |= F.E_HostNotCanonical;
          if (this.notAny(F.UserEscaped)) host = escapeString(host, !this.isImplicitFile, UnreservedReservedExceptQuestionMarkHash);
        }
      } else if (this.notAny(F.CanonicalDnsHost)) {
        if (info.scopeId !== null) {
          flags |= F.HostNotCanonical | F.E_HostNotCanonical;
        } else {
          for (let i = 0; i < host.length; ++i) {
            if (info.offset.host + i >= info.offset.end || host[i] !== this._string[info.offset.host + i]) {
              flags |= F.HostNotCanonical | F.E_HostNotCanonical;
              break;
            }
          }
        }
      }
    }
    info.host = host;
    this._flags |= flags;
  }

  private static createHostStringHelper(str: string, idx: number, end: number, fl: { flags: bigint }, sc: { scopeId: string | null }): string {
    const lb = { loopback: false };
    let host: string;
    switch (fl.flags & F.HostTypeMask) {
      case F.DnsHostType:
        host = domainParseCanonicalName(str, idx, end, lb);
        break;
      case F.IPv6HostType:
        host = ipv6ParseCanonicalName(str, idx, lb, sc);
        break;
      case F.IPv4HostType:
        host = ipv4ParseCanonicalName(str, idx, end, lb);
        break;
      case F.UncHostType:
        host = domainParseCanonicalName(str, idx, end, lb);
        break;
      case F.BasicHostType:
        host = (fl.flags & F.DosPath) !== 0n ? '' : str.substring(idx, end);
        if (host.length === 0) lb.loopback = true;
        break;
      case F.UnknownHostType:
        host = '';
        break;
      default:
        throw getException(PE.BadHostName)!;
    }
    if (lb.loopback) fl.flags |= F.LoopbackHost;
    return host;
  }

  // ---- ParseRemaining -----------------------------------------------------------------------

  private parseRemaining(): void {
    this.ensureUriInfo();
    const info = this._info!;
    const syntax = this._syntax!;
    let cF = F.Zero;

    const buildIriStringFromPath = (this._flags & (F.HasUnicode | F.RestUnicodeNormalized)) === F.HasUnicode;
    let origIdx: number;
    let idx = info.offset.scheme;
    let length = this._string.length;
    let result: number = K.None;
    const syntaxFlags = syntax.flags;
    const orig = this._originalUnicodeString!;

    {
      const str = this._string;
      length = Uri.lengthWithoutTrailingSpaces(str, length, idx);
      if (this.isImplicitFile) {
        cF |= F.SchemeNotCanonical;
      } else {
        let i: number;
        const schemeName = syntax.schemeName;
        for (i = 0; i < schemeName.length; ++i) {
          if (schemeName[i] !== at(str, idx + i)) cF |= F.SchemeNotCanonical;
        }
        if ((this._flags & F.AuthorityFound) !== 0n && (idx + i + 3 >= length || at(str, idx + i + 1) !== '/' || at(str, idx + i + 2) !== '/')) {
          cF |= F.SchemeNotCanonical;
        }
      }

      if ((this._flags & F.HasUserInfo) !== 0n) {
        idx = info.offset.user;
        result = this.checkCanonical(str, idx, info.offset.host, '@').res;
        if ((result & K.DisplayCanonical) === 0) cF |= F.UserNotCanonical;
        if ((result & (K.EscapedCanonical | K.BackslashInPath)) !== K.EscapedCanonical) cF |= F.E_UserNotCanonical;
        if (
          this.iriParsing &&
          (result & (K.DisplayCanonical | K.EscapedCanonical | K.BackslashInPath | K.FoundNonAscii | K.NotIriCanonical)) === (K.DisplayCanonical | K.FoundNonAscii)
        ) {
          cF |= F.UserIriCanonical;
        }
      }
    }

    idx = info.offset.path;
    origIdx = info.offset.path;

    if (buildIriStringFromPath) {
      if (this.isFileSyntax && !this.isUncPath) {
        this._string = this.isImplicitFile ? '' : syntax.schemeName + '://';
      }
      info.offset.path = this._string.length & 0xffff;
      idx = info.offset.path;
    }

    if (buildIriStringFromPath) {
      const offset = origIdx;
      if (this.isImplicitFile || (syntaxFlags & (S.MayHaveQuery | S.MayHaveFragment)) === 0) {
        origIdx = orig.length;
      } else {
        let index = -1;
        for (let j = origIdx; j < orig.length; j++) {
          const c = orig[j];
          if (syntax.inFact(S.MayHaveQuery)) {
            if (c === '?' || (syntax.inFact(S.MayHaveFragment) && c === '#')) {
              index = j - origIdx;
              break;
            }
          } else if (c === '#') {
            index = j - origIdx;
            break;
          }
        }
        origIdx = index === -1 ? orig.length : index + origIdx;
      }
      this._string += escapeUnescapeIri(orig, offset, origIdx, C.Path);
      if (this._string.length > 0xffff) throw getException(PE.SizeLimit)!;
      length = this._string.length;
      if (this._string === orig) length = Uri.lengthWithoutTrailingSpaces(this._string, length, idx);
    }

    {
      const str = this._string;
      let r: { res: number; idx: number };
      if (this.isImplicitFile || (syntaxFlags & (S.MayHaveQuery | S.MayHaveFragment)) === 0) {
        r = this.checkCanonical(str, idx, length, c_DummyChar);
      } else {
        r = this.checkCanonical(
          str,
          idx,
          length,
          (syntaxFlags & S.MayHaveQuery) !== 0 ? '?' : syntax.inFact(S.MayHaveFragment) ? '#' : c_EOL,
        );
      }
      result = r.res;
      idx = r.idx;
      if (
        (this._flags & F.AuthorityFound) !== 0n &&
        (syntaxFlags & S.PathIsRooted) !== 0 &&
        (info.offset.path === length || (at(str, info.offset.path) !== '/' && at(str, info.offset.path) !== '\\'))
      ) {
        cF |= F.FirstSlashAbsent;
      }
    }

    let nonCanonical = false;
    if (
      this.isDosPath ||
      ((this._flags & F.AuthorityFound) !== 0n && ((syntaxFlags & (S.CompressPath | S.ConvertPathSlashes)) !== 0 || syntax.inFact(S.UnEscapeDotsAndSlashes)))
    ) {
      if ((result & K.DotSlashEscaped) !== 0 && syntax.inFact(S.UnEscapeDotsAndSlashes)) {
        cF |= F.E_PathNotCanonical | F.PathNotCanonical;
        nonCanonical = true;
      }
      if ((syntaxFlags & S.ConvertPathSlashes) !== 0 && (result & K.BackslashInPath) !== 0) {
        cF |= F.E_PathNotCanonical | F.PathNotCanonical;
        nonCanonical = true;
      }
      if ((syntaxFlags & S.CompressPath) !== 0 && ((cF & F.E_PathNotCanonical) !== 0n || (result & K.DotSlashAttn) !== 0)) {
        cF |= F.ShouldBeCompressed;
      }
      if ((result & K.BackslashInPath) !== 0) cF |= F.BackslashInPath;
    } else if ((result & K.BackslashInPath) !== 0) {
      cF |= F.E_PathNotCanonical;
      nonCanonical = true;
    }

    if ((result & K.DisplayCanonical) === 0) {
      if ((this._flags & F.ImplicitFile) === 0n || (this._flags & F.UserEscaped) !== 0n || (result & K.ReservedFound) !== 0) {
        cF |= F.PathNotCanonical;
        nonCanonical = true;
      }
    }

    if ((this._flags & F.ImplicitFile) !== 0n && (result & (K.ReservedFound | K.EscapedCanonical)) !== 0) {
      result &= ~K.EscapedCanonical;
    }

    if ((result & K.EscapedCanonical) === 0) cF |= F.E_PathNotCanonical;

    if (
      this.iriParsing &&
      !nonCanonical &&
      (result & (K.DisplayCanonical | K.EscapedCanonical | K.FoundNonAscii | K.NotIriCanonical)) === (K.DisplayCanonical | K.FoundNonAscii)
    ) {
      cF |= F.PathIriCanonical;
    }

    if (buildIriStringFromPath) {
      const offset = origIdx;
      if (origIdx < orig.length && orig[origIdx] === '?') {
        if ((syntaxFlags & S.MayHaveFragment) !== 0) {
          ++origIdx;
          const index = orig.indexOf('#', origIdx);
          origIdx = index === -1 ? orig.length : index;
        } else {
          origIdx = orig.length;
        }
        this._string += escapeUnescapeIri(orig, offset, origIdx, C.Query);
        if (this._string.length > 0xffff) throw getException(PE.SizeLimit)!;
        length = this._string.length;
        if (this._string === orig) length = Uri.lengthWithoutTrailingSpaces(this._string, length, idx);
      }
    }

    info.offset.query = idx & 0xffff;

    {
      const str = this._string;
      if (idx < length && str[idx] === '?') {
        ++idx;
        const r = this.checkCanonical(str, idx, length, (syntaxFlags & S.MayHaveFragment) !== 0 ? '#' : c_EOL);
        result = r.res;
        idx = r.idx;
        if ((result & K.DisplayCanonical) === 0) cF |= F.QueryNotCanonical;
        if ((result & (K.EscapedCanonical | K.BackslashInPath)) !== K.EscapedCanonical) cF |= F.E_QueryNotCanonical;
        if (
          this.iriParsing &&
          (result & (K.DisplayCanonical | K.EscapedCanonical | K.BackslashInPath | K.FoundNonAscii | K.NotIriCanonical)) === (K.DisplayCanonical | K.FoundNonAscii)
        ) {
          cF |= F.QueryIriCanonical;
        }
      }
    }

    if (buildIriStringFromPath) {
      const offset = origIdx;
      if (origIdx < orig.length && orig[origIdx] === '#') {
        origIdx = orig.length;
        this._string += escapeUnescapeIri(orig, offset, origIdx, C.Fragment);
        if (this._string.length > 0xffff) throw getException(PE.SizeLimit)!;
        length = this._string.length;
        length = Uri.lengthWithoutTrailingSpaces(this._string, length, idx);
      }
    }

    info.offset.fragment = idx & 0xffff;

    {
      const str = this._string;
      if (idx < length && str[idx] === '#') {
        ++idx;
        const r = this.checkCanonical(str, idx, length, c_EOL);
        result = r.res;
        idx = r.idx;
        if ((result & K.DisplayCanonical) === 0) cF |= F.FragmentNotCanonical;
        if ((result & (K.EscapedCanonical | K.BackslashInPath)) !== K.EscapedCanonical) cF |= F.E_FragmentNotCanonical;
        if (
          this.iriParsing &&
          (result & (K.DisplayCanonical | K.EscapedCanonical | K.BackslashInPath | K.FoundNonAscii | K.NotIriCanonical)) === (K.DisplayCanonical | K.FoundNonAscii)
        ) {
          cF |= F.FragmentIriCanonical;
        }
      }
    }
    info.offset.end = idx & 0xffff;

    cF |= F.AllUriInfoSet | F.RestUnicodeNormalized;
    this._flags |= cF;
  }

  private static lengthWithoutTrailingSpaces(str: string, length: number, idx: number): number {
    let local = length;
    while (local > idx && isLWS(str[local - 1])) --local;
    return local;
  }

  // ---- CheckCanonical -----------------------------------------------------------------------

  private checkCanonical(str: string, idx: number, end: number, delim: string): { res: number; idx: number } {
    let res = K.None;
    let needsEscaping = false;
    let foundEscaping = false;
    const iriParsing = this.iriParsing;
    const syntax = this._syntax;

    let i = idx;
    for (; i < end; ++i) {
      let c = at(str, i);
      const x = code(c);
      if (x <= 0x1f || (x >= 0x7f && x <= 0x9f)) {
        needsEscaping = true;
        foundEscaping = true;
        res |= K.ReservedFound;
      } else if (c > '~') {
        if (iriParsing) {
          let valid = false;
          res |= K.FoundNonAscii;
          if (isHighSurrogate(c)) {
            if (i + 1 < end) valid = checkIriUnicodeRangePair(c, at(str, i + 1), true).ok;
          } else {
            valid = checkIriUnicodeRangeChar(c, true);
          }
          if (!valid) res |= K.NotIriCanonical;
        }
        if (!needsEscaping) needsEscaping = true;
      } else if (c === delim) {
        break;
      } else if (delim === '?' && c === '#' && syntax !== null && syntax.inFact(S.MayHaveFragment)) {
        break;
      } else if (c === '?') {
        if (this.isImplicitFile || (syntax !== null && !syntax.inFact(S.MayHaveQuery) && delim !== c_EOL)) {
          res |= K.ReservedFound;
          foundEscaping = true;
          needsEscaping = true;
        }
      } else if (c === '#') {
        needsEscaping = true;
        if (this.isImplicitFile || (syntax !== null && !syntax.inFact(S.MayHaveFragment))) {
          res |= K.ReservedFound;
          foundEscaping = true;
        }
      } else if (c === '/' || c === '\\') {
        if ((res & K.BackslashInPath) === 0 && c === '\\') res |= K.BackslashInPath;
        if ((res & K.DotSlashAttn) === 0 && i + 1 !== end && (at(str, i + 1) === '/' || at(str, i + 1) === '\\')) res |= K.DotSlashAttn;
      } else if (c === '.') {
        const n = at(str, i + 1);
        if (((res & K.DotSlashAttn) === 0 && i + 1 === end) || n === '.' || n === '/' || n === '\\' || n === '?' || n === '#') {
          res |= K.DotSlashAttn;
        }
      } else if ((c <= '"' && c !== '!') || (c >= '[' && c <= '^') || c === '>' || c === '<' || c === '`') {
        if (!needsEscaping) needsEscaping = true;
        if ((this._flags & F.HasUnicode) !== 0n) res |= K.NotIriCanonical;
      } else if (c >= '{' && c <= '}') {
        needsEscaping = true;
      } else if (c === '%') {
        if (!foundEscaping) foundEscaping = true;
        if (i + 2 < end && (c = decodeHexChars(at(str, i + 1), at(str, i + 2))) !== c_DummyChar) {
          if (c === '.' || c === '/' || c === '\\') res |= K.DotSlashEscaped;
          i += 2;
          continue;
        }
        if (!needsEscaping) needsEscaping = true;
      }
    }

    if (foundEscaping) {
      if (!needsEscaping) res |= K.EscapedCanonical;
    } else {
      res |= K.DisplayCanonical;
      if (!needsEscaping) res |= K.EscapedCanonical;
    }
    return { res, idx: i };
  }

  // ---- components ---------------------------------------------------------------------------

  private getParts(uriParts: number, formatAs: number): string {
    if (this._syntax === null) throw notAbsolute();
    return this.getComponentsHelper(uriParts, formatAs);
  }

  private getComponentsHelper(uriComponents: number, uriFormat: number): string {
    const syntax = this._syntax!;
    if (uriComponents === C.Scheme) return syntax.schemeName;
    this.ensureParseRemaining();
    if ((uriComponents & C.NormalizedHost) !== 0) {
      // .NET reaches the format check below first (the mask cannot take an early return).
      if (uriFormat !== UriEscaped && uriFormat !== Unescaped && uriFormat !== SafeUnescaped && uriFormat !== V1ToStringUnescape) {
        throw new ArgumentOutOfRangeException('uriFormat');
      }
      throw new NotSupportedException('UriComponents.NormalizedHost is not ported.');
    }
    if ((uriComponents & C.Host) !== 0) this.ensureHostString(true);
    const info = this._info!;

    if (uriComponents === C.Port || uriComponents === C.StrongPort) {
      if ((this._flags & F.NotDefaultPort) !== 0n || (uriComponents === C.StrongPort && syntax.defaultPort !== NoDefaultPort)) {
        return String(info.offset.portValue);
      }
      return '';
    }

    if ((uriComponents & C.StrongPort) !== 0) uriComponents |= C.Port;

    if (uriComponents === C.Host && (uriFormat === UriEscaped || (this._flags & (F.HostNotCanonical | F.E_HostNotCanonical)) === 0n)) {
      this.ensureHostString(false);
      return info.host!;
    }

    switch (uriFormat) {
      case UriEscaped:
        return this.getEscapedParts(uriComponents);
      case V1ToStringUnescape:
      case SafeUnescaped:
      case Unescaped:
        return this.getUnescapedParts(uriComponents, uriFormat);
      default:
        throw new ArgumentOutOfRangeException('uriFormat');
    }
  }

  private getEscapedParts(uriParts: number): string {
    const info = this._info!;
    let nonCanonical = ((Number(this._flags & 0xffffn) & (Number(F.CannotDisplayCanonical) << 7)) >> 6) & 0xffff;
    if (this.inFact(F.SchemeNotCanonical)) nonCanonical |= Number(F.SchemeNotCanonical);
    if ((uriParts & C.Path) !== 0) {
      if (this.inFact(F.ShouldBeCompressed | F.FirstSlashAbsent | F.BackslashInPath)) {
        nonCanonical |= Number(F.PathNotCanonical);
      } else if (this.isDosPath && this._string[info.offset.path + this.securedPathIndex - 1] === '|') {
        nonCanonical |= Number(F.PathNotCanonical);
      }
    }
    if ((uriParts & 0xffff & nonCanonical) === 0) {
      const ret = this.getUriPartsFromUserString(uriParts);
      if (ret !== null) return ret;
    }
    return this.recreateParts(uriParts, nonCanonical, UriEscaped);
  }

  private getUnescapedParts(uriParts: number, formatAs: number): string {
    const info = this._info!;
    let nonCanonical = Number(this._flags & F.CannotDisplayCanonical);
    if ((uriParts & C.Path) !== 0) {
      if ((this._flags & (F.ShouldBeCompressed | F.FirstSlashAbsent | F.BackslashInPath)) !== 0n) {
        nonCanonical |= Number(F.PathNotCanonical);
      } else if (this.isDosPath && this._string[info.offset.path + this.securedPathIndex - 1] === '|') {
        nonCanonical |= Number(F.PathNotCanonical);
      }
    }
    if ((uriParts & 0xffff & nonCanonical) === 0) {
      const ret = this.getUriPartsFromUserString(uriParts);
      if (ret !== null) return ret;
    }
    return this.recreateParts(uriParts, nonCanonical, formatAs);
  }

  private recreateParts(parts: number, nonCanonical: number, formatAs: number): string {
    this.ensureHostString(false);
    const dest = new SB();
    const r = this.recreatePartsTo(dest, this._string, parts, nonCanonical, formatAs);
    return dest.toString(r);
  }

  /** Returns the offset in dest where the result starts. */
  private recreatePartsTo(dest: SB, str: string, parts: number, nonCanonical: number, formatAs: number): number {
    const info = this._info!;
    const syntax = this._syntax!;

    if ((parts & C.Scheme) !== 0) {
      dest.append(syntax.schemeName);
      if (parts !== C.Scheme) {
        dest.append(':');
        if (this.inFact(F.AuthorityFound)) dest.append('//');
      }
    }

    if ((parts & C.UserInfo) !== 0 && this.inFact(F.HasUserInfo)) {
      const sStart = info.offset.user;
      const sEnd = info.offset.host;
      if ((nonCanonical & C.UserInfo) !== 0) {
        switch (formatAs) {
          case UriEscaped:
            if (this.notAny(F.UserEscaped)) escapeStringTo(str, sStart, sEnd, dest, true, UnreservedReservedExceptQuestionMarkHash);
            else dest.append(str, sStart, sEnd);
            break;
          case SafeUnescaped:
            unescapeString(str, sStart, sEnd - 1, dest, '@', '/', '\\', this.inFact(F.UserEscaped) ? UM.Unescape : UM.EscapeUnescape, syntax, false);
            dest.append('@');
            break;
          case Unescaped:
            unescapeString(str, sStart, sEnd, dest, c_DummyChar, c_DummyChar, c_DummyChar, UM.Unescape | UM.UnescapeAll, syntax, false);
            break;
          default:
            dest.append(str, sStart, sEnd);
            break;
        }
      } else {
        dest.append(str, sStart, sEnd);
      }
      if (parts === C.UserInfo) dest.length = dest.length - 1;
    }

    if ((parts & C.Host) !== 0) {
      const host = info.host!;
      if (host.length !== 0) {
        let mode: number;
        if (formatAs !== UriEscaped && this.hostType === F.BasicHostType && (nonCanonical & C.Host) !== 0) {
          mode = formatAs === Unescaped ? UM.Unescape | UM.UnescapeAll : this.inFact(F.UserEscaped) ? UM.Unescape : UM.EscapeUnescape;
        } else {
          mode = UM.CopyOnly;
        }
        unescapeString(host, 0, host.length, dest, '/', '?', '#', mode, syntax, false);
      }
    }

    if ((parts & C.Port) !== 0 && (this.inFact(F.NotDefaultPort) || ((parts & C.StrongPort) !== 0 && syntax.defaultPort !== NoDefaultPort))) {
      dest.append(':');
      dest.append(String(info.offset.portValue));
    }

    if ((parts & C.Path) !== 0) {
      this.getCanonicalPath(dest, formatAs);
      if (parts === C.Path) {
        const offset = this.inFact(F.AuthorityFound) && dest.length !== 0 && dest.a[0] === '/' ? 1 : 0;
        return offset;
      }
    }

    afterQuery: if ((parts & C.Query) !== 0 && info.offset.query < info.offset.fragment) {
      const offset = info.offset.query + 1;
      if (parts !== C.Query) dest.append('?');
      let mode: number = UM.CopyOnly;
      if ((nonCanonical & C.Query) !== 0) {
        if (formatAs === UriEscaped) {
          if (this.notAny(F.UserEscaped)) {
            escapeStringTo(str, offset, info.offset.fragment, dest, true, UnreservedReservedExceptHash);
            break afterQuery;
          }
        } else {
          mode =
            formatAs === V1ToStringUnescape
              ? (this.inFact(F.UserEscaped) ? UM.Unescape : UM.EscapeUnescape) | UM.V1ToStringFlag
              : formatAs === Unescaped
                ? UM.Unescape | UM.UnescapeAll
                : this.inFact(F.UserEscaped)
                  ? UM.Unescape
                  : UM.EscapeUnescape;
        }
      }
      unescapeString(str, offset, info.offset.fragment, dest, '#', c_DummyChar, c_DummyChar, mode, syntax, true);
    }

    afterFragment: if ((parts & C.Fragment) !== 0 && info.offset.fragment < info.offset.end) {
      const offset = info.offset.fragment + 1;
      if (parts !== C.Fragment) dest.append('#');
      let mode: number = UM.CopyOnly;
      if ((nonCanonical & C.Fragment) !== 0) {
        if (formatAs === UriEscaped) {
          if (this.notAny(F.UserEscaped)) {
            escapeStringTo(str, offset, info.offset.end, dest, true, UnreservedReserved);
            break afterFragment;
          }
        } else {
          mode =
            formatAs === V1ToStringUnescape
              ? (this.inFact(F.UserEscaped) ? UM.Unescape : UM.EscapeUnescape) | UM.V1ToStringFlag
              : formatAs === Unescaped
                ? UM.Unescape | UM.UnescapeAll
                : this.inFact(F.UserEscaped)
                  ? UM.Unescape
                  : UM.EscapeUnescape;
        }
      }
      unescapeString(str, offset, info.offset.end, dest, '#', c_DummyChar, c_DummyChar, mode, syntax, false);
    }
    return 0;
  }

  private getUriPartsFromUserString(uriParts: number): string | null {
    const info = this._info!;
    const o = info.offset;
    const s = this._string;
    const syntax = this._syntax!;
    let delimiterAwareIdx: number;

    const strongAuthority = (): string => {
      if (this.inFact(F.NotDefaultPort) || syntax.defaultPort === NoDefaultPort) return o.path - o.user === 0 ? '' : s.substring(o.user, o.path);
      return s.substring(o.user, o.path) + ':' + String(o.portValue);
    };

    switch (uriParts & ~C.KeepDelimiter) {
      case C.Scheme | C.Host | C.Port:
        if (!this.inFact(F.HasUserInfo)) return s.substring(o.scheme, o.path);
        return s.substring(o.scheme, o.user) + s.substring(o.host, o.path);
      case C.HostAndPort:
        if (!this.inFact(F.HasUserInfo)) return strongAuthority();
        if (this.inFact(F.NotDefaultPort) || syntax.defaultPort === NoDefaultPort) return s.substring(o.host, o.path);
        return s.substring(o.host, o.path) + ':' + String(o.portValue);
      case C.AbsoluteUri:
        if (o.scheme === 0 && o.end === s.length) return s;
        return s.substring(o.scheme, o.end);
      case C.HttpRequestUrl:
        if (this.inFact(F.HasUserInfo)) return s.substring(o.scheme, o.user) + s.substring(o.host, o.fragment);
        if (o.scheme === 0 && o.fragment === s.length) return s;
        return s.substring(o.scheme, o.fragment);
      case C.SchemeAndServer | C.UserInfo:
        return s.substring(o.scheme, o.path);
      case C.AbsoluteUri & ~C.Fragment:
        if (o.scheme === 0 && o.fragment === s.length) return s;
        return s.substring(o.scheme, o.fragment);
      case C.Scheme:
        if (uriParts !== C.Scheme) return s.substring(o.scheme, o.user);
        return syntax.schemeName;
      case C.Host: {
        let idx = o.path;
        if (this.inFact(F.NotDefaultPort | F.PortNotCanonical)) {
          while (s[--idx] !== ':');
        }
        return idx - o.host === 0 ? '' : s.substring(o.host, idx);
      }
      case C.Path:
        if (uriParts === C.Path && this.inFact(F.AuthorityFound) && o.end > o.path && s[o.path] === '/') delimiterAwareIdx = o.path + 1;
        else delimiterAwareIdx = o.path;
        if (delimiterAwareIdx >= o.query) return '';
        return s.substring(delimiterAwareIdx, o.query);
      case C.Query:
        delimiterAwareIdx = uriParts === C.Query ? o.query + 1 : o.query;
        if (delimiterAwareIdx >= o.fragment) return '';
        return s.substring(delimiterAwareIdx, o.fragment);
      case C.Fragment:
        delimiterAwareIdx = uriParts === C.Fragment ? o.fragment + 1 : o.fragment;
        if (delimiterAwareIdx >= o.end) return '';
        return s.substring(delimiterAwareIdx, o.end);
      case C.UserInfo | C.Host | C.Port:
        return o.path - o.user === 0 ? '' : s.substring(o.user, o.path);
      case C.StrongAuthority:
        return strongAuthority();
      case C.PathAndQuery:
        return s.substring(o.path, o.fragment);
      case C.HttpRequestUrl | C.Fragment:
        if (this.inFact(F.HasUserInfo)) return s.substring(o.scheme, o.user) + s.substring(o.host, o.end);
        if (o.scheme === 0 && o.end === s.length) return s;
        return s.substring(o.scheme, o.end);
      case C.PathAndQuery | C.Fragment:
        return s.substring(o.path, o.end);
      case C.UserInfo:
        if (this.notAny(F.HasUserInfo)) return '';
        delimiterAwareIdx = uriParts === C.UserInfo ? o.host - 1 : o.host;
        if (o.user >= delimiterAwareIdx) return '';
        return s.substring(o.user, delimiterAwareIdx);
      default:
        return null;
    }
  }

  private getCanonicalPath(dest: SB, formatAs: number): void {
    const info = this._info!;
    const syntax = this._syntax!;
    if (this.inFact(F.FirstSlashAbsent)) dest.append('/');
    if (info.offset.path === info.offset.query) return;

    let start = dest.length;
    const dosPathIdx = this.securedPathIndex;

    if (formatAs === UriEscaped) {
      if (this.inFact(F.ShouldBeCompressed)) {
        dest.append(this._string, info.offset.path, info.offset.query);
        if (syntax.inFact(S.UnEscapeDotsAndSlashes) && this.inFact(F.PathNotCanonical) && !this.isImplicitFile) {
          dest.length = unescapeOnly(dest.a, start, dest.length, '.', '/', syntax.inFact(S.ConvertPathSlashes) ? '\\' : c_DummyChar);
        }
      } else {
        if (this.inFact(F.E_PathNotCanonical) && this.notAny(F.UserEscaped)) {
          let str = this._string;
          if (dosPathIdx !== 0 && str[dosPathIdx + info.offset.path - 1] === '|') {
            const k = dosPathIdx + info.offset.path - 1;
            str = str.substring(0, k) + ':' + str.substring(k + 1);
          }
          escapeStringTo(str, info.offset.path, info.offset.query, dest, !this.isImplicitFile, UnreservedReservedExceptQuestionMarkHash);
        } else {
          dest.append(this._string, info.offset.path, info.offset.query);
        }
      }
    } else {
      dest.append(this._string, info.offset.path, info.offset.query);
      if (this.inFact(F.ShouldBeCompressed)) {
        if (syntax.inFact(S.UnEscapeDotsAndSlashes) && this.inFact(F.PathNotCanonical) && !this.isImplicitFile) {
          dest.length = unescapeOnly(dest.a, start, dest.length, '.', '/', syntax.inFact(S.ConvertPathSlashes) ? '\\' : c_DummyChar);
        }
      }
    }

    const offset = start + dosPathIdx;
    if (dosPathIdx !== 0 && dest.a[offset - 1] === '|') dest.a[offset - 1] = ':';

    if (this.inFact(F.ShouldBeCompressed) && dest.length - offset > 0) {
      dest.length = offset + compress(dest.a, offset, dest.length - offset, syntax);
      if (dest.a[start] === '\\') dest.a[start] = '/';
      if (formatAs === UriEscaped && this.notAny(F.UserEscaped) && this.inFact(F.E_PathNotCanonical)) {
        const copy = dest.toString(start);
        dest.length = start;
        escapeStringTo(copy, 0, copy.length, dest, !this.isImplicitFile, UnreservedReservedExceptQuestionMarkHash);
        start = dest.length;
      }
    }

    if (formatAs !== UriEscaped && this.inFact(F.PathNotCanonical)) {
      let mode: number;
      switch (formatAs) {
        case V1ToStringUnescape:
          mode = (this.inFact(F.UserEscaped) ? UM.Unescape : UM.EscapeUnescape) | UM.V1ToStringFlag;
          if (this.isImplicitFile) mode &= ~UM.Unescape;
          break;
        case Unescaped:
          mode = this.isImplicitFile ? UM.CopyOnly : UM.Unescape | UM.UnescapeAll;
          break;
        default:
          mode = this.inFact(F.UserEscaped) ? UM.Unescape : UM.EscapeUnescape;
          if (this.isImplicitFile) mode &= ~UM.Unescape;
          break;
      }
      if (mode !== UM.CopyOnly) {
        const copy = dest.toString(start);
        dest.length = start;
        unescapeString(copy, 0, copy.length, dest, '?', '#', c_DummyChar, mode, syntax, false);
      }
    }
  }

  private getLocalPath(): string {
    this.ensureParseRemaining();
    const syntax = this._syntax!;
    if (this.isUncOrDosPath) {
      this.ensureHostString(false);
      const info = this._info!;
      let start: number;

      if (this.notAny(F.HostNotCanonical | F.PathNotCanonical | F.ShouldBeCompressed)) {
        start = this.isUncPath ? info.offset.host - 2 : info.offset.path;
        let str =
          this.isImplicitFile && info.offset.host === (this.isDosPath ? 0 : 2) && info.offset.query === info.offset.end
            ? this._string
            : this.isDosPath && (this._string[start] === '/' || this._string[start] === '\\')
              ? this._string.substring(start + 1, info.offset.query)
              : this._string.substring(start, info.offset.query);
        if (this.isDosPath && str[1] === '|') str = str.substring(0, 1) + ':' + str.substring(2);
        return str.replace(/\//g, '\\');
      }

      const result = new SB();
      start = info.offset.path;
      const host = info.host!;
      if (this.isUncPath) {
        result.append('\\\\');
        unescapeString(host, 0, host.length, result, c_DummyChar, c_DummyChar, c_DummyChar, UM.CopyOnly, syntax, false);
      } else {
        if (this._string[start] === '/' || this._string[start] === '\\') ++start;
      }
      const pathStart = result.length;
      const mode = this.inFact(F.PathNotCanonical) && !this.isImplicitFile ? UM.Unescape | UM.UnescapeAll : UM.CopyOnly;
      unescapeString(this._string, start, info.offset.query, result, c_DummyChar, c_DummyChar, c_DummyChar, mode, syntax, true);
      if (result.a[1] === '|') result.a[1] = ':';
      if (this.inFact(F.ShouldBeCompressed)) {
        const cstart = this.isDosPath ? pathStart + 2 : pathStart;
        result.length = cstart + compress(result.a, cstart, result.length - cstart, syntax);
      }
      for (let i = 0; i < result.length; i++) if (result.a[i] === '/') result.a[i] = '\\';
      return result.toString();
    }
    return this.getUnescapedParts(C.Path | C.KeepDelimiter, Unescaped);
  }

  private get isFileSyntax(): boolean {
    return this._syntax === FileUri;
  }

  // ---- public API ---------------------------------------------------------------------------

  /** The string passed to the constructor. */
  get originalString(): string {
    return this._originalUnicodeString ?? this._string;
  }

  get isAbsoluteUri(): boolean {
    return this._syntax !== null;
  }

  get scheme(): string {
    if (this._syntax === null) throw notAbsolute();
    return this._syntax.schemeName;
  }

  get localPath(): string {
    if (this._syntax === null) throw notAbsolute();
    return this.getLocalPath();
  }

  get fragment(): string {
    if (this._syntax === null) throw notAbsolute();
    const info = this.ensureUriInfo().moreInfo;
    return (info.fragment ??= this.getParts(C.Fragment | C.KeepDelimiter, UriEscaped));
  }

  get absoluteUri(): string {
    if (this._syntax === null) throw notAbsolute();
    const info = this.ensureUriInfo().moreInfo;
    return (info.absoluteUri ??= this.getParts(C.AbsoluteUri, UriEscaped));
  }

  get absolutePath(): string {
    if (this._syntax === null) throw notAbsolute();
    const info = this.ensureUriInfo().moreInfo;
    let path = (info.path ??= this.getParts(C.Path | C.KeepDelimiter, UriEscaped));
    if (this.isDosPath && path[0] === '/') path = path.substring(1);
    return path;
  }

  get query(): string {
    if (this._syntax === null) throw notAbsolute();
    const info = this.ensureUriInfo().moreInfo;
    return (info.query ??= this.getParts(C.Query | C.KeepDelimiter, UriEscaped));
  }

  get pathAndQuery(): string {
    if (this._syntax === null) throw notAbsolute();
    const info = this.ensureUriInfo();
    if (info.pathAndQuery === null) {
      let result = this.getParts(C.PathAndQuery, UriEscaped);
      if (this.isDosPath && result[0] === '/') result = result.substring(1);
      info.pathAndQuery = result;
    }
    return info.pathAndQuery;
  }

  get host(): string {
    if (this._syntax === null) throw notAbsolute();
    return this.getParts(C.Host, UriEscaped);
  }

  get port(): number {
    if (this._syntax === null) throw notAbsolute();
    const info = this.ensureUriInfo();
    if (this.inFact(F.NotDefaultPort)) return info.offset.portValue;
    return this._syntax.defaultPort;
  }

  get isDefaultPort(): boolean {
    if (this._syntax === null) throw notAbsolute();
    this.ensureUriInfo();
    return this.notAny(F.NotDefaultPort);
  }

  get isUnc(): boolean {
    if (this._syntax === null) throw notAbsolute();
    return this.isUncPath;
  }

  get isFile(): boolean {
    if (this._syntax === null) throw notAbsolute();
    return this._syntax.schemeName === 'file';
  }

  get userInfo(): string {
    if (this._syntax === null) throw notAbsolute();
    return this.getParts(C.UserInfo, UriEscaped);
  }

  get authority(): string {
    if (this._syntax === null) throw notAbsolute();
    return this.getParts(C.Host | C.Port, UriEscaped);
  }

  /**
   * GetComponents(components, format) for an absolute URI. Every syntax of the port is a built-in
   * (simple) one, for which .NET calls GetComponentsHelper directly.
   */
  getComponents(components: UriComponents, format: UriFormat): string {
    if ((components & 0x80000000) !== 0) throw new NotSupportedException('UriComponents.SerializationInfoString is not ported.');
    if ((format & ~UriFormat.SafeUnescaped) !== 0) throw new ArgumentOutOfRangeException('format');
    if (this._syntax === null) throw notAbsolute();
    return this.getComponentsHelper(components, format);
  }

  toString(): string {
    if (this._syntax === null) return this._string;
    const info = this.ensureUriInfo();
    return (info.string ??= this.getComponentsHelper(C.AbsoluteUri, V1ToStringUnescape));
  }

  /** The xs:anyURI text the XML layer writes (XmlConvert / XAttribute use ToString()). */
  toXmlString(): string {
    return this.toString();
  }

  /** The key Uri.Equals compares (for use in hash maps). */
  equalityKey(): string {
    if (this._syntax === null) return 'r|' + this.originalString;
    const info = this.ensureUriInfo().moreInfo;
    let components = C.HttpRequestUrl;
    if (this._syntax.inFact(S.MailToLikeUri)) components |= C.UserInfo;
    const remoteUrl = (info.remoteUrl ??= this.getParts(components, SafeUnescaped));
    return 'a|' + (this.isUncOrDosPath ? toUpperOrdinal(remoteUrl) : remoteUrl);
  }

  /** Uri.Equals(object): a Uri or a string (parsed with UriKind.RelativeOrAbsolute). */
  equals(comparand: unknown): boolean {
    if (comparand === null || comparand === undefined) return false;
    if (this === comparand) return true;
    let obj: Uri | null = comparand instanceof Uri ? comparand : null;
    if (obj === null) {
      if (typeof comparand !== 'string') return false;
      if (comparand === this.originalString) return true;
      obj = Uri.tryCreate(comparand, UriKind.RelativeOrAbsolute);
      if (obj === null) return false;
    }
    if (this.originalString === obj.originalString) return true;
    if (this.isAbsoluteUri !== obj.isAbsoluteUri) return false;
    if (this._syntax === null) return this.originalString === obj.originalString;

    if (this.notAny(F.AllUriInfoSet) || obj.notAny(F.AllUriInfoSet)) {
      if (this.isUncOrDosPath ? equalsOrdinalIgnoreCase(this._string, obj._string) : this._string === obj._string) return true;
    }

    this.ensureUriInfo();
    obj.ensureUriInfo();

    if (this.inFact(F.CanonicalDnsHost) && obj.inFact(F.CanonicalDnsHost)) {
      const s1 = this._string;
      const s2 = obj._string;
      let i1 = this._info!.offset.host;
      let end1 = this._info!.offset.path;
      let i2 = obj._info!.offset.host;
      const end2 = obj._info!.offset.path;
      if (end1 - i1 > end2 - i2) end1 = i1 + end2 - i2;
      while (i1 < end1) {
        if (s1[i1] !== s2[i2]) return false;
        if (s2[i2] === ':') break;
        ++i1;
        ++i2;
      }
      if (i1 < this._info!.offset.path && s1[i1] !== ':') return false;
      if (i2 < end2 && s2[i2] !== ':') return false;
    } else {
      this.ensureHostString(false);
      obj.ensureHostString(false);
      if (this._info!.host !== obj._info!.host) return false;
    }
    if (this.port !== obj.port) return false;

    const selfInfo = this._info!.moreInfo;
    const otherInfo = obj._info!.moreInfo;
    let components = C.HttpRequestUrl;
    if (this._syntax.inFact(S.MailToLikeUri)) {
      if (!obj._syntax!.inFact(S.MailToLikeUri)) return false;
      components |= C.UserInfo;
    }
    const selfUrl = (selfInfo.remoteUrl ??= this.getParts(components, SafeUnescaped));
    const otherUrl = (otherInfo.remoteUrl ??= obj.getParts(components, SafeUnescaped));
    return this.isUncOrDosPath ? equalsOrdinalIgnoreCase(selfUrl, otherUrl) : selfUrl === otherUrl;
  }

  /** Uri.EscapeDataString */
  static escapeDataString(stringToEscape: string | null): string {
    if (stringToEscape === null || stringToEscape === undefined) throw new ArgumentNullException('stringToEscape');
    return escapeString(stringToEscape, false, Unreserved);
  }

  /** Uri.UnescapeDataString */
  static unescapeDataString(stringToUnescape: string | null): string {
    if (stringToUnescape === null || stringToUnescape === undefined) throw new ArgumentNullException('stringToUnescape');
    if (stringToUnescape.length === 0) return '';
    const position = stringToUnescape.indexOf('%');
    if (position === -1) return stringToUnescape;
    const vsb = new SB();
    vsb.append(stringToUnescape, 0, position);
    unescapeString(stringToUnescape, position, stringToUnescape.length, vsb, c_DummyChar, c_DummyChar, c_DummyChar, UM.Unescape | UM.UnescapeAll, null, false);
    return vsb.toString();
  }
}
