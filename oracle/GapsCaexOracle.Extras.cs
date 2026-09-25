using System.Reflection;
using System.Text;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.CAEX.Linq;
using Aml.Engine.Resources.Files;
using Aml.Engine.XML;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>Scenarios of the gapscaex package on extension methods, internal helpers and resources.</summary>
public static partial class GapsCaexOracle
{
    static IEnumerable<(string, Action<Ctx>)> ExtraScenarios()
    {
        yield return ("constructors", Constructors);
        yield return ("internalHelpers", InternalHelpers);
        yield return ("transform:misc30.aml", c => Transform(c, "misc30.aml"));
        yield return ("transform:mapping215.aml", c => Transform(c, "mapping215.aml"));
        yield return ("documentWrapper", DocumentWrapper);
        yield return ("interfaceExtensions", InterfaceExtensions);
        yield return ("attributeExtensions", AttributeExtensions);
        yield return ("semanticVersion", SemanticVersions);
        yield return ("clrValues", ClrValues);
        yield return ("serializedAdditionalInformation", SerializedAdditionalInformation);
        yield return ("derivedClasses", DerivedClasses);
    }

    static readonly string[] ConstructorTypes =
        { "AttributeType", "CAEXFileType", "InternalElementType", "MappingType", "NominalScaledTypeType", "OrdinalScaledTypeType", "UnknownTypeType" };

    static void Constructors(Ctx c)
    {
        foreach (var name in ConstructorTypes)
        {
            var t = typeof(CAEXDocument).Assembly.GetType("Aml.Engine.CAEX." + name)!;
            var member = (object?)t.GetProperty("Constructor", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null)
                ?? t.GetField("Constructor", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)?.GetValue(null);
            var tag = name.EndsWith("TypeType") ? name.Substring(0, name.Length - 4) : name.EndsWith("Type") ? name.Substring(0, name.Length - 4) : name;
            c.R("Constructor(" + name + ")", () => ((Delegate)member!).DynamicInvoke(new XElement(tag))!.GetType());
        }
        c.R("new XsdDataTypes()", () => Activator.CreateInstance(typeof(CAEXDocument).Assembly.GetType("Aml.Engine.Resources.XsdDataTypes")!, true)!.GetType());
    }

