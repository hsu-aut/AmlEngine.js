// Port of Aml.Engine.CAEX.Extensions.CaexValue (Aml.Engine 4.5.2): type based access to the value
// elements of a CAEX element, using XmlConvert for encoding and decoding.
//
// Typed values: CLR values are mapped to JS values as described in ./ClrValue.ts. Decoded values
// are plain JS values (bigint for long/ulong, Decimal, DateTime, TimeSpan, Uri, number for the
// other numeric types). Internally the CLR type of a decoded value is tracked, because
// Equals/CompareTo/ToString depend on it in C# (an xs:int 5 does not equal an xs:double 5, a
// float formats with float precision). Culture dependent parts use the invariant culture.

import { T } from '../../registry.js';
import { registerInterfaces } from '../../interfaces.js';
import type { XAttribute, XElement } from '../../../xml/index.js';
import { ArgumentException, ArgumentOutOfRangeException } from '../../../system/exceptions.js';
import { isNullOrEmpty } from '../../../system/strings.js';
import { invariantCompare, ordinalCompare } from '../../../system/linq.js';
import { XmlTypeCode } from '../../../system/XmlTypeCode.js';
import {
  Convert,
  DateTime,
  Decimal,
  Parse,
  TimeSpan,
  Uri,
  UriKind,
  XmlConvert,
  XmlDateTimeSerializationMode,
} from '../../../system/index.js';
import { XmlCAEXAttributes } from '../../xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../../xmlext/XmlCAEXSchema.js';
import { XmlTypeCodeExtensions } from '../../schema/XmlTypeCodeExtensions.js';
import { ClrType, clrBigInt, clrNumber, clrToString, singleToString } from './ClrValue.js';
import type { LocalNameEncoder } from './LocalNameEncoder.js';
import type { NameEncoder } from './NameEncoder.js';
import type { NCNameEncoder } from './NCNameEncoder.js';
import type { NMTokenEncoder } from './NMTokenEncoder.js';
import type { NormalizedStringEncoder } from './NormalizedStringEncoder.js';
import type { TokenEncoder } from './TokenEncoder.js';

/** A decoded value together with its CLR type (null for a null value). */
interface Typed {
  value: unknown;
  type: ClrType | null;
}

const typed = (value: unknown, type: ClrType | null): Typed => ({ value, type: value === null ? null : type });

/**
 * This class can be used for a type based access to the value attributes of a CAEX element. It
 * is required, that the AttributeDataType is set according to the XSD Schema types. If the
 * AttributeDataType is not defined, the type `xs:string` is assumed and the value is not
 * encoded/decoded. CAEX Elements, which use this feature are OrdinalScaledTypeType,
 * NominalScaledTypeType and AttributeTypeType and their derivations. The decoded/encoded value
 * for an attribute can be accessed via the `value` property.
 */
export class CaexValue {
  private static _localNameEncoder: LocalNameEncoder | null = null;
  private static _nameEncoder: NameEncoder | null = null;
  private static _ncNameEncoder: NCNameEncoder | null = null;
  private static _nmTokenEncoder: NMTokenEncoder | null = null;
  private static _normStringEncoder: NormalizedStringEncoder | null = null;
  private static _tokenEncoder: TokenEncoder | null = null;

  private static get localNameEncoder(): LocalNameEncoder {
    return (CaexValue._localNameEncoder ??= new T.LocalNameEncoder());
  }

  private static get nameEncoder(): NameEncoder {
    return (CaexValue._nameEncoder ??= new T.NameEncoder());
  }

  private static get ncNameEncoder(): NCNameEncoder {
    return (CaexValue._ncNameEncoder ??= new T.NCNameEncoder());
  }

  private static get nmTokenEncoder(): NMTokenEncoder {
    return (CaexValue._nmTokenEncoder ??= new T.NMTokenEncoder());
  }

  private static get normStringEncoder(): NormalizedStringEncoder {
    return (CaexValue._normStringEncoder ??= new T.NormalizedStringEncoder());
  }

  private static get tokenEncoder(): TokenEncoder {
    return (CaexValue._tokenEncoder ??= new T.TokenEncoder());
  }

  private readonly typeAttributeName: string | null = null;

  private readonly typeOwner: XElement | null = null;

  private readonly valueOwner: XElement | null = null;

  private _valueElement: XElement | null = null;

  private readonly _valueAttributeName: string | null = null;

  /** Gets a default decoded value according to the defined AttributeDataType. */
  get defaultValue(): unknown {
    return XmlTypeCodeExtensions.defaultDecodedValue(this.typeCodeOfAttribute);
  }

