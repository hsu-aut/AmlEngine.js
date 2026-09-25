# Coverage notes: gapsservices

Area: the coverage gaps of `src/engine/schema` (XmlSchemaManager public API; the validation folder
belongs to another package), `src/engine/xmlext`, `src/engine/services` (+ interfaces, model,
utilities), `src/engine/adapter`, `src/engine/streaming` and the remaining functions of
`src/engine/amlobjects` (including the System.IO.Packaging port and its helpers).

Files: `oracle/GapsServicesOracle.cs` (driver, recording, schema section) with the partial class
files `oracle/GapsServicesOracle.{Xml,Query,Services,Model,Adapter,Streaming,AmlObjects}.cs`;
`test/engine/gapsservices.oracle.test.ts`; `scripts/gen-gapsservices.mjs` (seed 3682, deterministic)
writing the inputs under `test/gapsservices/`: `profiles.json` (144 JSON texts for
AMLLibraryServerProfile.LoadFromString), `hashes.json` (10 password hashes made with AES-256-CBC
and seeded IVs, 12 damaged hashes), `signatures.json` (22 XML signature texts), `streaming/*.aml`
(8 library documents with version references and revisions), `packages/*.zip` (9 OPC packages);
two hand written documents `docs/map215.aml` and `docs/map30.aml` (mapping objects in both CAEX
layouts, mirrors, facets, revisions, internal links with broken references). Oracle call appended
to `scripts/oracle.sh` (`gapsservices <inputDir> <corpusDir> <outDir> [section]`, output
`test/oracle-out/gapsservices/<section>.json`); `test/gapsservices/** binary` in `.gitattributes`.

Oracle run about 10 s, test about 20 s: 10 tests, all passing; 554 cases with 81 619 compared lines.
Every line is compared exactly; GUIDs and "now" time stamps are canonicalized, the work and input
directories are replaced by `<WORK>`/`<IN>`. Nothing else is normalized.

## What is covered

1. **schema** (452 cases, 23 277 lines). For both managers every parent/child pair of the internal
   Elements dictionary (the pair list itself is compared) plus four missing pairs: AttributeNames
   (all/required), Attributes with Use/Default/Fixed/AttributeValueType, GetAnnotation(attribute),
   AttributeValueRestrictions, AttributeValueType(p, c, a), IsDefinedAttribute,
   IsRequiredAttribute, enumeration facets and Datatype of the attribute types, ChildElementNames and
   ChildElements with and without choices, Choices, IsChoice, MaxOccurence, MinOccurence,
   SchemaElement, GetAnnotation(element), AcceptsAny, IsChoiceForOneElement, Datatype and
   enumeration of the element type, XmlSchemaElementInfo.MaxOccurrence, HasChoiceOfElements,
   HasSequenceOfSimpleElements, ValueType, CreateElement (required/all attributes), CanAddNew,
   IsParent, SiblingBefore, InsertNew (twice), Insert, AddNew, CreateAttribute for every attribute
   (attached and detached element). Per manager: Namespace, SchemaLocation, SchemaSet,
   GetAnnotation(null), AttributeValueType(null), SetSchemaVersion, AdjustCAEXFileToSchema and
   AdjustNameToSchema (internal) with namespaced attributes, SetSchemaLocation (internal) into an
   existing folder, a folder with trailing separator and a missing folder, and the bytes of the
   extracted XSD files.
