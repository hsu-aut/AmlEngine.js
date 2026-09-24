// System.Version (.NET 8) as far as the AmlObjects namespace uses it: Parse, TryParse, the string
// constructor, comparison and ToString (helper, no C# counterpart in Aml.Engine).

import { ArgumentException, ArgumentNullException, ArgumentOutOfRangeException, FormatException, OverflowException } from '../../../system/exceptions.js';

// NumberStyles.Integer: leading/trailing white space (U+0009..U+000D, U+0020) and a leading sign.
const INTEGER = /^[\t\n\v\f\r ]*([+-]?)([0-9]+)[\t\n\v\f\r ]*$/;

/** int.Parse(s, NumberStyles.Integer, CultureInfo.InvariantCulture), or `null` when failing silently. */
function parseInt32(s: string, throwOnFailure: boolean): number | null {
  const m = INTEGER.exec(s);
  if (m === null) {
    if (throwOnFailure) throw new FormatException(`The input string '${s}' was not in a correct format.`);
    return null;
  }
  const digits = m[2]!.replace(/^0+(?=.)/, '');
  const value = Number((m[1] === '-' ? '-' : '') + digits);
  if (digits.length > 10 || value > 2147483647 || value < -2147483648) {
    if (throwOnFailure) throw new OverflowException('Value was either too large or too small for an Int32.');
    return null;
  }
  return value === 0 ? 0 : value;
}

/** The version number of an assembly, an operating system or the common language runtime. */
export class Version {
  /** The major component. */
  readonly major: number;

  /** The minor component. */
  readonly minor: number;

  /** The build component (-1 if undefined). */
  readonly build: number;

  /** The revision component (-1 if undefined). */
  readonly revision: number;

  /** `new Version(string)` (= Version.Parse), or `new Version(major, minor, build?, revision?)`. */
  constructor(version: string);
  constructor(major: number, minor: number, build?: number, revision?: number);
  constructor(arg0: string | number, minor?: number, build = -1, revision = -1) {
    if (typeof arg0 === 'string' || arg0 === null) {
      const v = Version.parse(arg0);
      this.major = v.major;
      this.minor = v.minor;
      this.build = v.build;
      this.revision = v.revision;
      return;
    }
    this.major = arg0;
    this.minor = minor!;
    this.build = build;
    this.revision = revision;
  }

  /** Version.Parse: throws ArgumentNullException, ArgumentException, ArgumentOutOfRangeException, FormatException or OverflowException. */
  static parse(input: string | null): Version {
    if (input == null) throw new ArgumentNullException('input');
    return Version.parseVersion(input, true)!;
  }

  /** Version.TryParse: the version, or `null`. */
  static tryParse(input: string | null): Version | null {
    if (input == null) return null;
    return Version.parseVersion(input, false);
  }

  private static parseVersion(input: string, throwOnFailure: boolean): Version | null {
    const majorEnd = input.indexOf('.');
    if (majorEnd < 0) {
      if (throwOnFailure) throw new ArgumentException('Version string portion was too short or too long.', 'input');
      return null;
    }
    let minorEnd = input.indexOf('.', majorEnd + 1);
    let buildEnd = -1;
    if (minorEnd >= 0) {
      buildEnd = input.indexOf('.', minorEnd + 1);
      if (buildEnd >= 0) {
        if (input.indexOf('.', buildEnd + 1) >= 0) {
          if (throwOnFailure) throw new ArgumentException('Version string portion was too short or too long.', 'input');
          return null;
        }
      }
    }
    const component = (s: string): number | null => {
      const v = parseInt32(s, throwOnFailure);
      if (v === null) return null;
      if (v < 0) {
        if (throwOnFailure) throw new ArgumentOutOfRangeException('input', "Version's parameters must be greater than or equal to zero.");
        return null;
      }
      return v;
    };
    const major = component(input.substring(0, majorEnd));
    if (major === null) return null;
    if (minorEnd < 0) minorEnd = input.length;
    const minor = component(input.substring(majorEnd + 1, minorEnd));
    if (minor === null) return null;
    if (minorEnd === input.length) return new Version(major, minor);
    const bEnd = buildEnd >= 0 ? buildEnd : input.length;
    const build = component(input.substring(minorEnd + 1, bEnd));
    if (build === null) return null;
    if (buildEnd < 0) return new Version(major, minor, build);
    const revision = component(input.substring(buildEnd + 1));
    if (revision === null) return null;
    return new Version(major, minor, build, revision);
  }

  /** Version.CompareTo(Version): null is less than any version. */
  compareTo(value: Version | null): number {
    if (value === this) return 0;
    if (value == null) return 1;
    if (this.major !== value.major) return this.major > value.major ? 1 : -1;
    if (this.minor !== value.minor) return this.minor > value.minor ? 1 : -1;
    if (this.build !== value.build) return this.build > value.build ? 1 : -1;
    if (this.revision !== value.revision) return this.revision > value.revision ? 1 : -1;
    return 0;
  }

  /** C# `v1 > v2` (null-safe). */
  static greaterThan(v1: Version | null, v2: Version | null): boolean {
    return Version.lessThan(v2, v1);
  }

  /** C# `v1 < v2` (null-safe). */
  static lessThan(v1: Version | null, v2: Version | null): boolean {
    if (v1 == null) return v2 != null;
    return v1.compareTo(v2) < 0;
  }

  /** C# `v1 <= v2` (null-safe). */
  static lessThanOrEqual(v1: Version | null, v2: Version | null): boolean {
    if (v1 == null) return true;
    return v1.compareTo(v2) <= 0;
  }

  /** Equality of the components. */
  equals(obj: unknown): boolean {
    return obj instanceof Version && this.compareTo(obj) === 0;
  }

  /** Key for hashing (see src/system/linq.ts). */
  equalityKey(): string {
    return this.toString();
  }

  /** "major.minor[.build[.revision]]". */
  toString(): string {
    let s = `${this.major}.${this.minor}`;
    if (this.build === -1) return s;
    s += `.${this.build}`;
    if (this.revision === -1) return s;
    return s + `.${this.revision}`;
  }
}
