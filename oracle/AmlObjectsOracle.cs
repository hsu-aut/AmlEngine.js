using System.Collections;
using System.IO.Packaging;
using System.Reflection;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Aml.Engine.AmlObjects;
using Aml.Engine.AmlObjects.Extensions;
using Aml.Engine.AmlObjects.MimeType;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Resources.AMLStandard;
using Aml.Engine.Services.Model;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// Coverage work package "amlobjects": Aml.Engine.AmlObjects (+ Extensions, MimeType), the
/// standard libraries and AutomationMLContainer (AMLX). Keep in sync with
/// test/engine/amlobjects.oracle.test.ts, which makes exactly the same calls.
///   amlobjects &lt;inputDir test/amlobjects&gt; &lt;corpusDir&gt; &lt;workDir&gt; &lt;outDir&gt;
/// Writes outDir/corpus.json (read sweep of every document), ops.json (random operation scripts,
/// scripts/gen-amlobjects.mjs), cases.json (fixed scenarios), mime.json, amlx.json and the
/// AMLX packages written by System.IO.Packaging (outDir/amlx/*.amlx).
/// </summary>
public static class AmlObjectsOracle
{
    static string workDir = "";

    public static void Run(string[] args)
    {
        var inputDir = Path.GetFullPath(args[0]);
        var corpusDir = args[1];
        workDir = Path.GetFullPath(args[2]);
        var outDir = args[3];
        Directory.CreateDirectory(outDir);
        if (Directory.Exists(workDir)) Directory.Delete(workDir, true);
        Directory.CreateDirectory(workDir);
        var json = new JsonSerializerOptions { WriteIndented = false };

        // 1. Read sweep over the corpus and the input documents.
        var corpus = new JsonObject();
        var files = Directory.GetFiles(corpusDir, "*.aml").OrderBy(f => Path.GetFileName(f), StringComparer.Ordinal)
            .Select(f => ("corpus:" + Path.GetFileName(f), f))
            .Concat(Directory.GetFiles(Path.Combine(inputDir, "docs"), "*.aml").OrderBy(f => Path.GetFileName(f), StringComparer.Ordinal)
                .Select(f => ("docs:" + Path.GetFileName(f), f)));
        foreach (var (key, file) in files)
        {
            var r = new Rec();
            try { CorpusSweep(r, CAEXDocument.LoadFromString(File.ReadAllText(file, Encoding.UTF8))); }
            catch (Exception e) { r.Lines.Add("load:" + Ex(e)); }
            corpus[key] = r.ToJson();
        }
        File.WriteAllText(Path.Combine(outDir, "corpus.json"), corpus.ToJsonString(json));

        // 2. Random operation scripts.
        var scripts = JsonNode.Parse(File.ReadAllText(Path.Combine(inputDir, "ops.json")))!.AsArray();
        var results = new JsonArray();
        foreach (var script in scripts)
        {
            var canon = new Canon();
            var steps = new JsonArray();
            var doc = Start(script!["start"]!.GetValue<string>(), inputDir, corpusDir);
            string last = "";
            foreach (var op in script["ops"]!.AsArray())
            {
                string result;
                try { result = Apply(doc, op!.AsObject()); }
                catch (Exception e) { result = Ex(e); }
                string text;
                try { text = canon.Apply(SaveString(doc)); }
                catch (Exception e) { text = Ex(e); }
                last = text;
                steps.Add(new JsonArray(canon.Apply(result), Hash(text)));
            }
            results.Add(new JsonObject { ["steps"] = steps, ["final"] = last });
        }
        File.WriteAllText(Path.Combine(outDir, "ops.json"), results.ToJsonString(json));

        // 3. Fixed scenarios.
        var cases = new JsonObject();
        foreach (var (name, action) in Cases(inputDir, corpusDir))
        {
            var r = new Rec();
            try { action(r); }
            catch (Exception e) { r.Lines.Add("abort:" + Ex(e)); }
            cases[name] = r.ToJson();
        }
        File.WriteAllText(Path.Combine(outDir, "cases.json"), cases.ToJsonString(json));

        // 4. MIME type map.
        var mime = new Rec();
        MimeCases(mime);
        File.WriteAllText(Path.Combine(outDir, "mime.json"), mime.ToJson().ToJsonString(json));

        // 5. AMLX containers.
        var amlxOut = Path.Combine(outDir, "amlx");
        Directory.CreateDirectory(amlxOut);
        var amlx = new JsonObject();
        foreach (var (name, action) in AmlxCases(inputDir, corpusDir))
        {
            var r = new Rec();
            try { action(r, amlxOut); }
            catch (Exception e) { r.Lines.Add("abort:" + Ex(e)); }
            amlx[name] = r.ToJson();
        }
        File.WriteAllText(Path.Combine(outDir, "amlx.json"), amlx.ToJsonString(json));
    }

    // ---------------------------------------------------------------- recording

    /// <summary>Recorded lines of one case; values are canonicalized (GUIDs, now, work dir, relationship IDs).</summary>
    public sealed class Rec
    {
        public readonly List<string> Lines = new();
        public readonly Canon C = new();

        public void V(string label, Func<object?> f)
        {
            string s;
            try { s = F(f()); }
            catch (Exception e) { s = Ex(e); }
            Lines.Add(C.Apply(label + "=" + s));
        }

        public void Do(string label, Action a)
        {
            string s = "ok";
            try { a(); }
            catch (Exception e) { s = Ex(e); }
            Lines.Add(C.Apply(label + "=" + s));
        }

        public void Doc(string label, CAEXDocument doc)
        {
            string s;
            try { s = SaveString(doc); }
            catch (Exception e) { s = Ex(e); }
            Lines.Add(C.Apply(label + "=" + s));
        }

        public JsonArray ToJson() => new(Lines.Select(l => (JsonNode)JsonValue.Create(l)!).ToArray());
    }

    public sealed class Canon
    {
        readonly EngineOpsOracle.Canonicalizer inner = new();
        readonly Dictionary<string, string> rels = new(StringComparer.Ordinal);
        static readonly Regex RelId = new(@"\bR[0-9a-f]{16}\b", RegexOptions.Compiled);

        public string Apply(string text)
        {
            if (workDir.Length > 0)
            {
                text = text.Replace(workDir, "<DIR>", StringComparison.OrdinalIgnoreCase);
                text = text.Replace(workDir.Replace('\\', '/'), "<DIR>", StringComparison.OrdinalIgnoreCase);
            }
            text = RelId.Replace(text, m =>
            {
                if (!rels.TryGetValue(m.Value, out var id))
                {
                    id = "RID" + (rels.Count + 1);
                    rels[m.Value] = id;
                }
                return id;
            });
            return inner.Apply(text);
        }
    }

    static string Ex(Exception e)
    {
        while (e is TargetInvocationException { InnerException: not null } t) e = t.InnerException!;
        // XmlException messages come from the XML layer (src/xml), whose messages differ from XmlReader (documented there).
        return e is NullReferenceException or System.Xml.XmlException ? "!" + e.GetType().Name : "!" + e.GetType().Name + ": " + e.Message;
    }

    static string T(Func<object?> f)
    {
        try { return F(f()); }
        catch (Exception e) { return Ex(e); }
    }

    static string B(bool b) => b ? "true" : "false";

    /// <summary>Formats a result value (the JS test has the same rules, in the same order).</summary>
    public static string F(object? v)
    {
        switch (v)
        {
            case null: return "null";
            case string s: return s;
            case bool b: return B(b);
            case int or long: return Convert.ToString(v, System.Globalization.CultureInfo.InvariantCulture)!;
            case double d: return d.ToString(System.Globalization.CultureInfo.InvariantCulture);
            case Version ver: return "V(" + ver + ")";
            case Uri u: return FUri(u);
            case XElement e: return e.ToString();
            case CAEXWrapper w: return D(w);
            case MetaInformation m: return MetaText(m);
            case DocumentVersionInformation dv: return $"DV({N(dv.DocumentIdentifier)}|{N(dv.Version)})";
            case FrameValues fv: return $"Frame({F(fv.X)},{F(fv.Y)},{F(fv.Z)},{F(fv.Rx)},{F(fv.Ry)},{F(fv.Rz)})";
            case XMLSignature: return "XMLSignature";
            case PackagePart p: return "Part(" + p.Uri + ")";
            case PackageRelationship rel: return $"Rel({rel.Id}|{rel.RelationshipType}|{rel.TargetUri}|{rel.TargetMode}|{rel.SourceUri})";
            case IEnumerable en:
            {
                var parts = new List<string>();
                foreach (var x in en) parts.Add(F(x));
                return "[" + string.Join(",", parts) + "]";
            }
            default: return v.GetType().Name;
        }
    }

    static string N(string? s) => s ?? "null";

    static string MetaText(MetaInformation m) =>
        $"Meta({N(m.WriterName)}|{N(m.WriterID)}|{N(m.WriterVendor)}|{N(m.WriterVendorURL)}|{N(m.WriterVersion)}|{N(m.WriterRelease)}|{N(m.LastWritingDateTime)}|{N(m.WriterProjectTitle)}|{N(m.WriterProjectID)})";

    static string FUri(Uri u)
    {
        var s = $"Uri({u.OriginalString}|{B(u.IsAbsoluteUri)}|{T(() => u.ToString())}";
        if (u.IsAbsoluteUri) s += $"|{T(() => u.Scheme)}|{T(() => u.AbsoluteUri)}|{T(() => u.LocalPath)}|{T(() => u.Fragment)}";
        return s + ")";
    }

    /// <summary>Describes a wrapper: run time class, element name, name, ID, path (or role reference).</summary>
    static string D(CAEXWrapper? w)
    {
        if (w == null) return "null";
        if (w.Node == null) return w.GetType().Name + "(nonode)";
        if (w is CAEXObject o) return $"{w.GetType().Name}:{w.Node.Name.LocalName}|{N(o.Name)}|{N(o.ID)}|{T(() => o.CAEXPath())}";
        if (w is IObjectWithRoleReference rr) return $"{w.GetType().Name}:{w.Node.Name.LocalName}|{T(() => rr.RoleReference)}";
        return $"{w.GetType().Name}:{w.Node.Name.LocalName}";
    }

    static string SaveString(CAEXDocument doc)
    {
        using var s = doc.SaveToStream(true);
        s.Position = 0;
        return new StreamReader(s).ReadToEnd();
    }

