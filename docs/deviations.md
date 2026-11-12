# Deviations from Aml.Engine

Where AmlEngine.js behaves differently from Aml.Engine 4.5.2 and Aml.Engine.Services 4.3.1 on
purpose, or cannot behave the same. Everything not listed here is meant to be identical and is
checked against the oracle.

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

### Optional corrections of data errors

Off by default. Ten data errors of the original can be corrected per document, per container or
for all documents (`doc.fixes`, `Fixes.default`); see docs/fixes.md. With the corrections off the
port behaves like the original; with a correction on it deviates at exactly that place, and the
oracle checks that the original reads what the corrected port writes. `CAEXDocument.fixes` and
`AutomationMLContainer.fixes` are members the original does not have.

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
| LookupService (Aml.Engine.Services): an element that is already in the tables is inserted again, for example moved with `InsertBefore` (the chain of nodes with the same ID or name then contains itself) | stack overflow in `CAEXNode.LastAmbiguousNode` from the change handler, and in the other walkers of that chain | `CyclicReferenceException`; the service keeps following later changes (an exception of any other kind leaves it paused, as in the original) |
| LookupService: `AllClassReferencesDeep` on base class references in a cycle | stack overflow | `CyclicReferenceException` |
| ExternalReferenceResolver (Aml.Engine.Services): a redirection of an absolute address to itself | endless loop | `InvalidOperationException` |

`CyclicReferenceException` (exported from the package) derives from `InvalidOperationException`;
its `element` is the XML element at which the cycle was detected, and its message names it. The
guards are in `src/engine/cycles.ts` and at the places listed there. The oracle checks both
directions: for the `cyclic-*` documents of the read package it records every single call that
overflows the stack or does not return within 5 s (`!stackoverflow`, `!hang`), and the port must
throw `CyclicReferenceException` for exactly these calls and give the original's result for all
others (`test/engine/reads.oracle.test.ts`); the path, partial path and self copy cases are in
`test/noreturn/cases.json` (`test/engine/noreturn.oracle.test.ts`). For the LookupService the
lookup oracle records the same for every call of its scripts (`test/services/lookup.oracle.test.ts`,
335 calls in 37 scripts), and the mutation scripts run with the service registered record the step
at which the original's process ended (`scripts/services-check.mjs`).

## Limitations

### Resolution of "now"

`DateTime.Now` in .NET has a resolution of 100 ns, and values written from it (for example the
LastWritingDateTime of a new document) carry up to seven fractional digits. The JS clock
(`Date.now()`) has millisecond resolution, so the port writes at most three. Only values taken
from the current time are affected; parsed and computed dates keep their full precision.

### Reference inequality of boxed strings

`SetAttributeValueCmd.Execute` compares old and new value with `object != object`, which is a
reference comparison in C#. JS compares strings by value. The port treats the values as
different unless both are null or both are the same fallback `""`. This affects whether change
events fire and undo commands are recorded when a value is set to an equal string. With the
LookupService registered, that extra change can also reach a reference list the operation is
walking, which then throws where the original returns: 2 of the 816 mutation scripts run with the
service registered (`SERVICE_DEVIATIONS` in `test/engine/mutations.oracle.test.ts`).

### Very deep documents

Parsing and writing work without recursion, as in .NET, so the nesting depth is not limited by
the call stack (tested with 20,000 levels; the XML oracle compares a 3,000 level document). Two
XLinq operations are recursive in .NET as well: copying an element (`new XElement(other)`, also
used when importing or instantiating) and `XNode.DeepEquals`. In .NET they end the process with a
stack overflow at a depth of some thousand levels; in the port they throw a `RangeError` at a
depth of some thousand levels as well (in Node between about 2,000 and 10,000, depending on
whether the code is already optimized). An indented save of such
a document grows with the square of the depth, in .NET as well (each level is indented one step
further); `Validate` saves indented to report line numbers.

### Threading

The original has race conditions under parallel writes ("Collection was modified"). JS is
single threaded; none of that applies.

### Current culture

