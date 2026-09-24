// Port of Aml.Engine.CAEX.ExternalInterfaceType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import { InterfaceClassType } from './InterfaceClassType.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { ExternalInterfaceTypeExtensions } from './extensions/ExternalInterfaceTypeExtensions.js';
import { InheritanceExtensions } from './extensions/InheritanceExtensions.js';
import { InstanceExtensions } from './extensions/InstanceExtensions.js';
import { ClassReferenceWithAlias } from '../amlobjects/ClassReferenceWithAlias.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import type { CAEXObject } from './CAEXObject.js';
import type { IObjectWithExternalInterface } from './IObjectWithExternalInterface.js';
import type { InterfaceFamilyType } from './InterfaceFamilyType.js';
import type { ObjectWithAMLAttributes } from '../amlobjects/ObjectWithAMLAttributes.js';

/** Wrapper for the CAEX element 'ExternalInterface'. */
export class ExternalInterfaceType extends InterfaceClassType {
  /** Gets the object owning this interface (RoleClass, RoleRequirement, SystemUnitClass, InternalElement or InterfaceClass). */
  get associatedObject(): IObjectWithExternalInterface | null {
    for (let xElement = this.node?.parent ?? null; xElement != null; xElement = xElement.parent) {
      if (XmlCAEXSchema.isRoleClass(xElement)) {
        return new T.RoleFamilyType(xElement);
      }
      if (XmlCAEXSchema.isRoleRequirement(xElement)) {
        return new T.RoleRequirementsType(xElement);
      }
      if (XmlCAEXSchema.isSystemUnitClass(xElement)) {
        return new T.SystemUnitFamilyType(xElement);
      }
      if (XmlCAEXSchema.isInternalElement(xElement)) {
        return new T.InternalElementType(xElement);
      }
      if (XmlCAEXSchema.isInterfaceClass(xElement)) {
        return new T.InterfaceFamilyType(xElement);
      }
    }
    return null;
  }

  /** Gets and sets the referenced InterfaceClass (the base class). */
  get interfaceClass(): InterfaceFamilyType | null {
    return this.baseClass;
  }

  set interfaceClass(value: InterfaceFamilyType | null) {
    this.baseClass = value;
  }

  /** `IMirror.IsMaster` (explicit interface implementation in C#). */
  get isMaster(): boolean {
    return ExternalInterfaceTypeExtensions.isMaster(this);
  }

  /** Determines, if this instance is a Mirror. */
  get isMirror(): boolean {
    if (!isNullOrEmpty(this.refBaseClassPath)) {
      return CAEXPathBuilder.isValidID(this.refBaseClassPath, this.caexDocument);
    }
    return false;
  }

  /**
   * Gets and sets the Master. A Master is only defined, if this instance is a mirror. Setting a
   * master transforms this instance into a mirror.
   */
  get master(): ExternalInterfaceType | null {
    if (!this.isMirror) {
      return null;
    }
    const found: CAEXObject | null = ServiceLocator.queryService.findByID(CAEXBasicObjectExtensions.caexDocument(this), this.refBaseClassPath);
    return found instanceof T.ExternalInterfaceType ? found : null;
  }

  set master(value: ExternalInterfaceType | null) {
    if (T.CAEXWrapper.equals(value, null) || isNullOrEmpty(value!.id)) {
      this.refBaseClassPath = null;
      return;
    }
    const externalReferenceResolverService = ServiceLocator.externalReferenceResolverService;
    let isExternal = false;
    let alias: string | null = null;
    if (externalReferenceResolverService != null) {
      const r = externalReferenceResolverService.isExternal(CAEXBasicObjectExtensions.caexDocument(this)!, value!.node!);
      alias = r.alias;
      isExternal = r.result;
    }
    this.refBaseClassPath = isExternal ? ClassReferenceWithAlias.classReference(value!.id, alias) : value!.id;
  }

  /** Gets the master identifier, if this ExternalInterface is a mirror. */
  get masterID(): string | null {
    if (!this.isMirror) {
      return null;
    }
    return this.refBaseClassPath;
  }

  /** The constructor function for the ExternalInterfaceType. */
  static get Constructor(): (n: XElement | null) => ExternalInterfaceType {
    return (n) => new ExternalInterfaceType(n);
  }

  /** The instantiated InterfaceClass (`IInstance.Class`). */
  get class(): InterfaceFamilyType | null {
    return this.interfaceClass;
  }

  set class(value: InterfaceFamilyType | null) {
    this.interfaceClass = value;
  }

  /**
   * Initializes a new instance.
   * @param externalInterfaceNode An 'ExternalInterface' XML node.
   */
  constructor(externalInterfaceNode: XElement | null) {
    super(externalInterfaceNode);
  }

  /** C# `implicit operator ObjectWithAMLAttributes(ExternalInterfaceType)`. */
  static override op_Implicit(interfaceClass: ExternalInterfaceType | null): ObjectWithAMLAttributes | null {
    if (!T.CAEXWrapper.equals(interfaceClass, null)) {
      return new T.ObjectWithAMLAttributes(interfaceClass!);
    }
    return null;
  }

  /** Creates a new mirror of this ExternalInterface; this instance becomes its master. */
  createMirror(): ExternalInterfaceType {
    const mirror = new ExternalInterfaceType(this.externalInterface.createElement(this.owner));
    mirror.master = this;
    mirror.name = this.name;
    return mirror;
  }

  /**
   * Determines whether this ExternalInterface references the specified InterfaceClass, optionally
   * regarding inheritance.
   */
  hasInterfaceClassReference(interfaceClass: InterfaceFamilyType | null, regardInheritance = false): boolean {
    if (!T.CAEXWrapper.equals(interfaceClass, null)) {
      if (!regardInheritance) {
        return this.interfaceClass?.equals(interfaceClass) ?? false;
      }
      const own = this.interfaceClass;
      return (own == null ? null : InheritanceExtensions.classIsDerivedFrom(own, interfaceClass!)) === true;
    }
    throw new ArgumentNullException('interfaceClass');
  }

  /** Removes this ExternalInterface. With `removeRelations`, InternalLinks to it are removed as well. */
  override remove(removeRelations = false): void {
    if (removeRelations) {
      for (const item of [...ServiceLocator.queryService.internalLinksToInterface(this)]) {
        item.remove();
      }
    }
    super.remove(removeRelations);
  }

  /**
   * Updates the ExternalInterface with added external interfaces and attributes of the referenced
   * InterfaceClass.
   */
  updateInstance(): boolean {
    if (T.CAEXWrapper.equals(this.baseClass, null)) {
      return false;
    }
    InstanceExtensions.updateWithAddedExternalInterfaces(this, this.baseClass);
    InstanceExtensions.updateWithAddedAttributes(this, this.baseClass);
    return true;
  }
}

registerInterfaces(
  ExternalInterfaceType,
  'IInstance_1',
  'IInstance',
  'IMirror_1',
  'IMirror',
  'ICAEXObject',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
);

T.ExternalInterfaceType = ExternalInterfaceType;
