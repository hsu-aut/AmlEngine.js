// Port of Aml.Engine.CAEX.IMultipleOccurrences<T> (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXBasicObject } from './ICAEXBasicObject.js';
import type { CAEXBasicObject } from './CAEXBasicObject.js';

/** A CAEX object which may occur multiple times as siblings. */
export interface IMultipleOccurrences<T extends CAEXBasicObject> extends ICAEXBasicObject {
  /** Inserts the provided CAEX object as a new sibling after this object. */
  insertAfter(caexObject: T | null): void;
  /** Inserts the provided CAEX object as a new sibling before this object. */
  insertBefore(caexObject: T | null): void;
}

registerInterfaceBases('IMultipleOccurrences', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
