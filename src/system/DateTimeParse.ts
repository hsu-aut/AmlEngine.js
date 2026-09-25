// System.Globalization.DateTimeParse (.NET 8, DateTimeParse.cs) for DateTime.Parse / TryParse with
// the invariant culture (CultureInfo.InvariantCulture: Gregorian calendar, English month and day
// names, "AM"/"PM", date separator "/", time separator ":", ShortDatePattern "MM/dd/yyyy",
// MonthDayPattern "MMMM dd", YearMonthPattern "yyyy MMMM", TwoDigitYearMax 2049).
//
// Ported literally, with the C# names: __DTString, the lexer Lex, the state table
// s_dateParsingStates (DS x DTT), ProcessTerminalState with the GetDayOfXxx / GetTimeOfXxx
// actions, ProcessDateTimeSuffix (CJK suffixes such as "2020年1月5日" parse under the invariant
// culture too), ParseISO8601, ParseTimeZone / HandleTimeZone, VerifyValidPunctuation,
// CheckDefaultDateTime, DetermineTimeZoneAdjustments, AdjustTimeZoneToUniversal / ToLocal, and the
// token hash of DateTimeFormatInfo (CreateTokenHashTable, InsertHash, InsertAtCurrentHashNode,
// Tokenize) filled with the invariant culture's values, so collisions and match order are the
// same as in .NET.
//
// Not ported (unreachable with the invariant culture and DateTime.Parse / TryParse):
//   - ParseExact / TryParseExact (DoStrictParse, ParseByFormat, ExpandPredefinedFormat,
//     TryParseFormatO / R) and the DateTimeOffset path (ParseFlags.CaptureOffset,
//     DateTimeOffsetTimeZonePostProcessing).
//   - Hebrew parsing (ProcessHebrewTerminalState, Hebrew numbers), Japanese / Taiwan era tokens,
//     culture specific tokens (fr-CA, sq, ko, ky, eu, date words / month postfixes, genitive and
//     leap month names, names with spaces, tokens starting with digits).
//   - The failure message details (only the exception type is reproduced).
// Differences from .NET that remain:
//   - CompareInfo.Compare(..., IgnoreCase) of the invariant culture (ICU collation) is emulated by a
//     per character invariant lower case comparison; exotic characters that ICU treats as equal
//     (canonical equivalents, ignorable code points) inside tokens are not reproduced.
//   - Local time conversions use the host time zone through DateTime (IANA data); .NET on Windows
//     uses the Windows rules, which differ for old dates (see DateTime.ts).

import { DateTime, DateTimeKind } from './DateTime.js';
import { ArgumentException, ArgumentNullException, FormatException } from './exceptions.js';

/** System.Globalization.DateTimeStyles */
export enum DateTimeStyles {
  None = 0,
  AllowLeadingWhite = 1,
  AllowTrailingWhite = 2,
  AllowInnerWhite = 4,
  AllowWhiteSpaces = 7,
  NoCurrentDateDefault = 8,
  AdjustToUniversal = 16,
  AssumeLocal = 32,
  AssumeUniversal = 64,
  RoundtripKind = 128,
}

// ---------------------------------------------------------------------------------------------
// Constants

const TicksPerMillisecond = 10_000n;
const TicksPerSecond = 10_000_000n;
const TicksPerMinute = 600_000_000n;
const TicksPerHour = 36_000_000_000n;
const TicksPerDay = 864_000_000_000n;
const MinTicks = 0n;
const MaxTicks = 3155378975999999999n;
/** DateTimeOffset.MinOffset / MaxOffset (+-14:00). */
const MinOffset = -14n * TicksPerHour;
const MaxOffset = 14n * TicksPerHour;

const MaxDateTimeNumberDigits = 8;
const TimeDelimiter = ':';
const TimeFractionDelimiterComma = ',';
const TimeFractionDelimiterDot = '.';

/** Calendar.CurrentEra */
const CurrentEra = 0;
/** GregorianCalendar.ADEra */
const ADEra = 1;
const MaxYear = 9999;
/** GregorianCalendar.TwoDigitYearMax of the invariant culture. */
const TwoDigitYearMax = 2049;

const DaysToMonth365 = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
const DaysToMonth366 = [0, 31, 60, 91, 121, 152, 182, 213, 244, 274, 305, 335, 366];

// Invariant culture data (CultureData.Invariant / CalendarData.Invariant).
const InvariantMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December', ''];
const InvariantAbbrevMonthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', ''];
const InvariantDayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const InvariantAbbrevDayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const InvariantEraNames = ['A.D.'];
const InvariantAbbrevEraNames = ['AD'];
const InvariantAbbrevEnglishEraNames = ['AD'];

// ---------------------------------------------------------------------------------------------
// char helpers with .NET semantics

/** char.IsWhiteSpace */
function isWhiteSpace(ch: string): boolean {
  const c = ch.charCodeAt(0);
  if (c < 256) {
    return (c >= 0x09 && c <= 0x0d) || c === 0x20 || c === 0x85 || c === 0xa0;
  }
  return c === 0x1680 || (c >= 0x2000 && c <= 0x200a) || c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000;
}

const letterRe = /^\p{L}$/u;

/** char.IsLetter */
function isLetter(ch: string): boolean {
  return letterRe.test(ch);
}

/** char.IsAsciiDigit */
function isAsciiDigit(ch: string): boolean {
  const c = ch.charCodeAt(0);
  return c >= 0x30 && c <= 0x39;
}

/** TextInfo.Invariant.ToLower(char) (simple case mapping). */
function toLowerChar(ch: string): string {
  const l = ch.toLowerCase();
  if (l.length === 1) return l;
  return ch === 'İ' ? 'i' : ch;
}

/** CompareInfo.Invariant.Compare(a, b, CompareOptions.IgnoreCase) == 0 (approximation, see header). */
function equalsIgnoreCase(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i] && toLowerChar(a[i]) !== toLowerChar(b[i])) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Calendar helpers (GregorianCalendar, DateTime.TryCreate)

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysToYear(year: number): number {
  const y = year - 1;
  const cent = Math.floor(y / 100);
  return Math.floor((y * (365 * 4 + 1)) / 4) - cent + Math.floor(cent / 4);
}

/** GregorianCalendar.IsValidDay */
function calendarIsValidDay(year: number, month: number, day: number, era: number): boolean {
  if ((era !== CurrentEra && era !== ADEra) || year < 1 || year > MaxYear || month < 1 || month > 12 || day < 1) {
    return false;
  }
  const days = isLeapYear(year) ? DaysToMonth366 : DaysToMonth365;
  return day <= days[month] - days[month - 1];
}

/** GregorianCalendar.ToFourDigitYear; null where .NET throws ArgumentOutOfRangeException. */
function calendarToFourDigitYear(year: number): number | null {
  if (year < 0 || year > MaxYear) return null;
  if (year < 100) {
    return (Math.trunc(TwoDigitYearMax / 100) - (year > TwoDigitYearMax % 100 ? 1 : 0)) * 100 + year;
  }
  return year;
}

/** GregorianCalendar.TryToDateTime / DateTime.TryCreate: ticks or null. */
function calendarTryToDateTime(year: number, month: number, day: number, hour: number, minute: number, second: number, millisecond: number, era: number): bigint | null {
  if (era !== CurrentEra && era !== ADEra) return null;
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1) return null;
  if (hour < 0 || hour >= 24 || minute < 0 || minute >= 60 || millisecond < 0 || millisecond >= 1000) return null;
  const days = isLeapYear(year) ? DaysToMonth366 : DaysToMonth365;
  if (day > days[month] - days[month - 1]) return null;
  let ticks = BigInt(daysToYear(year) + days[month - 1] + day - 1) * TicksPerDay;
  if (second >= 0 && second < 60) {
    ticks += BigInt(hour * 3600 + minute * 60 + second) * TicksPerSecond + BigInt(millisecond) * TicksPerMillisecond;
  } else {
    // second == 60 would need leap second support of the OS (off by default)
    return null;
  }
  return ticks;
}

/** Math.Round(double) (MidpointRounding.ToEven). */
function roundToEven(v: number): number {
  const f = Math.floor(v);
  const diff = v - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}

// ---------------------------------------------------------------------------------------------
// Time zone helpers (TimeZoneInfo.Local through DateTime)

/** TimeZoneInfo.Local.GetUtcOffset(dateTime, NoThrowOnInvalidTime) for a Local/Unspecified value. */
function getLocalUtcOffset(dateTime: DateTime): bigint {
  return dateTime.localUtcOffsetTicks();
}

/**
 * TimeZoneInfo.GetUtcOffsetFromUtc(utc, TimeZoneInfo.Local, out _, out isAmbiguousLocalDst); `local`
 * is the resulting Local DateTime (carrying the ambiguous-DST state) when it is representable.
 */
function getUtcOffsetFromUtc(utcTicks: bigint): { offset: bigint; local: DateTime | null } {
  if (utcTicks >= TicksPerDay && utcTicks <= MaxTicks - TicksPerDay) {
    const local = new DateTime(utcTicks, DateTimeKind.Utc).toLocalTime();
    return { offset: local.ticks - utcTicks, local };
  }
  // DateTime.toLocalTime clamps at the ends of the range; probe one day inside instead.
  const probe = utcTicks < TicksPerDay ? utcTicks + TicksPerDay : utcTicks - TicksPerDay;
  const local = new DateTime(probe, DateTimeKind.Utc).toLocalTime();
  return { offset: local.ticks - probe, local: null };
}

// ---------------------------------------------------------------------------------------------
// Enumerations

/** DateTimeParse.DTT: date token types. */
enum DTT {
  End = 0, // '\0'
  NumEnd = 1, // Num[ ]*[\0]
  NumAmpm = 2, // Num[ ]+AmPm
  NumSpace = 3, // Num[ ]+^[Dsep|Tsep|'0\']
  NumDatesep = 4, // Num[ ]*Dsep
  NumTimesep = 5, // Num[ ]*Tsep
  MonthEnd = 6, // Month[ ]*'\0'
  MonthSpace = 7, // Month[ ]+^[Dsep|Tsep|'\0']
  MonthDatesep = 8, // Month[ ]*Dsep
  NumDatesuff = 9, // Month[ ]*DSuff
  NumTimesuff = 10, // Month[ ]*TSuff
  DayOfWeek = 11, // Day of week name
  YearSpace = 12, // Year+^[Dsep|Tsep|'0\']
  YearDateSep = 13, // Year+Dsep
  YearEnd = 14, // Year+['\0']
  TimeZone = 15, // timezone name
  Era = 16, // era name
  NumUTCTimeMark = 17, // Num + 'Z'
  Unk = 18, // unknown
  NumLocalTimeMark = 19, // Num + 'T'
  Max = 20, // marker
}

enum TM {
  NotSet = -1,
  AM = 0,
  PM = 1,
}

/** DateTimeParse.DS: parsing states. */
enum DS {
  BEGIN = 0,
  N = 1, // have one number
  NN = 2, // have two numbers
  D_Nd = 3, // date string: have number followed by date separator
  D_NN = 4, // date string: have two numbers
  D_NNd = 5, // date string: have two numbers followed by date separator
  D_M = 6, // date string: have a month
  D_MN = 7, // date string: have a month and a number
  D_NM = 8, // date string: have a number and a month
  D_MNd = 9, // date string: have a month and number followed by date separator
  D_NDS = 10, // date string: have one number followed a date suffix.
  D_Y = 11, // date string: have a year.
  D_YN = 12, // date string: have a year and a number
  D_YNd = 13, // date string: have a year and a number and a date separator
  D_YM = 14, // date string: have a year and a month
  D_YMd = 15, // date string: have a year and a month and a date separator
  D_S = 16, // have numbers followed by a date suffix.
  T_S = 17, // have numbers followed by a time suffix.
  T_Nt = 18, // have num followed by time separator
  T_NNt = 19, // have two numbers followed by time separator
  ERROR = 20,
  // terminal states
  DX_NN = 21, // day from two numbers
  DX_NNN = 22, // day from three numbers
  DX_MN = 23, // day from month and one number
  DX_NM = 24, // day from month and one number
  DX_MNN = 25, // day from month and two numbers
  DX_DS = 26, // a set of date suffixed numbers.
  DX_DSN = 27, // day from date suffixes and one number.
  DX_NDS = 28, // day from one number and date suffixes .
  DX_NNDS = 29, // day from one number and date suffixes .
  DX_YNN = 30, // date string: have a year and two number
  DX_YMN = 31, // date string: have a year, a month, and a number.
  DX_YN = 32, // date string: have a year and one number
  DX_YM = 33, // date string: have a year, a month.
  TX_N = 34, // time from one number (must have ampm)
  TX_NN = 35, // time from two numbers
  TX_NNN = 36, // time from three numbers
  TX_TS = 37, // a set of time suffixed numbers.
  DX_NNY = 38,
}

/** System.Globalization.TokenType */
enum TokenType {
  NumberToken = 1,
  YearNumberToken = 2,
  Am = 3,
  Pm = 4,
  MonthToken = 5,
  EndOfString = 6,
  DayOfWeekToken = 7,
  TimeZoneToken = 8,
  EraToken = 9,
  DateWordToken = 10,
  UnknownToken = 11,
  HebrewNumber = 12,
  JapaneseEraToken = 13,
  TEraToken = 14,
  IgnorableSymbol = 15,

