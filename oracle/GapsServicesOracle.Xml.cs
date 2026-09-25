using System.Collections;
using System.Text;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

// Section "xmlext": the internal extension methods of Aml.Engine.Xml.Extensions (called by
// reflection) for every element and attribute of a set of documents.
public static partial class GapsServicesOracle
{
    static readonly string[] SweepDocs =
    {
        "docs:map215.aml", "docs:map30.aml", "12_MirrorObject.aml", "13_Facet.aml", "9_ExtInt_IntLink.aml", "10_RefSemantic.aml",
        "6_RCL.aml", "5_SUC.aml", "7_ICL.aml", "11_Constraints.aml", "legacy-caex215.aml", "Topology.aml", "plant.aml",
        "AutomationML_Base_Libraries_AMLEd2_2.11.0.aml", "2016_OPCF_UA-Nodeset-AML_Topology.aml",
    };

    static CAEXDocument Doc(string key) => key.StartsWith("docs:") ? Load(Path.Combine(inputDir, "docs", key.Substring(5))) : Corpus(key);

    static readonly string[] SchemaPreds =
    {
        "IsAdditionalInformation", "IsAttributeOrType", "IsAttribute", "IsAttributeMirror", "IsAttributeNameMapping", "IsAttributeType",
        "IsAttributeTypeLib", "IsBasicAttribute", "IsCAEXClass", "IsCAEXFile", "IsElementWithMandatoryID", "IsElementWithIDReference",
        "IsElementWithNameAndIDReference", "IsElementWithNameOnlyReference", "IsElementWithPathReference", "IsElementWithPossibleIDReference",
        "IsExternalInterface", "IsExternalReference", "IsFacet", "IsICMirror", "IsIEMirror", "IsInstanceHierarchy",
        "IsInterfaceAttributeReferenceWithID", "IsInterfaceClass", "IsInterfaceClassLib", "IsInterfaceIDMapping", "IsInterfaceNameMapping",
        "IsInternalElement", "IsInternalLink", "IsLibrary", "IsMappingElement", "IsMirrorElement", "IsNewVersion", "IsOldVersion",
        "IsVersionReference", "IsRevision", "IsRoleClass", "IsRoleClassLib", "IsRoleRequirement", "IsSupportedRoleClass",
        "IsSystemUnitClass", "IsSystemUnitClassLib",
    };

    static readonly Type TSchema = typeof(XmlOperation).Assembly.GetType("Aml.Engine.Xml.Extensions.XmlCAEXSchema", true)!;
    static readonly Type TAttrs = typeof(XmlOperation).Assembly.GetType("Aml.Engine.Xml.Extensions.XmlCAEXAttributes", true)!;
    static readonly Type TMap = typeof(XmlOperation).Assembly.GetType("Aml.Engine.Xml.Extensions.XmlCAEXMapping", true)!;
    static readonly Type TClass = typeof(XmlOperation).Assembly.GetType("Aml.Engine.Xml.Extensions.XmlClassOperation", true)!;

    static object? Pred(string name, XElement e) => name switch
    {
        "IsCAEXClass" => InvT(TSchema, name, new[] { typeof(XElement), typeof(bool) }, e, true),
        "IsInterfaceAttributeReferenceWithID" => InvT(TSchema, name, new[] { typeof(XElement), typeof(string) }, e, ""),
        _ => InvT(TSchema, name, new[] { typeof(XElement) }, e),
    };

    static string Bits(XElement e)
    {
        var sb = new StringBuilder();
        foreach (var n in SchemaPreds)
        {
            try { sb.Append((bool)Pred(n, e)! ? '1' : '0'); }
            catch { sb.Append('!'); }
        }
        return sb.ToString();
    }

    static string Short(string? s) => s == null ? "null" : s.Length > 80 ? "#" + Hash(s) : s;

    /// <summary>An element by its index in the document (or its name when it is not in the document).</summary>
    static string Desc(XElement? x, List<XElement> all)
    {
        if (x == null) return "null";
        var i = all.IndexOf(x);
        return i >= 0 ? "#" + i : "ext:" + x.Name.LocalName + "/" + (x.Attribute("Name")?.Value ?? "");
    }

