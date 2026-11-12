// System.Linq for the port: a lazy, generator based Enumerable with the C# semantics the engine
// relies on (deferred execution, First/Single exceptions, default equality via Equals).
//
// Equality: C# LINQ uses EqualityComparer<T>.Default, i.e. the virtual Equals. The port mirrors
// that: objects with an `equals(other)` method are compared with it, and objects with an
// `equalityKey()` method are hashed by that key (CAEXWrapper returns its XElement, matching its
// Equals/GetHashCode). Everything else uses SameValueZero, like a JS Map.

import { ArgumentException, ArgumentNullException, ArgumentOutOfRangeException, InvalidOperationException, KeyNotFoundException } from './exceptions.js';

export interface IEqualityComparer<T> {
  equals(a: T, b: T): boolean;
  /** Returns a value usable as Map key: equal items must return the same key (SameValueZero). */
  key(x: T): unknown;
}

interface Keyed {
  equalityKey(): unknown;
}

function hasEqualityKey(x: unknown): x is Keyed {
  return typeof x === 'object' && x !== null && typeof (x as Keyed).equalityKey === 'function';
}

/** EqualityComparer<T>.Default. */
export const DefaultComparer: IEqualityComparer<unknown> = {
  equals(a, b) {
    if (a === b) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;
    if (typeof a === 'object' && typeof (a as { equals?: unknown }).equals === 'function') {
      return (a as { equals(o: unknown): boolean }).equals(b);
    }
    if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
    return false;
  },
  key(x) {
    if (hasEqualityKey(x)) return x.equalityKey();
    if (typeof x === 'object' && x !== null && typeof (x as { getHashKey?: unknown }).getHashKey === 'function') {
      return (x as { getHashKey(): unknown }).getHashKey();
    }
    return x;
  },
};

function cmp<T>(c?: IEqualityComparer<T> | null): IEqualityComparer<T> {
  return (c ?? DefaultComparer) as IEqualityComparer<T>;
}

/**
 * The exception of .NET's collection enumerators (List<T>, Dictionary<TKey, TValue>, HashSet<T>)
 * when the collection was changed after the enumerator was created: MoveNext compares the version
 * the enumerator started with to the current version of the collection.
 */
function enumFailedVersion(): InvalidOperationException {
  return new InvalidOperationException('Collection was modified; enumeration operation may not execute.');
}

/**
 * HashSet<T> with a custom comparer (keys decide buckets, equals decides membership). Items live
 * in slots like the entries of .NET's HashSet: a removed slot goes onto a free list and the next
 * Add reuses the most recently freed slot, so enumeration order matches .NET after removals.
 * As in .NET, adding an item while the set is enumerated makes the next step of the enumeration
 * throw InvalidOperationException; Remove and Clear do not.
 */
export class HashSet<T> implements Iterable<T> {
  private readonly buckets = new Map<unknown, number[]>();
  private slots: (T | undefined)[] = [];
  private used: boolean[] = [];
  private freeList: number[] = [];
  private count_ = 0;
  private version = 0;

  constructor(
    items?: Iterable<T> | null,
    private readonly comparer: IEqualityComparer<T> = DefaultComparer as IEqualityComparer<T>,
  ) {
    if (items instanceof HashSet && items.comparer === comparer) {
      // HashSet(HashSet) with the same comparer copies the entries, free slots included.
      const src = items as HashSet<T>;
      for (const [k, b] of src.buckets) this.buckets.set(k, [...b]);
      this.slots = [...src.slots];
      this.used = [...src.used];
      this.freeList = [...src.freeList];
      this.count_ = src.count_;
    } else if (items) for (const x of items) this.add(x);
  }

  get count(): number {
    return this.count_;
  }

