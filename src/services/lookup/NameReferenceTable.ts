// Port of Aml.Engine.Services.Lookup.NameReferenceTable (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { CAEXFileType } from '../../engine/caex/CAEXFileType.js';
import { XmlCAEXSchema } from '../../engine/xmlext/XmlCAEXSchema.js';
import { XmlClassOperation } from '../../engine/xmlext/XmlClassOperation.js';
import { Dictionary, Enumerable, from } from '../../system/linq.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import type { CAEXBasicObject } from '../../engine/caex/CAEXBasicObject.js';
import { CAEXNodeReference } from './CAEXNodeReference.js';
import { LookupTables } from './LookupTables.js';
import { LookupService } from '../LookupService.js';
import type { IDTable } from './IDTable.js';

/** C# `list.Remove(item)`: removes the first occurrence (reference equality). */
function removeItem<X>(list: X[], item: X): boolean {
  const i = list.indexOf(item);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

/** The references by name (overridden elements, mappings), by the referenced element. */
export class NameReferenceTable extends Dictionary<XElement, CAEXNodeReference[]> {
  private readonly unresolvedNameReferences: CAEXNodeReference[] = [];

  /** The ID table of the document (its InternalLinks or attribute mirrors are name references too). */
  idTable: IDTable | null = null;

  /** Registers the name reference to the element (an unresolved reference, if the element is null). */
  addReference(referencedElement: XElement | null, cAEXNodeReference: CAEXNodeReference): void {
    if (referencedElement === null) {
      this.unresolvedNameReferences.push(cAEXNodeReference);
      return;
    }
    let value = this.tryGetValue(referencedElement).value;
    if (value === null) {
      value = [];
      this.setItem(referencedElement, value);
    }
    value.push(cAEXNodeReference);
    LookupService.lookUpService!.onReferenceUpdate(referencedElement, cAEXNodeReference, null, cAEXNodeReference.referenceAttributeValue);
  }

  /** The element has changed its name: the references to it are updated. */
  changeName(xElement: XElement, oldName: string | null, newName: string | null): void {
    const value = this.tryGetValue(xElement).value;
    if (value !== null) {
      for (const item of value) {
        item.setValue(xElement, newName);
        if (XmlCAEXSchema.isElementWithNameOnlyReference(item.element)) {
          this.changeName(item.element, oldName, newName);
        }
      }
    }
    for (const item2 of this.unresolvedNameReferences.slice()) {
      if (XmlCAEXSchema.referencedElement(item2.element, null) === xElement) {
        removeItem(this.unresolvedNameReferences, item2);
        this.addReference(xElement, item2);
      }
    }
  }

  private getUnresolvedNameRef(cAEXElement: XElement, cAEXAttributeName: string | null): CAEXNodeReference | null {
    for (const unresolvedNameReference of this.unresolvedNameReferences) {
      if (unresolvedNameReference.element === cAEXElement && unresolvedNameReference.referenceAttributeName === cAEXAttributeName) {
        return unresolvedNameReference;
      }
    }
    return null;
  }

  private deleteNameReference(referencedElement: XElement, cAEXElement: XElement, cAEXAttributeName: string | null): void {
    const value = this.tryGetValue(referencedElement).value;
    if (value !== null) {
      // List.RemoveAll
      let j = 0;
      for (let i = 0; i < value.length; i++) {
        const c = value[i]!;
        if (!(c.element === cAEXElement && cAEXAttributeName === c.referenceAttributeName)) {
          value[j++] = c;
        }
      }
      value.length = j;
      if (value.length === 0) {
        this.remove(referencedElement);
      }
    }
  }

  /** A name reference has changed: the reference is registered at the newly referenced element. */
  changeNameReference(cAEXElement: XElement, cAEXAttributeName: string | null, oldNameRef: string | null, newNameRef: string | null): void {
    let unresolvedNameRef: CAEXNodeReference | null;
    if ((unresolvedNameRef = this.getUnresolvedNameRef(cAEXElement, cAEXAttributeName)) !== null) {
      removeItem(this.unresolvedNameReferences, unresolvedNameRef);
    } else {
      const xAttribute = cAEXElement.attribute(cAEXAttributeName!);
      const xElement = xAttribute !== null ? XmlCAEXSchema.referencedElement(xAttribute, oldNameRef) : null;
      if (xElement !== null) {
        this.deleteNameReference(xElement, cAEXElement, cAEXAttributeName);
      }
    }
    if (newNameRef !== null) {
      unresolvedNameRef = new CAEXNodeReference(cAEXElement, cAEXAttributeName);
      const xAttribute2 = cAEXElement.attribute(cAEXAttributeName!);
      this.addReference(xAttribute2 !== null ? XmlCAEXSchema.referencedElement(xAttribute2, null) : null, unresolvedNameRef);
    }
  }

  /** Removes the element: the references to it are cleared, its own name references are removed. */
  delete(xElement: XElement): void {
    const value = this.tryGetValue(xElement).value;
    if (value !== null) {
      value.forEach((r) => r.setValue(xElement, null));
      this.remove(xElement);
      return;
    }
    const array = XmlCAEXSchema.nameReferenceAttributes(xElement);
    for (const text of array) {
      const r = LookupTables.attributeHasValue(xElement, text);
      if (r.result) {
        this.changeNameReference(xElement, text, r.value, null);
      }
    }
  }

  /** All name references from the elements below (or including) the object, optionally with the element name. */
  getAllElementsWithNameReference(caexObject: CAEXBasicObject, elementName: string | null): Enumerable<CAEXNodeReference> {
    const enumerable = from(this.unresolvedNameReferences)
      .concat(new Enumerable(() => this.values()).selectMany((v) => v))
      .concat(this.idTable?.nameReferences ?? Enumerable.empty<CAEXNodeReference>());
    if (isNullOrEmpty(elementName)) {
      if (caexObject instanceof CAEXFileType) {
        return enumerable;
      }
      return enumerable.where((v) => XmlClassOperation.isDescendant(v.element, caexObject.node, true));
    }
    if (caexObject instanceof CAEXFileType) {
      return enumerable.where((v) => v.element.name.localName === elementName);
    }
    return enumerable.where((v) => v.element.name.localName === elementName && XmlClassOperation.isDescendant(v.element, caexObject.node, true));
  }
}
