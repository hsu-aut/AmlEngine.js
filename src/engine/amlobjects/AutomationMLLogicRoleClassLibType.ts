// Port of Aml.Engine.AmlObjects.AutomationMLLogicRoleClassLibType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { CAEXFileTypeExtensions } from '../caex/extensions/CAEXFileTypeExtensions.js';
import { AMLLibraries } from '../resources/libraries/AMLLibraries.js';
import { AMLLibraryType } from './AMLLibraryType.js';
import { AmlObjectsExtensions } from './extensions/AmlObjectsExtensions.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from '../caex/CAEXSequenceOfCAEXObjectsWithReference.js';
import type { RoleFamilyType } from '../caex/RoleFamilyType.js';
import type { XElement } from '../../xml/index.js';

/** The AutomationMLLogicRoleClassLib with access to its role classes. */
export class AutomationMLLogicRoleClassLibType extends AMLLibraryType<RoleFamilyType> {
  /** Gets the class 'AutomationMLLogicRoleClassLib/InterlockingSourceGroup'. */
  get interlockingSourceGroup(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLLogicRoleClassLib/InterlockingSourceGroup');
  }

  /** Gets the class 'AutomationMLLogicRoleClassLib/InterlockingTargetGroup'. */
  get interlockingTargetGroup(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLLogicRoleClassLib/InterlockingTargetGroup');
  }

  /** Gets the class 'AutomationMLLogicRoleClassLib/LogicModelObject'. */
  get logicModelObject(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLLogicRoleClassLib/LogicModelObject');
  }

  /** Gets the RoleClass objects of the library. */
  get roleClass(): CAEXSequenceOfCAEXObjectsWithReference<RoleFamilyType> {
    return this.libraryElements;
  }

  /** @internal Initializes a new instance for the library node. */
  constructor(roleClassLib: XElement | null) {
    super(roleClassLib, T.RoleFamilyType);
    this.createElementSequence = (o: XElement) => new T.CAEXSequenceOfCAEXObjectsWithReference<RoleFamilyType>(o, 'RoleClass', T.RoleFamilyType.Constructor, () => this);
  }

  /**
   * Gets the AutomationMLLogicRoleClassLib of the document; if it does not exist, it is loaded from the embedded
   * AutomationML library resource and imported into the document.
   */
  static roleClassLib(document: CAEXDocument): AutomationMLLogicRoleClassLibType | null {
    const libType = document.caexFile!.roleClassLib.item('AutomationMLLogicRoleClassLib');
    if (!T.CAEXWrapper.equals(libType, null)) {
      return new AutomationMLLogicRoleClassLibType(libType!.node);
    }
    const stream = AMLLibraries.getAutomationMLLibrary('AutomationMLLogicRoleClassLib', AmlObjectsExtensions.automationMLVersion(document), document.schemaVersionString);
    if (stream == null) {
      return null;
    }
    const imported = AMLLibraryType.loadExternalLibrary(document, stream, (doc: CAEXDocument) =>
      CAEXFileTypeExtensions.importRoleClassLib(document.caexFile!, doc.caexFile!.roleClassLib.item('AutomationMLLogicRoleClassLib')!),
    );
    return new AutomationMLLogicRoleClassLibType(imported instanceof T.RoleClassLibType ? imported.node : null);
  }
}

registerInterfaces(AutomationMLLogicRoleClassLibType, 'IRoleClassContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.AutomationMLLogicRoleClassLibType = AutomationMLLogicRoleClassLibType;
