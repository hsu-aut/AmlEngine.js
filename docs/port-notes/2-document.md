# Port notes: batch 2-document

Files (31 C# files, one TS file each, at the paths of `docs/type-map.tsv`):

- `src/engine/caex/commands/`: AddCmd, AddNewCmd, CAEXElementChangeEventArgs, CAEXElementChangeMode,
  CaexCommand, ICAEXCommand, InsertCmd, InsertNewCmd, MoveCmd, RemoveCmd, SetAttributeValueCmd,
  SetElementContentCmd, SetElementValueCmd, WeakEventSource
- `src/engine/caex/`: AttributeTypeLibType, CAEXDocument, CAEXFileType, ExternalReferenceType,
  InstanceHierarchyType, InterfaceClassLibType, RoleClassLibType, SourceDocumentInformationType,
  SystemUnitClassLibType
- `src/engine/schema/`: AMLSchemaManager, AMLSchemaManager2_15, AMLSchemaManager3_0,
  XmlSchemaElementInfo, XmlSchemaManager
- `src/engine/xml/`: IDocument, IXMLWrapper, XDocumentWrapper

One additional generated file: `src/engine/schema/data/xsd.ts` holds the two CAEX XSD files that
Aml.Engine embeds as manifest resources, verbatim (valid UTF-8, no BOM, checked for a byte exact
round trip). `AMLSchemaManager2_15/3_0.extractSchemaToFile` writes them, as the engine does when a
document is saved next to a file that already exists (`FilePath` setter, `SetSchemaLocation`).

## (a) Assumptions about APIs of other batches

- Static `Constructor` members keep the C# name `Constructor` (camel case would be `constructor`,
  which a JS class cannot have as a static member). The other batches that already exist use the
  same name (`InternalElementType.Constructor`, `AttributeFamilyType.Constructor`, ...).
- `CAEXBasicObject.insert` dispatches the two overloads `insert(caexObject, asFirst?, asIs?)` and
  `insert(pos: number, caexObject)`; the overrides in my library classes and `CAEXFileType` use the
  same two overload signatures and call `super.insert` with the matching form.
  `import(caexObject, name, withSubclasses)` and `caexSequence(caexObject)` as in C#.
- `CAEXLibrary<T>`: `createElementSequence` (settable, `(e: XElement | null) => ...`) and
  `libraryElements`, as batch 1/3 wrote them.
- `CAEXSequence.append(...tuples)` takes `[name, value]` arrays (the `NameValueTuple` of
  `ICAEXSequence.ts`); `insert`, `insertAt`, `import` as in C#.
