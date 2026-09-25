using System.Collections;
using System.Reflection;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Commands;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Services;
using Aml.Engine.Services.Interfaces;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>Scenarios of the gapscaex package on single wrapper members (see GapsCaexOracle.cs).</summary>
public static partial class GapsCaexOracle
{
    static IEnumerable<(string, Action<Ctx>)> MiscScenarios()
    {
        foreach (var file in new[] { "misc30.aml", "mapping215.aml", "mapping30.aml" })
        {
            yield return ("members:" + file, c => Members(c, file));
            yield return ("memberWrites:" + file, c => MemberWrites(c, file));
        }
        yield return ("typeDictionary", TypeDictionary);
        yield return ("enumerators", Enumerators);
        yield return ("valueSequences", ValueSequences);
        yield return ("records", Records);
    }

    static object? CallInternal(object target, string method, params object?[] args) =>
        target.GetType().GetMethod(method, BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic)!.Invoke(target, args);

    static List<CAEXWrapper> AllWrappers(CAEXDocument doc) =>
        doc.XDocument.Root!.DescendantsAndSelf().Select(e => e.CreateCAEXWrapper()).Where(w => w != null).Select(w => w!).ToList();

    static void Members(Ctx c, string file)
    {
        var doc = c.Load(file);
        var sep = doc.Schema == CAEXDocument.CAEXSchema.CAEX2_15 ? "." : "/";
        foreach (var w in AllWrappers(doc))
        {
            var p = Pos(w.Node) + ".";
            if (w is CAEXBasicObject bo)
            {
                foreach (var name in new[] { "ID", "Name", "Version", "Description", "ChangeMode", "Copyright", "x" })
                    c.R(p + "Property(" + name + ")", () => CallInternal(bo, "Property", name));
                c.R(p + "DescriptionElement.ChangeMode", () => bo.DescriptionElement.ChangeMode);
                c.R(p + "VersionElement.ChangeMode", () => bo.VersionElement.ChangeMode);
                c.R(p + "CopyrightElement.ChangeMode", () => bo.CopyrightElement.ChangeMode);
            }
            if (w is AttributeFamilyType af)
            {
                c.R(p + "enum", () => af.ToList());
                c.R(p + "GetReferenceHierarchy<I>", () => af.GetReferenceHierarchy<IClassWithBaseClassReference>());
                c.R(p + "GetReferenceHierarchy<I>(false)", () => af.GetReferenceHierarchy<IClassWithBaseClassReference>(false));
                c.R(p + "GetReferenceHierarchy<Role>", () => af.GetReferenceHierarchy<RoleFamilyType>());
                c.R(p + "GetReferenceHierarchy<Attr>", () => af.GetReferenceHierarchy<AttributeFamilyType>());
            }
            if (w is InterfaceFamilyType inf)
            {
                c.R(p + "enum", () => inf.ToList());
                c.R(p + "GetReferenceHierarchy<I>", () => inf.GetReferenceHierarchy<IClassWithBaseClassReference>());
                c.R(p + "GetReferenceHierarchy<Role>", () => inf.GetReferenceHierarchy<RoleFamilyType>());
                c.R(p + "GetReferenceHierarchy<Interface>(false)", () => inf.GetReferenceHierarchy<InterfaceFamilyType>(false));
            }
            if (w is RoleFamilyType rf)
            {
                c.R(p + "enum", () => rf.ToList());
                c.R(p + "GetReferenceHierarchy<I>", () => rf.GetReferenceHierarchy<IClassWithBaseClassReference>());
                c.R(p + "GetReferenceHierarchy<Interface>", () => rf.GetReferenceHierarchy<InterfaceFamilyType>());
                c.R(p + "GetReferenceHierarchy<Role>(false)", () => rf.GetReferenceHierarchy<RoleFamilyType>(false));
            }
            if (w is SystemUnitFamilyType sf)
            {
                c.R(p + "enumSUC", () => ((IEnumerable<SystemUnitFamilyType>)sf).ToList());
                c.R(p + "GetReferenceHierarchy<I>", () => sf.GetReferenceHierarchy<IClassWithBaseClassReference>());
                c.R(p + "GetReferenceHierarchy<Role>", () => sf.GetReferenceHierarchy<RoleFamilyType>());
                c.R(p + "GetReferenceHierarchy<SU>(false)", () => sf.GetReferenceHierarchy<SystemUnitFamilyType>(false));
            }
            if (w is SystemUnitClassType suc)
                c.R(p + "enumIE", () => ((IEnumerable<InternalElementType>)suc).ToList());
            if (w is InternalElementType ie)
                c.R(p + "IMirror.IsMaster", () => ((IMirror)ie).IsMaster);
            if (w is ExternalInterfaceType ei)
            {
                c.R(p + "IMirror.IsMaster", () => ((IMirror)ei).IsMaster);
                c.R(p + "ExternalInterfaceDescandantsAndSelf", () => ei.ExternalInterface.ExternalInterfaceDescandantsAndSelf());
            }
            if (w is InterfaceClassType ic)
                c.R(p + "ExternalInterfaceAndDescendants", () => ic.ExternalInterfaceAndDescendants);
            if (w is IObjectWithExternalInterface owe)
                c.R(p + "ExternalInterface.ExternalInterfaceDescandantsAndSelf", () => owe.ExternalInterface.ExternalInterfaceDescandantsAndSelf());
            if (w is AttributeType at)
            {
                c.R(p + "AttributeNames", () => Internal(at, "AttributeNames"));
                foreach (var cons in at.Constraint)
                {
                    var q = p + "constraint." + cons.Name + ".";
                    c.R(q + "OrdinalScaledType", () => cons.OrdinalScaledType);
                    c.R(q + "NominalScaledType", () => cons.NominalScaledType);
                    c.R(q + "UnknownType", () => cons.UnknownType);
                    if (cons.OrdinalScaledType != null)
                        foreach (var n in new[] { "RequiredMaxValue", "RequiredValue", "RequiredMinValue", "x" })
                            c.R(q + "Ordinal[" + n + "]", () => cons.OrdinalScaledType[n]);
                    if (cons.NominalScaledType != null)
                        c.R(q + "Nominal.RequiredValue", () => cons.NominalScaledType.RequiredValue.ToList());
                    if (cons.UnknownType != null)
                        c.R(q + "Unknown.Requirements", () => cons.UnknownType.Requirements);
                }
            }
            if (w is AttributeTypeType att)
                c.R(p + "DefaultAttributeValue", () => att.DefaultAttributeValue);
            if (w is IObjectWithAttributes owa)
                foreach (var path in new[] { "a", "a" + sep + "b", "zz", "a" + sep + "zz", "x", "x" + sep + "xs", "s1" + sep + "s1s" })
                    c.R(p + "GetCAEXAttribute(" + path + ")", () => owa.Attribute.GetCAEXAttribute(path));
            if (w is ICAEXLibrary)
            {
                c.R(p + "enumLib", () => ((IEnumerable)w).Cast<object>().ToList());
                c.R(p + "VerifySignature()", () => ((dynamic)w).VerifySignature());
                c.R(p + "VerifySignature(s,k)", () => ((dynamic)w).VerifySignature("s", "k"));
            }
            if (IsWithReference(w))
            {
                dynamic d = w;
                c.R(p + "Reference", () => d.Reference);
                c.R(p + "ReferenceAttributeName", () => d.ReferenceAttributeName);
            }
        }
        c.D();
    }

