# Coverage notes: mutations

Write operations of the engine beyond `test/engine/ops.oracle.test.ts`, their change events and
the undo/redo hooks, compared step by step with the original Aml.Engine 4.5.2.

- Oracle: `oracle/MutationsOracle.cs` (command `mutations <scripts.json> <corpusDir> <out.json>`)
- JS runner: `test/engine/mutations.oracle.test.ts`
- Scripts: `scripts/gen-mutations.mjs` (seeded) -> `test/mutations/scripts.json`
- Oracle output: `test/oracle-out/mutations.json` (appended to `scripts/oracle.sh`)
- Debugging: `MUT_DUMP=<script>:<step>:<file>` writes the canonical document after that step on
  both sides; `MUT_TRACE=1` prints the script index in the oracle.

## Method

Every script opens document A (new 2.15, new 3.0, `New_CAEXDocument()` default, or a corpus
file) and optionally document B (a second corpus file, often the other CAEX version, for
cross-document inserts/imports/references). Targets are picked as index modulo the candidates of
a kind in document order (A, or B for the "b" object when `bd` is set). Detached objects created
by an operation (copies, instances, mirrors, `CreateSystemUnitClass`, `Create(tag)`) go into a
pool and can be inserted later. Per step four values are compared exactly:

1. the result string (returned objects: tag, Name, ID, owning document, CAEX path; the XML text
   of detached results; booleans; exception type names);
2. every change event, in order: `CaexCommand.CAEXElementChangingEvent/ChangedEvent` (static) and
   `CAEXDocument.Commands.CAEXElementChangingEvent/ChangedEvent` of A and B, each with change
   mode (int), element and parent (tag, Name, ID, document), attribute name, old and new value
   (strings verbatim, other objects as `obj`), current attribute value, the event's document and
   the sender (XDocument or CAEXDocument);
3. the calls to the test services: a recording `IUndoRedo` (BeginTransaction with name and return
   value, PushCommand with command class, document and DisplayName, EndTransaction, Pause, Resume;
   `undo`/`redo` ops call UnExecute/Execute of the recorded transactions) and a test
   `IExternalReferenceResolver` (elements of B are external with alias `ext`, path `other.aml`;
   `other.aml` resolves to B);
4. the SHA-256 of the saved, canonicalized document (GUIDs by order of appearance, "now"
   timestamps), plus the full final text.

The engine has no implementation of `IUndoRedo` or `IExternalReferenceResolver`; the test services
are registered with `ServiceLocator.Register` in both oracle and JS for scripts flagged `undo` /
`resolver`.

## Covered (816 scripts, about 34 000 steps; all pass)

Script groups: fixed scenarios (every operation 12 times on 6 document pairs, both versions),
4 hand-written flows (build a model in a new 2.15 / 3.0 document, roles, interfaces, instances,
mappings, links, mirrors, UpdateInstance, CreateSystemUnitClass, ReplaceRoleClassReference,
ChangeNameAndReferences, CopyTree, AssignNewGuidAsID, moves, external references, SDI,
revisions, removal of every kind; with and without undo of everything and redo), 40 undo/redo
scripts, 60 resolver scripts, 400 random scripts. Additional seeds (5, 99, 1234, 777, 42, 2024
with 800 scripts of 50 ops) were run once and also pass.

Operations (op names in the scripts):

- `seq`: CAEXSequence on 27 sequences (InternalElement, Attribute, ExternalInterface,
  InternalLink, SupportedRoleClass, RoleRequirements, SystemUnitClass, RoleClass, InterfaceClass,
  AttributeType, the file libraries, ExternalReference, SourceDocumentInformation, Revision,
  SourceObjectInformation, Constraint, RefSemantic, the three mapping sequences): Append(),
  Append(name), Append(tuples) with string/int/double/bool/DateTime/null values, the same for
  Prepend, Insert(asFirst, asIs) and InsertAt with sources from the same document, the other
  document (schema transformation), detached copies, pool objects, `Create(tag)` and null, Move,
  RemoveElement, RemoveAt, Remove(), and the reads Count, Exists, First, Last, this[int], At,
  IndexOf, this[(Name,Value)], this[string], this[params string[]], the no-op int setter.
- `boInsert`, `boInsertAt`, `boImport`: CAEXBasicObject.Insert(obj, asFirst, asIs), Insert(pos,
  obj), Import(obj, name, withSubclasses) on every object kind (overrides of CAEXFileType,
  InternalElementType, SystemUnitClassType/FamilyType, RoleFamilyType, InterfaceFamilyType,
  AttributeFamilyType, RoleRequirementsType, SupportedRoleClassType, MappingType, IH ...).
- `newRevision`, `newElem` (New_Description/Version/Copyright), `insertNew`
  (CAEXWrapper.InsertNew for Description/Version/Copyright elements and MappingObject),
  `wrapperValue` (CAEXWrapper<string>.Value setter), `setBasic` (Description, Version,
  Copyright, ChangeMode).
