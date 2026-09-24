// Port of Aml.Engine.CAEX.Extensions.CAEXFileTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { ArgumentNullException, ArgumentOutOfRangeException, IndexOutOfRangeException, NotSupportedException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { from } from '../../../system/linq.js';
import { XElement } from '../../../xml/index.js';
import { XmlCAEXSchema } from '../../xmlext/XmlCAEXSchema.js';
import { XmlCAEXAttributes } from '../../xmlext/XmlCAEXAttributes.js';
import { XmlOperation } from '../../xmlext/XmlOperation.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './CAEXDocumentExtensions.js';
import { CAEXPathBuilder } from './CAEXPathBuilder.js';
import type { AttributeTypeLibType } from '../AttributeTypeLibType.js';
import type { CAEXFileType } from '../CAEXFileType.js';
import type { CAEXObject } from '../CAEXObject.js';
import type { ExternalReferenceType } from '../ExternalReferenceType.js';
import type { InstanceHierarchyType } from '../InstanceHierarchyType.js';
import type { InterfaceClassLibType } from '../InterfaceClassLibType.js';
import type { RoleClassLibType } from '../RoleClassLibType.js';
import type { SystemUnitClassLibType } from '../SystemUnitClassLibType.js';
import type { ICAEXReference } from '../../services/interfaces/ICAEXReference.js';

type Ctor<R = unknown> = abstract new (...args: never[]) => R;

/** Extension methods for the CAEXFile. */
export class CAEXFileTypeExtensions {
  private constructor() {}

  /**
   * Finds the CAEX object with the provided ID (obsolete, uses the standard FindByID). With a
   * type (C# FindFastByID&lt;T&gt;), null unless the object is of that type.
   */
  static findFastByID<R extends CAEXObject>(caexFile: CAEXFileType, id: string | null, ...args: unknown[]): R | null {
    const { type } = boolAndType(args);
    const document = CAEXBasicObjectExtensions.caexDocument(caexFile);
    const found = document == null ? null : CAEXDocumentExtensions.findByID(document, id);
    return asType<R>(found, type);
  }

  /**
   * Finds the CAEX object with the provided path (obsolete, uses the standard FindByPath). With
   * a type (C# FindFastByPath&lt;T&gt;), null unless the object is of that type.
   */
  static findFastByPath<R extends CAEXObject>(caexFile: CAEXFileType, path: string | null, ...args: unknown[]): R | null {
    const { type } = boolAndType(args);
    const document = CAEXBasicObjectExtensions.caexDocument(caexFile);
    const found = document == null ? null : CAEXDocumentExtensions.findByPath(document, path);
    return asType<R>(found, type);
  }

  /** Imports an AttributeTypeLib (obsolete, use importAttributeTypeLib). */
  static import_AttributeTypeLib(caexFile: CAEXFileType, attributeTypeLib: AttributeTypeLibType): AttributeTypeLibType | null {
    return CAEXFileTypeExtensions.importLibrary(caexFile, attributeTypeLib, T.AttributeTypeLibType);
  }

  /** Imports an InstanceHierarchy (obsolete, use importInstanceHierarchy). */
  static import_InstanceHierarchy(caexFile: CAEXFileType, instanceHierarchy: InstanceHierarchyType): InstanceHierarchyType | null {
    return CAEXFileTypeExtensions.importLibrary(caexFile, instanceHierarchy, T.InstanceHierarchyType);
  }

  /** Imports an InterfaceClassLib (obsolete, use importInterfaceClassLib). */
  static import_InterfaceClassLibHierarchy(caexFile: CAEXFileType, interfaceClassLib: InterfaceClassLibType): InterfaceClassLibType | null {
    return CAEXFileTypeExtensions.importLibrary(caexFile, interfaceClassLib, T.InterfaceClassLibType);
  }

  /** Imports a RoleClassLib (obsolete, use importRoleClassLib). */
  static import_RoleClassLibHierarchy(caexFile: CAEXFileType, roleClassLib: RoleClassLibType): RoleClassLibType | null {
    return CAEXFileTypeExtensions.importLibrary(caexFile, roleClassLib, T.RoleClassLibType);
  }

  /** Imports a SystemUnitClassLib (obsolete, use importSystemUnitClassLib). */
  static import_SystemUnitClassLibHierarchy(caexFile: CAEXFileType, systemUnitClassLib: SystemUnitClassLibType): SystemUnitClassLibType | null {
    return CAEXFileTypeExtensions.importLibrary(caexFile, systemUnitClassLib, T.SystemUnitClassLibType);
  }

  /** Imports a copy of the AttributeTypeLib of another document (external references are merged). */
  static importAttributeTypeLib(caexFile: CAEXFileType, attributeTypeLib: AttributeTypeLibType): AttributeTypeLibType | null {
    return CAEXFileTypeExtensions.importLibrary(caexFile, attributeTypeLib, T.AttributeTypeLibType);
  }

