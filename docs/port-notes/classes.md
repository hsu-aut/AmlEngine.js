# Port notes: classes, instances, interfaces, roles and mappings

Files (all in `src/engine/caex/`): `SystemUnitClassType.ts`, `SystemUnitFamilyType.ts`,
`InternalElementType.ts`, `RoleClassType.ts`, `RoleFamilyType.ts`, `RoleRequirementsType.ts`,
`SupportedRoleClassType.ts`, `InterfaceClassType.ts`, `InterfaceFamilyType.ts`,
`ExternalInterfaceType.ts`, `InternalLinkType.ts` (+ `InternalLinkType_LinkedObjects`),
`InternalLinkComparer.ts`, `MappingType.ts`, `MappingElementType.ts`,
`AttributeNameMappingType.ts`, `InterfaceIDMappingType.ts`, `InterfaceNameMappingType.ts`.

Class hierarchy as in C#:

- `SystemUnitClassType` (abstract) extends `CaexObjectWithReference<SystemUnitClassType>`;
  `InternalElementType` and `SystemUnitFamilyType` extend `SystemUnitClassType`.
- `RoleClassType` extends `CaexObjectWithReference<RoleClassType>`; `RoleFamilyType` extends
  `RoleClassType`.
- `InterfaceClassType` extends `CaexObjectWithReference<InterfaceClassType>`;
  `InterfaceFamilyType` and `ExternalInterfaceType` extend `InterfaceClassType`.
- `RoleRequirementsType`, `SupportedRoleClassType`, `MappingType` extend `CAEXBasicObject`;
  `MappingElementType<T>` (abstract) extends `CAEXBasicObject`; the three mapping types extend it.
- `InternalLinkType` extends `CAEXObject`.
- `InternalLinkComparer` implements `IEqualityComparer<XElement>` of `src/system/linq.ts`.

## API decisions

