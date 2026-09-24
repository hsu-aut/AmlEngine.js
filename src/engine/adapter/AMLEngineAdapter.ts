// Port of Aml.Engine.Adapter.AMLEngineAdapter (Aml.Engine 4.5.2).
//
// Obsolete extension methods of the old AMLEngine 3.x, kept to support the migration of legacy
// code. Exported as a namespace object (not a class with static methods) because the C# class
// has the extension method `Name`: a static member `name` would collide with Function.name.
// Overloads that differ only by the `this` type are one function each.

import { T } from '../registry.js';
import { from, type Enumerable } from '../../system/linq.js';
import { XName, type XElement } from '../../xml/index.js';
import { AmlObjectsExtensions } from '../amlobjects/extensions/AmlObjectsExtensions.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXPathBuilder } from '../caex/extensions/CAEXPathBuilder.js';
import { ObjectWithBaseClass } from '../caex/extensions/ObjectWithBaseClass.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import type { LinkedObjects } from './LinkedObjects.js';
import type { AttributeType } from '../caex/AttributeType.js';
import type { CAEXBasicObject } from '../caex/CAEXBasicObject.js';
import type { CAEXFileType } from '../caex/CAEXFileType.js';
import type { CAEXObject } from '../caex/CAEXObject.js';
import type { CAEXWrapper } from '../caex/CAEXWrapper.js';
import type { ExternalInterfaceType } from '../caex/ExternalInterfaceType.js';
import type { ExternalReferenceType } from '../caex/ExternalReferenceType.js';
import type { IInternalElementContainer } from '../caex/IInternalElementContainer.js';
import type { IObjectWithAttributes } from '../caex/IObjectWithAttributes.js';
import type { IObjectWithExternalInterface } from '../caex/IObjectWithExternalInterface.js';
import type { InstanceHierarchyType } from '../caex/InstanceHierarchyType.js';
import type { InterfaceClassLibType } from '../caex/InterfaceClassLibType.js';
import type { InterfaceClassType } from '../caex/InterfaceClassType.js';
import type { InterfaceFamilyType } from '../caex/InterfaceFamilyType.js';
import type { InternalElementType } from '../caex/InternalElementType.js';
import type { MappingType } from '../caex/MappingType.js';
import type { NominalScaledTypeType } from '../caex/NominalScaledTypeType.js';
import type { OrdinalScaledTypeType } from '../caex/OrdinalScaledTypeType.js';
import type { RevisionType } from '../caex/RevisionType.js';
import type { RoleClassLibType } from '../caex/RoleClassLibType.js';
import type { RoleRequirementsType } from '../caex/RoleRequirementsType.js';
import type { SupportedRoleClassType } from '../caex/SupportedRoleClassType.js';
import type { SystemUnitClassLibType } from '../caex/SystemUnitClassLibType.js';
import type { SystemUnitClassType } from '../caex/SystemUnitClassType.js';
import type { SystemUnitFamilyType } from '../caex/SystemUnitFamilyType.js';

/** @deprecated Use the Services.ServiceLocator.QueryService for any query. */
function allElementsWithInternalLinks(caexFile: CAEXFileType): Iterable<CAEXBasicObject> {
  return ServiceLocator.queryService.allElementsWithInternalLinks(caexFile);
}

/** @deprecated Use the Services.ServiceLocator.QueryService for any query. */
function allInternalElementsWithInternalLinks(caexFile: CAEXFileType): Enumerable<InternalElementType> {
  return from(ServiceLocator.queryService.allElementsWithInternalLinks(caexFile)).ofType(
    T.InternalElementType as unknown as abstract new (...args: never[]) => InternalElementType,
  );
}

/** @deprecated Use the generic extension method Ancestors<T>. */
function ancestors(systemUnitClass: SystemUnitClassType): Iterable<SystemUnitClassType> {
  return CAEXBasicObjectExtensions.ancestors(systemUnitClass, false, T.SystemUnitClassType);
}

/**
 * Assigns new IDs to the element and all its descendants with a mandatory ID.
 * @deprecated ID references are not updated, which can lead to an invalid document.
 */
function assignNewGUIDs(element: InternalElementType): void {
  const node = element.node as XElement;
  for (const item of from(node.descendantsAndSelf()).where((e) => XmlCAEXSchema.isElementWithMandatoryID(e))) {
    T.SetAttributeValueCmd.setValue(item, XName.get('ID'), ServiceLocator.idService.generateNewID());
  }
}

/** @deprecated Make a copy instead and replace the existing class using the copy (does nothing). */
function assignNewGUIDsAndRedirectExistingInternalLinks(_systemUnitClass: SystemUnitClassType, _includeSystemUnitClasses = false): void {}