    static void InternalHelpers(Ctx c)
    {
        var builder = typeof(CAEXPathBuilder).GetMethod("MakeAttributePath", BindingFlags.Static | BindingFlags.NonPublic)!;
        foreach (var schema in new[] { CAEXDocument.CAEXSchema.CAEX2_15, CAEXDocument.CAEXSchema.CAEX3_0 })
            foreach (var parts in new[] { new string?[0], new string?[] { "a" }, new string?[] { "a", "b" }, new string?[] { "a", null, "c" } })
                c.R("MakeAttributePath(" + string.Join(",", parts.Select(p => p ?? "null")) + ";" + schema + ")", () => builder.Invoke(null, new object?[] { parts, schema }));
        var xpath = typeof(ObjectWithBaseClass).GetMethod("GetAbsoluteXPath", BindingFlags.Static | BindingFlags.NonPublic)!;
        var doc = c.Load("misc30.aml");
        foreach (var e in doc.XDocument.Root!.DescendantsAndSelf().Take(40))
            c.R("GetAbsoluteXPath(" + Pos(e) + ")", () => xpath.Invoke(null, new object?[] { e }));
        c.R("GetAbsoluteXPath(detached)", () => xpath.Invoke(null, new object?[] { new XElement("a", new XElement("b")).Elements().First() }));
        c.R("GetAbsoluteXPath(null)", () => xpath.Invoke(null, new object?[] { null }));
        var cmpType = typeof(CAEXDocument).Assembly.GetType("Aml.Engine.CAEX.InternalLinkComparer")!;
        var cmp = Activator.CreateInstance(cmpType, true)!;
        var eq = cmpType.GetMethod("Equals", new[] { typeof(XElement), typeof(XElement) })!;
        var links = doc.XDocument.Root!.Descendants().Where(e => e.Name.LocalName == "InternalLink").Cast<XElement?>().ToList();
        links.Add(new XElement("InternalLink", new XAttribute("RefPartnerSideA", "x")));
        links.Add(new XElement("InternalLink", new XAttribute("RefPartnerSideA", "x"), new XAttribute("RefPartnerSideB", "x")));
        links.Add(null);
        for (var i = 0; i < links.Count; i++)
            for (var j = 0; j < links.Count; j++)
            {
                var (li, lj) = (links[i], links[j]);
                c.R("InternalLinkComparer.Equals(" + i + "," + j + ")", () => eq.Invoke(cmp, new object?[] { li, lj }));
            }
        // CaexValue.SetDefaultValue and IsValidStringValue
        var attrs = doc.XDocument.Root!.Descendants().Where(e => e.Name.LocalName == "Attribute").Select(e => (AttributeType)e.CreateCAEXWrapper()!).ToList();
        foreach (var a in attrs)
        {
            var p = a.AttributePath + ".";
            var cv = a.GetCaexValue("Value");
            c.R(p + "cv", () => cv == null ? null : "cv");
            if (cv == null) continue;
            c.V(p + "SetDefaultValue", () => CallInternal(cv, "SetDefaultValue"));
            c.R(p + "Value", () => a.Value);
            foreach (var s in new[] { "http://[bad(x)", "a b", "x!*'()", "", "5", "abc", "http://ok/(x)" })
                c.R(p + "IsValidStringValue(" + s + ")", () => cv.IsValidStringValue(s));
        }
        c.D();
        var d2 = c.Load("iface30.aml");
        var uri = d2.XDocument.Root!.Descendants().Where(e => (string?)e.Attribute("Name") == "Uri").Select(e => (AttributeType)e.CreateCAEXWrapper()!).First();
        var ucv = uri.GetCaexValue("Value")!;
        foreach (var s in new[] { "http://[bad(x)", "http://[bad!x]", "[(')*]", "http://ok", "a b", "%%", "http://[x]/(y)", "\\\\server\\(share)" })
            c.R("anyURI.IsValidStringValue(" + s + ")", () => ucv.IsValidStringValue(s));
        c.V("anyURI.SetDefaultValue", () => CallInternal(ucv, "SetDefaultValue"));
        c.R("anyURI.Value", () => uri.Value);
        c.D();
    }

    static void Transform(Ctx c, string file)
    {
        var doc = c.Load(file);
        var m = typeof(CAEXDocument).GetMethod("TransformToSchema", BindingFlags.Instance | BindingFlags.NonPublic, new[] { typeof(CAEXDocument.CAEXSchema) })!;
        foreach (var schema in new[] { CAEXDocument.CAEXSchema.CAEX2_15, CAEXDocument.CAEXSchema.CAEX3_0 })
        {
            CAEXDocument? t = null;
            c.R("TransformToSchema(" + schema + ")", () => { t = (CAEXDocument)m.Invoke(doc, new object[] { schema })!; return t == doc; });
            if (t == null) continue;
            c.R("IsTransformationActive(" + schema + ")", () => Internal(t, "IsTransformationActive"));
            c.R("Schema(" + schema + ")", () => t.Schema);
            c.D("#" + schema, t);
        }
        c.R("TransformToSchema(99)", () => m.Invoke(doc, new object[] { (CAEXDocument.CAEXSchema)99 }));
    }

    sealed class TestWrapper : XDocumentWrapper
    {
        public TestWrapper(XDocument d) : base(d) { }
    }

