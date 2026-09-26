// Port of Aml.Engine.Xml.Extensions.XmlCAEXAttributes (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { ArgumentException, ArgumentNullException, InvalidOperationException } from '../../system/exceptions.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../system/strings.js';
import { from } from '../../system/linq.js';
import { DateTime, DateTimeStyles, XmlConvert, XmlDateTimeSerializationMode } from '../../system/index.js';
import { toXName, type XAttribute, type XElement, type XNameLike } from '../../xml/index.js';
import { CAEXPathBuilder } from '../caex/extensions/CAEXPathBuilder.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { XmlCAEXSchema } from './XmlCAEXSchema.js';
import { XmlOperation } from './XmlOperation.js';

/** Internal extension methods reading CAEX attribute values from XML elements. */
export class XmlCAEXAttributes {
  private constructor() {}

  static readonly NONAME = ' ';

  /** Gets the InternalElement ID of a potential mirror Attribute. */
  static attributeMasterID(xmlNode: XElement): string {
    return CAEXPathBuilder.instanceIDInAttributeReference(xmlNode.attribute('RefAttributeType')?.value ?? null, T.CAEXDocument.document(xmlNode)).result;
  }

  /** Returns the CAEX ID. */
  static caexidOfElement(element: XElement | null): string {
    return element?.attribute('ID')?.value ?? '';
  }

  /** Returns the CAEX Name. */
  static caexNameOfElement(element: XElement | null): string {
    return element?.attribute('Name')?.value ?? '';
  }

  /** Returns the CAEX Name of the parent. */
  static caexNameOfParent(element: XElement | null): string {
    const parent = element?.parent ?? null;
    return (parent !== null ? XmlCAEXAttributes.caexNameOfElement(parent) : null) ?? '';
  }

  /** Returns the CAEX path of this object, for example "plant/unit/tank" or GUID:interface. */
  static caexPath(element: XElement): string {
    if (XmlCAEXSchema.isInternalElement(element)) {
      return XmlCAEXAttributes.caexidOfElement(element);
    }
    if (XmlCAEXSchema.schemaManager(element) !== T.AMLSchemaManager2_15.instance) {
      if (!XmlCAEXSchema.isCAEXClass(element) && XmlCAEXSchema.isElementWithMandatoryID(element)) {
        return XmlCAEXAttributes.caexidOfElement(element);
      }
      if (element.name.localName !== 'Attribute') {
        return XmlCAEXAttributes.getFullNodeCAEXPath(element);
      }
      const xElement = from(element.ancestors()).firstOrDefault((a) => a.name.localName !== 'Attribute');
      if (xElement === null || !XmlCAEXSchema.isCAEXClass(xElement)) {
        if (xElement !== null) {
          return XmlCAEXAttributes.caexidOfElement(xElement) + '/' + XmlCAEXAttributes.getPartialNodeCAEXPath(element, xElement);
        }
        return '';
      }
      return XmlCAEXAttributes.getFullNodeCAEXPath(element);
    }
    if (element.name.localName !== 'ExternalInterface') {
      return XmlCAEXAttributes.getFullNodeCAEXPath(element);
    }
    const parent = element.parent;
    if (parent !== null) {
      if (!XmlCAEXSchema.isInternalElement(parent) && !XmlCAEXSchema.isSystemUnitClass(parent)) {
        return XmlCAEXAttributes.caexPath(parent) + ':' + CAEXPathBuilder.pathPart(element);
      }
      if (!isNullOrEmpty(XmlCAEXAttributes.caexidOfElement(parent))) {
        return CAEXPathBuilder.internalLinkReferencePath(parent, element) as string;
      }
      return XmlCAEXAttributes.getFullNodeCAEXPath(element);
    }
    return XmlCAEXAttributes.getFullNodeCAEXPath(element);
  }

  static getDateTimeValue(owner: XElement | null, elementName: XNameLike): DateTime {
    if (owner === null) {
      throw new ArgumentNullException('owner');
    }
    const xElement = owner.element(elementName);
    if (isNullOrEmpty(xElement?.value ?? null)) {
      return DateTime.minValue;
    }
    // C#: DateTime.TryParse(value, InvariantCulture, DateTimeStyles.AssumeLocal, out result);
    // the result is default(DateTime) when parsing fails.
    return DateTime.tryParse(xElement!.value, DateTimeStyles.AssumeLocal) ?? DateTime.minValue;
  }

  static getFullNodeCAEXPath(xmlNode: XElement | null): string {
    if (xmlNode === null) {
      throw new ArgumentNullException('xmlNode');
    }
    return CAEXPathBuilder.caexPath([...xmlNode.ancestorsAndSelf()].reverse());
  }

