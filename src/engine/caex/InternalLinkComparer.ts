// Port of Aml.Engine.CAEX.InternalLinkComparer (Aml.Engine 4.5.2, internal class).

import { T } from '../registry.js';
import type { IEqualityComparer } from '../../system/linq.js';
import type { XElement } from '../../xml/index.js';

/**
 * Compares InternalLink elements by their partner references; links with swapped sides are equal.
 * `equals`/`getHashCode` are the C# members, `key` serves the LINQ port (`IEqualityComparer.key`).
 */
export class InternalLinkComparer implements IEqualityComparer<XElement | null> {
  /** Two InternalLinks are equal, if they connect the same partners (in any order). */
  equals(internalLinkx: XElement | null, internalLinky: XElement | null): boolean {
    const text = internalLinkx?.attribute('RefPartnerSideA')?.value ?? null;
    const text2 = internalLinky?.attribute('RefPartnerSideA')?.value ?? null;
    const text3 = internalLinkx?.attribute('RefPartnerSideB')?.value ?? null;
    const text4 = internalLinky?.attribute('RefPartnerSideB')?.value ?? null;
    if (text != null && text2 != null && text3 != null && text4 != null) {
      if (!(text === text2) || !(text3 === text4)) {
        if (text === text4) {
          return text3 === text2;
        }
        return false;
      }
      return true;
    }
    return false;
  }

  /**
   * C# `GetHashCode` (`hashA ^ hashB`, symmetric in the sides). The port returns a key instead of
   * a number: equal links get equal keys, which is all a hash is used for.
   */
  getHashCode(obj: XElement): unknown {
    const text = obj.attribute('RefPartnerSideA')?.value ?? null;
    const text2 = obj.attribute('RefPartnerSideB')?.value ?? null;
    if (text == null || text2 == null) {
      return text ?? text2 ?? obj;
    }
    return text < text2 ? `${text}\u0000${text2}` : `${text2}\u0000${text}`;
  }

  /** `IEqualityComparer.key` of the LINQ port. */
  key(x: XElement | null): unknown {
    return this.getHashCode(x!);
  }
}

T.InternalLinkComparer = InternalLinkComparer;
