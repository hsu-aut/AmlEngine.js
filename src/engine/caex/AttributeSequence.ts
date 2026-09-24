// Port of Aml.Engine.CAEX.AttributeSequence (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from } from '../../system/linq.js';
import { XAttribute, XElement } from '../../xml/index.js';
import { ServiceLocator } from '../services/ServiceLocator.js';
import { CAEXPathBuilder } from './extensions/CAEXPathBuilder.js';
import { CAEXBasicObjectExtensions } from './extensions/CAEXBasicObjectExtensions.js';
import { CAEXSequenceOfCAEXObjectsWithReference } from './CAEXSequenceOfCAEXObjectsWithReference.js';
import type { AttributeType } from './AttributeType.js';
import type { CAEXWrapper } from './CAEXWrapper.js';

/** The sequence of Attribute elements of a CAEX object. */
export class AttributeSequence extends CAEXSequenceOfCAEXObjectsWithReference<AttributeType> {
  /**
   * Initializes a new instance.
   * @param owner The owner.
   * @param create The constructor function.
   * @param getCAEXOwner If set, the caexOwner is provided by this function.
   */
  constructor(owner: XElement | null, create: (e: XElement) => AttributeType, getCAEXOwner: (() => CAEXWrapper | null) | null = null) {
    super(owner, 'Attribute', create, getCAEXOwner);
  }

  /** Gets the attribute at the attribute path. @deprecated Use an Indexer. */
  getCAEXAttribute(attributePath: string): AttributeType | null {
    return this.getCAEXAttributeByPartNames(
      ...from<string>(CAEXPathBuilder.pathPartObjectNames(attributePath, CAEXBasicObjectExtensions.caexSchema(this.caexOwner))).toArray(),
    );
  }

  /** @internal */
  override createCaexWrapper(node: XElement | null): AttributeType {
    return new T.AttributeType(node as XElement);
  }

  /** @internal */
  override createElement(owner: XElement | null): XElement | null {
    return new XElement(this.elementName, new XAttribute('Name', ServiceLocator.uniqueNameService?.uniqueCAEXName(owner!, this.elementName.localName) ?? ''));
  }

  /** @internal `params string[] partNames` (also accepts one array). */
  getCAEXAttributeByPartNames(...partNames: (string | readonly string[])[]): AttributeType | null {
    const names = (partNames.length === 1 && Array.isArray(partNames[0]) ? partNames[0] : partNames) as readonly string[];
    const attributeType = this.item(names[0]!);
    if (names.length <= 1) {
      return attributeType;
    }
    return attributeType?.attribute.getCAEXAttributeByPartNames(...names.slice(1)) ?? null;
  }
}

T.AttributeSequence = AttributeSequence;
