// Port of Aml.Engine.Services.Lookup.LookupTables (Aml.Engine.Services 4.3.1).

import '../../engine/index.js';
import { CAEXWrapper } from '../../engine/caex/CAEXWrapper.js';
import { CAEXDocument_CAEXSchema } from '../../engine/caex/CAEXDocument.js';
import { CAEXPathBuilder } from '../../engine/caex/extensions/CAEXPathBuilder.js';
import { InheritanceExtensions } from '../../engine/caex/extensions/InheritanceExtensions.js';
import { implementsInterface } from '../../engine/interfaces.js';
import { XmlCAEXAttributes } from '../../engine/xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../../engine/xmlext/XmlCAEXSchema.js';
import { XmlClassOperation } from '../../engine/xmlext/XmlClassOperation.js';
import { ArgumentOutOfRangeException } from '../../system/exceptions.js';
import type { Enumerable } from '../../system/linq.js';
import { isNullOrEmpty, isNullOrWhiteSpace } from '../../system/strings.js';
import { XElement } from '../../xml/index.js';
import type { CAEXBasicObject } from '../../engine/caex/CAEXBasicObject.js';
import type { CAEXDocument } from '../../engine/caex/CAEXDocument.js';
import type { CAEXObject } from '../../engine/caex/CAEXObject.js';
import type { ICAEXWrapper } from '../../engine/caex/ICAEXWrapper.js';
import { AliasTable } from './AliasTable.js';
import { CAEXNode_Identifier } from './CAEXNode.js';
import { CAEXNodeReference } from './CAEXNodeReference.js';
import { ClassTable } from './ClassTable.js';
import { ElementWithReference } from './ElementWithReference.js';
import { IDReference } from './IDReference.js';
import { IDTable } from './IDTable.js';
import { NameReferenceTable } from './NameReferenceTable.js';
import { PathReference } from './PathReference.js';
import type { CAEXNode } from './CAEXNode.js';
import type { LookupService } from '../LookupService.js';

/** The kinds of references an element defines ([Flags]). */
export enum LookupTables_ReferenceTypeEnum {
  None = 0,
  Path = 1,
  ID = 4,
  Name = 8,
}

/** C# `HasFlag`. */
function hasFlag(value: LookupTables_ReferenceTypeEnum, flag: LookupTables_ReferenceTypeEnum): boolean {
  return (value & flag) === flag;
}

/** C# `array[..^1]`: all but the last item; an empty array throws as RuntimeHelpers.GetSubArray. */
function allButLast(array: readonly string[]): string[] {
  if (array.length === 0) {
    throw new ArgumentOutOfRangeException('length');
  }
  return array.slice(0, -1);
}

const FACET_PATH = 'AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Facet';

/** All tables where CAEX elements are registered using a property of the element as an index. */
export class LookupTables {
  static readonly ReferenceTypeEnum = LookupTables_ReferenceTypeEnum;

  private readonly lookupService: LookupService;

  readonly aliasTable: AliasTable;

  readonly classTable: ClassTable;

  readonly idTable: IDTable;

  readonly nameRefTable: NameReferenceTable;

  private readonly document: CAEXDocument;

  /**
   * C# constructors LookupTables(LookupService) (the primary constructor, no tables) and
   * LookupTables(LookupService, CAEXDocument).
   */
  constructor(lookupService: LookupService, document?: CAEXDocument) {
    this.lookupService = lookupService;
    if (document === undefined) {
      this.document = null as unknown as CAEXDocument;
      this.classTable = null as unknown as ClassTable;
      this.idTable = null as unknown as IDTable;
      this.aliasTable = null as unknown as AliasTable;
      this.nameRefTable = null as unknown as NameReferenceTable;
      return;
    }
    this.document = document;
    this.classTable = new ClassTable(document);
    this.idTable = new IDTable(document);
    this.aliasTable = new AliasTable(document);
    this.nameRefTable = new NameReferenceTable();
    this.nameRefTable.idTable = this.idTable;
  }

