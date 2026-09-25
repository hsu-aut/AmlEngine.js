using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.AmlObjects;
using Aml.Engine.CAEX;
using Aml.Engine.Services;
using Aml.Engine.Services.Interfaces;
using Aml.Engine.Services.Model;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

// Section "services": ServiceLocator (registration, fallback lookup, begin/end service, schema
// transformation events), CaexIDService, CAEXReference, the event argument classes and
// SignatureServiceBase (through a minimal derived service).
public static partial class GapsServicesOracle
{
    sealed class TestSigning : SignatureServiceBase
    {
        public override (string PublicKey, string PrivateKey) GenerateKeys(string passPhrase) => ("pub:" + passPhrase, "priv:" + passPhrase);
        public override XMLSignature ToEnvelopedSignature(string signatureID, string signatureValue, string publicKey) => null!;
        public override bool? VerifySignature(CAEXObject CAEXObjectToVerify, string publicKey = null!) => publicKey == null ? null : publicKey == "ok";
    }

    sealed class TestTransform : ISchemaTransform
    {
        public event EventHandler<SchemaTransformationEventArgs>? TransformationEnded;
        public event EventHandler<SchemaTransformationEventArgs>? TransformationStarted;
        public CAEXDocument TransformTo(CAEXDocument document, CAEXDocument.CAEXSchema targetSchema) => null!;
        public void Start(SchemaTransformationEventArgs e) => TransformationStarted?.Invoke(this, e);
        public void End(SchemaTransformationEventArgs e) => TransformationEnded?.Invoke(this, e);
    }

    sealed class TestIDService : ICaexIDService
    {
        int n;
        public string GenerateNewID(CAEXObject caexObject) => "obj-" + (++n);
        public string GenerateNewID(XElement caexElement) => "el-" + (++n);
        public string GenerateNewID() => "id-" + (++n);
    }

    sealed class TestUniqueName : IUniqueName
    {
        public readonly List<string> Log = new();
        public bool IsUniqueCAEXName(XElement element) => true;
        public void RegisterDefault(string elementTagName, string defaultName) { }
        public string UniqueCAEXName(XElement sequence, string elementTagName) => "u";
        public string UniqueCAEXName(XElement sequence, string elementTagName, string defaultName) => "u";
        public string UniqueCAEXName(IEnumerable<XElement> sequence, string elementTagName, string defaultName) => "u";
        public void Suspend() => Log.Add("suspend");
        public void Resume() => Log.Add("resume");
    }

    sealed class TestAutoUpdate : IAutoUpdate
    {
        public bool IsAutoUpdateEnabled { get; set; }
        public event EventHandler<UpdateEventArgs>? ReferenceUpdated;
        public void Touch() => ReferenceUpdated?.Invoke(this, null!);
    }

    static string Svc(object? s) => s == null ? "null" : s.GetType().Name;

    static void ServicesSection(JsonObject o)
    {
        Case(o, "locator", ServiceLocatorCases);
        Case(o, "reference", CaexReferenceCases);
        Case(o, "eventArgs", EventArgsCases);
        foreach (var key in new[] { "docs:map30.aml", "docs:map215.aml", "13_Facet.aml" })
            Case(o, "signing:" + key, r => SigningCases(r, key));
    }

