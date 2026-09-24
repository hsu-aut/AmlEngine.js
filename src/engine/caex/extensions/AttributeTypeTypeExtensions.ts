// Port of Aml.Engine.CAEX.Extensions.AttributeTypeTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { ArgumentNullException } from '../../../system/exceptions.js';
import { isNullOrWhiteSpace } from '../../../system/strings.js';
import { from } from '../../../system/linq.js';
import { XmlTypeCode } from '../../../system/XmlTypeCode.js';
import { XmlTypeCodeExtensions } from '../../schema/XmlTypeCodeExtensions.js';
import { XmlClassOperation } from '../../xmlext/XmlClassOperation.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { ChangeMode } from '../ChangeMode.js';
import type { AttributeType } from '../AttributeType.js';
import type { AttributeTypeType } from '../AttributeTypeType.js';
import type { RefSemanticType } from '../RefSemanticType.js';

/** Extension methods for class AttributeTypeType. */
export class AttributeTypeTypeExtensions {
  private constructor() {}

  /** Determines whether the specified Attribute is referenced by other Attribute objects called 'Mirrors'. */
  static isMaster(element: AttributeType): boolean {
    return ServiceLocator.queryService.isMaster(element);
  }

  /** Determines whether this instance is overridden. */
  static isOverridden(attributeType: AttributeType): boolean {
    return XmlClassOperation.isOverridden(attributeType.node!);
  }

  /** Determines whether this instance is overridden and deleted. */
  static isOverriddenDeleted(attributeType: AttributeType): boolean {
    if (XmlClassOperation.isOverridden(attributeType.node!)) {
      return attributeType.changeMode === ChangeMode.Delete;
    }
    return false;
  }

  /** Appends a new RefSemantic object with the defined semantics to the specified CAEX object. */
  static new_RefSemantic(caexObject: AttributeTypeType | null, semantic: string | null): RefSemanticType {
    if (!T.CAEXWrapper.equals(caexObject, null)) {
      return caexObject!.refSemantic.append(['CorrespondingAttributePath', semantic]);
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Appends a new RefSemantic object with the defined AML ID to the specified CAEX object. */
  static new_AMLID(caexObject: AttributeTypeType | null, amlID: string | null): RefSemanticType {
    if (!T.CAEXWrapper.equals(caexObject, null)) {
      return caexObject!.refSemantic.append(['CorrespondingAttributePath', 'AMLID:' + (amlID ?? '')]);
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Determines whether the specified CAEX object has a RefSemantic object with the defined AML ID. */
  static hasAMLID(caexObject: AttributeTypeType | null, amlID: string | null): boolean {
    if (!T.CAEXWrapper.equals(caexObject, null)) {
      return from<RefSemanticType>(caexObject!.refSemantic).any((a: RefSemanticType) => a.correspondingAttributePath === 'AMLID:' + (amlID ?? ''));
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Determines if the type code derived from the Attribute datatype defines a part of a date (GMonth, GDay, GYear). */
  static isPartOfDateValue(attributeType: AttributeTypeType): boolean {
    const xmlTypeCode = AttributeTypeTypeExtensions.typeCodeOfAttribute(attributeType);
    if (xmlTypeCode === XmlTypeCode.GYear || (xmlTypeCode - 24 >= 0 && xmlTypeCode - 24 <= 1)) {
      return true;
    }
    return false;
  }

  /** Gets the XmlTypeCode for the assigned AttributeDataType of the AttributeTypeType. */
  static typeCodeOfAttribute(attributeType: AttributeTypeType): XmlTypeCode {
    if (attributeType.attributeDataType !== null && !isNullOrWhiteSpace(attributeType.attributeDataType)) {
      return XmlTypeCodeExtensions.xmlTypeCodeFromSchemaType(attributeType.attributeDataType);
    }
    return XmlTypeCodeExtensions.xmlTypeCodeFromSchemaType(T.XsdDataTypes.stringType);
  }

  /** Determines if the type code derived from the Attribute datatype is a numeric type. */
  static isNumericDataType(attribute: AttributeTypeType): boolean {
    const xmlTypeCode = AttributeTypeTypeExtensions.typeCodeOfAttribute(attribute);
    if ((xmlTypeCode - 14 >= 0 && xmlTypeCode - 14 <= 2) || (xmlTypeCode - 40 >= 0 && xmlTypeCode - 40 <= 12)) {
      return true;
    }
    return false;
  }

  /** Checks if the AttributeTypeType is of boolean type. */
  static isBooleanDataType(attribute: AttributeTypeType): boolean {
    if (AttributeTypeTypeExtensions.typeCodeOfAttribute(attribute) === XmlTypeCode.Boolean) {
      return true;
    }
    return false;
  }

  /** Determines if the type code derived from the Attribute datatype is a string type. */
  static isStringDataType(attributeType: AttributeTypeType): boolean {
    switch (AttributeTypeTypeExtensions.typeCodeOfAttribute(attributeType)) {
      case XmlTypeCode.Text:
      case XmlTypeCode.AnyAtomicType:
      case XmlTypeCode.String:
      case XmlTypeCode.AnyUri:
      case XmlTypeCode.QName:
      case XmlTypeCode.NormalizedString:
      case XmlTypeCode.Token:
      case XmlTypeCode.Language:
      case XmlTypeCode.NmToken:
      case XmlTypeCode.Name:
      case XmlTypeCode.NCName:
        return true;
      default:
        return false;
    }
  }

  /**
   * Determines if the type code derived from the Attribute datatype is a date time type (Time,
   * Date, DateTime, GYearMonth, GMonthDay). Duration is not a date time type.
   */
  static isDateTimeType(attributeType: AttributeTypeType): boolean {
    const xmlTypeCode = AttributeTypeTypeExtensions.typeCodeOfAttribute(attributeType);
    if ((xmlTypeCode - 18 >= 0 && xmlTypeCode - 18 <= 3) || xmlTypeCode === XmlTypeCode.GMonthDay) {
      return true;
    }
    return false;
  }
}
