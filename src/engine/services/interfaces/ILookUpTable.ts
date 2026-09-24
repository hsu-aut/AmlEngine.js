// Port of Aml.Engine.Services.Interfaces.ILookUpTable (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { IAMLService } from './IAMLService.js';

/** Service maintaining ID and path lookup tables of documents. */
export interface ILookUpTable extends IAMLService {
  idTableIsLoaded(document: CAEXDocument): boolean;
  loadIDTable(document: CAEXDocument): void;
  loadPathTable(document: CAEXDocument): void;
  pathTableIsLoaded(document: CAEXDocument): boolean;
  unloadIDTable(document: CAEXDocument): void;
  unloadPathTable(document: CAEXDocument): void;
}

registerInterfaceBases('ILookUpTable', 'IAMLService');
