using System.Reflection;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Aml.Engine.AmlObjects;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Commands;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Services;

namespace Oracle;

/// <summary>
/// svc-undo &lt;scripts.json&gt; &lt;corpusDir&gt; &lt;out.json&gt;: UndoRedoService over engine operation scripts
/// (scripts/gen-services-undo.mjs). Each script registers a new UndoRedoService, runs engine
/// operations (EngineOpsOracle.Apply plus the extra operations below) and calls of the service on a
/// document A and an optional related document R, and unregisters the service at the end. Per step
/// it records the result, the change events of the engine (CaexCommand static events) and of the
/// test commands, the PropertyChanged events of the service, the state of the service per document
/// (CanUndo, CanRedo, UndoActions, RedoActions) and the hashes of both canonical documents. A final
/// phase undoes everything of A, redoes everything of A, then the same for R, recording the same per
/// step. The JS runner is test/services/undo.oracle.test.ts; both must stay in sync.
/// Not deterministic in the original: the time stamps of the stacks (DateTime.Now.ToLongTimeString)
/// and LastModificationDate; both are recorded as their format and their relation to the run time.
/// </summary>
public static class ServicesUndoOracle
{
    static readonly HashSet<string> EngineOps = new()
    {
        "newIH", "newLib", "newClass", "newIE", "newAttr", "setAttr", "setAttrTyped", "setUnit", "newEI", "setBase", "addRole", "instantiate",
        "link", "remove", "copyIE", "rename", "describe", "newGuid", "mirror", "setRefBase", "move", "query",
    };

    /// <summary>Operations of the service: exceptions are recorded with their message.</summary>
    static readonly HashSet<string> ServiceOps = new()
    {
        "begin", "end", "pause", "resume", "clear", "removeCommands", "lastMod", "stamps", "actionsLazy", "actionsModify", "push", "pushNull", "nullDoc",
    };

    static readonly FieldInfo StacksField = typeof(UndoRedoService).GetField("_documentStacks", BindingFlags.NonPublic | BindingFlags.Instance)!;

    static CAEXDocument A = null!;
    static CAEXDocument? R;
    static UndoRedoService Svc = null!;
    static EngineOpsOracle.Canonicalizer Canon = null!;
    static DateTime ScriptStart;
    static readonly List<string> Events = new();
    static readonly List<string> Props = new();

