// Port of Aml.Engine.XML.IDocument.

import type { XDocument } from '../../xml/index.js';

/** Interface for a XDocument wrapper. */
export interface IDocument {
  /** Gets the XDocument. */
  readonly xDocument: XDocument | null;

  /** Saves the document to a stream (the bytes of the stream). */
  saveToStream(prettyPrint: boolean): Uint8Array;
}
