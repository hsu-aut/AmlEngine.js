using System.Reflection;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Xml.Linq;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// Calls of the original that may not return, outside the read API: the CAEX path splitter on
/// paths longer than 65535 characters (its ushort counter wraps), the partial node path with
/// a root that is not an ancestor and CopyAttributesFrom with the target as its own source. Each case runs in a child process, which is ended when it has
/// not returned after HangMs (recorded as "!hang"); a call that does not return may also collect
/// results without end, which only ending the process stops.
///   noreturn &lt;cases.json&gt; &lt;out.json&gt;
/// Case: { fn: "split", parts: [[text, repeat], ...], schema: "3.0" | "2.15", alias: bool }
///       { fn: "partial", xml, node: [i, ...], root: [i, ...] }  (element index paths from the root)
///       { fn: "copy", xml, target: [i, ...], source: [i, ...], values: bool }  (CopyAttributesFrom)
/// Result: { ok: ... } | { err: exception type } | "!hang".
/// </summary>
public static class NoReturnOracle
{
    const int HangMs = 5000;

    public static void Run(string[] args)
    {
        var cases = JsonNode.Parse(File.ReadAllText(args[0]))!.AsArray();
        var results = new JsonArray();
        for (var i = 0; i < cases.Count; i++)
        {
            var psi = new System.Diagnostics.ProcessStartInfo("dotnet") { UseShellExecute = false, RedirectStandardOutput = true, RedirectStandardError = true };
            psi.ArgumentList.Add(typeof(NoReturnOracle).Assembly.Location);
            psi.ArgumentList.Add("noreturn-one");
            psi.ArgumentList.Add(args[0]);
            psi.ArgumentList.Add(i.ToString(System.Globalization.CultureInfo.InvariantCulture));
            using var p = System.Diagnostics.Process.Start(psi)!;
            var stdout = p.StandardOutput.ReadToEndAsync();
            _ = p.StandardError.ReadToEndAsync();
            // the limit counts from the start of the call, after the child has loaded
            if (!p.WaitForExit(HangMs + 3000))
            {
                p.Kill(true);
                p.WaitForExit();
                results.Add("!hang");
                continue;
            }
            if (p.ExitCode != 0) throw new Exception($"case {i}: exit {p.ExitCode}");
            results.Add(JsonNode.Parse(stdout.Result));
        }
        Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[1]))!);
        File.WriteAllText(args[1], results.ToJsonString(Options));
    }

    static readonly JsonSerializerOptions Options = new() { Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };

    /// <summary>noreturn-one &lt;cases.json&gt; &lt;index&gt;: one case, the result on stdout.</summary>
    public static void RunOne(string[] args)
    {
        var c = JsonNode.Parse(File.ReadAllText(args[0]))!.AsArray()[int.Parse(args[1], System.Globalization.CultureInfo.InvariantCulture)]!.AsObject();
        JsonNode r;
        try { r = new JsonObject { ["ok"] = Eval(c) }; }
        catch (Exception e) { r = new JsonObject { ["err"] = (e is TargetInvocationException { InnerException: { } i } ? i : e).GetType().Name }; }
        Console.Write(r.ToJsonString(Options));
    }

    static JsonNode? Eval(JsonObject c)
    {
        switch (c["fn"]!.GetValue<string>())
        {
            case "split":
            {
                var path = string.Concat(c["parts"]!.AsArray().Select(p => string.Concat(Enumerable.Repeat(p![0]!.GetValue<string>(), p[1]!.GetValue<int>()))));
                var schema = c["schema"]!.GetValue<string>() == "2.15" ? CAEXDocument.CAEXSchema.CAEX2_15 : CAEXDocument.CAEXSchema.CAEX3_0;
                var list = CAEXPathBuilder.PathNameListWithSeparator(path, schema, c["alias"]!.GetValue<bool>());
                return Summary(list);
            }
            case "partial":
            {
                var doc = XDocument.Parse(c["xml"]!.GetValue<string>());
                var node = At(doc.Root!, c["node"]!.AsArray());
                var root = At(doc.Root!, c["root"]!.AsArray());
                var m = typeof(CAEXDocument).Assembly.GetType("Aml.Engine.Xml.Extensions.XmlCAEXAttributes")!
                    .GetMethod("GetPartialNodeCAEXPath", BindingFlags.Static | BindingFlags.Public | BindingFlags.NonPublic)!;
                return (string?)m.Invoke(null, new object?[] { node, root });
            }
            case "copy":
            {
                // ObjectWithAttributes.CopyAttributesFrom(target, source, includingValues) on a loaded document
                var doc = CAEXDocument.LoadFromString(c["xml"]!.GetValue<string>());
                var target = (IObjectWithAttributes)At(doc.XDocument.Root!, c["target"]!.AsArray()).CreateCAEXWrapper();
                var source = (IObjectWithAttributes)At(doc.XDocument.Root!, c["source"]!.AsArray()).CreateCAEXWrapper();
                target.CopyAttributesFrom(source, c["values"]!.GetValue<bool>());
                return new JsonArray(target.Attribute.Select(a => (JsonNode?)(a.Name + "=" + a.Value)).ToArray());
            }
            default:
                throw new ArgumentException("unknown case " + c["fn"]);
        }
    }

    /// <summary>Count, the first and the last five parts.</summary>
    public static JsonNode Summary(List<string> list) => new JsonObject
    {
        ["n"] = list.Count,
        ["head"] = new JsonArray(list.Take(5).Select(x => (JsonNode?)x).ToArray()),
        ["tail"] = new JsonArray(list.Skip(Math.Max(0, list.Count - 5)).Select(x => (JsonNode?)x).ToArray()),
    };

    static XElement At(XElement root, JsonArray path)
    {
        var e = root;
        foreach (var i in path) e = e.Elements().ElementAt(i!.GetValue<int>());
        return e;
    }
}
