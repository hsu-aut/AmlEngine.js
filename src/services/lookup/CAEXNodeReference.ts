// Port of Aml.Engine.Services.Lookup.CAEXNodeReference (Aml.Engine.Services 4.3.1).
//
// CAEXNodeReference is the base class of IDReference, PathReference and AliasReference, which
// LookupService.ts loads (through LookupTables). Its SetValue reads the static
// LookupService.LookUpService; a static import of LookupService.ts here would evaluate one of the
// subclasses before this class whenever this module is loaded first. LookupService.ts therefore
// assigns itself to `CAEXNodeReference.lookupServiceType` when it is loaded, and this module only
// imports engine modules.

import '../../engine/index.js';
import { CAEXReference } from '../../engine/services/CAEXReference.js';
import { XmlCAEXSchema } from '../../engine/xmlext/XmlCAEXSchema.js';
import { ArgumentException, ArgumentNullException } from '../../system/exceptions.js';
import type { XElement, XObject } from '../../xml/index.js';
import type { LookupService } from '../LookupService.js';

/**
 * C# `s.Replace(oldValue, newValue)` (ordinal): every occurrence, from left to right; a null
 * `newValue` removes the occurrences. Used by the references of the lookup tables.
 * @internal
 */
export function replaceString(s: string, oldValue: string | null, newValue: string | null): string {
  if (oldValue === null || oldValue === undefined) {
    throw new ArgumentNullException('oldValue');
  }
  if (oldValue.length === 0) {
    throw new ArgumentException('The value cannot be an empty string.', 'oldValue');
  }
  return s.split(oldValue).join(newValue ?? '');
}

/** A reference of an element to a node of a lookup table. */
export class CAEXNodeReference extends CAEXReference {
  /** @internal LookupService, set by LookupService.ts (see the module comment). */
  static lookupServiceType: typeof LookupService;

  /** The reference attribute of the element. */
  get attribute(): XObject | null {
    return this.element?.attribute(this.referenceAttributeName!) ?? null;
  }

  /** Gets the ID value as part of the reference attribute value. */
  get referenceID(): string | null {
    return this.referenceAttributeValue;
  }

  /** Gets the Name value as part of the reference attribute value. */
  get referenceName(): string | null {
    return this.referenceAttributeValue;
  }

  constructor(element: XElement, referenceAttributeName: string | null) {
    super(element, referenceAttributeName);
  }

  /** Updates the reference to the new value; false, if the reference is no longer valid. */
  update(referencedElement: XElement | null, oldValue: string | null, newValue: string | null): boolean {
    void oldValue;
    this.setValue(referencedElement, newValue);
    return true;
  }

  /**
   * C# overloads: `SetValue(string)` of CAEXReference, and `SetValue(XElement referencedElement,
   * string value)`, which sets the value of the attribute and raises an update event.
   */
  override setValue(value: string | null): void;
  override setValue(referencedElement: XElement | null, value: string | null): void;
  override setValue(...args: [string | null] | [XElement | null, string | null]): void {
    if (args.length < 2) {
      super.setValue(args[0] as string | null);
      return;
    }
    let referencedElement = args[0] as XElement | null;
    const value = args[1] as string | null;
    if (!CAEXNodeReference.lookupServiceType.lookUpService!.isAutoUpdateEnabled) {
      return;
    }
    const referenceAttributeValue = this.referenceAttributeValue;
    super.setValue(value);
    if (referencedElement !== null) {
      if (this.referenceAttributeName === 'Value' && !XmlCAEXSchema.isAttribute(referencedElement)) {
        referencedElement = referencedElement.parent;
      }
      CAEXNodeReference.lookupServiceType.lookUpService!.onReferenceUpdate(referencedElement, this, referenceAttributeValue, value);
    }
  }
}
