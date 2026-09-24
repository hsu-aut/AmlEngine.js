// Port of Aml.Engine.CAEX.CAEXSequenceEnumerator<T> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { NotSupportedException } from '../../system/exceptions.js';
import type { XElement } from '../../xml/index.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { CAEXWrapper } from './CAEXWrapper.js';

type Ctor<C> = abstract new (...args: never[]) => C;

/**
 * The CAEX sequence enumerator which creates a CAEXWrapper for each enumerated XML-Element. It is
 * also a JS iterator (`next()`), so it can be returned from `[Symbol.iterator]()`.
 */
export class CAEXSequenceEnumerator<TW extends CAEXWrapper> implements Iterator<TW> {
  private readonly _iterable: Iterable<XElement | null> | null;

  private _iterator: Iterator<XElement | null> | null;

  private _current: XElement | null = null;

  private readonly _sequence: CAEXSequence<TW> | null;

  private readonly _type: Ctor<TW> | null;

  /**
   * Gets the item at the current position. Without a sequence, the element is wrapped with
   * `CreateCaexWrapper<T>`, which returns `null` when the wrapper is no `T`.
   */
  get current(): TW | null {
    if (this._sequence == null) {
      return CAEXBasicObjectExtensions.createCaexWrapper<TW>(this._current as XElement, (this._type ?? T.CAEXWrapper) as Ctor<TW>);
    }
    return this._sequence.createCaexWrapper(this._current as XElement);
  }

  /**
   * Initializes a new instance.
   * @param sequence The CAEXSequence, defining the sequence of XML elements (or `null`).
   * @param elements The collection of XML elements of the CAEX sequence.
   * @param type The run time type argument `T` (used without a sequence; default CAEXWrapper).
   */
  constructor(sequence: CAEXSequence<TW> | null, elements: Iterable<XElement | null> | null, type: Ctor<TW> | null = null) {
    this._sequence = sequence;
    this._iterable = elements;
    this._iterator = elements?.[Symbol.iterator]() ?? null;
    this._type = type;
  }

  /** Dispose this instance. */
  dispose(): void {}

  /** Sets the enumerator to the next item; `false` at the end of the collection. */
  moveNext(): boolean {
    if (this._iterator == null) {
      return false;
    }
    if (this.advance()) {
      if (this._current == null) {
        return this.advance();
      }
      return true;
    }
    return false;
  }

  /**
   * Resets the enumerator. Arrays support it; iterator based (lazy) sequences throw
   * NotSupportedException, like compiler generated iterators in .NET.
   */
  reset(): void {
    if (this._iterator == null) return;
    if (Array.isArray(this._iterable)) {
      this._iterator = this._iterable[Symbol.iterator]();
      this._current = null;
      return;
    }
    throw new NotSupportedException();
  }

  /** JS iterator protocol over moveNext/current. */
  next(): IteratorResult<TW> {
    if (this.moveNext()) {
      // The value can be null (a wrapper of another type), typed as TW like IEnumerator<T>.
      return { done: false, value: this.current as TW };
    }
    return { done: true, value: undefined };
  }

  [Symbol.iterator](): Iterator<TW> {
    return this;
  }

  private advance(): boolean {
    const r = this._iterator!.next();
    if (r.done) {
      this._current = null;
      return false;
    }
    this._current = r.value ?? null;
    return true;
  }
}

T.CAEXSequenceEnumerator = CAEXSequenceEnumerator;
