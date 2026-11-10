// Port of Aml.Engine.Services.ValidationElement (Aml.Engine.Services 4.3.1).

import '../engine/index.js';
import { registerInterfaces } from '../engine/interfaces.js';
import { DateTime, Guid, XmlConvert } from '../system/index.js';
import { isNullOrEmpty } from '../system/strings.js';
import { AMLFile } from '../engine/amlobjects/AMLFile.js';
import { MetaInformation } from '../engine/amlobjects/MetaInformation.js';
import { AmlObjectsExtensions } from '../engine/amlobjects/extensions/AmlObjectsExtensions.js';
import { AttributeType } from '../engine/caex/AttributeType.js';
import { CAEXBasicObject } from '../engine/caex/CAEXBasicObject.js';
import { CAEXDocument } from '../engine/caex/CAEXDocument.js';
import { CAEXObject } from '../engine/caex/CAEXObject.js';
import { CAEXWrapper } from '../engine/caex/CAEXWrapper.js';
import { CAEXBasicObjectExtensions } from '../engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXPathBuilder } from '../engine/caex/extensions/CAEXPathBuilder.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { XmlCAEXSchema } from '../engine/xmlext/XmlCAEXSchema.js';
import { XmlOperation } from '../engine/xmlext/XmlOperation.js';
import { RepairTypeEnum } from './RepairTypeEnum.js';
import { UniqueNameService } from './UniqueNameService.js';
import type { XElement } from '../xml/index.js';
import type { IUniqueName } from '../engine/services/interfaces/IUniqueName.js';
import type { IValidationResult } from '../engine/services/interfaces/IValidationResult.js';
import type { ValidationKey } from './ValidationKey.js';
import type { ValidationTypeEnum } from './ValidationTypeEnum.js';

/** Enum.HasFlag: all bits of `flag` are set in `value`. */
function hasFlag(value: RepairTypeEnum, flag: RepairTypeEnum): boolean {
  return (value & flag) === flag;
}

/**
 * A validated XML element together with detailed information about the inconsistencies found for
 * it.
 */
export class ValidationElement implements IValidationResult {
  /** Constant string, defining validation elements which are not repaired yet. */
  static readonly NOT_REPAIRED = 'not repaired';

  /** The primary constructor parameter validationKey of the C# class. */
  private readonly _validationKey: ValidationKey;

  private _repairResult: string | null;

  /** Gets the available repair options (internal set in C#). */
  availableRepairOptions: RepairTypeEnum = RepairTypeEnum.None;

  /** Gets the CAEX element wrapper for the XElement. */
  get caexElement(): CAEXBasicObject | null {
    const obj = XmlOperation.createCAEXWrapper(this.element);
    return obj instanceof CAEXBasicObject ? obj : null;
  }

  /** Gets the element which has been validated. */
  readonly element: XElement;

  /** Gets information about the result of a repair operation for one element. */
  get repairResult(): string | null {
    return this._repairResult;
  }

  /** Gets or sets the validated attribute. */
  validatedAttribute: string | null = null;

  /** Gets a short information about the validation of one element. */
  validationInformation: string | null;

  /**
   * Gets a longer description containing more detailed information about a validation issue
   * (generated, if the informative mode is enabled when the validation is performed).
   */
  longDescription: string | null = null;

  /** Gets the type of the validation. */
  get validationType(): ValidationTypeEnum {
    return this._validationKey.validationType;
  }

  /**
   * Initializes a new instance.
   * @param element The element.
   * @param validationKey The validation key.
   */
  constructor(element: XElement, validationKey: ValidationKey) {
    this._validationKey = validationKey;
    this.element = element;
    this._repairResult = 'not repaired';
    this.validationInformation = '';
  }

  /**
   * Checks the validation of the element.
   * @returns `true`, if validated o.k.; otherwise `false`.
   */
  reValidate(): boolean {
    if ((this.availableRepairOptions & RepairTypeEnum.NameDefinitionOption) !== RepairTypeEnum.None) {
      const val = ServiceLocator.beginService<IUniqueName>(UniqueNameService.register, 'IUniqueName').service;
      const flag = val != null ? val.isUniqueCAEXName(this.element) : null;
      ServiceLocator.endService(UniqueNameService.unRegister, val);
      return flag === true;
    }
    if ((this.availableRepairOptions & RepairTypeEnum.PathReferenceOption) === 0) {
      return false;
    }
    const text = this.element.attribute(this.validatedAttribute as string)?.value ?? null;
    if (!isNullOrEmpty(text)) {
      return !CAEXWrapper.equals(ServiceLocator.queryService.findByPath(XmlCAEXSchema.caexDocument(this.element), text, true, null), null);
    }
    return true;
  }

  /** @internal */
  renameElement(repairOption: RepairTypeEnum): boolean {
    const cAEXElement = this.caexElement;
    const val = cAEXElement instanceof CAEXObject ? cAEXElement : null;
    if (val == null) {
      return false;
    }
    let result = true;
    const val2 = ServiceLocator.beginService<IUniqueName>(UniqueNameService.register, 'IUniqueName').service;
    if (hasFlag(repairOption, RepairTypeEnum.GenerateXmlName)) {
      val.name = XmlConvert.encodeName(val.name);
      this._repairResult = "Element's name changed to " + (val.name ?? '');
    } else if (val2 != null && !isNullOrEmpty(val.name) && val2.isUniqueCAEXName(this.element)) {
      this._repairResult = 'Name is unique and has not been changed.';
    } else if (val2 != null) {
      // C# calls the overload UniqueCAEXName(XElement, string, string): parent and default name may be null.
      val.name = val2.uniqueCAEXName(
        this.element.parent as XElement,
        this.element.name.localName,
        (this.element.attribute('Name')?.value ?? null) as string,
      );
      this._repairResult = "Element's name changed to " + (val.name ?? '');
    } else {
      result = false;
    }
    ServiceLocator.endService(UniqueNameService.unRegister, val2);
    return result;
  }