2. **xmlext** (16 cases, 27 453 lines). For every element of 15 documents (both CAEX versions):
   the 42 one-argument predicates of XmlCAEXSchema (as a bit string) and IsCAEXClass(false),
   IsInterfaceAttributeReferenceWithID(id), IsElementWithIDReference(id),
   IsElementWithPathReference(path), Name/Path/ID reference attribute lists, Name, Value,
   ReferencedElement (XObject and XAttribute overloads, with and without name), SchemaManager,
   XName; XmlClassOperation BaseClass, GetReferenceHierarchy, IsDerived, IsDescendant, IsFacetElement,
   IsOverridden, Library, LibraryName, OverriddenElements; XmlOperation First/LastElement (both
   overloads); XmlCAEXMapping MappingPathToRoleReference, MappingPathToSystemUnitClassReference,
   RoleReferenceToMapping, SystemUnitClassReferenceToMapping; XmlCAEXAttributes CAEXPath,
   RoleReference, SystemUnitClassReference, the master IDs, IDReferencesInInternalLink,
   IDReferenceInMapping; per attribute IsAttributeReference, IsInternalLinkAttribute,
   IsInheritanceAttribute, ReferencedElementFromMapping, RoleFromMapping, SystemUnitClassFromMapping,
   InterfaceFromInternalLinkAttribute, MasterAttribute. Edge cases: null and non-element XObjects,
   detached attributes and elements, facet overrides, text nodes before elements. All internal
   methods are called by reflection in the oracle.
3. **query** (27 cases, 25 271 lines). 13 documents, each without and with loaded ID and path
   tables: the document extensions of QueryResult, the lookup extensions (AllCaexObjects,
   CaexObjectsOfType, ExternalInterfaces, InternalElements, InternalLinks, ReferencesWithName),
   ElementsWithAliasReference per alias, AllExternalDataReferences, AllExternalInterfacesOfType;
   per object AllClassReferences(Deep) (object and document/path overloads), IsReferenced,
   ElementsWith{CAEXPath,ID}Reference, FindByPath, FindByID (with element types), AllElementsWithIDs,
   AllElementsWithInternalLinks, AllInternalElementsWithInternalLinks, ElementsWithInternalLink
   Relations, InterfacesWithInternalLinkRelations, AllElementsIdentifiedByCAEXPath,
   AllElementsWith{Name,CAEXPath,Alias,ID}Reference, the mirror queries and IsMaster of all three
   overloads, InternalLinksTo{Element,Interface}; Load/Unload/IsLoaded of both tables; null
   arguments, detached objects (with and without content), EmptyLookup (Instance, Count, indexer,
   Contains, KeySelector) and the lookup indexer.
4. **services** (6 cases). ServiceLocator: all service properties, GetService by interface and
   class, the fallback lookup of a service registered under its class name, UnRegister of the
   default services (refused), replacement query and ID services (used by the engine, restored on
   UnRegister), BeginService/EndService with a suspendable service, the schema transformation
   handlers (TransformationStarted transforms, TransformationEnded finalizes, both directions,
   unsubscribed on UnRegister, null source document); CaexIDService overloads; CAEXReference on
   attributes, "Value" references, missing attributes, null element; UpdateEventArgs (3 overloads),
   SchemaTransformationEventArgs; SignatureServiceBase through a derived service (CAEXNodeToString of
   every object of three documents, with a text signature header, with attributes, with child
   elements (FormatException), empty; alias removal; deleted objects; all argument checks of
   Compute/Create/VerifySignature).
5. **model** (9 cases, 1 926 lines). AMLLibraryServerProfile.LoadFromString for 144 JSON texts
   (valid profiles, every type mismatch, numbers, escapes, BOMs, NULs, 60 syntax errors) with the
   exact System.Text.Json messages; Serialize (escaping, CRLF indentation) and reload; LoadFromFile
   with UTF-8 (with/without BOM), UTF-16 LE/BE, UTF-32 LE, Latin-1, empty and missing files;
   IsAnonymous, CanTryLogin/LoginFailed/ResetFailedLogins/Block, ProtocolName and ServerURL for all
   protocols, Credentials, GetResolvedBaseAddress, GetUri (6 protocols x 8 servers x 3 variants x
   4 file names x download flag), GetData, RestorationData, Library/LibraryCollection/Example
   DataForDocument, the catalogue properties, null lists; AMLLibraryServerDataProfile constructors,
   BackupFileName, BackupFileType, ContentTypeFromFile, SupportsEdition, constants; decryption of
   22 generated hashes and password round trips (random IVs: the lengths are compared);
   AMLEditionEnumExtension; the internal ByteArrayConverter (through JsonSerializer); XMLSignature,
   SignedInfo, KeyInfo, KeyValue (a derived test KeyValue registered in Constructors):
   LoadFromString/LoadFromDocument of 22 texts, GetXml (both overloads, compared as a canonical
   element tree), all error branches, DiscardWhiteSpaces, GetAttribute. A separate test decrypts
   the hashes System.Security.Cryptography made in the oracle run with the synchronous and the
   WebCrypto implementation of the port and checks getPasswordAsync/setPasswordAsync.
