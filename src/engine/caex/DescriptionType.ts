// Port of Aml.Engine.CAEX.DescriptionType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import type { XElement } from '../../xml/index.js';
import { BaseElementType } from './BaseElementType.js';

/** Wrapper for the CAEX Description element. */
export class DescriptionType extends BaseElementType<string> {
  /**
   * Initializes a new instance.
   * @param xmlNode The XML node.
   */
  constructor(xmlNode: XElement | null) {
    super(xmlNode, 'string');
  }
}

T.DescriptionType = DescriptionType;
