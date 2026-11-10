// Port of Aml.Engine.Resources.Catalogue.SignedLibraryVersionExtensions (Aml.Engine.Resources 4.2.1).
// The (link, instance) tuples of GetLinks are objects { linkAddress, revision } (the names of the
// tuple elements of PublicLibraryCatalog.LibraryVersion.AllDownloadLinks).

import { T } from '../../registry.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { Enumerable, from } from '../../../system/linq.js';
import type { ISignedLibraryVersion } from './ISignedLibraryVersion.js';
import type { PublicLibraryCatalog_LibraryRevision, PublicLibraryCatalog_LibraryVersion } from './PublicLibraryCatalog.js';

/** A download link paired with the version or revision that defines it. */
export interface SignedLibraryVersionLink {
  linkAddress: string;
  revision: ISignedLibraryVersion;
}

/** Extension for classes, implementing ISignedLibraryVersion. */
export class SignedLibraryVersionExtensions {
  private constructor() {}

  /**
   * Adds a download link.
   * @param signedLibraryVersion The signed library version or revision.
   * @param linkAddress The link address for the download.
   */
  static addDownloadLink(signedLibraryVersion: ISignedLibraryVersion, linkAddress: string | null): void {
    if (!isNullOrEmpty(linkAddress)) {
      const list = signedLibraryVersion.downloadLinks ?? (signedLibraryVersion.downloadLinks = []);
      if (!list.includes(linkAddress)) {
        list.push(linkAddress);
      }
    }
  }

  /**
   * C# overloads AddRevision(string signature) and AddRevision(LibraryRevision revision).
   *
   * With a signature: adds a revision of the library version including a new signature. This
   * allows a library version to own multiple valid signatures due to the creation of version
   * references in an already signed library. With a revision object: adds the provided revision
   * to this library version.
   * @returns The added revision.
   */
  static addRevision(signedLibraryVersion: ISignedLibraryVersion, signatureOrRevision: string | PublicLibraryCatalog_LibraryRevision | null): ISignedLibraryVersion | null {
    if (signatureOrRevision instanceof T.PublicLibraryCatalog_LibraryRevision) {
      const revision = signatureOrRevision;
      const signedLibraryVersion2 = SignedLibraryVersionExtensions.lastRevision(signedLibraryVersion);
      signedLibraryVersion2.revision = revision;
      revision.revision = null;
      revision.relatedLibraryVersion = SignedLibraryVersionExtensions.relatedVersion(signedLibraryVersion);
      return signedLibraryVersion2.revision;
    }
    const signature = signatureOrRevision as string | null;
    const signedLibraryVersion2 = SignedLibraryVersionExtensions.lastRevision(signedLibraryVersion);
    const revision = new T.PublicLibraryCatalog_LibraryRevision();
    revision.signature = signature;
    revision.relatedLibraryVersion = SignedLibraryVersionExtensions.relatedVersion(signedLibraryVersion);
    signedLibraryVersion2.revision = revision;
    return signedLibraryVersion2.revision;
  }

  /**
   * `signedLibraryVersion is LibraryVersion lv ? lv : (signedLibraryVersion as LibraryRevision).RelatedLibraryVersion`:
   * for any other implementation the `as` cast gives null and the member access throws.
   */
  private static relatedVersion(signedLibraryVersion: ISignedLibraryVersion): PublicLibraryCatalog_LibraryVersion | null {
    if (signedLibraryVersion instanceof T.PublicLibraryCatalog_LibraryVersion) {
      return signedLibraryVersion;
    }
    const libraryRevision = signedLibraryVersion instanceof T.PublicLibraryCatalog_LibraryRevision ? signedLibraryVersion : null;
    return libraryRevision!.relatedLibraryVersion;
  }

  // Description, LibraryName, SetDescription and Version are extension methods: called for a
  // revision without related version (null), they return "" (nothing to set) instead of throwing.

