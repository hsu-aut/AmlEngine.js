// Port of Aml.Engine.Resources.XsdDataTypes (Aml.Engine 4.5.2): the strongly typed resource class
// with the XSD data type names. The .resx is not culture specific; the values are embedded here.

import { T } from '../registry.js';

/** A resource entry as `ResourceSet` enumerates it (System.Collections.DictionaryEntry). */
export interface DictionaryEntry {
  readonly key: string;
  readonly value: string;
}

/** The part of System.Resources.ResourceManager that the engine uses for this resource. */
export interface XsdDataTypesResourceManager {
  getString(name: string, culture?: unknown): string | null;
  /** The entries in the enumeration order of the .NET ResourceSet (taken from the original). */
  getResourceSet(culture?: unknown, createIfNotExists?: boolean, tryParents?: boolean): Iterable<DictionaryEntry>;
}

// Resource entries in the order in which the original ResourceSet enumerates them (read from
// Aml.Engine 4.5.2 by enumerating AttributeTypeType.XsdDataTypes).
const ENTRIES: readonly DictionaryEntry[] = [
  ['LongType', 'xs:long'],
  ['BooleanType', 'xs:boolean'],
  ['GDayType', 'xs:gDay'],
  ['ENTITYType', 'xs:ENTITY'],
  ['StringType', 'xs:string'],
  ['ByteType', 'xs:byte'],
  ['GMonthType', 'xs:gMonth'],
  ['IDType', 'xs:ID'],
  ['TimeType', 'xs:time'],
  ['IntegerType', 'xs:integer'],
  ['GYearMonthType', 'xs:gYearMonth'],
  ['DateType', 'xs:date'],
  ['PositiveIntegerType', 'xs:positiveInteger'],
  ['IDREFType', 'xs:IDREF'],
  ['NormalizedStringType', 'xs:normalizedString'],
  ['NegativeIntegerType', 'xs:negativeInteger'],
  ['Base64BinaryType', 'xs:base64Binary'],
  ['UnsignedLongType', 'xs:unsignedLong'],
  ['QNameType', 'xs:QName'],
  ['GMonthDayType', 'xs:gMonthDay'],
  ['NCNameType', 'xs:NCName'],
  ['UnsignedIntType', 'xs:unsignedInt'],
  ['UnsignedShortType', 'xs:unsignedShort'],
  ['AnyURIType', 'xs:anyURI'],
  ['DurationType', 'xs:duration'],
  ['TokenType', 'xs:token'],
  ['NonPositiveIntegerType', 'xs:nonPositiveInteger'],
  ['IDREFSType', 'xs:IDREFS'],
  ['FloatType', 'xs:float'],
  ['UnsignedByteType', 'xs:unsignedByte'],
  ['GYearType', 'xs:gYear'],
  ['NameType', 'xs:Name'],
  ['DecimalType', 'xs:decimal'],
  ['NMTOKENSType', 'xs:NMTOKENS'],
  ['HexBinaryType', 'xs:hexBinary'],
  ['ENTITIESType', 'xs:ENTITIES'],
  ['IntType', 'xs:int'],
  ['DoubleType', 'xs:double'],
  ['NMTOKENType', 'xs:NMTOKEN'],
  ['ShortType', 'xs:short'],
  ['DateTimeType', 'xs:dateTime'],
  ['LanguageType', 'xs:language'],
  ['NonNegativeIntegerType', 'xs:nonNegativeInteger'],
].map(([key, value]) => Object.freeze({ key: key!, value: value! }));

const BY_NAME = new Map<string, string>(ENTRIES.map((e) => [e.key, e.value]));

/** A strongly-typed resource class, for looking up localized strings, etc. */
export class XsdDataTypes {
  private static resourceMan: XsdDataTypesResourceManager | null = null;

  private static resourceCulture: unknown = null;

  /** Returns the cached ResourceManager instance used by this class. */
  static get resourceManager(): XsdDataTypesResourceManager {
    if (XsdDataTypes.resourceMan === null) {
      XsdDataTypes.resourceMan = {
        getString: (name: string) => BY_NAME.get(name) ?? null,
        getResourceSet: () => ENTRIES,
      };
    }
    return XsdDataTypes.resourceMan;
  }

  /** Overrides the current thread's CurrentUICulture for all resource lookups (no effect: the resource is culture invariant). */
  static get culture(): unknown {
    return XsdDataTypes.resourceCulture;
  }

  static set culture(value: unknown) {
    XsdDataTypes.resourceCulture = value;
  }

  private static get(name: string): string {
    return XsdDataTypes.resourceManager.getString(name, XsdDataTypes.resourceCulture)!;
  }

  /** xs:anyURI. */
  static get anyURIType(): string {
    return XsdDataTypes.get('AnyURIType');
  }

  /** xs:base64Binary. */
  static get base64BinaryType(): string {
    return XsdDataTypes.get('Base64BinaryType');
  }

  /** xs:boolean. */
  static get booleanType(): string {
    return XsdDataTypes.get('BooleanType');
  }

