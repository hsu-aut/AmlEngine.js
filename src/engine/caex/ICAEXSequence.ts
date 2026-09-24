// Port of Aml.Engine.CAEX.ICAEXSequence (Aml.Engine 4.5.2).

import type { ICAEXWrapper } from './ICAEXWrapper.js';

/** The C# tuple `(string Name, string Value)` of the attribute value indexer. */
export interface AttributeValuePair {
  readonly name: string;
  readonly value: string | null;
}

/**
 * The C# tuple `(string Name, object Value)` used by `Append`/`Prepend`: an array
 * `[name, value]` or an object `{ name, value }`.
 */
export type NameValueTuple = readonly [string, unknown] | { readonly name: string; readonly value: unknown };

/** This interface defines a sequence of CAEX elements. */
export interface ICAEXSequence {
  /** Gets a wrapper for the first CAEX element in this sequence, or `null`. */
  readonly first: ICAEXWrapper | null;

  /** Gets a wrapper for the last CAEX element in this sequence, or `null`. */
  readonly last: ICAEXWrapper | null;

  /** Indexers: by position, or by attribute value pair `{ name, value }`. */
  item(i: number): ICAEXWrapper | null;
  item(attributeValuePair: AttributeValuePair): ICAEXWrapper | null;

  /** Setter of the int indexer. */
  setItem(i: number, value: ICAEXWrapper | null): void;

  /** Creates a new CAEX object and appends it (optionally with attribute values). */
  append(...attributeValueTuples: NameValueTuple[]): ICAEXWrapper;

  /** Gets the CAEX object at the specified index. */
  at(index: number): ICAEXWrapper | null;

  /** Gets the enumerator for this sequence. */
  [Symbol.iterator](): Iterator<ICAEXWrapper>;

  /** Gets the index of the specified CAEX object in this sequence of elements. */
  indexOf(caexObject: ICAEXWrapper | null): number;

  /** Inserts the specified CAEX object into this sequence (prepended if `asFirst`, default). */
  insert(caexObject: ICAEXWrapper | null, asFirst?: boolean): unknown;

  /** Inserts the specified CAEX object into this sequence at the defined index. */
  insertAt(index: number, caexObject: ICAEXWrapper | null): unknown;

  /** Moves the CAEX object at the specified index to a new location in the collection. */
  move(oldIndex: number, newIndex: number): void;

  /** Creates a new CAEX object and prepends it (optionally with attribute values). */
  prepend(...attributeValueTuples: NameValueTuple[]): ICAEXWrapper;

  /** Removes the provided CAEX object from this sequence. */
  removeElement(caexObject: ICAEXWrapper): void;
}
