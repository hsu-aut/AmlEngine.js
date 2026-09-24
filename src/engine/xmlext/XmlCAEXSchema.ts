// Port of Aml.Engine.Xml.Extensions.XmlCAEXSchema (Aml.Engine 4.5.2).
//
// Extension methods interpreting the CAEX schema version and the CAEX tag names of XML nodes.
// Exported as a namespace object (not a class with static methods) because the C# class has the
// extension methods `Name` and `Value`: a static member `name` would collide with Function.name.

import { T } from '../registry.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { from } from '../../system/linq.js';
import { XAttribute, XElement, XName, XNamespace, type XNode, type XObject } from '../../xml/index.js';
import { CAEXPathBuilder } from '../caex/extensions/CAEXPathBuilder.js';
import { StringExtensions } from '../caex/extensions/StringExtensions.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { XmlCAEXAttributes } from './XmlCAEXAttributes.js';
import { XmlClassOperation } from './XmlClassOperation.js';
import { XmlCAEXMapping } from './XmlCAEXMapping.js';
import { XmlOperation } from './XmlOperation.js';
import type { CAEXDocument, CAEXDocument_CAEXSchema } from '../caex/CAEXDocument.js';
import type { CAEXObject } from '../caex/CAEXObject.js';
import type { AMLSchemaManager } from '../schema/AMLSchemaManager.js';

function caexDocument(element: XNode): CAEXDocument | null {
  return T.CAEXDocument.document(element);
}

/** Gets the correct CAEX schema version for the specified XML node. */
function caexSchema(xmlNode: XElement): CAEXDocument_CAEXSchema {
  if (schemaManager(xmlNode) !== T.AMLSchemaManager2_15.instance) {
    return T.CAEXDocument.CAEXSchema.CAEX3_0;
  }
  return T.CAEXDocument.CAEXSchema.CAEX2_15;
}

function idFromReference(reference: XElement, attributeName: string, referenceValue: string | null = null): string {
  if (referenceValue === null) {
    referenceValue = reference.attribute(attributeName)?.value ?? '';
  }
  let isAttributeReference: boolean;
  if (isInternalLink(reference) && caexSchema(reference) === T.CAEXDocument.CAEXSchema.CAEX2_15) {
    return StringExtensions.normalizedGUID(CAEXPathBuilder.internalElementIDInInternalLinkReference(referenceValue).result);
  }
  let result: string;
  if (isBasicAttribute(reference) && attributeName === 'RefAttributeType') {
    result = CAEXPathBuilder.instanceIDInAttributeReference(referenceValue, caexDocument(reference)).result;
  } else {
    isAttributeReference = isAttributeNameMapping(reference);
    if (isAttributeReference) {
      const isIdReference = attributeName === 'SystemUnitAttributeName' || attributeName === 'RoleAttributeName';
      isAttributeReference = isIdReference;
    }
    result = isAttributeReference
      ? CAEXPathBuilder.externalInterfaceIDInAttributeReference(referenceValue, caexDocument(reference)).result
      : referenceValue;
  }
  return result;
}

/** Gets the names of the attributes of the provided node, which can contain an ID reference. */
function idReferenceAttributes(xmlNode: XElement): string[] {
  switch (xmlNode.name.localName) {
    case 'InternalElement':
      return ['RefBaseSystemUnitPath'];
    case 'InterfaceIDMapping':
      return ['RoleInterfaceID', 'SystemUnitInterfaceID'];
    case 'InternalLink':
      return ['RefPartnerSideA', 'RefPartnerSideB'];
    case 'AttributeNameMapping':
      return ['RoleAttributeName', 'SystemUnitAttributeName'];
    case 'ExternalInterface':
      return ['RefBaseClassPath'];
    case 'Attribute':
      return ['RefAttributeType'];
    default:
      return [];
  }
}

/** Determines, if the XML element is an AdditionalInformation element. */
function isAdditionalInformation(element: XElement): boolean {
  return element.name.localName === 'AdditionalInformation';
}