- `new T.ValueSequence<string>(node, 'SuperiorStandardVersion', () => this)`: no run time type
  argument is passed (C# `ValueSequence<string>`).
- `ServiceLocator`: `undoRedoService` (`beginTransaction(doc, name)`, `pushCommand(cmd)`,
  `endTransaction(doc)`, `pause(doc)`, `resume(doc)`), `idService.generateNewID()`,
  `queryService`, `defaultQueryService` (`loadIDTable`, `loadPathTable`, `unloadIDTable`,
  `unloadPathTable`), `externalReferenceResolverService.loadOrGetReferencedDocument(extRef)`
  returning `{ document, message }` (the C# tuple `(CAEXDocument Document, string Message)`),
  `servicesDictionary` (a `Map`; its values are checked with
  `implementsInterface(x, 'IXMLDocumentRegistry')` and get `removeDocument(wrapper)`).
- `DocumentStreaming.prepareSettingsWithCredential(inputUrl, settings)` returns
  `{ result, localPath }`; `settings` is a plain object standing in for `XmlReaderSettings`
  (`{ ignoreComments: false, ignoreWhitespace: true [, async: true] }`), which the JS loader does
  not use otherwise.
- Extension methods called as static members: `XmlCAEXSchema.schemaManager(node)`,
  `.caexSchema(element)`, `.isBasicAttribute`, `.isExternalInterface`, `.isInternalElement`;
  `XmlOperation.firstElement/lastElement(parent)`;
  `CAEXPathBuilder.instanceIDInAttributeReference(ref, doc)` returning
  `{ result, isAttributeReference }`; `CAEXPathBuilder.isValidID(id, doc)`;
  `XmlTypeCodeExtensions.defaultDecodedValue/defaultEncodedValue(code)`.
- `src/system/index.ts` exports `EventSource`, `EventArgs` (events.ts), `DateTime` (with
  `minValue` and `ticks`), `XmlConvert` (`toDateTime(s, mode)`, `toString(dateTime, mode)`) and
  `XmlDateTimeSerializationMode`. At the time of writing `src/engine/streaming/DocumentStreaming.ts`
  does not exist yet (the only "Cannot find module" error, in `CAEXDocument`). The remaining type
  errors in my files come from other batches' types (`CAEXSequence` not yet assignable to
  `ICAEXSequence` because of its `indexOf` signature, which `CAEXBasicObject` hits too, and
  `AttributeFamilyType` not yet satisfying `CAEXObject`). The project's own `npx tsc` currently
  stops at a syntax error in `StringExtensions.ts` (raw U+2028/U+2029 in a regex literal, another
  batch); I checked on a copy with that line escaped.
- `SourceDocumentInformationType.lastWritingDateTime` passes a possibly null attribute value to
  `XmlConvert.toDateTime` (C# throws ArgumentNullException there; the JS behaviour is whatever
  `XmlConvert.toDateTime(null)` does).
- Events: C# `event` members with add/remove accessors (`CaexCommand.CAEXElementChangedEvent`,
  `CAEXElementChangingEvent`, `Commanding.CAEXElementChangedEvent/ChangingEvent`) are getters
  returning `{ subscribe(h), unsubscribe(h) }` (`IEvent<T>` in WeakEventSource.ts), with handlers
  `(sender, e) => void`. `CAEXDocument.documentSavedEvent` is an `EventSource<string | null>`.
- Overloads with distinct names inside one class:
  - `XDocumentWrapper.document(x)` / `CAEXDocument.document(x)` dispatch on `instanceof XNode`;
    a `null` argument takes the XNode overload (C# needs a typed null; the XNode overload returns
    the only live document for a node outside any document). The overloads are also available
    explicitly as `documentOfNode(node)` and `documentOfWrapper(obj)`.
  - `CAEXDocument.amlSchemaManager(x)`: same dispatch; `null` takes the XElement overload.
  - `CAEXDocument.finalizeSchemaTransformation()` / `(XElement)` / `(Iterable<XElement>)`
    dispatch on argument count and `instanceof XElement`; the list overload is also
    `finalizeSchemaTransformationList(list)`.
  - `CAEXDocument.transformToSchema(schema: number)` returns the document,
    `transformToSchema(element: XElement)` returns a boolean.
  - `XmlSchemaManager`: private overloads that share the name of a public virtual method have
    their own names, so that an override in a subclass does not intercept them (C# binds them
    statically): `createElementFromInfo`, `insertWithInfo`, `insertNewWithInfo`,
    `siblingBeforeWithInfo`. The private static `CanAddNew`/`CreateAttribute` are static
    methods with the same name as the public instance methods (TS allows both).
    `AttributeValueType(XmlSchemaAttribute)` is static, `attributeValueType(parent, child, attr)`
    the instance method.
  - `XDocumentWrapper.dispose()` is `Dispose()`, `dispose(true|false)` the protected
    `Dispose(bool)`.
  - `CAEXElementChangeEventArgs` constructor: 4 or 8 arguments as in C#.
- Out parameters: `hasChoiceOfElements`/`hasSequenceOfSimpleElements` return
  `{ result, onlyOne }`; `XmlSchemaManager.xmlSchemaInfo(p, c)` returns `{ result, info }`;
  `XmlSchemaManager.validate(doc)` returns `{ result, messages }`; `CAEXDocument.validate()`
  returns `{ result, violationLog }`.
