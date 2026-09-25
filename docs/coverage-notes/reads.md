# Coverage notes: reads

Area: the read-only API of the engine beyond `test/engine/dump.ts`: every public property of every
wrapper type, the read methods of the wrappers and of the extension classes, sequences and their
indexers, `QueryService`/`QueryResult`, `CAEXPathBuilder`, `AMLEngineAdapter`, `DocumentStreaming`,
the load/save variants and `Validate()`, compared with Aml.Engine 4.5.2 on every object of every
document, including the mutations some reads make.

- Oracle: `oracle/ReadsOracle.cs` (command `reads <outDir> <file.aml|dir>...`, one
  `<name>.jsonl` per document)
- JS runner: `test/engine/reads.oracle.test.ts` (one test per document; all 82 pass)
- Synthetic inputs: `scripts/gen-reads.mjs` (seeded, seed 4711) -> `test/reads/*.aml`
  (`test/reads/** binary` in `.gitattributes`)
- Oracle output: `test/oracle-out/reads/` (82 files, about 6 million recorded calls, 550 MB;
  gitignored); both calls appended to `scripts/oracle.sh`. The oracle needs about 20 minutes, the
  JS test about the same (`MPS500_Integrated` alone takes 6 minutes).
- Debugging: `READS_PROFILE=1` prints the time per member and the members that changed the
  document; `READS_TRACE=1` prints every call; `READS_TRACE_IDS=1` (both sides) prints where new
  IDs are generated; `READS_OUT=<dir>` points the JS test at another oracle output;
  `READS_DUMP=<dir>` writes the JS results next to the recorded calls.

## Method

The oracle loads the document with `LoadFromString`, takes a snapshot of all elements for which
`CreateCAEXWrapper()` returns a wrapper (document order), and records every call as one JSON line
`[target, kind, member, args, result]`. The JS runner replays the lines in the same order on the
same document and compares each result: a target is an index into the snapshot (the wrapper is
created afresh for every call on both sides), `[index, property]` for a sequence returned by a
property, `"doc"`, `"qs"` (`ServiceLocator.QueryService`) or `null` for static methods; arguments
are strings, booleans, numbers, snapshot objects/elements, class constructors (`Type` and generic
type arguments, passed as last argument in JS), enum values, string arrays, name/value tuples.
Member names follow the naming rule of `docs/PORTING.md` (`Name` of static classes is `name_`,
`AttributeTypeType.IsInherited(owner)` is `isInheritedIn`).

Results are encoded identically on both sides: wrappers as runtime type plus element position,
elements/attributes/documents by position, sequences with their type and items, lookups as key and
items, `ICAEXReference` as attribute, element and value, enums by name, doubles in round-trip
format, exceptions as `!ExceptionName`. GUIDs are numbered in order of appearance and "now"
timestamps replaced (only in results, never in arguments). New IDs come from a counting
`ICaexIDService` registered on both sides (restarted per document), so that arguments taken from
the walked document (paths containing IDs the reads generated) are the same in JS; IDs asked for by
the oracle's own bookkeeping (a wrapper without node for `First` of an empty sequence asks for an
`OriginID`) come from a second counter.

The document is watched with `XDocument.Changed`; after every object whose reads changed it, the
hash of the canonical saved text is recorded (`#`), and the full saved text at the end (`final`),
so a getter that mutates in the original must mutate identically in the port (and a mutation of the
port alone shows at the next checkpoint or at the end). Measured mutating reads: `PathPart(…,
useId: true)` and `InternalLinkReferencePath` (assign or unbrace IDs), creating the wrapper of a
`SourceDocumentInformation` with empty `OriginID` (the snapshot), `AllExternalDataReferences`.

## What is covered (per document)

