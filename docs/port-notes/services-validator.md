# Port notes: Aml.Engine.Services validator

Files: `src/services/ValidatorService.ts`, `ValidationElement.ts`, `ValidationKey.ts`,
`ValidationResults.ts`, `ValidationTypeEnum.ts`, `RepairTypeEnum.ts`, `RepairTypeEnumConverter.ts`
(Aml.Engine.Services 4.3.1). The validator finds validation issues of a CAEX document (meta data,
IDs, names, CAEX paths, ID, path and name references, external references, alias references,
external data connectors, internal links, cardinality, direction and category of interfaces) and
repairs some of them. MergeService uses it to remove resolvable aliases.

## API decisions

- **ValidatorService** implements `IValidator_1<ValidationElement>` and registers `IValidator_1`,
  `IValidator` and `IAMLService`. `register()` registers the service under `'IValidator'` as C#
  does. The constructor is private in C#; here it is public, because the class is passed as a
  type argument (`ServiceLocator.beginService(ValidatorService.register, ValidatorService)` in
  MergeService) and to `registerInterfaces`, and TypeScript does not allow a private constructor
  type there.
- **validateAll** is one method for both C# overloads: a boolean or missing second argument is
  `ValidateAll(document, generateLongDescription)`, anything else (a container or `null`) is
  `ValidateAll(document, container, generateLongDescription)`. `validateAllWithoutStrictID` and
  `validateAliasReferences` keep their C# parameters.
- **Laziness**: the public methods are not iterators in C#. They call InitValidation (load the ID
  and path tables of a query service that is an `ILookUpTable`) at the call and return an iterator.
  The port does the same and returns an `Enumerable` that runs the iterator anew for every
  enumeration, like an IEnumerable from `yield return`; FinalizeValidation (unload the tables the
  validator loaded) runs at the end of a complete enumeration. Every private iterator method is
  ported the same way (`seq(function* () { ... })`) and keeps its laziness; `ValidateAliasReference`
  returns a list in C# and an array here. The two flags `_unloadIDTable` and `_unloadPathTable` are
  static, as in C#.
- **canLocateFile** (`internal`, `ref string message`) returns `{ result, message }`.
- **normalizeFilePath(relativePath, caexFile)** stays public static (ExternalReferenceResolver
  uses it); it accepts a `null` CAEXFile type-wise and fails on it like C#.
- **Internal constants** follow the naming rule: `invalidschemakey`, `noamlversionkey`,
  `nonamekey`, `noschemakey` (marked `@internal`). Internal methods of ValidationElement
  (`renameElement`, `repairSchemaVersion`, ...) are public and marked `@internal`.
