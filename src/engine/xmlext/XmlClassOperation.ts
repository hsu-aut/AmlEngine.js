// Port of Aml.Engine.Xml.Extensions.XmlClassOperation (Aml.Engine 4.5.2).

import { isNullOrEmpty } from '../../system/strings.js';
import { Enumerable, from } from '../../system/linq.js';
import { XName, type XElement, type XNameLike, type XNode } from '../../xml/index.js';
import { CAEXPathBuilder } from '../caex/extensions/CAEXPathBuilder.js';
import { CollectionExtensions } from '../caex/extensions/CollectionExtensions.js';
import { XmlCAEXAttributes } from './XmlCAEXAttributes.js';
import { XmlCAEXSchema } from './XmlCAEXSchema.js';

/** Internal extension methods for CAEX class elements (inheritance by path reference). */
export class XmlClassOperation {
  private constructor() {}

  /** Gets the XML element of the base class referenced by the provided class element. */
  static baseClass(caexClass: XElement): XElement | null {
    const refAttributeName = XmlClassOperation.baseClassReferenceAttributeName(caexClass);
    const text = from(caexClass.attributes()).firstOrDefault((a) => a.name.localName === refAttributeName.localName)?.value ?? null;
    if (isNullOrEmpty(text)) {
      return null;
    }
    if ((caexClass.parent !== null ? XmlCAEXAttributes.caexNameOfElement(caexClass.parent) : null) === text) {
      return caexClass.parent;
    }
    const array: string[] = CAEXPathBuilder.pathNameArrayWithSeparator(text, XmlCAEXSchema.caexSchema(caexClass), true);
    if (CAEXPathBuilder.isAlias(array[0])) {
      return null;
    }
    let xElement: XElement | null = caexClass.document?.root ?? null;
    for (const parthPart of array) {
      xElement = xElement !== null ? from(xElement.elements()).firstOrDefault((el) => (el.attribute('Name')?.value ?? null) === parthPart) : null;
      if (xElement === null) {
        return null;
      }
    }
    return xElement;
  }

  /** The class element followed by all its base classes (lazy, like the C# iterator chain). */
  static getReferenceHierarchy(caexClassNode: XElement): Enumerable<XElement> {
    const xElement = XmlClassOperation.baseClass(caexClassNode);
    if (xElement !== null) {
      return new Enumerable(() => CollectionExtensions.yield(caexClassNode)[Symbol.iterator]()).concat(XmlClassOperation.getReferenceHierarchy(xElement));
    }
    return new Enumerable(() => CollectionExtensions.yield(caexClassNode)[Symbol.iterator]());
  }

  static isDerived(elementWithAttribute: XElement, elementWithDerivedAttributes: XElement, elementName: XNameLike, attributeName: string): boolean {
    const name = elementWithAttribute.attribute(attributeName)?.value ?? null;
    if (!isNullOrEmpty(name)) {
      const localName = (typeof elementName === 'string' ? XName.get(elementName) : elementName).localName;
      return from(elementWithDerivedAttributes.elements())
        .where((e) => localName === e.name.localName)
        .any((attribute) => (attribute.attribute(attributeName)?.value ?? null) === name);
    }
    return false;
  }

  static isDescendant(element: XElement | null, ancestor: XElement | null, includeSelf = true): boolean {
    if (includeSelf) {
      if (element !== ancestor) {
        return element !== null ? from(element.ancestors()).any((a) => a === ancestor) : false;
      }
      return true;
    }
    return element !== null ? from(element.ancestors()).any((a) => a === ancestor) : false;
  }

  static isFacetElement(xmlNode: XElement): boolean {
    const xElement = from(xmlNode.ancestors()).firstOrDefault((n) => n.name !== xmlNode.name);
    if (xElement === null || !XmlCAEXSchema.isFacet(xElement)) {
      return false;
    }
    const parent = xElement.parent;
    return parent !== null
      ? from(parent.elements(xmlNode.name)).any((d) => XmlCAEXAttributes.caexNameOfElement(d) === XmlCAEXAttributes.caexNameOfElement(xmlNode))
      : false;
  }

  static isOverridden(xmlNode: XElement): boolean {
    const xElement = from(xmlNode.ancestors()).firstOrDefault((n) => n.name !== xmlNode.name);
    if (xElement === null) {
      return false;
    }
    if (XmlCAEXSchema.isFacet(xElement)) {
      const parent = xElement.parent;
      return parent !== null
        ? from(parent.elements(xmlNode.name)).any((d) => XmlCAEXAttributes.caexNameOfElement(d) === XmlCAEXAttributes.caexNameOfElement(xmlNode))
        : false;
    }
    if (!XmlCAEXSchema.isCAEXClass(xElement)) {
      return false;
    }
    const baseClass = XmlClassOperation.baseClass(xElement);
    const hierarchy = baseClass !== null ? XmlClassOperation.getReferenceHierarchy(baseClass) : null;
    return hierarchy !== null
      ? hierarchy
          .where((b) => b !== null)
          .any((b) => from(b.elements(xmlNode.name)).any((d) => XmlCAEXAttributes.caexNameOfElement(d) === XmlCAEXAttributes.caexNameOfElement(xmlNode)))
      : false;
  }

  static library(node: XNode, tagName: XNameLike): XElement | null {
    return from(node.ancestors(tagName)).firstOrDefault();
  }

  static libraryName(node: XNode, tagName: XNameLike): string | null {
    const lib = from(node.ancestors(tagName)).firstOrDefault();
    return lib !== null ? XmlCAEXAttributes.caexNameOfElement(lib) : null;
  }

  static overriddenElements(xmlNode: XElement, attributeValue: string | null): Enumerable<XElement> {
    const xElement = from(xmlNode.ancestors()).firstOrDefault((n) => n.name !== xmlNode.name);
    if (xElement !== null && XmlCAEXSchema.isFacet(xElement)) {
      const parent = xElement.parent;
      if (parent === null) return Enumerable.empty<XElement>();
      return new Enumerable(() => parent.elements(xmlNode.name)).where((d) => XmlCAEXAttributes.caexNameOfElement(d) === attributeValue);
    }
    // C# dereferences xElement here without a null check (NullReferenceException when the
    // element has no ancestor with another name).
    if (!XmlCAEXSchema.isCAEXClass(xElement!)) {
      return Enumerable.empty<XElement>();
    }
    const baseClass = XmlClassOperation.baseClass(xElement!);
    const hierarchy = baseClass !== null ? XmlClassOperation.getReferenceHierarchy(baseClass) : null;
    if (hierarchy === null) return Enumerable.empty<XElement>();
    return hierarchy.selectMany((b) => new Enumerable(() => b.elements(xmlNode.name)).where((d) => XmlCAEXAttributes.caexNameOfElement(d) === attributeValue));
  }

  private static baseClassReferenceAttributeName(caexClass: XElement): XName {
    return XName.get(XmlCAEXSchema.isAttributeType(caexClass) ? 'RefAttributeType' : 'RefBaseClassPath');
  }
}