1. **Load/save**: `LoadFromString`, `LoadFromFile`, `LoadFromBinary`, `LoadFromStream` and the four
   async variants; per variant `FilePath`, hashes of `SaveToStream(true/false)`,
   `SaveToFile(true/false)` bytes and `SaveToStreamAsync` (whitespace handling of the string
   variant differs from the others; both reproduced). The loaded documents are unloaded afterwards
   on both sides (the static document table affects `CAEXDocument.Document(node)` lookups).
2. **Document level** (before and after the walk): all `CAEXDocument` properties, query table
   state, `XName`, `SchemaToString`, `AMLSchemaManager(node)`, `Document(node)`,
   `IsExtensionDocument`, `HasLibraries`, `ExternalReferenceFromAlias`, the `QueryResult` tables
   (`AllElementsIdentifiedByCAEXPath`, `…WithAliasReference`, `…WithCAEXPathReference`,
   `…WithIDReference`, `…WithIDs`, `…WithNameReference`, `AllInternalElementMasters/Mirrors`,
   `ElementsWithInternalLinkRelations`), `IQuery.AllClassReferences(Deep)(doc, path, name)`,
   `ClassIsDerivedFrom<T>(doc, classPath, basePath)` for the four class kinds.
3. **Every object**: all public instance properties of its runtime type by reflection (except
   attribute values: `AttributeValue`, `DefaultAttributeValue`, `ValueAttributes`, package
   "values"), e.g. `RoleReferences`, `Roles`, `AttributeAndDescendants`, `…AndInherited`,
   `InheritedAttributes`, `IsInherited`, `IsMaster`/`IsMirror`/`Master`, `AssociatedObject`,
   `CAEXParent`, `CAEXSequenceOfCAEXObject`, `RelatedObjects`, `MappingObject`, revision and
   source information; indexers of libraries by name and name array.
4. **Sequences** returned by properties: all properties (`Count`, `First`, `Last`, `Exists`,
   `ElementName`, `CAEXOwner`, …), `Item[int]`/`At` for 0, last, count, -1, `IndexOf`,
   `Item[(Name, Value)]`, `Item[name]` (names, paths below the first element, empty, unknown) and
   `Item[string[]]`.
5. **Methods** (274 specs in `ReadsOracle.Specs`, every applicable one on every object, with
   argument pools derived from the object and the document: own reference strings and path, class
   paths, IDs, aliases, related objects, `null`, empty and unknown values, both CAEX schemas, up to
   4 combinations per method): `CAEXChild(ren)`, `GetXAttributeValue`, `Equals`, `CAEXSequence(child)`,
   `Container<T>`, `CAEXPath`, `ToString`, `HasXxxReference`, `HasGenericRoleClassReference`,
   `GetReferenceHierarchy`, `LowestCommonParent`, `SupportedRoleClassWithName`,
   `GetInheritedSupportedRoles`, `GetReferencedSystemUnitClass`, `IsAssignableRoleClass…`,
   `RoleClassMappingElements`, `CanAddReference`, `PathAreEqual`, `InterfaceFromAttributeValue`,
   `GetCAEXAttribute`; all read methods of `AMLEngineAdapter` (32), `CAEXBasicObjectExtensions`
   (incl. the generic `Ancestors/Descendants/FindCaexObjectFromId/FindReferencedClass/FirstAncestor/
   GetParent<T>`), `CAEXDocumentExtensions.FindByID/FindByPath` with all parameters and types,
   `CAEXFileTypeExtensions.FindFastByID/Path` (plain and typed), `GetAMLInfoFromFilename`,
   `CAEXObjectExtensions`, all of `CAEXPathBuilder` (35 functions on the real reference strings and
   paths of the object), `ExternalInterfaceTypeExtensions` (20), `InheritanceExtensions`
   (`ClassIsDerivedFrom` all overloads, `IsDerivedFrom…`), the `…Descendants` extensions,
   `InternalElementExtensions`, `InternalLinkTypeExtensions` getters, `ObjectWithAttributes.
   GetAttribute`, `ObjectWithBaseClass` (14 read methods), `ObjectWithExternalInterface`,
   `StringExtensions`, `CAEXSequenceExtension.OfInterfaceClass`, `AttributeTypeTypeExtensions`,
   `CAEX_CLASSModel_TagNames.TagName`, all `IQuery` methods of `QueryService` (FindByID/Path, ID and
   path references, mirrors, internal links, `IsReferenced`, …) and `QueryResult` per object.
