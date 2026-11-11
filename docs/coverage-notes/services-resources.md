# Coverage notes: services resources

Area: the parts of Aml.Engine.Resources 4.2.1 ported for the services: `src/engine/resources/catalogue`
(PublicLibraryCatalog with its nested classes, ISignedLibraryVersion, SignedLibraryVersionExtensions,
ClassRepositoryItem, StringComparisonAlgorithmEnum), `src/engine/resources/files` (AMLFileMetaModel,
AMLFileContentType, AMLFileType, AMLDomainEnum, AMLDomainEnumMapping, AMLLibraryModel,
AMLLibraryTypeEnum, AMLResourceStream, SemanticVersionTypeConverter),
`src/engine/resources/EnumDescriptionTypeConverter.ts`, the JSON part of `AMLLibraries`
(`getManifestResourceStream`, `readAutomationMLLibraryInformation`), `src/system/Json.ts` and
`src/system/TypeConverter.ts`.

Files: `oracle/ServicesResourcesOracle.cs`, `test/services/resources.oracle.test.ts`,
`scripts/gen-services-resources.mjs` (seed 4210, deterministic) writing
`test/services/resources/cases.json`. Oracle call:
`resources test/services/resources test/oracle-out/services/resources.json`
(files written by the oracle go to `test/oracle-out/services/resources-work`, recorded as `<WORK>`).

The oracle runs in about 5 s and the test in about 50 to 80 s: 7 tests, all passing. 31 511 lines
are compared exactly. The test writes the port's lines to
`test/oracle-out/services/resources-js-<section>.json` for diffs. Nothing is normalized except
`<WORK>` and lone surrogates in recorded lines (the oracle writes its output with
System.Text.Json, which replaces them with U+FFFD; the test does the same before comparing).

## What is compared

1. **Catalogs** (235 cases, 6 241 operations, 6 990 lines). Each catalog text is read with the
   string overload, the stream overload, the stream overload with a UTF-8 preamble and through
   ReadAutomationMLLibraryInformation from a file; each result is the full dump (every property of
   every type, library, version and revision chain, the Library and RelatedLibraryVersion links)
   or the exception class and message. The texts:
   - the embedded `AutomationMLLibs.json` (bytes of the manifest resource) with 1 327 queries over
     its libraries for the CAEX versions "2.15", "3.0", "CAEX3_0", "CAEX2_15", null and "";
   - 70 generated valid catalogs (1 to 5 types, duplicate types, 1 to 4 libraries, 0 to 5
     versions with random Version, CAEXVersion, AMLEdition, IsArchived, Description with
     non-ASCII, HTML-sensitive and control characters, obsolete DownloadLink, DownloadLinks with
     nulls and duplicates, Sources, Signature, PublicKey, revision chains up to 4 deep) in four
     layouts;
   - 37 hand-made catalogs: PublicKey propagation, AMLEdition from CAEXVersion, DownloadLink
     moved into DownloadLinks, revision chains, null lists and null items (NullReferenceException
     in OnDeserialized), unknown and [JsonIgnore] properties, case variants, duplicate
     properties, escapes, raw non-ASCII, nesting of 60 to 70 levels, revision chains of 55 to 58
     levels around the maximum depth, SemanticVersion side effects, HighestVersion ties;
   - 112 invalid texts: every syntax error class of Utf8JsonReader (empty input, unterminated
     containers and strings, missing colon and comma, trailing commas, comments in every position,
     invalid literals, escapes and numbers, extra data, mismatched brackets, positions after
     non-ASCII text and on later lines with LF, CRLF and CR), conversion errors for every property
     type and position, the maximum depth, lone surrogate escapes in values and names;
   - 2 texts that are no valid UTF-16 and 11 byte inputs (preambles, invalid, truncated,
     overlong and surrogate UTF-8 in values, names and outside strings, a UTF-16 preamble);
   - 2 catalogs built with the API.

   The operations (scripts of 25 to 70 per catalog, applied in order to the catalog of the string
   overload): both indexers, GetPublishedLibraryVersion, IsArchived, LibraryVersionIsListed,
   LibVersion, LibVersions, Libraries, both GetOrCreate, HighestVersion, the internal
   FormatCAEXVersionString, IsCaexVersion, SemanticVersion and NetVersion (with the change of
   Version), AddSource, AllDownloadLinks (link and owning revision), property edits, the
   extension methods AddDownloadLink, both AddRevision overloads, Description, LibraryName,
   Version, SetDescription, the internal GetLinks and TransformLink on versions and revisions,
   IJsonOnDeserialized.OnDeserialized, a custom ISignedLibraryVersion (the null dereferences, the
   laziness of GetLinks and AllDownloadLinks), SerializeToStream (bytes and text) and Save (file
   bytes; null, empty and missing directory), up to a revision chain of 62 that passes the
   serializer's maximum depth. The final state of every catalog is also written with
   JsonSerializer.Serialize and the default (compact) and indented options.
2. **AMLFileMetaModel** (2 403 cases, 22 873 lines). 2 400 names: 65 real ones (the embedded
   resources, the corpus, names of published AutomationML libraries, URLs, Windows, UNC and Unix
   paths) and generated ones following the naming convention with 3 to 8 parts, dropped, empty
   and extra parts, case variants, 22 version forms, 14 extensions, 16 path prefixes, URL escapes
   (valid and invalid) and 29 odd characters, free names with 20 forms of "AMLEd" (case,
   ignorable and combining characters, compatibility and full width forms), and random strings.
   Every name with the content types 0, 1, 2, one of 3 to 7 and 99: all properties
   (ContentType, FilePath, URL, FileName, FileType, Producer, Domain, SubDomain, MainDomain,
   LibType, Extension, Edition, Version, SemanticVersion, AliasNameFromParts, IdentifyingName,
   FileNameFromParts, IsConsistent, IsExtension, Alias), IsDocumentEdition for 6 versions,
   IsNewVersion(null) and with itself, then for every fifth name SetFileName with another name,
   for every fifth the URL setter (another name and null), for every 50th SetFileName(null) and
   edited and cleared properties; a null path; the constants; GetLatestVersions over 800 models.
