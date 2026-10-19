// Port of Aml.Engine.Resources.Files.SemanticVersion (assembly Aml.Engine.Resources 4.2.1, a
// dependency of Aml.Engine 4.5.2; decompiled with ilspycmd). Needed by
// CAEXObjectExtensions.semanticVersion. The [TypeConverter] attribute has no
// counterpart.
//
// .NET regex semantics: `\d` matches any Unicode decimal digit, `\s` the .NET white space set,
// RegexOptions.IgnoreCase uses Unicode case equivalences (JS flags `iu`).

import { ArgumentNullException } from '../../../system/exceptions.js';
import { compareOrdinalIgnoreCase, equalsOrdinalIgnoreCase, isNullOrEmpty } from '../../../system/strings.js';
import { Version } from '../../amlobjects/internal/Version.js';

const WS = '[\\f\\n\\r\\t\\v\\x85\\p{Z}]';

const semanticVersionRegex = new RegExp(`^(?<Version>\\p{Nd}+(?:${WS}*\\.${WS}*\\p{Nd}+){0,3})(?<Release>-[a-z][0-9a-z-]*)?$`, 'iu');

const strictSemanticVersionRegex = new RegExp('^(?<Version>\\p{Nd}+(?:\\.\\p{Nd}+){2})(?<Release>-[a-z][0-9a-z-]*)?$', 'iu');

const WHITE_SPACE = new Set<number>([
  0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x20, 0x85, 0xa0, 0x1680, 0x2000, 0x2001, 0x2002, 0x2003, 0x2004, 0x2005, 0x2006, 0x2007,
  0x2008, 0x2009, 0x200a, 0x2028, 0x2029, 0x202f, 0x205f, 0x3000,
]);

/** string.Trim() (char.IsWhiteSpace). */
function trimWhiteSpace(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && WHITE_SPACE.has(s.charCodeAt(start))) start++;
  while (end > start && WHITE_SPACE.has(s.charCodeAt(end - 1))) end--;
  return s.substring(start, end);
}

/** A semantic version (major.minor.build[.revision][-special]). */
export class SemanticVersion {
  private readonly _originalString: string;

  private _normalizedVersionString: string | null = null;

  private _version!: Version;

  private _specialVersion!: string;

  /** The version numbers (build and revision normalized to at least 0). */
  get version(): Version {
    return this._version;
  }

  /** The special (pre release) version. */
  get specialVersion(): string {
    return this._specialVersion;
  }

  /**
   * Constructors: (string version) (= Parse; TypeError for invalid strings like the C#
   * NullReferenceException), (major, minor, build[, revision | specialVersion]),
   * (Version[, specialVersion]), copy constructor (SemanticVersion, internal in C#).
   */
  constructor(version: string);
  constructor(major: number, minor: number, build: number, revisionOrSpecialVersion?: number | string);
  constructor(version: Version | null, specialVersion?: string | null);
  /** Private in C#: with the original string. */
  constructor(version: Version | null, specialVersion: string | null, originalString: string | null);
  constructor(semVer: SemanticVersion);
  constructor(...args: unknown[]) {
    const a0 = args[0];
    if (typeof a0 === 'string') {
      // this(Parse(version)) then _originalString = version
      const parsed = SemanticVersion.parse(a0) as SemanticVersion;
      this._version = parsed._version;
      this._specialVersion = parsed._specialVersion;
      this._originalString = a0;
      return;
    }
    if (a0 instanceof SemanticVersion) {
      this._originalString = a0.toString();
      this._version = a0._version;
      this._specialVersion = a0._specialVersion;
      return;
    }
    let version: Version | null;
    let specialVersion: string | null = '';
    let originalString: string | null = null;
    if (typeof a0 === 'number') {
      if (args.length >= 4 && typeof args[3] === 'string') {
        version = new Version(a0, args[1] as number, args[2] as number);
        specialVersion = args[3];
      } else if (args.length >= 4 && typeof args[3] === 'number') {
        version = new Version(a0, args[1] as number, args[2] as number, args[3]);
      } else {
        version = new Version(a0, args[1] as number, args[2] as number);
      }
    } else {
      version = (a0 as Version | null | undefined) ?? null;
      if (args.length >= 2) specialVersion = (args[1] as string | null) ?? null;
      if (args.length >= 3) originalString = (args[2] as string | null) ?? null;
    }
    if (version == null) {
      throw new ArgumentNullException('version');
    }
    this._version = SemanticVersion.normalizeVersionValue(version);
    this._specialVersion = specialVersion ?? '';
    this._originalString = isNullOrEmpty(originalString)
      ? version.toString() + (!isNullOrEmpty(specialVersion) ? '-' + specialVersion : '')
      : originalString;
  }

  /** The components of the original version string, padded to four. */
  getOriginalVersionComponents(): string[] {
    if (!isNullOrEmpty(this._originalString)) {
      const num = this._originalString.indexOf('-');
      const version = num === -1 ? this._originalString : this._originalString.substring(0, num);
      return SemanticVersion.splitAndPadVersionString(version);
    }
    return SemanticVersion.splitAndPadVersionString(this._version.toString());
  }

  private static splitAndPadVersionString(version: string): string[] {
    const array = version.split('.');
    if (array.length === 4) {
      return array;
    }
    const array2 = ['0', '0', '0', '0'];
    for (let i = 0; i < array.length; i++) array2[i] = array[i];
    return array2;
  }

