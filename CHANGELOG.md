# Changelog

## Unreleased

- Case mapping from fixed .NET tables instead of the JS engine, so that Node and every browser
  give the same result: `char.ToUpperInvariant`, `ToLowerInvariant` and `OrdinalIgnoreCase`,
  supplementary code points included. Fixes found with it, each checked against the original:
  `ChangeMode="ﬅate"` was read as `State`, "ınfinity" was read as a double, "FRİDAY 2020-01-03"
  was parsed as a date, `StringComparer.OrdinalIgnoreCase` returned other values for some
  non-ASCII letters.
- `Trim` and `IsNullOrWhiteSpace` treat U+0085 as white space and U+FEFF not, as .NET does.
- XML parser and writer without recursion: any nesting depth (tested with 20,000 levels).
- Browser check also in Chromium, Firefox and WebKit (Playwright), with all System and
  infrastructure oracle cases.

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
