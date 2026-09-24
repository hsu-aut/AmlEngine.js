// Port of Aml.Engine.CAEX.IObjectWithAttributes (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXBasicObject } from './ICAEXBasicObject.js';
import type { AttributeSequence } from './AttributeSequence.js';
import type { AttributeType } from './AttributeType.js';

/** A CAEX object with attributes. */
export interface IObjectWithAttributes extends ICAEXBasicObject {
  /** Gets the collection of Attribute objects. */
  readonly attribute: AttributeSequence;
  /** Gets the attributes and all nested attributes. */
  readonly attributeAndDescendants: Iterable<AttributeType>;
}

registerInterfaceBases('IObjectWithAttributes', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
