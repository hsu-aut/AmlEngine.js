using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using System.Xml.Schema;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Schema;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// Coverage work package "values": typed attribute values (AttributeTypeType, CaexValue,
/// XmlTypeCodeExtensions, the name encoders, constraints, RefSemantic). Runs the cases of
/// scripts/gen-values.mjs and writes one list of result strings per case; the JS runner
/// test/engine/values.oracle.test.ts records the same strings. Keep both in sync.
///   values &lt;cases.json&gt; &lt;corpusDir&gt; &lt;out.json&gt;
/// Value formats: Ty = CLR type name + ":" + invariant ToString (DateTime "o", TimeSpan "c", Uri
/// original|ToString|absolute, byte[] hex); Lo = the same with the JS value category only
/// (n: every primitive number as double "R", i: long/ulong, d: decimal, ...), for values whose CLR
/// type the JS port does not keep. Times of day within the execution window of a case ("now")
/// are replaced by NOW in both runners.
/// </summary>
public static class ValuesOracle
{
    static readonly CultureInfo Inv = CultureInfo.InvariantCulture;
    static readonly Assembly Engine = typeof(CaexValue).Assembly;

    public static void Run(string[] args)
    {
        if (args[0] == "--dtfi") { DumpCulture(args[1]); return; }
        var cases = JsonNode.Parse(File.ReadAllText(args[0]))!.AsArray();
        var corpusDir = args[1];
        var results = new JsonArray();
        foreach (var c in cases)
        {
            var o = c!.AsObject();
            var t0 = DateTime.Now;
            CaseStart = t0;
            List<string> r;
            try { r = Case(o, corpusDir); }
            catch (Exception e) { r = new List<string> { "!!" + e.GetType().Name + ":" + e.Message }; }
            var t1 = DateTime.Now;
            foreach (var d in Docs) d.Unload();
            Docs.Clear();
            var arr = new JsonArray();
            foreach (var s in r) arr.Add(Canon(s, t0, t1));
            results.Add(arr);
        }
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[2]))!);
        var opts = new JsonSerializerOptions { WriteIndented = false, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        File.WriteAllText(args[2], results.ToJsonString(opts));
    }

    /// <summary>The DateTimeFormatInfo data DateTime.Parse uses for a culture (the de-DE fallback of GetDateTime).</summary>
    static void DumpCulture(string name)
    {
        var dtfi = CultureInfo.CreateSpecificCulture(name).DateTimeFormat;
        var flags = BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public;
        Console.WriteLine("DateSeparator=" + dtfi.DateSeparator + "|TimeSeparator=" + dtfi.TimeSeparator + "|AM=" + dtfi.AMDesignator + "|PM=" + dtfi.PMDesignator);
        Console.WriteLine("ShortDate=" + dtfi.ShortDatePattern + "|LongDate=" + dtfi.LongDatePattern + "|MonthDay=" + dtfi.MonthDayPattern + "|YearMonth=" + dtfi.YearMonthPattern + "|ShortTime=" + dtfi.ShortTimePattern + "|LongTime=" + dtfi.LongTimePattern);
        Console.WriteLine("Months=" + string.Join(",", dtfi.MonthNames) + "|Abbrev=" + string.Join(",", dtfi.AbbreviatedMonthNames));
        Console.WriteLine("Genitive=" + string.Join(",", dtfi.MonthGenitiveNames) + "|AbbrevGenitive=" + string.Join(",", dtfi.AbbreviatedMonthGenitiveNames));
        Console.WriteLine("Days=" + string.Join(",", dtfi.DayNames) + "|Abbrev=" + string.Join(",", dtfi.AbbreviatedDayNames));
        Console.WriteLine("Eras=" + string.Join(",", dtfi.Calendar.Eras.Select(e => dtfi.GetEraName(e) + "/" + dtfi.GetAbbreviatedEraName(e))));
        Console.WriteLine("TwoDigitYearMax=" + dtfi.Calendar.TwoDigitYearMax + "|Calendar=" + dtfi.Calendar.GetType().Name);
        Console.WriteLine("FormatFlags=" + typeof(DateTimeFormatInfo).GetProperty("FormatFlags", flags)!.GetValue(dtfi));
        var scannerType = typeof(DateTimeFormatInfo).Assembly.GetType("System.Globalization.DateTimeFormatInfoScanner")!;
        var scanner = Activator.CreateInstance(scannerType, true)!;
        var words = (string[]?)scannerType.GetMethod("GetDateWordsOfDTFI", flags)!.Invoke(scanner, new object[] { dtfi });
        Console.WriteLine("DateWords=" + (words == null ? "null" : string.Join("|", words.Select(w => "[" + w + "]"))));
        foreach (var p in new[] { "HasForceTwoDigitYears", "HasSpacesInMonthNames", "HasSpacesInDayNames", "HasYearMonthAdjustment" })
            Console.WriteLine(p + "=" + typeof(DateTimeFormatInfo).GetProperty(p, flags)?.GetValue(dtfi));
        Console.WriteLine("LanguageName=" + typeof(DateTimeFormatInfo).GetProperty("LanguageName", flags)?.GetValue(dtfi));
    }

    static DateTime CaseStart;

    /// <summary>A DateTime.Now default of a failed decoding (taken while the current case runs).</summary>
    static bool IsNow(object? v) => v is DateTime d && d.Kind == DateTimeKind.Local && d >= CaseStart && d <= DateTime.Now;

    /// <summary>Comparisons of two "now" values depend on the clock resolution; both runners record "now".</summary>
    static string NowOr(bool bothNow, Func<string> f) => bothNow ? "now" : f();

    /// <summary>
    /// A "now" value against a time of today (time-only input): the result depends only on the
    /// clock at run time, so it is recorded as "now" like two "now" values.
    /// </summary>
    static bool ClockDependent(object? a, object? b) =>
        (IsNow(a) && IsToday(b)) || (IsNow(b) && IsToday(a));

    static bool IsToday(object? v) => v is DateTime d && d.Date == DateTime.Today;

    static readonly Regex TimeRx = new(@"(\d{2}):(\d{2}):(\d{2})(\.\d{1,7})?", RegexOptions.CultureInvariant);

    /// <summary>Times of day between t0 and t1 (whole seconds, one second of slack) become NOW.</summary>
    static string Canon(string s, DateTime t0, DateTime t1)
    {
        var a = Math.Floor(t0.TimeOfDay.TotalSeconds) - 1;
        var b = Math.Floor(t1.TimeOfDay.TotalSeconds) + 1;
        return TimeRx.Replace(s, m =>
        {
            var sec = int.Parse(m.Groups[1].Value) * 3600 + int.Parse(m.Groups[2].Value) * 60 + int.Parse(m.Groups[3].Value);
            return sec >= a && sec <= b ? "NOW" : m.Value;
        });
    }

    // ------------------------------------------------------------------ formatting

    static string N(string? s) => s ?? "~";

    static string B(bool b) => b ? "1" : "0";

    static string Try(Func<string?> f)
    {
        try { return f() ?? "null"; }
        catch (Exception e) { return "!" + e.GetType().Name; }
    }

    static string TryM(Func<string?> f)
    {
        try { return f() ?? "null"; }
        catch (NullReferenceException) { return "!NullReferenceException"; } // JS TypeError messages differ
        catch (Exception e) { return "!" + e.GetType().Name + ":" + e.Message; }
    }

    static string UriS(Uri u) => u.OriginalString + "|" + Try(() => u.ToString()) + "|" + B(u.IsAbsoluteUri);

    /// <summary>A value with its CLR type.</summary>
    static string Ty(object? v) => v switch
    {
        null => "null",
        string s => "String:" + s,
        bool b => "Boolean:" + b,
        DateTime d => "DateTime:" + d.ToString("o", Inv),
        TimeSpan t => "TimeSpan:" + t.ToString("c", Inv),
        Uri u => "Uri:" + UriS(u),
        byte[] bytes => "Byte[]:" + Convert.ToHexString(bytes),
        IFormattable f => v.GetType().Name + ":" + f.ToString(null, Inv),
        _ => v.GetType().Name + ":" + v,
    };

    /// <summary>A value with its JS value category only.</summary>
    static string Lo(object? v) => v switch
    {
        null => "null",
        string s => "s:" + s,
        bool b => "b:" + b,
        sbyte or byte or short or ushort or int or uint or float or double => "n:" + Convert.ToDouble(v, Inv).ToString("R", Inv),
        long or ulong => "i:" + ((IFormattable)v).ToString(null, Inv),
        decimal d => "d:" + d.ToString(Inv),
        DateTime d => "dt:" + d.ToString("o", Inv),
        TimeSpan t => "ts:" + t.ToString("c", Inv),
        Uri u => "u:" + UriS(u),
        _ => "o:" + Ty(v),
    };

    static string Dbl(double d) => d.ToString("R", Inv);

    // ------------------------------------------------------------------ inputs

    static string? Str(JsonObject o, string key) => o[key]?.GetValue<string>();

    static readonly Dictionary<string, Type?> Types = new()
    {
        ["String"] = typeof(string), ["Boolean"] = typeof(bool), ["SByte"] = typeof(sbyte), ["Byte"] = typeof(byte),
        ["Int16"] = typeof(short), ["UInt16"] = typeof(ushort), ["Int32"] = typeof(int), ["UInt32"] = typeof(uint),
        ["Int64"] = typeof(long), ["UInt64"] = typeof(ulong), ["Single"] = typeof(float), ["Double"] = typeof(double),
        ["Decimal"] = typeof(decimal), ["DateTime"] = typeof(DateTime), ["TimeSpan"] = typeof(TimeSpan), ["Uri"] = typeof(Uri),
        ["ByteArray"] = typeof(byte[]), ["StringArray"] = typeof(string[]), ["ObjectArray"] = typeof(object[]), ["Guid"] = typeof(Guid),
        ["Object"] = typeof(object), ["XmlQualifiedName"] = typeof(XmlQualifiedName), ["Null"] = null,
    };

    /// <summary>A CLR value from its JSON description (see CLR in scripts/gen-values.mjs).</summary>
    static object? Clr(JsonObject o)
    {
        var v = Str(o, "v");
        return Str(o, "t") switch
        {
            "Null" => null,
            "String" => v,
            "Boolean" => bool.Parse(v!),
            "SByte" => sbyte.Parse(v!, Inv),
            "Byte" => byte.Parse(v!, Inv),
            "Int16" => short.Parse(v!, Inv),
            "UInt16" => ushort.Parse(v!, Inv),
            "Int32" => int.Parse(v!, Inv),
            "UInt32" => uint.Parse(v!, Inv),
            "Int64" => long.Parse(v!, Inv),
            "UInt64" => ulong.Parse(v!, Inv),
            "Single" => float.Parse(v!, NumberStyles.Float, Inv),
            "Double" => double.Parse(v!, NumberStyles.Float, Inv),
            "Decimal" => decimal.Parse(v!, NumberStyles.Float, Inv),
            "DateTime" => new DateTime(long.Parse(v!, Inv), (DateTimeKind)o["k"]!.GetValue<int>()),
            "TimeSpan" => new TimeSpan(long.Parse(v!, Inv)),
            "Uri" => new Uri(v!, (UriKind)o["k"]!.GetValue<int>()),
            "ByteArray" => Convert.FromHexString(v!),
            "StringArray" => o["a"]!.AsArray().Select(x => x!.GetValue<string>()).ToArray(),
            "Guid" => Guid.Parse(v!),
            var t => throw new ArgumentException(t),
        };
    }

    /// <summary>Documents of the current case, unloaded after it (keeps the document table small).</summary>
    static readonly List<CAEXDocument> Docs = new();

    static CAEXDocument NewDoc(string s)
    {
        var doc = CAEXDocument.New_CAEXDocument(s == "30" ? CAEXDocument.CAEXSchema.CAEX3_0 : CAEXDocument.CAEXSchema.CAEX2_15);
        Docs.Add(doc);
        return doc;
    }

    static InternalElementType NewIE(CAEXDocument doc) =>
        doc.CAEXFile.InstanceHierarchy.Append("IH").InternalElement.Append("IE");

    /// <summary>The attribute under test: an Attribute of an IE, an AttributeType of a library or a nested Attribute.</summary>
    static AttributeTypeType Host(CAEXDocument doc, string? h)
    {
        switch (h)
        {
            case "at":
                return doc.CAEXFile.AttributeTypeLib.Append("L").AttributeType.Append("A");
            case "nested":
                return NewIE(doc).Attribute.Append("A").Attribute.Append("B");
            default:
                return NewIE(doc).Attribute.Append("A");
        }
    }

    static string NodeText(AttributeTypeType a) => a.Node.ToString(SaveOptions.DisableFormatting);

    // ------------------------------------------------------------------ cases

    static List<string> Case(JsonObject c, string corpusDir)
    {
        return Str(c, "k") switch
        {
            "raw" => Raw(c),
            "set" => Set(c),
            "cmp" => Cmp(c),
            "static" => Static(c),
            "enc" => Enc(c),
            "setdbl" => SetDbl(c),
            "setdt" => SetDt(c),
            "sadt" => Sadt(c),
            "props" => Props(c),
            "cons" => Cons(c),
            "sem" => Sem(c),
            "cmpr" => Cmpr(c),
            "corpus" => Corpus(c, corpusDir),
            var k => throw new ArgumentException(k),
        };
    }

    static readonly XmlDateTimeSerializationMode[] Modes =
    {
        XmlDateTimeSerializationMode.Local, XmlDateTimeSerializationMode.Utc,
        XmlDateTimeSerializationMode.Unspecified, XmlDateTimeSerializationMode.RoundtripKind,
    };

    /// <summary>Predicates of a CaexValue: binary, datetime, numericOrBoolean, numeric, partOfDate, string.</summary>
    static string Preds(CaexValue cv) =>
        B(cv.IsBinaryValue()) + B(cv.IsDateTimeType()) + B(cv.IsNumericOrBooleanValue()) + B(cv.IsNumericValue()) + B(cv.IsPartOfDateValue()) + B(cv.IsStringValue());

    static List<string> Raw(JsonObject c)
    {
        var doc = NewDoc(Str(c, "s")!);
        var a = Host(doc, Str(c, "h"));
        var dt = Str(c, "dt");
        var v = Str(c, "v");
        var r = new List<string>();
        if (dt != null) r.Add(Try(() => { a.AttributeDataType = dt; return "ok"; }));
        r.Add(Try(() => { a.Value = v; return "ok"; }));
        r.Add(Try(() => { a.DefaultValue = Str(c, "dv"); return "ok"; }));
        r.Add("dt=" + N(a.AttributeDataType));
        r.Add(N(a.Value));
        r.Add(N(a.DefaultValue));
        r.Add(Try(() => Ty(a.AttributeValue)));
        r.Add(Try(() => Lo(a.AttributeValue)));
        r.Add(Try(() => Ty(a.DefaultAttributeValue)));
        r.Add(Try(() => Ty(a["Value"])));
        r.Add(Try(() => Ty(a["DefaultValue"])));
        r.Add(Try(() => Ty(a["Other"])));
        r.Add(a.GetCaexValue("Other") == null ? "nocv" : "cv");
        var cv = a.GetCaexValue("Value");
        var dcv = a.GetCaexValue("DefaultValue");
        r.Add(cv.TypeCodeOfAttribute.ToString());
        r.Add(N(cv.TypeAttribute?.Value));
        r.Add(Try(() => cv.FriendlyValueString));
        r.Add(Try(() => dcv.FriendlyValueString));
        r.Add(Preds(cv));
        r.Add(TryM(() => cv.IsValidStringValue(v)));
        r.Add(TryM(() => cv.IsValidStringValue(Str(c, "dv"))));
        r.Add(Try(() => Lo(cv.DefaultValue)));
        r.Add(N(cv.ValueElement?.Value));
        r.Add(N(dcv.ValueElement?.Value));
        var vNow = IsNow(cv.Value);
        var both = (vNow && IsNow(dcv.Value)) || ClockDependent(cv.Value, dcv.Value);
        r.Add(NowOr(both, () => Try(() => B(cv.Equals(dcv)))));
        r.Add(NowOr(both, () => Try(() => B(dcv.Equals(cv)))));
        r.Add(NowOr(both, () => Try(() => cv.CompareTo(dcv).ToString(Inv))));
        r.Add(NowOr(both, () => Try(() => dcv.CompareTo(cv).ToString(Inv))));
        r.Add(Try(() => cv.CompareTo(null).ToString(Inv)));
        r.Add(Try(() => cv.CompareTo("x").ToString(Inv)));
        r.Add(Try(() => B(cv.Equals(null))));
        r.Add(NowOr(vNow, () => Try(() => B(cv.Equals(cv)))));
        r.Add(Try(() => Dbl(a.GetDouble())));
        r.Add(Try(() => a.TryGetDouble(out var d) + "|" + Dbl(d)));
        foreach (var mode in Modes)
        {
            r.Add(Try(() => a.GetDateTime(mode).ToString("o", Inv)));
            r.Add(Try(() => a.TryGetDateTime(mode, out var d) + "|" + d.ToString("o", Inv)));
        }
        r.Add(a.TypeCodeOfAttribute().ToString());
        r.Add(B(a.IsPartOfDateValue()) + B(a.IsNumericDataType()) + B(a.IsBooleanDataType()) + B(a.IsStringDataType()) + B(a.IsDateTimeType()));
        r.Add(CaexValue.TypeCode(dt).ToString());
        r.Add(Try(() => dt!.XmlTypeCodeFromSchemaType().ToString()));
        r.Add(Try(() => AttributeTypeType.XmlTypeToClrType(dt).FullName));
        r.Add(a.ValueAttributes.Count.ToString(Inv));
        r.Add(B(ReferenceEquals(a.ValueAttributes, a.ValueAttributes)));
        r.Add(B(ReferenceEquals(a.AttributeTypeDefiningAttribute, a)));
        r.Add(NodeText(a));
        return r;
    }

    static void Apply(AttributeTypeType a, string tgt, object? val)
    {
        switch (tgt)
        {
            case "av": a.AttributeValue = val; break;
            case "dav": a.DefaultAttributeValue = val; break;
            case "iv": a["Value"] = val; break;
            case "idv": a["DefaultValue"] = val; break;
            case "iother": a["Other"] = val; break;
            case "cv": a.GetCaexValue("Value").Value = val; break;
            case "cdv": a.GetCaexValue("DefaultValue").Value = val; break;
            default: throw new ArgumentException(tgt);
        }
    }

    static List<string> Set(JsonObject c)
    {
        var doc = NewDoc(Str(c, "s")!);
        var a = Host(doc, Str(c, "h"));
        var dt = Str(c, "dt");
        var r = new List<string>();
        if (dt != null) a.AttributeDataType = dt;
        foreach (var op in c["ops"]!.AsArray())
        {
            var val = Clr(op!["val"]!.AsObject());
            r.Add(Try(() => { Apply(a, Str(op.AsObject(), "tgt")!, val); return "ok"; }));
            r.Add("dt=" + N(a.AttributeDataType));
            r.Add(N(a.Value));
            r.Add(N(a.DefaultValue));
            r.Add(Try(() => Ty(a.AttributeValue)));
            r.Add(Try(() => Ty(a.DefaultAttributeValue)));
            r.Add(NodeText(a));
        }
        return r;
    }

    static List<string> Cmp(JsonObject c)
    {
        var doc = NewDoc(Str(c, "s")!);
        var ie = NewIE(doc);
        var a = ie.Attribute.Append("A");
        var b = ie.Attribute.Append("B");
        var r = new List<string>();
        foreach (var (x, key) in new[] { (a, "a"), (b, "b") })
        {
            var d = c[key]!.AsObject();
            if (Str(d, "dt") != null) x.AttributeDataType = Str(d, "dt");
            x.Value = Str(d, "v");
        }
        var ca = a.GetCaexValue("Value");
        var cb = b.GetCaexValue("Value");
        r.Add(Try(() => Ty(a.AttributeValue)) + "|" + Try(() => Ty(b.AttributeValue)));
        var both = (IsNow(ca.Value) && IsNow(cb.Value)) || ClockDependent(ca.Value, cb.Value);
        r.Add(NowOr(both, () => TryM(() => ca.CompareTo(cb).ToString(Inv))));
        r.Add(NowOr(both, () => TryM(() => cb.CompareTo(ca).ToString(Inv))));
        r.Add(NowOr(both, () => Try(() => B(ca.Equals(cb)))));
        r.Add(NowOr(both, () => Try(() => B(cb.Equals(ca)))));
        r.Add(NowOr(both, () => Try(() => ca.Equals(cb) ? B(ca.GetHashCode() == cb.GetHashCode()) : "-")));
        return r;
    }

    static List<string> Static(JsonObject c)
    {
        var r = new List<string>();
        foreach (var t in c["types"]!.AsArray())
        {
            var type = Types[t!.GetValue<string>()];
            r.Add(Try(() => AttributeTypeType.ClrToXmlType(type!)));
        }
        foreach (var d in c["dts"]!.AsArray())
        {
            var dt = d?.GetValue<string>();
            r.Add(Try(() => AttributeTypeType.XmlTypeToClrType(dt).FullName));
            r.Add(Try(() => dt!.XmlTypeCodeFromSchemaType().ToString()));
            r.Add(CaexValue.TypeCode(dt).ToString());
        }
        for (var i = 0; i <= 54; i++)
        {
            var tc = (XmlTypeCode)i;
            r.Add(tc + "|" + tc.AttributeType().FullName + "|" + Try(() => Lo(tc.DefaultDecodedValue())) + "|" + Try(() => tc.DefaultEncodedValue())
#pragma warning disable CS0618
                + "|" + Try(() => Lo(tc.Default())));
#pragma warning restore CS0618
        }
        r.Add(string.Join("|", AttributeTypeType.XsdDataTypes));
        return r;
    }

    static List<string> Enc(JsonObject c)
    {
        var type = Engine.GetType("Aml.Engine.CAEX.Extensions." + Str(c, "enc"), true)!;
        var enc = Activator.CreateInstance(type, nonPublic: true)!;
        var encode = type.GetMethod("Encode", BindingFlags.Instance | BindingFlags.NonPublic)!;
        var isValid = type.GetMethod("IsValid", BindingFlags.Instance | BindingFlags.NonPublic)!;
        var r = new List<string>();
        foreach (var s in c["strs"]!.AsArray())
        {
            var str = s?.GetValue<string>();
            r.Add(Try(() => (string?)Invoke(encode, enc, str)));
            r.Add(TryM(() =>
            {
                var args = new object?[] { str, null };
                var ok = (bool)Invoke(isValid, enc, args)!;
                return B(ok) + "|" + N((string?)args[1]);
            }));
        }
        return r;
    }

    static object? Invoke(MethodInfo m, object target, params object?[] args)
    {
        try { return m.Invoke(target, args); }
        catch (TargetInvocationException e) when (e.InnerException != null) { throw e.InnerException; }
    }

    static List<string> ReadBack(AttributeTypeType a)
    {
        var r = new List<string> { "dt=" + N(a.AttributeDataType), N(a.Value), Try(() => Ty(a.AttributeValue)), Try(() => Dbl(a.GetDouble())) };
        foreach (var mode in Modes) r.Add(Try(() => a.GetDateTime(mode).ToString("o", Inv)));
        return r;
    }

    static List<string> SetDbl(JsonObject c)
    {
        var a = Host(NewDoc(Str(c, "s")!), "attr");
        a.SetDouble(double.Parse(Str(c, "v")!, NumberStyles.Float, Inv));
        return ReadBack(a);
    }

    static List<string> SetDt(JsonObject c)
    {
        var a = Host(NewDoc(Str(c, "s")!), "attr");
        var r = new List<string>();
        r.Add(Try(() => { a.SetDateTime((DateTime)Clr(c["val"]!.AsObject())!, (XmlDateTimeSerializationMode)c["mode"]!.GetValue<int>()); return "ok"; }));
        r.AddRange(ReadBack(a));
        return r;
    }

    static List<string> Sadt(JsonObject c)
    {
        var a = Host(NewDoc(Str(c, "s")!), "attr");
        if (Str(c, "dt") != null) a.AttributeDataType = Str(c, "dt");
        var r = new List<string>();
        if (c["type"] != null) r.Add(Try(() => { a.SetAttributeDataType(Types[Str(c, "type")!]!); return "ok"; }));
        else r.Add(Try(() => { a.SetAttributeDataType((object)Clr(c["val"]!.AsObject())!); return "ok"; }));
        r.Add("dt=" + N(a.AttributeDataType));
        r.Add(NodeText(a));
        return r;
    }

    static List<string> Props(JsonObject c)
    {
        var a = Host(NewDoc(Str(c, "s")!), Str(c, "h"));
        var r = new List<string>();
        var changed = new List<string>();
        a.PropertyChanged += (_, e) => changed.Add(e.PropertyName ?? "~");
        foreach (var op in c["ops"]!.AsArray())
        {
            var v = Str(op!.AsObject(), "v");
            var p = Str(op.AsObject(), "p");
            r.Add(p + ":" + Try(() =>
            {
                switch (p)
                {
                    case "Unit": a.Unit = v; return N(a.Unit);
                    case "RefAttributeType": a.RefAttributeType = v; return N(a.RefAttributeType);
                    case "AttributeDataType": a.AttributeDataType = v; return N(a.AttributeDataType);
                    case "Value": a.Value = v; return N(a.Value);
                    default: a.DefaultValue = v; return N(a.DefaultValue);
                }
            }));
            r.Add(string.Join(",", changed));
            changed.Clear();
            r.Add(NodeText(a));
        }
        return r;
    }

    static string Vals(List<CaexValue> vals) => string.Join(";", vals.Select(v => Try(() => Ty(v.Value)) + "/" + N(v.ValueElement?.Value)));

    static List<string> Cons(JsonObject c)
    {
        var a = Host(NewDoc(Str(c, "s")!), Str(c, "h"));
        if (Str(c, "dt") != null) a.AttributeDataType = Str(c, "dt");
        var r = new List<string>();
        var c1 = a.Constraint.Append(("Name", "C1"));
        r.Add(N(c1.Name));
        var nom = c1.New_NominalType();
        r.Add(nom == null ? "null" : "nom");
        foreach (var raw in c["nominal"]!.AsArray()) nom.RequiredValue.Append(raw!.GetValue<string>());
        r.Add(N(nom.AttributeDataType) + "|" + B(ReferenceEquals(nom.AttributeTypeDefiningAttribute?.Node, a.Node)));
        r.Add(string.Join(";", nom.RequiredValue));
        r.Add(Vals(nom.ValueAttributes));
        foreach (var raw in c["nominal"]!.AsArray()) r.Add(Try(() => Ty(nom[raw!.GetValue<string>()])));
        foreach (var ns in c["nomSet"]!.AsArray())
        {
            var key = Str(ns!.AsObject(), "key")!;
            var val = Clr(ns["val"]!.AsObject());
            r.Add(Try(() => { nom[key] = val; return "ok"; }));
            r.Add(string.Join(";", nom.RequiredValue));
        }
        r.Add(Try(() => Ty(nom["nothing"])));
        r.Add(TryM(() => c1.New_OrdinalType() == null ? "null" : "ord"));
        r.Add(TryM(() => c1.New_UnknownType() == null ? "null" : "unk"));
        r.Add(TryM(() => c1.New_NominalType() == null ? "null" : "nom"));
        r.Add(B(c1.NominalScaledType.Exists) + B(c1.OrdinalScaledType.Exists) + B(c1.UnknownType.Exists));

        var c2 = a.Constraint.Append(("Name", "C2"));
        var ord = c2.New_OrdinalType();
        var o = c["ord"]!.AsObject();
        ord.RequiredMinValue = Str(o, "min");
        ord.RequiredMaxValue = Str(o, "max");
        ord.RequiredValue = Str(o, "req");
        r.Add(N(ord.RequiredMinValue) + "|" + N(ord.RequiredMaxValue) + "|" + N(ord.RequiredValue) + "|" + N(ord.AttributeDataType));
        r.Add(Vals(ord.ValueAttributes));
        foreach (var name in new[] { "RequiredValue", "RequiredMinValue", "RequiredMaxValue", "Other" }) r.Add(Try(() => Ty(ord[name])));
        foreach (var os in c["ordSet"]!.AsArray())
        {
            var name = Str(os!.AsObject(), "name")!;
            var val = Clr(os["val"]!.AsObject());
            r.Add(Try(() => { ord[name] = val; return "ok"; }));
            r.Add(N(ord.RequiredMinValue) + "|" + N(ord.RequiredMaxValue) + "|" + N(ord.RequiredValue));
            r.Add(Vals(ord.ValueAttributes));
        }

        var c3 = a.Constraint.Append(("Name", "C3"));
        var unk = c3.New_UnknownType();
        unk.Requirements = Str(c, "unknown");
        r.Add(N(unk.Requirements));
        var second = Str(c, "second");
        r.Add(TryM(() => (second == "nominal" ? c3.New_NominalType() : second == "ordinal" ? (object?)c3.New_OrdinalType() : c3.New_UnknownType()) == null ? "null" : "x"));
        r.Add(string.Join(",", a.Constraint.Select(x => N(x.Name))));
        r.Add(NodeText(a));
        return r;
    }

    static List<string> Sem(JsonObject c)
    {
        var a = Host(NewDoc(Str(c, "s")!), Str(c, "h"));
        var r = new List<string>();
        foreach (var op in c["ops"]!.AsArray())
        {
            var v = Str(op!.AsObject(), "v");
            r.Add(TryM(() => Str(op.AsObject(), "op") switch
            {
                "sem" => N(a.New_RefSemantic(v).CorrespondingAttributePath),
                "amlid" => N(a.New_AMLID(v).CorrespondingAttributePath),
                "has" => B(a.HasAMLID(v)),
                _ => SetPath(a, v),
            }));
        }
        r.Add(TryM(() => AttributeTypeTypeExtensions.New_RefSemantic(null!, "x").ToString()));
        r.Add(TryM(() => AttributeTypeTypeExtensions.New_AMLID(null!, "x").ToString()));
        r.Add(TryM(() => B(AttributeTypeTypeExtensions.HasAMLID(null!, "x"))));
        r.Add(string.Join(",", a.RefSemantic.Select(x => N(x.CorrespondingAttributePath))));
        r.Add(NodeText(a));
        return r;
    }

    /// <summary>Sets CorrespondingAttributePath of the first RefSemantic (or appends one).</summary>
    static string SetPath(AttributeTypeType a, string? v)
    {
        var rs = a.RefSemantic.FirstOrDefault() ?? a.RefSemantic.Append();
        rs.CorrespondingAttributePath = v;
        return N(rs.CorrespondingAttributePath);
    }

    static List<string> Cmpr(JsonObject c)
    {
        var type = Engine.GetType("Aml.Engine.CAEX.AttributeValueComparer", true)!;
        var cmp = Activator.CreateInstance(type, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic, null, new object[] { "Name" }, Inv)!;
        var eq = type.GetMethod("Equals", new[] { typeof(XElement), typeof(XElement) })!;
        var hash = type.GetMethod("GetHashCode", new[] { typeof(XElement) })!;
        var els = new List<XElement?> { null };
        foreach (var v in c["vals"]!.AsArray())
        {
            var e = new XElement("E");
            if (v != null) e.SetAttributeValue("Name", v.GetValue<string>());
            els.Add(e);
        }
        var r = new List<string>();
        foreach (var x in els)
            foreach (var y in els)
            {
                r.Add(Try(() =>
                {
                    var equal = (bool)Invoke(eq, cmp, x, y)!;
                    return B(equal) + (equal && x != null && y != null ? "|" + B((int)Invoke(hash, cmp, x)! == (int)Invoke(hash, cmp, y)!) : "");
                }));
            }
        r.Add(Try(() => Invoke(hash, cmp, (XElement?)null)!.ToString()));
        return r;
    }

    static List<string> Corpus(JsonObject c, string corpusDir)
    {
        var doc = CAEXDocument.LoadFromString(File.ReadAllText(System.IO.Path.Combine(corpusDir, Str(c, "file")!), Encoding.UTF8));
        var r = new List<string>();
        if (doc == null) { r.Add("nodoc"); return r; }
        Docs.Add(doc);
        var attrs = doc.XDocument.Root!.Descendants().Select(e => e.CreateCAEXWrapper()).OfType<AttributeTypeType>().ToList();
        foreach (var a in attrs)
        {
            var sb = new StringBuilder();
            sb.Append(N(a.Name)).Append('|').Append(N(a.AttributeDataType)).Append('|').Append(N(a.Value)).Append('|').Append(N(a.DefaultValue))
                .Append('|').Append(N(a.Unit)).Append('|').Append(N(a.RefAttributeType));
            r.Add(sb.ToString());
            r.Add(Try(() => Ty(a.AttributeValue)) + "|" + Try(() => Ty(a.DefaultAttributeValue)) + "|" + Try(() => a.GetCaexValue("Value").FriendlyValueString));
            r.Add(Try(() => B(a.IsOverridden)) + (a is AttributeType at ? "|" + Try(() => B(at.IsOverridden())) + "|" + Try(() => B(at.IsOverriddenDeleted())) : ""));
            r.Add(a.TypeCodeOfAttribute() + "|" + Try(() => Dbl(a.GetDouble())) + "|" + Try(() => a.GetDateTime(XmlDateTimeSerializationMode.RoundtripKind).ToString("o", Inv)));
            r.Add(string.Join(",", a.RefSemantic.Select(x => N(x.CorrespondingAttributePath))));
            foreach (var cons in a.Constraint)
            {
                var line = N(cons.Name) + ":";
                if (cons.NominalScaledType.Exists) line += "N[" + Try(() => Vals(cons.NominalScaledType.ValueAttributes)) + "]";
                if (cons.OrdinalScaledType.Exists) line += "O[" + Try(() => Vals(cons.OrdinalScaledType.ValueAttributes)) + "]";
                if (cons.UnknownType.Exists) line += "U[" + N(cons.UnknownType.Requirements) + "]";
                r.Add(line);
            }
        }
        return r;
    }
}
