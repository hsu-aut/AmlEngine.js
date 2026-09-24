// Cases for DateTime.Parse / TryParse under the invariant culture (src/system/DateTimeParse.ts).
//   dt.parse       [s]          DateTime.TryParse(s) (current culture invariant)
//   dt.parseStyles [s, styles]  DateTime.TryParse(s, CultureInfo.InvariantCulture, styles)
//   dt.Parse       [s]          DateTime.Parse(s)

const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthAbbr = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayAbbr = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad = (v, n) => String(v).padStart(n, '0');

function isLeap(y) {
  return y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
}

function daysIn(y, m) {
  return [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];
}

/** Day of week (0 = Sunday) of a proleptic Gregorian date. */
function dow(y, m, d) {
  const t = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  if (m < 3) y -= 1;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + t[m - 1] + d) % 7;
}

/** A small invariant custom format implementation (only used to build inputs). */
function fmt(v, format) {
  let out = '';
  let i = 0;
  while (i < format.length) {
    const ch = format[i];
    let n = 1;
    while (i + n < format.length && format[i + n] === ch) n++;
    switch (ch) {
      case 'y':
        out += n === 1 ? String(v.y % 100) : n === 2 ? pad(v.y % 100, 2) : pad(v.y, n);
        break;
      case 'M':
        out += n === 1 ? String(v.M) : n === 2 ? pad(v.M, 2) : n === 3 ? monthAbbr[v.M - 1] : monthNames[v.M - 1];
        break;
      case 'd':
        out += n === 1 ? String(v.d) : n === 2 ? pad(v.d, 2) : n === 3 ? dayAbbr[dow(v.y, v.M, v.d)] : dayNames[dow(v.y, v.M, v.d)];
        break;
      case 'H':
        out += n === 1 ? String(v.H) : pad(v.H, 2);
        break;
      case 'h': {
        const h = v.H % 12 === 0 ? 12 : v.H % 12;
        out += n === 1 ? String(h) : pad(h, 2);
        break;
      }
      case 'm':
        out += n === 1 ? String(v.m) : pad(v.m, 2);
        break;
      case 's':
        out += n === 1 ? String(v.s) : pad(v.s, 2);
        break;
      case 'f':
        out += pad(v.f, 7).substring(0, n);
        break;
      case 'F': {
        const t = pad(v.f, 7).substring(0, n).replace(/0+$/, '');
        if (t === '' && out.endsWith('.')) out = out.slice(0, -1);
        out += t;
        break;
      }
      case 't':
        out += (v.H < 12 ? 'AM' : 'PM').substring(0, n === 1 ? 1 : 2);
        break;
      case 'z': {
        const o = v.z;
        const sign = o < 0 ? '-' : '+';
        const a = Math.abs(o);
        out += n === 1 ? `${sign}${Math.floor(a / 60)}` : n === 2 ? `${sign}${pad(Math.floor(a / 60), 2)}` : `${sign}${pad(Math.floor(a / 60), 2)}:${pad(a % 60, 2)}`;
        break;
      }
      case "'": {
        const end = format.indexOf("'", i + 1);
        out += format.substring(i + 1, end < 0 ? format.length : end);
        i = end < 0 ? format.length : end + 1;
        continue;
      }
      default:
        out += ch.repeat(n);
    }
    i += n;
  }
  return out;
}

const standard = {
  d: 'MM/dd/yyyy',
  D: 'dddd, dd MMMM yyyy',
  f: 'dddd, dd MMMM yyyy HH:mm',
  F: 'dddd, dd MMMM yyyy HH:mm:ss',
  g: 'MM/dd/yyyy HH:mm',
  G: 'MM/dd/yyyy HH:mm:ss',
  M: 'MMMM dd',
  o: "yyyy'-'MM'-'dd'T'HH':'mm':'ss'.'fffffff",
  oz: "yyyy'-'MM'-'dd'T'HH':'mm':'ss'.'fffffff'Z'",
  ooff: "yyyy'-'MM'-'dd'T'HH':'mm':'ss'.'fffffffzzz",
  R: "ddd, dd MMM yyyy HH':'mm':'ss 'GMT'",
  s: "yyyy'-'MM'-'dd'T'HH':'mm':'ss",
  t: 'HH:mm',
  T: 'HH:mm:ss',
  u: "yyyy'-'MM'-'dd HH':'mm':'ss'Z'",
  U: 'dddd, dd MMMM yyyy HH:mm:ss',
  Y: 'yyyy MMMM',
};

