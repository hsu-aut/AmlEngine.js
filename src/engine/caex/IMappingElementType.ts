// Port of Aml.Engine.CAEX.IMappingElementType (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { IMapping } from './IMapping.js';
import type { RoleFamilyType } from './RoleFamilyType.js';
import type { SystemUnitClassType } from './SystemUnitClassType.js';

/** A mapping element between a role class and a system unit class element. */
export interface IMappingElementType extends IMapping {
  /** Gets the mapped role class. */
  readonly mappingRoleClass: RoleFamilyType | null;
  /** Gets the mapped system unit class. */
  readonly mappingSystemUnitClass: SystemUnitClassType | null;
  /** Gets and sets the role class element identifier. */
  roleClassElementIdentifier: string | null;
  /** Gets and sets the system unit class element identifier. */
  systemUnitClassElementIdentifier: string | null;
}

registerInterfaceBases('IMappingElementType', 'IMapping', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
