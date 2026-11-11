# Port notes: the lookup service (Aml.Engine.Services)

| File | Ports |
|---|---|
| `src/services/LookupService.ts` | `LookupService` (IQuery, IAMLService, IAutoUpdate, IXMLDocumentRegistry) |
| `src/services/lookup/LookupTables.ts` | `LookupTables` (internal), `LookupTables.ReferenceTypeEnum` as `LookupTables_ReferenceTypeEnum` |
| `src/services/lookup/CAEXNodeTable.ts` | `CAEXNodeTable` (internal, `Dictionary<string, CAEXNode>`) |
| `src/services/lookup/ClassTable.ts` | `ClassTable` (internal, CAEXNodeTable by class name, child tables per level) |
| `src/services/lookup/IDTable.ts` | `IDTable` (internal, CAEXNodeTable by ID) |
| `src/services/lookup/AliasTable.ts` | `AliasTable` (internal, `Dictionary<string, List<AliasReference>>`) |
| `src/services/lookup/NameReferenceTable.ts` | `NameReferenceTable` (internal, `Dictionary<XElement, List<CAEXNodeReference>>`) |
| `src/services/lookup/CAEXNode.ts` | `CAEXNode` (internal), `CAEXNode.Identifier` as `CAEXNode_Identifier` |
| `src/services/lookup/CAEXNodeReference.ts` | `CAEXNodeReference` (internal, a `CAEXReference`) |
| `src/services/lookup/IDReference.ts`, `PathReference.ts`, `AliasReference.ts` | the CAEXNodeReference subclasses (internal) |
| `src/services/lookup/ReferenceElement.ts` | `ReferenceElement` (public; `Tuple<XElement, string>`, ICAEXReference) |
| `src/services/lookup/ElementWithReference.ts` | `ElementWithReference` (internal `record struct`) |

## How the engine uses the service

`LookupService.register()` creates the service and registers it under `'IQuery'` and
`'IAutoUpdate'`. From then on every query of the engine that goes through
`ServiceLocator.queryService` (FindByID, FindByPath, the reference, mirror and inheritance queries,
`CAEXDocumentExtensions.findByID/findByPath`, `InheritanceExtensions.DerivedClasses`, ...) is
answered by the LookupService; `allElementsWithInternalLinks` and
`allInternalElementsWithInternalLinks` pass on to `ServiceLocator.defaultQueryService`, as in C#.
`unRegister()` removes both registrations (the ServiceLocator puts the default QueryService back).

The tables of a document are built on first use (`DocumentReferenceDictionary.createNew` calls
`createTablesForDocument`). While they are built, the service unregisters itself (so the engine's
own queries during the build go to the default QueryService), unsubscribes from the change events,
and registers and subscribes again in `finally`, as in C#.