  static getFullNodeCAEXPathNames(xmlNode: XElement | null, withSeparator = false): string[] {
    if (xmlNode === null) {
      throw new ArgumentNullException('xmlNode');
    }
    let xElement: XElement | null = xmlNode;
    let text = xmlNode.attribute('Name')?.value ?? null;
    if (isNullOrWhiteSpace(text)) {
      text = ' ';
    }
    const list: string[] = [];
    const caexSchema = XmlCAEXSchema.caexSchema(xmlNode);
    list.push(CAEXPathBuilder.pathPartName(text!, caexSchema) as string);
    while (xElement?.parent != null) {
      xElement = xElement.parent;
      text = xElement?.attribute('Name')?.value ?? null;
      if (isNullOrWhiteSpace(text)) {
        text = ' ';
      }
      if (caexSchema === T.CAEXDocument.CAEXSchema.CAEX2_15 && xElement !== null) {
        const name = xElement.name;
        if (name != null && name.localName === 'Attribute') {
          list.splice(0, 0, CAEXPathBuilder.pathPartName(text, caexSchema) + (withSeparator ? '.' : ''));
          continue;
        }
      }
      list.splice(0, 0, CAEXPathBuilder.pathPartName(text, caexSchema) + (withSeparator ? '/' : ''));
    }
    return list;
  }

  static getFullNodePath(xmlNode: XElement | null): string {
    if (xmlNode === null) {
      throw new ArgumentNullException('xmlNode');
    }
    let text = xmlNode.attribute('Name')?.value ?? null;
    if (isNullOrWhiteSpace(text)) {
      text = ' ';
    }
    if ((xmlNode.parent?.attribute('Name') ?? null) === null) {
      return text!;
    }
    return XmlCAEXAttributes.getFullNodePath(xmlNode.parent) + '/' + text;
  }

  static getFullNodePathNames(xmlNode: XElement | null, withSeparator = false): string[] {
    if (xmlNode === null) {
      throw new ArgumentNullException('xmlNode');
    }
    const array = XmlCAEXAttributes.getFullNodePath(xmlNode).split('/');
    if (!withSeparator) {
      return array;
    }
    for (let i = 0; i < array.length - 1; i++) {
      array[i] += '/';
    }
    return array;
  }

  static getPartialNodeCAEXPath(xmlNode: XElement | null, root: XElement | null): string {
    if (xmlNode === null || root === null) {
      throw new ArgumentNullException('xmlNode');
    }
    let xElement: XElement | null = xmlNode;
    let text = xmlNode.attribute('Name')?.value ?? null;
    if (isNullOrWhiteSpace(text)) {
      text = ' ';
    }
    const schema = XmlCAEXSchema.caexSchema(xmlNode);
    let text2 = CAEXPathBuilder.pathPartName(text, schema);
    while ((xElement?.parent ?? null) !== root) {
      if (xElement === null) {
        // root is not an ancestor of xmlNode: the original loops forever from here on
        throw new ArgumentException('root is not an ancestor of xmlNode; Aml.Engine does not return in this case.', 'root');
      }
      xElement = xElement?.parent ?? null;
      text = xElement?.attribute('Name')?.value ?? null;
      if (isNullOrWhiteSpace(text)) {
        text = ' ';
      }
      text2 = CAEXPathBuilder.pathPartName(text, schema) + '/' + text2;
    }
    return text2 as string;
  }

  static getStringValue(owner: XElement | null, elementName: XNameLike): string | null {
    if (owner === null) {
      throw new ArgumentNullException('owner');
    }
    return owner.element(elementName)?.value ?? null;
  }

  static getValueElementValue(element: XElement): string | null {
    return element.element(XmlCAEXSchema.xName(element, 'Value'))?.value ?? null;
  }

  static icMasterID(xmlNode: XElement): string | null {
    return xmlNode.attribute('RefBaseClassPath')?.value ?? null;
  }

  static *idReferenceInMapping(xmlNode: XElement): Generator<{ name: string; value: string | null }> {
    if (XmlCAEXSchema.isInterfaceIDMapping(xmlNode)) {
      yield { name: 'RoleInterfaceID', value: xmlNode.attribute('RoleInterfaceID')?.value ?? null };
      yield { name: 'SystemUnitInterfaceID', value: xmlNode.attribute('SystemUnitInterfaceID')?.value ?? null };
    }
  }

