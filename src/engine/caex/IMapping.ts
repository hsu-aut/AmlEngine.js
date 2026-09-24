// Port of Aml.Engine.CAEX.IMapping (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXBasicObject } from './ICAEXBasicObject.js';
import type { MappingType } from './MappingType.js';

/** A CAEX object with a MappingObject. */
export interface IMapping extends ICAEXBasicObject {
  /** Gets the mapping object. */
  readonly mappingObject: MappingType | null;
}

registerInterfaceBases('IMapping', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