/** Determines, if the XML element is an Attribute (basic or type). */
function isAttributeOrType(element: XElement): boolean {
  const localName = element.name.localName;
  if (localName === 'Attribute' || localName === 'AttributeType') {
    return true;
  }
  return false;
}

/** Determines, if the XML element is an Attribute. */
function isAttribute(element: XElement): boolean {
  return element.name.localName === 'Attribute';
}

/** Determines whether the specified element is a mirror of an Attribute. */
function isAttributeMirror(element: XElement): boolean {
  return CAEXPathBuilder.isValidAttributeReferenceID(XmlCAEXAttributes.attributeMasterID(element), T.CAEXDocument.document(element));
}

/** Determines, if the XML element is an AttributeNameMapping. */
function isAttributeNameMapping(element: XElement): boolean {
  return element.name.localName === 'AttributeNameMapping';
}

function isAttributeReference(a: XAttribute): boolean {
  return a.name.localName === 'RefAttributeType';
}

/** Determines, if the XML element is an AttributeType. */
function isAttributeType(element: XElement): boolean {
  return element.name.localName === 'AttributeType';
}

/** Determines whether the specified element is an AttributeTypeLib. */
function isAttributeTypeLib(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'AttributeTypeLib';
}

/** Determines, if the XML element is an Attribute. */
function isBasicAttribute(element: XElement): boolean {
  return element.name.localName === 'Attribute';
}

/** Determines whether the element is a CAEX class: RoleClass, SystemUnitClass, InterfaceClass (or AttributeType). */
function isCAEXClass(element: XElement, includeLibraryType = true): boolean {
  if (!isRoleClass(element) && (!includeLibraryType || !isLibrary(element)) && !isInterfaceClass(element) && !isSystemUnitClass(element)) {
    return isAttributeType(element);
  }
  return true;
}

function isCAEXFile(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'CAEXFile';
}

/**
 * Determines whether the XML node is an element with a path reference to the provided base
 * class using the name of the class as a reference.
 */
function isDirectReferenceToBaseClass(node: XElement, baseClass: CAEXObject | null): boolean {
  let flag = !T.CAEXWrapper.equals(baseClass, null) && node.parent === baseClass!.node;
  if (flag) {
    let flag2: boolean;
    switch (node.name.localName) {
      case 'RoleClass':
      case 'InterfaceClass':
      case 'SystemUnitClass':
        flag2 = (node.attribute('RefBaseClassPath')?.value ?? null) === baseClass!.name;
        break;
      case 'AttributeType':
        flag2 = (node.attribute('RefAttributeType')?.value ?? null) === baseClass!.name;
        break;
      default:
        flag2 = false;
        break;
    }
    flag = flag2;
  }
  return flag;
}

/** Determines whether the XML node is an element with a mandatory ID. */
function isElementWithMandatoryID(node: XElement): boolean {
  switch (node.name.localName) {
    case 'ExternalInterface':
    case 'InternalElement':
    case 'SystemUnitClass':
      return true;
    default:
      return false;
  }
}

/**
 * Determines whether the XML node is an element with an ID reference; with `ID`, whether it is
 * an element with an ID reference to the provided ID.
 */
function isElementWithIDReference(node: XElement, ID?: string | null): boolean {
  if (typeof ID === 'string' || ID === null) {
    return isElementWithIDReferenceTo(node, ID);
  }
  const ln = node.name.localName;
  if (
    (!(ln === 'InternalElement') || !isIEMirror(node)) &&
    !(ln === 'InternalLink') &&
    (!(ln === 'ExternalInterface') || !isICMirror(node)) &&
    (!(ln === 'Attribute') || !isAttributeMirror(node)) &&
    !(ln === 'InterfaceIDMapping')
  ) {
    if (node.name.localName === 'AttributeNameMapping') {
      return isInterfaceAttributeReferenceWithID(node);
    }
    return false;
  }
  return true;
}

