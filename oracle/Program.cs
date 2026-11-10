using System.Text;
using System.Text.Json;
using Aml.Engine.CAEX;
using Oracle;

// Reference oracle: runs the original Aml.Engine so the JS engine can be compared against it.
//   dump <outDir> <file.aml>...   writes <name>.json (read model) and <name>.saved.aml (SaveToStream)

// Deterministic formatting: the JS port reproduces .NET under the invariant culture.
System.Globalization.CultureInfo.DefaultThreadCurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
System.Globalization.CultureInfo.DefaultThreadCurrentUICulture = System.Globalization.CultureInfo.InvariantCulture;
System.Globalization.CultureInfo.CurrentCulture = System.Globalization.CultureInfo.InvariantCulture;
System.Globalization.CultureInfo.CurrentUICulture = System.Globalization.CultureInfo.InvariantCulture;
// Another current culture for this process (ORACLE_CULTURE, e.g. de-DE), to show where Aml.Engine
// depends on it (scripts/culture-check.mjs). The UI culture (message texts) stays invariant.
if (Environment.GetEnvironmentVariable("ORACLE_CULTURE") is { Length: > 0 } cultureName)
{
    var culture = System.Globalization.CultureInfo.GetCultureInfo(cultureName);
    System.Globalization.CultureInfo.DefaultThreadCurrentCulture = culture;
    System.Globalization.CultureInfo.CurrentCulture = culture;
}
// Another local time zone for this process (ORACLE_TZ, see LocalTimeZone.cs).
LocalTimeZone.ApplyFromEnvironment();
// Services of Aml.Engine.Services registered for the whole run (ORACLE_SERVICES, see OracleServices.cs).
OracleServices.ApplyFromEnvironment();

var json = new JsonSerializerOptions { WriteIndented = true };

// Directories stand for all files in them (keeps command lines short).
if (args.FirstOrDefault() is not ("xops" or "sys" or "engineops" or "values" or "amlobjects" or "mutations" or "reads" or "gapscaex" or "gapsservices" or "gapsinfra" or "noreturn" or "noreturn-one" or "fixes"))
args = args.Take(2).Concat(args.Skip(2).SelectMany<string, string>(a => Directory.Exists(a)
    ? Directory.GetFiles(a).OrderBy(f => f, StringComparer.Ordinal)
    : new[] { a })).ToArray();

