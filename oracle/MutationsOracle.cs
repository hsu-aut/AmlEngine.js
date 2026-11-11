using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Commands;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Services;
using Aml.Engine.Services.Interfaces;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// Coverage work package "mutations": write operations of the engine (CAEXSequence, Insert/Import,
/// Copy, references, instances, mirrors, role and interface references, links, removal, external
/// references, mappings) run as operation scripts (scripts/gen-mutations.mjs). Per step the result,
/// every change event (CaexCommand static events and CAEXDocument.Commands events), every call of
/// a recording IUndoRedo service and a hash of the canonical document are recorded. The JS runner
/// is test/engine/mutations.oracle.test.ts; both must stay in sync.
///   mutations &lt;scripts.json&gt; &lt;corpusDir&gt; &lt;out.json&gt;
/// </summary>
public static class MutationsOracle
{
    public static void Run(string[] args)
    {
        var scripts = JsonNode.Parse(File.ReadAllText(args[0]))!.AsArray();
        var corpus = args[1];
        // With the LookupService of Aml.Engine.Services registered (ORACLE_SERVICES), the original
        // can end with a stack overflow (on a moved element): each script then runs in its own
        // process, see RunIsolated.
        if ((Environment.GetEnvironmentVariable("ORACLE_SERVICES") ?? "").Split(',').Any(s => s.Trim() == "lookup")
            && Environment.GetEnvironmentVariable("MUT_CHILD") == null)
        {
            RunIsolated(args, scripts.Count);
            return;
        }
        if (Environment.GetEnvironmentVariable("MUT_CHILD") is { } child)
        {
            // Child of RunIsolated: one script; each step and the final text on stdout as it is done.
            CaexCommand.CAEXElementChangingEvent += StaticChanging;
            CaexCommand.CAEXElementChangedEvent += StaticChanged;
            var one = RunScript(scripts[int.Parse(child)]!.AsObject(), corpus,
                step => Console.Out.WriteLine("STEP " + step.ToJsonString()));
            Console.Out.WriteLine("FINAL " + JsonValue.Create(one["final"]!.GetValue<string>()).ToJsonString());
            return;
        }
        CaexCommand.CAEXElementChangingEvent += StaticChanging;
        CaexCommand.CAEXElementChangedEvent += StaticChanged;
        var results = new JsonArray();
        // MUT_DUMP=<script>:<step>:<file> writes the canonical document after that step (debugging).
        var dump = Environment.GetEnvironmentVariable("MUT_DUMP")?.Split(':', 3);
        for (int i = 0; i < scripts.Count; i++)
        {
            DumpStep = dump != null && int.Parse(dump[0]) == i ? int.Parse(dump[1]) : -1;
            DumpFile = dump?[2];
            if (Environment.GetEnvironmentVariable("MUT_TRACE") != null) Console.Error.WriteLine("script " + i);
            results.Add(RunScript(scripts[i]!.AsObject(), corpus));
        }
        CaexCommand.CAEXElementChangingEvent -= StaticChanging;
        CaexCommand.CAEXElementChangedEvent -= StaticChanged;
        File.WriteAllText(args[2], results.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
    }

    // ---- per script state ----------------------------------------------------------------------

    static CAEXDocument A = null!;
    static CAEXDocument? B;
    static readonly List<CAEXWrapper> Pool = new();
    static readonly List<string> Events = new();
    static Recorder? Undo;
    static TestResolver? Resolver;
    static int DumpStep = -1;
    static string? DumpFile;
    /// <summary>Calls of the test services (undo/redo recorder, external reference resolver).</summary>
    static readonly List<string> Log = new();

    static CAEXDocument Open(string start, string corpus) => start switch
    {
        "new30" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0),
        "new215" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15),
        "newDefault" => CAEXDocument.New_CAEXDocument(),
        _ => CAEXDocument.LoadFromString(File.ReadAllText(Path.Combine(corpus, start), Encoding.UTF8)),
    };

    /// <summary>
    /// Runs every script in a child process (MUT_CHILD=<index>) and collects its steps. When the
    /// child ends with a stack overflow (exit code 0xC00000FD, or 0xC0000005 or "Stack overflow."
    /// on stderr, see ReadsOracle), the result has the steps before it and
    /// <c>"crash": "stackoverflow"</c> at the step that overflowed; the port must throw
    /// CyclicReferenceException there (docs/deviations.md, "Calls that do not return").
    /// </summary>
    static void RunIsolated(string[] args, int count)
    {
        const int StackOverflowExit = unchecked((int)0xC00000FD);
        const int AccessViolationExit = unchecked((int)0xC0000005);
        var results = new JsonArray();
        for (int i = 0; i < count; i++)
        {
            var psi = new System.Diagnostics.ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardError = true, RedirectStandardOutput = true };
            psi.ArgumentList.Add(typeof(MutationsOracle).Assembly.Location);
            psi.ArgumentList.Add("mutations");
            psi.ArgumentList.Add(args[0]);
            psi.ArgumentList.Add(args[1]);
            psi.ArgumentList.Add(args[2]);
            psi.Environment["MUT_CHILD"] = i.ToString(System.Globalization.CultureInfo.InvariantCulture);
            using var p = System.Diagnostics.Process.Start(psi)!;
            var err = p.StandardError.ReadToEndAsync();
            var outText = p.StandardOutput.ReadToEnd();
            p.WaitForExit();
            var steps = new JsonArray();
            string? final = null;
            foreach (var line in outText.Split('\n'))
            {
                var l = line.TrimEnd('\r');
                if (l.StartsWith("STEP ", StringComparison.Ordinal)) steps.Add(JsonNode.Parse(l.Substring(5)));
                else if (l.StartsWith("FINAL ", StringComparison.Ordinal)) final = JsonNode.Parse(l.Substring(6))!.GetValue<string>();
            }
            if (p.ExitCode == 0 && final != null)
            {
                results.Add(new JsonObject { ["steps"] = steps, ["final"] = final });
                continue;
            }
            var overflow = p.ExitCode == StackOverflowExit
                || err.Result.StartsWith("Stack overflow.", StringComparison.Ordinal)
                || (p.ExitCode == AccessViolationExit && err.Result.Trim().Length == 0);
            if (!overflow) throw new InvalidOperationException($"mutations script {i}: exit {p.ExitCode}: {err.Result}");
            results.Add(new JsonObject { ["steps"] = steps, ["crash"] = "stackoverflow", ["final"] = null });
        }
        File.WriteAllText(args[2], results.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
    }

    static JsonObject RunScript(JsonObject script, string corpus, Action<JsonArray>? onStep = null)
    {
        var canon = new EngineOpsOracle.Canonicalizer();
        var steps = new JsonArray();
        Pool.Clear();
        Events.Clear();
        A = Open(script["start"]!.GetValue<string>(), corpus);
        B = script["other"] is JsonNode o ? Open(o.GetValue<string>(), corpus) : null;
        A.Commands.CAEXElementChangingEvent += DocChanging;
        A.Commands.CAEXElementChangedEvent += DocChanged;
        if (B != null)
        {
            B.Commands.CAEXElementChangingEvent += DocChanging;
            B.Commands.CAEXElementChangedEvent += DocChanged;
        }
        Undo = script["undo"]?.GetValue<bool>() == true ? new Recorder() : null;
        if (Undo != null) ServiceLocator.Register<IUndoRedo>(Undo);
        Resolver = script["resolver"]?.GetValue<bool>() == true ? new TestResolver() : null;
        if (Resolver != null) ServiceLocator.Register<IExternalReferenceResolver>(Resolver);
        string text = "";
        try
        {
            foreach (var op in script["ops"]!.AsArray())
            {
                Events.Clear();
                Log.Clear();
                string result;
                try { result = Apply(op!.AsObject()); }
                catch (Exception e) { result = "!" + e.GetType().Name; }
                try { text = Save(A); }
                catch (Exception e) { text = "!" + e.GetType().Name; }
                text = canon.Apply(text);
                var res = canon.Apply(result);
                var ev = canon.Apply(string.Join("\n", Events));
                var un = canon.Apply(string.Join("\n", Log));
                if (steps.Count == DumpStep) File.WriteAllText(DumpFile!, text);
                var step = new JsonArray(res, ev, un, Hash(text));
                onStep?.Invoke((JsonArray)step.DeepClone());
                steps.Add(step);
            }
        }
        finally
        {
            if (Undo != null) ServiceLocator.UnRegister<IUndoRedo>();
            if (Resolver != null) ServiceLocator.UnRegister<IExternalReferenceResolver>();
            A.Commands.CAEXElementChangingEvent -= DocChanging;
            A.Commands.CAEXElementChangedEvent -= DocChanged;
            if (B != null)
            {
                B.Commands.CAEXElementChangingEvent -= DocChanging;
                B.Commands.CAEXElementChangedEvent -= DocChanged;
            }
            A.Dispose();
            B?.Dispose();
            Pool.Clear();
        }
        return new JsonObject { ["steps"] = steps, ["final"] = text };
    }

    static string Save(CAEXDocument doc)
    {
        using var s = doc.SaveToStream(true);
        s.Position = 0;
        return new StreamReader(s).ReadToEnd();
    }

    static string Hash(string text) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).Substring(0, 16);

    // ---- events --------------------------------------------------------------------------------

    static void StaticChanging(object? sender, CAEXElementChangeEventArgs e) => Record("S-", sender, e);
    static void StaticChanged(object? sender, CAEXElementChangeEventArgs e) => Record("S+", sender, e);
    static void DocChanging(object? sender, CAEXElementChangeEventArgs e) => Record("D-", sender, e);
    static void DocChanged(object? sender, CAEXElementChangeEventArgs e) => Record("D+", sender, e);

    static string DocTag(XDocument? d) =>
        d == null ? "-" : d == A.XDocument ? "A" : B != null && d == B.XDocument ? "B" : "X";

    static string DocTag(CAEXDocument? d) => d == null ? "null" : DocTag(d.XDocument);

    static string SenderTag(object? s) => s switch
    {
        null => "null",
        XDocument x => "x" + DocTag(x),
        CAEXDocument c => "c" + DocTag(c),
        _ => "?",
    };

    static string X(XElement? e) =>
        e == null ? "null" : $"{e.Name.LocalName}[{e.Attribute("Name")?.Value}|{e.Attribute("ID")?.Value}]{DocTag(e.Document)}";

    static string V(object? v) => v switch
    {
        null => "null",
        string s => "\"" + s + "\"",
        _ => "obj",
    };

    static void Record(string src, object? sender, CAEXElementChangeEventArgs e)
    {
        Events.Add($"{src}{(int)e.ChangeMode}|{X(e.CAEXElement)}|{X(e.CAEXParent)}|{e.CAEXAttributeName ?? "null"}|{V(e.OldValue)}|{V(e.NewValue)}|{e.CAEXAttribute?.Value ?? "null"}|{DocTag(e.CAEXDocument)}|{SenderTag(sender)}");
    }

    /// <summary>An undo/redo service that records every call and can undo/redo whole transactions.</summary>
    sealed class Recorder : IUndoRedo
    {
        readonly List<List<ICAEXCommand>> undo = new();
        readonly List<List<ICAEXCommand>> redo = new();
        List<ICAEXCommand>? open;

        public bool BeginTransaction(CAEXDocument document, string name = "", CAEXDocument relatedDocument = null!)
        {
            var started = open == null;
            Log.Add($"begin {DocTag(document)} {name} {(relatedDocument == null ? "null" : DocTag(relatedDocument))} -> {started}");
            if (started) open = new List<ICAEXCommand>();
            return started;
        }

        public bool EndTransaction(CAEXDocument document)
        {
            Log.Add($"end {DocTag(document)} {(open == null ? "none" : open.Count.ToString())}");
            if (open == null) return false;
            if (open.Count > 0) undo.Add(open);
            open = null;
            redo.Clear();
            return true;
        }

        public void PushCommand(ICAEXCommand cmd)
        {
            Log.Add($"push {cmd.GetType().Name} {DocTag(cmd.CAEXDocument)} {cmd.DisplayName ?? "null"}");
            if (open != null) open.Add(cmd);
            else
            {
                undo.Add(new List<ICAEXCommand> { cmd });
                redo.Clear();
            }
        }

        public void Pause(CAEXDocument document = null!) => Log.Add($"pause {(document == null ? "null" : DocTag(document))}");
        public void Resume(CAEXDocument document = null!) => Log.Add($"resume {(document == null ? "null" : DocTag(document))}");

        public void Undo(CAEXDocument document)
        {
            if (undo.Count == 0) { Log.Add("undo none"); return; }
            var t = undo[^1];
            undo.RemoveAt(undo.Count - 1);
            Log.Add($"undo {t.Count}");
            for (int i = t.Count - 1; i >= 0; i--) t[i].UnExecute();
            redo.Add(t);
        }

        public void Redo(CAEXDocument document)
        {
            if (redo.Count == 0) { Log.Add("redo none"); return; }
            var t = redo[^1];
            redo.RemoveAt(redo.Count - 1);
            Log.Add($"redo {t.Count}");
            foreach (var c in t) c.Execute();
            undo.Add(t);
        }

        public bool CanRedo(CAEXDocument document) => redo.Count > 0;
        public bool CanUndo(CAEXDocument document) => undo.Count > 0;
        public void ClearStacks(CAEXDocument document) { undo.Clear(); redo.Clear(); }
        public DateTime LastModificationDate(CAEXDocument document, bool undo = true) => DateTime.MinValue;
        public IEnumerable<string> RedoActions(CAEXDocument document) => Array.Empty<string>();
        public IEnumerable<string> UndoActions(CAEXDocument document) => Array.Empty<string>();
    }

    /// <summary>
    /// An external reference resolver for tests: every element of document B is external to other
    /// documents (alias "ext", path "other.aml"); "other.aml" resolves to document B.
    /// </summary>
    sealed class TestResolver : IExternalReferenceResolver
    {
        public bool IsExternal(CAEXDocument document, XElement element, out string alias, out string path)
        {
            var r = B != null && element?.Document == B.XDocument && document?.XDocument != B.XDocument;
            alias = r ? "ext" : null!;
            path = r ? "other.aml" : null!;
            Log.Add($"isExternal {DocTag(document)} {X(element)} -> {r}");
            return r;
        }

        public (CAEXDocument Document, string Message) LoadOrGetReferencedDocument(ExternalReferenceType externalReference)
        {
            Log.Add($"load {externalReference?.Alias}|{externalReference?.Path}");
            return externalReference?.Path == "other.aml" && B != null ? (B, "") : (null!, "not found");
        }

        public (CAEXDocument Document, string Message) LoadOrGetReferencedDocument(CAEXDocument document, string path)
        {
            Log.Add($"loadPath {DocTag(document)} {path}");
            return path == "other.aml" && B != null ? (B, "") : (null!, "not found");
        }

        public void SetRedirection(string address, string redirectAddress) => Log.Add("setRedirection");
        public void ClearRedirection(string address) => Log.Add("clearRedirection");
        public void ClearRedirection() => Log.Add("clearRedirection");
        public bool IsExternalReferenceRegistered(ExternalReferenceType externalReference, string path) { Log.Add("isRegistered " + path); return false; }
        public CAEXDocument RegisterExternalDocument(ExternalReferenceType externalReference, CAEXDocument document, string path) { Log.Add("register " + path); return document; }
        public IEnumerable<CAEXDocument> ResolvedDocuments(CAEXDocument documentWithExternals) { Log.Add("resolved"); return Array.Empty<CAEXDocument>(); }
        public (CAEXDocument Document, string Message) ResolveExternalDocument(string url, bool useCache = true) { Log.Add("resolve " + url); return (null!, "not found"); }
        public void RegisterResolverFunction(Func<string, CAEXDocument> resolverFunction) => Log.Add("registerFunction");
        public bool CanResolve(string externalAddress) { Log.Add("canResolve " + externalAddress); return false; }
        public void UnloadDocument(string url) => Log.Add("unload " + url);
    }

    // ---- picking -------------------------------------------------------------------------------

    /// <summary>All wrappers of the document (root first, then descendants in document order).</summary>
    static List<CAEXWrapper> Wrappers(CAEXDocument doc) =>
        doc.XDocument.Root!.DescendantsAndSelf()
            .Select(e => e.CreateCAEXWrapper())
            .Where(w => w != null)
            .ToList()!;

    static bool IsKind(CAEXWrapper w, string kind) => kind switch
    {
        "wrap" => true,
        "basic" => w is CAEXBasicObject,
        "obj" => w is CAEXObject,
        "file" => w is CAEXFileType,
        "ie" => w is InternalElementType,
        "suc" => w is SystemUnitFamilyType,
        "sucType" => w is SystemUnitClassType,
        "rc" => w is RoleFamilyType,
        "ic" => w is InterfaceFamilyType,
        "at" => w is AttributeFamilyType,
        "attr" => w is AttributeType,
        "ei" => w is ExternalInterfaceType,
        "il" => w is InternalLinkType,
        "ih" => w is InstanceHierarchyType,
        "rr" => w is RoleRequirementsType,
        "src" => w is SupportedRoleClassType,
        "extref" => w is ExternalReferenceType,
        "sdi" => w is SourceDocumentInformationType,
        "mapping" => w is MappingType,
        "revision" => w is RevisionType,
        "cls" => w is IClassWithBaseClassReference,
        "eiOwner" => w is IObjectWithExternalInterface,
        "lib" => w is ICAEXLibrary,
        _ => throw new NotSupportedException("kind " + kind),
    };

    static CAEXWrapper? Pick(CAEXDocument? doc, string kind, JsonNode? index, Func<CAEXWrapper, bool>? filter = null)
    {
        if (doc == null || index == null) return null;
        var all = Wrappers(doc).Where(w => IsKind(w, kind) && (filter == null || filter(w))).ToList();
        if (all.Count == 0) return null;
        return all[index.GetValue<int>() % all.Count];
    }

    /// <summary>Picks from document A; the "b" object comes from document B when the op has bd: true.</summary>
    static CAEXWrapper? PickA(JsonObject op, string kind, string key = "a", Func<CAEXWrapper, bool>? filter = null) =>
        Pick(key == "b" && op["bd"]?.GetValue<bool>() == true ? B : A, kind, op[key], filter);

    static string Str(JsonObject op, string key) => op[key]!.GetValue<string>();
    static string? StrN(JsonObject op, string key) => op[key]?.GetValue<string>();
    static bool Bool(JsonObject op, string key) => op[key]!.GetValue<bool>();
    static int Int(JsonObject op, string key) => op[key]!.GetValue<int>();

    /// <summary>A typed CLR value: {t:"s"|"i"|"d"|"b"|"n"|"dt", v}.</summary>
    static object? Val(JsonNode? n)
    {
        if (n == null) return null;
        var o = n.AsObject();
        return o["t"]!.GetValue<string>() switch
        {
            "s" => o["v"]!.GetValue<string>(),
            "i" => o["v"]!.GetValue<int>(),
            "d" => o["v"]!.GetValue<double>(),
            "b" => o["v"]!.GetValue<bool>(),
            "dt" => DateTime.Parse(o["v"]!.GetValue<string>(), System.Globalization.CultureInfo.InvariantCulture, System.Globalization.DateTimeStyles.RoundtripKind),
            _ => null,
        };
    }

    static (string Name, object Value)[] Tuples(JsonObject op) =>
        op["tuples"]!.AsArray().Select(t => (t!["n"]!.GetValue<string>(), Val(t["v"])!)).ToArray();

    /// <summary>A source object for Insert/Import: {k: same|other|copy|pool|create|null, i, tag}.</summary>
    static CAEXWrapper? Source(JsonNode? spec, string tag)
    {
        if (spec == null) return null;
        var s = spec.AsObject();
        var i = s["i"]!.GetValue<int>();
        bool Tag(CAEXWrapper w) => tag == "*" ? w is CAEXBasicObject : w.Node?.Name.LocalName == tag;
        switch (s["k"]!.GetValue<string>())
        {
            case "same": return Pick(A, "wrap", s["i"], Tag);
            case "other": return Pick(B, "wrap", s["i"], Tag);
            case "copy":
            {
                var w = Pick(A, "wrap", s["i"], Tag);
                return w?.Copy();
            }
            case "pool":
            {
                var all = Pool.Where(Tag).ToList();
                return all.Count == 0 ? null : all[i % all.Count];
            }
            case "create":
            {
                var w = A.Create(tag == "*" ? "InternalElement" : tag);
                if (w != null) Pool.Add(w);
                return w;
            }
            default: return null;
        }
    }

    // ---- description ---------------------------------------------------------------------------

    static string Try(Func<string?> f)
    {
        try { return f() ?? "null"; }
        catch (Exception e) { return "!" + e.GetType().Name; }
    }

    static string D(object? o)
    {
        if (o == null) return "null";
        if (o is not CAEXWrapper w) return "?" + o.GetType().Name;
        var n = w.Node;
        if (n == null) return "nonode";
        var path = w is CAEXObject c ? Try(() => c.CAEXPath()) : "";
        return $"{n.Name.LocalName}|{n.Attribute("Name")?.Value}|{n.Attribute("ID")?.Value}|{DocTag(n.Document)}|{path}";
    }

    static string Text(CAEXWrapper? w) => w?.Node == null ? "null" : w.Node.ToString();

    static string B2(bool b) => b ? "T" : "F";

    // ---- sequences -----------------------------------------------------------------------------

    static readonly HashSet<string> Named = new()
    {
        "InternalElement", "Attribute", "ExternalInterface", "InternalLink", "SystemUnitClass", "RoleClass",
        "InterfaceClass", "AttributeType", "InstanceHierarchy", "SystemUnitClassLib", "RoleClassLib",
        "InterfaceClassLib", "AttributeTypeLib",
    };

    static dynamic? Seq(CAEXWrapper w, string prop) => prop switch
    {
        "InternalElement" => w switch { InstanceHierarchyType ih => ih.InternalElement, SystemUnitClassType s => s.InternalElement, _ => null },
        "Attribute" => w is IObjectWithAttributes o ? o.Attribute : null,
        "ExternalInterface" => w is IObjectWithExternalInterface o ? o.ExternalInterface : null,
        "InternalLink" => w is SystemUnitClassType s ? s.InternalLink : null,
        "SupportedRoleClass" => w is SystemUnitClassType s ? s.SupportedRoleClass : null,
        "RoleRequirements" => w is InternalElementType ie ? ie.RoleRequirements : null,
        "SystemUnitClass" => w switch { SystemUnitClassLibType l => l.SystemUnitClass, SystemUnitFamilyType f => f.SystemUnitClass, _ => null },
        "RoleClass" => w switch { RoleClassLibType l => l.RoleClass, RoleFamilyType f => f.RoleClass, _ => null },
        "InterfaceClass" => w switch { InterfaceClassLibType l => l.InterfaceClass, InterfaceFamilyType f => f.InterfaceClass, _ => null },
        "AttributeType" => w switch { AttributeTypeLibType l => l.AttributeType, AttributeFamilyType f => f.AttributeType, _ => null },
        "InstanceHierarchy" => w is CAEXFileType f ? f.InstanceHierarchy : null,
        "SystemUnitClassLib" => w is CAEXFileType f ? f.SystemUnitClassLib : null,
        "RoleClassLib" => w is CAEXFileType f ? f.RoleClassLib : null,
        "InterfaceClassLib" => w is CAEXFileType f ? f.InterfaceClassLib : null,
        "AttributeTypeLib" => w is CAEXFileType f ? f.AttributeTypeLib : null,
        "ExternalReference" => w is CAEXFileType f ? f.ExternalReference : null,
        "SourceDocumentInformation" => w is CAEXFileType f ? f.SourceDocumentInformation : null,
        "Revision" => w is CAEXBasicObject b ? b.Revision : null,
        "SourceObjectInformation" => w is CAEXBasicObject b ? b.SourceObjectInformation : null,
        "Constraint" => w is AttributeTypeType a ? a.Constraint : null,
        "RefSemantic" => w is AttributeTypeType a ? a.RefSemantic : null,
        "AttributeNameMapping" => w is MappingType m ? m.AttributeNameMapping : null,
        "InterfaceNameMapping" => w is MappingType m ? m.InterfaceNameMapping : null,
        "InterfaceIDMapping" => w is MappingType m ? m.InterfaceIDMapping : null,
        _ => throw new NotSupportedException(prop),
    };

    static string SeqState(dynamic seq)
    {
        var names = new List<string>();
        foreach (CAEXWrapper x in seq) names.Add(x.Node.Attribute("Name")?.Value ?? x.Node.Name.LocalName);
        return $"{(int)seq.Count}:{string.Join(",", names)}";
    }

    static string ApplySeq(JsonObject op)
    {
        var prop = Str(op, "p");
        var owner = PickA(op, "wrap", "o", w => Seq(w, prop) != null);
        if (owner == null) return "none";
        dynamic seq = Seq(owner, prop)!;
        string tag = ((XName)seq.ElementName).LocalName;
        string r;
        switch (Str(op, "act"))
        {
            case "append":
            case "prepend":
            {
                var prepend = Str(op, "act") == "prepend";
                var mode = Str(op, "mode");
                object res;
                if (mode == "name")
                {
                    if (!Named.Contains(prop)) return "unnamed";
                    var name = StrN(op, "name");
                    res = prepend ? seq.Prepend(name) : seq.Append(name);
                }
                else if (mode == "tuples")
                {
                    var t = Tuples(op);
                    res = prepend ? seq.Prepend(t) : seq.Append(t);
                }
                else res = prepend ? seq.Prepend() : seq.Append();
                r = D(res) + "|" + Try(() => DocTag(((CAEXWrapper)res).CAEXDocument));
                break;
            }
            case "insert":
            {
                var src = Source(op["src"], tag);
                object? res = seq.Insert((dynamic?)src, Bool(op, "asFirst"), Bool(op, "asIs"));
                r = D(res) + "|src:" + D(src);
                break;
            }
            case "insertAt":
            {
                var src = Source(op["src"], tag);
                object? res = seq.InsertAt(Int(op, "index"), (dynamic?)src);
                r = D(res) + "|src:" + D(src);
                break;
            }
            case "move":
                seq.Move(Int(op, "from"), Int(op, "to"));
                r = "ok";
                break;
            case "removeElement":
            {
                object? item = seq[Int(op, "index")];
                seq.RemoveElement((dynamic?)item);
                r = D(item);
                break;
            }
            case "removeAt":
                r = B2(seq.RemoveAt(Int(op, "index")));
                break;
            case "removeAll":
                seq.Remove();
                r = "ok";
                break;
            case "query":
            {
                var i = Int(op, "index");
                var name = StrN(op, "name");
                var sb = new StringBuilder();
                sb.Append(Try(() => (string)SeqState(seq)));
                sb.Append('|').Append(Try(() => B2(seq.Exists)));
                sb.Append('|').Append(Try(() => D(seq.First)));
                sb.Append('|').Append(Try(() => D(seq.Last)));
                sb.Append('|').Append(Try(() => D(seq[i])));
                sb.Append('|').Append(Try(() => D(seq.At(i))));
                sb.Append('|').Append(Try(() => ((int)seq.IndexOf(seq[i])).ToString()));
                sb.Append('|').Append(Try(() => D(seq[("Name", name)])));
                sb.Append('|').Append(Try(() => D(seq[("ID", name)])));
                if (Named.Contains(prop))
                {
                    sb.Append('|').Append(Try(() => D(seq[name])));
                    sb.Append('|').Append(Try(() => D(seq[name, StrN(op, "name2")])));
                }
                seq[i] = seq[0];
                sb.Append('|').Append(Try(() => (string)SeqState(seq)));
                r = sb.ToString();
                break;
            }
            default:
                throw new NotSupportedException(Str(op, "act"));
        }
        return r + "|" + Try(() => (string)SeqState(Seq(owner, prop)!));
    }

    // ---- operations ----------------------------------------------------------------------------

    static string Apply(JsonObject op)
    {
        switch (Str(op, "op"))
        {
            case "seq":
                return ApplySeq(op);

            case "boInsert":
            {
                var t = PickA(op, "basic");
                if (t == null) return "none";
                var src = Source(op["src"], Str(op, "tag"));
                if (src == null) return "nosrc";
                return B2(((CAEXBasicObject)t).Insert(src, Bool(op, "asFirst"), Bool(op, "asIs"))) + "|" + D(src) + "|" + D(src.CAEXParent);
            }
            case "boInsertAt":
            {
                var t = PickA(op, "basic");
                if (t == null) return "none";
                var src = Source(op["src"], Str(op, "tag"));
                if (src == null) return "nosrc";
                return B2(((CAEXBasicObject)t).Insert(Int(op, "pos"), src)) + "|" + D(src);
            }
            case "boImport":
            {
                var t = PickA(op, "basic");
                if (t == null) return "none";
                var src = Source(op["src"], Str(op, "tag"));
                if (src == null) return "nosrc";
                var res = ((CAEXBasicObject)t).Import(src, StrN(op, "name"), Bool(op, "withSub"));
                return D(res) + "|" + D(src);
            }
            case "newRevision":
            {
                var t = PickA(op, "basic");
                if (t == null) return "none";
                var rev = ((CAEXBasicObject)t).New_Revision(new DateTime(2021, 3, 4, 5, 6, 7, DateTimeKind.Unspecified), StrN(op, "author"), Bool(op, "asFirst"));
                return D(rev) + "|" + Text(rev);
            }
            case "copy":
            {
                var t = PickA(op, Str(op, "k"));
                if (t == null) return "none";
                var c = t.Copy(Bool(op, "deep"), Bool(op, "ids"), Bool(op, "sub"));
                if (c != null) Pool.Add(c);
                return D(c) + "|" + Text(c) + "|" + Try(() => DocTag(c?.CAEXDocument));
            }
            case "copyNamed":
            {
                var t = (CAEXObject?)PickA(op, "obj");
                if (t == null) return "none";
                var c = t.Copy(StrN(op, "name"));
                if (c != null) Pool.Add(c);
                return D(c) + "|" + Text(c);
            }
            case "newGuid":
            {
                var t = (CAEXObject?)PickA(op, "obj");
                if (t == null) return "none";
                t.AssignNewGuidAsID(Bool(op, "upd"));
                return D(t);
            }
            case "rename":
            {
                var t = (CAEXObject?)PickA(op, "obj");
                if (t == null) return "none";
                t.Name = StrN(op, "name");
                return D(t);
            }
            case "changeNameRefs":
            {
                var t = PickA(op, "cls");
                switch (t)
                {
                    case SystemUnitFamilyType s: s.ChangeNameAndReferences(StrN(op, "name")); break;
                    case RoleFamilyType s: s.ChangeNameAndReferences(StrN(op, "name")); break;
                    case InterfaceFamilyType s: s.ChangeNameAndReferences(StrN(op, "name")); break;
                    case AttributeFamilyType s: s.ChangeNameAndReferences(StrN(op, "name")); break;
                    default: return "none";
                }
                return D(t);
            }
            case "copyTree":
            {
                var t = PickA(op, "cls");
                var p = (CAEXObject?)PickA(op, "obj", "b");
                if (t == null || p == null) return "none";
                var name = StrN(op, "name");
                object? res = t switch
                {
                    SystemUnitFamilyType s => s.CopyTreeAndChangeReferences(p, name),
                    RoleFamilyType s => s.CopyTreeAndChangeReferences(p, name),
                    InterfaceFamilyType s => s.CopyTreeAndChangeReferences(p, name),
                    AttributeFamilyType s => s.CopyTreeAndChangeReferences(p, name),
                    _ => "?",
                };
                return D(res);
            }
            case "instantiate":
            {
                var t = PickA(op, Str(op, "k"));
                if (t == null) return "none";
                var target = StrN(op, "target") switch { "A" => A, "B" => B, _ => null };
                CAEXWrapper? inst = t switch
                {
                    SystemUnitFamilyType s => s.CreateClassInstance(target),
                    RoleFamilyType s => s.CreateClassInstance(target),
                    InterfaceFamilyType s => s.CreateClassInstance(target),
                    AttributeFamilyType s => s.CreateClassInstance(target),
                    _ => null,
                };
                if (inst != null) Pool.Add(inst);
                return D(inst) + "|" + Text(inst) + "|" + Try(() => DocTag(inst?.CAEXDocument));
            }
            case "instantiateNamed":
            {
                var t = PickA(op, Str(op, "k"));
                if (t == null) return "none";
                var name = StrN(op, "name");
                CAEXBasicObject? inst = t switch
                {
                    SystemUnitFamilyType s => s.CreateClassInstance(name),
                    InterfaceFamilyType s => s.CreateClassInstance(name),
                    AttributeFamilyType s => s.CreateClassInstance(name),
                    _ => null,
                };
                if (inst != null) Pool.Add(inst);
                return D(inst) + "|" + Text(inst);
            }
            case "updateInstance":
            {
                var t = PickA(op, Str(op, "k"));
                return t switch
                {
                    InternalElementType x => B2(x.UpdateInstance()),
                    ExternalInterfaceType x => B2(x.UpdateInstance()),
                    AttributeType x => B2(x.UpdateInstance()),
                    RoleRequirementsType x => B2(x.UpdateInstance()),
                    SupportedRoleClassType x => B2(x.UpdateInstance()),
                    _ => "none",
                };
            }
            case "mirror":
            {
                var t = PickA(op, Str(op, "k"));
                CAEXObject? m = t switch
                {
                    InternalElementType x => x.CreateMirror(),
                    ExternalInterfaceType x => x.CreateMirror(),
                    AttributeType x => x.CreateMirror(),
                    _ => null,
                };
                if (t == null) return "none";
                if (m != null) Pool.Add(m);
                return D(m) + "|" + Text(m);
            }
            case "setMaster":
            {
                var k = Str(op, "k");
                var t = PickA(op, k);
                var m = Int(op, "b") < 0 ? null : PickA(op, k, "b");
                if (t == null) return "none";
                // A mirror cycle (an object mirroring itself, directly or over other mirrors)
                // overflows the stack of the original engine, which cannot be caught in .NET.
                for (var c = m as IMirror; c != null; c = c.Master as IMirror)
                    if (c.Node == t.Node) return "cycle";
                switch (t)
                {
                    case InternalElementType x: x.Master = (InternalElementType?)m; return D(x) + "|" + Try(() => x.MasterID) + "|" + Try(() => B2(x.IsMirror)) + "|" + Try(() => D(x.Master));
                    case ExternalInterfaceType x: x.Master = (ExternalInterfaceType?)m; return D(x) + "|" + Try(() => x.MasterID) + "|" + Try(() => B2(x.IsMirror)) + "|" + Try(() => D(x.Master));
                    case AttributeType x: x.Master = (AttributeType?)m; return D(x) + "|" + Try(() => x.MasterID) + "|" + Try(() => B2(x.IsMirror)) + "|" + Try(() => D(x.Master));
                }
                return "none";
            }
            case "createSUC":
            {
                var t = (InternalElementType?)PickA(op, "ie");
                if (t == null) return "none";
                var s = t.CreateSystemUnitClass();
                if (s != null) Pool.Add(s);
                return D(s) + "|" + Text(s);
            }
            case "addRoleIE":
            {
                var t = (InternalElementType?)PickA(op, "ie");
                var rc = (RoleFamilyType?)PickA(op, "rc", "b");
                if (t == null) return "none";
                IObjectWithRoleReference? res;
                if (Bool(op, "byPath"))
                {
                    var path = StrN(op, "path") ?? rc?.CAEXPath();
                    res = t.AddRoleClassReference(path, Bool(op, "addUnique"), Bool(op, "addInstance"));
                }
                else res = t.AddRoleClassReference(rc, Bool(op, "addSRC"), Bool(op, "addUnique"), Bool(op, "addInstance"));
                return D(res) + "|" + Text(res as CAEXWrapper);
            }
            case "addRoleSUC":
            {
                var t = (SystemUnitFamilyType?)PickA(op, "suc");
                var rc = (RoleFamilyType?)PickA(op, "rc", "b");
                if (t == null) return "none";
                IObjectWithRoleReference? res = Bool(op, "byPath")
                    ? t.AddRoleClassReference(StrN(op, "path") ?? rc?.CAEXPath(), Bool(op, "addUnique"))
                    : t.AddRoleClassReference(rc, Bool(op, "addUnique"));
                return D(res) + "|" + Text(res as CAEXWrapper);
            }
            case "replaceRole":
            {
                var rc = (RoleFamilyType?)PickA(op, "rc", "b");
                var t = PickA(op, Str(op, "k"));
                object? res = t switch
                {
                    InternalElementType ie => ie.ReplaceRoleClassReference(rc, Bool(op, "addSRC")),
                    SystemUnitFamilyType s => s.ReplaceRoleClassReference(rc),
                    _ => "none",
                };
                return res as string ?? D(res) + "|" + Text(res as CAEXWrapper);
            }
            case "hasRole":
            {
                var rc = (RoleFamilyType?)PickA(op, "rc", "b");
                var rr = (RoleRequirementsType?)PickA(op, "rr", "c");
                var path = StrN(op, "path") ?? rc?.CAEXPath();
                var sb = new StringBuilder();
                switch (PickA(op, Str(op, "k")))
                {
                    case InternalElementType ie:
                        var suc = (SystemUnitFamilyType?)PickA(op, "suc", "c");
                        sb.Append(Try(() => B2(ie.HasRoleClassReference(rc, false)))).Append(Try(() => B2(ie.HasRoleClassReference(rc, true))));
                        sb.Append(Try(() => B2(ie.HasRoleClassReference(path, false)))).Append(Try(() => B2(ie.HasRoleClassReference(path, true))));
                        sb.Append(Try(() => B2(ie.HasGenericRoleClassReference(rc)))).Append(Try(() => B2(ie.HasGenericRoleClassReference(path))));
                        sb.Append(Try(() => B2(ie.HasSystemUnitClassReference(suc, false)))).Append(Try(() => B2(ie.HasSystemUnitClassReference(suc, true))));
                        break;
                    case SystemUnitFamilyType s:
                        sb.Append(Try(() => B2(s.HasRoleClassReference(rc, false)))).Append(Try(() => B2(s.HasRoleClassReference(rc, true))));
                        sb.Append(Try(() => B2(s.HasRoleClassReference(path, false)))).Append(Try(() => B2(s.HasRoleClassReference(path, true))));
                        sb.Append(Try(() => B2(s.HasGenericRoleClassReference(rc)))).Append(Try(() => B2(s.HasGenericRoleClassReference(rr))));
                        break;
                    case RoleRequirementsType r:
                        sb.Append(Try(() => B2(r.HasRoleClassReference(rc, false)))).Append(Try(() => B2(r.HasRoleClassReference(rc, true))));
                        break;
                    default:
                        return "none";
                }
                return sb.ToString();
            }
            case "addInterface":
            {
                var t = PickA(op, "eiOwner");
                var ic = (InterfaceFamilyType?)PickA(op, "ic", "b");
                if (t == null) return "none";
                var name = StrN(op, "name");
                var byPath = Bool(op, "byPath");
                var path = StrN(op, "path") ?? ic?.CAEXPath();
                ExternalInterfaceType? res;
                if (t is SystemUnitClassType s)
                    res = byPath ? s.AddInterfaceClassReference(path, Bool(op, "addUnique"), Bool(op, "addInstance"), name!)
                                 : s.AddInterfaceClassReference(ic, Bool(op, "addUnique"), Bool(op, "addInstance"), name!);
                else
                    res = byPath ? ((IObjectWithExternalInterface)t).AddInterfaceClassReference(path, Bool(op, "addUnique"), Bool(op, "addInstance"), name!)
                                 : ((IObjectWithExternalInterface)t).AddInterfaceClassReference(ic, Bool(op, "addUnique"), Bool(op, "addInstance"), name!);
                return D(res) + "|" + Text(res);
            }
            case "link":
            {
                var a = (ExternalInterfaceType?)PickA(op, "ei");
                var b = (ExternalInterfaceType?)PickA(op, "ei", "b");
                if (a == null || b == null) return "none";
                var il = InternalLinkType.New_InternalLink(a, b, StrN(op, "name"));
                return $"{D(il)}|{il.RefPartnerSideA}|{il.RefPartnerSideB}|{D(il.CAEXParent)}";
            }
            case "linkSet":
            {
                var il = (InternalLinkType?)PickA(op, "il");
                var ei = (ExternalInterfaceType?)PickA(op, "ei", "b");
                var ie = (InternalElementType?)PickA(op, "ie", "c");
                if (il == null) return "none";
                var side = Str(op, "side");
                var v = StrN(op, "value");
                switch (Str(op, "mode"))
                {
                    case "ref": if (side == "A") il.RefPartnerSideA = v; else il.RefPartnerSideB = v; break;
                    case "iface": if (side == "A") il.AInterface = ei; else il.BInterface = ei; break;
                    case "eiId": if (side == "A") il.SetRefPartnerSideAExternalInterfaceId(v ?? ei?.ID); else il.SetRefPartnerSideBExternalInterfaceId(v ?? ei?.ID); break;
                    case "ieId": if (side == "A") il.SetRefPartnerSideAInternalElementId(v ?? ie?.ID); else il.SetRefPartnerSideBInternalElementId(v ?? ie?.ID); break;
                }
                return $"{il.RefPartnerSideA}|{il.RefPartnerSideB}|{Try(() => D(il.AInterface))}|{Try(() => D(il.BInterface))}|{Try(() => il.GetRefPartnerSideAExternalInterfaceId())}|{Try(() => il.GetRefPartnerSideAInternalElementId())}|{Try(() => il.GetRefPartnerSideBExternalInterfaceId())}|{Try(() => il.GetRefPartnerSideBInternalElementId())}|{Try(() => B2(il.IsDefined))}";
            }
            case "insertSibling":
            {
                var k = Str(op, "k");
                var t = PickA(op, k);
                var src = Source(op["src"], t?.Node?.Name.LocalName ?? "");
                if (t == null || src == null) return "none";
                var before = Bool(op, "before");
                switch (t)
                {
                    case InternalLinkType x: if (before) x.InsertBefore((InternalLinkType)src); else x.InsertAfter((InternalLinkType)src); break;
                    case ExternalReferenceType x: if (before) x.InsertBefore((ExternalReferenceType)src); else x.InsertAfter((ExternalReferenceType)src); break;
                    case InternalElementType x: if (before) x.InsertBefore((InternalElementType)src); else x.InsertAfter((InternalElementType)src); break;
                    case SystemUnitFamilyType x: if (before) x.InsertBefore((SystemUnitFamilyType)src); else x.InsertAfter((SystemUnitFamilyType)src); break;
                    case RoleFamilyType x: if (before) x.InsertBefore((RoleFamilyType)src); else x.InsertAfter((RoleFamilyType)src); break;
                    case InterfaceFamilyType x: if (before) x.InsertBefore((InterfaceFamilyType)src); else x.InsertAfter((InterfaceFamilyType)src); break;
                    case AttributeType x: if (before) x.InsertBefore((AttributeType)src); else x.InsertAfter((AttributeType)src); break;
                    default: return "unsupported";
                }
                return D(src) + "|" + D(t);
            }
            case "remove":
            {
                var t = PickA(op, Str(op, "k"));
                if (t == null) return "none";
                var d = D(t);
                t.Remove(Bool(op, "rel"));
                return d + "|" + DocTag(t.Node?.Document);
            }
            case "extRefNew":
            {
                var r = A.CAEXFile.New_ExternalReference(StrN(op, "path"), StrN(op, "alias"));
                return D(r) + "|" + Text(r);
            }
            case "extRefSet":
            {
                var r = (ExternalReferenceType?)PickA(op, "extref");
                if (r == null) return "none";
                switch (Str(op, "what"))
                {
                    case "alias": r.Alias = StrN(op, "value"); break;
                    case "path": r.Path = StrN(op, "value"); break;
                    case "version": r.MakeVersionReference(StrN(op, "value")); break;
                    case "extension": r.MakeExtensionReference(); break;
                }
                return $"{r.Alias}|{r.Path}|{B2(r.IsExtensionReference)}|{Try(() => B2(r.IsVersionReference))}|{Try(() => B2(r.IsNewVersionReference))}|{Try(() => B2(r.IsOldVersionReference))}|{B2(r.PathAreEqual(StrN(op, "value")))}";
            }
            case "extRefInsert":
            {
                var r = (ExternalReferenceType?)Source(op["src"], "ExternalReference");
                if (r == null) return "none";
                A.CAEXFile.Insert_ExternalReference(r);
                return D(r);
            }
            case "sdiAdd":
            {
                var p = op["props"]!.AsObject();
                var props = new SourceDocumentInformationType.Properties
                {
                    OriginName = p["OriginName"]?.GetValue<string>(),
                    OriginID = p["OriginID"]?.GetValue<string>(),
                    OriginVendor = p["OriginVendor"]?.GetValue<string>(),
                    OriginVendorURL = p["OriginVendorURL"]?.GetValue<string>(),
                    OriginVersion = p["OriginVersion"]?.GetValue<string>(),
                    OriginRelease = p["OriginRelease"]?.GetValue<string>(),
                    OriginProjectTitle = p["OriginProjectTitle"]?.GetValue<string>(),
                    OriginProjectID = p["OriginProjectID"]?.GetValue<string>(),
                    LastWritingDateTime = (DateTime)Val(p["LastWritingDateTime"])!,
                };
                var s = A.CAEXFile.AddSourceDocumentInformation(props);
                return D(s) + "|" + Text(s);
            }
            case "sdiSet":
            {
                var s = (SourceDocumentInformationType?)PickA(op, "sdi");
                if (s == null) return "none";
                var v = StrN(op, "value");
                switch (Str(op, "prop"))
                {
                    case "OriginName": s.OriginName = v; break;
                    case "OriginID": s.OriginID = v; break;
                    case "OriginVendor": s.OriginVendor = v; break;
                    case "OriginVendorURL": s.OriginVendorURL = v; break;
                    case "OriginVersion": s.OriginVersion = v; break;
                    case "OriginRelease": s.OriginRelease = v; break;
                    case "OriginProjectTitle": s.OriginProjectTitle = v; break;
                    case "OriginProjectID": s.OriginProjectID = v; break;
                    case "LastWritingDateTime": s.LastWritingDateTime = (DateTime)Val(op["dt"])!; break;
                }
                return Text(s);
            }
            case "mappingNew":
            {
                var t = PickA(op, Str(op, "k"));
                MappingType? m = t switch
                {
                    InternalElementType x => x.New_MappingObject(),
                    RoleRequirementsType x => x.New_MappingObject(),
                    SupportedRoleClassType x => x.New_MappingObject(),
                    _ => null,
                };
                if (t == null) return "none";
                return D(m) + "|" + Text(m);
            }
            case "mappingAdd":
            {
                var m = (MappingType?)PickA(op, "mapping");
                if (m == null) return "none";
                var x = StrN(op, "x");
                var y = StrN(op, "y");
                CAEXWrapper? res = Str(op, "kind") switch
                {
                    "attrName" => m.New_AttributeNameMapping(x, y),
                    "ifName" => m.New_InterfaceNameMapping(x, y),
                    "ifId" => m.New_InterfaceIDMapping(x, y),
                    _ => m.New_InterfaceIDMapping((ExternalInterfaceType?)PickA(op, "ei", "b"), (ExternalInterfaceType?)PickA(op, "ei", "c")),
                };
                return D(res) + "|" + Text(res);
            }
            case "fileImport":
            {
                var f = A.CAEXFile;
                var fn = Str(op, "fn");
                var tag = fn switch
                {
                    "Import_InstanceHierarchy" or "ImportInstanceHierarchy" or "Insert_InstanceHierarchy" => "InstanceHierarchy",
                    "Import_SystemUnitClassLibHierarchy" or "ImportSystemUnitClassLib" or "Insert_SystemUnitClassLibHierarchy" => "SystemUnitClassLib",
                    "Import_RoleClassLibHierarchy" or "ImportRoleClassLib" or "Insert_RoleClassLibHierarchy" => "RoleClassLib",
                    "Import_InterfaceClassLibHierarchy" or "ImportInterfaceClassLib" or "Insert_InterfaceClassLibHierarchy" => "InterfaceClassLib",
                    _ => "AttributeTypeLib",
                };
                var src = Source(op["src"], tag);
                if (src == null) return "nosrc";
                object? res = "void";
                switch (fn)
                {
                    case "Import_InstanceHierarchy": res = f.Import_InstanceHierarchy((InstanceHierarchyType)src); break;
                    case "ImportInstanceHierarchy": res = f.ImportInstanceHierarchy((InstanceHierarchyType)src); break;
                    case "Insert_InstanceHierarchy": f.Insert_InstanceHierarchy((InstanceHierarchyType)src); break;
                    case "Import_SystemUnitClassLibHierarchy": res = f.Import_SystemUnitClassLibHierarchy((SystemUnitClassLibType)src); break;
                    case "ImportSystemUnitClassLib": res = f.ImportSystemUnitClassLib((SystemUnitClassLibType)src); break;
                    case "Insert_SystemUnitClassLibHierarchy": f.Insert_SystemUnitClassLibHierarchy((SystemUnitClassLibType)src); break;
                    case "Import_RoleClassLibHierarchy": res = f.Import_RoleClassLibHierarchy((RoleClassLibType)src); break;
                    case "ImportRoleClassLib": res = f.ImportRoleClassLib((RoleClassLibType)src); break;
                    case "Insert_RoleClassLibHierarchy": f.Insert_RoleClassLibHierarchy((RoleClassLibType)src); break;
                    case "Import_InterfaceClassLibHierarchy": res = f.Import_InterfaceClassLibHierarchy((InterfaceClassLibType)src); break;
                    case "ImportInterfaceClassLib": res = f.ImportInterfaceClassLib((InterfaceClassLibType)src); break;
                    case "Insert_InterfaceClassLibHierarchy": f.Insert_InterfaceClassLibHierarchy((InterfaceClassLibType)src); break;
                    case "Import_AttributeTypeLib": res = f.Import_AttributeTypeLib((AttributeTypeLibType)src); break;
                    case "ImportAttributeTypeLib": res = f.ImportAttributeTypeLib((AttributeTypeLibType)src); break;
                    default: throw new NotSupportedException(fn);
                }
                return (res as string ?? D(res)) + "|" + D(src);
            }
            case "setXAttr":
            {
                var t = PickA(op, Str(op, "k"));
                if (t == null) return "none";
                t.SetXAttributeValue(Str(op, "name"), Val(op["value"]));
                return D(t) + "|" + Try(() => t.GetXAttributeValue(Str(op, "name")));
            }
            case "setBasic":
            {
                var t = (CAEXBasicObject?)PickA(op, "basic");
                if (t == null) return "none";
                var v = StrN(op, "value");
                switch (Str(op, "prop"))
                {
                    case "Description": t.Description = v; break;
                    case "Version": t.Version = v; break;
                    case "Copyright": t.Copyright = v; break;
                    case "ChangeMode": t.ChangeMode = (ChangeMode)Int(op, "mode"); break;
                }
                return $"{t.Description}|{t.Version}|{t.Copyright}|{(int)t.ChangeMode}";
            }
            case "newElem":
            {
                var t = (CAEXBasicObject?)PickA(op, "basic");
                if (t == null) return "none";
                CAEXWrapper res = Str(op, "which") switch
                {
                    "Description" => t.New_Description(),
                    "Version" => t.New_Version(),
                    _ => t.New_Copyright(),
                };
                return D(res) + "|" + Text(res) + "|" + Text(t);
            }
            case "setRef":
            {
                var k = Str(op, "k");
                var t = PickA(op, k);
                if (t == null) return "none";
                var v = StrN(op, "value");
                switch (t)
                {
                    case InternalElementType x:
                        if (v != null) x.RefBaseSystemUnitPath = v;
                        else x.SystemUnitClass = (SystemUnitFamilyType?)PickA(op, "suc", "b");
                        return x.RefBaseSystemUnitPath ?? "null";
                    case SystemUnitFamilyType x:
                        if (v != null) x.RefBaseClassPath = v; else x.BaseClass = (SystemUnitFamilyType?)PickA(op, "suc", "b");
                        return x.RefBaseClassPath ?? "null";
                    case RoleFamilyType x:
                        if (v != null) x.RefBaseClassPath = v; else x.BaseClass = (RoleFamilyType?)PickA(op, "rc", "b");
                        return x.RefBaseClassPath ?? "null";
                    case InterfaceFamilyType x:
                        if (v != null) x.RefBaseClassPath = v; else x.BaseClass = (InterfaceFamilyType?)PickA(op, "ic", "b");
                        return x.RefBaseClassPath ?? "null";
                    case ExternalInterfaceType x:
                        if (v != null) x.RefBaseClassPath = v; else x.InterfaceClass = (InterfaceFamilyType?)PickA(op, "ic", "b");
                        return x.RefBaseClassPath ?? "null";
                    case RoleRequirementsType x:
                        if (v != null) x.RefBaseRoleClassPath = v; else x.RoleClass = (RoleFamilyType?)PickA(op, "rc", "b");
                        return x.RefBaseRoleClassPath ?? "null";
                    case SupportedRoleClassType x:
                        if (v != null) x.RefRoleClassPath = v; else x.RoleClass = (RoleFamilyType?)PickA(op, "rc", "b");
                        return x.RefRoleClassPath ?? "null";
                    case AttributeType x:
                        if (v != null) x.RefAttributeType = v; else x.AttributeTypeReference = (AttributeFamilyType?)PickA(op, "at", "b");
                        return x.RefAttributeType ?? "null";
                    case AttributeFamilyType x:
                        if (v != null) x.RefBaseClassPath = v; else x.BaseClass = (AttributeFamilyType?)PickA(op, "at", "b");
                        return x.RefBaseClassPath ?? "null";
                }
                return "none";
            }
            case "insertNew":
            {
                var t = PickA(op, Str(op, "k"));
                if (t == null) return "none";
                CAEXWrapper? w = Str(op, "which") switch
                {
                    "DescriptionElement" => (t as CAEXBasicObject)?.DescriptionElement,
                    "VersionElement" => (t as CAEXBasicObject)?.VersionElement,
                    "CopyrightElement" => (t as CAEXBasicObject)?.CopyrightElement,
                    _ => t switch
                    {
                        InternalElementType x => x.MappingObject,
                        RoleRequirementsType x => x.MappingObject,
                        SupportedRoleClassType x => x.MappingObject,
                        _ => null,
                    },
                };
                if (w == null) return "nowrapper";
                return B2(w.InsertNew()) + "|" + D(w) + "|" + Text(t);
            }
            case "recreate":
            {
                var t = (AttributeType?)PickA(op, "attr");
                var at = (AttributeFamilyType?)PickA(op, "at", "b");
                if (t == null) return "none";
                t.RecreateAttributeInstance(at);
                return Text(t);
            }
            case "createAT":
            {
                var t = (AttributeType?)PickA(op, "attr");
                if (t == null) return "none";
                var at = t.CreateAttributeType();
                if (at != null) Pool.Add(at);
                return D(at) + "|" + Text(at);
            }
            case "createSRC":
            {
                var t = (RoleFamilyType?)PickA(op, "rc");
                if (t == null) return "none";
                var src = t.CreateSupportedRoleClass();
                if (src != null) Pool.Add(src);
                return D(src) + "|" + Text(src);
            }
            case "createICFamily":
            {
                var t = PickA(op, "wrap", "a", w => w is InterfaceClassType) as InterfaceClassType;
                if (t == null) return "none";
                var ic = t.CreateInterfaceFamilyClass();
                if (ic != null) Pool.Add(ic);
                return D(ic) + "|" + Text(ic);
            }
            case "wrapperValue":
            {
                var t = (CAEXBasicObject?)PickA(op, "basic");
                if (t == null) return "none";
                CAEXWrapper<string> w = Str(op, "which") switch
                {
                    "Description" => t.DescriptionElement,
                    "Version" => t.VersionElement,
                    _ => t.CopyrightElement,
                };
                w.Value = StrN(op, "value");
                return Try(() => w.Value) + "|" + Text(t);
            }
            case "undo":
                if (Undo == null) return "noservice";
                Undo.Undo(A);
                return "ok";
            case "redo":
                if (Undo == null) return "noservice";
                Undo.Redo(A);
                return "ok";
            case "poolText":
                return string.Join("\n", Pool.Select(p => D(p) + "|" + Text(p)));
            default:
                throw new NotSupportedException(Str(op, "op"));
        }
    }
}
