// Port of Aml.Engine.AmlObjects.AutomationMLInterfaceClassLib (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { InheritanceExtensions } from '../caex/extensions/InheritanceExtensions.js';
import { ClassReferenceWithAlias } from './ClassReferenceWithAlias.js';
import type { AutomationMLInterfaceClassLibType } from './AutomationMLInterfaceClassLibType.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { InterfaceClassType } from '../caex/InterfaceClassType.js';

/** Constants and extension methods for the AutomationMLInterfaceClassLib. */
export class AutomationMLInterfaceClassLib {
  private constructor() {}

  /** The AttachmentInterface class path (a Part 3 Interface) */
  static readonly AttachmentInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/AttachmentInterface';

  /** The AutomationML base interface class path (a Part 1 Interface) */
  static readonly AutomationMLBaseInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface';

  /** The AutomationML base interface class library name */
  static readonly AutomationMLInterfaceClassLibName = 'AutomationMLInterfaceClassLib';

  /**
   * The behaviour logic interface class path (a Part 4 Interface)
   * @deprecated This RoleClass has been renamed to BehaviourLogicModelInterface and moved to AutomationMLLogicInterfaceClassLib
   */
  static readonly BehaviourLogicInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicInterface/BehaviourLogicInterface';

  /** The COLLADA interface class path (a Part 1 Interface) */
  static readonly COLLADAInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/COLLADAInterface';

  /** The communication interface class path (a Part 1 Interface) */
  static readonly Communication = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/Communication';

  /** The external data connector (a Part 1 Interface) */
  static readonly ExternalDataConnector = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector';

  /** The external data reference (as defined in AutomationML 2.1) */
  static readonly ExternalDataReference = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/ExternalDataReference';

  /** The interlocking connector interface class path (a Part 1 Interface) */
  static readonly InterlockingConnector = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/InterlockingConnector';

  /**
   * The interlocking logic interface class path (a Part 4 Interface)
   * @deprecated This RoleClass has been renamed to InterlockingLogicModelInterface and moved to AutomationMLLogicInterfaceClassLib
   */
  static readonly InterlockingLogicInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicInterface/InterlockingLogicInterface';

  /**
   * The interlocking variable interface class path (a Part 4 Interface)
   * @deprecated This RoleClass has been  moved to AutomationMLLogicInterfaceClassLib
   */
  static readonly InterlockingVariableInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/VariableInterface/InterlockingVariableInterface';

  /**
   * The logic element interface class path (a Part 4 Interface)
   * @deprecated This RoleClass has been renamed to LogicModelElementInterface and moved to AutomationMLLogicInterfaceClassLib
   */
  static readonly LogicElementInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicElementInterface';

  /**
   * The logic interface class path (a Part 4 Interface)
   * @deprecated This RoleClass has been renamed to LogicModelInterface and moved to AutomationMLLogicInterfaceClassLib
   */
  static readonly LogicInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicInterface';

  /** The order interface class path (a Part 1 Interface) */
  static readonly Order = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/Order';

  /** The PLCopenXML interface class path (a Part 1 Interface) */
  static readonly PLCopenXMLInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface';

  /** The port connector interface class path (a Part 1 Interface) */
  static readonly PortConnector = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/PortConnector';

  /** The PPR connector interface class path (a Part 1 Interface) */
  static readonly PPRConnector = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/PPRConnector';

  /**
   * The sequencing behaviour logic interface class path (a Part 4 Interface)
   * @deprecated This RoleClass has been removed from the InterfaceClassLib
   */
  static readonly SequencingBehaviourLogicInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicInterface/SequencingBehaviourLogicInterface';

  /**
   * The sequencing logic interface class path (a Part 4 Interface)
   * @deprecated This RoleClass has been renamed to SequencingLogicModelInterface and moved to AutomationMLLogicInterfaceClassLib
   */
  static readonly SequencingLogicInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicInterface/SequencingLogicInterface';

  /** The signal interface class path (a Part 1 Interface) */
  static readonly SignalInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/Communication/SignalInterface';

  /**
   * The variable interface class path (a Part 4 Interface)
   * @deprecated This RoleClass has been moved to AutomationMLLogicInterfaceClassLib
   */
  static readonly VariableInterface = 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/VariableInterface';

  /**
   * Gets the AutomationMLInterfaceClassLib from the provided document. If the document doesn't contain the required library it will be automatically imported from an external resource.
   */
  static addAutomationMLInterfaceClassLib(caexDocument: CAEXDocument): AutomationMLInterfaceClassLibType | null {
    return T.AutomationMLInterfaceClassLibType.interfaceClassLib(caexDocument);
  }

