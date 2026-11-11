using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Aml.Engine.AmlObjects;
using Aml.Engine.CAEX;
using Aml.Engine.Resources.AMLStandard;
using Aml.Engine.Resources.Catalogue;
using Aml.Engine.Resources.Files;
using Aml.Engine.Services;
using Aml.Engine.Services.AMLTransformer;
using Aml.Engine.Services.Interfaces;
using Aml.Engine.Services.Model;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// svc-transform &lt;corpusDir&gt; &lt;casesDir&gt; &lt;outDir&gt;: CAEXSchemaTransformer, the engine side of
/// schema transformations (CAEXDocument.TransformToSchema, FinalizeSchemaTransformation, the
/// transformation events, the import of objects of the other schema) and AMLEditionTransformer
/// with a fixed IAMLLibraryService test double. The cases come from scripts/gen-services-transform.mjs;
/// test/services/transform.oracle.test.ts runs them with the port. Keep both in sync.
///
/// Each case is a list of "key=value" strings. Documents are recorded as the SHA-256 prefix of
/// their canonical saved text (texts/&lt;hash&gt;.aml holds the text). Canonical: GUIDs are numbered
/// by order of appearance (G1, G2, ...) unless a case registers the counting ID service, and
/// timestamps within a day of the run ("now", written when a required SourceDocumentInformation is
/// created) become NOW. LastWritingDateTime values are converted with the local time zone by the
/// original (DateTime.TryParse, XmlConvert.ToString(..., Local)): compare in the same zone.
/// </summary>
public static class ServicesTransformOracle
{
    static string corpusDir = "", casesDir = "", textsDir = "";

    public static void Run(string[] args)
    {
        corpusDir = args[0];
        casesDir = args[1];
        var outDir = args[2];
        textsDir = Path.Combine(outDir, "texts");
        Directory.CreateDirectory(textsDir);
        var cases = JsonNode.Parse(File.ReadAllText(Path.Combine(casesDir, "cases.json")))!.AsObject();
        var services = cases["services"]!.AsObject();

        var schema = new JsonArray();
        foreach (var c in cases["schema"]!.AsArray())
            foreach (var mode in c!["modes"]!.AsArray())
                schema.Add(Case(c["doc"]!.GetValue<string>() + "|" + mode, mode!.GetValue<string>() == "ids",
                    r => SchemaCase(r, c["doc"]!.GetValue<string>(), mode!.GetValue<string>())));
        Write(outDir, "schema.json", schema);

        var engine = new JsonArray();
        foreach (var c in cases["engine"]!.AsArray())
            foreach (var mode in c!["modes"]!.AsArray())
                engine.Add(Case(c["doc"]!.GetValue<string>() + "|" + mode, false,
                    r => EngineCase(r, c["doc"]!.GetValue<string>(), mode!.GetValue<string>())));
        Write(outDir, "engine.json", engine);

        var imports = new JsonArray();
        foreach (var c in cases["imports"]!.AsArray())
            imports.Add(Case(c!["from"]!.GetValue<string>() + ">" + c["into"]!.GetValue<string>(), false,
                r => ImportCase(r, c["from"]!.GetValue<string>(), c["into"]!.GetValue<string>())));
        Write(outDir, "imports.json", imports);

        var edition = new JsonArray();
        int n = 0;
        foreach (var c in cases["edition"]!.AsArray())
        {
            var steps = c!["steps"]!.AsArray();
            edition.Add(Case("edition " + n++, steps[0]!["ids"]!.GetValue<bool>(), r => EditionScenario(r, steps, services)));
        }
        Write(outDir, "edition.json", edition);

        var misc = Case("misc", false, r => MiscCase(r, cases["isError"]!.AsArray()));
        Write(outDir, "misc.json", new JsonArray(misc));
    }

