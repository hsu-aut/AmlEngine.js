// Port of Aml.Engine.CAEX.CaexObjectWithReference<T> (Aml.Engine 4.5.2).

import { Fixes } from '../fixes.js';
import { T } from '../registry.js';
import { registerInterfaces, implementsInterface } from '../interfaces.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import { CAEXDocumentExtensions } from './extensions/CAEXDocumentExtensions.js';
import { ObjectWithBaseClass } from './extensions/ObjectWithBaseClass.js';
import { CAEXObject } from './CAEXObject.js';
import { CAEXWrapper, newException } from './CAEXWrapper.js';
import type { IMultipleOccurrences } from './IMultipleOccurrences.js';
import type { IClassWithBaseClassReference, IClassWithBaseClassReference_1 } from './IClassWithBaseClassReference.js';

type Ctor<C> = abstract new (...args: never[]) => C;

/**
 * A CAEX object which references another CAEX object of type `T` by a path attribute (a base
 * class or the class of an instance).
 *
 * The C# type argument `T` is needed at run time (`FindByPath(..., typeof(T))`, `as T`). It is
 * taken from the optional constructor argument `referenceType`; if not given, it is the class in
 * the prototype chain of `this` that directly extends CaexObjectWithReference (in Aml.Engine `T`
 * is always that class: AttributeTypeType, InterfaceClassType, RoleClassType, SystemUnitClassType).
 */
export abstract class CaexObjectWithReference<TRef extends CAEXObject> extends CAEXObject implements IMultipleOccurrences<TRef> {
  private readonly _referenceType: Ctor<TRef> | null;

  /** Gets and sets the referenced CAEX object. */
  get reference(): TRef | null {
    const xAttributeValue = this.getXAttributeValue(this.referenceAttributeName);
    if (!isNullOrEmpty(xAttributeValue)) {
      const type = this.referenceType;
      const found = CAEXDocumentExtensions.findByPath(this.caexDocument!, xAttributeValue, true, type);
      return found instanceof type ? found : null;
    }
    return null;
  }

  set reference(value: TRef | null) {
    if (this.canAddReference(value)) {
      // C# passes the object itself; SetAttributeValue converts it with ToString() (the Name).
      // Fix referenceSetter: the reference path, as AddReference writes it.
      this.setXAttributeValue(
        this.referenceAttributeName,
        value != null && Fixes.enabled('referenceSetter', this) ? (value as unknown as CAEXObject).getReferencePath(this as unknown as CAEXObject) : value,
      );
    }
  }

  /** Gets the name of the attribute which stores the reference. */
  readonly referenceAttributeName: string;

  /**
   * Initializes a new instance.
   * @param xmlNode The XML node.
   * @param refName The name of the reference attribute.
   * @param referenceType The run time type argument `T` (optional, see the class comment).
   */
  protected constructor(xmlNode: XElement | null, refName: string, referenceType: Ctor<TRef> | null = null) {
    super(xmlNode);
    this.referenceAttributeName = refName;
    this._referenceType = referenceType;
  }

  /** The run time type argument `T`. */
  protected get referenceType(): Ctor<TRef> {
    if (this._referenceType !== null) return this._referenceType;
    let proto: object | null = Object.getPrototypeOf(this) as object | null;
    while (proto !== null) {
      const ctor = (proto as { constructor: Function }).constructor;
      if (Object.getPrototypeOf(ctor) === CaexObjectWithReference) {
        return ctor as unknown as Ctor<TRef>;
      }
      proto = Object.getPrototypeOf(proto) as object | null;
    }
    return CAEXObject as unknown as Ctor<TRef>;
  }

  /** Appends a new child with the given name to the sequence of the same kind; returns it as `T` or `null`. */
  addChild(name: string | null): TRef | null {
    const type = this.referenceType;
    const asT = (x: unknown): TRef | null => (x instanceof type ? (x as TRef) : null);
    if (!(this instanceof T.InternalElementType)) {
      if (!(this instanceof T.SystemUnitFamilyType)) {
        if (!(this instanceof T.RoleFamilyType)) {
          if (!(this instanceof T.ExternalInterfaceType)) {
            if (!(this instanceof T.InterfaceFamilyType)) {
              if (!(this instanceof T.AttributeFamilyType)) {
                if (this instanceof T.AttributeTypeType) {
                  return asT(this.attribute.append(name as string));
                }
                return null;
              }
              return asT(this.attribute.append(name as string));
            }
            return asT(this.interfaceClass.append(name as string));
          }
          return asT(this.externalInterface.append(name as string));
        }
        return asT(this.roleClass.append(name as string));
      }
      return asT(this.systemUnitClass.append(name as string));
    }
    return asT(this.internalElement.append(name as string));
  }

  /** Adds a reference to the referenced class; `false` if the reference cannot be added. */
  addReference(referencedClass: CAEXObject | null): boolean {
    if (!this.canAddReference(referencedClass)) {
      return false;
    }
    this.setXAttributeValue(this.referenceAttributeName, referencedClass!.getReferencePath(this));
    return true;
  }

  /** Determines, if a reference to the target can be added (no self reference, no cycle). */
  canAddReference(caexTarget: CAEXObject | null): boolean {
    if (CAEXWrapper.equals(caexTarget, null) || this.equals(caexTarget)) {
      return false;
    }
    const text = this.caexPath();
    let flag =
      !implementsInterface(caexTarget, 'IClassWithBaseClassReference') ||
      (caexTarget as unknown as IClassWithBaseClassReference).refBaseClassPath !== text;
    if (flag) {
      const flag2 =
        caexTarget instanceof T.SystemUnitFamilyType
          ? !isNullOrEmpty(ObjectWithBaseClass.baseClassReference(caexTarget as unknown as IClassWithBaseClassReference_1<CAEXObject>, text))
          : caexTarget instanceof T.InterfaceFamilyType
            ? !isNullOrEmpty(ObjectWithBaseClass.baseClassReference(caexTarget as unknown as IClassWithBaseClassReference_1<CAEXObject>, text))
            : caexTarget instanceof T.RoleFamilyType
              ? !isNullOrEmpty(ObjectWithBaseClass.baseClassReference(caexTarget as unknown as IClassWithBaseClassReference_1<CAEXObject>, text))
              : caexTarget instanceof T.AttributeFamilyType
                ? !isNullOrEmpty(ObjectWithBaseClass.baseClassReference(caexTarget as unknown as IClassWithBaseClassReference_1<CAEXObject>, text))
                : caexTarget instanceof T.InternalElementType
                  ? this instanceof T.SystemUnitFamilyType
                  : caexTarget instanceof T.ExternalInterfaceType
                    ? this instanceof T.InterfaceFamilyType
                    : caexTarget instanceof T.AttributeType && this instanceof T.AttributeFamilyType;
      flag = flag2;
    }
    return flag;
  }

  /** Inserts the provided CAEX object as a new sibling after this CAEX object. */
  insertAfter(caexObject: TRef | null): void {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw newException('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, true);
  }

  /** Inserts the provided CAEX object as a new sibling before this CAEX object. */
  insertBefore(caexObject: TRef | null): void {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw newException('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, false);
  }
}

registerInterfaces(CaexObjectWithReference as unknown as abstract new () => unknown, 'IMultipleOccurrences', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.CaexObjectWithReference = CaexObjectWithReference;