  /** Imports a copy of the InstanceHierarchy of another document (external references are merged). */
  static importInstanceHierarchy(caexFile: CAEXFileType, instanceHierarchy: InstanceHierarchyType): InstanceHierarchyType | null {
    return CAEXFileTypeExtensions.importLibrary(caexFile, instanceHierarchy, T.InstanceHierarchyType);
  }

  /** Imports a copy of the InterfaceClassLib of another document (external references are merged). */
  static importInterfaceClassLib(caexFile: CAEXFileType, interfaceClassLib: InterfaceClassLibType): InterfaceClassLibType | null {
    return CAEXFileTypeExtensions.importLibrary(caexFile, interfaceClassLib, T.InterfaceClassLibType);
  }

  /** Imports a copy of the RoleClassLib of another document (external references are merged). */
  static importRoleClassLib(caexFile: CAEXFileType, roleClassLib: RoleClassLibType): RoleClassLibType | null {
    return CAEXFileTypeExtensions.importLibrary(caexFile, roleClassLib, T.RoleClassLibType);
  }

  /** Imports a copy of the SystemUnitClassLib of another document (external references are merged). */
  static importSystemUnitClassLib(caexFile: CAEXFileType, systemUnitClassLib: SystemUnitClassLibType): SystemUnitClassLibType | null {
    return CAEXFileTypeExtensions.importLibrary(caexFile, systemUnitClassLib, T.SystemUnitClassLibType);
  }

  /** Inserts the ExternalReference (obsolete, use CAEXFileType.insert). */
  static insert_ExternalReference(caexFile: CAEXFileType, externalReference: ExternalReferenceType): void {
    caexFile.insert(externalReference, false);
  }

  /**
   * Gets AML library information from a file name built as
   * producer_domain_libType[_extension]_edition_version.
   */
  static getAMLInfoFromFilename(caexFile: CAEXFileType): {
    producer: string | null;
    domain: string | null;
    version: string | null;
    edition: string | null;
    libType: string | null;
    extension: string | null;
  } {
    let producer: string | null = null;
    let domain: string | null = null;
    let version: string | null = null;
    let edition: string | null = null;
    let libType: string | null = null;
    let extension: string | null = null;
    const array = (caexFile.fileName as string).split('_');
    let num = 0;
    if (array.length >= 5) {
      producer = array[num++];
      domain = array[num++];
      libType = array[num++];
      if (array.length === 6) {
        extension = array[num++];
      }
      edition = array[num++];
      version = array[num];
    }
    return { producer, domain, version, edition, libType, extension };
  }

  /** Inserts the InstanceHierarchy (obsolete, use CAEXFileType.insert). */
  static insert_InstanceHierarchy(caexFile: CAEXFileType, instanceHierarchyNode: InstanceHierarchyType): void {
    caexFile.insert(instanceHierarchyNode, false);
  }

  /** Inserts the InterfaceClassLib (obsolete, use CAEXFileType.insert). */
  static insert_InterfaceClassLibHierarchy(caexFile: CAEXFileType, interfaceClassLibNode: InterfaceClassLibType): void {
    caexFile.insert(interfaceClassLibNode, false);
  }

  /** Inserts the RoleClassLib (obsolete, use CAEXFileType.insert). */
  static insert_RoleClassLibHierarchy(caexFile: CAEXFileType, roleClassLib: RoleClassLibType): void {
    caexFile.insert(roleClassLib, false);
  }

  /** Inserts the SystemUnitClassLib (obsolete, use CAEXFileType.insert). */
  static insert_SystemUnitClassLibHierarchy(caexFile: CAEXFileType, systemUnitClassLib: SystemUnitClassLibType): void {
    caexFile.insert(systemUnitClassLib, false);
  }

  /** Creates a new ExternalReference with the provided path and alias. */
  static new_ExternalReference(caexFile: CAEXFileType, path: string | null, alias: string | null): ExternalReferenceType {
    return caexFile.externalReference.append(['Alias', alias], ['Path', path]);
  }

  /** Creates a new InstanceHierarchy. */
  static new_InstanceHierarchy(caexFile: CAEXFileType, name: string | null): InstanceHierarchyType {
    return caexFile.instanceHierarchy.append(name as string);
  }

  /** Creates a new InterfaceClassLib. */
  static new_InterfaceClassLibHierarchy(caexFile: CAEXFileType, name: string | null): InterfaceClassLibType {
    return caexFile.interfaceClassLib.append(name as string);
  }

  /** Creates a new RoleClassLib. */
  static new_RoleClassLibHierarchy(caexFile: CAEXFileType, name: string | null): RoleClassLibType {
    return caexFile.roleClassLib.append(name as string);
  }

  /** Creates a new SystemUnitClassLib. */
  static new_SystemUnitClassLibHierarchy(caexFile: CAEXFileType, name: string | null): SystemUnitClassLibType {
    return caexFile.systemUnitClassLib.append(name as string);
  }

