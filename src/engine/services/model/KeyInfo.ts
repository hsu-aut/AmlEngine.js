// Port of Aml.Engine.Services.Model.KeyInfo (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { ArgumentNullException } from '../../../system/exceptions.js';
import { XElement, XName } from '../../../xml/index.js';
import { CryptographicException, XMLSignatureElement } from './XMLSignatureElement.js';
import type { KeyValue } from './KeyValue.js';

const XmlDsigNamespaceUrl = 'http://www.w3.org/2000/09/xmldsig#';

/** The key info of an XML signature. */
export class KeyInfo extends XMLSignatureElement {
  /** The key value. */
  keyValue: KeyValue | null = null;

  override getXml(document: unknown = null): XElement {
    const xmlElement = new XElement(XName.get('KeyInfo', XmlDsigNamespaceUrl));
    xmlElement.add(this.keyValue!.getXml(document));
    return xmlElement;
  }

  override loadXml(value: XElement | null): void {
    if (value === null || value === undefined) {
      throw new ArgumentNullException('value');
    }
    // value.SelectNodes("ds:KeyValue", nsmgr): child elements {xmldsig}KeyValue.
    const xmlNodeList = [...value.elements(XName.get('KeyValue', XmlDsigNamespaceUrl))];
    if (xmlNodeList.length === 0 || xmlNodeList.length > 1) {
      throw new CryptographicException('KeyInfo/KeyValue');
    }
    const xmlElement = xmlNodeList[0];
    for (const item of xmlElement.elements()) {
      const value2 = T.KeyValue.Constructors.get(item.name.localName);
      if (value2 !== undefined) {
        this.keyValue = value2();
        this.keyValue.loadXml(item);
      }
    }
  }
}

T.KeyInfo = KeyInfo;