6. **adapter** (12 cases). Every AMLEngineAdapter method on six documents (reads per object,
   and every mutating method on a fresh copy with the saved document compared), including the
   obsolete-as-error methods (by reflection), LinkedObjects getters, setters and ToString.
7. **streaming** (9 cases). NewDocumentVersions, OldDocumentVersions, ReadExternalReferenceType and
   StreamElementWithName (path and stream, with and without close predicate, six element names) for
   8 documents (semantic version comparison with pre-release tags, 6-part names, revision tables
   resolved before the end, missing alias, broken XML), file URLs, missing and relative paths,
   argument errors, PrepareSettingsWithCredential (internal) for 14 inputs. A separate test checks
   that the asynchronous variants (a port addition) give the same results, also through a fake
   IGitHubAccessService, and that unreachable servers give empty lists.
8. **amlobjects** (23 cases). AMLFile DocumentVersion (creating the header), WriterHeader and the
   internal DocumentVersionDeprecated sequences with Append; the element sequences of all library
   types (loaded, pre-existing PLCopenXML library, detached library nodes); AMLLibraryType
   LoadExternalLibrary (internal) across CAEX versions with and without a schema transformation
   service; AMLFacet.FacetExternalInterface.Insert with parent, foreign and null interfaces;
   System.Version equality and Distinct; Path.GetFileName(WithoutExtension) for 19 paths; the case
   insensitive dictionary of the MIME map against Dictionary with InvariantCultureIgnoreCase (33
   keys); System.IO.Packaging on 9 packages: parts and content types, package and part
   relationships (GetRelationship, RelationshipExists with valid, missing, empty, invalid and null
   IDs), part stream ReadByte/Flush/Length, CreatePart (default and override content types, ignored
   items), DeletePart of parts and relationship parts, Flush, Dispose, the written zip entries,
   the written [Content_Types].xml and the reopened package.

## Bugs found in the port and fixed

- `src/xml/XName.ts`: `XNamespace.getName('')` threw XmlException; .NET (XmlConvert.VerifyNCName)
  throws ArgumentException "The value cannot be an empty string. (Parameter 'name')".
- `src/xml/XName.ts`: `XName.get('')` message differed; .NET 8 throws ArgumentException
  "The value cannot be an empty string. (Parameter 'expandedName')".
- `src/engine/services/model/AMLLibraryServerProfile.ts`: LoadFromString used JSON.parse; it now
  reads like Utf8JsonReader + JsonSerializer (document order of errors, JSON path with `['..']`
  names, LineNumber and UTF-8 BytePositionInLine, Utf8JsonReader syntax messages, integers only in
  integer syntax so `1.0`/`1e2` are rejected, lone surrogates rejected for strings, trailing data).
- same file: LoadFromFile of a missing file threw the Node ENOENT error; now FileNotFoundException
  "Could not find file '<full path>'.".
- `src/engine/services/model/AMLLibraryServerDataProfile.ts`: BackupFileType on a 2 character name
  had the generic ArgumentOutOfRangeException message; now "startIndex cannot be larger than length
  of string.".
- `src/engine/services/model/PasswordProtected.ts`: a hash with an IV and no cipher text decrypted
  to null (node:crypto and WebCrypto reject the empty final block); CryptoStream gives "".
- `src/engine/services/model/XMLSignature.ts`: DiscardWhiteSpaces with a negative count returned
  ""; C# throws OverflowException (`new char[negative]`).
- `src/engine/amlobjects/mimetype/InvariantIgnoreCaseDictionary.ts`: keys were compared by
  `toUpperCase()`, which made "straße"/"STRASSE" and "ı"/"I" equal and "é"/"é", "²"/"2" and
  keys with ignorable characters different; the fold now follows the observed ICU behaviour.
