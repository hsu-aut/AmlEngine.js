// System.TimeSpan: a signed interval of 100 ns ticks (64 bit, held as bigint).
// Formatting and parsing follow the invariant culture ("c", "g", "G", TimeSpan.TryParse); the
// parser is a port of System.Globalization.TimeSpanParse for the invariant culture only.

import { ArgumentException, ArgumentNullException, ArgumentOutOfRangeException, FormatException, OverflowException } from './exceptions.js';
import { formatTimeSpan } from './TimeSpanFormat.js';
import { tryParseTimeSpan } from './TimeSpanParse.js';

const LONG_MIN = -(1n << 63n);
const LONG_MAX = (1n << 63n) - 1n;

export class TimeSpan {
  static readonly TicksPerMillisecond = 10_000n;
  static readonly TicksPerSecond = 10_000_000n;
  static readonly TicksPerMinute = 600_000_000n;
  static readonly TicksPerHour = 36_000_000_000n;
  static readonly TicksPerDay = 864_000_000_000n;

  static readonly zero = new TimeSpan(0n);
  static readonly maxValue = new TimeSpan(LONG_MAX);
  static readonly minValue = new TimeSpan(LONG_MIN);

  readonly ticks: bigint;

  /**
   * new TimeSpan(ticks: bigint), new TimeSpan(hours, minutes, seconds),
   * new TimeSpan(days, hours, minutes, seconds[, milliseconds]).
   */
  constructor(ticks: bigint);
  constructor(hours: number, minutes: number, seconds: number);
  constructor(days: number, hours: number, minutes: number, seconds: number, milliseconds?: number);
  constructor(a: bigint | number, b?: number, c?: number, d?: number, e?: number) {
    if (typeof a === 'bigint') {
      if (a < LONG_MIN || a > LONG_MAX) throw new OverflowException();
      this.ticks = a;
      return;
    }
    let total: bigint;
    if (d === undefined) {
      // TimeToTicks(hour, minute, second)
      total = (BigInt(a) * 3600n + BigInt(b!) * 60n + BigInt(c!)) * TimeSpan.TicksPerSecond;
    } else {
      const ms = BigInt(a) * 86_400_000n + BigInt(b!) * 3_600_000n + BigInt(c!) * 60_000n + BigInt(d) * 1000n + BigInt(e ?? 0);
      total = ms * TimeSpan.TicksPerMillisecond;
    }
    if (total < LONG_MIN || total > LONG_MAX) {
      throw new ArgumentOutOfRangeException(null, 'TimeSpan overflowed because the duration is too long.');
    }
    this.ticks = total;
  }

  static fromTicks(ticks: bigint): TimeSpan {
    return new TimeSpan(ticks);
  }

  // .NET 8 TimeSpan.Interval(double value, double scale)
  private static interval(value: number, scale: number): TimeSpan {
    if (Number.isNaN(value)) throw new ArgumentException('TimeSpan does not accept floating point Not-a-Number values.');
    const ticks = value * scale;
    return TimeSpan.intervalFromDoubleTicks(ticks);
  }

  private static intervalFromDoubleTicks(ticks: number): TimeSpan {
    if (ticks > 9223372036854775807 || ticks < -9223372036854775808 || Number.isNaN(ticks)) {
      throw new OverflowException('TimeSpan overflowed because the duration is too long.');
    }
    if (ticks === 9223372036854775807) return TimeSpan.maxValue;
    return new TimeSpan(BigInt(Math.trunc(ticks)));
  }

  static fromDays(value: number): TimeSpan {
    return TimeSpan.interval(value, 864_000_000_000);
  }
  static fromHours(value: number): TimeSpan {
    return TimeSpan.interval(value, 36_000_000_000);
  }
  static fromMinutes(value: number): TimeSpan {
    return TimeSpan.interval(value, 600_000_000);
  }
  static fromSeconds(value: number): TimeSpan {
    return TimeSpan.interval(value, 10_000_000);
  }
  static fromMilliseconds(value: number): TimeSpan {
    return TimeSpan.interval(value, 10_000);
  }

  get days(): number {
    return Number(this.ticks / TimeSpan.TicksPerDay);
  }
  get hours(): number {
    return Number((this.ticks / TimeSpan.TicksPerHour) % 24n);
  }
  get minutes(): number {
    return Number((this.ticks / TimeSpan.TicksPerMinute) % 60n);
  }
  get seconds(): number {
    return Number((this.ticks / TimeSpan.TicksPerSecond) % 60n);
  }
  get milliseconds(): number {
    return Number((this.ticks / TimeSpan.TicksPerMillisecond) % 1000n);
  }
  get totalDays(): number {
    return Number(this.ticks) / 864_000_000_000;
  }
  get totalHours(): number {
    return Number(this.ticks) / 36_000_000_000;
  }
  get totalMinutes(): number {
    return Number(this.ticks) / 600_000_000;
  }
  get totalSeconds(): number {
    return Number(this.ticks) / 10_000_000;
  }
  /** .NET 8 clamps TotalMilliseconds to +-922337203685477 (long.MaxValue / TicksPerMillisecond). */
  get totalMilliseconds(): number {
    const temp = Number(this.ticks) / 10_000;
    if (temp > 922337203685477) return 922337203685477;
    if (temp < -922337203685477) return -922337203685477;
    return temp;
  }

