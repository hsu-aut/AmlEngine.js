// Port of Aml.Engine.CAEX.AttributeNameMappingType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from, type Enumerable } from '../../system/linq.js';
import type { XElement } from '../../xml/index.js';
import { MappingElementType, type MappingElement } from './MappingElementType.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { ObjectWithBaseClass } from './extensions/ObjectWithBaseClass.js';
import type { AttributeType } from './AttributeType.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';
import type { RoleRequirementsType } from './RoleRequirementsType.js';
import type { SystemUnitFamilyType } from './SystemUnitFamilyType.js';

type Element = MappingElement<AttributeType>;

/** C# string concatenation: null is the empty string. */
function s(value: string | null | undefined): string {
  return value ?? '';
}

/** `(a, externalInterface.ID + "/" + a.AttributePath)` for every attribute of the interface. */
function interfaceAttributes(externalInterface: ExternalInterfaceType): Enumerable<Element> {
  return from<AttributeType>(externalInterface.attributeAndDescendants).select<Element>((a) => ({
    caexObject: a,
    mappingIdentifier: s(externalInterface.id) + '/' + s(a.attributePath),
  }));
}

/** Wrapper for the CAEX element 'AttributeNameMapping'. */
export class AttributeNameMappingType extends MappingElementType<AttributeType> {
  /** The constructor function for the AttributeNameMappingType (set by the static constructor). */
  static readonly Constructor: (n: XElement | null) => AttributeNameMappingType;

  /** Gets and sets the mapped RoleClass attribute. */
  get roleAttribute(): AttributeType | null {
    return this.roleClassElement;
  }

  set roleAttribute(value: AttributeType | null) {
    this.roleClassElement = value;
  }

  /** Gets and sets the RoleAttributeName attribute. */
  get roleAttributeName(): string | null {
    return this.getXAttributeValue('RoleAttributeName');
  }

  set roleAttributeName(value: string | null) {
    if (!(this.roleAttributeName === value)) {
      this.setXAttributeValue('RoleAttributeName', value);
      this.raisePropertyChanged('RoleAttributeName');
    }
  }

  /** The RoleAttributeName. */
  override get roleClassElementIdentifier(): string | null {
    return this.roleAttributeName;
  }

  override set roleClassElementIdentifier(value: string | null) {
    this.roleAttributeName = value;
  }

  /** Gets and sets the mapped SystemUnitClass attribute. */
  get systemUnitAttribute(): AttributeType | null {
    return this.systemUnitClassElement;
  }

  set systemUnitAttribute(value: AttributeType | null) {
    this.systemUnitClassElement = value;
  }

  /** Gets and sets the SystemUnitAttributeName attribute. */
  get systemUnitAttributeName(): string | null {
    return this.getXAttributeValue('SystemUnitAttributeName');
  }

  set systemUnitAttributeName(value: string | null) {
    if (!(this.systemUnitAttributeName === value)) {
      this.setXAttributeValue('SystemUnitAttributeName', value);
      this.raisePropertyChanged('SystemUnitAttributeName');
    }
  }

  /** The SystemUnitAttributeName. */
  override get systemUnitClassElementIdentifier(): string | null {
    return this.systemUnitAttributeName;
  }

  override set systemUnitClassElementIdentifier(value: string | null) {
    this.systemUnitAttributeName = value;
  }

