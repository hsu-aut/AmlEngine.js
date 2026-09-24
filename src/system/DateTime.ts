// System.DateTime: 100 ns ticks since 0001-01-01 (bigint) plus a DateTimeKind.
//
// Local time conversions use the host time zone through JS Date (IANA tz data). .NET on Windows
// uses the Windows registry rules instead, which ignore most of the history of a zone (e.g. no
// DST before 1980 in Germany in IANA, but the current rule applied to every year on Windows);
// results for such dates differ, see docs/deviations.md. For the present era both agree.
//
// Like .NET, a Local DateTime produced by ToLocalTime() remembers whether it falls in the
// ambiguous hour at the end of DST as the daylight instance (DateTime's hidden
// KindLocalAmbiguousDst state), so ToUniversalTime() and XmlConvert round trip it.
//
// Formatting implements DateTime.ToString(format) for the invariant culture (standard and custom
// formats). Parsing (DateTime.TryParse / Parse) lives in DateTimeParse.ts.

import { ArgumentException, ArgumentOutOfRangeException, FormatException } from './exceptions.js';
import { TimeSpan } from './TimeSpan.js';
import { dateTimeParse, dateTimeTryParse, DateTimeStyles } from './DateTimeParse.js';

export enum DateTimeKind {
  Unspecified = 0,
  Utc = 1,
  Local = 2,
}

export enum DayOfWeek {
  Sunday = 0,
  Monday = 1,
  Tuesday = 2,
  Wednesday = 3,
  Thursday = 4,
  Friday = 5,
  Saturday = 6,
}

const TICKS_PER_MS = 10_000n;
const TICKS_PER_SECOND = 10_000_000n;
const TICKS_PER_MINUTE = 600_000_000n;
const TICKS_PER_HOUR = 36_000_000_000n;
const TICKS_PER_DAY = 864_000_000_000n;
const DAYS_PER_400 = 146097;
const DAYS_PER_100 = 36524;
const DAYS_PER_4 = 1461;
const DAYS_PER_YEAR = 365;
const MAX_TICKS = 3155378975999999999n;
/** Ticks of 1970-01-01T00:00:00. */
const UNIX_EPOCH_TICKS = 621355968000000000n;

const DAYS_TO_MONTH_365 = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
const DAYS_TO_MONTH_366 = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366];

export const invariantDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const invariantAbbreviatedDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const invariantMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const invariantAbbreviatedMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function isLeapYear(year: number): boolean {
  return (year & 3) === 0 && ((year & 15) === 0 || year % 25 !== 0);
}

function daysToYear(year: number): number {
  const y = year - 1;
  const cent = Math.floor(y / 100);
  return Math.floor((y * (365 * 4 + 1)) / 4) - cent + Math.floor(cent / 4);
}

function dateToTicks(year: number, month: number, day: number): bigint {
  if (!Number.isInteger(year) || year < 1 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1) {
    throw badYearMonthDay();
  }
  const days = isLeapYear(year) ? DAYS_TO_MONTH_366 : DAYS_TO_MONTH_365;
  if (day > days[month] - days[month - 1]) throw badYearMonthDay();
  const n = daysToYear(year) + days[month - 1] + day - 1;
  return BigInt(n) * TICKS_PER_DAY;
}

function timeToTicks(hour: number, minute: number, second: number): bigint {
  if (!isIntIn(hour, 0, 23) || !isIntIn(minute, 0, 59) || !isIntIn(second, 0, 59)) {
    throw new ArgumentOutOfRangeException(null, 'Hour, Minute, and Second parameters describe an un-representable DateTime.');
  }
  return BigInt(hour * 3600 + minute * 60 + second) * TICKS_PER_SECOND;
}

function isIntIn(v: number, lo: number, hi: number): boolean {
  return Number.isInteger(v) && v >= lo && v <= hi;
}

function badYearMonthDay(): Error {
  return new ArgumentOutOfRangeException(null, 'Year, Month, and Day parameters describe an un-representable DateTime.');
}

function dateArithmetic(param: string): Error {
  return new ArgumentOutOfRangeException(param, 'The added or subtracted value results in an un-representable DateTime.');
}

function checkKind(kind: DateTimeKind): void {
  if (kind !== DateTimeKind.Unspecified && kind !== DateTimeKind.Utc && kind !== DateTimeKind.Local) {
    throw new ArgumentException('Invalid DateTimeKind value.', 'kind');
  }
}

