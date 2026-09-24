// Port of Aml.Engine.CAEX.InternalLinkType (Aml.Engine 4.5.2), including the nested class
// InternalLinkType.LinkedObjects (exported as InternalLinkType_LinkedObjects).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { newException } from './CAEXWrapper.js';
import { from } from '../../system/linq.js';
import { ArgumentNullException, InvalidOperationException } from '../../system/exceptions.js';
import { isNullOrEmpty } from '../../system/strings.js';
import type { XElement } from '../../xml/index.js';
import { CAEXObject } from './CAEXObject.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXElementFactory } from './extensions/CAEXElementFactory.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { XmlCAEXAttributes } from '../xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import type { ExternalInterfaceType } from './ExternalInterfaceType.js';
import type { SystemUnitClassType } from './SystemUnitClassType.js';

/** `x as SystemUnitClassType`. */
function asSystemUnitClass(x: unknown): SystemUnitClassType | null {
  return x instanceof T.SystemUnitClassType ? (x as SystemUnitClassType) : null;
}

/** The objects related by an InternalLink (interfaces and the SystemUnitClasses owning them). */
export class InternalLinkType_LinkedObjects {
  private _aInterface: ExternalInterfaceType | null = null;

  private _bInterface: ExternalInterfaceType | null = null;

  /** The interface on side A. */
  get aInterface(): ExternalInterfaceType | null {
    return this._aInterface ?? this.link!.aInterface;
  }

  /** Internal setter in C#. */
  set aInterface(value: ExternalInterfaceType | null) {
    this._aInterface = value;
  }

  /** The SystemUnitClass owning the interface on side A. */
  get aSystemUnitClass(): SystemUnitClassType | null {
    if (T.CAEXWrapper.equals(this.aInterface, null)) {
      return this.link!.aSystemUnitClass;
    }
    return asSystemUnitClass(this.aInterface?.associatedObject ?? null);
  }

  /** The interface on side B. */
  get bInterface(): ExternalInterfaceType | null {
    return this._bInterface ?? this.link!.bInterface;
  }

  /** Internal setter in C#. */
  set bInterface(value: ExternalInterfaceType | null) {
    this._bInterface = value;
  }

  /** The SystemUnitClass owning the interface on side B. */
  get bSystemUnitClass(): SystemUnitClassType | null {
    if (T.CAEXWrapper.equals(this.bInterface, null)) {
      return this.link!.bSystemUnitClass;
    }
    return asSystemUnitClass(this.bInterface?.associatedObject ?? null);
  }

  /** The InternalLink (internal in C#). */
  link: InternalLinkType | null = null;
}

/** Wrapper for the CAEX element 'InternalLink'. */
export class InternalLinkType extends CAEXObject {
  /** Nested class `InternalLinkType.LinkedObjects`. */
  static readonly LinkedObjects = InternalLinkType_LinkedObjects;

  /** The separator in CAEX 2.15 InternalLink partner references. */
  static readonly LINK_SEPARATOR: string = ':';

  private _linkedObjects: InternalLinkType_LinkedObjects | null = null;

  /** Gets and sets the ExternalInterface on side A. */
  get aInterface(): ExternalInterfaceType | null {
    return (this.relatedObjects.aInterface = this.interfaceFromAttributeValue(this.refPartnerSideA));
  }

  set aInterface(value: ExternalInterfaceType | null) {
    this.refPartnerSideA = this.pathFromInterface(value);
  }

  /** Gets the SystemUnitClass owning the ExternalInterface on side A. */
  get aSystemUnitClass(): SystemUnitClassType | null {
    return asSystemUnitClass(this.aInterface?.associatedObject ?? null);
  }

  /** Gets and sets the ExternalInterface on side B. */
  get bInterface(): ExternalInterfaceType | null {
    return (this.relatedObjects.bInterface = this.interfaceFromAttributeValue(this.refPartnerSideB));
  }

  set bInterface(value: ExternalInterfaceType | null) {
    this.refPartnerSideB = this.pathFromInterface(value);
  }

  /** Gets the SystemUnitClass owning the ExternalInterface on side B. */
  get bSystemUnitClass(): SystemUnitClassType | null {
    return asSystemUnitClass(this.bInterface?.associatedObject ?? null);
  }

  /** Determines whether both interfaces and both owning SystemUnitClasses can be resolved. */
  get isDefined(): boolean {
    if (
      !T.CAEXWrapper.equals(this.aInterface, null) &&
      !T.CAEXWrapper.equals(this.bInterface, null) &&
      !T.CAEXWrapper.equals(this.aSystemUnitClass, null)
    ) {
      return !T.CAEXWrapper.equals(this.bSystemUnitClass, null);
    }
    return false;
  }

  /** Gets and sets the RefPartnerSideA attribute. */
  get refPartnerSideA(): string | null {
    return this.getXAttributeValue('RefPartnerSideA');
  }

  set refPartnerSideA(value: string | null) {
    if (!(this.refPartnerSideA === value)) {
      this.setXAttributeValue('RefPartnerSideA', value);
      this.relatedObjects.aInterface = null;
      this.raisePropertyChanged('RefPartnerSideA');
    }
  }

  /** Gets and sets the RefPartnerSideB attribute. */
  get refPartnerSideB(): string | null {
    return this.getXAttributeValue('RefPartnerSideB');
  }

  set refPartnerSideB(value: string | null) {
    if (!(this.refPartnerSideB === value)) {
      this.setXAttributeValue('RefPartnerSideB', value);
      this.relatedObjects.bInterface = null;
      this.raisePropertyChanged('RefPartnerSideB');
    }
  }

