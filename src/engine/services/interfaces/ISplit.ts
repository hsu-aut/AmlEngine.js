// Port of Aml.Engine.Services.Interfaces.ISplit (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { IAMLService } from './IAMLService.js';
import type { ISplitPoint } from './ISplitPoint.js';

/** Service splitting documents at split points. */
export interface ISplit extends IAMLService {
  removeSplitPoint(caexObject: ISplitPoint): void;
  setSplitPoint(caexObject: ISplitPoint): void;
  /** C# overloads Split(document, alias, filePath) and Split(document, splitPoint, alias, filePath). */
  split(document: CAEXDocument, aliasOrSplitPoint: string | ISplitPoint, aliasOrFilePath: string, filePath?: string): CAEXDocument | null;
  splitPoints(document: CAEXDocument): Iterable<ISplitPoint>;
}

registerInterfaceBases('ISplit', 'IAMLService');
