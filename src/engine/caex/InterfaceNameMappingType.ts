// Port of Aml.Engine.CAEX.InterfaceNameMappingType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { from, type Enumerable } from '../../system/linq.js';
import type { XElement } from '../../xml/index.js';
import { MappingElementType, type MappingElement } from './MappingElementType.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { ObjectWithBaseClass } from './extensions/ObjectWithBaseClass.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';
import type { RoleRequirementsType } from './RoleRequirementsType.js';
import type { SystemUnitFamilyType } from './SystemUnitFamilyType.js';

type Element = MappingElement<ExternalInterfaceType>;

/** C# string concatenation: null is the empty string. */
function s(value: string | null | undefined): string {
  return value ?? '';
}

/** Wrapper for the CAEX element 'InterfaceNameMapping'. */
export class InterfaceNameMappingType extends MappingElementType<ExternalInterfaceType> {
  /** The RoleInterfaceName. */
  override get roleClassElementIdentifier(): string | null {
    return this.roleInterfaceName;
  }

  override set roleClassElementIdentifier(value: string | null) {
    this.roleInterfaceName = value;
  }

  /** Gets and sets the mapped RoleClass interface. */
  get roleInterface(): ExternalInterfaceType | null {
    return this.roleClassElement;
  }

  set roleInterface(value: ExternalInterfaceType | null) {
    this.roleClassElement = value;
  }

  /** Gets and sets the RoleInterfaceName attribute. */
  get roleInterfaceName(): string | null {
    return this.getXAttributeValue('RoleInterfaceName');
  }

  set roleInterfaceName(value: string | null) {
    if (!(this.roleInterfaceName === value)) {
      this.setXAttributeValue('RoleInterfaceName', value);
      this.raisePropertyChanged('RoleInterfaceName');
    }
  }

  /** The SystemUnitInterfaceName. */
  override get systemUnitClassElementIdentifier(): string | null {
    return this.systemUnitInterfaceName;
  }

  override set systemUnitClassElementIdentifier(value: string | null) {
    this.systemUnitInterfaceName = value;
  }

  /** The direct interfaces of the SystemUnitClass (with inherited ones for a class), identified by name. */
  override get systemUnitClassMappingElements(): Iterable<Element> {
    if (!T.CAEXWrapper.equals(this.mappingSystemUnitClass, null)) {
      const msu = this.mappingSystemUnitClass;
      if (!(msu instanceof T.SystemUnitFamilyType)) {
        return from<ExternalInterfaceType>(this.mappingSystemUnitClass!.externalInterface).select<Element>((a) => ({ caexObject: a, mappingIdentifier: a.name }));
      }
      return from<ExternalInterfaceType>(ObjectWithBaseClass.getInheritedInterfaces(msu as SystemUnitFamilyType)).select<Element>((a) => ({ caexObject: a, mappingIdentifier: a.name }));
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

  /** Gets and sets the SystemUnitInterfaceName attribute. */
  get systemUnitInterfaceName(): string | null {
    return this.getXAttributeValue('SystemUnitInterfaceName');
  }

  set systemUnitInterfaceName(value: string | null) {
    if (!(this.systemUnitInterfaceName === value)) {
      this.setXAttributeValue('SystemUnitInterfaceName', value);
      this.raisePropertyChanged('SystemUnitInterfaceName');
    }
  }

  /** The constructor function for the InterfaceNameMappingType. */
  static get Constructor(): (n: XElement | null) => InterfaceNameMappingType {
    return (n) => new InterfaceNameMappingType(n);
  }

  /**
   * Initializes a new instance.
   * @param nodeElement An 'InterfaceNameMapping' XML node.
   */
  constructor(nodeElement: XElement | null) {
    super(nodeElement);
  }

  /**
   * The interfaces of the RoleClass and of the RoleRequirement which can be mapped, identified by
   * name (qualified by the RoleClass name for CAEX 2.15 multiple roles).
   */
  override roleClassMappingElements(includeDuplicates = false): Iterable<Element> {
    let mappingElements: Enumerable<Element> = from<Element>([]);
    if (T.CAEXWrapper.equals(this.mappingRoleClass, null) && this.mappingRoleReference == null) {
      return mappingElements;
    }
    if (!T.CAEXWrapper.equals(this.mappingRoleClass, null)) {
      mappingElements = mappingElements.concat(
        from<ExternalInterfaceType>(ObjectWithBaseClass.getInheritedInterfaces(this.mappingRoleClass!)).select<Element>((a) => ({ caexObject: a, mappingIdentifier: a.name })),
      );
    }
    const roleReference = this.mappingRoleReference;
    if (!(roleReference instanceof T.RoleRequirementsType)) {
      return mappingElements;
    }
    const roleRequirementsType = roleReference as RoleRequirementsType;
    let list: Element[] = from<ExternalInterfaceType>(roleRequirementsType.externalInterface)
      .select<Element>((a) => ({ caexObject: a, mappingIdentifier: a.name }))
      .toList();
    if (!includeDuplicates) {
      const current = mappingElements;
      list = list.filter((rq) => !current.any((m) => m.mappingIdentifier === rq.mappingIdentifier));
    }
    if (CAEXBasicObjectExtensions.caexSchema(this) === T.CAEXDocument.CAEXSchema.CAEX2_15 || this.caexDocument!.isTransformationActive) {
      const qualifiedInterfaces = from(roleRequirementsType.qualifiedExternalInterfaces).toList();
      if (qualifiedInterfaces.length > 0) {
        const list2 = from(roleRequirementsType.qualifiedRoleClassInterfaces).toList();
        if (list2.length > 0) {
          list = list.filter((rq) => !from(qualifiedInterfaces).contains(rq.caexObject!));
          list.push(
            ...list2.map((a) => ({
              caexObject: a.externalInterface,
              mappingIdentifier: s(a.roleClass.name) + '.' + s(a.externalInterface!.name),
            })),
          );
        }
      }
    }
    mappingElements = mappingElements.concat(list);
    return mappingElements;
  }
}

registerInterfaces(InterfaceNameMappingType, 'IInterfaceMapping', 'IMapping', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.InterfaceNameMappingType = InterfaceNameMappingType;