/** Year, month (1..12), day (1..31) and day of year (0 based) of a day number. */
function getDate(dayNumber: number): { year: number; month: number; day: number; dayOfYear: number } {
  let n = dayNumber;
  const y400 = Math.floor(n / DAYS_PER_400);
  n -= y400 * DAYS_PER_400;
  let y100 = Math.floor(n / DAYS_PER_100);
  if (y100 === 4) y100 = 3;
  n -= y100 * DAYS_PER_100;
  const y4 = Math.floor(n / DAYS_PER_4);
  n -= y4 * DAYS_PER_4;
  let y1 = Math.floor(n / DAYS_PER_YEAR);
  if (y1 === 4) y1 = 3;
  const year = y400 * 400 + y100 * 100 + y4 * 4 + y1 + 1;
  n -= y1 * DAYS_PER_YEAR;
  const leap = y1 === 3 && (y4 !== 24 || y100 === 3);
  const days = leap ? DAYS_TO_MONTH_366 : DAYS_TO_MONTH_365;
  let m = (n >> 5) + 1;
  while (n >= days[m]) m++;
  return { year, month: m, day: n - days[m - 1] + 1, dayOfYear: n };
}

// ---------------------------------------------------------------------------------------------
// Host time zone (TimeZoneInfo.Local) through JS Date.

/** UTC offset in ticks of the host time zone at a UTC instant (clamped to the JS Date range). */
function offsetAtUtc(utcTicks: bigint): bigint {
  let ms = Number((utcTicks - UNIX_EPOCH_TICKS) / TICKS_PER_MS);
  if (ms < -8.64e15) ms = -8.64e15;
  if (ms > 8.64e15) ms = 8.64e15;
  const minutes = -new Date(ms).getTimezoneOffset();
  return BigInt(Math.round(minutes * 60)) * TICKS_PER_SECOND;
}

/**
 * The offsets o for which local time `localTicks` equals utc + o with offsetAtUtc(utc) === o.
 * Two offsets: the local time is ambiguous (end of DST); none: it is invalid (start of DST).
 * `around` holds the offsets just before and after (used for invalid times).
 */
function localCandidates(localTicks: bigint): { valid: bigint[]; around: bigint[] } {
  const a = offsetAtUtc(localTicks - TICKS_PER_DAY);
  const b = offsetAtUtc(localTicks + TICKS_PER_DAY);
  const c = offsetAtUtc(localTicks);
  const set = [...new Set([a, b, c])];
  const valid = set.filter((o) => offsetAtUtc(localTicks - o) === o).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  return { valid, around: set };
}

/**
 * TimeZoneInfo.Local.GetUtcOffset for a local (or unspecified) date time: ambiguous and invalid
 * times get the standard (smaller) offset, unless the value is the daylight instance of an
 * ambiguous time.
 */
function localUtcOffset(localTicks: bigint, ambiguousDst: boolean): bigint {
  const { valid, around } = localCandidates(localTicks);
  if (valid.length === 1) return valid[0];
  if (valid.length >= 2) return ambiguousDst ? valid[valid.length - 1] : valid[0];
  return around.reduce((m, o) => (o < m ? o : m));
}

// ---------------------------------------------------------------------------------------------

export class DateTime {
  static readonly TicksPerMillisecond = TICKS_PER_MS;
  static readonly TicksPerSecond = TICKS_PER_SECOND;
  static readonly TicksPerMinute = TICKS_PER_MINUTE;
  static readonly TicksPerHour = TICKS_PER_HOUR;
  static readonly TicksPerDay = TICKS_PER_DAY;
  static readonly MaxTicks = MAX_TICKS;

  static readonly minValue = new DateTime(0n, DateTimeKind.Unspecified);
  static readonly maxValue = new DateTime(MAX_TICKS, DateTimeKind.Unspecified);
  static readonly unixEpoch = new DateTime(UNIX_EPOCH_TICKS, DateTimeKind.Utc);

  private readonly _ticks: bigint;
  private readonly _kind: DateTimeKind;
  /** .NET KindLocalAmbiguousDst: Local value in the ambiguous hour, daylight instance. */
  private readonly _ambiguousDst: boolean;

