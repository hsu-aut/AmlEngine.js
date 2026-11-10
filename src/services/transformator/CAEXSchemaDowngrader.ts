// Port of Aml.Engine.Services.TransformatorService.CAEXSchemaDowngrader (Aml.Engine.Services 4.3.1).
//
// Works on the copy the engine created for the transformation (CAEXDocument.transformToSchema),
// which already has schema 2.15; the downgrader moves what CAEX 2.15 models differently.

import '../../engine/index.js';
import { XmlConvert, XmlDateTimeSerializationMode } from '../../system/index.js';
import { from } from '../../system/linq.js';
import { MetaInformation } from '../../engine/amlobjects/MetaInformation.js';
import { AmlObjectsExtensions } from '../../engine/amlobjects/extensions/AmlObjectsExtensions.js';
import { CAEXDocument_CAEXSchema } from '../../engine/caex/CAEXDocument.js';
import { CAEXObject } from '../../engine/caex/CAEXObject.js';
import { CAEXWrapper } from '../../engine/caex/CAEXWrapper.js';
import { ExternalInterfaceType } from '../../engine/caex/ExternalInterfaceType.js';
import { InternalElementType } from '../../engine/caex/InternalElementType.js';
import { InternalLinkType } from '../../engine/caex/InternalLinkType.js';
import { CAEXBasicObjectExtensions } from '../../engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXPathBuilder } from '../../engine/caex/extensions/CAEXPathBuilder.js';
import { MappingTypeExtensions } from '../../engine/caex/extensions/MappingTypeExtensions.js';
import type { AttributeType } from '../../engine/caex/AttributeType.js';
import type { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import type { RoleRequirementsType } from '../../engine/caex/RoleRequirementsType.js';
import type { IXMLWrapper } from '../../engine/xml/IXMLWrapper.js';

/** Creates a document with CAEX version 2.15 by transforming a document with CAEX version 3.0. */
export class CAEXSchemaDowngrader {
  private _newDocument: CAEXDocument | null = null;

  /** @internal Executes the downgrade from schema 3.0 to 2.15; returns the downgraded document. */
  downgradeToSchema215(newDocument: CAEXDocument): CAEXDocument {
    this._newDocument = newDocument;
    this.moveSourceDocumentInformationToAdditionalInformation();
    for (const item of CAEXBasicObjectExtensions.descendants(this._newDocument.caexFile!, InternalElementType)) {
      CAEXSchemaDowngrader.downgradeInternalElement(item);
    }
    this.replaceIdByPathInInternalLinks();
    return this._newDocument;
  }

  private static createNewSupportedRoleFromRoleRequirement(internalElement: InternalElementType, roleRequirement: RoleRequirementsType): void {
    internalElement.supportedRoleClass.append().refRoleClassPath = roleRequirement.refBaseRoleClassPath;
    CAEXSchemaDowngrader.moveAttributeNameMappingObjects(internalElement, roleRequirement, false);
    CAEXSchemaDowngrader.moveInterfaceIdMappingObjects(internalElement, roleRequirement, false);
    roleRequirement.remove(false);
  }

  private static downgradeInternalElement(internalElement: InternalElementType): void {
    CAEXSchemaDowngrader.moveMappingTypeToInternalElement(internalElement);
  }

  private static moveAttributeNameMappingObjects(
    internalElement: InternalElementType,
    roleRequirement: RoleRequirementsType | null,
    isMainRoleReq = true,
  ): void {
    const val = internalElement.roleRequirements.item(0);
    if (CAEXWrapper.equals(roleRequirement != null ? roleRequirement.mappingObject : null, null) || !roleRequirement!.mappingObject.exists) {
      return;
    }
    const source = roleRequirement!.refBaseRoleClassPath!.split('/');
    const text = !isMainRoleReq && from(source).any() ? from(source).last() + '.' : '';
    for (const item of roleRequirement!.mappingObject.attributeNameMapping) {
      if (!isMainRoleReq && !CAEXWrapper.equals(item.roleAttribute, null)) {
        const val2 = item.roleAttribute!.copy(false, false, false) as AttributeType;
        const text2 = CAEXPathBuilder.makeAttributePath(
          CAEXPathBuilder.pathPartObjectNames(val2.name!, CAEXDocument_CAEXSchema.CAEX3_0, false),
          CAEXDocument_CAEXSchema.CAEX2_15,
        );
        val2.name = text + (text2 ?? '');
        val!.attribute.insert(val2, false, false);
        MappingTypeExtensions.new_AttributeNameMapping(
          internalElement.mappingObject,
          CAEXPathBuilder.makeAttributePath(
            CAEXPathBuilder.pathPartObjectNames(item.systemUnitAttributeName!, CAEXDocument_CAEXSchema.CAEX3_0, false),
            CAEXDocument_CAEXSchema.CAEX2_15,
          ),
          val2.name,
        );
      } else {
        MappingTypeExtensions.new_AttributeNameMapping(
          internalElement.mappingObject,
          CAEXPathBuilder.makeAttributePath(
            CAEXPathBuilder.pathPartObjectNames(item.systemUnitAttributeName!, CAEXDocument_CAEXSchema.CAEX3_0, false),
            CAEXDocument_CAEXSchema.CAEX2_15,
          ),
          text +
            (CAEXPathBuilder.makeAttributePath(
              CAEXPathBuilder.pathPartObjectNames(item.roleAttributeName!, CAEXDocument_CAEXSchema.CAEX3_0, false),
              CAEXDocument_CAEXSchema.CAEX2_15,
            ) ?? ''),
        );
      }
    }
  }

  private static moveInterfaceIdMappingObjects(
    internalElement: InternalElementType,
    roleRequirement: RoleRequirementsType | null,
    isMainRoleReq = true,
  ): void {
    if (CAEXWrapper.equals(roleRequirement != null ? roleRequirement.mappingObject : null, null) || !roleRequirement!.mappingObject.exists) {
      return;
    }
    const val = internalElement.roleRequirements.item(0);
    const source = roleRequirement!.refBaseRoleClassPath!.split('/');
    const text = !isMainRoleReq && from(source).any() ? from(source).last() + '.' : '';
    for (const item of roleRequirement!.mappingObject.interfaceIDMapping) {
      if (!isMainRoleReq && !CAEXWrapper.equals(item.roleInterface, null)) {
        const val2 = item.roleInterface!.copy(false, false, false) as ExternalInterfaceType;
        val2.id = CAEXObject.newGUID;
        val2.name = text + (val2.name ?? '');
        val!.externalInterface.insert(val2, false, false);
        MappingTypeExtensions.new_InterfaceNameMapping(internalElement.mappingObject, item.systemUnitInterface!.name, val2.name);
      } else {
        const mappingObject = internalElement.mappingObject;
        const name = item.systemUnitInterface!.name;
        const roleInterface = item.roleInterface;
        MappingTypeExtensions.new_InterfaceNameMapping(mappingObject, name, roleInterface != null ? roleInterface.name : null);
      }
    }
  }

  private static moveMappingTypeToInternalElement(internalElement: InternalElementType): void {
    const roleRequirements = internalElement.roleRequirements;
    if (!from(roleRequirements).any()) {
      return;
    }
    // Aml.Engine: removing role requirement i moves the next one to index i, which the loop then
    // skips.
    for (let i = 0; i < roleRequirements.count; i++) {
      const val = roleRequirements.item(i)!;
      if (val.mappingObject.exists) {
        if (!internalElement.mappingObject.exists) {
          internalElement.new_MappingObject();
        }
        if (i === 0) {
          CAEXSchemaDowngrader.moveAttributeNameMappingObjects(internalElement, val);
          CAEXSchemaDowngrader.moveInterfaceIdMappingObjects(internalElement, val);
        } else {
          CAEXSchemaDowngrader.createNewSupportedRoleFromRoleRequirement(internalElement, val);
          // already removed by createNewSupportedRoleFromRoleRequirement; removing again does nothing
          val.remove(false);
        }
      }
    }
  }

  private moveSourceDocumentInformationToAdditionalInformation(): void {
    const val = this._newDocument!.caexFile!.sourceDocumentInformation.item(0);
    // Aml.Engine: a document without SourceDocumentInformation fails here (NullReferenceException).
    const val2 = new MetaInformation();
    val2.writerName = val!.originName ?? '';
    val2.writerID = val!.originID ?? '';
    val2.writerVendor = val!.originVendor ?? '';
    val2.writerVendorURL = val!.originVendorURL ?? '';
    val2.writerVersion = val!.originVersion ?? '';
    val2.writerRelease = val!.originRelease ?? '';
    val2.writerProjectTitle = val!.originProjectTitle ?? '';
    val2.writerProjectID = val!.originProjectID ?? '';
    val2.lastWritingDateTime = XmlConvert.toString(val!.lastWritingDateTime, XmlDateTimeSerializationMode.Local);
    AmlObjectsExtensions.setMetaInformation(this._newDocument!.caexFile, val2);
    this._newDocument!.caexFile!.sourceDocumentInformation.remove();
  }

  private replaceIdByPathInInternalLinks(): void {
    for (const item of CAEXBasicObjectExtensions.descendants(this._newDocument!.caexFile!, InternalLinkType)) {
      const val = CAEXBasicObjectExtensions.findCaexObjectFromId(item, item.refPartnerSideA, ExternalInterfaceType);
      item.refPartnerSideA = (associatedObjectID(val) ?? '') + ':' + ((val != null ? val.name : null) ?? '');
      const val2 = CAEXBasicObjectExtensions.findCaexObjectFromId(item, item.refPartnerSideB, ExternalInterfaceType);
      item.refPartnerSideB = (associatedObjectID(val2) ?? '') + ':' + ((val2 != null ? val2.name : null) ?? '');
    }
  }
}

/**
 * `val?.AssociatedObject.Node.Attribute("ID")?.Value`: null without interface; an interface
 * without associated object fails (NullReferenceException in C#).
 */
function associatedObjectID(val: ExternalInterfaceType | null): string | null {
  return val != null ? ((val.associatedObject as unknown as IXMLWrapper).node!.attribute('ID')?.value ?? null) : null;
}
