// AmlEngine.js: AutomationML (CAEX 2.15 / 3.0) for JavaScript, a port of Aml.Engine 4.5.2.
//
// The engine types keep their C# names (CAEXDocument, InternalElementType, ...). Loading this
// module registers every engine class.

export * from './engine/api.js';
export { ClrType, ClrValue } from './engine/caex/extensions/ClrValue.js';

// .NET value types used by the API (typed attribute values, dates, exceptions).
export {
  DateTime,
  DateTimeKind,
  TimeSpan,
  Decimal,
  Guid,
  Uri,
  UriKind,
  XmlConvert,
  XmlDateTimeSerializationMode,
} from './system/index.js';
export { XmlTypeCode } from './system/XmlTypeCode.js';
export * as system from './system/index.js';

// System.Xml.Linq (the XML tree every wrapper is built on).
export * as xml from './xml/index.js';
