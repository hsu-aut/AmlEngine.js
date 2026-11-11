# Coverage notes: services-lookup

Area: the LookupService of Aml.Engine.Services 4.3.1 (`src/services/LookupService.ts`) and its
tables (`src/services/lookup/*`), compared with the original running the same scripts.

Files: `oracle/ServicesLookupOracle.cs` (command `svc-lookup <corpusDir> <casesDir> <outDir>`),
`test/services/lookup.oracle.test.ts` (the JS twin), `scripts/gen-services-lookup.mjs` (seed 3682)
writing `test/services/lookup/` (9 documents and `scripts.json`). Output
`test/oracle-out/services/lookup.json`, one array of lines per script. Run both from the repository
root: the external references of the documents are relative to it.

    node scripts/gen-services-lookup.mjs test/services/lookup 3682 >/dev/null
    $ORACLE svc-lookup test/corpus test/services/lookup test/oracle-out/services

Oracle run about 5 minutes (most of it child processes started again after a stack overflow),
test about 3 minutes: 167 scripts (90 random, 77 hand-written), 755 410 compared lines, all
passing.

## Method

Every script opens one document (the 63 corpus documents, the 20 documents of `test/reads`, the 7
documents of `test/services/lookup`, or a new 2.15 / 3.0 document), registers a new LookupService
(`IsAutoUpdateEnabled` and `SupportsAutoUpdate` of the document on in every second script) and a
test external reference resolver that loads the file at the path of an external reference, and
runs its ops. One line per call, `label=result`, compared exactly:

- **sweep**: every public query of the service. On the document: `AllElementsWithIDs`,
  `AllElementsIdentifiedByCAEXPath`, `AllElementsWithCAEXPathReference` (with and without self),
  `AllElementsWithIDReference`, `AllElementsWithNameReference`, `AllElementsWithAliasReference`,
  `ElementsWithAliasReference` (empty, null, every alias of the document, a missing one), each with
  seven element names, `AllElementsWithInternalLinks`, `AllInternalElementsWithInternalLinks`,
  `ElementsWithInternalLinkRelations`, `InterfacesWithInternalLinkRelations`,
  `AllExternalDataReferences`, and `AllExternalInterfacesOfType` for the interface classes. For a
  sample of the objects (all of a small document, an evenly spaced subset of a large one, another
  subset in every sweep) and special values (null, empty, white space, missing, aliased, external
  and bracketed paths and IDs): `FindByID` and `FindByPath` (with and without alias resolution and
  with a type), `AllElementsWithIDs(id)`, `ElementsWithIDReference`, `ElementsWithCAEXPathReference`,
  `AllClassReferences(Deep)` of the document with element names, `IsReferenced`,
  `AllClassReferences(Deep)` of the object, the mirror and InternalLink queries and `IsMaster` by
  type, and the queries of the subtree of the object. The first sweep also calls every method with
  null arguments, on copies that are in no document and on a document the service does not know.
  Lookups are compared with their keys and groups in order, references with their class
  (PathReference, IDReference, AliasReference, CAEXNodeReference, ReferenceElement), object,
  attribute and value; `ReferenceElement` values (the text of the element) and its Equals,
  GetHashCode and ToString are compared for a few elements.
- **changes**: 40 random changes per document between the sweeps: the engine operations of
  `EngineOpsOracle.Apply` (new objects, instances, mirrors, links, base classes, removal, renames,
  moves, new GUIDs, queries through the ServiceLocator) and renames, removals and ID changes by kind,
  references set to paths, IDs, aliases and other strings (class, interface, InternalElement,
  attribute, attribute type, role, InternalLink sides), `InsertBefore`/`InsertAfter` of indexed
  elements, external references added and their aliases changed, attribute and interface mirrors,
  mapping objects and name references, `ICAEXReference.SetValue` on references the service returned
  and `ChangeNameAndReferences`. After every change the hash of the saved document; after every call
  the `ReferenceUpdated` events it raised (referenced element, reference, attribute, old and new
  value). Results and lookups of the service after every 10 changes (auto update).
- **registry**: `RemoveDocument`/`AddDocument`, `UnRegister` and `Register`, queries on an
  unregistered instance (it builds tables again and registers itself), documents unloaded
  (queries on the unloaded document and its objects, then the saved text loaded again), auto update
  switched.
- Hand-written scripts: re-insertion of indexed classes, InternalElements, attributes and links;
  renames, ID changes and removals of every kind with and without auto update; alias changes;
  cyclic documents; hierarchies made cyclic after the tables were built; name references of
  mappings unresolved and resolved again; elements with empty IDs; edge cases on new documents.

GUIDs and "now" time stamps are canonicalized (order of first appearance); results longer than
1000 characters are compared as SHA-256 prefix and length (`LOOKUP_FULL=1` on both sides compares
them in full). Nothing else is normalized.

