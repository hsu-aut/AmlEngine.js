// Port of Aml.Engine.CAEX.Extensions.InterfaceFamilyTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { XElement } from '../../../xml/index.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import type { InterfaceClassType } from '../InterfaceClassType.js';
import type { InterfaceFamilyType } from '../InterfaceFamilyType.js';

/** Extension methods for interface classes. */
export class InterfaceFamilyTypeExtensions {
  private constructor() {}

  /** Creates an unattached interface class (InterfaceFamilyType) with the content of the interface. */
  static createInterfaceFamilyClass(interfaceClass: InterfaceClassType): InterfaceFamilyType {
    ServiceLocator.undoRedoService?.pause(CAEXBasicObjectExtensions.caexDocument(interfaceClass));
    ServiceLocator.uniqueNameService?.suspend();
    T.CaexCommand.isSilent = true;
    const cAEXWrapper = interfaceClass.copy();
    const node = new XElement(interfaceClass.xName('InterfaceClass'), cAEXWrapper.node!.elements());
    T.CaexCommand.isSilent = false;
    ServiceLocator.undoRedoService?.resume(CAEXBasicObjectExtensions.caexDocument(interfaceClass));
    ServiceLocator.uniqueNameService?.resume();
    return new T.InterfaceFamilyType(node);
  }

  /** Inserts the interface class (obsolete: use insert). */
  static insert_InterfaceClass(interfaceClass: InterfaceFamilyType, newInterface: InterfaceFamilyType): void {
    interfaceClass.insert(newInterface);
  }

  /** All interface classes below the class (obsolete: use descendants). */
  static interfaceClassDescendants(interfaceClass: InterfaceFamilyType): Iterable<InterfaceFamilyType> {
    return CAEXBasicObjectExtensions.descendants(interfaceClass, T.InterfaceFamilyType);
  }

  /** Appends a new interface class with the provided name. */
  static new_InterfaceClass(interfaceClass: InterfaceFamilyType, name: string | null): InterfaceClassType {
    return interfaceClass.interfaceClass.append(name as string);
  }
}
