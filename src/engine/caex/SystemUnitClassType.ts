// Port of Aml.Engine.CAEX.SystemUnitClassType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { newException } from './CAEXWrapper.js';
import { from, type Enumerable } from '../../system/linq.js';
import { ArgumentNullException, InvalidCastException } from '../../system/exceptions.js';
import type { XElement } from '../../xml/index.js';
import { CaexObjectWithReference } from './CaexObjectWithReference.js';
import { ObjectWithExternalInterface } from './extensions/ObjectWithExternalInterface.js';
import { InheritanceExtensions } from './extensions/InheritanceExtensions.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import type { AttributeSequence } from './AttributeSequence.js';
import type { AttributeType } from './AttributeType.js';
import type { ExternalInterfaceSequence } from './ExternalInterfaceSequence.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';
import type { InternalElementSequence } from './InternalElementSequence.js';
import type { InternalElementType } from './InternalElementType.js';
import type { CAEXSequenceOfCAEXObjects } from './CAEXSequenceOfCAEXObjects.js';
import type { InternalLinkType } from './InternalLinkType.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { SupportedRoleClassType } from './SupportedRoleClassType.js';
import type { IObjectWithRoleReference } from './IObjectWithRoleReference.js';
import type { RoleFamilyType } from './RoleFamilyType.js';
import type { ObjectWithAMLAttributes } from '../amlobjects/ObjectWithAMLAttributes.js';
import type { InterfaceFamilyType } from './InterfaceFamilyType.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { CAEXWrapper } from './CAEXWrapper.js';

type Ctor<C = unknown> = abstract new (...args: never[]) => C;

/** `typeof(type).IsAssignableFrom(typeof(c))` for classes. */
function isAssignableFrom(type: Ctor, c: Ctor): boolean {
  return type === c || c.prototype instanceof type;
}

/** C# `(C)x` for a class: null passes, a wrong type throws InvalidCastException. */
function cast<C>(x: unknown, type: Ctor<C>, typeName: string): C {
  if (x !== null && x !== undefined && !(x instanceof type)) {
    throw new InvalidCastException(`Unable to cast object of type '${(x as object).constructor.name}' to type '${typeName}'.`);
  }
  return x as C;
}

/**
 * Wrapper for the CAEX element 'SystemUnitClass' (and base of 'InternalElement'). The parent child
 * relation between two SystemUnitClasses has no semantic.
 */
export abstract class SystemUnitClassType extends CaexObjectWithReference<SystemUnitClassType> implements Iterable<InternalElementType> {
  private _attribute: AttributeSequence | null = null;

  private _externalInterface: ExternalInterfaceSequence | null = null;

  private _internalElement: InternalElementSequence | null = null;

  private _internalLink: CAEXSequenceOfCAEXObjects<InternalLinkType> | null = null;

  private _supportedRoleClass: CAEXSequence<SupportedRoleClassType> | null = null;

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

  /** Gets the collection of InternalElement objects for this instance. */
  get internalElement(): InternalElementSequence {
    return this._internalElement ?? (this._internalElement = new T.InternalElementSequence(this.node, T.InternalElementType.Constructor, () => this));
  }

  /** Gets the collection of InternalLink objects contained in this instance. */
  get internalLink(): CAEXSequenceOfCAEXObjects<InternalLinkType> {
    return (
      this._internalLink ??
      (this._internalLink = new T.CAEXSequenceOfCAEXObjects<InternalLinkType>(this.node, 'InternalLink', T.InternalLinkType.Constructor, () => this))
    );
  }

  /**
   * Gets all role references for the SystemUnitClass. The collection includes all RoleRequirement
   * objects and SupportedRoleClass objects.
   */
  get roleReferences(): Iterable<IObjectWithRoleReference> {
    if (!(this instanceof T.InternalElementType)) {
      if (this.supportedRoleClass.count <= 0) {
        return [];
      }
      return this.supportedRoleClass;
    }
    return (this as unknown as InternalElementType).roleReferences;
  }

  /** Gets all role classes referenced by RoleRequirement and SupportedRoleClass objects. */
  get roles(): Iterable<RoleFamilyType | null> {
    return from(this.roleReferences).select((r) => r.roleClass);
  }

  /** Gets the collection of SupportedRoleClass objects contained in this instance. */
  get supportedRoleClass(): CAEXSequence<SupportedRoleClassType> {
    return (
      this._supportedRoleClass ??
      (this._supportedRoleClass = new T.CAEXSequence<SupportedRoleClassType>(this.node, 'SupportedRoleClass', T.SupportedRoleClassType.Constructor, () => this))
    );
  }

