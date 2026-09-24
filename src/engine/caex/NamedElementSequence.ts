// Port of Aml.Engine.CAEX.NamedElementSequence and NamedElementSequence<T> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from } from '../../system/linq.js';
import { ArgumentOutOfRangeException } from '../../system/exceptions.js';
import { XElement, XName } from '../../xml/index.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import type { CAEXWrapper } from './CAEXWrapper.js';

/** Static class to insert elements with a unique name. */
export class NamedElementSequence {
  private constructor() {}

  private static _uniqueName = false;

  /**
   * To force a named sequence to only insert elements with a unique name, also when no unique
   * name is required by the schema. An IUniqueName service is required to use this property.
   */
  static get uniqueName(): boolean {
    return NamedElementSequence._uniqueName;
  }

  static set uniqueName(value: boolean) {
    NamedElementSequence._uniqueName = value;
  }
}

/**
 * A Sequence of XML elements related to a specific element name. An XML element may contain
 * different NamedElementSequences with different names.
 *
 * Constructor overloads of C#:
 * - `(owner: XElement, elementName: string, getCAEXOwner?: () => CAEXWrapper)`
 * - `(owner: () => XElement, elementName: string)`
 * - `(owner: XElement, elementName: string, condition: (e: XElement) => boolean)`
 * - `(owner: () => XElement, elementName: string, condition: (e: XElement) => boolean)`
 *
 * With an XElement owner, a third argument that is a function without parameters is the
 * getCAEXOwner function, a function with a parameter is the condition.
 */
export abstract class NamedElementSequence_1<TItem> implements Iterable<TItem> {
  /** The element selection condition used to select elements to create the sequence. */
  protected elementSelectionCondition: ((e: XElement) => boolean) | null = null;

  /** Function to create the owner. */
  protected createOwner: (() => XElement | null) | null = null;

  private readonly _getCAEXOwner: (() => CAEXWrapper | null) | null = null;

  private _owner: XElement | null = null;

  /** Gets the CAEX owner of this sequence. */
  get caexOwner(): CAEXWrapper {
    return (this._getCAEXOwner?.() ?? XmlOperation.createCAEXWrapper(this.owner!))!;
  }

  /** Gets the number of elements in this sequence. */
  get count(): number {
    return from(this.elements).count();
  }

  /** Gets the name of the elements in this sequence (the setter is internal in C#). */
  elementName: XName;

  /** Determines, if the owner of the sequence is defined. */
  get isOwnerDefined(): boolean {
    return this._owner !== null;
  }

  /** Gets a list of unwrapped CAEX elements (XElements) of this sequence. */
  get elements(): Iterable<XElement> {
    if (!this.isOwnerDefined) {
      return [];
    }
    const owner = this.owner!;
    // XContainer.Elements() is re-enumerable in .NET.
    const all = from<XElement>({ [Symbol.iterator]: () => owner.elements() });
    if (this.elementSelectionCondition != null) {
      return all.where(this.localNamesAreEqualWithCondition);
    }
    return all.where(this.localNamesAreEqual);
  }

  /** Determines, if the sequence contains any element. */
  get exists(): boolean {
    return from(this.elements).any();
  }

  /** Gets the owner of this sequence. */
  get owner(): XElement | null {
    return this._owner ?? (this._owner = this.createOwner?.() ?? null);
  }

  /** Gets the first element in this sequence. */
  protected get firstElement(): XElement | null {
    return from(this.elements).firstOrDefault();
  }

  /** Gets the last element in this sequence. */
  protected get lastElement(): XElement | null {
    if (this.elementSelectionCondition == null) {
      const xElement = this.isOwnerDefined ? this.owner!.lastNode : null;
      if (!this.isOwnerDefined || !(xElement instanceof XElement) || !(xElement.name === this.elementName)) {
        return from(this.elements).lastOrDefault();
      }
      return xElement;
    }
    return from(this.elements).lastOrDefault();
  }

  /** Determines, if the local names are equal. */
  protected get localNamesAreEqual(): (element: XElement) => boolean {
    return (element) => element.name === this.elementName;
  }

  /** Determines, if the local names are equal and the selection condition holds. */
  protected get localNamesAreEqualWithCondition(): (element: XElement) => boolean {
    return (element) => element.name === this.elementName && this.elementSelectionCondition!(element);
  }

  /** Gets the value at the specified index position in this sequence. */
  abstract item(index: number): TItem | null;

  /** Sets the value at the specified index position in this sequence. */
  abstract setItem(index: number, value: TItem | null): void;

  protected constructor(owner: XElement | null, elementName: string, getCAEXOwner?: (() => CAEXWrapper | null) | null);
  protected constructor(owner: () => XElement | null, elementName: string);
  protected constructor(owner: XElement | null, elementName: string, condition: (e: XElement) => boolean);
  protected constructor(owner: () => XElement | null, elementName: string, condition: (e: XElement) => boolean);
  protected constructor(
    owner: XElement | null | (() => XElement | null),
    elementName: string,
    arg2?: (() => CAEXWrapper | null) | ((e: XElement) => boolean) | null,
  ) {
    if (typeof owner === 'function') {
      this._owner = null;
      this.createOwner = owner;
      this.elementName = XName.get(elementName);
      if (arg2 !== undefined && arg2 !== null) {
        this.elementSelectionCondition = arg2 as (e: XElement) => boolean;
      }
      return;
    }
    if (typeof arg2 === 'function' && arg2.length > 0) {
      this._owner = owner;
      this.elementName = XmlCAEXSchema.xName(owner!, elementName);
      this.elementSelectionCondition = arg2 as (e: XElement) => boolean;
      return;
    }
    this._getCAEXOwner = (arg2 as (() => CAEXWrapper | null) | null | undefined) ?? null;
    this._owner = owner;
    this.elementName = XmlCAEXSchema.xName(owner!, elementName);
  }

  /** Returns an enumerator that iterates through the collection. */
  abstract [Symbol.iterator](): Iterator<TItem>;

  /** Removes all CAEX objects from this sequence (`Remove()`), or the XML node (`Remove(XElement)`, protected in C#). */
  remove(xmlNode?: XElement | null): void {
    if (arguments.length > 0) {
      T.RemoveCmd.removeElement(xmlNode!);
      return;
    }
    const flag =
      ServiceLocator.undoRedoService?.beginTransaction(
        T.CAEXDocument.document(this.owner!),
        'Remove all ' + this.elementName.localName + ' of ' + this.owner!.name.localName,
      ) ?? false;
    for (const item of from(this.elements).toList()) {
      T.RemoveCmd.removeElement(item);
    }
    if (flag) {
      ServiceLocator.undoRedoService?.endTransaction(T.CAEXDocument.document(this.owner!));
    }
  }

  /** Removes the element at the given index; `true` if it existed and was removed. */
  removeAt(index: number): boolean {
    const xElement = this.atIndex(index);
    if (xElement == null) {
      return false;
    }
    T.RemoveCmd.removeElement(xElement);
    return true;
  }

  /** @internal */
  atIndex(index: number): XElement | null {
    try {
      return from(this.elements).elementAt(index);
    } catch (e) {
      if (e instanceof ArgumentOutOfRangeException) {
        return null;
      }
      throw e;
    }
  }

  /** Gets the index of the specified element in the sequence of elements with the same name. */
  protected indexOf(element: unknown): number {
    return from(this.elements).toList().indexOf(element as XElement);
  }
}

T.NamedElementSequence_1 = NamedElementSequence_1;
