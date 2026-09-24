// Port of Aml.Engine.CAEX.Extensions.NormalizedStringEncoder (Aml.Engine 4.5.2): encoding of
// xs:normalizedString values.

import { T } from '../../registry.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { TokenEncoder, type EncoderValidation } from './TokenEncoder.js';

// Regex "\s" of .NET: [\f\n\r\t\v\x85\p{Z}].
const WHITE = /[\f\n\r\t\v\x85\p{Z}]/gu;

/** @internal */
export class NormalizedStringEncoder extends TokenEncoder {
  override encode(token: string | null): string | null {
    if (!isNullOrEmpty(token)) {
      return token.replace(WHITE, ' ');
    }
    return token;
  }

  override isValid(_token: string | null): EncoderValidation {
    const exception: string | null = null;
    return { result: true, exception };
  }
}

T.NormalizedStringEncoder = NormalizedStringEncoder;
