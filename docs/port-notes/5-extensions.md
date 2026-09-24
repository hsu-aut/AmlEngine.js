# Port notes: batch 5-extensions

Files (all in `src/engine/caex/extensions/`): AdditionalInformationContent, AdditionalInformationExtension,
CAEXBasicObjectExtensions, CAEXDocumentExtensions, CAEXElementFactory, CAEXFileTypeExtensions,
CAEXObjectExtensions, CAEXPathBuilder, CollectionExtensions, ExternalInterfaceTypeExtensions,
InheritanceExtensions, InstanceExtensions, InstanceHierarchyTypeExtensions,
InterfaceClassLibTypeExtensions, InterfaceFamilyTypeExtensions, InternalElementExtensions,
InternalLinkTypeExtensions, MappingTypeExtensions, ObjectWithAttributes, ObjectWithBaseClass,
ObjectWithExternalInterface, RoleClassFamilyTypeExtensions, RoleClassLibTypeExtensions,
StringExtensions, SystemUnitClassLibTypeExtensions, SystemUnitClassTypeExtensions,
SystemUnitFamilyTypeExtensions.

Additional file outside the type map: `src/engine/resources/files/SemanticVersion.ts` (see (d)).

## Verification done

- `probe5` (C# against Aml.Engine 4.5.2, not committed) vs. the JS port on 1568 strings (curated
  paths with aliases, brackets, escapes, GUIDs in all formats, plus 1500 random strings over
  `ab/@.:[]\ -1x{}`), both schemas: PathNameArray (with/without brackets),
  PathNameArrayWithSeparator (with/without onlyAlias), PathPartName, NormalizePath,
  IsReferenceWithAlias, CAEXPath(string[]), IsObjectReferenceWithAlias, AliasFromReference,
  IsInterfaceReference, RemoveAlias, ChangeAlias, ChangePathStart, IsAlias, CanNormalize,
  InternalElementIDInInternalLinkReference, ExternalInterfaceIDInAttributeReference,
  InstanceIDInAttributeReference, IsValidID, IsIDReferenceWithAlias, IsAttributeReference,
  ContainsPathSeparatorChars and the StringExtensions (IsGUID, NormalizedGUID, IsInterfacePath,
  IsInterfacePathWith*, IsClassReference), including exception types. All identical (after
  fixing CanNormalize(null) -> ArgumentNullException).
- The existing read-model dump (`test/engine/dump.ts`) over the whole corpus, run with all
  modules present, equals the oracle dump except the random OriginIDs that the real test masks.
- A corpus walk (`probe5/Walk.cs`, not committed, vs. a JS twin) over the 45 smaller corpus files
  (5485 objects): Name, Library, Ancestors/Descendants (typed, untyped, null items),
  FirstAncestor, CAEXPath over objects and nodes, PathPart, PathPartSeparator, ExternalPath,
  SemanticVersion, all ObjectWithBaseClass inheritance queries (attributes, interfaces,
  InternalElements, InheritedElements, IsInherited, IsOverridden, OverriddenElement,
  ReferencedClassName), ClassIsDerivedFrom (path and class overloads), IsDerivedFrom*,
  GetDerivedSupportedRoles, SystemUnitClass Ancestors, HasInterfaceClassReference,
  InterfaceClassReferences, OfInterfaceClass, all ExternalInterfaceTypeExtensions queries,
  InternalLink partner helpers, reference ID analysis, AllLibraryReferences (order included),
  HasLibraries, IsExtensionDocument, GetAMLInfoFromFilename: no difference.

## (a) Assumptions about APIs of other batches