  /**
   * The attributes of the SystemUnitClass (with inherited ones for a class) and of its interfaces,
   * identified by attribute path (`interfaceID/attributePath` for interface attributes).
   */
  override get systemUnitClassMappingElements(): Iterable<Element> {
    let enumerable: Enumerable<Element> = from<Element>([]);
    if (T.CAEXWrapper.equals(this.mappingSystemUnitClass, null)) {
      return enumerable;
    }
    const msu = this.mappingSystemUnitClass;
    if (msu instanceof T.SystemUnitFamilyType) {
      const classWithBaseClass = msu as SystemUnitFamilyType;
      enumerable = enumerable.concat(
        from<AttributeType>(ObjectWithBaseClass.getInheritedAttributesAndDescendants(classWithBaseClass)).select<Element>((a) => ({
          caexObject: a,
          mappingIdentifier: a.attributePath,
        })),
      );
      return from<ExternalInterfaceType>(ObjectWithBaseClass.getInheritedInterfacesAndDescendants(classWithBaseClass)).aggregate(enumerable, (current, externalInterface) =>
        current.concat(interfaceAttributes(externalInterface)),
      );
    }
    enumerable = enumerable.concat(
      from<AttributeType>(this.mappingSystemUnitClass!.attributeAndDescendants).select<Element>((a) => ({ caexObject: a, mappingIdentifier: a.attributePath })),
    );
    return from<ExternalInterfaceType>(this.mappingSystemUnitClass!.externalInterfaceAndDescendants).aggregate(enumerable, (current, externalInterface) =>
      current.concat(interfaceAttributes(externalInterface)),
    );
  }

  /**
   * Initializes a new instance.
   * @param attributeNameMappingNode An 'AttributeNameMapping' XML node.
   */
  constructor(attributeNameMappingNode: XElement | null) {
    super(attributeNameMappingNode);
  }

  static {
    (AttributeNameMappingType as { Constructor: (n: XElement | null) => AttributeNameMappingType }).Constructor = (n) => new AttributeNameMappingType(n);
  }

  /**
   * The attributes of the RoleClass and of the RoleRequirement which can be mapped, identified by
   * attribute path (qualified by the RoleClass name for CAEX 2.15 multiple roles).
   */
  override roleClassMappingElements(includeDuplicates = false): Iterable<Element> {
    let mappingElements: Enumerable<Element> = from<Element>([]);
    if (T.CAEXWrapper.equals(this.mappingRoleClass, null) && this.mappingRoleReference == null) {
      return mappingElements;
    }
    if (!T.CAEXWrapper.equals(this.mappingRoleClass, null)) {
      mappingElements = mappingElements.concat(
        from<AttributeType>(ObjectWithBaseClass.getInheritedAttributesAndDescendants(this.mappingRoleClass!)).select<Element>((a) => ({
          caexObject: a,
          mappingIdentifier: a.attributePath,
        })),
      );
      if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
        mappingElements = from<ExternalInterfaceType>(ObjectWithBaseClass.getInheritedInterfacesAndDescendants(this.mappingRoleClass!)).aggregate(
          mappingElements,
          (current, externalInterface) => current.concat(interfaceAttributes(externalInterface)),
        );
      }
    }
    const roleReference = this.mappingRoleReference;
    if (!(roleReference instanceof T.RoleRequirementsType)) {
      return mappingElements;
    }
    const roleRequirementsType = roleReference as RoleRequirementsType;
    let list: Element[] = from<AttributeType>(roleRequirementsType.attributeAndDescendants)
      .select<Element>((a) => ({ caexObject: a, mappingIdentifier: a.attributePath }))
      .toList();
    if (!includeDuplicates) {
      const current = mappingElements;
      list = list.filter((rq) => !current.any((m) => m.mappingIdentifier === rq.mappingIdentifier));
    }
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      const qualifiedAttributes = from(roleRequirementsType.qualifiedAttributes).toList();
      if (qualifiedAttributes.length > 0) {
        const list2 = from(roleRequirementsType.qualifiedRoleClassAttributes).toList();
        if (list2.length !== 0) {
          list = list.filter((rq) => !from(qualifiedAttributes).contains(rq.caexObject!));
          list.push(
            ...list2.map((a) => ({
              caexObject: a.attribute,
              mappingIdentifier: s(a.roleClass.name) + '.' + s(a.attribute!.attributePath),
            })),
          );
        }
      }
    }
    mappingElements = mappingElements.concat(list);
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return mappingElements;
    }
    mappingElements = from<ExternalInterfaceType>(roleRequirementsType.externalInterfaceAndDescendants).aggregate(mappingElements, (current, externalInterface) =>
      current.concat(interfaceAttributes(externalInterface)),
    );
    return mappingElements;
  }
}

T.AttributeNameMappingType = AttributeNameMappingType;
