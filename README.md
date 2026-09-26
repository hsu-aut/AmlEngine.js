# AmlEngine.js

AutomationML for JavaScript: CAEX 2.15 and 3.0 documents in the browser and in Node, with the
behaviour of [Aml.Engine](https://www.nuget.org/packages/Aml.Engine) 4.5.2, the .NET API of
AutomationML e.V. It is a TypeScript port of that engine, and every part of it is compared with
the original: the same calls on the same documents give the same results, the same exceptions and
byte for byte the same saved files.

What it covers: loading and saving (strings, bytes, files in Node), the CAEX object model with
libraries, classes, instances, inheritance, role requirements, interfaces, internal links,
mirrors and mapping objects, CAEX paths and aliases, lookups by path and ID, typed attribute
values for all XSD data types, schema validation, change events and undo hooks, the AutomationML
objects (facets, groups, ports, frames, external data references, document versions), the
standard libraries, and AMLX containers.

Status: complete port, not yet published. Deliberate and unavoidable differences to Aml.Engine are
listed in [docs/deviations.md](docs/deviations.md).

```bash
npm install
npm test               # needs the oracle outputs, see "Verification"
npm run typecheck
npm run build          # dist/index.js (ESM), dist/index.cjs, dist/index.d.ts
npm run test:browser   # runs a scenario in Node and in headless Microsoft Edge
```

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

[docs/coverage.md](docs/coverage.md) lists the functions of the port that no comparison
executes, with the reasons in `docs/coverage-notes/`. [docs/seed-runs.md](docs/seed-runs.md)
records runs with other seeds and larger sizes than the committed inputs.

## Repository

| Path | Content |
|---|---|
| `src/xml/` | System.Xml.Linq |
| `src/system/` | .NET value types, LINQ, exceptions |
| `src/engine/` | the port of Aml.Engine, one file per C# file |
| `oracle/` | the reference program on the real Aml.Engine |
| `scripts/` | generators for test inputs, the API, the registry |
| `test/` | tests and their inputs (`test/corpus/`: CAEX files, origins in `SOURCES.tsv`) |
| `docs/` | porting rules, deviations, coverage |

## Third-party content

Aml.Engine and the AutomationML standard libraries in `src/engine/resources/libraries/`
(Aml.Engine.Resources) are MIT licensed by AutomationML e.V.; AMLX containers use
[fflate](https://github.com/101arrowz/fflate) (MIT). See [NOTICE](NOTICE).

## License

MIT
