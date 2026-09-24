// CLR types and typed values for the attribute value API (AttributeTypeType, CaexValue,
// XmlTypeCodeExtensions). Not part of Aml.Engine: JavaScript has no counterpart for the CLR type
// of a boxed value, which the C# code inspects (`value is ushort`, `value.GetType()`,
// `typeof(int)`), so this module defines the mapping once for the whole port.
//
// Mapping of CLR types to JS values (docs/PORTING.md):
//
// | CLR type                                        | JS value                                |
// |-------------------------------------------------|-----------------------------------------|
// | bool                                            | boolean                                 |
// | double                                          | number                                  |
// | float                                           | number (formatted as a float)           |
// | int, short, sbyte, byte, ushort, uint           | number                                  |
// | long, ulong                                     | bigint                                  |
// | decimal                                         | Decimal (src/system)                    |
// | DateTime, TimeSpan, Uri, Guid                   | DateTime, TimeSpan, Uri, Guid           |
// | string                                          | string                                  |
// | byte[] / string[]                               | Uint8Array / string[]                   |
//
// Values going *into* the engine (setters of `attributeValue`, `CaexValue.value`, `setItem`,
// `setAttributeDataType(value)`): a plain JS value has the CLR type that `ClrType.of` returns.
// A plain number is `int` when it is an integer in the Int32 range (and not -0), otherwise
// `double`; this reproduces what a C# caller gets when passing a numeric literal (`5` is an
// int, `5.5` a double). A bigint is `long`. To pass any other CLR type, wrap the value:
// `ClrValue.ushort(5)`, `ClrValue.float(1.5)`, `ClrValue.ulong(5n)`, `ClrValue.double(5)`.
//
// Values coming *out* of the engine (decoded values) are always plain JS values as in the table;
// they are never ClrValue instances.

import { ArgumentOutOfRangeException } from '../../../system/exceptions.js';
import { DateTime, Decimal, Guid, TimeSpan, Uri, XmlConvert } from '../../../system/index.js';

/** A CLR type (System.Type) as far as the attribute value API needs it. Instances are interned: compare with `===`. */
export class ClrType {
  private static readonly byCtor = new Map<unknown, ClrType>();

  private constructor(
    /** The full CLR name, for example `System.UInt16`. */
    readonly fullName: string,
  ) {}

  static readonly Object = new ClrType('System.Object');
  static readonly String = new ClrType('System.String');
  static readonly Boolean = new ClrType('System.Boolean');
  static readonly SByte = new ClrType('System.SByte');
  static readonly Byte = new ClrType('System.Byte');
  static readonly Int16 = new ClrType('System.Int16');
  static readonly UInt16 = new ClrType('System.UInt16');
  static readonly Int32 = new ClrType('System.Int32');
  static readonly UInt32 = new ClrType('System.UInt32');
  static readonly Int64 = new ClrType('System.Int64');
  static readonly UInt64 = new ClrType('System.UInt64');
  static readonly Single = new ClrType('System.Single');
  static readonly Double = new ClrType('System.Double');
  static readonly Decimal = new ClrType('System.Decimal');
  static readonly DateTime = new ClrType('System.DateTime');
  static readonly TimeSpan = new ClrType('System.TimeSpan');
  static readonly Uri = new ClrType('System.Uri');
  static readonly Guid = new ClrType('System.Guid');
  /** `byte[]`. */
  static readonly ByteArray = new ClrType('System.Byte[]');
  /** `string[]`. */
  static readonly StringArray = new ClrType('System.String[]');
  /** `object[]`. */
  static readonly ObjectArray = new ClrType('System.Object[]');
  static readonly XmlQualifiedName = new ClrType('System.Xml.XmlQualifiedName');

  /** The short name (`UInt16`), like System.Type.Name. */
  get name(): string {
    const i = this.fullName.lastIndexOf('.');
    return i < 0 ? this.fullName : this.fullName.substring(i + 1);
  }

