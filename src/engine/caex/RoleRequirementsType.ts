// Port of Aml.Engine.CAEX.RoleRequirementsType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { newException } from './CAEXWrapper.js';
import { from, type Enumerable } from '../../system/linq.js';
import { ArgumentException, ArgumentNullException, IndexOutOfRangeException, InvalidCastException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import { CAEXBasicObject } from './CAEXBasicObject.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { InheritanceExtensions } from './extensions/InheritanceExtensions.js';
import { InstanceExtensions } from './extensions/InstanceExtensions.js';
import { ObjectWithBaseClass } from './extensions/ObjectWithBaseClass.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import type { AttributeSequence } from './AttributeSequence.js';
import type { AttributeType } from './AttributeType.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ExternalInterfaceSequence } from './ExternalInterfaceSequence.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { IObjectWithRoleReference } from './IObjectWithRoleReference.js';
import type { InternalElementType } from './InternalElementType.js';
import type { MappingType } from './MappingType.js';
import type { RoleClassType } from './RoleClassType.js';
import type { RoleFamilyType } from './RoleFamilyType.js';
import type { SupportedRoleClassType } from './SupportedRoleClassType.js';
import type { ObjectWithAMLAttributes } from '../amlobjects/ObjectWithAMLAttributes.js';

/** C# `(InternalElementType)x`: null passes, a wrong type throws InvalidCastException. */
function asInternalElement(x: unknown): InternalElementType {
  if (x !== null && x !== undefined && !(x instanceof T.InternalElementType)) {
    throw new InvalidCastException(`Unable to cast object of type '${(x as object).constructor.name}' to type 'Aml.Engine.CAEX.InternalElementType'.`);
  }
  return x as InternalElementType;
}

/** C# array indexing: IndexOutOfRangeException outside the bounds. */
function at<V>(array: V[], index: number): V {
  if (index < 0 || index >= array.length) {
    throw new IndexOutOfRangeException('Index was outside the bounds of the array.');
  }
  return array[index];
}

/** Wrapper for the CAEX element 'RoleRequirements'. */
export class RoleRequirementsType extends CAEXBasicObject implements IObjectWithRoleReference {
  private _attribute: AttributeSequence | null = null;

  private _externalInterface: ExternalInterfaceSequence | null = null;

  /** Gets the collection of Attribute objects for this instance. */
  get attribute(): AttributeSequence {
    return this._attribute ?? (this._attribute = new T.AttributeSequence(this.node, T.AttributeType.Constructor, () => this));
  }

  /** Gets the attributes and all nested attributes. */
  get attributeAndDescendants(): Enumerable<AttributeType> {
    return from<AttributeType>(this.attribute).concat(from<AttributeType>(this.attribute).selectMany((a) => a.attributeAndDescendants));
  }

  /** Gets a collection of ExternalInterface objects contained in this instance. */
  get externalInterface(): ExternalInterfaceSequence {
    return this._externalInterface ?? (this._externalInterface = new T.ExternalInterfaceSequence(this.node, T.ExternalInterfaceType.Constructor, () => this));
  }

  /** Gets the collection of ExternalInterface objects including all nested descendant interfaces. */
  get externalInterfaceAndDescendants(): Enumerable<ExternalInterfaceType> {
    return from<ExternalInterfaceType>(this.externalInterface).concat(
      from<ExternalInterfaceType>(this.externalInterface).selectMany((a) => a.externalInterfaceAndDescendants),
    );
  }

  /** Gets the MappingObject of this RoleRequirement. */
  get mappingObject(): MappingType {
    const mappingType = new T.MappingType(this.element('MappingObject'));
    if (!mappingType.exists) {
      mappingType.owner = this.node;
    }
    return mappingType;
  }

  /** The RoleClasses of the other SupportedRoleClasses of the owning InternalElement. */
  private qualifierRoleClasses(): RoleFamilyType[] {
    return from<SupportedRoleClassType>(asInternalElement(this.caexParent).supportedRoleClass)
      .where((s) => !T.CAEXWrapper.equals(s.roleClass, null) && !T.CAEXWrapper.equals(s.roleClass, this.roleClass))
      .select((s) => s.roleClass!)
      .toList();
  }

  /**
   * Gets the attributes whose names are qualified with the name of another supported RoleClass
   * (CAEX 2.15 multiple roles).
   */
  get qualifiedAttributes(): Iterable<AttributeType> {
    const self = this;
    return {
      *[Symbol.iterator]() {
        const qualifiers = self.qualifierRoleClasses();
        for (const item of self.attribute) {
          if (!isNullOrEmpty(T.CAEXWrapper.classQualifier(from(qualifiers).select((q) => q.name!), item.name!))) {
            yield item;
          }
        }
      },
    };
  }

  /**
   * Gets the external interfaces whose names are qualified with the name of another supported
   * RoleClass (CAEX 2.15 multiple roles).
   */
  get qualifiedExternalInterfaces(): Iterable<ExternalInterfaceType> {
    const self = this;
    return {
      *[Symbol.iterator]() {
        const qualifiers = self.qualifierRoleClasses();
        for (const item of self.externalInterface) {
          if (!isNullOrEmpty(T.CAEXWrapper.classQualifier(from(qualifiers).select((q) => q.name!), item.name!))) {
            yield item;
          }
        }
      },
    };
  }

  /** Gets the qualified attributes with their RoleClass and the RoleClass attribute they map. */
  get qualifiedRoleClassAttributes(): Iterable<{ roleClass: RoleClassType; attribute: AttributeType | null }> {
    const self = this;
    return {
      *[Symbol.iterator]() {
        if (CAEXBasicObjectExtensions.caexSchema(self) !== T.CAEXDocument.CAEXSchema.CAEX2_15 && !self.caexDocument!.isTransformationActive) {
          return;
        }
        for (const qualifiedAttribute of self.qualifiedAttributes) {
          const pathParts = [...CAEXPathBuilder.pathPartObjectNames(qualifiedAttribute.name!, T.CAEXDocument.CAEXSchema.CAEX2_15)];
          const roleFamilyType = asInternalElement(self.caexParent).supportedRoleClassWithName(at(pathParts, 0));
          if (!T.CAEXWrapper.equals(roleFamilyType, null)) {
            yield {
              roleClass: roleFamilyType!,
              attribute: from<AttributeType>(ObjectWithBaseClass.getInheritedAttributesAndDescendants(roleFamilyType!)).firstOrDefault((a) =>
                from(a.attributeNames).sequenceEqual(from(pathParts).skip(1)),
              ),
            };
          }
        }
      },
    };
  }

  /** Gets the qualified external interfaces with their RoleClass and the RoleClass interface they map. */
  get qualifiedRoleClassInterfaces(): Iterable<{ roleClass: RoleClassType; externalInterface: ExternalInterfaceType | null }> {
    const self = this;
    return {
      *[Symbol.iterator]() {
        if (CAEXBasicObjectExtensions.caexSchema(self) !== T.CAEXDocument.CAEXSchema.CAEX2_15 && !self.caexDocument!.isTransformationActive) {
          return;
        }
        for (const qualifiedExternalInterface of self.qualifiedExternalInterfaces) {
          const pathParts = [...CAEXPathBuilder.pathPartObjectNames(qualifiedExternalInterface.name!, T.CAEXDocument.CAEXSchema.CAEX2_15)];
          const roleFamilyType = asInternalElement(self.caexParent).supportedRoleClassWithName(at(pathParts, 0));
          if (!T.CAEXWrapper.equals(roleFamilyType, null)) {
            yield {
              roleClass: roleFamilyType!,
              externalInterface: from<ExternalInterfaceType>(ObjectWithBaseClass.getInheritedInterfaces(roleFamilyType!)).firstOrDefault((a) => a.name === at(pathParts, 1)),
            };
          }
        }
      },
    };
  }

  /** Gets and sets the RefBaseRoleClassPath attribute. */
  get refBaseRoleClassPath(): string | null {
    return this.getXAttributeValue('RefBaseRoleClassPath');
  }

  set refBaseRoleClassPath(value: string | null) {
    if (!(this.refBaseRoleClassPath === value)) {
      this.setXAttributeValue('RefBaseRoleClassPath', value);
      this.raisePropertyChanged('RefBaseRoleClassPath');
    }
  }

  /** Gets and sets the referenced RoleClass. */
  get roleClass(): RoleFamilyType | null {
    const found = ServiceLocator.queryService.findByPath(CAEXBasicObjectExtensions.caexDocument(this), this.roleReference, true, T.RoleClassType);
    return found instanceof T.RoleFamilyType ? found : null;
  }

  set roleClass(value: RoleFamilyType | null) {
    this.roleReference = value?.getReferencePath(this) ?? null;
  }

  /** The instantiated RoleClass (`IInstance.Class`). */
  get class(): RoleFamilyType | null {
    return this.roleClass;
  }

  set class(value: RoleFamilyType | null) {
    this.roleClass = value;
  }

  /** Gets and sets the RoleClass reference (the RefBaseRoleClassPath). */
  get roleReference(): string | null {
    return this.refBaseRoleClassPath;
  }

  set roleReference(value: string | null) {
    this.refBaseRoleClassPath = value;
  }

  /**
   * Gets copies of the attributes of other supported RoleClasses which are not yet assigned to this
   * RoleRequirement as qualified attributes (CAEX 2.15 only).
   */
  get unAssignedQualifiedRoleClassAttributesOfMultipleRoles(): Iterable<AttributeType> {
    const self = this;
    return {
      *[Symbol.iterator]() {
        if (CAEXBasicObjectExtensions.caexSchema(self) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
          return;
        }
        const list = self.qualifierRoleClasses();
        for (const roleClass of list) {
          for (const inheritedAttributesAndDescendant of ObjectWithBaseClass.getInheritedAttributesAndDescendants(roleClass)) {
            const name = (roleClass.name ?? '') + '.' + (inheritedAttributesAndDescendant.attributePath ?? '');
            if (!(self.attribute.item(name) != null)) {
              const copy = inheritedAttributesAndDescendant.copy(false, false);
              const attributeType = copy instanceof T.AttributeType ? copy : null;
              if (!T.CAEXWrapper.equals(attributeType, null)) {
                attributeType!.name = name;
                yield attributeType!;
              }
            }
          }
        }
      },
    };
  }

  /**
   * Gets copies of the interfaces of other supported RoleClasses which are not yet assigned to this
   * RoleRequirement as qualified interfaces (CAEX 2.15 only).
   */
  get unAssignedQualifiedRoleClassInterfacesOfMultipleRoles(): Iterable<ExternalInterfaceType> {
    const self = this;
    return {
      *[Symbol.iterator]() {
        if (CAEXBasicObjectExtensions.caexSchema(self) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
          return;
        }
        const list = self.qualifierRoleClasses();
        for (const roleClass of list) {
          for (const inheritedInterfacesAndDescendant of ObjectWithBaseClass.getInheritedInterfacesAndDescendants(roleClass)) {
            const name = (roleClass.name ?? '') + '.' + (inheritedInterfacesAndDescendant.name ?? '');
            if (!(self.externalInterface.item(name) != null)) {
              const copy = inheritedInterfacesAndDescendant.copy(false, false);
              const externalInterfaceType = copy instanceof T.ExternalInterfaceType ? copy : null;
              if (!T.CAEXWrapper.equals(externalInterfaceType, null)) {
                externalInterfaceType!.id = ServiceLocator.idService.generateNewID(externalInterfaceType!);
                externalInterfaceType!.name = name;
                yield externalInterfaceType!;
              }
            }
          }
        }
      },
    };
  }

  /** The constructor function for the RoleRequirementsType. */
  static get Constructor(): (n: XElement | null) => RoleRequirementsType {
    return (n) => new RoleRequirementsType(n);
  }

  /**
   * Initializes a new instance.
   * @param roleRequirementsNode A 'RoleRequirements' XML node.
   */
  constructor(roleRequirementsNode: XElement | null) {
    super(roleRequirementsNode);
  }

  /** C# `implicit operator ObjectWithAMLAttributes(RoleRequirementsType)`. */
  static op_Implicit(roleRequirement: RoleRequirementsType | null): ObjectWithAMLAttributes | null {
    if (!T.CAEXWrapper.equals(roleRequirement, null)) {
      return new T.ObjectWithAMLAttributes(roleRequirement!);
    }
    return null;
  }

  /**
   * Assigns an attribute of another supported RoleClass to this RoleRequirement as a qualified
   * attribute (CAEX 2.15 only).
   */
  assignQualifiedRoleClassAttribute(attribute: AttributeType | null): AttributeType | null {
    if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return null;
    }
    for (const item of this.qualifierRoleClasses()) {
      for (const inheritedAttributesAndDescendant of ObjectWithBaseClass.getInheritedAttributesAndDescendants(item)) {
        if (!T.CAEXWrapper.equals(inheritedAttributesAndDescendant, attribute)) {
          continue;
        }
        const name = (item.name ?? '') + '.' + (attribute!.attributePath ?? '');
        if (!(this.attribute.item(name) != null)) {
          const copy = attribute!.copy(false, false);
          const attributeType = copy instanceof T.AttributeType ? copy : null;
          if (!T.CAEXWrapper.equals(attributeType, null)) {
            attributeType!.name = name;
            return this.attribute.insert(attributeType!, false);
          }
        }
      }
    }
    return null;
  }

  /**
   * Assigns an interface of another supported RoleClass to this RoleRequirement as a qualified
   * interface (CAEX 2.15 only).
   */
  assignQualifiedRoleClassInterface(externalInterface: ExternalInterfaceType | null): ExternalInterfaceType | null {
    if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return null;
    }
    for (const item of this.qualifierRoleClasses()) {
      for (const inheritedInterfacesAndDescendant of ObjectWithBaseClass.getInheritedInterfacesAndDescendants(item)) {
        if (!T.CAEXWrapper.equals(inheritedInterfacesAndDescendant, externalInterface)) {
          continue;
        }
        const name = (item.name ?? '') + '.' + (externalInterface!.name ?? '');
        if (!(this.externalInterface.item(name) != null)) {
          const copy = externalInterface!.copy(false, false);
          const externalInterfaceType = copy instanceof T.ExternalInterfaceType ? copy : null;
          if (!T.CAEXWrapper.equals(externalInterfaceType, null)) {
            externalInterfaceType!.id = ServiceLocator.idService.generateNewID(externalInterfaceType!);
            externalInterfaceType!.name = name;
            return this.externalInterface.insert(externalInterfaceType!, false);
          }
        }
      }
    }
    return null;
  }

  /** Gets the CAEXSequence owned by this CAEX object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return caexObject instanceof T.AttributeType
      ? this.attribute
      : !(caexObject instanceof T.ExternalInterfaceType)
        ? super.caexSequence(caexObject)
        : this.externalInterface;
  }

  /**
   * Determines whether this RoleRequirement references the specified RoleClass (instance method),
   * or, with an IObjectWithRoleReference as second argument, whether that role reference does
   * (C# `internal static HasRoleClassReference`, see the static method).
   */
  hasRoleClassReference(roleClass: RoleFamilyType | null, regardInheritance = false): boolean {
    return RoleRequirementsType.hasRoleClassReference(roleClass, this, regardInheritance);
  }

  /**
   * Inserts the specified CAEX object in its associated sequence (`Insert(CAEXWrapper, bool, bool)`)
   * or at the given position (`Insert(int, CAEXWrapper)`).
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(arg0: CAEXWrapper | number | null, arg1?: boolean | CAEXWrapper | null, arg2?: boolean): boolean {
    if (typeof arg0 === 'number') {
      const pos = arg0;
      const caexObject = (arg1 ?? null) as CAEXWrapper | null;
      if (!(caexObject instanceof T.AttributeType)) {
        if (caexObject instanceof T.ExternalInterfaceType) {
          return this.externalInterface.insertAt(pos, caexObject) != null;
        }
        if (
          CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15 ||
          !(caexObject instanceof T.MappingType) ||
          this.mappingObject.exists
        ) {
          return super.insert(pos, caexObject);
        }
        T.InsertCmd.insertElement(this.node!, caexObject.node!);
        return T.CAEXWrapper.equals(this.mappingObject, caexObject);
      }
      return this.attribute.insertAt(pos, caexObject) != null;
    }
    const caexObject = arg0;
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (!(caexObject instanceof T.AttributeType)) {
      if (caexObject instanceof T.ExternalInterfaceType) {
        return this.externalInterface.insert(caexObject, asFirst, asIs) != null;
      }
      if (
        CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15 ||
        !(caexObject instanceof T.MappingType) ||
        this.mappingObject.exists
      ) {
        return super.insert(caexObject, asFirst, asIs);
      }
      T.InsertCmd.insertElement(this.node!, caexObject.node!);
      return this.mappingObject != null;
    }
    return this.attribute.insert(caexObject, asFirst, asIs) != null;
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!(caexObject instanceof T.AttributeType)) {
      if (caexObject instanceof T.ExternalInterfaceType) {
        return this.externalInterface.import(caexObject, name, withSubclasses);
      }
      if (
        CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15 ||
        !(caexObject instanceof T.MappingType) ||
        this.mappingObject.exists
      ) {
        return super.import(caexObject, name, withSubclasses);
      }
      T.InsertCmd.insertElement(this.node!, caexObject.node!);
      return this.mappingObject;
    }
    return this.attribute.import(caexObject, name, withSubclasses);
  }

  /** Determines whether the attribute belongs to another supported RoleClass (CAEX 2.15 only). */
  isAssignableRoleClassAttribute(attribute: AttributeType | null): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return false;
    }
    return from(this.qualifierRoleClasses())
      .selectMany<AttributeType>((roleClass) => ObjectWithBaseClass.getInheritedAttributesAndDescendants(roleClass))
      .any((at) => T.CAEXWrapper.equals(at, attribute));
  }

  /** Determines whether the interface belongs to another supported RoleClass (CAEX 2.15 only). */
  isAssignableRoleClassInterface(externalInterface: ExternalInterfaceType | null): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return false;
    }
    return from(this.qualifierRoleClasses())
      .selectMany<ExternalInterfaceType>((roleClass) => ObjectWithBaseClass.getInheritedInterfacesAndDescendants(roleClass))
      .any((at) => T.CAEXWrapper.equals(at, externalInterface));
  }

  /** Adds a new MappingObject element to this RoleRequirement (CAEX 3.0 and later). */
  new_MappingObject(): MappingType {
    if (!this.exists) {
      throw new ArgumentException('A RoleRequirements object doesn\'t exist!');
    }
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      throw newException('A MappingObject node is node allowed for a RoleRequirement for the currently assigned CAEX schema.');
    }
    const mappingObject = this.mappingObject;
    mappingObject.insertNew();
    return mappingObject;
  }

  /**
   * Updates the RoleRequirement with added attributes and external interfaces of the referenced
   * RoleClass.
   */
  updateInstance(): boolean {
    if (T.CAEXWrapper.equals(this.roleClass, null)) {
      return false;
    }
    InstanceExtensions.updateWithAddedAttributes(this, this.roleClass);
    InstanceExtensions.updateWithAddedExternalInterfaces(this, this.roleClass);
    return true;
  }

  /** Determines whether the role reference references the specified RoleClass (C# internal static). */
  static hasRoleClassReference(roleClass: RoleFamilyType | null, roleReference: IObjectWithRoleReference, regardInheritance = false): boolean {
    if (!T.CAEXWrapper.equals(roleReference.roleClass, null)) {
      if (!regardInheritance) {
        return roleReference.roleClass?.equals(roleClass) ?? false;
      }
      return InheritanceExtensions.classIsDerivedFrom(roleReference.roleClass!, roleClass!) === true;
    }
    throw new ArgumentNullException('roleClass');
  }
}

registerInterfaces(
  RoleRequirementsType,
  'IInstance_1',
  'IInstance',
  'IObjectWithExternalInterface',
  'IObjectWithAttributes',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
  'IObjectWithRoleReference',
);

T.RoleRequirementsType = RoleRequirementsType;
