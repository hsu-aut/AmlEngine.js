// Port of Aml.Engine.Resources.Files.AMLFileContentType (Aml.Engine.Resources 4.2.1).
// [TypeConverter(typeof(EnumDescriptionTypeConverter))]: the [Description] texts are in the
// table of EnumDescriptionTypeConverter.

/** Definition of differentiated contents of AutomationML Files. */
export enum AMLFileContentType {
  /** AutomationMLFile containing libraries only ([Description("Library File")]). */
  LibraryFile = 0,
  /** AutomationMLFile providing a collection of libraries for a specific application context ([Description("Library-Collection File")]). */
  LibraryCollectionFile = 1,
  /**
   * AutomationML File, providing example models. An example file typically references one or
   * more model files with additional instance hierachies, using the classes of the model
   * ([Description("Example File")]).
   */
  ExampleFile = 2,
  /**
   * AutomationML library catalog, listing all publicly available versions of AutomationML
   * libraries with their download address ([Description("Library Catalogue")]).
   */
  LibraryCatalog = 3,
  /** A repository defining all classes and attribute types available ([Description("Class Catalogue")]). */
  ClassRepository = 4,
  /** Data, used to sign libraries ([Description("Signing Data")]). */
  SignatureData = 5,
  /** Data, used to store backups ([Description("Backups")]). */
  BackupData = 6,
  /** No content type defined ([Description("undefined")]). */
  None = 7,
}
