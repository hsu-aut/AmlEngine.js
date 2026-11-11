using System.Collections;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Aml.Engine.CAEX;
using Aml.Engine.Services;
using Aml.Engine.Services.Interfaces;

namespace Oracle;

/// <summary>
/// svc-split &lt;casesDir&gt; &lt;workDir&gt; &lt;outDir&gt;: SplitService and MergeService of
/// Aml.Engine.Services. Runs the scripts of &lt;casesDir&gt;/cases.json (scripts/gen-services-split.mjs);
/// every case runs in its own directory &lt;workDir&gt;/&lt;case&gt; (also the current directory, so that
/// relative paths resolve there) and writes &lt;outDir&gt;/&lt;case&gt;.json: per operation the result and a
/// hash of all documents, at the end the documents (file path, canonical text), every file in the
/// work directory (relative path, canonical text) and the registered services. The JS twin is
/// test/services/split.oracle.test.ts; keep both in sync.
/// Canonical text: the work directory becomes &lt;DIR&gt;, timestamps of "now" NOW, GUIDs G1, G2, ...
/// in the order of their first appearance (new IDs of mirrors and documents are random).
/// </summary>
public static class ServicesSplitOracle
{
    sealed class Ctx
    {
        public string W = "";
        public readonly List<(string Name, CAEXDocument? Doc)> Docs = new();
        public SplitService Split = null!;
        public readonly MergeService Merge = new();

        public CAEXDocument? Doc(string? name)
        {
            if (name == null || name == "null") return null;
            foreach (var (n, d) in Docs) if (n == name) return d;
            throw new NoDocumentException();
        }

        public void Set(string name, CAEXDocument? doc)
        {
            for (int i = 0; i < Docs.Count; i++)
                if (Docs[i].Name == name) { Docs[i] = (name, doc); return; }
            Docs.Add((name, doc));
        }
    }

    /// <summary>An operation names a document the case does not have (e.g. a split that failed).</summary>
    sealed class NoDocumentException : Exception { }

