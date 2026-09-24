using System.Collections;
using System.Reflection;
using System.Text.Json.Nodes;
using System.Xml.Schema;
using Aml.Engine.Schema;

namespace Oracle;

/// <summary>
/// Exports the schema tables the engine compiled from its embedded CAEX XSDs (the internal
/// Elements dictionary of XmlSchemaManager) plus the full content model, so the JS port uses
/// exactly the same data instead of re-deriving it from the XSD.
/// </summary>
public static class SchemaDump
{
    public static JsonObject Export(XmlSchemaManager manager)
    {
        var field = typeof(XmlSchemaManager).GetField("Elements", BindingFlags.Instance | BindingFlags.NonPublic)!;
        var elements = (Dictionary<string, XmlSchemaElementInfo>)field.GetValue(manager)!;
        var ids = new Dictionary<XmlSchemaElementInfo, int>(ReferenceEqualityComparer.Instance);
        var infos = new JsonArray();
        var keys = new JsonObject();
        foreach (var (key, info) in elements)
        {
            if (!ids.TryGetValue(info, out var id))
            {
                id = ids.Count;
                ids[info] = id;
                infos.Add(Info(manager, info));
            }
            keys[key] = id;
        }
        return new JsonObject
        {
            ["namespace"] = manager.Namespace.NamespaceName,
            ["keys"] = keys,
            ["infos"] = infos,
        };
    }

    static JsonObject Info(XmlSchemaManager manager, XmlSchemaElementInfo info)
    {
        var e = info.SchemaElement;
        var type = e.ElementSchemaType;
        var o = new JsonObject
        {
            ["name"] = e.Name,
            ["minOccurs"] = Occurs(e.MinOccurs),
            ["maxOccurs"] = Occurs(e.MaxOccurs),
            ["parent"] = Kind(e.Parent),
            ["parentMaxOccurs"] = e.Parent is XmlSchemaParticle pp ? Occurs(pp.MaxOccurs) : null,
            ["defaultValue"] = e.DefaultValue,
            ["fixedValue"] = e.FixedValue,
            ["typeName"] = type?.QualifiedName?.Name,
            ["typeKind"] = type switch { XmlSchemaComplexType => "complex", XmlSchemaSimpleType => "simple", _ => null },
            ["typeCode"] = type == null ? null : (type.Datatype?.TypeCode ?? type.TypeCode).ToString(),
            ["acceptsAny"] = XmlSchemaManager.AcceptsAny(e),
            ["isChoiceForOneElement"] = XmlSchemaManager.IsChoiceForOneElement(e),
            ["annotation"] = manager.GetAnnotation(e),
            ["optional"] = Names(info.Optional.Select(n => n.LocalName)),
            ["required"] = Names(info.Required.Select(n => n.LocalName)),
            ["choices"] = Names(info.Choices.Select(n => n.LocalName)),
            ["withoutChoice"] = Names(info.WithoutChoice.Select(n => n.LocalName)),
            ["attributes"] = new JsonArray(info.AllAttributes.Select(a => (JsonNode)Attribute(manager, a)).ToArray()),
            ["requiredAttributes"] = Names(info.RequiredAttributes.Select(a => a.Name)),
        };
        if (type is XmlSchemaComplexType ct)
        {
            o["contentType"] = ct.ContentType.ToString();
            o["isMixed"] = ct.IsMixed;
            o["simpleContent"] = ct.ContentModel is XmlSchemaSimpleContent;
            o["particle"] = Particle(ct.ContentTypeParticle);
            o["anyAttribute"] = ct.AttributeWildcard != null;
        }
        if (type is XmlSchemaSimpleType st) o["simpleType"] = SimpleType(st);
        else if (type is XmlSchemaComplexType { ContentType: XmlSchemaContentType.TextOnly } ctt && ctt.Datatype != null)
            o["simpleType"] = new JsonObject { ["typeCode"] = ctt.Datatype.TypeCode.ToString() };
        return o;
    }