  /** Gets the related objects (cached interfaces) of this link. */
  get relatedObjects(): InternalLinkType_LinkedObjects {
    let linkedObjects = this._linkedObjects;
    if (linkedObjects == null) {
      const obj = new InternalLinkType_LinkedObjects();
      obj.link = this;
      this._linkedObjects = obj;
      linkedObjects = obj;
    }
    return linkedObjects;
  }

  /** The constructor function for the InternalLinkType. */
  static get Constructor(): (n: XElement | null) => InternalLinkType {
    return (n) => new InternalLinkType(n);
  }

  /**
   * Initializes a new instance.
   * @param nodeElement An 'InternalLink' XML node.
   */
  constructor(nodeElement: XElement | null) {
    super(nodeElement);
  }

  /**
   * Creates a new InternalLink between the two interfaces and inserts it into the lowest common
   * parent of their owning SystemUnitClasses.
   */
  static new_InternalLink(aInterface: ExternalInterfaceType | null, bInterface: ExternalInterfaceType | null, name: string | null): InternalLinkType {
    if (T.CAEXWrapper.equals(aInterface, null)) {
      throw new ArgumentNullException('aInterface');
    }
    if (T.CAEXWrapper.equals(bInterface, null)) {
      throw new ArgumentNullException('bInterface');
    }
    if (T.CAEXWrapper.equals(aInterface, bInterface)) {
      throw new InvalidOperationException('It is not allowed to link an ExternalInterface to itself');
    }
    const systemUnitClassType = asSystemUnitClass(aInterface!.associatedObject);
    const systemUnitClassType2 = asSystemUnitClass(bInterface!.associatedObject);
    if (T.CAEXWrapper.equals(systemUnitClassType, null) || T.CAEXWrapper.equals(systemUnitClassType2, null)) {
      throw newException('ExternalInterface not assigned to SystemUnitClass');
    }
    const systemUnitClassType3 = systemUnitClassType!.lowestCommonParent(systemUnitClassType2) ?? systemUnitClassType!;
    ServiceLocator.undoRedoService?.pause(CAEXBasicObjectExtensions.caexDocument(systemUnitClassType3));
    const internalLinkType = CAEXElementFactory.create(CAEXBasicObjectExtensions.caexDocument(systemUnitClassType3)!, T.InternalLinkType)!;
    internalLinkType.aInterface = aInterface;
    internalLinkType.bInterface = bInterface;
    internalLinkType.name = name;
    ServiceLocator.undoRedoService?.resume(CAEXBasicObjectExtensions.caexDocument(systemUnitClassType3));
    systemUnitClassType3.internalLink.insert(internalLinkType, false);
    return internalLinkType;
  }

  /** Inserts the provided InternalLink as a new sibling after this InternalLink. */
  insertAfter(caexObject: InternalLinkType | null): void {
    if (T.CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw newException('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, true);
  }

  /** Inserts the provided InternalLink as a new sibling before this InternalLink. */
  insertBefore(caexObject: InternalLinkType | null): void {
    if (T.CAEXWrapper.equals(caexObject, null)) {
      throw new ArgumentNullException('caexObject');
    }
    if (this.node!.name !== caexObject!.node!.name) {
      throw newException('The provided object is not allowed to be a sibling of this instance.');
    }
    T.AddCmd.addSibling(this.node!, caexObject!.node!, false);
  }

  /** Resolves the ExternalInterface referenced by an InternalLink partner attribute value. */
  interfaceFromAttributeValue(internalLinkAttributeValue: string | null): ExternalInterfaceType | null {
    if (this.document == null) {
      return null;
    }
    if (isNullOrEmpty(internalLinkAttributeValue)) {
      return null;
    }
    if (CAEXBasicObjectExtensions.caexDocument(this) == null) {
      return null;
    }
    if (
      CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15 &&
      !CAEXPathBuilder.isInterfaceReference(internalLinkAttributeValue)
    ) {
      const found = ServiceLocator.queryService.findByID(CAEXBasicObjectExtensions.caexDocument(this), internalLinkAttributeValue);
      return found instanceof T.ExternalInterfaceType ? found : null;
    }
    const pathParts = CAEXPathBuilder.pathNameArray(internalLinkAttributeValue, T.CAEXDocument.CAEXSchema.CAEX2_15);
    if (pathParts.length !== 2) {
      return null;
    }
    const cAEXObject = ServiceLocator.queryService.findByID(CAEXBasicObjectExtensions.caexDocument(this), pathParts[0]);
    if (T.CAEXWrapper.equals(cAEXObject, null)) {
      return null;
    }
    const owner = cAEXObject!.node;
    const xElement =
      owner == null
        ? null
        : from(owner.elements(XmlCAEXSchema.xName(this.node!, 'ExternalInterface'))).firstOrDefault(
            (n) => XmlCAEXAttributes.caexNameOfElement(n) === pathParts[1],
          );
    if (xElement == null) {
      return null;
    }
    return new T.ExternalInterfaceType(xElement);
  }

  private pathFromInterface(externalInterface: ExternalInterfaceType | null): string | null {
    if (!T.CAEXWrapper.equals(externalInterface, null) && externalInterface!.node != null) {
      if (CAEXBasicObjectExtensions.caexSchema(this) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
        return externalInterface!.id;
      }
      return CAEXPathBuilder.internalLinkReferencePath(asSystemUnitClass(externalInterface!.associatedObject)!, externalInterface!);
    }
    return '';
  }
}

registerInterfaces(InternalLinkType, 'IMultipleOccurrences', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.InternalLinkType = InternalLinkType;
T.InternalLinkType_LinkedObjects = InternalLinkType_LinkedObjects;
