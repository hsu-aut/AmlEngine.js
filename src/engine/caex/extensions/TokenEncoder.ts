// Port of Aml.Engine.CAEX.Extensions.TokenEncoder (Aml.Engine 4.5.2): encoding and validation
// of xs:token values.

import { T } from '../../registry.js';
import { dotNetExceptionName } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { XmlConvert } from '../../../system/index.js';

/** Characters removed by String.Trim() in .NET (char.IsWhiteSpace). */
const WHITESPACE = String.raw`\t\n\v\f\r\x85\p{Z}`;
const TRIM = new RegExp(`^[${WHITESPACE}]+|[${WHITESPACE}]+$`, 'gu');

/** String.Trim() with the .NET white space definition. */
export function csTrim(s: string): string {
  return s.replace(TRIM, '');
}

/** True when `e` is a System.Xml.XmlException. */
export function isXmlException(e: unknown): e is Error {
  return dotNetExceptionName(e) === 'XmlException';
}

/** Result of `isValid` (C# `bool IsValid(string token, out string exception)`). */
export interface EncoderValidation {
  result: boolean;
  exception: string | null;
}

/** @internal */
export class TokenEncoder {
  protected static readonly MultipleSpaces = / {2,}/g;

  encode(token: string | null): string | null {
    if (!isNullOrEmpty(token)) {
      return csTrim(token.replace(TokenEncoder.MultipleSpaces, ' '));
    }
    return token;
  }

  isValid(token: string | null): EncoderValidation {
    let exception: string | null = null;
    try {
      if (isNullOrEmpty(token)) {
        return { result: true, exception };
      }
      return { result: !isNullOrEmpty(XmlConvert.verifyTOKEN(csTrim(token.replace(TokenEncoder.MultipleSpaces, ' ')))), exception };
    } catch (ex) {
      if (!isXmlException(ex)) throw ex;
      exception = ex.message;
      return { result: false, exception };
    }
  }
}

T.TokenEncoder = TokenEncoder;