    sealed class Canon
    {
        readonly string _w;
        readonly Dictionary<string, string> _map = new();
        static readonly Regex Guid = new("[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
        static readonly Regex Us = new(@"(\d{2})/(\d{2})/(\d{4}) \d{2}:\d{2}:\d{2}");
        static readonly Regex Iso = new(@"(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?");

        public Canon(string w) => _w = w;

        static bool Recent(int y, int mo, int d)
        {
            try { return Math.Abs((new DateTime(y, mo, d) - DateTime.Today).TotalDays) <= 1.05; }
            catch { return false; }
        }

        public string Apply(string text)
        {
            text = text.Replace(_w, "<DIR>", StringComparison.OrdinalIgnoreCase);
            text = text.Replace(_w.Replace('\\', '/'), "<DIR>", StringComparison.OrdinalIgnoreCase);
            text = Us.Replace(text, m => Recent(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value)) ? "NOW" : m.Value);
            text = Iso.Replace(text, m => Recent(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value)) ? "NOW" : m.Value);
            return Guid.Replace(text, m =>
            {
                var k = m.Value.ToLowerInvariant();
                if (!_map.TryGetValue(k, out var id)) { id = "G" + (_map.Count + 1); _map[k] = id; }
                return id;
            });
        }
    }

    static Dictionary<string, IAMLService> Services() =>
        (Dictionary<string, IAMLService>)typeof(ServiceLocator).GetField("ServicesDictionary", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!;

    public static void Run(string[] args)
    {
        var casesDir = Path.GetFullPath(args[0]);
        var workRoot = Path.GetFullPath(args[1]);
        var outDir = Path.GetFullPath(args[2]);
        var corpusDir = Path.GetFullPath(Path.Combine(casesDir, "..", "..", "corpus"));
        var cases = JsonNode.Parse(File.ReadAllText(Path.Combine(casesDir, "cases.json")))!.AsArray();
        if (Directory.Exists(workRoot)) Directory.Delete(workRoot, true);
        Directory.CreateDirectory(outDir);
        var cwd = Directory.GetCurrentDirectory();
        foreach (var cs in cases)
        {
            var name = cs!["name"]!.GetValue<string>();
            var w = Path.Combine(workRoot, name);
            foreach (var sub in new[] { "a", "b", "a2" }) Directory.CreateDirectory(Path.Combine(w, sub));
            Directory.SetCurrentDirectory(w);
            var c = new Ctx { W = w };
            var canon = new Canon(w);
            var result = new JsonObject();
            try
            {
                foreach (var s in cs["services"]!.AsArray()) Register(c, s!.GetValue<string>());
                c.Split = SplitService.Register();
                foreach (var d in cs["docs"]!.AsArray()) LoadDoc(c, d!.AsObject(), corpusDir, casesDir);
                var steps = new JsonArray();
                foreach (var op in cs["ops"]!.AsArray())
                {
                    string r;
                    try { r = Apply(c, canon, op!.AsObject()); }
                    catch (Exception e) { r = Ex(e); }
                    r = canon.Apply(r);
                    steps.Add(new JsonArray(r, EngineOpsOracle.Hash(AllTexts(c, canon))));
                }
                result["steps"] = steps;
                var docs = new JsonArray();
                foreach (var (n, d) in c.Docs)
                    docs.Add(new JsonArray(n, canon.Apply(Try(() => d?.FilePath)), DocText(d, canon)));
                result["docs"] = docs;
                var files = new JsonArray();
                foreach (var (rel, text) in Files(w)) files.Add(new JsonArray(rel, canon.Apply(text)));
                result["files"] = files;
                result["services"] = ServicesState();
            }
            catch (Exception e)
            {
                result["error"] = Ex(e);
            }
            finally
            {
                Cleanup();
                Directory.SetCurrentDirectory(cwd);
            }
            File.WriteAllText(Path.Combine(outDir, name + ".json"), result.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
        }
    }

    static string Ex(Exception e) =>
        "!" + e.GetType().Name + (e is ArgumentException ae && ae.ParamName != null ? "(" + ae.ParamName + ")" : "");

    static string Try(Func<string?> f)
    {
        try { return f() ?? "null"; }
        catch (Exception e) { return Ex(e); }
    }

    static string DocText(CAEXDocument? d, Canon canon) =>
        d == null ? "null" : canon.Apply(Try(() => EngineOpsOracle.Save(d)));

    static string AllTexts(Ctx c, Canon canon)
    {
        var sb = new StringBuilder();
        foreach (var (n, d) in c.Docs) sb.Append(n).Append('\n').Append(DocText(d, canon)).Append('\n');
        return sb.ToString();
    }

    /// <summary>All files below the work directory: relative path with '/', UTF-8 text without BOM.</summary>
    static IEnumerable<(string, string)> Files(string w) =>
        Directory.GetFiles(w, "*", SearchOption.AllDirectories)
            .Select(f => (Path.GetRelativePath(w, f).Replace('\\', '/'), f))
            .OrderBy(x => x.Item1, StringComparer.Ordinal)
            .Select(x =>
            {
                var b = File.ReadAllBytes(x.f);
                var start = b.Length >= 3 && b[0] == 0xEF && b[1] == 0xBB && b[2] == 0xBF ? 3 : 0;
                return (x.Item1, Encoding.UTF8.GetString(b, start, b.Length - start));
            });

    static string ServicesState() =>
        string.Join(";", Services().OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => kv.Key + "=" + kv.Value.GetType().Name));

    static void Register(Ctx c, string svc)
    {
        switch (svc)
        {
            case "undo": UndoRedoService.Register(); break;
            case "uniquename": UniqueNameService.Register(); break;
            case "lookup": LookupService.Register(); break;
            case "extref": ExternalReferenceResolver.Register(); break;
            case "transform": CAEXSchemaTransformer.Register(); break;
            case "validator": ValidatorService.Register(); break;
            case "merge": MergeService.Register(); break;
            case "split": c.Split = SplitService.Register(); break;
            default: throw new ArgumentException("unknown service " + svc);
        }
    }

    static void UnRegister(string svc)
    {
        switch (svc)
        {
            case "undo": UndoRedoService.UnRegister(); break;
            case "uniquename": UniqueNameService.UnRegister(); break;
            case "lookup": LookupService.UnRegister(); break;
            case "extref": ExternalReferenceResolver.UnRegister(); break;
            case "transform": CAEXSchemaTransformer.UnRegister(); break;
            case "validator": ValidatorService.UnRegister(); break;
            case "merge": MergeService.UnRegister(); break;
            case "split": SplitService.UnRegister(); break;
            default: throw new ArgumentException("unknown service " + svc);
        }
    }

    /// <summary>Unregisters every service and removes what the UnRegister methods leave behind.</summary>
    static void Cleanup()
    {
        foreach (var svc in new[] { "split", "merge", "undo", "uniquename", "lookup", "extref", "transform", "validator" }) UnRegister(svc);
        var dict = Services();
        foreach (var key in dict.Keys.Where(k => k != "IQuery" && k != "ICaexIDService").ToList()) dict.Remove(key);
    }

    /// <summary>"&lt;W&gt;" is the work directory, "&lt;W/&gt;" the same with forward slashes.</summary>
    static string? Path_(Ctx c, JsonNode? p)
    {
        if (p == null) return null;
        return p.GetValue<string>().Replace("<W/>", c.W.Replace('\\', '/')).Replace("<W>", c.W);
    }

    static void LoadDoc(Ctx c, JsonObject d, string corpusDir, string casesDir)
    {
        var src = d["src"]!.GetValue<string>();
        var file = src.StartsWith("corpus/") ? Path.Combine(corpusDir, src.Substring(7)) : Path.Combine(casesDir, src);
        var load = d["load"]!.GetValue<string>();
        var rel = d["path"]?.GetValue<string>() ?? "a\\src.aml";
        var name = d["name"]!.GetValue<string>();
        if (load == "string")
        {
            c.Set(name, CAEXDocument.LoadFromString(File.ReadAllText(file, Encoding.UTF8)));
            return;
        }
        var target = Path.Combine(c.W, rel);
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        File.Copy(file, target, true);
        switch (load)
        {
            case "copy": break;
            case "file": c.Set(name, CAEXDocument.LoadFromFile(target)); break;
            case "fileRel": c.Set(name, CAEXDocument.LoadFromFile(rel)); break;
            case "fileFwd": c.Set(name, CAEXDocument.LoadFromFile(target.Replace('\\', '/'))); break;
            default: throw new ArgumentException("unknown load " + load);
        }
    }

    static CAEXObject? Sel(Ctx c, JsonObject op, string key)
    {
        var s = op[key];
        if (s == null) return null;
        var doc = c.Doc(s["d"]?.GetValue<string>() ?? op["d"]!.GetValue<string>())!;
        var kind = s["k"]!.GetValue<string>();
        var all = EngineOpsOracle.Objects(doc).Where(o => kind switch
        {
            "ATL" => o is AttributeTypeLibType,
            "ICL" => o is InterfaceClassLibType,
            "RCL" => o is RoleClassLibType,
            "SUCL" => o is SystemUnitClassLibType,
            "IH" => o is InstanceHierarchyType,
            "IE" => o is InternalElementType,
            _ => throw new ArgumentException("unknown kind " + kind),
        }).ToList();
        return all.Count == 0 ? null : all[s["i"]!.GetValue<int>() % all.Count];
    }

    static ExternalReferenceType? Er(CAEXDocument doc, JsonNode? er)
    {
        var refs = doc.CAEXFile.ExternalReference.ToList();
        if (er is JsonObject o) return refs.FirstOrDefault(e => e.Alias == o["alias"]!.GetValue<string>());
        var s = er!.GetValue<string>();
        if (s == "none") return null;
        if (s == "last") return refs.LastOrDefault();
        throw new ArgumentException("unknown er " + s);
    }

    static string Str(JsonObject op, string key) => op[key]!.GetValue<string>();
    static string? StrOrNull(JsonObject op, string key) => op[key]?.GetValue<string>();

    static string Protocol(bool ok, string[]? protocol) => (ok ? "True" : "False") + "|" + (protocol == null ? "null" : string.Join("\n", protocol));

    static string DescribeDoc(CAEXDocument? d) => d == null ? "null" : "doc|" + Try(() => d.FilePath) + "|" + Try(() => d.CAEXFile.FileName);

    static string Apply(Ctx c, Canon canon, JsonObject op)
    {
        switch (Str(op, "op"))
        {
            case "set":
            {
                var sp = Sel(c, op, "s");
                if (sp == null) return "none";
                c.Split.SetSplitPoint((ISplitPoint)sp);
                return "ok";
            }
            case "unset":
            {
                var sp = Sel(c, op, "s");
                if (sp == null) return "none";
                c.Split.RemoveSplitPoint((ISplitPoint)sp);
                return "ok";
            }
            case "points":
                return string.Join(";", c.Split.SplitPoints(c.Doc(Str(op, "d"))).Select(sp => EngineOpsOracle.Describe((CAEXObject)sp)));
            case "pointsNull":
                return c.Split.SplitPoints(null!).Count().ToString();
            case "split":
            {
                var r = c.Split.Split(c.Doc(Str(op, "d"))!, StrOrNull(op, "alias")!, Path_(c, op["path"])!);
                if (r != null) c.Set(Str(op, "as"), r);
                return DescribeDoc(r);
            }
            case "split1":
            {
                var doc = c.Doc(Str(op, "d"));
                var sp = op["s"] == null ? null : Sel(c, op, "s");
                if (op["s"] != null && sp == null) return "none";
                var r = c.Split.Split(doc!, (ISplitPoint)sp!, StrOrNull(op, "alias")!, Path_(c, op["path"])!);
                if (r != null) c.Set(Str(op, "as"), r);
                return DescribeDoc(r);
            }
            case "merge":
            {
                var doc = c.Doc(Str(op, "d"))!;
                var er = Er(doc, op["er"]);
                if (op["er"] is JsonValue && er == null && Str(op, "er") != "none") return "noer";
                // the resolver would load a web address (references of corpus documents): no network in the comparison
                if (er != null && Regex.IsMatch(er.Path ?? "", "^(https?|ftp)://", RegexOptions.IgnoreCase)) return "network";
                string[]? protocol;
                bool ok = op["auto"] == null
                    ? c.Merge.Merge(doc, er!, out protocol)
                    : c.Merge.Merge(doc, er!, out protocol, op["auto"]!.GetValue<bool>());
                return Protocol(ok, protocol);
            }
            case "mergeStream":
            {
                var doc = c.Doc(Str(op, "d"));
                var er = doc == null ? null : Er(doc, op["er"]);
                var from = Str(op, "from");
                MemoryStream? stream;
                if (from == "null") stream = null;
                else if (from.StartsWith("text:")) stream = new MemoryStream(Encoding.UTF8.GetBytes(from.Substring(5)));
                else if (from.StartsWith("doc:"))
                {
                    var src = c.Doc(from.Substring(4));
                    if (src == null) return "nodoc";
                    using var s = src.SaveToStream(true);
                    stream = new MemoryStream();
                    s.Position = 0;
                    s.CopyTo(stream);
                }
                else
                {
                    var path = Path.Combine(c.W, from.Substring(5));
                    if (!File.Exists(path)) return "nofile";
                    stream = new MemoryStream(File.ReadAllBytes(path));
                }
                string[]? protocol;
                bool ok = op["auto"] == null
                    ? c.Merge.Merge(doc!, er!, stream!, out protocol)
                    : c.Merge.Merge(doc!, er!, stream!, out protocol, op["auto"]!.GetValue<bool>());
                return Protocol(ok, protocol);
            }
            case "del":
            {
                var o = Sel(c, op, "s");
                if (o == null) return "none";
                o.Remove();
                return "ok";
            }
            case "dispose":
                c.Doc(Str(op, "d"))!.Dispose();
                return "ok";
            case "save":
                c.Doc(Str(op, "d"))!.SaveToFile(Path_(c, op["path"])!, true);
                return "ok";
            case "load":
            {
                var d = CAEXDocument.LoadFromFile(Path_(c, op["path"])!);
                c.Set(Str(op, "as"), d);
                return DescribeDoc(d);
            }
            case "write":
                File.WriteAllText(Path.Combine(c.W, Str(op, "path")), Str(op, "text"));
                return "ok";
            case "addER":
            {
                var er = c.Doc(Str(op, "d"))!.CAEXFile.ExternalReference.Append();
                er.Alias = Str(op, "alias");
                er.Path = Str(op, "path");
                return "ok";
            }
            case "setVersion":
            {
                var o = Sel(c, op, "s");
                if (o == null) return "none";
                o.Version = Str(op, "value");
                return "ok";
            }
            case "addLib":
            {
                var o = Sel(c, op, "s");
                if (o == null) return "none";
                var file = c.Doc(Str(op, "d"))!.CAEXFile;
                CAEXObject lib = Str(op, "kind") switch
                {
                    "ICL" => file.InterfaceClassLib.Append(o.Name),
                    "RCL" => file.RoleClassLib.Append(o.Name),
                    "SUCL" => file.SystemUnitClassLib.Append(o.Name),
                    "ATL" => file.AttributeTypeLib.Append(o.Name),
                    _ => file.InstanceHierarchy.Append(o.Name),
                };
                lib.Version = Str(op, "version");
                return EngineOpsOracle.Describe(lib);
            }
            case "register":
                Register(c, Str(op, "svc"));
                return "ok";
            case "unregister":
                UnRegister(Str(op, "svc"));
                return "ok";
            case "svc":
                return ServicesState();
            case "autoUpdate":
            {
                var a = ServiceLocator.GetService<IAutoUpdate>();
                if (a == null) return "nosvc";
                a.IsAutoUpdateEnabled = op["value"]!.GetValue<bool>();
                return "ok";
            }
            case "files":
                return string.Join(";", Files(c.W).Select(f => f.Item1 + ":" + EngineOpsOracle.Hash(canon.Apply(f.Item2))));
            case "filePath":
                return Try(() => c.Doc(Str(op, "d"))?.FilePath);
            case "undoActions":
            {
                var u = ServiceLocator.UndoRedoService;
                return u == null ? "nosvc" : string.Join(";", u.UndoActions(c.Doc(Str(op, "d"))!));
            }
            case "undo":
            {
                var u = ServiceLocator.UndoRedoService;
                if (u == null) return "nosvc";
                var doc = c.Doc(Str(op, "d"))!;
                int n = 0;
                for (int i = op["n"]!.GetValue<int>(); i > 0 && u.CanUndo(doc); i--, n++) u.Undo(doc);
                return n.ToString();
            }
            default:
                throw new ArgumentException("unknown op " + Str(op, "op"));
        }
    }
}
