using System.IO.Packaging;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.AmlObjects;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Streaming;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// Reads the documents and the container that the port wrote with its optional corrections of
/// Aml.Engine data errors switched on (scripts/gen-fixes.mjs, test/fixes) and reports what the
/// original sees in them: attribute values, base classes, the AutomationML version, internal link
/// partners, the converted document, streamed elements and container relationships.
/// test/engine/fixes.oracle.test.ts compares this with what the files are meant to contain.
///   fixes &lt;dir&gt; &lt;out.json&gt;
/// </summary>
public static class FixesOracle
{
    public static void Run(string[] args)
    {
        var dir = args[0];
        CAEXDocument Load(string name) => CAEXDocument.LoadFromFile(Path.Combine(dir, name));
        var r = new JsonObject();

        // attribute values
        var values = new JsonObject();
        var ie = (InternalElementType)Load("values.aml").FindByPath("IH/Values");
        foreach (var a in ie.Attribute)
        {
            values[a.Name] = a.AttributeValue switch
            {
                null => null,
                bool b => b,
                var v => v.ToString(),
            };
        }
        r["values"] = values;

        // base classes set through the Reference setter
        var references = new JsonObject();
        var refs = Load("references.aml");
        foreach (var path in new[] { "Lib/A", "Lib/B/Inner", "RCL/R1", "ICL/I1" })
        {
            var o = refs.FindByPath(path);
            CAEXObject? baseClass = o switch
            {
                SystemUnitFamilyType s => s.BaseClass,
                RoleFamilyType rc => rc.BaseClass,
                InterfaceFamilyType ic => ic.BaseClass,
                _ => null,
            };
            references[path] = baseClass?.CAEXPath();
        }
        r["references"] = references;

        r["automationMLVersion"] = AMLFile.Create(Load("amlversion.aml")).AutomationMLVersion;

        // internal link partners (CAEX 2.15)
        var linkDoc = Load("internallink-215.aml");
        var link = linkDoc.XDocument.Root!.Descendants("InternalLink").Select(e => (InternalLinkType)e.CreateCAEXWrapper()).Single();
        string? Partner(ExternalInterfaceType? i) => i == null ? null : ((CAEXObject)i.CAEXParent).Name + ":" + i.Name;
        r["internalLink"] = new JsonObject { ["name"] = link.Name, ["a"] = Partner(link.AInterface), ["b"] = Partner(link.BInterface) };

        // converted document
        var converted = Load("conversion.aml");
        r["conversion"] = new JsonObject
        {
            ["schema"] = converted.Schema == CAEXDocument.CAEXSchema.CAEX3_0 ? "3.0" : "2.15",
            ["automationMLVersionAttributes"] = converted.XDocument.Root!.Elements().Count(e => e.Attribute("AutomationMLVersion") != null),
            ["automationMLVersion"] = AMLFile.Create(converted).AutomationMLVersion,
        };

        // streaming: the original on the document with whitespace (all elements) and without
        JsonArray Stream(string name)
        {
            using var s = File.OpenRead(Path.Combine(dir, name));
            return new JsonArray(DocumentStreaming.StreamElementWithName(s, "InternalElement", null!).Select(w => (JsonNode?)((CAEXObject)w).Name).ToArray());
        }
        r["streaming"] = new JsonObject { ["pretty"] = Stream("streaming-pretty.aml"), ["plain"] = Stream("streaming-plain.aml") };

        // container relationships
        var relink = new JsonObject();
        using (var c = new AutomationMLContainer(Path.Combine(dir, "relinked.amlx"), FileMode.Open, FileAccess.Read))
        {
            foreach (var part in c.GetParts().Where(p => !p.Uri.OriginalString.EndsWith(".rels")).OrderBy(p => p.Uri.OriginalString, StringComparer.Ordinal))
            {
                if (part.ContentType != "model/vnd.automationml+xml") continue;
                relink[part.Uri.OriginalString] = new JsonArray(part.GetRelationships().Select(x => (JsonNode?)x.TargetUri.OriginalString).OrderBy(x => x!.GetValue<string>(), StringComparer.Ordinal).ToArray());
            }
        }
        r["relink"] = relink;

        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[1]))!);
        File.WriteAllText(args[1], r.ToJsonString(new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping }));
    }
}