  /** Parses the version; null if it is empty or invalid. */
  static parse(version: string | null): SemanticVersion | null {
    if (!isNullOrEmpty(version)) {
      const r = SemanticVersion.tryParse(version);
      if (r.result) {
        return r.value;
      }
      return null;
    }
    return null;
  }

  /** Tries to parse a version with 1 to 4 numbers (white space around the dots allowed). */
  static tryParse(version: string | null): { result: boolean; value: SemanticVersion | null } {
    const r = SemanticVersion.tryParseInternal(version, semanticVersionRegex);
    return { result: r.result, value: r.semVer };
  }

  /** Tries to parse a version with exactly 3 numbers. */
  static tryParseStrict(version: string | null): { result: boolean; value: SemanticVersion | null } {
    const r = SemanticVersion.tryParseInternal(version, strictSemanticVersionRegex);
    return { result: r.result, value: r.semVer };
  }

  private static tryParseInternal(version: string | null, regex: RegExp): { result: boolean; semVer: SemanticVersion | null } {
    if (isNullOrEmpty(version)) {
      return { result: false, semVer: null };
    }
    const match = regex.exec(trimWhiteSpace(version));
    const result = match === null ? null : Version.tryParse(match.groups?.['Version'] ?? '');
    if (match === null || result === null) {
      return { result: false, semVer: null };
    }
    const release = (match.groups?.['Release'] ?? '').replace(/^-+/, '');
    const semVer = new SemanticVersion(SemanticVersion.normalizeVersionValue(result), release, version.split(' ').join(''));
    return { result: true, semVer };
  }

  /** Parses the version; null if it is invalid. */
  static parseOptionalVersion(version: string | null): SemanticVersion | null {
    return SemanticVersion.tryParse(version).value;
  }

  private static normalizeVersionValue(version: Version): Version {
    return new Version(version.major, version.minor, Math.max(version.build, 0), Math.max(version.revision, 0));
  }

  /** CompareTo(object) and CompareTo(SemanticVersion): null is less; other types are greater. */
  compareTo(obj: unknown): number {
    if (obj == null) {
      return 1;
    }
    if (!(obj instanceof SemanticVersion)) {
      return -1;
    }
    const other = obj;
    const num = this._version.compareTo(other._version);
    if (num !== 0) {
      return num;
    }
    const flag = isNullOrEmpty(this._specialVersion);
    const flag2 = isNullOrEmpty(other._specialVersion);
    if (flag && flag2) {
      return 0;
    }
    if (flag) {
      return 1;
    }
    if (flag2) {
      return -1;
    }
    return compareOrdinalIgnoreCase(this._specialVersion, other._specialVersion);
  }

  /** operator == (instance equality: `equals(other)`). */
  static equals(version1: SemanticVersion | null, version2: SemanticVersion | null): boolean {
    return version1 != null ? version1.equals(version2) : version2 == null;
  }

  /** operator != */
  static notEquals(version1: SemanticVersion | null, version2: SemanticVersion | null): boolean {
    return !SemanticVersion.equals(version1, version2);
  }

  /** operator &lt; */
  static lessThan(version1: SemanticVersion | null, version2: SemanticVersion | null): boolean {
    if (!SemanticVersion.equals(version1, null)) {
      return version1!.compareTo(version2) < 0;
    }
    throw new ArgumentNullException('version1');
  }

  /** operator &lt;= */
  static lessThanOrEqual(version1: SemanticVersion | null, version2: SemanticVersion | null): boolean {
    if (!SemanticVersion.equals(version1, version2)) {
      return SemanticVersion.lessThan(version1, version2);
    }
    return true;
  }

  /** operator &gt; */
  static greaterThan(version1: SemanticVersion | null, version2: SemanticVersion | null): boolean {
    if (version1 == null) {
      throw new ArgumentNullException('version1');
    }
    return SemanticVersion.lessThan(version2, version1);
  }

  /** operator &gt;= */
  static greaterThanOrEqual(version1: SemanticVersion | null, version2: SemanticVersion | null): boolean {
    if (!SemanticVersion.equals(version1, version2)) {
      return SemanticVersion.greaterThan(version1, version2);
    }
    return true;
  }

  /** The original version string. */
  toString(): string {
    return this._originalString;
  }

  /** major.minor.build[.revision][-special]. */
  toNormalizedString(): string {
    if (this._normalizedVersionString === null) {
      let s = `${this._version.major}.${this._version.minor}.${Math.max(0, this._version.build)}`;
      if (this._version.revision > 0) {
        s += `.${this._version.revision}`;
      }
      if (!isNullOrEmpty(this._specialVersion)) {
        s += `-${this._specialVersion}`;
      }
      this._normalizedVersionString = s;
    }
    return this._normalizedVersionString;
  }

  /** Equal versions and special versions (ignoring case). */
  equals(other: unknown): boolean {
    if (other instanceof SemanticVersion && this._version.equals(other._version)) {
      return equalsOrdinalIgnoreCase(this._specialVersion, other._specialVersion);
    }
    return false;
  }

  /** Hash key (GetHashCode of C#: version and case-sensitive special version). */
  equalityKey(): string {
    return this._version.toString() + '-' + this._specialVersion;
  }
}
