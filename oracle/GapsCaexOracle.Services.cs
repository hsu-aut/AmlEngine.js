using System.Reflection;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Commands;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Services;
using Aml.Engine.Services.Interfaces;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// Scenarios of the gapscaex package that need user services: an undo service recording the
/// commands of the engine and a deterministic unique name service (same stubs in the JS test).
/// </summary>
public static partial class GapsCaexOracle
{
    static IEnumerable<(string, Action<Ctx>)> ServiceScenarios()
    {
        yield return ("commands", Commands);
        yield return ("crossImport", CrossImport);
        foreach (var file in new[] { "misc30.aml", "mapping215.aml", "uniq215.aml" })
            yield return ("uniqueNames:" + file, c => UniqueNames(c, file));
    }

    sealed class RecordingUndo : IUndoRedo
    {
        public readonly List<ICAEXCommand> Commands = new();
        public bool BeginTransaction(CAEXDocument document, string name = "", CAEXDocument relatedDocument = null!) => false;
        public bool CanRedo(CAEXDocument document) => false;
        public bool CanUndo(CAEXDocument document) => false;
        public void ClearStacks(CAEXDocument document) { }
        public bool EndTransaction(CAEXDocument document) => false;
        public DateTime LastModificationDate(CAEXDocument document, bool undo = true) => default;
        public void Pause(CAEXDocument document = null!) { }
        public void PushCommand(ICAEXCommand cmd) => Commands.Add(cmd);
        public void Redo(CAEXDocument document) { }
        public IEnumerable<string> RedoActions(CAEXDocument document) => Array.Empty<string>();
        public void Resume(CAEXDocument document = null!) { }
        public void Undo(CAEXDocument document) { }
        public IEnumerable<string> UndoActions(CAEXDocument document) => Array.Empty<string>();
    }

    /// <summary>Unique names: the default name, or the default name with the first free suffix _1, _2, ...</summary>
    sealed class StubUniqueName : IUniqueName
    {
        public bool IsUniqueCAEXName(XElement element)
        {
            var name = (string?)element.Attribute("Name");
            return element.Parent == null || element.Parent.Elements(element.Name).Count(x => (string?)x.Attribute("Name") == name) <= 1;
        }

        public void RegisterDefault(string elementTagName, string defaultName) { }

        public string UniqueCAEXName(XElement sequence, string elementTagName) => UniqueCAEXName(sequence, elementTagName, elementTagName);

        public string UniqueCAEXName(XElement sequence, string elementTagName, string defaultName) =>
            UniqueCAEXName(sequence.Elements().Where(e => e.Name.LocalName == elementTagName), elementTagName, defaultName);

        public string UniqueCAEXName(IEnumerable<XElement> sequence, string elementTagName, string defaultName)
        {
            var names = sequence.Select(e => (string?)e.Attribute("Name")).ToHashSet();
            var d = string.IsNullOrEmpty(defaultName) ? elementTagName : defaultName;
            if (!names.Contains(d)) return d;
            for (var i = 1; ; i++)
                if (!names.Contains(d + "_" + i)) return d + "_" + i;
        }

        public void Suspend() { }
        public void Resume() { }
    }

    static List<object?> DumpCommands(RecordingUndo rec, CAEXDocument doc)
    {
        var r = new List<object?>();
        foreach (var cmd in rec.Commands)
        {
            var row = new List<object?> { cmd.GetType().Name, ((CaexCommand)cmd).DisplayName, ((CaexCommand)cmd).XDocument, ((CaexCommand)cmd).CAEXDocument == doc };
            if (cmd is CaexCommand && cmd.GetType().Name is "SetAttributeValueCmd")
                foreach (var p in new[] { "Name", "NewValue", "OldValue", "Owner" }) row.Add(Internal(cmd, p));
            if (cmd.GetType().Name is "SetElementValueCmd" or "SetElementContentCmd")
                foreach (var p in new[] { "Element", "NewValue", "OldValue" }) row.Add(Internal(cmd, p));
            r.Add(row);
        }
        rec.Commands.Clear();
        return r;
    }

