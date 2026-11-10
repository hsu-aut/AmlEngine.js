// Port of Aml.Engine.Resources.Catalogue.ISignedLibraryVersion (Aml.Engine.Resources 4.2.1).

import type { PublicLibraryCatalog_LibraryRevision } from './PublicLibraryCatalog.js';

/** Interface defining properties of LibraryVersions. */
export interface ISignedLibraryVersion {
  /**
   * Gets and sets the download link where to load the library. The link should be publicly available.
   * @deprecated Links are saved in the DownloadLinks Collection
   */
  downloadLink: string | null;

  /**
   * Gets and sets the download links where to load the library. The links should be publicly
   * available. This collection replaces the old DownloadLink property. The Collection is used to
   * support alternative download locations.
   */
  downloadLinks: string[] | null;

  /** A revision of this version exists, using the same version number. */
  revision: PublicLibraryCatalog_LibraryRevision | null;

  /** The signature string. */
  signature: string | null;
}
