using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;

namespace Oracle;

/// <summary>
/// Executes XLinq operation scripts (see scripts/gen-xops.mjs) and records, per operation, the
/// result or exception and the serialized document. test/xml/xops.oracle.test.ts runs the same
/// scripts against the TS port.
/// </summary>
public static class XOpsOracle
{
    public static void Run(string scriptFile, string outFile)
    {
        var scripts = JsonNode.Parse(File.ReadAllText(scriptFile))!.AsArray();
        var results = new JsonArray();
        foreach (var script in scripts)
        {
            var doc = XDocument.Parse(script!["xml"]!.GetValue<string>(),
                script["preserve"]!.GetValue<bool>() ? LoadOptions.PreserveWhitespace : LoadOptions.None);
            var steps = new JsonArray();
            foreach (var op in script["ops"]!.AsArray())
            {
                string result;
                try { result = Apply(doc, op!.AsObject()); }
                catch (Exception e) { result = "!" + e.GetType().Name; }
                string xml;
                try { xml = doc.ToString(SaveOptions.DisableFormatting); }
                catch (Exception e) { xml = "!" + e.GetType().Name; }
                steps.Add(new JsonArray(result, xml));
            }
            results.Add(steps);
        }
        File.WriteAllText(outFile, results.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
    }

    static XElement Target(XDocument doc, JsonObject op, string key = "k")
    {
        var all = doc.Root!.DescendantsAndSelf().ToList();
        return all[op[key]!.GetValue<int>() % all.Count];
    }

    static string? Str(JsonObject op, string key) => op[key]?.GetValue<string>();

    static string Apply(XDocument doc, JsonObject op)
    {
        var e = Target(doc, op);
        switch (op["op"]!.GetValue<string>())
        {
            case "add":
                e.Add(Str(op, "text") is { } t ? new XElement(XName.Get(Str(op, "name")!), t) : new XElement(XName.Get(Str(op, "name")!)));
                return "ok";
            case "addFirst":
                e.AddFirst(new XElement(XName.Get(Str(op, "name")!)));
                return "ok";
            case "addAfterSelf":
                e.AddAfterSelf(new XElement(XName.Get(Str(op, "name")!)));
                return "ok";
            case "addBeforeSelf":
                e.AddBeforeSelf(new XElement(XName.Get(Str(op, "name")!)));
                return "ok";
            case "addText":
                e.Add(Str(op, "text"));
                return Describe(e);
            case "addFirstText":
                e.AddFirst(Str(op, "text"));
                return Describe(e);
            case "addAfterSelfText":
                e.AddAfterSelf(Str(op, "text"));
                return "ok";
            case "setValue":
                e.Value = Str(op, "text")!;
                return Describe(e);
            case "setAttr":
                e.SetAttributeValue(XName.Get(Str(op, "name")!), Str(op, "value"));
                return string.Join(",", e.Attributes().Select(a => a.Name.ToString()));
            case "setElementValue":
                e.SetElementValue(XName.Get(Str(op, "name")!), Str(op, "value"));
                return Describe(e);
            case "remove":
                e.Remove();
                return "ok";
            case "removeNodes":
                e.RemoveNodes();
                return Describe(e);
            case "removeAttributes":
                e.RemoveAttributes();
                return "ok";
            case "replaceWith":
                e.ReplaceWith(new XElement(XName.Get(Str(op, "name")!), "r"));
                return "ok";
            case "addExisting":
                var other = Target(doc, op, "j");
                e.Add(other);
                return Describe(e);
            case "addCData":
                e.Add(new XCData(Str(op, "text")!));
                return Describe(e);
            case "addComment":
                e.Add(new XComment(Str(op, "text")!));
                return Describe(e);
            case "rename":
                e.Name = XName.Get(Str(op, "name")!);
                return "ok";
            case "removeEverySecondChild":
            {
                int i = 0, visited = 0;
                foreach (var c in e.Elements())
                {
                    visited++;
                    if (i++ % 2 == 1) c.Remove();
                }
                return "visited " + visited;
            }
            case "appendWhileIterating":
            {
                int visited = 0;
                foreach (var c in e.Elements())
                {
                    if (++visited > 50) break;
                    if (visited <= 2) e.Add(new XElement("added"));
                }
                return "visited " + visited;
            }
            case "replaceAll":
                e.ReplaceAll(new XAttribute("q", "1"), new XElement(XName.Get(Str(op, "name")!)), Str(op, "text"));
                return Describe(e);
            case "moveFirstChildToEnd":
            {
                var first = e.Elements().FirstOrDefault();
                if (first == null) return "none";
                first.Remove();
                e.Add(first);
                return Describe(e);
            }
            case "removeLastNode":
            {
                var last = e.LastNode;
                if (last == null) return "none";
                last.Remove();
                return Describe(e);
            }
            default:
                throw new NotSupportedException(op["op"]!.GetValue<string>());
        }
    }

    static string Describe(XElement e) =>
        $"{e.IsEmpty}|{e.HasElements}|{e.Value}|{e.Nodes().Count()}|{string.Join(",", e.Nodes().Select(n => n.NodeType.ToString()))}";
}