    static JsonObject Attribute(XmlSchemaManager manager, XmlSchemaAttribute a) => new()
    {
        ["name"] = a.Name,
        ["namespace"] = a.QualifiedName.Namespace,
        ["use"] = a.Use.ToString(),
        ["defaultValue"] = a.DefaultValue,
        ["fixedValue"] = a.FixedValue,
        ["typeCode"] = XmlSchemaManager.AttributeValueType(a).ToString(),
        ["simpleType"] = a.AttributeSchemaType == null ? null : SimpleType(a.AttributeSchemaType),
        ["annotation"] = manager.GetAnnotation(a),
    };

    static JsonNode? Particle(XmlSchemaParticle? p)
    {
        switch (p)
        {
            case null:
                return null;
            case XmlSchemaElement el:
                return new JsonObject { ["kind"] = "element", ["name"] = el.QualifiedName.Name, ["min"] = Occurs(el.MinOccurs), ["max"] = Occurs(el.MaxOccurs) };
            case XmlSchemaAny any:
                return new JsonObject { ["kind"] = "any", ["min"] = Occurs(any.MinOccurs), ["max"] = Occurs(any.MaxOccurs), ["namespace"] = any.Namespace, ["processContents"] = any.ProcessContents.ToString() };
            case XmlSchemaGroupBase g:
                return new JsonObject
                {
                    ["kind"] = Kind(g),
                    ["min"] = Occurs(g.MinOccurs),
                    ["max"] = Occurs(g.MaxOccurs),
                    ["items"] = new JsonArray(g.Items.Cast<XmlSchemaObject>().Select(i => Particle(i as XmlSchemaParticle)).ToArray()),
                };
            default:
                if (p.GetType().Name == "EmptyParticle") return null;
                return new JsonObject { ["kind"] = p.GetType().Name };
        }
    }

    static JsonObject SimpleType(XmlSchemaSimpleType st)
    {
        var o = new JsonObject
        {
            ["name"] = st.QualifiedName.IsEmpty ? null : st.QualifiedName.Name,
            ["typeCode"] = (st.Datatype?.TypeCode ?? st.TypeCode).ToString(),
            ["variety"] = st.Datatype?.Variety.ToString(),
        };
        var facets = new JsonArray();
        for (XmlSchemaSimpleType? t = st; t != null; t = t.BaseXmlSchemaType as XmlSchemaSimpleType)
        {
            if (t.Content is XmlSchemaSimpleTypeRestriction r)
                foreach (XmlSchemaObject f in r.Facets)
                    if (f is XmlSchemaFacet facet)
                        facets.Add(new JsonObject { ["kind"] = facet.GetType().Name.Replace("XmlSchema", "").Replace("Facet", ""), ["value"] = facet.Value, ["owner"] = t.QualifiedName.IsEmpty ? null : t.QualifiedName.Name });
            if (t.Content is XmlSchemaSimpleTypeUnion u)
                o["union"] = new JsonArray(u.BaseMemberTypes.Select(m => (JsonNode)SimpleType(m)).ToArray());
            if (t.Content is XmlSchemaSimpleTypeList l && l.BaseItemType != null)
                o["list"] = SimpleType(l.BaseItemType);
        }
        o["facets"] = facets;
        return o;
    }

    static string? Kind(XmlSchemaObject? o) => o switch
    {
        XmlSchemaSequence => "sequence",
        XmlSchemaChoice => "choice",
        XmlSchemaAll => "all",
        null => null,
        _ => o.GetType().Name,
    };

    static JsonNode Occurs(decimal d) => d == decimal.MaxValue ? JsonValue.Create("unbounded")! : JsonValue.Create((int)d)!;

    static JsonArray Names(IEnumerable<string?> names) => new(names.Select(n => (JsonNode?)n).ToArray());
}
