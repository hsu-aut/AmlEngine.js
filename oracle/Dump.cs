using System.Text.Json.Nodes;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;

namespace Oracle;

/// <summary>
/// Walks a loaded document through the typed API and records everything the engine
/// computes on read. The JS engine produces the same structure in test/oracle/dump.ts.
/// </summary>
public static class Dump
{
    public static JsonObject Document(CAEXDocument doc)
    {
        var file = doc.CAEXFile;
        var root = new JsonObject
        {
            ["schema"] = doc.SchemaVersionString,
            ["fileName"] = Try(() => file.FileName),
            ["schemaVersion"] = Try(() => file.SchemaVersion),
        };
        var ext = new JsonArray();
        foreach (var er in file.ExternalReference)
        {
            var eo = new JsonObject();
            Set(eo, "alias", () => er.Alias);
            Set(eo, "path", () => er.Path);
            ext.Add(eo);
        }
        root["externalReferences"] = ext;

        var sdi = new JsonArray();
        foreach (var s in file.SourceDocumentInformation)
        {
            var so = new JsonObject();
            Set(so, "originName", () => s.OriginName);
            Set(so, "originID", () => s.OriginID);
            Set(so, "originVersion", () => s.OriginVersion);
            Set(so, "lastWritingDateTime", () => s.Node.Attribute("LastWritingDateTime")?.Value);
            sdi.Add(so);
        }
        root["sourceDocumentInformation"] = sdi;

        var objs = new JsonArray();
        foreach (var ih in file.InstanceHierarchy) Walk(doc, ih, objs);
        foreach (var lib in file.InterfaceClassLib) Walk(doc, lib, objs);
        foreach (var lib in file.RoleClassLib) Walk(doc, lib, objs);
        foreach (var lib in file.SystemUnitClassLib) Walk(doc, lib, objs);
        foreach (var lib in file.AttributeTypeLib) Walk(doc, lib, objs);
        root["objects"] = objs;
        return root;
    }

    static void Walk(CAEXDocument doc, ICAEXWrapper w, JsonArray objs)
    {
        var o = new JsonObject { ["tag"] = w.Node.Name.LocalName };
        if (w is CAEXObject co)
        {
            Set(o, "name", () => co.Name);
            Set(o, "id", () => co.ID);
            Set(o, "path", () => co.CAEXPath());
            Set(o, "findByPath", () => Id(doc.FindByPath(co.CAEXPath())));
            if (Only is null or "findByID" && !string.IsNullOrEmpty(co.ID))
                Set(o, "findByID", () => Tag(doc.FindByID(co.ID)));
        }
        if (w is CAEXBasicObject bo)
        {
            Set(o, "description", () => bo.Description);
            Set(o, "version", () => bo.Version);
        }
        objs.Add(o);

        switch (w)
        {
            case InstanceHierarchyType ih:
                foreach (var ie in ih.InternalElement) Walk(doc, ie, objs);
                break;

            case InternalElementType ie:
                Set(o, "refBaseSystemUnitPath", () => ie.RefBaseSystemUnitPath);
                Set(o, "systemUnitClass", () => Path(ie.SystemUnitClass));
                Set(o, "isMirror", () => ie.IsMirror);
                Set(o, "masterID", () => ie.MasterID);
                Set(o, "master", () => Id(ie.Master));
                SystemUnit(doc, ie, o, objs);
                foreach (var rr in ie.RoleRequirements) Walk(doc, rr, objs);
                break;

            case SystemUnitFamilyType suc:
                ClassRef(o, () => suc.RefBaseClassPath, () => suc.BaseClass, () => suc.ReferencedClassName,
                    () => suc.GetReferenceHierarchy());
                Set(o, "attributeAndInherited", () => Names(suc.AttributeAndInherited));
                Set(o, "externalInterfaceAndInherited", () => Names(suc.ExternalInterfaceAndInherited));
                Set(o, "internalElementAndInherited", () => Names(suc.InternalElementAndInherited));
                SystemUnit(doc, suc, o, objs);
                foreach (var sub in suc.SystemUnitClass) Walk(doc, sub, objs);
                break;

            case RoleFamilyType rc:
                ClassRef(o, () => rc.RefBaseClassPath, () => rc.BaseClass, () => rc.ReferencedClassName,
                    () => rc.GetReferenceHierarchy());
                Set(o, "attributeAndInherited", () => Names(rc.AttributeAndInherited));
                Set(o, "externalInterfaceAndInherited", () => Names(rc.ExternalInterfaceAndInherited));
                foreach (var a in rc.Attribute) Walk(doc, a, objs);
                foreach (var ei in rc.ExternalInterface) Walk(doc, ei, objs);
                foreach (var sub in rc.RoleClass) Walk(doc, sub, objs);
                break;

            case InterfaceFamilyType ic:
                ClassRef(o, () => ic.RefBaseClassPath, () => ic.BaseClass, () => ic.ReferencedClassName,
                    () => ic.GetReferenceHierarchy());
                Set(o, "attributeAndInherited", () => Names(ic.AttributeAndInherited));
                foreach (var a in ic.Attribute) Walk(doc, a, objs);
                foreach (var ei in ic.ExternalInterface) Walk(doc, ei, objs);
                foreach (var sub in ic.InterfaceClass) Walk(doc, sub, objs);
                break;

            case AttributeFamilyType at:
                ClassRef(o, () => at.RefBaseClassPath, () => at.BaseClass, () => at.ReferencedClassName,
                    () => at.GetReferenceHierarchy());
                Attr(at, o);
                foreach (var a in at.Attribute) Walk(doc, a, objs);
                foreach (var sub in at.AttributeType) Walk(doc, sub, objs);
                break;

            case InterfaceClassLibType lib:
                foreach (var c in lib.InterfaceClass) Walk(doc, c, objs);
                break;
            case RoleClassLibType lib:
                foreach (var c in lib.RoleClass) Walk(doc, c, objs);
                break;
            case SystemUnitClassLibType lib:
                foreach (var c in lib.SystemUnitClass) Walk(doc, c, objs);
                break;
            case AttributeTypeLibType lib:
                foreach (var c in lib.AttributeType) Walk(doc, c, objs);
                break;

            case ExternalInterfaceType ei:
                Set(o, "refBaseClassPath", () => ei.RefBaseClassPath);
                Set(o, "interfaceClass", () => Path(ei.InterfaceClass));
                Set(o, "isMirror", () => ei.IsMirror);
                Set(o, "masterID", () => ei.MasterID);
                Set(o, "associatedObject", () => Id(ei.AssociatedObject as CAEXObject));
                foreach (var a in ei.Attribute) Walk(doc, a, objs);
                foreach (var sub in ei.ExternalInterface) Walk(doc, sub, objs);
                break;

            case RoleRequirementsType rr:
                Set(o, "refBaseRoleClassPath", () => rr.RefBaseRoleClassPath);
                Set(o, "roleClass", () => Path(rr.RoleClass));
                foreach (var a in rr.Attribute) Walk(doc, a, objs);
                foreach (var ei in rr.ExternalInterface) Walk(doc, ei, objs);
                break;

            case SupportedRoleClassType src:
                Set(o, "refRoleClassPath", () => src.RefRoleClassPath);
                Set(o, "roleClass", () => Path(src.RoleClass));
                break;

            case InternalLinkType il:
                Set(o, "refPartnerSideA", () => il.RefPartnerSideA);
                Set(o, "refPartnerSideB", () => il.RefPartnerSideB);
                Set(o, "aInterface", () => Path(il.AInterface));
                Set(o, "bInterface", () => Path(il.BInterface));
                Set(o, "aSystemUnitClass", () => Id(il.ASystemUnitClass));
                Set(o, "bSystemUnitClass", () => Id(il.BSystemUnitClass));
                break;

            case AttributeType a:
                Attr(a, o);
                Set(o, "attributePath", () => a.AttributePath);
                Set(o, "isMirror", () => a.IsMirror);
                Set(o, "masterID", () => a.MasterID);
                Set(o, "attributeTypeReference", () => Path(a.AttributeTypeReference));
                foreach (var sub in a.Attribute) Walk(doc, sub, objs);
                break;
        }
    }

