// Port of Aml.Engine.Schema.XmlTypeCodeExtensions (Aml.Engine 4.5.2).
// CLR values are mapped to JS values as described in src/engine/caex/extensions/ClrValue.ts.

import { T } from '../registry.js';
import { ArgumentNullException } from '../../system/exceptions.js';
import { XmlTypeCode } from '../../system/XmlTypeCode.js';
import { DateTime, Decimal, TimeSpan, XmlConvert, XmlDateTimeSerializationMode } from '../../system/index.js';
import { ClrType } from '../caex/extensions/ClrValue.js';

/** This static class provides extension methods for the interpretation of XmlTypeCode. */
export class XmlTypeCodeExtensions {
  private constructor() {}

  private static _typeCodeTable: Map<string, XmlTypeCode> | null = null;

  // Initialized lazily: the keys come from the XsdDataTypes resource module.
  private static get typeCodeTable(): Map<string, XmlTypeCode> {
    if (XmlTypeCodeExtensions._typeCodeTable === null) {
      const x = T.XsdDataTypes;
      XmlTypeCodeExtensions._typeCodeTable = new Map<string, XmlTypeCode>([
        [x.anyURIType, XmlTypeCode.AnyUri],
        [x.base64BinaryType, XmlTypeCode.Base64Binary],
        [x.booleanType, XmlTypeCode.Boolean],
        [x.byteType, XmlTypeCode.Byte],
        [x.dateTimeType, XmlTypeCode.DateTime],
        [x.dateType, XmlTypeCode.Date],
        [x.decimalType, XmlTypeCode.Decimal],
        [x.doubleType, XmlTypeCode.Double],
        [x.durationType, XmlTypeCode.Duration],
        [x.entityType, XmlTypeCode.Entity],
        [x.floatType, XmlTypeCode.Float],
        [x.gDayType, XmlTypeCode.GDay],
        [x.gMonthDayType, XmlTypeCode.GMonthDay],
        [x.gMonthType, XmlTypeCode.GMonth],
        [x.gYearMonthType, XmlTypeCode.GYearMonth],
        [x.gYearType, XmlTypeCode.GYear],
        [x.hexBinaryType, XmlTypeCode.HexBinary],
        [x.idrefType, XmlTypeCode.Idref],
        [x.idType, XmlTypeCode.Id],
        [x.integerType, XmlTypeCode.Integer],
        [x.intType, XmlTypeCode.Int],
        [x.languageType, XmlTypeCode.Language],
        [x.longType, XmlTypeCode.Long],
        [x.nameType, XmlTypeCode.Name],
        [x.ncNameType, XmlTypeCode.NCName],
        [x.negativeIntegerType, XmlTypeCode.NegativeInteger],
        [x.nmtokenType, XmlTypeCode.NmToken],
        [x.nonNegativeIntegerType, XmlTypeCode.NonNegativeInteger],
        [x.nonPositiveIntegerType, XmlTypeCode.NonPositiveInteger],
        [x.normalizedStringType, XmlTypeCode.NormalizedString],
        [x.positiveIntegerType, XmlTypeCode.PositiveInteger],
        [x.qNameType, XmlTypeCode.QName],
        [x.shortType, XmlTypeCode.Short],
        [x.stringType, XmlTypeCode.String],
        [x.timeType, XmlTypeCode.Time],
        [x.tokenType, XmlTypeCode.Token],
        [x.unsignedByteType, XmlTypeCode.UnsignedByte],
        [x.unsignedIntType, XmlTypeCode.UnsignedInt],
        [x.unsignedLongType, XmlTypeCode.UnsignedLong],
        [x.unsignedShortType, XmlTypeCode.UnsignedShort],
      ]);
    }
    return XmlTypeCodeExtensions._typeCodeTable;
  }

