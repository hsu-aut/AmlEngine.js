// Port of Aml.Engine.AmlObjects.Extensions.AmlObjectsExtensions (Aml.Engine 4.5.2): extension
// methods to access CAEX objects as AML objects.

import { T } from '../../registry.js';
import { from } from '../../../system/linq.js';
import { ArgumentNullException } from '../../../system/exceptions.js';
import { XmlConvert, XmlDateTimeSerializationMode } from '../../../system/index.js';
import { AutomationMLBaseRoleClassLib } from '../AutomationMLBaseRoleClassLib.js';
import { AutomationMLInterfaceClassLib } from '../AutomationMLInterfaceClassLib.js';
import type { DateTime } from '../../../system/index.js';
import type { AttributeType } from '../../caex/AttributeType.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { CAEXFileType } from '../../caex/CAEXFileType.js';
import type { ExternalInterfaceType } from '../../caex/ExternalInterfaceType.js';
import type { ICAEXWrapper } from '../../caex/ICAEXWrapper.js';
import type { IObjectWithAttributes } from '../../caex/IObjectWithAttributes.js';
import type { InternalElementType } from '../../caex/InternalElementType.js';
import type { SourceDocumentInformationType } from '../../caex/SourceDocumentInformationType.js';
import type { SystemUnitClassType } from '../../caex/SystemUnitClassType.js';
import type { AMLFacet } from '../AMLFacet.js';
import type { AMLFile } from '../AMLFile.js';
import type { AMLGroup } from '../AMLGroup.js';
import type { AMLPort } from '../AMLPort.js';
import type { AMLSystemUnitClass } from '../AMLSystemUnitClass.js';
import type { FrameAttributeType } from '../FrameAttributeType.js';
import type { FrameValues } from '../FrameValues.js';
import type { MetaInformation } from '../MetaInformation.js';
import type { ObjectWithAMLAttributes } from '../ObjectWithAMLAttributes.js';
import type { RefTypeAttributeType } from '../RefTypeAttributeType.js';
import type { RefURIAttributeType } from '../RefURIAttributeType.js';

/** Extension methods to access CAEX objects as AML objects. */
export class AmlObjectsExtensions {
  private constructor() {}

  /**
   * Gets the AML attributes of the CAEX object.
   * @throws ArgumentNullException caexObject is null.
   */
  static amlAttributes(caexObject: IObjectWithAttributes | null): ObjectWithAMLAttributes {
    if (caexObject != null) {
      return new T.ObjectWithAMLAttributes(caexObject);
    }
    throw new ArgumentNullException('caexObject');
  }

  /** Gets the InternalElement as AMLFacet. */
  static amlFacet(internalElement: InternalElementType | null): AMLFacet {
    return new T.AMLFacet(internalElement?.node ?? null);
  }

  /** Gets the CAEXFile as AMLFile. */
  static amlFile(caexFile: CAEXFileType | null): AMLFile {
    return new T.AMLFile(caexFile?.node ?? null);
  }

  /** Gets the InternalElement as AMLGroup. */
  static amlGroup(internalElement: InternalElementType | null): AMLGroup {
    return new T.AMLGroup(internalElement?.node ?? null);
  }

  /** Gets the InternalElement as AMLPort. */
  static amlPort(internalElement: InternalElementType | null): AMLPort {
    return new T.AMLPort(internalElement?.node ?? null);
  }

  /** Gets the SystemUnitClass as AMLSystemUnitClass (`null` if it is no InternalElement or SystemUnitClass). */
  static amlSystemUnitClass(systemUnitClass: SystemUnitClassType | null): AMLSystemUnitClass | null {
    if (!(systemUnitClass instanceof T.InternalElementType)) {
      if (systemUnitClass instanceof T.SystemUnitFamilyType) {
        return new T.AMLSystemUnitFamilyType(systemUnitClass.node);
      }
      return null;
    }
    return new T.AMLInternalElementType(systemUnitClass.node);
  }

