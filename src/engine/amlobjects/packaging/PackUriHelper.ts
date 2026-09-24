// Port of the part of System.IO.Packaging.PackUriHelper (System.IO.Packaging 10.0.3) that the
// package implementation uses: part URI validation (ValidatedPartUri), relationship part names
// and the resolution of relationship targets. The pack:// URI functions are not ported.
//
// .NET validates a part URI by round-tripping it through System.Uri (SafeUnescaped and UriEscaped
// forms, combination with "http://defaultcontainer/"); these steps are reproduced on the string:
// a part name is valid when it starts with '/', does not start with "//", does not end with '/',
// has no fragment, contains only unreserved, reserved and percent-encoded characters, does not
// percent-encode an unreserved character, has no "." or ".." segment and no query, and is no
// piece name ("/[n].piece", "/[n].last.piece"). The results agree with .NET for all cases listed
// in docs/port-notes/7-amlobjects.md.

import { ArgumentException, ArgumentNullException } from '../../../system/exceptions.js';
import { Uri, UriKind } from '../../../system/index.js';

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;
const RESERVED_OR_UNRESERVED = /^[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=]$/;

/** A validated part URI (PackUriHelper.ValidatedPartUri). */
export class ValidatedPartUri extends Uri {
  private readonly _partUriString: string;
  private _normalizedPartUriString: string | null = null;
  private _partUriExtension: string | null = null;
  private readonly _isRelationshipPartUri: boolean;

  /** @internal Creates the URI for a validated part name. */
  constructor(partUriString: string, isRelationshipUri?: boolean) {
    super(partUriString, UriKind.Relative);
    this._partUriString = partUriString;
    this._isRelationshipPartUri = isRelationshipUri ?? this.isRelationshipUri();
  }

  /** The part name. */
  get partUriString(): string {
    return this._partUriString;
  }

  /** The extension of the part name without '.', or ''. */
  get partUriExtension(): string {
    if (this._partUriExtension == null) {
      let text = getExtension(this._partUriString);
      if (text.length > 0) text = text.substring(1);
      this._partUriExtension = text;
    }
    return this._partUriExtension;
  }

  /** The part name in upper case (the key for comparisons). */
  get normalizedPartUriString(): string {
    return (this._normalizedPartUriString ??= this._partUriString.toUpperCase());
  }

  /** Whether the part is a relationship part. */
  get isRelationshipPartUri(): boolean {
    return this._isRelationshipPartUri;
  }

  /** Ordinal comparison of the normalized part names (IComparable). */
  compareTo(other: ValidatedPartUri | null): number {
    if (other == null) return 1;
    const a = this.normalizedPartUriString;
    const b = other.normalizedPartUriString;
    return a < b ? -1 : a > b ? 1 : 0;
  }

  private isRelationshipUri(): boolean {
    let flag = false;
    const n = this.normalizedPartUriString;
    if (!n.endsWith('.RELS')) {
      return false;
    }
    if (n === '/_RELS/.RELS') {
      return true;
    }
    const array = n.split('/');
    if (array.length >= 3 && array[array.length - 1]!.length > '.rels'.length) {
      flag = array[array.length - 2] === '_RELS';
    }
    if (array.length > 3 && flag && array[array.length - 1]!.endsWith('.RELS.RELS') && array[array.length - 3] === '_RELS') {
      throw new ArgumentException('PackageRelationship part URI syntax is not valid.');
    }
    return flag;
  }
}

/** Path.GetExtension on a part name ('' if none). */
function getExtension(path: string): string {
  for (let i = path.length - 1; i >= 0; i--) {
    const ch = path[i]!;
    if (ch === '.') return i !== path.length - 1 ? path.substring(i) : '';
    if (ch === '/' || ch === '\\') break;
  }
  return '';
}

