// Evaluators for the "dtparse" cases (scripts/sys-cases/dtparse.mjs); see test/system/sys.oracle.test.ts.
import { DateTime } from '../../../src/system/DateTime.js';
import { dateTimeTryParse, type DateTimeStyles } from '../../../src/system/DateTimeParse.js';
import { type Args, HISTORIC_LOCAL_YEAR, dt, orFail } from '../repr.js';

export const evaluators: Record<string, (args: Args) => string> = {
  /** DateTime.TryParse(s) under the invariant current culture */
  'dt.parse': (a) => orFail(DateTime.tryParse(a[0] as string), dt),
  /** DateTime.TryParse(s, CultureInfo.InvariantCulture, styles) */
  'dt.parseStyles': (a) => orFail(dateTimeTryParse(a[0] as string, a[1] as DateTimeStyles), dt),
  /** DateTime.Parse(s) */
  'dt.Parse': (a) => dt(DateTime.parse(a[0] as string)),
};

// .NET on Windows applies the current Europe/Berlin rules (UTC+1, DST last Sunday of March to last
// Sunday of October) to every year; the IANA data used by JS has the real history (local mean time
// +0:53:28 before 1893, which JS Date reports as +0:53, no DST in 1950, DST ending in September until 1995). Parsed values with a
// zone (or AssumeUniversal / AdjustToUniversal) in such years convert with a different offset.
const tzHistory = 'time zone history: Windows rules vs IANA data for old dates (see DateTime.ts)';
const tzCases: [string, unknown[]][] = [
  ['dt.parse', ['0001-01-01T00:00:00Z']],
  ['dt.parse', ['0001-01-01T00:00:00+01:00']],
  ['dt.parse', ['0001-01-01T00:00:00-01:00']],
  ['dt.parse', ['0001-01-01T00:30:00+01:00']],
  ['dt.parse', ['0001-01-01 00:00:00Z']],
  ['dt.parse', ['1/1/0001 00:30 +01:00']],
  ['dt.parse', ['1985-10-10T11:45:38Z']],
  ['dt.parse', ['1950-07-01T12:00:00Z']],
  ['dt.parse', ['1890-01-01T00:00:00Z']],
  ['dt.parseStyles', ['0001-01-01T00:00:00', 64]],
  ['dt.parseStyles', ['0001-01-01T00:00:00', 48]],
  ['dt.parseStyles', ['1/1/0001 0:30', 64]],
  ['dt.parseStyles', ['1/1/0001 0:30', 48]],
  ['dt.parseStyles', ['0001-01-02 00:30', 64]],
  ['dt.parseStyles', ['0001-01-02 00:30', 48]],
  ['dt.parseStyles', ['0001-01-01T00:30:00+01:00', 0]],
  ['dt.parseStyles', ['0001-01-01T00:30:00+01:00', 64]],
  ['dt.parseStyles', ['0001-01-01T00:00:00Z', 0]],
  ['dt.parseStyles', ['0001-01-01T00:00:00Z', 64]],
  ['dt.parseStyles', ['1/1/0001 0:30 +01:00', 0]],
  ['dt.parseStyles', ['1/1/0001 0:30 +01:00', 64]],
  ['dt.parseStyles', ['1/1/0001 0:30 -01:00', 0]],
  ['dt.parseStyles', ['1/1/0001 0:30 -01:00', 64]],
];

// A rule, not a fixed list: these cases may differ only in years in which the rules differ for the
// zone the tests run in (none in UTC, scripts/tz-check.mjs).
const tzKeys = new Set(tzCases.map(([fn, args]) => `${fn} ${JSON.stringify(args)}`));
export const deviationRules = [
  {
    reason: tzHistory,
    test: (fn: string, a: Args): boolean => tzKeys.has(`${fn} ${JSON.stringify(a)}`) && Number(/\d{4}/.exec(a[0] as string)![0]) < HISTORIC_LOCAL_YEAR,
  },
];
export const deviations: Record<string, string> = {};