  /**
   * Gets the AutomationML version of the CAEXFile (`AutomationMLVersion(CAEXFileType)`) or of the
   * document (`AutomationMLVersion(CAEXDocument)`).
   * @throws ArgumentNullException caexFile or document is null.
   */
  static automationMLVersion(arg: CAEXFileType | CAEXDocument | null): string | null {
    if (arg instanceof T.CAEXDocument) {
      const document = arg;
      return AmlObjectsExtensions.automationMLVersion(document.caexFile);
    }
    const caexFile = arg as CAEXFileType | null;
    if (!T.CAEXWrapper.equals(caexFile, null)) {
      return AmlObjectsExtensions.amlFile(caexFile).automationMLVersion;
    }
    throw new ArgumentNullException('caexFile');
  }

  /**
   * Removes all meta information of the CAEXFile.
   * @throws ArgumentNullException caexFile is null.
   */
  static clearMetaInformation(caexFile: CAEXFileType | null): void {
    if (T.CAEXWrapper.equals(caexFile, null)) {
      throw new ArgumentNullException('caexFile');
    }
    AmlObjectsExtensions.amlFile(caexFile).clearMetaInformation();
  }

  /**
   * Deletes the meta information of the writer.
   * @throws ArgumentNullException caexFile is null.
   */
  static deleteMetaInformation(caexFile: CAEXFileType | null, writerID: string | null): boolean {
    if (!T.CAEXWrapper.equals(caexFile, null)) {
      return AmlObjectsExtensions.amlFile(caexFile).deleteMetaInformation(writerID);
    }
    throw new ArgumentNullException('caexFile');
  }

  /**
   * Gets the Frame attribute of the CAEX object, or `null`.
   * @throws ArgumentNullException caexObject is null.
   */
  static frameAttribute(caexObject: IObjectWithAttributes | null): FrameAttributeType | null {
    if (caexObject != null) {
      return new T.ObjectWithAMLAttributes(caexObject).frameAttribute;
    }
    throw new ArgumentNullException('caexObject');
  }

  /**
   * Gets the meta information of all writers (`GetMetaInformation(caexFile)`) or of the writer
   * with the ID (`GetMetaInformation(caexFile, writerID)`).
   * @throws ArgumentNullException caexFile is null.
   */
  static getMetaInformation(caexFile: CAEXFileType | null): Iterable<MetaInformation>;
  static getMetaInformation(caexFile: CAEXFileType | null, writerID: string | null): MetaInformation | null;
  static getMetaInformation(caexFile: CAEXFileType | null, ...args: [] | [string | null]): Iterable<MetaInformation> | MetaInformation | null {
    if (args.length === 0) {
      if (!T.CAEXWrapper.equals(caexFile, null)) {
        return AmlObjectsExtensions.amlFile(caexFile).getMetaInformation();
      }
      throw new ArgumentNullException('caexFile');
    }
    if (!T.CAEXWrapper.equals(caexFile, null)) {
      return AmlObjectsExtensions.amlFile(caexFile).getMetaInformation(args[0]);
    }
    throw new ArgumentNullException('caexFile');
  }

  /** Determines whether the InternalElement is an AMLFacet. */
  static isAMLFacet(internalElement: InternalElementType): boolean {
    return AmlObjectsExtensions.amlFacet(internalElement).isFacet;
  }

  /** Determines whether the InternalElement is an AMLGroup. */
  static isAMLGroup(internalElement: InternalElementType): boolean {
    return AmlObjectsExtensions.amlGroup(internalElement).isGroup;
  }

  /**
   * Determines whether the CAEX object is an AML object: a SystemUnitClass with a role derived
   * from AutomationMLBaseRole, or an ExternalInterface derived from AutomationMLBaseInterface.
   */
  static isAMLObject(caexObject: ICAEXWrapper | null): boolean {
    if (!(caexObject instanceof T.SystemUnitClassType)) {
      if (caexObject instanceof T.ExternalInterfaceType) {
        return AutomationMLInterfaceClassLib.isAutomationMLBaseInterface(caexObject);
      }
      return false;
    }
    return from(caexObject.roleReferences).any((rr) => AutomationMLBaseRoleClassLib.isAutomationMLBaseRole(rr));
  }

  /** Determines whether the InternalElement is an AMLPort. */
  static isAMLPort(internalElement: InternalElementType): boolean {
    return AmlObjectsExtensions.amlPort(internalElement).isPort;
  }

