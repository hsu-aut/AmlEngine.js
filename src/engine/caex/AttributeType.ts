// Port of Aml.Engine.CAEX.AttributeType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { implementsInterface, registerInterfaces } from '../interfaces.js';
import { XElement } from '../../xml/index.js';
import { isNullOrEmpty } from '../../system/strings.js';
import { from } from '../../system/linq.js';
import { AttributeTypeType } from './AttributeTypeType.js';
import { AttributeTypeTypeExtensions } from './extensions/AttributeTypeTypeExtensions.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXDocumentExtensions } from './extensions/CAEXDocumentExtensions.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { CollectionExtensions } from './extensions/CollectionExtensions.js';
import { InstanceExtensions } from './extensions/InstanceExtensions.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import type { AttributeFamilyType } from './AttributeFamilyType.js';
import type { CAEXDocument } from './CAEXDocument.js';
import type { CAEXObject } from './CAEXObject.js';
import type { CAEXWrapper } from './CAEXWrapper.js';
import type { ICAEXWrapper } from './ICAEXWrapper.js';
import type { IObjectWithAttributes } from './IObjectWithAttributes.js';

/**
 * This Class is a wrapper for the CAEX element 'Attribute' which defines base structures for
 * attribute definitions. Attributes can be associated to each object which implements the
 * IObjectWithAttributes interface. Since CAEX 3.0 an Attribute element can be instantiated from
 * an AttributeType element (AttributeFamilyType).
 */
export class AttributeType extends AttributeTypeType {
  /**
   * Returns the attribute path, which is equal to the attribute name for any attribute, which
   * is not a nested attribute, or a concatenation of attribute names separated by the attribute
   * path delimiter for nested attributes.
   */
  get attributePath(): string | null {
    return CAEXPathBuilder.caexPath(
      from<CAEXObject>(CollectionExtensions.yield<AttributeType>(this))
        .concat(CAEXBasicObjectExtensions.ancestors(this, false, T.AttributeType))
        .reverse(),
    );
  }

  /** Gets the owner of the Attribute Tree. This is the first ancestor, which is not an AttributeType object. */
  get attributeTreeOwner(): IObjectWithAttributes | null {
    const o = CAEXBasicObjectExtensions.firstAncestor(this, (o: ICAEXWrapper) => !(o instanceof T.AttributeType));
    return implementsInterface(o, 'IObjectWithAttributes') ? (o as unknown as IObjectWithAttributes) : null;
  }

  /**
   * Gets and sets the AttributeType of an Attribute object, defining a new instance to class
   * relation, using the CAEX attribute RefAttributeType.
   */
  get attributeTypeReference(): AttributeFamilyType | null {
    if (!this.isMirror) {
      const c = CAEXDocumentExtensions.findByPath(this.caexDocument, this.refAttributeType);
      return c instanceof T.AttributeFamilyType ? c : null;
    }
    if ((this.master?.refAttributeType ?? null) === null) {
      return null;
    }
    return this.master!.attributeTypeReference;
  }

  set attributeTypeReference(value: AttributeFamilyType | null) {
    this.refAttributeType = value?.getReferencePath(this) ?? null;
  }

  /** Gets a value indicating whether this instance is a master attribute referenced by mirror attributes. */
  get isMaster(): boolean {
    return AttributeTypeTypeExtensions.isMaster(this);
  }

  /** Gets a value indicating whether this instance is a mirror of another Attribute object. */
  get isMirror(): boolean {
    return CAEXPathBuilder.isAttributeReference(CAEXBasicObjectExtensions.caexDocument(this), this.refAttributeType);
  }

  /**
   * Gets the master Attribute object if this is a mirror and the master can be found in this
   * CAEX document (also the IMirror.Master of C#).
   */
  get master(): AttributeType | null {
    if (!this.isMirror) {
      return null;
    }
    if (isNullOrEmpty(this.masterParentID)) {
      return null;
    }
    const objectWithAttributes = CAEXDocumentExtensions.findByID(CAEXBasicObjectExtensions.caexDocument(this), this.masterParentID);
    if (!implementsInterface(objectWithAttributes, 'IObjectWithAttributes')) {
      return null;
    }
    const path = CAEXPathBuilder.attributePathInAttributeReference(this.refAttributeType, CAEXBasicObjectExtensions.caexDocument(this));
    return (objectWithAttributes as unknown as IObjectWithAttributes).attribute.item(path.result);
  }

  set master(value: AttributeType | null) {
    this.refAttributeType = value?.getReferencePath(this) ?? null;
  }

