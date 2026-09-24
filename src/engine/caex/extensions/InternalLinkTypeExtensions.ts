// Port of Aml.Engine.CAEX.Extensions.InternalLinkTypeExtensions (Aml.Engine 4.5.2).
// The partner references are split at ':' (CAEX 2.15 syntax "ID:InterfaceName").

import type { InternalLinkType } from '../InternalLinkType.js';

/** Extension methods for InternalLinks. */
export class InternalLinkTypeExtensions {
  private constructor() {}

  /** Gets the interface part of RefPartnerSideA ("" if not of the form "a:b"). */
  static getRefPartnerSideAExternalInterfaceId(internalLink: InternalLinkType): string {
    const array = (internalLink.refPartnerSideA as string).split(':');
    if (!(array.length > 0) || array.length !== 2) {
      return '';
    }
    return array[1];
  }

  /** Gets the element part of RefPartnerSideA. */
  static getRefPartnerSideAInternalElementId(internalLink: InternalLinkType): string {
    return (internalLink.refPartnerSideA as string).split(':')[0] ?? '';
  }

  /** Gets the interface part of RefPartnerSideB ("" if not of the form "a:b"). */
  static getRefPartnerSideBExternalInterfaceId(internalLink: InternalLinkType): string {
    const array = (internalLink.refPartnerSideB as string).split(':');
    if (!(array.length > 0) || array.length !== 2) {
      return '';
    }
    return array[1];
  }

  /** Gets the element part of RefPartnerSideB. */
  static getRefPartnerSideBInternalElementId(internalLink: InternalLinkType): string {
    return (internalLink.refPartnerSideB as string).split(':')[0] ?? '';
  }

  /** Sets the interface part of RefPartnerSideA (only for references of the form "a:b"). */
  static setRefPartnerSideAExternalInterfaceId(internalLink: InternalLinkType, id: string | null): void {
    const array: (string | null)[] = (internalLink.refPartnerSideA as string).split(':');
    if (array.length > 0 && array.length === 2) {
      array[1] = id;
      internalLink.refPartnerSideA = joinParts(array);
    }
  }

  /** Sets the element part of RefPartnerSideA. */
  static setRefPartnerSideAInternalElementId(internalLink: InternalLinkType, id: string | null): void {
    const array: (string | null)[] = (internalLink.refPartnerSideA as string).split(':');
    if (array.length > 0) {
      array[0] = id;
      internalLink.refPartnerSideA = joinParts(array);
    }
  }

  /** Sets the interface part of RefPartnerSideB (only for references of the form "a:b"). */
  static setRefPartnerSideBExternalInterfaceId(internalLink: InternalLinkType, id: string | null): void {
    const array: (string | null)[] = (internalLink.refPartnerSideB as string).split(':');
    if (array.length > 0 && array.length === 2) {
      array[1] = id;
      internalLink.refPartnerSideB = joinParts(array);
    }
  }

  /** Sets the element part of RefPartnerSideB. */
  static setRefPartnerSideBInternalElementId(internalLink: InternalLinkType, id: string | null): void {
    const array: (string | null)[] = (internalLink.refPartnerSideB as string).split(':');
    if (array.length > 0) {
      array[0] = id;
      internalLink.refPartnerSideB = joinParts(array);
    }
  }
}

/** string.Join(":", array) (null items are empty). */
function joinParts(array: (string | null)[]): string {
  return array.map((p) => p ?? '').join(':');
}