  /**
   * Initializes a new instance.
   * @param systemUnitClassNode A 'SystemUnitClass' or 'InternalElement' XML node.
   * @param refName Name of the attribute, where the class reference is stored.
   */
  constructor(systemUnitClassNode: XElement | null, refName: string) {
    super(systemUnitClassNode, refName);
  }

  /** C# `implicit operator ObjectWithAMLAttributes(SystemUnitClassType)`. */
  static op_Implicit(caexObject: SystemUnitClassType | null): ObjectWithAMLAttributes | null {
    if (!T.CAEXWrapper.equals(caexObject, null)) {
      return new T.ObjectWithAMLAttributes(caexObject!);
    }
    return null;
  }

  /**
   * Adds an InterfaceClass reference (as an ExternalInterface) using the provided InterfaceClass
   * object or CAEX path.
   */
  addInterfaceClassReference(
    interfaceClass: InterfaceFamilyType | string | null,
    addUnique = true,
    addInstance = false,
    name = '',
  ): ExternalInterfaceType | null {
    return ObjectWithExternalInterface.addInterfaceClassReference(this, interfaceClass, addUnique, addInstance, name);
  }

  /** Gets the CAEXSequence owned by this CAEX object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return caexObject instanceof T.AttributeType
      ? this.attribute
      : caexObject instanceof T.ExternalInterfaceType
        ? this.externalInterface
        : caexObject instanceof T.InternalElementType
          ? this.internalElement
          : caexObject instanceof T.InternalLinkType
            ? this.internalLink
            : !(caexObject instanceof T.SupportedRoleClassType)
              ? super.caexSequence(caexObject)
              : this.supportedRoleClass;
  }

  /** C# `Container<T>()`: the sequence for elements of the given type. */
  override container<TW extends CAEXWrapper>(type: Ctor<TW>): CAEXSequence<TW> | null {
    if (!isAssignableFrom(type, T.AttributeType)) {
      if (!isAssignableFrom(type, T.ExternalInterfaceType)) {
        return super.container(type);
      }
      // `ExternalInterface as CAEXSequence<T>`: generic classes are invariant in C#.
      return (type as Ctor) === T.ExternalInterfaceType ? (this.externalInterface as unknown as CAEXSequence<TW>) : null;
    }
    return (type as Ctor) === T.AttributeType ? (this.attribute as unknown as CAEXSequence<TW>) : null;
  }

  /** Enumeration of contained InternalElement objects. */
  [Symbol.iterator](): Iterator<InternalElementType> {
    return this.internalElement[Symbol.iterator]();
  }