  /**
   * Gets a friendly string of the Attribute value (invariant culture). This string is not in
   * any case equal to the attribute value string, which is always an encoded string, according
   * to the AttributeDataType.
   */
  get friendlyValueString(): string | null {
    if (this.value === null) {
      return '';
    }
    switch (this.typeCodeOfAttribute) {
      case XmlTypeCode.GYearMonth:
        return (this.value as DateTime).toString('y');
      case XmlTypeCode.Date:
        return (this.value as DateTime).toString('d');
      case XmlTypeCode.DateTime:
        return (this.value as DateTime).toString('F');
      case XmlTypeCode.GMonthDay:
        return (this.value as DateTime).toString('m');
      case XmlTypeCode.Time:
        return (this.value as DateTime).toString('T');
      case XmlTypeCode.Duration:
        return (this.value as TimeSpan).toString('c');
      default: {
        const v = this.decodeTyped();
        return v.value === null ? null : typedToString(v);
      }
    }
  }

  /** Gets the Attribute, which defines the AttributeDataType. */
  get typeAttribute(): XAttribute | null {
    return this.typeOwner!.attribute(this.typeAttributeName!);
  }

  /** Gets the XmlTypeCode which is converted from the XSD Schema attribute defined in the `typeAttribute`. */
  get typeCodeOfAttribute(): XmlTypeCode {
    if (this.typeAttribute !== null && !isNullOrEmpty(this.typeAttribute.value)) {
      return XmlTypeCodeExtensions.xmlTypeCodeFromSchemaType(this.typeAttribute.value);
    }
    return XmlTypeCodeExtensions.xmlTypeCodeFromSchemaType(T.XsdDataTypes.stringType);
  }

  /**
   * Gets and sets the value attribute using the type specific XML conversion method. If no
   * AttributeDataType is defined, the value is encoded / decoded as it is. See ./ClrValue.ts for
   * the JS values of the CLR types.
   */
  get value(): unknown {
    return this.getDecodedValue();
  }

  set value(value: unknown) {
    this.setEncodedValue(value);
  }

  /** Gets the Element, which contains the Attribute value. */
  get valueElement(): XElement | null {
    return this._valueElement ?? this.valueOwner!.element(XmlCAEXSchema.xName(this.valueOwner!, this.valueAttributeName!));
  }

  private set valueElement(value: XElement | null) {
    this._valueElement = value;
  }

  /** Gets the Name of the defining value attribute. @internal */
  get valueAttributeName(): string | null {
    return this._valueAttributeName;
  }

  /**
   * @internal
   * Overloads of C#: `(valueOwner, string valueElement)`, `(valueOwner, string valueElement,
   * typeOwner)`, `(valueOwner, XElement valueElement, typeOwner)`, `(valueOwner, string
   * valueElement, typeOwner, typeAttribute)`, `(valueOwner, XElement valueElement, typeOwner,
   * typeAttribute)` and the private parameterless constructor.
   */
  constructor(
    valueOwner?: XElement | null,
    valueElement?: string | XElement | null,
    typeOwner?: XElement | null,
    typeAttribute?: string | null,
  ) {
    if (arguments.length === 0) {
      return;
    }
    if (arguments.length === 2) {
      typeOwner = valueOwner;
    }
    if (arguments.length < 4) {
      typeAttribute = 'AttributeDataType';
    }
    this.typeAttributeName = typeAttribute ?? null;
    if (typeof valueElement === 'string' || valueElement === null || valueElement === undefined) {
      this._valueAttributeName = valueElement ?? null;
    } else {
      this.valueElement = valueElement;
    }
    this.valueOwner = valueOwner ?? null;
    this.typeOwner = typeOwner ?? null;
  }

  /** Translates an XSD schema type (such as "xs:double") to an XmlTypeCode. */
  static typeCode(xsdSchemaType: string | null): XmlTypeCode {
    if (!isNullOrEmpty(xsdSchemaType)) {
      return XmlTypeCodeExtensions.xmlTypeCodeFromSchemaType(xsdSchemaType);
    }
    return XmlTypeCodeExtensions.xmlTypeCodeFromSchemaType(T.XsdDataTypes.stringType);
  }

  /** Type based comparison of attribute values. */
  compareTo(obj: unknown): number {
    if (!(obj instanceof CaexValue)) {
      return 1;
    }
    const caexValue = obj;
    if (caexValue.typeCodeOfAttribute !== this.typeCodeOfAttribute) {
      return 1;
    }
    const decodedValue = this.decodeTyped();
    const decodedValue2 = caexValue.decodeTyped();
    if (decodedValue2.value !== null) {
      if (!isComparable(decodedValue)) {
        if (decodedValue.value === null) throw new TypeError('Object reference not set to an instance of an object.');
        return ordinalCompare(typedToString(decodedValue), typedToString(decodedValue2));
      }
      return compareTyped(decodedValue, decodedValue2);
    }
    return 1;
  }

  /** Determines whether the specified object is equal to this instance (the decoded values are equal). */
  equals(obj: unknown): boolean {
    if (obj instanceof CaexValue && this.value !== null) {
      return equalsTyped(this.decodeTyped(), obj.decodeTyped());
    }
    return false;
  }

