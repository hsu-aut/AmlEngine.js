// Port of Aml.Engine.CAEX.RefSemanticType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import type { XElement } from '../../xml/index.js';
import { CAEXBasicObject } from './CAEXBasicObject.js';

/** This class is a CAEXWrapper for the CAEX element 'RefSemantic' used in an AttributeType. */
export class RefSemanticType extends CAEXBasicObject {
  /** Gets and sets the Attribute 'CorrespondingAttributePath' of the RefSemantic object. */
  get correspondingAttributePath(): string | null {
    return this.getXAttributeValue('CorrespondingAttributePath');
  }

  set correspondingAttributePath(value: string | null) {
    if (!(this.correspondingAttributePath === value)) {
      this.setXAttributeValue('CorrespondingAttributePath', value);
      this.raisePropertyChanged('CorrespondingAttributePath');
    }
  }

  /**
   * The constructor function (C# `RefSemanticType.Constructor`; the name `constructor` is not
   * available for a static member in JS).
   * @internal
   */
  static get Constructor(): (n: XElement) => RefSemanticType {
    return (n: XElement) => new RefSemanticType(n);
  }

  /** @param refSemanticNode A 'RefSemantic' XML node. */
  constructor(refSemanticNode: XElement) {
    super(refSemanticNode);
  }
}

T.RefSemanticType = RefSemanticType;
