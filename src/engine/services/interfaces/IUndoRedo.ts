// Port of Aml.Engine.Services.Interfaces.IUndoRedo (Aml.Engine 4.5.2).

import { registerInterfaceBases } from '../../interfaces.js';
import type { DateTime } from '../../../system/index.js';
import type { CAEXDocument } from '../../caex/CAEXDocument.js';
import type { ICAEXCommand } from '../../caex/commands/ICAEXCommand.js';
import type { IAMLService } from './IAMLService.js';

/** Undo/redo service for document changes. */
export interface IUndoRedo extends IAMLService {
  beginTransaction(document: CAEXDocument | null, name?: string, relatedDocument?: CAEXDocument | null): boolean;
  canRedo(document: CAEXDocument | null): boolean;
  canUndo(document: CAEXDocument | null): boolean;
  clearStacks(document: CAEXDocument | null): void;
  endTransaction(document: CAEXDocument | null): boolean;
  lastModificationDate(document: CAEXDocument | null, undo?: boolean): DateTime;
  pause(document?: CAEXDocument | null): void;
  pushCommand(cmd: ICAEXCommand): void;
  redo(document: CAEXDocument | null): void;
  redoActions(document: CAEXDocument | null): Iterable<string>;
  resume(document?: CAEXDocument | null): void;
  undo(document: CAEXDocument | null): void;
  undoActions(document: CAEXDocument | null): Iterable<string>;
}

registerInterfaceBases('IUndoRedo', 'IAMLService');
