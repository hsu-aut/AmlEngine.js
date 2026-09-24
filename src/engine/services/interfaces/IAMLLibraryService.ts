// Port of Aml.Engine.Services.Interfaces.IAMLLibraryService (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { IAMLFile } from '../../amlobjects/IAMLFile.js';
import type { ClassRepositoryEnum } from '../../resources/catalogue/ClassRepositoryEnum.js';
import type { AMLLibraryServerDataProfile } from '../model/AMLLibraryServerDataProfile.js';
import type { AMLLibraryServerProfile } from '../model/AMLLibraryServerProfile.js';
import type { IAMLService } from './IAMLService.js';
import type { IClassRepository } from './IClassRepository.js';

/** Aml.Engine.Resources.Files.AMLFileMetaModel (assembly Aml.Engine.Resources, not ported). */
export type AMLFileMetaModel = unknown;
/** Aml.Engine.Resources.Catalogue.PublicLibraryCatalog (assembly Aml.Engine.Resources, not ported). */
export type PublicLibraryCatalog = unknown;

/** Service giving access to an AutomationML library server. */
export interface IAMLLibraryService extends IAMLService {
  readonly serverProfile: AMLLibraryServerProfile | null;
  readonly responseMessage: string | null;
  registerServerProfileAsync(server: AMLLibraryServerProfile): Promise<boolean>;
  loadAMLFileAsync(fileModel: AMLFileMetaModel): Promise<IAMLFile | null>;
  getDocumentsAsync(data: AMLLibraryServerDataProfile): Promise<AMLFileMetaModel[]>;
  uploadAMLDocumentAsync(
    data: AMLLibraryServerDataProfile,
    amlDocument: CAEXDocument,
    replace: boolean,
  ): Promise<{ success: boolean; description: string | null }>;
  loadLibraryCatalogAsync(data: AMLLibraryServerDataProfile): Promise<PublicLibraryCatalog | null>;
  /** C# overloads GetStreamAsync(data, filename) and GetStreamAsync(url); the stream is returned as bytes. */
  getStreamAsync(dataOrUrl: AMLLibraryServerDataProfile | string, filename?: string): Promise<Uint8Array | null>;
  deleteAsync(data: AMLLibraryServerDataProfile, fileName: string, backup: boolean): Promise<{ isSuccessful: boolean; description: string | null }>;
  restoreAsync(data: AMLLibraryServerDataProfile, fileName: string): Promise<{ isSuccessful: boolean; description: string | null }>;
  putStreamAsync(
    data: AMLLibraryServerDataProfile,
    fileName: string,
    fileStream: Uint8Array,
    exchange?: boolean,
  ): Promise<{ isSuccessful: boolean; description: string | null }>;
  checkDataConnection(data: AMLLibraryServerDataProfile): Promise<{ success: boolean; description: string | null }>;
  loadClassRepositoryAsync(data: AMLLibraryServerDataProfile, repositoryType: ClassRepositoryEnum): Promise<IClassRepository | null>;
  fileUri(data: AMLLibraryServerDataProfile, fileName: string): string | null;
  fileExistsAsync(filePath: string): Promise<boolean>;
}

registerInterfaceBases('IAMLLibraryService', 'IAMLService');
