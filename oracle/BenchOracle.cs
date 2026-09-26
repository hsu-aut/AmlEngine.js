using System.Diagnostics;
using System.Text;
using System.Text.Json.Nodes;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;

namespace Oracle;

/// <summary>
/// Timings of Aml.Engine for docs/performance.md; test/perf/bench.ts runs the same steps with the port.
///   bench &lt;file&gt;...   one JSON line per file
/// Steps: load (LoadFromString), walk (every InternalElement: Name, ID, SystemUnitClass, attribute
/// values, number of ExternalInterfaces; walkSum must be the same in the port), find (FindByID for
/// up to 200 IDs spread over the document), save (SaveToStream(true)), validate (Validate),
/// loadIndexed (LoadFromString with createIndices: the ID and path tables of the query service) and
/// findIndexed (FindByID for every InternalElement of that document).
/// heapMB: GC.GetTotalMemory(true) after loading minus before.
/// </summary>
public static class BenchOracle
{
    public static void Run(IEnumerable<string> files)
    {
        foreach (var file in files)
        {
            var text = File.ReadAllText(file, Encoding.UTF8);
            var r = new JsonObject { ["file"] = Path.GetFileName(file), ["chars"] = text.Length };
            long before = GC.GetTotalMemory(true);
            var sw = Stopwatch.StartNew();
            var doc = CAEXDocument.LoadFromString(text);
            r["load"] = Ms(sw);
            r["heapMB"] = Math.Round((GC.GetTotalMemory(true) - before) / 1048576.0, 1);

            sw.Restart();
            var ies = doc.CAEXFile.Descendants<InternalElementType>().ToList();
            long n = 0, attrs = 0, chars = 0, suc = 0, ifs = 0;
            foreach (var ie in ies)
            {
                n++;
                chars += (ie.Name?.Length ?? 0) + (ie.ID?.Length ?? 0);
                if (ie.SystemUnitClass != null) suc++;
                foreach (var a in ie.Attribute)
                {
                    attrs++;
                    chars += a.Value?.Length ?? 0;
                }
                ifs += ie.ExternalInterface.Count;
            }
            r["walk"] = Ms(sw);
            r["walkSum"] = $"{n}|{attrs}|{chars}|{suc}|{ifs}";

            sw.Restart();
            int step = Math.Max(1, ies.Count / 200), found = 0;
            for (int i = 0; i < ies.Count; i += step)
                if (doc.FindByID(ies[i].ID) != null) found++;
            r["find"] = Ms(sw);
            r["found"] = found;

            sw.Restart();
            using (var s = doc.SaveToStream(true)) r["savedBytes"] = s.Length;
            r["save"] = Ms(sw);

            sw.Restart();
            var ok = doc.Validate(out var log);
            r["validate"] = Ms(sw);
            r["valid"] = $"{ok}|{log.Count()}";

            sw.Restart();
            var idoc = CAEXDocument.LoadFromString(text, createIndices: true);
            r["loadIndexed"] = Ms(sw);
            var ids = idoc.CAEXFile.Descendants<InternalElementType>().Select(ie => ie.ID).ToList();
            sw.Restart();
            int ifound = 0;
            foreach (var id in ids)
                if (idoc.FindByID(id) != null) ifound++;
            r["findIndexed"] = Ms(sw);
            r["foundIndexed"] = ifound;
            Console.WriteLine(r.ToJsonString());
        }
    }

    static double Ms(Stopwatch sw) => Math.Round(sw.Elapsed.TotalMilliseconds, 1);
}
