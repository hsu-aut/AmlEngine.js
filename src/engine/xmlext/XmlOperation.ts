// Port of Aml.Engine.Xml.Extensions.XmlOperation (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { implementsInterface } from '../interfaces.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { Enumerable, from, type IEqualityComparer } from '../../system/linq.js';
import { toXName, XElement, XName, type XAttribute, type XNameLike } from '../../xml/index.js';
import { CAEXPathBuilder } from '../caex/extensions/CAEXPathBuilder.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { XmlCAEXAttributes } from './XmlCAEXAttributes.js';
import { XmlCAEXSchema } from './XmlCAEXSchema.js';
import type { CAEXObject } from '../caex/CAEXObject.js';
import type { CAEXWrapper } from '../caex/CAEXWrapper.js';
import type { IClassWithBaseClassReference_1 } from '../caex/IClassWithBaseClassReference.js';

/** `default(decimal) != value` for the decimal returned by XmlSchemaManager.MinOccurence. */
function decimalIsNotZero(value: unknown): boolean {
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'bigint') return value !== 0n;
  return Number(String(value)) !== 0;
}

/** C# string.Replace(oldValue, newValue): ordinal, all occurrences (oldValue is never empty here). */
function replaceAll(s: string, oldValue: string, newValue: string | null): string {
  return s.split(oldValue).join(newValue ?? '');
}

/**
 * Extension methods for XElements, to query CAEX properties of an XElement without using a
 * CAEXWrapper for it.
 */
export class XmlOperation {
  private constructor() {}

  private static UpdateReferences = true;

  private static RefCount = 0;

  /** ID map of the current copy operation (set while references are not updated). */
  static idMap: Map<string, string> | null = null;

  /**
   * Wraps the provided XML element into an element specific CAEXWrapper object.
   * @returns The specific CAEXWrapper object if the element is a CAEX element; otherwise null.
   */
  static createCAEXWrapper(element: XElement | null): CAEXWrapper | null {
    if (element !== null && element !== undefined) {
      const r = T.CAEXTypeDictionary.instance.tryGetCreator(element.name.localName);
      if (r.result) {
        return r.creatorFunc!(element);
      }
      return null;
    }
    throw new ArgumentNullException('element');
  }

  /**
   * Gets the elements with the specified CAEX tag name from the provided class and all its base
   * classes, including those marked as deleted. With a comparer, elements of a base class equal
   * to an element of the derived class are excluded.
   */
  static allElementsFromBaseClassAndSelf(
    caexClass: IClassWithBaseClassReference_1<CAEXObject>,
    tagName: string,
    elementsAreEqual: IEqualityComparer<XElement> | null,
  ): Enumerable<XElement> {
    const baseClass = caexClass.baseClass;
    if (!implementsInterface(baseClass, 'IClassWithBaseClassReference_1')) {
      const node = caexClass.node as XElement;
      const name = XmlCAEXSchema.xName(node, tagName);
      return new Enumerable(() => node.elements(name));
    }
    const caexClass2 = baseClass as unknown as IClassWithBaseClassReference_1<CAEXObject>;
    const enumerable =
      elementsAreEqual !== null
        ? XmlOperation.allElementsFromBaseClassAndSelf(caexClass2, tagName, elementsAreEqual)
        : XmlOperation.allElementsFromBaseClassAndSelf(caexClass2, tagName, null);
    const node = caexClass.node as XElement;
    const second = [...node.elements(XmlCAEXSchema.xName(node, tagName))];
    return (elementsAreEqual !== null ? enumerable.except(second, elementsAreEqual) : enumerable).concat(second);
  }

  /**
   * Gets the elements with the specified CAEX tag name from the provided class and all its base
   * classes, without those marked as deleted.
   */
  static existingElementsFromBaseClassAndSelf(
    caexClass: IClassWithBaseClassReference_1<CAEXObject>,
    tagName: string,
    elementsAreEqual: IEqualityComparer<XElement> | null,
  ): Enumerable<XElement> {
    return XmlOperation.allElementsFromBaseClassAndSelf(caexClass, tagName, elementsAreEqual).where(
      (e) => (e.attribute('ChangeMode')?.value ?? null) !== 'delete',
    );
  }

