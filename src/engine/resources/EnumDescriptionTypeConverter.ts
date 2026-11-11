// Port of Aml.Engine.Resources.EnumDescriptionTypeConverter (Aml.Engine.Resources 4.2.1).
// A System.ComponentModel.EnumConverter that converts enum values to the text of their
// [Description] attribute.
//
// TS enums carry no attributes: the [Description] texts of the enums of the ported assemblies
// are the table below (the enums with [TypeConverter(typeof(EnumDescriptionTypeConverter))] and
// CAEXDocument.CAEXSchema). The constructor takes the TS enum object (C# `Type`); an enum value is
// a number of that enum. The methods the C# class inherits from EnumConverter (convertFrom,
// canConvertFrom, canConvertTo) behave like EnumConverter for strings; Enum[] and
// InstanceDescriptor have no counterpart.

import { T } from '../registry.js';
import { FormatException, NotSupportedException } from '../../system/exceptions.js';
import { equalsOrdinalIgnoreCase, isNullOrEmpty } from '../../system/strings.js';
import { isWhiteSpace, trimWhiteSpace } from '../../system/Char.js';
import { TypeConverter, netTypeArgumentName, netTypeName } from '../../system/TypeConverter.js';
import type { TypeArgument } from '../../system/TypeConverter.js';
import { AMLFileContentType } from './files/AMLFileContentType.js';
import { AMLFileType } from './files/AMLFileType.js';
import { AMLDomainEnum } from './files/AMLDomainEnum.js';
import { AMLLibraryTypeEnum } from './files/AMLLibraryTypeEnum.js';
import { StringComparisonAlgorithmEnum } from './catalogue/StringComparisonAlgorithmEnum.js';
import { ClassRepositoryEnum } from './catalogue/ClassRepositoryEnum.js';
import { AccessRightsEnum } from '../services/model/AccessRightsEnum.js';
import { AMLEditionEnum } from '../services/model/AMLEditionEnum.js';

/** The .NET name and the [Description] texts (by member name) of an enum. */
interface EnumInfo {
  readonly fullName: string;
  readonly descriptions: ReadonlyMap<string, string>;
}

let enumTable: Map<object, EnumInfo> | null = null;

/** An enum without [Description] texts. */
const plain = (fullName: string): EnumInfo => ({ fullName, descriptions: new Map() });

/**
 * The .NET names and [Description] texts of the enums of the ported assemblies (built on first
 * use): the enums with [Description] texts and the other enums of Aml.Engine.Resources.
 */
function enumInfo(type: object): EnumInfo | null {
  if (enumTable === null) {
    enumTable = new Map<object, EnumInfo>([
      [AMLFileType, plain('Aml.Engine.Resources.Files.AMLFileType')],
      [AMLDomainEnum, plain('Aml.Engine.Resources.Files.AMLDomainEnum')],
      [AMLLibraryTypeEnum, plain('Aml.Engine.Resources.Files.AMLLibraryTypeEnum')],
      [StringComparisonAlgorithmEnum, plain('Aml.Engine.Resources.Catalogue.StringComparisonAlgorithmEnum')],
      [ClassRepositoryEnum, plain('Aml.Engine.Resources.Catalogue.ClassRepositoryEnum')],
      [
        AMLFileContentType,
        {
          fullName: 'Aml.Engine.Resources.Files.AMLFileContentType',
          descriptions: new Map([
            ['LibraryFile', 'Library File'],
            ['LibraryCollectionFile', 'Library-Collection File'],
            ['ExampleFile', 'Example File'],
            ['LibraryCatalog', 'Library Catalogue'],
            ['ClassRepository', 'Class Catalogue'],
            ['SignatureData', 'Signing Data'],
            ['BackupData', 'Backups'],
            ['None', 'undefined'],
          ]),
        },
      ],
      [
        AccessRightsEnum,
        {
          fullName: 'Aml.Engine.Services.Model.AccessRightsEnum',
          descriptions: new Map([
            ['ReadAccess', 'Read Access'],
            ['WriteAccess', 'Write Access'],
          ]),
        },
      ],
      [
        AMLEditionEnum,
        {
          fullName: 'Aml.Engine.Services.Model.AMLEditionEnum',
          descriptions: new Map([
            ['Edition1', 'Edition 1'],
            ['Edition2', 'Edition 2'],
            ['AllEditions', 'All Editions'],
          ]),
        },
      ],
      [
        T.CAEXDocument.CAEXSchema,
        {
          fullName: 'Aml.Engine.CAEX.CAEXDocument+CAEXSchema',
          descriptions: new Map([
            ['CAEX2_15', '2.15'],
            ['CAEX3_0', '3.0'],
          ]),
        },
      ],
    ]);
  }
  return enumTable.get(type) ?? null;
}

/** Converts an enum value of an enum type to the description string of the enum value. */
export class EnumDescriptionTypeConverter extends TypeConverter {
  private readonly _enumType: object;

  /**
   * Converts an enum value of an enum type to the description string of the enum value.
   * @param type The conversion type (the TS enum object).
   */
  constructor(type: object) {
    super();
    this._enumType = type;
  }

  /** EnumConverter.EnumType. */
  protected get enumType(): object {
    return this._enumType;
  }