  /** The port of GetHashCode: equal instances return the same key. */
  equalityKey(): unknown {
    const v = this.decodeTyped();
    if (v.value === null) {
      return this;
    }
    return hashKey(v);
  }

  /** Determines if the type code derived from the Attribute datatype is a binary type. */
  isBinaryValue(): boolean {
    const typeCodeOfAttribute = this.typeCodeOfAttribute;
    if (typeCodeOfAttribute - 26 >= 0 && typeCodeOfAttribute - 26 <= 1) {
      return true;
    }
    return false;
  }

  /**
   * Determines if the type code derived from the Attribute datatype is a date time type (Time,
   * Date, DateTime, GYearMonth, GMonthDay). Duration is not a date time type.
   */
  isDateTimeType(): boolean {
    const typeCodeOfAttribute = this.typeCodeOfAttribute;
    if ((typeCodeOfAttribute - 18 >= 0 && typeCodeOfAttribute - 18 <= 3) || typeCodeOfAttribute === XmlTypeCode.GMonthDay) {
      return true;
    }
    return false;
  }

  /** Determines if the type code derived from the Attribute datatype is a numeric or boolean type. */
  isNumericOrBooleanValue(): boolean {
    if (!this.isNumericValue()) {
      return this.typeCodeOfAttribute === XmlTypeCode.Boolean;
    }
    return true;
  }

  /** Determines if the type code derived from the Attribute datatype is a numeric type. */
  isNumericValue(): boolean {
    const typeCodeOfAttribute = this.typeCodeOfAttribute;
    if ((typeCodeOfAttribute - 14 >= 0 && typeCodeOfAttribute - 14 <= 2) || (typeCodeOfAttribute - 40 >= 0 && typeCodeOfAttribute - 40 <= 12)) {
      return true;
    }
    return false;
  }

  /** Determines if the type code derived from the Attribute datatype defines a part of a date (GMonth, GDay, GYear). */
  isPartOfDateValue(): boolean {
    const typeCodeOfAttribute = this.typeCodeOfAttribute;
    if (typeCodeOfAttribute === XmlTypeCode.GYear || (typeCodeOfAttribute - 24 >= 0 && typeCodeOfAttribute - 24 <= 1)) {
      return true;
    }
    return false;
  }

  /** Determines if the type code derived from the Attribute datatype is a string type. */
  isStringValue(): boolean {
    switch (this.typeCodeOfAttribute) {
      case XmlTypeCode.Text:
      case XmlTypeCode.AnyAtomicType:
      case XmlTypeCode.String:
      case XmlTypeCode.AnyUri:
      case XmlTypeCode.QName:
      case XmlTypeCode.NormalizedString:
      case XmlTypeCode.Token:
      case XmlTypeCode.Language:
      case XmlTypeCode.NmToken:
      case XmlTypeCode.Name:
      case XmlTypeCode.NCName:
        return true;
      default:
        return false;
    }
  }

  /**
   * Checks for all string data types, if the provided string is valid according to the defined
   * data type. Returns `null`, if the value is valid; otherwise the validation error.
   */
  isValidStringValue(value: string | null): string | null {
    const check = (encoder: TokenEncoder, message: string): string | null => {
      const r = encoder.isValid(value);
      if (!r.result) {
        return r.exception ?? message;
      }
      return null;
    };
    switch (this.typeCodeOfAttribute) {
      case XmlTypeCode.NmToken:
        return check(CaexValue.nmTokenEncoder, 'not a valid NMToken');
      case XmlTypeCode.Name:
        return check(CaexValue.nameEncoder, 'not a valid Name');
      case XmlTypeCode.NormalizedString:
        return check(CaexValue.normStringEncoder, 'not a valid string');
      case XmlTypeCode.Idref:
        return check(CaexValue.normStringEncoder, 'not a valid IDref string');
      case XmlTypeCode.Id:
        return check(CaexValue.normStringEncoder, 'not a valid ID string');
      case XmlTypeCode.NCName:
        return check(CaexValue.ncNameEncoder, 'not a valid NCName');
      case XmlTypeCode.QName:
        return check(CaexValue.localNameEncoder, 'not a valid QName');
      case XmlTypeCode.Token:
        return check(CaexValue.tokenEncoder, 'not a valid token');
      case XmlTypeCode.AnyUri: {
        if (
          value === null ||
          (Uri.tryCreate(value, UriKind.RelativeOrAbsolute) === null &&
            Uri.tryCreate(escapeDataString(value), UriKind.RelativeOrAbsolute) === null)
        ) {
          return 'not a valid Uri string';
        }
        return null;
      }
      case XmlTypeCode.HexBinary: {
        const length = value!.length;
        for (let i = 0; i < length; i += 2) {
          if (i + 2 > length) {
            throw new ArgumentOutOfRangeException('length', 'Index and length must refer to a location within the string.');
          }
          if (!HEX_NUMBER.test(value!.substring(i, i + 2))) {
            return 'not a valid hex string';
          }
        }
        return null;
      }
      case XmlTypeCode.Base64Binary:
        try {
          Convert.fromBase64String(value!);
          return null;
        } catch {
          return 'not a valid base 64 string';
        }
      default:
        return null;
    }
  }