  /**
   * Gets the description string of the signed library version.
   * @returns The description value.
   */
  static description(signedLibraryVersion: ISignedLibraryVersion | null): string | null {
    if (!(signedLibraryVersion instanceof T.PublicLibraryCatalog_LibraryVersion)) {
      if (!(signedLibraryVersion instanceof T.PublicLibraryCatalog_LibraryRevision)) {
        return '';
      }
      return SignedLibraryVersionExtensions.description(signedLibraryVersion.relatedLibraryVersion);
    }
    return signedLibraryVersion.description;
  }

  /**
   * Gets the name of the library for this version.
   * @returns The library name.
   */
  static libraryName(signedLibraryVersion: ISignedLibraryVersion | null): string | null {
    if (!(signedLibraryVersion instanceof T.PublicLibraryCatalog_LibraryVersion)) {
      if (!(signedLibraryVersion instanceof T.PublicLibraryCatalog_LibraryRevision)) {
        return '';
      }
      return SignedLibraryVersionExtensions.libraryName(signedLibraryVersion.relatedLibraryVersion);
    }
    return signedLibraryVersion.library!.name;
  }

  /**
   * Sets the description string of the signed library version.
   * @param signedLibraryVersion The library version element.
   * @param description The description.
   */
  static setDescription(signedLibraryVersion: ISignedLibraryVersion | null, description: string | null): void {
    if (signedLibraryVersion instanceof T.PublicLibraryCatalog_LibraryVersion) {
      signedLibraryVersion.description = description;
    }
    if (signedLibraryVersion instanceof T.PublicLibraryCatalog_LibraryRevision) {
      SignedLibraryVersionExtensions.setDescription(signedLibraryVersion.relatedLibraryVersion, description);
    }
  }

  /**
   * Gets the version string of the signed library version.
   * @returns The version string.
   */
  static version(signedLibraryVersion: ISignedLibraryVersion | null): string | null {
    if (!(signedLibraryVersion instanceof T.PublicLibraryCatalog_LibraryVersion)) {
      if (!(signedLibraryVersion instanceof T.PublicLibraryCatalog_LibraryRevision)) {
        return '';
      }
      return SignedLibraryVersionExtensions.version(signedLibraryVersion.relatedLibraryVersion);
    }
    return signedLibraryVersion.version;
  }

  /**
   * @internal Getting the download links arranged as a tuple of the link and the instance (lazy
   * over the list of links the instance has when this method is called).
   */
  static getLinks(signedLibraryVersion: ISignedLibraryVersion): Enumerable<SignedLibraryVersionLink> {
    const downloadLinks = signedLibraryVersion.downloadLinks;
    if (downloadLinks == null || !from(downloadLinks).any()) {
      return Enumerable.empty<SignedLibraryVersionLink>();
    }
    return from(signedLibraryVersion.downloadLinks!).select((l) => ({ linkAddress: l, revision: signedLibraryVersion }));
  }

  /**
   * @internal Transforms the value of the DownloadLink property to the DownloadLinks collection.
   * This method is called after deserialization.
   * @deprecated only used internal for version transformation
   */
  static transformLink(signedLibraryVersion: ISignedLibraryVersion): void {
    if (!isNullOrEmpty(signedLibraryVersion.downloadLink)) {
      SignedLibraryVersionExtensions.addDownloadLink(signedLibraryVersion, signedLibraryVersion.downloadLink);
      signedLibraryVersion.downloadLink = null;
    } else if (signedLibraryVersion.downloadLinks == null) {
      signedLibraryVersion.downloadLinks = [];
    }
  }

  private static lastRevision(signedLibraryVersion: ISignedLibraryVersion): ISignedLibraryVersion {
    if (signedLibraryVersion.revision != null) {
      return SignedLibraryVersionExtensions.lastRevision(signedLibraryVersion.revision);
    }
    return signedLibraryVersion;
  }
}
