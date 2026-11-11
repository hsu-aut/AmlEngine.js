# Coverage notes: services transform

Area: `src/services/CAEXSchemaTransformer.ts`, `src/services/transformator/CAEXSchemaUpgrader.ts`,
`src/services/transformator/CAEXSchemaDowngrader.ts`,
`src/services/amltransformer/AMLEditionTransformer.ts`, and the engine side of schema
transformations: `CAEXDocument.transformToSchema` (both overloads), `finalizeSchemaTransformation`
(all three forms), `isTransformationActive`, the handlers that `ServiceLocator.register` subscribes
to `transformationStarted` and `transformationEnded`, and `AMLSchemaManager.finalizeSchemaTransformation`.

Files: `oracle/ServicesTransformOracle.cs`, `test/services/transform.oracle.test.ts`,
`scripts/gen-services-transform.mjs` (seed 3682, deterministic) writing the inputs under
`test/services/transform/`:

- `docs/*.aml`: 19 documents. The CAEX 2.15 documents cover the upgrader: WriterHeaders with every
  kind of LastWritingDateTime text, no WriterHeader, supported role classes with and without
  mapping objects, qualified attributes and interfaces, unknown role classes, mapping objects without
  role, a mapping without RoleAttributeName, mirrors with children, and internal links with
  "ID:Name" references. The CAEX 3.0 documents cover the downgrader: no, one, several and sparse
  SourceDocumentInformation, a missing and an unparsable date, several role requirements with
  mapping objects, a role requirement without path, an unresolvable system unit interface, and
  internal links to interfaces of instances, classes, roles and nested interfaces. The `ed-*`
  documents cover the edition transformer: external references of all kinds, objects without ID or
  Version, attributes of classes, and an empty attribute name.
- `catalogs/a.json` and `catalogs/b.json`: library catalogs in the System.Text.Json form of
  PublicLibraryCatalog. They contain revisions, an obsolete DownloadLink, a version without CAEX
  version, prerelease versions, links that do not end with ".aml", and a library listed twice.
  Catalog b has no attribute type library.
- `repositories/*.json`: items of the IClassRepository test double.
- `cases.json`: the cases and the 19 library service configurations.

Oracle call (for scripts/oracle.sh):

```
node scripts/gen-services-transform.mjs test/corpus test/services/transform 3682 >/dev/null
$ORACLE svc-transform test/corpus test/services/transform test/oracle-out/services/transform
```

The oracle writes `schema.json`, `engine.json`, `imports.json`, `edition.json` and `misc.json`, plus
`texts/<hash>.aml` with the canonical text of every recorded document (used for the diff).

The oracle runs in about 25 s. The test takes about 75 s on an idle machine (up to 3 minutes
under load). The test has 443 tests, and all of them pass: 763 cases with 11,176 compared lines,
2,870 of which are documents.

## What is compared

Each case is a list of `key=value` lines. A document is recorded as the SHA-256 prefix of its
canonical saved text. On a difference, the test shows the full text of both sides.

Canonical form:

- GUIDs are numbered by their order of appearance (G1, G2, ...). The `ids` cases keep them, because
  those cases register a counting ID service.
- Timestamps within a day of the run become NOW. These are the "now" values of a required
  SourceDocumentInformation that the finalization creates. Each side uses its own run day, so the
  outputs do not depend on the date of the oracle run.

Nothing else is normalized, apart from the two deviations below.

1. **CAEXSchemaTransformer.transformTo** (301 runs: every corpus document and every generated
   document). Each run records the following:
   - the transformation to the other schema (kind of result, result document, source document
     afterwards);
   - the transformation of the result back (result and the first result afterwards);
   - the transformation to the document's own schema (same object) and to `Unknown` (null);
   - a null document.

   The modes are:
   - `plain`: all documents.
   - `ids`: counting ID service, which shows the order and overload of every new ID.
   - `undo`: UndoRedoService registered. The run also records CanUndo and CanRedo of source and
     result, an edit on the result with UndoActions, and an Undo with the document afterwards.
   - `lookup`: LookupService as IAutoUpdate, with the auto update flag before and after each
     transformation. This shows that `Unknown` leaves auto update disabled.

   `ids`, `undo` and `lookup` run on the generated documents and on corpus documents of up to 30 KB.
   Three modes run on the generated documents only:
   - `events`: own handlers after the engine handlers, recording sender, target schema, source,
     target document and `isTransformationActive` at both events.
   - `nulltarget`: a handler sets the target to null.
   - `unregistered`: an instance whose handlers are unsubscribed.
