// Port of Aml.Engine.CAEX.InterfaceIDMappingType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { from, type Enumerable } from '../../system/linq.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import { MappingElementType, type MappingElement } from './MappingElementType.js';
import { ObjectWithBaseClass } from './extensions/ObjectWithBaseClass.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';
import type { RoleRequirementsType } from './RoleRequirementsType.js';
import type { SystemUnitFamilyType } from './SystemUnitFamilyType.js';

type Element = MappingElement<ExternalInterfaceType>;

/** Wrapper for the CAEX element 'InterfaceIDMapping'. */
export class InterfaceIDMappingType extends MappingElementType<ExternalInterfaceType> {
  /** The RoleInterfaceID. */
  override get roleClassElementIdentifier(): string | null {
    return this.roleInterfaceID;
  }

  override set roleClassElementIdentifier(value: string | null) {
    this.roleInterfaceID = value;
  }

  /** Gets and sets the mapped RoleClass interface. */
  get roleInterface(): ExternalInterfaceType | null {
    return this.roleClassElement;
  }

  set roleInterface(value: ExternalInterfaceType | null) {
    this.roleClassElement = value;
  }

  /** Gets and sets the RoleInterfaceID attribute. */
  get roleInterfaceID(): string | null {
    return this.getXAttributeValue('RoleInterfaceID');
  }

  set roleInterfaceID(value: string | null) {
    if (!(this.roleInterfaceID === value)) {
      this.setXAttributeValue('RoleInterfaceID', value);
      this.raisePropertyChanged('RoleInterfaceID');
    }
  }

  /** The SystemUnitInterfaceID. */
  override get systemUnitClassElementIdentifier(): string | null {
    return this.systemUnitInterfaceID;
  }

  override set systemUnitClassElementIdentifier(value: string | null) {
    this.systemUnitInterfaceID = value;
  }

  /**
   * The interfaces of the SystemUnitClass (with inherited ones for a class), identified by ID.
   * Interfaces without ID get a new ID when enumerated.
   */
  override get systemUnitClassMappingElements(): Iterable<Element> {
    if (!T.CAEXWrapper.equals(this.mappingSystemUnitClass, null)) {
      const msu = this.mappingSystemUnitClass;
      if (!(msu instanceof T.SystemUnitFamilyType)) {
        return from<ExternalInterfaceType>(this.mappingSystemUnitClass!.externalInterfaceAndDescendants).select<Element>((a) => ({
          caexObject: a,
          mappingIdentifier: InterfaceIDMappingType.id(a),
        }));
      }
      return from<ExternalInterfaceType>(ObjectWithBaseClass.getInheritedInterfacesAndDescendants(msu as SystemUnitFamilyType)).select<Element>((a) => ({
        caexObject: a,
        mappingIdentifier: InterfaceIDMappingType.id(a),
      }));
    }
    return [];
  }

  /** Gets and sets the mapped SystemUnitClass interface. */
  get systemUnitInterface(): ExternalInterfaceType | null {
    return this.systemUnitClassElement;
  }

  set systemUnitInterface(value: ExternalInterfaceType | null) {
    this.systemUnitClassElement = value;
  }

  /** Gets and sets the SystemUnitInterfaceID attribute. */
  get systemUnitInterfaceID(): string | null {
    return this.getXAttributeValue('SystemUnitInterfaceID');
  }

  set systemUnitInterfaceID(value: string | null) {
    if (!(this.systemUnitInterfaceID === value)) {
      this.setXAttributeValue('SystemUnitInterfaceID', value);
      this.raisePropertyChanged('SystemUnitInterfaceID');
    }
  }

  /** The constructor function for the InterfaceIDMappingType. */
  static get Constructor(): (n: XElement | null) => InterfaceIDMappingType {
    return (n) => new InterfaceIDMappingType(n);
  }

  /**
   * Initializes a new instance.
   * @param nodeElement An 'InterfaceIDMapping' XML node.
   */
  constructor(nodeElement: XElement | null) {
    super(nodeElement);
  }

  /** The interfaces of the RoleClass and of the RoleRequirement which can be mapped, identified by ID. */
  override roleClassMappingElements(includeDuplicates = false): Iterable<Element> {
    void includeDuplicates;
    let enumerable: Enumerable<Element> = from<Element>([]);
    if (T.CAEXWrapper.equals(this.mappingRoleClass, null) && this.mappingRoleReference == null) {
      return enumerable;
    }
    if (!T.CAEXWrapper.equals(this.mappingRoleClass, null)) {
      enumerable = enumerable.concat(
        from<ExternalInterfaceType>(ObjectWithBaseClass.getInheritedInterfacesAndDescendants(this.mappingRoleClass!)).select<Element>((a) => ({
          caexObject: a,
          mappingIdentifier: InterfaceIDMappingType.id(a),
        })),
      );
    }
    const roleReference = this.mappingRoleReference;
    if (roleReference instanceof T.RoleRequirementsType) {
      enumerable = enumerable.concat(
        from<ExternalInterfaceType>((roleReference as RoleRequirementsType).externalInterfaceAndDescendants).select<Element>((a) => ({
          caexObject: a,
          mappingIdentifier: InterfaceIDMappingType.id(a),
        })),
      );
    }
    return enumerable;
  }

  /** The ID of the interface; an interface without ID gets a new one. */
  private static id(externalInterface: ExternalInterfaceType): string | null {
    if (isNullOrEmpty(externalInterface.id)) {
      externalInterface.id = ServiceLocator.idService.generateNewID(externalInterface);
    }
    return externalInterface.id;
  }
}

registerInterfaces(InterfaceIDMappingType, 'IInterfaceMapping', 'IMapping', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.InterfaceIDMappingType = InterfaceIDMappingType;