/** @deprecated Make a copy instead and replace the existing class using the copy (does nothing). */
function assignNewGUIDsAndRedirectExistingInternalLinksAndMirrorObjects(_systemUnitClass: SystemUnitClassType, _includeSystemUnitClasses = false): void {}

/** @deprecated Direct enumeration of the Attribute property is supported. */
function attributes(systemUnitClass: IObjectWithAttributes): Iterable<AttributeType> {
  return systemUnitClass.attribute;
}

/** @deprecated Use CAEXWrapper.Copy. */
function clone(caexObject: CAEXBasicObject): CAEXWrapper | null {
  return caexObject.copy();
}

/** @deprecated Use CAEXWrapper.Copy. */
function cloneNode(caexObject: CAEXBasicObject, deepClone: boolean, assignNewGuidsToIEs: boolean): CAEXWrapper | null {
  return caexObject.copy(deepClone, assignNewGuidsToIEs);
}

/** @deprecated Use FindByPath and check if not null. */
function consistencyCheck_ClassReference(caexObject: CAEXBasicObject, classPath: string | null): boolean {
  return !T.CAEXWrapper.equals(ServiceLocator.queryService.findByPath(CAEXBasicObjectExtensions.caexDocument(caexObject), classPath), null);
}

/** @deprecated Use CAEXWrapper.Copy. */
function create_UniqueCopy(internalElement: InternalElementType, deepClone: boolean): InternalElementType {
  return internalElement.copy(deepClone) as InternalElementType;
}

/** @deprecated Direct enumeration of the ExternalInterface property is supported. */
function externalInterfaces(systemUnitClass: IObjectWithExternalInterface): Iterable<InterfaceClassType> {
  return systemUnitClass.externalInterface;
}

/** @deprecated Use direct enumeration of the ExternalReference property of CAEXFileType. */
function externalReferences(caexFile: CAEXFileType): Iterable<ExternalReferenceType> {
  return caexFile.externalReference;
}

/** @deprecated Use the indexer of the ExternalInterface sequence ExternalInterface[interfaceName]. */
function findExternalInterface(systemUnitClass: IObjectWithExternalInterface, interfaceName: string | null): ExternalInterfaceType | null {
  return systemUnitClass.externalInterface.item(interfaceName);
}

/** @deprecated Use FindCaexObjectFromId<InternalElementType> instead. */
function findInternalElement(caexObject: CAEXBasicObject, referenceGUID: string | null): InternalElementType | null {
  return CAEXBasicObjectExtensions.findCaexObjectFromId(caexObject, referenceGUID, T.InternalElementType);
}

/** @deprecated Use the Services.ServiceLocator.QueryService for any query. */
function getAllElementsWithInternalLinks(caexFile: CAEXFileType): SystemUnitClassType[] {
  return from(ServiceLocator.queryService.allElementsWithInternalLinks(caexFile)).toList();
}

/** @deprecated Direct enumeration of the Attribute property is supported. */
function getAttributeField(objectWithAttributes: IObjectWithAttributes): Iterable<AttributeType> {
  return objectWithAttributes.attribute;
}

/** @deprecated Use the ReferencedClassName method (C# overloads for InternalElementType and InterfaceClassType). */
function getClassName(internalElementOrInterfaceClass: InternalElementType | InterfaceClassType | null): string | null {
  return internalElementOrInterfaceClass !== null && internalElementOrInterfaceClass !== undefined
    ? ObjectWithBaseClass.referencedClassName(internalElementOrInterfaceClass)
    : null;
}

/** @deprecated Direct enumeration of the ExternalInterface property is supported. */
function getExternalInterfaces(systemUnitClass: IObjectWithExternalInterface, _interfaceName: string | null): Iterable<InterfaceClassType> {
  return systemUnitClass.externalInterface;
}

/** @deprecated Direct enumeration of the InternalLink property is supported. */
function getLinkedObjects(systemUnitClass: SystemUnitClassType): LinkedObjects[] {
  return from(systemUnitClass.internalLink)
    .select((s) => new T.LinkedObjects(s))
    .toList();
}

/** @deprecated Name is not defined for a CAEXBasicObject. Access the Name property of CAEXObject. */
function name(caexObject: CAEXBasicObject | null): string | null {
  if (!(caexObject instanceof T.CAEXObject)) {
    return '';
  }
  return (caexObject as unknown as CAEXObject).name;
}

/** @deprecated Use the CAEXParent property, which is defined for all CAEX objects. */
function getParent(_caexFile: CAEXFileType, obj: CAEXBasicObject): CAEXBasicObject | null {
  return obj.caexParent as CAEXBasicObject | null;
}

