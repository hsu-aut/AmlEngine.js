using System.Collections;
using System.Net.Http;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Services;

namespace Oracle;

/// <summary>
/// svc-extref &lt;casesDir&gt; &lt;outDir&gt; &lt;baseUrl&gt;: ExternalReferenceResolver, GitHubAccessService and
/// GitHubReferenceResolver of Aml.Engine.Services, with files and the local web server
/// test/services/extref-server.mjs at baseUrl (started by the caller). Runs the scripted cases of
/// casesDir/cases.json (scripts/gen-services-extref.mjs) and writes outDir/extref.json
/// ({ case: [lines] }) and outDir/extref-uri.json (Uri.GetComponents for casesDir/uris.json).
/// With ORACLE_LIVE=1 it runs casesDir/live.json instead (GitHub, needs the internet) and writes
/// outDir/extref-live.json. Keep in sync with test/services/extref.oracle.test.ts, which runs the
/// same steps with the port.
/// </summary>
public static class ServicesExtRefOracle
{
    static string casesDir = "", casesDirU = "", corpusDir = "", baseUrl = "";

    public static void Run(string[] args)
    {
        casesDir = Path.GetFullPath(args[0]).TrimEnd(Path.DirectorySeparatorChar);
        casesDirU = casesDir.Replace('\\', '/');
        var outDir = Path.GetFullPath(args[1]);
        baseUrl = args[2].TrimEnd('/');
        corpusDir = Path.GetFullPath(Path.Combine(casesDir, "..", "..", "corpus"));
        // Relative paths resolve against the current directory: the repository root, as in the JS test.
        Directory.SetCurrentDirectory(Path.GetFullPath(Path.Combine(casesDir, "..", "..", "..")));
        Directory.CreateDirectory(outDir);
        var options = new JsonSerializerOptions { WriteIndented = true };
        var live = Environment.GetEnvironmentVariable("ORACLE_LIVE") == "1";
        if (!live) WaitForServer();
        var cases = JsonNode.Parse(File.ReadAllText(Path.Combine(casesDir, live ? "live.json" : "cases.json")))!.AsObject();
        var o = new JsonObject();
        foreach (var (name, steps) in cases) o[name] = new Case().Run(steps!.AsArray());
        File.WriteAllText(Path.Combine(outDir, live ? "extref-live.json" : "extref.json"), o.ToJsonString(options));
        if (!live) File.WriteAllText(Path.Combine(outDir, "extref-uri.json"), UriSection().ToJsonString(options));
    }

