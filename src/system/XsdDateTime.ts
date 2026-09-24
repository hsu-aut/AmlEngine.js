// System.Xml.Schema.XsdDateTime: the xs:dateTime / date / time / gYearMonth / gYear / gMonthDay /
// gDay / gMonth parser behind XmlConvert.ToDateTime(string, XmlDateTimeSerializationMode), and the
// conversion of the parsed value to a DateTime (zones converted to local time). Output
// (XsdDateTime.ToString for DateTime) is formatXsdDateTime in DateTime.ts.

import { isWhiteSpace } from './Char.js';
import { DateTime, DateTimeKind } from './DateTime.js';
import { FormatException } from './exceptions.js';
import { TimeSpan } from './TimeSpan.js';

/** System.Xml.Schema.XsdDateTimeFlags */
export enum XsdDateTimeFlags {
  DateTime = 0x01,
  Time = 0x02,
  Date = 0x04,
  GYearMonth = 0x08,
  GYear = 0x10,
  GMonthDay = 0x20,
  GDay = 0x40,
  GMonth = 0x80,
  XdrDateTimeNoTz = 0x100,
  XdrDateTime = 0x200,
  XdrTimeNoTz = 0x400,
  AllXsd = 0xff,
}

enum DateTimeTypeCode {
  DateTime,
  Time,
  Date,
  GYearMonth,
  GYear,
  GMonthDay,
  GDay,
  GMonth,
  XdrDateTime,
}

enum XsdDateTimeKind {
  Unspecified,
  Zulu,
  LocalWestOfZulu,
  LocalEastOfZulu,
}

const MAX_FRACTION_DIGITS = 7;
const POWER10 = [-1, 10, 100, 1000, 10000, 100000, 1000000];
const LEAP_YEAR = 1904;

function daysInMonth(year: number, month: number): number {
  return DateTime.daysInMonth(year, month);
}

/** XsdDateTime.Parser (a struct in C#: fields set by a failed attempt stay set). */
class Parser {
  typeCode = DateTimeTypeCode.DateTime;
  year = 0;
  month = 0;
  day = 0;
  hour = 0;
  minute = 0;
  second = 0;
  fraction = 0;
  kind = XsdDateTimeKind.Unspecified;
  zoneHour = 0;
  zoneMinute = 0;
  private text = '';
  private length = 0;

