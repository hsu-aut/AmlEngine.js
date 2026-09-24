// Port of Aml.Engine.CAEX.CAEXObject (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces, implementsInterface } from '../interfaces.js';
import { from } from '../../system/linq.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { XElement } from '../../xml/index.js';
import { XmlCAEXAttributes } from '../xmlext/XmlCAEXAttributes.js';
import { XmlOperation } from '../xmlext/XmlOperation.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { QueryResult } from '../services/QueryResult.js';
import { ClassReferenceWithAlias } from '../amlobjects/ClassReferenceWithAlias.js';
import { CAEXSignatureHeader } from '../amlobjects/CAEXSignatureHeader.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './extensions/CAEXDocumentExtensions.js';
import { CAEXBasicObject } from './CAEXBasicObject.js';
import { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXObject } from './ICAEXObject.js';
import type { ICAEXReference } from '../services/interfaces/ICAEXReference.js';

/**
 * The class CAEXObject is derived from CAEXBasicObject, augmented by the CAEX Attributes
 * Name (required) and ID (optional).
 */
export class CAEXObject extends CAEXBasicObject implements ICAEXObject {
  /** Specifies the format used for GUIDs. Format "D" is NOT adding {} around the GUID. */
  static readonly GUID_FORMAT = 'D';

  /** Gets a new unique identifier. */
  static get newGUID(): string {
    return ServiceLocator.idService.generateNewID();
  }

  /**
   * Gets and sets a unique identifier of the CAEX object (optional in CAEX). AutomationML
   * requires IDs for some elements; these are set automatically when such elements are created.
   */
  get id(): string | null {
    return this.getXAttributeValue('ID');
  }

  set id(value: string | null) {
    if (!(this.id === value)) {
      this.setXAttributeValue('ID', value);
      this.raisePropertyChanged('ID');
    }
  }

  /** Gets and sets the name of the CAEX object (required in CAEX). */
  get name(): string | null {
    return this.getXAttributeValue('Name');
  }

  set name(value: string | null) {
    if (!(this.name === value)) {
      this.setXAttributeValue('Name', value);
      this.raisePropertyChanged('Name');
    }
  }

  /**
   * Initializes a new instance.
   * @param xmlNode Any CAEX object XML node.
   */
  constructor(xmlNode: XElement | null) {
    super(xmlNode);
  }

  /** @internal */
  getReferencePath(derivedClass: CAEXBasicObject): string | null {
    let alias: string | null = null;
    if (derivedClass.caexDocument != null) {
      const r = ServiceLocator.externalReferenceResolverService?.isExternal(derivedClass.caexDocument, this.node!);
      if (r !== undefined && r !== null) {
        alias = r.alias;
      }
    }
    return ClassReferenceWithAlias.classReference(this.caexPath() as string, alias);
  }

  /**
   * Assigns a new unique identifier as the new ID of this CAEX object.
   * @param updateAllIdReferences If `true`, all references to the old ID are changed to the new ID.
   */
  assignNewGuidAsID(updateAllIdReferences = false): void {
    const text = ServiceLocator.idService.generateNewID(this);
    if (!isNullOrEmpty(this.id) && updateAllIdReferences) {
      for (const item of QueryResult.elementsWithIDReference(this.caexDocument!, this.id) as Iterable<ICAEXReference>) {
        const id = this.id!;
        item.setValue(item.referenceAttributeValue!.split(id).join(text));
      }
    }
    this.id = text;
  }

  /**
   * Gets the CAEX path for this object, according to the CAEX version of the document (built by
   * the CAEXPathBuilder).
   */
  caexPath(): string | null {
    const node = this.node;
    return node !== null ? XmlCAEXAttributes.caexPath(node) : null;
  }

