// Port of Aml.Engine.Services.Model.XMLSignatureElement (Aml.Engine 4.5.2).
//
// The original works on the System.Xml DOM (XmlDocument/XmlElement). The port uses the XLinq
// classes of src/xml: GetXml returns an XElement (the XmlDocument argument, only used as element
// factory in C#, is accepted and ignored) and LoadXml takes an XElement.

import { T } from '../../registry.js';
import { SystemException } from '../../../system/exceptions.js';
import type { XElement } from '../../../xml/index.js';

/** System.Security.Cryptography.CryptographicException. */
export class CryptographicException extends SystemException {
  override name = 'CryptographicException';

  constructor(message = 'Error occurred during a cryptographic operation.') {
    super(message);
  }
}

/** Base class of the elements of an XML signature. */
export abstract class XMLSignatureElement {
  /** Creates the XML of the element (C# `GetXml(XmlDocument document)`). */
  abstract getXml(document?: unknown): XElement;

  /** Loads the element from XML. */
  abstract loadXml(element: XElement | null): void;
}

T.XMLSignatureElement = XMLSignatureElement;
