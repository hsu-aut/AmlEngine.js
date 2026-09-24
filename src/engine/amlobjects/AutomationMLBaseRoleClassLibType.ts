// Port of Aml.Engine.AmlObjects.AutomationMLBaseRoleClassLibType (Aml.Engine 4.5.2).

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

/** The AutomationMLBaseRoleClassLib with access to its standardized role classes. */
export class AutomationMLBaseRoleClassLibType extends AMLLibraryType<RoleFamilyType> {
  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole'. */
  get automationMLBaseRole(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Facet'. */
  get facet(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Facet');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Frame'. */
  get frame(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Frame');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group'. */
  get group(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group');
  }

  /**
   * Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group/InterlockingSourceGroup'.
   * @deprecated This RoleClass has been moved to AutomationMLLogicRoleClassLibType
   */
  get interlockingSourceGroup(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group/InterlockingSourceGroup');
  }

  /**
   * Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group/InterlockingTargetGroup'.
   * @deprecated This RoleClass has been moved to AutomationMLLogicRoleClassLib
   */
  get interlockingTargetGroup(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group/InterlockingTargetGroup');
  }

  /**
   * Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/LogicObject'.
   * @deprecated This RoleClass has been moved to AutomationMLLogicRoleClassLib
   */
  get logicObject(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/LogicObject');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Port'. */
  get port(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Port');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Process'. */
  get process(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Process');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProcessStructure'. */
  get processStructure(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProcessStructure');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Product'. */
  get product(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Product');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProductStructure'. */
  get productStructure(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProductStructure');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/PropertySet'. */
  get propertySet(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/PropertySet');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Resource'. */
  get resource(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Resource');
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ResourceStructure'. */
  get resourceStructure(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ResourceStructure');
  }

  /** Gets the RoleClass objects of the library. */
  get roleClass(): CAEXSequenceOfCAEXObjectsWithReference<RoleFamilyType> {
    return this.libraryElements;
  }

  /** Gets the class 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure'. */
  get structure(): RoleFamilyType | null {
    return this.automationMLClass('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure');
  }

  /** @internal Initializes a new instance for the library node. */
  constructor(roleClassLib: XElement | null) {
    super(roleClassLib, T.RoleFamilyType);
    this.createElementSequence = (o: XElement) => new T.CAEXSequenceOfCAEXObjectsWithReference<RoleFamilyType>(o, 'RoleClass', T.RoleFamilyType.Constructor, () => this);
  }

  /** Determines whether the library is loaded in the document. */
  static isLoaded(document: CAEXDocument | null): boolean {
    return document != null && !T.CAEXWrapper.equals(document.caexFile!.roleClassLib.item('AutomationMLBaseRoleClassLib'), null);
  }

  /**
   * Gets the AutomationMLBaseRoleClassLib of the document; if it does not exist, it is loaded from the embedded
   * AutomationML library resource and imported into the document.
   */
  static roleClassLib(document: CAEXDocument): AutomationMLBaseRoleClassLibType {
    const libType = document.caexFile!.roleClassLib.item('AutomationMLBaseRoleClassLib');
    if (!T.CAEXWrapper.equals(libType, null)) {
      return new AutomationMLBaseRoleClassLibType(libType!.node);
    }
    const stream = AMLLibraries.automationMLBaseRoleClassLib(AmlObjectsExtensions.automationMLVersion(document), document.schemaVersionString);
    const imported = AMLLibraryType.loadExternalLibrary(document, stream, (doc: CAEXDocument) =>
      CAEXFileTypeExtensions.importRoleClassLib(document.caexFile!, doc.caexFile!.roleClassLib.item('AutomationMLBaseRoleClassLib')!),
    );
    return new AutomationMLBaseRoleClassLibType(imported instanceof T.RoleClassLibType ? imported.node : null);
  }
}

registerInterfaces(AutomationMLBaseRoleClassLibType, 'IRoleClassContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.AutomationMLBaseRoleClassLibType = AutomationMLBaseRoleClassLibType;
