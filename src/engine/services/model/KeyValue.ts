// Port of Aml.Engine.Services.Model.KeyValue (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { XElement, XName } from '../../../xml/index.js';
import { XMLSignatureElement } from './XMLSignatureElement.js';

const XmlDsigNamespaceUrl = 'http://www.w3.org/2000/09/xmldsig#';

/** The key value of an XML signature (KeyInfo/KeyValue). */
export abstract class KeyValue extends XMLSignatureElement {
  /** Factories of the key value implementations by local name of the key element. */
  static readonly Constructors = new Map<string, () => KeyValue>();

  /** The public key. */
  abstract getPublicKey(): string | null;

  override getXml(_document: unknown = null): XElement {
    return new XElement(XName.get('KeyValue', XmlDsigNamespaceUrl));
  }
}

T.KeyValue = KeyValue;
