// Value representations shared with oracle/SysOracle.cs (see the header there).
import { DateTime, DateTimeKind } from '../../src/system/DateTime.js';
import type { Decimal } from '../../src/system/Decimal.js';
import { formatDouble, formatSingle } from '../../src/system/Number.js';

export type Args = unknown[];

const kindNames = ['Unspecified', 'Utc', 'Local'];

/** "ticks|Kind"; today: "T+ticksOfDay|Kind"; this year: "Y+ticksSinceJan1|Kind". */
export function dt(d: DateTime): string {
  const today = DateTime.today;
  const kind = kindNames[d.kind];
  if (d.date.equals(today)) return `T+${d.ticks - today.ticks}|${kind}`;
  if (d.year === today.year) return `Y+${d.ticks - new DateTime(today.year, 1, 1).ticks}|${kind}`;
  return `${d.ticks}|${kind}`;
}

export function dtArg(a: Args, i: number): DateTime {
  return new DateTime(BigInt(a[i] as string), a[i + 1] as DateTimeKind);
}

const buf = new DataView(new ArrayBuffer(8));

export function dblArg(hex: string): number {
  buf.setBigUint64(0, BigInt('0x' + hex));
  return buf.getFloat64(0);
}

export function sglArg(hex: string): number {
  buf.setUint32(0, Number(BigInt('0x' + hex)));
  return buf.getFloat32(0);
}

export function dblBits(v: number): string {
  buf.setFloat64(0, v);
  return buf.getBigUint64(0).toString(16).padStart(16, '0');
}

export function sglBits(v: number): string {
  buf.setFloat32(0, v);
  return buf.getUint32(0).toString(16).padStart(8, '0');
}

/** double: "R|bits" */
export function dbl(v: number): string {
  return `${formatDouble(v, 'R')}|${dblBits(v)}`;
}

/** float (a number holding a float32 value): "R|bits" */
export function sgl(v: number): string {
  return `${formatSingle(v, 'R')}|${sglBits(v)}`;
}

/** decimal: "ToString()|scale|signBit" */
export function dec(d: Decimal): string {
  return `${d.toString()}|${d.scale}|${d.isNegative ? 1 : 0}`;
}

export const FAIL = '#fail';

export function orFail<T>(v: T | null, f: (v: T) => string): string {
  return v === null ? FAIL : f(v);
}

export function bool(v: boolean): string {
  return v ? 'True' : 'False';
}

/** The time zone the tests run in: TZ, or the zone of the machine (Europe/Berlin for the reference outputs). */
export const TEST_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/**
 * The year from which the local time rules of .NET on Windows (registry) and the IANA history that
 * JS uses agree, per zone the oracle ran in (scripts/tz-check.mjs, docs/deviations.md). Before it
 * local times may differ.
 */
const RULES_AGREE_FROM: Record<string, number> = {
  'Europe/Berlin': 1996,
  UTC: 1,
  'Etc/UTC': 1,
  'America/New_York': 1987,
  'Asia/Kolkata': 1946,
};
export const HISTORIC_LOCAL_YEAR = RULES_AGREE_FROM[TEST_ZONE] ?? 1996;
export const HISTORIC_LOCAL_LIMIT = new DateTime(HISTORIC_LOCAL_YEAR, 1, 1).ticks;
export const HISTORIC_LOCAL_REASON = `local time before ${HISTORIC_LOCAL_YEAR} in ${TEST_ZONE}: JS uses the IANA zone history, .NET on Windows the rules of the registry`;
