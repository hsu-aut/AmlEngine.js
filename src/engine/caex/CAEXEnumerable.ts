// Port of Aml.Engine.CAEX.CAEXEnumerable<T> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import type { XElement } from '../../xml/index.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { CAEXSequenceEnumerator } from './CAEXSequenceEnumerator.js';
import type { CAEXWrapper } from './CAEXWrapper.js';

type Ctor<C> = abstract new (...args: never[]) => C;

/**
 * A specific enumeration type which wraps an XElement with a CAEXWrapper during enumeration.
 * The enumerator for this class is CAEXSequenceEnumerator.
 *
 * Constructor overloads (the C# type argument `T` is an optional last argument, used only
 * without a sequence: elements whose wrapper is no `T` are enumerated as `null`; default
 * CAEXWrapper, i.e. no filtering):
 * - `new CAEXEnumerable(sequence, elements, type?)`
 * - `new CAEXEnumerable(elements, type?)`
 *
 * The elements are enumerated once per enumeration of this object; pass a re-enumerable
 * iterable (not a bare generator) when the result is enumerated more than once.
 */
export class CAEXEnumerable<TW extends CAEXWrapper> implements Iterable<TW> {
  private readonly _elements: Iterable<XElement | null>;

  private readonly _sequence: CAEXSequence<TW> | null;

  private readonly _type: Ctor<TW> | null;

  constructor(sequence: CAEXSequence<TW> | null, elements: Iterable<XElement | null> | null | undefined, type?: Ctor<TW> | null);
  constructor(elements: Iterable<XElement | null> | null | undefined, type?: Ctor<TW> | null);
  constructor(arg0: CAEXSequence<TW> | Iterable<XElement | null> | null | undefined, arg1?: unknown, arg2?: Ctor<TW> | null) {
    if (arguments.length === 1 || typeof arg1 === 'function' || (arguments.length === 2 && arg1 == null && !isSequence(arg0))) {
      // CAEXEnumerable(IEnumerable<XElement> elements) : this(null, elements)
      this._sequence = null;
      this._elements = (arg0 as Iterable<XElement | null> | null | undefined) ?? [];
      this._type = (arg1 as Ctor<TW> | null | undefined) ?? null;
      return;
    }
    this._sequence = (arg0 as CAEXSequence<TW> | null | undefined) ?? null;
    this._elements = (arg1 as Iterable<XElement | null> | null | undefined) ?? [];
    this._type = arg2 ?? null;
  }

  /** Gets the CAEXSequenceEnumerator. */
  [Symbol.iterator](): CAEXSequenceEnumerator<TW> {
    return new T.CAEXSequenceEnumerator<TW>(this._sequence, this._elements, this._type);
  }
}

function isSequence(x: unknown): boolean {
  return x instanceof T.NamedElementSequence_1;
}

T.CAEXEnumerable = CAEXEnumerable;