/** The string of a relative URI after SafeUnescaped and UriEscaped, and whether it changed. */
function escapedForm(original: string): string {
  let s = '';
  let i = 0;
  while (i < original.length) {
    const ch = original[i]!;
    if (ch === '%' && /^[0-9A-Fa-f]{2}$/.test(original.substring(i + 1, i + 3))) {
      const code = parseInt(original.substring(i + 1, i + 3), 16);
      const decoded = String.fromCharCode(code);
      s += code < 0x80 && UNRESERVED.test(decoded) ? decoded : original.substring(i, i + 3);
      i += 3;
      continue;
    }
    const cp = original.codePointAt(i)!;
    const c = String.fromCodePoint(cp);
    if (cp < 0x80 && RESERVED_OR_UNRESERVED.test(c)) {
      s += c;
    } else if (c === '\\') {
      s += '/';
    } else {
      for (const b of new TextEncoder().encode(c)) s += '%' + b.toString(16).toUpperCase().padStart(2, '0');
    }
    i += c.length;
  }
  return s;
}

/** The path of "http://defaultcontainer/" combined with the part name (query removed, dot segments resolved). */
function httpPath(s: string): string {
  const q = s.indexOf('?');
  const path = q >= 0 ? s.substring(0, q) : s;
  return removeDotSegments(path);
}

/** RFC 3986 remove_dot_segments. */
function removeDotSegments(path: string): string {
  const input = path.split('/');
  const out: string[] = [];
  for (let i = 0; i < input.length; i++) {
    const seg = input[i]!;
    if (seg === '.') {
      if (i === input.length - 1) out.push('');
      continue;
    }
    if (seg === '..') {
      if (out.length > 1) out.pop();
      if (i === input.length - 1) out.push('');
      continue;
    }
    out.push(seg);
  }
  return out.join('/');
}

const PIECE = /\/\[(0|[1-9][0-9]*)\](\.last)?\.piece$/i;

/** GetExceptionIfPartUriInvalid: the error, or the part name. */
function partUriStringOrError(partUri: Uri): { error: Error | null; partUriString: string } {
  if (partUri.isAbsoluteUri) {
    return { error: new ArgumentException('Cannot be an absolute URI.'), partUriString: '' };
  }
  const original = partUri.originalString;
  const s = escapedForm(original);
  if (s.length === 0 || s === '/') {
    return { error: new ArgumentException('Part URI is empty.'), partUriString: '' };
  }
  if (s[0] !== '/') {
    return { error: new ArgumentException('Part URI must start with a forward slash.'), partUriString: '' };
  }
  if (s.length > 1 && s[1] === '/') {
    return { error: new ArgumentException('Part URI cannot start with two forward slashes.'), partUriString: '' };
  }
  if (s[s.length - 1] === '/') {
    return { error: new ArgumentException('Part URI cannot end with a forward slash.'), partUriString: '' };
  }
  if (s.includes('#')) {
    return { error: new ArgumentException('Part URI cannot contain a Fragment component.'), partUriString: '' };
  }
  if (original.toUpperCase() !== httpPath(s).toUpperCase()) {
    return { error: new ArgumentException('Part URI is not valid per rules defined in the Open Packaging Conventions specification.'), partUriString: '' };
  }
  if (PIECE.test(s)) {
    return { error: new ArgumentException('Provided URI is a part piece URI, not a part URI.'), partUriString: '' };
  }
  return { error: null, partUriString: s };
}

/** The root of the package ("/"). */
export const packageRootUri = new Uri('/', UriKind.Relative);

/** The name of the package relationship part. */
export const containerRelationshipPartName = new ValidatedPartUri('/_rels/.rels', true);

/** The functions of System.IO.Packaging.PackUriHelper used by the package. */
export class PackUriHelper {
  private constructor() {}

  /** PackUriHelper.PackageRootUri. */
  static get packageRootUri(): Uri {
    return packageRootUri;
  }

  /** ValidatePartUri: the validated part URI, or ArgumentException. */
  static validatePartUri(partUri: Uri): ValidatedPartUri {
    if (partUri instanceof ValidatedPartUri) return partUri;
    const r = partUriStringOrError(partUri);
    if (r.error != null) throw r.error;
    return new ValidatedPartUri(r.partUriString);
  }

  /** TryValidatePartUri: the validated part URI, or `null`. */
  static tryValidatePartUri(partUri: Uri): ValidatedPartUri | null {
    if (partUri instanceof ValidatedPartUri) return partUri;
    const r = partUriStringOrError(partUri);
    return r.error != null ? null : new ValidatedPartUri(r.partUriString);
  }

  /** Whether the part URI is the URI of a relationship part. */
  static isRelationshipPartUri(partUri: Uri | null): boolean {
    if (partUri == null) throw new ArgumentNullException('partUri');
    return PackUriHelper.validatePartUri(partUri).isRelationshipPartUri;
  }

