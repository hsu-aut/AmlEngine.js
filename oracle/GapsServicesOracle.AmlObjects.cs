using System.IO.Compression;
using System.IO.Packaging;
using System.Reflection;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.AmlObjects;
using Aml.Engine.AmlObjects.Extensions;
using Aml.Engine.CAEX;
using Aml.Engine.Services;
using Aml.Engine.Services.Interfaces;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

// Section "amlobjects": the remaining functions of Aml.Engine.AmlObjects (AMLFile value
// sequences, library element sequences, LoadExternalLibrary across schema versions, facet
// interface insertion) and of the System.IO.Packaging / System.IO helpers the port reimplements
// (Package relationships and content types, part streams, Version, Path, the case insensitive
// dictionary of the MIME type map).
public static partial class GapsServicesOracle
{
    static void AmlObjectsSection(JsonObject o)
    {
        foreach (var start in new[] { "new30", "new215", "docs:map30.aml", "docs:map215.aml" })
        {
            Case(o, "amlFile:" + start, r => AmlFileCases(r, start));
            Case(o, "libraries:" + start, r => LibraryCases(r, start));
        }
        Case(o, "loadExternal", LoadExternalCases);
        foreach (var key in new[] { "13_Facet.aml", "docs:map30.aml" })
            Case(o, "facet:" + key, r => FacetCases(r, key));
        Case(o, "version", VersionCases);
        Case(o, "path", PathCases);
        Case(o, "dictionary", DictionaryCases);
        foreach (var f in Directory.GetFiles(Path.Combine(inputDir, "packages")).OrderBy(x => x, StringComparer.Ordinal))
            Case(o, "package:" + Path.GetFileName(f), r => PackageCases(r, File.ReadAllBytes(f)));
    }

