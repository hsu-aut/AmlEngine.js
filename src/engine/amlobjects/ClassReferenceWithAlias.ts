// Port of Aml.Engine.AmlObjects.ClassReferenceWithAlias (Aml.Engine 4.5.2).

import { isNullOrEmpty } from '../../system/strings.js';

/** Supports the building of class references, containing an alias. */
export class ClassReferenceWithAlias {
  private constructor() {}

  /**
   * Creates a class reference string containing the alias.
   * @param classReference The original class reference.
   * @param alias Alias string (can be null).
   * @returns The class reference, containing the alias name.
   */
  static classReference(classReference: string, alias: string | null = null): string {
    if (!isNullOrEmpty(alias)) {
      return alias + '@' + classReference;
    }
    return classReference;
  }
}