  /**
   * Creates a copy of this CAEX object, containing all child elements. The copy gets new unique
   * IDs and updated references if `assignNewIDs` is `true` (default); nested classes are included
   * if `includeSubClasses` is `true`. The copy is not inserted into the document.
   */
  override copy(deepCopy = true, assignNewIDs = true, includeSubClasses = false): CAEXWrapper {
    if (!deepCopy) {
      const cAEXWrapper = super.copy(false, assignNewIDs);
      if (!assignNewIDs || isNullOrEmpty(cAEXWrapper.getXAttributeValue('ID'))) {
        return cAEXWrapper;
      }
      cAEXWrapper.setXAttributeValue('ID', ServiceLocator.idService.generateNewID());
      cAEXWrapper.setXAttributeValue('Name', this.name);
      if (cAEXWrapper instanceof CAEXObject) {
        CAEXSignatureHeader.deleteSignature(cAEXWrapper);
      }
      return cAEXWrapper;
    }
    if (this.caexDocument != null) {
      ServiceLocator.undoRedoService?.pause(this.caexDocument);
    }
    T.CaexCommand.isSilent = true;
    let xElement2: XElement;
    const node = this.node!;
    if (!includeSubClasses) {
      let xElement: XElement;
      switch (this.tagName) {
        case 'SystemUnitClass':
        case 'RoleClass':
        case 'InterfaceClass':
        case 'AttributeType':
          xElement = new XElement(
            node.name,
            node.attributes(),
            from<XElement>({ [Symbol.iterator]: () => node.elements() }).where((el) => el.name !== node.name),
          );
          break;
        default:
          xElement = new XElement(node);
          break;
      }
      xElement2 = xElement;
    } else {
      xElement2 = new XElement(node);
    }
    const xElement3 = xElement2;
    xElement3.attribute('Name')!.value = this.name as string;
    if (assignNewIDs) {
      XmlOperation.makeUnique(xElement3);
    }
    if (this.caexDocument != null) {
      ServiceLocator.undoRedoService?.resume(this.caexDocument);
    }
    T.CaexCommand.isSilent = false;
    const cAEXWrapper2 = XmlOperation.createCAEXWrapper(xElement3)!;
    if (implementsInterface(cAEXWrapper2, 'IDigitalSigned')) {
      CAEXSignatureHeader.deleteSignature(cAEXWrapper2 as CAEXObject);
    }
    return cAEXWrapper2;
  }

  /** Returns the value of the 'Name' attribute as the string representation of the object. */
  override toString(): string {
    return this.name as string;
  }

  /** @internal */
  changeReferences(originalObject: CAEXBasicObject): void {
    for (const item of ServiceLocator.queryService.allElementsWithCAEXPathReference(this)) {
      const array = CAEXPathBuilder.pathNameArray(item.key, CAEXBasicObjectExtensions.caexSchema(originalObject));
      const cAEXObject = CAEXDocumentExtensions.findByPath(originalObject.caexDocument!, item.key);
      for (const item2 of item as Iterable<ICAEXReference>) {
        let cAEXObject2: CAEXObject | null = cAEXObject;
        for (let num = array.length - 1; num >= 0; num--) {
          if (!((cAEXObject2?.name ?? null) !== array[num])) {
            if (CAEXWrapper.equals(cAEXObject2, originalObject)) {
              const array2 = array.slice();
              array2[num] = this.name!;
              item2.setValue(CAEXPathBuilder.caexPath(array2, CAEXBasicObjectExtensions.caexSchema(originalObject)));
              break;
            }
            const parent = cAEXObject2?.caexParent ?? null;
            cAEXObject2 = parent instanceof CAEXObject ? parent : null;
          }
        }
      }
    }
  }

  /** @internal */
  override property(propertyName: string): unknown {
    if (!(propertyName === 'ID')) {
      if (propertyName === 'Name') {
        return this.name;
      }
      return super.property(propertyName);
    }
    return this.id;
  }
}

registerInterfaces(CAEXObject, 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.CAEXObject = CAEXObject;
