# Port notes: merge and split services

Files: `src/services/MergeService.ts` (MergeService), `src/services/SplitService.ts`
(SplitService), both of Aml.Engine.Services 4.3.1.

MergeService implements `IMerge` and `IAMLService`; it puts the libraries and instance hierarchies
of an externally referenced document into the document, takes over the external references the
document needs afterwards, removes the merged ExternalReference and repairs the alias references
with the ValidatorService. SplitService implements `ISplit`, `IAMLService` and
`IXMLDocumentRegistry`; it keeps a list of split points per document, moves the libraries and
InternalElements at the split points into a new document, saves it and adds an ExternalReference
to the source document. Both are registered at run time with `registerInterfaces` right after the
class.

## API decisions

- **`MergeService.merge`** is one method for both C# overloads, as the `IMerge` interface fixes it:
  a third argument that is a boolean or missing selects
  `Merge(document, externalReference, out mergeProtocol, autoTransform)`; a `Uint8Array` (or
  `null`) selects `Merge(document, externalReference, Stream externalSource, out mergeProtocol,
  autoTransform)`. The stream is the bytes of the stream, as `CAEXDocument.loadFromStream` takes
  it; `null` throws ArgumentNullException('inStream') there, as in C#. The result is
  `{ result, mergeProtocol }`.
- The private static `Merge(document, source, externalReference, out mergeProtocol)` is the static
  `merge`, beside the instance method of the same name (TS allows both). `LoadExternalSource`
  returns `{ result, source, mergeProtocol }`.
- **`SplitService.split`** dispatches on the fourth argument: `undefined` takes
  `Split(sourceDocument, alias, filePath)`, anything else (also `null`)
  `Split(sourceDocument, splitPoint, alias, filePath)`, as C# picks the overload by the number of
  arguments. The two bodies are the private methods `splitOnSplitPoints` and `splitOnSplitPoint`;
  the static local function `SaveSplitDocument` is a nested function at the end of the first,
  where C# has it.
- The constructor of SplitService is private in C#. It is public here, because
  `registerInterfaces` takes a public constructor type; the service is still created by
  `register()`.
- The C# method group `CAEXElementChangingHandler` stays a private method. It is subscribed to
  `CaexCommand.caexElementChangingEvent` through the field `_caexElementChangingHandler`, one
  function per instance, so that `unRegister` unsubscribes the same function (C# delegate
  equality on method and target). As in the engine's `WeakEventSource`, the subscription holds the
  service strongly until `unRegister`.
- The private field `SplitPointTable` keeps its C# name. `List<ISplitPoint>` is an array;
  `Contains` and `Remove` use the default equality (`DefaultComparer`, i.e. `CAEXWrapper.equals`:
  same node), `RemoveAll` calls the predicate once per item in order and compacts in place.
- ServiceLocator type arguments: `BeginService<ExternalReferenceResolver>` and
  `BeginService<ValidatorService>` pass the class (ExternalReferenceResolver has a private
  constructor and is passed as a constructor type), `BeginService<IUniqueName>` passes
  `'IUniqueName'`. `GetService<ISchemaTransform>()` and `GetService<IAutoUpdate>()` pass the
  interface names. `Register`/`UnRegister` method groups are passed as arrow functions, so the
  call does not depend on `this` in the called static method.
- `ServiceLocator.UndoRedoService?.Pause/Resume` reads the service twice, as C# does.

## C# idioms

- Culture sensitive `string.StartsWith(string)` (alias prefix in UpdateAliasReferences, library
  name in SplitLibrary, directory in AddExternalReferenceIfNeeded) uses `cultureStartsWith` of
  `src/system/CompareInfo.ts`; a null library name throws ArgumentNullException('value') there as
  in .NET.
- `TrimEnd('@')` is a regular expression, `string.Replace(old, new)` (ordinal) is `replaceAll`,
  `Substring(start, length)` checks its arguments like .NET (ArgumentOutOfRangeException).
- `Version.TryParse`, `>` and `!=` use `src/engine/amlobjects/internal/Version.ts`
  (`tryParse`, `greaterThan`, `equals`).
- String concatenation and interpolation of a null string give `''` (`?? ''`).
- `Path.GetFullPath`, `Path.GetDirectoryName`: `src/engine/amlobjects/internal/NetPath.ts`.
  `Uri.TryCreate(path, UriKind.Absolute, out uri)`: `Uri.tryCreate` of `src/system/Uri.ts`.
- NullReferenceExceptions of C# (for example `ServiceLocator.ExternalReferenceResolverService`
  null in LoadExternalSource, a failed schema transformation, a split point without a document
  entry) are TypeErrors at the same place.

## File access

- `Split(sourceDocument, alias, filePath)` saves the split document through `SaveSplitDocument`:
  first with the path as given, then, if that did not save, with `Path.GetFullPath(path)`. A path
  that is an absolute file URI is saved with `CAEXDocument.saveToFile` (Node only); an absolute
  URI that is not a file (http) is not saved and counts as saved, as in C#. Exceptions of the save
  are swallowed inside `SaveSplitDocument` (C# `catch`), `Path.GetFullPath` is outside the `try`.
  In a browser the save throws NotSupportedException (swallowed) and `Path.GetFullPath` throws
  NotSupportedException, so Split fails there after the source document has been changed, at the
  place where C# would fail if GetFullPath threw.
- `Split(sourceDocument, splitPoint, alias, filePath)` calls `saveToFile(filePath, true)` directly
  (Node only, NotSupportedException in a browser).
- Merge reads no files itself; the second overload loads through the registered
  IExternalReferenceResolver (the port of ExternalReferenceResolver).

## Errors of the original kept

- `ExternalLibrariesForImport` parses both versions from the library of the external source
  (`library.Version` twice), so they are always equal: a library that exists in the document is
  never replaced; the protocol says "... has not been imported. An identical or newer version
  already exists." (or "Version could not been identified!" when the version does not parse).
- `ImportInstanceHierarchies` searches the master mirrors (`alias@ID` references) in the source
  document, not in the document. The mirrors Split creates are in the document, so they are not
  found and the instance hierarchy is imported as a new one; a mirror found in the source is
  replaced there and its instance hierarchy is not imported into the document.
- `CAEXElementChangingHandler` evaluates `HasFlag(Deleting)` and discards the result; the handler
  has no effect.
- `AddExternalReferenceIfNeeded` always appends a new ExternalReference, also when one with the
  alias exists.

## Open points for the verification against the original

- Merge without a registered resolver: `BeginService<ExternalReferenceResolver>` registers one
  under the key `ExternalReferenceResolver`, and `ExternalReferenceResolver.UnRegister` removes the
  key `IExternalReferenceResolver`, so the resolver stays registered after the merge (behaviour of
  ExternalReferenceResolver, observable here).
- The second Merge overload disposes the loaded source document in `finally`, also when the
  resolver keeps it in its table; `EndService` runs only when no exception occurs.
- The order of the merge protocol (SystemUnitClassLib, RoleClassLib, InterfaceClassLib,
  AttributeTypeLib, InstanceHierarchy, ExternalReference) and the order in which Split handles the
  split points (AttributeTypeLib, InterfaceClassLib, RoleClassLib, SystemUnitClassLib,
  InstanceHierarchy, InternalElement) follow the C# code.
- Split points of a document that is unloaded are removed through `removeDocument`
  (IXMLDocumentRegistry), called by `XDocumentWrapper.unload`.
- Saved split documents and the paths of the new ExternalReferences (`.\name.aml` when the split
  file is in the directory of the source document) should be compared with the original on
  Windows and Linux paths.
