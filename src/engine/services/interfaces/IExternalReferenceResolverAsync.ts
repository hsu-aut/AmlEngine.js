// Port of Aml.Engine.Services.Interfaces.IExternalReferenceResolverAsync (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { ExternalReferenceType } from '../../caex/ExternalReferenceType.js';
import type { IAMLService } from './IAMLService.js';
import type { IExternalReferenceResolver } from './IExternalReferenceResolver.js';

/** Asynchronous variant of the external reference resolver. */
export interface IExternalReferenceResolverAsync extends IExternalReferenceResolver, IAMLService {
  canResolveAsync(externalAddress: string): Promise<boolean>;
  /** C# overloads LoadOrGetReferencedDocumentAsync(externalReference) and (document, path). */
  loadOrGetReferencedDocumentAsync(
    externalReferenceOrDocument: ExternalReferenceType | CAEXDocument,
    path?: string,
  ): Promise<{ document: CAEXDocument | null; message: string | null }>;
  resolveExternalDocumentAsync(url: string, useCache?: boolean): Promise<{ document: CAEXDocument | null; message: string | null }>;
}

registerInterfaceBases('IExternalReferenceResolverAsync', 'IExternalReferenceResolver', 'IAMLService');