  /** xs:byte. */
  static get byteType(): string {
    return XsdDataTypes.get('ByteType');
  }

  /** xs:dateTime. */
  static get dateTimeType(): string {
    return XsdDataTypes.get('DateTimeType');
  }

  /** xs:date. */
  static get dateType(): string {
    return XsdDataTypes.get('DateType');
  }

  /** xs:decimal. */
  static get decimalType(): string {
    return XsdDataTypes.get('DecimalType');
  }

  /** xs:double. */
  static get doubleType(): string {
    return XsdDataTypes.get('DoubleType');
  }

  /** xs:duration. */
  static get durationType(): string {
    return XsdDataTypes.get('DurationType');
  }

  /** xs:ENTITIES. */
  static get entitiesType(): string {
    return XsdDataTypes.get('ENTITIESType');
  }

  /** xs:ENTITY. */
  static get entityType(): string {
    return XsdDataTypes.get('ENTITYType');
  }

  /** xs:float. */
  static get floatType(): string {
    return XsdDataTypes.get('FloatType');
  }

  /** xs:gDay. */
  static get gDayType(): string {
    return XsdDataTypes.get('GDayType');
  }

  /** xs:gMonthDay. */
  static get gMonthDayType(): string {
    return XsdDataTypes.get('GMonthDayType');
  }

  /** xs:gMonth. */
  static get gMonthType(): string {
    return XsdDataTypes.get('GMonthType');
  }

  /** xs:gYearMonth. */
  static get gYearMonthType(): string {
    return XsdDataTypes.get('GYearMonthType');
  }

  /** xs:gYear. */
  static get gYearType(): string {
    return XsdDataTypes.get('GYearType');
  }

  /** xs:hexBinary. */
  static get hexBinaryType(): string {
    return XsdDataTypes.get('HexBinaryType');
  }

  /** xs:IDREFS. */
  static get idrefsType(): string {
    return XsdDataTypes.get('IDREFSType');
  }

  /** xs:IDREF. */
  static get idrefType(): string {
    return XsdDataTypes.get('IDREFType');
  }

  /** xs:ID. */
  static get idType(): string {
    return XsdDataTypes.get('IDType');
  }

  /** xs:integer. */
  static get integerType(): string {
    return XsdDataTypes.get('IntegerType');
  }

  /** xs:int. */
  static get intType(): string {
    return XsdDataTypes.get('IntType');
  }

  /** xs:language. */
  static get languageType(): string {
    return XsdDataTypes.get('LanguageType');
  }

  /** xs:long. */
  static get longType(): string {
    return XsdDataTypes.get('LongType');
  }

  /** xs:Name. */
  static get nameType(): string {
    return XsdDataTypes.get('NameType');
  }

  /** xs:NCName. */
  static get ncNameType(): string {
    return XsdDataTypes.get('NCNameType');
  }

  /** xs:negativeInteger. */
  static get negativeIntegerType(): string {
    return XsdDataTypes.get('NegativeIntegerType');
  }

  /** xs:NMTOKENS. */
  static get nmtokensType(): string {
    return XsdDataTypes.get('NMTOKENSType');
  }

  /** xs:NMTOKEN. */
  static get nmtokenType(): string {
    return XsdDataTypes.get('NMTOKENType');
  }

  /** xs:nonNegativeInteger. */
  static get nonNegativeIntegerType(): string {
    return XsdDataTypes.get('NonNegativeIntegerType');
  }

  /** xs:nonPositiveInteger. */
  static get nonPositiveIntegerType(): string {
    return XsdDataTypes.get('NonPositiveIntegerType');
  }

  /** xs:normalizedString. */
  static get normalizedStringType(): string {
    return XsdDataTypes.get('NormalizedStringType');
  }

  /** xs:positiveInteger. */
  static get positiveIntegerType(): string {
    return XsdDataTypes.get('PositiveIntegerType');
  }

  /** xs:QName. */
  static get qNameType(): string {
    return XsdDataTypes.get('QNameType');
  }

  /** xs:short. */
  static get shortType(): string {
    return XsdDataTypes.get('ShortType');
  }

  /** xs:string. */
  static get stringType(): string {
    return XsdDataTypes.get('StringType');
  }

  /** xs:time. */
  static get timeType(): string {
    return XsdDataTypes.get('TimeType');
  }

  /** xs:token. */
  static get tokenType(): string {
    return XsdDataTypes.get('TokenType');
  }

  /** xs:unsignedByte. */
  static get unsignedByteType(): string {
    return XsdDataTypes.get('UnsignedByteType');
  }

  /** xs:unsignedInt. */
  static get unsignedIntType(): string {
    return XsdDataTypes.get('UnsignedIntType');
  }

  /** xs:unsignedLong. */
  static get unsignedLongType(): string {
    return XsdDataTypes.get('UnsignedLongType');
  }

  /** xs:unsignedShort. */
  static get unsignedShortType(): string {
    return XsdDataTypes.get('UnsignedShortType');
  }

  /** @internal */
  constructor() {}
}

T.XsdDataTypes = XsdDataTypes;