  /**
   * Determines whether the attribute is an attribute of an AMLFacet.
   * @throws ArgumentNullException facetAttribute is null.
   */
  static isFacetAttribute(facetAttribute: AttributeType | null): boolean {
    if (T.CAEXWrapper.equals(facetAttribute, null)) {
      throw new ArgumentNullException('facetAttribute');
    }
    let parent = facetAttribute!.node!.parent;
    while ((parent?.name.localName ?? null) === 'Attribute') {
      parent = parent!.parent;
    }
    if ((parent?.name.localName ?? null) !== 'InternalElement') {
      return false;
    }
    return new T.AMLFacet(parent).isFacet;
  }

  /**
   * Determines whether the interface is an interface of an AMLFacet.
   * @throws ArgumentNullException facetInterface is null.
   */
  static isFacetInterface(facetInterface: ExternalInterfaceType | null): boolean {
    if (T.CAEXWrapper.equals(facetInterface, null)) {
      throw new ArgumentNullException('facetInterface');
    }
    let parent = facetInterface!.node!.parent;
    while ((parent?.name.localName ?? null) === 'ExternalInterface') {
      parent = parent!.parent;
    }
    if ((parent?.name.localName ?? null) !== 'InternalElement') {
      return false;
    }
    return new T.AMLFacet(parent).isFacet;
  }

  /** Determines whether the attribute is a refType attribute. */
  static isRefTypeAttribute(attribute: AttributeType | null): boolean {
    return AmlObjectsExtensions.toRefTypeAttribute(attribute).isRefTypeAttribute;
  }

  /** Determines whether the attribute is a refURI attribute. */
  static isRefURIAttribute(attribute: AttributeType | null): boolean {
    return AmlObjectsExtensions.toRefURIAttribute(attribute).isRefURIAttribute;
  }

  /**
   * Creates a new Frame attribute with the values (default all 0), or sets the values of an existing one.
   * @throws ArgumentNullException caexObject is null.
   */
  static new_FrameAttribute(caexObject: IObjectWithAttributes | null, frameValues: FrameValues | null = null): FrameAttributeType {
    if (caexObject == null) {
      throw new ArgumentNullException('caexObject');
    }
    return new T.ObjectWithAMLAttributes(caexObject).new_FrameAttribute(frameValues ?? new T.FrameValues());
  }

  /** Gets the refType attribute of the CAEX object, or `null`. */
  static refTypeAttribute(objectWithAttributes: IObjectWithAttributes | null): RefTypeAttributeType | null {
    return objectWithAttributes != null ? (AmlObjectsExtensions.amlAttributes(objectWithAttributes)?.refTypeAttribute ?? null) : null;
  }

  /** Gets the refURI attribute of the CAEX object, or `null`. */
  static refURIAttribute(objectWithAttributes: IObjectWithAttributes | null): RefURIAttributeType | null {
    return objectWithAttributes != null ? (AmlObjectsExtensions.amlAttributes(objectWithAttributes)?.refURIAttribute ?? null) : null;
  }

  /**
   * Replaces the meta information of the writer.
   * @throws ArgumentNullException caexFile is null.
   */
  static replaceMetaInformation(caexFile: CAEXFileType | null, oldWriterID: string | null, newMetainformation: MetaInformation): boolean {
    if (!T.CAEXWrapper.equals(caexFile, null)) {
      return AmlObjectsExtensions.amlFile(caexFile).replaceMetaInformation(oldWriterID, newMetainformation);
    }
    throw new ArgumentNullException('caexFile');
  }

