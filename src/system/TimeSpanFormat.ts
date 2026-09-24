// System.Globalization.TimeSpanFormat for the invariant culture: "c"/"t"/"T" (constant),
// "g", "G" and custom format strings.

import { FormatException } from './exceptions.js';
import type { TimeSpan } from './TimeSpan.js';

const TICKS_PER_SECOND = 10_000_000n;
const TICKS_PER_DAY = 864_000_000_000n;
const LONG_MIN = -(1n << 63n);

function pad(v: number | bigint, len: number): string {
  return v.toString().padStart(len, '0');
}

function invalid(): Error {
  return new FormatException('Input string was not in a correct format.');
}

/** TimeSpan.ToString(format) under the invariant culture. */
export function formatTimeSpan(value: TimeSpan, format: string | null): string {
  if (format === null || format === '') return formatStandard(value, 'c');
  if (format.length === 1) {
    const c = format;
    if (c === 'c' || c === 't' || c === 'T') return formatStandard(value, 'c');
    if (c === 'g' || c === 'G') return formatStandard(value, c);
    throw invalid();
  }
  return formatCustomized(value, format);
}

function formatStandard(value: TimeSpan, format: 'c' | 'g' | 'G'): string {
  let ticks = value.ticks;
  const negative = ticks < 0n;
  let fraction: number;
  let totalSeconds: bigint;
  if (ticks === LONG_MIN) {
    fraction = 4775808;
    totalSeconds = 922337203685n;
  } else {
    if (negative) ticks = -ticks;
    totalSeconds = ticks / TICKS_PER_SECOND;
    fraction = Number(ticks % TICKS_PER_SECOND);
  }
  let fractionText = '';
  if (format === 'c') {
    if (fraction !== 0) fractionText = '.' + pad(fraction, 7);
  } else if (format === 'G') {
    fractionText = '.' + pad(fraction, 7);
  } else if (fraction !== 0) {
    fractionText = '.' + pad(fraction, 7).replace(/0+$/, '');
  }
  const seconds = totalSeconds % 60n;
  const totalMinutes = totalSeconds / 60n;
  const minutes = totalMinutes % 60n;
  const totalHours = totalMinutes / 60n;
  const hours = totalHours % 24n;
  const days = totalHours / 24n;
  let s = negative ? '-' : '';
  if (days > 0n) s += days.toString() + (format === 'c' ? '.' : ':');
  else if (format === 'G') s += '0:';
  s += format === 'g' && hours < 10n ? hours.toString() : pad(hours, 2);
  s += ':' + pad(minutes, 2) + ':' + pad(seconds, 2) + fractionText;
  return s;
}

function repeatCount(format: string, pos: number, ch: string): number {
  let i = pos + 1;
  while (i < format.length && format[i] === ch) i++;
  return i - pos;
}

function parseQuoteString(format: string, pos: number, out: string[]): number {
  const begin = pos;
  const quote = format[pos++];
  let found = false;
  while (pos < format.length) {
    const ch = format[pos++];
    if (ch === quote) {
      found = true;
      break;
    } else if (ch === '\\') {
      if (pos < format.length) out.push(format[pos++]);
      else throw invalid();
    } else {
      out.push(ch);
    }
  }
  if (!found) throw new FormatException(`Cannot find a matching quote character for the character '${quote}'.`);
  return pos - begin;
}

function formatCustomized(value: TimeSpan, format: string): string {
  let day = value.ticks / TICKS_PER_DAY;
  let time = value.ticks % TICKS_PER_DAY;
  if (value.ticks < 0n) {
    day = -day;
    time = -time;
  }
  // (int) cast of the day count: fits for every TimeSpan
  const hours = Number((time / 36_000_000_000n) % 24n);
  const minutes = Number((time / 600_000_000n) % 60n);
  const seconds = Number((time / TICKS_PER_SECOND) % 60n);
  const fraction = Number(time % TICKS_PER_SECOND);
  const out: string[] = [];
  let i = 0;
  while (i < format.length) {
    const ch = format[i];
    let tokenLen: number;
    switch (ch) {
      case 'h':
      case 'm':
      case 's': {
        tokenLen = repeatCount(format, i, ch);
        if (tokenLen > 2) throw invalid();
        out.push(pad(ch === 'h' ? hours : ch === 'm' ? minutes : seconds, tokenLen));
        break;
      }
      case 'f': {
        tokenLen = repeatCount(format, i, ch);
        if (tokenLen > 7) throw invalid();
        out.push(pad(Math.floor(fraction / 10 ** (7 - tokenLen)), tokenLen));
        break;
      }
      case 'F': {
        tokenLen = repeatCount(format, i, ch);
        if (tokenLen > 7) throw invalid();
        let tmp = Math.floor(fraction / 10 ** (7 - tokenLen));
        let effective = tokenLen;
        while (effective > 0 && tmp % 10 === 0) {
          tmp = Math.floor(tmp / 10);
          effective--;
        }
        if (effective > 0) out.push(pad(tmp, effective));
        break;
      }
      case 'd':
        tokenLen = repeatCount(format, i, ch);
        if (tokenLen > 8) throw invalid();
        out.push(pad(day, tokenLen));
        break;
      case "'":
      case '"':
        tokenLen = parseQuoteString(format, i, out);
        break;
      case '%': {
        const next = i + 1 < format.length ? format[i + 1] : null;
        if (next === null || next === '%') throw invalid();
        out.push(formatCustomized(value, next));
        tokenLen = 2;
        break;
      }
      case '\\': {
        const next = i + 1 < format.length ? format[i + 1] : null;
        if (next === null) throw invalid();
        out.push(next);
        tokenLen = 2;
        break;
      }
      default:
        throw invalid();
    }
    i += tokenLen;
  }
  return out.join('');
}
