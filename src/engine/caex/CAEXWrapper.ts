// Port of Aml.Engine.CAEX.CAEXWrapper and CAEXWrapper<TDataType> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { from } from '../../system/linq.js';
import { ArgumentNullException, SystemException } from '../../system/exceptions.js';
import { EventSource, XmlConvert, XmlDateTimeSerializationMode, DateTime } from '../../system/index.js';
import { XElement, XName, toXName, type XDocument, type XNameLike } from '../../xml/index.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { CAEX_CLASSModel_TagNames } from './CAEX_CLASSModel_TagNames.js';
import type { CAEXDocument } from './CAEXDocument.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';

/** System.ComponentModel.PropertyChangedEventArgs. */
export interface PropertyChangedEventArgs {
  readonly propertyName: string;
}

/**
 * Run time stand-in for the C# type argument `TDataType` of CAEXWrapper<TDataType> and
 * ValueSequence<TDataType>. Only bool, object, string and DateTime have built-in converters in
 * Aml.Engine; 'other' stands for any other type (no converters are set, like in C#).
 */
export type DataTypeTag = 'boolean' | 'object' | 'string' | 'DateTime' | 'other';

/** `new Exception(message)` of .NET (System.Exception). */
export function newException(message: string, innerException?: unknown): Error {
  const e = new SystemException(message);
  e.name = 'Exception';
  if (innerException !== undefined) (e as Error & { innerException?: unknown }).innerException = innerException;
  return e;
}

/** `object.ToString()` on a converter value (bool.ToString() gives "True"/"False"; null throws). */
export function csToString(d: unknown): string {
  if (d === null || d === undefined) throw new TypeError('Object reference not set to an instance of an object.');
  if (typeof d === 'boolean') return d ? 'True' : 'False';
  return String(d);
}

/** Explicit conversion `(bool)XElement`. */
export function elementToBoolean(e: XElement | null): boolean {
  if (e === null) throw new ArgumentNullException('element');
  return XmlConvert.toBoolean(e.value.toLowerCase());
}

/** Explicit conversion `(DateTime)XElement`. */
export function elementToDateTime(e: XElement | null): DateTime {
  if (e === null) throw new ArgumentNullException('element');
  return XmlConvert.toDateTime(e.value, XmlDateTimeSerializationMode.RoundtripKind);
}

/**
 * This class is the base CAEXWrapper class, defined for all CAEX objects. The CAEXWrapper class
 * supports notifications of changes.
 */
export class CAEXWrapper implements ICAEXWrapper {
  private _owner: XElement | null = null;

  private _node: XElement | null;

  private _propertyChanged: EventSource<PropertyChangedEventArgs> | null = null;

  /**
   * Gets the CAEX document of this CAEX object. If the CAEX object has not been inserted into a
   * document or has been removed from the document, the value is `null`.
   */
  get caexDocument(): CAEXDocument | null {
    return (this.node !== null ? XmlCAEXSchema.caexDocument(this.node) : null) ?? this.associatedCAEXDocument;
  }

  /** @internal */
  associatedCAEXDocument: CAEXDocument | null = null;

  /** Gets the CAEXParent of this instance if it exists. */
  get caexParent(): CAEXWrapper | null {
    const owner = this.owner;
    return owner !== null ? XmlOperation.createCAEXWrapper(owner) : null;
  }

  /** Gets the CAEXSequence containing this CAEX object (null if none). */
  get caexSequenceOfCAEXObject(): ICAEXSequence | null {
    const parent = this.caexParent;
    return parent instanceof T.CAEXBasicObject ? parent.caexSequence(this) : null;
  }

  /** Gets the XDocument of the wrapped XML-Element. */
  get document(): XDocument | null {
    return this.node?.document ?? null;
  }

  /** Determines if this is a wrapper around an existing XML-Element. */
  get exists(): boolean {
    return this.node !== null;
  }

  /** Determines, if this object is not contained in any document. */
  get isDeleted(): boolean {
    if (!CAEXWrapper.equals(this.caexParent, null)) {
      return this.caexParent!.isDeleted;
    }
    return true;
  }

  /** Gets the wrapped XML-Element (the setter is internal in C#). */
  get node(): XElement | null {
    return this._node;
  }

  set node(value: XElement | null) {
    this._node = value;
  }

  /** Gets the wrapped Xml-Element's parent (the setter is internal in C#). */
  get owner(): XElement | null {
    return this.node?.parent ?? this._owner;
  }

  set owner(value: XElement | null) {
    this._owner = value;
  }

  /** Gets the name of the CAEX tag for this CAEX object. */
  get tagName(): string | null {
    return this.node?.name.localName ?? null;
  }

  /** The Change event raised when any property is modified. */
  get propertyChanged(): EventSource<PropertyChangedEventArgs> {
    return (this._propertyChanged ??= new EventSource<PropertyChangedEventArgs>());
  }

