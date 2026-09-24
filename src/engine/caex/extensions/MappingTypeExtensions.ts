// Port of Aml.Engine.CAEX.Extensions.MappingTypeExtensions (Aml.Engine 4.5.2).

import type { AttributeNameMappingType } from '../AttributeNameMappingType.js';
import type { ExternalInterfaceType } from '../ExternalInterfaceType.js';
import type { InterfaceIDMappingType } from '../InterfaceIDMappingType.js';
import type { InterfaceNameMappingType } from '../InterfaceNameMappingType.js';
import type { MappingType } from '../MappingType.js';

/** Extension methods for MappingObjects. */
export class MappingTypeExtensions {
  private constructor() {}

  /** Inserts the attribute name mapping (obsolete: use insert). */
  static insert_AttributeNameMapping(mappingObject: MappingType, attributeNameMapping: AttributeNameMappingType): void {
    mappingObject.insert(attributeNameMapping, false);
  }

  /** Inserts the interface name mapping (obsolete: use insert). */
  static insert_InterfaceNameMapping(mappingObject: MappingType, interfaceNameMapping: InterfaceNameMappingType): void {
    mappingObject.insert(interfaceNameMapping, false);
  }

  /** Appends a new attribute name mapping. */
  static new_AttributeNameMapping(
    mappingObject: MappingType,
    systemUnitAttributeName: string | null,
    roleAttributeName: string | null,
  ): AttributeNameMappingType {
    const attributeNameMappingType = mappingObject.attributeNameMapping.append();
    attributeNameMappingType.systemUnitAttributeName = systemUnitAttributeName;
    attributeNameMappingType.roleAttributeName = roleAttributeName;
    return attributeNameMappingType;
  }

  /** Appends a new interface ID mapping (by interface IDs or by interfaces). */
  static new_InterfaceIDMapping(mappingObject: MappingType, systemUnitInterfaceID: string | null, roleInterfaceID: string | null): InterfaceIDMappingType;
  static new_InterfaceIDMapping(
    mappingObject: MappingType,
    systemUnitInterface: ExternalInterfaceType | null,
    roleInterface: ExternalInterfaceType | null,
  ): InterfaceIDMappingType;
  static new_InterfaceIDMapping(
    mappingObject: MappingType,
    systemUnit: string | ExternalInterfaceType | null,
    role: string | ExternalInterfaceType | null,
  ): InterfaceIDMappingType {
    const interfaceIDMappingType = mappingObject.interfaceIDMapping.append();
    if (typeof systemUnit === 'string' || typeof role === 'string' || (systemUnit == null && role == null)) {
      interfaceIDMappingType.systemUnitInterfaceID = systemUnit as string | null;
      interfaceIDMappingType.roleInterfaceID = role as string | null;
    } else {
      interfaceIDMappingType.systemUnitInterface = systemUnit as ExternalInterfaceType | null;
      interfaceIDMappingType.roleInterface = role as ExternalInterfaceType | null;
    }
    return interfaceIDMappingType;
  }

  /** Appends a new interface name mapping. */
  static new_InterfaceNameMapping(
    mappingObject: MappingType,
    systemUnitInterfaceName: string | null,
    roleInterfaceName: string | null,
  ): InterfaceNameMappingType {
    const interfaceNameMappingType = mappingObject.interfaceNameMapping.append();
    interfaceNameMappingType.systemUnitInterfaceName = systemUnitInterfaceName;
    interfaceNameMappingType.roleInterfaceName = roleInterfaceName;
    return interfaceNameMappingType;
  }
}
