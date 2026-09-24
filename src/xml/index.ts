// System.Xml.Linq for AmlEngine.js: parse, tree and save with the byte-exact output of .NET.

import { XDocument } from './XNode.js';
import { parseXml } from './XmlParser.js';
import { DEFAULT_WRITER_SETTINGS, type XmlWriterSettings, writeDocument } from './XmlWriter.js';
import { UTF8, decodeXml, encodeWithPreamble, getEncoding } from './encoding.js';
import { EncoderFallbackException } from '../system/exceptions.js';

export * from './XName.js';
export * from './XNode.js';
export { XmlException, isNCName, isName } from './XmlChars.js';
export { type XmlWriterSettings, DEFAULT_WRITER_SETTINGS, nodeToString } from './XmlWriter.js';
export { decodeXml, getEncoding } from './encoding.js';

export interface LoadOptions {
  /** Keep whitespace-only text nodes (LoadOptions.PreserveWhitespace). Default false. */
  preserveWhitespace?: boolean;
}

export interface SaveOptions {
  /** SaveOptions.DisableFormatting: no indentation. */
  disableFormatting?: boolean;
  /** SaveOptions.OmitDuplicateNamespaces. */
  omitDuplicateNamespaces?: boolean;
}

/** XDocument.Parse(text, options). */
export function parseXDocument(text: string, options: LoadOptions = {}): XDocument {
  return parseXml(text, { preserveWhitespace: options.preserveWhitespace ?? false });
}

/** XDocument.Load(XmlReader.Create(text, settings)): the reader prohibits a DTD. */
export function readXDocument(text: string, options: LoadOptions = {}): XDocument {
  return parseXml(text, { preserveWhitespace: options.preserveWhitespace ?? false, prohibitDtd: true });
}

/** XDocument.Load over an XmlReader on the given bytes (encoding detected like XmlReader). */
export function loadXDocument(bytes: Uint8Array, options: LoadOptions = {}): XDocument {
  return readXDocument(decodeXml(bytes), options);
}

/**
 * XDocument.Save(Stream, SaveOptions): encoding taken from the declaration (UTF-8 when absent or
 * unknown), preamble written, CRLF line ends, two-space indentation.
 */
export function saveXDocument(doc: XDocument, options: SaveOptions = {}): Uint8Array {
  const enc = (doc.declaration?.encoding ? getEncoding(doc.declaration.encoding) : null) ?? UTF8;
  const text = writeDocument(doc, {
    ...DEFAULT_WRITER_SETTINGS,
    indent: !options.disableFormatting,
    omitDuplicateNamespaces: options.omitDuplicateNamespaces ?? false,
    encodingName: enc.webName,
    canEncode: enc.canEncode,
  });
  // Text and attribute values already carry character entities for unencodable characters;
  // anything left (comments, PIs, CDATA, names) makes .NET's encoder fallback throw.
  if (enc !== UTF8) {
    for (const ch of text) {
      const cp = ch.codePointAt(0)!;
      if (!enc.canEncode(cp)) {
        throw new EncoderFallbackException(`Unable to translate Unicode character \\u${cp.toString(16).toUpperCase().padStart(4, '0')} to code page of ${enc.webName}.`);
      }
    }
  }
  return encodeWithPreamble(text, enc, true);
}

/** Serializes with explicit XmlWriterSettings, returning text (no preamble). */
export function writeXDocument(doc: XDocument, settings: Partial<XmlWriterSettings> = {}): string {
  return writeDocument(doc, { ...DEFAULT_WRITER_SETTINGS, ...settings });
}