  /**
   * A new CAEXWrapper instance is constructed to wrap the provided XML element.
   * @param xElement The XML element.
   */
  constructor(xElement: XElement | null) {
    // C#: auto-property initializer, assigns the backing field (no virtual setter call).
    this._node = xElement ?? null;
  }

  /** @internal */
  static createWrapper(doc: CAEXDocument | null, element: XElement): CAEXWrapper {
    const cAEXWrapper = XmlOperation.createCAEXWrapper(element)!;
    if (cAEXWrapper.caexDocument == null) {
      cAEXWrapper.associatedCAEXDocument = doc;
    }
    return cAEXWrapper;
  }

  /**
   * C# `operator ==` (compares the wrapped nodes). `!=` is `!CAEXWrapper.equals(a, b)`.
   */
  static equals(obj1: CAEXWrapper | ICAEXWrapper | null | undefined, obj2: CAEXWrapper | ICAEXWrapper | null | undefined): boolean {
    if (obj1 !== null && obj1 !== undefined) {
      if (obj2 !== null && obj2 !== undefined) {
        if (obj1 !== obj2) {
          return (obj1 as CAEXWrapper).equals(obj2);
        }
        return true;
      }
      return false;
    }
    return obj2 === null || obj2 === undefined;
  }

  /** Gets the first child of this CAEX object with the defined CAEX tag name, or `null`. */
  caexChild(tagName: string): CAEXWrapper | null {
    const e = this.element(tagName);
    return e !== null ? XmlOperation.createCAEXWrapper(e) : null;
  }

  /** Gets all children of this CAEX object with the defined CAEX tag name. */
  caexChildren(tagName: string): Iterable<CAEXWrapper> {
    return new T.CAEXEnumerable<CAEXWrapper>(this.elements(tagName));
  }

  /**
   * Creates a copy of this CAEX object.
   * @param deepCopy if `true` a deep copy is created; otherwise only the attributes are copied.
   * @param assignNewIDs if `true` all IDs get new IDs (used by overrides).
   * @param includeSubClasses if `true` nested classes are included in the copy.
   */
  copy(deepCopy = true, assignNewIDs = true, includeSubClasses = false): CAEXWrapper {
    void assignNewIDs;
    const node = this.node!;
    if (includeSubClasses) {
      if (!deepCopy) {
        return XmlOperation.createCAEXWrapper(new XElement(node.name, node.attributes()))!;
      }
      return XmlOperation.createCAEXWrapper(new XElement(node))!;
    }
    switch (this.tagName) {
      case 'SystemUnitClass':
      case 'RoleClass':
      case 'InterfaceClass':
      case 'AttributeType':
        return XmlOperation.createCAEXWrapper(
          new XElement(
            node.name,
            node.attributes(),
            from<XElement>({ [Symbol.iterator]: () => node.elements() }).where((el) => el.name !== node.name),
          ),
        )!;
      default:
        if (!deepCopy) {
          return XmlOperation.createCAEXWrapper(new XElement(node.name, node.attributes()))!;
        }
        return XmlOperation.createCAEXWrapper(new XElement(node))!;
    }
  }

  /** Equality of CAEX wrapper instances is defined on the equality of the wrapped XML elements. */
  equals(obj: unknown): boolean {
    if (obj !== null && obj !== undefined) {
      if (this !== obj) {
        if (obj instanceof CAEXWrapper && this.exists) {
          return this.node === obj.node;
        }
        return false;
      }
      return true;
    }
    return false;
  }

  /** GetHashCode: the wrapped XML element, or the instance itself when no element is wrapped. */
  equalityKey(): unknown {
    if (!this.exists) {
      return this;
    }
    return this.node;
  }

  /** Gets the value of the Xml-Attribute with the specified name, or `null`. */
  getXAttributeValue(attributeName: XNameLike): string | null {
    if (!this.exists) {
      return null;
    }
    return this.node!.attribute(attributeName)?.value ?? null;
  }

  /**
   * Creates the XML node for a wrapper constructed without one, inserted as a new child of the
   * owner. Only possible if an owner is defined.
   */
  insertNew(): boolean {
    if (this.exists || this.owner === null) {
      return false;
    }
    const owner = this.owner;
    this.node = T.InsertNewCmd.insertNewElement(owner, XmlCAEXSchema.xName(owner, CAEX_CLASSModel_TagNames.tagName(this.constructor)));
    return this.exists;
  }

  /**
   * Removes this element. After that it is no longer assigned to a document and has no owner.
   * @param removeRelations If `true`, all relations to this object are removed also.
   */
  remove(removeRelations = false): void {
    void removeRelations;
    if (this.node?.parent != null) {
      T.RemoveCmd.removeElement(this.node);
    }
  }

  /** Sets, adds or removes (value `null`) an attribute of the wrapped element. */
  setXAttributeValue(attributeName: XNameLike, attributeValue: unknown): void {
    if (this.exists) {
      T.SetAttributeValueCmd.setValue(this.node!, toXName(attributeName), attributeValue);
    }
  }

