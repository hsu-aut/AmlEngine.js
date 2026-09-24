// Port of Aml.Engine.CAEX.OrdinalScaledTypeType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import type { XElement } from '../../xml/index.js';
import { from } from '../../system/linq.js';
import { CAEXWrapper } from './CAEXWrapper.js';
import { XmlCAEXAttributes } from '../xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import type { AttributeTypeType } from './AttributeTypeType.js';
import type { CaexValue } from './extensions/CaexValue.js';

/**
 * This class is a wrapper for the CAEXElement "OrdinalScaledType" which defines a value range
 * for an attribute constraint.
 */
export class OrdinalScaledTypeType extends CAEXWrapper {
  private _valueAttributes: CaexValue[] | null = null;

  /** Gets the Attribute datatype which is valid for values of all ValueAttributes of this element. */
  get attributeDataType(): string | null {
    return this.attributeTypeDefiningAttribute?.attributeDataType ?? null;
  }

  /** Gets the attribute, which specifies the attribute data type for the value elements of this instance. */
  get attributeTypeDefiningAttribute(): AttributeTypeType | null {
    const node = this.node;
    const n = node === null || node === undefined ? null : from(node.ancestors()).firstOrDefault((a: XElement) => XmlCAEXSchema.isAttributeOrType(a));
    const w: unknown = n === null ? null : XmlOperation.createCAEXWrapper(n);
    return w instanceof T.AttributeTypeType ? w : null;
  }

  /** Gets and sets the required maximal value for this ordinal scaled attribute constraint. */
  get requiredMaxValue(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node, XmlCAEXSchema.xName(this.node, 'RequiredMaxValue'));
  }

  set requiredMaxValue(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node, XmlCAEXSchema.xName(this.node, 'RequiredMaxValue'), value);
  }

  /** Gets and sets the required minimal value for this ordinal scaled attribute constraint. */
  get requiredMinValue(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node, XmlCAEXSchema.xName(this.node, 'RequiredMinValue'));
  }

  set requiredMinValue(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node, XmlCAEXSchema.xName(this.node, 'RequiredMinValue'), value);
  }

  /** Gets and sets the required value for this ordinal scaled attribute constraint. */
  get requiredValue(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node, XmlCAEXSchema.xName(this.node, 'RequiredValue'));
  }

  set requiredValue(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node, XmlCAEXSchema.xName(this.node, 'RequiredValue'), value);
  }

  /** Gets the CaexValue objects for the value attributes RequiredValue, RequiredMinValue and RequiredMaxValue. */
  get valueAttributes(): CaexValue[] {
    let list = this._valueAttributes;
    if (list === null) {
      const list2: CaexValue[] = [];
      list2[0] = new T.CaexValue(this.node, 'RequiredValue', this.attributeTypeDefiningAttribute!.node);
      list2[1] = new T.CaexValue(this.node, 'RequiredMinValue', this.attributeTypeDefiningAttribute!.node);
      list2[2] = new T.CaexValue(this.node, 'RequiredMaxValue', this.attributeTypeDefiningAttribute!.node);
      this._valueAttributes = list2;
      list = list2;
    }
    return list;
  }

  /**
   * The constructor function (C# `OrdinalScaledTypeType.Constructor`; the name `constructor` is
   * not available for a static member in JS).
   * @internal
   */
  static get Constructor(): (n: XElement) => OrdinalScaledTypeType {
    return (n: XElement) => new OrdinalScaledTypeType(n);
  }

  /**
   * Gets the type-decoded value for the value attribute with the defined name (RequiredValue,
   * RequiredMinValue, RequiredMaxValue). C# indexer getter.
   */
  item(attributeName: string | null): unknown {
    return this.getCaexValue(attributeName)?.getDecodedValue() ?? null;
  }

  /** Sets the type-encoded value for the value attribute with the defined name. C# indexer setter. */
  setItem(attributeName: string | null, value: unknown): void {
    this.getCaexValue(attributeName)?.setEncodedValue(value);
  }

  /** @param ordinalScaledTypeNode An 'OrdinalScaledType' XML node. */
  constructor(ordinalScaledTypeNode: XElement | null) {
    super(ordinalScaledTypeNode);
  }

  /** Gets the CaexValue for the value attribute with the defined attribute name. */
  getCaexValue(attributeName: string | null): CaexValue | null {
    return from(this.valueAttributes).firstOrDefault((c: CaexValue) => c.valueAttributeName === attributeName);
  }
}

registerInterfaces(OrdinalScaledTypeType, 'IAttributeValueType', 'ICAEXWrapper', 'IXMLWrapper');

T.OrdinalScaledTypeType = OrdinalScaledTypeType;