  /**
   * Determines whether the specified interface class is derived from the AutomationMLBase interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isAutomationMLBaseInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the BehaviourLogicInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   * @deprecated This RoleClass has been renamed to BehaviourLogicModelInterface and moved to AutomationMLLogicInterfaceClassLib
   */
  static isBehaviourLogicInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicInterface/BehaviourLogicInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the COLLADAInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isCOLLADAInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/COLLADAInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the Communication interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isCommunicationInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/Communication');
  }

  /**
   * Determines whether the specified interface class is derived from the ExternalDataConnector interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isExternalDataConnector(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector');
  }

  /**
   * Determines whether the specified interface class is derived from the ExternalDataReference interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isExternalDataReference(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/ExternalDataReference');
  }

  /**
   * Determines whether the specified interface class is derived from the InterlockingConnector interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isInterlockingConnector(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/InterlockingConnector');
  }

  /**
   * Determines whether the specified interface class is derived from the InterlockingLogicInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   * @deprecated This RoleClass has been renamed to InterlockingLogicModelInterface and moved to AutomationMLLogicInterfaceClassLib
   */
  static isInterlockingLogicInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicInterface/InterlockingLogicInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the InterlockingVariableInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   * @deprecated This RoleClass has been moved to AutomationMLLogicInterfaceClassLib
   */
  static isInterlockingVariableInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/VariableInterface/InterlockingVariableInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the LogicElementInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   * @deprecated This RoleClass has been renamed to LogicModelElementInterface and moved to AutomationMLLogicInterfaceClassLib
   */
  static isLogicElementInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicElementInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the LogicInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   * @deprecated This RoleClass has been renamed to LogicModelInterface and moved to AutomationMLLogicInterfaceClassLib
   */
  static isLogicInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the Order interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isOrderInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/Order');
  }

  /**
   * Determines whether the specified interface class is derived from the PLCopenXMLInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isPLCopenXMLInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the PortConnector interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isPortConnector(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/PortConnector');
  }

  /**
   * Determines whether the specified interface class is derived from the PPRConnector interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isPPRConnector(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/PPRConnector');
  }

  /**
   * Determines whether the specified interface class is derived from the SequencingBehaviourLogicInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   * @deprecated This RoleClass has been removed from the InterfaceClassLib
   */
  static isSequencingBehaviourLogicInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicInterface/SequencingBehaviourLogicInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the SequencingLogicInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   * @deprecated This RoleClass has been renamed to SequencingLogicModelInterface and moved to AutomationMLLogicInterfaceClassLib
   */
  static isSequencingLogicInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/LogicInterface/SequencingLogicInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the SignalInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   */
  static isSignalInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/Communication/SignalInterface');
  }

  /**
   * Determines whether the specified interface class is derived from the VariableInterface interface class. The method can resolve alias references anywhere in the inheritance hierarchy.
   * @deprecated This RoleClass has been moved to AutomationMLLogicInterfaceClassLib
   */
  static isVariableInterface(interfaceClass: InterfaceClassType): boolean {
    return InheritanceExtensions.isDerivedFromInterfaceClass(interfaceClass, 'AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface/VariableInterface');
  }

  /** Makes the AutomationML base interface. */
  static makeAutomationMLBaseInterface(interfaceClass: InterfaceClassType, alias: string | null = null): void {
    interfaceClass.refBaseClassPath = ClassReferenceWithAlias.classReference('AutomationMLInterfaceClassLib/AutomationMLBaseInterface', alias);
  }

  /** Makes the COLLADA interface. */
  static makeCOLLADAInterface(interfaceClass: InterfaceClassType, alias: string | null = null): void {
    interfaceClass.refBaseClassPath = ClassReferenceWithAlias.classReference('AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/COLLADAInterface', alias);
  }

  /** Makes the communication interface. */
  static makeCommunicationInterface(interfaceClass: InterfaceClassType, alias: string | null = null): void {
    interfaceClass.refBaseClassPath = ClassReferenceWithAlias.classReference('AutomationMLInterfaceClassLib/AutomationMLBaseInterface/Communication', alias);
  }

  /** Makes the external data connector. */
  static makeExternalDataConnector(interfaceClass: InterfaceClassType, alias: string | null = null): void {
    interfaceClass.refBaseClassPath = ClassReferenceWithAlias.classReference('AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector', alias);
  }

  /** Makes the interlocking connector. */
  static makeInterlockingConnector(interfaceClass: InterfaceClassType, alias: string | null = null): void {
    interfaceClass.refBaseClassPath = ClassReferenceWithAlias.classReference('AutomationMLInterfaceClassLib/AutomationMLBaseInterface/InterlockingConnector', alias);
  }

  /** Makes the order interface. */
  static makeOrderInterface(interfaceClass: InterfaceClassType, alias: string | null = null): void {
    interfaceClass.refBaseClassPath = ClassReferenceWithAlias.classReference('AutomationMLInterfaceClassLib/AutomationMLBaseInterface/Order', alias);
  }

  /** Makes the PLCopen XML interface. */
  static makePLCopenXMLInterface(interfaceClass: InterfaceClassType, alias: string | null = null): void {
    interfaceClass.refBaseClassPath = ClassReferenceWithAlias.classReference('AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/PLCopenXMLInterface', alias);
  }

  /** Makes the port connector. */
  static makePortConnector(interfaceClass: InterfaceClassType, alias: string | null = null): void {
    interfaceClass.refBaseClassPath = ClassReferenceWithAlias.classReference('AutomationMLInterfaceClassLib/AutomationMLBaseInterface/PortConnector', alias);
  }

  /** Makes the PPR connector. */
  static makePPRConnector(interfaceClass: InterfaceClassType, alias: string | null = null): void {
    interfaceClass.refBaseClassPath = ClassReferenceWithAlias.classReference('AutomationMLInterfaceClassLib/AutomationMLBaseInterface/PPRConnector', alias);
  }

  /** Makes the signal interface. */
  static makeSignalInterface(interfaceClass: InterfaceClassType, alias: string | null = null): void {
    interfaceClass.refBaseClassPath = ClassReferenceWithAlias.classReference('AutomationMLInterfaceClassLib/AutomationMLBaseInterface/Communication/SignalInterface', alias);
  }
}
