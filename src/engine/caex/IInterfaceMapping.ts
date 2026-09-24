// Port of Aml.Engine.CAEX.IInterfaceMapping (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { IMapping } from './IMapping.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';

/** A mapping between a role interface and a system unit interface. */
export interface IInterfaceMapping extends IMapping {
  /** Gets and sets the role interface. */
  roleInterface: ExternalInterfaceType | null;
  /** Gets and sets the system unit interface. */
  systemUnitInterface: ExternalInterfaceType | null;
}

registerInterfaceBases('IInterfaceMapping', 'IMapping', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