    static void WaitForServer()
    {
        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(2) };
        for (var i = 0; i < 50; i++)
        {
            try
            {
                if (client.GetAsync(baseUrl + "/__ping").Result.IsSuccessStatusCode) return;
            }
            catch
            {
            }
            Thread.Sleep(200);
        }
        throw new InvalidOperationException("svc-extref: no web server at " + baseUrl + " (node test/services/extref-server.mjs test/services/extref)");
    }

    // ---------------------------------------------------------------- recording

    static string Ex(Exception e)
    {
        while (e is TargetInvocationException { InnerException: not null } t) e = t.InnerException!;
        // .Result of a synchronous method: the wrapper, whether its message has the .NET format, the inner exception
        if (e is AggregateException { InnerExceptions.Count: 1 } a)
        {
            var inner = a.InnerExceptions[0];
            return "!AggregateException[" + (a.Message == "One or more errors occurred. (" + inner.Message + ")" ? "message" : a.Message) + "]" + Ex(inner);
        }
        return e is NullReferenceException ? "!" + e.GetType().Name : "!" + e.GetType().Name + ": " + e.Message;
    }

    static string N(string? s) => s ?? "null";
    static string B(bool b) => b ? "true" : "false";

    static string ReplaceCi(string text, string find, string repl) =>
        find.Length == 0 ? text : text.Replace(find, repl, StringComparison.OrdinalIgnoreCase);

    static string Canon(string line)
    {
        line = ReplaceCi(line, casesDir, "<IN>");
        line = ReplaceCi(line, casesDirU, "<IN>");
        line = ReplaceCi(line, corpusDir, "<CORPUS>");
        line = ReplaceCi(line, corpusDir.Replace('\\', '/'), "<CORPUS>");
        return line.Replace(baseUrl, "<BASE>");
    }

    static string Expand(string? s)
    {
        if (s == null) return null!;
        var file = casesDirU.StartsWith('/') ? "file://" + casesDirU : "file:///" + casesDirU;
        return s.Replace("<IN>", casesDir).Replace("<INU>", casesDirU).Replace("<FILE>", file).Replace("<BASE>", baseUrl).Replace("<CORPUS>", corpusDir);
    }

    // ---------------------------------------------------------------- the cases

    sealed class Case
    {
        readonly List<string> lines = new();
        readonly EngineOpsOracle.Canonicalizer canon = new();
        readonly Dictionary<string, CAEXDocument> docs = new();
        readonly Dictionary<string, ExternalReferenceType> refs = new();
        readonly List<ExternalReferenceResolver> resolvers = new();
        readonly Dictionary<object, int> ids = new(ReferenceEqualityComparer.Instance);
        readonly List<string> fnLog = new();
        ExternalReferenceResolver R = null!;

        public JsonArray Run(JsonArray steps)
        {
            R = ExternalReferenceResolver.Register();
            resolvers.Add(R);
            try
            {
                foreach (var step in steps)
                {
                    var s = step is JsonObject so ? so["s"]!.AsArray() : step!.AsArray();
                    var op = s[0]!.GetValue<string>();
                    var a = s.Skip(1).Select(x => x?.GetValue<string>()).ToArray();
                    string result;
                    try { result = Do(op, a); }
                    catch (Exception e) { result = Ex(e); }
                    lines.Add(canon.Apply(Canon(op + "(" + string.Join(",", a.Select(N)) + ")=" + result)));
                }
            }
            finally
            {
                foreach (var d in docs.Values.Reverse())
                {
                    try { d.Unload(); } catch { }
                }
                ServiceLocator.UnRegister<ExternalReferenceResolver>();
                ServiceLocator.UnRegister<GitHubAccessService>();
            }
            return new JsonArray(lines.Select(l => (JsonNode)JsonValue.Create(l)!).ToArray());
        }

        int Id(object o)
        {
            if (!ids.TryGetValue(o, out var id)) ids[o] = id = ids.Count + 1;
            return id;
        }

        string DD(CAEXDocument? d)
        {
            if (d == null) return "null";
            if (d.XDocument == null) return $"doc(#{Id(d)}|unloaded)";
            return $"doc({N(d.CAEXFile?.FileName)}|{N(d.FilePath)}|#{Id(d)})";
        }

        string OD(CAEXObject? o) => o == null ? "null" : GapsServicesOracle.D(o) + "@" + DD(o.CAEXDocument);

        string Res((CAEXDocument? Document, string? Message) r, string? bind)
        {
            if (bind != null && r.Document != null) docs[bind] = r.Document;
            return DD(r.Document) + "|" + N(r.Message);
        }

        CAEXDocument? Doc(string? name) => name == null ? null : docs[name];

        ExternalReferenceType? Ref(string? d, string? alias) =>
            d == null ? null : Doc(d)!.CAEXFile.ExternalReference.FirstOrDefault(e => e.Alias == alias);

        CAEXObject? Obj(string d, string path)
        {
            var doc = Doc(d)!;
            var o = doc.FindByPath(path);
            return o ?? throw new InvalidOperationException("no object " + path);
        }

        static object? Base(CAEXObject o) => o switch
        {
            InternalElementType ie => ie.SystemUnitClass,
            SystemUnitFamilyType s => s.BaseClass,
            RoleFamilyType r => r.BaseClass,
            InterfaceClassType i => i.BaseClass,
            AttributeFamilyType at => at.BaseClass,
            _ => "nobase",
        };

        string RefAttrs(CAEXObject o) =>
            string.Join("|", new[] { "RefBaseClassPath", "RefBaseSystemUnitPath", "RefRoleClassPath" }
                .Select(n => o.Node.Attribute(n)).Where(x => x != null).Select(x => x!.Name.LocalName + "=" + x.Value));

        string Do(string op, string?[] a)
        {
            string? A(int i) => i < a.Length ? Expand(a[i]) : null;
            string? Raw(int i) => i < a.Length ? a[i] : null;
            bool Bo(int i) => a[i] == "true";
            var gh = GitHubAccessService.Instance;
            switch (op)
            {
                // ---- services
                case "reg":
                    R = ExternalReferenceResolver.Register();
                    resolvers.Add(R);
                    return "R" + resolvers.Count;
                case "unreg":
                    ExternalReferenceResolver.UnRegister();
                    return "ok";
                case "locunreg":
                    ServiceLocator.UnRegister<ExternalReferenceResolver>();
                    return "ok";
                case "svc":
                {
                    var s = ServiceLocator.ExternalReferenceResolverService;
                    if (s == null) return "null";
                    var k = resolvers.FindIndex(x => ReferenceEquals(x, s));
                    return k >= 0 ? "R" + (k + 1) : "other:" + s.GetType().Name;
                }

                // ---- documents
                case "load":
                {
                    var p = A(1)!;
                    var d = CAEXDocument.LoadFromFile(Path.IsPathRooted(p) ? p : Path.Combine(casesDir, p));
                    docs[Raw(0)!] = d;
                    return DD(d);
                }
                case "new":
                {
                    var d = CAEXDocument.New_CAEXDocument();
                    d.CAEXFile.FileName = A(1);
                    docs[Raw(0)!] = d;
                    return DD(d);
                }
                case "unload":
                    Doc(Raw(0))!.Unload();
                    return "ok";
                case "alive":
                    return DD(Doc(Raw(0)));
                case "addref":
                {
                    var er = Doc(Raw(0))!.CAEXFile.ExternalReference.Append();
                    er.Alias = A(1);
                    er.Path = A(2);
                    return "ok";
                }
                case "detach":
                {
                    var er = Ref(Raw(0), Raw(1))!;
                    er.Remove();
                    refs[Raw(2)!] = er;
                    return "ok";
                }

                // ---- resolver
                case "lord": return Res(R.LoadOrGetReferencedDocument(Ref(Raw(0), Raw(1))), Raw(2));
                case "lorda": return Res(R.LoadOrGetReferencedDocumentAsync(Ref(Raw(0), Raw(1))).GetAwaiter().GetResult(), Raw(2));
                case "lordr": return Res(R.LoadOrGetReferencedDocument(refs[Raw(0)!]), null);
                case "lordra": return Res(R.LoadOrGetReferencedDocumentAsync(refs[Raw(0)!]).GetAwaiter().GetResult(), null);
                case "lordnull": return Res(R.LoadOrGetReferencedDocument((ExternalReferenceType)null!), null);
                case "lordanull": return Res(R.LoadOrGetReferencedDocumentAsync((ExternalReferenceType)null!).GetAwaiter().GetResult(), null);
                case "lordp": return Res(R.LoadOrGetReferencedDocument(Doc(Raw(0))!, A(1)!), null);
                case "lordpa": return Res(R.LoadOrGetReferencedDocumentAsync(Doc(Raw(0))!, A(1)!).GetAwaiter().GetResult(), null);
                case "resolve": return Res(R.ResolveExternalDocument(A(0)!, Bo(1)), Raw(2));
                case "resolvea": return Res(R.ResolveExternalDocumentAsync(A(0)!, Bo(1)).GetAwaiter().GetResult(), Raw(2));
                case "can": return B(R.CanResolve(A(0)!));
                case "cana": return B(R.CanResolveAsync(A(0)!).GetAwaiter().GetResult());
                case "setredir":
                    R.SetRedirection(A(0)!, A(1)!);
                    return "ok";
                case "clrredir":
                    R.ClearRedirection(A(0)!);
                    return "ok";
                case "clrall":
                    R.ClearRedirection();
                    return "ok";
                case "addr":
                {
                    var m = typeof(ExternalReferenceResolver).GetMethod("GetAddressWithRedirection", BindingFlags.Instance | BindingFlags.NonPublic)!;
                    CAEXFileType? file = Raw(1) == null ? null : Raw(1) == "nofile" ? CAEXDocument.New_CAEXDocument().CAEXFile : Doc(Raw(1))!.CAEXFile;
                    return N((string?)m.Invoke(R, new object?[] { A(0), file }));
                }
                case "isext":
                {
                    var element = Obj(Raw(1)!, A(2)!)!;
                    var r = R.IsExternal(Doc(Raw(0))!, element.Node, out var alias, out var path);
                    return B(r) + "|" + N(alias) + "|" + N(path);
                }
                case "isreg": return B(R.IsExternalReferenceRegistered(Ref(Raw(0), Raw(1))!, A(2)!));
                case "regext":
                {
                    var d = R.RegisterExternalDocument(Ref(Raw(0), Raw(1))!, Doc(Raw(2))!, A(3)!);
                    return DD(d);
                }
                case "regexta":
                {
                    var d = R.RegisterExternalDocumentAsync(Ref(Raw(0), Raw(1))!, Doc(Raw(2))!, A(3)!).GetAwaiter().GetResult();
                    return DD(d);
                }
                case "resdocs": return "[" + string.Join(",", R.ResolvedDocuments(Doc(Raw(0))!).Select(DD)) + "]";
                case "unloadext":
                    R.UnloadExternalDocument(Ref(Raw(0), Raw(1))!);
                    return "ok";
                case "unloaddoc":
                    R.UnloadDocument(A(0)!);
                    return "ok";
                case "remove":
                    R.RemoveDocument(Doc(Raw(0))!);
                    return "ok";
                case "fn":
                {
                    var mode = Raw(0);
                    var arg = A(1);
                    R.RegisterResolverFunction(mode switch
                    {
                        "null" => null!,
                        "log" => url => { fnLog.Add(url); return null!; },
                        "load" => url => { fnLog.Add(url); return CAEXDocument.LoadFromFile(arg!); },
                        "throw" => url => { fnLog.Add(url); throw new InvalidOperationException("resolver function failed"); },
                        _ => throw new ArgumentException(mode),
                    });
                    return "ok";
                }
                case "fnlog":
                {
                    var s = string.Join(";", fnLog.Select(N));
                    fnLog.Clear();
                    return s;
                }
                case "nosync":
                {
                    using (ExternalReferenceResolver.NoSynchronizationContextScope.Enter())
                    {
                    }
                    new ExternalReferenceResolver.NoSynchronizationContextScope.DisposableSynchronizationContext(null!).Dispose();
                    return "ok";
                }
                case "getresp":
                {
                    using var resp = ExternalReferenceResolver.GetResponseFromWebServerAsync(new Uri(A(0)!, UriKind.RelativeOrAbsolute)).GetAwaiter().GetResult();
                    return resp == null ? "null" : (int)resp.StatusCode + "|" + B(resp.IsSuccessStatusCode);
                }

                // ---- engine paths that use the resolver
                case "extdoc":
                {
                    var d = Ref(Raw(0), Raw(1))!.ExternalDocument;
                    if (Raw(2) != null && d != null) docs[Raw(2)!] = d;
                    return DD(d);
                }
                case "find":
                {
                    var o = Doc(Raw(0))!.FindByPath(A(1)!);
                    if (Raw(2) != null && o != null) docs[Raw(2)!] = o.CAEXDocument;
                    return OD(o);
                }
                case "findid": return OD(Doc(Raw(0))!.FindByID(A(1)!));
                case "base":
                {
                    var b = Base(Obj(Raw(0)!, A(1)!)!);
                    return b is string s ? s : OD((CAEXObject?)b);
                }
                case "chain":
                {
                    var parts = new List<string>();
                    object? o = Obj(Raw(0)!, A(1)!);
                    for (var i = 0; i < 8 && o is CAEXObject co; i++)
                    {
                        o = Base(co);
                        parts.Add(o is string s ? s : OD((CAEXObject?)o));
                    }
                    return string.Join(" > ", parts);
                }
                case "srcrole":
                    return OD(((InternalElementType)Obj(Raw(0)!, A(1)!)!).SupportedRoleClass.First().RoleClass);
                case "setbase":
                {
                    var o = Obj(Raw(0)!, A(1)!)!;
                    var t = Obj(Raw(2)!, A(3)!)!;
                    switch (o)
                    {
                        case InternalElementType ie: ie.SystemUnitClass = (SystemUnitFamilyType)t; break;
                        case SystemUnitFamilyType s: s.BaseClass = (SystemUnitFamilyType)t; break;
                        case RoleFamilyType r: r.BaseClass = (RoleFamilyType)t; break;
                        case InterfaceClassType i: i.BaseClass = (InterfaceFamilyType)t; break;
                    }
                    return RefAttrs(o);
                }
                case "insert":
                {
                    var d = Doc(Raw(0))!;
                    var lib = d.CAEXFile.SystemUnitClassLib.First(l => l.Name == A(1));
                    var src = (SystemUnitFamilyType)Obj(Raw(2)!, A(3)!)!;
                    var ins = lib.SystemUnitClass.Insert(src);
                    return (ins == null ? "null" : ins.Node.ToString()) + " refs=" + string.Join(";", d.CAEXFile.ExternalReference.Select(e => e.Alias + "=" + e.Path));
                }

                // ---- GitHub
                case "ghis": return B(gh.IsGitHubPath(A(0)));
                case "ghparams":
                {
                    var m = typeof(GitHubReferenceResolver).GetMethod("FindGitHubParameters", BindingFlags.Static | BindingFlags.NonPublic)!;
                    var t = (ITuple)m.Invoke(null, new object?[] { A(0) })!;
                    return string.Join("|", Enumerable.Range(0, t.Length).Select(i => N((string?)t[i])));
                }
                case "ghraw":
                case "ghblob":
                {
                    if (!Uri.TryCreate(A(0), UriKind.Absolute, out var uri)) return "nouri";
                    var m = typeof(GitHubReferenceResolver).GetMethod(op == "ghraw" ? "TryParseRawGitHub" : "TryParseBlobGitHub", BindingFlags.Static | BindingFlags.NonPublic)!;
                    var args = new object?[] { uri, null, null, null, null };
                    var r = (bool)m.Invoke(null, args)!;
                    return B(r) + "|" + string.Join("|", args.Skip(1).Select(x => N((string?)x)));
                }
                case "ghreg":
                    gh.Register(A(0)!, A(1)!, A(2)!);
                    return "ok";
                case "ghunreg":
                    gh.Unregister(A(0)!, A(1)!);
                    return "ok";
                case "ghtoken":
                {
                    var f = typeof(GitHubAccessService).GetField("_resolvers", BindingFlags.Instance | BindingFlags.NonPublic)!;
                    var dict = (IDictionary)f.GetValue(gh)!;
                    var key = (A(0) ?? "").ToLowerInvariant() + "/" + (A(1) ?? "").ToLowerInvariant();
                    return dict.Contains(key) ? N(((GitHubReferenceResolver)dict[key]!).AccessToken) : "none";
                }
                case "ghload": return Res(gh.LoadOrGetReferencedDocumentAsync(A(0)!, Bo(1)).GetAwaiter().GetResult(), null);
                case "ghresp":
                {
                    using var resp = gh.GetResponseFromGitServerAsync(A(0)!).GetAwaiter().GetResult();
                    return resp == null ? "null" : (int)resp.StatusCode + "|" + B(resp.IsSuccessStatusCode);
                }
                case "ghres":
                {
                    var r = new GitHubReferenceResolver(A(0)!, A(1)!, A(2)!);
                    var user = (string?)typeof(GitHubReferenceResolver).GetField("UserName", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(r);
                    var repo = (string?)typeof(GitHubReferenceResolver).GetField("RepositoryName", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(r);
                    return N(user) + "|" + N(repo) + "|" + B(r.HasAccessToken()) + "|" + N(r.AccessToken);
                }
                case "ghexists": return B(new GitHubReferenceResolver(A(0)!, A(1)!, A(2)!).GitHubFileExists(A(3)!).GetAwaiter().GetResult());
#pragma warning disable CS0618
                case "ghregext":
                    gh.RegisterExternalDocument(Ref(Raw(0), Raw(1))!, Doc(Raw(2))!, A(3)!);
                    return "ok";
                case "ghunregext":
                    gh.UnregisterExternalDocument(Doc(Raw(0))!, A(1)!);
                    return "ok";
#pragma warning restore CS0618
                case "ghloc":
                    if (Raw(0) == "on") ServiceLocator.Register(gh);
                    else ServiceLocator.UnRegister<GitHubAccessService>();
                    return "ok";
            }
            throw new ArgumentException("unknown op " + op);
        }
    }

    // ---------------------------------------------------------------- Uri.GetComponents

    static JsonObject UriSection()
    {
        var spec = JsonNode.Parse(File.ReadAllText(Path.Combine(casesDir, "uris.json")))!;
        var masks = spec["masks"]!.AsArray().Select(x => x!.GetValue<int>()).ToList();
        var formats = spec["formats"]!.AsArray().Select(x => x!.GetValue<int>()).ToList();
        var o = new JsonObject();
        var i = 0;
        foreach (var node in spec["uris"]!.AsArray())
        {
            var s = node!.GetValue<string>();
            var lines = new List<string>();
            Uri? uri = null;
            try
            {
                uri = new Uri(s, UriKind.RelativeOrAbsolute);
                lines.Add("ctor=" + (uri.IsAbsoluteUri ? "abs" : "rel"));
            }
            catch (Exception e)
            {
                lines.Add("ctor=" + Ex(e));
            }
            if (uri != null)
            {
                foreach (var mask in masks)
                    foreach (var format in formats)
                    {
                        string r;
                        try { r = uri.GetComponents((UriComponents)mask, (UriFormat)format); }
                        catch (Exception e) { r = Ex(e); }
                        lines.Add($"{mask:x}|{format}={r}");
                    }
            }
            o[i++ + ":" + s] = new JsonArray(lines.Select(l => (JsonNode)JsonValue.Create(l)!).ToArray());
        }
        return o;
    }
}
