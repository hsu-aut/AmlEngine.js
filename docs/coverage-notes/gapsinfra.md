# Coverage notes: gapsinfra

The .NET substitutes in `src/xml` (System.Xml.Linq, XmlReader/XmlWriter encodings) and
`src/system` (System.Linq, value types, strings, events, exceptions) that `docs/coverage.md` listed
as never executed, compared case by case with .NET 8 (the runtime of the oracle).

- Oracle: `oracle/GapsInfraOracle.cs` (command `gapsinfra <cases.json> <out.json>`)
- JS runner: `test/engine/gapsinfra.oracle.test.ts` (`GAPS_ALL=1` lists every mismatch)
- Cases: `scripts/gen-gapsinfra.mjs [out] [randomScripts=250] [seed=3682]` ->
  `test/gapsinfra/cases.json` (binary in `.gitattributes`)
- Oracle output: `test/oracle-out/gapsinfra.json` (appended to `scripts/oracle.sh`)

## Method

Each case is `{ area, fn, args }`; both sides return a string or an exception type name, compared
exactly. Nothing is canonicalized. Internal .NET members without a public counterpart are called
through reflection where the port implements them (`System.Xml.XmlCharType`,
`System.Xml.Schema.XsdDateTime`, `DateTime.IsAmbiguousDaylightSavingTime`,
`System.Globalization.OrdinalCasing`).

- **XLinq scripts** (`x.script`): a document (or `new XDocument()`) and a list of steps on targets
  addressed as document, root, i-th element, i-th node of `DescendantNodes()`, j-th attribute of
  element i, or a node saved in a register (to work on detached nodes). Every step records its
  result or exception, the final `ToString(DisableFormatting)` is compared too. Content arguments
  cover strings, null, nested arrays, new elements, attributes, XText, XCData, comments, PIs,
  document types, existing nodes of the same document (clone semantics), double, int, bool,
  decimal and a document. 14 curated documents (namespaces, prefixes, DTD with entity, PUBLIC /
  SYSTEM doctype, PI, CDATA, comments, `xml:lang`/`xml:space`), every read member on 20 targets
  each with and without PreserveWhitespace, namespace lookups for every prefix and namespace,
  curated mutation scripts (detached nodes, ReplaceWith variants, document content validation,
  attribute navigation, value setters with null, PI target and doctype name validation) and 250
  random scripts of 25 steps.
- **Parser / names**: `XDocument.Parse` of doctypes (quotes, missing ids), invalid characters and
  character references, 25 malformed and valid XML declarations; `XmlConvert.VerifyName` vs
  `isName`, `XmlConvert.IsWhitespaceChar` vs `isXmlWhitespace`, `XName.Get` of expanded names,
  every `XmlCharType` predicate over the whole BMP.
- **Encodings**: `XDocument.Load(XmlReader.Create(stream, {IgnoreComments=false,
  IgnoreWhitespace=true}), PreserveWhitespace)` (what `CAEXDocument.LoadFromStream` does) on 149
  byte streams: UTF-8 with/without BOM and declaration, UTF-16 LE/BE with/without BOM, UTF-32 /
  UCS-4 LE/BE with/without BOM, Latin-1 and ASCII, every .NET encoding alias in the declaration,
  declared vs actual mismatches, invalid byte sequences, lone surrogates, odd trailing bytes, code
  points above U+10FFFF, EBCDIC, truncated BOMs, all declaration variants. `XDocument.Save` with
  every declared encoding name (46 names incl. unknown, UTF-7, padded, wrong case), both
  formatting options, characters each encoding cannot represent in text, attributes, comments,
  PIs, CDATA and names; `Encoding.GetEncoding` web name and preamble.
- **System.Linq**: sources are logging iterators (`s0 s1 .. s$`, second source `o..`, `q` when the
  query is built and about to run), so deferred execution, the order of pulls and early
  termination are compared as well as results and exceptions. Operators: Where, Select, First,
  FirstOrDefault, Last, LastOrDefault, Single, SingleOrDefault (with and without predicate), Any,
  All, Count, ElementAt(OrDefault) (negative, in range, past end), DefaultIfEmpty, Contains with
  comparers, Sum, Max, Min (with int and string selectors; `double` with NaN and infinities;
  `int?` with nulls), Aggregate, SequenceEqual, Distinct, Except, Intersect, Union and ToHashSet
  (default comparer, `StringComparer.OrdinalIgnoreCase`, a modulo comparer; also with the source
  itself as second sequence for duplicate handling), Concat, Append, Prepend, Skip, Take,
  SkipWhile, TakeWhile, Reverse, OrderBy/OrderByDescending/ThenBy/ThenByDescending (stability,
  culture-sensitive default string comparison against `StringComparer.Ordinal`, null keys, NaN),
  GroupBy (group order, comparers), ToDictionary (duplicates, null key), Zip, Range, Repeat,
  Empty, foreach (port `forEach`), predicates that throw. Inputs: 7 int, 5 string (case variants,
  ß/ẞ/ss, dotless and dotted i, long s, micro sign, hyphen and underscore, accents), 6 double,
  5 `int?` sequences. `HashSet<int>`: 31 random Add/Remove/Contains/Clear sequences with the
  enumeration order.
