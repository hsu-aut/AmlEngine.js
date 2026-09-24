// Port of Aml.Engine.CAEX.ICAEXWrapper (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../interfaces.js';
import type { IXMLWrapper } from '../xml/IXMLWrapper.js';
import type { CAEXWrapper } from './CAEXWrapper.js';

/** Implemented by all CAEX object classes; defines accessors to the wrapped XML node. */
export interface ICAEXWrapper extends IXMLWrapper {
  /** Gets the CAEXParent of this CAEX object. */
  readonly caexParent: CAEXWrapper | null;

  /** Gets the first child of this CAEX object with the defined CAEX tag name, or `null`. */
  caexChild(tagName: string): CAEXWrapper | null;

  /** Gets all children of this CAEX object with the defined CAEX tag name. */
  caexChildren(tagName: string): Iterable<CAEXWrapper>;

  /** Removes this object (C# interface default for removeRelations: true). */
  remove(removeRelations?: boolean): void;
}

registerInterfaceBases('ICAEXWrapper', 'IXMLWrapper');
