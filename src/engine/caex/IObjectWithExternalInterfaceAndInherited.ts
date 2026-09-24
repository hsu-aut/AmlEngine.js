// Port of Aml.Engine.CAEX.IObjectWithExternalInterfaceAndInherited (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { IObjectWithExternalInterface } from './IObjectWithExternalInterface.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';

/** A CAEX object with external interfaces, including inherited ones. */
export interface IObjectWithExternalInterfaceAndInherited extends IObjectWithExternalInterface {
  /** Gets the external interfaces including the inherited ones. */
  readonly externalInterfaceAndInherited: Iterable<ExternalInterfaceType>;
}

registerInterfaceBases(
  'IObjectWithExternalInterfaceAndInherited',
  'IObjectWithExternalInterface',
  'IObjectWithAttributes',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
);
