// Port of Aml.Engine.CAEX.BaseElementType<TDataType> (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import type { XElement } from '../../xml/index.js';
import { CAEXWrapper_1, type DataTypeTag } from './CAEXWrapper.js';
import { ChangeMode, changeModeToString, tryParseChangeMode } from './ChangeMode.js';

/**
 * Base class for the CAEX header elements Copyright, Description and Version, which are simple
 * typed elements with a ChangeMode attribute.
 */
export class BaseElementType<TDataType> extends CAEXWrapper_1<TDataType> {
  /** Gets and sets the change mode for the element. */
  get changeMode(): ChangeMode {
    const result = tryParseChangeMode(T.CAEXBasicObject.uppercaseFirst(this.getXAttributeValue('ChangeMode')));
    if (result === null) {
      return ChangeMode.Undefined;
    }
    return result;
  }

  set changeMode(value: ChangeMode) {
    if (this.changeMode !== value) {
      this.setXAttributeValue('ChangeMode', value === ChangeMode.Undefined ? null : changeModeToString(value).toLowerCase());
      this.raisePropertyChanged('ChangeMode');
    }
  }

  /**
   * Initializes a new instance.
   * @param xNode The XML node.
   * @param dataType The run time type argument TDataType (all subclasses in the engine use 'string').
   */
  constructor(xNode: XElement | null, dataType: DataTypeTag = 'string') {
    super(xNode, dataType);
  }
}

T.BaseElementType = BaseElementType;
