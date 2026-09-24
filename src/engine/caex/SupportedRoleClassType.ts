// Port of Aml.Engine.CAEX.SupportedRoleClassType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { ArgumentException } from '../../system/exceptions.js';
import type { XElement } from '../../xml/index.js';
import { CAEXBasicObject } from './CAEXBasicObject.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { IObjectWithRoleReference } from './IObjectWithRoleReference.js';
import type { MappingType } from './MappingType.js';
import type { RoleFamilyType } from './RoleFamilyType.js';
import type { SystemUnitClassType } from './SystemUnitClassType.js';

/** Wrapper for the CAEX element 'SupportedRoleClass'. */
export class SupportedRoleClassType extends CAEXBasicObject implements IObjectWithRoleReference {
  /** The constructor function for the SupportedRoleClassType (set by the static constructor). */
  static Constructor: (n: XElement | null) => SupportedRoleClassType;

  /** Gets the MappingObject of this SupportedRoleClass. */
  get mappingObject(): MappingType {
    const mappingType = new T.MappingType(this.element('MappingObject'));
    if (!mappingType.exists) {
      mappingType.owner = this.node;
    }
    return mappingType;
  }

  /** Gets and sets the RefRoleClassPath attribute. */
  get refRoleClassPath(): string | null {
    return this.getXAttributeValue('RefRoleClassPath');
  }

  set refRoleClassPath(value: string | null) {
    if (!(this.refRoleClassPath === value)) {
      this.setXAttributeValue('RefRoleClassPath', value);
      this.raisePropertyChanged('RefRoleClassPath');
    }
  }

  /** Gets and sets the referenced RoleClass. */
  get roleClass(): RoleFamilyType | null {
    const found = ServiceLocator.queryService.findByPath(this.caexDocument, this.roleReference, true, T.RoleClassType);
    return found instanceof T.RoleFamilyType ? found : null;
  }

  set roleClass(value: RoleFamilyType | null) {
    this.roleReference = value?.getReferencePath(this) ?? null;
  }

  /** Gets and sets the RoleClass reference (the RefRoleClassPath). */
  get roleReference(): string | null {
    return this.refRoleClassPath;
  }

  set roleReference(value: string | null) {
    this.refRoleClassPath = value;
  }

  /** Gets the SystemUnitClass (or InternalElement) owning this SupportedRoleClass. */
  get systemUnitClass(): SystemUnitClassType {
    if (!(this.owner!.name.localName === 'InternalElement')) {
      return new T.SystemUnitFamilyType(this.owner);
    }
    return new T.InternalElementType(this.owner);
  }

  /** The instantiated RoleClass (`IInstance.Class`). */
  get class(): RoleFamilyType | null {
    return this.roleClass;
  }

  set class(value: RoleFamilyType | null) {
    this.roleClass = value;
  }

  /**
   * Initializes a new instance.
   * @param supportedRoleClassNode A 'SupportedRoleClass' XML node.
   */
  constructor(supportedRoleClassNode: XElement | null) {
    super(supportedRoleClassNode);
  }

  static {
    SupportedRoleClassType.Constructor = (n) => new SupportedRoleClassType(n);
  }

  /**
   * Inserts the specified CAEX object (`Insert(CAEXWrapper, bool, bool)`) or at the given position
   * (`Insert(int, CAEXWrapper)`). A MappingType is inserted as the MappingObject.
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      const caexObject = (arg1 ?? null) as CAEXWrapper | null;
      if (!(caexObject instanceof T.MappingType) || this.mappingObject.exists) {
        return super.insert(arg0, caexObject);
      }
      T.InsertCmd.insertElement(this.node!, caexObject.node!);
      return T.CAEXWrapper.equals(this.mappingObject, caexObject);
    }
    const caexObject = arg0;
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (!(caexObject instanceof T.MappingType) || this.mappingObject.exists) {
      return super.insert(caexObject, asFirst, asIs);
    }
    T.InsertCmd.insertElement(this.node!, caexObject.node!);
    return this.mappingObject != null;
  }

  /** Imports the CAEX object; a MappingType is inserted as the MappingObject. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!(caexObject instanceof T.MappingType) || this.mappingObject.exists) {
      return super.import(caexObject, name, withSubclasses);
    }
    T.InsertCmd.insertElement(this.node!, caexObject.node!);
    return this.mappingObject;
  }

  /** Adds a new MappingObject element to this SupportedRoleClass. */
  new_MappingObject(): MappingType {
    if (!this.exists) {
      throw new ArgumentException('A SupportedRoleClass object doesn\'t exist!');
    }
    const mappingObject = this.mappingObject;
    mappingObject.insertNew();
    return mappingObject;
  }

  /** Updates the instance; a SupportedRoleClass has nothing to update. */
  updateInstance(): boolean {
    return true;
  }
}

registerInterfaces(SupportedRoleClassType, 'IObjectWithRoleReference', 'ICAEXWrapper', 'IXMLWrapper', 'IInstance_1', 'IInstance');

T.SupportedRoleClassType = SupportedRoleClassType;
