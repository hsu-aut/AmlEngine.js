# Porting rules: Aml.Engine (C#) to AmlEngine.js (TypeScript)

AmlEngine.js is a faithful port of Aml.Engine 4.5.2. The decompiled C# source is the
specification; the original engine, run by `oracle/`, is the judge. Where the two disagree,
the oracle wins. Every rule below exists so that ported code behaves like the original and so
that different files ported at different times fit together.

## Layout

| C# namespace | TS folder |
|---|---|
| `System.Xml.Linq` | `src/xml/` (done, byte-exact with .NET) |
| `System.*` value types and helpers (DateTime, TimeSpan, decimal, Guid, XmlConvert, exceptions, events) | `src/system/` |
| `Aml.Engine.XML` | `src/engine/xml/` |
| `Aml.Engine.Xml.Extensions` | `src/engine/xmlext/` |
| `Aml.Engine.Schema` | `src/engine/schema/` |
| `Aml.Engine.CAEX` | `src/engine/caex/` |
| `Aml.Engine.CAEX.Extensions` | `src/engine/caex/extensions/` |
| `Aml.Engine.CAEX.Commands` | `src/engine/caex/commands/` |
| `Aml.Engine.AmlObjects` | `src/engine/amlobjects/` |
| `Aml.Engine.Services` (+ Interfaces, Model) | `src/engine/services/` |
| `Aml.Engine.Adapter`, `Streaming`, `Resources` | `src/engine/<name>/` |

One TS file per C# file, same base name. Keep member order of the C# file so a diff
side by side stays readable. Doc comments (`/// <summary>`) become TSDoc, shortened
where they only repeat the name.

## Names

- Classes, interfaces, enums, enum members: unchanged (`InternalElementType`, `CAEXSchema.CAEX3_0`).
- Methods and properties: lower camel case by one rule, applied mechanically: lower-case the
  leading run of capitals, except its last capital when a lower-case letter follows.
  `CAEXFile` -> `caexFile`, `ID` -> `id`, `IDService` -> `idService`, `RefBaseClassPath` ->
  `refBaseClassPath`, `AMLFile` -> `amlFile`, `New_CAEXDocument` -> `new_CAEXDocument`,
  `CAEXPath()` -> `caexPath()`, `XName()` -> `xName()`. Underscores stay.
- Constants (`const`, `static readonly` fields): unchanged when they are public API
  (`CAEXObject.GUID_FORMAT`), otherwise camel case.
- Private fields: `_name` as in C#.

## Types

| C# | TS |
|---|---|
| `string` | `string` (null stays `null`; never turn null into `''`) |
| `bool` | `boolean` |
| `int`, `short`, `sbyte`, `byte`, `ushort`, `uint`, `float`, `double` | `number` |
| `long`, `ulong` | `bigint` |
| `decimal` | `Decimal` from `src/system` |
| `DateTime`, `TimeSpan`, `Guid`, `Uri` | classes from `src/system` |
| `object` | `unknown` |
| `XElement` etc. | `src/xml` classes |
| `IEnumerable<T>` | `Iterable<T>`; lazy `yield` methods become generator functions |
| `List<T>` / arrays | `T[]` |
| `Dictionary<K,V>` | `Map<K,V>` |
| `Type` parameters (`typeof(T)`) | the class constructor (`typeof InternalElementType`) |

Null handling: C# `a?.b` maps to `a?.b ?? null` where the result is observable
(JS would give `undefined`). Public API returns `null`, never `undefined`.

## Equality: the one rule that silently breaks things

`CAEXWrapper` overloads `==` and `!=` (equal when both wrap the same `XElement`).
In the decompiled source this looks like plain `==`. Every `==` / `!=` whose operands are
statically `CAEXWrapper` or a subclass must become `CAEXWrapper.equals(a, b)` /
`!CAEXWrapper.equals(a, b)`. `(object)a == b` in C# is reference equality: `a === b`.
`string ==` is value equality (`===`). `XName`/`XNamespace` are interned: `===` is correct.
`object != object` on boxed strings (`SetAttributeValueCmd.Execute`) is reference inequality
in C#; see `docs/deviations.md`.

## Overloads, out/ref, optional parameters

- Overloads become one method that dispatches on the runtime type of its arguments, in the
  order the C# compiler would pick. When dispatch would be ambiguous, add a suffixed method
  (`insertAt`) and note it in the TSDoc.
- `out` parameters: return an object (`{ result, violationLog }`) or, for `TryX(out v)`,
  return the value or `null`. Name the fields after the C# parameters.
- Optional parameters keep their C# default values.

## Interfaces

C# interfaces become TS interfaces for typing. Because TS interfaces do not exist at run
time, `x is IFoo` checks use `implementsInterface(x, 'IFoo')` from `src/engine/interfaces.ts`.
Every class that implements interfaces in C# registers them right after its declaration:
`registerInterfaces(InternalElementType, 'IInternalElementContainer', 'IMirror', ...)`.
Interface registration is inherited.

## Module cycles

Base classes must not import subclasses at run time (an `extends` over a module cycle fails at
load). Run time references to other wrapper classes go through the registry:
`import { T } from '../registry.js'` and `x instanceof T.InternalElementType`,
`new T.RoleRequirementsType(node)`. Each class module registers itself at its end:
`T.InternalElementType = InternalElementType`. Use `import type` for type positions.
`src/engine/index.ts` imports every module so the registry is complete.

## Extension methods

C# extension methods become exported functions in the module of their static class
(`CAEXBasicObjectExtensions.findCaexObjectFromId(obj, id)`), exported as a namespace object
named like the C# class. Engine code calls them as functions. Selected extensions are also
exposed as instance methods for convenience in `src/engine/fluent.ts`; that file is the only
place where prototypes are extended.

## LINQ and iteration

Port LINQ to plain loops or array methods, but keep evaluation semantics: `.ToList()` and
`.ToArray()` snapshot, everything else is lazy. Where C# iterates a live XLinq sequence
(`Elements()`, `Attributes()`, `Nodes()`) while modifying the tree, the XLinq port behaves
like .NET (live, pointer based), so a literal port stays correct. `First()` throws
`InvalidOperationException` when empty, `FirstOrDefault()` returns `null`.

## Exceptions

Throw the classes from `src/system/exceptions.ts`, named like their .NET counterparts
(`ArgumentNullException`, `ArgumentException`, `InvalidOperationException`,
`NotSupportedException`, `XmlException`, ...). Keep messages and parameter names.
Swallowing `catch` blocks stay swallowing.

## Events

`event EventHandler<T>` becomes an `EventSource<T>` from `src/system/events.ts` with
`subscribe`/`unsubscribe`, raised synchronously in subscription order. `INotifyPropertyChanged`
maps to the same mechanism (`propertyChanged`).

## Static state

C# static members stay static (`ServiceLocator`, `CaexCommand.isSilent`, `DocumentTable`).
The engine is single threaded in JS; `lock` blocks disappear.

## Tests

Every ported behaviour is checked against the oracle, never against expectations written by
hand from reading the C# code:

- read model: `oracle dump` (paths, references, inheritance, mirrors) compared by
  `test/engine/dump.oracle.test.ts`;
- write operations: scripted operation sequences run by `oracle ops` and by the JS runner,
  compared on the saved XML and on the recorded results;
- anything the oracle cannot express is a gap and is listed in `docs/coverage.md`.
