// Port of Aml.Engine.Services.CaexIDService (Aml.Engine 4.5.2).

import { T } from '../registry.js';
import { registerInterfaces } from '../interfaces.js';
import { Guid } from '../../system/index.js';
import type { XElement } from '../../xml/index.js';
import type { CAEXObject } from '../caex/CAEXObject.js';
import type { ICaexIDService } from './interfaces/ICaexIDService.js';

/** The default ID service: new IDs are GUIDs in the "D" format. */
export class CaexIDService implements ICaexIDService {
  /**
   * Generates a new ID (C# overloads GenerateNewID(CAEXObject), GenerateNewID(XElement) and
   * GenerateNewID(); the argument is not used by the default service).
   */
  generateNewID(_caexObjectOrElement?: CAEXObject | XElement | null): string {
    return Guid.newGuid().toString('D');
  }
}

T.CaexIDService = CaexIDService;
registerInterfaces(CaexIDService, 'ICaexIDService', 'IAMLService');
