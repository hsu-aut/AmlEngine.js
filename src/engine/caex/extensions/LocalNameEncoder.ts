// Port of Aml.Engine.CAEX.Extensions.LocalNameEncoder (Aml.Engine 4.5.2): encoding and
// validation of xs:QName values.

import { T } from '../../registry.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { XmlConvert } from '../../../system/index.js';
import { TokenEncoder, isXmlException, type EncoderValidation } from './TokenEncoder.js';

/** @internal */
export class LocalNameEncoder extends TokenEncoder {
  override encode(token: string | null): string | null {
    if (!isNullOrEmpty(token)) {
      return XmlConvert.encodeLocalName(token);
    }
    return token;
  }

  override isValid(token: string | null): EncoderValidation {
    let exception: string | null = null;
    try {
      if (isNullOrEmpty(token)) {
        return { result: true, exception };
      }
      const array = token.split(':');
      return {
        result: array.length === 2 && !isNullOrEmpty(XmlConvert.verifyNCName(array[0]!)) && !isNullOrEmpty(XmlConvert.verifyNCName(array[1]!)),
        exception,
      };
    } catch (ex) {
      if (!isXmlException(ex)) throw ex;
      exception = ex.message;
      return { result: false, exception };
    }
  }
}

T.LocalNameEncoder = LocalNameEncoder;
