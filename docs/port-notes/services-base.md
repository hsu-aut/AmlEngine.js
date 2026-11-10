# Port notes: undo/redo, unique names, statistics and the document registries (Aml.Engine.Services)

| File | Ports |
|---|---|
| `src/services/UndoRedoService.ts` | `UndoRedoService` (IUndoRedo, IAMLService, INotifyPropertyChanged, IXMLDocumentRegistry) |
| `src/services/UniqueNameService.ts` | `UniqueNameService` (IUniqueName, IAMLService, ISuspendable) |
| `src/services/CAEXFileStatisticService.ts` | `CAEXFileStatisticService` (IStatistic, IAMLService) |
| `src/services/undoredo/Transaction.ts` | `Transaction` (internal in C#; `List<ICAEXCommand>`, ICAEXCommand) |
| `src/services/undoredo/MultiDocumentTransaction.ts` | `MultiDocumentTransaction` (internal in C#) |
| `src/services/generique/DocumentReferenceDictionary.ts` | `DocumentReferenceDictionary<T>` (`Dictionary<XDocument, T>`) |
| `src/services/generique/DocumentReference.ts` | `DocumentReference` (internal in C#, used nowhere in the package) |
| `src/services/generique/ExternalDocument.ts` | `ExternalDocument` (internal in C#, used by ExternalReferenceResolver) |
| `src/services/generique/ExternalDocumentRegistry.ts` | `ExternalDocumentRegistry` (internal in C#, used by ExternalReferenceResolver) |

## How the engine finds the services

As in C#: `UndoRedoService.register()` registers the instance under `'IUndoRedo'`,
`UniqueNameService.register()` under `'IUniqueName'`, `CAEXFileStatisticService.register()` under
`'IStatistic'`; `unRegister()` removes them. Each class registers the interfaces of its C#
declaration at run time. The engine calls the undo service through `ServiceLocator.undoRedoService`
(commands push themselves after `execute`, operations that must not be recorded call `pause` and
`resume` for their document, compound operations `beginTransaction`/`endTransaction`) and calls
`removeDocument` of every registered `IXMLDocumentRegistry` when a document is unloaded
(`XDocumentWrapper.removeDocument`).

## API decisions

- **C# tuples** become objects with camel case fields: the stack entries `(ICAEXCommand Command,
  string TimeStamp)` are `{ command, timeStamp }`, the paused entries `(int Count, Stack[] Stack)`
  are `{ count, stack }`.
- **Stack<T>**: a module-private class in `UndoRedoService.ts` with the members the service uses.
  `pop` and `peek` throw `InvalidOperationException("Stack empty.")` on an empty stack, enumeration
  starts at the top (most recently pushed first, so `undoActions`/`redoActions` list the most recent
  action first) and throws `InvalidOperationException("Collection was modified; enumeration
  operation may not execute.")` on the next step after a push, pop or clear, like the enumerator of
  .NET. `undoActions`/`redoActions` stay lazy (C# `Select` over the stack).
- **Time stamps**: `DateTime.Now.ToLongTimeString()` is `DateTime.now.toString('T')` (invariant
  culture: `HH:mm:ss`). `lastModificationDate` parses it with `DateTime.tryParse` (invariant), which
  gives today's date (at the time of the call) with that time, kind Unspecified; a failed parse is
  `DateTime.minValue` (`default(DateTime)`).
- **PropertyChanged**: `propertyChanged` is an `EventSource<PropertyChangedEventArgs>` (created on
  first access, as in CAEXWrapper), raised with `PropertyChangedEventArgs` of `src/system/events.ts`
  for `"CanUndo"` and `"CanRedo"`.
- **Overloads**: the private C# overload `BeginTransaction(CAEXDocument, string)` (returns the
  transaction; C# overload resolution picks it for every call with two arguments inside the class)
  is `beginTransactionOfDocument`. `UniqueNameService.uniqueCAEXName(sequence, tag, defaultName?)`
  dispatches: without `defaultName` the (XElement, string) overload; with it, an XElement or null
  sequence takes (XElement, string, string), any other iterable (IEnumerable<XElement>, string,
  string). The statistic methods with a `Predicate<XNode>` overload take an optional
  `condition: (node: XNode) => boolean`; `undefined` selects the overload without condition, `null`
  the one with it (which fails when it calls the condition, as in C#).
- `undoActions`/`redoActions` return `null` for a paused document, as in C#; the interface types the
  result as `Iterable<string>`.
- Private C# constants (`UndoCommandStackNr = 0`, `RedoCommandStackNr = 1`, `TransactionStackNr =
  2`) are static readonly fields in camel case; the decompiled C# shows their values inline.
- **Transaction** holds its commands in an array and offers the `List<T>` members the service uses:
  `count`, `add` and enumeration, which fails like the `List<T>` enumerator when the list is changed
  during `execute`. `unExecute` iterates a reversed copy (`Enumerable.Reverse(this).ToList()`).
- **DocumentReferenceDictionary<T>** extends `Dictionary` of `src/system/linq.ts` (strong keys and the
  enumeration order of .NET, as `removeCommands` enumerates it). The C# field `CreateNew` is the
  public field `createNew` (internal in C#). `default(T)` is the constructor argument `defaultValue`
  (null by default); the paused-stack dictionary passes `{ count: 0, stack: null }`, the default of
  its tuple. `lock` is dropped. Missing keys and null keys behave as in .NET (`ArgumentNullException`
  with parameter `key` from `isLoaded(null)`, `remove(null)`).
- **UniqueNameService**: `_defaultNames` is a `Dictionary` of linq (only read by key, but
  `registerDefault(null, ...)` throws `ArgumentNullException` as in .NET, which a `Map` would not).
  The constructor registers the tag name of every type of `CAEXTypeDictionary.instance`.
- **PLINQ** (`list.AsParallel().Max(...)` in `UniqueCAEXName`) runs sequentially. The query computes
  the highest number behind the stripped default name and sets a flag when the default name itself
  occurs; neither depends on the order of evaluation, so the result is the same. PLINQ wraps every
  exception of the query in an `AggregateException` (`InlinedAggregationOperator.Aggregate`), e.g.
  the `OverflowException` of `Convert.ToInt32` for a name like `InternalElement99999999999`; the
  port does the same with a module-private `AggregateException` (`name` "AggregateException",
  message "One or more errors occurred. (<inner message>)", `innerExceptions`, `innerException`).
  `strippedDefaultName + (num + 1)` keeps the C# int addition (`int.MaxValue + 1` wraps).
- **ExternalDocumentRegistry**: `NameValueCollection` is a module-private class with the members
  used (indexer get/set, `Remove`, `Clear`). Its default comparer in .NET is
  `InvariantCultureIgnoreCase`; keys are folded the same way as in
  `src/engine/amlobjects/mimetype/InvariantIgnoreCaseDictionary.ts` (copied, since that function is
  private there). A null key is allowed, as in .NET. The three C# overloads of `Unload`
  (ExternalDocument, string documentName, XDocumentWrapper) are one method `unload`; null takes the
  ExternalDocument overload (TypeError, the C# NullReferenceException). C# passes `Unload` as a
  method group (`e.Remove(null, registry.Unload)`), so the constructor binds `unload` to the
  instance and it can be passed the same way.
- `ExternalDocument.URLs` is `urLs` by the naming rule. The hash sets are `HashSet` of linq
  (reference equality, .NET enumeration order, which decides the order of `unload` calls in
  `remove`).
- **DocumentReference** holds a `WeakRef`; `new DocumentReference(null)` is allowed (never alive),
  as `new WeakReference(null)` in .NET.

## Document lifetime (weak references)

The dictionaries of the services hold the XDocument keys strongly, as in C#. The difference lies in
the engine (docs/deviations.md, "Document table: weak references only"): in .NET the document table
holds XDocument -> WeakReference(wrapper), and when a CAEXDocument wrapper is collected without
`Unload`, `CheckReferences` (on the next document lookup) calls `RemoveDocument` of every
IXMLDocumentRegistry, so the undo service drops the stacks of that document. In the port the table is
a `WeakMap<XDocument, wrapper>`: while a DocumentReferenceDictionary holds the XDocument as key, the
WeakMap keeps the wrapper alive too, so the wrapper is never collected and never reported. The entry
stays until `Unload` (which calls `removeDocument`), `clearStacks`, or `getOrLoadValue(doc, true)`
(`ClearDisposed`). Observable only for documents dropped without `Unload` whose stacks hold no
command (commands keep their wrapper alive through `CaexCommand.caexDocument` in .NET as well): in
.NET such a document disappears after a garbage collection, in the port it stays resolvable. Call
`unload()` on documents that are no longer needed, as with the engine.

## Errors of the original kept

Marked `// Aml.Engine:` in the code.

- `EndTransaction` of a `MultiDocumentTransaction` pops a second transaction from the stack of the
  same document, although `BeginTransaction(document, name, relatedDocument)` pushed the related
  transaction on the stack of the related document. With two documents this pops an outer
  transaction of the document, or throws `InvalidOperationException("Stack empty.")`; with
  `relatedDocument == document` it puts the empty related transaction on the undo stack and the
  commands of the multi document transaction are lost (checked with the port: the undo list shows
  the related transaction, its commands cannot be undone).
- `UndoActions`/`RedoActions` fall back to `cmd.GetType().Name` where `cmd` is the tuple, not the
  command: every command without display name (all engine commands; transactions have one) is
  listed as ``ValueTuple`2``.
- `Undo` sets `_isUndoInProgress` without `try/finally`: if `UnExecute` throws, the service stays in
  the undo state and records nothing further.
- `RemoveDocument` of a document paused without stacks (`(1, null)` in the paused dictionary, when
  `GetOrLoadStacks` returned null) fails in `ClearStackPaused` (NullReferenceException, TypeError in
  the port).
- `NumberOfAttributeTypeReferences` and `NumberOfSystemUnitClassReferences` count descendant
  elements named `RefAttributeType` / `RefBaseSystemUnitPath`; both are XML attributes in CAEX, so
  the counts are 0 for valid documents.

## Engine changes

None.

## Open points for the verification against the original

- Time stamps and `LastModificationDate` under the culture of the oracle (invariant assumed:
  `HH:mm:ss`, parsed to today's date).
- `UndoActions`/`RedoActions` names (``ValueTuple`2`` fallback), and the order (most recent first).
- `UniqueCAEXName` with a number that overflows `int` (`AggregateException` with the
  `OverflowException`); with several failing elements PLINQ may collect more than one inner
  exception, the port reports the first.
- `EndTransaction` after `BeginTransaction` with a related document (the kept error above), with the
  same and with another document.
- The comparer of `NameValueCollection` (case-insensitive URL lookup in ExternalDocumentRegistry),
  through ExternalReferenceResolver.
- Enumeration of `UndoActions` while the stack changes (InvalidOperationException in both).
