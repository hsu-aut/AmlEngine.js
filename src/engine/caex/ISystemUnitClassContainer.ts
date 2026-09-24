// Port of Aml.Engine.CAEX.ISystemUnitClassContainer (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXObject } from './ICAEXObject.js';
import type { SystemUnitFamilyType } from './SystemUnitFamilyType.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';

/** A container of SystemUnitClasses. */
export interface ISystemUnitClassContainer extends ICAEXObject, Iterable<SystemUnitFamilyType> {
  /** Gets the sequence of SystemUnitClasses. */
  readonly systemUnitClass: CAEXSequenceOfCAEXObjectsWithReference<SystemUnitFamilyType>;
}

registerInterfaceBases('ISystemUnitClassContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
