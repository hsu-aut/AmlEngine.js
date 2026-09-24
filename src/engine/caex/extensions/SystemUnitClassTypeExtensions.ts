// Port of Aml.Engine.CAEX.Extensions.SystemUnitClassTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { InvalidCastException } from '../../../system/exceptions.js';
import { Enumerable, from } from '../../../system/linq.js';
import type { XElement } from '../../../xml/index.js';
import { XmlCAEXSchema } from '../../xmlext/XmlCAEXSchema.js';
import { XmlCAEXAttributes } from '../../xmlext/XmlCAEXAttributes.js';
import { ChangeMode } from '../ChangeMode.js';
import { CAEXObjectExtensions } from './CAEXObjectExtensions.js';
import type { AttributeType } from '../AttributeType.js';
import type { CAEXObject } from '../CAEXObject.js';
import type { ExternalInterfaceType } from '../ExternalInterfaceType.js';
import type { IInternalElementContainer } from '../IInternalElementContainer.js';
import type { IObjectWithAttributes } from '../IObjectWithAttributes.js';
import type { IObjectWithExternalInterface } from '../IObjectWithExternalInterface.js';
import type { InternalElementType } from '../InternalElementType.js';
import type { InternalLinkType } from '../InternalLinkType.js';
import type { SupportedRoleClassType } from '../SupportedRoleClassType.js';
import type { SystemUnitClassType } from '../SystemUnitClassType.js';
import type { SystemUnitFamilyType } from '../SystemUnitFamilyType.js';

/** Extension methods for system unit classes and InternalElements. */
export class SystemUnitClassTypeExtensions {
  private constructor() {}

  /** Inserts the InternalElement or ExternalInterface, if no child of that kind has the same name. */
  static addInstance(systemUnitClass: SystemUnitClassType, newInstanceObject: CAEXObject): boolean {
    if (
      from(systemUnitClass.elements(newInstanceObject.tagName as string) as Iterable<XElement>).all(
        (n) => XmlCAEXAttributes.caexNameOfElement(n) !== newInstanceObject.name,
      )
    ) {
      if (!(newInstanceObject instanceof T.ExternalInterfaceType)) {
        if (!(newInstanceObject instanceof T.InternalElementType)) {
          throw new InvalidCastException();
        }
        return systemUnitClass.insert(newInstanceObject, false);
      }
      return systemUnitClass.insert(newInstanceObject, false);
    }
    return false;
  }

  /** Appends a new InternalElement (ChangeMode Create), if no InternalElement has the name. */
  static addNewInternalElement(systemUnitClass: SystemUnitClassType, elementName: string | null): InternalElementType | null {
    if (systemUnitClass.internalElement.item(elementName) != null) {
      return null;
    }
    const internalElementType = systemUnitClass.internalElement.append(elementName as string);
    internalElementType.changeMode = ChangeMode.Create;
    return internalElementType;
  }

  /** The class and its ancestor system unit classes. */
  static ancestors(systemUnitClass: SystemUnitFamilyType): Iterable<SystemUnitFamilyType> {
    const node = systemUnitClass.node!;
    const name = XmlCAEXSchema.xName(node, 'SystemUnitClass');
    return new T.CAEXEnumerable<SystemUnitFamilyType>(
      new Enumerable<XElement>(() => node.ancestorsAndSelf(name)),
      T.SystemUnitFamilyType,
    );
  }

  /** Inserts the InternalElement after the predecessor (first, if there is none). Obsolete. */
  static append_InternalElement(
    systemUnitClass: SystemUnitClassType,
    internalElement: InternalElementType,
    internalElementPredecessor: InternalElementType | null,
  ): void {
    if (internalElementPredecessor == null) {
      systemUnitClass.internalElement.insert(internalElement);
    } else {
      internalElementPredecessor.insertAfter(internalElement);
    }
  }

  /** Inserts the attribute (obsolete: use Attribute.insert). */
  static insert_Attribute(objectWithAttributes: IObjectWithAttributes, attributeElement: AttributeType): void {
    objectWithAttributes.attribute.insert(attributeElement, false);
  }

  /** Inserts the interface (obsolete: use ExternalInterface.insert). */
  static insert_ExternalInterface(
    objectWithExternalInterface: IObjectWithExternalInterface,
    interfaceElement: ExternalInterfaceType,
    asFirst = true,
  ): void {
    objectWithExternalInterface.externalInterface.insert(interfaceElement, asFirst);
  }

  /** Inserts the InternalElement (obsolete: use InternalElement.insert). */
  static insert_InternalElement(objectWithInternalElements: IInternalElementContainer, internalElement: InternalElementType, asFirst = true): void {
    objectWithInternalElements.internalElement.insert(internalElement, asFirst);
  }

  /** Inserts the InternalLink (obsolete: use InternalLink.insert). */
  static insert_InternalLink(systemUnitClass: SystemUnitClassType, internalLinkElement: InternalLinkType, asFirst = true): void {
    systemUnitClass.internalLink.insert(internalLinkElement, asFirst);
  }

  /** Inserts the SupportedRoleClass (obsolete: use SupportedRoleClass.insert). */
  static insert_SupportedRoleClass(systemUnitClass: SystemUnitClassType, supportedRoleClassElement: SupportedRoleClassType, asFirst = true): void {
    systemUnitClass.supportedRoleClass.insert(supportedRoleClassElement, asFirst);
  }

  /** Creates a new ExternalInterface with the provided name (and interface class reference). */
  static new_ExternalInterface(objectWithExternalInterface: IObjectWithExternalInterface, name: string | null, asFirst?: boolean): ExternalInterfaceType;
  static new_ExternalInterface(
    objectWithExternalInterface: IObjectWithExternalInterface,
    name: string | null,
    interfaceClassPath: string | null,
    asFirst?: boolean,
  ): ExternalInterfaceType;
  static new_ExternalInterface(
    objectWithExternalInterface: IObjectWithExternalInterface,
    name: string | null,
    arg3?: string | boolean | null,
    arg4?: boolean,
  ): ExternalInterfaceType {
    if (typeof arg3 === 'string' || arg3 === null) {
      const externalInterfaceType = CAEXObjectExtensions.newElement(objectWithExternalInterface.externalInterface, name, arg4 ?? true);
      externalInterfaceType.refBaseClassPath = arg3;
      return externalInterfaceType;
    }
    return CAEXObjectExtensions.newElement(objectWithExternalInterface.externalInterface, name, arg3 ?? true);
  }

  /** Creates a new InternalElement with the provided name. */
  static new_InternalElement(elementWithInternalElements: IInternalElementContainer, elementName: string | null, asFirst = true): InternalElementType {
    return CAEXObjectExtensions.newElement(elementWithInternalElements.internalElement, elementName, asFirst);
  }

  /** Creates a new InternalLink with the provided name. */
  static new_InternalLink(systemUnitClass: SystemUnitClassType, name: string | null, asFirst = true): InternalLinkType {
    return CAEXObjectExtensions.newElement(systemUnitClass.internalLink, name, asFirst);
  }

  /** Creates a new SupportedRoleClass referencing the provided role class path. */
  static new_SupportedRoleClass(systemUnitClass: SystemUnitClassType, referencedRoleClassPath: string | null, asFirst = true): SupportedRoleClassType {
    const obj = asFirst ? systemUnitClass.supportedRoleClass.prepend() : systemUnitClass.supportedRoleClass.append();
    obj.refRoleClassPath = referencedRoleClassPath;
    return obj;
  }
}
