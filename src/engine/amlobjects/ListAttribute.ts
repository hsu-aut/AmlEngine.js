// Port of Aml.Engine.AmlObjects.ListAttribute (Aml.Engine 4.5.2): extension methods for list
// attributes (attributes of the AttributeType ListType or OrderedListType, or with the RefSemantic
// 'ListType' / 'OrderedListType' in CAEX 2.15).

import { T } from '../registry.js';
import { from, type Enumerable } from '../../system/linq.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { AttributeTypeTypeExtensions } from '../caex/extensions/AttributeTypeTypeExtensions.js';
import { AutomationMLBaseAttributeTypeLib } from './AutomationMLBaseAttributeTypeLib.js';
import { ClassReferenceWithAlias } from './ClassReferenceWithAlias.js';
import type { AttributeType } from '../caex/AttributeType.js';
import type { IObjectWithAttributes } from '../caex/IObjectWithAttributes.js';

/** Extension methods for list attributes. */
export class ListAttribute {
  private constructor() {}

  /** The name of the list type. */
  static readonly ListTypeName = 'ListType';

  /** The name of the ordered list type. */
  static readonly OrderedListTypeName = 'OrderedListType';

  /**
   * Adds a list item to a list attribute. Items of an ordered list are named by their position;
   * an existing item defines the data type of the new one.
   * @returns The new item, or `null` if the attribute is not a list attribute.
   */
  static addListItem(attribute: AttributeType, itemType: string | null = '', itemName: string | null = 'item'): AttributeType | null {
    if (!ListAttribute.isListAttribute(attribute)) {
      return null;
    }
    let num = 1;
    if (attribute.attribute.exists) {
      num = attribute.attribute.count + 1;
      itemType = attribute.attribute.last!.attributeDataType;
    }
    if (ListAttribute.isOrderedListAttribute(attribute)) {
      itemName = num.toString();
    } else if (isNullOrEmpty(itemName)) {
      itemName = (itemName ?? '') + num;
    }
    const attributeType = attribute.attribute.append(itemName!);
    if (isNullOrEmpty(itemType)) {
      itemType = T.AttributeTypeType.clrToXmlType(String);
    }
    attributeType.attributeDataType = itemType;
    return attributeType;
  }

  /**
   * Converts the attribute into a list attribute with one item containing the value.
   * @returns `false` if the attribute could not be converted.
   */
  static convertToListAttribute(attribute: AttributeType, itemName: string | null = 'item'): boolean {
    if (!ListAttribute.makeListAttribute(attribute)) {
      return false;
    }
    ListAttribute.addListItem(attribute, attribute.attributeDataType, itemName)!.value = attribute.value;
    attribute.value = '';
    attribute.attributeDataType = '';
    return true;
  }

  /**
   * Creates a list attribute with the provided number of items of the item type.
   * @returns The new list attribute.
   */
  static createListAttribute(
    element: IObjectWithAttributes,
    attributeName: string,
    itemsCount: number,
    itemType: string | null,
    itemName: string | null = 'item',
    isOrderedList = false,
    alias: string | null = null,
  ): AttributeType {
    const attributeType = element.attribute.append(attributeName);
    if (CAEXBasicObjectExtensions.caexSchema(element) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      AttributeTypeTypeExtensions.new_RefSemantic(attributeType, isOrderedList ? 'OrderedListType' : 'ListType');
    } else {
      attributeType.refAttributeType = isOrderedList
        ? ClassReferenceWithAlias.classReference('AutomationMLBaseAttributeTypeLib/OrderedListType', alias)
        : ClassReferenceWithAlias.classReference('AutomationMLBaseAttributeTypeLib/ListType', alias);
    }
    if (isOrderedList) {
      itemName = '';
    }
    for (let i = 0; i < itemsCount; i++) {
      attributeType.attribute.append((itemName ?? '') + (i + 1)).attributeDataType = itemType;
    }
    return attributeType;
  }

  /** Determines whether the attribute is an (ordered or unordered) list attribute. */
  static isListAttribute(attribute: AttributeType): boolean {
    if (!ListAttribute.isOrderedListAttribute(attribute)) {
      return ListAttribute.isUnOrderedListAttribute(attribute);
    }
    return true;
  }

  /** Determines whether the attribute is an ordered list attribute. */
  static isOrderedListAttribute(attribute: AttributeType): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(attribute) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      if (!AutomationMLBaseAttributeTypeLib.isOrderedListType(attribute)) {
        return from(attribute.refSemantic).any((rf) => rf.correspondingAttributePath === 'OrderedListType');
      }
      return true;
    }
    return from(attribute.refSemantic).any((rf) => rf.correspondingAttributePath === 'OrderedListType');
  }

  /** Determines whether the attribute is an unordered list attribute. */
  static isUnOrderedListAttribute(attribute: AttributeType): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(attribute) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      if (!AutomationMLBaseAttributeTypeLib.isListType(attribute)) {
        return from(attribute.refSemantic).any((rf) => rf.correspondingAttributePath === 'ListType');
      }
      return true;
    }
    return from(attribute.refSemantic).any((rf) => rf.correspondingAttributePath === 'ListType');
  }

  /** Gets the items of a list attribute (empty if it is not a list attribute). */
  static listItems(attribute: AttributeType): Iterable<AttributeType> {
    if (ListAttribute.isListAttribute(attribute)) {
      return attribute.attribute;
    }
    return [];
  }

  /** Gets the values of the items of a list attribute which are no list attributes themselves. */
  static listItemValues(attribute: AttributeType): Enumerable<string | null> {
    if (ListAttribute.isListAttribute(attribute)) {
      return from(attribute.attribute)
        .where((item) => !ListAttribute.isListAttribute(item))
        .select((item) => item.value);
    }
    return from<string | null>([]);
  }

  /**
   * Makes the attribute a list attribute, if it is none and has no nested attributes.
   * @returns `true`, if the attribute has been changed.
   */
  static makeListAttribute(attribute: AttributeType, isOrdered = false): boolean {
    if (ListAttribute.isListAttribute(attribute) || attribute.attribute.exists) {
      return false;
    }
    if (CAEXBasicObjectExtensions.caexSchema(attribute) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      AttributeTypeTypeExtensions.new_RefSemantic(attribute, isOrdered ? 'OrderedListType' : 'ListType');
    } else {
      attribute.refAttributeType = isOrdered ? 'AutomationMLBaseAttributeTypeLib/OrderedListType' : 'AutomationMLBaseAttributeTypeLib/ListType';
    }
    return true;
  }
}