    static void ServiceLocatorCases(Rec r)
    {
        r.V("query", () => Svc(ServiceLocator.QueryService));
        r.V("id", () => Svc(ServiceLocator.IDService));
        r.V("autoUpdate", () => Svc(ServiceLocator.AutoUpdateService));
        r.V("resolver", () => Svc(ServiceLocator.ExternalReferenceResolverService));
        r.V("undo", () => Svc(ServiceLocator.UndoRedoService));
        r.V("unique", () => Svc(ServiceLocator.UniqueNameService));
        r.V("gitHub", () => Svc(ServiceLocator.GitHubAccessService));
        r.V("getQuery", () => Svc(ServiceLocator.GetService<IQuery>()));
        r.V("getService", () => Svc(ServiceLocator.GetService<IAMLService>()));
        r.V("getQueryClass", () => Svc(ServiceLocator.GetService<QueryService>()));
        r.V("unRegisterDefaultQuery", () => Svc(ServiceLocator.UnRegister<IQuery>()));
        r.V("unRegisterDefaultID", () => Svc(ServiceLocator.UnRegister<ICaexIDService>()));
        r.V("unRegisterMissing", () => Svc(ServiceLocator.UnRegister<IUndoRedo>()));
        // A replacement ID service, used by the engine, then removed (the default comes back).
        var ids = new TestIDService();
        r.Do("registerID", () => ServiceLocator.Register<ICaexIDService>(ids));
        r.V("idAfter", () => Svc(ServiceLocator.IDService));
        r.V("newID", () => ServiceLocator.IDService.GenerateNewID());
        r.V("newIE", () =>
        {
            var d = CAEXDocument.New_CAEXDocument();
            return d.CAEXFile.InstanceHierarchy.Append("IH").InternalElement.Append("IE").ID;
        });
        r.V("unRegisterID", () => Svc(ServiceLocator.UnRegister<ICaexIDService>()));
        r.V("idRestored", () => Svc(ServiceLocator.IDService));
        // A replacement query service.
        var q2 = new QueryService();
        r.Do("registerQuery", () => ServiceLocator.Register<IQuery>(q2));
        r.V("queryAfter", () => ReferenceEquals(ServiceLocator.QueryService, q2));
        r.V("unRegisterQuery", () => ReferenceEquals(ServiceLocator.UnRegister<IQuery>(), q2));
        r.V("queryRestored", () => ReferenceEquals(ServiceLocator.QueryService, q2));
        // Registration under the class name; the interface is found by the fallback lookup.
        var au = new TestAutoUpdate();
        r.Do("registerAutoUpdate", () => ServiceLocator.Register(au));
        r.V("autoUpdateFallback", () => Svc(ServiceLocator.AutoUpdateService));
        r.V("unRegisterAutoUpdateByInterface", () => Svc(ServiceLocator.UnRegister<IAutoUpdate>()));
        r.V("unRegisterAutoUpdate", () => Svc(ServiceLocator.UnRegister<TestAutoUpdate>()));
        r.V("autoUpdateGone", () => Svc(ServiceLocator.AutoUpdateService));
        // BeginService / EndService with a suspendable service.
        var un = new TestUniqueName();
        IUniqueName? started = null;
        r.Do("begin", () => ServiceLocator.BeginService<IUniqueName>(() => { ServiceLocator.Register<IUniqueName>(un); return un; }, out started));
        r.V("begun", () => Svc(started) + "|" + string.Join(",", un.Log));
        IUniqueName? again = null;
        r.Do("beginAgain", () => ServiceLocator.BeginService<IUniqueName>(() => new TestUniqueName(), out again));
        r.V("begunAgain", () => B(ReferenceEquals(again, un)) + "|" + string.Join(",", un.Log));
        var calls = 0;
        r.Do("end", () => ServiceLocator.EndService(() => { calls++; ServiceLocator.UnRegister<IUniqueName>(); }, un));
        r.Do("endAgain", () => ServiceLocator.EndService(() => { calls++; }, un));
        r.V("endCalls", () => calls);
        r.V("uniqueGone", () => Svc(ServiceLocator.UniqueNameService));
        // Schema transformation events: the locator subscribes the transformation handlers.
        var t = new TestTransform();
        r.Do("registerTransform", () => ServiceLocator.Register<ISchemaTransform>(t));
        foreach (var (src, target) in new[] { ("docs:map215.aml", CAEXDocument.CAEXSchema.CAEX3_0), ("docs:map30.aml", CAEXDocument.CAEXSchema.CAEX2_15) })
        {
            var e = new SchemaTransformationEventArgs(Doc(src), target);
            r.V("args:" + src, () => F(e.TargetSchema) + "|" + B(e.SourceDocument != null) + "|" + B(e.TargetDocument == null));
            r.Do("start:" + src, () => t.Start(e));
            r.V("target:" + src, () => e.TargetDocument == null ? "null" : Hash(r.C.Apply(SaveString(e.TargetDocument))) + "|" + e.TargetDocument.Schema);
            r.Do("end:" + src, () => t.End(e));
            r.V("final:" + src, () => e.TargetDocument == null ? "null" : SaveString(e.TargetDocument));
        }
        r.V("unRegisterTransform", () => Svc(ServiceLocator.UnRegister<ISchemaTransform>()));
        var e2 = new SchemaTransformationEventArgs(Doc("docs:map215.aml"), CAEXDocument.CAEXSchema.CAEX3_0);
        r.Do("startAfter", () => t.Start(e2));
        r.V("targetAfter", () => e2.TargetDocument == null);
        var e3 = new SchemaTransformationEventArgs(null!, CAEXDocument.CAEXSchema.CAEX3_0);
        r.Do("registerTransform2", () => ServiceLocator.Register<ISchemaTransform>(t));
        r.Do("startNull", () => t.Start(e3));
        r.Do("endNull", () => t.End(e3));
        r.V("unRegisterTransform2", () => Svc(ServiceLocator.UnRegister<ISchemaTransform>()));
        var cs = new CaexIDService();
        r.V("idObject", () => cs.GenerateNewID((CAEXObject)null!));
        r.V("idElement", () => cs.GenerateNewID((XElement)null!));
        r.V("idPlain", () => cs.GenerateNewID());
        r.V("idDistinct", () => cs.GenerateNewID() != cs.GenerateNewID());
    }

