// Port of Aml.Engine.Services.Lookup.IDReference (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { CAEXDocument_CAEXSchema } from '../../engine/caex/CAEXDocument.js';
import { CAEXPathBuilder } from '../../engine/caex/extensions/CAEXPathBuilder.js';
import { XmlCAEXAttributes } from '../../engine/xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../../engine/xmlext/XmlCAEXSchema.js';
import { cultureStartsWith } from '../../system/CompareInfo.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import { CAEXNodeReference, replaceString } from './CAEXNodeReference.js';

/** A reference by ID (mirrors, InternalLinks, attribute mirrors and other ID references). */
export class IDReference extends CAEXNodeReference {
  /** The reference is defined by an attribute mirror. */
  get isAttribute(): boolean {
    return XmlCAEXSchema.isAttribute(this.element);
  }

  /** The reference is defined by an ExternalInterface mirror. */
  get isInterfaceMirror(): boolean {
    if (XmlCAEXSchema.isExternalInterface(this.element)) {
      return this.referenceAttributeName === 'RefBaseClassPath';
    }
    return false;
  }

  /** The reference is defined by an InternalElement mirror. */
  get isInternalElementMirror(): boolean {
    if (XmlCAEXSchema.isInternalElement(this.element)) {
      return this.referenceAttributeName === 'RefBaseSystemUnitPath';
    }
    return false;
  }

  /** The reference is defined by an InternalLink. */
  get isInternalLinkReference(): boolean {
    return XmlCAEXSchema.isInternalLink(this.element);
  }

  override get referenceID(): string | null {
    if (this.isInternalLinkReference && XmlCAEXSchema.caexSchema(this.element) === CAEXDocument_CAEXSchema.CAEX2_15) {
      return CAEXPathBuilder.internalElementIDInInternalLinkReference(this.referenceAttributeValue).result;
    }
    if (this.isAttribute) {
      return CAEXPathBuilder.instanceIDInAttributeReference(this.referenceAttributeValue, XmlCAEXSchema.caexDocument(this.element)).result;
    }
    return super.referenceID;
  }

  override get referenceName(): string | null {
    if (this.isInternalLinkReference && XmlCAEXSchema.caexSchema(this.element) === CAEXDocument_CAEXSchema.CAEX2_15) {
      return CAEXPathBuilder.externalInterfaceNameInInternalLinkReference(this.referenceAttributeValue).result;
    }
    if (this.isAttribute) {
      const path = CAEXPathBuilder.attributePathInAttributeReference(this.referenceAttributeValue, XmlCAEXSchema.caexDocument(this.element)).result;
      return path.length > 0 ? path[path.length - 1]! : null;
    }
    return super.referenceName;
  }

  constructor(element: XElement, referenceAttributeName: string | null) {
    super(element, referenceAttributeName);
  }

  /** The InternalLink reference names the ExternalInterface with the provided name. */
  linkReferenceHasInterface(name: string | null): boolean {
    return CAEXPathBuilder.externalInterfaceNameInInternalLinkReference(this.referenceAttributeValue).result === name;
  }

  override update(referencedElement: XElement | null, oldID: string | null, newID: string | null): boolean {
    if (isNullOrWhiteSpace(newID)) {
      this.setValue(referencedElement, null);
      return false;
    }
    if (XmlCAEXAttributes.caexidOfElement(referencedElement) === newID && oldID !== null) {
      if (isNullOrEmpty(this.referenceAttributeValue)) {
        this.setValue(referencedElement, newID);
      } else {
        this.setValue(referencedElement, replaceString(this.referenceAttributeValue, oldID, newID));
      }
    }
    return true;
  }

  /** Updates an attribute mirror reference after a change of the path of the master attribute. */
  updateAttributeReference(referencedElement: XElement | null, oldPath: string | null, newPath: string | null): boolean {
    if (!this.isAttribute) {
      return true;
    }
    // string.StartsWith(string) compares with the current culture.
    if (oldPath !== null && cultureStartsWith(this.referenceAttributeValue!, oldPath)) {
      if (isNullOrWhiteSpace(newPath)) {
        this.setValue(referencedElement, null);
        return false;
      }
      this.setValue(referencedElement, replaceString(this.referenceAttributeValue!, oldPath, newPath));
    }
    return true;
  }

  /** Updates an InternalLink reference after a change of the name of the ExternalInterface. */
  updateInternalLinkReference(xElement: XElement | null, oldName: string | null, newName: string | null): boolean {
    if (!this.isInternalLinkReference) {
      return true;
    }
    if (this.linkReferenceHasInterface(oldName)) {
      if (isNullOrWhiteSpace(newName)) {
        this.setValue(xElement, null);
        return false;
      }
      if (oldName !== null) {
        this.setValue(xElement, replaceString(this.referenceAttributeValue!, oldName, newName));
      }
    }
    return true;
  }
}
