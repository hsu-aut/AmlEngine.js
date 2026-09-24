// Port of Aml.Engine.Xml.Extensions.XmlCAEXMapping (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { from } from '../../system/linq.js';
import { XNamespace, type XAttribute, type XElement } from '../../xml/index.js';
import { XmlCAEXAttributes } from './XmlCAEXAttributes.js';
import { XmlCAEXSchema } from './XmlCAEXSchema.js';

/**
 * System.IO.Path.GetFileName with the Windows rules of .NET: the part after the last '\' or '/'
 * (or after the drive root "C:").
 */
function getFileName(path: string): string {
  const root = path.length >= 2 && path[1] === ':' && /[A-Za-z]/.test(path[0]) ? 2 : 0;
  for (let i = path.length; --i >= 0; ) {
    if (i < root || path[i] === '\\' || path[i] === '/') {
      return path.substring(i + 1);
    }
  }
  return path;
}

/**
 * `XPathSelectElements("./RoleRequirements | ./SupportedRoleClass")`: an unprefixed XPath name
 * test matches only elements in no namespace, so the result is always empty for CAEX 3.0
 * documents (namespace http://www.dke.de/CAEX). The union is returned in document order.
 */
function roleReferenceChildren(element: XElement): XElement[] {
  return [
    ...from(element.elements()).where(
      (e) => e.name.namespace === XNamespace.None && (e.name.localName === 'RoleRequirements' || e.name.localName === 'SupportedRoleClass'),
    ),
  ];
}

/** Internal extension methods resolving the role and system unit class of mapping elements. */
export class XmlCAEXMapping {
  private constructor() {}

  static mappingPathToRoleReference(mappingElement: XElement | null): string | null {
    if (mappingElement === null || mappingElement === undefined) {
      throw new ArgumentNullException('mappingElement');
    }
    const roleAttribute = XmlCAEXMapping.findRoleAttributeValue(mappingElement);
    if (isNullOrEmpty(roleAttribute)) {
      return null;
    }
    const xElement = mappingElement.parent?.parent ?? null;
    if (xElement === null) {
      return null;
    }
    const list = XmlCAEXMapping.createRoleReferenceList(xElement);
    if (list.length === 1) {
      return XmlCAEXAttributes.roleReference(list[0]);
    }
    return from(list)
      .select((roleReference) => XmlCAEXAttributes.roleReference(roleReference))
      .where((rolePath) => !isNullOrEmpty(rolePath))
      .firstOrDefault((rolePath) => roleAttribute.startsWith(getFileName(rolePath!) + '.'));
  }

  static mappingPathToSystemUnitClassReference(mappingElement: XElement | null): string | null {
    if (mappingElement === null || mappingElement === undefined) {
      throw new ArgumentNullException();
    }
    const xElement = mappingElement.parent?.parent ?? null;
    if (xElement !== null) {
      if ((!XmlCAEXSchema.isSupportedRoleClass(xElement) && !XmlCAEXSchema.isRoleRequirement(xElement)) || xElement.parent === null) {
        if (!XmlCAEXSchema.isInternalElement(xElement)) {
          return null;
        }
        return XmlCAEXAttributes.caexidOfElement(xElement);
      }
      return XmlCAEXAttributes.caexPath(xElement.parent);
    }
    return null;
  }

  static referencedElementFromMapping(mappingAttribute: XAttribute, nameReference: string | null = null): XElement | null {
    let value: string | null = mappingAttribute.value;
    if (!isNullOrEmpty(nameReference)) {
      value = nameReference;
    }
    if (isNullOrEmpty(value)) {
      return null;
    }
    switch (mappingAttribute.name.localName) {
      case 'RoleInterfaceName':
        return new T.InterfaceNameMappingType(mappingAttribute.parent).roleClassElement?.node ?? null;
      case 'SystemUnitInterfaceName':
        return new T.InterfaceNameMappingType(mappingAttribute.parent).systemUnitClassElement?.node ?? null;
      case 'RoleAttributeName':
        return new T.AttributeNameMappingType(mappingAttribute.parent).roleClassElement?.node ?? null;
      case 'SystemUnitAttributeName':
        return new T.AttributeNameMappingType(mappingAttribute.parent).systemUnitClassElement?.node ?? null;
      case 'RoleInterfaceID':
        return new T.InterfaceIDMappingType(mappingAttribute.parent).roleClassElement?.node ?? null;
      case 'SystemUnitInterfaceID':
        return new T.InterfaceIDMappingType(mappingAttribute.parent).systemUnitClassElement?.node ?? null;
      default:
        return null;
    }
  }

