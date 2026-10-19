# Port notes: attributes and typed values

Files:

- `src/engine/caex/AttributeTypeType.ts`, `AttributeType.ts`, `AttributeFamilyType.ts`,
  `AttributeValueRequirementType.ts`, `AttributeValueComparer.ts`, `NominalScaledTypeType.ts`,
  `OrdinalScaledTypeType.ts`, `RefSemanticType.ts`
- `src/engine/caex/extensions/AttributeTypeTypeExtensions.ts`, `CaexValue.ts`, `TokenEncoder.ts`,
  `NameEncoder.ts`, `NCNameEncoder.ts`, `NMTokenEncoder.ts`, `LocalNameEncoder.ts`,
  `NormalizedStringEncoder.ts`
- `src/engine/caex/extensions/ClrValue.ts` (not a C# file, see "CLR values" below)
- `src/engine/resources/XsdDataTypes.ts`, `src/engine/schema/XmlTypeCodeExtensions.ts`

## CLR values in JS

Defined once in `src/engine/caex/extensions/ClrValue.ts` (module comment and TSDoc):

| CLR | JS |
|---|---|
| bool | boolean |
| double | number |
| float | number (formatted with `XmlConvert.toStringSingle` / float `ToString`) |
| int, short, sbyte, byte, ushort, uint | number |
| long, ulong | bigint |
| decimal | `Decimal` |
| DateTime, TimeSpan, Uri, Guid | the src/system classes |
| string | string |
| byte[], string[] | Uint8Array, string[] |

- **Values into the engine** (`attributeValue`, `defaultAttributeValue`, `setItem`,
  `CaexValue.value`, `setAttributeDataType(value)`): `ClrType.of(value)` is the C#
  `value.GetType()`. A plain number is `int` if it is an integer in the Int32 range and not -0,
  otherwise `double` (what a C# caller gets with a literal: `5` -> xs:int, `5.5` -> xs:double);
  a bigint is `long`. Every other CLR type is passed explicitly with
  `ClrValue.sbyte/byte/short/ushort/int/uint/long/ulong/float/double(...)`.
  Encoding is unaffected by the int/double ambiguity: where C# checks `value is X` and the JS
  value has another CLR type, C# falls back to `X.TryParse(value.ToString())`, and the port
  does the same with the invariant `ToString` of the JS value (`clrToString`), which is exact
  for integers.
- **Type arguments** (`ClrToXmlType(Type)`, `SetAttributeDataType(Type)`, results of
  `XmlTypeToClrType` and `XmlTypeCodeExtensions.AttributeType`) are `ClrType` objects
  (interned, compare with `===`). `ClrType.from` also accepts JS constructors for the natural
  types: String, Boolean, Number (double), BigInt (long), Decimal, DateTime, TimeSpan, Uri,
  Guid, Uint8Array (byte[]), Array (string[]), Object. So `typeof(string)` (in ListAttribute) is
  ported as `T.AttributeTypeType.clrToXmlType(String)`. `ClrType` and `ClrValue` are exported from
  the package.
- **Values out of the engine** (decoded values) are always plain JS values, never ClrValue.
  CaexValue tracks the CLR type of each decoded value internally, because C# `Equals`,
  `CompareTo` and `ToString` depend on it (xs:int 5 does not equal xs:double 5; an xs:float
  prints with float precision; `int.CompareTo(string)` throws ArgumentException).
- `value.ToString()` under the invariant culture (`clrToString`): `True`/`False`, doubles via
  `XmlConvert.toString` except `NaN`/`Infinity`/`-Infinity`, arrays give the CLR type name
  (`System.Byte[]`, which is what C# writes for an xs:hexBinary/base64Binary value).
- `DefaultDecodedValue` returns `DateTime.now` etc. like C#.

## C# behaviour not reproduced exactly

- `AttributeTypeType.IsInherited(IObjectWithAttributes owner)` hides the `IsInherited`
  property of CAEXBasicObject with a method; a TS subclass cannot turn an inherited accessor
  into a method, so it is `isInheritedIn(owner)`. The base property `isInherited` stays
  visible on attributes (in C# it is hidden).
- The implicit operator to `ObjectWithAMLAttributes` is `AttributeTypeType.op_Implicit(x)`.
- `GetHashCode` of CaexValue is `equalityKey()`; `AttributeValueComparer.GetHashCode(XElement)`
  is `key(element)` (the IEqualityComparer shape of src/system/linq.ts): the attribute value,
  or the element itself when the attribute is missing (C# hashes such elements by reference).
- Fallback cultures: `GetDouble`/`GetDateTime` try the fixed culture de-DE before the current
  culture, its parent and the invariant culture. The port runs under the invariant culture
  (like the oracle), so the last three are invariant. de-DE number parsing
  (NumberStyles.Any: `,` decimal, `.` group, `€`, `∞`) is reimplemented after .NET's
  Number.TryParseNumber and agrees with .NET 8 on these inputs (`1,5` 1.5, `1.000,5` 1000.5,
  `1.2.3` 123, `(5)` -5, `5-` -5, ` 1,5 € ` 1.5, `∞`, `$5` fails, ...). de-DE DateTime parsing
  covers only numeric forms (`d.M.yy[yy]`, also with `/` or `-`, `yyyy-M-d`, optional `H:m[:s]`,
  time alone = today); other forms (month names, fractional seconds, offsets) fall through to
  the invariant `DateTime.tryParse`, which may differ from .NET's de-DE parser.
- `XsdDataTypes.ResourceManager` is emulated (getString, getResourceSet); the enumeration order
  of `AttributeTypeType.XsdDataTypes` was read from Aml.Engine 4.5.2 under .NET 8
  (`xs:long, xs:boolean, xs:gDay, ...`, 43 entries). Culture is ignored.
- `System.Exception` and `FieldAccessException` have no class in src/system; they are thrown
  as `Error` with `name` set to the .NET type name.
- `Uri.EscapeDataString` is implemented locally (encodeURIComponent plus `!'()*`; lone
  surrogates become U+FFFD).
- `Encoding.UTF8.GetString` is `TextDecoder('utf-8', { ignoreBOM: true })` (keeps a BOM, U+FFFD
  for invalid bytes); `GetBytes` is `TextEncoder`.
- `string.CompareTo` (culture sensitive) uses `invariantCompare` of src/system/linq.ts.
- `NormalizedStringEncoder` uses the .NET `\s` class (`[\f\n\r\t\v\x85\p{Z}]`), `Trim()` the
  .NET white space set (`csTrim` in TokenEncoder.ts).

## Errors of the original, ported unchanged

Behaviour checked with Aml.Engine 4.5.2 under the invariant culture where marked "confirmed".

- `AttributeFamilyType.AttributeDataType` getter: `base.AttributeDataType` never returns null
  (it returns `""`), so the fallback to the base class and to `xs:string` is dead code.
- `XmlTypeCodeExtensions.DefaultEncodedValue(Date)` returns `""` (Date is missing in the switch,
  confirmed) while `DefaultDecodedValue(Date)` is today.
- `DefaultDecodedValue(UnsignedShort)` is `0m` (decimal), so a failed xs:unsignedShort decode
  returns a Decimal, not a ushort (confirmed).
- gDay/gMonth/gYear: encoding writes `---05`/`--05--`/`2024`, decoding expects a plain number,
  so the encoded day/month reads back as the string `---05` (confirmed). A day 40 makes the
  encoder throw inside the try, the value becomes null and the element empty (confirmed).
  Reading back is correctable: fix `datePartValues` (docs/fixes.md).
- xs:base64Binary is not a "string value", so encoding writes `value.ToString()` unencoded,
  while decoding base64-decodes: `hällo` reads back as `''` (confirmed). Correctable: fix `base64Binary` (docs/fixes.md).
- `IsValidStringValue` for xs:hexBinary throws ArgumentOutOfRangeException on an odd length
  (confirmed) and a TypeError (NullReferenceException) for null.
- xs:QName validation (LocalNameEncoder) rejects names without a prefix (confirmed:
  `ab` -> "not a valid QName").
- xs:boolean with an int 1 encodes as `false` (bool.TryParse("1") fails, fallback, confirmed). Correctable: fix `booleanFromNumber` (docs/fixes.md).
- `AttributeValueRequirementType.Insert(CAEXWrapper, ...)` returns `NominalScaledType != null`,
  which is always true; `Insert(int, ...)` falls back to the base for unknown types while the
  other overload throws NotImplementedException.
- `TryGetDateTime`/`TryGetDouble` only catch FormatException: an empty Value throws
  ArgumentNullException.
- `setItem` (C# indexer set) with a null value on an attribute without AttributeDataType throws
  a NullReferenceException (`value.GetType()`), ported as TypeError.
- `XmlTypeCodeFromSchemaType(null)` throws ArgumentNullException('key') (Dictionary lookup).

## Reference results of Aml.Engine

C# caller, invariant culture: `AttributeValue = 5` -> xs:int
`5`; `5.0` -> xs:double `5`; `5.5f` -> xs:float; `5L` -> xs:long; `(ushort)5` ->
xs:unsignedShort; `true` -> xs:boolean `true`; `1.5m` -> xs:decimal; xs:int <- "5.5" -> `0`;
xs:long <- 1e20 -> `0`; xs:string <- true -> `True`; xs:float <- 0.1 (double) -> `0.1`;
xs:duration <- "01:30:00" -> `PT1H30M`; xs:date <- DateTime -> `2020-01-02`, friendly
`01/02/2020`; xs:dateTime friendly `Thursday, 02 January 2020 03:04:05`; xs:NMTOKEN <- "a b"
-> `a_x0020_b`; xs:token <- "  a   b  " -> `a b`; xs:Name <- "1a b" -> `_x0031_a_x0020_b`
(decodes back to `1a b`); xs:double <- +Infinity -> `INF`; `Equals` xs:int 5 / xs:double 5 ->
false, `CompareTo` -> 1 (type codes differ).
