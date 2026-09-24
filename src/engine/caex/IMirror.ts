// Port of Aml.Engine.CAEX.IMirror and IMirror<T> (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXObject } from './ICAEXObject.js';
import type { CAEXObject } from './CAEXObject.js';

/** A CAEX object which can be a mirror of a master object. */
export interface IMirror extends ICAEXObject {
  /** Determines if this is a master (has mirrors). */
  readonly isMaster: boolean;
  /** Determines if this is a mirror. */
  readonly isMirror: boolean;
  /** Gets the master of this mirror. */
  readonly master: CAEXObject | null;
  /** Gets the ID of the master. */
  readonly masterID: string | null;
  /** Creates a mirror of this object. */
  createMirror(): CAEXObject | null;
}

/** Generic twin IMirror<T> (C# where T : ICAEXObject; all implementations use CAEX classes). */
export interface IMirror_1<T extends CAEXObject> extends IMirror {
  /** Gets the master of this mirror. */
  readonly master: T | null;
  /** Creates a mirror of this object. */
  createMirror(): T | null;
}

registerInterfaceBases('IMirror', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
registerInterfaceBases('IMirror_1', 'IMirror', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
