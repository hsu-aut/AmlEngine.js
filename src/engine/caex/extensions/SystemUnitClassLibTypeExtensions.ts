// Port of Aml.Engine.CAEX.Extensions.SystemUnitClassLibTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import type { SystemUnitClassLibType } from '../SystemUnitClassLibType.js';
import type { SystemUnitFamilyType } from '../SystemUnitFamilyType.js';

/** Extension methods for SystemUnitClassLibs. */
export class SystemUnitClassLibTypeExtensions {
  private constructor() {}

  /** Inserts the system unit class (obsolete: use insert). */
  static insert_SystemUnitClass(systemUnitClassLib: SystemUnitClassLibType, systemUnitClass: SystemUnitFamilyType): void {
    systemUnitClassLib.insert(systemUnitClass, false);
  }

  /** Appends a new system unit class with the provided name. */
  static new_SystemUnitClass(systemUnitClassLib: SystemUnitClassLibType, systemUnitClassName: string | null): SystemUnitFamilyType {
    return systemUnitClassLib.systemUnitClass.append(systemUnitClassName as string);
  }

  /** All system unit classes of the library (obsolete: use descendants). */
  static systemUnitClassDescendants(systemUnitClassLib: SystemUnitClassLibType): Iterable<SystemUnitFamilyType> {
    return CAEXBasicObjectExtensions.descendants(systemUnitClassLib, T.SystemUnitFamilyType);
  }
}