  /** @internal Tries to extract a class qualifier from a path. */
  static classQualifier(classNames: Iterable<string>, path: string): string {
    const array = from<string>(CAEXPathBuilder.pathPartObjectNames(path, T.CAEXDocument.CAEXSchema.CAEX2_15)).toArray();
    if (array.length <= 1 || !from(classNames).contains(array[0]!)) {
      return '';
    }
    return array[0]!;
  }

  /** @internal Creates the constructor delegate of the wrapped items (the expression itself in JS). */
  static createConstructor<TW extends CAEXWrapper>(expression: (e: XElement) => TW): (e: XElement) => TW {
    return expression;
  }

  /** @internal Gets the first child of the wrapped XML element with the defined element name. */
  element(elementName: string): XElement | null {
    const node = this.node;
    return node !== null ? node.element(this.xName(elementName)) : null;
  }

  /** @internal Gets all children of the wrapped XML element with the defined element name. */
  elements(elementName: string): Iterable<XElement> {
    const node = this.node;
    if (node === null) return [];
    const name = this.xName(elementName);
    // XContainer.Elements(name) is re-enumerable in .NET.
    return { [Symbol.iterator]: () => node.elements(name) };
  }

  /** @internal Gets the XName for the tag name, suitable to this node's namespace. */
  xName(tagName: string): XName {
    if (!this.exists) {
      return XName.get(tagName);
    }
    return XmlCAEXSchema.xName(this.node!, tagName);
  }

  /** Raises the propertyChanged event for the property with the defined name. */
  protected raisePropertyChanged(propertyName: string): void {
    this._propertyChanged?.raise(this, { propertyName });
  }
}

registerInterfaces(CAEXWrapper, 'INotifyPropertyChanged', 'ICAEXWrapper', 'IXMLWrapper');

/**
 * A CAEXWrapper for any Element, which is defined as a simple type. The C# type argument
 * `TDataType` is passed at run time as a {@link DataTypeTag}.
 */
export class CAEXWrapper_1<TDataType> extends CAEXWrapper {
  private readonly _name: XName | null;

  private readonly _parent: XElement | null;

  private _convertFrom: (() => TDataType) | null = null;

  private _convertTo: ((d: TDataType) => string | null) | null = null;

  /** The run time type argument. */
  readonly dataType: DataTypeTag;

  /** Gets the wrapped XML node (the setter, internal in C#, also sets the converters). */
  override get node(): XElement | null {
    return super.node;
  }

  override set node(value: XElement | null) {
    super.node = value;
    if (super.node === null) {
      return;
    }
    if (this.dataType === 'boolean') {
      this._convertTo = (d) => csToString(d);
      this._convertFrom = () => elementToBoolean(this.node) as TDataType;
    } else if (this.dataType === 'object') {
      this._convertTo = (d) => csToString(d);
      this._convertFrom = () => this.node!.value as TDataType;
    } else if (this.dataType === 'string') {
      this._convertTo = (d) => (typeof d === 'string' ? d : null);
      this._convertFrom = () => this.node!.value as TDataType;
    } else if (this.dataType === 'DateTime') {
      this._convertTo = (d) => {
        const obj = d as unknown as DateTime | null;
        return obj != null ? XmlConvert.toString(obj, XmlDateTimeSerializationMode.Local) : '';
      };
      this._convertFrom = () => elementToDateTime(this.node) as TDataType;
    }
  }

  /**
   * Gets and sets the value of the wrapped XML node, according to the data type. If the element
   * doesn't exist, it is created and inserted into the document as a child of the owner.
   */
  get value(): TDataType | null {
    if (!this.exists) {
      return this.defaultValue();
    }
    return this._convertFrom!();
  }

  set value(value: TDataType) {
    if (!this.exists) {
      const num = ServiceLocator.undoRedoService?.beginTransaction(CAEXBasicObjectExtensions.caexDocument(this), 'Set value for' + (this.tagName ?? '')) ?? false;
      this.node = T.InsertNewCmd.insertNewElement(this._parent!, this._name!);
      T.SetElementValueCmd.setValue(this.node!, this._convertTo!(value));
      if (num) {
        ServiceLocator.undoRedoService?.endTransaction(CAEXBasicObjectExtensions.caexDocument(this));
      }
    } else {
      T.SetElementValueCmd.setValue(this.node!, this._convertTo!(value));
    }
    this.raisePropertyChanged('Value');
  }

  /**
   * Initializes a new instance.
   * @param xmlNode The XML node.
   * @param dataType The run time type argument `TDataType`.
   */
  constructor(xmlNode: XElement | null, dataType: DataTypeTag) {
    super(xmlNode);
    this.dataType = dataType;
    this._parent = this.owner;
    this.node = xmlNode ?? null;
    this._name = xmlNode?.name ?? null;
  }

  /** default(TDataType). */
  private defaultValue(): TDataType | null {
    if (this.dataType === 'boolean') return false as TDataType;
    if (this.dataType === 'DateTime') return DateTime.minValue as TDataType;
    return null;
  }
}

T.CAEXWrapper = CAEXWrapper;
T.CAEXWrapper_1 = CAEXWrapper_1;
