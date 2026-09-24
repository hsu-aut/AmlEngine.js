// Port of Aml.Engine.AmlObjects.AutomationMLBaseRoleClassLib (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { InheritanceExtensions } from '../caex/extensions/InheritanceExtensions.js';
import { AutomationMLInterfaceClassLib } from './AutomationMLInterfaceClassLib.js';
import { ClassReferenceWithAlias } from './ClassReferenceWithAlias.js';
import type { AutomationMLBaseRoleClassLibType } from './AutomationMLBaseRoleClassLibType.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { IObjectWithRoleReference } from '../caex/IObjectWithRoleReference.js';

/** Constants and extension methods for the AutomationMLBaseRoleClassLib. */
export class AutomationMLBaseRoleClassLib {
  private constructor() {}

  /** The 'AutomationMLBaseRole' RoleClass path */
  static readonly AutomationMLBaseRole = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole';

  /** The 'AutomationMLBaseRoleClassLib' library name */
  static readonly AutomationMLBaseRoleClassLibName = 'AutomationMLBaseRoleClassLib';

  /** The 'Facet' RoleClass path */
  static readonly Facet = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Facet';

  /** The 'Frame' RoleClass path */
  static readonly Frame = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Frame';

  /** The 'Group' RoleClass path */
  static readonly Group = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group';

  /**
   * The 'InterlockingSourceGroup' RoleClass path
   * @deprecated This RoleClass has been moved to AutomationMLLogicRoleClassLib
   */
  static readonly InterlockingSourceGroup = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group/InterlockingSourceGroup';

  /**
   * The 'InterlockingTargetGroup' RoleClass path
   * @deprecated This RoleClass has been moved to AutomationMLLogicRoleClassLib
   */
  static readonly InterlockingTargetGroup = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group/InterlockingTargetGroup';

  /**
   * The 'LogicObject' RoleClass path
   * @deprecated This RoleClass has been renamed to LogicModelObject and moved to AutomationMLLogicRoleClassLib
   */
  static readonly LogicObject = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/LogicObject';

  /** The 'Port' RoleClass path */
  static readonly Port = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Port';

  /** The 'Process' RoleClass path */
  static readonly Process = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Process';

  /** The 'ProcessStructure' RoleClass path */
  static readonly ProcessStructure = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProcessStructure';

  /** The 'Product' RoleClass path */
  static readonly Product = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Product';

  /** The 'ProductStructure' RoleClass path */
  static readonly ProductStructure = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProductStructure';

  /** The 'PropertySet' RoleClass path */
  static readonly PropertySet = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/PropertySet';

  /** The 'Resource' RoleClass path */
  static readonly Resource = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Resource';

  /** The 'ResourceStructure' RoleClass path */
  static readonly ResourceStructure = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ResourceStructure';

  /** The 'Structure' RoleClass path */
  static readonly Structure = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure';

  /**
   * Gets the AutomationMLBaseRoleClassLib from the provided document. If the document doesn't contain the required library it will be automatically imported from an external resource.
   */
  static addAutomationMLBaseRoleClassLib(caexDocument: CAEXDocument): AutomationMLBaseRoleClassLibType {
    return T.AutomationMLBaseRoleClassLibType.roleClassLib(caexDocument);
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the AutomationMLBaseRole RoleClass
   */
  static isAutomationMLBaseRole(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the Facet RoleClass
   */
  static isFacet(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Facet');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the Frame RoleClass
   */
  static isFrame(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Frame');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the Group RoleClass
   */
  static isGroup(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the InterlockingSourceGroup RoleClass
   * @deprecated This RoleClass has been moved to AutomationMLLogicRoleClassLib
   */
  static isInterlockingSourceGroup(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group/InterlockingSourceGroup');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the InterlockingTargetGroup RoleClass
   * @deprecated This RoleClass has been moved to AutomationMLLogicRoleClassLib
   */
  static isInterlockingTargetGroup(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group/InterlockingTargetGroup');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the LogicObject RoleClass
   * @deprecated This RoleClass has been renamed and moved to AutomationMLLogicRoleClassLib
   */
  static isLogicObject(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/LogicObject');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the Port RoleClass
   */
  static isPort(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Port');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the Process RoleClass
   */
  static isProcess(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Process');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the ProcessStructure RoleClass
   */
  static isProcessStructure(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProcessStructure');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the Product RoleClass
   */
  static isProduct(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Product');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the ProductStructure RoleClass
   */
  static isProductStructure(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProductStructure');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the PropertySet RoleClass
   */
  static isPropertySet(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/PropertySet');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the Resource RoleClass
   */
  static isResource(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Resource');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the ResourceStructure RoleClass
   */
  static isResourceStructure(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ResourceStructure');
  }

  /**
   * Determines whether the specified role reference defines an inheritance relation from the Structure RoleClass
   */
  static isStructure(role: IObjectWithRoleReference): boolean {
    return InheritanceExtensions.isDerivedFromRoleClass(role, 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure');
  }

  /** Makes the AutomationML base role. */
  static makeAutomationMLBaseRole(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole', alias);
  }

  /** Makes the facet. */
  static makeFacet(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Facet', alias);
  }

  /** Makes the group. */
  static makeGroup(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group', alias);
  }

  /** Makes the port. */
  static makePort(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Port', alias);
    if (usedRole instanceof T.RoleRequirementsType) {
      const roleRequirementsType = usedRole;
      AutomationMLInterfaceClassLib.makePortConnector(roleRequirementsType.externalInterface.append('portConnector'), alias);
    }
  }

  /** Makes the process. */
  static makeProcess(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Process', alias);
  }

  /** Makes the process structure. */
  static makeProcessStructure(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProcessStructure', alias);
  }

  /** Makes the Product. */
  static makeProduct(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Product', alias);
  }

  /** Makes the product structure. */
  static makeProductStructure(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProductStructure', alias);
  }

  /** Makes the property set. */
  static makePropertySet(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/PropertySet', alias);
  }

  /** Makes the resource. */
  static makeResource(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Resource', alias);
  }

  /** Makes the resource structure. */
  static makeResourceStructure(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ResourceStructure', alias);
  }

  /** Makes the structure. */
  static makeStructure(usedRole: IObjectWithRoleReference, alias: string | null = null): void {
    usedRole.roleReference = ClassReferenceWithAlias.classReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure', alias);
  }
}