  /**
   * new DateTime(ticks: bigint[, kind]) or
   * new DateTime(year, month, day[, hour, minute, second[, millisecond[, kind]]]).
   * (.NET's (y, M, d, h, m, s, kind) overload: pass millisecond 0 before the kind.)
   */
  constructor(ticks: bigint, kind?: DateTimeKind);
  constructor(year: number, month: number, day: number, hour?: number, minute?: number, second?: number, millisecond?: number, kind?: DateTimeKind);
  constructor(a: bigint | number, b?: number, c?: number, d?: number, e?: number, f?: number, g?: number, h?: DateTimeKind) {
    if (typeof a === 'bigint') {
      if (a < 0n || a > MAX_TICKS) {
        throw new ArgumentOutOfRangeException('ticks', 'Ticks must be between DateTime.MinValue.Ticks and DateTime.MaxValue.Ticks.');
      }
      const kind = b ?? DateTimeKind.Unspecified;
      checkKind(kind);
      this._ticks = a;
      this._kind = kind;
      this._ambiguousDst = false;
      return;
    }
    const kind = h ?? DateTimeKind.Unspecified;
    const ms = g ?? 0;
    if (!isIntIn(ms, 0, 999)) {
      throw new ArgumentOutOfRangeException('millisecond', 'Valid values are between 0 and 999, inclusive.');
    }
    checkKind(kind);
    const ticks = dateToTicks(a, b!, c!) + timeToTicks(d ?? 0, e ?? 0, f ?? 0) + BigInt(ms) * TICKS_PER_MS;
    this._ticks = ticks;
    this._kind = kind;
    this._ambiguousDst = false;
  }

  /** Internal factory keeping the hidden ambiguous-DST state. */
  private static make(ticks: bigint, kind: DateTimeKind, ambiguousDst = false): DateTime {
    const dt = new DateTime(ticks, kind);
    if (ambiguousDst) (dt as unknown as { _ambiguousDst: boolean })._ambiguousDst = true;
    return dt;
  }

  static fromTicks(ticks: bigint, kind: DateTimeKind = DateTimeKind.Unspecified): DateTime {
    return new DateTime(ticks, kind);
  }

  /** DateTime.SpecifyKind */
  static specifyKind(value: DateTime, kind: DateTimeKind): DateTime {
    return new DateTime(value._ticks, kind);
  }

  static isLeapYear(year: number): boolean {
    if (!isIntIn(year, 1, 9999)) throw new ArgumentOutOfRangeException('year', 'Year must be between 1 and 9999.');
    return isLeapYear(year);
  }

  static daysInMonth(year: number, month: number): number {
    if (!isIntIn(month, 1, 12)) throw new ArgumentOutOfRangeException('month', 'Month must be between one and twelve.');
    if (!isIntIn(year, 1, 9999)) throw new ArgumentOutOfRangeException('year', 'Year must be between 1 and 9999.');
    const days = isLeapYear(year) ? DAYS_TO_MONTH_366 : DAYS_TO_MONTH_365;
    return days[month] - days[month - 1];
  }

  static get utcNow(): DateTime {
    return new DateTime(BigInt(Date.now()) * TICKS_PER_MS + UNIX_EPOCH_TICKS, DateTimeKind.Utc);
  }

  static get now(): DateTime {
    return DateTime.utcNow.toLocalTime();
  }

  static get today(): DateTime {
    return DateTime.now.date;
  }

  get ticks(): bigint {
    return this._ticks;
  }

  get kind(): DateTimeKind {
    return this._kind;
  }

  /** @internal the .NET KindLocalAmbiguousDst flag */
  get isAmbiguousDaylightSavingTime(): boolean {
    return this._ambiguousDst;
  }

  private get dayNumber(): number {
    return Number(this._ticks / TICKS_PER_DAY);
  }

  private get tickOfDay(): number {
    return Number(this._ticks % TICKS_PER_DAY);
  }

  get year(): number {
    return getDate(this.dayNumber).year;
  }

  get month(): number {
    return getDate(this.dayNumber).month;
  }

  get day(): number {
    return getDate(this.dayNumber).day;
  }

  get dayOfYear(): number {
    return getDate(this.dayNumber).dayOfYear + 1;
  }

  get dayOfWeek(): DayOfWeek {
    return ((this.dayNumber + 1) % 7) as DayOfWeek;
  }

  get hour(): number {
    return Math.floor(this.tickOfDay / 36_000_000_000);
  }

