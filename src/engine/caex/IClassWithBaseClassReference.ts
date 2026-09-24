// Port of Aml.Engine.CAEX.IClassWithBaseClassReference and IClassWithBaseClassReference<T> (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { IObjectWithAttributes } from './IObjectWithAttributes.js';
import type { ICAEXObject } from './ICAEXObject.js';
import type { CAEXObject } from './CAEXObject.js';

/** A CAEX class which can reference a base class. */
export interface IClassWithBaseClassReference extends IObjectWithAttributes, ICAEXObject {
  /** Gets and sets the reference path to the base class. */
  refBaseClassPath: string | null;
  /** Gets the name of the referenced class. */
  readonly referencedClassName: string | null;
  /**
   * C# Queue<T> GetReferenceHierarchy<T>(bool includeExternals = true) (and, in the generic
   * interface, IEnumerable<T> GetReferenceHierarchy(bool)); the exact signature is left to the
   * implementing classes.
   */
  getReferenceHierarchy(...args: never[]): Iterable<unknown>;
}

/** Generic twin IClassWithBaseClassReference<T>. */
export interface IClassWithBaseClassReference_1<T extends CAEXObject> extends IClassWithBaseClassReference {
  /** Gets and sets the base class. */
  baseClass: T | null;
}

registerInterfaceBases(
  'IClassWithBaseClassReference',
  'IObjectWithAttributes',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
  'ICAEXObject',
);
registerInterfaceBases(
  'IClassWithBaseClassReference_1',
  'IClassWithBaseClassReference',
  'IObjectWithAttributes',
  'ICAEXBasicObject',
  'ICAEXWrapper',
  'IXMLWrapper',
  'ICAEXObject',
);
