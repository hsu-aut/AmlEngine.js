// Port of Aml.Engine.AmlObjects.AMLInternalElementType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { AMLSystemUnitClass } from './AMLSystemUnitClass.js';
import type { XElement } from '../../xml/index.js';

/** An AMLInternalElementType is a SystemUnitClass which can contain AMLPort AML objects. */
export class AMLInternalElementType extends AMLSystemUnitClass {
  /**
   * Initializes a new instance.
   * @param systemUnitClassNode A SystemUnitClass node.
   */
  constructor(systemUnitClassNode: XElement | null) {
    super(systemUnitClassNode, 'RefBaseSystemUnitPath');
  }
}

T.AMLInternalElementType = AMLInternalElementType;
