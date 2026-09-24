// Port of Aml.Engine.CAEX.Extensions.InterfaceClassLibTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import type { InterfaceClassLibType } from '../InterfaceClassLibType.js';
import type { InterfaceClassType } from '../InterfaceClassType.js';
import type { InterfaceFamilyType } from '../InterfaceFamilyType.js';

/** Extension methods for InterfaceClassLibs. */
export class InterfaceClassLibTypeExtensions {
  private constructor() {}

  /** Inserts the interface class (obsolete: use insert). */
  static insert_InterfaceClass(interfaceClassLib: InterfaceClassLibType, interfaceFamilyType: InterfaceFamilyType): void {
    interfaceClassLib.insert(interfaceFamilyType);
  }

  /** All interface classes of the library (obsolete: use descendants). */
  static interfaceClassDescendants(interfaceClassLib: InterfaceClassLibType): Iterable<InterfaceFamilyType> {
    return CAEXBasicObjectExtensions.descendants(interfaceClassLib, T.InterfaceFamilyType);
  }

  /** Appends a new interface class with the provided name. */
  static new_InterfaceClass(interfaceClassLib: InterfaceClassLibType, name: string | null): InterfaceClassType {
    return interfaceClassLib.interfaceClass.append(name as string);
  }
}
