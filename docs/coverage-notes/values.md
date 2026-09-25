# Coverage notes: values

Typed attribute values and attribute value handling, compared case by case with the original
Aml.Engine 4.5.2.

- Oracle: `oracle/ValuesOracle.cs` (command `values <cases.json> <corpusDir> <out.json>`;
  `values --dtfi <culture>` prints the DateTimeFormatInfo data DateTime.Parse uses)
- JS runner: `test/engine/values.oracle.test.ts`
- Cases: `scripts/gen-values.mjs` (seeded) -> `test/values/cases.json` (binary in `.gitattributes`)
- Oracle output: `test/oracle-out/values.json` (appended to `scripts/oracle.sh`)
- Debugging: `VALUES_KIND=raw,set` runs only these kinds, `VALUES_DUMP=<file>` appends every
  differing result as a JSON line.

## Method

Every case builds a fresh document (CAEX 2.15 or 3.0, chosen per case) with the attribute under
test as an Attribute of an InternalElement, a nested Attribute, or (3.0) an AttributeType of an
AttributeTypeLib, and records a list of strings; both runners produce the same list, compared
exactly. Values are written with their CLR type: `Ty` = CLR type name + invariant `ToString`
(DateTime `o`, TimeSpan `c`, Uri original|ToString|IsAbsoluteUri); on the JS side the type is the
one `CaexValue` keeps internally (`decodeTyped`), so an `xs:int` 5 and an `xs:double` 5 differ.
Plain JS results (public getters, `DefaultDecodedValue`) are compared by JS category (`Lo`: every
primitive number as double `R`, long/ulong, decimal, ...). CLR inputs are passed with the same
CLR type on both sides (`ClrValue.ushort(...)`, `ClrValue.float(...)`, bigint, Decimal, ...).
Exceptions are compared by type name, with message where the engine returns or builds it
(encoders, `IsValidStringValue`, constraint errors); NullReferenceException by name only.

"Now" canonicalization (the only one): times of day inside the execution window of a case become
NOW, and CompareTo/Equals/GetHashCode of two values that are both a `DateTime.Now` default of a
failed decoding are recorded as `now` (their order depends on the clock resolution). Dates of
"now" are not canonicalized: oracle output and test must be produced on the same day (as for
`ops.oracle.test.ts`). Documents are unloaded after each case in both runners (the document
table otherwise grows and makes the JS side quadratic).

## Covered (17,841 cases, 590,976 compared strings)

