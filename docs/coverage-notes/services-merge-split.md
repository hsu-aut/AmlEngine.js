# Coverage notes: services merge and split

Area: `src/services/MergeService.ts` and `src/services/SplitService.ts` (Aml.Engine.Services
4.3.1), port notes in `docs/port-notes/services-merge-split.md`.

Files: `oracle/ServicesSplitOracle.cs` (command `svc-split <casesDir> <workDir> <outDir>`),
`test/services/split.oracle.test.ts`, `scripts/gen-services-split.mjs` (seed 3682, deterministic)
writing `test/services/split/cases.json` and 19 documents in `test/services/split/docs/`.

    node scripts/gen-services-split.mjs test/services/split 3682
    dotnet oracle/bin/Release/net8.0/Oracle.dll svc-split test/services/split test/oracle-out/services/split-work test/oracle-out/services/split

Oracle run about 35 s, test about 100 s (190 s with coverage): 253 tests, all passing.

## What the oracle compares

A case registers services, loads documents and runs a script of operations. Every case runs in a
fresh work directory `<workDir>/<case>` that is also the current directory, so relative paths and
the external reference resolver resolve there (the oracle writes to `split-work`, the test to
`split-work-js`). Recorded and compared exactly:

- per operation the result (split points as `kind|name|ID|CAEXPath`, the returned document as
  `doc|FilePath|FileName`, the merge result and every protocol line, the files of the work
  directory, the registered services, undo actions, exceptions as `!Name(ParamName)`) and a hash
  of the canonical text of all documents of the case after the operation;
- at the end the file path and the canonical text of every document (source, split documents,
  reloaded documents), every file in the work directory (relative path and canonical text) and the
  keys and types of `ServiceLocator.ServicesDictionary` (read by reflection in the oracle).

Canonical text: the work directory (both separators) becomes `<DIR>`, timestamps of the day of the
run `NOW`, GUIDs `G1, G2, ...` in the order of their first appearance (Split and CreateMirror make
new IDs). After every case all services are unregistered and what the UnRegister methods leave
behind (the resolver key `ExternalReferenceResolver`) is removed, so cases are independent.

Cases (253, 2208 operations, 463 final documents and 520 files, 334 456 compared lines):

- corpus (116): every document of `test/corpus` with two random scripts (one for documents over
  150 kB): split points on libraries of all four kinds, instance hierarchies and elements, removed
  and deleted split points, Split with either overload to a random path, a second split, Merge
  back through the external reference (resolver) or from a stream (saved file or returned
  document), with and without autoTransform, undo of the changes;
- generated (40): four such scripts on ten random documents (six CAEX 3.0, four CAEX 2.15) with
  libraries referencing each other, alias references to existing ExternalReferences, attribute
  types, mirrors, groups and InternalLinks crossing the split borders (no cyclic inheritance: the
  original overflows the stack on it);
- services (9): the same script with no services, UndoRedoService, UniqueNameService, both,
  LookupService, a registered ExternalReferenceResolver, all three, CAEXSchemaTransformer, and
  every load mode (string, absolute file, relative file, forward slashes);
- paths (26): both overloads to `a\part.aml`, the directory of the source, another folder, a
  sibling folder with the same prefix (`a2`), forward slashes, a bare file name, `a/..`, a missing
  folder, a web address, a file URI and the source file itself;
- API cases: SetSplitPoint with elements below and above existing split points and libraries
  beside them, RemoveSplitPoint, SplitPoints(null), deleted elements and disposed documents, an
  unregistered and re-registered service, every argument check of both overloads, Split without
  split points, the second overload with a split point of another document, an instance hierarchy,
  null, a folder and an invalid file name, existing files, the alias of an existing reference,
  saving and reloading, duplicate IDs inside and outside the split element and an element without
  ID, LookupService with auto update enabled;
- Merge (47): a target and an external document in both CAEX versions with libraries of the same
  name (with, without and with unparseable versions, nameless libraries), master mirrors of the
  alias (GUID and other IDs, two mirrors of one master, a mirror in a group, a mirror directly
  below an instance hierarchy), external references the import adds itself, alias collisions,
  version references by version and by description, the path of the target; missing files, a
  missing path, an empty alias, both overloads with every service set, merging twice from one
  file, the other CAEX version with autoTransform off, on and default, with and without a
  registered transformer; streams that are null, not XML or not CAEX; a null document; registered
  MergeService and ValidatorService.

## Deviations

None in the services. Two limits of the comparison:

- Merges through an ExternalReference whose path is a web address are not run (the result is
  `network` in both harnesses): the original loads the file from the internet, the port's
  synchronous resolver takes the path of a failed request (docs/PORTING.md, Aml.Engine.Services).
- The expected outputs come from .NET on Windows and the cases use Windows paths, so the test runs
  on Windows only. On Unix the paths Split writes follow `NetPath` on Unix (`./part.aml`); .NET on
  Linux is no reference (scripts/tz-check.mjs).

## Port errors fixed

- `src/engine/caex/CAEXDocument.ts`: `saveToFile` and `saveToFileAsync` threw the Node error of a
  failed write; now DirectoryNotFoundException (missing folder), IOException (on Windows a name
  with `:` after the drive or `"*?<>|`, e.g. a web address or file URI given as path) and
  UnauthorizedAccessException (a folder, no access), as FileStream throws them. `IOException`
  moved to `src/system/exceptions.ts` (re-exported by `Package.ts`), `DirectoryNotFoundException`
  added there. Regression cases: `path-9/10/11-split1`, `split1-points`.

## Coverage

`MergeService.ts` 95.4 % statements, 100 % functions; `SplitService.ts` 97.5 % statements, 100 %
functions (together 96.6 % statements, 86.2 % branches). Not covered, unreachable:

- MergeService `merge` (private): the `return false` after ImportLibraries,
  ImportInstanceHierarchies and ImportExternals; the three always return true.
- `externalLibrariesForImport`: the replacement of an existing library. Both versions are parsed
  from the library of the external source (error of the original, kept), so `result > result2` is
  never true.
- `loadExternalSource`: "Couldn't identify schema version from files." `SchemaVersionString` is the
  description of the schema enumeration ("2.15" or "3.0"), it always parses.
- `merge` (stream): `val === null`; LoadFromStream returns a document or throws.
- `replaceMirrorWithInstanceHierarchyContent`: a mirror whose parent is no CAEXObject.
- SplitService `listRemove` returning false and `listContains`/`listRemove` with a null item in the
  list: Remove is only called after Contains, and SetSplitPoint(null) throws before adding.
- `csSubstring` argument errors: the start is the length of a prefix the value starts with.
- `saveSplitDocument`: the last `return getFullPath` (an absolute URI that is a file but not
  absolute).
- `?? ''` of reference values that are null: the queries return references with values only.
