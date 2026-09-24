using System.Security.Cryptography;
using System.Text;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Aml.Engine.CAEX;

namespace Oracle;

/// <summary>
/// Records CAEXDocument.Validate results. For every file: CAEXDocument.LoadFromString(File.ReadAllText(file, UTF8)),
/// doc.Validate(out log), written to &lt;outDir&gt;/&lt;file name&gt;.json as
/// {"schema": "CAEX3_0"|"CAEX2_15", "saved": sha256 hex of XDocument.Save(stream) (the text the validator reads),
///  "result": bool, "messages": [...]}; {"load": null} when LoadFromString returns null;
/// "exception": type name when validating throws.
/// </summary>
public static class ValidateOracle
{
    public static void Run(string outDir, IEnumerable<string> files)
    {
        Directory.CreateDirectory(outDir);
        var opts = new JsonSerializerOptions { WriteIndented = true, Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping };
        foreach (var file in files)
        {
            var r = new JsonObject();
            try
            {
                var doc = CAEXDocument.LoadFromString(File.ReadAllText(file, Encoding.UTF8));
                if (doc == null)
                {
                    r["load"] = null;
                }
                else
                {
                    r["schema"] = doc.Schema.ToString();
                    using (var ms = new MemoryStream())
                    {
                        doc.XDocument.Save(ms);
                        r["saved"] = Convert.ToHexString(SHA256.HashData(ms.ToArray())).ToLowerInvariant();
                    }
                    try
                    {
                        var ok = doc.Validate(out var log);
                        r["result"] = ok;
                        r["messages"] = new JsonArray(log.Select(m => (JsonNode?)JsonValue.Create(m)).ToArray());
                    }
                    catch (Exception e)
                    {
                        r["exception"] = e.GetType().Name;
                        r["exceptionMessage"] = e.Message;
                    }
                }
            }
            catch (Exception e)
            {
                r["exception"] = e.GetType().Name;
                r["exceptionMessage"] = e.Message;
            }
            File.WriteAllText(Path.Combine(outDir, Path.GetFileName(file) + ".json"), r.ToJsonString(opts));
        }
    }
}
