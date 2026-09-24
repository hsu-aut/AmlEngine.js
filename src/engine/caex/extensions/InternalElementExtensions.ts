// Port of Aml.Engine.CAEX.Extensions.InternalElementExtensions (Aml.Engine 4.5.2).

import { ServiceLocator } from '../../services/ServiceLocator.js';
import { XmlClassOperation } from '../../xmlext/XmlClassOperation.js';
import { ChangeMode } from '../ChangeMode.js';
import type { InternalElementType } from '../InternalElementType.js';

/** Extension methods for InternalElements. */
export class InternalElementExtensions {
  private constructor() {}

  /** Determines whether the InternalElement is a master (has mirrors). */
  static isMaster(element: InternalElementType): boolean {
    return ServiceLocator.queryService!.isMaster(element);
  }

  /** Determines whether the InternalElement overrides an inherited element. */
  static isOverridden(internalElement: InternalElementType): boolean {
    return XmlClassOperation.isOverridden(internalElement.node!);
  }

  /** Determines whether the InternalElement overrides and deletes an inherited element. */
  static isOverriddenDeleted(internalElement: InternalElementType): boolean {
    if (XmlClassOperation.isOverridden(internalElement.node!)) {
      return internalElement.changeMode === ChangeMode.Delete;
    }
    return false;
  }
}