  /**
   * Gets the Decoded Value of the Attribute. This may be null, if no attribute value is defined.
   * With an argument: decodes the provided string (C# overload `GetDecodedValue(string, bool)`).
   * @internal
   */
  getDecodedValue(attributeValue?: string | null, parseOnly = false): unknown {
    if (arguments.length === 0) {
      return this.decodeTyped().value;
    }
    return this.decodeStringTyped(attributeValue ?? null, parseOnly).value;
  }

  private decodeTyped(): Typed {
    return this.decodeStringTyped(
      this._valueElement !== null
        ? this.valueElement!.value
        : XmlCAEXAttributes.getStringValue(this.valueOwner!, XmlCAEXSchema.xName(this.valueOwner!, this.valueAttributeName!)),
      false,
    );
  }

  private decodeStringTyped(attributeValue: string | null, parseOnly: boolean): Typed {
    let result: Typed = typed(null, null);
    if (this.typeAttribute === null) {
      return typed(attributeValue, ClrType.String);
    }
    try {
      const typeCodeOfAttribute = this.typeCodeOfAttribute;
      if (typeCodeOfAttribute === XmlTypeCode.None) {
        return typed(attributeValue, ClrType.String);
      }
      result = typed(XmlTypeCodeExtensions.defaultDecodedValue(typeCodeOfAttribute), defaultDecodedType(typeCodeOfAttribute));
      if (attributeValue === null) {
        return typed(null, null);
      }
      if (isNullOrEmpty(attributeValue)) {
        return typed(null, null);
      }
      let result8: number | null;
      switch (typeCodeOfAttribute) {
        case XmlTypeCode.AnyUri: {
          const result9 = Uri.tryCreate(attributeValue, UriKind.RelativeOrAbsolute);
          return typed(result9, ClrType.Uri);
        }
        case XmlTypeCode.Double: {
          let result12: number | null;
          if (parseOnly && (result12 = Parse.tryParseDouble(attributeValue)) !== null) {
            return typed(result12, ClrType.Double);
          }
          return typed(XmlConvert.toDouble(attributeValue), ClrType.Double);
        }
        case XmlTypeCode.Float: {
          let result11: number | null;
          if (parseOnly && (result11 = Parse.tryParseSingle(attributeValue)) !== null) {
            return typed(result11, ClrType.Single);
          }
          return typed(XmlConvert.toSingle(attributeValue), ClrType.Single);
        }
        case XmlTypeCode.DateTime:
        case XmlTypeCode.Time:
        case XmlTypeCode.Date:
        case XmlTypeCode.GYearMonth:
        case XmlTypeCode.GMonthDay: {
          let result3: DateTime | null;
          if (parseOnly && (result3 = DateTime.tryParse(attributeValue)) !== null) {
            return typed(result3, ClrType.DateTime);
          }
          return typed(XmlConvert.toDateTime(attributeValue, XmlDateTimeSerializationMode.Local), ClrType.DateTime);
        }
        case XmlTypeCode.Decimal:
        case XmlTypeCode.Integer:
        case XmlTypeCode.NonPositiveInteger:
        case XmlTypeCode.NegativeInteger:
        case XmlTypeCode.NonNegativeInteger:
        case XmlTypeCode.PositiveInteger: {
          let result7: Decimal | null;
          if (parseOnly && (result7 = Decimal.tryParse(attributeValue)) !== null) {
            return typed(result7, ClrType.Decimal);
          }
          return typed(XmlConvert.toDecimal(attributeValue), ClrType.Decimal);
        }
        case XmlTypeCode.GMonth:
          if ((result8 = Parse.tryParseUInt16(attributeValue)) === null) {
            return typed(attributeValue, ClrType.String);
          }
          if (parseOnly) {
            return typed(result8, ClrType.UInt16);
          }
          return typed(new DateTime(1, result8, 1).month, ClrType.UInt16);
        case XmlTypeCode.GDay:
          if ((result8 = Parse.tryParseUInt16(attributeValue)) === null) {
            return typed(attributeValue, ClrType.String);
          }
          if (parseOnly) {
            return typed(result8, ClrType.UInt16);
          }
          return typed(new DateTime(1, 1, result8).day, ClrType.UInt16);
        case XmlTypeCode.GYear:
          if ((result8 = Parse.tryParseUInt16(attributeValue)) === null) {
            return typed(attributeValue, ClrType.String);
          }
          if (parseOnly) {
            return typed(result8, ClrType.UInt16);
          }
          return typed(new DateTime(result8, 1, 1).year, ClrType.UInt16);
        case XmlTypeCode.UnsignedShort:
          if (parseOnly && (result8 = Parse.tryParseUInt16(attributeValue)) !== null) {
            return typed(result8, ClrType.UInt16);
          }
          return typed(XmlConvert.toUInt16(attributeValue), ClrType.UInt16);
        case XmlTypeCode.Short: {
          let result5: number | null;
          if (parseOnly && (result5 = Parse.tryParseInt16(attributeValue)) !== null) {
            return typed(result5, ClrType.Int16);
          }
          return typed(XmlConvert.toInt16(attributeValue), ClrType.Int16);
        }
        case XmlTypeCode.UnsignedInt: {
          let result15: number | null;
          if (parseOnly && (result15 = Parse.tryParseUInt32(attributeValue)) !== null) {
            return typed(result15, ClrType.UInt32);
          }
          return typed(XmlConvert.toUInt32(attributeValue), ClrType.UInt32);
        }
        case XmlTypeCode.Int: {
          let result13: number | null;
          if (parseOnly && (result13 = Parse.tryParseInt32(attributeValue)) !== null) {
            return typed(result13, ClrType.Int32);
          }
          return typed(XmlConvert.toInt32(attributeValue), ClrType.Int32);
        }
        case XmlTypeCode.UnsignedLong: {
          let result4: bigint | null;
          if (parseOnly && (result4 = Parse.tryParseUInt64(attributeValue)) !== null) {
            return typed(result4, ClrType.UInt64);
          }
          return typed(XmlConvert.toUInt64(attributeValue), ClrType.UInt64);
        }
        case XmlTypeCode.Long: {
          let result16: bigint | null;
          if (parseOnly && (result16 = Parse.tryParseInt64(attributeValue)) !== null) {
            return typed(result16, ClrType.Int64);
          }
          return typed(XmlConvert.toInt64(attributeValue), ClrType.Int64);
        }
        case XmlTypeCode.Boolean: {
          let result14: boolean | null;
          if (parseOnly && (result14 = Parse.tryParseBoolean(attributeValue)) !== null) {
            return typed(result14, ClrType.Boolean);
          }
          return typed(XmlConvert.toBoolean(attributeValue), ClrType.Boolean);
        }
        case XmlTypeCode.Duration: {
          let result10: TimeSpan | null;
          if (parseOnly && (result10 = TimeSpan.tryParse(attributeValue)) !== null) {
            return typed(result10, ClrType.TimeSpan);
          }
          return typed(XmlConvert.toTimeSpan(attributeValue), ClrType.TimeSpan);
        }
        case XmlTypeCode.UnsignedByte: {
          let result6: number | null;
          if (parseOnly && (result6 = Parse.tryParseByte(attributeValue)) !== null) {
            return typed(result6, ClrType.Byte);
          }
          return typed(XmlConvert.toByte(attributeValue), ClrType.Byte);
        }
        case XmlTypeCode.Byte: {
          let result2: number | null;
          if (parseOnly && (result2 = Parse.tryParseSByte(attributeValue)) !== null) {
            return typed(result2, ClrType.SByte);
          }
          return typed(XmlConvert.toSByte(attributeValue), ClrType.SByte);
        }
        case XmlTypeCode.String:
          return typed(attributeValue, ClrType.String);
        case XmlTypeCode.QName:
        case XmlTypeCode.Name:
          return typed(XmlConvert.decodeName(attributeValue), ClrType.String);
        case XmlTypeCode.NormalizedString:
          return typed(attributeValue, ClrType.String);
        case XmlTypeCode.Base64Binary: {
          const bytes = Convert.fromBase64String(attributeValue);
          return typed(UTF8_DECODER.decode(bytes), ClrType.String);
        }
        default:
          return typed(attributeValue, ClrType.String);
      }
    } catch {
      // OverflowException, FormatException, ArgumentNullException and everything else.
      return result;
    }
  }

