// AmlEngine.js: AutomationML (CAEX 2.15 / 3.0) for JavaScript, a port of Aml.Engine 4.5.2.
//
// The engine types keep their C# names (CAEXDocument, InternalElementType, ...). Loading this
// module registers every engine class.

export * from './engine/api.js';
export { ClrType, ClrValue } from './engine/caex/extensions/ClrValue.js';
export { CyclicReferenceException } from './engine/cycles.js';
export { ALL_FIXES, Fixes, type Fix, type FixSelection } from './engine/fixes.js';

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

// System.IO.Packaging and the streams of AutomationMLContainer (AMLX): to create and change a
// container in memory, as in the browser, and to name the types of its parts and relationships.
export { MemoryStream, SeekOrigin } from './engine/amlobjects/packaging/MemoryStream.js';
export {
  CompressionOption,
  FileAccess,
  FileFormatException,
  FileMode,
  FileShare,
  IOException,
  Package,
  PackagePart,
  PackagePartCollection,
  PackageRelationship,
  PackageRelationshipCollection,
  TargetMode,
} from './engine/amlobjects/packaging/Package.js';
export type { StreamLike } from './engine/amlobjects/AutomationMLContainer.js';

// System.Xml.Linq (the XML tree every wrapper is built on).
export * as xml from './xml/index.js';
