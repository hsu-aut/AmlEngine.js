// Evaluators for the "xmlconvert" cases (scripts/sys-cases/xmlconvert.mjs); see test/system/sys.oracle.test.ts.
import { Decimal } from '../../../src/system/Decimal.js';
import { Guid } from '../../../src/system/Guid.js';
import { TimeSpan } from '../../../src/system/TimeSpan.js';
import { XmlConvert } from '../../../src/system/XmlConvert.js';
import { type Args, HISTORIC_LOCAL_LIMIT, HISTORIC_LOCAL_REASON, HISTORIC_LOCAL_YEAR, bool, dblArg, dec, dbl, dt, dtArg, sgl, sglArg } from '../repr.js';

const s0 = (a: Args) => a[0] as string;
const orNull = (v: string | null) => v ?? '#null';

export const evaluators: Record<string, (args: Args) => string> = {
  'xc.toDouble': (a) => dbl(XmlConvert.toDouble(s0(a))),
  'xc.toSingle': (a) => sgl(XmlConvert.toSingle(s0(a))),
  'xc.toDecimal': (a) => dec(XmlConvert.toDecimal(s0(a))),
  'xc.toInt16': (a) => XmlConvert.toInt16(s0(a)).toString(),
  'xc.toInt32': (a) => XmlConvert.toInt32(s0(a)).toString(),
  'xc.toInt64': (a) => XmlConvert.toInt64(s0(a)).toString(),
  'xc.toUInt16': (a) => XmlConvert.toUInt16(s0(a)).toString(),
  'xc.toUInt32': (a) => XmlConvert.toUInt32(s0(a)).toString(),
  'xc.toUInt64': (a) => XmlConvert.toUInt64(s0(a)).toString(),
  'xc.toByte': (a) => XmlConvert.toByte(s0(a)).toString(),
  'xc.toSByte': (a) => XmlConvert.toSByte(s0(a)).toString(),
  'xc.toBoolean': (a) => bool(XmlConvert.toBoolean(s0(a))),
  'xc.toTimeSpan': (a) => XmlConvert.toTimeSpan(s0(a)).ticks.toString(),
  'xc.toDateTime': (a) => dt(XmlConvert.toDateTime(s0(a), a[1] as number)),
  'xc.strDouble': (a) => XmlConvert.toString(dblArg(s0(a))),
  'xc.strSingle': (a) => XmlConvert.toStringSingle(sglArg(s0(a))),
  'xc.strDecimal': (a) => XmlConvert.toString(Decimal.parse(s0(a))),
  'xc.strBoolean': (a) => XmlConvert.toString(a[0] as boolean),
  // integers are numbers (int, short, ...) or bigints (long, ulong); both print as plain integers
  'xc.strInt': (a) => XmlConvert.toString(a[0] === 'Int64' || a[0] === 'UInt64' ? BigInt(a[1] as string) : Number(a[1])),
  'xc.strDateTime': (a) => XmlConvert.toString(dtArg(a, 0), a[2] as number),
  'xc.strDateTimeFmt': (a) => XmlConvert.toString(dtArg(a, 0), a[2] as string),
  'xc.strTimeSpan': (a) => XmlConvert.toString(new TimeSpan(BigInt(s0(a)))),
  'xc.strGuid': (a) => XmlConvert.toString(Guid.parse(s0(a))),
  'xc.verifyNCName': (a) => XmlConvert.verifyNCName(a[0] as string | null),
  'xc.verifyName': (a) => XmlConvert.verifyName(a[0] as string | null),
  'xc.verifyNMTOKEN': (a) => XmlConvert.verifyNMTOKEN(a[0] as string | null),
  'xc.verifyTOKEN': (a) => orNull(XmlConvert.verifyTOKEN(a[0] as string | null)),
  'xc.encodeName': (a) => orNull(XmlConvert.encodeName(a[0] as string | null)),
  'xc.encodeLocalName': (a) => orNull(XmlConvert.encodeLocalName(a[0] as string | null)),
  'xc.encodeNmToken': (a) => orNull(XmlConvert.encodeNmToken(a[0] as string | null)),
  'xc.decodeName': (a) => orNull(XmlConvert.decodeName(a[0] as string | null)),
};

export const deviations: Record<string, string> = {};

const YEAR = /^(\d{4})/;

export const deviationRules = [
  {
    reason: HISTORIC_LOCAL_REASON,
    test: (fn: string, a: Args) => {
      if (fn === 'xc.strDateTime' || (fn === 'xc.strDateTimeFmt' && /[zK]|^o$/.test(a[2] as string))) return BigInt(a[0] as string) < HISTORIC_LOCAL_LIMIT;
      if (fn === 'xc.toDateTime') {
        const m = YEAR.exec((a[0] as string).trim());
        return m !== null && Number(m[1]) < HISTORIC_LOCAL_YEAR;
      }
      return false;
    },
  },
];
