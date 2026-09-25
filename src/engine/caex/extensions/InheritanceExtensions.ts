// Port of Aml.Engine.CAEX.Extensions.InheritanceExtensions (Aml.Engine 4.5.2).
//
// C# generic parameters T of IClassWithBaseClassReference<T> are always the class family type
// (AttributeFamilyType, InterfaceFamilyType, RoleFamilyType, SystemUnitFamilyType). Where T
// matters at run time it is derived from the object (familyOf).

import { T } from '../../registry.js';
import { implementsInterface } from '../../interfaces.js';
import { ArgumentNullException, InvalidOperationException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { cultureStartsWith } from '../../../system/CompareInfo.js';
import { HashSet, from } from '../../../system/linq.js';
import type { XElement } from '../../../xml/index.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { QueryResult } from '../../services/QueryResult.js';
import { XmlCAEXAttributes } from '../../xmlext/XmlCAEXAttributes.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './CAEXDocumentExtensions.js';
import type { AttributeTypeType } from '../AttributeTypeType.js';
import type { CAEXBasicObject } from '../CAEXBasicObject.js';
import type { CAEXDocument } from '../CAEXDocument.js';
import type { CAEXObject } from '../CAEXObject.js';
import type { IClassWithBaseClassReference, IClassWithBaseClassReference_1 } from '../IClassWithBaseClassReference.js';
import type { IInstantiable_1 } from '../IInstantiable.js';
import type { IObjectWithRoleReference } from '../IObjectWithRoleReference.js';
import type { InterfaceClassType } from '../InterfaceClassType.js';
import type { ICAEXReference } from '../../services/interfaces/ICAEXReference.js';

type Ctor<R = unknown> = abstract new (...args: never[]) => R;

/** Dictionary of class paths to the paths of all classes derived from it (including itself). */
export class InheritanceExtensions_DerivedClassDictionary extends Map<string, HashSet<string>> {
  /** Adds the derivations of the class with the provided path and name. */
  addClassDerivations(document: CAEXDocument, classPath: string, className: string | null): void {
    const enumerable = InheritanceExtensions_DerivedClassDictionary.findClassReferences(document, classPath, className);
    const hashSet = new HashSet<string>();
    for (const item of enumerable) {
      hashSet.add(item as string);
    }
    hashSet.add(classPath);
    if (classPath == null) {
      throw new ArgumentNullException('key');
    }
    this.set(classPath, hashSet);
  }

  private static findClassReferences(document: CAEXDocument, classPath: string, className: string | null): Iterable<string | null> {
    return from<CAEXObject>(ServiceLocator.queryService!.allClassReferencesDeep(document, classPath, className)).select((e) => e.caexPath());
  }
}

T.InheritanceExtensions_DerivedClassDictionary = InheritanceExtensions_DerivedClassDictionary;

/** Extension methods for class inheritance. */
export class InheritanceExtensions {
  private constructor() {}

  /** Dictionary of class paths to the paths of all classes derived from it. */
  static readonly DerivedClassDictionary = InheritanceExtensions_DerivedClassDictionary;

  private static _derivedClasses: InheritanceExtensions_DerivedClassDictionary | null = null;

  /** Cache of derived classes used by classIsDerivedFrom(document, ...). */
  static get derivedClasses(): InheritanceExtensions_DerivedClassDictionary {
    return InheritanceExtensions._derivedClasses ?? (InheritanceExtensions._derivedClasses = new InheritanceExtensions_DerivedClassDictionary());
  }

  /** Changes the name of the class and all references to the class and its descendant classes. */
  static changeNameAndReferences(caexClass: IClassWithBaseClassReference_1<CAEXObject>, name: string | null): void {
    const enumerable = QueryResult.elementsWithCAEXPathReference(CAEXBasicObjectExtensions.caexDocument(caexClass)!, caexClass.caexPath()) as Iterable<ICAEXReference>;
    const list = from<CAEXObject>(CAEXBasicObjectExtensions.descendants(caexClass, false, familyOf(caexClass) as Ctor<CAEXObject>) as Iterable<CAEXObject>)
      .select((d) => ({ caexObject: d, path: d.caexPath() as string }))
      .toList();
    const text = caexClass.caexPath() as string;
    caexClass.name = name;
    const text2 = caexClass.caexPath();
    for (const item2 of enumerable) {
      item2.setValue(text2);
    }
    for (const item3 of list) {
      for (const item4 of QueryResult.elementsWithCAEXPathReference(CAEXBasicObjectExtensions.caexDocument(item3.caexObject)!, item3.path) as Iterable<ICAEXReference>) {
        const num = indexOfOrdinal(item3.path, text);
        if (num >= 0) {
          const text3 = item3.path.substring(0, num);
          const item = item3.path;
          const num2 = num + text.length;
          const value = text3 + (text2 ?? '') + item.substring(num2);
          item4.setValue(value);
        }
      }
    }
  }

  /**
   * Determines whether the class is derived from the class with the provided path (or is it),
   * whether the class with path classPath is derived from baseClassPath (document overload, C#
   * ClassIsDerivedFrom&lt;T&gt;(document, classPath, baseClassPath), type = T), or whether the class is
   * derived from the provided base class. null: undetermined.
   */
  static classIsDerivedFrom(classWithReference: IClassWithBaseClassReference, baseClassPath: string | null): boolean | null;
  static classIsDerivedFrom(document: CAEXDocument, classPath: string | null, baseClassPath: string | null, type: Ctor<CAEXObject>): boolean | null;
  static classIsDerivedFrom(
    classWithReference: IClassWithBaseClassReference_1<CAEXObject> | null,
    baseClass: IClassWithBaseClassReference_1<CAEXObject> | null,
  ): boolean | null;
  static classIsDerivedFrom(a: unknown, b: unknown, ...rest: unknown[]): boolean | null {
    if (rest.length >= 1) {
      return InheritanceExtensions.classIsDerivedFromInDocument(a as CAEXDocument, b as string, rest[0] as string, rest[1] as Ctor<CAEXObject>);
    }
    if (typeof b === 'string') {
      return InheritanceExtensions.classIsDerivedFromPath(a as IClassWithBaseClassReference, b);
    }
    return InheritanceExtensions.classIsDerivedFromClass(
      a as IClassWithBaseClassReference_1<CAEXObject> | null,
      b as IClassWithBaseClassReference_1<CAEXObject> | null,
    );
  }

  private static classIsDerivedFromPath(classWithReference: IClassWithBaseClassReference, baseClassPath: string): boolean | null {
    while (true) {
      const document = CAEXBasicObjectExtensions.caexDocument(classWithReference);
      if (classWithReference.caexPath() === baseClassPath) {
        return true;
      }
      if (isNullOrEmpty(classWithReference.refBaseClassPath)) {
        return false;
      }
      if (cultureStartsWith(classWithReference.refBaseClassPath, baseClassPath)) {
        return true;
      }
      const parent = classWithReference.caexParent;
      if (
        implementsInterface(parent, 'IClassWithBaseClassReference') &&
        (parent as unknown as IClassWithBaseClassReference).name === classWithReference.refBaseClassPath &&
        (parent as unknown as IClassWithBaseClassReference).caexPath() === baseClassPath
      ) {
        return true;
      }
      const baseClass = CAEXDocumentExtensions.findByPath(document, classWithReference.refBaseClassPath);
      if (!implementsInterface(baseClass, 'IClassWithBaseClassReference')) {
        break;
      }
      classWithReference = baseClass as unknown as IClassWithBaseClassReference;
    }
    return false;
  }

  private static classIsDerivedFromInDocument(
    document: CAEXDocument,
    classPath: string | null,
    baseClassPath: string | null,
    type: Ctor<CAEXObject>,
  ): boolean | null {
    if (baseClassPath == null) {
      throw new ArgumentNullException('key');
    }
    const value = InheritanceExtensions.derivedClasses.get(baseClassPath);
    if (value !== undefined) {
      return value.contains(classPath as string);
    }
    const cAEXObject = CAEXDocumentExtensions.findByPath(document, classPath, true, type);
    if (!(cAEXObject == null) && isClassWithReferenceOf(cAEXObject, type)) {
      return InheritanceExtensions.classIsDerivedFromPath(cAEXObject as unknown as IClassWithBaseClassReference, baseClassPath);
    }
    return null;
  }

  private static classIsDerivedFromClass(
    classWithReference: IClassWithBaseClassReference_1<CAEXObject> | null,
    baseClass: IClassWithBaseClassReference_1<CAEXObject> | null,
  ): boolean | null {
    if (classWithReference == null) {
      return null;
    }
    const family = familyOf(classWithReference);
    do {
      if (baseClass == null) {
        return false;
      }
      const cAEXDocument = CAEXBasicObjectExtensions.caexDocument(classWithReference);
      if (cAEXDocument == null) {
        return null;
      }
      let text: string | null = XmlCAEXAttributes.caexPath(classWithReference.node!);
      const text2 = XmlCAEXAttributes.caexPath(baseClass.node!);
      if (text === text2) {
        return true;
      }
      text = classWithReference.refBaseClassPath;
      if (text === text2) {
        return true;
      }
      if (isNullOrEmpty(text)) {
        return false;
      }
      let cAEXObject: CAEXObject | null;
      if (!text.includes('/')) {
        const parent: unknown = classWithReference.caexParent;
        cAEXObject = parent instanceof T.CAEXObject ? parent : null;
        if (cAEXObject == null || cAEXObject.name !== text) {
          return false;
        }
      } else {
        cAEXObject = CAEXDocumentExtensions.findByPath(cAEXDocument, text);
      }
      if (cAEXObject == null) {
        return false;
      }
      if (equalsString(XmlCAEXAttributes.caexPath(baseClass.node!), cAEXObject.caexPath())) {
        return true;
      }
      classWithReference = isClassWithReferenceOf(cAEXObject, family) ? (cAEXObject as unknown as IClassWithBaseClassReference_1<CAEXObject>) : null;
    } while (classWithReference != null);
    return false;
  }

  /** Copies the class tree (new IDs, including sub classes) into the parent and changes the references to the copy. */
  static copyTreeAndChangeReferences<R extends CAEXObject>(source: IClassWithBaseClassReference_1<R>, parent: CAEXObject, name: string | null): R | null {
    const copied = (source as unknown as CAEXObject).copy(true, true, true);
    const family = familyOf(source);
    const val = family != null && copied instanceof family ? (copied as R) : null;
    if (val == null) {
      return null;
    }
    val.name = name;
    if (!parent.insert(val, false)) {
      return null;
    }
    val.changeReferences(source as unknown as CAEXObject);
    return val;
  }

  /** Creates an instance of the class with the provided name. */
  static createClassInstance<R extends CAEXObject>(caexClass: IInstantiable_1<R>, name: string | null): CAEXBasicObject | null {
    let cAEXObject: CAEXObject | null;
    const result = (cAEXObject = caexClass.createClassInstance());
    if (cAEXObject != null) {
      cAEXObject.name = name;
    }
    return result;
  }

  /** Determines whether the attribute references the attribute type with the provided path or a type derived from it. */
  static isDerivedFromAttributeType(attribute: AttributeTypeType, attributeTypePath: string | null): boolean {
    if (attributeTypePath == null) {
      throw new ArgumentNullException('attributeTypePath');
    }
    if (isNullOrEmpty(attribute.refAttributeType)) {
      return false;
    }
    const cAEXDocument = CAEXBasicObjectExtensions.caexDocument(attribute);
    if (cAEXDocument == null) {
      return false;
    }
    if (attribute.caexPath() === attributeTypePath) {
      return true;
    }
    if (attribute.refAttributeType === attributeTypePath) {
      return true;
    }
    const flag = InheritanceExtensions.classIsDerivedFrom(cAEXDocument, attribute.refAttributeType, attributeTypePath, T.AttributeFamilyType);
    if (flag !== null) {
      return flag;
    }
    return false;
  }

  /** Determines whether the interface class is (derived from) the interface class with the provided path. */
  static isDerivedFromInterfaceClass(interfaceClass: InterfaceClassType, interfaceClassPath: string | null): boolean {
    if (interfaceClass == null) {
      throw new ArgumentNullException('interfaceClass');
    }
    const document = CAEXBasicObjectExtensions.caexDocument(interfaceClass);
    if (document == null) {
      throw new InvalidOperationException('No document defined');
    }
    if (interfaceClass.caexPath() === interfaceClassPath) {
      return true;
    }
    if (isNullOrEmpty(interfaceClass.refBaseClassPath)) {
      return false;
    }
    if (interfaceClass.refBaseClassPath === interfaceClassPath) {
      return true;
    }
    const flag = InheritanceExtensions.classIsDerivedFrom(document, interfaceClass.refBaseClassPath, interfaceClassPath, T.InterfaceFamilyType);
    if (flag !== null) {
      return flag;
    }
    return false;
  }

  /** Determines whether the role reference refers to the role class with the provided path or a class derived from it. */
  static isDerivedFromRoleClass(roleReference: IObjectWithRoleReference, roleClassPath: string | null): boolean {
    if (roleReference == null) {
      throw new ArgumentNullException('roleReference');
    }
    const cAEXDocument = CAEXBasicObjectExtensions.caexDocument(roleReference);
    if (cAEXDocument == null) {
      return false;
    }
    if (isNullOrEmpty(roleReference.roleReference)) {
      return false;
    }
    if (roleReference.roleReference === roleClassPath) {
      return true;
    }
    const flag = InheritanceExtensions.classIsDerivedFrom(cAEXDocument, roleReference.roleReference, roleClassPath, T.RoleFamilyType);
    if (flag !== null) {
      return flag;
    }
    return false;
  }

  /**
   * Removes all elements whose referenced class (attribute pathAttributeName) is detailed by the
   * reference of another element (C# MakeDistinctPath&lt;T&gt;, type = T). Internal in C#.
   */
  static makeDistinctPath(
    document: CAEXDocument,
    elementsWithPath: Iterable<XElement>,
    pathAttributeName: string,
    type: Ctor<CAEXObject>,
  ): XElement[] {
    const list = [...elementsWithPath];
    // List.RemoveAll: the predicate is evaluated once per element, in order.
    return list.filter((element) => !InheritanceExtensions.isDetailed(document, element, elementsWithPath, pathAttributeName, type));
  }

  private static isDetailed(
    document: CAEXDocument,
    element: XElement,
    elementsWithPath: Iterable<XElement>,
    pathAttributeName: string,
    type: Ctor<CAEXObject>,
  ): boolean {
    const elementPath = element.attribute(pathAttributeName)?.value ?? null;
    if (isNullOrEmpty(elementPath)) {
      return true;
    }
    return from(elementsWithPath)
      .where((elementWithPath) => elementWithPath !== element)
      .select((elementWithPath) => elementWithPath.attribute(pathAttributeName)?.value ?? null)
      .where((path) => !isNullOrEmpty(path))
      .select((path) => InheritanceExtensions.classIsDerivedFrom(document, path, elementPath, type))
      .any((isDetailed) => isDetailed !== null && isDetailed);
  }
}

// ---- private helpers ------------------------------------------------------------------------

/** The T of IClassWithBaseClassReference&lt;T&gt; implemented by the object. */
function familyOf(x: unknown): Ctor<CAEXObject> | null {
  if (x instanceof T.AttributeFamilyType) return T.AttributeFamilyType;
  if (x instanceof T.InterfaceFamilyType) return T.InterfaceFamilyType;
  if (x instanceof T.RoleFamilyType) return T.RoleFamilyType;
  if (x instanceof T.SystemUnitFamilyType) return T.SystemUnitFamilyType;
  return null;
}

/** `x is IClassWithBaseClassReference<T>` for the family type T. */
function isClassWithReferenceOf(x: unknown, family: Ctor<CAEXObject> | null): boolean {
  if (!implementsInterface(x, 'IClassWithBaseClassReference_1')) return false;
  return family == null || x instanceof family;
}

/** string.IndexOf(string, StringComparison.Ordinal). */
function indexOfOrdinal(s: string, value: string | null): number {
  if (value === null || value === undefined) throw new ArgumentNullException('value');
  return s.indexOf(value);
}

/** string.Equals(string) on a possibly null receiver (NullReferenceException in C#). */
function equalsString(a: string | null, b: string | null): boolean {
  return (a as string).valueOf() === b;
}
