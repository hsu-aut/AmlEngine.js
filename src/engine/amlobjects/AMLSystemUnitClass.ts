// Port of Aml.Engine.AmlObjects.AMLSystemUnitClass (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { from, type Enumerable } from '../../system/linq.js';
import type { XElement } from '../../xml/index.js';
import { SystemUnitClassType } from '../caex/SystemUnitClassType.js';
import { CAEXBasicObjectExtensions } from '../caex/extensions/CAEXBasicObjectExtensions.js';
import type { AMLFacet } from './AMLFacet.js';
import type { AMLGroup } from './AMLGroup.js';
import type { AMLPort } from './AMLPort.js';

/** An AMLSystemUnitClass is a SystemUnitClass which can contain AMLPort AML objects. */
export class AMLSystemUnitClass extends SystemUnitClassType {
  /** Gets the collection of AMLFacet objects. */
  get amlFacets(): Enumerable<AMLFacet> {
    return from(this.internalElement)
      .where((p) => p.hasRoleClassReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Facet', true))
      .select((p) => new T.AMLFacet(p.node));
  }

  /** Gets the collection of AMLGroup objects. */
  get amlGroups(): Enumerable<AMLGroup> {
    return from(this.internalElement)
      .where((p) => p.hasRoleClassReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Group', true))
      .select((p) => new T.AMLGroup(p.node));
  }

  /** Gets the collection of AMLPort objects. */
  get amlPorts(): Enumerable<AMLPort> {
    return from(this.internalElement)
      .where((p) => p.hasRoleClassReference('AutomationMLBaseRoleClassLib/AutomationMLBaseRole/Port', true))
      .select((p) => new T.AMLPort(p.node));
  }

  /**
   * Initializes a new instance from a SystemUnitClass node and the name of the attribute that
   * contains the class reference (`AMLSystemUnitClass(XElement, string)`), or from a
   * SystemUnitClass object (`AMLSystemUnitClass(SystemUnitClassType)`).
   */
  constructor(systemUnitClassNode: XElement | null, refName: string);
  constructor(systemUnitClass: SystemUnitClassType);
  constructor(arg0: XElement | SystemUnitClassType | null, refName?: string) {
    if (arg0 instanceof SystemUnitClassType) {
      super(arg0.node, arg0.referenceAttributeName);
    } else {
      super(arg0, refName!);
    }
  }

  /**
   * Adds an AMLFacet object to the AMLSystemUnitClass with the provided name.
   * @param name The name of the new AMLFacet.
   * @returns The added new AMLFacet.
   */
  addFacet(name: string): AMLFacet {
    let result: AMLFacet;
    this.insert((result = T.AMLFacet.create(CAEXBasicObjectExtensions.caexDocument(this)!, name)), false);
    return result;
  }

  /**
   * Adds an AMLGroup object to the AMLSystemUnitClass with the provided name.
   * @param name The name of the new AMLGroup.
   * @returns The added new AMLGroup.
   */
  addGroup(name: string): AMLGroup {
    let result: AMLGroup;
    this.insert((result = T.AMLGroup.create(CAEXBasicObjectExtensions.caexDocument(this)!, name)), false);
    return result;
  }

  /**
   * Adds an AMLPort object to the AMLSystemUnitClass with the provided name.
   * @param name The name of the new AMLPort.
   * @returns The added new AMLPort.
   */
  addPort(name: string): AMLPort {
    let result: AMLPort;
    this.insert((result = T.AMLPort.create(CAEXBasicObjectExtensions.caexDocument(this)!, name)), false);
    return result;
  }
}

T.AMLSystemUnitClass = AMLSystemUnitClass;