    static void DocumentWrapper(Ctx c)
    {
        var text = File.ReadAllText(Path.Combine(c.InDir, "misc30.aml"), Encoding.UTF8);
        var dir = Path.Combine(Path.GetTempPath(), "gapscaex-oracle-" + Environment.ProcessId);
        Directory.CreateDirectory(dir);
        foreach (var src in new[] { text, "<root xmlns=\"urn:x\"><a b=\"1\"> t </a></root>", "<root><a/></root>" })
        {
            var w = new TestWrapper(XDocument.Parse(src, LoadOptions.PreserveWhitespace));
            var p = src.Length + ".";
            foreach (var pretty in new[] { true, false })
            {
                c.R(p + "SaveToStream(" + pretty + ")", () =>
                {
                    using var s = w.SaveToStream(pretty);
                    var ms = new MemoryStream();
                    s.CopyTo(ms);
                    return Convert.ToBase64String(ms.ToArray());
                });
                var file = Path.Combine(dir, "wrapper.xml");
                c.R(p + "SaveToFile(" + pretty + ")", () =>
                {
                    w.SaveToFile(file, pretty);
                    return Convert.ToBase64String(File.ReadAllBytes(file));
                });
            }
            c.R(p + "SaveToFile(null)", () => { w.SaveToFile(null!, true); return "ok"; });
            c.R(p + "SaveToFile('')", () => { w.SaveToFile("", true); return "ok"; });
            foreach (var tag in new[] { "a", "CAEXFile", "" })
                c.R(p + "XName(" + tag + ")", () => w.XName(tag));
            c.R(p + "XName(null)", () => w.XName(null!));
        }
        // CAEXDocument.SaveToFileAsync
        foreach (var file in new[] { "misc30.aml", "mapping215.aml" })
        {
            var doc = c.Load(file);
            foreach (var target in new[] { "gapscaex-async.aml", "gapscaex-async.tmp" })
                foreach (var pretty in new[] { true, false })
                {
                    var path = Path.Combine(dir, target);
                    c.R(file + ".SaveToFileAsync(" + target + "," + pretty + ")", () =>
                    {
                        doc.SaveToFileAsync(path, pretty).GetAwaiter().GetResult();
                        return Encoding.UTF8.GetString(File.ReadAllBytes(path));
                    });
                    c.R(file + ".FileName", () => doc.CAEXFile.FileName);
                }
            c.R(file + ".SaveToFileAsync(null)", () => { doc.SaveToFileAsync(null!, true).GetAwaiter().GetResult(); return "ok"; });
        }
    }

    static void InterfaceExtensions(Ctx c)
    {
        var doc = c.Load("iface30.aml");
        var eis = doc.XDocument.Root!.Descendants().Where(e => e.Name.LocalName == "ExternalInterface").Select(e => (ExternalInterfaceType)e.CreateCAEXWrapper()!).ToList();
        foreach (var ei in eis)
        {
            var p = Pos(ei.Node) + ".";
            c.R(p + "HasVerifiableCardinality", () => ei.HasVerifiableCardinality());
            c.R(p + "HasVerifiableCategory", () => ei.HasVerifiableCategory());
            c.R(p + "HasVerifiableDirection", () => ei.HasVerifiableDirection());
            c.R(p + "AllowedDirections", () => ei.AllowedDirections());
            c.R(p + "Categories", () => ei.Categories());
            c.R(p + "Direction", () => ei.Direction());
            c.R(p + "MaxCardinality", () => ei.MaxCardinality());
            c.R(p + "MinCardinality", () => ei.MinCardinality());
            c.R(p + "MaxCardinalityViolation", () => ei.MaxCardinalityViolation());
            c.R(p + "MinCardinalityViolation", () => ei.MinCardinalityViolation());
            c.R(p + "DirectionViolation", () => { var r = ei.DirectionViolation(out var req); return new object?[] { r, req }; });
            c.R(p + "CategoryViolation", () => ei.CategoryViolation());
            c.R(p + "IsRelated", () => ei.IsRelated());
            c.R(p + "RelatedExternalInterfaces", () => ei.RelatedExternalInterfaces());
            c.R(p + "IsMaster", () => ExternalInterfaceTypeExtensions.IsMaster(ei));
        }
        var icl = doc.CAEXFile.InterfaceClassLib[0]!;
        var port = icl.InterfaceClass[0]!;
        var rcl = doc.CAEXFile.RoleClassLib[0]!;
        foreach (var ie in doc.XDocument.Root!.Descendants().Where(e => e.Name.LocalName is "InternalElement" or "SystemUnitClass").Select(e => (SystemUnitClassType)e.CreateCAEXWrapper()!))
        {
            var p = Pos(ie.Node) + ".";
            c.R(p + "OfInterfaceClass(Port)", () => ie.ExternalInterface.OfInterfaceClass(port));
            c.R(p + "OfInterfaceClass(SubPort)", () => ie.ExternalInterface.OfInterfaceClass(port.InterfaceClass[0]));
            c.R(p + "OfInterfaceClass(Other)", () => ie.ExternalInterface.OfInterfaceClass(icl.InterfaceClass[1]));
            foreach (var rc in rcl.RoleClass)
            {
                if (ie is InternalElementType iet)
                    c.R(p + "RoleRequirements.OfRoleClass(" + rc.Name + ")", () => iet.RoleRequirements.OfRoleClass(rc));
                c.R(p + "SupportedRoleClass.OfRoleClass(" + rc.Name + ")", () => ie.SupportedRoleClass.OfRoleClass(rc));
            }
        }
        c.D();
    }