6. **Streaming**: `ReadExternalReferenceType` (file and stream), `StreamElementWithName` for 9
   element names × 3 `canClose` predicates × (file, stream), `New/OldDocumentVersions`; the JS
   async variants (file) are compared with the same expected result.
7. **Validate()** after the walk (result and messages).

Documents: the 63 corpus files and 19 synthetic ones (`broken-refs`, `aliases` (with an existing
and a missing external file and duplicate aliases), `cyclic` (self and two-class cycles in all four
class kinds), `names` (`/ . : [ ] @` in names, bracket escaping), `mirrors` (mirror of mirror,
broken and self mirrors, interface and attribute mirrors), `duplicates` (names and IDs), each for
CAEX 3.0 and 2.15, the external library `ext-lib.aml` and 6 random documents mixing all of these).

In documents with more than 600 objects the sequence probes, the methods and the properties that
scan the whole document (`IsMaster`, `CAEXSequenceOfCAEXObject`) run on about 150 evenly spread
objects per wrapper type plus all libraries and hierarchies; the members that scan all internal
links of the document (`IsRelated`, `Related…`, `InternalLinksTo…`, `LowestCommonParent`) on 8
objects per type; the document level reference queries (`R` specs) on at most 400 objects. All
other properties run on every object.

## Bugs found in the port (fixed)

- `src/engine/caex/AttributeTypeType.ts` `container(type)`: returned the attribute sequence for
  every type assignable from `AttributeType`; C# `Attribute as CAEXSequence<T>` is null unless `T`
  is exactly `AttributeType` (generic classes are invariant).
- `src/engine/caex/AttributeFamilyType.ts` `container(type)`: the same for the `AttributeType`
  sequence (only `T == AttributeFamilyType`).
- `src/engine/services/QueryService.ts` `allElementsWithInternalLinks`: `CAEXEnumerable<
  SystemUnitClassType>` yields `null` for parents that are no SystemUnitClassType (an
  InstanceHierarchy holding InternalLinks); the port returned the InstanceHierarchy wrapper
  (also affects `AMLEngineAdapter.AllElementsWithInternalLinks` and `GetAllElementsWithInternalLinks`).

## Deviations and limits

- **Cyclic inheritance**: in the original, 39 members recurse without end on classes that inherit
  from themselves (stack overflow, which ends the .NET process) or do not return (endless loops,
  e.g. `AllElementsWithNameReference`, `HasRoleClassReference`, `DefaultValue` of attribute types
  in a cycle, `IsFacet`/`IsGroup`/`IsPort`). The oracle runs `cyclic-*` documents in a child
  process, adds the member that crashed or ran longer than 1.5 s to a skip list and starts again;
  skipped calls are recorded as `!skip` and not replayed (2842 and 3290 calls). All other members
  are compared on these documents too. What the port does for the skipped members (JS: stack
  overflow becomes `RangeError`, reported as `StackOverflowException`) is not compared.
- The async streaming variants of the port with a stream (bytes) argument have no C# counterpart
  and are not called; the file variants are compared with the synchronous C# result.
- `SaveToFile` writes the target file name into the document (`FileName`); both sides use the
  same name (`reads-save.aml` in a temp directory). File system errors of the test machine
  (EBUSY) are retried in the JS runner.

## Not covered

- Attribute values and typed values (package "values"), write operations (package "mutations"),
  AmlObjects (package "amlobjects").
- `DocumentStreaming` and `ExternalReference.ExternalDocument` over http(s) or GitHub.
- Members that need a second document as argument (only the external documents resolved by alias
  appear); AMLX containers.
- In large documents only the sample described above runs the methods and sequence probes.
