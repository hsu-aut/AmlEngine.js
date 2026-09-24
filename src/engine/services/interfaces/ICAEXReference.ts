// Port of Aml.Engine.Services.Interfaces.ICAEXReference (Aml.Engine 4.5.2).

import type { CAEXBasicObject } from '../../caex/CAEXBasicObject.js';

/** A reference from a CAEX object to another object, defined by an XML attribute. */
export interface ICAEXReference {
  /** The CAEX object which owns the reference. */
  readonly caexObject: CAEXBasicObject | null;
  /** The name of the XML attribute which contains the reference. */
  readonly referenceAttributeName: string | null;
  /** The value of the reference attribute. */
  readonly referenceAttributeValue: string | null;
  /** Sets the value of the reference attribute. */
  setValue(value: string | null): void;
}
