// Evaluators for the "datetime" cases (scripts/sys-cases/datetime.mjs); see test/system/sys.oracle.test.ts.
import { DateTime, formatXsdDateTime } from '../../../src/system/DateTime.js';
import { TimeSpan } from '../../../src/system/TimeSpan.js';
import { type Args, HISTORIC_LOCAL_LIMIT, HISTORIC_LOCAL_REASON, bool, dblArg, dt, dtArg } from '../repr.js';

const n = (a: Args, i: number) => a[i] as number;

export const evaluators: Record<string, (args: Args) => string> = {
  'dt.new': (a) => {
    switch (a.length) {
      case 3:
        return dt(new DateTime(n(a, 0), n(a, 1), n(a, 2)));
      case 6:
        return dt(new DateTime(n(a, 0), n(a, 1), n(a, 2), n(a, 3), n(a, 4), n(a, 5)));
      case 7:
        // (y, M, d, h, m, s, DateTimeKind)
        return dt(new DateTime(n(a, 0), n(a, 1), n(a, 2), n(a, 3), n(a, 4), n(a, 5), 0, n(a, 6)));
      default:
        return dt(new DateTime(n(a, 0), n(a, 1), n(a, 2), n(a, 3), n(a, 4), n(a, 5), n(a, 6), n(a, 7)));
    }
  },
  'dt.ticks': (a) => dt(dtArg(a, 0)),
  'dt.props': (a) => {
    const d = dtArg(a, 0);
    return [
      d.year,
      d.month,
      d.day,
      d.hour,
      d.minute,
      d.second,
      d.millisecond,
      d.dayOfWeek,
      d.dayOfYear,
      dt(d.date),
      d.timeOfDay.ticks,
      DateTime.daysInMonth(d.year, d.month),
      bool(DateTime.isLeapYear(d.year)),
    ].join('|');
  },
  'dt.fmt': (a) => dtArg(a, 0).toString(a[2] as string | null),
  'dt.toLocal': (a) => {
    const l = dtArg(a, 0).toLocalTime();
    return `${dt(l)}|${dt(l.toUniversalTime())}|${formatXsdDateTime(l)}`;
  },
  'dt.toUtc': (a) => dt(dtArg(a, 0).toUniversalTime()),
  'dt.add': (a) => {
    const d = dtArg(a, 0);
    const unit = a[2] as string;
    switch (unit) {
      case 'Ticks':
        return dt(d.addTicks(BigInt(a[3] as string)));
      case 'Months':
        return dt(d.addMonths(n(a, 3)));
      case 'Years':
        return dt(d.addYears(n(a, 3)));
    }
    const v = dblArg(a[3] as string);
    switch (unit) {
      case 'Milliseconds':
        return dt(d.addMilliseconds(v));
      case 'Seconds':
        return dt(d.addSeconds(v));
      case 'Minutes':
        return dt(d.addMinutes(v));
      case 'Hours':
        return dt(d.addHours(v));
      default:
        return dt(d.addDays(v));
    }
  },
  'dt.cmp': (a) => {
    const x = dtArg(a, 0);
    const y = dtArg(a, 2);
    const diff: TimeSpan = y.subtract(x);
    return `${x.compareTo(y)}|${bool(x.equals(y))}|${dt(x.add(diff))}|${x.subtract(y).ticks}`;
  },
};

export const deviations: Record<string, string> = {};

const offsetFormat = (f: unknown) => typeof f === 'string' && (f === 'o' || f === 'O' || f === 'U' || (f.length > 1 && /[zK]/.test(f)));

export const deviationRules = [
  {
    reason: HISTORIC_LOCAL_REASON,
    test: (fn: string, a: Args) =>
      (fn === 'dt.toLocal' || fn === 'dt.toUtc' || (fn === 'dt.fmt' && offsetFormat(a[2]))) && BigInt(a[0] as string) < HISTORIC_LOCAL_LIMIT,
  },
];