  /**
   * Gets the first child element of the provided parent; with `localName`, the first child
   * element with that local name.
   * @returns The first element if one exists; otherwise null.
   */
  static firstElement(parent: XElement, localName?: string | null): XElement | null {
    if (typeof localName === 'string' || localName === null) {
      const firstNode = parent.firstNode;
      if (firstNode !== null) {
        if (firstNode instanceof XElement && firstNode.name.localName === localName) {
          return firstNode;
        }
        return from(parent.firstNode!.elementsAfterSelf()).firstOrDefault((n) => n.name.localName === localName);
      }
      return null;
    }
    let obj: XElement | null;
    if (parent.firstNode !== null) {
      obj = parent.firstNode instanceof XElement ? parent.firstNode : null;
      if (obj === null) {
        return from(parent.firstNode.elementsAfterSelf()).firstOrDefault();
      }
    } else {
      obj = null;
    }
    return obj;
  }

  /**
   * Gets the element with the specified name from the owner. If it does not exist and content is
   * not null, it is appended with the content. If content is null and the element is optional,
   * an existing element is removed (`isDeleted`).
   */
  static getOrAppendChildIfContentNotNull(
    owner: XElement | null,
    elementName: XNameLike,
    content: unknown,
  ): { result: XElement | null; isDeleted: boolean } {
    let isDeleted = false;
    if (owner === null || owner === undefined) {
      throw new ArgumentNullException('owner');
    }
    const name: XName = toXName(elementName);
    let xElement = owner.element(name);
    if (content === null || content === undefined) {
      if (xElement === null || decimalIsNotZero(XmlCAEXSchema.schemaManager(xElement).minOccurence(owner.name, xElement.name))) {
        return { result: xElement, isDeleted };
      }
      isDeleted = true;
      T.RemoveCmd.removeElement(xElement);
      return { result: null, isDeleted };
    }
    if (xElement === null) {
      xElement = T.AddNewCmd.addNewElement(owner, name, content);
    }
    return { result: xElement, isDeleted };
  }

  /**
   * Gets the ExternalInterface referenced by the provided InternalLink attribute value (or by
   * `nameReference` if given).
   */
  static interfaceFromInternalLinkAttribute(internalLinkAttribute: XAttribute | null, nameReference: string | null = null): XElement | null {
    if (internalLinkAttribute === null || internalLinkAttribute === undefined) {
      throw new ArgumentNullException('internalLinkAttribute');
    }
    if (internalLinkAttribute.parent === null) {
      return null;
    }
    let path: string | null = internalLinkAttribute.value;
    if (!isNullOrEmpty(nameReference)) {
      path = nameReference;
    }
    const pathParts: string[] = CAEXPathBuilder.pathNameArray(path, XmlCAEXSchema.caexSchema(internalLinkAttribute.parent));
    switch (pathParts.length) {
      case 1:
        return ServiceLocator.queryService.findByID(T.CAEXDocument.document(internalLinkAttribute.parent), pathParts[0])?.node ?? null;
      case 2: {
        const caexObject = ServiceLocator.queryService.findByID(T.CAEXDocument.document(internalLinkAttribute.parent), pathParts[0]);
        if (caexObject === null || caexObject === undefined) return null;
        const node = caexObject.node as XElement;
        return from(node.elements(XmlCAEXSchema.xName(caexObject.node, 'ExternalInterface'))).firstOrDefault(
          (n) => XmlCAEXAttributes.caexNameOfElement(n) === pathParts[1],
        );
      }
      default:
        return null;
    }
  }

  /** Gets the master Attribute referenced by the provided RefAttributeType value (or `nameReference`). */
  static masterAttribute(refAttribute: XAttribute | null, nameReference: string | null = null): XElement | null {
    // The C# code reads refAttribute.Value before its null check (NullReferenceException).
    let path: string | null = refAttribute!.value;
    if (!isNullOrEmpty(nameReference)) {
      path = nameReference;
    }
    if (refAttribute !== null) {
      if (refAttribute.parent !== null) {
        return ServiceLocator.queryService.findByPath(T.CAEXDocument.document(refAttribute.parent), path)?.node ?? null;
      }
      return null;
    }
    throw new ArgumentNullException('refAttribute');
  }