  get minute(): number {
    return Math.floor(this.tickOfDay / 600_000_000) % 60;
  }

  get second(): number {
    return Math.floor(this.tickOfDay / 10_000_000) % 60;
  }

  get millisecond(): number {
    return Math.floor(this.tickOfDay / 10_000) % 1000;
  }

  get date(): DateTime {
    return DateTime.make(this._ticks - (this._ticks % TICKS_PER_DAY), this._kind, this._ambiguousDst);
  }

  get timeOfDay(): TimeSpan {
    return new TimeSpan(this._ticks % TICKS_PER_DAY);
  }

  // ------------------------------------------------------------------ arithmetic

  addTicks(value: bigint | number): DateTime {
    const ticks = this._ticks + BigInt(value);
    if (ticks < 0n || ticks > MAX_TICKS) throw dateArithmetic('value');
    return DateTime.make(ticks, this._kind, this._ambiguousDst);
  }

  private addUnits(value: number, maxUnitCount: number, ticksPerUnit: number): DateTime {
    if (!(Math.abs(value) <= maxUnitCount)) {
      throw new ArgumentOutOfRangeException('value', 'Value to add was out of range.');
    }
    const integralPart = Math.trunc(value);
    const fractionalPart = value - integralPart;
    const ticks = BigInt(integralPart) * BigInt(ticksPerUnit) + BigInt(Math.trunc(fractionalPart * ticksPerUnit));
    return this.addTicks(ticks);
  }

  addMilliseconds(value: number): DateTime {
    return this.addUnits(value, 315537897600000, 10_000);
  }

  addSeconds(value: number): DateTime {
    return this.addUnits(value, 315537897600, 10_000_000);
  }

  addMinutes(value: number): DateTime {
    return this.addUnits(value, 5258964960, 600_000_000);
  }

  addHours(value: number): DateTime {
    return this.addUnits(value, 87649416, 36_000_000_000);
  }

  addDays(value: number): DateTime {
    return this.addUnits(value, 3652059, 864_000_000_000);
  }

  addMonths(months: number): DateTime {
    if (months < -120000 || months > 120000) {
      throw new ArgumentOutOfRangeException('months', 'Months value must be between +/-120000.');
    }
    const { year, month, day } = getDate(this.dayNumber);
    let y = year;
    let d = day;
    let m = month + months;
    const q = m > 0 ? Math.floor((m - 1) / 12) : Math.trunc(m / 12) - 1;
    y += q;
    m -= q * 12;
    if (y < 1 || y > 9999) throw dateArithmetic('months');
    const daysTo = isLeapYear(y) ? DAYS_TO_MONTH_366 : DAYS_TO_MONTH_365;
    const days = daysTo[m] - daysTo[m - 1];
    if (d > days) d = days;
    const n = daysToYear(y) + daysTo[m - 1] + d - 1;
    return DateTime.make(BigInt(n) * TICKS_PER_DAY + (this._ticks % TICKS_PER_DAY), this._kind, this._ambiguousDst);
  }

  addYears(value: number): DateTime {
    if (value < -10000 || value > 10000) {
      throw new ArgumentOutOfRangeException('value', 'Years value must be between +/-10000.');
    }
    const { year, month, day } = getDate(this.dayNumber);
    const y = year + value;
    if (y < 1 || y > 9999) throw dateArithmetic('value');
    let n = daysToYear(y);
    const m = month - 1;
    let d = day - 1;
    if (isLeapYear(y)) {
      n += DAYS_TO_MONTH_366[m];
    } else {
      if (d === 28 && m === 1) d--;
      n += DAYS_TO_MONTH_365[m];
    }
    n += d;
    return DateTime.make(BigInt(n) * TICKS_PER_DAY + (this._ticks % TICKS_PER_DAY), this._kind, this._ambiguousDst);
  }

  /** DateTime + TimeSpan */
  add(value: TimeSpan): DateTime {
    const ticks = this._ticks + value.ticks;
    if (ticks < 0n || ticks > MAX_TICKS) throw dateArithmetic('t');
    return DateTime.make(ticks, this._kind, this._ambiguousDst);
  }

