using System.Diagnostics;
using System.Reflection;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Xml;
using System.Xml.Linq;
using Aml.Engine.AmlObjects;
using Aml.Engine.CAEX;
using Aml.Engine.CAEX.Extensions;
using Aml.Engine.Services;
using Aml.Engine.Services.Interfaces;
using Aml.Engine.Xml.Extensions;

namespace Oracle;

/// <summary>
/// svc-validator &lt;casesDir&gt; &lt;outDir&gt;: ValidatorService results and repairs
/// (scripts/gen-services-validator.mjs, test/services/validator.oracle.test.ts; keep in sync).
///
/// For every document of cases.json (generated broken documents and the corpus): every public
/// validation call (both ValidateAll overloads, the container overload with a container built from
/// the case and with null, ValidateAllWithoutStrictID, ValidateAliasReferences), with and without
/// long descriptions, with and without LookupService; per result the element, the validation key,
/// type, repair options, texts and repair description; a second enumeration; the document after the
/// enumeration; the ID and path tables of the query service; every ValidationResults filter;
/// ReValidate; Equals; IDValidation and NameValidation on a sample of objects; Repair of every
/// repairable result in order without and with UniqueNameService (return value, repair text,
/// ReValidate, the saved document, the remaining issues). Sweeps: CanLocateFile, NormalizeFilePath,
/// FilePathFromValue for many file references, XmlConvert.VerifyXmlChars, RepairTypeDescription,
/// ValidationKey, the ValidationElement API and every repair method on chosen targets.
///
/// Deterministic output: absolute paths of the working directory become &lt;root&gt;; GUIDs and
/// timestamps of "now" written by repairs are canonicalized (EngineOpsOracle.Canonicalizer); the
/// HTTP client of ExternalReferenceResolver is replaced by one that fails every request, so http(s)
/// references take the "request failed" path the port always takes (docs/deviations.md).
/// The original keeps its CAEXDocuments in a table of weak references (XDocumentWrapper): an object
/// whose document wrapper was collected sees no document. Every document stays referenced while its
/// objects are used (GC.KeepAlive), otherwise the results would depend on the garbage collector.
/// Strings are written with surrogates escaped as \uXXXX (lone surrogates cannot be written as JSON).
/// </summary>
public static class ServicesValidatorOracle
{
    static string _casesDir = "";
    static string _rootDir = "";
    static Regex? _rootRegex;