    static void AttributeExtensions(Ctx c)
    {
        var doc = c.Load("misc30.aml");
        var all = AllWrappers(doc).OfType<CAEXObject>().ToList();
        CAEXObject Named(string name) => all.First(o => o.Name == name);
        var at1 = (AttributeFamilyType)Named("AT1");
        var at2 = (AttributeFamilyType)Named("AT2");
        foreach (var owner in new[] { "IE1", "IE2", "IE3", "S1", "R1", "I1" })
        {
            var o = (IObjectWithAttributes)Named(owner);
            var p = owner + ".";
            c.R(p + "Add(AT1)", () => o.AddAttributeTypeReference(at1));
            c.R(p + "Add(AT1) again", () => o.AddAttributeTypeReference(at1));
            c.R(p + "Add(AT2,false,true,n)", () => o.AddAttributeTypeReference(at2, false, true, "n"));
            c.R(p + "Add(AT2,true,false,null)", () => o.AddAttributeTypeReference(at2, true, false, null!));
            c.R(p + "Add(null)", () => o.AddAttributeTypeReference((AttributeFamilyType)null!));
            c.R(p + "Add(path)", () => o.AddAttributeTypeReference("ATL/AT1"));
            c.R(p + "Add(path) again", () => o.AddAttributeTypeReference("ATL/AT1"));
            c.R(p + "Add(path,false,true)", () => o.AddAttributeTypeReference("ATL/AT2", false, true));
            c.R(p + "Add(missing,false,true,null)", () => o.AddAttributeTypeReference("ATL/Missing", false, true, null!));
            c.R(p + "Add(C:x,false)", () => o.AddAttributeTypeReference("C:x", false));
            c.R(p + "Add(a\\b,false)", () => o.AddAttributeTypeReference("a\\b", false));
            c.R(p + "Add('')", () => o.AddAttributeTypeReference(""));
        }
        c.D();
        // AddInstance and UpdateWithAddedInternalElements
        var s1 = (SystemUnitFamilyType)Named("S1");
        var ie1 = (InternalElementType)Named("IE1");
        var ie3 = (InternalElementType)Named("IE3");
        c.R("AddInstance(ei)", () => s1.AddInstance(ie1.ExternalInterface[0]!.Copy() as CAEXObject));
        c.R("AddInstance(ei) again", () => s1.AddInstance(ie1.ExternalInterface[0]!.Copy() as CAEXObject));
        c.R("AddInstance(ie)", () => s1.AddInstance(ie3.Copy() as CAEXObject));
        c.R("AddInstance(ie) again", () => s1.AddInstance(ie3.Copy() as CAEXObject));
        c.R("AddInstance(attribute)", () => s1.AddInstance(ie1.Attribute[1]!.Copy() as CAEXObject));
        c.R("AddInstance(ih)", () => s1.AddInstance(doc.CAEXFile.InstanceHierarchy[0]!));
        c.D();
        c.R("UpdateInstance(IE1)", () => ie1.UpdateInstance());
        c.D();
        c.R("UpdateInstance(IE1) again", () => ie1.UpdateInstance());
        c.R("UpdateInstance(IE3)", () => ie3.UpdateInstance());
        c.D();
    }

