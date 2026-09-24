// Port of Aml.Engine.CAEX.IInstantiable and IInstantiable<TINSTANCE> (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXObject } from './ICAEXObject.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { CAEXBasicObject } from './CAEXBasicObject.js';
import type { CAEXDocument } from './CAEXDocument.js';

/** A class which can be instantiated. */
export interface IInstantiable extends ICAEXObject {
  /** Creates an instance of this class. */
  createClassInstance(document?: CAEXDocument | null): CAEXWrapper | null;
}

/** Generic twin IInstantiable<TINSTANCE>. */
export interface IInstantiable_1<TINSTANCE extends CAEXBasicObject> extends IInstantiable {
  /** Creates an instance of this class. */
  createClassInstance(document?: CAEXDocument | null): TINSTANCE | null;
}

registerInterfaceBases('IInstantiable', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
registerInterfaceBases('IInstantiable_1', 'IInstantiable', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
