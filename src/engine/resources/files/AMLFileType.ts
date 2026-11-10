// Port of Aml.Engine.Resources.Files.AMLFileType (Aml.Engine.Resources 4.2.1).

/** Definition of FileTypes. */
export enum AMLFileType {
  /** AutomationML XML Document File (ends with .aml). */
  AutomationMLXMLDocument = 0,
  /** AutomationML Container File (ends with .amlx). */
  AutomationMLContainer = 1,
  /** AutomationML catalog, listing all publicly available versions of libraries and classes. */
  Catalog = 2,
  /** A zip archive which coud contain any of the previous AutomationML content. */
  ZipArchive = 3,
  /** Unknown filetype. */
  Unknown = 4,
}
