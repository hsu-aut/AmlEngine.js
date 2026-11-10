// Port of Aml.Engine.Services.Lookup.ElementWithReference (Aml.Engine.Services 4.3.1).
//
// A C# `record struct`: value equality (equals/equalityKey), the synthesized ToString and
// Deconstruct, and the implicit conversions from and to the tuple (Element, RefType). As a
// struct it is copied on assignment in C#; the lookup tables only create and read it.

import '../../engine/index.js';
import type { XElement } from '../../xml/index.js';
import { LookupTables_ReferenceTypeEnum } from './LookupTables.js';

/** An element together with the kinds of references it defines. */
export class ElementWithReference {
  element: XElement | null;

  refType: LookupTables_ReferenceTypeEnum;

  constructor(element: XElement | null, refType: LookupTables_ReferenceTypeEnum) {
    this.element = element;
    this.refType = refType;
  }

  /** Implicit conversion to the tuple (Element, RefType). */
  toTuple(): { element: XElement | null; refType: LookupTables_ReferenceTypeEnum } {
    return { element: this.element, refType: this.refType };
  }

  /** Implicit conversion from the tuple (Element, RefType). */
  static fromTuple(value: { element: XElement | null; refType: LookupTables_ReferenceTypeEnum }): ElementWithReference {
    return new ElementWithReference(value.element, value.refType);
  }

  /** Deconstruct(out Element, out RefType). */
  deconstruct(): { element: XElement | null; refType: LookupTables_ReferenceTypeEnum } {
    return { element: this.element, refType: this.refType };
  }

  /** Value equality of the record struct (the XElement compares by reference). */
  equals(other: unknown): boolean {
    return other instanceof ElementWithReference && other.element === this.element && other.refType === this.refType;
  }

  /** GetHashCode: equal values have the same element. */
  equalityKey(): unknown {
    return this.element;
  }

  /** The ToString of a record: "ElementWithReference { Element = ..., RefType = ... }". */
  toString(): string {
    return `ElementWithReference { Element = ${this.element?.toString() ?? ''}, RefType = ${flagsToString(this.refType)} }`;
  }
}

/** Enum.ToString of the [Flags] enum ReferenceTypeEnum. */
function flagsToString(value: LookupTables_ReferenceTypeEnum): string {
  if (value === LookupTables_ReferenceTypeEnum.None) {
    return 'None';
  }
  const names: string[] = [];
  let rest = value as number;
  for (const flag of [LookupTables_ReferenceTypeEnum.Path, LookupTables_ReferenceTypeEnum.ID, LookupTables_ReferenceTypeEnum.Name]) {
    if ((rest & flag) === flag) {
      names.push(LookupTables_ReferenceTypeEnum[flag]!);
      rest &= ~flag;
    }
  }
  return rest !== 0 ? String(value) : names.join(', ');
}