    static void Write(string outDir, string name, JsonArray a) =>
        File.WriteAllText(Path.Combine(outDir, name), a.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));

    static JsonObject Case(string id, bool keepGuids, Action<Rec> run)
    {
        var r = new Rec(keepGuids);
        try { run(r); }
        catch (Exception e) { r.Items.Add("!!harness=" + Name(e) + ": " + e.Message); }
        var items = new JsonArray();
        foreach (var i in r.Items) items.Add(i);
        return new JsonObject { ["id"] = id, ["items"] = items };
    }

    // ---- recording -------------------------------------------------------------------------------

    sealed class Rec
    {
        public readonly List<string> Items = new();
        readonly Canon c;
        public Rec(bool keepGuids) { c = new Canon(keepGuids); }

        public void V(string key, Func<object?> f)
        {
            string v;
            try { v = F(f()); }
            catch (Exception e) { v = "!" + Name(e); }
            Items.Add(key + "=" + c.Apply(v));
        }

        public void Ev(string text) => Items.Add("ev=" + c.Apply(text));

        public void Doc(string key, CAEXDocument? d)
        {
            if (d == null) { Items.Add(key + "=null"); return; }
            string text;
            try { text = c.Apply(EngineOpsOracle.Save(d)); }
            catch (Exception e) { Items.Add(key + "=!" + Name(e)); return; }
            var h = EngineOpsOracle.Hash(text);
            var file = Path.Combine(textsDir, h + ".aml");
            if (!File.Exists(file)) File.WriteAllText(file, text);
            Items.Add(key + "=#" + h);
        }
    }

    /// <summary>EngineOpsOracle.Canonicalizer with GUIDs kept on request (counting ID service).</summary>
    sealed class Canon
    {
        static readonly Regex Guid = new(@"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}", RegexOptions.Compiled);
        static readonly Regex Us = new(@"(\d{2})/(\d{2})/(\d{4}) \d{2}:\d{2}:\d{2}", RegexOptions.Compiled);
        static readonly Regex Iso = new(@"(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}:\d{2}|Z)?", RegexOptions.Compiled);
        readonly Dictionary<string, string> map = new(StringComparer.OrdinalIgnoreCase);
        readonly bool keepGuids;
        public Canon(bool keepGuids) { this.keepGuids = keepGuids; }

        static bool Recent(int y, int mo, int d)
        {
            try { return Math.Abs((new DateTime(y, mo, d) - DateTime.Today).TotalDays) <= 1; }
            catch { return false; }
        }

        public string Apply(string text)
        {
            text = Us.Replace(text, m => Recent(int.Parse(m.Groups[3].Value), int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value)) ? "NOW" : m.Value);
            text = Iso.Replace(text, m => Recent(int.Parse(m.Groups[1].Value), int.Parse(m.Groups[2].Value), int.Parse(m.Groups[3].Value)) ? "NOW" : m.Value);
            if (keepGuids) return text;
            return Guid.Replace(text, m =>
            {
                if (!map.TryGetValue(m.Value, out var id))
                {
                    id = "G" + (map.Count + 1);
                    map[m.Value] = id;
                }
                return id;
            });
        }
    }

    static string F(object? v) => v switch
    {
        null => "null",
        bool b => B(b),
        _ => v.ToString() ?? "null",
    };

    static string B(bool b) => b ? "true" : "false";

    static string Name(Exception e) => e is TargetInvocationException { InnerException: { } inner } ? inner.GetType().Name : e.GetType().Name;

    static string SchemaName(CAEXDocument.CAEXSchema s) => s switch
    {
        CAEXDocument.CAEXSchema.CAEX2_15 => "2.15",
        CAEXDocument.CAEXSchema.CAEX3_0 => "3.0",
        _ => ((int)s).ToString(),
    };

    static string Kind(CAEXDocument? result, CAEXDocument? source) =>
        result == null ? "null" : ReferenceEquals(result, source) ? "same" : "new:" + SchemaName(result.Schema);

    static CAEXDocument Load(string docRef)
    {
        var path = docRef.StartsWith("corpus:")
            ? Path.Combine(corpusDir, docRef.Substring(7))
            : Path.Combine(casesDir, "docs", docRef.Substring(4));
        return CAEXDocument.LoadFromString(File.ReadAllText(path, Encoding.UTF8));
    }

    static CAEXDocument.CAEXSchema Other(CAEXDocument.CAEXSchema s) =>
        s == CAEXDocument.CAEXSchema.CAEX2_15 ? CAEXDocument.CAEXSchema.CAEX3_0 : CAEXDocument.CAEXSchema.CAEX2_15;

    // Internal members of the engine, called by the transformation service in the original.
    static readonly MethodInfo TransformToSchemaMethod = typeof(CAEXDocument).GetMethod("TransformToSchema",
        BindingFlags.Instance | BindingFlags.NonPublic, new[] { typeof(CAEXDocument.CAEXSchema) })!;
    static readonly MethodInfo FinalizeMethod = typeof(CAEXDocument).GetMethod("FinalizeSchemaTransformation",
        BindingFlags.Instance | BindingFlags.NonPublic, Type.EmptyTypes)!;
    static readonly PropertyInfo ActiveProperty = typeof(CAEXDocument).GetProperty("IsTransformationActive",
        BindingFlags.Instance | BindingFlags.NonPublic)!;

    static CAEXDocument TransformToSchema(CAEXDocument doc, CAEXDocument.CAEXSchema s) =>
        (CAEXDocument)TransformToSchemaMethod.Invoke(doc, new object[] { s })!;

    static bool Active(CAEXDocument doc) => (bool)ActiveProperty.GetValue(doc)!;

    /// <summary>Counting ID service: the IDs show the order and the overload of every request.</summary>
    sealed class CountingIds : ICaexIDService
    {
        int n;
        public string GenerateNewID(CAEXObject caexObject) => "obj-" + ++n;
        public string GenerateNewID(XElement caexElement) => "el-" + ++n;
        public string GenerateNewID() => "id-" + ++n;
    }

    static string AutoUpdate()
    {
        var a = ServiceLocator.AutoUpdateService;
        return a == null ? "none" : B(a.IsAutoUpdateEnabled);
    }

    static void EnableAutoUpdate()
    {
        var a = ServiceLocator.AutoUpdateService;
        if (a != null) a.IsAutoUpdateEnabled = true;
    }

    // ---- CAEXSchemaTransformer -------------------------------------------------------------------

    static void SchemaCase(Rec r, string docRef, string mode)
    {
        var doc = Load(docRef);
        var own = doc.Schema;
        var other = Other(own);
        UndoRedoService? undo = null;
        if (mode == "ids") ServiceLocator.Register<ICaexIDService>(new CountingIds());
        if (mode == "undo") undo = UndoRedoService.Register();
        if (mode == "lookup") LookupService.Register();
        var t = CAEXSchemaTransformer.Register();
        if (mode == "unregistered") CAEXSchemaTransformer.UnRegister();
        CAEXDocument? current = doc;
        if (mode == "events")
        {
            t.TransformationStarted += (s, e) => r.Ev("started|" + B(s == t) + "|" + SchemaName(e.TargetSchema) + "|" + B(e.SourceDocument == current) + "|" +
                (e.TargetDocument == null ? "null" : SchemaName(e.TargetDocument.Schema) + "|" + B(Active(e.TargetDocument))));
            t.TransformationEnded += (s, e) => r.Ev("ended|" + B(s == t) + "|" + SchemaName(e.TargetSchema) + "|" + B(e.SourceDocument == current) + "|" +
                (e.TargetDocument == null ? "null" : B(Active(e.TargetDocument))));
        }
        if (mode == "nulltarget")
            t.TransformationStarted += (s, e) => { r.Ev("nulled|" + B(e.TargetDocument != null)); e.TargetDocument = null; };
        try
        {
            if (mode == "lookup") r.V("autoUpdateInitial", AutoUpdate);
            r.Doc("src", doc);
            CAEXDocument? res = null;
            r.V("toOther", () => { res = t.TransformTo(doc, other); return Kind(res, doc); });
            r.Doc("result", res);
            r.Doc("srcAfter", doc);
            if (mode == "lookup") { r.V("autoUpdate", AutoUpdate); EnableAutoUpdate(); }
            if (undo != null)
            {
                r.V("undoState", () => B(undo.CanUndo(doc)) + "|" + B(undo.CanRedo(doc)) + (res == null ? "" : "|" + B(undo.CanUndo(res)) + "|" + B(undo.CanRedo(res))));
                if (res != null)
                {
                    r.V("undoProbe", () => { res.CAEXFile.InstanceHierarchy.Append("UndoProbe"); return B(undo.CanUndo(res)) + "|" + string.Join(",", undo.UndoActions(res)); });
                    r.V("undoUndo", () => { undo.Undo(res); return B(undo.CanUndo(res)) + "|" + B(undo.CanRedo(res)); });
                    r.Doc("afterUndo", res);
                }
            }
            if (res != null && !ReferenceEquals(res, doc))
            {
                current = res;
                CAEXDocument? back = null;
                r.V("back", () => { back = t.TransformTo(res, own); return Kind(back, res); });
                r.Doc("backDoc", back);
                r.Doc("resultAfterBack", res);
                if (mode == "lookup") { r.V("autoUpdateBack", AutoUpdate); EnableAutoUpdate(); }
                current = doc;
            }
            r.V("own", () => Kind(t.TransformTo(doc, own), doc));
            r.V("unknown", () => Kind(t.TransformTo(doc, CAEXDocument.CAEXSchema.Unknown), doc));
            if (mode == "lookup") { r.V("autoUpdateUnknown", AutoUpdate); EnableAutoUpdate(); }
            r.V("null", () => Kind(t.TransformTo(null!, other), null));
        }
        finally
        {
            CAEXSchemaTransformer.UnRegister();
            if (mode == "lookup") LookupService.UnRegister();
            if (mode == "undo") UndoRedoService.UnRegister();
            if (mode == "ids") ServiceLocator.UnRegister<ICaexIDService>();
        }
    }

    // ---- engine: TransformToSchema and FinalizeSchemaTransformation ------------------------------

    static void EngineCase(Rec r, string docRef, string mode)
    {
        var doc = Load(docRef);
        var own = doc.Schema;
        UndoRedoService? undo = mode == "undo" ? UndoRedoService.Register() : null;
        if (mode == "transformer") CAEXSchemaTransformer.Register();
        try
        {
            r.Doc("src", doc);
            CAEXDocument? t = null;
            r.V("toOther", () => { t = TransformToSchema(doc, Other(own)); return Kind(t, doc); });
            r.V("active", () => t == null ? "null" : B(Active(t)));
            r.Doc("prepared", t);
            r.Doc("srcAfter", doc);
            if (undo != null && t != null) r.V("undoState", () => B(undo.CanUndo(t)) + "|" + B(undo.CanRedo(t)));
            if (t != null)
            {
                r.V("finalize", () => { FinalizeMethod.Invoke(t, null); return B(Active(t)); });
                r.Doc("final", t);
            }
            r.V("own", () => Kind(TransformToSchema(doc, own), doc));
            r.V("unknown", () => Kind(TransformToSchema(doc, CAEXDocument.CAEXSchema.Unknown), doc));
            r.V("bad", () => Kind(TransformToSchema(doc, (CAEXDocument.CAEXSchema)99), doc));
        }
        finally
        {
            if (mode == "transformer") CAEXSchemaTransformer.UnRegister();
            if (mode == "undo") UndoRedoService.UnRegister();
        }
    }

    // ---- engine: import of objects of the other schema (CAEXSequence.Insert of a copy) -----------

    static string Describe(CAEXWrapper? w) => w == null ? "null" : w.Node.Name.ToString() + "|" + (w is CAEXObject o ? o.Name : "");

    static void ImportCase(Rec r, string fromRef, string intoRef)
    {
        var from = Load(fromRef);
        var into = Load(intoRef);
        r.Doc("into", into);
        var file = into.CAEXFile;
        int k = 0;
        foreach (var lib in from.CAEXFile.Node.Elements().Select(e => e.CreateCAEXWrapper()).OfType<CAEXObject>().ToList())
        {
            var key = "top" + k++ + ":" + lib.Node.Name.LocalName;
            r.V(key, () =>
            {
                var copy = lib.Copy();
                return Describe(copy switch
                {
                    InstanceHierarchyType ih => file.InstanceHierarchy.Insert(ih),
                    InterfaceClassLibType icl => file.InterfaceClassLib.Insert(icl),
                    RoleClassLibType rcl => file.RoleClassLib.Insert(rcl),
                    SystemUnitClassLibType sucl => file.SystemUnitClassLib.Insert(sucl),
                    AttributeTypeLibType atl => file.AttributeTypeLib.Insert(atl),
                    _ => null,
                });
            });
            r.Doc(key + ":doc", into);
        }
        var ie = from.CAEXFile.InstanceHierarchy.SelectMany(ih => ih.InternalElement).FirstOrDefault();
        var targetIH = file.InstanceHierarchy.LastOrDefault();
        if (ie != null && targetIH != null)
        {
            r.V("ie", () => Describe(targetIH.InternalElement.Insert((InternalElementType)ie.Copy(), false)));
            r.Doc("ie:doc", into);
            var ei = ie.ExternalInterface.FirstOrDefault();
            var targetIE = targetIH.InternalElement.FirstOrDefault();
            if (ei != null && targetIE != null)
            {
                r.V("ei", () => Describe(targetIE.ExternalInterface.Insert((ExternalInterfaceType)ei.Copy(), false)));
                r.Doc("ei:doc", into);
            }
        }
        var suc = from.CAEXFile.SystemUnitClassLib.SelectMany(l => l.SystemUnitClass).FirstOrDefault();
        var targetLib = file.SystemUnitClassLib.LastOrDefault();
        if (suc != null && targetLib != null)
        {
            r.V("suc", () => Describe(targetLib.SystemUnitClass.Insert((SystemUnitFamilyType)suc.Copy(), false)));
            r.Doc("suc:doc", into);
        }
    }

    // ---- AMLEditionTransformer -------------------------------------------------------------------

    /// <summary>The IAMLLibraryService test double; the port has the same one in the test.</summary>
    sealed class LibService : IAMLLibraryService
    {
        readonly JsonObject cfg;
        readonly Rec r;

        public LibService(JsonObject cfg, Rec r)
        {
            this.cfg = cfg;
            this.r = r;
            if (cfg["profile"] is JsonValue p && !p.GetValue<bool>()) return;
            ServerProfile = new AMLLibraryServerProfile();
            int k = 0;
            foreach (var ct in cfg["admin"]!.AsArray())
                ServerProfile.AdministrationData.Add(new AMLLibraryServerDataProfile((AMLFileContentType)ct!.GetValue<int>()) { Folder = "F" + k++ });
        }

        public AMLLibraryServerProfile ServerProfile { get; } = null!;

        public Task<PublicLibraryCatalog> LoadLibraryCatalogAsync(AMLLibraryServerDataProfile data)
        {
            r.Ev("loadCatalog|" + (int)data.ContentType + "|" + data.Folder);
            switch (cfg["catalogMode"]?.GetValue<string>())
            {
                case "throw": throw new InvalidOperationException("catalog");
                case "fault": return Task.FromException<PublicLibraryCatalog>(new InvalidOperationException("catalog"));
            }
            var name = cfg["catalog"]?.GetValue<string>();
            PublicLibraryCatalog? catalog = name switch
            {
                null => null,
                "embedded" => JsonSerializer.Deserialize<PublicLibraryCatalog>(
                    typeof(AMLLibraries).Assembly.GetManifestResourceStream("Aml.Engine.Resources.Resources.AutomationMLLibs.json")!),
                _ => JsonSerializer.Deserialize<PublicLibraryCatalog>(File.ReadAllText(Path.Combine(casesDir, "catalogs", name + ".json"))),
            };
            return Task.FromResult(catalog!);
        }

        public Task<IClassRepository> LoadClassRepositoryAsync(AMLLibraryServerDataProfile data, ClassRepositoryEnum repositoryType)
        {
            r.Ev("loadRepository|" + (int)data.ContentType + "|" + data.Folder + "|" + (int)repositoryType);
            if (cfg["repositoryMode"]?.GetValue<string>() == "fault")
                return Task.FromException<IClassRepository>(new InvalidOperationException("repository"));
            var name = cfg["repository"]?.GetValue<string>();
            if (name == null) return Task.FromResult<IClassRepository>(null!);
            var items = JsonNode.Parse(File.ReadAllText(Path.Combine(casesDir, "repositories", name + ".json")))!.AsArray()
                .Select(i =>
                {
                    var a = i!["item"]!.AsArray().Select(x => x?.GetValue<string>()).ToArray();
                    return (i["match"]!.GetValue<string>(), new ClassRepositoryItem(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!, a[6]!));
                }).ToList();
            return Task.FromResult<IClassRepository>(new Repository(items, r));
        }

        public string ResponseMessage => throw new NotImplementedException();
        public Task<bool> RegisterServerProfileAsync(AMLLibraryServerProfile server) => throw new NotImplementedException();
        public Task<IAMLFile> LoadAMLFileAsync(AMLFileMetaModel fileModel) => throw new NotImplementedException();
        public Task<List<AMLFileMetaModel>> GetDocumentsAsync(AMLLibraryServerDataProfile data) => throw new NotImplementedException();
        public Task<(bool Success, string Description)> UploadAMLDocumentAsync(AMLLibraryServerDataProfile data, CAEXDocument amlDocument, bool replace) => throw new NotImplementedException();
        public Task<Stream> GetStreamAsync(AMLLibraryServerDataProfile data, string filename) => throw new NotImplementedException();
        public Task<Stream> GetStreamAsync(string url) => throw new NotImplementedException();
        public Task<(bool IsSuccessful, string Description)> DeleteAsync(AMLLibraryServerDataProfile data, string fileName, bool backup) => throw new NotImplementedException();
        public Task<(bool IsSuccessful, string Description)> RestoreAsync(AMLLibraryServerDataProfile data, string fileName) => throw new NotImplementedException();
        public Task<(bool IsSuccessful, string Description)> PutStreamAsync(AMLLibraryServerDataProfile data, string fileName, Stream fileStream, bool exchange = false) => throw new NotImplementedException();
        public Task<(bool Success, string Description)> CheckDataConnection(AMLLibraryServerDataProfile data) => throw new NotImplementedException();
        public string FileUri(AMLLibraryServerDataProfile data, string fileName) => throw new NotImplementedException();
        public Task<bool> FileExistsAsync(string filePath) => throw new NotImplementedException();
    }

    /// <summary>Class repository double: SearchSimilar returns the items whose match is "*" or the class name.</summary>
    sealed class Repository : IClassRepository
    {
        readonly List<(string Match, ClassRepositoryItem Item)> items;
        readonly Rec r;
        StringComparisonAlgorithmEnum algorithm;

        public Repository(List<(string, ClassRepositoryItem)> items, Rec r)
        {
            this.items = items;
            this.r = r;
        }

        public ClassRepositoryEnum RepositoryType => ClassRepositoryEnum.AttributeTypeRepository;
        public string FileName => "repository";

        public StringComparisonAlgorithmEnum StringComparisonAlgorithm
        {
            get => algorithm;
            set { r.Ev("algorithm|" + (int)value); algorithm = value; }
        }

        public bool AddClasses(CAEXObject caexObject) => throw new NotImplementedException();

        public List<ClassRepositoryItem> SearchSimilar(string className, int maxCost)
        {
            r.Ev("search|" + className + "|" + maxCost);
            return items.Where(i => i.Match == "*" || i.Match == className).Select(i => i.Item).ToList();
        }
    }

    static void EditionScenario(Rec r, JsonArray steps, JsonObject services)
    {
        var tr = AMLEditionTransformer.Register();
        r.V("registered", () => B(ServiceLocator.GetService<IAMLEditionTransform>() == tr));
        try
        {
            int i = 0;
            foreach (var st in steps)
            {
                var p = "s" + i++ + ".";
                var preRegistered = st!["preRegistered"]?.GetValue<bool>() == true;
                var ids = st["ids"]!.GetValue<bool>();
                var pre = preRegistered ? CAEXSchemaTransformer.Register() : null;
                if (ids) ServiceLocator.Register<ICaexIDService>(new CountingIds());
                try
                {
                    var svc = new LibService(services[st["service"]!.GetValue<string>()]!.AsObject(), r);
                    var doc = Load(st["doc"]!.GetValue<string>());
                    r.Doc(p + "src", doc);
                    Action<IAMLEditionTransform, string>? logger = st["logger"]!.GetValue<bool>()
                        ? (t, m) => r.Ev("log|" + B(t == tr) + "|" + m + "|" + B(tr.IsError(m)))
                        : null;
                    CAEXDocument? res = null;
                    r.V(p + "transform", () => { res = tr.TransformToEdition(svc, doc, (AMLEditionEnum)st["edition"]!.GetValue<int>(), logger!); return Kind(res, doc); });
                    r.Doc(p + "result", res);
                    r.Doc(p + "srcAfter", doc);
                    r.V(p + "schemaTransform", () =>
                    {
                        var s = ServiceLocator.GetService<ISchemaTransform>();
                        return s == null ? "none" : ReferenceEquals(s, pre) ? "pre" : "other";
                    });
                }
                finally
                {
                    CAEXSchemaTransformer.UnRegister();
                    if (ids) ServiceLocator.UnRegister<ICaexIDService>();
                }
            }
        }
        finally
        {
            AMLEditionTransformer.UnRegister();
        }
        r.V("unregistered", () => B(ServiceLocator.GetService<IAMLEditionTransform>() == null));
    }

    static void MiscCase(Rec r, JsonArray isError)
    {
        var tr = AMLEditionTransformer.Register();
        AMLEditionTransformer.UnRegister();
        int i = 0;
        foreach (var s in isError)
        {
            var text = s?.GetValue<string>();
            r.V("isError" + i++, () => tr.IsError(text!));
        }
        // DateTime.MinValue in local time, as the upgrader writes an unparsable LastWritingDateTime:
        // the offset of year 1 comes from the time zone rules of the system (see the test).
        r.V("minValueLocal", () => System.Xml.XmlConvert.ToString(DateTime.MinValue, System.Xml.XmlDateTimeSerializationMode.Local));
        // Registration of the schema transformer: the service is found as ISchemaTransform only.
        var t = CAEXSchemaTransformer.Register();
        r.V("schemaRegistered", () => B(ServiceLocator.GetService<ISchemaTransform>() == t));
        CAEXSchemaTransformer.UnRegister();
        r.V("schemaUnregistered", () => B(ServiceLocator.GetService<ISchemaTransform>() == null));
        r.V("unregisterTwice", () => { CAEXSchemaTransformer.UnRegister(); return "ok"; });
        // A document with the schema Unknown (no CAEXFile can be created for it).
        var u = CAEXDocument.New_CAEXDocument(CAEXDocument.CAEXSchema.Unknown);
        r.V("newUnknown", () => Kind(u, null));
        r.Doc("unknownDoc", u);
        var t2 = CAEXSchemaTransformer.Register();
        try
        {
            r.V("unknownTo2.15", () => Kind(t2.TransformTo(u, CAEXDocument.CAEXSchema.CAEX2_15), u));
            r.V("unknownTo3.0", () => Kind(t2.TransformTo(u, CAEXDocument.CAEXSchema.CAEX3_0), u));
            r.V("unknownToUnknown", () => Kind(t2.TransformTo(u, CAEXDocument.CAEXSchema.Unknown), u));
            CAEXDocument? p = null;
            r.V("unknownToSchema", () => { p = TransformToSchema(u, CAEXDocument.CAEXSchema.CAEX2_15); return Kind(p, u); });
            r.Doc("unknownPrepared", p);
        }
        finally { CAEXSchemaTransformer.UnRegister(); }
    }
}