const customFormats = [
  'yyyy-MM-dd', 'yyyy/MM/dd', 'MM/dd/yyyy', 'M/d/yyyy', 'M/d/yy', 'd.M.yyyy', 'dd.MM.yyyy', 'dd-MM-yyyy', 'yyyy.MM.dd',
  'yyyyMMdd', 'yyyy-MM-dd HH:mm', 'yyyy-MM-dd HH:mm:ss', 'yyyy-MM-dd HH:mm:ss.fff', 'yyyy-MM-ddTHH:mm:ss.FFFFFFF',
  'yyyy-MM-ddTHH:mm', 'yyyy-MM-ddTHH:mm:sszzz', 'yyyy-MM-ddTHH:mm:ss.fffzzz', 'yyyy-MM-dd HH:mm:ss zzz', 'yyyy-MM-dd HH:mm zz',
  'yyyy-MM-dd HH:mm:ssz', 'yyyy-MM-ddTHH:mm:ssZ', 'yyyy-MM-dd HH:mm:ss GMT', 'MM/dd/yyyy hh:mm tt', 'M/d/yyyy h:mm:ss tt',
  'h tt', 'h:mm tt', 'hh:mm:ss tt', 'H:mm', 'HH:mm:ss', 'HH:mm:ss.fffffff', 'HH:mm:ss,fff', 'HH:mm:ss zzz', 'HH:mmZ',
  'dd MMMM yyyy', 'd MMM yyyy', 'MMMM d, yyyy', 'MMM d yyyy', 'MMMM yyyy', 'yyyy MMMM', 'MMMM dd', 'dd MMMM', 'MMM yy',
  'ddd, dd MMM yyyy HH:mm:ss', 'dddd, MMMM d, yyyy', 'dddd d MMMM yyyy h:mm tt', 'ddd MMM d HH:mm:ss yyyy',
  'd/M/yyyy', 'yyyy-M-d', 'yy-MM-dd', 'yyyy-MM', 'MM/yyyy', 'MM/dd', 'M-d', 'yyyy', 'dd', 'MM/dd/yy HH:mm',
  "yyyy'年'M'月'd'日'", "yyyy'年'M'月'd'日' H'時'm'分's'秒'", "M'月'd'日'", "yyyy'년' M'월' d'일'",
  'yyyy-MM-dd tt hh:mm', 'tt h:mm', 'yyyy/MM/dd HH:mm:ss.ff', 'MMMM d yyyy HH:mm:ss', 'd MMMM, yyyy', 'MM.dd.yyyy HH:mm',
];