  /** DateTime - DateTime (a TimeSpan) or DateTime - TimeSpan (a DateTime). */
  subtract(value: DateTime): TimeSpan;
  subtract(value: TimeSpan): DateTime;
  subtract(value: DateTime | TimeSpan): TimeSpan | DateTime {
    if (value instanceof DateTime) return new TimeSpan(this._ticks - value._ticks);
    const ticks = this._ticks - value.ticks;
    if (ticks < 0n || ticks > MAX_TICKS) throw dateArithmetic('t');
    return DateTime.make(ticks, this._kind, this._ambiguousDst);
  }

  // ------------------------------------------------------------------ comparison

  static compare(t1: DateTime, t2: DateTime): number {
    return t1._ticks < t2._ticks ? -1 : t1._ticks > t2._ticks ? 1 : 0;
  }

  compareTo(value: DateTime): number {
    return DateTime.compare(this, value);
  }

  /** Equal ticks (the kind is ignored, as in .NET). */
  equals(value: unknown): boolean {
    return value instanceof DateTime && value._ticks === this._ticks;
  }

  // ------------------------------------------------------------------ time zones

  /** ToLocalTime: Local stays; Utc and Unspecified are treated as UTC. */
  toLocalTime(): DateTime {
    if (this._kind === DateTimeKind.Local) return this;
    const offset = offsetAtUtc(this._ticks);
    const tick = this._ticks + offset;
    if (tick > MAX_TICKS) return new DateTime(MAX_TICKS, DateTimeKind.Local);
    if (tick < 0n) return new DateTime(0n, DateTimeKind.Local);
    const { valid } = localCandidates(tick);
    const ambiguousDst = valid.length >= 2 && offset === valid[valid.length - 1];
    return DateTime.make(tick, DateTimeKind.Local, ambiguousDst);
  }

  /** ToUniversalTime: Utc stays; Local and Unspecified are treated as local time. */
  toUniversalTime(): DateTime {
    if (this._kind === DateTimeKind.Utc) return this;
    const offset = localUtcOffset(this._ticks, this._ambiguousDst);
    const ticks = this._ticks - offset;
    if (ticks > MAX_TICKS) return new DateTime(MAX_TICKS, DateTimeKind.Utc);
    if (ticks < 0n) return new DateTime(0n, DateTimeKind.Utc);
    return new DateTime(ticks, DateTimeKind.Utc);
  }

  /** @internal TimeZoneInfo.Local.GetUtcOffset(this) as ticks (UTC values: 0). */
  localUtcOffsetTicks(): bigint {
    if (this._kind === DateTimeKind.Utc) return 0n;
    return localUtcOffset(this._ticks, this._ambiguousDst);
  }

  // ------------------------------------------------------------------ formatting

  /** DateTime.ToString(format) under the invariant culture. */
  toString(format?: string | null): string {
    return formatDateTime(this, format ?? null);
  }

  /** XmlConvert.ToString(this, XmlDateTimeSerializationMode.RoundtripKind). */
  toXmlString(): string {
    return formatXsdDateTime(this);
  }

  // ------------------------------------------------------------------ parsing

  /** DateTime.TryParse(s) under the invariant culture (styles: DateTimeStyles); null on failure. */
  static tryParse(s: string | null, styles: DateTimeStyles = DateTimeStyles.None): DateTime | null {
    return dateTimeTryParse(s, styles);
  }

  /** DateTime.Parse(s) under the invariant culture; FormatException on failure. */
  static parse(s: string | null, styles: DateTimeStyles = DateTimeStyles.None): DateTime {
    return dateTimeParse(s, styles);
  }
}

// ---------------------------------------------------------------------------------------------
// Formatting (System.DateTimeFormat for DateTimeFormatInfo.InvariantInfo)

const INVARIANT_PATTERNS: Record<string, string> = {
  d: 'MM/dd/yyyy',
  D: 'dddd, dd MMMM yyyy',
  f: 'dddd, dd MMMM yyyy HH:mm',
  F: 'dddd, dd MMMM yyyy HH:mm:ss',
  g: 'MM/dd/yyyy HH:mm',
  G: 'MM/dd/yyyy HH:mm:ss',
  m: 'MMMM dd',
  M: 'MMMM dd',
  t: 'HH:mm',
  T: 'HH:mm:ss',
  y: 'yyyy MMMM',
  Y: 'yyyy MMMM',
  U: 'dddd, dd MMMM yyyy HH:mm:ss',
};

function pad(v: number, len: number): string {
  return v.toString().padStart(len, '0');
}