/** @deprecated Use FindByPath of the CAEXDocument or of Services.ServiceLocator.QueryService instead. */
function getReferencedClass(caexObject: CAEXBasicObject, referencedClassPath: string | null): XElement | null {
  return ServiceLocator.queryService.findByPath(CAEXBasicObjectExtensions.caexDocument(caexObject), referencedClassPath)?.node ?? null;
}

/** @deprecated Use CAEXPathBuilder.InternalElementIDInInternalLinkReference. */
function getReferencedGUID(_caexObject: CAEXBasicObject, reference: string | null): string | null {
  return CAEXPathBuilder.internalElementIDInInternalLinkReference(reference).result;
}

/** @deprecated Use the indexer of the Attribute property: Attribute[attName]?.Value. */
function getAttributeValue(objWithAttr: IObjectWithAttributes, attName: string | null): string | null {
  return objWithAttr.attribute.item(attName)?.value ?? null;
}

/** @deprecated Use the generic method FindReferencedClass<T> instead. */
function getReferencedInterfaceClass(caexObject: CAEXBasicObject, interfaceClassReference: string | null): InterfaceFamilyType | null {
  return CAEXBasicObjectExtensions.findReferencedClass(caexObject, interfaceClassReference, T.InterfaceFamilyType);
}

/** @deprecated Use CAEXPathBuilder.ExternalInterfaceNameInInternalLinkReference. */
function getReferencedInterfaceName(_caexObject: CAEXBasicObject, reference: string | null): string | null {
  return CAEXPathBuilder.externalInterfaceNameInInternalLinkReference(reference).result;
}

/** @deprecated Use the SystemUnitClass property of InternalElementType. */
function getReferencedSystemUnitClass(element: InternalElementType): SystemUnitFamilyType | null {
  return element.systemUnitClass;
}

/** @deprecated Use Insert instead. */
function insert_Element(caexObject: CAEXBasicObject, elementToInsert: CAEXWrapper, asFirst = true): boolean {
  return caexObject.insert(elementToInsert, asFirst);
}

/** @deprecated Use the Insert method instead (C# overloads for InternalElementType and SupportedRoleClassType). */
function insert_MappingObject(internalElementOrSupportedRoleClass: InternalElementType | SupportedRoleClassType, mappingObject: MappingType): void {
  internalElementOrSupportedRoleClass.insert(mappingObject);
}

/** @deprecated Use the Insert method instead. */
function insert_NewInstance(caexObject: CAEXBasicObject, newInstanceObject: CAEXWrapper, asFirst = true): boolean {
  return caexObject.insert(newInstanceObject, asFirst);
}

/** @deprecated Use the Insert method instead. */
function insert_RoleRequirements(internalElement: InternalElementType, roleRequirement: RoleRequirementsType): void {
  internalElement.insert(roleRequirement);
}

/** @deprecated Use the Insert method instead. */
function insert_SystemUnitFamilyType(systemUnitClass: SystemUnitFamilyType, systemUnitFamilyType: SystemUnitFamilyType): void {
  systemUnitClass.insert(systemUnitFamilyType, false);
}

/** @deprecated Use Insert. */
function insert_TypeBaseElement(caexObject: CAEXBasicObject, elementToInsert: CAEXWrapper, asFirst = true): boolean {
  return caexObject.insert(elementToInsert, asFirst);
}

/** @deprecated Use the InstanceHierarchy property instead. */
function instanceHierarchies(caexFile: CAEXFileType): Iterable<InstanceHierarchyType> {
  return caexFile.instanceHierarchy;
}

/** @deprecated Use the InterfaceClassLib property instead. */
function interfaceClassLibraries(caexFile: CAEXFileType): Iterable<InterfaceClassLibType> {
  return caexFile.interfaceClassLib;
}

/** @deprecated Direct enumeration of the InternalElement property is supported. */
function internalElementChildren(systemUnitClass: IInternalElementContainer): Iterable<InternalElementType> {
  return systemUnitClass.internalElement;
}

/** @deprecated Use IsAMLFacet instead. */
function isFacet(internalElement: InternalElementType): boolean {
  return AmlObjectsExtensions.isAMLFacet(internalElement);
}

/** @deprecated Use IsAMLGroup instead. */
function isGroup(internalElement: InternalElementType): boolean {
  return AmlObjectsExtensions.isAMLGroup(internalElement);
}

/** @deprecated Use IsAMLPort instead. */
function isPort(internalElement: InternalElementType): boolean {
  return AmlObjectsExtensions.isAMLPort(internalElement);
}