2. **CAEXDocument.transformToSchema(schema)** (162 runs: the generated documents and the corpus
   documents of up to 30 KB). Modes: no service, UndoRedoService, and CAEXSchemaTransformer
   registered. Each run records the following:
   - the prepared copy and `isTransformationActive`;
   - the source document afterwards and the undo state of the copy;
   - `finalizeSchemaTransformation()` with the flag and the document afterwards;
   - the document's own schema, `Unknown` and the invalid value 99 (ArgumentOutOfRangeException).

   The original calls the internal members by reflection.
3. **Import of objects of the other schema** (8 document pairs, in both directions). Each copied
   library, instance hierarchy, internal element, external interface and system unit class is
   inserted into a document of the other schema. This exercises `transformToSchema(XElement)` and
   `finalizeSchemaTransformation(XElement)` in `CAEXSequence.insert`. The run records the inserted
   object and the document after each insert.
4. **AMLEditionTransformer** (297 scenarios). The IAMLLibraryService test double is the same in
   oracle and test:
   - Its server profile has AdministrationData of the configured content types, with folders
     F0, F1, ....
   - LoadLibraryCatalogAsync returns the embedded AutomationMLLibs.json, catalog a or b, or null.
     It can also throw, or return a faulted task.
   - LoadClassRepositoryAsync returns a repository, null, or a faulted task.
   - SearchSimilar returns the items whose match is "*" or the class name.
   - Every call of the double is recorded in order with the logger messages, the sender check
     and IsError: the catalog and repository loads with their arguments, the
     StringComparisonAlgorithm set, and each SearchSimilar with name and maxCost.

   The scenarios are:
   - every 2.15 corpus document with services `none` and `full-a`, and every 3.0 corpus document
     (returned unchanged);
   - every generated 2.15 document with all 19 configurations;
   - Edition1 and AllEditions;
   - the counting ID service;
   - no logger;
   - a CAEXSchemaTransformer registered before the call (it stays registered);
   - two scenarios of several calls on one instance, where the library catalog of an earlier call
     stays in the instance;
   - the registration of the service.

   `transformToEditionAsync` is compared with the original's TransformToEdition in all scenarios.
   `transformToEdition` (sync) runs every single-step scenario:
   - Without a load in the oracle's record, it must give the same result.
   - Otherwise its record must equal the oracle's up to the first load, then NotSupportedException.
     After that, no result, an unchanged source and no ISchemaTransform left registered.
5. **Misc**: `isError` for 13 strings. They include ignorable characters (soft hyphen, zero width
   space, a combining accent), full width letters and null. The run also covers registration and
   unregistration of the schema transformer.

## Deviations

Three deviations, each expected for exactly its cases. They are listed by test count:

1. **transformToEdition is synchronous.** In 104 of the 295 single-step scenarios the original
   loads the library catalog or the class repository. In exactly those, the port's
   `transformToEdition` throws NotSupportedException, and its record up to that point equals the
   original's. The other 191 scenarios give the same result as the original.
2. **Faulted load.** When a load returns a faulted task, `.Result` throws an AggregateException.
   The promise of `transformToEditionAsync` rejects with the error itself
   (InvalidOperationException here). This affects 7 scenarios. A load that throws directly gives
   the same exception in both (InvalidOperationException, 2 scenarios).
3. **Local time of old dates.** This is the existing entry in docs/deviations.md. An unparsable or
   missing LastWritingDateTime of a WriterHeader becomes DateTime.MinValue, written in local time.
   .NET on Windows writes `0001-01-01T00:00:00+01:00` (the oldest registry rule of
   Europe/Berlin), and the port writes `+00:53` (local mean time from the IANA data). The oracle
   records its text of `XmlConvert.ToString(DateTime.MinValue, Local)`. For a document whose hash
   differs, the test replaces exactly that text by the port's, and only then compares the hashes.
   This affects `up-meta.aml`: 7 schema modes and 19 edition scenarios. In UTC both write
   `+00:00` and nothing is replaced.

How the time zone enters: the upgrader parses LastWritingDateTime with `DateTime.TryParse`. A
value with an offset is converted to local time. The setter of
SourceDocumentInformation.LastWritingDateTime writes local time with the local offset. The
downgrader reads the attribute as local time and writes it with
`XmlConvert.ToString(..., Local)`. Oracle and test must therefore run in the same zone; set
ORACLE_TZ and TZ as in `scripts/tz-check.mjs`. Apart from year 1, the dates of the cases are
after 1996, where Windows and IANA agree.

Text for docs/deviations.md:

