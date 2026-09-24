// Port of Aml.Engine.CAEX.Extensions.NMTokenEncoder (Aml.Engine 4.5.2): encoding and validation
// of xs:NMTOKEN values.

import { T } from '../../registry.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { XmlConvert } from '../../../system/index.js';
import { TokenEncoder, isXmlException, type EncoderValidation } from './TokenEncoder.js';

/** @internal */
export class NMTokenEncoder extends TokenEncoder {
  override encode(token: string | null): string | null {
    if (!isNullOrEmpty(token)) {
      return XmlConvert.encodeNmToken(token);
    }
    return token;
  }

  override isValid(token: string | null): EncoderValidation {
    let exception: string | null = null;
    try {
      if (isNullOrEmpty(token)) {
        return { result: true, exception };
      }
      return { result: !isNullOrEmpty(XmlConvert.verifyNMTOKEN(token)), exception };
    } catch (ex) {
      if (!isXmlException(ex)) throw ex;
      exception = ex.message;
      return { result: false, exception };
    }
  }
}

T.NMTokenEncoder = NMTokenEncoder;