The port behaves as Aml.Engine under the invariant culture, which the oracle runs with. In a .NET
program with another current culture (for example on a German Windows) the original differs where
it converts values without naming a culture. `node scripts/culture-check.mjs de-DE` runs the
oracle packages with that culture (`ORACLE_CULTURE`, oracle/Program.cs) and compares them with
the port. With de-DE (2026-11-09):

- Reading and saving documents do not depend on the culture: the read API on the 63 corpus
  documents, the mutation scripts, the AutomationML objects and the infrastructure cases give the
  same results.
- Writing a number or a date as a .NET value (`AttributeValue`, `DefaultAttributeValue`, the
  indexer `a["Value"]`, `CaexValue.Value`) into an attribute without a numeric or date data type
  (none, `xs:string` and the other string types, misspelled types such as `xsd:double`) writes the
  text of that culture: `1,5`, `-∞`, `29.02.2024 13:45:30` instead of `1.5`, `-Infinity`,
  `02/29/2024 13:45:30`. 13 of the 150 engine operation scripts save another document because of
  this.
- Writing a string through the same setters into an attribute with a numeric or date data type
  converts it with that culture: `"1.5"` becomes `15` in `xs:double`, `xs:float`, `xs:decimal` and
  the integer types (the dot is the group separator), `"31.12.2024"` becomes `31122024`, and
  `"1.5"` becomes 1 May instead of 5 January in `xs:date` and `xs:dateTime`. Writing a number into
  an `xs:double` attribute does not depend on the culture.
- `CaexValue.FriendlyValueString` formats with that culture (`1,5`, `November 2026` instead of
  `2026 November`).
- The System layer: parsing and formatting of numbers, dates and time spans without a culture
  argument (`double.Parse(s)`, `DateTime.ToString()`), and `ToString` of boxed numbers
  (`ClrValue`).

Of the typed value cases 1,545 of 18,106 differ; of their writes, 610 of 7,068 give another text.

### Browsers

`npm run test:browser` runs a scenario and every case of the System and infrastructure oracle
packages (test/system, test/gapsinfra) in headless Edge, Chromium, Firefox and WebKit and compares
each result with Node. Edge and Chromium give the same results as Node. Firefox and WebKit differ
in two known points, which the check counts per reason:

- The sign of NaN. .NET's NaN has the sign bit set (bits `fff8000000000000`); SpiderMonkey and
  JavaScriptCore store every NaN as the positive one. The value is NaN either way and formats as
  "NaN"; only the bit dumps of the test cases show it (Firefox and WebKit, 43 cases).
- Local mean time before 1893: Firefox reports it with seconds (+00:53:28), V8 truncated to whole
  minutes. Both are within "Local time of old dates" below (Firefox, 63 cases).

A browser has no file system and no working directory. Methods that read or write files throw
`NotSupportedException` there (README), and checks for the existence of a file find none. A relative
file path that Node resolves against the working directory stays as written: the ValidatorService
reports "file not found: lib.aml" in the browser where Node reports the full path. The scenario of
the check removes that directory part before it compares.

## Services (Aml.Engine.Services, Aml.Engine.Resources)

The services are compared with Aml.Engine.Services 4.3.1 and Aml.Engine.Resources 4.2.1 by the
tests in `test/services` (one oracle command per area, notes in `docs/coverage-notes/services-*.md`).
Everything not listed here gave the original's results.

### Synchronous calls that need the network

The synchronous methods of `ExternalReferenceResolver` (LoadOrGetReferencedDocument,
ResolveExternalDocument, CanResolve) and the engine members that call them
(`ExternalReference.ExternalDocument`, FindByPath and FindByID with an alias, base classes from
external documents) block in the original on the request of an http(s) or GitHub address.
JavaScript cannot wait for a request synchronously, so the port sends no request. CanResolve
gives false and leaves the message of the resolver unchanged, as the original does when the request
fails (GetResponseFromWebServerAsync catches every error and gives no response).
LoadOrGetReferencedDocument and ResolveExternalDocument give no document; where the original would
report the failed request, the port's message is "Error sending the request for {uri}" followed by
"Synchronous access to '{uri}' needs the network; use the asynchronous methods." (the original gives
"{status}: no response for {uri}" or ": no response for {uri}"). Unlike a failed request, this
failure does not mark the address as unresolved: load such documents with the asynchronous methods
first (LoadOrGetReferencedDocumentAsync, ResolveExternalDocumentAsync); the synchronous methods and
the engine then find them in the resolver. A synchronous call while an asynchronous one holds the
lock of the resolver runs at once (the original waits). FTP is not supported. The requests use
fetch: no timeout, at most 20 redirects (HttpClient 50), a 407 answer is a network error, `'` in the
query is escaped; in browsers CORS applies.