  parse(text: string, kinds: XsdDateTimeFlags): boolean {
    this.text = text;
    this.length = text.length;
    let start = 0;
    while (start < this.length && isWhiteSpace(text[start])) start++;
    const test = (f: number) => (kinds & f) !== 0;
    if (test(XsdDateTimeFlags.DateTime | XsdDateTimeFlags.Date | XsdDateTimeFlags.XdrDateTime | XsdDateTimeFlags.XdrDateTimeNoTz)) {
      if (this.parseDate(start)) {
        if (test(XsdDateTimeFlags.DateTime)) {
          if (this.parseChar(start + 10, 'T') && this.parseTimeAndZoneAndWhitespace(start + 11)) {
            this.typeCode = DateTimeTypeCode.DateTime;
            return true;
          }
        }
        if (test(XsdDateTimeFlags.Date)) {
          if (this.parseZoneAndWhitespace(start + 10)) {
            this.typeCode = DateTimeTypeCode.Date;
            return true;
          }
        }
        if (test(XsdDateTimeFlags.XdrDateTime)) {
          if (this.parseZoneAndWhitespace(start + 10) || (this.parseChar(start + 10, 'T') && this.parseTimeAndZoneAndWhitespace(start + 11))) {
            this.typeCode = DateTimeTypeCode.XdrDateTime;
            return true;
          }
        }
        if (test(XsdDateTimeFlags.XdrDateTimeNoTz)) {
          if (this.parseChar(start + 10, 'T')) {
            if (this.parseTimeAndWhitespace(start + 11)) {
              this.typeCode = DateTimeTypeCode.XdrDateTime;
              return true;
            }
          } else {
            this.typeCode = DateTimeTypeCode.XdrDateTime;
            return true;
          }
        }
      }
    }
    if (test(XsdDateTimeFlags.Time)) {
      if (this.parseTimeAndZoneAndWhitespace(start)) {
        this.year = LEAP_YEAR;
        this.month = 1;
        this.day = 1;
        this.typeCode = DateTimeTypeCode.Time;
        return true;
      }
    }
    if (test(XsdDateTimeFlags.XdrTimeNoTz)) {
      if (this.parseTimeAndWhitespace(start)) {
        this.year = LEAP_YEAR;
        this.month = 1;
        this.day = 1;
        this.typeCode = DateTimeTypeCode.Time;
        return true;
      }
    }
    if (test(XsdDateTimeFlags.GYearMonth | XsdDateTimeFlags.GYear)) {
      const y = this.parse4Dig(start);
      if (y !== null) this.year = y;
      if (y !== null && 1 <= this.year) {
        if (test(XsdDateTimeFlags.GYearMonth)) {
          if (this.parseChar(start + 4, '-') && this.set2Dig(start + 5, 'month') && 1 <= this.month && this.month <= 12 && this.parseZoneAndWhitespace(start + 7)) {
            this.day = 1;
            this.typeCode = DateTimeTypeCode.GYearMonth;
            return true;
          }
        }
        if (test(XsdDateTimeFlags.GYear)) {
          if (this.parseZoneAndWhitespace(start + 4)) {
            this.month = 1;
            this.day = 1;
            this.typeCode = DateTimeTypeCode.GYear;
            return true;
          }
        }
      }
    }
    if (test(XsdDateTimeFlags.GMonthDay | XsdDateTimeFlags.GMonth)) {
      if (this.parseChar(start, '-') && this.parseChar(start + 1, '-') && this.set2Dig(start + 2, 'month') && 1 <= this.month && this.month <= 12) {
        if (test(XsdDateTimeFlags.GMonthDay) && this.parseChar(start + 4, '-')) {
          if (this.set2Dig(start + 5, 'day') && 1 <= this.day && this.day <= daysInMonth(LEAP_YEAR, this.month) && this.parseZoneAndWhitespace(start + 7)) {
            this.year = LEAP_YEAR;
            this.typeCode = DateTimeTypeCode.GMonthDay;
            return true;
          }
        }
        if (test(XsdDateTimeFlags.GMonth)) {
          if (this.parseZoneAndWhitespace(start + 4) || (this.parseChar(start + 4, '-') && this.parseChar(start + 5, '-') && this.parseZoneAndWhitespace(start + 6))) {
            this.year = LEAP_YEAR;
            this.day = 1;
            this.typeCode = DateTimeTypeCode.GMonth;
            return true;
          }
        }
      }
    }
    if (test(XsdDateTimeFlags.GDay)) {
      if (
        this.parseChar(start, '-') &&
        this.parseChar(start + 1, '-') &&
        this.parseChar(start + 2, '-') &&
        this.set2Dig(start + 3, 'day') &&
        1 <= this.day &&
        this.day <= daysInMonth(LEAP_YEAR, 1) &&
        this.parseZoneAndWhitespace(start + 5)
      ) {
        this.year = LEAP_YEAR;
        this.month = 1;
        this.typeCode = DateTimeTypeCode.GDay;
        return true;
      }
    }
    return false;
  }

  private parseDate(start: number): boolean {
    const y = this.parse4Dig(start);
    if (y === null) return false;
    this.year = y;
    return (
      1 <= this.year &&
      this.parseChar(start + 4, '-') &&
      this.set2Dig(start + 5, 'month') &&
      1 <= this.month &&
      this.month <= 12 &&
      this.parseChar(start + 7, '-') &&
      this.set2Dig(start + 8, 'day') &&
      1 <= this.day &&
      this.day <= daysInMonth(this.year, this.month)
    );
  }

  private parseTimeAndZoneAndWhitespace(start: number): boolean {
    const end = this.parseTime(start);
    return end !== null && this.parseZoneAndWhitespace(end);
  }

  private parseTimeAndWhitespace(start: number): boolean {
    let end = this.parseTime(start);
    if (end === null) return false;
    while (end < this.length) end++;
    return end === this.length;
  }

  /** ParseTime(ref start): the position after the time, or null. */
  private parseTime(start: number): number | null {
    if (
      this.set2Dig(start, 'hour') &&
      this.hour < 24 &&
      this.parseChar(start + 2, ':') &&
      this.set2Dig(start + 3, 'minute') &&
      this.minute < 60 &&
      this.parseChar(start + 5, ':') &&
      this.set2Dig(start + 6, 'second') &&
      this.second < 60
    ) {
      start += 8;
      if (this.parseChar(start, '.')) {
        this.fraction = 0;
        let fractionDigits = 0;
        let round = 0;
        while (++start < this.length) {
          const d = this.text.charCodeAt(start) - 48;
          if (d < 0 || d > 9) break;
          if (fractionDigits < MAX_FRACTION_DIGITS) {
            this.fraction = this.fraction * 10 + d;
          } else if (fractionDigits === MAX_FRACTION_DIGITS) {
            if (5 < d) round = 1;
            else if (d === 5) round = -1;
          } else if (round < 0 && d !== 0) {
            round = 1;
          }
          fractionDigits++;
        }
        if (fractionDigits < MAX_FRACTION_DIGITS) {
          if (fractionDigits === 0) return null; // cannot end with .
          this.fraction *= POWER10[MAX_FRACTION_DIGITS - fractionDigits];
        } else {
          if (round < 0) round = this.fraction & 1;
          this.fraction += round;
        }
      }
      return start;
    }
    // cleanup - conflict with gYear
    this.hour = 0;
    return null;
  }

