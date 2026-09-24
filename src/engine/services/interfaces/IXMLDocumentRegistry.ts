// Port of Aml.Engine.Services.Interfaces.IXMLDocumentRegistry (Aml.Engine 4.5.2).

import type { XDocumentWrapper } from '../../xml/XDocumentWrapper.js';

/** Registry of XML documents, notified when a document is removed. */
export interface IXMLDocumentRegistry {
  removeDocument(document: XDocumentWrapper): void;
}
