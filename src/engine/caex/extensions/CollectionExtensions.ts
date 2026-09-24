// Port of Aml.Engine.CAEX.Extensions.CollectionExtensions (Aml.Engine 4.5.2), internal in C#.

/** Collection helpers. */
export class CollectionExtensions {
  private constructor() {}

  /** Wraps a single item in a lazy sequence (C# iterator: deferred, re-iterable). */
  static yield<T>(item: T): Iterable<T> {
    return {
      *[Symbol.iterator]() {
        yield item;
      },
    };
  }
}
