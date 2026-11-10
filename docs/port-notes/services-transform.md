# Port notes: schema and edition transformers (Aml.Engine.Services)

| File | Ports |
|---|---|
| `src/services/CAEXSchemaTransformer.ts` | `CAEXSchemaTransformer` (ISchemaTransform, IAMLService): CAEX 2.15 to 3.0 and back |
| `src/services/transformator/CAEXSchemaUpgrader.ts` | `CAEXSchemaUpgrader` (internal in C#): the 2.15 to 3.0 steps |
| `src/services/transformator/CAEXSchemaDowngrader.ts` | `CAEXSchemaDowngrader` (internal in C#): the 3.0 to 2.15 steps |
| `src/services/amltransformer/AMLEditionTransformer.ts` | `AMLEditionTransformer` (IAMLEditionTransform, IAMLService): AutomationML Edition 1 to Edition 2 |

## How the engine finds the service

As in C#: `CAEXSchemaTransformer.register()` registers the instance under `'ISchemaTransform'`
(`ServiceLocator.register(x, 'ISchemaTransform')`), `unRegister()` removes it, and the class
registers `ISchemaTransform` and `IAMLService` at run time (`registerInterfaces`).
`ServiceLocator.register` subscribes the engine's handlers to `transformationStarted` and
`transformationEnded`: the first sets `e.targetDocument = e.sourceDocument.transformToSchema(target)`
(a copy of the document with the target schema; the source document is not changed), the second
finalizes it. `transformTo` therefore depends on that registration for its target document, exactly
as the C# service does; `AMLLibraryType` (core) finds the registered service through
`ServiceLocator.getService('ISchemaTransform')`. The upgrader and downgrader work on that copy, which
already has the target schema.

`AMLEditionTransformer` uses the registered ISchemaTransform or starts one for the call:
`ServiceLocator.beginService(CAEXSchemaTransformer.register, 'ISchemaTransform').service` and
`ServiceLocator.endService(CAEXSchemaTransformer.unRegister, service)`.

## API decisions

- Events: `transformationStarted` and `transformationEnded` are `EventSource<SchemaTransformationEventArgs>`
  (`raise` for `?.Invoke`).
- The C# constructors are internal; the TS constructors are public and marked `@internal`.
  `register()` is the way to get an instance.
- Static methods: `register()`, `unRegister()`; members follow the naming rule
  (`transformTo`, `upgradeToSchema30`, `downgradeToSchema215`, `transformToEdition`, `isError`).
  C# method names with typos are kept (`exchangeExtenals`).

### transformToEdition and transformToEditionAsync (for docs/deviations.md)

`AMLEditionTransformer.TransformToEdition` is synchronous in C# and blocks twice on the library
service: `libService.LoadLibraryCatalogAsync(...).Result` (ExchangeExtenals, to replace external
references) and `libService.LoadClassRepositoryAsync(...).Result` (PrepareAttributeTypeLibrary, to
assign attribute types). JavaScript cannot block on a Promise.

- `transformToEdition` (the IAMLEditionTransform member, synchronous) runs exactly as the C# method as
  long as no load is needed: a document that is not CAEX 2.15, a document without external references
  or a server profile without `libraryCatalogData` (C# logs and returns before loading), and no
  attributes (other than nested ones) in system unit class, role class and interface class
  libraries or a server profile without `classCatalogData`. Where C# would load, it throws `NotSupportedException` ("Loading the library
  catalog synchronously is not possible in JavaScript; use
  AMLEditionTransformer.transformToEditionAsync.", or "class repository"). Nothing is returned then;
  the document passed in is unchanged (the transformation works on a copy), messages logged up to that
  point have been logged, and the ISchemaTransform service started for the call is already ended.
- `transformToEditionAsync(libService, document, edition, logger): Promise<CAEXDocument>` (not in C#)
  runs the same steps and awaits both loads. A load that rejects is thrown at the place of the load,
  i.e. the promise rejects with that error; C# `.Result` would wrap it in an `AggregateException`.
- Implementation: the C# body is written once, as generator methods (`transformToEditionSteps`,
  `exchangeExtenals`, `prepareAttributeTypeLibrary`) that `yield` a load where C# has `.Result` and
  receive its result. `runSynchronously` throws at the first yield (into the generator, so the
  `finally` blocks run), `runAsynchronously` awaits each load. Both public methods share every other
  line.
- `ExternalReferenceResolver.NoSynchronizationContextScope.Enter()` around the loads is kept
  (`enter()` ... `dispose()` in try/finally); it is a no-op in JS.
- The service keeps `_logger` and `_libraryCatalog` in fields as C# does. Two
  `transformToEditionAsync` calls on the same instance that run at the same time therefore share
  them (the later call's logger receives the messages of both after the first await); C# has the
  same race between threads.

## C# behaviour not reproduced exactly

- Culture-sensitive string operations under the invariant culture of the oracle:
  `message.StartsWith("ERROR")` (isError) and `LinkAddress.EndsWith(".aml")` use
  `cultureStartsWith`/`cultureEndsWith` of `src/system/CompareInfo.ts`; `Name.ToLower()` and
  `char.ToLower(name[0])` use `toLowerInvariant`; `DateTime.TryParse` uses the invariant parser of
  `src/system/DateTime.ts`.
- NullReferenceException: where C# dereferences null (for example a document without
  SourceDocumentInformation in the downgrader, a null `RefBaseRoleClassPath`, a null mapping name,
  a missing server profile of the library service), the port fails with a TypeError at the same
  place. `char.ToLower(name[0])` on an empty name throws IndexOutOfRangeException as in .NET.
- `string + null` and interpolated nulls are written as empty strings (`?? ''`) as .NET concatenates
  them.

## Errors of the original, ported unchanged

- `CAEXSchemaTransformer.TransformTo` disables the auto update service before it checks whether the
  two schemas can be transformed at all: with a document or target schema `Unknown` it returns null
  and leaves the auto update service disabled. Without try/finally, an exception in the upgrader or
  downgrader also leaves undo/redo paused and auto update disabled, and TransformationEnded is not
  raised.
- `CAEXSchemaTransformer.TransformTo` (upgrade) does not check `e.TargetDocument` for null (the
  downgrade does): without the ServiceLocator handlers the upgrader dereferences null.
- `CAEXSchemaUpgrader.CleanMirrorObjects` removes the interfaces and attributes of a mirror through
  their own nested sequences (`externalInterface.ExternalInterface.RemoveElement(externalInterface)`,
  `attribute.Attribute.RemoveElement(attribute)`, checked in the IL); `Remove(XElement)` does not
  check the owner, so the node is removed all the same.
- `CAEXSchemaDowngrader.MoveMappingTypeToInternalElement`: removing role requirement `i` (i > 0)
  shifts the next one to index `i`, which the loop then skips; the removed role requirement is
  removed a second time (a no-op).
- `CAEXSchemaDowngrader.MoveSourceDocumentInformationToAdditionalInformation` dereferences
  `SourceDocumentInformation[0]` without a check: a CAEX 3.0 document without SourceDocumentInformation
  cannot be downgraded (NullReferenceException; TypeError in the port), with the effects of the first
  point.
- `CAEXSchemaUpgrader.MoveAdditionalInformationToSourceDocumentInformation` ignores the result of
  `DateTime.TryParse`: an unparsable LastWritingDateTime becomes `DateTime.MinValue`.
- `AMLEditionTransformer`: `_libraryCatalog` survives between calls, so `DocumentPath` (attribute
  types) uses the catalog of an earlier call when the current call did not load one (no external
  references or no LibraryCatalogData). The `edition` argument is not used for attribute types: the
  class repository is filtered for "AMLEd2" in every case. `flag` in TransformToEdition is always
  true. In GetDocumentLinkForNewEdition a library is added once per matching version (duplicates in
  the version list; the selected link is the same).

## Open points for the verification against the original

- `transformTo` in both directions on the corpus, compared on the saved XML of the target document
  and on the source document (unchanged). The LastWritingDateTime conversions
  (`DateTime.TryParse`, `XmlConvert.ToString(..., Local)`) depend on the local time zone in both
  engines; compare in the same zone.
- `AMLEditionTransformer` with a fixed IAMLLibraryService (same catalog and class repository in
  oracle and test): the oracle's `TransformToEdition` against `transformToEditionAsync` (document and
  logger messages, in order); `transformToEdition` against the oracle only for the cases without a
  load, and the NotSupportedException for the others.
- Order of the edition lookup: `GroupBy` (first occurrence of the library name) and
  `OrderByDescending(SemanticVersion)` (stable; ties keep the first version), as in LINQ.
- Attribute types created by `CreateAttributeTypeForReference`: name (first character lower case),
  unique names on insert, ID from the ID service (`CAEXObject.newGUID`), so compare with a fixed ID
  service or ignore IDs.

## Dependencies on other packages

- `ExternalReferenceResolver_NoSynchronizationContextScope` from `src/services/ExternalReferenceResolver.ts`
  (extref): used as `enter()` returning an object with `dispose()`.
- Resources types (`PublicLibraryCatalog` and its nested types, `SignedLibraryVersionExtensions`,
  `SignedLibraryVersionLink` `{ linkAddress, revision }`, `ClassRepositoryItem`,
  `StringComparisonAlgorithmEnum`, `AMLFileMetaModel`, `AMLFileContentType`, `SemanticVersion`).
- `IAMLLibraryService.loadLibraryCatalogAsync` and `IClassRepository.searchSimilar` are typed with
  `unknown` in the core interfaces; the transformer casts their results to `PublicLibraryCatalog` and
  `ClassRepositoryItem`.