  /** Gets the encoded value which can be used to set the attribute value in an XML encoded way. @internal */
  getEncodedValue(value: unknown): string | null {
    try {
      if (value === null || value === undefined) {
        return null;
      }
      if (this.typeAttribute === null) {
        return clrToString(value);
      }
      const typeCodeOfAttribute = this.typeCodeOfAttribute;
      let result: string | null = clrToString(value);
      if (typeCodeOfAttribute === XmlTypeCode.None) {
        return result;
      }
      const text = XmlTypeCodeExtensions.defaultEncodedValue(typeCodeOfAttribute);
      if (this.isDateTimeType()) {
        result = CaexValue.encodeDateTime(value, typeCodeOfAttribute, text);
      } else if (this.isPartOfDateValue()) {
        result = CaexValue.encodeDatePart(value, typeCodeOfAttribute, text);
      } else if (typeCodeOfAttribute === XmlTypeCode.Duration) {
        let result2: TimeSpan | null;
        if (value instanceof TimeSpan) {
          result2 = value;
        } else if ((result2 = TimeSpan.tryParse(clrToString(value))) === null) {
          return result;
        }
        result = XmlConvert.toString(result2);
      } else if (this.isStringValue()) {
        result = CaexValue.encodeString(value, typeCodeOfAttribute);
      } else if (this.isNumericOrBooleanValue()) {
        result = CaexValue.encodeNumericOrBooleanValue(value, typeCodeOfAttribute, text);
      } else if (this.isBinaryValue()) {
        result = clrToString(value);
      }
      return result;
    } catch {
      return null;
    }
  }