export default function (rng) {
  const cases = [];
  const add = (fn, ...args) => cases.push({ fn, args });

  // ------------------------------------------------------------------ hand-written inputs
  const inputs = [
    // empty, white space, garbage
    '', ' ', '   ', '\t', 'abc', 'x', '-', '+', '/', ':', '.', ',', '#', '##', 'T', 'Z', 'GMT', 'AM', 'PM', 'A.D.', 'AD',
    'now', 'today', 'noon', 'midnight', 'null', 'true', '1e5', '0x10', 'NaN', '2020-01-05x', 'x2020-01-05', '2020-01-05 abc',
    // numbers only
    '0', '1', '12', '13', '31', '32', '99', '100', '999', '1000', '2020', '9999', '10000', '12345678', '123456789', '20200105',
    '2020 ', ' 2020', '2020.', '1/2', '1/2/3', '1/2/3/4', '13/01/2020', '01/13/2020', '12/31/2020', '2/29/2020', '2/29/2021',
    '2/30/2020', '0/1/2020', '1/0/2020', '1/1/0', '1/1/00', '1/1/49', '1/1/50', '1/1/99', '1/1/100', '1/1/0001', '12/31/9999',
    '1/1/10000', '1 2', '1 2 3', '1 2 2020', '2020 1 2', '1-2', '1-2-3', '1.2', '1.2.3', '5.1.2020', '1.5.2020', '31.12.2020',
    '2020.12.31', '2020/12/31', '2020-12-31', '2020-1-5', '2020/1/5', '2020 12 31', '12 31 2020', '31 12 2020',
    '2020-13-01', '2020-00-01', '2020-01-00', '2020-01-32', '2021-02-29', '2020-02-29', '2100-02-29', '2000-02-29',
    '0001-01-01', '9999-12-31', '0000-01-01', '10000-01-01', '00001-01-01', '002020-01-05', '020-01-05', '20-01-05',
    '2020-01', '2020/01', '01/2020', '1/2020', '2020-1', '2020-01-05-', '2020--01-05', '2020-01--05', '2020/01-05', '2020-01/05',
    // times
    '10:00', '10:00:00', '10:00:00.5', '10:00:00.1234567', '10:00:00.12345678', '10:00:00,5', '10:00:00.', '10:00.5',
    '10:00:00.9999999', '10:00:00.99999999', '23:59:59.9999999', '23:59:59.99999999', '24:00', '24:00:00', '25:00',
    '23:60', '23:59:60', '10', '10:', '10::00', ':10', '10:00:00:00', '1:2', '1:2:3', '001:02', '10:00 AM', '10:00 PM',
    '12:00 AM', '12:00 PM', '0:00 AM', '0:00 PM', '13:00 PM', '13:00 AM', '10 AM', '10 PM', '10AM', '10PM', '10 am', '10 pm',
    '10 a.m.', '10 A', '10 P', '10:00 AM PM', 'AM 10:00', 'PM 10:00', 'AM10:00', '10:00AM', '10:00:00 am', '10:00 Am',
    '10:00Z', '10:00 Z', '10:00z', '10:00 GMT', '10:00 gmt', '10:00:00+01:00', '10:00:00-08:00', '10:00 +1', '10:00 +01',
    '10:00+0100', '10:00 +100', '10:00 +01:0', '10:00 +01:000', '10:00 +12345', '10:00 +14:00', '10:00 +14:01', '10:00 -14:00',
    '10:00 -14:01', '10:00 +15', '10:00 +99', '10:00 +01:60', '10:00+01:00Z', '10:00Z+01:00', '10:00 GMT+01:00', '10:00 +01:00 +01:00',
    '10:00 +', '10:00 -', '10:00 - 01:00', '10:00 + 01', '10:00.5 +01', '10:00:00.5+01:00', '10:00:00.5Z', '10:00 PM +01:00',
    // ISO 8601
    '2020-01-05T10:00', '2020-01-05T10:00:00', '2020-01-05T10:00:00Z', '2020-01-05T10:00:00z', '2020-01-05T10:00:00.1234567',
    '2020-01-05T10:00:00.1234567Z', '2020-01-05T10:00:00.12345678Z', '2020-01-05T10:00:00.123+05:30', '2020-01-05T10:00:00-08:00',
    '2020-01-05T10:00:00+01', '2020-01-05T10:00:00+0100', '2020-01-05T10:00:00 +01:00', '2020-01-05T10:00:00 Z', '2020-01-05T10:00Z',
    '2020-01-05T10:00+01:00', '2020-01-05T10', '2020-01-05T', '2020-01-05T1:00', '2020-01-05T10:0', '2020-01-05T10:00:0',
    '2020-01-05T10:00:00.', '2020-01-05T10:00:00,5', '2020-01-05T10:00:00.5 ', ' 2020-01-05T10:00:00', '2020-01-05t10:00:00',
    '2020-01-05 T10:00:00', '2020-01-05T 10:00:00', '2020-01-05T10 :00', '2020-01-05T10: 00', '2020-01-05T10:00:00 x',
    '2020-01-05T10:00:00Zx', '2020-01-05T10:00:00ZZ', '2020-01-05T10:00:00+01:00Z', '2020-01-05T10:00:00#', '#2020-01-05T10:00:00#',
    '2020-01-05T10:00:00\0', '2020-01-05T10:00:00\0\0', '2020-01-05T10:00:00\0x', '2020-01-05T24:00:00', '2020-01-05T23:59:60',
    '2020-02-30T10:00:00', '2020/01/05T10:00:00', '2020-1-5T10:00:00', '01-05-2020T10:00:00', '2020-01-05T10:00:00+14:01',
    '2020-01-05T10:00:00+15:00', '2020-01-05T10:00:00-14:00', '2020-01-05T10:00:00+1:00', '2020-01-05T10:00:00+01:0',
    '20200105T100000', '2020-01-05T10:00:00.1234567+01:00', '2020-01-05T10:00:00.0000000', '2020-01-05T10:00:00.0000001Z',
    '0001-01-01T00:00:00', '0001-01-01T00:00:00Z', '0001-01-01T00:00:00+01:00', '0001-01-01T00:00:00-01:00',
    '9999-12-31T23:59:59.9999999', '9999-12-31T23:59:59.9999999Z', '9999-12-31T23:59:59.9999999-01:00', '9999-12-31T23:59:59.99999999',
    '9999-12-31T23:00:00+01:00', '9999-12-31T23:00:00-01:00', '0001-01-01T00:30:00+01:00', '9999-12-31 23:00:00 -01:00',
    '9999-12-31 23:00:00Z', '0001-01-01 00:00:00Z', '1/1/0001 00:30 +01:00', '12/31/9999 23:30 -01:00',
    // space separated date time
    '2020-01-05 10:00', '2020-01-05 10:00:00', '2020-01-05 10:00:00.1234567', '2020-01-05  10:00', '2020-01-05 10:00:00Z',
    '2020-01-05 10:00:00 +01:00', '2020-01-05 10:00:00+01:00', '2020-01-05 10:00:00 -0800', '2020-01-05 10:00 PM', '2020-01-05 10 PM',
    '2020-01-05 10:00 GMT', '2020-01-05 GMT 10:00', 'GMT 2020-01-05 10:00', 'Z 2020-01-05', '2020-01-05Z', '2020-01-05 +01:00',
    '2020-01-05 -01:00', '2020-01-05-01:00', '2020-01-05+01:00', '2020-01-05 +01', '10:00 2020-01-05', '10:00:00 01/05/2020',
    '01/05/2020 10:00:00', '01/05/2020 10:00', '1/5/2020 10:00:00 AM', '1/5/2020 10:00:00 PM', '1/5/2020 22:00:00 PM',
    '01/05/2020 10:00:00 +01:00', '01/05/2020 10:00:00Z', '1/10 5 AM', '1/10 5 PM', '1/10 5', '1/10 5:30', '1/10/2020 5 AM',
    '1/10 2020', '1/10 20', '10:00 1/5', '1/5 10:00', '2020-01-05 10:00 10:00', '2020-01-05 2020-01-05', '1/2/2020 3/4/2020',
    // month names
    'January', 'january', 'JANUARY', 'Jan', 'jan', 'JAN', 'Janu', 'Janua', 'Sept', 'Sep', 'September', 'sept 2020',
    'January 5', 'January 05', 'Jan 5', '5 Jan', '05 January', '5 January', '31 January', '32 January', '99 January', '49 January',
    '50 January', 'January 2020', '2020 January', 'January, 2020', 'January 5, 2020', 'January 5 2020', '5 January 2020',
    '05 January 2020', '2020 January 5', '2020 5 January', 'Jan-5-2020', '5-Jan-2020', '2020-Jan-05', '05-Jan-20', 'Jan/5/2020',
    '5/Jan/2020', 'Jan 5 20', 'Jan 20 5', '5 20 Jan', 'January 2020 5', 'Jan5', '5Jan', 'Jan2020', '2020Jan', 'JanFeb', 'Jan Feb',
    'January February 2020', 'February 29', 'February 29, 2021', 'February 30', 'Feb 29 2020', 'Mar 2020', 'May', 'May 1', 'June',
    'Jun', 'July 4th', 'July 4', 'Dec 25 10:00', 'Dec 25 10:00 PM', 'December 25, 2020 10:00:00 PM', '25 December 2020 22:00',
    'January 5, 2020 10:00 +01:00', 'January 5 10:00', 'Jan 5, 10', 'Jan 5,', 'Jan. 5 2020', 'Jan.5.2020', '5.Jan.2020',
    'Jan 1 1', 'Jan 1 9999', 'Jan 1 10000', 'January 1 0', 'January 0', '0 January',
    // day names
    'Sunday', 'Sun', 'sunday', 'SUN', 'Sunday, 05 January 2020', 'Monday, 05 January 2020', 'Sun, 05 Jan 2020',
    'Sun, 05 Jan 2020 10:00:00 GMT', 'Mon, 05 Jan 2020 10:00:00 GMT', 'sun, 05 jan 2020 10:00:00 gmt', 'Sun 05 Jan 2020',
    'Sunday January 5 2020', 'Sunday 10:00', 'Sunday 2020-01-05', '2020-01-05 Sunday', '2020-01-05 Monday', 'Sun Sun 2020-01-05',
    'Sunday, Sunday', 'Tues 2020-01-07', 'Tue 2020-01-07', 'Thu, 01 Jan 1970 00:00:00 GMT', 'Wed, 31 Dec 1969 23:59:59 GMT',
    'Fri 13:00', 'Sat Jan 5 10:00:00 2019', 'Sun Jan 5 10:00:00 2020', 'Sun Jan 5 10:00:00 UTC 2020', 'Sun Jan 5 10:00:00 +0100 2020',
    // eras and ignorable symbols
    'A.D. 2020-01-05', '2020-01-05 A.D.', '2020-01-05 AD', 'AD 2020', '2020 AD', '5 January 2020 A.D.', 'BC 2020', '2020-01-05 B.C.',
    '2020,01,05', '2020, 01, 05', ',2020-01-05', '2020-01-05,', '2020-01-05.', '.2020-01-05', '2020-01-05, 10:00', '2020-01-05. 10:00',
    '#2020-01-05#', '#2020-01-05 10:00#', '# 2020-01-05 #', '#2020-01-05', '2020-01-05#', '#2020-01-05##', 'x#2020-01-05#',
    '#2020-01-05#\0', '#2020-01-05#\0\0', '2020-01-05\0', '2020-01-05\0\0', '2020-01-05\0 ', '2020-01-05 \0', '\0', '\0 ',
    '2020-01-05\0x', '\x002020-01-05', '10:00\0', '2020-01-05 10:00\0',
    // CJK suffixes
    '2020年1月5日', '2020年01月05日 10時30分15秒', '1月5日', '5日', '2020年', '2020年1月', '20年1月5日', '10時', '10時30分',
    '10時30分15秒', '2020년 1월 5일', '2020 年 1 月 5 日', '1月', '2020年1月5日 10:30', '2020年5日', '年', '2020年2020年',
    '12345年', '10000年1月1日', '1月5日 2020', '2020/1月', '1月2020', '5日1月2020',
    // unicode white space and marks
    '2020-01-05 10:00', '2020-01-05 10:00', '2020-01-05 10:00', '2020-01-05　10:00', '2020-01-05​10:00',
    '‏2020-01-05', '2020-01-05‏', '2020‏-01-05', '10:00‏AM', '10:00 ‏AM', ' 2020-01-05 ',
    '\t2020-01-05\n', '\r\n2020-01-05 10:00\r\n', ' 2020-01-05 ', '\u0085 2020-01-05', '﻿2020-01-05',
    '２０２０-01-05', '2020－01－05', '2020-01-05　Z',
    // inner white space
    '2020 - 01 - 05', '2020 -01- 05', '2020 / 01 / 05', '01 / 05 / 2020', '10 : 00', '10 :00', '10: 00', '10 : 00 : 00',
    '  2020-01-05   10:00:00   ', '2020-01-05 10:00:00 . 5', '10:00:00 .5', '10:00:00. 5', '1 0:00', '20 20-01-05',
    // DST in Europe/Berlin
    '2021-03-28 02:30', '2021-03-28 02:00', '2021-03-28 01:59:59', '2021-03-28 03:00', '2021-10-31 02:30', '2021-10-31 02:00',
    '2021-10-31 03:00', '2021-10-31 01:59', '2021-10-31T00:30:00Z', '2021-10-31T01:30:00Z', '2021-10-31T00:59:59Z',
    '2021-10-31T01:00:00Z', '2021-10-31T02:00:00Z', '2021-03-28T01:30:00Z', '2021-03-28T00:59:59Z', '2021-03-28T01:00:00Z',
    '2021-03-28T02:30:00+01:00', '2021-10-31T02:30:00+02:00', '2021-10-31T02:30:00+01:00', '2026-03-29 02:30', '2026-10-25 02:30',
    '1985-10-10T11:45:38Z', '1950-07-01T12:00:00Z', '1890-01-01T00:00:00Z',
    '2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', '2026-03-29T01:30:00Z', '2020-07-01T12:00:00Z', '2020-12-01T12:00:00Z',
    '03/28/2021 02:30', '10/31/2021 02:30 AM', '2021-10-31 02:30 GMT', '1985-07-01T12:00:00Z', '1995-01-01T00:00:00+05:00',
    // two digit years
    '1/1/29', '1/1/30', '1/1/48', '12/31/49', '1/1/51', '1/1/98', '01-05-20', '20-01-05', '49-01-05', '50-01-05', '99/12/31',
    '1/5/020', '1/5/0020', '00-01-01', 'Jan 49', 'Jan 50', '49 Jan', 'January 99',
    // mixed junk
    '2020-01-05 10:00 foo', 'foo 2020-01-05', '2020-01-05 @ 10:00', '2020-01-05 (Sun)', '2020_01_05', '2020|01|05', '2020\\01\\05',
    '2020-01-05;10:00', '10;00', '10h00', '10h', '10:00h', '10:00 Uhr', '5. Januar 2020', 'Jan 5th 2020', '1st Jan 2020',
    '12:00 noon', 'TZ', '2020-01-05T', 'T10:00', '2020-01-05 T', '10:00 T', '2020-01-05TT10:00', '2020-01-05 10:00 A.M.',
    // token hash precedence, partial words, fractions
    'Marc 5', 'Octo 5', 'Augus 5', 'Mo 2020-01-06', 'Tues 2020-01-07', 'Thurs', 'Wednes', 'Ja 5', 'Janx 5', 'Jan5 2020',
    'MAY 5 2020', 'mAy 5', 'Mayo 5', 'Monday2020-01-06', 'Jan-2020', 'GMT10:00', 'GMTx', 'Zulu', '10:00 Zulu', 'ADx 2020',
    '10:00:00.00000005', '10:00:00.00000015', '10:00:00.00000025', '10:00:00.0000000500', '10:00:00.123456789012',
    '10:00:00.5 PM', '10:00:00.5PM', '10:00:00.5.5', 'Jan 5 2020 10:00:00.5', '10:00,5', '10:00:00,', '10:00:00.,5',
    '2020-01-05T10:00:00.00000005Z', '2020-01-05T10:00:00.00000015', '9999-12-31 23:59:59.99999999', '12/31/9999 11:59:59.99999999 PM',
    '10:00 AM AM', '10 AM PM', '2020 AM', '2020 PM 10', 'AM', 'PM 2020-01-05', '5 PM 2020-01-05', '2020-01-05 5 PM',
    '2020-01-05 12 AM', '2020-01-05 0 AM', '2020-01-05 13 AM', '2020-01-05 24 PM', '1 2 3 4', '1:2:3:4', '1/2 3/4',
  ];
  for (const s of inputs) add('dt.parse', s);

  // Parse (exceptions) for a subset
  for (const s of inputs.slice(0, 80)) add('dt.Parse', s);
  for (const s of ['2020-01-05', 'garbage', '', '2021-02-29', '10:00 +15:00', '9999-12-31T23:00:00-01:00', 'Monday, 05 January 2020', '2020-01-05T10:00:00Z']) {
    add('dt.Parse', s);
  }

  // ------------------------------------------------------------------ styles
  const styleValues = [0, 1, 2, 4, 7, 8, 16, 32, 64, 128, 16 | 32, 16 | 64, 8 | 64, 8 | 32, 8 | 16, 7 | 8 | 16 | 64, 32 | 64, 128 | 16, 128 | 32, 128 | 64, 128 | 8, 256, -1];
  const styleInputs = [
    '2020-01-05', '2020-01-05 10:00', '2020-01-05T10:00:00Z', '2020-01-05T10:00:00+05:30', '2020-01-05T10:00:00-08:00',
    '2020-01-05T10:00:00.1234567', '10:00', '10:00Z', '10:00 +01:00', '10:00 PM', '23:30 -05:00', '00:30 +05:00', 'January 5',
    'Sun, 05 Jan 2020 10:00:00 GMT', '01/05/2020 10:00:00', '2021-03-28 02:30', '2021-10-31 02:30', '2021-10-31T00:30:00Z',
    '2021-10-31T01:30:00Z', '9999-12-31T23:59:59', '9999-12-31T23:30:00-01:00', '9999-12-31T23:30:00Z', '2020', 'garbage', '',
    '2020-06-15 12:00 GMT', '12/31/9999 23:59:59 +01:00', '2026-07-01', '2026-07-01T00:00:00Z',
  ];
  for (const s of styleInputs) for (const st of styleValues) add('dt.parseStyles', s, st);
  // year 1 with offsets: the local offset of 0001-01-01 differs between Windows and IANA (deviations)
  for (const s of ['0001-01-01T00:00:00', '1/1/0001 0:30', '0001-01-02 00:30', '0001-01-01T00:30:00+01:00', '0001-01-01T00:00:00Z', '1/1/0001 0:30 +01:00', '1/1/0001 0:30 -01:00']) {
    for (const st of [0, 16, 64, 48]) add('dt.parseStyles', s, st);
  }

  // ------------------------------------------------------------------ standard formats of sample dates
  const samples = [
    { y: 2020, M: 1, d: 5, H: 10, m: 0, s: 0, f: 1234567, z: 60 },
    { y: 2021, M: 3, d: 28, H: 2, m: 30, s: 15, f: 0, z: -480 },
    { y: 2021, M: 10, d: 31, H: 2, m: 30, s: 0, f: 5000000, z: 330 },
    { y: 1999, M: 12, d: 31, H: 23, m: 59, s: 59, f: 9999999, z: 0 },
    { y: 2000, M: 2, d: 29, H: 0, m: 0, s: 0, f: 1, z: 840 },
    { y: 2026, M: 9, d: 1, H: 12, m: 0, s: 0, f: 0, z: 120 },
    { y: 9999, M: 12, d: 31, H: 23, m: 59, s: 59, f: 9999999, z: -60 },
    { y: 2049, M: 6, d: 15, H: 13, m: 45, s: 1, f: 10, z: -840 },
    { y: 1980, M: 5, d: 20, H: 6, m: 5, s: 7, f: 700, z: 0 },
    { y: 2026, M: 1, d: 1, H: 0, m: 0, s: 0, f: 0, z: 0 },
  ];
  for (const v of samples) {
    for (const f of Object.values(standard)) add('dt.parse', fmt(v, f));
  }

  // ------------------------------------------------------------------ random dates in random formats
  const randomDate = () => {
    const pickYear = rng.int(10);
    const y = pickYear < 6 ? rng.range(1970, 2040) : pickYear < 8 ? rng.range(1900, 2100) : rng.range(1, 9999);
    const M = rng.range(1, 12);
    const d = rng.int(20) === 0 ? rng.range(28, 31) : rng.range(1, daysIn(y, M));
    return {
      y,
      M,
      d,
      H: rng.range(0, 23),
      m: rng.range(0, 59),
      s: rng.range(0, 59),
      f: rng.int(3) === 0 ? 0 : rng.range(0, 9999999),
      z: rng.pick([0, 60, 120, -60, -300, -480, 330, 345, 540, 600, 780, 840, -840, -720]),
    };
  };
  for (let i = 0; i < 2500; i++) {
    const v = randomDate();
    // offsets on dates before 1980 would hit the time zone history differences, keep them recent
    // with a zone the result is converted to local time: keep the date where the Windows rules of
    // Europe/Berlin and the IANA history agree (1996 and later)
    const f = rng.pick(customFormats);
    if (v.y < 1996 && /z|Z|GMT/.test(f)) v.y = rng.range(1996, 2040);
    let s = fmt(v, f);
    const r = rng.int(12);
    if (r === 0) s = ' ' + s;
    else if (r === 1) s = s + ' ';
    else if (r === 2) s = s.toLowerCase();
    else if (r === 3) s = s.toUpperCase();
    add('dt.parse', s);
  }

  // ------------------------------------------------------------------ token soups
  const tokens = [
    '2020', '1999', '2001', '9999', '12345', '1', '5', '12', '13', '24', '31', '59', '60', '00', '07', '2', '99',
    '-', '/', ':', '.', ',', ' ', ' ', '  ', 'T', 'Z', 'GMT', 'AM', 'PM', 'am', 'pm', '+', '+01:00', '-08:00', '+0530', '+1',
    'Jan', 'January', 'Feb', 'March', 'Sep', 'Sept', 'Dec', 'Mon', 'Monday', 'Sun', 'Sunday', 'Thu', 'A.D.', 'AD',
    '年', '月', '日', '時', '分', '秒', '#', '\0', ' ', '\t', 'x', 'foo',
  ];
  for (let i = 0; i < 2500; i++) {
    const n = rng.range(1, 8);
    let s = '';
    for (let k = 0; k < n; k++) s += rng.pick(tokens);
    // a year before 1996 together with a zone hits the time zone history differences
    if (/Z|GMT|[+-]\d/.test(s) && /(^|\D)(0\d{2,3}|1[0-8]\d\d|19[0-8]\d|199[0-5])(\D|$)/.test(s)) continue;
    add('dt.parse', s);
  }

  // Structured soups: date part + separator + time part + zone
  const dateParts = (zoned) => {
    const v = randomDate();
    if (zoned && v.y < 1996) v.y = rng.range(1996, 2040);
    return rng.pick([
      `${v.y}-${pad(v.M, 2)}-${pad(v.d, 2)}`,
      `${v.M}/${v.d}/${v.y}`,
      `${v.d}.${v.M}.${v.y}`,
      `${v.d} ${monthNames[v.M - 1]} ${v.y}`,
      `${monthAbbr[v.M - 1]} ${v.d}`,
      `${v.M}/${v.d}`,
      `${v.y}/${v.M}/${v.d}`,
      `${pad(v.y % 100, 2)}-${pad(v.M, 2)}-${pad(v.d, 2)}`,
      `${dayAbbr[rng.int(7)]}, ${v.d} ${monthAbbr[v.M - 1]} ${v.y}`,
      '',
    ]);
  };
  const timeParts = () =>
    rng.pick([
      `${rng.range(0, 25)}:${pad(rng.range(0, 61), 2)}`,
      `${rng.range(0, 25)}:${pad(rng.range(0, 61), 2)}:${pad(rng.range(0, 61), 2)}`,
      `${rng.range(0, 23)}:${pad(rng.range(0, 59), 2)}:${pad(rng.range(0, 59), 2)}.${rng.range(0, 99999999)}`,
      `${rng.range(0, 13)} ${rng.pick(['AM', 'PM'])}`,
      `${rng.range(0, 13)}:${pad(rng.range(0, 59), 2)} ${rng.pick(['AM', 'PM', 'am'])}`,
      '',
    ]);
  const zoneParts = () => rng.pick(['', '', 'Z', ' Z', ' GMT', '+01:00', ' -08:00', '+0530', ' +14:00', ' -14:30', '+2', ' +12:60']);
  for (let i = 0; i < 1500; i++) {
    const zone = zoneParts();
    const dp = dateParts(zone !== '');
    const sep = rng.pick([' ', 'T', '  ', ', ']);
    const s = rng.int(4) === 0 ? `${timeParts()}${zone} ${dp}` : `${dp}${sep}${timeParts()}${zone}`;
    add('dt.parse', s);
  }
  return cases;
}