  /** Gets the CLR type for the provided type code. */
  static attributeType(typeCode: XmlTypeCode): ClrType {
    switch (typeCode) {
      case XmlTypeCode.Boolean:
        return ClrType.Boolean;
      case XmlTypeCode.DateTime:
      case XmlTypeCode.Time:
      case XmlTypeCode.Date:
      case XmlTypeCode.GYearMonth:
      case XmlTypeCode.GMonthDay:
        return ClrType.DateTime;
      case XmlTypeCode.Double:
        return ClrType.Double;
      case XmlTypeCode.Float:
        return ClrType.Single;
      case XmlTypeCode.Int:
        return ClrType.Int32;
      case XmlTypeCode.Short:
        return ClrType.Int16;
      case XmlTypeCode.Byte:
        return ClrType.SByte;
      case XmlTypeCode.GYear:
      case XmlTypeCode.GDay:
      case XmlTypeCode.GMonth:
        return ClrType.UInt16;
      case XmlTypeCode.Long:
        return ClrType.Int64;
      case XmlTypeCode.Decimal:
      case XmlTypeCode.Integer:
      case XmlTypeCode.NonPositiveInteger:
      case XmlTypeCode.NegativeInteger:
      case XmlTypeCode.NonNegativeInteger:
      case XmlTypeCode.PositiveInteger:
        return ClrType.Decimal;
      case XmlTypeCode.UnsignedShort:
        return ClrType.UInt16;
      case XmlTypeCode.UnsignedInt:
        return ClrType.UInt32;
      case XmlTypeCode.UnsignedByte:
        return ClrType.Byte;
      case XmlTypeCode.Duration:
        return ClrType.TimeSpan;
      case XmlTypeCode.UnsignedLong:
        return ClrType.UInt64;
      case XmlTypeCode.AnyUri:
        return ClrType.Uri;
      default:
        return ClrType.String;
    }
  }

  /**
   * Returns the default value for XmlTypeCode.
   * @deprecated Method Default is deprecated, please use DefaultDecodedValue or DefaultEncodedValue instead
   */
  static default(typeCode: XmlTypeCode): unknown {
    return XmlTypeCodeExtensions.defaultEncodedValue(typeCode);
  }

  /**
   * Returns the default value for an XmlTypeCode, as a value of the CLR type of the type code
   * (see `attributeType`), mapped to JS: date and time types give `DateTime.now` (dates
   * `DateTime.now.date`), gDay/gMonth/gYear the current day/month/year as a number, duration
   * `TimeSpan.zero`, decimal based types a Decimal, long/ulong a bigint, other numbers a number,
   * boolean `false`, everything else `''`.
   */
  static defaultDecodedValue(typeCode: XmlTypeCode): unknown {
    switch (typeCode) {
      case XmlTypeCode.GMonthDay:
        return DateTime.now;
      case XmlTypeCode.GYearMonth:
        return DateTime.now;
      case XmlTypeCode.DateTime:
        return DateTime.now;
      case XmlTypeCode.Date:
        return DateTime.now.date;
      case XmlTypeCode.Time:
        return DateTime.now;
      case XmlTypeCode.GDay:
        return DateTime.now.day;
      case XmlTypeCode.GMonth:
        return DateTime.now.month;
      case XmlTypeCode.GYear:
        return DateTime.now.year;
      case XmlTypeCode.Duration:
        return TimeSpan.zero;
      case XmlTypeCode.None:
      case XmlTypeCode.Text:
      case XmlTypeCode.String:
      case XmlTypeCode.QName:
      case XmlTypeCode.Token:
      case XmlTypeCode.Name:
      case XmlTypeCode.NCName:
      case XmlTypeCode.Id:
      case XmlTypeCode.Idref:
        return '';
      case XmlTypeCode.Integer:
      case XmlTypeCode.NonPositiveInteger:
      case XmlTypeCode.NonNegativeInteger:
      case XmlTypeCode.UnsignedShort:
        return Decimal.parse('0');
      case XmlTypeCode.Short:
        return 0;
      case XmlTypeCode.Byte:
        return 0;
      case XmlTypeCode.UnsignedByte:
        return 0;
      case XmlTypeCode.Int:
        return 0;
      case XmlTypeCode.Long:
        return 0n;
      case XmlTypeCode.Decimal:
        return Decimal.parse('0.0');
      case XmlTypeCode.UnsignedInt:
        return 0;
      case XmlTypeCode.UnsignedLong:
        return 0n;
      case XmlTypeCode.PositiveInteger:
        return Decimal.parse('1');
      case XmlTypeCode.Float:
        return 0;
      case XmlTypeCode.Double:
        return 0;
      case XmlTypeCode.NegativeInteger:
        return Decimal.parse('-1');
      case XmlTypeCode.Boolean:
        return false;
      default:
        return '';
    }
  }

