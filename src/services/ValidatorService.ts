// Port of Aml.Engine.Services.ValidatorService (Aml.Engine.Services 4.3.1).
//
// The C# iterator methods return a lazy Enumerable that runs the iterator anew for every
// enumeration, like an IEnumerable from `yield return`. File checks use node:fs through NetPath;
// without a file system (browser) File.Exists is false. Requests that C# sends synchronously
// (http, https, ftp) are not possible in JavaScript: see canLocateExternalFileReference.

import '../engine/index.js';
import { implementsInterface, registerInterfaces } from '../engine/interfaces.js';
import { ArgumentNullException, NotSupportedException, SystemException } from '../system/exceptions.js';
import { cultureStartsWith } from '../system/CompareInfo.js';
import { Enumerable, from } from '../system/linq.js';
import { equalsOrdinalIgnoreCase, isNullOrEmpty, isNullOrWhiteSpace } from '../system/strings.js';
import { Uri, UriKind, XmlConvert } from '../system/index.js';
import { XmlException, type XElement } from '../xml/index.js';
import * as Path from '../engine/amlobjects/internal/NetPath.js';
import { AutomationMLInterfaceClassLib } from '../engine/amlobjects/AutomationMLInterfaceClassLib.js';
import { AmlObjectsExtensions } from '../engine/amlobjects/extensions/AmlObjectsExtensions.js';
import { AttributeFamilyType } from '../engine/caex/AttributeFamilyType.js';
import { AttributeNameMappingType } from '../engine/caex/AttributeNameMappingType.js';
import { CAEXBasicObject } from '../engine/caex/CAEXBasicObject.js';
import { CAEXDocument_CAEXSchema, type CAEXDocument } from '../engine/caex/CAEXDocument.js';
import { CAEXWrapper } from '../engine/caex/CAEXWrapper.js';
import { ExternalInterfaceType } from '../engine/caex/ExternalInterfaceType.js';
import { InterfaceFamilyType } from '../engine/caex/InterfaceFamilyType.js';
import { InterfaceIDMappingType } from '../engine/caex/InterfaceIDMappingType.js';
import { InterfaceNameMappingType } from '../engine/caex/InterfaceNameMappingType.js';
import { InternalElementType } from '../engine/caex/InternalElementType.js';
import { InternalLinkType } from '../engine/caex/InternalLinkType.js';
import { MappingElementType } from '../engine/caex/MappingElementType.js';
import { RoleFamilyType } from '../engine/caex/RoleFamilyType.js';
import { RoleRequirementsType } from '../engine/caex/RoleRequirementsType.js';
import { SupportedRoleClassType } from '../engine/caex/SupportedRoleClassType.js';
import { SystemUnitClassLibType } from '../engine/caex/SystemUnitClassLibType.js';
import { SystemUnitClassType } from '../engine/caex/SystemUnitClassType.js';
import { SystemUnitFamilyType } from '../engine/caex/SystemUnitFamilyType.js';
import { CAEXBasicObjectExtensions } from '../engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from '../engine/caex/extensions/CAEXDocumentExtensions.js';
import { CAEXPathBuilder } from '../engine/caex/extensions/CAEXPathBuilder.js';
import { ExternalInterfaceTypeExtensions } from '../engine/caex/extensions/ExternalInterfaceTypeExtensions.js';
import { StringExtensions } from '../engine/caex/extensions/StringExtensions.js';
import { AMLFileContentType } from '../engine/resources/files/AMLFileContentType.js';
import { AMLFileMetaModel } from '../engine/resources/files/AMLFileMetaModel.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { XmlCAEXAttributes } from '../engine/xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../engine/xmlext/XmlCAEXSchema.js';
import { RepairTypeEnum } from './RepairTypeEnum.js';
import { ValidationElement } from './ValidationElement.js';
import { ValidationKey } from './ValidationKey.js';
import { ValidationTypeEnum } from './ValidationTypeEnum.js';
import type { AutomationMLContainer } from '../engine/amlobjects/AutomationMLContainer.js';
import type { CAEXFileType } from '../engine/caex/CAEXFileType.js';
import type { CAEXObject } from '../engine/caex/CAEXObject.js';
import type { ExternalReferenceType } from '../engine/caex/ExternalReferenceType.js';
import type { ICAEXReference } from '../engine/services/interfaces/ICAEXReference.js';
import type { ILookUpTable } from '../engine/services/interfaces/ILookUpTable.js';
import type { IValidator_1 } from '../engine/services/interfaces/IValidator.js';

/** A C# iterator method: a lazy sequence that runs the generator anew for every enumeration. */
function seq<X>(factory: () => Iterator<X>): Enumerable<X> {
  return new Enumerable(factory);
}

/** Enum.HasFlag: all bits of `flag` are set in `value`. */
function hasFlag(value: RepairTypeEnum, flag: RepairTypeEnum): boolean {
  return (value & flag) === flag;
}

type ValidationElementInit = Partial<Pick<ValidationElement, 'availableRepairOptions' | 'validatedAttribute' | 'validationInformation' | 'longDescription'>>;

/** `new ValidationElement(element, key) { ... }` with the C# object initializer. */
function newValidationElement(element: XElement, validationKey: ValidationKey, init: ValidationElementInit): ValidationElement {
  return Object.assign(new ValidationElement(element, validationKey), init);
}

/** File.Exists; false where no file system is available (browser), like CAEXDocument. */
function fileExists(path: string | null): boolean {
  if (Path.tryGetFs() === null) {
    return false;
  }
  return Path.fileExists(path);
}

/** `new NullReferenceException(message)` of .NET. */
function nullReferenceException(message: string): Error {
  const e = new SystemException(message);
  e.name = 'NullReferenceException';
  return e;
}

/**
 * This service is defined for the validation of an AML document. Additionally the service can
 * also be used to repair specific invalid properties in a document.
 */
export class ValidatorService implements IValidator_1<ValidationElement> {
  /** @internal The invalid schema key. */
  static readonly invalidschemakey = 'InvalidSchemaVersion';

  /** @internal The no AML version key. */
  static readonly noamlversionkey = 'NoAutomationMLVersion';

  /** @internal The no name key. */
  static readonly nonamekey = '#CAEXNoName#';

  /** @internal The no schema key. */
  static readonly noschemakey = 'NoSchemaVersion';

  private static _unloadIDTable = false;

  private static _unloadPathTable = false;

  /**
   * Private in C# (use ValidatorService.register()). Public here, because the class is passed as
   * a type argument (`ServiceLocator.beginService(ValidatorService.register, ValidatorService)`),
   * which a private constructor does not allow in TypeScript.
   */
  constructor() {}

  /**
   * Normalizes a file path and resolves relative paths.
   * @param relativePath a string with a relative path
   * @param caexFile The CAEX file.
   * @returns a normalized file path string
   */
  static normalizeFilePath(relativePath: string | null, caexFile: CAEXFileType | null): string {
    const filePath = (caexFile as CAEXWrapper).caexDocument!.filePath;
    let text: string | null = '';
    if (filePath !== '') {
      text = Path.getDirectoryName(filePath);
    }
    try {
      if (text == null) {
        throw nullReferenceException('rootPath');
      }
      // Without node:path (browser) GetFullPath throws, and the catch block gives the input.
      return Path.getFullPath(Path.combine(text, relativePath as string));
    } catch {
      return relativePath ?? '';
    }
  }

  /**
   * Registers a new validator service.
   * @returns The registered validator service.
   */
  static register(): ValidatorService {
    const validatorService = new ValidatorService();
    ServiceLocator.register(validatorService, 'IValidator');
    return validatorService;
  }

  /** Unregisters the validator service. */
  static unRegister(): void {
    ServiceLocator.unRegister('IValidator');
  }

  /**
   * Validates the ID of a CAEX object. IDs of CAEX objects shall be unique.
   * @param caexObject The CAEX object.
   * @param ID The ID, which should be assigned to the object. If no ID is defined, the uniqueness
   * of the already assigned ID is evaluated.
   * @returns the validation result and a message
   */
  idValidation(caexObject: CAEXObject, ID: string | null): { isValid: boolean; message: string | null } {
    if (caexObject == null) {
      throw new ArgumentNullException('caexObject');
    }
    if (isNullOrEmpty(ID)) {
      ID = caexObject.id;
    }
    if (CAEXBasicObjectExtensions.caexDocument(caexObject) == null) {
      return { isValid: true, message: '' };
    }
    const queryService = ServiceLocator.queryService;
    const obj = CAEXBasicObjectExtensions.caexDocument(caexObject);
    const lookup = queryService.allElementsWithIDs((obj != null ? obj.caexFile : null) as CAEXBasicObject, ID);
    if (lookup != null && lookup.count > 0) {
      const grouping = from(lookup).first();
      if (grouping != null && grouping.count() > 1) {
        return { isValid: false, message: 'ID is not unique' };
      }
    }
    return { isValid: true, message: '' };
  }

  private static facetNameIsUsed(facetNode: XElement, name: string | null): boolean {
    const parent = facetNode.parent;
    if (parent == null) {
      return false;
    }
    return from(parent.elements()).any(
      (e) => e !== facetNode && XmlCAEXSchema.isFacet(e) && XmlCAEXAttributes.caexNameOfElement(e) === name,
    );
  }