  /**
   * Determines whether this element references the specified InterfaceClass (optionally
   * regarding inheritance).
   */
  hasInterfaceClassReference(interfaceClass: InterfaceFamilyType | null, regardInheritance = false): boolean {
    if (!T.CAEXWrapper.equals(interfaceClass, null)) {
      if (!regardInheritance) {
        return from<ExternalInterfaceType>(this.externalInterface).any((r) => T.CAEXWrapper.equals(r.interfaceClass, interfaceClass));
      }
      return from<ExternalInterfaceType>(this.externalInterface).any(
        (r) =>
          T.CAEXWrapper.equals(r.interfaceClass, interfaceClass) ||
          (!T.CAEXWrapper.equals(r.interfaceClass, null) && InheritanceExtensions.classIsDerivedFrom(r.interfaceClass!, interfaceClass!) === true),
      );
    }
    throw new ArgumentNullException('interfaceClass');
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
        if (!(caexObject instanceof T.ExternalInterfaceType)) {
          if (!(caexObject instanceof T.InternalElementType)) {
            if (!(caexObject instanceof T.InternalLinkType)) {
              if (caexObject instanceof T.SupportedRoleClassType) {
                return this.supportedRoleClass.insertAt(pos, caexObject) != null;
              }
              return super.insert(pos, caexObject);
            }
            return this.internalLink.insertAt(pos, caexObject) != null;
          }
          return this.internalElement.insertAt(pos, caexObject) != null;
        }
        return this.externalInterface.insertAt(pos, caexObject) != null;
      }
      return this.attribute.insertAt(pos, caexObject) != null;
    }
    const caexObject = arg0;
    const asFirst = (arg1 ?? true) as boolean;
    const asIs = arg2 ?? false;
    if (!(caexObject instanceof T.AttributeType)) {
      if (!(caexObject instanceof T.ExternalInterfaceType)) {
        if (!(caexObject instanceof T.InternalElementType)) {
          if (!(caexObject instanceof T.InternalLinkType)) {
            if (caexObject instanceof T.SupportedRoleClassType) {
              return this.supportedRoleClass.insert(caexObject, asFirst, asIs) != null;
            }
            return super.insert(caexObject, asFirst, asIs);
          }
          return this.internalLink.insert(caexObject, asFirst, asIs) != null;
        }
        return this.internalElement.insert(caexObject, asFirst, asIs) != null;
      }
      return this.externalInterface.insert(caexObject, asFirst, asIs) != null;
    }
    return this.attribute.insert(caexObject, asFirst, asIs) != null;
  }

  /** Imports the CAEX object into its associated sequence. */
  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!(caexObject instanceof T.AttributeType)) {
      if (!(caexObject instanceof T.ExternalInterfaceType)) {
        if (!(caexObject instanceof T.InternalElementType)) {
          if (!(caexObject instanceof T.InternalLinkType)) {
            if (caexObject instanceof T.SupportedRoleClassType) {
              return this.supportedRoleClass.import(caexObject, name, withSubclasses);
            }
            return super.import(caexObject, name, withSubclasses);
          }
          return this.internalLink.import(caexObject, name, withSubclasses);
        }
        return this.internalElement.import(caexObject, name, withSubclasses);
      }
      return this.externalInterface.import(caexObject, name, withSubclasses);
    }
    return this.attribute.import(caexObject, name, withSubclasses);
  }

  /**
   * Inserts the provided CAEX object as a new sibling after this CAEX object
   * (C# `InsertAfter(InternalElementType)`, same body as the inherited overload).
   */
  override insertAfter(caexObject: SystemUnitClassType | null): void {
    if (T.CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw newException('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, true);
  }

  /**
   * Inserts the provided CAEX object as a new sibling before this CAEX object
   * (C# `InsertBefore(InternalElementType)`, same body as the inherited overload).
   */
  override insertBefore(caexObject: SystemUnitClassType | null): void {
    if (T.CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw newException('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, false);
  }

  /**
   * Gets the lowest common parent of this and the provided SystemUnitClass, used to store an
   * InternalLink relating them.
   */
  lowestCommonParent(systemUnitClass: SystemUnitClassType | null): SystemUnitClassType | null {
    if (T.CAEXWrapper.equals(systemUnitClass, null)) {
      throw new ArgumentNullException('systemUnitClass');
    }
    const other = systemUnitClass!;
    if (this.equals(other)) {
      return this;
    }
    if (XmlCAEXSchema.isSystemUnitClass(this.node!)) {
      if (
        XmlCAEXSchema.isSystemUnitClass(other.node!) ||
        !from<InternalElementType>(this.internalElement.internalElementDescendantsAndSelf()).contains(
          cast(other, T.InternalElementType, 'Aml.Engine.CAEX.InternalElementType'),
        )
      ) {
        return null;
      }
    } else if (
      XmlCAEXSchema.isSystemUnitClass(other.node!) &&
      !from<InternalElementType>(other.internalElement.internalElementDescendantsAndSelf()).contains(
        cast(this, T.InternalElementType, 'Aml.Engine.CAEX.InternalElementType'),
      )
    ) {
      return null;
    }
    const myAncestors = [...this.node!.ancestorsAndSelf()];
    return from(other.node!.ancestorsAndSelf())
      .where((ancestor) => XmlCAEXSchema.isInternalElement(ancestor) || XmlCAEXSchema.isSystemUnitClass(ancestor))
      .where((ancestor) => myAncestors.includes(ancestor))
      .select((ancestor) => {
        const w = XmlOperation.createCAEXWrapper(ancestor);
        return w instanceof T.SystemUnitClassType ? (w as SystemUnitClassType) : null;
      })
      .firstOrDefault();
  }

  /** Gets the RoleClass of the SupportedRoleClass with the provided RoleClass name. */
  supportedRoleClassWithName(roleClassName: string | null): RoleFamilyType | null {
    return (
      from<SupportedRoleClassType>(this.supportedRoleClass).firstOrDefault((s) => (s.roleClass?.name ?? null) === roleClassName)?.roleClass ?? null
    );
  }
}

registerInterfaces(
  SystemUnitClassType,
  'IMultipleOccurrences',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
  'IInternalElementContainer',
  'ICAEXObject',
  'IObjectWithExternalInterface',
  'IObjectWithAttributes',
);

T.SystemUnitClassType = SystemUnitClassType;
