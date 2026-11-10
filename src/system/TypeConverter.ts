// System.ComponentModel.TypeConverter for the port: the base behaviour of the four conversion
// methods that derived converters override. Type parameters are constructors (`String` for
// typeof(string)); ITypeDescriptorContext and CultureInfo arguments are accepted and ignored
// (the port formats with the invariant culture). InstanceDescriptor has no counterpart.

import { ArgumentNullException, NotSupportedException } from './exceptions.js';

/** A `Type` argument: a constructor (`String` stands for System.String). */
export type TypeArgument = unknown;

/**
 * The .NET full type name of a value as `value.GetType().FullName` would give it for the values a
 * converter meets ("(null)" for null, the SR.Null text of the messages).
 */
export function netTypeName(value: unknown): string {
  if (value === null || value === undefined) return '(null)';
  switch (typeof value) {
    case 'string':
      return 'System.String';
    case 'boolean':
      return 'System.Boolean';
    case 'number':
      return Number.isInteger(value) ? 'System.Int32' : 'System.Double';
    case 'bigint':
      return 'System.Int64';
  }
  const name = (value as { constructor?: { name?: string } }).constructor?.name;
  return name !== undefined && name !== '' && name !== 'Object' ? name : 'System.Object';
}

/** The full name of a `Type` argument (System.String for `String`, else the constructor name). */
export function netTypeArgumentName(type: TypeArgument): string {
  if (type === String) return 'System.String';
  if (type === Number) return 'System.Double';
  if (type === Boolean) return 'System.Boolean';
  const name = (type as { name?: string } | null)?.name;
  return name !== undefined && name !== '' ? name : String(type);
}

/** System.ComponentModel.TypeConverter. */
export class TypeConverter {
  /** Returns whether this converter can convert an object of the given type to the type of this converter. */
  canConvertFrom(_context: unknown, _sourceType: TypeArgument): boolean {
    // InstanceDescriptor has no counterpart.
    return false;
  }

  /** Returns whether this converter can convert the object to the specified type. */
  canConvertTo(_context: unknown, destinationType: TypeArgument): boolean {
    return destinationType === String;
  }

  /** Converts the given object to the type of this converter. */
  convertFrom(_context: unknown, _culture: unknown, value: unknown): unknown {
    throw this.getConvertFromException(value);
  }

  /** Converts the given value object to the specified type (System.String: `value.ToString()`, "" for null). */
  convertTo(_context: unknown, _culture: unknown, value: unknown, destinationType: TypeArgument): unknown {
    if (destinationType === null || destinationType === undefined) throw new ArgumentNullException('destinationType');
    if (destinationType === String) {
      if (value === null || value === undefined) return '';
      return String((value as { toString(): string }).toString());
    }
    throw this.getConvertToException(value, destinationType);
  }

  /** The class name used in the messages (`GetType().Name`); derived converters override it. */
  protected get converterName(): string {
    return 'TypeConverter';
  }

  /** The full type name of a value in the messages (`value.GetType().FullName`). */
  protected valueTypeName(value: unknown): string {
    return netTypeName(value);
  }

  /** TypeConverter.GetConvertFromException. */
  protected getConvertFromException(value: unknown): Error {
    return new NotSupportedException(`${this.converterName} cannot convert from ${this.valueTypeName(value)}.`);
  }

  /** TypeConverter.GetConvertToException. */
  protected getConvertToException(value: unknown, destinationType: TypeArgument): Error {
    return new NotSupportedException(`'${this.converterName}' is unable to convert '${this.valueTypeName(value)}' to '${netTypeArgumentName(destinationType)}'.`);
  }
}
