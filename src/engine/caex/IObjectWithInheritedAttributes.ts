// Port of Aml.Engine.CAEX.IObjectWithInheritedAttributes (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { IObjectWithAttributes } from './IObjectWithAttributes.js';
import type { AttributeType } from './AttributeType.js';

/** A CAEX object with attributes, including inherited ones. */
export interface IObjectWithInheritedAttributes extends IObjectWithAttributes {
  /** Gets the attributes including the inherited ones. */
  readonly attributeAndInherited: Iterable<AttributeType>;
}

registerInterfaceBases('IObjectWithInheritedAttributes', 'IObjectWithAttributes', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