| Kind | Cases | What |
|---|---|---|
| raw | 8,421 | 54 data types (all 43 XsdDataTypes, absent, "", " ", unknown, wrong case, trailing space, xsd: prefix, IDREFS/NMTOKENS/ENTITIES/anySimpleType without type code) x ~175 raw strings (valid/invalid numbers of every width and overflow, white space, empty, null, dates/times/durations of all XSD shapes, German and invariant date forms, URIs, QNames, names, encoded names, base64, hex, special symbols) plus random DefaultValue: `AttributeDataType`, `Value`, `DefaultValue`, `AttributeValue`, `DefaultAttributeValue`, indexer (Value, DefaultValue, unknown name), `GetCaexValue`, `ValueAttributes`, `AttributeTypeDefiningAttribute`; CaexValue `TypeCodeOfAttribute`, `TypeAttribute`, `FriendlyValueString`, `IsBinaryValue`/`IsDateTimeType`/`IsNumericOrBooleanValue`/`IsNumericValue`/`IsPartOfDateValue`/`IsStringValue`, `IsValidStringValue`, `DefaultValue`, `ValueElement`, `Equals`, `CompareTo` (CaexValue, null, other object); `GetDouble`, `TryGetDouble`, `GetDateTime`/`TryGetDateTime` in all four modes (XmlConvert, then the de-DE fallback, then invariant); `AttributeTypeTypeExtensions.TypeCodeOfAttribute`/`IsPartOfDateValue`/`IsNumericDataType`/`IsBooleanDataType`/`IsStringDataType`/`IsDateTimeType`; `CaexValue.TypeCode`, `XmlTypeCodeFromSchemaType`, `XmlTypeToClrType`; the XML of the attribute afterwards |
| set | 6,280 | every data type x 91 CLR values (null, string, bool, sbyte, byte, short, ushort, int, uint, long, ulong, float, double, decimal, DateTime of all kinds, TimeSpan, Uri, byte[], string[], Guid) through `AttributeValue`, `DefaultAttributeValue`, indexer (Value, DefaultValue, unknown name), `CaexValue.Value`; without data type every value through every target (automatic `SetAttributeDataType`); 400 random sequences; data type, raw strings, typed read back and XML after each step |
| cmp | 2,500 | `CaexValue.CompareTo`/`Equals` both ways and `GetHashCode` consistency for pairs of 30 data types x 34 raw values |
| static | 1 | `ClrToXmlType` for 22 CLR types and null, `XmlTypeToClrType`/`XmlTypeCodeFromSchemaType`/`CaexValue.TypeCode` for all data type strings, `XmlTypeCodeExtensions.AttributeType`/`DefaultDecodedValue`/`DefaultEncodedValue`/`Default` for all 55 XmlTypeCodes, `AttributeTypeType.XsdDataTypes` (order included) |
| enc | 6 | `Encode`/`IsValid` (result and message) of TokenEncoder, NameEncoder, NCNameEncoder, NMTokenEncoder, NormalizedStringEncoder, LocalNameEncoder for 40 strings (reflection in C#, the classes are internal) |
| setdbl, setdt | 40 | `SetDouble` (specials, extremes), `SetDateTime` in all modes with all kinds, read back by every getter |
| sadt | 119 | `SetAttributeDataType(Type)` for 21 types, `SetAttributeDataType(object)` for every CLR value incl. null |
| props | 200 | random sequences on `Unit`, `RefAttributeType`, `AttributeDataType`, `Value`, `DefaultValue` (null, "", equal values) with the `PropertyChanged` events and the XML |
| cons | 150 | `Constraint` (AttributeValueRequirementType): `Name`, `New_NominalType`/`New_OrdinalType`/`New_UnknownType` and the second-child errors, `Exists`; NominalScaledType `RequiredValue`, `ValueAttributes`, indexer get/set with typed values, `GetCaexValue`, `AttributeDataType`, `AttributeTypeDefiningAttribute`; OrdinalScaledType `RequiredValue`/`RequiredMinValue`/`RequiredMaxValue`, `ValueAttributes`, indexer get/set; UnknownType `Requirements` |
| sem | 60 | `RefSemantic`, `CorrespondingAttributePath`, `New_RefSemantic`, `New_AMLID`, `HasAMLID` (null/empty arguments, null owner) |
| cmpr | 1 | `AttributeValueComparer.Equals`/`GetHashCode` (internal, by reflection) with missing, empty and differing attributes and null elements |
| corpus | 63 | every Attribute/AttributeType of every corpus file: raw values, typed values, `FriendlyValueString`, `IsOverridden` (property and extension), `IsOverriddenDeleted`, type code, `GetDouble`, `GetDateTime`, RefSemantic, Constraints with nominal/ordinal/unknown values |

## Bugs found and fixed

- `src/engine/caex/extensions/TokenEncoder.ts`: the white space class of `csTrim` was built from a
  plain string, so `\p{Z}` became the characters `p{Z}`; spaces were not trimmed and `p`, `{`, `Z`,
  `}` were (affected xs:token/QName/Name/NCName/NMTOKEN encoding and validation).
- `src/system/XmlConvert.ts` (`invalidNameChar`): messages of VerifyName/NCName/NMTOKEN now follow
  `XmlException.BuildCharExceptionArgs` (a surrogate pair is one character with its code point,
  NUL is shown as `.`), and VerifyNMTOKEN reports the offending position with "cannot be included"
  like .NET instead of a shifted index (gave `''` and `0xNAN`).
- `src/system/linq.ts` (`ordinalCompare`, used by `CaexValue.CompareTo` for non comparable values):
  reproduces `string.CompareOrdinal` of .NET, which compares the first characters, then two
  characters at a time including the zero terminator of an odd-length string ("2" vs "2024-02-29"
  is -48, not -9).
- `src/engine/caex/extensions/CaexValue.ts` (`compareTyped`): `CompareTo` of sbyte, byte, short and
  ushort returns the difference of the values, not -1/0/1.
- `src/system/DateTimeParse.ts` + `src/engine/caex/AttributeTypeType.ts`: the de-DE fallback of
  `GetDateTime`/`TryGetDateTime` was a regular expression for a few numeric forms ("1.5", "1,5",
  month names and weekday names failed or gave other dates). The ported .NET DateTime parser now
  takes the culture data (`CultureDateData`); `dateTimeTryParseGerman` runs it with the de-DE data
  of .NET 8 on Windows (dumped with `oracle values --dtfi de-DE`: separators, empty AM/PM,
  patterns, month/genitive/day/era names). The invariant culture is unchanged.

## Deviations that remain

- Local time before 1996 (docs/deviations.md): `xs:gMonthDay` decodes to a local DateTime in the
  year 1904, whose UTC offset differs on DST dates (.NET on Windows applies today's rule). The test
  accepts exactly this difference (only the offset text of a local time before 1996) and reports
  the count (88 results).
- The C# runner runs under the invariant culture, so the `CurrentCulture` fallbacks of
  `GetDouble`/`GetDateTime` are the invariant culture in both; the de-DE fallback is covered.
- Time of day: oracle output and test must be produced on the same day (dates of "now").

## Not covered

- Structural members of AttributeTypeType and AttributeValueRequirementType (`Insert`, `Import`,
  `InsertAfter`, `InsertBefore`, `Container`, `CAEXSequence`, `Attribute`,
  `AttributeAndDescendants`, `IsInherited(owner)`) and the implicit conversion to
  ObjectWithAMLAttributes: left to the mutations/reads/amlobjects packages.
- `AttributeTypeTypeExtensions.IsMaster` (QueryService).
- Internal members not reachable through the public API: the CaexValue constructors,
  `SetDefaultValue`, `GetDecodedValue(string, parseOnly: true)` (no caller in the engine).
- `ClrType.from` with JS constructors (JS-only convenience, no C# counterpart).
