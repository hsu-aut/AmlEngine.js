# AmlEngine.js

AutomationML for JavaScript: CAEX 2.15 and 3.0 documents in the browser and in Node, with the
behaviour of [Aml.Engine](https://www.nuget.org/packages/Aml.Engine) 4.5.2, the .NET API of
AutomationML e.V. It is a TypeScript port of that engine, checked against the original by
differential tests: the same calls on the same documents give the same results, the same
exceptions and byte for byte the same saved files. The tests execute 98 % of the functions of the
port; [docs/coverage.md](docs/coverage.md) lists the rest and the reasons. AmlEngine.js is an
independent port, not a product of AutomationML e.V.

What it covers: loading and saving (strings, bytes, files in Node), the CAEX object model with
libraries, classes, instances, inheritance, role requirements, interfaces, internal links,
mirrors and mapping objects, CAEX paths and aliases, lookups by path and ID, typed attribute
values for all XSD data types, schema validation, change events and undo hooks, the AutomationML
objects (facets, groups, ports, frames, external data references, document versions), the
standard libraries, and AMLX containers.

Deliberate and unavoidable differences to Aml.Engine are listed in
[docs/deviations.md](docs/deviations.md), changes per version in [CHANGELOG.md](CHANGELOG.md).

## Install

```bash
npm install amlengine-js
```

It runs in Node 20 or later and in current browsers (checked in Chromium, Edge, Firefox and
WebKit), as ESM or CommonJS with type declarations. The only dependency is
[fflate](https://github.com/101arrowz/fflate) for AMLX containers. In the browser the engine is
about 220 KB with gzip (980 KB minified); load it with `import()` where it is needed.

## Use

```ts
import { CAEXDocument, ClrValue } from 'amlengine-js';

const doc = CAEXDocument.loadFromString(xml);            // null if the text is not XML, as in C#
const ie = doc.findByPath('Plant/Pump');                 // extension methods are instance methods
for (const a of ie.attribute) console.log(a.name, a.value, a.unit);

const lib = doc.caexFile.systemUnitClassLib.append('Components');
const pump = lib.systemUnitClass.append('Pump');
pump.attribute.append('Speed').attributeValue = ClrValue.double(1500);
doc.caexFile.instanceHierarchy.item(0).internalElement.insert(pump.createClassInstance());

const bytes = doc.saveToStream(true);                    // Uint8Array, as SaveToStream writes it
```

Names follow the C# API in camel case (`CAEXFile` is `caexFile`, `RefBaseSystemUnitPath` is
`refBaseSystemUnitPath`); the rules are in [docs/PORTING.md](docs/PORTING.md). The C# extension
methods exist in both forms, `doc.findByPath(path)` and
`CAEXDocumentExtensions.findByPath(doc, path)` ([docs/fluent-api.md](docs/fluent-api.md)).
A JS number is passed as `int` when it is integral and as `double` otherwise; other CLR types are
explicit (`ClrValue.double(5)`, `ClrValue.ushort(5)`, `ClrValue.float(1.5)`). Methods that touch
the file system work in Node only; in the browser they throw `NotSupportedException`.

On documents with cyclic references (a class that derives from itself, directly or over other
classes, or attributes that mirror each other) some members of Aml.Engine recurse or loop
without end. The port throws `CyclicReferenceException` there instead of freezing the page
([docs/deviations.md](docs/deviations.md), "Calls that do not return").

By default the port also reproduces the errors of Aml.Engine, so that documents behave in the
AutomationML Editor and other .NET tools exactly as those written with the original. Ten of these
errors lose or corrupt data (for example base64 values that do not read back, or references
written as names instead of paths). Each can be corrected per document or for all documents:
`doc.fixes = 'all'` or `Fixes.default = ['base64Binary', ...]`. The list, and how each
correction is checked against the original, is in [docs/fixes.md](docs/fixes.md).

Large documents take longer than in .NET to load and save: a 50 MB document loads in 2 to 4 s
instead of 1 s and saves in 3 to 5 s instead of 0.3 s ([docs/performance.md](docs/performance.md)).
Without indices, Aml.Engine searches the whole document for every `findByID` and for everything
that resolves an ID (internal links, mirrors), so reading a 10 MB document completely through the
API takes 12 minutes there. The port gives the same results, but remembers the IDs it has passed
until an element or attribute changes; the same reading takes 10 to 16 s. Documents loaded with
indices (`CAEXDocument.loadFromString(text, true)`) use ID and path tables in both engines; as in
Aml.Engine, these are not updated when the document changes, so they suit documents that are
only read.

## Verification

`oracle/` is a .NET 8 console program that runs the real Aml.Engine 4.5.2. The tests run the
same operations with both engines and compare the results exactly; only random GUIDs and
timestamps of "now" are masked. The oracle outputs are generated with `npm run oracle`
(.NET 8 SDK, Windows, time zone Europe/Berlin) and are not in the repository.

The port follows Aml.Engine 4.5.2. `npm test` warns when NuGet has a newer release
(`npm run check-upstream` checks alone); [docs/upgrading-aml-engine.md](docs/upgrading-aml-engine.md)
describes how to follow it.

| Test | What is compared |
|---|---|
| `test/xml` | XML parsing, tree operations and serialization (System.Xml.Linq) |
| `test/system` | .NET value types and conversions (DateTime, decimal, XmlConvert, ...) |
| `test/validation` | schema validation messages on valid and broken documents |
| `test/engine/dump`, `reads` | the read API on the corpus and on synthetic edge cases |
| `test/engine/ops`, `mutations` | random sequences of write operations, events, undo hooks |
| `test/engine/values` | typed attribute values of every data type |
| `test/engine/amlobjects` | AutomationML objects, standard libraries, AMLX containers |
| `test/engine/gaps*` | everything the tests above leave out |
| `test/engine/noreturn`, `reads` (`cyclic-*`) | calls that do not return in the original: the port throws exactly there |
| `test/engine/fixes` | the optional corrections: files written with them, read by the original |
| `test/engine/large` | generated documents of 10 and 50 MB: saving, the read API (10 MB), validation messages |
| `scripts/tz-check.mjs` | the time dependent packages in UTC, New York and Kolkata (oracle and tests in that zone) |
| `scripts/culture-check.mjs` | where the original depends on the current culture (oracle in de-DE; results in docs/deviations.md) |
| `test/browser` | a scenario and all System cases in Edge, Chromium, Firefox and WebKit, compared with Node |

[docs/coverage.md](docs/coverage.md) lists the functions of the port that no comparison
executes, with the reasons in `docs/coverage-notes/`. [docs/seed-runs.md](docs/seed-runs.md)
records runs with other seeds and larger sizes than the committed inputs.
[docs/performance.md](docs/performance.md) compares time and memory with the original.
`.github/workflows/ci.yml` runs all of this; the oracle outputs are kept in the Actions cache.

## Development

```bash
npm install
npm run typecheck
npm run build          # dist/index.js (ESM), dist/index.cjs, dist/index.d.ts
npm run oracle         # the outputs of the original (.NET 8 SDK, Windows, about two hours)
npm test               # compares with them; without oracle outputs those tests are skipped
AMLENGINE_CHECK_ID_TABLE=1 npm test   # also compares every findByID with the plain search
npm run test:browser   # scenario and System cases in Node, Edge, Chromium, Firefox, WebKit
```

## Repository

| Path | Content |
|---|---|
| `src/xml/` | System.Xml.Linq |
| `src/system/` | .NET value types, LINQ, exceptions |
| `src/engine/` | the port of Aml.Engine, one file per C# file |
| `oracle/` | the reference program on the real Aml.Engine |
| `scripts/` | generators for test inputs, the API, the registry |
| `test/` | tests and their inputs (`test/corpus/`: CAEX files, origins in `SOURCES.tsv`) |
| `docs/` | porting rules and notes, deviations, optional corrections, coverage, performance |
| `.github/workflows/` | CI: quick checks on Linux, the full comparison with the original on Windows; a tag `v<version>` publishes to npm |

## Third-party content

Aml.Engine and the AutomationML standard libraries in `src/engine/resources/libraries/`
(Aml.Engine.Resources) are MIT licensed by AutomationML e.V.; AMLX containers use
[fflate](https://github.com/101arrowz/fflate) (MIT). The test corpus contains, besides the
author's own files, published examples of AutomationML e.V., P2O-Lab, ZVEI and the OPC
Foundation, used unchanged as test inputs; origin and license of each file are in
`test/corpus/SOURCES.tsv` and `test/xml-corpus.sources.tsv`. See [NOTICE](NOTICE).

## License

MIT