    static void Commands(Ctx c)
    {
        var rec = new RecordingUndo();
        ServiceLocator.Register<IUndoRedo>(rec);
        try
        {
            var doc = c.Load("misc30.aml");
            var ih = doc.CAEXFile.InstanceHierarchy[0]!;
            var ie = ih.InternalElement[0]!;
            var attr = ie.Attribute[0]!;
            c.R("load", () => DumpCommands(rec, doc));
            c.V("Name=", () => ie.Name = "IEx");
            c.R("Name=.cmds", () => DumpCommands(rec, doc));
            c.V("Description=", () => ie.Description = "d");
            c.R("Description=.cmds", () => DumpCommands(rec, doc));
            c.V("Description=2", () => ie.Description = "d2");
            c.R("Description=2.cmds", () => DumpCommands(rec, doc));
            c.V("Value=", () => attr.Value = "9");
            c.R("Value=.cmds", () => DumpCommands(rec, doc));
            c.V("AdditionalInformation[0]=element", () => doc.CAEXFile.AdditionalInformation[0] = new XElement("Inner", new XAttribute("k", "v"), "text"));
            c.R("AdditionalInformation[0]=element.cmds", () => DumpCommands(rec, doc));
            c.V("AdditionalInformation[1]=string", () => doc.CAEXFile.AdditionalInformation[1] = "plain");
            c.R("AdditionalInformation[1]=string.cmds", () => DumpCommands(rec, doc));
            var i2 = (InterfaceFamilyType)doc.CAEXFile.InterfaceClassLib[0]!.InterfaceClass[1]!;
            var i1n = doc.CAEXFile.InterfaceClassLib[0]!.InterfaceClass[0]!.InterfaceClass[0]!;
            c.V("Reference=", () => i2.Reference = i1n);
            c.R("Reference=.cmds", () => DumpCommands(rec, doc));
            c.V("Remove", () => ie.Attribute[1]!.Remove());
            c.R("Remove.cmds", () => DumpCommands(rec, doc));
            c.V("New_Attribute", () => ie.Attribute.Append("na"));
            c.R("New_Attribute.cmds", () => DumpCommands(rec, doc));
            c.D();
        }
        finally
        {
            ServiceLocator.UnRegister<IUndoRedo>();
        }
    }

    static void UniqueNames(Ctx c, string file)
    {
        ServiceLocator.Register<IUniqueName>(new StubUniqueName());
        try
        {
            var doc = c.Load(file);
            var all = AllWrappers(doc).OfType<CAEXObject>().ToList();
            CAEXObject? Named(string name) => all.FirstOrDefault(o => o.Name == name);
            var sucl = doc.CAEXFile.SystemUnitClassLib[0]!;
            var s1 = (SystemUnitFamilyType)Named("S1")!;
            c.R("Import S1", () => sucl.Import(s1, "S1"));
            c.R("Import S1 again", () => sucl.Import(s1, null!));
            c.R("Import S1 sub", () => sucl.Import(s1, "S1", true));
            c.R("Insert copy S1", () => sucl.SystemUnitClass.Insert(s1.Copy() as SystemUnitFamilyType, false));
            c.D();
            var s2 = (SystemUnitFamilyType)Named("S2")!;
            foreach (var a in s1.Attribute.ToList())
                c.R("S2.Import " + a.Name, () => s2.Import(a, a.Name));
            foreach (var e in s1.ExternalInterface.ToList())
                c.R("S2.Import " + e.Name, () => s2.Import(e, e.Name));
            foreach (var ie in s1.InternalElement.ToList())
                c.R("S2.Import " + ie.Name, () => s2.Import(ie, ie.Name));
            c.R("S2.Import S1 as IE", () => s2.Import(s1, "sie"));
            c.D();
            var ih = doc.CAEXFile.InstanceHierarchy[0]!;
            var ie1 = ih.InternalElement[0]!;
            c.R("AddNewMirror", () => ih.InternalElement.AddNewMirror(ie1));
            c.R("AddNewMirror2", () => ih.InternalElement.AddNewMirror(ie1));
            c.R("Append", () => ih.InternalElement.Append());
            c.R("Append2", () => ih.InternalElement.Append());
            c.R("Import IE1", () => ih.Import(ie1, "IE1"));
            c.R("Import IE1 ''", () => ih.Import(ie1, ""));
            c.R("attr Append", () => ie1.Attribute.Append());
            c.R("attr Append2", () => ie1.Attribute.Append());
            c.D();
        }
        finally
        {
            ServiceLocator.UnRegister<IUniqueName>();
        }
    }
}