- Generic C# methods take the class constructor as extra parameter, where the type matters at
  run time. Where optional C# parameters precede it, the methods accept the constructor and the
  bool in either order: `CAEXBasicObjectExtensions.ancestors(obj, includeSelf?, type?)`,
  `descendants(obj, includeSelf?, type?)` (no type: `Descendants()`; with type:
  `Descendants<T>()`, `Descendants(Type)` and `Descendants<T>(bool)`),
  `ObjectWithBaseClass.inheritedElements(cls, includeSelf?, type)`,
  `CAEXFileTypeExtensions.findFastByID/findFastByPath(file, id, includeExternals?, type?)`.
  `firstAncestor(obj, arg)` dispatches: engine wrapper class (CAEXWrapper or derived) = generic,
  string = tag name, other function = predicate. `getParent(obj, type)` accepts a constructor or
  an interface name (C# `GetParent<IObjectWithAttributes>`); no type = no filter.
  `createCaexWrapper(node, type?)`: no type = no filtering (used by CAEXSequenceEnumerator).
- `CAEXElementFactory.create(document, typeOrTagName)`: constructor = `Create<T>`, string or null =
  `Create(string)`.
- The type parameter of `IClassWithBaseClassReference<T>` is always the class family
  (Attribute/Interface/Role/SystemUnitFamilyType). Where C# needs T at run time
  (`ChangeNameAndReferences`, `CopyTreeAndChangeReferences`, `BaseClassReference`,
  `ClassIsDerivedFrom(cls, baseClass)`) it is derived from the object's family; C# callers never
  pass it. `ClassIsDerivedFrom<T>(document, classPath, baseClassPath)` takes T as 4th argument.
- `InheritanceExtensions.classIsDerivedFrom` overload dispatch: 3 or more arguments = document
  overload; string second argument = path overload; otherwise (including null) = base class
  overload.
- `x is IClassWithBaseClassReference<T>` is `implementsInterface(x, 'IClassWithBaseClassReference_1')`
  (plus `instanceof` the family where T is known).
- ILookup results of the query service (`allElementsWithCAEXPathReference`,
  `allElementsWithIDReference`) are iterables of groupings with `key` and the references as
  iterable (as `src/system/linq.ts` IGrouping).
- `new T.CAEXEnumerable(elements, type)` for C# `new CAEXEnumerable<T>(elements)`; axis results
  (`ancestors()`, `descendants()`...) are passed as re-iterable `Enumerable`s, not bare generators.
- `XmlOperation.existingElementsFromBaseClassAndSelf` must return a re-iterable sequence:
  `InheritanceExtensions.isDetailed` enumerates it once per element, like C#.
- `CAEXSequence.append/prepend` tuple arguments: `append(['Alias', alias], ['Path', path])`.
- `appendWithReference(name, cls)` returns `{ result, isReferenced }`.
- `ValueSequence` constructor with a condition: `(owner, elementName, (e) => bool)`; the one
  parameter function is told apart from a `getCAEXOwner` by batch 1.
- `ServiceLocator.GetService<IUniqueName>()` in ImportLibrary is ported as
  `ServiceLocator.uniqueNameService` (C# property with the same body).
- `InstanceExtensions.mapIDReferences` takes the ID map as `Map<string, string>`.
- Out parameters: `normalizePath(path, schema)` -> `{ result, isNormalized }`,
  `externalInterfaceIDInAttributeReference` -> `{ result, isIdReference }`,
  `instanceIDInAttributeReference`/`attributePathInAttributeReference` -> `{ result, isAttributeReference }`,
  `internalElementIDInInternalLinkReference`/`externalInterfaceNameInInternalLinkReference` ->
  `{ result, isInterfaceReference }`, `directionViolation` -> `{ result, requiredDirections }`,
  `addChildWithReference` -> `{ result, isReferenced }`, `getAMLInfoFromFilename` ->
  `{ producer, domain, version, edition, libType, extension }` (void, no result),
  `SemanticVersion.tryParse/tryParseStrict` -> `{ result, value }`.
- Overloads merged into one method: `CAEXPathBuilder.caexPath` (1 argument: CAEXObjects or
  XElements, decided by the first non-null item; 2 arguments: names + schema), `pathPart`,
  `pathPartSeparator`, `internalLinkReferencePath` (XElement vs. wrapper arguments),
  `ObjectWithAttributes.addAttributeTypeReference` and `ObjectWithExternalInterface.addInterfaceClassReference`
  / `hasInterfaceClassReference` (string = path overload), `setAttributeValue` (by argument count:
  3 args string/null -> string overload, number -> double overload, other values -> generic
  overload; 5 args -> value/unit/type; 6 args -> double/default/description/unit; 7 args ->
  value/default/description/unit/type), `SystemUnitClassTypeExtensions.new_ExternalInterface`
  (third argument string or null = interfaceClassPath overload), `MappingTypeExtensions.new_InterfaceIDMapping`
  (strings or nulls = ID overload, wrappers = interface overload), `ObjectWithBaseClass.referencedClassName`
  (InternalElementType -> RefBaseSystemUnitPath), `ObjectWithBaseClass.baseClassReference` (string
  = path overload), `InstanceExtensions.updateWithAddedInternalElements` (1 or 2 arguments).
- `CAEXBasicObjectExtensions.Name()` is `name_` (a static `name` collides with Function.name).
- `CAEXBasicObjectExtensions.caexDocument(obj)` is the extension `CAEXDocument()`
  (`CAEXDocument.Document(node)`), distinct from the property `obj.caexDocument` (which falls
  back to AssociatedCAEXDocument). Both are used exactly where C# uses them.

## (b) C# behaviour not reproduced exactly

- Culture sensitive `string.StartsWith/EndsWith(string)` (ClassIsDerivedFrom, IsObjectReferenceWithAlias,
  IsNewVersion, IsExtendedVersion, HasNewVersion, InternalLinkReferencePath) are ordinal in the
  port; they differ only for ignorable code points (soft hyphen, zero width characters, most
  control characters) and canonically equivalent sequences. Null arguments throw
  ArgumentNullException as in .NET.
- AdditionalInformationExtension.SerializedAdditionalInformation: the sequence and its condition
  (`XElement.Parse(value).Name.LocalName == typeof(T).Name`, T.name in JS) are ported; reading or
  writing values needs System.Xml.Serialization.XmlSerializer and throws NotSupportedException.
- `SetAttributeValue(obj, name, number)`: C# picks the generic overload for int/long arguments and
  the double overload for doubles. JS numbers always take the double overload (`setDouble`).
- NullReferenceException is a TypeError at the same place (project convention). Where C# calls
  `string.Equals` on a possibly null receiver, the port calls `.valueOf()` to fail the same way.
- Path.GetFileName (AddAttributeTypeReference/AddInterfaceClassReference default names) follows
  Windows semantics ('\' and '/' separators, "C:" root), the platform of the oracle.
- `CAEXBasicObjectExtensions.descendants(obj, Type)` and `Descendants<T>()` are one method; the
  non-generic `Descendants(Type)` filters `as CAEXBasicObject` in C#, the port filters by the type.
- `system/strings.ts isNullOrWhiteSpace` uses JS `\s`, which includes U+FEFF (not white space in
  .NET). Used by PathPartName, AliasFromReference, NormalizePath, IsReferenceWithAlias.

## (c) Apparent bugs of the original, ported unchanged

- `CAEXBasicObjectExtensions.HasOldVersion` tests `IsNewVersion` of the revisions.
- `CAEXPathBuilder.PathPart(element, useId: true)` creates a new ID for an element without one
  but returns the old (null/empty) value; `InternalLinkReferencePath` then builds ":Name".
- `CAEXPathBuilder.CAEXPath(string[] names, schema)`: after an empty name the index no longer
  advances, so all following parts repeat the empty name (the '/' separators are still added).
- `CAEXPathBuilder.CAEXPath(IEnumerable<CAEXObject>)` skips empty path parts in PathParts but not
  in the loop: ArgumentOutOfRangeException for objects without a name.
- `PathNameListWithSeparator` uses a `short` index and an `ushort` loop counter: parts longer than
  32767 characters throw IndexOutOfRangeException, paths longer than 65535 characters loop
  forever (reproduced).
- `ObjectWithAttributes/ObjectWithExternalInterface.Add*Reference` pass the owner's tag name as
  `elementTagName` to IUniqueName.UniqueCAEXName.
- `AttributePathInAttributeReference`, `InstanceIDInAttributeReference`, `IsAttributeReference`,
  `IsIDReferenceWithAlias` index `array[0]`/`array[1]` without length checks
  (IndexOutOfRangeException for e.g. "[" or "abc@").
- `ExternalInterfaceTypeExtensions.DirectionViolation/CategoryViolation` collect the violating
  interfaces in a list that is only used for its count.
- `CAEXObjectExtensions.SemanticVersion`: the negative component checks can never trigger
  (SemanticVersion normalizes build/revision to at least 0).

## (d) Left undone / for the coordinator

- `src/engine/resources/files/SemanticVersion.ts` is a new file: SemanticVersion lives in the
  separate assembly Aml.Engine.Resources (not in the type map, not in any batch). It is a full
  port (decompiled from Aml.Engine.Resources 4.2.1) because `CAEXObjectExtensions.semanticVersion`
  returns it. `streaming/DocumentStreaming.ts` has a private minimal version that could use it.
  It builds on `amlobjects/internal/Version.ts` (System.Version helper of another batch).
- XmlSerializer based (de)serialization in AdditionalInformationExtension (see (b)).
- No oracle test for the extension methods was added to `test/` (not my batch); the scratch
  comparisons are described above and can be turned into an oracle mode.
