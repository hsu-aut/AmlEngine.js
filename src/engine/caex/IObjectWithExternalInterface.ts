// Port of Aml.Engine.CAEX.IObjectWithExternalInterface (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { IObjectWithAttributes } from './IObjectWithAttributes.js';
import type { ExternalInterfaceSequence } from './ExternalInterfaceSequence.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';

/** A CAEX object with external interfaces. */
export interface IObjectWithExternalInterface extends IObjectWithAttributes {
  /** Gets the collection of ExternalInterface objects. */
  readonly externalInterface: ExternalInterfaceSequence;
  /** Gets the external interfaces and all nested interfaces. */
  readonly externalInterfaceAndDescendants: Iterable<ExternalInterfaceType>;
}

registerInterfaceBases('IObjectWithExternalInterface', 'IObjectWithAttributes', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