- **System types**: `Guid.Equals` and hashing, `Guid.NewGuid` shape without `crypto.randomUUID`,
  `TimeSpan.CompareTo`/`Equals`, `TimeSpan.Parse` of the app compat form `d.h:m:.f`,
  `decimal` equality and hashing (scale, sign of zero), `Uri` equality and hashing (23 x 23),
  getters of relative URIs, local time ambiguity at DST changes, `XsdDateTime` with every flag
  combination incl. the XDR ones, `char.ToUpperInvariant` and `OrdinalIgnoreCase` over the BMP
  plus 841 string pairs, default exception messages, event subscription/clear/raise,
  `PropertyChangedEventArgs`.

## Covered (6,026 cases, 34,259 XLinq steps)

| Area | Cases | Functions |
|---|---|---|
| xlinq | 562 | 297 scripts, 92 parse, 20 isName, 133 isWs, 10 XName.Get, 10 XmlCharType tables |
| encoding | 649 | 149 load, 432 save with declared encoding, 14 save, 54 GetEncoding |
| linq | 2,893 | 42 operators, HashSet |
| system | 1,922 | Guid, TimeSpan, decimal, Uri, DateTime, XsdDateTime, strings, exceptions, events |

After this package the functions of `src/xml` and `src/system` executed by `test/xml`,
`test/system` and this test alone rise to 97.1 % (xml, statements 94.9 %) and 95.1 % (system,
statements 90.4 %); the full suite executes more (engine tests).

## Bugs found and fixed

