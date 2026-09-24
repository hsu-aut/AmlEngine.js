// Port of Aml.Engine.CAEX.AttributeValueComparer (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import type { XElement } from '../../xml/index.js';
import type { IEqualityComparer } from '../../system/linq.js';

/**
 * Equality comparer for values of Attributes of XML-Elements: two elements are equal when the
 * named XML attribute has the same value in both (or is missing in both).
 * @internal
 */
export class AttributeValueComparer implements IEqualityComparer<XElement | null> {
  /** @param attributeName The name of the attribute. */
  constructor(private readonly attributeName: string) {}

  /** Compares the values of the provided attributes. */
  equals(firstNode: XElement | null, secondNode: XElement | null): boolean {
    const text = firstNode?.attribute(this.attributeName)?.value ?? null;
    const text2 = secondNode?.attribute(this.attributeName)?.value ?? null;
    if (text !== null || text2 !== null) {
      if (text !== null && text2 !== null) {
        return text === text2;
      }
      return false;
    }
    return true;
  }

  /**
   * The port of GetHashCode(XElement): the attribute value, or the element itself when the
   * attribute is missing (like C#, where such elements hash by reference).
   */
  key(obj: XElement | null): unknown {
    return obj!.attribute(this.attributeName)?.value ?? obj!;
  }
}

T.AttributeValueComparer = AttributeValueComparer;