/**
 * Adds a new RoleRequirements element (C# overloads (internalElement) and (internalElement,
 * roleClassPath)).
 * @deprecated Use the AddRoleClassReference method instead.
 */
function new_RoleRequirements(internalElement: InternalElementType, roleClassPath?: string | null): RoleRequirementsType | null {
  if (roleClassPath === undefined) {
    return internalElement.roleRequirements.append();
  }
  const r = internalElement.addRoleClassReference(roleClassPath);
  return r instanceof T.RoleRequirementsType ? (r as unknown as RoleRequirementsType) : null;
}

/**
 * Sets a required value (C# overloads for NominalScaledTypeType, which appends the value, and
 * OrdinalScaledTypeType, which sets it).
 * @deprecated Use NominalScaledTypeType.RequiredValue.Append or OrdinalScaledTypeType.RequiredValue instead.
 */
function new_RequiredValue(scaledType: NominalScaledTypeType | OrdinalScaledTypeType, value: string | null): void {
  if (scaledType instanceof T.NominalScaledTypeType) {
    (scaledType as NominalScaledTypeType).requiredValue.append(value as string);
    return;
  }
  (scaledType as OrdinalScaledTypeType).requiredValue = value;
}

/** @deprecated Use the property OrdinalScaledTypeType.RequiredMaxValue instead. */
function new_RequiredMaxValue(ordinalScaledType: OrdinalScaledTypeType, value: string | null): void {
  ordinalScaledType.requiredMaxValue = value;
}

/** @deprecated Use the property OrdinalScaledTypeType.RequiredMinValue instead. */
function new_RequiredMinValue(ordinalScaledType: OrdinalScaledTypeType, value: string | null): void {
  ordinalScaledType.requiredMinValue = value;
}

/** @deprecated Use the property RevisionType.OldVersion instead. */
function new_OldVersion(revision: RevisionType, value: string | null): void {
  revision.oldVersion = value;
}

/** @deprecated Use the property RevisionType.NewVersion instead. */
function new_NewVersion(revision: RevisionType, value: string | null): void {
  revision.newVersion = value;
}

/** @deprecated Use the property RevisionType.Comment instead. */
function new_Comment(revision: RevisionType, value: string | null): void {
  revision.comment = value;
}

/** @deprecated Use the RoleClassLib property instead. */
function roleClassLibraries(caexFile: CAEXFileType): Iterable<RoleClassLibType> {
  return caexFile.roleClassLib;
}

/** @deprecated Use the SystemUnitClass property instead. */
function systemUnitClassChildren(systemUnitClass: SystemUnitFamilyType): Iterable<SystemUnitFamilyType> {
  return systemUnitClass.systemUnitClass;
}

/** @deprecated Use the SystemUnitClassLib property instead. */
function systemUnitClassLibraries(caexFile: CAEXFileType): Iterable<SystemUnitClassLibType> {
  return caexFile.systemUnitClassLib;
}

/**
 * Methods of the old AMLEngine 3.x which are no longer supported, provided to support the
 * migration of legacy code.
 */
export const AMLEngineAdapter = {
  allElementsWithInternalLinks,
  allInternalElementsWithInternalLinks,
  ancestors,
  assignNewGUIDs,
  assignNewGUIDsAndRedirectExistingInternalLinks,
  assignNewGUIDsAndRedirectExistingInternalLinksAndMirrorObjects,
  attributes,
  clone,
  cloneNode,
  consistencyCheck_ClassReference,
  create_UniqueCopy,
  externalInterfaces,
  externalReferences,
  findExternalInterface,
  findInternalElement,
  getAllElementsWithInternalLinks,
  getAttributeField,
  getClassName,
  getExternalInterfaces,
  getLinkedObjects,
  name,
  getParent,
  getReferencedClass,
  getReferencedGUID,
  getAttributeValue,
  getReferencedInterfaceClass,
  getReferencedInterfaceName,
  getReferencedSystemUnitClass,
  insert_Element,
  insert_MappingObject,
  insert_NewInstance,
  insert_RoleRequirements,
  insert_SystemUnitFamilyType,
  insert_TypeBaseElement,
  instanceHierarchies,
  interfaceClassLibraries,
  internalElementChildren,
  isFacet,
  isGroup,
  isPort,
  new_RoleRequirements,
  new_RequiredValue,
  new_RequiredMaxValue,
  new_RequiredMinValue,
  new_OldVersion,
  new_NewVersion,
  new_Comment,
  roleClassLibraries,
  systemUnitClassChildren,
  systemUnitClassLibraries,
} as const;
