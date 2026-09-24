// Port of Aml.Engine.CAEX.Extensions.ObjectWithExternalInterface (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { ArgumentNullException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { from, type Enumerable } from '../../../system/linq.js';
import { ServiceLocator } from '../../services/ServiceLocator.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './CAEXDocumentExtensions.js';
import { InheritanceExtensions } from './InheritanceExtensions.js';
import type { ExternalInterfaceType } from '../ExternalInterfaceType.js';
import type { IObjectWithExternalInterface } from '../IObjectWithExternalInterface.js';
import type { InterfaceFamilyType } from '../InterfaceFamilyType.js';

/** Extension methods for objects with external interfaces. */
export class ObjectWithExternalInterface {
  private constructor() {}

  /**
   * Adds an ExternalInterface referencing the provided interface class (class or path). With
   * addUnique, nothing is added if such an interface exists; with addInstance, an instance of the
   * class is created. The name defaults to a unique name (or the class name / last path segment).
   */
  static addInterfaceClassReference(
    objectWithExternalInterface: IObjectWithExternalInterface,
    interfaceClass: InterfaceFamilyType | string | null,
    addUnique = true,
    addInstance = false,
    name: string | null = '',
  ): ExternalInterfaceType | null {
    if (typeof interfaceClass === 'string') {
      return ObjectWithExternalInterface.addInterfaceClassReferenceByPath(objectWithExternalInterface, interfaceClass, addUnique, addInstance, name);
    }
    if (interfaceClass == null) {
      throw new ArgumentNullException('interfaceClass');
    }
    if (addUnique && from<ExternalInterfaceType>(objectWithExternalInterface.externalInterface).any((rrq) => rrq.interfaceClass!.equals(interfaceClass))) {
      return null;
    }
    let externalInterfaceType: ExternalInterfaceType;
    if (addInstance) {
      externalInterfaceType = interfaceClass.createClassInstance();
      objectWithExternalInterface.externalInterface.insert(externalInterfaceType);
    } else {
      externalInterfaceType = objectWithExternalInterface.externalInterface.append();
      externalInterfaceType.interfaceClass = interfaceClass;
    }
    if (isNullOrEmpty(name)) {
      name =
        ServiceLocator.uniqueNameService?.uniqueCAEXName(objectWithExternalInterface.node!, objectWithExternalInterface.node!.name.localName) ??
        interfaceClass.name;
    }
    externalInterfaceType.name = name;
    return externalInterfaceType;
  }

  private static addInterfaceClassReferenceByPath(
    objectWithExternalInterface: IObjectWithExternalInterface,
    interfaceClassReference: string,
    addUnique: boolean,
    addInstance: boolean,
    name: string | null,
  ): ExternalInterfaceType | null {
    if (isNullOrEmpty(interfaceClassReference)) {
      throw new ArgumentNullException('interfaceClassReference');
    }
    if (
      addUnique &&
      from<ExternalInterfaceType>(objectWithExternalInterface.externalInterface).any((ext) => equalsString(ext.refBaseClassPath, interfaceClassReference))
    ) {
      return null;
    }
    let externalInterfaceType: ExternalInterfaceType | null = null;
    if (addInstance) {
      const found = CAEXDocumentExtensions.findByPath(CAEXBasicObjectExtensions.caexDocument(objectWithExternalInterface), interfaceClassReference);
      const interfaceFamilyType = found instanceof T.InterfaceFamilyType ? found : null;
      if (interfaceFamilyType != null) {
        externalInterfaceType = interfaceFamilyType.createClassInstance();
        objectWithExternalInterface.externalInterface.insert(externalInterfaceType);
      }
    }
    if (externalInterfaceType == null) {
      externalInterfaceType = objectWithExternalInterface.externalInterface.append();
      externalInterfaceType.refBaseClassPath = interfaceClassReference;
    }
    if (isNullOrEmpty(name)) {
      name =
        ServiceLocator.uniqueNameService?.uniqueCAEXName(objectWithExternalInterface.node!, objectWithExternalInterface.node!.name.localName) ??
        getFileName(interfaceClassReference);
    }
    externalInterfaceType.name = name;
    return externalInterfaceType;
  }

  /** Determines whether an ExternalInterface references the interface class (class or path), optionally regarding inheritance. */
  static hasInterfaceClassReference(
    objectWithExternalInterface: IObjectWithExternalInterface,
    interfaceClass: InterfaceFamilyType | string | null,
    regardInheritance = false,
  ): boolean {
    if (typeof interfaceClass === 'string') {
      return ObjectWithExternalInterface.hasInterfaceClassReferenceByPath(objectWithExternalInterface, interfaceClass, regardInheritance);
    }
    if (!(interfaceClass == null)) {
      if (!regardInheritance) {
        return from<ExternalInterfaceType>(objectWithExternalInterface.externalInterface).any((r) => T.CAEXWrapper.equals(r.interfaceClass, interfaceClass));
      }
      return from<ExternalInterfaceType>(objectWithExternalInterface.externalInterface).any(
        (r) =>
          T.CAEXWrapper.equals(r.interfaceClass, interfaceClass) ||
          (r.interfaceClass != null && InheritanceExtensions.classIsDerivedFrom(r.interfaceClass, interfaceClass) === true),
      );
    }
    throw new ArgumentNullException('interfaceClass');
  }

  private static hasInterfaceClassReferenceByPath(
    objectWithExternalInterface: IObjectWithExternalInterface,
    interfaceReference: string,
    regardInheritance: boolean,
  ): boolean {
    if (!isNullOrEmpty(interfaceReference)) {
      if (!regardInheritance) {
        return from<ExternalInterfaceType>(objectWithExternalInterface.externalInterface).any((r) => r.refBaseClassPath === interfaceReference);
      }
      return from<ExternalInterfaceType>(objectWithExternalInterface.externalInterface).any((r) =>
        InheritanceExtensions.isDerivedFromInterfaceClass(r, interfaceReference),
      );
    }
    throw new ArgumentNullException('interfaceReference');
  }

  /** Gets the ExternalInterfaces referencing the interface class path, optionally regarding inheritance. */
  static interfaceClassReferences(
    objectWithExternalInterface: IObjectWithExternalInterface,
    interfaceReference: string | null,
    regardInheritance = false,
  ): Enumerable<ExternalInterfaceType> {
    if (!isNullOrEmpty(interfaceReference)) {
      if (!regardInheritance) {
        return from<ExternalInterfaceType>(objectWithExternalInterface.externalInterface).where((r) => r.refBaseClassPath === interfaceReference);
      }
      return from<ExternalInterfaceType>(objectWithExternalInterface.externalInterface).where((r) =>
        InheritanceExtensions.isDerivedFromInterfaceClass(r, interfaceReference),
      );
    }
    throw new ArgumentNullException('interfaceReference');
  }
}

// ---- private helpers ------------------------------------------------------------------------

/** string.Equals(string) on a possibly null receiver (NullReferenceException in C#). */
function equalsString(a: string | null, b: string | null): boolean {
  return (a as string).valueOf() === b;
}

/**
 * System.IO.Path.GetFileName as on Windows (the platform of the reference engine): the part
 * after the last '\' or '/', or after a drive root like "C:".
 */
function getFileName(path: string | null): string | null {
  if (path === null) return null;
  const i = Math.max(path.lastIndexOf('\\'), path.lastIndexOf('/'));
  if (i >= 0) return path.substring(i + 1);
  const root = path.length >= 2 && path[1] === ':' && /^[A-Za-z]$/.test(path[0]) ? 2 : 0;
  return path.substring(root);
}