  static roleFromMapping(mappingAttribute: XAttribute): XElement | null {
    const parent = mappingAttribute.parent;
    // C# calls parent.CAEXSchema() before the null-conditional access below.
    if (XmlCAEXSchema.caexSchema(parent!) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      return parent !== null
        ? from(parent.ancestors()).firstOrDefault((e) => {
            const localName = e.name.localName;
            return localName === 'RoleRequirements' || localName === 'SupportedRoleClass';
          })
        : null;
    }
    return XmlCAEXMapping.roleReferenceToMapping(parent!);
  }

  static roleReferenceToMapping(mappingAttribute: XElement): XElement | null {
    let roleAttribute: string | null;
    switch (mappingAttribute.name.localName) {
      case 'AttributeNameMapping':
        roleAttribute = mappingAttribute.attribute('RoleAttributeName')?.value ?? null;
        break;
      case 'InterfaceNameMapping':
        roleAttribute = mappingAttribute.attribute('RoleInterfaceName')?.value ?? null;
        break;
      case 'InterfaceIDMapping':
        roleAttribute = mappingAttribute.attribute('RoleInterfaceID')?.value ?? null;
        break;
      default:
        roleAttribute = '';
        break;
    }
    if (isNullOrEmpty(roleAttribute)) {
      return null;
    }
    const xElement = mappingAttribute.parent?.parent ?? null;
    if (xElement === null) {
      return null;
    }
    const list: XElement[] = [];
    if (XmlCAEXSchema.isSupportedRoleClass(xElement) || XmlCAEXSchema.isRoleRequirement(xElement)) {
      list.push(xElement);
    } else if (XmlCAEXSchema.isInternalElement(xElement)) {
      const list2 = roleReferenceChildren(xElement);
      if (list2.length > 0) {
        list.push(...list2);
      }
    }
    if (list.length === 1) {
      return list[0];
    }
    const ra = roleAttribute;
    return from(list)
      .select((roleReference) => ({ roleReference, rolePath: XmlCAEXAttributes.roleReference(roleReference) }))
      .where((x) => !isNullOrEmpty(x.rolePath))
      .where((x) => ra.startsWith(getFileName(x.rolePath!) + '.'))
      .select((x) => x.roleReference)
      .firstOrDefault();
  }

  static systemUnitClassFromMapping(mappingAttribute: XAttribute): XElement | null {
    const parent = mappingAttribute.parent;
    return parent !== null
      ? from(parent.ancestors()).firstOrDefault((e) => {
          const localName = e.name.localName;
          return localName === 'InternalElement' || localName === 'SystemUnitClass';
        })
      : null;
  }

  static systemUnitClassReferenceToMapping(mappingAttribute: XElement): XElement | null {
    const xElement = mappingAttribute.parent?.parent ?? null;
    if (xElement !== null) {
      if (!XmlCAEXSchema.isSupportedRoleClass(xElement) && !XmlCAEXSchema.isRoleRequirement(xElement)) {
        if (!XmlCAEXSchema.isInternalElement(xElement)) {
          return null;
        }
        return xElement;
      }
      return xElement.parent;
    }
    return null;
  }

  private static createRoleReferenceList(mappingParent: XElement): XElement[] {
    const list: XElement[] = [];
    if (XmlCAEXSchema.isSupportedRoleClass(mappingParent) || XmlCAEXSchema.isRoleRequirement(mappingParent)) {
      list.push(mappingParent);
    } else if (XmlCAEXSchema.isInternalElement(mappingParent)) {
      const list2 = roleReferenceChildren(mappingParent);
      if (list2.length > 0) {
        list.push(...list2);
      }
    }
    return list;
  }

  private static findRoleAttributeValue(mappingElement: XElement): string | null {
    switch (mappingElement.name.localName) {
      case 'AttributeNameMapping':
        return mappingElement.attribute('RoleAttributeName')?.value ?? null;
      case 'InterfaceNameMapping':
        return mappingElement.attribute('RoleInterfaceName')?.value ?? null;
      case 'InterfaceIDMapping':
        return mappingElement.attribute('RoleInterfaceID')?.value ?? null;
      default:
        return '';
    }
  }
}