### ValidatorService: references over the network

`ValidatorService` (Aml.Engine.Services) checks whether the paths of external references and the
file URIs of external data connectors can be located. For an absolute http or https URL the
original sends the request synchronously (it blocks on
`ExternalReferenceResolver.GetResponseFromWebServerAsync(uri).Result`) and treats a failure as
"not found". JavaScript cannot wait for a request synchronously, so the port always takes that
failure path: such a reference is reported as "can't resolve path reference …  to an existing
file", also when the server would answer (the oracle of test/services/validator.oracle.test.ts
makes every request of the original fail, and then both give the same results). For an ftp URL the
original sends an `FtpWebRequest` without a catch block, and its `WebException` ends the
enumeration of the validation results; the port throws `NotSupportedException` there. With an
AutomationML container neither sends a request: the reference, prefixed with "/", is looked up as a
container part ("part not found in AML Container: /http%3A//…"). The branch after that lookup
("reference should be a container part") needs a reference that is no relative URI with the
prefix; none of the tested references is one, so the port's request-free variant of that branch is
not compared. Without a file system (browser) `File.Exists` is false, so local file references are
reported as not found.

### AMLEditionTransformer: synchronous transformation

`AMLEditionTransformer.TransformToEdition` is synchronous and blocks twice on the library service:
`LoadLibraryCatalogAsync(...).Result`, to replace external references by documents of the new
edition, and `LoadClassRepositoryAsync(...).Result`, to assign attribute types to the attributes
of classes. The port's `transformToEdition` behaves exactly like the original as long as no load is
needed (a document that is not CAEX 2.15; no external references or no library catalog in the
server profile; no attributes in class libraries or no class catalog in the server profile). Where
the original would load, it throws `NotSupportedException` and points to `transformToEditionAsync`;
the document passed in is unchanged, the messages up to that point have been logged, and the schema
transformer started for the call is unregistered again. `transformToEditionAsync` (not in the
original) runs the same steps and awaits both loads; a load that fails is thrown as its own error,
where `.Result` wraps it in an `AggregateException`. The test compares `transformToEditionAsync`
with the original's `TransformToEdition` in every scenario and the synchronous method wherever no
load is needed.

### Smaller differences

- UniqueNameService: PLINQ collects the exceptions of all partitions that fail; with several
  overflowing name numbers the original's `AggregateException` can hold more than one, depending on
  scheduling. The port wraps the first one.
- Document lifetime: the service dictionaries hold their documents as in C#, but because the
  engine's document table holds wrappers weakly by their XDocument ("Document table: weak
  references only"), a document dropped without `Unload` stays in a service dictionary until
  `Unload`, where .NET could report it as collected.
- Aml.Engine.Resources: `ReadAutomationMLLibraryInformation` leaves its file open in C# (a later
  `Save` to the same path fails); the port reads the file completely. `PublicLibraryCatalog.deserialize`
  (a port helper standing for `JsonSerializer.Deserialize`) names a null argument "json" for byte
  input too. `EnumDescriptionTypeConverter` takes every number as a value of its enum; `Enum[]`,
  `InstanceDescriptor` and the other members of `EnumConverter` are not ported. `ClassRepositoryItem`
  has no `with`.
- Paths: the expected outputs come from .NET on Windows; split, merge and file references are not
  compared with .NET on Linux.

## System layer (src/system)

The .NET value types and conversions are checked case by case against .NET 8 by
`test/system/sys.oracle.test.ts` (cases: `scripts/gen-sys-cases.mjs`, oracle:
`oracle/SysOracle.cs`). The known deviations are listed there per area (`deviations`,
`deviationRules` in `test/system/eval/*.ts`); this is the summary.

