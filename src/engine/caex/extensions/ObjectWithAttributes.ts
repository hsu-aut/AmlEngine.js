// Port of Aml.Engine.CAEX.Extensions.ObjectWithAttributes (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { ArgumentException, ArgumentNullException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { from } from '../../../system/linq.js';
import { XmlConvert } from '../../../system/index.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './CAEXDocumentExtensions.js';
import { CAEXObjectExtensions } from './CAEXObjectExtensions.js';
import type { AttributeFamilyType } from '../AttributeFamilyType.js';
import type { AttributeType } from '../AttributeType.js';
import type { IObjectWithAttributes } from '../IObjectWithAttributes.js';

/** Extension methods for objects with attributes. */
export class ObjectWithAttributes {
  private constructor() {}

  /**
   * Adds an attribute referencing the provided attribute type (class or path). With addUnique,
   * nothing is added if such an attribute exists; with addInstance, an instance of the type is
   * created. The name defaults to a unique name (or the type name / last path segment).
   */
  static addAttributeTypeReference(
    objectWithAttribute: IObjectWithAttributes,
    attributeClass: AttributeFamilyType | string | null,
    addUnique = true,
    addInstance = false,
    name: string | null = '',
  ): AttributeType | null {
    if (typeof attributeClass === 'string') {
      return ObjectWithAttributes.addAttributeTypeReferenceByPath(objectWithAttribute, attributeClass, addUnique, addInstance, name);
    }
    if (attributeClass == null) {
      throw new ArgumentNullException('attributeClass');
    }
    if (addUnique && from<AttributeType>(objectWithAttribute.attribute).any((rrq) => rrq.attributeTypeReference!.equals(attributeClass))) {
      return null;
    }
    let attributeType: AttributeType;
    if (addInstance) {
      attributeType = attributeClass.createClassInstance();
      objectWithAttribute.attribute.insert(attributeType);
    } else {
      attributeType = objectWithAttribute.attribute.append();
      attributeType.attributeTypeReference = attributeClass;
    }
    if (isNullOrEmpty(name)) {
      name =
        ServiceLocator.uniqueNameService?.uniqueCAEXName(objectWithAttribute.node!, objectWithAttribute.node!.name.localName) ?? attributeClass.name;
    }
    attributeType.name = name;
    return attributeType;
  }

  private static addAttributeTypeReferenceByPath(
    objectWithAttribute: IObjectWithAttributes,
    attributeClassReference: string,
    addUnique: boolean,
    addInstance: boolean,
    name: string | null,
  ): AttributeType | null {
    if (isNullOrEmpty(attributeClassReference)) {
      throw new ArgumentNullException('attributeClassReference');
    }
    if (addUnique && from<AttributeType>(objectWithAttribute.attribute).any((ext) => equalsString(ext.refAttributeType, attributeClassReference))) {
      return null;
    }
    let attributeType: AttributeType | null = null;
    if (addInstance) {
      const found = CAEXDocumentExtensions.findByPath(CAEXBasicObjectExtensions.caexDocument(objectWithAttribute), attributeClassReference);
      const attributeFamilyType = found instanceof T.AttributeFamilyType ? found : null;
      if (attributeFamilyType != null) {
        attributeType = attributeFamilyType.createClassInstance();
        objectWithAttribute.attribute.insert(attributeType);
      }
    }
    if (attributeType == null) {
      attributeType = objectWithAttribute.attribute.append();
      attributeType.refAttributeType = attributeClassReference;
    }
    if (isNullOrEmpty(name)) {
      name =
        ServiceLocator.uniqueNameService?.uniqueCAEXName(objectWithAttribute.node!, objectWithAttribute.node!.name.localName) ??
        getFileName(attributeClassReference);
    }
    attributeType.name = name;
    return attributeType;
  }

  /** Copies the attributes of the source object to the target object (values optionally cleared). */
  static copyAttributesFrom(targetObject: IObjectWithAttributes, sourceObject: IObjectWithAttributes, includingValues: boolean): void {
    // Target and source the same object: every copy is appended to the sequence being walked, so
    // the original never ends. The port copies the attributes that were there, as the original
    // does first, and throws when the walk reaches the first copy (docs/deviations.md).
    const node = sourceObject?.node ?? null;
    let original = node !== null && node === (targetObject?.node ?? null) ? from(sourceObject.attribute as Iterable<AttributeType>).count() : -1;
    for (const item of sourceObject.attribute as Iterable<AttributeType>) {
      if (original-- === 0) {
        throw new ArgumentException('The target is the source: every copied attribute is copied again; Aml.Engine does not return in this case.', 'sourceObject');
      }
      const copied = item.copy();
      const attributeType = copied instanceof T.AttributeType ? copied : null;
      if (!includingValues && attributeType != null) {
        attributeType.value = null;
      }
      targetObject.attribute.insert(attributeType, false);
    }
  }

