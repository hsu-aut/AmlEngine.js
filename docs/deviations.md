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

## Limitations

### Reference inequality of boxed strings

`SetAttributeValueCmd.Execute` compares old and new value with `object != object`, which is a
reference comparison in C#. JS compares strings by value. The port treats the values as
different unless both are null or both are the same fallback `""`. This only affects whether
change events fire and undo commands are recorded when a value is set to an equal string.

### Threading

The original has race conditions under parallel writes ("Collection was modified"). JS is
single threaded; none of that applies.
