// Port of Aml.Engine.Services.Interfaces.IDatabaseService (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { XElement, XNameLike } from '../../../xml/index.js';
import type { IAMLService } from './IAMLService.js';

/** Service giving access to child elements stored in a database. */
export interface IDatabaseService extends IAMLService {
  elements(element: XElement, name: XNameLike, insert?: boolean): Iterable<XElement>;
}

registerInterfaceBases('IDatabaseService', 'IAMLService');
