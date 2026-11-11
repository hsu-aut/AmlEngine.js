# Coverage notes: services validator

Area: `src/services/ValidatorService.ts`, `ValidationElement.ts`, `ValidationKey.ts`,
`ValidationResults.ts`, `ValidationTypeEnum.ts`, `RepairTypeEnum.ts`, `RepairTypeEnumConverter.ts`
and `XmlConvert.verifyXmlChars` in `src/system/XmlConvert.ts`.

Files: `oracle/ServicesValidatorOracle.cs`, `test/services/validator.oracle.test.ts`,
`scripts/gen-services-validator.mjs` (seed 3682, deterministic) writing the cases to
`test/services/validator/`. Oracle call (run in the repository root, the working directory becomes
`<root>` in the output):
`svc-validator test/services/validator test/oracle-out/services`
It writes `test/oracle-out/services/validator.json` and the repaired documents to
`test/oracle-out/services/validator-docs/`. The oracle runs in about 75 s (half of it waits for the
refused ftp connections), the test in about 130 s on an idle machine (up to 5 minutes while other
suites run). The test has 106 tests; all pass.

## Cases

- 37 generated documents (CAEX 3.0 and 2.15): IDs (duplicates, missing, empty, white space, braces,
  parentheses, N and X GUID formats, upper case, path separators, library names, IDs in classes),
  ID references (InternalLinks resolved, unresolved, empty, to an InternalElement, out of the scope
  of a class or interface class, mirrors of InternalElements and ExternalInterfaces,
  InterfaceIDMappings in and out of scope), paths (duplicate classes and libraries, referenced and
  unreferenced, unresolved and empty RefBaseClassPath, RefBaseSystemUnitPath, RefBaseRoleClassPath,
  RefRoleClassPath and RefAttributeType, references to the wrong kind of class, aliases resolvable
  and not, an owner named like the path, libraries and hierarchies without a name), names (empty,
  duplicate siblings, attributes against nested classes, facets, invalid XML characters set after
  loading: controls, U+0000, U+FFFE, lone and reversed surrogates), meta data (no or wrong
  SchemaVersion, no AutomationML version, no SourceDocumentInformation or WriterHeader), external
  references (existing and missing files relative to the document, escaped and unescaped spaces
  and umlauts, backslashes, rooted, fragments, absolute paths and file URLs, http, https, urn,
  empty and blank paths, empty and duplicate aliases, wrong and short AMLEd editions, version
  references, ftp), external data connectors (file URLs to files at a relative position, missing
  files, fragments, http, empty values, non-connector interfaces), cardinality, direction and
  category of InternalLinks, name mappings (AttributeNameMapping, InterfaceNameMapping), and 9
  seeded random documents.
- The 63 corpus documents, loaded from their files (relative references resolve in test/corpus).
- Every document as an AutomationML container: the document as root part and the parts of the
  case (library and any-content parts with plain, escaped and non-ASCII names, duplicates, names
  the package rejects).

## What is compared

Per document, without and with LookupService registered (1 023 calls, 30 987 results):

1. `ValidateAll(doc)`, `ValidateAll(doc, true)`, `ValidateAll(doc, null, false)`,
   `ValidateAll(doc, container, true)`, `ValidateAllWithoutStrictID(doc)`,
   `ValidateAllWithoutStrictID(doc, container, true)`, `ValidateAliasReferences(doc)` and
   `(doc, true)`, and `ValidateAll` of the document loaded from a string (no file path). Corpus
   documents take 5 of the calls without and 2 with LookupService. Per result: the element (local
   name, Name, ID, CAEX path, wrapper type), the key of the ValidationKey, the validation type, the
   repair options, the validated attribute, the information text, the long description, the repair
   result and `RepairTypeDescription` of the options. Also: the exception of a failing enumeration,
   a second enumeration and `Equals` against it, the saved document after the enumeration (hash,
   and the text for generated documents), the ID and path tables of the query service before the
   call, after the call and after the enumeration.
2. A partial enumeration (InitValidation at the call, FinalizeValidation only at the end) followed
   by complete ones, with the table states.
3. Every ValidationResults filter (28) as indexes into the results; `ReValidate` of every result;
   `Equals` of all pairs of the first 60 results, with null, a string and itself; whether
   `GetHashCode` throws.
