// Port of Aml.Engine.Services.Interfaces.ISchemaTransform (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { EventSource } from '../../../system/index.js';
import type { CAEXDocument, CAEXDocument_CAEXSchema } from '../../caex/CAEXDocument.js';
import type { IAMLService } from './IAMLService.js';
import type { SchemaTransformationEventArgs } from './SchemaTransformationEventArgs.js';

/** Service transforming documents between CAEX schema versions. */
export interface ISchemaTransform extends IAMLService {
  readonly transformationEnded: EventSource<SchemaTransformationEventArgs>;
  readonly transformationStarted: EventSource<SchemaTransformationEventArgs>;
  transformTo(document: CAEXDocument, targetSchema: CAEXDocument_CAEXSchema): CAEXDocument | null;
}

registerInterfaceBases('ISchemaTransform', 'IAMLService');
