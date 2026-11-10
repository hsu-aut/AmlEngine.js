// Port of Aml.Engine.Services.Lookup.IDTable (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { AttributeType } from '../../engine/caex/AttributeType.js';
import { CAEXDocument_CAEXSchema } from '../../engine/caex/CAEXDocument.js';
import { ExternalInterfaceType } from '../../engine/caex/ExternalInterfaceType.js';
import { InternalLinkType } from '../../engine/caex/InternalLinkType.js';
import { SystemUnitClassType } from '../../engine/caex/SystemUnitClassType.js';
import { CAEXBasicObjectExtensions } from '../../engine/caex/extensions/CAEXBasicObjectExtensions.js';
import { CAEXPathBuilder } from '../../engine/caex/extensions/CAEXPathBuilder.js';
import { XmlCAEXAttributes } from '../../engine/xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../../engine/xmlext/XmlCAEXSchema.js';
import { Enumerable, from } from '../../system/linq.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import type { CAEXBasicObject } from '../../engine/caex/CAEXBasicObject.js';
import type { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import type { CAEXObject } from '../../engine/caex/CAEXObject.js';
import type { CAEXWrapper } from '../../engine/caex/CAEXWrapper.js';
import type { ICAEXReference } from '../../engine/services/interfaces/ICAEXReference.js';
import { CAEXNodeTable } from './CAEXNodeTable.js';
import { CAEXNode_Identifier, type CAEXNode } from './CAEXNode.js';
import { ReferenceElement } from './ReferenceElement.js';
import { LookupService } from '../LookupService.js';
import type { CAEXNodeReference } from './CAEXNodeReference.js';
import type { IDReference } from './IDReference.js';

/** C# `s.Equals(value)` (ordinal) on a string that may be null: a null `s` fails as in C#. */
function stringEquals(s: string | null, value: string | null): boolean {
  if (s === null) {
    throw new TypeError("Cannot read properties of null (reading 'Equals')");
  }
  return s === value;
}

/** Node table used to register nodes with IDs as key. */
export class IDTable extends CAEXNodeTable {
  /** The ID references of all nodes. */
  get allIDReferences(): Enumerable<CAEXNodeReference> {
    return new Enumerable(() => this.values()).selectMany<CAEXNodeReference>((c) => c.idReferences);
  }

  /** The name references held by the nodes: InternalLinks (CAEX 2.15) or attribute mirrors. */
  get nameReferences(): Enumerable<CAEXNodeReference> {
    const document = this.document;
    if (document !== null && document.schema === CAEXDocument_CAEXSchema.CAEX2_15) {
      return new Enumerable(() => this.values()).selectMany<CAEXNodeReference>((c) => c.internalLinks);
    }
    return new Enumerable(() => this.values()).selectMany<CAEXNodeReference>((c) => c.attributeReferences);
  }

  constructor(document: CAEXDocument | null) {
    super(document);
  }

  /** Registers the element with the ID (the node of the class table, if it is a class). */
  addIDElement(id: string, element: XElement | null, caexNode: CAEXNode | null): CAEXNode {
    if (caexNode === null) {
      return this.addNewNode(id, CAEXNode_Identifier.ID, element);
    }
    caexNode = this.addNode(id, CAEXNode_Identifier.ID, caexNode).node;
    return caexNode;
  }

  /** All elements with an ID below (or including) the object, with the ID or with any ID. */
  allElementsWithID(caexObject: CAEXBasicObject, iD: string | null): Enumerable<{ id: string; reference: ReferenceElement }> {
    const root = CAEXNodeTable.root(caexObject);
    if (isNullOrWhiteSpace(iD)) {
      return from(this)
        .selectMany(([key, value]) => value.allNodes(CAEXNode_Identifier.ID).select((n) => ({ id: key, element: n.element })))
        .where((n) => CAEXNodeTable.isDescendant(n.element, root, true))
        .where((n) => n.element !== null)
        .select((n) => ({ id: n.id, reference: new ReferenceElement(n.element, n.element?.name.localName ?? null) }));
    }
    const r = this.tryGetValue(iD!);
    if (r.result) {
      return r
        .value!.allNodes(CAEXNode_Identifier.ID)
        .where((n) => CAEXNodeTable.isDescendant(n.element, root, true))
        .select((n) => ({ id: iD!, reference: new ReferenceElement(n.element, n.element?.name.localName ?? null) }));
    }
    return Enumerable.empty<{ id: string; reference: ReferenceElement }>();
  }

  /** The mirrors of the master attribute (CAEX 3.0). */
  attributeMirrors(master: AttributeType): Enumerable<AttributeType> {
    if (CAEXBasicObjectExtensions.caexSchema(master) === CAEXDocument_CAEXSchema.CAEX2_15) {
      return Enumerable.empty<AttributeType>();
    }
    const fromAttribute = this.getFromAttribute(master);
    if (fromAttribute === null) {
      return Enumerable.empty<AttributeType>();
    }
    const path = master.caexPath();
    return fromAttribute.attributeReferences.where((a) => stringEquals(a.referenceAttributeValue, path)).select((r) => r.caexObject as AttributeType);
  }

  /** An attribute has changed its name: the mirror references to it are updated. */
  changeAttributeName(xElement: XElement, oldName: string | null, newName: string | null): void {
    void newName;
    if (XmlCAEXSchema.caexSchema(xElement) !== CAEXDocument_CAEXSchema.CAEX2_15) {
      const val = new AttributeType(xElement);
      const fromAttribute = this.getFromAttribute(val);
      if (fromAttribute !== null) {
        const text = val.caexPath()!;
        const oldPath = text.substring(0, text.lastIndexOf('/') + 1) + (oldName ?? '');
        fromAttribute.updateAttributeReferences(oldPath, text);
      }
    }
  }

  /** An ExternalInterface has changed its name: the references to it are updated. */
  changeInterfaceName(xElement: XElement, oldName: string | null, newName: string | null): void {
    const r = this.tryGetValue(XmlCAEXAttributes.caexidOfElement(xElement));
    if (r.result) {
      for (const iDReference of r.value!.idReferences) {
        LookupService.lookUpService!.onReferenceUpdate(xElement, iDReference, oldName, newName);
      }
    }
    const extInterface = new ExternalInterfaceType(xElement);
    this.getFromInterface(extInterface)?.updateInterfaceReferences(oldName, newName);
  }

  /** Removes the element from the table; the references to it are cleared. */
  delete(xElement: XElement): void {
    let text = XmlCAEXAttributes.caexidOfElement(xElement);
    if (isNullOrWhiteSpace(text)) {
      text = ' ';
    }
    const r = this.tryGetValue(text);
    if (r.result) {
      const u = r.value!.getUpdatedNode(xElement, CAEXNode_Identifier.ID);
      u.result?.updateIDReferences(null, null);
      if (u.newRoot === null) {
        this.remove(text);
      } else {
        this.setItem(text, u.newRoot);
      }
    }
  }

  /** A deleted attribute: the mirror references to it are cleared. */
  deleteAttributeReference(xElement: XElement): void {
    if (XmlCAEXSchema.isAttribute(xElement) && XmlCAEXSchema.caexSchema(xElement) !== CAEXDocument_CAEXSchema.CAEX2_15) {
      const val = new AttributeType(xElement);
      const fromAttribute = this.getFromAttribute(val);
      if (fromAttribute !== null) {
        const oldPath = val.caexPath();
        fromAttribute.updateAttributeReferences(oldPath, null);
      }
    }
  }

  /** A deleted ExternalInterface (CAEX 2.15): the InternalLink references to it are cleared. */
  deleteInterfaceReference(xElement: XElement): void {
    if (XmlCAEXSchema.isExternalInterface(xElement) && XmlCAEXSchema.caexSchema(xElement) === CAEXDocument_CAEXSchema.CAEX2_15) {
      const val = new ExternalInterfaceType(xElement);
      this.getFromInterface(val)?.updateInterfaceReferences(val.name, null);
    }
  }

  /** The references to the ID from elements below the object. */
  elementsWithIDReference(caexObject: CAEXBasicObject, iD: string | null, elementName: string | null = ''): Enumerable<ICAEXReference> {
    const root = CAEXNodeTable.root(caexObject);
    const cAEXNode = this.findByID(iD);
    if (cAEXNode === null) {
      return Enumerable.empty<ICAEXReference>();
    }
    if (isNullOrEmpty(elementName)) {
      return cAEXNode.idReferences.where((r) => CAEXNodeTable.isDescendant(r.element, root, false)).cast<ICAEXReference>();
    }
    return cAEXNode.idReferences.where((r) => CAEXNodeTable.isDecendantWithName(r.element, root, elementName, false)).cast<ICAEXReference>();
  }

  /** The SystemUnitClasses below the object with InternalLinks to them or to their interfaces. */
  elementsWithInternalLinkRelations(caexObject: CAEXBasicObject): Enumerable<SystemUnitClassType> {
    const source = from(CAEXBasicObjectExtensions.descendants(caexObject as CAEXWrapper))
      .where((c) => c instanceof SystemUnitClassType)
      .cast<SystemUnitClassType>();
    if (CAEXBasicObjectExtensions.caexSchema(caexObject) !== CAEXDocument_CAEXSchema.CAEX2_15) {
      return source.where((s) => s.externalInterfaceAndDescendants.any((e) => this.hasInternalLinkWithIDReference(e)));
    }
    return source.where((s) => this.hasInternalLinkWithIDReference(s));
  }

  /** Finds a CAEX node by its ID. */
  findByID(ID: string | null): CAEXNode | null {
    if (ID === null) {
      return null;
    }
    return this.tryGetValue(ID).value;
  }

  /** The node of the ID or, if there is none, the node which holds the reference of the element under another key. */
  fíndByReference(ID: string | null, xElement: XElement, attributeName: string | null): CAEXNode | null {
    const cAEXNode = this.findByID(ID);
    if (cAEXNode !== null) {
      return cAEXNode;
    }
    for (const [key, value] of this) {
      const iDReference = value.idReferences.firstOrDefault((r) => r.referenceAttributeName === attributeName && r.element === xElement);
      if (iDReference !== null && iDReference.referenceID !== key) {
        return value;
      }
    }
    return null;
  }

  /** The ID references from the elements below (or including) the object, optionally with the element name. */
  idReferencesByFilter(caexObject: CAEXBasicObject, elementName: string | null, includeSelf: boolean): Enumerable<CAEXNodeReference> {
    const root = CAEXNodeTable.root(caexObject);
    if (!isNullOrEmpty(elementName)) {
      return this.allIDReferences.where((r) => CAEXNodeTable.isDecendantWithName(r.element, root, elementName, includeSelf));
    }
    return this.allIDReferences.where((r) => CAEXNodeTable.isDescendant(r.element, root, includeSelf));
  }

  /** The ExternalInterfaces below the object with InternalLinks to them. */
  interfacesWithInternalLinkRelations(caexObject: CAEXBasicObject): Enumerable<ExternalInterfaceType> {
    const source = from(CAEXBasicObjectExtensions.descendants(caexObject as CAEXWrapper, ExternalInterfaceType));
    if (CAEXBasicObjectExtensions.caexSchema(caexObject) === CAEXDocument_CAEXSchema.CAEX2_15) {
      return source.where((e) => this.hasInternalLinkWithNameReference(e));
    }
    return source.where((e) => this.hasInternalLinkWithIDReference(e));
  }

  /** The InternalLinks to the SystemUnitClass (CAEX 2.15) or to its interfaces. */
  internalLinksToElement(systemUnitClass: SystemUnitClassType): Enumerable<InternalLinkType | null> {
    if (CAEXBasicObjectExtensions.caexSchema(systemUnitClass) === CAEXDocument_CAEXSchema.CAEX2_15) {
      return this.internalLinks(systemUnitClass.id);
    }
    const list: (InternalLinkType | null)[] = [];
    for (const externalInterfaceAndDescendant of systemUnitClass.externalInterfaceAndDescendants) {
      for (const item of this.internalLinks(externalInterfaceAndDescendant.id)) {
        list.push(item);
      }
    }
    return from(list).distinct();
  }

  /** The InternalLinks to the ExternalInterface. */
  internalLinksToInterface(externalInterface: ExternalInterfaceType): Enumerable<InternalLinkType | null> {
    if (CAEXBasicObjectExtensions.caexSchema(externalInterface) === CAEXDocument_CAEXSchema.CAEX2_15) {
      const list: InternalLinkType[] = [];
      const fromInterface = this.getFromInterface(externalInterface);
      if (fromInterface === null) {
        return Enumerable.empty<InternalLinkType | null>();
      }
      for (const internalLink of fromInterface.internalLinks) {
        if (CAEXPathBuilder.externalInterfaceNameInInternalLinkReference(internalLink.referenceAttributeValue).result === externalInterface.name) {
          list.push(internalLink.caexObject as InternalLinkType);
        }
      }
      return from<InternalLinkType | null>(list).distinct();
    }
    return this.internalLinks(externalInterface.id);
  }

  /** The attribute is the master of a mirror attribute (CAEX 3.0). */
  isAttributeMaster(attribute: AttributeType): boolean {
    if (CAEXBasicObjectExtensions.caexSchema(attribute) === CAEXDocument_CAEXSchema.CAEX2_15) {
      return false;
    }
    const fromAttribute = this.getFromAttribute(attribute);
    if (fromAttribute === null) {
      return false;
    }
    const value = attribute.caexPath();
    for (const attributeReference of fromAttribute.attributeReferences) {
      if (stringEquals(attributeReference.referenceAttributeValue, value)) {
        return true;
      }
    }
    return false;
  }

  /** The ID of the element has changed: the node is registered with the new ID and the references are updated. */
  updateIDReferences(xElement: XElement, oldID: string | null, newID: string | null): void {
    if (isNullOrWhiteSpace(oldID)) {
      oldID = ' ';
    }
    const r = this.tryGetValue(oldID!);
    if (!r.result) {
      if (!isNullOrWhiteSpace(newID)) {
        this.addNewNode(newID!, CAEXNode_Identifier.ID, xElement);
      } else if (XmlCAEXSchema.isElementWithMandatoryID(xElement)) {
        this.addNewNode(' ', CAEXNode_Identifier.ID, xElement);
      }
      return;
    }
    const u = r.value!.getUpdatedNode(xElement, CAEXNode_Identifier.ID);
    const updatedNode = u.result;
    if (u.newRoot === null) {
      this.remove(oldID!);
    } else {
      this.setItem(oldID!, u.newRoot);
    }
    if (isNullOrWhiteSpace(newID)) {
      if (!XmlCAEXSchema.isElementWithMandatoryID(xElement)) {
        return;
      }
      newID = ' ';
    }
    if (updatedNode !== null) {
      this.addIDElement(newID!, xElement, updatedNode);
      updatedNode.updateIDReferences(oldID, newID);
    }
  }

  private getFromAttribute(attribute: AttributeType): CAEXNode | null {
    const attributeTreeOwner = attribute.attributeTreeOwner;
    const val = attributeTreeOwner instanceof SystemUnitClassType ? attributeTreeOwner : null;
    if (val === null || val.id === null) {
      return null;
    }
    return this.findByID(val.id);
  }

  private getFromInterface(extInterface: ExternalInterfaceType): CAEXNode | null {
    const associatedObject = extInterface.associatedObject;
    const val = associatedObject instanceof SystemUnitClassType ? associatedObject : null;
    if (val === null || val.id === null) {
      return null;
    }
    return this.findByID(val.id);
  }

  private hasInternalLinkWithIDReference(cAEXObject: CAEXObject): boolean {
    return this.findByID(cAEXObject.id)?.internalLinks.any() ?? false;
  }

  private hasInternalLinkWithNameReference(extInterface: ExternalInterfaceType): boolean {
    return this.getFromInterface(extInterface)?.internalLinks.any((i: IDReference) => i.linkReferenceHasInterface(extInterface.name)) ?? false;
  }

  private internalLinks(id: string | null): Enumerable<InternalLinkType | null> {
    const cAEXNode = this.findByID(id);
    if (cAEXNode === null) {
      return Enumerable.empty<InternalLinkType | null>();
    }
    return cAEXNode.internalLinks.select((c) => {
      const caexObject = c.caexObject;
      return caexObject instanceof InternalLinkType ? caexObject : null;
    });
  }
}
