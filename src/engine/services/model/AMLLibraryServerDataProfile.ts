// Port of Aml.Engine.Services.Model.AMLLibraryServerDataProfile (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { registerInterfaces } from '../../interfaces.js';
import { ArgumentOutOfRangeException, IndexOutOfRangeException } from '../../../system/exceptions.js';
import { PasswordProtected } from './PasswordProtected.js';
import { AMLEditionEnum } from './AMLEditionEnum.js';
import type { ICredentials } from '../interfaces/ICredentials.js';

/**
 * Aml.Engine.Resources.Files.AMLFileContentType (assembly Aml.Engine.Resources, not ported):
 * LibraryFile = 0, LibraryCollectionFile = 1, ExampleFile = 2, LibraryCatalog = 3,
 * ClassRepository = 4, SignatureData = 5, BackupData = 6, None = 7.
 */
export type AMLFileContentType = number;

/** Number of values of AMLFileContentType (Enum.GetValues(typeof(AMLFileContentType)).Length). */
const AMLFileContentTypeCount = 8;

/** System.IO.Path.GetFileName with the Windows rules of .NET. */
export function pathGetFileName(path: string | null): string | null {
  if (path === null || path === undefined) return null;
  const root = path.length >= 2 && path[1] === ':' && /[A-Za-z]/.test(path[0]) ? 2 : 0;
  for (let i = path.length; --i >= 0; ) {
    if (i < root || path[i] === '\\' || path[i] === '/') {
      return path.substring(i + 1);
    }
  }
  return path;
}

/** The data (folder, edition, credentials) of one content type on a library server. */
export class AMLLibraryServerDataProfile extends PasswordProtected implements ICredentials {
  static readonly BACKUPFOLDER = 'Backups';

  static readonly CATALOGUEFOLDER = 'Catalogue';

  static readonly COLLECTIONFOLDER = 'Collections';

  static readonly EXAMPLEFOLDER = 'Examples';

  static readonly LIBFOLDER = 'Libraries';

  static readonly SIGNFOLDER = 'Keys';

  /** The AutomationML edition of the data (AllEditions by default). */
  automationMLEdition: AMLEditionEnum;

  /** The content type. */
  contentType: AMLFileContentType = 0;

  /** The folder on the server. */
  folder: string | null = null;

  /** True for the user name "anonymous". Not serialized. */
  get isAnonymous(): boolean {
    return this.userName === 'anonymous';
  }

  /** The user name (overrides the one of the server profile if set). */
  userName: string | null = null;

  /** The branch or tag (GitHub). */
  branchOrTag: string | null = null;

  /** C# constructors () and (AMLFileContentType contentType). */
  constructor(contentType?: AMLFileContentType) {
    super();
    this.automationMLEdition = AMLEditionEnum.AllEditions;
    if (contentType === undefined) {
      return;
    }
    let folder: string | null;
    switch (contentType) {
      case 0:
        folder = 'Libraries';
        break;
      case 1:
        folder = 'Collections';
        break;
      case 2:
        folder = 'Examples';
        break;
      case 3:
      case 4:
        folder = 'Catalogue';
        break;
      case 5:
        folder = 'Keys';
        break;
      case 6:
        folder = 'Backups';
        break;
      default:
        folder = this.folder;
        break;
    }
    this.folder = folder;
    this.contentType = contentType;
  }

  /** The file name of a backup: the name prefixed with "_{contentType}_" (unless already prefixed). */
  static backupFileName(fileName: string, contentType: AMLFileContentType): string {
    const value = Number.isInteger(contentType) && contentType >= 0 && contentType < AMLFileContentTypeCount ? contentType : -1;
    if (!fileName.startsWith(`_${value}_`)) {
      return `_${value}_${fileName}`;
    }
    return fileName;
  }

  /** The content type and original name of a backup file name. */
  static backupFileType(fileName: string): { result: AMLFileContentType; originalName: string } {
    let originalName = fileName;
    if (fileName.length < 2) {
      throw new IndexOutOfRangeException();
    }
    const c = fileName[1];
    if (!(c >= '0' && c <= '9')) {
      return { result: 7, originalName };
    }
    const result = c.charCodeAt(0) - 48;
    if (fileName.length < 3) {
      throw new ArgumentOutOfRangeException('startIndex');
    }
    originalName = fileName.substring(3);
    if (result >= AMLFileContentTypeCount) {
      throw new IndexOutOfRangeException();
    }
    return { result, originalName };
  }

  /** The content type of the file (from the backup name for backup data). */
  contentTypeFromFile(filePath: string): AMLFileContentType {
    if (this.contentType === 6) {
      return AMLLibraryServerDataProfile.backupFileType(pathGetFileName(filePath)!).result;
    }
    return this.contentType;
  }

  /** Checks whether the data supports the edition. */
  supportsEdition(edition: AMLEditionEnum): boolean {
    if (this.automationMLEdition !== AMLEditionEnum.AllEditions) {
      return this.automationMLEdition === edition;
    }
    return true;
  }

  /** @internal JSON properties in System.Text.Json order (derived class first, then PasswordProtected). */
  toJsonObject(): Record<string, unknown> {
    return {
      AutomationMLEdition: this.automationMLEdition,
      ContentType: this.contentType,
      Folder: this.folder,
      UserName: this.userName,
      BranchOrTag: this.branchOrTag,
      PasswordHash: this.passwordHash,
    };
  }
}

T.AMLLibraryServerDataProfile = AMLLibraryServerDataProfile;
registerInterfaces(AMLLibraryServerDataProfile, 'ICredentials');
