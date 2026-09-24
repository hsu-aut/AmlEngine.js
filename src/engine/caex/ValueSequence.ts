// Port of Aml.Engine.CAEX.ValueSequence<TDataType> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from, type Enumerable } from '../../system/linq.js';
import { XmlConvert, XmlDateTimeSerializationMode, type DateTime } from '../../system/index.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { XElement } from '../../xml/index.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { NamedElementSequence_1 } from './NamedElementSequence.js';
import { csToString, elementToBoolean, elementToDateTime, newException, type CAEXWrapper, type DataTypeTag } from './CAEXWrapper.js';

/** Class defining a Xml-Element and its associated Value. */
export class ValueSequence_ElementValue<TDataType> {
  /** The Xml-Element. */
  node: XElement;

  /** The Value of the Xml-Element transformed to the DataType. */
  value: TDataType;

  /**
   * Creates the ElementValue structure for the defined Element and Value.
   * @param el The element.
   * @param val The value.
   */
  constructor(el: XElement, val: TDataType) {
    this.node = el;
    this.value = val;
  }
}

/**
 * Value converter class, used to provide converters to build a ValueSequence. The C# type
 * argument is passed at run time as a {@link DataTypeTag}.
 */
export class ValueSequence_ElementValueConverter<TValue> {
  /** @internal Function to convert data from the XML-representation to the defined DataType. */
  convertFrom: ((xNode: XElement) => TValue) | null = null;

  /** @internal Function to convert data to an XML-representation. */
  convertTo: ((d: TValue) => unknown) | null = null;

  /** The run time type argument. */
  readonly dataType: DataTypeTag;

  /** Initializes a new instance of the ElementValueConverter class. */
  constructor(dataType: DataTypeTag = 'object') {
    this.dataType = dataType;
    if (dataType === 'boolean') {
      this.convertTo = ValueSequence_ElementValueConverter.elementToString;
      this.convertFrom = (xNode) => elementToBoolean(xNode) as TValue;
    } else if (dataType === 'object') {
      this.convertTo = (d) => d;
      this.convertFrom = (xNode) => {
        if (this.dataType === 'object') {
          return xNode.value as TValue;
        }
        // Unreachable in C# as well (ReadInnerXml branch for other types).
        return xNode.value as TValue;
      };
    } else if (dataType === 'string') {
      this.convertTo = (d) => (typeof d === 'string' ? d : null);
      this.convertFrom = (xNode) => ((xNode?.value ?? null) as TValue);
    } else if (dataType === 'DateTime') {
      this.convertTo = ValueSequence_ElementValueConverter.dateTimeToString;
      this.convertFrom = (xNode) => elementToDateTime(xNode) as TValue;
    }
  }

  /** Sets custom value converters to support conversion from objects to user defined types. */
  setConverters(convertFrom: ((xNode: XElement) => TValue) | null, convertTo: ((d: TValue) => unknown) | null): void {
    this.convertTo = convertTo;
    this.convertFrom = convertFrom;
  }

  /** @internal */
  static elementToString(d: unknown): string {
    return csToString(d);
  }

  /** @internal */
  static dateTimeToString(d: unknown): string {
    const obj = d as DateTime | null;
    if (obj != null) {
      return XmlConvert.toString(obj, XmlDateTimeSerializationMode.Local);
    }
    return '';
  }

  /** Sets the element value. */
  setElementValue(element: XElement, value: TValue): void {
    const obj = this.convertTo!(value);
    if (typeof obj === 'string') {
      T.SetElementValueCmd.setValue(element, obj);
    } else {
      T.SetElementContentCmd.setValue(element, obj);
    }
  }

  /** Gets the element value, using the default or the custom 'from' converter. */
  getElementValue(element: XElement): TValue {
    return this.convertFrom!(element);
  }
}

/**
 * This class implements methods to work with a sequence of CAEX elements and indexed access to
 * their values. The C# type argument `TDataType` is passed at run time as a {@link DataTypeTag}
 * (last constructor argument, default 'object').
 */
export class ValueSequence<TDataType> extends NamedElementSequence_1<TDataType> {
  /** Nested class ValueSequence<T>.ElementValue. */
  static readonly ElementValue = ValueSequence_ElementValue;

  /** Nested class ValueSequence<T>.ElementValueConverter<T>. */
  static readonly ElementValueConverter = ValueSequence_ElementValueConverter;