  /**
   * Gets the identifier of the master Attribute if this is a Mirror. The identifier contains the
   * ID of the attribute owner followed by the Attribute path.
   */
  get masterID(): string | null {
    if (!this.isMirror) {
      return null;
    }
    return this.refAttributeType;
  }

  /** Gets the ID of the master attributes parent instance, if this is a mirror Attribute object; otherwise `null`. */
  get masterParentID(): string | null {
    if (!this.isMirror) {
      return null;
    }
    return CAEXPathBuilder.instanceIDInAttributeReference(this.refAttributeType, CAEXBasicObjectExtensions.caexDocument(this)).result;
  }

  /**
   * The constructor function for the AttributeType (C# `AttributeType.Constructor`; the name
   * `constructor` is not available for a static member in JS).
   * @internal
   */
  static get Constructor(): (n: XElement) => AttributeType {
    return (n: XElement) => new AttributeType(n);
  }

  /** @internal */
  get attributeNames(): (string | null)[] {
    return from<AttributeType>(CAEXBasicObjectExtensions.ancestors(this, false, T.AttributeType))
      .concat(CollectionExtensions.yield<AttributeType>(this))
      .select((a) => a.name)
      .toArray();
  }

  /** The instantiated attribute type. */
  get class(): AttributeFamilyType | null {
    return this.attributeTypeReference;
  }

  set class(value: AttributeFamilyType | null) {
    this.attributeTypeReference = value;
  }

  /** @param attributeTypeNode An 'Attribute' XML node. */
  constructor(attributeTypeNode: XElement) {
    super(attributeTypeNode, 'RefAttributeType');
  }

  /** Creates an AttributeType from this Attribute instance (a copy of this instance). */
  createAttributeType(): AttributeFamilyType {
    ServiceLocator.undoRedoService?.pause(CAEXBasicObjectExtensions.caexDocument(this));
    ServiceLocator.uniqueNameService?.suspend();
    const cAEXWrapper: CAEXWrapper = this.copy();
    const result = new T.AttributeFamilyType(new XElement(this.xName('AttributeType'), cAEXWrapper.node!.attributes(), cAEXWrapper.node!.elements()));
    result.refAttributeType = null;
    ServiceLocator.undoRedoService?.resume(CAEXBasicObjectExtensions.caexDocument(this));
    const uniqueNameService = ServiceLocator.uniqueNameService;
    if (uniqueNameService !== null && uniqueNameService !== undefined) {
      uniqueNameService.resume();
      return result;
    }
    return result;
  }

  /** Creates a new mirror element from this AttributeType (also IMirror.CreateMirror of C#). */
  createMirror(): AttributeType {
    const mirror = new AttributeType(this.attribute.createElement(this.owner!)!);
    mirror.master = this;
    mirror.name = this.name;
    return mirror;
  }

  /**
   * Replaces the content of this Attribute object with the specified attribute type. This
   * Attribute object is changed to an instance of the provided Attribute Type.
   */
  recreateAttributeInstance(attributeType: AttributeFamilyType): void {
    const cAEXDocument: CAEXDocument = this.caexDocument!;
    const name = this.name;
    const attributeType2 = attributeType.createClassInstance(cAEXDocument);
    const flag = ServiceLocator.undoRedoService?.beginTransaction(cAEXDocument, 'Recreate attribute instance') ?? false;
    // C# passes the lazy IEnumerables Attributes() and Nodes(), which a redo enumerates again;
    // a JS generator is exhausted after the first use, so re-iterable wrappers are passed.
    const instanceNode = attributeType2.node!;
    T.SetElementContentCmd.setValue(this.node!, [{ [Symbol.iterator]: () => instanceNode.attributes() }, { [Symbol.iterator]: () => instanceNode.nodes() }]);
    this.name = name;
    this.attributeTypeReference = attributeType;
    if (flag) {
      ServiceLocator.undoRedoService?.endTransaction(cAEXDocument);
    }
  }

  /** Updates the Attribute using added attributes of the referenced Attribute Type. */
  updateInstance(): boolean {
    if (T.CAEXWrapper.equals(this.reference, null)) {
      return false;
    }
    InstanceExtensions.updateWithAddedAttributes(this, this.attributeTypeReference);
    return true;
  }
}

registerInterfaces(AttributeType, 'IMirror_1', 'IMirror', 'ICAEXObject', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper', 'IInstance_1', 'IInstance');

T.AttributeType = AttributeType;