function isElementWithIDReferenceTo(node: XElement, ID: string | null): boolean {
  let flag = !isNullOrEmpty(ID);
  if (flag) {
    switch (node.name.localName) {
      case 'InternalLink':
        flag = from(XmlCAEXAttributes.idReferencesInInternalLink(node)).any((tuple) => tuple.value === ID);
        break;
      case 'InternalElement':
        flag = XmlCAEXAttributes.ieMasterID(node) === ID;
        break;
      case 'InterfaceIDMapping':
        flag = (node.attribute('RoleInterfaceID')?.value ?? null) === ID || (node.attribute('SystemUnitInterfaceID')?.value ?? null) === ID;
        break;
      case 'ExternalInterface':
        flag = XmlCAEXAttributes.icMasterID(node) === ID;
        break;
      case 'Attribute':
        flag = XmlCAEXAttributes.attributeMasterID(node) === ID;
        break;
      case 'AttributeNameMapping':
        flag = isInterfaceAttributeReferenceWithID(node, ID);
        break;
      default:
        flag = false;
        break;
    }
  }
  return flag;
}

/** Determines whether the XML node references another element by name (and ID). */
function isElementWithNameAndIDReference(node: XElement): boolean {
  if (!isElementWithNameOnlyReference(node) && (!(node.name.localName === 'InternalLink') || caexSchema(node) !== T.CAEXDocument.CAEXSchema.CAEX2_15)) {
    if (node.name.localName === 'Attribute') {
      return isAttributeMirror(node);
    }
    return false;
  }
  return true;
}

/** Determines whether the XML node references another element using the name of the element. */
function isElementWithNameOnlyReference(node: XElement): boolean {
  switch (node.name.localName) {
    case 'ExternalInterface':
    case 'InternalElement':
    case 'Attribute':
      // C#: `if (!node.IsOverridden()) break; goto case "AttributeNameMapping";`
      if (!XmlClassOperation.isOverridden(node)) {
        break;
      }
      return true;
    case 'AttributeNameMapping':
    case 'InterfaceNameMapping':
      return true;
  }
  return false;
}

/**
 * Determines whether the XML node is an element with a path reference; with `path`, whether it
 * is an element with a path reference to the provided path.
 */
function isElementWithPathReference(node: XElement, path?: string | null): boolean {
  if (typeof path === 'string' || path === null) {
    return isElementWithPathReferenceTo(node, path);
  }
  switch (node.name.localName) {
    case 'Attribute':
      return !isAttributeMirror(node);
    case 'RoleClass':
    case 'SystemUnitClass':
    case 'NewVersion':
    case 'OldVersion':
    case 'InterfaceClass':
    case 'RoleRequirements':
    case 'SupportedRoleClass':
    case 'AttributeType':
      return true;
    case 'InternalElement':
      return !isIEMirror(node);
    case 'ExternalInterface':
      return !isICMirror(node);
    default:
      return false;
  }
}

function isElementWithPathReferenceTo(node: XElement, path: string | null): boolean {
  switch (node.name.localName) {
    case 'InternalElement':
      return (node.attribute('RefBaseSystemUnitPath')?.value ?? null) === path;
    case 'SystemUnitClass':
    case 'RoleClass':
    case 'InterfaceClass':
    case 'ExternalInterface':
      return (node.attribute('RefBaseClassPath')?.value ?? null) === path;
    case 'RoleRequirements':
      return (node.attribute('RefBaseRoleClassPath')?.value ?? null) === path;
    case 'NewVersion':
    case 'OldVersion':
      return node.value === path;
    case 'SupportedRoleClass':
      return (node.attribute('RefRoleClassPath')?.value ?? null) === path;
    case 'Attribute':
    case 'AttributeType':
      return (node.attribute('RefAttributeType')?.value ?? null) === path;
    default:
      return false;
  }
}

function isElementWithPossibleIDReference(node: XElement): boolean {
  switch (node.name.localName) {
    case 'InternalElement':
    case 'InternalLink':
    case 'ExternalInterface':
    case 'Attribute':
    case 'AttributeNameMapping':
    case 'InterfaceIDMapping':
      return true;
    default:
      return false;
  }
}

/** Determines whether the specified element is an ExternalInterface. */
function isExternalInterface(element: XElement): boolean {
  return element.name.localName === 'ExternalInterface';
}

