// Port of Aml.Engine.Services.Interfaces.IGitHubAccessService (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { ExternalReferenceType } from '../../caex/ExternalReferenceType.js';
import type { IAMLService } from './IAMLService.js';

/** Service giving access to documents in GitHub repositories. */
export interface IGitHubAccessService extends IAMLService {
  register(userName: string, repositoryName: string, accessToken: string): void;
  unregister(userName: string, accessToken: string): void;
  isGitHubPath(fileRef: string): boolean;
  loadOrGetReferencedDocumentAsync(fileRef: string, connect?: boolean): Promise<{ document: CAEXDocument | null; message: string | null }>;
  /** System.Net.Http.HttpResponseMessage is represented by the fetch Response. */
  getResponseFromGitServerAsync(url: string): Promise<Response | null>;
  /** @deprecated ExternalDocuments are cached in the ExternalReferenceResolver. */
  registerExternalDocument(externalReference: ExternalReferenceType, document: CAEXDocument, path: string): void;
  /** @deprecated ExternalDocuments are cached in the ExternalReferenceResolver. */
  unregisterExternalDocument(document: CAEXDocument, path: string): void;
}

registerInterfaceBases('IGitHubAccessService', 'IAMLService');
