// Port of Aml.Engine.CAEX.Extensions.StringExtensions (Aml.Engine 4.5.2).

import { isNullOrEmpty } from '../../../system/strings.js';
import { Guid } from '../../../system/Guid.js';
import { CAEXDocument_CAEXSchema } from '../CAEXDocument.js';
import { CAEXPathBuilder } from './CAEXPathBuilder.js';

/** Extension methods for strings used as CAEX references. */
export class StringExtensions {
  private constructor() {}

  /** Determines whether the attribute name is a class reference attribute name. */
  static isClassReference(attributeName: string | null): boolean {
    switch (attributeName) {
      case 'RefBaseClassPath':
      case 'RefBaseRoleClassPath':
      case 'RefAttributeType':
      case 'RefBaseSystemUnitPath':
      case 'RefRoleClassPath':
        return true;
      default:
        return false;
    }
  }

  /** Determines whether the attribute name is an InternalLink partner attribute name. */
  static isInternalLinkAttribute(attributeName: string | null): boolean {
    if (attributeName === 'RefPartnerSideA' || attributeName === 'RefPartnerSideB') {
      return true;
    }
    return false;
  }

  /** Determines whether the string is a GUID (with `allowAnyString`, whether it is not empty). */
  static isGUID(stringGuid: string | null, allowAnyString = false): boolean {
    if (!isNullOrEmpty(stringGuid)) {
      if (!allowAnyString) {
        return guidTryParseToD(stringGuid) !== null;
      }
      return true;
    }
    return false;
  }

  /** Determines whether the path is an interface path (CAEX 2.15, exactly one ':'). */
  static isInterfacePath(path: string | null): boolean {
    if (!isNullOrEmpty(path) && path.includes(':')) {
      return path.split(':').length === 2;
    }
    return false;
  }

  /** Determines whether the path references an interface of the object with the provided ID. */
  static isInterfacePathWithID(path: string, id: string, schema: CAEXDocument_CAEXSchema): boolean {
    if (schema !== CAEXDocument_CAEXSchema.CAEX2_15) {
      return StringExtensions.normalizedGUID(path) === StringExtensions.normalizedGUID(id);
    }
    if (!path.includes(':')) {
      return false;
    }
    const array = CAEXPathBuilder.pathNameArray(path, schema);
    if (array.length === 2) {
      return array[0] === id;
    }
    return false;
  }

  /** Determines whether the path references an interface with the provided name (CAEX 2.15 only). */
  static isInterfacePathWithInterface(path: string, interfaceName: string | null, schema: CAEXDocument_CAEXSchema): boolean {
    if (schema !== CAEXDocument_CAEXSchema.CAEX2_15) {
      return false;
    }
    if (!path.includes(':')) {
      return false;
    }
    const array = CAEXPathBuilder.pathNameArray(path, schema);
    if (array.length === 2) {
      return array[1] === interfaceName;
    }
    return false;
  }

  /** Returns the GUID in the normalized 'D' format, or the string itself if it is no GUID. */
  static normalizedGUID(stringGuid: string | null): string {
    if (!isNullOrEmpty(stringGuid)) {
      if (stringGuid.length !== 36 || stringGuid[8] !== '-') {
        const result = guidTryParseToD(stringGuid);
        if (result === null) {
          return stringGuid;
        }
        return result;
      }
      return stringGuid;
    }
    return '';
  }
}

/** Guid.TryParse(s, out g) followed by g.ToString("D"); null when parsing fails. */
function guidTryParseToD(input: string | null): string | null {
  return Guid.tryParse(input)?.toString('D') ?? null;
}