  /**
   * Sets meta information: of the SourceDocumentInformation object
   * (`SetMetaInformation(SourceDocumentInformationType, MetaInformation)`), or of a writer of the
   * CAEXFile (`SetMetaInformation(caexFile, writerName, writerID, writerVendor, writerVendorURL,
   * writerVersion, writerRelease, lastWritingDateTime, writerProjectTitle, writerProjectID)` or
   * `SetMetaInformation(caexFile, MetaInformation)`).
   * @throws ArgumentNullException an argument is null.
   */
  static setMetaInformation(sourceDocumentInformation: SourceDocumentInformationType | null, metaInformation: MetaInformation | null): void;
  static setMetaInformation(caexFile: CAEXFileType | null, metaInformation: MetaInformation | null): void;
  static setMetaInformation(
    caexFile: CAEXFileType | null,
    writerName: string | null,
    writerID: string | null,
    writerVendor: string | null,
    writerVendorURL: string | null,
    writerVersion: string | null,
    writerRelease: string | null,
    lastWritingDateTime: string | null,
    writerProjectTitle: string | null,
    writerProjectID: string | null,
  ): void;
  static setMetaInformation(target: SourceDocumentInformationType | CAEXFileType | null, ...args: unknown[]): void {
    if (target instanceof T.SourceDocumentInformationType) {
      const sourceDocumentInformation = target;
      if (T.CAEXWrapper.equals(sourceDocumentInformation, null)) {
        throw new ArgumentNullException('sourceDocumentInformation');
      }
      const metaInformation = args[0] as MetaInformation | null;
      if (metaInformation == null) {
        throw new ArgumentNullException('metaInformation');
      }
      sourceDocumentInformation.originName = metaInformation.writerName;
      sourceDocumentInformation.originID = metaInformation.writerID;
      sourceDocumentInformation.originProjectID = metaInformation.writerProjectID;
      sourceDocumentInformation.originProjectTitle = metaInformation.writerProjectTitle;
      sourceDocumentInformation.originRelease = metaInformation.writerRelease;
      sourceDocumentInformation.originVendor = metaInformation.writerVendor;
      sourceDocumentInformation.originVendorURL = metaInformation.writerVendorURL;
      sourceDocumentInformation.originVersion = metaInformation.writerVersion;
      sourceDocumentInformation.lastWritingDateTime = XmlConvert.toDateTime(metaInformation.lastWritingDateTime!, XmlDateTimeSerializationMode.Local);
      return;
    }
    const caexFile = target as CAEXFileType | null;
    if (T.CAEXWrapper.equals(caexFile, null)) {
      throw new ArgumentNullException('caexFile');
    }
    if (args.length === 1) {
      AmlObjectsExtensions.amlFile(caexFile).setMetaInformation(args[0] as MetaInformation | null);
      return;
    }
    const a = args as (string | null)[];
    AmlObjectsExtensions.amlFile(caexFile).setMetaInformation(a[0]!, a[1]!, a[2]!, a[3]!, a[4]!, a[5]!, a[6]!, a[7]!, a[8]!);
  }

  /**
   * Sets the meta information of the AutomationML e.V. for the AutomationML standard libraries.
   * @throws ArgumentNullException caexFile is null.
   */
  static setMetaInformationStandardAutomationMLLibrary(caexFile: CAEXFileType | null): void {
    if (T.CAEXWrapper.equals(caexFile, null)) {
      throw new ArgumentNullException('caexFile');
    }
    AmlObjectsExtensions.amlFile(caexFile).setMetaInformationStandardAutomationMLLibrary();
  }

  /**
   * Sets the SourceDocumentInformation of a writer of the CAEXFile.
   * @throws ArgumentNullException caexFile is null.
   */
  static setSourceDocumentInformation(
    caexFile: CAEXFileType | null,
    originName: string | null,
    originID: string | null,
    originVendor: string | null,
    originVendorURL: string | null,
    originVersion: string | null,
    originRelease: string | null,
    lastWritingDateTime: DateTime,
    originProjectTitle: string | null,
    originProjectID: string | null,
  ): void {
    if (T.CAEXWrapper.equals(caexFile, null)) {
      throw new ArgumentNullException('caexFile');
    }
    AmlObjectsExtensions.amlFile(caexFile).setSourceDocumentInformation(
      originName,
      originID,
      originVendor,
      originVendorURL,
      originVersion,
      originRelease,
      lastWritingDateTime,
      originProjectTitle,
      originProjectID,
    );
  }

  /** Gets the attribute as RefTypeAttributeType. */
  static toRefTypeAttribute(attribute: AttributeType | null): RefTypeAttributeType {
    return new T.RefTypeAttributeType(attribute?.node ?? null);
  }

  /** Gets the attribute as RefURIAttributeType. */
  static toRefURIAttribute(attribute: AttributeType | null): RefURIAttributeType {
    return new T.RefURIAttributeType(attribute?.node ?? null);
  }
}
