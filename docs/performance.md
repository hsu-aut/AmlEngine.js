# Performance

Time and memory of AmlEngine.js compared with Aml.Engine 4.5.2 on large documents, measured on
2026-09-26 with `node test/perf/run.mjs` (the steps are the same in `test/perf/bench.ts` and
`oracle/BenchOracle.cs`; a corpus document is loaded first to warm up the JIT compilers).

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
| Aml.Engine (.NET 8) | 0.41 s | 0.10 s | 1.0 s | 0.23 s | 0.61 s | 0.27 s | 0.03 s | 42 MB |
| Node | 0.70 s | 0.16 s | 2.0 s | 0.65 s | 1.4 s | 0.94 s | 0.04 s | 56 MB |
| Chromium | 0.52 s | 0.09 s | 1.7 s | 0.43 s | 0.98 s | 0.59 s | 0.01 s | 31 MB |
| Firefox | 1.1 s | 0.16 s | 1.2 s | 0.87 s | 2.2 s | 1.1 s | 0.01 s | |
| WebKit | 0.55 s | 0.17 s | 1.0 s | 0.65 s | 0.97 s | 0.57 s | 0.01 s | |

## 50 MB

| | load | walk | find | save | validate | load idx | find idx | heap |
|---|---|---|---|---|---|---|---|---|
| Aml.Engine (.NET 8) | 0.95 s | 0.35 s | 4.3 s | 0.39 s | 1.1 s | 1.0 s | 0.08 s | 207 MB |
| Node | 3.6 s | 0.75 s | 10.6 s | 3.5 s | 6.9 s | 4.7 s | 0.19 s | 282 MB |
| Chromium | 2.5 s | 0.53 s | 9.6 s | 2.9 s | 5.5 s | 3.3 s | 0.02 s | 166 MB |
| Firefox | 4.9 s | 0.68 s | 5.7 s | 3.9 s | 10.7 s | 5.0 s | 0.05 s | |
| WebKit | 2.5 s | 0.41 s | 5.1 s | 3.1 s | 5.7 s | 2.9 s | 0.05 s | |

## Findings

- The port is slower than the original by a factor of about 2 to 4 for loading and walking,
  and the gap grows with the size: at 50 MB loading takes 2.5 to 5 s instead of 1 s. Memory is of
  the same order (Node 1.4 times, Chromium 0.8 times the .NET heap).
- Saving is the weakest step: 3 to 4 s for 50 MB instead of 0.4 s, and validation contains a
  save. The time is spent in the XML writer, about 40 % of it in garbage collection of the many
  small strings. Two simpler buffering schemes were tried and were slower; writing UTF-8 bytes
  directly would be the next step.
- `FindByID` without ID table walks the whole document, in the original as in the port (5 ms per
  call at 10 MB, 21 ms at 50 MB in .NET; 10 and 53 ms in Node). Everything that resolves an ID
  reference (internal links, mirrors, the read model walk) inherits this, which makes such work
  grow with the square of the document size. Loading with `createIndices: true` builds the ID
  and path tables of the query service once; then 26,492 lookups take 0.02 to 0.2 s. As in the
  original, the tables are not updated when the document changes, so this suits read-only use.
- The linear search of `FindByID` was 3.5 times faster after the change of 2026-09-26 (a loop
  without generator and LINQ, the XName of "ID" resolved once): the full read model walk of a
  1 MB document went from 18.1 s to 5.1 s.

## Correctness at this size

`test/engine/large.oracle.test.ts` compares with the original: load and save byte for byte
(10 MB, 50 MB), the full read model walk and the save after it (10 MB; 50 MB would take hours in
both engines because of the linear `FindByID`), and the validation result and messages (10 MB,
50 MB, and a 10 MB document with 421 schema errors, `gen-large.mjs` size `10i`). All match.
