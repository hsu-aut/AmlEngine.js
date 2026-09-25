using System.Collections;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using System.Xml.Schema;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Schema;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// Coverage gap package "gapsservices": Aml.Engine.Schema (XmlSchemaManager public API),
/// Aml.Engine.Xml.Extensions, Aml.Engine.Services (+ Model), Aml.Engine.Adapter,
/// Aml.Engine.Streaming and the remaining functions of Aml.Engine.AmlObjects.
/// Keep in sync with test/engine/gapsservices.oracle.test.ts, which makes the same calls.
///   gapsservices &lt;inputDir test/gapsservices&gt; &lt;corpusDir&gt; &lt;outDir&gt;
/// Writes outDir/&lt;section&gt;.json: { case: [lines] }.
/// </summary>
public static partial class GapsServicesOracle
{
    static string inputDir = "";
    static string corpusDir = "";
    static string workDir = "";
    static readonly Assembly Engine = typeof(CAEXDocument).Assembly;

    public static void Run(string[] args)
    {
        inputDir = Path.GetFullPath(args[0]);
        corpusDir = Path.GetFullPath(args[1]);
        var outDir = Path.GetFullPath(args[2]);
        workDir = Path.Combine(outDir, "work");
        Directory.CreateDirectory(outDir);
        if (Directory.Exists(workDir)) Directory.Delete(workDir, true);
        Directory.CreateDirectory(workDir);
        var sections = new (string, Action<JsonObject>)[]
        {
            ("schema", SchemaSection),
            ("xmlext", XmlExtSection),
            ("query", QuerySection),
            ("services", ServicesSection),
            ("model", ModelSection),
            ("adapter", AdapterSection),
            ("streaming", StreamingSection),
            ("amlobjects", AmlObjectsSection),
        };
        var only = args.Length > 3 ? args[3] : null;
        foreach (var (name, action) in sections)
        {
            if (only != null && only != name) continue;
            var o = new JsonObject();
            action(o);
            File.WriteAllText(Path.Combine(outDir, name + ".json"), o.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
    }

    // ---------------------------------------------------------------- recording

    public sealed class Rec
    {
        public readonly List<string> Lines = new();
        public readonly EngineOpsOracle.Canonicalizer C = new();

        public void V(string label, Func<object?> f)
        {
            string s;
            try { s = F(f()); }
            catch (Exception e) { s = Ex(e); }
            Add(label + "=" + s);
        }

        public void Do(string label, Action a)
        {
            string s = "ok";
            try { a(); }
            catch (Exception e) { s = Ex(e); }
            Add(label + "=" + s);
        }

        public void Add(string line)
        {
            if (workDir.Length > 0)
            {
                line = line.Replace(workDir, "<WORK>", StringComparison.OrdinalIgnoreCase);
                line = line.Replace(workDir.Replace('\\', '/'), "<WORK>", StringComparison.OrdinalIgnoreCase);
            }
            if (inputDir.Length > 0)
            {
                line = line.Replace(inputDir, "<IN>", StringComparison.OrdinalIgnoreCase);
                line = line.Replace(inputDir.Replace('\\', '/'), "<IN>", StringComparison.OrdinalIgnoreCase);
            }
            Lines.Add(C.Apply(line));
        }

        public JsonArray ToJson() => new(Lines.Select(l => (JsonNode)JsonValue.Create(l)!).ToArray());
    }

    static void Case(JsonObject o, string name, Action<Rec> action)
    {
        var r = new Rec();
        try { action(r); }
        catch (Exception e) { r.Add("abort:" + Ex(e)); }
        o[name] = r.ToJson();
    }

    public static string Ex(Exception e)
    {
        while (e is TargetInvocationException { InnerException: not null } t) e = t.InnerException!;
        return e is NullReferenceException or System.Xml.XmlException ? "!" + e.GetType().Name : "!" + e.GetType().Name + ": " + e.Message;
    }

    static string T(Func<object?> f)
    {
        try { return F(f()); }
        catch (Exception e) { return Ex(e); }
    }

    static string B(bool b) => b ? "true" : "false";
    static string N(string? s) => s ?? "null";

    public static string F(object? v)
    {
        switch (v)
        {
            case null: return "null";
            case string s: return s;
            case bool b: return B(b);
            case int or long or short or byte: return Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture)!;
            case double d: return d.ToString(System.Globalization.CultureInfo.InvariantCulture);
            case decimal m: return m == decimal.MaxValue ? "MAX" : m.ToString(System.Globalization.CultureInfo.InvariantCulture);
            case Enum en: return en.ToString();
            case XName xn: return xn.ToString();
            case XElement e: return e.ToString();
            case XAttribute a: return a.ToString();
            case CAEXWrapper w: return D(w);
            case XmlSchemaElement se: return SE(se);
            case XmlSchemaAttribute sa: return "SA(" + sa.Name + ")";
            case XmlSchemaFacet fa: return fa.GetType().Name.Replace("XmlSchema", "").Replace("Facet", "") + ":" + fa.Value;
            case Uri u: return u.IsAbsoluteUri ? "Uri(" + u.OriginalString + "|" + u.AbsoluteUri + ")" : "Uri(" + u.OriginalString + ")";
            case byte[] bytes: return "bytes(" + bytes.Length + ":" + HashBytes(bytes) + ")";
            case IEnumerable en:
            {
                var parts = new List<string>();
                foreach (var x in en) parts.Add(F(x));
                return "[" + string.Join(",", parts) + "]";
            }
            default: return v.GetType().Name;
        }
    }

    static string SE(XmlSchemaElement e) => "SE(" + e.QualifiedName.Name + "|" + F(e.MinOccurs) + "|" + F(e.MaxOccurs) + ")";

    /// <summary>Describes a wrapper: run time class, element name, name, ID, path.</summary>
    public static string D(CAEXWrapper? w)
    {
        if (w == null) return "null";
        if (w.Node == null) return w.GetType().Name + "(nonode)";
        if (w is CAEXObject o) return $"{w.GetType().Name}:{w.Node.Name.LocalName}|{N(o.Name)}|{N(o.ID)}|{T(() => o.CAEXPath())}";
        return $"{w.GetType().Name}:{w.Node.Name.LocalName}";
    }

    public static string SaveString(CAEXDocument doc)
    {
        using var s = doc.SaveToStream(true);
        s.Position = 0;
        return new StreamReader(s).ReadToEnd();
    }

    public static string Hash(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).Substring(0, 16);
    public static string HashBytes(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).Substring(0, 16);

    static CAEXDocument Load(string file) => CAEXDocument.LoadFromString(File.ReadAllText(file, Encoding.UTF8));
    static CAEXDocument Corpus(string name) => Load(Path.Combine(corpusDir, name));

    // ---------------------------------------------------------------- reflection helpers

    static Type Ty(string fullName) => Engine.GetType(fullName, true)!;

    /// <summary>Invokes the static (or extension) method with the given parameter types.</summary>
    static object? InvT(Type t, string name, Type[] types, params object?[] args)
    {
        var m = t.GetMethod(name, BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic, null, types, null)
            ?? throw new MissingMethodException(t.Name + "." + name);
        return m.Invoke(null, args);
    }

    /// <summary>Invokes the only static method with the name and argument count.</summary>
    static object? Inv(Type t, string name, params object?[] args)
    {
        var ms = t.GetMethods(BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic).Where(m => m.Name == name && m.GetParameters().Length == args.Length).ToList();
        if (ms.Count != 1) throw new MissingMethodException(t.Name + "." + name + "/" + args.Length + " (" + ms.Count + ")");
        return ms[0].Invoke(null, args);
    }

    static object? InvI(object target, string name, params object?[] args)
    {
        var ms = target.GetType().GetMethods(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).Where(m => m.Name == name && m.GetParameters().Length == args.Length).ToList();
        if (ms.Count != 1) throw new MissingMethodException(target.GetType().Name + "." + name + "/" + args.Length + " (" + ms.Count + ")");
        return ms[0].Invoke(target, args);
    }

    static object? Prop(object target, string name) =>
        target.GetType().GetProperty(name, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!.GetValue(target);

    // ================================================================ 1. schema

    static readonly string[] NoPairs = { "|Nonexistent", "CAEXFile|Nonexistent", "Nonexistent|InternalElement", "|" };

    static void SchemaSection(JsonObject o)
    {
        foreach (var (tag, m) in new (string, XmlSchemaManager)[] { ("caex30", AMLSchemaManager3_0.Instance), ("caex215", AMLSchemaManager2_15.Instance) })
        {
            var elements = (Dictionary<string, XmlSchemaElementInfo>)typeof(XmlSchemaManager).GetField("Elements", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(m)!;
            var pairs = new List<string>();
            foreach (var (key, info) in elements)
            {
                var c = info.SchemaElement.QualifiedName.Name;
                pairs.Add(key == c ? "|" + c : key.EndsWith(c) ? key.Substring(0, key.Length - c.Length) + "|" + c : "?" + key + "|" + c);
            }
            Case(o, tag + ":pairs", r => { foreach (var p in pairs) r.Add(p); });
            foreach (var pair in pairs.Concat(NoPairs))
                Case(o, tag + ":" + pair, r => SchemaPair(r, m, pair));
            Case(o, tag + ":misc", r => SchemaMisc(r, m, tag));
        }
    }

    static XName? Nm(XmlSchemaManager m, string? s) => s == null ? null : m.Namespace + s;

    static void SchemaPair(Rec r, XmlSchemaManager m, string pair)
    {
        var bar = pair.IndexOf('|');
        string? p = bar == 0 ? null : pair.Substring(0, bar);
        var c = pair.Substring(bar + 1);
        var pn = Nm(m, p);
        var cn = m.Namespace + c;
        r.V("attributeNames", () => m.AttributeNames(pn, cn));
        r.V("attributeNamesReq", () => m.AttributeNames(pn, cn, true));
        var attrs = m.Attributes(pn, cn).ToList();
        foreach (var a in attrs.Select(a => a.Name).Concat(new[] { "NoSuchAttribute" }))
        {
            var sa = attrs.FirstOrDefault(x => x.Name == a);
            if (sa != null)
            {
                r.V("attr:" + a, () => $"{sa.Use}|{N(sa.DefaultValue)}|{N(sa.FixedValue)}|{XmlSchemaManager.AttributeValueType(sa)}");
                r.V("attr:" + a + ":annotation", () => m.GetAnnotation(sa));
                r.V("attr:" + a + ":enumeration", () => sa.AttributeSchemaType?.Content is XmlSchemaSimpleTypeRestriction rr ? rr.Facets.OfType<XmlSchemaEnumerationFacet>().Select(f => f.Value) : null);
                r.V("attr:" + a + ":datatype", () => sa.AttributeSchemaType?.Datatype?.TypeCode);
            }
            r.V("attr:" + a + ":restrictions", () => m.AttributeValueRestrictions(pn, cn, a));
            r.V("attr:" + a + ":valueType", () => m.AttributeValueType(pn, cn, a));
            r.V("attr:" + a + ":defined", () => m.IsDefinedAttribute(pn, cn, a));
            r.V("attr:" + a + ":required", () => m.IsRequiredAttribute(pn, cn, a));
        }
        r.V("childElementNames", () => m.ChildElementNames(pn, cn, false));
        r.V("childElementNamesChoice", () => m.ChildElementNames(pn, cn, true));
        r.V("childElements", () => m.ChildElements(pn, cn));
        r.V("childElementsChoice", () => m.ChildElements(pn, cn, true));
        r.V("choices", () => m.Choices(pn, cn));
        r.V("isChoice", () => m.IsChoice(p, c));
        r.V("maxOccurence", () => m.MaxOccurence(p, c));
        r.V("minOccurence", () => m.MinOccurence(pn, cn));
        var se = m.SchemaElement(pn, cn);
        r.V("schemaElement", () => se);
        r.V("annotation", () => m.GetAnnotation(se));
        if (se != null)
        {
            r.V("acceptsAny", () => XmlSchemaManager.AcceptsAny(se));
            r.V("isChoiceForOneElement", () => XmlSchemaManager.IsChoiceForOneElement(se));
            r.V("datatype", () => se.ElementSchemaType?.Datatype?.TypeCode);
            if (se.ElementSchemaType is XmlSchemaSimpleType sst)
                r.V("enumeration", () => sst.Content is XmlSchemaSimpleTypeRestriction rr ? rr.Facets.OfType<XmlSchemaEnumerationFacet>().Select(f => f.Value) : null);
            var elements = (Dictionary<string, XmlSchemaElementInfo>)typeof(XmlSchemaManager).GetField("Elements", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(m)!;
            r.V("infoMaxOccurrence", () => elements.TryGetValue((p ?? "") + c, out var info) ? info.MaxOccurrence : -1m);
        }
        r.V("hasChoiceOfElements", () => { var b = m.HasChoiceOfElements(pn, cn, out var one); return B(b) + "|" + B(one); });
        r.V("hasSequenceOfSimpleElements", () => { var b = m.HasSequenceOfSimpleElements(pn, cn, out var one); return B(b) + "|" + B(one); });
        r.V("valueType", () => m.ValueType(pn, cn));
        r.V("createElement", () => m.CreateElement(pn, cn));
        r.V("createElementAll", () => m.CreateElement(pn, cn, true));
        if (p == null || c.Length == 0) return;
        var parent = new XElement(pn!);
        r.V("canAddNew0", () => m.CanAddNew(parent, cn));
        r.V("isParent", () => m.IsParent(parent, cn));
        r.V("siblingBefore0", () => m.SiblingBefore(parent, cn));
        r.V("insertNew1", () => m.InsertNew(parent, cn));
        r.V("canAddNew1", () => m.CanAddNew(parent, cn));
        r.V("siblingBefore1", () => m.SiblingBefore(parent, cn));
        r.V("insertNew2", () => m.InsertNew(parent, cn, true));
        r.V("canAddNew2", () => m.CanAddNew(parent, cn));
        r.V("insert", () => m.Insert(parent, new XElement(cn, "x")));
        r.V("addNew", () => m.AddNew(parent, cn, "content"));
        r.V("parent", () => parent);
        foreach (var a in attrs.Select(a => a.Name).Concat(new[] { "NoSuchAttribute" }))
        {
            var ch = new XElement(cn);
            _ = new XElement(pn!, ch);
            r.V("createAttribute:" + a, () => m.CreateAttribute(ch, a));
            r.V("createAttribute:" + a + ":el", () => ch);
        }
        r.V("createAttributeDetached", () => m.CreateAttribute(new XElement(cn), attrs.FirstOrDefault()?.Name ?? "Name"));
    }

    static void SchemaMisc(Rec r, XmlSchemaManager m, string tag)
    {
        var am = (AMLSchemaManager)m;
        r.V("namespace", () => m.Namespace.NamespaceName);
        r.V("schemaLocation", () => m.SchemaLocation);
        r.V("schemaSet", () => m.SchemaSet != null);
        r.V("annotationNull", () => m.GetAnnotation((XmlSchemaElement)null!));
        r.V("annotationNullAttr", () => m.GetAnnotation((XmlSchemaAttribute)null!));
        r.V("attributeValueTypeNull", () => XmlSchemaManager.AttributeValueType(null!));
        foreach (var name in new[] { "CAEXFile", "InternalElement", "Other" })
        {
            var e1 = new XElement(m.Namespace + name, new XAttribute("A", "1"));
            r.Do("setSchemaVersion:" + name, () => am.SetSchemaVersion(e1));
            r.V("setSchemaVersion:" + name + ":el", () => e1);
        }
        // AdjustCAEXFileToSchema (internal) on CAEXFile elements in both namespaces, with namespaced attributes.
        foreach (var ns in new[] { XNamespace.None, (XNamespace)"http://www.dke.de/CAEX", (XNamespace)"urn:other" })
        {
            var e2 = new XElement(ns + "CAEXFile",
                new XAttribute(XNamespace.Xmlns + "x", "urn:x"),
                new XAttribute(XNamespace.Get("urn:x") + "Foo", "1"),
                new XAttribute("FileName", "a.aml"),
                new XElement(ns + "AdditionalInformation", new XAttribute("AutomationMLVersion", "2.0")),
                new XElement("AdditionalInformation", new XAttribute("AutomationMLVersion", "2.0")));
            r.Do("adjust:" + ns.NamespaceName, () => InvI(m, "AdjustCAEXFileToSchema", e2));
            r.V("adjust:" + ns.NamespaceName + ":el", () => e2);
        }
        // AdjustNameToSchema (internal static) directly.
        {
            var e3 = new XElement(XNamespace.Get("urn:y") + "InternalElement", new XAttribute(XNamespace.Get("urn:y") + "Name", "n"), new XAttribute("ID", "i"));
            r.Do("adjustName", () => Inv(m.GetType(), "AdjustNameToSchema", e3));
            r.V("adjustName:el", () => e3);
        }
        // SetSchemaLocation (internal) extracts the schema file into the folder.
        var dir = Path.Combine(workDir, "schema-" + tag);
        Directory.CreateDirectory(dir);
        foreach (var folder in new[] { dir, dir + Path.DirectorySeparatorChar, Path.Combine(workDir, "missing-" + tag, "x") })
        {
            var root = new XElement(m.Namespace + "CAEXFile");
            r.Do("setSchemaLocation:" + folder, () => InvI(m, "SetSchemaLocation", root, folder));
            r.V("setSchemaLocation:" + folder + ":el", () => root);
            r.Do("setSchemaLocationAgain", () => InvI(m, "SetSchemaLocation", root, folder));
            r.V("setSchemaLocationAgain:el", () => root);
        }
        foreach (var f in Directory.GetFiles(dir).OrderBy(x => x, StringComparer.Ordinal))
            r.Add("file:" + Path.GetFileName(f) + "=" + HashBytes(File.ReadAllBytes(f)));
    }


}
