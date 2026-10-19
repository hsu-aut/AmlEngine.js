# Coverage notes: amlobjects

Area: `Aml.Engine.AmlObjects`, `AmlObjects.Extensions`, `AmlObjects.MimeType`, the standard
libraries (`AMLLibraries` resources, the `AutomationML*Lib` static classes, the `*LibType` classes,
`AMLLibraryType`) and `AutomationMLContainer` (AMLX, the System.IO.Packaging port under
`src/engine/amlobjects/packaging`).

Files: `oracle/AmlObjectsOracle.cs`, `test/engine/amlobjects.oracle.test.ts`,
`scripts/gen-amlobjects.mjs`, inputs in `test/amlobjects/` (`ops.json` generated with seed 3682,
`docs/objects30.aml`, `docs/objects215.aml`, `data/*` part contents, and two AMLX packages in
`amlx/`: `plant.amlx` from the examples of AMLMcp, `Opc.Ua.Di.NodeSet2.xml.amlx` from the AML
libraries published with OPC 10000-83 (UAFX); the other five packages of that set have the same
structure).
Oracle call appended to `scripts/oracle.sh`; `test/amlobjects/** binary` in `.gitattributes`.

The test runs in about 100 s: 261 tests, all passing.

## What is covered

1. **Read sweep** (65 documents: the 63 corpus files and the two input documents, 32 203 recorded
   lines). Per document: AutomationMLVersion (AMLFile, CAEXFileType and CAEXDocument extensions,
   `AMLFile.Create`), MaximalAMLVersion, IsValidAutomationMLVersion (12 strings), WriterHeader,
   GetMetaInformation (all and by ID), GenericAdditionalInformation, the static and instance
   AdditionalInformation classifiers, IsLoaded of all library types, the BPR libraries; then for
   every CAEX wrapper in document order: IsAMLFacet/Group/Port, IsDocumentElement, GetLanguages,
   facet info (Assigned/NotAssigned parent attributes and interfaces, SourceAttribute,
   SourceInterface, CAEXSequence), group info (AssociatedFacet, AssociableFacets,
   AssociableFacetsOfMirrorElements), AMLSystemUnitClass facets/groups/ports, IsAMLObject,
   DocumentElements, IsFacetInterface, FrameAttribute/RefURIAttribute/RefTypeAttribute,
   AttributeAndDescendants, list attribute predicates and items/values, IsFacetAttribute,
   IsRefURI/IsRefType, IsFrame/IsFrameAttribute and the frame values, all RefURIAttributeType
   properties (TheUri, FilePath, ReferencedNode, IsAbsoluteUri, IsFile, UriReferencesAreEqual) for
   23 URI shapes, the 12 attribute type predicates, the 16 + 3 role predicates, the 19 + 7 + 1
   interface predicates, GetSignatureHeader/GetXMLSignature; finally the (mutating) document
   version reads and a hash of the saved document.
2. **Random operation scripts** (120 scripts of 40 operations, 4800 steps, both CAEX versions,
   fresh documents, 13 corpus files and the input documents): result and document hash per step,
   final document text. Operations: AddFacet/AddGroup/AddPort, AMLFacet/AMLGroup/AMLPort.Create
   with alias, facet attribute and interface sequences (Append, Append(name), Prepend,
   Prepend(name), Insert, AMLFacet.Insert/Import), group Insert/Import and the group sequence,
   AssociatedFacet with PropertyChanged, port Insert/Import, New_FrameAttribute (object and
   extension), FrameValues property propagation, FrameAttributeType.Create,
   ValidateAndRepairFrameDatatypes, New_RefUriAttribute, RefURI/RefType Create, MakeListAttribute,
   AddListItem, ConvertToListAttribute, CreateListAttribute, SetMetaInformation (strings, object,
   extension and AMLFile), Delete/Replace/Get/ClearMetaInformation,
   SetMetaInformationStandardAutomationMLLibrary, SetSourceDocumentInformation (arguments,
   Properties), SetMetaInformation on a SourceDocumentInformation, the AutomationMLVersion setter,
   all DocumentVersions methods and the DocumentVersion sequence, signature header methods,
   AddLanguage, AddDocumentElement, AddDocumentReference, AddDocumentElementRole, all Make*
   role and interface helpers, all library loaders, and the read sweep of a random object.
