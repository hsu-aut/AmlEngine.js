// Port of Aml.Engine.Services.Interfaces.IAMLEditionTransform (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { AMLEditionEnum } from '../model/AMLEditionEnum.js';
import type { IAMLLibraryService } from './IAMLLibraryService.js';
import type { IAMLService } from './IAMLService.js';

/** Service transforming a document to another AutomationML edition. */
export interface IAMLEditionTransform extends IAMLService {
  /** Transforms the document to the specified edition, logging through `logger`. */
  transformToEdition(
    libService: IAMLLibraryService,
    document: CAEXDocument,
    edition: AMLEditionEnum,
    logger: ((transform: IAMLEditionTransform, message: string) => void) | null,
  ): CAEXDocument | null;
  /** Checks whether a logged message is an error message. */
  isError(message: string): boolean;
}

registerInterfaceBases('IAMLEditionTransform', 'IAMLService');