    static string Hash(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text))).Substring(0, 16);

    static string HashBytes(byte[] bytes) => Convert.ToHexString(SHA256.HashData(bytes)).Substring(0, 16);

    static byte[] ReadAll(Stream s)
    {
        using var ms = new MemoryStream();
        s.CopyTo(ms);
        return ms.ToArray();
    }

    // ---------------------------------------------------------------- targets

    static List<CAEXWrapper> Wrappers(CAEXDocument doc) =>
        doc.XDocument.Root!.DescendantsAndSelf().Select(e => e.CreateCAEXWrapper()).Where(w => w != null).ToList()!;

    static T? Pick<T>(CAEXDocument doc, JsonObject op, string key, Func<T, bool>? filter = null) where T : class
    {
        var all = Wrappers(doc).OfType<T>().Where(x => filter == null || filter(x)).ToList();
        if (all.Count == 0) return null;
        return all[op[key]!.GetValue<int>() % all.Count];
    }

    static string Str(JsonObject op, string key) => op[key]!.GetValue<string>();
    static string? StrN(JsonObject op, string key) => op[key]?.GetValue<string>();
    static bool Bool(JsonObject op, string key) => op[key]!.GetValue<bool>();

    static CAEXDocument Start(string start, string inputDir, string corpusDir) => start switch
    {
        "new30" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0),
        "new215" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15),
        _ when start.StartsWith("docs:") => CAEXDocument.LoadFromString(File.ReadAllText(Path.Combine(inputDir, "docs", start.Substring(5)), Encoding.UTF8)),
        _ => CAEXDocument.LoadFromString(File.ReadAllText(Path.Combine(corpusDir, start.Substring(7)), Encoding.UTF8)),
    };

    // ---------------------------------------------------------------- read sweep

    static readonly string[] AttrIs = { "IsAssociatedExternalValue", "IsAssociatedFacet", "IsCardinality", "IsCategory", "IsDirection", "IsDocLang", "IsFrame", "IsListType", "IsLocalizedAttribute", "IsMIMEType", "IsOrderedListType", "IsRefUri" };
    static readonly string[] RoleIs = { "IsAutomationMLBaseRole", "IsFacet", "IsFrame", "IsGroup", "IsInterlockingSourceGroup", "IsInterlockingTargetGroup", "IsLogicObject", "IsPort", "IsProcess", "IsProcessStructure", "IsProduct", "IsProductStructure", "IsPropertySet", "IsResource", "IsResourceStructure", "IsStructure" };
    static readonly string[] LogicRoleIs = { "IsInterlockingSourceGroup", "IsInterlockingTargetGroup", "IsLogicModelObject" };
    static readonly string[] IfIs = { "IsAutomationMLBaseInterface", "IsBehaviourLogicInterface", "IsCOLLADAInterface", "IsCommunicationInterface", "IsExternalDataConnector", "IsExternalDataReference", "IsInterlockingConnector", "IsInterlockingLogicInterface", "IsInterlockingVariableInterface", "IsLogicElementInterface", "IsLogicInterface", "IsOrderInterface", "IsPLCopenXMLInterface", "IsPortConnector", "IsPPRConnector", "IsSequencingBehaviourLogicInterface", "IsSequencingLogicInterface", "IsSignalInterface", "IsVariableInterface" };
    static readonly string[] LogicIfIs = { "IsBehaviourLogicModelInterface", "IsInterlockingLogicModelInterface", "IsInterlockingVariableInterface", "IsLogicModelElementInterface", "IsLogicModelInterface", "IsSequencingLogicModelInterface", "IsVariableInterface" };

    /// <summary>Calls the static one-argument methods by name; one character per method: 1, 0 or ! (exception).</summary>
    static string Bits(Type cls, string[] names, Type argType, object arg)
    {
        var sb = new StringBuilder();
        foreach (var n in names)
        {
            try { sb.Append((bool)cls.GetMethod(n, new[] { argType })!.Invoke(null, new[] { arg })! ? '1' : '0'); }
            catch { sb.Append('!'); }
        }
        return sb.ToString();
    }

    static string RefProps(RefURIAttributeType r) =>
        $"uri={T(() => r.TheUri)};file={T(() => r.FilePath)};node={T(() => r.ReferencedNode)};abs={T(() => r.IsAbsoluteUri())};isFile={T(() => r.IsFile())};isRef={T(() => r.IsRefURIAttribute)};eq={T(() => r.UriReferencesAreEqual("geo/robot.dae#node1"))}";

    static string FacetInfo(AMLFacet f)
    {
        var sb = new StringBuilder();
        sb.Append("isFacet=").Append(T(() => f.IsFacet));
        sb.Append(";assignedA=").Append(T(() => f.AssignedParentAttributes()));
        sb.Append(";notAssignedA=").Append(T(() => f.NotAssignedParentAttributes()));
        sb.Append(";assignedI=").Append(T(() => f.AssignedParentInterfaces()));
        sb.Append(";notAssignedI=").Append(T(() => f.NotAssignedParentInterfaces()));
        sb.Append(";src=").Append(T(() => f.FacetAttribute.Select(a => T(() => f.SourceAttribute(a))).ToList()));
        sb.Append(";srcI=").Append(T(() => f.FacetExternalInterface.Select(a => T(() => f.SourceInterface(a))).ToList()));
        sb.Append(";seq=").Append(T(() => f.FacetAttribute.Select(a => f.CAEXSequence(a)?.GetType().Name).ToList()));
        return sb.ToString();
    }

    static string Sweep(CAEXWrapper w)
    {
        var sb = new StringBuilder(D(w));
        void Add(string k, Func<object?> f) => sb.Append(';').Append(k).Append('=').Append(T(f));
        if (w is InternalElementType ie)
        {
            Add("facet", () => ie.IsAMLFacet());
            Add("group", () => ie.IsAMLGroup());
            Add("port", () => ie.IsAMLPort());
            Add("docEl", () => ie.IsDocumentElement());
            Add("langs", () => ie.GetLanguages());
            if (T(() => ie.IsAMLFacet()) == "true") sb.Append(';').Append(FacetInfo(ie.AMLFacet()));
            if (T(() => ie.IsAMLGroup()) == "true")
            {
                Add("assoc", () => ie.AMLGroup().AssociatedFacet);
                Add("associable", () => ie.AMLGroup().AssociableFacets());
                Add("mirrorFacets", () => ie.AMLGroup().AssociableFacetsOfMirrorElements());
            }
        }
        if (w is SystemUnitClassType suc)
        {
            Add("facets", () => suc.AMLSystemUnitClass()?.AMLFacets);
            Add("groups", () => suc.AMLSystemUnitClass()?.AMLGroups);
            Add("ports", () => suc.AMLSystemUnitClass()?.AMLPorts);
            Add("amlObj", () => suc.IsAMLObject());
            Add("docEls", () => suc.DocumentElements());
        }
        if (w is ExternalInterfaceType ei)
        {
            Add("amlObj", () => ei.IsAMLObject());
            Add("facetIf", () => ei.IsFacetInterface());
        }
        if (w is IObjectWithAttributes owa)
        {
            Add("frameAttr", () => owa.FrameAttribute());
            Add("refUriAttr", () => owa.RefURIAttribute());
            Add("refTypeAttr", () => owa.RefTypeAttribute());
            Add("attrDesc", () => owa.AMLAttributes().AttributeAndDescendants.Count());
        }
        if (w is AttributeType a)
        {
            Add("list", () => $"{B(a.IsListAttribute())}{B(a.IsOrderedListAttribute())}{B(a.IsUnOrderedListAttribute())}");
            Add("items", () => a.ListItems());
            Add("itemValues", () => a.ListItemValues());
            Add("facetAttr", () => a.IsFacetAttribute());
            Add("isRefUri", () => a.IsRefURIAttribute());
            Add("isRefType", () => a.IsRefTypeAttribute());
            Add("isFrame", () => FrameAttributeType.IsFrame(a.Node));
            Add("isFrameAttr", () => FrameAttributeType.IsFrameAttribute(a));
            if (T(() => FrameAttributeType.IsFrame(a.Node)) == "true") Add("frame", () => new FrameAttributeType(a.Node).Frame);
            if (T(() => a.IsRefURIAttribute()) == "true") sb.Append(';').Append(RefProps(a.ToRefURIAttribute()));
            if (T(() => a.IsRefTypeAttribute()) == "true") Add("refType", () => $"{B(a.ToRefTypeAttribute().IsExplicit())}{B(a.ToRefTypeAttribute().IsImplicit())}");
        }
        if (w is AttributeTypeType att) Add("attrIs", () => Bits(typeof(AutomationMLBaseAttributeTypeLib), AttrIs, typeof(AttributeTypeType), att));
        if (w is IObjectWithRoleReference r)
        {
            Add("roleIs", () => Bits(typeof(AutomationMLBaseRoleClassLib), RoleIs, typeof(IObjectWithRoleReference), r));
            Add("logicRoleIs", () => Bits(typeof(AutomationMLLogicRoleClassLib), LogicRoleIs, typeof(IObjectWithRoleReference), r));
        }
        if (w is InterfaceClassType ic)
        {
            Add("ifIs", () => Bits(typeof(AutomationMLInterfaceClassLib), IfIs, typeof(InterfaceClassType), ic));
            Add("logicIfIs", () => Bits(typeof(AutomationMLLogicInterfaceClassLib), LogicIfIs, typeof(InterfaceClassType), ic));
            Add("plcIs", () => Bits(typeof(AutomationMLPLCopenXMLInterfaceClassLib), new[] { "IsVariableInterface" }, typeof(InterfaceClassType), ic));
        }
        if (w is CAEXObject o)
        {
            Add("sig", () => o.GetSignatureHeader());
            Add("xmlSig", () => o.GetXMLSignature());
        }
        return sb.ToString();
    }

    static readonly string[] ValidVersions = { "2.0", "2.1", "2.2", "1.0", "AutomationML 2.1", "AutomationML 3.0", "AutomationML", "abc", "", " ", "2.0.0.0", "AutomationML 2.0 2.1" };

    static void FileSweep(Rec r, CAEXDocument doc)
    {
        var file = doc.CAEXFile;
        r.V("schema", () => doc.SchemaVersionString);
        r.V("amlVersion", () => file.AMLFile().AutomationMLVersion);
        r.V("amlVersionDoc", () => doc.AutomationMLVersion());
        r.V("amlVersionFile", () => file.AutomationMLVersion());
        r.V("amlCreate", () => AMLFile.Create(doc).AutomationMLVersion);
        r.V("maxVersion", () => file.AMLFile().MaximalAMLVersion);
        foreach (var v in ValidVersions) r.V("valid:" + v, () => file.AMLFile().IsValidAutomationMLVersion(v));
        r.V("writerHeader", () => file.AMLFile().WriterHeader);
        r.V("meta", () => file.AMLFile().GetMetaInformation());
        r.V("metaExt", () => file.GetMetaInformation());
        var ids = new List<string?> { "nope", "", null, "ToolA", "ToolB" };
        try { ids.AddRange(file.AMLFile().GetMetaInformation().Select(m => m.WriterID)); } catch { }
        foreach (var id in ids) r.V("metaById:" + N(id), () => file.AMLFile().GetMetaInformation(id!));
        r.V("genericAI", () => file.AMLFile().GenericAdditionalInformation);
        foreach (var ai in file.AdditionalInformation.ElementAndValues.Select(e => e.Node).ToList())
            r.V("ai", () => $"{B(AMLFile.IsAutomationMLVersion(ai))}{B(AMLFile.IsDocumentVersion(ai))}{B(file.AMLFile().IsWriterHeader(ai))}{B(file.AMLFile().IsGenericAdditionalInformation(ai))}");
        r.V("loaded", () => $"{B(AutomationMLBaseRoleClassLibType.IsLoaded(doc))}{B(AutomationMLInterfaceClassLibType.IsLoaded(doc))}{B(AutomationMLBaseAttributeTypeLibType.IsLoaded(doc))}{B(AutomationMLLogicInterfaceClassLibType.IsLoaded(doc))}{B(AutomationMLPLCopenXMLInterfaceClassLibType.IsLoaded(doc))}");
        r.V("bpr", () => $"{D(file.AutomationMLBPRInterfaceClassLib())}|{D(file.AutomationMLBPRRoleClassLib())}");
    }

    static void FileSweepMutating(Rec r, CAEXDocument doc)
    {
        var file = doc.CAEXFile;
        r.V("docVersion", () => file.AMLFile().DocumentVersion.ToList());
        r.V("allDocVersions", () => file.GetAllDocumentVersionInformation().ToList());
        r.V("docVersionGet", () => file.GetDocumentVersionInformation("AR_001E"));
        r.V("docVersionGet2", () => file.GetDocumentVersionInformation("BPR_005E"));
        r.V("docVersionsHeader", () => file.DocumentVersionsHeader());
    }

    static void CorpusSweep(Rec r, CAEXDocument doc)
    {
        FileSweep(r, doc);
        var ws = Wrappers(doc);
        for (var i = 0; i < ws.Count; i++) r.Lines.Add(r.C.Apply(Sweep(ws[i])));
        FileSweepMutating(r, doc);
        r.V("hash", () => Hash(r.C.Apply(SaveString(doc))));
    }

    // ---------------------------------------------------------------- random operations

    static readonly Dictionary<string, Func<CAEXDocument, object?>> LibLoaders = new()
    {
        ["baseRole"] = d =>
        {
            var l = AutomationMLBaseRoleClassLibType.RoleClassLib(d);
            return new object?[] { l, l.AutomationMLBaseRole, l.Facet, l.Frame, l.Group, l.Port, l.Process, l.ProcessStructure, l.Product, l.ProductStructure, l.PropertySet, l.Resource, l.ResourceStructure, l.Structure,
#pragma warning disable CS0618
                l.InterlockingSourceGroup, l.InterlockingTargetGroup, l.LogicObject,
#pragma warning restore CS0618
                l.RoleClass.Count, D(d.AddAutomationMLBaseRoleClassLib()) };
        },
        ["interface"] = d =>
        {
            var l = AutomationMLInterfaceClassLibType.InterfaceClassLib(d);
            return new object?[] { l, l?.InterfaceClass.Count, D(d.AddAutomationMLInterfaceClassLib()), l?.AutomationMLClass("AutomationMLInterfaceClassLib/AutomationMLBaseInterface/PortConnector") };
        },
        ["attribute"] = d =>
        {
            var l = AutomationMLBaseAttributeTypeLibType.AttributeTypeLib(d);
            return l == null ? new object?[] { null, D(d.AddAutomationMLBaseAttributeTypeLib()) } : new object?[] { l, l.AssociatedExternalValue, l.AssociatedFacet, l.Cardinality, l.Category, l.Direction, l.ListType, l.LocalizedAttribute, l.MIMEType, l.OrderedListType, l.RefURI, l.AttributeType.Count, D(d.AddAutomationMLBaseAttributeTypeLib()) };
        },
        ["logicInterface"] = d =>
        {
            var l = AutomationMLLogicInterfaceClassLibType.InterfaceClassLib(d);
            return new object?[] { l, l?.InterfaceClass.Count };
        },
        ["logicRole"] = d =>
        {
            var l = AutomationMLLogicRoleClassLibType.RoleClassLib(d);
            return new object?[] { l, l?.InterlockingSourceGroup, l?.InterlockingTargetGroup, l?.LogicModelObject, l?.RoleClass.Count };
        },
        ["plcopen"] = d =>
        {
            var l = AutomationMLPLCopenXMLInterfaceClassLibType.InterfaceClassLib(d);
            return new object?[] { l, l?.InterfaceClass.Count };
        },
        ["bprRole"] = d =>
        {
            d.CAEXFile.AddAutomationMLBPRRoleClassLib();
            return new object?[] { d.CAEXFile.AutomationMLBPRRoleClassLib(), T(() => d.CAEXFile.ExternalDataRoleClass()), T(() => d.CAEXFile.AutomationMLBPRRoleClassLib()!.ExternalDataRoleClass()) };
        },
        ["bprInterface"] = d =>
        {
            d.CAEXFile.AddAutomationMLBPRInterfaceClassLib();
            return new object?[] { d.CAEXFile.AutomationMLBPRInterfaceClassLib(), T(() => d.CAEXFile.ExternalDataReferenceInterfaceClass()), T(() => d.CAEXFile.AutomationMLBPRInterfaceClassLib()!.ExternalDataReferenceInterfaceClass()) };
        },
        ["extData"] = d =>
        {
            d.CAEXFile.AddExternalDataReferenceLibraries();
            return "ok";
        },
        ["isLoaded"] = d => $"{B(AutomationMLBaseRoleClassLibType.IsLoaded(d))}{B(AutomationMLInterfaceClassLibType.IsLoaded(d))}{B(AutomationMLBaseAttributeTypeLibType.IsLoaded(d))}{B(AutomationMLLogicInterfaceClassLibType.IsLoaded(d))}{B(AutomationMLPLCopenXMLInterfaceClassLibType.IsLoaded(d))}",
    };

    static MetaInformation Meta(JsonArray w) => new()
    {
        WriterName = w[0]?.GetValue<string>()!,
        WriterID = w[1]?.GetValue<string>()!,
        WriterVendor = w[2]?.GetValue<string>()!,
        WriterVendorURL = w[3]?.GetValue<string>()!,
        WriterVersion = w[4]?.GetValue<string>()!,
        WriterRelease = w[5]?.GetValue<string>()!,
        LastWritingDateTime = w[6]?.GetValue<string>()!,
        WriterProjectTitle = w[7]?.GetValue<string>()!,
        WriterProjectID = w[8]?.GetValue<string>()!,
    };

    static string? W(JsonArray w, int i) => w[i]?.GetValue<string>();

    static DateTime Dt(JsonObject o) => new(o["y"]!.GetValue<int>(), o["mo"]!.GetValue<int>(), o["d"]!.GetValue<int>(), o["h"]!.GetValue<int>(), o["mi"]!.GetValue<int>(), o["s"]!.GetValue<int>(),
        Enum.Parse<DateTimeKind>(o["kind"]!.GetValue<string>()));

    static string Apply(CAEXDocument doc, JsonObject op)
    {
        var file = doc.CAEXFile;
        string? name = op["name"] is JsonNode n ? n.GetValue<string>() : null;
        switch (Str(op, "op"))
        {
            case "addFacet":
            case "addGroup":
            case "addPort":
            {
                var suc = Pick<SystemUnitClassType>(doc, op, "a");
                if (suc == null) return "none";
                var asc = suc.AMLSystemUnitClass();
                if (asc == null) return "null";
                return Str(op, "op") switch
                {
                    "addFacet" => D(asc.AddFacet(name!)) + "|" + T(() => asc.AMLFacets),
                    "addGroup" => D(asc.AddGroup(name!)) + "|" + T(() => asc.AMLGroups),
                    _ => D(asc.AddPort(name!)) + "|" + T(() => asc.AMLPorts),
                };
            }
            case "createObj":
            {
                var alias = StrN(op, "alias");
                InternalElementType created = Str(op, "kind") switch
                {
                    "facet" => AMLFacet.Create(doc, name!, alias!),
                    "group" => AMLGroup.Create(doc, name!, alias!),
                    _ => AMLPort.Create(doc, name!, alias!),
                };
                var text = created.Node.ToString();
                var suc = Pick<SystemUnitClassType>(doc, op, "a");
                return D(created) + "|" + text + "|" + (suc == null ? "none" : T(() => suc.InternalElement.Insert(created)));
            }
            case "facetAttr":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                if (ie == null) return "none";
                var f = ie.AMLFacet();
                var res = Str(op, "mode") switch
                {
                    "append" => T(() => f.FacetAttribute.Append()),
                    "appendName" => T(() => f.FacetAttribute.Append(name!)),
                    "appendParent" => T(() =>
                    {
                        var parentAttrs = (f.CAEXParent as IObjectWithAttributes)?.Attribute.ToList() ?? new List<AttributeType>();
                        var pn = parentAttrs.Count == 0 ? name : parentAttrs[op["b"]!.GetValue<int>() % parentAttrs.Count].Name;
                        return f.FacetAttribute.Append(pn!);
                    }),
                    "insert" => T(() => { var at = Pick<AttributeType>(doc, op, "b"); return at == null ? "none" : f.FacetAttribute.Insert(at); }),
                    "insertFacet" => T(() => { var at = Pick<AttributeType>(doc, op, "b"); return at == null ? "none" : f.Insert(at); }),
                    "import" => T(() => { var at = Pick<AttributeType>(doc, op, "b"); return at == null ? "none" : f.Import(at, name!); }),
                    "prepend" => T(() => f.FacetAttribute.Prepend()),
                    _ => T(() => f.FacetAttribute.Prepend(name!)),
                };
                return res + "|" + T(() => f.IsFacet) + "|" + T(() => f.Attribute.Count);
            }
            case "facetIf":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                if (ie == null) return "none";
                var f = ie.AMLFacet();
                var res = Str(op, "mode") switch
                {
                    "append" => T(() => f.FacetExternalInterface.Append()),
                    "appendName" => T(() => f.FacetExternalInterface.Append(name!)),
                    "appendParent" => T(() =>
                    {
                        var parentIfs = (f.CAEXParent as IObjectWithExternalInterface)?.ExternalInterface.ToList() ?? new List<ExternalInterfaceType>();
                        var pn = parentIfs.Count == 0 ? name : parentIfs[op["b"]!.GetValue<int>() % parentIfs.Count].Name;
                        return f.FacetExternalInterface.Append(pn!);
                    }),
                    "insert" => T(() => { var x = Pick<ExternalInterfaceType>(doc, op, "b"); return x == null ? "none" : f.FacetExternalInterface.Insert(x); }),
                    "insertFacet" => T(() => { var x = Pick<ExternalInterfaceType>(doc, op, "b"); return x == null ? "none" : f.Insert(x); }),
                    "import" => T(() => { var x = Pick<ExternalInterfaceType>(doc, op, "b"); return x == null ? "none" : f.Import(x, name!); }),
                    "prepend" => T(() => f.FacetExternalInterface.Prepend()),
                    _ => T(() => f.FacetExternalInterface.Prepend(name!)),
                };
                return res + "|" + T(() => f.IsFacet) + "|" + T(() => f.ExternalInterface.Count);
            }
            case "facetQuery":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                return ie == null ? "none" : D(ie) + "|" + FacetInfo(ie.AMLFacet());
            }
            case "groupInsert":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                var x = Pick<InternalElementType>(doc, op, "b");
                if (ie == null || x == null) return "none";
                var g = ie.AMLGroup();
                var res = Str(op, "mode") switch
                {
                    "insert" => T(() => g.Insert(x)),
                    "asFirst" => T(() => g.Insert(x, false)),
                    "seqInsert" => T(() => g.AMLGroupInternalElement.Insert(x)),
                    _ => T(() => g.Import(x, name!)),
                };
                return res + "|" + T(() => g.IsGroup) + "|" + T(() => g.AssociableFacets()) + "|" + T(() => g.AssociableFacetsOfMirrorElements()) + "|" + T(() => g.InternalElement.Count);
            }
            case "groupAssoc":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                if (ie == null) return "none";
                var g = ie.AMLGroup();
                var events = new List<string>();
                g.PropertyChanged += (_, e) => events.Add(e.PropertyName!);
                var res = T(() => { g.AssociatedFacet = name!; return g.AssociatedFacet; });
                return res + "|" + string.Join(",", events);
            }
            case "portInsert":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                if (ie == null) return "none";
                var p = ie.AMLPort();
                var res = Str(op, "mode") switch
                {
                    "insert" => T(() => { var x = Pick<InternalElementType>(doc, op, "b"); return x == null ? "none" : p.Insert(x); }),
                    "import" => T(() => { var x = Pick<InternalElementType>(doc, op, "b"); return x == null ? "none" : p.Import(x, name!); }),
                    _ => T(() => { var x = Pick<AttributeType>(doc, op, "b"); return x == null ? "none" : p.Insert(x); }),
                };
                return res + "|" + T(() => p.IsPort);
            }
            case "newFrame":
            {
                var o = Pick<IObjectWithAttributes>(doc, op, "a");
                if (o == null) return "none";
                var v = op["v"] is JsonArray va ? new FrameValues(va[0]!.GetValue<double>(), va[1]!.GetValue<double>(), va[2]!.GetValue<double>(), va[3]!.GetValue<double>(), va[4]!.GetValue<double>(), va[5]!.GetValue<double>()) : null;
                var fa = Bool(op, "ext") ? o.New_FrameAttribute(v!) : o.AMLAttributes().New_FrameAttribute(v!);
                return D(fa) + "|" + T(() => fa.Frame);
            }
            case "setFrame":
            {
                var at = Pick<AttributeType>(doc, op, "a", x => x.Name == "Frame");
                if (at == null) return "none";
                var fa = new FrameAttributeType(at.Node);
                var value = op["value"]!.GetValue<double>();
                var fv = fa.Frame;
                switch (Str(op, "prop"))
                {
                    case "X": fv.X = value; break;
                    case "Y": fv.Y = value; break;
                    case "Z": fv.Z = value; break;
                    case "Rx": fv.Rx = value; break;
                    case "Ry": fv.Ry = value; break;
                    case "Rz": fv.Rz = value; break;
                    default: fa.Frame = new FrameValues(value, value, value, value, value, value); break;
                }
                return F(fv) + "|" + T(() => fa.Frame);
            }
            case "createFrame":
            {
                var fa = FrameAttributeType.Create(doc, StrN(op, "alias")!);
                var o = Pick<IObjectWithAttributes>(doc, op, "a");
                return D(fa) + "|" + T(() => fa.Frame) + "|" + (o == null ? "none" : T(() => o.Attribute.Insert(fa)));
            }
            case "repairFrame":
            {
                var at = Pick<AttributeType>(doc, op, "a");
                if (at == null) return "none";
                return T(() => FrameAttributeType.ValidateAndRepairFrameDatatypes(at.Node)) + "|" + T(() => FrameAttributeType.IsFrame(at.Node)) + "|" + T(() => FrameAttributeType.IsFrameAttribute(at));
            }
            case "refUri":
            {
                var o = Pick<IObjectWithAttributes>(doc, op, "a");
                if (o == null) return "none";
                var r = o.AMLAttributes().New_RefUriAttribute(StrN(op, "value")!);
                return D(r) + "|" + RefProps(r) + "|" + T(() => r.UriReferencesAreEqual(Str(op, "cmp"))) + "|" + T(() => o.RefURIAttribute());
            }
            case "createRef":
            {
                var o = Pick<IObjectWithAttributes>(doc, op, "a");
                if (Str(op, "kind") == "uri")
                {
                    var r = RefURIAttributeType.Create(doc);
                    r.Value = StrN(op, "value");
                    return D(r) + "|" + RefProps(r) + "|" + (o == null ? "none" : T(() => o.Attribute.Insert(r)) + "|" + T(() => o.RefURIAttribute()));
                }
                var t = RefTypeAttributeType.Create(doc);
                t.Value = StrN(op, "value");
                return D(t) + $"|{T(() => t.IsExplicit())}|{T(() => t.IsImplicit())}|{T(() => t.IsRefTypeAttribute)}|" + (o == null ? "none" : T(() => o.Attribute.Insert(t)) + "|" + T(() => o.RefTypeAttribute()));
            }
            case "makeList":
            {
                var at = Pick<AttributeType>(doc, op, "a");
                if (at == null) return "none";
                return T(() => at.MakeListAttribute(Bool(op, "ordered"))) + "|" + T(() => at.ListItems());
            }
            case "addListItem":
            {
                var at = Pick<AttributeType>(doc, op, "a", x => !Bool(op, "listOnly") || x.IsListAttribute());
                if (at == null) return "none";
                return T(() => { var item = at.AddListItem(StrN(op, "itemType")!, StrN(op, "itemName")!); return item == null ? "null" : D(item) + "|" + item.AttributeDataType; });
            }
            case "convertList":
            {
                var at = Pick<AttributeType>(doc, op, "a");
                if (at == null) return "none";
                return T(() => at.ConvertToListAttribute(StrN(op, "itemName")!)) + "|" + T(() => at.ListItemValues());
            }
            case "createList":
            {
                var o = Pick<IObjectWithAttributes>(doc, op, "a");
                if (o == null) return "none";
                return T(() =>
                {
                    var l = o.CreateListAttribute(name!, op["count"]!.GetValue<int>(), StrN(op, "itemType")!, StrN(op, "itemName")!, Bool(op, "ordered"), StrN(op, "alias")!);
                    return D(l) + "|" + F(l.ListItems()) + "|" + B(l.IsOrderedListAttribute());
                });
            }
            case "setMeta":
            {
                var w = op["w"]!.AsArray();
                if (Bool(op, "ext")) file.SetMetaInformation(W(w, 0)!, W(w, 1)!, W(w, 2)!, W(w, 3)!, W(w, 4)!, W(w, 5)!, W(w, 6)!, W(w, 7)!, W(w, 8)!);
                else file.AMLFile().SetMetaInformation(W(w, 0)!, W(w, 1)!, W(w, 2)!, W(w, 3)!, W(w, 4)!, W(w, 5)!, W(w, 6)!, W(w, 7)!, W(w, 8)!);
                return "ok|" + T(() => file.GetMetaInformation());
            }
            case "setMetaObj":
            {
                var m = Meta(op["w"]!.AsArray());
                if (Bool(op, "ext")) file.SetMetaInformation(m);
                else file.AMLFile().SetMetaInformation(m);
                return "ok|" + T(() => file.GetMetaInformation());
            }
            case "deleteMeta":
                return F(Bool(op, "ext") ? file.DeleteMetaInformation(StrN(op, "id")!) : file.AMLFile().DeleteMetaInformation(StrN(op, "id")!)) + "|" + T(() => file.GetMetaInformation());
            case "replaceMeta":
            {
                var m = Meta(op["w"]!.AsArray());
                return F(Bool(op, "ext") ? file.ReplaceMetaInformation(StrN(op, "id")!, m) : file.AMLFile().ReplaceMetaInformation(StrN(op, "id")!, m)) + "|" + T(() => file.GetMetaInformation());
            }
            case "getMeta":
                return F(Bool(op, "ext") ? file.GetMetaInformation(StrN(op, "id")!) : file.AMLFile().GetMetaInformation(StrN(op, "id")!));
            case "clearMeta":
                if (Bool(op, "ext")) file.ClearMetaInformation();
                else file.AMLFile().ClearMetaInformation();
                return "ok|" + T(() => file.GetMetaInformation());
            case "stdLibMeta":
                if (Bool(op, "ext")) file.SetMetaInformationStandardAutomationMLLibrary();
                else file.AMLFile().SetMetaInformationStandardAutomationMLLibrary();
                return "ok|" + T(() => file.GetMetaInformation());
            case "setSDI":
            {
                var w = op["w"]!.AsArray();
                var dt = Dt(op["dt"]!.AsObject());
                if (Bool(op, "props"))
                {
                    file.AMLFile().SetSourceDocumentInformation(new SourceDocumentInformationType.Properties
                    {
                        OriginName = W(w, 0)!, OriginID = W(w, 1)!, OriginVendor = W(w, 2)!, OriginVendorURL = W(w, 3)!, OriginVersion = W(w, 4)!,
                        OriginRelease = W(w, 5)!, LastWritingDateTime = dt, OriginProjectTitle = W(w, 7)!, OriginProjectID = W(w, 8)!,
                    });
                }
                else if (Bool(op, "ext")) file.SetSourceDocumentInformation(W(w, 0)!, W(w, 1)!, W(w, 2)!, W(w, 3)!, W(w, 4)!, W(w, 5)!, dt, W(w, 7)!, W(w, 8)!);
                else file.AMLFile().SetSourceDocumentInformation(W(w, 0)!, W(w, 1)!, W(w, 2)!, W(w, 3)!, W(w, 4)!, W(w, 5)!, dt, W(w, 7)!, W(w, 8)!);
                return "ok|" + T(() => file.GetMetaInformation());
            }
            case "sdiMeta":
            {
                var sdi = file.SourceDocumentInformation.FirstOrDefault();
                if (sdi == null) return "none";
                sdi.SetMetaInformation(Meta(op["w"]!.AsArray()));
                return "ok|" + T(() => new MetaInformation(sdi));
            }
            case "amlVersion":
            {
                var aml = file.AMLFile();
                var v = StrN(op, "value");
                aml.AutomationMLVersion = v!;
                return $"{T(() => file.AMLFile().AutomationMLVersion)}|{T(() => doc.AutomationMLVersion())}|{T(() => file.AMLFile().IsValidAutomationMLVersion(v!))}";
            }
            case "docVersion":
            {
                var id = StrN(op, "id");
                var version = StrN(op, "version");
                switch (Str(op, "mode"))
                {
                    case "append":
                    {
                        var ok = file.AppendDocumentVersionInformation(id!, version!, out var err);
                        return B(ok) + "|" + err;
                    }
                    case "appendObj":
                    {
                        var ok = file.AppendDocumentVersionInformation(new DocumentVersionInformation { DocumentIdentifier = id!, Version = version! }, out var err);
                        return B(ok) + "|" + err;
                    }
                    case "delete":
                        return F(file.DeleteDocumentVersionInformation(id!));
                    case "get":
                        return F(file.GetDocumentVersionInformation(id!));
                    case "replace":
                    {
                        var dv = new DocumentVersionInformation { DocumentIdentifier = StrN(op, "newId")!, Version = version! };
                        var ok = file.ReplaceDocumentVersionInformation(id!, dv, out var err);
                        return B(ok) + "|" + N(err) + "|" + F(dv);
                    }
                    case "all":
                        return F(file.GetAllDocumentVersionInformation().ToList());
                    case "seqAppend":
                        return F(file.AMLFile().DocumentVersion.Append(new DocumentVersionInformation { DocumentIdentifier = id!, Version = version! }));
                    case "header":
                        return F(file.DocumentVersionsHeader());
                    default:
                        return F(file.AMLFile().DocumentVersion.ToList());
                }
            }
            case "signature":
            {
                var o = Pick<CAEXObject>(doc, op, "a");
                if (o == null) return "none";
                return Str(op, "mode") switch
                {
                    "append" => F(o.AppendSignatureHeader()),
                    "delete" => F(o.DeleteSignature()),
                    "get" => F(o.GetSignatureHeader()),
                    _ => F(o.GetXMLSignature()),
                };
            }
            case "addLanguage":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                if (ie == null) return "none";
                ie.AddLanguage(StrN(op, "value")!);
                return T(() => ie.GetLanguages()) + "|" + T(() => ie.IsDocumentElement());
            }
            case "docElement":
            {
                var suc = Pick<SystemUnitClassType>(doc, op, "a");
                if (suc == null) return "none";
                var path = StrN(op, "path");
                var el = path == null ? suc.AddDocumentElement(name!) : suc.AddDocumentElement(name!, path);
                return D(el) + "|" + T(() => suc.DocumentElements());
            }
            case "docRef":
            {
                var ie = Pick<InternalElementType>(doc, op, "a", x => !Bool(op, "docOnly") || x.IsDocumentElement());
                if (ie == null) return "none";
                var path = StrN(op, "path");
                var rf = path == null ? ie.AddDocumentReference(name!) : ie.AddDocumentReference(name!, path);
                return F(rf);
            }
            case "docRole":
            {
                var ie = Pick<InternalElementType>(doc, op, "a");
                if (ie == null) return "none";
                return F(ie.AddDocumentElementRole(Str(op, "path"))) + "|" + T(() => ie.IsDocumentElement());
            }
            case "makeRole":
            {
                var r = Pick<IObjectWithRoleReference>(doc, op, "a");
                if (r == null) return "none";
                typeof(AutomationMLBaseRoleClassLib).GetMethod(Str(op, "kind"))!.Invoke(null, new object?[] { r, StrN(op, "alias") });
                return D((CAEXWrapper)r) + "|" + T(() => ((CAEXWrapper)r).Node.ToString());
            }
            case "makeIf":
            {
                var ic = Pick<InterfaceClassType>(doc, op, "a");
                if (ic == null) return "none";
                typeof(AutomationMLInterfaceClassLib).GetMethod(Str(op, "kind"))!.Invoke(null, new object?[] { ic, StrN(op, "alias") });
                return D(ic) + "|" + N(ic.RefBaseClassPath);
            }
            case "lib":
                return F(LibLoaders[Str(op, "kind")](doc));
            case "query":
            {
                var w = Pick<CAEXWrapper>(doc, op, "a");
                return w == null ? "none" : Sweep(w);
            }
            default:
                throw new NotSupportedException(Str(op, "op"));
        }
    }

    // ---------------------------------------------------------------- fixed cases

    static IEnumerable<(string, Action<Rec>)> Cases(string inputDir, string corpusDir)
    {
        yield return ("constants", r =>
        {
            var types = new[]
            {
                typeof(AMLFile), typeof(AMLFacet), typeof(AMLGroup), typeof(AMLPort), typeof(FrameAttributeType), typeof(ListAttribute), typeof(RefURIAttributeType),
                typeof(RefTypeAttributeType), typeof(ExternalDataReference), typeof(DocumentVersions), typeof(CAEXSignatureHeader), typeof(AutomationMLBaseAttributeTypeLib),
                typeof(AutomationMLBaseRoleClassLib), typeof(AutomationMLInterfaceClassLib), typeof(AutomationMLLogicInterfaceClassLib), typeof(AutomationMLLogicRoleClassLib),
                typeof(AutomationMLPLCopenXMLInterfaceClassLib), typeof(AutomationMLContainer),
            };
            foreach (var t in types)
                foreach (var f in t.GetFields(BindingFlags.Public | BindingFlags.Static).Where(f => f.FieldType == typeof(string)).OrderBy(f => f.Name, StringComparer.Ordinal))
                    r.Lines.Add($"{t.Name}.{f.Name}={f.GetValue(null)}");
            foreach (var f in typeof(AutomationMLContainer.RelationshipType).GetFields(BindingFlags.Public | BindingFlags.Static).OrderBy(f => f.Name, StringComparer.Ordinal))
            {
                var rt = (AutomationMLContainer.RelationshipType)f.GetValue(null)!;
                r.Lines.Add($"RelationshipType.{f.Name}={rt.Name}|{rt.MimeType}|{rt}");
            }
        });

        yield return ("relationshipType", r =>
        {
            var any = AutomationMLContainer.RelationshipType.GetAnyContent();
            r.V("anyDefault", () => $"{any.Name}|{any.MimeType}");
            r.V("anyMime", () => { var a = AutomationMLContainer.RelationshipType.GetAnyContent("image/png"); return $"{a.Name}|{a.MimeType}"; });
            r.V("anyEmpty", () => { var a = AutomationMLContainer.RelationshipType.GetAnyContent(""); return $"{a.Name}|{a.MimeType}"; });
            r.V("sameInstance", () => ReferenceEquals(any, AutomationMLContainer.RelationshipType.AnyContent));
            var all = new[] { AutomationMLContainer.RelationshipType.AnyContent, AutomationMLContainer.RelationshipType.CAEXSchema, AutomationMLContainer.RelationshipType.Collada, AutomationMLContainer.RelationshipType.ColladaSchema, AutomationMLContainer.RelationshipType.Library, AutomationMLContainer.RelationshipType.PLCopenXml, AutomationMLContainer.RelationshipType.PLCopenXmlSchema, AutomationMLContainer.RelationshipType.Root };
            foreach (var a in all)
                foreach (var b in all)
                    r.V($"cmp:{a.Name!.Substring(a.Name.LastIndexOf('/') + 1)}:{b.Name!.Substring(b.Name.LastIndexOf('/') + 1)}", () => Math.Sign(a.CompareTo(b)));
            r.V("cmpNull", () => any.CompareTo(null!));
        });

        yield return ("classReferenceWithAlias", r =>
        {
            foreach (var c in new[] { "Lib/Class", "", null })
                foreach (var a in new[] { null, "", "Alias", "a@b" })
                    r.V($"ref:{N(c)}:{N(a)}", () => ClassReferenceWithAlias.ClassReference(c!, a!));
        });

        yield return ("frameValues", r =>
        {
            var fv = new FrameValues();
            r.V("default", () => fv);
            var events = new List<string>();
            fv.PropertyChanged += (s, e) => events.Add(e.PropertyName + (ReferenceEquals(s, fv) ? "" : "?"));
            fv.X = 1; fv.Y = 2.5; fv.Z = -3; fv.Rx = 1e-10; fv.Ry = 1e21; fv.Rz = double.NaN;
            r.V("set", () => fv);
            r.V("events", () => events);
            r.V("ctor", () => new FrameValues(1, 2, 3, 4, 5, 6));
            r.V("special", () => new FrameValues(double.PositiveInfinity, double.NegativeInfinity, -0.0, double.Epsilon, double.MaxValue, 0.1 + 0.2));
        });

        foreach (var schema in new[] { "30", "215" })
        {
            CAEXDocument NewDoc() => CAEXDocument.New_CAEXDocument(schema == "30" ? CAEXDocument.CAEXSchema.CAEX3_0 : CAEXDocument.CAEXSchema.CAEX2_15);

            yield return ("frameAttribute" + schema, r =>
            {
                var doc = NewDoc();
                var ih = doc.CAEXFile.InstanceHierarchy.Append("IH");
                var ie = ih.InternalElement.Append("IE");
                r.V("created", () => FrameAttributeType.Create(doc));
                r.V("createdAlias", () => FrameAttributeType.Create(doc, "Base").RefAttributeType);
                var fa = FrameAttributeType.Create(doc);
                r.V("createdXml", () => fa.Node);
                r.V("insert", () => ie.Attribute.Insert(fa));
                r.V("frame", () => fa.Frame);
                var fv = fa.Frame;
                fv.X = 1.25; fv.Rz = -90;
                r.V("afterSet", () => fa.Frame);
                r.V("xml", () => fa.Node);
                r.V("props", () => new object?[] { fa.XAttribute, fa.YAttribute, fa.ZAttribute, fa.RxAttribute, fa.RyAttribute, fa.RzAttribute });
                r.V("isFrame", () => FrameAttributeType.IsFrame(fa.Node));
                r.V("isFrameAttr", () => FrameAttributeType.IsFrameAttribute(fa));
                fa.XAttribute.Unit = null; fa.YAttribute.AttributeDataType = "xs:string"; fa.RxAttribute.Unit = "";
                r.V("repair", () => FrameAttributeType.ValidateAndRepairFrameDatatypes(fa.Node));
                r.V("repair2", () => FrameAttributeType.ValidateAndRepairFrameDatatypes(fa.Node));
                r.V("repairedXml", () => fa.Node);
                r.V("repairOther", () => FrameAttributeType.ValidateAndRepairFrameDatatypes(ie.Node));
                r.V("isFrameIE", () => FrameAttributeType.IsFrame(ie.Node));
                r.V("partial", () => { var p = new FrameAttributeType(ie.Attribute.Append("Frame").Node); return new object?[] { p.Frame, p.XAttribute, FrameAttributeType.IsFrame(p.Node) }; });
                r.V("framePropNull", () => { var p = new FrameAttributeType(ie.Attribute.Append("Frame2").Node); var v = p.Frame; v.X = 5; return new object?[] { p.Frame, p.Node }; });
                r.V("framePropBad", () => { fa.FramePropertyChangedPublic("nope"); return "ok"; });
                r.V("ext", () => ie.New_FrameAttribute());
                r.V("ext2", () => ie.New_FrameAttribute(new FrameValues(9, 8, 7, 6, 5, 4)));
                r.V("frameAttrExt", () => ie.FrameAttribute()?.Frame);
                r.V("owa", () => ie.AMLAttributes().FrameAttribute?.Frame);
                r.V("owaNew", () => ie.AMLAttributes().New_FrameAttribute(new FrameValues(1, 1, 1, 1, 1, 1)).Frame);
                r.Doc("doc", doc);
            });

            yield return ("objects" + schema, r =>
            {
                var doc = NewDoc();
                var file = doc.CAEXFile;
                var ih = file.InstanceHierarchy.Append("IH");
                var suc = ih.InternalElement.Append("Parent");
                suc.Attribute.Append("A1");
                suc.Attribute.Append("A2").Attribute.Append("Sub");
                suc.ExternalInterface.Append("E1");
                suc.ExternalInterface.Append("E2");
                var facet = AMLFacet.Create(doc, "F", "Alias");
                r.V("facetCreated", () => facet.Node);
                r.V("facetIsFacet", () => facet.IsFacet);
                r.V("facetInsert", () => suc.InternalElement.Insert(facet));
                r.V("facetIsFacet2", () => facet.IsFacet);
                r.V("facetIE", () => AMLFacet.InternalElement);
                r.V("facetAppendA1", () => facet.FacetAttribute.Append("A1"));
                r.V("facetAppendA1again", () => facet.FacetAttribute.Append("A1"));
                r.V("facetAppendNo", () => facet.FacetAttribute.Append("Nope"));
                r.V("facetAppend", () => facet.FacetAttribute.Append());
                r.V("facetPrepend", () => facet.FacetAttribute.Prepend());
                r.V("facetInsertA2", () => facet.FacetAttribute.Insert(suc.Attribute["A2"]));
                r.V("facetInsertA2again", () => facet.Insert(suc.Attribute["A2"]));
                r.V("facetInsertForeign", () => facet.Insert(ih.InternalElement.Append("Other").Attribute.Append("X")));
                r.V("facetE1", () => facet.FacetExternalInterface.Append("E1"));
                r.V("facetE2", () => facet.Insert(suc.ExternalInterface["E2"]));
                r.V("facetImportSuc", () => facet.Import(suc, "x"));
                r.V("facetInsertSuc", () => facet.Insert(ih.InternalElement.Append("Moved")));
                r.V("facetInsertNull", () => facet.Insert(null!));
                r.V("facetImportNull", () => facet.Import(null!, "x"));
                r.V("facetInfo", () => FacetInfo(facet));
                r.V("isFacetAttr", () => facet.Attribute.Select(a => a.IsFacetAttribute()).ToList());
                r.V("isFacetIf", () => facet.ExternalInterface.Select(a => a.IsFacetInterface()).ToList());
                r.V("isFacetAttrParent", () => suc.Attribute.Select(a => a.IsFacetAttribute()).ToList());
                r.V("implicit", () => { ObjectWithAMLAttributes o = facet; return o.Attribute.Count; });
                r.V("implicitNull", () => { ObjectWithAMLAttributes o = (AMLFacet)null!; return o; });

                var group = AMLGroup.Create(doc, "G");
                r.V("groupCreated", () => group.Node);
                r.V("groupInsert", () => ih.InternalElement.Insert(group));
                r.V("groupAssoc0", () => group.AssociatedFacet);
                group.AssociatedFacet = "F";
                r.V("groupAssoc1", () => group.AssociatedFacet);
                r.V("groupInsertPlain", () => group.Insert(ih.InternalElement.Append("Plain")));
                r.V("groupInsertMirror", () => group.Insert(suc.CreateMirror()));
                r.V("groupInsertGroup", () => group.Insert(AMLGroup.Create(doc, "G2")));
                r.V("groupInsertAttr", () => group.Insert(new AttributeType(new XElement(doc.CAEXFile.Node.Name.Namespace + "Attribute", new XAttribute("Name", "GA")))));
                r.V("groupImport", () => group.Import(suc, "Imported"));
                r.V("groupImportNull", () => group.Import(null!, "x"));
                r.V("groupInsertNull", () => group.Insert(null!));
                r.V("groupAssociable", () => group.AssociableFacets());
                r.V("groupMirrorFacets", () => group.AssociableFacetsOfMirrorElements());
                r.V("groupIE", () => group.InternalElement.Count);
                r.V("groupSeq", () => group.CAEXSequence(group.InternalElement.First())?.GetType().Name);

                var port = AMLPort.Create(doc, "P", "PortAlias");
                r.V("portCreated", () => port.Node);
                r.V("portIsPort", () => port.IsPort);
                r.V("portIE", () => AMLPort.InternalElement);
                r.V("portInsertIE", () => port.Insert(ih.InternalElement.Append("X")));
                r.V("portImportIE", () => port.Import(suc, "Y"));
                r.V("portInsertAttr", () => port.Insert(new AttributeType(new XElement(doc.CAEXFile.Node.Name.Namespace + "Attribute", new XAttribute("Name", "PA")))));
                r.V("portInsertNull", () => port.Insert(null!));

                var asc = suc.AMLSystemUnitClass();
                r.V("ascType", () => asc?.GetType().Name);
                r.V("ascFacet", () => asc!.AddFacet("F2"));
                r.V("ascGroup", () => asc!.AddGroup("G3"));
                r.V("ascPort", () => asc!.AddPort("P2"));
                r.V("ascLists", () => new object?[] { asc!.AMLFacets, asc.AMLGroups, asc.AMLPorts });
                r.V("ascCtor", () => new AMLSystemUnitClass(suc).AMLFacets);
                var lib = file.SystemUnitClassLib.Append("SUCL");
                var cls = lib.SystemUnitClass.Append("C");
                r.V("ascFamily", () => cls.AMLSystemUnitClass()?.GetType().Name);
                r.V("ascFamilyFacet", () => cls.AMLSystemUnitClass()!.AddFacet("CF"));
                r.V("ascNull", () => ((SystemUnitClassType)null!).AMLSystemUnitClass());

                r.V("isAMLObject", () => new object?[] { suc.IsAMLObject(), facet.IsAMLObject(), port.IsAMLObject(), port.RoleRequirements.First().ExternalInterface.First().IsAMLObject(), ih.IsAMLObject(), file.IsAMLObject() });
                r.V("extWrappers", () => new object?[] { suc.AMLFacet(), suc.AMLGroup(), suc.AMLPort(), ((InternalElementType)null!).AMLFacet(), file.AMLFile() });
                r.V("refType", () => { var t = RefTypeAttributeType.Create(doc); t.Value = "explicit"; return new object?[] { t, t.IsExplicit(), t.IsImplicit(), t.IsRefTypeAttribute, RefTypeAttributeType.REF_TYPE_ATTRIBUTE, t.Node }; });
                r.V("refUri", () => { var t = RefURIAttributeType.Create(doc); t.TheUri = new Uri("http://x/a b#c"); return new object?[] { t.Value, RefProps(t), t.Node }; });
                r.V("refUriNull", () => { var t = RefURIAttributeType.Create(doc); t.TheUri = null; return t.Value; });
                r.V("owa", () => { var o = suc.AMLAttributes(); return new object?[] { o.CAEXBase is InternalElementType, o.Attribute.Count, o.AttributeAndDescendants.Count(), o.New_RefUriAttribute("a.aml").Value, o.New_RefUriAttribute("b.aml").Value, o.RefURIAttribute?.Value, o.RefTypeAttribute }; });
                r.V("owaRR", () => { var o = port.RoleRequirements.First().AMLAttributes(); return o.Attribute?.Count; });
                r.V("owaNull", () => ((IObjectWithAttributes)null!).AMLAttributes());
                r.Doc("doc", doc);
            });

            yield return ("meta" + schema, r =>
            {
                var doc = NewDoc();
                var file = doc.CAEXFile;
                var aml = file.AMLFile();
                r.V("initial", () => aml.GetMetaInformation());
                r.V("getEmpty", () => aml.GetMetaInformation(""));
                r.V("getNull", () => aml.GetMetaInformation(null!));
                aml.SetMetaInformation("N", "ID1", "V", "U", "1", "2", "2020-01-02T03:04:05", "T", "P");
                r.V("afterSet", () => aml.GetMetaInformation());
                aml.SetMetaInformation("N2", "ID1", "V2", null!, null!, null!, "2020-02-02T00:00:00", null!, null!);
                r.V("afterReplace", () => aml.GetMetaInformation());
                // For CAEX 3.0 a null date is DateTime.MinValue, written with the local offset: known system layer deviation (local time before 1996), so 2.15 only.
                if (schema == "215") r.V("nullDate", () => { aml.SetMetaInformation("N5", "ID5", "V5", null!, null!, null!, null!, null!, null!); return aml.GetMetaInformation("ID5"); });
                r.V("setNoId", () => { aml.SetMetaInformation("N3", "", "V", "U", "1", "2", "2020-01-02", "T", "P"); return aml.GetMetaInformation(); });
                r.V("setBadDate", () => { aml.SetMetaInformation("N4", "ID4", "V", "U", "1", "2", "not a date", "T", "P"); return aml.GetMetaInformation(); });
                r.V("setObjNull", () => { aml.SetMetaInformation((MetaInformation)null!); return "ok"; });
                r.V("replaceMissing", () => aml.ReplaceMetaInformation("missing", new MetaInformation { WriterID = "X", LastWritingDateTime = "2020-01-01T00:00:00Z" }));
                r.V("replaceEmpty", () => aml.ReplaceMetaInformation("", new MetaInformation { WriterID = "Y", LastWritingDateTime = "2020-01-01T00:00:00Z" }));
                r.V("replace", () => aml.ReplaceMetaInformation("ID1", new MetaInformation { WriterID = "ID1b", WriterName = "renamed", LastWritingDateTime = "2020-01-01T00:00:00+05:00" }));
                r.V("afterReplace2", () => aml.GetMetaInformation());
                r.V("delete", () => aml.DeleteMetaInformation("ID1b"));
                r.V("deleteMissing", () => aml.DeleteMetaInformation("missing"));
                r.V("sdi", () => { aml.SetSourceDocumentInformation("O", "OID", "V", "U", "1", "2", new DateTime(2020, 5, 6, 7, 8, 9, DateTimeKind.Utc), "T", "P"); return aml.GetMetaInformation(); });
                r.V("sdiNoId", () => { aml.SetSourceDocumentInformation("O", null!, "V", "U", "1", "2", DateTime.MinValue, "T", "P"); return "ok"; });
                r.V("sdiProps", () => { aml.SetSourceDocumentInformation(new SourceDocumentInformationType.Properties { OriginID = "PID", OriginName = "PN", LastWritingDateTime = new DateTime(2001, 2, 3) }); return aml.GetMetaInformation(); });
                r.V("sdiPropsAgain", () => { aml.SetSourceDocumentInformation(new SourceDocumentInformationType.Properties { OriginID = "PID", OriginName = "PN2", LastWritingDateTime = new DateTime(2001, 2, 4, 0, 0, 0, DateTimeKind.Local) }); return aml.GetMetaInformation(); });
                r.V("sdiPropsNoId", () => { aml.SetSourceDocumentInformation(new SourceDocumentInformationType.Properties { OriginName = "x" }); return "ok"; });
                r.V("sdiPropsNull", () => { aml.SetSourceDocumentInformation((SourceDocumentInformationType.Properties)null!); return "ok"; });
                r.V("writerHeader", () => aml.WriterHeader);
                r.V("stdLib", () => { aml.SetMetaInformationStandardAutomationMLLibrary(); return aml.GetMetaInformation(); });
                r.Doc("docStd", doc);
                r.V("clear", () => { aml.ClearMetaInformation(); return aml.GetMetaInformation(); });
                r.V("newMeta", () => new MetaInformation());
                r.V("metaFromXml", () => new MetaInformation(XElement.Parse("<WriterHeader><WriterName>n</WriterName><WriterID>i</WriterID><Other>o</Other><WriterRelease/><LastWritingDateTime>x</LastWritingDateTime></WriterHeader>")));
                r.V("metaFromXmlNs", () => new MetaInformation(XElement.Parse("<WriterHeader xmlns='http://www.dke.de/CAEX'><WriterName>n</WriterName></WriterHeader>")));
                r.V("metaFromSdi", () => { var s = file.SourceDocumentInformation.FirstOrDefault(); return s == null ? "none" : new MetaInformation(s); });
                r.V("sdiSetMeta", () => { var s = file.SourceDocumentInformation.Append(); s.SetMetaInformation(new MetaInformation { WriterID = "S", LastWritingDateTime = "2020-01-01T10:00:00+01:00" }); return s.Node; });
                r.V("sdiSetMetaBad", () => { var s = file.SourceDocumentInformation.Append(); s.SetMetaInformation(new MetaInformation { WriterID = "S", LastWritingDateTime = "bad" }); return s.Node; });
                r.V("sdiSetMetaNull2", () => { file.SourceDocumentInformation.Append().SetMetaInformation(null!); return "ok"; });
                r.Doc("doc", doc);
            });

            yield return ("amlVersion" + schema, r =>
            {
                var doc = NewDoc();
                var aml = doc.CAEXFile.AMLFile();
                r.V("initial", () => aml.AutomationMLVersion);
                r.V("max", () => aml.MaximalAMLVersion);
                foreach (var v in new[] { "2.0", "1.5", "3.0", "x", "", null, "2.1", "2.0.1.2", "2.10" })
                {
                    r.V("set:" + N(v), () => { aml.AutomationMLVersion = v!; return aml.AutomationMLVersion; });
                    r.V("setDoc:" + N(v), () => doc.AutomationMLVersion());
                }
                foreach (var v in ValidVersions.Append(null)) r.V("valid:" + N(v), () => aml.IsValidAutomationMLVersion(v!));
                r.Doc("doc", doc);
                if (schema == "30")
                {
                    r.V("superior", () => { doc.CAEXFile.SuperiorStandardVersion.Append("AutomationML"); return aml.AutomationMLVersion; });
                    r.V("superiorOther", () => { var d2 = NewDoc(); d2.CAEXFile.SuperiorStandardVersion.Remove(); d2.CAEXFile.SuperiorStandardVersion.Append("Other 1.0"); return d2.CAEXFile.AMLFile().AutomationMLVersion; });
                }
                r.V("nullFile", () => ((CAEXFileType)null!).AutomationMLVersion());
                r.V("statics", () =>
                {
                    var ns = doc.CAEXFile.Node.Name.Namespace;
                    var els = new[]
                    {
                        new XElement(ns + "AdditionalInformation", new XAttribute("AutomationMLVersion", "2.0")),
                        new XElement(ns + "AdditionalInformation", new XAttribute("DocumentVersions", "x")),
                        new XElement(ns + "AdditionalInformation", new XElement(ns + "WriterHeader")),
                        new XElement(ns + "AdditionalInformation", new XElement("WriterHeader")),
                        new XElement(ns + "AdditionalInformation"),
                        new XElement(ns + "Other", new XAttribute("AutomationMLVersion", "2.0")),
                        new XElement("AdditionalInformation", new XAttribute("DocumentVersions", "x")),
                    };
                    return els.Select(e => $"{B(AMLFile.IsAutomationMLVersion(e))}{B(AMLFile.IsDocumentVersion(e))}{B(aml.IsWriterHeader(e))}{B(aml.IsGenericAdditionalInformation(e))}").ToList();
                });
            });

            yield return ("docVersions" + schema, r =>
            {
                var doc = NewDoc();
                var file = doc.CAEXFile;
                r.V("header0", () => file.DocumentVersionsHeader());
                r.V("get0", () => file.GetDocumentVersionInformation("X"));
                r.V("all0", () => file.GetAllDocumentVersionInformation().ToList());
                r.V("seq0", () => file.AMLFile().DocumentVersion.ToList());
                foreach (var v in new[] { "1.0", null, "", "1", "1.2.3.4.5", "a.b", "-1.2", "1.99999999999", " 2.0 ", "1.0.0" })
                    r.V("append:" + N(v), () => { var ok = file.AppendDocumentVersionInformation("D", v!, out var err); return B(ok) + "|" + err; });
                r.V("appendNoId", () => { var ok = file.AppendDocumentVersionInformation("", "1.0", out var err); return B(ok) + "|" + err; });
                r.V("appendNullFile", () => { var ok = ((CAEXFileType)null!).AppendDocumentVersionInformation("D", "1.0", out var err); return B(ok) + "|" + err; });
                r.V("appendObj", () => { var ok = file.AppendDocumentVersionInformation(new DocumentVersionInformation(), out var err); return B(ok) + "|" + err; });
                r.V("appendE", () => { var ok = file.AppendDocumentVersionInformation("E", "2.0", out var err); return B(ok) + "|" + err; });
                r.V("all1", () => file.GetAllDocumentVersionInformation().ToList());
                r.V("seq1", () => file.AMLFile().DocumentVersion.ToList());
                r.V("get", () => file.GetDocumentVersionInformation("E"));
                r.V("getEmpty", () => file.GetDocumentVersionInformation(""));
                r.V("delete", () => file.DeleteDocumentVersionInformation("D"));
                r.V("deleteMissing", () => file.DeleteDocumentVersionInformation("D"));
                r.V("deleteEmpty", () => file.DeleteDocumentVersionInformation(null!));
                r.V("deleteNullFile", () => ((CAEXFileType)null!).DeleteDocumentVersionInformation("D"));
                r.V("replace", () => { var ok = file.ReplaceDocumentVersionInformation("E", new DocumentVersionInformation { DocumentIdentifier = "", Version = "3.0" }, out var err); return B(ok) + "|" + err; });
                r.V("replaceMissing", () => { var ok = file.ReplaceDocumentVersionInformation("Q", new DocumentVersionInformation { DocumentIdentifier = "Q2", Version = "3.0" }, out var err); return B(ok) + "|" + err; });
                r.V("replaceBadVersion", () => { var ok = file.ReplaceDocumentVersionInformation("E", new DocumentVersionInformation { DocumentIdentifier = "E", Version = "bad" }, out var err); return B(ok) + "|" + err; });
                r.V("replaceNoOld", () => { var ok = file.ReplaceDocumentVersionInformation("", new DocumentVersionInformation(), out var err); return B(ok) + "|" + err; });
                r.V("replaceNull", () => { var ok = file.ReplaceDocumentVersionInformation("E", null!, out var err); return B(ok) + "|" + err; });
                r.V("seqAppend", () => file.AMLFile().DocumentVersion.Append(new DocumentVersionInformation { DocumentIdentifier = null!, Version = null! }));
                r.V("all2", () => file.GetAllDocumentVersionInformation().ToList());
                r.V("header", () => file.DocumentVersionsHeader());
                r.V("create", () => file.CreateDocumentVersionsHeader());
                r.V("headerAfterCreate", () => file.DocumentVersionsHeader());
                r.V("dviDefault", () => new DocumentVersionInformation());
                r.V("dviXml", () => new object?[]
                {
                    new DocumentVersionInformation(XElement.Parse("<AdditionalInformation><Document DocumentIdentifier='a' Version='2'/></AdditionalInformation>")),
                    new DocumentVersionInformation(XElement.Parse("<AdditionalInformation/>")),
                    new DocumentVersionInformation(XElement.Parse("<Document/>")),
                    new DocumentVersionInformation(XElement.Parse("<Document DocumentIdentifier='x'/>")),
                });
                r.V("nullHeader", () => ((CAEXFileType)null!).DocumentVersionsHeader());
                r.V("nullAll", () => ((CAEXFileType)null!).GetAllDocumentVersionInformation().ToList());
                r.V("nullGet", () => ((CAEXFileType)null!).GetDocumentVersionInformation("x"));
                r.Doc("doc", doc);
            });

            yield return ("listAttributes" + schema, r =>
            {
                var doc = NewDoc();
                var ie = doc.CAEXFile.InstanceHierarchy.Append("IH").InternalElement.Append("IE");
                var plain = ie.Attribute.Append("Plain");
                plain.AttributeDataType = "xs:int";
                plain.Value = "5";
                r.V("isList0", () => plain.IsListAttribute());
                r.V("items0", () => plain.ListItems());
                r.V("values0", () => plain.ListItemValues());
                r.V("addItem0", () => plain.AddListItem());
                r.V("convert", () => plain.ConvertToListAttribute());
                r.V("convertAgain", () => plain.ConvertToListAttribute());
                r.V("xml1", () => plain.Node);
                r.V("add1", () => plain.AddListItem("xs:string", "other"));
                r.V("add2", () => plain.AddListItem("", ""));
                r.V("add3", () => plain.AddListItem(null!, null!));
                r.V("values1", () => plain.ListItemValues());
                var ordered = ie.Attribute.Append("Ordered");
                r.V("makeOrdered", () => ordered.MakeListAttribute(true));
                r.V("makeOrderedAgain", () => ordered.MakeListAttribute());
                r.V("orderedAdd", () => ordered.AddListItem("xs:double", "ignored"));
                r.V("orderedAdd2", () => ordered.AddListItem());
                r.V("orderedFlags", () => $"{B(ordered.IsListAttribute())}{B(ordered.IsOrderedListAttribute())}{B(ordered.IsUnOrderedListAttribute())}");
                var withChild = ie.Attribute.Append("WithChild");
                withChild.Attribute.Append("c");
                r.V("makeWithChild", () => withChild.MakeListAttribute());
                r.V("create", () => ie.CreateListAttribute("L", 3, "xs:int"));
                r.V("createOrdered", () => ie.CreateListAttribute("O", 2, "xs:string", "ignored", true, "Alias"));
                r.V("createZero", () => ie.CreateListAttribute("Z", 0, null!, null!, false, ""));
                r.V("createXml", () => ie.Attribute["O"].Node);
                r.V("nested", () => { var l = ie.Attribute["L"]; l.Attribute.Append("nestedList").MakeListAttribute(); return l.ListItemValues(); });
                r.V("langs", () => { ie.AddLanguage("en"); ie.AddLanguage("de"); ie.AddLanguage(null!); return ie.Attribute["aml-DocLang"].Node; });
                r.V("langsGet", () => ie.GetLanguages());
                r.V("langNull", () => { ((InternalElementType)null!).AddLanguage("x"); return "ok"; });
                r.V("getLangNull", () => ((InternalElementType)null!).GetLanguages());
                r.Doc("doc", doc);
            });

            yield return ("signature" + schema, r =>
            {
                var doc = NewDoc();
                var ie = doc.CAEXFile.InstanceHierarchy.Append("IH").InternalElement.Append("IE");
                r.V("get0", () => ie.GetSignatureHeader());
                r.V("xml0", () => ie.GetXMLSignature());
                r.V("append", () => ie.AppendSignatureHeader());
                r.V("fill", () => { ie.GetSignatureHeader()!.Add(new XElement("Content", "abc")); return ie.GetSignatureHeader(); });
                r.V("appendAgain", () => ie.AppendSignatureHeader());
                r.V("xmlBad", () => { ie.GetSignatureHeader()!.Add("\t<not-xml\r\n"); return ie.GetXMLSignature(); });
                r.V("delete", () => ie.DeleteSignature());
                r.V("deleteAgain", () => ie.DeleteSignature());
                r.V("deleteNull", () => ((CAEXObject)null!).DeleteSignature());
                r.V("appendNull", () => ((CAEXObject)null!).AppendSignatureHeader());
                r.V("ihSig", () => doc.CAEXFile.InstanceHierarchy.First().AppendSignatureHeader());
                r.V("ihSig2", () => doc.CAEXFile.InstanceHierarchy.First().GetSignatureHeader());
                r.Doc("doc", doc);
            });

            yield return ("externalData" + schema, r =>
            {
                var doc = NewDoc();
                var file = doc.CAEXFile;
                var ie = file.InstanceHierarchy.Append("IH").InternalElement.Append("IE");
                r.V("isDocEl0", () => ie.IsDocumentElement());
                r.V("docEls0", () => ie.DocumentElements());
                r.V("bprRole0", () => file.AutomationMLBPRRoleClassLib());
                r.V("bprIf0", () => file.AutomationMLBPRInterfaceClassLib());
                r.V("docEl", () => ie.AddDocumentElement("Doc"));
                r.Doc("afterDocEl", doc);
                r.V("docElOther", () => ie.AddDocumentElement("Doc2", "Nope/Nope"));
                r.V("docEls", () => ie.DocumentElements());
                var d = ie.InternalElement.FirstOrDefault();
                if (d != null)
                {
                    r.V("isDocEl", () => d.IsDocumentElement());
                    r.V("docRef", () => d.AddDocumentReference("Ref"));
                    r.V("docRefOther", () => d.AddDocumentReference("Ref2", "Nope/Nope"));
                    r.V("docRefStd", () => d.AddDocumentReference("Ref3", "AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector/ExternalDataReference"));
                    r.V("lang", () => { d.AddLanguage("en-US"); d.AddLanguage("de-DE"); return d.GetLanguages(); });
                }
                r.V("docRefNotDoc", () => ie.AddDocumentReference("R"));
                r.V("docRole", () => ie.AddDocumentElementRole("AutomationMLBPRRoleClassLib/ExternalData"));
                r.V("docRoleOther", () => ie.AddDocumentElementRole("Nope"));
                r.V("docRoleDetached", () => doc.Create<InternalElementType>().AddDocumentElementRole("X"));
                r.V("edrIf", () => file.ExternalDataReferenceInterfaceClass());
                r.V("edRole", () => file.ExternalDataRoleClass());
                r.V("edIfLib", () => file.AutomationMLBPRInterfaceClassLib()?.ExternalDataReferenceInterfaceClass());
                r.V("edRoleLib", () => file.AutomationMLBPRRoleClassLib()?.ExternalDataRoleClass());
                r.V("edIfNull", () => ((InterfaceClassLibType)null!).ExternalDataReferenceInterfaceClass());
                r.V("edRoleNull", () => ((RoleClassLibType)null!).ExternalDataRoleClass());
                r.V("edRoleEmptyLib", () => file.RoleClassLib.Append("Empty").ExternalDataRoleClass());
                r.V("edIfEmptyLib", () => file.InterfaceClassLib.Append("Empty").ExternalDataReferenceInterfaceClass());
                r.V("addLibsNull", () => { ((CAEXFileType)null!).AddExternalDataReferenceLibraries(); return "ok"; });
                r.V("addRoleNull", () => { ((CAEXFileType)null!).AddAutomationMLBPRRoleClassLib(); return "ok"; });
                r.V("bprNull", () => ((CAEXFileType)null!).AutomationMLBPRRoleClassLib());
                r.V("bprIfNull", () => ((CAEXFileType)null!).AutomationMLBPRInterfaceClassLib());
                r.V("docElsNull", () => ((SystemUnitClassType)null!).DocumentElements());
                r.V("libs", () => file.RoleClassLib.Select(l => l.Name).Concat(file.InterfaceClassLib.Select(l => l.Name)).ToList());
                r.Doc("doc", doc);
            });

            yield return ("libraries" + schema, r =>
            {
                foreach (var amlVersion in new[] { "default", "2.0", "2.1", "1.0", "3.0" })
                {
                    foreach (var kind in LibLoaders.Keys)
                    {
                        var doc = NewDoc();
                        if (amlVersion != "default")
                        {
                            if (schema == "30") { doc.CAEXFile.SuperiorStandardVersion.Remove(); doc.CAEXFile.SuperiorStandardVersion.Append("AutomationML " + amlVersion); }
                            else doc.CAEXFile.AMLFile().AutomationMLVersion = amlVersion;
                        }
                        r.V($"{amlVersion}:{kind}:version", () => doc.AutomationMLVersion());
                        r.V($"{amlVersion}:{kind}", () => LibLoaders[kind](doc));
                        r.V($"{amlVersion}:{kind}:again", () => LibLoaders[kind](doc));
                        r.V($"{amlVersion}:{kind}:hash", () => Hash(r.C.Apply(SaveString(doc))));
                    }
                }
                var all = NewDoc();
                foreach (var kind in LibLoaders.Keys) r.V("all:" + kind, () => LibLoaders[kind](all));
                r.Doc("all", all);
                r.V("classes", () => AutomationMLBaseRoleClassLibType.RoleClassLib(all).AutomationMLClass("AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Structure/ProductStructure"));
                r.V("classMissing", () => AutomationMLBaseRoleClassLibType.RoleClassLib(all).AutomationMLClass("Nope"));
                r.V("isLoadedNull", () => $"{B(AutomationMLBaseRoleClassLibType.IsLoaded(null!))}{B(AutomationMLInterfaceClassLibType.IsLoaded(null!))}{B(AutomationMLBaseAttributeTypeLibType.IsLoaded(null!))}{B(AutomationMLLogicInterfaceClassLibType.IsLoaded(null!))}{B(AutomationMLPLCopenXMLInterfaceClassLibType.IsLoaded(null!))}");
                r.V("loadNull", () => AutomationMLBaseRoleClassLibType.RoleClassLib(null!));
                // Existing library with the same name: returned as is.
                var own = NewDoc();
                own.CAEXFile.RoleClassLib.Append("AutomationMLBaseRoleClassLib").RoleClass.Append("Mine");
                r.V("existing", () => { var l = AutomationMLBaseRoleClassLibType.RoleClassLib(own); return new object?[] { l, l.RoleClass.Count, l.Facet, l.AutomationMLClass("AutomationMLBaseRoleClassLib/Mine") }; });
                // Derived checks with the libraries loaded.
                var ie = all.CAEXFile.InstanceHierarchy.Append("IH").InternalElement.Append("IE");
                foreach (var m in new[] { "MakeFacet", "MakeGroup", "MakePort", "MakeProductStructure", "MakeStructure" })
                {
                    var rr = ie.RoleRequirements.Append();
                    typeof(AutomationMLBaseRoleClassLib).GetMethod(m)!.Invoke(null, new object?[] { rr, null });
                    r.V("derived:" + m, () => Sweep(rr));
                }
                r.V("ieSweep", () => Sweep(ie));
                foreach (var m in new[] { "MakeSignalInterface", "MakeCOLLADAInterface", "MakePLCopenXMLInterface", "MakeExternalDataConnector" })
                {
                    var ei = ie.ExternalInterface.Append(m);
                    typeof(AutomationMLInterfaceClassLib).GetMethod(m)!.Invoke(null, new object?[] { ei, "" });
                    r.V("derivedIf:" + m, () => Sweep(ei));
                }
                if (schema == "30")
                {
                    foreach (var p in new[] { "Frame", "ListType", "OrderedListType", "refURI", "MIMEType", "Cardinality", "Direction", "DocLang" })
                    {
                        var at = ie.Attribute.Append("at" + p);
                        at.RefAttributeType = "AutomationMLBaseAttributeTypeLib/" + p;
                        r.V("derivedAttr:" + p, () => Sweep(at));
                    }
                }
            });

            yield return ("nullArgs" + schema, r =>
            {
                r.V("amlAttributes", () => ((IObjectWithAttributes)null!).AMLAttributes());
                r.V("frameAttribute", () => ((IObjectWithAttributes)null!).FrameAttribute());
                r.V("newFrame", () => ((IObjectWithAttributes)null!).New_FrameAttribute());
                r.V("refTypeAttr", () => ((IObjectWithAttributes)null!).RefTypeAttribute());
                r.V("refUriAttr", () => ((IObjectWithAttributes)null!).RefURIAttribute());
                r.V("amlFile", () => ((CAEXFileType)null!).AMLFile());
                r.V("amlFacet", () => ((InternalElementType)null!).AMLFacet());
                r.V("amlGroup", () => ((InternalElementType)null!).AMLGroup());
                r.V("amlPort", () => ((InternalElementType)null!).AMLPort());
                r.V("clearMeta", () => { ((CAEXFileType)null!).ClearMetaInformation(); return "ok"; });
                r.V("deleteMeta", () => ((CAEXFileType)null!).DeleteMetaInformation("x"));
                r.V("getMeta", () => ((CAEXFileType)null!).GetMetaInformation());
                r.V("getMetaId", () => ((CAEXFileType)null!).GetMetaInformation("x"));
                r.V("replaceMeta", () => ((CAEXFileType)null!).ReplaceMetaInformation("x", new MetaInformation()));
                r.V("setMeta", () => { ((CAEXFileType)null!).SetMetaInformation(new MetaInformation()); return "ok"; });
                r.V("setMeta9", () => { ((CAEXFileType)null!).SetMetaInformation("a", "b", "c", "d", "e", "f", "g", "h", "i"); return "ok"; });
                r.V("setStd", () => { ((CAEXFileType)null!).SetMetaInformationStandardAutomationMLLibrary(); return "ok"; });
                r.V("setSdi", () => { ((CAEXFileType)null!).SetSourceDocumentInformation("a", "b", "c", "d", "e", "f", DateTime.MinValue, "h", "i"); return "ok"; });
                r.V("isFacetAttr", () => ((AttributeType)null!).IsFacetAttribute());
                r.V("isFacetIf", () => ((ExternalInterfaceType)null!).IsFacetInterface());
                r.V("isRefType", () => ((AttributeType)null!).IsRefTypeAttribute());
                r.V("isRefUri", () => ((AttributeType)null!).IsRefURIAttribute());
                r.V("toRefType", () => ((AttributeType)null!).ToRefTypeAttribute());
                r.V("toRefUri", () => ((AttributeType)null!).ToRefURIAttribute());
                r.V("isAMLObject", () => ((ICAEXWrapper)null!).IsAMLObject());
                r.V("isAMLFacet", () => ((InternalElementType)null!).IsAMLFacet());
                r.V("isList", () => ((AttributeType)null!).IsListAttribute());
                r.V("sigGet", () => ((CAEXObject)null!).GetSignatureHeader());
                // Detached objects (created, not inserted).
                var doc = NewDoc();
                var detached = doc.Create<AttributeType>();
                r.V("detachedFacetAttr", () => detached.IsFacetAttribute());
                var dIe = doc.Create<InternalElementType>();
                r.V("detachedFacet", () => FacetInfo(dIe.AMLFacet()));
                r.V("detachedFacetAppend", () => dIe.AMLFacet().FacetAttribute.Append("x"));
                r.V("detachedDocRef", () => dIe.AddDocumentReference("x"));
                r.V("detachedSweep", () => Sweep(dIe));
                r.V("detachedGroupInsert", () => dIe.AMLGroup().Insert(doc.Create<InternalElementType>()));
            });
        }

        yield return ("amlLibraries", r =>
        {
            var names = new[] { "AutomationMLBaseRoleClassLib", "AutomationMLInterfaceClassLib", "AutomationMLBaseAttributeTypeLib", "AutomationMLLogicInterfaceClassLib", "AutomationMLLogicRoleClassLib", "AutomationMLPLCopenXMLInterfaceClassLib", "AutomationMLBPRInterfaceClassLib", "AutomationMLBPRRoleClassLib", "AutomationMLCSRoleClassLib", "Nope", "", null };
            var amls = new[] { "2.0", "2.1", "2.2", "1.0", "3.0", "", null, "AutomationML 2.1", "2", "2.0.0" };
            var caexs = new[] { "2.15", "3.0", "", null, "4.0", "3" };
            string H(Func<Stream?> f)
            {
                try { var s = f(); return s == null ? "null" : HashBytes(ReadAll(s)); }
                catch (Exception e) { return Ex(e); }
            }
            foreach (var n in names)
                foreach (var a in amls)
                    foreach (var c in caexs)
                        r.Lines.Add($"{N(n)}|{N(a)}|{N(c)}={H(() => AMLLibraries.GetAutomationMLLibrary(n!, a!, c!))}");
            foreach (var a in amls)
                foreach (var c in caexs)
                {
                    r.Lines.Add($"obsolete|{N(a)}|{N(c)}=" + string.Join(",", new[]
                    {
                        H(() => AMLLibraries.AutomationMLBaseRoleClassLib(a!, c!)),
                        H(() => AMLLibraries.AutomationMLInterfaceClassLib(a!, c!)),
                        H(() => AMLLibraries.AutomationMLBaseAttributeTypeLib(a!, c!)),
                        H(() => AMLLibraries.AutomationMLBPRInterfaceClassLib(a!, c!)),
                        H(() => AMLLibraries.AutomationMLBPRRoleClassLib(a!, c!)),
                    }));
                }
        });

        yield return ("corpusFacets", r =>
        {
            // Facet sequences on facets of a real document (13_Facet.aml, CAEX 3.0 with base libraries added).
            var doc = CAEXDocument.LoadFromString(File.ReadAllText(Path.Combine(corpusDir, "13_Facet.aml"), Encoding.UTF8));
            var ie = doc.CAEXFile.InstanceHierarchy.First().InternalElement.First();
            foreach (var f in ie.InternalElement.ToList())
            {
                var facet = f.AMLFacet();
                r.V("info:" + f.Name, () => FacetInfo(facet));
                r.V("appendNoise:" + f.Name, () => facet.FacetAttribute.Append("Noise"));
                r.V("appendPower:" + f.Name, () => facet.FacetAttribute.Append("PowerSupply"));
                r.V("insertWeight:" + f.Name, () => facet.FacetAttribute.Insert(ie.Attribute["maxTransportationWeight"]));
                r.V("info2:" + f.Name, () => FacetInfo(facet));
            }
            r.V("roles", () => AutomationMLBaseRoleClassLibType.RoleClassLib(doc));
            foreach (var f in ie.InternalElement.ToList()) r.V("sweep:" + f.Name, () => Sweep(f));
            r.Doc("doc", doc);
        });
    }

    // ---------------------------------------------------------------- MIME types

    static void MimeCases(Rec r)
    {
        r.V("xml", () => MimeTypeMap.GetMimeType(".xml"));
        var mappings = (IDictionary<string, List<string>>)typeof(MimeTypeMap).Assembly.GetType("Aml.Engine.AmlObjects.MimeType.MappingList")!
            .GetField("Mappings", BindingFlags.NonPublic | BindingFlags.Static)!.GetValue(null)!;
        var keys = mappings.Keys.ToList();
        r.Lines.Add("count=" + keys.Count);
        foreach (var k in keys)
            r.Lines.Add($"{k}={F(MimeTypeMap.GetMimeType(k))}|{F(MimeTypeMap.GetExtension(k))}|{T(() => MimeTypeMap.IsXmlText(k))}|{T(() => MimeTypeMap.GetKnownExtensions(k).ToList())}");
        foreach (var e in new[] { null, "", " ", "xml", "XML", ".XmL", "aml", ".aml", "amlx", "unknown", ".", "..xml", "dae", "svg", ".xsd", "png", "tar.gz", "\t" })
        {
            r.V("mime:" + N(e), () => MimeTypeMap.GetMimeType(e!));
            r.V("isXml:" + N(e), () => MimeTypeMap.IsXmlText(e!));
        }
        foreach (var m in new[] { null, "", " ", "text/xml", "TEXT/XML", "Text/Xml", "application/x-any", "image/png", "nope/nope", "model/vnd.collada+xml" })
        {
            r.V("ext:" + N(m), () => MimeTypeMap.GetExtension(m!));
            r.V("known:" + N(m), () => MimeTypeMap.GetKnownExtensions(m!).ToList());
        }
        r.V("liveList", () => ReferenceEquals(MimeTypeMap.GetMimeType(".xml"), MimeTypeMap.GetMimeType("XML")));
    }

    // ---------------------------------------------------------------- AMLX

    static readonly (string Name, AutomationMLContainer.RelationshipType Type)[] RelTypes =
    {
        ("AnyContent", AutomationMLContainer.RelationshipType.AnyContent),
        ("CAEXSchema", AutomationMLContainer.RelationshipType.CAEXSchema),
        ("Collada", AutomationMLContainer.RelationshipType.Collada),
        ("ColladaSchema", AutomationMLContainer.RelationshipType.ColladaSchema),
        ("Library", AutomationMLContainer.RelationshipType.Library),
        ("PLCopenXml", AutomationMLContainer.RelationshipType.PLCopenXml),
        ("PLCopenXmlSchema", AutomationMLContainer.RelationshipType.PLCopenXmlSchema),
        ("Root", AutomationMLContainer.RelationshipType.Root),
    };

    static Uri U(string s) => new(s, UriKind.Relative);

    static string PartContent(PackagePart p)
    {
        using var s = p.GetStream(FileMode.Open, FileAccess.Read);
        var bytes = ReadAll(s);
        if (p.Uri.OriginalString.EndsWith(".rels", StringComparison.OrdinalIgnoreCase)) return Encoding.UTF8.GetString(bytes);
        return HashBytes(bytes) + ":" + bytes.Length;
    }

    /// <summary>Everything the container API tells about the package.</summary>
    static void Describe(Rec r, string p, AutomationMLContainer c, bool loadRoot = true)
    {
        r.V(p + "filePath", () => c.FilePath);
        r.V(p + "compression", () => c.CompressionMode.ToString());
        r.V(p + "root", () => c.RootPackage?.Uri);
        r.V(p + "parts", () => c.GetParts().Select(x => $"{x.Uri}|{x.ContentType}|{x.CompressionOption}").ToList());
        var partList = new List<PackagePart>();
        r.V(p + "partCount", () => (partList = c.GetParts().ToList()).Count);
        foreach (var part in partList)
        {
            r.V(p + "content:" + part.Uri, () => PartContent(part));
            r.V(p + "rels:" + part.Uri, () => part.GetRelationships().ToList());
            r.V(p + "partExists:" + part.Uri, () => c.PartExists(part.Uri));
            r.V(p + "getPart:" + part.Uri, () => c.GetPart(part.Uri));
        }
        r.V(p + "packageRels", () => c.GetRelationShips().ToList());
        foreach (var (n, t) in RelTypes)
        {
            r.V(p + "exists:" + n, () => c.RelationShipExists(t));
            r.V(p + "byType:" + n, () => c.GetPartsByRelationShipType(t).ToList());
            r.V(p + "relsByType:" + n, () => c.GetRelationShipsByType(t).ToList());
        }
        PackagePart? root = null;
        r.V(p + "rootPackage", () => root = c.RootPackage);
        if (root != null)
        {
            r.V(p + "related", () => c.GetRelatedParts(root).ToList());
            foreach (var (n, t) in RelTypes)
            {
                r.V(p + "relatedByType:" + n, () => c.GetRelatedParts(root, t).ToList());
                r.V(p + "check:" + n, () => c.CheckRelatedParts(root, t).Select(x => $"{x.PartUri}|{x.RelatedPartUri}|{B(x.Exists)}").ToList());
                r.V(p + "relatedByUri:" + n, () => c.GetRelatedPartByUri(root.Uri, t));
            }
            if (loadRoot)
            {
                r.V(p + "rootStream", () =>
                {
                    using var s = c.RootDocumentStream()!;
                    var doc = CAEXDocument.LoadFromStream(s);
                    return $"{doc.SchemaVersionString}|{N(doc.AutomationMLVersion())}|{Hash(SaveString(doc))}";
                });
            }
        }
        else r.V(p + "rootStream", () => c.RootDocumentStream());
        r.V(p + "rootPath", () => c.RootDocumentPath(new DirectoryInfo(Path.Combine(workDir, "rootpath"))));
        r.V(p + "missing", () => $"{B(c.PartExists(U("/missing.xml")))}|{F(c.GetPart(U("/missing.xml")))}|{F(c.GetRelatedPartByUri(U("/missing.xml"), AutomationMLContainer.RelationshipType.Root))}");
    }

    static byte[] Bytes(string path) => File.ReadAllBytes(path);

    static MemoryStream Ms(string path) => new(File.ReadAllBytes(path));

    static void SaveBytes(string outDir, string name, byte[] bytes) => File.WriteAllBytes(Path.Combine(outDir, name + ".amlx"), bytes);

    static IEnumerable<(string, Action<Rec, string>)> AmlxCases(string inputDir, string corpusDir)
    {
        var data = Path.Combine(inputDir, "data");
        var xsd30 = Path.Combine(inputDir, "..", "..", "docs", "CAEX_ClassModel_V.3.0.xsd");
        string Corpus(string n) => Path.Combine(corpusDir, n);

        yield return ("createStream", (r, outDir) =>
        {
            var ms = new MemoryStream();
            var c = new AutomationMLContainer(ms, FileMode.Create);
            PackagePart? root = null;
            r.V("addRoot", () => root = c.AddRoot(Ms(Corpus("plant.aml")), U("/plant.aml")));
            r.V("addLibRel", () => c.AddLibrary(root!, Ms(Corpus("1_AMLBaseLibraries.aml")), U("/lib/AMLBaseLibraries.aml")));
            r.V("addLibPkg", () => c.AddLibrary(Ms(Corpus("6_RCL.aml")), U("/lib/RCL.aml")));
            r.V("addLibNoPkg", () => c.AddLibrary(root!, Ms(Corpus("7_ICL.aml")), U("/lib/ICL.aml"), false));
            r.V("addCollada", () => c.AddCollada(root!, Ms(Path.Combine(data, "model.dae")), U("/geo/model.dae")));
            r.V("addColladaNoPkg", () => c.AddCollada(root!, Ms(Path.Combine(data, "model.dae")), U("/geo/model2.dae"), false));
            r.V("addPlc", () => c.AddPLCopenXml(root!, Ms(Path.Combine(data, "plc.xml")), U("/plc/logic.xml")));
            r.V("addPlcNoPkg", () => c.AddPLCopenXml(root!, Ms(Path.Combine(data, "plc.xml")), U("/plc/logic2.xml"), false));
            r.V("addAnyMime", () => c.AddAnyContent(root!, Ms(Path.Combine(data, "image.png")), U("/any/image.png"), "image/png"));
            r.V("addAnyNoMime", () => c.AddAnyContent(root!, Ms(Path.Combine(data, "notes.unknownext")), U("/any/notes.unknownext")));
            r.V("addAnyNoRel", () => c.AddAnyContent(root!, Ms(Path.Combine(data, "readme.txt")), U("/any/readme.txt"), "text/plain", false));
            r.V("addAnyNullRoot", () => c.AddAnyContent(null!, Ms(Path.Combine(data, "big.txt")), U("/any/big.txt"), "text/plain"));
            r.V("addEmpty", () => c.AddAnyContent(root!, Ms(Path.Combine(data, "empty.bin")), U("/any/empty.bin"), "application/octet-stream"));
            r.V("addCaexSchema", () => c.AddCAEXSchema(Ms(xsd30), U("/schema/CAEX_ClassModel_V.3.0.xsd")));
            r.V("addColladaSchema", () => c.AddColladaSchema(Ms(Path.Combine(data, "plc.xml")), U("/schema/collada.xsd")));
            r.V("addPlcSchema", () => c.AddPLCopenXmlSchema(Ms(Path.Combine(data, "plc.xml")), U("/schema/tc6.xsd")));
            r.V("addSpace", () => c.AddAnyContent(root!, Ms(Path.Combine(data, "readme.txt")), U("/any/with space.txt"), "text/plain"));
            r.V("addUnicode", () => c.AddAnyContent(root!, Ms(Path.Combine(data, "readme.txt")), U("/any/%C3%A4.txt"), "text/plain"));
            r.V("addUpper", () => c.AddAnyContent(root!, Ms(Path.Combine(data, "readme.txt")), U("/ANY/UPPER.TXT"), "text/plain"));
            r.V("addStreamPos", () => { var s = Ms(Path.Combine(data, "readme.txt")); s.Position = 3; return c.AddAnyContent(root!, s, U("/any/pos.txt"), "text/plain"); });
            Describe(r, "", c);
            r.V("close", () => { c.Close(); return "ok"; });
            r.V("afterCloseLength", () => ms.Length > 0);
            SaveBytes(outDir, "createStream", ms.ToArray());
            var c2 = new AutomationMLContainer(new MemoryStream(ms.ToArray()));
            Describe(r, "reopen:", c2);
            r.V("reopenAdd", () => c2.AddRoot(Ms(Corpus("plant.aml")), U("/x.aml")));
            c2.Dispose();
        });

        yield return ("createFile", (r, outDir) =>
        {
            var path = Path.Combine(workDir, "file.amlx");
            var c = new AutomationMLContainer(path, FileMode.Create);
            PackagePart? root = null;
            r.V("addRoot", () => root = c.AddRoot(Corpus("plant.aml"), U("/model/plant.aml")));
            r.V("addLib", () => c.AddLibrary(root!, Corpus("6_RCL.aml"), U("/lib/rcl.aml")));
            r.V("addLibPkg", () => c.AddLibrary(Corpus("7_ICL.aml"), U("/lib/icl.aml")));
            r.V("addCollada", () => c.AddCollada(root!, Path.Combine(data, "model.dae"), U("/geo/model.dae")));
            r.V("addPlc", () => c.AddPLCopenXml(root!, Path.Combine(data, "plc.xml"), U("/plc/logic.xml")));
            r.V("addAnyExt", () => c.AddAnyContent(root!, Path.Combine(data, "image.png"), U("/any/image.png")));
            r.V("addAnyUnknown", () => c.AddAnyContent(root!, Path.Combine(data, "notes.unknownext"), U("/any/notes.unknownext")));
            r.V("addAnyGiven", () => c.AddAnyContent(root!, Path.Combine(data, "readme.txt"), U("/any/readme.txt"), "text/x-readme"));
            r.V("addCaexSchema", () => c.AddCAEXSchema(xsd30, U("/schema/caex.xsd")));
            r.V("addColladaSchema", () => c.AddColladaSchema(Path.Combine(data, "plc.xml"), U("/schema/collada.xsd")));
            r.V("addPlcSchema", () => c.AddPLCopenXmlSchema(Path.Combine(data, "plc.xml"), U("/schema/tc6.xsd")));
            r.V("addMissingFile", () => c.AddAnyContent(root!, Path.Combine(data, "missing.bin"), U("/any/missing.bin")));
            Describe(r, "", c);
            r.V("save", () => { c.Save(); return "ok"; });
            r.V("flush", () => { c.Flush(); return "ok"; });
            r.V("extractAll", () => { c.ExtractAllFiles(Path.Combine(workDir, "extract")); return c.ExtractionDirectory; });
            r.V("extracted", () => Directory.GetFiles(Path.Combine(workDir, "extract"), "*", SearchOption.AllDirectories)
                .Select(f => Path.GetRelativePath(Path.Combine(workDir, "extract"), f).Replace('\\', '/') + ":" + (f.EndsWith(".rels") ? Encoding.UTF8.GetString(File.ReadAllBytes(f)) : HashBytes(File.ReadAllBytes(f)))).OrderBy(x => x, StringComparer.Ordinal).ToList());
            r.V("extractPart", () => { c.Extract(new DirectoryInfo(Path.Combine(workDir, "extract2")), root!); return c.ExtractionDirectory; });
            r.V("extracted2", () => Directory.GetFiles(Path.Combine(workDir, "extract2"), "*", SearchOption.AllDirectories)
                .Select(f => Path.GetRelativePath(Path.Combine(workDir, "extract2"), f).Replace('\\', '/')).OrderBy(x => x, StringComparer.Ordinal).ToList());
            r.V("rootPath", () => c.RootDocumentPath(new DirectoryInfo(Path.Combine(workDir, "extract"))));
            r.V("dispose", () => { c.Dispose(); return "ok"; });
            r.V("disposeAgain", () => { c.Dispose(); return "ok"; });
            r.V("afterDispose", () => c.Package == null);
            SaveBytes(outDir, "createFile", File.ReadAllBytes(path));
            var c2 = new AutomationMLContainer(path, FileMode.Open, FileAccess.Read);
            Describe(r, "reopen:", c2);
            r.V("readOnlyAdd", () => c2.AddRoot(Corpus("plant.aml"), U("/x.aml")));
            r.V("readOnlyClose", () => { c2.Close(); return "ok"; });
            c2.Dispose();
            var c3 = new AutomationMLContainer(path);
            r.V("defaultOpenAdd", () => c3.AddLibrary(Corpus("5_SUC.aml"), U("/lib/suc.aml")));
            c3.Close();
            SaveBytes(outDir, "createFileUpdated", File.ReadAllBytes(path));
            r.V("openNew", () => { var p2 = Path.Combine(workDir, "new.amlx"); var c4 = new AutomationMLContainer(p2); c4.Close(); return File.ReadAllBytes(p2).Length; });
            r.V("openMissing", () => { var c5 = new AutomationMLContainer(Path.Combine(workDir, "missing.amlx"), FileMode.Open); c5.Close(); return "ok"; });
            r.V("createNew", () => { var c6 = new AutomationMLContainer(path, FileMode.CreateNew); c6.Close(); return "ok"; });
            r.V("share", () => { var c7 = new AutomationMLContainer(path, FileMode.Open, FileAccess.Read, FileShare.Read); var n = c7.GetParts().Count(); c7.Close(); return n; });
        });

        yield return ("relink", (r, outDir) =>
        {
            var ms = new MemoryStream();
            var c = new AutomationMLContainer(ms, FileMode.Create, FileAccess.ReadWrite);
            var root = c.AddRoot(Ms(Corpus("plant.aml")), U("/plant.aml"));
            var lib = c.AddLibrary(root, Ms(Corpus("6_RCL.aml")), U("/lib/a.aml"));
            var lib2 = c.AddLibrary(root, Ms(Corpus("7_ICL.aml")), U("/lib/b.aml"), false);
            lib.CreateRelationship(U("/lib/b.aml"), TargetMode.Internal, "http://example/dep");
            r.V("relink", () => c.RelinkPart(lib, root, U("/moved/a.aml")));
            Describe(r, "r1:", c, false);
            var moved = c.GetPart(U("/moved/a.aml"))!;
            r.V("relinkNoRelated", () => c.RelinkPart(lib2, null!, U("/moved/b.aml")));
            Describe(r, "r2:", c, false);
#pragma warning disable CS0618
            r.V("relinkObsolete", () => c.RelinkPart(U("/moved/a.aml"), U("/again/a.aml")));
            Describe(r, "r3:", c, false);
            r.V("relinkObsoleteRoot", () => c.RelinkPart(U("/plant.aml"), U("/root/plant.aml")));
            r.V("relinkObsoleteMissing", () => c.RelinkPart(U("/missing.aml"), U("/x.aml")));
#pragma warning restore CS0618
            Describe(r, "r4:", c, false);
            r.V("close", () => { c.Close(); return "ok"; });
            SaveBytes(outDir, "relink", ms.ToArray());
        });

        yield return ("replaceRoot", (r, outDir) =>
        {
            var ms = new MemoryStream();
            var c = new AutomationMLContainer(ms, FileMode.Create);
            var root = c.AddRoot(Ms(Corpus("plant.aml")), U("/plant.aml"));
            c.AddLibrary(root, Ms(Corpus("6_RCL.aml")), U("/lib/rcl.aml"));
            r.V("deleteRel", () => { var rel = c.GetRelationShipsByType(AutomationMLContainer.RelationshipType.Root).First(); c.Package.DeleteRelationship(rel.Id); return c.RelationShipExists(AutomationMLContainer.RelationshipType.Root); });
            r.V("deletePart", () => { c.Package.DeletePart(U("/plant.aml")); return c.PartExists(U("/plant.aml")); });
            Describe(r, "deleted:", c);
            r.V("newRoot", () => c.AddRoot(Ms(Corpus("legacy-caex215.aml")), U("/new/root.aml")));
            r.V("replaceLib", () => { c.Package.DeletePart(U("/lib/rcl.aml")); return c.AddLibrary(c.RootPackage!, Ms(Corpus("7_ICL.aml")), U("/lib/rcl.aml")); });
            r.V("deleteMissing", () => { c.Package.DeletePart(U("/nope.aml")); return "ok"; });
            r.V("deleteRelMissing", () => { c.Package.DeleteRelationship("Rnope"); return "ok"; });
            Describe(r, "replaced:", c);
            c.Close();
            SaveBytes(outDir, "replaceRoot", ms.ToArray());
        });

        foreach (var mode in new[] { CompressionOption.NotCompressed, CompressionOption.Normal, CompressionOption.Maximum, CompressionOption.Fast, CompressionOption.SuperFast })
        {
            yield return ("compression" + mode, (r, outDir) =>
            {
                var ms = new MemoryStream();
                var c = new AutomationMLContainer(ms, FileMode.Create) { CompressionMode = mode };
                var root = c.AddRoot(Ms(Corpus("plant.aml")), U("/plant.aml"));
                c.AddAnyContent(root, Ms(Path.Combine(data, "big.txt")), U("/big.txt"), "text/plain");
                c.AddAnyContent(root, Ms(Path.Combine(data, "image.png")), U("/image.png"), "image/png");
                Describe(r, "", c, false);
                c.Close();
                SaveBytes(outDir, "compression" + mode, ms.ToArray());
            });
        }

        yield return ("empty", (r, outDir) =>
        {
            var ms = new MemoryStream();
            var c = new AutomationMLContainer(ms, FileMode.Create);
            Describe(r, "", c);
            c.Close();
            SaveBytes(outDir, "empty", ms.ToArray());
            r.V("length", () => ms.ToArray().Length);
            var c2 = new AutomationMLContainer(new MemoryStream(ms.ToArray()));
            Describe(r, "reopen:", c2);
        });

        yield return ("errors", (r, outDir) =>
        {
            var ms = new MemoryStream();
            var c = new AutomationMLContainer(ms, FileMode.Create);
            var root = c.AddRoot(Ms(Corpus("plant.aml")), U("/plant.aml"));
            r.V("duplicate", () => c.AddRoot(Ms(Corpus("plant.aml")), U("/plant.aml")));
            r.V("duplicateCase", () => c.AddRoot(Ms(Corpus("plant.aml")), U("/PLANT.aml")));
            r.V("absoluteUri", () => c.AddAnyContent(root, Ms(Path.Combine(data, "readme.txt")), new Uri("http://x/a.xml"), "text/plain"));
            r.V("relToMissing", () => c.GetPart(U("/plant.aml"))!.CreateRelationship(U("/missing.aml"), TargetMode.Internal, "http://x/dep").Id.Length);
            r.V("relatedMissing", () => c.GetRelatedParts(root).ToList());
            r.V("checkMissing", () => c.CheckRelatedParts(root, AutomationMLContainer.RelationshipType.AnyContent).Select(x => $"{x.PartUri}|{x.RelatedPartUri}|{B(x.Exists)}").ToList());
            r.V("relExternal", () => c.GetPart(U("/plant.aml"))!.CreateRelationship(new Uri("http://example.com/x"), TargetMode.External, AutomationMLContainer.RelationshipType.Library.Name).TargetMode.ToString());
            r.V("relatedByType", () => c.GetRelatedParts(root, AutomationMLContainer.RelationshipType.Library).ToList());
            r.V("relBadId", () => c.Package.CreateRelationship(U("/plant.aml"), TargetMode.Internal, "http://x/t", "1bad").Id);
            r.V("relDupId", () => { c.Package.CreateRelationship(U("/plant.aml"), TargetMode.Internal, "http://x/t", "Rdup"); return c.Package.CreateRelationship(U("/plant.aml"), TargetMode.Internal, "http://x/t", "Rdup").Id; });
            r.V("relEmptyType", () => c.Package.CreateRelationship(U("/plant.aml"), TargetMode.Internal, "").Id);
            Describe(r, "", c, false);
            c.Close();
            SaveBytes(outDir, "errors", ms.ToArray());
            var ro = new AutomationMLContainer(new MemoryStream(ms.ToArray()));
            r.V("roAdd", () => ro.AddRoot(Ms(Corpus("plant.aml")), U("/y.aml")));
            r.V("roFlush", () => { ro.Flush(); return "ok"; });
            r.V("roDelete", () => { ro.Package.DeletePart(U("/plant.aml")); return "ok"; });
            r.V("roStream", () => { using var s = ro.RootPackage!.GetStream(); return s.CanWrite; });
            r.V("roClose", () => { ro.Close(); return "ok"; });
            ro.Dispose();
            r.V("closedUse", () => ro.GetParts().Count());
            r.V("notZip", () => new AutomationMLContainer(new MemoryStream(Encoding.UTF8.GetBytes("not a zip"))).GetParts().Count());
            r.V("emptyStream", () => new AutomationMLContainer(new MemoryStream()).GetParts().Count());
            foreach (var (u, mime) in new[] { ("/a/", "text/plain"), ("a.xml", "text/plain"), ("/[Content_Types].xml", "text/plain"), ("/_rels/.rels", "text/plain"), ("/a%2Fb.xml", "text/plain"),
                ("/a/../b.xml", "text/plain"), ("/./c.xml", "text/plain"), ("/ä.xml", "text/plain"), ("/a%20b.xml", "text/plain"), ("/a b2.xml", "text/plain"), ("//x.xml", "text/plain"),
                ("/x.xml#frag", "text/plain"), ("/x.xml?q=1", "text/plain"), ("/a/b.rels", "text/plain"), ("/_rels/x.rels", "text/plain"), ("/x.", "text/plain"), ("/.x", "text/plain"),
                ("/%41.xml", "text/plain"), ("/a:b.xml", "text/plain"), ("/plant.aml/sub.xml", "text/plain"), ("/ok.txt", "text/plain; charset=utf-8"), ("/ok2.txt", "Text/Plain"),
                ("/ok3.txt", "text/plain;a=b;c=d"), ("/ok4.txt", " text/plain"), ("/ok5.txt", "text/plain "), ("/ok6.txt", ""), ("/badmime.txt", "not a mime"), ("/badmime2.txt", "a/b/c"), ("/badmime3.txt", "a/b;x"), ("/%C3%A4%20x.txt", "text/plain") })
            {
                r.V("uri:" + u + ":" + mime, () =>
                {
                    var ms2 = new MemoryStream();
                    var c2 = new AutomationMLContainer(ms2, FileMode.Create);
                    var root2 = c2.AddRoot(Ms(Corpus("plant.aml")), U("/plant.aml"));
                    var res = T(() => c2.AddAnyContent(root2, Ms(Path.Combine(data, "readme.txt")), U(u), mime));
                    var parts = T(() => c2.GetParts().Select(x => $"{x.Uri}|{x.ContentType}").ToList());
                    var rels = T(() => root2.GetRelationships().ToList());
                    var close = T(() => { c2.Close(); return "closed"; });
                    return $"{res}|{parts}|{rels}|{close}";
                });
            }
        });

        foreach (var f in Directory.GetFiles(Path.Combine(inputDir, "amlx"), "*.amlx").OrderBy(x => Path.GetFileName(x), StringComparer.Ordinal))
        {
            var fname = Path.GetFileNameWithoutExtension(f);
            yield return ("existing:" + fname, (r, outDir) =>
            {
                var big = new FileInfo(f).Length > 100_000;
                // Read before the package is opened: Package.Open locks the file (FileShare.None), which the port does not do.
                var fileBytes = File.ReadAllBytes(f);
                var c = new AutomationMLContainer(f, FileMode.Open, FileAccess.Read);
                Describe(r, "", c, !big);
                r.V("rootPathStream", () => new AutomationMLContainer(new MemoryStream(fileBytes)).RootDocumentPath(new DirectoryInfo(workDir)));
                r.V("close", () => { c.Close(); return "ok"; });
                c.Dispose();
                // Unchanged round trip and an update (added library) of a copy.
                var copy = Path.Combine(workDir, fname + ".copy.amlx");
                File.Copy(f, copy, true);
                var c2 = new AutomationMLContainer(copy, FileMode.Open, FileAccess.ReadWrite);
                c2.Close();
                SaveBytes(outDir, "existing-" + fname + "-unchanged", File.ReadAllBytes(copy));
                var c3 = new AutomationMLContainer(copy, FileMode.Open, FileAccess.ReadWrite);
                r.V("addLib", () => c3.AddLibrary(c3.RootPackage!, Ms(Corpus("6_RCL.aml")), U("/added/rcl.aml")));
                Describe(r, "updated:", c3, false);
                c3.Close();
                SaveBytes(outDir, "existing-" + fname + "-updated", File.ReadAllBytes(copy));
                // The same through a stream.
                var ms = new MemoryStream();
                ms.Write(File.ReadAllBytes(f));
                var c4 = new AutomationMLContainer(ms, FileMode.Open, FileAccess.ReadWrite);
                r.V("streamDeleteRoot", () => { c4.Package.DeletePart(c4.RootPackage!.Uri); return c4.GetParts().Count(); });
                c4.Close();
                SaveBytes(outDir, "existing-" + fname + "-stream", ms.ToArray());
            });
        }
    }
}

static class FrameAttributeTypeTestExtensions
{
    /// <summary>FramePropertyChanged is internal; called through reflection.</summary>
    public static void FramePropertyChangedPublic(this FrameAttributeType fa, string name)
    {
        typeof(FrameAttributeType).GetMethod("FramePropertyChanged", BindingFlags.NonPublic | BindingFlags.Instance)!.Invoke(fa, new object[] { fa.Frame, name });
    }
}
