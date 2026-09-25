# Coverage notes: gapscaex

Area: the functions of `src/engine/caex/**` (with `extensions/`, `commands/`, `linq/`),
`src/engine/xml/XDocumentWrapper.ts` and `src/engine/resources/**` that `docs/coverage.md` listed
as never executed (281 functions), compared with Aml.Engine 4.5.2.

- Oracle: `oracle/GapsCaexOracle.cs` (harness, mappings, revisions, culture sensitive comparison),
  `oracle/GapsCaexOracle.Misc.cs` (single wrapper members), `oracle/GapsCaexOracle.Services.cs`
  (user services), `oracle/GapsCaexOracle.Extras.cs` (extension methods, internal helpers,
  resources); command `gapscaex <inputDir> <out.json>`, appended to `scripts/oracle.sh`.
- JS runner: `test/engine/gapscaex.oracle.test.ts` (37 tests, one per scenario, all pass).
- Inputs: `test/gapscaex/` (hand written, `test/gapscaex/** binary` in `.gitattributes`):
  `mapping215.aml`, `mapping30.aml` (mapping objects of InternalElements, RoleRequirements and
  SupportedRoleClasses, CAEX 2.15 multiple roles with qualified `R3.a3` attributes and interfaces),
  `revision215.aml`, `revision30.aml` (Revision elements, extensions, a soft hyphen in a path),
  `misc30.aml` (constraints, ChangeMode values, value elements, links, attribute types),
  `iface30.aml` (Direction, Category and Cardinality interfaces with links), `uniq215.aml`,
  `xsource30.aml` (a second document for imports with external references) and
  `culture-pairs.json` (120 string pairs, `{XXXX}` stands for a UTF-16 code unit).
- Oracle output: `test/oracle-out/gapscaex.json` (gitignored), 37 scenarios, 14 675 recorded
  results including 188 saved document texts.

## Method

Every scenario is written twice, in C# and in TypeScript, with the same calls in the same order.
Each call records `[label, value]`: wrappers as runtime type plus element position and name,
elements by position (`~` for detached trees), tuples and sequences as arrays, enums by name,
doubles in round-trip format, `DateTime` as `o` format plus kind, exceptions as `!ExceptionName`.
`#` entries hold the saved canonical document text (`=` when unchanged since the previous one).
GUIDs are numbered in order of appearance and "now" timestamps replaced
(`EngineOpsOracle.Canonicalizer`); nothing else is normalized. The comparison is exact, entry by
entry; a scenario exception is reported first.

Internal members (no public route in Aml.Engine) are called by reflection in the oracle and
directly in JS: `MappingType.MappingRoleReference`, `CAEXBasicObject/CAEXObject.Property`,
`AttributeType.AttributeNames`, the `Constructor` delegates of `AttributeType`, `CAEXFileType`,
`InternalElementType`, `MappingType`, `NominalScaledTypeType`, `OrdinalScaledTypeType`,
`UnknownTypeType`, the constructor of `XsdDataTypes`, `CAEXPathBuilder.MakeAttributePath`,
`ObjectWithBaseClass.GetAbsoluteXPath`, `CaexValue.SetDefaultValue`,
`CAEXDocument.TransformToSchema(CAEXSchema)` / `IsTransformationActive`,
`InternalLinkComparer.Equals` and the internal properties of `SetAttributeValueCmd`,
`SetElementValueCmd` and `SetElementContentCmd`.

User services are stubs with the same behaviour on both sides: an `IUndoRedo` that records the
pushed commands (reaches the command properties and `CaexCommand.XDocument`), an `IUniqueName`
that appends `_1`, `_2`, ... (reaches `MakeUniqueName`, `ChangeName`, `ChangeReferences`) and an
`IExternalReferenceResolver` that declares every element external (reaches the reference
rewriting of `CAEXSequence` imports across documents). Each is unregistered after its scenario.

## Scenarios (recorded results)

