// Port of Aml.Engine.CAEX.AttributeTypeType (Aml.Engine 4.5.2).
// CLR types and values are mapped to JS as described in ./extensions/ClrValue.ts.

import { T } from '../registry.js';
import { implementsInterface, registerInterfaces } from '../interfaces.js';
import type { XElement } from '../../xml/index.js';
import { ArgumentNullException, FormatException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { from } from '../../system/linq.js';
import type { Enumerable } from '../../system/linq.js';
import { DateTime, XmlConvert, XmlDateTimeSerializationMode } from '../../system/index.js';
import { CaexObjectWithReference } from './CaexObjectWithReference.js';
import { XmlCAEXAttributes } from '../xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { ObjectWithBaseClass } from './extensions/ObjectWithBaseClass.js';
import { ClrType, type ClrTypeLike } from './extensions/ClrValue.js';
import type { AttributeSequence } from './AttributeSequence.js';
import type { AttributeType } from './AttributeType.js';
import type { AttributeValueRequirementType } from './AttributeValueRequirementType.js';
import type { CAEXSequence } from './CAEXSequence.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXSequence } from './ICAEXSequence.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { IObjectWithAttributes } from './IObjectWithAttributes.js';
import type { IClassWithBaseClassReference } from './IClassWithBaseClassReference.js';
import type { RefSemanticType } from './RefSemanticType.js';
import type { CaexValue } from './extensions/CaexValue.js';
import type { ObjectWithAMLAttributes } from '../amlobjects/ObjectWithAMLAttributes.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyCtor<R> = abstract new (...args: any[]) => R;

/**
 * This Class is the generic base class for 'Attribute' and 'AttributeType' elements and defines
 * base structures for Attribute- and AttributeType definitions.
 */
export abstract class AttributeTypeType extends CaexObjectWithReference<AttributeTypeType> {
  // FallBackCulture (de-DE) is implemented by the parse helpers at the end of this module.

  private static _xsdDataTypes: string[] | null = null;

  private _constraint: CAEXSequence<AttributeValueRequirementType> | null = null;

  private _refSemantic: CAEXSequence<RefSemanticType> | null = null;

  private _valueAttributes: CaexValue[] | null = null;

  /** The XSD data types which are supported. */
  static get xsdDataTypes(): string[] {
    return (AttributeTypeType._xsdDataTypes ??= AttributeTypeType.readXsdDataTypes());
  }

  /** Gets a collection of Attributes contained in this instance. */
  get attribute(): AttributeSequence {
    return new T.AttributeSequence(this.node, T.AttributeType.Constructor, () => this);
  }

  /** Gets the attributes and all nested attributes. */
  get attributeAndDescendants(): Enumerable<AttributeType> {
    return from<AttributeType>(this.attribute).concat(from<AttributeType>(this.attribute).selectMany((a: AttributeType) => a.attributeAndDescendants));
  }

  /**
   * Gets and sets the AttributeDataType attribute of this Attribute object. If the referenced
   * attribute type does not base on an XML standard base type, the AttributeDataType may remain
   * empty or not present.
   */
  get attributeDataType(): string | null {
    return this.getXAttributeValue('AttributeDataType') ?? '';
  }

  set attributeDataType(value: string | null) {
    if (!(this.attributeDataType === value)) {
      this.setXAttributeValue('AttributeDataType', value);
      this.raisePropertyChanged('AttributeDataType');
    }
  }

  /** Gets the Attribute datatype which is valid for values of all ValueAttributes of this element: the instance itself. */
  get attributeTypeDefiningAttribute(): AttributeTypeType {
    return this;
  }

  /**
   * Gets and set the encoded/decoded attribute value according to the defined AttributeDataType.
   * If no AttributeDataType is defined the type is set according to the `clrToXmlType` result.
   */
  get attributeValue(): unknown {
    return this.item('Value');
  }

  set attributeValue(value: unknown) {
    this.setItem('Value', value);
  }

  /** Gets the collection of AttributeValueRequirement objects contained in this instance. */
  get constraint(): CAEXSequence<AttributeValueRequirementType> {
    return (this._constraint ??= new T.CAEXSequence<AttributeValueRequirementType>(this.node, 'Constraint', T.AttributeValueRequirementType.Constructor, () => this));
  }

  /** Gets and set the encoded/decoded default attribute value according to the defined AttributeDataType. */
  get defaultAttributeValue(): unknown {
    return this.item('DefaultValue');
  }

  set defaultAttributeValue(value: unknown) {
    this.setItem('DefaultValue', value);
  }

  /**
   * Gets and sets the DefaultValue element of this Attribute object. Use `defaultAttributeValue`
   * to get or set the type encoded default value according to the Attribute Data Type.
   */
  get defaultValue(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node, XmlCAEXSchema.xName(this.node, 'DefaultValue'));
  }

  set defaultValue(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node, XmlCAEXSchema.xName(this.node, 'DefaultValue'), value);
  }

  /** Determines, if this is an overridden Attribute. */
  get isOverridden(): boolean {
    const classWithBaseClass = this.caexParent;
    if (implementsInterface(classWithBaseClass, 'IClassWithBaseClassReference')) {
      return ObjectWithBaseClass.isOverridden(classWithBaseClass as unknown as IClassWithBaseClassReference, this);
    }
    return false;
  }

  /**
   * Gets and sets the RefAttributeType CAEX attribute of the Attribute object. This property is
   * used to create instance to class relations between Attributes (instances) and AttributeType
   * objects (classes).
   */
  get refAttributeType(): string | null {
    return this.getXAttributeValue('RefAttributeType');
  }

  set refAttributeType(value: string | null) {
    if (!(this.refAttributeType === value)) {
      this.setXAttributeValue('RefAttributeType', value);
      this.raisePropertyChanged('RefAttributeType');
    }
  }

  /** Gets the collection of RefSemantic objects contained in this instance. */
  get refSemantic(): CAEXSequence<RefSemanticType> {
    return (this._refSemantic ??= new T.CAEXSequence<RefSemanticType>(this.node, 'RefSemantic', T.RefSemanticType.Constructor, () => this));
  }

  /** Gets and sets the Unit attribute for this Attribute object. */
  get unit(): string | null {
    return this.getXAttributeValue('Unit');
  }

  set unit(value: string | null) {
    if (!(this.unit === value)) {
      this.setXAttributeValue('Unit', value);
      this.raisePropertyChanged('Unit');
    }
  }

  /**
   * Gets and sets the Value for this Attribute object. The correct XML-String representation
   * for the defined AttributeDataType has to be ensured by the caller; use `attributeValue` or
   * `item('Value')` for type based access.
   */
  get value(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node, XmlCAEXSchema.xName(this.node, 'Value'));
  }

  set value(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node, XmlCAEXSchema.xName(this.node, 'Value'), value);
  }

  /** Gets all the CaexValue objects for the defined value attributes (Value and DefaultValue) of this instance. */
  get valueAttributes(): CaexValue[] {
    let list = this._valueAttributes;
    if (list === null) {
      const list2: CaexValue[] = [new T.CaexValue(this.node, 'Value'), new T.CaexValue(this.node, 'DefaultValue')];
      this._valueAttributes = list2;
      list = list2;
    }
    return list;
  }

  /**
   * Gets the type-decoded value for the value attribute with the defined name ('Value' or
   * 'DefaultValue'). C# indexer getter.
   */
  item(attributeName: string): unknown {
    return this.getCaexValue(attributeName)?.value ?? null;
  }

  /**
   * Sets the type-encoded value for the value attribute with the defined name ('Value' or
   * 'DefaultValue'). If no AttributeDataType is defined, it is set from the CLR type of the value
   * (see `setAttributeDataType`). C# indexer setter.
   */
  setItem(attributeName: string, value: unknown): void {
    if (isNullOrEmpty(this.attributeDataType)) {
      this.setAttributeDataType(value);
    }
    const caexValue = this.getCaexValue(attributeName);
    if (caexValue !== null) {
      caexValue.value = value;
    }
  }

  /** @param attributeTypeNode An 'AttributeType' XML node. @param refName Name of the attribute, containing the type reference. */
  protected constructor(attributeTypeNode: XElement, refName: string) {
    super(attributeTypeNode, refName);
  }

  /**
   * Gets the XML type for the specified CLR type (Mapping XML Data Types to CLR Types). If more
   * than one mapping is possible, the most common one is used; unknown types give 'xs:string'.
   * The type is a ClrType or a JS constructor (see `ClrType.from`: Number stands for double,
   * BigInt for long, String, Boolean, Decimal, DateTime, TimeSpan, Uri, Uint8Array for byte[],
   * Array for string[]).
   */
  static clrToXmlType(clrType: ClrTypeLike | null): string {
    if (clrType === null || clrType === undefined) {
      throw new ArgumentNullException('clrType');
    }
    const t = ClrType.from(clrType);
    const x = T.XsdDataTypes;
    if (t === ClrType.Uri) {
      return x.anyURIType;
    }
    if (t === ClrType.ByteArray) {
      return x.base64BinaryType;
    }
    if (t === ClrType.Boolean) {
      return x.booleanType;
    }
    if (t === ClrType.SByte) {
      return x.byteType;
    }
    if (t === ClrType.DateTime) {
      return x.dateTimeType;
    }
    if (t === ClrType.Decimal) {
      return x.decimalType;
    }
    if (t === ClrType.Double) {
      return x.doubleType;
    }
    if (t === ClrType.TimeSpan) {
      return x.durationType;
    }
    if (t === ClrType.StringArray) {
      return x.entitiesType;
    }
    if (!(t === ClrType.Single)) {
      if (!(t === ClrType.Int32)) {
        if (!(t === ClrType.Int64)) {
          if (!(t === ClrType.XmlQualifiedName)) {
            if (!(t === ClrType.Int16)) {
              if (!(t === ClrType.String)) {
                if (!(t === ClrType.UInt16)) {
                  if (!(t === ClrType.Byte)) {
                    if (!(t === ClrType.UInt32)) {
                      if (!(t === ClrType.UInt64)) {
                        return x.stringType;
                      }
                      return x.unsignedLongType;
                    }
                    return x.unsignedIntType;
                  }
                  return x.unsignedByteType;
                }
                return x.unsignedShortType;
              }
              return x.stringType;
            }
            return x.shortType;
          }
          return x.qNameType;
        }
        return x.longType;
      }
      return x.intType;
    }
    return x.floatType;
  }

  /**
   * Conversion to get access to specific AutomationML defined Attributes (C# implicit operator
   * to ObjectWithAMLAttributes).
   */
  static op_Implicit(attributeType: AttributeTypeType | null): ObjectWithAMLAttributes | null {
    if (!T.CAEXWrapper.equals(attributeType, null)) {
      return new T.ObjectWithAMLAttributes(attributeType!);
    }
    return null;
  }

  /** Gets the CLR type for the specified XML type (Mapping XML Data Types to CLR Types). */
  static xmlTypeToClrType(xmlType: string | null): ClrType {
    const x = T.XsdDataTypes;
    if (isNullOrEmpty(xmlType)) {
      return ClrType.String;
    }
    if (xmlType === x.anyURIType) {
      return ClrType.Uri;
    }
    if (xmlType === x.base64BinaryType) {
      return ClrType.ByteArray;
    }
    if (xmlType === x.booleanType) {
      return ClrType.Boolean;
    }
    if (xmlType === x.byteType) {
      return ClrType.SByte;
    }
    if (
      xmlType === x.dateTimeType ||
      xmlType === x.dateType ||
      xmlType === x.timeType ||
      xmlType === x.gDayType ||
      xmlType === x.gMonthDayType ||
      xmlType === x.gMonthType ||
      xmlType === x.gYearMonthType ||
      xmlType === x.gYearType
    ) {
      return ClrType.DateTime;
    }
    if (
      xmlType === x.decimalType ||
      xmlType === x.positiveIntegerType ||
      xmlType === x.negativeIntegerType ||
      xmlType === x.nonPositiveIntegerType ||
      xmlType === x.nonNegativeIntegerType ||
      xmlType === x.integerType
    ) {
      return ClrType.Decimal;
    }
    if (xmlType === x.doubleType) {
      return ClrType.Double;
    }
    if (xmlType === x.durationType) {
      return ClrType.TimeSpan;
    }
    if (xmlType === x.entitiesType) {
      return ClrType.StringArray;
    }
    if (!(xmlType === x.floatType)) {
      if (!(xmlType === x.intType)) {
        if (!(xmlType === x.longType)) {
          if (!(xmlType === x.qNameType)) {
            if (!(xmlType === x.shortType)) {
              if (!(xmlType === x.stringType)) {
                if (!(xmlType === x.unsignedShortType)) {
                  if (!(xmlType === x.unsignedByteType)) {
                    if (!(xmlType === x.unsignedIntType)) {
                      if (!(xmlType === x.unsignedLongType)) {
                        return ClrType.String;
                      }
                      return ClrType.UInt64;
                    }
                    return ClrType.UInt32;
                  }
                  return ClrType.Byte;
                }
                return ClrType.UInt16;
              }
              return ClrType.String;
            }
            return ClrType.Int16;
          }
          return ClrType.XmlQualifiedName;
        }
        return ClrType.Int64;
      }
      return ClrType.Int32;
    }
    return ClrType.Single;
  }

  /** Gets the CAEXSequence owned by this CAEX object, which contains the specified CAEX object. */
  override caexSequence(caexObject: ICAEXWrapper): ICAEXSequence | null {
    if (!T.CAEXWrapper.equals(caexObject.caexParent, this)) {
      return null;
    }
    return caexObject instanceof T.AttributeType
      ? (this.attribute as unknown as ICAEXSequence)
      : caexObject instanceof T.AttributeValueRequirementType
        ? (this.constraint as unknown as ICAEXSequence)
        : !(caexObject instanceof T.RefSemanticType)
          ? super.caexSequence(caexObject)
          : (this.refSemantic as unknown as ICAEXSequence);
  }

  /** C# `Container<T>()`: the sequence for elements of the given class. */
  override container<TItem extends CAEXWrapper>(type: AnyCtor<TItem>): CAEXSequence<TItem> | null {
    if (!isAssignableFrom(type, T.AttributeType)) {
      return super.container(type);
    }
    const attribute: unknown = this.attribute;
    return attribute instanceof T.CAEXSequence ? (attribute as CAEXSequence<TItem>) : null;
  }

  /** Gets the CaexValue for the value attribute with the defined attribute name ('Value' or 'DefaultValue'). */
  getCaexValue(attributeName: string | null): CaexValue | null {
    return from(this.valueAttributes).firstOrDefault((c: CaexValue) => c.valueAttributeName === attributeName);
  }

  /**
   * Parse the Attribute Value string as DateTime (XmlConvert.ToDateTime, then fallbacks). Throws
   * a FormatException if the string can not be parsed. The static overload with a string first
   * parameter is the internal C# `GetDateTime(string, XmlDateTimeSerializationMode)`.
   */
  getDateTime(dateTimeOption: XmlDateTimeSerializationMode): DateTime {
    return AttributeTypeType.getDateTime(this.value, dateTimeOption);
  }

  /**
   * Parse the Attribute Value string as double (XmlConvert.ToDouble, then fallbacks). Throws a
   * FormatException if the string can not be parsed.
   */
  getDouble(): number {
    return AttributeTypeType.getDouble(this.value);
  }

  /**
   * Inserts the specified CAEX object in its associated sequence (Attribute, Constraint,
   * RefSemantic). C# overloads `Insert(CAEXWrapper, bool asFirst = true, bool asIs = false)`
   * and `Insert(int pos, CAEXWrapper)`.
   */
  override insert(caexObject: CAEXWrapper | null, asFirst?: boolean, asIs?: boolean): boolean;
  override insert(pos: number, caexObject: CAEXWrapper | null): boolean;
  override insert(caexObjectOrPos: CAEXWrapper | number | null, asFirstOrObject?: boolean | CAEXWrapper | null, asIsArg?: boolean): boolean {
    const asIs = asIsArg ?? false;
    if (typeof caexObjectOrPos === 'number') {
      const pos = caexObjectOrPos;
      const caexObject = (asFirstOrObject ?? null) as CAEXWrapper | null;
      if (!(caexObject instanceof T.AttributeType)) {
        if (!(caexObject instanceof T.AttributeValueRequirementType)) {
          if (caexObject instanceof T.RefSemanticType) {
            return this.refSemantic.insertAt(pos, caexObject) !== null;
          }
          return super.insert(pos, caexObject);
        }
        return this.constraint.insertAt(pos, caexObject) !== null;
      }
      return this.attribute.insertAt(pos, caexObject) !== null;
    }
    const caexObject = caexObjectOrPos;
    const asFirst = (asFirstOrObject ?? true) as boolean;
    if (!(caexObject instanceof T.AttributeType)) {
      if (!(caexObject instanceof T.AttributeValueRequirementType)) {
        if (caexObject instanceof T.RefSemanticType) {
          return this.refSemantic.insert(caexObject, asFirst, asIs) !== null;
        }
        return super.insert(caexObject, asFirst, asIs);
      }
      return this.constraint.insert(caexObject, asFirst, asIs) !== null;
    }
    return this.attribute.insert(caexObject, asFirst, asIs) !== null;
  }

  override import(caexObject: CAEXWrapper | null, name: string | null, withSubclasses = false): CAEXWrapper | null {
    if (!(caexObject instanceof T.AttributeType)) {
      if (!(caexObject instanceof T.AttributeValueRequirementType)) {
        if (caexObject instanceof T.RefSemanticType) {
          return this.refSemantic.import(caexObject, name, withSubclasses);
        }
        return super.import(caexObject, name, withSubclasses);
      }
      return this.constraint.import(caexObject, name, withSubclasses);
    }
    return this.attribute.import(caexObject, name, withSubclasses);
  }

  /** Inserts the provided CAEX object as a new sibling after this CAEX object. */
  override insertAfter(caexObject: AttributeTypeType | null): void {
    if (T.CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw exception('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, true);
  }

  /** Inserts the provided CAEX object as a new sibling before this CAEX object. */
  override insertBefore(caexObject: AttributeTypeType | null): void {
    if (T.CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw exception('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, false);
  }

  /**
   * Determines, if this is an inherited attribute from a base class (C# `IsInherited(owner)`,
   * which hides the `IsInherited` property of CAEXBasicObject; renamed because a TS subclass
   * cannot turn an inherited accessor into a method).
   */
  isInheritedIn(owner: IObjectWithAttributes | null): boolean {
    if (implementsInterface(owner, 'IClassWithBaseClassReference')) {
      return ObjectWithBaseClass.isInherited(owner as unknown as IClassWithBaseClassReference, this);
    }
    return false;
  }

  /**
   * Sets the attribute data type. C# overloads: `SetAttributeDataType(Type)` (a ClrType or a JS
   * constructor) and `SetAttributeDataType(object)`, which uses the CLR type of the value: a plain
   * number is an int (xs:int) when it is an integer in the Int32 range and a double (xs:double)
   * otherwise, a bigint is a long (xs:long); pass a ClrValue for any other numeric type.
   */
  setAttributeDataType(clrTypeOrValue: unknown): void {
    if (clrTypeOrValue instanceof ClrType || typeof clrTypeOrValue === 'function') {
      this.attributeDataType = AttributeTypeType.clrToXmlType(clrTypeOrValue as ClrTypeLike);
      return;
    }
    if (clrTypeOrValue === null || clrTypeOrValue === undefined) {
      throw new TypeError('Object reference not set to an instance of an object.');
    }
    this.attributeDataType = AttributeTypeType.clrToXmlType(ClrType.of(clrTypeOrValue));
  }

  /** Sets the specified DateTime value as the attribute value. The AttributeDataType is set to xs:dateTime. */
  setDateTime(value: DateTime, mode: XmlDateTimeSerializationMode): void {
    this.value = XmlConvert.toString(value, mode);
    this.attributeDataType = T.XsdDataTypes.dateTimeType;
  }

  /** Sets the specified double value as the attribute value. The AttributeDataType is set to xs:double. */
  setDouble(value: number): void {
    this.value = XmlConvert.toString(value);
    this.attributeDataType = T.XsdDataTypes.doubleType;
  }

  /** Tries to parse the Attribute Value string as DateTime (see `getDateTime`). */
  tryGetDateTime(dateTimeOption: XmlDateTimeSerializationMode): { result: boolean; dateTimeValue: DateTime } {
    let dateTimeValue: DateTime = DateTime.minValue;
    try {
      dateTimeValue = AttributeTypeType.getDateTime(this.value, dateTimeOption);
      return { result: true, dateTimeValue };
    } catch (e) {
      if (!(e instanceof FormatException)) throw e;
      return { result: false, dateTimeValue };
    }
  }

  /** Tries to parse the Attribute Value string as double (see `getDouble`). */
  tryGetDouble(): { result: boolean; doubleValue: number } {
    let doubleValue = 0.0;
    try {
      doubleValue = AttributeTypeType.getDouble(this.value);
      return { result: true, doubleValue };
    } catch (e) {
      if (!(e instanceof FormatException)) throw e;
      return { result: false, doubleValue };
    }
  }

  /** @internal C# `GetDateTime(string, XmlDateTimeSerializationMode)`. */
  static getDateTime(value: string | null, dateTimeOption: XmlDateTimeSerializationMode): DateTime {
    if (isNullOrEmpty(value)) {
      throw new ArgumentNullException('value', 'The input string is invalid for a date time.');
    }
    const r = AttributeTypeType.tryParseDateTimeWithXmlConverter(value, dateTimeOption);
    if (r.result) {
      return r.resultDateTime;
    }
    let resultDateTime: DateTime | null = parseDateTimeGerman(value);
    if (resultDateTime !== null) {
      return resultDateTime;
    }
    // CurrentCulture, CurrentCulture.Parent and InvariantCulture: all invariant in the port.
    if ((resultDateTime = DateTime.tryParse(value)) !== null) {
      return resultDateTime;
    }
    if ((resultDateTime = DateTime.tryParse(value)) !== null) {
      return resultDateTime;
    }
    if ((resultDateTime = DateTime.tryParse(value)) !== null) {
      return resultDateTime;
    }
    throw new FormatException("Unable to parse '" + value + "' as DateTime.");
  }

  /** @internal C# `GetDouble(string)`. */
  static getDouble(value: string | null): number {
    if (isNullOrEmpty(value)) {
      throw new ArgumentNullException('value', 'The input string is invalid for a double.');
    }
    const r = AttributeTypeType.tryParseDoubleWithXmlConverter(value);
    if (r.result) {
      return r.resultValue;
    }
    let resultValue: number | null = parseDoubleAny(value, GERMAN);
    if (resultValue !== null) {
      return resultValue;
    }
    // CurrentCulture, CurrentCulture.Parent and InvariantCulture: all invariant in the port.
    if ((resultValue = parseDoubleAny(value, INVARIANT)) !== null) {
      return resultValue;
    }
    if ((resultValue = parseDoubleAny(value, INVARIANT)) !== null) {
      return resultValue;
    }
    if ((resultValue = parseDoubleAny(value, INVARIANT)) !== null) {
      return resultValue;
    }
    throw new FormatException("Unable to parse '" + value + "' as double.");
  }

  private static readXsdDataTypes(): string[] {
    return from(T.XsdDataTypes.resourceManager.getResourceSet(null, true, true))
      .select((entry) => entry.value as string | null)
      .toList() as string[];
  }

  private static tryParseDateTimeWithXmlConverter(
    value: string,
    dateTimeOption: XmlDateTimeSerializationMode,
  ): { result: boolean; resultDateTime: DateTime } {
    try {
      return { result: true, resultDateTime: XmlConvert.toDateTime(value, dateTimeOption) };
    } catch (e) {
      if (!(e instanceof FormatException)) throw e;
      return { result: false, resultDateTime: DateTime.minValue };
    }
  }

  private static tryParseDoubleWithXmlConverter(value: string): { result: boolean; resultValue: number } {
    let resultValue = 0.0;
    try {
      resultValue = XmlConvert.toDouble(value);
      return { result: true, resultValue };
    } catch {
      return { result: false, resultValue };
    }
  }
}

registerInterfaces(AttributeTypeType as unknown as abstract new () => unknown, 'IAttributeValueType', 'ICAEXWrapper', 'IXMLWrapper', 'IObjectWithAttributes', 'ICAEXBasicObject');

T.AttributeTypeType = AttributeTypeType;

/** `typeof(T).IsAssignableFrom(typeof(cls))` for classes. */
function isAssignableFrom(type: unknown, cls: { prototype: unknown }): boolean {
  return type === cls || (typeof type === 'function' && cls.prototype instanceof type);
}

/** System.Exception with a message. */
function exception(message: string): Error {
  const e = new Error(message);
  e.name = 'Exception';
  return e;
}

// ---------------------------------------------------------------------------------------------
// Culture specific parsing for the fallbacks of GetDouble/GetDateTime. C# tries the fixed
// fallback culture de-DE first, then the current culture, its parent and the invariant culture;
// the port runs under the invariant culture (like the oracle), so the last three are invariant.

interface NumberCulture {
  readonly decimalSeparator: string;
  readonly groupSeparator: string;
  readonly currencySymbol: string;
  readonly positiveInfinity: string;
  readonly negativeInfinity: string;
  readonly nan: string;
}

const GERMAN: NumberCulture = {
  decimalSeparator: ',',
  groupSeparator: '.',
  currencySymbol: '€',
  positiveInfinity: '∞',
  negativeInfinity: '-∞',
  nan: 'NaN',
};

const INVARIANT: NumberCulture = {
  decimalSeparator: '.',
  groupSeparator: ',',
  currencySymbol: '¤',
  positiveInfinity: 'Infinity',
  negativeInfinity: '-Infinity',
  nan: 'NaN',
};

const isWhite = (ch: string | undefined): boolean => ch === ' ' || (ch !== undefined && ch >= '\t' && ch <= '\r');
const isDigit = (ch: string | undefined): boolean => ch !== undefined && ch >= '0' && ch <= '9';

/** double.TryParse(s, NumberStyles.Any, culture) as .NET implements it (Number.TryParseNumber). */
function parseDoubleAny(s: string, c: NumberCulture): number | null {
  const n = parseNumberAny(s, c);
  if (n !== null) return n;
  // Fallback of .NET for the symbols: infinity and NaN (ordinal, ignoring case).
  let trimmed = s;
  let i = 0;
  let j = trimmed.length;
  while (i < j && isWhite(trimmed[i])) i++;
  while (j > i && isWhite(trimmed[j - 1])) j--;
  trimmed = trimmed.substring(i, j);
  const eq = (a: string, b: string): boolean => a.toUpperCase() === b.toUpperCase();
  if (eq(trimmed, c.positiveInfinity)) return Number.POSITIVE_INFINITY;
  if (eq(trimmed, c.negativeInfinity)) return Number.NEGATIVE_INFINITY;
  if (eq(trimmed, c.nan)) return Number.NaN;
  if (trimmed.startsWith('+')) {
    const rest = trimmed.substring(1);
    if (eq(rest, c.positiveInfinity)) return Number.POSITIVE_INFINITY;
    if (eq(rest, c.nan)) return Number.NaN;
    return null;
  }
  if (trimmed.startsWith('-') && eq(trimmed.substring(1), c.nan)) return Number.NaN;
  return null;
}

function parseNumberAny(s: string, c: NumberCulture): number | null {
  let p = 0;
  const at = (k: number): string | undefined => (k < s.length ? s[k] : undefined);
  const match = (str: string): boolean => str.length > 0 && s.startsWith(str, p);
  let hasSign = false;
  let parens = false;
  let negative = false;
  let currency = false;
  // Leading part: white space, sign, '(' and the currency symbol.
  for (;;) {
    const ch = at(p);
    if (isWhite(ch) && !(hasSign && !currency)) {
      p++;
      continue;
    }
    if (!hasSign && (match('+') || match('-'))) {
      negative = s[p] === '-';
      hasSign = true;
      p++;
    } else if (ch === '(' && !hasSign) {
      hasSign = true;
      parens = true;
      negative = true;
      p++;
    } else if (!currency && match(c.currencySymbol)) {
      currency = true;
      p += c.currencySymbol.length;
    } else {
      break;
    }
  }
  // Digits with group separators and one decimal separator.
  let intDigits = '';
  let fracDigits = '';
  let digits = false;
  let decimal = false;
  for (;;) {
    const ch = at(p);
    if (isDigit(ch)) {
      digits = true;
      if (decimal) fracDigits += ch;
      else intDigits += ch;
      p++;
    } else if (!decimal && match(c.decimalSeparator)) {
      decimal = true;
      p += c.decimalSeparator.length;
    } else if (digits && !decimal && match(c.groupSeparator)) {
      p += c.groupSeparator.length;
    } else {
      break;
    }
  }
  if (!digits) return null;
  // Exponent: only consumed when digits follow.
  let exponent = '';
  if (at(p) === 'e' || at(p) === 'E') {
    let q = p + 1;
    let sign = '';
    if (at(q) === '+' || at(q) === '-') {
      sign = s[q]!;
      q++;
    }
    if (isDigit(at(q))) {
      let e = '';
      while (isDigit(at(q))) e += s[q++];
      exponent = sign + e;
      p = q;
    }
  }
  // Trailing part: white space, sign, ')' and the currency symbol.
  for (;;) {
    const ch = at(p);
    if (ch === undefined) break;
    if (isWhite(ch)) {
      p++;
    } else if (!hasSign && (match('+') || match('-'))) {
      negative = s[p] === '-';
      hasSign = true;
      p++;
    } else if (ch === ')' && parens) {
      parens = false;
      p++;
    } else if (!currency && match(c.currencySymbol)) {
      currency = true;
      p += c.currencySymbol.length;
    } else {
      break;
    }
  }
  if (parens || p !== s.length) return null;
  const text = `${negative ? '-' : ''}${intDigits || '0'}.${fracDigits || '0'}${exponent ? 'e' + exponent : ''}`;
  return Number(text);
}

/**
 * DateTime.TryParse(s, de-DE, DateTimeStyles.None), for the numeric forms: day.month.year (also
 * with '/' or '-'), year-month-day, each with an optional time h:m[:s], and a time h:m[:s] alone
 * (today). Other forms (month names, fractions of seconds, offsets) are left to the invariant
 * parse that follows in the fallback chain.
 */
function parseDateTimeGerman(s: string): DateTime | null {
  const m = /^[\s]*(?:(\d{1,2})[./-](\d{1,2})[./-](\d{2}|\d{4})|(\d{4})[./-](\d{1,2})[./-](\d{1,2}))?(?:(?:^|[\s]+)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?[\s]*$/.exec(s);
  if (m === null) return null;
  const hasDate = m[1] !== undefined || m[4] !== undefined;
  const hasTime = m[7] !== undefined;
  if (!hasDate && !hasTime) return null;
  try {
    let year: number;
    let month: number;
    let day: number;
    if (m[1] !== undefined) {
      day = Number(m[1]);
      month = Number(m[2]);
      year = Number(m[3]);
      if (m[3]!.length === 2) year += year <= 49 ? 2000 : 1900;
    } else if (m[4] !== undefined) {
      year = Number(m[4]);
      month = Number(m[5]);
      day = Number(m[6]);
    } else {
      const today = DateTime.now;
      year = today.year;
      month = today.month;
      day = today.day;
    }
    const hour = hasTime ? Number(m[7]) : 0;
    const minute = hasTime ? Number(m[8]) : 0;
    const second = m[9] !== undefined ? Number(m[9]) : 0;
    return new DateTime(year, month, day, hour, minute, second);
  } catch {
    return null;
  }
}