function offsetString(offsetTicks: bigint): { sign: string; hours: number; minutes: number } {
  const sign = offsetTicks >= 0n ? '+' : '-';
  const abs = offsetTicks >= 0n ? offsetTicks : -offsetTicks;
  return { sign, hours: Number(abs / TICKS_PER_HOUR), minutes: Number((abs / TICKS_PER_MINUTE) % 60n) };
}

function formatDateTime(dt: DateTime, format: string | null): string {
  if (format === null || format === '') {
    return formatCustom(dt, INVARIANT_PATTERNS.G);
  }
  if (format.length === 1) {
    const f = format[0];
    switch (f) {
      case 'o':
      case 'O':
        return formatO(dt);
      case 'r':
      case 'R':
        return formatCustom(dt, "ddd, dd MMM yyyy HH':'mm':'ss 'GMT'");
      case 's':
        return formatCustom(dt, "yyyy'-'MM'-'dd'T'HH':'mm':'ss");
      case 'u':
        return formatCustom(dt, "yyyy'-'MM'-'dd HH':'mm':'ss'Z'");
      case 'U':
        return formatCustom(dt.toUniversalTime(), INVARIANT_PATTERNS.U);
      default: {
        const p = INVARIANT_PATTERNS[f];
        if (p === undefined) throw new FormatException('Input string was not in a correct format.');
        return formatCustom(dt, p);
      }
    }
  }
  return formatCustom(dt, format);
}