> ### AMLEditionTransformer: synchronous transformation
>
> `AMLEditionTransformer.TransformToEdition` (Aml.Engine.Services) is synchronous. It blocks twice
> on the library service:
>
> - `LoadLibraryCatalogAsync(...).Result`, to replace external references by documents of the
>   new edition;
> - `LoadClassRepositoryAsync(...).Result`, to assign attribute types to the attributes of
>   classes.
>
> JavaScript cannot wait for a promise synchronously. The port's `transformToEdition` behaves
> exactly like the original as long as no load is needed:
>
> - a document that is not CAEX 2.15;
> - no external references, or no library catalog in the server profile;
> - no attributes in class libraries, or no class catalog in the server profile.
>
> Where the original would load, the port throws `NotSupportedException` and points to
> `transformToEditionAsync`. The document passed in is unchanged, the messages up to that point
> have been logged, and the schema transformer started for the call is unregistered again.
>
> `transformToEditionAsync` (not in the original) runs the same steps and awaits both loads. A
> load that fails is thrown as its own error, where `.Result` wraps a faulted task in an
> `AggregateException`.
>
> `test/services/transform.oracle.test.ts` compares `transformToEditionAsync` with the original
> in 297 scenarios. It also compares `transformToEdition` in 295 of them; 104 of these need a
> load and throw NotSupportedException.

## Port errors fixed

None. The port gave the original's result in every case. The comparison did surface behaviour of
the original that the port reproduces. Behaviour already listed in the port notes:

- auto update stays disabled after a transformation to `Unknown`;
- the role requirement skipped after a removal in the downgrader.

Behaviour the port notes did not list:

- downgrading the upgraded `up-roles.aml` fails with NullReferenceException;
- 3.0 documents without SourceDocumentInformation (DemoLib, ObjectReferences_AttributeTypeLib,
  plant) cannot be downgraded;
- a SourceDocumentInformation without LastWritingDateTime gives NullReferenceException, and an
  unparsable one FormatException;
- a document created with `New_CAEXDocument(Unknown)` is transformed to null in both directions;
- an attribute with an empty name gets the attribute type "attributeType";
- a link that does not end with ".aml" is skipped; the newest Ed2 version is chosen by
  SemanticVersion, ties keep the first one;
- the separator between alias and path of RefAttributeType is "@" (the decompiled source shows
  `{64}`).

## Not covered

Coverage of the area files (v8, this test only):

| File | Statements | Branches | Functions |
|------|-----------:|---------:|----------:|
| CAEXSchemaTransformer.ts | 100 % | 100 % | 100 % |
| transformator/CAEXSchemaUpgrader.ts | 100 % | 95.6 % | 100 % |
| transformator/CAEXSchemaDowngrader.ts | 97.3 % | 91.0 % | 100 % |
| amltransformer/AMLEditionTransformer.ts | 98.8 % | 88.4 % | 100 % |

Of the engine side, every statement of `transformToSchema` (both overloads),
`transformDocumentToSchema`, `finalizeSchemaTransformation()`, `finalizeSchemaTransformation(XElement)`,
`finalizeSchemaTransformationList` and `AMLSchemaManager.finalizeSchemaTransformation` runs, except
the two lines below.

What stays uncovered, and why:

- `AMLEditionTransformer.getDocumentLinkForNewEdition`, the return for a missing catalog:
  unreachable, because the only caller checks the catalog first.
- `lowerFirstChar` on an empty name (IndexOutOfRangeException): unreachable, because the inserted
  attribute type always has a name. The engine names an unnamed one "AttributeType"; see the
  `ed-emptyname.aml` scenarios, "Attribute Type attributeType created".
- `CAEXSchemaDowngrader.moveAttributeNameMappingObjects` and `moveInterfaceIdMappingObjects`,
  the return for a role requirement without mapping object: unreachable, because both callers
  pass only role requirements whose mapping object exists.
- Branches of the upgrader: a qualified attribute or interface whose role has no role requirement.
  This is unreachable, because the qualifiers are the roles of the supported role classes, and
  `convertSupportedRolesToRoleRequirements` has just created a role requirement for each of them.
- `CAEXDocument.finalizeSchemaTransformation(list)`, called with a list: the engine itself only
  calls `finalizeSchemaTransformationList`.
- `AMLSchemaManager.finalizeSchemaTransformation`, the return for AdditionalInformation: every
  caller skips AdditionalInformation before the call.
- `AMLLibraryType.loadExternalLibrary` transforms an embedded library through the registered
  ISchemaTransform when its schema differs from the document's. This is unreachable through the
  public API: every embedded library has the CAEX version of its resource folder (all 13 checked),
  and the folder is chosen by the schema of the document.