  add(ts: TimeSpan): TimeSpan {
    const result = this.ticks + ts.ticks;
    if (result < LONG_MIN || result > LONG_MAX) throw new OverflowException('TimeSpan overflowed because the duration is too long.');
    return new TimeSpan(result);
  }

  subtract(ts: TimeSpan): TimeSpan {
    const result = this.ticks - ts.ticks;
    if (result < LONG_MIN || result > LONG_MAX) throw new OverflowException('TimeSpan overflowed because the duration is too long.');
    return new TimeSpan(result);
  }

  negate(): TimeSpan {
    if (this.ticks === LONG_MIN) throw new OverflowException('Negating the minimum value of a twos complement number is invalid.');
    return new TimeSpan(-this.ticks);
  }

  duration(): TimeSpan {
    if (this.ticks === LONG_MIN) throw new OverflowException('The duration cannot be returned for TimeSpan.MinValue because the absolute value of TimeSpan.MinValue exceeds the value of TimeSpan.MaxValue.');
    return new TimeSpan(this.ticks >= 0n ? this.ticks : -this.ticks);
  }

  static compare(t1: TimeSpan, t2: TimeSpan): number {
    return t1.ticks < t2.ticks ? -1 : t1.ticks > t2.ticks ? 1 : 0;
  }

  compareTo(other: TimeSpan): number {
    return TimeSpan.compare(this, other);
  }

  equals(other: unknown): boolean {
    return other instanceof TimeSpan && other.ticks === this.ticks;
  }

  /** ToString() is the constant ("c") format; also "c", "t", "T", "g", "G" and custom formats. */
  toString(format?: string | null): string {
    return formatTimeSpan(this, format ?? null);
  }

  /** XmlConvert.ToString(TimeSpan): xs:duration. */
  toXmlString(): string {
    return durationToString(this);
  }

  /** TimeSpan.TryParse(string) under the invariant culture; null when it returns false. */
  static tryParse(s: string | null): TimeSpan | null {
    if (s === null) return null;
    const r = tryParseTimeSpan(s);
    return r.ok ? new TimeSpan(r.ticks) : null;
  }

  /** TimeSpan.Parse(string) under the invariant culture. */
  static parse(s: string | null): TimeSpan {
    if (s === null) throw new ArgumentNullException('input');
    const r = tryParseTimeSpan(s);
    if (r.ok) return new TimeSpan(r.ticks);
    if (r.overflow) throw new OverflowException('The TimeSpan string \'' + s + '\' could not be parsed because at least one of the numeric components is out of range or contains too many digits.');
    throw new FormatException('String \'' + s + '\' was not recognized as a valid TimeSpan.');
  }
}

/** XsdDuration(TimeSpan).ToString(DurationType.Duration) as used by XmlConvert.ToString(TimeSpan). */
export function durationToString(ts: TimeSpan): string {
  const ticks = ts.ticks;
  const neg = ticks < 0n;
  let pos = neg ? -ticks : ticks;
  let nanoseconds = Number(pos % 10_000_000n) * 100;
  pos /= 10_000_000n;
  const seconds = Number(pos % 60n);
  pos /= 60n;
  const minutes = Number(pos % 60n);
  pos /= 60n;
  const hours = Number(pos % 24n);
  pos /= 24n;
  // (int) cast of the remaining days: TimeSpan.MaxValue has 10675199 days, fits.
  const days = Number(pos);
  let s = neg ? '-P' : 'P';
  if (days !== 0) s += days + 'D';
  if (hours !== 0 || minutes !== 0 || seconds !== 0 || nanoseconds !== 0) {
    s += 'T';
    if (hours !== 0) s += hours + 'H';
    if (minutes !== 0) s += minutes + 'M';
    if (seconds !== 0 || nanoseconds !== 0) {
      s += seconds;
      if (nanoseconds !== 0) {
        let frac = nanoseconds.toString().padStart(9, '0');
        frac = frac.replace(/0+$/, '');
        s += '.' + frac;
      }
      s += 'S';
    }
  }
  if (s.endsWith('P')) s += 'T0S';
  return s;
}