- **ValidationElement**: `availableRepairOptions` (internal set in C#) is a public field;
  `repairResult` has a getter only. `equals` compares the runtime type (GetType), the CAEX
  elements (CAEXWrapper `==`) and the validated attribute. `equalityKey` returns the key of the
  CAEX element: C# hashes `CAEXElement.GetHashCode() ^ ValidatedAttribute.GetHashCode()`; the
  coarser key is consistent with `equals`. Like C#, it throws when the element is no CAEX element
  or no validated attribute is set (NullReferenceException in C#, TypeError here).
- **ValidationKey** derives from `Tuple<string, ValidationTypeEnum>` in C#. The port has the Tuple
  members on the class: `item1`, `item2`, structural `equals`/`equalityKey` and `toString`
  ("(key, IDValidation)"). The explicit interface members of Tuple (IComparable,
  IStructuralComparable, IStructuralEquatable, ITuple) are not ported. Aml.Engine.Services does not
  use ValidationKey as a dictionary or set key; only its `key` and `validationType` are read.
- **RepairTypeEnum** keeps the numeric values of the [Flags] enum, including the members that share
  a value (0x20, 0x40, 0x10000; the reverse mapping `RepairTypeEnum[x]` gives the last of them).
  Neither RepairTypeEnum nor ValidationTypeEnum has [Description] attributes, so there is no
  description table. `Enum.HasFlag(f)` is `(value & f) === f`.
- **ValidationResults** and **RepairTypeEnumConverter** are static classes whose methods take the
  `this` argument first. Each filter is a lazy `from(sequence).where(...)`; the C# range tests
  `(uint)(type - 6) <= 2` and `(uint)(type - 10) <= 3` are written as ranges of the enum.
- **Object initializers** (`new ValidationElement(...) { A = x, B = y }`) are
  `Object.assign(new ValidationElement(...), { a: x, b: y })`: all values are evaluated before
  the first assignment. No value expression reads the new element, so nothing observable differs.
- `DateTime.Now.ToString(CultureInfo.CurrentCulture)` (writer header repair) is
  `DateTime.now.toString()`, the invariant culture of the oracle ("MM/dd/yyyy HH:mm:ss").
- `string.Replace` is `replaceAll` (ordinal, the replacement is always empty), `TrimStart('/')` and
  `TrimEnd('@')` are regular expressions, `fileRef.StartsWith("/")` (culture sensitive) is
  `cultureStartsWith`, `Scheme.Equals("file", InvariantCultureIgnoreCase)` is
  `equalsOrdinalIgnoreCase` (schemes are ASCII).
- `GroupBy(s => s.CaexObject.GetType())` groups by the constructor of the wrapper.
- `MappingElementType<ExternalInterfaceType>` is tested with `instanceof MappingElementType`; at
  that point the object is an InterfaceIDMapping or an ExternalInterface, so the erased generic
  argument does not matter.
- `IUniqueName.UniqueCAEXName(Element.Parent, ...)` passes the parent and the default name as C#
  does, also when they are `null` (the XElement overload).

## Files and network

- `File.Exists` uses `NetPath.fileExists` (node:fs) and is `false` where no file system is
  available (browser), as `CAEXDocument` does. `Path.GetFullPath` is `NetPath.getFullPath`
  (node:path): in NormalizeFilePath it is inside the C# try block, so in a browser the method
  returns its input; FilePathFromValue returns `''` without a file system, which is what all its
  paths give when `File.Exists` is false.
- CanLocateExternalFileReference: for http and https C# blocks on
  `ExternalReferenceResolver.GetResponseFromWebServerAsync(uri).Result` inside a try block whose
  catch returns `false`. The port takes that path (no request; ExternalReferenceResolver is not
  called). For ftp C# sends an `FtpWebRequest` without a catch block; the port throws
  `NotSupportedException`. Both are listed in docs/deviations.md ("ValidatorService: references
  over the network").

## Errors of the original kept

- `ValidateAliasReferences(document, generateLongDescription)` ignores `generateLongDescription`
  and never generates long descriptions.
- `RepairTypeDescription`: `HasFlag(None)` is always true, so every value without one of the
  checked flags (also GenerateXmlName and CheckAliasInExternalReference) gives "No option"; the
  `ToString()` branch is unreachable.
- ValidateIDReference can yield the same ValidationElement twice for one reference: once for a
  reference out of the allowed scope and again, with its information text overwritten, for a
  referenced object of the wrong type.
- GetPathValidationIssues groups ambiguous paths by `CaexObject.GetType()` without a null check;
  a reference without CAEX object fails (NullReferenceException in C#, TypeError here).
- The documentation of `EmptyPathRefs` says "not resolvable", the filter selects empty references
  (RemoveEmptyReference); `EmptyIDRefs` uses the same filter.

## Engine changes

- `src/system/XmlConvert.ts`: `XmlConvert.verifyXmlChars(content)` (additive), used by the name
  validation. It follows `XmlConvert.VerifyCharData` of .NET 8: valid are #x9, #xA, #xD,
  #x20-#xD7FF, #xE000-#xFFFD and surrogate pairs; otherwise an XmlException with the .NET message
  ("'c', hexadecimal value 0x01, is an invalid character.", U+0000 shown as '.'; the two surrogate
  messages) and the line position `i + 1`.

## Open points for the verification against the original

- The messages of `verifyXmlChars` for lone and unpaired surrogates (taken from the .NET sources,
  not yet compared with the oracle).
- The order of the issues follows the order of the lookups of the query service (and of
  LookupService, when registered); compare complete `validateAll` results of the corpus, with and
  without `generateLongDescription`, with the ID and path tables loaded and not loaded.
- Repairs: compare the saved documents after `repair` of every repairable issue, in particular the
  writer header (date text), RenameElement with and without a registered UniqueNameService, and
  ChangeFileURLToRelative.
- File references relative to the document path on Windows and Linux (Uri parsing of rooted paths
  with `UriKind.RelativeOrAbsolute` differs between the platforms in .NET).
- AutomationML containers: part lookup with escaped and unescaped part names.