  /**
   * Adds the specified XML element (C# overloads for an ICAEXWrapper and an XElement) and all its
   * descendants to the tables. An element is added if it is a CAEX class, an element with an
   * identifier, an element with an ID reference or an element with a path reference.
   */
  addElementAndDescandants(caexOrRoot: ICAEXWrapper | XElement): void {
    if (!(caexOrRoot instanceof XElement)) {
      this.addElementAndDescandants(caexOrRoot.node!);
      return;
    }
    const root = caexOrRoot;
    InheritanceExtensions.derivedClasses.addClassDerivations(this.document, FACET_PATH, 'RoleClass');
    const list: ElementWithReference[] = [];
    this.addIdentifiedElements(root, list);
    for (let i = 0; i < list.length; i++) {
      this.addReference(list[i]!);
    }
    InheritanceExtensions.derivedClasses.delete(FACET_PATH);
  }

  /** An ID reference of the element has changed. */
  changeIDRef(xElement: XElement, attribute: string | null, oldIDRef: string | null, newIDRef: string | null): void {
    if (isNullOrWhiteSpace(oldIDRef) && !isNullOrWhiteSpace(newIDRef)) {
      this.addIDReference(xElement, attribute);
      if (isNullOrEmpty(oldIDRef)) {
        this.deleteIDReference(xElement, attribute, ' ');
      }
    } else {
      this.deleteIDReference(xElement, attribute, oldIDRef);
      this.addIDReference(xElement, attribute);
    }
  }

  /** The element has changed its name. */
  changeName(xElement: XElement, oldName: string | null, newName: string | null): void {
    if (isNullOrWhiteSpace(oldName)) {
      oldName = ' ';
    }
    if (isNullOrWhiteSpace(newName)) {
      newName = ' ';
    }
    this.nameRefTable.changeName(xElement, oldName, newName);
    if (XmlCAEXSchema.isAttribute(xElement)) {
      this.idTable.changeAttributeName(xElement, oldName, newName);
    } else if (XmlCAEXSchema.isExternalInterface(xElement)) {
      this.idTable.changeInterfaceName(xElement, oldName, newName);
    }
    if (XmlCAEXSchema.isCAEXClass(xElement, true)) {
      const subArray = allButLast(CAEXPathBuilder.pathNameArray(XmlCAEXAttributes.caexPath(xElement), this.document.schema, false));
      if (subArray.length === 0) {
        this.classTable.updatedPathReferences(oldName!, newName!, xElement);
      } else {
        this.classTable.item(subArray, 0)?.children?.updatedPathReferences(oldName!, newName!, xElement);
      }
    }
  }

  /** A path reference of the element has changed. */
  changePathRef(xElement: XElement, attribute: string | null, oldPathRef: string | null, newPathRef: string | null): void {
    void newPathRef;
    if (isNullOrWhiteSpace(oldPathRef)) {
      oldPathRef = ' ';
    }
    this.deletePathReference(xElement, attribute, oldPathRef);
    this.addPathReference(xElement, attribute);
  }

  /** Clears the class, ID and alias tables (not the name reference table). */
  clear(): void {
    this.classTable.clear();
    this.idTable.clear();
    this.aliasTable.clear();
  }

  /** The element and all its descendants are deleted from the registry. */
  deleteElementAndDescandants(rootElement: XElement): void {
    if (XmlCAEXSchema.isCAEXClass(rootElement, true)) {
      const text = XmlCAEXAttributes.caexPath(rootElement);
      ClassTable.deletedNodesWithReference = [];
      this.classTable.delete(rootElement, CAEXPathBuilder.pathNameArray(text, this.document.schema, false));
      for (const item of ClassTable.deletedNodesWithReference) {
        const node: CAEXNode = item;
        this.classTable.addNode(' ', CAEXNode_Identifier.NAME, node);
      }
      ClassTable.deletedNodesWithReference.length = 0;
    }
    for (const item2 of rootElement.descendantsAndSelf()) {
      if (XmlCAEXSchema.isExternalReference(item2)) {
        this.aliasTable.updateAliasReferences(item2.attribute('Alias')?.value ?? null, null, true);
      }
      if (item2.attribute('ID') !== null) {
        this.idTable.delete(item2);
      }
      if (XmlCAEXSchema.isElementWithPathReference(item2)) {
        this.deletePathReference(item2, '', '');
      }
      if (XmlCAEXSchema.isElementWithIDReference(item2)) {
        this.deleteIDReference(item2, '', '');
      }
      this.nameRefTable.delete(item2);
      this.idTable.deleteAttributeReference(item2);
      this.idTable.deleteInterfaceReference(item2);
    }
  }

