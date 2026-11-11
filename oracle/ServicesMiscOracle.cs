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
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// svc-misc &lt;casesDir test/services/misc&gt; &lt;corpusDir&gt; &lt;out.json&gt; [section]:
/// UniqueNameService (direct calls, appends on every sequence type, engine operations with the
/// service registered), CAEXFileStatisticService, RepairTypeEnumConverter, the equality of
/// ValidationKey, and the .NET types behind two System helpers of the port (Dictionary of
/// src/system/linq.ts, AsyncLock = SemaphoreSlim). Cases from scripts/gen-services-misc.mjs.
/// Keep in sync with test/services/misc.oracle.test.ts, which makes the same calls.
/// </summary>
public static class ServicesMiscOracle
{
    static string casesDir = "";
    static string corpusDir = "";
    static JsonObject docs = new();

    public static void Run(string[] args)
    {
        casesDir = Path.GetFullPath(args[0]);
        corpusDir = Path.GetFullPath(args[1]);
        var outFile = Path.GetFullPath(args[2]);
        var only = args.Length > 3 ? args[3] : null;
        docs = Read("docs.json").AsObject();
        var sections = new (string, Func<JsonNode>)[]
        {
            ("unique", UniqueSection),
            ("appends", AppendsSection),
            ("engineops", EngineOpsSection),
            ("stat", StatSection),
            ("repair", RepairSection),
            ("vkey", ValidationKeySection),
            ("dict", DictionarySection),
            ("coll", CollectionSection),
            ("lock", LockSection),
        };
        var result = new JsonObject();
        foreach (var (name, f) in sections)
        {
            if (only != null && only != name) continue;
            result[name] = f();
        }
        Directory.CreateDirectory(Path.GetDirectoryName(outFile)!);
        File.WriteAllText(outFile, result.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
    }

    // ------------------------------------------------------------------------------- helpers

    static JsonNode Read(string name) => JsonNode.Parse(File.ReadAllText(Path.Combine(casesDir, name)))!;

    static string? S(JsonNode? op, string key) => op?[key]?.GetValue<string>();

    static CAEXDocument Load(string start) => start switch
    {
        "new30" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0),
        "new215" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15),
        _ when start.StartsWith("doc:") => CAEXDocument.LoadFromString(docs[start.Substring(4)]!.GetValue<string>()),
        _ => CAEXDocument.LoadFromString(File.ReadAllText(Path.Combine(corpusDir, start), Encoding.UTF8)),
    };

    /// <summary>"!" + exception class; reflection wrappers are unwrapped.</summary>
    static string Ex(Exception e)
    {
        if (e is TargetInvocationException { InnerException: { } inner }) return Ex(inner);
        if (e is AggregateException a && a.InnerExceptions.Count > 0)
        {
            // PLINQ (UniqueCAEXName) collects the exceptions of the partitions that failed; with
            // several failing elements their number depends on the scheduling. The port reports
            // the first one, so the message is canonicalized to the form with one inner exception
            // (the original message, when there is exactly one).
            var first = a.InnerExceptions[0];
            var message = a.InnerExceptions.Count == 1 ? a.Message : $"One or more errors occurred. ({first.Message})";
            return $"!AggregateException:{message}:{first.GetType().Name}:{first.Message}";
        }
        return "!" + e.GetType().Name;
    }

    /// <summary>"!" + exception class + ":" + message.</summary>
    static string ExMsg(Exception e) => e is TargetInvocationException { InnerException: { } inner } ? ExMsg(inner) : $"!{e.GetType().Name}:{e.Message}";

    static string Str(object? v) => v switch
    {
        null => "null",
        bool b => b ? "True" : "False",
        _ => v.ToString() ?? "null",
    };

    static string Try(Func<object?> f)
    {
        try { return Str(f()); }
        catch (Exception e) { return Ex(e); }
    }

    /// <summary>An element and where it sits: tag|Name|ID|parent tag#position among the parent's elements.</summary>
    static string Where(XElement? e) =>
        e == null ? "null" : $"{e.Name.LocalName}|{e.Attribute("Name")?.Value ?? "null"}|{e.Attribute("ID")?.Value ?? "null"}|{e.Parent?.Name.LocalName ?? "null"}#{e.ElementsBeforeSelf().Count()}";

    static List<XElement> AllElements(CAEXDocument doc) => doc.XDocument.Root!.DescendantsAndSelf().ToList();

    static XElement? Elem(CAEXDocument doc, int a)
    {
        if (a < 0) return null;
        var all = AllElements(doc);
        return all[a % all.Count];
    }

    static void ResetUniqueName()
    {
        UniqueNameService.UnRegister();
        NamedElementSequence.UniqueName = false;
    }

    // ------------------------------------------------------- UniqueNameService, direct calls

    static JsonNode UniqueSection()
    {
        var results = new JsonArray();
        foreach (var script in Read("unique.json").AsArray())
        {
            ResetUniqueName();
            var doc = Load(S(script, "start")!);
            var svc = UniqueNameService.Register();
            var lines = new JsonArray();
            foreach (var op in script!["ops"]!.AsArray())
            {
                string r;
                try { r = UniqueOp(doc, svc, op!.AsObject()); }
                catch (Exception e) { r = Ex(e); }
                lines.Add(r);
            }
            ResetUniqueName();
            doc.Unload();
            results.Add(lines);
        }
        return results;
    }

    static string UniqueOp(CAEXDocument doc, IUniqueName svc, JsonObject op)
    {
        int A() => op["a"]!.GetValue<int>();
        var tag = S(op, "tag");
        switch (S(op, "op"))
        {
            case "add":
            {
                var e = Elem(doc, A())!;
                var c = new XElement(e.Name.Namespace + tag!);
                var name = S(op, "name");
                if (name != null) c.SetAttributeValue("Name", name);
                e.Add(c);
                return "ok";
            }
            case "setName":
                Elem(doc, A())!.SetAttributeValue("Name", S(op, "name"));
                return "ok";
            case "u2":
                return Str(svc.UniqueCAEXName(Elem(doc, A()), tag));
            case "u3":
                return Str(svc.UniqueCAEXName(Elem(doc, A()), tag, S(op, "def")));
            case "ue":
            {
                var e = Elem(doc, A())!;
                IEnumerable<XElement> seq = S(op, "src") switch
                {
                    "children" => e.Elements(),
                    "named" => e.Elements().Where(x => x.Name.LocalName == tag),
                    "desc" => e.Descendants(),
                    "empty" => Array.Empty<XElement>(),
                    "withNull" => new XElement[] { null! }.Concat(e.Elements()),
                    _ => e.Parent?.Elements() ?? Enumerable.Empty<XElement>(),
                };
                return Str(svc.UniqueCAEXName(seq, tag, S(op, "def")));
            }
            case "is":
                return Str(svc.IsUniqueCAEXName(Elem(doc, A())));
            case "def":
                svc.RegisterDefault(tag, S(op, "name"));
                return "ok";
            case "suspend":
                svc.Suspend();
                return "ok";
            case "resume":
                svc.Resume();
                return "ok";
            default:
                throw new NotSupportedException(S(op, "op"));
        }
    }

    // ------------------------------------------- appends on every sequence type (reflection)

    /// <summary>The public CAEXSequence properties of the wrapper type, most derived per name, by name.</summary>
    static List<PropertyInfo> SequenceProperties(Type type) =>
        type.GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.GetIndexParameters().Length == 0 && IsGeneric(p.PropertyType, typeof(CAEXSequence<>)))
            .GroupBy(p => p.Name)
            .Select(g => g.OrderByDescending(p => Depth(p.DeclaringType!)).First())
            .OrderBy(p => p.Name, StringComparer.Ordinal)
            .ToList();

    static int Depth(Type t)
    {
        var d = 0;
        for (var b = t; b != null; b = b.BaseType) d++;
        return d;
    }

    static bool IsGeneric(Type? t, Type generic)
    {
        for (; t != null; t = t.BaseType)
            if (t.IsGenericType && t.GetGenericTypeDefinition() == generic) return true;
        return false;
    }

    static JsonNode AppendsSection()
    {
        var results = new JsonArray();
        foreach (var c in Read("appends.json").AsArray())
        {
            foreach (var modeNode in c!["modes"]!.AsArray())
            {
                var mode = modeNode!.GetValue<string>();
                ResetUniqueName();
                if (mode != "off")
                {
                    var svc = UniqueNameService.Register();
                    if (mode == "suspended") svc.Suspend();
                }
                if (mode == "unique") NamedElementSequence.UniqueName = true;
                var doc = Load(S(c, "start")!);
                var canon = new EngineOpsOracle.Canonicalizer();
                var records = new JsonArray();
                // the first CAEX wrapper of every element name, in document order
                var owners = new List<CAEXWrapper>();
                var seen = new HashSet<string>();
                foreach (var e in AllElements(doc))
                {
                    var w = e.CreateCAEXWrapper();
                    if (w != null && seen.Add(e.Name.LocalName)) owners.Add(w);
                }
                foreach (var owner in owners)
                {
                    var ownerName = owner.Node.Name.LocalName;
                    foreach (var p in SequenceProperties(owner.GetType()))
                    {
                        void Rec(string call, string? arg, string result) =>
                            records.Add(new JsonArray(ownerName, p.Name, call, arg, canon.Apply(result)));
                        object? seq;
                        try { seq = p.GetValue(owner); }
                        catch (Exception e) { Rec("get", null, Ex(e)); continue; }
                        if (seq == null) { Rec("get", null, "null"); continue; }
                        var t = seq.GetType();
                        string? appended = null;
                        string Call(string method, Type[] types, object?[] args)
                        {
                            try
                            {
                                var r = (CAEXWrapper?)t.GetMethod(method, types)!.Invoke(seq, args);
                                appended = r?.Node.Attribute("Name")?.Value;
                                return Where(r?.Node);
                            }
                            catch (Exception e) { return Ex(e); }
                        }
                        Rec("append", null, Call("Append", Type.EmptyTypes, Array.Empty<object>()));
                        if (IsGeneric(t, typeof(CAEXSequenceOfCAEXObjects<>)))
                        {
                            var name = string.IsNullOrEmpty(appended) ? "dup" : appended;
                            Rec("appendName", name, Call("Append", new[] { typeof(string) }, new object?[] { name }));
                            Rec("appendName", name, Call("Append", new[] { typeof(string) }, new object?[] { name }));
                            Rec("appendNull", null, Call("Append", new[] { typeof(string) }, new object?[] { null }));
                            Rec("prependName", name, Call("Prepend", new[] { typeof(string) }, new object?[] { name }));
                        }
                        Rec("prepend", null, Call("Prepend", Type.EmptyTypes, Array.Empty<object>()));
                    }
                }
                string final;
                try { final = canon.Apply(EngineOpsOracle.Save(doc)); }
                catch (Exception e) { final = Ex(e); }
                results.Add(new JsonObject
                {
                    ["start"] = S(c, "start"),
                    ["mode"] = mode,
                    ["records"] = records,
                    ["final"] = EngineOpsOracle.Hash(final),
                });
                ResetUniqueName();
                doc.Unload();
            }
        }
        return results;
    }

    // --------------------------------------------- engine operations with the service on

    static JsonNode EngineOpsSection()
    {
        var results = new JsonArray();
        foreach (var script in Read("engineops.json").AsArray())
        {
            ResetUniqueName();
            var svc = UniqueNameService.Register();
            var doc = Load(S(script, "start")!);
            var canon = new EngineOpsOracle.Canonicalizer();
            var steps = new JsonArray();
            string? lastText = null;
            foreach (var opNode in script!["ops"]!.AsArray())
            {
                var op = opNode!.AsObject();
                string result;
                try { result = MiscOp(doc, svc, op) ?? EngineOpsOracle.Apply(doc, op); }
                catch (Exception e) { result = Ex(e); }
                string text;
                try { text = canon.Apply(EngineOpsOracle.Save(doc)); }
                catch (Exception e) { text = Ex(e); }
                lastText = text;
                steps.Add(new JsonArray(canon.Apply(result), EngineOpsOracle.Hash(text)));
            }
            results.Add(new JsonObject { ["steps"] = steps, ["final"] = lastText });
            ResetUniqueName();
            doc.Unload();
        }
        return results;
    }

    static string Describe(CAEXWrapper? w) => w == null ? "null" : Where(w.Node);

    /// <summary>The operations of this package; null for the operations of EngineOpsOracle.Apply.</summary>
    static string? MiscOp(CAEXDocument doc, IUniqueName svc, JsonObject op)
    {
        bool B(string key) => op[key]!.GetValue<bool>();
        switch (S(op, "op"))
        {
            case "svcSuspend":
                svc.Suspend();
                return "ok";
            case "svcResume":
                svc.Resume();
                return "ok";
            case "svcDefault":
                svc.RegisterDefault(S(op, "tag"), S(op, "name"));
                return "ok";
            case "uniqueFlag":
                NamedElementSequence.UniqueName = B("value");
                return "ok";
            case "appendNoName":
            {
                CAEXWrapper? r;
                switch (S(op, "kind"))
                {
                    case "ih":
                        r = doc.CAEXFile.InstanceHierarchy.Append();
                        break;
                    case "ie":
                        r = EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is InstanceHierarchyType || x is SystemUnitClassType) switch
                        {
                            InstanceHierarchyType ih => ih.InternalElement.Append(),
                            SystemUnitClassType s => s.InternalElement.Append(),
                            _ => null,
                        };
                        break;
                    case "attr":
                        r = (EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithAttributes) as IObjectWithAttributes)?.Attribute.Append();
                        break;
                    case "ei":
                        r = (EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithExternalInterface) as IObjectWithExternalInterface)?.ExternalInterface.Append();
                        break;
                    case "suc":
                        r = EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is SystemUnitClassLibType || x is SystemUnitFamilyType) switch
                        {
                            SystemUnitClassLibType l => l.SystemUnitClass.Append(),
                            SystemUnitFamilyType f => f.SystemUnitClass.Append(),
                            _ => null,
                        };
                        break;
                    case "rc":
                        r = EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is RoleClassLibType || x is RoleFamilyType) switch
                        {
                            RoleClassLibType l => l.RoleClass.Append(),
                            RoleFamilyType f => f.RoleClass.Append(),
                            _ => null,
                        };
                        break;
                    case "ic":
                        r = EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is InterfaceClassLibType || x is InterfaceFamilyType) switch
                        {
                            InterfaceClassLibType l => l.InterfaceClass.Append(),
                            InterfaceFamilyType f => f.InterfaceClass.Append(),
                            _ => null,
                        };
                        break;
                    case "at":
                        r = EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is AttributeTypeLibType || x is AttributeFamilyType) switch
                        {
                            AttributeTypeLibType l => l.AttributeType.Append(),
                            AttributeFamilyType f => f.AttributeType.Append(),
                            _ => null,
                        };
                        break;
                    default:
                        r = EngineOpsOracle.Pick<SystemUnitClassType>(doc, op, "a")?.InternalLink.Append();
                        break;
                }
                return Describe(r);
            }
            case "prepend":
            {
                var name = S(op, "name");
                CAEXWrapper? r = S(op, "kind") switch
                {
                    "ie" => EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is InstanceHierarchyType || x is SystemUnitClassType) switch
                    {
                        InstanceHierarchyType ih => ih.InternalElement.Prepend(name),
                        SystemUnitClassType s => s.InternalElement.Prepend(name),
                        _ => null,
                    },
                    "attr" => (EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithAttributes) as IObjectWithAttributes)?.Attribute.Prepend(name),
                    "ei" => (EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithExternalInterface) as IObjectWithExternalInterface)?.ExternalInterface.Prepend(name),
                    _ => EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is SystemUnitClassLibType || x is SystemUnitFamilyType) switch
                    {
                        SystemUnitClassLibType l => l.SystemUnitClass.Prepend(name),
                        SystemUnitFamilyType f => f.SystemUnitClass.Prepend(name),
                        _ => null,
                    },
                };
                return Describe(r);
            }
            case "addAttrRef":
            {
                var o = EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithAttributes) as IObjectWithAttributes;
                var at = EngineOpsOracle.Pick<AttributeFamilyType>(doc, op, "b");
                if (o == null || at == null) return "none";
                var a = B("byPath")
                    ? o.AddAttributeTypeReference(at.CAEXPath(), B("addUnique"), B("addInstance"), S(op, "name"))
                    : o.AddAttributeTypeReference(at, B("addUnique"), B("addInstance"), S(op, "name"));
                return Describe(a) + "|" + Str(a?.RefAttributeType);
            }
            case "addIfaceRef":
            {
                var o = EngineOpsOracle.Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithExternalInterface) as IObjectWithExternalInterface;
                var ic = EngineOpsOracle.Pick<InterfaceFamilyType>(doc, op, "b");
                if (o == null || ic == null) return "none";
                var ei = B("byPath")
                    ? o.AddInterfaceClassReference(ic.CAEXPath(), B("addUnique"), B("addInstance"), S(op, "name"))
                    : o.AddInterfaceClassReference(ic, B("addUnique"), B("addInstance"), S(op, "name"));
                return Describe(ei) + "|" + Str(ei?.RefBaseClassPath);
            }
            case "addMirror":
            {
                var ie = EngineOpsOracle.Pick<InternalElementType>(doc, op, "a");
                var t = EngineOpsOracle.Pick<CAEXObject>(doc, op, "b", x => x is InstanceHierarchyType || x is InternalElementType);
                if (ie == null || t == null) return "none";
                var m = t switch
                {
                    InstanceHierarchyType ih => ih.InternalElement.AddNewMirror(ie),
                    InternalElementType p => p.InternalElement.AddNewMirror(ie),
                    _ => null,
                };
                return Describe(m) + "|" + Str(m?.RefBaseSystemUnitPath);
            }
            case "createAT":
            {
                var attr = EngineOpsOracle.Pick<AttributeType>(doc, op, "a");
                var t = EngineOpsOracle.Pick<CAEXObject>(doc, op, "b", x => x is AttributeTypeLibType || x is AttributeFamilyType);
                if (attr == null || t == null) return "none";
                var at = attr.CreateAttributeType();
                var inserted = t switch
                {
                    AttributeTypeLibType l => l.AttributeType.Insert(at),
                    AttributeFamilyType f => f.AttributeType.Insert(at),
                    _ => null,
                };
                return Describe(inserted);
            }
            case "createIFC":
            {
                var ic = EngineOpsOracle.Pick<InterfaceClassType>(doc, op, "a");
                var t = EngineOpsOracle.Pick<CAEXObject>(doc, op, "b", x => x is InterfaceClassLibType || x is InterfaceFamilyType);
                if (ic == null || t == null) return "none";
                var f = ic.CreateInterfaceFamilyClass();
                var inserted = t switch
                {
                    InterfaceClassLibType l => l.InterfaceClass.Insert(f),
                    InterfaceFamilyType p => p.InterfaceClass.Insert(f),
                    _ => null,
                };
                return Describe(inserted);
            }
            default:
                return null;
        }
    }

    // ------------------------------------------------------------ CAEXFileStatisticService

    /// <summary>Conditions for the overloads with Predicate&lt;XNode&gt; (the same in the JS test).</summary>
    static readonly Predicate<XNode>?[] Conditions =
    {
        n => true,
        n => false,
        n => ((XElement)n).Attribute("Name")?.Value.StartsWith("A", StringComparison.Ordinal) == true,
        n => ((XElement)n).HasElements,
        n => ((XElement)n).Parent?.Name == ((XElement)n).Name,
        n => ((XElement)n).Ancestors().Count() % 2 == 0,
        n => ((XElement)n).Attribute("Name")?.Value.Contains('e') == true ? throw new InvalidOperationException("stop") : true,
        null,
    };

    static JsonNode StatSection()
    {
        CAEXFileStatisticService.UnRegister();
        var svc = CAEXFileStatisticService.Register();
        var results = new JsonObject
        {
            ["registered"] = Str(ReferenceEquals(ServiceLocator.GetService<IStatistic>(), svc)),
        };
        var list = new JsonArray();
        foreach (var start in Read("stat.json")["docs"]!.AsArray())
        {
            var doc = Load(start!.GetValue<string>());
            list.Add(new JsonObject { ["doc"] = start.GetValue<string>(), ["lines"] = StatLines(svc, doc.CAEXFile) });
            doc.Unload();
        }
        list.Add(new JsonObject { ["doc"] = "null", ["lines"] = StatLines(svc, null) });
        results["docs"] = list;
        CAEXFileStatisticService.UnRegister();
        results["unregistered"] = Str(ServiceLocator.GetService<IStatistic>() == null);
        return results;
    }

    static JsonArray StatLines(CAEXFileStatisticService s, CAEXFileType? f)
    {
        var lines = new JsonArray
        {
            Try(() => s.NumberOfAllObjects(f!)),
            Try(() => s.NumberOfAttributes(f!)),
            Try(() => s.NumberOfAttributeTypeReferences(f!)),
            Try(() => s.NumberOfAttributeTypes(f!)),
            Try(() => s.NumberOfInterfaceClasses(f!)),
            Try(() => s.NumberOfInterfaceInstances(f!)),
            Try(() => s.NumberOfInternalElements(f!)),
            Try(() => s.NumberOfLinks(f!)),
            Try(() => s.NumberOfRoleClasses(f!)),
            Try(() => s.NumberOfRoleClassReferences(f!)),
            Try(() => s.NumberOfSystemUnitClasses(f!)),
            Try(() => s.NumberOfSystemUnitClassReferences(f!)),
        };
        foreach (var c in Conditions)
        {
            lines.Add(Try(() => s.NumberOfAttributeTypes(f!, c!)));
            lines.Add(Try(() => s.NumberOfInterfaceClasses(f!, c!)));
            lines.Add(Try(() => s.NumberOfRoleClasses(f!, c!)));
            lines.Add(Try(() => s.NumberOfSystemUnitClasses(f!, c!)));
        }
        return lines;
    }

    // -------------------------------------------------------------- RepairTypeEnumConverter

    static JsonNode RepairSection()
    {
        var c = Read("repair.json");
        var listed = new JsonArray();
        foreach (var v in c["values"]!.AsArray())
        {
            var value = v!.GetValue<int>();
            listed.Add(new JsonArray(value, Try(() => ((RepairTypeEnum)value).RepairTypeDescription())));
        }
        foreach (RepairTypeEnum member in Enum.GetValues(typeof(RepairTypeEnum)))
            listed.Add(new JsonArray((int)member, member.RepairTypeDescription()));
        // every value 0 .. 2^bits - 1: one hash per chunk, and the number of values per text
        var bits = c["all"]!.GetValue<int>();
        var chunkBits = c["chunkBits"]!.GetValue<int>();
        var chunks = new JsonArray();
        var counts = new SortedDictionary<string, int>(StringComparer.Ordinal);
        var sb = new StringBuilder();
        for (var v = 0; v < 1 << bits; v++)
        {
            var d = ((RepairTypeEnum)v).RepairTypeDescription();
            counts[d] = counts.TryGetValue(d, out var n) ? n + 1 : 1;
            sb.Append(d).Append('\n');
            if (((v + 1) & ((1 << chunkBits) - 1)) == 0)
            {
                chunks.Add(EngineOpsOracle.Hash(sb.ToString()));
                sb.Clear();
            }
        }
        var countsNode = new JsonObject();
        foreach (var (k, n) in counts) countsNode[k] = n;
        return new JsonObject { ["listed"] = listed, ["chunks"] = chunks, ["counts"] = countsNode };
    }

    // ------------------------------------------------------------------------ ValidationKey

    static JsonNode ValidationKeySection()
    {
        var keys = Read("vkey.json")["keys"]!.AsArray()
            .Select(k => new ValidationKey(k![0]?.GetValue<string>()!, (ValidationTypeEnum)k[1]!.GetValue<int>()))
            .ToList();
        var single = new JsonArray();
        foreach (var k in keys)
        {
            var twin = new ValidationKey(k.Key, k.ValidationType);
            single.Add(new JsonArray(
                Try(() => k.ToString()), Str(k.Key), Str(k.ValidationType), Str(k.Item1), Str((int)k.Item2),
                Str(k.Equals(null)), Str(k.Equals("a")), Str(k.Equals(k)), Str(k.Equals(twin)),
                Str(k.GetHashCode() == twin.GetHashCode())));
        }
        var matrix = new JsonArray();
        foreach (var a in keys) matrix.Add(string.Concat(keys.Select(b => a.Equals(b) ? '1' : '0')));
        var set = new HashSet<ValidationKey>(keys);
        var dict = new Dictionary<ValidationKey, int>();
        for (var i = 0; i < keys.Count; i++) dict[keys[i]] = i;
        return new JsonObject
        {
            ["single"] = single,
            ["equals"] = matrix,
            ["hashSet"] = string.Join(";", set.Select(k => k.ToString())),
            ["dictionary"] = string.Join(";", dict.Select(kv => kv.Key + "=" + kv.Value)),
            ["lookup"] = string.Join(",", keys.Select(k => dict.TryGetValue(new ValidationKey(k.Key, k.ValidationType), out var v) ? v.ToString() : "-")),
        };
    }

    // -------------------------------------------------- Dictionary<string,int>, Dictionary<int,int>

    static JsonNode DictionarySection()
    {
        var results = new JsonArray();
        foreach (var seq in Read("dict.json").AsArray())
        {
            var ops = seq!["ops"]!.AsArray();
            results.Add(S(seq, "keyType") == "string"
                ? RunDictionary(new Dictionary<string, int>(), ops, k => k?.GetValue<string>()!)
                : RunDictionary(new Dictionary<int, int>(), ops, k => k!.GetValue<int>()));
        }
        return results;
    }

    static JsonArray RunDictionary<TK>(Dictionary<TK, int> d, JsonArray ops, Func<JsonNode?, TK> key) where TK : notnull
    {
        var lines = new JsonArray();
        foreach (var opNode in ops)
        {
            var op = opNode!.AsArray();
            string r;
            try
            {
                switch (op[0]!.GetValue<string>())
                {
                    case "add": d.Add(key(op[1]), op[2]!.GetValue<int>()); r = "ok"; break;
                    case "set": d[key(op[1])] = op[2]!.GetValue<int>(); r = "ok"; break;
                    case "remove": r = Str(d.Remove(key(op[1]))); break;
                    case "clear": d.Clear(); r = "ok"; break;
                    case "tryGet": r = Str(d.TryGetValue(key(op[1]), out var v)) + ":" + v; break;
                    case "get": r = d[key(op[1])].ToString(); break;
                    case "contains": r = Str(d.ContainsKey(key(op[1]))); break;
                    case "keys": r = string.Join(",", d.Keys); break;
                    default: r = string.Join(",", d.Values); break;
                }
            }
            catch (Exception e) { r = ExMsg(e); }
            lines.Add(r + "|" + d.Count + "|" + string.Join(",", d.Select(kv => kv.Key + "=" + kv.Value)));
        }
        return lines;
    }

    // ------------------------- List<int>, Dictionary<int,int>, HashSet<int>: changes while enumerating

    static JsonNode CollectionSection()
    {
        var results = new JsonArray();
        foreach (var seq in Read("coll.json").AsArray())
        {
            var ops = seq!["ops"]!.AsArray();
            results.Add(S(seq, "kind") switch
            {
                "list" => RunList(ops),
                "dict" => RunDictionaryEnumeration(ops),
                _ => RunHashSet(ops),
            });
        }
        return results;
    }

    static string Fmt(object? current) => current switch
    {
        KeyValuePair<int, int> kv => $"{kv.Key}={kv.Value}",
        _ => Str(current),
    };

    /// <summary>begin (opens an enumerator) and next (MoveNext of an open one, index modulo their number).</summary>
    static string Enumeration(JsonArray op, List<System.Collections.IEnumerator> enums, Func<System.Collections.IEnumerator> begin)
    {
        if (op[0]!.GetValue<string>() == "begin")
        {
            enums.Add(begin());
            return "e" + (enums.Count - 1);
        }
        if (enums.Count == 0) return "none";
        var e = enums[op[1]!.GetValue<int>() % enums.Count];
        return e.MoveNext() ? "True:" + Fmt(e.Current) : "False";
    }

    static IEnumerable<int> Gen(int v)
    {
        yield return v;
        yield return v + 1;
    }

    static JsonArray RunList(JsonArray ops)
    {
        var list = new List<int>();
        var enums = new List<System.Collections.IEnumerator>();
        var lines = new JsonArray();
        foreach (var opNode in ops)
        {
            var op = opNode!.AsArray();
            int I(int k) => op[k]!.GetValue<int>();
            string r;
            try
            {
                switch (op[0]!.GetValue<string>())
                {
                    case "add": list.Add(I(1)); r = "ok"; break;
                    case "addRange":
                    {
                        var v = I(2);
                        IEnumerable<int> source = op[1]!.GetValue<string>() switch
                        {
                            "self" => list,
                            "selfWhere" => list.Where(x => x % 2 == 1),
                            "selfWhereNone" => list.Where(x => x < 0),
                            "selfSelect" => list.Select(x => x + 100),
                            "selfOrderBy" => list.OrderBy(x => x),
                            "selfToList" => list.ToList(),
                            "array" => new[] { v, v + 1 },
                            "emptyArray" => Array.Empty<int>(),
                            "copy" => new List<int> { v },
                            "set" => new HashSet<int> { v, v + 1 },
                            _ => Gen(v),
                        };
                        list.AddRange(source);
                        r = "ok";
                        break;
                    }
                    case "insert": list.Insert(I(1), I(2)); r = "ok"; break;
                    case "removeAt": list.RemoveAt(I(1)); r = "ok"; break;
                    case "remove": r = Str(list.Remove(I(1))); break;
                    case "set": list[I(1)] = I(2); r = "ok"; break;
                    case "clear": list.Clear(); r = "ok"; break;
                    case "removeAll": { var m = I(1); r = list.RemoveAll(x => x % m == 0).ToString(); break; }
                    case "forEach":
                    {
                        var mode = op[1]!.GetValue<string>();
                        var seen = new List<int>();
                        try
                        {
                            list.ForEach(x =>
                            {
                                seen.Add(x);
                                if (mode == "add" && seen.Count == 1) list.Add(99);
                                if (mode == "set" && seen.Count == 1) list[0] = list[0];
                            });
                            r = string.Join(",", seen);
                        }
                        catch (Exception e) { r = string.Join(",", seen) + ExMsg(e); }
                        break;
                    }
                    case "get": r = list[I(1)].ToString(); break;
                    case "indexOf": r = list.IndexOf(I(1)).ToString(); break;
                    case "contains": r = Str(list.Contains(I(1))); break;
                    default: r = Enumeration(op, enums, () => list.GetEnumerator()); break;
                }
            }
            catch (Exception e) { r = ExMsg(e); }
            lines.Add($"{r}|{list.Count}|{string.Join(",", list)}");
        }
        return lines;
    }

    static JsonArray RunDictionaryEnumeration(JsonArray ops)
    {
        var d = new Dictionary<int, int>();
        var enums = new List<System.Collections.IEnumerator>();
        var lines = new JsonArray();
        foreach (var opNode in ops)
        {
            var op = opNode!.AsArray();
            int I(int k) => op[k]!.GetValue<int>();
            string r;
            try
            {
                switch (op[0]!.GetValue<string>())
                {
                    case "add": d.Add(I(1), I(2)); r = "ok"; break;
                    case "set": d[I(1)] = I(2); r = "ok"; break;
                    case "remove": r = Str(d.Remove(I(1))); break;
                    case "clear": d.Clear(); r = "ok"; break;
                    case "tryGet": r = Str(d.TryGetValue(I(1), out var v)) + ":" + v; break;
                    default:
                        // the function is called for 'begin' only, which names the kind of enumerator
                        r = Enumeration(op, enums, () => op[1]!.GetValue<string>() switch
                        {
                            "keys" => d.Keys.GetEnumerator(),
                            "values" => d.Values.GetEnumerator(),
                            _ => d.GetEnumerator(),
                        });
                        break;
                }
            }
            catch (Exception e) { r = ExMsg(e); }
            lines.Add($"{r}|{d.Count}|{string.Join(",", d.Select(kv => kv.Key + "=" + kv.Value))}");
        }
        return lines;
    }

    static JsonArray RunHashSet(JsonArray ops)
    {
        var set = new HashSet<int>();
        var enums = new List<System.Collections.IEnumerator>();
        var lines = new JsonArray();
        foreach (var opNode in ops)
        {
            var op = opNode!.AsArray();
            int I(int k) => op[k]!.GetValue<int>();
            string r;
            try
            {
                switch (op[0]!.GetValue<string>())
                {
                    case "add": r = Str(set.Add(I(1))); break;
                    case "remove": r = Str(set.Remove(I(1))); break;
                    case "clear": set.Clear(); r = "ok"; break;
                    case "contains": r = Str(set.Contains(I(1))); break;
                    default: r = Enumeration(op, enums, () => set.GetEnumerator()); break;
                }
            }
            catch (Exception e) { r = ExMsg(e); }
            lines.Add($"{r}|{set.Count}|{string.Join(",", set)}");
        }
        return lines;
    }

    // ----------------------------------------------------------------------- SemaphoreSlim

    static JsonNode LockSection()
    {
        var results = new JsonArray();
        foreach (var seq in Read("lock.json").AsArray())
        {
            var s = new SemaphoreSlim(seq!["initial"]!.GetValue<int>(), seq["max"]!.GetValue<int>());
            var waiters = new List<Task>();
            var lines = new JsonArray();
            foreach (var op in seq["ops"]!.AsArray())
            {
                string r;
                try
                {
                    switch (op!.GetValue<string>())
                    {
                        case "wait":
                        {
                            var t = s.WaitAsync();
                            if (t.IsCompleted) r = "entered";
                            else
                            {
                                waiters.Add(t);
                                r = "queued" + (waiters.Count - 1);
                            }
                            break;
                        }
                        case "try": r = Str(s.Wait(0)); break;
                        case "release": r = s.Release().ToString(); break;
                        default: r = s.CurrentCount.ToString(); break;
                    }
                }
                catch (Exception e) { r = ExMsg(e); }
                var done = string.Join(",", waiters.Select((t, i) => (t, i)).Where(x => x.t.IsCompleted).Select(x => x.i));
                lines.Add($"{r}|{s.CurrentCount}|{done}");
            }
            results.Add(lines);
        }
        return results;
    }
}
