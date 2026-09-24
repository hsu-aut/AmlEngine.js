// Port of Aml.Engine.AmlObjects.RefTypeAttributeType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { AttributeType } from '../caex/AttributeType.js';
import { CAEXElementFactory } from '../caex/extensions/CAEXElementFactory.js';
import type { CAEXDocument } from '../caex/CAEXDocument.js';
import type { XElement } from '../../xml/index.js';

/** The refType attribute is an Attribute of a COLLADAInterface with the standardized name 'refType'. */
export class RefTypeAttributeType extends AttributeType {
  /** The ref type attribute name. */
  static readonly REF_TYPE_ATTRIBUTE: string = 'refType';

  /** The explicit ref type. */
  private static readonly EXPLICIT = 'explicit';

  /** The implicit ref type. */
  private static readonly IMPLICIT = 'implicit';

  /** Gets a value indicating whether this instance is a refType attribute. */
  get isRefTypeAttribute(): boolean {
    return this.name === RefTypeAttributeType.REF_TYPE_ATTRIBUTE;
  }

  /**
   * Initializes a new instance.
   * @param init The attribute node to wrap.
   */
  constructor(init: XElement | null) {
    super(init!);
  }

  /**
   * Creates a new refType attribute using the specified document.
   * @param doc The document.
   */
  static create(doc: CAEXDocument): RefTypeAttributeType {
    const attributeType = CAEXElementFactory.create(doc, T.AttributeType)!;
    attributeType.name = RefTypeAttributeType.REF_TYPE_ATTRIBUTE;
    return new RefTypeAttributeType(attributeType.node);
  }

  /** Determines whether this is an 'explicit' refType. */
  isExplicit(): boolean {
    return this.value === RefTypeAttributeType.EXPLICIT;
  }

  /** Determines whether this is an 'implicit' refType. */
  isImplicit(): boolean {
    return this.value === RefTypeAttributeType.IMPLICIT;
  }
}

T.RefTypeAttributeType = RefTypeAttributeType;
