// System.Linq for the port: a lazy, generator based Enumerable with the C# semantics the engine
// relies on (deferred execution, First/Single exceptions, default equality via Equals).
//
// Equality: C# LINQ uses EqualityComparer<T>.Default, i.e. the virtual Equals. The port mirrors
// that: objects with an `equals(other)` method are compared with it, and objects with an
// `equalityKey()` method are hashed by that key (CAEXWrapper returns its XElement, matching its
// Equals/GetHashCode). Everything else uses SameValueZero, like a JS Map.

import { ArgumentException, ArgumentNullException, ArgumentOutOfRangeException, InvalidOperationException } from './exceptions.js';

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

/** A hash set with a custom comparer (keys decide buckets, equals decides membership). */
export class HashSet<T> implements Iterable<T> {
  private readonly buckets = new Map<unknown, T[]>();
  private count_ = 0;

  constructor(
    items?: Iterable<T> | null,
    private readonly comparer: IEqualityComparer<T> = DefaultComparer as IEqualityComparer<T>,
  ) {
    if (items) for (const x of items) this.add(x);
  }

  get count(): number {
    return this.count_;
  }

  add(x: T): boolean {
    const k = this.comparer.key(x);
    const b = this.buckets.get(k);
    if (!b) {
      this.buckets.set(k, [x]);
      this.count_++;
      return true;
    }
    if (b.some((y) => this.comparer.equals(y, x))) return false;
    b.push(x);
    this.count_++;
    return true;
  }

  contains(x: T): boolean {
    const b = this.buckets.get(this.comparer.key(x));
    return !!b && b.some((y) => this.comparer.equals(y, x));
  }

  remove(x: T): boolean {
    const k = this.comparer.key(x);
    const b = this.buckets.get(k);
    if (!b) return false;
    const i = b.findIndex((y) => this.comparer.equals(y, x));
    if (i < 0) return false;
    b.splice(i, 1);
    if (b.length === 0) this.buckets.delete(k);
    this.count_--;
    return true;
  }

  clear(): void {
    this.buckets.clear();
    this.count_ = 0;
  }

  *[Symbol.iterator](): Iterator<T> {
    for (const b of this.buckets.values()) yield* b;
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
    return new Enumerable(function* () {
      for (let i = 0; i < count; i++) yield start + i;
    });
  }

  static repeat<T>(value: T, count: number): Enumerable<T> {
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

  max<R = T>(selector?: (x: T) => R): R {
    let found = false;
    let m: R | undefined;
    for (const x of this) {
      const v = selector ? selector(x) : (x as unknown as R);
      if (!found || (v as unknown as number) > (m as unknown as number)) m = v;
      found = true;
    }
    if (!found) throw new InvalidOperationException('Sequence contains no elements');
    return m as R;
  }

  min<R = T>(selector?: (x: T) => R): R {
    let found = false;
    let m: R | undefined;
    for (const x of this) {
      const v = selector ? selector(x) : (x as unknown as R);
      if (!found || (v as unknown as number) < (m as unknown as number)) m = v;
      found = true;
    }
    if (!found) throw new InvalidOperationException('Sequence contains no elements');
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
  return (a as number) < (b as number) ? -1 : (a as number) > (b as number) ? 1 : 0;
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