3. **Fixed cases** (26 cases, 2071 lines), each for CAEX 3.0 and 2.15 where it applies: public
   string constants of all classes (reflection in C#, looked up by name in TS), RelationshipType
   (statics, GetAnyContent, CompareTo), ClassReferenceWithAlias, FrameValues and its events,
   frame attributes, facets/groups/ports including null and wrong-type arguments, meta
   information and source document information, AutomationMLVersion, document versions with all
   version string error branches, list attributes, signatures, external data (BPR) elements,
   library loading for 5 AML versions × 10 loaders, derived predicates with the libraries
   loaded, null arguments of every extension, detached objects, `AMLLibraries` resource lookup
   (12 names × 10 AML versions × 6 CAEX versions, plus the obsolete wrappers; hashes of the
   bytes), facet sequences on 13_Facet.aml.
4. **MimeTypeMap** (981 lines): for every key of the table in dictionary order GetMimeType,
   GetExtension, IsXmlText and GetKnownExtensions, plus edge inputs (null, empty, white space,
   case, without dot) and the identity of the returned live lists.
5. **AMLX** (13 scenarios, 1884 lines, 18 packages): container on a stream and on a file, every
   Add* method (stream and file overloads, with and without package/root relation, MIME type from
   the extension, positioned stream, empty part, escaped and non-ASCII names), the complete
   description (parts, content types, compression options, part contents, part and package
   relationships, RelationShipExists, GetPartsByRelationShipType, GetRelationShipsByType,
   GetRelatedParts with and without type, CheckRelatedParts, GetRelatedPartByUri, PartExists,
   GetPart, RootDocumentStream loaded as CAEXDocument, RootDocumentPath), Save/Flush,
   Extract/ExtractAllFiles, Dispose, reopening read-only, FileMode.Open/CreateNew/OpenOrCreate,
   FileShare, both RelinkPart overloads, replacing the root document and a library, the five
   compression options, the empty package, errors (duplicate parts, 30 part URI / content type
   cases each in its own package, relationship ID and type errors, external relationships,
   missing targets, read-only containers, closed containers, non-zip and empty streams), and the
   workspace packages (read, unchanged round trip, update with an added library, deletion of the
   root through a stream). Every package written by System.IO.Packaging is compared with the one
   the port writes: zip entry order, names, version made by/needed, flags, method, sizes (the
   compressed size only for stored entries), extra and comment lengths, attributes, time stamp
   (kept or new), CRC and SHA-256 of the content, relationship and content type parts as text;
   and the oracle's package read by the port must describe the same as the port's own.

GUIDs, "now" time stamps, the work directory and random relationship IDs (`R` + 16 hex digits)
are canonicalized; nothing else.

## Bugs found and fixed

- `src/engine/amlobjects/DocumentVersions.ts`: `GetDocumentVersionInformation` threw
  ArgumentNullException('source') without a document versions header; the C# `?.` chain
  short-circuits the whole LINQ chain, so it returns null.
- `src/engine/amlobjects/ClassReferenceWithAlias.ts`: `alias + "@" + null` gave `Alias@null`;
  C# string concatenation gives `Alias@`.
- `src/engine/amlobjects/AMLFile.ts`: `SetMetaInformation` (CAEX 3.0) used `DateTime.tryParse` with
  its own FormatException message; now `DateTime.parse` (the literal port of `DateTime.Parse`).
- `src/system/DateTimeParse.ts`: the FormatException messages of `DateTime.Parse` lacked the input
  and the index (`The string '{0}' was not recognized as a valid DateTime. There is an unknown
  word starting at index '{1}'.`, `String '{0}' was not recognized as a valid DateTime.`); the
  index of the unknown word is now recorded as in .NET.
- `src/engine/amlobjects/packaging/Package.ts`: a CreatePart that fails after the part URI is
  registered (invalid content type) leaves a null placeholder in the part list; .NET then fails
  with NullReferenceException in GetParts, Flush and Close. The port skipped the placeholder
  (`PartList.values`, `doOperationOnEachPart`); it now keeps it, as .NET does.

## Deviations that remain

- Overloads that differ only by the static type of a null receiver cannot be told apart in JS:
  `AutomationMLVersion(CAEXDocument null)` names 'caexFile' (C#: 'document');
  `ExternalDataReferenceInterfaceClass(CAEXFileType null)` takes the InterfaceClassLibType path
  (C#: 'caexFile'); `ExternalDataRoleClass(CAEXFileType null)` takes the RoleClassLibType path
  (NullReferenceException, C#: ArgumentNullException 'caexFile');
  `SetMetaInformation(SourceDocumentInformationType null, ...)` names 'caexFile'. These calls are
  not in the test; the other null overloads are.
- A null `lastWritingDateTime` for CAEX 3.0 becomes `DateTime.MinValue`, which is written with the
  local offset of year 1 (known system layer deviation "Local time before 1996",
  docs/deviations.md: +00:53 in the port, +01:00 on Windows .NET). The generator therefore uses
  no null date and the fixed case checks the null date for CAEX 2.15 only.
- XmlException messages come from the XML parser of `src/xml` and differ from XmlReader (seen in
  `GetXMLSignature` of a malformed signature); only the exception type is compared.
- Package.Open locks the file (FileShare.None) in .NET, the port does not lock (FileShare not
  ported, see docs/port-notes/amlobjects.md). The test reads a workspace package before opening it.
- Deflate output of fflate differs from zlib: compressed sizes and bytes of deflated entries are
  not compared (the decompressed content, CRC and all other header fields are).

## Not covered

- Aml.Engine code paths that need another engine service: `LoadExternalLibrary` with a schema
  transformation (the resources exist for both CAEX versions, so the transform service is never
  needed), undo/redo transactions in AMLFile (no UndoRedoService registered).
- `RefURIAttributeType.TryCreateUri` with existing files relative to the working directory or the
  document path (only the failing and non-file cases are exercised; the result depends on the
  current directory of each process).
- `AutomationMLContainer` on Unix ("made by" Unix), ZIP64 packages, interleaved parts, core
  properties: not ported (docs/port-notes/amlobjects.md).
- The `DocumentVersionDeprecated` conversion is covered through `objects215.aml` (three deprecated
  headers) and the corpus; the case of exactly one deprecated header with content is covered only
  through the corpus files that have one.
