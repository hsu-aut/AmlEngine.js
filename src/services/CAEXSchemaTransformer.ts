// Port of Aml.Engine.Services.CAEXSchemaTransformer (Aml.Engine.Services 4.3.1).
//
// The engine finds the service as in C#: `Register()` puts it into the ServiceLocator under
// 'ISchemaTransform', and ServiceLocator.register subscribes the engine handlers to the two
// events. TransformationStarted lets the source document create the transformed copy
// (`e.targetDocument = sourceDocument.transformToSchema(targetSchema)`), TransformationEnded
// finalizes it. Without these handlers `e.targetDocument` stays null.

import '../engine/index.js';
import { EventSource } from '../system/events.js';
import { registerInterfaces } from '../engine/interfaces.js';
import { CAEXDocument_CAEXSchema } from '../engine/caex/CAEXDocument.js';
import { ServiceLocator } from '../engine/services/ServiceLocator.js';
import { SchemaTransformationEventArgs } from '../engine/services/interfaces/SchemaTransformationEventArgs.js';
import { CAEXSchemaDowngrader } from './transformator/CAEXSchemaDowngrader.js';
import { CAEXSchemaUpgrader } from './transformator/CAEXSchemaUpgrader.js';
import type { CAEXDocument } from '../engine/caex/CAEXDocument.js';
import type { ISchemaTransform } from '../engine/services/interfaces/ISchemaTransform.js';

/**
 * A service for schema transformations of CAEX documents from CAEX 2.15 to 3.0 and back.
 * The backward transformation can lose information.
 */
export class CAEXSchemaTransformer implements ISchemaTransform {
  /** Raised when a transformation has started. */
  readonly transformationStarted = new EventSource<SchemaTransformationEventArgs>();

  /** Raised when a transformation has ended. */
  readonly transformationEnded = new EventSource<SchemaTransformationEventArgs>();

  /** @internal Internal in C#: instances are created by `register()`. */
  constructor() {}

  /** Creates a schema transformer and registers it as ISchemaTransform; returns it. */
  static register(): CAEXSchemaTransformer {
    const cAEXSchemaTransformer = new CAEXSchemaTransformer();
    ServiceLocator.register<ISchemaTransform>(cAEXSchemaTransformer, 'ISchemaTransform');
    return cAEXSchemaTransformer;
  }

  /** Unregisters the ISchemaTransform service. */
  static unRegister(): void {
    ServiceLocator.unRegister('ISchemaTransform');
  }

  /**
   * Transforms the document to the target schema (upward and downward). Returns the document
   * itself if it already has the target schema, the transformed document, or null (no document,
   * or no transformation between the two schemas).
   */
  transformTo(document: CAEXDocument | null, targetSchema: CAEXDocument_CAEXSchema): CAEXDocument | null {
    if (document == null) {
      return null;
    }
    if (document.schema === targetSchema) {
      return document;
    }
    const autoUpdateService = ServiceLocator.autoUpdateService;
    const flag = autoUpdateService != null && autoUpdateService.isAutoUpdateEnabled;
    if (flag) {
      ServiceLocator.autoUpdateService!.isAutoUpdateEnabled = false;
    }
    if (targetSchema !== CAEXDocument_CAEXSchema.CAEX2_15) {
      if (targetSchema === CAEXDocument_CAEXSchema.CAEX3_0 && document.schema === CAEXDocument_CAEXSchema.CAEX2_15) {
        const e = new SchemaTransformationEventArgs(document, CAEXDocument_CAEXSchema.CAEX3_0);
        this.transformationStarted.raise(this, e);
        const cAEXSchemaUpgrader = new CAEXSchemaUpgrader();
        ServiceLocator.undoRedoService?.pause(e.targetDocument);
        cAEXSchemaUpgrader.upgradeToSchema30(e.targetDocument!);
        this.transformationEnded.raise(this, e);
        ServiceLocator.undoRedoService?.resume(e.targetDocument);
        if (flag) {
          ServiceLocator.autoUpdateService!.isAutoUpdateEnabled = true;
        }
        return e.targetDocument;
      }
    } else if (document.schema === CAEXDocument_CAEXSchema.CAEX3_0) {
      const e2 = new SchemaTransformationEventArgs(document, CAEXDocument_CAEXSchema.CAEX2_15);
      this.transformationStarted.raise(this, e2);
      if (e2.targetDocument != null) {
        const cAEXSchemaDowngrader = new CAEXSchemaDowngrader();
        ServiceLocator.undoRedoService?.pause(e2.targetDocument);
        cAEXSchemaDowngrader.downgradeToSchema215(e2.targetDocument);
        this.transformationEnded.raise(this, e2);
        ServiceLocator.undoRedoService?.resume(e2.targetDocument);
      }
      if (flag) {
        ServiceLocator.autoUpdateService!.isAutoUpdateEnabled = true;
      }
      return e2.targetDocument;
    }
    // Aml.Engine: without a transformation between the two schemas (a document or target schema
    // Unknown) the method returns null and leaves the auto update service disabled.
    return null;
  }
}

registerInterfaces(CAEXSchemaTransformer, 'ISchemaTransform', 'IAMLService');
