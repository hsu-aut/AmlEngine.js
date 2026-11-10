// Port of Aml.Engine.Services.ValidationResults (Aml.Engine.Services 4.3.1).
//
// Extension methods on IEnumerable<ValidationElement>: static methods taking the sequence first.
// Each is a lazy Where, like the C# original.

import '../engine/index.js';
import { from, type Enumerable } from '../system/linq.js';
import { RepairTypeEnum } from './RepairTypeEnum.js';
import { ValidationTypeEnum } from './ValidationTypeEnum.js';
import type { ValidationElement } from './ValidationElement.js';

/** Enum.HasFlag: all bits of `flag` are set in `value`. */
function hasFlag(value: RepairTypeEnum, flag: RepairTypeEnum): boolean {
  return (value & flag) === flag;
}

/** Methods to assist the interpretation of validation results. */
export class ValidationResults {
  private constructor() {}

  /**
   * All validation results related to CAEX objects which use an alias to reference CAEX objects in
   * external sources (AliasValidation, MergableAliasReferenceValidation,
   * MissingAliasReferenceValidation).
   */
  static aliasReferenceValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => {
      const validationType = v.validationType;
      return validationType >= ValidationTypeEnum.AliasValidation && validationType <= ValidationTypeEnum.MissingAliasReferenceValidation;
    });
  }

  /** All validation results related to ambiguous alias names. */
  static aliasValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.AliasValidation);
  }

  /** All validation results related to external references which are not locatable. */
  static externalReferenceValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.FileReferenceValidation);
  }

  /** All validation results related to the CAEX path of a CAEX class. */
  static classPathValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.ClassPathValidation);
  }

  /** All validation results related to CAEX objects which use IDs to reference other CAEX objects. */
  static idReferenceValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.IDReferenceValidation);
  }

  /** All validation results related to external interfaces with a cardinality violation. */
  static cardinalityValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.CardinalityValidation);
  }

  /** All validation results related to external interfaces with a direction violation. */
  static directionValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.DirectionValidation);
  }

  /** All validation results related to external interfaces with a category violation. */
  static categoryValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.CategoryValidation);
  }

  /** All validation results related to CAEX objects which use a CAEX path to reference other CAEX objects. */
  static pathReferenceValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.PathReferenceValidation);
  }

  /**
   * All validation results related to CAEX objects which use a name to reference other CAEX
   * objects (currently only name references of mapping objects are validated).
   */
  static nameReferenceValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => {
      const validationType = v.validationType;
      return (
        validationType >= ValidationTypeEnum.RoleAttributeReferenceValidation &&
        validationType <= ValidationTypeEnum.SystemUnitClassInterfaceReferenceValidation
      );
    });
  }

  /** All validation results related to CAEX objects with invalid names. */
  static nameValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.NameValidation);
  }

  /** All validation results related to the CAEX object ID attribute. */
  static idValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.IDValidation);
  }

  /** All validation results related to meta data assigned to a CAEXFile. */
  static metaDataValidationResults(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.validationType === ValidationTypeEnum.AutomationMLMetaDataValidation);
  }

  /** All validation results related to the AutomationML version (use the metaDataValidationResults as argument). */
  static invalidAutomationMLVersion(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => hasFlag(v.availableRepairOptions, RepairTypeEnum.CreateAutomationMLVersion));
  }

  /** All validation results related to the CAEX schema version (use the metaDataValidationResults as argument). */
  static invalidSchemaVersion(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => hasFlag(v.availableRepairOptions, RepairTypeEnum.SetSchemaVersion));
  }

  /** All validation results related to missing source information in an AML file. */
  static missingDocumentSourceInformation(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where(
      (v) => (v.availableRepairOptions & (RepairTypeEnum.CreateWriterHeader | RepairTypeEnum.CreateSourceDocumentInformation)) !== 0,
    );
  }

  /** All validation results related to wrong formatted CAEX object IDs (use the idValidationResults as argument). */
  static invalidIDs(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => hasFlag(v.availableRepairOptions, RepairTypeEnum.GenerateValidGUID));
  }

  /**
   * All validation results related to wrong named CAEX objects which are referable, i.e. not
   * uniquely identifiable with a CAEX path (use the classPathValidationResults as argument).
   */
  static notUniquePath(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => hasFlag(v.availableRepairOptions, RepairTypeEnum.RenameClassPathForDoubles));
  }

  /** All validation results which are repairable. */
  static repairable(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.availableRepairOptions !== RepairTypeEnum.None);
  }

  /** All validation results which are not repairable. */
  static notRepairable(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => v.availableRepairOptions === RepairTypeEnum.None);
  }

  /** All validation results related to ID references which are not resolvable (use the idReferenceValidationResults as argument). */
  static unresolvedIDRefs(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => hasFlag(v.availableRepairOptions, RepairTypeEnum.IDReferenceOption));
  }

  /** All validation results related to path references which are not resolvable (use the pathReferenceValidationResults as argument). */
  static unresolvedPathRefs(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where(
      (v) => (v.availableRepairOptions & (RepairTypeEnum.PathReferenceOption | RepairTypeEnum.CheckAliasInExternalReference)) !== 0,
    );
  }

  /**
   * All validation results with an empty reference (use the pathReferenceValidationResults as
   * argument; the C# documentation says "not resolvable").
   */
  static emptyPathRefs(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => hasFlag(v.availableRepairOptions, RepairTypeEnum.RemoveEmptyReference));
  }

  /** All validation results related to ID references which are empty (use the idReferenceValidationResults as argument). */
  static emptyIDRefs(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => hasFlag(v.availableRepairOptions, RepairTypeEnum.RemoveEmptyReference));
  }

  /** All validation results related to missing CAEX object IDs (use the idValidationResults as argument). */
  static missingIDs(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => hasFlag(v.availableRepairOptions, RepairTypeEnum.GenerateUniqueIDWhenEmpty));
  }

  /** All validation results related to CAEX object IDs which are not unique (use the idValidationResults as argument). */
  static notUniqueIDs(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => hasFlag(v.availableRepairOptions, RepairTypeEnum.GenerateUniqueIDForDoubles));
  }

  /**
   * All validation results related to CAEX objects which use an undefined ExternalReference alias
   * (use the aliasReferenceValidationResults as argument).
   */
  static unidentifiedAlias(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where(
      (v) => v.validationType === ValidationTypeEnum.MissingAliasReferenceValidation && hasFlag(v.availableRepairOptions, RepairTypeEnum.PathReferenceOption),
    );
  }

  /**
   * All validation results related to CAEX objects which reference an external source that is
   * already merged into the document (use the aliasReferenceValidationResults as argument).
   */
  static uselessAlias(validationResult: Iterable<ValidationElement>): Enumerable<ValidationElement> {
    return from(validationResult).where((v) => hasFlag(v.availableRepairOptions, RepairTypeEnum.RemoveAlias));
  }
}
