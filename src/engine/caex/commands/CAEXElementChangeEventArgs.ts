// Port of Aml.Engine.CAEX.Commands.CAEXElementChangeEventArgs.

import type { XAttribute, XElement } from '../../../xml/index.js';
import type { CAEXDocument } from '../CAEXDocument.js';
import { EventArgs } from '../../../system/index.js';
import { T } from '../../registry.js';
import { CAEXElementChangeMode } from './CAEXElementChangeMode.js';

/** Event arguments for change events of CAEX elements. */
export class CAEXElementChangeEventArgs extends EventArgs {
  private _caexAttribute: XAttribute | null = null;
  private _caexAttributeName: string | null = null;
  private readonly _caexDocument: CAEXDocument | null;
  private readonly _caexElement: XElement | null;
  private _caexParent: XElement | null;
  private readonly _changeMode: CAEXElementChangeMode;
  private _newValue: unknown = null;
  private _oldValue: unknown = null;

  /** The changed attribute, if the change is an attribute change. */
  get caexAttribute(): XAttribute | null {
    return this._caexAttribute;
  }

  /** The name of the changed attribute. */
  get caexAttributeName(): string | null {
    return this._caexAttributeName;
  }

  /** The CAEX document containing the changed element. */
  get caexDocument(): CAEXDocument | null {
    return this._caexDocument;
  }

  /** The changed CAEX element. */
  get caexElement(): XElement | null {
    return this._caexElement;
  }

  /** The parent of the changed CAEX element. */
  get caexParent(): XElement | null {
    return this._caexParent;
  }

  /** The change mode. */
  get changeMode(): CAEXElementChangeMode {
    return this._changeMode;
  }

  /** The new value. */
  get newValue(): unknown {
    return this._newValue;
  }

  /** The old value. */
  get oldValue(): unknown {
    return this._oldValue;
  }

  /**
   * (caexElement, caexParent, document, changeMode) or
   * (caexElement, caexParent, document, attribute, attributeName, oldValue, newValue, changeMode).
   */
  constructor(caexElement: XElement | null, caexParent: XElement | null, document: CAEXDocument | null, changeMode: CAEXElementChangeMode);
  constructor(
    caexElement: XElement | null,
    caexParent: XElement | null,
    document: CAEXDocument | null,
    attribute: XAttribute | null,
    attributeName: string | null,
    oldValue: unknown,
    newValue: unknown,
    changeMode: CAEXElementChangeMode,
  );
  constructor(caexElement: XElement | null, caexParent: XElement | null, document: CAEXDocument | null, ...rest: unknown[]) {
    super();
    if (rest.length <= 1) {
      this._caexDocument = document;
      this._caexElement = caexElement;
      this._caexParent = caexParent;
      this._changeMode = (rest[0] as CAEXElementChangeMode | undefined) ?? CAEXElementChangeMode.None;
      return;
    }
    // : this(caexElement, caexParent, document, changeMode)
    this._caexDocument = document;
    this._caexElement = caexElement;
    this._caexParent = caexParent;
    this._changeMode = rest[4] as CAEXElementChangeMode;
    this._caexAttribute = (rest[0] as XAttribute | null | undefined) ?? null;
    this._oldValue = rest[2] ?? null;
    this._newValue = rest[3] ?? null;
    this._caexParent = caexParent;
    this._caexAttributeName = (rest[1] as string | null | undefined) ?? null;
  }
}

T.CAEXElementChangeEventArgs = CAEXElementChangeEventArgs;
