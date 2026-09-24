# Port notes: batch 7-amlobjects

Files of the batch (`src/engine/amlobjects/`): `AMLFacet.ts`, `AMLFile.ts`, `AMLGroup.ts`,
`AMLGroupInternalElementSequence.ts`, `AMLInternalElementType.ts`, `AMLLibraryType.ts`, `AMLPort.ts`,
`AMLSystemUnitClass.ts`, `AMLSystemUnitFamilyType.ts`, `AutomationMLBaseAttributeTypeLib.ts`,
`AutomationMLBaseAttributeTypeLibType.ts`, `AutomationMLBaseRoleClassLib.ts`,
`AutomationMLBaseRoleClassLibType.ts`, `AutomationMLContainer.ts` (`AutomationMLContainer`,
`AutomationMLContainer_RelationshipType`), `AutomationMLInterfaceClassLib.ts`,
`AutomationMLInterfaceClassLibType.ts`, `AutomationMLLogicInterfaceClassLib.ts`,
`AutomationMLLogicInterfaceClassLibType.ts`, `AutomationMLLogicRoleClassLib.ts`,
`AutomationMLLogicRoleClassLibType.ts`, `AutomationMLPLCopenXMLInterfaceClassLib.ts`,
`AutomationMLPLCopenXMLInterfaceClassLibType.ts`, `CAEXSignatureHeader.ts`,
`ClassReferenceWithAlias.ts`, `DocumentVersionInformation.ts`, `DocumentVersions.ts`,
`ExternalDataReference.ts`, `FacetAttributeSequence.ts`, `FacetExternalInterfaceSequence.ts`,
`FrameAttributeType.ts`, `FrameValues.ts`, `IAMLFile.ts`, `ListAttribute.ts`, `MetaInformation.ts`,
`ObjectWithAMLAttributes.ts`, `RefTypeAttributeType.ts`, `RefURIAttributeType.ts`,
`extensions/AmlObjectsExtensions.ts`, `mimetype/MappingList.ts` (generated), `mimetype/MimeTypeMap.ts`.

