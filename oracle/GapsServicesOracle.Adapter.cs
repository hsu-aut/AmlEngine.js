#pragma warning disable CS0618
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.Adapter;
using Aml.Engine.CAEX;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

// Section "adapter": the obsolete AMLEngineAdapter extension methods and LinkedObjects.
public static partial class GapsServicesOracle
{
    static readonly string[] AdapterDocs = { "docs:map30.aml", "docs:map215.aml", "9_ExtInt_IntLink.aml", "11_Constraints.aml", "13_Facet.aml", "5_SUC.aml" };

    static void AdapterSection(JsonObject o)
    {
        foreach (var key in AdapterDocs)
        {
            Case(o, "read:" + key, r => AdapterReads(r, Doc(key)));
            Case(o, "write:" + key, r => AdapterWrites(r, key));
        }
    }

    static List<CAEXWrapper> AllWrappers(CAEXDocument doc) =>
        doc.XDocument.Root!.DescendantsAndSelf().Select(e => e.CreateCAEXWrapper()).Where(w => w != null).ToList()!;

    static void AdapterReads(Rec r, CAEXDocument doc)
    {
        var file = doc.CAEXFile;
        r.V("allWithLinks", () => Ws(file.AllElementsWithInternalLinks()));
        r.V("allIEWithLinks", () => Ws(file.AllInternalElementsWithInternalLinks()));
        r.V("getAllWithLinks", () => Ws(file.GetAllElementsWithInternalLinks()));
        r.V("externalReferences", () => Ws(file.ExternalReferences()));
        r.V("instanceHierarchies", () => Ws(file.InstanceHierarchies()));
        r.V("interfaceClassLibraries", () => Ws(file.InterfaceClassLibraries()));
        r.V("roleClassLibraries", () => Ws(file.RoleClassLibraries()));
        r.V("systemUnitClassLibraries", () => Ws(file.SystemUnitClassLibraries()));
        var all = doc.XDocument.Root!.DescendantsAndSelf().ToList();
        foreach (var w in AllWrappers(doc))
        {
            var p = "#" + all.IndexOf(w.Node) + ":" + w.Node.Name.LocalName;
            if (w is not CAEXBasicObject bo) continue;
            r.V(p + "|name", () => bo.Name());
            r.V(p + "|parent", () => D(file.GetParent(bo) as CAEXWrapper));
            r.V(p + "|check", () => B(bo.ConsistencyCheck_ClassReference("ICLib/IC1")) + B(bo.ConsistencyCheck_ClassReference("No/Path")) + B(bo.ConsistencyCheck_ClassReference(null!)));
            r.V(p + "|findIE", () => D(bo.findInternalElement("id-ie1")) + D(bo.findInternalElement("id-ei1")) + D(bo.findInternalElement(null!)));
            r.V(p + "|refClass", () => Desc(bo.getReferencedClass("ICLib/IC1"), all) + Desc(bo.getReferencedClass("x"), all));
            r.V(p + "|refGuid", () => N(bo.getReferencedGUID("id-a:EI")) + "|" + N(bo.getReferencedGUID("id-a")) + "|" + N(bo.getReferencedInterfaceName("id-a:EI")) + "|" + N(bo.getReferencedInterfaceName("")));
            r.V(p + "|refInterfaceClass", () => D(bo.getReferencedInterfaceClass("ICLib/IC1")) + D(bo.getReferencedInterfaceClass("ICLib/IC1/IC1Child")) + D(bo.getReferencedInterfaceClass("x")));
            if (bo is IObjectWithAttributes oa)
            {
                var first = oa.Attribute.FirstOrDefault()?.Name;
                r.V(p + "|attributes", () => Ws(oa.Attributes()) + Ws(oa.getAttributeField()));
                r.V(p + "|attributeValue", () => N(oa.GetAttributeValue(first!)) + "|" + N(oa.GetAttributeValue("missing")));
            }
            if (bo is IObjectWithExternalInterface oe)
            {
                var first = oe.ExternalInterface.FirstOrDefault()?.Name;
                r.V(p + "|interfaces", () => Ws(oe.ExternalInterfaces()) + Ws(oe.GetExternalInterfaces("x")));
                r.V(p + "|findInterface", () => D(oe.findExternalInterface(first!)) + D(oe.findExternalInterface("missing")));
            }
            if (bo is IInternalElementContainer ic) r.V(p + "|children", () => Ws(ic.InternalElementChildren()));
            if (bo is SystemUnitClassType suc)
            {
                r.V(p + "|ancestors", () => Ws(suc.Ancestors()));
                var links = suc.getLinkedObjects();
                for (var i = 0; i < links.Count; i++)
                {
                    var l = links[i];
                    r.V(p + "|link" + i, () => D(l.InternalLink) + "|" + D(l.RefPartnerSideAElement) + "|" + D(l.RefPartnerSideBElement) + "|" + D(l.RefPartnerSideAExternalInterface) + "|" + D(l.RefPartnerSideBExternalInterface));
                    r.V(p + "|link" + i + ":string", () => l.ToString());
                }
            }
            if (bo is SystemUnitFamilyType suf) r.V(p + "|sucChildren", () => Ws(suf.SystemUnitClassChildren()));
            if (bo is InternalElementType ie)
            {
                r.V(p + "|className", () => ie.GetClassName());
                r.V(p + "|refSuc", () => D(ie.getReferencedSystemUnitClass()));
                r.V(p + "|facetGroupPort", () => B(ie.IsFacet()) + B(ie.IsGroup()) + B(ie.IsPort()));
            }
            if (bo is InterfaceClassType ict) r.V(p + "|icClassName", () => ict.GetClassName());
        }
        r.V("classNameNullIE", () => ((InternalElementType)null!).GetClassName());
        r.V("classNameNullIC", () => ((InterfaceClassType)null!).GetClassName());
        r.V("nameNull", () => ((CAEXBasicObject)null!).Name());
    }