**Auto update.** The service subscribes in its constructor (and in `resume`) to the two static
events of the engine, `CaexCommand.caexElementChangedEvent` (C# `CAEXElementChangedEvent`) and
`CaexCommand.caexElementChangingEvent` (`CAEXElementChangingEvent`), with handlers bound once per
instance (arrow function fields, so `unsubscribe` finds them). The changed handler dispatches on the
flags Added, NameChanged, IDChanged, PathRefChanged, IDRefChanged, ValueChanged (attribute `Alias`)
and NameRefChanged, the changing handler on Deleting; both set `_paused` while they run, so the
attribute changes the tables make themselves (reference updates through `SetValue`) are not fed
back. With `isAutoUpdateEnabled` the references are rewritten when the referenced object changes
(name, ID, path, alias, deletion) and `referenceUpdated` is raised for references in documents with
`supportsAutoUpdate`.

`removeDocument` (IXMLDocumentRegistry) is called by `XDocumentWrapper.removeDocument` for every
registration of the service, i.e. twice (`'IQuery'` and `'IAutoUpdate'`), as in C#; the second call
finds nothing.

## API decisions

- **Signatures** are those of `IQuery` (`src/engine/services/interfaces/IQuery.ts`). Overloads are one
  method each, dispatched as in `QueryService`: `allClassReferences` and `allClassReferencesDeep`
  take the CAEXObject overload when called with one argument that is a CAEXObject, otherwise the
  (document, classPath, elementName = "") overload; `isMaster` dispatches on AttributeType, then
  ExternalInterfaceType, else InternalElementType (null throws `ArgumentNullException('element')`).
  Lookups are the `ILookup`/`toLookup` of `src/engine/services/EmptyLookup.ts` (keys in the order of
  their first occurrence, null keys allowed as in .NET); empty results are `EmptyLookup.instance`.
  Sequences are `Enumerable`s of `src/system/linq.ts`, lazy where C# is lazy; C# `Array.Empty` is
  `Enumerable.empty()`. `ClassType` is the class constructor for C# `Type`.
- **`referenceUpdated`** (IAutoUpdate types it as `EventSource<UpdateEventArgs>`): the C# event has
  add/remove accessors that subscribe to and unsubscribe from a `WeakEventSource`. The property is an
  `EventSource` whose `subscribe`, `unsubscribe` and `raise` pass on to that `WeakEventSource`
  (`unsubscribe` removes the first registration of a handler, as WeakEventSource does). Its
  `isEmpty`, `count` and `clear` (which a C# event does not have) do not see these handlers.
- **out/ref parameters** follow the `{ result, ... }` rule: `CAEXNode.getUpdatedNode(x, id)` returns
  `{ result, newRoot }`, `CAEXNodeTable.addNode(key, id, node)` (C# `ref CAEXNode node`) returns
  `{ node }`, `LookupTables.attributeHasValue(e, name)` returns `{ result, value }`.
- **Indexers**: `ClassTable.item(pathParts, index)` (C# `this[string[], int]`) next to the
  dictionary's `item(key)`; `CAEXNode.item(name)`/`setItem(name, value)` (C# `this[string]`, creates
  the child table). Out-of-range `pathParts[index]` throws `IndexOutOfRangeException`; C#
  `array[..^1]` of an empty array throws `ArgumentOutOfRangeException('length')` and `array[^1]`
  `IndexOutOfRangeException`, as in .NET.
- **Names**: by the naming rule. The C# methods `FíndByReference` (with an accented í) of ClassTable
  and IDTable are `fíndByReference`. `LookupService.LookUpService` (internal static) is
  `lookUpService`; `IDTable` the property `idTable`. The parameter `delete` of
  `AliasTable.UpdateAliasReferences` is `deleteReferences` (a reserved word in JS).
- **Tuples**: `IDTable.AllElementsWithID` returns `{ id, reference }`, `AliasTable.AliasReferencesByFilter`
  `{ key, reference }`.
- **ReferenceElement** has `item1`/`item2` (Tuple.Item1/Item2), `element`, `referenceAttributeName`,
  `referenceAttributeValue`, `caexObject`, `setValue`; `equals` is the override of the class (also
  true for `new ReferenceElement(null, null).equals(x)` with any non-ReferenceElement `x`, as in C#);
  `equalityKey()` fails for a null element or name like `GetHashCode`; `toString()` is the Tuple
  format `(item1, item2)`. The other interfaces of `Tuple` (IStructuralEquatable,
  IStructuralComparable, IComparable, ITuple) are not ported. The C# constructor is internal.
- **ElementWithReference** is a class with value equality (`equals`, `equalityKey`), the record
  `toString`, `deconstruct`, and `toTuple`/`fromTuple` for the implicit conversions. Struct copy
  semantics are not reproduced; the tables only create and read it.
- **CAEXNodeReference.setValue** dispatches on the argument count: one argument is `SetValue(string)`
  of CAEXReference (what the engine calls through ICAEXReference), two arguments the C# overload
  `SetValue(XElement referencedElement, string value)`.
- **C# string operations**: `string.Replace(old, new)` is `replaceString` (exported by
  `CAEXNodeReference.ts`: ordinal, all occurrences, `ArgumentNullException`/`ArgumentException` for a
  null/empty old value); `StartsWith(string)` in `IDReference.updateAttributeReference` is culture
  sensitive (`cultureStartsWith`); `string.Equals` on a null string fails with a TypeError (the C#
  NullReferenceException).
- **Module cycles.** Services types import each other directly. The base classes `CAEXNodeTable`
  and `CAEXNodeReference` import only engine modules, so that every subclass finds its base class
  evaluated whatever module is loaded first. Each needs one class that would close a cycle over a
  subclass: CAEXNodeTable creates CAEXNodes (CAEXNode creates ClassTables) and CAEXNodeReference reads
  `LookupService.LookUpService` (LookupService loads the reference classes through LookupTables).
  These are late bound: `CAEXNodeTable.nodeType` is set by CAEXNode.ts and
  `CAEXNodeReference.lookupServiceType` by LookupService.ts when they are loaded (both `@internal`).
  Loading each of the 14 modules first was checked.

## Order of results (tables enumerated)

The tables derive from `Dictionary` of `src/system/linq.ts` (C# derives them from `Dictionary<,>`),
which enumerates in the order of .NET also after removals. These results depend on it:

- `allElementsIdentifiedByCAEXPath`: `ClassTable.AllClasses(root)` through `NodeGroups`, depth first
  over the class table and its child tables, each in table order, then the chain of nodes with the
  same name.
- `allElementsWithCAEXPathReference`: the path references of all class nodes (table order, the
  references of a node in the order they were added, then the child tables), then the alias path
  references (alias table order).
- `allElementsWithIDReference`: ID table order, then the references of each node.
- `allElementsWithIDs` with an empty ID: ID table order, then the chain of nodes with the same ID.
- `allElementsWithNameReference`: the unresolved references, then the name reference table (keyed by
  the referenced XElement, table order), then the InternalLinks (CAEX 2.15) or attribute mirrors of
  the ID table (table order).
- `allElementsWithAliasReference` and `elementsWithAliasReference` with an empty alias: alias table
  order.
- `allClassReferencesDeep(document, path, ...)`, `allExternalInterfacesOfType`,
  `allExternalDataReferences`: for a path of an external class, the alias table order of the path
  references (`AliasTable.AllReferencesToDerivedExternalClasses`).
- `ClassTable/IDTable.fíndByReference` return the first matching node in table order (which node a
  deleted reference is removed from).

All other results follow the order in which the references of one node were added (document order
of the elements when the tables were built, then the order of later changes) or document order.

## Calls that do not return: the port throws

Nodes registered under the same key form a chain (`NodeWithIdenticalID`, `NodeWithIdenticalName`).
`CAEXNodeTable.AddNode` appends a node to the end of the chain of an occupied key without checking
whether it is already in it. When an element that is already registered is registered again (for
example a class with an ID inserted again with `InsertBefore`, which raises Added for it), its node is
appended to its own chain and the chain becomes cyclic. Every later walk of the chain recurses
forever in the original: the oracle overflows the stack in `CAEXNode.LastAmbiguousNode` (from
`CAEXNodeTable.AddNode` <- `IDTable.AddIDElement` <- `LookupTables.AddIdentifiedElements` <-
`AddElementAndDescandants` <- `HandleAdded`). Following docs/deviations.md ("Calls that do not
return: the port throws"), the chain walkers of CAEXNode are loops with a `LoopGuard`
(`src/engine/cycles.ts`) and throw `CyclicReferenceException` (with the element of the repeated node)
when a node of the chain comes up a second time:

| Walker | Original on a cyclic chain | Port |
|---|---|---|
| `CAEXNode.LastAmbiguousNode` (ID, NAME) | stack overflow | `CyclicReferenceException` |
| `CAEXNode.AllNodes` (ID, NAME; builds the sequence at the call) | stack overflow | `CyclicReferenceException` at the call |
| `CAEXNode.GetUpdatedNode` (when the element is not in the cycle) | stack overflow | `CyclicReferenceException` |
| `CAEXNode.DeleteReference` (NAME chain) | stack overflow | `CyclicReferenceException` after the first pass over the cycle |

The loops give the same results and make the same changes in the same order as the recursion (the
links of `GetUpdatedNode` are set from the end back to the start, as the returns of the recursion
do). `GetUpdatedNode` with `ANY` (never called) recurses on the same node in the original and throws
in the port. Callers that hit a cyclic chain: adding, renaming, deleting elements (auto update),
`findByPath` of a class whose parent has a name chain, `allElementsWithIDs`,
`allElementsIdentifiedByCAEXPath`. When the exception leaves a change handler, `_paused` stays true
(no `finally` in C#), so the tables are no longer updated; the original process has ended at that
point.

Two recursions over class references get a `RecursionGuard` as well (the original overflows the
stack on cyclic base class references, docs/deviations.md "Base class references in a cycle"):
`ClassTable.AllClassReferencesDeep` (entered again for the same class path while running) and
`LookupService.allClassReferencesDeep(CAEXObject)` (entered again for the same class element).

Not reproduced: the depth at which .NET overflows on a very long chain that is not cyclic (thousands
of elements with the same key, e.g. elements with a mandatory but empty ID, all registered under
" "). The port walks such chains in loops and returns.

## Errors of the original kept

Marked `// Aml.Engine:` in the code where it is not obvious.

- `CAEXNodeTable.AddNode` links an already registered node to itself (above).
- `AliasReference.Update` replaces the value twice and, for a reference without alias, sets
  `"<new>@<new>"`; the last `SetValue` (with the computed value) wins.
- `LookupTables.DeletePathReference` searches the node with the attribute name of the call (empty
  when all path reference attributes are deleted, as from `DeleteElementAndDescandants`), not with the
  attribute of the current pass, so the fallback search of `FíndByReference` never matches then.
- `LookupTables.Clear` (on `removeDocument`) clears the class, ID and alias tables, not the name
  reference table.
- `allElementsIdentifiedByCAEXPath` returns null (not an empty lookup) when the document has no
  tables (a detached object); `elementsWithCAEXPathReference` returns null for an empty or white
  space path. (`allClassReferences(CAEXObject)` returns an empty sequence for an object of a
  document without tables: the null-conditional call covers the whole query.)
- `allExternalInterfacesOfType` throws `ArgumentNullException('caexObject')` for an empty interface
  class path (wrong parameter name).
- `LookupService.findByPath` resolves only CAEX classes (the class table): it does not find
  attributes by attribute reference, and for a path that names an instance child and a nested class
  of the same name it returns the class, where the default QueryService returns the first child of
  that name in document order (seen in the MTP corpus files, `MTPSUCLib/CommunicationSet/InstanceList`).
- The private `ExternalReferences` and `_changeModeValues` are unused in the original; ported as they
  are.

## Changes during enumeration

The tables derive from `Dictionary` and keep their references in `List` of `src/system/linq.ts`,
which check for changes during enumeration as .NET does: adding a key to a Dictionary, and any
change of a List (Add, Remove of an item, RemoveAll and Clear that remove something, AddRange of
items), makes the next step of an enumeration started before it throw `InvalidOperationException`
("Collection was modified; enumeration operation may not execute."). The service returns many
results lazily over these lists (`elementsWithIDReference`, `elementsWithCAEXPathReference`,
`elementsWithAliasReference`, the mirror and class reference queries). When a caller changes a
reference while it enumerates such a result, the change handler of the service updates the list
and the enumeration fails, as in C#: `ChangeNameAndReferences` and `AssignNewGuidAsID(true)` of the
engine stop after the first reference in these cases. `NameReferenceTable.ChangeName` fails the
same way when a recursion adds to the list it walks.

## Not reproduced

- The `lock` of DocumentReferenceDictionary and the `catch { throw; }` of `CreateTablesForDocument`
  (no effect).

## Engine changes

None.

## Verified against the original

`test/services/lookup.oracle.test.ts` compares every public member on all corpus documents and
generated ones, before and after random changes (docs/coverage-notes/services-lookup.md). The open
points of the port are settled:

- The order of the lookups and sequences, also after renames, deletions and re-insertions (free
  slot reuse of the tables), is the original's.
- `CyclicReferenceException` is thrown exactly where the original overflows the stack: cyclic ID
  chains after a re-insertion, cyclic class hierarchies (`AllClassReferencesDeep`,
  `AllExternalInterfacesOfType`), tables of cyclic documents.
- `NameReferenceTable.ChangeName` stays unguarded: a cycle of name references cannot be built
  (building the name references of a cyclic hierarchy already does not return in the engine), and
  renames in hierarchies made cyclic later give the original's results.
- `findByPath` of the MTP documents: the difference to the default QueryService is the original's.
- `referenceUpdated` events (with `isAutoUpdateEnabled` and `supportsAutoUpdate`) are compared
  after every call, in order; the auto update of alias references with alias changes.