  add(x: T): boolean {
    const k = this.comparer.key(x);
    let b = this.buckets.get(k);
    if (b && b.some((i) => this.comparer.equals(this.slots[i] as T, x))) return false;
    const i = this.freeList.length > 0 ? this.freeList.pop()! : this.slots.length;
    this.slots[i] = x;
    this.used[i] = true;
    if (!b) this.buckets.set(k, (b = []));
    b.push(i);
    this.count_++;
    this.version++;
    return true;
  }

  contains(x: T): boolean {
    const b = this.buckets.get(this.comparer.key(x));
    return !!b && b.some((i) => this.comparer.equals(this.slots[i] as T, x));
  }

  remove(x: T): boolean {
    const k = this.comparer.key(x);
    const b = this.buckets.get(k);
    if (!b) return false;
    const j = b.findIndex((i) => this.comparer.equals(this.slots[i] as T, x));
    if (j < 0) return false;
    const i = b[j];
    b.splice(j, 1);
    if (b.length === 0) this.buckets.delete(k);
    this.slots[i] = undefined;
    this.used[i] = false;
    this.freeList.push(i);
    this.count_--;
    return true;
  }

  clear(): void {
    this.buckets.clear();
    this.slots = [];
    this.used = [];
    this.freeList = [];
    this.count_ = 0;
  }

  [Symbol.iterator](): IterableIterator<T> {
    return slotEnumerator(
      () => this.version,
      () => this.slots.length,
      (i) => this.used[i],
      (i) => this.slots[i] as T,
    );
  }
}

/**
 * The enumerator of .NET's Dictionary<TKey, TValue> and HashSet<T>: it takes the version of the
 * collection when it is created (not on its first step), and every step, also after the end,
 * throws when the version changed since. A step walks the slots up to the highest one ever used and
 * skips free ones.
 */
function slotEnumerator<R>(version: () => number, length: () => number, used: (i: number) => boolean, project: (i: number) => R): IterableIterator<R> {
  const start = version();
  let index = 0;
  const it: IterableIterator<R> = {
    next(): IteratorResult<R> {
      if (version() !== start) throw enumFailedVersion();
      while (index < length()) {
        const i = index++;
        if (used(i)) return { value: project(i), done: false };
      }
      index = length() + 1;
      return { value: undefined, done: true };
    },
    [Symbol.iterator]() {
      return it;
    },
  };
  return it;
}

/**
 * Dictionary<TKey, TValue> with a custom comparer, enumerated in the order of .NET: entries live
 * in slots, a removed slot goes onto a free list and the next Add reuses the most recently freed
 * slot (as HashSet above). A JS Map would append the new key at the end instead. Enumeration
 * yields `[key, value]` pairs (KeyValuePair).
 */
export class Dictionary<K, V> implements Iterable<[K, V]> {
  private readonly buckets = new Map<unknown, number[]>();
  private keys_: (K | undefined)[] = [];
  private values_: (V | undefined)[] = [];
  private used: boolean[] = [];
  private freeList: number[] = [];
  private count_ = 0;
  /** Changed by adding a key (not by replacing a value, Remove or Clear, as in .NET). */
  private version = 0;

  constructor(private readonly comparer: IEqualityComparer<K> = DefaultComparer as IEqualityComparer<K>) {}

  get count(): number {
    return this.count_;
  }

  private find(key: K): number {
    if (key === null || key === undefined) throw new ArgumentNullException('key');
    const b = this.buckets.get(this.comparer.key(key));
    if (!b) return -1;
    for (const i of b) if (this.comparer.equals(this.keys_[i] as K, key)) return i;
    return -1;
  }