  private static attributeValue(xElement: XElement, attribute: string): string | null {
    return xElement.attribute(attribute)?.value ?? null;
  }

  /**
   * The element and all its descendants are checked if they are identifiable by path or ID and
   * added as CAEX nodes to the related tables.
   */
  private addIdentifiedElements(rootElement: XElement, elementsWithReference: ElementWithReference[]): void {
    for (const item of rootElement.descendantsAndSelf()) {
      let caexNode: CAEXNode | null = null;
      if (XmlCAEXSchema.isCAEXClass(item, true)) {
        const path = XmlCAEXAttributes.caexPath(item);
        caexNode = this.classTable.addPathElement(path, item);
      }
      if (item.attribute('ID') !== null || XmlCAEXSchema.isElementWithMandatoryID(item)) {
        let text = XmlCAEXAttributes.caexidOfElement(item);
        let flag = true;
        if (isNullOrWhiteSpace(text)) {
          if (!XmlCAEXSchema.isElementWithMandatoryID(item)) {
            flag = false;
          } else {
            text = ' ';
          }
        }
        if (flag) {
          this.idTable.addIDElement(text, item, caexNode);
        }
      }
      let referenceTypeEnum = LookupTables_ReferenceTypeEnum.None;
      if (XmlCAEXSchema.isElementWithPathReference(item)) {
        referenceTypeEnum |= LookupTables_ReferenceTypeEnum.Path;
      }
      if (XmlCAEXSchema.isElementWithIDReference(item)) {
        referenceTypeEnum |= LookupTables_ReferenceTypeEnum.ID;
      }
      if (XmlCAEXSchema.isElementWithNameOnlyReference(item)) {
        referenceTypeEnum |= LookupTables_ReferenceTypeEnum.Name;
      }
      if (referenceTypeEnum !== LookupTables_ReferenceTypeEnum.None) {
        elementsWithReference.push(new ElementWithReference(item, referenceTypeEnum));
      }
    }
  }

  private addNameReference(xElement: XElement, attributeName: string | null = null): void {
    if (attributeName === null) {
      const array = XmlCAEXSchema.nameReferenceAttributes(xElement);
      for (const attributeName2 of array) {
        this.addToNameRefTable(xElement, attributeName2);
      }
    } else {
      this.addToNameRefTable(xElement, attributeName);
    }
  }

  private addToNameRefTable(xElement: XElement, attributeName: string): void {
    if (LookupTables.attributeHasValue(xElement, attributeName).result) {
      const xAttribute = xElement.attribute(attributeName);
      const referencedElement = xAttribute !== null ? XmlCAEXSchema.referencedElement(xAttribute, null) : null;
      this.nameRefTable.addReference(referencedElement, new CAEXNodeReference(xElement, attributeName));
    }
  }

  /**
   * The provided element is identified as an element with an ID reference. The reference is added
   * to the referenced node. This enables to change the reference, if a node's ID changes.
   */
  private addIDReference(xElement: XElement, attributeName: string | null = null): void {
    if (attributeName === null) {
      const array = XmlCAEXSchema.idReferenceAttributes(xElement);
      for (const attributeName2 of array) {
        this.addToIDTable(xElement, attributeName2);
      }
    } else {
      this.addToIDTable(xElement, attributeName);
    }
  }

  /**
   * The value of the attribute, or of the element for "Value" (C# out parameter value: " " for
   * an empty value). False, if the attribute is missing and not required.
   */
  static attributeHasValue(xElement: XElement, attributeName: string): { result: boolean; value: string } {
    let value = ' ';
    const xAttribute = xElement.attribute(attributeName);
    if (xAttribute === null) {
      if (attributeName === 'Value') {
        value = xElement.value;
        return { result: true, value };
      }
      if (xElement.attribute(attributeName) === null && !XmlCAEXSchema.schemaManager(xElement).isRequiredAttribute(null, xElement.name, attributeName)) {
        return { result: false, value };
      }
    } else {
      value = xAttribute.value;
    }
    if (isNullOrEmpty(value)) {
      value = ' ';
    }
    return { result: true, value };
  }