  static *idReferencesInInternalLink(xmlNode: XElement): Generator<{ name: string; value: string | null }> {
    if (XmlCAEXSchema.isInternalLink(xmlNode)) {
      if (XmlCAEXSchema.caexSchema(xmlNode) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
        yield { name: 'RefPartnerSideA', value: xmlNode.attribute('RefPartnerSideA')?.value ?? null };
        yield { name: 'RefPartnerSideB', value: xmlNode.attribute('RefPartnerSideB')?.value ?? null };
      } else {
        yield {
          name: 'RefPartnerSideA',
          value: CAEXPathBuilder.internalElementIDInInternalLinkReference(xmlNode.attribute('RefPartnerSideA')?.value ?? null).result,
        };
        yield {
          name: 'RefPartnerSideB',
          value: CAEXPathBuilder.internalElementIDInInternalLinkReference(xmlNode.attribute('RefPartnerSideB')?.value ?? null).result,
        };
      }
    }
  }

  static ieMasterID(xmlNode: XElement): string | null {
    return xmlNode.attribute('RefBaseSystemUnitPath')?.value ?? null;
  }

  static interfaceClassMasterID(element: XElement): string | null {
    if (!XmlCAEXSchema.isICMirror(element)) {
      return '';
    }
    return element.attribute('RefBaseClassPath')?.value ?? null;
  }

  static internalElementMasterID(element: XElement): string | null {
    if (!XmlCAEXSchema.isIEMirror(element)) {
      return '';
    }
    return element.attribute('RefBaseSystemUnitPath')?.value ?? null;
  }

  static isInheritanceAttribute(xmlAttribute: XAttribute | null): boolean {
    let flag = xmlAttribute !== null;
    if (flag) {
      const localName = xmlAttribute!.name.localName;
      flag = localName === 'RefAttributeType' || localName === 'RefBaseClassPath';
    }
    return flag;
  }

  static roleReference(xmlNode: XElement): string | null {
    if (!XmlCAEXSchema.isRoleRequirement(xmlNode)) {
      if (!XmlCAEXSchema.isSupportedRoleClass(xmlNode)) {
        return null;
      }
      return xmlNode.attribute('RefRoleClassPath')?.value ?? null;
    }
    return xmlNode.attribute('RefBaseRoleClassPath')?.value ?? null;
  }

  static setDateTimeValue(owner: XElement | null, elementName: XNameLike, value: DateTime): void {
    if (owner === null) {
      throw new ArgumentNullException('owner');
    }
    const name = toXName(elementName);
    const flag = ServiceLocator.undoRedoService?.beginTransaction(T.CAEXDocument.document(owner), 'Set DateTime in ' + owner.name.localName) ?? false;
    const r = XmlOperation.getOrAppendChildIfContentNotNull(owner, name, value);
    const orAppendChildIfContentNotNull = r.result;
    if (orAppendChildIfContentNotNull === null) {
      if (flag) {
        ServiceLocator.undoRedoService?.endTransaction(T.CAEXDocument.document(owner));
      }
      if (!r.isDeleted) {
        throw new InvalidOperationException(`${name.toString()} is not a valid element for ${owner.name.toString()}`);
      }
    } else {
      T.SetElementValueCmd.setValue(orAppendChildIfContentNotNull, XmlConvert.toString(value, XmlDateTimeSerializationMode.Local));
      if (flag) {
        ServiceLocator.undoRedoService?.endTransaction(T.CAEXDocument.document(owner));
      }
    }
  }

  static setStringValue(owner: XElement | null, elementName: XNameLike, value: string | null): void {
    if (owner === null) {
      throw new ArgumentNullException('owner');
    }
    const name = toXName(elementName);
    if (isNullOrEmpty(value) && isNullOrEmpty(XmlCAEXAttributes.getStringValue(owner, name))) {
      return;
    }
    const flag =
      ServiceLocator.undoRedoService?.beginTransaction(T.CAEXDocument.document(owner), 'Set value ' + name.localName + ' in ' + owner.name.localName) ?? false;
    const r = XmlOperation.getOrAppendChildIfContentNotNull(owner, name, value);
    const orAppendChildIfContentNotNull = r.result;
    if (orAppendChildIfContentNotNull === null) {
      if (flag) {
        ServiceLocator.undoRedoService?.endTransaction(T.CAEXDocument.document(owner));
      }
      if (!r.isDeleted) {
        throw new InvalidOperationException(`${name.toString()} is not a valid element for ${owner.name.toString()}`);
      }
    } else {
      T.SetElementValueCmd.setValue(orAppendChildIfContentNotNull, value);
      if (flag) {
        ServiceLocator.undoRedoService?.endTransaction(T.CAEXDocument.document(owner));
      }
    }
  }

  static systemUnitClassReference(element: XElement): string | null {
    if (!XmlCAEXSchema.isInternalElement(element)) {
      return '';
    }
    return element.attribute('RefBaseSystemUnitPath')?.value ?? null;
  }
}