  SEP_Unk = 0x100,
  SEP_End = 0x200,
  SEP_Space = 0x300,
  SEP_Am = 0x400,
  SEP_Pm = 0x500,
  SEP_Date = 0x600,
  SEP_Time = 0x700,
  SEP_YearSuff = 0x800,
  SEP_MonthSuff = 0x900,
  SEP_DaySuff = 0xa00,
  SEP_HourSuff = 0xb00,
  SEP_MinuteSuff = 0xc00,
  SEP_SecondSuff = 0xd00,
  SEP_LocalTimeMark = 0xe00,
  SEP_DateOrOffset = 0xf00,

  RegularTokenMask = 0x00ff,
  SeparatorTokenMask = 0xff00,
}

enum ParseFailureKind {
  None,
  ArgumentNull_String,
  Format_BadDatePattern,
  Format_BadDateTime,
  Format_BadDateTimeCalendar,
  Format_BadDayOfWeek,
  Format_BadFormatSpecifier,
  Format_BadQuote,
  Format_DateOutOfRange,
  Format_MissingIncompleteDate,
  Format_NoFormatSpecifier,
  Format_OffsetOutOfRange,
  Format_RepeatDateTimePattern,
  Format_UnknownDateTimeWord,
  Format_UTCOutOfRange,
}

enum ParseFlags {
  HaveYear = 0x00000001,
  HaveMonth = 0x00000002,
  HaveDay = 0x00000004,
  HaveHour = 0x00000008,
  HaveMinute = 0x00000010,
  HaveSecond = 0x00000020,
  HaveTime = 0x00000040,
  HaveDate = 0x00000080,
  TimeZoneUsed = 0x00000100,
  TimeZoneUtc = 0x00000200,
  ParsedMonthName = 0x00000400,
  CaptureOffset = 0x00000800,
  YearDefault = 0x00001000,
  Rfc1123Pattern = 0x00002000,
  UtcSortPattern = 0x00004000,
}

enum DTSubStringType {
  Unknown = 0,
  Invalid = 1,
  Number = 2,
  End = 3,
  Other = 4,
}

// ---------------------------------------------------------------------------------------------
// State table

// prettier-ignore
const s_dateParsingStates: DS[][] = [
  // End        NumEnd      NumAmPm     NumSpace    NumDaySep   NumTimesep  MonthEnd    MonthSpace  MonthDSep   NumDateSuff NumTimeSuff DayOfWeek   YearSpace   YearDateSep YearEnd     TimeZone    Era         UTCTimeMark
  // DS.BEGIN
  [DS.BEGIN,   DS.ERROR,   DS.TX_N,    DS.N,       DS.D_Nd,    DS.T_Nt,    DS.ERROR,   DS.D_M,     DS.D_M,     DS.D_S,     DS.T_S,     DS.BEGIN,   DS.D_Y,     DS.D_Y,     DS.ERROR,   DS.BEGIN,   DS.BEGIN,   DS.ERROR],
  // DS.N
  [DS.ERROR,   DS.DX_NN,   DS.TX_NN,   DS.NN,      DS.D_NNd,   DS.ERROR,   DS.DX_NM,   DS.D_NM,    DS.D_MNd,   DS.D_NDS,   DS.ERROR,   DS.N,       DS.D_YN,    DS.D_YNd,   DS.DX_YN,   DS.N,       DS.N,       DS.ERROR],
  // DS.NN
  [DS.DX_NN,   DS.DX_NNN,  DS.TX_NNN,  DS.DX_NNN,  DS.ERROR,   DS.T_Nt,    DS.DX_MNN,  DS.DX_MNN,  DS.ERROR,   DS.ERROR,   DS.T_S,     DS.NN,      DS.DX_NNY,  DS.ERROR,   DS.DX_NNY,  DS.NN,      DS.NN,      DS.ERROR],
  // DS.D_Nd
  [DS.ERROR,   DS.DX_NN,   DS.ERROR,   DS.D_NN,    DS.D_NNd,   DS.ERROR,   DS.DX_NM,   DS.D_MN,    DS.D_MNd,   DS.ERROR,   DS.ERROR,   DS.D_Nd,    DS.D_YN,    DS.D_YNd,   DS.DX_YN,   DS.ERROR,   DS.D_Nd,    DS.ERROR],
  // DS.D_NN
  [DS.DX_NN,   DS.DX_NNN,  DS.TX_N,    DS.DX_NNN,  DS.ERROR,   DS.T_Nt,    DS.DX_MNN,  DS.DX_MNN,  DS.ERROR,   DS.DX_DS,   DS.T_S,     DS.D_NN,    DS.DX_NNY,  DS.ERROR,   DS.DX_NNY,  DS.ERROR,   DS.D_NN,    DS.ERROR],
  // DS.D_NNd
  [DS.ERROR,   DS.DX_NNN,  DS.DX_NNN,  DS.DX_NNN,  DS.ERROR,   DS.ERROR,   DS.DX_MNN,  DS.DX_MNN,  DS.ERROR,   DS.DX_DS,   DS.ERROR,   DS.D_NNd,   DS.DX_NNY,  DS.ERROR,   DS.DX_NNY,  DS.ERROR,   DS.D_NNd,   DS.ERROR],
  // DS.D_M
  [DS.ERROR,   DS.DX_MN,   DS.ERROR,   DS.D_MN,    DS.D_MNd,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_M,     DS.D_YM,    DS.D_YMd,   DS.DX_YM,   DS.ERROR,   DS.D_M,     DS.ERROR],
  // DS.D_MN
  [DS.DX_MN,   DS.DX_MNN,  DS.DX_MNN,  DS.DX_MNN,  DS.ERROR,   DS.T_Nt,    DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.DX_DS,   DS.T_S,     DS.D_MN,    DS.DX_YMN,  DS.ERROR,   DS.DX_YMN,  DS.ERROR,   DS.D_MN,    DS.ERROR],
  // DS.D_NM
  [DS.DX_NM,   DS.DX_MNN,  DS.DX_MNN,  DS.DX_MNN,  DS.ERROR,   DS.T_Nt,    DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.DX_DS,   DS.T_S,     DS.D_NM,    DS.DX_YMN,  DS.ERROR,   DS.DX_YMN,  DS.ERROR,   DS.D_NM,    DS.ERROR],
  // DS.D_MNd
  [DS.ERROR,   DS.DX_MNN,  DS.ERROR,   DS.DX_MNN,  DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_MNd,   DS.DX_YMN,  DS.ERROR,   DS.DX_YMN,  DS.ERROR,   DS.D_MNd,   DS.ERROR],
  // DS.D_NDS
  [DS.DX_NDS,  DS.DX_NNDS, DS.DX_NNDS, DS.DX_NNDS, DS.ERROR,   DS.T_Nt,    DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_NDS,   DS.T_S,     DS.D_NDS,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_NDS,   DS.ERROR],
  // DS.D_Y
  [DS.ERROR,   DS.DX_YN,   DS.ERROR,   DS.D_YN,    DS.D_YNd,   DS.ERROR,   DS.DX_YM,   DS.D_YM,    DS.D_YMd,   DS.D_YM,    DS.ERROR,   DS.D_Y,     DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_Y,     DS.ERROR],
  // DS.D_YN
  [DS.DX_YN,   DS.DX_YNN,  DS.DX_YNN,  DS.DX_YNN,  DS.ERROR,   DS.ERROR,   DS.DX_YMN,  DS.DX_YMN,  DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_YN,    DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_YN,    DS.ERROR],
  // DS.D_YNd
  [DS.ERROR,   DS.DX_YNN,  DS.DX_YNN,  DS.DX_YNN,  DS.ERROR,   DS.ERROR,   DS.DX_YMN,  DS.DX_YMN,  DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_YN,    DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_YN,    DS.ERROR],
  // DS.D_YM
  [DS.DX_YM,   DS.DX_YMN,  DS.DX_YMN,  DS.DX_YMN,  DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_YM,    DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_YM,    DS.ERROR],
  // DS.D_YMd
  [DS.ERROR,   DS.DX_YMN,  DS.DX_YMN,  DS.DX_YMN,  DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_YM,    DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_YM,    DS.ERROR],
  // DS.D_S
  [DS.DX_DS,   DS.DX_DSN,  DS.TX_N,    DS.T_Nt,    DS.ERROR,   DS.T_Nt,    DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_S,     DS.T_S,     DS.D_S,     DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_S,     DS.ERROR],
  // DS.T_S
  [DS.TX_TS,   DS.TX_TS,   DS.TX_TS,   DS.T_Nt,    DS.D_Nd,    DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.D_S,     DS.T_S,     DS.T_S,     DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.T_S,     DS.T_S,     DS.ERROR],
  // DS.T_Nt
  [DS.ERROR,   DS.TX_NN,   DS.TX_NN,   DS.TX_NN,   DS.ERROR,   DS.T_NNt,   DS.DX_NM,   DS.D_NM,    DS.ERROR,   DS.ERROR,   DS.T_S,     DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.T_Nt,    DS.T_Nt,    DS.TX_NN],
  // DS.T_NNt
  [DS.ERROR,   DS.TX_NNN,  DS.TX_NNN,  DS.TX_NNN,  DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.T_S,     DS.T_NNt,   DS.ERROR,   DS.ERROR,   DS.ERROR,   DS.T_NNt,   DS.T_NNt,   DS.TX_NNN],
];

function nextState(dps: DS, dtt: DTT): DS {
  return s_dateParsingStates[dps][dtt];
}

// ---------------------------------------------------------------------------------------------
// Parsing buffers

/** DateTimeToken */
class DateTimeToken {
  dtt: DTT = DTT.End;
  suffix: TokenType = TokenType.SEP_Unk;
  num = 0;
}

/** DateTimeRawInfo */
class DateTimeRawInfo {
  private num = [0, 0, 0];
  numCount = 0;
  month = -1;
  year = -1;
  dayOfWeek = -1;
  era = -1;
  timeMark: TM = TM.NotSet;
  fraction = -1;
  hasSameDateAndTimeSeparators = false;

  AddNumber(value: number): void {
    this.num[this.numCount++] = value;
  }

  GetNumber(index: number): number {
    return this.num[index];
  }
}

/** DateTimeResult */
class DateTimeResult {
  Year = -1;
  Month = -1;
  Day = -1;
  Hour = 0;
  Minute = 0;
  Second = 0;
  fraction = -1;
  era = -1;
  flags: ParseFlags = 0 as ParseFlags;
  /** TimeSpan ticks */
  timeZoneOffset = 0n;
  parsedDate: DateTime | null = null;
  failure: ParseFailureKind = ParseFailureKind.None;
  /** failureMessageFormatArgument (the index of an unknown word). */
  failureArgument: number | null = null;

  SetDate(year: number, month: number, day: number): void {
    this.Year = year;
    this.Month = month;
    this.Day = day;
  }

  SetBadDateTimeFailure(): void {
    this.failure = ParseFailureKind.Format_BadDateTime;
  }

  SetFailure(failure: ParseFailureKind, failureMessageFormatArgument: number | null = null): void {
    this.failure = failure;
    this.failureArgument = failureMessageFormatArgument;
  }
}

/** DTSubString */
interface DTSubString {
  s: string;
  index: number;
  length: number;
  type: DTSubStringType;
  value: number;
}

// ---------------------------------------------------------------------------------------------
// __DTString

class __DTString {
  static readonly RightToLeftMark = '‏';

  Value: string;
  Index = -1;
  m_current = '\0';

  constructor(str: string) {
    this.Value = str;
  }

  get Length(): number {
    return this.Value.length;
  }

  GetNext(): boolean {
    this.Index++;
    if (this.Index < this.Length) {
      this.m_current = this.Value[this.Index];
      return true;
    }
    return false;
  }

  AtEnd(): boolean {
    return this.Index < this.Length ? false : true;
  }

  Advance(count: number): boolean {
    this.Index += count;
    if (this.Index < this.Length) {
      this.m_current = this.Value[this.Index];
      return true;
    }
    return false;
  }

  /** Used by DateTime.Parse() to get the next token. */
  GetRegularToken(dtfi: InvariantDateTimeFormatInfo): { tokenType: TokenType; tokenValue: number } {
    let tokenValue = 0;
    if (this.Index >= this.Length) {
      return { tokenType: TokenType.EndOfString, tokenValue };
    }
    for (;;) {
      // Start:
      if (isAsciiDigit(this.m_current)) {
        tokenValue = this.m_current.charCodeAt(0) - 0x30;
        let value: number;
        const start = this.Index;
        while (++this.Index < this.Length) {
          this.m_current = this.Value[this.Index];
          value = this.m_current.charCodeAt(0) - 0x30;
          if (value >= 0 && value <= 9) {
            tokenValue = tokenValue * 10 + value;
          } else {
            break;
          }
        }
        let tokenType: TokenType;
        if (this.Index - start > MaxDateTimeNumberDigits) {
          tokenType = TokenType.NumberToken;
          tokenValue = -1;
        } else if (this.Index - start < 3) {
          tokenType = TokenType.NumberToken;
        } else {
          // If there are more than 3 digits, assume that it's a year value.
          tokenType = TokenType.YearNumberToken;
        }
        // m_checkDigitToken is false for the invariant culture.
        return { tokenType, tokenValue };
      } else if (isWhiteSpace(this.m_current)) {
        // Just skip to the next character.
        let found = false;
        while (++this.Index < this.Length) {
          this.m_current = this.Value[this.Index];
          if (!isWhiteSpace(this.m_current)) {
            found = true;
            break;
          }
        }
        if (found) continue; // goto Start
        // We have reached the end of string.
        return { tokenType: TokenType.EndOfString, tokenValue };
      } else {
        const t = dtfi.Tokenize(TokenType.RegularTokenMask, this);
        return { tokenType: t.tokenType, tokenValue: t.tokenValue };
      }
    }
  }