  /** @internal */
  setDefaultValue(): void {
    const value = XmlTypeCodeExtensions.defaultEncodedValue(this.typeCodeOfAttribute);
    if (this._valueElement !== null) {
      T.SetElementValueCmd.setValue(this.valueElement!, value);
    } else {
      XmlCAEXAttributes.setStringValue(this.valueOwner!, XmlCAEXSchema.xName(this.valueOwner!, this.valueAttributeName!), value);
    }
  }

  /** Writes the encoded value into the CAEX document. If no AttributeDataType is set, the value is encoded as a string. @internal */
  setEncodedValue(value: unknown): void {
    if (this._valueElement !== null) {
      T.SetElementValueCmd.setValue(this.valueElement!, this.getEncodedValue(value));
    } else {
      XmlCAEXAttributes.setStringValue(this.valueOwner!, XmlCAEXSchema.xName(this.valueOwner!, this.valueAttributeName!), this.getEncodedValue(value));
    }
  }

  private static encodeDatePart(value: unknown, typeCode: XmlTypeCode, fallbackvalue: string): string {
    if (ClrType.of(value) === ClrType.UInt16) {
      const num = clrNumber(value);
      switch (typeCode) {
        case XmlTypeCode.GDay:
          return XmlConvert.toString(new DateTime(1, 1, num), '---dd');
        case XmlTypeCode.GMonth:
          return XmlConvert.toString(new DateTime(1, num, 1), '--MM--');
        case XmlTypeCode.GYear:
          return XmlConvert.toString(new DateTime(num, 1, 1), 'yyyy');
        default:
          return fallbackvalue;
      }
    }
    const result = Parse.tryParseUInt16(clrToString(value));
    if (result === null) {
      return fallbackvalue;
    }
    switch (typeCode) {
      case XmlTypeCode.GDay:
        return XmlConvert.toString(new DateTime(1, 1, result), '---dd');
      case XmlTypeCode.GMonth:
        return XmlConvert.toString(new DateTime(1, result, 1), '--MM--');
      case XmlTypeCode.GYear:
        return XmlConvert.toString(new DateTime(result, 1, 1), 'yyyy');
      default:
        return fallbackvalue;
    }
  }

  private static encodeDateTime(value: unknown, typeCode: XmlTypeCode, fallbackValue: string): string {
    const format = (dateTime: DateTime): string => {
      switch (typeCode) {
        case XmlTypeCode.Time:
          return XmlConvert.toString(dateTime, 'HH:mm:ss');
        case XmlTypeCode.DateTime:
          return XmlConvert.toString(dateTime, XmlDateTimeSerializationMode.Local);
        case XmlTypeCode.Date:
          return XmlConvert.toString(dateTime, 'yyyy-MM-dd');
        case XmlTypeCode.GMonthDay:
          return XmlConvert.toString(dateTime, '--MM-dd');
        case XmlTypeCode.GYearMonth:
          return XmlConvert.toString(dateTime, 'yyyy-MM');
        default:
          return fallbackValue;
      }
    };
    if (value instanceof DateTime) {
      return format(value);
    }
    const result = DateTime.tryParse(clrToString(value));
    return result !== null ? format(result) : fallbackValue;
  }

