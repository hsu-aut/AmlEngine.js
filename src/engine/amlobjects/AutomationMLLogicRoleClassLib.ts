// Port of Aml.Engine.AmlObjects.AutomationMLLogicRoleClassLib (Aml.Engine 4.5.2).

import { InheritanceExtensions } from '../caex/extensions/InheritanceExtensions.js';
import type { IObjectWithRoleReference } from '../caex/IObjectWithRoleReference.js';

/** Constants and methods for the AutomationMLLogicRoleClassLib. */
export class AutomationMLLogicRoleClassLib {
  private constructor() {}

  /** The 'AutomationMLLogicRoleClassLib' library name */
  static readonly AutomationMLLogicRoleClassLibName = 'AutomationMLLogicRoleClassLib';

  /** The 'InterlockingSourceGroup' RoleClass path */
  static readonly InterlockingSourceGroup = 'AutomationMLLogicRoleClassLib/InterlockingSourceGroup';

  /** The 'InterlockingTargetGroup' RoleClass path */
  static readonly InterlockingTargetGroup = 'AutomationMLLogicRoleClassLib/InterlockingTargetGroup';

  /** The 'LogicModelObject' RoleClass path */
  static readonly LogicModelObject = 'AutomationMLLogicRoleClassLib/LogicModelObject';

  /**
   * Determines whether the specified role reference defines an inheritance relation from the InterlockingSourceGroup RoleClass
   */
  static isInterlockingSourceGroup(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLLogicRoleClassLib/InterlockingSourceGroup');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the InterlockingTargetGroup RoleClass
   */
  static isInterlockingTargetGroup(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLLogicRoleClassLib/InterlockingTargetGroup');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the LogicModelObject RoleClass
   */
  static isLogicModelObject(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLLogicRoleClassLib/LogicModelObject');
  }
}
