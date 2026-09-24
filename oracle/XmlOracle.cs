using System.Text;
using System.Xml;
using System.Xml.Linq;

namespace Oracle;

/// <summary>Writes the .NET System.Xml.Linq results for each input file, one output per variant.</summary>
public static class XmlOracle
{
    public static void Run(string outDir, IEnumerable<string> files)
    {
        Directory.CreateDirectory(outDir);
        foreach (var file in files)
        {
            var name = Path.GetFileName(file);
            var bytes = File.ReadAllBytes(file);
            Variant(outDir, name, "p", () =>
            {
                var doc = XDocument.Parse(File.ReadAllText(file, Encoding.UTF8), LoadOptions.PreserveWhitespace);
                return Save(doc, SaveOptions.OmitDuplicateNamespaces);
            });
            Variant(outDir, name, "pd", () =>
            {
                var doc = XDocument.Parse(File.ReadAllText(file, Encoding.UTF8), LoadOptions.PreserveWhitespace);
                return Save(doc, SaveOptions.DisableFormatting | SaveOptions.OmitDuplicateNamespaces);
            });
            Variant(outDir, name, "pn", () =>
            {
                var doc = XDocument.Parse(File.ReadAllText(file, Encoding.UTF8), LoadOptions.PreserveWhitespace);
                return Save(doc, SaveOptions.None);
            });
            Variant(outDir, name, "r", () =>
            {
                using var reader = XmlReader.Create(new MemoryStream(bytes),
                    new XmlReaderSettings { IgnoreComments = false, IgnoreWhitespace = true });
                var doc = XDocument.Load(reader, LoadOptions.PreserveWhitespace);
                return Save(doc, SaveOptions.OmitDuplicateNamespaces);
            });
            Variant(outDir, name, "s", () =>
            {
                var doc = XDocument.Parse(File.ReadAllText(file, Encoding.UTF8), LoadOptions.PreserveWhitespace);
                var sb = new StringBuilder();
                sb.Append(doc.Root!.ToString());
                // ToString of the deepest first-child chain element exercises ancestor namespace scopes.
                var e = doc.Root;
                while (e!.Elements().Any()) e = e.Elements().First();
                sb.Append("\n----\n").Append(e.ToString());
                sb.Append("\n----\n").Append(e.Parent?.ToString(SaveOptions.DisableFormatting));
                return new UTF8Encoding(false).GetBytes(sb.ToString());
            });
        }
    }

    static byte[] Save(XDocument doc, SaveOptions options)
    {
        var ms = new MemoryStream();
        doc.Save(ms, options);
        return ms.ToArray();
    }

    static void Variant(string outDir, string name, string variant, Func<byte[]> f)
    {
        byte[] result;
        try { result = f(); }
        catch (Exception e) { result = Encoding.UTF8.GetBytes("!ERROR " + e.GetType().Name); }
        File.WriteAllBytes(Path.Combine(outDir, $"{name}.{variant}"), result);
    }
}
