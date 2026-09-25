using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.Services;
using Aml.Engine.Services.Interfaces;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

// Section "query": the public API of QueryService and the QueryResult extensions for every object
// of a set of documents, without and with the ID and path lookup tables.
public static partial class GapsServicesOracle
{
    static readonly string[] QueryDocs =
    {
        "docs:map215.aml", "docs:map30.aml", "12_MirrorObject.aml", "13_Facet.aml", "9_ExtInt_IntLink.aml", "10_RefSemantic.aml",
        "6_RCL.aml", "5_SUC.aml", "legacy-caex215.aml", "Topology.aml", "plant.aml", "bottling-line.links.aml",
        "AutomationML_Base_Libraries_AMLEd2_2.11.0.aml",
    };

    static string Long(string s) => s.Length > 300 ? "#" + Hash(s) + "/" + s.Length : s;

    static string R(ICAEXReference? r) => r == null ? "null" : D(r.CaexObject) + "." + N(r.ReferenceAttributeName) + "=" + N(r.ReferenceAttributeValue);

    static string Rs(IEnumerable<ICAEXReference>? rs) => rs == null ? "null" : Long("[" + string.Join(",", rs.Select(R)) + "]");

    static string LK(ILookup<string, ICAEXReference>? lk) =>
        lk == null ? "null" : Long(lk.Count + "{" + string.Join(";", lk.Select(g => N(g.Key) + ":[" + string.Join(",", g.Select(R)) + "]")) + "}");

    static string Ws(IEnumerable<CAEXWrapper?>? ws) => ws == null ? "null" : Long("[" + string.Join(",", ws.Select(w => D(w))) + "]");

    static void QuerySection(JsonObject o)
    {
        foreach (var key in QueryDocs)
        {
            Case(o, key + ":plain", r => QuerySweep(r, Doc(key), false));
            Case(o, key + ":tables", r => QuerySweep(r, Doc(key), true));
        }
        Case(o, "edges", QueryEdges);
    }

