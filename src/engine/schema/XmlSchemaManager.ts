import { validateXDocument } from './validation/index.js';
// Port of Aml.Engine.Schema.XmlSchemaManager.
//
// The C# constructor compiles an XSD stream with System.Xml.Schema and fills the Elements
// dictionary by walking the compiled schema. The port takes the dictionary exactly as the
// engine computed it (SchemaData, exported by the oracle, see SchemaModel.ts). Validation against
// validation is done by src/engine/schema/validation (verified against the .NET validator).

import { XAttribute, XElement, XName, XNamespace, type XContainer, type XNameLike, type XObject, type XDocument } from '../../xml/index.js';
import { NotImplementedException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { from } from '../../system/linq.js';
import { XmlTypeCode } from '../../system/XmlTypeCode.js';
import { T } from '../registry.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import { XmlTypeCodeExtensions } from './XmlTypeCodeExtensions.js';
import {
  XmlSchemaComplexType,
  XmlSchemaSimpleType,
  XmlSchemaUse,
  type SchemaData,
  type XmlSchemaAttribute,
  type XmlSchemaElement,
  type XmlSchemaFacet,
} from './SchemaModel.js';
import type { XmlSchemaElementInfo } from './XmlSchemaElementInfo.js';

/** A particle as seen by the private CanAddNew: whether it is a choice, and its maxOccurs. */
interface ParticleInfo {
  isChoice: boolean;
  maxOccurs: number;
}

/** `XName` from a C# string (implicit conversion; null stays null). */
function toName(n: XNameLike | null | undefined): XName | null {
  if (n === null || n === undefined) return null;
  return typeof n === 'string' ? XName.get(n) : n;
}

/**
 * Supports the creation of schema conform XML documents for a given schema: elements with all
 * required attributes, child elements and default values, and insertion of new children at
 * schema conform positions.
 */
export abstract class XmlSchemaManager {
  /** @internal */
  static readonly NsXhtml = 'http://www.w3.org/1999/xhtml';

  /** @internal */
  static readonly NsXsi = 'http://www.w3.org/2001/XMLSchema-instance';

  /**
   * @internal The schema elements of all children in a parent child relation, keyed by the
   * local name of the parent followed by the local name of the child (and by the name of global
   * elements).
   */
  readonly elements = new Map<string, XmlSchemaElementInfo>();

  /** @internal */
  xmlns: XNamespace = XNamespace.get('http://www.w3.org/2000/xmlns/');

  /** @internal */
  xsi: XNamespace = XNamespace.get('http://www.w3.org/2001/XMLSchema-instance');

  /** Gets the schema namespace. */
  namespace: XNamespace = XNamespace.None;

  /** Gets the schema location attribute name. */
  abstract get schemaLocation(): XName;

  private _schemaSet: SchemaData | null = null;

  /** The compiled schema (XmlSchemaSet in C#): here the exported schema tables. */
  get schemaSet(): SchemaData | null {
    return this._schemaSet;
  }

  /** The parsed schema (XmlSchema in C#): here the exported schema tables. */
  protected schema: SchemaData | null = null;

  /** Creates an instance of the schema manager for the given (compiled) schema. */
  protected constructor(schemaData: SchemaData, targetNamespace: XNamespace | string) {
    this.parseSchema('', typeof targetNamespace === 'string' ? XNamespace.get(targetNamespace) : targetNamespace, schemaData);
  }

  /** Determines if the schema element accepts values of any type. */
  static acceptsAny(schemaElement: XmlSchemaElement): boolean {
    return schemaElement.acceptsAny;
  }

  /**
   * AttributeValueType(XmlSchemaAttribute): the type code for the schema attribute.
   * (The instance method attributeValueType(parentName, childName, attributeName) is the other
   * overload.)
   */
  static attributeValueType(schemaAttribute: XmlSchemaAttribute | null): XmlTypeCode {
    if ((schemaAttribute?.attributeSchemaType ?? null) !== null) {
      return schemaAttribute!.typeCode;
    }
    return XmlTypeCode.None;
  }

  /** Determines if the schema defines a choice of only one element for the schema element. */
  static isChoiceForOneElement(schemaElement: XmlSchemaElement): boolean {
    return schemaElement.isChoiceForOneElement;
  }

  /**
   * Creates a new element with the provided content and inserts it to the parent according to
   * this schema.
   */
  addNew(parent: XElement, childName: XNameLike, content: unknown): XElement | null {
    const xElement = new XElement(childName, content);
    if (!this.insert(parent, xElement)) {
      return null;
    }
    return xElement;
  }

  /** Creates a new element with the provided content and inserts it behind the sibling. */
  addNewAfterSelf(siblingBefore: XElement, childName: XNameLike, content: unknown): XElement {
    const xElement = new XElement(childName, content);
    siblingBefore.addAfterSelf(xElement);
    return xElement;
  }

  /** Gets the attribute names of the specified child element of the specified parent element. */
  attributeNames(parentName: XNameLike | null, childName: XNameLike | null, required = false): Iterable<string> {
    return from(this.attributes(parentName, childName, required)).select((a) => a.name);
  }

  /**
   * Gets the schema attributes of the child element in the parent child relation (only the
   * required ones, if required is true).
   */
  attributes(parentName: XNameLike | null, childName: XNameLike | null, required = false): Iterable<XmlSchemaAttribute> {
    const r = this.xmlSchemaInfo(parentName, childName);
    if (!r.result) {
      return [];
    }
    return required ? r.info!.requiredAttributes : r.info!.allAttributes;
  }

  /**
   * Gets the value restrictions (facets) of the attribute with the given name of the child in the
   * parent child relation.
   */
  *attributeValueRestrictions(parentName: XNameLike | null, childName: XNameLike | null, attributeName: string): Generator<XmlSchemaFacet> {
    const type = from(this.attributes(parentName, childName)).firstOrDefault((a) => a.name === attributeName)?.attributeSchemaType ?? null;
    // AttributeSchemaType.Content is XmlSchemaSimpleTypeRestriction (not a union or a list).
    if (type === null || type.union !== null || type.list !== null) {
      return;
    }
    for (const facet of type.facets) {
      yield facet;
    }
  }

  /**
   * Instance overload AttributeValueType(parentName, childName, attributeName): the type code of
   * the attribute value (XmlTypeCode.Item for any type).
   */
  attributeValueType(parentName: XNameLike | null, childName: XNameLike | null, attributeName: string): XmlTypeCode {
    const xmlSchemaAttribute = from(this.attributes(parentName, childName)).firstOrDefault((a) => a.name === attributeName) ?? null;
    if (xmlSchemaAttribute !== null) {
      return XmlSchemaManager.attributeValueType(xmlSchemaAttribute);
    }
    return XmlTypeCode.None;
  }

  /**
   * Determines if a child with the specified name can be added to the parent node, checking the
   * occurrences defined in the schema.
   */
  canAddNew(parent: XElement, childName: XNameLike): boolean {
    const r = this.xmlSchemaInfo(parent.name, childName);
    if (r.result) {
      const e = r.info!.schemaElement;
      const particle: ParticleInfo | null = e.parentKind === null ? null : { isChoice: e.parentIsChoice, maxOccurs: e.parentMaxOccurs ?? 1 };
      return XmlSchemaManager.canAddNew(particle, parent, toName(childName)!);
    }
    return false;
  }

  /** Gets the names of all elements which can be added to the child of the parent. */
  childElementNames(parentName: XNameLike | null, childName: XNameLike | null, includeChoice: boolean): Iterable<XName> {
    const r = this.xmlSchemaInfo(parentName, childName);
    if (r.result) {
      return includeChoice ? r.info!.optional : r.info!.withoutChoice;
    }
    return [];
  }

  /** Gets the schema elements of all elements which can be added to the child of the parent. */
  childElements(parentName: XNameLike | null, childName: XNameLike | null, includeChoice = false): Iterable<XmlSchemaElement> {
    const r = this.xmlSchemaInfo(parentName, childName);
    if (!r.result) {
      return [];
    }
    return r.info!.getChildElements(includeChoice);
  }

  /** Gets the names of all alternative children (choices) of the child in the parent. */
  choices(parentName: XNameLike | null, childName: XNameLike | null): Iterable<XName> {
    const r = this.xmlSchemaInfo(parentName, childName);
    if (!r.result) {
      return [];
    }
    return r.info!.choices;
  }

  /** Creates the attribute with the provided name, if it is defined in this schema. */
  createAttribute(element: XElement, attributeName: string): XAttribute | null {
    const r = this.xmlSchemaInfo(element.parent?.name ?? null, element.name);
    if (!r.result) {
      return null;
    }
    const xmlSchemaAttribute = from(r.info!.allAttributes).firstOrDefault((a) => a.name === attributeName) ?? null;
    if (xmlSchemaAttribute !== null) {
      return XmlSchemaManager.createAttribute(element, xmlSchemaAttribute);
    }
    return null;
  }

  /**
   * Creates a new node with all required attributes and elements (not inserted into the tree).
   * Can be overridden by specific schema managers.
   */
  createElement(parentName: XNameLike | null, childName: XNameLike, allAttributes = false): XElement | null {
    const r = this.xmlSchemaInfo(parentName, childName);
    if (!r.result) {
      return null;
    }
    return this.createElementFromInfo(r.info!, toName(childName)!, allAttributes);
  }

  /**
   * Gets the annotation of a schema element or schema attribute, as defined in the schema
   * (GetAnnotation(XmlSchemaElement), GetAnnotation(XmlSchemaAttribute),
   * GetAnnotation(XmlSchemaAnnotated)). The annotations are the ones the engine computed.
   */
  getAnnotation(schemaElement: XmlSchemaElement | XmlSchemaAttribute | null): string {
    if (schemaElement === null || schemaElement === undefined) {
      return '';
    }
    return schemaElement.annotation ?? '';
  }

  /**
   * Determines whether the content of the child in the parent is restricted to a choice of
   * elements; onlyOne is true, if not more than one element can be added.
   */
  hasChoiceOfElements(parentName: XNameLike | null, childName: XNameLike | null): { result: boolean; onlyOne: boolean } {
    let onlyOne = false;
    const r = this.xmlSchemaInfo(parentName, childName);
    if (!r.result) {
      return { result: false, onlyOne };
    }
    const xmlSchemaComplexType = r.info!.schemaElement.elementSchemaType;
    if (!(xmlSchemaComplexType instanceof XmlSchemaComplexType)) {
      return { result: false, onlyOne };
    }
    const particle = xmlSchemaComplexType.contentTypeParticle;
    if (!(particle !== null && particle.kind === 'choice')) {
      return { result: false, onlyOne };
    }
    onlyOne = particle.maxOccurs === 1;
    return { result: true, onlyOne };
  }

  /**
   * Determines if the schema defines a sequence of simple elements (a sequence of one xs:any)
   * for the parent child combination.
   */
  hasSequenceOfSimpleElements(parentName: XNameLike | null, childName: XNameLike | null): { result: boolean; onlyOne: boolean } {
    let onlyOne = false;
    const r = this.xmlSchemaInfo(parentName, childName);
    if (!r.result) {
      return { result: false, onlyOne };
    }
    const xmlSchemaComplexType = r.info!.schemaElement.elementSchemaType;
    if (!(xmlSchemaComplexType instanceof XmlSchemaComplexType)) {
      return { result: false, onlyOne };
    }
    const xmlSchemaSequence = xmlSchemaComplexType.contentTypeParticle;
    if (!(xmlSchemaSequence !== null && xmlSchemaSequence.kind === 'sequence')) {
      return { result: false, onlyOne };
    }
    onlyOne = xmlSchemaSequence.maxOccurs === 1;
    const items = xmlSchemaSequence.items;
    if (items !== null && items.length === 1) {
      return { result: items[0].kind === 'any', onlyOne };
    }
    return { result: false, onlyOne };
  }

  /** Inserts an existing child node into the child nodes of the parent, at the schema position. */
  insert(parent: XElement, child: XElement): boolean {
    const r = this.xmlSchemaInfo(parent.name, child.name);
    if (r.result) {
      return this.insertWithInfo(r.info!, parent, child);
    }
    return false;
  }

  /**
   * Creates a new node with the child name and inserts it into the parent. Can be overridden by
   * specific schema managers.
   */
  insertNew(parent: XElement, childName: XNameLike, allAttributes = false): XElement | null {
    const r = this.xmlSchemaInfo(parent.name, childName);
    if (!r.result) {
      return null;
    }
    return this.insertNewWithInfo(r.info!, parent, toName(childName)!, allAttributes);
  }

  /** Determines whether the child in the parent is part of a choice (otherwise of a sequence). */
  isChoice(parentName: string | null, childName: string | null): boolean {
    const r = this.xmlSchemaInfo(parentName, childName);
    if (r.result) {
      return r.info!.schemaElement.parentIsChoice;
    }
    return false;
  }

  /** Determines if the attribute is defined for the child in the parent. */
  isDefinedAttribute(parentName: XNameLike | null, childName: XNameLike | null, attributeName: string): boolean {
    return (from(this.attributes(parentName, childName)).firstOrDefault((a) => a.name === attributeName) ?? null) !== null;
  }

  /** Determines if the parent is allowed to contain a child with the provided name. */
  isParent(parent: XElement, childName: XNameLike): boolean {
    return this.elements.has(parent.name.localName + toName(childName)!.localName);
  }

  /** Determines if the attribute is required for the parent child combination. */
  isRequiredAttribute(parentName: XNameLike | null, childName: XNameLike | null, attributeName: string): boolean {
    const xmlSchemaAttribute = from(this.attributes(parentName, childName)).firstOrDefault((a) => a.name === attributeName) ?? null;
    if (xmlSchemaAttribute === null) {
      return false;
    }
    return xmlSchemaAttribute.use === XmlSchemaUse.Required;
  }

  /**
   * The maximal occurrence of the child in the parent (Infinity for unbounded, decimal.MaxValue in
   * C#); 0 if the relation does not exist.
   */
  maxOccurence(parentName: string | null, childName: string | null): number {
    const r = this.xmlSchemaInfo(parentName, childName);
    if (!r.result) {
      return 0;
    }
    return r.info!.schemaElement.maxOccurs;
  }

  /** The minimal occurrence of the child in the parent; -1 if the relation does not exist. */
  minOccurence(parentName: XNameLike | null, childName: XNameLike | null): number {
    const r = this.xmlSchemaInfo(parentName, childName);
    if (!r.result) {
      return -1;
    }
    return r.info!.schemaElement.minOccurs;
  }

  /** Gets the schema element for the parent child combination, or null. */
  schemaElement(parentName: XNameLike | null, childName: XNameLike | null): XmlSchemaElement | null {
    const r = this.xmlSchemaInfo(parentName, childName);
    if (!r.result) {
      return null;
    }
    return r.info!.schemaElement;
  }

  /**
   * The child of the parent after which a new child with the name has to be inserted, or null if
   * it has to be prepended.
   */
  siblingBefore(parent: XElement, childName: XNameLike): XElement | null {
    const r = this.xmlSchemaInfo(parent.name, childName);
    if (!r.result) {
      return null;
    }
    return this.siblingBeforeWithInfo(r.info!, parent, toName(childName)!);
  }

  /**
   * Validates a document against this schema. Not available yet: XSD validation is not ported,
   * this method throws NotImplementedException.
   */
  validate(source: XDocument): { result: boolean; messages: string[] } {
    return validateXDocument(source, this.namespace === XNamespace.None ? '2.15' : '3.0');
  }


  /** The type code of a value of the child in the parent. */
  valueType(parentName: XNameLike | null, childName: XNameLike | null): XmlTypeCode {
    const r = this.xmlSchemaInfo(parentName, childName);
    if (r.result) {
      const type = r.info!.schemaElement.elementSchemaType;
      if (type === null) {
        return XmlTypeCode.None;
      }
      return type.typeCode;
    }
    return XmlTypeCode.None;
  }

  /** @internal */
  name(n: string): XName {
    if (!(this.namespace === XNamespace.None)) {
      return this.namespace.getName(n);
    }
    return XName.get(n);
  }

  /**
   * @internal If no schema location is set in the root, a schema location with a relative path to
   * the schema file is set and the schema file is extracted to the folder.
   */
  abstract setSchemaLocation(root: XElement, folderPath: string): void;

  /** Registered schema information for the parent child combination. */
  protected xmlSchemaInfo(p: XNameLike | null | undefined, c: XNameLike | null | undefined): { result: boolean; info: XmlSchemaElementInfo | null } {
    const key = (toName(p)?.localName ?? '') + (toName(c)?.localName ?? '');
    const info = this.elements.get(key) ?? null;
    return { result: info !== null, info };
  }

  /** Private static CanAddNew(XmlSchemaParticle, XElement, XName). */
  private static canAddNew(schemaElement: ParticleInfo | null, parent: XElement, child: XName): boolean {
    if (schemaElement !== null && parent.hasElements && schemaElement.isChoice && from(parent.elements(child)).any()) {
      return schemaElement.maxOccurs !== 1;
    }
    return true;
  }

  /** Private static CreateAttribute(XContainer, XmlSchemaAttribute). */
  private static createAttribute(node: XContainer, attribute: XmlSchemaAttribute): XAttribute | null {
    const value = attribute.defaultValue ?? XmlTypeCodeExtensions.defaultDecodedValue(XmlSchemaManager.attributeValueType(attribute));
    if (attribute.name === null || attribute.name === undefined) {
      return null;
    }
    const xAttribute = new XAttribute(attribute.name, value);
    node.add(xAttribute);
    return xAttribute;
  }

  private static parentsName(node: XObject): XName | null {
    return node.parent?.name ?? null;
  }

  /** Private CreateElement(XmlSchemaElementInfo, XName, bool). */
  private createElementFromInfo(info: XmlSchemaElementInfo, child: XName, allAttributes = false): XElement {
    const xElement = new XElement(child);
    const xmlSchemaSimpleType = info.schemaElement.elementSchemaType;
    if (xmlSchemaSimpleType instanceof XmlSchemaSimpleType) {
      xElement.value = !isNullOrEmpty(info.schemaElement.defaultValue)
        ? info.schemaElement.defaultValue
        : XmlTypeCodeExtensions.defaultEncodedValue(xmlSchemaSimpleType.typeCode);
    }
    for (const requiredAttribute of info.requiredAttributes) {
      XmlSchemaManager.createAttribute(xElement, requiredAttribute);
    }
    for (const item of info.required) {
      xElement.add(this.createElement(child, item, allAttributes));
    }
    return xElement;
  }

  /** Private Insert(XmlSchemaElementInfo, XElement, XElement). */
  private insertWithInfo(info: XmlSchemaElementInfo, parent: XElement, child: XElement): boolean {
    const xElement = this.siblingBeforeWithInfo(info, parent, child.name);
    if (xElement !== null) {
      xElement.addAfterSelf(child);
    } else {
      parent.addFirst(child);
    }
    return true;
  }

  /** Private InsertNew(XmlSchemaElementInfo, XElement, XName, bool). */
  private insertNewWithInfo(info: XmlSchemaElementInfo, parent: XElement, child: XName, allAttributes = false): XElement | null {
    // C# passes info.SchemaElement (an XmlSchemaElement, never an XmlSchemaChoice) as the particle.
    if (!XmlSchemaManager.canAddNew({ isChoice: false, maxOccurs: info.schemaElement.maxOccurs }, parent, child)) {
      return null;
    }
    const xElement = this.createElement(parent.name, child, allAttributes);
    const xElement2 = this.siblingBeforeWithInfo(info, parent, child);
    if (xElement2 !== null) {
      xElement2.addAfterSelf(xElement);
    } else {
      parent.addFirst(xElement);
    }
    return xElement;
  }

  /** Private ParseElement: adds the element (and, recursively, its children) to the dictionary. */
  private parseElement(parentElement: string, element: XmlSchemaElement): void {
    void parentElement;
    void element;
    // The dictionary is taken from the exported tables in parseSchema.
  }

  /** Private ParseSchema: fills the Elements dictionary from the compiled schema. */
  private parseSchema(schemaFile: string, targetNamespace: XNamespace, schemaData: SchemaData | null = null): void {
    void schemaFile;
    this.namespace = targetNamespace;
    this._schemaSet = schemaData;
    this.schema = schemaData;
    if (this.schema === null) {
      return;
    }
    const infos = new Map<number, XmlSchemaElementInfo>();
    for (const [key, index] of this.schema.keys) {
      let info = infos.get(index);
      if (info === undefined) {
        const data = this.schema.infos[index];
        info = new T.XmlSchemaElementInfo(data.element, data);
        const owner = info;
        info.resolveChild = (childLocalName) => this.elements.get(owner.schemaElement.name + childLocalName)?.schemaElement ?? null;
        infos.set(index, info);
      }
      this.elements.set(key, info);
    }
    for (const value2 of this.elements.values()) {
      value2.setInfo(this.namespace);
    }
  }

  /** Private ParseSequence: see parseElement. */
  private parseSequence(name: string, sequence: unknown): void {
    void name;
    void sequence;
  }

  /** Private SiblingBefore(XmlSchemaElementInfo, XElement, XName). */
  private siblingBeforeWithInfo(info: XmlSchemaElementInfo, parent: XElement, childName: XName): XElement | null {
    if (!parent.hasElements) {
      return null;
    }
    const xElement = XmlOperation.lastElement(parent)!;
    if (xElement.name === childName) {
      return xElement;
    }
    const r2 = this.xmlSchemaInfo(XmlSchemaManager.parentsName(parent), parent.name);
    if (!r2.result) {
      return null;
    }
    const info2 = r2.info!;
    let xElement2: XElement | null = XmlOperation.firstElement(parent)!;
    if (xElement2.name === childName) {
      return from(xElement2.elementsAfterSelf(childName)).lastOrDefault() ?? xElement2;
    }
    const num = info2.optional.indexOf(this.name(info.schemaElement.name));
    if (num === 0) {
      return null;
    }
    if (info2.optional.indexOf(xElement2.name) > num) {
      return null;
    }
    for (let num2 = num; num2 >= 0; num2--) {
      if (xElement.name === info2.optional[num2]) {
        return xElement;
      }
      xElement2 = parent.element(info2.optional[num2]);
      if (xElement2 !== null) {
        return from(xElement2.elementsAfterSelf(info2.optional[num2])).lastOrDefault() ?? xElement2;
      }
    }
    return null;
  }
}

T.XmlSchemaManager = XmlSchemaManager;
