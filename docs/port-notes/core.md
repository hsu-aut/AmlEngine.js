# Port notes: core types (wrappers, sequences, basic CAEX elements)

Files (all in `src/engine/caex/`): `CAEXWrapper.ts` (`CAEXWrapper`, `CAEXWrapper_1`),
`CAEXBasicObject.ts`, `CAEXObject.ts`, `CAEXLibrary.ts`, `CaexObjectWithReference.ts`,
`NamedElementSequence.ts` (`NamedElementSequence`, `NamedElementSequence_1`), `CAEXSequence.ts`,
`CAEXSequenceOfCAEXObjects.ts`, `CAEXSequenceOfCAEXObjectsWithReference.ts`,
`AttributeSequence.ts`, `ExternalInterfaceSequence.ts`, `InternalElementSequence.ts`,
`ValueSequence.ts` (`ValueSequence`, `ValueSequence_ElementValue`,
`ValueSequence_ElementValueConverter`), `CAEXEnumerable.ts`, `CAEXSequenceEnumerator.ts`,
`CAEXTypeDictionary.ts`, `CAEX_CLASSModel_TagNames.ts`, `ChangeMode.ts`, `BaseElementType.ts`,
`CopyrightType.ts`, `DescriptionType.ts`, `VersionType.ts`, `RevisionType.ts`,
`SourceObjectInformationType.ts`, `UnknownTypeType.ts`, `linq/CAEXSequenceExtension.ts`, and the
interfaces `I*.ts` of these types (25 files).

## API decisions

- Equality: static `CAEXWrapper.equals(a, b)` is C# `operator ==` (undefined counts as null);
  instance `equals(obj)` is the `Equals` override (same XElement when `exists`, else reference);
  `equalityKey()` returns `this.node ?? this` (GetHashCode), used by `src/system/linq.ts`.
- `CAEXWrapper_1<TDataType>` (CAEXWrapper<TDataType>): constructor `(xmlNode, dataType)` with
  `dataType: DataTypeTag = 'boolean' | 'object' | 'string' | 'DateTime' | 'other'` (exported from
  `CAEXWrapper.ts`). Only bool/object/string/DateTime get converters in C#; 'other' leaves them
  unset. SourceObjectInformationType and the BaseElementType subclasses construct it with
  'string': `BaseElementType(xNode, dataType = 'string')`.
- `ValueSequence<T>`: the C# constructors `(owner, name, getCAEXOwner?)`, `(owner, name,
  condition)`, `(getOwner, name, condition)` plus an optional last argument `dataType:
  DataTypeTag`, default **'object'**. `new ValueSequence_ElementValueConverter<T>(dataType =
  'object')`. `ValueSequence<string>` uses the default (the 'object' converters give the same
  results for strings); sequences of custom types (MetaInformation, DocumentVersionInformation)
  pass 'other' and then `setConverters`. With the default 'object' the object converters are
  active until `setConverters` replaces them.
- Constructor overload dispatch (NamedElementSequence_1, ValueSequence, CAEXSequenceOfCAEXObjects,
  CAEXSequenceOfCAEXObjectsWithReference): with an XElement owner, a function argument without
  parameters (`fn.length === 0`, e.g. `() => this`) is `getCAEXOwner`; a function with a parameter
  is the selection condition. A 5th argument always selects the `(…, create, condition,
  getCAEXOwner)` overload.
- Sequences take the constructor function (`RevisionType.Constructor`, static getter or field
  named `Constructor` on the wrapper class, as in C#) and call it through `createCaexWrapper(node)`
  (overridable; `node` may be null, like in C#).
- Tuples: the attribute value indexer `this[(string Name, string Value)]` is
  `item({ name, value })`. `Append/Prepend(params (string Name, object Value)[])` take
  `append(['Alias', a], ['Path', p])`; `{ name, value }` objects are accepted as well
  (`NameValueTuple` in `ICAEXSequence.ts`).
- Indexers of CAEXSequenceOfCAEXObjects: `item(i)`, `item({name, value})`, `item(name)`
  (virtual `this[string]`), `item(...names)` or `item(namesArray)` (`this[params string[]]`); a
  single array argument always means the names overload. CAEXLibrary: `item(name)`,
  `item(...names)`, `item(namesArray)`. `setItem(i, v)` for the int indexer (a no-op in
  CAEXSequence, like C#).
- `append(name)` / `prepend(name)` of CAEXSequenceOfCAEXObjects: a single string (or null)
  argument; otherwise the arguments are tuples.
- `indexOf(x)` of CAEXSequence accepts a wrapper or an XElement (C# protected `IndexOf(XElement)`);
  `remove()` of NamedElementSequence_1 removes all elements, `remove(xmlNode)` (C# protected) one.
- `CAEXEnumerable(sequence, elements, type?)` / `CAEXEnumerable(elements, type?)`: the C# type
  argument `T` is an optional last argument used only without a sequence (`CreateCaexWrapper<T>`
  returns null for wrappers of another type). Default: CAEXWrapper, i.e. no filtering. The
  enumerator (`CAEXSequenceEnumerator`) also implements the JS iterator protocol and has
  `moveNext()`, `current`, `reset()`, `dispose()`.
- `CaexObjectWithReference(xmlNode, refName, referenceType?)`: without the third argument the
  run time `T` is the class in the prototype chain that directly extends CaexObjectWithReference
  (in Aml.Engine `T` is always that class).
- `CAEXLibrary.createElementSequence` (C# internal settable property): a function
  `(node: XElement) => CAEXSequenceOfCAEXObjectsWithReference<TLibItem>`, set by subclasses.
- `CAEXTypeDictionary.instance` (lazy, built at first use from the registry `T`): `item(tag)`
  (throws KeyNotFoundException), `containsKey(tag)`, `tryGetValue(tag)` → `{ result, t }`,
  `tryGetCreator(tag)` → `{ result, creatorFunc }`. It extends `Map<string, Function>` (C#
  `Dictionary<string, Type>`).
- `CAEX_CLASSModel_TagNames.tagName(ctor)` needs C# `Type.Name`: `CAEX_CLASSModel_TagNames.typeName(ctor)`
  (internal) returns the export name of the class in the registry `T` (generic classes with their
  C# name, e.g. ``CAEXLibrary`1``), falling back to `ctor.name`. Bundlers rename classes
  (esbuild gives `_InternalElementType` for classes with static self references), so code that
  needs a C# type name should use `typeName`, not `ctor.name`. The constants keep their C# names.
