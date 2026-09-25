using System.Globalization;
using System.Reflection;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml;
using System.Xml.Linq;

namespace Oracle;

/// <summary>
/// Coverage gap package "gapsinfra": the .NET substitutes in src/xml and src/system.
///   gapsinfra &lt;cases.json&gt; &lt;out.json&gt;
/// Cases (scripts/gen-gapsinfra.mjs): [{ area, fn, args }], output [{ ok } | { err }].
/// test/engine/gapsinfra.oracle.test.ts evaluates the same cases with the port; both sides must
/// produce identical strings. Representations:
///   XObject  D (document), E{name}, T{text}, C{cdata}, M{comment}, P{target} {data},
///            Y{name},{pub},{sys},{subset} (~ for null), A{name}={value}; lists "[x;y]".
///   Linq     result " #" source log (s0.. per yielded source item, s$ at the end; o.. for the
///            second source; "q" when the query object has been built and is about to be run).
/// </summary>
public static class GapsInfraOracle
{
    public static void Run(string[] args)
    {
        var cases = JsonNode.Parse(File.ReadAllText(args[0]))!.AsArray();
        var results = new JsonArray();
        foreach (var c in cases)
        {
            var fn = c!["fn"]!.GetValue<string>();
            var a = c["args"]!.AsArray();
            JsonObject r;
            try { r = new JsonObject { ["ok"] = Eval(fn, a) }; }
            catch (Exception e) { r = new JsonObject { ["err"] = e.GetType().Name }; }
            results.Add(r);
        }
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[1]))!);
        var opts = new JsonSerializerOptions { WriteIndented = false, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        File.WriteAllText(args[1], results.ToJsonString(opts));
    }

    static string S(JsonNode? n) => n!.GetValue<string>();
    static string? SN(JsonNode? n) => n?.GetValue<string>();
    static string B(bool b) => b ? "True" : "False";
    static string Hex(byte[] b) => Convert.ToHexString(b).ToLowerInvariant();
    static string R(double v) => v.ToString("R", CultureInfo.InvariantCulture);

    static string Eval(string fn, JsonArray a)
    {
        switch (fn)
        {
            // ------------------------------------------------------------------ XLinq
            case "x.script": return Script(SN(a[0]), a[1]!.GetValue<bool>(), a[2]!.AsArray());
            case "x.parse":
            {
                var doc = XDocument.Parse(S(a[0]), a[1]!.GetValue<bool>() ? LoadOptions.PreserveWhitespace : LoadOptions.None);
                return (doc.Declaration?.ToString() ?? "null") + "|" + doc.ToString(SaveOptions.DisableFormatting) + "|" + Desc(doc.DocumentType);
            }
            case "x.isName":
                try { XmlConvert.VerifyName(S(a[0])); return "True"; }
                catch (XmlException) { return "False"; }
                catch (ArgumentException) { return "False"; }
            case "x.isWs": return B(XmlConvert.IsWhitespaceChar(S(a[0])[0]));
            case "x.name":
            {
                var n = XName.Get(S(a[0]));
                return $"{n}|{n.NamespaceName}|{n.LocalName}|{n.Namespace}";
            }
            case "x.charType":
            {
                var t = typeof(XmlConvert).Assembly.GetType("System.Xml.XmlCharType")!;
                var m = t.GetMethod(S(a[0]), BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic, new[] { typeof(char) })!;
                var sb = new StringBuilder();
                int start = -1;
                for (int c = 0; c <= 0x10000; c++)
                {
                    bool v = c < 0x10000 && (bool)m.Invoke(null, new object[] { (char)c })!;
                    if (v && start < 0) start = c;
                    if (!v && start >= 0) { sb.Append($"{start:x}-{c - 1:x},"); start = -1; }
                }
                return sb.ToString();
            }

            // ------------------------------------------------------------------ encodings
            case "enc.load":
            {
                using var reader = XmlReader.Create(new MemoryStream(Convert.FromHexString(S(a[0]))),
                    new XmlReaderSettings { IgnoreComments = false, IgnoreWhitespace = true });
                var doc = XDocument.Load(reader, LoadOptions.PreserveWhitespace);
                return (doc.Declaration?.ToString() ?? "null") + "|" + doc.ToString(SaveOptions.DisableFormatting);
            }
            case "enc.save":
            {
                var doc = XDocument.Parse(S(a[0]), LoadOptions.PreserveWhitespace);
                var ms = new MemoryStream();
                doc.Save(ms, a[1]!.GetValue<bool>() ? SaveOptions.DisableFormatting : SaveOptions.None);
                return Hex(ms.ToArray());
            }
            case "enc.saveDecl":
            {
                var doc = XDocument.Parse(S(a[0]), LoadOptions.PreserveWhitespace);
                doc.Declaration = new XDeclaration(SN(a[1]), SN(a[2]), SN(a[3]));
                var ms = new MemoryStream();
                doc.Save(ms, a[4]!.GetValue<bool>() ? SaveOptions.DisableFormatting : SaveOptions.None);
                return Hex(ms.ToArray());
            }
            case "enc.get":
            {
                var e = Encoding.GetEncoding(S(a[0]));
                return e.WebName + "|" + Hex(e.GetPreamble());
            }

            // ------------------------------------------------------------------ System.Linq
            case "linq": return Linq(a);
            case "hs":
            {
                var set = new HashSet<int>();
                var res = new List<string>();
                foreach (var op in a[0]!.AsArray())
                {
                    var o = op!.AsArray();
                    int v = o[1]!.GetValue<int>();
                    switch (S(o[0]))
                    {
                        case "add": res.Add(B(set.Add(v))); break;
                        case "remove": res.Add(B(set.Remove(v))); break;
                        case "contains": res.Add(B(set.Contains(v))); break;
                        case "count": res.Add(set.Count.ToString()); break;
                        case "clear": set.Clear(); res.Add("ok"); break;
                        case "list": res.Add("[" + string.Join(",", set) + "]"); break;
                    }
                }
                return string.Join(" ", res);
            }

            // ------------------------------------------------------------------ System types
            case "guid.eq":
            {
                var g = Guid.Parse(S(a[0]));
                object other = a[1] is null ? "x" : Guid.Parse(S(a[1]));
                return B(g.Equals(other)) + "|" + B(new HashSet<object> { g }.Contains(other));
            }
            case "guid.newShape":
            {
                var s = Guid.NewGuid().ToString();
                return $"{s.Length}|{s[14]}|{"89ab".Contains(s[19])}";
            }
            case "ts.cmp":
            {
                var t = new TimeSpan(long.Parse(S(a[0]), CultureInfo.InvariantCulture));
                if (a[1] is null) return B(t.Equals((object)"x"));
                var u = new TimeSpan(long.Parse(S(a[1]), CultureInfo.InvariantCulture));
                return $"{t.CompareTo(u)}|{B(t.Equals((object)u))}";
            }
            case "dec.set":
            {
                var x = decimal.Parse(S(a[0]), NumberStyles.Float, CultureInfo.InvariantCulture);
                var y = decimal.Parse(S(a[1]), NumberStyles.Float, CultureInfo.InvariantCulture);
                return B(x.Equals((object)y)) + "|" + B(new HashSet<object> { x }.Contains(y));
            }
            case "uri.set":
            {
                var x = new Uri(S(a[0]), UriKind.RelativeOrAbsolute);
                var y = new Uri(S(a[1]), UriKind.RelativeOrAbsolute);
                return B(x.Equals(y)) + "|" + B(new HashSet<Uri> { x }.Contains(y));
            }
            case "uri.prop":
            {
                var u = new Uri(S(a[0]), UriKind.RelativeOrAbsolute);
                return S(a[1]) switch
                {
                    "absolutePath" => u.AbsolutePath,
                    "absoluteUri" => u.AbsoluteUri,
                    "localPath" => u.LocalPath,
                    "authority" => u.Authority,
                    "host" => u.Host,
                    "port" => u.Port.ToString(),
                    "query" => u.Query,
                    "fragment" => u.Fragment,
                    "scheme" => u.Scheme,
                    "pathAndQuery" => u.PathAndQuery,
                    "isDefaultPort" => B(u.IsDefaultPort),
                    "isFile" => B(u.IsFile),
                    "isUnc" => B(u.IsUnc),
                    "userInfo" => u.UserInfo,
                    _ => throw new NotSupportedException(),
                };
            }
            case "dt.ambig":
            {
                var utc = new DateTime(long.Parse(S(a[0]), CultureInfo.InvariantCulture), DateTimeKind.Utc);
                var local = utc.ToLocalTime();
                var m = typeof(DateTime).GetMethod("IsAmbiguousDaylightSavingTime", BindingFlags.Instance | BindingFlags.NonPublic)!;
                return $"{B((bool)m.Invoke(local, null)!)}|{local.Ticks}|{local.ToUniversalTime().Ticks}";
            }
            case "xsd.dt":
            {
                var t = typeof(XmlConvert).Assembly.GetType("System.Xml.Schema.XsdDateTime")!;
                var flagsType = typeof(XmlConvert).Assembly.GetType("System.Xml.Schema.XsdDateTimeFlags")!;
                var ctor = t.GetConstructor(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic, new[] { typeof(string), flagsType })!;
                object x;
                try { x = ctor.Invoke(new[] { S(a[0]), Enum.ToObject(flagsType, a[1]!.GetValue<int>()) }); }
                catch (TargetInvocationException e) { throw e.InnerException!; }
                var conv = t.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)
                    .First(mi => mi.Name == "op_Implicit" && mi.ReturnType == typeof(DateTime));
                var d = (DateTime)conv.Invoke(null, new[] { x })!;
                var today = DateTime.Today;
                if (d.Year == today.Year) return $"Y+{d.Ticks - new DateTime(today.Year, 1, 1).Ticks}|{d.Kind}";
                return $"{d.Ticks}|{d.Kind}";
            }
            case "ts.parse": return TimeSpan.Parse(S(a[0]), CultureInfo.InvariantCulture).Ticks.ToString(CultureInfo.InvariantCulture);
            case "str.upperFirst":
            {
                var s = S(a[0]);
                return s.Length == 0 ? s : char.ToUpperInvariant(s[0]) + s.Substring(1);
            }
            case "str.eqOic": return B(string.Equals(SN(a[0]), SN(a[1]), StringComparison.OrdinalIgnoreCase));
            case "str.upperTable":
            {
                var sb = new StringBuilder();
                for (int c = 0; c < 0x10000; c++)
                {
                    char u = char.ToUpperInvariant((char)c);
                    if (u != c) sb.Append($"{c:x}:{(int)u:x},");
                }
                return sb.ToString();
            }
            case "str.oicTable":
            {
                // Pairs (c, c.ToUpperInvariant/JS upper) that OrdinalIgnoreCase considers equal, per BMP char.
                var sb = new StringBuilder();
                var t = typeof(string).Assembly.GetType("System.Globalization.OrdinalCasing")!;
                var m = t.GetMethod("ToUpper", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic, new[] { typeof(char) })!;
                for (int c = 0; c < 0x10000; c++)
                {
                    if (c >= 0xd800 && c <= 0xdfff) continue;
                    char u = (char)m.Invoke(null, new object[] { (char)c })!;
                    if (u != c) sb.Append($"{c:x}:{(int)u:x},");
                }
                return sb.ToString();
            }
            case "exc.msg":
                return S(a[0]) switch
                {
                    "InvalidCastException" => new InvalidCastException().Message,
                    "DivideByZeroException" => new DivideByZeroException().Message,
                    _ => throw new NotSupportedException(),
                };
            case "ev":
            {
                var src = new EventHost();
                var log = new List<string>();
                var handlers = new Dictionary<string, EventHandler<EventArgs>>
                {
                    ["a"] = (s, e) => log.Add("a"),
                    ["b"] = (s, e) => log.Add("b"),
                };
                foreach (var op in a[0]!.AsArray())
                {
                    var o = op!.AsArray();
                    switch (S(o[0]))
                    {
                        case "sub": src.Changed += handlers[S(o[1])]; break;
                        case "unsub": src.Changed -= handlers[S(o[1])]; break;
                        case "clear": src.Clear(); break;
                        case "raise": src.Raise(); log.Add("|"); break;
                        case "count": log.Add("n" + src.Count); break;
                    }
                }
                return string.Join("", log);
            }
            case "ev.pc":
                return new System.ComponentModel.PropertyChangedEventArgs(SN(a[0])).PropertyName ?? "null";
            default:
                throw new NotSupportedException(fn);
        }
    }

    sealed class EventHost
    {
        public event EventHandler<EventArgs>? Changed;
        public void Raise() => Changed?.Invoke(this, EventArgs.Empty);
        public void Clear() => Changed = null;
        public int Count => Changed?.GetInvocationList().Length ?? 0;
    }

    // =============================================================================== XLinq script

    static string Desc(XObject? o) => o switch
    {
        null => "null",
        XDocument => "D",
        XElement e => "E" + e.Name,
        XCData c => "C" + c.Value,
        XText t => "T" + t.Value,
        XComment m => "M" + m.Value,
        XProcessingInstruction p => "P" + p.Target + " " + p.Data,
        XDocumentType y => $"Y{y.Name},{y.PublicId ?? "~"},{y.SystemId ?? "~"},{y.InternalSubset ?? "~"}",
        XAttribute a => "A" + a.Name + "=" + a.Value,
        _ => "?",
    };

    static string List(IEnumerable<XObject> items) => "[" + string.Join(";", items.Select(Desc)) + "]";

    static XObject? Resolve(XDocument doc, string t, XObject?[] regs)
    {
        switch (t[0])
        {
            case 'd': return doc;
            case 'r': return doc.Root;
            case '$': return regs[t[1] - '0'];
            case 'e':
            {
                var l = doc.Descendants().ToList();
                return l.Count == 0 ? null : l[int.Parse(t.Substring(1)) % l.Count];
            }
            case 'n':
            {
                var l = doc.DescendantNodes().ToList();
                return l.Count == 0 ? null : l[int.Parse(t.Substring(1)) % l.Count];
            }
            case 'a':
            {
                var p = t.Substring(1).Split('.');
                var l = doc.Descendants().ToList();
                if (l.Count == 0) return null;
                var attrs = l[int.Parse(p[0]) % l.Count].Attributes().ToList();
                return attrs.Count == 0 ? null : attrs[int.Parse(p[1]) % attrs.Count];
            }
        }
        throw new NotSupportedException(t);
    }

    static object? Content(XDocument doc, JsonNode? n, XObject?[] regs)
    {
        if (n is null) return null;
        if (n is JsonValue) return n.GetValue<string>();
        if (n is JsonArray arr) return arr.Select(x => Content(doc, x, regs)).ToArray();
        var o = n.AsObject();
        if (o.ContainsKey("e")) return new XElement(XName.Get(S(o["e"])), o["c"] is JsonArray c ? c.Select(x => Content(doc, x, regs)).ToArray() : null);
        if (o.ContainsKey("a")) return new XAttribute(XName.Get(S(o["a"])), Content(doc, o["v"], regs)!);
        if (o.ContainsKey("tx")) return new XText(SN(o["tx"])!);
        if (o.ContainsKey("cd")) return new XCData(SN(o["cd"])!);
        if (o.ContainsKey("cm")) return new XComment(SN(o["cm"])!);
        if (o.ContainsKey("pi")) return new XProcessingInstruction(SN(o["pi"]![0])!, SN(o["pi"]![1])!);
        if (o.ContainsKey("dtd")) return new XDocumentType(SN(o["dtd"]![0])!, SN(o["dtd"]![1]), SN(o["dtd"]![2]), SN(o["dtd"]![3]));
        if (o.ContainsKey("ref")) return Resolve(doc, S(o["ref"]), regs);
        if (o.ContainsKey("num")) return double.Parse(S(o["num"]), CultureInfo.InvariantCulture);
        if (o.ContainsKey("int")) return o["int"]!.GetValue<int>();
        if (o.ContainsKey("bool")) return o["bool"]!.GetValue<bool>();
        if (o.ContainsKey("dec")) return decimal.Parse(S(o["dec"]), CultureInfo.InvariantCulture);
        if (o.ContainsKey("doc")) return new XDocument();
        throw new NotSupportedException(o.ToJsonString());
    }

    static string Script(string? xml, bool preserve, JsonArray steps)
    {
        var doc = xml is null ? new XDocument() : XDocument.Parse(xml, preserve ? LoadOptions.PreserveWhitespace : LoadOptions.None);
        var regs = new XObject?[2];
        var res = new List<string>();
        foreach (var s in steps)
        {
            string r;
            try { r = Step(doc, s!.AsObject(), regs); }
            catch (Exception e) { r = "!" + e.GetType().Name; }
            res.Add(r);
        }
        string final;
        try { final = doc.ToString(SaveOptions.DisableFormatting); }
        catch (Exception e) { final = "!" + e.GetType().Name; }
        res.Add(final);
        return string.Join("\n", res);
    }

    const string NA = "n/a";

    static string Step(XDocument doc, JsonObject s, XObject?[] regs)
    {
        var op = S(s["op"]);
        var o = Resolve(doc, S(s["t"]), regs);
        if (o is null) return "none";
        XName? name = s["name"] is { } nm ? XName.Get(S(nm)) : null;
        object? C() => Content(doc, s["c"], regs);
        object? V() => Content(doc, s["v"], regs);
        var node = o as XNode;
        var cont = o as XContainer;
        var el = o as XElement;
        var at = o as XAttribute;
        var dc = o as XDocument;
        switch (op)
        {
            case "desc": return Desc(o);
            case "str": return node?.ToString() ?? at!.ToString();
            case "strd": return node?.ToString(SaveOptions.DisableFormatting) ?? at!.ToString();
            case "nodeType": return o.NodeType.ToString();
            case "parent": return Desc(o.Parent);
            case "document": return Desc(o.Document);
            case "next": return node is null ? NA : Desc(node.NextNode);
            case "prev": return node is null ? NA : Desc(node.PreviousNode);
            case "firstNode": return cont is null ? NA : Desc(cont.FirstNode);
            case "lastNode": return cont is null ? NA : Desc(cont.LastNode);
            case "nodesAfter": return node is null ? NA : List(node.NodesAfterSelf());
            case "nodesBefore": return node is null ? NA : List(node.NodesBeforeSelf());
            case "elementsAfter": return node is null ? NA : List(name is null ? node.ElementsAfterSelf() : node.ElementsAfterSelf(name));
            case "elementsBefore": return node is null ? NA : List(name is null ? node.ElementsBeforeSelf() : node.ElementsBeforeSelf(name));
            case "ancestors": return node is null ? NA : List(name is null ? node.Ancestors() : node.Ancestors(name));
            case "ancestorsAndSelf": return el is null ? NA : List(name is null ? el.AncestorsAndSelf() : el.AncestorsAndSelf(name));
            case "descNodes": return cont is null ? NA : List(cont.DescendantNodes());
            case "descNodesAndSelf": return el is null ? NA : List(el.DescendantNodesAndSelf());
            case "descendants": return cont is null ? NA : List(name is null ? cont.Descendants() : cont.Descendants(name));
            case "descendantsAndSelf": return el is null ? NA : List(name is null ? el.DescendantsAndSelf() : el.DescendantsAndSelf(name));
            case "elements": return cont is null ? NA : List(name is null ? cont.Elements() : cont.Elements(name));
            case "element": return cont is null ? NA : Desc(cont.Element(name!));
            case "nodes": return cont is null ? NA : List(cont.Nodes());
            case "attributes": return el is null ? NA : List(name is null ? el.Attributes() : el.Attributes(name));
            case "attribute": return el is null ? NA : Desc(el.Attribute(name!));
            case "firstAttr": return el is null ? NA : Desc(el.FirstAttribute);
            case "lastAttr": return el is null ? NA : Desc(el.LastAttribute);
            case "nextAttr": return at is null ? NA : Desc(at.NextAttribute);
            case "prevAttr": return at is null ? NA : Desc(at.PreviousAttribute);
            case "hasAttrs": return el is null ? NA : B(el.HasAttributes);
            case "hasElems": return el is null ? NA : B(el.HasElements);
            case "isEmpty": return el is null ? NA : B(el.IsEmpty);
            case "value":
                return o switch
                {
                    XElement e => e.Value,
                    XAttribute a => a.Value,
                    XText t => t.Value,
                    XComment m => m.Value,
                    XProcessingInstruction p => p.Data,
                    _ => NA,
                };
            case "defNs": return el is null ? NA : el.GetDefaultNamespace().NamespaceName;
            case "nsOf": return el is null ? NA : el.GetNamespaceOfPrefix(S(s["v"]))?.NamespaceName ?? "null";
            case "prefixOf": return el is null ? NA : el.GetPrefixOfNamespace(XNamespace.Get(S(s["v"]))) ?? "null";
            case "isNsDecl": return at is null ? NA : B(at.IsNamespaceDeclaration);
            case "decl": return dc is null ? NA : dc.Declaration?.ToString() ?? "null";
            case "doctype": return dc is null ? NA : Desc(dc.DocumentType);
            case "root": return dc is null ? NA : Desc(dc.Root);
            case "clone":
                if (el is not null) return new XElement(el).ToString(SaveOptions.DisableFormatting);
                if (dc is not null)
                {
                    var copy = new XDocument(dc);
                    return (copy.Declaration?.ToString() ?? "null") + "|" + copy.ToString(SaveOptions.DisableFormatting);
                }
                return NA;
            case "nameStr": return el is null ? NA : $"{el.Name}|{el.Name.Namespace}|{el.Name.LocalName}|{el.Name.NamespaceName}";
            // ---- writes
            case "setValue":
                if (el is not null) { el.SetValue(V()!); return el.Value; }
                if (at is not null) { at.SetValue(V()!); return at.Value; }
                return NA;
            case "setValueProp":
            {
                var v = SN(s["v"]);
                switch (o)
                {
                    case XElement e: e.Value = v!; return "ok";
                    case XAttribute a: a.Value = v!; return "ok";
                    case XText t: t.Value = v!; return "ok";
                    case XComment m: m.Value = v!; return "ok";
                    case XProcessingInstruction p: p.Data = v!; return "ok";
                    default: return NA;
                }
            }
            case "setAttr": if (el is null) return NA; el.SetAttributeValue(name!, SN(s["v"])); return "ok";
            case "setElem": if (el is null) return NA; el.SetElementValue(name!, SN(s["v"])); return "ok";
            case "add": if (cont is null) return NA; cont.Add(C()); return "ok";
            case "addFirst": if (cont is null) return NA; cont.AddFirst(C()); return "ok";
            case "addBefore": if (node is null) return NA; node.AddBeforeSelf(C()); return "ok";
            case "addAfter": if (node is null) return NA; node.AddAfterSelf(C()); return "ok";
            case "replaceWith": if (node is null) return NA; node.ReplaceWith(C()); return "ok";
            case "replaceNodes": if (cont is null) return NA; cont.ReplaceNodes(C()); return "ok";
            case "replaceAttributes": if (el is null) return NA; el.ReplaceAttributes(C()); return "ok";
            case "replaceAll": if (el is null) return NA; el.ReplaceAll(C()); return "ok";
            case "remove":
                if (node is not null) node.Remove();
                else if (at is not null) at.Remove();
                else return NA;
                return "ok";
            case "removeAll": if (el is null) return NA; el.RemoveAll(); return "ok";
            case "removeNodes": if (cont is null) return NA; cont.RemoveNodes(); return "ok";
            case "removeAttributes": if (el is null) return NA; el.RemoveAttributes(); return "ok";
            case "rename": if (el is null) return NA; el.Name = name!; return "ok";
            case "setDecl":
            {
                if (dc is null) return NA;
                var v = s["v"]!.AsArray();
                dc.Declaration = new XDeclaration(SN(v[0]), SN(v[1]), SN(v[2]));
                return dc.Declaration.ToString();
            }
            case "save": regs[s["k"]!.GetValue<int>()] = o; return "ok";
            case "setTarget": if (o is not XProcessingInstruction pi) return NA; pi.Target = SN(s["v"])!; return Desc(pi);
            case "setDtdName": if (o is not XDocumentType dt) return NA; dt.Name = SN(s["v"])!; return Desc(dt);
        }
        throw new NotSupportedException(op);
    }

    // =============================================================================== System.Linq

    static IEnumerable<T> Seq<T>(List<T> items, string tag, List<string> log)
    {
        for (int i = 0; i < items.Count; i++)
        {
            log.Add(tag + i);
            yield return items[i];
        }
        log.Add(tag + "$");
    }

    static string F(object? x) => x switch
    {
        null => "null",
        double d => R(d),
        bool b => B(b),
        string s => s,
        _ => Convert.ToString(x, CultureInfo.InvariantCulture)!,
    };

    static double Dbl(JsonNode? n) => n is JsonValue v && v.TryGetValue<double>(out var d) ? d : double.Parse(S(n), CultureInfo.InvariantCulture);

    sealed class ModComparer : IEqualityComparer<int>
    {
        readonly int _n;
        public ModComparer(int n) => _n = n;
        public bool Equals(int x, int y) => x % _n == y % _n;
        public int GetHashCode(int x) => x % _n;
    }

    static string Linq(JsonArray a)
    {
        var op = S(a[0]);
        var kind = S(a[1]);
        var log = new List<string>();
        var src = a[2]!.AsArray();
        string res;
        try
        {
            if (op is "range" or "repeat" or "empty")
            {
                var q = op switch
                {
                    "range" => Enumerable.Range(a[3]!.GetValue<int>(), a[4]!.GetValue<int>()),
                    "repeat" => Enumerable.Repeat(a[3]!.GetValue<int>(), a[4]!.GetValue<int>()),
                    _ => Enumerable.Empty<int>(),
                };
                return Mat(q.Take(20), log) + " #" + string.Join(",", log);
            }
            res = kind switch
            {
                "i" => new Runner<int>(log, n => n!.GetValue<int>(), src, a).Run(op),
                "s" => new Runner<string?>(log, n => SN(n), src, a).Run(op),
                "d" => LinqD(op, Seq(src.Select(Dbl).ToList(), "s", log), a, log),
                "ni" => LinqNI(op, Seq(src.Select(n => n is null ? (int?)null : n.GetValue<int>()).ToList(), "s", log), log),
                _ => throw new NotSupportedException(kind),
            };
        }
        catch (Exception e) { res = "!" + e.GetType().Name; }
        return res + " #" + string.Join(",", log);
    }

    static string Mat<T>(IEnumerable<T> q, List<string> log)
    {
        log.Add("q");
        return "[" + string.Join(",", q.Select(x => F(x))) + "]";
    }

    static string LinqD(string op, IEnumerable<double> s, JsonArray a, List<string> log) => op switch
    {
        "sum" => R(s.Sum()),
        "max" => R(s.Max()),
        "min" => R(s.Min()),
        "distinct" => Mat(s.Distinct(), log),
        "contains" => B(s.Contains(Dbl(a[3]))),
        "order" => Mat(s.OrderBy(x => x), log),
        "orderd" => Mat(s.OrderByDescending(x => x), log),
        _ => throw new NotSupportedException(op),
    };

    static string LinqNI(string op, IEnumerable<int?> s, List<string> log) => op switch
    {
        "sum" => F(s.Sum()),
        "max" => F(s.Max()),
        "min" => F(s.Min()),
        "order" => Mat(s.OrderBy(x => x), log),
        "orderd" => Mat(s.OrderByDescending(x => x), log),
        _ => throw new NotSupportedException(op),
    };

    sealed class Runner<T>
    {
        readonly List<string> _log;
        readonly Func<JsonNode?, T> _parse;
        readonly JsonArray _src;
        readonly JsonArray _a;
        readonly bool _isInt = typeof(T) == typeof(int);

        public Runner(List<string> log, Func<JsonNode?, T> parse, JsonArray src, JsonArray a)
        {
            _log = log;
            _parse = parse;
            _src = src;
            _a = a;
        }

        IEnumerable<T> Src => Seq(_src.Select(_parse).ToList(), "s", _log);
        IEnumerable<T> Other(int i) => Seq(_a[i]!.AsArray().Select(_parse).ToList(), "o", _log);
        JsonNode? Arg(int i) => i < _a.Count ? _a[i] : null;
        string? ArgS(int i) => SN(Arg(i));

        Func<T, bool>? Pred(string? p)
        {
            if (p is null) return null;
            var parts = p.Split(':');
            if (_isInt)
            {
                return parts[0] switch
                {
                    "gt" => x => (int)(object)x! > int.Parse(parts[1]),
                    "even" => x => (int)(object)x! % 2 == 0,
                    "throw" => x => (int)(object)x! == int.Parse(parts[1]) ? throw new FormatException() : true,
                    "all" => _ => true,
                    "none" => _ => false,
                    _ => throw new NotSupportedException(p),
                };
            }
            return parts[0] switch
            {
                "gt" => x => ((string)(object)x!).Length > int.Parse(parts[1]),
                "throw" => x => (string?)(object?)x == parts[1] ? throw new FormatException() : true,
                "isnull" => x => x is null,
                "all" => _ => true,
                "none" => _ => false,
                _ => throw new NotSupportedException(p),
            };
        }

        /// <summary>Selectors returning int (mod, neg, len; id on ints).</summary>
        bool IntSel(string s) => _isInt || s == "len";

        Func<T, int> SelI(string s)
        {
            var parts = s.Split(':');
            return parts[0] switch
            {
                "id" => x => (int)(object)x!,
                "mod" => x => (int)(object)x! % int.Parse(parts[1]),
                "neg" => x => -(int)(object)x!,
                "len" => x => (x is null ? throw new NullReferenceException() : (string)(object)x).Length,
                _ => throw new NotSupportedException(s),
            };
        }

        Func<T, string?> SelS(string s) => s switch
        {
            "id" => x => (string?)(object?)x,
            "lower" => x => (x is null ? throw new NullReferenceException() : (string)(object)x).ToLowerInvariant(),
            "first" => x => (x is null ? throw new NullReferenceException() : (string)(object)x).Length > 0 ? ((string)(object)x!).Substring(0, 1) : "",
            _ => throw new NotSupportedException(s),
        };

        IEqualityComparer<T>? Cmp(string? c)
        {
            if (c is null) return null;
            if (c == "ci") return _isInt ? null : (IEqualityComparer<T>)(object)StringComparer.OrdinalIgnoreCase;
            if (c.StartsWith("mod:")) return _isInt ? (IEqualityComparer<T>)(object)new ModComparer(int.Parse(c.Substring(4))) : null;
            throw new NotSupportedException(c);
        }

        static IEqualityComparer<int>? CmpI(string? c) => c is not null && c.StartsWith("mod:") ? new ModComparer(int.Parse(c.Substring(4))) : null;
        static IEqualityComparer<string?>? CmpS(string? c) => c == "ci" ? StringComparer.OrdinalIgnoreCase : null;
        static IComparer<string?>? OrdS(string? c) => c == "ord" ? StringComparer.Ordinal : null;

        T Val(int i) => _parse(Arg(i));

        string Mat<TR>(IEnumerable<TR> q) => GapsInfraOracle.Mat(q, _log);

        public string Run(string op)
        {
            var src = Src;
            Func<T, bool>? p = op is "where" or "first" or "firstOrDefault" or "last" or "lastOrDefault" or "single" or "singleOrDefault"
                or "any" or "count" or "all" or "skipWhile" or "takeWhile" or "deferred" ? Pred(ArgS(3)) : null;
            switch (op)
            {
                case "where": return Mat(src.Where(p!));
                case "select":
                {
                    var s = ArgS(3)!;
                    return IntSel(s) ? Mat(src.Select(SelI(s))) : Mat(src.Select(SelS(s)));
                }
                case "first": return F(p is null ? src.First() : src.First(p));
                case "firstOrDefault": return F(p is null ? src.FirstOrDefault() : src.FirstOrDefault(p));
                case "last": return F(p is null ? src.Last() : src.Last(p));
                case "lastOrDefault": return F(p is null ? src.LastOrDefault() : src.LastOrDefault(p));
                case "single": return F(p is null ? src.Single() : src.Single(p));
                case "singleOrDefault": return F(p is null ? src.SingleOrDefault() : src.SingleOrDefault(p));
                case "any": return B(p is null ? src.Any() : src.Any(p));
                case "count": return F(p is null ? src.Count() : src.Count(p));
                case "all": return B(src.All(p!));
                case "elementAt": return F(src.ElementAt(Arg(3)!.GetValue<int>()));
                case "elementAtOrDefault": return F(src.ElementAtOrDefault(Arg(3)!.GetValue<int>()));
                case "defaultIfEmpty": return Arg(3) is null ? Mat(src.DefaultIfEmpty()) : Mat(src.DefaultIfEmpty(Val(3)));
                case "contains": return B(src.Contains(Val(3), Cmp(ArgS(4))));
                case "sum":
                {
                    var s = ArgS(3);
                    if (s is null) return _isInt ? F(((IEnumerable<int>)(object)src).Sum()) : NA;
                    return IntSel(s) ? F(src.Sum(SelI(s))) : NA;
                }
                case "max":
                case "min":
                {
                    var s = ArgS(3);
                    bool max = op == "max";
                    if (s is null)
                    {
                        if (_isInt) return F(max ? ((IEnumerable<int>)(object)src).Max() : ((IEnumerable<int>)(object)src).Min());
                        return F(max ? src.Max() : src.Min());
                    }
                    if (IntSel(s)) return F(max ? src.Max(SelI(s)) : src.Min(SelI(s)));
                    return F(max ? src.Max(SelS(s)) : src.Min(SelS(s)));
                }
                case "aggregate":
                    if (_isInt) return F(((IEnumerable<int>)(object)src).Aggregate(7, (acc, x) => unchecked(acc * 31 + x)));
                    return F(((IEnumerable<string?>)(object)src).Aggregate("", (acc, x) => acc + (x ?? "~")));
                case "sequenceEqual": return B(src.SequenceEqual(Other(3), Cmp(ArgS(4))));
                case "distinct": return Mat(src.Distinct(Cmp(ArgS(4))));
                case "except": return Mat(src.Except(Other(3), Cmp(ArgS(4))));
                case "intersect": return Mat(src.Intersect(Other(3), Cmp(ArgS(4))));
                case "union": return Mat(src.Union(Other(3), Cmp(ArgS(4))));
                case "toHashSet": return Mat(src.ToHashSet(Cmp(ArgS(4))));
                case "concat": return Mat(src.Concat(Other(3)));
                case "append": return Mat(src.Append(Val(3)));
                case "prepend": return Mat(src.Prepend(Val(3)));
                case "skip": return Mat(src.Skip(Arg(3)!.GetValue<int>()));
                case "take": return Mat(src.Take(Arg(3)!.GetValue<int>()));
                case "skipWhile": return Mat(src.SkipWhile(p!));
                case "takeWhile": return Mat(src.TakeWhile(p!));
                case "reverse": return Mat(src.Reverse());
                case "order":
                {
                    IOrderedEnumerable<T>? q = null;
                    foreach (var k in Arg(3)!.AsArray())
                    {
                        var dir = S(k![0]);
                        var s = S(k[1]);
                        var c = SN(k[2]);
                        bool desc = dir == "desc";
                        if (IntSel(s))
                        {
                            var f = SelI(s);
                            q = q is null ? (desc ? src.OrderByDescending(f) : src.OrderBy(f)) : (desc ? q.ThenByDescending(f) : q.ThenBy(f));
                        }
                        else
                        {
                            var f = SelS(s);
                            var cmp = OrdS(c);
                            q = q is null ? (desc ? src.OrderByDescending(f, cmp) : src.OrderBy(f, cmp)) : (desc ? q.ThenByDescending(f, cmp) : q.ThenBy(f, cmp));
                        }
                    }
                    return Mat(q!);
                }
                case "groupBy":
                {
                    var s = ArgS(3)!;
                    var c = ArgS(4);
                    if (IntSel(s))
                        return Mat(src.GroupBy(SelI(s), CmpI(c)).Select(g => F(g.Key) + ":[" + string.Join(",", g.Select(x => F(x))) + "]"));
                    return Mat(src.GroupBy(SelS(s), CmpS(c)).Select(g => F(g.Key) + ":[" + string.Join(",", g.Select(x => F(x))) + "]"));
                }
                case "toDictionary":
                {
                    var s = ArgS(3)!;
                    if (IntSel(s)) return string.Join(",", src.ToDictionary(SelI(s)).Select(kv => F(kv.Key) + "=" + F(kv.Value)));
                    return string.Join(",", src.ToDictionary(SelS(s)!).Select(kv => F(kv.Key) + "=" + F(kv.Value)));
                }
                case "zip": return Mat(src.Zip(Other(3), (x, y) => F(x) + "/" + F(y)));
                case "deferred": return Mat(src.Where(p!).Select(x => x));
                case "forEach":
                {
                    var seen = new List<string>();
                    int i = 0;
                    foreach (var x in src) { if (F(x) == ArgS(3)) throw new FormatException(); seen.Add(F(x) + "@" + i++); }
                    return string.Join(",", seen);
                }
            }
            throw new NotSupportedException(op);
        }
    }
}