  /**
   * Gets the last child element of the parent; with `name`, the last child element with that name.
   * @returns The last child or null, if no (matching) child exists.
   */
  static lastElement(parent: XElement, name?: XNameLike): XElement | null {
    if (typeof name === 'string' || name instanceof XName) {
      const xname = toXName(name);
      if (parent.lastNode !== null) {
        const last = parent.lastNode;
        if (!(last instanceof XElement) || !(last.name === xname)) {
          return from(parent.elements(xname)).lastOrDefault();
        }
        return last;
      }
      return null;
    }
    let obj: XElement | null;
    if (parent.lastNode !== null) {
      obj = parent.lastNode instanceof XElement ? parent.lastNode : null;
      if (obj === null) {
        return from(parent.elements()).lastOrDefault();
      }
    } else {
      obj = null;
    }
    return obj;
  }

  static setUpdateReference(updateReference: boolean): void {
    if (updateReference) {
      XmlOperation.RefCount--;
    } else {
      XmlOperation.RefCount++;
    }
    if (updateReference) {
      if (XmlOperation.RefCount === 0) {
        XmlOperation.UpdateReferences = true;
        XmlOperation.idMap = null;
      }
    } else if (XmlOperation.RefCount === 1) {
      XmlOperation.UpdateReferences = false;
      XmlOperation.idMap = new Map<string, string>();
    }
  }

  static makeUnique(copied: XElement): void {
    if (!XmlOperation.UpdateReferences && XmlOperation.RefCount === 0) {
      XmlOperation.UpdateReferences = true;
    }
    const dictionary = XmlOperation.UpdateReferences ? new Map<string, string>() : XmlOperation.idMap!;
    const list: { Attribute: XAttribute; ID: string }[] = [];
    for (const item of copied.descendantsAndSelf()) {
      const text = item.attribute('ID')?.value ?? null;
      const value: string = ServiceLocator.idService.generateNewID(item);
      if (!isNullOrEmpty(text)) {
        dictionary.set(text, value);
        item.setAttributeValue('ID', dictionary.get(text));
      } else if (XmlCAEXSchema.isElementWithMandatoryID(item)) {
        item.setAttributeValue('ID', value);
      }
      if (XmlOperation.UpdateReferences && XmlCAEXSchema.isElementWithIDReference(item)) {
        XmlOperation.changeIDRef(item, dictionary, XmlCAEXSchema.idReferenceAttributes(item), list);
      }
    }
    if (!XmlOperation.UpdateReferences) {
      return;
    }
    for (const item2 of list) {
      const value2 = dictionary.get(item2.ID);
      if (value2 !== undefined) {
        item2.Attribute.value = replaceAll(item2.Attribute.value, item2.ID, value2);
      } else if (XmlCAEXSchema.isInternalLink(item2.Attribute.parent!) && item2.Attribute.parent?.parent != null) {
        item2.Attribute.parent?.remove();
      }
    }
  }

  private static changeIDRef(
    element: XElement,
    idMap: Map<string, string>,
    refAttributeName: string[],
    referenceAttributes: { Attribute: XAttribute; ID: string }[],
  ): void {
    for (let i = 0; i < refAttributeName.length; i++) {
      const xAttribute = element.attribute(refAttributeName[i]);
      const text = xAttribute?.value ?? null;
      if (isNullOrEmpty(text)) {
        continue;
      }
      let text2: string | null;
      if (XmlCAEXSchema.isInternalLink(element) && XmlCAEXSchema.caexSchema(element) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
        text2 = CAEXPathBuilder.internalElementIDInInternalLinkReference(text).result;
        if (isNullOrEmpty(text2)) {
          continue;
        }
      } else {
        if (!(refAttributeName[i] === 'RefAttributeType')) {
          text2 = text;
          const value = idMap.get(text2);
          if (value !== undefined) {
            xAttribute!.value = value;
          } else {
            referenceAttributes.push({ Attribute: xAttribute!, ID: text2 });
          }
          continue;
        }
        text2 = XmlCAEXAttributes.attributeMasterID(element);
      }
      if (!isNullOrEmpty(text2)) {
        const value2 = idMap.get(text2);
        if (value2 !== undefined) {
          xAttribute!.value = replaceAll(text, text2, value2);
        } else {
          referenceAttributes.push({ Attribute: xAttribute!, ID: text2 });
        }
      }
    }
  }
}