  /** Converts the default value for the specified typeCode to a valid XML value string. */
  static defaultEncodedValue(typeCode: XmlTypeCode): string {
    switch (typeCode) {
      case XmlTypeCode.Time:
        return XmlConvert.toString(DateTime.now, 'HH:mm:ss');
      case XmlTypeCode.DateTime:
        return XmlConvert.toString(DateTime.now, XmlDateTimeSerializationMode.Local);
      case XmlTypeCode.GDay:
        return XmlConvert.toString(new DateTime(1, 1, DateTime.now.day), '---dd');
      case XmlTypeCode.GMonth:
        return XmlConvert.toString(new DateTime(1, DateTime.now.month, 1), '--MM--');
      case XmlTypeCode.GYear:
        return XmlConvert.toString(new DateTime(DateTime.now.year, 1, 1), 'yyyy');
      case XmlTypeCode.GMonthDay:
        return XmlConvert.toString(DateTime.now, '--MM-dd');
      case XmlTypeCode.GYearMonth:
        return XmlConvert.toString(DateTime.now, 'yyyy-MM');
      case XmlTypeCode.Duration:
        return XmlConvert.toString(TimeSpan.zero);
      case XmlTypeCode.None:
      case XmlTypeCode.Text:
      case XmlTypeCode.String:
      case XmlTypeCode.QName:
      case XmlTypeCode.Token:
      case XmlTypeCode.Name:
      case XmlTypeCode.NCName:
      case XmlTypeCode.Id:
      case XmlTypeCode.Idref:
        return '';
      case XmlTypeCode.Integer:
      case XmlTypeCode.NonPositiveInteger:
      case XmlTypeCode.NonNegativeInteger:
        return XmlConvert.toString(Decimal.parse('0'));
      case XmlTypeCode.Byte:
        return XmlConvert.toString(0);
      case XmlTypeCode.UnsignedByte:
        return XmlConvert.toString(0);
      case XmlTypeCode.Short:
        return XmlConvert.toString(0);
      case XmlTypeCode.Int:
        return XmlConvert.toString(0);
      case XmlTypeCode.UnsignedShort:
        return XmlConvert.toString(0);
      case XmlTypeCode.Long:
        return XmlConvert.toString(0n);
      case XmlTypeCode.Decimal:
        return XmlConvert.toString(Decimal.parse('0.0'));
      case XmlTypeCode.UnsignedInt:
        return XmlConvert.toString(0);
      case XmlTypeCode.UnsignedLong:
        return XmlConvert.toString(0n);
      case XmlTypeCode.PositiveInteger:
        return XmlConvert.toString(Decimal.parse('1'));
      case XmlTypeCode.Float:
        return XmlConvert.toStringSingle(0);
      case XmlTypeCode.Double:
        return XmlConvert.toString(0.0);
      case XmlTypeCode.NegativeInteger:
        return XmlConvert.toString(Decimal.parse('-1'));
      case XmlTypeCode.Boolean:
        return XmlConvert.toString(false);
      default:
        return '';
    }
  }

  /**
   * Gets the XmlTypeCode from the W3C XSD schema type string (`xs:double` and others). If the
   * schemaType is not recognized, `XmlTypeCode.None` is returned.
   */
  static xmlTypeCodeFromSchemaType(schemaType: string): XmlTypeCode {
    // Dictionary.TryGetValue(null) throws.
    if (schemaType === null || schemaType === undefined) throw new ArgumentNullException('key');
    const value = XmlTypeCodeExtensions.typeCodeTable.get(schemaType);
    if (value === undefined) {
      return XmlTypeCode.None;
    }
    return value;
  }
}
