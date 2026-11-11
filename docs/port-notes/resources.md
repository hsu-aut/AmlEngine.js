# Port notes: Aml.Engine.Resources

Files (Aml.Engine.Resources 4.2.1, engine modules with registry `T`):
`src/engine/resources/catalogue/` PublicLibraryCatalog (with the nested Library, LibraryRevision,
LibraryType, LibraryVersion), ISignedLibraryVersion, SignedLibraryVersionExtensions,
ClassRepositoryItem, StringComparisonAlgorithmEnum; `src/engine/resources/files/`
AMLFileMetaModel, AMLFileContentType, AMLFileType, AMLDomainEnum, AMLDomainEnumMapping,
AMLLibraryModel, AMLLibraryTypeEnum, AMLResourceStream, SemanticVersionTypeConverter;
`src/engine/resources/EnumDescriptionTypeConverter.ts`. Ported earlier: `libraries/AMLLibraries.ts`,
`libraries/LibraryResources.ts`, `files/SemanticVersion.ts`.

The catalog lists the published AutomationML libraries with versions, signatures and download
links; AMLFileMetaModel derives producer, domain, library type, edition and version from the name
of an AutomationML file; the converters are System.ComponentModel type converters.

## API decisions

- **Nested classes** of PublicLibraryCatalog are exported as `PublicLibraryCatalog_Library` etc.
  and attached as static properties (`PublicLibraryCatalog.LibraryVersion`). Indexers are
  `item(...)`: `catalog.item(tagName)` (LibraryType), `catalog.item(tagName, libraryName)`
  (Library, chosen by the number of arguments), `libraryType.item(name)`,
  `library.item(version, caexVersion)`. The static property `FileName` is `fileName`.
