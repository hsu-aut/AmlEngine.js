// Port of Aml.Engine.CAEX.ICAEXObject (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXBasicObject } from './ICAEXBasicObject.js';

/** Interface for CAEX objects with Name and ID. */
export interface ICAEXObject extends ICAEXBasicObject {
  /** Gets and sets the unique identifier (optional in CAEX). */
  id: string | null;
  /** Gets and sets the name (required in CAEX). */
  name: string | null;
  /** Gets the CAEX path for this object. */
  caexPath(): string | null;
}

registerInterfaceBases('ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