### Local time of old dates (time zone history)

Local time conversions (`ToLocalTime`, `ToUniversalTime`, the offset in "o"/"K"/"z" formats,
`XmlConvert` with `XmlDateTimeSerializationMode.Local`, parsing of values with a zone) use the
host time zone through JS `Date`, i.e. the IANA database with its full history. .NET on Windows
uses the registry rules of the zone, which cover recent years only and apply the oldest rule to
every year before. The two agree for recent dates and differ for old ones, depending on the zone:

| Zone | Agree from | Differences before | Oracle cases that differ |
|------|-----------|--------------------|--------------------------|
| Europe/Berlin (reference) | 1996 | no DST before 1980, DST ending in September until 1995, local mean time +00:53:28 before April 1893 | 128 |
| America/New_York | 1987 | Windows applies the rule of 1987 to 2006 to every earlier year, IANA has the older US rules and local mean time before 1883 | 73 |
| Asia/Kolkata | 1946 | local mean time and +06:30 (war time) until October 1945 | 93 |
| UTC | always | none | 0 |

V8 (Node, Chromium, Edge) reports local mean time truncated to whole minutes (+00:53), Firefox
with seconds (+00:53:28). `scripts/tz-check.mjs` runs the oracle with another local time zone
(`ORACLE_TZ`, oracle/LocalTimeZone.cs; the machine keeps its own) and the JS tests with `TZ` set
to the same zone: every oracle package whose results depend on local time (sys, gapsinfra,
values, engineops, mutations, gapscaex, amlobjects; 1,291 tests) matches in UTC, New York and
Kolkata apart from the dates in the table.

### Aml.Engine on Linux

The reference is Aml.Engine under .NET 8 on Windows. Under .NET on Linux (checked with the
oracle in the Docker image mcr.microsoft.com/dotnet/sdk:8.0, Debian 12) the original behaves
differently in three points: it writes LF line ends when saving (see "Line ends"), it keeps
backslashes in the path of `file:` URIs (Windows turns them into slashes; 45 System cases), and
it takes local time from the IANA database. The port reproduces the Windows behaviour in the first
two points. In the third, .NET on Linux and the port agree for Europe/Berlin from April 1893 on
(the DST history in the table above); for the local mean time before, .NET rounds the offset
+00:53:28 to +00:54 and V8 cuts it to +00:53.

### Case mapping and white space

.NET maps case one code point to one code point with fixed tables. JS `toUpperCase` and
`toLowerCase` apply the full mapping ('ß' to 'SS', final sigma) with the Unicode version of the
JS engine, which differs between Node and browser versions. The port uses tables taken from .NET
(`src/system/casing-data.ts`, generated by `scripts/gen-casing.mjs` from the gapsinfra oracle):
`char.ToUpperInvariant` and `ToLowerInvariant`, the same for strings, and the upper casing of
`OrdinalIgnoreCase`, supplementary code points included. .NET takes the invariant culture mapping
from the ICU of the operating system (here Windows 11), so .NET itself can differ between systems
for letters of recent Unicode versions (for example U+A7CD); the port follows the oracle system.
`OrdinalIgnoreCase` uses the Unicode data of .NET and is the same everywhere; its comparison
results (not only the sign) match .NET, surrogate pairs included. `Trim` and
`IsNullOrWhiteSpace` use `char.IsWhiteSpace`: U+0085 is white space, U+FEFF is not (the other way
round from JS `trim`).

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
  `CultureInfo.InvariantCulture`, which the oracle and the engine use as current culture (what
  differs under another culture: "Current culture" above).
- `DateTimeParse`: ParseExact, DateTimeOffset, calendars other than Gregorian, culture-specific
  tokens; the ICU case-insensitive comparison of tokens is emulated with a lower-case comparison.
- `Uri`: base/relative combination, `MakeRelativeUri`, `IsBaseOf`, `IdnHost` / `DnsSafeHost`
  (punycode), `GetComponents` with `NormalizedHost` or `SerializationInfoString`
  (NotSupportedException), custom parsers; Unicode data for normalization and letters comes from
  the JS engine.
- Number formatting: custom numeric format strings ("0.##") throw `NotSupportedException`.
