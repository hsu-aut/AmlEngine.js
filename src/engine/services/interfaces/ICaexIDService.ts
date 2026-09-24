// Port of Aml.Engine.Services.Interfaces.ICaexIDService (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { XElement } from '../../../xml/index.js';
import type { CAEXObject } from '../../caex/CAEXObject.js';
import type { IAMLService } from './IAMLService.js';

/** Service generating IDs for CAEX objects. */
export interface ICaexIDService extends IAMLService {
  /** C# overloads GenerateNewID(CAEXObject), GenerateNewID(XElement) and GenerateNewID(). */
  generateNewID(caexObjectOrElement?: CAEXObject | XElement | null): string;
}

registerInterfaceBases('ICaexIDService', 'IAMLService');