3. **Version groups** (62 groups of 289 library files): the IsNewVersion matrix and
   GetLatestVersions (also empty and mixed with another content type).
4. **Misc** (280 lines): AMLDomainEnumMapping.DomainString for the values -1 to 16 and 6
   editions, AMLLibraryModel.LibraryName for the types -1 to 5 and 7 argument combinations,
   AMLResourceStream, the members of the 5 enums, ClassRepositoryItem (8 items: ToString,
   properties, Deconstruct, Equals with null, other types and a derived record, `with` copies
   through the constructor, the 8 × 8 matrix of Equals, ==, != and hash equality).
5. **Converters** (849 lines): EnumDescriptionTypeConverter for 6 enums (ConvertTo string for
   all values and the neighbours, with a culture, to double, bool and object, for null, strings
   and booleans; ConvertFrom for 66 strings and 4 other values; CanConvertFrom/To for 5 types),
   SemanticVersionTypeConverter and the TypeConverter base class.
6. **Embedded resources**: the 14 manifest resource names and the bytes of each, 5 names that do
   not exist, the empty and the null name.
7. **Profiles**: 10 texts for AMLLibraryServerProfile.LoadFromString, regression cases for the
   corrections of Json.ts that the profile shares.

## Port errors fixed

- Json.ts: "when isFinalBlock" in the message for input without tokens.
- Json.ts: the maximum depth of 64 when reading (deep unknown values, revision chains).
- Json.ts: the maximum depth of 64 when writing (JsonException with the member path); a revision
  cycle no longer overflows the stack.
- Json.ts: a string with lone surrogates throws ArgumentException (string overload, also
  AMLLibraryServerProfile.LoadFromString).
- Json.ts: byte input decoded like Utf8JsonReader: one preamble only, invalid UTF-8 fails in
  string values, prints 0xNN in syntax errors and counts one byte.
- Json.ts: a property name with invalid surrogate escapes fails as the object type (catalog and
  profile).
- Json.ts: the message for '/' after a property name, '{' or '['.
- Json.ts: lone surrogates are written as �.
- NetPath.ts: GetFileName cut at ':' in the first two characters without a drive letter.
- AMLFileMetaModel.ts: "AMLEd" followed by a combining mark is no match.
- EnumDescriptionTypeConverter.ts: trailing NUL characters after an integer; the .NET names of the
  other enums of Aml.Engine.Resources in messages.
- TypeConverter.ts: True/False for booleans, Double formatting, Object.ToString as the type
  name, registered .NET type names (SemanticVersion), typeof(object).
- AMLLibraries.ts: ArgumentNullException and ArgumentException for a null and an empty resource
  name; DirectoryNotFoundException for a catalog file in a missing directory.
- PublicLibraryCatalog.ts: DirectoryNotFoundException for Save into a missing directory.

## Deviations kept

- ReadAutomationMLLibraryInformation leaves its FileStream open in C#: the file stays locked
  until the stream is collected, so a Save to the same path fails with IOException. The port reads
  the file completely. The embedded catalog case saves to another file name.
- The C# overload AddRevision(LibraryRevision) with null is not reachable: the port takes null
  as the signature overload.
- The port's `PublicLibraryCatalog.deserialize(null)` (a port helper) throws
  ArgumentNullException("json") for both inputs; the stream overload of .NET names "utf8Json".
- EnumDescriptionTypeConverter: a number is a value of the converter's enum (a boxed Int32 is not
  distinguishable); enums outside the table are named System.Enum; Enum[], InstanceDescriptor and
  the other members of EnumConverter are not ported.
- ClassRepositoryItem: no `with` (the test copies through the constructor); `equalityKey()` stands
  for GetHashCode (compared as equality of pairs).
- Path functions follow the platform: the oracle output is from Windows, the file model cases with
  drive letters and backslashes compare only on Windows.

## Coverage

`npx vitest run test/services/resources.oracle.test.ts --coverage --coverage.provider=v8` over the
area files (without AMLLibraries.ts): statements 98.3 % (functions 97.4 %, lines 99.4 %); the
catalogue modules 99.7 %, the files modules 98.7 %, EnumDescriptionTypeConverter 98.7 %, Json.ts
97.0 % (lines 100 %), TypeConverter.ts 95.6 %. Not covered:

- the private constructors of the static classes (AMLDomainEnumMapping, AMLLibraryModel,
  SignedLibraryVersionExtensions) and the protected `enumType` getter of
  EnumDescriptionTypeConverter (EnumConverter.EnumType, unused);
- AMLLibraryModel: the `break` after `if (extension != null)` in each case (unreachable, as in C#);
- ClassRepositoryItem: PrintMembers returning false (it never does);
- PublicLibraryCatalog.save: file system errors other than a missing directory (rethrown);
- Json.ts: a few branches of the reader for inputs the cases do not produce in that position;
- TypeConverter.ts: a `Type` argument without a name (no counterpart in .NET);
- AMLLibraries.ts: everything but the two JSON functions belongs to the earlier port of the
  library resources; together with test/engine/amlobjects.oracle.test.ts and
  test/engine/gapsservices.oracle.test.ts the file has 98.2 % of its statements covered.
