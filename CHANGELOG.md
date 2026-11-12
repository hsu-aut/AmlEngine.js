# Changelog

## 0.3.0 (2026-11-12)

- The services of Aml.Engine: a port of Aml.Engine.Services 4.3.1 in the new entry
  `amlengine-js/services`. UndoRedoService (undo and redo with transactions, also over two
  documents), LookupService (lookup tables the engine's queries use), ValidatorService (finds and
  repairs IDs, references, aliases, versions and headers), CAEXSchemaTransformer (CAEX 2.15 and
  3.0 in both directions), AMLEditionTransformer, MergeService and SplitService,
  ExternalReferenceResolver (files, http and GitHub), UniqueNameService, CAEXFileStatisticService.
  Both entries share one engine: a service registered through `amlengine-js/services` is used by
  the engine of `amlengine-js` (checked on the packed package in ESM and CommonJS by
  `scripts/check-package.mjs`).
- The rest of Aml.Engine.Resources 4.2.1: the library catalog (`PublicLibraryCatalog`, with the
  embedded `AutomationMLLibs.json`), the file models (`AMLFileMetaModel`, ...), the type converters.
- Verified against the original like the engine: one oracle command and one test per area
  (`test/services`), and the engine packages again with the lookup, unique name and undo services
  registered (`scripts/services-check.mjs`), which also runs the about 180 places where the engine
  asks for a service. Where the original never returns (LookupService on a moved element, cyclic
  class references), the port throws `CyclicReferenceException`. Where a service waits for the
  network in a synchronous method, the port cannot: use the asynchronous methods
  (docs/deviations.md, "Services").
- Engine errors found on the way and fixed, each against the original: `XName` with a null name,
  the exceptions of `saveToFile`, `Path.GetFullPath` on Windows, "Root element is missing." without
  line information, `Uri.GetComponents`, the case-insensitive key comparison of the MIME table,
  "Collection was modified" of `List`, `Dictionary` and `HashSet` (also `List.Clear` on an empty
  list, `AddRange` of a query over the same list, enumerators that take the version when they are
  created).
- Type declarations are written per module by tsc (`dist/types`, and `dist/types-cjs` for
  `require`), so both entries refer to the same classes; `typesVersions` serves them to
  TypeScript with the old `node` module resolution.
- A second copy of the engine in one process (the ESM and the CommonJS entries mixed, or two
  versions of the package) warns once: services registered in one copy do not act on the documents
  of the other.
- `npm test` and `npm run check-upstream` also watch Aml.Engine.Services and Aml.Engine.Resources
  on NuGet.

## 0.2.1 (2026-11-09)

- AMLX containers can be created and changed in memory through the public API, which is the way
  to use them in the browser: `MemoryStream`, `FileMode` and the other types of
  `System.IO.Packaging` (`Package`, `PackagePart`, `PackageRelationship`, `TargetMode`,
  `FileAccess`, `FileShare`, `CompressionOption`, `IOException`, `FileFormatException`) are
  exported. In 0.2.0 a container could be read from bytes, but its changes could not be taken out
  again. Example in the README; checked by `test/engine/amlx-memory.test.ts` and by the browser
  check, which now uses the public exports.

## 0.2.0 (2026-11-09)

- First version on npm (`amlengine-js`); a tag `v<version>` publishes over Trusted Publishing
  (`.github/workflows/release.yml`). `package.json` can be imported
  (`amlengine-js/package.json`).
- Where the original depends on the current culture: `scripts/culture-check.mjs` runs the oracle
  in another culture (`ORACLE_CULTURE`); the results for de-DE are in docs/deviations.md
  ("Current culture"). Reading and saving do not depend on it, writing typed values does.
- `FindByID` without ID table remembers per document the IDs its searches have passed, until an
  element or attribute changes; the result stays that of the search of the original. The full
  read model walk of a 10 MB document takes 10 to 16 s instead of 20 minutes or more (Aml.Engine:
  12 minutes). Checked by `test/engine/findbyid.test.ts` and, with `AMLENGINE_CHECK_ID_TABLE=1`,
  by comparing every `FindByID` of the test suite with the plain search. The plain search (the
  first after a change) is 3.5 times faster, without generator and LINQ overhead.
- Case mapping from fixed .NET tables instead of the JS engine, so that Node and every browser
  give the same result: `char.ToUpperInvariant`, `ToLowerInvariant` and `OrdinalIgnoreCase`,
  supplementary code points included. Fixes found with it, each checked against the original:
  `ChangeMode="ﬅate"` was read as `State`, "ınfinity" was read as a double, "FRİDAY 2020-01-03"
  was parsed as a date, `StringComparer.OrdinalIgnoreCase` returned other values for some
  non-ASCII letters.
- `Trim` and `IsNullOrWhiteSpace` treat U+0085 as white space and U+FEFF not, as .NET does.
- XML parser and writer without recursion: any nesting depth (tested with 20,000 levels).
- Browser check also in Chromium, Firefox and WebKit (Playwright), with all System and
  infrastructure oracle cases.
- Large documents (10 and 50 MB, and 10 MB with 421 schema errors) compared with the original:
  saving, the read API, validation (`test/engine/large.oracle.test.ts`); time and memory against
  the original in Node and three browsers (docs/performance.md, `test/perf/run.mjs`).
- Time zone check: the oracle runs in another local time zone (`ORACLE_TZ`), the tests with `TZ`;
  UTC, America/New_York and Asia/Kolkata match apart from documented old dates
  (`scripts/tz-check.mjs`).
- CI workflow (`.github/workflows/ci.yml`): quick job on Linux, full oracle comparison on Windows
  with the oracle outputs in the Actions cache.
- `engines`: Node 20 or later.
- Documentation for publication: README with installation, requirements and notes on large
  documents; origin and license of every test input (`NOTICE`, `test/corpus/SOURCES.tsv`,
  `test/xml-corpus.sources.tsv`); the port notes in `docs/port-notes/` checked against the
  current code.

## 0.1.0 (2026-09-26)

First version for use in other projects (FPB.js). Behaviour of Aml.Engine 4.5.2.

- Complete port of Aml.Engine 4.5.2: loading and saving, the CAEX object model for CAEX 2.15 and
  3.0, paths and aliases, inheritance, mirrors, typed attribute values, schema validation,
  commands and undo hooks, AutomationML objects, standard libraries, AMLX containers, streaming.
- Public API with the C# names in camel case; the C# extension methods also as instance methods.
- ESM and CommonJS builds with type declarations; runs in Node and in the browser (checked in
  headless Microsoft Edge).
- Where Aml.Engine never returns (cyclic references, a few loops), the port throws
  `CyclicReferenceException` or `ArgumentException` (docs/deviations.md).
- Optional corrections of ten data errors of the original, off by default (docs/fixes.md).
- `npm test` warns when NuGet has a newer Aml.Engine (docs/upgrading-aml-engine.md).
- Verified against the original by differential tests (oracle in `oracle/`), see README.