- Static constructor delegates keep the C# name `Constructor` (a static field or getter named
  `constructor` is not usable in JS): `InternalElementType.Constructor`,
  `SystemUnitFamilyType.Constructor`, `RoleFamilyType.Constructor`,
  `RoleRequirementsType.Constructor`, `SupportedRoleClassType.Constructor` (static field set in a
  static block, like the C# static constructor), `InterfaceFamilyType.Constructor`,
  `ExternalInterfaceType.Constructor`, `InternalLinkType.Constructor`, `MappingType.Constructor`,
  `AttributeNameMappingType.Constructor` (static readonly field), `InterfaceIDMappingType.Constructor`,
  `InterfaceNameMappingType.Constructor`. They take `XElement | null`.
- `IInstance.Class` properties are `class` (naming rule).
- The C# `implicit operator ObjectWithAMLAttributes(X)` is the static method
  `X.op_Implicit(x)` (its IL name) on SystemUnitClassType, RoleClassType, RoleRequirementsType,
  InterfaceClassType, ExternalInterfaceType.
- Named C# tuples become objects with camel-case field names:
  `MappingElement<T> = { caexObject, mappingIdentifier }` (exported type from
  `MappingElementType.ts`), `qualifiedRoleClassAttributes` yields `{ roleClass, attribute }`,
  `qualifiedRoleClassInterfaces` yields `{ roleClass, externalInterface }`. The C# test
  `tuple.Equals(default)` is `tuple === null || both fields null`.
- The obsolete generic overload `GetReferenceHierarchy<T>(bool)` (SUFT, RFT, IFT) is
  `getReferenceHierarchy(includeExternals, type)` with a class constructor or an interface name
  as `type`; it returns an array (the `Queue<T>` in FIFO order) and throws InvalidCastException
  like `Cast<T>()`.
- `InternalLinkType.LinkedObjects` is exported as `InternalLinkType_LinkedObjects` and attached as
  static `InternalLinkType.LinkedObjects`; its internal members (`link`, the interface setters)
  are public in TS.
- `InternalLinkComparer` has `equals(x, y)`, `getHashCode(obj)` (returns a key, not a number:
  sorted pair of the partner references, symmetric like the C# XOR) and `key(x)` for the LINQ
  port.

## C# behaviour not reproduced exactly

- Overloads that differ only by the static type of a reference argument cannot be told apart
  when the argument is `null`. Where both C# overloads throw ArgumentNullException, the port
  takes the object overload, so the parameter name differs from C# for a null string:
  `InternalElementType.addRoleClassReference` (`'roleClass'` instead of `'roleClassReference'`,
  also reachable from `SystemUnitFamilyType.createSupportedRoleInstanceElements` in CAEX 2.15
  when the single SupportedRoleClass has no RefRoleClassPath), `hasGenericRoleClassReference`,
  `hasRoleClassReference` (InternalElementType, SystemUnitFamilyType),
  `SystemUnitFamilyType.addRoleClassReference`, `SystemUnitFamilyType.hasGenericRoleClassReference`
  (null RoleRequirement gives `'roleClass'` instead of `'roleReference'`). An empty string still
  takes the string overload.
- `SystemUnitFamilyType` hides the inherited enumerator with `new` in C#; `foreach` over a variable
  typed `SystemUnitClassType` holding a SystemUnitFamilyType enumerates its InternalElements in
  C#, but its child SystemUnitClasses in JS (run time dispatch of `[Symbol.iterator]`). The
  override is typed `Iterator<any>`.
- Explicit interface members `IMirror.IsMaster`, `IMirror.Master`, `IMirror.CreateMirror`,
  `IInstantiable.CreateClassInstance`, `IEnumerable.GetEnumerator` are the public members
  `isMaster` (now also visible on the class), `master`, `createMirror()`,
  `createClassInstance()`, `[Symbol.iterator]`.
- `SystemUnitClassType.InsertAfter/InsertBefore(InternalElementType)` (a new overload next to the
  inherited `InsertAfter(SystemUnitClassType)`) is an override of the inherited method with the
  same body; parameter typed `SystemUnitClassType`.
- C# casts `(InternalElementType)x` / `(SystemUnitClassType)x` throw InvalidCastException; the
  port checks the type and throws `InvalidCastException` with the .NET message format (type name
  of the JS constructor). Array indexing in `RoleRequirementsType.qualifiedRoleClass*` throws
  `IndexOutOfRangeException` like C#.
- `String.Equals` called on a null `RoleReference` (`AddRoleClassReference(string)`) throws a
  TypeError (the port's NullReferenceException) via `(x as string).valueOf()`.
- String concatenation with null (`name + "." + path`, `ID + "/" + path`) uses `?? ''` like C#.
- The protected constructors of the abstract classes `SystemUnitClassType` and
  `MappingElementType` are public in TS (`registerInterfaces` and `instanceof`-based casts need a
  public constructor type; `abstract` still prevents `new`).

## Errors of the original, ported unchanged

- `RoleRequirementsType.Insert/Import` with a MappingType take the special path only when the
  schema is *not* CAEX 2.15, while `InternalElementType` does it only *for* 2.15 (inverse
  conditions; both documented that way in C#).
- `Insert(CAEXWrapper)` with a MappingType returns `MappingObject != null`, which is always true;
  `Insert(int, CAEXWrapper)` returns `MappingObject == caexObject`.
- `New_MappingObject` message typo "is node allowed" (RoleRequirementsType) kept.
- `MappingType` creates new sequence objects on every property access.
- `SupportedRoleClassType.RoleClass` uses the `CAEXDocument` property, `RoleRequirementsType.RoleClass`
  the `CAEXDocument()` extension (differ for unattached objects); kept.
- `Container<T>()` returns null for a base type of the sequence item type (C# `as` on invariant
  generic classes), e.g. `container(CAEXObject)` on a SystemUnitClass returns null instead of
  delegating to the base class.
- `RoleFamilyType.CreateClassInstance` for another document does not call
  `SetUpdateReference`/`MapIDReferences`, unlike the SystemUnitClass and InterfaceClass
  variants.
- `InternalElementType.CreateSystemUnitClass` calls `suc.Add()` without content (no-op).
