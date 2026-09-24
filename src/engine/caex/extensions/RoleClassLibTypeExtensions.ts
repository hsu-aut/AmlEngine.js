// Port of Aml.Engine.CAEX.Extensions.RoleClassLibTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import type { RoleClassLibType } from '../RoleClassLibType.js';
import type { RoleFamilyType } from '../RoleFamilyType.js';

/** Extension methods for RoleClassLibs. */
export class RoleClassLibTypeExtensions {
  private constructor() {}

  /** Inserts the role class (obsolete: use insert). */
  static insert_RoleClass(roleClassLib: RoleClassLibType, roleClass: RoleFamilyType): void {
    roleClassLib.insert(roleClass, false);
  }

  /** Appends a new role class with the provided name. */
  static new_RoleClass(roleClassLib: RoleClassLibType, roleClassName: string | null): RoleFamilyType {
    return roleClassLib.roleClass.append(roleClassName as string);
  }

  /** All role classes of the library (obsolete: use descendants). */
  static roleClassDescendants(roleClassLib: RoleClassLibType): Iterable<RoleFamilyType> {
    return CAEXBasicObjectExtensions.descendants(roleClassLib, T.RoleFamilyType);
  }
}
