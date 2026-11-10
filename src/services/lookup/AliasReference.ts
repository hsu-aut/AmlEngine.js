// Port of Aml.Engine.Services.Lookup.AliasReference (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { CAEXDocument_CAEXSchema } from '../../engine/caex/CAEXDocument.js';
import { CAEXPathBuilder } from '../../engine/caex/extensions/CAEXPathBuilder.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import { CAEXNodeReference, replaceString } from './CAEXNodeReference.js';
import { CAEXNode_Identifier } from './CAEXNode.js';

/** C# `s.TrimStart('@')`. */
function trimStartAt(s: string): string {
  let i = 0;
  while (i < s.length && s[i] === '@') i++;
  return s.substring(i);
}

/** A reference to an element of an external document, using an alias. */
export class AliasReference extends CAEXNodeReference {
  /** The kind of the reference (ID or path); the setter is internal in C#. */
  identifier: CAEXNode_Identifier = CAEXNode_Identifier.ID;

  /** The reference is an ID reference. */
  get isIDReference(): boolean {
    return this.identifier === CAEXNode_Identifier.ID;
  }

  /** The reference is a path reference. */
  get isPathReference(): boolean {
    return this.identifier === CAEXNode_Identifier.NAME;
  }

  constructor(element: XElement, referenceAttributeName: string | null) {
    super(element, referenceAttributeName);
  }

  // Aml.Engine: the value is replaced twice and, for a reference without alias, set to
  // "<newValue>@<newValue>"; the last SetValue overwrites the first one. Kept as in the original.
  override update(referencedElement: XElement | null, oldValue: string | null, newValue: string | null): boolean {
    if (newValue !== null) {
      newValue = !isNullOrEmpty(CAEXPathBuilder.aliasFromReference(this.referenceAttributeValue, CAEXDocument_CAEXSchema.Unknown))
        ? trimStartAt(replaceString(this.referenceAttributeValue!, oldValue, newValue))
        : newValue + '@' + newValue;
      this.setValue(referencedElement, trimStartAt(replaceString(this.referenceAttributeValue!, oldValue, newValue)));
    }
    this.setValue(referencedElement, newValue);
    return true;
  }
}
