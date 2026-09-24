// Port of Aml.Engine.CAEX.IInstance and IInstance<T> (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { IInstantiable } from './IInstantiable.js';

/** An instance of a class. */
export interface IInstance {
  /** Updates the instance from its class. */
  updateInstance(): boolean;
}

/** Generic twin IInstance<T>. */
export interface IInstance_1<T extends IInstantiable> extends IInstance {
  /** Gets and sets the class of the instance. */
  class: T | null;
}

registerInterfaceBases('IInstance_1', 'IInstance');