function formatO(dt: DateTime): string {
  const t = dt.ticks;
  const { year, month, day } = getDate(Number(t / TICKS_PER_DAY));
  let s = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(dt.hour, 2)}:${pad(dt.minute, 2)}:${pad(dt.second, 2)}.${pad(Number(t % TICKS_PER_SECOND), 7)}`;
  if (dt.kind === DateTimeKind.Local) {
    const o = offsetString(dt.localUtcOffsetTicks());
    s += `${o.sign}${pad(o.hours, 2)}:${pad(o.minutes, 2)}`;
  } else if (dt.kind === DateTimeKind.Utc) {
    s += 'Z';
  }
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
      else throw new FormatException('Input string was not in a correct format.');
    } else {
      out.push(ch);
    }
  }
  if (!found) throw new FormatException(`Cannot find a matching quote character for the character '${quote}'.`);
  return pos - begin;
}

/** FormatCustomized for the invariant culture (Gregorian calendar). */
export function formatCustom(dt: DateTime, format: string): string {
  const out: string[] = [];
  let timeOnly = true;
  let i = 0;
  const date = () => getDate(Number(dt.ticks / TICKS_PER_DAY));
  while (i < format.length) {
    const ch = format[i];
    let tokenLen: number;
    switch (ch) {
      case 'g':
        tokenLen = repeatCount(format, i, ch);
        out.push('A.D.');
        break;
      case 'h': {
        tokenLen = repeatCount(format, i, ch);
        let h12 = dt.hour;
        if (h12 > 12) h12 -= 12;
        else if (h12 === 0) h12 = 12;
        out.push(pad(h12, Math.min(tokenLen, 2)));
        break;
      }
      case 'H':
        tokenLen = repeatCount(format, i, ch);
        out.push(pad(dt.hour, Math.min(tokenLen, 2)));
        break;
      case 'm':
        tokenLen = repeatCount(format, i, ch);
        out.push(pad(dt.minute, Math.min(tokenLen, 2)));
        break;
      case 's':
        tokenLen = repeatCount(format, i, ch);
        out.push(pad(dt.second, Math.min(tokenLen, 2)));
        break;
      case 'f':
      case 'F': {
        tokenLen = repeatCount(format, i, ch);
        if (tokenLen > 7) throw new FormatException('Input string was not in a correct format.');
        let fraction = Number(dt.ticks % TICKS_PER_SECOND);
        fraction = Math.floor(fraction / 10 ** (7 - tokenLen));
        if (ch === 'f') {
          out.push(pad(fraction, tokenLen));
        } else {
          let effective = tokenLen;
          while (effective > 0 && fraction % 10 === 0) {
            fraction = Math.floor(fraction / 10);
            effective--;
          }
          if (effective > 0) {
            out.push(pad(fraction, effective));
          } else if (out.length > 0) {
            // Remove a preceding '.' (the last emitted character).
            const last = out[out.length - 1];
            if (last.endsWith('.')) out[out.length - 1] = last.slice(0, -1);
          }
        }
        break;
      }
      case 't':
        tokenLen = repeatCount(format, i, ch);
        out.push(tokenLen === 1 ? (dt.hour < 12 ? 'A' : 'P') : dt.hour < 12 ? 'AM' : 'PM');
        break;
      case 'd':
        tokenLen = repeatCount(format, i, ch);
        if (tokenLen <= 2) out.push(pad(date().day, tokenLen));
        else out.push((tokenLen === 3 ? invariantAbbreviatedDayNames : invariantDayNames)[dt.dayOfWeek]);
        timeOnly = false;
        break;
      case 'M': {
        tokenLen = repeatCount(format, i, ch);
        const month = date().month;
        if (tokenLen <= 2) out.push(pad(month, tokenLen));
        else out.push((tokenLen === 3 ? invariantAbbreviatedMonthNames : invariantMonthNames)[month - 1]);
        timeOnly = false;
        break;
      }
      case 'y': {
        const year = date().year;
        tokenLen = repeatCount(format, i, ch);
        out.push(tokenLen <= 2 ? pad(year % 100, tokenLen) : pad(year, tokenLen));
        timeOnly = false;
        break;
      }
      case 'z': {
        tokenLen = repeatCount(format, i, ch);
        let offset: bigint;
        if (timeOnly && dt.ticks < TICKS_PER_DAY) offset = DateTime.now.localUtcOffsetTicks();
        else if (dt.kind === DateTimeKind.Utc) offset = 0n;
        else offset = dt.localUtcOffsetTicks();
        const o = offsetString(offset);
        if (tokenLen <= 1) out.push(o.sign + o.hours.toString());
        else if (tokenLen === 2) out.push(o.sign + pad(o.hours, 2));
        else out.push(`${o.sign}${pad(o.hours, 2)}:${pad(o.minutes, 2)}`);
        break;
      }
      case 'K':
        tokenLen = 1;
        if (dt.kind === DateTimeKind.Local) {
          const o = offsetString(dt.localUtcOffsetTicks());
          out.push(`${o.sign}${pad(o.hours, 2)}:${pad(o.minutes, 2)}`);
        } else if (dt.kind === DateTimeKind.Utc) {
          out.push('Z');
        }
        break;
      case ':':
        out.push(':');
        tokenLen = 1;
        break;
      case '/':
        out.push('/');
        tokenLen = 1;
        break;
      case "'":
      case '"':
        tokenLen = parseQuoteString(format, i, out);
        break;
      case '%': {
        const next = i + 1 < format.length ? format[i + 1] : null;
        if (next !== null && next !== '%') {
          out.push(formatCustom(dt, next));
          tokenLen = 2;
        } else {
          throw new FormatException('Input string was not in a correct format.');
        }
        break;
      }
      case '\\': {
        const next = i + 1 < format.length ? format[i + 1] : null;
        if (next === null) throw new FormatException('Input string was not in a correct format.');
        out.push(next);
        tokenLen = 2;
        break;
      }
      default:
        out.push(ch);
        tokenLen = 1;
        break;
    }
    i += tokenLen;
  }
  return out.join('');
}

// ---------------------------------------------------------------------------------------------
// xs:dateTime output (System.Xml.Schema.XsdDateTime.ToString for DateTimeTypeCode.DateTime)

/** XsdDateTime(value, XsdDateTimeFlags.DateTime).ToString(): the zone follows value.Kind. */
export function formatXsdDateTime(dt: DateTime): string {
  const t = dt.ticks;
  const { year, month, day } = getDate(Number(t / TICKS_PER_DAY));
  let s = `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}T${pad(dt.hour, 2)}:${pad(dt.minute, 2)}:${pad(dt.second, 2)}`;
  const fraction = Number(t % TICKS_PER_SECOND);
  if (fraction !== 0) s += '.' + pad(fraction, 7).replace(/0+$/, '');
  if (dt.kind === DateTimeKind.Utc) {
    s += 'Z';
  } else if (dt.kind === DateTimeKind.Local) {
    const offset = dt.localUtcOffsetTicks();
    // XsdDateTime keeps TimeSpan.Hours / Minutes of the offset (whole minutes).
    const o = offsetString(offset);
    s += `${o.sign}${pad(o.hours, 2)}:${pad(o.minutes, 2)}`;
  }
  return s;
}
