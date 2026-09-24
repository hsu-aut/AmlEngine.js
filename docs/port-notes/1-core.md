# Port notes: batch 1-core

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
interfaces `I*.ts` of the batch (25 files).

`npx tsc --noEmit` shows no errors in these files (checked 2026-09-25 against the state of the
other batches at that time).

## API decisions other batches rely on

- Equality: static `CAEXWrapper.equals(a, b)` is C# `operator ==` (undefined counts as null);
  instance `equals(obj)` is the `Equals` override (same XElement when `exists`, else reference);
  `equalityKey()` returns `this.node ?? this` (GetHashCode), used by `src/system/linq.ts`.
- `CAEXWrapper_1<TDataType>` (CAEXWrapper<TDataType>): constructor `(xmlNode, dataType)` with
  `dataType: DataTypeTag = 'boolean' | 'object' | 'string' | 'DateTime' | 'other'` (exported from
  `CAEXWrapper.ts`). Only bool/object/string/DateTime get converters in C#; 'other' leaves them
  unset. It is only constructed in this batch (SourceObjectInformationType and BaseElementType
  subclasses pass 'string'). `BaseElementType(xNode, dataType = 'string')`.
- `ValueSequence<T>`: the C# constructors `(owner, name, getCAEXOwner?)`, `(owner, name,
  condition)`, `(getOwner, name, condition)` plus an optional last argument `dataType:
  DataTypeTag`, default **'object'**. `new ValueSequence_ElementValueConverter<T>(dataType =
  'object')`. Callers constructing `ValueSequence<string>` should pass 'string' (the 'object'
  converters give the same results for strings); callers with custom types (MetaInformation,
  DocumentVersionInformation) should pass 'other' before `setConverters`; with the default
  'object' the object converters are active until `setConverters` replaces them.
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

## (a) Assumptions about APIs of other batches

- `XmlOperation.createCAEXWrapper(e)` (may return null), `XmlOperation.makeUnique(e)`;
  `XmlCAEXSchema.caexDocument(node)`, `xName(node, tag)`, `caexSchema(node)`,
  `isAdditionalInformation(e)`, `isCAEXClass(e)`, `isFacet(e)`, `isBasicAttribute(e)`;
  `XmlCAEXAttributes.getStringValue/setStringValue/getDateTimeValue/setDateTimeValue(node,
  xname[, value])`, `caexPath(node)`.
- `T.CAEXDocument.CAEXSchema.CAEX2_15` (nested enum as static property),
  `T.CAEXDocument.amlSchemaManager(xelement)` with `attributeNames(parentName, name)`,
  `childElementNames(parentName, name, includeChoice)`, `createElement(parentName, name)`;
  `T.CAEXDocument.document(xnode)`; instance `caexFile`, `transformToSchema(xelement)` (bool
  overload), `finalizeSchemaTransformation(xelement)`.
- Commands: `T.AddCmd.addSibling`, `T.InsertCmd.insertElement`, `T.InsertNewCmd.insertNewElement`,
  `T.RemoveCmd.removeElement`, `T.MoveCmd.move(node, target, isAfter)`,
  `T.AddNewCmd.addNewElement(ownerOrSibling, name, content, isSibling = false)`,
  `T.SetAttributeValueCmd.setValue(e, XName, value)`, `T.SetElementValueCmd.setValue(e, string)`,
  `T.SetElementContentCmd.setValue(e, content)`, `T.CaexCommand.isSilent`.
- `ServiceLocator.idService.generateNewID(obj?)`, `uniqueNameService.uniqueCAEXName(...)` (three
  C# overloads, dispatched on XElement vs iterable), `isUniqueCAEXName(e)`,
  `undoRedoService.beginTransaction/endTransaction/pause/resume`,
  `externalReferenceResolverService.isExternal(doc, e)` → `{ result, alias, path }`,
  `queryService.allElementsWithCAEXPathReference(obj, elementName?, includeSelf?)` (ILookup of
  IGrouping with `key` and Enumerable operators), `queryService.findByPath(doc, path)`,
  `defaultQueryService`, `getService<ISigning>('ISigning')` (C# `GetService<T>()` keyed by
  `typeof(T).Name`).
- `CAEXPathBuilder.pathPartObjectNames/pathNameArray/caexPath(names, schema)/aliasFromReference/
  changeAlias/changePathStart/isAttributeReference`; `ClassReferenceWithAlias.classReference(path,
  alias)`; `CAEXDocumentExtensions.findByPath(doc, path, resolveAlias = true, ctor = null)`,
  `externalReferenceFromAlias(doc, alias)`; `QueryResult.elementsWithIDReference(doc, id)`;
  `CAEXSignatureHeader.deleteSignature(obj)`; `CAEXBasicObjectExtensions.caexDocument(w)`,
  `caexSchema(w)`, `createCaexWrapper(e, ctor)`, `name_(w)` (C# `Name()`; renamed by batch 5
  because a static `name` clashes with `Function.name`); `ObjectWithBaseClass.isInherited(cls,
  element)`, `inheritedElements(cls, includeSelf, ctor)`, `baseClassReference(cls, path)`;
  `InheritanceExtensions.classIsDerivedFrom(cls, baseClass)`.
- `CAEXReference` exposes `element`; `ICAEXReference` has `caexObject`, `referenceAttributeName`,
  `referenceAttributeValue`, `setValue(v)`.
- System layer: `EventSource` (`raise(sender, args)`), `XmlConvert.toBoolean/toDateTime/toString`,
  `XmlDateTimeSerializationMode`, `DateTime.minValue`.

## (b) C# behaviour not reproduced exactly

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

## (c) Apparent bugs of the original, ported unchanged

- `CAEXSequence.CopyToImport`: `$"{redefinedAlias2}{64}{item.Key}"` inserts the number `64`
  instead of the character '@' between alias and path.
- `CAEXTypeDictionary`: the creator for the key of tag `AttributeType` (`AttributeTypeType`)
  creates an `AttributeFamilyType`.
- `CaexObjectWithReference.reference` setter passes the object itself to `SetXAttributeValue`, so
  the attribute gets `ToString()` of the object (its Name), not its path.
- `CAEXSequence.At(index)` throws ArgumentOutOfRangeException although documented to return null;
  `First`/`Last` of an empty sequence return a wrapper without node (the create function is called
  with null), except for InternalElementSequence which returns null.
- `CAEXSequence.InsertAt` computes an import copy (and may transform/extend external references)
  before falling back to `Insert`, which copies again.
- `CAEXWrapper<TDataType>` for bool writes "True"/"False" (bool.ToString()) into the element.
- `ElementValueConverter<object>.ConvertFrom` has an unreachable `ReadInnerXml` branch.
- The name path indexer `item('A', 'B')` of an InstanceHierarchy or InternalElement sequence
  returns null: `SystemUnitClassType.Container<InternalElementType>()` falls back to the base
  class and returns null (verified in the port by a smoke run; same logic in C#).
- `CAEXSequenceOfCAEXObjects.ChangeReferences` throws ArgumentNullException (string.StartsWith)
  when the source object has a name but no path is available.

## (d) Left undone

- Observation for the integration: `package.json` has `"sideEffects": false`. Every class module
  registers itself in `T` as a side effect; a bundler honouring the flag drops imports such as
  `import './caex/CAEXWrapper.js'` in `src/engine/index.ts` (esbuild warns "ignored-bare-import"),
  leaving the registry empty. The flag should be removed or list the engine modules.

- Nothing of the batch is omitted. `IEnumerable`/`IEnumerator` are not registered as interfaces
  (not engine interfaces). No tests were written (oracle tests are separate work).
