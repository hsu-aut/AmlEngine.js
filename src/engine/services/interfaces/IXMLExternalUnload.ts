// Port of Aml.Engine.Services.Interfaces.IXMLExternalUnload (Aml.Engine 4.5.2).

import type { ExternalReferenceType } from '../../caex/ExternalReferenceType.js';

/** Unloads externally referenced documents. */
export interface IXMLExternalUnload {
  unloadExternalDocument(externalReference: ExternalReferenceType): void;
}