Determinism: the change handlers of the service are weak delegates, so an instance that is no
longer registered goes on handling changes until the garbage collector takes it. Both sides keep
every instance of a script until its end and dispose it then. The document created by
`removeOther` is unloaded at once (a live document changes which document an unloaded node
resolves to).

## Calls that do not return

All scripts run in child processes (as in `ReadsOracle`): before each call the child writes its
number to a probe file; when the child ends with a stack overflow (the parent stops it as soon as
.NET reports it), the call is recorded as `!stackoverflow` and a new child goes on with that script
and leaves the call out. The port must throw `CyclicReferenceException` exactly there. A change
that does not return ends its script (`end=stopped`), and so does a call that does not return while
the tables of the document are being built (the port keeps the document registered as loading, so
the next calls are not comparable with a new process) and the 21st such call of a script (a table
with a cyclic node chain makes most later queries overflow). 335 calls do not return, 37 scripts end
that way; no call hangs. They come from:

- node chains of the ID table made cyclic by an element registered again (a class with an ID
  inserted again with `InsertBefore`/`InsertAfter`, or moved): every later `AllElementsWithIDs` and
  every change that walks the chain;
- class hierarchies in a cycle: `AllClassReferencesDeep` (both overloads),
  `AllExternalInterfacesOfType` of a class in the cycle;
- documents that are cyclic when the tables are built: the name references of overridden elements
  follow the base classes (`OverriddenElements` of the engine). So `NameReferenceTable.ChangeName`
  cannot follow a cycle of name references: such a cycle is not built. The scripts that make a
  hierarchy cyclic after the tables were built rename the overridden attributes and interfaces
  of the cycle; the original and the port give the same results (and the same "Collection was
  modified" exception with auto update).

## Port errors fixed

- `allClassReferences(CAEXObject)` threw `ArgumentNullException` for an object of no document; the
  null-conditional call of the original covers the whole query and gives an empty sequence.
- "Collection was modified": the tables kept their references in arrays, and `Dictionary`/`HashSet`
  of `src/system/linq.ts` did not check for changes during enumeration. The original fails when a
  caller changes references while it enumerates a lazy result of the service (the change handler
  adds to or removes from the list being enumerated), e.g. in `ChangeNameAndReferences`,
  `AssignNewGuidAsID(true)`, `InsertBefore` of an element with name references, and in
  `NameReferenceTable.ChangeName`. Now `List` of `src/system/linq.ts` (and Dictionary and HashSet)
  check the version as .NET does (checked against .NET 8 for every change method), and the tables use
  it where C# has `List<T>`.

## Deviations

- Calls that do not return in the original throw `CyclicReferenceException` (above).
- Reference inequality of boxed strings (docs/deviations.md): `SetAttributeValueCmd` compares old and
  new value by reference. When `ChangeNameAndReferences` sets the same path string on an element
  that is referenced twice (a duplicate reference left by an earlier "Collection was modified"),
  the original sees the same string instance and raises no change, the port raises it and the next
  enumeration step fails. Seen in two scripts of the engine mutation package run with the
  LookupService registered (`node scripts/services-check.mjs lookup`: 2 of 1340 comparisons).

## Not covered

Coverage of `src/services/LookupService.ts` and `src/services/lookup/*` by the test: 92.3 % of the
statements, 94.4 % of the functions (85.8 % of the branches). What is left:

- Members the original never uses: `ClassTable.AllClasses()` without root, the `CAEXNode` indexer
  `this[string]`, `CAEXNodeReference.Attribute` and its base `Update`, `AliasReference.IsIDReference`,
  `AliasTable.AliasReferences`, `LookupTables.AttributeValue`, the constructor of `LookupTables`
  without document, `LookupTables.AddNameReference` with an attribute name, the private
  `LookupService.ExternalReferences`; the members of the record struct `ElementWithReference` that
  the tables do not call (Deconstruct, conversions, equality, ToString).
- Branches the callers exclude: the `ANY` and default cases of the chain walkers of `CAEXNode`,
  `IDReference.UpdateAttributeReference`/`UpdateInternalLinkReference` for references of another
  kind, `IDReference.ReferenceName` of an IDReference that is neither an attribute nor a 2.15
  InternalLink, `ReferenceElement.SetValue` and the attribute value of a `ReferenceElement` (its
  attribute name is a tag name), `ReferenceElement.GetHashCode` with a null element, the
  resolution of an unresolved name reference in `NameReferenceTable.ChangeName` (the original asks
  the element overload of `ReferencedElement`, which resolves only NewVersion/OldVersion), the `Alias`
  set to null (a required attribute: the engine writes ""), `HandleAdded` without element, the empty
  path of `allButLast`.
- Port only: `raise` of the `ReferenceUpdated` event object (C# events have no raise accessor).
