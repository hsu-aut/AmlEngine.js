// Port of Aml.Engine.Services.RepairTypeEnum (Aml.Engine.Services 4.3.1).

import '../engine/index.js';

/**
 * The repair options of a validation issue ([Flags] in C#: combine with `|`, test with `&`). Some
 * members share a value: IDReferenceOption and RemoveUnresolvedIDReference (0x20),
 * PathReferenceOption and RemoveUnresolvedPathReference (0x40), CheckAliasInExternalReference and
 * NotRepairable (0x10000).
 */
export enum RepairTypeEnum {
  /** The options which are related to ID validation issues. */
  IDDefinitionOption = 0x2005,
  /** The options which are related to Name validation issues. */
  NameDefinitionOption = 0x1488,
  /** The options which are related to ID reference validation issues. */
  IDReferenceOption = 0x20,
  /** The options which are related to Path reference validation issues. */
  PathReferenceOption = 0x40,
  /** Generates a unique ID for all empty IDs. */
  GenerateUniqueIDWhenEmpty = 1,
  /** Generates a unique ID for all double IDs. */
  GenerateUniqueIDForDoubles = 4,
  /**
   * Renames all empty names with an automatic name generation algorithm (a UniqueNameService
   * has to be registered).
   */
  GenerateNameWhenEmpty = 8,
  /** Removes all references where the reference value is empty. */
  RemoveEmptyReference = 0x10,
  /** Removes all ID references where the ID value has not been resolved. */
  RemoveUnresolvedIDReference = 0x20,
  /** Removes all path references where the path reference value has not been resolved. */
  RemoveUnresolvedPathReference = 0x40,
  /**
   * Generates a new name for an element, when its CAEX path is double, so that the path is unique
   * (a UniqueNameService has to be registered).
   */
  RenameClassPathForDoubles = 0x80,
  /** Generates a writer header. */
  CreateWriterHeader = 0x100,
  /** Generates an AutomationML version header. */
  CreateAutomationMLVersion = 0x200,
  /**
   * Renames all double names with an automatic name generation algorithm (a UniqueNameService
   * has to be registered).
   */
  GenerateUniqueName = 0x400,
  /** Corrects the schema version. */
  SetSchemaVersion = 0x800,
  /** Re-encodes a name, escaping all invalid XML chars. */
  GenerateXmlName = 0x1000,
  /** Generates a new GUID for existing GUIDs with invalid formats. */
  GenerateValidGUID = 0x2000,
  /** Generates a new reference without the alias. */
  RemoveAlias = 0x8000,
  /** A hint for a not resolvable reference, containing an alias. */
  CheckAliasInExternalReference = 0x10000,
  /** Generates source document information. */
  CreateSourceDocumentInformation = 0x20000,
  /** Deletes an element. */
  RemoveElement = 0x40000,
  /** Deletes an element which references an element out of the allowed scope. */
  RemoveElementNotInScope = 0x80000,
  /** Generates a valid file URL in an ExternalDataConnector to a localized file. */
  ChangeFileURL = 0x100000,
  /** Removes all name references where the name reference value has not been resolved. */
  RemoveUnresolvedNameReference = 0x200000,
  /** Nothing automatic can be done. */
  None = 0,
  /** Options, which are not repairable. */
  NotRepairable = 0x10000,
}
