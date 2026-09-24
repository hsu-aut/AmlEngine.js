// Port of Aml.Engine.CAEX.Extensions.InstanceHierarchyTypeExtensions (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import { CAEXBasicObjectExtensions } from './CAEXBasicObjectExtensions.js';
import type { InstanceHierarchyType } from '../InstanceHierarchyType.js';
import type { InternalElementType } from '../InternalElementType.js';

/** Extension methods for InstanceHierarchies. */
export class InstanceHierarchyTypeExtensions {
  private constructor() {}

  /** All InternalElements of the hierarchy (obsolete: use descendants). */
  static internalElementDescendants(instanceHierarchy: InstanceHierarchyType): Iterable<InternalElementType> {
    return CAEXBasicObjectExtensions.descendants(instanceHierarchy, T.InternalElementType);
  }
}
