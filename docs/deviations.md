# Deviations from Aml.Engine

Where AmlEngine.js behaves differently from Aml.Engine 4.5.2 on purpose, or cannot behave the
same. Everything not listed here is meant to be identical and is checked against the oracle.

## Decisions

### Line ends: always CRLF

.NET writes `Environment.NewLine`: CRLF on Windows, LF on Linux (measured on all 63 corpus
files; the files are otherwise identical). AmlEngine.js always writes CRLF, i.e. it reproduces
Aml.Engine on Windows, where the AutomationML Editor runs. This is a choice of the port, not
behaviour of the original. The oracle runs on Windows, so tests compare against CRLF output.
Other line ends can be requested through `XmlWriterSettings.newLineChars` in `src/xml`.

### Document table: weak references only

`XDocumentWrapper` in .NET keeps a static table XDocument -> WeakReference(document) and cleans
it only on later accesses, so discarded documents stay reachable until then (measured: five
discarded 23 MB documents kept 137 MB alive until the next write). The port keeps the lookup in
a `WeakMap<XDocument, wrapper>` and the list of live documents as `WeakRef`s, so a discarded
document is collectable at once. The observable lookup behaviour, including the quirk that a
node outside any document resolves to the only live document, is unchanged.

### DTD entity limit: failure is `null`, not an empty document

`CAEXDocument.LoadFromString` accepts a DTD and expands internal entities (external ones are
not resolved and expand to nothing); the port does the same, verified against .NET
(`test/xml-corpus/edge26` to `edge33`). Expansion is limited to 10,000,000 characters
(`MaxCharactersFromEntities` of `XDocument.Parse`); beyond that parsing fails with
`XmlException` and `LoadFromString` returns `null`, as it does for every parse error. Aml.Engine
was observed to return a document with `CAEXFile == null` for such an entity bomb instead; the
port does not reproduce that silent half-loaded state. `LoadFromStream`, `LoadFromBinary` and
`LoadFromFile` reject any DTD, as in .NET.

### Calls that do not return: the port throws

Aml.Engine follows references without checking for cycles, and a few loops can run forever. On
such input the original never returns: a recursion overflows the stack, which ends the .NET
process (it cannot be caught), or a loop runs until the process is stopped. In a browser the
same would freeze the tab, so the port detects these cases and throws instead. It detects them
exactly: a guard fires only when the state of the loop repeats, or when a recursive member is
entered again with the same arguments before the first call returned. In both cases the
original provably never returns; everything else behaves as before.

