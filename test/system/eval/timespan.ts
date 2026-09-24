// Evaluators for the "timespan" cases (scripts/sys-cases/timespan.mjs); see test/system/sys.oracle.test.ts.
import { TimeSpan } from '../../../src/system/TimeSpan.js';
import { type Args, FAIL, dbl, dblArg } from '../repr.js';

const ts = (a: Args, i: number) => new TimeSpan(BigInt(a[i] as string));
const n = (a: Args, i: number) => a[i] as number;

export const evaluators: Record<string, (args: Args) => string> = {
  'ts.new': (a) => {
    switch (a.length) {
      case 3:
        return new TimeSpan(n(a, 0), n(a, 1), n(a, 2)).ticks.toString();
      case 4:
        return new TimeSpan(n(a, 0), n(a, 1), n(a, 2), n(a, 3)).ticks.toString();
      default:
        return new TimeSpan(n(a, 0), n(a, 1), n(a, 2), n(a, 3), n(a, 4)).ticks.toString();
    }
  },
  'ts.props': (a) => {
    const t = ts(a, 0);
    return [t.days, t.hours, t.minutes, t.seconds, t.milliseconds, dbl(t.totalDays), dbl(t.totalHours), dbl(t.totalMinutes), dbl(t.totalSeconds), dbl(t.totalMilliseconds)].join('|');
  },
  'ts.fmt': (a) => ts(a, 0).toString(a[1] as string | null),
  'ts.parse': (a) => {
    const r = TimeSpan.tryParse(a[0] as string);
    return r === null ? FAIL : r.ticks.toString();
  },
  'ts.from': (a) => {
    const v = dblArg(a[1] as string);
    const f = { Days: TimeSpan.fromDays, Hours: TimeSpan.fromHours, Minutes: TimeSpan.fromMinutes, Seconds: TimeSpan.fromSeconds, Milliseconds: TimeSpan.fromMilliseconds }[a[0] as string]!;
    return f(v).ticks.toString();
  },
  'ts.negate': (a) => ts(a, 0).negate().ticks.toString(),
  'ts.duration': (a) => ts(a, 0).duration().ticks.toString(),
  'ts.add': (a) => ts(a, 0).add(ts(a, 1)).ticks.toString(),
  'ts.sub': (a) => ts(a, 0).subtract(ts(a, 1)).ticks.toString(),
  'ts.cmp': (a) => TimeSpan.compare(ts(a, 0), ts(a, 1)).toString(),
};

export const deviations: Record<string, string> = {};