public static partial class GapsCaexOracle
{
    /// <summary>External references: every element is external, alias and path derived from its name.</summary>
    sealed class StubResolver : Aml.Engine.Services.Interfaces.IExternalReferenceResolver
    {
        public void SetRedirection(string address, string redirectAddress) { }
        public void ClearRedirection(string address) { }
        public void ClearRedirection() { }

        public bool IsExternal(CAEXDocument document, System.Xml.Linq.XElement element, out string alias, out string path)
        {
            var name = (string?)element.Attribute("Name") ?? element.Name.LocalName;
            alias = name + "_A";
            path = name + ".aml";
            return !name.StartsWith("X");
        }

        public (CAEXDocument Document, string Message) LoadOrGetReferencedDocument(ExternalReferenceType externalReference) => (null!, "no");
        public (CAEXDocument Document, string Message) LoadOrGetReferencedDocument(CAEXDocument document, string path) => (null!, "no");
        public bool IsExternalReferenceRegistered(ExternalReferenceType externalReference, string path) => false;
        public CAEXDocument RegisterExternalDocument(ExternalReferenceType externalReference, CAEXDocument document, string path) => document;
        public IEnumerable<CAEXDocument> ResolvedDocuments(CAEXDocument documentWithExternals) => Array.Empty<CAEXDocument>();
        public (CAEXDocument Document, string Message) ResolveExternalDocument(string url, bool useCache = true) => (null!, "no");
        public void RegisterResolverFunction(Func<string, CAEXDocument> resolverFunction) { }
        public bool CanResolve(string externalAddress) => false;
        public void UnloadDocument(string url) { }
    }

    static void CrossImport(Ctx c)
    {
        Aml.Engine.Services.ServiceLocator.Register<Aml.Engine.Services.Interfaces.IExternalReferenceResolver>(new StubResolver());
        try
        {
            foreach (var name in new[] { "C1", "C2", "C3", "xie", "SI", "SR", "XIH", "SL" })
            {
                var target = c.Load("misc30.aml");
                var source = CAEXDocument.LoadFromString(File.ReadAllText(Path.Combine(c.InDir, "xsource30.aml"), System.Text.Encoding.UTF8));
                var obj = source.XDocument.Root!.Descendants().Where(e => (string?)e.Attribute("Name") == name).Select(e => (CAEXObject)e.CreateCAEXWrapper()!).First();
                CAEXBasicObject owner = obj switch
                {
                    SystemUnitFamilyType => target.CAEXFile.SystemUnitClassLib[0]!,
                    InternalElementType => target.CAEXFile.InstanceHierarchy[0]!,
                    InterfaceFamilyType => target.CAEXFile.InterfaceClassLib[0]!,
                    RoleFamilyType => target.CAEXFile.RoleClassLib[0]!,
                    _ => target.CAEXFile,
                };
                c.R("Import(" + name + ")", () => owner.Import(obj, "imp_" + name));
                c.R("Import(" + name + ") again", () => owner.Import(obj, null!));
                c.D("#" + name);
                c.D("#source" + name, source);
            }
        }
        finally
        {
            Aml.Engine.Services.ServiceLocator.UnRegister<Aml.Engine.Services.Interfaces.IExternalReferenceResolver>();
        }
    }
}