| File | Fix |
|---|---|
| `src/system/linq.ts` | `HashSet` enumerated removed-then-added items at the end; .NET reuses the most recently freed slot (free list), so order after `Remove` differed. Slots with a free list now; `new HashSet(hashSet)` copies them. |
| `src/system/linq.ts` | `max`/`min` compared with `>`/`<` (ordinal for strings, nulls not skipped, `null < 1`); now Comparer&lt;T&gt;.Default (`defaultCompare`), nulls skipped (null when only nulls), `Max(double)` takes NaN only when all are NaN, `Min(double)` returns NaN at once and stops enumerating. |
| `src/system/linq.ts` | `defaultCompare` treated NaN as equal to every number (unstable OrderBy); now `double.CompareTo` (NaN smallest). |
| `src/system/linq.ts` | `toDictionary` accepted a null key; now ArgumentNullException. |
| `src/system/linq.ts` | `Enumerable.range`/`repeat` did not validate arguments; now ArgumentOutOfRangeException at the call (negative count, `start + count - 1 > int.MaxValue`). |
| `src/system/strings.ts` | `upperFirst` used the full case mapping (ß -> SS, ﬀ -> FF, ŉ -> ʼN, ı -> I); now `char.ToUpperInvariant` (simple mapping, Greek ypogegrammeni to title case, no mapping for U+0131 and for letters newer than .NET 8's Unicode data). |
| `src/system/strings.ts` | `equalsOrdinalIgnoreCase` treated ı/I/i and ſ/s/S as equal and compared whole strings; now code unit (surrogate pair) wise with OrdinalCasing (ToUpperInvariant without U+017F). |
| `src/system/Guid.ts` | No `equalityKey`, so equal GUIDs were distinct in HashSet/Distinct/Union; added. |
| `src/xml/encoding.ts` | `getEncoding` trimmed names and accepted `utf8` and `x-unicode20utf8` (.NET: ArgumentException), missed most aliases (`us`, `cp367`, `iso8859-1`, `cp819`, `x-unicode-2-0-utf-8`, ...), and UTF-7 names did not throw NotSupportedException; now the .NET 8 encoding table. |
| `src/xml/encoding.ts` | `decodeXml` rewritten after XmlTextReaderImpl (DetectEncoding, EatPreamble, CheckEncoding, SwitchEncoding): UTF-16 and UCS-4 without BOM for any first character (not only `<?`), UCS-4 2143/3412, EBCDIC error; the declared encoding takes over after the declaration even against a BOM (UTF-16 BOM + `encoding="utf-8"` fails, UTF-8 BOM + `iso-8859-1` reads Latin-1); unknown declared encodings (`utf8`, `windows-1252`) throw XmlException instead of reading UTF-8; ASCII turns bytes >= 0x80 into `?`; UTF-8 aliases and `ucs-4` decode with replacement; invalid UTF-8 throws XmlException (was a TypeError, i.e. NullReferenceException); an odd trailing UTF-16 byte is ignored; lone surrogates reach the parser; UCS-4 above U+10FFFF throws XmlException (was a RangeError). |
| `src/xml/XmlParser.ts` | The XML declaration accepted any order, unknown names, repeated attributes and missing white space between attributes; now the ParseXmlDeclaration state machine (version, encoding, standalone). |
| `src/xml/XmlWriter.ts` | DOCTYPE with public/system id and internal subset wrote ` [` (.NET: no space), and without ids and subset `<!DOCTYPE r>` (.NET: `<!DOCTYPE r >`). |
| `src/xml/XmlWriter.ts` | `xml:space`/`xml:lang` pushed a namespace entry, which shifted generated prefixes (`p2` instead of `p1`); now written as special attributes like XmlWellFormedWriter, `xml:space` must trim to `default`/`preserve` (ArgumentException), a prefix redefined on the same element gets a generated prefix. |
| `src/xml/XName.ts` | `XName.get` of an invalid expanded name (`{}a`, `{urn:x}`, `{a`) threw XmlException; .NET throws ArgumentException. |
| `src/xml/XNode.ts` | `XDocument.add(XAttribute)` was silently ignored; .NET throws ArgumentException (XDocument.AddAttributeSkipNotify). |
| `src/xml/XNode.ts` | `XAttribute` did not validate namespace declarations (`xmlns:p=""`, prefixes bound to the xml/xmlns namespaces); now ValidateAttribute in the constructor and the Value setter. |
| `src/xml/XNode.ts` | `XComment` accepted a null value, `XProcessingInstruction` any target (also `xml`, empty, `a:b`) and null data, `XDocumentType` any name; now the .NET checks in constructors and setters. |

## Deviations that remain

- **`default(T)` of value types** (test: `knownDeviation`): `FirstOrDefault`, `LastOrDefault`,
  `SingleOrDefault`, `ElementAtOrDefault`, `DefaultIfEmpty()` return `null` where .NET returns
  `default(int)` = 0. The port's `Enumerable` has no element type at run time.
- **`Max`/`Min` of an empty sequence**: the port throws InvalidOperationException (value type
  behaviour); .NET returns null for reference and nullable types. Same cause.
- **`Sum` overflow**: .NET checks `int`/`long` overflow (OverflowException); the port adds JS
  numbers. Same cause (element type unknown). The engine uses neither `sum` nor `max`/`min` of
  `Enumerable`.
- **`GetStringValue` of other CLR objects**: .NET falls back to `object.ToString()` (an `object[]`
  gives `System.Object[]`); JS arrays are content lists, other objects use `String()`. Not
  reproducible, the case was removed.
- **Lone surrogates in case files**: System.Text.Json cannot read them into a .NET string, so such
  inputs are not passed as text; lone surrogates are covered through UTF-16 / UCS-4 byte input
  and character references.
- **Unicode version**: the casing exceptions are those of .NET 8 against the ICU data of the Node
  version used; a newer Node with more case mappings would show up in the `str.upperTable` /
  `str.oicTable` cases.

## Not reachable or not testable

| Function | Reason |
|---|---|
| `src/system/DateTimeParse.ts` `AtEnd` | Only used when date and time separators are equal; invariant (`/`, `:`) and de-DE (`.`, `:`) differ. |
| `src/system/DateTimeParse.ts` `trimWhiteSpace` | Only for date tokens starting or ending with white space; the invariant and de-DE tokens have none. |
| `src/system/DateTimeParse.ts` `GetDateOfNNDS` | Needs a year suffix token (CJK cultures); the port has invariant and de-DE only. |
| `src/system/Uri.ts` `UriParser.isSimple` | Internal UriParser property, not read anywhere in the port (no public counterpart). |
| `src/system/Uri.ts` DNS host branch without IRI parsing (anonymous at CheckAuthorityHelper) | Every parser of the port (built-in and unknown schemes) has AllowIriParsing, as in .NET; only custom UriParsers, which are not ported, take it. |
| `src/system/Uri.ts` `strongAuthority` in `getUriPartsFromUserString` | Only for `GetComponents(HostAndPort / StrongAuthority)`, which is not ported; `Authority` asks for `Host | Port`. |
| `src/xml/XNode.ts` `XObject.nodeType` | Base getter; XObject is abstract in .NET and every port subclass overrides it. |
| `src/xml/XNode.ts` `XContainer._addAttributeSkipNotify`, `XContainer._validateNode` | Base implementations; both containers (XElement, XDocument) override them. |
| `src/xml/XNode.ts` `XDocument._cloneNode` | A document never has a parent and cannot be added as content (ValidateNode throws first). |
| `src/xml/XNode.ts` `externalCode` | Only when change-event handlers modify the tree during an operation; XObject events are not supported. |
| `src/xml/XNode.ts` default `nodeToString` | Placeholder before `XmlWriter.ts` registers itself; the module index always loads the writer. |
| `src/xml/encoding.ts` `byteCount` of the single byte decodings | A single byte encoding is never the detected encoding, so SwitchEncoding never un-decodes through it. |