  private addToIDTable(xElement: XElement, attributeName: string): void {
    const r = LookupTables.attributeHasValue(xElement, attributeName);
    if (!r.result) {
      return;
    }
    const value = r.value;
    const text = CAEXPathBuilder.aliasFromReference(value, CAEXDocument_CAEXSchema.Unknown);
    if (!isNullOrEmpty(text)) {
      this.aliasTable.addAliasReference(text, CAEXNode_Identifier.ID, xElement, attributeName);
      return;
    }
    let text2: string | null = XmlCAEXSchema.idFromReference(xElement, attributeName, null);
    if (isNullOrWhiteSpace(text2)) {
      text2 = ' ';
    }
    const cAEXNode = this.idTable.findByID(text2) ?? this.idTable.addNewNode(text2!, CAEXNode_Identifier.ID, null);
    const reference = new IDReference(xElement, attributeName);
    cAEXNode.addReference(reference);
    if (cAEXNode.element !== null) {
      this.lookupService.onReferenceUpdate(cAEXNode.element, reference, null, value);
    }
  }

  private addToClassTable(xElement: XElement, attributeName: string): void {
    const r = LookupTables.attributeHasValue(xElement, attributeName);
    if (r.result) {
      const value = r.value;
      const text = CAEXPathBuilder.aliasFromReference(value, CAEXDocument_CAEXSchema.Unknown);
      if (!isNullOrEmpty(text)) {
        this.aliasTable.addAliasReference(text, CAEXNode_Identifier.NAME, xElement, attributeName);
        return;
      }
      const path = ClassTable.getPath(xElement, value);
      const cAEXNode = this.classTable.findByPath(path) ?? this.classTable.addPathElement(path, null);
      const reference = new PathReference(xElement, attributeName);
      cAEXNode.addReference(reference);
      this.lookupService.onReferenceUpdate(cAEXNode.element, reference, null, value);
    }
  }

  /**
   * The provided element is identified as an element with a path reference. The reference is added
   * to the referenced node. This enables to change the reference, if the node's path changes.
   * If attributeName is null, all path reference attributes are added; otherwise only the named one.
   */
  private addPathReference(xElement: XElement, attributeName: string | null = null): void {
    if (attributeName === null) {
      const array = XmlCAEXSchema.pathReferenceAttributes(xElement);
      for (const attributeName2 of array) {
        this.addToClassTable(xElement, attributeName2);
      }
    } else {
      this.addToClassTable(xElement, attributeName);
    }
  }

  /** Adds the identified reference types of the element to the referenced CAEX nodes. */
  private addReference(elementReference: ElementWithReference): void {
    if (hasFlag(elementReference.refType, LookupTables_ReferenceTypeEnum.Path)) {
      this.addPathReference(elementReference.element!);
    }
    if (hasFlag(elementReference.refType, LookupTables_ReferenceTypeEnum.ID)) {
      this.addIDReference(elementReference.element!);
    }
    if (hasFlag(elementReference.refType, LookupTables_ReferenceTypeEnum.Name)) {
      this.addNameReference(elementReference.element!);
    }
  }

  /**
   * The provided element is identified as an element with an ID reference. The reference is
   * deleted from the referenced node.
   */
  private deleteIDReference(xElement: XElement, attributeName: string | null, oldReference: string | null): void {
    const del = (text: string, value: string | null): void => {
      if (isNullOrEmpty(value)) {
        value = LookupTables.attributeHasValue(xElement, text).value;
      }
      const text2 = CAEXPathBuilder.aliasFromReference(value, CAEXDocument_CAEXSchema.Unknown);
      if (!isNullOrEmpty(text2)) {
        this.aliasTable.removeFromAliasTable(text2, xElement, value);
      } else {
        const text3 = XmlCAEXSchema.idFromReference(xElement, text, value);
        const cAEXNode = this.idTable.fíndByReference(text3, xElement, text);
        if (cAEXNode !== null) {
          cAEXNode.deleteReference(xElement, text);
          if (text3 === ' ' && cAEXNode.elementReferences === null) {
            this.idTable.remove(text3);
          }
        }
      }
    };
    if (isNullOrEmpty(attributeName)) {
      const array = XmlCAEXSchema.idReferenceAttributes(xElement);
      for (const attributeName2 of array) {
        del(attributeName2, null);
      }
    } else {
      del(attributeName, oldReference);
    }
  }

