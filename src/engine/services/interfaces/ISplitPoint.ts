// Port of Aml.Engine.Services.Interfaces.ISplitPoint (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { ICAEXWrapper } from '../../caex/ICAEXWrapper.js';
import type { IXMLWrapper } from '../../xml/IXMLWrapper.js';

/** A CAEX object at which a document can be split. */
export interface ISplitPoint extends ICAEXWrapper, IXMLWrapper {}

registerInterfaceBases('ISplitPoint', 'ICAEXWrapper', 'IXMLWrapper');
