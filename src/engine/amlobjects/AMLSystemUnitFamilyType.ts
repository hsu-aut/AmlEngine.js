// Port of Aml.Engine.AmlObjects.AMLSystemUnitFamilyType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { AMLSystemUnitClass } from './AMLSystemUnitClass.js';
import type { XElement } from '../../xml/index.js';

/** An AMLSystemUnitFamilyType is a SystemUnitClass which can contain AMLPort AML objects. */
export class AMLSystemUnitFamilyType extends AMLSystemUnitClass {
  /**
   * Initializes a new instance.
   * @param systemUnitClassNode A SystemUnitClass node.
   */
  constructor(systemUnitClassNode: XElement | null) {
    super(systemUnitClassNode, 'RefBaseClassPath');
  }
}

T.AMLSystemUnitFamilyType = AMLSystemUnitFamilyType;
