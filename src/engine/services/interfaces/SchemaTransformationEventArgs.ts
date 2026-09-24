// Port of Aml.Engine.Services.Interfaces.SchemaTransformationEventArgs (Aml.Engine 4.5.2).

import { T } from '../../registry.js';
import type { CAEXDocument, CAEXDocument_CAEXSchema } from '../../caex/CAEXDocument.js';

/** Event arguments of a schema transformation. */
export class SchemaTransformationEventArgs {
  constructor(sourceDocument: CAEXDocument | null, targetSchema: CAEXDocument_CAEXSchema) {
    this.sourceDocument = sourceDocument;
    this.targetSchema = targetSchema;
  }

  /** The document to transform. */
  readonly sourceDocument: CAEXDocument | null;

  /** The transformed document. */
  targetDocument: CAEXDocument | null = null;

  /** The target schema of the transformation. */
  readonly targetSchema: CAEXDocument_CAEXSchema;
}

T.SchemaTransformationEventArgs = SchemaTransformationEventArgs;
