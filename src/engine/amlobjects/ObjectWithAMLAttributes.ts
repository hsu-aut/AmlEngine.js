// Port of Aml.Engine.AmlObjects.ObjectWithAMLAttributes (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { from, type Enumerable } from '../../system/linq.js';
import { CAEXObject } from '../caex/CAEXObject.js';
import type { AttributeSequence } from '../caex/AttributeSequence.js';
import type { AttributeType } from '../caex/AttributeType.js';
import type { IObjectWithAttributes } from '../caex/IObjectWithAttributes.js';
import type { FrameAttributeType } from './FrameAttributeType.js';
import type { FrameValues } from './FrameValues.js';
import type { RefTypeAttributeType } from './RefTypeAttributeType.js';
import type { RefURIAttributeType } from './RefURIAttributeType.js';

/** A CAEX object with attributes, providing access to the standardized AutomationML attributes. */
export class ObjectWithAMLAttributes extends CAEXObject {
  private readonly _caexBase: IObjectWithAttributes;

  /**
   * Gets the attribute sequence of the wrapped CAEX object. C# reads the property "Attribute" of
   * the run time type by reflection (`null` if there is no such property).
   */
  get attribute(): AttributeSequence {
    const value = (this.caexBase as unknown as { attribute?: unknown }).attribute;
    return (value instanceof T.AttributeSequence ? value : null) as AttributeSequence;
  }

  /** Gets the attributes and all their nested attributes. */
  get attributeAndDescendants(): Enumerable<AttributeType> {
    return from(this.attribute).concat(from(this.attribute).selectMany((a) => a.attributeAndDescendants));
  }

  /** The wrapped CAEX object. */
  get caexBase(): IObjectWithAttributes {
    return this._caexBase;
  }

  /** Gets the Frame attribute, or `null`. */
  get frameAttribute(): FrameAttributeType | null {
    const attributeType = this.attribute.item('Frame');
    if (T.CAEXWrapper.equals(attributeType, null)) {
      return null;
    }
    return new T.FrameAttributeType(attributeType!.node);
  }

  /** Gets the refType attribute, or `null`. */
  get refTypeAttribute(): RefTypeAttributeType | null {
    let attributeType: AttributeType | null;
    if (T.CAEXWrapper.equals((attributeType = this.attribute.item(T.RefTypeAttributeType.REF_TYPE_ATTRIBUTE)), null)) {
      return null;
    }
    return new T.RefTypeAttributeType(attributeType!.node);
  }

  /** Gets the refURI attribute, or `null`. */
  get refURIAttribute(): RefURIAttributeType | null {
    let attributeType: AttributeType | null;
    if (T.CAEXWrapper.equals((attributeType = this.attribute.item('refURI')), null)) {
      return null;
    }
    return new T.RefURIAttributeType(attributeType!.node);
  }

  /**
   * Initializes a new instance for the provided CAEX object with attributes.
   * @param caexObject The CAEX object.
   */
  constructor(caexObject: IObjectWithAttributes) {
    super(caexObject.node);
    this._caexBase = caexObject;
  }

  /**
   * Creates a new Frame attribute (prepended) with the provided values, or sets the values of an
   * existing one.
   */
  new_FrameAttribute(frameValues: FrameValues): FrameAttributeType {
    if (T.CAEXWrapper.equals(this.frameAttribute, null)) {
      return new T.FrameAttributeType(this.attribute.prepend('Frame').node, frameValues);
    }
    this.frameAttribute!.frame = frameValues;
    return this.frameAttribute!;
  }

  /** Creates a new refURI attribute (prepended) with the provided value, or sets the value of an existing one. */
  new_RefUriAttribute(uri: string | null): RefURIAttributeType {
    if (T.CAEXWrapper.equals(this.refURIAttribute, null)) {
      const r = new T.RefURIAttributeType(this.attribute.prepend('refURI').node);
      r.value = uri;
      return r;
    }
    this.refURIAttribute!.value = uri;
    return this.refURIAttribute!;
  }
}

registerInterfaces(ObjectWithAMLAttributes, 'IObjectWithAttributes', 'ICAEXBasicObject', 'ICAEXWrapper', 'IXMLWrapper');

T.ObjectWithAMLAttributes = ObjectWithAMLAttributes;