    static void CaexReferenceCases(Rec r)
    {
        var doc = Doc("docs:map30.aml");
        var ie = doc.XDocument.Root!.Descendants().First(e => e.Name.LocalName == "InternalElement");
        var ver = doc.XDocument.Root!.Descendants().First(e => e.Name.LocalName == "OldVersion");
        foreach (var (label, el, name) in new (string, XElement, string?)[]
                 {
                     ("ieBase", ie, "RefBaseSystemUnitPath"), ("ieMissing", ie, "Missing"), ("ieValue", ie, "Value"), ("ieEmpty", ie, ""), ("ieNull", ie, null),
                     ("verValue", ver, "Value"), ("verMissing", ver, "Other"),
                 })
        {
            var c = new CAEXReference(el, name!);
            r.V(label + ":object", () => D(c.CaexObject));
            r.V(label + ":element", () => c.Element.Name.LocalName);
            r.V(label + ":name", () => c.ReferenceAttributeName);
            r.V(label + ":value", () => Short(c.ReferenceAttributeValue));
            r.Do(label + ":set", () => c.SetValue("new-" + label));
            r.V(label + ":after", () => Short(c.ReferenceAttributeValue));
            r.Do(label + ":setNull", () => c.SetValue(null!));
            r.V(label + ":afterNull", () => Short(c.ReferenceAttributeValue));
            r.V(label + ":el", () => Short(el.ToString()));
        }
        // An element without a parent and a "Value" reference that does not exist yet.
        var lonely = new XElement("NewVersion");
        var c2 = new CAEXReference(lonely, "Value");
        r.Do("lonely:set", () => c2.SetValue("v"));
        r.V("lonely:el", () => lonely);
        var parent = new XElement("Revision", new XElement("NewVersion"));
        var c3 = new CAEXReference(parent.Element("NewVersion")!, "Value");
        r.Do("child:set", () => c3.SetValue("v2"));
        r.V("child:el", () => parent);
        var c4 = new CAEXReference(null!, "Value");
        r.Do("nullElement:set", () => c4.SetValue("v"));
        r.V("nullElement:value", () => c4.ReferenceAttributeValue);
        r.V("nullElement:object", () => D(c4.CaexObject));
    }