  toString(): string {
    return this.fullName;
  }

  /**
   * Normalizes a `typeof(X)` argument. Accepts a ClrType or a JS constructor standing for the
   * natural CLR type: String, Boolean, Number (double), BigInt (long), Decimal, DateTime,
   * TimeSpan, Uri, Guid, Uint8Array (byte[]), Array (string[]), Object. Any other constructor
   * yields a ClrType of its own (which maps like an unknown CLR type).
   */
  static from(type: ClrTypeLike): ClrType {
    if (type instanceof ClrType) return type;
    const known = ClrType.knownCtor(type);
    if (known !== null) return known;
    let t = ClrType.byCtor.get(type);
    if (t === undefined) {
      t = new ClrType((type as { name?: string }).name || 'Unknown');
      ClrType.byCtor.set(type, t);
    }
    return t;
  }

  private static knownCtor(type: unknown): ClrType | null {
    switch (type) {
      case String:
        return ClrType.String;
      case Boolean:
        return ClrType.Boolean;
      case Number:
        return ClrType.Double;
      case BigInt:
        return ClrType.Int64;
      case Decimal:
        return ClrType.Decimal;
      case DateTime:
        return ClrType.DateTime;
      case TimeSpan:
        return ClrType.TimeSpan;
      case Uri:
        return ClrType.Uri;
      case Guid:
        return ClrType.Guid;
      case Uint8Array:
        return ClrType.ByteArray;
      case Array:
        return ClrType.StringArray;
      case Object:
        return ClrType.Object;
      default:
        return null;
    }
  }

  /** `value.GetType()` for a JS value under the mapping rule of this module (see the module comment). */
  static of(value: unknown): ClrType {
    if (value instanceof ClrValue) return value.type;
    switch (typeof value) {
      case 'string':
        return ClrType.String;
      case 'boolean':
        return ClrType.Boolean;
      case 'bigint':
        return ClrType.Int64;
      case 'number':
        return Number.isInteger(value) && value >= -2147483648 && value <= 2147483647 && !Object.is(value, -0)
          ? ClrType.Int32
          : ClrType.Double;
      default:
        break;
    }
    if (value instanceof Decimal) return ClrType.Decimal;
    if (value instanceof DateTime) return ClrType.DateTime;
    if (value instanceof TimeSpan) return ClrType.TimeSpan;
    if (value instanceof Uri) return ClrType.Uri;
    if (value instanceof Guid) return ClrType.Guid;
    if (value instanceof Uint8Array) return ClrType.ByteArray;
    if (Array.isArray(value)) return value.every((v) => typeof v === 'string' || v === null) ? ClrType.StringArray : ClrType.ObjectArray;
    return ClrType.Object;
  }
}

/** A type argument: a ClrType or a JS constructor (see `ClrType.from`). */
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export type ClrTypeLike = ClrType | Function;

const INTEGER_RANGES = new Map<ClrType, [number, number]>([
  [ClrType.SByte, [-128, 127]],
  [ClrType.Byte, [0, 255]],
  [ClrType.Int16, [-32768, 32767]],
  [ClrType.UInt16, [0, 65535]],
  [ClrType.Int32, [-2147483648, 2147483647]],
  [ClrType.UInt32, [0, 4294967295]],
]);

/**
 * A number tagged with an explicit CLR type, for passing a value of a specific CLR type to the
 * engine where C# inspects the type of the value (`ClrValue.ushort(5)` is a boxed `ushort`).
 */
export class ClrValue {
  private constructor(
    readonly type: ClrType,
    readonly value: number | bigint,
  ) {}

  private static integer(type: ClrType, value: number): ClrValue {
    const [min, max] = INTEGER_RANGES.get(type)!;
    if (!Number.isInteger(value) || value < min || value > max) throw new ArgumentOutOfRangeException('value');
    return new ClrValue(type, value === 0 ? 0 : value);
  }