- `copy` (CAEXObject/CAEXWrapper.Copy with all flag combinations), `copyNamed`
  (CAEXObjectExtensions.Copy(name)), `newGuid` (AssignNewGuidAsID with and without reference
  updates), `rename`, `changeNameRefs` (ChangeNameAndReferences), `copyTree`
  (CopyTreeAndChangeReferences).
- `instantiate` (CreateClassInstance of SUC, RC, IC, AT with target null/A/B),
  `instantiateNamed` (InheritanceExtensions.CreateClassInstance(name)), `updateInstance` (IE, EI,
  Attribute, RR, SRC), `mirror` (CreateMirror IE/EI/Attribute), `setMaster`, `createSUC`,
  `createAT`, `createSRC`, `createICFamily`, `recreate` (RecreateAttributeInstance).
- `addRoleIE` / `addRoleSUC` (both overloads, all flags, invalid and aliased paths),
  `replaceRole` (IE, SUC), `hasRole` (HasRoleClassReference object/path with/without
  inheritance, HasGenericRoleClassReference, HasSystemUnitClassReference, RR), `addInterface`
  (SystemUnitClassType and the ObjectWithExternalInterface extension, object/path, flags, names).
- `link` (New_InternalLink), `linkSet` (RefPartnerSideA/B, A/BInterface, the
  InternalLinkTypeExtensions ID setters and getters, IsDefined), `insertSibling`
  (InsertBefore/After of IL, ExternalReference, IE, SUC, RC, IC, Attribute).
- `remove` with removeRelations true/false on every wrapper kind (including non-CAEXObjects,
  the file root, libraries, mappings, SDI, revisions).
- `extRefNew`, `extRefSet` (Alias, Path, MakeVersionReference, MakeExtensionReference and the
  Is*Reference / PathAreEqual reads), `extRefInsert` (Insert_ExternalReference), `sdiAdd`
  (AddSourceDocumentInformation), `sdiSet`, `mappingNew` (New_MappingObject of IE/RR/SRC, 2.15 vs
  3.0), `mappingAdd` (all four New_*Mapping), `fileImport` (all Import_*/Import*/Insert_* of
  CAEXFileTypeExtensions), `setXAttr` (SetXAttributeValue for 19 attribute names, which decides
  the change modes of SetAttributeValueCmd), `setRef` (reference setters of every class and
  instance type, by path and by object, also across documents with alias).
- `undo` / `redo`: UnExecute/Execute of every command class (AddCmd, AddNewCmd, InsertCmd,
  InsertNewCmd, MoveCmd, RemoveCmd, SetAttributeValueCmd, SetElementValueCmd).

## Bugs found and fixed

- `src/engine/caex/CAEXSequence.ts` (copyToImport): the decompiled `$"{alias}{64}{key}"` was
  ported as the number 64; it is the char '@' (`ext64Lib/Class` -> `ext@Lib/Class`).
- `src/engine/caex/commands/SetAttributeValueCmd.ts` (valuesDiffer): two empty strings are the
  same reference (`string.Empty`) in .NET, so setting "" over "" (e.g. a required attribute set
  to null over an empty value) raises no change event. The port raised ValueChanged.
- `src/engine/caex/AttributeType.ts` (recreateAttributeInstance): C# passes the lazy
  `Attributes()`/`Nodes()` enumerables to SetElementContentCmd; the port passed JS generators,
  which are exhausted after the first Execute, so a redo emptied the attribute. Now re-iterable
  wrappers are passed.

## Deviations and limits

- Local time before 1996: `AddSourceDocumentInformation` writes `LastWritingDateTime` in local
  time; for `default(DateTime)` the port writes `+00:53` (IANA local mean time), .NET on Windows
  `+01:00`. This is the documented system-layer deviation (deviations.md, "Local time before
  1996"); the scripts use dates from 1996 on.
- Mirror cycles (an object set as its own master, directly or through other mirrors) overflow
  the stack of the original engine, which kills the .NET process; the harness skips such
  `setMaster` calls (result `cycle`) on both sides.
- Overloads called with null dispatch by static type in C# and by run time type in JS; the
  scripts only call them where both pick equivalent paths (all such cases matched).

## Not covered

- `IUniqueName` (the engine has no implementation; MakeUniqueName with a service), the
  AmlObjects transactions (`AMLFile` meta information, belongs to the amlobjects package),
  `AdditionalInformation` (ValueSequence), `ICAEXSequence` explicit interface members (same
  code as the public ones), INotifyPropertyChanged events, schema transformation of whole
  documents (`TransformToSchema` only through cross-version inserts), weak-reference behaviour
  of `WeakEventSource` (not reproducible in JS, see port notes).