| Where | Original | Port |
|---|---|---|
| Base class references in a cycle (a class deriving from itself, directly, over other classes or over its own child class; for SystemUnitClasses, RoleClasses, InterfaceClasses and AttributeTypes) | stack overflow or endless loop in 48 members of the read API alone (inherited attributes, interfaces and elements, `GetReferenceHierarchy`, `IsInherited`, `IsOverridden`, `OverriddenElement`, `DefaultValue` and `Unit` of attribute types, `ClassIsDerivedFrom`, `IsDerivedFrom...`, `Has...ClassReference`, `IsFacet`/`IsGroup`/`IsPort`, `AllElementsWithNameReference`, ...) | `CyclicReferenceException` |
| Attribute mirrors that mirror each other (`AttributeTypeReference`) | stack overflow | `CyclicReferenceException` |
| `CAEXPathBuilder.PathNameListWithSeparator` on a path longer than 65535 characters (the `ushort` loop counter wraps and the path is read again from the start) | endless loop, unless a later pass ends with `IndexOutOfRangeException` | the same exception where the original throws it; `ArgumentException` once a pass would repeat |
| `XmlCAEXAttributes.GetPartialNodeCAEXPath` with a `root` that is not an ancestor (internal in C#, public in the port) | endless loop | `ArgumentException` |
| `CopyAttributesFrom` with the target as its own source (each copy is appended to the sequence being walked) | endless loop, the attribute list grows until memory runs out | copies the attributes that were there, as the original does first, then `ArgumentException` |

`CyclicReferenceException` (exported from the package) derives from `InvalidOperationException`;
its `element` is the XML element at which the cycle was detected, and its message names it. The
guards are in `src/engine/cycles.ts` and at the places listed there. The oracle checks both
directions: for the `cyclic-*` documents of the read package it records every single call that
overflows the stack or does not return within 5 s (`!stackoverflow`, `!hang`), and the port must
throw `CyclicReferenceException` for exactly these calls and give the original's result for all
others (`test/engine/reads.oracle.test.ts`); the path, partial path and self copy cases are in
`test/noreturn/cases.json` (`test/engine/noreturn.oracle.test.ts`).

## Limitations

### Resolution of "now"

`DateTime.Now` in .NET has a resolution of 100 ns, and values written from it (for example the
LastWritingDateTime of a new document) carry up to seven fractional digits. The JS clock
(`Date.now()`) has millisecond resolution, so the port writes at most three. Only values taken
from the current time are affected; parsed and computed dates keep their full precision.

### Reference inequality of boxed strings

`SetAttributeValueCmd.Execute` compares old and new value with `object != object`, which is a
reference comparison in C#. JS compares strings by value. The port treats the values as
different unless both are null or both are the same fallback `""`. This only affects whether
change events fire and undo commands are recorded when a value is set to an equal string.

### Threading

The original has race conditions under parallel writes ("Collection was modified"). JS is
single threaded; none of that applies.

## System layer (src/system)

The .NET value types and conversions are checked case by case against .NET 8 by
`test/system/sys.oracle.test.ts` (cases: `scripts/gen-sys-cases.mjs`, oracle:
`oracle/SysOracle.cs`). The known deviations are listed there per area (`deviations`,
`deviationRules` in `test/system/eval/*.ts`); this is the summary.

### Local time before 1996 (time zone history)

Local time conversions (`ToLocalTime`, `ToUniversalTime`, the offset in "o"/"K"/"z" formats,
`XmlConvert` with `XmlDateTimeSerializationMode.Local`, parsing of values with a zone) use the
host time zone through JS `Date`, i.e. the IANA database with its full history. .NET on Windows
uses the registry rules of the zone, which apply today's rule to every year. For Europe/Berlin
the two agree from 1996 on and differ before: no DST before 1980 and DST ending in September
until 1995 in IANA; local mean time (+00:53:28, which JS reports truncated to whole minutes as
+00:53) before April 1893. .NET on Linux uses IANA data as well and would agree with the port.
Affected oracle cases: 128 (datetime 77, dtparse 23, xmlconvert 28); for dates from 1996 on
every case matches.

### Signalling NaN floats

A float32 signalling NaN (e.g. bits `7f800001`) cannot be held in a JS number: the conversion to
double sets the quiet bit. The text is still "NaN", only the bit pattern differs (3 cases).

### Test transport only

Lone UTF-16 surrogates cannot travel to the oracle in JSON input, so no case passes one as an
argument (the UTF-8 encoder is fed code units in hex instead); in outputs the oracle's JSON
writer replaces them by U+FFFD, and the test does the same with the TS output before comparing.
Results of time-only or year-less inputs are compared relative to today / the current year.

### Not ported (by design of the System layer)

- Culture data other than the invariant culture: DateTime / number parsing and formatting follow
  `CultureInfo.InvariantCulture`, which the oracle and the engine use as current culture.
- `DateTimeParse`: ParseExact, DateTimeOffset, calendars other than Gregorian, culture-specific
  tokens; the ICU case-insensitive comparison of tokens is emulated with a lower-case comparison.
- `Uri`: base/relative combination, `MakeRelativeUri`, `IsBaseOf`, `IdnHost` / `DnsSafeHost`
  (punycode), custom parsers; Unicode data (normalization, letters, casing) comes from the JS
  engine.
- Number formatting: custom numeric format strings ("0.##") throw `NotSupportedException`.
