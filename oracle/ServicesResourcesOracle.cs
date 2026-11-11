using System.Collections;
using System.ComponentModel;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.Json.Serialization;
using Aml.Engine.CAEX;
using Aml.Engine.Resources;
using Aml.Engine.Resources.AMLStandard;
using Aml.Engine.Resources.Catalogue;
using Aml.Engine.Resources.Files;
using Aml.Engine.Services.Model;

namespace Oracle;

/// <summary>
/// resources &lt;casesDir&gt; &lt;out.json&gt;: Aml.Engine.Resources 4.2.1, the library catalog
/// (PublicLibraryCatalog with System.Text.Json), the file models (AMLFileMetaModel and friends),
/// the type converters and the embedded catalog resource. The cases come from
/// scripts/gen-services-resources.mjs (test/services/resources/cases.json); the JS counterpart is
/// test/services/resources.oracle.test.ts, which makes the same calls and records the same lines.
/// Output: { section: { case: [lines] } }. Files are written to &lt;out dir&gt;/resources-work,
/// recorded as &lt;WORK&gt;.
/// </summary>
public static class ServicesResourcesOracle
{
    static string workDir = "";

    public static void Run(string[] args)
    {
        var casesDir = Path.GetFullPath(args[0]);
        var outFile = Path.GetFullPath(args[1]);
        Directory.CreateDirectory(Path.GetDirectoryName(outFile)!);
        workDir = Path.Combine(Path.GetDirectoryName(outFile)!, "resources-work");
        if (Directory.Exists(workDir)) Directory.Delete(workDir, true);
        Directory.CreateDirectory(workDir);
        var cases = JsonNode.Parse(File.ReadAllText(Path.Combine(casesDir, "cases.json"), Encoding.UTF8))!;
        var o = new JsonObject
        {
            ["catalogs"] = Catalogs(cases["catalogs"]!.AsArray()),
            ["files"] = Files(Strings(cases["fileNames"]!)),
            ["groups"] = Groups(cases["fileGroups"]!.AsArray()),
            ["misc"] = Misc(cases["items"]!.AsArray()),
            ["converters"] = Converters(Strings(cases["enumStrings"]!), Strings(cases["semverStrings"]!)),
            ["resources"] = Resources(),
            ["profiles"] = Profiles(Strings(cases["profiles"]!)),
        };
        File.WriteAllText(outFile, o.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    // ---------------------------------------------------------------- recording

    sealed class Rec
    {
        public readonly List<string> Lines = new();

        public void V(string label, Func<object?> f) => Add(label + "=" + T(f));

        public void Do(string label, Action a)
        {
            string s = "ok";
            try { a(); }
            catch (Exception e) { s = Ex(e); }
            Add(label + "=" + s);
        }

        public void Add(string line)
        {
            line = line.Replace(workDir, "<WORK>", StringComparison.OrdinalIgnoreCase);
            line = line.Replace(workDir.Replace('\\', '/'), "<WORK>", StringComparison.OrdinalIgnoreCase);
            Lines.Add(line);
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

    static string Ex(Exception e)
    {
        while (e is TargetInvocationException { InnerException: not null } t) e = t.InnerException!;
        return e is NullReferenceException ? "!" + e.GetType().Name : "!" + e.GetType().Name + ": " + e.Message;
    }

    static string T(Func<object?> f)
    {
        try { return F(f()); }
        catch (Exception e) { return Ex(e); }
    }

    static string B(bool b) => b ? "true" : "false";
    static string N(string? s) => s ?? "null";
    static string Hash(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).Substring(0, 16);

    static string F(object? v)
    {
        switch (v)
        {
            case null: return "null";
            case string s: return s;
            case bool b: return B(b);
            case int or long: return Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture)!;
            case double d: return d.ToString(System.Globalization.CultureInfo.InvariantCulture);
            case Enum en: return en + "=" + Convert.ToInt32(en);
            case SemanticVersion sv: return "SV(" + sv + ")";
            case Version ver: return "Version(" + ver + ")";
            case byte[] bytes: return "bytes(" + bytes.Length + ":" + Hash(bytes) + ")";
            case PublicLibraryCatalog.LibraryVersion lv: return V(lv);
            case PublicLibraryCatalog.Library l: return L(l);
            case PublicLibraryCatalog.LibraryType lt: return LT(lt);
            case PublicLibraryCatalog.LibraryRevision lr: return R(lr, null);
            case IEnumerable en:
            {
                var parts = new List<string>();
                foreach (var x in en) parts.Add(F(x));
                return "[" + string.Join(",", parts) + "]";
            }
            default: return v.GetType().Name;
        }
    }

    static object?[] Strings(JsonNode node) => node.AsArray().Select(n => (object?)Str(n)).ToArray();

    /// <summary>A string of the cases: null, text, or "@hex:" + UTF-16 code units (texts that are no valid UTF-16).</summary>
    static string? Str(JsonNode? n)
    {
        if (n == null) return null;
        var s = n.GetValue<string>();
        if (!s.StartsWith("@hex:")) return s;
        var sb = new StringBuilder();
        for (var i = 5; i < s.Length; i += 4) sb.Append((char)Convert.ToInt32(s.Substring(i, 4), 16));
        return sb.ToString();
    }

    // ---------------------------------------------------------------- catalog descriptions

    static string Links(List<string>? links) => links == null ? "null" : "[" + string.Join(",", links.Select(N)) + "]";

    static string LT(PublicLibraryCatalog.LibraryType? t) =>
        t == null ? "null" : "LT(" + N(t.CAEXType) + "|n=" + (t.Libraries == null ? "null" : t.Libraries.Count.ToString()) + ")";

    static string L(PublicLibraryCatalog.Library? l) =>
        l == null ? "null" : "L(" + N(l.Name) + "|n=" + (l.Versions == null ? "null" : l.Versions.Count.ToString()) + ")";

    static string R(PublicLibraryCatalog.LibraryRevision r, PublicLibraryCatalog.LibraryVersion? owner)
    {
        var rel = r.RelatedLibraryVersion == null ? "null" : ReferenceEquals(r.RelatedLibraryVersion, owner) ? "self" : "V:" + N(r.RelatedLibraryVersion.Version);
#pragma warning disable CS0618
        return "R(" + N(r.DownloadLink) + "|" + Links(r.DownloadLinks) + "|" + N(r.Signature) + "|rel=" + rel + ")";
#pragma warning restore CS0618
    }

    static string Chain(PublicLibraryCatalog.LibraryVersion v)
    {
        var parts = new List<string>();
        var n = 0;
        for (var r = v.Revision; r != null && n < 100; r = r.Revision, n++) parts.Add(R(r, v));
        return string.Join(">", parts);
    }

    /// <summary>A library version without reading SemanticVersion (the getter changes Version).</summary>
    static string V(PublicLibraryCatalog.LibraryVersion? v)
    {
        if (v == null) return "null";
#pragma warning disable CS0618
        return "V(" + N(v.Version) + "|" + N(v.CAEXVersion) + "|" + N(v.AMLEdition) + "|" + B(v.IsArchived) + "|" + N(v.Description) + "|" + N(v.DownloadLink) + "|" +
            Links(v.DownloadLinks) + "|" + N(v.Sources) + "|" + N(v.Signature) + "|" + N(v.PublicKey) + "|lib=" + (v.Library == null ? "null" : N(v.Library.Name)) + "|rev=" + Chain(v) + ")";
#pragma warning restore CS0618
    }

    static string Dump(PublicLibraryCatalog? c)
    {
        if (c == null) return "null";
        var sb = new StringBuilder();
        sb.Append("PublicKey=").Append(N(c.PublicKey));
        if (c.LibraryTypes == null) return sb.Append("\ntypes=null").ToString();
        for (var i = 0; i < c.LibraryTypes.Count; i++)
        {
            var t = c.LibraryTypes[i];
            sb.Append("\nT").Append(i).Append('=').Append(LT(t));
            if (t?.Libraries == null) continue;
            for (var j = 0; j < t.Libraries.Count; j++)
            {
                var l = t.Libraries[j];
                sb.Append("\nT").Append(i).Append('L').Append(j).Append('=').Append(L(l));
                if (l?.Versions == null) continue;
                for (var k = 0; k < l.Versions.Count; k++)
                {
                    var v = l.Versions[k];
                    sb.Append("\nT").Append(i).Append('L').Append(j).Append('V').Append(k).Append('=').Append(V(v));
                    if (v != null) sb.Append("|libref=").Append(v.Library == null ? "null" : ReferenceEquals(v.Library, l) ? "own" : "other");
                }
            }
        }
        return sb.ToString();
    }

    static string Owner(PublicLibraryCatalog.LibraryVersion v, ISignedLibraryVersion owner)
    {
        if (ReferenceEquals(owner, v)) return "v";
        var k = 1;
        for (var r = v.Revision; r != null && k < 100; r = r.Revision, k++)
            if (ReferenceEquals(r, owner)) return "r" + k;
        return "?";
    }

    static string LinkList(IEnumerable<(string, ISignedLibraryVersion)> links, PublicLibraryCatalog.LibraryVersion v) =>
        "[" + string.Join(",", links.Select(t => N(t.Item1) + "@" + Owner(v, t.Item2))) + "]";

    // ---------------------------------------------------------------- 1. catalogs

    static readonly MethodInfo FormatMethod = typeof(PublicLibraryCatalog.Library).GetMethod("FormatCAEXVersionString", BindingFlags.Static | BindingFlags.NonPublic)!;
    static readonly MethodInfo GetLinksMethod = typeof(SignedLibraryVersionExtensions).GetMethod("GetLinks", BindingFlags.Static | BindingFlags.NonPublic)!;
    static readonly MethodInfo TransformLinkMethod = typeof(SignedLibraryVersionExtensions).GetMethod("TransformLink", BindingFlags.Static | BindingFlags.NonPublic)!;
    static readonly MethodInfo ReadInfoMethod = typeof(AMLLibraries).GetMethod("ReadAutomationMLLibraryInformation", BindingFlags.Static | BindingFlags.NonPublic)!;

    static PublicLibraryCatalog? ReadInfo(string? file) => (PublicLibraryCatalog?)ReadInfoMethod.Invoke(null, new object?[] { file });

    static string Deser(Func<PublicLibraryCatalog?> f, out PublicLibraryCatalog? c)
    {
        try
        {
            c = f();
            return Dump(c);
        }
        catch (Exception e)
        {
            c = null;
            return Ex(e);
        }
    }

    static JsonObject Catalogs(JsonArray cases)
    {
        var o = new JsonObject();
        var assembly = typeof(AMLLibraries).Assembly;
        foreach (var node in cases)
        {
            var name = node!["name"]!.GetValue<string>();
            Case(o, name, r =>
            {
                PublicLibraryCatalog? c = null;
                byte[]? bytes = null;
                if (node["resource"] is JsonNode res)
                {
                    using var s = assembly.GetManifestResourceStream(res.GetValue<string>())!;
                    using var ms = new MemoryStream();
                    s.CopyTo(ms);
                    bytes = ms.ToArray();
                }
                else if (node["bytes"] is JsonNode b64)
                {
                    bytes = Convert.FromBase64String(b64.GetValue<string>());
                }
                else if (node["text"] is JsonNode textNode)
                {
                    var text = Str(textNode)!;
                    r.Add("str=" + Deser(() => JsonSerializer.Deserialize<PublicLibraryCatalog>(text), out c));
                    bytes = Encoding.UTF8.GetBytes(text);
                    var bom = new byte[] { 0xEF, 0xBB, 0xBF }.Concat(bytes).ToArray();
                    r.Add("bom=" + Deser(() => JsonSerializer.Deserialize<PublicLibraryCatalog>(new MemoryStream(bom)), out _));
                }
                else
                {
                    c = new PublicLibraryCatalog();
                }
                if (bytes != null)
                {
                    r.Add("stream=" + Deser(() => JsonSerializer.Deserialize<PublicLibraryCatalog>(new MemoryStream(bytes)), out var cs));
                    var file = Path.Combine(workDir, name + ".json");
                    File.WriteAllBytes(file, bytes);
                    r.Add("file=" + Deser(() => ReadInfo(file), out _));
                    if (c == null && node["text"] == null) c = cs;
                }
                if (c == null)
                {
                    r.Add("nocatalog");
                    return;
                }
                var ops = node["ops"]!.AsArray();
                for (var i = 0; i < ops.Count; i++)
                {
                    var op = ops[i]!.AsArray();
                    r.Add(i + ":" + op[0]!.GetValue<string>() + "=" + T(() => Op(c, op)));
                }
                // The final state with the default options (compact) and indented.
                r.V("compact", () => JsonSerializer.Serialize(c));
                r.V("indented", () => JsonSerializer.Serialize(c, new JsonSerializerOptions { WriteIndented = true }));
            });
        }
        // ReadAutomationMLLibraryInformation with missing arguments and files.
        Case(o, "readinfo", r =>
        {
            r.V("null", () => Dump(ReadInfo(null)));
            r.V("empty", () => Dump(ReadInfo("")));
            r.V("missing", () => Dump(ReadInfo(Path.Combine(workDir, "missing.json"))));
            r.V("missing-dir", () => Dump(ReadInfo(Path.Combine(workDir, "no-dir", "missing.json"))));
            r.V("deserializeNull", () => Dump(JsonSerializer.Deserialize<PublicLibraryCatalog>((string)null!)));
        });
        return o;
    }

    static string? S(JsonArray op, int i) => Str(op[i]);
    static int I(JsonArray op, int i) => op[i]!.GetValue<int>();

    static PublicLibraryCatalog.LibraryVersion? Ver(PublicLibraryCatalog c, JsonArray op)
    {
        var l = c[S(op, 1)!, S(op, 2)!];
        var idx = I(op, 3);
        return l?.Versions != null && idx < l.Versions.Count ? l.Versions[idx] : null;
    }

    static ISignedLibraryVersion? Target(PublicLibraryCatalog.LibraryVersion v, int depth)
    {
        ISignedLibraryVersion? t = v;
        for (var i = 0; i < depth && t != null; i++) t = t.Revision;
        return t;
    }

    static object? Op(PublicLibraryCatalog c, JsonArray op)
    {
        var name = op[0]!.GetValue<string>();
        switch (name)
        {
            case "item": return LT(c[S(op, 1)!]);
            case "item2": return L(c[S(op, 1)!, S(op, 2)!]);
            case "getPub": return V(c.GetPublishedLibraryVersion(S(op, 1)!, S(op, 2)!, S(op, 3)!, S(op, 4)!));
            case "isArchived": return c.IsArchived(S(op, 1)!, S(op, 2)!, S(op, 3)!);
            case "listed": return c.LibraryVersionIsListed(S(op, 1)!, S(op, 2)!, S(op, 3)!, S(op, 4)!);
            case "libVersion": return V(c.LibVersion(S(op, 1)!, S(op, 2)!, S(op, 3)!, S(op, 4)!));
            case "libVersions": return c.LibVersions(S(op, 1)!, S(op, 2)!, S(op, 3)!);
            case "libraries": return c.Libraries(S(op, 1)!);
            case "getOrCreate":
            {
                var t = c.GetOrCreate(S(op, 1)!);
                return LT(t) + "|count=" + c.LibraryTypes.Count;
            }
            case "getOrCreateLib":
            {
                var t = c.GetOrCreate(S(op, 1)!);
                var l = t.GetOrCreate(S(op, 2)!);
                return L(l) + "|count=" + t.Libraries.Count;
            }
            case "highest":
            {
                var l = c[S(op, 1)!, S(op, 2)!];
                return l == null ? "nolib" : V(l.HighestVersion(S(op, 3)!));
            }
            case "format": return FormatMethod.Invoke(null, new object?[] { S(op, 1) });
            case "addVersion":
            {
                var l = c.GetOrCreate(S(op, 1)!).GetOrCreate(S(op, 2)!);
                l.Versions.Add(new PublicLibraryCatalog.LibraryVersion { Version = S(op, 3)!, CAEXVersion = S(op, 4)!, AMLEdition = S(op, 5)! });
                return L(l);
            }
            case "dump": return Dump(c);
            case "serialize":
            {
                using var s = (MemoryStream)c.SerializeToStream();
                var bytes = s.ToArray();
                return F(bytes) + "|" + Encoding.UTF8.GetString(bytes);
            }
            case "save":
            {
                var p = S(op, 1);
                var path = p == null ? null : p.Length == 0 ? "" : Path.Combine(workDir, p);
                c.Save(path!);
                var bytes = File.ReadAllBytes(path!);
                return F(bytes) + "|" + Encoding.UTF8.GetString(bytes);
            }
            case "onDeserialized":
                ((IJsonOnDeserialized)c).OnDeserialized();
                return Dump(c);
            case "custom": return Custom();
        }
        var v = Ver(c, op);
        if (v == null) return "nover";
        switch (name)
        {
            case "isCaex": return v.IsCaexVersion(S(op, 4)!);
            case "semver":
            {
                var sv = v.SemanticVersion;
                return F(sv) + "|" + N(v.Version) + "|" + T(() => v.NetVersion);
            }
            case "addSource":
                v.AddSource(S(op, 4)!);
                return N(v.Sources);
            case "links": return LinkList(v.AllDownloadLinks, v);
            case "set":
            {
                var value = S(op, 5);
                switch (S(op, 4))
                {
                    case "Version": v.Version = value!; break;
                    case "CAEXVersion": v.CAEXVersion = value!; break;
                    case "AMLEdition": v.AMLEdition = value!; break;
                    case "Description": v.Description = value!; break;
                    case "Sources": v.Sources = value!; break;
                    case "PublicKey": v.PublicKey = value!; break;
                    case "IsArchived": v.IsArchived = value == "true"; break;
                    case "DownloadLinks": v.DownloadLinks = value?.Split('|').ToList()!; break;
                }
                return V(v);
            }
        }
        var target = Target(v, I(op, 4));
        if (target == null) return "norev";
        switch (name)
        {
            case "addLink":
                target.AddDownloadLink(S(op, 5)!);
                return Links(target.DownloadLinks);
            case "addRev":
            {
                var rev = target.AddRevision(S(op, 5)!);
                return R((PublicLibraryCatalog.LibraryRevision)rev, v) + "|chain=" + Chain(v);
            }
            case "addRevObj":
            {
                var nested = S(op, 6);
#pragma warning disable CS0618
                var obj = new PublicLibraryCatalog.LibraryRevision { Signature = S(op, 5)!, DownloadLink = "dl", Revision = nested == null ? null! : new PublicLibraryCatalog.LibraryRevision { Signature = nested } };
#pragma warning restore CS0618
                var rev = target.AddRevision(obj);
                return B(ReferenceEquals(rev, obj)) + "|" + R((PublicLibraryCatalog.LibraryRevision)rev, v) + "|chain=" + Chain(v);
            }
            case "ext": return T(() => target.Description()) + "|" + T(() => target.LibraryName()) + "|" + T(() => target.Version());
            case "setDesc":
                target.SetDescription(S(op, 5)!);
                return N(v.Description);
            case "getLinks": return LinkList((IEnumerable<(string, ISignedLibraryVersion)>)GetLinksMethod.Invoke(null, new object[] { target })!, v);
            case "transform":
#pragma warning disable CS0618
                target.DownloadLink = S(op, 5)!;
                TransformLinkMethod.Invoke(null, new object[] { target });
                return N(target.DownloadLink) + "|" + Links(target.DownloadLinks);
#pragma warning restore CS0618
        }
        throw new InvalidOperationException("unknown op " + name);
    }

    /// <summary>An ISignedLibraryVersion that is neither a LibraryVersion nor a LibraryRevision.</summary>
    sealed class CustomSigned : ISignedLibraryVersion
    {
        public string DownloadLink { get; set; } = null!;
        public List<string> DownloadLinks { get; set; } = null!;
        public PublicLibraryCatalog.LibraryRevision Revision { get; set; } = null!;
        public string Signature { get; set; } = null!;
    }

    static string Custom()
    {
        var x = new CustomSigned();
        var parts = new List<string>
        {
            T(() => x.Description()),
            T(() => x.LibraryName()),
            T(() => x.Version()),
            T(() => { x.SetDescription("d"); return "set"; }),
            T(() => { x.AddDownloadLink("a"); x.AddDownloadLink("a"); x.AddDownloadLink(""); x.AddDownloadLink(null!); return Links(x.DownloadLinks); }),
            T(() => string.Join(",", ((IEnumerable<(string, ISignedLibraryVersion)>)GetLinksMethod.Invoke(null, new object[] { x })!).Select(t => t.Item1 + "@" + (ReferenceEquals(t.Item2, x) ? "x" : "?")))),
            T(() => x.AddRevision("s")),
            T(() => x.Revision),
            T(() => x.AddRevision(new PublicLibraryCatalog.LibraryRevision())),
            T(() => x.Revision == null ? "null" : R(x.Revision, null)),
        };
        // A revision whose related version is null: the extension methods are called with null.
        var orphan = new PublicLibraryCatalog.LibraryRevision();
        parts.Add(T(() => orphan.Description()) + "/" + T(() => orphan.LibraryName()) + "/" + T(() => orphan.Version()));
        parts.Add(T(() => { orphan.SetDescription("x"); return "set"; }));
        parts.Add(T(() => orphan.AddRevision("o")));
        parts.Add(T(() => R(orphan.Revision, null)));
        var empty = new CustomSigned { DownloadLinks = new List<string>() };
        parts.Add(T(() => ((IEnumerable)GetLinksMethod.Invoke(null, new object[] { empty })!).Cast<object>().Count()));
        empty.DownloadLink = "moved";
        TransformLinkMethod.Invoke(null, new object[] { empty });
        parts.Add(N(empty.DownloadLink) + Links(empty.DownloadLinks));
        var none = new CustomSigned();
        TransformLinkMethod.Invoke(null, new object[] { none });
        parts.Add(N(none.DownloadLink) + Links(none.DownloadLinks));
        // GetLinks captures the list when it is called; items added later are enumerated (deferred Select).
        var lazy = new CustomSigned { DownloadLinks = new List<string> { "1" } };
        var seq = (IEnumerable<(string, ISignedLibraryVersion)>)GetLinksMethod.Invoke(null, new object[] { lazy })!;
        lazy.DownloadLinks.Add("2");
        lazy.DownloadLinks = new List<string> { "other" };
        parts.Add(string.Join(",", seq.Select(t => t.Item1)));
        var lazyEmpty = new CustomSigned { DownloadLinks = new List<string>() };
        var seq2 = (IEnumerable<(string, ISignedLibraryVersion)>)GetLinksMethod.Invoke(null, new object[] { lazyEmpty })!;
        lazyEmpty.DownloadLinks.Add("late");
        parts.Add("[" + string.Join(",", seq2.Select(t => t.Item1)) + "]");
        // AllDownloadLinks is evaluated lazily too.
        var lv = new PublicLibraryCatalog.LibraryVersion { Version = "1" };
        var all = lv.AllDownloadLinks;
        lv.AddDownloadLink("a1");
        lv.AddRevision("s").AddDownloadLink("r1");
        parts.Add("[" + string.Join(",", all.Select(t => t.LinkAddress + "@" + Owner(lv, t.Revision))) + "]|[" + string.Join(",", lv.AllDownloadLinks.Select(t => t.LinkAddress + "@" + Owner(lv, t.Revision))) + "]");
        return string.Join(" ; ", parts);
    }

    // ---------------------------------------------------------------- 2. file models

    static readonly string[] Editions = { "2.0", "2.1", "2.10", "3.0", "", null! };

    static string Props(AMLFileMetaModel m) => string.Join("|", new[]
    {
        T(() => m.ContentType), T(() => m.FilePath), T(() => m.URL), T(() => m.FileName), T(() => m.FileType), T(() => m.Producer), T(() => m.Domain),
        T(() => m.SubDomain), T(() => m.MainDomain), T(() => m.LibType), T(() => m.Extension), T(() => m.Edition), T(() => m.Version), T(() => m.SemanticVersion),
        T(() => m.AliasNameFromParts), T(() => m.IdentifyingName), T(() => m.FileNameFromParts), T(() => m.IsConsistent), T(() => m.IsExtension), T(() => m.Alias),
        string.Concat(Editions.Select(e => m.IsDocumentEdition(e) ? "1" : "0")), T(() => m.IsNewVersion(null!)), T(() => m.IsNewVersion(m)),
    });

    static readonly int[] ContentTypes = { 0, 1, 2 };

    static JsonObject Files(object?[] names)
    {
        var o = new JsonObject();
        var models = new List<AMLFileMetaModel>();
        for (var i = 0; i < names.Length; i++)
        {
            var name = (string)names[i]!;
            var i1 = i;
            Case(o, i + ":" + name, r =>
            {
                var cts = ContentTypes.Concat(new[] { 3 + i1 % 5 }).Concat(i1 % 7 == 0 ? new[] { 99 } : Array.Empty<int>());
                foreach (var ct in cts)
                {
                    AMLFileMetaModel m;
                    try { m = new AMLFileMetaModel(name, (AMLFileContentType)ct); }
                    catch (Exception e)
                    {
                        r.Add(ct + ":new=" + Ex(e));
                        continue;
                    }
                    r.Add(ct + "=" + Props(m));
                    if (ct == 0 && i1 % 3 == 0) models.Add(m);
                    if (i1 % 5 == 0)
                    {
                        var other = (string)names[(i1 * 7 + 3) % names.Length]!;
                        r.Do(ct + ":setFileName", () => m.SetFileName(other));
                        r.Add(ct + ":after=" + Props(m));
                    }
                    if (i1 % 5 == 1)
                    {
                        var other = (string)names[(i1 * 11 + 5) % names.Length]!;
                        r.Do(ct + ":url", () => m.URL = other);
                        r.V(ct + ":fileType", () => m.FileType);
                        r.Do(ct + ":urlNull", () => m.URL = null!);
                        r.V(ct + ":fileTypeNull", () => m.FileType);
                    }
                    if (i1 % 50 == 2)
                    {
                        r.Do(ct + ":setFileNameNull", () => m.SetFileName(null!));
                        r.Add(ct + ":afterNull=" + Props(m));
                        m.Producer = "P"; m.Domain = " "; m.LibType = "\t"; m.Edition = "E"; m.Version = "1.0.0"; m.Extension = ""; m.Alias = "alias";
                        r.Add(ct + ":edited=" + Props(m));
                        m.FilePath = null!;
                        m.Producer = null!; m.Domain = null!; m.LibType = null!; m.Edition = null!; m.Version = null!;
                        r.Add(ct + ":cleared=" + Props(m));
                        m.Extension = "X";
                        r.Add(ct + ":extensionOnly=" + Props(m));
                    }
                }
            });
        }
        Case(o, "null-path", r =>
        {
            foreach (var ct in new[] { 0, 1, 2, 3, 7 }) r.V(ct + ":new", () => Props(new AMLFileMetaModel(null!, (AMLFileContentType)ct)));
        });
        Case(o, "constants", r =>
        {
            r.Add(AMLFileMetaModel.SubNameChar + "|" + AMLFileMetaModel.AML_PRODUCER + "|" + AMLFileMetaModel.AMLEdition1 + "|" + AMLFileMetaModel.AMLEdition2 + "|" +
                AMLFileMetaModel.BASE_DOMAIN + "|" + AMLFileMetaModel.AUTOMATIONCOMPONENT_DOMAIN + "|" + AMLFileMetaModel.LOGIC_DOMAIN + "|" + PublicLibraryCatalog.FileName);
        });
        // GetLatestVersions over a third of the library file models (lazy, the list is enumerated again for each document).
        Case(o, "latest-all", r =>
        {
            var index = new Dictionary<AMLFileMetaModel, int>(ReferenceEqualityComparer.Instance);
            for (var k = 0; k < models.Count; k++) index[models[k]] = k;
            r.Add(string.Join(",", AMLFileMetaModel.GetLatestVersions(models).Select(m => index[m])));
        });
        return o;
    }

    static JsonObject Groups(JsonArray groups)
    {
        var o = new JsonObject();
        for (var g = 0; g < groups.Count; g++)
        {
            var names = groups[g]!.AsArray().Select(n => n!.GetValue<string>()).ToList();
            var g1 = g;
            Case(o, "group" + g, r =>
            {
                var ct = g1 % 4 == 3 ? AMLFileContentType.ExampleFile : AMLFileContentType.LibraryFile;
                var models = names.Select(n => new AMLFileMetaModel(n, ct)).ToList();
                for (var a = 0; a < models.Count; a++)
                    r.Add(a + "=" + string.Concat(models.Select(b => T(() => models[a].IsNewVersion(b)) == "true" ? "1" : "0")));
                var index = new Dictionary<AMLFileMetaModel, int>(ReferenceEqualityComparer.Instance);
                for (var k = 0; k < models.Count; k++) index[models[k]] = k;
                r.V("latest", () => string.Join(",", AMLFileMetaModel.GetLatestVersions(models).Select(m => index[m])));
                r.V("latestEmpty", () => AMLFileMetaModel.GetLatestVersions(new List<AMLFileMetaModel>()).Count());
                // Mixed with a model of another content type (no consistent library type).
                var mixed = models.Concat(new[] { new AMLFileMetaModel(names[0], AMLFileContentType.LibraryCollectionFile) }).ToList();
                r.V("latestMixed", () => string.Join(",", AMLFileMetaModel.GetLatestVersions(mixed).Select(m => mixed.IndexOf(m))));
            });
        }
        return o;
    }

    // ---------------------------------------------------------------- 3. misc

    record DerivedItem(string ClassName) : ClassRepositoryItem(ClassName, "", "", "", "", "");

    static JsonObject Misc(JsonArray itemNodes)
    {
        var o = new JsonObject();
        var editions = new[] { "AMLEd1", "AMLEd2", null, "", "amled1", "AMLEd3" };
        Case(o, "domainString", r =>
        {
            for (var d = -1; d <= 16; d++)
                foreach (var e in editions)
                    r.V(d + ":" + N(e), () => ((AMLDomainEnum)d).DomainString(e!));
        });
        Case(o, "libraryName", r =>
        {
            var combos = new (string?, string?, string?)[] { ("AutomationML", "Base", null), ("AutomationML", "Base", ""), ("AutomationML", "Base", "Ext"), (null, null, null), ("", "", ""), ("P_x", "D.y", "E"), (null, "D", "E") };
            for (var t = -1; t <= 5; t++)
                foreach (var (p, d, x) in combos)
                    r.V(t + ":" + N(p) + ":" + N(d) + ":" + N(x), () => AMLLibraryModel.LibraryName(p!, d!, (AMLLibraryTypeEnum)t, x!));
            r.V("default", () => AMLLibraryModel.LibraryName("A", "B", AMLLibraryTypeEnum.RoleClass));
        });
        Case(o, "resourceStream", r =>
        {
            var inputs = new (byte[]?, int, string?)[] { (new byte[] { 1, 2, 3 }, 0, "a.aml"), (null, 4, null), (Array.Empty<byte>(), 99, ""), (Encoding.UTF8.GetBytes("<CAEXFile/>"), 1, "x.amlx") };
            foreach (var (b, t, n) in inputs)
            {
                var s = new AMLResourceStream(b == null ? null! : new MemoryStream(b), (AMLFileType)t, n!);
                r.Add(F(s.AMLFileType) + "|" + N(s.AMLFileName) + "|" + (s.AMLFileStream == null ? "null" : F(((MemoryStream)s.AMLFileStream).ToArray())));
            }
        });
        Case(o, "enums", r =>
        {
            foreach (var t in new[] { typeof(AMLFileContentType), typeof(AMLFileType), typeof(AMLDomainEnum), typeof(AMLLibraryTypeEnum), typeof(StringComparisonAlgorithmEnum) })
                r.Add(t.Name + "=" + string.Join(",", Enum.GetValues(t).Cast<Enum>().Select(e => e + ":" + Convert.ToInt32(e))));
        });
        Case(o, "items", r =>
        {
            var items = itemNodes.Select(n => { var a = n!.AsArray(); return new ClassRepositoryItem(Str(a[0])!, Str(a[1])!, Str(a[2])!, Str(a[3])!, Str(a[4])!, Str(a[5])!, Str(a[6])!); }).ToList();
            for (var i = 0; i < items.Count; i++)
            {
                var a = items[i];
                r.V(i + ":toString", () => a.ToString());
                r.V(i + ":props", () => string.Join("|", N(a.ClassName), N(a.CaexPath), N(a.BasePath), N(a.LibraryName), N(a.LibraryVersion), N(a.AMLEdition), N(a.ID)));
                var (cn, cp, bp, ln, lv, ae, id) = a;
                r.V(i + ":deconstruct", () => string.Join("|", N(cn), N(cp), N(bp), N(ln), N(lv), N(ae), N(id)));
                r.V(i + ":equalsNull", () => B(a.Equals(null)) + "|" + B(a == null) + "|" + B(a != null) + "|" + B(null == a));
                r.V(i + ":equalsOther", () => B(a.Equals((object)"x")) + "|" + B(a.Equals((object)a)) + "|" + B(a.Equals(new DerivedItem(a.ClassName))));
                var w = a with { ClassName = "W" };
                r.V(i + ":with", () => w + "|" + B(w.Equals(a)) + "|" + B((w with { ClassName = a.ClassName }).Equals(a)) + "|" + B(ReferenceEquals(a with { }, a)) + "|" + B((a with { }).Equals(a)));
                for (var j = 0; j < items.Count; j++)
                {
                    var b = items[j];
                    r.Add(i + "," + j + "=" + B(a.Equals(b)) + B(a.Equals((object)b)) + B(a == b) + B(a != b) + B(a.GetHashCode() == b.GetHashCode()));
                }
            }
            ClassRepositoryItem? n1 = null, n2 = null;
            r.Add("nulls=" + B(n1 == n2) + B(n1 != n2) + B(n1 == items[0]) + B(items[0] != n1));
        });
        return o;
    }

    // ---------------------------------------------------------------- 4. converters

    static readonly (string, Type)[] TypeArgs = { ("string", typeof(string)), ("double", typeof(double)), ("bool", typeof(bool)), ("object", typeof(object)), ("null", null!) };

    static JsonObject Converters(object?[] enumStrings, object?[] semverStrings)
    {
        var o = new JsonObject();
        var enums = new[] { typeof(AMLFileContentType), typeof(AccessRightsEnum), typeof(AMLEditionEnum), typeof(CAEXDocument.CAEXSchema), typeof(AMLFileType), typeof(StringComparisonAlgorithmEnum) };
        foreach (var et in enums)
        {
            Case(o, "enum:" + et.Name, r =>
            {
                var conv = new EnumDescriptionTypeConverter(et);
                var max = Enum.GetValues(et).Cast<object>().Select(Convert.ToInt32).Max();
                for (var v = -1; v <= max + 1; v++)
                {
                    var value = Enum.ToObject(et, v);
                    r.V("to:" + v, () => conv.ConvertTo(null, null, value, typeof(string)));
                    r.V("toCulture:" + v, () => conv.ConvertTo(null, System.Globalization.CultureInfo.GetCultureInfo("de-DE"), value, typeof(string)));
                    foreach (var (tn, t) in TypeArgs.Skip(1)) r.V("to:" + v + ":" + tn, () => conv.ConvertTo(null, null, value, t));
                }
                r.V("to:99", () => conv.ConvertTo(null, null, Enum.ToObject(et, 99), typeof(string)));
                foreach (var x in new object?[] { null, "Empty", "LibraryFile", "", true })
                    r.V("toValue:" + F(x), () => conv.ConvertTo(null, null, x, typeof(string)));
                r.V("toNullDouble", () => conv.ConvertTo(null, null, null, typeof(double)));
                r.V("toStringDouble", () => conv.ConvertTo(null, null, "x", typeof(double)));
                foreach (var s in enumStrings) r.V("from:" + F(s), () => conv.ConvertFrom(null, null, s!));
                foreach (var x in new object?[] { null, 5, true, 1.5 }) r.V("fromValue:" + F(x), () => conv.ConvertFrom(null, null, x!));
                foreach (var (tn, t) in TypeArgs)
                {
                    r.V("canFrom:" + tn, () => conv.CanConvertFrom(null, t));
                    r.V("canTo:" + tn, () => conv.CanConvertTo(null, t));
                }
            });
        }
        Case(o, "semver", r =>
        {
            var conv = new SemanticVersionTypeConverter();
            foreach (var (tn, t) in TypeArgs)
            {
                r.V("canFrom:" + tn, () => conv.CanConvertFrom(null, t));
                r.V("canTo:" + tn, () => conv.CanConvertTo(null, t));
            }
            foreach (var s in semverStrings) r.V("from:" + F(s), () => conv.ConvertFrom(null, null, s!));
            foreach (var x in new object?[] { null, 5, true }) r.V("fromValue:" + F(x), () => conv.ConvertFrom(null, null, x!));
            var sv = new SemanticVersion("1.0.0-beta");
            foreach (var x in new object?[] { sv, null, "abc", 5 })
                foreach (var (tn, t) in TypeArgs)
                    r.V("to:" + F(x) + ":" + tn, () => conv.ConvertTo(null, null, x, t));
        });
        Case(o, "typeconverter", r =>
        {
            var conv = new TypeConverter();
            foreach (var (tn, t) in TypeArgs)
            {
                r.V("canFrom:" + tn, () => conv.CanConvertFrom(null, t));
                r.V("canTo:" + tn, () => conv.CanConvertTo(null, t));
            }
            foreach (var x in new object?[] { "x", null, 5, true, 2.5, 5L, new object() })
            {
                r.V("from:" + F(x), () => conv.ConvertFrom(null, null, x!));
                foreach (var (tn, t) in TypeArgs) r.V("to:" + F(x) + ":" + tn, () => conv.ConvertTo(null, null, x, t));
            }
        });
        return o;
    }

    // ---------------------------------------------------------------- 6. profiles

    /// <summary>
    /// AMLLibraryServerProfile.LoadFromString (Aml.Engine): regression cases for the System.Text.Json
    /// emulation that the profile shares with the catalog.
    /// </summary>
    static JsonObject Profiles(object?[] texts)
    {
        var o = new JsonObject();
        Case(o, "load", r =>
        {
            for (var i = 0; i < texts.Length; i++)
            {
                var text = (string)texts[i]!;
                r.V(i.ToString(), () =>
                {
                    var p = AMLLibraryServerProfile.LoadFromString(text);
                    return N(p.UserName) + "|" + p.PortNumber + "|" + (p.LibraryData == null ? "null" : p.LibraryData.Count.ToString());
                });
            }
        });
        return o;
    }

    // ---------------------------------------------------------------- 5. embedded resources

    static JsonObject Resources()
    {
        var o = new JsonObject();
        var assembly = typeof(AMLLibraries).Assembly;
        var names = assembly.GetManifestResourceNames().OrderBy(n => n, StringComparer.Ordinal).ToList();
        Case(o, "names", r => { foreach (var n in names) r.Add(n); });
        Case(o, "streams", r =>
        {
            foreach (var n in names.Concat(new[] { names[0].ToLowerInvariant(), names[0] + " ", "", "Aml.Engine.Resources.Resources.AutomationMLLibs", "AutomationMLLibs.json" }))
            {
                r.V(n, () =>
                {
                    using var s = assembly.GetManifestResourceStream(n);
                    if (s == null) return null;
                    using var ms = new MemoryStream();
                    s.CopyTo(ms);
                    return ms.ToArray();
                });
            }
            r.V("null", () => assembly.GetManifestResourceStream((string)null!));
        });
        return o;
    }
}