- Streams are `Uint8Array`: `saveToStream`, `saveToStreamAsync` return the bytes,
  `loadFromStream(bytes)`, `loadFromBinary(bytes)`.
- `CancellationToken` parameters are kept in position (typed `unknown`, default `null`) and ignored.

## (b) C# behaviour not reproduced exactly

- **XmlSchemaManager.validate** (`Validate(XDocument, out string[])`) and therefore
  `CAEXDocument.validate()` throw `NotImplementedException`: XSD validation does not exist in JS
  yet. To be done separately.
- **Schema construction**: the constructor takes `SchemaData` (from `unpackSchema(...)`) instead of
  an XSD stream. `Elements` is filled from the exported dictionary (same keys, same order, one
  `XmlSchemaElementInfo` per distinct info of the engine); `ParseElement`/`ParseSequence` are
  empty. `SchemaSet` and `Schema` hold the `SchemaData`. `XmlSchemaElementInfo.setInfo` applies
  the namespace to the exported name lists; `RequiredAttributes`/`AllAttributes` are computed
  from the attribute uses in Hashtable order exactly as in C#.
- `XmlSchemaElementInfo.getChildElements` (and `XmlSchemaManager.childElements`) return the
  child schema elements by resolving the exported child names through the dictionary
  (`parentName + childName`), instead of walking the content particle. If two declarations with
  the same parent element name exist in the schema, the engine's dictionary entry (the first
  one parsed) is returned.
- `getAnnotation(...)` returns the annotation strings the engine computed (exported per element
  and attribute); annotations of other `XmlSchemaAnnotated` objects (types) are not available
  (empty string).
- `attributeValueRestrictions` yields the facets as `{ kind, value }` objects (C#: XmlSchemaFacet
  objects). It yields nothing for union and list types (their content is no restriction).
- `maxOccurence`, `minOccurence`, `maxOccurrence` return `number` (unbounded = `Infinity`, which
  stands for `decimal.MaxValue`), following `SchemaModel.ts`, not the `Decimal` class.
- **XDocumentWrapper table** (per coordinator correction): instead of a
  `Dictionary<XDocument, WeakReference>` the table is a `WeakMap<XDocument, XDocumentWrapper>`
  for the lookup plus a `Set<WeakRef<XDocumentWrapper>>` (pruned of dead references on every
  access) used only for the quirk "a node outside any document resolves to the only live
  document". `unload`/`removeDocument` delete from both; re-registering an XDocument with another
  wrapper drops the old wrapper's reference. Consequences: a discarded document is freed with its
  wrapper (in .NET the table kept the XDocument alive until a later cleanup); a wrapper stays
  alive as long as its XDocument is reachable (in .NET the wrapper could be collected while the
  XDocument lived, so `Document(node)` could return null); IXMLDocumentRegistry services are not
  notified for entries that die by garbage collection (their XDocument is gone), only for
  explicit `unload`/`dispose`.
