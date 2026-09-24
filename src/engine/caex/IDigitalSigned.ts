// Port of Aml.Engine.CAEX.IDigitalSigned (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXObject } from './ICAEXObject.js';

/** A CAEX object which can be digitally signed. */
export interface IDigitalSigned extends ICAEXObject {
  /** VerifySignature(publicKey = null) or VerifySignature(signature, publicKey). */
  verifySignature(publicKey?: string | null): boolean | null;
  verifySignature(signature: string | null, publicKey: string | null): boolean | null;
}

registerInterfaceBases('IDigitalSigned', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