    static void QuerySweep(Rec r, CAEXDocument doc, bool tables)
    {
        var q = ServiceLocator.QueryService;
        var qs = (QueryService)q;
        if (tables)
        {
            r.Do("loadID", () => qs.LoadIDTable(doc));
            r.Do("loadPath", () => qs.LoadPathTable(doc));
        }
        r.V("idLoaded", () => qs.IDTableIsLoaded(doc));
        r.V("pathLoaded", () => qs.PathTableIsLoaded(doc));
        r.V("docIdentified", () => LK(doc.AllElementsIdentifiedByCAEXPath()));
        r.V("docAlias", () => LK(doc.AllElementsWithAliasReference()));
        r.V("docPathRef", () => LK(doc.AllElementsWithCAEXPathReference()));
        r.V("docIdRef", () => LK(doc.AllElementsWithIDReference()));
        r.V("docIds", () => LK(doc.AllElementsWithIDs()));
        r.V("docNameRef", () => LK(doc.AllElementsWithNameReference()));
        r.V("docMasters", () => Ws(doc.AllInternalElementMasters()));
        r.V("docMirrors", () => Ws(doc.AllInternalElementMirrors()));
        r.V("docILRelations", () => Ws(doc.ElementsWithInternalLinkRelations()));
        var idRefs = doc.AllElementsWithIDReference();
        r.V("lkObjects", () => Ws(idRefs.AllCaexObjects()));
        r.V("lkOfType", () => Ws(idRefs.CaexObjectsOfType<InternalElementType>()));
        r.V("lkInterfaces", () => Ws(idRefs.ExternalInterfaces()));
        r.V("lkIEs", () => Ws(idRefs.InternalElements()));
        r.V("lkLinks", () => Ws(idRefs.InternalLinks()));
        r.V("lkWithName", () => Ws(idRefs.ReferencesWithName("RefPartnerSideA")));
        var pathRefs = doc.AllElementsWithCAEXPathReference();
        r.V("lkPathWithName", () => Ws(pathRefs.ReferencesWithName("RefBaseSystemUnitPath")));
        r.V("lkPathOfType", () => Ws(pathRefs.CaexObjectsOfType<SystemUnitClassType>()));
        foreach (var er in doc.CAEXFile.ExternalReference)
        {
            var alias = er.Alias;
            r.V("docAliasRef:" + alias, () => Rs(doc.ElementsWithAliasReference(alias)));
            r.V("aliasRef:" + alias, () => Rs(q.ElementsWithAliasReference(doc.CAEXFile, alias, "InternalElement")));
        }
        r.V("dataRefs", () => Ws(q.AllExternalDataReferences(doc)));
        r.V("dataRefsFile", () => Ws(q.AllExternalDataReferences(doc, doc.CAEXFile)));
        r.V("ofType", () => Ws(q.AllExternalInterfacesOfType(doc, "ICLib/IC1")));
        r.V("ofTypeAml", () => Ws(q.AllExternalInterfacesOfType(doc, "AutomationMLInterfaceClassLib/AutomationMLBaseInterface/ExternalDataConnector")));
        var all = doc.XDocument.Root!.DescendantsAndSelf().ToList();
        for (var i = 0; i < all.Count; i++)
        {
            var w = all[i].CreateCAEXWrapper();
            if (w is not CAEXBasicObject bo) continue;
            var p = "#" + i + ":" + all[i].Name.LocalName;
            if (bo is CAEXObject co)
            {
                var path = co.CAEXPath();
                r.V(p + "|classRefs", () => Ws(q.AllClassReferences(co)));
                r.V(p + "|classRefsDeep", () => Ws(q.AllClassReferencesDeep(co)));
                r.V(p + "|classRefsDoc", () => Ws(q.AllClassReferences(doc, path, "InternalElement")));
                r.V(p + "|classRefsDeepDoc", () => Ws(q.AllClassReferencesDeep(doc, path)));
                r.V(p + "|referenced", () => q.IsReferenced(co));
                r.V(p + "|pathRef", () => Rs(q.ElementsWithCAEXPathReference(doc.CAEXFile, path)));
                r.V(p + "|pathRefDoc", () => Rs(doc.ElementsWithCAEXPathReference(path)));
                r.V(p + "|findByPath", () => D(q.FindByPath(doc, path)));
                if (co.ID != null)
                {
                    r.V(p + "|idRef", () => Rs(q.ElementsWithIDReference(doc.CAEXFile, co.ID)));
                    r.V(p + "|idRefIE", () => Rs(q.ElementsWithIDReference(co, co.ID, "InternalElement")));
                    r.V(p + "|idRefDoc", () => Rs(doc.ElementsWithIDReference(co.ID)));
                    r.V(p + "|ids", () => LK(q.AllElementsWithIDs(co, co.ID)));
                    r.V(p + "|findByID", () => D(q.FindByID(doc, co.ID)) + D(q.FindByID(doc, co.ID, true, typeof(InternalElementType))) + D(q.FindByID(doc, co.ID, false, typeof(ExternalInterfaceType))));
                }
            }
            r.V(p + "|idsAll", () => LK(q.AllElementsWithIDs(bo)));
            r.V(p + "|withLinks", () => Ws(q.AllElementsWithInternalLinks(bo)));
            r.V(p + "|ieWithLinks", () => Ws(q.AllInternalElementsWithInternalLinks(bo)));
            r.V(p + "|linkRelations", () => Ws(q.ElementsWithInternalLinkRelations(bo)));
            r.V(p + "|ifRelations", () => Ws(q.InterfacesWithInternalLinkRelations(bo)));
            r.V(p + "|identified", () => LK(q.AllElementsIdentifiedByCAEXPath(bo)));
            r.V(p + "|nameRef", () => LK(q.AllElementsWithNameReference(bo, "InternalLink")));
            r.V(p + "|pathRefAll", () => LK(q.AllElementsWithCAEXPathReference(bo, "", true)));
            r.V(p + "|pathRefAllIE", () => LK(q.AllElementsWithCAEXPathReference(bo, "InternalElement", true)));
            r.V(p + "|aliasAll", () => LK(q.AllElementsWithAliasReference(bo, "SystemUnitClass")));
            r.V(p + "|idRefAll", () => LK(q.AllElementsWithIDReference(bo, "InternalLink")));
            switch (bo)
            {
                case InternalElementType ie:
                    r.V(p + "|ieMirrors", () => Ws(q.InternalElementMirrors(ie)));
                    r.V(p + "|ieMirrorsExt", () => Ws(ie.InternalElementMirrors()));
                    r.V(p + "|ieMaster", () => q.IsMaster(ie));
                    break;
                case ExternalInterfaceType ei:
                    r.V(p + "|eiMirrors", () => Ws(q.ExternalInterfaceMirrors(ei)));
                    r.V(p + "|eiMaster", () => q.IsMaster(ei));
                    r.V(p + "|linksToIf", () => Ws(q.InternalLinksToInterface(ei)));
                    r.V(p + "|linksToIfExt", () => Ws(ei.InternalLinksToInterface()));
                    break;
                case AttributeType at:
                    r.V(p + "|atMirrors", () => Ws(q.AttributeMirrors(at)));
                    r.V(p + "|atMaster", () => q.IsMaster(at));
                    break;
            }
            if (bo is SystemUnitClassType suc)
            {
                r.V(p + "|linksToEl", () => Ws(q.InternalLinksToElement(suc)));
                r.V(p + "|linksToElExt", () => Ws(suc.InternalLinksToElement()));
            }
        }
        if (tables)
        {
            r.Do("unloadID", () => qs.UnloadIDTable(doc));
            r.Do("unloadPath", () => qs.UnloadPathTable(doc));
            r.V("idLoaded2", () => qs.IDTableIsLoaded(doc));
            r.V("pathLoaded2", () => qs.PathTableIsLoaded(doc));
        }
    }

