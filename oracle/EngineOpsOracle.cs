using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// Runs engine operation scripts (scripts/gen-engine-ops.mjs) against the real Aml.Engine.
/// Targets are chosen at execution time as index modulo the number of candidates of a kind,
/// taken in document order, so the JS runner (test/engine/ops.oracle.test.ts) picks the same
/// objects while both documents agree. Per step the result and a hash of the canonical document
/// text are recorded; GUIDs are replaced by their order of appearance (G1, G2, ...).
/// </summary>
public static class EngineOpsOracle
{
    public static void Run(string scriptFile, string corpusDir, string outFile)
    {
        var scripts = JsonNode.Parse(File.ReadAllText(scriptFile))!.AsArray();
        var results = new JsonArray();
        foreach (var script in scripts)
        {
            var canon = new Canonicalizer();
            var steps = new JsonArray();
            CAEXDocument doc;
            var start = script!["start"]!.GetValue<string>();
            doc = start switch
            {
                "new30" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0),
                "new215" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15),
                _ => CAEXDocument.LoadFromString(File.ReadAllText(Path.Combine(corpusDir, start), Encoding.UTF8)),
            };
            string? lastText = null;
            foreach (var op in script["ops"]!.AsArray())
            {
                string result;
                try { result = Apply(doc, op!.AsObject()); }
                catch (Exception e) { result = "!" + e.GetType().Name; }
                string text;
                try { text = canon.Apply(Save(doc)); }
                catch (Exception e) { text = "!" + e.GetType().Name; }
                lastText = text;
                steps.Add(new JsonArray(canon.Apply(result), Hash(text)));
            }
            results.Add(new JsonObject { ["steps"] = steps, ["final"] = lastText });
        }
        File.WriteAllText(outFile, results.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
    }

    internal static string Save(CAEXDocument doc)
    {
        using var s = doc.SaveToStream(true);
        s.Position = 0;
        return new StreamReader(s).ReadToEnd();
    }

    internal static string Hash(string text) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).Substring(0, 16);

    /// <summary>All CAEX objects of the document in document order.</summary>
    internal static List<CAEXObject> Objects(CAEXDocument doc) =>
        doc.XDocument.Root!.Descendants()
            .Select(e => e.CreateCAEXWrapper())
            .OfType<CAEXObject>()
            .ToList();

    internal static T? Pick<T>(CAEXDocument doc, JsonObject op, string key, Func<T, bool>? filter = null) where T : class
    {
        var all = Objects(doc).OfType<T>().Where(x => filter == null || filter(x)).ToList();
        if (all.Count == 0) return null;
        return all[op[key]!.GetValue<int>() % all.Count];
    }

    static string Str(JsonObject op, string key) => op[key]!.GetValue<string>();

    internal static string Describe(CAEXObject? o) =>
        o == null ? "null" : $"{o.Node.Name.LocalName}|{o.Name}|{o.ID}|{Try(() => o.CAEXPath())}";

    /// <summary>A role reference (RoleRequirements or SupportedRoleClass) by kind and path.</summary>
    static string RoleRef(object? r) => r switch
    {
        null => "null",
        RoleRequirementsType rr => "RR:" + rr.RefBaseRoleClassPath,
        SupportedRoleClassType src => "SRC:" + src.RefRoleClassPath,
        _ => "?" + r.GetType().Name,
    };

    static string Try(Func<string?> f)
    {
        try { return f() ?? "null"; }
        catch (Exception e) { return "!" + e.GetType().Name; }
    }

    internal static string Apply(CAEXDocument doc, JsonObject op)
    {
        var file = doc.CAEXFile;
        switch (Str(op, "op"))
        {
            case "newIH":
                return Describe(file.InstanceHierarchy.Append(Str(op, "name")));
            case "newLib":
                return Str(op, "kind") switch
                {
                    "suc" => Describe(file.SystemUnitClassLib.Append(Str(op, "name"))),
                    "rc" => Describe(file.RoleClassLib.Append(Str(op, "name"))),
                    "ic" => Describe(file.InterfaceClassLib.Append(Str(op, "name"))),
                    _ => Describe(file.AttributeTypeLib.Append(Str(op, "name"))),
                };
            case "newClass":
            {
                var name = Str(op, "name");
                switch (Str(op, "kind"))
                {
                    case "suc":
                    {
                        var t = Pick<CAEXObject>(doc, op, "a", x => x is SystemUnitClassLibType || x is SystemUnitFamilyType);
                        return t switch
                        {
                            SystemUnitClassLibType l => Describe(l.SystemUnitClass.Append(name)),
                            SystemUnitFamilyType c => Describe(c.SystemUnitClass.Append(name)),
                            _ => "none",
                        };
                    }
                    case "rc":
                    {
                        var t = Pick<CAEXObject>(doc, op, "a", x => x is RoleClassLibType || x is RoleFamilyType);
                        return t switch
                        {
                            RoleClassLibType l => Describe(l.RoleClass.Append(name)),
                            RoleFamilyType c => Describe(c.RoleClass.Append(name)),
                            _ => "none",
                        };
                    }
                    case "ic":
                    {
                        var t = Pick<CAEXObject>(doc, op, "a", x => x is InterfaceClassLibType || x is InterfaceFamilyType);
                        return t switch
                        {
                            InterfaceClassLibType l => Describe(l.InterfaceClass.Append(name)),
                            InterfaceFamilyType c => Describe(c.InterfaceClass.Append(name)),
                            _ => "none",
                        };
                    }
                    default:
                    {
                        var t = Pick<CAEXObject>(doc, op, "a", x => x is AttributeTypeLibType || x is AttributeFamilyType);
                        return t switch
                        {
                            AttributeTypeLibType l => Describe(l.AttributeType.Append(name)),
                            AttributeFamilyType c => Describe(c.AttributeType.Append(name)),
                            _ => "none",
                        };
                    }
                }
            }
            case "newIE":
            {
                var t = Pick<CAEXObject>(doc, op, "a", x => x is InstanceHierarchyType || x is SystemUnitClassType);
                return t switch
                {
                    InstanceHierarchyType ih => Describe(ih.InternalElement.Append(Str(op, "name"))),
                    SystemUnitClassType s => Describe(s.InternalElement.Append(Str(op, "name"))),
                    _ => "none",
                };
            }
            case "newAttr":
            {
                var t = Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithAttributes);
                return t is IObjectWithAttributes o ? Describe(o.Attribute.Append(Str(op, "name"))) : "none";
            }
            case "setAttr":
            {
                var a = Pick<AttributeTypeType>(doc, op, "a");
                if (a == null) return "none";
                var dt = op["dataType"]?.GetValue<string>();
                if (dt != null) a.AttributeDataType = dt;
                a.Value = op["value"]?.GetValue<string>();
                return $"{a.Value}|{a.AttributeDataType}|{Try(() => a.AttributeValue?.ToString())}";
            }
            case "setAttrTyped":
            {
                var a = Pick<AttributeTypeType>(doc, op, "a");
                if (a == null) return "none";
                object? v = Str(op, "type") switch
                {
                    "double" => op["value"]!.GetValue<double>(),
                    "int" => op["value"]!.GetValue<int>(),
                    "bool" => op["value"]!.GetValue<bool>(),
                    "decimal" => decimal.Parse(Str(op, "value"), System.Globalization.CultureInfo.InvariantCulture),
                    _ => Str(op, "value"),
                };
                a.AttributeValue = v;
                return $"{a.Value}|{a.AttributeDataType}";
            }
            case "setUnit":
            {
                var a = Pick<AttributeTypeType>(doc, op, "a");
                if (a == null) return "none";
                a.Unit = op["value"]?.GetValue<string>();
                return a.Unit ?? "null";
            }
            case "newEI":
            {
                var t = Pick<CAEXObject>(doc, op, "a", x => x is IObjectWithExternalInterface);
                if (t is not IObjectWithExternalInterface o) return "none";
                var ei = o.ExternalInterface.Append(Str(op, "name"));
                var ic = Pick<InterfaceFamilyType>(doc, op, "b");
                if (ic != null && op["withClass"]!.GetValue<bool>()) ei.RefBaseClassPath = ic.CAEXPath();
                return Describe(ei) + "|" + ei.RefBaseClassPath;
            }
            case "setBase":
            {
                var kind = Str(op, "kind");
                switch (kind)
                {
                    case "suc":
                    {
                        var c = Pick<SystemUnitFamilyType>(doc, op, "a");
                        var b = Pick<SystemUnitFamilyType>(doc, op, "b");
                        if (c == null || b == null) return "none";
                        c.BaseClass = b;
                        return c.RefBaseClassPath ?? "null";
                    }
                    case "rc":
                    {
                        var c = Pick<RoleFamilyType>(doc, op, "a");
                        var b = Pick<RoleFamilyType>(doc, op, "b");
                        if (c == null || b == null) return "none";
                        c.BaseClass = b;
                        return c.RefBaseClassPath ?? "null";
                    }
                    default:
                    {
                        var c = Pick<InterfaceFamilyType>(doc, op, "a");
                        var b = Pick<InterfaceFamilyType>(doc, op, "b");
                        if (c == null || b == null) return "none";
                        c.BaseClass = b;
                        return c.RefBaseClassPath ?? "null";
                    }
                }
            }
            case "addRole":
            {
                var rc = Pick<RoleFamilyType>(doc, op, "b");
                if (rc == null) return "none";
                var t = Pick<CAEXObject>(doc, op, "a", x => x is InternalElementType || x is SystemUnitFamilyType);
                return t switch
                {
                    InternalElementType ie => Try(() => RoleRef(ie.AddRoleClassReference(rc))) + "|" + string.Join(",", ie.RoleRequirements.Select(r => r.RefBaseRoleClassPath)),
                    SystemUnitFamilyType s => Try(() => RoleRef(s.AddRoleClassReference(rc))) + "|" + string.Join(",", s.SupportedRoleClass.Select(r => r.RefRoleClassPath)),
                    _ => "none",
                };
            }
            case "instantiate":
            {
                var suc = Pick<SystemUnitFamilyType>(doc, op, "a");
                var t = Pick<CAEXObject>(doc, op, "b", x => x is InstanceHierarchyType || x is InternalElementType);
                if (suc == null || t == null) return "none";
                var ie = suc.CreateClassInstance();
                var inserted = t switch
                {
                    InstanceHierarchyType ih => ih.InternalElement.Insert(ie),
                    InternalElementType p => p.InternalElement.Insert(ie),
                    _ => null,
                };
                return Describe(inserted) + "|" + ie.RefBaseSystemUnitPath;
            }
            case "link":
            {
                var a = Pick<ExternalInterfaceType>(doc, op, "a");
                var b = Pick<ExternalInterfaceType>(doc, op, "b");
                if (a == null || b == null) return "none";
                var il = InternalLinkType.New_InternalLink(a, b, Str(op, "name"));
                return il == null ? "null" : $"{Describe(il)}|{il.RefPartnerSideA}|{il.RefPartnerSideB}|{il.CAEXParent?.Node.Name.LocalName}";
            }
            case "remove":
            {
                var o = Pick<CAEXObject>(doc, op, "a");
                if (o == null) return "none";
                o.Remove(op["relations"]!.GetValue<bool>());
                return "ok";
            }
            case "copyIE":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                var t = Pick<CAEXObject>(doc, op, "b", x => x is InstanceHierarchyType || x is InternalElementType);
                if (ie == null || t == null) return "none";
                var copy = (InternalElementType)ie.Copy();
                var inserted = t switch
                {
                    InstanceHierarchyType ih => ih.InternalElement.Insert(copy),
                    InternalElementType p => p.InternalElement.Insert(copy),
                    _ => null,
                };
                return Describe(inserted);
            }
            case "rename":
            {
                var o = Pick<CAEXObject>(doc, op, "a");
                if (o == null) return "none";
                o.Name = Str(op, "name");
                return Describe(o);
            }
            case "describe":
            {
                var o = Pick<CAEXObject>(doc, op, "a");
                if (o == null) return "none";
                o.Description = op["value"]?.GetValue<string>();
                o.Version = op["version"]?.GetValue<string>();
                return $"{o.Description}|{o.Version}";
            }
            case "newGuid":
            {
                var o = Pick<CAEXObject>(doc, op, "a");
                if (o == null) return "none";
                o.AssignNewGuidAsID(op["updateRefs"]!.GetValue<bool>());
                return Describe(o);
            }
            case "mirror":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                var t = Pick<CAEXObject>(doc, op, "b", x => x is InstanceHierarchyType || x is InternalElementType);
                if (ie == null || t == null) return "none";
                var m = ie.CreateMirror();
                var inserted = t switch
                {
                    InstanceHierarchyType ih => ih.InternalElement.Insert(m),
                    InternalElementType p => p.InternalElement.Insert(m),
                    _ => null,
                };
                return Describe(inserted) + "|" + m?.RefBaseSystemUnitPath;
            }
            case "setRefBase":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                var suc = Pick<SystemUnitFamilyType>(doc, op, "b");
                if (ie == null || suc == null) return "none";
                ie.RefBaseSystemUnitPath = suc.CAEXPath();
                return Try(() => ie.SystemUnitClass?.CAEXPath());
            }
            case "move":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                var t = Pick<CAEXObject>(doc, op, "b", x => x is InstanceHierarchyType || x is InternalElementType);
                if (ie == null || t == null) return "none";
                var inserted = t switch
                {
                    InstanceHierarchyType ih => ih.InternalElement.Insert(ie),
                    InternalElementType p => p.InternalElement.Insert(ie),
                    _ => null,
                };
                return Describe(inserted);
            }
            case "query":
            {
                var o = Pick<CAEXObject>(doc, op, "a");
                if (o == null) return "none";
                var sb = new StringBuilder();
                sb.Append(Try(() => Describe(doc.FindByPath(o.CAEXPath()))));
                if (!string.IsNullOrEmpty(o.ID)) sb.Append('|').Append(Try(() => Describe(doc.FindByID(o.ID))));
                switch (o)
                {
                    case SystemUnitFamilyType s:
                        sb.Append('|').Append(Try(() => string.Join(",", s.AttributeAndInherited.Select(x => x.Name))));
                        sb.Append('|').Append(Try(() => string.Join(",", s.GetReferenceHierarchy().Select(x => x.CAEXPath()))));
                        break;
                    case RoleFamilyType r:
                        sb.Append('|').Append(Try(() => string.Join(",", r.AttributeAndInherited.Select(x => x.Name))));
                        break;
                    case InternalElementType ie:
                        sb.Append('|').Append(Try(() => ie.SystemUnitClass?.CAEXPath()));
                        sb.Append('|').Append(Try(() => string.Join(",", ie.RoleReferences.Select(x => RoleRef(x)))));
                        break;
                    case InternalLinkType il:
                        sb.Append('|').Append(Try(() => il.AInterface?.CAEXPath())).Append('|').Append(Try(() => il.BInterface?.CAEXPath()));
                        break;
                    case AttributeType a:
                        sb.Append('|').Append(Try(() => a.AttributePath));
                        break;
                }
                return sb.ToString();
            }
            default:
                throw new NotSupportedException(Str(op, "op"));
        }
    }

    /// <summary>Replaces GUIDs (with or without braces, any case) by G1, G2, ... in order of first appearance.</summary>
    public sealed class Canonicalizer
    {
        static readonly Regex Guid = new(@"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", RegexOptions.Compiled);
        readonly Dictionary<string, string> map = new(StringComparer.OrdinalIgnoreCase);

        // Timestamps of "now" (DateTime.Now defaults) within a day of the run become NOW.
        static readonly Regex Us = new(@"(\d{2})/(\d{2})/(\d{4}) \d{2}:\d{2}:\d{2}", RegexOptions.Compiled);
        static readonly Regex Iso = new(@"(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?", RegexOptions.Compiled);

        static bool Recent(int y, int mo, int d)
        {
            try { return Math.Abs((new DateTime(y, mo, d) - DateTime.Today).TotalDays) <= 1; }
            catch { return false; }
        }

        public string Apply(string text)
        {
            text = Us.Replace(text, m => Recent(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value)) ? "NOW" : m.Value);
            text = Iso.Replace(text, m => Recent(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value)) ? "NOW" : m.Value);
            return ApplyGuids(text);
        }

        string ApplyGuids(string text) =>
            Guid.Replace(text, m =>
            {
                if (!map.TryGetValue(m.Value, out var id))
                {
                    id = "G" + (map.Count + 1);
                    map[m.Value] = id;
                }
                return id;
            });
    }
}