  /** Preorder traversal of a tree given by an enumerator and a child selector; returns the visited items. */
  static preorderTraversal(
    caexFile: CAEXFileType,
    source: Iterator<unknown>,
    childSelector: (item: unknown) => Iterator<unknown> | null,
  ): unknown[] {
    void caexFile;
    const stack: Iterator<unknown>[] = [];
    stack.push(source);
    const list: unknown[] = [];
    while (stack.length > 0) {
      const enumerator = stack[stack.length - 1];
      const next = enumerator.next();
      if (!next.done) {
        const current = next.value;
        list.push(current);
        const enumerator2 = childSelector(current);
        if (enumerator2 != null) {
          stack.push(enumerator2);
        }
      } else {
        stack.pop();
      }
    }
    return list;
  }

  /** Determines whether the CAEXFile contains an ExternalReference with the same path. Internal in C#. */
  static containsReference(caexFile: CAEXFileType, externalRef: ExternalReferenceType): boolean {
    return from<ExternalReferenceType>(caexFile.externalReference).any((existingRef) => existingRef.path === externalRef.path);
  }

  private static importLibrary<R extends CAEXObject>(caexFile: CAEXFileType, library: R, type: Ctor<R>): R | null {
    if (library == null) {
      throw new ArgumentNullException('library');
    }
    const cAEXDocument = CAEXBasicObjectExtensions.caexDocument(library)!;
    if (CAEXBasicObjectExtensions.caexSchema(caexFile) !== cAEXDocument.schema) {
      throw new NotSupportedException("Importing elements with different schema's is not supported");
    }
    const service = ServiceLocator.uniqueNameService ?? null;
    service?.suspend();
    const copy = XmlOperation.createCAEXWrapper(new XElement(library.node!));
    const val: R | null = copy instanceof type ? (copy as R) : null;
    caexFile.insert(val, false);
    service?.resume();
    const list: ExternalReferenceType[] = [];
    for (const item of cAEXDocument.caexFile!.externalReference as Iterable<ExternalReferenceType>) {
      let flag = false;
      const list2 = [...(ServiceLocator.queryService!.elementsWithAliasReference(val!, item.alias as string) as Iterable<ICAEXReference>)];
      if (list2.length === 0) {
        flag = true;
      } else {
        for (const item2 of list2) {
          const referenceAttributeValue = item2.referenceAttributeValue;
          if (!isNullOrEmpty(referenceAttributeValue) && !(item2.caexObject == null)) {
            const referenceNames = CAEXPathBuilder.pathNameArray(referenceAttributeValue, cAEXDocument.schema);
            if (
              from(caexFile.node!.elements()).any(
                (e: XElement) => XmlCAEXSchema.isLibrary(e) && XmlCAEXAttributes.caexNameOfElement(e) === arrAt(referenceNames, 1),
              )
            ) {
              const text = referenceAttributeValue;
              const num = (item.alias as string).length + 1;
              item2.setValue(csSubstring(text, num, text.length - num));
              flag = true;
            }
          }
        }
      }
      if (!flag) {
        list.push(item);
      }
    }
    // Lazy Where in C#: the filter sees the references inserted before.
    for (const item3 of list) {
      if (!CAEXFileTypeExtensions.containsReference(caexFile, item3)) {
        caexFile.insert(item3, false);
      }
    }
    return val;
  }
}

// ---- private helpers ------------------------------------------------------------------------

/** Splits optional (bool, type) arguments given in either order. */
function boolAndType(args: unknown[]): { flag: boolean; type: Ctor | null } {
  let flag = false;
  let type: Ctor | null = null;
  for (const a of args) {
    if (typeof a === 'boolean') flag = a;
    else if (typeof a === 'function') type = a as Ctor;
  }
  return { flag, type };
}

/** `x as T` (no type: no filtering). */
function asType<R>(x: unknown, type: Ctor | null): R | null {
  if (x == null) return null;
  if (type == null) return x as R;
  return x instanceof type ? (x as R) : null;
}

/** array indexer: throws IndexOutOfRangeException outside the array. */
function arrAt<E>(array: E[], index: number): E {
  if (index < 0 || index >= array.length) throw new IndexOutOfRangeException();
  return array[index];
}

/** string.Substring(startIndex, length). */
function csSubstring(s: string, startIndex: number, length: number): string {
  if (startIndex < 0) throw new ArgumentOutOfRangeException('startIndex', 'StartIndex cannot be less than zero.');
  if (startIndex > s.length) throw new ArgumentOutOfRangeException('startIndex', 'startIndex cannot be larger than length of string.');
  if (length < 0) throw new ArgumentOutOfRangeException('length', 'Length cannot be less than zero.');
  if (startIndex > s.length - length) throw new ArgumentOutOfRangeException('length', 'Index and length must refer to a location within the string.');
  return s.substring(startIndex, startIndex + length);
}