  /** Gets the attribute with the provided name (obsolete: use the indexer). */
  static getAttribute(caexObject: IObjectWithAttributes, name: string | null): AttributeType | null {
    if (caexObject != null) {
      return caexObject.attribute.item(name);
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Appends a new attribute with the provided name. */
  static new_Attribute(caexObject: IObjectWithAttributes, name: string | null): AttributeType {
    if (caexObject != null) {
      return CAEXObjectExtensions.newElement(caexObject.attribute, name, false);
    }
    throw new ArgumentNullException('caexObject');
  }

  /**
   * Sets the value of the attribute with the provided name (created if missing). Overloads:
   * (name, string value); (name, value) for other values (C# SetAttributeValue&lt;T&gt;; numbers
   * use the double overload); (name, value, unit, dataType); (name, value, defaultValue,
   * description, unit, dataType); (name, double value); (name, double value, double defaultValue,
   * description, unit).
   */
  static setAttributeValue(objWithAttr: IObjectWithAttributes | null, attName: string | null, attValue: string | null): AttributeType | null;
  static setAttributeValue(objWithAttr: IObjectWithAttributes | null, attName: string | null, attValue: number): AttributeType | null;
  static setAttributeValue(objWithAttr: IObjectWithAttributes | null, attName: string | null, attValue: unknown): AttributeType | null;
  static setAttributeValue(
    objWithAttr: IObjectWithAttributes | null,
    attName: string | null,
    attValue: string | null,
    attUnit: string | null,
    attAttributeDataType: string | null,
  ): AttributeType | null;
  static setAttributeValue(
    objWithAttr: IObjectWithAttributes | null,
    attName: string | null,
    attValue: string | null,
    defaultValue: string | null,
    description: string | null,
    attUnit: string | null,
    attAttributeDataType: string | null,
  ): AttributeType | null;
  static setAttributeValue(
    objWithAttr: IObjectWithAttributes | null,
    attName: string | null,
    attValue: number,
    defaultValue: number,
    description: string | null,
    attUnit: string | null,
  ): AttributeType | null;
  static setAttributeValue(objWithAttr: IObjectWithAttributes | null, attName: string | null, ...rest: unknown[]): AttributeType | null {
    if (objWithAttr == null) {
      return null;
    }
    const obj = objWithAttr.attribute.item(attName) ?? objWithAttr.attribute.append(attName as string);
    switch (rest.length) {
      case 3:
        // (string attValue, string attUnit, string attAttributeDataType)
        obj.value = rest[0] as string | null;
        obj.unit = rest[1] as string | null;
        obj.attributeDataType = rest[2] as string | null;
        return obj;
      case 5:
        // (string attValue, string defaultValue, string description, string attUnit, string attAttributeDataType)
        obj.value = rest[0] as string | null;
        obj.defaultValue = rest[1] as string | null;
        obj.unit = rest[3] as string | null;
        obj.attributeDataType = rest[4] as string | null;
        obj.description = rest[2] as string | null;
        return obj;
      case 4:
        // (double attValue, double defaultValue, string description, string attUnit)
        obj.setDouble(rest[0] as number);
        obj.defaultValue = XmlConvert.toString(rest[1] as number);
        obj.unit = rest[3] as string | null;
        obj.description = rest[2] as string | null;
        return obj;
      default: {
        const attValue = rest[0] ?? null;
        if (attValue === null || typeof attValue === 'string') {
          obj.value = attValue;
        } else if (typeof attValue === 'number') {
          obj.setDouble(attValue);
        } else {
          obj.attributeValue = attValue;
        }
        return obj;
      }
    }
  }
}

// ---- private helpers ------------------------------------------------------------------------

/** string.Equals(string) on a possibly null receiver (NullReferenceException in C#). */
function equalsString(a: string | null, b: string | null): boolean {
  return (a as string).valueOf() === b;
}

/**
 * System.IO.Path.GetFileName as on Windows (the platform of the reference engine): the part
 * after the last '\' or '/', or after a drive root like "C:".
 */
function getFileName(path: string | null): string | null {
  if (path === null) return null;
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (i >= 0) return path.substring(i + 1);
  const root = path.length >= 2 && path[1] === ':' && /^[A-Za-z]$/.test(path[0]) ? 2 : 0;
  return path.substring(root);
}