    static CAEXDocument StartDoc(string start) => start switch
    {
        "new30" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX3_0),
        "new215" => CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.CAEX2_15),
        _ => Doc(start),
    };

    static string Meta(MetaInformation? m) => m == null ? "null" : $"Meta({N(m.WriterName)}|{N(m.WriterID)}|{N(m.WriterVendor)}|{N(m.WriterVendorURL)}|{N(m.WriterVersion)}|{N(m.WriterRelease)}|{N(m.LastWritingDateTime)}|{N(m.WriterProjectTitle)}|{N(m.WriterProjectID)})";
    static string DV(DocumentVersionInformation? d) => d == null ? "null" : $"DV({N(d.DocumentIdentifier)}|{N(d.Version)})";

    static void AmlFileCases(Rec r, string start)
    {
        var doc = StartDoc(start);
        var f = AMLFile.Create(doc);
        r.V("versions0", () => string.Join(",", f.DocumentVersion.Select(DV)));
        r.Do("appendVersion", () => f.DocumentVersion.Append(new DocumentVersionInformation { DocumentIdentifier = "doc1", Version = "1.2" }));
        r.Do("appendVersionNull", () => f.DocumentVersion.Append(new DocumentVersionInformation()));
        r.V("versions1", () => string.Join(",", f.DocumentVersion.Select(DV)));
        r.V("writer0", () => string.Join(",", f.WriterHeader.Select(Meta)));
        r.Do("appendWriter", () => f.WriterHeader.Append(new MetaInformation { WriterName = "w", WriterID = "id", WriterVendor = "v", WriterVendorURL = "u", WriterVersion = "1", WriterRelease = "2", LastWritingDateTime = "2020-01-01T00:00:00", WriterProjectTitle = "t", WriterProjectID = "p" }));
        r.Do("appendWriterEmpty", () => f.WriterHeader.Append(new MetaInformation()));
        r.V("writer1", () => string.Join(",", f.WriterHeader.Select(Meta)));
        var dep = typeof(AMLFile).GetProperty("DocumentVersionDeprecated", BindingFlags.Instance | BindingFlags.NonPublic)!;
        r.V("deprecated0", () => string.Join(",", ((IEnumerable<DocumentVersionInformation>)dep.GetValue(f)!).Select(DV)));
        r.Do("appendDeprecated", () => ((ValueSequence<DocumentVersionInformation>)dep.GetValue(f)!).Append(new DocumentVersionInformation { DocumentIdentifier = "old", Version = null! }));
        r.V("deprecated1", () => string.Join(",", ((IEnumerable<DocumentVersionInformation>)dep.GetValue(f)!).Select(DV)));
        r.V("valid", () => B(f.IsValidAutomationMLVersion("2.0")) + B(f.IsValidAutomationMLVersion("2.1")) + B(f.IsValidAutomationMLVersion("")) + B(f.IsValidAutomationMLVersion("x")));
        r.V("doc", () => SaveString(doc));
    }

    static void LibraryCases(Rec r, string start)
    {
        var doc = StartDoc(start);
        string Names<TT>(IEnumerable<TT>? xs) where TT : CAEXObject => xs == null ? "null" : "[" + string.Join(",", xs.Select(x => x.Name)) + "]";
        r.V("baseAttributes", () => Names(AutomationMLBaseAttributeTypeLibType.AttributeTypeLib(doc)?.AttributeType));
        r.V("baseRoles", () => Names(AutomationMLBaseRoleClassLibType.RoleClassLib(doc)?.RoleClass));
        r.V("interfaces", () => Names(AutomationMLInterfaceClassLibType.InterfaceClassLib(doc)?.InterfaceClass));
        r.V("logicInterfaces", () => Names(AutomationMLLogicInterfaceClassLibType.InterfaceClassLib(doc)?.InterfaceClass));
        r.V("logicRoles", () => Names(AutomationMLLogicRoleClassLibType.RoleClassLib(doc)?.RoleClass));
        r.V("plcOpen", () => Names(AutomationMLPLCopenXMLInterfaceClassLibType.InterfaceClassLib(doc)?.InterfaceClass));
        r.V("plcOpenLoaded", () => AutomationMLPLCopenXMLInterfaceClassLibType.IsLoaded(doc));
        r.V("doc", () => Hash(r.C.Apply(SaveString(doc))));
        // A document that already contains a library with the name of the PLCopenXML library.
        var d2 = StartDoc(start);
        r.V("plcOpenExisting", () =>
        {
            d2.CAEXFile.InterfaceClassLib.Append("AutomationMLPLCopenXMLInterfaceClassLib").InterfaceClass.Append("VariableInterface");
            var lib = AutomationMLPLCopenXMLInterfaceClassLibType.InterfaceClassLib(d2);
            return Names(lib?.InterfaceClass) + "|" + D(lib?.InterfaceClass.Append("Added"));
        });
        // Library types on detached library nodes: a new element asks the sequence for its CAEX owner.
        var ns = doc.Schema == CAEXDocument.CAEXSchema.CAEX3_0 ? (XNamespace)"http://www.dke.de/CAEX" : XNamespace.None;
        foreach (var (type, tag, prop) in new[]
                 {
                     (typeof(AutomationMLBaseAttributeTypeLibType), "AttributeTypeLib", "AttributeType"), (typeof(AutomationMLBaseRoleClassLibType), "RoleClassLib", "RoleClass"),
                     (typeof(AutomationMLInterfaceClassLibType), "InterfaceClassLib", "InterfaceClass"), (typeof(AutomationMLLogicInterfaceClassLibType), "InterfaceClassLib", "InterfaceClass"),
                     (typeof(AutomationMLLogicRoleClassLibType), "RoleClassLib", "RoleClass"), (typeof(AutomationMLPLCopenXMLInterfaceClassLibType), "InterfaceClassLib", "InterfaceClass"),
                 })
        {
            r.V("detached:" + type.Name, () =>
            {
                var node = new XElement(ns + tag, new XAttribute("Name", "L"));
                var lib = type.GetConstructors(BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic).Single().Invoke(new object[] { node });
                var seq = type.GetProperty(prop)!.GetValue(lib)!;
                var added = seq.GetType().GetMethod("Append", Type.EmptyTypes)!.Invoke(seq, null);
                return D(added as CAEXWrapper) + "|" + node;
            });
        }
    }

    static void LoadExternalCases(Rec r)
    {
        var m = typeof(AMLLibraryType<InterfaceFamilyType>).GetMethod("LoadExternalLibrary", BindingFlags.Static | BindingFlags.NonPublic)!;
        foreach (var (docStart, resource) in new[] { ("new30", "7_ICL.aml"), ("new215", "1_AMLBaseLibraries.aml"), ("new30", "1_AMLBaseLibraries.aml") })
        {
            var bytes = File.ReadAllBytes(Path.Combine(corpusDir, resource));
            Func<CAEXDocument, CAEXLibrary<InterfaceFamilyType>> import = d => d == null ? null! : d.CAEXFile.InterfaceClassLib.FirstOrDefault()!;
            var label = docStart + ":" + resource;
            r.V(label, () => D((CAEXWrapper?)m.Invoke(null, new object?[] { StartDoc(docStart), new MemoryStream(bytes), import })));
            var t = new TestTransform();
            ServiceLocator.Register<ISchemaTransform>(t);
            try
            {
                r.V(label + ":transform", () => D((CAEXWrapper?)m.Invoke(null, new object?[] { StartDoc(docStart), new MemoryStream(bytes), import })));
            }
            finally
            {
                ServiceLocator.UnRegister<ISchemaTransform>();
            }
        }
        r.V("nullResource", () => D((CAEXWrapper?)m.Invoke(null, new object?[] { StartDoc("new30"), null, null })));
    }

    static void FacetCases(Rec r, string key)
    {
        var doc = Doc(key);
        var all = AllWrappers(doc);
        var facets = all.OfType<InternalElementType>().Where(ie => ie.IsAMLFacet()).ToList();
        var others = all.OfType<ExternalInterfaceType>().ToList();
        foreach (var ie in facets)
        {
            var facet = new AMLFacet(ie.Node);
            var parent = ie.CAEXParent as IObjectWithExternalInterface;
            var candidates = (parent?.ExternalInterface.ToList() ?? new()).Concat(others.Take(3)).ToList();
            foreach (var ei in candidates)
                r.V($"insert:{ie.Name}:{D(ei)}", () => D(facet.FacetExternalInterface.Insert(ei)));
            r.V($"insertNull:{ie.Name}", () => D(facet.FacetExternalInterface.Insert(null!)));
        }
        r.V("doc", () => Hash(r.C.Apply(SaveString(doc))));
        var fresh = CAEXDocument.New_CAEXDocument(doc.Schema);
        var de = fresh.CAEXFile.InstanceHierarchy.Append("IH").InternalElement.Append("DocElement");
        de.RoleRequirements.Append().RefBaseRoleClassPath = "AutomationMLBPRRoleClassLib/ExternalData";
        de.Remove();
        r.V("detachedDocumentElement", () => B(ExternalDataReference.IsDocumentElement(de)) + "|" + D(de.AddDocumentReference("ref")));
    }

    static void VersionCases(Rec r)
    {
        var vs = new[] { "1.2", "1.2.0", "1.2.0.0", "1.2.3", "01.2", "1.02", "2.0", "1.2.3.4" };
        foreach (var a in vs)
            foreach (var b in vs)
                r.V($"equals:{a}:{b}", () => new Version(a).Equals(new Version(b)));
        r.V("equalsNull", () => new Version("1.2").Equals(null));
        r.V("equalsString", () => new Version("1.2").Equals("1.2"));
        r.V("distinct", () => string.Join(",", vs.Select(v => new Version(v)).Distinct()));
    }

    static readonly string[] Paths =
    {
        "C:\\dir\\file.aml", "C:/dir/file.tar.gz", "file", "dir/", "dir\\", "C:", "C:file.aml", "\\\\server\\share\\f.x", ".hidden", "name.", "a.b.c", "", " ", "/x/.aml", "dir/sub/f g.aml", "x:y.aml", "..", "a..b",
    };

    static void PathCases(Rec r)
    {
        foreach (var p in Paths)
            r.V("path:" + p, () => N(Path.GetFileName(p)) + "|" + N(Path.GetFileNameWithoutExtension(p)));
        r.V("pathNull", () => N(Path.GetFileName((string)null!)) + "|" + N(Path.GetFileNameWithoutExtension((string)null!)));
    }

    static readonly string[] DictKeys = { ".aml", ".AML", ".Aml", ".amlx", ".xml", "straße", "STRASSE", "i", "I", "ı", "İ", "é", "É", "e\u0301", "ǅ", "ǆ", "Ǆ", "", "ﬀ", "FF", "ab", "a\u00ADb", "a\u200Bb", "a\u0001b", "Ａb", "ｱ", "Ａ", "a", "²", "2", "ｶ", "カ", "か" };

    static void DictionaryCases(Rec r)
    {
        var d = new Dictionary<string, int>(StringComparer.InvariantCultureIgnoreCase);
        var i = 0;
        foreach (var k in DictKeys)
        {
            var n = i++;
            r.V("add:" + k, () => { d.Add(k, n); return d.Count; });
        }
        foreach (var k in DictKeys.Concat(new[] { "missing", ".AMLX" }))
            r.V("contains:" + k, () => B(d.ContainsKey(k)) + "|" + (d.TryGetValue(k, out var v) ? v.ToString() : "none"));
        r.V("count", () => d.Count);
        r.V("containsNull", () => d.ContainsKey(null!));
    }

    static void PackageCases(Rec r, byte[] bytes)
    {
        var ms = new MemoryStream();
        ms.Write(bytes);
        ms.Position = 0;
        Package? pkg = null;
        r.Do("open", () => pkg = Package.Open(ms, FileMode.Open, FileAccess.ReadWrite));
        if (pkg == null) return;
        string Parts(Package p) => string.Join(",", p.GetParts().Select(x => x.Uri + "=" + x.ContentType));
        string Rel(PackageRelationship? x) => x == null ? "null" : $"Rel({x.Id}|{x.RelationshipType}|{x.TargetUri}|{x.TargetMode}|{x.SourceUri}|{B(ReferenceEquals(x.Package, pkg))})";
        r.V("parts", () => Parts(pkg));
        r.V("rels", () => string.Join(",", pkg.GetRelationships().Select(Rel)));
        foreach (var id in new[] { "rId1", "rId2", "rId9", "", "1x", "a b", null })
        {
            r.V("rel:" + N(id), () => Rel(pkg.GetRelationship(id!)));
            r.V("relExists:" + N(id), () => pkg.RelationshipExists(id!));
        }
        var a = new Uri("/a.xml", UriKind.Relative);
        if (pkg.PartExists(a))
        {
            var part = pkg.GetPart(a);
            foreach (var id in new[] { "r2", "r3", "rX", "", "1x", null })
            {
                r.V("partRel:" + N(id), () => Rel(part.GetRelationship(id!)));
                r.V("partRelExists:" + N(id), () => part.RelationshipExists(id!));
            }
            r.V("stream", () =>
            {
                using var s = part.GetStream();
                var b1 = s.ReadByte();
                var b2 = s.ReadByte();
                s.Flush();
                s.Position = s.Length;
                return b1 + "," + b2 + "," + s.ReadByte() + "," + s.Length;
            });
        }
        r.V("createBin", () => pkg.CreatePart(new Uri("/new.bin", UriKind.Relative), "application/x-bin").Uri);
        r.V("createNoExt", () => pkg.CreatePart(new Uri("/other/new2", UriKind.Relative), "application/x-n").Uri);
        r.Do("deleteRelsOfB", () => pkg.DeletePart(new Uri("/_rels/b.txt.rels", UriKind.Relative)));
        r.Do("deleteA", () => pkg.DeletePart(a));
        r.Do("deleteRootRels", () => pkg.DeletePart(new Uri("/_rels/.rels", UriKind.Relative)));
        r.V("relsAfter", () => string.Join(",", pkg.GetRelationships().Select(Rel)));
        r.Do("deleteD", () => pkg.DeletePart(new Uri("/c/d.xml", UriKind.Relative)));
        r.V("partsAfter", () => Parts(pkg));
        r.Do("flush", () => pkg.Flush());
        r.Do("dispose", () => ((IDisposable)pkg).Dispose());
        r.V("afterDispose", () => pkg.RelationshipExists("rId1"));
        r.V("entries", () =>
        {
            using var z = new ZipArchive(new MemoryStream(ms.ToArray()), ZipArchiveMode.Read);
            return string.Join(",", z.Entries.Select(e => e.FullName + ":" + e.Length).OrderBy(x => x, StringComparer.Ordinal));
        });
        r.V("contentTypes", () =>
        {
            using var z = new ZipArchive(new MemoryStream(ms.ToArray()), ZipArchiveMode.Read);
            using var s = z.GetEntry("[Content_Types].xml")!.Open();
            return new StreamReader(s).ReadToEnd();
        });
        r.V("reopen", () =>
        {
            using var p2 = Package.Open(new MemoryStream(ms.ToArray()), FileMode.Open, FileAccess.Read);
            return Parts(p2) + "|" + string.Join(",", p2.GetRelationships().Select(x => x.Id));
        });
    }
}