    static void QueryEdges(Rec r)
    {
        var q = ServiceLocator.QueryService;
        var qs = (QueryService)q;
        var doc = Doc("docs:map30.aml");
        r.V("atMirrorsNull", () => Ws(q.AttributeMirrors(null!)));
        r.V("eiMirrorsNull", () => Ws(q.ExternalInterfaceMirrors(null!)));
        r.V("ieMirrorsNull", () => Ws(q.InternalElementMirrors(null!)));
        r.V("linksToElNull", () => Ws(q.InternalLinksToElement(null!)));
        r.V("linksToIfNull", () => Ws(q.InternalLinksToInterface(null!)));
        r.V("idRefNull", () => Rs(q.ElementsWithIDReference(null!, "x")));
        r.V("pathRefNull", () => Rs(q.ElementsWithCAEXPathReference(null!, "x")));
        r.V("idRefNullId", () => Rs(q.ElementsWithIDReference(doc.CAEXFile, null!)));
        r.V("pathRefNullPath", () => Rs(q.ElementsWithCAEXPathReference(doc.CAEXFile, null!)));
        r.V("findByIDNull", () => D(q.FindByID(null!, "x")));
        r.V("findByPathNull", () => D(q.FindByPath(null!, "x")));
        r.V("findByIDNullId", () => D(q.FindByID(doc, null!)));
        r.V("findByPathNullPath", () => D(q.FindByPath(doc, null!)));
        r.V("idLoadedNull", () => qs.IDTableIsLoaded(null!));
        r.V("pathLoadedNull", () => qs.PathTableIsLoaded(null!));
        // Detached objects (no document) with and without loaded tables.
        var ie = CAEXDocument.New_CAEXDocument().CAEXFile.InstanceHierarchy.Append("IH").InternalElement.Append("Detached");
        ie.Remove();
        foreach (var tables in new[] { false, true })
        {
            if (tables)
            {
                qs.LoadIDTable(doc);
                qs.LoadPathTable(doc);
            }
            var t = tables ? "T" : "P";
            r.V(t + "detachedIds", () => LK(q.AllElementsWithIDs(ie)));
            r.V(t + "detachedIdsId", () => LK(q.AllElementsWithIDs(ie, "x")));
            r.V(t + "detachedIdentified", () => LK(q.AllElementsIdentifiedByCAEXPath(ie)));
            r.V(t + "detachedReferenced", () => q.IsReferenced(ie));
            r.V(t + "detachedMaster", () => q.IsMaster(ie));
            r.V(t + "detachedMirrors", () => Ws(q.InternalElementMirrors(ie)));
            r.V(t + "detachedLinks", () => Ws(q.InternalLinksToElement(ie)));
            r.V(t + "detachedClassRefs", () => Ws(q.AllClassReferences(ie)));
            r.V(t + "detachedClassRefsDeep", () => Ws(q.AllClassReferencesDeep(ie)));
            r.V(t + "missingId", () => LK(q.AllElementsWithIDs(doc.CAEXFile, "no-such-id")));
            r.V(t + "findMissing", () => D(q.FindByID(doc, "no-such-id")) + D(q.FindByPath(doc, "No/Such/Path")));
        }
        qs.UnloadIDTable(doc);
        qs.UnloadPathTable(doc);
        // A detached element with content: IDs below it and its InternalLinks.
        var d3 = Doc("docs:map30.aml");
        var ie1 = d3.CAEXFile.InstanceHierarchy.First().InternalElement.First();
        ie1.Remove();
        r.V("detachedContentIds", () => LK(q.AllElementsWithIDs(ie1, "id-child")) + LK(q.AllElementsWithIDs(ie1, "id-ei1")));
        r.V("detachedContentLinks", () => Ws(q.InternalLinksToElement(ie1)));
        r.V("detachedChildLinks", () => Ws(q.InternalLinksToElement(ie1.InternalElement.First())));
        r.V("emptyLookup", () => LK(EmptyLookup<string, ICAEXReference>.Instance));
        r.V("emptyLookupCount", () => EmptyLookup<string, ICAEXReference>.Instance.Count);
        r.V("emptyLookupItem", () => Rs(EmptyLookup<string, ICAEXReference>.Instance["x"]));
        r.V("emptyLookupContains", () => EmptyLookup<string, ICAEXReference>.Instance.Contains("x"));
        r.V("emptyLookupKeySelector", () =>
        {
            var p = typeof(EmptyLookup<string, ICAEXReference>).GetProperty("KeySelector", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic)!;
            var f = (Func<ICAEXReference, string>)p.GetValue(null)!;
            return f(null!);
        });
        var lk = doc.AllElementsWithIDs();
        r.V("lookupCount", () => lk.Count);
        r.V("lookupItem", () => Rs(lk["id-ei1"]));
        r.V("lookupItemMissing", () => Rs(lk["nope"]));
        r.V("lookupContains", () => B(lk.Contains("id-ei1")) + B(lk.Contains("nope")));
    }
}
