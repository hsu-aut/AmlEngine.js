# Performance

Time and memory of AmlEngine.js compared with Aml.Engine 4.5.2 on large documents, measured on
2026-11-03 with `node test/perf/run.mjs` (the steps are the same in `test/perf/bench.ts` and
`oracle/BenchOracle.cs`; a corpus document is loaded first to warm up the JIT compilers). Times
vary between runs by up to a factor of 1.5.

Machine: AMD Ryzen 7 PRO 8840HS, 60 GB RAM, Windows 11. .NET 8.0.24, Node 20.19.2, Playwright
1.63.0 with Chromium 153, Firefox 155 and WebKit 26.6 (headless).

Documents: `node scripts/gen-large.mjs test/large 10,50`, plant-like CAEX 3.0 with class
libraries, typed attribute values, interfaces, internal links, mirrors and role requirements
(10 MB: 5,269 InternalElements; 50 MB: 26,492). They are not in the repository.

## Steps

| Step | What it does |
|---|---|
| load | `LoadFromString` |
| walk | every InternalElement: name, ID, `SystemUnitClass`, attribute values, number of interfaces |
| find | `FindByID` for 200 IDs spread over the document (no ID table) |
| save | `SaveToStream(true)` |
| validate | `Validate` (schema validation; saves the document indented first) |
| load idx | `LoadFromString(text, createIndices: true)`: also builds the ID and path tables |
| find idx | `FindByID` for every InternalElement of that document |
| heap | memory held after loading (.NET: `GC.GetTotalMemory(true)`; Node and Chromium: used JS heap after a full GC; not available in Firefox and WebKit) |

The walk produces a checksum (counts and summed lengths) that is the same in all six
environments, and all of them report both documents as valid.

## 10 MB

| | load | walk | find | save | validate | load idx | find idx | heap |
|---|---|---|---|---|---|---|---|---|
| Aml.Engine (.NET 8) | 0.14 s | 0.08 s | 0.79 s | 0.12 s | 0.38 s | 0.18 s | 0.03 s | 40 MB |
| Node | 0.77 s | 0.18 s | 0.07 s | 0.72 s | 1.3 s | 0.89 s | 0.03 s | 57 MB |
| Chromium | 0.66 s | 0.15 s | 0.06 s | 0.62 s | 1.1 s | 0.62 s | 0.01 s | 31 MB |
| Firefox | 0.81 s | 0.15 s | 0.02 s | 0.63 s | 1.7 s | 0.83 s | 0.01 s | |
| WebKit | 0.45 s | 0.08 s | 0.03 s | 0.58 s | 1.0 s | 0.47 s | 0.01 s | |

The heap in Chromium is from a second run; the first gave a negative value.

## 50 MB

| | load | walk | find | save | validate | load idx | find idx | heap |
|---|---|---|---|---|---|---|---|---|
| Aml.Engine (.NET 8) | 0.98 s | 0.24 s | 4.4 s | 0.28 s | 0.90 s | 0.96 s | 0.01 s | 209 MB |
| Node | 3.5 s | 0.79 s | 0.39 s | 4.5 s | 9.1 s | 5.0 s | 0.20 s | 282 MB |
| Chromium | 3.3 s | 0.82 s | 0.34 s | 4.8 s | 7.0 s | 3.2 s | 0.03 s | 166 MB |
| Firefox | 3.9 s | 0.68 s | 0.12 s | 3.4 s | 9.5 s | 4.5 s | 0.03 s | |
| WebKit | 2.1 s | 0.39 s | 0.16 s | 3.1 s | 5.1 s | 2.5 s | 0.05 s | |

## Read model walk

The walk of `test/engine/dump.ts` (the `dump` mode of the oracle in .NET) reads every object
through the API: name, path, `FindByPath` and `FindByID` of the object itself, base classes,
inherited members, mirrors, the partners of internal links, attribute values. It resolves IDs
about once per object. Documents from `gen-large.mjs` (1, 2 and 4 MB generated with the same
seed); Node, times without loading; .NET, the whole oracle run (loading takes less than 1 s):

| | 1 MB | 2 MB | 4 MB | 10 MB | 50 MB |
|---|---|---|---|---|---|
| Aml.Engine (.NET 8) | 6.6 s | 15 s | 66 s | 12 min | hours |
| Port 0.2.0 | 5.5 s | 24 s | 144 s | 20 min | |
| Port | 1.7 s | 3.3 s | 6.1 s | 10 to 16 s | 66 to 93 s |

In the full test suite, where other test files run at the same time, the walk of 10 MB took 71
minutes with port 0.2.0; with the current port the test takes 24 s.

## Findings

- Loading takes 2 to 6 times as long as in the original, the walk of the InternalElements 1 to
  3.5 times; at 50 MB loading takes 2 to 4 s instead of 1 s. Memory is of the same order (Node
  1.4 times, Chromium 0.8 times the .NET heap).
- Saving is the weakest step: 3 to 5 s for 50 MB instead of 0.3 s, and validation contains a
  save. The time is spent in the XML writer, about 40 % of it in garbage collection of the many
  small strings. Two simpler buffering schemes were tried and were slower; writing UTF-8 bytes
  directly would be the next step.
- `FindByID` without ID table: Aml.Engine searches the whole document from the start for every
  call (4 ms per call at 10 MB, 22 ms at 50 MB). Everything that resolves an ID reference
  (internal links, mirrors, the read model walk) inherits this, which makes such work grow with
  the square of the document size. The port gives the same result, but keeps per document the
  first element per ID that its searches have passed and where the last search stopped, until an
  element or attribute changes in any tree (docs/port-notes/xmlext-services.md). Reading a
  document thus looks at every element about once; the first search after a change is the plain
  search of the original. The 200 searches take 0.02 to 0.4 s instead of 0.8 and 4.4 s.
- The plain search is a loop without generator and LINQ, with the XName of "ID" resolved once
  (since 2026-09-26, 3.5 times faster than before). In the port it costs about twice as much per
  element as in .NET, and the cost per element grows with the document: 80 ns per element of the
  document at 1 MB, 143 ns at 4 MB (presumably because the tree no longer fits into the processor
  caches).
- Loading with `createIndices: true` builds the ID and path tables of the query service once;
  then 26,492 lookups take 0.01 to 0.2 s. As in the original, these tables are not updated when
  the document changes, so they suit read-only use.

## Correctness at this size

`test/engine/large.oracle.test.ts` compares with the original: load and save byte for byte
(10 MB, 50 MB), the full read model walk and the save after it (10 MB; at 50 MB the original
would take hours because of its linear `FindByID`), and the validation result and messages
(10 MB, 50 MB, and a 10 MB document with 421 schema errors, `gen-large.mjs` size `10i`). All
match.