  private insert(key: K, value: V, add: boolean): void {
    const i = this.find(key);
    if (i >= 0) {
      if (add) throw new ArgumentException(`An item with the same key has already been added. Key: ${String(key)}`);
      this.values_[i] = value;
      return;
    }
    const k = this.comparer.key(key);
    const slot = this.freeList.length > 0 ? this.freeList.pop()! : this.keys_.length;
    this.keys_[slot] = key;
    this.values_[slot] = value;
    this.used[slot] = true;
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = []));
    b.push(slot);
    this.count_++;
    this.version++;
  }

  /** Add(key, value): throws ArgumentException for an existing key. */
  add(key: K, value: V): void {
    this.insert(key, value, true);
  }

  /** The indexer getter: throws KeyNotFoundException for a missing key. */
  item(key: K): V {
    const i = this.find(key);
    if (i < 0) throw new KeyNotFoundException(`The given key '${String(key)}' was not present in the dictionary.`);
    return this.values_[i] as V;
  }

  /** The indexer setter: adds the key or replaces its value in place. */
  setItem(key: K, value: V): void {
    this.insert(key, value, false);
  }

  tryGetValue(key: K): { result: boolean; value: V | null } {
    const i = this.find(key);
    return i < 0 ? { result: false, value: null } : { result: true, value: this.values_[i] as V };
  }

  containsKey(key: K): boolean {
    return this.find(key) >= 0;
  }

  remove(key: K): boolean {
    const i = this.find(key);
    if (i < 0) return false;
    const k = this.comparer.key(key);
    const b = this.buckets.get(k)!;
    b.splice(b.indexOf(i), 1);
    if (b.length === 0) this.buckets.delete(k);
    this.keys_[i] = undefined;
    this.values_[i] = undefined;
    this.used[i] = false;
    this.freeList.push(i);
    this.count_--;
    return true;
  }

  clear(): void {
    this.buckets.clear();
    this.keys_ = [];
    this.values_ = [];
    this.used = [];
    this.freeList = [];
    this.count_ = 0;
  }

  /** The used slots in order; each step throws when a key was added since the enumerator was created. */
  private enumerate<R>(project: (i: number) => R): IterableIterator<R> {
    return slotEnumerator(
      () => this.version,
      () => this.keys_.length,
      (i) => this.used[i],
      project,
    );
  }

  keys(): IterableIterator<K> {
    return this.enumerate((i) => this.keys_[i] as K);
  }

  values(): IterableIterator<V> {
    return this.enumerate((i) => this.values_[i] as V);
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.enumerate((i) => [this.keys_[i] as K, this.values_[i] as V] as [K, V]);
  }
}

/**
 * List<T> with the enumeration check of .NET: every change of the list (Add, Insert, the indexer
 * setter, Remove and RemoveAt of an item, RemoveAll that removes something, Clear, AddRange of
 * items) makes the next step of an enumeration that started before it throw
 * InvalidOperationException, as foreach and LINQ over a List<T> do in C#. ForEach throws when the
 * action changed the list. Items compare with the default equality (Remove, IndexOf, Contains).
 */
export class List<T> implements Iterable<T> {
  private items: T[];
  private version = 0;

  constructor(items?: Iterable<T> | null) {
    this.items = items ? [...items] : [];
  }

  get count(): number {
    return this.items.length;
  }

