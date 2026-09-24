// Port of Aml.Engine.CAEX.NominalScaledTypeType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import type { XElement } from '../../xml/index.js';
import { from } from '../../system/linq.js';
import { CAEXWrapper } from './CAEXWrapper.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import type { AttributeTypeType } from './AttributeTypeType.js';
import type { ValueSequence, ValueSequence_ElementValue } from './ValueSequence.js';
import type { CaexValue } from './extensions/CaexValue.js';

/**
 * This class is a wrapper for the CAEXElement "NominalScaledType" which defines a list of
 * required values for an attribute constraint.
 */
export class NominalScaledTypeType extends CAEXWrapper {
  private _requiredValue: ValueSequence<string> | null = null;

  /**
   * Gets the AttributeDataType of the defining attribute. The AttributeDataType can be used to
   * interpret the defined nominal values of this instance.
   */
  get attributeDataType(): string | null {
    return this.attributeTypeDefiningAttribute?.attributeDataType ?? null;
  }

  /** Gets the AttributeType object, defining this instance. */
  get attributeTypeDefiningAttribute(): AttributeTypeType | null {
    const node = this.node;
    const n = node === null || node === undefined ? null : from(node.ancestors()).firstOrDefault((a: XElement) => XmlCAEXSchema.isAttributeOrType(a));
    const w: unknown = n === null ? null : XmlOperation.createCAEXWrapper(n);
    return w instanceof T.AttributeTypeType ? w : null;
  }

  /** Gets the collection of the 'RequiredValue' elements for this nominal scaled attribute constraint. */
  get requiredValue(): ValueSequence<string> {
    return (this._requiredValue ??= new T.ValueSequence<string>(this.node, 'RequiredValue', () => this));
  }

  /** Gets a list of CaexValue corresponding to the associated nominal values of this instance. */
  get valueAttributes(): CaexValue[] {
    return from(this.requiredValue.elementAndValues)
      .select((value: ValueSequence_ElementValue<string>) => new T.CaexValue(this.node, value.node, this.attributeTypeDefiningAttribute!.node))
      .toList();
  }

  /**
   * The constructor function (C# `NominalScaledTypeType.Constructor`; the name `constructor` is
   * not available for a static member in JS).
   * @internal
   */
  static get Constructor(): (n: XElement) => NominalScaledTypeType {
    return (n: XElement) => new NominalScaledTypeType(n);
  }

  /**
   * Gets the type-decoded value for the nominal value attribute with the defined value (C#
   * indexer getter). The related attribute must define an AttributeDataType. This indexer should
   * only be used, if the list of nominal values contains distinct values only.
   */
  item(nominalValue: string | null): unknown {
    return this.getCaexValue(nominalValue)?.getDecodedValue() ?? null;
  }

  /** Sets the type-encoded value for the nominal value attribute with the defined value (C# indexer setter). */
  setItem(nominalValue: string | null, value: unknown): void {
    this.getCaexValue(nominalValue)?.setEncodedValue(value);
  }

  /** @param nodeElement A 'NominalScaledType' XML node. */
  constructor(nodeElement: XElement | null) {
    super(nodeElement);
  }

  /** Gets the CaexValue for the nominal value attribute with the defined value. */
  getCaexValue(nominalValue: string | null): CaexValue | null {
    return from(this.valueAttributes).firstOrDefault((v: CaexValue) => v.valueElement!.value === v.getEncodedValue(nominalValue));
  }
}

registerInterfaces(NominalScaledTypeType, 'IAttributeValueType', 'ICAEXWrapper', 'IXMLWrapper');

T.NominalScaledTypeType = NominalScaledTypeType;