  GetSeparatorToken(dtfi: InvariantDateTimeFormatInfo): { tokenType: TokenType; indexBeforeSeparator: number; charBeforeSeparator: string } {
    const indexBeforeSeparator = this.Index;
    const charBeforeSeparator = this.m_current;
    let tokenType: TokenType;
    if (!this.SkipWhiteSpaceAndRtlMarkCurrent()) {
      // Reach the end of the string.
      return { tokenType: TokenType.SEP_End, indexBeforeSeparator, charBeforeSeparator };
    }
    if (!isAsciiDigit(this.m_current)) {
      // Not a digit.  Tokenize it.
      const t = dtfi.Tokenize(TokenType.SeparatorTokenMask, this);
      tokenType = t.found ? t.tokenType : TokenType.SEP_Space;
    } else {
      tokenType = TokenType.SEP_Space;
    }
    return { tokenType, indexBeforeSeparator, charBeforeSeparator };
  }

  /** Match(char) */
  Match(ch: string): boolean {
    if (++this.Index >= this.Length) {
      return false;
    }
    if (this.Value[this.Index] === ch || (ch === ' ' && __DTString.IsSpaceReplacingChar(this.Value[this.Index]))) {
      this.m_current = ch;
      return true;
    }
    this.Index--;
    return false;
  }

  private static IsSpaceReplacingChar(c: string): boolean {
    return c === ' ' || c === ' ';
  }

  GetNextDigit(): boolean {
    return ++this.Index < this.Length && isAsciiDigit(this.Value[this.Index]);
  }

  GetChar(): string {
    return this.Value[this.Index];
  }

  GetDigit(): number {
    return this.Value.charCodeAt(this.Index) - 0x30;
  }

  SkipWhiteSpaces(): void {
    while (this.Index + 1 < this.Length) {
      const ch = this.Value[this.Index + 1];
      if (!isWhiteSpace(ch)) {
        return;
      }
      this.Index++;
    }
  }

  SkipWhiteSpaceAndRtlMarkCurrent(): boolean {
    if (this.Index >= this.Length) {
      return false;
    }
    if (!isWhiteSpace(this.m_current) && this.m_current !== __DTString.RightToLeftMark) {
      return true;
    }
    while (++this.Index < this.Length) {
      this.m_current = this.Value[this.Index];
      if (!isWhiteSpace(this.m_current) && this.m_current !== __DTString.RightToLeftMark) {
        return true;
      }
    }
    return false;
  }

  GetSubString(): DTSubString {
    const sub: DTSubString = { s: this.Value, index: this.Index, length: 0, type: DTSubStringType.Unknown, value: 0 };
    while (this.Index + sub.length < this.Length) {
      const ch = this.Value[this.Index + sub.length];
      const currentType = isAsciiDigit(ch) ? DTSubStringType.Number : DTSubStringType.Other;
      if (sub.length === 0) {
        sub.type = currentType;
      } else if (sub.type !== currentType) {
        break;
      }
      sub.length++;
      if (currentType === DTSubStringType.Number) {
        if (sub.length > MaxDateTimeNumberDigits) {
          sub.type = DTSubStringType.Invalid;
          return sub;
        }
        sub.value = sub.value * 10 + (ch.charCodeAt(0) - 0x30);
      } else {
        break;
      }
    }
    if (sub.length === 0) {
      sub.type = DTSubStringType.End;
      return sub;
    }
    return sub;
  }

  ConsumeSubString(sub: DTSubString): void {
    this.Index = sub.index + sub.length;
    if (this.Index < this.Length) {
      this.m_current = this.Value[this.Index];
    }
  }
}

// ---------------------------------------------------------------------------------------------
// DateTimeFormatInfo token hash for the invariant culture

class TokenHashValue {
  constructor(
    public tokenString: string,
    public tokenType: TokenType,
    public tokenValue: number,
  ) {}
}

const TOKEN_HASH_SIZE = 199;
const SECOND_PRIME = 197;

/** The culture data of a DateTimeFormatInfo that DateTime.Parse uses (Gregorian calendar only). */
interface CultureDateData {
  DateSeparator: string;
  TimeSeparator: string;
  AMDesignator: string;
  PMDesignator: string;
  ShortDatePattern: string;
  MonthDayPattern: string;
  YearMonthPattern: string;
  MonthNames: string[];
  AbbrevMonthNames: string[];
  /** Genitive month names, inserted when FormatFlags has UseGenitiveMonth; null otherwise. */
  GenitiveMonthNames: string[] | null;
  DayNames: string[];
  AbbrevDayNames: string[];
  EraNames: string[];
  AbbrevEraNames: string[];
}

const InvariantData: CultureDateData = {
  DateSeparator: '/',
  TimeSeparator: ':',
  AMDesignator: 'AM',
  PMDesignator: 'PM',
  ShortDatePattern: 'MM/dd/yyyy',
  MonthDayPattern: 'MMMM dd',
  YearMonthPattern: 'yyyy MMMM',
  MonthNames: InvariantMonthNames,
  AbbrevMonthNames: InvariantAbbrevMonthNames,
  GenitiveMonthNames: null,
  DayNames: InvariantDayNames,
  AbbrevDayNames: InvariantAbbrevDayNames,
  EraNames: InvariantEraNames,
  AbbrevEraNames: InvariantAbbrevEraNames,
};

/**
 * de-DE as .NET 8 on Windows reports it (CultureInfo.CreateSpecificCulture("de-DE"), dumped by
 * "oracle values --dtfi de-DE"): no date words, FormatFlags UseGenitiveMonth, TwoDigitYearMax 2049.
 */
