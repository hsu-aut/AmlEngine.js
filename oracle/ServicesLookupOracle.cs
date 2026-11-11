using System.Collections;
using System.Globalization;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Services;
using Aml.Engine.Services.Interfaces;
using Aml.Engine.Services.Lookup;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// svc-lookup &lt;corpusDir&gt; &lt;casesDir&gt; &lt;outDir&gt;: the LookupService of Aml.Engine.Services
/// against the port (test/services/lookup.oracle.test.ts, keep both in sync). Every script of
/// &lt;casesDir&gt;/scripts.json (scripts/gen-services-lookup.mjs) opens one document, registers a new
/// LookupService (and a test external reference resolver for alias references) and runs its ops:
/// "sweep" calls every public query of the service on the document and a sample of its objects
/// with ordinary and edge arguments, the other ops change the document (engine operations of
/// EngineOpsOracle and the operations below) or the registration of the service. One line per
/// call ("label=result"), results in the order the service returns them; the ReferenceUpdated
/// events of a call follow it ("label~ev"); after each change the hash of the saved document.
/// Run from the repository root: the external references of the documents are relative to it.
/// The change handlers of the service are weak delegates (WeakEventSource): an instance that is
/// no longer registered would handle changes until the garbage collector takes it. Every instance
/// a script creates is therefore kept until the end of the script and disposed then.
///
/// Some calls do not return in the original: a stack overflow ends the .NET process (cyclic node
/// chains of the lookup tables, cyclic class hierarchies). All scripts therefore run in a child
/// process that writes the number of each call to a probe file before making it. When the child
/// ends with a stack overflow (or does not return within HangMs), the call is recorded as
/// "!stackoverflow" ("!hang") and a new child goes on with that script and leaves the call out. A
/// change that did not return ends its script (line "end=stopped"), and so does a call that did
/// not return while the service built the tables of the document (the port keeps the document
/// registered as loading, so the next calls differ from a new process), and the call after
/// MaxNoReturn calls of a script that did not return (a lookup table with a cyclic chain makes
/// most later queries overflow, and each of them costs a new child that replays the script). The
/// port throws CyclicReferenceException there. The calls found so far are kept in
/// &lt;outDir&gt;/lookup.noreturn.txt until the run is done, so an interrupted run goes on there.
///
/// Output: &lt;outDir&gt;/lookup.json, one array of lines per script. LOOKUP_ONLY=&lt;i&gt; runs one
/// script in this process and prints its lines (JSON strings); LOOKUP_FULL=1 records long results in full
/// (both for debugging, the test reads the same variables).
/// </summary>
public static class ServicesLookupOracle
{
    const int StackOverflowExit = unchecked((int)0xC00000FD);
    const int AccessViolationExit = unchecked((int)0xC0000005);
    const int HangExit = 3;
    const int HangMs = 30000;
    /// <summary>Longer results are recorded as hash and length.</summary>
    const int Limit = 1000;
    /// <summary>The call after this many calls of a script that did not return ends the script.</summary>
    const int MaxNoReturn = 20;

    static string CorpusDir = "";
    static readonly bool Full = Environment.GetEnvironmentVariable("LOOKUP_FULL") != null;

    public static void Run(string[] args)
    {
        CorpusDir = args[0];
        var scripts = JsonNode.Parse(File.ReadAllText(Path.Combine(args[1], "scripts.json")))!.AsArray();
        if (Environment.GetEnvironmentVariable("LOOKUP_CHILD") is { } child)
        {
            RunChild(scripts, int.Parse(child, CultureInfo.InvariantCulture));
            return;
        }
        if (Environment.GetEnvironmentVariable("LOOKUP_ONLY") is { } only)
        {
            var i = int.Parse(only, CultureInfo.InvariantCulture);
            foreach (var l in RunScript(scripts[i]!.AsObject(), ParseSkip(Environment.GetEnvironmentVariable("LOOKUP_SKIP")).GetValueOrDefault(i) ?? new())) Console.WriteLine(JsonValue.Create(l)!.ToJsonString());
            return;
        }
        Directory.CreateDirectory(args[2]);
        RunParent(scripts, args);
    }

    // ------------------------------------------------------------------------- child processes

