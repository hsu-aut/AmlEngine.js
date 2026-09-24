// Port of Aml.Engine.Services.Model.SignedInfo (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { ArgumentNullException } from '../../../system/exceptions.js';
import { XElement, XName } from '../../../xml/index.js';
import { CryptographicException, XMLSignatureElement } from './XMLSignatureElement.js';

const XmlDsigNamespaceUrl = 'http://www.w3.org/2000/09/xmldsig#';

/** The signed info of an XML signature. */
export class SignedInfo extends XMLSignatureElement {
  /** The algorithm of the signature method. */
  signatureMethod: string | null = null;

  override getXml(_document: unknown = null): XElement {
    const xmlElement = new XElement(XName.get('SignedInfo', XmlDsigNamespaceUrl));
    const xmlElement2 = new XElement(XName.get('SignatureMethod', XmlDsigNamespaceUrl));
    // XmlElement.SetAttribute(name, null) stores an empty value.
    xmlElement2.setAttributeValue('Algorithm', this.signatureMethod ?? '');
    xmlElement.add(xmlElement2);
    return xmlElement;
  }

  override loadXml(value: XElement | null): void {
    if (value === null || value === undefined) {
      throw new ArgumentNullException('value');
    }
    if (!(value.name.localName === 'SignedInfo')) {
      throw new CryptographicException('SignedInfo');
    }
    const xmlNodeList = [...value.elements(XName.get('SignatureMethod', XmlDsigNamespaceUrl))];
    if (xmlNodeList.length === 0 || xmlNodeList.length > 1) {
      throw new CryptographicException('SignedInfo/SignatureMethod');
    }
    const element = xmlNodeList[0];
    this.signatureMethod = T.XMLSignature.getAttribute(element, 'Algorithm', XmlDsigNamespaceUrl);
    if (this.signatureMethod === null) {
      throw new CryptographicException('SignedInfo/SignatureMethod');
    }
  }
}

T.SignedInfo = SignedInfo;
