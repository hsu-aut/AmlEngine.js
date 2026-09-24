// Port of Aml.Engine.Services.Interfaces.UpdateEventArgs (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import type { XElement, XObject } from '../../../xml/index.js';
import type { CAEXReference } from '../CAEXReference.js';
import type { ICAEXReference } from './ICAEXReference.js';

/** Event arguments of a reference update (IAutoUpdate.ReferenceUpdated). */
export class UpdateEventArgs {
  /** The updated reference (attribute or element). */
  readonly reference: XObject | null;

  /** The referenced element. */
  readonly referencedElement: XElement | null;

  /** The new value of the reference. */
  readonly updateValue: string | null = null;

  /** The old value of the reference. */
  readonly oldValue: string | null = null;

  /** The CAEX reference, if the update was made through one. */
  readonly caexReference: ICAEXReference | null = null;

  /**
   * C# constructors (referencedElement, XObject reference), (referencedElement, XObject
   * reference, newValue) and (referencedElement, CAEXReference reference, oldValue, newValue).
   */
  constructor(referencedElement: XElement | null, reference: XObject | CAEXReference | null, oldOrNewValue?: string | null, newValue?: string | null) {
    this.referencedElement = referencedElement;
    if (arguments.length >= 4) {
      const r = reference as CAEXReference;
      this.caexReference = r;
      this.updateValue = newValue ?? null;
      this.oldValue = oldOrNewValue ?? null;
      this.reference = r.element?.attribute(r.referenceAttributeName!) ?? null;
      return;
    }
    this.reference = reference as XObject | null;
    if (oldOrNewValue !== undefined) {
      this.updateValue = oldOrNewValue;
    }
  }
}

T.UpdateEventArgs = UpdateEventArgs;