  private checkIndex(index: number, size: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= size) {
      throw new ArgumentOutOfRangeException('index', 'Index was out of range. Must be non-negative and less than the size of the collection.');
    }
  }

  /** The indexer getter. */
  item(index: number): T {
    this.checkIndex(index, this.items.length);
    return this.items[index] as T;
  }

  /** The indexer setter. */
  setItem(index: number, value: T): void {
    this.checkIndex(index, this.items.length);
    this.items[index] = value;
    this.version++;
  }

  add(item: T): void {
    this.items.push(item);
    this.version++;
  }

  /**
   * List<T>.AddRange (.NET 8): a collection (ICollection<T>: an array, a List, a HashSet) is copied
   * at once, with one change of the version when it has items; any other sequence is enumerated and
   * every item added with Add, so a lazy query over this list fails on its next step after the
   * first Add.
   */
  addRange(items: Iterable<T>): void {
    if (items === null || items === undefined) throw new ArgumentNullException('collection');
    if (Array.isArray(items) || items instanceof List || items instanceof HashSet) {
      const copy: T[] = items instanceof List ? items.items.slice() : Array.isArray(items) ? items.slice() : [...items];
      if (copy.length > 0) {
        for (const item of copy) this.items.push(item);
        this.version++;
      }
      return;
    }
    for (const item of items) this.add(item);
  }

  insert(index: number, item: T): void {
    if (!Number.isInteger(index) || index < 0 || index > this.items.length) {
      throw new ArgumentOutOfRangeException('index', 'Index must be within the bounds of the List.');
    }
    this.items.splice(index, 0, item);
    this.version++;
  }

  indexOf(item: T): number {
    for (let i = 0; i < this.items.length; i++) if (DefaultComparer.equals(this.items[i], item)) return i;
    return -1;
  }

  contains(item: T): boolean {
    return this.indexOf(item) >= 0;
  }

  /** Removes the first occurrence of the item. */
  remove(item: T): boolean {
    const i = this.indexOf(item);
    if (i < 0) return false;
    this.removeAt(i);
    return true;
  }

  removeAt(index: number): void {
    this.checkIndex(index, this.items.length);
    this.items.splice(index, 1);
    this.version++;
  }

  removeAll(match: (item: T) => boolean): number {
    const kept = this.items.filter((x) => !match(x));
    const removed = this.items.length - kept.length;
    if (removed > 0) {
      this.items = kept;
      this.version++;
    }
    return removed;
  }

  /** List<T>.Clear: changes the version also when the list is empty (.NET 8). */
  clear(): void {
    this.items = [];
    this.version++;
  }

  /** List<T>.Find: the first matching item, or null (default). */
  find(match: (item: T) => boolean): T | null {
    for (const x of this.items) if (match(x)) return x;
    return null;
  }

  /** List<T>.ForEach: throws InvalidOperationException when the action changed the list. */
  forEach(action: (item: T) => void): void {
    const version = this.version;
    for (let i = 0; i < this.items.length; i++) {
      if (version !== this.version) break;
      action(this.items[i] as T);
    }
    if (version !== this.version) throw enumFailedVersion();
  }

  /** A copy of the items (ToArray, ToList). */
  toArray(): T[] {
    return [...this.items];
  }

  [Symbol.iterator](): Iterator<T> {
    // List<T>.GetEnumerator: the version is taken when the enumerator is created.
    const version = this.version;
    let index = 0;
    return {
      next: (): IteratorResult<T> => {
        if (this.version !== version) throw enumFailedVersion();
        if (index < this.items.length) return { value: this.items[index++] as T, done: false };
        index = this.items.length + 1;
        return { value: undefined, done: true };
      },
    };
  }
}

export interface IGrouping<K, T> extends Enumerable<T> {
  readonly key: K;
}

type Ctor<T> = abstract new (...args: never[]) => T;

/** Lazy sequence. Every operator returns a new Enumerable; nothing runs until iterated. */
export class Enumerable<T> implements Iterable<T> {
  constructor(private readonly source: () => Iterator<T>) {}

  static from<T>(iterable: Iterable<T> | null | undefined): Enumerable<T> {
    if (iterable === null || iterable === undefined) throw new ArgumentNullException('source');
    if (iterable instanceof Enumerable) return iterable;
    return new Enumerable(() => iterable[Symbol.iterator]());
  }

  static empty<T>(): Enumerable<T> {
    return new Enumerable<T>(() => [][Symbol.iterator]());
  }

  static range(start: number, count: number): Enumerable<number> {
    if (count < 0 || start + count - 1 > 2147483647) throw new ArgumentOutOfRangeException('count');
    return new Enumerable(function* () {
      for (let i = 0; i < count; i++) yield start + i;
    });
  }

  static repeat<T>(value: T, count: number): Enumerable<T> {
    if (count < 0) throw new ArgumentOutOfRangeException('count');
    return new Enumerable(function* () {
      for (let i = 0; i < count; i++) yield value;
    });
  }

  [Symbol.iterator](): Iterator<T> {
    return this.source();
  }

