// Port of Aml.Engine.CAEX.ChangeMode (Aml.Engine 4.5.2).
import { trimWhiteSpace } from '../../system/Char.js';
import { equalsOrdinalIgnoreCase } from '../../system/strings.js';

/** Enumeration for the CAEX ChangeMode attribute. */
export enum ChangeMode {
  /** The state. */
  State,
  /** Create. */
  Create,
  /** Delete. */
  Delete,
  /** Change. */
  Change,
  /** Undefined. */
  Undefined,
}

/**
 * `Enum.TryParse<ChangeMode>(value, ignoreCase: true, out result)`: names (case insensitive),
 * numeric values (also undefined ones) and comma separated name lists (combined with OR).
 * Returns the value or `null` if parsing fails.
 */
export function tryParseChangeMode(value: string | null): ChangeMode | null {
  if (value === null) return null;
  const s = trimWhiteSpace(value);
  if (s.length === 0) return null;
  const c = s[0]!;
  if ((c >= '0' && c <= '9') || c === '-' || c === '+') {
    if (/^[+-]?[0-9]+$/.test(s)) {
      const n = Number(s);
      if (n >= -2147483648 && n <= 2147483647) return n as ChangeMode;
    }
    return null;
  }
  let result = 0;
  for (const part of s.split(',')) {
    const p = trimWhiteSpace(part);
    let found = false;
    for (const key of Object.keys(ChangeMode)) {
      if (!/^[0-9]/.test(key) && equalsOrdinalIgnoreCase(key, p)) {
        result |= ChangeMode[key as keyof typeof ChangeMode];
        found = true;
        break;
      }
    }
    if (!found) return null;
  }
  return result as ChangeMode;
}

/** `ChangeMode.ToString()`: the member name, or the number for undefined values. */
export function changeModeToString(value: ChangeMode): string {
  return ChangeMode[value] ?? String(value);
}
