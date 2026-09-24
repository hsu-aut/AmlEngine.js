// Port of Aml.Engine.CAEX.IAttributeValueType (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { AttributeTypeType } from './AttributeTypeType.js';
import type { CaexValue } from './extensions/CaexValue.js';

/** A CAEX object with a typed value (attributes and attribute types). */
export interface IAttributeValueType extends ICAEXWrapper {
  /** Gets the attribute data type. */
  readonly attributeDataType: string | null;
  /** Gets the attribute type defining attribute. */
  readonly attributeTypeDefiningAttribute: AttributeTypeType | null;
  /** Gets the value attributes. */
  readonly valueAttributes: CaexValue[];
  /** Indexer this[string attributeName] (get). */
  item(attributeName: string): unknown;
  /** Indexer this[string attributeName] (set). */
  setItem(attributeName: string, value: unknown): void;
  /** Gets the CAEX value for the attribute name. */
  getCaexValue(attributeName: string): CaexValue | null;
}

registerInterfaceBases('IAttributeValueType', 'ICAEXWrapper', 'IXMLWrapper');