  // ---- projection and filtering -------------------------------------------------------------

  where(predicate: (x: T, i: number) => boolean): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      let i = 0;
      for (const x of src) if (predicate(x, i++)) yield x;
    });
  }

  select<R>(selector: (x: T, i: number) => R): Enumerable<R> {
    const src = this;
    return new Enumerable(function* () {
      let i = 0;
      for (const x of src) yield selector(x, i++);
    });
  }

  selectMany<R>(selector: (x: T, i: number) => Iterable<R>): Enumerable<R> {
    const src = this;
    return new Enumerable(function* () {
      let i = 0;
      for (const x of src) yield* selector(x, i++);
    });
  }

  /** OfType<C>(): items that are instances of the class (or satisfy the type guard). */
  ofType<R>(type: Ctor<R> | ((x: unknown) => x is R)): Enumerable<R> {
    const test = isCtor(type) ? (x: unknown) => x instanceof type : type;
    return this.where((x) => test(x)) as unknown as Enumerable<R>;
  }

  cast<R>(): Enumerable<R> {
    return this as unknown as Enumerable<R>;
  }

  // ---- element access -----------------------------------------------------------------------

  first(predicate?: (x: T) => boolean): T {
    for (const x of this) if (!predicate || predicate(x)) return x;
    throw new InvalidOperationException(predicate ? 'Sequence contains no matching element' : 'Sequence contains no elements');
  }

  firstOrDefault(predicate?: (x: T) => boolean): T | null {
    for (const x of this) if (!predicate || predicate(x)) return x;
    return null;
  }

  last(predicate?: (x: T) => boolean): T {
    let found = false;
    let last: T | undefined;
    for (const x of this) if (!predicate || predicate(x)) {
      found = true;
      last = x;
    }
    if (!found) throw new InvalidOperationException(predicate ? 'Sequence contains no matching element' : 'Sequence contains no elements');
    return last as T;
  }

  lastOrDefault(predicate?: (x: T) => boolean): T | null {
    let last: T | null = null;
    for (const x of this) if (!predicate || predicate(x)) last = x;
    return last;
  }

  single(predicate?: (x: T) => boolean): T {
    let found = false;
    let value: T | undefined;
    for (const x of this) {
      if (predicate && !predicate(x)) continue;
      if (found) throw new InvalidOperationException(predicate ? 'Sequence contains more than one matching element' : 'Sequence contains more than one element');
      found = true;
      value = x;
    }
    if (!found) throw new InvalidOperationException(predicate ? 'Sequence contains no matching element' : 'Sequence contains no elements');
    return value as T;
  }

  singleOrDefault(predicate?: (x: T) => boolean): T | null {
    let found = false;
    let value: T | null = null;
    for (const x of this) {
      if (predicate && !predicate(x)) continue;
      if (found) throw new InvalidOperationException(predicate ? 'Sequence contains more than one matching element' : 'Sequence contains more than one element');
      found = true;
      value = x;
    }
    return value;
  }

  elementAt(index: number): T {
    if (index >= 0) {
      let i = 0;
      for (const x of this) if (i++ === index) return x;
    }
    throw new ArgumentOutOfRangeException('index');
  }

  elementAtOrDefault(index: number): T | null {
    if (index < 0) return null;
    let i = 0;
    for (const x of this) if (i++ === index) return x;
    return null;
  }

  defaultIfEmpty(defaultValue: T | null = null): Enumerable<T | null> {
    const src = this;
    return new Enumerable(function* () {
      let any = false;
      for (const x of src) {
        any = true;
        yield x;
      }
      if (!any) yield defaultValue;
    });
  }

  // ---- quantifiers and aggregates -----------------------------------------------------------

  any(predicate?: (x: T) => boolean): boolean {
    for (const x of this) if (!predicate || predicate(x)) return true;
    return false;
  }

  all(predicate: (x: T) => boolean): boolean {
    for (const x of this) if (!predicate(x)) return false;
    return true;
  }

  contains(value: T, comparer?: IEqualityComparer<T> | null): boolean {
    const c = cmp(comparer);
    for (const x of this) if (c.equals(x, value)) return true;
    return false;
  }

  count(predicate?: (x: T) => boolean): number {
    let n = 0;
    for (const x of this) if (!predicate || predicate(x)) n++;
    return n;
  }

  sum(selector?: (x: T) => number): number {
    let s = 0;
    for (const x of this) s += selector ? selector(x) : (x as unknown as number);
    return s;
  }

  /**
   * Max: null values are skipped (Nullable<T> / reference types; null when there are only nulls),
   * NaN counts only when every value is NaN (Max(IEnumerable<double>)), other values are compared
   * with Comparer<T>.Default (defaultCompare). An empty sequence throws, as for value types; .NET
   * returns null for an empty sequence of a reference type, which the port cannot tell apart.
   */
  max<R = T>(selector?: (x: T) => R): R {
    let found = false;
    let sawNull = false;
    let m: R | undefined;
    for (const x of this) {
      const v = selector ? selector(x) : (x as unknown as R);
      if (v === null || v === undefined) {
        sawNull = true;
        continue;
      }
      if (!found) m = v;
      else if (typeof v === 'number' && typeof m === 'number') {
        if (Number.isNaN(m) || v > m) m = v;
      } else if (defaultCompare(v, m) > 0) m = v;
      found = true;
    }
    if (!found) {
      if (sawNull) return null as R;
      throw new InvalidOperationException('Sequence contains no elements');
    }
    return m as R;
  }

  /** Min: like max; a NaN is the minimum and ends the enumeration (Min(IEnumerable<double>)). */
  min<R = T>(selector?: (x: T) => R): R {
    let found = false;
    let sawNull = false;
    let m: R | undefined;
    for (const x of this) {
      const v = selector ? selector(x) : (x as unknown as R);
      if (v === null || v === undefined) {
        sawNull = true;
        continue;
      }
      if (typeof v === 'number' && Number.isNaN(v)) return v;
      if (!found) m = v;
      else if (typeof v === 'number' && typeof m === 'number') {
        if (v < m) m = v;
      } else if (defaultCompare(v, m) < 0) m = v;
      found = true;
    }
    if (!found) {
      if (sawNull) return null as R;
      throw new InvalidOperationException('Sequence contains no elements');
    }
    return m as R;
  }

  aggregate<A>(seed: A, func: (acc: A, x: T) => A): A {
    let acc = seed;
    for (const x of this) acc = func(acc, x);
    return acc;
  }

  sequenceEqual(other: Iterable<T>, comparer?: IEqualityComparer<T> | null): boolean {
    const c = cmp(comparer);
    const a = this[Symbol.iterator]();
    const b = other[Symbol.iterator]();
    for (;;) {
      const x = a.next();
      const y = b.next();
      if (x.done || y.done) return !!x.done && !!y.done;
      if (!c.equals(x.value, y.value)) return false;
    }
  }

  // ---- set operations -----------------------------------------------------------------------

  distinct(comparer?: IEqualityComparer<T> | null): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      const seen = new HashSet<T>(null, cmp(comparer));
      for (const x of src) if (seen.add(x)) yield x;
    });
  }

  except(other: Iterable<T>, comparer?: IEqualityComparer<T> | null): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      const seen = new HashSet<T>(other, cmp(comparer));
      for (const x of src) if (seen.add(x)) yield x;
    });
  }

  intersect(other: Iterable<T>, comparer?: IEqualityComparer<T> | null): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      const set = new HashSet<T>(other, cmp(comparer));
      for (const x of src) if (set.remove(x)) yield x;
    });
  }

  union(other: Iterable<T>, comparer?: IEqualityComparer<T> | null): Enumerable<T> {
    return this.concat(other).distinct(comparer);
  }

  concat(other: Iterable<T>): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      yield* src;
      yield* other;
    });
  }

  append(value: T): Enumerable<T> {
    return this.concat([value]);
  }

  prepend(value: T): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      yield value;
      yield* src;
    });
  }

  // ---- partitioning and ordering ------------------------------------------------------------

  skip(n: number): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      let i = 0;
      for (const x of src) if (i++ >= n) yield x;
    });
  }

  take(n: number): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      if (n <= 0) return;
      let i = 0;
      for (const x of src) {
        yield x;
        if (++i >= n) return;
      }
    });
  }

  skipWhile(predicate: (x: T) => boolean): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      let skipping = true;
      for (const x of src) {
        if (skipping && predicate(x)) continue;
        skipping = false;
        yield x;
      }
    });
  }

  takeWhile(predicate: (x: T) => boolean): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      for (const x of src) {
        if (!predicate(x)) return;
        yield x;
      }
    });
  }

  reverse(): Enumerable<T> {
    const src = this;
    return new Enumerable(function* () {
      yield* [...src].reverse();
    });
  }

  /** Stable sort like OrderBy; keys compared with the default Comparer (strings ordinal is NOT C#'s default, see note). */
  orderBy<K>(keySelector: (x: T) => K, compare: (a: K, b: K) => number = defaultCompare): OrderedEnumerable<T> {
    return new OrderedEnumerable(this, [{ key: keySelector as (x: T) => unknown, compare: compare as (a: unknown, b: unknown) => number, desc: false }]);
  }

  orderByDescending<K>(keySelector: (x: T) => K, compare: (a: K, b: K) => number = defaultCompare): OrderedEnumerable<T> {
    return new OrderedEnumerable(this, [{ key: keySelector as (x: T) => unknown, compare: compare as (a: unknown, b: unknown) => number, desc: true }]);
  }

  // ---- grouping and conversion --------------------------------------------------------------

  groupBy<K>(keySelector: (x: T) => K, comparer?: IEqualityComparer<K> | null): Enumerable<IGrouping<K, T>> {
    const src = this;
    return new Enumerable<IGrouping<K, T>>(function* () {
      const c = cmp(comparer);
      const groups: Grouping<K, T>[] = [];
      const index = new Map<unknown, Grouping<K, T>[]>();
      for (const x of src) {
        const k = keySelector(x);
        const hk = c.key(k);
        let bucket = index.get(hk);
        if (!bucket) index.set(hk, (bucket = []));
        let g: Grouping<K, T> | undefined = bucket.find((gg) => c.equals(gg.key, k));
        if (!g) {
          g = new Grouping<K, T>(k, []);
          bucket.push(g);
          groups.push(g);
        }
        g.items.push(x);
      }
      yield* groups;
    });
  }

  toList(): T[] {
    return [...this];
  }

  toArray(): T[] {
    return [...this];
  }

  toHashSet(comparer?: IEqualityComparer<T> | null): HashSet<T> {
    return new HashSet(this, cmp(comparer));
  }

  toDictionary<K, V = T>(keySelector: (x: T) => K, valueSelector?: (x: T) => V): Map<K, V> {
    const m = new Map<K, V>();
    for (const x of this) {
      const k = keySelector(x);
      if (k === null || k === undefined) throw new ArgumentNullException('key');
      if (m.has(k)) throw new ArgumentException('An item with the same key has already been added. Key: ' + String(k));
      m.set(k, valueSelector ? valueSelector(x) : (x as unknown as V));
    }
    return m;
  }

  zip<U, R>(other: Iterable<U>, selector: (a: T, b: U) => R): Enumerable<R> {
    const src = this;
    return new Enumerable(function* () {
      const b = other[Symbol.iterator]();
      for (const a of src) {
        const y = b.next();
        if (y.done) return;
        yield selector(a, y.value);
      }
    });
  }

  forEach(action: (x: T, i: number) => void): void {
    let i = 0;
    for (const x of this) action(x, i++);
  }
}