Helper modules without an entry in `docs/type-map.tsv` (no C# counterpart in Aml.Engine):

| Module | Content |
|---|---|
| `amlobjects/internal/Version.ts` | System.Version (Parse/TryParse with the .NET exceptions, compare, ToString). Also used by batch 5 (`resources/files/SemanticVersion.ts`). |
| `amlobjects/internal/NetPath.ts` | System.IO.Path / File / Directory subset; node:fs via `process.getBuiltinModule` (NotSupportedException without it). |
| `amlobjects/mimetype/InvariantIgnoreCaseDictionary.ts` | `Dictionary<string, T>` with InvariantCultureIgnoreCase (MappingList). |
| `amlobjects/packaging/*.ts` | System.IO.Packaging port (see "AMLX containers" below): `Package.ts`, `PackUriHelper.ts`, `ContentType.ts`, `ZipArchive.ts`, `MemoryStream.ts`. |
| `resources/libraries/AMLLibraries.ts`, `LibraryResources.ts`, `EmbeddedLibrary.ts`, `data/*.ts` | Port of `Aml.Engine.Resources.AMLStandard.AMLLibraries`/`LibraryResources` (assembly Aml.Engine.Resources 4.2.1) and the embedded libraries. |

Scripts added: `scripts/extract-aml-libraries.ps1` (extracts the manifest resources of
Aml.Engine.Resources.dll byte for byte into `scripts/aml-libraries/`, output committed),
`scripts/gen-aml-libraries.mjs` (generates `src/engine/resources/libraries/data/*.ts`, verifies
the byte round trip), `scripts/gen-mime-mappinglist.mjs` (generates `mimetype/MappingList.ts`
from the decompiled `Aml.Engine.AmlObjects.MimeType/MappingList.cs`, checks for duplicate keys).
Dependency added: `fflate` 0.8.3 (MIT) for deflate/inflate.

`npx tsc --noEmit` (also with `--noUnusedLocals`) shows no errors in these files; the whole
project had one unrelated error in `test/engine/ops.oracle.test.ts` at the time of writing.

## Verification done (scratch, against the real engine)

- AML objects scenario, CAEX 3.0 and 2.15 (library loading of all standard libraries, AMLFacet
  with facet attributes and interfaces, AMLGroup, AMLPort, frame attribute, list attributes,
  refURI attributes, meta information set/replace/delete, document versions incl. errors,
  generic AdditionalInformation, BPR document elements with languages (2.15), signature header,
  IsAMLObject/IsFacetAttribute), saved XML compared with the oracle: identical except GUIDs,
  the time stamp of the new document and the message text of one NullReferenceException.
- MimeTypeMap (GetMimeType, GetExtension, GetKnownExtensions, IsXmlText) and
  AMLLibraries.GetAutomationMLLibrary for 19 inputs: identical output.
- AMLX: 7 container scenarios (create, stream, update of an existing file, relink, delete, content
  type defaults/overrides, empty container, compression options, empty parts, read-only errors,
  part URI validation of 20 names, relationship ID errors) and two AMLX files of other tools:
  parts, content types, relationships, zip entry order, compression method, header versions,
  flags and external attributes identical to the files System.IO.Packaging writes (relationship
  IDs are random in both). Only the deflate streams differ (see (b)).

## (a) Assumptions about other batches (all type-checked, exercised by the scenario above)

- `CAEXElementFactory.create(document, T.X)` for C# `document.Create<X>()` (returns `X | null`).
- `ServiceLocator.getService<ISchemaTransform>('ISchemaTransform')`; `T.CaexCommand.isSilent`.
- `InheritanceExtensions.classIsDerivedFrom(doc, classPath, baseClassPath, T.X)` (4-argument form).
- `CAEXBasicObjectExtensions.descendants(obj, T.X)` for `Descendants<T>(this CAEXWrapper)`.
- `T.CAEXDocument.loadFromStream(bytes: Uint8Array)`; `doc.schemaVersionString`, `doc.filePath`.
- `new T.ValueSequence<T>(owner | getOwner, name, predicate, 'other')`: predicates are written with
  one declared parameter so that the arity based dispatch of NamedElementSequence picks the
  condition overload; `elementName` is assigned `XName.get('Document')`.
- `sourceDocumentInformation.append(['OriginID', originID])` for the C# tuple.
- The facet sequences override `append`/`prepend` of CAEXSequenceOfCAEXObjects; they rely on its
  `append(name)`/`prepend(name)` calling the virtual `this.append()`/`this.prepend()` (as in C#).
  A `null` name counts as the string overload, as in CAEXSequenceOfCAEXObjects.
- `static op_Implicit(x)` for `implicit operator ObjectWithAMLAttributes` (AMLFacet overrides the
  one of SystemUnitClassType).
- `T.XsdDataTypes.stringType/unsignedIntType/doubleType/languageType`,
  `T.AttributeTypeType.clrToXmlType(String)`.
- Other batches use from this batch: `AmlObjectsExtensions.*`, `ClassReferenceWithAlias`,
  `CAEXSignatureHeader`, `AutomationMLInterfaceClassLib.*`, `AutomationMLBaseAttributeTypeLib.*`,
  `IAMLFile`, `Version`, `new T.ObjectWithAMLAttributes(x)`.

API shapes decided here:
- `out` parameters: `DocumentVersions.appendDocumentVersionInformation(...)` and
  `replaceDocumentVersionInformation(...)` return `{ result, error }`.
- Overloads distinguished by `this` type become one method dispatching with `instanceof`:
  `AmlObjectsExtensions.automationMLVersion(CAEXFileType | CAEXDocument)`,
  `setMetaInformation(SourceDocumentInformationType | CAEXFileType, ...)`,
  `ExternalDataReference.externalDataReferenceInterfaceClass(InterfaceClassLibType | CAEXFileType)`,
  `externalDataRoleClass(RoleClassLibType | CAEXFileType)`. A `null` receiver takes the
  CAEXFileType path (ArgumentNullException 'caexFile' where C# may name another parameter).
- `AMLLibraryType<T>` takes the item class as last constructor argument (`itemType`).
- `AutomationMLContainer`: a Stream is `MemoryStream` (`packaging/MemoryStream.ts`: `read`,
  `write`, `seek`, `setLength`, `copyTo`, `toArray`, `canRead/canWrite/canSeek`, `position`,
  `length`); arguments also accept a `Uint8Array`. `rootDocumentStream()` returns a MemoryStream,
  so `CAEXDocument.loadFromStream(container.rootDocumentStream()!.toArray())`. A stream container
  writes the package into the MemoryStream passed in when it is disposed/closed. A DirectoryInfo
  is a path string or `{ fullName }`. `checkRelatedParts` yields `{ partUri, relatedPartUri,
  exists }`. `Dispose()`/`Dispose(bool)` are one `dispose(disposing?)`.
- `AMLLibraries.getAutomationMLLibrary(...)` returns the resource bytes (`Uint8Array | null`).
- `MimeTypeMap.getKnownExtensions` returns a lazy `Enumerable`; the lists returned by
  `getMimeType`/`getExtension` are the live lists of the table, as in C#.

## Embedded AutomationML libraries

AMLLibraries resolves `Aml.Engine.Resources.Resources.<CAEX folder>.<AML folder>.<Library>.aml`.
The batch loads (via `GetAutomationMLLibrary` and the obsolete wrappers) the libraries
AutomationMLBaseRoleClassLib, AutomationMLInterfaceClassLib, AutomationMLBaseAttributeTypeLib,
AutomationMLLogicInterfaceClassLib, AutomationMLLogicRoleClassLib,
AutomationMLPLCopenXMLInterfaceClassLib, AutomationMLBPRInterfaceClassLib and
AutomationMLBPRRoleClassLib, with the AML version of the document (or "2.0" for the BPR role class
library) and the CAEX version; every one of the 13 `.aml` resources of Aml.Engine.Resources 4.2.1
is reachable, so all are embedded (`AutomationMLLibs.json`, the library catalogue, is extracted but
not embedded: nothing in Aml.Engine uses AMLLibraries to read it). The resources were extracted
with Assembly.GetManifestResourceStream (identical in the net481 and net10.0 builds and identical to
the ilspycmd extraction); all have a UTF-8 BOM, which is kept (`bom: true`) so the bytes are
reproduced exactly. The resources carry no licence or copyright header; the NuGet package
Aml.Engine.Resources is MIT licensed, copyright AutomationML e.V. 2017 (the same notice as
Aml.Engine). Note: the CAEX 2.15 BPR interface class library contains an ExternalReference path
with an embedded share token (`https://3g4mkKLj3pN9JoF@automationml.ovgu.de/...`) as published
by AutomationML.

## AMLX containers (System.IO.Packaging on fflate)

The packaging port follows the decompiled System.IO.Packaging 10.0.3 (the version Aml.Engine
4.5.2 references): ContentType (full), ContentTypeHelper (Default/Override handling, the
dictionary slot reuse of .NET for overrides, the compression level of the first
`[Content_Types].xml` entry and the delete/recreate on later changes), Package/ZipPackage
(sorted part list by upper-case part name, prefix collision checks, relationship parts in
GetParts, deletion of the relationship part with a part, Open defaults: `Open(path)` =
OpenOrCreate/ReadWrite, `Open(stream)` = Open/**Read**), PackagePart (stream access rules),
InternalRelationshipCollection (IDs `"R" + 16 hex digits of a new GUID`, XSD ID validation,
relationship XML with `TargetMode` only for External, parsing checks), PackageRelationship and
PackageRelationshipCollection. Written relationship and content type parts are byte-identical to
.NET (`<?xml version="1.0" encoding="utf-8"?>` with BOM, no indentation, `ContentType` in the
canonical form `type/subtype ; key=value`).

ZIP layer (`ZipArchive.ts`), as observed in files written by the engine on Windows: entries in
creation order (a deleted entry is removed, a recreated one appended), version needed 20, version
made by 0x0014, no data descriptors, no extra fields, flag 0x0800 only for non-ASCII names,
external attributes 0, DOS time of the entry creation (local time); NotCompressed parts and empty
parts are stored, others deflated (Normal = level 6, Maximum = 9, Fast/SuperFast = 1); an entry
read from an archive and rewritten keeps its method and time stamp, an unchanged entry keeps its
compressed bytes; an empty package is the 22-byte end record. The archive is written when the
package is closed (as in .NET update mode); files for FileMode.Create/CreateNew/OpenOrCreate are
created (empty) when opened.

Differences (documented, not reproduced):
- The deflate streams come from fflate, not from the zlib of .NET: compressed bytes and sizes of
  larger parts differ (small parts coincide); they decompress to the same content.
- .NET on Unix writes "made by" Unix with permission bits; the port always writes the Windows form.
- Not ported: interleaved part pieces (`[n].piece` entries are ignored when reading), ZIP64
  (NotSupportedException), PackageProperties (core properties), markup compatibility processing
  (XmlCompatibilityReader) in relationship parts, FileShare, the write-only (FileAccess.Write)
  ZipArchiveMode.Create restrictions. Part streams are always seekable (the streams of a read-only
  .NET package are not). Archive entry names without the UTF-8 flag are decoded as UTF-8.
- Part URI validation is done on the string (the .NET code round-trips through System.Uri
  combination and GetComponents, which the Uri port does not provide); the rules and the results
  for the tested names are in `packaging/PackUriHelper.ts`. `ResolvePartUri` also works on the
  string (dot segments, escaping of spaces/non-ASCII).
- Parse errors of malformed `[Content_Types].xml` or relationship parts are XmlExceptions of the
  src/xml parser (messages and positions differ from XmlReader).
- `new Uri('http://x/y', UriKind.Relative)` throws UriFormatException with the message of the
  system Uri port ("Invalid URI: The format of the URI could not be determined.") where .NET says
  "A relative URI cannot be created because the 'uriString' parameter represents an absolute URI."
  (system layer, not this batch).

## (b) C# behaviour not reproduced exactly

- `new` member hiding: AMLFacet.Attribute / ExternalInterface and AMLGroup.InternalElement hide
  the base properties in C# (callers with the static base type get the base sequence). Here they
  override `attribute`, `externalInterface`, `internalElement`, so engine code handling an AMLFacet
  or AMLGroup instance through a base reference also gets the facet/group sequence. The static
  `AMLFacet.InternalElement` / `AMLPort.InternalElement` (always null) are static getters.
- Private fields `_attribute`, `_externalInterface` (AMLFacet) and `_internalElement` (AMLGroup)
  are renamed `_facetAttribute`, `_facetExternalInterface`, `_groupInternalElement`, because TS
  does not allow a private field with the name of a private field of a base class.
- `FrameAttributeType.FormatInfo` (obsolete clone of `CultureInfo.CurrentCulture.NumberFormat`)
  is an object with the invariant separators.
- `ObjectWithAMLAttributes.Attribute` reads the property `attribute` of the wrapped object
  instead of the reflection lookup of "Attribute" (null if it is no AttributeSequence).
- `SetMetaInformationStandardAutomationMLLibrary`: WriterRelease is the constant '4.5.2.0'
  (`typeof(MetaInformation).Assembly.GetName().Version`).
- `AMLFile.SetMetaInformation(9 strings)` for CAEX 3.0 uses `DateTime.tryParse` of the system
  layer for `DateTime.Parse` (FormatException "String '...' was not recognized as a valid
  DateTime." on failure); current-culture parsing follows the system layer.
- MimeTypeMap: `InvariantCultureIgnoreCase` keys and `ToLower` use `toUpperCase`/`toLowerCase`
  (the table is ASCII).
- `AutomationMLContainer.Extract` writes caught exception messages with `console.log`
  (`Console.WriteLine`). File methods need node:fs (NotSupportedException otherwise; in
  RefURIAttributeType.TryCreateUri the exception is swallowed like any other and gives null).
- NullReferenceExceptions of C# are TypeErrors here (message differs), per PORTING.md.

## (c) Apparent bugs of the original, ported unchanged

- `AutomationMLPLCopenXMLInterfaceClassLibType.InterfaceClassLib` imports
  `doc.CAEXFile.InterfaceClassLib["AutomationMLLogicInterfaceClassLib"]` (null for the PLCopen
  library) and `IsLoaded` checks the Logic library name.
- `AMLFile.AutomationMLVersion` setter (CAEX 3.0): if a SuperiorStandardVersion
  "AutomationML ..." exists, only the field `ElementValue.Value` is assigned; the XML is unchanged.
  The getter throws ArgumentOutOfRangeException for a SuperiorStandardVersion "AutomationML".
- Facet sequences: the parameterless `Append()`/`Prepend()` always return null (and append nothing
  for a facet owner); `Append(name)`/`Prepend(name)` on a non-facet owner append an element and
  then fail with a NullReferenceException in MakeUniqueName, because the virtual `Append()`
  returns null.
- `ExternalDataReference.AddDocumentElement` on a CAEX 3.0 document fails with a
  NullReferenceException (the BPR role class library is only added for CAEX 2.15); the oracle
  shows the same. `AddAutomationMLBPRRoleClassLib` always loads AML version "2.0".
- `AutomationMLContainer.RelinkPart(Uri, Uri)` (obsolete) looks for relationships of the part to
  itself (`part.GetRelationships()` with target = the part), so relationships of other parts
  still target the old URI (verified with the oracle); without package relationship the new
  relationship type name is null.
- `MimeTypeMap.BuildMappings` also adds the reverse of the MIME type entries of the table, which
  duplicates values ('.mov' -> [video/quicktime, video/quicktime], 'text/xml' contains '.xml'
  twice); `IsXmlText` / `GetMimeType` return these lists.
- `ListAttribute.AddListItem`: when items exist, the `itemType` argument is replaced by the data
  type of the last item.
- `DocumentVersions.GetDocumentVersionInformation` throws ArgumentNullException ('source') when the
  file has no document versions header (LINQ over `null`).
- `AMLFile.DeleteMetaInformation` returns true for CAEX 3.0 even if nothing was deleted.
- `AMLGroup.Insert` checks `(object)caexObject != null` (reference), `Import` uses the wrapper
  operator (a wrapper without node counts as null).

## (d) Left undone / for the coordinator

- `NOTICE` should mention Aml.Engine.Resources (MIT, AutomationML e.V. 2017; the embedded
  libraries) and fflate (MIT, Arjun Barrett); not edited (outside the batch).
- `src/engine/index.ts` must import the modules of this batch, in particular
  `amlobjects/mimetype/MappingList.ts` (it registers `T.MappingList`, used lazily by MimeTypeMap).
  The packaging and resource modules are imported by the modules that use them.
- No oracle test in `test/`: the scratch comparisons above (AML object scenario, MimeTypeMap and
  AMLLibraries outputs, AMLX structure comparison with `zipfile`) could become oracle modes.
- `gen-mime-mappinglist.mjs` needs the decompiled source (ilspycmd of Aml.Engine 4.5.2) as input;
  the extraction script needs Windows PowerShell and the NuGet cache.
