// Port of Aml.Engine.Services.Lookup.PathReference (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { XmlCAEXAttributes } from '../../engine/xmlext/XmlCAEXAttributes.js';
import { isNullOrWhiteSpace } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import { CAEXNodeReference } from './CAEXNodeReference.js';

/** A reference by CAEX path (class references, mapping references). */
export class PathReference extends CAEXNodeReference {
  constructor(element: XElement, referenceAttributeName: string | null) {
    super(element, referenceAttributeName);
  }

  override update(referencedElement: XElement | null, oldValue: string | null, newValue: string | null): boolean {
    void oldValue;
    if (isNullOrWhiteSpace(newValue)) {
      this.setValue(referencedElement, null);
      return this.element !== null;
    }
    this.setValue(referencedElement, referencedElement !== null ? XmlCAEXAttributes.caexPath(referencedElement) : null);
    return true;
  }
}
