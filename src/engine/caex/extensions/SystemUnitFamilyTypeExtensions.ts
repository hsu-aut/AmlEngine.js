// Port of Aml.Engine.CAEX.Extensions.SystemUnitFamilyTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { XmlOperation } from '../../xmlext/XmlOperation.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import { InheritanceExtensions } from './InheritanceExtensions.js';
import type { SupportedRoleClassType } from '../SupportedRoleClassType.js';
import type { SystemUnitFamilyType } from '../SystemUnitFamilyType.js';

/** Extension methods for system unit classes. */
export class SystemUnitFamilyTypeExtensions {
  private constructor() {}

  /**
   * Gets the supported role classes of the class and its base classes, without those whose role
   * class is a base class of another supported role.
   */
  static getDerivedSupportedRoles(systemUnitClass: SystemUnitFamilyType | null, includeOwn = true): SupportedRoleClassType[] {
    if (!includeOwn) {
      systemUnitClass = (systemUnitClass as SystemUnitFamilyType).baseClass;
    }
    if (systemUnitClass == null) {
      return [];
    }
    const elementsWithPath = XmlOperation.existingElementsFromBaseClassAndSelf(
      systemUnitClass,
      'SupportedRoleClass',
      new T.AttributeValueComparer('RefRoleClassPath'),
    );
    return InheritanceExtensions.makeDistinctPath(systemUnitClass.caexDocument!, elementsWithPath, 'RefRoleClassPath', T.RoleFamilyType).map(
      (r) => new T.SupportedRoleClassType(r),
    );
  }

  /** Inserts the system unit class (obsolete: use insert). */
  static insert_SystemUnitClass(systemUnitClassAncestor: SystemUnitFamilyType, systemUnitClass: SystemUnitFamilyType): void {
    systemUnitClassAncestor.insert(systemUnitClass, false);
  }

  /** Appends a new system unit class with the provided name. */
  static new_SystemUnitClass(systemUnitFamilyType: SystemUnitFamilyType, systemUnitClassName: string | null): SystemUnitFamilyType {
    return systemUnitFamilyType.systemUnitClass.append(systemUnitClassName as string);
  }

  /** All system unit classes below the class (obsolete: use descendants). */
  static systemUnitClassDescendants(systemUnitFamilyType: SystemUnitFamilyType): Iterable<SystemUnitFamilyType> {
    return CAEXBasicObjectExtensions.descendants(systemUnitFamilyType, T.SystemUnitFamilyType);
  }
}
