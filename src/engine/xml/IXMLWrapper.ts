// Port of Aml.Engine.XML.IXMLWrapper.

import type { XDocument, XElement } from '../../xml/index.js';

/** XML related properties of a wrapped instance. */
export interface IXMLWrapper {
  /** The XDocument containing the XML node of this object, or null if not inserted into a document. */
  readonly document: XDocument | null;

  /** Determines, if this instance is wrapped around an existing XML node. */
  readonly exists: boolean;

  /** The XML node of this instance. */
  readonly node: XElement | null;

  /** The XML parent node of this instance. */
  readonly owner: XElement | null;

  /** The schema tag name of this instance. */
  readonly tagName: string | null;
}