switch (args.FirstOrDefault())
{
    case "dump":
        var outDir = args[1];
        Directory.CreateDirectory(outDir);
        foreach (var file in args.Skip(2))
        {
            var name = System.IO.Path.GetFileNameWithoutExtension(file);
            try
            {
                var text = File.ReadAllText(file, Encoding.UTF8);
                Save(CAEXDocument.LoadFromString(text), System.IO.Path.Combine(outDir, name + ".saved.aml"));
                var doc = CAEXDocument.LoadFromString(text);
                File.WriteAllText(System.IO.Path.Combine(outDir, name + ".json"),
                    Dump.Document(doc).ToJsonString(json));
                Save(doc, System.IO.Path.Combine(outDir, name + ".dumped.aml"));
                Console.WriteLine($"ok   {file}");
            }
            catch (Exception e)
            {
                Console.WriteLine($"FAIL {file}: {e.GetType().Name}: {e.Message}");
            }
        }
        break;

    case "save":
        // save <outDir> <file.aml>...: <name>.saved.aml (LoadFromString, SaveToStream(true)) only
        Directory.CreateDirectory(args[1]);
        foreach (var file in args.Skip(2))
            Save(CAEXDocument.LoadFromString(File.ReadAllText(file, Encoding.UTF8)),
                System.IO.Path.Combine(args[1], System.IO.Path.GetFileNameWithoutExtension(file) + ".saved.aml"));
        break;

    case "probe":
        // For each dump key: fresh load, evaluate only that key, save, compare with a pure load/save.
        var keys = new[] { "__walk__", "name", "id", "path", "findByPath", "findByID", "description", "version",
            "refBaseSystemUnitPath", "systemUnitClass", "isMirror", "masterID", "master",
            "refBaseClassPath", "baseClass", "referencedClassName", "referenceHierarchy",
            "attributeAndInherited", "externalInterfaceAndInherited", "internalElementAndInherited",
            "interfaceClass", "associatedObject", "refBaseRoleClassPath", "roleClass", "refRoleClassPath",
            "refPartnerSideA", "refPartnerSideB", "aInterface", "bInterface", "aSystemUnitClass", "bSystemUnitClass",
            "attributePath", "attributeTypeReference", "value", "defaultValue", "unit", "attributeDataType",
            "refAttributeType", "alias", "originName", "originID", "originVersion", "lastWritingDateTime" };
        foreach (var file in args.Skip(1))
        {
            var text = File.ReadAllText(file, Encoding.UTF8);
            var pure = SaveString(CAEXDocument.LoadFromString(text));
            foreach (var key in keys)
            {
                var doc = CAEXDocument.LoadFromString(text);
                Dump.Only = key;
                Dump.Document(doc);
                if (SaveString(doc) != pure)
                    Console.WriteLine($"{System.IO.Path.GetFileName(file)}	{key}");
            }
        }
        break;

    case "schema":
        // Schema tables of both CAEX versions, as compiled by the engine.
        Directory.CreateDirectory(args[1]);
        File.WriteAllText(Path.Combine(args[1], "caex30.json"),
            SchemaDump.Export(Aml.Engine.Schema.AMLSchemaManager3_0.Instance).ToJsonString(json));
        File.WriteAllText(Path.Combine(args[1], "caex215.json"),
            SchemaDump.Export(Aml.Engine.Schema.AMLSchemaManager2_15.Instance).ToJsonString(json));
        break;

    // Coverage work packages: each command gets the remaining arguments unchanged.
    case "values":
        ValuesOracle.Run(args.Skip(1).ToArray());
        break;
    case "amlobjects":
        AmlObjectsOracle.Run(args.Skip(1).ToArray());
        break;
    case "mutations":
        MutationsOracle.Run(args.Skip(1).ToArray());
        break;
    case "gapscaex":
        GapsCaexOracle.Run(args.Skip(1).ToArray());
        break;
    case "gapsservices":
        GapsServicesOracle.Run(args.Skip(1).ToArray());
        break;
    case "gapsinfra":
        GapsInfraOracle.Run(args.Skip(1).ToArray());
        break;
    case "reads":
        ReadsOracle.Run(args.Skip(1).ToArray());
        break;
    case "noreturn":
        // noreturn <cases.json> <out.json>: calls of the original that may not return, see NoReturnOracle.cs
        NoReturnOracle.Run(args.Skip(1).ToArray());
        break;
    case "noreturn-one":
        NoReturnOracle.RunOne(args.Skip(1).ToArray());
        break;
    case "fixes":
        // fixes <dir> <out.json>: what the original sees in files written with the port's corrections, see FixesOracle.cs
        FixesOracle.Run(args.Skip(1).ToArray());
        break;

    case "tz":
        // tz: the local time zone as the oracle sees it (check of ORACLE_TZ)
        Console.WriteLine($"{TimeZoneInfo.Local.Id}|{DateTime.Now:o}|{new DateTime(2024, 1, 15, 12, 0, 0, DateTimeKind.Utc).ToLocalTime():o}|{new DateTime(2024, 7, 15, 12, 0, 0, DateTimeKind.Utc).ToLocalTime():o}|{new DateTime(1990, 7, 15, 12, 0, 0, DateTimeKind.Utc).ToLocalTime():o}");
        break;

    case "bench":
        // bench <file>...: timings of Aml.Engine, see BenchOracle.cs
        BenchOracle.Run(args.Skip(1));
        break;

    case "validate":
        // validate <outDir> <file.aml|dir>...: CAEXDocument.Validate messages, see ValidateOracle.cs
        ValidateOracle.Run(args[1], args.Skip(2));
        break;

    case "engineops":
        // engineops <scripts.json> <corpusDir> <out.json>
        EngineOpsOracle.Run(args[1], args[2], args[3]);
        break;

    case "sys":
        // System value conversions (DateTime, TimeSpan, decimal, XmlConvert, ...): see SysOracle.cs
        SysOracle.Run(args[1], args[2]);
        break;

    case "xops":
        XOpsOracle.Run(args[1], args[2]);
        break;

    case "xml":
        // Pure System.Xml.Linq behaviour: parse (preserve / ignore whitespace), save, ToString.
        XmlOracle.Run(args[1], args.Skip(2));
        break;

    default:
        Console.Error.WriteLine("usage: dump <outDir> <file.aml>...");
        return 1;
}
return 0;

static string SaveString(CAEXDocument doc)
{
    using var stream = doc.SaveToStream(true);
    stream.Position = 0;
    return new StreamReader(stream).ReadToEnd();
}

static void Save(CAEXDocument doc, string path)
{
    using var stream = doc.SaveToStream(true);
    using var fs = File.Create(path);
    stream.Position = 0;
    stream.CopyTo(fs);
}
