// Dictionary<string, TValue> with StringComparer.InvariantCultureIgnoreCase, as used by the MIME
// type mapping table (helper for MappingList and MimeTypeMap, no C# counterpart of its own).
// Enumeration follows the insertion order (the table never removes entries, so this is the order
// of the .NET Dictionary). Keys are compared by their invariant upper-case form, which equals the
// invariant culture comparison for the ASCII keys of the table.

import { ArgumentException, ArgumentNullException } from '../../../system/exceptions.js';

/** A case-insensitive string dictionary keeping the key spelling of the first Add. */
export class InvariantIgnoreCaseDictionary<TValue> implements Iterable<{ key: string; value: TValue }> {
  private readonly _entries = new Map<string, { key: string; value: TValue }>();

  private static fold(key: string | null): string {
    if (key == null) throw new ArgumentNullException('key');
    return key.toUpperCase();
  }

  /** Number of entries. */
  get count(): number {
    return this._entries.size;
  }

  /** `Dictionary.Add`: throws ArgumentException when the key exists. */
  add(key: string, value: TValue): void {
    const folded = InvariantIgnoreCaseDictionary.fold(key);
    if (this._entries.has(folded)) {
      throw new ArgumentException(`An item with the same key has already been added. Key: ${key}`);
    }
    this._entries.set(folded, { key, value });
  }

  /** `Dictionary.TryGetValue`: the value, or `null` when the key does not exist. */
  tryGetValue(key: string): { result: boolean; value: TValue | null } {
    const e = this._entries.get(InvariantIgnoreCaseDictionary.fold(key));
    return e === undefined ? { result: false, value: null } : { result: true, value: e.value };
  }

  /** `Dictionary.ContainsKey`. */
  containsKey(key: string): boolean {
    return this._entries.has(InvariantIgnoreCaseDictionary.fold(key));
  }

  /** Enumerates the key/value pairs (KeyValuePair<string, TValue>) in insertion order. */
  *[Symbol.iterator](): Iterator<{ key: string; value: TValue }> {
    for (const e of this._entries.values()) yield e;
  }
}
