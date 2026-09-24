// Port of Aml.Engine.CAEX.IInterfaceClassContainer (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { ICAEXObject } from './ICAEXObject.js';
import type { InterfaceFamilyType } from './InterfaceFamilyType.js';
import type { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';

/** A container of InterfaceClasses. */
export interface IInterfaceClassContainer extends ICAEXObject, Iterable<InterfaceFamilyType> {
  /** Gets the sequence of InterfaceClasses. */
  readonly interfaceClass: CAEXSequenceOfCAEXObjectsWithReference<InterfaceFamilyType>;
}

registerInterfaceBases('IInterfaceClassContainer', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');
