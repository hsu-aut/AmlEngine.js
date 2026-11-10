// Port of Aml.Engine.Resources.Files.SemanticVersionTypeConverter (Aml.Engine.Resources 4.2.1).
// Copied in C# from NuGet2 (src/Core/SemanticVersionTypeConverter.cs). A System.ComponentModel
// TypeConverter (src/system/TypeConverter.ts); `Type` arguments are constructors (`String`).

import { T } from '../../registry.js';
import { TypeConverter } from '../../../system/TypeConverter.js';
import type { TypeArgument } from '../../../system/TypeConverter.js';
import { SemanticVersion } from './SemanticVersion.js';

/** Converts strings to SemanticVersion objects. */
export class SemanticVersionTypeConverter extends TypeConverter {
  protected override get converterName(): string {
    return 'SemanticVersionTypeConverter';
  }

  /**
   * Returns whether this converter can convert an object of the given type to the type of this
   * converter, using the specified context.
   * @returns `true` for strings.
   */
  override canConvertFrom(_context: unknown, sourceType: TypeArgument): boolean {
    return sourceType === String;
  }

  /**
   * Converts the given object to the type of this converter, using the specified context and
   * culture information.
   * @returns The SemanticVersion of a string (SemanticVersion.TryParse), otherwise `null`.
   */
  override convertFrom(_context: unknown, _culture: unknown, value: unknown): unknown {
    if (typeof value !== 'string') {
      return null;
    }
    const r = SemanticVersion.tryParse(value);
    if (!r.result) {
      return null;
    }
    return r.value;
  }
}

T.SemanticVersionTypeConverter = SemanticVersionTypeConverter;
