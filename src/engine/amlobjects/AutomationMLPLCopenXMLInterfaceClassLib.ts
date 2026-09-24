// Port of Aml.Engine.AmlObjects.AutomationMLPLCopenXMLInterfaceClassLib (Aml.Engine 4.5.2).

import { InheritanceExtensions } from '../caex/extensions/InheritanceExtensions.js';
import type { InterfaceClassType } from '../caex/InterfaceClassType.js';

/** Constants and methods for the AutomationMLPLCopenXMLInterfaceClassLib. */
export class AutomationMLPLCopenXMLInterfaceClassLib {
  private constructor() {}

  /** The 'AutomationMLBaseAttributeTypeLib' library name */
  static readonly AutomationMLPLCopenXMLInterfaceClassLibName = 'AutomationMLPLCopenXMLInterfaceClassLib';

  /** The 'Cardinality' AttributeType path */
  static readonly VariableInterface = 'AutomationMLPLCopenXMLInterfaceClassLib/VariableInterface';

  /**
   * Determines whether the specified interface reference defines an inheritance relation from the VariableInterface Interface class
   */
  static isVariableInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLPLCopenXMLInterfaceClassLib/VariableInterface');
  }
}