  private parseZoneAndWhitespace(start: number): boolean {
    if (start < this.length) {
      const ch = this.text[start];
      if (ch === 'Z' || ch === 'z') {
        this.kind = XsdDateTimeKind.Zulu;
        start++;
      } else if (start + 5 < this.length) {
        if (this.set2Dig(start + 1, 'zoneHour') && this.zoneHour <= 99 && this.parseChar(start + 3, ':') && this.set2Dig(start + 4, 'zoneMinute') && this.zoneMinute <= 99) {
          if (ch === '-') {
            this.kind = XsdDateTimeKind.LocalWestOfZulu;
            start += 6;
          } else if (ch === '+') {
            this.kind = XsdDateTimeKind.LocalEastOfZulu;
            start += 6;
          }
        }
      }
    }
    while (start < this.length && isWhiteSpace(this.text[start])) start++;
    return start === this.length;
  }

  private parse4Dig(start: number): number | null {
    if (start + 3 < this.length) {
      let num = 0;
      for (let i = 0; i < 4; i++) {
        const d = this.text.charCodeAt(start + i) - 48;
        if (d < 0 || d > 9) return null;
        num = num * 10 + d;
      }
      return num;
    }
    return null;
  }

  /** Parse2Dig(start, ref field): sets the field only on success. */
  private set2Dig(start: number, field: 'month' | 'day' | 'hour' | 'minute' | 'second' | 'zoneHour' | 'zoneMinute'): boolean {
    if (start + 1 < this.length) {
      const d2 = this.text.charCodeAt(start) - 48;
      const d1 = this.text.charCodeAt(start + 1) - 48;
      if (d2 >= 0 && d2 < 10 && d1 >= 0 && d1 < 10) {
        this[field] = d2 * 10 + d1;
        return true;
      }
    }
    return false;
  }

  private parseChar(start: number, ch: string): boolean {
    return start < this.length && this.text[start] === ch;
  }
}

/**
 * new XsdDateTime(s, kinds) followed by the implicit conversion to DateTime. FormatException when
 * the text is not in one of the lexical forms of `kinds`.
 */
export function xsdDateTimeToDateTime(s: string, kinds: XsdDateTimeFlags = XsdDateTimeFlags.AllXsd): DateTime {
  const p = new Parser();
  if (!p.parse(s, kinds)) {
    throw new FormatException(`The string '${s}' is not a valid ${XsdDateTimeFlags[kinds] ?? kinds} value.`);
  }
  // InitiateXsdDateTime
  let dt = new DateTime(p.year, p.month, p.day, p.hour, p.minute, p.second);
  if (p.fraction !== 0) dt = dt.addTicks(p.fraction);

  let result: DateTime;
  switch (p.typeCode) {
    case DateTimeTypeCode.GMonth:
    case DateTimeTypeCode.GDay:
      result = new DateTime(DateTime.now.year, dt.month, dt.day);
      break;
    case DateTimeTypeCode.Time: {
      const now = DateTime.now;
      const addDiff = new DateTime(now.year, now.month, now.day).subtract(new DateTime(dt.year, dt.month, dt.day));
      result = dt.add(addDiff);
      break;
    }
    default:
      result = dt;
      break;
  }

  const zone = () => new TimeSpan(p.zoneHour, p.zoneMinute, 0).ticks;
  switch (p.kind) {
    case XsdDateTimeKind.Zulu:
      return new DateTime(result.ticks, DateTimeKind.Utc);
    case XsdDateTimeKind.LocalEastOfZulu: {
      let ticks = result.ticks - zone();
      if (ticks < 0n) {
        ticks += result.localUtcOffsetTicks();
        if (ticks < 0n) ticks = 0n;
        return new DateTime(ticks, DateTimeKind.Local);
      }
      return new DateTime(ticks, DateTimeKind.Utc).toLocalTime();
    }
    case XsdDateTimeKind.LocalWestOfZulu: {
      let ticks = result.ticks + zone();
      if (ticks > DateTime.MaxTicks) {
        ticks += result.localUtcOffsetTicks();
        if (ticks > DateTime.MaxTicks) ticks = DateTime.MaxTicks;
        return new DateTime(ticks, DateTimeKind.Local);
      }
      return new DateTime(ticks, DateTimeKind.Utc).toLocalTime();
    }
    default:
      return result;
  }
}