    static bool IsWithReference(object w)
    {
        for (var t = w.GetType(); t != null; t = t.BaseType)
            if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(CaexObjectWithReference<>)) return true;
        return false;
    }

    static void MemberWrites(Ctx c, string file)
    {
        var doc = c.Load(file);
        var all = AllWrappers(doc);
        CAEXObject? Named(string name) => all.OfType<CAEXObject>().FirstOrDefault(o => o.Name == name);

        // ChangeMode setters
        var ih = doc.CAEXFile.InstanceHierarchy[0]!;
        foreach (var mode in new[] { ChangeMode.Create, ChangeMode.Change, ChangeMode.Change, ChangeMode.Delete, ChangeMode.State, ChangeMode.Undefined })
        {
            c.V("Description.ChangeMode=" + mode, () => ih.DescriptionElement.ChangeMode = mode);
            c.R("Description.ChangeMode", () => ih.DescriptionElement.ChangeMode);
            c.V("Version.ChangeMode=" + mode, () => ih.VersionElement.ChangeMode = mode);
            c.V("Copyright.ChangeMode=" + mode, () => ih.CopyrightElement.ChangeMode = mode);
        }
        c.D();
        // CAEXFile setters
        c.V("SchemaLocation=", () => doc.CAEXFile.SchemaLocation = "loc.xsd");
        c.V("SchemaLocation=same", () => doc.CAEXFile.SchemaLocation = "loc.xsd");
        c.V("SchemaVersion=", () => doc.CAEXFile.SchemaVersion = "9.9");
        c.R("SchemaVersion", () => doc.CAEXFile.SchemaVersion);
        c.V("SchemaVersion=null", () => doc.CAEXFile.SchemaVersion = null!);
        c.V("SchemaLocation=null", () => doc.CAEXFile.SchemaLocation = null!);
        c.D();
        // class setters
        foreach (var w in all.ToList())
        {
            var p = Pos(w.Node) + ".";
            switch (w)
            {
                case AttributeType a:
                    c.V(p + "Class=AT2", () => a.Class = (AttributeFamilyType)Named("AT2")!);
                    c.R(p + "Class", () => a.Class);
                    c.V(p + "Class=null", () => a.Class = null!);
                    break;
                case ExternalInterfaceType ei:
                    c.V(p + "Class=I2", () => ei.Class = (InterfaceFamilyType)Named("I2")!);
                    c.R(p + "Class", () => ei.Class);
                    break;
                case InternalElementType ie:
                    c.V(p + "Class=S2", () => ie.Class = (SystemUnitFamilyType)Named("S2")!);
                    c.R(p + "Class", () => ie.Class);
                    break;
                case SupportedRoleClassType src:
                    c.V(p + "Class=R2", () => src.Class = (RoleFamilyType)Named("R2")!);
                    c.R(p + "Class", () => src.Class);
                    c.V(p + "Class=null", () => src.Class = null!);
                    break;
                case AttributeValueRequirementType avr:
                    c.V(p + "Name=cc", () => avr.Name = "cc");
                    c.V(p + "Name=cc again", () => avr.Name = "cc");
                    c.R(p + "Name", () => avr.Name);
                    break;
            }
        }
        c.D();
        // references
        var targets = new[] { "I1", "I2", "I1n", "R1", "R2", "R1n", "S1", "S2", "S1n", "AT1", "AT2", "AT1n", "IE1", "IE1a", "sie", "ei1", "a", "b", "atc" }
            .Select(Named).Where(o => o != null).Select(o => o!).ToList();
        foreach (var w in all.Where(IsWithReference).ToList())
        {
            var p = Pos(w.Node) + ".";
            dynamic d = w;
            foreach (var t in targets)
                c.R(p + "CanAddReference(" + t.Name + ")", () => d.CanAddReference(t));
            c.R(p + "CanAddReference(null)", () => d.CanAddReference(null));
        }
        foreach (var w in all.Where(IsWithReference).ToList())
        {
            var p = Pos(w.Node) + ".";
            dynamic d = w;
            foreach (var t in targets)
            {
                c.R(p + "AddReference(" + t.Name + ")", () => d.AddReference(t));
                c.R(p + "Reference", () => d.Reference);
            }
            c.R(p + "AddReference(null)", () => d.AddReference(null));
            var first = targets.FirstOrDefault(t => ReferenceTypeOk(w, t) && CanAddSafe(d, t));
            if (first != null)
            {
                c.V(p + "Reference=" + first.Name, () => d.Reference = (dynamic)first);
                c.R(p + "Reference.after", () => d.Reference);
            }
            c.R(p + "AddChild", () => d.AddChild("child"));
        }
        c.D();
        // libraries
        var icl = doc.CAEXFile.InterfaceClassLib[0]!;
        c.R("CopyAndChangeReferences", () => icl.CopyAndChangeReferences(doc.CAEXFile, "ICLcopy"));
        c.R("copy.enum", () => doc.CAEXFile.InterfaceClassLib["ICLcopy"]?.ToList());
        var detached = (InterfaceClassLibType)icl.Copy();
        detached.Name = "ICLdetached";
        c.V("InsertAfter", () => icl.InsertAfter(detached));
        var detached2 = (InterfaceClassLibType)icl.Copy();
        detached2.Name = "ICLdetached2";
        c.V("InsertBefore", () => icl.InsertBefore(detached2));
        c.V("InsertAfter(null)", () => icl.InsertAfter(null!));
        c.V("InsertBefore(null)", () => icl.InsertBefore(null!));
        c.D();
        // AppendWithReference
        var rcl = doc.CAEXFile.RoleClassLib.FirstOrDefault();
        var sucl = doc.CAEXFile.SystemUnitClassLib.FirstOrDefault();
        var atl = doc.CAEXFile.AttributeTypeLib.FirstOrDefault();
        if (rcl != null)
            foreach (var t in targets)
            {
                c.R("rcl.AppendWithReference(" + t.Name + ")", () => { var r = rcl.RoleClass.AppendWithReference("n" + t.Name, t, out var isRef); return new object?[] { r, isRef }; });
            }
        foreach (var t in targets)
            c.R("icl.AppendWithReference(" + t.Name + ")", () => { var r = icl.InterfaceClass.AppendWithReference("n" + t.Name, t, out var isRef); return new object?[] { r, isRef }; });
        if (sucl != null)
            foreach (var t in targets)
                c.R("sucl.AppendWithReference(" + t.Name + ")", () => { var r = sucl.SystemUnitClass.AppendWithReference("n" + t.Name, t, out var isRef); return new object?[] { r, isRef }; });
        if (atl != null)
            foreach (var t in targets)
                c.R("atl.AppendWithReference(" + t.Name + ")", () => { var r = atl.AttributeType.AppendWithReference("n" + t.Name, t, out var isRef); return new object?[] { r, isRef }; });
        c.D();
        // mirrors
        var ie1 = (InternalElementType?)Named("IE1");
        if (ie1 != null)
        {
            c.R("AddNewMirror", () => ih.InternalElement.AddNewMirror(ie1));
            c.R("AddNewMirror(null)", () => ih.InternalElement.AddNewMirror(null!));
            c.R("IsMaster", () => ((IMirror)ie1).IsMaster);
            c.R("ei.IsMaster", () => ((IMirror)ie1.ExternalInterface[0]!).IsMaster);
        }
        c.D();
    }

    static bool CanAddSafe(dynamic d, CAEXObject t)
    {
        try { return (bool)d.CanAddReference(t); }
        catch { return false; }
    }

    /// <summary>The Reference setter needs a value of the reference type T (a C# compile time type).</summary>
    static bool ReferenceTypeOk(object w, object target)
    {
        for (var t = w.GetType(); t != null; t = t.BaseType)
            if (t.IsGenericType && t.GetGenericTypeDefinition() == typeof(CaexObjectWithReference<>))
                return t.GetGenericArguments()[0].IsInstanceOfType(target);
        return false;
    }

    static readonly string[] TagNames =
    {
        "CAEXFile", "InstanceHierarchy", "InternalElement", "RoleClass", "SourceDocumentInformation", "SourceObjectInformation",
        "RoleClassLib", "SystemUnitClass", "SystemUnitClassLib", "InterfaceClassLib", "AttributeTypeLib", "AttributeFamilyType",
        "AttributeType", "InterfaceClass", "ExternalReference", "InternalLink", "ExternalInterface", "RoleRequirements",
        "SupportedRoleClass", "MappingObject", "Attribute", "Revision", "InterfaceNameMapping", "InterfaceIDMapping",
        "AttributeNameMapping", "OrdinalScaledType", "NominalScaledType", "UnknownType", "AttributeValueRequirement",
        "RefSemantic", "InterfaceFamilyType", "RoleFamilyType", "SystemUnitFamilyType", "Constraint", "Description",
        "Version", "Copyright", "CAEXBasicObject", "CAEXObject", "Foo", "Mapping", "ExternalInterfaceSequence",
    };

    static void TypeDictionary(Ctx c)
    {
        var dict = CAEXTypeDictionary.Instance;
        foreach (var tag in TagNames)
        {
            c.R("item(" + tag + ")", () => dict[tag]);
            c.R("ContainsKey(" + tag + ")", () => dict.ContainsKey(tag));
            c.R("TryGetValue(" + tag + ")", () => { var ok = dict.TryGetValue(tag, out var t); return new object?[] { ok, t }; });
            c.R("TryGetCreator(" + tag + ")", () =>
            {
                var ok = dict.TryGetCreator(tag, out var creator);
                return new object?[] { ok, creator?.Invoke(new XElement(tag))?.GetType() };
            });
        }
    }

    static void Enumerators(Ctx c)
    {
        var doc = c.Load("misc30.aml");
        var elements = doc.CAEXFile.InstanceHierarchy[0]!.Node.Elements().ToArray();
        var withNull = new XElement?[] { elements[0], null, elements[1], null, null, elements[^1] };
        IEnumerator<CAEXWrapper> e1 = new CAEXEnumerable<CAEXWrapper>(elements).GetEnumerator();
        c.R("array.MoveNext", () => e1.MoveNext());
        c.R("array.Current", () => e1.Current);
        c.R("array.MoveNext2", () => e1.MoveNext());
        c.R("array.Current2", () => e1.Current);
        c.V("array.Reset", () => e1.Reset());
        c.R("array.MoveNext3", () => e1.MoveNext());
        c.R("array.Current3", () => e1.Current);
        c.V("array.Dispose", () => e1.Dispose());
        IEnumerator<CAEXWrapper> e2 = new CAEXEnumerable<CAEXWrapper>(withNull!).GetEnumerator();
        var k = 0;
        while (k++ < 8) c.R("nulls.MoveNext" + k, () => e2.MoveNext() ? e2.Current : "end");
        IEnumerator<InternalElementType> e3 = new CAEXEnumerable<InternalElementType>(elements).GetEnumerator();
        k = 0;
        while (k++ < 20) c.R("typed.MoveNext" + k, () => e3.MoveNext() ? e3.Current : "end");
        IEnumerator<CAEXWrapper> e6 = new CAEXEnumerable<CAEXWrapper>(elements).GetEnumerator();
        c.R("rest.MoveNext", () => e6.MoveNext());
        c.R("rest", () => { var rest = new List<object?>(); while (e6.MoveNext()) rest.Add(e6.Current); return rest; });
        var ie1 = doc.CAEXFile.InstanceHierarchy[0]!.InternalElement[0]!;
        var seq = ie1.InternalElement;
        c.R("sequenceNullElements", () => new CAEXEnumerable<InternalElementType>(seq, null).ToList());
        c.R("sequenceElements", () => new CAEXEnumerable<InternalElementType>(seq, ie1.Node.Elements()).ToList());
        c.R("nullElements", () => new CAEXEnumerable<CAEXWrapper>((IEnumerable<XElement>)null!).ToList());
        var at1 = (AttributeFamilyType)doc.CAEXFile.AttributeTypeLib[0]!.AttributeType[0]!;
        IEnumerator<AttributeType> e4 = at1.InheritedAttributes.GetEnumerator();
        c.R("lazy.MoveNext", () => e4.MoveNext());
        c.R("lazy.Current", () => e4.Current);
        c.V("lazy.Reset", () => e4.Reset());
        c.V("lazy.Dispose", () => e4.Dispose());
        IEnumerator<CAEXBasicObject> e5 = ie1.Ancestors().GetEnumerator();
        c.R("ancestors.MoveNext", () => e5.MoveNext());
        c.V("ancestors.Reset", () => e5.Reset());
        c.R("ancestors.all", () => ie1.Ancestors().ToList());
    }

    static void ValueSequences(Ctx c)
    {
        var doc = c.Load("misc30.aml");
        var ih = doc.CAEXFile.InstanceHierarchy[0]!;
        var flags = new ValueSequence<bool>(ih.Node, "Flag");
        var dates = new ValueSequence<DateTime>(ih.Node, "Date");
        var texts = new ValueSequence<string>(ih.Node, "Text");
        var objs = new ValueSequence<object>(ih.Node, "Text");
        for (var i = 0; i < 4; i++)
        {
            var k = i;
            c.R("flags[" + k + "]", () => flags[k]);
            c.R("dates[" + k + "]", () => dates[k]);
            c.R("texts[" + k + "]", () => texts[k]);
            c.R("objs[" + k + "]", () => objs[k]);
        }
        c.R("flags.IndexOf", () => flags.Elements.Select(e => flags.IndexOf(e)).ToList());
        c.R("dates.IndexOf(foreign)", () => dates.IndexOf(ih.Node));
        c.R("texts.IndexOf(null)", () => texts.IndexOf(null!));
        c.V("flags[0]=false", () => flags[0] = false);
        c.V("flags[2]=true", () => flags[2] = true);
        c.V("flags[9]=true", () => flags[9] = true);
        c.V("dates[3]=", () => dates[3] = new DateTime(2021, 5, 6, 7, 8, 9, DateTimeKind.Utc));
        c.V("dates[0]=", () => dates[0] = new DateTime(2021, 5, 6, 7, 8, 9, DateTimeKind.Unspecified));
        c.V("texts[1]=", () => texts[1] = "b");
        c.V("texts[0]=null", () => texts[0] = null!);
        c.V("objs[1]=text", () => objs[1] = "c");
        c.V("objs[0]=element", () => objs[0] = new XElement("Inner", "v"));
        c.D();
        c.R("flags.Values", () => flags.Values.Take(3).ToList());
        c.R("dates.Values", () => dates.Values.Take(3).ToList());
        c.R("texts.ElementAndValues", () => texts.ElementAndValues.Select(ev => new object?[] { ev.Node, ev.Value }).ToList());
        c.R("flags.Append", () => flags.Append(true));
        c.R("dates.Prepend", () => dates.Prepend(new DateTime(2000, 1, 1)));
        c.D();
        // generic wrappers
        var flagNode = ih.Node.Elements().First(e => e.Name.LocalName == "Flag");
        var dateNode = ih.Node.Elements().First(e => e.Name.LocalName == "Date");
        var textNode = ih.Node.Elements().First(e => e.Name.LocalName == "Text");
        var wb = new CAEXWrapper<bool>(flagNode);
        var wd = new CAEXWrapper<DateTime>(dateNode);
        var wo = new CAEXWrapper<object>(textNode);
        var ws = new CAEXWrapper<string>(textNode);
        c.R("wb.Value", () => wb.Value);
        c.R("wd.Value", () => wd.Value);
        c.R("wo.Value", () => wo.Value);
        c.R("ws.Value", () => ws.Value);
        c.V("wb.Value=true", () => wb.Value = true);
        c.R("wb.Value2", () => wb.Value);
        c.V("wd.Value=", () => wd.Value = new DateTime(2022, 3, 4, 5, 6, 7, DateTimeKind.Local));
        c.R("wd.Value2", () => wd.Value);
        c.V("wo.Value=5", () => wo.Value = 5);
        c.R("wo.Value2", () => wo.Value);
        c.V("wo.Value=true", () => wo.Value = true);
        c.R("wo.Value3", () => wo.Value);
        c.V("wo.Value=null", () => wo.Value = null!);
        c.V("ws.Value=s", () => ws.Value = "s");
        c.R("ws.Value2", () => ws.Value);
        var nb = new CAEXWrapper<bool>(null!);
        var nd = new CAEXWrapper<DateTime>(null!);
        var no = new CAEXWrapper<object>(null!);
        c.R("nb.Value", () => nb.Value);
        c.R("nd.Value", () => nd.Value);
        c.R("no.Value", () => no.Value);
        c.V("nb.Value=true", () => nb.Value = true);
        c.D();
    }

    static void Records(Ctx c)
    {
        SourceDocumentInformationType.Properties P(string name, DateTime dt) => new()
        {
            OriginName = name, OriginID = "id", OriginVendor = "v", OriginVendorURL = "u", OriginVersion = "1",
            OriginRelease = "r", LastWritingDateTime = dt, OriginProjectTitle = "t", OriginProjectID = "p",
        };
        var a = P("a", new DateTime(2020, 1, 2, 3, 4, 5, DateTimeKind.Utc));
        var b = P("a", new DateTime(2020, 1, 2, 3, 4, 5, DateTimeKind.Local));
        var d = P("b", new DateTime(2020, 1, 2, 3, 4, 5, DateTimeKind.Utc));
        var e = P("a", new DateTime(2020, 1, 2, 3, 4, 6, DateTimeKind.Utc));
        var f = P("a", new DateTime(2020, 1, 2, 3, 4, 5, DateTimeKind.Utc));
        f.OriginProjectID = null;
        var empty = new SourceDocumentInformationType.Properties();
        c.R("a.Equals(a)", () => a.Equals(a));
        c.R("a.Equals(b)", () => a.Equals(b));
        c.R("a.Equals(d)", () => a.Equals(d));
        c.R("a.Equals(e)", () => a.Equals(e));
        c.R("a.Equals(f)", () => a.Equals(f));
        c.R("f.Equals(a)", () => f.Equals(a));
        c.R("a.Equals(null)", () => a.Equals((object?)null));
        c.R("a.Equals(string)", () => a.Equals((object)"a"));
        c.R("empty.Equals(new)", () => empty.Equals(new SourceDocumentInformationType.Properties()));
    }
}