    public static void Run(string[] args)
    {
        var scripts = JsonNode.Parse(File.ReadAllText(args[0]))!.AsArray();
        var corpus = args[1];
        CaexCommand.CAEXElementChangingEvent += Changing;
        CaexCommand.CAEXElementChangedEvent += Changed;
        var results = new JsonArray();
        try
        {
            foreach (var script in scripts) results.Add(RunScript(script!.AsObject(), corpus));
        }
        finally
        {
            CaexCommand.CAEXElementChangingEvent -= Changing;
            CaexCommand.CAEXElementChangedEvent -= Changed;
        }
        File.WriteAllText(args[2], results.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
    }

    static CAEXDocument Open(string start, string corpus) => start switch
    {
        "new30" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0),
        "new215" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15),
        _ => CAEXDocument.LoadFromString(File.ReadAllText(Path.Combine(corpus, start), System.Text.Encoding.UTF8)),
    };

    static JsonObject RunScript(JsonObject script, string corpus)
    {
        var now = DateTime.Now;
        ScriptStart = new DateTime(now.Year, now.Month, now.Day, now.Hour, now.Minute, now.Second);
        Canon = new EngineOpsOracle.Canonicalizer();
        A = Open(script["start"]!.GetValue<string>(), corpus);
        R = script["related"] is JsonNode rel ? Open(rel.GetValue<string>(), corpus) : null;
        Svc = UndoRedoService.Register();
        Svc.PropertyChanged += (s, e) => Props.Add(e.PropertyName + (ReferenceEquals(s, Svc) ? "" : "?"));
        var steps = new JsonArray();
        var final = new JsonArray();
        var result = new JsonObject();
        try
        {
            foreach (var op in script["ops"]!.AsArray())
            {
                Events.Clear();
                Props.Clear();
                var o = op!.AsObject();
                string r;
                try { r = Apply(o); }
                catch (Exception e)
                {
                    // Messages of the service operations; not of a NullReferenceException (a
                    // TypeError in the port, with the message of the JS engine).
                    r = "!" + e.GetType().Name;
                    if (ServiceOps.Contains(o["op"]!.GetValue<string>()) && e is not NullReferenceException) r += ":" + e.Message;
                }
                steps.Add(Step(r));
            }
            // Undo everything, redo everything, per document.
            foreach (var (tag, d) in new[] { ("a", A), ("r", R) })
            {
                if (d == null) continue;
                foreach (var undo in new[] { true, false })
                {
                    for (int n = 0; n < 300; n++)
                    {
                        bool can;
                        try { can = undo ? Svc.CanUndo(d) : Svc.CanRedo(d); }
                        catch (Exception) { break; }
                        if (!can) break;
                        Events.Clear();
                        Props.Clear();
                        var label = (undo ? "u" : "r") + tag;
                        try
                        {
                            if (undo) Svc.Undo(d);
                            else Svc.Redo(d);
                        }
                        catch (Exception e) { label += "!" + e.GetType().Name; }
                        final.Add(Step(label));
                    }
                }
            }
            result["steps"] = steps;
            result["final"] = final;
            result["textA"] = Text(A);
            result["textR"] = R == null ? null : Text(R);
        }
        finally
        {
            // Dispose while the service is registered: the engine calls RemoveDocument of the service.
            result["dispose"] = Try(() => { A.Dispose(); return "ok"; }) + "|" + (R == null ? "-" : Try(() => { R.Dispose(); return "ok"; }));
            UndoRedoService.UnRegister();
            Events.Clear();
            Props.Clear();
        }
        return result;
    }

    static string Try(Func<string> f)
    {
        try { return f(); }
        catch (Exception e) { return "!" + e.GetType().Name; }
    }

    /// <summary>One step: result, events, property changes, state of A and R, hashes of A and R.</summary>
    static JsonArray Step(string result)
    {
        var res = Canon.Apply(result);
        var ev = Canon.Apply(string.Join("\n", Events));
        var props = string.Join(",", Props);
        var stateA = State(A);
        var stateR = State(R);
        var hashA = Hash(A);
        var hashR = Hash(R);
        return new JsonArray(res, ev, props, stateA, stateR, hashA, hashR);
    }

    static string State(CAEXDocument? d)
    {
        if (d == null) return "-";
        try
        {
            return $"{(Svc.CanUndo(d) ? 1 : 0)}{(Svc.CanRedo(d) ? 1 : 0)}|{Acts(Svc.UndoActions(d))}|{Acts(Svc.RedoActions(d))}";
        }
        catch (Exception e) { return "!" + e.GetType().Name; }
    }

    static string Acts(IEnumerable<string>? actions) => actions == null ? "null" : string.Join(";", actions);

    static string Text(CAEXDocument d)
    {
        if (d.XDocument == null) return "unloaded";
        try { return Canon.Apply(EngineOpsOracle.Save(d)); }
        catch (Exception e) { return "!" + e.GetType().Name; }
    }

    static string Hash(CAEXDocument? d)
    {
        if (d == null) return "-";
        if (d.XDocument == null) return "unloaded";
        return EngineOpsOracle.Hash(Text(d));
    }

    static CAEXDocument? Doc(JsonNode? d) => d?.GetValue<string>() switch
    {
        null => null,
        "a" => A,
        "r" => R,
        var x => throw new NotSupportedException("document " + x),
    };

    static string Str(JsonObject op, string key) => op[key]!.GetValue<string>();

    static string? StrOrNull(JsonObject op, string key) => op[key]?.GetValue<string>();

    static int Int(JsonObject op, string key) => op[key]!.GetValue<int>();

    static string Apply(JsonObject op)
    {
        var name = Str(op, "op");
        if (EngineOps.Contains(name)) return EngineOpsOracle.Apply(Doc(op["d"]) ?? A, op);
        var d = Doc(op["d"]);
        switch (name)
        {
            case "undo":
                Svc.Undo(d);
                return "ok";
            case "redo":
                Svc.Redo(d);
                return "ok";
            case "begin":
                return Svc.BeginTransaction(d, StrOrNull(op, "name")!, Doc(op["rel"])!).ToString();
            case "end":
                return Svc.EndTransaction(d).ToString();
            case "pause":
                Svc.Pause(d!);
                return "ok";
            case "resume":
                Svc.Resume(d!);
                return "ok";
            case "clear":
                Svc.ClearStacks(d);
                return "ok";
            case "removeCommands":
                Svc.RemoveCommands();
                return "ok";
            case "lastMod":
                return LastMod(Svc.LastModificationDate(d, op["undo"]!.GetValue<bool>()));
            case "stamps":
                return Stamps(d!);
            case "actionsLazy":
            {
                // The result is lazy: a change after the call shows in the enumeration.
                var acts = op["redo"]!.GetValue<bool>() ? Svc.RedoActions(d) : Svc.UndoActions(d);
                if (acts == null) return "null";
                d!.CAEXFile.InstanceHierarchy.Append("Lazy");
                return Acts(acts);
            }
            case "actionsModify":
            {
                // A change of the stack while the result is enumerated.
                var acts = op["redo"]!.GetValue<bool>() ? Svc.RedoActions(d) : Svc.UndoActions(d);
                if (acts == null) return "null";
                using var en = acts.GetEnumerator();
                var first = en.MoveNext() ? en.Current : "<end>";
                d!.CAEXFile.InstanceHierarchy.Append("Modify");
                string second;
                try { second = en.MoveNext() ? en.Current : "<end>"; }
                catch (InvalidOperationException e) { second = "!" + e.GetType().Name + ":" + e.Message; }
                return first + "|" + second;
            }
            case "push":
                Svc.PushCommand(new RecCmd(d, StrOrNull(op, "name"), Str(op, "fail")));
                return "ok";
            case "pushNull":
                Svc.PushCommand(new RecCmd(null, "N", "none"));
                return "ok";
            case "nullDoc":
                return NullDoc(Str(op, "m"));
            case "unload":
                d!.Unload();
                return "ok";
            default:
                return ApplyExtra(d ?? A, op);
        }
    }

    /// <summary>The service methods with a null document.</summary>
    static string NullDoc(string m)
    {
        switch (m)
        {
            case "canUndo": return Svc.CanUndo(null!).ToString();
            case "canRedo": return Svc.CanRedo(null!).ToString();
            case "undo": Svc.Undo(null!); return "ok";
            case "redo": Svc.Redo(null!); return "ok";
            case "begin": return Svc.BeginTransaction(null!, "x").ToString();
            case "beginRel": return Svc.BeginTransaction(null!, "x", A).ToString();
            case "end": return Svc.EndTransaction(null!).ToString();
            case "clear": Svc.ClearStacks(null!); return "ok";
            case "lastMod": return LastMod(Svc.LastModificationDate(null!));
            case "undoActions": return Acts(Svc.UndoActions(null!));
            case "redoActions": return Acts(Svc.RedoActions(null!));
            case "pause": Svc.Pause(null!); return "ok";
            case "resume": Svc.Resume(null!); return "ok";
            case "push": Svc.PushCommand(null!); return "ok";
            default: throw new NotSupportedException(m);
        }
    }

    /// <summary>
    /// LastModificationDate: DateTime.MinValue, or the time stamp parsed as today's date with that
    /// time; recorded as its date (today or not), kind, whether it lies between the start of the
    /// script (truncated to seconds) and now, and its milliseconds.
    /// </summary>
    static string LastMod(DateTime d)
    {
        if (d == default) return "min";
        var inRange = d >= ScriptStart && d <= DateTime.Now;
        return $"{(d.Date == DateTime.Today ? "today" : "other")}|{d.Kind}|{(inRange ? "recent" : "out")}|{d.Millisecond}";
    }

    /// <summary>
    /// The time stamps of the three stacks (undo, redo, transactions) of the document, top first:
    /// digits replaced by 9, then "+" when DateTime.TryParse gives today, "~" for another date,
    /// "!" when it does not parse. Read from the private field _documentStacks.
    /// </summary>
    static string Stamps(CAEXDocument d)
    {
        var dict = (Dictionary<XDocument, Stack<(ICAEXCommand Command, string TimeStamp)>[]>)StacksField.GetValue(Svc)!;
        if (d.XDocument == null || !dict.TryGetValue(d.XDocument, out var stacks)) return "none";
        return string.Join("/", stacks.Select(s => string.Join(",", s.Select(e => Stamp(e.TimeStamp)))));
    }

    static string Stamp(string ts) =>
        Regex.Replace(ts, "[0-9]", "9") + (DateTime.TryParse(ts, out var p) ? (p.Date == DateTime.Today ? "+" : "~") : "!");

    // ---- extra engine operations (command types the shared operations do not reach) ---------------

    static string ApplyExtra(CAEXDocument doc, JsonObject op)
    {
        switch (Str(op, "op"))
        {
            case "seqMove":
                switch (Str(op, "kind"))
                {
                    case "ie":
                        return EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is InstanceHierarchyType || x is SystemUnitClassType) switch
                        {
                            InstanceHierarchyType ih => SeqMove(ih.InternalElement, op),
                            SystemUnitClassType s => SeqMove(s.InternalElement, op),
                            _ => "none",
                        };
                    case "attr":
                        return EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithAttributes) is IObjectWithAttributes oa ? SeqMove(oa.Attribute, op) : "none";
                    default:
                        return EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithExternalInterface) is IObjectWithExternalInterface oe ? SeqMove(oe.ExternalInterface, op) : "none";
                }
            case "prependIE":
                return EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is InstanceHierarchyType || x is SystemUnitClassType) switch
                {
                    InstanceHierarchyType ih => EngineOpsOracle.Describe(ih.InternalElement.Prepend(Str(op, "name"))),
                    SystemUnitClassType s => EngineOpsOracle.Describe(s.InternalElement.Prepend(Str(op, "name"))),
                    _ => "none",
                };
            case "seqRemoveAll":
                switch (Str(op, "kind"))
                {
                    case "ie":
                        switch (EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is InstanceHierarchyType || x is SystemUnitClassType))
                        {
                            case InstanceHierarchyType ih: ih.InternalElement.Remove(); return ih.InternalElement.Count.ToString();
                            case SystemUnitClassType s: s.InternalElement.Remove(); return s.InternalElement.Count.ToString();
                            default: return "none";
                        }
                    case "attr":
                        if (EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithAttributes) is not IObjectWithAttributes oa) return "none";
                        oa.Attribute.Remove();
                        return oa.Attribute.Count.ToString();
                    default:
                        if (EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithExternalInterface) is not IObjectWithExternalInterface oe) return "none";
                        oe.ExternalInterface.Remove();
                        return oe.ExternalInterface.Count.ToString();
                }
            case "recreate":
            {
                var a = EngineOpsOracle.Pick<AttributeType>(doc, op, "a");
                var b = EngineOpsOracle.Pick<AttributeFamilyType>(doc, op, "b");
                if (a == null || b == null) return "none";
                a.RecreateAttributeInstance(b);
                return EngineOpsOracle.Describe(a) + "|" + a.RefAttributeType;
            }
            case "constraint":
            {
                var a = EngineOpsOracle.Pick<AttributeTypeType>(doc, op, "a");
                if (a == null) return "none";
                var c = a.Constraint.Append();
                c.Name = Str(op, "name");
                var value = Str(op, "value");
                string r;
                switch (Str(op, "kind"))
                {
                    case "nominal":
                    {
                        var n = c.New_NominalType();
                        if (n == null) return "null";
                        n.RequiredValue.Append(value);
                        n.RequiredValue.Append(value + "2");
                        n.RequiredValue[0] = value + "0";
                        r = string.Join(",", n.RequiredValue);
                        break;
                    }
                    case "ordinal":
                    {
                        var o = c.New_OrdinalType();
                        if (o == null) return "null";
                        o.RequiredMaxValue = value;
                        o.RequiredMinValue = "0";
                        o.RequiredValue = value;
                        r = $"{o.RequiredMinValue}|{o.RequiredMaxValue}|{o.RequiredValue}";
                        break;
                    }
                    default:
                        r = c.New_UnknownType() == null ? "null" : "unknown";
                        break;
                }
                return $"{c.Node.Name.LocalName}|{c.Name}|{r}";
            }
            case "meta":
            {
                var f = new AMLFile(doc.CAEXFile.Node);
                f.SetMetaInformation(Str(op, "name"), Str(op, "id"), "Vendor", "http://vendor", "1.0", "1.0.0", StrOrNull(op, "date")!, "Project", "P1");
                return "ok";
            }
            case "delMeta":
                return new AMLFile(doc.CAEXFile.Node).DeleteMetaInformation(Str(op, "id")).ToString();
            case "superior":
            {
                var seq = doc.CAEXFile.SuperiorStandardVersion;
                seq.Append(Str(op, "value"));
                seq[Int(op, "i") % seq.Count] = Str(op, "value") + "!";
                return string.Join(",", seq);
            }
            default:
                throw new NotSupportedException(Str(op, "op"));
        }
    }

    static string SeqMove<T>(CAEXSequence<T> seq, JsonObject op) where T : CAEXWrapper
    {
        var n = seq.Count;
        if (n == 0) return "empty";
        seq.Move(Int(op, "i") % n, Int(op, "j") % n);
        return string.Join(",", seq.Select(x => x.Node.Attribute("Name")?.Value ?? ""));
    }

    // ---- events ------------------------------------------------------------------------------------

    static void Changing(object? sender, CAEXElementChangeEventArgs e) => Record("S-", sender, e);
    static void Changed(object? sender, CAEXElementChangeEventArgs e) => Record("S+", sender, e);

    static string DocTag(XDocument? d) =>
        d == null ? "-" : d == A?.XDocument ? "A" : R != null && d == R.XDocument ? "R" : "X";

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

    static void Record(string src, object? sender, CAEXElementChangeEventArgs e) =>
        Events.Add($"{src}{(int)e.ChangeMode}|{X(e.CAEXElement)}|{X(e.CAEXParent)}|{e.CAEXAttributeName ?? "null"}|{V(e.OldValue)}|{V(e.NewValue)}|{e.CAEXAttribute?.Value ?? "null"}|{DocTag(e.CAEXDocument)}|{SenderTag(sender)}");

    /// <summary>A test command: records Execute and UnExecute, and fails in one of them on request.</summary>
    sealed class RecCmd(CAEXDocument? document, string? name, string fail) : ICAEXCommand
    {
        public CAEXDocument CAEXDocument { get; } = document!;

        public string DisplayName { get; } = name!;

        public void Execute()
        {
            Events.Add("cmd+" + (DisplayName ?? "null") + DocTag(CAEXDocument));
            if (fail == "redo") throw new InvalidOperationException("redo failed");
        }

        public void UnExecute()
        {
            Events.Add("cmd-" + (DisplayName ?? "null") + DocTag(CAEXDocument));
            if (fail == "undo") throw new InvalidOperationException("undo failed");
        }
    }
}