/** Determines whether the specified element is an ExternalReference element. */
function isExternalReference(element: XElement): boolean {
  return element.name.localName === 'ExternalReference';
}

/** Determines whether this node is an AMLFacet. */
function isFacet(node: XElement): boolean {
  if (node.name.localName === 'InternalElement') {
    return new T.AMLFacet(node).isFacet;
  }
  return false;
}

/** Determines whether the specified element is a mirror of an ExternalInterface. */
function isICMirror(element: XElement): boolean {
  return CAEXPathBuilder.isValidID(XmlCAEXAttributes.icMasterID(element), T.CAEXDocument.document(element));
}

/** Determines whether the specified element is a mirror of an InternalElement. */
function isIEMirror(element: XElement): boolean {
  return CAEXPathBuilder.isValidID(XmlCAEXAttributes.ieMasterID(element), T.CAEXDocument.document(element));
}

/** Determines whether the specified element is an InstanceHierarchy. */
function isInstanceHierarchy(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'InstanceHierarchy';
}

function isInterfaceAttributeReferenceWithID(node: XElement, Id: string | null = ''): boolean {
  // Both lookups use RoleAttributeName in the original (the second one was probably meant to
  // use SystemUnitAttributeName); ported unchanged.
  let r = CAEXPathBuilder.externalInterfaceIDInAttributeReference((node.attribute('RoleAttributeName')?.value ?? null) as string, caexDocument(node));
  let text = r.result;
  if (r.isIdReference) {
    if (!isNullOrEmpty(Id)) {
      return Id === text;
    }
    return true;
  }
  r = CAEXPathBuilder.externalInterfaceIDInAttributeReference((node.attribute('RoleAttributeName')?.value ?? null) as string, caexDocument(node));
  text = r.result;
  if (r.isIdReference) {
    if (!isNullOrEmpty(Id)) {
      return Id === text;
    }
    return true;
  }
  return false;
}

/** Determines whether the specified element is an InterfaceClass. */
function isInterfaceClass(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'InterfaceClass';
}

/** Determines whether the specified element is an InterfaceClassLib. */
function isInterfaceClassLib(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'InterfaceClassLib';
}

/** Determines whether the specified element is an InterfaceIDMapping. */
function isInterfaceIDMapping(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'InterfaceIDMapping';
}

/** Determines whether the specified element is an InterfaceNameMapping. */
function isInterfaceNameMapping(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'InterfaceNameMapping';
}

/** Determines whether the specified element is an InternalElement. */
function isInternalElement(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'InternalElement';
}

/** Determines whether the specified element is an InternalLink. */
function isInternalLink(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'InternalLink';
}

/** Determines whether the specified XML attribute is an InternalLink attribute. */
function isInternalLinkAttribute(a: XAttribute): boolean {
  const localName = a.name.localName;
  if (localName === 'RefPartnerSideA' || localName === 'RefPartnerSideB') {
    return true;
  }
  return false;
}

/** Determines whether the specified element is a CAEX library. */
function isLibrary(xmlNode: XElement): boolean {
  switch (xmlNode.name.localName) {
    case 'InstanceHierarchy':
    case 'AttributeTypeLib':
    case 'RoleClassLib':
    case 'SystemUnitClassLib':
    case 'InterfaceClassLib':
      return true;
    default:
      return false;
  }
}

/** Determines whether the specified element defines a mapping (AttributeNameMapping, InterfaceNameMapping, InterfaceIDMapping). */
function isMappingElement(xmlNode: XElement): boolean {
  switch (xmlNode.name.localName) {
    case 'AttributeNameMapping':
    case 'InterfaceNameMapping':
    case 'InterfaceIDMapping':
      return true;
    default:
      return false;
  }
}

/** Determines whether the element can define a mirror object. */
function isMirrorElement(element: XElement): boolean {
  if (!isExternalInterface(element) && !isBasicAttribute(element)) {
    return isInternalElement(element);
  }
  return true;
}

function isNewVersion(el: XElement): boolean {
  return el.name.localName === 'NewVersion';
}

function isOldVersion(el: XElement): boolean {
  return el.name.localName === 'OldVersion';
}