    static string Descs(IEnumerable<XElement>? xs, List<XElement> all) => xs == null ? "null" : "[" + string.Join(",", xs.Select(x => Desc(x, all))) + "]";

    static string Tuples(object? o)
    {
        var parts = new List<string>();
        foreach (var t in (IEnumerable)o!)
        {
            var tt = (ValueTuple<string, string>)t;
            parts.Add(tt.Item1 + "=" + N(tt.Item2));
        }
        return "[" + string.Join(",", parts) + "]";
    }

    static void XmlExtSection(JsonObject o)
    {
        foreach (var key in SweepDocs)
            Case(o, key, r => XmlSweep(r, Doc(key)));
        Case(o, "edges", XmlEdges);
    }

    static XElement? El(object? o) => (XElement?)o;

    static void XmlSweep(Rec r, CAEXDocument doc)
    {
        var root = doc.XDocument.Root!;
        var all = root.DescendantsAndSelf().ToList();
        var xo = new[] { typeof(XObject), typeof(string) };
        for (var i = 0; i < all.Count; i++)
        {
            var e = all[i];
            var ns = e.Name.Namespace;
            var p = "#" + i + ":" + e.Name.LocalName;
            r.Add(p + "|bits=" + Bits(e));
            r.V(p + "|iaref", () => InvT(TSchema, "IsInterfaceAttributeReferenceWithID", new[] { typeof(XElement), typeof(string) }, e, "id-ei1"));
            r.V(p + "|classNoLib", () => InvT(TSchema, "IsCAEXClass", new[] { typeof(XElement), typeof(bool) }, e, false));
            r.V(p + "|idRef", () => InvT(TSchema, "IsElementWithIDReference", new[] { typeof(XElement), typeof(string) }, e, "id-ei1"));
            r.V(p + "|pathRef", () => InvT(TSchema, "IsElementWithPathReference", new[] { typeof(XElement), typeof(string) }, e, "ICLib/IC1"));
            r.V(p + "|refs", () => F(Inv(TSchema, "NameReferenceAttributes", e)) + F(Inv(TSchema, "PathReferenceAttributes", e)) + F(Inv(TSchema, "IDReferenceAttributes", e))
                + "|" + F(Inv(TSchema, "PathReferenceAttributeName", e)) + "|" + F(Inv(TSchema, "PathReferenceValue", e)));
            r.V(p + "|name", () => InvT(TSchema, "Name", new[] { typeof(XObject) }, e));
            r.V(p + "|value", () => Short((string?)InvT(TSchema, "Value", new[] { typeof(XObject) }, e)));
            r.V(p + "|refEl", () => Desc(El(InvT(TSchema, "ReferencedElement", xo, e, null)), all));
            r.V(p + "|refElNew", () => Desc(El(InvT(TSchema, "ReferencedElement", xo, e, "ICLib/IC1")), all));
            r.V(p + "|manager", () => Inv(TSchema, "SchemaManager", e)!.GetType().Name);
            r.V(p + "|xname", () => Inv(TSchema, "XName", e, "Attribute"));
            // XmlClassOperation
            r.V(p + "|baseClass", () => Desc(El(Inv(TClass, "BaseClass", e)), all));
            r.V(p + "|hierarchy", () => Descs((IEnumerable<XElement>?)Inv(TClass, "GetReferenceHierarchy", e), all));
            if (e.Parent != null)
            {
                r.V(p + "|derivedAttr", () => Inv(TClass, "IsDerived", e, e.Parent, ns + "Attribute", "Name"));
                r.V(p + "|derivedIH", () => Inv(TClass, "IsDerived", e, root, (XName)"InstanceHierarchy", "Name"));
            }
            r.V(p + "|descendant", () => B((bool)Inv(TClass, "IsDescendant", e, root, true)!) + B((bool)Inv(TClass, "IsDescendant", e, root, false)!)
                + B((bool)Inv(TClass, "IsDescendant", e, e, false)!) + B((bool)Inv(TClass, "IsDescendant", root, e, true)!));
            r.V(p + "|facetElement", () => Inv(TClass, "IsFacetElement", e));
            r.V(p + "|overridden", () => Inv(TClass, "IsOverridden", e));
            r.V(p + "|library", () => Desc(El(Inv(TClass, "Library", e, ns + "InstanceHierarchy")), all) + "|" + N((string?)Inv(TClass, "LibraryName", e, ns + "SystemUnitClassLib")));
            r.V(p + "|overriddenElements", () => Descs((IEnumerable<XElement>?)Inv(TClass, "OverriddenElements", e, e.Attribute("Name")?.Value), all));
            // XmlOperation
            r.V(p + "|first", () => Desc(El(InvT(typeof(XmlOperation), "FirstElement", new[] { typeof(XElement) }, e)), all)
                + Desc(El(InvT(typeof(XmlOperation), "FirstElement", new[] { typeof(XElement), typeof(string) }, e, "Attribute")), all)
                + Desc(El(InvT(typeof(XmlOperation), "LastElement", new[] { typeof(XElement) }, e)), all)
                + Desc(El(InvT(typeof(XmlOperation), "LastElement", new[] { typeof(XElement), typeof(XName) }, e, ns + "Attribute")), all));
            // XmlCAEXMapping
            r.V(p + "|mapping", () => T(() => Inv(TMap, "MappingPathToRoleReference", e)) + "|" + T(() => Inv(TMap, "MappingPathToSystemUnitClassReference", e))
                + "|" + T(() => Desc(El(Inv(TMap, "RoleReferenceToMapping", e)), all)) + "|" + T(() => Desc(El(Inv(TMap, "SystemUnitClassReferenceToMapping", e)), all)));
            // XmlCAEXAttributes
            r.V(p + "|attrs", () => T(() => Inv(TAttrs, "CAEXPath", e)) + "|" + T(() => Inv(TAttrs, "RoleReference", e)) + "|" + T(() => Inv(TAttrs, "SystemUnitClassReference", e))
                + "|" + T(() => Inv(TAttrs, "AttributeMasterID", e)) + "|" + T(() => Inv(TAttrs, "ICMasterID", e)) + "|" + T(() => Inv(TAttrs, "IEMasterID", e))
                + "|" + T(() => Tuples(Inv(TAttrs, "IDReferencesInInternalLink", e))) + "|" + T(() => Tuples(Inv(TAttrs, "IDReferenceInMapping", e))));
            var isMapping = (bool)Inv(TSchema, "IsMappingElement", e)!;
            foreach (var a in e.Attributes())
            {
                var q = p + "@" + a.Name.LocalName;
                r.V(q, () => B((bool)Inv(TSchema, "IsAttributeReference", a)!) + B((bool)Inv(TSchema, "IsInternalLinkAttribute", a)!) + B((bool)Inv(TAttrs, "IsInheritanceAttribute", a)!)
                    + "|" + N((string?)InvT(TSchema, "Name", new[] { typeof(XObject) }, a)) + "|" + Short((string?)InvT(TSchema, "Value", new[] { typeof(XObject) }, a)));
                r.V(q + "|refEl", () => Desc(El(InvT(TSchema, "ReferencedElement", xo, a, null)), all));
                r.V(q + "|refElName", () => Desc(El(InvT(TSchema, "ReferencedElement", new[] { typeof(XAttribute), typeof(string) }, a, "id-ei1")), all));
                if (isMapping)
                {
                    r.V(q + "|fromMapping", () => Desc(El(Inv(TMap, "ReferencedElementFromMapping", a, null)), all));
                    r.V(q + "|fromMappingName", () => Desc(El(Inv(TMap, "ReferencedElementFromMapping", a, "x")), all));
                    r.V(q + "|roleFromMapping", () => Desc(El(Inv(TMap, "RoleFromMapping", a)), all));
                    r.V(q + "|sucFromMapping", () => Desc(El(Inv(TMap, "SystemUnitClassFromMapping", a)), all));
                }
                if (a.Name.LocalName is "RefPartnerSideA" or "RefPartnerSideB")
                    r.V(q + "|interface", () => Desc(El(Inv(typeof(XmlOperation), "InterfaceFromInternalLinkAttribute", a, "id-child:EI2")), all));
                if (a.Name.LocalName == "RefAttributeType")
                    r.V(q + "|master", () => Desc(El(Inv(typeof(XmlOperation), "MasterAttribute", a, "ATLib/AT2")), all));
            }
        }
    }