const GermanData: CultureDateData = {
  DateSeparator: '.',
  TimeSeparator: ':',
  AMDesignator: '',
  PMDesignator: '',
  ShortDatePattern: 'dd.MM.yyyy',
  MonthDayPattern: 'd. MMMM',
  YearMonthPattern: 'MMMM yyyy',
  MonthNames: ['Januar', 'Februar', 'M\u00e4rz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember', ''],
  AbbrevMonthNames: ['Jan', 'Feb', 'M\u00e4r', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez', ''],
  GenitiveMonthNames: ['Januar', 'Februar', 'M\u00e4rz', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember', ''],
  DayNames: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  AbbrevDayNames: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
  EraNames: ['n. Chr.'],
  AbbrevEraNames: ['n. Chr.'],
};

/**
 * The parts of a DateTimeFormatInfo that DateTime.Parse uses: the invariant culture by default,
 * or the culture data given (the invariant tokens are added for every culture, as in .NET).
 */
class InvariantDateTimeFormatInfo {
  readonly DateSeparator: string;
  readonly TimeSeparator: string;
  readonly AMDesignator: string;
  readonly PMDesignator: string;
  readonly ShortDatePattern: string;
  readonly MonthDayPattern: string;
  readonly YearMonthPattern: string;

  private _dtfiTokenHash: (TokenHashValue | null)[] | null = null;

  constructor(private readonly data: CultureDateData = InvariantData) {
    this.DateSeparator = data.DateSeparator;
    this.TimeSeparator = data.TimeSeparator;
    this.AMDesignator = data.AMDesignator;
    this.PMDesignator = data.PMDesignator;
    this.ShortDatePattern = data.ShortDatePattern;
    this.MonthDayPattern = data.MonthDayPattern;
    this.YearMonthPattern = data.YearMonthPattern;
  }

  CreateTokenHashTable(): (TokenHashValue | null)[] {
    let temp = this._dtfiTokenHash;
    if (temp === null) {
      temp = new Array<TokenHashValue | null>(TOKEN_HASH_SIZE).fill(null);

      const sep = this.TimeSeparator.trim();
      if (',' !== sep) this.InsertHash(temp, ',', TokenType.IgnorableSymbol, 0);
      if ('.' !== sep) this.InsertHash(temp, '.', TokenType.IgnorableSymbol, 0);
      this.InsertHash(temp, this.TimeSeparator, TokenType.SEP_Time, 0);

      this.InsertHash(temp, this.AMDesignator, TokenType.SEP_Am | TokenType.Am, 0);
      this.InsertHash(temp, this.PMDesignator, TokenType.SEP_Pm | TokenType.Pm, 1);

      // CJK suffix
      this.InsertHash(temp, '年', TokenType.SEP_YearSuff, 0);
      this.InsertHash(temp, '년', TokenType.SEP_YearSuff, 0);
      this.InsertHash(temp, '月', TokenType.SEP_MonthSuff, 0);
      this.InsertHash(temp, '월', TokenType.SEP_MonthSuff, 0);
      this.InsertHash(temp, '日', TokenType.SEP_DaySuff, 0);
      this.InsertHash(temp, '일', TokenType.SEP_DaySuff, 0);
      this.InsertHash(temp, '時', TokenType.SEP_HourSuff, 0);
      this.InsertHash(temp, '时', TokenType.SEP_HourSuff, 0);
      this.InsertHash(temp, '分', TokenType.SEP_MinuteSuff, 0);
      this.InsertHash(temp, '秒', TokenType.SEP_SecondSuff, 0);

      this.InsertHash(temp, '-', TokenType.SEP_DateOrOffset, 0);

      // no date words for the invariant culture
      this.InsertHash(temp, this.DateSeparator, TokenType.SEP_Date, 0);
      // AddMonthNames
      const d = this.data;
      for (let i = 1; i <= 13; i++) {
        const str = d.MonthNames[i - 1];
        if (str.length > 0) this.InsertHash(temp, str, TokenType.MonthToken, i);
        this.InsertHash(temp, d.AbbrevMonthNames[i - 1], TokenType.MonthToken, i);
      }
      for (let i = 1; i <= 13; i++) {
        this.InsertHash(temp, d.AbbrevMonthNames[i - 1], TokenType.MonthToken, i);
      }
      if (d.GenitiveMonthNames !== null) {
        for (let i = 1; i <= 13; i++) {
          this.InsertHash(temp, d.GenitiveMonthNames[i - 1], TokenType.MonthToken, i);
        }
      }
      for (let i = 0; i < 7; i++) {
        this.InsertHash(temp, d.DayNames[i], TokenType.DayOfWeekToken, i);
        this.InsertHash(temp, d.AbbrevDayNames[i], TokenType.DayOfWeekToken, i);
      }
      for (let i = 1; i <= d.EraNames.length; i++) {
        this.InsertHash(temp, d.EraNames[i - 1], TokenType.EraToken, i);
        this.InsertHash(temp, d.AbbrevEraNames[i - 1], TokenType.EraToken, i);
      }

      this.InsertHash(temp, InvariantData.AMDesignator, TokenType.SEP_Am | TokenType.Am, 0);
      this.InsertHash(temp, InvariantData.PMDesignator, TokenType.SEP_Pm | TokenType.Pm, 1);
      for (let i = 1; i <= 12; i++) {
        this.InsertHash(temp, InvariantMonthNames[i - 1], TokenType.MonthToken, i);
        this.InsertHash(temp, InvariantAbbrevMonthNames[i - 1], TokenType.MonthToken, i);
      }
      for (let i = 0; i < 7; i++) {
        this.InsertHash(temp, InvariantDayNames[i], TokenType.DayOfWeekToken, i);
        this.InsertHash(temp, InvariantAbbrevDayNames[i], TokenType.DayOfWeekToken, i);
      }
      for (let i = 0; i < InvariantAbbrevEnglishEraNames.length; i++) {
        this.InsertHash(temp, InvariantAbbrevEnglishEraNames[i], TokenType.EraToken, i + 1);
      }

      this.InsertHash(temp, 'T', TokenType.SEP_LocalTimeMark, 0);
      this.InsertHash(temp, 'GMT', TokenType.TimeZoneToken, 0);
      this.InsertHash(temp, 'Z', TokenType.TimeZoneToken, 0);

      this.InsertHash(temp, '/', TokenType.SEP_Date, 0);
      this.InsertHash(temp, ':', TokenType.SEP_Time, 0);

      this._dtfiTokenHash = temp;
    }
    return temp;
  }

  Tokenize(TokenMask: TokenType, str: __DTString): { found: boolean; tokenType: TokenType; tokenValue: number } {
    let tokenType = TokenType.UnknownToken;
    let tokenValue = 0;

    let ch = str.m_current;
    const letter = isLetter(ch);
    if (letter) {
      ch = toLowerChar(ch);
    }

    const code = ch.charCodeAt(0);
    let hashcode = code % TOKEN_HASH_SIZE;
    const hashProbe = 1 + (code % SECOND_PRIME);
    const remaining = str.Length - str.Index;
    let i = 0;

    const hashTable = this._dtfiTokenHash ?? this.CreateTokenHashTable();
    do {
      const value = hashTable[hashcode];
      if (value === null) {
        break;
      }
      if ((value.tokenType & TokenMask) > 0 && value.tokenString.length <= remaining) {
        let compareStrings = true;
        if (letter) {
          const nextCharIndex = str.Index + value.tokenString.length;
          if (nextCharIndex > str.Length) {
            compareStrings = false;
          } else if (nextCharIndex < str.Length) {
            const nextCh = str.Value[nextCharIndex];
            compareStrings = !isLetter(nextCh);
          }
        }

        if (
          compareStrings &&
          ((value.tokenString.length === 1 && str.Value[str.Index] === value.tokenString[0]) ||
            equalsIgnoreCase(str.Value.substring(str.Index, str.Index + value.tokenString.length), value.tokenString))
        ) {
          tokenType = value.tokenType & TokenMask;
          tokenValue = value.tokenValue;
          str.Advance(value.tokenString.length);
          return { found: true, tokenType, tokenValue };
        }
        // month / day names with spaces: not in the invariant culture
      }
      i++;
      hashcode += hashProbe;
      if (hashcode >= TOKEN_HASH_SIZE) hashcode -= TOKEN_HASH_SIZE;
    } while (i < TOKEN_HASH_SIZE);

    return { found: false, tokenType, tokenValue };
  }

  private InsertAtCurrentHashNode(hashTable: (TokenHashValue | null)[], str: string, ch: string, tokenType: TokenType, tokenValue: number, pos: number, hashcode: number, hashProbe: number): void {
    let previousNode = hashTable[hashcode];
    hashTable[hashcode] = new TokenHashValue(str, tokenType, tokenValue);

    while (++pos < TOKEN_HASH_SIZE) {
      hashcode += hashProbe;
      if (hashcode >= TOKEN_HASH_SIZE) hashcode -= TOKEN_HASH_SIZE;
      const temp = hashTable[hashcode];
      if (temp !== null && toLowerChar(temp.tokenString[0]) !== ch) {
        continue;
      }
      hashTable[hashcode] = previousNode;
      if (temp === null) {
        return;
      }
      previousNode = temp;
    }
    throw new Error('The hashtable is full.');
  }

  private InsertHash(hashTable: (TokenHashValue | null)[], str: string, tokenType: TokenType, tokenValue: number): void {
    if (str === null || str.length === 0) {
      return;
    }
    let i = 0;
    if (isWhiteSpace(str[0]) || isWhiteSpace(str[str.length - 1])) {
      str = trimWhiteSpace(str);
      if (str.length === 0) {
        return;
      }
    }

    const ch = toLowerChar(str[0]);
    const code = ch.charCodeAt(0);
    let hashcode = code % TOKEN_HASH_SIZE;
    const hashProbe = 1 + (code % SECOND_PRIME);
    do {
      const value = hashTable[hashcode];
      if (value === null) {
        hashTable[hashcode] = new TokenHashValue(str, tokenType, tokenValue);
        return;
      } else {
        if (str.length >= value.tokenString.length) {
          if (this.CompareStringIgnoreCaseOptimized(str.substring(0, value.tokenString.length), value.tokenString)) {
            if (str.length > value.tokenString.length) {
              this.InsertAtCurrentHashNode(hashTable, str, ch, tokenType, tokenValue, i, hashcode, hashProbe);
              return;
            } else {
              const nTokenType = tokenType as number;
              const nCurrentTokenTypeInHash = value.tokenType as number;
              if (
                ((nCurrentTokenTypeInHash & TokenType.RegularTokenMask) === 0 && (nTokenType & TokenType.RegularTokenMask) !== 0) ||
                ((nCurrentTokenTypeInHash & TokenType.SeparatorTokenMask) === 0 && (nTokenType & TokenType.SeparatorTokenMask) !== 0)
              ) {
                value.tokenType |= tokenType;
                if (tokenValue !== 0) {
                  value.tokenValue = tokenValue;
                }
              }
              return;
            }
          }
        }
      }
      i++;
      hashcode += hashProbe;
      if (hashcode >= TOKEN_HASH_SIZE) hashcode -= TOKEN_HASH_SIZE;
    } while (i < TOKEN_HASH_SIZE);
    throw new Error('The hashtable is full.');
  }

  private CompareStringIgnoreCaseOptimized(string1: string, string2: string): boolean {
    if (string1.length === 1 && string2.length === 1 && string1 === string2) {
      return true;
    }
    return equalsIgnoreCase(string1, string2);
  }
}

function trimWhiteSpace(s: string): string {
  let start = 0;
  let end = s.length;
  while (start < end && isWhiteSpace(s[start])) start++;
  while (end > start && isWhiteSpace(s[end - 1])) end--;
  return s.substring(start, end);
}

let s_invariantInfo: InvariantDateTimeFormatInfo | null = null;
let s_germanInfo: InvariantDateTimeFormatInfo | null = null;

function invariantInfo(): InvariantDateTimeFormatInfo {
  return (s_invariantInfo ??= new InvariantDateTimeFormatInfo());
}

function germanInfo(): InvariantDateTimeFormatInfo {
  return (s_germanInfo ??= new InvariantDateTimeFormatInfo(GermanData));
}

// ---------------------------------------------------------------------------------------------
// DateTimeParse

/**
 * ParseFraction: starting at str.Index (a decimal symbol), parse the following digits as a
 * fraction.
 */
function ParseFraction(str: __DTString): { ok: boolean; result: number } {
  let result = 0;
  let decimalBase = 0.1;
  let digits = 0;
  let ch: string;
  while (str.GetNext() && isAsciiDigit((ch = str.m_current))) {
    result += (ch.charCodeAt(0) - 0x30) * decimalBase;
    decimalBase *= 0.1;
    digits++;
  }
  return { ok: digits > 0, result };
}

/** ParseTimeZone: "+8", "+08", "+08:00", "+0800"; the offset in ticks or null. */
function ParseTimeZone(str: __DTString): bigint | null {
  let hourOffset: number;
  let minuteOffset = 0;

  // Consume the +/- character that has already been read
  let sub = str.GetSubString();
  if (sub.length !== 1) {
    return null;
  }
  const offsetChar = sub.s[sub.index];
  if (offsetChar !== '+' && offsetChar !== '-') {
    return null;
  }
  str.ConsumeSubString(sub);

  sub = str.GetSubString();
  if (sub.type !== DTSubStringType.Number) {
    return null;
  }
  const value = sub.value;
  const length = sub.length;
  if (length === 1 || length === 2) {
    // Parsing "+8" or "+08"
    hourOffset = value;
    str.ConsumeSubString(sub);
    // See if we have minutes
    sub = str.GetSubString();
    if (sub.length === 1 && sub.s[sub.index] === TimeDelimiter) {
      // Parsing "+8:00" or "+08:00"
      str.ConsumeSubString(sub);
      sub = str.GetSubString();
      if (sub.type !== DTSubStringType.Number || sub.length < 1 || sub.length > 2) {
        return null;
      }
      minuteOffset = sub.value;
      str.ConsumeSubString(sub);
    }
  } else if (length === 3 || length === 4) {
    // Parsing "+800" or "+0800"
    hourOffset = Math.trunc(value / 100);
    minuteOffset = value % 100;
    str.ConsumeSubString(sub);
  } else {
    // Wrong number of digits
    return null;
  }
  if (minuteOffset < 0 || minuteOffset >= 60) {
    return null;
  }

  let result = BigInt(hourOffset) * TicksPerHour + BigInt(minuteOffset) * TicksPerMinute;
  if (offsetChar === '-') {
    result = -result;
  }
  return result;
}

/** HandleTimeZone: a time zone offset like +/-0800 after a time. */
function HandleTimeZone(str: __DTString, result: DateTimeResult): boolean {
  if (str.Index < str.Length - 1) {
    let nextCh = str.Value[str.Index];
    // Skip whitespace, but don't update the index unless we find a time zone marker
    let whitespaceCount = 0;
    while (isWhiteSpace(nextCh) && str.Index + whitespaceCount < str.Length - 1) {
      whitespaceCount++;
      nextCh = str.Value[str.Index + whitespaceCount];
    }
    if (nextCh === '+' || nextCh === '-') {
      str.Index += whitespaceCount;
      if ((result.flags & ParseFlags.TimeZoneUsed) !== 0) {
        // Should not have two timezone offsets.
        result.SetBadDateTimeFailure();
        return false;
      }
      result.flags |= ParseFlags.TimeZoneUsed;
      const tz = ParseTimeZone(str);
      if (tz === null) {
        result.SetBadDateTimeFailure();
        return false;
      }
      result.timeZoneOffset = tz;
    }
  }
  return true;
}

/** The mutable state that Lex receives by ref. */
interface LexState {
  styles: DateTimeStyles;
}

/**
 * The lexer: check the character at the current index, put the found token into dtok and some raw
 * date/time information into raw.
 */
function Lex(dps: DS, str: __DTString, dtok: DateTimeToken, raw: DateTimeRawInfo, result: DateTimeResult, dtfi: InvariantDateTimeFormatInfo, st: LexState): boolean {
  let sep: TokenType;
  dtok.dtt = DTT.Unk; // Assume the token is unknown.

  const { tokenType, tokenValue } = str.GetRegularToken(dtfi);

  switch (tokenType) {
    case TokenType.NumberToken:
    case TokenType.YearNumberToken: {
      if (raw.numCount === 3 || tokenValue === -1) {
        result.SetBadDateTimeFailure();
        return false;
      }
      // Look ahead to see if the following character is a decimal point or timezone offset.
      // This enables us to parse time in the forms of: "11:22:33.1234" or "11:22:33-08".
      if (dps === DS.T_NNt) {
        if (str.Index < str.Length - 1) {
          const nextCh = str.Value[str.Index];
          if (nextCh === TimeFractionDelimiterDot || nextCh === TimeFractionDelimiterComma) {
            // While ParseFraction can fail, it just means that there were no digits after
            // the dot. In this case ParseFraction just removes the dot.
            raw.fraction = ParseFraction(str).result;
          }
        }
      }
      if (dps === DS.T_NNt || dps === DS.T_Nt) {
        if (str.Index < str.Length - 1) {
          if (!HandleTimeZone(str, result)) {
            return false;
          }
        }
      }

      dtok.num = tokenValue;
      if (tokenType === TokenType.YearNumberToken) {
        if (raw.year === -1) {
          raw.year = tokenValue;
          const s = str.GetSeparatorToken(dtfi);
          switch ((sep = s.tokenType)) {
            case TokenType.SEP_End:
              dtok.dtt = DTT.YearEnd;
              break;
            case TokenType.SEP_Am:
            case TokenType.SEP_Pm:
              if (raw.timeMark === TM.NotSet) {
                raw.timeMark = sep === TokenType.SEP_Am ? TM.AM : TM.PM;
                dtok.dtt = DTT.YearSpace;
              } else {
                result.SetBadDateTimeFailure();
              }
              break;
            case TokenType.SEP_Space:
              dtok.dtt = DTT.YearSpace;
              break;
            case TokenType.SEP_Date:
              dtok.dtt = DTT.YearDateSep;
              break;
            case TokenType.SEP_Time:
              if (!raw.hasSameDateAndTimeSeparators) {
                result.SetBadDateTimeFailure();
                return false;
              }
              // we have the date and time separators are same and getting a year number, then change the token to YearDateSep as
              // we are sure we are not parsing time.
              dtok.dtt = DTT.YearDateSep;
              break;
            case TokenType.SEP_DateOrOffset:
              // The separator is either a date separator or the start of a time zone offset. If the token will complete the date then
              // process just the number and roll back the index so that the outer loop can attempt to parse the time zone offset.
              if (nextState(dps, DTT.YearDateSep) === DS.ERROR && nextState(dps, DTT.YearSpace) > DS.ERROR) {
                str.Index = s.indexBeforeSeparator;
                str.m_current = s.charBeforeSeparator;
                dtok.dtt = DTT.YearSpace;
              } else {
                dtok.dtt = DTT.YearDateSep;
              }
              break;
            case TokenType.SEP_YearSuff:
            case TokenType.SEP_MonthSuff:
            case TokenType.SEP_DaySuff:
              dtok.dtt = DTT.NumDatesuff;
              dtok.suffix = sep;
              break;
            case TokenType.SEP_HourSuff:
            case TokenType.SEP_MinuteSuff:
            case TokenType.SEP_SecondSuff:
              dtok.dtt = DTT.NumTimesuff;
              dtok.suffix = sep;
              break;
            default:
              // Invalid separator after number number.
              result.SetBadDateTimeFailure();
              return false;
          }
          // Found the token already. Return now.
          return true;
        }
        result.SetBadDateTimeFailure();
        return false;
      }
      const s = str.GetSeparatorToken(dtfi);
      switch ((sep = s.tokenType)) {
        // Note here we check if the numCount is less than three.
        // When we have more than three numbers, it will be caught as error in the state machine.
        case TokenType.SEP_End:
          dtok.dtt = DTT.NumEnd;
          raw.AddNumber(dtok.num);
          break;
        case TokenType.SEP_Am:
        case TokenType.SEP_Pm:
          if (raw.timeMark === TM.NotSet) {
            raw.timeMark = sep === TokenType.SEP_Am ? TM.AM : TM.PM;
            dtok.dtt = DTT.NumAmpm;
            // Fix AM/PM parsing case, e.g. "1/10 5 AM"
            if (dps === DS.D_NN) {
              if (!ProcessTerminalState(DS.DX_NN, result, st, raw, dtfi)) {
                return false;
              }
            }
            raw.AddNumber(dtok.num);
          } else {
            result.SetBadDateTimeFailure();
            break;
          }
          if (dps === DS.T_NNt || dps === DS.T_Nt) {
            if (!HandleTimeZone(str, result)) {
              return false;
            }
          }
          break;
        case TokenType.SEP_Space:
          dtok.dtt = DTT.NumSpace;
          raw.AddNumber(dtok.num);
          break;
        case TokenType.SEP_Date:
          dtok.dtt = DTT.NumDatesep;
          raw.AddNumber(dtok.num);
          break;
        case TokenType.SEP_DateOrOffset:
          // The separator is either a date separator or the start of a time zone offset. If the token will complete the date then
          // process just the number and roll back the index so that the outer loop can attempt to parse the time zone offset.
          if (nextState(dps, DTT.NumDatesep) === DS.ERROR && nextState(dps, DTT.NumSpace) > DS.ERROR) {
            str.Index = s.indexBeforeSeparator;
            str.m_current = s.charBeforeSeparator;
            dtok.dtt = DTT.NumSpace;
          } else {
            dtok.dtt = DTT.NumDatesep;
          }
          raw.AddNumber(dtok.num);
          break;
        case TokenType.SEP_Time:
          if (raw.hasSameDateAndTimeSeparators && (dps === DS.D_Y || dps === DS.D_YN || dps === DS.D_YNd || dps === DS.D_YM || dps === DS.D_YMd)) {
            // we are parsing a date and we have the time separator same as date separator, so we mark the token as date separator
            dtok.dtt = DTT.NumDatesep;
            raw.AddNumber(dtok.num);
            break;
          }
          dtok.dtt = DTT.NumTimesep;
          raw.AddNumber(dtok.num);
          break;
        case TokenType.SEP_YearSuff: {
          const y = calendarToFourDigitYear(tokenValue);
          if (y === null) {
            result.SetBadDateTimeFailure();
            return false;
          }
          dtok.num = y;
          dtok.dtt = DTT.NumDatesuff;
          dtok.suffix = sep;
          break;
        }
        case TokenType.SEP_MonthSuff:
        case TokenType.SEP_DaySuff:
          dtok.dtt = DTT.NumDatesuff;
          dtok.suffix = sep;
          break;
        case TokenType.SEP_HourSuff:
        case TokenType.SEP_MinuteSuff:
        case TokenType.SEP_SecondSuff:
          dtok.dtt = DTT.NumTimesuff;
          dtok.suffix = sep;
          break;
        case TokenType.SEP_LocalTimeMark:
          dtok.dtt = DTT.NumLocalTimeMark;
          raw.AddNumber(dtok.num);
          break;
        default:
          // Invalid separator after number number.
          result.SetBadDateTimeFailure();
          return false;
      }
      break;
    }
    // TokenType.HebrewNumber: not produced for the invariant culture
    case TokenType.DayOfWeekToken:
      if (raw.dayOfWeek === -1) {
        // This is a day of week name.
        raw.dayOfWeek = tokenValue;
        dtok.dtt = DTT.DayOfWeek;
      } else {
        result.SetBadDateTimeFailure();
        return false;
      }
      break;
    case TokenType.MonthToken:
      if (raw.month === -1) {
        // This is a month name
        const s = str.GetSeparatorToken(dtfi);
        switch ((sep = s.tokenType)) {
          case TokenType.SEP_End:
            dtok.dtt = DTT.MonthEnd;
            break;
          case TokenType.SEP_Space:
            dtok.dtt = DTT.MonthSpace;
            break;
          case TokenType.SEP_Date:
            dtok.dtt = DTT.MonthDatesep;
            break;
          case TokenType.SEP_Time:
            if (!raw.hasSameDateAndTimeSeparators) {
              result.SetBadDateTimeFailure();
              return false;
            }
            // we have the date and time separators are same and getting a Month name, then change the token to MonthDatesep as
            // we are sure we are not parsing time.
            dtok.dtt = DTT.MonthDatesep;
            break;
          case TokenType.SEP_DateOrOffset:
            // The separator is either a date separator or the start of a time zone offset. If the token will complete the date then
            // process just the number and roll back the index so that the outer loop can attempt to parse the time zone offset.
            if (nextState(dps, DTT.MonthDatesep) === DS.ERROR && nextState(dps, DTT.MonthSpace) > DS.ERROR) {
              str.Index = s.indexBeforeSeparator;
              str.m_current = s.charBeforeSeparator;
              dtok.dtt = DTT.MonthSpace;
            } else {
              dtok.dtt = DTT.MonthDatesep;
            }
            break;
          default:
            // Invalid separator after month name
            result.SetBadDateTimeFailure();
            return false;
        }
        raw.month = tokenValue;
      } else {
        result.SetBadDateTimeFailure();
        return false;
      }
      break;
    case TokenType.EraToken:
      if (result.era !== -1) {
        result.era = tokenValue;
        dtok.dtt = DTT.Era;
      } else {
        result.SetBadDateTimeFailure();
        return false;
      }
      break;
    // TokenType.JapaneseEraToken, TokenType.TEraToken: not produced for the invariant culture
    case TokenType.TimeZoneToken:
      // This is a timezone designator
      // NOTENOTE : for now, we only support "GMT" and "Z" (for Zulu time).
      if ((result.flags & ParseFlags.TimeZoneUsed) !== 0) {
        // Should not have two timezone offsets.
        result.SetBadDateTimeFailure();
        return false;
      }
      dtok.dtt = DTT.TimeZone;
      result.flags |= ParseFlags.TimeZoneUsed;
      result.timeZoneOffset = 0n;
      result.flags |= ParseFlags.TimeZoneUtc;
      break;
    case TokenType.EndOfString:
      dtok.dtt = DTT.End;
      break;
    case TokenType.DateWordToken:
    case TokenType.IgnorableSymbol:
      // Date words and ignorable symbols can just be skipped over
      break;
    case TokenType.Am:
    case TokenType.Pm:
      if (raw.timeMark === TM.NotSet) {
        raw.timeMark = tokenValue as TM;
      } else {
        result.SetBadDateTimeFailure();
        return false;
      }
      break;
    case TokenType.UnknownToken:
      if (isLetter(str.m_current)) {
        result.SetFailure(ParseFailureKind.Format_UnknownDateTimeWord, str.Index);
        return false;
      }

      if ((str.m_current === '-' || str.m_current === '+') && (result.flags & ParseFlags.TimeZoneUsed) === 0) {
        const originalIndex = str.Index;
        const tz = ParseTimeZone(str);
        if (tz !== null) {
          result.timeZoneOffset = tz;
          result.flags |= ParseFlags.TimeZoneUsed;
          return true;
        } else {
          // Time zone parse attempt failed. Fall through to punctuation handling.
          str.Index = originalIndex;
        }
      }

      // Visual Basic implements string to date conversions on top of DateTime.Parse:
      //   CDate("#10/10/95#")
      if (VerifyValidPunctuation(str)) {
        return true;
      }

      result.SetBadDateTimeFailure();
      return false;
  }

  return true;
}

function VerifyValidPunctuation(str: __DTString): boolean {
  // Compatibility Behavior. Allow trailing nulls and surrounding hashes
  let ch = str.Value[str.Index];
  if (ch === '#') {
    let foundStart = false;
    let foundEnd = false;
    for (let i = 0; i < str.Length; i++) {
      ch = str.Value[i];
      if (ch === '#') {
        if (foundStart) {
          if (foundEnd) {
            // Having more than two hashes is invalid
            return false;
          } else {
            foundEnd = true;
          }
        } else {
          foundStart = true;
        }
      } else if (ch === '\0') {
        // Allow nulls only at the end
        if (!foundEnd) {
          return false;
        }
      } else if (!isWhiteSpace(ch)) {
        // Anything other than whitespace outside hashes is invalid
        if (!foundStart || foundEnd) {
          return false;
        }
      }
    }
    if (!foundEnd) {
      // The has was un-paired
      return false;
    }
    // Valid Hash usage: eat the hash and continue.
    str.GetNext();
    return true;
  } else if (ch === '\0') {
    // Nulls are only valid if they are the only trailing character
    for (let i = str.Index + 1; i < str.Length; i++) {
      if (str.Value[i] !== '\0') return false;
    }
    // Move to the end of the string
    str.Index = str.Length;
    return true;
  }
  return false;
}

const ORDER_YMD = 0; // The order of date is Year/Month/Day.
const ORDER_MDY = 1; // The order of date is Month/Day/Year.
const ORDER_DMY = 2; // The order of date is Day/Month/Year.
const ORDER_YDM = 3; // The order of date is Year/Day/Month
const ORDER_YM = 4; // Year/Month order.
const ORDER_MY = 5; // Month/Year order.
const ORDER_MD = 6; // Month/Day order.
const ORDER_DM = 7; // Day/Month order.

/** Decide the year/month/day order from the datePattern; -1 if unknown. */
function GetYearMonthDayOrder(datePattern: string): number {
  let yearOrder = -1;
  let monthOrder = -1;
  let dayOrder = -1;
  let orderCount = 0;
  let inQuote = false;

  for (let i = 0; i < datePattern.length && orderCount < 3; i++) {
    const ch = datePattern[i];
    if (ch === '\\' || ch === '%') {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = !inQuote;
    }
    if (!inQuote) {
      if (ch === 'y') {
        yearOrder = orderCount++;
        for (; i + 1 < datePattern.length && datePattern[i + 1] === 'y'; i++) {
          // skip
        }
      } else if (ch === 'M') {
        monthOrder = orderCount++;
        for (; i + 1 < datePattern.length && datePattern[i + 1] === 'M'; i++) {
          // skip
        }
      } else if (ch === 'd') {
        let patternCount = 1;
        for (; i + 1 < datePattern.length && datePattern[i + 1] === 'd'; i++) {
          patternCount++;
        }
        if (patternCount <= 2) {
          dayOrder = orderCount++;
        }
      }
    }
  }

  if (yearOrder === 0 && monthOrder === 1 && dayOrder === 2) return ORDER_YMD;
  if (monthOrder === 0 && dayOrder === 1 && yearOrder === 2) return ORDER_MDY;
  if (dayOrder === 0 && monthOrder === 1 && yearOrder === 2) return ORDER_DMY;
  if (yearOrder === 0 && dayOrder === 1 && monthOrder === 2) return ORDER_YDM;
  return -1;
}

/** Decide the year/month order from the pattern; -1 if unknown. */
function GetYearMonthOrder(pattern: string): number {
  let yearOrder = -1;
  let monthOrder = -1;
  let orderCount = 0;
  let inQuote = false;
  for (let i = 0; i < pattern.length && orderCount < 2; i++) {
    const ch = pattern[i];
    if (ch === '\\' || ch === '%') {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = !inQuote;
    }
    if (!inQuote) {
      if (ch === 'y') {
        yearOrder = orderCount++;
        for (; i + 1 < pattern.length && pattern[i + 1] === 'y'; i++) {
          // skip
        }
      } else if (ch === 'M') {
        monthOrder = orderCount++;
        for (; i + 1 < pattern.length && pattern[i + 1] === 'M'; i++) {
          // skip
        }
      }
    }
  }
  if (yearOrder === 0 && monthOrder === 1) return ORDER_YM;
  if (monthOrder === 0 && yearOrder === 1) return ORDER_MY;
  return -1;
}

/** Decide the month/day order from the pattern; -1 if unknown. */
function GetMonthDayOrder(pattern: string): number {
  let monthOrder = -1;
  let dayOrder = -1;
  let orderCount = 0;
  let inQuote = false;
  for (let i = 0; i < pattern.length && orderCount < 2; i++) {
    const ch = pattern[i];
    if (ch === '\\' || ch === '%') {
      i++;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inQuote = !inQuote;
    }
    if (!inQuote) {
      if (ch === 'd') {
        let patternCount = 1;
        for (; i + 1 < pattern.length && pattern[i + 1] === 'd'; i++) {
          patternCount++;
        }
        if (patternCount <= 2) {
          dayOrder = orderCount++;
        }
      } else if (ch === 'M') {
        monthOrder = orderCount++;
        for (; i + 1 < pattern.length && pattern[i + 1] === 'M'; i++) {
          // skip
        }
      }
    }
  }
  if (monthOrder === 0 && dayOrder === 1) return ORDER_MD;
  if (dayOrder === 0 && monthOrder === 1) return ORDER_DM;
  return -1;
}

/** Adjust the two-digit year if necessary; null if out of range. */
function TryAdjustYear(_result: DateTimeResult, year: number): number | null {
  if (year < 100) {
    return calendarToFourDigitYear(year);
  }
  return year;
}

function SetDateYMD(result: DateTimeResult, year: number, month: number, day: number): boolean {
  if (calendarIsValidDay(year, month, day, result.era)) {
    result.SetDate(year, month, day); // YMD
    return true;
  }
  return false;
}

function SetDateMDY(result: DateTimeResult, month: number, day: number, year: number): boolean {
  return SetDateYMD(result, year, month, day);
}

function SetDateDMY(result: DateTimeResult, day: number, month: number, year: number): boolean {
  return SetDateYMD(result, year, month, day);
}

function SetDateYDM(result: DateTimeResult, year: number, day: number, month: number): boolean {
  return SetDateYMD(result, year, month, day);
}

function GetDefaultYear(result: DateTimeResult, st: LexState): void {
  result.Year = GetDateTimeNow(result, st).year;
  result.flags |= ParseFlags.YearDefault;
}

// Processing terminal case: DS.DX_NN
function GetDayOfNN(result: DateTimeResult, st: LexState, raw: DateTimeRawInfo, dtfi: InvariantDateTimeFormatInfo): boolean {
  if ((result.flags & ParseFlags.HaveDate) !== 0) {
    // Multiple dates in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  const n1 = raw.GetNumber(0);
  const n2 = raw.GetNumber(1);

  GetDefaultYear(result, st);

  const order = GetMonthDayOrder(dtfi.MonthDayPattern);
  if (order === -1) {
    result.SetFailure(ParseFailureKind.Format_BadDatePattern);
    return false;
  }

  if (order === ORDER_MD) {
    if (SetDateYMD(result, result.Year, n1, n2)) {
      // MD
      result.flags |= ParseFlags.HaveDate;
      return true;
    }
  } else {
    // ORDER_DM
    if (SetDateYMD(result, result.Year, n2, n1)) {
      // DM
      result.flags |= ParseFlags.HaveDate;
      return true;
    }
  }
  result.SetBadDateTimeFailure();
  return false;
}

// Processing terminal case: DS.DX_NNN
function GetDayOfNNN(result: DateTimeResult, raw: DateTimeRawInfo, dtfi: InvariantDateTimeFormatInfo): boolean {
  if ((result.flags & ParseFlags.HaveDate) !== 0) {
    // Multiple dates in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  const n1 = raw.GetNumber(0);
  const n2 = raw.GetNumber(1);
  const n3 = raw.GetNumber(2);

  const order = GetYearMonthDayOrder(dtfi.ShortDatePattern);
  if (order === -1) {
    result.SetFailure(ParseFailureKind.Format_BadDatePattern);
    return false;
  }
  let year: number | null;

  if (order === ORDER_YMD) {
    if ((year = TryAdjustYear(result, n1)) !== null && SetDateYMD(result, year, n2, n3)) {
      // YMD
      result.flags |= ParseFlags.HaveDate;
      return true;
    }
  } else if (order === ORDER_MDY) {
    if ((year = TryAdjustYear(result, n3)) !== null && SetDateMDY(result, n1, n2, year)) {
      // MDY
      result.flags |= ParseFlags.HaveDate;
      return true;
    }
  } else if (order === ORDER_DMY) {
    if ((year = TryAdjustYear(result, n3)) !== null && SetDateDMY(result, n1, n2, year)) {
      // DMY
      result.flags |= ParseFlags.HaveDate;
      return true;
    }
  } else if (order === ORDER_YDM) {
    if ((year = TryAdjustYear(result, n1)) !== null && SetDateYDM(result, year, n2, n3)) {
      // YDM
      result.flags |= ParseFlags.HaveDate;
      return true;
    }
  }
  result.SetBadDateTimeFailure();
  return false;
}

function GetDayOfMN(result: DateTimeResult, st: LexState, raw: DateTimeRawInfo, dtfi: InvariantDateTimeFormatInfo): boolean {
  if ((result.flags & ParseFlags.HaveDate) !== 0) {
    // Multiple dates in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  // The interpretation is based on the MonthDayPattern and YearMonthPattern
  //
  //    MonthDayPattern   YearMonthPattern  Interpretation
  //    ---------------   ----------------  ---------------
  //    MMMM dd           MMMM yyyy         Day
  //    MMMM dd           yyyy MMMM         Day
  //    dd MMMM           MMMM yyyy         Year
  //    dd MMMM           yyyy MMMM         Day

  const monthDayOrder = GetMonthDayOrder(dtfi.MonthDayPattern);
  if (monthDayOrder === -1) {
    result.SetFailure(ParseFailureKind.Format_BadDatePattern);
    return false;
  }
  if (monthDayOrder === ORDER_DM) {
    const yearMonthOrder = GetYearMonthOrder(dtfi.YearMonthPattern);
    if (yearMonthOrder === -1) {
      result.SetFailure(ParseFailureKind.Format_BadDatePattern);
      return false;
    }
    if (yearMonthOrder === ORDER_MY) {
      const year = TryAdjustYear(result, raw.GetNumber(0));
      if (year === null || !SetDateYMD(result, year, raw.month, 1)) {
        result.SetBadDateTimeFailure();
        return false;
      }
      return true;
    }
  }

  GetDefaultYear(result, st);
  if (!SetDateYMD(result, result.Year, raw.month, raw.GetNumber(0))) {
    result.SetBadDateTimeFailure();
    return false;
  }
  return true;
}

function GetDayOfNM(result: DateTimeResult, st: LexState, raw: DateTimeRawInfo, dtfi: InvariantDateTimeFormatInfo): boolean {
  if ((result.flags & ParseFlags.HaveDate) !== 0) {
    // Multiple dates in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  // The interpretation is based on the MonthDayPattern and YearMonthPattern
  //
  //    MonthDayPattern   YearMonthPattern  Interpretation
  //    ---------------   ----------------  ---------------
  //    MMMM dd           MMMM yyyy         Day
  //    MMMM dd           yyyy MMMM         Year
  //    dd MMMM           MMMM yyyy         Day
  //    dd MMMM           yyyy MMMM         Day

  const monthDayOrder = GetMonthDayOrder(dtfi.MonthDayPattern);
  if (monthDayOrder === -1) {
    result.SetFailure(ParseFailureKind.Format_BadDatePattern);
    return false;
  }
  if (monthDayOrder === ORDER_MD) {
    const yearMonthOrder = GetYearMonthOrder(dtfi.YearMonthPattern);
    if (yearMonthOrder === -1) {
      result.SetFailure(ParseFailureKind.Format_BadDatePattern);
      return false;
    }
    if (yearMonthOrder === ORDER_YM) {
      const year = TryAdjustYear(result, raw.GetNumber(0));
      if (year === null || !SetDateYMD(result, year, raw.month, 1)) {
        result.SetBadDateTimeFailure();
        return false;
      }
      return true;
    }
  }

  GetDefaultYear(result, st);
  if (!SetDateYMD(result, result.Year, raw.month, raw.GetNumber(0))) {
    result.SetBadDateTimeFailure();
    return false;
  }
  return true;
}

function GetDayOfMNN(result: DateTimeResult, raw: DateTimeRawInfo, dtfi: InvariantDateTimeFormatInfo): boolean {
  if ((result.flags & ParseFlags.HaveDate) !== 0) {
    // Multiple dates in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  const n1 = raw.GetNumber(0);
  const n2 = raw.GetNumber(1);

  const order = GetYearMonthDayOrder(dtfi.ShortDatePattern);
  if (order === -1) {
    result.SetFailure(ParseFailureKind.Format_BadDatePattern);
    return false;
  }
  let year: number | null;

  if (order === ORDER_MDY) {
    if ((year = TryAdjustYear(result, n2)) !== null && calendarIsValidDay(year, raw.month, n1, result.era)) {
      result.SetDate(year, raw.month, n1); // MDY
      result.flags |= ParseFlags.HaveDate;
      return true;
    } else if ((year = TryAdjustYear(result, n1)) !== null && calendarIsValidDay(year, raw.month, n2, result.era)) {
      result.SetDate(year, raw.month, n2); // YMD
      result.flags |= ParseFlags.HaveDate;
      return true;
    }
  } else if (order === ORDER_YMD) {
    if ((year = TryAdjustYear(result, n1)) !== null && calendarIsValidDay(year, raw.month, n2, result.era)) {
      result.SetDate(year, raw.month, n2); // YMD
      result.flags |= ParseFlags.HaveDate;
      return true;
    } else if ((year = TryAdjustYear(result, n2)) !== null && calendarIsValidDay(year, raw.month, n1, result.era)) {
      result.SetDate(year, raw.month, n1); // DMY
      result.flags |= ParseFlags.HaveDate;
      return true;
    }
  } else if (order === ORDER_DMY) {
    if ((year = TryAdjustYear(result, n2)) !== null && calendarIsValidDay(year, raw.month, n1, result.era)) {
      result.SetDate(year, raw.month, n1); // DMY
      result.flags |= ParseFlags.HaveDate;
      return true;
    } else if ((year = TryAdjustYear(result, n1)) !== null && calendarIsValidDay(year, raw.month, n2, result.era)) {
      result.SetDate(year, raw.month, n2); // YMD
      result.flags |= ParseFlags.HaveDate;
      return true;
    }
  }

  result.SetBadDateTimeFailure();
  return false;
}

function GetDayOfYNN(result: DateTimeResult, raw: DateTimeRawInfo, dtfi: InvariantDateTimeFormatInfo): boolean {
  if ((result.flags & ParseFlags.HaveDate) !== 0) {
    // Multiple dates in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  const n1 = raw.GetNumber(0);
  const n2 = raw.GetNumber(1);
  const pattern = dtfi.ShortDatePattern;

  // For compatibility, don't throw if we can't determine the order, but default to YMD instead
  if (GetYearMonthDayOrder(pattern) === ORDER_YDM) {
    if (SetDateYMD(result, raw.year, n2, n1)) {
      result.flags |= ParseFlags.HaveDate;
      return true; // Year + DM
    }
  } else {
    if (SetDateYMD(result, raw.year, n1, n2)) {
      result.flags |= ParseFlags.HaveDate;
      return true; // Year + MD
    }
  }
  result.SetBadDateTimeFailure();
  return false;
}

function GetDayOfNNY(result: DateTimeResult, raw: DateTimeRawInfo, dtfi: InvariantDateTimeFormatInfo): boolean {
  if ((result.flags & ParseFlags.HaveDate) !== 0) {
    // Multiple dates in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  const n1 = raw.GetNumber(0);
  const n2 = raw.GetNumber(1);

  const order = GetYearMonthDayOrder(dtfi.ShortDatePattern);
  if (order === -1) {
    result.SetFailure(ParseFailureKind.Format_BadDatePattern);
    return false;
  }

  if (order === ORDER_MDY || order === ORDER_YMD) {
    if (SetDateYMD(result, raw.year, n1, n2)) {
      result.flags |= ParseFlags.HaveDate;
      return true; // MD + Year
    }
  } else {
    if (SetDateYDM(result, raw.year, n1, n2)) {
      result.flags |= ParseFlags.HaveDate;
      return true; // DM + Year
    }
  }
  result.SetBadDateTimeFailure();
  return false;
}

function GetDayOfYMN(result: DateTimeResult, raw: DateTimeRawInfo): boolean {
  if ((result.flags & ParseFlags.HaveDate) !== 0) {
    // Multiple dates in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  if (SetDateYMD(result, raw.year, raw.month, raw.GetNumber(0))) {
    result.flags |= ParseFlags.HaveDate;
    return true;
  }
  result.SetBadDateTimeFailure();
  return false;
}

function GetDayOfYN(result: DateTimeResult, raw: DateTimeRawInfo): boolean {
  if ((result.flags & ParseFlags.HaveDate) !== 0) {
    // Multiple dates in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  if (SetDateYMD(result, raw.year, raw.GetNumber(0), 1)) {
    result.flags |= ParseFlags.HaveDate;
    return true;
  }
  result.SetBadDateTimeFailure();
  return false;
}

function GetDayOfYM(result: DateTimeResult, raw: DateTimeRawInfo): boolean {
  if ((result.flags & ParseFlags.HaveDate) !== 0) {
    // Multiple dates in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  if (SetDateYMD(result, raw.year, raw.month, 1)) {
    result.flags |= ParseFlags.HaveDate;
    return true;
  }
  result.SetBadDateTimeFailure();
  return false;
}

function AdjustTimeMark(dtfi: InvariantDateTimeFormatInfo, raw: DateTimeRawInfo): void {
  // Special case for culture which uses AM as empty string (never for the invariant culture).
  if (raw.timeMark === TM.NotSet) {
    if (dtfi.AMDesignator !== null && dtfi.PMDesignator !== null) {
      if (dtfi.AMDesignator.length === 0 && dtfi.PMDesignator.length !== 0) {
        raw.timeMark = TM.AM;
      }
      if (dtfi.PMDesignator.length === 0 && dtfi.AMDesignator.length !== 0) {
        raw.timeMark = TM.PM;
      }
    }
  }
}

/** Adjust hour according to the time mark; null if invalid. */
function AdjustHour(hour: number, timeMark: TM): number | null {
  if (timeMark !== TM.NotSet) {
    if (timeMark === TM.AM) {
      if (hour < 0 || hour > 12) {
        return null;
      }
      hour = hour === 12 ? 0 : hour;
    } else {
      if (hour < 0 || hour > 23) {
        return null;
      }
      if (hour < 12) {
        hour += 12;
      }
    }
  }
  return hour;
}

function GetTimeOfN(result: DateTimeResult, raw: DateTimeRawInfo): boolean {
  if ((result.flags & ParseFlags.HaveTime) !== 0) {
    // Multiple times in the input string
    result.SetBadDateTimeFailure();
    return false;
  }
  // In this case, we need a time mark. Check if so.
  if (raw.timeMark === TM.NotSet) {
    result.SetBadDateTimeFailure();
    return false;
  }
  result.Hour = raw.GetNumber(0);
  result.flags |= ParseFlags.HaveTime;
  return true;
}

function GetTimeOfNN(result: DateTimeResult, raw: DateTimeRawInfo): boolean {
  if ((result.flags & ParseFlags.HaveTime) !== 0) {
    // Multiple times in the input string
    result.SetBadDateTimeFailure();
    return false;
  }

  result.Hour = raw.GetNumber(0);
  result.Minute = raw.GetNumber(1);
  result.flags |= ParseFlags.HaveTime;
  return true;
}

function GetTimeOfNNN(result: DateTimeResult, raw: DateTimeRawInfo): boolean {
  if ((result.flags & ParseFlags.HaveTime) !== 0) {
    // Multiple times in the input string
    result.SetBadDateTimeFailure();
    return false;
  }
  result.Hour = raw.GetNumber(0);
  result.Minute = raw.GetNumber(1);
  result.Second = raw.GetNumber(2);
  result.flags |= ParseFlags.HaveTime;
  return true;
}

// Processing terminal state: A Date suffix followed by one number.
function GetDateOfDSN(result: DateTimeResult, raw: DateTimeRawInfo): boolean {
  if (raw.numCount !== 1 || result.Day !== -1) {
    result.SetBadDateTimeFailure();
    return false;
  }
  result.Day = raw.GetNumber(0);
  return true;
}

function GetDateOfNDS(result: DateTimeResult, raw: DateTimeRawInfo): boolean {
  if (result.Month === -1) {
    // Should have a month suffix
    result.SetBadDateTimeFailure();
    return false;
  }
  if (result.Year !== -1) {
    // Already has a year suffix
    result.SetBadDateTimeFailure();
    return false;
  }
  const year = TryAdjustYear(result, raw.GetNumber(0));
  result.Year = year ?? -1;
  if (year === null) {
    // the year value is out of range
    result.SetBadDateTimeFailure();
    return false;
  }
  result.Day = 1;
  return true;
}

function GetDateOfNNDS(result: DateTimeResult, raw: DateTimeRawInfo, dtfi: InvariantDateTimeFormatInfo): boolean {
  // For partial CJK Dates, the only valid formats are with a specified year, followed by two numbers, which
  // will be the Month and Day, and with a specified Month, when the numbers are either the year and day or
  // day and year, depending on the short date pattern.

  if ((result.flags & ParseFlags.HaveYear) !== 0) {
    if ((result.flags & ParseFlags.HaveMonth) === 0 && (result.flags & ParseFlags.HaveDay) === 0) {
      const y = TryAdjustYear(result, raw.year);
      result.Year = y ?? -1;
      if (y !== null && SetDateYMD(result, result.Year, raw.GetNumber(0), raw.GetNumber(1))) {
        return true;
      }
    }
  } else if ((result.flags & ParseFlags.HaveMonth) !== 0) {
    if ((result.flags & ParseFlags.HaveYear) === 0 && (result.flags & ParseFlags.HaveDay) === 0) {
      const order = GetYearMonthDayOrder(dtfi.ShortDatePattern);
      if (order === -1) {
        result.SetFailure(ParseFailureKind.Format_BadDatePattern);
        return false;
      }
      let year: number | null;
      if (order === ORDER_YMD) {
        if ((year = TryAdjustYear(result, raw.GetNumber(0))) !== null && SetDateYMD(result, year, result.Month, raw.GetNumber(1))) {
          return true;
        }
      } else {
        if ((year = TryAdjustYear(result, raw.GetNumber(1))) !== null && SetDateYMD(result, year, result.Month, raw.GetNumber(0))) {
          return true;
        }
      }
    }
  }
  result.SetBadDateTimeFailure();
  return false;
}

/** A date suffix is found, use this method to put the number into the result. */
function ProcessDateTimeSuffix(result: DateTimeResult, raw: DateTimeRawInfo, dtok: DateTimeToken): boolean {
  switch (dtok.suffix) {
    case TokenType.SEP_YearSuff:
      if ((result.flags & ParseFlags.HaveYear) !== 0) {
        return false;
      }
      result.flags |= ParseFlags.HaveYear;
      result.Year = raw.year = dtok.num;
      break;
    case TokenType.SEP_MonthSuff:
      if ((result.flags & ParseFlags.HaveMonth) !== 0) {
        return false;
      }
      result.flags |= ParseFlags.HaveMonth;
      result.Month = raw.month = dtok.num;
      break;
    case TokenType.SEP_DaySuff:
      if ((result.flags & ParseFlags.HaveDay) !== 0) {
        return false;
      }
      result.flags |= ParseFlags.HaveDay;
      result.Day = dtok.num;
      break;
    case TokenType.SEP_HourSuff:
      if ((result.flags & ParseFlags.HaveHour) !== 0) {
        return false;
      }
      result.flags |= ParseFlags.HaveHour;
      result.Hour = dtok.num;
      break;
    case TokenType.SEP_MinuteSuff:
      if ((result.flags & ParseFlags.HaveMinute) !== 0) {
        return false;
      }
      result.flags |= ParseFlags.HaveMinute;
      result.Minute = dtok.num;
      break;
    case TokenType.SEP_SecondSuff:
      if ((result.flags & ParseFlags.HaveSecond) !== 0) {
        return false;
      }
      result.flags |= ParseFlags.HaveSecond;
      result.Second = dtok.num;
      break;
  }
  return true;
}

function ProcessTerminalState(dps: DS, result: DateTimeResult, st: LexState, raw: DateTimeRawInfo, dtfi: InvariantDateTimeFormatInfo): boolean {
  let passed = true;
  switch (dps) {
    case DS.DX_NN:
      passed = GetDayOfNN(result, st, raw, dtfi);
      break;
    case DS.DX_NNN:
      passed = GetDayOfNNN(result, raw, dtfi);
      break;
    case DS.DX_MN:
      passed = GetDayOfMN(result, st, raw, dtfi);
      break;
    case DS.DX_NM:
      passed = GetDayOfNM(result, st, raw, dtfi);
      break;
    case DS.DX_MNN:
      passed = GetDayOfMNN(result, raw, dtfi);
      break;
    case DS.DX_DS:
      // The result has got the correct value. No need to process.
      passed = true;
      break;
    case DS.DX_YNN:
      passed = GetDayOfYNN(result, raw, dtfi);
      break;
    case DS.DX_NNY:
      passed = GetDayOfNNY(result, raw, dtfi);
      break;
    case DS.DX_YMN:
      passed = GetDayOfYMN(result, raw);
      break;
    case DS.DX_YN:
      passed = GetDayOfYN(result, raw);
      break;
    case DS.DX_YM:
      passed = GetDayOfYM(result, raw);
      break;
    case DS.TX_N:
      passed = GetTimeOfN(result, raw);
      break;
    case DS.TX_NN:
      passed = GetTimeOfNN(result, raw);
      break;
    case DS.TX_NNN:
      passed = GetTimeOfNNN(result, raw);
      break;
    case DS.TX_TS:
      // The result has got the correct value. Nothing to do.
      passed = true;
      break;
    case DS.DX_DSN:
      passed = GetDateOfDSN(result, raw);
      break;
    case DS.DX_NDS:
      passed = GetDateOfNDS(result, raw);
      break;
    case DS.DX_NNDS:
      passed = GetDateOfNNDS(result, raw, dtfi);
      break;
  }

  if (!passed) {
    return false;
  }

  if (dps > DS.ERROR) {
    // We have reached a terminal state. Reset the raw num count.
    raw.numCount = 0;
  }
  return true;
}

/** This is the real method to do the parsing work. */
function TryParse(s: string, dtfi: InvariantDateTimeFormatInfo, styles: DateTimeStyles, result: DateTimeResult): boolean {
  if (s.length === 0) {
    result.SetFailure(ParseFailureKind.Format_BadDateTime);
    return false;
  }

  let dps = DS.BEGIN; // Date Parsing State.
  let reachTerminalState = false;

  const dtok = new DateTimeToken(); // The buffer to store the parsing token.
  dtok.suffix = TokenType.SEP_Unk;
  const raw = new DateTimeRawInfo(); // The buffer to store temporary parsing information.
  raw.hasSameDateAndTimeSeparators = (dtfi.DateSeparator as string) === dtfi.TimeSeparator;

  result.era = CurrentEra;
  const st: LexState = { styles };

  // The string to be parsed. Use a __DTString wrapper so that we can trace the index which
  // indicates the beginning of next token.
  const str = new __DTString(s);

  str.GetNext();

  // The following loop will break out when we reach the end of the str.
  do {
    // Call the lexer to get the next token.
    if (!Lex(dps, str, dtok, raw, result, dtfi, st)) {
      return false;
    }

    // If the token is not unknown, process it. Otherwise, just discard it.
    if (dtok.dtt !== DTT.Unk) {
      // Check if we got any CJK Date/Time suffix.
      if (dtok.suffix !== TokenType.SEP_Unk) {
        if (!ProcessDateTimeSuffix(result, raw, dtok)) {
          result.SetBadDateTimeFailure();
          return false;
        }
        dtok.suffix = TokenType.SEP_Unk; // Reset suffix to SEP_Unk;
      }

      if (dtok.dtt === DTT.NumLocalTimeMark) {
        if (dps === DS.D_YNd || dps === DS.D_YN) {
          // Consider this as ISO 8601 format:
          // "yyyy-MM-dd'T'HH:mm:ss"                 1999-10-31T02:00:00
          return ParseISO8601(raw, str, st.styles, result);
        } else {
          result.SetBadDateTimeFailure();
          return false;
        }
      }

      if (raw.hasSameDateAndTimeSeparators) {
        if (dtok.dtt === DTT.YearEnd || dtok.dtt === DTT.YearSpace || dtok.dtt === DTT.YearDateSep) {
          if (dps === DS.T_Nt) {
            dps = DS.D_Nd;
          }
          if (dps === DS.T_NNt) {
            dps = DS.D_NNd;
          }
        }

        const atEnd = str.AtEnd();
        if (nextState(dps, dtok.dtt) === DS.ERROR || atEnd) {
          switch (dtok.dtt) {
            case DTT.YearDateSep:
              dtok.dtt = atEnd ? DTT.YearEnd : DTT.YearSpace;
              break;
            case DTT.NumDatesep:
              dtok.dtt = atEnd ? DTT.NumEnd : DTT.NumSpace;
              break;
            case DTT.NumTimesep:
              dtok.dtt = atEnd ? DTT.NumEnd : DTT.NumSpace;
              break;
            case DTT.MonthDatesep:
              dtok.dtt = atEnd ? DTT.MonthEnd : DTT.MonthSpace;
              break;
          }
        }
      }

      // Advance to the next state, and continue
      dps = nextState(dps, dtok.dtt);

      if (dps === DS.ERROR) {
        result.SetBadDateTimeFailure();
        return false;
      } else if (dps > DS.ERROR) {
        // (UseHebrewRule is never set for the invariant culture)
        if (!ProcessTerminalState(dps, result, st, raw, dtfi)) {
          return false;
        }
        reachTerminalState = true;

        // If we have reached a terminal state, start over from DS.BEGIN again.
        // For example, when we parsed "1999-12-23 13:30", we will reach a terminal state at "1999-12-23",
        // and we start over so we can continue to parse "12:30".
        dps = DS.BEGIN;
      }
    }
  } while (dtok.dtt !== DTT.End && dtok.dtt !== DTT.NumEnd && dtok.dtt !== DTT.MonthEnd);

  if (!reachTerminalState) {
    result.SetBadDateTimeFailure();
    return false;
  }

  AdjustTimeMark(dtfi, raw);
  const hour = AdjustHour(result.Hour, raw.timeMark);
  if (hour === null) {
    result.SetBadDateTimeFailure();
    return false;
  }
  result.Hour = hour;

  // Check if the parsed string only contains hour/minute/second values.
  const bTimeOnly = result.Year === -1 && result.Month === -1 && result.Day === -1;

  // Check if any year/month/day is missing in the parsing string.
  // If yes, get the default value from today's date.
  if (!CheckDefaultDateTime(result, st.styles)) {
    return false;
  }

  let time = calendarTryToDateTime(result.Year, result.Month, result.Day, result.Hour, result.Minute, result.Second, 0, result.era);
  if (time === null) {
    result.SetFailure(ParseFailureKind.Format_BadDateTimeCalendar);
    return false;
  }

  if (raw.fraction > 0) {
    time += BigInt(roundToEven(raw.fraction * 10_000_000));
    if (time > MaxTicks) {
      result.SetBadDateTimeFailure();
      return false;
    }
  }

  // We have to check day of week before we adjust to the time zone.
  // Otherwise, the value of day of week may change after adjusting to the time zone.
  if (raw.dayOfWeek !== -1) {
    // Check if day of week is correct.
    if (raw.dayOfWeek !== Number((time / TicksPerDay + 1n) % 7n)) {
      result.SetFailure(ParseFailureKind.Format_BadDayOfWeek);
      return false;
    }
  }

  result.parsedDate = new DateTime(time, DateTimeKind.Unspecified);

  if (!DetermineTimeZoneAdjustments(result, st.styles, bTimeOnly)) {
    return false;
  }
  return true;
}

/** Handles time zone adjustments and sets DateTimeKind values as required by the styles. */
function DetermineTimeZoneAdjustments(result: DateTimeResult, styles: DateTimeStyles, bTimeOnly: boolean): boolean {
  // (ParseFlags.CaptureOffset, the DateTimeOffset path, is never set here)
  const offsetTicks = result.timeZoneOffset;

  // the DateTime offset must be within +- 14:00 hours.
  if (offsetTicks < MinOffset || offsetTicks > MaxOffset) {
    result.SetFailure(ParseFailureKind.Format_OffsetOutOfRange);
    return false;
  }

  // The flags AssumeUniveral and AssumeLocal only apply when the input does not have a time zone
  if ((result.flags & ParseFlags.TimeZoneUsed) === 0) {
    if ((styles & DateTimeStyles.AssumeLocal) !== 0) {
      if ((styles & DateTimeStyles.AdjustToUniversal) !== 0) {
        result.flags |= ParseFlags.TimeZoneUsed;
        result.timeZoneOffset = getLocalUtcOffset(result.parsedDate!);
      } else {
        result.parsedDate = DateTime.specifyKind(result.parsedDate!, DateTimeKind.Local);
        return true;
      }
    } else if ((styles & DateTimeStyles.AssumeUniversal) !== 0) {
      if ((styles & DateTimeStyles.AdjustToUniversal) !== 0) {
        result.parsedDate = DateTime.specifyKind(result.parsedDate!, DateTimeKind.Utc);
        return true;
      } else {
        result.flags |= ParseFlags.TimeZoneUsed;
        result.timeZoneOffset = 0n;
      }
    } else {
      // No time zone and no Assume flags, so DateTimeKind.Unspecified is fine
      return true;
    }
  }

  if ((styles & DateTimeStyles.RoundtripKind) !== 0 && (result.flags & ParseFlags.TimeZoneUtc) !== 0) {
    result.parsedDate = DateTime.specifyKind(result.parsedDate!, DateTimeKind.Utc);
    return true;
  }

  if ((styles & DateTimeStyles.AdjustToUniversal) !== 0) {
    return AdjustTimeZoneToUniversal(result);
  }
  return AdjustTimeZoneToLocal(result, bTimeOnly);
}

/**
 * Adjust the specified time to universal time based on the supplied timezone.
 * E.g. when parsing "2001/06/08 14:00-07:00", the result will be "2001/06/08 21:00".
 */
function AdjustTimeZoneToUniversal(result: DateTimeResult): boolean {
  let resultTicks = result.parsedDate!.ticks;
  resultTicks -= result.timeZoneOffset;
  if (resultTicks < 0n) {
    resultTicks += TicksPerDay;
  }

  if (resultTicks < MinTicks || resultTicks > MaxTicks) {
    result.SetFailure(ParseFailureKind.Format_DateOutOfRange);
    return false;
  }
  result.parsedDate = new DateTime(resultTicks, DateTimeKind.Utc);
  return true;
}

/**
 * Adjust the specified time to universal time based on the supplied timezone, and then convert to
 * local time.
 */
function AdjustTimeZoneToLocal(result: DateTimeResult, bTimeOnly: boolean): boolean {
  const parsedDate = result.parsedDate!;
  let resultTicks = parsedDate.ticks;
  let localDt: DateTime | null = null;
  if (resultTicks < TicksPerDay) {
    // This is time of day.

    // Adjust timezone.
    resultTicks -= result.timeZoneOffset;
    // If the time is time of day, use the current timezone offset.
    resultTicks += getLocalUtcOffset(bTimeOnly ? DateTime.now : parsedDate);

    if (resultTicks < 0n) {
      resultTicks += TicksPerDay;
    }
  } else {
    // Adjust timezone to GMT.
    resultTicks -= result.timeZoneOffset;
    if (resultTicks < MinTicks || resultTicks > MaxTicks) {
      // If the result ticks is greater than DateTime.MaxValue, we can not create a DateTime from this ticks.
      // In this case, keep using the old code.
      resultTicks += getLocalUtcOffset(parsedDate);
    } else {
      // Convert the GMT time to local time.
      const r = getUtcOffsetFromUtc(resultTicks);
      resultTicks += r.offset;
      localDt = r.local;
    }
  }
  if (resultTicks < MinTicks || resultTicks > MaxTicks) {
    result.parsedDate = DateTime.minValue;
    result.SetFailure(ParseFailureKind.Format_DateOutOfRange);
    return false;
  }
  // new DateTime(resultTicks, DateTimeKind.Local, isAmbiguousLocalDst)
  result.parsedDate = localDt !== null && localDt.ticks === resultTicks ? localDt : new DateTime(resultTicks, DateTimeKind.Local);
  return true;
}

/** Parse the ISO8601 format string found during Parse(). */
function ParseISO8601(raw: DateTimeRawInfo, str: __DTString, styles: DateTimeStyles, result: DateTimeResult): boolean {
  str.Index--;
  let second = 0;
  let partSecond = 0;

  str.SkipWhiteSpaces();
  const hour = ParseDigits(str, 2);
  if (hour === null) {
    result.SetBadDateTimeFailure();
    return false;
  }
  str.SkipWhiteSpaces();
  if (!str.Match(TimeDelimiter)) {
    result.SetBadDateTimeFailure();
    return false;
  }
  str.SkipWhiteSpaces();
  const minute = ParseDigits(str, 2);
  if (minute === null) {
    result.SetBadDateTimeFailure();
    return false;
  }
  str.SkipWhiteSpaces();
  if (str.Match(TimeDelimiter)) {
    str.SkipWhiteSpaces();
    const sec = ParseDigits(str, 2);
    if (sec === null) {
      result.SetBadDateTimeFailure();
      return false;
    }
    second = sec;
    if (str.Match(TimeFractionDelimiterDot) || str.Match(TimeFractionDelimiterComma)) {
      const f = ParseFraction(str);
      partSecond = f.result;
      if (!f.ok) {
        result.SetBadDateTimeFailure();
        return false;
      }
      str.Index--;
    }
    str.SkipWhiteSpaces();
  }
  if (str.GetNext()) {
    const ch = str.GetChar();
    if (ch === '+' || ch === '-') {
      result.flags |= ParseFlags.TimeZoneUsed;
      const tz = ParseTimeZone(str);
      if (tz === null) {
        result.SetBadDateTimeFailure();
        return false;
      }
      result.timeZoneOffset = tz;
      str.Index--;
    } else if (ch === 'Z' || ch === 'z') {
      result.flags |= ParseFlags.TimeZoneUsed;
      result.timeZoneOffset = 0n;
      result.flags |= ParseFlags.TimeZoneUtc;
    } else {
      str.Index--;
    }
    str.SkipWhiteSpaces();
    if (str.Match('#')) {
      if (!VerifyValidPunctuation(str)) {
        result.SetBadDateTimeFailure();
        return false;
      }
      str.SkipWhiteSpaces();
    }
    if (str.Match('\0')) {
      if (!VerifyValidPunctuation(str)) {
        result.SetBadDateTimeFailure();
        return false;
      }
    }
    if (str.GetNext()) {
      // If this is true, there were non-white space characters remaining in the DateTime
      result.SetBadDateTimeFailure();
      return false;
    }
  }

  let time = calendarTryToDateTime(raw.year, raw.GetNumber(0), raw.GetNumber(1), hour, minute, second, 0, result.era);
  if (time === null) {
    result.SetFailure(ParseFailureKind.Format_BadDateTimeCalendar);
    return false;
  }

  time += BigInt(roundToEven(partSecond * 10_000_000));
  if (time > MaxTicks) {
    result.SetBadDateTimeFailure();
    return false;
  }

  result.parsedDate = new DateTime(time, DateTimeKind.Unspecified);
  return DetermineTimeZoneAdjustments(result, styles, false);
}

/** ParseDigits(ref str, digitLen, out result): the number or null. */
function ParseDigits(str: __DTString, digitLen: number): number | null {
  if (digitLen === 1) {
    // 1 really means 1 or 2 for this call
    return ParseDigitsRange(str, 1, 2);
  }
  return ParseDigitsRange(str, digitLen, digitLen);
}

function ParseDigitsRange(str: __DTString, minDigitLen: number, maxDigitLen: number): number | null {
  let localResult = 0;
  const startingIndex = str.Index;
  let tokenLength = 0;
  while (tokenLength < maxDigitLen) {
    if (!str.GetNextDigit()) {
      str.Index--;
      break;
    }
    localResult = localResult * 10 + str.GetDigit();
    tokenLength++;
  }
  if (tokenLength < minDigitLen) {
    str.Index = startingIndex;
    return null;
  }
  return localResult;
}

function GetDateTimeNow(_result: DateTimeResult, _st: LexState): DateTime {
  // (the CaptureOffset cases belong to DateTimeOffset parsing)
  // assume the offset is Local
  return DateTime.now;
}

function CheckDefaultDateTime(result: DateTimeResult, styles: DateTimeStyles): boolean {
  // (the CaptureOffset check belongs to DateTimeOffset parsing)
  if (result.Year === -1 || result.Month === -1 || result.Day === -1) {
    //  Year    Month   Day =>  ResultYear  ResultMonth     ResultDay
    //  X       X       --      Parsed Year Parsed month    First day
    //  X       --      X       Parsed year First month     Parsed day
    //  X       --      --      Parsed year First month     First day
    //  --      X       X       CurrentYear Parsed month    Parsed day
    //  --      X       --      CurrentYear Parsed month    First day
    //  --      --      X       CurrentYear First month     Parsed day
    //  --      --      --      CurrentYear Current month   Current day
    const now = GetDateTimeNow(result, { styles });
    if (result.Month === -1 && result.Day === -1) {
      if (result.Year === -1) {
        if ((styles & DateTimeStyles.NoCurrentDateDefault) !== 0) {
          // If there is no year/month/day values, and NoCurrentDateDefault flag is used,
          // set the year/month/day value to the beginning year/month/day of DateTime().
          result.Year = result.Month = result.Day = 1;
        } else {
          // Year/Month/Day are all missing.
          result.Year = now.year;
          result.Month = now.month;
          result.Day = now.day;
        }
      } else {
        // Month/Day are both missing.
        result.Month = 1;
        result.Day = 1;
      }
    } else {
      if (result.Year === -1) {
        result.Year = now.year;
      }
      if (result.Month === -1) {
        result.Month = 1;
      }
      if (result.Day === -1) {
        result.Day = 1;
      }
    }
  }
  // Set Hour/Minute/Second to zero if these value are not in str.
  if (result.Hour === -1) result.Hour = 0;
  if (result.Minute === -1) result.Minute = 0;
  if (result.Second === -1) result.Second = 0;
  if (result.era === -1) result.era = CurrentEra;
  return true;
}

// ---------------------------------------------------------------------------------------------
// Entry points (DateTime.Parse / TryParse and DateTimeFormatInfo.ValidateStyles)

const InvalidDateTimeStyles = ~(
  DateTimeStyles.AllowLeadingWhite |
  DateTimeStyles.AllowTrailingWhite |
  DateTimeStyles.AllowInnerWhite |
  DateTimeStyles.NoCurrentDateDefault |
  DateTimeStyles.AdjustToUniversal |
  DateTimeStyles.AssumeLocal |
  DateTimeStyles.AssumeUniversal |
  DateTimeStyles.RoundtripKind
);

/** DateTimeFormatInfo.ValidateStyles(style, styles: true) */
function ValidateStyles(style: DateTimeStyles): void {
  const localUniversal = DateTimeStyles.AssumeLocal | DateTimeStyles.AssumeUniversal;
  if (
    (style & InvalidDateTimeStyles) !== 0 ||
    (style & localUniversal) === localUniversal ||
    (style & (DateTimeStyles.RoundtripKind | localUniversal | DateTimeStyles.AdjustToUniversal)) > DateTimeStyles.RoundtripKind
  ) {
    const message =
      (style & InvalidDateTimeStyles) !== 0
        ? 'An undefined DateTimeStyles value is being used.'
        : (style & localUniversal) === localUniversal
          ? 'The DateTimeStyles values AssumeLocal and AssumeUniversal cannot be used together.'
          : 'The DateTimeStyles value RoundtripKind cannot be used with the values AssumeLocal, AssumeUniversal or AdjustToUniversal.';
    throw new ArgumentException(message, 'styles');
  }
}

/**
 * DateTime.TryParse(s, CultureInfo.InvariantCulture, styles) (with styles None this is also
 * DateTime.TryParse(s) under the invariant current culture). Null when parsing fails;
 * ArgumentException for invalid styles.
 */
export function dateTimeTryParse(s: string | null, styles: DateTimeStyles): DateTime | null {
  ValidateStyles(styles);
  if (s === null) {
    return null;
  }
  const result = new DateTimeResult();
  if (TryParse(s, invariantInfo(), styles, result)) {
    return result.parsedDate;
  }
  return null;
}

/**
 * DateTime.TryParse(s, CultureInfo.CreateSpecificCulture("de-DE"), styles) (the fallback culture
 * of AttributeTypeType.GetDateTime). Null when parsing fails.
 */
export function dateTimeTryParseGerman(s: string | null, styles: DateTimeStyles = DateTimeStyles.None): DateTime | null {
  ValidateStyles(styles);
  if (s === null) {
    return null;
  }
  const result = new DateTimeResult();
  if (TryParse(s, germanInfo(), styles, result)) {
    return result.parsedDate;
  }
  return null;
}

/** DateTime.Parse(s, CultureInfo.InvariantCulture, styles): FormatException on failure. */
export function dateTimeParse(s: string | null, styles: DateTimeStyles): DateTime {
  ValidateStyles(styles);
  if (s === null) {
    throw new ArgumentNullException('s');
  }
  const result = new DateTimeResult();
  if (TryParse(s, invariantInfo(), styles, result)) {
    return result.parsedDate!;
  }
  throw GetDateTimeParseException(result, s);
}

function GetDateTimeParseException(result: DateTimeResult, s: string): Error {
  switch (result.failure) {
    case ParseFailureKind.ArgumentNull_String:
      return new ArgumentNullException('s');
    case ParseFailureKind.Format_BadDateTimeCalendar:
      return new FormatException(`The DateTime represented by the string is not supported in calendar 'System.Globalization.GregorianCalendar'.`);
    case ParseFailureKind.Format_BadDayOfWeek:
      return new FormatException('String was not recognized as a valid DateTime because the day of week was incorrect.');
    case ParseFailureKind.Format_DateOutOfRange:
      return new FormatException('The UTC representation of the date falls outside the year range 1-9999.');
    case ParseFailureKind.Format_OffsetOutOfRange:
      return new FormatException('The time zone offset must be within plus or minus 14 hours.');
    case ParseFailureKind.Format_UnknownDateTimeWord:
      return new FormatException(`The string '${s}' was not recognized as a valid DateTime. There is an unknown word starting at index '${result.failureArgument}'.`);
    default:
      return new FormatException(`String '${s}' was not recognized as a valid DateTime.`);
  }
}