    static readonly string[] Versions =
    {
        "1.0", "1.0.0", "1.0.0.0", "1.0.0.1", "1.0.0-beta", "1.0.0-Beta", "1.0.0-alpha", "1.0-beta", "01.2.3", "1.2.3.4-rc.1",
        "2.0.0", "1", " 1.0 ", "1.0.0-", "x", "", "1.0.0+meta", "1.2.3-ALPHA.2", "10.0", "1.10", "1.9",
    };

    static void SemanticVersions(Ctx c)
    {
        var parsed = new List<SemanticVersion?>();
        foreach (var v in Versions)
        {
            SemanticVersion? sv = null;
            c.R("Parse(" + v + ")", () => (sv = SemanticVersion.Parse(v))?.ToString());
            parsed.Add(sv);
            c.R("TryParse(" + v + ")", () => { var ok = SemanticVersion.TryParse(v, out var r); return new object?[] { ok, r?.ToString() }; });
            c.R("TryParseStrict(" + v + ")", () => { var ok = SemanticVersion.TryParseStrict(v, out var r); return new object?[] { ok, r?.ToString() }; });
            c.R("ParseOptionalVersion(" + v + ")", () => SemanticVersion.ParseOptionalVersion(v)?.ToString());
            if (sv == null) continue;
            c.R(v + ".Version", () => sv.Version.ToString());
            c.R(v + ".SpecialVersion", () => sv.SpecialVersion);
            c.R(v + ".GetOriginalVersionComponents", () => sv.GetOriginalVersionComponents());
            c.R(v + ".ToNormalizedString", () => sv.ToNormalizedString());
            c.R(v + ".ToString", () => sv.ToString());
            c.R(v + ".CompareTo(null)", () => sv.CompareTo((object?)null));
            c.R(v + ".CompareTo(string)", () => sv.CompareTo((object)"1.0"));
            c.R(v + ".Equals(null)", () => sv.Equals((object?)null));
            c.R(v + ".Equals(string)", () => sv.Equals((object)"1.0"));
        }
        var ok = parsed.Where(p => p != null).Select(p => p!).ToList();
        for (var i = 0; i < ok.Count; i++)
            for (var j = 0; j < ok.Count; j++)
            {
                var a = ok[i];
                var b = ok[j];
                c.R("cmp(" + a + "," + b + ")", () => new object?[]
                {
                    Math.Sign(a.CompareTo(b)), Math.Sign(a.CompareTo((object)b)), a.Equals(b), a.Equals((object)b), a == b, a != b, a < b, a <= b, a > b, a >= b,
                    a.GetHashCode() == b.GetHashCode(),
                });
            }
        foreach (var args in new[] { new object[] { 1, 2, 3 }, new object[] { 1, 2, 3, 4 }, new object[] { 1, 2, 3, "pre" }, new object[] { 1, 2, 3, 0 } })
            c.R("new(" + string.Join(",", args) + ")", () =>
            {
                var sv = args.Length == 3 ? new SemanticVersion((int)args[0], (int)args[1], (int)args[2])
                    : args[3] is string s ? new SemanticVersion((int)args[0], (int)args[1], (int)args[2], s)
                    : new SemanticVersion((int)args[0], (int)args[1], (int)args[2], (int)args[3]);
                return new object?[] { sv.ToString(), sv.ToNormalizedString(), sv.SpecialVersion, sv.GetOriginalVersionComponents() };
            });
        c.R("new(Version)", () => { var sv = new SemanticVersion(new Version(1, 2)); return new object?[] { sv.ToString(), sv.ToNormalizedString(), sv.GetOriginalVersionComponents() }; });
        c.R("new(Version,sp)", () => { var sv = new SemanticVersion(new Version(1, 2, 3, 4), "x"); return new object?[] { sv.ToString(), sv.ToNormalizedString(), sv.GetOriginalVersionComponents() }; });
        c.R("null ops", () => new object?[] { (SemanticVersion?)null == null, ok[0] == null, null == ok[0], ok[0] > null, ok[0] < null });
    }