  private static encodeNumericOrBooleanValue(value: unknown, typeCode: XmlTypeCode, fallbackValue: string): string {
    const type = ClrType.of(value);
    switch (typeCode) {
      case XmlTypeCode.Decimal:
      case XmlTypeCode.Integer:
      case XmlTypeCode.NonPositiveInteger:
      case XmlTypeCode.NegativeInteger:
      case XmlTypeCode.NonNegativeInteger:
      case XmlTypeCode.PositiveInteger: {
        const result2 = value instanceof Decimal ? value : Decimal.tryParse(clrToString(value));
        if (result2 === null) break;
        return XmlConvert.toString(result2);
      }
      case XmlTypeCode.Short: {
        const result7 = type === ClrType.Int16 ? clrNumber(value) : Parse.tryParseInt16(clrToString(value));
        if (result7 === null) break;
        return XmlConvert.toString(result7);
      }
      case XmlTypeCode.UnsignedShort: {
        const result3 = type === ClrType.UInt16 ? clrNumber(value) : Parse.tryParseUInt16(clrToString(value));
        if (result3 === null) break;
        return XmlConvert.toString(result3);
      }
      case XmlTypeCode.Byte: {
        const result12 = type === ClrType.SByte ? clrNumber(value) : Parse.tryParseSByte(clrToString(value));
        if (result12 === null) break;
        return XmlConvert.toString(result12);
      }
      case XmlTypeCode.UnsignedByte: {
        const result8 = type === ClrType.Byte ? clrNumber(value) : Parse.tryParseByte(clrToString(value));
        if (result8 === null) break;
        return XmlConvert.toString(result8);
      }
      case XmlTypeCode.UnsignedInt: {
        const result10 = type === ClrType.UInt32 ? clrNumber(value) : Parse.tryParseUInt32(clrToString(value));
        if (result10 === null) break;
        return XmlConvert.toString(result10);
      }
      case XmlTypeCode.Int: {
        const result11 = type === ClrType.Int32 ? clrNumber(value) : Parse.tryParseInt32(clrToString(value));
        if (result11 === null) break;
        return XmlConvert.toString(result11);
      }
      case XmlTypeCode.UnsignedLong: {
        const result6 = type === ClrType.UInt64 ? clrBigInt(value) : Parse.tryParseUInt64(clrToString(value));
        if (result6 === null) break;
        return XmlConvert.toString(result6);
      }
      case XmlTypeCode.Long: {
        const result4 = type === ClrType.Int64 ? clrBigInt(value) : Parse.tryParseInt64(clrToString(value));
        if (result4 === null) break;
        return XmlConvert.toString(result4);
      }
      case XmlTypeCode.Float: {
        const result9 = type === ClrType.Single ? clrNumber(value) : Parse.tryParseSingle(clrToString(value));
        if (result9 === null) break;
        return XmlConvert.toStringSingle(result9);
      }
      case XmlTypeCode.Double: {
        const result5 = type === ClrType.Double ? clrNumber(value) : Parse.tryParseDouble(clrToString(value));
        if (result5 === null) break;
        return XmlConvert.toString(result5);
      }
      case XmlTypeCode.Boolean: {
        const result = typeof value === 'boolean' ? value : Parse.tryParseBoolean(clrToString(value));
        if (result === null) break;
        return XmlConvert.toString(result);
      }
      default:
        break;
    }
    return fallbackValue;
  }

  private static encodeString(value: unknown, typeCode: XmlTypeCode): string | null {
    if (value === null || value === undefined) {
      return '';
    }
    switch (typeCode) {
      case XmlTypeCode.NmToken:
        return CaexValue.nmTokenEncoder.encode(clrToString(value));
      case XmlTypeCode.Name:
        return CaexValue.nameEncoder.encode(clrToString(value));
      case XmlTypeCode.NormalizedString:
        return CaexValue.normStringEncoder.encode(clrToString(value));
      case XmlTypeCode.NCName:
        return CaexValue.ncNameEncoder.encode(clrToString(value));
      case XmlTypeCode.QName:
        return CaexValue.localNameEncoder.encode(clrToString(value));
      case XmlTypeCode.Token:
        return CaexValue.tokenEncoder.encode(clrToString(value));
      case XmlTypeCode.String:
        return clrToString(value);
      case XmlTypeCode.Base64Binary:
        return Convert.toBase64String(UTF8_ENCODER.encode(clrToString(value) ?? ''));
      default:
        return clrToString(value);
    }
  }
}

registerInterfaces(CaexValue, 'IComparable');

T.CaexValue = CaexValue;

// Encoding.UTF8: invalid sequences become U+FFFD, a BOM is kept (GetString does not strip it).
const UTF8_DECODER = new TextDecoder('utf-8', { ignoreBOM: true });
const UTF8_ENCODER = new TextEncoder();

// int.TryParse(s, NumberStyles.HexNumber, ...): optional .NET white space around hex digits.
const HEX_NUMBER = /^[\t\n\v\f\r ]*[0-9A-Fa-f]+[\t\n\v\f\r ]*$/;

/** Uri.EscapeDataString: everything but the unreserved characters is percent encoded (UTF-8, upper case hex). */
function escapeDataString(s: string): string {
  const wellFormed = s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '�');
  return encodeURIComponent(wellFormed).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/** The CLR type of `XmlTypeCodeExtensions.DefaultDecodedValue(typeCode)`. */
