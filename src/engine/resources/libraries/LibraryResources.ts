// Port of Aml.Engine.Resources.AMLStandard.LibraryResources (Aml.Engine.Resources 4.2.1).

/** Library resources, included as embedded resources. */
export class LibraryResources {
  private constructor() {}

  /** Gets the name of the AutomationMLBPRInterfaceClassLib. */
  static readonly AutomationMLBPRInterfaceClassLib = 'AutomationMLBPRInterfaceClassLib';

  /** Gets the name of the AutomationMLBPRRoleClassLib. */
  static readonly AutomationMLBPRRoleClassLib = 'AutomationMLBPRRoleClassLib';

  /** Gets the name of the AutomationMLBaseRoleClassLib. */
  static readonly AutomationMLBaseRoleClassLib = 'AutomationMLBaseRoleClassLib';

  /** Gets the name of the AutomationMLBaseAttributeTypeLib. */
  static readonly AutomationMLBaseAttributeTypeLib = 'AutomationMLBaseAttributeTypeLib';

  /** Gets the name of the AutomationMLInterfaceClassLib. */
  static readonly AutomationMLInterfaceClassLib = 'AutomationMLInterfaceClassLib';

  /** Gets the name of the AutomationMLLogicRoleClassLib. */
  static readonly AutomationMLLogicRoleClassLib = 'AutomationMLLogicRoleClassLib';

  /** Gets the name of the AutomationMLLogicInterfaceClassLib. */
  static readonly AutomationMLLogicInterfaceClassLib = 'AutomationMLLogicInterfaceClassLib';

  /** Gets the name of the AutomationMLPLCopenXMLInterfaceClassLib. */
  static readonly AutomationMLPLCopenXMLInterfaceClassLib = 'AutomationMLPLCopenXMLInterfaceClassLib';

  /**
   * Determines, if the provided library name can be used to load this library from an embedded resource.
   * @param libraryName The name of the library.
   * @returns `true`, if the named library is an embedded resource.
   */
  static exist(libraryName: string | null): boolean {
    switch (libraryName) {
      case 'AutomationMLBPRInterfaceClassLib':
      case 'AutomationMLBaseAttributeTypeLib':
      case 'AutomationMLInterfaceClassLib':
      case 'AutomationMLLogicRoleClassLib':
      case 'AutomationMLBaseRoleClassLib':
      case 'AutomationMLBPRRoleClassLib':
      case 'AutomationMLLogicInterfaceClassLib':
      case 'AutomationMLPLCopenXMLInterfaceClassLib':
        return true;
      default:
        return false;
    }
  }
}