| Scenario | Members | Results |
|---|---|---|
| mappingRead, mappingWrite (2.15, 3.0) | AttributeNameMapping, InterfaceNameMapping, InterfaceIDMapping, MappingElementType: mapping object, role class/reference, system unit class, identifiers, typed getters and setters, `RoleClassMappingElements(bool)`, `SystemUnitClassMappingElements`, setters with every candidate, foreign objects and null, `AddRoleClassElement` with the elements of every RoleClass | 2254 |
| roleRequirements (2.15, 3.0) | `Class`, qualified attributes/interfaces, `QualifiedRoleClassAttributes/Interfaces`, unassigned qualified elements, `IsAssignable...`, `AssignQualified...` for every role class element, `New_MappingObject` | 183 |
| mappingType (2.15, 3.0) | sequences, `CAEXSequence(child)`, `Insert(pos)`, `Insert(asFirst, asIs)`, `Import` of every mapping kind and of a foreign object | 172 |
| revisions (2.15, 3.0) | all RevisionType members and setters, `MakeExtension`, `HasOldVersion`, `HasNewVersion`, `IsExtendedVersion` (library and pairwise), `OldVersions`, `NewVersions`, `OldRevisions`, `Extensions`, `IsNewVersion` for all pairs, `IsExtensionDocument`, SourceObjectInformation | 802 |
| culture | `HasNewVersion(name)` (EndsWith) and `ClassIsDerivedFrom(path)` (StartsWith) for 120 string pairs | 240 |
| members, memberWrites (misc30, mapping215, mapping30) | every wrapper of the documents: `Property(name)`, ChangeMode of Description/Version/Copyright (getters and setters), family enumerators, `GetReferenceHierarchy<T>` with classes and interfaces, `IMirror.IsMaster`, `ExternalInterfaceDescandantsAndSelf`, `ExternalInterfaceAndDescendants`, constraints, `DefaultAttributeValue`, `GetCAEXAttribute`, library enumeration and `VerifySignature`, `Reference`, `CanAddReference`/`AddReference`/`AddChild` for all pairs, `Class` setters, `SchemaLocation`/`SchemaVersion`, `CopyAndChangeReferences`, `InsertAfter/Before`, `AppendWithReference`, `AddNewMirror` | 9564 |
| typeDictionary | indexer, `ContainsKey`, `TryGetValue`, `TryGetCreator` for 42 tag names | 168 |
| enumerators, valueSequences, records | `CAEXEnumerable`/`CAEXSequenceEnumerator` (`Reset`, `Dispose`, null elements, typed filtering, lazy sequences), `ValueSequence<bool/DateTime/string/object>` (indexer get/set, `IndexOf`, `Values`, `ElementAndValues`, `Append`, `Prepend`), `CAEXWrapper<T>` values, `SourceDocumentInformationType.Properties` equality | 112 |
| commands, crossImport, uniqueNames | recorded commands, cross document imports with alias and path rewriting, unique names on import, insert, append, mirrors | 106 |
| constructors, internalHelpers, transform, documentWrapper | internal members above, `IsValidStringValue` (anyURI), `XDocumentWrapper.SaveToFile/SaveToStream/XName` of a subclass (bytes compared), `CAEXDocument.SaveToFileAsync` | 222 |
| interfaceExtensions, attributeExtensions | all of `ExternalInterfaceTypeExtensions` (direction, category, cardinality, violations, related interfaces), `OfInterfaceClass`, `OfRoleClass`, `AddAttributeTypeReference` (class and path variants), `AddInstance`, `UpdateInstance` | 209 |
| semanticVersion, clrValues, serializedAdditionalInformation, derivedClasses | `SemanticVersion` (parse variants, properties, comparison and equality operators for all pairs, constructors), `ClrValue`/`ClrType` `ToString` and numeric value against the boxed .NET values, the selection condition of `SerializedAdditionalInformation<T>`, `InheritanceExtensions.DerivedClasses` | 643 |

Coverage of the assigned files (merged with the existing main and reads runs): functions
1579/1860 (84.9 %) before, 1821/1860 (97.9 %) after; statements 78.9 % before, 90.9 % after (the gapscaex test alone: 1332 functions).

## Bugs found and fixed

- Culture sensitive `string.StartsWith/EndsWith`: the port compared ordinally. .NET (ICU, invariant
  culture) skips ignorable code points (soft hyphen, zero width characters, most control and
  format characters, variation selectors), treats canonically equivalent sequences as equal, and
  fails a prefix match that ends inside a base character plus combining mark. New
  `src/system/CompareInfo.ts` (`cultureStartsWith`, `cultureEndsWith`) emulates this; used by
  `src/engine/caex/extensions/CAEXObjectExtensions.ts` (`IsNewVersion`, `HasNewVersion`,
  `IsExtendedVersion`), `src/engine/caex/extensions/InheritanceExtensions.ts`
  (`ClassIsDerivedFrom(path)`) and `src/engine/caex/extensions/CAEXPathBuilder.ts`.
- `src/engine/caex/AttributeFamilyType.ts` `getReferenceHierarchy(includeExternals, type)`: the
  generic overload accepted only classes and threw a TypeError for an interface type argument
  (`GetReferenceHierarchy<IClassWithBaseClassReference>()`); it now accepts interface names like the
  other family types.

## Deviations that remain

- `AdditionalInformationExtension`: reading or writing a value of `SerializedAdditionalInformation<T>`
  needs `XmlSerializer`, which has no JS counterpart; the port throws `NotSupportedException`
  (documented in the port file). The selection condition is compared with the oracle.
- `CompareInfo.ts` is an emulation of the ICU root collation for prefix and suffix tests, not a
  collation implementation: which non-spacing marks carry primary weights is approximated by the
  canonical combining class and the script (Brahmic, Thai, Lao, Tibetan), the ignorable set by
  general categories. All 120 pairs of `culture-pairs.json` match; other scripts may differ.

## Not covered (not reachable or not testable)

- The private constructors of static classes (`CAEX_CLASSModel_TagNames`, `NamedElementSequence`,
  the 27 extension classes, `CAEXSequenceExtension`, `AMLLibraries`, `LibraryResources`,
  `ClassRepositoryEnumExtension`): C# static classes have no constructor to call.
- `AdditionalInformationExtension` `convertFrom`/`convertTo` lambdas and `deserialize`/`serialize`:
  see deviations.
- `XDocumentWrapper` `FinalizationRegistry` callback: runs only when the garbage collector frees a
  wrapper, at a time JS does not define; no .NET counterpart (C# prunes dead weak references on
  access).

## Notes for regenerating

`scripts/oracle.sh` regenerates the output with `$ORACLE gapscaex test/gapscaex test/oracle-out/gapscaex.json`
(about 5 seconds). No scenario needs the "now" canonicalization; the Local time zone enters the
`DateTime` values of `ValueSequence<DateTime>` and `CAEXWrapper<DateTime>`, which are compared on
the same machine. The inputs are hand written; there is no generator script because no scenario
uses random data.