- `src/engine/amlobjects/packaging/Package.ts`: the Override dictionary of [Content_Types].xml was
  keyed by the upper-cased part name; .NET keys it by the part name as written: overrides that
  differ in case are separate entries (lookups and deletions are exact), only exact duplicates
  throw.
- same file: an empty relationship ID threw XmlException; .NET (XmlConvert.VerifyNCName, only
  XmlException is wrapped) throws ArgumentException "(Parameter 'name')".

## Deviations and limits that remain

- DocumentStreaming over http(s) and GitHub in the synchronous methods: C# performs the request;
  the port throws SyncAccessNotSupportedException (the asynchronous variants do the request). Not
  compared with the oracle (network). The credentials PrepareSettingsWithCredential puts on the
  XmlUrlResolver cannot be read in .NET; only the result and the local path are compared.
- `DocumentStreaming.StreamElementWithName((Stream)null, ...)`: C# picks the stream overload by the
  static type; a JS null cannot, the test calls the port of that overload directly.
- ByteArrayConverter: the port has no JSON reader; `read` gets the parsed array. JsonSerializer does
  not call a converter for a JSON null (compared by the harness), and values outside the short range
  throw JsonException in C# while the port masks them (not compared).
- The case insensitive MIME dictionary approximates ICU collation (tested: ASCII case, ß, dotless
  and dotted i, canonical and compatibility equivalents, full/half width, kana, ignorable
  characters). Other collation equivalences are not reproduced; the MIME table only has ASCII keys.
- The JSON reader reproduces the Utf8JsonReader messages exercised by the 144 inputs; other
  syntax errors (for example very long literal remainders, which .NET may truncate) are not
  verified.
- XMLSignature.GetXml returns an XElement where C# returns an XmlElement; the trees are compared in
  a canonical form (namespace declarations ignored, an empty text node of XmlDocument equals empty
  string content of XLinq, the self-closing state is compared).

## Not covered (not reachable or not testable)

- Private constructors of static classes (no instance can be created): AutomationMLBaseAttributeTypeLib,
  AutomationMLBaseRoleClassLib, AutomationMLInterfaceClassLib, AutomationMLLogicInterfaceClassLib,
  AutomationMLLogicRoleClassLib, AutomationMLPLCopenXMLInterfaceClassLib, CAEXSignatureHeader,
  ClassReferenceWithAlias, DocumentVersions, ExternalDataReference, ListAttribute,
  AmlObjectsExtensions, MimeTypeMap, PackUriHelper, XmlTypeCodeExtensions, EmptyLookup, QueryResult,
  ServiceLocator, AMLEditionEnumExtension, DocumentStreaming, XmlCAEXAttributes, XmlCAEXMapping,
  XmlClassOperation, XmlLinqExtensions, XmlOperation.
- `AMLFile.isValidAutomationMLVersion` (anonymous at line 262): the throwing branch of
  `array[array.length - 1]` inside `array.length !== 0`; unreachable as in C# (`Last()`).
- `ExternalDataReference`: `exception()` and the lambda at line 88 throw only when the embedded BPR
  library resource is missing (it exists for both CAEX versions); the lambda at line 165 throws when
  a document element has no document, but IsDocumentElement is false for detached elements
  (checked in the amlobjects section), so AddDocumentReference returns null first.
- `Package.ts`: `SlotDictionary.has` (no caller after the Override fix), `PackagePart.zipArchiveEntry`
  (internal getter without caller), `ZipArchiveEntry.length` in `ZipArchive.ts` (no caller).
- `SchemaModel.ts` line 226: the `all` particle of the unpacking; the CAEX schemas contain no
  xs:all. `XmlSchemaManager.parseElement`/`parseSequence`: empty stand-ins of the C# schema
  walkers (the tables come from the oracle export, see SchemaModel.ts).
- `DocumentStreaming.basicAuthorization` and `loadGitHubAsync` run only in the asynchronous
  network paths; they are executed by the asynchronous test (unreachable server, fake GitHub
  service) but cannot be compared with .NET.