  protected override get converterName(): string {
    return 'EnumDescriptionTypeConverter';
  }

  /** `Type.FullName` of the enum type (System.Enum for an enum outside the table). */
  private get enumFullName(): string {
    return enumInfo(this._enumType)?.fullName ?? 'System.Enum';
  }

  /** `Type.Name` of the enum type. */
  private get enumName(): string {
    const fullName = this.enumFullName;
    return fullName.substring(Math.max(fullName.lastIndexOf('.'), fullName.lastIndexOf('+')) + 1);
  }

  /**
   * `value.GetType().GetField(value.ToString())`: the member name of an enum value, "Empty" for
   * the string "Empty" (the public field String.Empty), otherwise no field (null).
   */
  private fieldName(value: unknown): string | null {
    if (typeof value === 'number') {
      const name = (this._enumType as Record<number, unknown>)[value];
      return typeof name === 'string' ? name : null;
    }
    if (typeof value === 'string') {
      return value === 'Empty' ? 'Empty' : null;
    }
    return null;
  }

  /** EnumConverter.CanConvertFrom: from strings (Enum[] and InstanceDescriptor have no counterpart). */
  override canConvertFrom(context: unknown, sourceType: TypeArgument): boolean {
    return sourceType === String || super.canConvertFrom(context, sourceType);
  }

  /** EnumConverter.CanConvertTo: to strings (Enum[] and InstanceDescriptor have no counterpart). */
  override canConvertTo(context: unknown, destinationType: TypeArgument): boolean {
    return super.canConvertTo(context, destinationType);
  }

  /**
   * EnumConverter.ConvertFrom: a string is parsed with Enum.Parse(EnumType, value, ignoreCase: true),
   * comma separated names are combined; FormatException when it is not a valid value.
   */
  override convertFrom(context: unknown, culture: unknown, value: unknown): unknown {
    if (typeof value === 'string') {
      const strValue = value;
      let parsed: number | null;
      if (strValue.includes(',')) {
        let convertedValue = 0;
        parsed = 0;
        for (const v of strValue.split(',')) {
          const n = this.enumParse(v);
          if (n === null) {
            parsed = null;
            break;
          }
          convertedValue |= n;
        }
        if (parsed !== null) parsed = convertedValue;
      } else {
        parsed = this.enumParse(strValue);
      }
      if (parsed === null) {
        throw new FormatException(`${strValue} is not a valid value for ${this.enumName}.`);
      }
      return parsed;
    }
    return super.convertFrom(context, culture, value);
  }

  /**
   * Enum.Parse(EnumType, value, true) of an Int32 enum: an integer (leading sign, trailing white
   * space, then trailing NUL characters as in .NET number parsing) or a member name ignoring
   * case, white space around it trimmed. `null` for any failure
   * (EnumConverter turns every exception into a FormatException).
   */
  private enumParse(value: string): number | null {
    let v = value;
    if (v.length === 0) return null;
    if (isWhiteSpace(v[0])) {
      let i = 0;
      while (i < v.length && isWhiteSpace(v[i])) i++;
      v = v.substring(i);
      if (v.length === 0) return null;
    }
    const c = v[0];
    if ((c >= '0' && c <= '9') || c === '-' || c === '+') {
      const m = /^([+-]?)([0-9]+)[\t\n\v\f\r ]*\0*$/.exec(v);
      if (m !== null) {
        const n = BigInt(m[1] === '-' ? '-' + m[2] : m[2]);
        if (n < -2147483648n || n > 2147483647n) return null; // OverflowException
        return Number(n);
      }
    }
    const subvalue = trimWhiteSpace(v);
    const members = Object.keys(this._enumType)
      .filter((k) => typeof (this._enumType as Record<string, unknown>)[k] === 'number')
      .map((k) => ({ name: k, value: (this._enumType as Record<string, number>)[k] }))
      .sort((a, b) => (a.value >>> 0) - (b.value >>> 0));
    for (const member of members) {
      if (equalsOrdinalIgnoreCase(subvalue, member.name)) {
        return member.value;
      }
    }
    return null;
  }

  /**
   * Converts the given value object to the specified destination type: an enum value to the text of
   * its [Description] (the member name when it has none), "" for null or values without a member.
   * @param destinationType The type to convert the value to (`String`).
   */
  override convertTo(context: unknown, culture: unknown, value: unknown, destinationType: TypeArgument): unknown {
    if (destinationType === String) {
      if (value != null) {
        const field = this.fieldName(value);
        if (field !== null) {
          const description = typeof value === 'number' ? (enumInfo(this._enumType)?.descriptions.get(field) ?? null) : null;
          if (description === null || isNullOrEmpty(description)) {
            return field;
          }
          return description;
        }
      }
      return '';
    }
    return super.convertTo(context, culture, value, destinationType);
  }

  /** The value of ConvertTo is an enum value: its type is the enum type. */
  protected override getConvertToException(value: unknown, destinationType: TypeArgument): Error {
    const typeName = typeof value === 'number' ? this.enumFullName : netTypeName(value);
    return new NotSupportedException(`'${this.converterName}' is unable to convert '${typeName}' to '${netTypeArgumentName(destinationType)}'.`);
  }
}

T.EnumDescriptionTypeConverter = EnumDescriptionTypeConverter;