    static void RunParent(JsonArray scripts, string[] args)
    {
        var results = new JsonNode?[scripts.Count];
        var skipFile = Path.Combine(args[2], "lookup.noreturn.txt");
        var skips = ParseSkip(File.Exists(skipFile) ? string.Join(",", File.ReadAllLines(skipFile)) : null);
        var probe = Path.Combine(Path.GetTempPath(), $"svc-lookup-probe-{Environment.ProcessId}.txt");
        var sw = System.Diagnostics.Stopwatch.StartNew();
        int start = 0, runs = 0;
        while (start < scripts.Count)
        {
            runs++;
            if (File.Exists(probe)) File.Delete(probe);
            var psi = new System.Diagnostics.ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardError = true, RedirectStandardOutput = true };
            psi.ArgumentList.Add(typeof(ServicesLookupOracle).Assembly.Location);
            psi.ArgumentList.Add("svc-lookup");
            foreach (var a in args) psi.ArgumentList.Add(a);
            psi.Environment["LOOKUP_CHILD"] = start.ToString(CultureInfo.InvariantCulture);
            psi.Environment["LOOKUP_PROBE"] = probe;
            psi.Environment["LOOKUP_SKIP"] = string.Join(",", skips.SelectMany(s => s.Value.Select(c => $"{s.Key}:{c.Key}={c.Value}")));
            using var p = new System.Diagnostics.Process { StartInfo = psi };
            // .NET prints the frames of a stack overflow before the process ends, which takes long
            // for a deep recursion: the child is stopped as soon as the overflow is reported.
            var err = new StringBuilder();
            var overflowSeen = false;
            p.ErrorDataReceived += (_, e) =>
            {
                if (e.Data == null) return;
                lock (err)
                {
                    if (err.Length < 100000) err.AppendLine(e.Data);
                    if (overflowSeen || !e.Data.StartsWith("Stack overflow.", StringComparison.Ordinal)) return;
                    overflowSeen = true;
                }
                try { p.Kill(true); } catch (InvalidOperationException) { }
            };
            p.Start();
            p.BeginErrorReadLine();
            string? line;
            while ((line = p.StandardOutput.ReadLine()) != null)
            {
                if (!line.StartsWith("SCRIPT ", StringComparison.Ordinal)) continue;
                var sp = line.IndexOf(' ', 7);
                var i = int.Parse(line.AsSpan(7, sp - 7), CultureInfo.InvariantCulture);
                results[i] = JsonNode.Parse(line.Substring(sp + 1));
                start = i + 1;
            }
            p.WaitForExit();
            var errText = err.ToString();
            if (p.ExitCode == 0 && !overflowSeen)
            {
                if (start != scripts.Count) throw new InvalidOperationException($"child ended at script {start}");
                break;
            }
            var call = File.Exists(probe) ? File.ReadAllText(probe).Trim() : "";
            var overflow = overflowSeen || p.ExitCode == StackOverflowExit
                || (p.ExitCode == AccessViolationExit && errText.Trim().Length == 0);
            var why = overflow ? "!stackoverflow" : p.ExitCode == HangExit ? "!hang" : null;
            var parts = call.Split(':');
            if (why == null || parts.Length != 3)
                throw new InvalidOperationException($"script {start}: exit {p.ExitCode}, call '{call}': {errText[..Math.Min(3000, errText.Length)]}");
            var si = int.Parse(parts[0], CultureInfo.InvariantCulture);
            var ci = int.Parse(parts[1], CultureInfo.InvariantCulture);
            if (si != start) throw new InvalidOperationException($"probe {call} while at script {start}");
            if (!skips.TryGetValue(si, out var s)) skips[si] = s = new();
            if (s.Count >= MaxNoReturn || parts[2] == "U") why += "|stop";
            if (!s.TryAdd(ci, why)) throw new InvalidOperationException($"call {call} ended the child again");
            File.AppendAllLines(skipFile, new[] { $"{si}:{ci}={why}" });
            Console.Error.WriteLine($"   script {si} ({scripts[si]!["name"]}): call {ci} {why}");
        }
        var outFile = Path.Combine(args[2], "lookup.json");
        File.WriteAllText(outFile, new JsonArray(results.ToArray()).ToJsonString());
        File.Delete(skipFile);
        Console.WriteLine($"svc-lookup: {scripts.Count} scripts, {skips.Sum(s => s.Value.Count)} calls without return, {runs} runs, {sw.ElapsedMilliseconds / 1000} s -> {outFile}");
    }

    static Dictionary<int, Dictionary<int, string>> ParseSkip(string? list)
    {
        var r = new Dictionary<int, Dictionary<int, string>>();
        foreach (var x in (list ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries))
        {
            var eq = x.IndexOf('=');
            var sc = x[..eq].Split(':');
            var si = int.Parse(sc[0], CultureInfo.InvariantCulture);
            if (!r.TryGetValue(si, out var d)) r[si] = d = new();
            d[int.Parse(sc[1], CultureInfo.InvariantCulture)] = x[(eq + 1)..];
        }
        return r;
    }

    static void RunChild(JsonArray scripts, int start)
    {
        var skips = ParseSkip(Environment.GetEnvironmentVariable("LOOKUP_SKIP"));
        var probe = Environment.GetEnvironmentVariable("LOOKUP_PROBE");
        if (probe != null) ProbeStream = new FileStream(probe, FileMode.Create, FileAccess.Write, FileShare.ReadWrite);
        new Thread(Watchdog) { IsBackground = true }.Start();
        for (var i = start; i < scripts.Count; i++)
        {
            ScriptIndex = i;
            var lines = RunScript(scripts[i]!.AsObject(), skips.GetValueOrDefault(i) ?? new());
            Console.Out.WriteLine("SCRIPT " + i.ToString(CultureInfo.InvariantCulture) + " " + new JsonArray(lines.Select(l => (JsonNode?)JsonValue.Create(l)).ToArray()).ToJsonString());
            Console.Out.Flush();
        }
    }

    static FileStream? ProbeStream;
    static int ScriptIndex;
    static long CallStarted;

    static void WriteProbe(int call)
    {
        if (ProbeStream == null) return;
        var bytes = Encoding.ASCII.GetBytes($"{ScriptIndex}:{call}:{(TablesLoaded() ? "L" : "U")}".PadRight(32));
        ProbeStream.Position = 0;
        ProbeStream.Write(bytes);
        ProbeStream.Flush();
    }

    /// <summary>The service has the tables of the document (DocumentReferenceDictionary.IsLoaded, internal).</summary>
    static bool TablesLoaded()
    {
        try
        {
            if (Doc?.XDocument == null || Svc == null) return true;
            var dict = typeof(LookupService).GetField("_caexElementDictionary", BindingFlags.Instance | BindingFlags.NonPublic)!.GetValue(Svc)!;
            return (bool)dict.GetType().GetMethod("IsLoaded")!.Invoke(dict, new object[] { Doc.XDocument })!;
        }
        catch
        {
            return true;
        }
    }

    static void Watchdog()
    {
        while (true)
        {
            Thread.Sleep(500);
            var s = Interlocked.Read(ref CallStarted);
            if (s != 0 && Environment.TickCount64 - s > HangMs) Environment.Exit(HangExit);
        }
    }

    // ------------------------------------------------------------------------------- recording

    sealed class Ctx
    {
        public readonly List<string> Lines = new();
        public readonly EngineOpsOracle.Canonicalizer C = new();
        public readonly List<string> Events = new();
        public Dictionary<int, string> Skip = new();
        public int Calls;
        public bool Stopped;

        /// <summary>One call: its result, or the exception, or the recorded end of the child.</summary>
        public void V(string label, Func<object?> f, bool change = false)
        {
            if (Stopped) return;
            var call = ++Calls;
            if (Skip.TryGetValue(call, out var why))
            {
                var stop = change || why.EndsWith("|stop", StringComparison.Ordinal);
                Add(label, why.Replace("|stop", ""));
                if (stop)
                {
                    Lines.Add("end=stopped");
                    Stopped = true;
                }
                return;
            }
            WriteProbe(call);
            Interlocked.Exchange(ref CallStarted, Environment.TickCount64);
            string s;
            try { s = F(f()); }
            catch (Exception e) { s = Ex(e); }
            Interlocked.Exchange(ref CallStarted, 0);
            Add(label, s);
            if (Events.Count > 0)
            {
                Add(label + "~ev", "[" + string.Join(",", Events) + "]");
                Events.Clear();
            }
        }

        public void Add(string label, string value)
        {
            label = C.Apply(label);
            value = C.Apply(value);
            if (value.Length > Limit && !Full) value = "#" + Hash(value) + "/" + value.Length.ToString(CultureInfo.InvariantCulture);
            Lines.Add(label + "=" + value);
        }
    }

    static Ctx X = new();
    static LookupService Svc = null!;
    static CAEXDocument Doc = null!;
    static bool Auto;
    static Resolver Res = null!;
    static readonly List<LookupService> Instances = new();

    static void OnUpdated(object? sender, UpdateEventArgs e) =>
        X.Events.Add($"{XE(e.ReferencedElement)}|{R(e.CaexReference)}|{XA(e.Reference)}|{N(e.OldValue)}|{N(e.UpdateValue)}");

    static string Ex(Exception e)
    {
        while (e is TargetInvocationException { InnerException: not null } t) e = t.InnerException;
        return "!" + e.GetType().Name;
    }

    static string N(string? s) => s ?? "null";
    static string B(bool b) => b ? "true" : "false";
    static string Hash(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).Substring(0, 16);

    static string T(Func<string?> f)
    {
        try { return f() ?? "null"; }
        catch (Exception e) { return Ex(e); }
    }

    static string F(object? v) => v switch
    {
        null => "null",
        string s => s,
        bool b => B(b),
        int i => i.ToString(CultureInfo.InvariantCulture),
        ILookup<string, ICAEXReference> lk => LK(lk),
        ICAEXReference r => R(r),
        CAEXWrapper w => D(w),
        IEnumerable en => "[" + string.Join(",", en.Cast<object?>().Select(F)) + "]",
        _ => v.GetType().Name,
    };

    /// <summary>A wrapper: run time class, tag, Name, ID, CAEX path.</summary>
    static string D(CAEXWrapper? w)
    {
        if (w == null) return "null";
        if (w.Node == null) return w.GetType().Name + "(nonode)";
        if (w is CAEXObject o) return $"{w.GetType().Name}:{w.Node.Name.LocalName}|{N(o.Name)}|{N(o.ID)}|{T(() => o.CAEXPath())}";
        return $"{w.GetType().Name}:{w.Node.Name.LocalName}";
    }

    /// <summary>
    /// A reference: its class, the object, the attribute and its value. The value of a
    /// ReferenceElement (the text of the whole element) is left out here; "idsVal" and "identVal"
    /// record it for a few elements.
    /// </summary>
    static string R(ICAEXReference? r) =>
        r == null ? "null" : $"{r.GetType().Name}({D(r.CaexObject)}.{N(r.ReferenceAttributeName)}={(r is ReferenceElement ? "~" : N(r.ReferenceAttributeValue))})";

    static string LK(ILookup<string, ICAEXReference>? lk) =>
        lk == null ? "null" : lk.Count.ToString(CultureInfo.InvariantCulture) + "{" + string.Join(";", lk.Select(g => N(g.Key) + ":[" + string.Join(",", g.Select(R)) + "]")) + "}";

    static string XE(XElement? e) => e == null ? "null" : $"{e.Name.LocalName}/{N(e.Attribute("Name")?.Value)}/{N(e.Attribute("ID")?.Value)}";

    static string XA(XObject? x) => x switch
    {
        null => "null",
        XAttribute a => a.Name.LocalName + "=" + a.Value,
        XElement e => "<" + e.Name.LocalName + ">",
        _ => "?",
    };

    // ---------------------------------------------------------------------------------- scripts

    /// <summary>The external documents of alias references: the file at the path of the reference (relative to the working directory).</summary>
    sealed class Resolver : IExternalReferenceResolver
    {
        public readonly Dictionary<string, CAEXDocument?> Docs = new();

        CAEXDocument? Get(string? path)
        {
            if (string.IsNullOrEmpty(path)) return null;
            if (!Docs.TryGetValue(path, out var d))
            {
                d = File.Exists(path) ? CAEXDocument.LoadFromString(File.ReadAllText(path, Encoding.UTF8)) : null;
                Docs[path] = d;
            }
            return d;
        }

        public (CAEXDocument Document, string Message) LoadOrGetReferencedDocument(ExternalReferenceType externalReference)
        {
            var d = Get(externalReference?.Path);
            return (d!, d == null ? "not found" : "");
        }

        public (CAEXDocument Document, string Message) LoadOrGetReferencedDocument(CAEXDocument document, string path)
        {
            var d = Get(path);
            return (d!, d == null ? "not found" : "");
        }

        public bool IsExternal(CAEXDocument document, XElement element, out string alias, out string path)
        {
            alias = null!;
            path = null!;
            return false;
        }

        public void SetRedirection(string address, string redirectAddress) { }
        public void ClearRedirection(string address) { }
        public void ClearRedirection() { }
        public bool IsExternalReferenceRegistered(ExternalReferenceType externalReference, string path) => false;
        public CAEXDocument RegisterExternalDocument(ExternalReferenceType externalReference, CAEXDocument document, string path) => document;
        public IEnumerable<CAEXDocument> ResolvedDocuments(CAEXDocument documentWithExternals) => Array.Empty<CAEXDocument>();
        public (CAEXDocument Document, string Message) ResolveExternalDocument(string url, bool useCache = true) => (null!, "not found");
        public void RegisterResolverFunction(Func<string, CAEXDocument> resolverFunction) { }
        public bool CanResolve(string externalAddress) => false;
        public void UnloadDocument(string url) { }
    }

    static CAEXDocument Open(string start) => start switch
    {
        "new30" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0),
        "new215" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15),
        _ when start.StartsWith("corpus:", StringComparison.Ordinal) => Load(Path.Combine(CorpusDir, start.Substring(7))),
        _ => Load(start),
    };

    static CAEXDocument Load(string file) => CAEXDocument.LoadFromString(File.ReadAllText(file, Encoding.UTF8));

    /// <summary>CAEXDocument.SupportsAutoUpdate (internal): ReferenceUpdated is raised only for such documents.</summary>
    static void SupportsAutoUpdate(CAEXDocument doc) =>
        typeof(CAEXDocument).GetProperty("SupportsAutoUpdate", BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)!.GetSetMethod(true)!.Invoke(doc, new object[] { true });

    static void Register()
    {
        Svc = LookupService.Register();
        Instances.Add(Svc);
        Svc.IsAutoUpdateEnabled = Auto;
        Svc.ReferenceUpdated += OnUpdated;
    }

    static List<string> RunScript(JsonObject script, Dictionary<int, string> skip)
    {
        X = new Ctx { Skip = skip };
        Auto = script["auto"]!.GetValue<bool>();
        Res = new Resolver();
        ServiceLocator.Register<IExternalReferenceResolver>(Res);
        Register();
        Doc = Open(script["start"]!.GetValue<string>());
        if (Auto) SupportsAutoUpdate(Doc);
        try
        {
            var k = 0;
            foreach (var node in script["ops"]!.AsArray())
            {
                if (X.Stopped) break;
                var op = node!.AsObject();
                var name = op["op"]!.GetValue<string>();
                var label = k.ToString(CultureInfo.InvariantCulture) + ":" + name;
                switch (name)
                {
                    case "sweep":
                        Sweep(k.ToString(CultureInfo.InvariantCulture) + ":", op);
                        break;
                    case "unregister":
                        X.V(label, () => { LookupService.UnRegister(); return "ok"; }, true);
                        break;
                    case "register":
                        X.V(label, () => { Svc.ReferenceUpdated -= OnUpdated; Register(); return "ok"; }, true);
                        break;
                    case "addDocument":
                        X.V(label, () => { Svc.AddDocument(Doc); return "ok"; }, true);
                        break;
                    case "removeDocument":
                        X.V(label, () => { Svc.RemoveDocument(Doc); return "ok"; }, true);
                        break;
                    case "autoUpdate":
                        X.V(label, () => { Auto = op["value"] is JsonNode v ? v.GetValue<bool>() : !Auto; Svc.IsAutoUpdateEnabled = Auto; return Auto; }, true);
                        break;
                    case "unload":
                        Unload(k.ToString(CultureInfo.InvariantCulture) + ":");
                        break;
                    default:
                        X.V(label, () => Apply(op), true);
                        if (!X.Stopped) X.Add(label + "#", T(() => Hash(X.C.Apply(EngineOpsOracle.Save(Doc)))));
                        break;
                }
                k++;
            }
        }
        finally
        {
            Svc.ReferenceUpdated -= OnUpdated;
            try { Doc.Unload(); } catch { }
            foreach (var d in Res.Docs.Values) d?.Unload();
            var dispose = typeof(LookupService).GetMethod("Dispose", BindingFlags.Instance | BindingFlags.NonPublic)!;
            foreach (var instance in Instances) dispose.Invoke(instance, null);
            Instances.Clear();
            LookupService.UnRegister();
            ServiceLocator.UnRegister<IExternalReferenceResolver>();
        }
        return X.Lines;
    }

    /// <summary>Unloads the document, queries it and its objects, and loads its text again.</summary>
    static void Unload(string p)
    {
        var text = EngineOpsOracle.Save(Doc);
        var old = Doc;
        var file = old.CAEXFile;
        var objs = EngineOpsOracle.Objects(old);
        var keep = Sample(objs, 8, 0);
        var id = objs.Select(o => o.ID).FirstOrDefault(i => !string.IsNullOrEmpty(i));
        var path = objs.OfType<IClassWithBaseClassReference>().Select(c => ((CAEXObject)c).CAEXPath()).FirstOrDefault();
        X.V(p + "unload", () => { old.Unload(); return "ok"; }, true);
        X.V(p + "u:ids", () => Svc.AllElementsWithIDs(file));
        X.V(p + "u:ident", () => Svc.AllElementsIdentifiedByCAEXPath(file));
        X.V(p + "u:pathRefs", () => Svc.AllElementsWithCAEXPathReference(file));
        X.V(p + "u:nameRefs", () => Svc.AllElementsWithNameReference(file));
        X.V(p + "u:fbi", () => D(Svc.FindByID(old, id!)));
        X.V(p + "u:fbp", () => D(Svc.FindByPath(old, path!)));
        X.V(p + "u:acr", () => Svc.AllClassReferences(old, path!));
        X.V(p + "u:acrd", () => Svc.AllClassReferencesDeep(old, path!));
        X.V(p + "u:data", () => Svc.AllExternalDataReferences(old));
        foreach (var (o, i) in keep) ObjectQueries($"{p}u#{i}:", o, true);
        Doc = CAEXDocument.LoadFromString(text);
        if (Auto) SupportsAutoUpdate(Doc);
        X.V(p + "reload", () => "ok", true);
    }

    // ------------------------------------------------------------------------------------ sweep

    /// <summary>Every count-th element (count = ceil(n / max)), starting at off modulo that step.</summary>
    static List<(T Item, int Index)> Sample<T>(IReadOnlyList<T> list, int max, int off)
    {
        var r = new List<(T, int)>();
        if (list.Count == 0 || max <= 0) return r;
        var step = (list.Count + max - 1) / max;
        for (var i = off % step; i < list.Count; i += step) r.Add((list[i], i));
        return r;
    }

    static readonly string?[] SpecialIDs = { null, "", " ", "no-such-id", "dup", "Ext@ext-ie", "Ext@ext-ei", "Dup@ext-ie", "Missing@x", "Nope@x", "@x", "x@" };
    static readonly string?[] SpecialPaths =
    {
        null, "", " ", "No/Such/Path", "Ext@ExtSUCL/ExtClass", "Ext@ExtICL/ExtData", "Ext@ExtSUCL", "Missing@Lib/Class", "Nope@A/B", "SUCL/", "/SUCL",
        "[SUCL]/[Machine]", "SUCL/Machine/Press/Press", "SUCL/Machine/Motor", "IH/M1", "AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector",
        // classes of the external document (only alias references lead to them)
        "ExtICL/ExtInterface", "ExtSUCL/ExtClass", "ExtRCL/ExtRole",
    };
    static readonly string[] ElementNames = { "InternalElement", "InternalLink", "ExternalInterface", "Attribute", "SystemUnitClass", "AttributeNameMapping", "Nope" };

    static void Sweep(string p, JsonObject op)
    {
        var m = op["m"]!.GetValue<int>();
        var n = op["n"]!.GetValue<int>();
        var off = op["off"]!.GetValue<int>();
        var doc = Doc;
        var file = doc.CAEXFile;
        var objs = EngineOpsOracle.Objects(doc);

        // the whole document
        X.V(p + "ids", () => Svc.AllElementsWithIDs(file));
        X.V(p + "idsVal", () => string.Join(",", Svc.AllElementsWithIDs(file).SelectMany(g => g).Take(4).Select(r => N(r.ReferenceAttributeValue))));
        X.V(p + "reEq", () =>
        {
            // ReferenceElement (a Tuple): Equals, GetHashCode and ToString of two lookups
            var a = Svc.AllElementsWithIDs(file).SelectMany(g => g).Take(2).Cast<ReferenceElement>().ToList();
            var b = Svc.AllElementsWithIDs(file).SelectMany(g => g).Take(2).Cast<ReferenceElement>().ToList();
            if (a.Count < 2) return "none";
            return $"{B(a[0].Equals(b[0]))},{B(a[0].Equals(a[1]))},{B(a[0].Equals(null))},{B(a[0].Equals("x"))},{B(a[0].GetHashCode() == b[0].GetHashCode())},{a[1].Item2},{Hash(X.C.Apply(a[0].ToString()))}";
        });
        X.V(p + "ident", () => Svc.AllElementsIdentifiedByCAEXPath(file));
        X.V(p + "identVal", () => string.Join(",", Svc.AllElementsIdentifiedByCAEXPath(file)?.SelectMany(g => g).Take(4).Select(r => N(r.ReferenceAttributeValue)) ?? Array.Empty<string>()));
        X.V(p + "pathRefs", () => Svc.AllElementsWithCAEXPathReference(file));
        X.V(p + "pathRefsSelf", () => Svc.AllElementsWithCAEXPathReference(file, "", true));
        X.V(p + "idRefs", () => Svc.AllElementsWithIDReference(file));
        X.V(p + "nameRefs", () => Svc.AllElementsWithNameReference(file));
        X.V(p + "aliasRefs", () => Svc.AllElementsWithAliasReference(file));
        X.V(p + "aliasAny", () => Svc.ElementsWithAliasReference(file, ""));
        X.V(p + "aliasNull", () => Svc.ElementsWithAliasReference(file, null!));
        foreach (var en in ElementNames)
        {
            X.V(p + "pathRefs/" + en, () => Svc.AllElementsWithCAEXPathReference(file, en, true));
            X.V(p + "idRefs/" + en, () => Svc.AllElementsWithIDReference(file, en));
            X.V(p + "nameRefs/" + en, () => Svc.AllElementsWithNameReference(file, en));
            X.V(p + "aliasRefs/" + en, () => Svc.AllElementsWithAliasReference(file, en));
            X.V(p + "aliasAny/" + en, () => Svc.ElementsWithAliasReference(file, "", en));
        }
        X.V(p + "withLinks", () => Svc.AllElementsWithInternalLinks(file));
        X.V(p + "ieWithLinks", () => Svc.AllInternalElementsWithInternalLinks(file));
        X.V(p + "linkRel", () => Svc.ElementsWithInternalLinkRelations(file));
        X.V(p + "ifRel", () => Svc.InterfacesWithInternalLinkRelations(file));
        X.V(p + "data", () => Svc.AllExternalDataReferences(doc));
        X.V(p + "dataFile", () => Svc.AllExternalDataReferences(doc, file));
        var aliases = file.ExternalReference.Select(e => e.Alias).Append("Nope").Distinct().ToList();
        foreach (var alias in aliases)
        {
            X.V(p + "alias:" + N(alias), () => Svc.ElementsWithAliasReference(file, alias));
            X.V(p + "alias:" + N(alias) + "/IE", () => Svc.ElementsWithAliasReference(file, alias, "InternalElement"));
        }

        // IDs, paths and class paths of a sample of the objects, and special values
        var points = Sample(objs, n, off);
        var ids = points.Select(x => x.Item.ID).Where(i => !string.IsNullOrEmpty(i)).Concat(SpecialIDs).Distinct().ToList();
        foreach (var id in ids)
        {
            var l = p + "id:" + N(id);
            X.V(l + "|fbi", () => D(Svc.FindByID(doc, id!)) + ";" + D(Svc.FindByID(doc, id!, false)) + ";" + D(Svc.FindByID(doc, id!, true, typeof(InternalElementType))));
            X.V(l + "|ids", () => Svc.AllElementsWithIDs(file, id!));
            X.V(l + "|idRef", () => Svc.ElementsWithIDReference(file, id!));
            X.V(l + "|idRefIL", () => Svc.ElementsWithIDReference(file, id!, "InternalLink"));
        }
        var paths = points.Select(x => T(() => x.Item.CAEXPath())).Concat(SpecialPaths).Distinct().ToList();
        foreach (var path in paths)
        {
            var l = p + "path:" + N(path);
            X.V(l + "|fbp", () => D(Svc.FindByPath(doc, path!)) + ";" + D(Svc.FindByPath(doc, path!, false)) + ";" + D(Svc.FindByPath(doc, path!, true, typeof(SystemUnitFamilyType))));
            X.V(l + "|pathRef", () => Svc.ElementsWithCAEXPathReference(file, path!));
        }
        var classes = objs.Where(o => o is IClassWithBaseClassReference).ToList();
        var classPaths = Sample(classes, n / 3, off).Select(x => T(() => x.Item.CAEXPath())).Concat(SpecialPaths).Distinct().ToList();
        foreach (var path in classPaths)
        {
            var l = p + "class:" + N(path);
            X.V(l + "|acr", () => Svc.AllClassReferences(doc, path!));
            X.V(l + "|acrTag", () => F(Svc.AllClassReferences(doc, path!, "SystemUnitClass")) + ";" + F(Svc.AllClassReferences(doc, path!, "InterfaceClass")) + ";" + F(Svc.AllClassReferences(doc, path!, "Nope")));
            X.V(l + "|acrd", () => Svc.AllClassReferencesDeep(doc, path!));
            X.V(l + "|acrdTag", () => F(Svc.AllClassReferencesDeep(doc, path!, "RoleClass")) + ";" + F(Svc.AllClassReferencesDeep(doc, path!, "AttributeType")));
            X.V(l + "|pathRefIE", () => Svc.ElementsWithCAEXPathReference(file, path!, "InternalElement"));
        }
        var ih = file.InstanceHierarchy.FirstOrDefault();
        var interfaceClasses = Sample(objs.OfType<InterfaceFamilyType>().ToList(), 30, off).Select(x => T(() => x.Item.CAEXPath())).Concat(SpecialPaths.Skip(1)).Distinct().ToList();
        foreach (var path in interfaceClasses)
        {
            X.V(p + "ofType:" + N(path), () => Svc.AllExternalInterfacesOfType(doc, path!));
            X.V(p + "ofType:" + N(path) + "|IH", () => Svc.AllExternalInterfacesOfType(doc, path!, ih));
        }

        // the objects: point queries for the sample, queries of the subtree for a smaller sample
        foreach (var (o, i) in points) ObjectQueries($"{p}#{i}:{o.Node.Name.LocalName}:", o, false);
        foreach (var (o, i) in Sample(objs, m, off + 1)) SubtreeQueries($"{p}#{i}:{o.Node.Name.LocalName}:", o);
        if (op["edges"]?.GetValue<bool>() == true) Edges(p + "e:", objs);
    }

    static void ObjectQueries(string q, CAEXObject o, bool subtree)
    {
        X.V(q + "isRef", () => Svc.IsReferenced(o));
        X.V(q + "acr", () => Svc.AllClassReferences(o));
        X.V(q + "acrd", () => Svc.AllClassReferencesDeep(o));
        switch (o)
        {
            case InternalElementType ie:
                X.V(q + "ieMir", () => F(Svc.InternalElementMirrors(ie)) + ";" + B(Svc.IsMaster(ie)));
                break;
            case ExternalInterfaceType ei:
                X.V(q + "eiMir", () => F(Svc.ExternalInterfaceMirrors(ei)) + ";" + B(Svc.IsMaster(ei)));
                X.V(q + "linksIf", () => Svc.InternalLinksToInterface(ei));
                break;
            case AttributeType at:
                X.V(q + "atMir", () => F(Svc.AttributeMirrors(at)) + ";" + B(Svc.IsMaster(at)));
                break;
        }
        if (o is SystemUnitClassType suc) X.V(q + "linksEl", () => Svc.InternalLinksToElement(suc));
        if (!string.IsNullOrEmpty(o.ID)) X.V(q + "idRefSub", () => Svc.ElementsWithIDReference(o, o.ID));
        if (subtree) SubtreeQueries(q, o);
    }

    static void SubtreeQueries(string q, CAEXObject o)
    {
        X.V(q + "ident", () => Svc.AllElementsIdentifiedByCAEXPath(o));
        X.V(q + "ids", () => Svc.AllElementsWithIDs(o));
        X.V(q + "idRefs", () => Svc.AllElementsWithIDReference(o));
        X.V(q + "pathRefs", () => Svc.AllElementsWithCAEXPathReference(o));
        X.V(q + "pathRefsSelf", () => Svc.AllElementsWithCAEXPathReference(o, "", true));
        X.V(q + "nameRefs", () => Svc.AllElementsWithNameReference(o));
        X.V(q + "aliasRefs", () => Svc.AllElementsWithAliasReference(o));
        X.V(q + "aliasAny", () => Svc.ElementsWithAliasReference(o, ""));
        X.V(q + "pathRefsIE", () => Svc.AllElementsWithCAEXPathReference(o, "InternalElement", true));
        X.V(q + "idRefsIL", () => Svc.AllElementsWithIDReference(o, "InternalLink"));
        X.V(q + "nameRefsAttr", () => Svc.AllElementsWithNameReference(o, "Attribute"));
        X.V(q + "aliasRefsIE", () => Svc.AllElementsWithAliasReference(o, "InternalElement"));
        X.V(q + "aliasAnyIE", () => Svc.ElementsWithAliasReference(o, "", "InternalElement"));
        X.V(q + "pathRefTo", () => Svc.ElementsWithCAEXPathReference(o, T(() => o.CAEXPath())));
        X.V(q + "withLinks", () => Svc.AllElementsWithInternalLinks(o));
        X.V(q + "ieWithLinks", () => Svc.AllInternalElementsWithInternalLinks(o));
        X.V(q + "linkRel", () => Svc.ElementsWithInternalLinkRelations(o));
        X.V(q + "ifRel", () => Svc.InterfacesWithInternalLinkRelations(o));
        X.V(q + "data", () => Svc.AllExternalDataReferences(Doc, o));
    }

    /// <summary>Null arguments, detached objects, a document the service does not know.</summary>
    static void Edges(string p, List<CAEXObject> objs)
    {
        var doc = Doc;
        var file = doc.CAEXFile;
        X.V(p + "acrNull", () => Svc.AllClassReferences((CAEXObject)null!));
        X.V(p + "acrdNull", () => Svc.AllClassReferencesDeep((CAEXObject)null!));
        X.V(p + "acrDocNull", () => Svc.AllClassReferences((CAEXDocument)null!, "x"));
        X.V(p + "acrdDocNull", () => Svc.AllClassReferencesDeep((CAEXDocument)null!, "x"));
        X.V(p + "acrPathNull", () => Svc.AllClassReferences(doc, null!));
        X.V(p + "acrdPathEmpty", () => Svc.AllClassReferencesDeep(doc, ""));
        X.V(p + "acrdPathNull", () => Svc.AllClassReferencesDeep(doc, null!));
        X.V(p + "identNull", () => Svc.AllElementsIdentifiedByCAEXPath(null!));
        X.V(p + "aliasRefsNull", () => Svc.AllElementsWithAliasReference(null!));
        X.V(p + "pathRefsNull", () => Svc.AllElementsWithCAEXPathReference(null!));
        X.V(p + "idRefsNull", () => Svc.AllElementsWithIDReference(null!));
        X.V(p + "idsNull", () => Svc.AllElementsWithIDs(null!));
        X.V(p + "idsIdNull", () => Svc.AllElementsWithIDs(file, null!));
        X.V(p + "withLinksNull", () => Svc.AllElementsWithInternalLinks(null!));
        X.V(p + "nameRefsNull", () => Svc.AllElementsWithNameReference(null!));
        X.V(p + "dataNull", () => Svc.AllExternalDataReferences(null!));
        X.V(p + "ofTypeDocNull", () => Svc.AllExternalInterfacesOfType(null!, "x"));
        X.V(p + "ofTypeEmpty", () => Svc.AllExternalInterfacesOfType(doc, ""));
        X.V(p + "ofTypeNull", () => Svc.AllExternalInterfacesOfType(doc, null!));
        X.V(p + "ieWithLinksNull", () => Svc.AllInternalElementsWithInternalLinks(null!));
        X.V(p + "atMirNull", () => Svc.AttributeMirrors(null!));
        X.V(p + "aliasNull", () => Svc.ElementsWithAliasReference(null!, "x"));
        X.V(p + "pathRefNull", () => Svc.ElementsWithCAEXPathReference(null!, "x"));
        X.V(p + "pathRefPathNull", () => Svc.ElementsWithCAEXPathReference(file, null!));
        X.V(p + "idRefNull", () => Svc.ElementsWithIDReference(null!, "x"));
        X.V(p + "idRefIdNull", () => Svc.ElementsWithIDReference(file, null!));
        X.V(p + "linkRelNull", () => Svc.ElementsWithInternalLinkRelations(null!));
        X.V(p + "eiMirNull", () => Svc.ExternalInterfaceMirrors(null!));
        X.V(p + "fbiDocNull", () => D(Svc.FindByID(null!, "x")));
        X.V(p + "fbpDocNull", () => D(Svc.FindByPath(null!, "x")));
        X.V(p + "ifRelNull", () => Svc.InterfacesWithInternalLinkRelations(null!));
        X.V(p + "ieMirNull", () => Svc.InternalElementMirrors(null!));
        X.V(p + "linksElNull", () => Svc.InternalLinksToElement(null!));
        X.V(p + "linksIfNull", () => Svc.InternalLinksToInterface(null!));
        X.V(p + "masterIeNull", () => Svc.IsMaster((InternalElementType)null!));
        X.V(p + "isRefNull", () => Svc.IsReferenced(null!));
        X.V(p + "addNull", () => { Svc.AddDocument(null!); return "ok"; });
        X.V(p + "removeNull", () => { Svc.RemoveDocument(null!); return "ok"; });
        X.V(p + "removeOther", () =>
        {
            // unloaded at once: a live document of no script changes which document an unloaded node resolves to
            var other = CAEXDocument.New_CAEXDocument(doc.Schema);
            Svc.RemoveDocument(other);
            other.Unload();
            return "ok";
        });
        // copies are not in a document
        var ie = objs.OfType<InternalElementType>().FirstOrDefault();
        if (ie != null)
        {
            var c = (CAEXObject)ie.Copy();
            X.V(p + "detIe", () => D(c));
            ObjectQueries(p + "detIe:", c, true);
        }
        var cls = objs.FirstOrDefault(o => o is IClassWithBaseClassReference);
        if (cls != null)
        {
            var c = (CAEXObject)cls.Copy();
            X.V(p + "detClass", () => D(c));
            ObjectQueries(p + "detClass:", c, true);
        }
    }

    // ------------------------------------------------------------------------------- operations

    static string Str(JsonObject op, string key) => op[key]!.GetValue<string>();
    static string? StrN(JsonObject op, string key) => op[key]?.GetValue<string>();
    static int Int(JsonObject op, string key) => op[key]!.GetValue<int>();

    static bool IsKind(CAEXBasicObject x, string k) => k switch
    {
        "class" => x is IClassWithBaseClassReference,
        "lib" => x is SystemUnitClassLibType or RoleClassLibType or InterfaceClassLibType or AttributeTypeLibType,
        "attr" => x is AttributeType,
        "ei" => x is ExternalInterfaceType,
        "ie" => x is InternalElementType,
        "il" => x is InternalLinkType,
        "suc" => x is SystemUnitFamilyType,
        "rc" => x is RoleFamilyType,
        "ic" => x is InterfaceFamilyType,
        "at" => x is AttributeFamilyType,
        "rr" => x is RoleRequirementsType,
        "src" => x is SupportedRoleClassType,
        "map" => x is AttributeNameMappingType or InterfaceNameMappingType,
        _ => false,
    };

    /// <summary>The CAEX basic objects of the kind in document order, the one at index op[key] modulo their number.</summary>
    static CAEXBasicObject? PickKind(JsonObject op, string k, string key)
    {
        var all = Doc.XDocument.Root!.Descendants().Select(e => e.CreateCAEXWrapper()).OfType<CAEXBasicObject>().Where(x => IsKind(x, k)).ToList();
        return all.Count == 0 ? null : all[Int(op, key) % all.Count];
    }

    static string? RefValue(JsonObject op, string k)
    {
        switch (Str(op, "vk"))
        {
            case "path":
            {
                var target = k switch { "ie" => "suc", "ei" or "ic" => "ic", "suc" => "suc", "rc" or "rr" or "src" => "rc", "attr" or "at" => "at", _ => "ei" };
                return (PickKind(op, target, "b") as CAEXObject)?.CAEXPath();
            }
            case "id":
                return EngineOpsOracle.Pick<CAEXObject>(Doc, op, "b", x => !string.IsNullOrEmpty(x.ID))?.ID;
            case "ieif":
            {
                var ei = (ExternalInterfaceType?)PickKind(op, "ei", "b");
                return ei == null ? null : (ei.CAEXParent as CAEXObject)?.ID + ":" + ei.Name;
            }
            default:
                return StrN(op, "value");
        }
    }

    static string Apply(JsonObject op)
    {
        var doc = Doc;
        switch (Str(op, "op"))
        {
            case "renameKind":
            {
                if (PickKind(op, Str(op, "k"), "a") is not CAEXObject o) return "none";
                o.Name = StrN(op, "name");
                return D(o);
            }
            case "removeKind":
            {
                if (Str(op, "k") == "ext")
                {
                    var refs = doc.CAEXFile.ExternalReference.ToList();
                    if (refs.Count == 0) return "none";
                    var r = refs[Int(op, "a") % refs.Count];
                    var a = r.Alias;
                    r.Remove();
                    return N(a);
                }
                if (PickKind(op, Str(op, "k"), "a") is not { } o) return "none";
                var d = D(o);
                o.Remove(op["rel"]!.GetValue<bool>());
                return d;
            }
            case "setID":
            {
                var o = EngineOpsOracle.Pick<CAEXObject>(doc, op, "a");
                if (o == null) return "none";
                var v = Str(op, "mode") == "dup" ? EngineOpsOracle.Pick<CAEXObject>(doc, op, "b", x => !string.IsNullOrEmpty(x.ID))?.ID : StrN(op, "value");
                o.ID = v;
                return D(o) + "|" + N(v);
            }
            case "setRef":
            {
                var k = Str(op, "k");
                var t = PickKind(op, k, "a");
                if (t == null) return "none";
                var v = RefValue(op, k);
                string? now;
                switch (t)
                {
                    case InternalElementType x: x.RefBaseSystemUnitPath = v; now = x.RefBaseSystemUnitPath; break;
                    case ExternalInterfaceType x: x.RefBaseClassPath = v; now = x.RefBaseClassPath; break;
                    case SystemUnitFamilyType x: x.RefBaseClassPath = v; now = x.RefBaseClassPath; break;
                    case RoleFamilyType x: x.RefBaseClassPath = v; now = x.RefBaseClassPath; break;
                    case InterfaceFamilyType x: x.RefBaseClassPath = v; now = x.RefBaseClassPath; break;
                    case AttributeTypeType x: x.RefAttributeType = v; now = x.RefAttributeType; break;
                    case RoleRequirementsType x: x.RefBaseRoleClassPath = v; now = x.RefBaseRoleClassPath; break;
                    case SupportedRoleClassType x: x.RefRoleClassPath = v; now = x.RefRoleClassPath; break;
                    case InternalLinkType x:
                        if (Str(op, "side") == "A") x.RefPartnerSideA = v; else x.RefPartnerSideB = v;
                        now = x.RefPartnerSideA + "|" + x.RefPartnerSideB;
                        break;
                    default: return "unsupported";
                }
                return D(t) + "|" + N(v) + "|" + N(now);
            }
            case "insertSibling":
            {
                var k = Str(op, "k");
                var t = PickKind(op, k, "a");
                var src = PickKind(op, k, "b");
                if (t == null || src == null) return "none";
                var before = op["before"]!.GetValue<bool>();
                switch (t)
                {
                    case InternalLinkType x: if (before) x.InsertBefore((InternalLinkType)src); else x.InsertAfter((InternalLinkType)src); break;
                    case InternalElementType x: if (before) x.InsertBefore((InternalElementType)src); else x.InsertAfter((InternalElementType)src); break;
                    case SystemUnitFamilyType x: if (before) x.InsertBefore((SystemUnitFamilyType)src); else x.InsertAfter((SystemUnitFamilyType)src); break;
                    case RoleFamilyType x: if (before) x.InsertBefore((RoleFamilyType)src); else x.InsertAfter((RoleFamilyType)src); break;
                    case InterfaceFamilyType x: if (before) x.InsertBefore((InterfaceFamilyType)src); else x.InsertAfter((InterfaceFamilyType)src); break;
                    case AttributeType x: if (before) x.InsertBefore((AttributeType)src); else x.InsertAfter((AttributeType)src); break;
                    default: return "unsupported";
                }
                return D(src) + "|" + D(t);
            }
            case "extRefNew":
            {
                var r = doc.CAEXFile.New_ExternalReference(StrN(op, "path"), StrN(op, "alias"));
                return D(r) + "|" + N(r?.Alias) + "|" + N(r?.Path);
            }
            case "extRefSet":
            {
                var refs = doc.CAEXFile.ExternalReference.ToList();
                if (refs.Count == 0) return "none";
                var r = refs[Int(op, "a") % refs.Count];
                r.Alias = StrN(op, "value");
                return N(r.Alias) + "|" + N(r.Path);
            }
            case "attrMirror":
            {
                var a = EngineOpsOracle.Pick<AttributeType>(doc, op, "a");
                var t = EngineOpsOracle.Pick<CAEXObject>(doc, op, "b", x => x is IObjectWithAttributes);
                if (a == null || t == null) return "none";
                var m = a.CreateMirror();
                var inserted = ((IObjectWithAttributes)t).Attribute.Insert(m);
                return D(inserted) + "|" + N(m.RefAttributeType);
            }
            case "eiMirror":
            {
                var e = EngineOpsOracle.Pick<ExternalInterfaceType>(doc, op, "a");
                var t = EngineOpsOracle.Pick<CAEXObject>(doc, op, "b", x => x is IObjectWithExternalInterface);
                if (e == null || t == null) return "none";
                var m = e.CreateMirror();
                var inserted = ((IObjectWithExternalInterface)t).ExternalInterface.Insert(m);
                return D(inserted) + "|" + N(m.RefBaseClassPath);
            }
            case "mapping":
            {
                if (PickKind(op, "rr", "a") is not RoleRequirementsType r) return "none";
                var m = r.New_MappingObject();
                CAEXWrapper? res = Str(op, "kind") switch
                {
                    "attrName" => m.New_AttributeNameMapping(StrN(op, "x"), StrN(op, "y")),
                    "ifName" => m.New_InterfaceNameMapping(StrN(op, "x"), StrN(op, "y")),
                    _ => m.New_InterfaceIDMapping(StrN(op, "x"), StrN(op, "y")),
                };
                return D(m) + "|" + D(res) + "|" + N(res?.Node?.ToString(SaveOptions.DisableFormatting));
            }
            case "refSet":
            {
                // ICAEXReference.SetValue on a reference of the tables (changes the document through the engine)
                var file = doc.CAEXFile;
                IEnumerable<ICAEXReference> refs = Str(op, "src") switch
                {
                    "path" => Svc.AllElementsWithCAEXPathReference(file).SelectMany(g => g),
                    "id" => Svc.AllElementsWithIDReference(file).SelectMany(g => g),
                    "name" => Svc.AllElementsWithNameReference(file).SelectMany(g => g),
                    "alias" => Svc.AllElementsWithAliasReference(file).SelectMany(g => g),
                    _ => Svc.AllElementsWithIDs(file).SelectMany(g => g),
                };
                var list = refs.ToList();
                if (list.Count == 0) return "none";
                var r = list[Int(op, "a") % list.Count];
                var before = R(r);
                r.SetValue(StrN(op, "value"));
                return before + "|" + R(r);
            }
            case "changeNameRefs":
            {
                var t = PickKind(op, "class", "a");
                switch (t)
                {
                    case SystemUnitFamilyType x: x.ChangeNameAndReferences(StrN(op, "name")); break;
                    case RoleFamilyType x: x.ChangeNameAndReferences(StrN(op, "name")); break;
                    case InterfaceFamilyType x: x.ChangeNameAndReferences(StrN(op, "name")); break;
                    case AttributeFamilyType x: x.ChangeNameAndReferences(StrN(op, "name")); break;
                    default: return "none";
                }
                return D(t);
            }
            case "setNameRef":
            {
                var t = PickKind(op, "map", "a");
                var v = StrN(op, "value");
                var su = Str(op, "which") == "su";
                switch (t)
                {
                    case AttributeNameMappingType x: if (su) x.SystemUnitAttributeName = v; else x.RoleAttributeName = v; break;
                    case InterfaceNameMappingType x: if (su) x.SystemUnitInterfaceName = v; else x.RoleInterfaceName = v; break;
                    default: return "none";
                }
                return N(t.Node.ToString(SaveOptions.DisableFormatting));
            }
            default:
                return EngineOpsOracle.Apply(doc, op);
        }
    }
}
