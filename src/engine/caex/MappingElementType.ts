// Port of Aml.Engine.CAEX.MappingElementType<T> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { from } from '../../system/linq.js';
import { InvalidCastException } from '../../system/exceptions.js';
import type { XElement } from '../../xml/index.js';
import { CAEXBasicObject } from './CAEXBasicObject.js';
import type { CAEXObject } from './CAEXObject.js';
import type { IObjectWithRoleReference } from './IObjectWithRoleReference.js';
import type { InternalElementType } from './InternalElementType.js';
import type { MappingType } from './MappingType.js';
import type { RoleFamilyType } from './RoleFamilyType.js';
import type { RoleRequirementsType } from './RoleRequirementsType.js';
import type { SystemUnitClassType } from './SystemUnitClassType.js';

type Ctor<C = unknown> = abstract new (...args: never[]) => C;

/** C# `(C)x` for a class: null passes, a wrong type throws InvalidCastException. */
function cast<C>(x: unknown, type: Ctor<C>, typeName: string): C {
  if (x !== null && x !== undefined && !(x instanceof type)) {
    throw new InvalidCastException(`Unable to cast object of type '${(x as object).constructor.name}' to type '${typeName}'.`);
  }
  return x as C;
}

/**
 * A mapping candidate: C# tuple `(T CaexObject, string MappingIdentifier)`. The C# default tuple
 * `(null, null)` has both fields null.
 */
export interface MappingElement<TObject> {
  caexObject: TObject | null;
  mappingIdentifier: string | null;
}

/** `tuple.Equals(default((T, string)))`. */
function isDefaultTuple<TObject>(tuple: MappingElement<TObject> | null): boolean {
  return tuple === null || (tuple.caexObject == null && tuple.mappingIdentifier == null);
}

/**
 * Base class of the mapping elements (AttributeNameMapping, InterfaceIDMapping,
 * InterfaceNameMapping) of a MappingObject.
 */
export abstract class MappingElementType<TObject extends CAEXObject> extends CAEXBasicObject {
  /** Gets the MappingObject owning this mapping element. */
  get mappingObject(): MappingType | null {
    const parent = this.caexParent;
    return parent instanceof T.MappingType ? parent : null;
  }

  /** Gets the RoleClass whose elements are mapped. */
  get mappingRoleClass(): RoleFamilyType | null {
    if (T.CAEXWrapper.equals(this.mappingObject, null)) {
      return null;
    }
    const cAEXParent = this.mappingObject!.caexParent;
    if (!(cAEXParent instanceof T.RoleRequirementsType)) {
      if (cAEXParent instanceof T.SupportedRoleClassType) {
        return cAEXParent.roleClass;
      }
      const roleRequirements = cast(this.mappingSystemUnitClass, T.InternalElementType, 'Aml.Engine.CAEX.InternalElementType').roleRequirements;
      if (roleRequirements.count <= 0) {
        return null;
      }
      return roleRequirements.item(0)!.roleClass;
    }
    return cAEXParent.roleClass;
  }

  /** Gets the role reference (RoleRequirement or SupportedRoleClass) this mapping belongs to. */
  get mappingRoleReference(): IObjectWithRoleReference | null {
    if (T.CAEXWrapper.equals(this.mappingObject, null)) {
      return null;
    }
    const cAEXParent = this.mappingObject!.caexParent;
    return cAEXParent instanceof T.RoleRequirementsType
      ? cAEXParent
      : cAEXParent instanceof T.SupportedRoleClassType
        ? cAEXParent
        : !(cAEXParent instanceof T.InternalElementType)
          ? null
          : from<RoleRequirementsType>((cAEXParent as InternalElementType).roleRequirements).firstOrDefault();
  }

  /** Gets the SystemUnitClass (or InternalElement) whose elements are mapped. */
  get mappingSystemUnitClass(): SystemUnitClassType | null {
    if (T.CAEXWrapper.equals(this.mappingObject, null)) {
      return null;
    }
    const cAEXParent = this.mappingObject!.caexParent;
    const typeName = 'Aml.Engine.CAEX.SystemUnitClassType';
    return cAEXParent instanceof T.RoleRequirementsType
      ? cast(cAEXParent.caexParent, T.SystemUnitClassType, typeName)
      : !(cAEXParent instanceof T.SupportedRoleClassType)
        ? cast(this.mappingObject!.caexParent, T.SystemUnitClassType, typeName)
        : cast(cAEXParent.caexParent, T.SystemUnitClassType, typeName);
  }