function defaultDecodedType(typeCode: XmlTypeCode): ClrType {
  switch (typeCode) {
    case XmlTypeCode.GMonthDay:
    case XmlTypeCode.GYearMonth:
    case XmlTypeCode.DateTime:
    case XmlTypeCode.Date:
    case XmlTypeCode.Time:
      return ClrType.DateTime;
    case XmlTypeCode.GDay:
    case XmlTypeCode.GMonth:
    case XmlTypeCode.GYear:
      return ClrType.UInt16;
    case XmlTypeCode.Duration:
      return ClrType.TimeSpan;
    case XmlTypeCode.Integer:
    case XmlTypeCode.NonPositiveInteger:
    case XmlTypeCode.NonNegativeInteger:
    case XmlTypeCode.UnsignedShort:
    case XmlTypeCode.Decimal:
    case XmlTypeCode.PositiveInteger:
    case XmlTypeCode.NegativeInteger:
      return ClrType.Decimal;
    case XmlTypeCode.Short:
      return ClrType.Int16;
    case XmlTypeCode.Byte:
      return ClrType.SByte;
    case XmlTypeCode.UnsignedByte:
      return ClrType.Byte;
    case XmlTypeCode.Int:
      return ClrType.Int32;
    case XmlTypeCode.Long:
      return ClrType.Int64;
    case XmlTypeCode.UnsignedInt:
      return ClrType.UInt32;
    case XmlTypeCode.UnsignedLong:
      return ClrType.UInt64;
    case XmlTypeCode.Float:
      return ClrType.Single;
    case XmlTypeCode.Double:
      return ClrType.Double;
    case XmlTypeCode.Boolean:
      return ClrType.Boolean;
    default:
      return ClrType.String;
  }
}

/** `value.ToString()` of a decoded value, with float precision for floats. */
function typedToString(v: Typed): string {
  if (v.type === ClrType.Single) return singleToString(v.value as number);
  return clrToString(v.value);
}

/** `value is IComparable` (Uri is not). */
function isComparable(v: Typed): boolean {
  return v.value !== null && v.type !== ClrType.Uri && v.type !== ClrType.Object;
}

/** `((IComparable)a).CompareTo(b)` for boxed CLR values. */
function compareTyped(a: Typed, b: Typed): number {
  if (a.type !== b.type) {
    throw new ArgumentException(`Object must be of type ${a.type!.name}.`);
  }
  const x = a.value;
  const y = b.value;
  switch (a.type) {
    case ClrType.String:
      return invariantCompare(x as string, y as string);
    case ClrType.Boolean:
      return x === y ? 0 : x ? 1 : -1;
    case ClrType.Int64:
    case ClrType.UInt64:
      return (x as bigint) < (y as bigint) ? -1 : (x as bigint) > (y as bigint) ? 1 : 0;
    case ClrType.Decimal:
      return (x as Decimal).compareTo(y as Decimal);
    case ClrType.DateTime:
    case ClrType.TimeSpan: {
      const tx = (x as DateTime | TimeSpan).ticks;
      const ty = (y as DateTime | TimeSpan).ticks;
      return tx < ty ? -1 : tx > ty ? 1 : 0;
    }
    default: {
      const nx = x as number;
      const ny = y as number;
      if (nx < ny) return -1;
      if (nx > ny) return 1;
      if (nx === ny) return 0;
      // NaN is smaller than every other value and equal to itself.
      if (Number.isNaN(nx)) return Number.isNaN(ny) ? 0 : -1;
      return 1;
    }
  }
}

/** `a.Equals(b)` for boxed CLR values: the types must match (Uri also accepts a string). */
function equalsTyped(a: Typed, b: Typed): boolean {
  if (b.value === null) return false;
  if (a.type === ClrType.Uri) {
    return (a.value as Uri).equals(b.value);
  }
  if (a.type !== b.type) return false;
  switch (a.type) {
    case ClrType.Decimal:
      return (a.value as Decimal).equals(b.value as Decimal);
    case ClrType.DateTime:
    case ClrType.TimeSpan:
      return (a.value as DateTime | TimeSpan).ticks === (b.value as DateTime | TimeSpan).ticks;
    case ClrType.Double:
    case ClrType.Single:
      return a.value === b.value || (Number.isNaN(a.value) && Number.isNaN(b.value));
    default:
      return a.value === b.value;
  }
}

/** A Map key such that `equalsTyped` values (of the same CLR type) give the same key. */
function hashKey(v: Typed): string {
  const t = v.type!.fullName;
  switch (v.type) {
    case ClrType.Decimal: {
      // decimal equality ignores trailing zeros (1.0m == 1m).
      let s = (v.value as Decimal).toString();
      if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
      if (s === '-0') s = '0';
      return `${t}|${s}`;
    }
    case ClrType.DateTime:
    case ClrType.TimeSpan:
      return `${t}|${(v.value as DateTime | TimeSpan).ticks}`;
    case ClrType.Uri:
      return `${t}|${String(v.value)}`;
    default:
      return `${t}|${String(v.value)}`;
  }
}