4. `IDValidation` (null, empty, own, another and an unknown ID) and `NameValidation` (own, null,
   empty, another, a fresh and a sibling's name) for up to 60 objects per document, and for a
   removed InternalElement (7 960 lines).
5. Repair of every repairable result in order, without and with UniqueNameService (and with
   LookupService for the generated documents): return value, repair text, `ReValidate` after the
   repair, the saved document (hash, the full text on a mismatch) and the remaining issues
   (7 479 repairs). `RenameElement(GenerateXmlName)` of every name issue.

Sweeps:

- 96 file references with `CanLocateFile` (container null and a container; documents loaded from a
  file, from a string, new, and named by a root path), `NormalizeFilePath` and `FilePathFromValue`
  (cases directory, empty and relative directory): Windows paths with trailing dots and spaces,
  drive-relative, UNC and device paths, URL schemes, invalid characters, null characters, the Uri
  length limit.
- `XmlConvert.VerifyXmlChars` for 82 strings: valid text, every invalid character class, lone and
  paired surrogates at every position, null: result or message, line number and position.
- `RepairTypeDescription` for 296 values; ValidationKey (32 keys: members, `ToString`, `Equals`,
  equal hash codes); the ValidationElement API (defaults, `NOT_REPAIRED`, `Equals`, `GetHashCode`,
  `CAEXElement` of non-CAEX elements); every repair method on 21 targets with 24 option values,
  without and with UniqueNameService (1 008 repairs); null arguments; Register and UnRegister.

Deterministic output: absolute paths of the working directory are written as `<root>`; GUIDs and
timestamps of "now" of repairs are canonicalized as in `EngineOpsOracle`; surrogates are written as
`\uXXXX`. The original keeps its documents in a table of weak references (`XDocumentWrapper`):
the oracle keeps every document referenced while its objects are used, otherwise objects of a
collected document see no document and the results depend on the garbage collector (seen in the
first oracle runs). The HTTP client of `ExternalReferenceResolver` is replaced by one that fails
every request.

## Deviations

- http(s) references (docs/deviations.md, "ValidatorService: references over the network"): the
  port never sends a request; the oracle makes every request fail, so both take the same path.
- ftp references: the original fails with `WebException` out of the enumeration (the oracle
  connects to a closed local port); the port throws `NotSupportedException`. The test expects the
  port's exception for exactly the document `v-extrefs-ftp.aml` and the `ftp` line of the sweep.

## Port errors fixed

- `src/engine/amlobjects/internal/NetPath.ts`: `getFullPath` returned the working directory for an
  empty path and did not follow GetFullPathNameW on Windows (trailing dots and spaces, trailing
  separators, drive-relative paths of another drive, UNC and device roots, length limits); it now
  throws as .NET for null, empty, blank and null characters (regression lines in the file reference
  sweep; `test/engine/amlobjects.oracle.test.ts` passes).
- `src/system/exceptions.ts`: `PathTooLongException` added (used by `getFullPath`).

## Findings

- `ValidateAll` of `test/corpus/legacy-caex215.aml` writes the InternalElement IDs without braces in
  the original as well (same document hash after the enumeration); the open question of the port
  notes is answered.
- `CyclicDependency` and `MergableAliasReferenceValidation` are never produced by the validator.

## Not covered

Statements of the area that the cases do not reach, and why:

- `ValidatorService`: `fileExists` and `filePathFromValue` without a file system (browser only);
  `canLocateFile` with a container when "/" + reference is no relative URI and the http(s) branch
  that returns true (a server answering, not possible without network access in the port);
  `filePathFromValue` returning '' for an empty local path (an absolute file URI always has one)
  and when the full path is no URI (on Windows `GetFullPath` throws before the Uri length limit
  is reached); the issues of elements with an empty CAEX path (`AllElementsIdentifiedByCAEXPath`
  has no empty key, also for libraries and hierarchies without a name);
  `facetNameIsUsed` without a parent and the facet message of `nameValidation` (a facet is an
  InternalElement, so a sibling facet with the name is found first by `nameIsUsed`);
  `isInstanceInClass` returning false (only InternalElements, ExternalInterfaces and
  SystemUnitClasses have mandatory IDs, and SystemUnitClasses are skipped); "incorrectly formatted
  ID" (`IsGUID(key, true)` is true for every non-empty key, as in C#); the rethrow of an exception
  other than XmlException after `verifyXmlChars`; the null checks of `caexObject` in the reference
  loops (the lookups always set it); an empty ID reference of an InternalElement or
  ExternalInterface (the lookups give empty values of those elements as path references); a
  `RefBaseClassPath` of an AttributeType (the lookups do not report it as a path reference).
- `ValidationElement.renameElement`: `result = false` (BeginService registers a UniqueNameService
  when none is registered).
- `RepairTypeEnumConverter`: the `ToString` branch (`HasFlag(None)` is always true) and the private
  constructor; `ValidationResults`: the private constructor.
- `NetPath.windowsFullPath`: a UNC working directory.

Coverage of the area files (statements / branches / functions / lines):

| File | Stmts | Branch | Funcs | Lines |
|---|---|---|---|---|
| ValidatorService.ts | 95.82 | 87.23 | 97.72 | 95.80 |
| ValidationElement.ts | 99.00 | 76.71 | 100 | 99.00 |
| ValidationKey.ts | 100 | 100 | 100 | 100 |
| ValidationResults.ts | 100 | 100 | 98.27 | 100 |
| ValidationTypeEnum.ts, RepairTypeEnum.ts | 100 | 100 | 100 | 100 |
| RepairTypeEnumConverter.ts | 97.50 | 92.50 | 66.66 | 97.50 |

The uncovered branches are mostly `?? ''` of C# string concatenation with values that are never
null there.