function isVersionReference(el: XElement): boolean {
  if (!(el.name.localName === 'ExternalReference') || !((el.attribute('Version')?.value ?? null) === 'NewVersion')) {
    return (el.attribute('Version')?.value ?? null) === 'OldVersion';
  }
  return true;
}

/** Determines whether the specified element is a Revision. */
function isRevision(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'Revision';
}

/** Determines whether the specified element is a RoleClass. */
function isRoleClass(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'RoleClass';
}

/** Determines whether the specified element is a RoleClassLib. */
function isRoleClassLib(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'RoleClassLib';
}

/** Determines whether the specified element is a RoleRequirements element. */
function isRoleRequirement(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'RoleRequirements';
}

/** Determines whether the specified element is a SupportedRoleClass. */
function isSupportedRoleClass(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'SupportedRoleClass';
}

/** Determines whether the specified element is a SystemUnitClass. */
function isSystemUnitClass(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'SystemUnitClass';
}

/** Determines whether the specified element is a SystemUnitClassLib. */
function isSystemUnitClassLib(xmlNode: XElement): boolean {
  return xmlNode.name.localName === 'SystemUnitClassLib';
}

/** Local name of an attribute or element; null for other objects (C# extension `Name`). */
function name(obj: XObject | null): string | null {
  if (!(obj instanceof XAttribute)) {
    if (!(obj instanceof XElement)) {
      return null;
    }
    return obj.name.localName;
  }
  return obj.name.localName;
}

/** Gets the names of the attributes of the provided node, which reference objects by name. */
function nameReferenceAttributes(xmlNode: XElement): string[] {
  switch (xmlNode.name.localName) {
    case 'ExternalInterface':
      return ['Name'];
    case 'Attribute':
      if (isAttributeMirror(xmlNode)) {
        return ['Name', 'RefAttributeType'];
      }
      return ['Name'];
    case 'InternalElement':
      return ['Name'];
    case 'InterfaceNameMapping':
      return ['RoleInterfaceName', 'SystemUnitInterfaceName'];
    case 'AttributeNameMapping':
      return ['RoleAttributeName', 'SystemUnitAttributeName'];
    case 'InternalLink':
      return ['RefPartnerSideA', 'RefPartnerSideB'];
    default:
      return [];
  }
}

/** Gets the name of the path reference attribute: RefAttributeType for an AttributeType, RefBaseClassPath otherwise. */
function pathReferenceAttributeName(xmlNode: XElement): string {
  if (xmlNode.name.localName === 'AttributeType') {
    return 'RefAttributeType';
  }
  return 'RefBaseClassPath';
}

/** Gets the names of the attributes of the provided XML node, which can contain a path reference. */
function pathReferenceAttributes(xmlNode: XElement): string[] {
  if (isBasicAttribute(xmlNode) || isAttributeType(xmlNode)) {
    return ['RefAttributeType'];
  }
  let result: string[];
  if (isInternalElement(xmlNode)) {
    result = ['RefBaseSystemUnitPath'];
  } else {
    let array: string[];
    if (isCAEXClass(xmlNode) || isExternalInterface(xmlNode)) {
      array = ['RefBaseClassPath'];
    } else {
      const localName = xmlNode.name.localName;
      array =
        localName === 'RoleRequirements'
          ? ['RefBaseRoleClassPath']
          : !(localName === 'SupportedRoleClass')
            ? caexSchema(xmlNode) !== T.CAEXDocument.CAEXSchema.CAEX2_15 || !(xmlNode.name.localName === 'InternalLink')
              ? [pathReferenceValue(xmlNode)]
              : ['RefPartnerSideA', 'RefPartnerSideB']
            : ['RefRoleClassPath'];
    }
    result = array;
  }
  return result;
}

function pathReferenceValue(xmlNode: XElement): string {
  if (!isNewVersion(xmlNode) && !isOldVersion(xmlNode)) {
    return '';
  }
  return 'Value';
}

/**
 * Gets the element which is referenced by the specified attribute or element (the C# overloads
 * for XAttribute, XElement and XObject dispatch on the run time type).
 */
