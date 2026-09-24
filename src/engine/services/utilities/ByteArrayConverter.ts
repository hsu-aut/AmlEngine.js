// Port of Aml.Engine.Services.Utilities.ByteArrayConverter (Aml.Engine 4.5.2).
//
// A System.Text.Json converter for byte[] written as a JSON array of numbers. There is no
// Utf8JsonReader/Writer here: `read` takes the parsed JSON value, `write` returns the JSON value.

import { T } from '../../registry.js';

/** Converts byte arrays to and from JSON number arrays. */
export class ByteArrayConverter {
  /** Reads a byte array from a JSON array of numbers (each value cast to byte); null gives an empty array. */
  read(json: unknown, _typeToConvert: unknown = null, _options: unknown = null): Uint8Array {
    const array = json as readonly number[] | null;
    if (array === null || array === undefined) {
      return new Uint8Array(0);
    }
    const array2 = new Uint8Array(array.length);
    for (let i = 0; i < array.length; i++) {
      // C#: JsonSerializer.Deserialize<short[]>, then (byte)value (unchecked: low 8 bits).
      array2[i] = array[i] & 0xff;
    }
    return array2;
  }

  /** Writes the bytes as a JSON array of numbers. */
  write(value: Uint8Array, _options: unknown = null): number[] {
    const result: number[] = [];
    for (const value2 of value) {
      result.push(value2);
    }
    return result;
  }
}

T.ByteArrayConverter = ByteArrayConverter;