- **WeakEventSource**: JS has no weak delegates; handlers are held strongly and are never dropped
  automatically (`WeakDelegate.invoke` always returns true). `unsubscribe` removes the first
  registration of the same function (C#: same target and method). The open delegate cache
  (`OpenHandlerCache`, `CreateOpenHandler`) has no equivalent and is omitted.
- **SetAttributeValueCmd** compares `NewValue != OldValue` as object references in C#. The port
  treats the values as different unless both are null or both are the identical fallback `""`
  the constructor assigns (to a null value of a required attribute). This only affects whether
  events fire and whether the command changes anything; the command is pushed to the undo
  service either way, as in C#.
- `SetElementContentCmd`: `NewValue != OldValue` is always true (OldValue is a fresh array), as in C#.
- **Loading**: `loadFromString(Async)` = `parseXDocument(text, { preserveWhitespace: true })`
  (catch-all, returns null; ArgumentNullException for null/empty). `loadFromStream/Binary/File`
  = `loadXDocument(bytes, { preserveWhitespace: false })` (XmlReader with IgnoreWhitespace; DTD
  prohibited). `SetBaseUri` has no equivalent. `loadFromBinary(null)` throws
  `ArgumentNullException('buffer')` (the MemoryStream constructor).
- `loadFromFile` (Node only): after `prepareSettingsWithCredential`, the bytes are read from the
  local path (`localPath` for absolute paths and file URIs, the given path otherwise);
  a missing file gives `FileNotFoundException("Could not find file '<full path>'.")`. A
  synchronous load from an http(s) URI throws `NotSupportedException`; `loadFromFileAsync`
  fetches http(s) URIs with `fetch` (no credentials from the URI's user info; a failing status
  throws an Error named `HttpRequestException`).
- File.Exists (used by `loadFromFile` and the `filePath` setter) is false where no file system is
  available (browser), so the setter never extracts the XSD there.
- `saveToFile`: `writeXDocument(doc, { indent: true, omitDuplicateNamespaces: true,
  encodingName: 'utf-8', omitXmlDeclaration: false })`, written as UTF-8 without BOM;
  `prettyPrint` is ignored as in C#. `saveToFileAsync` uses `omitXmlDeclaration: true` (as the C#
  XmlWriterSettings of that method). Both need Node; without it they throw
  `NotSupportedException` (after the FilePath/FileName side effects, where C# would fail in
  `XmlWriter.Create`). `Path.GetFileName`, `Path.GetDirectoryName`, `Path.Combine` and
  `Path.GetFullPath` are emulated with `node:path`.
- `XDocumentWrapper.saveToFile` writes `saveXDocument(...)` bytes to `path.resolve(filename)`.
- `ExternalReferenceType.insertAfter/insertBefore` throw `System.Exception` in C#; there is no
  such class in `src/system`, the port throws an `Error` with `name = 'Exception'`.
- `Uri.UnescapeDataString` (ExternalReferenceType.pathAreEqual) is implemented locally: %XX
  escapes forming valid UTF-8 are decoded, others are left as they are.
- `CAEXFileType.import/insert`: `caexObject is CAEXLibrary<InterfaceFamilyType>` (etc.) cannot be
  tested in JS (no reified generics). The port accepts an instance of the library wrapper class
  (`InterfaceClassLibType`, ...) or any `CAEXLibrary` whose node has the library tag name
  (`InterfaceClassLib`, ...).
- `SourceDocumentInformationType.Properties` (a record) is a class with public fields and a
  record-like `equals` (DateTime compared by ticks, like DateTime.Equals).
- `CAEXDocument.getDescription` uses a table of the `[Description]` attributes.
- `lock` blocks are dropped (single threaded).

## (c) Apparent bugs of the original, ported unchanged

- `XmlSchemaManager.InsertNew(info, ...)` calls the private `CanAddNew` with `info.SchemaElement`
  (an element, never a choice), so the choice check never prevents insertion there; only the
  public `canAddNew(parent, childName)` checks the parent particle.
- `AMLSchemaManager3_0.adjustCAEXFileToSchema` looks for `AdditionalInformation` children without
  namespace after moving the CAEXFile into the CAEX namespace.
- `SetElementContentCmd` stores all *descendant* nodes (not only the child nodes) for undo, so
  undo re-adds nested nodes a second time (as copies).
- `CaexCommand.DisplayName` and `XDocument` are never assigned (always null).
- `CAEXDocument.loadFromStringAsync` rewrites the root start tag of strings containing
  `SchemaVersion="3.0"` without `xmlns` in the first tag, cutting at `indexOf('CAEXFile') + 9`
  (throws ArgumentOutOfRangeException if there is no `>`).
- `CAEXDocument.Validate` / `TransformToSchema` etc. as in C#; `FinalizeSchemaTransformation()`
  on a document without root fails with a null dereference (TypeError).

## (d) Left undone

- XSD validation (`XmlSchemaManager.validate`, `CAEXDocument.validate`).
- No oracle comparison was run for this batch (other batches are still missing; a smoke run with
  stubs produced the expected new-document XML for CAEX 3.0 and 2.15 and the expected command
  events).
