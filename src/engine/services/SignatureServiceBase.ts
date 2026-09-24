// Port of Aml.Engine.Services.SignatureServiceBase (Aml.Engine 4.5.2).
//
// The base class holds no cryptography: ComputeSignature/CreateSignature return the canonical
// text to sign, the actual signing (System.Security.Cryptography.Xml in the original derived
// services) is left to derived classes. The two C# overloads of VerifySignature become one
// dispatching method: two arguments call the abstract `verifySignatureWithPublicKey`, three
// arguments the virtual `verifySignatureWithSignature`.

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { ArgumentNullException, FormatException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { from } from '../../system/linq.js';
import { XElement } from '../../xml/index.js';
import { CAEXSignatureHeader } from '../amlobjects/CAEXSignatureHeader.js';
import type { CAEXObject } from '../caex/CAEXObject.js';
import type { ExternalReferenceType } from '../caex/ExternalReferenceType.js';
import type { XMLSignature } from './model/XMLSignature.js';
import type { ISigning } from './interfaces/ISigning.js';

/** Base class of signing services. */
export abstract class SignatureServiceBase implements ISigning {
  /**
   * The text of the object used for signing: the XML without formatting, without the signature
   * header and without the alias prefixes of external references.
   */
  caexNodeToString(caexObject: CAEXObject): string {
    if (caexObject.isDeleted) {
      return '';
    }
    let text: string = caexObject.node!.toString(true);
    const signatureHeader: XElement | null = CAEXSignatureHeader.getSignatureHeader(caexObject);
    if (signatureHeader !== null) {
      const text2 = new XElement(signatureHeader.name.localName, [...signatureHeader.attributes()], signatureHeader.value).toString(true);
      if (!isNullOrEmpty(text2)) {
        const num = text.indexOf(text2);
        if (num === -1) {
          throw new FormatException('Signature header not recognized');
        }
        text = text.substring(0, num) + text.substring(num + text2.length);
      }
    }
    return from<ExternalReferenceType>(caexObject.caexDocument!.caexFile!.externalReference)
      .select((ex) => ex.alias as string | null)
      .toList()
      .reduce((current: string, alias: string | null) => current.split((alias ?? '') + '@').join(''), text);
  }

  /** Computes the signature of the object (the base class returns the text to sign). */
  computeSignature(CAEXObjectToSign: CAEXObject | null, privateKey: string | null, passPhrase: string | null): string | null {
    if (!T.CAEXWrapper.equals(CAEXObjectToSign, null)) {
      if (!isNullOrEmpty(privateKey)) {
        if (!isNullOrEmpty(passPhrase)) {
          return this.caexNodeToString(CAEXObjectToSign!);
        }
        throw new ArgumentNullException('passPhrase');
      }
      throw new ArgumentNullException('privateKey');
    }
    throw new ArgumentNullException('CAEXObjectToSign');
  }

  /** Creates the signature of the object (the base class returns the text to sign). */
  createSignature(CAEXObjectToSign: CAEXObject | null, privateKey: string | null, passPhrase: string | null, _publicKey: string | null = null): string | null {
    if (!T.CAEXWrapper.equals(CAEXObjectToSign, null)) {
      if (!isNullOrEmpty(privateKey)) {
        if (!isNullOrEmpty(passPhrase)) {
          return this.caexNodeToString(CAEXObjectToSign!);
        }
        throw new ArgumentNullException('passPhrase');
      }
      throw new ArgumentNullException('privateKey');
    }
    throw new ArgumentNullException('CAEXObjectToSign');
  }

  /** Generates a key pair protected by the pass phrase. */
  abstract generateKeys(passPhrase: string | null): { publicKey: string | null; privateKey: string | null };

  /** Creates an enveloped XML signature. */
  abstract toEnvelopedSignature(signatureID: string | null, signatureValue: string | null, publicKey: string | null): XMLSignature | null;

  /**
   * Verifies the signature of the object: `(object, publicKey = null)` or `(object, signature,
   * publicKey)` like the two C# overloads.
   */
  verifySignature(CAEXObjectToVerify: CAEXObject | null, publicKeyOrSignature: string | null = null, publicKey?: string | null): boolean | null {
    if (arguments.length >= 3) {
      return this.verifySignatureWithSignature(CAEXObjectToVerify, publicKeyOrSignature, publicKey ?? null);
    }
    return this.verifySignatureWithPublicKey(CAEXObjectToVerify, publicKeyOrSignature);
  }

  /** C# `abstract bool? VerifySignature(CAEXObject CAEXObjectToVerify, string publicKey = null)`. */
  protected abstract verifySignatureWithPublicKey(CAEXObjectToVerify: CAEXObject | null, publicKey: string | null): boolean | null;

  /** C# `virtual bool? VerifySignature(CAEXObject CAEXObjectToVerify, string signature, string publicKey)`. */
  protected verifySignatureWithSignature(CAEXObjectToVerify: CAEXObject | null, signature: string | null, publicKey: string | null): boolean | null {
    if (!T.CAEXWrapper.equals(CAEXObjectToVerify, null)) {
      if (!isNullOrEmpty(publicKey)) {
        if (!isNullOrEmpty(signature)) {
          return null;
        }
        throw new ArgumentNullException('signature');
      }
      throw new ArgumentNullException('publicKey');
    }
    throw new ArgumentNullException('CAEXObjectToVerify');
  }
}

T.SignatureServiceBase = SignatureServiceBase;
registerInterfaces(SignatureServiceBase, 'ISigning', 'IAMLService');