    static void SystemUnit(CAEXDocument doc, SystemUnitClassType s, JsonObject o, JsonArray objs)
    {
        foreach (var a in s.Attribute) Walk(doc, a, objs);
        foreach (var ei in s.ExternalInterface) Walk(doc, ei, objs);
        foreach (var src in s.SupportedRoleClass) Walk(doc, src, objs);
        foreach (var il in s.InternalLink) Walk(doc, il, objs);
        foreach (var ie in s.InternalElement) Walk(doc, ie, objs);
    }

    static void Attr(AttributeTypeType a, JsonObject o)
    {
        Set(o, "value", () => a.Value);
        Set(o, "defaultValue", () => a.DefaultValue);
        Set(o, "unit", () => a.Unit);
        Set(o, "attributeDataType", () => a.AttributeDataType);
        Set(o, "refAttributeType", () => a.RefAttributeType);
    }

    static void ClassRef(JsonObject o, Func<string> refPath, Func<CAEXObject?> baseClass,
        Func<string> refName, Func<IEnumerable<CAEXObject>> hierarchy)
    {
        Set(o, "refBaseClassPath", refPath);
        Set(o, "baseClass", () => Path(baseClass()));
        Set(o, "referencedClassName", refName);
        Set(o, "referenceHierarchy", () => new JsonArray(hierarchy().Select(c => (JsonNode?)c.CAEXPath()).ToArray()));
    }

    static JsonNode Names(IEnumerable<CAEXObject> seq) =>
        new JsonArray(seq.Select(c => (JsonNode?)c.Name).ToArray());

    static string? Path(ICAEXWrapper? w) => w is CAEXObject c ? c.CAEXPath() : null;

    static string? Id(ICAEXWrapper? w) =>
        w is CAEXObject c ? (string.IsNullOrEmpty(c.ID) ? "@" + c.CAEXPath() : c.ID) : null;

    static string? Tag(ICAEXWrapper? w) => w?.Node.Name.LocalName;

    /// <summary>When set, only this key is evaluated; used to find reads that mutate the document.</summary>
    public static string? Only;

    static void Set<T>(JsonObject o, string key, Func<T> f)
    {
        if (Only == null || Only == key) o[key] = Try(f);
    }

    /// <summary>Records a value, or the exception type the engine threw instead.</summary>
    static JsonNode? Try<T>(Func<T> f)
    {
        try
        {
            var v = f();
            return v switch
            {
                null => null,
                JsonNode n => n,
                bool b => JsonValue.Create(b),
                string s => JsonValue.Create(s),
                _ => JsonValue.Create(v.ToString()),
            };
        }
        catch (Exception e)
        {
            return JsonValue.Create("!" + e.GetType().Name);
        }
    }
}