    static void EventArgsCases(Rec r)
    {
        var el = new XElement("InternalElement", new XAttribute("Name", "x"), new XAttribute("RefBaseSystemUnitPath", "A/B"));
        var a = el.Attribute("Name")!;
        string U(UpdateEventArgs u) => $"{F(u.ReferencedElement)}|{F(u.Reference)}|{N(u.UpdateValue)}|{N(u.OldValue)}|{(u.CaexReference == null ? "null" : R(u.CaexReference))}";
        r.V("two", () => U(new UpdateEventArgs(el, a)));
        r.V("three", () => U(new UpdateEventArgs(el, a, "nv")));
        r.V("threeNull", () => U(new UpdateEventArgs(null!, null!, null!)));
        r.V("four", () => U(new UpdateEventArgs(el, new CAEXReference(el, "RefBaseSystemUnitPath"), "old", "new")));
        r.V("fourMissing", () => U(new UpdateEventArgs(el, new CAEXReference(el, "Missing"), "old", "new")));
        r.V("fourNullElement", () => U(new UpdateEventArgs(el, new CAEXReference(null!, "Name"), null!, null!)));
        r.V("fourNull", () => U(new UpdateEventArgs(el, (CAEXReference)null!, "o", "n")));
        var s = new SchemaTransformationEventArgs(null!, CAEXDocument.CAEXSchema.CAEX2_15);
        r.V("schemaArgs", () => B(s.SourceDocument == null) + "|" + s.TargetSchema + "|" + B(s.TargetDocument == null));
    }

    static void SigningCases(Rec r, string key)
    {
        var doc = Doc(key);
        var s = new TestSigning();
        r.V("keys", () => { var k = s.GenerateKeys("pp"); return k.PublicKey + "|" + k.PrivateKey; });
        r.V("enveloped", () => s.ToEnvelopedSignature("i", "v", "k"));
        var objs = doc.XDocument.Root!.DescendantsAndSelf().Select(e => e.CreateCAEXWrapper()).OfType<CAEXObject>().ToList();
        foreach (var obj in objs)
            r.V("text:" + D(obj), () => Short(s.CAEXNodeToString(obj)));
        var ie = objs.OfType<InternalElementType>().FirstOrDefault();
        if (ie == null) return;
        r.V("compute", () => Short(s.ComputeSignature(ie, "k", "p")));
        r.V("create", () => Short(s.CreateSignature(ie, "k", "p")));
        r.V("createPub", () => Short(s.CreateSignature(ie, "k", "p", "pub")));
        foreach (var (k, p) in new[] { ("", "p"), (null, "p"), ("k", ""), ("k", null) })
        {
            r.V($"compute:{N(k)}:{N(p)}", () => s.ComputeSignature(ie, k!, p!));
            r.V($"create:{N(k)}:{N(p)}", () => s.CreateSignature(ie, k!, p!));
        }
        r.V("computeNull", () => s.ComputeSignature(null!, "k", "p"));
        r.V("createNull", () => s.CreateSignature(null!, "k", "p"));
        r.V("verify1", () => s.VerifySignature(ie));
        r.V("verify1ok", () => s.VerifySignature(ie, "ok"));
        r.V("verify2", () => s.VerifySignature(ie, "sig", "pub"));
        r.V("verify2NoSig", () => s.VerifySignature(ie, "", "pub"));
        r.V("verify2NullSig", () => s.VerifySignature(ie, null!, "pub"));
        r.V("verify2NoPub", () => s.VerifySignature(ie, "sig", ""));
        r.V("verify2Null", () => s.VerifySignature(null!, "sig", "pub"));
        // With a signature header: text only (removed from the text) and with child elements (not recognized).
        r.V("header", () => { var h = ie.AppendSignatureHeader(); h.Value = "signature-text"; return h; });
        r.V("textWithHeader", () => Short(s.CAEXNodeToString(ie)));
        r.V("header2", () => { var h = ie.AppendSignatureHeader(); h.Add(new XAttribute("Extra", "1")); h.Value = "t2"; return h; });
        r.V("textWithHeader2", () => Short(s.CAEXNodeToString(ie)));
        r.V("headerChild", () => { var h = ie.AppendSignatureHeader(); h.Add(new XElement("Content", "abc")); return h; });
        r.V("textWithChild", () => Short(s.CAEXNodeToString(ie)));
        r.V("headerEmpty", () => ie.AppendSignatureHeader());
        r.V("textWithEmpty", () => Short(s.CAEXNodeToString(ie)));
        r.Do("remove", () => ie.Remove());
        r.V("textRemoved", () => Short(s.CAEXNodeToString(ie)));
        r.V("computeRemoved", () => Short(s.ComputeSignature(ie, "k", "p")));
    }
}
