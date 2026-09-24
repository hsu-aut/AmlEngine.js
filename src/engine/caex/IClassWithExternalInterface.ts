// Port of Aml.Engine.CAEX.IClassWithExternalInterface (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { IClassWithBaseClassReference } from './IClassWithBaseClassReference.js';
import type { IObjectWithExternalInterfaceAndInherited } from './IObjectWithExternalInterfaceAndInherited.js';

/** A class with base class reference and external interfaces (no own members). */
export type IClassWithExternalInterface = IClassWithBaseClassReference & IObjectWithExternalInterfaceAndInherited;

registerInterfaceBases(
  'IClassWithExternalInterface',
  'IClassWithBaseClassReference',
  'IObjectWithAttributes',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
  'ICAEXObject',
  'IObjectWithExternalInterfaceAndInherited',
  'IObjectWithExternalInterface',
);
