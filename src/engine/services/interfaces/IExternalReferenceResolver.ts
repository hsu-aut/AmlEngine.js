// Port of Aml.Engine.Services.Interfaces.IExternalReferenceResolver (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { XElement } from '../../../xml/index.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { ExternalReferenceType } from '../../caex/ExternalReferenceType.js';
import type { IAMLService } from './IAMLService.js';

/** Service resolving external references (loading referenced documents). */
export interface IExternalReferenceResolver extends IAMLService {
  setRedirection(address: string, redirectAddress: string): void;
  /** C# overloads ClearRedirection(address) and ClearRedirection(). */
  clearRedirection(address?: string): void;
  isExternal(document: CAEXDocument, element: XElement): { result: boolean; alias: string | null; path: string | null };
  /** C# overloads LoadOrGetReferencedDocument(externalReference) and LoadOrGetReferencedDocument(document, path). */
  loadOrGetReferencedDocument(
    externalReferenceOrDocument: ExternalReferenceType | CAEXDocument,
    path?: string,
  ): { document: CAEXDocument | null; message: string | null };
  isExternalReferenceRegistered(externalReference: ExternalReferenceType, path: string): boolean;
  registerExternalDocument(externalReference: ExternalReferenceType, document: CAEXDocument, path: string): CAEXDocument | null;
  resolvedDocuments(documentWithExternals: CAEXDocument): Iterable<CAEXDocument>;
  resolveExternalDocument(url: string, useCache?: boolean): { document: CAEXDocument | null; message: string | null };
  registerResolverFunction(resolverFunction: (url: string) => CAEXDocument | null): void;
  canResolve(externalAddress: string): boolean;
  unloadDocument(url: string): void;
}

registerInterfaceBases('IExternalReferenceResolver', 'IAMLService');
