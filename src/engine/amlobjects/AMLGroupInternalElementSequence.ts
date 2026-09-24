// Port of Aml.Engine.AmlObjects.AMLGroupInternalElementSequence (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { InternalElementSequence } from '../caex/InternalElementSequence.js';
import { AmlObjectsExtensions } from './extensions/AmlObjectsExtensions.js';
import type { CAEXWrapper } from '../caex/CAEXWrapper.js';
import type { InternalElementType } from '../caex/InternalElementType.js';
import type { XElement } from '../../xml/index.js';

/**
 * Supports the AMLGroup concept: an AMLGroup object shall only contain InternalElements which are
 * AMLMirrorObjects and/or further AMLGroup objects.
 */
export class AMLGroupInternalElementSequence extends InternalElementSequence {
  /**
   * Initializes a new instance.
   * @param owner The owner.
   * @param create Function to create an InternalElementType.
   * @param getCAEXOwner If set, the CAEXOwner is provided by this function.
   */
  constructor(owner: XElement | null, create: (e: XElement) => InternalElementType, getCAEXOwner: (() => CAEXWrapper | null) | null = null) {
    super(owner, create, getCAEXOwner);
  }

  /**
   * Inserts the specified InternalElement into this sequence. If the owner is an AMLGroup, only
   * mirror objects and AMLGroup objects are inserted; otherwise the result is `null`.
   * @param internalElement The InternalElement.
   * @param asFirst If `true` (default) the element is prepended, otherwise appended.
   * @param asIs If `true`, IDs and names of the inserted element are unchanged.
   * @returns The inserted InternalElement.
   */
  override insert(internalElement: InternalElementType | null, asFirst = true, asIs = false): InternalElementType | null {
    if (new T.AMLGroup(this.owner).isGroup) {
      if (internalElement!.isMirror || AmlObjectsExtensions.isAMLGroup(internalElement!)) {
        return super.insert(internalElement, asFirst, asIs);
      }
      return null;
    }
    return super.insert(internalElement, asFirst, asIs);
  }
}

T.AMLGroupInternalElementSequence = AMLGroupInternalElementSequence;