  private static nameIsUsed(caexNode: XElement, name: string | null): boolean {
    let flag = false;
    if (XmlCAEXSchema.isCAEXClass(caexNode.parent!, true)) {
      if (XmlCAEXSchema.isAttributeOrType(caexNode)) {
        flag = from(caexNode.parent!.elements(caexNode.parent!.name)).any(
          (n) => n !== caexNode && (n.attribute('Name')?.value ?? null) === name,
        );
      } else if (XmlCAEXSchema.isCAEXClass(caexNode, true)) {
        flag = from(caexNode.parent!.elements(XmlCAEXSchema.xName(caexNode, 'Attribute'))).any(
          (n) => (n.attribute('Name')?.value ?? null) === name,
        );
      }
    }
    if (!flag) {
      return from(caexNode.parent!.elements(caexNode.name)).any(
        (caex) => caexNode !== caex && (caex.attribute('Name')?.value ?? null) === name,
      );
    }
    return true;
  }

  /**
   * Validates a name of a CAEX object. Names of CAEX classes or types (RoleClasses,
   * InterfaceClasses, SystemUnitClasses and AttributeTypes), Attributes, Libraries and CAEX
   * InstanceHierarchies shall be unique across their siblings, so that referencing a library, a
   * class, a type or an attribute by its path delivers a unique result.
   * @param caexObject The CAEX object.
   * @param name The name, which should be assigned to the object.
   * @returns the validation result and a message
   */
  nameValidation(caexObject: CAEXObject, name: string | null): { isValid: boolean; message: string | null } {
    if (CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (isNullOrEmpty(name)) {
      return { isValid: false, message: 'Name shall not be empty.' };
    }
    const caexObjectNode = (caexObject as CAEXWrapper).node!;
    if (CAEXWrapper.equals((caexObject as CAEXWrapper).caexParent, null)) {
      return { isValid: true, message: null };
    }
    XmlCAEXSchema.isElementWithNameAndIDReference(caexObjectNode);
    if (ValidatorService.elementNameShallBeUnique(caexObjectNode) && caexObjectNode.parent != null && ValidatorService.nameIsUsed(caexObjectNode, name)) {
      return { isValid: false, message: 'Name shall be unique across all siblings.' };
    }
    if (XmlCAEXSchema.isFacet(caexObjectNode) && ValidatorService.facetNameIsUsed(caexObjectNode, name)) {
      return { isValid: false, message: "Name of 'Facet' shall be unique across all 'Facet'-siblings." };
    }
    if (
      XmlCAEXSchema.isLibrary(caexObjectNode) &&
      caexObjectNode.parent != null &&
      from(caexObjectNode.parent.elements()).any(
        (caex) => caexObjectNode !== caex && XmlCAEXSchema.isLibrary(caex) && (caex.attribute('Name')?.value ?? null) === name,
      )
    ) {
      return { isValid: false, message: 'All library names shall be unique.' };
    }
    return { isValid: true, message: null };
  }

  private static elementNameShallBeUnique(node: XElement): boolean {
    if (XmlCAEXSchema.caexSchema(node) !== CAEXDocument_CAEXSchema.CAEX2_15 && !XmlCAEXSchema.isCAEXClass(node, true) && !XmlCAEXSchema.isFacet(node)) {
      return XmlCAEXSchema.isBasicAttribute(node);
    }
    return true;
  }

  /**
   * Repairs the specified validated element.
   * @param validation The validated element.
   * @returns `true` if the element has been repaired, `false` otherwise.
   */
  repair(validation: ValidationElement): boolean {
    let flag = false;
    const availableRepairOptions = validation.availableRepairOptions;
    if (hasFlag(availableRepairOptions, RepairTypeEnum.RemoveElement)) {
      return validation.removeElement();
    }
    if (hasFlag(availableRepairOptions, RepairTypeEnum.SetSchemaVersion)) {
      flag = validation.repairSchemaVersion() || flag;
    }
    if (hasFlag(availableRepairOptions, RepairTypeEnum.CreateAutomationMLVersion)) {
      flag = validation.repairAutomationMLVersion() || flag;
    }
    if (hasFlag(availableRepairOptions, RepairTypeEnum.CreateWriterHeader) || hasFlag(availableRepairOptions, RepairTypeEnum.CreateSourceDocumentInformation)) {
      flag = validation.repairWriterHeader() || flag;
    }
    if (
      hasFlag(availableRepairOptions, RepairTypeEnum.GenerateUniqueIDWhenEmpty) ||
      hasFlag(availableRepairOptions, RepairTypeEnum.GenerateValidGUID) ||
      hasFlag(availableRepairOptions, RepairTypeEnum.GenerateUniqueIDForDoubles)
    ) {
      flag = validation.repairID() || flag;
    }
    if (hasFlag(availableRepairOptions, RepairTypeEnum.GenerateUniqueName) || hasFlag(availableRepairOptions, RepairTypeEnum.GenerateNameWhenEmpty)) {
      flag = validation.renameElement(availableRepairOptions) || flag;
    }
    if (hasFlag(availableRepairOptions, RepairTypeEnum.RemoveAlias)) {
      flag = validation.removeAlias() || flag;
    }
    if ((availableRepairOptions & (RepairTypeEnum.IDReferenceOption | RepairTypeEnum.PathReferenceOption | RepairTypeEnum.RemoveEmptyReference)) !== RepairTypeEnum.None) {
      flag = validation.removeAttributeValue() || flag;
    }
    if (hasFlag(availableRepairOptions, RepairTypeEnum.ChangeFileURL)) {
      flag = validation.changeFileURLToRelative() || flag;
    }
    if (hasFlag(availableRepairOptions, RepairTypeEnum.RenameClassPathForDoubles)) {
      flag = validation.renameElement(availableRepairOptions) || flag;
    }
    if (hasFlag(availableRepairOptions, RepairTypeEnum.RemoveUnresolvedNameReference)) {
      flag = validation.removeAttributeValue() || flag;
    }
    return flag;
  }

  /**
   * Gets validation information for all elements of the document which have validation issues.
   * One CAEX object may occur several times with different validation issues. C# overloads
   * ValidateAll(document, generateLongDescription = false) and ValidateAll(document, container,
   * generateLongDescription = false); with a container, the validity of external references which
   * are packed parts of the container is checked.
   */
  validateAll(
    document: CAEXDocument,
    containerOrGenerateLongDescription?: AutomationMLContainer | boolean | null,
    generateLongDescription = false,
  ): Enumerable<ValidationElement> {
    if (typeof containerOrGenerateLongDescription === 'boolean' || containerOrGenerateLongDescription === undefined) {
      ValidatorService.initValidation(document);
      return ValidatorService.getAllValidationIssues(document, null, containerOrGenerateLongDescription ?? false);
    }
    ValidatorService.initValidation(document);
    return ValidatorService.getAllValidationIssues(document, containerOrGenerateLongDescription, generateLongDescription);
  }

  /**
   * Like validateAll, but an InternalElement or ExternalInterface in a class with an undefined ID
   * gets a warning only.
   * @param document The CAEX document.
   * @param container If set, the associated parts, defined in the AutomationML container, are used
   * to validate external references.
   * @param generateLongDescription if set to `true` [generate long description].
   */
  validateAllWithoutStrictID(
    document: CAEXDocument,
    container: AutomationMLContainer | null = null,
    generateLongDescription = false,
  ): Enumerable<ValidationElement> {
    ValidatorService.initValidation(document);
    return ValidatorService.getAllValidationIssues(document, container, generateLongDescription, false);
  }

  /**
   * Validates the alias references and returns the validation result describing possible repair
   * options.
   * @param document The CAEX document.
   * @param generateLongDescription if set to `true` [generate long description].
   */
  validateAliasReferences(document: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    ValidatorService.initValidation(document);
    // Aml.Engine: the generateLongDescription argument is ignored (always false).
    return ValidatorService.getAliasReferenceValidationIssues(document, false, true);
  }

  /** Gets the alias reference validation issues for the specified document. */
  private static getAliasReferenceValidationIssues(doc: CAEXDocument, generateLongDescription = false, finalize = false): Enumerable<ValidationElement> {
    return seq(function* () {
      const lookup = ServiceLocator.queryService.allElementsWithAliasReference(doc.caexFile as CAEXBasicObject, '');
      for (const item of lookup) {
        const key = item.key;
        const list: ICAEXReference[] = [];
        list.push(...item);
        for (const item2 of ValidatorService.validateAliasReference(doc, key, list, generateLongDescription)) {
          yield item2;
        }
      }
      if (finalize) {
        ValidatorService.finalizeValidation(doc);
      }
    });
  }

  private static initValidation(document: CAEXDocument): void {
    const queryService = ServiceLocator.queryService;
    const val = implementsInterface(queryService, 'ILookUpTable') ? (queryService as unknown as ILookUpTable) : null;
    if (val != null) {
      if (!val.idTableIsLoaded(document)) {
        ValidatorService._unloadIDTable = true;
        val.loadIDTable(document);
      }
      if (!val.pathTableIsLoaded(document)) {
        ValidatorService._unloadPathTable = true;
        val.loadPathTable(document);
      }
    }
  }

  private static finalizeValidation(document: CAEXDocument): void {
    const queryService = ServiceLocator.queryService;
    const val = implementsInterface(queryService, 'ILookUpTable') ? (queryService as unknown as ILookUpTable) : null;
    if (val != null) {
      if (ValidatorService._unloadIDTable) {
        val.unloadIDTable(document);
      }
      if (ValidatorService._unloadPathTable) {
        val.unloadPathTable(document);
      }
      ValidatorService._unloadIDTable = false;
      ValidatorService._unloadPathTable = false;
    }
  }

  /** @internal Gets all validation issues for the specified document. */
  static getAllValidationIssues(
    doc: CAEXDocument,
    container: AutomationMLContainer | null,
    generateLongDescription = false,
    strictIDValidation = true,
  ): Enumerable<ValidationElement> {
    return seq(function* () {
      for (const metaDataValidationIssue of ValidatorService.getMetaDataValidationIssues(doc, generateLongDescription)) {
        yield metaDataValidationIssue;
      }
      const iDValidationIssues = ValidatorService.getIDValidationIssues(doc, generateLongDescription, strictIDValidation);
      for (const item of iDValidationIssues) {
        yield item;
      }
      for (const nameValidationIssue of ValidatorService.getNameValidationIssues(doc, generateLongDescription)) {
        yield nameValidationIssue;
      }
      for (const pathValidationIssue of ValidatorService.getPathValidationIssues(doc, generateLongDescription)) {
        yield pathValidationIssue;
      }
      const iDReferenceValidationIssues = ValidatorService.getIDReferenceValidationIssues(doc, generateLongDescription);
      for (const item2 of iDReferenceValidationIssues) {
        yield item2;
      }
      for (const externalInterfaceValidationIssue of ValidatorService.getExternalInterfaceValidationIssues(doc, generateLongDescription)) {
        yield externalInterfaceValidationIssue;
      }
      for (const pathReferenceValidationIssue of ValidatorService.getPathReferenceValidationIssues(doc, generateLongDescription)) {
        yield pathReferenceValidationIssue;
      }
      for (const nameReferenceValidationIssue of ValidatorService.getNameReferenceValidationIssues(doc, generateLongDescription)) {
        yield nameReferenceValidationIssue;
      }
      for (const externalReferenceValidationIssue of ValidatorService.getExternalReferenceValidationIssues(doc, container, generateLongDescription)) {
        yield externalReferenceValidationIssue;
      }
      for (const aliasReferenceValidationIssue of ValidatorService.getAliasReferenceValidationIssues(doc, generateLongDescription)) {
        yield aliasReferenceValidationIssue;
      }
      for (const externalDataReferenceValidationIssue of ValidatorService.getExternalDataReferenceValidationIssues(doc, container, generateLongDescription)) {
        yield externalDataReferenceValidationIssue;
      }
      for (const internalLinksValidationIssue of ValidatorService.getInternalLinksValidationIssues(doc, generateLongDescription)) {
        yield internalLinksValidationIssue;
      }
      ValidatorService.finalizeValidation(doc);
    });
  }

  private static getInternalLinksValidationIssues(doc: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      const enumerable = CAEXBasicObjectExtensions.descendants(doc.caexFile as CAEXWrapper, InternalLinkType);
      for (const item of enumerable) {
        if (!item.isDefined) {
          const validationKey = new ValidationKey(item.name, ValidationTypeEnum.IDReferenceValidation);
          const validationElement = newValidationElement(item.node!, validationKey, {
            validatedAttribute: CAEXWrapper.equals(item.aInterface, null) || CAEXWrapper.equals(item.aSystemUnitClass, null) ? 'RefPartnerSideA' : 'RefPartnerSideB',
            availableRepairOptions: RepairTypeEnum.RemoveElement,
          });
          if (generateLongDescription) {
            validationElement.longDescription = 'The Internal Link contains undefined references.';
          }
          validationElement.validationInformation = 'The Internal Link contains undefined references.';
          yield validationElement;
        }
      }
    });
  }

  /** Gets the AutomationML version validation issues. */
  private static getAutomationMLVersionValidationIssues(doc: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      if (isNullOrEmpty(AmlObjectsExtensions.automationMLVersion(doc.caexFile))) {
        const validationKey = new ValidationKey(ValidatorService.noamlversionkey, ValidationTypeEnum.AutomationMLMetaDataValidation);
        const text =
          doc.schema === CAEXDocument_CAEXSchema.CAEX2_15
            ? "The element 'AdditionalInformation' shall have an attribute 'AutomationMLVersion'. The value of this attribute shall be '2.0' to correspond to this standard."
            : "Each AML CAEX document shall store the AML version which this standard follows in the CAEX element 'SuperiorStandardVersion'. The value of this element shall be 'AutomationML 2.1' in order to correspond to the present standard";
        yield newValidationElement((doc.caexFile as CAEXWrapper).node!, validationKey, {
          validatedAttribute: 'AutomationMLVersion',
          availableRepairOptions: RepairTypeEnum.CreateAutomationMLVersion,
          validationInformation: 'undefined AutomationML version',
          longDescription: generateLongDescription ? text : '',
        });
      }
    });
  }

  /** Gets the CAEX schema validation issues. */
  private static getCAEXSchemaValidationIssues(doc: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      if (isNullOrEmpty(doc.caexFile!.schemaVersion)) {
        const validationKey = new ValidationKey(ValidatorService.noschemakey, ValidationTypeEnum.AutomationMLMetaDataValidation);
        yield newValidationElement((doc.caexFile as CAEXWrapper).node!, validationKey, {
          validatedAttribute: 'SchemaVersion',
          availableRepairOptions: RepairTypeEnum.SetSchemaVersion,
          longDescription: generateLongDescription
            ? "Each CAEX document shall specify which CAEX version it requires. The version number of a CAEX document shall be stored in the 'SchemaVersion' root Attribute."
            : '',
          validationInformation: 'Undefined schema version',
        });
      } else if (doc.schema === CAEXDocument_CAEXSchema.Unknown || doc.schemaVersionString !== doc.caexFile!.schemaVersion) {
        const validationKey2 = new ValidationKey(ValidatorService.invalidschemakey, ValidationTypeEnum.AutomationMLMetaDataValidation);
        yield newValidationElement((doc.caexFile as CAEXWrapper).node!, validationKey2, {
          validatedAttribute: 'SchemaVersion',
          availableRepairOptions: RepairTypeEnum.SetSchemaVersion,
          longDescription: generateLongDescription
            ? "Each CAEX document shall specify which CAEX version it requires. The version number of a CAEX document doesn't fit to the version number specified in the CAEX schema file."
            : '',
          validationInformation: 'Invalid schema version',
        });
      }
    });
  }

  /** Gets the external reference validation issues. */
  private static getExternalReferenceValidationIssues(
    doc: CAEXDocument,
    container: AutomationMLContainer | null,
    generateLongDescription = false,
  ): Enumerable<ValidationElement> {
    return seq(function* () {
      const enumerable = from<ExternalReferenceType>(doc.caexFile!.externalReference)
        .select((e) => e.alias)
        .distinct();
      for (const item of enumerable) {
        for (const item2 of ValidatorService.validateExternalReference(doc.caexFile!, container, item, generateLongDescription)) {
          yield item2;
        }
      }
    });
  }

  /** Gets the ID reference validation issues containing illegal, ambiguous or undefined object IDs. */
  private static getIDReferenceValidationIssues(doc: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      const lookup = ServiceLocator.queryService.allElementsWithIDReference(doc.caexFile as CAEXBasicObject, '');
      for (const item of lookup) {
        const key = item.key;
        const list: ICAEXReference[] = [];
        list.push(...item);
        for (const item2 of ValidatorService.validateIDReference(doc, key, list, generateLongDescription)) {
          yield item2;
        }
      }
    });
  }

  /** Gets the external interface validation issues related to restricted InternalLink relations. */
  private static getExternalInterfaceValidationIssues(doc: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      const enumerable = CAEXBasicObjectExtensions.descendants(doc.caexFile as CAEXWrapper, ExternalInterfaceType);
      for (const externalInterface of enumerable) {
        for (const item of ValidatorService.validateCardinality(externalInterface, generateLongDescription)) {
          yield item;
        }
        for (const item2 of ValidatorService.validateDirection(externalInterface, generateLongDescription)) {
          yield item2;
        }
        for (const item3 of ValidatorService.validateCategory(externalInterface, generateLongDescription)) {
          yield item3;
        }
      }
    });
  }

  private static filePathFromValue(path: string | null, directory: string): string {
    if (isNullOrEmpty(path)) {
      return '';
    }
    // Without a file system File.Exists is false, so every path below ends with ''.
    if (Path.tryGetFs() === null) {
      return '';
    }
    path = path.replace(/^\/+/, '');
    let result = Uri.tryCreate(path, UriKind.RelativeOrAbsolute);
    if (result === null) {
      return '';
    }
    if (result.isAbsoluteUri || (result = Uri.tryCreate(Path.getFullPath(Path.combine(directory, path)), UriKind.RelativeOrAbsolute)) !== null) {
      if (result.isAbsoluteUri && equalsOrdinalIgnoreCase(result.scheme, 'file')) {
        if (!isNullOrEmpty(result.localPath)) {
          if (!fileExists(result.localPath)) {
            return '';
          }
          return result.localPath;
        }
        return '';
      }
      return '';
    }
    return '';
  }

  private static getExternalDataReferenceValidationIssues(
    doc: CAEXDocument,
    container: AutomationMLContainer | null,
    generateLongDescription = false,
  ): Enumerable<ValidationElement> {
    return seq(function* () {
      const enumerable = from(ServiceLocator.queryService.allExternalDataReferences(doc, null))
        .where((ext) => {
          const refURIAttribute3 = ExternalInterfaceType.op_Implicit(ext)!.refURIAttribute;
          return AutomationMLInterfaceClassLib.isExternalDataConnector(ext) && !CAEXWrapper.equals(refURIAttribute3, null) && refURIAttribute3!.isFile();
        })
        .groupBy((extRef) => ExternalInterfaceType.op_Implicit(extRef)!.refURIAttribute!.filePath);
      for (const group of enumerable) {
        const refURIAttribute = ExternalInterfaceType.op_Implicit(group.first())!.refURIAttribute!;
        const filePath = refURIAttribute.filePath;
        const message = '';
        if (refURIAttribute.theUri == null || ValidatorService.canLocateFile(container, doc.caexFile, filePath, message).result) {
          continue;
        }
        for (const item of group) {
          const refURIAttribute2 = ExternalInterfaceType.op_Implicit(item)!.refURIAttribute!;
          const validationKey = new ValidationKey(group.key, ValidationTypeEnum.FileReferenceValidation);
          const validationElement = newValidationElement(refURIAttribute2.node!, validationKey, {
            validatedAttribute: refURIAttribute2.name,
          });
          let text: string | null = null;
          if (!isNullOrEmpty(refURIAttribute2.caexDocument!.filePath)) {
            const result = Uri.tryCreate(refURIAttribute2.caexDocument!.filePath, UriKind.Absolute);
            if (result !== null) {
              text = Path.getDirectoryName(result.localPath);
            }
          }
          if (generateLongDescription) {
            validationElement.longDescription = `The URI ${refURIAttribute2.value ?? ''}, defined in ${CAEXBasicObjectExtensions.name_(refURIAttribute2.caexParent) ?? ''} cannot be resolved to an existing local file.`;
          }
          if (!isNullOrEmpty(text)) {
            const text2 = ValidatorService.filePathFromValue(refURIAttribute2.filePath, text);
            if (!isNullOrEmpty(text2) && fileExists(text2)) {
              validationElement.longDescription =
                'The URL ' + (refURIAttribute2.value ?? '') + ' is not a valid file URL. A local file could be identified at a relative position.';
              validationElement.availableRepairOptions |= RepairTypeEnum.ChangeFileURL;
            }
          }
          validationElement.validationInformation =
            validationElement.availableRepairOptions === RepairTypeEnum.None ? 'unresolved external File reference' : 'invalid usage of file URL';
          yield validationElement;
        }
      }
    });
  }

  /**
   * Gets all ID validation issues for the provided document.
   * @param strictIDValidation if set to `false`, an undefined ID of an InternalElement or
   * ExternalInterface in a class gives a warning only.
   */
  private static getIDValidationIssues(doc: CAEXDocument, generateLongDescription = false, strictIDValidation = true): Enumerable<ValidationElement> {
    return seq(function* () {
      const lookup = ServiceLocator.queryService.allElementsWithIDs(doc.caexFile as CAEXBasicObject, '');
      for (const elementIDs of lookup) {
        const validationKey = new ValidationKey(elementIDs.key, ValidationTypeEnum.IDValidation);
        const items = elementIDs.toList();
        for (const item of from(items).where((item) => !CAEXWrapper.equals(item.caexObject, null))) {
          if (isNullOrWhiteSpace(elementIDs.key)) {
            if (!XmlCAEXSchema.isSystemUnitClass(item.caexObject!.node!)) {
              if (!strictIDValidation && ValidatorService.isInstanceInClass(item.caexObject!)) {
                yield newValidationElement(item.caexObject!.node!, validationKey, {
                  validatedAttribute: 'ID',
                  validationInformation: 'warning:\n undefined ID',
                  longDescription: generateLongDescription
                    ? 'this instance is a class element and will get an automatically generated ID, when the class gets instantiated.'
                    : '',
                  availableRepairOptions: isNullOrEmpty((item.caexObject as CAEXObject).id)
                    ? RepairTypeEnum.GenerateUniqueIDWhenEmpty
                    : RepairTypeEnum.GenerateValidGUID,
                });
              } else {
                yield newValidationElement(item.caexObject!.node!, validationKey, {
                  validatedAttribute: 'ID',
                  validationInformation: 'undefined ID',
                  longDescription: generateLongDescription ? 'this instance should have a unique ID.' : '',
                  availableRepairOptions: isNullOrEmpty((item.caexObject as CAEXObject).id)
                    ? RepairTypeEnum.GenerateUniqueIDWhenEmpty
                    : RepairTypeEnum.GenerateValidGUID,
                });
              }
            }
          } else if (!StringExtensions.isGUID(elementIDs.key, true) && AmlObjectsExtensions.isAMLObject(item.caexObject)) {
            yield newValidationElement(item.caexObject!.node!, validationKey, {
              validatedAttribute: 'ID',
              validationInformation: 'incorrectly formatted ID',
              longDescription: generateLongDescription ? 'The ID ' + elementIDs.key + ' is not recognized as a valid ID for an AML object.' : '',
              availableRepairOptions: RepairTypeEnum.GenerateValidGUID,
            });
          } else if (!CAEXPathBuilder.isValidAttributeReferenceID(elementIDs.key, doc)) {
            const text = CAEXPathBuilder.containsPathSeparatorChars(elementIDs.key, doc)
              ? 'ID should not contain path separator chars'
              : 'ID should not be equal to a name of a library';
            yield newValidationElement(item.caexObject!.node!, validationKey, {
              validatedAttribute: 'ID',
              validationInformation: text,
              longDescription: generateLongDescription ? `The ${elementIDs.key} ${text}.` : '',
              availableRepairOptions: RepairTypeEnum.GenerateValidGUID,
            });
          } else if (items.length > 1) {
            yield newValidationElement(item.caexObject!.node!, validationKey, {
              validatedAttribute: 'ID',
              validationInformation: 'not unique ID',
              longDescription: generateLongDescription ? `The ID ${elementIDs.key} is used by ${items.length} elements.` : '',
              availableRepairOptions: RepairTypeEnum.GenerateUniqueIDForDoubles,
            });
          }
        }
      }
    });
  }

  /** Gets all name validation issues for the provided document. */
  private static getNameValidationIssues(doc: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      const enumerable = (doc.caexFile as CAEXWrapper).node!.descendants();
      for (const item of enumerable) {
        if (XmlCAEXSchema.isCAEXClass(item, true)) {
          continue;
        }
        const xAttribute = item.attribute('Name');
        if (xAttribute == null) {
          continue;
        }
        if (isNullOrEmpty(xAttribute.value)) {
          const validationKey = new ValidationKey(xAttribute.value, ValidationTypeEnum.NameValidation);
          yield newValidationElement(item, validationKey, {
            validatedAttribute: 'Name',
            validationInformation: 'The element shall have a defined name',
            longDescription: generateLongDescription ? 'No Name defined.' : '',
            availableRepairOptions: RepairTypeEnum.GenerateNameWhenEmpty,
          });
          continue;
        }
        let text: string | null = null;
        try {
          XmlConvert.verifyXmlChars(xAttribute.value);
        } catch (ex) {
          if (!(ex instanceof XmlException)) {
            throw ex;
          }
          text = ex.message;
        }
        if (text != null) {
          const validationKey2 = new ValidationKey(xAttribute.value, ValidationTypeEnum.NameValidation);
          yield newValidationElement(item, validationKey2, {
            validatedAttribute: 'Name',
            validationInformation: 'Name contains invalid xml charachters',
            longDescription: generateLongDescription ? text : '',
            availableRepairOptions: RepairTypeEnum.GenerateXmlName,
          });
        } else if (ValidatorService.elementNameShallBeUnique(item) && ValidatorService.nameIsUsed(item, xAttribute.value)) {
          const validationKey3 = new ValidationKey(xAttribute.value, ValidationTypeEnum.NameValidation);
          yield newValidationElement(item, validationKey3, {
            validatedAttribute: 'Name',
            validationInformation: 'Name shall be unique across all siblings',
            longDescription: generateLongDescription ? 'The Name ' + xAttribute.value + ' is used several times.' : '',
            availableRepairOptions: RepairTypeEnum.GenerateUniqueName,
          });
        }
      }
    });
  }

  /** Determines whether the object is an InternalElement, or an ExternalInterface in a class. */
  private static isInstanceInClass(obj: CAEXBasicObject): boolean {
    if (!(obj instanceof InternalElementType)) {
      if (obj instanceof ExternalInterfaceType) {
        return from(obj.node!.ancestors()).any((n) => XmlCAEXSchema.isCAEXClass(n, false));
      }
      return false;
    }
    return true;
  }

  /** Gets the meta data validation issues for the specified document. */
  private static getMetaDataValidationIssues(doc: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      for (const automationMLVersionValidationIssue of ValidatorService.getAutomationMLVersionValidationIssues(doc, generateLongDescription)) {
        yield automationMLVersionValidationIssue;
      }
      const writerHeaderValidationIssues = ValidatorService.getWriterHeaderValidationIssues(doc);
      if (writerHeaderValidationIssues != null) {
        yield writerHeaderValidationIssues;
      }
      for (const cAEXSchemaValidationIssue of ValidatorService.getCAEXSchemaValidationIssues(doc, generateLongDescription)) {
        yield cAEXSchemaValidationIssue;
      }
    });
  }

  /** Gets the validation issues for elements which reference another element using a CAEX path. */
  private static getPathReferenceValidationIssues(doc: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      const lookup = ServiceLocator.queryService.allElementsWithCAEXPathReference(doc.caexFile as CAEXBasicObject, '', false);
      for (const item of lookup) {
        const key = item.key;
        const list: ICAEXReference[] = [];
        list.push(...item);
        for (const item2 of ValidatorService.validatePathReference(doc, key, list, generateLongDescription)) {
          yield item2;
        }
      }
    });
  }

  private static getNameReferenceValidationIssues(doc: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      const lookup = ServiceLocator.queryService.allElementsWithNameReference(doc.caexFile as CAEXBasicObject, '');
      for (const item of lookup) {
        const key = item.key;
        const list: ICAEXReference[] = [];
        list.push(...item);
        for (const item2 of ValidatorService.validateNameReference(key, list, generateLongDescription)) {
          yield item2;
        }
      }
    });
  }

  private static validateNameReference(key: string | null, items: Iterable<ICAEXReference>, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      for (const item of items) {
        if (CAEXWrapper.equals(item.caexObject, null)) {
          continue;
        }
        let validationKey: ValidationKey | null = null;
        let text = '';
        const caexObject = item.caexObject;
        const val = caexObject instanceof InterfaceNameMappingType ? caexObject : null;
        if (val == null) {
          const val2 = caexObject instanceof AttributeNameMappingType ? caexObject : null;
          if (val2 != null) {
            const referenceAttributeName = item.referenceAttributeName;
            if (!(referenceAttributeName === 'RoleAttributeName')) {
              if (referenceAttributeName === 'SystemUnitAttributeName') {
                if (!CAEXWrapper.equals(val2.systemUnitClassElement, null) || isNullOrEmpty(val2.systemUnitClassElementIdentifier)) {
                  continue;
                }
                validationKey = new ValidationKey(key, ValidationTypeEnum.SystemUnitClassAttributeReferenceValidation);
                text = 'SystemUnitClass Attribute reference in AttributeNameMapping';
              }
            } else {
              if (!CAEXWrapper.equals(val2.roleClassElement, null) || isNullOrEmpty(val2.roleClassElementIdentifier)) {
                continue;
              }
              validationKey = new ValidationKey(key, ValidationTypeEnum.RoleAttributeReferenceValidation);
              text = 'RoleClass Attribute reference in AttributeNameMapping';
            }
          }
        } else {
          const referenceAttributeName = item.referenceAttributeName;
          if (!(referenceAttributeName === 'RoleInterfaceName')) {
            if (referenceAttributeName === 'SystemUnitInterfaceName') {
              if (!CAEXWrapper.equals(val.systemUnitClassElement, null) || isNullOrEmpty(val.systemUnitClassElementIdentifier)) {
                continue;
              }
              validationKey = new ValidationKey(key, ValidationTypeEnum.SystemUnitClassInterfaceReferenceValidation);
              text = 'SystemUnitClass Interface reference in InterfaceNameMapping';
            }
          } else {
            if (!CAEXWrapper.equals(val.roleClassElement, null) || isNullOrEmpty(val.roleClassElementIdentifier)) {
              continue;
            }
            validationKey = new ValidationKey(key, ValidationTypeEnum.RoleInterfaceReferenceValidation);
            text = 'RoleClass Interface reference in InterfaceNameMapping';
          }
        }
        if (validationKey != null) {
          yield newValidationElement(item.caexObject!.node!, validationKey, {
            availableRepairOptions: RepairTypeEnum.RemoveUnresolvedNameReference,
            validatedAttribute: item.referenceAttributeName,
            validationInformation: 'unresolved ' + text,
            longDescription: generateLongDescription
              ? `The ${validationKey.key ?? ''} found in ${item.referenceAttributeName ?? ''} cannot be resolved to a valid element.`
              : null,
          });
        }
      }
    });
  }

  /** Gets the validation issues for elements which should be identifiable with a CAEX path. */
  private static getPathValidationIssues(doc: CAEXDocument, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      const lookup = ServiceLocator.queryService.allElementsIdentifiedByCAEXPath(doc.caexFile as CAEXBasicObject);
      for (const pathElement of lookup) {
        const validationKey = new ValidationKey(pathElement.key, ValidationTypeEnum.ClassPathValidation);
        const list = pathElement.toList();
        if (isNullOrEmpty(pathElement.key)) {
          const issues = from(list)
            .where((item) => !CAEXWrapper.equals(item.caexObject, null))
            .select((item) =>
              newValidationElement(item.caexObject!.node!, validationKey, {
                availableRepairOptions: RepairTypeEnum.GenerateNameWhenEmpty,
                validatedAttribute: 'Name',
                validationInformation: 'undefined Name',
                longDescription: generateLongDescription
                  ? `Missing name in ${item.caexObject!.tagName ?? ''} of ${item.caexObject!.caexParent!.tagName ?? ''}.`
                  : null,
              }),
            );
          for (const item of issues) {
            yield item;
          }
        } else {
          if (list.length <= 1) {
            continue;
          }
          // GetType() of the CAEX object (a null CaexObject throws, as in C#).
          const enumerable = from(list).groupBy((s) => (s.caexObject as object).constructor);
          for (const item2 of enumerable) {
            const list2 = item2.toList();
            if (list2.length <= 1) {
              continue;
            }
            let option: RepairTypeEnum = RepairTypeEnum.None;
            if (
              !isNullOrWhiteSpace(pathElement.key) &&
              !from(ServiceLocator.queryService.elementsWithCAEXPathReference(doc.caexFile, pathElement.key, '')).any()
            ) {
              option = RepairTypeEnum.RenameClassPathForDoubles;
            }
            const issues = from(list2).select((item) =>
              newValidationElement(item.caexObject!.node!, validationKey, {
                availableRepairOptions: option,
                validatedAttribute: 'Name',
                validationInformation: 'not a unique CAEX path',
                longDescription: generateLongDescription ? 'The path ' + pathElement.key + ' has multiple possible identified targets.' : null,
              }),
            );
            for (const item3 of issues) {
              yield item3;
            }
          }
        }
      }
    });
  }

  /** Gets the validation issue for missing source document or writer header information, or `null`. */
  private static getWriterHeaderValidationIssues(doc: CAEXDocument): ValidationElement | null {
    if (doc.schema === CAEXDocument_CAEXSchema.CAEX2_15) {
      const validationKey = new ValidationKey('WriterHeader', ValidationTypeEnum.AutomationMLMetaDataValidation);
      if (from(AmlObjectsExtensions.getMetaInformation(doc.caexFile)).firstOrDefault() != null) {
        return null;
      }
      return newValidationElement((doc.caexFile as CAEXWrapper).node!, validationKey, {
        validatedAttribute: 'WriterHeader',
        availableRepairOptions: RepairTypeEnum.CreateWriterHeader,
        validationInformation: 'undefined writer header',
      });
    }
    const validationKey2 = new ValidationKey('SourceDocumentInformation', ValidationTypeEnum.AutomationMLMetaDataValidation);
    if (doc.caexFile!.sourceDocumentInformation.count !== 0) {
      return null;
    }
    return newValidationElement((doc.caexFile as CAEXWrapper).node!, validationKey2, {
      validatedAttribute: 'SourceDocumentInformation',
      availableRepairOptions: RepairTypeEnum.CreateSourceDocumentInformation,
      validationInformation: 'undefined source information',
    });
  }

  /**
   * Validates the alias references with the alias (a path which contains an alias) and returns the
   * validated elements.
   */
  private static validateAliasReference(
    doc: CAEXDocument,
    alias: string,
    items: Iterable<ICAEXReference>,
    generateLongDescription = false,
  ): ValidationElement[] {
    alias = alias.replace(/@+$/, '');
    if (from<ExternalReferenceType>(doc.caexFile!.externalReference).any((ex) => ex.alias === alias)) {
      return [];
    }
    const validationKey = new ValidationKey(alias, ValidationTypeEnum.MissingAliasReferenceValidation);
    const list: ValidationElement[] = [];
    for (const item of items) {
      if (CAEXWrapper.equals(item.caexObject, null)) {
        continue;
      }
      const validationElement = newValidationElement(item.caexObject!.node!, validationKey, {
        validatedAttribute: item.referenceAttributeName,
        validationInformation: 'alias reference not defined in external reference',
        longDescription: generateLongDescription ? 'The document contains no external reference defining the alias ' + alias + '.' : null,
      });
      const text = item.caexObject!.node!.attribute(item.referenceAttributeName as string)?.value ?? null;
      if (!isNullOrEmpty(text)) {
        const text2 = text.replaceAll(alias + '@', '');
        if (
          !CAEXWrapper.equals(CAEXDocumentExtensions.findByPath(doc, text2, true, null), null) ||
          (CAEXPathBuilder.isValidAttributeReferenceID(text2, doc) && !CAEXWrapper.equals(CAEXDocumentExtensions.findByID(doc, text2, true, null), null))
        ) {
          validationElement.validationInformation = 'removable alias';
          validationElement.availableRepairOptions = RepairTypeEnum.RemoveAlias;
        } else {
          validationElement.availableRepairOptions = RepairTypeEnum.PathReferenceOption;
        }
        list.push(validationElement);
      }
    }
    return list;
  }

  /** Validates the external references with the alias. */
  private static validateExternalReference(
    caexFile: CAEXFileType,
    container: AutomationMLContainer | null,
    alias: string | null,
    generateLongDescription = false,
  ): Enumerable<ValidationElement> {
    return seq(function* () {
      const externalReferenceWithSameAlias = from<ExternalReferenceType>(caexFile.externalReference)
        .where((e) => e.alias === alias)
        .toList();
      if (isNullOrEmpty(alias) || externalReferenceWithSameAlias.length > 1) {
        const validationKey = new ValidationKey(isNullOrEmpty(alias) ? ValidatorService.nonamekey : alias, ValidationTypeEnum.AliasValidation);
        const longDescription =
          validationKey.key === ValidatorService.nonamekey
            ? 'No alias name defined for the external reference.'
            : 'The alias name of an external reference has to be unique and shall not contain names of CAEX objects.';
        const issues = from(externalReferenceWithSameAlias).select((referenceType) =>
          newValidationElement(referenceType.node!, validationKey, {
            validatedAttribute: 'Alias',
            availableRepairOptions: validationKey.key === ValidatorService.nonamekey ? RepairTypeEnum.GenerateNameWhenEmpty : RepairTypeEnum.None,
            validationInformation: validationKey.key === ValidatorService.nonamekey ? 'undefined alias' : 'alias is not unique',
            longDescription: generateLongDescription ? longDescription : '',
          }),
        );
        for (const item of issues) {
          yield item;
        }
      }
      for (const extReference of externalReferenceWithSameAlias) {
        const fileRef = extReference.path;
        let message = "can't resolve reference " + (fileRef ?? '') + ' to an existing file';
        if (!isNullOrEmpty(fileRef)) {
          if (!extReference.isVersionReference) {
            const val = new AMLFileMetaModel(fileRef, AMLFileContentType.LibraryFile);
            if (
              !isNullOrEmpty(val.edition) &&
              !val.isDocumentEdition(AmlObjectsExtensions.automationMLVersion(CAEXBasicObjectExtensions.caexDocument(caexFile)))
            ) {
              const validationKey2 = new ValidationKey(val.edition, ValidationTypeEnum.FileReferenceValidation);
              yield newValidationElement(extReference.node!, validationKey2, {
                validatedAttribute: 'Path',
                availableRepairOptions: RepairTypeEnum.None,
                validationInformation: 'Reference to wrong AutomationML edition.',
                longDescription: generateLongDescription
                  ? `The documents edition is different from the referenced file ${val.fileName ?? ''} ${val.edition ?? ''}.`
                  : '',
              });
            }
          }
          const located = ValidatorService.canLocateFile(container, caexFile, fileRef, message);
          message = located.message;
          if (located.result) {
            continue;
          }
        }
        const validationKey3 = new ValidationKey(isNullOrEmpty(alias) ? ValidatorService.nonamekey : alias, ValidationTypeEnum.FileReferenceValidation);
        yield newValidationElement(extReference.node!, validationKey3, {
          validatedAttribute: 'Path',
          validationInformation: message,
          longDescription: generateLongDescription
            ? 'The path value could not be resolved to an external source. A path shall contain an URI which shall be resolvable to an absolute or relative source.'
            : '',
        });
      }
    });
  }

  /** Validates the cardinality of an external interface. */
  private static validateCardinality(externalInterface: ExternalInterfaceType, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      if (ExternalInterfaceTypeExtensions.hasVerifiableCardinality(externalInterface)) {
        if (ExternalInterfaceTypeExtensions.maxCardinalityViolation(externalInterface)) {
          const validationKey = new ValidationKey(externalInterface.name, ValidationTypeEnum.CardinalityValidation);
          const text = `The allowed maximal number of internal links, set as ${ExternalInterfaceTypeExtensions.maxCardinality(externalInterface) ?? ''} is violated`;
          yield newValidationElement(externalInterface.node!, validationKey, {
            validatedAttribute: 'Cardinality',
            availableRepairOptions: RepairTypeEnum.None,
            validationInformation: 'The maximum allowed number of internal links is violated',
            longDescription: generateLongDescription ? text : '',
          });
        }
        if (ExternalInterfaceTypeExtensions.minCardinalityViolation(externalInterface)) {
          const validationKey2 = new ValidationKey(externalInterface.name, ValidationTypeEnum.CardinalityValidation);
          const text2 = `The allowed minimum number of internal links, set as ${ExternalInterfaceTypeExtensions.minCardinality(externalInterface) ?? ''} is violated`;
          yield newValidationElement(externalInterface.node!, validationKey2, {
            validatedAttribute: 'Cardinality',
            availableRepairOptions: RepairTypeEnum.None,
            validationInformation: 'The minimum allowed number of internal links is violated',
            longDescription: generateLongDescription ? text2 : '',
          });
        }
      }
    });
  }

  /** Validates the direction of the internal links of an external interface. */
  private static validateDirection(externalInterface: ExternalInterfaceType, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      if (ExternalInterfaceTypeExtensions.hasVerifiableDirection(externalInterface)) {
        const violation = ExternalInterfaceTypeExtensions.directionViolation(externalInterface);
        if (violation.result) {
          const value = violation.requiredDirections;
          const validationKey = new ValidationKey(externalInterface.name, ValidationTypeEnum.DirectionValidation);
          const text = `An internal link with '${ExternalInterfaceTypeExtensions.direction(externalInterface) ?? ''}' direction should be directed to an interface defining one of ${value.join(';')} directions.`;
          yield newValidationElement(externalInterface.node!, validationKey, {
            validatedAttribute: 'Direction',
            availableRepairOptions: RepairTypeEnum.None,
            validationInformation: 'An internal link relation does not specify the required direction.',
            longDescription: generateLongDescription ? text : '',
          });
        }
      }
    });
  }

  /** Validates the category of the internal links of an external interface. */
  private static validateCategory(externalInterface: ExternalInterfaceType, generateLongDescription = false): Enumerable<ValidationElement> {
    return seq(function* () {
      if (ExternalInterfaceTypeExtensions.hasVerifiableCategory(externalInterface) && ExternalInterfaceTypeExtensions.categoryViolation(externalInterface)) {
        const validationKey = new ValidationKey(externalInterface.name, ValidationTypeEnum.CategoryValidation);
        const text = "Internal links are defined with not matching categories '" + ExternalInterfaceTypeExtensions.categories(externalInterface).join(';') + "'.";
        yield newValidationElement(externalInterface.node!, validationKey, {
          validatedAttribute: 'Category',
          availableRepairOptions: RepairTypeEnum.None,
          validationInformation: 'An internal link relation does not specify the required category.',
          longDescription: generateLongDescription ? text : '',
        });
      }
    });
  }

  private static canLocateExternalFileReference(fileRef: string): boolean {
    const result = Uri.tryCreate(fileRef, UriKind.Absolute);
    if (result !== null) {
      if (result.scheme === 'http' || result.scheme === 'https') {
        // C# blocks on ExternalReferenceResolver.GetResponseFromWebServerAsync(uri).Result inside
        // a try block whose catch returns false. A synchronous request is not possible in
        // JavaScript; the port takes the path of a failing request.
        return false;
      }
      if (result.scheme === 'ftp') {
        // FtpWebRequest is not supported. In C# a failing GetResponse throws out of this method
        // (there is no catch block), so the port throws as well.
        throw new NotSupportedException(`Synchronous network access to '${fileRef}' is not possible.`);
      }
    }
    return false;
  }

  private static escapeFilePath(filePath: string): string {
    return Uri.escapeDataString(filePath).replaceAll('%2F', '/');
  }

  /**
   * @internal Determines whether the file reference can be located: in the container if one is
   * given, otherwise as a file (relative to the document) or by its URL. `ref message` in C#:
   * returns the result and the (possibly changed) message.
   */
  static canLocateFile(
    container: AutomationMLContainer | null,
    caexFile: CAEXFileType | null,
    fileRef: string | null,
    message: string,
  ): { result: boolean; message: string } {
    if (isNullOrWhiteSpace(fileRef)) {
      message = 'file reference is empty';
      return { result: false, message };
    }
    let reference = fileRef as string;
    if (container == null) {
      const result = Uri.tryCreate(reference, UriKind.RelativeOrAbsolute);
      if (result !== null) {
        if (result.isAbsoluteUri) {
          if (result.scheme === 'file') {
            if (fileExists(result.localPath)) {
              return { result: true, message };
            }
            message = 'file not found: ' + result.localPath;
            return { result: false, message };
          }
          if (!ValidatorService.canLocateExternalFileReference(reference)) {
            message = "can't resolve path reference " + reference + '  to an existing file';
            return { result: false, message };
          }
          return { result: true, message };
        }
        const text = ValidatorService.normalizeFilePath(reference, caexFile);
        if (fileExists(text)) {
          return { result: true, message };
        }
        message = 'file not found: ' + text;
        return { result: false, message };
      }
      message = 'no valid uri: ' + reference;
      return { result: false, message };
    }
    if (!cultureStartsWith(reference, '/')) {
      reference = '/' + reference;
    }
    let result2 = Uri.tryCreate(reference, UriKind.Relative);
    if (result2 !== null) {
      if (container.getPart(result2) != null) {
        return { result: true, message };
      }
      if ((result2 = Uri.tryCreate(ValidatorService.escapeFilePath(reference), UriKind.Relative)) !== null && container.getPart(result2) != null) {
        return { result: true, message };
      }
      message = `part not found in AML Container: ${result2?.toString() ?? ''}`;
      return { result: false, message };
    }
    if (!ValidatorService.canLocateExternalFileReference(reference)) {
      message = "can't resolve path reference " + reference + '  to an existing file';
      return { result: false, message };
    }
    message = 'reference should be a container part: ' + reference;
    return { result: false, message };
  }

  /** Validates the ID references to the ID `idReference`. */
  private static validateIDReference(
    doc: CAEXDocument,
    idReference: string | null,
    items: Iterable<ICAEXReference>,
    generateLongDescription = false,
  ): Enumerable<ValidationElement> {
    return seq(function* () {
      const validationKey = new ValidationKey(idReference, ValidationTypeEnum.IDReferenceValidation);
      if (isNullOrEmpty(idReference)) {
        for (const item2 of items) {
          if (CAEXWrapper.equals(item2.caexObject, null)) {
            continue;
          }
          const validate = newValidationElement(item2.caexObject!.node!, validationKey, {
            validatedAttribute: item2.referenceAttributeName,
          });
          const xAttributeValue = item2.caexObject!.getXAttributeValue(item2.referenceAttributeName as string);
          validate.availableRepairOptions |= isNullOrEmpty(xAttributeValue) ? RepairTypeEnum.RemoveEmptyReference : RepairTypeEnum.RemoveUnresolvedIDReference;
          validate.validationInformation = isNullOrEmpty(xAttributeValue) ? 'undefined ID' : 'unresolvable ID';
          if (generateLongDescription) {
            validate.longDescription = isNullOrEmpty(xAttributeValue)
              ? 'An ' + (item2.referenceAttributeName ?? '') + ' reference was expected for this CAEX element, but is not defined.'
              : 'The given ' + (item2.referenceAttributeName ?? '') + " couldn't be resolved to an existing CAEX element.";
          }
          const caexObject = item2.caexObject;
          if (!(caexObject instanceof ExternalInterfaceType) && !(caexObject instanceof InternalElementType)) {
            if (caexObject instanceof InternalLinkType || caexObject instanceof InterfaceIDMappingType) {
              validate.availableRepairOptions |= RepairTypeEnum.RemoveElement;
            }
          } else if (!from(ServiceLocator.queryService.elementsWithIDReference(item2.caexObject, xAttributeValue, '')).any()) {
            validate.availableRepairOptions |= RepairTypeEnum.RemoveElement;
          }
          yield validate;
        }
        return;
      }
      const identifiedObject = CAEXDocumentExtensions.findByID(doc, idReference, true, null);
      if (CAEXWrapper.equals(identifiedObject, null)) {
        for (const item3 of items) {
          if (CAEXWrapper.equals(item3.caexObject, null)) {
            continue;
          }
          const validate = newValidationElement(item3.caexObject!.node!, validationKey, {
            validatedAttribute: item3.referenceAttributeName,
          });
          validate.availableRepairOptions |= RepairTypeEnum.IDReferenceOption;
          validate.validationInformation = 'unresolvable ID';
          if (generateLongDescription) {
            validate.longDescription = 'The given ' + (item3.referenceAttributeName ?? '') + " couldn't be resolved to an existing CAEX element.";
          }
          const xAttributeValue2 = item3.caexObject!.getXAttributeValue(item3.referenceAttributeName as string);
          const caexObject = item3.caexObject;
          if (!(caexObject instanceof ExternalInterfaceType) && !(caexObject instanceof InternalElementType)) {
            if (caexObject instanceof InternalLinkType || caexObject instanceof InterfaceIDMappingType) {
              validate.availableRepairOptions |= RepairTypeEnum.RemoveElement;
            }
          } else if (!from(ServiceLocator.queryService.elementsWithIDReference(item3.caexObject, xAttributeValue2, '')).any()) {
            validate.availableRepairOptions |= RepairTypeEnum.RemoveElement;
          }
          yield validate;
        }
        return;
      }
      const identified = identifiedObject!;
      const val2 = CAEXBasicObjectExtensions.library(identified);
      const masterParent: CAEXWrapper | null =
        val2 instanceof SystemUnitClassLibType
          ? CAEXBasicObjectExtensions.firstAncestor(identified, SystemUnitFamilyType)
          : CAEXBasicObjectExtensions.firstAncestor(identified, InterfaceFamilyType);
      for (const item of items) {
        if (CAEXWrapper.equals(item.caexObject, null)) {
          continue;
        }
        const validate = newValidationElement(item.caexObject!.node!, validationKey, {
          validatedAttribute: item.referenceAttributeName,
        });
        if (!CAEXWrapper.equals(masterParent, null)) {
          const obj = CAEXBasicObjectExtensions.firstAncestor(item.caexObject!, masterParent!.tagName as string);
          const val3 = obj instanceof CAEXBasicObject ? obj : null;
          if (!CAEXWrapper.equals(masterParent, val3)) {
            validate.availableRepairOptions |= RepairTypeEnum.IDReferenceOption | RepairTypeEnum.RemoveElementNotInScope;
            const caexObject2 = item.caexObject;
            validate.validationInformation = ((caexObject2 != null ? caexObject2.tagName : null) ?? '') + ' has reference to an object out of allowed scope';
            if (generateLongDescription) {
              validate.longDescription =
                'The referenced CAEX-Element via ' +
                (item.referenceAttributeName ?? '') +
                ' is defined outside the class or library bounds of this object which is not allowed.';
            }
            yield validate;
          }
        }
        // Aml.Engine: the checks below can yield the same ValidationElement a second time (with
        // the information text overwritten), after it was yielded for the scope check above.
        const caexObject = item.caexObject;
        if (!(caexObject instanceof InterfaceIDMappingType) && !(caexObject instanceof ExternalInterfaceType)) {
          if (!(caexObject instanceof InternalElementType)) {
            if (!(caexObject instanceof InternalLinkType)) {
              continue;
            }
            if (CAEXBasicObjectExtensions.caexSchema(identified) === CAEXDocument_CAEXSchema.CAEX2_15 && !(identified instanceof SystemUnitClassType)) {
              validate.availableRepairOptions |= RepairTypeEnum.IDReferenceOption;
              validate.validationInformation = 'referenced object is not an InternalElement';
              if (generateLongDescription) {
                validate.longDescription = 'The referenced CAEX-Element is an ' + (identified.tagName ?? '') + ' an not an InternalElement.';
              }
              yield validate;
            } else if (CAEXBasicObjectExtensions.caexSchema(identified) !== CAEXDocument_CAEXSchema.CAEX2_15 && !(identified instanceof ExternalInterfaceType)) {
              validate.availableRepairOptions |= RepairTypeEnum.IDReferenceOption;
              validate.validationInformation = 'referenced object is not an ExternalInterface';
              if (generateLongDescription) {
                validate.longDescription = 'The referenced CAEX-Element is an ' + (identified.tagName ?? '') + ' an not an ExternalInterface.';
              }
              yield validate;
            }
          } else if (!(identified instanceof InternalElementType)) {
            validate.availableRepairOptions |= RepairTypeEnum.IDReferenceOption;
            validate.validationInformation = 'referenced object is not an InternalElement';
            if (generateLongDescription) {
              validate.longDescription = 'The referenced CAEX-Element is an ' + (identified.tagName ?? '') + ' an not an InternalElement.';
            }
            yield validate;
          }
        } else if (!(identified instanceof ExternalInterfaceType)) {
          validate.availableRepairOptions |= RepairTypeEnum.IDReferenceOption;
          validate.validationInformation = 'referenced object is not an ExternalInterface';
          if (generateLongDescription) {
            validate.longDescription = `The referenced CAEX-Element  via ${item.referenceAttributeName ?? ''} is an ${identified.tagName ?? ''} an not an ExternalInterface.`;
          }
          yield validate;
        } else {
          // `item.CaexObject is MappingElementType<ExternalInterfaceType>`: here an InterfaceIDMapping.
          const val4 = item.caexObject;
          if (!(val4 instanceof MappingElementType)) {
            continue;
          }
          const referenceAttributeName = item.referenceAttributeName;
          if (!(referenceAttributeName === 'RoleInterfaceID')) {
            if (referenceAttributeName === 'SystemUnitInterfaceID' && !CAEXWrapper.equals(val4.systemUnitClassElement, null)) {
              continue;
            }
          } else if (!CAEXWrapper.equals(val4.roleClassElement, null)) {
            continue;
          }
          validate.availableRepairOptions |= RepairTypeEnum.IDReferenceOption;
          validate.validationInformation = 'reference to object out of allowed scope';
          if (generateLongDescription) {
            validate.longDescription = 'The referenced ' + (item.referenceAttributeName ?? '') + ' could not be found in the scope of the mapping.';
          }
          yield validate;
        }
      }
    });
  }

  /** Validates the path references to the CAEX path `path`. */
  private static validatePathReference(
    doc: CAEXDocument,
    path: string | null,
    items: Iterable<ICAEXReference>,
    generateLongDescription = false,
  ): Enumerable<ValidationElement> {
    return seq(function* () {
      const validationKey = new ValidationKey(path, ValidationTypeEnum.PathReferenceValidation);
      if (isNullOrEmpty(path)) {
        for (const item of items) {
          if (!CAEXWrapper.equals(item.caexObject, null) && !(item.referenceAttributeName === 'NewVersion') && !(item.referenceAttributeName === 'OldVersion')) {
            const validationElement = newValidationElement(item.caexObject!.node!, validationKey, {
              validatedAttribute: item.referenceAttributeName,
            });
            const xAttributeValue = item.caexObject!.getXAttributeValue(item.referenceAttributeName as string);
            validationElement.availableRepairOptions |= isNullOrEmpty(xAttributeValue)
              ? RepairTypeEnum.RemoveEmptyReference
              : RepairTypeEnum.RemoveUnresolvedPathReference;
            validationElement.validationInformation = isNullOrEmpty(xAttributeValue) ? 'undefined path' : 'unresolvable path';
            if (generateLongDescription) {
              validationElement.longDescription = "The '" + (item.referenceAttributeName ?? '') + "' - Attribute has no value and shall be removed.";
            }
            const caexObject = item.caexObject;
            if (caexObject instanceof RoleRequirementsType || caexObject instanceof SupportedRoleClassType) {
              validationElement.availableRepairOptions |= RepairTypeEnum.RemoveElement;
            }
            yield validationElement;
          }
        }
        return;
      }
      const caexObject2 = CAEXDocumentExtensions.findByPath(doc, path, true, null);
      if (CAEXWrapper.equals(caexObject2, null)) {
        const containsAlias = CAEXPathBuilder.isReferenceWithAlias(path, doc.schema);
        for (const item2 of items) {
          if (CAEXWrapper.equals(item2.caexObject, null)) {
            continue;
          }
          const caexObject3 = item2.caexObject;
          const xElement = caexObject3 != null ? caexObject3.owner : null;
          if ((xElement == null || !((xElement.attribute('Name')?.value ?? null) === validationKey.key)) && !CAEXWrapper.equals(item2.caexObject, null)) {
            const validationElement = newValidationElement(item2.caexObject!.node!, validationKey, {
              validatedAttribute: item2.referenceAttributeName,
              availableRepairOptions: containsAlias ? RepairTypeEnum.CheckAliasInExternalReference : RepairTypeEnum.PathReferenceOption,
              validationInformation: containsAlias ? 'unresolvable path containing alias' : 'unresolvable path',
            });
            if (generateLongDescription) {
              validationElement.longDescription = !containsAlias
                ? `The '${item2.referenceAttributeName ?? ''}' - Attribute value '${path}' does not reference an existing object.`
                : ServiceLocator.externalReferenceResolverService == null
                  ? `The '${item2.referenceAttributeName ?? ''}' - Attribute value '${path}' could not be found in an externally referenced document.\nYou can try again, enabling the ExternalReference Resolver service.`
                  : `The '${item2.referenceAttributeName ?? ''}' - Attribute value '${path}' could not be found in the externally referenced document.`;
            }
            const caexObject = item2.caexObject;
            if (caexObject instanceof RoleRequirementsType || caexObject instanceof SupportedRoleClassType) {
              validationElement.availableRepairOptions |= RepairTypeEnum.RemoveElement;
            }
            yield validationElement;
          }
        }
        return;
      }
      const target = caexObject2!;
      for (const item3 of items) {
        switch (item3.referenceAttributeName) {
          case 'RefAttributeType':
            if (!(target instanceof AttributeFamilyType)) {
              const validationElement = newValidationElement(item3.caexObject!.node!, validationKey, {
                validatedAttribute: item3.referenceAttributeName,
                availableRepairOptions: RepairTypeEnum.PathReferenceOption,
                validationInformation: 'path reference to an attribute expected',
              });
              if (generateLongDescription) {
                validationElement.longDescription = 'The referenced CAEX-Element is an ' + (target.tagName ?? '') + ' an not an Attribute.';
              }
              yield validationElement;
            }
            break;
          case 'RefBaseSystemUnitPath':
            if (!(target instanceof SystemUnitFamilyType)) {
              const validationElement = newValidationElement(item3.caexObject!.node!, validationKey, {
                validatedAttribute: item3.referenceAttributeName,
                availableRepairOptions: RepairTypeEnum.PathReferenceOption,
                validationInformation: 'path reference to a SystemUnit class expected',
              });
              if (generateLongDescription) {
                validationElement.longDescription = 'The referenced CAEX-Element is an ' + (target.tagName ?? '') + ' an not a SystemUnitClass.';
              }
              yield validationElement;
            }
            break;
          case 'RefRoleClassPath':
          case 'RefBaseRoleClassPath':
            if (!(target instanceof RoleFamilyType)) {
              const validationElement = newValidationElement(item3.caexObject!.node!, validationKey, {
                validatedAttribute: item3.referenceAttributeName,
                availableRepairOptions: RepairTypeEnum.PathReferenceOption,
                validationInformation: 'path reference to a role class expected',
              });
              if (generateLongDescription) {
                validationElement.longDescription = 'The referenced CAEX-Element is an ' + (target.tagName ?? '') + ' an not a RoleClass.';
              }
              yield validationElement;
            }
            break;
          case 'RefBaseClassPath': {
            const caexObject = item3.caexObject;
            if (!(caexObject instanceof AttributeFamilyType)) {
              if (!(caexObject instanceof RoleFamilyType)) {
                if (!(caexObject instanceof ExternalInterfaceType) && !(caexObject instanceof InterfaceFamilyType)) {
                  if (caexObject instanceof SystemUnitFamilyType && !(target instanceof SystemUnitFamilyType)) {
                    const validationElement = newValidationElement(item3.caexObject!.node!, validationKey, {
                      validatedAttribute: item3.referenceAttributeName,
                      availableRepairOptions: RepairTypeEnum.PathReferenceOption,
                      validationInformation: 'path reference to a SystemUnit class expected',
                    });
                    if (generateLongDescription) {
                      validationElement.longDescription = 'The referenced CAEX-Element is an ' + (target.tagName ?? '') + ' an not a SystemUnitClass.';
                    }
                    yield validationElement;
                  }
                } else if (!(target instanceof InterfaceFamilyType)) {
                  const validationElement = newValidationElement(item3.caexObject!.node!, validationKey, {
                    validatedAttribute: item3.referenceAttributeName,
                    availableRepairOptions: RepairTypeEnum.PathReferenceOption,
                    validationInformation: 'path reference to an interface class expected',
                  });
                  if (generateLongDescription) {
                    validationElement.longDescription = 'The referenced CAEX-Element is an ' + (target.tagName ?? '') + ' an not an InterfaceClass.';
                  }
                  yield validationElement;
                }
              } else if (!(target instanceof RoleFamilyType)) {
                const validationElement = newValidationElement(item3.caexObject!.node!, validationKey, {
                  validatedAttribute: item3.referenceAttributeName,
                  availableRepairOptions: RepairTypeEnum.PathReferenceOption,
                  validationInformation: 'path reference to a role class expected',
                });
                if (generateLongDescription) {
                  validationElement.longDescription = 'The referenced CAEX-Element is an ' + (target.tagName ?? '') + ' an not a RoleClass.';
                }
                yield validationElement;
              }
            } else if (!(target instanceof AttributeFamilyType)) {
              const validationElement = newValidationElement(item3.caexObject!.node!, validationKey, {
                validatedAttribute: item3.referenceAttributeName,
                availableRepairOptions: RepairTypeEnum.PathReferenceOption,
                validationInformation: 'path reference to an attribute type expected',
              });
              if (generateLongDescription) {
                validationElement.longDescription = 'The referenced CAEX-Element is an ' + (target.tagName ?? '') + ' an not an AttributeType.';
              }
              yield validationElement;
            }
            break;
          }
        }
      }
    });
  }
}

registerInterfaces(ValidatorService, 'IValidator_1', 'IValidator', 'IAMLService');