  /** ComparePartUri for two part URIs (validated). */
  static comparePartUri(first: Uri, second: Uri): number {
    return PackUriHelper.validatePartUri(first).compareTo(PackUriHelper.validatePartUri(second));
  }

  /** The URI of the relationship part of the part ("/_rels/.rels" for the package root). */
  static getRelationshipPartUri(partUri: Uri | null): ValidatedPartUri {
    if (partUri == null) throw new ArgumentNullException('partUri');
    if (partUri.originalString === '/') {
      return containerRelationshipPartName;
    }
    const validated = PackUriHelper.validatePartUri(partUri);
    if (validated.isRelationshipPartUri) {
      throw new ArgumentException('PackageRelationship part URI is not expected.');
    }
    let partUriString = validated.partUriString;
    const slash = Math.max(partUriString.lastIndexOf('/'), partUriString.lastIndexOf('\\'));
    const fileName = partUriString.substring(slash + 1);
    partUriString = partUriString.substring(0, partUriString.length - fileName.length);
    partUriString = (partUriString + '_rels/' + fileName).replaceAll('\\', '/') + '.rels';
    return new ValidatedPartUri(partUriString, true);
  }

  /** The URI of the source part of the relationship part ("/" for the package relationship part). */
  static getSourcePartUriFromRelationshipPartUri(relationshipPartUri: Uri | null): Uri {
    if (relationshipPartUri == null) throw new ArgumentNullException('relationshipPartUri');
    const validated = PackUriHelper.validatePartUri(relationshipPartUri);
    if (!validated.isRelationshipPartUri) {
      throw new ArgumentException('PackageRelationship part URI is expected.');
    }
    if (validated.compareTo(containerRelationshipPartName) === 0) {
      return packageRootUri;
    }
    let partUriString = validated.partUriString;
    const slash = partUriString.lastIndexOf('/');
    const fileName = partUriString.substring(slash + 1);
    const dot = fileName.lastIndexOf('.');
    const fileNameWithoutExtension = dot >= 0 ? fileName.substring(0, dot) : fileName;
    partUriString = partUriString.substring(0, partUriString.length - fileNameWithoutExtension.length - '.rels'.length - 1);
    partUriString = partUriString.substring(0, partUriString.length - '_rels'.length);
    partUriString = partUriString + fileNameWithoutExtension;
    return new ValidatedPartUri(partUriString, false);
  }

  /**
   * ResolvePartUri: the absolute path of the target resolved against the source part (relative
   * to "http://defaultcontainer/").
   * @throws ArgumentException a URI is absolute.
   */
  static resolvePartUri(sourcePartUri: Uri | null, targetUri: Uri | null): Uri {
    if (sourcePartUri == null) throw new ArgumentNullException('sourcePartUri');
    if (targetUri == null) throw new ArgumentNullException('targetUri');
    if (sourcePartUri.isAbsoluteUri || targetUri.isAbsoluteUri) {
      throw new ArgumentException('Cannot be an absolute URI.');
    }
    const basePath = sourcePartUri.equals(packageRootUri) ? '/' : PackUriHelper.validatePartUri(sourcePartUri).partUriString;
    let t = targetUri.originalString.replaceAll('\\', '/');
    const hash = t.indexOf('#');
    if (hash >= 0) t = t.substring(0, hash);
    const q = t.indexOf('?');
    if (q >= 0) t = t.substring(0, q);
    let path: string;
    if (t.startsWith('/')) {
      path = t;
    } else if (t.length === 0) {
      path = basePath;
    } else {
      path = basePath.substring(0, basePath.lastIndexOf('/') + 1) + t;
    }
    path = removeDotSegments(escapedPath(path));
    return new Uri(path, UriKind.Relative);
  }
}

/** Escapes the characters an http path does not keep literally (space, non-ASCII, ...). */
function escapedPath(path: string): string {
  let s = '';
  for (const c of path) {
    if (c === '%' || (c.codePointAt(0)! < 0x80 && RESERVED_OR_UNRESERVED.test(c))) {
      s += c;
    } else {
      for (const b of new TextEncoder().encode(c)) s += '%' + b.toString(16).toUpperCase().padStart(2, '0');
    }
  }
  return s;
}
