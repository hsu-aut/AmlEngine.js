# Coverage notes: services misc

Area: `src/services/UniqueNameService.ts`, `src/services/CAEXFileStatisticService.ts`,
`src/services/RepairTypeEnumConverter.ts`, the equality members of `src/services/ValidationKey.ts`,
and System helpers of the port compared with their .NET types: `Dictionary`, `List` and `HashSet`
in `src/system/linq.ts` (`Dictionary<string,int>`, `Dictionary<int,int>`, `List<int>`,
`HashSet<int>`) and `AsyncLock` in `src/system/AsyncLock.ts` (`SemaphoreSlim`).

Files: `oracle/ServicesMiscOracle.cs`, `test/services/misc.oracle.test.ts`,
`scripts/gen-services-misc.mjs` (seed 3682, deterministic) writing the cases under
`test/services/misc/`. Oracle call:
`svc-misc test/services/misc test/corpus test/oracle-out/services/misc.json [section]`
(sections `unique`, `appends`, `engineops`, `stat`, `repair`, `vkey`, `dict`, `coll`, `lock`).

The oracle runs in about 17 s and the test in about 25 to 55 s. The test has 425 tests, and all of
them pass. The tests are built from the input cases; a case without an entry in the oracle output
fails instead of being left out.
Every result is compared exactly. In the engine-operation and append sections, GUIDs and "now"
timestamps are canonicalized as in `EngineOpsOracle`. Nothing else is normalized, except the
AggregateException below.

## What is compared

1. **UniqueNameService, direct calls** (103 scripts, 3 555 results). The scripts start from
   new documents of both versions, generated documents and 11 corpus files. They cover:
   - `UniqueCAEXName` in all three overloads (XElement with and without default name,
     `IEnumerable<XElement>` built from children, children of one name, descendants, an empty
     list, a list with a null element and siblings) and a null sequence;
   - `IsUniqueCAEXName`, `RegisterDefault` (also a null key and an empty name),
     `Suspend`/`Resume`;
   - plain XML edits that build the sequences.

   The names include:
   - numeric suffixes and leading zeros;
   - `int.MaxValue` (wraps to `-2147483648`) and numbers above it (`AggregateException` with the
     `OverflowException` of `Convert.ToInt32`, message compared);
   - spaces, brackets, non-ASCII digits and superscripts;
   - the default name of each of 35 CAEX tag names (one targeted script per tag);
   - odd tag names: null, empty, `a b`, `{urn:x}Bar`, `x:y`, `1abc`.
2. **Append and Prepend on every sequence type** (36 runs, 6 184 results). The runs use 9
   documents in 4 modes: service registered, registered and suspended, not registered, and
   registered with `NamedElementSequence.UniqueName`. The oracle finds every public `CAEXSequence<>`
   property of the first wrapper of each element name by reflection (92 owner/property pairs).
   For each it calls `Append()`, `Append(name)` twice with a colliding name, `Append(null)`,
   `Prepend(name)` and `Prepend()`, and records the name, ID and position of each new element.
   The test replays the same calls on the camel-cased property and compares the final document
   hash.
3. **Engine operations with the service registered** (40 scripts, 1 600 steps). The operations of
   `test/engine/ops-apply.ts` (`EngineOpsOracle.Apply`) come with collision-prone names. The script
   adds these operations: Suspend, Resume, RegisterDefault and the `UniqueName` flag between steps,
   and also:
   - `Append()` on 9 sequence kinds and `Prepend(name)`;
   - `AddAttributeTypeReference` and `AddInterfaceClassReference` (class and path, addUnique,
     addInstance, name null/empty/given);
   - `AddNewMirror`, `CreateAttributeType` and `CreateInterfaceFamilyClass` (which suspend and resume
     the service).

   Each step compares the result and the document hash, and each script compares the final text.
4. **CAEXFileStatisticService** (74 documents, 3 256 results). The documents are all 63 corpus
   files, 8 generated ones and 2 new ones; one more run passes a null `CAEXFileType`. The test calls
   all 12 counting methods and the 4 overloads with `Predicate<XNode>`. It uses 7 fixed conditions
   plus a null condition; one condition throws. Two generated documents hold `RefAttributeType` and
   `RefBaseSystemUnitPath` as elements (with and without text, nested, and in a foreign namespace),
   so those two counts are not 0. Register, UnRegister and `ServiceLocator.GetService<IStatistic>`
   are also compared.
5. **RepairTypeDescription.** Every value from 0 to 2^22 - 1, compared by 64 chunk hashes and by
   the number of values per text. Also compared one by one: 302 listed values, which are:
   - every enum member;
   - every single bit 0 to 31;
   - every pair of the 22 low bits;
   - the undefined bits 0x2 and 0x4000;
   - the values -1, `int.MinValue` and `int.MaxValue`.
6. **ValidationKey.** 20 keys (null, empty, case and Unicode variants, values outside the enum)
   compared on these members: `ToString`, `Key`, `ValidationType`, `Item1`, `Item2`,
   `Equals(null)`, `Equals(string)`, `Equals(self)`, `Equals(twin)` and hash equality of twins.
   The test also compares the full 20 × 20 Equals matrix, the order of a `HashSet<ValidationKey>`,
   a `Dictionary<ValidationKey,int>` and lookups with new instances.