  private static int64(type: ClrType, value: bigint | number, min: bigint, max: bigint): ClrValue {
    if (typeof value === 'number' && !Number.isInteger(value)) throw new ArgumentOutOfRangeException('value');
    const v = BigInt(value);
    if (v < min || v > max) throw new ArgumentOutOfRangeException('value');
    return new ClrValue(type, v);
  }

  /** A boxed `sbyte`. */
  static sbyte(value: number): ClrValue {
    return ClrValue.integer(ClrType.SByte, value);
  }

  /** A boxed `byte`. */
  static byte(value: number): ClrValue {
    return ClrValue.integer(ClrType.Byte, value);
  }

  /** A boxed `short`. */
  static short(value: number): ClrValue {
    return ClrValue.integer(ClrType.Int16, value);
  }

  /** A boxed `ushort`. */
  static ushort(value: number): ClrValue {
    return ClrValue.integer(ClrType.UInt16, value);
  }

  /** A boxed `int`. */
  static int(value: number): ClrValue {
    return ClrValue.integer(ClrType.Int32, value);
  }

  /** A boxed `uint`. */
  static uint(value: number): ClrValue {
    return ClrValue.integer(ClrType.UInt32, value);
  }

  /** A boxed `long`. */
  static long(value: bigint | number): ClrValue {
    return ClrValue.int64(ClrType.Int64, value, -(2n ** 63n), 2n ** 63n - 1n);
  }

  /** A boxed `ulong`. */
  static ulong(value: bigint | number): ClrValue {
    return ClrValue.int64(ClrType.UInt64, value, 0n, 2n ** 64n - 1n);
  }

  /** A boxed `float` (the number is rounded to single precision). */
  static float(value: number): ClrValue {
    return new ClrValue(ClrType.Single, Math.fround(value));
  }

  /** A boxed `double` (for integral numbers, which are `int` when passed plainly). */
  static double(value: number): ClrValue {
    return new ClrValue(ClrType.Double, value);
  }

  /** The value as `ToString()` formats it under the invariant culture. */
  toString(): string {
    return clrToString(this);
  }

  valueOf(): number | bigint {
    return this.value;
  }
}

/** `value.ToString()` of a double under the invariant culture (shortest round trip, `1E+20`). */
export function doubleToString(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return 'Infinity';
  if (value === Number.NEGATIVE_INFINITY) return '-Infinity';
  return XmlConvert.toString(value);
}

/** `value.ToString()` of a float under the invariant culture. */
export function singleToString(value: number): string {
  if (Number.isNaN(value)) return 'NaN';
  if (value === Number.POSITIVE_INFINITY) return 'Infinity';
  if (value === Number.NEGATIVE_INFINITY) return '-Infinity';
  return XmlConvert.toStringSingle(value);
}

/**
 * `value.ToString()` for a JS value standing for a boxed CLR value, under the invariant culture:
 * booleans give `True`/`False`, numbers the shortest round trip form, arrays their CLR type name.
 */
export function clrToString(value: unknown): string {
  if (value instanceof ClrValue) {
    if (value.type === ClrType.Single) return singleToString(value.value as number);
    if (typeof value.value === 'bigint') return value.value.toString();
    return doubleToString(value.value);
  }
  switch (typeof value) {
    case 'string':
      return value;
    case 'boolean':
      return value ? 'True' : 'False';
    case 'number':
      return doubleToString(value);
    case 'bigint':
      return value.toString();
    default:
      break;
  }
  if (value instanceof Uint8Array || Array.isArray(value)) return ClrType.of(value).fullName;
  if (value instanceof ClrType) return value.fullName;
  return String(value);
}

/** The numeric value of a plain number or a ClrValue (for `(T)value` after a type check). */
export function clrNumber(value: unknown): number {
  return value instanceof ClrValue ? Number(value.value) : (value as number);
}

/** The value of a bigint or a ClrValue of type long/ulong. */
export function clrBigInt(value: unknown): bigint {
  return value instanceof ClrValue ? BigInt(value.value) : (value as bigint);
}
