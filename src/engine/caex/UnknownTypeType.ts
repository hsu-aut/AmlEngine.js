// Port of Aml.Engine.CAEX.UnknownTypeType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import type { XElement } from '../../xml/index.js';
import { XmlCAEXAttributes } from '../xmlext/XmlCAEXAttributes.js';
import { XmlCAEXSchema } from '../xmlext/XmlCAEXSchema.js';
import { CAEXWrapper } from './CAEXWrapper.js';

/** Wrapper for the CAEX constraint UnknownType. */
export class UnknownTypeType extends CAEXWrapper {
  /** @internal The constructor function used by sequences (static field set by the static constructor). */
  static Constructor: (n: XElement) => UnknownTypeType = (n) => new UnknownTypeType(n);

  /** Gets and sets the Requirements. */
  get requirements(): string | null {
    return XmlCAEXAttributes.getStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'Requirements'));
  }

  set requirements(value: string | null) {
    XmlCAEXAttributes.setStringValue(this.node!, XmlCAEXSchema.xName(this.node!, 'Requirements'), value);
  }

  /**
   * Initializes a new instance.
   * @param unknownTypeNode The XML node.
   */
  constructor(unknownTypeNode: XElement | null) {
    super(unknownTypeNode);
  }
}

T.UnknownTypeType = UnknownTypeType;
