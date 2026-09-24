// Port of Aml.Engine.CAEX.ICAEXLibrary (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXObject } from './ICAEXObject.js';

/** Marker interface for CAEX libraries (no own members). */
export type ICAEXLibrary = ICAEXObject;

registerInterfaceBases('ICAEXLibrary', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