    static void AdapterWrites(Rec r, string key)
    {
        void Step(string label, Func<CAEXDocument, object?> f)
        {
            var doc = Doc(key);
            r.V(label, () => f(doc));
            r.Add(label + ":doc=" + Hash(r.C.Apply(SaveString(doc))));
        }
        InternalElementType? IE(CAEXDocument d, int n = 0) => AllWrappers(d).OfType<InternalElementType>().Skip(n).FirstOrDefault();
        var fresh = CAEXDocument.New_CAEXDocument(Doc(key).Schema);
        InternalElementType NewIE(string name)
        {
            var x = fresh.CAEXFile.InstanceHierarchy.Append("Tmp").InternalElement.Append(name);
            x.Remove();
            return x;
        }
        Step("assignNewGUIDs", d => { IE(d)?.AssignNewGUIDs(); return D(IE(d)); });
        Step("assignRedirect", d => { var s = AllWrappers(d).OfType<SystemUnitClassType>().FirstOrDefault(); InvT(typeof(AMLEngineAdapter), "AssignNewGUIDsAndRedirectExistingInternalLinks", new[] { typeof(SystemUnitClassType), typeof(bool) }, s, true); return "ok"; });
        Step("assignRedirectMirror", d => { var s = AllWrappers(d).OfType<SystemUnitClassType>().FirstOrDefault(); InvT(typeof(AMLEngineAdapter), "AssignNewGUIDsAndRedirectExistingInternalLinksAndMirrorObjects", new[] { typeof(SystemUnitClassType), typeof(bool) }, s, false); return "ok"; });
        Step("clone", d => { var c = IE(d)?.clone(); return c == null ? "null" : D(c) + "|" + Hash(r.C.Apply(c.Node.ToString())); });
        Step("cloneNode", d => { var c = IE(d)?.CloneNode(true, true); return c == null ? "null" : D(c) + "|" + Hash(r.C.Apply(c.Node.ToString())); });
        Step("cloneNodeFlat", d => { var c = IE(d)?.CloneNode(false, false); return c == null ? "null" : D(c) + "|" + Hash(r.C.Apply(c.Node.ToString())); });
        Step("uniqueCopy", d => { var c = IE(d)?.Create_UniqueCopy(true); return c == null ? "null" : D(c) + "|" + Hash(r.C.Apply(c.Node.ToString())); });
        Step("uniqueCopyFlat", d => { var c = IE(d)?.Create_UniqueCopy(false); return c == null ? "null" : D(c) + "|" + Hash(r.C.Apply(c.Node.ToString())); });
        Step("insertElement", d => { var ih = d.CAEXFile.InstanceHierarchy.FirstOrDefault(); return ih == null ? "noih" : B(ih.Insert_Element(NewIE("A"))) + B(ih.Insert_Element(NewIE("B"), false)); });
        Step("insertNewInstance", d => { var ih = d.CAEXFile.InstanceHierarchy.FirstOrDefault(); return ih == null ? "noih" : B(ih.Insert_NewInstance(NewIE("A"))) + B(ih.Insert_NewInstance(NewIE("B"), false)); });
        Step("insertTypeBase", d => { var ih = d.CAEXFile.InstanceHierarchy.FirstOrDefault(); return ih == null ? "noih" : B(ih.Insert_TypeBaseElement(NewIE("A"))) + B(ih.Insert_TypeBaseElement(NewIE("B"), false)); });
        Step("insertWrong", d => { var ih = d.CAEXFile.InstanceHierarchy.FirstOrDefault(); return ih == null ? "noih" : B(ih.Insert_Element(fresh.CAEXFile.InterfaceClassLib.Append("X"))); });
        Step("insertMapping", d =>
        {
            var ie = IE(d);
            var mo = AllWrappers(d).OfType<MappingType>().FirstOrDefault();
            if (ie == null || mo == null) return "none";
            ie.Insert_MappingObject((MappingType)mo.Copy());
            var src = AllWrappers(d).OfType<SupportedRoleClassType>().FirstOrDefault();
            if (src != null) src.Insert_MappingObject((MappingType)mo.Copy());
            return "ok";
        });
        Step("insertRoleRequirements", d =>
        {
            var ie = IE(d);
            var rr = AllWrappers(d).OfType<RoleRequirementsType>().FirstOrDefault();
            if (ie == null || rr == null) return "none";
            ie.Insert_RoleRequirements((RoleRequirementsType)rr.Copy());
            return Ws(ie.RoleRequirements);
        });
        Step("insertSuc", d =>
        {
            var sucs = AllWrappers(d).OfType<SystemUnitFamilyType>().ToList();
            if (sucs.Count == 0) return "none";
            sucs[0].Insert_SystemUnitFamilyType((SystemUnitFamilyType)sucs[^1].Copy());
            return Ws(sucs[0].SystemUnitClass);
        });
        Step("newRoleRequirements", d => { var ie = IE(d, 1) ?? IE(d); return ie == null ? "none" : D(ie.New_RoleRequirements()) + "|" + D(ie.New_RoleRequirements("RCLib/R2")) + "|" + D(ie.New_RoleRequirements("No/Such")); });
        Step("constraints", d =>
        {
            var parts = new List<string>();
            foreach (var n in AllWrappers(d).OfType<NominalScaledTypeType>())
            {
                n.New_RequiredValue("nv1");
                n.New_RequiredValue(null!);
                parts.Add(string.Join(",", n.RequiredValue.Select(v => N(v))));
            }
            foreach (var n in AllWrappers(d).OfType<OrdinalScaledTypeType>())
            {
                n.New_RequiredValue("ov");
                n.New_RequiredMaxValue("max");
                n.New_RequiredMinValue(null!);
                parts.Add(N(n.RequiredValue) + "|" + N(n.RequiredMaxValue) + "|" + N(n.RequiredMinValue));
            }
            return string.Join(";", parts);
        });
        Step("revisions", d =>
        {
            var parts = new List<string>();
            foreach (var rev in AllWrappers(d).OfType<RevisionType>())
            {
                rev.New_OldVersion("old@x");
                rev.New_NewVersion(null!);
                rev.New_Comment("comment");
                parts.Add(N(rev.OldVersion) + "|" + N(rev.NewVersion) + "|" + N(rev.Comment));
            }
            return string.Join(";", parts);
        });
        Step("linkSetters", d =>
        {
            var parts = new List<string>();
            foreach (var suc in AllWrappers(d).OfType<SystemUnitClassType>())
                foreach (var l in suc.getLinkedObjects())
                {
                    var ei = AllWrappers(d).OfType<ExternalInterfaceType>().LastOrDefault();
                    l.RefPartnerSideAExternalInterface = ei!;
                    l.RefPartnerSideBExternalInterface = l.RefPartnerSideAExternalInterface;
                    parts.Add(N(l.InternalLink.RefPartnerSideA) + "|" + N(l.InternalLink.RefPartnerSideB) + "|" + l);
                }
            return string.Join(";", parts);
        });
        Step("linkNull", d =>
        {
            var l = AllWrappers(d).OfType<SystemUnitClassType>().SelectMany(s => s.getLinkedObjects()).FirstOrDefault();
            if (l == null) return "none";
            l.RefPartnerSideAExternalInterface = null!;
            return N(l.InternalLink.RefPartnerSideA) + "|" + l;
        });
    }
}
