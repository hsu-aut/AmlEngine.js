// System.Globalization.TimeSpanParse.TryParseTimeSpan for the invariant culture
// (TimeSpan.Parse / TryParse without a format; TimeSpanStandardStyles.Any).
// Invariant literals: [-][d.]hh:mm[:ss[.fffffff]]; localized (invariant culture) literals:
// [-]d:h:mm:ss.FFFFFFF, so "1:02:03:04" is 1 day 2 hours 3 minutes 4 seconds.

import { trimWhiteSpace } from './Char.js';

const MAX_FRACTION_DIGITS = 7;
const MAX_DAYS = 10675199;
const MAX_HOURS = 23;
const MAX_MINUTES = 59;
const MAX_SECONDS = 59;
const MAX_FRACTION = 9999999;
const LONG_MAX = (1n << 63n) - 1n;

enum TTT {
  None = 0,
  End = 1,
  Num = 2,
  Sep = 3,
  NumOverflow = 4,
}

interface Token {
  ttt: TTT;
  num: number;
  zeroes: number;
  sep: string;
}

const token = (ttt: TTT, num = 0, zeroes = 0, sep = ''): Token => ({ ttt, num, zeroes, sep });

/** TimeSpanToken.NormalizeAndValidateFraction on a copy; null when invalid. */
function normalizeFraction(t: Token): number | null {
  let num = t.num;
  if (num === 0) return 0;
  if (t.zeroes === 0 && num > MAX_FRACTION) return null;
  const totalDigits = Math.floor(Math.log10(num)) + 1 + t.zeroes;
  if (totalDigits === MAX_FRACTION_DIGITS) return num;
  if (totalDigits < MAX_FRACTION_DIGITS) return num * 10 ** (MAX_FRACTION_DIGITS - totalDigits);
  // Math.Round(x, MidpointRounding.AwayFromZero) for x >= 0
  const x = num / 10 ** (totalDigits - MAX_FRACTION_DIGITS);
  num = Math.floor(x);
  if (x - num >= 0.5) num++;
  return num;
}

class Tokenizer {
  private pos = 0;
  constructor(private readonly value: string) {}

  nextToken(): Token {
    const value = this.value;
    const startPos = this.pos;
    let pos = startPos;
    if (pos >= value.length) return token(TTT.End);
    let num = value.charCodeAt(pos) - 48;
    if (num >= 0 && num <= 9) {
      let zeroes = 0;
      if (num === 0) {
        zeroes = 1;
        for (;;) {
          let digit = -1;
          if (++pos >= value.length || (digit = value.charCodeAt(pos) - 48) < 0 || digit > 9) {
            this.pos = pos;
            return token(TTT.Num, 0, zeroes);
          }
          if (digit === 0) {
            zeroes++;
            continue;
          }
          num = digit;
          break;
        }
        this.pos = pos;
      }
      while (++pos < value.length) {
        const digit = value.charCodeAt(pos) - 48;
        if (digit < 0 || digit > 9) break;
        num = num * 10 + digit;
        if (num > 0x0fffffff) {
          this.pos = pos;
          return token(TTT.NumOverflow);
        }
      }
      this.pos = pos;
      return token(TTT.Num, num, zeroes);
    }
    let length = 1;
    while (++pos < value.length && !(value.charCodeAt(pos) >= 48 && value.charCodeAt(pos) <= 57)) length++;
    this.pos = pos;
    return token(TTT.Sep, 0, 0, value.slice(startPos, startPos + length));
  }
}

interface Literals {
  start: string;
  dayHourSep: string;
  hourMinuteSep: string;
  minuteSecondSep: string;
  secondFractionSep: string;
  end: string;
  appCompatLiteral: string;
}

function lits(start: string, dayHourSep: string): Literals {
  return { start, dayHourSep, hourMinuteSep: ':', minuteSecondSep: ':', secondFractionSep: '.', end: '', appCompatLiteral: ':.' };
}

// TimeSpanFormat.Positive/NegativeInvariantFormatLiterals, then the localized literals of
// DateTimeFormatInfo.InvariantInfo.FullTimeSpanPositivePattern ("d':'h':'mm':'ss'.'FFFFFFF").
const PATTERNS: [Literals, boolean][] = [
  [lits('', '.'), true],
  [lits('-', '.'), false],
  [lits('', ':'), true],
  [lits('-', ':'), false],
];

class RawInfo {
  lastSeenTTT = TTT.None;
  tokenCount = 0;
  sepCount = 0;
  numCount = 0;
  numbers: Token[] = [];
  literals: string[] = [];

  processToken(tok: Token): boolean {
    switch (tok.ttt) {
      case TTT.Num:
        if ((this.tokenCount === 0 && !this.addSep('')) || !this.addNum(tok)) return false;
        break;
      case TTT.Sep:
        if (!this.addSep(tok.sep)) return false;
        break;
      default:
        return false;
    }
    this.lastSeenTTT = tok.ttt;
    return true;
  }

  private addSep(sep: string): boolean {
    if (this.sepCount >= 6 || this.tokenCount >= 11) return false;
    this.literals[this.sepCount++] = sep;
    this.tokenCount++;
    return true;
  }

  private addNum(num: Token): boolean {
    if (this.numCount >= 5 || this.tokenCount >= 11) return false;
    this.numbers[this.numCount++] = num;
    this.tokenCount++;
    return true;
  }