- **JSON**: System.Text.Json is emulated in `src/system/Json.ts` (moved there from
  AMLLibraryServerProfile, see below). Writing: `serialize()` (internal) with the options of
  Save/SerializeToStream (WriteIndented = true): properties in declaration order,
  `"Libraries"` for LibraryTypes ([JsonPropertyName]), [JsonIgnore] properties
  (AllDownloadLinks, NetVersion, SemanticVersion, Library, RelatedLibraryVersion) left out, the
  obsolete DownloadLink written, nulls written. Reading: `PublicLibraryCatalog.deserialize(json)`
  (port helper, no C# member) is JsonSerializer.Deserialize<PublicLibraryCatalog> with the default
  options: a string like the string overload, bytes like the UTF-8 stream overload (preamble
  skipped). Unknown and [JsonIgnore] property names are skipped, conversion and syntax errors are
  JsonException with path and position. IJsonOnDeserialized.OnDeserialized is the public method
  `onDeserialized()` and runs when the catalog object is complete.
- `save(filePath)` writes with node:fs (File.WriteAllText: UTF-8 without preamble; null and empty
  paths throw like .NET 8). `serializeToStream()` returns the bytes (StreamWriter: UTF-8 without
  preamble).
- **Tuples**: AllDownloadLinks (`IEnumerable<(string LinkAddress, ISignedLibraryVersion
  Revision)>`) and the internal GetLinks give `{ linkAddress, revision }`
  (`SignedLibraryVersionLink`, exported by SignedLibraryVersionExtensions.ts). C# `.Item1` of the
  GetLinks tuples is `.linkAddress`. Both are lazy `Enumerable`s as in C#: GetLinks captures the
  link list at the call and returns an empty sequence when it is null or empty at that time.
- **SignedLibraryVersionExtensions** is a static class; the two AddRevision overloads are one
  method `addRevision(version, signatureOrRevision)` that takes the revision overload for a
  LibraryRevision object and the signature overload otherwise. Description, LibraryName,
  SetDescription and Version accept `null` (a revision without related version): as extension
  methods they return "" (or do nothing) instead of throwing.
- **ClassRepositoryItem** (a C# record): positional properties (`init` is not enforced),
  `equals(other)` over the exact type (EqualityContract) and all properties, `equalityKey()`,
  the static `equals(a, b)`/`notEquals(a, b)` for the record operators, the record `toString()`
  (`ClassRepositoryItem { ClassName = A, ..., ID =  }`, null printed as empty text) and
  `deconstruct()`. The compiler generated copy (`with`) has no counterpart.
- **AMLFileMetaModel**: public constants keep their names (`AML_PRODUCER`, `AMLEdition1`,
  `SubNameChar`, ...); `URL` is `url` (setter derives `fileType`), `FileName` has a getter only.
  `getLatestVersions(documents)` is a generator function: lazy like the C# iterator, but a
  one-shot generator; `documents` is enumerated again for every document, so it must be
  re-iterable (an array or an `Enumerable`).
- **AMLResourceStream**: the stream is a byte array (`amlFileStream`, `amlFileType`,
  `amlFileName`).
- **Type converters**: `src/system/TypeConverter.ts` is the base class
  (System.ComponentModel.TypeConverter) with `canConvertFrom(context, sourceType)`,
  `canConvertTo(context, destinationType)`, `convertFrom(context, culture, value)` and
  `convertTo(context, culture, value, destinationType)`. `Type` arguments are constructors
  (`String` for typeof(string), `Object` for typeof(object)); context and culture are ignored.
  SemanticVersionTypeConverter overrides CanConvertFrom and ConvertFrom as in C# and inherits the
  TypeConverter behaviour for ConvertTo (`value.ToString()`: "" for null, True/False for
  booleans, the .NET type name for objects without their own toString). The messages use .NET
  type names: strings, booleans, numbers (Int32 or Double), bigint (Int64), classes registered
  with `registerNetTypeName` (SemanticVersion), System.Object for plain objects, the
  constructor name otherwise.
- **EnumDescriptionTypeConverter** takes the TS enum object (C# `Type`). TS enums carry no
  attributes, so the [Description] texts are a table in the module: AMLFileContentType,
  AccessRightsEnum and AMLEditionEnum (the enums with
  [TypeConverter(typeof(EnumDescriptionTypeConverter))]) and CAEXDocument.CAEXSchema (the only
  other enum of the ported assemblies with [Description] texts); the table also gives the .NET
  type names of the messages and lists the other enums of Aml.Engine.Resources (AMLFileType,
  AMLDomainEnum, AMLLibraryTypeEnum, StringComparisonAlgorithmEnum, ClassRepositoryEnum) for their
  names. ConvertTo(string): the description, the member name without
  description, "" for null and for values that are no member. The members inherited from
  EnumConverter are ported for strings: ConvertFrom parses with Enum.Parse(type, s, ignoreCase:
  true) (integer with sign, trailing white space and trailing NUL characters, or a member name;
  comma separated values are
  ORed) and throws FormatException("<value> is not a valid value for <EnumName>."); other values
  throw NotSupportedException("EnumDescriptionTypeConverter cannot convert from <type>.").
  CanConvertFrom/CanConvertTo are true for `String`.
- **Embedded catalog**: the assembly embeds `Aml.Engine.Resources.Resources.AutomationMLLibs.json`
  besides the libraries. No code of Aml.Engine.Resources, Aml.Engine or Aml.Engine.Services reads
  it: GetAutomationMLLibrary only builds names `<assembly>.Resources.<CAEX>.<AML>.<name>.aml`, and
  the internal ReadAutomationMLLibraryInformation reads a catalog from a file. The resource is
  generated like the libraries (`scripts/gen-aml-libraries.mjs`, byte-exact round trip,
  `src/engine/resources/libraries/data/AutomationMLLibs.ts`) and served by
  `AMLLibraries.getManifestResourceStream(name)` (port helper for
  `Assembly.GetManifestResourceStream`, also used by getAutomationMLLibrary);
  `PublicLibraryCatalog.deserialize(bytes)` reads it. The file in `scripts/aml-libraries` had been
  stored by git with LF line ends; it is now the extracted original (CRLF, 7883 bytes) and the
  folder is marked binary in `.gitattributes`.
- `AMLLibraries.readAutomationMLLibraryInformation(catalogFile)` (internal) is ported: node:fs,
  FileNotFoundException with the full path for a missing file (DirectoryNotFoundException when
  its directory is missing), then the stream deserialization. `getManifestResourceStream` throws
  for a null name (ArgumentNullException) and an empty one (ArgumentException) like
  RuntimeAssembly.GetManifestResourceStream.

## C# behaviour not reproduced exactly

- `string.EndsWith(string)` (FormatCAEXVersionString, the URL setter of AMLFileMetaModel) uses
  `cultureEndsWith` of `src/system/CompareInfo.ts`. `IndexOf("AMLEd",
  StringComparison.InvariantCultureIgnoreCase)` in AMLFileMetaModel is emulated: ignorable
  characters (controls, default ignorable code points) are skipped, letters match ignoring case
  and compatibility forms (except full and half width forms); a match followed by a combining
  mark is no match (the mark belongs to its last letter). Other ICU subtleties (contractions,
  ignorable characters between the match and a combining mark) are not emulated.
- System.Text.Json: a null input throws ArgumentNullException("json") for both overloads (the
  stream overload names the parameter "utf8Json"). On writing, the depth check of list items is
  made for objects and arrays only (System.Text.Json also checks null items of object lists; the
  catalog has no list deeper than 6). Errors of the file system other than a missing file or
  directory are the errors of node:fs. ReadAutomationMLLibraryInformation does not dispose its
  FileStream in C#, so the file stays locked until the stream is collected (a later Save to the
  same file fails with IOException); the port reads the file completely and keeps no handle.
- EnumDescriptionTypeConverter: an enum value is a number, so a number is always taken as a value
  of the converter's enum (C# `value.GetType()` would be Int32 for a plain integer). For a string,
  `GetType().GetField(value)` finds only the field `String.Empty`, so "Empty" converts to "Empty"
  and every other string to "". The type names in the NotSupportedException messages are .NET
  names for strings, booleans, numbers and the table enums, constructor names otherwise
  ("System.Enum" for an enum outside the table). Enum[] and InstanceDescriptor conversions and
  the other members of EnumConverter (GetStandardValues, IsValid, ...) do not exist. The
  FormatException has no inner exception.
- ClassRepositoryItem: `equalityKey()` is a string over the type name and the properties (C#
  combines hash codes; the key is consistent with `equals`).

## Errors of the original kept

- `PublicLibraryCatalog.LibVersions(tagName, libraryName, caexVersion)`: the condition is inverted
  against the documentation. With a CAEX version all versions are returned; without one the
  versions are filtered by `IsCaexVersion(caexVersion)`, which throws for `null` as soon as there
  is a version (NullReferenceException in C#, TypeError here).
- `LibraryVersion.SemanticVersion` (a getter) appends ".0" to `Version` when it has less than two
  parts, so reading it changes the version string (HighestVersion reads it for every comparison).
  A null Version throws.
- `AMLFileMetaModel`: for a library file name with less than five parts, the edition is
  `FilePath.Substring(index, 6)` after "AMLEd": a path that ends less than six characters after
  "AMLEd" throws ArgumentOutOfRangeException; "AMLEd" at index 0 is not found (`> 0`). The URL
  setter and the analysis dereference URL and FilePath without null checks.
- `AddSource(null)` with empty Sources sets Sources to null and then throws.
- `SignedLibraryVersionExtensions.AddRevision`: for an ISignedLibraryVersion that is neither a
  LibraryVersion nor a LibraryRevision, `(x as LibraryRevision).RelatedLibraryVersion` throws.

## Engine changes

- `src/system/Json.ts` (new): the System.Text.Json emulation of AMLLibraryServerProfile, moved
  unchanged and made reusable: `escapeJsonString`, `writeJson` (indented), `writeJsonCompact`,
  `serializeJson`, `JsonException` (now with `name = 'JsonException'`), `JsonReader`,
  `unescapeJson`, the converter base class `JsonDeserializer` (`readString`, `readInt`,
  `readBool`, `readProperties`, `readList`, JSON path), `deserialize(json, create, readRoot)` and
  `utf8JsonText(bytes)`. Added: the message for input without any token ("The input does not
  contain any JSON tokens. ..."); AMLLibraryServerProfile never passes such input (it rejects
  empty and white space profiles first). `AMLLibraryServerProfile.ts` keeps only its converters
  (`ProfileDeserializer extends JsonDeserializer`), test/engine/gapsservices.oracle.test.ts.
  Corrected in the verification (test/services/resources.oracle.test.ts, also for the profile):
  "when isFinalBlock" in that message; the maximum depth of 64 when reading (error at the opening
  bracket) and writing (JsonException "A possible object cycle was detected ..." with the member
  path, `JSON_MEMBER_NAMES`); a string with lone surrogates throws ArgumentException ("Cannot
  transcode invalid UTF-16 string to UTF-8 JSON text."); `deserialize` takes the bytes and
  decodes them itself (one preamble skipped, invalid bytes kept as U+DC80..U+DCFF so that a string
  value fails as System.String, a syntax error prints 0xNN and positions count bytes); a property
  name with invalid surrogate escapes fails as the object type (`readProperties` takes the .NET
  type name); a '/' right after a property name, '{' or '[' has the message of a comment after a
  value; lone surrogates are written as \uFFFD.
- `src/system/TypeConverter.ts` (new): System.ComponentModel.TypeConverter base class, with
  `registerNetTypeName` for the .NET names in its messages.
- `src/engine/resources/files/SemanticVersion.ts`: registers itself in the registry
  (`T.SemanticVersion = SemanticVersion`), which now lists it, and its .NET type name.
- `src/engine/amlobjects/internal/NetPath.ts`: `getFileName` cut a path at a ':' in the first two
  characters also without a drive letter ("Ⅿ:x", ":x"); .NET only cuts the root ("C:").
- `src/system/exceptions.ts`: DirectoryNotFoundException (Save to a missing directory,
  ReadAutomationMLLibraryInformation).
- `src/engine/resources/libraries/AMLLibraries.ts`: `getManifestResourceStream` and
  `readAutomationMLLibraryInformation` added, getAutomationMLLibrary unchanged in behaviour.
- `src/engine/services/interfaces/IAMLLibraryService.ts`: the placeholder types AMLFileMetaModel
  and PublicLibraryCatalog are type imports of the ported classes. `IClassRepository.ts` (types
  ClassRepositoryItem and StringComparisonAlgorithmEnum) and `AMLLibraryServerDataProfile.ts`
  (AMLFileContentType as number) still have their placeholders.
- `src/engine/streaming/DocumentStreaming.ts` keeps its private reimplementation of
  `new AMLFileMetaModel(url, LibraryFile).SemanticVersion`: it is not the same computation (ASCII
  digits only in the version regex, own version record and comparison, no
  ArgumentOutOfRangeException for short paths ending in "AMLEd", Path.GetFileName with the
  Windows rules on every platform).

## Verification

Compared with the original by `resources` (oracle/ServicesResourcesOracle.cs,
test/services/resources.oracle.test.ts); cases, deviations and coverage in
docs/coverage-notes/services-resources.md.
