// Port of Aml.Engine.Adapter.LinkedObjects (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import type { ExternalInterfaceType } from '../caex/ExternalInterfaceType.js';
import type { InternalLinkType } from '../caex/InternalLinkType.js';
import type { SystemUnitClassType } from '../caex/SystemUnitClassType.js';

/**
 * The objects connected by an InternalLink.
 * @deprecated The properties are all directly supported in the InternalLinkType itself.
 */
export class LinkedObjects {
  constructor(internalLink: InternalLinkType) {
    this.internalLink = internalLink;
  }

  /** The InternalLink. */
  internalLink: InternalLinkType;

  /** @deprecated Use InternalLink.ASystemUnitClass. */
  get refPartnerSideAElement(): SystemUnitClassType | null {
    return this.internalLink.aSystemUnitClass;
  }

  /** @deprecated Use InternalLink.AInterface. */
  get refPartnerSideAExternalInterface(): ExternalInterfaceType | null {
    return this.internalLink.aInterface;
  }

  set refPartnerSideAExternalInterface(value: ExternalInterfaceType | null) {
    this.internalLink.aInterface = value;
  }

  /** @deprecated Use InternalLink.BSystemUnitClass. */
  get refPartnerSideBElement(): SystemUnitClassType | null {
    return this.internalLink.bSystemUnitClass;
  }

  /** @deprecated Use InternalLink.BInterface. */
  get refPartnerSideBExternalInterface(): ExternalInterfaceType | null {
    return this.internalLink.bInterface;
  }

  set refPartnerSideBExternalInterface(value: ExternalInterfaceType | null) {
    this.internalLink.bInterface = value;
  }

  toString(): string {
    // C# string concatenation: a null operand gives "".
    const a = this.refPartnerSideAElement;
    const b = this.refPartnerSideBElement;
    return 'RefSideA: ' + (a === null || a === undefined ? '' : a.toString()) + ', RefSideB: ' + (b === null || b === undefined ? '' : b.toString());
  }
}

T.LinkedObjects = LinkedObjects;
