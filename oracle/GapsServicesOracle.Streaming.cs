using System.Text.Json.Nodes;
using System.Xml;
using Aml.Engine.CAEX;
using Aml.Engine.Streaming;

namespace Oracle;

// Section "streaming": DocumentStreaming on local files and streams (no network).
public static partial class GapsServicesOracle
{
    static string Wr(IEnumerable<ICAEXWrapper?>? ws)
    {
        if (ws == null) return "null";
        return "[" + string.Join(",", ws.Select(w => w == null ? "null" : w is ExternalReferenceType er ? "ER(" + N(er.Alias) + "|" + N(er.Path) + ")" : D(w as CAEXWrapper))) + "]";
    }

    static void StreamingSection(JsonObject o)
    {
        var dir = Path.Combine(inputDir, "streaming");
        var files = Directory.GetFiles(dir).Select(Path.GetFileName).OrderBy(f => f, StringComparer.Ordinal).ToList();
        foreach (var name in files)
        {
            var path = Path.Combine(dir, name!);
            Case(o, name!, r => StreamingFile(r, path));
        }
        Case(o, "variants", r =>
        {
            var first = Path.Combine(dir, files[0]!);
            var url = new Uri(first).AbsoluteUri;
            r.V("fileUrl", () => url);
            r.V("fileUrl:new", () => DocumentStreaming.NewDocumentVersions(url));
            r.V("fileUrl:old", () => DocumentStreaming.OldDocumentVersions(url));
            r.V("fileUrl:refs", () => Wr(DocumentStreaming.ReadExternalReferenceType(url)));
            var missing = Path.Combine(dir, "AML_Test_RoleClassLib_AMLEd2_9.9.9.aml");
            r.V("missing:new", () => DocumentStreaming.NewDocumentVersions(missing));
            r.V("missing:refs", () => Wr(DocumentStreaming.ReadExternalReferenceType(missing)));
            r.V("relative:new", () => DocumentStreaming.NewDocumentVersions("streaming/AML_Test_RoleClassLib_AMLEd2_1.2.0.aml"));
            r.V("relative:refs", () => Wr(DocumentStreaming.StreamElementWithName("streaming/x.aml", "RoleClass", null!)));
            r.V("null:new", () => DocumentStreaming.NewDocumentVersions(null!));
            r.V("null:old", () => DocumentStreaming.OldDocumentVersions(null!));
            r.V("empty:new", () => DocumentStreaming.NewDocumentVersions(""));
            r.V("urlNull", () => Wr(DocumentStreaming.StreamElementWithName((string)null!, "RoleClass", null!)));
            r.V("urlBlank", () => Wr(DocumentStreaming.StreamElementWithName(" ", "RoleClass", null!)));
            r.V("nameNull", () => Wr(DocumentStreaming.StreamElementWithName(first, null!, null!)));
            r.V("nameBlank", () => Wr(DocumentStreaming.StreamElementWithName(first, "\t", null!)));
            r.V("streamNull", () => Wr(DocumentStreaming.StreamElementWithName((Stream)null!, "RoleClass", null!)));
            r.V("streamNameNull", () => Wr(DocumentStreaming.StreamElementWithName(new MemoryStream(File.ReadAllBytes(first)), null!, null!)));
            r.V("streamBroken", () => Wr(DocumentStreaming.StreamElementWithName(new MemoryStream(new byte[] { 60, 97 }), "a", null!)));
            r.V("streamEmpty", () => Wr(DocumentStreaming.StreamElementWithName(new MemoryStream(), "a", null!)));
            foreach (var u in new[] { "http://u:p@host/x.aml", "https://host/x", "http://user@host/", "http://u:p:q@h/", "https://u%20x:p%3Ay@h/", "file:///C:/x/y.aml", "C:\\x\\y.aml", "relative/y.aml", "ftp://h/x", "", null, "\\\\server\\share\\x.aml", "urn:isbn:1", "mailto:a@b.c" })
            {
                r.V("prepare:" + N(u), () =>
                {
                    var args = new object?[] { u, new XmlReaderSettings(), null };
                    var ok = typeof(DocumentStreaming).GetMethod("PrepareSettingsWithCredential", System.Reflection.BindingFlags.Static | System.Reflection.BindingFlags.NonPublic)!.Invoke(null, args);
                    return F(ok) + "|" + F(args[2]);
                });
            }
        });
    }

    static void StreamingFile(Rec r, string path)
    {
        r.V("new", () => DocumentStreaming.NewDocumentVersions(path));
        r.V("old", () => DocumentStreaming.OldDocumentVersions(path));
        r.V("refs", () => Wr(DocumentStreaming.ReadExternalReferenceType(path)));
        r.V("refsStream", () => Wr(DocumentStreaming.ReadExternalReferenceType(new MemoryStream(File.ReadAllBytes(path)))));
        foreach (var name in new[] { "RoleClass", "InternalElement", "Revision", "ExternalReference", "Unknown", "CAEXFile" })
        {
            r.V("elements:" + name, () => Wr(DocumentStreaming.StreamElementWithName(path, name, null!)));
            r.V("elementsClose:" + name, () => Wr(DocumentStreaming.StreamElementWithName(path, name, n => n == "SystemUnitClassLib")));
            r.V("stream:" + name, () => Wr(DocumentStreaming.StreamElementWithName(new MemoryStream(File.ReadAllBytes(path)), name, null!)));
            r.V("streamClose:" + name, () => Wr(DocumentStreaming.StreamElementWithName(new MemoryStream(File.ReadAllBytes(path)), name, n => n == "InterfaceClassLib")));
        }
    }
}