  /** Gets the value of the CAEX object in this sequence at the given position. */
  override item(i: number): TDataType {
    return from(this.values).elementAt(i);
  }

  /** Sets the value of the CAEX object in this sequence at the given position. */
  override setItem(i: number, value: TDataType): void {
    this.valueConverter.setElementValue(from(this.elements).elementAt(i), value);
  }

  /** The value converter. */
  valueConverter: ValueSequence_ElementValueConverter<TDataType>;

  /** Gets the collection of Xml-Elements and their associated Values in this ValueSequence. */
  get elementAndValues(): Enumerable<ValueSequence_ElementValue<TDataType>> {
    return from(this.elements).select((e) => new ValueSequence_ElementValue<TDataType>(e, this.valueConverter.getElementValue(e)));
  }

  /** Gets a collection of values of the CAEX elements of this sequence. */
  get values(): Enumerable<TDataType> {
    const vc = this.valueConverter;
    return from(this.elements).select((e) => vc.getElementValue(e));
  }

  /** Gets the index of the specified element in the sequence of elements with the same name. */
  override indexOf(element: XElement | null): number {
    return super.indexOf(element);
  }

  /**
   * Creates a new instance of the ValueSequence. C# overloads:
   * `(owner, elementName, getCAEXOwner?)`, `(owner, elementName, condition)` and
   * `(getOwner, elementName, condition)`; the run time type argument follows as last argument.
   */
  constructor(owner: XElement | null, elementName: string, getCAEXOwner?: (() => CAEXWrapper | null) | null, dataType?: DataTypeTag);
  constructor(owner: XElement | null, elementName: string, condition: (e: XElement) => boolean, dataType?: DataTypeTag);
  constructor(getOwner: () => XElement | null, elementName: string, condition: (e: XElement) => boolean, dataType?: DataTypeTag);
  constructor(
    owner: XElement | null | (() => XElement | null),
    elementName: string,
    arg2?: (() => CAEXWrapper | null) | ((e: XElement) => boolean) | null,
    dataType: DataTypeTag = 'object',
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    super(owner as any, elementName, arg2 as any);
    this.valueConverter = new ValueSequence_ElementValueConverter<TDataType>(dataType);
  }

  /**
   * Creates a new CAEX object and appends it to the value sequence, with the provided value.
   * Returns the created XML node.
   */
  append(value: TDataType): XElement {
    const content = this.valueConverter.convertTo!(value);
    if (XmlCAEXSchema.isAdditionalInformation(this.owner!) && isNullOrEmpty(this.elementName.namespaceName)) {
      const xElement = new XElement('Document', content);
      this.owner!.add(xElement);
      return xElement;
    }
    let result: XElement | null;
    if (this.exists) {
      if ((result = T.AddNewCmd.addNewElement(this.lastElement!, this.elementName, content, true)) == null) {
        throw newException(`Could not add ${this.elementName} to ${this.owner!.name}`);
      }
    } else if ((result = T.AddNewCmd.addNewElement(this.owner!, this.elementName, content)) == null) {
      throw newException(`Could not add ${this.elementName} to ${this.owner!.name}`);
    }
    return result;
  }

  /** Gets the value from the element at the specified index. */
  at(index: number): TDataType {
    return from(this.values).elementAt(index);
  }

  /** Enumerates the values. */
  override [Symbol.iterator](): Iterator<TDataType> {
    return this.values[Symbol.iterator]();
  }

  /** Creates a new CAEX object with the provided value and prepends it; returns the XML node. */
  prepend(value: TDataType): XElement {
    if (!this.exists) {
      return this.append(value);
    }
    const content = this.valueConverter.convertTo!(value);
    const xElement = new XElement(this.elementName, content);
    if (XmlCAEXSchema.isAdditionalInformation(this.owner!) && isNullOrEmpty(this.elementName.namespaceName)) {
      this.firstElement!.addBeforeSelf(xElement);
    } else {
      T.AddCmd.addSibling(this.firstElement!, xElement, false);
    }
    return xElement;
  }
}

T.ValueSequence = ValueSequence;
T.ValueSequence_ElementValue = ValueSequence_ElementValue;
T.ValueSequence_ElementValueConverter = ValueSequence_ElementValueConverter;
