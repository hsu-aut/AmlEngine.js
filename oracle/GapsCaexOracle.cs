using System.Collections;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Services;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// Coverage gap package "gapscaex": the functions of src/engine/caex/**, src/engine/xml/XDocumentWrapper.ts
/// and src/engine/resources/** that no other oracle test executes (see docs/coverage-notes/gapscaex.md).
///
///   gapscaex <inputDir> <out.json>
///
/// Every scenario is a fixed sequence of calls, written the same way in test/engine/gapscaex.oracle.test.ts.
/// Each call records [label, encoded result]; "#" entries hold the canonical saved document text ("=" when
/// unchanged since the previous one). GUIDs are replaced by their order of appearance, "now" timestamps by
/// NOW (EngineOpsOracle.Canonicalizer).
/// </summary>
public static partial class GapsCaexOracle
{
    public static void Run(string[] args)
    {
        var inDir = args[0];
        var outFile = args[1];
        var result = new JsonObject();
        foreach (var (name, body) in Scenarios())
        {
            var ctx = new Ctx(inDir);
            try { body(ctx); }
            catch (Exception e) { ctx.Add("!scenario", "!" + e.GetType().Name + ": " + e.Message + " " + e.StackTrace); }
            result[name] = ctx.Items;
        }
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(outFile))!);
        File.WriteAllText(outFile, result.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    // ------------------------------------------------------------------------------------ harness

    public sealed class Ctx
    {
        public readonly string InDir;
        public readonly JsonArray Items = new();
        public readonly EngineOpsOracle.Canonicalizer Canon = new();
        public CAEXDocument Doc = null!;
        string? lastText;

        public Ctx(string inDir) { InDir = inDir; }

        public CAEXDocument Load(string file)
        {
            Doc = CAEXDocument.LoadFromString(File.ReadAllText(Path.Combine(InDir, file), Encoding.UTF8));
            return Doc;
        }

        public void Add(string label, JsonNode? value) => Items.Add(new JsonArray(label, Canonical(value)));

        JsonNode? Canonical(JsonNode? n)
        {
            switch (n)
            {
                case null: return null;
                case JsonArray a:
                    var r = new JsonArray();
                    foreach (var x in a) r.Add(Canonical(x?.DeepClone()));
                    return r;
                case JsonValue v when v.TryGetValue<string>(out var s): return JsonValue.Create(Canon.Apply(s));
                default: return n;
            }
        }

        /// <summary>Records the encoded result of f, or "!Exception".</summary>
        public void R(string label, Func<object?> f)
        {
            JsonNode? value;
            try { value = Enc(f()); }
            catch (Exception e) { value = "!" + Unwrap(e).GetType().Name; }
            Add(label, value);
        }

        /// <summary>Runs an action and records "ok" or "!Exception".</summary>
        public void V(string label, Action a) => R(label, () => { a(); return "ok"; });

        /// <summary>Records the canonical saved text of the current document.</summary>
        public void D(string label = "#") => D(label, Doc);

        public void D(string label, CAEXDocument doc)
        {
            string text;
            try
            {
                using var s = doc.SaveToStream(true);
                s.Position = 0;
                text = new StreamReader(s).ReadToEnd();
            }
            catch (Exception e) { text = "!" + e.GetType().Name; }
            text = Canon.Apply(text);
            Add(label, text == lastText ? "=" : text);
            lastText = text;
        }

        static Exception Unwrap(Exception e) =>
            e is TargetInvocationException t && t.InnerException != null ? Unwrap(t.InnerException) : e;
    }

    public static string TypeName(Type t)
    {
        var n = t.Name;
        var i = n.IndexOf('`');
        return i < 0 ? n : n.Substring(0, i);
    }

    public static string Pos(XElement e)
    {
        var parts = new List<int>();
        var x = e;
        while (x.Parent != null)
        {
            parts.Add(x.ElementsBeforeSelf().Count());
            x = x.Parent;
        }
        parts.Reverse();
        var prefix = x.Document != null ? "/" : "~" + x.Name.LocalName + "/";
        return prefix + string.Join("/", parts) + "|" + ((string?)e.Attribute("Name") ?? e.Name.LocalName);
    }

    public static JsonNode? Enc(object? v)
    {
        switch (v)
        {
            case null: return null;
            case string s: return s;
            case bool b: return b;
            case int i: return i;
            case long l: return l;
            case double d: return "d:" + d.ToString("R", System.Globalization.CultureInfo.InvariantCulture);
            case Enum e: return "e:" + e.GetType().Name + "." + e;
            case Type t: return "t:" + TypeName(t);
            case DateTime dt: return "dt:" + dt.ToString("o") + ":" + dt.Kind;
            case XName n: return "n:" + n;
            case XElement x: return "x:" + Pos(x);
            case CAEXWrapper w: return "w:" + TypeName(w.GetType()) + ":" + (w.Node == null ? "-" : Pos(w.Node));
            case ITuple t:
                var ta = new JsonArray();
                for (var i = 0; i < t.Length; i++) ta.Add(Enc(t[i]));
                return ta;
            case IEnumerable en:
                var a = new JsonArray();
                foreach (var x in en) a.Add(Enc(x));
                return a;
            default: return "?" + TypeName(v.GetType()) + ":" + v;
        }
    }

    static object? Internal(object target, string property) =>
        target.GetType().GetProperty(property, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!.GetValue(target);

    static IEnumerable<(string, Action<Ctx>)> Scenarios()
    {
        foreach (var file in new[] { "mapping215.aml", "mapping30.aml" })
        {
            yield return ("mappingRead:" + file, c => MappingRead(c, file));
            yield return ("mappingWrite:" + file, c => MappingWrite(c, file));
            yield return ("roleRequirements:" + file, c => RoleRequirements(c, file));
            yield return ("mappingType:" + file, c => MappingTypeOps(c, file));
        }
        foreach (var file in new[] { "revision215.aml", "revision30.aml" })
            yield return ("revisions:" + file, c => Revisions(c, file));
        yield return ("culture", Culture);
        foreach (var s in MiscScenarios()) yield return s;
        foreach (var s in ServiceScenarios()) yield return s;
        foreach (var s in ExtraScenarios()) yield return s;
    }

    // ------------------------------------------------------------------------------------ mappings

    static List<dynamic> Mappings(CAEXDocument doc) =>
        doc.XDocument.Root!.Descendants()
            .Where(e => e.Name.LocalName is "AttributeNameMapping" or "InterfaceNameMapping" or "InterfaceIDMapping")
            .Select(e => (dynamic)e.CreateCAEXWrapper()!)
            .ToList();

    static void MappingRead(Ctx c, string file)
    {
        var doc = c.Load(file);
        var k = 0;
        foreach (var m in Mappings(doc))
        {
            var p = "m" + k++ + ".";
            c.R(p + "type", () => m.GetType());
            c.R(p + "MappingObject", () => m.MappingObject);
            c.R(p + "MappingObject.MappingRoleReference", () => Internal(m.MappingObject, "MappingRoleReference"));
            c.R(p + "MappingRoleClass", () => m.MappingRoleClass);
            c.R(p + "MappingRoleReference", () => m.MappingRoleReference);
            c.R(p + "MappingSystemUnitClass", () => m.MappingSystemUnitClass);
            c.R(p + "RoleClassElementIdentifier", () => m.RoleClassElementIdentifier);
            c.R(p + "SystemUnitClassElementIdentifier", () => m.SystemUnitClassElementIdentifier);
            c.R(p + "RoleClassElement", () => m.RoleClassElement);
            c.R(p + "SystemUnitClassElement", () => m.SystemUnitClassElement);
            if (m is AttributeNameMappingType)
            {
                c.R(p + "RoleAttribute", () => m.RoleAttribute);
                c.R(p + "SystemUnitAttribute", () => m.SystemUnitAttribute);
            }
            else
            {
                c.R(p + "RoleInterface", () => m.RoleInterface);
                c.R(p + "SystemUnitInterface", () => m.SystemUnitInterface);
            }
            c.R(p + "SystemUnitClassMappingElements", () => m.SystemUnitClassMappingElements);
            c.R(p + "RoleClassMappingElements()", () => m.RoleClassMappingElements());
            c.R(p + "RoleClassMappingElements(true)", () => m.RoleClassMappingElements(true));
            c.R(p + "RoleClassMappingElements(false)", () => m.RoleClassMappingElements(false));
        }
        c.D();
    }

    static void MappingWrite(Ctx c, string file)
    {
        var count = Mappings(c.Load(file)).Count;
        for (var k = 0; k < count; k++)
        {
            var p = "m" + k + ".";
            var doc = c.Load(file);
            dynamic m = Mappings(doc)[k];
            var isAttr = m is AttributeNameMappingType;

            // RoleClassElement setter with every candidate (including duplicates)
            var roleCandidates = new List<object?>();
            try { foreach (var t in (IEnumerable)m.RoleClassMappingElements(true)) roleCandidates.Add(((ITuple)t)[0]); }
            catch (Exception e) { c.Add(p + "roleCandidates", "!" + e.GetType().Name); }
            var i = 0;
            foreach (var cand in roleCandidates)
            {
                var q = p + "role" + i++ + ".";
                if (cand == null) { c.Add(q + "null", null); continue; }
                c.V(q + "set", () => { m.RoleClassElement = (dynamic)cand; });
                c.R(q + "id", () => m.RoleClassElementIdentifier);
                c.R(q + "get", () => m.RoleClassElement);
            }
            var suCandidates = new List<object?>();
            try { foreach (var t in (IEnumerable)m.SystemUnitClassMappingElements) suCandidates.Add(((ITuple)t)[0]); }
            catch (Exception e) { c.Add(p + "suCandidates", "!" + e.GetType().Name); }
            i = 0;
            foreach (var cand in suCandidates)
            {
                var q = p + "su" + i++ + ".";
                if (cand == null) { c.Add(q + "null", null); continue; }
                c.V(q + "set", () => { m.SystemUnitClassElement = (dynamic)cand; });
                c.R(q + "id", () => m.SystemUnitClassElementIdentifier);
                c.R(q + "get", () => m.SystemUnitClassElement);
            }
            // an object which is not a candidate: the identifier stays
            if (suCandidates.Count > 0 && suCandidates[0] != null)
            {
                c.V(p + "roleSetForeign", () => { m.RoleClassElement = (dynamic)suCandidates[0]!; });
                c.R(p + "roleSetForeign.id", () => m.RoleClassElementIdentifier);
            }
            if (roleCandidates.Count > 0 && roleCandidates[0] != null)
            {
                c.V(p + "suSetForeign", () => { m.SystemUnitClassElement = (dynamic)roleCandidates[0]!; });
                c.R(p + "suSetForeign.id", () => m.SystemUnitClassElementIdentifier);
            }
            // typed setters
            if (isAttr)
            {
                if (roleCandidates.Count > 0) c.V(p + "RoleAttribute=", () => { m.RoleAttribute = (AttributeType?)roleCandidates[^1]; });
                if (suCandidates.Count > 0) c.V(p + "SystemUnitAttribute=", () => { m.SystemUnitAttribute = (AttributeType?)suCandidates[^1]; });
                c.R(p + "RoleAttribute", () => m.RoleAttribute);
                c.R(p + "SystemUnitAttribute", () => m.SystemUnitAttribute);
            }
            else
            {
                if (roleCandidates.Count > 0) c.V(p + "RoleInterface=", () => { m.RoleInterface = (ExternalInterfaceType?)roleCandidates[^1]; });
                if (suCandidates.Count > 0) c.V(p + "SystemUnitInterface=", () => { m.SystemUnitInterface = (ExternalInterfaceType?)suCandidates[^1]; });
                c.R(p + "RoleInterface", () => m.RoleInterface);
                c.R(p + "SystemUnitInterface", () => m.SystemUnitInterface);
            }
            c.D(p + "#set");
            // identifiers directly
            c.V(p + "RoleClassElementIdentifier=", () => { m.RoleClassElementIdentifier = "r-" + k; });
            c.V(p + "SystemUnitClassElementIdentifier=", () => { m.SystemUnitClassElementIdentifier = "s-" + k; });
            c.R(p + "ids", () => new object?[] { m.RoleClassElementIdentifier, m.SystemUnitClassElementIdentifier, m.RoleClassElement, m.SystemUnitClassElement });
            // null clears
            c.V(p + "RoleClassElement=null", () => { m.RoleClassElement = null; });
            c.V(p + "SystemUnitClassElement=null", () => { m.SystemUnitClassElement = null; });
            c.R(p + "ids.null", () => new object?[] { m.RoleClassElementIdentifier, m.SystemUnitClassElementIdentifier });
            c.D(p + "#null");

            // AddRoleClassElement with the elements of every RoleClass of the document
            var roleObjects = new List<CAEXObject>();
            foreach (var rc in doc.CAEXFile.RoleClassLib.SelectMany(l => l.RoleClass))
            {
                if (isAttr) roleObjects.AddRange(rc.GetInheritedAttributesAndDescendants());
                else roleObjects.AddRange(rc.GetInheritedInterfacesAndDescendants());
            }
            i = 0;
            foreach (var ro in roleObjects)
            {
                var q = p + "add" + i++ + ".";
                c.V(q + "AddRoleClassElement", () => m.AddRoleClassElement((dynamic)ro));
                c.R(q + "id", () => m.RoleClassElementIdentifier);
                c.R(q + "get", () => m.RoleClassElement);
            }
            c.V(p + "AddRoleClassElement(null)", () => m.AddRoleClassElement(null));
            c.R(p + "AddRoleClassElement(null).id", () => m.RoleClassElementIdentifier);
            c.D(p + "#add");
        }
    }

    static List<RoleRequirementsType> AllRoleRequirements(CAEXDocument doc) =>
        doc.XDocument.Root!.Descendants()
            .Where(e => e.Name.LocalName == "RoleRequirements")
            .Select(e => (RoleRequirementsType)e.CreateCAEXWrapper()!)
            .ToList();

    static void RoleRequirements(Ctx c, string file)
    {
        var count = AllRoleRequirements(c.Load(file)).Count;
        for (var k = 0; k < count; k++)
        {
            var p = "rr" + k + ".";
            var doc = c.Load(file);
            var rr = AllRoleRequirements(doc)[k];
            c.R(p + "Class", () => rr.Class);
            c.R(p + "RoleClass", () => rr.RoleClass);
            c.R(p + "ExternalInterfaceAndDescendants", () => rr.ExternalInterfaceAndDescendants);
            c.R(p + "AttributeAndDescendants", () => rr.AttributeAndDescendants);
            c.R(p + "QualifiedAttributes", () => rr.QualifiedAttributes);
            c.R(p + "QualifiedExternalInterfaces", () => rr.QualifiedExternalInterfaces);
            c.R(p + "QualifiedRoleClassAttributes", () => rr.QualifiedRoleClassAttributes);
            c.R(p + "QualifiedRoleClassInterfaces", () => rr.QualifiedRoleClassInterfaces);
            c.R(p + "UnAssignedQualifiedRoleClassAttributesOfMultipleRoles", () => rr.UnAssignedQualifiedRoleClassAttributesOfMultipleRoles);
            c.R(p + "UnAssignedQualifiedRoleClassInterfacesOfMultipleRoles", () => rr.UnAssignedQualifiedRoleClassInterfacesOfMultipleRoles);
            c.R(p + "MappingObject", () => rr.MappingObject);
            c.D(p + "#read");
            var roleClasses = doc.CAEXFile.RoleClassLib.SelectMany(l => l.RoleClass).ToList();
            var attributes = roleClasses.SelectMany(r => r.GetInheritedAttributesAndDescendants()).Concat(rr.Attribute).ToList();
            var interfaces = roleClasses.SelectMany(r => r.GetInheritedInterfacesAndDescendants()).Concat(rr.ExternalInterface).ToList();
            var i = 0;
            foreach (var a in attributes)
            {
                var q = p + "a" + i++ + ".";
                c.R(q + "IsAssignable", () => rr.IsAssignableRoleClassAttribute(a));
                c.R(q + "Assign", () => rr.AssignQualifiedRoleClassAttribute(a));
            }
            c.R(p + "AssignAttribute(null)", () => rr.AssignQualifiedRoleClassAttribute(null!));
            c.R(p + "IsAssignableAttribute(null)", () => rr.IsAssignableRoleClassAttribute(null!));
            i = 0;
            foreach (var e in interfaces)
            {
                var q = p + "i" + i++ + ".";
                c.R(q + "IsAssignable", () => rr.IsAssignableRoleClassInterface(e));
                c.R(q + "Assign", () => rr.AssignQualifiedRoleClassInterface(e));
            }
            c.R(p + "AssignInterface(null)", () => rr.AssignQualifiedRoleClassInterface(null!));
            c.R(p + "IsAssignableInterface(null)", () => rr.IsAssignableRoleClassInterface(null!));
            c.D(p + "#assign");
            c.R(p + "QualifiedRoleClassAttributes.after", () => rr.QualifiedRoleClassAttributes);
            c.R(p + "QualifiedRoleClassInterfaces.after", () => rr.QualifiedRoleClassInterfaces);
            c.R(p + "UnAssignedAttributes.after", () => rr.UnAssignedQualifiedRoleClassAttributesOfMultipleRoles);
            c.R(p + "UnAssignedInterfaces.after", () => rr.UnAssignedQualifiedRoleClassInterfacesOfMultipleRoles);
            foreach (var m in rr.MappingObject.AttributeNameMapping)
                c.R(p + "attrMapping." + m.RoleAttributeName, () => m.RoleClassMappingElements());
            foreach (var m in rr.MappingObject.InterfaceNameMapping)
                c.R(p + "ifMapping." + m.RoleInterfaceName, () => m.RoleClassMappingElements());
            // Class setter
            c.V(p + "Class=R2", () => rr.Class = roleClasses.First(r => r.Name == "R2"));
            c.R(p + "RefBaseRoleClassPath", () => rr.RefBaseRoleClassPath);
            c.V(p + "Class=null", () => rr.Class = null!);
            c.R(p + "RefBaseRoleClassPath.null", () => rr.RefBaseRoleClassPath);
            c.R(p + "New_MappingObject", () => rr.New_MappingObject());
            c.D(p + "#end");
        }
        var d2 = c.Load(file);
        var ie = d2.CAEXFile.InstanceHierarchy[0]!.InternalElement[0]!;
        var rq = ie.RoleRequirements.FirstOrDefault();
        if (rq != null)
        {
            c.V("ie.New_MappingObject", () => ie.New_MappingObject());
            c.R("ie.MappingObject", () => ie.MappingObject);
        }
    }

    static void MappingTypeOps(Ctx c, string file)
    {
        var doc = c.Load(file);
        var mappings = doc.XDocument.Root!.Descendants().Where(e => e.Name.LocalName == "MappingObject")
            .Select(e => (MappingType)e.CreateCAEXWrapper()!).ToList();
        var k = 0;
        foreach (var mo in mappings)
        {
            var p = "mo" + k++ + ".";
            c.R(p + "AttributeNameMapping", () => mo.AttributeNameMapping);
            c.R(p + "InterfaceNameMapping", () => mo.InterfaceNameMapping);
            c.R(p + "InterfaceIDMapping", () => mo.InterfaceIDMapping);
            c.R(p + "MappingRoleReference", () => Internal(mo, "MappingRoleReference"));
            foreach (var child in mo.Node.Elements().Select(e => e.CreateCAEXWrapper()!).ToList())
                c.R(p + "CAEXSequence." + child.Node.Name.LocalName, () => mo.CAEXSequence(child));
            c.R(p + "CAEXSequence(foreign)", () => mo.CAEXSequence(doc.CAEXFile));
        }
        // insert and import on the first mapping object
        var target = mappings[0];
        var sources = mappings.Skip(1).SelectMany(m => m.Node.Elements()).Select(e => e.CreateCAEXWrapper()!).ToList();
        var i = 0;
        foreach (var s in sources)
        {
            var q = "ins" + i++ + ".";
            var copy = (CAEXWrapper)s.Copy();
            c.R(q + "Insert(pos)", () => target.Insert(i % 3, copy));
            var copy2 = (CAEXWrapper)s.Copy();
            c.R(q + "Insert(asFirst)", () => target.Insert(copy2, i % 2 == 0));
            var copy3 = (CAEXWrapper)s.Copy();
            c.R(q + "Insert(asIs)", () => target.Insert(copy3, false, true));
            c.R(q + "Import", () => target.Import(s, "imp" + i));
        }
        c.R("ins.Insert(pos,attribute)", () => target.Insert(0, doc.CAEXFile.InstanceHierarchy[0]!.InternalElement[0]!.Attribute[0]!.Copy()));
        c.R("ins.Insert(attribute)", () => target.Insert(doc.CAEXFile.InstanceHierarchy[0]!.InternalElement[0]!.Attribute[0]!.Copy()));
        c.R("ins.Import(attribute)", () => target.Import(doc.CAEXFile.InstanceHierarchy[0]!.InternalElement[0]!.Attribute[0]!, "a"));
        c.D();
    }

    // ------------------------------------------------------------------------------------ revisions

    static void Revisions(Ctx c, string file)
    {
        var doc = c.Load(file);
        var objs = doc.XDocument.Root!.Descendants().Select(e => e.CreateCAEXWrapper()).OfType<CAEXObject>().ToList();
        c.R("IsExtensionDocument", () => doc.IsExtensionDocument());
        foreach (var o in objs)
        {
            var p = o.CAEXPath() + ".";
            var k = 0;
            foreach (var r in o.Revision)
            {
                var q = p + "r" + k++ + ".";
                c.R(q + "AuthorName", () => r.AuthorName);
                c.R(q + "Comment", () => r.Comment);
                c.R(q + "NewVersion", () => r.NewVersion);
                c.R(q + "OldVersion", () => r.OldVersion);
                c.R(q + "NewVersionObject", () => r.NewVersionObject);
                c.R(q + "OldVersionObject", () => r.OldVersionObject);
                c.R(q + "IsNewVersion", () => r.IsNewVersion);
                c.R(q + "IsOldVersion", () => r.IsOldVersion);
                c.R(q + "IsExtension", () => r.IsExtension);
                c.R(q + "RevisionDate", () => r.RevisionDate);
            }
            c.R(p + "HasOldVersion", () => o.HasOldVersion());
            c.R(p + "HasNewVersion", () => CAEXBasicObjectExtensions.HasNewVersion(o));
            if (o is ICAEXLibrary lib) c.R(p + "IsExtendedVersion(lib)", () => lib.IsExtendedVersion());
            c.R(p + "OldVersions", () => o.OldVersions());
            c.R(p + "NewVersions", () => o.NewVersions());
            c.R(p + "OldRevisions", () => o.OldRevisions());
            c.R(p + "Extensions", () => o.Extensions());
            foreach (var n in new[] { "RCL2", "R1", "RCL", "", "x" })
                c.R(p + "HasNewVersion(" + n + ")", () => o.HasNewVersion(n));
            c.R(p + "HasNewVersion(null)", () => o.HasNewVersion(null!));
            foreach (var o2 in objs)
            {
                c.R(p + "IsNewVersion(" + o2.CAEXPath() + ")", () => o.IsNewVersion(o2));
                c.R(p + "IsExtendedVersion(" + o2.CAEXPath() + ")", () => o.IsExtendedVersion(o2));
            }
        }
        // mutations on a library without revisions
        var libZ = objs.First(o => o.Name == "RCLZ");
        var rcl = objs.First(o => o.Name == "RCL");
        var r1 = objs.First(o => o.Name == "R1");
        RevisionType? rv = null;
        c.R("append", () => rv = libZ.Revision.Append());
        c.R("new.AuthorName", () => rv!.AuthorName);
        c.R("new.RevisionDate", () => rv!.RevisionDate);
        c.R("new.IsExtension", () => rv!.IsExtension);
        c.V("AuthorName=", () => rv!.AuthorName = "X");
        c.V("Comment=", () => rv!.Comment = "c");
        c.V("NewVersion=", () => rv!.NewVersion = "RCL");
        c.V("OldVersion=", () => rv!.OldVersion = "RCL2");
        c.V("RevisionDate=", () => rv!.RevisionDate = new DateTime(2023, 1, 2, 3, 4, 5, DateTimeKind.Utc));
        c.D();
        c.R("get", () => new object?[] { rv!.AuthorName, rv.Comment, rv.NewVersion, rv.OldVersion, rv.NewVersionObject, rv.OldVersionObject, rv.IsNewVersion, rv.IsOldVersion, rv.IsExtension, rv.RevisionDate });
        c.V("NewVersionObject=R1", () => rv!.NewVersionObject = r1);
        c.V("OldVersionObject=RCL", () => rv!.OldVersionObject = rcl);
        c.R("get2", () => new object?[] { rv!.NewVersion, rv.OldVersion, rv.NewVersionObject, rv.OldVersionObject });
        c.D();
        c.R("libZ.HasOldVersion", () => libZ.HasOldVersion());
        c.R("libZ.IsExtendedVersion", () => ((ICAEXLibrary)libZ).IsExtendedVersion());
        c.R("rcl.IsNewVersion(libZ)", () => rcl.IsNewVersion(libZ));
        c.V("MakeExtension", () => rv!.MakeExtension("ext"));
        c.R("IsExtension.after", () => rv!.IsExtension);
        c.R("libZ.IsExtendedVersion.after", () => ((ICAEXLibrary)libZ).IsExtendedVersion());
        c.R("rcl.IsExtendedVersion(libZ)", () => rcl.IsExtendedVersion(libZ));
        c.R("IsExtensionDocument.after", () => doc.IsExtensionDocument());
        c.V("NewVersionObject=null", () => rv!.NewVersionObject = null!);
        c.V("OldVersionObject=null", () => rv!.OldVersionObject = null!);
        c.V("AuthorName=null", () => rv!.AuthorName = null!);
        c.V("Comment=null", () => rv!.Comment = null!);
        c.R("get3", () => new object?[] { rv!.AuthorName, rv.Comment, rv.NewVersion, rv.OldVersion, rv.IsNewVersion, rv.IsOldVersion, rv.IsExtension });
        c.D();
        // SourceObjectInformation
        var k2 = 0;
        foreach (var soi in doc.CAEXFile.SourceObjectInformation)
        {
            var q = "soi" + k2++ + ".";
            c.R(q + "OriginID", () => soi.OriginID);
            c.R(q + "SourceObjID", () => soi.SourceObjID);
            c.V(q + "OriginID=", () => soi.OriginID = "n" + k2);
            c.V(q + "OriginID=same", () => soi.OriginID = "n" + k2);
            c.V(q + "SourceObjID=", () => soi.SourceObjID = "s" + k2);
            c.V(q + "SourceObjID=null", () => soi.SourceObjID = null!);
            c.R(q + "after", () => new object?[] { soi.OriginID, soi.SourceObjID });
        }
        c.D();
    }

    // ------------------------------------------------------------------------------------ culture sensitive StartsWith / EndsWith

    // Pairs (s, v) for s.EndsWith(v) / s.StartsWith(v) in test/gapscaex/culture-pairs.json; {XXXX} stands for the UTF-16 code unit XXXX.


    /// <summary>Replaces {XXXX} by the UTF-16 code unit XXXX.</summary>
    public static string Unesc(string s) =>
        System.Text.RegularExpressions.Regex.Replace(s, "\\{([0-9A-F]{4})\\}", m => ((char)Convert.ToInt32(m.Groups[1].Value, 16)).ToString());

    static void Culture(Ctx c)
    {
        var doc = CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
        c.Doc = doc;
        var lib = doc.CAEXFile.RoleClassLib.Append("L");
        var r = lib.Revision.Append();
        var rc = lib.RoleClass.Append("RC");
        var pairs = JsonNode.Parse(File.ReadAllText(Path.Combine(c.InDir, "culture-pairs.json")))!.AsArray();
        foreach (var node in pairs)
        {
            var pair = new[] { node![0]!.GetValue<string>(), node[1]!.GetValue<string>() };
            var s = Unesc(pair[0]);
            var v = Unesc(pair[1]);
            var label = pair[0] + "|" + pair[1];
            r.NewVersion = s;
            c.R("ends:" + label, () => lib.HasNewVersion(v));
            rc.RefBaseClassPath = s;
            c.R("starts:" + label, () => rc.ClassIsDerivedFrom(v));
        }
    }
}