  /** literals must equal the given sequence and the counts must fit */
  is(seps: number, nums: number, ...expected: string[]): boolean {
    if (this.sepCount !== seps || this.numCount !== nums) return false;
    for (let i = 0; i < expected.length; i++) if ((this.literals[i] ?? '') !== expected[i]) return false;
    return true;
  }
}

type Result = { ok: true; ticks: bigint } | { ok: false; overflow: boolean };
const bad: Result = { ok: false, overflow: false };
const overflowed: Result = { ok: false, overflow: true };

const ZERO = token(TTT.Num, 0);

function tryTimeToTicks(positive: boolean, days: Token, hours: Token, minutes: Token, seconds: Token, fraction: Token): bigint | null {
  if (days.num > MAX_DAYS || hours.num > MAX_HOURS || minutes.num > MAX_MINUTES || seconds.num > MAX_SECONDS) return null;
  const f = normalizeFraction(fraction);
  if (f === null) return null;
  const ms = (BigInt(days.num) * 86400n + BigInt(hours.num) * 3600n + BigInt(minutes.num) * 60n + BigInt(seconds.num)) * 1000n;
  if (ms > LONG_MAX / 10000n) return null;
  const result = ms * 10000n + BigInt(f);
  // C# adds unchecked: 2^63 wraps to long.MinValue, which a negative input keeps (TimeSpan.MinValue)
  if (result > LONG_MAX && (positive || result !== LONG_MAX + 1n)) return null;
  return result;
}

type Variant = [(r: RawInfo, p: Literals) => boolean, (n: Token[]) => [Token, Token, Token, Token, Token]];

/**
 * ProcessTerminal_*: try each literal pattern (invariant positive/negative, then localized) with
 * each variant. `firstMatchDecides`: the D, HM and DHMSF states stop at the first literal match.
 */
function tryPatterns(raw: RawInfo, variants: Variant[], firstMatchDecides: boolean): Result {
  let overflow = false;
  for (const [lit, positive] of PATTERNS) {
    for (const [match, args] of variants) {
      if (!match(raw, lit)) continue;
      const t = tryTimeToTicks(positive, ...args(raw.numbers));
      if (t !== null) return { ok: true, ticks: positive ? t : -t };
      if (firstMatchDecides) return overflowed;
      overflow = true;
    }
  }
  return overflow ? overflowed : bad;
}

function processTerminalState(raw: RawInfo): Result {
  if (raw.lastSeenTTT === TTT.Num) {
    if (!raw.processToken(token(TTT.Sep))) return bad;
  }
  switch (raw.numCount) {
    case 1:
      if (raw.sepCount !== 2) return bad;
      return tryPatterns(raw, [[(r, p) => r.is(2, 1, p.start, p.end), (n) => [n[0], ZERO, ZERO, ZERO, ZERO]]], true);
    case 2:
      if (raw.sepCount !== 3) return bad;
      return tryPatterns(raw, [[(r, p) => r.is(3, 2, p.start, p.hourMinuteSep, p.end), (n) => [ZERO, n[0], n[1], ZERO, ZERO]]], true);
    case 3:
      if (raw.sepCount !== 4) return bad;
      return tryPatterns(
        raw,
        [
          [(r, p) => r.is(4, 3, p.start, p.hourMinuteSep, p.minuteSecondSep, p.end), (n) => [ZERO, n[0], n[1], n[2], ZERO]],
          [(r, p) => r.is(4, 3, p.start, p.dayHourSep, p.hourMinuteSep, p.end), (n) => [n[0], n[1], n[2], ZERO, ZERO]],
          [(r, p) => r.is(4, 3, p.start, p.hourMinuteSep, p.appCompatLiteral, p.end), (n) => [ZERO, n[0], n[1], ZERO, n[2]]],
        ],
        false,
      );
    case 4:
      if (raw.sepCount !== 5) return bad;
      return tryPatterns(
        raw,
        [
          [(r, p) => r.is(5, 4, p.start, p.hourMinuteSep, p.minuteSecondSep, p.secondFractionSep, p.end), (n) => [ZERO, n[0], n[1], n[2], n[3]]],
          [(r, p) => r.is(5, 4, p.start, p.dayHourSep, p.hourMinuteSep, p.minuteSecondSep, p.end), (n) => [n[0], n[1], n[2], n[3], ZERO]],
          [(r, p) => r.is(5, 4, p.start, p.dayHourSep, p.hourMinuteSep, p.appCompatLiteral, p.end), (n) => [n[0], n[1], n[2], ZERO, n[3]]],
        ],
        false,
      );
    case 5:
      if (raw.sepCount !== 6) return bad;
      return tryPatterns(
        raw,
        [[(r, p) => r.is(6, 5, p.start, p.dayHourSep, p.hourMinuteSep, p.minuteSecondSep, p.secondFractionSep, p.end), (n) => [n[0], n[1], n[2], n[3], n[4]]]],
        true,
      );
    default:
      return bad;
  }
}

/**
 * TimeSpan.TryParse / Parse (invariant culture). `overflow` tells Parse to throw
 * OverflowException instead of FormatException.
 */
export function tryParseTimeSpan(input: string): Result {
  input = trimWhiteSpace(input);
  if (input.length === 0) return bad;
  const tokenizer = new Tokenizer(input);
  const raw = new RawInfo();
  let tok = tokenizer.nextToken();
  while (tok.ttt !== TTT.End) {
    if (tok.ttt === TTT.NumOverflow) return overflowed;
    if (!raw.processToken(tok)) return bad;
    tok = tokenizer.nextToken();
  }
  return processTerminalState(raw);
}
