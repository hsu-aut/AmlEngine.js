// Port of Aml.Engine.CAEX.ICAEXContainer (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { CAEXWrapper } from './CAEXWrapper.js';

/** A CAEX object which can contain other CAEX objects. */
export interface ICAEXContainer extends ICAEXWrapper {
  /** Inserts the CAEX object in its associated sequence. */
  insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
}

registerInterfaceBases('ICAEXContainer', 'ICAEXWrapper', 'IXMLWrapper');
