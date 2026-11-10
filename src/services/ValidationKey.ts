// Port of Aml.Engine.Services.ValidationKey (Aml.Engine.Services 4.3.1).
//
// C# derives ValidationKey from Tuple<string, ValidationTypeEnum>. The Tuple members are part of
// the class here: item1 and item2, structural equality (equals/equalityKey) and toString.

import '../engine/index.js';
import { ValidationTypeEnum } from './ValidationTypeEnum.js';

/** The key of a validation issue: the validated value and the kind of the validation. */
export class ValidationKey {
  /** Tuple.Item1: the key. */
  readonly item1: string | null;

  /** Tuple.Item2: the type of the validation. */
  readonly item2: ValidationTypeEnum;

  /** Gets the key. */
  get key(): string | null {
    return this.item1;
  }

  /** Gets the type of the validation. */
  get validationType(): ValidationTypeEnum {
    return this.item2;
  }

  /**
   * Initializes a new instance.
   * @param key The key.
   * @param validationType Type of the validation.
   */
  constructor(key: string | null, validationType: ValidationTypeEnum) {
    this.item1 = key;
    this.item2 = validationType;
  }

  /** Tuple.Equals: equal when both items are equal. */
  equals(obj: unknown): boolean {
    if (!(obj instanceof ValidationKey)) {
      return false;
    }
    return this.item1 === obj.item1 && this.item2 === obj.item2;
  }

  /** Tuple.GetHashCode: a key built from both items. */
  equalityKey(): unknown {
    return JSON.stringify([this.item1, this.item2]);
  }

  /** Tuple.ToString: "(key, ValidationType)". */
  toString(): string {
    return `(${this.item1 ?? ''}, ${ValidationTypeEnum[this.item2] ?? String(this.item2)})`;
  }
}
