// Port of Aml.Engine.Services.EmptyLookup<TKey, TElement> (Aml.Engine 4.5.2), together with the
// System.Linq ILookup/Lookup types the query service returns (src/system/linq.ts has no lookup).

import { Enumerable, type IGrouping } from '../../system/linq.js';

/**
 * System.Linq.ILookup<TKey, TElement>: groupings in insertion order of their first key.
 * `item(key)` is the indexer (an empty sequence for an unknown key), `count` the number of keys.
 * Keys compare like the default equality of strings (SameValueZero; null is a valid key).
 */
export interface ILookup<TKey, TElement> extends Iterable<IGrouping<TKey, TElement>> {
  readonly count: number;
  item(key: TKey): Enumerable<TElement>;
  contains(key: TKey): boolean;
}

class LookupGrouping<K, T> extends Enumerable<T> implements IGrouping<K, T> {
  constructor(
    readonly key: K,
    readonly items: T[],
  ) {
    super(() => items[Symbol.iterator]());
  }
}

/** System.Linq.Lookup: the result of ToLookup. */
export class Lookup<TKey, TElement> implements ILookup<TKey, TElement> {
  private readonly groups = new Map<TKey, LookupGrouping<TKey, TElement>>();

  get count(): number {
    return this.groups.size;
  }

  item(key: TKey): Enumerable<TElement> {
    const g = this.groups.get(key);
    return g ?? Enumerable.empty<TElement>();
  }

  contains(key: TKey): boolean {
    return this.groups.has(key);
  }

  /** @internal */
  _add(key: TKey, element: TElement): void {
    let g = this.groups.get(key);
    if (g === undefined) {
      g = new LookupGrouping<TKey, TElement>(key, []);
      this.groups.set(key, g);
    }
    g.items.push(element);
  }

  [Symbol.iterator](): Iterator<IGrouping<TKey, TElement>> {
    return this.groups.values();
  }
}

/** Enumerable.ToLookup(source, keySelector, elementSelector): evaluated immediately. */
export function toLookup<TSource, TKey, TElement>(
  source: Iterable<TSource>,
  keySelector: (x: TSource) => TKey,
  elementSelector: (x: TSource) => TElement,
): Lookup<TKey, TElement> {
  const lookup = new Lookup<TKey, TElement>();
  for (const x of source) {
    lookup._add(keySelector(x), elementSelector(x));
  }
  return lookup;
}

const emptyInstance = new Lookup<unknown, unknown>();

/** Provides an empty lookup. */
export class EmptyLookup {
  private constructor() {}

  /** The empty lookup instance (one instance for all type arguments). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static get instance(): ILookup<any, any> {
    return emptyInstance;
  }

  /** The key selector used to create the empty lookup: returns default(TKey) (null). */
  static get keySelector(): (x: unknown) => null {
    return () => null;
  }
}