function referencedElement(reference: XObject | null, nameReference: string | null = null): XElement | null {
  if (reference instanceof XAttribute) {
    return referencedElementFromAttribute(reference, nameReference);
  }
  if (reference instanceof XElement) {
    return referencedElementFromElement(reference, nameReference);
  }
  return null;
}

function referencedElementFromAttribute(reference: XAttribute, nameReference: string | null): XElement | null {
  if (isInternalLinkAttribute(reference)) {
    return XmlOperation.interfaceFromInternalLinkAttribute(reference, nameReference);
  }
  if (isAttributeReference(reference)) {
    return XmlOperation.masterAttribute(reference, nameReference);
  }
  if (!isMappingElement(reference.parent!)) {
    return from(XmlClassOperation.overriddenElements(reference.parent!, nameReference ?? reference.value)).firstOrDefault();
  }
  return XmlCAEXMapping.referencedElementFromMapping(reference, nameReference);
}

function referencedElementFromElement(reference: XElement, newValue: string | null): XElement | null {
  let text: string | null = reference.value;
  if (isNullOrEmpty(text) && !isNullOrEmpty(newValue)) {
    text = newValue;
  }
  if (!isNewVersion(reference) && !isOldVersion(reference)) {
    return null;
  }
  return ServiceLocator.queryService.findByPath(caexDocument(reference), text)?.node ?? null;
}

/** Gets the schema manager used to manage any modifications of the provided XML node. */
function schemaManager(xmlNode: XElement): AMLSchemaManager {
  if (!(xmlNode.name.namespace === T.AMLSchemaManager3_0.caexNamespace)) {
    return T.AMLSchemaManager2_15.instance;
  }
  return T.AMLSchemaManager3_0.instance;
}

/** Value of an attribute or element; null for other objects (C# extension `Value`). */
function value(obj: XObject | null): string | null {
  if (!(obj instanceof XAttribute)) {
    if (!(obj instanceof XElement)) {
      return null;
    }
    return obj.value;
  }
  return obj.value;
}

/**
 * Gets the XName for the provided CAEX tag name, in the namespace of the provided node.
 */
function xName(node: XElement | null, tagname: string): XName {
  const xNamespace = node?.name.namespace ?? XNamespace.None;
  if (!(xNamespace === XNamespace.None)) {
    return xNamespace.getName(tagname);
  }
  return XName.get(tagname);
}

/** Extension methods related to the interpretation of the schema version of a CAEX file. */
export const XmlCAEXSchema = {
  caexDocument,
  caexSchema,
  idFromReference,
  idReferenceAttributes,
  isAdditionalInformation,
  isAttributeOrType,
  isAttribute,
  isAttributeMirror,
  isAttributeNameMapping,
  isAttributeReference,
  isAttributeType,
  isAttributeTypeLib,
  isBasicAttribute,
  isCAEXClass,
  isCAEXFile,
  isDirectReferenceToBaseClass,
  isElementWithMandatoryID,
  isElementWithIDReference,
  isElementWithNameAndIDReference,
  isElementWithNameOnlyReference,
  isElementWithPathReference,
  isElementWithPossibleIDReference,
  isExternalInterface,
  isExternalReference,
  isFacet,
  isICMirror,
  isIEMirror,
  isInstanceHierarchy,
  isInterfaceAttributeReferenceWithID,
  isInterfaceClass,
  isInterfaceClassLib,
  isInterfaceIDMapping,
  isInterfaceNameMapping,
  isInternalElement,
  isInternalLink,
  isInternalLinkAttribute,
  isLibrary,
  isMappingElement,
  isMirrorElement,
  isNewVersion,
  isOldVersion,
  isVersionReference,
  isRevision,
  isRoleClass,
  isRoleClassLib,
  isRoleRequirement,
  isSupportedRoleClass,
  isSystemUnitClass,
  isSystemUnitClassLib,
  name,
  nameReferenceAttributes,
  pathReferenceAttributeName,
  pathReferenceAttributes,
  pathReferenceValue,
  referencedElement,
  schemaManager,
  value,
  xName,
} as const;
