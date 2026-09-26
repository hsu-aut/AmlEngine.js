# Correcting data errors of Aml.Engine

By default AmlEngine.js behaves like Aml.Engine 4.5.2, including its errors. That is deliberate:
the AutomationML Editor and most .NET tools are built on Aml.Engine, and a document written with
AmlEngine.js should behave there exactly as one written with the original.

Ten errors of the original lose or corrupt data. Each of them can be corrected on its own:

```ts
import { CAEXDocument, Fixes } from 'amlengine-js';

const doc = CAEXDocument.loadFromString(xml);
doc.fixes = ['base64Binary', 'referenceSetter']; // this document only
doc.fixes = 'all';                                // all corrections for this document
doc.fixes = null;                                 // back to the default

Fixes.default = 'all'; // documents and containers without their own selection, and streaming
```

`AutomationMLContainer` has the same `fixes` property. `DocumentStreaming` has no document and
uses `Fixes.default`. A document converted with `TransformToSchema` keeps the selection of its
source. `Fixes.enabled(name, context)` tells whether a correction applies. Unknown names throw
`ArgumentException`. The names are in `ALL_FIXES`.

The other apparent errors of the original listed in `docs/port-notes/*.md` (section c) are not
correctable. Most are invisible (dead code, a return value that is always true). The rest either
cannot be reached through the engine, or they end with an exception on unusual input instead of
giving a wrong result.

## The corrections

| Name | Error of the original | Correction |
|---|---|---|
| `base64Binary` | An `xs:base64Binary` value is written unencoded, but read base64 decoded, so it does not read back (`hällo` reads back as `""`). | The value is written base64 encoded: text as UTF-8, a `Uint8Array` as it is. |
| `datePartValues` | `xs:gDay` is written as `---05` and `xs:gMonth` as `--05--`, but only a plain number reads back as a number. | These forms, `--05` and forms with a time zone read back as the day or month number, if it is valid (day 1 to 31, month 1 to 12). |
| `booleanFromNumber` | `xs:boolean` from a number or from `"1"`/`"0"` is written as `false` (the original parses with `bool.TryParse`). | A number is `true` unless it is zero; `"1"` and `"0"` are `true` and `false`. |
| `referenceSetter` | The `Reference` setter of classes and attributes writes the name of the referenced object instead of its path, so the reference cannot be resolved. | The reference path is written, as `AddReference` does. |
| `automationMLVersionSetter` | The `AutomationMLVersion` setter of `AMLFile` (CAEX 3.0) does not change an existing `SuperiorStandardVersion` element. | The element gets the new version. |
| `internalLinkPartnerId` | An InternalLink reference (CAEX 2.15) to an interface whose element has no ID gives the element a new ID but writes the old, empty one: `:Out`. | The new ID is used: `<id>:Out`. |
| `undoElementContent` | Undo of an element content change stores all descendant nodes instead of the child nodes, so nested content is inserted twice. | The child nodes are stored. |
| `streamingAdjacentElements` | `DocumentStreaming` (stream variant, document versions) skips an element that directly follows a matched one, as in files saved without indentation. | Adjacent elements are found. |
| `relinkPartRelationships` | `RelinkPart(oldUri, newUri)` (obsolete overload) looks for the relationships of the part to itself instead of those of other parts to it, so they keep the old URI, and it drops the part's own relationships. | Relationships to the part move to the new URI; the part keeps its own. |
| `conversionAutomationMLVersion` | Converting a CAEX 2.15 document to CAEX 3.0 is meant to remove the `AdditionalInformation AutomationMLVersion` element, but looks for it in the wrong namespace, so the old version information stays next to `SuperiorStandardVersion`. | The element is found in either namespace and removed. |

## How the corrections are checked

- **Off by default, original behaviour unchanged.** All oracle tests run with the corrections off
  and compare with Aml.Engine 4.5.2 as before. Checking a switched off correction costs nothing:
  `Fixes.enabled` returns at once until a correction is selected anywhere.
- **Off and on, per correction.** `test/engine/fixes.test.ts` shows for each correction the
  original's result (off) and the corrected one (on).
- **The original reads the corrected output.** `scripts/gen-fixes.mjs` writes documents and a
  container with the corrections on (`test/fixes`). `oracle/FixesOracle.cs` reads them with
  Aml.Engine 4.5.2, and `test/engine/fixes.oracle.test.ts` checks that the original sees exactly
  the intended content:
  - attribute values (base64, boolean);
  - base classes set through `Reference`;
  - the AutomationML version;
  - both partners of the InternalLink;
  - the converted document;
  - the relationships of the relinked container.

  For streaming, the reference is the original's result on the same document with whitespace
  between the elements. The oracle also shows the error itself there: without whitespace it finds
  only every second element.
- **All on, against all oracles.** With `Fixes.default = 'all'` the oracle tests differ from the
  original only where a correction applies. This was checked once when the corrections were added,
  in 54 of 5201 comparisons, each of them traced to one of the ten corrections.
- **Round trips where no file is involved.** `datePartValues` (reading) and `undoElementContent`
  (in memory) leave nothing for the original to read. They are checked by round trips in
  `test/engine/fixes.test.ts`: the value written by the original's encoder reads back as the
  number, and the element after undo equals the element before the change.

## When Aml.Engine changes

A new Aml.Engine release may fix some of these errors itself, perhaps differently.
`docs/upgrading-aml-engine.md` describes the update. The oracle shows every change of behaviour,
including a fix of one of these errors. The new behaviour of the original then becomes the default
of the port, and the correction of that name is kept as a no-op (so code that selects it keeps
working) or adapted to the way the original fixed it.