class Grouping<K, T> extends Enumerable<T> implements IGrouping<K, T> {
  constructor(
    readonly key: K,
    readonly items: T[],
  ) {
    super(() => items[Symbol.iterator]());
  }
}

interface SortKey<T> {
  key: (x: T) => unknown;
  compare: (a: unknown, b: unknown) => number;
  desc: boolean;
}

export class OrderedEnumerable<T> extends Enumerable<T> {
  constructor(
    private readonly src: Iterable<T>,
    private readonly keys: SortKey<T>[],
  ) {
    super(() => {
      const items = [...src].map((x, i) => ({ x, i, k: keys.map((s) => s.key(x)) }));
      items.sort((a, b) => {
        for (let j = 0; j < keys.length; j++) {
          const r = keys[j].compare(a.k[j], b.k[j]);
          if (r !== 0) return keys[j].desc ? -r : r;
        }
        return a.i - b.i;
      });
      return items.map((e) => e.x)[Symbol.iterator]();
    });
  }

  thenBy<K>(keySelector: (x: T) => K, compare: (a: K, b: K) => number = defaultCompare): OrderedEnumerable<T> {
    return new OrderedEnumerable(this.src, [...this.keys, { key: keySelector as (x: T) => unknown, compare: compare as (a: unknown, b: unknown) => number, desc: false }]);
  }

