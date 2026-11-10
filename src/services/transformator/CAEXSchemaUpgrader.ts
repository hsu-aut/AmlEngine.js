// Port of Aml.Engine.Services.TransformatorService.CAEXSchemaUpgrader (Aml.Engine.Services 4.3.1).
//
// Works on the copy the engine created for the transformation (CAEXDocument.transformToSchema),
// which already has schema 3.0; the upgrader moves what CAEX 3.0 models differently.

import '../../engine/index.js';
import { DateTime } from '../../system/index.js';
import { from } from '../../system/linq.js';
import { AmlObjectsExtensions } from '../../engine/amlobjects/extensions/AmlObjectsExtensions.js';
import { CAEXDocument_CAEXSchema } from '../../engine/caex/CAEXDocument.js';
import { CAEXWrapper } from '../../engine/caex/CAEXWrapper.js';
import { InternalElementType } from '../../engine/caex/InternalElementType.js';
import { InternalLinkType } from '../../engine/caex/InternalLinkType.js';
import { CAEXBasicObjectExtensions } from '../../engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXPathBuilder } from '../../engine/caex/extensions/CAEXPathBuilder.js';
import { MappingTypeExtensions } from '../../engine/caex/extensions/MappingTypeExtensions.js';
import type { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import type { MappingType } from '../../engine/caex/MappingType.js';
import type { RoleRequirementsType } from '../../engine/caex/RoleRequirementsType.js';

/** Creates a document with CAEX version 3.0 by transforming a document with CAEX version 2.15. */
export class CAEXSchemaUpgrader {
  private _newDocument: CAEXDocument | null = null;

  /** @internal Executes the upgrade from schema 2.15 to 3.0; returns the upgraded document. */
  upgradeToSchema30(newDocument: CAEXDocument): CAEXDocument {
    this._newDocument = newDocument;
    this.moveAdditionalInformationToSourceDocumentInformation();
    for (const item of CAEXBasicObjectExtensions.descendants(this._newDocument.caexFile!, InternalElementType)) {
      CAEXSchemaUpgrader.upgradeInternalElement(item);
    }
    this.cleanMirrorObjects();
    this.replacePathByIdInInternalLinks();
    return this._newDocument;
  }

  /** Converts the supported role classes of the internal element to role requirements. */
  private static convertSupportedRolesToRoleRequirements(internalElement: InternalElementType, roleReq: RoleRequirementsType | null): void {
    for (const item of internalElement.supportedRoleClass) {
      if (
        !CAEXWrapper.equals(item.roleClass, null) &&
        !CAEXWrapper.equals(item.roleClass, roleReq != null ? roleReq.roleClass : null) &&
        !CAEXWrapper.equals(item.roleClass, null)
      ) {
        const val = item.roleClass!.createClassInstance(null);
        internalElement.roleRequirements.insert(val, false, false);
        if (!CAEXWrapper.equals(item.mappingObject, null) && item.mappingObject.exists) {
          CAEXSchemaUpgrader.moveAttributeNameMappingObjects(internalElement, item.mappingObject, val);
          CAEXSchemaUpgrader.moveInterfaceNameMappingObjects(internalElement, item.mappingObject, val);
        }
      }
    }
  }

  private static moveAttributeNameMappingObjects(
    internalElement: InternalElementType,
    mappingObject: MappingType,
    mainRoleRequirement: RoleRequirementsType | null,
  ): void {
    if (CAEXWrapper.equals(mainRoleRequirement, null)) {
      return;
    }
    const qualifiedAttributes = mainRoleRequirement!.qualifiedAttributes;
    const attributeNameMapping = mappingObject.attributeNameMapping;
    const list = from(qualifiedAttributes).toList();
    for (const attributeNameMappingType of attributeNameMapping) {
      if (from(list).any((a) => a.name === attributeNameMappingType.roleAttributeName)) {
        const array = attributeNameMappingType.roleAttributeName!.split('.');
        const roleName = array[0];
        const val = from(internalElement.roleRequirements).firstOrDefault((r) => {
          const roleClass = r.roleClass;
          return (roleClass != null ? roleClass.name : null) === roleName;
        });
        if (!CAEXWrapper.equals(val, null)) {
          if (CAEXWrapper.equals(val!.mappingObject, null) || !val!.mappingObject.exists) {
            val!.new_MappingObject();
          }
          MappingTypeExtensions.new_AttributeNameMapping(
            val!.mappingObject,
            CAEXPathBuilder.makeAttributePath(
              CAEXPathBuilder.pathPartObjectNames(attributeNameMappingType.systemUnitAttributeName!, CAEXDocument_CAEXSchema.CAEX2_15, false),
              CAEXDocument_CAEXSchema.CAEX3_0,
            ),
            CAEXPathBuilder.makeAttributePath(from(array).skip(1), CAEXDocument_CAEXSchema.CAEX3_0),
          );
        }
      } else {
        if (!mainRoleRequirement!.mappingObject.exists) {
          mainRoleRequirement!.new_MappingObject();
        }
        MappingTypeExtensions.new_AttributeNameMapping(
          mainRoleRequirement!.mappingObject,
          CAEXPathBuilder.makeAttributePath(
            CAEXPathBuilder.pathPartObjectNames(attributeNameMappingType.systemUnitAttributeName!, CAEXDocument_CAEXSchema.CAEX2_15, false),
            CAEXDocument_CAEXSchema.CAEX3_0,
          ),
          CAEXPathBuilder.makeAttributePath(
            CAEXPathBuilder.pathPartObjectNames(attributeNameMappingType.roleAttributeName!, CAEXDocument_CAEXSchema.CAEX2_15, false),
            CAEXDocument_CAEXSchema.CAEX3_0,
          ),
        );
      }
    }
    for (const item of list) {
      item.remove(false);
    }
  }

  private cleanMirrorObjects(): void {
    for (const item of from(CAEXBasicObjectExtensions.descendants(this._newDocument!.caexFile!, InternalElementType)).where((i) => i.isMirror)) {
      if (!from(item.internalElement).any() && !from(item.externalInterface).any() && !from(item.attribute).any()) {
        continue;
      }
      const master = item.master;
      if (CAEXWrapper.equals(master, null)) {
        continue;
      }
      for (const childElement of from(item.internalElement).toList()) {
        item.internalElement.removeElement(childElement);
        if (!from(master!.internalElement).any((c) => equalsString(c.name, childElement.name))) {
          master!.internalElement.insert(childElement, true, false);
        }
      }
      for (const externalInterface of from(item.externalInterface).toList()) {
        // Aml.Engine: removes the interface through its own nested ExternalInterface sequence, not
        // the one of the mirror; the node is removed all the same.
        externalInterface.externalInterface.removeElement(externalInterface);
        if (!from(master!.externalInterface).any((ei) => equalsString(ei.name, externalInterface.name))) {
          master!.externalInterface.insert(externalInterface, true, false);
        }
      }
      for (const attribute of from(item.attribute).toList()) {
        // Aml.Engine: as above, through the nested Attribute sequence of the attribute.
        attribute.attribute.removeElement(attribute);
        if (!from(master!.attribute).any((attr) => equalsString(attr.name, attribute.name))) {
          master!.attribute.insert(attribute, true, false);
        }
      }
    }
  }

  private moveAdditionalInformationToSourceDocumentInformation(): void {
    this._newDocument!.caexFile!.sourceDocumentInformation.remove();
    const list = from(AmlObjectsExtensions.getMetaInformation(this._newDocument!.caexFile)).toList();
    AmlObjectsExtensions.clearMetaInformation(this._newDocument!.caexFile);
    for (const item of list) {
      const obj = this._newDocument!.caexFile!.sourceDocumentInformation.append();
      obj.originName = item.writerName;
      obj.originID = item.writerID;
      obj.originVendor = item.writerVendor;
      obj.originVendorURL = item.writerVendorURL;
      obj.originVersion = item.writerVersion;
      obj.originRelease = item.writerRelease;
      obj.originProjectTitle = item.writerProjectTitle;
      obj.originProjectID = item.writerProjectID;
      // DateTime.TryParse(s, out result): result is default(DateTime) if s cannot be parsed.
      const result = DateTime.tryParse(item.lastWritingDateTime) ?? DateTime.minValue;
      obj.lastWritingDateTime = result;
    }
  }

  private static moveInterfaceNameMappingObjects(
    internalElement: InternalElementType,
    mappingObject: MappingType,
    mainRoleRequirement: RoleRequirementsType | null,
  ): void {
    if (CAEXWrapper.equals(mainRoleRequirement, null)) {
      return;
    }
    const qualifiedExternalInterfaces = mainRoleRequirement!.qualifiedExternalInterfaces;
    const interfaceNameMapping = mappingObject.interfaceNameMapping;
    const list = from(qualifiedExternalInterfaces).toList();
    for (const interfaceNameMappingType of interfaceNameMapping) {
      if (from(list).any((a) => a.name === interfaceNameMappingType.roleInterfaceName)) {
        const array = interfaceNameMappingType.roleInterfaceName!.split('.');
        const roleName = array[0];
        const val = from(internalElement.roleRequirements).firstOrDefault((r) => {
          const roleClass = r.roleClass;
          return (roleClass != null ? roleClass.name : null) === roleName;
        });
        if (!CAEXWrapper.equals(val, null)) {
          if (CAEXWrapper.equals(val!.mappingObject, null) || !val!.mappingObject.exists) {
            val!.new_MappingObject();
          }
          MappingTypeExtensions.new_InterfaceIDMapping(val!.mappingObject, interfaceNameMappingType.systemUnitInterface, interfaceNameMappingType.roleInterface);
        }
      } else {
        if (!mainRoleRequirement!.mappingObject.exists) {
          mainRoleRequirement!.new_MappingObject();
        }
        MappingTypeExtensions.new_InterfaceIDMapping(
          mainRoleRequirement!.mappingObject,
          interfaceNameMappingType.systemUnitInterface,
          interfaceNameMappingType.roleInterface,
        );
      }
    }
    for (const item of list) {
      item.remove(false);
    }
  }

  private static moveMappingTypeToRoleRequirements(internalElement: InternalElementType): void {
    const val = from(internalElement.roleRequirements).any() ? internalElement.roleRequirements.item(0) : null;
    if (!CAEXWrapper.equals(val, null) || internalElement.supportedRoleClass.count !== 0) {
      CAEXSchemaUpgrader.convertSupportedRolesToRoleRequirements(internalElement, val);
      const mappingObject = internalElement.mappingObject;
      if (CAEXWrapper.equals(mappingObject, null) || !mappingObject.exists) {
        internalElement.supportedRoleClass.remove();
        return;
      }
      CAEXSchemaUpgrader.moveAttributeNameMappingObjects(internalElement, mappingObject, val);
      CAEXSchemaUpgrader.moveInterfaceNameMappingObjects(internalElement, mappingObject, val);
      internalElement.supportedRoleClass.remove();
      mappingObject.remove(false);
    }
  }

  private replacePathByIdInInternalLinks(): void {
    for (const item of CAEXBasicObjectExtensions.descendants(this._newDocument!.caexFile!, InternalLinkType)) {
      const aInterface = item.aInterface;
      item.refPartnerSideA = aInterface != null ? aInterface.id : null;
      const bInterface = item.bInterface;
      item.refPartnerSideB = bInterface != null ? bInterface.id : null;
    }
  }

  private static upgradeInternalElement(internalElement: InternalElementType): void {
    CAEXSchemaUpgrader.moveMappingTypeToRoleRequirements(internalElement);
  }
}

/** string.Equals(string) on a possibly null receiver (NullReferenceException in C#). */
function equalsString(a: string | null, b: string | null): boolean {
  return (a as string).valueOf() === b;
}
