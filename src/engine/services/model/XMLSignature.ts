// Port of Aml.Engine.Services.Model.XMLSignature (Aml.Engine 4.5.2).
//
// System.Xml DOM replaced by XLinq (see XMLSignatureElement.ts): LoadFromDocument takes an
// XDocument, LoadFromString parses with XDocument.Parse (XmlDocument.LoadXml in C#).

import { T } from '../../registry.js';
import { ArgumentNullException, IndexOutOfRangeException, OverflowException } from '../../../system/exceptions.js';
import { isWhiteSpace } from '../../../system/Char.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { parseXDocument, XElement, XName, type XDocument } from '../../../xml/index.js';
import { CryptographicException, XMLSignatureElement } from './XMLSignatureElement.js';
import type { KeyInfo } from './KeyInfo.js';
import type { SignedInfo } from './SignedInfo.js';

/** An enveloped XML signature (xmldsig). */
export class XMLSignature extends XMLSignatureElement {
  static readonly XmlDsigNamespaceUrl = 'http://www.w3.org/2000/09/xmldsig#';

  /** The signature ID. */
  id: string | null = null;

  /** The signature value. */
  signatureValue: string | null = null;

  /** The signed info. */
  signedInfo: SignedInfo | null = null;

  /** The key info. */
  keyInfo: KeyInfo | null = null;

  /** Loads the signature from the root element of the document. */
  loadFromDocument(document: XDocument): void {
    this.loadXml(document.root);
  }

  /** Loads the signature from its XML text. */
  loadFromString(signatureElementString: string): void {
    const xmlDocument = parseXDocument(signatureElementString);
    this.loadXml(xmlDocument.root);
  }

  /**
   * Removes all white space characters (char.IsWhiteSpace) from the string or from the given
   * range of it.
   */
  static discardWhiteSpaces(inputBuffer: string, inputOffset?: number, inputCount?: number): string {
    if (inputOffset === undefined || inputCount === undefined) {
      return XMLSignature.discardWhiteSpaces(inputBuffer, 0, inputBuffer.length);
    }
    const at = (i: number): string => {
      const k = inputOffset + i;
      if (k < 0 || k >= inputBuffer.length) throw new IndexOutOfRangeException();
      return inputBuffer[k];
    };
    let num = 0;
    for (let i = 0; i < inputCount; i++) {
      if (isWhiteSpace(at(i))) {
        num++;
      }
    }
    // new char[inputCount - num]: a negative length throws OverflowException.
    if (inputCount - num < 0) {
      throw new OverflowException();
    }
    const array: string[] = [];
    for (let i = 0; i < inputCount; i++) {
      if (!isWhiteSpace(at(i))) {
        array.push(at(i));
      }
    }
    return array.join('');
  }

  /** Creates the XML of the signature (C# overloads GetXml() and GetXml(XmlDocument)). */
  override getXml(document: unknown = null): XElement {
    const xmlElement = new XElement(XName.get('Signature', XMLSignature.XmlDsigNamespaceUrl));
    if (!isNullOrEmpty(this.id)) {
      xmlElement.setAttributeValue('Id', this.id);
    }
    if (this.signedInfo === null || this.signedInfo === undefined) {
      throw new CryptographicException('SignedInfo Required');
    }
    xmlElement.add(this.signedInfo.getXml(document));
    if (this.signatureValue === null || this.signatureValue === undefined) {
      throw new CryptographicException('SignatureValue Required');
    }
    const xmlElement2 = new XElement(XName.get('SignatureValue', XMLSignature.XmlDsigNamespaceUrl));
    xmlElement2.add(this.signatureValue);
    xmlElement.add(xmlElement2);
    if (this.keyInfo !== null && this.keyInfo !== undefined) {
      xmlElement.add(this.keyInfo.getXml(document));
    }
    return xmlElement;
  }

  /**
   * The attribute value with the local name (no namespace) or, if missing, the attribute in the
   * given namespace; null if neither exists.
   */
  static getAttribute(element: XElement, localName: string, namespaceURI: string): string | null {
    let text = element.attribute(XName.get(localName))?.value ?? null;
    if (text === null) {
      const a = element.attribute(XName.get(localName, namespaceURI));
      if (a !== null) {
        text = a.value;
      }
    }
    return text;
  }

  override loadXml(value: XElement | null): void {
    if (value === null || value === undefined) {
      throw new ArgumentNullException('value');
    }
    if (!(value.name.localName === 'Signature')) {
      throw new CryptographicException('Signature');
    }
    this.id = XMLSignature.getAttribute(value, 'Id', XMLSignature.XmlDsigNamespaceUrl);
    if (this.id === null) {
      throw new CryptographicException('Signature Id missing');
    }
    const ns = XMLSignature.XmlDsigNamespaceUrl;
    const xmlNodeList = [...value.elements(XName.get('SignedInfo', ns))];
    if (xmlNodeList.length === 0 || xmlNodeList.length > 1) {
      throw new CryptographicException('SignedInfo');
    }
    const element = xmlNodeList[0];
    this.signedInfo = new T.SignedInfo();
    this.signedInfo.loadXml(element);
    const xmlNodeList2 = [...value.elements(XName.get('SignatureValue', ns))];
    if (xmlNodeList2.length === 0 || xmlNodeList2.length > 1) {
      throw new CryptographicException('SignatureValue');
    }
    this.signatureValue = XMLSignature.discardWhiteSpaces(xmlNodeList2[0].value);
    const xmlNodeList3 = [...value.elements(XName.get('KeyInfo', ns))];
    this.keyInfo = new T.KeyInfo();
    for (const item of xmlNodeList3) {
      this.keyInfo.loadXml(item);
    }
  }
}

T.XMLSignature = XMLSignature;
