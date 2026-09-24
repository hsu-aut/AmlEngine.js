// Port of Aml.Engine.CAEX.IInternalElementContainer (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXObject } from './ICAEXObject.js';
import type { InternalElementType } from './InternalElementType.js';
import type { InternalElementSequence } from './InternalElementSequence.js';

/** A container of InternalElements. */
export interface IInternalElementContainer extends ICAEXObject, Iterable<InternalElementType> {
  /** Gets the sequence of InternalElements. */
  readonly internalElement: InternalElementSequence;
}

registerInterfaceBases('IInternalElementContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
