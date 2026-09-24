// Port of Aml.Engine.CAEX.ExternalReferenceType.

import type { XElement } from '../../xml/index.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../system/strings.js';
import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { CAEXBasicObject } from './CAEXBasicObject.js';
import type { CAEXDocument } from './CAEXDocument.js';

/** System.Exception (no dedicated class in src/system). */
function exception(message: string): Error {
  const e = new Error(message);
  e.name = 'Exception';
  return e;
}

/**
 * Uri.UnescapeDataString: decodes %XX escapes (UTF-8 byte sequences); escapes that do not form
 * valid UTF-8 are left as they are.
 */
function unescapeDataString(s: string): string {
  if (!s.includes('%')) return s;
  const out: string[] = [];
  let i = 0;
  const hex = (c: string): number => parseInt(c, 16);
  const isHex = (c: string | undefined): boolean => c !== undefined && /^[0-9A-Fa-f]$/.test(c);
  while (i < s.length) {
    if (s[i] === '%' && isHex(s[i + 1]) && isHex(s[i + 2])) {
      const b0 = hex(s.substring(i + 1, i + 3));
      if (b0 < 0x80) {
        out.push(String.fromCharCode(b0));
        i += 3;
        continue;
      }
      const len = b0 >= 0xf0 && b0 <= 0xf4 ? 4 : b0 >= 0xe0 ? 3 : b0 >= 0xc2 && b0 < 0xe0 ? 2 : 0;
      if (len > 0) {
        const bytes = [b0];
        let j = i + 3;
        for (let k = 1; k < len; k++) {
          if (s[j] === '%' && isHex(s[j + 1]) && isHex(s[j + 2])) {
            const b = hex(s.substring(j + 1, j + 3));
            if ((b & 0xc0) !== 0x80) break;
            bytes.push(b);
            j += 3;
          } else break;
        }
        if (bytes.length === len) {
          try {
            out.push(new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)));
            i = j;
            continue;
          } catch {
            // invalid sequence: keep the escape
          }
        }
      }
      out.push(s.substring(i, i + 3));
      i += 3;
      continue;
    }
    out.push(s[i]);
    i++;
  }
  return out.join('');
}

/**
 * Wrapper for the CAEX element 'ExternalReference', a container element for the alias
 * definition of external CAEX files.
 */
export class ExternalReferenceType extends CAEXBasicObject {
  /** Description string to identify an ExternalReference as a version reference. */
  static readonly VERSIONREFERENCE = 'VersionRef';

  /** Version string to identify an ExternalReference as an extension reference. */
  static readonly EXTENSIONVERSION = 'Extension';

  private static readonly VERSIONREFERENCE_OLD = 'Version Reference';

  private _cachedExternalDocument: { document: CAEXDocument | null; path: string | null } = { document: null, path: null };

  /** Determines, if the external reference is an extension reference. */
  get isExtensionReference(): boolean {
    return this.version === 'Extension';
  }

  /** Determines, if the external reference is a version reference. */
  get isVersionReference(): boolean {
    const version = this.version;
    let flag2 = version === 'OldVersion' || version === 'NewVersion';
    if (!flag2) {
      const description = this.description;
      flag2 = description === 'VersionRef' || description === ExternalReferenceType.VERSIONREFERENCE_OLD;
    }
    return flag2;
  }

  /** Determines, if the external reference is a version reference to a new version. */
  get isNewVersionReference(): boolean {
    if (this.isVersionReference) {
      return this.version === 'NewVersion';
    }
    return false;
  }

  /** Determines, if the external reference is a version reference to an old version. */
  get isOldVersionReference(): boolean {
    if (this.isVersionReference) {
      return this.version === 'OldVersion';
    }
    return false;
  }

  /** Gets and sets the alias name of the external CAEX file. */
  get alias(): string | null {
    return this.getXAttributeValue('Alias');
  }

  set alias(value: string | null) {
    if (!(this.alias === value)) {
      this.setXAttributeValue('Alias', value);
      this.raisePropertyChanged('Alias');
    }
  }

  /**
   * Gets the external document referenced by this instance, if an external reference resolver
   * service is registered; otherwise null.
   */
  get externalDocument(): CAEXDocument | null {
    if (!T.CAEXWrapper.equals(this._cachedExternalDocument.document?.caexFile ?? null, null) && this.pathAreEqual(this._cachedExternalDocument.path)) {
      return this._cachedExternalDocument.document;
    }
    if ((ServiceLocator.externalReferenceResolverService ?? null) === null) {
      return null;
    }
    this._cachedExternalDocument = {
      document: ServiceLocator.externalReferenceResolverService!.loadOrGetReferencedDocument(this).document ?? null,
      path: this.path,
    };
    return this._cachedExternalDocument.document;
  }

  /** Gets and sets the path of the external CAEX file (absolute or relative). */
  get path(): string | null {
    return this.getXAttributeValue('Path');
  }

  set path(value: string | null) {
    if (!(this.path === value)) {
      this.setXAttributeValue('Path', value);
      this._cachedExternalDocument = { document: null, path: null };
      this.raisePropertyChanged('Path');
    }
  }

  /** @internal The constructor function for this type. */
  static get Constructor(): (n: XElement) => ExternalReferenceType {
    return (n) => new ExternalReferenceType(n);
  }

  /** Initializes a new instance for an 'ExternalReference' XML node. */
  constructor(externalReferenceNode: XElement | null) {
    super(externalReferenceNode);
  }

  /** Defines this external reference a version reference (and sets the version, if provided). */
  makeVersionReference(version: string | null = null): void {
    this.description = 'VersionRef';
    if (version !== null) {
      this.version = version;
    }
  }

  /** Defines this external reference an extension reference. */
  makeExtensionReference(): void {
    this.version = 'Extension';
  }

  /**
   * Instance overload: determines, if the path is equal to the Path value (compared as unescaped
   * data strings). The static overload pathAreEqual(path1, path2) compares two paths.
   */
  pathAreEqual(path: string | null): boolean {
    return ExternalReferenceType.pathAreEqual(path, this.path);
  }

  /** Determines, if path1 is equal to path2 (compared as unescaped data strings). */
  static pathAreEqual(path1: string | null, path2: string | null): boolean {
    if (path1 === path2) {
      return true;
    }
    if (!isNullOrWhiteSpace(path1) && !isNullOrEmpty(path2)) {
      return unescapeDataString(path1!) === unescapeDataString(path2);
    }
    return false;
  }

  /** Inserts the provided CAEX object as a new sibling after this CAEX object. */
  insertAfter(caexObject: ExternalReferenceType | null): void {
    if (T.CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw exception('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, true);
  }

  /** Inserts the provided CAEX object as a new sibling before this CAEX object. */
  insertBefore(caexObject: ExternalReferenceType | null): void {
    if (T.CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw exception('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, false);
  }
}

registerInterfaces(ExternalReferenceType, 'IMultipleOccurrences', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
T.ExternalReferenceType = ExternalReferenceType;
