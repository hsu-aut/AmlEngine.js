// Port of Aml.Engine.CAEX.ExternalInterfaceSequence (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from, type Enumerable } from '../../system/linq.js';
import type { XElement } from '../../xml/index.js';
import { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';
import type { CAEXWrapper } from './CAEXWrapper.js';

/** The sequence of ExternalInterface elements of a CAEX object. */
export class ExternalInterfaceSequence extends CAEXSequenceOfCAEXObjectsWithReference<ExternalInterfaceType> {
  /**
   * Initializes a new instance.
   * @param owner The owner.
   * @param create The constructor function.
   * @param getCAEXOwner If set, the caexOwner is provided by this function.
   */
  constructor(owner: XElement | null, create: (e: XElement) => ExternalInterfaceType, getCAEXOwner: (() => CAEXWrapper | null) | null = null) {
    super(owner, 'ExternalInterface', create, getCAEXOwner);
  }

  /** Gets the external interfaces of this sequence and all their nested interfaces. */
  externalInterfaceDescandantsAndSelf(): Enumerable<ExternalInterfaceType> {
    return from<ExternalInterfaceType>(this).concat(
      from<ExternalInterfaceType>(this).selectMany((e) => e.externalInterface.externalInterfaceDescandantsAndSelf()),
    );
  }
}

T.ExternalInterfaceSequence = ExternalInterfaceSequence;
