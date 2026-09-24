using System.Globalization;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml;

namespace Oracle;

/// <summary>
/// Evaluates .NET System conversions for test cases read from a JSON file; the TS port of the
/// System layer (src/system) is compared against the results.
/// Input: [{"fn": "...", "args": [...]}, ...]. Output: [{"ok": "..."} | {"err": "ExceptionTypeName"}, ...].
/// Value representations (reproduced by test/system/sys.oracle.test.ts):
///   DateTime  "ticks|Kind" (time-of-day only results are made relative to today, see Dt)
///   TimeSpan  "ticks"
///   decimal   "ToString()|scale|signBit"
///   double    "R|bits as 16 hex digits", float "R|bits as 8 hex digits"
///   TryParse  "#fail" when it returns false
/// </summary>
public static class SysOracle
{
    const string Fail = "#fail";

    public static void Run(string casesFile, string outFile)
    {
        var cases = JsonNode.Parse(File.ReadAllText(casesFile))!.AsArray();
        var results = new JsonArray();
        foreach (var c in cases)
        {
            var fn = c!["fn"]!.GetValue<string>();
            var args = c["args"]!.AsArray();
            JsonObject r;
            try { r = new JsonObject { ["ok"] = Eval(fn, args) }; }
            catch (Exception e) { r = new JsonObject { ["err"] = e.GetType().Name }; }
            results.Add(r);
        }
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outFile))!);
        var opts = new JsonSerializerOptions { WriteIndented = false, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        File.WriteAllText(outFile, results.ToJsonString(opts));
    }

    static string S(JsonArray a, int i) => a[i]!.GetValue<string>();
    static string? SN(JsonArray a, int i) => a[i]?.GetValue<string>();
    static int I(JsonArray a, int i) => a[i]!.GetValue<int>();
    static long L(JsonArray a, int i) => long.Parse(S(a, i), CultureInfo.InvariantCulture);
    static DateTimeKind K(JsonArray a, int i) => (DateTimeKind)I(a, i);
    static DateTime D(JsonArray a, int i) => new DateTime(L(a, i), K(a, i + 1));
    static double Dbl(JsonArray a, int i) => BitConverter.Int64BitsToDouble(unchecked((long)ulong.Parse(S(a, i), NumberStyles.HexNumber)));
    static float Sgl(JsonArray a, int i) => BitConverter.Int32BitsToSingle(unchecked((int)uint.Parse(S(a, i), NumberStyles.HexNumber)));
    static decimal Dec(JsonArray a, int i) => decimal.Parse(S(a, i), NumberStyles.Number, CultureInfo.InvariantCulture);

    /// <summary>DateTime: "ticks|Kind"; if the date is today "T+ticksOfDay|Kind", if the year is this year "Y+ticksSinceJan1|Kind".</summary>
    static string Dt(DateTime d)
    {
        var today = DateTime.Today;
        if (d.Date == today) return $"T+{d.Ticks - today.Ticks}|{d.Kind}";
        if (d.Year == today.Year) return $"Y+{d.Ticks - new DateTime(today.Year, 1, 1).Ticks}|{d.Kind}";
        return $"{d.Ticks}|{d.Kind}";
    }

    static string R(double v) => v.ToString("R", CultureInfo.InvariantCulture) + "|" + BitConverter.DoubleToInt64Bits(v).ToString("x16");
    static string R(float v) => v.ToString("R", CultureInfo.InvariantCulture) + "|" + BitConverter.SingleToInt32Bits(v).ToString("x8");

    static string Dm(decimal d)
    {
        var bits = decimal.GetBits(d);
        return $"{d.ToString(CultureInfo.InvariantCulture)}|{(bits[3] >> 16) & 0xFF}|{(bits[3] < 0 ? 1 : 0)}";
    }

    static string Hex(byte[] b) => Convert.ToHexString(b).ToLowerInvariant();

    static string Uri(Uri u)
    {
        var s = $"{(u.IsAbsoluteUri ? "abs" : "rel")}|{u}|{u.OriginalString}";
        if (u.IsAbsoluteUri) s += $"|{u.Scheme}|{u.LocalPath}|{u.Fragment}|{u.AbsoluteUri}";
        return s;
    }

    static string Eval(string fn, JsonArray a)
    {
        switch (fn)
        {
            // ---------------- DateTime ----------------
            case "dt.new":
                return Dt(a.Count switch
                {
                    3 => new DateTime(I(a, 0), I(a, 1), I(a, 2)),
                    6 => new DateTime(I(a, 0), I(a, 1), I(a, 2), I(a, 3), I(a, 4), I(a, 5)),
                    7 => new DateTime(I(a, 0), I(a, 1), I(a, 2), I(a, 3), I(a, 4), I(a, 5), K(a, 6)),
                    8 => new DateTime(I(a, 0), I(a, 1), I(a, 2), I(a, 3), I(a, 4), I(a, 5), I(a, 6), K(a, 7)),
                    _ => throw new InvalidOperationException("dt.new arity"),
                });
            case "dt.ticks":
                return Dt(D(a, 0));
            case "dt.props":
            {
                var d = D(a, 0);
                return $"{d.Year}|{d.Month}|{d.Day}|{d.Hour}|{d.Minute}|{d.Second}|{d.Millisecond}|{(int)d.DayOfWeek}|{d.DayOfYear}|{Dt(d.Date)}|{d.TimeOfDay.Ticks}|{DateTime.DaysInMonth(d.Year, d.Month)}|{DateTime.IsLeapYear(d.Year)}";
            }
            case "dt.fmt":
                return SN(a, 2) is { } f ? D(a, 0).ToString(f) : D(a, 0).ToString();
            case "dt.toLocal":
            {
                var l = D(a, 0).ToLocalTime();
                return $"{Dt(l)}|{Dt(l.ToUniversalTime())}|{XmlConvert.ToString(l, XmlDateTimeSerializationMode.RoundtripKind)}";
            }
            case "dt.toUtc":
                return Dt(D(a, 0).ToUniversalTime());
            case "dt.add":
            {
                var d = D(a, 0);
                var unit = S(a, 2);
                if (unit == "Ticks") return Dt(d.AddTicks(L(a, 3)));
                if (unit == "Months") return Dt(d.AddMonths(I(a, 3)));
                if (unit == "Years") return Dt(d.AddYears(I(a, 3)));
                var v = Dbl(a, 3);
                return Dt(unit switch
                {
                    "Milliseconds" => d.AddMilliseconds(v),
                    "Seconds" => d.AddSeconds(v),
                    "Minutes" => d.AddMinutes(v),
                    "Hours" => d.AddHours(v),
                    "Days" => d.AddDays(v),
                    _ => throw new InvalidOperationException(unit),
                });
            }
            case "dt.cmp":
            {
                var x = D(a, 0);
                var y = D(a, 2);
                return $"{x.CompareTo(y)}|{x.Equals(y)}|{Dt(x.Add(y - x))}|{(x - y).Ticks}";
            }
            case "dt.parse":
                return DateTime.TryParse(S(a, 0), out var dp) ? Dt(dp) : Fail;
            case "dt.parseStyles":
                return DateTime.TryParse(S(a, 0), CultureInfo.InvariantCulture, (DateTimeStyles)I(a, 1), out var dps) ? Dt(dps) : Fail;
            case "dt.Parse":
                return Dt(DateTime.Parse(S(a, 0)));

            // ---------------- TimeSpan ----------------
            case "ts.new":
                return (a.Count switch
                {
                    3 => new TimeSpan(I(a, 0), I(a, 1), I(a, 2)),
                    4 => new TimeSpan(I(a, 0), I(a, 1), I(a, 2), I(a, 3)),
                    5 => new TimeSpan(I(a, 0), I(a, 1), I(a, 2), I(a, 3), I(a, 4)),
                    _ => throw new InvalidOperationException("ts.new arity"),
                }).Ticks.ToString(CultureInfo.InvariantCulture);
            case "ts.props":
            {
                var t = new TimeSpan(L(a, 0));
                return $"{t.Days}|{t.Hours}|{t.Minutes}|{t.Seconds}|{t.Milliseconds}|{R(t.TotalDays)}|{R(t.TotalHours)}|{R(t.TotalMinutes)}|{R(t.TotalSeconds)}|{R(t.TotalMilliseconds)}";
            }
            case "ts.fmt":
                return SN(a, 1) is { } tf ? new TimeSpan(L(a, 0)).ToString(tf) : new TimeSpan(L(a, 0)).ToString();
            case "ts.parse":
                return TimeSpan.TryParse(S(a, 0), out var tp) ? tp.Ticks.ToString(CultureInfo.InvariantCulture) : Fail;
            case "ts.from":
            {
                var v = Dbl(a, 1);
                return (S(a, 0) switch
                {
                    "Days" => TimeSpan.FromDays(v),
                    "Hours" => TimeSpan.FromHours(v),
                    "Minutes" => TimeSpan.FromMinutes(v),
                    "Seconds" => TimeSpan.FromSeconds(v),
                    "Milliseconds" => TimeSpan.FromMilliseconds(v),
                    _ => throw new InvalidOperationException(),
                }).Ticks.ToString(CultureInfo.InvariantCulture);
            }
            case "ts.negate":
                return new TimeSpan(L(a, 0)).Negate().Ticks.ToString(CultureInfo.InvariantCulture);
            case "ts.add":
                return new TimeSpan(L(a, 0)).Add(new TimeSpan(L(a, 1))).Ticks.ToString(CultureInfo.InvariantCulture);
            case "ts.sub":
                return new TimeSpan(L(a, 0)).Subtract(new TimeSpan(L(a, 1))).Ticks.ToString(CultureInfo.InvariantCulture);
            case "ts.cmp":
                return TimeSpan.Compare(new TimeSpan(L(a, 0)), new TimeSpan(L(a, 1))).ToString(CultureInfo.InvariantCulture);
            case "ts.duration":
                return new TimeSpan(L(a, 0)).Duration().Ticks.ToString(CultureInfo.InvariantCulture);

            // ---------------- decimal ----------------
            case "dec.parse":
                return decimal.TryParse(S(a, 0), out var dcp) ? Dm(dcp) : Fail;
            case "dec.Parse":
                return Dm(decimal.Parse(S(a, 0)));
            case "dec.fromDouble":
                return Dm((decimal)Dbl(a, 0));
            case "dec.toDouble":
                return R((double)Dec(a, 0));
            case "dec.fromParts":
                return Dm(new decimal(I(a, 0), I(a, 1), I(a, 2), a[3]!.GetValue<bool>(), (byte)I(a, 4)));
            case "dec.cmp":
            {
                var x = Dec(a, 0);
                var y = Dec(a, 1);
                return $"{x.CompareTo(y)}|{x.Equals(y)}|{x.GetHashCode() == y.GetHashCode()}";
            }
            case "dec.fromLong":
                return Dm((decimal)L(a, 0));
            case "dec.negate":
                return Dm(decimal.Negate(Dec(a, 0)));
            case "dec.toLong":
                return decimal.ToInt64(Dec(a, 0)).ToString(CultureInfo.InvariantCulture);

            // ---------------- Guid ----------------
            case "guid.parse":
                return Guid.TryParse(S(a, 0), out var g) ? g.ToString("D") : Fail;
            case "guid.Parse":
                return Guid.Parse(S(a, 0)).ToString("D");
            case "guid.fmt":
                return SN(a, 1) is { } gf ? Guid.Parse(S(a, 0)).ToString(gf) : Guid.Parse(S(a, 0)).ToString();

            // ---------------- Uri ----------------
            case "uri.create":
                return System.Uri.TryCreate(S(a, 0), (UriKind)I(a, 1), out var u) ? Uri(u) : Fail;
            case "uri.escape":
                return System.Uri.EscapeDataString(S(a, 0));
            case "uri.unescape":
                return System.Uri.UnescapeDataString(S(a, 0));
            case "uri.new":
                return Uri(new Uri(SN(a, 0)!, (UriKind)I(a, 1)));
            case "uri.parts":
            {
                // AbsolutePath|Query|Host|Port|IsUnc|IsFile|IsDefaultPort|UserInfo|Authority|PathAndQuery
                if (!System.Uri.TryCreate(S(a, 0), (UriKind)I(a, 1), out var up)) return Fail;
                if (!up.IsAbsoluteUri) return "rel";
                return $"{up.AbsolutePath}|{up.Query}|{up.Host}|{up.Port}|{up.IsUnc}|{up.IsFile}|{up.IsDefaultPort}|{up.UserInfo}|{up.Authority}|{up.PathAndQuery}";
            }
            case "uri.equals":
            {
                if (!System.Uri.TryCreate(S(a, 0), UriKind.RelativeOrAbsolute, out var ua)) return Fail;
                if (!System.Uri.TryCreate(S(a, 1), UriKind.RelativeOrAbsolute, out var ub)) return Fail;
                return ua.Equals(ub) ? "True" : "False";
            }

            // ---------------- plain TryParse (current culture = invariant) ----------------
            case "p.Int16": return short.TryParse(S(a, 0), out var p1) ? p1.ToString(CultureInfo.InvariantCulture) : Fail;
            case "p.Int32": return int.TryParse(S(a, 0), out var p2) ? p2.ToString(CultureInfo.InvariantCulture) : Fail;
            case "p.Int64": return long.TryParse(S(a, 0), out var p3) ? p3.ToString(CultureInfo.InvariantCulture) : Fail;
            case "p.UInt16": return ushort.TryParse(S(a, 0), out var p4) ? p4.ToString(CultureInfo.InvariantCulture) : Fail;
            case "p.UInt32": return uint.TryParse(S(a, 0), out var p5) ? p5.ToString(CultureInfo.InvariantCulture) : Fail;
            case "p.UInt64": return ulong.TryParse(S(a, 0), out var p6) ? p6.ToString(CultureInfo.InvariantCulture) : Fail;
            case "p.Byte": return byte.TryParse(S(a, 0), out var p7) ? p7.ToString(CultureInfo.InvariantCulture) : Fail;
            case "p.SByte": return sbyte.TryParse(S(a, 0), out var p8) ? p8.ToString(CultureInfo.InvariantCulture) : Fail;
            case "p.Double": return double.TryParse(S(a, 0), out var p9) ? R(p9) : Fail;
            case "p.Single": return float.TryParse(S(a, 0), out var p10) ? R(p10) : Fail;
            case "p.Boolean": return bool.TryParse(S(a, 0), out var p11) ? p11.ToString() : Fail;

            case "p.parse":
            {
                // X.Parse(s, styles, InvariantCulture)
                var s = SN(a, 1)!;
                var st = (NumberStyles)I(a, 2);
                var inv = CultureInfo.InvariantCulture;
                return S(a, 0) switch
                {
                    "Int16" => short.Parse(s, st, inv).ToString(inv),
                    "Int32" => int.Parse(s, st, inv).ToString(inv),
                    "Int64" => long.Parse(s, st, inv).ToString(inv),
                    "UInt16" => ushort.Parse(s, st, inv).ToString(inv),
                    "UInt32" => uint.Parse(s, st, inv).ToString(inv),
                    "UInt64" => ulong.Parse(s, st, inv).ToString(inv),
                    "Byte" => byte.Parse(s, st, inv).ToString(inv),
                    "SByte" => sbyte.Parse(s, st, inv).ToString(inv),
                    "Double" => R(double.Parse(s, st, inv)),
                    "Single" => R(float.Parse(s, st, inv)),
                    "Decimal" => Dm(decimal.Parse(s, st, inv)),
                    _ => throw new InvalidOperationException(),
                };
            }
            case "fmt.doubleF": return Dbl(a, 0).ToString(S(a, 1), CultureInfo.InvariantCulture);
            case "fmt.singleF": return Sgl(a, 0).ToString(S(a, 1), CultureInfo.InvariantCulture);
            case "fmt.decimalF": return Dec(a, 0).ToString(S(a, 1), CultureInfo.InvariantCulture);

            // ---------------- ToString() of numbers ----------------
            case "fmt.double": return Dbl(a, 0).ToString();
            case "fmt.single": return Sgl(a, 0).ToString();
            case "fmt.singleR": return R(Sgl(a, 0));

            // ---------------- XmlConvert ----------------
            case "xc.toDouble": return R(XmlConvert.ToDouble(S(a, 0)));
            case "xc.toSingle": return R(XmlConvert.ToSingle(S(a, 0)));
            case "xc.toDecimal": return Dm(XmlConvert.ToDecimal(S(a, 0)));
            case "xc.toInt16": return XmlConvert.ToInt16(S(a, 0)).ToString(CultureInfo.InvariantCulture);
            case "xc.toInt32": return XmlConvert.ToInt32(S(a, 0)).ToString(CultureInfo.InvariantCulture);
            case "xc.toInt64": return XmlConvert.ToInt64(S(a, 0)).ToString(CultureInfo.InvariantCulture);
            case "xc.toUInt16": return XmlConvert.ToUInt16(S(a, 0)).ToString(CultureInfo.InvariantCulture);
            case "xc.toUInt32": return XmlConvert.ToUInt32(S(a, 0)).ToString(CultureInfo.InvariantCulture);
            case "xc.toUInt64": return XmlConvert.ToUInt64(S(a, 0)).ToString(CultureInfo.InvariantCulture);
            case "xc.toByte": return XmlConvert.ToByte(S(a, 0)).ToString(CultureInfo.InvariantCulture);
            case "xc.toSByte": return XmlConvert.ToSByte(S(a, 0)).ToString(CultureInfo.InvariantCulture);
            case "xc.toBoolean": return XmlConvert.ToBoolean(S(a, 0)).ToString();
            case "xc.toTimeSpan": return XmlConvert.ToTimeSpan(S(a, 0)).Ticks.ToString(CultureInfo.InvariantCulture);
            case "xc.toDateTime": return Dt(XmlConvert.ToDateTime(S(a, 0), (XmlDateTimeSerializationMode)I(a, 1)));
            case "xc.strDouble": return XmlConvert.ToString(Dbl(a, 0));
            case "xc.strSingle": return XmlConvert.ToString(Sgl(a, 0));
            case "xc.strDecimal": return XmlConvert.ToString(Dec(a, 0));
            case "xc.strBoolean": return XmlConvert.ToString(a[0]!.GetValue<bool>());
            case "xc.strInt":
            {
                var s = S(a, 1);
                return S(a, 0) switch
                {
                    "Int16" => XmlConvert.ToString(short.Parse(s, CultureInfo.InvariantCulture)),
                    "Int32" => XmlConvert.ToString(int.Parse(s, CultureInfo.InvariantCulture)),
                    "Int64" => XmlConvert.ToString(long.Parse(s, CultureInfo.InvariantCulture)),
                    "UInt16" => XmlConvert.ToString(ushort.Parse(s, CultureInfo.InvariantCulture)),
                    "UInt32" => XmlConvert.ToString(uint.Parse(s, CultureInfo.InvariantCulture)),
                    "UInt64" => XmlConvert.ToString(ulong.Parse(s, CultureInfo.InvariantCulture)),
                    "Byte" => XmlConvert.ToString(byte.Parse(s, CultureInfo.InvariantCulture)),
                    "SByte" => XmlConvert.ToString(sbyte.Parse(s, CultureInfo.InvariantCulture)),
                    _ => throw new InvalidOperationException(),
                };
            }
            case "xc.strDateTime": return XmlConvert.ToString(D(a, 0), (XmlDateTimeSerializationMode)I(a, 2));
            case "xc.strDateTimeFmt": return XmlConvert.ToString(D(a, 0), S(a, 2));
            case "xc.strTimeSpan": return XmlConvert.ToString(new TimeSpan(L(a, 0)));
            case "xc.strGuid": return XmlConvert.ToString(Guid.Parse(S(a, 0)));
            case "xc.verifyNCName": return XmlConvert.VerifyNCName(SN(a, 0)!);
            case "xc.verifyName": return XmlConvert.VerifyName(SN(a, 0)!);
            case "xc.verifyNMTOKEN": return XmlConvert.VerifyNMTOKEN(SN(a, 0)!);
            case "xc.verifyTOKEN": return XmlConvert.VerifyTOKEN(SN(a, 0)) ?? "#null";
            case "xc.encodeName": return XmlConvert.EncodeName(SN(a, 0)) ?? "#null";
            case "xc.encodeLocalName": return XmlConvert.EncodeLocalName(SN(a, 0)) ?? "#null";
            case "xc.encodeNmToken": return XmlConvert.EncodeNmToken(SN(a, 0)) ?? "#null";
            case "xc.decodeName": return XmlConvert.DecodeName(SN(a, 0)) ?? "#null";

            // ---------------- Convert / Encoding ----------------
            case "b64.enc": return Convert.ToBase64String(Encoding.UTF8.GetBytes(S(a, 0)));
            case "b64.encHex": return Convert.ToBase64String(Convert.FromHexString(S(a, 0)));
            case "b64.dec":
            {
                var bytes = Convert.FromBase64String(S(a, 0));
                return Hex(bytes) + "|" + Encoding.UTF8.GetString(bytes);
            }
            case "utf8.enc": return Hex(Encoding.UTF8.GetBytes(S(a, 0)));
            case "utf8.encU16":
            {
                // the string is given as UTF-16 code units (4 hex digits each): lone surrogates cannot travel in JSON
                var h = S(a, 0);
                var chars = new char[h.Length / 4];
                for (int i = 0; i < chars.Length; i++) chars[i] = (char)Convert.ToUInt16(h.Substring(i * 4, 4), 16);
                return Hex(Encoding.UTF8.GetBytes(new string(chars)));
            }
            case "utf8.dec": return Encoding.UTF8.GetString(Convert.FromHexString(S(a, 0)));

            default:
                throw new InvalidOperationException("unknown fn " + fn);
        }
    }
}
