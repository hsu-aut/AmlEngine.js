// Port of Aml.Engine.AmlObjects.AutomationMLLogicInterfaceClassLib (Aml.Engine 4.5.2).

import { InheritanceExtensions } from '../caex/extensions/InheritanceExtensions.js';
import type { InterfaceClassType } from '../caex/InterfaceClassType.js';

/** Constants and methods for the AutomationMLLogicInterfaceClassLib. */
export class AutomationMLLogicInterfaceClassLib {
  private constructor() {}

  /** The AutomationML base interface class library name */
  static readonly AutomationMLLogicInterfaceClassLibName = 'AutomationMLLogicInterfaceClassLib';

  /** The SequencingLogicModelInterface ClassPath (a Part 4 Interface) */
  static readonly SequencingLogicModelInterface = 'AutomationMLLogicInterfaceClassLib/SequencingLogicModelInterface';

  /** The LogicModelElementInterface ClassPath (a Part 4 Interface) */
  static readonly LogicModelElementInterface = 'AutomationMLLogicInterfaceClassLib/LogicModelElementInterface';

  /** The VariableInterface ClassPath (a Part 4 Interface) */
  static readonly VariableInterface = 'AutomationMLLogicInterfaceClassLib/VariableInterface';

  /** The BehaviourLogicModelInterface ClassPath (a Part 4 Interface) */
  static readonly BehaviourLogicModelInterface = 'AutomationMLLogicInterfaceClassLib/BehaviourLogicModelInterface';

  /** The InterlockingVariableInterface ClassPath (a Part 4 Interface) */
  static readonly InterlockingVariableInterface = 'AutomationMLLogicInterfaceClassLib/InterlockingVariableInterface';

  /** The LogicModelInterface ClassPath (a Part 4 Interface) */
  static readonly LogicModelInterface = 'AutomationMLLogicInterfaceClassLib/LogicModelInterface';

  /** The InterlockingLogicModelInterface class path (a Part 4 Interface) */
  static readonly InterlockingLogicModelInterface = 'AutomationMLLogicInterfaceClassLib/InterlockingLogicModelInterface';

  /**
   * Determines whether the specified interface class is derived from the BehaviourLogicModelInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isBehaviourLogicModelInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLLogicInterfaceClassLib/BehaviourLogicModelInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the InterlockingLogicModelInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isInterlockingLogicModelInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLLogicInterfaceClassLib/InterlockingLogicModelInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the InterlockingVariableInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isInterlockingVariableInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLLogicInterfaceClassLib/InterlockingVariableInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the LogicModelElementInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isLogicModelElementInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLLogicInterfaceClassLib/LogicModelElementInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the LogicModelInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isLogicModelInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLLogicInterfaceClassLib/LogicModelInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the SequencingLogicModelInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isSequencingLogicModelInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLLogicInterfaceClassLib/SequencingLogicModelInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the VariableInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isVariableInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLLogicInterfaceClassLib/VariableInterface');
  }
}
