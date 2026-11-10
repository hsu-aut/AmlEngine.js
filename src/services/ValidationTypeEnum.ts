// Port of Aml.Engine.Services.ValidationTypeEnum (Aml.Engine.Services 4.3.1).

import '../engine/index.js';

/** The kinds of validation issues reported by the ValidatorService. */
export enum ValidationTypeEnum {
  /**
   * ID related issues, like a double or missing ID or a wrong formatted ID. The issues are
   * repairable, if the ID is not referenced.
   */
  IDValidation = 0,
  /** A double ClassPath or missing Path. */
  ClassPathValidation = 1,
  /** A double AttributePath or missing Path. */
  AttributePathValidation = 2,
  /** A missing or unresolved reference to a class. */
  PathReferenceValidation = 3,
  /** A missing or not allowed name. */
  NameValidation = 4,
  /** A missing or unresolved reference to an object with an ID. */
  IDReferenceValidation = 5,
  /** The alias validation. */
  AliasValidation = 6,
  /** An alias in an external reference which is not merged. */
  MergableAliasReferenceValidation = 7,
  /** A missing alias in an external reference. */
  MissingAliasReferenceValidation = 8,
  /** A wrong FilePath in an external reference, which couldn't be resolved to an existing file. */
  FileReferenceValidation = 9,
  /** A wrong reference to a role Attribute in a Mapping. */
  RoleAttributeReferenceValidation = 10,
  /** A wrong reference to a role Interface in a Mapping. */
  RoleInterfaceReferenceValidation = 11,
  /** A wrong reference to a SystemUnitClass Attribute in a Mapping. */
  SystemUnitClassAttributeReferenceValidation = 12,
  /** A wrong reference to a SystemUnitClass Interface in a Mapping. */
  SystemUnitClassInterfaceReferenceValidation = 13,
  /** A cyclic dependency between classes. */
  CyclicDependency = 14,
  /** Issues with meta data, as a missing schema name or writerHeader. */
  AutomationMLMetaDataValidation = 15,
  /** The internal link count of an external interface violates a defined cardinality. */
  CardinalityValidation = 16,
  /** An internal link of an external interface violates the direction constraint. */
  DirectionValidation = 17,
  /** An internal link of an external interface violates the category constraint. */
  CategoryValidation = 18,
}
