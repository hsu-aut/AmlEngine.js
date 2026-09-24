// Port of Aml.Engine.CAEX.IRoleClassContainer (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXObject } from './ICAEXObject.js';
import type { RoleFamilyType } from './RoleFamilyType.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';

/** A container of RoleClasses. */
export interface IRoleClassContainer extends ICAEXObject, Iterable<RoleFamilyType> {
  /** Gets the sequence of RoleClasses. */
  readonly roleClass: CAEXSequenceOfCAEXObjectsWithReference<RoleFamilyType>;
}

registerInterfaceBases('IRoleClassContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
