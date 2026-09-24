# Port notes: XSD validation (CAEXDocument.Validate)

`CAEXDocument.Validate(out string[] violationLog)` calls `XmlSchemaManager.Validate(XDocument, out
string[] messages)`, which saves the document (`XDocument.Save(stream)`, SaveOptions.None: indented,
CRLF, encoding from the declaration) and reads the text back through
`XmlReader.Create(stream, settings)` with `ValidationType.Schema`, the manager's `SchemaSet`,
`IgnoreWhitespace`, `IgnoreComments`, `IgnoreProcessingInstructions`, collecting
`$"Line {e.Exception.LineNumber}:\t {e.Message}"` per validation error. System.Xml.Schema is not
part of the engine, so this is a port of the parts of `XmlSchemaValidator` / `XsdValidatingReader`
/ `XmlTextReaderImpl` the two CAEX schemas can reach, not of Aml.Engine code.

## Files

`src/engine/schema/validation/`

| File | Ports |
|---|---|
| `index.ts` | entry points `validateXDocument`, `validateText`, `compiledSchema` |
| `XmlSchemaValidator.ts` | `XmlSchemaValidator` (+ the `XsdValidatingReader` event loop, `PrintExpectedElements`, `ElementValidationError`, `CompleteValidationError`, `XmlSchemaType.IsDerivedFrom`) |
| `XsdCompiler.ts` | the result of `XmlSchemaSet.Compile` for the CAEX XSDs: `SchemaElementDecl`, `SchemaAttDef`, complex types, `SchemaInfo` (element decls, type decls, target namespaces, attribute decls) |
| `ContentModel.ts` | `ParticleContentValidator` + `DfaContentValidator` (Glushkov positions, followpos, symbol order, expected particles) |
| `Datatypes.ts` | the simple types used (string, dateTime, ChangeMode enumeration, anonymous restrictions) and the built-ins an `xsi:type` or `xml:*` attribute can bring in (boolean, QName, language, anyURI, NCName, ...), `XmlComplianceUtil` whitespace normalization, `XsdDateTime.Parser`, `XmlQualifiedName.Parse` messages |
| `XmlLineReader.ts` | the node stream and line numbers `XmlTextReaderImpl` reports for the saved text |

The schemas are compiled from the embedded XSD text in `src/engine/schema/data/xsd.ts` (identical to
the engine's manifest resources and to `docs/CAEX_ClassModel_V*.xsd`).

## API (for batch 2, `XmlSchemaManager.validate`)

```ts
import { validateXDocument } from './validation/index.js';

// XmlSchemaManager.Validate(XDocument source, out string[] messages)
validate(source: XDocument): { result: boolean; messages: string[] } {
  return validateXDocument(source, this.namespace === XNamespace.None ? '2.15' : '3.0');
}
```

`validateXDocument(doc, '3.0' | '2.15')` returns `{ result, messages }` exactly as the C# method
(`result` = no error event; `messages` in .NET order with the `Line N:\t ` prefix).
`CAEXDocument.validate()` maps it to `{ result, violationLog: messages }`. The schema version is
the one of the document's schema manager (CAEXDocument: `SchemaVersion == "2.15"` gives 2.15,
everything else 3.0), not derived from the document content: a 3.0 manager validating a document
whose root is not in the CAEX namespace finds no schema for the root and reports nothing (as .NET).

Like .NET, only schema errors are collected; a failure of the reader itself escapes: a document
with a DOCTYPE throws `XmlException` ("For security reasons DTD is prohibited ...", the reader
settings keep `DtdProcessing.Prohibit`). Warnings (lax/skip content, unknown elements when the
root has no schema) are not reported, because `ReportValidationWarnings` is not set.

## Behaviour reproduced

- Order of events per element: invalid child in the parent's content model, element not declared /
  xsi:type / xsi:nil problems, attributes in document order (undeclared, datatype, fixed value,
  bad xsi:* attribute), missing required attributes in `AttributeUses` order (the type's own
  attributes first, then the base type's, recursively), then (for `<x/>`) the end-element checks:
  text value against its datatype, incomplete content.
- After an invalid child, the rest of the parent is not validated (`NeedValidateChildren = false`,
  process contents `Skip` for the following siblings and their subtrees), as in .NET.
- Expected element lists: the particles with a DFA transition in symbol order (the order in which
  element names first occur in the extended content model), printed with `PrintNamesWithNS`.
- Line numbers: element line for element/attribute/required-attribute/empty-element messages
  (all attributes are on the start tag line in the saved text), the start of the text node for
  text in element-only content, the end tag line for end-element messages.
- `xs:anyType` content (3.0 `AdditionalInformation`, 2.15 `AdditionalInformation`, `Value`,
  `DefaultValue`, `RequiredValue`, ...): lax, so child elements are validated only if they match a
  global declaration (`CAEXFile`).
- xsi:type: resolved with the element's namespace scope; named schema types and built-ins,
  derivation check (`IsDerivedFrom`), the QName parse messages.
- xml:lang / xml:space / xml:base are validated against the built-in xml namespace schema. .NET
  adds that schema to the manager's shared `XmlSchemaSet` the first time such an attribute is seen
  (`AddXmlNamespaceSchema`); afterwards xml:* attributes are also validated on lax (anyType)
  elements. The port keeps the same state per compiled schema (module level), so results depend on
  earlier validations in the same process exactly as in .NET.
- The CAEX XSDs declare no `xs:ID`/`xs:IDREF` types and no identity constraints, so there are no
  duplicate-ID or key messages; `SchemaVersion` is `fixed`, which gives "does not equal its fixed
  value".

## Not supported (not reachable with the CAEX schemas)

Range occurrence constraints (`RangeContentValidator`), content models without UPA enforcement
(`NfaContentValidator`), `xs:all`, identity constraints, IDs, nillable elements, substitution
groups, abstract types, namespace-list wildcards other than `##any`. The compiler throws if the XSD
uses them. `xsi:type` with a built-in type other than anyType, anySimpleType, string,
normalizedString, token, language, Name, NCName, NMTOKEN, anyURI, dateTime, boolean and QName is
reported as not found (.NET would accept e.g. `xs:int`).

## Verification

`oracle/ValidateOracle.cs` (`oracle validate <outDir> <files|dirs>`) loads each file with
`CAEXDocument.LoadFromString(File.ReadAllText(file, UTF8))`, records the schema, the SHA-256 of
`XDocument.Save` (the text the validator reads), `Validate`'s result and messages, or the exception.
`scripts/gen-invalid-caex.mjs` derives mutated documents from `test/corpus/*.aml` (seeded:
removed/added/undeclared attributes, renamed/moved/duplicated/swapped/removed elements, wrong
namespaces, text/CDATA/comments/PIs/significant whitespace, broken enumeration and dateTime values,
xsi:type/xsi:nil, xml:* attributes, nested CAEXFile in anyType content, DOCTYPE, encodings, ...).
`test/validation/validation.oracle.test.ts` compares every document (corpus + generated) with the
oracle, in the oracle's order. Deviations are listed at the top of that test file.
