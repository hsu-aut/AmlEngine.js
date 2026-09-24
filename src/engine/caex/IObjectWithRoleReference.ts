// Port of Aml.Engine.CAEX.IObjectWithRoleReference (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { RoleFamilyType } from './RoleFamilyType.js';

/** A CAEX object with a role class reference. */
export interface IObjectWithRoleReference extends ICAEXWrapper {
  /** Gets and sets the referenced role class. */
  roleClass: RoleFamilyType | null;
  /** Gets and sets the role reference path. */
  roleReference: string | null;
}

registerInterfaceBases('IObjectWithRoleReference', 'ICAEXWrapper', 'IXMLWrapper');
