// Port of Aml.Engine.Services.Interfaces.IMerge (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { ExternalReferenceType } from '../../caex/ExternalReferenceType.js';
import type { IAMLService } from './IAMLService.js';

/** Service merging externally referenced documents into a document. */
export interface IMerge extends IAMLService {
  /**
   * C# overloads Merge(document, externalReference, out mergeProtocol, autoTransform) and
   * Merge(document, externalReference, externalSource, out mergeProtocol, autoTransform); the
   * source stream is passed as bytes.
   */
  merge(
    document: CAEXDocument,
    externalReference: ExternalReferenceType,
    externalSourceOrAutoTransform?: Uint8Array | boolean,
    autoTransform?: boolean,
  ): { result: boolean; mergeProtocol: string[] };
}

registerInterfaceBases('IMerge', 'IAMLService');
