// Port of Aml.Engine.CAEX.SourceObjectInformationType (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import type { XElement } from '../../xml/index.js';
import { CAEXWrapper_1 } from './CAEXWrapper.js';

/** Wrapper for the CAEX element SourceObjectInformation. */
export class SourceObjectInformationType extends CAEXWrapper_1<string> {
  /** Gets and sets the OriginID. */
  get originID(): string | null {
    return this.getXAttributeValue('OriginID');
  }

  set originID(value: string | null) {
    if (!(this.originID === value)) {
      this.setXAttributeValue('OriginID', value);
      this.raisePropertyChanged('OriginID');
    }
  }

  /** Gets and sets the SourceObjID. */
  get sourceObjID(): string | null {
    return this.getXAttributeValue('SourceObjID');
  }

  set sourceObjID(value: string | null) {
    if (!(this.sourceObjID === value)) {
      this.setXAttributeValue('SourceObjID', value);
      this.raisePropertyChanged('SourceObjID');
    }
  }

  /** @internal The constructor function used by sequences. */
  static get Constructor(): (n: XElement) => SourceObjectInformationType {
    return (n) => new SourceObjectInformationType(n);
  }

  /**
   * Initializes a new instance.
   * @param sourceObjectInformationNode The XML node.
   */
  constructor(sourceObjectInformationNode: XElement | null) {
    super(sourceObjectInformationNode, 'string');
  }
}

T.SourceObjectInformationType = SourceObjectInformationType;