  /**
   * Determines whether the specified object is equal to this object: same type, same CAEX element
   * and same validated attribute.
   */
  equals(obj: unknown): boolean {
    if (obj == null || Object.getPrototypeOf(this) !== Object.getPrototypeOf(obj)) {
      return false;
    }
    const validationElement = obj as ValidationElement;
    if (CAEXWrapper.equals(this.caexElement, validationElement.caexElement)) {
      return this.validatedAttribute === validationElement.validatedAttribute;
    }
    return false;
  }

  /**
   * GetHashCode: CAEXElement.GetHashCode() ^ ValidatedAttribute.GetHashCode(). The key is the one
   * of the CAEX element (equal objects have the same element); like C# it fails when the element
   * is no CAEX element or no attribute is set.
   */
  equalityKey(): unknown {
    const key = (this.caexElement as CAEXBasicObject).equalityKey();
    void (this.validatedAttribute as string).length;
    return key;
  }

  /** @internal Repairs a missing or invalid SchemaVersion. */
  repairSchemaVersion(): boolean {
    const element = this.element;
    if (element != null) {
      const obj = XmlCAEXSchema.schemaManager(element);
      const obj2 = CAEXDocument.document(this.element);
      obj.setSchemaVersion((obj2 != null ? (obj2.caexFile as CAEXWrapper).node : null) as XElement);
    }
    this._repairResult = 'Schema Version Attribute changed.';
    return true;
  }

  /** @internal Repairs a missing or invalid AutomationML version. */
  repairAutomationMLVersion(): boolean {
    const obj = CAEXDocument.document(this.element);
    const val = new AMLFile(obj != null ? (obj.caexFile as CAEXWrapper).node : null);
    val.automationMLVersion = val.maximalAMLVersion.toString();
    this._repairResult = 'AutomationML Version Attribute set to ' + (val.automationMLVersion ?? '') + '.';
    return true;
  }

  /** @internal Repairs the writer header. */
  repairWriterHeader(): boolean {
    const obj = CAEXDocument.document(this.element);
    const obj2 = obj != null ? AmlObjectsExtensions.amlFile(obj.caexFile) : null;
    if (obj2 != null) {
      const metaInformation = new MetaInformation();
      metaInformation.writerID = '1';
      // DateTime.Now.ToString(CultureInfo.CurrentCulture): the invariant culture, as in the oracle.
      metaInformation.lastWritingDateTime = DateTime.now.toString();
      obj2.setMetaInformation(metaInformation);
    }
    this._repairResult = "Empty source information with ID '1' added to document";
    return true;
  }

  /** @internal */
  repairID(): boolean {
    const text = Guid.newGuid().toString('D');
    const obj = XmlOperation.createCAEXWrapper(this.element);
    const val = (obj instanceof CAEXObject ? obj : null) as CAEXObject;
    this._repairResult = `ID '${val.id ?? ''}' of ${val.name ?? ''} changed to '${text}'`;
    val.id = text;
    return true;
  }

  /** @internal */
  removeAttributeValue(): boolean {
    const val = XmlOperation.createCAEXWrapper(this.element) as CAEXWrapper;
    const xAttributeValue = val.getXAttributeValue(this.validatedAttribute as string);
    val.setXAttributeValue(this.validatedAttribute as string, null);
    this._repairResult = "Reference '" + (xAttributeValue ?? '') + "' removed in " + (CAEXBasicObjectExtensions.name_(val) ?? '');
    return true;
  }

  /** @internal */
  removeElement(): boolean {
    const val = XmlOperation.createCAEXWrapper(this.element) as CAEXWrapper;
    const xAttributeValue = val.getXAttributeValue(this.validatedAttribute as string);
    this._repairResult = `Element ${CAEXBasicObjectExtensions.name_(val) ?? ''} with reference '${xAttributeValue ?? ''}' has been removed`;
    val.remove(false);
    return true;
  }

  /** @internal */
  removeAlias(): boolean {
    const obj = XmlOperation.createCAEXWrapper(this.element);
    const val = (obj instanceof CAEXBasicObject ? obj : null) as CAEXBasicObject;
    const xAttributeValue = val.getXAttributeValue(this.validatedAttribute as string);
    if (xAttributeValue == null) {
      return false;
    }
    val.setXAttributeValue(
      this.validatedAttribute as string,
      xAttributeValue.replaceAll(CAEXPathBuilder.aliasFromReference(xAttributeValue, CAEXBasicObjectExtensions.caexSchema(val)) + '@', ''),
    );
    this._repairResult = "Alias in '" + xAttributeValue + "' removed in " + (CAEXBasicObjectExtensions.name_(val) ?? '');
    return true;
  }

  /** @internal */
  changeFileURLToRelative(): boolean {
    const val = new AttributeType(this.element);
    const value = val.value;
    val.value = (val.value as string).replaceAll('file:', '').replace(/^\/+/, '');
    this._repairResult = `RefURI changed from FileURI '${value ?? ''}' to relative reference '${val.value ?? ''}'.`;
    return true;
  }
}

registerInterfaces(ValidationElement, 'IValidationResult');