  /** Gets and sets the mapped RoleClass element (resolved by the RoleClass element identifier). */
  get roleClassElement(): TObject | null {
    const tuple = from(this.roleClassMappingElements()).firstOrDefault((m) => m.mappingIdentifier === this.roleClassElementIdentifier);
    if (!isDefaultTuple(tuple)) {
      return tuple!.caexObject;
    }
    return null;
  }

  set roleClassElement(value: TObject | null) {
    if (T.CAEXWrapper.equals(value, null)) {
      this.roleClassElementIdentifier = null;
      return;
    }
    const tuple = from(this.roleClassMappingElements(true)).firstOrDefault((m) => T.CAEXWrapper.equals(m.caexObject, value));
    if (!isDefaultTuple(tuple)) {
      this.roleClassElementIdentifier = tuple!.mappingIdentifier;
    }
  }

  /** Gets and sets the identifier of the mapped RoleClass element. */
  abstract get roleClassElementIdentifier(): string | null;

  abstract set roleClassElementIdentifier(value: string | null);

  /** Gets and sets the mapped SystemUnitClass element (resolved by the SystemUnitClass element identifier). */
  get systemUnitClassElement(): TObject | null {
    const tuple = from(this.systemUnitClassMappingElements).firstOrDefault((m) => m.mappingIdentifier === this.systemUnitClassElementIdentifier);
    if (!isDefaultTuple(tuple)) {
      return tuple!.caexObject;
    }
    return null;
  }

  set systemUnitClassElement(value: TObject | null) {
    if (T.CAEXWrapper.equals(value, null)) {
      this.systemUnitClassElementIdentifier = null;
      return;
    }
    const tuple = from(this.systemUnitClassMappingElements).firstOrDefault((m) => T.CAEXWrapper.equals(m.caexObject, value));
    if (!isDefaultTuple(tuple)) {
      this.systemUnitClassElementIdentifier = tuple!.mappingIdentifier;
    }
  }

  /** Gets and sets the identifier of the mapped SystemUnitClass element. */
  abstract get systemUnitClassElementIdentifier(): string | null;

  abstract set systemUnitClassElementIdentifier(value: string | null);

  /** Gets the SystemUnitClass elements which can be mapped, with their mapping identifiers. */
  abstract get systemUnitClassMappingElements(): Iterable<MappingElement<TObject>>;

  /**
   * Initializes a new instance.
   * @param nodeElement A mapping element XML node.
   */
  constructor(nodeElement: XElement | null) {
    super(nodeElement);
  }

  /**
   * Maps the RoleClass element; in CAEX 2.15 an element of another supported role is first
   * assigned to the RoleRequirement as a qualified element.
   */
  addRoleClassElement(element: TObject | null): void {
    this.roleClassElement = element;
    if (T.CAEXWrapper.equals(this.roleClassElement, element)) {
      return;
    }
    const mappingSystemUnitClass = this.mappingSystemUnitClass;
    if (!(mappingSystemUnitClass instanceof T.InternalElementType) || (mappingSystemUnitClass as InternalElementType).roleRequirements.count <= 0) {
      return;
    }
    const internalElementType = mappingSystemUnitClass as InternalElementType;
    if (!(element instanceof T.AttributeType)) {
      if (element instanceof T.ExternalInterfaceType) {
        internalElementType.roleRequirements.item(0)!.assignQualifiedRoleClassInterface(element);
      }
    } else {
      internalElementType.roleRequirements.item(0)!.assignQualifiedRoleClassAttribute(element);
    }
    this.roleClassElement = element;
  }

  /** Gets the RoleClass elements which can be mapped, with their mapping identifiers. */
  abstract roleClassMappingElements(includeDuplicates?: boolean): Iterable<MappingElement<TObject>>;
}

registerInterfaces(MappingElementType, 'IMappingElementType', 'IMapping', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.MappingElementType = MappingElementType;
