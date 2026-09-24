// The .NET "System" value layer used by the engine (DateTime, TimeSpan, decimal, Guid, Uri,
// XmlConvert, number parsing, Convert, events, exceptions). Everything here is verified against
// .NET 8 by test/system/sys.oracle.test.ts; known deviations are listed in docs/deviations.md.

export * from './exceptions.js';
export * from './Char.js';
export * from './DateTime.js';
export { DateTimeStyles } from './DateTimeParse.js';
export * from './TimeSpan.js';
export * from './Decimal.js';
export * from './Number.js';
/** X.TryParse(string) with each type's default NumberStyles (value or null). */
export * as Parse from './Parse.js';
export * from './Guid.js';
export * from './Uri.js';
export * from './XmlConvert.js';
export { XmlCharType } from './XmlCharType.js';
export { XsdDateTimeFlags, xsdDateTimeToDateTime } from './XsdDateTime.js';
export { xsdDurationToTimeSpan } from './XsdDuration.js';
export * from './Convert.js';
export * from './events.js';