    sealed class FailingHandler : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken) =>
            throw new HttpRequestException("network disabled in the oracle");
    }

    public static void Run(string[] args)
    {
        _casesDir = Path.GetFullPath(args[0]);
        var outDir = args[1];
        Directory.CreateDirectory(outDir);
        var docsDir = Path.Combine(outDir, "validator-docs");
        if (Directory.Exists(docsDir)) Directory.Delete(docsDir, true);
        Directory.CreateDirectory(docsDir);
        _rootDir = Directory.GetCurrentDirectory().TrimEnd('\\', '/');
        var variants = new[] { _rootDir, _rootDir.Replace('\\', '/') }.Distinct().Select(Regex.Escape);
        _rootRegex = new Regex(string.Join("|", variants), RegexOptions.IgnoreCase);
        typeof(ExternalReferenceResolver).GetField("_webClient", BindingFlags.NonPublic | BindingFlags.Static)!
            .SetValue(null, new HttpClient(new FailingHandler()));

        var cases = JsonNode.Parse(File.ReadAllText(Path.Combine(_casesDir, "cases.json")))!.AsObject();
        var validator = ValidatorService.Register();
        var result = new JsonObject();
        var sw = Stopwatch.StartNew();

        var docs = new JsonObject();
        foreach (var c in cases["docs"]!.AsArray())
        {
            var file = c!["file"]!.GetValue<string>();
            var t0 = sw.ElapsedMilliseconds;
            docs[file] = RunDoc(validator, c.AsObject(), docsDir);
            Console.WriteLine($"{file}: {sw.ElapsedMilliseconds - t0} ms");
        }
        result["docs"] = docs;
        result["fileRefs"] = FileRefSweep(cases);
        result["xmlChars"] = XmlCharsSweep(cases);
        result["repairValues"] = new JsonArray(cases["repairValues"]!.AsArray().Select(v => (JsonNode?)J(((RepairTypeEnum)v!.GetValue<int>()).RepairTypeDescription())).ToArray());
        result["keys"] = KeySweep();
        result["elements"] = ElementSweep(validator, cases);
        result["misc"] = Misc(validator);
        ValidatorService.UnRegister();
        result["unregistered"] = ServiceLocator.GetService<IValidator>() == null;
        File.WriteAllText(Path.Combine(outDir, "validator.json"), result.ToJsonString(new JsonSerializerOptions { WriteIndented = false }));
        Console.WriteLine($"total {sw.ElapsedMilliseconds} ms");
    }

    // ------------------------------------------------------------------ helpers

    /// <summary>Surrogates as \uXXXX, absolute paths of the working directory as &lt;root&gt;.</summary>
    internal static string Esc(string s)
    {
        s = _rootRegex!.Replace(s, "<root>");
        var sb = new StringBuilder(s.Length);
        foreach (var ch in s)
        {
            if (ch >= 0xD800 && ch <= 0xDFFF) sb.Append("\\u").Append(((int)ch).ToString("X4"));
            else sb.Append(ch);
        }
        return sb.ToString();
    }

    static JsonNode? J(string? s) => s == null ? null : JsonValue.Create(Esc(s));

    static string Try(Func<object?> f)
    {
        try
        {
            var v = f();
            return v switch
            {
                null => "null",
                bool b => b ? "True" : "False",
                _ => Esc(v.ToString()!),
            };
        }
        catch (TargetInvocationException e) when (e.InnerException != null) { return "!" + e.InnerException.GetType().Name; }
        catch (AggregateException e) when (e.InnerException != null) { return "!" + e.InnerException.GetType().Name; }
        catch (Exception e) { return "!" + e.GetType().Name; }
    }

    /// <summary>GetHashCode values differ between the platforms: only whether it throws.</summary>
    static string HashOk(ValidationElement x)
    {
        var h = Try(() => x.GetHashCode());
        return h.StartsWith("!") ? h : "ok";
    }

    static string Save(CAEXDocument doc)
    {
        try { return EngineOpsOracle.Save(doc); }
        catch (Exception e) { return Ex(e); }
    }

    static string Ex(Exception e) => "!" + (e is TargetInvocationException t && t.InnerException != null ? t.InnerException : e).GetType().Name;

    static string Path2(string relative) => Path.GetFullPath(Path.Combine(_casesDir, relative));

    static string Decode(string value)
    {
        value = value.Replace("%CASESURL%", new Uri(_casesDir).AbsoluteUri).Replace("%CASES%", _casesDir);
        return Regex.Replace(value, "%%([0-9A-F]{4})", m => ((char)Convert.ToInt32(m.Groups[1].Value, 16)).ToString());
    }

    static void Subst(CAEXDocument doc)
    {
        foreach (var a in doc.XDocument.Descendants().Attributes().ToList())
            if (a.Value.Contains('%')) a.Value = Decode(a.Value);
        foreach (var e in doc.XDocument.Descendants().Where(e => !e.HasElements).ToList())
            if (e.Value.Contains('%')) e.Value = Decode(e.Value);
    }

    static CAEXDocument Load(JsonObject c, bool fromString = false)
    {
        var path = Path2(c["file"]!.GetValue<string>());
        var doc = fromString ? CAEXDocument.LoadFromString(File.ReadAllText(path, Encoding.UTF8))! : CAEXDocument.LoadFromFile(path);
        if (c["subst"]!.GetValue<bool>()) Subst(doc);
        return doc;
    }

    /// <summary>The container of a case: the document as root and the parts of the case; a part the
    /// package rejects is left out and its exception recorded in <paramref name="added"/>.</summary>
    static AutomationMLContainer BuildContainer(JsonObject c, List<string>? added = null)
    {
        var path = Path2(c["file"]!.GetValue<string>());
        var container = new AutomationMLContainer(new MemoryStream(), FileMode.Create);
        var root = container.AddRoot(new MemoryStream(File.ReadAllBytes(path)), new Uri("/" + Path.GetFileName(path), UriKind.Relative));
        foreach (var p in c["parts"]?.AsArray() ?? new JsonArray())
        {
            var kind = p![0]!.GetValue<string>();
            var uri = new Uri(p[1]!.GetValue<string>(), UriKind.Relative);
            var source = new MemoryStream(File.ReadAllBytes(Path.Combine(Path.GetDirectoryName(path)!, p[2]!.GetValue<string>())));
            try
            {
                if (kind == "library") container.AddLibrary(root, source, uri);
                else container.AddAnyContent(root, source, uri, "application/octet-stream");
                added?.Add("ok");
            }
            catch (Exception e) { added?.Add(Ex(e)); }
        }
        return container;
    }

    static readonly FieldInfo KeyField = typeof(ValidationElement).GetField("<validationKey>P", BindingFlags.NonPublic | BindingFlags.Instance)
        ?? throw new InvalidOperationException("validation key field not found");

    static ValidationKey KeyOf(ValidationElement v) => (ValidationKey)KeyField.GetValue(v)!;

    /// <summary>One validation result: element, key, type, options, texts.</summary>
    static JsonArray Line(ValidationElement v, Func<string, string>? canon = null)
    {
        canon ??= s => s;
        string? C(string? s) => s == null ? null : canon(s);
        var e = v.Element;
        var w = v.CAEXElement;
        var key = KeyOf(v);
        return new JsonArray(
            J(e.Name.LocalName),
            J(C(e.Attribute("Name")?.Value)),
            J(C(e.Attribute("ID")?.Value)),
            J(w is CAEXObject o ? C(Try(() => o.CAEXPath())) : "-"),
            J(w == null ? "null" : w.GetType().Name),
            J(C(key.Key)),
            J(v.ValidationType.ToString()),
            JsonValue.Create((int)v.AvailableRepairOptions),
            J(v.ValidatedAttribute),
            J(C(v.ValidationInformation)),
            J(C(v.LongDescription)),
            J(C(v.RepairResult)),
            J(v.AvailableRepairOptions.RepairTypeDescription()));
    }

    static string Tables(CAEXDocument doc) =>
        ServiceLocator.QueryService is ILookUpTable t ? $"{(t.IDTableIsLoaded(doc) ? "T" : "F")}{(t.PathTableIsLoaded(doc) ? "T" : "F")}" : "-";

    static readonly (string Name, Func<IEnumerable<ValidationElement>, IEnumerable<ValidationElement>> Filter)[] Filters =
    {
        ("AliasReferenceValidationResults", r => r.AliasReferenceValidationResults()),
        ("AliasValidationResults", r => r.AliasValidationResults()),
        ("ExternalReferenceValidationResults", r => r.ExternalReferenceValidationResults()),
        ("ClassPathValidationResults", r => r.ClassPathValidationResults()),
        ("IDReferenceValidationResults", r => r.IDReferenceValidationResults()),
        ("CardinalityValidationResults", r => r.CardinalityValidationResults()),
        ("DirectionValidationResults", r => r.DirectionValidationResults()),
        ("CategoryValidationResults", r => r.CategoryValidationResults()),
        ("PathReferenceValidationResults", r => r.PathReferenceValidationResults()),
        ("NameReferenceValidationResults", r => r.NameReferenceValidationResults()),
        ("NameValidationResults", r => r.NameValidationResults()),
        ("IDValidationResults", r => r.IDValidationResults()),
        ("MetaDataValidationResults", r => r.MetaDataValidationResults()),
        ("InvalidAutomationMLVersion", r => r.InvalidAutomationMLVersion()),
        ("InvalidSchemaVersion", r => r.InvalidSchemaVersion()),
        ("MissingDocumentSourceInformation", r => r.MissingDocumentSourceInformation()),
        ("InvalidIDs", r => r.InvalidIDs()),
        ("NotUniquePath", r => r.NotUniquePath()),
        ("Repairable", r => r.Repairable()),
        ("NotRepairable", r => r.NotRepairable()),
        ("UnresolvedIDRefs", r => r.UnresolvedIDRefs()),
        ("UnresolvedPathRefs", r => r.UnresolvedPathRefs()),
        ("EmptyPathRefs", r => r.EmptyPathRefs()),
        ("EmptyIDRefs", r => r.EmptyIDRefs()),
        ("MissingIDs", r => r.MissingIDs()),
        ("NotUniqueIDs", r => r.NotUniqueIDs()),
        ("UnidentifiedAlias", r => r.UnidentifiedAlias()),
        ("UselessAlias", r => r.UselessAlias()),
    };

    // ------------------------------------------------------------------ documents

    static readonly string[] CorpusRunsNone = { "all", "allL", "allC", "noSC", "aliasL" };
    static readonly string[] CorpusRunsLookup = { "allL", "allC" };

    static JsonObject RunDoc(ValidatorService v, JsonObject c, string docsDir)
    {
        var rec = new JsonObject();
        var corpus = c["corpus"]?.GetValue<bool>() == true;
        var file = c["file"]!.GetValue<string>();
        var safe = Path.GetFileNameWithoutExtension(file);
        AutomationMLContainer container;
        try
        {
            var added = new List<string>();
            container = BuildContainer(c, added);
            rec["added"] = string.Join(",", added);
            rec["parts"] = new JsonArray(container.GetParts().Select(p => (JsonNode?)J(p.Uri.ToString())).OrderBy(p => p!.GetValue<string>(), StringComparer.Ordinal).ToArray());
        }
        catch (Exception e)
        {
            rec["parts"] = Ex(e);
            return rec;
        }

        var runs = new List<(string Name, Func<CAEXDocument, IEnumerable<ValidationElement>> Call, bool FromString)>
        {
            ("all", d => v.ValidateAll(d), false),
            ("allL", d => v.ValidateAll(d, true), false),
            ("allN", d => v.ValidateAll(d, null, false), false),
            ("allC", d => v.ValidateAll(d, container, true), false),
            ("noS", d => v.ValidateAllWithoutStrictID(d), false),
            ("noSC", d => v.ValidateAllWithoutStrictID(d, container, true), false),
            ("alias", d => v.ValidateAliasReferences(d), false),
            ("aliasL", d => v.ValidateAliasReferences(d, true), false),
        };
        if (!corpus) runs.Add(("str", d => v.ValidateAll(d, true), true));

        foreach (var svc in new[] { "none", "lookup" })
        {
            if (svc == "lookup") LookupService.Register();
            var runRec = new JsonObject();
            var seen = new Dictionary<string, string>();
            List<ValidationElement>? allL = null;
            CAEXDocument? allLDoc = null;
            foreach (var (name, call, fromString) in runs)
            {
                // Corpus documents: a subset of the calls (the generated documents take every call).
                if (corpus && !(svc == "none" ? CorpusRunsNone : CorpusRunsLookup).Contains(name)) continue;
                var r = new JsonObject();
                CAEXDocument doc;
                try { doc = Load(c, fromString); }
                catch (Exception e) { r["load"] = Ex(e); runRec[name] = r; continue; }
                var before = Save(doc);
                r["tables0"] = Tables(doc);
                List<ValidationElement>? list = null;
                IEnumerable<ValidationElement>? e1 = null;
                try
                {
                    e1 = call(doc);
                    r["tablesCall"] = Tables(doc);
                    list = e1.ToList();
                }
                catch (Exception e) { r["error"] = Ex(e); }
                r["tables"] = Tables(doc);
                if (list != null)
                {
                    var lines = new JsonArray(list.Select(x => (JsonNode?)Line(x)).ToArray());
                    var text = lines.ToJsonString();
                    r["n"] = list.Count;
                    if (seen.TryGetValue(text, out var same)) r["same"] = same;
                    else { r["lines"] = lines; seen[text] = name; }
                    if (!corpus || name == "allL") try
                    {
                        var again = e1!.ToList();
                        r["again"] = new JsonArray(again.Select(x => (JsonNode?)Line(x)).ToArray()).ToJsonString() == text
                            ? "same" : "differs:" + again.Count;
                        r["againEquals"] = string.Concat(list.Zip(again).Take(60).Select(p => p.First.Equals(p.Second) ? "T" : "F"));
                    }
                    catch (Exception e) { r["again"] = Ex(e); }
                }
                var after = Save(doc);
                r["doc"] = after == before ? "unchanged" : EngineOpsOracle.Hash(Esc(after));
                if (after != before && !corpus) r["docText"] = J(after);
                runRec[name] = r;
                if (name == "allL" && list != null) { allL = list; allLDoc = doc; }
            }

            // Partial enumeration: InitValidation runs at the call, FinalizeValidation only at the end.
            if (!corpus || svc == "none") try
            {
                var doc = Load(c);
                var states = new List<string> { Tables(doc) };
                var e = v.ValidateAll(doc);
                states.Add(Tables(doc));
                using (var en = e.GetEnumerator()) { en.MoveNext(); }
                states.Add(Tables(doc));
                var n = v.ValidateAll(doc).Count();
                states.Add(Tables(doc));
                var n2 = v.ValidateAliasReferences(doc).Count();
                states.Add(Tables(doc));
                runRec["partial"] = string.Join(",", states) + $"|{n}|{n2}";
            }
            catch (Exception e) { runRec["partial"] = Ex(e); }

            if (allL != null)
            {
                var filters = new JsonObject();
                foreach (var (fname, f) in Filters)
                    filters[fname] = string.Join(",", f(allL).Select(x => allL.IndexOf(x)));
                runRec["filters"] = filters;
                runRec["revalidate"] = string.Concat(allL.Select(x => Try(() => x.ReValidate()) switch { "True" => "T", "False" => "F", var s => "(" + s + ")" }));
                var eq = new List<string>();
                var head = allL.Take(60).ToList();
                for (var i = 0; i < head.Count; i++)
                    for (var j = i + 1; j < head.Count; j++)
                        if (head[i].Equals(head[j])) eq.Add($"{i}={j}");
                runRec["equals"] = string.Join(",", eq);
                runRec["hash"] = string.Concat(head.Select(x => HashOk(x) == "ok" ? "o" : "x"));
                if (head.Count > 0) runRec["equalsOther"] = $"{head[0].Equals(null)}|{head[0].Equals("x")}|{head[0].Equals(head[0])}";
                GC.KeepAlive(allLDoc);
            }
            runRec["names"] = NameSweep(v, c);
            rec[svc] = runRec;
            if (svc == "lookup") LookupService.UnRegister();
        }

        var repairs = new JsonObject();
        foreach (var mode in corpus ? new[] { "plain", "unique" } : new[] { "plain", "unique", "lookup" })
        {
            if (mode != "plain") UniqueNameService.Register();
            if (mode == "lookup") LookupService.Register();
            repairs[mode] = RepairDoc(v, c, Path.Combine(docsDir, safe + "." + mode + ".aml"));
            if (mode == "lookup") LookupService.UnRegister();
            if (mode != "plain") UniqueNameService.UnRegister();
        }
        rec["repair"] = repairs;
        rec["xmlName"] = XmlNameRepair(v, c);
        return rec;
    }

    static JsonObject RepairDoc(ValidatorService v, JsonObject c, string outFile)
    {
        var r = new JsonObject();
        var canon = new EngineOpsOracle.Canonicalizer();
        CAEXDocument doc;
        try { doc = Load(c); }
        catch (Exception e) { r["load"] = Ex(e); return r; }
        List<ValidationElement> list;
        try { list = v.ValidateAll(doc, true).ToList(); }
        catch (Exception e) { r["error"] = Ex(e); return r; }
        var steps = new JsonArray();
        for (var i = 0; i < list.Count; i++)
        {
            var x = list[i];
            if (x.AvailableRepairOptions == RepairTypeEnum.None) continue;
            var ret = Try(() => v.Repair(x));
            var rv = Try(() => x.ReValidate());
            steps.Add(new JsonArray(JsonValue.Create(i), J(ret), J(canon.Apply(Esc(x.RepairResult ?? "null"))), J(rv)));
        }
        r["steps"] = steps;
        string text;
        try { text = canon.Apply(Esc(Save(doc))); }
        catch (Exception e) { text = Ex(e); }
        r["final"] = EngineOpsOracle.Hash(text);
        File.WriteAllText(outFile, text);
        try
        {
            var after = v.ValidateAll(doc).ToList();
            r["after"] = new JsonArray(after.Select(x => (JsonNode?)Line(x, s => canon.Apply(Esc(s)))).ToArray());
        }
        catch (Exception e) { r["after"] = Ex(e); }
        return r;
    }

    static readonly MethodInfo RenameElement = typeof(ValidationElement).GetMethod("RenameElement", BindingFlags.NonPublic | BindingFlags.Instance)!;

    /// <summary>RenameElement(GenerateXmlName) of every name issue (Repair never calls it for this option).</summary>
    static JsonNode XmlNameRepair(ValidatorService v, JsonObject c)
    {
        try
        {
            var doc = Load(c);
            var list = v.ValidateAll(doc).Where(x => x.ValidationType == ValidationTypeEnum.NameValidation).ToList();
            var steps = new JsonArray();
            foreach (var x in list)
            {
                var ret = Try(() => RenameElement.Invoke(x, new object[] { RepairTypeEnum.GenerateXmlName }));
                steps.Add(new JsonArray(J(ret), J(x.RepairResult)));
            }
            GC.KeepAlive(doc);
            return steps;
        }
        catch (Exception e) { return JsonValue.Create(Ex(e))!; }
    }

    /// <summary>IDValidation and NameValidation on a sample of the CAEX objects.</summary>
    static JsonNode NameSweep(ValidatorService v, JsonObject c)
    {
        try
        {
            var doc = Load(c);
            var all = EngineOpsOracle.Objects(doc);
            var n = all.Count;
            var step = Math.Max(1, n / 60);
            var lines = new JsonArray();
            for (var i = 0; i < n; i += step)
            {
                var o = all[i];
                var other = all[(i * 7 + 3) % n];
                var sibling = o.Node.ElementsAfterSelf().Concat(o.Node.ElementsBeforeSelf()).FirstOrDefault(e => e.Attribute("Name") != null)?.Attribute("Name")!.Value;
                string R((bool IsValid, string Message) t) => (t.IsValid ? "T:" : "F:") + (t.Message ?? "null");
                lines.Add(new JsonArray(
                    J(Try(() => R(v.IDValidation(o, null!)))),
                    J(Try(() => R(v.IDValidation(o, "")))),
                    J(Try(() => R(v.IDValidation(o, o.ID)))),
                    J(Try(() => R(v.IDValidation(o, other.ID)))),
                    J(Try(() => R(v.IDValidation(o, "no-such-id")))),
                    J(Try(() => R(v.NameValidation(o, o.Name)))),
                    J(Try(() => R(v.NameValidation(o, null!)))),
                    J(Try(() => R(v.NameValidation(o, "")))),
                    J(Try(() => R(v.NameValidation(o, other.Name)))),
                    J(Try(() => R(v.NameValidation(o, "Fresh")))),
                    J(Try(() => R(v.NameValidation(o, sibling!))))));
            }
            // A removed object: no document and no parent.
            var first = all.OfType<InternalElementType>().FirstOrDefault();
            if (first != null)
            {
                first.Remove();
                lines.Add(new JsonArray(
                    J(Try(() => { var t = v.IDValidation(first, "x"); return $"{t.IsValid}:{t.Message}"; })),
                    J(Try(() => { var t = v.NameValidation(first, "x"); return $"{t.IsValid}:{t.Message}"; }))));
            }
            GC.KeepAlive(doc);
            return lines;
        }
        catch (Exception e) { return JsonValue.Create(Ex(e))!; }
    }

    // ------------------------------------------------------------------ sweeps

    static readonly MethodInfo CanLocateFile = typeof(ValidatorService).GetMethod("CanLocateFile", BindingFlags.NonPublic | BindingFlags.Static)!;
    static readonly MethodInfo FilePathFromValue = typeof(ValidatorService).GetMethod("FilePathFromValue", BindingFlags.NonPublic | BindingFlags.Static)!;

    static string Locate(AutomationMLContainer? container, CAEXFileType? file, string? fileRef)
    {
        var a = new object?[] { container, file, fileRef, "init" };
        try
        {
            var ok = (bool)CanLocateFile.Invoke(null, a)!;
            return (ok ? "T|" : "F|") + Esc((string)a[3]!);
        }
        catch (Exception e) { return Ex(e); }
    }

    static JsonNode FileRefSweep(JsonObject cases)
    {
        var docs = cases["docs"]!.AsArray().Select(d => d!.AsObject()).ToList();
        var ext = docs.First(d => d["file"]!.GetValue<string>() == "v-extrefs30.aml");
        var data = docs.First(d => d["file"]!.GetValue<string>() == "v-extdata30.aml");
        var docFromFile = Load(ext);
        var docFromString = Load(ext, true);
        var docFresh = CAEXDocument.New_CAEXDocument();
        var fromFile = docFromFile.CAEXFile;
        var fromString = docFromString.CAEXFile;
        var fresh = docFresh.CAEXFile;
        // Documents named by a root path: Path.GetDirectoryName gives null (NullReferenceException "rootPath").
        var docRootC = CAEXDocument.New_CAEXDocument();
        docRootC.CAEXFile.FileName = "C:\\";
        var docRootSlash = CAEXDocument.New_CAEXDocument();
        docRootSlash.CAEXFile.FileName = "/";
        var merged = new JsonObject
        {
            ["file"] = ext["file"]!.DeepClone(),
            ["subst"] = true,
            ["parts"] = new JsonArray(ext["parts"]!.AsArray().Concat(data["parts"]!.AsArray()).Select(p => p!.DeepClone()).ToArray()),
        };
        var container = BuildContainer(merged);
        var lines = new JsonArray();
        foreach (var node in cases["fileRefs"]!.AsArray())
        {
            var raw = node?.GetValue<string>();
            var fileRef = raw == null ? null : Decode(raw);
            lines.Add(new JsonArray(
                J(Locate(null, fromFile, fileRef)),
                J(Locate(null, fromString, fileRef)),
                J(Locate(null, fresh, fileRef)),
                J(Locate(container, fromFile, fileRef)),
                J(Try(() => ValidatorService.NormalizeFilePath(fileRef!, fromFile))),
                J(Try(() => ValidatorService.NormalizeFilePath(fileRef!, fromString))),
                J(Try(() => ValidatorService.NormalizeFilePath(fileRef!, fresh))),
                J(Try(() => FilePathFromValue.Invoke(null, new object?[] { fileRef, _casesDir }))),
                J(Try(() => FilePathFromValue.Invoke(null, new object?[] { fileRef, "" }))),
                J(Try(() => FilePathFromValue.Invoke(null, new object?[] { fileRef, "sub" }))),
                J(Locate(null, docRootC.CAEXFile, fileRef)),
                J(Try(() => ValidatorService.NormalizeFilePath(fileRef!, docRootC.CAEXFile))),
                J(Try(() => ValidatorService.NormalizeFilePath(fileRef!, docRootSlash.CAEXFile)))));
        }
        GC.KeepAlive(docFromFile);
        GC.KeepAlive(docFromString);
        GC.KeepAlive(docFresh);
        GC.KeepAlive(docRootC);
        GC.KeepAlive(docRootSlash);
        return new JsonObject
        {
            ["lines"] = lines,
            ["nullFile"] = Try(() => ValidatorService.NormalizeFilePath("x.aml", null!)),
            ["ftp"] = Locate(null, fromFile, "ftp://127.0.0.1:9/lib.aml"),
            ["ftpContainer"] = Locate(container, fromFile, "ftp://127.0.0.1:9/lib.aml"),
        };
    }

    static JsonNode XmlCharsSweep(JsonObject cases)
    {
        var lines = new JsonArray();
        foreach (var node in cases["xmlChars"]!.AsArray())
        {
            var s = new string(node!.AsArray().Select(u => (char)u!.GetValue<int>()).ToArray());
            try { lines.Add(J("=" + XmlConvert.VerifyXmlChars(s))); }
            catch (XmlException e) { lines.Add(J($"!XmlException|{e.Message}|{e.LineNumber}|{e.LinePosition}")); }
            catch (Exception e) { lines.Add(J(Ex(e))); }
        }
        lines.Add(J(Try(() => XmlConvert.VerifyXmlChars(null!))));
        return lines;
    }

    static JsonNode KeySweep()
    {
        var lines = new JsonArray();
        foreach (var key in new[] { "a", "", null, "x|y", "#CAEXNoName#" })
        {
            var types = key == "a" ? Enumerable.Range(0, 20) : new[] { 0, 18, 19 };
            foreach (var t in types)
            {
                var k = new ValidationKey(key!, (ValidationTypeEnum)t);
                lines.Add(new JsonArray(
                    J(k.Key), JsonValue.Create((int)k.ValidationType), J(k.ToString()), J(k.Item1), JsonValue.Create((int)k.Item2),
                    J(k.Equals(new ValidationKey(key!, (ValidationTypeEnum)t)).ToString()),
                    J(k.Equals(new ValidationKey(key + "x", (ValidationTypeEnum)t)).ToString()),
                    J(k.Equals(new ValidationKey(key!, (ValidationTypeEnum)(t + 1))).ToString()),
                    J(k.Equals(null).ToString()),
                    J(k.Equals("x").ToString()),
                    J(k.Equals(k).ToString()),
                    // Hash codes differ between the platforms: only whether two keys have the same one.
                    J((k.GetHashCode() == new ValidationKey(key!, (ValidationTypeEnum)t).GetHashCode()).ToString()),
                    J((k.GetHashCode() == new ValidationKey(key + "x", (ValidationTypeEnum)t).GetHashCode()).ToString()),
                    J((k.GetHashCode() == new ValidationKey(key!, (ValidationTypeEnum)(t + 1)).GetHashCode()).ToString())));
            }
        }
        return lines;
    }

    static XElement Find(CAEXDocument doc, string localName, string? name) =>
        doc.XDocument.Root!.DescendantsAndSelf().First(e => e.Name.LocalName == localName && (name == null || e.Attribute("Name")?.Value == name));

    static readonly RepairTypeEnum[] RepairFlags =
    {
        RepairTypeEnum.None, RepairTypeEnum.GenerateUniqueIDWhenEmpty, RepairTypeEnum.GenerateUniqueIDForDoubles, RepairTypeEnum.GenerateNameWhenEmpty,
        RepairTypeEnum.RemoveEmptyReference, RepairTypeEnum.RemoveUnresolvedIDReference, RepairTypeEnum.RemoveUnresolvedPathReference,
        RepairTypeEnum.RenameClassPathForDoubles, RepairTypeEnum.CreateWriterHeader, RepairTypeEnum.CreateAutomationMLVersion, RepairTypeEnum.GenerateUniqueName,
        RepairTypeEnum.SetSchemaVersion, RepairTypeEnum.GenerateXmlName, RepairTypeEnum.GenerateValidGUID, RepairTypeEnum.RemoveAlias,
        RepairTypeEnum.CheckAliasInExternalReference, RepairTypeEnum.CreateSourceDocumentInformation, RepairTypeEnum.RemoveElement,
        RepairTypeEnum.RemoveElementNotInScope, RepairTypeEnum.ChangeFileURL, RepairTypeEnum.RemoveUnresolvedNameReference,
        RepairTypeEnum.NameDefinitionOption, RepairTypeEnum.IDDefinitionOption, RepairTypeEnum.GenerateXmlName | RepairTypeEnum.GenerateUniqueName,
    };

    /// <summary>Targets: (document, element local name, Name attribute or null for the first, validated attribute).</summary>
    static readonly (string Doc, string Local, string? Name, string? Attribute)[] Targets =
    {
        ("v-aliases30.aml", "InternalElement", "Useless", "RefBaseSystemUnitPath"),
        ("v-aliases30.aml", "InternalElement", "Twice", "RefBaseSystemUnitPath"),
        ("v-aliases30.aml", "InternalElement", "Known", "Name"),
        ("v-aliases30.aml", "InternalElement", "Known", null),
        ("v-aliases30.aml", "InternalElement", "Known", "NoSuchAttribute"),
        ("v-aliases30.aml", "ExternalReference", null, "Alias"),
        ("v-aliases30.aml", "CAEXFile", null, "SchemaVersion"),
        ("v-aliases30.aml", "Attribute", "a", "RefAttributeType"),
        ("v-aliases30.aml", "RoleRequirements", null, "RefBaseRoleClassPath"),
        ("v-aliases30.aml", "SuperiorStandardVersion", null, "x"),
        ("v-aliases30.aml", "SystemUnitClass", "Derived", "RefBaseClassPath"),
        ("v-extdata30.aml", "Attribute", "refURI", "Value"),
        ("v-names30.aml", "InternalElement", "Same", "Name"),
        ("v-names30.aml", "InternalElement", "Ctrl%%0001x", "Name"),
        ("v-meta-none215.aml", "CAEXFile", null, "SchemaVersion"),
        ("v-meta-wrong215.aml", "CAEXFile", null, "SchemaVersion"),
        ("v-meta-none30.aml", "CAEXFile", null, "SchemaVersion"),
        ("v-ids215.aml", "InternalElement", "Bad", "ID"),
        ("v-meta-none215.aml", "InstanceHierarchy", null, "Name"),
        ("v-idrefs30.aml", "InternalLink", "L_unres", "RefPartnerSideA"),
        ("v-idrefs30.aml", "InterfaceIDMapping", null, "RoleInterfaceID"),
    };

    /// <summary>The ValidationElement API and every repair method on chosen targets.</summary>
    static JsonNode ElementSweep(ValidatorService v, JsonObject cases)
    {
        var docs = cases["docs"]!.AsArray().Select(d => d!.AsObject()).ToList();
        JsonObject Case(string f) => docs.First(d => d["file"]!.GetValue<string>() == f);
        var lines = new JsonArray();
        var available = typeof(ValidationElement).GetProperty("AvailableRepairOptions")!;
        foreach (var unique in new[] { false, true })
        {
            if (unique) UniqueNameService.Register();
            foreach (var (docFile, local, name, attribute) in Targets)
            {
                foreach (var flag in RepairFlags)
                {
                    var canon = new EngineOpsOracle.Canonicalizer();
                    CAEXDocument doc;
                    try { doc = Load(Case(docFile)); }
                    catch (Exception e) { lines.Add(J("load" + Ex(e))); continue; }
                    var target = Find(doc, local, name == null ? null : Decode(name));
                    var x = new ValidationElement(target, new ValidationKey("k", ValidationTypeEnum.IDValidation)) { ValidatedAttribute = attribute };
                    available.SetValue(x, flag);
                    var ret = Try(() => v.Repair(x));
                    var rv = Try(() => x.ReValidate());
                    string text;
                    try { text = canon.Apply(Esc(Save(doc))); }
                    catch (Exception e) { text = Ex(e); }
                    lines.Add(new JsonArray(J(ret), J(canon.Apply(Esc(x.RepairResult ?? "null"))), J(rv), J(EngineOpsOracle.Hash(text))));
                }
            }
            if (unique) UniqueNameService.UnRegister();
        }

        // Defaults, Equals and GetHashCode of a ValidationElement created directly.
        var d0 = Load(Case("v-ids30.aml"));
        var ieNode = Find(d0, "InternalElement", null);
        var descr = Find(d0, "SuperiorStandardVersion", null);
        var k = new ValidationKey("k", ValidationTypeEnum.NameValidation);
        var a = new ValidationElement(ieNode, k);
        var b = new ValidationElement(ieNode, new ValidationKey("other", ValidationTypeEnum.IDValidation));
        var api = new JsonArray(
            J(ValidationElement.NOT_REPAIRED),
            JsonValue.Create((int)a.AvailableRepairOptions),
            J(a.RepairResult), J(a.ValidationInformation), J(a.LongDescription), J(a.ValidatedAttribute), J(a.ValidationType.ToString()),
            J(a.CAEXElement?.GetType().Name ?? "null"), J(a.Element.Name.LocalName),
            J(HashOk(a)),
            J(a.Equals(b).ToString()), J(Try(() => a.ReValidate())));
        a.ValidatedAttribute = "ID";
        b.ValidatedAttribute = "ID";
        api.Add(J(HashOk(a)));
        api.Add(J(a.Equals(b).ToString()));
        b.ValidatedAttribute = "Name";
        api.Add(J(a.Equals(b).ToString()));
        var n1 = new ValidationElement(descr, k) { ValidatedAttribute = "x" };
        var n2 = new ValidationElement(descr, k) { ValidatedAttribute = "x" };
        api.Add(J(n1.CAEXElement?.GetType().Name ?? "null"));
        api.Add(J(HashOk(n1)));
        api.Add(J(n1.Equals(n2).ToString()));
        api.Add(J(n1.Equals(a).ToString()));
        var rootEl = new ValidationElement(d0.XDocument.Root!, k);
        api.Add(J(rootEl.CAEXElement?.GetType().Name ?? "null"));
        GC.KeepAlive(d0);
        return new JsonObject { ["repairs"] = lines, ["api"] = api };
    }

    static JsonNode Misc(ValidatorService v)
    {
        return new JsonArray(
            J(Try(() => v.IDValidation(null!, "x"))),
            J(Try(() => v.NameValidation(null!, "x"))),
            J(Try(() => v.ValidateAll(null!).Count())),
            J(Try(() => v.ValidateAliasReferences(null!).Count())),
            J(Try(() => v.Repair(null!))),
            J(Try(() => ValidatorService.Register() == ServiceLocator.GetService<IValidator>())));
    }
}
