// XSD validation of CAEX documents: the behaviour of XmlSchemaManager.Validate(XDocument, out
// string[]) in Aml.Engine, which saves the document (SaveOptions.None) and reads it back through
// an XmlReader with ValidationType.Schema, IgnoreWhitespace, IgnoreComments and
// IgnoreProcessingInstructions, collecting "Line N:\t <message>" for every validation error.

import { type XDocument, decodeXml, saveXDocument } from '../../../xml/index.js';
import { CAEX_ClassModel_V2_15_xsd, CAEX_ClassModel_V3_0_xsd } from '../data/xsd.js';
import { readNodes } from './XmlLineReader.js';
import { XmlSchemaValidator } from './XmlSchemaValidator.js';
import { type CompiledSchema, compileXsd } from './XsdCompiler.js';

export type CaexSchemaVersion = '3.0' | '2.15';

const compiled = new Map<CaexSchemaVersion, CompiledSchema>();

/**
 * The compiled schema set of a CAEX version. Like the XmlSchemaSet of the AMLSchemaManager
 * singletons it is created once and shared by all validations (it can grow: the xml namespace
 * schema is added on first use of an xml:* attribute, as in .NET).
 */
export function compiledSchema(version: CaexSchemaVersion): CompiledSchema {
  let s = compiled.get(version);
  if (!s) {
    s = compileXsd(version === '3.0' ? CAEX_ClassModel_V3_0_xsd : CAEX_ClassModel_V2_15_xsd);
    compiled.set(version, s);
  }
  return s;
}

/**
 * Validates the saved text of `doc` against the CAEX schema of the given version, reproducing
 * XmlSchemaManager.Validate: `result` is false if any validation error occurred, `messages`
 * holds "Line N:\t message" entries in the order .NET reports them. Line numbers refer to the
 * text XDocument.Save(stream) writes (saveXDocument). Throws XmlException when the saved text
 * cannot be read (a DOCTYPE: DtdProcessing.Prohibit), as the .NET method lets it escape.
 */
export function validateText(text: string, schema: CaexSchemaVersion): { result: boolean; messages: string[] } {
  const validator = new XmlSchemaValidator(compiledSchema(schema));
  validator.run(readNodes(text));
  return { result: !validator.hasErrors, messages: validator.messages };
}

/** XmlSchemaManager.Validate(XDocument source, out string[] messages). */
export function validateXDocument(doc: XDocument, schema: CaexSchemaVersion): { result: boolean; messages: string[] } {
  return validateText(decodeXml(saveXDocument(doc)), schema);
}