- ChangeMode: TS numeric enum; `tryParseChangeMode(s)` (Enum.TryParse, ignoreCase) and
  `changeModeToString(v)` (Enum.ToString) are exported from `ChangeMode.ts`.
- Helpers exported from `CAEXWrapper.ts`: `newException(message, inner?)` (System.Exception),
  `csToString(v)` (object.ToString(): "True"/"False" for booleans), `elementToBoolean(e)`,
  `elementToDateTime(e)` (explicit XElement conversions). `PropertyChangedEventArgs` is an
  interface `{ propertyName }`; `propertyChanged` is a lazily created `EventSource`.
- Interfaces: generic twins are `IClassWithBaseClassReference_1`, `IInstance_1`,
  `IInstantiable_1`, `IMirror_1` (each registered with `registerInterfaceBases`); classes
  implementing `IMultipleOccurrences<X>` register `'IMultipleOccurrences'`. `ICAEXLibrary` and
  `IClassWithExternalInterface` (no own members) are type aliases. In `IMirror_1<T>` and
  `IClassWithBaseClassReference_1<T>`, T is constrained to CAEXObject (C#: ICAEXObject/CAEXObject).
  `IClassWithBaseClassReference.getReferenceHierarchy` is typed loosely
  (`(...args: never[]) => Iterable<unknown>`) because C# has a generic and a non-generic overload.

## C# behaviour not reproduced exactly

- Run time type arguments that C# has and JS lacks:
  - `CAEXSequenceOfCAEXObjects`: `val.Container<T>()` (path indexer) and
    `InheritedElements<T>()` (unique names) use the class of the found/inserted object as `T`.
    Equal to the sequence's `T` for every sequence of the engine (the create functions construct
    exactly `T`).
  - Explicit `ICAEXSequence` members cast with `as T` (`Insert`, `InsertAt`, `IndexOf`,
    `RemoveElement`, `this[int] set`): the JS methods are shared with the typed ones and do not
    turn an object of another wrapper type into null.
  - `CAEXEnumerable<T>` without a sequence filters by `T` only when `type` is passed.
- `CAEXTypeDictionary`: the C# dictionary holds all exported CAEXWrapper types of the assembly in
  metadata order; the port takes the registered classes derived from CAEXWrapper in registry
  order (internal classes would be included too; none derive from CAEXWrapper). Generic types are
  keyed with their C# names (`CAEXWrapper`1`, `CAEXLibrary`1`, ...). Enumeration order of the
  dictionary therefore differs.
- `CAEXTypeDictionary.instance` is built on first use from the classes registered in `T` at that
  moment; it must not be used before all engine modules are loaded (src/engine/index.ts).
- `CAEXSequenceEnumerator.reset()`: arrays restart, lazy sequences throw NotSupportedException
  (as compiler generated iterators in .NET); the XLinq iterators of .NET also throw.
- `object.ToString()` in the converters: booleans give "True"/"False", other values `String(v)`
  (numbers may format differently from .NET for exotic values).
- `new Exception(...)` is a SystemException instance whose `name` is 'Exception'.

## Errors of the original, ported unchanged

- `CAEXTypeDictionary`: the creator for the key of tag `AttributeType` (`AttributeTypeType`)
  creates an `AttributeFamilyType`.
- `CaexObjectWithReference.reference` setter passes the object itself to `SetXAttributeValue`, so
  the attribute gets `ToString()` of the object (its Name), not its path. Correctable: fix `referenceSetter` (docs/fixes.md).
- `CAEXSequence.At(index)` throws ArgumentOutOfRangeException although documented to return null;
  `First`/`Last` of an empty sequence return a wrapper without node (the create function is called
  with null), except for InternalElementSequence which returns null.
- `CAEXSequence.InsertAt` computes an import copy (and may transform/extend external references)
  before falling back to `Insert`, which copies again.
- `CAEXWrapper<TDataType>` for bool writes "True"/"False" (bool.ToString()) into the element.
  The engine never uses a bool wrapper, so this cannot be reached through its API.
- `ElementValueConverter<object>.ConvertFrom` has an unreachable `ReadInnerXml` branch.
- The name path indexer `item('A', 'B')` of an InstanceHierarchy or InternalElement sequence
  returns null: `SystemUnitClassType.Container<InternalElementType>()` falls back to the base
  class and returns null (same logic in C#).
- `CAEXSequenceOfCAEXObjects.ChangeReferences` throws ArgumentNullException (string.StartsWith)
  when the source object has a name but no path is available.
