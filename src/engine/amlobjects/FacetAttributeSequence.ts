// Port of Aml.Engine.AmlObjects.FacetAttributeSequence (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { implementsInterface } from '../interfaces.js';
import { from } from '../../system/linq.js';
import { AttributeSequence } from '../caex/AttributeSequence.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import { ObjectWithBaseClass } from '../caex/extensions/ObjectWithBaseClass.js';
import type { AttributeType } from '../caex/AttributeType.js';
import type { CAEXWrapper } from '../caex/CAEXWrapper.js';
import type { NameValueTuple } from '../caex/ICAEXSequence.js';
import type { IObjectWithAttributes } from '../caex/IObjectWithAttributes.js';
import type { SystemUnitFamilyType } from '../caex/SystemUnitFamilyType.js';
import type { XElement } from '../../xml/index.js';

/**
 * The attribute sequence of an AMLFacet: a facet may only contain attributes of its parent. If
 * the owner is not an AMLFacet, the sequence behaves like an AttributeSequence (except for the
 * parameterless Append and Prepend, which always return `null`).
 */
export class FacetAttributeSequence extends AttributeSequence {
  /**
   * Initializes a new instance.
   * @param owner The owner.
   * @param create Function to create an AttributeType.
   * @param getCAEXOwner If set, the CAEXOwner is provided by this function.
   */
  constructor(owner: XElement | null, create: (e: XElement) => AttributeType, getCAEXOwner: (() => CAEXWrapper | null) | null = null) {
    super(owner, create, getCAEXOwner);
  }

  /**
   * `Append()`: appends a new attribute if the owner is not a facet; the result is always `null`.
   * `Append(string name)`: if the owner is a facet, appends an attribute only when the parent has
   * a not yet assigned attribute with this name (in CAEX 3.0 as a mirror of it); otherwise `null`.
   * `Append(params (string, object)[])` is not overridden in C#. Can return `null`.
   */
  override append(): AttributeType;
  override append(name: string): AttributeType;
  override append(...attributeValueTuples: NameValueTuple[]): AttributeType;
  override append(...args: unknown[]): AttributeType | null {
    if (args.length === 0) {
      if (!new T.AMLFacet(this.owner).isFacet) {
        super.append();
      }
      return null;
    }
    if (!(args.length === 1 && (typeof args[0] === 'string' || args[0] === null))) {
      return super.append(...(args as NameValueTuple[]));
    }
    const name = args[0] as string | null;
    const aMLFacet = new T.AMLFacet(this.owner);
    if (!aMLFacet.isFacet) {
      return super.append(name as string);
    }
    const attributeType = from(aMLFacet.notAssignedParentAttributes()).firstOrDefault((a) => a.name === name);
    if (T.CAEXWrapper.equals(attributeType, null)) {
      return null;
    }
    const attributeType2 = super.append();
    attributeType2.name = name;
    if (CAEXBasicObjectExtensions.caexSchema(attributeType2) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      attributeType2.master = attributeType;
    }
    return attributeType2;
  }

  /**
   * Inserts the attribute. If the owner is a facet, only a not yet assigned attribute of the
   * parent is inserted (in CAEX 3.0 as a mirror of it); otherwise the result is `null`.
   */
  override insert(attribute: AttributeType | null, asFirst = true, asIs = false): AttributeType | null {
    const aMLFacet = new T.AMLFacet(this.owner);
    if (!aMLFacet.isFacet) {
      return super.insert(attribute, asFirst, asIs);
    }
    if (aMLFacet.hasAttributeOfParent(attribute!)) {
      return null;
    }
    if (!this.isAttributeOfParent(attribute!)) {
      return null;
    }
    if (!from(aMLFacet.notAssignedParentAttributes()).contains(attribute!)) {
      return null;
    }
    const attributeType = super.insert(attribute, asFirst, asIs);
    if (CAEXBasicObjectExtensions.caexSchema(attribute!) !== T.CAEXDocument.CAEXSchema.CAEX2_15) {
      attributeType!.master = attribute;
    }
    return attributeType;
  }

  /**
   * `Prepend()`: prepends a new attribute if the owner is not a facet; the result is always
   * `null`. The other overloads are not overridden in C#. Can return `null`.
   */
  override prepend(): AttributeType;
  override prepend(name: string): AttributeType;
  override prepend(...attributeValueTuples: NameValueTuple[]): AttributeType;
  override prepend(...args: unknown[]): AttributeType | null {
    if (args.length === 1 && (typeof args[0] === 'string' || args[0] === null)) {
      return super.prepend(args[0] as string);
    }
    if (args.length !== 0) {
      return super.prepend(...(args as NameValueTuple[]));
    }
    if (!new T.AMLFacet(this.owner).isFacet) {
      super.prepend();
    }
    return null;
  }

  private isAttributeOfParent(attribute: AttributeType): boolean {
    const objectWithAttributes = new T.AMLFacet(this.owner).caexParent;
    if (!implementsInterface(objectWithAttributes, 'IObjectWithAttributes')) {
      return false;
    }
    let source: Iterable<AttributeType>;
    if (!(objectWithAttributes instanceof T.SystemUnitFamilyType)) {
      source = (objectWithAttributes as unknown as IObjectWithAttributes).attribute;
    } else {
      source = ObjectWithBaseClass.getInheritedAttributes(objectWithAttributes as SystemUnitFamilyType);
    }
    return from(source).contains(attribute);
  }
}

T.FacetAttributeSequence = FacetAttributeSequence;
