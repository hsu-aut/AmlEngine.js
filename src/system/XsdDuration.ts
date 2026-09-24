// System.Xml.Schema.XsdDuration: the xs:duration parser behind XmlConvert.ToTimeSpan, for
// DurationType.Duration. (Output, XsdDuration(TimeSpan).ToString(), is durationToString in
// TimeSpan.ts.)

import { trimWhiteSpace } from './Char.js';
import { FormatException, OverflowException } from './exceptions.js';
import { TimeSpan } from './TimeSpan.js';

const INT_MAX = 2147483647;
const LONG_MAX = (1n << 63n) - 1n;

interface Duration {
  negative: boolean;
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  nanoseconds: number;
}

type Parsed = { ok: true; value: Duration } | { ok: false; overflow: boolean };

/** TryParseDigits: digits at `pos`; with eatDigits, an overflow skips the rest of the digits. */
function tryParseDigits(s: string, pos: number, eatDigits: boolean): { error: boolean; pos: number; value: number; numDigits: number } {
  const start = pos;
  let result = 0;
  while (pos < s.length && s.charCodeAt(pos) >= 48 && s.charCodeAt(pos) <= 57) {
    const digit = s.charCodeAt(pos) - 48;
    if (result > Math.trunc((INT_MAX - digit) / 10)) {
      if (!eatDigits) return { error: true, pos, value: result, numDigits: 0 };
      const numDigits = pos - start;
      while (pos < s.length && s.charCodeAt(pos) >= 48 && s.charCodeAt(pos) <= 57) pos++;
      return { error: false, pos, value: result, numDigits };
    }
    result = result * 10 + digit;
    pos++;
  }
  return { error: false, pos, value: result, numDigits: pos - start };
}

/** XsdDuration.TryParse(s, DurationType.Duration) */
function tryParse(input: string): Parsed {
  const invalid: Parsed = { ok: false, overflow: false };
  const error: Parsed = { ok: false, overflow: true };
  const r: Duration = { negative: false, years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0, nanoseconds: 0 };
  let parts = 0;
  const s = trimWhiteSpace(input);
  const length = s.length;
  let pos = 0;
  if (pos >= length) return invalid;
  if (s[pos] === '-') {
    pos++;
    r.negative = true;
  }
  if (pos >= length) return invalid;
  if (s[pos++] !== 'P') return invalid;
  let d = tryParseDigits(s, pos, false);
  if (d.error) return error;
  pos = d.pos;
  let value = d.value;
  let numDigits = d.numDigits;
  const next = (eat = false): boolean => {
    d = tryParseDigits(s, pos, eat);
    pos = d.pos;
    value = d.value;
    numDigits = d.numDigits;
    return !d.error;
  };
  const done = (): Parsed => (parts === 0 ? invalid : { ok: true, value: r });
  if (pos >= length) return invalid;
  if (s[pos] === 'Y') {
    if (numDigits === 0) return invalid;
    parts |= 1;
    r.years = value;
    if (++pos === length) return done();
    if (!next()) return error;
    if (pos >= length) return invalid;
  }
  if (s[pos] === 'M') {
    if (numDigits === 0) return invalid;
    parts |= 2;
    r.months = value;
    if (++pos === length) return done();
    if (!next()) return error;
    if (pos >= length) return invalid;
  }
  if (s[pos] === 'D') {
    if (numDigits === 0) return invalid;
    parts |= 4;
    r.days = value;
    if (++pos === length) return done();
    if (!next()) return error;
    if (pos >= length) return invalid;
  }
  if (s[pos] === 'T') {
    if (numDigits !== 0) return invalid;
    pos++;
    if (!next()) return error;
    if (pos >= length) return invalid;
    if (s[pos] === 'H') {
      if (numDigits === 0) return invalid;
      parts |= 8;
      r.hours = value;
      if (++pos === length) return done();
      if (!next()) return error;
      if (pos >= length) return invalid;
    }
    if (s[pos] === 'M') {
      if (numDigits === 0) return invalid;
      parts |= 16;
      r.minutes = value;
      if (++pos === length) return done();
      if (!next()) return error;
      if (pos >= length) return invalid;
    }
    if (s[pos] === '.') {
      pos++;
      parts |= 32;
      r.seconds = value;
      if (!next(true)) return error;
      if (numDigits === 0) value = 0;
      for (; numDigits > 9; numDigits--) value = Math.trunc(value / 10);
      for (; numDigits < 9; numDigits++) value *= 10;
      r.nanoseconds = value;
      if (pos >= length) return invalid;
      if (s[pos] !== 'S') return invalid;
      if (++pos === length) return done();
    } else if (s[pos] === 'S') {
      if (numDigits === 0) return invalid;
      parts |= 32;
      r.seconds = value;
      if (++pos === length) return done();
    }
  }
  if (numDigits !== 0) return invalid;
  if (pos !== length) return invalid;
  return done();
}

/** XsdDuration.TryToTimeSpan(DurationType.Duration): null on overflow. */
function toTimeSpan(v: Duration): TimeSpan | null {
  let ticks = (BigInt(v.years) + BigInt(Math.trunc(v.months / 12))) * 365n;
  ticks += BigInt(v.months % 12) * 30n;
  ticks += BigInt(v.days);
  ticks = ticks * 24n + BigInt(v.hours);
  ticks = ticks * 60n + BigInt(v.minutes);
  ticks = ticks * 60n + BigInt(v.seconds);
  ticks = ticks * 10_000_000n + BigInt(Math.trunc(v.nanoseconds / 100));
  if (v.negative) {
    if (ticks === LONG_MAX + 1n) return TimeSpan.minValue;
    if (ticks > LONG_MAX) return null;
    return new TimeSpan(-ticks);
  }
  if (ticks > LONG_MAX) return null;
  return new TimeSpan(ticks);
}

/** XmlConvert.ToTimeSpan: FormatException for any parse error, OverflowException if too large. */
export function xsdDurationToTimeSpan(s: string | null): TimeSpan {
  // new XsdDuration(null) fails inside the try block of XmlConvert.ToTimeSpan: FormatException
  const p = s === null ? ({ ok: false, overflow: false } as Parsed) : tryParse(s);
  if (!p.ok) throw new FormatException(`The string '${s}' is not a valid TimeSpan value.`);
  const ts = toTimeSpan(p.value);
  if (ts === null) throw new OverflowException('The Duration value cannot be represented as a TimeSpan.');
  return ts;
}
