// Port of Aml.Engine.CAEX.Extensions.ObjectWithBaseClass (Aml.Engine 4.5.2).
//
// Inherited elements are computed by XmlOperation.existingElementsFromBaseClassAndSelf with the
// AttributeValueComparer on "Name" (LINQ Except/Concat order of the base classes first).

import { T } from '../../registry.js';
import { implementsInterface } from '../../interfaces.js';
import { ArgumentNullException, InvalidCastException, InvalidOperationException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { from } from '../../../system/linq.js';
import type { XElement } from '../../../xml/index.js';
import { CAEX_CLASSModel_TagNames } from '../CAEX_CLASSModel_TagNames.js';
import { ChangeMode } from '../ChangeMode.js';
import { XmlCAEXSchema } from '../../xmlext/XmlCAEXSchema.js';
import { XmlCAEXAttributes } from '../../xmlext/XmlCAEXAttributes.js';
import { XmlOperation } from '../../xmlext/XmlOperation.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import { RecursionGuard } from '../../cycles.js';
import type { AttributeType } from '../AttributeType.js';
import type { CAEXBasicObject } from '../CAEXBasicObject.js';
import type { CAEXObject } from '../CAEXObject.js';
import type { ExternalInterfaceType } from '../ExternalInterfaceType.js';
import type { IClassWithBaseClassReference, IClassWithBaseClassReference_1 } from '../IClassWithBaseClassReference.js';
import type { IClassWithExternalInterface } from '../IClassWithExternalInterface.js';
import type { InterfaceClassType } from '../InterfaceClassType.js';
import type { InternalElementType } from '../InternalElementType.js';
import type { SystemUnitFamilyType } from '../SystemUnitFamilyType.js';

type Ctor<R = unknown> = abstract new (...args: never[]) => R;
type ClassRef = IClassWithBaseClassReference_1<CAEXObject>;
/** The non-generic GetReferenceHierarchy(bool includeExternals) of the class families. */
type HierarchyOwner = { getReferenceHierarchy(includeExternals: boolean): Iterable<CAEXObject> };

/** Extension methods for classes with a base class reference (inherited attributes, interfaces, elements). */
export class ObjectWithBaseClass {
  private constructor() {}

  /**
   * Appends a new child class with the provided name which references this class as its base
   * class (if the name is not the name of the parent). `isReferenced` tells whether the reference was set.
   */
  static addChildWithReference<R extends CAEXObject>(
    classWithBaseClass: IClassWithBaseClassReference_1<R>,
    name: string | null,
  ): { result: R | null; isReferenced: boolean } {
    const isReferenced = false;
    if (!(classWithBaseClass instanceof T.SystemUnitFamilyType)) {
      if (!(classWithBaseClass instanceof T.RoleFamilyType)) {
        if (!(classWithBaseClass instanceof T.InterfaceFamilyType)) {
          if (classWithBaseClass instanceof T.AttributeFamilyType) {
            const r = classWithBaseClass.attribute.appendWithReference(name, classWithBaseClass);
            return { result: r.result as unknown as R, isReferenced: r.isReferenced };
          }
          return { result: null, isReferenced };
        }
        const r = classWithBaseClass.interfaceClass.appendWithReference(name, classWithBaseClass);
        return { result: r.result as unknown as R, isReferenced: r.isReferenced };
      }
      const r = classWithBaseClass.roleClass.appendWithReference(name, classWithBaseClass);
      return { result: r.result as unknown as R, isReferenced: r.isReferenced };
    }
    const r = classWithBaseClass.systemUnitClass.appendWithReference(name, classWithBaseClass);
    return { result: r.result as unknown as R, isReferenced: r.isReferenced };
  }

  /** Deletes an inherited element in the derived class by an overriding element with ChangeMode Delete. */
  static deleteInheritedElement(classWithBaseClass: IClassWithBaseClassReference, elementName: string | null, elementType: Ctor): boolean {
    const family = familyOf(classWithBaseClass);
    if (family == null) {
      return false;
    }
    return ObjectWithBaseClass.deleteInheritedElementInternal(classWithBaseClass as unknown as ClassRef, elementName, elementType);
  }

  /** Gets the attributes of the class, including the inherited attributes (overridden ones replaced). */
  static getDerivedAttributes(classWithBaseClass: IClassWithBaseClassReference, includeOwn = true): AttributeType[] {
    const family = familyOf(classWithBaseClass);
    if (family == null) {
      return [];
    }
    return ObjectWithBaseClass.getDerivedAttributesInternal(classWithBaseClass as unknown as ClassRef, includeOwn);
  }

  /** Gets the interfaces of the class, including the inherited interfaces. */
  static getDerivedInterfaces(classWithBaseClass: IClassWithExternalInterface, includeOwn = true): ExternalInterfaceType[] {
    if (
      !(classWithBaseClass instanceof T.InterfaceFamilyType) &&
      !(classWithBaseClass instanceof T.SystemUnitFamilyType) &&
      !(classWithBaseClass instanceof T.RoleFamilyType)
    ) {
      return [];
    }
    return ObjectWithBaseClass.getDerivedInterfacesInternal(classWithBaseClass as unknown as ClassRef, includeOwn);
  }

  /** Gets the inherited attributes (with own attributes if includeSelf). */
  static getInheritedAttributes(classWithBaseClass: IClassWithBaseClassReference, includeSelf = true): Iterable<AttributeType> {
    const family = familyOf(classWithBaseClass);
    if (family == null) {
      return [];
    }
    return ObjectWithBaseClass.getInheritedAttributesInternal(classWithBaseClass as unknown as ClassRef, includeSelf);
  }

  /** Gets the derived attributes and all their nested attributes. */
  static getInheritedAttributesAndDescendants(classWithBaseClass: IClassWithBaseClassReference, includeOwn = true): AttributeType[] {
    const family = familyOf(classWithBaseClass);
    const list =
      family == null ? [] : ObjectWithBaseClass.getDerivedAttributesInternal(classWithBaseClass as unknown as ClassRef, includeOwn);
    const list2 = list;
    for (const item of list2.slice()) {
      list2.push(...(CAEXBasicObjectExtensions.descendants(item, T.AttributeType) as Iterable<AttributeType>));
    }
    return list2;
  }

  /** Gets the inherited InternalElements (with own elements if includeSelf). */
  static getInheritedElements(classWithBaseClass: SystemUnitFamilyType | null, includeSelf: boolean): Iterable<InternalElementType> {
    if (classWithBaseClass != null) {
      return ObjectWithBaseClass.getInheritedElementsInternal(classWithBaseClass as unknown as ClassRef, includeSelf);
    }
    return [];
  }

  /** Gets the inherited interfaces (with own interfaces if includeSelf). */
  static getInheritedInterfaces(classWithBaseClass: IClassWithExternalInterface, includeSelf = true): Iterable<ExternalInterfaceType> {
    if (
      !(classWithBaseClass instanceof T.InterfaceFamilyType) &&
      !(classWithBaseClass instanceof T.SystemUnitFamilyType) &&
      !(classWithBaseClass instanceof T.RoleFamilyType)
    ) {
      return [];
    }
    return ObjectWithBaseClass.getInheritedInterfacesInternal(classWithBaseClass as unknown as ClassRef, includeSelf);
  }

  /** Gets the derived interfaces and all their nested interfaces. */
  static getInheritedInterfacesAndDescendants(classWithBaseClass: IClassWithExternalInterface, includeOwn = true): ExternalInterfaceType[] {
    const list =
      classWithBaseClass instanceof T.InterfaceFamilyType ||
      classWithBaseClass instanceof T.SystemUnitFamilyType ||
      classWithBaseClass instanceof T.RoleFamilyType
        ? ObjectWithBaseClass.getDerivedInterfacesInternal(classWithBaseClass as unknown as ClassRef, includeOwn)
        : [];
    const list2 = list;
    for (const item of list2.slice()) {
      list2.push(...(CAEXBasicObjectExtensions.descendants(item, T.ExternalInterfaceType) as Iterable<ExternalInterfaceType>));
    }
    return list2;
  }

  /**
   * Gets the inherited elements of the provided element type (C# InheritedElements&lt;TInheritedElement&gt;,
   * type = TInheritedElement): Attributes, ExternalInterfaces or InternalElements.
   */
  static inheritedElements<R extends CAEXBasicObject>(classWithBaseClass: IClassWithBaseClassReference, includeSelf: boolean, type: Ctor<R>): Iterable<R>;
  static inheritedElements<R extends CAEXBasicObject>(classWithBaseClass: IClassWithBaseClassReference, type: Ctor<R>, includeSelf?: boolean): Iterable<R>;
  static inheritedElements(classWithBaseClass: IClassWithBaseClassReference, ...args: unknown[]): Iterable<unknown> {
    let includeSelf = true;
    let type: Ctor<CAEXBasicObject> | null = null;
    for (const a of args) {
      if (typeof a === 'boolean') includeSelf = a;
      else if (typeof a === 'function') type = a as Ctor<CAEXBasicObject>;
    }
    const family = familyOf(classWithBaseClass);
    if (family == null) {
      return [];
    }
    return ObjectWithBaseClass.inheritedElementsInternal(classWithBaseClass as unknown as ClassRef, includeSelf, type as Ctor<CAEXBasicObject>);
  }

  /** Determines whether the element (ExternalInterface, Attribute, InternalElement) is inherited from a base class. */
  static isInherited(classWithBaseClass: IClassWithBaseClassReference, element: CAEXBasicObject): boolean {
    if (!(element instanceof T.ExternalInterfaceType)) {
      if (!(element instanceof T.AttributeType)) {
        if (element instanceof T.InternalElementType) {
          return isInheritedElement(classWithBaseClass, element, T.InternalElementType);
        }
        return false;
      }
      return isInheritedElement(classWithBaseClass, element, T.AttributeType);
    }
    return isInheritedElement(classWithBaseClass, element, T.ExternalInterfaceType);
  }

  /** Determines whether the element of the class overrides an element with the same name of a base class. */
  static isOverridden(classWithBaseClass: IClassWithBaseClassReference, element: CAEXBasicObject): boolean {
    const node = element.node;
    let flag = from(classWithBaseClass.node!.elements(node!.name)).any((e) => e === node);
    if (flag) {
      const flag2 = familyOf(classWithBaseClass) != null && ObjectWithBaseClass.isOverriddenInternal(classWithBaseClass as unknown as ClassRef, element);
      flag = flag2;
    }
    return flag;
  }

  /** Gets the element of a base class, which is overridden by an element with the provided name and type. */
  static overriddenElement(classWithBaseClass: IClassWithBaseClassReference, elementName: string | null, elementType: Ctor): XElement | null {
    const family = familyOf(classWithBaseClass);
    if (family == null) {
      return null;
    }
    return ObjectWithBaseClass.overriddenElementInternal(classWithBaseClass as unknown as ClassRef, elementName, elementType);
  }

  /** Gets the name of the referenced base class (last part of the reference path). */
  static referencedClassName(objectWithClassReference: IClassWithBaseClassReference | InternalElementType | InterfaceClassType): string {
    const reference =
      objectWithClassReference instanceof T.InternalElementType
        ? objectWithClassReference.refBaseSystemUnitPath
        : (objectWithClassReference as IClassWithBaseClassReference).refBaseClassPath;
    if (isNullOrEmpty(reference)) {
      return '';
    }
    return from(trimEndChars(reference, ['/']).split('/')).last();
  }

  /**
   * The reference path to set as base class reference (null if it would create a cycle).
   * `pathOrBaseClass` is a path or a base class. Internal in C#.
   */
  static baseClassReference(classWithBaseClass: ClassRef, pathOrBaseClass: string | ClassRef | null): string | null {
    if (typeof pathOrBaseClass === 'string') {
      return ObjectWithBaseClass.baseClassReferenceOfPath(classWithBaseClass, pathOrBaseClass);
    }
    return ObjectWithBaseClass.baseClassReferenceOfClass(classWithBaseClass, pathOrBaseClass);
  }

  private static baseClassReferenceOfPath(classWithBaseClass: ClassRef, path: string): string | null {
    if (path === XmlCAEXAttributes.caexPath(classWithBaseClass.node!)) {
      return null;
    }
    const found = CAEXBasicObjectExtensions.findReferencedClass(classWithBaseClass, path, familyOf(classWithBaseClass));
    if (!implementsInterface(found, 'IClassWithBaseClassReference_1')) {
      return path;
    }
    const classWithBaseClassReference = found as unknown as ClassRef;
    if (classWithBaseClassReference === classWithBaseClass) {
      return null;
    }
    if (!from<CAEXObject>((classWithBaseClassReference as unknown as HierarchyOwner).getReferenceHierarchy(false)).contains(classWithBaseClass as unknown as CAEXObject)) {
      return path;
    }
    return null;
  }

  private static baseClassReferenceOfClass(classWithBaseClass: ClassRef, baseClass: ClassRef | null): string | null {
    if (baseClass == null) {
      return null;
    }
    if (baseClass === classWithBaseClass) {
      return null;
    }
    const referencePath = (baseClass as unknown as CAEXObject).getReferencePath(classWithBaseClass as unknown as CAEXBasicObject);
    if (!from<CAEXObject>((baseClass as unknown as HierarchyOwner).getReferenceHierarchy(false)).contains(classWithBaseClass as unknown as CAEXObject)) {
      return referencePath;
    }
    return null;
  }

  /** Internal in C#. */
  static deleteInheritedElementInternal(classWithBaseClass: ClassRef, elementName: string | null, elementType: Ctor): boolean {
    if (ObjectWithBaseClass.overriddenElementInternal(classWithBaseClass, elementName, elementType) == null) {
      return false;
    }
    classWithBaseClass.attribute.append(elementName as string).changeMode = ChangeMode.Delete;
    return true;
  }

  /** Gets the absolute XPath of the element (/Name[position]/...). Internal in C#. */
  static getAbsoluteXPath(element: XElement): string {
    if (element == null) {
      throw new ArgumentNullException('element');
    }
    const relativeXPath = (e: XElement): string => {
      const num = ObjectWithBaseClass.indexPosition(e);
      const localName = e.name.localName;
      if (num !== -1) {
        return `/${localName}[${num}]`;
      }
      return '/' + localName;
    };
    return (
      from(element.ancestors())
        .select((e) => relativeXPath(e))
        .reverse()
        .toArray()
        .join('') + relativeXPath(element)
    );
  }

  /** Internal in C#. */
  static getDerivedAttributesInternal(classWithBaseClass: ClassRef, includeOwn: boolean): AttributeType[] {
    return [...ObjectWithBaseClass.getInheritedAttributesInternal(classWithBaseClass, includeOwn)];
  }

  /** Internal in C#. */
  static getDerivedInterfacesInternal(classWithBaseClass: ClassRef, includeOwn = true): ExternalInterfaceType[] {
    return [...ObjectWithBaseClass.getInheritedInterfacesInternal(classWithBaseClass, includeOwn)];
  }

  /** Internal in C#. */
  static getInheritedAttributesInternal(classWithBaseClass: ClassRef, includeOwn: boolean): Iterable<AttributeType> {
    while (true) {
      if (includeOwn) {
        return new T.CAEXEnumerable<AttributeType>(
          XmlOperation.existingElementsFromBaseClassAndSelf(classWithBaseClass, 'Attribute', new T.AttributeValueComparer('Name')),
          T.AttributeType,
        );
      }
      const baseClass = classWithBaseClass.baseClass;
      if (!isClassRef(baseClass)) {
        break;
      }
      classWithBaseClass = baseClass as unknown as ClassRef;
      includeOwn = true;
    }
    return [];
  }

  /** Internal in C#. */
  static getInheritedElementsInternal(classWithBaseClass: ClassRef, includeOwn: boolean): Iterable<InternalElementType> {
    while (true) {
      if (includeOwn) {
        return new T.CAEXEnumerable<InternalElementType>(
          XmlOperation.existingElementsFromBaseClassAndSelf(classWithBaseClass, 'InternalElement', new T.AttributeValueComparer('Name')),
          T.InternalElementType,
        );
      }
      const baseClass = classWithBaseClass.baseClass;
      if (!isClassRef(baseClass)) {
        break;
      }
      classWithBaseClass = baseClass as unknown as ClassRef;
      includeOwn = true;
    }
    return [];
  }

  /** Internal in C#. */
  static getInheritedInterfacesInternal(classWithBaseClass: ClassRef, includeSelf: boolean): Iterable<ExternalInterfaceType> {
    while (true) {
      if (includeSelf) {
        return new T.CAEXEnumerable<ExternalInterfaceType>(
          XmlOperation.existingElementsFromBaseClassAndSelf(classWithBaseClass, 'ExternalInterface', new T.AttributeValueComparer('Name')),
          T.ExternalInterfaceType,
        );
      }
      const baseClass = classWithBaseClass.baseClass;
      if (!isClassRef(baseClass)) {
        break;
      }
      classWithBaseClass = baseClass as unknown as ClassRef;
      includeSelf = true;
    }
    return [];
  }

  /** Position (1 based) among the siblings with the same name; -1 without parent. Internal in C#. */
  static indexPosition(element: XElement): number {
    if (element == null) {
      throw new ArgumentNullException('element');
    }
    if (element.parent == null) {
      return -1;
    }
    let num = 1;
    for (const item of element.parent.elements(element.name)) {
      if (item === element) {
        return num;
      }
      num++;
    }
    throw new InvalidOperationException('element has been removed from its parent.');
  }

  /** C# InheritedElementsInternal&lt;TInheritedElement, TClass&gt; (inheritedType = TInheritedElement). Internal in C#. */
  static inheritedElementsInternal<R extends CAEXBasicObject>(classWithBaseClass: ClassRef, includeSelf: boolean, inheritedType: Ctor<R>): Iterable<R> {
    const text = CAEX_CLASSModel_TagNames.tagName(inheritedType);
    const baseClass = classWithBaseClass.baseClass;
    if (isClassRef(baseClass)) {
      const caexClass = baseClass as unknown as ClassRef;
      switch (text) {
        case 'ExternalInterface':
        case 'Attribute':
        case 'InternalElement':
          if (includeSelf) {
            return new T.CAEXEnumerable<R>(
              XmlOperation.existingElementsFromBaseClassAndSelf(classWithBaseClass, text, new T.AttributeValueComparer('Name')),
              inheritedType,
            );
          }
          return new T.CAEXEnumerable<R>(
            XmlOperation.existingElementsFromBaseClassAndSelf(caexClass, text, new T.AttributeValueComparer('Name')),
            inheritedType,
          );
        default:
          return [];
      }
    }
    if (!includeSelf) {
      return [];
    }
    // Cast<TInheritedElement>(): InvalidCastException for items of another type.
    return from(classWithBaseClass.caexChildren(text) as Iterable<unknown>).select((item) => {
      if (item != null && !(item instanceof inheritedType)) {
        throw new InvalidCastException();
      }
      return item as R;
    });
  }

  /** Internal in C#. */
  static isOverriddenInternal(classWithBaseClass: ClassRef, element: CAEXBasicObject): boolean {
    // the key must not dereference anything the original does not (null arguments fail as in C#)
    return isOverriddenGuard.run([classWithBaseClass?.node, element?.node], classWithBaseClass?.node ?? null, () => isOverriddenStep(classWithBaseClass, element));
  }

  /** Internal in C#. */
  static overriddenElementInternal(classWithBaseClass: ClassRef, elementName: string | null, elementType: Ctor): XElement | null {
    return overriddenElementGuard.run([classWithBaseClass?.node, elementName, elementType], classWithBaseClass?.node ?? null, () =>
      overriddenElementStep(classWithBaseClass, elementName, elementType),
    );
  }
}

// ---- recursion steps (guarded above) ---------------------------------------------------------

/** Aml.Engine recurses along the base class references without end on cyclic inheritance (src/engine/cycles.ts). */
const isOverriddenGuard = new RecursionGuard('The base class references');
const overriddenElementGuard = new RecursionGuard('The base class references');

/** IsOverriddenInternal. */
function isOverriddenStep(classWithBaseClass: ClassRef, element: CAEXBasicObject): boolean {
  const baseClass = classWithBaseClass.baseClass;
  if (!isClassRef(baseClass)) {
    return false;
  }
  const classWithBaseClassReference = baseClass as unknown as ClassRef;
  switch (element.node?.name.localName) {
    case 'ExternalInterface':
    case 'Attribute':
    case 'InternalElement': {
      const attsEqual = new T.AttributeValueComparer('Name');
      if (!from(classWithBaseClassReference.node!.elements(element.node!.name)).any((e) => attsEqual.equals(element.node, e))) {
        return ObjectWithBaseClass.isOverriddenInternal(classWithBaseClassReference, element);
      }
      return true;
    }
    default:
      return ObjectWithBaseClass.isOverriddenInternal(classWithBaseClassReference, element);
  }
}

/** OverriddenElementInternal. */
function overriddenElementStep(classWithBaseClass: ClassRef, elementName: string | null, elementType: Ctor): XElement | null {
  const baseClass = classWithBaseClass.baseClass;
  if (!isClassRef(baseClass)) {
    return null;
  }
  const classWithBaseClassReference = baseClass as unknown as ClassRef;
  if (elementType !== T.AttributeType && elementType !== T.ExternalInterfaceType) {
    return ObjectWithBaseClass.overriddenElementInternal(classWithBaseClassReference, elementName, elementType);
  }
  return (
    from(
      classWithBaseClassReference.node!.elements(XmlCAEXSchema.xName(classWithBaseClass.node!, CAEX_CLASSModel_TagNames.tagName(elementType))),
    ).firstOrDefault((n: XElement) => XmlCAEXAttributes.caexNameOfElement(n) === elementName) ??
    ObjectWithBaseClass.overriddenElementInternal(classWithBaseClassReference, elementName, elementType)
  );
}

// ---- private helpers ------------------------------------------------------------------------

/** IsInheritedElement&lt;T&gt;. */
function isInheritedElement<R extends CAEXBasicObject>(classWithBaseClass: IClassWithBaseClassReference, element: R, type: Ctor<R>): boolean {
  return from<R>(ObjectWithBaseClass.inheritedElements(classWithBaseClass, false, type)).contains(element);
}

/** The family type (T of IClassWithBaseClassReference&lt;T&gt;) in the order of the C# type switches. */
function familyOf(x: unknown): Ctor<CAEXObject> | null {
  if (x instanceof T.AttributeFamilyType) return T.AttributeFamilyType;
  if (x instanceof T.InterfaceFamilyType) return T.InterfaceFamilyType;
  if (x instanceof T.SystemUnitFamilyType) return T.SystemUnitFamilyType;
  if (x instanceof T.RoleFamilyType) return T.RoleFamilyType;
  return null;
}

/** `x is IClassWithBaseClassReference<T>` for the BaseClass (statically T) of a family class. */
function isClassRef(x: unknown): boolean {
  return x != null && implementsInterface(x, 'IClassWithBaseClassReference_1');
}

/** string.TrimEnd(params char[]). */
function trimEndChars(s: string, chars: string[]): string {
  let end = s.length;
  while (end > 0 && chars.includes(s[end - 1])) end--;
  return s.substring(0, end);
}
