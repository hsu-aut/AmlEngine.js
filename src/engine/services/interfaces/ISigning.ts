// Port of Aml.Engine.Services.Interfaces.ISigning (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { CAEXObject } from '../../caex/CAEXObject.js';
import type { XMLSignature } from '../model/XMLSignature.js';
import type { IAMLService } from './IAMLService.js';

/** Service signing CAEX objects and verifying signatures. */
export interface ISigning extends IAMLService {
  computeSignature(CAEXObjectToSign: CAEXObject | null, privateKey: string | null, passPhrase: string | null): string | null;
  createSignature(CAEXObjectToSign: CAEXObject | null, privateKey: string | null, passPhrase: string | null, publicKey?: string | null): string | null;
  generateKeys(passPhrase: string | null): { publicKey: string | null; privateKey: string | null };
  /**
   * C# overloads VerifySignature(object, publicKey = null) and VerifySignature(object, signature,
   * publicKey): the call with three arguments selects the second one.
   */
  verifySignature(CAEXObjectToVerify: CAEXObject | null, publicKeyOrSignature?: string | null, publicKey?: string | null): boolean | null;
  toEnvelopedSignature(signatureID: string | null, signatureValue: string | null, publicKey: string | null): XMLSignature | null;
}

registerInterfaceBases('ISigning', 'IAMLService');