  thenByDescending<K>(keySelector: (x: T) => K, compare: (a: K, b: K) => number = defaultCompare): OrderedEnumerable<T> {
    return new OrderedEnumerable(this.src, [...this.keys, { key: keySelector as (x: T) => unknown, compare: compare as (a: unknown, b: unknown) => number, desc: true }]);
  }
}

/**
 * Comparer<T>.Default for the key types the engine sorts by. Strings: .NET's default string
 * comparison is culture-sensitive (invariant culture here), approximated by localeCompare with
 * the root locale; use StringComparer.Ordinal where C# does.
 */
export function defaultCompare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined) return -1;
  if (b === null || b === undefined) return 1;
  if (typeof a === 'string' && typeof b === 'string') return invariantCompare(a, b);
  if (typeof a === 'object' && typeof (a as { compareTo?: unknown }).compareTo === 'function') {
    return (a as { compareTo(o: unknown): number }).compareTo(b);
  }
  const x = a as number;
  const y = b as number;
  if (x < y) return -1;
  if (x > y) return 1;
  if (x === y) return 0;
  // double.CompareTo: NaN is smaller than every other value and equal to NaN.
  return Number.isNaN(x) ? (Number.isNaN(y) ? 0 : -1) : 1;
}

const invariantCollator = new Intl.Collator('und', { sensitivity: 'variant' });

export function invariantCompare(a: string, b: string): number {
  return invariantCollator.compare(a, b);
}

/** string.CompareOrdinal. */
export function ordinalCompare(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  // .NET compares the first characters, then two characters at a time over the shorter length,
  // reading the zero terminator of an odd-length string: "2" vs "2024" gives '\0' - '0' = -48.
  const at = (s: string, i: number): number => (i < s.length ? s.charCodeAt(i) : 0);
  if (at(a, 0) !== at(b, 0)) return at(a, 0) - at(b, 0);
  const n = Math.min(a.length, b.length);
  const end = n + (n % 2);
  for (let i = 0; i < end; i++) {
    const d = at(a, i) - at(b, i);
    if (d !== 0) return d;
  }
  return a.length - b.length;
}

/** Classes have a prototype object; arrow-function type guards do not. */
function isCtor<R>(t: Ctor<R> | ((x: unknown) => x is R)): t is Ctor<R> {
  return typeof t === 'function' && typeof (t as { prototype?: unknown }).prototype === 'object';
}

/** Shorthand: from(iterable). */
export function from<T>(iterable: Iterable<T> | null | undefined): Enumerable<T> {
  return Enumerable.from(iterable);
}

