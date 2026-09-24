// Port of Aml.Engine.AmlObjects.CAEXSignatureHeader (Aml.Engine 4.5.2): extension methods for the
// AdditionalInformation element that holds the XML signature of a CAEX object.

import { T } from '../registry.js';
import { from } from '../../system/linq.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { CAEXObjectExtensions } from '../caex/extensions/CAEXObjectExtensions.js';
import type { CAEXObject } from '../caex/CAEXObject.js';
import type { XMLSignature } from '../services/model/XMLSignature.js';
import type { XElement } from '../../xml/index.js';

/** Extension methods for the signature header of a CAEX object. */
export class CAEXSignatureHeader {
  private constructor() {}

  /** The name of the XML attribute marking the signature header. */
  static readonly SignatureAttributeName = 'AMLSignature';

  /** The value of the XML attribute marking the signature header. */
  static readonly SignatureAttributeValue = 'true';

  /**
   * Gets an empty signature header of the CAEX object: an existing one is emptied, otherwise a new
   * one is appended.
   * @throws ArgumentNullException caexObjectToSign is null.
   */
  static appendSignatureHeader(caexObjectToSign: CAEXObject | null): XElement {
    if (T.CAEXWrapper.equals(caexObjectToSign, null)) {
      throw new ArgumentNullException('caexObjectToSign');
    }
    let xElement = CAEXSignatureHeader.getSignatureHeader(caexObjectToSign!);
    if (xElement == null) {
      xElement = CAEXSignatureHeader.createSignatureHeader(caexObjectToSign!);
    } else {
      xElement.removeNodes();
    }
    return xElement;
  }

  /**
   * Deletes the signature of the CAEX object.
   * @returns `true` if the object has no signature header afterwards.
   */
  static deleteSignature(caexObject: CAEXObject | null): boolean {
    if (caexObject != null) {
      CAEXSignatureHeader.getSignatureHeader(caexObject)?.remove();
    }
    return (caexObject != null ? CAEXSignatureHeader.getSignatureHeader(caexObject) : null) == null;
  }

  /** Gets the signature header of the CAEX object, or `null`. */
  static getSignatureHeader(signedCAEXObject: CAEXObject): XElement | null {
    return (
      from(signedCAEXObject.additionalInformation.elementAndValues).firstOrDefault(
        (e) => (e.node.attribute('AMLSignature')?.value ?? null) === 'true',
      )?.node ?? null
    );
  }

  /** Gets the XML signature of the CAEX object, or `null`. */
  static getXMLSignature(signedCAEXObject: CAEXObject): XMLSignature | null {
    const xElement =
      from(signedCAEXObject.additionalInformation.elementAndValues).firstOrDefault(
        (e) => (e.node.attribute('AMLSignature')?.value ?? null) === 'true',
      )?.node ?? null;
    if (isNullOrEmpty(xElement?.value ?? null)) {
      return null;
    }
    const xMLSignature = new T.XMLSignature();
    const signatureElementString = xElement!.value.replace(/\t|\n|\r/g, '');
    xMLSignature.loadFromString(signatureElementString);
    return xMLSignature;
  }

  private static createSignatureHeader(caexObjectToSign: CAEXObject): XElement {
    const xElement = CAEXObjectExtensions.new_AdditionalInformation(caexObjectToSign, false);
    xElement.setAttributeValue('AMLSignature', 'true');
    return xElement;
  }
}
