# Port notes: XML extensions, services and streaming

Files: `src/engine/xmlext/*` (XmlOperation, XmlCAEXSchema, XmlCAEXAttributes, XmlClassOperation,
XmlCAEXMapping, XmlLinqExtensions), `src/engine/services/*` (ServiceLocator, QueryService,
QueryResult, CaexIDService, CAEXReference, EmptyLookup, SignatureServiceBase),
`src/engine/services/interfaces/*` (26 interfaces + SchemaTransformationEventArgs,
UpdateEventArgs), `src/engine/services/model/*`, `src/engine/services/utilities/ByteArrayConverter.ts`,
`src/engine/adapter/*`, `src/engine/streaming/DocumentStreaming.ts`,
`src/engine/resources/catalogue/*`.

## API decisions

- **ILookup**: System.Linq has no lookup in `src/system/linq.ts`, so `EmptyLookup.ts` exports
  `ILookup<K, T>` (iterable of `IGrouping` with `key`; `count`; `item(key)` = indexer, empty
  sequence for unknown keys; `contains(key)`), the class `Lookup` and `toLookup(source, keySel,
  elemSel)` (eager, insertion order). `EmptyLookup.instance` is one shared empty lookup for all type arguments.
- **Tuple results** (C# named tuples) are objects with camelCase fields: `{ name, value }`
  (IDReferencesInInternalLink, IDReferenceInMapping), `{ document, message }`,
  `{ success, description }`, `{ isSuccessful, description }`, `{ publicKey, privateKey }`,
  `{ isValid, message }`. `out` parameters follow the `{ result, <name> }` rule.
- **XmlCAEXSchema and AMLEngineAdapter are namespace objects** (`export const X = { ... }`), not
  classes, because both have an extension method `Name` and a static class member `name` clashes
  with `Function.name`. Calls look the same (`XmlCAEXSchema.name(obj)`). CAEXBasicObjectExtensions
  solves the same clash with a rename (`name_`).
- **ServiceLocator generics**: the type argument is an extra parameter, an interface name
  (`'IQuery'`, checked with `implementsInterface`) or a class (checked with `instanceof`, key =
  constructor name): `getService('ISigning')`, `beginService(register, type)` → `{ service }`,
  `unRegister(type)`, `register(service, type?)`. Without `type`, `register` uses the constructor
  name of the service (the static type C# usually infers); the defaults are registered under
  `'IQuery'` and `'ICaexIDService'` like the C# static constructor (which is lazy: first use).
  `queryService` and `idService` are typed non-null, the other service getters nullable.
- **Overloads in interfaces** are one signature with unions/optional parameters (IQuery,
  ISigning, IUniqueName, IExternalReferenceResolver, IMerge, ISplit, IValidator_1, ICaexIDService).
  Streams are `Uint8Array`; `HttpResponseMessage` is the fetch `Response`.
- **SignatureServiceBase.verifySignature** dispatches on the argument count: 2 arguments call the
  abstract `verifySignatureWithPublicKey(obj, publicKey)` (C# abstract overload), 3 arguments the
  virtual `verifySignatureWithSignature(obj, signature, publicKey)`. Derived services override
  these two.
- **XMLSignatureElement family** works on XLinq: `getXml(document?)` returns an `XElement` (the
  XmlDocument argument is accepted and ignored), `loadXml(XElement)`,
  `XMLSignature.loadFromDocument(XDocument)`. `CryptographicException` is defined in
  `XMLSignatureElement.ts` (not in `src/system/exceptions.ts`).
- **Types of the assembly Aml.Engine.Resources** are ported (docs/port-notes/resources.md).
  IAMLLibraryService uses the classes `AMLFileMetaModel` and `PublicLibraryCatalog`; the
  placeholders of IClassRepository (`ClassRepositoryItem` as `unknown`,
  `StringComparisonAlgorithmEnum` as `number`) and of AMLLibraryServerDataProfile
  (`AMLFileContentType` as `number`, values as in the C# enum) remain.
- `DocumentStreaming.prepareSettingsWithCredential(url, settings)` → `{ result, localPath }`;
  `settings` is `XmlReaderSettings` (`xmlResolver?: XmlUrlResolver` with `credentials:
  NetworkCredential | null`, other keys allowed). `NetworkCredential` is exported from
  `AMLLibraryServerProfile.ts`.
- `XmlOperation.idMap` (C# `IDMap`) is typed `Map<string, string> | null` (it is null outside a
  copy); InterfaceFamilyType/SystemUnitFamilyType pass it where a non-null map is expected.
- **QueryService.FindByID without ID table** gives the result of the original (the first element in
  document order whose `ID` attribute matches), but does not search the whole document for every
  call. Per document it keeps the first element per ID that its searches have passed and where
  the last search stopped, until an element or attribute changes in any tree (`treeVersion` in
  `src/xml/XNode.ts`, counted where elements and attributes are added or removed and where an
  attribute value is set). The first search after a change is the plain search of the original.
  `test/engine/findbyid.test.ts` checks every kind of change; with `AMLENGINE_CHECK_ID_TABLE=1`
  every FindByID of the test suite is compared with the plain search
  (`test/setup/check-id-table.ts`).
- `XmlCAEXSchema.isElementWithIDReference(e, ID?)`, `isElementWithPathReference(e, path?)`,
  `XmlOperation.firstElement(p, localName?)`, `lastElement(p, name?)` select the second C#
  overload only for a string/null (or XName) argument, so passing them as LINQ callbacks (index
  argument) is safe.

## C# behaviour not reproduced exactly

- Culture-sensitive `StartsWith`/`EndsWith` (XmlCAEXMapping role lookup, QueryService
  ElementsWithAliasReference, AttributeMirrors, IsMaster(AttributeType)) are ordinal here; they
  differ from .NET only for ignorable code points and canonically equivalent sequences in names
  (the extension methods use the culture sensitive comparison of `src/system/CompareInfo.ts`).
- `Path.GetFileName`/`GetFileNameWithoutExtension`: reimplemented with the Windows rules ('\\',
  '/', drive root).
- **DocumentStreaming**: no streaming reader. The document is parsed completely (whitespace kept,
  DTD prohibited) and a cursor emulates MoveToContent/Read/ReadSubtree/XNode.ReadFrom/
  ReadToFollowing. Differences: a well-formedness error anywhere fails the whole load (C# only
  sees the part it read before `canClose`); the URL variant then returns an empty list, the byte
  variant throws when enumeration starts. XmlReader.Name is approximated from the element's
  namespace and in-scope prefixes. Elements handed to the creators are detached deep copies that
  keep whitespace text (the reader does not ignore whitespace).
  Synchronous methods read local files in Node; http(s), GitHub or a runtime without file access
  throw NotSupportedException (deliberately not swallowed by the C# catch-all). Added
  `streamElementWithNameAsync`, `readExternalReferenceTypeAsync`, `new/oldDocumentVersionsAsync`
  (fetch; URL user info becomes a Basic Authorization header; `CredentialCache.DefaultCredentials`
  has no equivalent).
- DocumentVersions needs `AMLFileMetaModel`/`SemanticVersion` from Aml.Engine.Resources: the used
  part (library file name analysis Producer_Domain_LibType[_Extension]_Edition_Version, strict
  semantic version parse and comparison) is reimplemented privately in DocumentStreaming.ts. It
  was written before the Resources port and is not the same computation as the ported
  AMLFileMetaModel (ASCII digits only, no ArgumentOutOfRangeException for short paths ending in
  "AMLEd"), so it is kept.
- PasswordProtected: the synchronous `password` uses node:crypto (AES-256-CBC, PKCS7, random IV,
  SHA-256 key, as Aes.Create()). Without node:crypto the operation fails inside the try block and
  returns null after the console message, like any C# failure. Added `getPasswordAsync`/
  `setPasswordAsync` (WebCrypto, same format). The console text of the exception differs.
- AMLLibraryServerProfile JSON: System.Text.Json emulated in `src/system/Json.ts` (property order
  derived class first, enums as numbers, nulls written, default JavaScriptEncoder escaping, 2-space
  indentation, CRLF = Environment.NewLine on Windows; JsonException messages with path and
  position); the profile module holds the converters of its types. `loadFromFile` is Node only
  (File.ReadAllText BOM detection reimplemented).
  `IJsonOnDeserialized.OnDeserialized` is the public method `onDeserialized()`.
- ByteArrayConverter: `read(jsonValue)` / `write(bytes)` on parsed JSON values instead of
  Utf8JsonReader/Writer.
- ServiceLocator: no InvalidCastException when the value stored under the type name is not of
  that type; constructor names as keys are affected by minification.
- XMLSignature on XLinq: `LoadFromString` uses XDocument.Parse (whitespace handling of
  XmlDocument.LoadXml differs only in ignored whitespace nodes); `HasAttribute(localName)` is
  mapped to the attribute without namespace.

## Errors of the original, ported unchanged

- XmlCAEXMapping: `XPathSelectElements("./RoleRequirements | ./SupportedRoleClass")` matches only
  children in no namespace, so for CAEX 3.0 documents RoleReferenceToMapping /
  MappingPathToRoleReference never find role references below an InternalElement (implemented as
  local name AND empty namespace, document order). Not reachable: RoleFromMapping calls
  RoleReferenceToMapping for CAEX 2.15 only (no namespace), and MappingPathToRoleReference has no
  caller.
- `IsInterfaceAttributeReferenceWithID` evaluates RoleAttributeName twice (the second lookup was
  probably meant for SystemUnitAttributeName).
- `XmlOperation.MasterAttribute` reads `refAttribute.Value` before its null check;
  `XmlClassOperation.OverriddenElements` dereferences a null ancestor; `RoleFromMapping` calls
  `parent.CAEXSchema()` before the null-conditional; `GetPartialNodeCAEXPath` loops forever when
  `root` is not an ancestor (the port throws ArgumentException there, docs/deviations.md).
- DocumentStreaming: after `XNode.ReadFrom` the loop's `Read()` skips the next node, so in the
  byte variant an element directly following a matched element (no whitespace between) is not
  seen (neither matched nor tested with canClose); the same happens to adjacent Revision
  elements in DocumentVersions. Correctable: fix `streamingAdjacentElements` (docs/fixes.md).
- `XMLSignature.LoadXml` always creates a KeyInfo (even without a KeyInfo element); `GetXml`
  afterwards throws because its KeyValue is null.
- `AMLLibraryServerProfile.CanTryLogin` is `_invalidTries <= 3` (MaxTries unused), `Block` sets
  4; `GetResolvedBaseAddress` dereferences a null BaseAddress; `BackupFileType` throws for names
  shorter than 3 characters or a digit above 7.
- QueryService.ElementsWithCAEXPathReference: a missing but required reference attribute
  matches when the base class is not found (`null == baseClass?.Name`). Dictionary lookups with a
  null document key throw ArgumentNullException('key') as in C#.
