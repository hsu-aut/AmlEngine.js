// Port of Aml.Engine.Services.Lookup.ReferenceElement (Aml.Engine.Services 4.3.1).
//
// In C# ReferenceElement derives from Tuple<XElement, string>; Item1 and Item2 are the properties
// item1 and item2, and toString() gives the "(Item1, Item2)" of the tuple. Equals and GetHashCode
// are overridden by the class (equals/equalityKey).

import '../../engine/index.js';
import { registerInterfaces } from '../../engine/interfaces.js';
import { CAEXBasicObject } from '../../engine/caex/CAEXBasicObject.js';
import { XmlOperation } from '../../engine/xmlext/XmlOperation.js';
import type { XElement } from '../../xml/index.js';
import type { ICAEXReference } from '../../engine/services/interfaces/ICAEXReference.js';

/**
 * ReferenceElement is a Tuple of an XElement and the name of an attribute, which is used to
 * reference another element. The reference may be used as a key to find the referenced element.
 */
export class ReferenceElement implements ICAEXReference {
  /** Tuple.Item1: the XML element. */
  readonly item1: XElement | null;

  /** Tuple.Item2: the name of the reference attribute. */
  readonly item2: string | null;

  /** Gets the CAEX object which owns the reference. */
  get caexObject(): CAEXBasicObject | null {
    const element = this.element;
    const obj = element !== null ? XmlOperation.createCAEXWrapper(element) : null;
    return obj instanceof CAEXBasicObject ? obj : null;
  }

  /** Gets the XML node. */
  get element(): XElement | null {
    return this.item1;
  }

  /** Gets the name of the reference attribute of the element. */
  get referenceAttributeName(): string | null {
    return this.item2;
  }

  /** Gets the value of the reference attribute (the element value, if there is no such attribute). */
  get referenceAttributeValue(): string | null {
    if (this.element!.attribute(this.referenceAttributeName!) !== null) {
      return this.element!.attribute(this.referenceAttributeName!)?.value ?? null;
    }
    return this.element!.value;
  }

  /** The constructor is internal in C#. */
  constructor(xmlNode: XElement | null, refAttributeName: string | null) {
    this.item1 = xmlNode;
    this.item2 = refAttributeName;
  }

  /** Equal, if the elements and the names of the reference attributes are equal. */
  equals(obj: unknown): boolean {
    const referenceElement = obj instanceof ReferenceElement ? obj : null;
    if ((referenceElement?.element ?? null) === this.element) {
      return (referenceElement?.referenceAttributeName ?? null) === this.referenceAttributeName;
    }
    return false;
  }

  /**
   * GetHashCode: `Element.GetHashCode() ^ ReferenceAttributeName.GetHashCode()`, which fails for a
   * null element or name. Equal instances have the same element.
   */
  equalityKey(): unknown {
    if (this.element === null) {
      throw new TypeError("Cannot read properties of null (reading 'GetHashCode')");
    }
    if (this.referenceAttributeName === null) {
      throw new TypeError("Cannot read properties of null (reading 'GetHashCode')");
    }
    return this.element;
  }

  /** Sets a value for the referenced element. */
  setValue(value: string | null): void {
    if (this.element === null) {
      return;
    }
    if (this.element.attribute(this.referenceAttributeName!) === null) {
      if (this.referenceAttributeName === 'Value') {
        this.element.value = value as string;
      }
      return;
    }
    this.caexObject?.setXAttributeValue(this.referenceAttributeName!, value);
  }

  /** Tuple.ToString: "(Item1, Item2)". */
  toString(): string {
    return `(${this.item1?.toString() ?? ''}, ${this.item2 ?? ''})`;
  }
}

registerInterfaces(ReferenceElement, 'ICAEXReference');