    static void XmlEdges(Rec r)
    {
        var all = new List<XElement>();
        var xo = new[] { typeof(XObject), typeof(string) };
        r.V("nameNull", () => InvT(TSchema, "Name", new[] { typeof(XObject) }, (object?)null));
        r.V("valueNull", () => InvT(TSchema, "Value", new[] { typeof(XObject) }, (object?)null));
        r.V("nameComment", () => InvT(TSchema, "Name", new[] { typeof(XObject) }, new XComment("c")));
        r.V("valueComment", () => InvT(TSchema, "Value", new[] { typeof(XObject) }, new XComment("c")));
        r.V("refElNull", () => InvT(TSchema, "ReferencedElement", xo, null, null));
        r.V("refElComment", () => InvT(TSchema, "ReferencedElement", xo, new XComment("c"), null));
        r.V("xnameNull", () => Inv(TSchema, "XName", null, "Attribute"));
        r.V("descendantNull", () => Inv(TClass, "IsDescendant", null, new XElement("a"), true));
        r.V("descendantNull2", () => Inv(TClass, "IsDescendant", null, null, false));
        r.V("mapRoleNull", () => Inv(TMap, "MappingPathToRoleReference", (object?)null));
        r.V("mapSucNull", () => Inv(TMap, "MappingPathToSystemUnitClassReference", (object?)null));
        r.V("interfaceNull", () => Inv(typeof(XmlOperation), "InterfaceFromInternalLinkAttribute", null, null));
        r.V("interfaceDetached", () => Inv(typeof(XmlOperation), "InterfaceFromInternalLinkAttribute", new XAttribute("RefPartnerSideA", "x"), null));
        r.V("masterNull", () => Inv(typeof(XmlOperation), "MasterAttribute", null, null));
        r.V("masterDetached", () => Inv(typeof(XmlOperation), "MasterAttribute", new XAttribute("RefAttributeType", "x"), null));
        r.V("wrapperNull", () => XmlOperation.CreateCAEXWrapper(null!));
        r.V("wrapperOther", () => XmlOperation.CreateCAEXWrapper(new XElement("Other")));
        var detached = new XElement("InternalElement", new XAttribute("Name", "x"), new XElement("Attribute", new XAttribute("Name", "a")));
        r.V("overriddenDetachedRoot", () => Descs((IEnumerable<XElement>?)Inv(TClass, "OverriddenElements", detached, "x"), all));
        r.V("overriddenDetachedChild", () => Descs((IEnumerable<XElement>?)Inv(TClass, "OverriddenElements", detached.Elements().First(), "a"), all));
        r.V("overriddenElementsFacet", () =>
        {
            var suc = new XElement("SystemUnitClass", new XAttribute("Name", "S"),
                new XElement("Attribute", new XAttribute("Name", "a")),
                new XElement("InternalElement", new XAttribute("Name", "F"), new XAttribute("ID", "f"),
                    new XElement("Attribute", new XAttribute("Name", "a")),
                    new XElement("RoleRequirements", new XAttribute("RefBaseRoleClassPath", "AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Facet"))));
            var fa = suc.Element("InternalElement")!.Element("Attribute")!;
            return Descs((IEnumerable<XElement>?)Inv(TClass, "OverriddenElements", fa, "a"), all) + B((bool)Inv(TClass, "IsFacetElement", fa)!) + B((bool)Inv(TClass, "IsOverridden", fa)!);
        });
        r.V("firstEmpty", () => InvT(typeof(XmlOperation), "FirstElement", new[] { typeof(XElement), typeof(string) }, new XElement("a"), "b"));
        r.V("firstText", () => Desc(El(InvT(typeof(XmlOperation), "FirstElement", new[] { typeof(XElement), typeof(string) }, new XElement("a", "t", new XElement("c"), new XElement("b")), "b")), all));
        r.V("firstTextNoName", () => Desc(El(InvT(typeof(XmlOperation), "FirstElement", new[] { typeof(XElement) }, new XElement("a", "t", new XElement("c")))), all));
    }
}
