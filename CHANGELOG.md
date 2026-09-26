# Changelog

## 0.1.0 (2026-09-26)

First version for use in other projects (FPB.js). Behaviour of Aml.Engine 4.5.2.

- Complete port of Aml.Engine 4.5.2: loading and saving, the CAEX object model for CAEX 2.15 and
  3.0, paths and aliases, inheritance, mirrors, typed attribute values, schema validation,
  commands and undo hooks, AutomationML objects, standard libraries, AMLX containers, streaming.
- Public API with the C# names in camel case; the C# extension methods also as instance methods.
- ESM and CommonJS builds with type declarations; runs in Node and in the browser (checked in
  headless Microsoft Edge).
- Where Aml.Engine never returns (cyclic references, a few loops), the port throws
  `CyclicReferenceException` or `ArgumentException` (docs/deviations.md).
- Optional corrections of ten data errors of the original, off by default (docs/fixes.md).
- `npm test` warns when NuGet has a newer Aml.Engine (docs/upgrading-aml-engine.md).
- Verified against the original by differential tests (oracle in `oracle/`), see README.