  /** The path references from the elements below (or including) the object, also those with an alias. */
  pathReferencesByFilter(caexObject: CAEXBasicObject, elementName: string | null, includeSelf: boolean): Enumerable<CAEXNodeReference> {
    return this.classTable
      .pathReferencesByFilter(caexObject, elementName, includeSelf)
      .concat(this.aliasTable.elementsWithAliasReference(caexObject, null, CAEXNode_Identifier.NAME, elementName));
  }

  /** The ID references from the elements below (or including) the object. */
  idReferencesByFilter(caexObject: CAEXBasicObject, elementName: string | null, includeSelf: boolean): Enumerable<CAEXNodeReference> {
    return this.idTable.idReferencesByFilter(caexObject, elementName, includeSelf);
  }

  /**
   * The provided element is identified as an element with a path reference. The reference is
   * deleted from the referenced node.
   */
  private deletePathReference(xElement: XElement, attributeName: string | null, oldReference: string | null): void {
    const del = (text: string, value: string | null): void => {
      if (isNullOrEmpty(value)) {
        value = LookupTables.attributeHasValue(xElement, text).value;
      }
      const text2 = CAEXPathBuilder.aliasFromReference(value, CAEXDocument_CAEXSchema.Unknown);
      if (!isNullOrEmpty(text2)) {
        this.aliasTable.removeFromAliasTable(text2, xElement, value);
      } else {
        const path = ClassTable.getPath(xElement, value);
        // Aml.Engine: the node is searched with the attribute name of the call (empty when all
        // path reference attributes are deleted), not with the attribute of this pass.
        const cAEXNode = this.classTable.fíndByReference(path, xElement, attributeName);
        if (cAEXNode !== null) {
          cAEXNode.deleteReference(xElement, text);
          if (path === ' ' && cAEXNode.elementReferences === null) {
            this.classTable.remove(path);
          }
        }
      }
    };
    if (isNullOrEmpty(attributeName)) {
      const array = XmlCAEXSchema.pathReferenceAttributes(xElement);
      for (const attribute of array) {
        del(attribute, oldReference);
      }
    } else {
      del(attributeName, oldReference);
    }
  }

  /**
   * The objects referencing the class path or a class derived from it, below the root (if not
   * null); with alias references to derived classes of external documents.
   */
  allClassReferencesDeep(classPath: string | null, elementName: string | null, onlyClasses: boolean, root: CAEXBasicObject | null): Enumerable<CAEXBasicObject | null> {
    if (this.classTable.findByPath(classPath) !== null) {
      const enumerable = this.classTable.allClassReferencesDeep(classPath, elementName, onlyClasses);
      if (CAEXWrapper.equals(root, null)) {
        return enumerable;
      }
      return enumerable.where((r) => XmlClassOperation.isDescendant(r!.node, root!.node, true));
    }
    let enumerable2: Enumerable<CAEXBasicObject | null> = this.aliasTable.allReferencesToDerivedExternalClasses(classPath, elementName, onlyClasses).select((r) => r.caexObject);
    for (const item of enumerable2.where((r) => implementsInterface(r, 'IClassWithBaseClassReference')).distinct()) {
      const second = this.classTable.allClassReferencesDeep((item as unknown as CAEXObject).caexPath(), elementName, onlyClasses);
      enumerable2 = enumerable2.concat(second);
    }
    if (CAEXWrapper.equals(root, null)) {
      return enumerable2;
    }
    return enumerable2.where((r) => XmlClassOperation.isDescendant(r!.node, root!.node, true));
  }
}