7. **Dictionary** (40 sequences, 5 108 steps; half string keys, half int keys). Each step is one of
   Add, indexer set, Remove, Clear, TryGetValue, indexer get, ContainsKey, Keys or Values. Phases
   with more removals and more additions exercise the free list. After every step the test compares
   the result, `Count` and the full enumeration order. It also compares the exception messages:
   duplicate key (`ArgumentException ... Key: k`), missing key (`KeyNotFoundException`) and null key
   (`ArgumentNullException`, parameter `key`).
8. **AsyncLock and SemaphoreSlim** (40 sequences, 1 600 steps). The counts are (1, 1), (0, 1),
   (2, 2), (1, 3) and (0, 3). The operations are WaitAsync (entered at once or queued), Wait(0) as
   `tryWait`, Release (previous count, or `SemaphoreFullException` with its message) and
   CurrentCount. After every step the test compares the count and the set of completed waiters,
   which shows the order in which waiters are served.
9. **Changes while enumerating** (88 sequences: 44 `List<int>`, 22 `Dictionary<int,int>`, 22
   `HashSet<int>`). Enumerators are opened (`GetEnumerator`, `Keys`, `Values`) and moved one step
   at a time between changes, also after their end. The List changes are Add, Insert, RemoveAt,
   Remove, the indexer setter, Clear (also of an empty list), RemoveAll, and ForEach with an
   action that adds or sets. AddRange takes the list itself, lazy queries over the list (`Where`,
   `Select`, `OrderBy`, an empty `Where`), `ToList()`, an array, an empty array, a List, a HashSet
   and an iterator method. The Dictionary changes are Add, setting an existing or new key, Remove,
   Clear and TryGetValue; the HashSet changes are Add, Remove, Clear and Contains. After every step
   the test compares the result (with the message of "Collection was modified"), Count and the
   contents. The port's List has no Sort and Reverse, so those are not compared.

## Deviations

- **AggregateException with several inner exceptions.** In `UniqueCAEXName`, PLINQ collects the
  exceptions of the partitions that fail. With several overflowing names, how many inner exceptions
  it collects depends on scheduling. The port wraps the first one only. The oracle records the
  message in the form with one inner exception. With exactly one inner exception, it records the
  original message unchanged.
- **Overload dispatch.** In the port, a null sequence takes the XElement overloads, as the port
  notes say. The C# compiler needs a cast for a null sequence, and the oracle passes
  `(XElement)null`.

## Engine errors fixed (regression cases in this test)

- `src/xml/XName.ts`: `XNamespace.getName(null)` threw a TypeError and now throws
  `ArgumentNullException` (localName). `XName.get(null)` now throws `ArgumentNullException`
  (expandedName).
- `src/engine/xmlext/XmlCAEXSchema.ts`: `xName(node, null)` now returns null for an element
  without a namespace (the C# implicit conversion `string -> XName`). In a namespace it throws
  `ArgumentNullException`, as `XNamespace + null` does. This shows in `UniqueCAEXName(sequence,
  null, defaultName)`: the original returns the default name for CAEX 2.15 and throws
  ArgumentNullException for CAEX 3.0. The port had thrown a TypeError in both cases.
- `src/system/linq.ts`, `List`: `Clear` now changes the version also for an empty list, as in
  .NET 8. `AddRange` copies an array, List or HashSet at once (ICollection<T>, one version change
  when it has items) and adds the items of any other sequence one by one with `Add`. So
  `list.AddRange(list.Where(...))` now throws "Collection was modified" after the first item, as
  in .NET 8; before, the port took a snapshot first. A null source throws `ArgumentNullException`
  (collection).
- `src/system/linq.ts`, `Dictionary` and `HashSet`: the enumerators were generators. They took
  the version on their first step, not when they were created, and a step after the end returned
  done instead of throwing when the collection had changed. They now behave as the .NET enumerators.

No port errors were found in the service files of this area.

## Coverage (v8, this test only, measured before the collection sequences and the linq.ts changes)

| File | Statements | Functions | Uncovered |
|---|---|---|---|
| CAEXFileStatisticService.ts | 31/31 | 20/20 | |
| UniqueNameService.ts | 91/92 | 19/19 | line 89 |
| RepairTypeEnumConverter.ts | 39/40 | 2/3 | line 59, private constructor |
| ValidationKey.ts | 9/9 | 6/6 | |
| AsyncLock.ts | 23/23 | 7/7 | |
| linq.ts, class Dictionary | 73/74 | 14/14 | line 152 |

- `UniqueNameService.ts` line 89 (`elementCollectionWithUniqueName` with a parentless element) is
  unreachable: `isUniqueCAEXName`, its only caller, returns true for such an element first. The
  same is true in C#.
- `RepairTypeEnumConverter.ts` line 59 (`repairOption.ToString()`) is unreachable:
  `HasFlag(None)` is always true, so every value that reaches the check gives "No option". The same
  is true in C#. The private constructor stands in for the C# static class and is never called.
- The uncovered statement of `Dictionary` (in `find`, a bucket with an equal key but no equal
  entry) cannot happen with the default comparer for strings, numbers or ValidationKey, whose keys
  are equal exactly when the items are.

## Open points

- `AsyncLock` does not check its constructor arguments. `SemaphoreSlim` throws
  `ArgumentOutOfRangeException` for a negative initial count, an initial count above the maximum,
  and a maximum of 0 or less. The port creates it only as (1, 1), so this was not compared.
- `List.addRange` treats only arrays, `List` and `HashSet` as ICollection<T>. A C# source that is
  an ICollection<T> but a lazy sequence in the port (for example the `Keys` of a dictionary) is
  added item by item; the result differs only when that source is a view of the list being
  extended, which no caller does.
