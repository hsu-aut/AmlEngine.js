// Port of Aml.Engine.CAEX.IAttributeTypeContainer (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXObject } from './ICAEXObject.js';
import type { AttributeFamilyType } from './AttributeFamilyType.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';

/** A container of AttributeType classes. */
export interface IAttributeTypeContainer extends ICAEXObject, Iterable<AttributeFamilyType> {
  /** Gets the sequence of AttributeTypes. */
  readonly attributeType: CAEXSequenceOfCAEXObjectsWithReference<AttributeFamilyType>;
}

registerInterfaceBases('IAttributeTypeContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
