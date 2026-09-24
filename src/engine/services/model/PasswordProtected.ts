// Port of Aml.Engine.Services.Model.PasswordProtected (Aml.Engine 4.5.2).
//
// The password is stored AES encrypted (Aes.Create(): AES-256-CBC with PKCS7 padding, key =
// SHA-256 of a fixed string, random IV written before the cipher text, Base64). The C# property
// is synchronous; the port uses node:crypto (process.getBuiltinModule, Node 20.16+) for it. Where
// node:crypto is not available (browsers) the operation fails inside the try block and, like
// any failure in C#, is reported on the console with the result null. The asynchronous helpers
// getPasswordAsync/setPasswordAsync use WebCrypto and work everywhere.

import { T } from '../../registry.js';
import { NotSupportedException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { Convert } from '../../../system/index.js';
import { CryptographicException } from './XMLSignatureElement.js';

interface NodeCrypto {
  createHash(algorithm: string): { update(data: Uint8Array): { digest(): Uint8Array } };
  randomBytes(size: number): Uint8Array;
  createCipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): { update(data: Uint8Array): Uint8Array; final(): Uint8Array };
  createDecipheriv(algorithm: string, key: Uint8Array, iv: Uint8Array): { update(data: Uint8Array): Uint8Array; final(): Uint8Array };
}

function nodeCrypto(): NodeCrypto {
  const proc = (globalThis as { process?: { getBuiltinModule?: (id: string) => unknown } }).process;
  const mod = proc?.getBuiltinModule?.('node:crypto') as NodeCrypto | undefined;
  if (!mod) {
    throw new NotSupportedException('Synchronous AES encryption needs node:crypto; use getPasswordAsync/setPasswordAsync.');
  }
  return mod;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const r = new Uint8Array(a.length + b.length);
  r.set(a, 0);
  r.set(b, a.length);
  return r;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8');

/** Base class of objects with an encrypted password. */
export abstract class PasswordProtected {
  private static readonly _encryptionKey = 'uisfrzxxxj1112*34fgJ';

  /** The password (decrypted from `passwordHash`); "" when none is set. Not serialized. */
  get password(): string | null {
    if (this.passwordHash !== null) {
      return PasswordProtected.unprotect(this.passwordHash);
    }
    return '';
  }

  set password(value: string | null) {
    this.passwordHash = isNullOrEmpty(value) ? null : PasswordProtected.protect(value);
  }

  /** The encrypted password (serialized as "PasswordHash"). */
  passwordHash: string | null = null;

  /** Asynchronous variant of the `password` getter (WebCrypto). */
  async getPasswordAsync(): Promise<string | null> {
    if (this.passwordHash !== null) {
      return PasswordProtected.unprotectAsync(this.passwordHash);
    }
    return '';
  }

  /** Asynchronous variant of the `password` setter (WebCrypto). */
  async setPasswordAsync(value: string | null): Promise<void> {
    this.passwordHash = isNullOrEmpty(value) ? null : await PasswordProtected.protectAsync(value);
  }

  private static encryptionKey(): Uint8Array {
    return nodeCrypto().createHash('sha256').update(utf8Encoder.encode(PasswordProtected._encryptionKey)).digest();
  }

  private static protect(value: string): string | null {
    try {
      const array = PasswordProtected.encryptionKey();
      const crypto = nodeCrypto();
      const iV = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-cbc', array, iV);
      const body = concat(cipher.update(utf8Encoder.encode(value)), cipher.final());
      return Convert.toBase64String(concat(iV, body));
    } catch (ex) {
      console.log('Data was not encrypted. An error occurred.');
      console.log(String(ex));
      return null;
    }
  }

  private static unprotect(value: string): string | null {
    try {
      const array = PasswordProtected.encryptionKey();
      const data = Convert.fromBase64String(value);
      if (data.length < 16) {
        throw new CryptographicException('IV is missing or invalid.');
      }
      const array2 = data.subarray(0, 16);
      const decipher = nodeCrypto().createDecipheriv('aes-256-cbc', array, array2);
      const plain = concat(decipher.update(data.subarray(16)), decipher.final());
      return utf8Decoder.decode(plain);
    } catch (ex) {
      console.log('Data was not decrypted. An error occurred.');
      console.log(String(ex));
      return null;
    }
  }

  private static async encryptionKeyAsync(): Promise<CryptoKey> {
    const digest = await crypto.subtle.digest('SHA-256', utf8Encoder.encode(PasswordProtected._encryptionKey));
    return crypto.subtle.importKey('raw', digest, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
  }

  /** Protect with WebCrypto (same format as the synchronous path). */
  private static async protectAsync(value: string): Promise<string | null> {
    try {
      const key = await PasswordProtected.encryptionKeyAsync();
      const iV = crypto.getRandomValues(new Uint8Array(16));
      const body = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: iV }, key, utf8Encoder.encode(value)));
      return Convert.toBase64String(concat(iV, body));
    } catch (ex) {
      console.log('Data was not encrypted. An error occurred.');
      console.log(String(ex));
      return null;
    }
  }

  /** Unprotect with WebCrypto (same format as the synchronous path). */
  private static async unprotectAsync(value: string): Promise<string | null> {
    try {
      const key = await PasswordProtected.encryptionKeyAsync();
      const data = Convert.fromBase64String(value);
      if (data.length < 16) {
        throw new CryptographicException('IV is missing or invalid.');
      }
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: data.slice(0, 16) }, key, data.slice(16)));
      return utf8Decoder.decode(plain);
    } catch (ex) {
      console.log('Data was not decrypted. An error occurred.');
      console.log(String(ex));
      return null;
    }
  }
}

T.PasswordProtected = PasswordProtected;