    static void ClrValues(Ctx c)
    {
        var values = new object[]
        {
            (sbyte)-1, (byte)255, (short)-300, (ushort)5, 7, 7u, -5L, ulong.MaxValue, 1.5f, 0.1f, 1e10f, 5.0, 1e21, 0.1, -0.0, double.NaN, float.PositiveInfinity,
        };
        for (var i = 0; i < values.Length; i++)
        {
            var v = values[i];
            c.R("ToString" + i, () => v.ToString());
            c.R("Type" + i, () => v.GetType().ToString());
            if (v is not (long or ulong)) c.R("ToDouble" + i, () => Convert.ToDouble(v));
        }
    }

    static void SerializedAdditionalInformation(Ctx c)
    {
        var doc = CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0);
        c.Doc = doc;
        var ai = doc.CAEXFile.AdditionalInformation;
        foreach (var text in new[] { "<CAEXDocument A=\"1\" />", "<Other />", "<CAEXDocument><x /></CAEXDocument>", "<ns:CAEXDocument xmlns:ns=\"urn:x\" />" })
            c.R("Append(" + text + ")", () => ai.Append(text));
        c.D();
        var seq = doc.CAEXFile.SerializedAdditionalInformation<CAEXDocument>();
        c.R("Elements", () => seq.Elements.ToList());
        c.R("Count", () => seq.Count);
        var other = doc.CAEXFile.SerializedAdditionalInformation<CAEXFileType>();
        c.R("other.Count", () => other.Count);
        c.R("Append(text)", () => ai.Append("plain text"));
        c.R("Elements.after", () => seq.Elements.ToList());
        c.R("Count.after", () => seq.Count);
    }

    static void DerivedClasses(Ctx c)
    {
        InheritanceExtensions.DerivedClasses.Clear();
        try
        {
            var doc = c.Load("misc30.aml");
            var classes = AllWrappers(doc).OfType<CAEXObject>().Where(o => o is IClassWithBaseClassReference).ToList();
            foreach (var cl in classes)
            {
                var path = cl.CAEXPath();
                c.V("Add(" + path + ")", () => InheritanceExtensions.DerivedClasses.AddClassDerivations(doc, path, cl.Name));
                c.R("entry(" + path + ")", () => InheritanceExtensions.DerivedClasses[path].ToList());
            }
            c.V("Add(null)", () => InheritanceExtensions.DerivedClasses.AddClassDerivations(doc, null!, null!));
            c.R("Count", () => InheritanceExtensions.DerivedClasses.Count);
            foreach (var a in classes)
                foreach (var b in classes)
                    c.R("derived(" + a.CAEXPath() + "," + b.CAEXPath() + ")", () => ((IClassWithBaseClassReference)a).ClassIsDerivedFrom(b.CAEXPath()));
        }
        finally
        {
            InheritanceExtensions.DerivedClasses.Clear();
        }
    }
}
