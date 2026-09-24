// Port of Aml.Engine.Services.CAEXReference (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import { XmlCAEXAttributes } from '../xmlext/XmlCAEXAttributes.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import type { CAEXBasicObject } from '../caex/CAEXBasicObject.js';
import type { ICAEXReference } from './interfaces/ICAEXReference.js';

/** A reference of an XML element to another object, defined by an attribute (or the element value). */
export class CAEXReference implements ICAEXReference {
  constructor(element: XElement, referenceAttributeName: string | null) {
    this.element = element;
    this.referenceAttributeName = referenceAttributeName;
  }

  /** The CAEX object which owns the reference. */
  get caexObject(): CAEXBasicObject | null {
    const w = XmlOperation.createCAEXWrapper(this.element);
    return w instanceof T.CAEXBasicObject ? w : null;
  }

  /** The XML element which owns the reference. */
  readonly element: XElement;

  /** The name of the reference attribute ("Value" for the element value). */
  readonly referenceAttributeName: string | null;

  /** The value of the reference. */
  get referenceAttributeValue(): string | null {
    if (!isNullOrEmpty(this.referenceAttributeName) && !(this.referenceAttributeName === 'Value')) {
      return this.element.attribute(this.referenceAttributeName)?.value ?? null;
    }
    return this.element.value;
  }

  /** Sets the value of the reference. */
  setValue(value: string | null): void {
    if (this.element === null || this.element === undefined) {
      return;
    }
    // C# Element.Attribute(null) throws ArgumentNullException when the attribute name is null.
    if (this.element.attribute(this.referenceAttributeName!) === null) {
      if (this.referenceAttributeName === 'Value') {
        XmlCAEXAttributes.setStringValue(this.element.parent, this.element.name, value ?? '');
      } else {
        this.caexObject?.setXAttributeValue(this.referenceAttributeName!, value);
      }
    } else {
      this.caexObject?.setXAttributeValue(this.referenceAttributeName!, value);
    }
  }
}

T.CAEXReference = CAEXReference;
registerInterfaces(CAEXReference, 'ICAEXReference');
