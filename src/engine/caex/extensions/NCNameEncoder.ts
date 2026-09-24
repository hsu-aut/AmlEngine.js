// Port of Aml.Engine.CAEX.Extensions.NCNameEncoder (Aml.Engine 4.5.2): encoding and validation of
// xs:NCName values.

import { T } from '../../registry.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { XmlConvert } from '../../../system/index.js';
import { NameEncoder } from './NameEncoder.js';
import { isXmlException, type EncoderValidation } from './TokenEncoder.js';

/** @internal */
export class NCNameEncoder extends NameEncoder {
  override encode(token: string | null): string | null {
    if (isNullOrEmpty(token)) {
      return token;
    }
    return super.encode(token);
  }

  override isValid(token: string | null): EncoderValidation {
    let exception: string | null = null;
    try {
      if (isNullOrEmpty(token)) {
        return { result: true, exception };
      }
      return { result: !isNullOrEmpty(XmlConvert.verifyNCName(token)), exception };
    } catch (ex) {
      if (!isXmlException(ex)) throw ex;
      exception = ex.message;
      return { result: false, exception };
    }
  }
}

T.NCNameEncoder = NCNameEncoder;
