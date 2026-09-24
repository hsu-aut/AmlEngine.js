// Port of Aml.Engine.CAEX.Extensions.RoleClassFamilyTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import type { RoleFamilyType } from '../RoleFamilyType.js';

/** Extension methods for role classes. */
export class RoleClassFamilyTypeExtensions {
  private constructor() {}

  /** Inserts the role class (obsolete: use insert). */
  static insert_RoleClass(roleClassAncestor: RoleFamilyType, roleClass: RoleFamilyType): void {
    roleClassAncestor.insert(roleClass, false);
  }

  /** Appends a new role class with the provided name. */
  static new_RoleClass(roleClassFamily: RoleFamilyType, roleClassName: string | null): RoleFamilyType {
    return roleClassFamily.roleClass.append(roleClassName as string);
  }

  /** All role classes below the class (obsolete: use descendants). */
  static roleClassDescendants(roleClassFamily: RoleFamilyType): Iterable<RoleFamilyType> {
    return CAEXBasicObjectExtensions.descendants(roleClassFamily, T.RoleFamilyType);
  }
}
